/**
 * Datasets (P6.3): the rows behind a Database card and behind a dataset view attached to any card.
 *
 * A dataset is one JSON file per canvas, `assets/data/<datasetId>.json`, written only by the orb-canvas service
 * (never by the renderer or an agent directly). `board.jsonl` holds the card events that reference it: a Database
 * card's `data` (name, columns, row count, a small preview) and the `Card.view` field (the views of the dataset
 * that a card shows: table, board, gallery; each with filter, sort, group).
 *
 * This module is pure and harness-free. It holds the schemas, the limits, the import conversions (CSV, JSON and
 * pasted text here; XLSX is parsed by orb-canvas), the edit operations, and the structured query engine that
 * `query_dataset` and the views share. There is no SQL and no code evaluation anywhere: a query is data.
 */
import { z } from 'zod';
import { parseCsv } from './cards.js';

// ---- Limits ----

export const DATASET_LIMITS = {
  columns: 60,
  rows: 20_000,
  cell: 2000,
  name: 200,
  views: 8,
  filters: 12,
  /** The most rows `query_dataset` returns. */
  query: 50,
  /** The most rows one `upsert_rows` call writes. */
  upsert: 200,
  /** The largest dataset file. */
  bytes: 20 * 1024 * 1024,
  /** The preview a Database card keeps in its data (rows). */
  preview: 12,
  /** Most characters of a dataset's search digest. */
  digest: 30_000,
} as const;

// ---- Schemas ----

/** `d_<ulid>`: the id of a dataset (and its file name). */
export const DatasetId = z.string().regex(/^d_[A-Za-z0-9]{8,40}$/);
export type DatasetId = z.infer<typeof DatasetId>;
/** `assets/data/<id>.json`. */
export const datasetPath = (id: string): string => `assets/data/${id}.json`;

export const ColumnType = z.enum(['text', 'number', 'date', 'checkbox', 'select', 'url']);
export type ColumnType = z.infer<typeof ColumnType>;

/** One cell: text, a number, a checkbox, or empty. Dates are ISO strings (`2026-10-15`). */
export const Cell = z.union([z.string().max(DATASET_LIMITS.cell), z.number().finite(), z.boolean(), z.null()]);
export type Cell = z.infer<typeof Cell>;

export const ColumnId = z.string().regex(/^k[0-9]{1,6}$/);
export const RowId = z.string().regex(/^r[0-9]{1,8}$/);

export const DatasetColumn = z.strictObject({
  id: ColumnId,
  name: z.string().trim().min(1).max(100),
  type: ColumnType,
  /** Choices of a `select` column. */
  options: z.array(z.string().max(100)).max(50).optional(),
});
export type DatasetColumn = z.infer<typeof DatasetColumn>;

export const DatasetRow = z.strictObject({
  id: RowId,
  /** Cells by column id; a missing key is an empty cell. */
  cells: z.record(ColumnId, Cell),
  /** Who wrote the row: agents never overwrite a row the user wrote. */
  by: z.enum(['user', 'orb', 'scout', 'critic', 'builder']),
});
export type DatasetRow = z.infer<typeof DatasetRow>;

export const Dataset = z.strictObject({
  v: z.literal(1),
  id: DatasetId,
  name: z.string().trim().min(1).max(DATASET_LIMITS.name),
  columns: z.array(DatasetColumn).min(1).max(DATASET_LIMITS.columns),
  rows: z.array(DatasetRow).max(DATASET_LIMITS.rows),
  /** +1 on every write: cards and views refetch when it moves. */
  rev: z.number().int().nonnegative(),
  nextCol: z.number().int().positive(),
  nextRow: z.number().int().positive(),
  updatedAt: z.number(),
});
export type Dataset = z.infer<typeof Dataset>;

// ---- Views ----

export const FilterOp = z.enum([
  'eq',
  'neq',
  'contains',
  'notContains',
  'gt',
  'gte',
  'lt',
  'lte',
  'empty',
  'notEmpty',
  'in',
]);
export type FilterOp = z.infer<typeof FilterOp>;

export const Filter = z.strictObject({
  /** A column id, or (for agents) a column name. */
  column: z.string().min(1).max(100),
  op: FilterOp,
  value: z.union([Cell, z.array(Cell).max(50)]).optional(),
});
export type Filter = z.infer<typeof Filter>;

export const SortKey = z.strictObject({ column: z.string().min(1).max(100), dir: z.enum(['asc', 'desc']) });
export type SortKey = z.infer<typeof SortKey>;

export const ViewKind = z.enum(['table', 'board', 'gallery']);
export type ViewKind = z.infer<typeof ViewKind>;

export const DatasetView = z.strictObject({
  id: z.string().regex(/^v[0-9]{1,4}$/),
  name: z.string().trim().min(1).max(60),
  kind: ViewKind,
  filter: z.array(Filter).max(DATASET_LIMITS.filters),
  /** `and` (every filter) or `or` (any). */
  match: z.enum(['and', 'or']).default('and'),
  sort: z.array(SortKey).max(3),
  /** Table: rows grouped under this column's values. Board: the lanes. Gallery: grouped like a table. */
  group: z.string().nullable(),
  /** Gallery: the column whose value is the picture (an image URL or an `assets/…` path). */
  cover: z.string().nullable(),
  /** Columns left out of this view. */
  hidden: z.array(z.string()).max(DATASET_LIMITS.columns),
});
export type DatasetView = z.infer<typeof DatasetView>;

