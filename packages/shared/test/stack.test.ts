/** P3.2 stacks in the shared fold: `card.stacked`, removing a stack with what it holds, and its undo. */
import { describe, expect, it } from 'vitest';
import {
  CardStackedData,
  DocData,
  applyChanges,
  emptyBoard,
  fold,
  invertChanges,
  parseBoardEvent,
  stackOf,
  withStacked,
  type BoardEvent,
  type Card,
} from '../src/index.js';

const agent = { kind: 'agent', agent: 'scout', model: 'm', sessionId: 's' } as const;
const card = (id: string, extra: Partial<Card> = {}): Card => ({
  id,
  type: 'source',
  frameId: null,
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  data: { title: id },
  why: 'w',
  provenance: { ...agent, at: 1 },
  ...extra,
});
const stackData = (ids: string[]) => ({
  title: 'S',
  body: 'sum',
  stack: { count: ids.length, items: ids.map((id) => ({ id, type: 'source', title: id })) },
});
const ev = (seq: number, type: BoardEvent['type'], data: unknown): BoardEvent =>
  parseBoardEvent({ v: 1, seq, ts: seq, type, actor: agent, data });

describe('stacks (P3.2)', () => {
  it('validates card.stacked and stack data', () => {
    expect(CardStackedData.safeParse({ stackId: 'c_s', ids: ['c_a'] }).success).toBe(true);
    expect(CardStackedData.safeParse({ stackId: 'c_s', ids: [] }).success).toBe(false);
    expect(CardStackedData.safeParse({ stackId: 'c_s', ids: ['c_s'] }).success).toBe(false);
    expect(() => ev(0, 'card.stacked', {})).toThrow();
    expect(DocData.safeParse(stackData(['c_a', 'c_b'])).success).toBe(true);
    expect(DocData.safeParse(stackData(['c_a'])).success).toBe(false);
    expect(stackOf({ type: 'doc', data: stackData(['c_a', 'c_b']) })?.count).toBe(2);
    expect(stackOf({ type: 'doc', data: { title: 'plain doc' } })).toBeUndefined();
    expect(stackOf({ type: 'source', data: stackData(['c_a', 'c_b']) })).toBeUndefined();
  });

  it('folds card.stacked, and removing a stack removes what it holds (nested too) and their links', () => {
    const events = [
      ev(0, 'card.added', { card: card('c_a') }),
      ev(1, 'card.added', { card: card('c_b') }),
      ev(2, 'card.added', { card: card('c_c') }),
      ev(3, 'card.added', { card: card('c_s', { type: 'doc', data: stackData(['c_a', 'c_b']) }) }),
      ev(4, 'card.stacked', { stackId: 'c_s', ids: ['c_a', 'c_b', 'c_missing'] }),
      ev(5, 'card.added', { card: card('c_t', { type: 'doc', data: stackData(['c_s', 'c_c']) }) }),
      ev(6, 'card.stacked', { stackId: 'c_t', ids: ['c_s', 'c_c'] }),
      ev(7, 'card.added', { card: card('c_d') }),
      ev(8, 'link.added', {
        link: { id: 'l_1', from: 'c_a', to: 'c_d', type: 'supports', provenance: { ...agent, at: 1 } },
      }),
    ];
    const state = fold(events);
    expect(state.cards.c_a!.stackedInto).toBe('c_s');
    expect(state.cards.c_s!.stackedInto).toBe('c_t');
    expect(state.cards.c_missing).toBeUndefined();
    expect([...withStacked(state.cards, ['c_t'])].sort()).toEqual(['c_a', 'c_b', 'c_c', 'c_s', 'c_t']);

    const removal = [{ type: 'card.removed' as const, data: { ids: ['c_t'] } }];
    const after = applyChanges(state, removal);
    expect(Object.keys(after.cards)).toEqual(['c_d']);
    expect(after.links).toEqual({});
    // Undo of the removal brings every card back, still stacked, in its place, with the link.
    const back = applyChanges(after, invertChanges(state, removal));
    expect(back.cards).toEqual(state.cards);
    expect(Object.keys(back.cards)).toEqual(Object.keys(state.cards));
    expect(back.links).toEqual(state.links);
  });

  it('an unknown stack id or card only advances seq', () => {
    const s = fold([ev(0, 'card.stacked', { stackId: 'c_s', ids: ['c_x'] })], emptyBoard());
    expect(s).toEqual({ ...emptyBoard(), seq: 0 });
  });
});
