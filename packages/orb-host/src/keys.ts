/**
 * P4.1 keys endpoints behind `orb/keys.*` (remote.ts): describe, set and unset provider keys through the one
 * `ctx.credentials` (the Keychain provider, keychain.ts). The raw value is read only to redact it here, in the
 * sidecar; what crosses the wire is a {@link KeyDescriptor} (`sk-...4f2a`), never the key.
 */
import {
  customProviderOfRef,
  KNOWN_KEY_PROVIDERS,
  KeyDescriptor,
  keyRefFor,
  type KeySource,
  type KeysDescribeArgs,
  type KeysDescribeResult,
  type KeysSetArgs,
  type KeysUnsetArgs,
} from '@orb/shared';
import { redactKey } from '@orb/keychain';

/** The part of `ctx.credentials` the keys endpoints use (refs are branded strings in the harness). */
export type CredentialsLike = {
  resolve(ref: any): Promise<{ value: string; source: string } | undefined>;
  describe(ref: any): Promise<{ configured: boolean; source?: string; writable: boolean }>;
  set(ref: any, value: string): Promise<void>;
  unset(ref: any): Promise<void>;
  /** OrbKeychainCredentialProvider only: stored reference names (to list custom providers). */
  storedRefs?: () => Promise<string[]>;
  /** OrbKeychainCredentialProvider only (P6.2): the state of its Keychain read. */
  keychainStatus?: () => { state: string; waitingMs: number };
};

/** Thrown when the launch environment supplies the key read-only. */
export class KeyShadowedError extends Error {
  constructor(readonly provider: string) {
    super(
      `the ${provider} key comes from the environment orb was started from, so it cannot be changed here`,
    );
  }
}

const SOURCES: readonly string[] = ['env', 'keychain', 'file'];

export async function describeKey(credentials: CredentialsLike, provider: string): Promise<KeyDescriptor> {
  const ref = keyRefFor(provider);
  const info = await credentials.describe(ref);
  const descriptor: KeyDescriptor = { provider, ref, configured: info.configured, writable: info.writable };
  if (info.source && SOURCES.includes(info.source)) descriptor.source = info.source as KeySource;
  if (info.configured) {
    const resolved = await credentials.resolve(ref);
    if (resolved) descriptor.redacted = redactKey(resolved.value);
  }
  return KeyDescriptor.parse(descriptor);
}

export async function describeKeys(
  credentials: CredentialsLike,
  args: KeysDescribeArgs,
): Promise<KeysDescribeResult> {
  const providers = new Set(KNOWN_KEY_PROVIDERS.map((p) => p.provider));
  for (const ref of (await credentials.storedRefs?.()) ?? []) {
    const custom = customProviderOfRef(ref);
    if (custom) providers.add(custom);
  }
  for (const p of args?.providers ?? []) providers.add(p);
  const keys = await Promise.all([...providers].map((p) => describeKey(credentials, p)));
  return { keys };
}

export async function setKey(credentials: CredentialsLike, args: KeysSetArgs): Promise<KeyDescriptor> {
  const ref = keyRefFor(args.provider);
  const info = await credentials.describe(ref);
  if (!info.writable) throw new KeyShadowedError(args.provider);
  await credentials.set(ref, args.key);
  return describeKey(credentials, args.provider);
}

export async function unsetKey(credentials: CredentialsLike, args: KeysUnsetArgs): Promise<KeyDescriptor> {
  const ref = keyRefFor(args.provider);
  const info = await credentials.describe(ref);
  if (!info.writable) throw new KeyShadowedError(args.provider);
  await credentials.unset(ref);
  return describeKey(credentials, args.provider);
}
