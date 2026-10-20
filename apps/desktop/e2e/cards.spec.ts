/// <reference lib="dom" />
/**
 * P2.5 user card types in the real app (temp homes, no model calls):
 *   - drop a PNG, a 3-page PDF, a CSV and a Markdown file at different points: an Image card (the image loads through
 *     the authenticated asset route), a File card (pdf.js thumbnail of page 1 + "pdf · 3 pages"), a Table card and a
 *     Note card; every file (plus the PDF cover) is copied into <canvas>/assets/ byte for byte;
 *   - a two-file drop is ONE action (one Cmd+Z removes both cards, Cmd+Shift+Z brings them back);
 *   - the table sorts by a header click and keeps the sort (it is saved on the card);
 *   - paste an image and a URL: an Image card and a Source card;
 *   - Must read / Skim badges from the selection bar and the reader; the reading queue lists them, Must read first;
 *     opening a card from the queue flies to it, opens the reader (PDF pages rendered by pdf.js), and ticks it:
 *     ONE `card.opened` event, however often it is opened;
 *   - the reader's Note tab saves the card's note; the card shows its note tab;
 *   - no CSP violation, no request off the sidecar origin;
 * then quit and relaunch: the reopened board equals the board before (UI fold == fold(board.jsonl)), images and
 * thumbnails load again, the queue keeps its ticks.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { fold, type BoardEvent, type BoardState } from '@orb/shared';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { makePdf, makePng } from '../../../scripts/testkit/fixtures.ts';
import { createCanvas, liveWindow } from './support/ui.ts';

const desktopDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(desktopDir, '..', '..');

let tmp: string;
let app: ElectronApplication | undefined;
const consoleLines: string[] = [];
const requests: string[] = [];

async function capture(page: Page, name: string) {
  if (process.env.ORB_UPDATE_SCREENS !== '1') return;
  await page.waitForTimeout(300);
  const dir = join(repoRoot, 'docs', 'screens');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `p2.5-${name}.png`) });
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
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-cards-'));
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
const settled = (page: Page) =>
  expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-pending', '0');

type FileSpec = { name: string; type: string; b64: string };
const spec = (name: string, type: string, data: Buffer | string): FileSpec => ({
  name,
  type,
  b64: Buffer.from(data).toString('base64'),
});

/** Dispatch a real drag-and-drop of files (or a text/uri-list link) at a screen point. */
async function drop(page: Page, x: number, y: number, files: FileSpec[], data: Record<string, string> = {}) {
  await page.evaluate(
    ({ x, y, files, data }) => {
      const dt = new DataTransfer();
      for (const f of files) {
        const bytes = Uint8Array.from(atob(f.b64), (ch) => ch.charCodeAt(0));
        dt.items.add(new File([bytes], f.name, { type: f.type }));
      }
      for (const [type, value] of Object.entries(data)) dt.setData(type, value);
      const target = document.elementFromPoint(x, y)!;
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(
          new DragEvent(type, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }),
        );
      }
    },
    { x, y, files, data },
  );
}

/** Dispatch a paste (Cmd+V) of a file or text, with the pointer at a screen point. */
async function paste(page: Page, x: number, y: number, files: FileSpec[], data: Record<string, string> = {}) {
  await page.mouse.move(x, y);
  await page.evaluate(
    ({ files, data }) => {
      const dt = new DataTransfer();
      for (const f of files) {
        const bytes = Uint8Array.from(atob(f.b64), (ch) => ch.charCodeAt(0));
        dt.items.add(new File([bytes], f.name, { type: f.type }));
      }
      for (const [type, value] of Object.entries(data)) dt.setData(type, value);
      document.body.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    },
    { files, data },
  );
}

const card = (page: Page, type: string) => page.locator(`[data-testid="orb-card"][data-card-type="${type}"]`);
const loaded = (page: Page, selector: string) =>
  expect
    .poll(() =>
      page.evaluate((sel) => {
        const img = document.querySelector<HTMLImageElement>(sel);
        return img ? img.complete && img.naturalWidth > 0 : false;
      }, selector),
    )
    .toBe(true);