/** What a card shows of a dataset: its views, the active one, and the dataset's identity and size. */
export const CardView = z.strictObject({
  datasetId: DatasetId,
  /** The dataset's name and row count when last written (cards show them without fetching the rows). */
  name: z.string().max(DATASET_LIMITS.name),
  rowCount: z.number().int().nonnegative(),
  rev: z.number().int().nonnegative(),
  views: z.array(DatasetView).min(1).max(DATASET_LIMITS.views),
  active: z.string().regex(/^v[0-9]{1,4}$/),
});
export type CardView = z.infer<typeof CardView>;

/** The default (table) view of a dataset. */
export const defaultView = (id = 'v1', kind: ViewKind = 'table', name?: string): DatasetView => ({
  id,
  name: name ?? (kind === 'table' ? 'Table' : kind === 'board' ? 'Board' : 'Gallery'),
  kind,
  filter: [],
  match: 'and',
  sort: [],
  group: null,
  cover: null,
  hidden: [],
});

/** A fresh `CardView` for a dataset. */
export const newCardView = (ds: { id: string; name: string; rows: { length: number }; rev: number }): CardView => ({
  datasetId: ds.id as DatasetId,
  name: ds.name,
  rowCount: ds.rows.length,
  rev: ds.rev,
  views: [defaultView()],
  active: 'v1',
});

/** The active view of a card view (the first when `active` names none). */
export const activeView = (cv: CardView): DatasetView => cv.views.find((v) => v.id === cv.active) ?? cv.views[0]!;

// ---- Database card data ----

/** Rows a Database card keeps as a preview (cell text, in column order) so the board, print and describe need no fetch. */
export const DatabaseData = z.strictObject({
  title: z.string().max(500),
  datasetId: DatasetId,
  rowCount: z.number().int().nonnegative(),
  columns: z.array(z.string().max(100)).min(1).max(DATASET_LIMITS.columns),
  types: z.array(ColumnType).max(DATASET_LIMITS.columns).optional(),
  rev: z.number().int().nonnegative(),
  preview: z.array(z.array(z.string().max(120))).max(DATASET_LIMITS.preview).optional(),
});
export type DatabaseData = z.infer<typeof DatabaseData>;

// ---- Helpers ----

/** The text of a cell as a table shows it. */
export function cellText(cell: Cell | undefined): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'boolean') return cell ? 'Yes' : 'No';
  return String(cell);
}

const isEmpty = (c: Cell | undefined): boolean => c === null || c === undefined || c === '';

/** The column a reference names: by id, else by name (case-insensitive). */
export function findColumn(ds: Pick<Dataset, 'columns'>, ref: string): DatasetColumn | undefined {
  const byId = ds.columns.find((c) => c.id === ref);
  if (byId) return byId;
  const low = ref.trim().toLowerCase();
  return ds.columns.find((c) => c.name.toLowerCase() === low);
}

function needColumn(ds: Pick<Dataset, 'columns'>, ref: string): DatasetColumn {
  const c = findColumn(ds, ref);
  if (!c)
    throw new DatasetError(
      `no column ${JSON.stringify(ref)}; the columns are ${ds.columns.map((x) => JSON.stringify(x.name)).join(', ')}`,
    );
  return c;
}

export class DatasetError extends Error {
  override name = 'DatasetError';
}

/** The preview a Database card keeps: the first rows as cell text. */
export function previewOf(ds: Pick<Dataset, 'columns' | 'rows'>): string[][] {
  const out: string[][] = [];
  let bytes = 0;
  for (const r of ds.rows.slice(0, DATASET_LIMITS.preview)) {
    const line = ds.columns.map((c) => cellText(r.cells[c.id]).slice(0, 120));
    bytes += JSON.stringify(line).length;
    if (bytes > 16_000) break;
    out.push(line);
  }
  return out;
}

/** The card data of a Database card for the dataset as it is now. */
export function databaseDataOf(title: string, ds: Dataset): DatabaseData {
  return {
    title: title.slice(0, 500),
    datasetId: ds.id as DatasetId,
    rowCount: ds.rows.length,
    columns: ds.columns.map((c) => c.name),
    types: ds.columns.map((c) => c.type),
    rev: ds.rev,
    preview: previewOf(ds),
  };
}

// ---- Value coercion and comparison ----

const NUM = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[-+]\d{2}:?\d{2})?)?$/;

/** A cell value coerced to a column's type (text that does not fit stays text; empty text is null). */
export function coerceCell(col: Pick<DatasetColumn, 'type'>, value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value === 'object') return JSON.stringify(value).slice(0, DATASET_LIMITS.cell);
  if (col.type === 'checkbox') {
    if (typeof value === 'boolean') return value;
    const s = String(value).trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'x', 'checked'].includes(s)) return true;
    if (['false', 'no', 'n', '0', ''].includes(s)) return false;
    return null;
  }
  if (typeof value === 'boolean') return col.type === 'text' ? (value ? 'true' : 'false') : value;
  if (col.type === 'number') {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const s = String(value).trim().replace(/^[$€£]/, '').replace(/%$/, '').replace(/,(?=\d{3}\b)/g, '');
    if (s === '') return null;
    return NUM.test(s) ? Number(s) : String(value).slice(0, DATASET_LIMITS.cell);
  }
  const s = typeof value === 'number' ? String(value) : String(value);
  const text = s.length > DATASET_LIMITS.cell ? s.slice(0, DATASET_LIMITS.cell) : s;
  return text === '' ? null : text;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Compare two cells of a column (empty cells last, numbers numerically, text naturally). */
