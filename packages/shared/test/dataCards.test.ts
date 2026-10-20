/** P6.4 data cards (shared): what a chart plots, schemas, matrix totals, timeline order, summaries. */
import { describe, expect, it } from 'vitest';
import {
  CHART_LIMITS,
  ChartData,
  MatrixData,
  MetricData,
  TimelineData,
  chartPlot,
  chartPoints,
  chartSummary,
  dateLabel,
  matrixSummary,
  matrixTotals,
  metricSummary,
  numberOf,
  timelineOrdered,
  timelineSummary,
  type PlotTable,
} from '../src/index.js';

const sales: PlotTable = {
  columns: ['Region', 'Quarter', 'Revenue'],
  rows: [
    ['North', 'Q1', '$1,200'],
    ['South', 'Q1', '800'],
    ['North', 'Q2', 1500],
    ['South', 'Q2', 'n/a'],
    ['', 'Q2', 5],
  ],
};

describe('numberOf', () => {
  it('reads money, commas, percents and numbers; rejects words', () => {
    expect(numberOf('$1,200')).toBe(1200);
    expect(numberOf('12.5%')).toBe(12.5);
    expect(numberOf(' 3 400 ')).toBe(3400);
    expect(numberOf(7)).toBe(7);
    expect(numberOf('n/a')).toBeUndefined();
    expect(numberOf('')).toBeUndefined();
    expect(numberOf(null)).toBeUndefined();
    expect(numberOf('1e3')).toBe(1000);
  });
});

describe('chartPoints', () => {
  it('sums y by x, skips rows without an x or a number, keeps first-seen order for categories', () => {
    const r = chartPoints({ mark: 'bar', x: 'Region', y: 'Revenue' }, sales);
    expect(r.points).toEqual([{ x: 'North', y: 2700 }, { x: 'South', y: 800 }]);
    expect(r.xType).toBe('nominal');
  });

  it('colour splits into series; avg / count / min / max', () => {
    const r = chartPoints({ mark: 'bar', x: 'Quarter', y: 'Revenue', color: 'Region' }, sales);
    expect(r.points).toEqual([
      { x: 'Q1', y: 1200, c: 'North' },
      { x: 'Q1', y: 800, c: 'South' },
      { x: 'Q2', y: 1500, c: 'North' },
      { x: 'Q2', y: 5, c: '(none)' },
    ]);
    expect(chartPoints({ mark: 'bar', x: 'Region', y: 'Revenue', agg: 'avg' }, sales).points[0]!.y).toBe(1350);
    expect(chartPoints({ mark: 'bar', x: 'Region' }, sales).points).toEqual([{ x: 'North', y: 2 }, { x: 'South', y: 2 }]);
    expect(chartPoints({ mark: 'bar', x: 'Region', y: 'Revenue', agg: 'max' }, sales).points[0]!.y).toBe(1500);
    expect(chartPoints({ mark: 'bar', x: 'Region', y: 'Revenue', agg: 'min' }, sales).points[0]!.y).toBe(1200);
  });

  it('column names are case-insensitive; a missing column is a problem that lists the columns', () => {
    expect(chartPoints({ mark: 'bar', x: 'region', y: 'REVENUE' }, sales).points).toHaveLength(2);
    const bad = chartPoints({ mark: 'bar', x: 'Regoin', y: 'Revenue' }, sales);
    expect(bad.points).toEqual([]);
    expect(bad.problem).toBe('no column "Regoin"; the columns are "Region", "Quarter", "Revenue"');
    expect(chartPoints({ mark: 'bar', x: 'Region', y: 'Rev' }, sales).problem).toMatch(/no column "Rev"/);
    expect(chartPoints({ mark: 'bar', x: 'Region', y: 'Quarter' }, sales).problem).toMatch(/no rows with a value/);
  });

  it('years and dates are temporal and sorted; numbers on a line are quantitative; bar and pie stay nominal', () => {
    const t: PlotTable = { columns: ['Year', 'V'], rows: [['2025', 3], ['2023', 1], ['2024', 2]] };
    expect(chartPoints({ mark: 'line', x: 'Year', y: 'V' }, t)).toMatchObject({ xType: 'temporal', points: [{ x: '2023', y: 1 }, { x: '2024', y: 2 }, { x: '2025', y: 3 }] });
    expect(chartPoints({ mark: 'bar', x: 'Year', y: 'V' }, t).xType).toBe('nominal');
    const n: PlotTable = { columns: ['a', 'b'], rows: [['10', 1], ['2', 2]] };
    expect(chartPoints({ mark: 'line', x: 'a', y: 'b' }, n)).toMatchObject({ xType: 'quantitative', points: [{ x: 2, y: 2 }, { x: 10, y: 1 }] });
    const d: PlotTable = { columns: ['d', 'b'], rows: [['2026-03-01', 1], ['2026-01-15', 2]] };
    expect(chartPoints({ mark: 'area', x: 'd', y: 'b' }, d).points.map((p) => p.x)).toEqual(['2026-01-15', '2026-03-01']);
  });

  it('scatter plots the raw rows (no aggregation) and notes a cut', () => {
    const rows = Array.from({ length: CHART_LIMITS.points + 20 }, (_, i) => [String(i), i * 2]);
    const r = chartPoints({ mark: 'scatter', x: 'a', y: 'b' }, { columns: ['a', 'b'], rows });
    expect(r.points).toHaveLength(CHART_LIMITS.points);
    expect(r.note).toBe(`first ${CHART_LIMITS.points} of ${CHART_LIMITS.points + 20} rows`);
    expect(r.xType).toBe('quantitative');
  });

  it('folds a long tail of categories into Other, keeping the biggest', () => {
    const rows = Array.from({ length: 45 }, (_, i) => [`cat${i}`, 45 - i]);
    const r = chartPoints({ mark: 'pie', x: 'k', y: 'v' }, { columns: ['k', 'v'], rows });
    expect(r.points).toHaveLength(CHART_LIMITS.categories);
    expect(r.points.at(-1)).toMatchObject({ x: 'Other' });
    expect(r.points[0]).toMatchObject({ x: 'cat0', y: 45 });
    expect(r.points.reduce((a, p) => a + p.y, 0)).toBe((45 * 46) / 2);
    expect(r.note).toMatch(/top 29 of 45 categories/);
  });
});

