/**
 * P2.3 board store: optimistic commands with pending ids, reconcile on the follow stream or the reply, rollback on
 * rejection, temporary ids remapped for commands that depend on a still pending one. The "service" is a real
 * in-process CanvasStore (orb-canvas), so planning and reconcile meet the real writer.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CanvasStore } from '@orb/canvas';
import { type BoardCommandRequestInput, type BoardCommandResult, type BoardFollowFrame } from '@orb/shared';
import { createBoardStore, isTempId, remapIds, type BoardStore } from '../src/store/board.js';

let home: string;
let service: CanvasStore;
let canvasId: string;
let ac: AbortController;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-ui-store-'));
  service = new CanvasStore({ home });
  canvasId = (await service.create({ prompt: 'Store' })).id;
  ac = new AbortController();
});
afterEach(async () => {
  ac.abort();
  await service.close();
  rmSync(home, { recursive: true, force: true });
});

type Gate = { open: () => void };

/**
 * A board store wired to the service. `holdStream` delays stream frames until released; `holdReply` delays the
 * command replies. Returns helpers to release them.
 */
async function connect(opts: { holdStream?: boolean; holdReply?: boolean } = {}) {
  const held: BoardFollowFrame[] = [];
  const replies: Gate[] = [];
  let streamHeld = opts.holdStream ?? false;
  const send = async (command: BoardCommandRequestInput): Promise<BoardCommandResult> => {
    const { events, history } = await service.userCommand(canvasId, command);
    if (opts.holdReply) await new Promise<void>((open) => replies.push({ open }));
    return { event: events.at(-1)!, events, history };
  };
  const store = createBoardStore(canvasId, send);
  void (async () => {
    for await (const frame of service.follow(canvasId, ac.signal)) {
      if (streamHeld && frame.kind === 'event') held.push(frame);
      else store.getState().receive(frame);
    }
  })();
  await expect.poll(() => store.getState().ready).toBe(true);
  return {
    store,
    releaseStream() {
      streamHeld = false;
      for (const f of held.splice(0)) store.getState().receive(f);
    },
    releaseReplies() {
      for (const r of replies.splice(0)) r.open();
    },
    get heldReplies() {
      return replies.length;
    },
  };
}

const note = (x = 0, y = 0) =>
  ({ type: 'card.added', card: { type: 'note', x, y, w: 200, h: 120, data: { title: 'n' } } }) as const;
const settled = (store: BoardStore) => expect.poll(() => store.getState().pending.length).toBe(0);
const serviceBoard = async () => (await service.board(canvasId)).current;

