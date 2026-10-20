/**
 * Chart (P6.4): bar, line, area, scatter or pie of columns, from rows given inline, a Database/dataset, or a Table
 * card (bound: the chart follows the data). The agent gives a small spec, never Vega-Lite: no URLs, transforms or
 * expressions can reach the renderer. `describe()` states what the chart plots, so agents can read it.
 */
import { CHART_LIMITS, CHART_MARKS, ChartData, DatasetId, chartSummary, readCardData } from '@orb/shared';
import { z } from 'zod';
import { CardFieldError, CardRefField, Title, type CardTypeSpec, type Fields } from '../spec.js';
import { DESCRIBE_MAX, clip } from '../describe.js';

const Col = z.string().trim().min(1).max(CHART_LIMITS.name);

function sourceOf(f: Fields): Fields | undefined {
  const given = [f.datasetId, f.tableCardId, f.rows !== undefined || f.columns !== undefined ? 1 : undefined].filter(
    (v) => v !== undefined,
  );
  if (given.length > 1) throw new CardFieldError('give ONE data source: datasetId, tableCardId, or columns + rows');
  if (f.datasetId !== undefined) return { kind: 'dataset', datasetId: f.datasetId };
  if (f.tableCardId !== undefined) return { kind: 'table', cardId: f.tableCardId };
  if (f.rows !== undefined || f.columns !== undefined) {
    if (!f.columns || !f.rows) throw new CardFieldError('inline data needs both columns and rows');
    return { kind: 'inline', columns: f.columns, rows: f.rows };
  }
  return undefined;
}

export const chart: CardTypeSpec<'chart'> = {
  type: 'chart',
  purpose:
    'A chart (bar, line, area, scatter or pie) of data. Bind it to a Database (datasetId) or a Table card (tableCardId) and it follows the data; or give small inline columns + rows.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    mark: z.enum(CHART_MARKS).optional(),
    x: Col.optional(),
    y: Col.optional(),
    color: Col.optional(),
    agg: z.enum(['sum', 'avg', 'count', 'min', 'max']).optional(),
    datasetId: DatasetId.optional(),
    tableCardId: CardRefField.optional(),
    columns: z.array(Col).min(1).max(CHART_LIMITS.columns).optional(),
    rows: z.array(z.array(z.string().max(200)).max(CHART_LIMITS.columns)).max(CHART_LIMITS.rows).optional(),
  }),
  fieldHelp:
    'title, mark ("bar" default | "line" | "area" | "scatter" | "pie"), x = the column on the x axis (the category for a pie), y? = the numeric column (omit to count rows), color? = a column that splits series, agg? ("sum" default | "avg" | "count" | "min" | "max"), and ONE data source: datasetId (a Database, live) | tableCardId (a Table card, live) | columns + rows (inline, ≤500 rows). x and y are column names',
  tools: [],
  toData(fields, _ctx, mode) {
    const source = sourceOf(fields);
    if (mode === 'update') {
      const out: Fields = {};
      for (const k of ['title', 'mark', 'x', 'y', 'color', 'agg'] as const) if (fields[k] !== undefined) out[k] = fields[k];
      if (source) out.source = source;
      return out;
    }
    if (!source) throw new CardFieldError('a chart needs a data source: datasetId, tableCardId, or columns + rows');
    if (fields.x === undefined) throw new CardFieldError('a chart needs x (the column on the x axis)');
    return {
      title: fields.title,
      mark: fields.mark ?? 'bar',
      x: fields.x,
      ...(fields.y !== undefined ? { y: fields.y } : {}),
      ...(fields.color !== undefined ? { color: fields.color } : {}),
      ...(fields.agg !== undefined ? { agg: fields.agg } : {}),
      source,
      points: [],
    };
  },
  describe(data) {
    const d = readCardData(ChartData, data);
    if (!d) return 'Chart (unreadable data).';
    return clip(chartSummary(d), DESCRIBE_MAX);
  },
};
