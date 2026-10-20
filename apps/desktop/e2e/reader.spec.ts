/// <reference lib="dom" />
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { CanvasStore } from '@orb/canvas';
import { databaseDataOf, newCardView, type Dataset } from '@orb/shared';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { seedPrintFixture, type PrintFixture } from '../../../scripts/testkit/printFixture.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';
import { liveWindow } from './support/ui.ts';
import { axeScan, contrastScan, formatContrast, formatViolations } from './support/a11y.ts';

test.describe.configure({ mode: 'serial' });
let app: ElectronApplication;
let page: Page;
let tmp: string;
let fixture: PrintFixture;
let datasetId: string;
const detail = 'Evidence and qualification: '.repeat(70) + 'Complete final evidence sentence.';
const tableDetail = detail.slice(0, 400) + 'Full table evidence ends here.';
const columns = [
  'Company',
  'Website',
  'Segment',
  'Headquarters',
  'Why a fit',
  'Trigger',
  'Buyer role',
  'Source',
  'Priority',
  'Reviewed',
  'Private notes',
];

async function open(type: keyof PrintFixture['cards']) {
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await page.keyboard.press('Meta+f');
  await page.getByTestId('board-search-input').fill('');
  const markers = {
    database: 'Target accounts',
    table: 'Tablemarker',
    diagram: 'Diagrammarker',
    source: 'Sourcemarker',
  };
  await page.getByTestId('board-search-input').fill(markers[type as keyof typeof markers]);
  await expect(page.getByTestId('board-search-count')).toHaveText('1 of 1');
  await page.keyboard.press('Escape');
  await page.locator(`[data-card-id="${fixture.cards[type]}"]`).getByTestId('orb-card-title').click();
  await expect(page.getByTestId('reader')).toBeVisible();
}

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-reader-'));
  const home = join(tmp, 'Orb');
  fixture = await seedPrintFixture(home, { frames: 5 });
  const store = new CanvasStore({ home, searchIndex: false, flushMs: 5 });
  try {
    const ds = await store.datasets.createFromSchema(
      fixture.canvasId,
      'Target accounts',
      columns.map((name, i) => ({
        name,
        type: i === 9 ? 'checkbox' : i === 8 ? 'number' : i === 1 || i === 7 ? 'url' : 'text',
      })),
      Array.from({ length: 51 }, (_, i) => [
        `Company ${String(i + 1).padStart(2, '0')}`,
        `https://example.com/company/${i + 1}`,
        i % 2 ? 'EU/UK' : 'Singapore',
        `Full headquarters address ${i + 1}`,
        detail,
        `Public trigger and qualification ${i + 1}`,
        'Head of responsible AI and operational risk',
        `https://example.com/source/${i + 1}`,
        51 - i,
        i % 2 === 0,
        `Hidden field ${i + 1}`,
      ]),
    );
    datasetId = ds.id;
    const view = newCardView(ds);
    view.views[0]!.hidden = ['k11'];
    await store.command(fixture.canvasId, {
      type: 'card.updated',
      id: fixture.cards.database,
      patch: { data: databaseDataOf('Target accounts', ds), view },
    });
    await store.command(fixture.canvasId, {
      type: 'card.updated',
      id: fixture.cards.table,
      patch: {
        data: {
          title: 'Tablemarker detail',
          columns: ['Company', 'Detailed evidence', 'Source'],
          rows: [
            ['Alpha', tableDetail, 'https://example.com/alpha'],
            ['Beta', 'Full second row', 'https://example.com/beta'],
          ],
          totalRows: 2,
        },
      },
    });
    const diagram = (await store.board(fixture.canvasId)).current.cards[fixture.cards.diagram]!;
    await store.command(fixture.canvasId, {
      type: 'card.updated',
      id: diagram.id,
      patch: { data: { ...(diagram.data as object), title: 'Diagrammarker flow' } },
    });
  } finally {
    await store.close();
  }
  writeFileSync(
    join(home, 'orb.json'),
    JSON.stringify({ appearance: { themeId: 'paper', accent: '#7048E8', mode: 'light' } }),
  );
  app = await electron.launch({
    args: [resolve(import.meta.dirname, '..')],
    env: {
      ...process.env,
      ORB_HOME: home,
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_USER_DATA: join(tmp, 'electron'),
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate((id) => {
    location.hash = `#/canvas/${id}`;
  }, fixture.canvasId);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
});
test.afterAll(async () => {
  await app?.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('full-screen database: all rows, readable cells, complete row rail, filtered navigation, edit/cancel and keyboard return', async () => {
  await open('database');
  const dialog = page.getByRole('dialog', { name: 'Target accounts', exact: true });
  const bounds = await dialog.boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(bounds).toMatchObject({ x: 0, y: 0, ...viewport });
  await expect(page.getByTestId('reader-db-row')).toHaveCount(51);
  const cell = page.getByTestId('reader-db-cell-r1-k5');
  await expect(cell).toHaveJSProperty('tagName', 'TEXTAREA');
  await expect(cell).toHaveValue(detail);
  expect(await cell.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(170);
  const table = page.getByTestId('reader-db-table');
  await table.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => table.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await page.getByTestId('reader-db-row-open').first().click();
  const rail = page.getByTestId('row-details');
  await expect(rail).toContainText(detail);
  await expect(rail.locator('dt')).toHaveText(columns);
  await expect(rail).toContainText('Hidden field 1');
  await expect(rail.getByRole('link').first()).toHaveAttribute('href', 'https://example.com/company/1');
  await rail.getByRole('button', { name: 'Next row' }).click();
  await expect(rail).toContainText('Company 02');
  await page.keyboard.press('Escape');
  await expect(rail).toHaveCount(0);
  await expect(page.getByTestId('reader')).toBeVisible();
  await expect(page.getByTestId('reader-db-row-open').first()).toBeFocused();
  await page.getByTestId('dataset-add-gallery').click();
  await page.getByTestId('reader-db-tile-open').last().click();
  await expect(rail).toContainText('Hidden field 51');
  await page.keyboard.press('Escape');
  await page.getByTestId('dataset-add-board').click();
  await page.getByTestId('dataset-group').selectOption({ label: 'Segment' });
  await page.getByTestId('reader-db-card-open').first().click();
  await expect(rail.locator('dt')).toHaveText(columns);
  await page.keyboard.press('Escape');
  await page.getByTestId('dataset-tab-v1').click();
  await page.getByTestId('dataset-filter-add').click();
  await page.getByTestId('dataset-filter-0-column').selectOption({ label: 'Segment' });
  await page.getByTestId('dataset-filter-0-value').fill('EU/UK');
  await page.getByTestId('dataset-filter-0-value').blur();
  await expect(page.getByTestId('reader-db-row')).toHaveCount(25);
  await page.getByTestId('reader-db-row-open').first().click();
  await expect(rail).toContainText('Company 02');
  await rail.getByRole('button', { name: 'Next row' }).click();
  await expect(rail).toContainText('Company 04');
  await rail.getByRole('button', { name: 'Close row details' }).click();
  const edit = page.getByTestId('reader-db-cell-r2-k5');
  await edit.fill('Discard this draft');
  await page.keyboard.press('Escape');
  await expect(edit).toHaveValue(detail);
  await expect(page.getByTestId('reader')).toBeVisible();
  await edit.fill('Saved first line\nSaved complete second line');
  await edit.blur();
  await expect
    .poll(
      () =>
        (
          JSON.parse(
            readFileSync(
              join(tmp, 'Orb', 'canvases', fixture.canvasId, 'assets', 'data', `${datasetId}.json`),
              'utf8',
            ),
          ) as Dataset
        ).rows[1]!.cells.k5,
    )
    .toBe('Saved first line\nSaved complete second line');
  await page.getByTestId('reader-db-row-open').first().click();
  await expect(rail).toContainText('Saved complete second line');
  await page.screenshot({
    path: resolve('.orb-dev/e2e-results', ...namespaceSegments(), 'reader-table-light.png'),
  });
  expect(formatViolations(await axeScan(page, { exclude: ['iframe'] }))).toBe('');
  expect(formatContrast(await contrastScan(page))).toBe('');
  await page.screenshot({
    path: resolve('.orb-dev/e2e-results', ...namespaceSegments(), 'reader-table-light.png'),
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('reader')).toHaveCount(0);
  await expect(page.getByTestId('canvas-background')).not.toHaveAttribute('inert');
});

test('tables and other card types use the full screen; row details fit the minimum window in both modes', async () => {
  await page.evaluate(() => {
    location.hash = '#/settings';
  });
  await page.getByTestId('appearance-mode-dark').click();
  await page.evaluate((id) => {
    location.hash = `#/canvas/${id}`;
  }, fixture.canvasId);
  await open('table');
  await page.getByTestId('reader-table-row-open').first().click();
  const rail = page.getByTestId('row-details');
  await expect(rail).toContainText(tableDetail);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 600));
  await expect(rail.getByRole('button', { name: 'Close row details' })).toBeVisible();
  expect(await rail.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(
    await page.getByTestId('reader-body').evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1);
  await rail.getByRole('button', { name: 'Next row' }).click();
  await expect(rail).toContainText('Full second row');
  expect(formatViolations(await axeScan(page, { exclude: ['iframe'] }))).toBe('');
  expect(formatContrast(await contrastScan(page))).toBe('');
  await page.screenshot({
    path: resolve('.orb-dev/e2e-results', ...namespaceSegments(), 'reader-table-dark-small.png'),
  });
  await page.getByTestId('reader-close').click();
  for (const type of ['source', 'diagram'] as const) {
    await open(type);
    expect((await page.getByTestId('reader').getByRole('dialog').boundingBox())?.width).toBe(960);
    if (type === 'diagram') {
      await expect(page.getByTestId('reader-diagram')).toHaveAttribute('data-state', 'ready');
      await page.getByRole('button', { name: 'Zoom in visual', exact: true }).click();
      await expect(page.getByTestId('visual-zoom')).toHaveText('125%');
    }
    await page.getByTestId('reader-close').click();
    await expect(page.getByTestId('reader')).toHaveCount(0);
    await expect(page.getByTestId('canvas-background')).not.toHaveAttribute('inert');
  }
});