export function compareCells(a: Cell | undefined, b: Cell | undefined): number {
  const ea = isEmpty(a);
  const eb = isEmpty(b);
  if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return collator.compare(cellText(a), cellText(b));
}

const asNumber = (c: Cell | undefined): number | undefined => {
  if (typeof c === 'number') return c;
  if (typeof c === 'string' && NUM.test(c.trim())) return Number(c);
  return undefined;
};

/** True when the row's cell passes one filter. */
export function passes(col: DatasetColumn, cell: Cell | undefined, f: Filter): boolean {
  const empty = isEmpty(cell);
  if (f.op === 'empty') return empty;
  if (f.op === 'notEmpty') return !empty;
  const want = f.value;
  if (f.op === 'in') {
    const list = Array.isArray(want) ? want : [want ?? null];
    return list.some((v) => cellText(coerceCell(col, v)).toLowerCase() === cellText(cell).toLowerCase());
  }
  const one = Array.isArray(want) ? want[0] : want;
  if (f.op === 'contains') return cellText(cell).toLowerCase().includes(cellText(one ?? null).toLowerCase());
  if (f.op === 'notContains') return !cellText(cell).toLowerCase().includes(cellText(one ?? null).toLowerCase());
  const target = coerceCell(col, one ?? null);
  if (f.op === 'eq' || f.op === 'neq') {
    const same =
      typeof cell === 'number' || typeof target === 'number'
        ? asNumber(cell) !== undefined && asNumber(cell) === asNumber(target)
        : cellText(cell).toLowerCase() === cellText(target).toLowerCase();
    return f.op === 'eq' ? same : !same;
  }
  if (empty) return false;
  const c = compareCells(
    col.type === 'number' ? (asNumber(cell) ?? cell) : cell,
    col.type === 'number' ? (asNumber(target) ?? target) : target,
  );
  return f.op === 'gt' ? c > 0 : f.op === 'gte' ? c >= 0 : f.op === 'lt' ? c < 0 : c <= 0;
}

// ---- Views and queries (structured, no SQL) ----

/** Rows of a dataset that pass `filters` (every one for `and`, any one for `or`). */
export function filterRows(
  ds: Pick<Dataset, 'columns' | 'rows'>,
  filters: readonly Filter[],
  match: 'and' | 'or' = 'and',
): DatasetRow[] {
  if (filters.length === 0) return ds.rows.slice();
  const cols = filters.map((f) => needColumn(ds, f.column));
  return ds.rows.filter((row) => {
    const test = (f: Filter, i: number) => passes(cols[i]!, row.cells[cols[i]!.id], f);
    return match === 'or' ? filters.some(test) : filters.every(test);
  });
}

/** Rows sorted by the keys (stable). */
export function sortRows(
  ds: Pick<Dataset, 'columns'>,
  rows: readonly DatasetRow[],
  keys: readonly SortKey[],
): DatasetRow[] {
  if (keys.length === 0) return rows.slice();
  const cols = keys.map((k) => needColumn(ds, k.column));
  const idx = rows.map((_, i) => i);
  idx.sort((a, b) => {
    for (const [i, k] of keys.entries()) {
      const id = cols[i]!.id;
      const x = rows[a]!.cells[id];
      const y = rows[b]!.cells[id];
      // empty cells stay last in both directions
      if (isEmpty(x) || isEmpty(y)) {
        if (isEmpty(x) && isEmpty(y)) continue;
        return isEmpty(x) ? 1 : -1;
      }
      const c = compareCells(x, y);
      if (c !== 0) return k.dir === 'asc' ? c : -c;
    }
    return a - b;
  });
  return idx.map((i) => rows[i]!);
}

export type RowGroup = { key: string; label: string; rows: DatasetRow[] };

/** Rows in groups by one column's values (first-seen order for text; select options in their order; empty last). */
export function groupRows(ds: Pick<Dataset, 'columns'>, rows: readonly DatasetRow[], column: string): RowGroup[] {
  const col = needColumn(ds, column);
  const groups = new Map<string, RowGroup>();
  for (const row of rows) {
    const cell = row.cells[col.id];
    const key = isEmpty(cell) ? '' : cellText(cell);
    let g = groups.get(key);
    if (!g) {
      g = { key, label: key === '' ? 'No value' : key, rows: [] };
      groups.set(key, g);
    }
    g.rows.push(row);
  }
  const out = [...groups.values()];
  const order = col.options;
  out.sort((a, b) => {
    if (a.key === '' || b.key === '') return a.key === '' ? 1 : -1;
    if (order) {
      const ia = order.indexOf(a.key);
      const ib = order.indexOf(b.key);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
    }
    return 0;
  });
  return out;
}

/** What a view shows: the filtered, sorted rows and, for a grouped view, the groups. */
export function applyView(ds: Dataset, rawView: DatasetView): { rows: DatasetRow[]; groups: RowGroup[] | null } {
  // A view may name a column that was deleted since: those filters, sorts and groups are ignored, never an error.
  const known = (ref: string) => findColumn(ds, ref) !== undefined;
  const view: DatasetView = {
    ...rawView,
    filter: rawView.filter.filter((f) => known(f.column)),
    sort: rawView.sort.filter((k) => known(k.column)),
    group: rawView.group && known(rawView.group) ? rawView.group : null,
  };
  const rows = sortRows(ds, filterRows(ds, view.filter, view.match), view.sort);
  const group = view.group ?? (view.kind === 'board' ? defaultLane(ds) : null);
  return { rows, groups: group ? groupRows(ds, rows, group) : null };
}

