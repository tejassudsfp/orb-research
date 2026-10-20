/// <reference lib="dom" />
/**
 * P2.3 board editing in the real app (temp homes, no model calls). With the mouse and keyboard only:
 *   - Frame tool: draw a frame, name it inline (`01 THESIS`), recolour it from the selection bar, rename it by
 *     double-clicking its label;
 *   - Note tool and double-click: three notes (two inside the frame, joining it);
 *   - Shift+drag marquee selects two notes, dragging one moves both: ONE `card.moved` event with two moves, on
 *     release only;
 *   - Shift+click toggles the selection; the corner handle resizes a card (`card.updated`);
 *   - Connect tool: a tension link (dashed accent) and a supports link (solid), with their mono labels;
 *   - Delete removes the selected card;
 *   - Cmd+Z undoes the delete, the note, the rename and the recolour; Cmd+Shift+Z redoes all four (P2.4).
 * Then the app quits and relaunches on the same homes: the reopened board equals the board before the quit
 * exactly (UI fold == fold(board.jsonl)).
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { fold, type BoardEvent, type BoardState } from '@orb/shared';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createCanvas, liveWindow } from './support/ui.ts';

const desktopDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(desktopDir, '..', '..');

/** ORB_UPDATE_SCREENS=1: write a capture of the board to docs/screens/p2.3-<name>.png. */
async function capture(page: Page, name: string) {
  if (process.env.ORB_UPDATE_SCREENS !== '1') return;
  await page.waitForTimeout(250);
  const dir = join(repoRoot, 'docs', 'screens');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `p2.3-${name}.png`) });
}
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
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-board-'));
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

async function drag(
  page: Page,
  from: [number, number],
  to: [number, number],
  opts: { shift?: boolean } = {},
) {
  if (opts.shift) await page.keyboard.down('Shift');
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(from[0] + (to[0] - from[0]) / 2, from[1] + (to[1] - from[1]) / 2, { steps: 5 });
  await page.mouse.move(...to, { steps: 5 });
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up('Shift');
}

const cardAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) =>
      document.elementFromPoint(px!, py!)?.closest('article')?.getAttribute('data-card-id') ?? null,
    [x, y],
  );

