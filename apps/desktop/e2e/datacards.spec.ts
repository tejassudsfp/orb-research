/// <reference lib="dom" />
/**
 * P6.4 data cards in the real app (temp homes, no model calls):
 *   - Chart (Vega-Lite rendered to SVG in the renderer), Metric, Timeline and Comparison matrix render on the board
 *     (written by the canvas service as agent cards: a chart bound to a Database gets its points from the sidecar);
 *   - the chart is drawn under the app CSP (script-src 'self', no 'unsafe-eval'): no CSP violation, no EvalError,
 *     and the SVG is vector text and paths;
 *   - a bound chart is live: editing a cell of the Database in its reader changes the board chart's labels;
 *   - "Chart" in the selection bar makes a chart bound to a Database or Table card, and the chart reader's controls
 *     (mark, columns) change it, each undoable with Cmd+Z;
 *   - Metric, Timeline and Matrix readers show source, events and the highlighted winner;
 *   - quit and relaunch: the board is exact; nothing leaves the sidecar origin.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { CanvasStore } from '@orb/canvas';
import { fold, type Actor, type BoardEvent, type BoardState } from '@orb/shared';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { liveWindow } from './support/ui.ts';

const desktopDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(desktopDir, '..', '..');

let tmp: string;
let app: ElectronApplication | undefined;
let canvasId: string;
const consoleLines: string[] = [];
const requests: string[] = [];

const agent = (who: 'orb' | 'scout' | 'builder'): Actor => ({ kind: 'agent', agent: who, model: 'm', sessionId: `s-${who}` });

async function seed(home: string): Promise<string> {
  const store = new CanvasStore({ home, searchIndex: false, flushMs: 5 });
  try {
    const meta = await store.create({ prompt: 'Data cards' });
    const id = meta.id;
    const frame = await store.command(id, {
      type: 'frame.added',
      frame: { title: 'Numbers', color: 'sky', x: 80, y: 120, w: 1500, h: 900 },
    });
    const frameId = (frame.data as { frame: { id: string } }).frame.id;
    const { dataset } = await store.datasets.create(
      id,
      'Pipeline',
      ['Company', 'Stage', 'ARR'],
      [
        ['Acme', 'Seed', '1.2'],
        ['Globex', 'Series A', '4.5'],
        ['Initech', 'Seed', '0.8'],
      ],
      agent('builder'),
    );
    const { databaseDataOf, newCardView } = await import('@orb/shared');
    const place = (type: string, data: unknown, actor: Actor, extra: Record<string, unknown> = {}) =>
      store.placeAgentCard(id, { type: type as never, frameId, data, why: 'Seeded for the data card test', ...extra } as never, actor);
    await place('database', databaseDataOf('Pipeline', dataset), agent('builder'), { view: newCardView(dataset) });
    await place(
      'chart',
      {
        title: 'ARR by company',
        mark: 'bar',
        x: 'Company',
        y: 'ARR',
        source: { kind: 'dataset', datasetId: dataset.id },
        points: [],
      },
      agent('builder'),
    );
    await place(
      'metric',
      {
        title: 'Annual recurring revenue',
        value: '$4.2M',
        change: { value: '+12%', direction: 'up', good: true },
        period: 'FY2025',
        source: { url: 'https://example.org/arr', label: 'Annual report' },
      },
      agent('scout'),
    );
    await place(
      'timeline',
      {
        title: 'Company history',
        events: [
          { date: '2024', label: 'Public beta', source: { label: 'Company blog' } },
          { date: '2023-05', label: 'Seed round', detail: 'Led by a fund.', source: { url: 'https://example.org/seed' } },
          { date: '2025-09-30', label: 'Series A', source: { url: 'https://example.org/a' } },
        ],
      },
      agent('scout'),
    );
    await place(
      'matrix',
      {
        title: 'Vendor comparison',
        criteria: [
          { name: 'Cost', weight: 3 },
          { name: 'Speed', weight: 1 },
        ],
        options: [
          { name: 'Alpha', scores: [8, 5] },
          { name: 'Beta', scores: [4, 9] },
        ],
      },
      agent('orb'),
    );
    await place(
      'table',
      { title: 'Prices', columns: ['Plan', 'Price'], rows: [['Free', '0'], ['Pro', '20'], ['Team', '50']], totalRows: 3 },
      agent('builder'),
    );
    return id;
  } finally {
    await store.close();
  }
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
  page.on('pageerror', (err) => consoleLines.push(`pageerror: ${err.message}`));
  page.on('request', (req) => requests.push(req.url()));
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1600, 1000);
    await new Promise((r) => setTimeout(r, 300));
  });
  await expect(page.getByTestId('orb-ping')).toHaveText(/^orb-host /);
  await page.evaluate((id) => (location.hash = `#/canvas/${id}`), canvasId);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  return page;
}

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-datacards-'));
  canvasId = await seed(join(tmp, 'Orb'));
});
test.afterAll(async () => {
  await app?.close().catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
});

const events = (): BoardEvent[] =>
  readFileSync(join(tmp, 'Orb', 'canvases', canvasId, 'board.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BoardEvent);
const uiBoard = async (page: Page): Promise<BoardState> =>
  JSON.parse((await page.getByTestId('orb-board-state').textContent())!) as BoardState;
const settled = (page: Page) => expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-pending', '0');
const card = (page: Page, type: string) => page.locator(`[data-testid="orb-card"][data-card-type="${type}"]`);
const reader = (page: Page) => page.getByTestId('reader');
const chartData = async (page: Page, index = 0) =>
  Object.values((await uiBoard(page)).cards).filter((c) => c.type === 'chart')[index]!.data as Record<string, unknown>;

async function capture(page: Page, name: string) {
  if (process.env.ORB_UPDATE_SCREENS !== '1') return;
  await page.waitForTimeout(300);
  const dir = join(repoRoot, 'docs', 'screens');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `p6.4-${name}.png`) });
}

test('Chart, Metric, Timeline, Matrix: render, live binding, Chart this, controls, reader; CSP clean; relaunch exact', async () => {
  let page = await launch();

  // ---- The four cards on the board ----
  const chart = card(page, 'chart').first();
  await expect(chart).toBeVisible();
  const board = chart.getByTestId('card-chart');
  await expect(board).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  // The sidecar worked out the points from the dataset; the SVG is vector (paths and text).
  expect((await chartData(page)).points).toEqual([
    { x: 'Acme', y: 1.2 },
    { x: 'Globex', y: 4.5 },
    { x: 'Initech', y: 0.8 },
  ]);
  await expect(board.locator('svg path').first()).toBeVisible();
  await expect(board.locator('svg text', { hasText: 'Globex' })).toHaveCount(1);
  await expect(board.locator('svg image, svg foreignObject')).toHaveCount(0);
  await expect(chart.getByTestId('orb-card-kind')).toHaveText('bar chart');
  await expect(board).toHaveAttribute('aria-label', /bar chart "ARR by company": ARR by Company\. Acme 1\.2, Globex 4\.5, Initech 0\.8/);

  const metric = card(page, 'metric');
  await expect(metric.getByTestId('metric-value')).toContainText('$4.2M');
  await expect(metric.getByTestId('metric-change')).toContainText('+12%');
  await expect(metric).toContainText('FY2025');
  await expect(metric).toContainText('Annual report');

  const timeline = card(page, 'timeline');
  await expect(timeline.getByTestId('timeline-event')).toHaveCount(3);
  await expect(timeline.getByTestId('timeline-event').first()).toContainText('May 2023');
  await expect(timeline.getByTestId('timeline-event').nth(2)).toContainText('30 Sep 2025');

  const matrix = card(page, 'matrix');
  await expect(matrix.getByTestId('matrix-winner')).toHaveCount(1);
  await expect(matrix.getByTestId('matrix-winner')).toContainText('7.25');
  await expect(matrix.getByTestId('matrix-winner')).toContainText('best');
  await capture(page, 'cards');

  // ---- Live: edit a cell of the Database in its reader; the board chart follows ----
  await card(page, 'database').first().getByTestId('orb-card-title').dblclick();
  await expect(reader(page)).toBeVisible();
  const cell = page.getByTestId('reader-db-cell-r1-k1');
  await cell.fill('Acme Inc');
  await cell.blur();
  await page.keyboard.press('Escape');
  await expect(reader(page)).toHaveCount(0);
  await expect(board.locator('svg text', { hasText: 'Acme Inc' })).toHaveCount(1, { timeout: 15_000 });
  await expect.poll(async () => ((await chartData(page)).points as { x: string }[]).map((p) => p.x)).toEqual(['Acme Inc', 'Globex', 'Initech']);

  // ---- Chart reader: the chart large, its data as a table, controls (each one undoable) ----
  await chart.getByTestId('orb-card-title').dblclick();
  await expect(reader(page)).toBeVisible();
  const big = page.getByTestId('reader-chart');
  await expect(big).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(page.getByTestId('reader-chart-data').locator('tbody tr')).toHaveCount(3);
  await page.getByTestId('chart-mark').selectOption('pie');
  await expect.poll(async () => (await chartData(page)).mark).toBe('pie');
  await expect(big).toHaveAttribute('data-state', 'ready');
  await expect(big.locator('svg text', { hasText: 'Globex' }).first()).toBeVisible();
  await page.getByTestId('chart-y').selectOption('');
  await expect.poll(async () => (await chartData(page)).y).toBeUndefined();
  await page.keyboard.press('Escape');
  await expect(reader(page)).toHaveCount(0);
  await settled(page);
  await page.mouse.click(1560, 980);
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await chartData(page)).y).toBe('ARR');
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await chartData(page)).mark).toBe('bar');

  // ---- "Chart" in the selection bar: a chart bound to a Table card ----
  await card(page, 'table').getByTestId('card-select').check();
  await page.getByTestId('card-make-chart').click();
  await expect(card(page, 'chart')).toHaveCount(2);
  await settled(page);
  const second = (await chartData(page, 1)) as { x: string; y: string; source: { kind: string }; points: { x: string; y: number }[] };
  expect(second).toMatchObject({ x: 'Plan', y: 'Price', source: { kind: 'table' } });
  await expect.poll(async () => ((await chartData(page, 1)).points as unknown[]).length).toBe(3);
  await expect(card(page, 'chart').and(page.locator('[data-selected="true"]')).getByTestId('card-chart')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  // ...and it follows the table when the table changes (here: an undo of nothing is not it; the agent-free path is a user edit)
  // The Database gets its own chart too (Shift+1 first: the board has flown to the new chart).
  await page.keyboard.press('Shift+1');
  await page.waitForTimeout(800); // let the fit flight end before clicking
  await card(page, 'database').first().getByTestId('card-select').check();
  await page.getByTestId('card-make-chart').click();
  await expect(card(page, 'chart')).toHaveCount(3);
  await settled(page);
  await capture(page, 'chart-this');

  // ---- Readers: metric, timeline, matrix (Shift+1: the whole board in view) ----
  await page.keyboard.press('Shift+1');
  await page.waitForTimeout(800); // let the fit flight end before clicking
  await metric.getByTestId('orb-card-title').dblclick();
  await expect(page.getByTestId('reader-metric')).toContainText('$4.2M');
  await expect(page.getByTestId('reader-metric')).toContainText('Annual report');
  await expect(page.getByTestId('reader-open-link')).toBeVisible();
  await page.keyboard.press('Escape');
  await timeline.getByTestId('orb-card-title').dblclick();
  await expect(page.getByTestId('reader-timeline').getByTestId('timeline-event')).toHaveCount(3);
  await expect(page.getByTestId('reader-timeline')).toContainText('Led by a fund.');
  await page.keyboard.press('Escape');
  await matrix.getByTestId('orb-card-title').dblclick();
  await expect(page.getByTestId('reader-matrix').getByTestId('matrix-winner')).toContainText('7.25');
  await page.keyboard.press('Escape');
  await expect(reader(page)).toHaveCount(0);
  await settled(page);

  // ---- Security: under the app CSP, nothing generated code, nothing off the sidecar origin ----
  const origin = new URL(page.url()).origin;
  expect(requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
  expect(consoleLines.filter((l) => /Content Security Policy|Refused to|unsafe-eval|EvalError|pageerror/i.test(l))).toEqual([]);
  await expect(page.getByTestId('orb-error')).toHaveCount(0);

  // ---- Quit and relaunch ----
  await expect.poll(async () => (await uiBoard(page)).seq - (events().length - 1)).toBe(0);
  const finalBoard = await uiBoard(page);
  expect(fold(events())).toEqual(finalBoard);
  await app!.close();
  app = undefined;

  page = await launch();
  await expect.poll(async () => (await uiBoard(page)).seq).toBe(finalBoard.seq);
  expect(await uiBoard(page)).toEqual(finalBoard);
  // The canvas reopens where the user left the camera (P6.20: fitted to the whole board); back to 100% to read a chart.
  await page.getByTestId('zoom-level').click();
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
  await expect(card(page, 'chart').first().getByTestId('card-chart')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(card(page, 'chart').first().locator('svg text', { hasText: 'Acme Inc' })).toHaveCount(1);
  expect(consoleLines.filter((l) => /Content Security Policy|Refused to|unsafe-eval|EvalError|pageerror/i.test(l))).toEqual([]);
});
