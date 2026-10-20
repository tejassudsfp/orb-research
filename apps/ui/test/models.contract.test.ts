/**
 * P4.2 contract test: Models settings in a REAL sidecar (Electron-as-Node, the Orb bundle) with the mock LLM. Every
 * provider card (OpenAI, DeepSeek, Anthropic, OpenRouter) is routed to the mock with a route-level baseURL, so each
 * one's own wire protocol runs (OpenAI responses, chat completions, Anthropic messages) with the key its route
 * resolves from the (throwaway) Keychain. No real key, no network.
 *
 * - models.describe: cards in order (OpenAI first), redacted keys, the mock route, what each agent starts on.
 * - keys.test: one request with maxTokens 1 per provider, each on its protocol and with its own key; failures map to
 *   plain messages (invalid key, no credit, rate limited, unreachable, no key) and never carry the key.
 * - discovery: a draft custom endpoint's model listing; a catalog provider's installed catalog.
 * - custom provider (no key needed, like Ollama): written to llm-pi-ai's `providers` in the profile patch and usable
 *   by the next request with no restart; restated from orb.json after a restart; removable.
 * - per-agent picker: orb.json picks, `null` back to the default; the tier default when the harness default has no key
 *   (Orb on DeepSeek's strong model), used by the next agent start.
 * - first run: due when no provider is usable, until it is finished or skipped.
 * - DSH_HOME holds no key; `security find-generic-password` shows every provider's item.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clearTestKeychain,
  mockCatalogPatch,
  MockLlm,
  MOCK_KEY_ENV,
  MOCK_MODEL,
  MOCK_MODEL_ALT,
  MOCK_PROVIDER,
  newTestKeychainService,
  startMockedSidecar,
  startSidecar,
  type MockedSidecar,
} from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';

const service = newTestKeychainService('models');
const keys = {
  openai: `sk-proj-${randomBytes(20).toString('hex')}`,
  deepseek: `sk-${randomBytes(20).toString('hex')}`,
  anthropic: `sk-ant-${randomBytes(20).toString('hex')}`,
  openrouter: `sk-or-v1-${randomBytes(20).toString('hex')}`,
};

let home: string;
/** One mock for both boots, so the custom provider's stored baseURL stays valid across the restart. */
let llm: MockLlm;
let sc: MockedSidecar;
let wire: Wire;

