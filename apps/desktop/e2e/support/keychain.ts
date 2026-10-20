/**
 * Playwright global setup and teardown (P4.1): clear the suite's throwaway Keychain service
 * (`ai.orb.app.test.e2e`, set in playwright.config.ts) so each run starts and ends with no keys in it.
 */
import { clearTestKeychain } from '../../../../scripts/testkit/keychain.ts';

export default async function keychainReset(): Promise<void> {
  const service = process.env.ORB_KEYCHAIN_SERVICE;
  if (process.platform !== 'darwin' || !service?.startsWith('ai.orb.app.test.')) return;
  await clearTestKeychain(service);
}
