/**
 * P4.1 `orb-keychain`: the BUILT credential provider (`lib/keychain.js`, what dsh loads) mounted in a real cordis
 * context. Most cases run over `@orb/keychain`'s in-memory store (same contract as the Keychain); one case runs the
 * real macOS Keychain in a throwaway `ai.orb.app.test.*` service created and read by this same process (no prompt),
 * removed afterwards. The sidecar-level path (the Electron-owned items, the bundle row, the wire) is
 * apps/ui/test/keys.contract.test.ts.
 */
import { Context } from '@deepseek-ai/cordis';
import { credentialKey, credentialRef } from '@deepseek-ai/dsh-credentials';
import { clearService, KeychainStore, MemoryStore } from '@orb/keychain';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const libPath = pathToFileURL(resolve(import.meta.dirname, '..', 'lib', 'keychain.js')).href;
let Provider: any;
const homes: string[] = [];
const fibers: any[] = [];

beforeAll(async () => {
  Provider = (await import(libPath)).default;
});
afterEach(async () => {
  while (fibers.length) await fibers.pop().dispose();
});
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orb-keychain-'));
  homes.push(dir);
  return dir;
}

// P6.prep: test services are scoped by ORB_TEST_NAMESPACE (this package cannot import scripts/testkit).
const UNIT_SERVICE = `ai.orb.app.test.${process.env.ORB_TEST_NAMESPACE ? `${process.env.ORB_TEST_NAMESPACE}.` : ''}unit`;
const FAKE_OPENAI = `sk-proj-${'a'.repeat(40)}4f2a`;

async function mount(
  options: { store?: any; env?: Record<string, string>; dshHome?: string; extra?: Record<string, unknown> } = {},
) {
  const ctx = new Context();
  const store = options.store ?? new MemoryStore();
  const env = options.env ?? {};
  const refEvents: string[] = [];
  const recordEvents: string[] = [];
  ctx.on('credentials/reference-updated' as any, (ref: string) => void refEvents.push(ref));
  ctx.on('credentials/record-updated' as any, (key: string) => void recordEvents.push(key));
  const fiber = await ctx.plugin(Provider, {
    service: UNIT_SERVICE,
    dshHome: options.dshHome ?? home(),
    store,
    env: (ref: string) => env[ref],
    notice: () => {},
    ...options.extra,
  });
  fibers.push(fiber);
  const credentials = (ctx as any).credentials;
  expect(credentials).toBeInstanceOf(Provider);
  return { ctx, credentials, store, refEvents, recordEvents };
}

