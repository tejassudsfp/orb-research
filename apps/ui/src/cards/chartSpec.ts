/**
 * Chart cards (P6.4): the Vega-Lite spec of a chart. The spec is made here, from the card's small description and
 * its plotted points; nothing an agent wrote is ever a spec, so a chart cannot carry a URL, a data transform or an
 * expression. Pure and DOM-free (unit tests import it). `vegaRender.ts` compiles and draws it.
 *
 * - The points are always inline `values`. A temporal x axis is drawn ordinal in date order (the points are already
 *   sorted), which avoids local-time versus UTC label drift.
 * - Colours come from two palettes: `night` for the board and reader, `light` for print.
 */
import {
  appearancePalette,
  fontFamilies,
  labelColors,
  themes,
  type Appearance,
  type ChartData,
  type ChartPoint,
  type ChartXType,
} from '@orb/shared';

export type ChartTheme = 'night' | 'light';

export const PALETTES: Record<
  ChartTheme,
  { series: string[]; text: string; muted: string; grid: string; domain: string }
> = {
  night: {
    series: ['#60A5FA', '#F9FCFE', '#3D5DCF', '#A9C4F5', '#2563EB', '#8A99B8'],
    text: '#F9FCFE',
    muted: '#B8C2D6',
    grid: 'rgba(249,252,254,0.12)',
    domain: 'rgba(249,252,254,0.35)',
  },
  light: {
    series: ['#2563EB', '#11171D', '#3D5DCF', '#60A5FA', '#6B7BA8', '#9DB7F5'],
    text: '#11171D',
    muted: '#4A5568',
    grid: 'rgba(17,23,29,0.12)',
    domain: 'rgba(17,23,29,0.4)',
  },
};

/** The palette print draws charts in (set once by the print app before it renders, like the diagram theme). */
let printTheme: ChartTheme = 'light';
export const setPrintChartTheme = (t: ChartTheme): void => {
  printTheme = t;
};
export const getPrintChartTheme = (): ChartTheme => printTheme;

export type ChartDims = { w: number; h: number };

type Spec = Record<string, unknown>;

/** The plotted data of a chart as Vega-Lite needs it (the series column is always `c`). */
export type ChartInput = Pick<ChartData, 'mark' | 'x' | 'y' | 'color' | 'agg'> & {
  points: readonly ChartPoint[];
  xType: ChartXType;
};

/** The Vega-Lite (v6) spec for `chart` at `dims` in `theme`. */
export function chartSpec(
  chart: ChartInput,
  dims: ChartDims,
  theme: ChartTheme,
  workspace?: Appearance,
): Spec {
  const colors = workspace ? appearancePalette(workspace, theme === 'night' ? 'dark' : 'light') : undefined;
  const pal = colors
    ? {
        series: [
          colors.accent.accent,
          ...Object.values(labelColors(themes[workspace!.themeId], theme === 'night' ? 'dark' : 'light')),
        ],
        text: colors.palette.text,
        muted: colors.palette.muted,
        grid: colors.palette.line,
        domain: colors.palette.lineStrong,
      }
    : PALETTES[theme];
  const series = chart.color !== undefined && chart.points.some((p) => p.c !== undefined);
  const xName = chart.x;
  const yName = chart.y ? `${chart.agg && chart.agg !== 'sum' ? `${chart.agg} of ` : ''}${chart.y}` : 'count';
  const many = new Set(chart.points.map((p) => p.x)).size;
  const xAxisType =
    chart.xType === 'quantitative' ? 'quantitative' : chart.xType === 'temporal' ? 'ordinal' : 'nominal';
  const colorEnc = series
    ? {
        field: 'c',
        type: 'nominal',
        title: chart.color,
        scale: { range: pal.series },
        legend: { orient: 'bottom', symbolType: 'circle' },
      }
    : undefined;
  const xEnc: Spec = {
    field: 'x',
    type: xAxisType,
    title: xName,
    ...(xAxisType === 'quantitative' ? {} : { sort: null }),
    axis: {
      labelAngle: many > 6 && xAxisType !== 'quantitative' ? -35 : 0,
      labelLimit: 120,
      labelOverlap: 'parity',
    },
  };
  const yEnc: Spec = { field: 'y', type: 'quantitative', title: yName, axis: { tickCount: 5 } };

  let mark: unknown;
  let encoding: Spec;
  switch (chart.mark) {
    case 'pie':
      mark = {
        type: 'arc',
        innerRadius: 0,
        stroke: colors?.palette.bg ?? (theme === 'night' ? '#03050C' : '#F9FCFE'),
        strokeWidth: 1.5,
      };
      encoding = {
        theta: { field: 'y', type: 'quantitative', stack: true },
        color: {
          field: 'x',
          type: 'nominal',
          title: xName,
          sort: null,
          scale: { range: [...pal.series, ...pal.series.map((c) => c + 'B3')] },
          legend: { orient: 'right', symbolType: 'circle', labelLimit: 110 },
        },
      };
      break;
    case 'line':
      mark = { type: 'line', point: { filled: true, size: 36 }, strokeWidth: 2, color: pal.series[0] };
      encoding = { x: xEnc, y: yEnc, ...(colorEnc ? { color: colorEnc } : {}) };
      break;
    case 'area':
      mark = { type: 'area', line: { strokeWidth: 2 }, opacity: 0.45, color: pal.series[0] };
      encoding = { x: xEnc, y: yEnc, ...(colorEnc ? { color: colorEnc } : {}) };
      break;
    case 'scatter':
      mark = { type: 'point', filled: true, size: 60, opacity: 0.9, color: pal.series[0] };
      encoding = {
        x: { ...xEnc, ...(xAxisType === 'quantitative' ? { scale: { zero: false } } : {}) },
        y: { ...yEnc, scale: { zero: false } },
        ...(colorEnc ? { color: colorEnc } : {}),
      };
      break;
    default:
      mark = { type: 'bar', cornerRadiusEnd: 2, color: pal.series[0] };
      encoding = { x: xEnc, y: yEnc, ...(colorEnc ? { color: colorEnc } : {}) };
  }

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    width: dims.w,
    height: dims.h,
    padding: 6,
    autosize: { type: 'pad', contains: 'padding' },
    background: 'transparent',
    data: { values: chart.points.map((p) => ({ x: p.x, y: p.y, ...(p.c !== undefined ? { c: p.c } : {}) })) },
    mark,
    encoding,
    config: {
      font: workspace
        ? fontFamilies[themes[workspace.themeId].fonts.ui.family]
        : 'Geist, system-ui, sans-serif',
      view: { stroke: null },
      axis: {
        labelColor: pal.muted,
        titleColor: pal.muted,
        domainColor: pal.domain,
        tickColor: pal.domain,
        gridColor: pal.grid,
        labelFontSize: 11,
        titleFontSize: 11,
        titleFontWeight: 500,
      },
      legend: { labelColor: pal.muted, titleColor: pal.muted, labelFontSize: 11, titleFontSize: 11 },
    },
  };
}
