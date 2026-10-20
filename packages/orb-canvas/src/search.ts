/**
 * `<ORB_HOME>/index.sqlite`: the full-text index across all canvases behind Home search (BUILD_PLAN P2.6, PRD Local
 * storage › Search index). It is DERIVED data: board.jsonl stays the truth, and the index is safe to delete.
 *
 * - SQLite through `node:sqlite` (built into Node 24, so also into Electron-as-Node: no native module), FTS5 with
 *   the `unicode61` tokenizer (diacritics folded) and prefix matching.
 * - Incremental: the canvas service reports each appended event (`noteEvent`); the touched cards/frames are queued
 *   and written in one transaction at most `flushMs` later (and before every search), so the board writer never
 *   waits on SQLite.
 * - Catch-up and rebuild: before a search, `sync` compares every canvas with what the index recorded for it (the
 *   board's seq when it is open in memory, else the size of board.jsonl) and re-indexes the stale ones from the
 *   fold. When index.sqlite is missing (first run, or deleted), it is created and every canvas is indexed.
 */
import { existsSync, rmSync } from 'node:fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import {
  SEARCH_MARK_CLOSE,
  SEARCH_MARK_OPEN,
  cardText,
  type BoardEvent,
  type BoardState,
  type Card,
  type Frame,
  type SearchHit,
} from '@orb/shared';

export const INDEX_FILE = 'index.sqlite';
/** Bump when the schema or the indexed text changes: a different version rebuilds the index. */
export const INDEX_VERSION = 3;
/** The card text extraction is shared with the board's Cmd+F (packages/shared/src/search.ts). */
export { cardText };

/** What the index needs from the canvas service. */
export type IndexSource = {
  /** Every canvas on disk (id + title). */
  canvases(): Promise<{ id: string; title: string }[]>;
  /** The in-memory board of a canvas that is open, else undefined. */
  openBoard(id: string): BoardState | undefined;
  /** Size of board.jsonl in bytes (0 when missing). */
  logSize(id: string): Promise<number>;
  /** Fold board.jsonl read-only (for a canvas that is not open). */
  readBoard(id: string): Promise<BoardState>;
  /** P6.3: the search digest of a dataset (its name, columns and rows as text); empty when there is none. */
  datasetDigest?(canvasId: string, datasetId: string): string;
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');

type Row = {
  canvas_id: string;
  item_id: string;
  kind: 'card' | 'frame' | 'canvas';
  card_type: string;
  title: string;
  body: string;
};

/**
 * The FTS5 query for what the user typed: every word must match, the last one (and any word of 3+ characters) as a
 * prefix. Words are quoted, so FTS5 operators and punctuation in the input are plain text.
 */
export function ftsQuery(input: string): string | null {
  const words = input
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 16);
  if (words.length === 0) return null;
  return words.map((w) => `"${w.replace(/"/g, '""')}"*`).join(' ');
}

export type SearchIndexOptions = {
  /** Full path of index.sqlite. */
  path: string;
  source: IndexSource;
  /** Max delay before queued changes are written. Default 250 ms. */
  flushMs?: number;
  log?: (level: 'info' | 'warn' | 'error', message: string) => void;
};

export class SearchIndex {
  private db: DatabaseSync | null = null;
  private statements: Record<string, StatementSync> = {};
  /** Per canvas: the cards/frames to re-read from the open board, or 'all'. */
  private readonly dirty = new Map<string, Set<string> | 'all'>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private syncing: Promise<boolean> | null = null;
  private closed = false;
  /** How many full rebuilds (index file created) happened (tests, diagnostics). */
  rebuilds = 0;

  constructor(private readonly options: SearchIndexOptions) {}

  /** Record that an event was appended to an open board (called synchronously by the writer). */
  noteEvent(canvasId: string, event: BoardEvent): void {
    if (this.closed) return;
    const ids = this.touched(event);
    if (ids === null) return;
    const current = this.dirty.get(canvasId);
    if (current === 'all') return;
    if (ids === 'all') this.dirty.set(canvasId, 'all');
    else {
      const set = current ?? new Set<string>();
      for (const id of ids) set.add(id);
      this.dirty.set(canvasId, set);
    }
    this.schedule();
  }

  /** The canvas row changed (created, renamed): re-index it whole. */
  noteCanvas(canvasId: string): void {
    if (this.closed) return;
    this.dirty.set(canvasId, 'all');
    this.schedule();
  }

