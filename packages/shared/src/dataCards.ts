/**
 * Data cards (P6.4): Chart, Metric, Timeline and Comparison matrix. Pure and harness-free: the data schemas, and the
 * functions every half shares (the points a chart plots, a matrix's weighted totals, a plain-text summary agents read).
 *
 * A Chart never holds Vega-Lite. It holds a small spec (mark, x, y, colour, aggregate) and a source: rows inline, a
 * Dataset (P6.3), or a Table card. The card's `points` are the data the chart plots, worked out here from the source;
 * the canvas service keeps them current when a bound dataset or table changes (so `describe()`, print and the deck
 * export need no fetch), and the renderer turns them into a Vega-Lite spec of its own making. An agent cannot put a
 * URL, a transform or an expression into a chart.
 */
import { z } from 'zod';
import { DatasetId, cellText, type Cell, type Dataset } from './dataset.js';

const CardRef = z.string().regex(/^c_[A-Za-z0-9]{1,64}$/);
const HttpUrl = z
  .string()
  .max(4096)
  .refine((u) => /^https?:\/\//i.test(u), { message: 'must be an http(s) URL' });

// ---- Shared: a card's source reference ----

/** Where a figure or an event comes from: a link, a card on the board, or a plain label. At least one. */
export const SourceRef = z
  .strictObject({
    label: z.string().trim().max(200).optional(),
    url: HttpUrl.optional(),
    cardId: CardRef.optional(),
  })
  .refine((s) => Boolean(s.label?.trim() || s.url || s.cardId), { message: 'a source needs a label, a url or a cardId' });
export type SourceRef = z.infer<typeof SourceRef>;

/** "source.com" or the label, for a one-line citation. */
export function sourceText(s: SourceRef | undefined): string {
  if (!s) return '';
  if (s.label?.trim()) return s.label.trim();
  if (s.url) {
    try {
      return new URL(s.url).host.replace(/^www\./, '');
    } catch {
      return s.url;
    }
  }
  return s.cardId ? `card ${s.cardId}` : '';
}

// ---- Chart ----

export const CHART_MARKS = ['bar', 'line', 'area', 'scatter', 'pie'] as const;
export const ChartMark = z.enum(CHART_MARKS);
export type ChartMark = z.infer<typeof ChartMark>;
export const CHART_AGGS = ['sum', 'avg', 'count', 'min', 'max'] as const;
export const ChartAgg = z.enum(CHART_AGGS);
export type ChartAgg = z.infer<typeof ChartAgg>;

export const CHART_LIMITS = {
  /** Points a chart plots (and keeps in its data). */
  points: 300,
  /** Rows and columns of an inline source. */
  rows: 500,
  columns: 30,
  /** Distinct categories a bar or pie shows before the rest are folded into "Other". */
  categories: 30,
  name: 100,
} as const;

const InlineCell = z.union([z.string().max(200), z.number().finite(), z.null()]);

export const ChartSource = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('inline'),
    columns: z.array(z.string().trim().min(1).max(CHART_LIMITS.name)).min(1).max(CHART_LIMITS.columns),
    rows: z.array(z.array(InlineCell).max(CHART_LIMITS.columns)).max(CHART_LIMITS.rows),
  }),
  z.strictObject({ kind: z.literal('dataset'), datasetId: DatasetId }),
  z.strictObject({ kind: z.literal('table'), cardId: CardRef }),
]);
export type ChartSource = z.infer<typeof ChartSource>;

export const ChartPoint = z.strictObject({
  x: z.union([z.string().max(200), z.number().finite()]),
  y: z.number().finite(),
  c: z.string().max(200).optional(),
});
export type ChartPoint = z.infer<typeof ChartPoint>;

export const ChartXType = z.enum(['nominal', 'quantitative', 'temporal']);
export type ChartXType = z.infer<typeof ChartXType>;

