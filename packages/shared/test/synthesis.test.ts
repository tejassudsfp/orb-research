/** P6.5 synthesis cards (packages/shared/src/synthesis.ts): the schemas' rules, rubric totals, evidence from links. */
import { describe, expect, it } from 'vitest';
import {
  DecisionData,
  FRAMEWORK_CELLS,
  FrameworkData,
  HypothesisData,
  InsightData,
  cardKindLabel,
  confidenceLabel,
  decisionTotals,
  frameworkCells,
  hypothesisEvidence,
  synthesisRefs,
} from '../src/index.js';

describe('Insight', () => {
  it('needs at least two different cited cards', () => {
    expect(InsightData.safeParse({ title: 'T', citations: ['c_a'] }).success).toBe(false);
    expect(InsightData.safeParse({ title: 'T', citations: [] }).success).toBe(false);
    expect(InsightData.safeParse({ title: 'T' }).success).toBe(false);
    expect(InsightData.safeParse({ title: 'T', citations: ['c_a', 'c_a'] }).success).toBe(false);
    expect(InsightData.safeParse({ title: 'T', citations: ['c_a', 'c_b'] }).success).toBe(true);
    expect(InsightData.safeParse({ title: 'T', citations: ['c_a', 'not-a-card'] }).success).toBe(false);
    expect(cardKindLabel({ type: 'insight', data: { title: 'T', citations: ['c_a', 'c_b', 'c_c'] } })).toBe(
      'insight · 3 citations',
    );
  });
});

describe('Hypothesis', () => {
  it('has a confidence of 0 to 100', () => {
    expect(HypothesisData.safeParse({ title: 'H', confidence: 0 }).success).toBe(true);
    expect(HypothesisData.safeParse({ title: 'H', confidence: 100 }).success).toBe(true);
    expect(HypothesisData.safeParse({ title: 'H', confidence: 101 }).success).toBe(false);
    expect(HypothesisData.safeParse({ title: 'H', confidence: 50.5 }).success).toBe(false);
    expect(HypothesisData.safeParse({ title: 'H' }).success).toBe(false);
    expect([confidenceLabel(10), confidenceLabel(50), confidenceLabel(90)]).toEqual([
      'unlikely',
      'uncertain',
      'likely',
    ]);
  });

  it('counts the links into the card as for (supports) and against (contradicts)', () => {
    const card = { id: 'c_h', data: { title: 'H', confidence: 50, evidenceFor: ['c_a'], evidenceAgainst: ['c_b'] } };
    expect(hypothesisEvidence(card, [])).toEqual({ for: ['c_a'], against: ['c_b'] });
    const links = [
      { from: 'c_c', to: 'c_h', type: 'supports' },
      { from: 'c_d', to: 'c_h', type: 'contradicts' },
      { from: 'c_e', to: 'c_h', type: 'tension' },
      { from: 'c_h', to: 'c_f', type: 'supports' },
      { from: 'c_a', to: 'c_h', type: 'contradicts' },
      { from: 'c_c', to: 'c_h', type: 'supports' },
    ];
    expect(hypothesisEvidence(card, links)).toEqual({ for: ['c_a', 'c_c'], against: ['c_b', 'c_d'] });
    // Data that does not match the schema still reads (links only).
    expect(hypothesisEvidence({ id: 'c_h', data: 7 }, links)).toEqual({ for: ['c_c'], against: ['c_d', 'c_a'] });
  });
});

