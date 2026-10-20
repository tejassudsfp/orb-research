/** P4.4 print layout (Canvas PDF pages, poster) and the research document's standard outline. */
import { describe, expect, it } from 'vitest';
import type { BoardState, Card, CardType, Frame, Link } from '@orb/shared';
import {
  A4_LANDSCAPE,
  FOOTER_H,
  PAGE_MARGIN,
  POSTER_MAX,
  cardsInScope,
  cssString,
  footerText,
  snapshotSize,
  planCanvas,
  toPage,
} from '../src/print/plan.js';
import { docOutline } from '../src/print/outline.js';

const prov = { kind: 'user', at: 1 } as const;
const frame = (id: string, x: number, y: number, w = 600, h = 400, title = id): Frame => ({
  id,
  title,
  color: 'sky',
  x,
  y,
  w,
  h,
  provenance: prov,
});
const card = (
  id: string,
  type: CardType,
  frameId: string | null,
  x: number,
  y: number,
  data: unknown = {},
): Card => ({
  id,
  type,
  frameId,
  x,
  y,
  w: 200,
  h: 120,
  data,
  provenance: prov,
});
const link = (id: string, from: string, to: string): Link =>
  ({ id, from, to, type: 'supports', provenance: prov }) as Link;

function boardOf(frames: Frame[], cards: Card[], links: Link[] = []): BoardState {
  return {
    seq: 0,
    frames: Object.fromEntries(frames.map((f) => [f.id, f])),
    cards: Object.fromEntries(cards.map((c) => [c.id, c])),
    links: Object.fromEntries(links.map((l) => [l.id, l])),
  };
}

const board = boardOf(
  [frame('f_a', 0, 0, 600, 400, 'Thesis'), frame('f_b', 800, 0, 1200, 300, 'Market')],
  [
    card('c_1', 'note', 'f_a', 24, 60),
    card('c_2', 'source', 'f_a', 300, 60, { url: 'https://example.com/a', title: 'A study' }),
    card('c_3', 'table', 'f_b', 830, 60),
    card('c_4', 'question', 'f_b', 1100, 60, { title: 'Who pays?' }),
    card('c_5', 'quote', null, 0, 800, { body: 'Short', url: 'https://example.com/a' }),
    { ...card('c_6', 'note', 'f_a', 24, 200), stackedInto: 'c_7' },
    {
      ...card('c_7', 'doc', 'f_a', 300, 200, {
        title: 'Stack',
        stack: {
          count: 2,
          items: [
            { id: 'c_6', type: 'note', title: 'x' },
            { id: 'c_x', type: 'note', title: 'y' },
          ],
        },
      }),
    },
  ],
  [link('l_1', 'c_1', 'c_2'), link('l_2', 'c_6', 'c_2'), link('l_3', 'c_1', 'c_3')],
);

describe('planCanvas, one page per frame', () => {
  it('gives each frame in board order its own A4 landscape page, then the open board', () => {
    const plan = planCanvas(board, { layout: 'frames', scope: 'all' });
    expect(plan.size).toEqual(A4_LANDSCAPE);
    expect(plan.pages.map((p) => p.label)).toEqual(['01 Thesis', '02 Market', 'Open board']);
    expect(plan.pages[0]!.cards.map((c) => c.id)).toEqual(['c_1', 'c_2', 'c_7']); // the stacked c_6 is left out
    expect(plan.pages[2]!.cards.map((c) => c.id)).toEqual(['c_5']);
  });
  it('fits the frame inside the page above the footer, centred, never above 1.5x', () => {
    const plan = planCanvas(board, { layout: 'frames', scope: 'all' });
    for (const page of plan.pages) {
      const r = toPage(page, page.world);
      expect(r.x).toBeGreaterThanOrEqual(PAGE_MARGIN - 0.01);
      expect(r.y).toBeGreaterThanOrEqual(PAGE_MARGIN - 0.01);
      expect(r.x + r.w).toBeLessThanOrEqual(A4_LANDSCAPE.w - PAGE_MARGIN + 0.01);
      expect(r.y + r.h).toBeLessThanOrEqual(A4_LANDSCAPE.h - PAGE_MARGIN - FOOTER_H + 0.01);
      expect(page.scale).toBeLessThanOrEqual(1.5);
    }
    // A wide frame is scaled down to the page width.
    const market = plan.pages[1]!;
    expect(toPage(market, market.world).w).toBeCloseTo(A4_LANDSCAPE.w - 2 * PAGE_MARGIN, 3);
  });
  it('draws only links whose ends are on the page; a stacked end is drawn at its stack', () => {
    const plan = planCanvas(board, { layout: 'frames', scope: 'all' });
    expect(plan.pages[0]!.links.map((l) => [l.link.id, l.from, l.to])).toEqual([
      ['l_1', 'c_1', 'c_2'],
      ['l_2', 'c_7', 'c_2'],
    ]);
    expect(plan.pages[1]!.links).toEqual([]);
  });
  it('prints only the selected frames (no open board) and one empty page for an empty board', () => {
    const plan = planCanvas(board, { layout: 'frames', scope: ['f_b'] });
    expect(plan.pages.map((p) => p.label)).toEqual(['02 Market']);
    expect(planCanvas(boardOf([], []), { layout: 'frames', scope: 'all' }).pages).toHaveLength(1);
  });
});

