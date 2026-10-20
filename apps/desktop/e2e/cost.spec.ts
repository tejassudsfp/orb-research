/// <reference lib="dom" />
/**
 * P4.3 cost meter in the real window (mock LLM only; no key, no network). Every mock response reports its usage
 * (prompt, cached, completion tokens) the way OpenAI does:
 *   - a question on Home opens a canvas and Orb answers; the conversation panel's header menu shows the canvas's
 *     tokens (exactly the provider-reported total) and says the mock route has no price;
 *   - Settings › Prices lists the catalog-seeded table (gpt-6-luna at its list price) and adds a price for the mock
 *     route; the menu then shows dollars = tokens × price, and the Home tile shows the same tokens and dollars.
 */
import { liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { costOf, formatUsd } from '@orb/shared';
import {
  MOCK_KEY_ENV,
  MOCK_MODEL,
  MOCK_PROVIDER,
  MockLlm,
  mockProviderPatch,
} from '../../../scripts/testkit/mockLlm.ts';

const desktopDir = resolve(import.meta.dirname, '..');

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
const usageOf = (id: number) => ({
  input: 1500 + id * 11,
  output: 120 + id,
  cacheRead: id % 2 === 0 ? 512 : 0,
});

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-cost-'));
  llm = await new MockLlm({
    defaultTurn: (req) => ({ text: 'Here is a short answer.', usage: usageOf(req.id) }),
  }).start();
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
      [MOCK_KEY_ENV]: 'orb-mock-key',
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** `ORB_UPDATE_SCREENS=1`: write docs/screens/p4.3-<name>.png (1440x900) for a visual check. */
async function capture(name: string) {
  if (process.env.ORB_UPDATE_SCREENS !== '1') return;
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900);
    await new Promise((r) => setTimeout(r, 300));
  });
  await page.screenshot({ path: join(desktopDir, '..', '..', 'docs', 'screens', `p4.3-${name}.png`) });
}

/** Provider-reported usage of every completed request, in the harness's buckets. */
function billed() {
  const t = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  for (const r of llm.requests.filter((x) => x.completed)) {
    const u = usageOf(r.id);
    t.uncachedInputTokens += u.input - u.cacheRead;
    t.outputTokens += u.output;
    t.cacheReadTokens += u.cacheRead;
  }
  return t;
}
const totalOf = (t: ReturnType<typeof billed>) =>
  t.uncachedInputTokens + t.outputTokens + t.cacheReadTokens + t.cacheWriteTokens;

test('the header menu and the Home tile show tokens and the estimated cost; prices are editable', async () => {
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await page.getByTestId('home-prompt').fill('How much does a research canvas cost to run?');
  await page.getByTestId('orb-create').click();
  const screen = page.getByTestId('canvas-screen');
  await expect(screen).toHaveAttribute('data-follow', 'open');
  const canvasId = await screen.getAttribute('data-canvas-id');
  await expect.poll(() => llm.requests.some((r) => r.completed), { timeout: 30_000 }).toBe(true);
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-agents-state', 'idle', {
    timeout: 30_000,
  });
  await expect.poll(() => llm.requests.every((r) => r.completed || r.aborted)).toBe(true);
  const tokens = billed();
  const total = totalOf(tokens);
  expect(total).toBeGreaterThan(0);

  // The meter: the provider's total, no dollars for a route with no price (and it says so).
  await page.getByTestId('chat-menu').click();
  const meter = page.getByTestId('cost-meter');
  await expect(meter).toHaveAttribute('data-total', String(total), { timeout: 10_000 });
  await expect(meter).toHaveAttribute('data-usd', '0');
  await expect(page.getByTestId('cost-meter-unpriced')).toContainText(`${MOCK_PROVIDER}/${MOCK_MODEL}`);
  await capture('menu-unpriced');
  await page.getByTestId('chat-menu').click();

  // Settings › Prices: the catalog-seeded table, then a price for the mock route.
  await page.evaluate(() => (location.hash = '#/settings'));
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  const luna = page.locator('[data-testid="price-row"][data-key="openai/gpt-6-luna"]');
  await expect(luna).toHaveAttribute('data-source', 'catalog');
  await expect(luna.locator('[data-field="input"]')).toHaveText('$0.1');
  await expect(luna.locator('[data-field="output"]')).toHaveText('$0.5');
  await page.getByTestId('price-add').click();
  await page.getByTestId('price-provider').fill(MOCK_PROVIDER);
  await page.getByTestId('price-model').fill(MOCK_MODEL);
  await page.getByTestId('price-input').fill('2');
  await page.getByTestId('price-output').fill('8');
  await page.getByTestId('price-cacheRead').fill('0.5');
  await page.getByTestId('price-save').click();
  const mock = page.locator(`[data-testid="price-row"][data-key="${MOCK_PROVIDER}/${MOCK_MODEL}"]`);
  await expect(mock).toHaveAttribute('data-source', 'user');
  await expect(mock.locator('[data-field="output"]')).toHaveText('$8');
  await mock.scrollIntoViewIfNeeded();
  await capture('settings-prices');

  const usd = costOf(tokens, { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 0 });

  // Home tile: the same tokens and dollars.
  await page.evaluate(() => (location.hash = '#/'));
  const tile = page.locator(
    `[data-testid="orb-canvas-open"][data-canvas-id="${canvasId}"] [data-testid="tile-cost"]`,
  );
  await expect(tile).toHaveAttribute('data-total', String(total), { timeout: 10_000 });
  expect(Number(await tile.getAttribute('data-usd'))).toBeCloseTo(usd, 10);
  await expect(tile).toContainText(formatUsd(usd));
  await capture('home-tile');

  // Back on the canvas, the menu shows dollars now.
  await page.locator(`[data-testid="orb-canvas-open"][data-canvas-id="${canvasId}"]`).click();
  await expect(screen).toHaveAttribute('data-follow', 'open');
  await page.getByTestId('chat-menu').click();
  await expect(page.getByTestId('cost-meter-value')).toContainText(formatUsd(usd), { timeout: 10_000 });
  expect(Number(await meter.getAttribute('data-usd'))).toBeCloseTo(usd, 10);
  await expect(page.getByTestId('cost-meter-unpriced')).toHaveCount(0);
  await capture('menu');
});
