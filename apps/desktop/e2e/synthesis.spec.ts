/// <reference lib="dom" />
/**
 * P6.5 synthesis cards in the real app (temp homes, no model calls): the export fixture's insight, hypothesis, decision
 * and framework cards draw on the board; a link drawn into the hypothesis moves its for/against balance; the reader
 * shows the cited cards as buttons that open them; the decision's rubric ranks its options; nothing leaves the sidecar.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { CanvasStore } from '@orb/canvas';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { seedPrintFixture, type PrintFixture } from '../../../scripts/testkit/printFixture.ts';
import { liveWindow } from './support/ui.ts';

const desktopDir = resolve(import.meta.dirname, '..');

let app: ElectronApplication | undefined;
let page: Page;
let tmp: string;
let fixture: PrintFixture;
const offOrigin: string[] = [];

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-synth-'));
  fixture = await seedPrintFixture(join(tmp, 'Orb'), { frames: 5 });
  // The risk card contradicts the hypothesis: one more against (the fixture has one for and one against).
  const store = new CanvasStore({ home: join(tmp, 'Orb'), searchIndex: false, flushMs: 5 });
  try {
    await store.command(fixture.canvasId, {
      type: 'link.added',
      link: { from: fixture.cards.risk, to: fixture.cards.hypothesis, type: 'contradicts' },
    } as never);
    await store.flush();
  } finally {
    await store.close();
  }
  app = await electron.launch({
    args: [desktopDir],
    env: {
      ...process.env,
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_HOME: join(tmp, 'Orb'),
      ORB_USER_DATA: join(tmp, 'electron'),
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  await page.waitForLoadState('domcontentloaded');
  const origin = new URL(page.url()).origin;
  page.on('request', (req) => {
    const url = req.url();
    if (!/^(data|blob|about):/.test(url) && !url.startsWith(origin)) offOrigin.push(url);
  });
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900);
    await new Promise((r) => setTimeout(r, 300));
  });
  await page.evaluate((id) => (location.hash = `#/canvas/${id}`), fixture.canvasId);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
});

test.afterAll(async () => {
  await app?.close().catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
});

/** Screenshots for docs/screens (ORB_UPDATE_SCREENS=1). */
async function capture(name: string) {
  if (process.env.ORB_UPDATE_SCREENS !== '1') return;
  await page.waitForTimeout(300);
  const dir = join(resolve(desktopDir, '..', '..'), 'docs', 'screens');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `p6.5-${name}.png`) });
}

const card = (type: string) => page.locator(`[data-testid="orb-card"][data-card-type="${type}"]`);

test('insight, hypothesis, decision and framework draw; links move the balance; the reader opens citations', async () => {
  // The whole board at fit zoom (title level): the hypothesis keeps its confidence readable.
  await page.keyboard.press('Shift+1');
  for (const type of ['insight', 'hypothesis', 'decision', 'framework'])
    await expect(card(type)).toHaveCount(1);
  await expect(card('hypothesis').getByTestId('hypothesis-title-confidence')).toHaveText('70%');

  // Zoomed to one card at a time, the board bodies show their content.
  const zoomTo = async (type: string) => {
    await page.keyboard.press('Shift+1');
    await card(type).getByTestId('card-select').check();
    await page.keyboard.press('Shift+2');
    await expect(card(type)).toHaveAttribute('data-lod', 'full');
  };
  await zoomTo('insight');
  await expect(card('insight').getByTestId('card-insight')).toContainText('2 citations');
  await capture('insight');
  await zoomTo('hypothesis');
  await expect(card('hypothesis').getByTestId('hypothesis-confidence')).toContainText('70%');
  await expect(card('hypothesis').getByTestId('hypothesis-balance')).toHaveText('1 for2 against');
  await capture('hypothesis');
  await zoomTo('decision');
  await expect(card('decision').getByTestId('decision-status')).toHaveText('decided');
  await expect(card('decision').locator('[data-chosen="true"]')).toHaveText(/Pro/);
  await capture('decision');
  await zoomTo('framework');
  await expect(card('framework').getByTestId('card-framework')).toContainText('Strengths');
  await capture('framework');

  // The reader: the hypothesis lists its for and against cards; a citation opens its card.
  await page.keyboard.press('Shift+1'); // (the board is laid out by the engine: the whole board is in view for sure)
  await card('hypothesis').getByTestId('orb-card-title').dblclick();
  const reader = page.getByTestId('reader');
  await expect(reader).toBeVisible();
  await expect(reader.getByTestId('synthesis-ref')).toHaveCount(3);
  await reader.getByTestId('synthesis-ref').first().click();
  await expect(reader).toHaveAttribute('data-card-id', fixture.cards.source);
  await page.getByTestId('reader-close').click();
  await expect(reader).toHaveCount(0);

  // The decision's reader ranks the options by the weighted rubric (Pro 7.33, Team 7.00).
  await page.keyboard.press('Shift+1');
  await card('decision').getByTestId('orb-card-title').dblclick();
  await expect(page.getByTestId('decision-rubric')).toContainText('7.33 (#1)');
  await capture('decision-reader');
  await expect(page.getByTestId('decision-rubric')).toContainText('7.00 (#2)');
  await page.getByTestId('reader-close').click();

  expect(offOrigin).toEqual([]);
});
