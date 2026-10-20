/**
 * Print pipeline files (BUILD_PLAN P4.4), written by the canvas service (the renderer and the main process never
 * write canvas files):
 *
 * - design-frame snapshots, `assets/snapshots/<cardId>-v<version>-<capturedAt>.png`: PNG only (magic number checked),
 *   capped at SNAPSHOT_MAX_BYTES. The asset file route serves them (assetFile below), so the print page shows them
 *   as `<img>`;
 * - exported PDFs, `exports/canvas-<stamp>.pdf` or `exports/document-<stamp>.pdf` (local time; `-2`, `-3`… on a
 *   clash), `%PDF-` checked, capped at EXPORT_MAX_BYTES.
 *
 * Writes are atomic (dot-named temp file in the same folder, fsync, rename; a no-clobber link for exports so two
 * exports in the same second never overwrite each other). The `assets/snapshots` and `exports` folders must be real
 * directories of the canvas, never symlinks out of it.
 */
import { randomBytes } from 'node:crypto';
import { link, lstat, mkdir, open as openFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  EXPORTS_DIR,
  EXPORT_MAX_BYTES,
  OrbErrorCode,
  SNAPSHOT_DIR,
  SNAPSHOT_MAX_BYTES,
  SnapshotPath,
  exportFileName,
  snapshotPath,
  type ExportRef,
  type PrintKind,
  type SnapshotRef,
} from '@orb/shared';
import { CanvasError } from './errors.js';

const CARD_ID = /^c_[A-Za-z0-9_-]{1,64}$/;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Make `<canvasDir>/<rel>` (and its parents) and check every level is a real directory of the canvas. */
async function realDir(canvasDir: string, rel: string): Promise<string> {
  const dir = join(canvasDir, rel);
  await mkdir(dir, { recursive: true });
  const parts = rel.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const st = await lstat(join(canvasDir, ...parts.slice(0, i)));
    if (!st.isDirectory() || st.isSymbolicLink())
      throw new CanvasError(OrbErrorCode.invalidArgs, `${rel} is not a folder of this canvas`, {});
  }
  return dir;
}

async function syncDir(dir: string): Promise<void> {
  const dh = await openFile(dir, 'r');
  try {
    await dh.sync();
  } catch {
    // some filesystems refuse fsync on a directory
  } finally {
    await dh.close();
  }
}

/** Stream `data` into a temp file in `dir`, checking the size cap and the first bytes. Returns the temp path. */
async function writeTemp(
  dir: string,
  data: AsyncIterable<Uint8Array>,
  max: number,
  check: (head: Uint8Array) => boolean,
  what: string,
  signal?: AbortSignal,
): Promise<{ tmp: string; size: number }> {
  const tmp = join(dir, `.write-${randomBytes(8).toString('hex')}.tmp`);
  const fh = await openFile(tmp, 'wx', 0o644);
  let size = 0;
  let head = new Uint8Array(0);
  try {
    for await (const chunk of data) {
      signal?.throwIfAborted();
      size += chunk.byteLength;
      if (size > max)
        throw new CanvasError(OrbErrorCode.tooLarge, `the ${what} is larger than ${max / (1024 * 1024)} MB`, {
          max,
        });
      if (head.length < 16) {
        const next = new Uint8Array(Math.min(16, head.length + chunk.byteLength));
        next.set(head);
        next.set(chunk.subarray(0, next.length - head.length), head.length);
        head = next;
      }
      await fh.write(chunk);
    }
    if (size === 0) throw new CanvasError(OrbErrorCode.invalidArgs, `the ${what} is empty`, {});
    if (!check(head)) throw new CanvasError(OrbErrorCode.unsupportedType, `the ${what} is not valid`, {});
    await fh.sync();
    await fh.close();
    return { tmp, size };
  } catch (err) {
    await fh.close().catch(() => undefined);
    await rm(tmp, { force: true });
    throw err;
  }
}

/** Store a design-frame snapshot PNG of card `cardId` at `version`, captured at `capturedAt`. */
export async function storeSnapshot(
  canvasDir: string,
  input: {
    cardId: string;
    version: number;
    capturedAt: number;
    data: AsyncIterable<Uint8Array>;
    signal?: AbortSignal;
  },
): Promise<SnapshotRef> {
  if (!CARD_ID.test(input.cardId)) throw new CanvasError(OrbErrorCode.invalidArgs, 'invalid card id', {});
  if (!Number.isInteger(input.version) || input.version < 1 || input.version > 999_999)
    throw new CanvasError(OrbErrorCode.invalidArgs, 'invalid version', {});
  const path = snapshotPath(input.cardId, input.version, input.capturedAt);
  if (!SnapshotPath.safeParse(path).success)
    throw new CanvasError(OrbErrorCode.invalidArgs, 'invalid snapshot', {});
  const dir = await realDir(canvasDir, SNAPSHOT_DIR);
  const { tmp, size } = await writeTemp(
    dir,
    input.data,
    SNAPSHOT_MAX_BYTES,
    (head) => PNG_MAGIC.every((b, i) => head[i] === b),
    'snapshot',
    input.signal,
  );
  try {
    await rename(tmp, join(canvasDir, path));
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  await syncDir(dir);
  return { path, cardId: input.cardId, version: input.version, capturedAt: input.capturedAt, size };
}

/** Store an exported PDF in `exports/` under a timestamped name. */
export async function storeExport(
  canvasDir: string,
  input: {
    kind: PrintKind;
    at: number;
    data: AsyncIterable<Uint8Array>;
    signal?: AbortSignal;
    /** P6.17: a PowerPoint export of the deck (a zip: `PK\x03\x04`). */
    ext?: 'pdf' | 'pptx';
  },
): Promise<ExportRef> {
  const ext = input.ext ?? 'pdf';
  const dir = await realDir(canvasDir, EXPORTS_DIR);
  const { tmp, size } = await writeTemp(
    dir,
    input.data,
    EXPORT_MAX_BYTES,
    ext === 'pptx'
      ? (head) => head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
      : (head) => new TextDecoder('latin1').decode(head.subarray(0, 5)) === '%PDF-',
    ext === 'pptx' ? 'presentation' : 'PDF',
    input.signal,
  );
  try {
    for (let n = 1; n <= 999; n++) {
      const name = exportFileName(input.kind, input.at, n, ext);
      const file = join(dir, name);
      try {
        // link() never replaces an existing file: a clash moves on to the next suffix.
        await link(tmp, file);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue;
        throw err;
      }
      await syncDir(dir);
      return { path: `${EXPORTS_DIR}/${name}`, file, kind: input.kind, size, at: input.at };
    }
    throw new CanvasError(OrbErrorCode.invalidArgs, 'too many exports in the same second', {});
  } finally {
    await rm(tmp, { force: true });
  }
}
