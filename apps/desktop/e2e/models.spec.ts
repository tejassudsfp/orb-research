/// <reference lib="dom" />
/**
 * P4.2 Models settings in the real window (mock LLM only; no real key, no network). Every provider card's catalog
 * route points at the local mock (route-level baseURL), the harness default is OpenAI GPT Luna 6 as in the Orb
 * profile, and no key exists at launch:
 *   - the first-run sheet comes before Home; OpenAI is preselected; a key saved there is tested at once (Working) and
 *     Continue goes Home, which no longer says a key is needed;
 *   - Settings: provider cards with redacted keys and statuses; a DeepSeek key → Working; a failing test (the mock
 *     answers 401) → Failed with the plain message; Remove key → Not set;
 *   - a custom provider with no key (like Ollama): Find models lists the endpoint's models, Save makes it Working
 *     with no restart;
 *   - the per-agent picker writes orb.json and survives a relaunch; after the relaunch the first-run sheet is not
 *     shown again (finished) and the custom provider is still there;
 *   - DSH_HOME holds no key.
 * The app runs on its own throwaway Keychain service, cleared after the spec.
 */
import { liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { clearTestKeychain } from '../../../scripts/testkit/keychain.ts';
import { testKeychainService } from '../../../scripts/testkit/namespace.ts';
import { MockLlm, MOCK_MODEL, MOCK_MODEL_ALT, mockCatalogPatch } from '../../../scripts/testkit/mockLlm.ts';

const desktopDir = resolve(import.meta.dirname, '..');
test.describe.configure({ mode: 'serial' });
const keychainService = testKeychainService('e2e-models');
const openaiKey = `sk-proj-${randomBytes(20).toString('hex')}`;
const deepseekKey = `sk-${randomBytes(20).toString('hex')}`;

let app: ElectronApplication | undefined;
let page: Page;
let tmp: string;
let llm: MockLlm;
let patchFile: string;
let directoryRevision = 0;
let directoryOffline = false;

async function launch(): Promise<Page> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  delete env.ORB_SKIP_FIRST_RUN;
  app = await electron.launch({
    args: [desktopDir],
    env: {
      ...env,
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_HOME: join(tmp, 'Orb'),
      ORB_USER_DATA: join(tmp, 'electron'),
      ORB_EXTRA_PATCH_FILE: patchFile,
      ORB_KEYCHAIN_SERVICE: keychainService,
    },
  });
  const p = await liveWindow(app);
  await p.waitForLoadState('domcontentloaded');
  return p;
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) continue; // Settings edits can remove transient lock files while the scan is running.
    if (st.isDirectory()) out.push(...filesUnder(p));
    else if (st.isFile()) out.push(p);
  }
  return out;
}

/** `ORB_UPDATE_SCREENS=1`: write docs/screens/p4.2-<name>.png (1440x900) for a visual check. */
async function capture(name: string) {
  if (process.env.ORB_UPDATE_SCREENS !== '1') return;
  await page.waitForTimeout(300);
  await page.screenshot({
    path: join(desktopDir, '..', '..', 'docs', 'screens', `p4.2-${name}.png`),
    fullPage: true,
  });
}

async function sized(p: Page) {
  await app!.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900);
    await new Promise((r) => setTimeout(r, 300));
  });
  return p;
}

const card = (provider: string) => page.locator(`[data-testid="provider-card"][data-provider="${provider}"]`);

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-models-'));
  await clearTestKeychain(keychainService);
  llm = await new MockLlm({
    models: () =>
      directoryOffline
        ? { status: 503, body: { error: 'Directory temporarily unavailable' } }
        : {
            body: {
              data: (directoryRevision
                ? [`future-chat-${directoryRevision}`]
                : [MOCK_MODEL, MOCK_MODEL_ALT]
              ).map((id) => ({ id, context_window: 128000, max_output_tokens: 16000 })),
            },
          },
  }).start();
  patchFile = join(tmp, 'mock.patch.yml');
  writeFileSync(
    patchFile,
    mockCatalogPatch(llm.baseURL, {
      mockKeyRef: 'ORB_ORB_MOCK_API_KEY',
      defaultRoute: { provider: 'openai', model: 'gpt-6-luna' },
    }),
  );
  page = await sized(await launch());
});

test.afterAll(async () => {
  await app?.close().catch(() => undefined);
  await llm?.close();
  await clearTestKeychain(keychainService).catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
});

