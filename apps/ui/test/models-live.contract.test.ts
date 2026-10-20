/** Provider directories and actual requests for model IDs newer than the installed catalog. */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  MockLlm,
  MOCK_KEY_ENV,
  mockCatalogPatch,
  startSidecar,
  type TestSidecar,
} from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';

const keys = Object.fromEntries(
  ['openai', 'deepseek', 'anthropic', 'openrouter'].map((id) => [id, `fixture-private-${id}-key`]),
) as Record<string, string>;
let llm: MockLlm, sc: TestSidecar, wire: Wire, home: string;
let offline = false;
let revision = 1;
let hold: Promise<void> | undefined;
let entered: (() => void) | undefined;
const idOf = (provider: string) => `future-${provider}-${revision}`;
async function boot() {
  sc = await startSidecar({
    homeDir: home,
    extraPatch: mockCatalogPatch(llm.baseURL),
    env: { [MOCK_KEY_ENV]: 'orb-mock-key' },
  });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
}
beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-live-models-'));
  llm = await new MockLlm({
    models: async (req) => {
      entered?.();
      if (hold) await hold;
      if (offline) return { status: 503, body: { error: 'offline' } };
      const provider =
        Object.keys(keys).find((p) => req.authorization === `Bearer ${keys[p]}` || req.apiKey === keys[p]) ??
        'custom';
      return {
        body: {
          data: [
            {
              id: idOf(provider),
              created: 100 + revision,
              context_window: 128000,
              max_output_tokens: 16000,
              input_modalities: ['text'],
            },
          ],
          has_more: false,
        },
      };
    },
  }).start();
  await boot();
});
afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
  await llm?.close();
  if (home) rmSync(home, { recursive: true, force: true });
});

it('fetches every built-in provider with its own stored key and actually runs newly listed IDs on its protocol', async () => {
  const protocols = {
    openai: 'openai-responses',
    deepseek: 'openai-completions',
    anthropic: 'anthropic-messages',
    openrouter: 'openai-completions',
  };
  for (const provider of Object.keys(keys)) {
    await wire.orb.keys.set({ provider, key: keys[provider]! });
    const listed = await wire.orb.models.discover({ provider });
    expect(listed.models).toEqual([
      {
        id: idOf(provider),
        created: 101,
        contextWindow: 128000,
        maxTokens: 16000,
        inputModalities: ['text'],
      },
    ]);
    const directoryRequest = llm.modelListRequests.at(-1)!;
    if (provider === 'anthropic') expect(directoryRequest.apiKey).toBe(keys[provider]);
    else expect(directoryRequest.authorization).toBe(`Bearer ${keys[provider]}`);
    expect(await wire.orb.keys.test({ provider, model: idOf(provider) })).toMatchObject({ ok: true });
    expect(llm.requests.at(-1)).toMatchObject({
      protocol: protocols[provider as keyof typeof protocols],
      body: { model: idOf(provider) },
    });
    const info = (await wire.orb.models.describe()).providers.find((p) => p.id === provider)!;
    expect(info.models).toEqual([idOf(provider)]);
    expect(info.modelListing).toMatchObject({ source: 'provider' });
    expect(JSON.stringify(info)).not.toContain(keys[provider]);
  }
  const stored = readFileSync(join(sc.paths.orbHome, 'orb.json'), 'utf8');
  for (const key of Object.values(keys)) expect(stored).not.toContain(key);
});

it('refreshes again instead of permanently caching the first list, and preserves the chosen ID', async () => {
  await wire.orb.settings.set({ models: { orb: { provider: 'openai', model: 'future-openai-1' } } });
  revision = 2;
  expect((await wire.orb.models.discover({ provider: 'openai' })).models[0]!.id).toBe('future-openai-2');
  const info = await wire.orb.models.describe();
  expect(info.chosen.orb).toEqual({ provider: 'openai', model: 'future-openai-1' });
  expect(info.providers.find((p) => p.id === 'openai')!.models).toEqual(['future-openai-2']);
  expect(await wire.orb.keys.test({ provider: 'openai', model: 'future-openai-1' })).toMatchObject({
    ok: true,
  });
});