/** The column a board view groups by when none is set: the first select column, else the first with few values. */
export function defaultLane(ds: Pick<Dataset, 'columns' | 'rows'>): string | null {
  const select = ds.columns.find((c) => c.type === 'select');
  if (select) return select.id;
  for (const c of ds.columns) {
    if (c.type === 'number' || c.type === 'url') continue;
    const values = new Set(ds.rows.map((r) => cellText(r.cells[c.id])));
    if (values.size >= 1 && values.size <= 8) return c.id;
  }
  return null;
}

export const AggregateFn = z.enum(['count', 'sum', 'avg', 'min', 'max', 'countDistinct']);

/** `query_dataset`'s query: filter, group, aggregate, sort, limit. Columns by name or id. */
export const DatasetQuery = z.strictObject({
  filter: z.array(Filter).max(DATASET_LIMITS.filters).optional(),
  match: z.enum(['and', 'or']).optional(),
  /** Columns to return (a plain query). Default: all. */
  select: z.array(z.string().max(100)).max(DATASET_LIMITS.columns).optional(),
  groupBy: z.array(z.string().max(100)).max(2).optional(),
  aggregate: z
    .array(
      z.strictObject({
        fn: AggregateFn,
        column: z.string().max(100).optional(),
        as: z.string().max(60).optional(),
      }),
    )
    .max(8)
    .optional(),
  sort: z.array(SortKey).max(3).optional(),
  limit: z.number().int().min(1).max(DATASET_LIMITS.query).optional(),
  offset: z.number().int().min(0).max(DATASET_LIMITS.rows).optional(),
});
export type DatasetQuery = z.infer<typeof DatasetQuery>;

export type QueryResult = {
  columns: string[];
  /** Plain queries: the row ids, parallel to `rows` (for `upsert_rows`). */
  rowIds?: string[];
  rows: Cell[][];
  /** Rows (or groups) matching before the limit. */
  total: number;
  returned: number;
  /** Matching rows or groups left out by the limit/offset. */
  more: number;
};

/** Run a structured query. Throws DatasetError for an unknown column or an aggregate that needs one. */
export function runQuery(ds: Dataset, rawQuery: DatasetQuery): QueryResult {
  const q = DatasetQuery.parse(rawQuery);
  const limit = Math.min(q.limit ?? DATASET_LIMITS.query, DATASET_LIMITS.query);
  const offset = q.offset ?? 0;
  const matched = filterRows(ds, q.filter ?? [], q.match ?? 'and');
  const aggs = q.aggregate ?? [];
  const groupBy = q.groupBy ?? [];

  if (aggs.length === 0 && groupBy.length === 0) {
    const sorted = sortRows(ds, matched, q.sort ?? []);
    const cols = q.select && q.select.length > 0 ? q.select.map((c) => needColumn(ds, c)) : ds.columns;
    const page = sorted.slice(offset, offset + limit);
    return {
      columns: cols.map((c) => c.name),
      rowIds: page.map((r) => r.id),
      rows: page.map((r) => cols.map((c) => r.cells[c.id] ?? null)),
      total: sorted.length,
      returned: page.length,
      more: Math.max(0, sorted.length - offset - page.length),
    };
  }

  const gcols = groupBy.map((g) => needColumn(ds, g));
  const buckets = new Map<string, DatasetRow[]>();
  for (const row of matched) {
    const key = JSON.stringify(gcols.map((c) => row.cells[c.id] ?? null));
    const b = buckets.get(key);
    if (b) b.push(row);
    else buckets.set(key, [row]);
  }
  if (gcols.length === 0) buckets.set('[]', matched);
  const specs = (aggs.length > 0 ? aggs : [{ fn: 'count' as const }]).map((a) => {
    const col = 'column' in a && a.column ? needColumn(ds, a.column) : undefined;
    if (a.fn !== 'count' && !col) throw new DatasetError(`${a.fn} needs a column`);
    const as = ('as' in a && a.as) || (col ? `${a.fn}(${col.name})` : a.fn);
    return { fn: a.fn, col, as };
  });
  let out = [...buckets.entries()].map(([key, rows]) => {
    const keys = JSON.parse(key) as Cell[];
    const vals = specs.map((s) => aggregateOf(s.fn, s.col, rows));
    return [...keys, ...vals];
  });
  const names = [...gcols.map((c) => c.name), ...specs.map((s) => s.as)];
  // Sort the result by an output column name or a group/source column; default: the first aggregate, descending.
  const keys = q.sort ?? (specs.length > 0 && gcols.length > 0 ? [{ column: names[gcols.length]!, dir: 'desc' as const }] : []);
  for (const k of [...keys].reverse()) {
    const i = names.findIndex((n) => n.toLowerCase() === k.column.toLowerCase());
    if (i === -1) throw new DatasetError(`cannot sort by ${JSON.stringify(k.column)}; the result has ${names.join(', ')}`);
    const dir = k.dir === 'asc' ? 1 : -1;
    out = out
      .map((r, n) => [r, n] as const)
      .sort(([a, na], [b, nb]) => {
        const x = a[i];
        const y = b[i];
        if (isEmpty(x) || isEmpty(y)) return isEmpty(x) && isEmpty(y) ? na - nb : isEmpty(x) ? 1 : -1;
        return dir * compareCells(x, y) || na - nb;
      })
      .map(([r]) => r);
  }
  const page = out.slice(offset, offset + limit);
  return {
    columns: names,
    rows: page as Cell[][],
    total: out.length,
    returned: page.length,
    more: Math.max(0, out.length - offset - page.length),
  };
}

