/**
 * Print pipeline contracts (BUILD_PLAN P4.4, PRD Port): the print routes, the export and snapshot upload routes,
 * and the names of the files they write. Shared by the UI (print routes, composer), orb-host (routes), orb-canvas
 * (storage) and the desktop main process (route checks).
 *
 * - **Print routes.** `/print/canvas?canvasId&layout&theme&scope` (Canvas PDF) and `/print/doc?canvasId&scope`
 *   (research document). The UI is served at `/` by the sidecar, so a route lives in the hash: the hidden print
 *   window loads `<origin>/#/print/canvas?…`.
 * - **Snapshots.** Before a print, each design frame is captured at 2x and stored as
 *   `assets/snapshots/<cardId>-v<version>-<capturedAt>.png` (the capture time is in the name, so the print labels it).
 * - **Exports.** The PDF goes to the canvas's `exports/` with a timestamped name
 *   (`canvas-2026-10-14-143205.pdf`, `document-…`).
 */
import { z } from 'zod';
import { CanvasId } from './wire.js';

export const PrintKind = z.enum(['canvas', 'doc', 'deck']);
export type PrintKind = z.infer<typeof PrintKind>;

/** Canvas PDF layout: one page per frame, or one poster page for the whole board (PRD Port › Canvas PDF). */
export const PrintLayout = z.enum(['frames', 'poster']);
export type PrintLayout = z.infer<typeof PrintLayout>;

/** Print theme: print-friendly light (the default), or night as on screen. */
export const PrintTheme = z.enum(['light', 'night']);
export type PrintTheme = z.infer<typeof PrintTheme>;

const FrameRef = z.string().regex(/^f_[A-Za-z0-9_-]{1,64}$/);

/** Scope: the whole board, or the listed frames (in board order when printed). */
export const PrintScope = z.union([z.literal('all'), z.array(FrameRef).min(1).max(200)]);
export type PrintScope = z.infer<typeof PrintScope>;

export const PrintRequest = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('canvas'),
    canvasId: CanvasId,
    layout: PrintLayout.default('frames'),
    theme: PrintTheme.default('light'),
    scope: PrintScope.default('all'),
  }),
  z.strictObject({
    kind: z.literal('doc'),
    canvasId: CanvasId,
    scope: PrintScope.default('all'),
  }),
  /** P6.17: the slides (the saved deck; its scope is the deck's own). */
  z.strictObject({
    kind: z.literal('deck'),
    canvasId: CanvasId,
  }),
]);
export type PrintRequest = z.infer<typeof PrintRequest>;
export type PrintRequestInput = z.input<typeof PrintRequest>;

/** `/print/canvas?canvasId=…&layout=…&theme=…&scope=…` or `/print/doc?canvasId=…&scope=…`. */
export function printRoute(input: PrintRequestInput): string {
  const req = PrintRequest.parse(input);
  const q = new URLSearchParams({ canvasId: req.canvasId });
  if (req.kind === 'canvas') {
    q.set('layout', req.layout);
    q.set('theme', req.theme);
  }
  if (req.kind !== 'deck') q.set('scope', req.scope === 'all' ? 'all' : req.scope.join(','));
  return `/print/${req.kind}?${q.toString()}`;
}

/**
 * The request of a print route (`/print/canvas?…`, with or without a leading `#`), or undefined when it is not one.
 * Unknown query keys are refused, so a route can only carry what `printRoute` writes.
 */
export function parsePrintRoute(route: string): PrintRequest | undefined {
  const m = /^#?\/print\/(canvas|doc|deck)\?([^#]*)$/.exec(route);
  if (!m) return undefined;
  const q = new URLSearchParams(m[2]);
  const allowed =
    m[1] === 'canvas'
      ? ['canvasId', 'layout', 'theme', 'scope']
      : m[1] === 'deck'
        ? ['canvasId']
        : ['canvasId', 'scope'];
  const raw: Record<string, unknown> = { kind: m[1] };
  for (const [key, value] of q) {
    if (!allowed.includes(key) || key in raw) return undefined;
    raw[key] = key === 'scope' ? (value === 'all' ? 'all' : value.split(',')) : value;
  }
  const parsed = PrintRequest.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** What the print page reports to the main process when it is ready to print (or why it cannot). */
export const PrintReady = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    /** Pages a Canvas PDF lays out (the PDF has exactly these); 0 for a flowing research document. */
    pages: z.number().int().nonnegative().max(2000),
    /** Count of printed cards per type (the export test checks every type rendered). */
    cardTypes: z.record(z.string().max(32), z.number().int().nonnegative()),
    /** Design frames snapshotted for this print. */
    snapshots: z.number().int().nonnegative(),
  }),
  z.strictObject({ ok: z.literal(false), error: z.string().max(500) }),
]);
export type PrintReady = z.infer<typeof PrintReady>;

