/**
 * Contract test (P1.6): the UI wire client against orb-host's `orb` Remote namespace on a REAL sidecar
 * (temp homes, Orb profile + bundle, dsh under Electron-as-Node, mock LLM route). Proves the gateway's SRC
 * fallback serves an out-of-tree TypertRemoteService: unary ping/canvas.* and the board.follow stream.
 * P1.7: orb-host delegates to the orb-canvas service (`orbCanvas`): canvases on disk, board.command, live
 * follow events, and a board that survives a sidecar restart.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockedSidecar, startSidecar, type MockedSidecar } from '../../../scripts/testkit/index.ts';
import { WireError, createWire, type BoardFollowFrame, type Wire } from '../src/wire/index.js';

let sc: MockedSidecar;
let wire: Wire;

beforeAll(async () => {
  sc = await startMockedSidecar();
  wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 } },
  );
});

afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
});

const failure = async (p: Promise<unknown>) => {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(WireError);
  return err as WireError;
};

describe('orb/ping', () => {
  it('answers with a validated value', async () => {
    const before = Date.now();
    const pong = await wire.orb.ping();
    expect(pong).toMatchObject({ ok: true, service: 'orb-host' });
    expect(pong.now).toBeGreaterThanOrEqual(before - 5_000);
  });

  it('rejects unexpected args (gateway exact-argument check)', async () => {
    const err = await failure(wire.call('orb', 'ping', { extra: 1 }));
    expect(err.code).toBe('gateway/arguments-invalid');
  });
});

describe('orb/canvas.*', () => {
  it('creates a canvas and opens it by id', async () => {
    const meta = await wire.orb.canvas.create({ prompt: 'Heat pumps in cold climates' });
    expect(meta.id).toMatch(/^\d{4}-\d{2}-\d{2}-heat-pumps-in-cold-climates$/);
    // P1.8: canvas.create also creates the root Orb agent and stores its session id.
    expect(meta).toMatchObject({ title: 'Heat pumps in cold climates' });
    expect(meta.rootSessionId).toMatch(/^orb-[0-9a-f-]{36}$/);
    expect(await wire.orb.canvas.open(meta.id)).toEqual(meta);
    const again = await wire.orb.canvas.create({ prompt: 'Heat pumps in cold climates' });
    expect(again.id).toBe(`${meta.id}-2`);
  });

  it('validates payloads with zod and reports orb/invalid-args', async () => {
    const empty = await failure(wire.call('orb', 'canvas.create', { request: { prompt: '' } }));
    expect(empty.code).toBe('orb/invalid-args');
    expect(empty.details).toMatchObject({ field: 'request' });
    const missing = await failure(wire.call('orb', 'canvas.create', {}));
    expect(missing.code).toBe('orb/invalid-args');
    const badId = await failure(wire.call('orb', 'canvas.open', { id: '../etc' }));
    expect(badId.code).toBe('orb/invalid-args');
  });

  it('reports orb/not-found for an unknown canvas', async () => {
    const err = await failure(wire.orb.canvas.open('1999-01-01-nothing'));
    expect(err.code).toBe('orb/not-found');
  });

  it('renames a canvas (P2.1 title pill): canvas.json, list and open see the new title', async () => {
    const meta = await wire.orb.canvas.create({ prompt: 'Rename me' });
    const renamed = await wire.orb.canvas.rename(meta.id, { title: 'Research canvas idea' });
    expect(renamed).toEqual({ ...meta, title: 'Research canvas idea' });
    expect(
      JSON.parse(readFileSync(join(sc.paths.orbHome, 'canvases', meta.id, 'canvas.json'), 'utf8')).title,
    ).toBe('Research canvas idea');
    expect((await wire.orb.canvas.list()).find((c) => c.id === meta.id)?.title).toBe('Research canvas idea');
    expect((await wire.orb.canvas.open(meta.id)).title).toBe('Research canvas idea');
    const blank = await failure(wire.orb.canvas.rename(meta.id, { title: ' ' }));
    expect(blank.code).toBe('orb/invalid-args');
    const missing = await failure(wire.orb.canvas.rename('1999-01-01-nothing', { title: 'x' }));
    expect(missing.code).toBe('orb/not-found');
  });
});

describe('orb/board.follow', () => {
  it('streams a snapshot first and stays open until cancelled', async () => {
    const { id } = await wire.orb.canvas.create({ prompt: 'Follow me' });
    const ac = new AbortController();
    const frames: BoardFollowFrame[] = [];
    let ended = false;
    const done = (async () => {
      try {
        for await (const frame of wire.orb.board.follow(id, { signal: ac.signal })) frames.push(frame);
        ended = true;
      } catch (e) {
        if (!ac.signal.aborted) throw e;
      }
    })();
    await expect.poll(() => frames.length, { timeout: 10_000 }).toBe(1);
    expect(frames[0]).toEqual({
      kind: 'snapshot',
      canvasId: id,
      nextSeq: 0,
      cards: [],
      frames: [],
      links: [],
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(ended).toBe(false);
    expect(wire.mux.activeStreams).toBe(1);
    ac.abort();
    await done;
    expect(wire.mux.activeStreams).toBe(0);
    // The socket stays usable after the cancel.
    expect((await wire.orb.ping()).ok).toBe(true);
  });

  it('fails the stream with orb/not-found for an unknown canvas', async () => {
    const err = await failure(
      (async () => {
        for await (const _ of wire.orb.board.follow('1999-01-01-nothing')) void _;
      })(),
    );
    expect(err.code).toBe('orb/not-found');
  });

  it('refuses a stream endpoint called as unary', async () => {
    const err = await failure(wire.call('orb', 'board.follow', { canvasId: 'x' }));
    expect(err.code).toBe('gateway/signature-invalid');
  });
});

const note = (x: number, y: number) => ({ type: 'note' as const, x, y, w: 200, h: 120, data: { text: 'n' } });

describe('orb/board.command (P1.7)', () => {
  it('writes canvas.json under ORB_HOME/canvases/<date>-<slug>/', async () => {
    const meta = await wire.orb.canvas.create({ prompt: 'On disk' });
    const dir = join(sc.paths.orbHome, 'canvases', meta.id);
    expect(JSON.parse(readFileSync(join(dir, 'canvas.json'), 'utf8'))).toEqual(meta);
    expect(readFileSync(join(dir, 'board.jsonl'), 'utf8')).toBe('');
  });

  it('appends card.added / card.moved and streams them to a follower after the snapshot', async () => {
    const { id } = await wire.orb.canvas.create({ prompt: 'Live board' });
    const ac = new AbortController();
    const frames: BoardFollowFrame[] = [];
    const done = (async () => {
      try {
        for await (const frame of wire.orb.board.follow(id, { signal: ac.signal })) frames.push(frame);
      } catch (e) {
        if (!ac.signal.aborted) throw e;
      }
    })();
    await expect.poll(() => frames.length, { timeout: 10_000 }).toBe(1);
    const { event: added } = await wire.orb.board.command(id, { type: 'card.added', card: note(10, 20) });
    expect(added!).toMatchObject({ v: 1, seq: 0, type: 'card.added', actor: { kind: 'user' } });
    const cardId = (added!.data as { card: { id: string } }).card.id;
    const { event: moved } = await wire.orb.board.command(id, {
      type: 'card.moved',
      id: cardId,
      x: 30,
      y: 40,
    });
    expect(moved!.seq).toBe(1);
    await expect.poll(() => frames.length, { timeout: 10_000 }).toBe(3);
    expect(frames.slice(1)).toEqual([
      { kind: 'event', event: added },
      { kind: 'event', event: moved },
    ]);
    ac.abort();
    await done;
    // A new follower gets the folded state in its snapshot.
    const snap = await (async () => {
      for await (const frame of wire.orb.board.follow(id)) return frame;
    })();
    expect(snap).toMatchObject({ kind: 'snapshot', nextSeq: 2, cards: [{ id: cardId, x: 30, y: 40 }] });
  });

  it('validates commands: invalid → orb/invalid-args, unknown card → orb/not-found', async () => {
    const { id } = await wire.orb.canvas.create({ prompt: 'Bad commands' });
    const bad = await failure(
      wire.call('orb', 'board.command', { canvasId: id, command: { type: 'card.removed' } }),
    );
    expect(bad.code).toBe('orb/invalid-args');
    expect(bad.details).toMatchObject({ field: 'command' });
    const missing = await failure(
      wire.orb.board.command(id, { type: 'card.moved', id: 'c_none', x: 0, y: 0 }),
    );
    expect(missing.code).toBe('orb/not-found');
    const noCanvas = await failure(
      wire.orb.board.command('1999-01-01-x', { type: 'card.added', card: note(0, 0) }),
    );
    expect(noCanvas.code).toBe('orb/not-found');
  });
});

describe('orb/board.command undo and redo (P2.4)', () => {
  it('undo/redo append an undo.marker plus compensating events and report the stack depth', async () => {
    const { id } = await wire.orb.canvas.create({ prompt: 'Undo over the wire' });
    const { event: added } = await wire.orb.board.command(id, { type: 'card.added', card: note(10, 20) });
    const cardId = (added!.data as { card: { id: string } }).card.id;
    const moved = await wire.orb.board.command(id, { type: 'card.moved', id: cardId, x: 30, y: 40 });
    expect(moved.history).toEqual({ undo: 2, redo: 0 });

    const undo = await wire.orb.board.command(id, { type: 'undo' });
    expect(undo.events.map((e) => [e.seq, e.type, e.actor.kind])).toEqual([
      [2, 'undo.marker', 'user'],
      [3, 'card.moved', 'user'],
    ]);
    expect(undo.events[1]!.data).toEqual({ moves: [{ id: cardId, x: 10, y: 20, frameId: null }] });
    expect(undo.history).toEqual({ undo: 1, redo: 1 });
    expect((await wire.orb.board.command(id, { type: 'undo' })).history).toEqual({ undo: 0, redo: 2 });
    const nothing = await wire.orb.board.command(id, { type: 'undo' });
    expect(nothing).toEqual({ events: [], history: { undo: 0, redo: 2 } });

    const redo = await wire.orb.board.command(id, { type: 'redo' });
    expect(redo.events.map((e) => e.type)).toEqual(['undo.marker', 'card.added']);
    expect(redo.events[0]!.data).toEqual({ op: 'redo', count: 1 });
    const snap = await (async () => {
      for await (const frame of wire.orb.board.follow(id)) return frame;
    })();
    expect(snap).toMatchObject({ kind: 'snapshot', nextSeq: 8, cards: [{ id: cardId, x: 10, y: 20 }] });
  });
});

describe('board survives a sidecar restart (P1.7)', () => {
  it('flushes on shutdown and replays board.jsonl on reopen', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'orb-restart-'));
    try {
      const first = await startSidecar({ homeDir });
      const w1 = createWire({ baseUrl: first.baseUrl, fetch: first.fetch, createSocket: first.createSocket });
      const meta = await w1.orb.canvas.create({ prompt: 'Restart me' });
      const { event } = await w1.orb.board.command(meta.id, { type: 'card.added', card: note(5, 6) });
      const cardId = (event!.data as { card: { id: string } }).card.id;
      // Issued and stopped well inside the 250 ms flush window: only the dispose-time flush can persist it.
      await w1.orb.board.command(meta.id, { type: 'card.moved', id: cardId, x: 7, y: 8 });
      w1.dispose();
      await first.stop();

      const second = await startSidecar({ homeDir });
      const w2 = createWire({
        baseUrl: second.baseUrl,
        fetch: second.fetch,
        createSocket: second.createSocket,
      });
      try {
        expect(await w2.orb.canvas.open(meta.id)).toEqual(meta);
        const snap = await (async () => {
          for await (const frame of w2.orb.board.follow(meta.id)) return frame;
        })();
        expect(snap).toMatchObject({ kind: 'snapshot', nextSeq: 2, cards: [{ id: cardId, x: 7, y: 8 }] });
      } finally {
        w2.dispose();
        await second.stop();
      }
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
