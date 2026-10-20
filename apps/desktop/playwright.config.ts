import { defineConfig } from '@playwright/test';
import { namespaceSegments, testKeychainService } from '../../scripts/testkit/namespace.ts';

// Electron e2e. Run with `pnpm e2e` (builds first); each spec launches the built app (out/) with temp homes.

// Deterministic and offline: since P3.3 every canvas created from Home starts an Orb turn, and specs spread
// process.env into the app. A provider key exported in the developer's shell (e.g. OPENAI_API_KEY) would turn the
// specs that run without the mock LLM into real, billed requests to the provider. Strip every provider key here
// (this file is loaded by the runner and by each worker), so those turns end in `error` with no request sent.
for (const key of Object.keys(process.env)) {
  if (/_API_KEY$/.test(key)) delete process.env[key];
}
// P4.1: the same goes for keys in the Keychain. Every app run of the suite uses a throwaway Keychain service (the specs
// spread process.env into the app; the sidecar honours ORB_KEYCHAIN_SERVICE only for `ai.orb.app.test.*`), so it can
// never read the dev key in the real `ai.orb.app`. Global setup and teardown clear that service.
process.env.ORB_KEYCHAIN_SERVICE = testKeychainService('e2e');
// P4.2: most specs launch with no usable provider and expect Home; the first-run sheet would come first. The sidecar
// skips the sheet while ORB_SKIP_FIRST_RUN=1 (a test switch); models.spec.ts removes it to test the sheet itself.
process.env.ORB_SKIP_FIRST_RUN = '1';
// P6.9: the app window sits off-screen (apps/desktop/src/main/testWindow.ts), so real trackpad or mouse input during a
// run cannot move the board (the P4.gate pan flake). `ORB_E2E_VISIBLE=1` shows it, to watch a run.
if (process.env.ORB_E2E_VISIBLE !== '1') process.env.ORB_TEST_OFFSCREEN = '1';
else delete process.env.ORB_TEST_OFFSCREEN;
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/support/keychain.ts',
  globalTeardown: './e2e/support/keychain.ts',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: ['../../.orb-dev/e2e-results', ...namespaceSegments()].join('/'),
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});