test('drop, paste, badges, reading queue, reader, note tab; quit and relaunch: exact', async () => {
  let page = await launch();
  const { canvasId } = await createCanvas(page, 'Card types');
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
  const assetsDir = join(tmp, 'Orb', 'canvases', canvasId, 'assets');

  const png = makePng(400, 240);
  const pdf = makePdf(3, 'Attention study');
  const csv = 'name,score\nAda,3\nBob,10\nCy,7\n';
  const md = '# Reading plan\n\nStart with the PDF.\n';

  // ---- Drop four files at four points ----
  await drop(page, 300, 250, [spec('Chart.png', 'image/png', png)]);
  await expect(card(page, 'image')).toHaveCount(1);
  await drop(page, 720, 300, [spec('Attention.pdf', 'application/pdf', pdf)]);
  await expect(card(page, 'file')).toHaveCount(1);
  await drop(page, 420, 640, [spec('scores.csv', 'text/csv', csv)]);
  await expect(card(page, 'table')).toHaveCount(1);
  await drop(page, 860, 660, [spec('Plan.md', '', md)]);
  await expect(card(page, 'note')).toHaveCount(1);
  await settled(page);

  await loaded(page, '[data-card-type="image"] [data-testid="card-image"]');
  await expect(card(page, 'file').getByTestId('orb-card-kind')).toHaveText('pdf · 3 pages');
  await loaded(page, '[data-card-type="file"] [data-testid="card-thumb"]');
  await expect(card(page, 'file').getByTestId('orb-card-title')).toHaveText('Attention');
  await expect(card(page, 'table').getByTestId('card-table-row')).toHaveCount(3);
  await expect(card(page, 'note').getByTestId('orb-card-title')).toHaveText('Plan');
  await expect(card(page, 'note').getByTestId('orb-card-kind')).toHaveText('your note');

  // Every file (and the PDF cover) is in assets/, byte for byte.
  let board = await uiBoard(page);
  const byType = (b: BoardState, t: string) => Object.values(b.cards).find((c) => c.type === t)!;
  const pathOf = (c: { data: unknown }, key = 'asset') =>
    join(tmp, 'Orb', 'canvases', canvasId, (c.data as Record<string, { path: string }>)[key]!.path);
  expect(readFileSync(pathOf(byType(board, 'image')))).toEqual(png);
  expect(readFileSync(pathOf(byType(board, 'file')))).toEqual(pdf);
  expect(readFileSync(pathOf(byType(board, 'table')), 'utf8')).toBe(csv);
  expect(readFileSync(pathOf(byType(board, 'note')), 'utf8')).toBe(md);
  expect(
    readFileSync(pathOf(byType(board, 'file'), 'thumb'))
      .subarray(1, 4)
      .toString(),
  ).toBe('PNG');
  expect(readdirSync(assetsDir)).toHaveLength(5);
  await capture(page, 'drop');

  // ---- A two-file drop is one action ----
  const before = Object.keys(board.cards).length;
  await drop(page, 1000, 520, [spec('a.txt', 'text/plain', 'Alpha'), spec('b.txt', 'text/plain', 'Beta')]);
  await expect(page.getByTestId('orb-card')).toHaveCount(before + 2);
  await settled(page);
  await page.mouse.click(1000, 860); // focus the board (empty space)
  await page.keyboard.press('Meta+z');
  await expect(page.getByTestId('orb-card')).toHaveCount(before);
  await page.keyboard.press('Meta+Shift+z');
  await expect(page.getByTestId('orb-card')).toHaveCount(before + 2);
  await settled(page);
  await page.keyboard.press('Meta+z');
  await expect(page.getByTestId('orb-card')).toHaveCount(before);
  await settled(page);

  // ---- Table sort (saved on the card) ----
  const scores = () =>
    card(page, 'table').locator('[data-testid="card-table-row"] td:nth-child(2)').allTextContents();
  expect(await scores()).toEqual(['3', '10', '7']);
  await card(page, 'table').getByTestId('card-table-sort-1').click();
  await expect.poll(scores).toEqual(['3', '7', '10']);
  await card(page, 'table').getByTestId('card-table-sort-1').click();
  await expect.poll(scores).toEqual(['10', '7', '3']);
  await settled(page);
  expect(byType(await uiBoard(page), 'table').data).toMatchObject({ sort: { column: 1, dir: 'desc' } });

  // ---- Paste an image and a URL ----
  await paste(page, 1000, 200, [spec('image.png', 'image/png', makePng(60, 60, [96, 165, 250]))]);
  await expect(card(page, 'image')).toHaveCount(2);
  await paste(page, 160, 470, [], { 'text/plain': 'https://www.example.com/papers/attention' });
  await expect(card(page, 'source')).toHaveCount(1);
  await expect(card(page, 'source').getByTestId('card-url')).toHaveText(
    'https://www.example.com/papers/attention',
  );
  await expect(card(page, 'source').getByTestId('orb-card-title')).toHaveText('example.com/papers/attention');
  await settled(page);
  await expect(page.getByTestId('board-notice')).toHaveCount(0);

  // ---- Badges: Must read on the source (selection bar), Skim on the PDF (reader) ----
  await expect(page.getByTestId('reading-queue')).toHaveCount(0);
  await card(page, 'source').getByTestId('card-select').check();
  await page.getByTestId('card-badge-must').click();
  await expect(card(page, 'source').getByTestId('orb-card-badge')).toHaveText('Must read');
  await card(page, 'file').getByTestId('orb-card-title').dblclick();
  await expect(page.getByTestId('reader')).toBeVisible();
  await page.getByTestId('reader-badge-skim').click();
  await expect(card(page, 'file').getByTestId('orb-card-badge')).toHaveText('Skim');
  // The PDF reader renders the pages with pdf.js from the stored file.
  await expect(page.getByTestId('reader-pdf-state')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('reader-pdf-page')).toHaveCount(3);
  await capture(page, 'reader-pdf');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('reader')).toHaveCount(0);
  await settled(page);

  // ---- Reading queue: Must read first; the PDF was opened (ticked), the source not yet ----
  await page.getByTestId('reading-queue-toggle').click();
  const items = page.getByTestId('reading-queue-item');
  await expect(items).toHaveCount(2);
  board = await uiBoard(page);
  const sourceId = byType(board, 'source').id;
  const fileId = byType(board, 'file').id;
  await expect(items.nth(0)).toHaveAttribute('data-card-id', sourceId);
  await expect(items.nth(1)).toHaveAttribute('data-card-id', fileId);
  await expect(items.nth(1)).toHaveAttribute('data-opened', 'true');
  await expect(page.getByTestId('reading-queue-count')).toHaveText('1/2 read');
  await capture(page, 'queue');

  // Opening from the queue flies to the card and opens it; it gets its tick.
  await page.getByTestId('zoom-level').click();
  await items.nth(0).click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-card-id', sourceId);
  await expect(page.getByTestId('reader-url')).toHaveText('https://www.example.com/papers/attention');
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');

  // ---- Note tab ----
  await page.getByTestId('reader-tab-note').click();
  await page.getByTestId('reader-note-tab').fill('Read section 3 first.');
  await page.getByTestId('reader-close').click();
  await expect(card(page, 'source').getByTestId('card-note-tab')).toBeVisible();
  await expect(page.getByTestId('reading-queue-count')).toHaveText('2/2 read');
  await settled(page);

  // Opening again writes nothing more: exactly one card.opened per card.
  await card(page, 'source').getByTestId('card-note-tab').click();
  await expect(page.getByTestId('reader-note-tab')).toHaveValue('Read section 3 first.');
  await page.keyboard.press('Escape');
  await settled(page);
  await expect
    .poll(() =>
      events(canvasId)
        .filter((e) => e.type === 'card.opened')
        .map((e) => (e.data as { id: string }).id),
    )
    .toEqual([fileId, sourceId]);
  board = await uiBoard(page);
  expect(board.cards[sourceId]).toMatchObject({ badge: 'must', opened: true, note: 'Read section 3 first.' });
  expect(board.cards[fileId]).toMatchObject({ badge: 'skim', opened: true });

  // Editing a note card's text in the reader.
  // The reading queue flew to the source; fit the board before selecting a different card behind the chat panel.
  await page.keyboard.press('Shift+1');
  await card(page, 'note').getByTestId('orb-card-title').dblclick();
  await page.getByTestId('reader-note-title').fill('Reading plan');
  await page.getByTestId('reader-note-body').fill('Start with the PDF, then the source.');
  await page.keyboard.press('Escape');
  await expect(card(page, 'note').getByTestId('orb-card-title')).toHaveText('Reading plan');
  await settled(page);
  // Focusing controls inside cards never scrolls the screen (the chrome stays put).
  expect(await page.getByTestId('canvas-screen').evaluate((el) => [el.scrollLeft, el.scrollTop])).toEqual([
    0, 0,
  ]);
  await expect(page.getByTestId('title-pill')).toHaveCSS('left', '24px');
  await capture(page, 'board');

  // ---- Security: no CSP violation, nothing off the sidecar origin ----
  const origin = new URL(page.url()).origin;
  expect(
    requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')),
  ).toEqual([]);
  expect(consoleLines.filter((l) => /Content Security Policy|Refused to/i.test(l))).toEqual([]);
  await expect(page.getByTestId('orb-error')).toHaveCount(0);

  // ---- Quit and relaunch ----
  // board.jsonl is flushed within 250 ms: wait until the file has caught up with the UI.
  await expect.poll(async () => (await uiBoard(page)).seq - (events(canvasId).length - 1)).toBe(0);
  const finalBoard = await uiBoard(page);
  expect(fold(events(canvasId))).toEqual(finalBoard);
  await app!.close();
  app = undefined;

  page = await launch();
  await page.locator(`[data-testid="orb-canvas-open"][data-canvas-id="${canvasId}"]`).click();
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await expect.poll(async () => (await uiBoard(page)).seq).toBe(finalBoard.seq);
  expect(await uiBoard(page)).toEqual(finalBoard);
  expect(fold(events(canvasId))).toEqual(finalBoard);
  await loaded(page, '[data-card-type="image"] [data-testid="card-image"]');
  await loaded(page, '[data-card-type="file"] [data-testid="card-thumb"]');
  await expect(page.getByTestId('reading-queue-count')).toHaveText('2/2 read');
  // The reserved rail changes what is virtualised after restoring the camera; navigate to the saved table.
  await page.keyboard.press('Meta+f');
  await page.getByTestId('board-search-input').fill('scores');
  await expect.poll(scores).toEqual(['10', '7', '3']);
  await page.keyboard.press('Escape');
  expect(consoleLines.filter((l) => /Content Security Policy|Refused to/i.test(l))).toEqual([]);
});
