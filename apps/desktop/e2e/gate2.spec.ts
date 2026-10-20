/// <reference lib="dom" />
/**
 * Gate 2 audit (P2.gate): the PRD Canvas requirements no earlier spec drove with the mouse, in the real app (temp
 * homes, no model calls):
 *   - Navigation: a plain drag on empty space pans while the floating chrome stays put; pinch (Ctrl+wheel, what a
 *     trackpad pinch sends) zooms towards the cursor and clamps at 25% and 250%; clicking the minimap jumps there.
 *   - Frames: dragging a frame's label moves the frame and the cards inside it (one gesture); its corner handle
 *     resizes it; deleting it leaves its cards on the board, detached.
 *   - Links: the Connect tool links a card to a FRAME with a free label.
 *   - Add card (the toolbar's fifth tool): Question / Risk / Quote cards made empty and written in the reader, a Link
 *     → Source card, an image from the file picker; Escape closes the menu.
 * Then quit and relaunch: the reopened board equals the board before the quit (UI fold == fold(board.jsonl)).
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { fold, type BoardEvent, type BoardState } from '@orb/shared';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { makePng } from '../../../scripts/testkit/fixtures.ts';
import { createCanvas, liveWindow } from './support/ui.ts';

const desktopDir = resolve(import.meta.dirname, '..');
let tmp: string;
let app: ElectronApplication | undefined;

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
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900);
    await new Promise((r) => setTimeout(r, 300));
  });
  await expect(page.getByTestId('orb-ping')).toHaveText(/^orb-host /);
  return page;
}

test.beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-gate2-'));
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

/** The world layer's transform: pan and zoom. */
async function viewOf(page: Page) {
  const style = (await page.getByTestId('world').getAttribute('style')) ?? '';
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(style);
  expect(m, style).not.toBeNull();
  return { panX: Number(m![1]), panY: Number(m![2]), zoom: Number(m![3]) };
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(from[0] + (to[0] - from[0]) / 2, from[1] + (to[1] - from[1]) / 2, { steps: 5 });
  await page.mouse.move(...to, { steps: 5 });
  await page.mouse.up();
}

