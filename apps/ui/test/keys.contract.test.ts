/**
 * P4.1 contract test: `orb-keychain` in a REAL sidecar (Electron-as-Node, the Orb bundle), with the mock LLM.
 * - The bundle's `credentials` service is the Keychain provider; the sidecar runs on a throwaway Keychain service
 *   (`ai.orb.app.test.*`, from the testkit), never the real `ai.orb.app`.
 * - Migration: a plaintext `DSH_HOME/.credentials.yaml` present at boot is moved into the Keychain (each entry checked
 *   from the Electron binary that owns the items) and deleted; `DSH_HOME` then holds no key; the migrated key is what
 *   the model route sends.
 * - `keys.describe` answers redacted descriptors only; `keys.set` takes a key once over the authenticated loopback
 *   (no cookie: 401, foreign Origin: 403, nothing stored) and the next model request uses it with no restart;
 *   `keys.unset` removes it from the Keychain.
 * - `security find-generic-password` (attributes only, no prompt) shows the items.
 * Keys here are random test values, never real ones.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clearTestKeychain,
  keychainHas,
  keychainMatches,
  mockProviderPatch,
  MOCK_KEY_ENV,
  newTestKeychainService,
  startMockedSidecar,
  type MockedSidecar,
} from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';

/** The mock route resolves its key through the custom-provider reference `ORB_MOCK_API_KEY` (provider id `mock`). */
const MOCK_REF = 'ORB_MOCK_API_KEY';
const migratedMockKey = `orb-migrated-${randomBytes(12).toString('hex')}`;
const fakeOpenAi = `sk-proj-${randomBytes(24).toString('hex')}`;
const service = newTestKeychainService('keys');

let home: string;
let plaintext: string;
let sc: MockedSidecar;
let wire: Wire;

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-keys-'));
  mkdirSync(join(home, 'dsh'), { recursive: true, mode: 0o700 });
  plaintext = join(home, 'dsh', '.credentials.yaml');
  // What dsh's local provider leaves behind (version-1 layout, mode 0600).
  writeFileSync(
    plaintext,
    `version: 1\nrefs:\n  ${MOCK_REF}: ${migratedMockKey}\n  OPENAI_API_KEY: ${fakeOpenAi}\n`,
    {
      mode: 0o600,
    },
  );
  sc = await startMockedSidecar({
    homeDir: home,
    keychainService: service,
    // No mock key in the launch env: the route must get it from the Keychain.
    env: { [MOCK_KEY_ENV]: undefined },
    extraPatch: (llm) =>
      mockProviderPatch(llm.baseURL).replace(`apiKeyEnv: ${MOCK_KEY_ENV}`, `apiKeyEnv: ${MOCK_REF}`),
  });
  wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
});

afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
  await clearTestKeychain(service).catch(() => {});
  if (home) rmSync(home, { recursive: true, force: true });
});

/** Every regular file under `dir`. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...filesUnder(p));
    else if (st.isFile()) out.push(p);
  }
  return out;
}

/** The model requests' Authorization header for one chat message on a fresh canvas. */
async function authorizationOfNextRequest(text: string): Promise<string | undefined> {
  const seen = sc.llm.requests.length;
  const canvas = await wire.orb.canvas.create({ prompt: `Keys ${randomUUID().slice(0, 6)}` });
  await wire.orb.chat.send(canvas.id, { text });
  const req = await sc.llm.waitForRequest((r) => r.id > seen, 30_000);
  return req.authorization;
}

async function rawSet(headers: Record<string, string>, provider: string, key: string): Promise<Response> {
  return fetch(`${sc.origin}/api/orb/keys.set`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: randomUUID(),
      method: 'orb/keys.set',
      payload: { args: { request: { provider, key } } },
    }),
  });
}

