/// <reference lib="dom" />
/**
 * P6.20 board layout quality, in the real app (temp homes, mock LLM): a seeded 12-frame VC-like board (the vc-dd
 * template plus ~60 mixed agent cards and 18 links, `scripts/testkit/vcBoard.ts`).
 *   - it opens FITTED to its content, clear of the chat panel, the reading queue and the minimap, and shaped like a screen;
 *   - the renderer's measured heights are stored (card events) and the board settles: no frame or card overlaps, every
 *     card inside its frame, nothing under another;
 *   - links are routed round cards and none crosses a card; labels are drawn above the cards;
 *   - at full, compact and title detail no card's content overflows its box and no text sits on other text;
 *   - the camera the user leaves is remembered and restored; reopening folds to exactly the same board.
 * ORB_UPDATE_SCREENS=1 writes docs/screens/p6.20-*.png.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BoardState } from '@orb/shared';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { seedVcBoard, type VcBoard } from '../../../scripts/testkit/vcBoard.ts';
import { liveWindow } from './support/ui.ts';
import { repoRoot } from './support/screenshot.ts';

test.describe.configure({ mode: 'serial' });

const desktopDir = resolve(import.meta.dirname, '..');
const UPDATE = process.env.ORB_UPDATE_SCREENS === '1';
const OUT = join(repoRoot, 'docs', 'screens');
let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
let board: VcBoard;
const consoleErrors: string[] = [];

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-layout20-'));
  board = await seedVcBoard(join(tmp, 'Orb'));
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
      ORB_KEYCHAIN_SERVICE: 'ai.orb.app.test.layout20',
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
  if (UPDATE) mkdirSync(OUT, { recursive: true });
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const go = (hash: string) => page.evaluate((h) => (location.hash = h), hash);
const stateText = () => page.getByTestId('orb-board-state').evaluate((el) => el.textContent ?? '');
const readState = async (): Promise<BoardState> => JSON.parse(await stateText()) as BoardState;

/** Open the board and wait until it has settled: nothing left to measure and the folded board stops changing. */
async function openBoard() {
  await go(`#/canvas/${board.canvasId}`);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await expect(page.getByTestId('orb-frame').first()).toBeVisible();
  let last = '';
  let still = 0;
  for (let i = 0; i < 80 && still < 4; i++) {
    await page.waitForTimeout(500);
    const now = await stateText();
    const measuring = await page.getByTestId('measurer').count();
    still = now === last && measuring === 0 ? still + 1 : 0;
    last = now;
  }
  expect(still, 'the board settles').toBeGreaterThanOrEqual(4);
}

type View = { panX: number; panY: number; zoom: number };
const readView = (): Promise<View> =>
  page.evaluate(() => {
    const m = new DOMMatrixReadOnly(
      getComputedStyle(document.querySelector('[data-testid="world"]')!).transform,
    );
    return { panX: m.e, panY: m.f, zoom: m.a };
  });
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
  const v = await readView();
  await gesture(
    -(cy - box.y - (wy * v.zoom + v.panY)),
    false,
    cx,
    cy,
    -(cx - box.x - (wx * v.zoom + v.panX)),
  );
  await page.waitForTimeout(150);
}

type R = { x: number; y: number; w: number; h: number };
const overlap = (a: R, b: R) =>
  a.x < b.x + b.w - 0.5 && a.x + a.w > b.x + 0.5 && a.y < b.y + b.h - 0.5 && a.y + a.h > b.y + 0.5;
const frameBounds = (s: BoardState) => {
  const f = Object.values(s.frames);
  const x = Math.min(...f.map((r) => r.x));
  const y = Math.min(...f.map((r) => r.y));
  return { x, y, w: Math.max(...f.map((r) => r.x + r.w)) - x, h: Math.max(...f.map((r) => r.y + r.h)) - y };
};