test('first run: the sheet comes before Home, OpenAI is preselected, a saved key is tested, Continue goes Home', async () => {
  await expect(page.getByTestId('first-run-screen')).toBeVisible();
  await expect(page.locator('[data-testid="first-run-provider"][data-provider="openai"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByTestId('first-run-get-key')).toHaveAttribute(
    'href',
    'https://platform.openai.com/api-keys',
  );
  await expect(page.getByTestId('first-run-continue')).toHaveText('Skip for now');
  await capture('first-run');
  await card('openai').getByTestId('provider-key-input').fill(openaiKey);
  await card('openai').getByTestId('provider-key-save').click();
  await expect(card('openai').getByTestId('provider-status')).toHaveText('Working');
  await capture('first-run-working');
  const req = llm.requests.at(-1)!;
  expect(req.protocol).toBe('openai-responses');
  expect(req.body.model).toBe('gpt-6-luna');
  expect(req.authorization).toBe(`Bearer ${openaiKey}`);
  // The key never comes back to the page, only its redacted form.
  expect(await page.content()).not.toContain(openaiKey);
  await page.getByTestId('first-run-continue').click();
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await expect(page.getByTestId('home-key-needed')).toHaveCount(0);
});

test('Settings: provider cards, a DeepSeek key works, a failed test shows the plain message, Remove key', async () => {
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('provider-cards')).toHaveAttribute('data-loaded', 'yes');
  const ids = await page
    .getByTestId('provider-card')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-provider')));
  expect(ids.slice(0, 4)).toEqual(['openai', 'deepseek', 'anthropic', 'openrouter']);
  await expect(card('openai').getByTestId('provider-status')).toHaveText('Working');
  await expect(card('openai').getByTestId('provider-key-redacted')).toHaveText(
    `sk-proj-...${openaiKey.slice(-4)}`,
  );
  await expect(card('anthropic').getByTestId('provider-status')).toHaveText('Not set');

  await card('deepseek').getByTestId('provider-key-input').fill(deepseekKey);
  await card('deepseek').getByTestId('provider-key-save').click();
  await expect(card('deepseek').getByTestId('provider-status')).toHaveText('Working');
  expect(llm.requests.at(-1)!.body.model).toBe('deepseek-flash');

  llm.enqueue({ status: 401, errorMessage: 'Incorrect API key provided' });
  await card('deepseek').getByTestId('provider-test').click();
  await expect(card('deepseek').getByTestId('provider-status')).toHaveText('Failed');
  await expect(card('deepseek').getByTestId('provider-failure')).toHaveText(
    'The key was rejected. Check that it is correct and active.',
  );
  await capture('settings-failed');

  await card('deepseek').getByTestId('provider-key-remove').click();
  await expect(card('deepseek').getByTestId('provider-status')).toHaveText('Not set');
});

test('a custom provider with no key: Find models, Save, Working with no restart', async () => {
  await page.getByTestId('custom-add').click();
  await page.getByTestId('custom-id').fill('local-llm');
  await page.getByTestId('custom-label').fill('Local LLM');
  await page.getByTestId('custom-baseurl').fill(llm.baseURL);
  await page.getByTestId('custom-discover').click();
  await expect(page.getByTestId('custom-found')).toHaveText('Found 2 models.');
  await expect(page.getByTestId('custom-models')).toHaveValue(`${MOCK_MODEL}\n${MOCK_MODEL_ALT}`);
  await expect(page.getByTestId('custom-nokey')).toBeChecked();
  await capture('custom-form');
  await page.getByTestId('custom-save').click();
  await expect(card('local-llm').getByTestId('provider-status')).toHaveText('Working');
  await expect(card('local-llm').getByTestId('provider-key-redacted')).toHaveText('No key needed');
  expect(llm.requests.at(-1)!.authorization).toBe('Bearer orb-no-key');
});

