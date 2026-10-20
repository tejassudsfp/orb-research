/**
 * P4.1 keys wire (BUILD_PLAN §2.3 Keys; PRD Models › Security). Raw keys travel one way only: the UI sends a key once
 * with `orb/keys.set` over the authenticated loopback; every answer is a redacted descriptor
 * (`{provider, configured, redacted: 'sk-...4f2a'}`), never the value.
 *
 *   orb/keys.describe {request?: KeysDescribeArgs}  → KeysDescribeResult
 *   orb/keys.set      {request: KeysSetArgs}        → KeyDescriptor
 *   orb/keys.unset    {request: KeysUnsetArgs}      → KeyDescriptor
 */
import { z } from 'zod';

/** A provider id: an llm-pi-ai route (`openai`, a custom `my-ollama`) or a search provider (`brave`, `tavily`). */
export const KeyProviderId = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,47}$/, 'lowercase letters, digits and hyphens');
export type KeyProviderId = z.infer<typeof KeyProviderId>;

export type KnownKeyProvider = {
  provider: string;
  /** The credential reference (env-like name) the harness resolves. */
  ref: string;
  label: string;
  /** `model`: an LLM provider card; `search`: Scout's search provider key. */
  kind: 'model' | 'search';
};

/** The providers Orb knows by name, with the references their routes use (the Orb profile and P4.2 cards). */
export const KNOWN_KEY_PROVIDERS: readonly KnownKeyProvider[] = [
  { provider: 'deepseek', ref: 'DEEPSEEK_API_KEY', label: 'DeepSeek', kind: 'model' },
  { provider: 'anthropic', ref: 'ANTHROPIC_API_KEY', label: 'Anthropic', kind: 'model' },
  { provider: 'openai', ref: 'OPENAI_API_KEY', label: 'OpenAI', kind: 'model' },
  { provider: 'openrouter', ref: 'OPENROUTER_API_KEY', label: 'OpenRouter', kind: 'model' },
  { provider: 'brave', ref: 'BRAVE_API_KEY', label: 'Brave Search', kind: 'search' },
  { provider: 'tavily', ref: 'TAVILY_API_KEY', label: 'Tavily', kind: 'search' },
  { provider: 'parallel', ref: 'PARALLEL_API_KEY', label: 'Parallel', kind: 'search' },
];

const CUSTOM_REF = /^ORB_([A-Z][A-Z0-9_]*)_API_KEY$/;

/**
 * The credential reference of a provider: the known name for a known provider, else `ORB_<ID>_API_KEY` (a custom
 * provider `my-ollama` → `ORB_MY_OLLAMA_API_KEY`; P4.2 writes this name as the custom route's `apiKeyEnv`).
 */
export function keyRefFor(provider: string): string {
  const known = KNOWN_KEY_PROVIDERS.find((p) => p.provider === provider);
  if (known) return known.ref;
  return `ORB_${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
}

/** The custom provider id behind an `ORB_<ID>_API_KEY` reference, or undefined. */
export function customProviderOfRef(ref: string): string | undefined {
  const m = CUSTOM_REF.exec(ref);
  if (!m) return undefined;
  const id = m[1]!.toLowerCase().replace(/_/g, '-');
  return KeyProviderId.safeParse(id).success && !KNOWN_KEY_PROVIDERS.some((p) => p.provider === id)
    ? id
    : undefined;
}

/** Where a configured key comes from: the launch environment (read-only), the Keychain, or a not-yet-migrated file. */
export const KeySource = z.enum(['env', 'keychain', 'file']);
export type KeySource = z.infer<typeof KeySource>;

export const KeyDescriptor = z.strictObject({
  provider: KeyProviderId,
  ref: z.string(),
  configured: z.boolean(),
  source: KeySource.optional(),
  /** False while the launch environment supplies the key (set/unset would be shadowed). */
  writable: z.boolean(),
  /** e.g. `sk-...4f2a`; present only when configured. Never the key. */
  redacted: z.string().max(24).optional(),
});
export type KeyDescriptor = z.infer<typeof KeyDescriptor>;

export const KeysDescribeArgs = z
  .strictObject({
    /** Extra providers to describe (custom providers from settings); known ones are always described. */
    providers: z.array(KeyProviderId).max(64).optional(),
  })
  .optional();
export type KeysDescribeArgs = z.infer<typeof KeysDescribeArgs>;

export const KeysDescribeResult = z.strictObject({ keys: z.array(KeyDescriptor) });
export type KeysDescribeResult = z.infer<typeof KeysDescribeResult>;

export const KeysSetArgs = z.strictObject({
  provider: KeyProviderId,
  /** The raw key, sent once. No whitespace inside; surrounding whitespace (a paste) is trimmed. */
  key: z.string().trim().min(1, 'empty key').max(4096).regex(/^\S+$/, 'a key has no spaces'),
});
export type KeysSetArgs = z.infer<typeof KeysSetArgs>;

export const KeysUnsetArgs = z.strictObject({ provider: KeyProviderId });
export type KeysUnsetArgs = z.infer<typeof KeysUnsetArgs>;

/**
 * P6.2: the state of orb-keychain's read of the macOS Keychain (`orb/keys.keychain`). `waiting`: unanswered for a
 * while, most likely behind a macOS access prompt; the Home screens then ask the user to answer it.
 */
export const KeychainState = z.enum(['loading', 'waiting', 'ready', 'failed']);
export type KeychainState = z.infer<typeof KeychainState>;
export const KeychainStatus = z.strictObject({
  state: KeychainState,
  waitingMs: z.number().int().nonnegative(),
});
export type KeychainStatus = z.infer<typeof KeychainStatus>;

/**
 * P6.2: the stderr lines (no secrets) orb-keychain writes when the Keychain read has been waiting a while and when it
 * is answered. Electron main reads them off the sidecar's stderr to tell the warming-up Home.
 */
export const KEYCHAIN_WAITING_LINE = 'orb-keychain: waiting for the macOS Keychain (an access prompt may be open)';
export const KEYCHAIN_READY_LINE = 'orb-keychain: the macOS Keychain answered';
