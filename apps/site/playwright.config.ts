import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 90_000,
  outputDir: '../../.orb-dev/site-test-results',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4179', viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: 'pnpm exec vite build --outDir ../../.orb-dev/site-test-build && pnpm exec tsx e2e/server.ts',
    env: {
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_orb_site_test_fixture',
      NEXT_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com',
    },
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: false,
  },
});
