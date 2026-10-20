/**
 * P4.2 Models settings (PRD Models and API keys; BUILD_PLAN P4.2): provider cards, the Test button, custom providers,
 * model discovery, per-agent defaults by tier and the first-run decision. Pure: no harness imports.
 *
 *   orb/models.describe        {}                         → ModelsDescribeResult
 *   orb/keys.test              {request: KeysTestArgs}    → KeysTestResult      (ctx.llm.stream, maxTokens 1)
 *   orb/models.discover        {request: ModelsDiscoverArgs} → ModelsDiscoverResult (ctx.llm.discoverModels)
 *   orb/models.custom.set      {request: CustomProvider}  → ProviderInfo        (llm-pi-ai route, live)
 *   orb/models.custom.remove   {request: CustomRemoveArgs} → {removed: true}
 *
 * Provider routes live where dsh 0.2 reads them: the `llm-pi-ai` row's `providers` (a volatile field), written through
 * the harness settings service into the profile patch and applied without a restart. Custom providers are also kept in
 * orb.json (no secrets) so Orb can restate them after the profile template is rewritten at launch.
 */
import { z } from 'zod';
import { AgentName } from './board.js';
import { KeyDescriptor, KeyProviderId, KNOWN_KEY_PROVIDERS, keyRefFor } from './keys.js';

/** The wire protocols a custom endpoint may speak (llm-pi-ai `api`); Ollama speaks openai-completions. */
export const PROVIDER_APIS = ['openai-completions', 'openai-responses', 'anthropic-messages'] as const;
export const ProviderApi = z.enum(PROVIDER_APIS);
export type ProviderApi = z.infer<typeof ProviderApi>;

export const PROVIDER_API_LABELS: Record<ProviderApi, string> = {
  'openai-completions': 'OpenAI chat completions',
  'openai-responses': 'OpenAI responses',
  'anthropic-messages': 'Anthropic messages',
};

/** The agents in display order (Orb, Scout, Critic, Builder). */
export const AGENT_NAMES_ORDERED: readonly AgentName[] = AgentName.options;

/** Model tiers (PRD Agents › Default model tier). */
export type ModelTier = 'strong' | 'fast';
export const AGENT_TIERS: Record<AgentName, ModelTier> = {
  orb: 'strong',
  scout: 'fast',
  critic: 'strong',
  builder: 'strong',
};

/** A provider card Orb knows by name: an `llm-pi-ai` catalog route with its key reference and tier defaults. */
export type ProviderPreset = {
  id: 'openai' | 'deepseek' | 'anthropic' | 'openrouter';
  label: string;
  /** The credential reference the route's `apiKeyEnv` names (same as KNOWN_KEY_PROVIDERS). */
  ref: string;
  strong: string;
  fast: string;
  /** The model the Test button asks for one token. */
  test: string;
  /** Where to get a key (opened in the browser). */
  keyUrl: string;
};

/**
 * Provider cards in display order. OpenAI comes first and is the default (user decision, 2026-10-14: GPT Luna 6 for
 * every agent); DeepSeek, Anthropic and OpenRouter are implemented and verified against the mock LLM only.
 * Model ids are from pi-ai's installed catalog (`@earendil-works/pi-ai/dist/providers/data/*.json`).
 */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    ref: 'OPENAI_API_KEY',
    strong: 'gpt-6-luna',
    fast: 'gpt-6-luna',
    test: 'gpt-6-luna',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    ref: 'DEEPSEEK_API_KEY',
    strong: 'deepseek-v4-pro',
    fast: 'deepseek-flash',
    test: 'deepseek-flash',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    ref: 'ANTHROPIC_API_KEY',
    strong: 'claude-sonnet-5',
    fast: 'claude-haiku-4-5',
    test: 'claude-haiku-4-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    ref: 'OPENROUTER_API_KEY',
    strong: 'openai/gpt-6-luna',
    fast: 'deepseek/deepseek-v4-flash',
    test: 'deepseek/deepseek-v4-flash',
    keyUrl: 'https://openrouter.ai/settings/keys',
  },
];