test('the per-agent picker writes orb.json and survives a relaunch; first run is not shown again', async () => {
  const scout = page.locator('[data-testid="agent-model"][data-agent="scout"] select');
  await expect(scout).toHaveValue('');
  await expect(scout.locator('option').first()).toHaveText('Default (openai · gpt-6-luna)');
  await scout.selectOption(`local-llm\u0001${MOCK_MODEL_ALT}`);
  await expect
    .poll(() => JSON.parse(readFileSync(join(tmp, 'Orb', 'orb.json'), 'utf8')).models.scout)
    .toEqual({ provider: 'local-llm', model: MOCK_MODEL_ALT });
  await capture('settings');

  await app!.close();
  page = await launch();
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('first-run-screen')).toHaveCount(0);
  await page.getByTestId('open-settings').click();
  await expect(card('local-llm').getByTestId('provider-status')).toHaveText(/Ready|Working/);
  await expect(page.locator('[data-testid="agent-model"][data-agent="scout"] select')).toHaveValue(
    `local-llm\u0001${MOCK_MODEL_ALT}`,
  );
  // Back to the default.
  await page.locator('[data-testid="agent-model"][data-agent="scout"] select').selectOption('');
  await expect
    .poll(() => JSON.parse(readFileSync(join(tmp, 'Orb', 'orb.json'), 'utf8')).models.scout)
    .toBeUndefined();

  for (const file of filesUnder(join(tmp, 'dsh'))) {
    let text: string;
    try {
      text = readFileSync(file, 'latin1');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    expect(text.includes(openaiKey), file).toBe(false);
    expect(text.includes(deepseekKey), file).toBe(false);
  }
});

test('all provider lists refresh to new IDs; search, saved choices and offline restart remain usable', async () => {
  directoryRevision = 1;
  for (const provider of ['openai', 'deepseek', 'anthropic', 'openrouter']) {
    if (provider !== 'openai') {
      await card(provider).getByTestId('provider-key-input').fill(`fixture-${provider}-directory-key`);
      await card(provider).getByTestId('provider-key-save').click();
      await expect(card(provider).getByTestId('provider-status')).toHaveText('Working');
    }
    const refresh = card(provider).getByTestId('provider-models-refresh');
    await expect(refresh).toBeEnabled();
    await refresh.click();
    await expect(refresh).toBeEnabled();
    await expect(card(provider).getByTestId('provider-models-status')).toHaveText(/1 model · updated/);
    const picker = page.locator('[data-testid="agent-model"][data-agent="orb"] select');
    await expect(picker.locator('option').filter({ hasText: 'future-chat-1' })).toHaveCount(
      ['openai', 'deepseek', 'anthropic', 'openrouter'].indexOf(provider) + 1,
    );
  }
  const picker = page.locator('[data-testid="agent-model"][data-agent="orb"] select');
  await page.getByRole('searchbox', { name: 'Find a model' }).fill('future-chat-1');
  await picker.selectOption('anthropic\u0001future-chat-1');
  await expect
    .poll(() => JSON.parse(readFileSync(join(tmp, 'Orb', 'orb.json'), 'utf8')).models.orb)
    .toEqual({ provider: 'anthropic', model: 'future-chat-1' });
  directoryRevision = 2;
  await card('anthropic').getByTestId('provider-models-refresh').click();
  await expect(card('anthropic').getByTestId('provider-models-refresh')).toBeEnabled();
  await page.getByRole('searchbox', { name: 'Find a model' }).fill('future-chat-2');
  await expect(picker).toHaveValue('anthropic\u0001future-chat-1');
  await expect(picker.locator('option').filter({ hasText: 'future-chat-2' })).toHaveCount(1);
  directoryOffline = true;
  await card('anthropic').getByTestId('provider-models-refresh').click();
  await expect(card('anthropic').getByRole('alert')).toContainText('HTTP 503');
  await app!.close();
  page = await launch();
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await page.getByTestId('open-settings').click();
  await expect(card('anthropic').getByRole('alert')).toContainText('HTTP 503');
  await expect(page.locator('[data-testid="agent-model"][data-agent="orb"] select')).toHaveValue(
    'anthropic\u0001future-chat-1',
  );
  await expect(card('anthropic').getByTestId('provider-models-status')).toHaveText(/1 model · updated/);
  directoryOffline = false;
});

test('Find models uses a newly typed custom provider key before saving it', async () => {
  await page.getByTestId('custom-add').click();
  await page.getByTestId('custom-id').fill('authenticated-directory');
  await page.getByTestId('custom-baseurl').fill(llm.baseURL);
  await page.getByTestId('custom-nokey').uncheck();
  const key = 'fixture-private-custom-directory-key';
  await page.getByTestId('custom-key').fill(key);
  await page.getByTestId('custom-discover').click();
  await expect(page.getByTestId('custom-found')).toHaveText('Found 1 model.');
  expect(llm.modelListRequests.at(-1)!.authorization).toBe(`Bearer ${key}`);
  expect(readFileSync(join(tmp, 'Orb', 'orb.json'), 'utf8')).not.toContain(key);
  await page.getByTestId('custom-save').click();
  await expect(card('authenticated-directory').getByTestId('provider-status')).toHaveText('Working');
});
