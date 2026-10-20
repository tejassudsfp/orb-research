import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CanvasMeta, type BoardFollowFrame } from '@orb/shared';
import { BOARD_FILE, CANVAS_FILE, CanvasStore, isCanvasError, slugOf, ulid } from '../src/index.js';

let home: string;
let store: CanvasStore;
const day = Date.UTC(2026, 9, 14, 12);
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'orb-store-'));
  store = new CanvasStore({ home, now: () => day });
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

const note = (x = 0, y = 0) => ({ type: 'note' as const, x, y, w: 200, h: 120, data: { text: 'hi' } });

describe('canvas folders', () => {
  it('creates <date>-<slug>/ with canvas.json and an empty board.jsonl', async () => {
    const meta = await store.create({ prompt: 'Heat pumps in cold climates\nmore detail' });
    expect(meta).toEqual({
      id: '2026-10-14-heat-pumps-in-cold-climates-more-detail',
      title: 'Heat pumps in cold climates',
      created: day,
      rootSessionId: null,
      childAgentIds: {},
    });
    const dir = join(home, 'canvases', meta.id);
    expect(CanvasMeta.parse(JSON.parse(readFileSync(join(dir, CANVAS_FILE), 'utf8')))).toEqual(meta);
    expect(readFileSync(join(dir, BOARD_FILE), 'utf8')).toBe('');
    expect(await store.open(meta.id)).toEqual(meta);
  });

  it('suffixes colliding ids and lists canvases', async () => {
    const a = await store.create({ prompt: 'Same' });
    const b = await store.create({ prompt: 'Same' });
    const c = await store.create({ prompt: '!!!' });
    expect([a.id, b.id, c.id]).toEqual(['2026-10-14-same', '2026-10-14-same-2', '2026-10-14-canvas']);
    expect((await store.list()).map((m) => m.id).sort()).toEqual([a.id, b.id, c.id].sort());
  });

  it('renames a canvas: canvas.json title only, id unchanged, concurrent renames serialized', async () => {
    const meta = await store.create({ prompt: 'Old title' });
    await store.setRootSession(meta.id, 'orb-root');
    const results = await Promise.all([store.rename(meta.id, 'First'), store.rename(meta.id, ' Second ')]);
    expect(results.map((m) => m.title)).toEqual(['First', 'Second']);
    const onDisk = CanvasMeta.parse(
      JSON.parse(readFileSync(join(home, 'canvases', meta.id, CANVAS_FILE), 'utf8')),
    );
    expect(onDisk).toEqual({ ...meta, title: 'Second', rootSessionId: 'orb-root' });
    const empty = await store.rename(meta.id, '  ').catch((e: unknown) => e);
    expect(isCanvasError(empty) && empty.code).toBe('orb/invalid-args');
    const missing = await store.rename('2026-01-01-missing', 'x').catch((e: unknown) => e);
    expect(isCanvasError(missing) && missing.code).toBe('orb/not-found');
  });

  it('reports not-found and invalid ids as CanvasErrors', async () => {
    const nf = await store.open('2026-01-01-missing').catch((e: unknown) => e);
    expect(isCanvasError(nf) && nf.code).toBe('orb/not-found');
    expect(() => store.dirOf('../etc')).toThrow(/invalid canvas id/);
    const bad = await store.board('../x').catch((e: unknown) => e);
    expect(isCanvasError(bad) && bad.code).toBe('orb/invalid-args');
  });

  it('slugs and ulids', () => {
    expect(slugOf('  Ünïcödé — Tést! ')).toBe('unicode-test');
    const id = ulid(day);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(ulid(day + 1) > id).toBe(true);
  });
});