function connect(sidecar: MockedSidecar): Wire {
  return createWire(
    { baseUrl: sidecar.baseUrl, fetch: sidecar.fetch, createSocket: sidecar.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
}

async function boot(): Promise<void> {
  const sidecar = await startSidecar({
    homeDir: home,
    keychainService: service,
    extraPatch: mockCatalogPatch(llm.baseURL),
    env: { [MOCK_KEY_ENV]: 'orb-mock-key' },
  });
  sc = { ...sidecar, llm };
  wire = connect(sc);
}

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

/** A local port nothing listens on. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-models-'));
  llm = await new MockLlm().start();
  await boot();
});

afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
  await llm?.close();
  await clearTestKeychain(service).catch(() => {});
  if (home) rmSync(home, { recursive: true, force: true });
});

describe('Models settings in the sidecar', () => {
  it('models.describe lists the provider cards (OpenAI first), the mock route, and each agent route', async () => {
    const d = await wire.orb.models.describe();
    expect(d.providers.map((p) => p.id)).toEqual([
      'openai',
      'deepseek',
      'anthropic',
      'openrouter',
      MOCK_PROVIDER,
    ]);
    const openai = d.providers[0]!;
    expect(openai).toMatchObject({
      label: 'OpenAI',
      kind: 'catalog',
      routed: true,
      usable: false,
      status: { state: 'not-set' },
      testModel: 'gpt-6-luna',
    });
    // The picker lists the installed catalog (ctx.llm.discoverModels).
    expect(openai.models).toContain('gpt-6-luna');
    expect(d.providers.find((p) => p.id === MOCK_PROVIDER)).toMatchObject({
      kind: 'route',
      usable: true,
      models: [MOCK_MODEL, MOCK_MODEL_ALT],
    });
    expect(d.harnessDefault).toEqual({ provider: MOCK_PROVIDER, model: MOCK_MODEL });
    expect(d.effective.scout).toEqual({ provider: MOCK_PROVIDER, model: MOCK_MODEL, source: 'default' });
    expect(d.anyUsable).toBe(true);
    expect(d.firstRun).toBe(false);
  });

  it('keys.test runs one maxTokens 1 request per provider on its own protocol with its own key', async () => {
    const expected = {
      openai: { protocol: 'openai-responses', model: 'gpt-6-luna' },
      deepseek: { protocol: 'openai-completions', model: 'deepseek-flash' },
      anthropic: { protocol: 'anthropic-messages', model: 'claude-haiku-4-5' },
      openrouter: { protocol: 'openai-completions', model: 'deepseek/deepseek-v4-flash' },
    } as const;
    for (const [provider, key] of Object.entries(keys) as Array<[keyof typeof keys, string]>) {
      const descriptor = await wire.orb.keys.set({ provider, key });
      expect(descriptor.redacted).toMatch(/\.\.\./);
      const seen = sc.llm.requests.length;
      sc.llm.enqueue({ text: 'OK' });
      const result = await wire.orb.keys.test({ provider });
      expect(result, provider).toMatchObject({
        provider,
        model: expected[provider].model,
        ok: true,
        status: { state: 'working', model: expected[provider].model },
      });
      const req = sc.llm.requests.find((r) => r.id > seen)!;
      expect(req.protocol, provider).toBe(expected[provider].protocol);
      expect(req.body.model).toBe(expected[provider].model);
      // maxTokens 1 (OpenAI Responses clamps to its minimum of 16: pi-ai OPENAI_RESPONSES_MIN_OUTPUT_TOKENS).
      const max = req.body.max_tokens ?? req.body.max_completion_tokens ?? req.body.max_output_tokens;
      expect(max).toBe(provider === 'openai' ? 16 : 1);
      if (provider === 'anthropic') expect(req.apiKey).toBe(key);
      else expect(req.authorization).toBe(`Bearer ${key}`);
    }
    const d = await wire.orb.models.describe();
    for (const id of Object.keys(keys)) {
      expect(
        d.providers.find((p) => p.id === id),
        id,
      ).toMatchObject({ usable: true, status: { state: 'working' } });
    }
  });

  it('a failed test maps the error code to a plain message, and never carries the key', async () => {
    const cases = [
      {
        turn: { status: 401, errorMessage: `Incorrect API key provided: ${keys.deepseek}` },
        kind: 'invalid-key',
      },
      { turn: { status: 402, errorMessage: 'Insufficient Balance' }, kind: 'no-credit' },
      { turn: { status: 429, errorMessage: 'Rate limit reached for requests' }, kind: 'rate-limited' },
    ] as const;
    for (const c of cases) {
      sc.llm.enqueue(c.turn, c.turn, c.turn, c.turn, c.turn, c.turn);
      const started = Date.now();
      const result = await wire.orb.keys.test({ provider: 'deepseek' });
      expect(result.ok, c.kind).toBe(false);
      expect(result.status.kind, `${c.kind}: ${result.status.message}`).toBe(c.kind);
      expect(result.status.state).toBe('failed');
      expect(JSON.stringify(result)).not.toContain(keys.deepseek);
      expect(Date.now() - started).toBeLessThan(20_000);
      // Drop turns the retries did not use.
      (sc.llm as unknown as { queue: unknown[] }).queue.length = 0;
    }
    const d = await wire.orb.models.describe();
    expect(d.providers.find((p) => p.id === 'deepseek')!.status).toMatchObject({
      state: 'failed',
      kind: 'rate-limited',
    });
    expect(JSON.stringify(d)).not.toContain(keys.deepseek);

    // No key: the route resolves nothing, so no request leaves the machine.
    await wire.orb.keys.unset({ provider: 'anthropic' });
    const seen = sc.llm.requests.length;
    const missing = await wire.orb.keys.test({ provider: 'anthropic' });
    expect(missing.status).toMatchObject({ state: 'failed', kind: 'no-key' });
    expect(sc.llm.requests.length).toBe(seen);
    expect((await wire.orb.models.describe()).providers.find((p) => p.id === 'anthropic')!.status.state).toBe(
      'not-set',
    );
    await wire.orb.keys.set({ provider: 'anthropic', key: keys.anthropic });
  });

  it('discovers models from draft and configured provider endpoints', async () => {
    const draft = await wire.orb.models.discover({ baseURL: sc.llm.baseURL, api: 'openai-completions' });
    expect(draft.models.map((m) => m.id)).toEqual([MOCK_MODEL, MOCK_MODEL_ALT]);
    const anthropic = await wire.orb.models.discover({ provider: 'anthropic' });
    expect(anthropic.models.map((m) => m.id)).toEqual([MOCK_MODEL, MOCK_MODEL_ALT]);
  });

  it('a custom provider with no key is live on the next request (no restart), in the profile patch and orb.json', async () => {
    const info = await wire.orb.models.setCustom({
      id: 'local-llm',
      label: 'Local LLM',
      baseURL: sc.llm.baseURL,
      api: 'openai-completions',
      models: [MOCK_MODEL_ALT],
      noKey: true,
    });
    expect(info).toMatchObject({ id: 'local-llm', kind: 'custom', routed: true, usable: true, noKey: true });
    const seen = sc.llm.requests.length;
    const result = await wire.orb.keys.test({ provider: 'local-llm' });
    expect(result).toMatchObject({ ok: true, model: MOCK_MODEL_ALT });
    const req = sc.llm.requests.find((r) => r.id > seen)!;
    expect(req.body.model).toBe(MOCK_MODEL_ALT);
    expect(req.authorization).toBe('Bearer orb-no-key');

    const patch = readFileSync(join(sc.paths.dshHome, 'profiles', 'orb', 'cordis.patch.yml'), 'utf8');
    expect(patch).toContain('local-llm:');
    expect(patch).toContain('apiKeyEnv: ORB_LOCAL_LLM_API_KEY');
    const orbJson = JSON.parse(readFileSync(join(sc.paths.orbHome, 'orb.json'), 'utf8'));
    expect(orbJson.customProviders).toEqual([
      {
        id: 'local-llm',
        label: 'Local LLM',
        baseURL: sc.llm.baseURL,
        api: 'openai-completions',
        models: [MOCK_MODEL_ALT],
        noKey: true,
      },
    ]);
    // A stored route's discovery uses its baseURL.
    expect((await wire.orb.models.discover({ provider: 'local-llm' })).models.map((m) => m.id)).toContain(
      MOCK_MODEL,
    );
    // An id that names a built-in provider is refused.
    await expect(
      wire.orb.models.setCustom({
        id: 'openai',
        baseURL: sc.llm.baseURL,
        api: 'openai-completions',
        models: ['x'],
      }),
    ).rejects.toMatchObject({ code: 'orb/invalid-args' });
  });

  it('an unreachable endpoint reads as unreachable', async () => {
    const port = await closedPort();
    await wire.orb.models.setCustom({
      id: 'gone',
      baseURL: `http://127.0.0.1:${port}/v1`,
      api: 'openai-completions',
      models: ['m'],
      noKey: true,
    });
    const result = await wire.orb.keys.test({ provider: 'gone' });
    expect(result.status).toMatchObject({ state: 'failed', kind: 'unreachable' });
    await wire.orb.models.removeCustom('gone');
  });

  it('per-agent picks go to orb.json and show as effective; null returns a role to the default', async () => {
    await wire.orb.settings.set({ models: { scout: { provider: 'local-llm', model: MOCK_MODEL_ALT } } });
    let d = await wire.orb.models.describe();
    expect(d.effective.scout).toEqual({ provider: 'local-llm', model: MOCK_MODEL_ALT, source: 'chosen' });
    expect(d.chosen.scout).toEqual({ provider: 'local-llm', model: MOCK_MODEL_ALT });
    await wire.orb.settings.set({ models: { scout: null } });
    d = await wire.orb.models.describe();
    expect(d.effective.scout.source).toBe('default');
    expect(d.chosen.scout).toBeUndefined();
  });

  it('after a restart the custom provider is restated and works; DSH_HOME holds no key; the Keychain shows every item', async () => {
    wire.dispose();
    await sc.stop();
    await boot();
    const d = await wire.orb.models.describe();
    expect(d.providers.find((p) => p.id === 'local-llm')).toMatchObject({ routed: true, usable: true });
    // P6.9: the last key test survived the restart (orb.json `keyTests`), shown before any new test.
    expect(d.providers.find((p) => p.id === 'local-llm')!.status).toMatchObject({ state: 'working' });
    expect(
      JSON.parse(readFileSync(join(sc.paths.orbHome, 'orb.json'), 'utf8')).keyTests['local-llm'],
    ).toMatchObject({
      state: 'working',
    });
    sc.llm.enqueue({ text: 'OK' });
    expect(await wire.orb.keys.test({ provider: 'local-llm' })).toMatchObject({ ok: true });
    for (const file of filesUnder(sc.paths.dshHome)) {
      const text = readFileSync(file, 'latin1');
      for (const key of Object.values(keys)) expect(text.includes(key), file).toBe(false);
    }
    for (const account of [
      'OPENAI_API_KEY',
      'DEEPSEEK_API_KEY',
      'ANTHROPIC_API_KEY',
      'OPENROUTER_API_KEY',
      'ORB_LOCAL_LLM_API_KEY',
    ]) {
      const r = spawnSync('security', ['find-generic-password', '-s', service, '-a', account], {
        encoding: 'utf8',
        timeout: 10_000,
      });
      expect(r.status, account).toBe(0);
      expect(r.stdout).toContain(`"acct"<blob>="${account}"`);
    }
  });

  it('removing a custom provider drops its route, its key and the agent picks naming it', async () => {
    await wire.orb.settings.set({ models: { critic: { provider: 'local-llm', model: MOCK_MODEL_ALT } } });
    await wire.orb.models.removeCustom('local-llm');
    const d = await wire.orb.models.describe();
    expect(d.providers.some((p) => p.id === 'local-llm')).toBe(false);
    expect(d.chosen.critic).toBeUndefined();
    const keysNow = await wire.orb.keys.describe();
    expect(keysNow.keys.some((k) => k.provider === 'local-llm')).toBe(false);
    const patch = readFileSync(join(sc.paths.dshHome, 'profiles', 'orb', 'cordis.patch.yml'), 'utf8');
    expect(patch).not.toContain('local-llm:');
    const missing = await wire.orb.keys.test({ provider: 'local-llm' });
    expect(missing.status.kind).toBe('not-configured');
  });
});

describe('first run and tier defaults with no usable default provider', () => {
  let fresh: MockedSidecar;
  let w: Wire;
  const freshService = newTestKeychainService('firstrun');

  beforeAll(async () => {
    fresh = await startMockedSidecar({
      keychainService: freshService,
      env: { [MOCK_KEY_ENV]: undefined, ORB_SKIP_FIRST_RUN: undefined },
      // The harness default is OpenAI (as in the Orb profile) and no key exists anywhere.
      extraPatch: (llm) =>
        mockCatalogPatch(llm.baseURL, {
          mockKeyRef: 'ORB_ORB_MOCK_API_KEY',
          defaultRoute: { provider: 'openai', model: 'gpt-6-luna' },
        }),
    });
    w = connect(fresh);
  });

  afterAll(async () => {
    w?.dispose();
    await fresh?.stop();
    await clearTestKeychain(freshService).catch(() => {});
  });

  it('the first-run sheet is due while no provider works, until finished or skipped', async () => {
    let d = await w.orb.models.describe();
    expect(d.anyUsable).toBe(false);
    expect(d.firstRun).toBe(true);
    await w.orb.settings.set({ firstRunDone: true });
    d = await w.orb.models.describe();
    expect(d.firstRun).toBe(false);
  });

  it('with only a DeepSeek key, agents start on DeepSeek by tier (Orb strong) at their next start', async () => {
    await w.orb.keys.set({ provider: 'deepseek', key: keys.deepseek });
    const d = await w.orb.models.describe();
    expect(d.anyUsable).toBe(true);
    expect(d.effective.orb).toEqual({ provider: 'deepseek', model: 'deepseek-v4-pro', source: 'tier' });
    expect(d.effective.scout).toEqual({ provider: 'deepseek', model: 'deepseek-flash', source: 'tier' });
    const seen = fresh.llm.requests.length;
    const canvas = await w.orb.canvas.create({ prompt: `Tier ${randomUUID().slice(0, 6)}` });
    await w.orb.chat.send(canvas.id, { text: 'hello' });
    const req = await fresh.llm.waitForRequest((r) => r.id > seen, 30_000);
    expect(req.protocol).toBe('openai-completions');
    expect(req.body.model).toBe('deepseek-v4-pro');
    expect(req.authorization).toBe(`Bearer ${keys.deepseek}`);
  });
});
