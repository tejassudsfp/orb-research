/**
 * `pnpm macos-checks` (P1.12): print the sidecar-side macOS probe report (runtime Node version, Keychain round
 * trip via @napi-rs/keyring, dsh sandbox enforcement, global tool surface). Needs `pnpm build` first (the sidecar
 * loads the built @orb/* bundles). Contains no secret: the Keychain value is random and never printed.
 */
import { runMacosChecks } from './macos/checks.ts';

runMacosChecks().then(
  (report) => {
    console.log(JSON.stringify(report, null, 2));
  },
  (err: unknown) => {
    console.error((err as Error).message);
    process.exit(1);
  },
);
