import { cpus } from 'node:os';
import { defineConfig } from 'vitest/config';
import { testKeychainService, testNamespace } from './scripts/testkit/namespace.ts';

// P6.prep: a namespaced run shares the Mac with other worktrees' suites, so it uses half the cores and doubles the
// timeouts; without ORB_TEST_NAMESPACE nothing changes.
const shared = testNamespace() !== '';
const scale = shared ? 2 : 1;

export default defineConfig({
  test: {
    ...(shared ? { maxWorkers: Math.max(2, Math.floor(cpus().length / 2)) } : {}),
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'scripts/test/**/*.test.ts'],
    testTimeout: 60_000 * scale,
    hookTimeout: 120_000 * scale,
    // P4.1: anything a test launches defaults to a throwaway Keychain service, never the real `ai.orb.app` (where the
    // dev key lives). The testkit gives each sidecar its own service on top of this; teardown sweeps them all.
    // P6.prep: with ORB_TEST_NAMESPACE set the names (and the sweep) are scoped to that namespace.
    env: { ORB_KEYCHAIN_SERVICE: testKeychainService('vitest') },
    globalSetup: ['scripts/testkit/globalSetup.ts'],
  },
});
