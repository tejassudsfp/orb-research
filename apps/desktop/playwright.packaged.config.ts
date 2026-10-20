import { defineConfig } from '@playwright/test';
import { namespaceSegments } from '../../scripts/testkit/namespace.ts';

// P5.4: the PACKAGED app. `pnpm e2e:packaged` checks the dmg `pnpm dist` produced (release/dist/Orb-<version>-arm64.dmg,
// or ORB_DMG): it mounts it, copies Orb.app to a temp folder, launches it with Playwright and drives it offline (the
// mock LLM through a custom provider). Kept apart from `pnpm e2e` because it needs the dmg, which takes minutes to
// build.

// As in playwright.config.ts: no provider key from the developer's shell ever reaches the app.
for (const key of Object.keys(process.env)) {
  if (/_API_KEY$/.test(key)) delete process.env[key];
}
// A fresh install shows the first-run sheet; this spec checks that, so the e2e switch is never set here.
delete process.env.ORB_SKIP_FIRST_RUN;
export default defineConfig({
  testDir: './e2e-packaged',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: ['../../.orb-dev/e2e-packaged-results', ...namespaceSegments()].join('/'),
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});
