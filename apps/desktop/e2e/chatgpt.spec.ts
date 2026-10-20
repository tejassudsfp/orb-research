/// <reference lib="dom" />
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { clearTestKeychain, keychainSet, newTestKeychainService } from '../../../scripts/testkit/keychain.ts';
import { liveWindow } from './support/ui.ts';

test('ChatGPT plan settings choose all agents, survive restart, and launch/cancel browser sign-in without exposing credentials', async () => {
  const home = mkdtempSync(join(tmpdir(), 'orb-chatgpt-ui-'));
  const service = newTestKeychainService('chatgpt-ui');
  let app: ElectronApplication | undefined;
  const launch = async () => {
    app = await electron.launch({
      args: [resolve(import.meta.dirname, '..')],
      env: {
        ...(process.env as Record<string, string>),
        ORB_DSH_HOME: join(home, 'dsh'),
        ORB_HOME: join(home, 'Orb'),
        ORB_USER_DATA: join(home, 'electron'),
        ORB_KEYCHAIN_SERVICE: service,
      },
    });
    const page = await liveWindow(app);
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await page.getByTestId('open-settings').click();
    return page;
  };
  try {
    await keychainSet(
      service,
      'ORB_CHATGPT_CONNECTIONS',
      JSON.stringify({
        hostId: 'urn:uuid:test-host',
        active: 'test-profile',
        welcomeSeen: false,
        profiles: [
          {
            id: 'test-profile',
            clientId: 'oaiapp_test',
            subject: 'test-person',
            email: 'plan@example.test',
            tokens: {
              access: 'plan-fixture-access',
              refresh: 'plan-fixture-refresh',
              id: 'plan-fixture-id-token',
              expiresAt: Date.now() + 3600_000,
              scopes: ['chatgpt.tokens.use.direct'],
            },
            models: [{ id: 'gpt-6-luna', name: 'GPT Luna' }],
          },
        ],
      }),
    );
    let page = await launch();
    const card = page.getByTestId('chatgpt-plan-card');
    await expect(page.getByRole('dialog', { name: 'You’re using your ChatGPT plan' })).toBeVisible();
    await page.getByRole('button', { name: 'Got it', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'You’re using your ChatGPT plan' })).not.toBeVisible();
    await expect(card.getByText('Plan enabled', { exact: true })).toBeVisible();
    expect((await card.locator('#chatgpt-account').boundingBox())?.height).toBe(40);
    await expect(card.getByRole('link', { name: 'Manage usage', exact: true })).toHaveAttribute(
      'href',
      'https://chatgpt.com/settings/usage',
    );
    await expect(card.getByRole('combobox', { name: 'Model for all agents' })).toContainText('GPT Luna');
    await card.getByRole('button', { name: 'Use for all agents' }).click();
    await expect
      .poll(() => JSON.parse(readFileSync(join(home, 'Orb', 'orb.json'), 'utf8')).models)
      .toEqual(
        Object.fromEntries(
          ['orb', 'scout', 'critic', 'builder'].map((role) => [
            role,
            { provider: 'chatgpt-plan', model: 'gpt-6-luna' },
          ]),
        ),
      );
    for (const select of await page.getByTestId('agent-model-select').all())
      await expect(select).toHaveValue('chatgpt-plan\u0001gpt-6-luna');
    expect(await page.content()).not.toMatch(
      /plan-fixture-access|plan-fixture-refresh|plan-fixture-id-token/,
    );
    await app!.close();
    app = undefined;
    page = await launch();
    await expect(page.getByRole('dialog', { name: 'You’re using your ChatGPT plan' })).not.toBeVisible();
    await expect(page.getByTestId('agent-model-select').first()).toHaveValue('chatgpt-plan\u0001gpt-6-luna');
    // Capture browser launch in main; no real browser, network identity provider or provider inference is used.
    await app!.evaluate(({ shell }) => {
      (globalThis as any).__chatgptOpened = false;
      shell.openExternal = async (value) => {
        const url = new URL(value);
        if (url.origin === 'https://auth.openai.com' && url.pathname === '/api/accounts/authorize')
          (globalThis as any).__chatgptOpened = true;
      };
    });
    await page.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click();
    await expect.poll(() => app!.evaluate(() => (globalThis as any).__chatgptOpened)).toBe(true);
    await expect(page.getByRole('button', { name: 'Cancel sign-in' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel sign-in' }).click();
    await expect(page.getByTestId('chatgpt-plan-card').getByRole('status')).toContainText('cancelled');
    const disk =
      readFileSync(join(home, 'Orb', 'orb.json'), 'utf8') +
      readFileSync(join(home, 'dsh', 'profiles', 'orb', 'cordis.patch.yml'), 'utf8') +
      readFileSync(join(home, 'logs', 'sidecar.log'), 'utf8');
    expect(disk).not.toMatch(/plan-fixture-access|plan-fixture-refresh|plan-fixture-id-token|id_token_hint=/);
    await page.screenshot({ path: resolve('.orb-dev/chatgpt-settings.png'), fullPage: true });
  } finally {
    await app?.close().catch(() => {});
    await clearTestKeychain(service);
    rmSync(home, { recursive: true, force: true });
  }
});
