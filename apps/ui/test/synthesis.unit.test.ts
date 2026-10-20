/**
 * P6.5 synthesis cards: the UI halves draw what the data says (citations by title, the for/against balance from data
 * and links, the rubric's weighted totals, each framework variant's cells). Static markup; the window covers the rest
 * (apps/desktop/e2e/synthesis.spec.ts).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Card, Link } from '@orb/shared';
import { BoardRefsContext } from '../src/cards/context.js';
import { CARD_UI } from '../src/cards/types/index.js';
import { PrintCard } from '../src/print/PrintCard.js';

const prov = { kind: 'user', at: 1 } as const;
const card = (id: string, type: Card['type'], data: unknown, h = 300): Card =>
  ({ id, type, frameId: null, x: 0, y: 0, w: 340, h, data, provenance: prov }) as Card;

const quoteA = card('c_a', 'quote', { title: 'Source A', body: 'x' });
const quoteB = card('c_b', 'quote', { title: 'Source B', body: 'y' });
const quoteC = card('c_c', 'quote', { title: 'Source C', body: 'z' });
const link = (from: string, to: string, type: Link['type']): Link =>
  ({ id: `l_${from}${to}`, from, to, type, provenance: { ...prov } }) as Link;

const refs = (cards: Card[], links: Link[] = []) => ({
  cards: Object.fromEntries(cards.map((c) => [c.id, c])),
  links: Object.fromEntries(links.map((l) => [l.id, l])),
});
const render = (c: Card, part: 'Body' | 'Reader', r = refs([quoteA, quoteB, quoteC]), lod: 'full' | 'compact' = 'full') =>
  renderToStaticMarkup(
    createElement(BoardRefsContext.Provider, { value: r }, createElement(CARD_UI[c.type][part] as never, { card: c, lod })),
  );

describe('insight', () => {
  const insight = card('c_i', 'insight', { title: 'So what', body: 'Both agree.', citations: ['c_a', 'c_b'] });

  it('shows its citations by title on the board and as buttons in the reader', () => {
    const board = render(insight, 'Body');
    expect(board).toContain('2 citations');
    expect(board).toContain('Source A');
    expect(board).toContain('Source B');
    expect(render(insight, 'Body', undefined, 'compact')).not.toContain('Source A');
    const reader = render(insight, 'Reader');
    expect(reader.match(/data-testid="synthesis-ref"/g)).toHaveLength(2);
  });

  it('says so when a cited card is gone', () => {
    expect(render(insight, 'Body', refs([quoteA]))).toContain('card removed');
  });

  it('falls back to its text when the data is not an insight (fewer than two citations)', () => {
    const bad = card('c_i', 'insight', { title: 'Only one', body: 'Text stays.', citations: ['c_a'] });
    expect(render(bad, 'Body')).toContain('Text stays.');
    expect(render(bad, 'Body')).not.toContain('card-insight');
  });
});

describe('hypothesis', () => {
  const hyp = card('c_h', 'hypothesis', { title: 'Teams pay', confidence: 72, evidenceFor: ['c_a'] });

  it('shows the confidence and the balance, which links into the card update', () => {
    const none = render(hyp, 'Body');
    expect(none).toContain('72%');
    expect(none).toContain('likely');
    expect(none).toContain('1 for');
    expect(none).toContain('0 against');
    const linked = render(hyp, 'Body', refs([quoteA, quoteB, quoteC, hyp], [link('c_b', 'c_h', 'contradicts'), link('c_c', 'c_h', 'supports')]));
    expect(linked).toContain('2 for');
    expect(linked).toContain('1 against');
    const reader = render(hyp, 'Reader', refs([quoteA, quoteB, hyp], [link('c_b', 'c_h', 'contradicts')]));
    expect(reader).toContain('Source B');
    expect(reader.match(/data-testid="synthesis-ref"/g)).toHaveLength(2);
  });

  it('keeps the confidence readable at title LOD', () => {
    const extra = renderToStaticMarkup(createElement(CARD_UI.hypothesis.TitleExtra!, { card: hyp }));
    expect(extra).toContain('72%');
  });
});

describe('decision', () => {
  const rubric = card('c_d', 'decision', {
    title: 'Which plan',
    status: 'decided',
    choice: 'Pro',
    rationale: 'Cheapest.',
    criteria: [
      { name: 'Price', weight: 2 },
      { name: 'Reach', weight: 1 },
    ],
    options: [
      { label: 'Pro', scores: [8, 6] },
      { label: 'Team', scores: [6, 9] },
    ],
  });

  it('shows the status, the choice and ranked totals', () => {
    const board = render(rubric, 'Body');
    expect(board).toContain('decided');
    expect(board).toContain('Pro');
    expect(board).toContain('7.3');
    const reader = render(rubric, 'Reader');
    expect(reader).toContain('data-testid="decision-rubric"');
    expect(reader).toContain('7.33 (#1)');
    expect(reader).toContain('7.00 (#2)');
    expect(reader).toContain('Cheapest.');
    const printed = renderToStaticMarkup(createElement(PrintCard, { card: rubric, mode: 'figure' }));
    expect(printed).toContain('7.33 (#1)');
  });

  it('lists plain options when there is no rubric', () => {
    const plain = card('c_d', 'decision', { title: 'D', options: [{ label: 'A', note: 'first' }, { label: 'B' }] });
    expect(render(plain, 'Reader')).not.toContain('decision-rubric');
    expect(render(plain, 'Reader')).toContain('A');
    expect(render(plain, 'Body')).toContain('open');
  });
});

describe('framework', () => {
  it.each([
    ['proscons', { pros: ['Cheap'], cons: ['Slow'] }, ['Pros', 'Cons']],
    ['swot', { strengths: ['S1'], threats: ['T1'] }, ['Strengths', 'Weaknesses', 'Opportunities', 'Threats']],
    ['quadrant', { topRight: ['Do first'] }, ['High y, high x', 'Low y, low x']],
  ] as const)('%s draws every cell of its variant', (variant, cells, labels) => {
    const c = card('c_f', 'framework', { title: 'F', variant, cells });
    const html = render(c, 'Body');
    for (const label of labels) expect(html).toContain(label);
    for (const item of Object.values(cells).flat()) expect(html).toContain(item);
    expect(render(c, 'Body', undefined, 'compact')).not.toContain(Object.values(cells).flat()[0]!);
  });

  it('names the quadrant by its axes', () => {
    const c = card('c_f', 'framework', { title: 'F', variant: 'quadrant', xAxis: 'Effort', yAxis: 'Impact', cells: {} });
    expect(render(c, 'Reader')).toContain('High Impact, low Effort');
  });
});
