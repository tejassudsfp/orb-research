/// <reference lib="dom" />
/**
 * P6.6 entity, media and technical cards in the real app (temp homes, no model calls):
 *   - Add card makes a Person/Org, Product/Competitor, Video, Code, Math and Checklist card; the reader edits it;
 *   - Code is syntax-highlighted and Math typeset on the board (bundled highlight.js and KaTeX, no network);
 *   - a Video card shows a thumbnail slot and an Open button and is never embedded (no iframe, video or embed);
 *   - the user ticks a checklist on the board (one undoable change, in board.jsonl as the user); undo unticks;
 *   - quit and relaunch: the board is exact; nothing off the sidecar origin, no CSP violation.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { fold, type BoardEvent, type BoardState } from '@orb/shared';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createCanvas, liveWindow } from './support/ui.ts';

const desktopDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(desktopDir, '..', '..');

let tmp: string;
let app: ElectronApplication | undefined;
const consoleLines: string[] = [];
const requests: string[] = [];

async function capture(page: Page, name: string) {
  if (process.env.ORB_UPDATE_SCREENS !== '1') return;
  await page.waitForTimeout(400);
  const dir = join(repoRoot, 'docs', 'screens');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `p6.6-${name}.png`) });
}

async function launch(): Promise<Page> {
  app = await electron.launch({
    args: [desktopDir],
    env: {
      ...process.env,
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_HOME: join(tmp, 'Orb'),
      ORB_USER_DATA: join(tmp, 'electron'),
    } as Record<string, string>,
  });
  const page = await liveWindow(app);
  page.on('console', (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));
  page.on('request', (req) => requests.push(req.url()));
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900);
    await new Promise((r) => setTimeout(r, 300));
  });
  await expect(page.getByTestId('orb-ping')).toHaveText(/^orb-host /);
  return page;
}

test.beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-media-'));
});
test.afterAll(async () => {
  await app?.close().catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
});

const events = (canvasId: string): BoardEvent[] => {
  try {
    return readFileSync(join(tmp, 'Orb', 'canvases', canvasId, 'board.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as BoardEvent);
  } catch {
    return [];
  }
};
const uiBoard = async (page: Page): Promise<BoardState> =>
  JSON.parse((await page.getByTestId('orb-board-state').textContent())!) as BoardState;
const settled = (page: Page) => expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-pending', '0');
const card = (page: Page, type: string) => page.locator(`[data-testid="orb-card"][data-card-type="${type}"]`);
const reader = (page: Page) => page.getByTestId('reader');

/** Add card › <item>: the card opens in the reader. */
async function addCard(page: Page, type: string) {
  await page.getByTestId('tool-add-card').click();
  await page.getByTestId(`add-card-${type}`).click();
  await expect(reader(page)).toBeVisible();
}
async function fill(page: Page, field: string, value: string) {
  const el = page.getByTestId(`reader-field-${field}`);
  await el.fill(value);
  await el.blur();
}
/** Close the reader, then drag the newest card (on top of the pile) to grid slot `slot`, so the cards do not hide each other. */
async function closeReader(page: Page, slot?: number) {
  await page.keyboard.press('Escape');
  await expect(reader(page)).toHaveCount(0);
  await settled(page);
  if (slot === undefined) return;
  const cards = page.locator('[data-testid="orb-card"]');
  const box = (await cards.last().boundingBox())!;
  const col = slot % 4;
  const row = Math.floor(slot / 4);
  const x = 120 + col * 290;
  const y = 130 + row * 300;
  await page.mouse.move(box.x + 60, box.y + 14);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 14, { steps: 8 });
  await page.mouse.up();
  await settled(page);
}