function aggregateOf(fn: z.infer<typeof AggregateFn>, col: DatasetColumn | undefined, rows: DatasetRow[]): Cell {
  if (fn === 'count' && !col) return rows.length;
  const values = rows.map((r) => r.cells[col!.id]).filter((c) => !isEmpty(c));
  if (fn === 'count') return values.length;
  if (fn === 'countDistinct') return new Set(values.map((v) => cellText(v ?? null).toLowerCase())).size;
  if (fn === 'min' || fn === 'max') {
    if (values.length === 0) return null;
    return values.reduce((a, b) => ((compareCells(a, b) <= 0) === (fn === 'min') ? a : b)) ?? null;
  }
  const nums = values.map(asNumber).filter((n): n is number => n !== undefined);
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return fn === 'sum' ? round(sum) : round(sum / nums.length);
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

// ---- Edits (applied by the service; the UI applies the same function optimistically) ----

export const DatasetEdit = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('setCell'), row: RowId, column: ColumnId, value: Cell }),
  z.strictObject({
    op: z.literal('addRow'),
    cells: z.record(ColumnId, Cell).optional(),
    /** Insert before this row id (default: at the end). */
    before: RowId.optional(),
  }),
  z.strictObject({ op: z.literal('deleteRows'), rows: z.array(RowId).min(1).max(1000) }),
  z.strictObject({
    op: z.literal('addColumn'),
    name: z.string().trim().min(1).max(100),
    type: ColumnType.optional(),
    options: z.array(z.string().max(100)).max(50).optional(),
  }),
  z.strictObject({ op: z.literal('renameColumn'), column: ColumnId, name: z.string().trim().min(1).max(100) }),
  z.strictObject({
    op: z.literal('setColumnType'),
    column: ColumnId,
    type: ColumnType,
    options: z.array(z.string().max(100)).max(50).optional(),
  }),
  z.strictObject({ op: z.literal('deleteColumn'), column: ColumnId }),
  z.strictObject({ op: z.literal('rename'), name: z.string().trim().min(1).max(DATASET_LIMITS.name) }),
]);
export type DatasetEdit = z.infer<typeof DatasetEdit>;