describe('board commands and fold', () => {
  it('frame.added mints an f_ id + provenance, folds in order, is in the snapshot and survives reopen', async () => {
    const { id } = await store.create({ prompt: 'Frames' });
    const draft = { title: 'Thesis', color: 'sky' as const, x: 0, y: 0, w: 400, h: 300 };
    const a = await store.command(id, { type: 'frame.added', frame: draft });
    await store.command(id, { type: 'frame.added', frame: { ...draft, title: 'Market', color: 'rho' } });
    const frame = (a.data as { frame: { id: string; provenance: unknown } }).frame;
    expect(frame.id).toMatch(/^f_/);
    expect(frame.provenance).toEqual({ kind: 'user', at: day });
    const board = await store.board(id);
    expect(board.snapshot().frames.map((f) => f.title)).toEqual(['Thesis', 'Market']);
    await expect(
      store.command(id, { type: 'frame.added', frame: { ...draft, color: 'red' as never } }),
    ).rejects.toThrow();
    await store.close();
    store = new CanvasStore({ home, now: () => day });
    expect((await store.board(id)).frames().map((f) => [f.id, f.title, f.color])).toEqual([
      [frame.id, 'Thesis', 'sky'],
      [expect.stringMatching(/^f_/), 'Market', 'rho'],
    ]);
  });

  it('card.added mints id + provenance; card.moved moves; both persist across reopen', async () => {
    const { id } = await store.create({ prompt: 'Board' });
    const added = await store.command(id, { type: 'card.added', card: note(1, 2) });
    expect(added).toMatchObject({ v: 1, seq: 0, ts: day, type: 'card.added', actor: { kind: 'user' } });
    const card = (added.data as { card: { id: string; provenance: unknown; frameId: unknown } }).card;
    expect(card.id).toMatch(/^c_[0-9A-Z]{26}$/);
    expect(card.provenance).toEqual({ kind: 'user', at: day });
    expect(card.frameId).toBeNull();
    const moved = await store.command(id, { type: 'card.moved', id: card.id, x: 50, y: 60 });
    expect(moved).toMatchObject({ seq: 1, type: 'card.moved', data: { id: card.id, x: 50, y: 60 } });
    await store.close();

    store = new CanvasStore({ home });
    const board = await store.board(id);
    expect(board.nextSeq).toBe(2);
    expect(board.cards()).toEqual([
      { ...card, x: 50, y: 60, w: 200, h: 120, type: 'note', data: { text: 'hi' } },
    ]);
  });

  it('records the agent actor on agent commands', async () => {
    const { id } = await store.create({ prompt: 'Agent' });
    const actor = {
      kind: 'agent',
      agent: 'scout',
      model: 'mock/mock-1',
      sessionId: 's1',
      toolCallId: 't1',
    } as const;
    const ev = await store.command(
      id,
      { type: 'card.added', card: { ...note(), type: 'source', why: 'relevant' } },
      actor,
    );
    expect(ev.actor).toEqual(actor);
    expect((ev.data as { card: { provenance: unknown } }).card.provenance).toEqual({ ...actor, at: day });
  });

  it('rejects a move of an unknown card and invalid commands without writing', async () => {
    const { id } = await store.create({ prompt: 'Reject' });
    const err = await store
      .command(id, { type: 'card.moved', id: 'c_nope', x: 1, y: 1 })
      .catch((e: unknown) => e);
    expect(isCanvasError(err) && err.code).toBe('orb/not-found');
    await expect(store.command(id, { type: 'card.removed', id: 'c_x' } as never)).rejects.toThrow();
    await expect(
      store.command(id, { type: 'card.added', card: { ...note(), why: 'x'.repeat(141) } }),
    ).rejects.toThrow();
    await store.flush();
    expect(readFileSync(join(home, 'canvases', id, BOARD_FILE), 'utf8')).toBe('');
    expect((await store.board(id)).nextSeq).toBe(0);
  });

  it('close() flushes every open board', async () => {
    const { id } = await store.create({ prompt: 'Flush' });
    for (let i = 0; i < 20; i++) await store.command(id, { type: 'card.added', card: note(i) });
    await store.close();
    expect(
      readFileSync(join(home, 'canvases', id, BOARD_FILE), 'utf8')
        .trim()
        .split('\n'),
    ).toHaveLength(20);
    await expect(store.command(id, { type: 'card.added', card: note() })).rejects.toMatchObject({
      code: 'orb/closed',
    });
  });
});