it('keeps the last successful directory on failure, restores it offline after restart and can use the saved selection', async () => {
  offline = true;
  await expect(wire.orb.models.discover({ provider: 'openai' })).rejects.toThrow('HTTP 503');
  const requests = llm.modelListRequests.length;
  wire.dispose();
  await sc.stop();
  await boot();
  const restored = await wire.orb.models.describe();
  expect(llm.modelListRequests.length).toBe(requests); // Startup/describe never interrogates providers.
  expect(restored.chosen.orb).toEqual({ provider: 'openai', model: 'future-openai-1' });
  expect(restored.providers.find((p) => p.id === 'openai')!.models).toEqual(['future-openai-2']);
  // The previously selected, now unlisted ID also remains registered across a rewritten launch profile.
  expect(await wire.orb.keys.test({ provider: 'openai', model: 'future-openai-1' })).toMatchObject({
    ok: true,
  });
  expect(await wire.orb.keys.test({ provider: 'openai', model: 'future-openai-2' })).toMatchObject({
    ok: true,
  });
  offline = false;
});

it('refreshes a no-key custom endpoint and restores its discovered model registration after restart', async () => {
  await wire.orb.models.setCustom({
    id: 'custom-live',
    baseURL: llm.baseURL,
    api: 'openai-completions',
    models: ['manual-model'],
    noKey: true,
  });
  await wire.orb.models.discover({ provider: 'custom-live' });
  expect(llm.modelListRequests.at(-1)!.authorization).toBeUndefined();
  wire.dispose();
  await sc.stop();
  await boot();
  expect((await wire.orb.models.describe()).providers.find((p) => p.id === 'custom-live')!.models).toEqual([
    'future-custom-2',
    'manual-model',
  ]);
  expect(await wire.orb.keys.test({ provider: 'custom-live', model: 'future-custom-2' })).toMatchObject({
    ok: true,
  });
});

it('uses a newly typed draft key only for that discovery and never persists it', async () => {
  const key = 'one-shot-draft-key-private';
  await wire.orb.models.discover({ baseURL: llm.baseURL, api: 'openai-completions', apiKey: key });
  expect(llm.modelListRequests.at(-1)!.authorization).toBe(`Bearer ${key}`);
  expect(readFileSync(join(sc.paths.orbHome, 'orb.json'), 'utf8')).not.toContain(key);
  expect(readFileSync(join(sc.paths.dshHome, 'profiles', 'orb', 'cordis.patch.yml'), 'utf8')).not.toContain(
    key,
  );
});

it('does not save a stale account directory when the key changes during a refresh', async () => {
  let release!: () => void;
  hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const result = wire.orb.models.discover({ provider: 'openai' }).then(
    () => undefined,
    (err: unknown) => err,
  );
  await started;
  await wire.orb.keys.set({ provider: 'openai', key: 'changed-account-test-key' });
  release();
  hold = undefined;
  entered = undefined;
  expect(((await result) as Error).message).toContain('provider changed');
  expect((await wire.orb.settings.get()).modelCatalogs.openai).toBeUndefined();
});

it('cannot recreate a custom route or its cache when it is removed during discovery', async () => {
  await wire.orb.models.setCustom({
    id: 'removed-during-refresh',
    baseURL: llm.baseURL,
    api: 'openai-completions',
    models: ['manual'],
    noKey: true,
  });
  let release!: () => void;
  hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const result = wire.orb.models.discover({ provider: 'removed-during-refresh' }).then(
    () => undefined,
    (err: unknown) => err,
  );
  await started;
  await wire.orb.models.removeCustom('removed-during-refresh');
  release();
  hold = undefined;
  entered = undefined;
  expect(((await result) as Error).message).toContain('provider changed');
  expect((await wire.orb.settings.get()).modelCatalogs['removed-during-refresh']).toBeUndefined();
  expect((await wire.orb.models.describe()).providers.some((p) => p.id === 'removed-during-refresh')).toBe(
    false,
  );
});