export const presetOf = (id: string): ProviderPreset | undefined => PROVIDER_PRESETS.find((p) => p.id === id);

/** The placeholder key Orb stores for a custom provider marked "no key needed" (PRD Models › Custom provider). */
export const NO_KEY_PLACEHOLDER = 'orb-no-key';

const reservedIds = new Set([...KNOWN_KEY_PROVIDERS.map((p) => p.provider), 'chatgpt-plan']);

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'an http or https URL without user info');

/** A custom provider (PRD: any endpoint speaking OpenAI chat completions, OpenAI responses or Anthropic messages). */
export const CustomProvider = z.strictObject({
  /** Lowercase letters, digits and hyphens; permanent (it names the route and the key). */
  id: KeyProviderId.refine((id) => !reservedIds.has(id), 'this id belongs to a built-in provider'),
  label: z.string().trim().min(1).max(60).optional(),
  baseURL: httpUrl,
  api: ProviderApi,
  models: z
    .array(z.string().trim().min(1).max(200))
    .min(1, 'at least one model id')
    .max(4000)
    .refine((ids) => new Set(ids).size === ids.length, 'model ids must be unique'),
  /** Local servers: Orb stores a placeholder key. */
  noKey: z.boolean().default(false),
});
export type CustomProvider = z.infer<typeof CustomProvider>;
export type CustomProviderInput = z.input<typeof CustomProvider>;

/** The `llm-pi-ai` provider profile Orb writes for a custom provider. */
export function customRouteProfile(p: CustomProvider): Record<string, unknown> {
  return {
    api: p.api,
    baseURL: p.baseURL,
    apiKeyEnv: keyRefFor(p.id),
    ...(p.label ? { displayName: p.label } : {}),
    models: p.models.map((id) => ({ id })),
  };
}

// ---- Test results ----

/** Plain failure classes of a Test (PRD: invalid key, no credit, rate limited, unreachable). */
export const TestFailureKind = z.enum([
  'no-key',
  'invalid-key',
  'no-credit',
  'rate-limited',
  'unreachable',
  'bad-request',
  'provider-error',
  'not-configured',
  'unknown',
]);
export type TestFailureKind = z.infer<typeof TestFailureKind>;

export const FAILURE_MESSAGES: Record<TestFailureKind, string> = {
  'no-key': 'No key is set for this provider.',
  'invalid-key': 'The key was rejected. Check that it is correct and active.',
  'no-credit': 'The account has no credit left. Add credit with the provider.',
  'rate-limited': 'The provider is rate limiting this key. Try again in a minute.',
  unreachable: 'The provider could not be reached. Check the network or the base URL.',
  'bad-request': 'The provider rejected the test request. Check the model id.',
  'provider-error': 'The provider had an internal error. Try again later.',
  'not-configured': 'This provider is not configured.',
  unknown: 'The test failed.',
};

/**
 * Map a harness failure (dsh-llm `LlmFailure` code + HTTP status) to a plain failure class. Codes: dsh-llm
 * (`MISSING_CREDENTIAL`, `INVALID_CREDENTIAL`, `QUOTA`, `ACCOUNT_QUOTA`, `NO_ADAPTER`, …) and llm-pi-ai's
 * `classifyPiAiError` (`AUTH`, `QUOTA`, `RATE_LIMIT`, `INVALID_REQUEST`, `SERVER`, `TIMEOUT`, `TRANSPORT`).
 */