describe('follow', () => {
  it('streams a snapshot first, then new events in order, until aborted', async () => {
    const { id } = await store.create({ prompt: 'Follow' });
    const first = await store.command(id, { type: 'card.added', card: note() });
    const ac = new AbortController();
    const frames: BoardFollowFrame[] = [];
    const done = (async () => {
      for await (const f of store.follow(id, ac.signal)) frames.push(f);
    })();
    await expect.poll(() => frames.length).toBe(1);
    expect(frames[0]).toMatchObject({ kind: 'snapshot', canvasId: id, nextSeq: 1 });
    expect((frames[0] as { cards: unknown[] }).cards).toHaveLength(1);
    const cardId = (first.data as { card: { id: string } }).card.id;
    await store.command(id, { type: 'card.moved', id: cardId, x: 9, y: 9 });
    await store.command(id, { type: 'card.added', card: note(3) });
    await expect.poll(() => frames.length).toBe(3);
    expect(frames.slice(1).map((f) => f.kind === 'event' && f.event.seq)).toEqual([1, 2]);
    ac.abort();
    await done;
  });

  it('ends open streams when the store closes', async () => {
    const { id } = await store.create({ prompt: 'Close' });
    const frames: BoardFollowFrame[] = [];
    const done = (async () => {
      for await (const f of store.follow(id)) frames.push(f);
    })();
    await expect.poll(() => frames.length).toBe(1);
    await store.close();
    await done;
  });

  it('two followers see the same events; nothing is lost between snapshot and subscription', async () => {
    const { id } = await store.create({ prompt: 'Two' });
    const ac = new AbortController();
    const a: BoardFollowFrame[] = [];
    const b: BoardFollowFrame[] = [];
    const run = (out: BoardFollowFrame[]) =>
      (async () => {
        for await (const f of store.follow(id, ac.signal)) out.push(f);
      })();
    const da = run(a);
    const writes = Array.from({ length: 10 }, (_, i) =>
      store.command(id, { type: 'card.added', card: note(i) }),
    );
    const db = run(b);
    await Promise.all(writes);
    await expect.poll(() => a.length).toBe(11);
    await expect.poll(() => b.length).toBeGreaterThan(0);
    // b's snapshot + events cover all 10 events exactly once, whenever it subscribed.
    const snap = b[0] as { nextSeq: number; cards: unknown[] };
    await expect.poll(() => snap.cards.length + b.length - 1).toBe(10);
    ac.abort();
    await Promise.all([da, db]);
    expect(existsSync(join(home, 'canvases', id, BOARD_FILE))).toBe(true);
  });
});

