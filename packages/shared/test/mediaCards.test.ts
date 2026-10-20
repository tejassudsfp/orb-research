/**
 * P6.6 entity, media and technical cards: their schemas, the checklist helpers, and the planner rule that an agent
 * never ticks a checklist item.
 */
import { describe, expect, it } from 'vitest';
import {
  BoardCommandError,
  CARD_TYPES,
  ChecklistData,
  CodeData,
  EntityData,
  MathData,
  ProductData,
  VideoData,
  applyChanges,
  cardKindLabel,
  cardText,
  checklistProgress,
  checklistTickViolation,
  emptyBoard,
  initialsOf,
  itemsFromTexts,
  nextItemId,
  planCommand,
  videoPlatformOf,
  type Actor,
  type BoardState,
  type Card,
} from '../src/index.js';

const user: Actor = { kind: 'user' };
const scout: Actor = { kind: 'agent', agent: 'scout', model: 'm', sessionId: 's' };
let n = 0;
const ctxOf = (actor: Actor) => ({ actor, now: 1, mintId: (p: string) => `${p}_t${++n}` });

const items = [
  { id: 'i1', text: 'Check the source', done: false },
  { id: 'i2', text: 'Call a customer', done: true },
];

function boardWith(data: unknown): BoardState {
  const changes = planCommand(
    emptyBoard(),
    { type: 'card.added', card: { type: 'checklist', frameId: null, x: 0, y: 0, w: 300, h: 220, data } } as never,
    ctxOf(user),
  );
  return applyChanges(emptyBoard(), changes.map((c, i) => ({ ...c, seq: i, actor: user, ts: 1 }) as never));
}

describe('schemas', () => {
  it('accept the shapes the cards hold and refuse bad links', () => {
    expect(EntityData.safeParse({ title: 'Ada', kind: 'person', facts: [{ label: 'Born', value: '1815' }] }).success).toBe(true);
    expect(EntityData.safeParse({ title: 'Ada', kind: 'robot' }).success).toBe(false);
    expect(EntityData.safeParse({ title: 'Ada', url: 'javascript:alert(1)' }).success).toBe(false);
    expect(ProductData.safeParse({ title: 'P', kind: 'competitor', strengths: ['a'] }).success).toBe(true);
    expect(VideoData.safeParse({ title: 'V', url: 'https://youtu.be/x' }).success).toBe(true);
    expect(VideoData.safeParse({ title: 'V', url: 'file:///etc/passwd' }).success).toBe(false);
    expect(CodeData.safeParse({ code: 'x'.repeat(20_001) }).success).toBe(false);
    expect(MathData.safeParse({ latex: 'x^2' }).success).toBe(true);
    expect(ChecklistData.safeParse({ items }).success).toBe(true);
    expect(ChecklistData.safeParse({ items: [{ id: 'bad id', text: 'x', done: false }] }).success).toBe(false);
  });

  it('are in the manifest with kind labels', () => {
    for (const t of ['entity', 'product', 'video', 'code', 'math', 'checklist'] as const) expect(CARD_TYPES[t]).toBeTruthy();
    expect(cardKindLabel({ type: 'entity', data: { kind: 'org' } })).toBe('org');
    expect(cardKindLabel({ type: 'product', data: { kind: 'competitor' } })).toBe('competitor');
    expect(cardKindLabel({ type: 'code', data: { language: 'sql' } })).toBe('code · sql');
    expect(cardKindLabel({ type: 'checklist', data: { items } })).toBe('checklist · 1/2');
  });

  it('are searchable by their own fields', () => {
    const c = (type: Card['type'], data: unknown) => cardText({ type, data } as Card).body;
    expect(c('code', { code: 'def needle(): pass' })).toContain('needle');
    expect(c('math', { latex: '\\frac{needle}{2}' })).toContain('needle');
    expect(c('checklist', { items: [{ id: 'i1', text: 'needle', done: false }] })).toContain('needle');
    expect(c('entity', { facts: [{ label: 'Born', value: 'needle' }], role: 'CTO' })).toContain('needle');
    expect(c('product', { strengths: ['needle'] })).toContain('needle');
  });
});

describe('helpers', () => {
  it('items keep ids and ticks for unchanged texts; new ones are open', () => {
    const next = itemsFromTexts(['Call a customer', 'New thing', 'Check the source'], items);
    expect(next.map((i) => [i.id, i.text, i.done])).toEqual([
      ['i2', 'Call a customer', true],
      ['i3', 'New thing', false],
      ['i1', 'Check the source', false],
    ]);
    expect(nextItemId(items)).toBe('i3');
    expect(checklistProgress({ items })).toEqual({ done: 1, total: 2 });
  });

  it('platform and initials', () => {
    expect(videoPlatformOf({ url: 'https://www.youtube.com/watch?v=1' })).toBe('youtube.com');
    expect(videoPlatformOf({ url: 'https://x.com/a', platform: 'X' })).toBe('X');
    expect(initialsOf('Ada Lovelace')).toBe('AL');
    expect(initialsOf('Acme')).toBe('AC');
    expect(initialsOf('')).toBe('?');
  });
});

describe('an agent never ticks', () => {
  it('the rule', () => {
    expect(checklistTickViolation({ items }, { items })).toBeUndefined();
    expect(checklistTickViolation({ items }, { items: [{ ...items[0]!, done: true }, items[1]!] })).toMatch(/cannot tick/);
    expect(checklistTickViolation({ items }, { items: [items[0]!, { ...items[1]!, done: false }] })).toMatch(/cannot tick/);
    expect(checklistTickViolation({ items }, { items: [items[0]!] })).toMatch(/cannot remove/);
    expect(checklistTickViolation({ items }, { items: [items[0]!, items[1]!, { id: 'i3', text: 'x', done: false }] })).toBeUndefined();
    expect(checklistTickViolation({ items }, { items: [items[0]!, items[1]!, { id: 'i3', text: 'x', done: true }] })).toMatch(/cannot tick/);
  });

  it('the planner: an agent card starts open; only the user ticks', () => {
    const add = (actor: Actor, data: unknown) => () =>
      planCommand(
        emptyBoard(),
        { type: 'card.added', card: { type: 'checklist', frameId: null, x: 0, y: 0, w: 300, h: 220, data } } as never,
        ctxOf(actor),
      );
    expect(add(scout, { items })).toThrow(BoardCommandError);
    expect(add(scout, { items: [items[0]!] })).not.toThrow();
    expect(add(user, { items })).not.toThrow();

    const state = boardWith({ title: 'T', items });
    const id = Object.keys(state.cards)[0]!;
    const update = (actor: Actor, next: unknown) => () =>
      planCommand(state, { type: 'card.updated', id, patch: { data: { title: 'T', items: next } } } as never, ctxOf(actor));
    // The user ticks and unticks freely, adds and removes.
    expect(update(user, [{ ...items[0]!, done: true }, items[1]!])).not.toThrow();
    expect(update(user, [items[0]!])).not.toThrow();
    // An agent may add items and reword, not flip.
    expect(update(scout, [...items, { id: 'i3', text: 'More', done: false }])).not.toThrow();
    expect(update(scout, [{ ...items[0]!, done: true }, items[1]!])).toThrow(/cannot tick/);
    expect(update(scout, [items[0]!, { ...items[1]!, done: false }])).toThrow(BoardCommandError);
  });
});
