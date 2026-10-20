/**
 * @orb/keychain: the macOS Keychain, through `@napi-rs/keyring` (exact-pinned).
 *
 * Phase 1 (P1.12) only proves the native module loads in the sidecar runtime (Electron-as-Node) and can set,
 * get and delete an item without a prompt. The real key store (Settings → API keys, CredentialProvider) is
 * Phase 4. Secrets are never logged: `keyringRoundTrip` reports only booleans and timings.
 */
import { randomBytes } from 'node:crypto';
import { Entry } from '@napi-rs/keyring';

export const name = '@orb/keychain';

/** Keychain service of Orb's real items (Phase 4). */
export const KEYCHAIN_SERVICE = 'ai.orb.app';
/** Keychain service of the P1.12 spike item. Never holds a real secret. */
export const KEYCHAIN_SPIKE_SERVICE = 'ai.orb.app.spike';
/** Prefix of the throwaway services tests and e2e runs use (never the real `ai.orb.app`). */
export const KEYCHAIN_TEST_SERVICE_PREFIX = 'ai.orb.app.test.';
/** Env var naming a test service for one sidecar or app run (testkit, e2e). */
export const KEYCHAIN_SERVICE_ENV = 'ORB_KEYCHAIN_SERVICE';

/**
 * The Keychain service a sidecar uses: `ai.orb.app`, unless `ORB_KEYCHAIN_SERVICE` names a test service
 * (`ai.orb.app.test.*`). Any other override is ignored, so no env var can point the app at a foreign service.
 */
export function resolveKeychainService(env: Record<string, string | undefined> = process.env): string {
  const override = env[KEYCHAIN_SERVICE_ENV]?.trim();
  return override && isTestService(override) ? override : KEYCHAIN_SERVICE;
}

/** A service tests may create and clear: `ai.orb.app.test.<suffix>` or the spike service. */
export function isTestService(service: string): boolean {
  return (
    service === KEYCHAIN_SPIKE_SERVICE ||
    (service.startsWith(KEYCHAIN_TEST_SERVICE_PREFIX) && service.length > KEYCHAIN_TEST_SERVICE_PREFIX.length)
  );
}

export * from './store.js';
export * from './redact.js';

export type KeyringRoundTrip = {
  service: string;
  account: string;
  /** setPassword returned without throwing. */
  set: boolean;
  /** getPassword returned exactly the value that was set. */
  getMatches: boolean;
  /** deletePassword returned true. */
  deleted: boolean;
  /** getPassword after the delete found nothing (null/undefined or a "no entry" error). */
  goneAfterDelete: boolean;
  /** Wall time of each call, ms (a Keychain prompt would show up as a long or hanging call). */
  ms: { set: number; get: number; delete: number; getAfterDelete: number };
};

function timed<T>(fn: () => T): [T, number] {
  const t0 = performance.now();
  const value = fn();
  return [value, Math.round((performance.now() - t0) * 10) / 10];
}

/**
 * Set, read back and delete one throwaway item (`service` / `account`, random value). The item is deleted even
 * when a step fails.
 */
export function keyringRoundTrip(
  service: string = KEYCHAIN_SPIKE_SERVICE,
  account = `probe-${process.pid}-${Date.now()}`,
): KeyringRoundTrip {
  const entry = new Entry(service, account);
  const value = randomBytes(24).toString('base64url');
  let deleted = false;
  try {
    const [, setMs] = timed(() => entry.setPassword(value));
    const [got, getMs] = timed(() => entry.getPassword());
    const [del, deleteMs] = timed(() => entry.deletePassword());
    deleted = del === true;
    const [after, afterMs] = timed(() => {
      try {
        return entry.getPassword() ?? null;
      } catch {
        return null;
      }
    });
    return {
      service,
      account,
      set: true,
      getMatches: got === value,
      deleted,
      goneAfterDelete: after === null,
      ms: { set: setMs, get: getMs, delete: deleteMs, getAfterDelete: afterMs },
    };
  } finally {
    if (!deleted) {
      try {
        entry.deletePassword();
      } catch {
        // already gone
      }
    }
  }
}
