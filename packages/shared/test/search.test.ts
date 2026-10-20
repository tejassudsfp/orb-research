/** P2.7 board search: matching (every word, case and diacritics folded), reading order, stacked cards left out. */
import { describe, expect, it } from 'vitest';
import {
  cardText,
  emptyBoard,
  foldText,
  searchBoard,
  searchWords,
  type BoardState,
  type Card,
} from '../src/index.js';

const card = (id: string, x: number, y: number, data: unknown, extra: Partial<Card> = {}): Card =>
  ({
    id,
    type: 'note',
    frameId: null,
    x,
    y,
    w: 280,
    h: 200,
    data,
    provenance: { kind: 'user', at: 1 },
    ...extra,
  }) as Card;

function boardOf(cards: Card[]): BoardState {
  const b = emptyBoard();
  for (const c of cards) b.cards[c.id] = c;
  return b;
}

describe('board search (P2.7)', () => {
  const board = boardOf([
    card('c_far', 3000, 1200, { title: 'Quantum notes', body: 'Superposition and entanglement' }),
    card('c_top', 900, 100, { title: 'Market', body: 'Quantum computing market is small' }),
    card('c_left', 100, 130, { title: 'Café crème', body: 'Naïve pricing' }),
    card('c_none', 400, 600, { title: 'Unrelated', body: 'Nothing here' }),
    card('c_note', 200, 900, { title: 'Plain', body: '' }, { note: 'Remember QUANTUM supremacy' }),
    card('c_why', 50, 2000, { title: 'Agent card', body: '' }, { why: 'Shows entanglement costs' }),
    card('c_stacked', 0, 0, { title: 'Quantum (stacked)', body: '' }, { stackedInto: 'c_stack' }),
  ]);

  it('matches every word in title, body, note and why, ignoring case; reading order top-to-bottom then left-to-right', () => {
    expect(searchBoard(board, 'quantum')).toEqual(['c_top', 'c_note', 'c_far']);
    expect(searchBoard(board, 'QUANTUM market')).toEqual(['c_top']);
    expect(searchBoard(board, 'entangle')).toEqual(['c_far', 'c_why']);
    expect(searchBoard(board, 'quantum zebra')).toEqual([]);
  });

  it('cards in the same 80 px row are ordered left to right', () => {
    const b = boardOf([
      card('c_b', 900, 120, { title: 'Row', body: '' }),
      card('c_a', 100, 150, { title: 'Row', body: '' }),
      card('c_c', 500, 400, { title: 'Row', body: '' }),
    ]);
    expect(searchBoard(b, 'row')).toEqual(['c_a', 'c_b', 'c_c']);
  });

  it('folds diacritics both ways', () => {
    expect(searchBoard(board, 'cafe creme')).toEqual(['c_left']);
    expect(searchBoard(board, 'naïve')).toEqual(['c_left']);
    expect(foldText('Ångström ÉCOLE')).toBe('angstrom ecole');
  });

  it('an empty or punctuation-only query finds nothing; punctuation is not an operator', () => {
    expect(searchBoard(board, '')).toEqual([]);
    expect(searchBoard(board, '  "*()  ')).toEqual([]);
    expect(searchBoard(board, '"quantum" AND (market)')).toEqual([]);
    expect(searchWords('"quantum" (market)')).toEqual(['quantum', 'market']);
  });

  it('searches table cells and file names (the same text the Home index uses)', () => {
    const b = boardOf([
      card(
        'c_t',
        0,
        0,
        { title: 'Prices', columns: ['ticker', 'price'], rows: [['ACME', '12.5']], totalRows: 1 },
        {
          type: 'table',
        } as Partial<Card>,
      ),
    ]);
    expect(cardText(b.cards.c_t!).body).toContain('ACME');
    expect(searchBoard(b, 'acme')).toEqual(['c_t']);
  });
});
