/** Chart cards (P6.4): the Vega-Lite SVG of a chart's points on the board, in the reader and in print. */
import { useEffect, useState } from 'react';
import { chartPlot, chartSummary, type Appearance, type ChartData } from '@orb/shared';
import { chartSpec, type ChartDims, type ChartTheme } from './chartSpec.js';
import { cachedChart, renderChart, type ChartRender } from './vegaRender.js';
import c from './cards.module.css';
import { useAppearance, useWorkspaceAppearance } from '../theme/appearance.js';

/** The spec of `d` at `dims`, or undefined when there is nothing to plot. */
function specOf(
  d: ChartData,
  dims: ChartDims,
  theme: ChartTheme,
  workspace?: Appearance,
): object | undefined {
  const plot = chartPlot(d);
  if (plot.points.length === 0) return undefined;
  return chartSpec({ ...d, points: plot.points, xType: plot.xType }, dims, theme, workspace);
}

function useChartRender(spec: object | undefined): ChartRender | undefined {
  const key = spec ? JSON.stringify(spec) : '';
  const [state, setState] = useState<{ key: string; render?: ChartRender }>(() => ({
    key,
    ...(spec ? { render: cachedChart(spec) } : {}),
  }));
  useEffect(() => {
    if (!spec) return;
    let live = true;
    void renderChart(spec).then((render) => {
      if (live) setState({ key, render });
    });
    return () => {
      live = false;
    };
    // `key` is the spec's identity.
  }, [key]);
  if (!spec) return undefined;
  return state.key === key ? state.render : cachedChart(spec);
}

/** The chart: the SVG, or why there is none (no data, a column that is missing, a drawing error). */
export function ChartView({
  data,
  dims,
  theme: suppliedTheme,
  testid,
  big = false,
}: {
  data: ChartData;
  dims: ChartDims;
  theme?: ChartTheme;
  testid: string;
  big?: boolean;
}) {
  const appearance = useAppearance();
  const workspace = useWorkspaceAppearance();
  const theme = suppliedTheme ?? (appearance === 'day' ? 'light' : 'night');
  const plot = chartPlot(data);
  const spec = specOf(data, dims, theme, workspace);
  const render = useChartRender(spec);
  const cls = [c.chart, theme === 'light' ? c.chartLight : '', big ? c.chartBig : '']
    .filter(Boolean)
    .join(' ');
  if (!spec)
    return (
      <div className={c.chartEmpty} data-testid={testid} data-state="empty" role="note">
        {plot.problem ?? 'No data to plot yet.'}
      </div>
    );
  if (!render)
    return (
      <div
        className={cls}
        data-testid={testid}
        data-state="loading"
        style={{ aspectRatio: `${dims.w} / ${dims.h}` }}
      >
        <span className={c.designEmpty}>Drawing the chart…</span>
      </div>
    );
  if ('error' in render)
    return (
      <div className={c.diagramError} data-testid={testid} data-state="error" role="note">
        Chart error: {render.error}
      </div>
    );
  return (
    <div
      className={cls}
      data-testid={testid}
      data-state="ready"
      data-chart-theme={theme}
      role="img"
      aria-label={chartSummary(data)}
      // Vega's own SVG of our spec (text is escaped by Vega's serializer; the app CSP runs no inline script).
      dangerouslySetInnerHTML={{ __html: render.svg }}
    />
  );
}
