/**
 * P6.prep: parallel-safe test namespaces. Several git worktrees can run the suites at the same time on one Mac when each
 * sets its own `ORB_TEST_NAMESPACE` (lowercase letters, digits, hyphens). Empty (the default) keeps the single-run
 * behaviour exactly. The namespace scopes what is shared machine-wide: Keychain service names (and the sweep that
 * removes them) and the e2e results directories. Everything else is already unique per run: temp homes come from
 * `mkdtemp`, servers listen on port 0, and Electron has no single-instance lock in test runs.
 *
 * `ORB_SKIP_TIMING=1` skips only timing-sensitive assertions (fps, stop-timing budgets, startup and export-time
 * budgets) so a loaded machine running several suites at once does not fail on wall-clock noise. Nothing else changes.
 *
 * Dependency-free: imported by vitest.config.ts and playwright.config.ts.
 */

const NS_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** The validated namespace, or '' when unset. Throws on a malformed one (it ends up in Keychain service names). */
export function testNamespace(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.ORB_TEST_NAMESPACE?.trim() ?? '';
  if (raw === '') return '';
  if (!NS_RE.test(raw))
    throw new Error(
      'ORB_TEST_NAMESPACE must be 1-32 chars of a-z, 0-9 and "-" (it is part of Keychain service names)',
    );
  return raw;
}

export const TEST_KEYCHAIN_PREFIX = 'ai.orb.app.test.';

/** `ai.orb.app.test.` or `ai.orb.app.test.<ns>.`: the prefix of every Keychain service this run may create or sweep. */
export function testKeychainPrefix(env: NodeJS.ProcessEnv = process.env): string {
  const ns = testNamespace(env);
  return ns ? `${TEST_KEYCHAIN_PREFIX}${ns}.` : TEST_KEYCHAIN_PREFIX;
}

/** A fixed test service name, e.g. `ai.orb.app.test.e2e` or `ai.orb.app.test.<ns>.e2e`. */
export function testKeychainService(name: string, env: NodeJS.ProcessEnv = process.env): string {
  return `${testKeychainPrefix(env)}${name}`;
}

/** Path segments to append for namespaced output directories ([] when no namespace). */
export function namespaceSegments(env: NodeJS.ProcessEnv = process.env): string[] {
  const ns = testNamespace(env);
  return ns ? [ns] : [];
}

/** True when timing-sensitive assertions should be skipped (ORB_SKIP_TIMING=1). */
export function skipTiming(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ORB_SKIP_TIMING === '1';
}

/** Run a timing-sensitive assertion block unless ORB_SKIP_TIMING=1. */
export function timingExpect(check: () => void): void {
  if (!skipTiming()) check();
}