export const ChartData = z
  .strictObject({
    title: z.string().max(500),
    mark: ChartMark,
    /** Column names (case-insensitive). `y` empty: count the rows of each x. */
    x: z.string().trim().min(1).max(CHART_LIMITS.name),
    y: z.string().trim().min(1).max(CHART_LIMITS.name).optional(),
    /** A column whose values split the data into series (a colour each). */
    color: z.string().trim().min(1).max(CHART_LIMITS.name).optional(),
    agg: ChartAgg.optional(),
    source: ChartSource,
    /** The plotted data, worked out from the source (kept current by the canvas service for bound sources). */
    points: z.array(ChartPoint).max(CHART_LIMITS.points).default([]),
    xType: ChartXType.optional(),
    /** The source's version the points were made from (a dataset's `rev`). */
    rev: z.number().int().nonnegative().optional(),
    /** Why there is nothing to plot ("no column 'foo'; the columns are …"). */
    problem: z.string().max(400).optional(),
    /** A fact about the plot: "top 30 of 80 categories; the rest folded into Other". */
    note: z.string().max(300).optional(),
  })
  .refine((c) => c.source.kind !== 'inline' || c.source.rows.every((r) => r.length === (c.source as { columns: string[] }).columns.length), {
    message: 'every inline row needs one cell per column',
  });
export type ChartData = z.infer<typeof ChartData>;

/** A table to plot: header names and rows of cells. */
export type PlotTable = { columns: readonly string[]; rows: readonly (readonly (Cell | undefined)[])[] };

/** The table of a dataset (columns by name, cells in column order). */
export function plotTableOfDataset(ds: Pick<Dataset, 'columns' | 'rows'>): PlotTable {
  return { columns: ds.columns.map((c) => c.name), rows: ds.rows.map((r) => ds.columns.map((c) => r.cells[c.id] ?? null)) };
}

const colIndex = (columns: readonly string[], ref: string): number => {
  const low = ref.trim().toLowerCase();
  return columns.findIndex((c) => c.trim().toLowerCase() === low);
};

