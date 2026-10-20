/** P4.2 orb.json: per-role merge with null clearing, update() for custom providers, first-run flag. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsStore } from '../src/settings.js';

let home: string | undefined;
afterEach(() => {
  if (home) rmSync(home, { recursive: true, force: true });
  home = undefined;
});

describe('SettingsStore (P4.2)', () => {
  it('migrates explicit legacy brightness and keeps style/accent independent through queued partial changes', async () => {
    home = mkdtempSync(join(tmpdir(), 'orb-appearance-'));
    const store = new SettingsStore(home);
    expect((await store.get()).appearance).toEqual({ themeId: 'studio', mode: 'system', accent: 'blue' });
    writeFileSync(
      store.path,
      JSON.stringify({ theme: 'day', models: { scout: { provider: 'openai', model: 'm' } } }),
    );
    expect((await store.get()).appearance.mode).toBe('light');
    await Promise.all([
      store.set({ appearance: { themeId: 'paper' } }),
      store.set({ appearance: { accent: '#abc' } }),
      store.set({ appearance: { mode: 'system' } }),
    ]);
    const saved = await new SettingsStore(home).get();
    expect(saved.appearance).toEqual({ themeId: 'paper', accent: '#AABBCC', mode: 'system' });
    expect(saved.models.scout?.model).toBe('m');
    await expect(store.set({ appearance: { accent: 'url(https://example.com)' } })).rejects.toThrow();
    await expect(store.set({ appearance: { themeId: 'unknown' } })).rejects.toThrow();
    await store.set({ theme: 'night' });
    expect((await store.get()).appearance).toEqual({ themeId: 'paper', accent: '#AABBCC', mode: 'dark' });
  });

  it('recovers a missing theme without discarding a valid accent or brightness', async () => {
    home = mkdtempSync(join(tmpdir(), 'orb-appearance-fallback-'));
    const store = new SettingsStore(home);
    writeFileSync(
      store.path,
      JSON.stringify({ appearance: { themeId: 'retired', accent: 'rose', mode: 'dark' } }),
    );
    expect((await store.get()).appearance).toEqual({ themeId: 'studio', accent: 'rose', mode: 'dark' });
  });
  it('merges per role, clears a role with null, keeps custom providers and the first-run flag', async () => {
    home = mkdtempSync(join(tmpdir(), 'orb-settings-'));
    const store = new SettingsStore(home);
    expect(await store.get()).toMatchObject({ customProviders: [], firstRunDone: false, models: {} });
    await store.set({ models: { scout: { provider: 'openai', model: 'gpt-6-luna' } } });
    await store.set({ models: { critic: { provider: 'deepseek', model: 'deepseek-v4-pro' } } });
    await store.update((s) => ({
      ...s,
      customProviders: [
        {
          id: 'my-ollama',
          baseURL: 'http://localhost:11434/v1',
          api: 'openai-completions',
          models: ['m'],
          noKey: true,
        },
      ],
    }));
    const next = await store.set({ models: { scout: null }, firstRunDone: true });
    expect(next.models).toEqual({ critic: { provider: 'deepseek', model: 'deepseek-v4-pro' } });
    expect(next.firstRunDone).toBe(true);
    const disk = JSON.parse(readFileSync(join(home, 'orb.json'), 'utf8'));
    expect(disk.customProviders).toHaveLength(1);
    expect(disk.models.scout).toBeUndefined();
  });
});