describe('orb-keychain credential provider', () => {
  it('stores references in the Keychain store, resolves them, and emits notifyUpdated on each change', async () => {
    const { credentials, store, refEvents } = await mount();
    const ref = credentialRef('OPENAI_API_KEY');
    expect(await credentials.describe(ref)).toEqual({ configured: false, writable: true });
    expect(await credentials.resolve(ref)).toBeUndefined();

    await credentials.set(ref, FAKE_OPENAI);
    expect(store.items.get('OPENAI_API_KEY')).toBe(FAKE_OPENAI);
    expect(await credentials.resolve(ref)).toEqual({ value: FAKE_OPENAI, source: 'keychain' });
    expect(await credentials.describe(ref)).toEqual({ configured: true, source: 'keychain', writable: true });
    expect(refEvents).toEqual(['OPENAI_API_KEY']);

    // Same value again: no write, no event.
    await credentials.set(ref, FAKE_OPENAI);
    expect(refEvents).toEqual(['OPENAI_API_KEY']);
    await expect(credentials.set(ref, '')).rejects.toThrow(/empty value/);

    await credentials.unset(ref);
    expect(store.items.has('OPENAI_API_KEY')).toBe(false);
    expect(await credentials.resolve(ref)).toBeUndefined();
    expect(refEvents).toEqual(['OPENAI_API_KEY', 'OPENAI_API_KEY']);
    // Unsetting an absent reference is a no-op.
    await credentials.unset(ref);
    expect(refEvents).toHaveLength(2);
  });

  it('the inherited environment is a read-only layer that wins, and set/unset under it are rejected', async () => {
    const store = new MemoryStore();
    store.items.set('ANTHROPIC_API_KEY', 'sk-ant-keychain-value-000000000000');
    const { credentials } = await mount({
      store,
      env: { ANTHROPIC_API_KEY: 'sk-ant-from-env-1111111111111111' },
    });
    const ref = credentialRef('ANTHROPIC_API_KEY');
    expect(await credentials.resolve(ref)).toEqual({
      value: 'sk-ant-from-env-1111111111111111',
      source: 'env',
    });
    expect(await credentials.describe(ref)).toEqual({ configured: true, source: 'env', writable: false });
    await expect(credentials.set(ref, 'sk-ant-other')).rejects.toThrow(
      /read-only by the launching environment/,
    );
    await expect(credentials.unset(ref)).rejects.toThrow(/read-only/);
    expect(store.items.get('ANTHROPIC_API_KEY')).toBe('sk-ant-keychain-value-000000000000');
  });

  it('reads no .env file (no dotenv layering)', async () => {
    const dir = home();
    writeFileSync(join(dir, '.env'), 'DEEPSEEK_API_KEY=sk-from-dotenv-22222222222222\n');
    const { credentials } = await mount({ dshHome: dir });
    expect(await credentials.resolve(credentialRef('DEEPSEEK_API_KEY'))).toBeUndefined();
  });

  it('records: modifyRecord is serialized read-decide-write, readRecord/describe/list/delete, notifyRecordUpdated', async () => {
    const { credentials, store, recordEvents } = await mount();
    const key = credentialKey('orb-test', 'grant');
    expect(await credentials.describeRecord(key)).toEqual({ configured: false, writable: true });
    // Two concurrent "create if absent" mutations: exactly one writes (the second sees the first's record).
    const create = (secret: string) =>
      credentials.modifyRecord(key, async (current: unknown) => {
        if (current !== undefined) return undefined;
        await new Promise((r) => setTimeout(r, 5));
        return { kind: 'grant', payload: { version: 1, secret } };
      });
    const [a, b] = await Promise.all([create('first'), create('second')]);
    expect(a).toEqual({ kind: 'grant', payload: { version: 1, secret: 'first' } });
    expect(b).toEqual(a);
    expect(recordEvents).toEqual(['orb-test/grant']);
    expect(JSON.parse(store.items.get('record:orb-test/grant')!)).toEqual(a);
    expect(await credentials.readRecord(key)).toEqual(a);
    expect(await credentials.describeRecord(key)).toEqual({
      configured: true,
      kind: 'grant',
      writable: true,
    });
    expect(await credentials.listRecords()).toEqual([
      { key: 'orb-test/grant', kind: 'grant' },
    ]);
    await expect(
      credentials.modifyRecord(credentialKey('llm-pi-ai', 'openai'), async () => ({
        kind: 'api-key',
        key: '',
      })),
    ).rejects.toThrow(/empty key/);
    await credentials.deleteRecord(key);
    expect(await credentials.readRecord(key)).toBeUndefined();
    expect(store.items.has('record:orb-test/grant')).toBe(false);
    expect(recordEvents).toEqual(['orb-test/grant', 'orb-test/grant']);
  });

  it('loads what the Keychain already holds at mount (refs and records), ignoring foreign items', async () => {
    const store = new MemoryStore();
    store.items.set('TAVILY_API_KEY', 'tvly-stored-33333333333333333');
    store.items.set('record:llm-pi-ai/openrouter', JSON.stringify({ kind: 'api-key', key: 'sk-or-x' }));
    store.items.set('some foreign item', 'x');
    const { credentials } = await mount({ store });
    expect((await credentials.resolve(credentialRef('TAVILY_API_KEY')))?.source).toBe('keychain');
    expect(await credentials.readRecord(credentialKey('llm-pi-ai', 'openrouter'))).toEqual({
      kind: 'api-key',
      key: 'sk-or-x',
    });
    expect(await credentials.storedRefs()).toEqual(['TAVILY_API_KEY']);
  });

  it('migrates a plaintext .credentials.yaml into the Keychain, verifies, then deletes the file', async () => {
    const dir = home();
    const file = join(dir, '.credentials.yaml');
    writeFileSync(
      file,
      [
        'version: 1',
        'refs:',
        `  OPENAI_API_KEY: ${FAKE_OPENAI}`,
        '  BRAVE_API_KEY: brave-plaintext-4444444444444',
        'records:',
        '  client-connection/browser-session:',
        '    kind: grant',
        '    payload:',
        '      version: 1',
        '      secret: c2VjcmV0',
        '  orb-test/grant:',
        '    kind: grant',
        '    payload:',
        '      version: 1',
        '      secret: b3RoZXI',
        '',
      ].join('\n'),
      { mode: 0o600 },
    );
    const { credentials, store, refEvents, recordEvents } = await mount({ dshHome: dir });
    expect(existsSync(file)).toBe(false);
    expect(credentials.lastMigration).toEqual({ migrated: 4, conflicts: 0, deleted: true });
    expect(store.items.get('OPENAI_API_KEY')).toBe(FAKE_OPENAI);
    expect(store.items.get('BRAVE_API_KEY')).toBe('brave-plaintext-4444444444444');
    expect(JSON.parse(store.items.get('record:orb-test/grant')!)).toEqual({
      kind: 'grant',
      payload: { version: 1, secret: 'b3RoZXI' },
    });
    // P6.2: the gateway's cookie secret is process-only: dropped with the file, never written to the Keychain.
    expect(store.items.has('record:client-connection/browser-session')).toBe(false);
    expect(await credentials.readRecord(credentialKey('client-connection', 'browser-session'))).toBeUndefined();
    expect(await credentials.resolve(credentialRef('OPENAI_API_KEY'))).toEqual({
      value: FAKE_OPENAI,
      source: 'keychain',
    });
    expect(refEvents.sort()).toEqual(['BRAVE_API_KEY', 'OPENAI_API_KEY']);
    expect(recordEvents).toEqual(['orb-test/grant']);
  });

  it("migrates dsh's pre-release flat layout too, and a world-readable file is still moved and deleted", async () => {
    const dir = home();
    const file = join(dir, '.credentials.yaml');
    writeFileSync(file, `OPENROUTER_API_KEY: sk-or-flat-555555555555555\n`);
    chmodSync(file, 0o644);
    const { store } = await mount({ dshHome: dir });
    expect(store.items.get('OPENROUTER_API_KEY')).toBe('sk-or-flat-555555555555555');
    expect(existsSync(file)).toBe(false);
  });

  it('keeps the Keychain value on a conflict, and keeps the file (served read-only) when a write does not land', async () => {
    const dir = home();
    const file = join(dir, '.credentials.yaml');
    writeFileSync(file, 'version: 1\nrefs:\n  OPENAI_API_KEY: sk-file-value-6666666666666666\n', {
      mode: 0o600,
    });
    const conflict = new MemoryStore();
    conflict.items.set('OPENAI_API_KEY', 'sk-keychain-newer-77777777777777');
    const first = await mount({ store: conflict, dshHome: dir });
    expect(first.credentials.lastMigration).toEqual({ migrated: 0, conflicts: 1, deleted: true });
    expect(conflict.items.get('OPENAI_API_KEY')).toBe('sk-keychain-newer-77777777777777');

    // A store whose writes silently do not stick: nothing is lost, the file stays, the key still resolves.
    writeFileSync(file, 'version: 1\nrefs:\n  OPENAI_API_KEY: sk-file-value-6666666666666666\n', {
      mode: 0o600,
    });
    const broken = new MemoryStore();
    broken.set = async () => {};
    const second = await mount({ store: broken, dshHome: dir });
    expect(second.credentials.lastMigration).toEqual({ migrated: 0, conflicts: 0, deleted: false });
    expect(existsSync(file)).toBe(true);
    expect(await second.credentials.resolve(credentialRef('OPENAI_API_KEY'))).toEqual({
      value: 'sk-file-value-6666666666666666',
      source: 'file',
    });
  });

  it('P6.2: the gateway cookie secret lives in this process only, never in the Keychain', async () => {
    const store = new MemoryStore();
    store.items.set(
      'record:client-connection/browser-session',
      JSON.stringify({ kind: 'grant', payload: { version: 1, secret: 'old' } }),
    );
    const { credentials, recordEvents } = await mount({ store });
    const key = credentialKey('client-connection', 'browser-session');
    // An item left by an older build is ignored: a fresh secret per sidecar process.
    expect(await credentials.readRecord(key)).toBeUndefined();
    const created = await credentials.modifyRecord(key, async (current: unknown) =>
      current === undefined ? { kind: 'grant', payload: { version: 1, secret: 'new' } } : undefined,
    );
    expect(created).toEqual({ kind: 'grant', payload: { version: 1, secret: 'new' } });
    expect(await credentials.readRecord(key)).toEqual(created);
    expect(JSON.parse(store.items.get('record:client-connection/browser-session')!).payload.secret).toBe('old');
    expect(recordEvents).toEqual(['client-connection/browser-session']);
    await credentials.deleteRecord(key);
    expect(await credentials.readRecord(key)).toBeUndefined();
  });

  it('P6.2: a Keychain that does not answer (an access prompt) holds the mount at most bootWaitMs', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const store = new MemoryStore();
    store.items.set('OPENAI_API_KEY', FAKE_OPENAI);
    const list = store.list.bind(store);
    store.list = async () => {
      await gate;
      return list();
    };
    const notices: string[] = [];
    const started = Date.now();
    const { credentials } = await mount({
      store,
      extra: { bootWaitMs: 600, notice: (line: string) => notices.push(line) },
    });
    const mountMs = Date.now() - started;
    expect(mountMs).toBeGreaterThanOrEqual(550);
    expect(mountMs).toBeLessThan(3000);
    // The gateway's activation path does not wait.
    const key = credentialKey('client-connection', 'browser-session');
    await credentials.modifyRecord(key, async () => ({ kind: 'grant', payload: { version: 1, secret: 's' } }));
    expect(credentials.keychainStatus().state).toBe('waiting');
    expect(notices).toEqual(['orb-keychain: waiting for the macOS Keychain (an access prompt may be open)']);
    // A key read waits for the Keychain, then answers.
    const resolving = credentials.resolve(credentialRef('OPENAI_API_KEY'));
    let answered = false;
    void resolving.then(() => (answered = true));
    await new Promise((r) => setTimeout(r, 50));
    expect(answered).toBe(false);
    release();
    expect(await resolving).toEqual({ value: FAKE_OPENAI, source: 'keychain' });
    expect(credentials.keychainStatus()).toEqual({ state: 'ready', waitingMs: 0 });
    expect(notices[1]).toBe('orb-keychain: the macOS Keychain answered');
  });

  it('P6.2: a quick Keychain mounts as before, with no notice', async () => {
    const notices: string[] = [];
    const { credentials } = await mount({ extra: { notice: (line: string) => notices.push(line) } });
    expect(credentials.keychainStatus()).toEqual({ state: 'ready', waitingMs: 0 });
    await new Promise((r) => setTimeout(r, 450));
    expect(notices).toEqual([]);
  });

  it('P6.2: the test delay is honoured only for a test service', async () => {
    const quick = await mount({ extra: { testDelayMs: 0 } });
    expect(quick.credentials.keychainStatus().state).toBe('ready');
    const ctx = new Context();
    const prev = process.env.ORB_KEYCHAIN_TEST_DELAY_MS;
    process.env.ORB_KEYCHAIN_TEST_DELAY_MS = '5000';
    try {
      const started = Date.now();
      const fiber = await ctx.plugin(Provider, {
        service: 'ai.orb.app',
        dshHome: home(),
        store: new MemoryStore(),
        env: () => undefined,
        notice: () => {},
      });
      fibers.push(fiber);
      expect((ctx as any).credentials.keychainStatus().state).toBe('ready');
      expect(Date.now() - started).toBeLessThan(1000);
    } finally {
      if (prev === undefined) delete process.env.ORB_KEYCHAIN_TEST_DELAY_MS;
      else process.env.ORB_KEYCHAIN_TEST_DELAY_MS = prev;
    }
  });

  it('an invalid plaintext document fails the mount loudly and is left in place', async () => {
    const dir = home();
    const file = join(dir, '.credentials.yaml');
    writeFileSync(file, 'version: 1\nrefs:\n  OPENAI_API_KEY: sk-x\nunknown: 1\n', { mode: 0o600 });
    const ctx = new Context();
    const fiber = ctx.plugin(Provider, { dshHome: dir, store: new MemoryStore(), env: () => undefined });
    fibers.push(fiber);
    await fiber.await().catch(() => {});
    expect(existsSync(file)).toBe(true);
    // Either the service is gone with its failed fiber, or every call reports the failed load.
    const svc = (ctx as any).credentials;
    if (svc) await expect(svc.resolve(credentialRef('OPENAI_API_KEY'))).rejects.toThrow();
  });
});