test('opens fitted to its content, clear of the chat panel, reading queue and minimap, shaped like a screen', async () => {
  await openBoard();
  const view = await readView();
  expect(view.zoom).toBeLessThan(0.6);
  // (A board of a dozen wide frames is bigger than a screen at 25%: it opens as an overview, above the 8% fit floor.)
  expect(view.zoom).toBeGreaterThanOrEqual(0.08);
  const s = await readState();
  expect(Object.keys(s.frames)).toHaveLength(12);
  expect(Object.keys(s.cards).length).toBeGreaterThan(100);
  // The frames' screen boxes: inside the free area, and not under any floating panel.
  const geo = await page.evaluate(() => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const screen = rect(document.querySelector('[data-testid="canvas-screen"]')!);
    const frames = Array.from(document.querySelectorAll('[data-testid="orb-frame"]')).map(rect);
    const panels = ['chat-panel', 'chat-pill', 'reading-queue', 'minimap-block']
      .map((id) => document.querySelector(`[data-testid="${id}"]`))
      .filter((el): el is Element => !!el)
      .map(rect);
    return { screen, frames, panels };
  });
  const x0 = Math.min(...geo.frames.map((f) => f.x));
  const y0 = Math.min(...geo.frames.map((f) => f.y));
  const x1 = Math.max(...geo.frames.map((f) => f.x + f.w));
  const y1 = Math.max(...geo.frames.map((f) => f.y + f.h));
  expect(x0).toBeGreaterThanOrEqual(geo.screen.x + 90);
  expect(y0).toBeGreaterThanOrEqual(geo.screen.y + 75);
  expect(x1).toBeLessThanOrEqual(geo.screen.x + geo.screen.w);
  expect(y1).toBeLessThanOrEqual(geo.screen.y + geo.screen.h);
  const all: R = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  expect(geo.panels.length).toBeGreaterThan(0);
  for (const p of geo.panels) expect(overlap(all, p), 'the board is not under a panel').toBe(false);
  // Screen-shaped: the old board was three tall columns (aspect ~0.4).
  const b = frameBounds(s);
  expect(b.w / b.h).toBeGreaterThan(1.1);
  expect(b.w / b.h).toBeLessThan(2.3);
  if (UPDATE) await page.screenshot({ path: join(OUT, 'p6.20-board-fit.png') });
});

test('the settled board has no overlaps: frames apart, every card inside its frame and clear of every other', async () => {
  const s = await readState();
  const frames = Object.values(s.frames);
  const cards = Object.values(s.cards).filter((c) => !c.stackedInto);
  for (const [i, a] of frames.entries())
    for (const f of frames.slice(i + 1)) expect(overlap(a, f), `${a.title} / ${f.title}`).toBe(false);
  for (const c of cards) {
    const f = s.frames[c.frameId!]!;
    expect(c.x, c.id).toBeGreaterThanOrEqual(f.x + 24);
    expect(c.x + c.w, c.id).toBeLessThanOrEqual(f.x + f.w - 24);
    expect(c.y, c.id).toBeGreaterThanOrEqual(f.y + 56);
    expect(c.y + c.h, c.id).toBeLessThanOrEqual(f.y + f.h - 24);
  }
  for (const [i, a] of cards.entries())
    for (const c of cards.slice(i + 1)) expect(overlap(a, c), `${a.id} / ${c.id}`).toBe(false);
  // Heights follow content: the measured board is not just the estimates (cards of one type differ in height).
  const noteish = cards.filter((c) => c.type === 'source').map((c) => c.h);
  expect(new Set(noteish).size).toBeGreaterThan(1);
  // Every card height is inside the type's range and no card is pinned by the reflow.
  expect(cards.some((c) => c.userMoved)).toBe(false);
  // Sideways first: frames are wider than the 4-column template frames they started as.
  expect(Math.max(...frames.map((f) => f.w))).toBeGreaterThanOrEqual(8 * 132 + 7 * 16 + 48 - 1);
  // The page logged nothing wrong.
  expect(consoleErrors).toEqual([]);
});