/** Distinct column name: `Name`, then `Name 2`… */
function uniqueName(ds: Pick<Dataset, 'columns'>, name: string): string {
  const taken = new Set(ds.columns.map((c) => c.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const n = `${name} ${i}`;
    if (!taken.has(n.toLowerCase())) return n;
  }
}

const rowIdOf = (n: number) => `r${n}`;

/** Apply one edit to a dataset (a new dataset; `rev` + 1). Throws DatasetError for an edit that does not fit. */
export function applyEdit(ds: Dataset, edit: DatasetEdit, by: DatasetRow['by'], now = Date.now()): Dataset {
  const next: Dataset = { ...ds, rev: ds.rev + 1, updatedAt: now };
  switch (edit.op) {
    case 'rename':
      next.name = edit.name;
      break;
    case 'setCell': {
      const col = ds.columns.find((c) => c.id === edit.column);
      if (!col) throw new DatasetError(`no column ${edit.column}`);
      let found = false;
      next.rows = ds.rows.map((r) => {
        if (r.id !== edit.row) return r;
        found = true;
        return { ...r, cells: { ...r.cells, [col.id]: coerceCell(col, edit.value) }, by: r.by === 'user' ? 'user' : by };
      });
      if (!found) throw new DatasetError(`no row ${edit.row}`);
      break;
    }
    case 'addRow': {
      if (ds.rows.length >= DATASET_LIMITS.rows) throw new DatasetError(`a dataset holds at most ${DATASET_LIMITS.rows} rows`);
      const cells: Record<string, Cell> = {};
      for (const [k, v] of Object.entries(edit.cells ?? {})) {
        const col = ds.columns.find((c) => c.id === k);
        if (!col) throw new DatasetError(`no column ${k}`);
        cells[k] = coerceCell(col, v);
      }
      const row: DatasetRow = { id: rowIdOf(ds.nextRow), cells, by };
      next.nextRow = ds.nextRow + 1;
      const at = edit.before ? ds.rows.findIndex((r) => r.id === edit.before) : -1;
      next.rows = at === -1 ? [...ds.rows, row] : [...ds.rows.slice(0, at), row, ...ds.rows.slice(at)];
      break;
    }
    case 'deleteRows': {
      const gone = new Set(edit.rows);
      next.rows = ds.rows.filter((r) => !gone.has(r.id));
      break;
    }
    case 'addColumn': {
      if (ds.columns.length >= DATASET_LIMITS.columns) throw new DatasetError(`a dataset holds at most ${DATASET_LIMITS.columns} columns`);
      const col: DatasetColumn = {
        id: `k${ds.nextCol}`,
        name: uniqueName(ds, edit.name),
        type: edit.type ?? 'text',
        ...(edit.options ? { options: edit.options } : {}),
      };
      next.columns = [...ds.columns, col];
      next.nextCol = ds.nextCol + 1;
      break;
    }
    case 'renameColumn': {
      if (!ds.columns.some((c) => c.id === edit.column)) throw new DatasetError(`no column ${edit.column}`);
      const others = { columns: ds.columns.filter((c) => c.id !== edit.column) };
      next.columns = ds.columns.map((c) => (c.id === edit.column ? { ...c, name: uniqueName(others, edit.name) } : c));
      break;
    }
    case 'setColumnType': {
      const col = ds.columns.find((c) => c.id === edit.column);
      if (!col) throw new DatasetError(`no column ${edit.column}`);
      const changed: DatasetColumn = { id: col.id, name: col.name, type: edit.type, ...(edit.type === 'select' ? { options: edit.options ?? distinct(ds, col.id) } : {}) };
      next.columns = ds.columns.map((c) => (c.id === col.id ? changed : c));
      next.rows = ds.rows.map((r) => (col.id in r.cells ? { ...r, cells: { ...r.cells, [col.id]: coerceCell(changed, r.cells[col.id]) } } : r));
      break;
    }
    case 'deleteColumn': {
      if (ds.columns.length <= 1) throw new DatasetError('a dataset needs at least one column');
      if (!ds.columns.some((c) => c.id === edit.column)) throw new DatasetError(`no column ${edit.column}`);
      next.columns = ds.columns.filter((c) => c.id !== edit.column);
      next.rows = ds.rows.map((r) => {
        if (!(edit.column in r.cells)) return r;
        const { [edit.column]: _gone, ...cells } = r.cells;
        return { ...r, cells };
      });
      break;
    }
  }
  return next;
}

function distinct(ds: Pick<Dataset, 'rows'>, column: string): string[] {
  const seen = new Set<string>();
  for (const r of ds.rows) {
    const t = cellText(r.cells[column]);
    if (t) seen.add(t.slice(0, 100));
    if (seen.size >= 50) break;
  }
  return [...seen];
}

// ---- Upserts (agents, and the import of rows into an existing dataset) ----

export const UpsertRow = z.strictObject({
  /** Update this row (id from `query_dataset`). */
  rowId: RowId.optional(),
  /** Values by column name (or id). */
  values: z.record(z.string().max(100), Cell),
});
export type UpsertRow = z.infer<typeof UpsertRow>;

export type UpsertResult = { dataset: Dataset; added: string[]; updated: string[]; skipped: { index: number; reason: string }[];
  removed?: string[]; removalSkipped?: { rowId: string; reason: string }[] };

/**
 * Upsert rows as `by` writes them: a row with `rowId` is updated; otherwise, when `key` names a column, the row whose
 * value in it equals the given one is updated; otherwise a row is added. A row the user wrote is never overwritten by
 * an agent (it is skipped with a reason), and `scout`, `critic` and `builder` change only rows they wrote
 * themselves. Unknown columns are refused. At most DATASET_LIMITS.upsert rows.
 */
export function upsertRows(
  ds: Dataset,
  rows: readonly UpsertRow[],
  options: { by: DatasetRow['by']; key?: string; removeIds?: readonly string[] },
  now = Date.now(),
): UpsertResult {
  if (rows.length > DATASET_LIMITS.upsert)
    throw new DatasetError(`upsert at most ${DATASET_LIMITS.upsert} rows per call`);
  if ((options.removeIds?.length ?? 0) > DATASET_LIMITS.upsert)
    throw new DatasetError(`remove at most ${DATASET_LIMITS.upsert} rows per call`);
  const remove = new Set(options.removeIds ?? []);
  if (rows.some(r => r.rowId && remove.has(r.rowId)))
    throw new DatasetError('a row cannot be updated and removed in the same call; merge into the surviving row first');
  const removed: string[] = [];
  const removalSkipped: NonNullable<UpsertResult['removalSkipped']> = [];
  for (const id of remove) {
    const row = ds.rows.find(r => r.id === id);
    const reason = !row ? `no row ${id}` : options.by !== 'user' && row.by === 'user'
      ? 'the user wrote this row; agents do not remove it'
      : options.by !== 'user' && options.by !== 'orb' && row.by !== options.by
        ? `${options.by} removes only its own rows` : undefined;
    if (reason) removalSkipped.push({ rowId: id, reason }); else removed.push(id);
  }
  const removal = options.removeIds ? { removed, removalSkipped } : {};
  const keyCol = options.key ? needColumn(ds, options.key) : undefined;
  const next = ds.rows.filter(r => !removed.includes(r.id));
  const byId = new Map(next.map((r, i) => [r.id, i]));
  const added: string[] = [];
  const updated: string[] = [];
  const skipped: UpsertResult['skipped'] = [];
  let nextRow = ds.nextRow;
  const keyIndex = new Map<string, number>();
  if (keyCol) next.forEach((r, i) => keyIndex.set(cellText(r.cells[keyCol.id] ?? null).toLowerCase(), i));

  for (const [index, input] of rows.entries()) {
    const cells: Record<string, Cell> = {};
    for (const [ref, value] of Object.entries(input.values)) {
      const col = findColumn(ds, ref);
      if (!col)
        throw new DatasetError(
          `row ${index}: no column ${JSON.stringify(ref)}; the columns are ${ds.columns.map((c) => JSON.stringify(c.name)).join(', ')}`,
        );
      cells[col.id] = coerceCell(col, value);
    }
    let at: number | undefined;
    if (input.rowId) {
      at = byId.get(input.rowId);
      if (at === undefined) {
        skipped.push({ index, reason: `no row ${input.rowId}` });
        continue;
      }
    } else if (keyCol) {
      const k = cellText(cells[keyCol.id] ?? null).toLowerCase();
      if (k === '') {
        skipped.push({ index, reason: `the key column ${JSON.stringify(keyCol.name)} has no value` });
        continue;
      }
      at = keyIndex.get(k);
    }
    if (at !== undefined) {
      const old = next[at]!;
      if (options.by !== 'user' && old.by === 'user') {
        skipped.push({ index, reason: `row ${old.id} was written by the user; agents do not change it` });
        continue;
      }
      if ((options.by === 'scout' || options.by === 'critic' || options.by === 'builder') && old.by !== options.by) {
        skipped.push({ index, reason: `row ${old.id} was written by ${old.by}; ${options.by} changes only its own rows` });
        continue;
      }
      if (Object.entries(cells).every(([id, value]) => JSON.stringify(old.cells[id] ?? null) === JSON.stringify(value))) continue;
      next[at] = { ...old, cells: { ...old.cells, ...cells } };
      updated.push(old.id);
    } else {
      if (next.length >= DATASET_LIMITS.rows) {
        skipped.push({ index, reason: `a dataset holds at most ${DATASET_LIMITS.rows} rows` });
        continue;
      }
      const row: DatasetRow = { id: rowIdOf(nextRow++), cells, by: options.by };
      next.push(row);
      added.push(row.id);
      byId.set(row.id, next.length - 1);
      if (keyCol) keyIndex.set(cellText(cells[keyCol.id] ?? null).toLowerCase(), next.length - 1);
    }
  }
  if (added.length === 0 && updated.length === 0 && removed.length === 0) return { dataset: ds, added, updated, skipped, ...removal };
  return { dataset: { ...ds, rows: next, nextRow, rev: ds.rev + 1, updatedAt: now }, added, updated, skipped, ...removal };
}

// ---- Import (CSV, JSON, pasted text, and rows from XLSX) ----

/** Guess a column's type from its non-empty values. */
export function inferColumn(values: readonly unknown[]): { type: ColumnType; options?: string[] } {
  const filled = values.filter((v) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === ''));
  if (filled.length === 0) return { type: 'text' };
  const all = (test: (v: unknown) => boolean) => filled.every(test);
  if (all((v) => typeof v === 'boolean' || (typeof v === 'string' && /^(true|false|yes|no)$/i.test(v.trim())))) {
    return { type: 'checkbox' };
  }
  if (all((v) => typeof v === 'number' || v instanceof Date === false && typeof v === 'string' && NUM.test(v.trim().replace(/^[$€£]/, '').replace(/%$/, '').replace(/,(?=\d{3}\b)/g, ''))))
    return { type: 'number' };
  if (all((v) => v instanceof Date || (typeof v === 'string' && ISO_DATE.test(v.trim())))) return { type: 'date' };
  if (all((v) => typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim()))) return { type: 'url' };
  const texts = filled.map((v) => String(v).trim());
  const distinctValues = [...new Set(texts)];
  if (filled.length >= 6 && distinctValues.length <= 8 && distinctValues.every((v) => v.length <= 40) && filled.length / distinctValues.length >= 2) {
    return { type: 'select', options: distinctValues };
  }
  return { type: 'text' };
}