describe.runIf(process.platform === 'darwin')(
  'orb-keychain on the real macOS Keychain (test service)',
  () => {
    const service = `${UNIT_SERVICE}-${process.pid}-${randomBytes(4).toString('hex')}`;
    afterAll(async () => {
      await clearService(new KeychainStore(service));
    });

    it('round-trips a reference and a record through the Keychain and reloads them at the next mount', async () => {
      const value = `sk-test-${randomBytes(16).toString('hex')}`;
      const first = await mount({ store: new KeychainStore(service) });
      await first.credentials.set(credentialRef('OPENAI_API_KEY'), value);
      await first.credentials.modifyRecord(
        credentialKey('orb-test', 'grant'),
        async () => ({
          kind: 'grant',
          payload: { version: 1, secret: 'abc' },
        }),
      );
      await fibers.pop().dispose();

      const store = new KeychainStore(service);
      expect(await store.get('OPENAI_API_KEY')).toBe(value);
      const second = await mount({ store });
      expect(await second.credentials.resolve(credentialRef('OPENAI_API_KEY'))).toEqual({
        value,
        source: 'keychain',
      });
      expect(await second.credentials.listRecords()).toEqual([{ key: 'orb-test/grant', kind: 'grant' }]);
      await second.credentials.unset(credentialRef('OPENAI_API_KEY'));
      expect(await store.get('OPENAI_API_KEY')).toBeUndefined();
    });
  },
);
