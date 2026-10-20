/**
 * Canvas assets (BUILD_PLAN P2.5): files a user drops or pastes, copied into `<canvas>/assets/` by the canvas service
 * (the renderer never writes to disk). orb-host's upload route streams the request body here; its file route reads
 * back only regular files directly inside `assets/` (and, P4.4, the PNG snapshots in `assets/snapshots/`).
 *
 * Every upload is checked before it is kept:
 * - the type must be one Orb accepts (`ASSET_TYPES`: PDF, PNG, JPEG, GIF, WebP, CSV, Markdown, plain text);
 * - the size must be above zero and within the type's cap (counted while streaming; the write stops at the cap);
 * - the bytes must match the type: a magic-number check for PDF and images, strict UTF-8 without NUL for text.
 * The bytes go to a dot-named temp file (never served), are fsynced, then renamed to `<ulid>-<slug>.<ext>`.
 */
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, open as openFile, readdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ASSET_NAME,
  ASSET_TYPES,
  AssetMime,
  AssetPath,
  OrbErrorCode,
  SnapshotPath,
  type AssetRef,
  type BoardState,
} from '@orb/shared';
import { CanvasError } from './errors.js';

export const ASSETS_DIR = 'assets';

export type AssetInput = {
  /** Original file name (display only; the stored name is generated). */
  name: string;
  /** Declared type; must be one of ASSET_TYPES. */
  mime: string;
  /** The bytes, streamed. */
  data: AsyncIterable<Uint8Array>;
  /** Declared length, when known: refused early when above the cap. */
  length?: number;
  signal?: AbortSignal;
};

const startsWith = (head: Uint8Array, bytes: number[], at = 0) =>
  head.length >= at + bytes.length && bytes.every((b, i) => head[at + i] === b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** True when the first bytes are a file of `mime` (binary types only). */
export function sniffMatches(mime: AssetMime, head: Uint8Array): boolean {
  switch (mime) {
    case 'application/pdf':
      // Real PDFs may have a little junk before the header; pdf.js accepts it within the first 1 KB.
      for (let i = 0; i + 5 <= Math.min(head.length, 1024); i++)
        if (startsWith(head, ascii('%PDF-'), i)) return true;
      return false;
    case 'image/png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case 'image/gif':
      return startsWith(head, ascii('GIF87a')) || startsWith(head, ascii('GIF89a'));
    case 'image/webp':
      return startsWith(head, ascii('RIFF')) && startsWith(head, ascii('WEBP'), 8);
    default:
      return true;
  }
}

/** `<ulid>-<slug>.<ext>` from the original name (the slug keeps the folder human-readable). */
export function storedName(original: string, ext: string, id: string): string {
  const base = original.replace(/\.[A-Za-z0-9]+$/, '');
  const slug = base
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  const name = `${id.toLowerCase()}${slug ? `-${slug}` : ''}.${ext}`;
  if (!ASSET_NAME.test(name)) throw new Error(`orb-canvas: bad stored asset name ${JSON.stringify(name)}`);
  return name;
}

/** Display name: control characters and path separators dropped, at most 255 characters. */
export const displayName = (name: string): string =>
  [...name]
    .filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f && ch !== '/' && ch !== '\\')
    .join('')
    .trim()
    .slice(0, 255) || 'file';

/**
 * Store one upload in `<canvasDir>/assets/`. Throws CanvasError `orb/unsupported-type`, `orb/too-large` or
 * `orb/invalid-args`; nothing is left behind on failure.
 */
