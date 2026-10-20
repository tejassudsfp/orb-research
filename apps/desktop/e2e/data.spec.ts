/// <reference lib="dom" />
/**
 * P6.3 Database card and attachable data in the real app (temp homes, no model calls):
 *   - Add card › Database…: paste a table; a Database card shows its rows; XLSX through the file picker and JSON by
 *     drop make more; the rows live in `<canvas>/assets/data/<id>.json`, written by the sidecar;
 *   - the reader edits the dataset (cell, row, column) and its views: table, board, gallery, each with filter, sort and
 *     group; the board card follows the active view and the new row count;
 *   - a CSV Table card is promoted to a Database card in place (selection bar), and Cmd+Z turns it back;
 *   - any card (a note) takes an attached dataset view from its Data tab; detach and undo work;
 *   - quit and relaunch: the views, rows and the Home search of the dataset's rows are exact;
 *   - nothing off the sidecar origin, no CSP violation.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { fold, type BoardEvent, type BoardState, type Dataset } from '@orb/shared';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { makeXlsx } from '../../../scripts/testkit/fixtures.ts';
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
  await page.screenshot({ path: join(dir, `p6.3-${name}.png`) });
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
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-data-'));
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
const card = (page: Page, type: string) => page.locator(`[data-testid="orb-card"][data-card-type="${type}"]`);
const dataDir = (canvasId: string) => join(tmp, 'Orb', 'canvases', canvasId, 'assets', 'data');
const datasets = (canvasId: string): Dataset[] =>
  readdirSync(dataDir(canvasId))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dataDir(canvasId), f), 'utf8')) as Dataset);

const pasted = [
  'Company\tStage\tARR\tFounded',
  'Acme\tSeed\t1.2\t2020-03-01',
  'Globex\tSeries A\t4.5\t2018-07-15',
  'Initech\tSeed\t0.8\t2021-01-20',
  'Umbrella\tSeries B\t12\t2015-05-05',
  'Hooli\tSeed\t2.5\t2019-09-09',
  'Piper\tSeed\t0.1\t2022-02-02',
  'Soylent\tSeries A\t7\t2017-04-04',
  'Vandelay\tSeries A\t3\t2016-06-06',
].join('\n');

type FileSpec = { name: string; type: string; b64: string };
const spec = (name: string, type: string, data: Buffer | Uint8Array | string): FileSpec => ({
  name,
  type,
  b64: Buffer.from(data).toString('base64'),
});
async function drop(page: Page, x: number, y: number, files: FileSpec[]) {
  await page.evaluate(
    ({ x, y, files }) => {
      const dt = new DataTransfer();
      for (const f of files) {
        const bytes = Uint8Array.from(atob(f.b64), (ch) => ch.charCodeAt(0));
        dt.items.add(new File([bytes], f.name, { type: f.type }));
      }
      const target = document.elementFromPoint(x, y)!;
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(
          new DragEvent(type, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }),
        );
      }
    },
    { x, y, files },
  );
}

const reader = (page: Page) => page.getByTestId('reader');
const names = (page: Page, testid: string) =>
  page
    .locator(`[data-testid="${testid}"] td:nth-child(1) textarea`)
    .evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));

test('Database card: import, views with filter / sort / group, edits, promote a table, attach to a note; relaunch: exact', async () => {
  let page = await launch();
  const { canvasId } = await createCanvas(page, 'Datasets');

  // ---- Add card › Database…: paste a table ----
  await page.getByTestId('tool-add-card').click();
  await page.getByTestId('add-card-database').click();
  await page.getByTestId('data-paste').fill(pasted);
  await page.getByTestId('data-import-paste').click();
  await expect(card(page, 'database')).toHaveCount(1);
  const db = card(page, 'database');
  await expect(db.getByTestId('orb-card-kind')).toHaveText('database · 8 rows');
  await expect(db.getByTestId('card-db-row').first()).toBeVisible();
  await settled(page);
  const stored = datasets(canvasId);
  expect(stored).toHaveLength(1);
  expect(stored[0]!.columns.map((c) => [c.name, c.type])).toEqual([
    ['Company', 'text'],
    ['Stage', 'select'],
    ['ARR', 'number'],
    ['Founded', 'date'],
  ]);
  await capture(page, 'database-card');

  // ---- Reader: views, filter, sort, group ----
  await db.getByTestId('orb-card-title').dblclick();
  await expect(reader(page)).toBeVisible();
  await expect(page.getByTestId('reader-db-editor')).toBeVisible();
  await expect(page.getByTestId('reader-db-row')).toHaveCount(8);

  await page.getByTestId('dataset-filter-add').click();
  await page.getByTestId('dataset-filter-0-column').selectOption({ label: 'Stage' });
  await page.getByTestId('dataset-filter-0-op').selectOption({ label: 'is' });
  await page.getByTestId('dataset-filter-0-value').fill('Seed');
  await page.getByTestId('dataset-filter-0-value').blur();
  await expect(page.getByTestId('reader-db-row')).toHaveCount(4);
  await page.getByTestId('dataset-sort-column').selectOption({ label: 'ARR' });
  await page.getByTestId('dataset-sort-dir').selectOption('desc');
  await expect.poll(() => names(page, 'reader-db-table')).toEqual(['Hooli', 'Acme', 'Initech', 'Piper']);
  await page.getByTestId('dataset-group').selectOption({ label: 'Company' });
  await expect(page.locator('[data-testid="reader-db-table"] th[scope="rowgroup"]')).toHaveCount(4);
  await page.getByTestId('dataset-group').selectOption('');

  // A second view: a board of lanes, a third: a gallery. The first keeps its filter and sort.
  await page.getByTestId('dataset-add-board').click();
  await expect(page.getByTestId('reader-db-board')).toBeVisible();
  await expect(page.locator('[data-testid^="reader-db-lane-"]')).toHaveCount(3 + 0);
  await page.getByTestId('dataset-add-gallery').click();
  await expect(page.getByTestId('reader-db-gallery')).toBeVisible();
  await expect(page.getByTestId('reader-db-tile')).toHaveCount(8);
  await page.getByTestId('dataset-tab-v1').click();
  await expect(page.getByTestId('reader-db-row')).toHaveCount(4);
  await capture(page, 'reader-views');

  // ---- Edits: cell, row, column (the sidecar writes the file) ----
  const cell = page.getByTestId('reader-db-cell-r1-k1');
  await cell.fill('Acme Inc');
  await cell.blur();
  await expect.poll(() => datasets(canvasId)[0]!.rows[0]!.cells.k1).toBe('Acme Inc');
  await page.getByTestId('reader-db-add-row').click();
  await expect(page.getByTestId('reader-db-count')).toContainText('9 rows');
  await page.getByTestId('reader-db-column-name').fill('Notes');
  await page.getByTestId('reader-db-add-column').click();
  await expect(page.getByTestId('reader-db-count')).toContainText('5 columns');
  await expect.poll(() => datasets(canvasId)[0]!.rows.length).toBe(9);
  await expect
    .poll(() => datasets(canvasId)[0]!.columns.map((c) => c.name))
    .toEqual(['Company', 'Stage', 'ARR', 'Founded', 'Notes']);
  await page.keyboard.press('Escape');
  await expect(reader(page)).toHaveCount(0);
  await settled(page);
  // The board card follows the dataset (9 rows) and the active view (the filtered table: 4 Seed rows).
  await expect(db.getByTestId('orb-card-kind')).toHaveText('database · 9 rows');
  await expect(db.getByTestId('card-db-row')).toHaveCount(4);

  // ---- XLSX through the picker; JSON by drop ----
  await page.getByTestId('tool-add-card').click();
  await page.getByTestId('add-card-database').click();
  await page.getByTestId('data-import-input').setInputFiles({
    name: 'book.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(
      makeXlsx({
        Sheet1: [
          ['City', 'People'],
          ['Oslo', 700000],
          ['Bergen', 290000],
        ],
      }),
    ),
  });
  await expect(card(page, 'database')).toHaveCount(2);
  await expect(card(page, 'database').nth(1).getByTestId('orb-card-kind')).toHaveText('database · 2 rows');
  await drop(page, 300, 700, [
    spec('rows.json', 'application/json', '[{"k":"a","n":1},{"k":"b","n":2},{"k":"c","n":3}]'),
  ]);
  await expect(card(page, 'database')).toHaveCount(3);
  await settled(page);
  expect(
    datasets(canvasId)
      .map((d) => d.rows.length)
      .sort(),
  ).toEqual([2, 3, 9]);
  await expect(page.getByTestId('board-notice')).toHaveCount(0);

  // ---- Table card → Database (selection bar), undoable ----
  await drop(page, 1000, 560, [spec('scores.csv', 'text/csv', 'name,score\nAda,3\nBob,10\nCy,7\n')]);
  await expect(card(page, 'table')).toHaveCount(1);
  await settled(page);
  await card(page, 'table').getByTestId('card-select').check();
  await page.getByTestId('card-promote').click();
  await expect(card(page, 'table')).toHaveCount(0);
  await expect(card(page, 'database')).toHaveCount(4);
  await settled(page);
  await page.mouse.click(1380, 880); // focus the board
  await page.keyboard.press('Meta+z');
  await expect(card(page, 'table')).toHaveCount(1);
  await expect(card(page, 'database')).toHaveCount(3);
  await page.keyboard.press('Meta+Shift+z');
  await expect(card(page, 'database')).toHaveCount(4);
  await settled(page);

  // ---- Attach a dataset view to a note ----
  await page.getByTestId('tool-add-card').click();
  await page.getByTestId('add-card-note').click();
  await expect(reader(page)).toBeVisible();
  await page.getByTestId('reader-note-title').fill('Pipeline thoughts');
  await page.getByTestId('reader-tab-data').click();
  await page.getByTestId('data-pick-existing').first().click();
  await expect(page.getByTestId('attached-editor')).toBeVisible();
  await page.getByTestId('dataset-add-board').click();
  await page.keyboard.press('Escape');
  await expect(reader(page)).toHaveCount(0);
  await settled(page);
  const note = card(page, 'note').filter({ hasText: 'Pipeline thoughts' });
  await expect(note.getByTestId('attached-strip')).toBeVisible();
  await expect(note.getByTestId('attached-strip')).toContainText('rows');
  await expect(note.getByTestId('attached-board')).toBeVisible();
  await capture(page, 'attached');
  // detach from the selection bar → Data → Detach; undo brings it back
  await note.getByTestId('card-select').check();
  await page.getByTestId('card-attach-data').click();
  await page.getByTestId('data-detach').click();
  await page.keyboard.press('Escape');
  await expect(note.getByTestId('attached-strip')).toHaveCount(0);
  await settled(page);
  await page.mouse.click(1380, 880);
  await page.keyboard.press('Meta+z');
  await expect(note.getByTestId('attached-strip')).toBeVisible();
  await settled(page);

  // ---- Security ----
  const origin = new URL(page.url()).origin;
  expect(
    requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')),
  ).toEqual([]);
  expect(consoleLines.filter((l) => /Content Security Policy|Refused to/i.test(l))).toEqual([]);
  await expect(page.getByTestId('orb-error')).toHaveCount(0);

  // ---- Quit and relaunch ----
  await expect.poll(async () => (await uiBoard(page)).seq - (events(canvasId).length - 1)).toBe(0);
  const finalBoard = await uiBoard(page);
  expect(fold(events(canvasId))).toEqual(finalBoard);
  const dbCard = Object.values(finalBoard.cards).find(
    (c) => c.type === 'database' && c.view?.views.length === 3,
  )!;
  expect(dbCard.view).toMatchObject({ rowCount: 9, active: 'v1' });
  expect(dbCard.view!.views[0]).toMatchObject({
    kind: 'table',
    filter: [{ op: 'eq', value: 'Seed' }],
    sort: [{ dir: 'desc' }],
  });
  await app!.close();
  app = undefined;

  page = await launch();
  // Home search finds a row of a dataset through the cards that show it: the Database card and the note it is attached to.
  await page.getByTestId('home-search').fill('Vandelay');
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-query', 'Vandelay');
  await expect(page.locator(`[data-testid="search-hit"][data-canvas-id="${canvasId}"]`)).toHaveCount(2);
  await expect(page.getByTestId('search-hit').filter({ hasText: '· database' })).toHaveCount(1);
  await page.getByTestId('search-hit').filter({ hasText: '· database' }).click();
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await expect.poll(async () => (await uiBoard(page)).seq).toBe(finalBoard.seq);
  expect(await uiBoard(page)).toEqual(finalBoard);
  await expect(card(page, 'database').first().getByTestId('card-db-row')).toHaveCount(4);
  await expect(
    card(page, 'note').filter({ hasText: 'Pipeline thoughts' }).getByTestId('attached-strip'),
  ).toBeVisible();
  expect(consoleLines.filter((l) => /Content Security Policy|Refused to/i.test(l))).toEqual([]);
});
