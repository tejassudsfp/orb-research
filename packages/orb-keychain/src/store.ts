/**
 * The Keychain storage behind Orb's credential provider (`@orb/host/keychain`), with no harness dependency.
 *
 * Layout: one generic-password item per secret, all under one Keychain service (`ai.orb.app` in the app, a
 * throwaway `ai.orb.app.test.*` service in tests):
 *   - a credential reference (an env-like name such as `OPENAI_API_KEY`) is the item whose account is that name;
 *   - a credential record (`<scope>/<id>`, e.g. `client-connection/browser-session`) is the item whose account is
 *     `record:<scope>/<id>` and whose password is the record as JSON.
 * The two account grammars are disjoint (a reference name never contains `:` or `/`).
 *
 * Every call is async (`AsyncEntry`, `findCredentialsAsync`), so a slow Keychain never blocks the event loop.
 * Values never reach a log or an error message from here.
 */
import { AsyncEntry, findCredentialsAsync } from '@napi-rs/keyring';

/** Prefix of a record item's account. */
export const RECORD_ACCOUNT_PREFIX = 'record:';
const REF_ACCOUNT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const refAccount = (ref: string): string => ref;
export const recordAccount = (key: string): string => `${RECORD_ACCOUNT_PREFIX}${key}`;

export type ParsedAccount =
  { kind: 'ref'; ref: string } | { kind: 'record'; key: string } | { kind: 'other' };

/** Classify one item's account in Orb's layout; anything else in the service is ignored. */
export function parseAccount(account: string): ParsedAccount {
  if (account.startsWith(RECORD_ACCOUNT_PREFIX))
    return { kind: 'record', key: account.slice(RECORD_ACCOUNT_PREFIX.length) };
  if (REF_ACCOUNT.test(account)) return { kind: 'ref', ref: account };
  return { kind: 'other' };
}

/** What the credential provider needs from a secret store; the Keychain in the app, a Map in unit tests. */
export interface SecretStore {
  /** Every item of the service: account and value. */
  list(): Promise<Array<{ account: string; value: string }>>;
  get(account: string): Promise<string | undefined>;
  set(account: string, value: string): Promise<void>;
  /** Resolves true when an item was removed, false when there was none. */
  delete(account: string): Promise<boolean>;
}

/** The macOS Keychain (through `@napi-rs/keyring`), one service. */
export class KeychainStore implements SecretStore {
  constructor(readonly service: string) {
    if (!service) throw new TypeError('KeychainStore: a service name is required');
  }

  async list(): Promise<Array<{ account: string; value: string }>> {
    const found = await findCredentialsAsync(this.service);
    return found.map((c) => ({ account: c.account, value: c.password }));
  }

  async get(account: string): Promise<string | undefined> {
    const value = await new AsyncEntry(this.service, account).getPassword();
    return value ?? undefined;
  }

  async set(account: string, value: string): Promise<void> {
    await new AsyncEntry(this.service, account).setPassword(value);
  }

  async delete(account: string): Promise<boolean> {
    return new AsyncEntry(this.service, account).deletePassword();
  }
}

/** In-memory store with the same contract (unit tests; never used by the app). */
export class MemoryStore implements SecretStore {
  readonly items = new Map<string, string>();
  async list() {
    return [...this.items].map(([account, value]) => ({ account, value }));
  }
  async get(account: string) {
    return this.items.get(account);
  }
  async set(account: string, value: string) {
    this.items.set(account, value);
  }
  async delete(account: string) {
    return this.items.delete(account);
  }
}

/** Remove every item of one service (test cleanup). Resolves with how many were removed. */
export async function clearService(store: SecretStore): Promise<number> {
  let removed = 0;
  for (const { account } of await store.list()) if (await store.delete(account)) removed += 1;
  return removed;
}
