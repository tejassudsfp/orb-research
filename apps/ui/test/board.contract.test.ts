/**
 * P2.3 contract test, "all commands persist and reopen restores them exactly", against a REAL sidecar (temp homes,
 * Orb profile + bundle, dsh under Electron-as-Node). The UI's board store sends every command type over the wire
 * (optimistically, with pending ids); then the sidecar ends (clean SIGTERM, or SIGKILL after the 250 ms batch
 * window) and a new sidecar on the same homes serves the board. The reopened follow snapshot, folded by a fresh
 * board store, must equal the board before the restart exactly, and both must equal fold(board.jsonl).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fold, type BoardEvent, type BoardState } from '@orb/shared';
import { startSidecar, type TestSidecar } from '../../../scripts/testkit/index.ts';
import { createBoardStore, type BoardStore } from '../src/store/board.js';
import { WireError, createWire, type Wire } from '../src/wire/index.js';

async function boot(homeDir: string): Promise<{ sc: TestSidecar; wire: Wire }> {
  const sc = await startSidecar({ homeDir });
  const wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 } },
  );
  return { sc, wire };
}

/** A board store following `canvasId` over the wire, as the Canvas screen wires it. */
async function follow(wire: Wire, canvasId: string, signal: AbortSignal): Promise<BoardStore> {
  const store = createBoardStore(canvasId, (command) => wire.orb.board.command(canvasId, command));
  void (async () => {
    try {
      for await (const frame of wire.orb.board.follow(canvasId, { signal })) store.getState().receive(frame);
    } catch {
      // aborted
    }
  })();
  await expect.poll(() => store.getState().ready).toBe(true);
  return store;
}