describe('board store', () => {
  it('shows a command at once with a temporary id, then the real card when its event arrives', async () => {
    const { store, releaseStream } = await connect({ holdStream: true });
    const done = store.getState().dispatch(note(5, 6), { select: 'created' });
    const [temp] = Object.keys(store.getState().board.cards);
    expect(isTempId(temp!)).toBe(true);
    expect(store.getState().board.cards[temp!]).toMatchObject({ x: 5, y: 6 });
    expect(store.getState().confirmed.cards).toEqual({});
    expect(store.getState().selection).toEqual([temp]);
    expect(await done).toBe(true);
    // The reply alone does not drop the optimistic copy: the confirmed board has not caught up yet.
    expect(store.getState().pending).toHaveLength(1);
    releaseStream();
    await settled(store);
    const [real] = Object.keys(store.getState().board.cards);
    expect(real).toMatch(/^c_[0-9A-Z]{26}$/);
    expect(store.getState().selection).toEqual([real]);
    expect(store.getState().board).toEqual(await serviceBoard());
  });

  it('reconciles from the stream before the reply arrives', async () => {
    const { store, releaseReplies } = await connect({ holdReply: true });
    const done = store.getState().dispatch(note(1, 1));
    await expect.poll(() => Object.keys(store.getState().confirmed.cards)).toHaveLength(1);
    // The tagged final event dropped the pending copy: no duplicate card.
    expect(store.getState().pending).toHaveLength(0);
    expect(Object.keys(store.getState().board.cards)).toHaveLength(1);
    releaseReplies();
    expect(await done).toBe(true);
    expect(store.getState().board).toEqual(await serviceBoard());
  });

  it('a batch shows each item once while its events arrive one by one (no temp + real duplicate)', async () => {
    const held: BoardFollowFrame[] = [];
    let reply!: () => void;
    const store = createBoardStore(canvasId, async (command) => {
      const { events } = await service.userCommand(canvasId, command);
      // The reply is held back: only the stream can reconcile.
      await new Promise<void>((r) => (reply = r));
      return { event: events.at(-1)!, events };
    });
    void (async () => {
      for await (const frame of service.follow(canvasId, ac.signal)) {
        if (frame.kind === 'event') held.push(frame);
        else store.getState().receive(frame);
      }
    })();
    await expect.poll(() => store.getState().ready).toBe(true);
    const frame = { title: 'F', color: 'sky', x: 0, y: 0, w: 300, h: 200 } as const;
    void store.getState().dispatch({
      type: 'batch',
      commands: [
        { type: 'frame.added', frame },
        { type: 'card.added', card: note(10, 10).card },
      ],
    });
    await expect.poll(() => held.length).toBe(2);
    // First event (the frame) lands; the card's event is still on its way.
    store.getState().receive(held[0]!);
    expect(Object.keys(store.getState().board.frames)).toHaveLength(1);
    expect(Object.keys(store.getState().board.cards)).toHaveLength(1);
    store.getState().receive(held[1]!);
    reply();
    await settled(store);
    expect(store.getState().board).toEqual(await serviceBoard());
  });

  it('rolls back a rejected command and reports it', async () => {
    const { store } = await connect();
    await store.getState().dispatch(note());
    await settled(store);
    const before = store.getState().board;
    const [id] = Object.keys(before.cards);
    // Valid locally (the local plan passes) but refused by the service: the card is gone there.
    await service.command(canvasId, { type: 'card.removed', ids: [id!] });
    const sending = store.getState().dispatch({ type: 'card.updated', id: id!, patch: { w: 400 } });
    expect(await sending).toBe(false);
    expect(store.getState().pending).toHaveLength(0);
    expect(store.getState().error).toMatch(/no card/);
    await expect.poll(() => store.getState().board.cards).toEqual({});
  });

  it('refuses locally what cannot apply (nothing is sent)', async () => {
    const { store } = await connect();
    expect(await store.getState().dispatch({ type: 'frame.removed', id: 'f_nope' })).toBe(false);
    expect(store.getState().error).toMatch(/no frame/);
    expect((await serviceBoard()).seq).toBe(-1);
  });

  it('a command on a still pending item waits for its real id', async () => {
    const { store, releaseStream } = await connect({ holdStream: true });
    const add = store
      .getState()
      .dispatch(
        { type: 'frame.added', frame: { title: 'Frame 1', color: 'sky', x: 0, y: 0, w: 400, h: 300 } },
        { select: 'created' },
      );
    const temp = store.getState().selection[0]!;
    expect(temp).toMatch(/^f_pending-/);
    const rename = store.getState().dispatch({ type: 'frame.updated', id: temp, patch: { title: 'Thesis' } });
    expect(store.getState().board.frames[temp]?.title).toBe('Thesis');
    expect(await add).toBe(true);
    expect(await rename).toBe(true);
    releaseStream();
    await settled(store);
    const frames = Object.values(store.getState().board.frames);
    expect(frames.map((f) => f.title)).toEqual(['Thesis']);
    expect(store.getState().resolve(temp)).toBe(frames[0]!.id);
    expect(store.getState().board).toEqual(await serviceBoard());
  });

  it('a gesture preview is drawn but never sent; committing clears it in the same update', async () => {
    const { store } = await connect();
    await store.getState().dispatch(note());
    await settled(store);
    const id = Object.keys(store.getState().board.cards)[0]!;
    store.getState().setPreview({ cards: { [id]: { x: 300, y: 200 } } });
    expect(store.getState().board.cards[id]).toMatchObject({ x: 300, y: 200 });
    expect(store.getState().base.cards[id]).toMatchObject({ x: 0, y: 0 });
    const seen: number[] = [];
    const unsub = store.subscribe((s) => seen.push(s.board.cards[id]!.x));
    await store
      .getState()
      .dispatch({ type: 'card.moved', moves: [{ id, x: 300, y: 200 }] }, { clearPreview: true });
    unsub();
    // Never jumps back to 0 between the preview and the optimistic move.
    expect(seen.every((x) => x === 300)).toBe(true);
    expect(store.getState().preview).toBeNull();
    await settled(store);
    expect((await serviceBoard()).cards[id]).toMatchObject({ x: 300, y: 200 });
  });

  it('selection: replace, toggle, add; removed items leave it', async () => {
    const { store } = await connect();
    await store.getState().dispatch(note());
    await store.getState().dispatch(note(300));
    await settled(store);
    const [a, b] = Object.keys(store.getState().board.cards) as [string, string];
    store.getState().select([a]);
    store.getState().select([b], 'toggle');
    expect(store.getState().selection).toEqual([a, b]);
    store.getState().select([a], 'toggle');
    expect(store.getState().selection).toEqual([b]);
    store.getState().select([a], 'add');
    expect(store.getState().selection).toEqual([b, a]);
    await store.getState().dispatch({ type: 'card.removed', ids: [b] });
    expect(store.getState().selection).toEqual([a]);
  });

  it('remapIds rewrites temporary ids deeply', () => {
    expect(
      remapIds(
        { a: ['c_pending-x-0', { b: 'c_pending-x-0' }], c: 'keep', n: 1 },
        { 'c_pending-x-0': 'c_REAL' },
      ),
    ).toEqual({ a: ['c_REAL', { b: 'c_REAL' }], c: 'keep', n: 1 });
  });

  it('undo/redo (P2.4): wait for commands in flight, then undo and redo the last user action', async () => {
    const sent: string[] = [];
    let gate!: () => void;
    const held = new Promise<void>((r) => (gate = r));
    const store = createBoardStore(canvasId, async (command) => {
      // The first command is held BEFORE it reaches the service: an undo issued meanwhile must not overtake it.
      if (sent.length === 0) {
        sent.push(command.type);
        await held;
      } else sent.push(command.type);
      const { events, history } = await service.userCommand(canvasId, command);
      return { event: events.at(-1), events, history };
    });
    void (async () => {
      for await (const frame of service.follow(canvasId, ac.signal)) store.getState().receive(frame);
    })();
    await expect.poll(() => store.getState().ready).toBe(true);

    const added = store.getState().dispatch(note(3, 4));
    const undone = store.getState().undo();
    expect(store.getState().historyBusy).toBe(1);
    await new Promise((r) => setTimeout(r, 30));
    expect(sent).toEqual(['card.added']);
    gate();
    expect(await added).toBe(true);
    expect(await undone).toBe(true);
    expect(sent).toEqual(['card.added', 'undo']);
    await expect.poll(() => Object.keys(store.getState().board.cards)).toHaveLength(0);
    expect(store.getState().history).toEqual({ undo: 0, redo: 1 });
    expect(store.getState().historyBusy).toBe(0);

    expect(await store.getState().redo()).toBe(true);
    await expect.poll(() => Object.keys(store.getState().board.cards)).toHaveLength(1);
    expect(store.getState().board).toEqual(await serviceBoard());
    expect(store.getState().history).toEqual({ undo: 1, redo: 0 });
    // Nothing to redo: resolves false and changes nothing.
    expect(await store.getState().redo()).toBe(false);
    expect(store.getState().error).toBeUndefined();
  });
});