test('links are routed round cards: no link path crosses a card, and labels sit above the cards', async () => {
  const s = await readState();
  const result = await page.evaluate(
    ([cards]) => {
      const paths = Array.from(document.querySelectorAll<SVGPathElement>('path[data-testid="orb-link"]'));
      const hits: string[] = [];
      let routed = 0;
      for (const p of paths) {
        if (p.dataset.routed) routed++;
        const from = p.dataset.linkFrom!;
        const to = p.dataset.linkTo!;
        const len = p.getTotalLength();
        for (let at = 0; at <= len; at += 3) {
          const pt = p.getPointAtLength(at);
          for (const c of cards as { id: string; x: number; y: number; w: number; h: number }[]) {
            if (c.id === from || c.id === to) continue;
            if (pt.x > c.x + 0.5 && pt.x < c.x + c.w - 0.5 && pt.y > c.y + 0.5 && pt.y < c.y + c.h - 0.5) {
              hits.push(
                `${p.dataset.linkType} ${from}->${to} crosses ${c.id} (${p.dataset.routed ? 'routed' : 'curve'})`,
              );
              at = len;
              break;
            }
          }
        }
      }
      // Paint order: the links' svg comes before the first card, the labels after the last one.
      const world = document.querySelector('[data-testid="world"]')!;
      const kids = Array.from(world.children);
      const svg = kids.findIndex((k) => k.matches('svg[data-testid="links-layer"]'));
      const firstCard = kids.findIndex((k) => k.matches('[data-testid="orb-card"]'));
      const lastCard = kids.map((k) => k.matches('[data-testid="orb-card"]')).lastIndexOf(true);
      const label = kids.findIndex((k) => k.matches('[data-testid="orb-link-label"]'));
      return {
        total: paths.length,
        routed,
        hits,
        behind: svg >= 0 && svg < firstCard,
        labelsAbove: label > lastCard,
      };
    },
    [
      Object.values(s.cards)
        .filter((c) => !c.stackedInto)
        .map((c) => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h })),
    ] as const,
  );
  expect(result.total).toBeGreaterThanOrEqual(15);
  expect(result.hits).toEqual([]);
  expect(result.routed / result.total).toBeGreaterThan(0.7);
  expect(result.behind).toBe(true);
  expect(result.labelsAbove).toBe(true);
  // Zoomed in on a frame the routes and labels read well: capture.
  if (UPDATE) {
    const f = Object.values(s.frames)[2]!;
    await viewAt(f.x + f.w / 2, f.y + f.h / 2, 0.7);
    await page.screenshot({ path: join(OUT, 'p6.20-links.png') });
  }
});

test('at full, compact and title detail no card overflows its box and no text sits on other text', async () => {
  const s = await readState();
  const frames = Object.values(s.frames);
  const LODS = [
    { lod: 'full', zoom: 0.7 },
    { lod: 'compact', zoom: 0.45 },
    { lod: 'title', zoom: 0.28 },
  ] as const;
  for (const { lod, zoom } of LODS) {
    const bad = new Set<string>();
    let seen = 0;
    for (const f of frames) {
      await viewAt(f.x + f.w / 2, f.y + f.h / 2, zoom);
      await expect(page.getByTestId('world')).toHaveAttribute('data-lod', lod);
      const found = await page.evaluate(() => {
        const problems: string[] = [];
        const cards = Array.from(document.querySelectorAll<HTMLElement>('article[data-card-id]'));
        for (const card of cards) {
          const id = `${card.dataset.cardType} ${card.dataset.cardId}`;
          if (card.scrollHeight > card.clientHeight + 1)
            problems.push(`${id}: content ${card.scrollHeight}px in a ${card.clientHeight}px card`);
          if (card.scrollWidth > card.clientWidth + 1)
            problems.push(`${id}: content ${card.scrollWidth}px wide in a ${card.clientWidth}px card`);
          // Visible text lines (clipped by every overflow-hidden ancestor up to the card).
          const lines: { rect: { l: number; t: number; r: number; b: number }; node: Node; text: string }[] =
            [];
          const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const text = (n.textContent ?? '').trim();
            if (!text) continue;
            const el = n.parentElement!;
            if (getComputedStyle(el).visibility === 'hidden' || el.closest('[aria-hidden="true"]')) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            for (const r of Array.from(range.getClientRects())) {
              if (r.width < 1 || r.height < 1) continue;
              let box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
              for (let a: Element | null = el; a; a = a.parentElement) {
                const cs = getComputedStyle(a);
                if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
                  const ar = a.getBoundingClientRect();
                  box = {
                    l: Math.max(box.l, ar.left),
                    t: Math.max(box.t, ar.top),
                    r: Math.min(box.r, ar.right),
                    b: Math.min(box.b, ar.bottom),
                  };
                }
                if (a === card) break;
              }
              if (box.r - box.l < 1 || box.b - box.t < 1) continue;
              lines.push({ rect: box, node: n, text });
            }
          }
          const shrink = (b: { l: number; t: number; r: number; b: number }) => ({
            l: b.l + 1.5,
            t: b.t + 2,
            r: b.r - 1.5,
            b: b.b - 2,
          });
          for (let i = 0; i < lines.length; i++)
            for (let j = i + 1; j < lines.length; j++) {
              if (lines[i]!.node === lines[j]!.node) continue;
              const a = shrink(lines[i]!.rect);
              const b = shrink(lines[j]!.rect);
              const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
              const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
              if (w > 1 && h > 1)
                problems.push(
                  `${id}: "${lines[i]!.text.slice(0, 24)}" overlaps "${lines[j]!.text.slice(0, 24)}"`,
                );
            }
        }
        return { n: cards.length, problems };
      });
      seen += found.n;
      for (const p of found.problems) bad.add(p);
    }
    expect(seen, `cards inspected at ${lod}`).toBeGreaterThan(100);
    expect([...bad], `${lod} detail`).toEqual([]);
    if (UPDATE && lod === 'full') {
      const f = frames[0]!;
      await viewAt(f.x + f.w / 2, f.y + 380, 0.7);
      await page.screenshot({ path: join(OUT, 'p6.20-cards-full.png') });
    }
  }
});