describe('user commands (P2.3)', () => {
  const frameDraft = { title: 'Thesis', color: 'sky' as const, x: 0, y: 0, w: 600, h: 400 };
  const idOf = (e: { data: unknown }, key: 'card' | 'frame' | 'link') =>
    (e.data as Record<string, { id: string }>)[key]!.id;

  it('persists every command type; a reopened store folds the log to the same board', async () => {
    const { id } = await store.create({ prompt: 'Commands' });
    const frame = idOf(await store.command(id, { type: 'frame.added', frame: frameDraft }), 'frame');
    const a = idOf(
      await store.command(id, { type: 'card.added', card: { ...note(10, 20), frameId: frame } }),
      'card',
    );
    const b = idOf(await store.command(id, { type: 'card.added', card: note(900, 0) }), 'card');
    const c = idOf(await store.command(id, { type: 'card.added', card: note(900, 400) }), 'card');
    await store.command(id, {
      type: 'frame.updated',
      id: frame,
      patch: { title: 'Market', color: 'rho', w: 640 },
    });
    await store.command(id, {
      type: 'card.moved',
      moves: [
        { id: a, x: 30, y: 40 },
        { id: b, x: 50, y: 60, frameId: frame },
      ],
    });
    await store.command(id, { type: 'card.updated', id: c, patch: { w: 300, h: 220 } });
    const l1 = idOf(
      await store.command(id, { type: 'link.added', link: { from: a, to: c, type: 'tension' } }),
      'link',
    );
    await store.command(id, {
      type: 'link.added',
      link: { from: frame, to: c, type: 'label', label: 'see also' },
    });
    await store.command(id, { type: 'link.removed', ids: [l1] });
    const batch = await store.commandEvents(id, {
      type: 'batch',
      commands: [
        { type: 'frame.added', frame: { ...frameDraft, title: 'Risks', x: 1000 } },
        { type: 'card.removed', ids: [b] },
      ],
    });
    expect(batch.map((e) => e.type)).toEqual(['frame.added', 'card.removed']);
    expect(batch.map((e) => e.seq)).toEqual([10, 11]);
    const before = (await store.board(id)).current;
    expect(Object.keys(before.cards)).toEqual([a, c]);
    expect(Object.values(before.frames).map((f) => [f.title, f.color])).toEqual([
      ['Market', 'rho'],
      ['Risks', 'sky'],
    ]);
    expect(Object.values(before.links).map((l) => [l.type, l.label])).toEqual([['label', 'see also']]);

    await store.close();
    const again = new CanvasStore({ home, now: () => day });
    try {
      expect((await again.board(id)).current).toEqual(before);
    } finally {
      await again.close();
    }
  });

  it('refuses an invalid batch without writing any of it', async () => {
    const { id } = await store.create({ prompt: 'Atomic' });
    const card = idOf(await store.command(id, { type: 'card.added', card: note() }), 'card');
    const err = await store
      .commandEvents(id, {
        type: 'batch',
        commands: [
          { type: 'card.moved', moves: [{ id: card, x: 5, y: 5 }] },
          { type: 'card.removed', ids: ['c_missing'] },
        ],
      })
      .catch((e: unknown) => e);
    expect(isCanvasError(err) && err.code).toBe('orb/not-found');
    await store.flush();
    expect(
      readFileSync(join(home, 'canvases', id, BOARD_FILE), 'utf8')
        .trim()
        .split('\n'),
    ).toHaveLength(1);
    expect((await store.board(id)).current.cards[card]).toMatchObject({ x: 0, y: 0 });
  });

  it('agents may not move, edit or delete user notes (orb/forbidden)', async () => {
    const { id } = await store.create({ prompt: 'Notes' });
    const card = idOf(await store.command(id, { type: 'card.added', card: note() }), 'card');
    const actor = { kind: 'agent', agent: 'critic', model: 'm', sessionId: 's' } as const;
    const err = await store
      .command(id, { type: 'card.removed', ids: [card] }, actor)
      .catch((e: unknown) => e);
    expect(isCanvasError(err) && err.code).toBe('orb/forbidden');
    await store.command(id, { type: 'card.removed', ids: [card] });
    expect((await store.board(id)).current.cards).toEqual({});
  });

  it('tags followers with the pendingId; the log never stores it', async () => {
    const { id } = await store.create({ prompt: 'Pending' });
    const ac = new AbortController();
    const frames: BoardFollowFrame[] = [];
    const done = (async () => {
      for await (const f of store.follow(id, ac.signal)) frames.push(f);
    })();
    await expect.poll(() => frames.length).toBe(1);
    await store.commandEvents(id, {
      type: 'batch',
      pendingId: 'p1',
      commands: [
        { type: 'card.added', card: note() },
        { type: 'card.added', card: note(1) },
      ],
    });
    await store.command(id, { type: 'card.added', card: note(2) });
    await expect.poll(() => frames.length).toBe(4);
    expect(frames.slice(1).map((f) => f.kind === 'event' && [f.pendingId, f.final])).toEqual([
      ['p1', false],
      ['p1', true],
      [undefined, undefined],
    ]);
    ac.abort();
    await done;
    await store.flush();
    expect(readFileSync(join(home, 'canvases', id, BOARD_FILE), 'utf8')).not.toContain('p1');
  });
});
