/**
 * P6.4 chart rendering: the Vega-Lite spec of a chart, drawn to SVG by the real vega + vega-lite + vega-interpreter
 * with `Function` and `eval` poisoned, which is what the app CSP (no 'unsafe-eval') does. The Electron e2e proves the
 * same under the real CSP (apps/desktop/e2e/datacards.spec.ts).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chartPoints, type ChartData } from '@orb/shared';
import { PALETTES, chartSpec, type ChartInput } from '../src/cards/chartSpec.js';
import { renderChart } from '../src/cards/vegaRender.js';

const table = {
  columns: ['Company', 'ARR', 'Stage'],
  rows: [['Acme', 1.2, 'Seed'], ['Globex', 4.5, 'A'], ['Initech', 0.8, 'Seed']],
};
const input = (over: Partial<ChartData> = {}): ChartInput => {
  const spec = { mark: 'bar' as const, x: 'Company', y: 'ARR', ...over };
  const plot = chartPoints(spec, table);
  return { ...spec, points: plot.points, xType: plot.xType };
};
const dims = { w: 420, h: 240 };

describe('chartSpec', () => {
  it('is Vega-Lite with inline values only: no url, no transform, no expression', () => {
    const spec = chartSpec(input(), dims, 'night') as { data: Record<string, unknown>; mark: unknown };
    expect(Object.keys(spec.data)).toEqual(['values']);
    const text = JSON.stringify(spec);
    expect(text).not.toMatch(/"url"|"transform"|"expr"|"signal"|"calculate"|"filter"/);
  });

  it.each(['bar', 'line', 'area', 'scatter', 'pie'] as const)('%s: a spec for each mark', (mark) => {
    const spec = chartSpec(input({ mark }), dims, 'light') as { mark: { type: string } | string; encoding: Record<string, unknown> };
    const type = typeof spec.mark === 'string' ? spec.mark : spec.mark.type;
    expect(type).toBe({ bar: 'bar', line: 'line', area: 'area', scatter: 'point', pie: 'arc' }[mark]);
    expect(mark === 'pie' ? 'theta' : 'x').toSatisfy((k: string) => k in spec.encoding);
  });

  it('series colour uses the palette; a temporal x is drawn ordinal in the given order', () => {
    const c = { ...input({ color: 'Stage' }), points: [{ x: '2024', y: 1, c: 'a' }, { x: '2025', y: 2, c: 'b' }], xType: 'temporal' as const };
    const spec = chartSpec({ ...c, mark: 'line' }, dims, 'night') as { encoding: { x: { type: string; sort: null }; color: { scale: { range: string[] } } } };
    expect(spec.encoding.x).toMatchObject({ type: 'ordinal', sort: null });
    expect(spec.encoding.color.scale.range).toEqual(PALETTES.night.series);
  });
});

describe('renderChart under a no-eval CSP', () => {
  const realFunction = globalThis.Function;
  beforeEach(async () => {
    // Load everything first (module init may legitimately probe), then forbid code generation.
    await renderChart(chartSpec(input(), { w: 100, h: 60 }, 'night'));
    globalThis.Function = function () {
      throw new EvalError('Refused to evaluate a string as JavaScript because unsafe-eval is not allowed');
    } as unknown as FunctionConstructor;
  });
  afterEach(() => {
    globalThis.Function = realFunction;
  });

  it.each(['bar', 'line', 'area', 'scatter', 'pie'] as const)('%s draws an SVG with its numbers as text', async (mark) => {
    const r = await renderChart(chartSpec(input({ mark }), dims, 'night'));
    expect('error' in r ? r.error : '').toBe('');
    const { svg } = r as { svg: string };
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox');
    // Vector: text stays text, marks are paths.
    expect(svg).toContain('<path');
    if (mark !== 'pie') expect(svg).toMatch(/>Globex</);
    else expect(svg).toMatch(/>Globex</);
  });

  it('escapes hostile labels (no markup from data reaches the DOM)', async () => {
    const nasty = '"><script>alert(1)</script><img src=x onerror=alert(1)>';
    const spec = chartSpec(
      { mark: 'bar', x: nasty, y: 'ARR', points: [{ x: nasty, y: 1 }], xType: 'nominal' },
      dims,
      'night',
    );
    const r = await renderChart(spec);
    const { svg } = r as { svg: string };
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('<img');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('the same spec is cached; a spec that cannot compile is an error value, not a throw', async () => {
    const spec = chartSpec(input(), dims, 'night');
    expect(await renderChart(spec)).toBe(await renderChart(spec));
    const bad = await renderChart({ mark: 'nonsense', encoding: 5 });
    expect(bad).toHaveProperty('error');
  });
});

describe('chartDraftOf ("Chart this")', () => {
  it('a database: a date on x gives a line of the first number; categories give a bar; no number counts rows', async () => {
    const { chartDraftOf } = await import('../src/cards/chartFrom.js');
    const { databaseDataOf, datasetFromRows } = await import('@orb/shared');
    const ds = datasetFromRows('d_TESTDATASET1', 'Pipeline', ['Company', 'Stage', 'ARR', 'Founded'], [
      ['Acme', 'Seed', '1.2', '2020-03-01'],
      ['Globex', 'Series A', '4.5', '2018-07-15'],
    ]).dataset;
    const card = { type: 'database', data: databaseDataOf('Pipeline', ds) } as never;
    expect(chartDraftOf(card)).toMatchObject({ mark: 'line', x: 'Founded', y: 'ARR', source: { kind: 'dataset', datasetId: 'd_TESTDATASET1' }, points: [] });
    const cats = datasetFromRows('d_TESTDATASET2', 'T', ['Name', 'Score'], [['a', '1'], ['b', '2']]).dataset;
    expect(chartDraftOf({ type: 'database', data: databaseDataOf('T', cats) } as never)).toMatchObject({ mark: 'bar', x: 'Name', y: 'Score' });
    const none = datasetFromRows('d_TESTDATASET3', 'N', ['Name', 'Note'], [['a', 'x'], ['b', 'y']]).dataset;
    const draft = chartDraftOf({ type: 'database', data: databaseDataOf('N', none) } as never)!;
    expect(draft).toMatchObject({ mark: 'bar', x: 'Name' });
    expect(draft.y).toBeUndefined();
  });

  it('a table: the numeric column is y, years are categories, the source is the card', async () => {
    const { chartDraftOf } = await import('../src/cards/chartFrom.js');
    const data = { title: 'Prices', columns: ['Year', 'Plan', 'Price'], rows: [['2024', 'Pro', '20'], ['2025', 'Team', '$50']], totalRows: 2 };
    expect(chartDraftOf({ id: 'c_t1', type: 'table', data } as never)).toMatchObject({
      mark: 'bar', x: 'Year', y: 'Price', source: { kind: 'table', cardId: 'c_t1' },
    });
    expect(chartDraftOf({ type: 'note', data: {} } as never)).toBeUndefined();
  });
});