export function failureKindOf(code: string | undefined, status?: number): TestFailureKind {
  switch (code) {
    case 'MISSING_CREDENTIAL':
      return 'no-key';
    case 'AUTH':
    case 'INVALID_CREDENTIAL':
      return 'invalid-key';
    case 'QUOTA':
    case 'ACCOUNT_QUOTA':
      return 'no-credit';
    case 'RATE_LIMIT':
      return 'rate-limited';
    case 'TRANSPORT':
    case 'TIMEOUT':
      return 'unreachable';
    case 'INVALID_REQUEST':
    case 'UNSUPPORTED_REASONING_EFFORT':
    case 'CONTEXT_WINDOW_EXCEEDED':
      return 'bad-request';
    case 'SERVER':
      return 'provider-error';
    case 'NO_ADAPTER':
      return 'not-configured';
  }
  if (status === 401 || status === 403) return 'invalid-key';
  if (status === 402) return 'no-credit';
  if (status === 429) return 'rate-limited';
  if (status === 400 || status === 404 || status === 422) return 'bad-request';
  if (status !== undefined && status >= 500) return 'provider-error';
  return 'unknown';
}

export const ProviderTestState = z.enum(['not-set', 'untested', 'working', 'failed']);
export type ProviderTestState = z.infer<typeof ProviderTestState>;

export const ProviderTestStatus = z.strictObject({
  state: ProviderTestState,
  kind: TestFailureKind.optional(),
  /** Plain message (failed), with the provider's own detail when it adds something. Never a key. */
  message: z.string().max(600).optional(),
  /** The model the last test used. */
  model: z.string().optional(),
  /** When the last test ran, ms since epoch. */
  at: z.number().optional(),
});
export type ProviderTestStatus = z.infer<typeof ProviderTestStatus>;

export const KeysTestArgs = z.strictObject({
  provider: KeyProviderId,
  /** Default: the provider's test model (preset) or its first model (custom). */
  model: z.string().trim().min(1).max(200).optional(),
});
export type KeysTestArgs = z.infer<typeof KeysTestArgs>;

export const KeysTestResult = z.strictObject({
  provider: KeyProviderId,
  model: z.string(),
  ok: z.boolean(),
  status: ProviderTestStatus,
  /** The harness failure code (e.g. `AUTH`), when it failed. */
  code: z.string().optional(),
  ms: z.number().nonnegative(),
});
export type KeysTestResult = z.infer<typeof KeysTestResult>;

// ---- Discovery ----

export const ModelsDiscoverArgs = z.union([
  z.strictObject({ provider: KeyProviderId }),
  /** A draft endpoint: only an explicitly typed one-shot key is sent; no stored key is reused for an edited URL. */
  z.strictObject({
    baseURL: httpUrl,
    api: ProviderApi,
    apiKey: z.string().trim().min(1).max(8192).optional(),
  }),
]);
export type ModelsDiscoverArgs = z.infer<typeof ModelsDiscoverArgs>;

export const DiscoveredModel = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(500).optional(),
  contextWindow: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  inputModalities: z.array(z.enum(['text', 'image'])).optional(),
  created: z.number().nonnegative().optional(),
});
export type DiscoveredModel = z.infer<typeof DiscoveredModel>;

export const ModelsDiscoverResult = z.strictObject({ models: z.array(DiscoveredModel) });
export type ModelsDiscoverResult = z.infer<typeof ModelsDiscoverResult>;

/** Provider-issued metadata only. Keys are kept separately in the Keychain. Endpoint identity prevents reuse after edits. */
export const SavedModelCatalog = z.object({
  baseURL: httpUrl,
  api: ProviderApi,
  fetchedAt: z.number().nonnegative(),
  models: z.array(DiscoveredModel).max(4000),
  /** Preserve metadata for up to four saved agent selections that a later listing omits. */
  retained: z.array(DiscoveredModel).max(4).default([]),
});
export type SavedModelCatalog = z.infer<typeof SavedModelCatalog>;

export const CustomRemoveArgs = z.strictObject({ id: KeyProviderId });
export type CustomRemoveArgs = z.infer<typeof CustomRemoveArgs>;

// ---- Describe ----

const Route = z.strictObject({ provider: z.string(), model: z.string() });

export const ProviderKind = z.enum(['catalog', 'custom', 'route']);
export type ProviderKind = z.infer<typeof ProviderKind>;

