/** P2.5 card UI halves: kind labels and the reading queue's order. */
import { describe, expect, it } from 'vitest';
import type { Card } from '@orb/shared';
import { isPaper, kindLabel, queueOf, titleOf } from '../src/cards/labels.js';

const user = { kind: 'user' as const, at: 1 };
const agent = { kind: 'agent' as const, agent: 'scout' as const, model: 'm', sessionId: 's', at: 1 };
const card = (id: string, type: Card['type'], data: unknown, extra: Partial<Card> = {}): Card => ({
  id,
  type,
  frameId: null,
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  data,
  provenance: user,
  ...extra,
});
const pdf = { path: 'assets/01j-p.pdf', name: 'p.pdf', mime: 'application/pdf' as const, size: 9 };

describe('card registry', () => {
  it('labels cards by type, with page and row counts', () => {
    expect(kindLabel(card('c_1', 'note', { title: 'n' }))).toBe('your note');
    expect(kindLabel(card('c_2', 'note', { title: 'n' }, { provenance: agent }))).toBe('note');
    // P3.2: a stack card (a doc holding consolidated cards) says how many it holds.
    const items = [
      { id: 'c_a', type: 'source', title: 'a' },
      { id: 'c_b', type: 'quote', title: 'b' },
      { id: 'c_c', type: 'quote', title: 'c' },
    ];
    expect(
      kindLabel(card('c_3', 'doc', { title: 'S', body: 'b', stack: { count: 3, items } }, { provenance: agent })),
    ).toBe('stack · 3 cards');
    expect(kindLabel(card('c_4', 'doc', { title: 'D' }, { provenance: agent }))).toBe('doc');
    expect(kindLabel(card('c_3', 'file', { asset: pdf, title: 'p', pages: 12 }))).toBe('pdf · 12 pages');
    expect(kindLabel(card('c_4', 'file', { asset: pdf, title: 'p', pages: 1 }))).toBe('pdf · 1 page');
    expect(kindLabel(card('c_5', 'file', { asset: pdf, title: 'p', pages: null }))).toBe('pdf');
    expect(
      kindLabel(card('c_6', 'table', { title: 't', columns: ['a'], rows: [['1']], totalRows: 40 })),
    ).toBe('table · 40 rows');
    expect(kindLabel(card('c_7', 'design', {}))).toBe('design frame');
    expect(isPaper(card('c_1', 'note', {}))).toBe(true);
    expect(titleOf(card('c_8', 'source', { url: 'https://x.org' }))).toBe('https://x.org');
  });
});

describe('reading queue', () => {
  it('lists Must read cards first, then Skim, each in board order; stacked and unbadged cards are left out', () => {
    const cards = [
      card('c_a', 'note', { title: 'a' }, { badge: 'skim' }),
      card('c_b', 'note', { title: 'b' }, { badge: 'must', opened: true }),
      card('c_c', 'note', { title: 'c' }),
      card('c_d', 'note', { title: 'd' }, { badge: 'must' }),
      card('c_e', 'note', { title: 'e' }, { badge: 'skim', stackedInto: 'c_x' }),
    ];
    expect(queueOf(cards).map((c) => c.id)).toEqual(['c_b', 'c_d', 'c_a']);
  });
});