describe('ChartData', () => {
  const base = { title: 'C', mark: 'bar', x: 'a', source: { kind: 'inline', columns: ['a', 'b'], rows: [['x', 1]] } };
  it('inline plots from its rows; bound uses the kept points', () => {
    const d = ChartData.parse({ ...base, y: 'b' });
    expect(chartPlot(d).points).toEqual([{ x: 'x', y: 1 }]);
    const bound = ChartData.parse({ title: 'C', mark: 'bar', x: 'a', source: { kind: 'dataset', datasetId: 'd_ABCDEFGH12' }, points: [{ x: 'q', y: 2 }] });
    expect(chartPlot(bound).points).toEqual([{ x: 'q', y: 2 }]);
  });
  it('is strict: no extra keys (no vega-lite spec, no url), rows match the columns', () => {
    expect(ChartData.safeParse({ ...base, spec: {} }).success).toBe(false);
    expect(ChartData.safeParse({ ...base, source: { kind: 'url', url: 'https://x.test/data.json' } }).success).toBe(false);
    expect(ChartData.safeParse({ ...base, source: { kind: 'inline', columns: ['a'], rows: [['x', 'y']] } }).success).toBe(false);
    expect(ChartData.safeParse({ ...base, mark: 'radar' }).success).toBe(false);
  });
  it('summary tells an agent what the chart shows', () => {
    const d = ChartData.parse({ ...base, y: 'b', source: { kind: 'inline', columns: ['a', 'b'], rows: [['x', 1], ['y', 3]] } });
    expect(chartSummary(d)).toBe('bar chart "C": b by a. x 1, y 3. Min 1, max 3, total 4.');
    const bad = ChartData.parse({ ...base, x: 'zz' });
    expect(chartSummary(bad)).toMatch(/Nothing to plot: no column "zz"/);
  });
});

describe('metric', () => {
  it('needs a figure; summary names value, change, period and source', () => {
    expect(MetricData.safeParse({ title: 'ARR' }).success).toBe(false);
    const d = MetricData.parse({ title: 'ARR', value: '$4.2M', change: { value: '+12%', direction: 'up' }, period: 'FY2025', source: { url: 'https://www.example.org/a' } });
    expect(metricSummary(d)).toBe('Metric "ARR": $4.2M, up +12% (FY2025). Source: example.org.');
    expect(MetricData.safeParse({ title: 'x', value: '1', source: {} }).success).toBe(false);
    expect(MetricData.safeParse({ title: 'x', value: '1', source: { url: 'javascript:alert(1)' } }).success).toBe(false);
  });
});