const fileBoard = (sc: TestSidecar, id: string): BoardState =>
  fold(
    readFileSync(join(sc.paths.orbHome, 'canvases', id, 'board.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as BoardEvent),
  );

const ok = async (p: Promise<boolean>, store: BoardStore) => {
  const done = await p;
  expect(done, store.getState().error).toBe(true);
};

/** Every user command type through the store; returns the settled board. */
async function editBoard(store: BoardStore): Promise<BoardState> {
  const s = () => store.getState();
  const frameDraft = { color: 'sky' as const, x: 0, y: 0, w: 640, h: 420 };
  await ok(
    s().dispatch({ type: 'frame.added', frame: { ...frameDraft, title: 'Thesis' } }, { select: 'created' }),
    store,
  );
  const thesis = s().resolve(s().selection[0]!);
  await ok(
    s().dispatch(
      { type: 'frame.added', frame: { ...frameDraft, title: 'Market', x: 800 } },
      { select: 'created' },
    ),
    store,
  );
  const market = s().resolve(s().selection[0]!);
  // Three notes, then a third frame and a question card added together in one batch.
  const ids: string[] = [];
  for (const [x, y, frameId] of [
    [40, 80, thesis],
    [300, 80, thesis],
    [840, 80, market],
  ] as const) {
    await ok(
      s().dispatch(
        {
          type: 'card.added',
          card: { type: 'note', frameId, x, y, w: 240, h: 150, data: { title: `Note ${x}`, body: '' } },
        },
        { select: 'created' },
      ),
      store,
    );
    ids.push(s().selection[0]!);
  }
  await ok(
    s().dispatch({
      type: 'batch',
      commands: [
        { type: 'frame.added', frame: { ...frameDraft, title: 'Risks', y: 600, color: 'paper' } },
        {
          type: 'card.added',
          card: { type: 'question', x: 40, y: 700, w: 260, h: 160, data: { title: 'Why?' } },
        },
      ],
    }),
    store,
  );
  const [a, b, c] = ids.map((id) => s().resolve(id)) as [string, string, string];
  const question = Object.values(s().board.cards).find((card) => card.type === 'question')!.id;
  const risks = Object.values(s().board.frames).find((f) => f.title === 'Risks')!.id;

  // Group move (one card.moved), a card moved into another frame, resize, frame rename/recolour/move/resize.
  await ok(
    s().dispatch({
      type: 'card.moved',
      moves: [
        { id: a, x: 60, y: 100 },
        { id: b, x: 320, y: 100 },
      ],
    }),
    store,
  );
  await ok(s().dispatch({ type: 'card.moved', moves: [{ id: c, x: 120, y: 660, frameId: risks }] }), store);
  await ok(s().dispatch({ type: 'card.updated', id: b, patch: { w: 300, h: 220 } }), store);
  await ok(
    s().dispatch({ type: 'frame.updated', id: market, patch: { title: 'Competitors', color: 'rho' } }),
    store,
  );
  await ok(
    s().dispatch({
      type: 'batch',
      commands: [
        { type: 'frame.updated', id: thesis, patch: { x: 20, y: 10, w: 700, h: 460 } },
        {
          type: 'card.moved',
          moves: [
            { id: a, x: 80, y: 110 },
            { id: b, x: 340, y: 110 },
          ],
        },
      ],
    }),
    store,
  );
  // Links: every type, then retype one (remove + add) and remove one.
  const links: [string, string, string, string?][] = [
    [a, b, 'supports'],
    [b, question, 'contradicts'],
    [a, question, 'tension'],
    [thesis, market, 'leads-to'],
    [c, risks, 'example-of'],
    [question, risks, 'label', 'see also'],
  ];
  for (const [from, to, type, label] of links) {
    await ok(
      s().dispatch({
        type: 'link.added',
        link: { from, to, type: type as never, ...(label ? { label } : {}) },
      }),
      store,
    );
  }
  const supports = Object.values(s().board.links).find((l) => l.type === 'supports')!;
  await ok(
    s().dispatch({
      type: 'batch',
      commands: [
        { type: 'link.removed', ids: [supports.id] },
        { type: 'link.added', link: { from: supports.from, to: supports.to, type: 'tension' } },
      ],
    }),
    store,
  );
  const leads = Object.values(s().board.links).find((l) => l.type === 'leads-to')!;
  await ok(s().dispatch({ type: 'link.removed', ids: [leads.id] }), store);
  // Delete: a card (its links go with it) and a frame (its cards stay, detached).
  await ok(s().dispatch({ type: 'card.removed', ids: [question] }), store);
  await ok(s().dispatch({ type: 'frame.removed', id: risks }), store);

  await expect.poll(() => s().pending.length).toBe(0);
  const board = s().board;
  expect(board).toEqual(s().confirmed);
  expect(Object.values(board.frames).map((f) => [f.title, f.color, f.x, f.y, f.w, f.h])).toEqual([
    ['Thesis', 'sky', 20, 10, 700, 460],
    ['Competitors', 'rho', 800, 0, 640, 420],
  ]);
  expect(Object.values(board.cards).map((card) => [card.x, card.y, card.w, card.h, card.frameId])).toEqual([
    [80, 110, 240, 150, thesis],
    [340, 110, 300, 220, thesis],
    [120, 660, 240, 150, null],
  ]);
  expect(Object.values(board.links).map((l) => [l.from, l.to, l.type])).toEqual([[a, b, 'tension']]);
  return board;
}

describe.each([
  ['SIGTERM', false],
  ['SIGKILL', true],
] as const)('board commands persist; reopen after %s restores the board exactly', (_label, kill) => {
  it('every command type, then a new sidecar', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'orb-board-'));
    const sidecars: TestSidecar[] = [];
    const ac = new AbortController();
    try {
      const first = await boot(homeDir);
      sidecars.push(first.sc);
      const meta = await first.wire.orb.canvas.create({ prompt: 'Board commands' });
      const store = await follow(first.wire, meta.id, ac.signal);
      const before = await editBoard(store);

      // The service refuses bad commands with typed errors and writes nothing.
      const err = await first.wire.orb.board
        .command(meta.id, { type: 'link.removed', ids: ['l_missing'] })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(WireError);
      expect((err as WireError).code).toBe('orb/not-found');
      const bad = await first.wire.orb.board
        .command(meta.id, { type: 'card.moved', moves: [] } as never)
        .catch((e: unknown) => e);
      expect((bad as WireError).code).toBe('orb/invalid-args');

      ac.abort();
      first.wire.dispose();
      if (kill) {
        // Past the 250 ms batch window: the writer has fsynced every line.
        await new Promise((r) => setTimeout(r, 600));
        process.kill(first.sc.supervisor.pid!, 'SIGKILL');
        await first.sc.supervisor.stop();
      } else {
        await first.sc.stop();
      }
      expect(fileBoard(first.sc, meta.id)).toEqual(before);

      const second = await boot(homeDir);
      sidecars.push(second.sc);
      const ac2 = new AbortController();
      try {
        await second.wire.orb.canvas.open(meta.id);
        const reopened = await follow(second.wire, meta.id, ac2.signal);
        expect(reopened.getState().confirmed).toEqual(before);
        expect(reopened.getState().board).toEqual(before);
      } finally {
        ac2.abort();
        second.wire.dispose();
        await second.sc.stop();
      }
    } finally {
      ac.abort();
      await Promise.allSettled(sidecars.map((sc) => sc.supervisor.stop()));
      rmSync(homeDir, { recursive: true, force: true });
    }
  }, 90_000);
});