test('entity, media and technical cards: make, edit, highlight, typeset, tick, relaunch', async () => {
  let page = await launch();
  const { canvasId } = await createCanvas(page, 'Media cards');

  // ---- Person ----
  await addCard(page, 'entity');
  await fill(page, 'title', 'Ada Lovelace');
  await fill(page, 'role', 'Analyst');
  await fill(page, 'org', 'Analytical Engines');
  await fill(page, 'body', 'Wrote the first program.');
  await closeReader(page, 0);
  const person = card(page, 'entity');
  await expect(person.getByTestId('orb-card-title')).toHaveText('Ada Lovelace');
  await expect(person.getByTestId('entity-avatar')).toHaveText('AL');
  await expect(person.getByTestId('entity-sub')).toHaveText('Analyst · Analytical Engines');

  // ---- Product ----
  await addCard(page, 'product');
  await fill(page, 'title', 'Notebook Pro');
  await fill(page, 'pricing', '$20 per month');
  await closeReader(page, 1);
  await expect(card(page, 'product').getByTestId('product-sub')).toContainText('$20 per month');
  // Any card (a product here) takes a dataset from its Data tab.
  await card(page, 'product').getByTestId('orb-card-title').dblclick();
  await page.getByTestId('reader-tab-data').click();
  await expect(reader(page)).toContainText(/attach|data/i);
  await closeReader(page);

  // ---- Code: highlighted on the board ----
  await addCard(page, 'code');
  await fill(page, 'language', 'python');
  await fill(page, 'code', 'def total(rows):\n    return sum(rows)\n');
  await expect(page.getByTestId('reader-code').locator('.hljs-keyword').first()).toBeVisible();
  await closeReader(page, 2);
  await expect(card(page, 'code').getByTestId('card-code').locator('.hljs-keyword').first()).toBeVisible();

  // ---- Math: typeset with the bundled KaTeX ----
  await addCard(page, 'math');
  await fill(page, 'latex', '\\frac{a+b}{c}');
  await expect(page.getByTestId('reader-math').locator('.katex')).toBeVisible();
  await closeReader(page, 3);
  await expect(card(page, 'math').getByTestId('card-math').locator('.katex')).toBeVisible();
  // KaTeX's fonts load from the app itself.
  expect(await page.evaluate(async () => (await document.fonts.load('16px KaTeX_Main')).length)).toBeGreaterThan(0);

  // ---- Video: never embedded ----
  await addCard(page, 'video');
  await fill(page, 'title', 'Launch talk');
  await fill(page, 'url', 'https://www.youtube.com/watch?v=orb');
  await fill(page, 'author', 'Acme');
  await closeReader(page, 4);
  const video = card(page, 'video');
  await expect(video.getByTestId('video-thumb')).toBeVisible();
  await expect(video.getByTestId('card-open-link')).toBeVisible();
  await expect(page.locator('iframe[src*="youtube"], video, embed, object')).toHaveCount(0);

  // ---- Checklist: the user ticks ----
  await addCard(page, 'checklist');
  for (const text of ['Check the source', 'Call a customer']) {
    await page.getByTestId('checklist-add').fill(text);
    await page.getByTestId('checklist-add').press('Enter');
  }
  await expect(reader(page).getByTestId('checklist-box')).toHaveCount(2);
  await closeReader(page, 5);
  const list = card(page, 'checklist');
  await expect(list.getByTestId('checklist-progress')).toHaveText('0 of 2 done');
  await list.getByTestId('checklist-box').first().check();
  await expect(list.getByTestId('checklist-progress')).toHaveText('1 of 2 done');
  await settled(page);
  await expect
    .poll(() =>
      events(canvasId).some(
        (e) => e.type === 'card.updated' && JSON.stringify(e.data).includes('"done":true') && JSON.stringify(e.actor) === '{"kind":"user"}',
      ),
    )
    .toBe(true);
  await capture(page, 'cards');

  // Cmd+Z unticks (one undoable change), Shift+Cmd+Z ticks again.
  await page.mouse.click(1380, 880);
  await page.keyboard.press('Meta+z');
  await expect(list.getByTestId('checklist-progress')).toHaveText('0 of 2 done');
  await page.keyboard.press('Meta+Shift+z');
  await expect(list.getByTestId('checklist-progress')).toHaveText('1 of 2 done');
  await settled(page);

  // ---- Security ----
  const origin = new URL(page.url()).origin;
  expect(requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
  expect(consoleLines.filter((l) => /Content Security Policy|Refused to/i.test(l))).toEqual([]);
  await expect(page.getByTestId('orb-error')).toHaveCount(0);

  // ---- Quit and relaunch: exact ----
  await expect.poll(async () => (await uiBoard(page)).seq - (events(canvasId).length - 1)).toBe(0);
  const finalBoard = await uiBoard(page);
  expect(fold(events(canvasId))).toEqual(finalBoard);
  await app!.close();
  app = undefined;

  page = await launch();
  await page.getByTestId('home-search').fill('Analytical');
  await page.getByTestId('search-hit').first().click();
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await expect.poll(async () => (await uiBoard(page)).seq).toBe(finalBoard.seq);
  expect(await uiBoard(page)).toEqual(finalBoard);
  await expect(card(page, 'checklist').getByTestId('checklist-progress')).toHaveText('1 of 2 done');
  await expect(card(page, 'math').locator('.katex')).toBeVisible();
  expect(consoleLines.filter((l) => /Content Security Policy|Refused to/i.test(l))).toEqual([]);
});