describe('Decision', () => {
  const base = { title: 'D', options: [{ label: 'A' }, { label: 'B' }] };

  it('checks choice, status and score shapes', () => {
    expect(DecisionData.safeParse(base).success).toBe(true);
    expect(DecisionData.safeParse({ ...base, options: [{ label: 'A' }] }).success).toBe(false);
    expect(DecisionData.safeParse({ ...base, options: [{ label: 'A' }, { label: 'A' }] }).success).toBe(false);
    expect(DecisionData.safeParse({ ...base, choice: 'C' }).success).toBe(false);
    expect(DecisionData.safeParse({ ...base, status: 'decided' }).success).toBe(false);
    expect(DecisionData.safeParse({ ...base, status: 'decided', choice: 'A' }).success).toBe(true);
    // Scores need criteria, one per criterion.
    expect(DecisionData.safeParse({ ...base, options: [{ label: 'A', scores: [1] }, { label: 'B' }] }).success).toBe(false);
    expect(
      DecisionData.safeParse({
        ...base,
        criteria: [{ name: 'x', weight: 1 }],
        options: [{ label: 'A', scores: [1, 2] }, { label: 'B' }],
      }).success,
    ).toBe(false);
    expect(
      DecisionData.safeParse({ ...base, criteria: [{ name: 'x', weight: 0 }] }).success,
    ).toBe(false);
  });

  it('computes weighted totals and ranks (ties share a rank)', () => {
    const d = DecisionData.parse({
      title: 'D',
      criteria: [
        { name: 'Price', weight: 2 },
        { name: 'Reach', weight: 1 },
      ],
      options: [
        { label: 'A', scores: [8, 6] },
        { label: 'B', scores: [6, 9] },
        { label: 'C', scores: [8, 6] },
      ],
    });
    expect(decisionTotals(d)).toEqual([
      { label: 'A', total: 7.33, rank: 1 },
      { label: 'B', total: 7, rank: 3 },
      { label: 'C', total: 7.33, rank: 1 },
    ]);
    expect(decisionTotals({ options: d.options })).toBeUndefined();
    expect(decisionTotals({ criteria: d.criteria, options: [{ label: 'A' }, { label: 'B' }] })).toBeUndefined();
    expect(cardKindLabel({ type: 'decision', data: d })).toBe('decision · open · rubric');
  });
});

describe('Framework', () => {
  it('only accepts the cells of its variant', () => {
    const swot = { title: 'S', variant: 'swot', cells: { strengths: ['a'], threats: ['b'] } };
    expect(FrameworkData.safeParse(swot).success).toBe(true);
    expect(FrameworkData.safeParse({ ...swot, variant: 'proscons' }).success).toBe(false);
    expect(FrameworkData.safeParse({ title: 'P', variant: 'proscons', cells: { pros: ['a'], cons: [] } }).success).toBe(true);
    expect(FrameworkData.safeParse({ title: 'P', variant: 'matrix', cells: {} }).success).toBe(false);
    expect(FrameworkData.safeParse({ title: 'P', variant: 'proscons', cells: { pros: Array(9).fill('x') } }).success).toBe(false);
  });

  it('lists the cells in reading order and names the quadrants by the axes', () => {
    const q = FrameworkData.parse({
      title: 'Q',
      variant: 'quadrant',
      xAxis: 'Effort',
      yAxis: 'Impact',
      cells: { topLeft: ['quick win'] },
    });
    const cells = frameworkCells(q);
    expect(cells.map((c) => c.key)).toEqual(FRAMEWORK_CELLS.quadrant.map((c) => c.key));
    expect(cells[0]).toEqual({ key: 'topLeft', label: 'High Impact, low Effort', items: ['quick win'] });
    expect(cells[3]!.label).toBe('Low Impact, high Effort');
  });
});

describe('synthesisRefs', () => {
  it('names the cards a card points at', () => {
    expect(synthesisRefs('insight', { citations: ['c_a', 'c_b'] })).toEqual(['c_a', 'c_b']);
    expect(synthesisRefs('hypothesis', { evidenceFor: ['c_a'], evidenceAgainst: ['c_b'] })).toEqual(['c_a', 'c_b']);
    expect(synthesisRefs('decision', { citations: ['c_a'] })).toEqual([]);
    expect(synthesisRefs('insight', null)).toEqual([]);
  });
});