test('edit the board with the mouse, quit, relaunch: the board is exact', async () => {
  let page = await launch();
  const { canvasId } = await createCanvas(page, 'Board editing');
  // This coordinate-driven edit scenario uses the full canvas; the rail reserves its own column when open.
  await page.getByTestId('chat-minimise').click();
  const screen = page.getByTestId('canvas-screen');
  // The board's world layer sits at the screen origin at 100% (pan 0, zoom 1): screen px = world px.
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');

  // Frame tool: draw, then name it inline.
  await page.getByTestId('tool-frame').click();
  await drag(page, [200, 150], [800, 560]);
  await expect(page.getByTestId('frame-title-input')).toBeVisible();
  await settled(page);
  await page.getByTestId('frame-title-input').fill('Thesis');
  await page.getByTestId('frame-title-input').press('Enter');
  await expect(page.getByTestId('orb-frame-label')).toHaveText('01 THESIS');
  await expect(screen).toHaveAttribute('data-tool', 'select');

  // Notes: Note tool click, and double-clicks on empty space.
  await page.getByTestId('tool-note').click();
  await page.mouse.click(350, 300);
  await page.mouse.dblclick(650, 300);
  await page.mouse.dblclick(1200, 200);
  await expect(page.getByTestId('orb-card')).toHaveCount(3);
  await settled(page);
  const a = (await cardAt(page, 300, 260))!;
  const b = (await cardAt(page, 600, 260))!;
  const c = (await cardAt(page, 1200, 200))!;
  expect([a, b, c].every((id) => /^c_[0-9A-Z]{26}$/.test(id))).toBe(true);
  let board = await uiBoard(page);
  const frameId = Object.keys(board.frames)[0]!;
  expect(board.frames[frameId]).toMatchObject({ title: 'Thesis', x: 200, y: 150, w: 600, h: 410 });
  expect([board.cards[a]!.frameId, board.cards[b]!.frameId, board.cards[c]!.frameId]).toEqual([
    frameId,
    frameId,
    null,
  ]);

  // Shift+drag marquee over A and B (the frame is not fully inside: not selected).
  await page.mouse.click(1000, 120); // clear the selection
  await drag(page, [260, 720], [700, 320], { shift: true });
  await expect(page.getByTestId('selection-count')).toHaveText('2 selected');
  await expect(page.locator('[data-testid="orb-card"][data-selected]')).toHaveCount(2);

  // Drag A: both move, ONE card.moved written on release.
  await expect.poll(async () => events(canvasId).length).toBe((await uiBoard(page)).seq + 1);
  const before = events(canvasId).length;
  await page.mouse.move(300, 260);
  await page.mouse.down();
  await page.mouse.move(350, 290, { steps: 6 });
  await page.mouse.move(400, 320, { steps: 6 });
  await page.waitForTimeout(400); // past the 250 ms batch window: nothing may be written mid-drag
  expect(events(canvasId).length).toBe(before);
  await page.mouse.up();
  await settled(page);
  await expect.poll(() => events(canvasId).length).toBe(before + 1);
  const moved = events(canvasId).at(-1)!;
  expect(moved.type).toBe('card.moved');
  expect(moved.data).toEqual({
    moves: [
      { id: a, x: 330, y: 285 },
      { id: b, x: 630, y: 285 },
    ],
  });

  // Shift+click toggles.
  await page.locator(`[data-card-id="${c}"]`).getByTestId('card-select').check();
  await expect(page.getByTestId('selection-count')).toHaveText('1 selected');
  await page.keyboard.down('Shift');
  await page.mouse.click(450, 360);
  await expect(page.getByTestId('selection-count')).toHaveText('2 selected');
  await page.mouse.click(450, 360);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('selection-count')).toHaveText('1 selected');

  // Resize C by its corner handle.
  const handle = page.getByTestId('card-resize');
  const box = (await handle.boundingBox())!;
  await drag(
    page,
    [box.x + box.width / 2, box.y + box.height / 2],
    [box.x + box.width / 2 + 60, box.y + box.height / 2 + 40],
  );
  await settled(page);
  await expect.poll(async () => (await uiBoard(page)).cards[c]).toMatchObject({ w: 300, h: 190 });
  await expect
    .poll(() => events(canvasId).at(-1))
    .toMatchObject({ type: 'card.updated', data: { id: c, patch: { w: 300, h: 190 } } });

  // Connect: tension A → C (dashed accent), supports B → A (solid).
  await page.getByTestId('tool-connect').click();
  await expect(page.getByTestId('connect-bar')).toBeVisible();
  await page.getByTestId('link-type-tension').click();
  await drag(page, [450, 360], [1200, 220]);
  await page.getByTestId('link-type-supports').click();
  await drag(page, [750, 400], [400, 400]);
  await settled(page);
  await expect(page.getByTestId('orb-link')).toHaveCount(2);
  await expect(page.locator('[data-testid="orb-link"][data-dashed]')).toHaveCount(1);
  await expect(page.locator('[data-testid="orb-link"][data-dashed]')).toHaveAttribute(
    'data-link-type',
    'tension',
  );
  await expect(page.locator('[data-testid="orb-link"][data-dashed]')).toHaveAttribute(
    'stroke-dasharray',
    '5 5',
  );
  await expect(page.getByTestId('orb-link-label')).toHaveText(['TENSION', 'SUPPORTS']);
  board = await uiBoard(page);
  expect(Object.values(board.links).map((l) => [l.from, l.to, l.type])).toEqual([
    [a, c, 'tension'],
    [b, a, 'supports'],
  ]);
  await page.locator(`[data-card-id="${c}"]`).getByTestId('card-select').check(); // select C: links, selection outline, handle and bar in one capture
  await capture(page, 'board');
  await page.keyboard.press('Escape');
  await expect(screen).toHaveAttribute('data-tool', 'select');

  // Recolour the frame from the selection bar (click its label to select it).
  await page.getByTestId('orb-frame-label').click();
  await expect(page.getByTestId('selection-count')).toHaveText('1 selected');
  await page.getByTestId('frame-color-rho').click();
  await expect(page.getByTestId('orb-frame')).toHaveAttribute('data-frame-color', 'rho');
  // Double-click the label to rename the frame inline.
  await page.getByTestId('orb-frame-label').dblclick();
  await expect(page.getByTestId('frame-title-input')).toBeVisible();
  await page.getByTestId('frame-title-input').fill('Core thesis');
  await page.getByTestId('frame-title-input').press('Enter');
  await expect(page.getByTestId('orb-frame-label')).toHaveText('01 CORE THESIS');
  await settled(page);
  await expect
    .poll(() => events(canvasId).at(-1))
    .toMatchObject({ type: 'frame.updated', data: { patch: { title: 'Core thesis' } } });

  // A double-click on a card is not a double-click on empty space: no note is added on top of it. It opens the
  // card in the reader instead (P2.5), which records one `card.opened`.
  const seqBefore = (await uiBoard(page)).seq;
  await page.mouse.dblclick(1200, 220);
  await expect(page.getByTestId('reader')).toBeVisible();
  await settled(page);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('orb-card')).toHaveCount(3);
  expect((await uiBoard(page)).seq).toBe(seqBefore + 1);
  await expect.poll(() => events(canvasId).at(-1)?.type).toBe('card.opened');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('reader')).toHaveCount(0);

  // A fourth note, deleted with the Delete key (it is selected on creation).
  await page.mouse.dblclick(400, 640);
  await expect(page.getByTestId('orb-card')).toHaveCount(4);
  await settled(page);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('orb-card')).toHaveCount(3);
  await settled(page);
  await expect.poll(() => events(canvasId).at(-1)).toMatchObject({ type: 'card.removed' });

  // Undo / redo (P2.4) with Cmd+Z and Cmd+Shift+Z: compensating events appended after an undo.marker.
  const beforeUndo = await uiBoard(page);
  const records = (b: BoardState) => ({
    cards: b.cards,
    frames: b.frames,
    links: b.links,
    order: [Object.keys(b.cards), Object.keys(b.frames), Object.keys(b.links)],
  });
  const logLength = events(canvasId).length;
  await page.keyboard.press('Meta+z'); // undo the delete: the fourth note is back
  await expect(page.getByTestId('orb-card')).toHaveCount(4);
  await settled(page);
  await expect
    .poll(() =>
      events(canvasId)
        .slice(logLength)
        .map((e) => e.type),
    )
    .toEqual(['undo.marker', 'card.added']);
  expect(events(canvasId)[logLength]!.data).toEqual({ op: 'undo', count: 1 });
  await page.keyboard.press('Meta+z'); // undo its creation
  await expect(page.getByTestId('orb-card')).toHaveCount(3);
  await page.keyboard.press('Meta+z'); // undo the rename
  await expect(page.getByTestId('orb-frame-label')).toHaveText('01 THESIS');
  await page.keyboard.press('Meta+z'); // undo the recolour
  await expect(page.getByTestId('orb-frame')).toHaveAttribute('data-frame-color', 'sky');
  await settled(page);
  for (let i = 0; i < 4; i++) await page.keyboard.press('Meta+Shift+z');
  await settled(page);
  await expect(page.getByTestId('orb-frame')).toHaveAttribute('data-frame-color', 'rho');
  await expect(page.getByTestId('orb-frame-label')).toHaveText('01 CORE THESIS');
  await expect(page.getByTestId('orb-card')).toHaveCount(3);
  await expect.poll(async () => records(await uiBoard(page))).toEqual(records(beforeUndo));
  // 4 undos and 4 redos, each a marker plus its compensating events; nothing was rewritten.
  await expect
    .poll(() => events(canvasId).filter((e, i) => i >= logLength && e.type === 'undo.marker').length)
    .toBe(8);
  expect(events(canvasId).slice(0, logLength)).toHaveLength(logLength);
  // In a text field Cmd+Z stays text editing: the board is not touched.
  const seqTyping = (await uiBoard(page)).seq;
  await page.getByTestId('orb-frame-label').dblclick();
  await page.getByTestId('frame-title-input').fill('Typing');
  await page.getByTestId('frame-title-input').press('Meta+z');
  await page.getByTestId('frame-title-input').fill('Core thesis'); // unchanged title: Enter writes nothing
  await page.getByTestId('frame-title-input').press('Enter');
  await page.waitForTimeout(300);
  expect((await uiBoard(page)).seq).toBe(seqTyping);

  // Quit (the service flushes on dispose), then relaunch and reopen from Home.
  await expect.poll(async () => (await uiBoard(page)).seq).toBe(events(canvasId).length - 1);
  const finalBoard = await uiBoard(page);
  expect(fold(events(canvasId))).toEqual(finalBoard);
  await expect(page.getByTestId('orb-error')).toHaveCount(0);
  await app!.close();
  app = undefined;

  page = await launch();
  await page.locator(`[data-testid="orb-canvas-open"][data-canvas-id="${canvasId}"]`).click();
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await expect(page.getByTestId('orb-card')).toHaveCount(3);
  expect(await uiBoard(page)).toEqual(finalBoard);
  expect(fold(events(canvasId))).toEqual(finalBoard);
  await expect(page.getByTestId('orb-frame-label')).toHaveText('01 CORE THESIS');
  await expect(page.getByTestId('orb-frame')).toHaveAttribute('data-frame-color', 'rho');
  await expect(page.locator('[data-testid="orb-link"][data-dashed]')).toHaveCount(1);
});