export async function storeAsset(
  canvasDir: string,
  input: AssetInput,
  mintId: () => string,
): Promise<AssetRef> {
  const mimeParsed = AssetMime.safeParse(input.mime.split(';', 1)[0]!.trim().toLowerCase());
  if (!mimeParsed.success) {
    throw new CanvasError(
      OrbErrorCode.unsupportedType,
      `orb does not accept ${JSON.stringify(input.mime)} files`,
      {
        mime: input.mime,
      },
    );
  }
  const mime = mimeParsed.data;
  const spec = ASSET_TYPES[mime];
  const tooLarge = () =>
    new CanvasError(OrbErrorCode.tooLarge, `the file is larger than ${spec.max / (1024 * 1024)} MB`, {
      max: spec.max,
      mime,
    });
  if (input.length !== undefined && input.length > spec.max) throw tooLarge();

  const dir = join(canvasDir, ASSETS_DIR);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.upload-${randomBytes(8).toString('hex')}.tmp`);
  const fh = await openFile(tmp, 'wx', 0o644);
  let size = 0;
  let head = new Uint8Array(0);
  const decoder = spec.kind === 'text' ? new TextDecoder('utf-8', { fatal: true }) : undefined;
  let kept = false;
  try {
    for await (const chunk of input.data) {
      input.signal?.throwIfAborted();
      size += chunk.byteLength;
      if (size > spec.max) throw tooLarge();
      if (head.length < 1024) {
        const next = new Uint8Array(Math.min(1024, head.length + chunk.byteLength));
        next.set(head);
        next.set(chunk.subarray(0, next.length - head.length), head.length);
        head = next;
      }
      if (decoder) {
        if (chunk.includes(0)) throw notText();
        try {
          decoder.decode(chunk, { stream: true });
        } catch {
          throw notText();
        }
      }
      await fh.write(chunk);
    }
    if (decoder) {
      try {
        decoder.decode();
      } catch {
        throw notText();
      }
    }
    if (size === 0) throw new CanvasError(OrbErrorCode.invalidArgs, 'the file is empty', {});
    if (!sniffMatches(mime, head)) {
      throw new CanvasError(
        OrbErrorCode.unsupportedType,
        `the file is not a valid ${spec.ext.toUpperCase()}`,
        {
          mime,
        },
      );
    }
    await fh.sync();
    await fh.close();
    const name = storedName(input.name, spec.ext, mintId());
    await rename(tmp, join(dir, name));
    kept = true;
    const dh = await openFile(dir, 'r');
    try {
      await dh.sync();
    } catch {
      // some filesystems refuse fsync on a directory
    } finally {
      await dh.close();
    }
    return { path: `${ASSETS_DIR}/${name}`, name: displayName(input.name), mime, size };
  } finally {
    if (!kept) {
      await fh.close().catch(() => undefined);
      await rm(tmp, { force: true });
    }
  }
}

function notText(): CanvasError {
  return new CanvasError(OrbErrorCode.unsupportedType, 'the file is not UTF-8 text', {});
}

const MIME_BY_EXT = Object.fromEntries(
  Object.entries(ASSET_TYPES).map(([mime, t]) => [t.ext, mime as AssetMime]),
) as Record<string, AssetMime>;

/**
 * Resolve an asset path (`assets/<name>`) of a canvas to a regular file. Throws `orb/invalid-args` for a path of
 * any other shape, and `orb/not-found` for a missing file, a directory or a symlink.
 */
export async function assetFile(
  canvasDir: string,
  path: string,
): Promise<{ file: string; mime: AssetMime; size: number }> {
  const parsed = AssetPath.safeParse(path);
  // P4.4: design-frame snapshots live one level down, in `assets/snapshots/` (PNG only).
  const snapshot = !parsed.success && SnapshotPath.safeParse(path).success;
  if (!parsed.success && !snapshot) throw new CanvasError(OrbErrorCode.invalidArgs, 'invalid asset path', {});
  const name = path.slice(ASSETS_DIR.length + 1);
  const ext = /\.([a-z0-9]+)$/.exec(name)?.[1];
  const mime = ext ? MIME_BY_EXT[ext] : undefined;
  if (!mime) throw new CanvasError(OrbErrorCode.notFound, 'no such asset', {});
  const file = join(canvasDir, ASSETS_DIR, name);
  let st;
  try {
    st = await lstat(file);
    // The snapshots folder must be a real folder of the canvas, never a symlink out of it.
    if (snapshot && !(await lstat(join(canvasDir, ASSETS_DIR, 'snapshots'))).isDirectory()) throw new Error();
  } catch {
    throw new CanvasError(OrbErrorCode.notFound, 'no such asset', {});
  }
  if (!st.isFile()) throw new CanvasError(OrbErrorCode.notFound, 'no such asset', {});
  return { file, mime, size: st.size };
}

/** Uploads younger than this are never collected: a drop uploads first and places the cards a moment later. */
export const ASSET_GC_GRACE_MS = 5 * 60_000;

const ASSET_MENTION = /assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}/g;

/** Every `assets/<name>` mentioned in `text`. */
const mentions = (text: string): string[] => text.match(ASSET_MENTION) ?? [];

/**
 * P6.9 asset GC: delete the uploads in `<canvas>/assets/` (regular, non-dot files directly inside it) that nothing
 * refers to any more. A drop uploads files and then adds cards; undoing the drop removes the cards and leaves the
 * files behind. Referenced = mentioned by any card's data (stacked cards included), or by a dataset file
 * (`assets/data/*.json`) or a design card's page (`assets/design/*.html`). Files younger than `graceMs` stay (an
 * upload in flight). Subfolders (data, design, snapshots) are never touched.
 *
 * Run when a board is loaded (`board` is read when the decision is made), i.e. once per canvas per app session, when the in-memory redo stack is empty: a
 * redo of an undone drop within the session can never find its file gone. Returns the removed asset paths.
 */
export async function collectUnreferencedAssets(
  canvasDir: string,
  board: () => BoardState,
  now: number,
  graceMs = ASSET_GC_GRACE_MS,
): Promise<string[]> {
  const dir = join(canvasDir, ASSETS_DIR);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const candidates: string[] = [];
  for (const name of names) {
    if (!ASSET_NAME.test(name)) continue;
    const st = await lstat(join(dir, name)).catch(() => undefined);
    if (st?.isFile() && now - st.mtimeMs >= graceMs) candidates.push(name);
  }
  if (candidates.length === 0) return [];

  const referenced = new Set<string>();
  // Read AFTER listing the folder: the board the decision is made against is the one as it is now, not as it was
  // when the run started (a drop placed meanwhile keeps its files).
  for (const card of Object.values(board().cards)) {
    for (const m of mentions(JSON.stringify(card.data ?? null))) referenced.add(m);
  }
  for (const sub of ['data', 'design']) {
    const files = await readdir(join(dir, sub)).catch(() => [] as string[]);
    for (const f of files) {
      const text = await readFile(join(dir, sub, f), 'utf8').catch(() => '');
      for (const m of mentions(text)) referenced.add(m);
    }
  }
  const removed: string[] = [];
  for (const name of candidates) {
    const path = `${ASSETS_DIR}/${name}`;
    if (referenced.has(path)) continue;
    await rm(join(dir, name), { force: true });
    removed.push(path);
  }
  return removed;
}