/** A dataset from a header and rows of raw values (strings, numbers, booleans, dates). The id is the caller's. */
export function datasetFromRows(
  id: string,
  name: string,
  header: readonly unknown[],
  rawRows: readonly (readonly unknown[])[],
  now = Date.now(),
): { dataset: Dataset; truncated: boolean } {
  const width = Math.min(Math.max(header.length, ...rawRows.slice(0, 200).map((r) => r.length), 1), DATASET_LIMITS.columns);
  const names: string[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < width; i++) {
    let base = String(header[i] ?? '').trim().slice(0, 100) || `Column ${i + 1}`;
    for (let n = 2; taken.has(base.toLowerCase()); n++) base = `${String(header[i] ?? '').trim().slice(0, 90) || `Column ${i + 1}`} ${n}`;
    taken.add(base.toLowerCase());
    names.push(base);
  }
  const kept = rawRows.filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''));
  const truncated = kept.length > DATASET_LIMITS.rows;
  const body = kept.slice(0, DATASET_LIMITS.rows);
  const columns: DatasetColumn[] = names.map((n, i) => {
    const t = inferColumn(body.map((r) => r[i]));
    return { id: `k${i + 1}`, name: n, type: t.type, ...(t.options ? { options: t.options } : {}) };
  });
  const rows: DatasetRow[] = body.map((r, n) => {
    const cells: Record<string, Cell> = {};
    columns.forEach((col, i) => {
      const v = coerceCell(col, r[i]);
      if (v !== null) cells[col.id] = v;
    });
    return { id: rowIdOf(n + 1), cells, by: 'user' };
  });
  return {
    dataset: {
      v: 1,
      id: id as DatasetId,
      name: (name.trim() || 'Untitled data').slice(0, DATASET_LIMITS.name),
      columns,
      rows,
      rev: 1,
      nextCol: columns.length + 1,
      nextRow: rows.length + 1,
      updatedAt: now,
    },
    truncated,
  };
}

export type ImportFormat = 'csv' | 'json' | 'xlsx' | 'text';

