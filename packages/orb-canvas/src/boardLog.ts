/**
 * `board.jsonl`: the append-only board event log of one canvas (BUILD_PLAN §2.1, P1.7). One `BoardEvent` JSON per
 * line, `seq` contiguous from 0. Only the canvas service writes it.
 *
 * Durability contract:
 *   - `append` is synchronous and in-memory; lines are batched and written with ONE `write` + `fdatasync` at most
 *     `flushMs` (default 250 ms) after the first pending line, and on `flush()` / `close()`.
 *   - A process killed with SIGKILL therefore loses at most the last `flushMs` of events. A line is committed only
 *     once its trailing `\n` is on disk.
 *   - On open, the tail is repaired: an unterminated (torn) last line and any run of invalid lines at the end are
 *     truncated away (ftruncate + fsync) before the fold replays the log. Invalid data FOLLOWED by valid events is
 *     not a crash artefact; the log is then reported as corrupt and left untouched.
 */
import { open as openFile, type FileHandle } from 'node:fs/promises';
import { parseBoardEvent, type BoardEvent } from '@orb/shared';
import { CanvasError } from './errors.js';

export const DEFAULT_FLUSH_MS = 250;

export type BoardLogOptions = {
  /** Max age of a pending line before it is written and fsynced. Default 250 ms. */
  flushMs?: number;
  /** Called when a background flush fails; later appends then throw. */
  onError?: (error: unknown) => void;
};

export type BoardLogRecovery = {
  /** Bytes cut from the end of the file on open (torn or invalid tail). 0 when the file was clean. */
  truncatedBytes: number;
  /** Lines (complete or torn) dropped with them. */
  droppedLines: number;
};

export type OpenedBoardLog = { log: BoardLog; events: BoardEvent[]; recovery: BoardLogRecovery };

const NEWLINE = 0x0a;

function parseLine(bytes: Buffer, expectedSeq: number): BoardEvent | null {
  if (bytes.length === 0) return null;
  try {
    const event = parseBoardEvent(JSON.parse(bytes.toString('utf8')));
    return event.seq === expectedSeq ? event : null;
  } catch {
    return null;
  }
}

/** Scan a log image. Pure: returns the valid prefix, its byte length, and what follows it. */
export function scanBoardLog(buf: Buffer): {
  events: BoardEvent[];
  goodBytes: number;
  droppedLines: number;
  /** A complete line after the first bad one still parses as a board event: not a crash tail. */
  corruptAt: number | null;
} {
  const events: BoardEvent[] = [];
  let pos = 0;
  let goodBytes = 0;
  let bad = false;
  let droppedLines = 0;
  let corruptAt: number | null = null;
  while (pos < buf.length) {
    const nl = buf.indexOf(NEWLINE, pos);
    if (nl === -1) {
      // Unterminated last line: torn by a crash mid-write. Never committed.
      droppedLines++;
      break;
    }
    const line = buf.subarray(pos, nl);
    if (!bad) {
      const event = parseLine(line, events.length);
      if (event) {
        events.push(event);
        goodBytes = nl + 1;
      } else {
        bad = true;
        droppedLines++;
      }
    } else {
      droppedLines++;
      let looksValid = false;
      try {
        parseBoardEvent(JSON.parse(line.toString('utf8')));
        looksValid = true;
      } catch {
        // still garbage: part of the bad tail
      }
      if (looksValid && corruptAt === null) corruptAt = pos;
    }
    pos = nl + 1;
  }
  return { events, goodBytes, droppedLines, corruptAt };
}

export class BoardLog {
  private pending: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  private chain: Promise<void> = Promise.resolve();
  private failure: unknown = null;
  private closed = false;
  private readonly flushMs: number;

  private constructor(
    readonly path: string,
    private readonly fh: FileHandle,
    private readonly options: BoardLogOptions,
  ) {
    this.flushMs = options.flushMs ?? DEFAULT_FLUSH_MS;
  }

  /** Open (creating if missing), repair the tail, and return the committed events. */
  static async open(path: string, options: BoardLogOptions = {}): Promise<OpenedBoardLog> {
    const fh = await openFile(path, 'a+');
    try {
      const buf = await fh.readFile();
      const scan = scanBoardLog(buf);
      if (scan.corruptAt !== null) {
        throw new CanvasError(
          'orb/board-corrupt',
          `board log ${path} has invalid data before valid events (byte ${scan.goodBytes})`,
          { goodBytes: scan.goodBytes, nextValidAt: scan.corruptAt },
        );
      }
      const truncatedBytes = buf.length - scan.goodBytes;
      if (truncatedBytes > 0) {
        await fh.truncate(scan.goodBytes);
        await fh.sync();
      }
      return {
        log: new BoardLog(path, fh, options),
        events: scan.events,
        recovery: { truncatedBytes, droppedLines: scan.droppedLines },
      };
    } catch (err) {
      await fh.close().catch(() => {});
      throw err;
    }
  }

  get pendingLines(): number {
    return this.pending.length;
  }

  /** Queue one event line. Synchronous; the caller has already validated and folded the event. */
  append(event: BoardEvent): void {
    if (this.closed) throw new CanvasError('orb/closed', `board log ${this.path} is closed`);
    if (this.failure) {
      throw new CanvasError('orb/closed', `board log ${this.path} failed to write: ${String(this.failure)}`);
    }
    this.pending.push(`${JSON.stringify(event)}\n`);
    this.timer ??= setTimeout(() => {
      this.flush().catch(() => {});
    }, this.flushMs);
  }

  /** Write and fdatasync every pending line now. Serialized: concurrent calls never interleave writes. */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const run = this.chain.then(async () => {
      if (this.pending.length === 0 || this.failure) return;
      const chunk = Buffer.from(this.pending.join(''), 'utf8');
      this.pending = [];
      try {
        // One write call per batch (looped only on a short write) so a kill can not interleave partial lines.
        let off = 0;
        while (off < chunk.length) {
          const { bytesWritten } = await this.fh.write(chunk, off, chunk.length - off);
          off += bytesWritten;
        }
        await this.fh.datasync();
      } catch (err) {
        this.failure = err;
        this.options.onError?.(err);
        throw err;
      }
    });
    this.chain = run.catch(() => {});
    return run;
  }

  /** Flush, fsync and close. Idempotent. */
  async close(): Promise<void> {
    if (this.closed) return this.chain;
    this.closed = true;
    try {
      await this.flush();
    } finally {
      await this.fh.close();
    }
  }
}