/** A capture request from the print page: a rectangle in CSS px of the print window, at 2x. */
export const PrintCaptureRect = z.strictObject({
  x: z.number().int().min(0).max(4000),
  y: z.number().int().min(0).max(4000),
  width: z.number().int().min(1).max(2000),
  height: z.number().int().min(1).max(2000),
});
export type PrintCaptureRect = z.infer<typeof PrintCaptureRect>;

/** Device pixels per CSS pixel of a design-frame snapshot. */
export const SNAPSHOT_SCALE = 2;

// ---- Snapshots ----

export const SNAPSHOT_DIR = 'assets/snapshots';

/** `assets/snapshots/<cardId>-v<version>-<capturedAt ms>.png`. */
export const SnapshotPath = z
  .string()
  .regex(/^assets\/snapshots\/c_[A-Za-z0-9_-]{1,64}-v\d{1,6}-\d{13}\.png$/);

export const snapshotPath = (cardId: string, version: number, capturedAt: number): string =>
  `${SNAPSHOT_DIR}/${cardId}-v${version}-${capturedAt}.png`;

/** The capture time written into a snapshot path. */
export function snapshotCapturedAt(path: string): number | undefined {
  const m = /-(\d{13})\.png$/.exec(path);
  return m ? Number(m[1]) : undefined;
}

export const SnapshotRef = z.strictObject({
  path: SnapshotPath,
  cardId: z.string().regex(/^c_[A-Za-z0-9_-]{1,64}$/),
  version: z.number().int().positive(),
  capturedAt: z.number().int().nonnegative(),
  size: z.number().int().nonnegative(),
});
export type SnapshotRef = z.infer<typeof SnapshotRef>;

export const SnapshotUploadResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), snapshot: SnapshotRef }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
]);
export type SnapshotUploadResult = z.infer<typeof SnapshotUploadResult>;

/** Largest snapshot PNG kept (a 2x capture of a 1000 x 2000 px frame is far below). */
export const SNAPSHOT_MAX_BYTES = 30 * 1024 * 1024;

// ---- Exports ----

export const EXPORTS_DIR = 'exports';

/** Largest exported PDF accepted. */
export const EXPORT_MAX_BYTES = 512 * 1024 * 1024;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/**
 * `canvas-2026-10-14-143205.pdf` / `document-…` / `deck-…` in local time (a `-2`, `-3`… suffix is added on a clash).
 * P6.17: `ext` 'pptx' names a PowerPoint export of the deck.
 */
export function exportFileName(kind: PrintKind, at: number, n = 1, ext: 'pdf' | 'pptx' = 'pdf'): string {
  const d = new Date(at);
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}${pad(d.getSeconds())}`;
  return `${kind === 'canvas' ? 'canvas' : kind === 'deck' ? 'deck' : 'document'}-${stamp}${n > 1 ? `-${n}` : ''}.${ext}`;
}

/** `exports/<name>.pdf`: the only shape of an export path. */
export const ExportPath = z
  .string()
  .regex(/^exports\/(canvas|document|deck)-\d{4}-\d{2}-\d{2}-\d{6}(-\d{1,3})?\.(pdf|pptx)$/);

export const ExportRef = z.strictObject({
  path: ExportPath,
  /** Absolute path on this Mac (for Reveal in Finder). */
  file: z.string().min(1).max(4096),
  kind: PrintKind,
  size: z.number().int().nonnegative(),
  at: z.number().int().nonnegative(),
});
export type ExportRef = z.infer<typeof ExportRef>;

export const ExportUploadResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), export: ExportRef }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
]);
export type ExportUploadResult = z.infer<typeof ExportUploadResult>;

/** Upload routes (exact `/api` Fetch routes registered by orb-host, beside the asset routes). */
export const SNAPSHOT_UPLOAD_PATH = '/api/orb-asset/snapshot';
export const EXPORT_UPLOAD_PATH = '/api/orb-asset/export';