/** The import format of a file name / MIME type, or undefined. */
export function importFormatOf(name: string, mime = ''): ImportFormat | undefined {
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase();
  const m = mime.split(';', 1)[0]!.trim().toLowerCase();
  if (ext === 'xlsx' || m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (ext === 'json' || m === 'application/json') return 'json';
  if (ext === 'csv' || ext === 'tsv' || m === 'text/csv' || m === 'text/tab-separated-values') return 'csv';
  if (ext === 'txt' || m === 'text/plain') return 'text';
  return undefined;
}

/** Rows of a JSON value: an array of objects, an array of arrays, or `{columns, rows}`. */
export function rowsFromJson(value: unknown): { header: string[]; rows: unknown[][] } {
  const cellOf = (v: unknown): unknown => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
  let list: unknown = value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.columns) && Array.isArray(o.rows)) {
      const header = o.columns.map((c) => String(c));
      return { header, rows: (o.rows as unknown[]).map((r) => (Array.isArray(r) ? r.map(cellOf) : header.map((h) => cellOf((r as Record<string, unknown>)?.[h])))) };
    }
    // an object holding one array of records ({"items": [...]})
    const arrays = Object.values(o).filter((v) => Array.isArray(v));
    if (arrays.length === 1) list = arrays[0];
    else list = [o];
  }
  if (!Array.isArray(list) || list.length === 0) throw new DatasetError('the JSON has no rows');
  if (list.every((r) => Array.isArray(r))) {
    const [first, ...rest] = list as unknown[][];
    return { header: first!.map((c) => String(c ?? '')), rows: rest.map((r) => r.map(cellOf)) };
  }
  const header: string[] = [];
  for (const r of list.slice(0, 500)) {
    if (r && typeof r === 'object' && !Array.isArray(r)) for (const k of Object.keys(r)) if (!header.includes(k)) header.push(k);
  }
  if (header.length === 0) throw new DatasetError('the JSON rows have no fields');
  return {
    header,
    rows: list.map((r) => header.map((h) => cellOf(r && typeof r === 'object' ? (r as Record<string, unknown>)[h] : undefined))),
  };
}

/** Rows of CSV / TSV text (the first line is the header). */
export function rowsFromCsv(text: string): { header: string[]; rows: string[][] } {
  const all = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (all.length === 0) throw new DatasetError('the data has no rows');
  return { header: all[0]!, rows: all.slice(1) };
}

/** A dataset from pasted or file text: JSON when it parses as an object or array, otherwise CSV / TSV. */
export function datasetFromText(
  id: string,
  name: string,
  text: string,
  format: 'csv' | 'json' | 'text' = 'text',
  now = Date.now(),
): { dataset: Dataset; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed === '') throw new DatasetError('the data is empty');
  const asJson = format === 'json' || (format === 'text' && /^[[{]/.test(trimmed));
  if (asJson) {
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      if (format === 'json') throw new DatasetError('the file is not valid JSON');
    }
    if (value !== undefined) {
      const { header, rows } = rowsFromJson(value);
      return datasetFromRows(id, name, header, rows, now);
    }
  }
  const { header, rows } = rowsFromCsv(trimmed);
  return datasetFromRows(id, name, header, rows, now);
}

/** A dataset from a Table card (its held rows; the caller passes the full rows when it has read the CSV). */
export function datasetFromTable(
  id: string,
  table: { title: string; columns: readonly string[]; rows: readonly (readonly string[])[] },
  now = Date.now(),
): { dataset: Dataset; truncated: boolean } {
  return datasetFromRows(id, table.title, table.columns, table.rows, now);
}

// ---- Search digest and description ----

/** The text of a dataset that search indexes: its name, column names, then the rows as lines. */
export function datasetDigest(ds: Pick<Dataset, 'name' | 'columns' | 'rows'>, max: number = DATASET_LIMITS.digest): string {
  const lines = [ds.name, ds.columns.map((c) => c.name).join(' ')];
  let size = lines[0]!.length + lines[1]!.length;
  for (const row of ds.rows) {
    const line = ds.columns.map((c) => cellText(row.cells[c.id])).filter(Boolean).join(' ');
    size += line.length + 1;
    if (size > max) break;
    lines.push(line);
  }
  return lines.join('\n').slice(0, max);
}

/** One line for agents: the dataset's name, size, and columns with their types. */
export function datasetSummary(ds: Pick<Dataset, 'name' | 'columns' | 'rows'>): string {
  const cols = ds.columns.map((c) => `${c.name} (${c.type}${c.options ? `: ${c.options.slice(0, 6).join('/')}` : ''})`).join(', ');
  return `${ds.rows.length} row${ds.rows.length === 1 ? '' : 's'}; columns: ${cols}`;
}

// ---- Routes (orb-host `/api/orb-data/*`, behind the gateway's auth cookie) ----

/** `POST ?canvas=&name=&format=` with the file's bytes (or pasted text): makes a dataset. */
export const DATA_IMPORT_PATH = '/api/orb-data/import';
/** `GET ?canvas=&id=`: the whole dataset as JSON. */
export const DATA_READ_PATH = '/api/orb-data/dataset';
/** `POST ?canvas=&id=` with `{edit}`: one `DatasetEdit`. */
export const DATA_EDIT_PATH = '/api/orb-data/edit';
/** `POST ?canvas=&card=`: the dataset, card data and view for turning a Table card into a Database card. */
export const DATA_PROMOTE_PATH = '/api/orb-data/from-table';

export const DatasetMetaResult = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    dataset: z.object({
      id: DatasetId,
      name: z.string(),
      rowCount: z.number(),
      columns: z.number(),
      rev: z.number(),
      truncated: z.boolean(),
      sheet: z.string().optional(),
    }),
  }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
]);
export type DatasetMetaResult = z.infer<typeof DatasetMetaResult>;

export const DatasetEditResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), rev: z.number(), rowCount: z.number() }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
]);
export type DatasetEditResult = z.infer<typeof DatasetEditResult>;

export const DatasetPromoteResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: DatabaseData, view: CardView, truncated: z.boolean() }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
]);
export type DatasetPromoteResult = z.infer<typeof DatasetPromoteResult>;