/** A cell as a number ("$1,200", "12.5%", "3 400" read as numbers); undefined when it is not one. */
export function numberOf(cell: Cell | undefined): number | undefined {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : undefined;
  if (typeof cell !== 'string') return undefined;
  const t = cell.trim().replace(/^[$€£¥]\s*/, '').replace(/[%\s,_]/g, '');
  if (!t || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

const sig = (n: number): number => (Number.isInteger(n) ? n : Number(n.toPrecision(8)));
const isYear = (s: string) => /^(19|20)\d{2}$/.test(s);
const isDate = (s: string) => /^\d{4}-\d{2}(-\d{2})?([T ][\d:.]+Z?)?$/.test(s);

export type PlotResult = { points: ChartPoint[]; xType: ChartXType; problem?: string; note?: string };

/**
 * The points a chart plots from `table`: group by x (and colour), aggregate y (sum by default, count when there is
 * no y column), order by x when it is a number or a date, fold a long tail of categories into "Other". Scatter plots
 * the raw rows. Never throws: a column that is not there comes back as `problem`, listing the columns.
 */
export function chartPoints(
  spec: Pick<ChartData, 'mark' | 'x' | 'y' | 'color' | 'agg'>,
  table: PlotTable,
): PlotResult {
  const empty = (problem: string): PlotResult => ({ points: [], xType: 'nominal', problem });
  const names = table.columns.map((c) => JSON.stringify(c)).join(', ');
  const xi = colIndex(table.columns, spec.x);
  if (xi < 0) return empty(`no column ${JSON.stringify(spec.x)}; the columns are ${names}`);
  const yi = spec.y ? colIndex(table.columns, spec.y) : -1;
  if (spec.y && yi < 0) return empty(`no column ${JSON.stringify(spec.y)}; the columns are ${names}`);
  const ci = spec.color ? colIndex(table.columns, spec.color) : -1;
  if (spec.color && ci < 0) return empty(`no column ${JSON.stringify(spec.color)}; the columns are ${names}`);

  type Row = { x: string; y: number | undefined; c: string | undefined };
  const rows: Row[] = [];
  for (const r of table.rows) {
    const x = cellText(r[xi]).trim();
    if (!x) continue;
    const y = yi >= 0 ? numberOf(r[yi]) : 1;
    if (yi >= 0 && y === undefined) continue; // not a number: nothing to plot
    const c = ci >= 0 ? cellText(r[ci]).trim() || '(none)' : undefined;
    rows.push({ x, y, c });
  }
  if (rows.length === 0)
    return empty(yi >= 0 ? `no rows with a value in ${JSON.stringify(spec.x)} and a number in ${JSON.stringify(spec.y)}` : 'no rows to plot');

  const allNumeric = rows.every((r) => numberOf(r.x) !== undefined);
  const allYears = rows.every((r) => isYear(r.x));
  const allDates = rows.every((r) => isDate(r.x) || isYear(r.x));
  const continuous = spec.mark === 'line' || spec.mark === 'area' || spec.mark === 'scatter';
  const xType: ChartXType =
    spec.mark === 'bar' || spec.mark === 'pie'
      ? 'nominal'
      : allYears || allDates
        ? 'temporal'
        : allNumeric && continuous
          ? 'quantitative'
          : 'nominal';
  const xValue = (x: string): string | number => (xType === 'quantitative' ? numberOf(x)! : x);

  if (spec.mark === 'scatter') {
    const kept = rows.slice(0, CHART_LIMITS.points);
    return {
      points: kept.map((r) => ({ x: xValue(r.x), y: sig(r.y!), ...(r.c ? { c: r.c } : {}) })),
      xType,
      ...(rows.length > kept.length ? { note: `first ${kept.length} of ${rows.length} rows` } : {}),
    };
  }

  const agg: ChartAgg = spec.agg ?? (yi >= 0 ? 'sum' : 'count');
  const groups = new Map<string, { x: string; c: string | undefined; vals: number[] }>();
  for (const r of rows) {
    const key = `${r.x}\u0000${r.c ?? ''}`;
    const g = groups.get(key) ?? { x: r.x, c: r.c, vals: [] };
    g.vals.push(r.y ?? 1);
    groups.set(key, g);
  }
  const fold = (vals: number[]): number =>
    agg === 'count'
      ? vals.length
      : agg === 'avg'
        ? vals.reduce((a, b) => a + b, 0) / vals.length
        : agg === 'min'
          ? Math.min(...vals)
          : agg === 'max'
            ? Math.max(...vals)
            : vals.reduce((a, b) => a + b, 0);
  let points = [...groups.values()].map((g) => ({ x: xValue(g.x), y: sig(fold(g.vals)), ...(g.c ? { c: g.c } : {}) }));

  let note: string | undefined;
  if (xType === 'nominal') {
    const total = new Map<string | number, number>();
    for (const p of points) total.set(p.x, (total.get(p.x) ?? 0) + Math.abs(p.y));
    if (total.size > CHART_LIMITS.categories) {
      const keep = new Set(
        [...total.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, CHART_LIMITS.categories - 1)
          .map(([k]) => k),
      );
      const other = new Map<string, { vals: number[]; c: string | undefined }>();
      const kept: typeof points = [];
      for (const p of points) {
        if (keep.has(p.x)) kept.push(p);
        else {
          const o = other.get(p.c ?? '') ?? { vals: [], c: p.c };
          o.vals.push(p.y);
          other.set(p.c ?? '', o);
        }
      }
      for (const o of other.values()) kept.push({ x: 'Other', y: sig(agg === 'avg' ? o.vals.reduce((a, b) => a + b, 0) / o.vals.length : fold(o.vals)), ...(o.c ? { c: o.c } : {}) });
      note = `top ${CHART_LIMITS.categories - 1} of ${total.size} categories; the rest folded into Other`;
      points = kept;
    }
  } else {
    points.sort((a, b) => (xType === 'quantitative' ? (a.x as number) - (b.x as number) : String(a.x).localeCompare(String(b.x))));
  }
  if (points.length > CHART_LIMITS.points) {
    note = `first ${CHART_LIMITS.points} of ${points.length} points`;
    points = points.slice(0, CHART_LIMITS.points);
  }
  return { points, xType, ...(note ? { note } : {}) };
}

/** The table a chart's INLINE source holds. */
export const plotTableOfInline = (s: Extract<ChartSource, { kind: 'inline' }>): PlotTable => ({
  columns: s.columns,
  rows: s.rows,
});

/** The points of a chart: worked out from inline rows, or the card's kept points for a bound source. */
export function chartPlot(d: ChartData): PlotResult {
  if (d.source.kind === 'inline') return chartPoints(d, plotTableOfInline(d.source));
  return { points: d.points, xType: d.xType ?? 'nominal', ...(d.problem ? { problem: d.problem } : {}), ...(d.note ? { note: d.note } : {}) };
}

const num = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(sig(n)));

/** Plain text of what a chart shows, for agents, print alt text and the deck's speaker notes. */
export function chartSummary(d: ChartData): string {
  const { points, problem, note } = chartPlot(d);
  const what = `${d.mark} chart "${d.title}": ${d.y ?? 'count'}${d.agg && d.y ? ` (${d.agg})` : ''} by ${d.x}${d.color ? `, split by ${d.color}` : ''}`;
  const bound = d.source.kind === 'dataset' ? ` Bound to dataset ${d.source.datasetId}.` : d.source.kind === 'table' ? ` Bound to table card ${d.source.cardId}.` : '';
  if (problem) return `${what}.${bound} Nothing to plot: ${problem}.`;
  if (points.length === 0) return `${what}.${bound} No data yet.`;
  const series = [...new Set(points.map((p) => p.c).filter((c): c is string => c !== undefined))];
  const lines: string[] = [];
  if (series.length > 0) {
    for (const s of series.slice(0, 6)) {
      const ps = points.filter((p) => p.c === s);
      lines.push(`${s}: ${ps.slice(0, 6).map((p) => `${p.x} ${num(p.y)}`).join(', ')}${ps.length > 6 ? ', …' : ''}`);
    }
  } else if (points.length <= 10 || d.mark === 'pie' || d.mark === 'bar') {
    const ps = points.slice(0, 12);
    lines.push(ps.map((p) => `${p.x} ${num(p.y)}`).join(', ') + (points.length > ps.length ? ', …' : ''));
  } else {
    const first = points[0]!;
    const last = points.at(-1)!;
    lines.push(`${points.length} points, from ${first.x} ${num(first.y)} to ${last.x} ${num(last.y)}`);
  }
  const ys = points.map((p) => p.y);
  const stats = ` Min ${num(Math.min(...ys))}, max ${num(Math.max(...ys))}${d.mark === 'pie' || d.agg === 'count' || (d.agg ?? 'sum') === 'sum' ? `, total ${num(ys.reduce((a, b) => a + b, 0))}` : ''}.`;
  return `${what}. ${lines.join('; ')}.${stats}${note ? ` (${note}.)` : ''}${bound}`;
}

// ---- Metric ----

export const MetricData = z.strictObject({
  title: z.string().max(500),
  /** The figure as written ("$4.2B", "38", "12.5"). */
  value: z.string().trim().min(1).max(40),
  unit: z.string().trim().max(24).optional(),
  change: z
    .strictObject({
      /** "+12%", "-3.1 pts". */
      value: z.string().trim().min(1).max(30),
      direction: z.enum(['up', 'down', 'flat']),
      /** Whether this change is good news; unset: neutral colour. */
      good: z.boolean().optional(),
    })
    .optional(),
  /** What the figure covers ("FY2025", "Q3 2026", "as of 2026-10-01"). */
  period: z.string().trim().max(60).optional(),
  source: SourceRef.optional(),
  note: z.string().max(400).optional(),
});
export type MetricData = z.infer<typeof MetricData>;

export function metricSummary(d: MetricData): string {
  const change = d.change ? `, ${d.change.direction} ${d.change.value}` : '';
  const src = sourceText(d.source);
  return `Metric "${d.title}": ${d.value}${d.unit ? ` ${d.unit}` : ''}${change}${d.period ? ` (${d.period})` : ''}${src ? `. Source: ${src}` : ''}.`;
}

// ---- Timeline ----

/** `2026`, `2026-10`, `2026-10-15`. */
export const PartialDate = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/, {
  message: 'a date like 2026, 2026-10 or 2026-10-15',
});

