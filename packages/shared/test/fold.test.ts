import { describe, expect, it } from 'vitest';
import {
  applyEvent,
  boardCards,
  boardFrames,
  emptyBoard,
  fold,
  parseBoardEvent,
  type BoardEvent,
  type Card,
  type Frame,
} from '../src/index.js';

const user = { kind: 'user' } as const;
const card = (id: string, x = 0, y = 0): Card => ({
  id,
  type: 'note',
  frameId: null,
  x,
  y,
  w: 200,
  h: 120,
  data: { text: id },
  provenance: { ...user, at: 1 },
});
const added = (seq: number, c: Card): BoardEvent => ({
  v: 1,
  seq,
  ts: seq,
  type: 'card.added',
  actor: user,
  data: { card: c },
});
const moved = (seq: number, id: string, x: number, y: number): BoardEvent => ({
  v: 1,
  seq,
  ts: seq,
  type: 'card.moved',
  actor: user,
  data: { id, x, y },
});

describe('board fold', () => {
  it('starts empty at seq -1', () => {
    expect(emptyBoard()).toEqual({ seq: -1, cards: {}, frames: {}, links: {} });
  });

  it('adds and moves cards, keeping insertion order', () => {
    const state = fold([added(0, card('c_a')), added(1, card('c_b')), moved(2, 'c_a', 10, 20)]);
    expect(state.seq).toBe(2);
    expect(boardCards(state).map((c) => [c.id, c.x, c.y])).toEqual([
      ['c_a', 10, 20],
      ['c_b', 0, 0],
    ]);
  });

  it('ignores a move of an unknown card but advances seq', () => {
    const state = fold([added(0, card('c_a')), moved(1, 'c_zz', 5, 5)]);
    expect(state.seq).toBe(1);
    expect(state.cards['c_a']!.x).toBe(0);
  });

  it('advances seq over event types Phase 1 does not fold', () => {
    const state = fold([{ v: 1, seq: 0, ts: 0, type: 'viewport.saved', actor: user, data: {} }]);
    expect(state).toEqual({ seq: 0, cards: {}, frames: {}, links: {} });
  });

  it('rejects seq gaps and duplicates', () => {
    expect(() => fold([added(1, card('c_a'))])).toThrow(/expected seq 0/);
    expect(() => fold([added(0, card('c_a')), added(0, card('c_b'))])).toThrow(/expected seq 1/);
  });

  it('rejects invalid payloads of folded types', () => {
    expect(() => fold([{ ...moved(0, 'c_a', 1, 1), data: { id: 'c_a', x: 'nope' } }])).toThrow();
    expect(() => fold([{ ...added(0, card('c_a')), data: { card: { id: 'bad' } } }])).toThrow();
  });

  it('applyEvent is pure and fold continues from a prior state', () => {
    const s0 = fold([added(0, card('c_a'))]);
    const s1 = applyEvent(s0, moved(1, 'c_a', 7, 8));
    expect(s0.cards['c_a']!.x).toBe(0);
    expect(s1.cards['c_a']!.x).toBe(7);
    expect(s1.cards).not.toBe(s0.cards);
    const s2 = fold([moved(2, 'c_a', 9, 9)], s1);
    expect(s1.cards['c_a']!.x).toBe(7);
    expect(s2).toMatchObject({ seq: 2, cards: { c_a: { x: 9, y: 9 } } });
  });

  it('folding all events equals applying them one by one', () => {
    const events = [
      added(0, card('c_a')),
      added(1, card('c_b', 3, 3)),
      moved(2, 'c_b', 4, 4),
      moved(3, 'c_a', 1, 2),
    ];
    let step = emptyBoard();
    for (const e of events) step = applyEvent(step, e);
    expect(fold(events)).toEqual(step);
  });

  it('adds frames in insertion order and keeps the untouched record identical', () => {
    const frame = (id: string, title: string): Frame => ({
      id,
      title,
      color: 'sky',
      x: 0,
      y: 0,
      w: 400,
      h: 300,
      provenance: { ...user, at: 1 },
    });
    const frameAdded = (seq: number, f: Frame): BoardEvent => ({
      v: 1,
      seq,
      ts: seq,
      type: 'frame.added',
      actor: user,
      data: { frame: f },
    });
    const s0 = fold([added(0, card('c_a'))]);
    const s1 = applyEvent(s0, frameAdded(1, frame('f_b', 'Market')));
    const s2 = applyEvent(s1, frameAdded(2, frame('f_a', 'Thesis')));
    expect(boardFrames(s2).map((f) => f.title)).toEqual(['Market', 'Thesis']);
    expect(s1.cards).toBe(s0.cards);
    expect(s0.frames).toEqual({});
    const s3 = applyEvent(s2, moved(3, 'c_a', 1, 1));
    expect(s3.frames).toBe(s2.frames);
    expect(() => parseBoardEvent({ ...frameAdded(0, frame('x_bad', 'T')) })).toThrow();
    expect(() =>
      parseBoardEvent({ ...frameAdded(0, { ...frame('f_a', 'T'), color: 'red' as never }) }),
    ).toThrow();
  });
});

describe('thread.message (P3.6)', () => {
  const orb = { kind: 'agent', agent: 'orb', model: 'm', sessionId: 's' } as const;
  const msg = (seq: number, of: string, text: string, actor: BoardEvent['actor'] = user): BoardEvent => ({
    v: 1,
    seq,
    ts: 1000 + seq,
    type: 'thread.message',
    actor,
    data: { id: `t_${seq}`, of, text },
  });

  it('folds messages per card or frame, oldest first, with author and time; a board without threads has none', () => {
    expect(fold([added(0, card('c_a'))])).not.toHaveProperty('threads');
    const state = fold([
      added(0, card('c_a')),
      msg(1, 'c_a', 'Is this right?'),
      msg(2, 'c_a', 'Mostly.', orb),
      msg(3, 'f_x', 'About the frame'),
    ]);
    expect(state.threads).toEqual({
      c_a: [
        { id: 't_1', of: 'c_a', text: 'Is this right?', by: 'user', at: 1001 },
        { id: 't_2', of: 'c_a', text: 'Mostly.', by: 'orb', at: 1002 },
      ],
      f_x: [{ id: 't_3', of: 'f_x', text: 'About the frame', by: 'user', at: 1003 }],
    });
    // A removed card keeps its thread (an undo brings the card back with it).
    const removed = applyEvent(state, {
      v: 1,
      seq: 4,
      ts: 5,
      type: 'card.removed',
      actor: user,
      data: { ids: ['c_a'] },
    });
    expect(removed.threads?.c_a).toHaveLength(2);
    // Untouched records keep their identity.
    expect(removed.threads).toBe(state.threads);
  });

  it('validates the payload', () => {
    expect(() =>
      parseBoardEvent({ ...msg(0, 'c_a', 'x'), data: { id: 'bad', of: 'c_a', text: 'x' } }),
    ).toThrow();
    expect(() => parseBoardEvent({ ...msg(0, 'l_a', 'x') })).toThrow();
    expect(() => parseBoardEvent({ ...msg(0, 'c_a', '') })).toThrow();
  });
});
