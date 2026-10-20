/**
 * P6.20 in the canvas service: the heights the renderer measures arrive as `layout.measured` on `orb/board.command`,
 * are stored as ordinary card events (so a reopened board is exactly the live one), never go on the undo stack, never
 * pin or move a card the user placed; the camera a canvas was left at is kept in canvas.json (not in the board log).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isPinned, type BoardEvent, type Card } from '@orb/shared';
import { BOARD_FILE, CANVAS_FILE, CanvasStore } from '../src/index.js';

let home: string;
let store: CanvasStore;
const clock = Date.UTC(2026, 9, 16, 12);
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'orb-measure-'));
  store = new CanvasStore({ home, now: () => clock });
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

const log = (id: string): BoardEvent[] =>
  readFileSync(join(home, 'canvases', id, BOARD_FILE), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BoardEvent);

const intake = {
  company: 'Acme Robotics',
  website: 'acme.com',
  stage: 'Series A',
  round_amount: '$12M',
  thesis: 'Warehouse robots that pay back in a year',
  concerns: 'Hardware margins and one big customer',
  founders: 'Ada Lovelace, https://linkedin.com/in/ada',
  sites: ['crunchbase.com'],
  depth: 'standard',
};

async function vcCanvas() {
  const meta = await store.create({
    prompt: 'Acme: research',
    template: 'vc-dd',
    intake,
    depth: 'standard',
    start: false,
  });
  return meta.id;
}

describe('layout.measured', () => {
  it('stores the measured heights as card events and reflows the frame; the same measurement again writes nothing', async () => {
    const id = await vcCanvas();
    const board = await store.board(id);
    const seeds = board.cards().filter((c) => c.seed);
    expect(seeds.length).toBeGreaterThan(10);
    const first = seeds.filter((c) => c.frameId === seeds[0]!.frameId);
    const heights = Object.fromEntries(first.map((c) => [c.id, 200]));
    await store.flush();
    const before = log(id).length;
    const undoBefore = (await store.history(id)).undo;
    const r = await store.userCommand(id, { type: 'layout.measured', heights });
    expect(r.events.length).toBeGreaterThan(0);
    expect(r.events.every((e) => e.actor.kind === 'user')).toBe(true);
    expect(r.events.some((e) => e.type === 'card.updated')).toBe(true);
    // Not an edit: never on the undo stack, and no card is pinned by it.
    expect(r.history.undo).toBe(undoBefore);
    expect(board.cards().some((c) => c.userMoved)).toBe(false);
    for (const c of board.cards().filter((c) => c.seed)) expect(isPinned(c)).toBe(false);
    for (const c of first) expect(board.card(c.id)!.h).toBeGreaterThanOrEqual(176);
    await store.flush();
    expect(log(id).length).toBe(before + r.events.length);
    // Repeating the report changes nothing.
    const again = await store.userCommand(id, { type: 'layout.measured', heights });
    expect(again.events).toEqual([]);
    // Undo does not take a measurement back (it would undo nothing, or the user's earlier action).
    const undone = await store.userCommand(id, { type: 'undo' });
    expect(undone.events).toEqual([]);
  });

  it('survives reopen exactly: a new service replaying board.jsonl folds to the same board', async () => {
    const id = await vcCanvas();
    const live = await store.board(id);
    const heights = Object.fromEntries(
      live.cards().map((c) => [c.id, 177 + (c.id.charCodeAt(c.id.length - 1) % 90)]),
    );
    await store.userCommand(id, { type: 'layout.measured', heights });
    await store.flush();
    const snapshot = JSON.stringify(live.current);
    await store.close();
    store = new CanvasStore({ home, now: () => clock });
    const reopened = await store.board(id);
    expect(JSON.stringify(reopened.current)).toBe(snapshot);
  });

  it('ignores unknown and user-placed cards, and refuses malformed reports', async () => {
    const id = await vcCanvas();
    const board = await store.board(id);
    const frame = board.frames()[0]!;
    const [ev] = await store.commandEvents(id, {
      type: 'card.added',
      card: {
        type: 'note',
        frameId: frame.id,
        x: frame.x + 40,
        y: frame.y + 60,
        w: 240,
        h: 150,
        data: { text: 'mine' },
      },
    });
    const mine = (ev!.data as { card: Card }).card;
    const r = await store.userCommand(id, {
      type: 'layout.measured',
      heights: { [mine.id]: 600, c_nope: 300 },
    });
    expect(r.events).toEqual([]);
    expect(board.card(mine.id)).toMatchObject({ h: 150, x: mine.x, y: mine.y });
    await expect(store.userCommand(id, { type: 'layout.measured', heights: {} } as never)).rejects.toThrow();
    await expect(
      store.userCommand(id, { type: 'layout.measured', heights: { c_x: -5 } } as never),
    ).rejects.toThrow();
  });
});

describe('camera', () => {
  it('is kept in canvas.json, not in the board log, and survives reopen', async () => {
    const id = await vcCanvas();
    await store.flush();
    const before = log(id).length;
    const meta = await store.setCamera(id, { panX: -120.5, panY: 40, zoom: 0.4 });
    expect(meta.camera).toEqual({ panX: -120.5, panY: 40, zoom: 0.4 });
    expect(log(id).length).toBe(before);
    expect(JSON.parse(readFileSync(join(home, 'canvases', id, CANVAS_FILE), 'utf8')).camera).toEqual(
      meta.camera,
    );
    expect((await store.open(id)).camera).toEqual(meta.camera);
    await expect(store.setCamera(id, { panX: 0, panY: 0, zoom: 9 })).rejects.toThrow(/camera/);
    await expect(store.setCamera(id, { panX: Number.NaN, panY: 0, zoom: 1 })).rejects.toThrow(/camera/);
  });
});

describe('explicit board repacking', () => {
  it('compacts a legacy tall board, preserves content and pinned cards, and undoes in one action', async () => {
    const id = await vcCanvas();
    const board = await store.board(id);
    const frames = board.frames();
    // Reproduce the old three-column layout with tall frames and excess space.
    for (const [i, f] of frames.entries()) {
      const dx = 80 + (i % 3) * 1300 - f.x;
      const dy = 100 + Math.floor(i / 3) * 3200 - f.y;
      await store.commandEvents(id, {
        type: 'batch',
        commands: [
          { type: 'frame.updated', id: f.id, patch: { x: f.x + dx, y: f.y + dy, h: 3000 } },
          {
            type: 'card.moved',
            moves: board
              .cards()
              .filter((c) => c.frameId === f.id)
              .map((c) => ({ id: c.id, x: c.x + dx, y: c.y + dy, pinned: null })),
          },
        ],
      });
    }
    const f = board.frames()[0]!;
    const pinEvent = await store.commandEvents(id, {
      type: 'card.added',
      card: {
        type: 'note',
        frameId: f.id,
        x: f.x + 24,
        y: f.y + 56,
        w: 240,
        h: 176,
        data: { text: 'Keep this exactly here' },
      },
    });
    const pin = (pinEvent[0]!.data as { card: Card }).card;
    const before = structuredClone(board.current);
    const depth = board.history.undo;
    const result = await store.userCommand(id, { type: 'layout.repacked' });
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.history.undo).toBe(depth + 1);
    expect(board.card(pin.id)).toEqual(pin);
    expect(board.current.frames[f.id]).toEqual(before.frames[f.id]);
    const bottom = (s: typeof before) => Math.max(...Object.values(s.frames).map((f) => f.y + f.h));
    expect(bottom(board.current)).toBeLessThan(bottom(before) * 0.75);
    for (const c of board.cards()) {
      expect(c.data).toEqual(before.cards[c.id]!.data);
      expect(c.why).toEqual(before.cards[c.id]!.why);
    }
    expect((await store.userCommand(id, { type: 'layout.repacked' })).events).toEqual([]);
    await store.userCommand(id, { type: 'undo' });
    expect(board.current.cards).toEqual(before.cards);
    expect(board.current.frames).toEqual(before.frames);
  });
});