export const TIMELINE_LIMITS = { events: 60 } as const;

export const TimelineEvent = z.strictObject({
  date: PartialDate,
  label: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(600).optional(),
  /** Every event says where it comes from. */
  source: SourceRef,
});
export type TimelineEvent = z.infer<typeof TimelineEvent>;

export const TimelineData = z.strictObject({
  title: z.string().max(500),
  events: z.array(TimelineEvent).min(1).max(TIMELINE_LIMITS.events),
});
export type TimelineData = z.infer<typeof TimelineData>;

/** Events in date order (a stable sort; an earlier partial date first: 2026 < 2026-03). */
export const timelineOrdered = (events: readonly TimelineEvent[]): TimelineEvent[] =>
  events.map((e, i) => ({ e, i })).sort((a, b) => a.e.date.localeCompare(b.e.date) || a.i - b.i).map((x) => x.e);

/** "Oct 2026", "15 Oct 2026", "2026". */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-');
  if (!m) return y ?? date;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1] ?? m;
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}

export function timelineSummary(d: TimelineData): string {
  const ev = timelineOrdered(d.events);
  const shown = ev.slice(0, 6).map((e) => `${dateLabel(e.date)} ${e.label}`);
  return `Timeline "${d.title}": ${ev.length} events, ${dateLabel(ev[0]!.date)} to ${dateLabel(ev.at(-1)!.date)}. ${shown.join('; ')}${ev.length > 6 ? '; …' : ''}.`;
}

