/**
 * Vitest global setup.
 *
 * P5.5: Electron 44 has no postinstall: `require('electron')` downloads and unpacks the binary the first time it is
 * missing (node_modules/electron/index.js). On a fresh checkout (CI) several test workers booting sidecars at once
 * each started that download and unpacked over each other, and a sidecar launched mid-unpack died in dyld ("Electron
 * Framework … load command content extends beyond end of file"). Resolving it here, once, before any worker starts,
 * makes the download happen exactly once.
 *
 * P4.1: teardown removes every `ai.orb.app.test.*` Keychain service left behind (a test that crashed before its
 * cleanup), so test runs never accumulate Keychain items. The real `ai.orb.app` is never touched.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { sweepTestKeychains } from './keychain.ts';

export default function setup(): () => Promise<void> {
  const electron = createRequire(import.meta.url)('electron') as string;
  if (!existsSync(electron)) throw new Error(`globalSetup: the Electron binary is missing (${electron})`);
  return async () => {
    if (process.platform !== 'darwin') return;
    await sweepTestKeychains();
  };
}
