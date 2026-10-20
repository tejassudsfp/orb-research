/// <reference lib="dom" />
/**
 * P2.6 Home in the real app (temp homes, no model calls):
 *   - new canvas from the box: a template chip + Enter creates a canvas whose board starts with the template's five
 *     frames (canvas.json keeps the template and its brief);
 *   - seed by drop: a PNG dropped on the ask box opens a new canvas whose first card is that image (copied into
 *     assets/); a dropped link and a typed link make Source cards; dropped text makes a Note; an unsupported file is
 *     refused WITHOUT creating a canvas;
 *   - recent tiles: newest change first, a mini preview with the frames as coloured rects, the status line;
 *   - search: finds cards across canvases from the Home search field; a hit opens its canvas;
 *   - night/day saved in orb.json and restored after a relaunch;
 *   - no CSP violation, no request off the sidecar origin.
 */
import { liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { BoardEvent, CanvasMeta } from '@orb/shared';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { makePng } from '../../../scripts/testkit/fixtures.ts';

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
  await page.screenshot({ path: join(dir, `p2.6-${name}.png`) });
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
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-home-'));
  mkdirSync(join(tmp, 'Orb'));
  writeFileSync(join(tmp, 'Orb', 'orb.json'), JSON.stringify({ theme: 'night' }));
});
test.afterAll(async () => {
  await app?.close().catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
});