test('P6.9: a frame drawn over loose notes adopts them (one undo), delete renumbers, a new frame never repeats a title', async () => {
  await app?.close().catch(() => undefined);
  app = undefined;
  const page = await launch();
  await createCanvas(page, 'Frames');
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');

  // Two loose notes, then a frame drawn around them.
  await page.getByTestId('tool-note').click();
  await page.mouse.click(350, 300);
  await page.mouse.dblclick(650, 300);
  await expect(page.getByTestId('orb-card')).toHaveCount(2);
  await settled(page);
  await page.getByTestId('tool-frame').click();
  await drag(page, [200, 150], [900, 520]);
  await expect(page.getByTestId('frame-title-input')).toBeVisible();
  await page.getByTestId('frame-title-input').press('Enter');
  await settled(page);
  let board = await uiBoard(page);
  const first = Object.keys(board.frames)[0]!;
  expect(Object.values(board.cards).map((c) => c.frameId)).toEqual([first, first]);

  // One undo takes the frame AND the adoption back (the notes are loose again).
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => Object.keys((await uiBoard(page)).frames).length).toBe(0);
  expect(Object.values((await uiBoard(page)).cards).map((c) => c.frameId)).toEqual([null, null]);
  await page.keyboard.press('Meta+Shift+z');
  await expect.poll(async () => Object.keys((await uiBoard(page)).frames).length).toBe(1);

  // Three frames named Frame 1..3 by default; delete the first: the rest renumber, and the next new frame is not a repeat.
  await page.getByTestId('tool-frame').click();
  await drag(page, [1000, 150], [1300, 400]);
  await page.getByTestId('frame-title-input').press('Enter');
  await settled(page);
  await page.getByTestId('tool-frame').click();
  await drag(page, [1000, 500], [1300, 800]);
  await page.getByTestId('frame-title-input').press('Enter');
  await settled(page);
  const labels = () => page.getByTestId('orb-frame-label').allTextContents();
  await expect.poll(labels).toEqual(['01 FRAME 1', '02 FRAME 2', '03 FRAME 3']);
  await page.getByTestId('orb-frame-label').first().click();
  await page.keyboard.press('Delete');
  await expect.poll(labels).toEqual(['01 FRAME 2', '02 FRAME 3']);
  await page.getByTestId('tool-frame').click();
  await drag(page, [100, 600], [400, 850]);
  await page.getByTestId('frame-title-input').press('Enter');
  await settled(page);
  await expect.poll(labels).toEqual(['01 FRAME 2', '02 FRAME 3', '03 FRAME 4']);
  board = await uiBoard(page);
  expect(new Set(Object.values(board.frames).map((f) => f.title)).size).toBe(3);
});