describe('timeline', () => {
  const ev = (date: string, label: string) => ({ date, label, source: { label: 'Blog' } });
  it('orders partial dates (a year before its months), stably; every event needs a source', () => {
    const d = TimelineData.parse({ title: 'T', events: [ev('2025-03', 'c'), ev('2024', 'a'), ev('2025', 'b'), ev('2025-03', 'd')] });
    expect(timelineOrdered(d.events).map((e) => e.label)).toEqual(['a', 'b', 'c', 'd']);
    expect(TimelineData.safeParse({ title: 'T', events: [{ date: '2024', label: 'x' }] }).success).toBe(false);
    expect(TimelineData.safeParse({ title: 'T', events: [{ date: '2024-13', label: 'x', source: { label: 'b' } }] }).success).toBe(false);
    expect(TimelineData.safeParse({ title: 'T', events: [] }).success).toBe(false);
    expect(timelineSummary(d)).toMatch(/4 events, 2024 to Mar 2025/);
  });
  it('dateLabel', () => {
    expect(dateLabel('2026')).toBe('2026');
    expect(dateLabel('2026-10')).toBe('Oct 2026');
    expect(dateLabel('2026-10-05')).toBe('5 Oct 2026');
  });
});

describe('matrix', () => {
  const m = MatrixData.parse({
    title: 'Vendors',
    criteria: [{ name: 'Cost', weight: 3 }, { name: 'Speed', weight: 1 }],
    options: [{ name: 'A', scores: [8, 5] }, { name: 'B', scores: [4, 9] }, { name: 'C', scores: [8, null] }],
  });
  it('keeps missing scores unknown and withholds a winner until the comparison is scored', () => {
    const t = matrixTotals(m);
    expect(t.totals).toEqual([7.25, 5.25, null]);
    expect(t.winners).toEqual([]);
    expect(t.tie).toBe(false);
    expect(matrixSummary(m)).toContain('C not scored');
    expect(matrixSummary(m)).toContain('Comparison incomplete');
    expect(matrixSummary(m)).not.toContain('Winner:');
    const complete = { ...m, options: m.options.slice(0, 2) };
    expect(matrixTotals(complete)).toMatchObject({ totals: [7.25, 5.25], winners: [0] });
  });
  it('distinguishes a real zero from an unentered rating', () => {
    const pending = { ...m, options: [{ name: 'Rated', scores: [0, 0] }, { name: 'Not entered', scores: [null, null] }] };
    expect(matrixTotals(pending)).toEqual({ totals: [0, null], winners: [], tie: false });
    expect(matrixSummary(pending)).toContain('Not entered not scored');
    const zeroTie = { ...pending, options: [{ name: 'A', scores: [0, 0] }, { name: 'B', scores: [0, 0] }] };
    expect(matrixTotals(zeroTie)).toEqual({ totals: [0, 0], winners: [0, 1], tie: true });
  });
  it('a tie highlights every top option', () => {
    const tie = MatrixData.parse({ ...m, options: [{ name: 'A', scores: [5, 5] }, { name: 'B', scores: [5, 5] }] });
    expect(matrixTotals(tie)).toMatchObject({ winners: [0, 1], tie: true });
    expect(matrixSummary(tie)).toMatch(/Tie: A, B/);
  });
  it('is strict: scores 0 to 10, one per criterion, 2 or more options', () => {
    expect(MatrixData.safeParse({ ...m, options: [{ name: 'A', scores: [11, 1] }, { name: 'B', scores: [1, 1] }] }).success).toBe(false);
    expect(MatrixData.safeParse({ ...m, options: [{ name: 'A', scores: [1] }, { name: 'B', scores: [1, 1] }] }).success).toBe(false);
    expect(MatrixData.safeParse({ ...m, options: [{ name: 'A', scores: [1, 1] }] }).success).toBe(false);
    expect(MatrixData.safeParse({ ...m, criteria: [{ name: 'x', weight: 0 }, { name: 'y', weight: 1 }] }).success).toBe(false);
  });
});