// ---- Comparison matrix ----

export const MATRIX_LIMITS = { criteria: 12, options: 8, score: 10 } as const;

export const MatrixData = z
  .strictObject({
    title: z.string().max(500),
    criteria: z
      .array(
        z.strictObject({
          name: z.string().trim().min(1).max(80),
          /** Relative importance, 1 to 100. */
          weight: z.number().min(1).max(100),
        }),
      )
      .min(1)
      .max(MATRIX_LIMITS.criteria),
    options: z
      .array(
        z.strictObject({
          name: z.string().trim().min(1).max(80),
          /** One score 0 to 10 per criterion, in order; null: not scored. */
          scores: z.array(z.number().min(0).max(MATRIX_LIMITS.score).nullable()).max(MATRIX_LIMITS.criteria),
          note: z.string().trim().max(300).optional(),
        }),
      )
      .min(2)
      .max(MATRIX_LIMITS.options),
  })
  .refine((m) => m.options.every((o) => o.scores.length === m.criteria.length), {
    message: 'every option needs one score per criterion',
  });
export type MatrixData = z.infer<typeof MatrixData>;

/** A missing score leaves its total unknown. Rank only a fully scored comparison. */
export function matrixTotals(m: MatrixData): { totals: (number | null)[]; winners: number[]; tie: boolean } {
  const wsum = m.criteria.reduce((a, c) => a + c.weight, 0) || 1;
  const totals = m.options.map((o) => {
    if (o.scores.some(s => s === null)) return null;
    const t = o.scores.reduce<number>((a, s, i) => a + (s ?? 0) * (m.criteria[i]?.weight ?? 0), 0) / wsum;
    return Math.round(t * 100) / 100;
  });
  if (totals.some(t => t === null)) return { totals, winners: [], tie: false };
  const best = Math.max(...totals as number[]);
  const winners = totals.flatMap((t, i) => (t === best ? [i] : []));
  return { totals, winners, tie: winners.length > 1 };
}

export function matrixSummary(m: MatrixData): string {
  const { totals, winners, tie } = matrixTotals(m);
  const ranked = m.options
    .map((o, i) => ({ name: o.name, t: totals[i]! }))
    .sort((a, b) => (b.t ?? -1) - (a.t ?? -1))
    .map((o) => `${o.name} ${o.t === null ? 'not scored' : o.t}`);
  const crit = m.criteria.map((c) => `${c.name} (${c.weight})`).join(', ');
  const win = !winners.length ? 'Comparison incomplete: finish scoring before choosing a winner' : tie ? `Tie: ${winners.map((i) => m.options[i]!.name).join(', ')}` : `Winner: ${m.options[winners[0]!]!.name}`;
  return `Comparison "${m.title}": ${m.options.length} options on ${crit}. Weighted scores out of 10: ${ranked.join(', ')}. ${win}.`;
}

// ---- Charting a table or a database ----

export type ColumnInfo = { name: string; kind: 'number' | 'date' | 'other' };

/** The columns of a Table card with a guess of each one's kind (a number when every filled cell is one). */
export function tableColumnInfo(columns: readonly string[], rows: readonly (readonly string[])[]): ColumnInfo[] {
  return columns.map((name, i) => {
    const cells = rows.map((r) => (r[i] ?? '').trim()).filter(Boolean);
    const kind = cells.length === 0 ? 'other' : cells.every((c) => numberOf(c) !== undefined && !isYear(c)) ? 'number' : cells.every((c) => isDate(c)) ? 'date' : 'other';
    return { name, kind };
  });
}

/** A first chart for some columns: a date or category on x, the first number on y (counting rows when there is none). */
export function suggestChart(cols: readonly ColumnInfo[]): Pick<ChartData, 'mark' | 'x' | 'y'> | undefined {
  if (cols.length === 0) return undefined;
  const x = cols.find((c) => c.kind === 'date') ?? cols.find((c) => c.kind === 'other') ?? cols[0]!;
  const y = cols.find((c) => c.kind === 'number' && c.name !== x.name);
  return { mark: x.kind === 'date' ? 'line' : 'bar', x: x.name, ...(y ? { y: y.name } : {}) };
}