  /** Card/frame ids whose text may have changed; 'all' for a structural change; null when no text changed. */
  private touched(event: BoardEvent): string[] | 'all' | null {
    const d = event.data as Record<string, unknown>;
    switch (event.type) {
      case 'card.added':
        return [(d.card as Card).id];
      case 'frame.added':
        return [(d.frame as Frame).id];
      case 'card.updated':
      case 'frame.updated':
      case 'frame.removed':
        return [str(d.id)];
      case 'card.removed':
        return (d.ids as string[]) ?? 'all';
      case 'card.stacked':
        return 'all';
      default:
        return null; // moves, links, opened, viewport, markers: no searchable text
    }
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      try {
        this.flushDirty();
      } catch (err) {
        this.options.log?.('warn', `orb-canvas: search index update failed: ${String(err)}`);
      }
    }, this.options.flushMs ?? 250);
    this.timer.unref?.();
  }

  /** Open (or create) index.sqlite. Returns true when the file had to be created (a full rebuild follows). */
  private ensureOpen(): boolean {
    if (this.db && existsSync(this.options.path)) return false;
    let created = !existsSync(this.options.path);
    if (this.db) {
      // The file was deleted under us: drop the handle (it points at the unlinked inode) and start over.
      this.closeDb();
      created = true;
    }
    if (created) {
      // A journal left beside a deleted index must not be replayed into the new file.
      for (const suffix of ['-journal', '-wal', '-shm']) rmSync(this.options.path + suffix, { force: true });
    }
    let db: DatabaseSync;
    let version: number;
    try {
      db = new DatabaseSync(this.options.path);
      // WAL + NORMAL: commits do not fsync. The index is derived data; a damaged one is deleted and rebuilt.
      db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL');
      version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    } catch (err) {
      this.options.log?.('warn', `orb-canvas: search index unreadable (${String(err)}); rebuilding it`);
      for (const suffix of ['', '-journal', '-wal', '-shm'])
        rmSync(this.options.path + suffix, { force: true });
      db = new DatabaseSync(this.options.path);
      db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL');
      version = 0;
    }
    if (version !== INDEX_VERSION) {
      db.exec(`
        DROP TABLE IF EXISTS items;
        DROP TABLE IF EXISTS canvases;
        CREATE TABLE canvases (id TEXT PRIMARY KEY, title TEXT NOT NULL, seq INTEGER NOT NULL, log_size INTEGER NOT NULL);
        CREATE VIRTUAL TABLE items USING fts5(
          canvas_id UNINDEXED, item_id UNINDEXED, kind UNINDEXED, card_type UNINDEXED, title, body,
          tokenize = 'unicode61 remove_diacritics 2'
        );
        PRAGMA user_version = ${INDEX_VERSION};
      `);
      created = true;
    }
    this.db = db;
    this.statements = {
      deleteCanvasItems: db.prepare('DELETE FROM items WHERE canvas_id = ?'),
      deleteItem: db.prepare('DELETE FROM items WHERE canvas_id = ? AND item_id = ?'),
      insertItem: db.prepare(
        'INSERT INTO items (canvas_id, item_id, kind, card_type, title, body) VALUES (?, ?, ?, ?, ?, ?)',
      ),
      upsertCanvas: db.prepare(
        'INSERT INTO canvases (id, title, seq, log_size) VALUES (?, ?, ?, ?) ' +
          'ON CONFLICT(id) DO UPDATE SET title = excluded.title, seq = excluded.seq, log_size = excluded.log_size',
      ),
      setSeq: db.prepare('UPDATE canvases SET seq = ?, log_size = -1 WHERE id = ?'),
      setLogSize: db.prepare('UPDATE canvases SET log_size = ? WHERE id = ?'),
      canvasRows: db.prepare('SELECT id, title, seq, log_size FROM canvases'),
      deleteCanvas: db.prepare('DELETE FROM canvases WHERE id = ?'),
    };
    if (created) {
      this.rebuilds++;
      this.options.log?.('info', 'orb-canvas: search index created; indexing every canvas');
    }
    return created;
  }

  private closeDb(): void {
    this.statements = {};
    try {
      this.db?.close();
    } catch {
      // already closed
    }
    this.db = null;
  }

  private tx(run: () => void): void {
    const db = this.db!;
    db.exec('BEGIN');
    try {
      run();
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  private insertCard(canvasId: string, card: Card): void {
    const { title, body } = cardText(card);
    // P6.3: a card that shows a dataset is found by the dataset's rows too.
    const datasetId = card.view?.datasetId ?? (card.data as { datasetId?: unknown } | null)?.datasetId;
    const digest =
      typeof datasetId === 'string' && card.type === 'database'
        ? (this.options.source.datasetDigest?.(canvasId, datasetId) ?? '')
        : card.view
          ? (this.options.source.datasetDigest?.(canvasId, card.view.datasetId) ?? '')
          : '';
    this.statements.insertItem!.run(
      canvasId,
      card.id,
      'card',
      card.type,
      title,
      digest ? `${body}\n${digest}` : body,
    );
  }

  private insertFrame(canvasId: string, frame: Frame): void {
    this.statements.insertItem!.run(canvasId, frame.id, 'frame', '', frame.title, '');
  }

  /** Replace every row of one canvas from a folded board. */
  private writeCanvas(id: string, title: string, board: BoardState, logSize: number): void {
    const s = this.statements;
    this.tx(() => {
      s.deleteCanvasItems!.run(id);
      s.insertItem!.run(id, id, 'canvas', '', title, '');
      for (const frame of Object.values(board.frames)) this.insertFrame(id, frame);
      for (const card of Object.values(board.cards)) if (!card.stackedInto) this.insertCard(id, card);
      s.upsertCanvas!.run(id, title, board.seq, logSize);
    });
  }

  /**
   * Write the queued changes of open boards (synchronous; one transaction per canvas). Only into an index that is
   * already open: creating or rebuilding one is left to `sync` (a search, or the service's warm-up), so the board
   * writer's process never pays for a rebuild in an append's timer.
   */
  private flushDirty(): void {
    if (this.dirty.size === 0 || this.closed || !this.db || !existsSync(this.options.path)) return;
    const known = new Map(
      (this.statements.canvasRows!.all() as { id: string; title: string }[]).map((r) => [r.id, r.title]),
    );
    for (const [canvasId, ids] of [...this.dirty]) {
      const board = this.options.source.openBoard(canvasId);
      const title = known.get(canvasId);
      if (!board || title === undefined || ids === 'all') continue; // left for sync (needs the async source)
      this.dirty.delete(canvasId);
      this.tx(() => {
        for (const id of ids) {
          this.statements.deleteItem!.run(canvasId, id);
          const card = board.cards[id];
          const frame = board.frames[id];
          if (card && !card.stackedInto) this.insertCard(canvasId, card);
          else if (frame) this.insertFrame(canvasId, frame);
        }
        this.statements.setSeq!.run(board.seq, canvasId);
      });
    }
  }

  /**
   * Bring the index up to date with every canvas: create it if missing, re-index stale canvases, drop deleted ones.
   * Returns true when index.sqlite had to be (re)created. Concurrent calls share one run.
   */
  sync(): Promise<boolean> {
    this.syncing ??= this.syncOnce().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async syncOnce(): Promise<boolean> {
    if (this.closed) return false;
    const created = this.ensureOpen();
    this.flushDirty();
    const canvases = await this.options.source.canvases();
    // The file may have been deleted while we awaited: start again on a fresh one.
    const recreated = this.ensureOpen();
    const rows = new Map(
      (
        this.statements.canvasRows!.all() as { id: string; title: string; seq: number; log_size: number }[]
      ).map((r) => [r.id, r]),
    );
    for (const { id, title } of canvases) {
      const row = rows.get(id);
      rows.delete(id);
      const open = this.options.source.openBoard(id);
      const forced = this.dirty.get(id) === 'all';
      try {
        if (open) {
          if (forced || !row || row.title !== title || row.seq !== open.seq) {
            this.dirty.delete(id);
            this.writeCanvas(id, title, open, -1);
          }
          continue;
        }
        const size = await this.options.source.logSize(id);
        if (forced || !row || row.title !== title || row.log_size !== size) {
          this.dirty.delete(id);
          const board = await this.options.source.readBoard(id);
          if (this.closed) return created || recreated;
          this.ensureOpen();
          this.writeCanvas(id, title, board, size);
        }
      } catch (err) {
        this.options.log?.('warn', `orb-canvas: could not index canvas ${id}: ${String(err)}`);
      }
    }
    for (const id of rows.keys()) {
      this.tx(() => {
        this.statements.deleteCanvasItems!.run(id);
        this.statements.deleteCanvas!.run(id);
      });
    }
    return created || recreated;
  }

  /** Full-text search across all canvases, best matches first (titles weigh more than bodies). */
  async search(q: string, limit = 30): Promise<{ hits: SearchHit[]; rebuilt: boolean }> {
    const rebuilt = await this.sync();
    const match = ftsQuery(q);
    if (!match || !this.db) return { hits: [], rebuilt };
    const rows = this.db
      .prepare(
        `SELECT i.canvas_id, i.item_id, i.kind, i.card_type, i.title,
                snippet(items, -1, '${SEARCH_MARK_OPEN}', '${SEARCH_MARK_CLOSE}', '…', 12) AS snippet,
                c.title AS canvas_title
           FROM items i JOIN canvases c ON c.id = i.canvas_id
          WHERE items MATCH ?
          ORDER BY bm25(items, 0, 0, 0, 0, 4.0, 1.0)
          LIMIT ?`,
      )
      .all(match, limit) as (Row & { snippet: string; canvas_title: string })[];
    return {
      rebuilt,
      hits: rows.map((r) => ({
        canvasId: r.canvas_id,
        canvasTitle: r.canvas_title,
        kind: r.kind,
        itemId: r.item_id,
        ...(r.card_type ? { cardType: r.card_type } : {}),
        title: r.title,
        snippet: r.snippet,
      })),
    };
  }

  /**
   * P6.8 `search_board`: the matches inside ONE canvas, best first, with a snippet (marks stripped). Brings the index
   * up to date for this canvas first (its open board's queued changes; a full `sync` only when the canvas is not
   * indexed yet or changed in a way the queue does not track, like a stack).
   */
  async searchCanvas(
    canvasId: string,
    q: string,
    limit = 100,
  ): Promise<{ itemId: string; kind: string; cardType: string; title: string; snippet: string }[]> {
    this.ensureOpen();
    this.flushDirty();
    const row = (this.statements.canvasRows!.all() as { id: string; seq: number }[]).find(
      (r) => r.id === canvasId,
    );
    const open = this.options.source.openBoard(canvasId);
    if (!row || this.dirty.get(canvasId) === 'all' || (open && row.seq !== open.seq)) await this.sync();
    const match = ftsQuery(q);
    if (!match || !this.db) return [];
    const rows = this.db
      .prepare(
        `SELECT item_id, kind, card_type, title,
                snippet(items, -1, '${SEARCH_MARK_OPEN}', '${SEARCH_MARK_CLOSE}', '…', 24) AS snippet
           FROM items
          WHERE items MATCH ? AND canvas_id = ? AND kind = 'card'
          ORDER BY bm25(items, 0, 0, 0, 0, 4.0, 1.0)
          LIMIT ?`,
      )
      .all(match, canvasId, limit) as {
      item_id: string;
      kind: string;
      card_type: string;
      title: string;
      snippet: string;
    }[];
    return rows.map((r) => ({
      itemId: r.item_id,
      kind: r.kind,
      cardType: r.card_type,
      title: r.title,
      snippet: r.snippet.split(SEARCH_MARK_OPEN).join('«').split(SEARCH_MARK_CLOSE).join('»'),
    }));
  }

  /**
   * Flush queued changes and record the board.jsonl sizes of open boards (call after their logs were flushed), so
   * the next start sees them as current. Then close the database.
   */
  async close(logSizes: Map<string, { seq: number; size: number }> = new Map()): Promise<void> {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    try {
      if (this.db && existsSync(this.options.path)) {
        this.flushDirty();
        const rows = new Map(
          (this.statements.canvasRows!.all() as { id: string; seq: number }[]).map((r) => [r.id, r.seq]),
        );
        this.tx(() => {
          for (const [id, { seq, size }] of logSizes) {
            if (rows.get(id) === seq && !this.dirty.has(id)) this.statements.setLogSize!.run(size, id);
          }
        });
      }
    } catch (err) {
      this.options.log?.('warn', `orb-canvas: search index close failed: ${String(err)}`);
    } finally {
      this.closed = true;
      this.dirty.clear();
      this.closeDb();
    }
  }
}
