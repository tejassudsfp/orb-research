/** P4.2 pure model-settings logic: tier defaults, failure mapping, secret scrubbing, custom provider schema. */
import { describe, expect, it } from 'vitest';
import {
  CustomProvider,
  customRouteProfile,
  defaultRouteFor,
  FAILURE_MESSAGES,
  failureKindOf,
  OrbSettingsPatch,
  PROVIDER_PRESETS,
  scrubSecrets,
} from '../src/index.js';

const harnessDefault = { provider: 'openai', model: 'gpt-6-luna' };
const local = CustomProvider.parse({
  id: 'my-ollama',
  baseURL: 'http://localhost:11434/v1',
  api: 'openai-completions',
  models: ['llama4', 'qwen3'],
  noKey: true,
});

describe('provider presets', () => {
  it('lists OpenAI first, then DeepSeek, Anthropic, OpenRouter; OpenAI is GPT Luna 6 on both tiers', () => {
    expect(PROVIDER_PRESETS.map((p) => p.id)).toEqual(['openai', 'deepseek', 'anthropic', 'openrouter']);
    expect(PROVIDER_PRESETS[0]).toMatchObject({ strong: 'gpt-6-luna', fast: 'gpt-6-luna', test: 'gpt-6-luna' });
  });
});

describe('defaultRouteFor', () => {
  it('keeps the harness default when its provider is usable', () => {
    expect(defaultRouteFor('scout', { harnessDefault, usable: ['openai', 'deepseek'], customs: [] })).toEqual({
      ...harnessDefault,
      source: 'default',
    });
  });
  it('falls back to the tier model of the first usable provider card', () => {
    const opts = { harnessDefault, usable: ['anthropic', 'deepseek'], customs: [] };
    expect(defaultRouteFor('orb', opts)).toEqual({ provider: 'deepseek', model: 'deepseek-v4-pro', source: 'tier' });
    expect(defaultRouteFor('scout', opts)).toEqual({ provider: 'deepseek', model: 'deepseek-flash', source: 'tier' });
    expect(defaultRouteFor('builder', { ...opts, usable: ['anthropic'] })).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      source: 'tier',
    });
  });
  it('then a usable custom provider, else the harness default', () => {
    expect(defaultRouteFor('critic', { harnessDefault, usable: ['my-ollama'], customs: [local] })).toEqual({
      provider: 'my-ollama',
      model: 'llama4',
      source: 'tier',
    });
    expect(defaultRouteFor('critic', { harnessDefault, usable: [], customs: [local] })).toEqual({
      ...harnessDefault,
      source: 'default',
    });
  });
});

describe('failureKindOf', () => {
  it('maps harness codes and HTTP statuses to plain classes', () => {
    expect(failureKindOf('AUTH')).toBe('invalid-key');
    expect(failureKindOf('INVALID_CREDENTIAL')).toBe('invalid-key');
    expect(failureKindOf('MISSING_CREDENTIAL')).toBe('no-key');
    expect(failureKindOf('QUOTA')).toBe('no-credit');
    expect(failureKindOf('ACCOUNT_QUOTA')).toBe('no-credit');
    expect(failureKindOf('RATE_LIMIT')).toBe('rate-limited');
    expect(failureKindOf('TRANSPORT')).toBe('unreachable');
    expect(failureKindOf('TIMEOUT')).toBe('unreachable');
    expect(failureKindOf('NO_ADAPTER')).toBe('not-configured');
    expect(failureKindOf('PI_AI_ERROR', 402)).toBe('no-credit');
    expect(failureKindOf('PI_AI_ERROR', 403)).toBe('invalid-key');
    expect(failureKindOf('PI_AI_ERROR', 503)).toBe('provider-error');
    expect(failureKindOf('PI_AI_ERROR')).toBe('unknown');
    expect(FAILURE_MESSAGES['no-credit']).toMatch(/credit/);
  });
});

describe('scrubSecrets', () => {
  it('removes the exact key and key-like tokens', () => {
    const key = 'abcdef0123456789abcdef';
    expect(scrubSecrets(`bad key ${key} here`, [key])).toBe('bad key [key] here');
    expect(scrubSecrets('Incorrect API key provided: sk-proj-AbC123xyz****wxyz.')).not.toMatch(/AbC123/);
    expect(scrubSecrets(`token ${'x'.repeat(48)}`)).toBe('token [redacted]');
  });
});

describe('custom providers', () => {
  it('validates ids, URLs and model lists, and maps to an llm-pi-ai route', () => {
    expect(CustomProvider.safeParse({ ...local, id: 'openai' }).success).toBe(false);
    expect(CustomProvider.safeParse({ ...local, id: 'My Ollama' }).success).toBe(false);
    expect(CustomProvider.safeParse({ ...local, baseURL: 'ftp://x' }).success).toBe(false);
    expect(CustomProvider.safeParse({ ...local, baseURL: 'http://u:p@x' }).success).toBe(false);
    expect(CustomProvider.safeParse({ ...local, models: [] }).success).toBe(false);
    expect(CustomProvider.safeParse({ ...local, models: ['a', 'a'] }).success).toBe(false);
    expect(customRouteProfile(local)).toEqual({
      api: 'openai-completions',
      baseURL: 'http://localhost:11434/v1',
      apiKeyEnv: 'ORB_MY_OLLAMA_API_KEY',
      models: [{ id: 'llama4' }, { id: 'qwen3' }],
    });
  });
  it('a settings patch can clear one agent pick with null', () => {
    expect(OrbSettingsPatch.parse({ models: { scout: null } })).toEqual({ models: { scout: null } });
    expect(OrbSettingsPatch.safeParse({ customProviders: [] }).success).toBe(false);
  });
});
