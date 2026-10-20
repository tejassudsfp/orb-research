/// <reference lib="dom" />
/**
 * P6.18 visual review, in the real app (temp homes, mock LLM). Two jobs:
 *   1. Every card type of the export fixture (all 28, incl. Database) renders at all three levels of detail
 *      (title, compact, full) in night and day: the card's box is non-empty, nothing paints as "undefined" or
 *      "[object Object]", and the card text is not clipped sideways. Every screen (Home, Settings, First run, Canvas,
 *      Reader, Composer, Port, Deck) renders in both themes without console errors.
 *   2. ORB_UPDATE_SCREENS=1 writes the review captures to docs/screens/p6/: the screens, and one contact sheet per
 *      level of detail and theme (`cards-<lod>-<theme>.png`, every card type labelled by its position in the sheet's
 *      legend, which is `cards-order.txt`).
 * The a11y spec (a11y.spec.ts) runs axe and the contrast scan over the same board.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { CardType } from '@orb/shared';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { seedPrintFixture, type PrintFixture } from '../../../scripts/testkit/printFixture.ts';
import { liveWindow } from './support/ui.ts';
import { repoRoot } from './support/screenshot.ts';

test.describe.configure({ mode: 'serial' });

const desktopDir = resolve(import.meta.dirname, '..');
const UPDATE = process.env.ORB_UPDATE_SCREENS === '1';
const OUT = join(repoRoot, 'docs', 'screens', 'p6');
let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
let fixture: PrintFixture;
const consoleErrors: string[] = [];

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-visual-'));
  fixture = await seedPrintFixture(join(tmp, 'Orb'), { frames: 10, title: 'Visual review board' });
  llm = await new MockLlm({ defaultTurn: { text: 'Done.' } }).start();
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
      ORB_KEYCHAIN_SERVICE: 'ai.orb.app.test.visual',
      [MOCK_KEY_ENV]: 'orb-mock-key',
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  await page.waitForLoadState('domcontentloaded');
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900);
    await new Promise((r) => setTimeout(r, 300));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (UPDATE) mkdirSync(OUT, { recursive: true });
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const go = (hash: string) => page.evaluate((h) => (location.hash = h), hash);
const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
async function setTheme(want: 'night' | 'day') {
  await go('#/');
  await expect(page.getByTestId('home-screen')).toBeVisible();
  if ((await theme()) !== want) await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', want);
}
async function shot(name: string) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(250);
  if (UPDATE) await page.screenshot({ path: join(OUT, `${name}.png`) });
}
const openCanvas = async () => {
  await go(`#/canvas/${fixture.canvasId}`);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await expect(page.getByTestId('orb-card').first()).toBeVisible();
  // Measured heights can move a later card between reading its position and flying to it. Scan a settled board.
  let previous = '';
  let still = 0;
  for (let i = 0; i < 80 && still < 4; i++) {
    await page.waitForTimeout(200);
    const current = (await page.getByTestId('orb-board-state').textContent()) ?? '';
    still = current === previous && (await page.getByTestId('measurer').count()) === 0 ? still + 1 : 0;
    previous = current;
  }
  expect(still).toBe(4);
};

type View = { panX: number; panY: number; zoom: number };
const readView = (): Promise<View> =>
  page.evaluate(() => {
    const m = new DOMMatrixReadOnly(
      getComputedStyle(document.querySelector('[data-testid="world"]')!).transform,
    );
    return { panX: m.e, panY: m.f, zoom: m.a };
  });
/** Zoom (towards the screen point) and pan with synthetic wheel gestures, the way the canvas reads them. */
async function gesture(deltaY: number, ctrl: boolean, x: number, y: number, deltaX = 0) {
  await page.evaluate(
    ([dy, c, cx, cy, dx]) => {
      const world = document.querySelector('[data-testid="world"]')!;
      world.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: dy,
          deltaX: dx,
          ctrlKey: c,
          clientX: cx,
          clientY: cy,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    [deltaY, ctrl, x, y, deltaX] as const,
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
/** Put the world point (wx, wy) at the screen centre of the canvas at `zoom`. */
async function viewAt(wx: number, wy: number, zoom: number) {
  const box = (await page.getByTestId('canvas-screen').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2 - 40;
  const v0 = await readView();
  await gesture(-Math.log(zoom / v0.zoom) / 0.0015, true, cx, cy);
  await expect.poll(async () => Math.abs((await readView()).zoom - zoom)).toBeLessThan(0.0001);
  const v = await readView();
  const dx = cx - box.x - (wx * v.zoom + v.panX);
  const dy = cy - box.y - (wy * v.zoom + v.panY);
  await gesture(-dy, false, cx, cy, -dx);
  await expect.poll(async () => {
    const landed = await readView();
    return Math.max(
      Math.abs(landed.panX - (cx - box.x - wx * zoom)),
      Math.abs(landed.panY - (cy - box.y - wy * zoom)),
    );
  }).toBeLessThan(1);
}

const LODS = [
  { lod: 'title', zoom: 0.3 },
  { lod: 'compact', zoom: 0.5 },
  { lod: 'full', zoom: 1 },
] as const;
const TYPES = CardType.options;

/** Crop a PNG buffer's pixels into a sheet cell. */
function paste(sheet: PNG, src: PNG, ox: number, oy: number) {
  PNG.bitblt(
    src,
    sheet,
    0,
    0,
    Math.min(src.width, sheet.width - ox),
    Math.min(src.height, sheet.height - oy),
    ox,
    oy,
  );
}

for (const mode of ['night', 'day'] as const) {
  // The canvas and everything reached from it is night only (PRD, Day mode): day cards are the same pixels.
  if (mode === 'night')
    test(`every card type at title, compact and full detail in ${mode}`, async () => {
      await setTheme(mode);
      await openCanvas();
      const ids = fixture.cards as Record<string, string>;
      for (const { lod, zoom } of LODS) {
        const cells: { type: string; png: PNG }[] = [];
        const bad: string[] = [];
        for (const type of TYPES) {
          const id = ids[type];
          expect(id, `fixture card for ${type}`).toBeTruthy();
          // Fly to the card: centre its world box at the wanted zoom (P6.20: where the layout engine put it, from the
          // folded board, not where the fixture first wrote it).
          const rect = await page.getByTestId('orb-board-state').evaluate((el, cid) => {
            const c = (
              JSON.parse(el.textContent ?? '{}') as {
                cards: Record<string, { x: number; y: number; w: number; h: number }>;
              }
            ).cards[cid]!;
            return { x: c.x, y: c.y, w: c.w, h: c.h };
          }, id);
          await viewAt(rect.x + rect.w / 2, rect.y + rect.h / 2, zoom);
          const loc = page.locator(`[data-testid="orb-card"][data-card-id="${id}"]`);
          await expect(loc, `${type} at ${lod}: ${JSON.stringify({ rect, view: await readView() })}`).toBeVisible();
          await expect(page.getByTestId('world')).toHaveAttribute('data-lod', lod);
          const box = (await loc.boundingBox())!;
          if (box.width < 20 || box.height < 12)
            bad.push(`${type}: collapsed box ${box.width}x${box.height}`);
          const text = (await loc.innerText()).trim();
          if (/undefined|\[object Object\]|NaN/.test(text))
            bad.push(`${type}: bad text "${text.slice(0, 80)}"`);
          const sideways = await loc.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return Array.from(el.querySelectorAll('*')).filter((c) => {
              const cr = c.getBoundingClientRect();
              if (!(cr.width > 0 && (cr.right > r.right + 2 || cr.left < r.left - 2))) return false;
              // Clipped by the card or an ancestor inside it (overflow hidden/clip/auto/scroll): not painted outside.
              for (let a: Element | null = c.parentElement; a; a = a.parentElement) {
                if (/hidden|clip|auto|scroll/.test(getComputedStyle(a).overflowX)) return false;
                if (a === el) break;
              }
              return getComputedStyle(c).position !== 'fixed';
            }).length;
          });
          if (sideways > 0) bad.push(`${type}: ${sideways} element(s) overflow the card sideways at ${lod}`);
          if (UPDATE) {
            // The seeded board overlaps cards of different frames: capture this one alone.
            await page.evaluate((cid) => {
              for (const c of document.querySelectorAll<HTMLElement>('[data-testid="orb-card"]'))
                c.style.visibility = c.getAttribute('data-card-id') === cid ? 'visible' : 'hidden';
            }, id);
            await page.waitForTimeout(300);
            cells.push({ type, png: PNG.sync.read(await loc.screenshot()) });
            await page.evaluate(() => {
              for (const c of document.querySelectorAll<HTMLElement>('[data-testid="orb-card"]'))
                c.style.visibility = '';
            });
          }
        }
        expect(bad, `${mode} ${lod}`).toEqual([]);
        if (UPDATE) {
          const cols = 4;
          const cw = Math.max(...cells.map((c) => c.png.width)) + 16;
          const ch = Math.max(...cells.map((c) => c.png.height)) + 16;
          const rows = Math.ceil(cells.length / cols);
          const sheet = new PNG({ width: cols * cw + 16, height: rows * ch + 16 });
          const bg = mode === 'night' ? [12, 14, 18, 255] : [236, 233, 226, 255];
          for (let i = 0; i < sheet.data.length; i += 4) sheet.data.set(bg, i);
          cells.forEach((c, i) => paste(sheet, c.png, 16 + (i % cols) * cw, 16 + Math.floor(i / cols) * ch));
          writeFileSync(join(OUT, `cards-${lod}-${mode}.png`), PNG.sync.write(sheet));
          writeFileSync(
            join(OUT, 'cards-order.txt'),
            cells.map((c, i) => `${i + 1}. ${c.type}`).join('\n') + '\n',
          );
        }
      }
    });

  test(`screens in ${mode}`, async () => {
    await setTheme(mode);
    await shot(`home-${mode}`);
    await go('#/settings');
    await expect(page.getByTestId('provider-card').first()).toBeVisible();
    await shot(`settings-${mode}`);
    await page.getByTestId('settings-screen').evaluate((el) => {
      const sc = el.closest('main') ?? el;
      (sc as HTMLElement).scrollTop = 99999;
      el.scrollTop = 99999;
    });
    await shot(`settings-bottom-${mode}`);
    await go('#/first-run');
    await expect(page.getByTestId('first-run-screen')).toBeVisible();
    await shot(`first-run-${mode}`);
    if (mode === 'day') return;
    await openCanvas();
    await page.getByTestId('zoom-fit').click();
    await page.waitForTimeout(300);
    await shot(`canvas-fit-${mode}`);
    await page.getByTestId('zoom-level').click();
    await shot(`canvas-100-${mode}`);
    await page.getByTestId('tool-add-card').click();
    await expect(page.getByTestId('add-card-menu')).toBeVisible();
    await shot(`add-card-${mode}`);
    await page.keyboard.press('Escape');
    // Existing layouts can move Sources away from the origin. Use the product's search flight before opening it.
    await page.keyboard.press('Meta+f');
    await page.getByTestId('board-search-input').fill('Sourcemarker');
    await expect(page.getByTestId('board-search-count')).toHaveText('1 of 1');
    await page.keyboard.press('Escape');
    await page.locator(`[data-testid="orb-card"][data-card-id="${fixture.cards.source}"]`).getByTestId('card-select').check();
    await page.getByTestId('card-open-reader').click();
    await expect(page.getByTestId('reader')).toBeVisible();
    await shot(`reader-${mode}`);
    await page.getByTestId('reader-close').click();
    await page.getByTestId('publish-port').click();
    await expect(page.getByTestId('composer')).toBeVisible();
    await shot(`composer-${mode}`);
    await page.getByTestId('composer-mode').locator('[data-value="deck"]').click();
    await shot(`composer-deck-${mode}`);
    await page.getByTestId('composer-close').click();
    await go(`#/port/${fixture.canvasId}`);
    await expect(page.getByTestId('port-screen')).toBeVisible();
    await shot(`port-${mode}`);
    await go(`#/deck/${fixture.canvasId}`);
    await expect(page.getByTestId('deck-screen')).toBeVisible();
    await shot(`deck-${mode}`);
  });
}

test('no console errors while rendering all of it', () => {
  expect(consoleErrors).toEqual([]);
});