describe('planCanvas, poster', () => {
  it('is one page with every frame and card, links across frames included', () => {
    const plan = planCanvas(board, { layout: 'poster', scope: 'all' });
    expect(plan.pages).toHaveLength(1);
    const page = plan.pages[0]!;
    expect(page.label).toBe('Whole board');
    expect(page.cards.map((c) => c.id).sort()).toEqual(['c_1', 'c_2', 'c_3', 'c_4', 'c_5', 'c_7']);
    expect(page.links.map((l) => l.link.id).sort()).toEqual(['l_1', 'l_2', 'l_3']);
    expect(page.scale).toBe(1);
    expect(plan.size.w).toBeGreaterThanOrEqual(A4_LANDSCAPE.w);
  });
  it('scales a huge board so its longest side fits POSTER_MAX', () => {
    const huge = boardOf([frame('f_a', 0, 0, 20_000, 1000)], [card('c_1', 'note', 'f_a', 10, 10)]);
    const plan = planCanvas(huge, { layout: 'poster', scope: 'all' });
    const page = plan.pages[0]!;
    expect(page.world.w * page.scale).toBeLessThanOrEqual(POSTER_MAX + 0.01);
    expect(plan.size.w).toBeLessThanOrEqual(POSTER_MAX + 2 * PAGE_MARGIN + 1);
  });
});

describe('docOutline (standard format)', () => {
  it('has a section per frame in board order, every card numbered, questions apart, sources numbered once per URL', () => {
    const outline = docOutline(board, 'Board', 'all');
    expect(outline.sections.map((s) => s.heading)).toEqual(['Thesis', 'Market', 'Open board']);
    expect(outline.sections[0]!.figures.map((f) => [f.card.id, f.label])).toEqual([
      ['c_1', 'Figure 1'],
      ['c_2', 'Figure 2'],
      ['c_7', 'Figure 3'],
    ]);
    expect(outline.sections[1]!.figures.map((f) => [f.card.id, f.label])).toEqual([['c_3', 'Table 1']]);
    expect(outline.openQuestions.map((f) => [f.card.id, f.label])).toEqual([['c_4', 'Figure 5']]);
    // The source and the quote share a URL: one entry, cited by both.
    expect(outline.sources).toEqual([
      { n: 1, title: 'A study', url: 'https://example.com/a', cardId: 'c_2' },
    ]);
    expect(outline.sections[0]!.figures[1]!.source).toBe(1);
    expect(outline.sections[2]!.figures[0]!.source).toBe(1);
    expect(outline.cards.map((c) => c.id)).toEqual(['c_1', 'c_2', 'c_7', 'c_3', 'c_5', 'c_4']);
    expect(outline.summary).toBe('From 6 cards in 2 frames of the board, with 1 source.');
  });
  it('keeps to the selected frames', () => {
    const outline = docOutline(board, 'Board', ['f_b']);
    expect(outline.sections.map((s) => s.heading)).toEqual(['Market']);
    expect(cardsInScope(board, ['f_b']).map((c) => c.id)).toEqual(['c_3', 'c_4']);
  });
});

describe('print helpers', () => {
  it('lays a design frame out at 640 px wide with its card aspect, capped', () => {
    expect(snapshotSize({ w: 340, h: 300 })).toEqual({ w: 640, h: Math.round((128 * 640) / 310) });
    expect(snapshotSize({ w: 150, h: 5000 }).h).toBe(1000);
  });
  it('writes footers and CSS strings', () => {
    expect(footerText('Board', '01 Thesis', '14 Oct 2026', 1, 3)).toBe(
      'Board · 01 Thesis · 14 Oct 2026 · 1 / 3',
    );
    expect(cssString('A "quoted" \\ title\nnext')).toBe('"A \\"quoted\\" \\\\ title next"');
  });
});
