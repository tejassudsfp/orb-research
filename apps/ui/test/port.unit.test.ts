/**
 * P4.5: the composed research document laid out for the reading view and the print (`composedOutline`), the
 * unread Must read warning, and how a compose turn shows in the conversation panel.
 */
import { describe, expect, it } from 'vitest';
import {
  PORT_COMPOSE_PREFIX,
  unreadMustRead,
  type BoardState,
  type Card,
  type CardType,
  type Frame,
  type PortDoc,
} from '@orb/shared';
import { composedOutline } from '../src/print/outline.js';
import { shownUserText } from '../src/screens/Canvas/conversation.js';

const prov = { kind: 'user', at: 1 } as const;
const frame = (id: string, title: string): Frame => ({
  id,
  title,
  color: 'sky',
  x: 0,
  y: 0,
  w: 600,
  h: 400,
  provenance: prov,
});
const card = (
  id: string,
  type: CardType,
  frameId: string | null,
  data: unknown,
  extra: Partial<Card> = {},
): Card => ({
  id,
  type,
  frameId,
  x: 0,
  y: 0,
  w: 200,
  h: 120,
  data,
  provenance: prov,
  ...extra,
});

const board: BoardState = {
  seq: 0,
  frames: { f_a: frame('f_a', 'Market'), f_b: frame('f_b', 'Risks') },
  cards: {
    c_src: card(
      'c_src',
      'source',
      'f_a',
      { title: 'Study', url: 'https://example.com/s', summary: 'S' },
      { badge: 'must' },
    ),
    c_tab: card('c_tab', 'table', 'f_a', { title: 'Prices', columns: ['a'], rows: [['1']] }),
    c_note: card('c_note', 'note', 'f_a', { text: 'Incumbents' }, { badge: 'must', opened: true }),
    c_risk: card('c_risk', 'risk', 'f_b', { title: 'Rules', body: 'b' }, { badge: 'must' }),
    c_loose: card('c_loose', 'note', null, { text: 'Loose' }),
  },
  links: {},
};

const doc: PortDoc = {
  v: 1,
  version: 3,
  title: 'Board',
  scope: ['f_a'],
  instructions: '',
  composedAt: 1,
  updatedAt: 2,
  sections: [
    {
      id: 'summary',
      heading: 'Summary',
      composedAt: 1,
      figures: [],
      paragraphs: [
        { id: 'p_1', text: 'Growth.', cardIds: ['c_note', 'c_src'] },
        { id: 'p_2', text: 'Mine.', cardIds: [], userAuthored: true },
      ],
    },
    {
      id: 'market',
      heading: 'Market',
      composedAt: 1,
      figures: [
        { cardId: 'c_tab', caption: 'Prices by plan' },
        { cardId: 'c_gone', caption: 'A removed card' },
      ],
      paragraphs: [{ id: 'p_3', text: 'Prices.', cardIds: ['c_src', 'c_gone'], edited: true }],
    },
  ],
};

describe('composedOutline', () => {
  const o = composedOutline(doc, board);

  it('numbers citations by first use and links them to their cards and frames', () => {
    expect(o.sections[0]!.paragraphs[0]!.cites).toEqual([
      { n: 1, cardId: 'c_note', title: 'Incumbents', frame: 'Market' },
      { n: 2, cardId: 'c_src', title: 'Study', frame: 'Market' },
    ]);
    expect(o.sections[0]!.paragraphs[1]).toMatchObject({ cites: [], userAuthored: true });
    expect(o.sections[1]!.paragraphs[0]).toMatchObject({ edited: true });
    expect(o.sections[1]!.paragraphs[0]!.cites.map((c) => [c.n, c.missing ?? false])).toEqual([
      [2, false],
      [3, true],
    ]);
    expect(o.references).toEqual([
      { n: 1, cardId: 'c_note', title: 'Incumbents' },
      { n: 2, cardId: 'c_src', title: 'Study', url: 'https://example.com/s' },
      { n: 3, cardId: 'c_gone', title: 'A card no longer on the board', missing: true },
    ]);
  });

  it("places Orb's figures in their section, then every other card of the scope in the appendix", () => {
    expect(o.sections[1]!.figures.map((f) => [f.card.id, f.label, f.caption])).toEqual([
      ['c_tab', 'Table 1', 'Prices by plan'],
    ]);
    // The scope is frame f_a: its remaining cards, numbered on; f_b and the open board are out.
    expect(o.appendix.map((f) => [f.card.id, f.label, f.source])).toEqual([
      ['c_src', 'Figure 1', 2],
      ['c_note', 'Figure 2', 1],
    ]);
    expect(o.frames).toEqual([{ id: 'f_a', title: 'Market', color: 'sky', cards: 3 }]);
    expect(o.cards.map((c) => c.id)).toEqual(['c_tab', 'c_src', 'c_note']);
  });
});

describe('unread Must read cards', () => {
  it('lists unopened Must read cards in the scope only', () => {
    expect(unreadMustRead(board, ['f_a']).map((c) => c.id)).toEqual(['c_src']);
    expect(unreadMustRead(board, 'all').map((c) => c.id)).toEqual(['c_src', 'c_risk']);
    expect(unreadMustRead(board, ['f_b'])).toEqual([{ id: 'c_risk', title: 'Rules', frameId: 'f_b' }]);
  });
});

describe('the conversation panel', () => {
  it('shows a compose turn as its first line', () => {
    expect(shownUserText(`${PORT_COMPOSE_PREFIX}\nThe user wants…\nCards in scope (3):`)).toBe(
      'Compose the research document.',
    );
  });
});
