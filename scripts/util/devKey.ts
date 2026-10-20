/**
 * Dev-only: put a provider key from the Keychain into THIS process's env for a live check (P4.1).
 *
 * Since P4.1 the dev key lives only in the Keychain (service `ai.orb.app`, account = the reference name, e.g.
 * `OPENAI_API_KEY`); the plaintext `.orb-dev/dsh/.credentials.yaml` is migrated and deleted when the dev sidecar
 * first runs. Live scripts (`pnpm egress-audit --mode live`, `scripts/live-scenario-a.ts`) call this when the
 * variable is not already set. The value is read through `@orb/keychain`'s CLI under the Electron binary (the item's
 * owner; plain node would block on a Keychain prompt), captured from a pipe, and only ever assigned to
 * `process.env[ref]`. It is never printed or logged.
 */
import { keychainCli } from '../testkit/keychain.ts';

export const DEV_KEYCHAIN_SERVICE = 'ai.orb.app';

/** Resolves true when `process.env[ref]` is set (already, or from the Keychain now). */
export async function ensureDevKey(ref: string): Promise<boolean> {
  if (process.env[ref]) return true;
  if (process.platform !== 'darwin') return false;
  const r = await keychainCli(['get', DEV_KEYCHAIN_SERVICE, ref]).catch(() => undefined);
  if (!r || r.code !== 0 || !r.stdout) return false;
  process.env[ref] = r.stdout;
  return true;
}
