/**
 * Datasets (P6.3): the canvas service's half of Database cards and attached dataset views.
 *
 * A dataset is `<canvas>/assets/data/<datasetId>.json` (shared `Dataset`), plus `<datasetId>.txt`, a plain-text
 * digest that the search index reads synchronously. Only this module writes them: a user's import and edits come in
 * through orb-host's `/api/orb-data/*` routes, an agent's through the `query_dataset` / `upsert_rows` tools; neither
 * touches the files. `board.jsonl` holds the card events that reference a dataset (a Database card's data, `Card.view`).
 *
 * Every write bumps the dataset's `rev` and then patches the cards that show it (their row count, preview and `rev`),
 * with a `card.updated` that is NOT on the user's undo stack (a dataset edit is not a board edit; undoing a board
 * action never rolls rows back). Writes to one dataset are serialised.
 *
 * XLSX is parsed with `read-excel-file` 9.3.12 (exact-pinned, maintained, `npm audit` clean, pure JS on fflate; the
 * `node` entry takes a Buffer). Formulas are read as their cached values; only the first non-empty sheet is imported.
 */
import { mkdir, open as openFile, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import {
  DATASET_LIMITS,
  Dataset,
  DatasetError,
  databaseDataOf,
  datasetDigest,
  datasetFromRows,
  datasetFromText,
  importFormatOf,
  applyEdit,
  coerceCell,
  upsertRows,
  newCardView,
  type AgentName,
  type BoardChange,
  type BoardState,
  type Actor,
  type Card,
  type Cell,
  type DatasetColumn,
  type DatasetEdit,
  type DatasetRow,
  type ImportFormat,
  type UpsertResult,
  type UpsertRow,
  OrbErrorCode,
  readCardData,
  rowsFromCsv,
  DatabaseData,
  ChartData,
  chartPoints,
  plotTableOfDataset,
} from '@orb/shared';
import { CanvasError } from './errors.js';

export const DATA_DIR = join('assets', 'data');

/** The most bytes of an import file (XLSX, JSON, CSV or text). */
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;

const bad = (message: string, details: Record<string, unknown> = {}) =>
  new CanvasError(OrbErrorCode.invalidArgs, message, details);

/** What the dataset service needs from the canvas service. */
export type DatasetHost = {
  dirOf(canvasId: string): string;
  open(canvasId: string): Promise<unknown>;
  /** The open board of a canvas: its folded state and a way to append changes outside the undo stack. */
  board(canvasId: string): Promise<{
    current: BoardState;
    appendAll(changes: readonly BoardChange[], actor: Actor): unknown;
  }>;
  mintId(): string;
  now(): number;
};

const roleOf = (actor: Actor): DatasetRow['by'] => (actor.kind === 'user' ? 'user' : (actor.agent as AgentName));

/** Rows of an XLSX file: the first sheet that has any (read-excel-file; cached formula results). */
async function rowsFromXlsx(bytes: Uint8Array): Promise<{ header: unknown[]; rows: unknown[][]; sheet: string }> {
  const { default: readXlsx } = await import('read-excel-file/node');
  let sheets;
  try {
    sheets = await readXlsx(Buffer.from(bytes));
  } catch (err) {
    throw bad(`the file is not a readable XLSX workbook (${(err as Error)?.message ?? 'unreadable'})`);
  }
  const first = sheets.find((s) => s.data.some((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== '')));
  if (!first) throw bad('the workbook has no data');
  const [header = [], ...rows] = first.data.filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''));
  return { header: header as unknown[], rows: rows as unknown[][], sheet: first.sheet };
}

export type ImportInput = {
  /** File name (display, and the format when `format` is absent) or a title for pasted data. */
  name: string;
  /** Declared MIME type, when known. */
  mime?: string;
  format?: ImportFormat;
  /** The bytes of a file, or the pasted text. */
  bytes?: Uint8Array;
  text?: string;
};

export type DatasetMeta = { id: string; name: string; rowCount: number; columns: number; rev: number; truncated: boolean; sheet?: string };