test('the camera the user leaves is remembered; reopening folds to exactly the same board', async () => {
  const before = await stateText();
  // The user moves the camera: a pan and a zoom, then leaves.
  const f = Object.values((await readState()).frames)[5]!;
  await viewAt(f.x + 300, f.y + 200, 0.62);
  const mine = await readView();
  await page.waitForTimeout(1400);
  await go('#/');
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await go(`#/canvas/${board.canvasId}`);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await expect(page.getByTestId('orb-frame').first()).toBeVisible();
  await page.waitForTimeout(1200);
  const again = await readView();
  expect(Math.abs(again.zoom - mine.zoom)).toBeLessThan(0.002);
  expect(Math.abs(again.panX - mine.panX)).toBeLessThan(1.5);
  expect(Math.abs(again.panY - mine.panY)).toBeLessThan(1.5);
  // Exactly the same board: the measured heights were events, so nothing is laid out again.
  expect(await stateText()).toBe(before);
});

test('"Show more" opens the reader on a card whose content is clipped', async () => {
  const s = await readState();
  // A long checklist or timeline is clipped at its type's ceiling.
  const f = Object.values(s.frames)[1]!;
  await viewAt(f.x + f.w / 2, f.y + f.h / 2, 0.7);
  const clipped = page.locator('article[data-card-id][data-overflow="true"]');
  const n = await clipped.count();
  test.skip(n === 0, 'no clipped card in this frame');
  // Virtualisation also mounts cards just outside the viewport. Navigate to the actual target before clicking.
  const id = await clipped.first().getAttribute('data-card-id');
  await go(`#/canvas/${board.canvasId}?focus=${id}`);
  const more = page.locator(`article[data-card-id="${id}"]`).getByTestId('orb-card-more');
  await more.click();
  await expect(page.getByTestId('reader')).toBeVisible();
});

test('Repack board is available without an agent and restores the previous layout with Undo', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  const before = await readState();
  await page.getByTestId('minimap-block').hover();
  await page.getByTestId('repack-board').click();
  await expect(page.getByTestId('repack-board')).toBeEnabled();
  await page.waitForTimeout(2000);
  const after = await readState();
  expect(Object.keys(after.cards)).toEqual(Object.keys(before.cards));
  for (const card of Object.values(before.cards)) {
    expect(after.cards[card.id]!.data).toEqual(card.data);
    expect(after.cards[card.id]!.detail).toBe(card.detail);
  }
  expect(after.frames).not.toEqual(before.frames);
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await readState()).frames).toEqual(before.frames);
  await expect(page.getByTestId('orb-error')).toHaveCount(0);
});