const canvasDir = (id: string) => join(tmp, 'Orb', 'canvases', id);
const events = (id: string): BoardEvent[] => {
  try {
    return readFileSync(join(canvasDir(id), 'board.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as BoardEvent);
  } catch {
    return [];
  }
};
const metaOf = (id: string) =>
  JSON.parse(readFileSync(join(canvasDir(id), 'canvas.json'), 'utf8')) as CanvasMeta;
const canvasIds = () => {
  try {
    return readdirSync(join(tmp, 'Orb', 'canvases')).sort();
  } catch {
    return [];
  }
};

type FileSpec = { name: string; type: string; b64: string };
const spec = (name: string, type: string, data: Buffer | string): FileSpec => ({
  name,
  type,
  b64: Buffer.from(data).toString('base64'),
});

/** Dispatch a real drag-and-drop of files and/or data on the Home ask box. */
async function dropOnBox(page: Page, files: FileSpec[], data: Record<string, string> = {}) {
  const box = (await page.getByTestId('home-ask').boundingBox())!;
  const x = box.x + box.width / 3;
  const y = box.y + box.height / 2;
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

/** Wait for the Canvas screen of a newly opened canvas; returns its id. */
async function openedCanvas(page: Page): Promise<string> {
  const screen = page.getByTestId('canvas-screen');
  await expect(screen).toHaveAttribute('data-follow', 'open');
  return (await screen.getAttribute('data-canvas-id'))!;
}

async function home(page: Page) {
  await page.evaluate(() => {
    location.hash = '#/';
  });
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await expect(page.getByTestId('orb-canvas-list')).toHaveAttribute('data-loaded', 'yes');
}

/** No CSP violation, and nothing requested off this launch's sidecar origin. */
function expectClean(page: Page) {
  const origin = new URL(page.url()).origin;
  expect(
    requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')),
  ).toEqual([]);
  expect(consoleLines.filter((l) => /Content Security Policy|Refused to/i.test(l))).toEqual([]);
  requests.length = 0;
}

const card = (page: Page, type: string) => page.locator(`[data-testid="orb-card"][data-card-type="${type}"]`);

test('Home: template canvas, seed by drop, recent tiles, search, night/day saved', async () => {
  let page = await launch();
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await expect(page.getByTestId('orb-root')).toHaveAttribute('data-settings', 'loaded');
  await capture(page, 'home');

  // ---- New canvas from the box, with a template ----
  const chip = page.locator('[data-testid="template-chip"][data-template="topic"]');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('home-prompt').fill('Ocean photosynthesis');
  await page.getByTestId('home-prompt').press('Enter');
  const topicId = await openedCanvas(page);
  await expect(page.locator('[data-testid="orb-frame"]')).toHaveCount(5);
  await expect(page.locator('[data-testid="orb-frame-label"]').first()).toContainText(/THESIS/i);
  expect(metaOf(topicId)).toMatchObject({ title: 'Ocean photosynthesis', template: 'topic' });
  await expect.poll(() => events(topicId).map((e) => e.type)).toEqual(Array(5).fill('frame.added'));
  await capture(page, 'template-canvas');

  // ---- Seed by drop: a PNG ----
  await home(page);
  const png = makePng(32, 24, [96, 165, 250]);
  await dropOnBox(page, [spec('Kelp chart.png', 'image/png', png)]);
  const imageId = await openedCanvas(page);
  await expect(card(page, 'image')).toHaveCount(1);
  expect(metaOf(imageId)).toMatchObject({
    title: 'Kelp chart',
    seed: { kind: 'file', name: 'Kelp chart.png', count: 1 },
  });
  await expect.poll(() => events(imageId).filter((e) => e.type === 'card.added').length).toBe(1);
  const added = events(imageId).filter((e) => e.type === 'card.added');
  const asset = (added[0]!.data as { card: { data: { asset: { path: string } } } }).card.data.asset;
  expect(readFileSync(join(canvasDir(imageId), asset.path)).equals(png)).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const img = document.querySelector<HTMLImageElement>(
          '[data-testid="orb-card"][data-card-type="image"] img',
        );
        return img ? img.complete && img.naturalWidth > 0 : false;
      }),
    )
    .toBe(true);

  // ---- Seed by drop: a link, and text (into the box with a prompt typed) ----
  await home(page);
  await dropOnBox(page, [], {
    'text/uri-list': 'https://example.com/reports/kelp',
    'text/plain': 'https://example.com/reports/kelp',
  });
  const linkId = await openedCanvas(page);
  await expect(card(page, 'source')).toHaveCount(1);
  expect(metaOf(linkId).seed).toEqual({ kind: 'url', name: 'https://example.com/reports/kelp', count: 1 });

  await home(page);
  await page.getByTestId('home-prompt').fill('Field notes');
  await dropOnBox(page, [], {
    'text/plain': 'Seagrass meadows\nphotosynthesis peaks at noon in shallow water',
  });
  const textId = await openedCanvas(page);
  await expect(card(page, 'note')).toHaveCount(1);
  expect(metaOf(textId)).toMatchObject({
    title: 'Field notes',
    seed: { kind: 'text', name: 'Seagrass meadows' },
  });

  // ---- A typed link seeds a Source card ----
  await home(page);
  await page.getByTestId('home-prompt').fill('https://example.org/tides');
  await page.getByTestId('orb-create').click();
  const typedId = await openedCanvas(page);
  await expect(card(page, 'source')).toHaveCount(1);
  expect(metaOf(typedId).seed?.kind).toBe('url');

  // ---- An unsupported file is refused before anything is created ----
  await home(page);
  const before = canvasIds();
  await dropOnBox(page, [spec('setup.exe', 'application/x-msdownload', 'MZ')]);
  await expect(page.getByTestId('orb-error')).toContainText('setup.exe');
  await expect(page.getByTestId('home-screen')).toBeVisible();
  expect(canvasIds()).toEqual(before);

  // ---- Recent tiles: newest change first, frames preview, status ----
  await page.reload();
  await expect(page.getByTestId('orb-canvas-list')).toHaveAttribute('data-loaded', 'yes');
  const tiles = page.getByTestId('orb-canvas-open');
  await expect(tiles).toHaveCount(5);
  await expect(tiles.first()).toHaveAttribute('data-canvas-id', typedId);
  const topicTile = page.locator(`[data-testid="orb-canvas-open"][data-canvas-id="${topicId}"]`);
  await expect(topicTile).toHaveAttribute('data-frames', '5');
  await expect(topicTile.locator('[data-testid="tile-preview"] rect[data-frame-color]')).toHaveCount(5);
  await expect(topicTile.getByTestId('tile-status')).toHaveText('Idle · Topic deep dive · 0 cards');
  const imageTile = page.locator(`[data-testid="orb-canvas-open"][data-canvas-id="${imageId}"]`);
  await expect(imageTile).toHaveAttribute('data-cards', '1');
  await expect(imageTile.locator('[data-testid="tile-preview"] rect')).toHaveCount(1);
  await capture(page, 'tiles');

  // ---- Search across canvases ----
  await page.getByTestId('home-search').fill('photosynthesis');
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-query', 'photosynthesis');
  const hits = page.getByTestId('search-hit');
  // The topic canvas's title and the seeded note's text.
  await expect(hits).toHaveCount(2);
  await expect(page.locator(`[data-testid="search-hit"][data-canvas-id="${textId}"]`)).toContainText(
    'Seagrass meadows',
  );
  await expect(page.locator(`[data-testid="search-hit"][data-canvas-id="${topicId}"]`)).toHaveCount(1);
  await page.getByTestId('home-search').fill('kelp');
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-query', 'kelp');
  // A title-only match is highlighted in the title (no duplicate snippet line).
  const titleHit = page.locator(
    `[data-testid="search-hit"][data-canvas-id="${imageId}"][data-item-id="${imageId}"]`,
  );
  await expect(titleHit.getByTestId('search-hit-title').locator('mark')).toHaveText('Kelp');
  await expect(page.locator(`[data-testid="search-hit"][data-canvas-id="${imageId}"]`).first()).toBeVisible();
  await capture(page, 'search');
  await page.locator(`[data-testid="search-hit"][data-canvas-id="${imageId}"]`).first().click();
  expect(await openedCanvas(page)).toBe(imageId);

  // A card hit opens its canvas with that card selected and flown to (P2.7).
  await home(page);
  await page.getByTestId('home-search').fill('seagrass');
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-query', 'seagrass');
  const cardHit = page
    .locator(`[data-testid="search-hit"][data-canvas-id="${textId}"][data-item-id^="c_"]`)
    .first();
  const cardItem = (await cardHit.getAttribute('data-item-id'))!;
  expect(cardItem).toMatch(/^c_/);
  await cardHit.click();
  expect(await openedCanvas(page)).toBe(textId);
  const hitCard = page.locator(`article[data-card-id="${cardItem}"]`);
  await expect(hitCard).toHaveAttribute('data-selected', 'true');
  await expect(hitCard).toBeInViewport({ ratio: 1 });

  // ---- Night/day saved in orb.json and restored on relaunch ----
  await home(page);
  await expect(page.getByTestId('orb-root')).toHaveAttribute('data-theme', 'night');
  await page.getByTestId('theme-toggle').click();
  await expect(page.getByTestId('orb-root')).toHaveAttribute('data-theme', 'day');
  await expect(page.getByTestId('home-tagline')).toHaveText('Everything the sun touches');
  await expect
    .poll(() => {
      try {
        return (JSON.parse(readFileSync(join(tmp, 'Orb', 'orb.json'), 'utf8')) as { theme: string }).theme;
      } catch {
        return undefined;
      }
    })
    .toBe('day');
  await capture(page, 'day');
  expectClean(page);
  await app!.close();
  app = undefined;

  page = await launch();
  await expect(page.getByTestId('orb-root')).toHaveAttribute('data-settings', 'loaded');
  await expect(page.getByTestId('orb-root')).toHaveAttribute('data-theme', 'day');
  // The saved appearance now covers the canvas as well as Home and Settings.
  await page.getByTestId('orb-canvas-open').first().click();
  await expect(page.getByTestId('orb-root')).toHaveAttribute('data-theme', 'day');

  expectClean(page);
});