describe('orb-keychain in the sidecar', () => {
  it('migrates the plaintext credentials into the Keychain, deletes the file, and DSH_HOME holds no key', async () => {
    expect(existsSync(plaintext)).toBe(false);
    expect(await keychainMatches(service, MOCK_REF, migratedMockKey)).toBe(true);
    expect(await keychainMatches(service, 'OPENAI_API_KEY', fakeOpenAi)).toBe(true);
    // P6.2: the gateway's browser-session signing secret is process-only (the gateway's activation never waits on
    // the Keychain), so it is not written to the Keychain.
    expect(await keychainHas(service, 'record:client-connection/browser-session')).toBe(false);
    for (const file of filesUnder(sc.paths.dshHome)) {
      const text = readFileSync(file, 'latin1');
      expect(text.includes(migratedMockKey), file).toBe(false);
      expect(text.includes(fakeOpenAi), file).toBe(false);
    }
    expect(readFileSync(sc.logPath, 'utf8')).toContain('into the Keychain');
  });

  it('`security find-generic-password` shows the items (attributes only, no prompt)', () => {
    for (const account of ['OPENAI_API_KEY', MOCK_REF]) {
      const r = spawnSync('security', ['find-generic-password', '-s', service, '-a', account], {
        encoding: 'utf8',
        timeout: 10_000,
      });
      expect(r.status, account).toBe(0);
      expect(r.stdout).toContain(`"svce"<blob>="${service}"`);
      expect(r.stdout).toContain(`"acct"<blob>="${account}"`);
      expect(r.stdout).not.toContain(fakeOpenAi);
    }
  });

  it('the model route sends the migrated key from the Keychain', async () => {
    expect(await authorizationOfNextRequest('hello')).toBe(`Bearer ${migratedMockKey}`);
  });

  it('keys.describe answers redacted descriptors only', async () => {
    const res = await sc.fetch(`${sc.origin}/api/orb/keys.describe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: randomUUID(),
        method: 'orb/keys.describe',
        payload: { args: {} },
      }),
    });
    const raw = await res.text();
    expect(raw).not.toContain(fakeOpenAi);
    expect(raw).not.toContain(migratedMockKey);
    const { keys } = await wire.orb.keys.describe();
    expect(keys.find((k) => k.provider === 'openai')).toEqual({
      provider: 'openai',
      ref: 'OPENAI_API_KEY',
      configured: true,
      source: 'keychain',
      writable: true,
      redacted: `sk-proj-...${fakeOpenAi.slice(-4)}`,
    });
    expect(keys.find((k) => k.provider === 'anthropic')).toEqual({
      provider: 'anthropic',
      ref: 'ANTHROPIC_API_KEY',
      configured: false,
      writable: true,
    });
    // The custom provider behind ORB_MOCK_API_KEY is listed because a key is stored for it.
    expect(keys.find((k) => k.provider === 'mock')).toMatchObject({
      ref: MOCK_REF,
      configured: true,
      source: 'keychain',
    });
  });

  it('keys.set is refused without the auth cookie (401) or from another origin (403); nothing is stored', async () => {
    const intruder = `sk-ant-${randomBytes(20).toString('hex')}`;
    expect((await rawSet({}, 'anthropic', intruder)).status).toBe(401);
    expect(
      (await rawSet({ ...sc.headers, origin: 'http://evil.example' }, 'anthropic', intruder)).status,
    ).toBe(403);
    expect(await keychainHas(service, 'ANTHROPIC_API_KEY')).toBe(false);
  });

  it('keys.set stores a key from the UI once; the next request uses it with no restart; keys.unset removes it', async () => {
    const fresh = `orb-fresh-${randomBytes(12).toString('hex')}`;
    const descriptor = await wire.orb.keys.set({ provider: 'mock', key: fresh });
    expect(descriptor).toEqual({
      provider: 'mock',
      ref: MOCK_REF,
      configured: true,
      source: 'keychain',
      writable: true,
      redacted: `orb-...${fresh.slice(-4)}`,
    });
    expect(JSON.stringify(descriptor)).not.toContain(fresh);
    expect(await keychainMatches(service, MOCK_REF, fresh)).toBe(true);
    expect(await authorizationOfNextRequest('again')).toBe(`Bearer ${fresh}`);

    const anthropic = `sk-ant-api03-${randomBytes(24).toString('hex')}`;
    await wire.orb.keys.set({ provider: 'anthropic', key: anthropic });
    expect(await keychainMatches(service, 'ANTHROPIC_API_KEY', anthropic)).toBe(true);
    const gone = await wire.orb.keys.unset({ provider: 'anthropic' });
    expect(gone).toEqual({
      provider: 'anthropic',
      ref: 'ANTHROPIC_API_KEY',
      configured: false,
      writable: true,
    });
    expect(await keychainHas(service, 'ANTHROPIC_API_KEY')).toBe(false);
    // Still nothing in DSH_HOME.
    for (const file of filesUnder(sc.paths.dshHome)) {
      const text = readFileSync(file, 'latin1');
      expect(text.includes(fresh), file).toBe(false);
      expect(text.includes(anthropic), file).toBe(false);
    }
    expect(readFileSync(sc.logPath, 'utf8')).not.toContain(fresh);
  });

  it('a restart on the same home keeps the keys (no plaintext file comes back)', async () => {
    await sc.supervisor.stop();
    const again = await startMockedSidecar({
      homeDir: home,
      keychainService: service,
      env: { [MOCK_KEY_ENV]: undefined },
      extraPatch: (llm) =>
        mockProviderPatch(llm.baseURL).replace(`apiKeyEnv: ${MOCK_KEY_ENV}`, `apiKeyEnv: ${MOCK_REF}`),
    });
    try {
      const w = createWire({ baseUrl: again.baseUrl, fetch: again.fetch, createSocket: again.createSocket });
      try {
        const { keys } = await w.orb.keys.describe();
        expect(keys.find((k) => k.provider === 'openai')?.configured).toBe(true);
        expect(keys.find((k) => k.provider === 'mock')?.source).toBe('keychain');
      } finally {
        w.dispose();
      }
      expect(existsSync(plaintext)).toBe(false);
    } finally {
      await again.stop();
    }
  });
});