export class DatasetService {
  /** Parsed datasets by `<canvas>/<id>` (the sidecar is the only writer, so the cache is never stale). */
  private readonly cache = new Map<string, Dataset>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly host: DatasetHost) {}

  private file(canvasId: string, id: string): string {
    return join(this.host.dirOf(canvasId), DATA_DIR, `${id}.json`);
  }

  private key(canvasId: string, id: string): string {
    return `${canvasId}/${id}`;
  }

  /** Run `job` after the earlier writes to the same dataset. */
  private serial<T>(canvasId: string, id: string, job: () => Promise<T>): Promise<T> {
    const k = this.key(canvasId, id);
    const run = (this.queues.get(k) ?? Promise.resolve()).then(job, job);
    this.queues.set(
      k,
      run.catch(() => undefined),
    );
    return run;
  }

  /** The dataset (a copy-safe parsed value: callers must not mutate it). Throws `orb/not-found`. */
  async read(canvasId: string, id: string): Promise<Dataset> {
    await this.host.open(canvasId);
    if (!/^d_[A-Za-z0-9]{8,40}$/.test(id)) throw bad('invalid dataset id');
    const k = this.key(canvasId, id);
    const hit = this.cache.get(k);
    if (hit) return hit;
    let text: string;
    try {
      text = await readFile(this.file(canvasId, id), 'utf8');
    } catch {
      throw new CanvasError(OrbErrorCode.notFound, `no dataset ${id} on this canvas`, { datasetId: id });
    }
    const parsed = Dataset.safeParse(JSON.parse(text));
    if (!parsed.success) throw new CanvasError(OrbErrorCode.notFound, `dataset ${id} is damaged`, { datasetId: id });
    this.remember(k, parsed.data);
    return parsed.data;
  }

  /** True when the dataset exists. */
  async exists(canvasId: string, id: string): Promise<boolean> {
    try {
      await this.read(canvasId, id);
      return true;
    } catch {
      return false;
    }
  }

  private remember(k: string, ds: Dataset): void {
    this.cache.delete(k);
    this.cache.set(k, ds);
    while (this.cache.size > 12) this.cache.delete(this.cache.keys().next().value as string);
  }

  /** Write the dataset file (atomically) and its search digest. */
  private async write(canvasId: string, ds: Dataset): Promise<void> {
    const text = JSON.stringify(ds);
    if (Buffer.byteLength(text) > DATASET_LIMITS.bytes)
      throw new CanvasError(OrbErrorCode.tooLarge, 'the dataset is larger than 20 MB', { max: DATASET_LIMITS.bytes });
    const dir = join(this.host.dirOf(canvasId), DATA_DIR);
    await mkdir(dir, { recursive: true });
    const tmp = join(dir, `.write-${randomBytes(8).toString('hex')}.tmp`);
    const fh = await openFile(tmp, 'wx', 0o644);
    try {
      await fh.writeFile(text);
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(tmp, this.file(canvasId, ds.id));
    await writeFile(join(dir, `${ds.id}.txt`), datasetDigest(ds));
    this.remember(this.key(canvasId, ds.id), ds);
  }

  /** The search digest of a dataset (synchronous; empty when there is none). */
  digestSync(canvasId: string, id: string): string {
    try {
      return readFileSync(join(this.host.dirOf(canvasId), DATA_DIR, `${id}.txt`), 'utf8');
    } catch {
      return '';
    }
  }

  private newId(): string {
    return `d_${this.host.mintId()}`;
  }

  /** Create a dataset from a file or pasted data. Returns its identity (no card is made). */
  async import(canvasId: string, input: ImportInput, actor: Actor = { kind: 'user' }): Promise<DatasetMeta> {
    await this.host.open(canvasId);
    const id = this.newId();
    const format = input.format ?? importFormatOf(input.name, input.mime) ?? 'text';
    const name = input.name.replace(/\.[A-Za-z0-9]+$/, '').trim() || 'Untitled data';
    const size = input.bytes?.byteLength ?? Buffer.byteLength(input.text ?? '');
    if (size === 0) throw bad('the data is empty');
    if (size > IMPORT_MAX_BYTES)
      throw new CanvasError(OrbErrorCode.tooLarge, `the file is larger than ${IMPORT_MAX_BYTES / (1024 * 1024)} MB`, {
        max: IMPORT_MAX_BYTES,
      });
    let made: { dataset: Dataset; truncated: boolean };
    let sheet: string | undefined;
    try {
      if (format === 'xlsx') {
        if (!input.bytes) throw bad('an XLSX import needs the file');
        const x = await rowsFromXlsx(input.bytes);
        sheet = x.sheet;
        made = datasetFromRows(id, name, x.header, x.rows, this.host.now());
      } else {
        const text = input.text ?? new TextDecoder('utf-8', { fatal: false }).decode(input.bytes);
        made = datasetFromText(id, name, text, format === 'csv' || format === 'json' ? format : 'text', this.host.now());
      }
    } catch (err) {
      if (err instanceof CanvasError) throw err;
      if (err instanceof DatasetError || (err as Error)?.name === 'DatasetError') throw bad((err as Error).message);
      throw err;
    }
    // Rows the importer wrote are the user's, unless an agent imported them.
    const by = roleOf(actor);
    const dataset: Dataset = by === 'user' ? made.dataset : { ...made.dataset, rows: made.dataset.rows.map((r) => ({ ...r, by })) };
    await this.serial(canvasId, id, () => this.write(canvasId, dataset));
    return {
      id,
      name: dataset.name,
      rowCount: dataset.rows.length,
      columns: dataset.columns.length,
      rev: dataset.rev,
      truncated: made.truncated,
      ...(sheet ? { sheet } : {}),
    };
  }

  /** Create a dataset from columns and rows an agent (or a Table promote) supplies. */
  async create(
    canvasId: string,
    name: string,
    columns: readonly string[],
    rows: readonly (readonly unknown[])[],
    actor: Actor = { kind: 'user' },
  ): Promise<{ dataset: Dataset; truncated: boolean }> {
    await this.host.open(canvasId);
    const id = this.newId();
    const made = datasetFromRows(id, name, columns, rows, this.host.now());
    const by = roleOf(actor);
    const dataset: Dataset = by === 'user' ? made.dataset : { ...made.dataset, rows: made.dataset.rows.map((r) => ({ ...r, by })) };
    await this.serial(canvasId, id, () => this.write(canvasId, dataset));
    return { dataset, truncated: made.truncated };
  }

  /**
   * P6.11: create a dataset with a declared schema (a template's databases: typed columns, select options, optional
   * starting rows). Returns the dataset; no card is made.
   */
  async createFromSchema(
    canvasId: string,
    name: string,
    columns: readonly { name: string; type: DatasetColumn['type']; options?: readonly string[] | undefined }[],
    rows: readonly (readonly unknown[])[] = [],
    actor: Actor = { kind: 'user' },
  ): Promise<Dataset> {
    await this.host.open(canvasId);
    const by = roleOf(actor);
    const cols: DatasetColumn[] = columns.map((c, i) => ({
      id: `k${i + 1}`,
      name: c.name,
      type: c.type,
      ...(c.type === 'select' && c.options?.length ? { options: [...c.options] } : {}),
    }));
    const dataset: Dataset = {
      v: 1,
      id: this.newId() as Dataset['id'],
      name: name.trim().slice(0, DATASET_LIMITS.name) || 'Untitled data',
      columns: cols,
      rows: rows.map((r, n) => {
        const cells: Record<string, Cell> = {};
        cols.forEach((col, i) => {
          const v = coerceCell(col, r[i]);
          if (v !== null) cells[col.id] = v;
        });
        return { id: `r${n + 1}`, cells, by };
      }),
      rev: 1,
      nextCol: cols.length + 1,
      nextRow: rows.length + 1,
      updatedAt: this.host.now(),
    };
    Dataset.parse(dataset);
    await this.serial(canvasId, dataset.id, () => this.write(canvasId, dataset));
    return dataset;
  }

  /** Remove a dataset that no card took (a card that failed to be placed). */
  async discard(canvasId: string, id: string): Promise<void> {
    this.cache.delete(this.key(canvasId, id));
    const dir = join(this.host.dirOf(canvasId), DATA_DIR);
    await rm(join(dir, `${id}.json`), { force: true });
    await rm(join(dir, `${id}.txt`), { force: true });
  }

  /** Apply one edit. Returns the new dataset; the cards that show it are updated. */
  async edit(canvasId: string, id: string, edit: DatasetEdit, actor: Actor = { kind: 'user' }): Promise<Dataset> {
    return this.serial(canvasId, id, async () => {
      const ds = await this.read(canvasId, id);
      let next: Dataset;
      try {
        next = applyEdit(ds, edit, roleOf(actor), this.host.now());
      } catch (err) {
        if ((err as Error)?.name === 'DatasetError') throw bad((err as Error).message, { datasetId: id });
        throw err;
      }
      await this.write(canvasId, next);
      await this.sync(canvasId, next, actor);
      return next;
    });
  }

  /** Upsert rows as `actor` (role-checked per row by `upsertRows`). */
  async upsert(
    canvasId: string,
    id: string,
    rows: readonly UpsertRow[],
    options: { key?: string; removeIds?: readonly string[] },
    actor: Actor,
  ): Promise<UpsertResult> {
    return this.serial(canvasId, id, async () => {
      const ds = await this.read(canvasId, id);
      let result: UpsertResult;
      try {
        result = upsertRows(ds, rows, { ...options, by: roleOf(actor) }, this.host.now());
      } catch (err) {
        if ((err as Error)?.name === 'DatasetError') throw bad((err as Error).message, { datasetId: id });
        throw err;
      }
      if (result.dataset !== ds) {
        await this.write(canvasId, result.dataset);
        await this.sync(canvasId, result.dataset, actor);
      }
      return result;
    });
  }

  /**
   * Patch every card that shows `ds` (a Database card's data; a card's `view`) so the board knows its new size and
   * `rev`. Appended outside the undo stack, and not through `planCommand` (an agent's rows may change a user's note
   * that has a view attached; the note's own text is untouched).
   */
  async sync(canvasId: string, ds: Dataset, actor: Actor): Promise<void> {
    const board = await this.host.board(canvasId);
    const changes: BoardChange[] = [];
    for (const card of Object.values(board.current.cards)) {
      const patch: Record<string, unknown> = {};
      if (card.type === 'database') {
        const data = readCardData(DatabaseData, card.data);
        if (data?.datasetId === ds.id) patch.data = databaseDataOf(data.title, ds);
      }
      if (card.view?.datasetId === ds.id) patch.view = { ...card.view, name: ds.name, rowCount: ds.rows.length, rev: ds.rev };
      if (Object.keys(patch).length > 0) changes.push({ type: 'card.updated', data: { id: card.id, patch } });
    }
    changes.push(...(await this.chartChanges(canvasId, board.current, ds)));
    if (changes.length > 0) board.appendAll(changes, actor);
  }

  /**
   * P6.4: the `card.updated` changes that bring every bound Chart's plotted `points` up to date: a chart bound to a
   * dataset (`only`: just that dataset, when its rows just changed) or to a Table card. Nothing is returned for a
   * chart whose points are already right, so calling this after every command costs no events.
   */
  async chartChanges(canvasId: string, state: BoardState, only?: Dataset): Promise<BoardChange[]> {
    const changes: BoardChange[] = [];
    for (const card of Object.values(state.cards)) {
      if (card.type !== 'chart') continue;
      const d = readCardData(ChartData, card.data);
      if (!d || d.source.kind === 'inline') continue;
      let table;
      let rev: number | undefined;
      let missing: string | undefined;
      if (d.source.kind === 'dataset') {
        if (only && only.id !== d.source.datasetId) continue;
        let ds: Dataset | undefined = only;
        if (!ds) ds = await this.read(canvasId, d.source.datasetId).catch(() => undefined);
        if (ds) {
          table = plotTableOfDataset(ds);
          rev = ds.rev;
        } else missing = `dataset ${d.source.datasetId} is gone`;
      } else {
        if (only) continue;
        const t = state.cards[d.source.cardId];
        const td = t?.type === 'table' ? (t.data as { columns?: string[]; rows?: string[][] }) : undefined;
        if (td?.columns && td.rows) table = { columns: td.columns, rows: td.rows };
        else missing = `table card ${d.source.cardId} is gone`;
      }
      const plot = table ? chartPoints(d, table) : { points: [], xType: d.xType ?? ('nominal' as const), problem: missing };
      const next: Record<string, unknown> = { ...(card.data as Record<string, unknown>), points: plot.points, xType: plot.xType };
      for (const [k, v] of [['rev', rev], ['problem', plot.problem], ['note', 'note' in plot ? plot.note : undefined]] as const) {
        if (v === undefined) delete next[k];
        else next[k] = v;
      }
      if (JSON.stringify(next) !== JSON.stringify(card.data)) changes.push({ type: 'card.updated', data: { id: card.id, patch: { data: next } } });
    }
    return changes;
  }

  /**
   * Dataset ids a card draft or patch names (a Database card's `datasetId`, a `view`), for the existence check that
   * runs before such a command is appended.
   */
  static referencedIds(card: { type?: string; data?: unknown; view?: { datasetId: string } | null | undefined }): string[] {
    const ids: string[] = [];
    if (card.type === 'database') {
      const id = (card.data as { datasetId?: unknown } | undefined)?.datasetId;
      if (typeof id === 'string') ids.push(id);
    }
    if (card.type === 'chart') {
      const src = (card.data as { source?: { kind?: unknown; datasetId?: unknown } } | undefined)?.source;
      if (src?.kind === 'dataset' && typeof src.datasetId === 'string') ids.push(src.datasetId);
    }
    if (card.view) ids.push(card.view.datasetId);
    return ids;
  }

  /**
   * Table to Database (P6.3): a dataset from the Table card (the whole stored CSV when it has one, else the rows it
   * holds). Returns the new card data and view; the caller makes the `card.updated` that changes the card's type.
   */
  async fromTable(
    canvasId: string,
    card: Card,
    readCsv: (path: string) => Promise<string | undefined>,
  ): Promise<{ data: DatabaseData; view: ReturnType<typeof newCardView>; truncated: boolean }> {
    if (card.type !== 'table') throw bad(`card ${card.id} is not a table`);
    const t = card.data as { title?: string; columns?: string[]; rows?: string[][]; asset?: { path: string } };
    const columns = t.columns ?? [];
    let rows: readonly (readonly unknown[])[] = t.rows ?? [];
    let header: readonly unknown[] = columns;
    if (t.asset) {
      const csv = await readCsv(t.asset.path);
      if (csv) {
        const parsed = rowsFromCsv(csv);
        header = parsed.header;
        rows = parsed.rows;
      }
    }
    const { dataset, truncated } = await this.create(canvasId, t.title || 'Table', header as string[], rows);
    return { data: databaseDataOf(t.title || 'Table', dataset), view: newCardView(dataset), truncated };
  }
}