/** A trackpad pinch: Chrome delivers it as a wheel event with ctrlKey at the pointer. */
async function pinch(page: Page, x: number, y: number, deltaY: number) {
  await page.evaluate(
    ([px, py, dy]) => {
      const el = document.elementFromPoint(px!, py!)!;
      el.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: dy!,
          ctrlKey: true,
          clientX: px!,
          clientY: py!,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    [x, y, deltaY],
  );
}

test('navigation, frames, frame links and Add card with the mouse; quit, relaunch: exact', async () => {
  let page = await launch();
  const { canvasId } = await createCanvas(page, 'Gate two');
  // This scenario draws at fixed full-window coordinates; collapse the reserved conversation column first.
  await page.getByTestId('chat-minimise').click();
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');

  // ---- Frames: draw one, two notes inside it, then drag the frame by its label: frame and cards move together.
  await page.getByTestId('tool-frame').click();
  await drag(page, [300, 200], [900, 600]);
  await page.getByTestId('frame-title-input').fill('Market');
  await page.getByTestId('frame-title-input').press('Enter');
  await page.mouse.dblclick(450, 350);
  await page.mouse.dblclick(750, 350);
  await expect(page.getByTestId('orb-card')).toHaveCount(2);
  await settled(page);
  let board = await uiBoard(page);
  const frameId = Object.keys(board.frames)[0]!;
  // The two notes by position (left, right): the two adds are sent concurrently, so their log order may differ.
  const [n1, n2] = Object.values(board.cards)
    .sort((a, b) => a.x - b.x)
    .map((c) => c.id) as [string, string];
  expect(board.cards[n1]!.frameId).toBe(frameId);
  expect(board.cards[n2]!.frameId).toBe(frameId);
  await expect.poll(async () => events(canvasId).length).toBe((await uiBoard(page)).seq + 1);
  const before = events(canvasId).length;
  const label = (await page.getByTestId('orb-frame-label').boundingBox())!;
  await drag(
    page,
    [label.x + 10, label.y + label.height / 2],
    [label.x + 110, label.y + label.height / 2 + 50],
  );
  await settled(page);
  board = await uiBoard(page);
  expect(board.frames[frameId]).toMatchObject({ x: 400, y: 250, w: 600, h: 400 });
  expect([board.cards[n1]!.x, board.cards[n1]!.y]).toEqual([450 - 120 + 100, 350 - 75 + 50]);
  expect([board.cards[n2]!.x, board.cards[n2]!.y]).toEqual([750 - 120 + 100, 350 - 75 + 50]);
  // One gesture: one frame.updated (the frame) and one card.moved (both cards), written on release.
  await expect
    .poll(() =>
      events(canvasId)
        .slice(before)
        .map((e) => e.type)
        .sort(),
    )
    .toEqual(['card.moved', 'frame.updated']);

  // Resize the (selected) frame by its corner handle.
  const handle = (await page.getByTestId('frame-resize').boundingBox())!;
  await drag(
    page,
    [handle.x + handle.width / 2, handle.y + handle.height / 2],
    [handle.x + handle.width / 2 + 80, handle.y + handle.height / 2 + 60],
  );
  await settled(page);
  await expect.poll(async () => (await uiBoard(page)).frames[frameId]).toMatchObject({ w: 680, h: 460 });

  // ---- A note outside the frame, linked to the FRAME with a free label.
  await page.mouse.dblclick(1250, 300);
  await expect(page.getByTestId('orb-card')).toHaveCount(3);
  await settled(page);
  board = await uiBoard(page);
  const outside = Object.keys(board.cards).find((id) => id !== n1 && id !== n2)!;
  expect(board.cards[outside]!.frameId).toBeNull();
  await page.getByTestId('tool-connect').click();
  await page.getByTestId('link-type-label').click();
  await page.getByTestId('link-label-input').fill('see also');
  await page.getByTestId('link-label-input').press('Enter');
  const lbl = (await page.getByTestId('orb-frame-label').boundingBox())!;
  await drag(page, [1250, 300], [lbl.x + 10, lbl.y + lbl.height / 2]);
  await settled(page);
  await expect(page.getByTestId('orb-link')).toHaveCount(1);
  await expect(page.getByTestId('orb-link-label')).toHaveText('SEE ALSO');
  board = await uiBoard(page);
  expect(Object.values(board.links).map((l) => [l.from, l.to, l.type, l.label])).toEqual([
    [outside, frameId, 'label', 'see also'],
  ]);
  await page.keyboard.press('Escape');

  // ---- Navigation. A plain drag on empty space pans; the floating chrome does not move.
  const pill = await page.getByTestId('title-pill').boundingBox();
  const toolbar = await page.getByRole('toolbar', { name: 'Board tools' }).boundingBox();
  const v0 = await viewOf(page);
  // (1250, 170) is empty board: no card, frame or chrome there.
  expect(await page.evaluate(() => document.elementFromPoint(1250, 170)?.getAttribute('data-testid'))).toBe(
    'canvas-screen',
  );
  await drag(page, [1250, 170], [1150, 110]);
  const v1 = await viewOf(page);
  expect([v1.panX - v0.panX, v1.panY - v0.panY, v1.zoom]).toEqual([-100, -60, v0.zoom]);
  expect(await page.getByTestId('title-pill').boundingBox()).toEqual(pill);
  expect(await page.getByRole('toolbar', { name: 'Board tools' }).boundingBox()).toEqual(toolbar);
  // Pinch towards the cursor: the world point under the cursor stays under it.
  const cx = 700;
  const cy = 450;
  const worldUnder = (v: { panX: number; panY: number; zoom: number }) => [
    (cx - v.panX) / v.zoom,
    (cy - v.panY) / v.zoom,
  ];
  await pinch(page, cx, cy, -120);
  await expect.poll(async () => (await viewOf(page)).zoom).toBeGreaterThan(1);
  const v2 = await viewOf(page);
  const [ax, ay] = worldUnder(v1);
  const [bx, by] = worldUnder(v2);
  expect(Math.abs(ax! - bx!)).toBeLessThan(0.5);
  expect(Math.abs(ay! - by!)).toBeLessThan(0.5);
  for (let i = 0; i < 30; i++) await pinch(page, cx, cy, -200);
  await expect(page.getByTestId('zoom-level')).toHaveText('250%');
  for (let i = 0; i < 40; i++) await pinch(page, cx, cy, 200);
  await expect(page.getByTestId('zoom-level')).toHaveText('25%');
  // Clicking the minimap jumps there: the middle of the frame's minimap rect brings the frame's centre to the
  // middle of the screen.
  const mf = (await page.getByTestId('minimap-frame').boundingBox())!;
  await page.mouse.click(mf.x + mf.width / 2, mf.y + mf.height / 2);
  const f = (await uiBoard(page)).frames[frameId]!;
  await expect
    .poll(async () => {
      const v = await viewOf(page);
      const sx = v.panX + (f.x + f.w / 2) * v.zoom;
      const sy = v.panY + (f.y + f.h / 2) * v.zoom;
      return Math.hypot(sx - 720, sy - 450) < 6;
    })
    .toBe(true);
  await page.getByTestId('zoom-level').click(); // back to 100% at the origin
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');

  // ---- Add card. Escape closes the menu.
  await page.getByTestId('tool-add-card').click();
  await expect(page.getByTestId('add-card-menu')).toBeVisible();
  await expect(page.getByTestId('add-card-note')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('add-card-question')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('add-card-menu')).toHaveCount(0);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-tool', 'select');
  // A press on the board outside the menu closes it too.
  await page.getByTestId('tool-add-card').click();
  await page.mouse.click(1250, 820);
  await expect(page.getByTestId('add-card-menu')).toHaveCount(0);
  // Question, Risk or claim, Quote: added empty, opened in the reader, written there.
  for (const [type, title] of [
    ['question', 'Who pays?'],
    ['risk', 'Margins collapse'],
    ['quote', '"Software eats the world"'],
  ] as const) {
    const count = await page.getByTestId('orb-card').count();
    await page.getByTestId('tool-add-card').click();
    await page.getByTestId(`add-card-${type}`).click();
    await expect(page.getByTestId('orb-card')).toHaveCount(count + 1);
    await expect(page.getByTestId('reader')).toBeVisible();
    await page.getByTestId('reader-note-title').fill(title);
    await page.getByTestId('reader-note-body').fill(`About ${type}`);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('reader')).toHaveCount(0);
    await settled(page);
    board = await uiBoard(page);
    const made = Object.values(board.cards).filter((c) => c.type === type);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ provenance: { kind: 'user' }, data: { title, body: `About ${type}` } });
  }
  // The three new cards do not sit exactly on top of each other.
  board = await uiBoard(page);
  const spots = Object.values(board.cards)
    .filter((c) => ['question', 'risk', 'quote'].includes(c.type))
    .map((c) => `${c.x},${c.y}`);
  expect(new Set(spots).size).toBe(3);
  // Link… → a Source card (a bad link is refused in place).
  await page.getByTestId('tool-add-card').click();
  await page.getByTestId('add-card-link').click();
  await page.getByTestId('add-card-url').fill('not a link');
  await page.getByTestId('add-card-url').press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Enter an http or https link');
  await page.getByTestId('add-card-url').fill('https://example.com/report');
  await page.getByTestId('add-card-url').press('Enter');
  await expect(page.getByTestId('add-card-menu')).toHaveCount(0);
  await expect
    .poll(async () => Object.values((await uiBoard(page)).cards).filter((c) => c.type === 'source').length)
    .toBe(1);
  // Image, PDF or CSV… → the file picker; the file goes through orb-host into assets/.
  const png = makePng(120, 80);
  await page.getByTestId('tool-add-card').click();
  await page
    .getByTestId('add-card-file-input')
    .setInputFiles({ name: 'Chart.png', mimeType: 'image/png', buffer: png });
  await expect
    .poll(async () => Object.values((await uiBoard(page)).cards).filter((c) => c.type === 'image').length)
    .toBe(1);
  await settled(page);
  board = await uiBoard(page);
  const image = Object.values(board.cards).find((c) => c.type === 'image')!;
  const asset = (image.data as { asset: { path: string } }).asset;
  expect(readFileSync(join(tmp, 'Orb', 'canvases', canvasId, asset.path))).toEqual(png);

  // ---- Delete the frame from the selection bar: its cards stay, detached; the link to it goes.
  await page.getByTestId('orb-frame-label').click();
  await expect(page.getByTestId('selection-count')).toHaveText('1 selected');
  await page.getByTestId('selection-delete').click();
  await settled(page);
  await expect(page.getByTestId('orb-frame')).toHaveCount(0);
  board = await uiBoard(page);
  expect(board.cards[n1]!.frameId).toBeNull();
  expect(board.cards[n2]!.frameId).toBeNull();
  expect(Object.keys(board.links)).toHaveLength(0);
  await expect(page.getByTestId('orb-error')).toHaveCount(0);

  // ---- Quit and relaunch: exact.
  await settled(page);
  await expect.poll(async () => events(canvasId).length).toBe((await uiBoard(page)).seq + 1);
  const finalBoard = await uiBoard(page);
  expect(fold(events(canvasId))).toEqual(finalBoard);
  await app!.close();
  app = undefined;
  page = await launch();
  await page.locator(`[data-testid="orb-canvas-open"][data-canvas-id="${canvasId}"]`).click();
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await expect.poll(async () => (await uiBoard(page)).seq).toBe(finalBoard.seq);
  expect(await uiBoard(page)).toEqual(finalBoard);
});