export const ProviderInfo = z.strictObject({
  id: z.string(),
  label: z.string(),
  /** `catalog`: a provider card (OpenAI, DeepSeek, …); `custom`: the user's endpoint; `route`: any other configured route. */
  kind: ProviderKind,
  /** The route is present in llm-pi-ai's live `providers`. */
  routed: z.boolean(),
  ref: z.string(),
  noKey: z.boolean(),
  /** Redacted descriptor of the key (absent for a route whose reference is not a provider id). */
  key: KeyDescriptor.optional(),
  /** A key is available (or none is needed): agents can use this provider. */
  usable: z.boolean(),
  status: ProviderTestStatus,
  testModel: z.string().optional(),
  /** Models offered in the per-agent picker (catalog list, or the custom provider's ids). */
  models: z.array(z.string()),
  modelNames: z.record(z.string(), z.string()).optional(),
  modelListing: z
    .object({ source: z.enum(['bundled', 'provider']), fetchedAt: z.number().optional() })
    .optional(),
  keyUrl: z.string().optional(),
  custom: CustomProvider.optional(),
});
export type ProviderInfo = z.infer<typeof ProviderInfo>;

export const EffectiveRoute = z.strictObject({
  provider: z.string(),
  model: z.string(),
  /** `chosen`: orb.json; `default`: the harness default model; `tier`: the tier default of the first usable provider. */
  source: z.enum(['chosen', 'default', 'tier']),
});
export type EffectiveRoute = z.infer<typeof EffectiveRoute>;

export const ModelsDescribeResult = z.strictObject({
  providers: z.array(ProviderInfo),
  /** `agent-default-model` (the Orb profile: openai/gpt-6-luna). */
  harnessDefault: Route,
  /** orb.json picks per agent. */
  chosen: z.partialRecord(AgentName, Route),
  /** What each agent starts on next. */
  effective: z.record(AgentName, EffectiveRoute),
  /** At least one provider has a key (or needs none). */
  anyUsable: z.boolean(),
  /** Show the first-run sheet before Home: nothing usable and the sheet was never finished or skipped. */
  firstRun: z.boolean(),
});
export type ModelsDescribeResult = z.infer<typeof ModelsDescribeResult>;

/**
 * The route an agent starts on when orb.json names none (PRD: sensible defaults per tier):
 * - the harness default model when its provider is usable (OpenAI GPT Luna 6 in the Orb profile);
 * - else the tier model of the first usable provider card (OpenAI, DeepSeek, Anthropic, OpenRouter), then the first
 *   model of the first usable custom provider;
 * - else the harness default (the turn then fails with "no key", before any request leaves the Mac).
 */
export function defaultRouteFor(
  role: AgentName,
  opts: {
    harnessDefault: { provider: string; model: string };
    /** Usable provider ids. */
    usable: readonly string[];
    customs: readonly CustomProvider[];
  },
): EffectiveRoute {
  const usable = new Set(opts.usable);
  if (usable.has(opts.harnessDefault.provider)) return { ...opts.harnessDefault, source: 'default' };
  for (const preset of PROVIDER_PRESETS) {
    if (usable.has(preset.id))
      return { provider: preset.id, model: preset[AGENT_TIERS[role]], source: 'tier' };
  }
  for (const custom of opts.customs) {
    if (usable.has(custom.id) && custom.models[0])
      return { provider: custom.id, model: custom.models[0], source: 'tier' };
  }
  return { ...opts.harnessDefault, source: 'default' };
}

/**
 * Remove anything key-like from a provider's error text before it crosses the wire: the exact key when known, and
 * `sk-…`-style tokens or long opaque strings.
 */
export function scrubSecrets(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const secret of secrets) if (secret && secret.length >= 6) out = out.split(secret).join('[key]');
  out = out.replace(/\b(?:sk|pk|rk|key|tvly|sess)[-_][A-Za-z0-9_\-*.]{6,}/gi, '[key]');
  out = out.replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted]');
  return out.slice(0, 600);
}
