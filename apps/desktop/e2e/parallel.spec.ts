/// <reference lib="dom" />
/**
 * P6.7 Parallel AI in the real window (mock LLM and mock Parallel on loopback; no real key, no network):
 *   - Settings > Models > Search shows the Parallel card as "Key needed"; a key saved there goes to the (test) Keychain,
 *     the card says "Key saved" and Search is now Parallel; the key never comes back to the page;
 *   - Orb calls deep_research on the `ultra` processor: the cost guard puts a Research run card on the board waiting
 *     for the user ("Needs your OK", the estimate) and asks in the conversation panel too; nothing is sent to Parallel
 *     until Approve; the run then shows live and ends with the cited result and its sources on the board;
 *   - the next run is Declined: the card says nothing was started, and Parallel saw no second run;
 *   - a watch always asks (its monthly cost shown) and Approve makes a Watch card.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { clearTestKeychain } from '../../../scripts/testkit/keychain.ts';
import { testKeychainService } from '../../../scripts/testkit/namespace.ts';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { MOCK_PARALLEL_KEY, MockParallel } from '../../../scripts/testkit/mockParallel.ts';
import { createCanvas, liveWindow } from './support/ui.ts';

const desktopDir = resolve(import.meta.dirname, '..');
const keychainService = testKeychainService('e2e-parallel');

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
let parallel: MockParallel;

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-parallel-'));
  await clearTestKeychain(keychainService);
  llm = await new MockLlm().start();
  parallel = await new MockParallel({ taskMs: 600 }).start();
  const patchFile = join(tmp, 'mock.patch.yml');
  writeFileSync(patchFile, mockProviderPatch(llm.baseURL));
  app = await electron.launch({
    args: [desktopDir],
    env: {
      ...process.env,
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_HOME: join(tmp, 'Orb'),
      ORB_USER_DATA: join(tmp, 'electron'),
      ORB_EXTRA_PATCH_FILE: patchFile,
      ORB_KEYCHAIN_SERVICE: keychainService,
      PARALLEL_BASE_URL: parallel.baseURL,
      [MOCK_KEY_ENV]: 'orb-mock-key',
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900);
    await new Promise((r) => setTimeout(r, 300));
  });
});

test.afterAll(async () => {
  await app?.close().catch(() => undefined);
  await llm?.close();
  await parallel?.close();
  await clearTestKeychain(keychainService).catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
});

const parallelCard = () => page.locator('[data-testid="search-key"][data-provider="parallel"]');
const runCard = () => page.locator('[data-testid="orb-card"][data-card-type="research"]').last();

test('Settings: the Parallel card says "Key needed"; a saved key makes Parallel the search provider', async () => {
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await page.evaluate(() => (location.hash = '#/settings'));
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await expect(parallelCard()).toBeVisible();
  await expect(parallelCard().locator('[data-state]').first()).toHaveText('Key needed');
  await expect(page.getByTestId('parallel-note')).toContainText('$0.50');
  await parallelCard().getByLabel('Parallel API key').fill(MOCK_PARALLEL_KEY);
  await parallelCard().getByRole('button', { name: 'Save' }).click();
  await expect(parallelCard().locator('[data-state]').first()).toHaveText('Key saved');
  await expect(page.getByTestId('search-active')).toContainText('Parallel');
  expect(await page.content()).not.toContain(MOCK_PARALLEL_KEY);
  await page.evaluate(() => (location.hash = '#/'));
});

test('cost guard: ultra waits for Approve on the card and in the panel; the run goes live and lands with its sources', async () => {
  await createCanvas(page, 'Parallel probe');
  llm.enqueue(
    { toolCalls: [{ id: 'call_dr1', name: 'deep_research', arguments: { input: 'The EV charging market in Europe', processor: 'ultra', title: 'EV market' } }] },
    { text: 'The research is on the board.' },
  );
  await page.getByTestId('orb-chat-input').fill('research the EV charging market in depth');
  await page.getByTestId('orb-chat-send').click();

  await expect(runCard().getByTestId('research-line')).toHaveAttribute('data-status', 'awaiting_approval');
  await expect(runCard().getByTestId('research-approval')).toContainText('$0.30');
  await expect(page.getByTestId('parallel-prompt')).toContainText('EV market');
  // Nothing was sent to Parallel before the user said yes.
  expect(parallel.count('POST', '/v1/tasks/runs')).toBe(0);

  await page.getByTestId('parallel-prompt-approve').click();
  await expect(page.getByTestId('parallel-prompt')).toHaveCount(0);
  await expect(runCard().getByTestId('research-line')).toHaveAttribute('data-status', /^(queued|running)$/);
  await expect(runCard().getByTestId('research-line')).toHaveAttribute('data-status', 'completed', { timeout: 20_000 });
  expect(parallel.count('POST', '/v1/tasks/runs')).toBe(1);
  await expect(page.locator('[data-testid="orb-card"][data-card-type="source"]').first()).toBeVisible();
  await expect(page.getByTestId('orb-chat-reply')).toHaveText('The research is on the board.');
  await expect(page.getByTestId('orb-error')).toHaveCount(0);
});

test('Decline starts nothing; a watch always asks and Approve makes a Watch card', async () => {
  llm.enqueue(
    { toolCalls: [{ id: 'call_dr2', name: 'deep_research', arguments: { input: 'Another deep report', processor: 'ultra2x', title: 'Max depth' } }] },
    { text: 'Declined, so nothing ran.' },
  );
  await page.getByTestId('orb-chat-input').fill('go to maximum depth on another report');
  await page.getByTestId('orb-chat-send').click();
  await expect(page.getByTestId('parallel-prompt')).toContainText('$0.60');
  await page.getByTestId('parallel-prompt-decline').click();
  await expect(runCard().getByTestId('research-line')).toHaveAttribute('data-status', 'declined');
  expect(parallel.count('POST', '/v1/tasks/runs')).toBe(1);
  await expect(page.getByTestId('orb-chat-reply')).toHaveText('Declined, so nothing ran.');

  llm.enqueue(
    { toolCalls: [{ id: 'call_w1', name: 'watch_topic', arguments: { query: 'New EV charging standards', frequency: '1d', title: 'Standards' } }] },
    { text: 'Watching.' },
  );
  await page.getByTestId('orb-chat-input').fill('watch for new EV charging standards');
  await page.getByTestId('orb-chat-send').click();
  await expect(page.getByTestId('parallel-prompt')).toContainText('$0.09');
  expect(parallel.count('POST', '/v1/monitors')).toBe(0);
  await page.getByTestId('parallel-prompt-approve').click();
  const watch = page.locator('[data-testid="orb-card"][data-card-type="watch"]');
  await expect(watch.getByTestId('watch-line')).toHaveAttribute('data-status', 'active');
  expect(parallel.count('POST', '/v1/monitors')).toBe(1);
  await expect(page.getByTestId('orb-chat-reply')).toHaveText('Watching.');
});
