/**
 * Drop and paste (BUILD_PLAN P2.5, PRD Canvas › Adding content): turn dropped files, links and pasted images or text
 * into card drafts. Files are uploaded first (orb-host copies them into `<canvas>/assets/`; the renderer never
 * writes to disk); the cards are then added as ONE batch command, so one Cmd+Z removes a whole drop.
 *
 * - PNG, JPG, GIF, WebP → Image card (natural size, caption = file name);
 * - PDF → File card: page count and a first-page thumbnail rendered by pdf.js here, the thumbnail stored as an asset;
 * - CSV → Table card (header row + rows, the CSV kept in assets/);
 * - XLSX or JSON data (P6.3) → Database card (the rows go to the canvas's datasets, `assets/data/`);
 * - Markdown or plain text → Note (Paper) card with the text (the file kept in assets/);
 * - an http(s) URL → Source card (just the link for now);
 * - other pasted text → Note card.
 * Anything else is refused with a message (nothing is uploaded).
 */
import {
  ASSET_TYPES,
  assetMimeOf,
  importFormatOf,
  isHttpUrl,
  sourceTitleOf,
  tableFromCsv,
  type AssetMime,
  type AssetRef,
  type BoardCommandInput,
  type BoardState,
  type CardType,
  type CardView,
} from '@orb/shared';
import { frameAt } from '../canvas/geometry.js';

export type IngestItem =
  | { kind: 'file'; file: Blob & { name: string; type: string } }
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string };

export type IngestDeps = {
  upload: (file: { name: string; mime: AssetMime; body: Blob }) => Promise<AssetRef>;
  /** Page count + first-page PNG of a PDF (pdf.js); may fail (then the card has no thumbnail). */
  pdfSummary?: (bytes: Uint8Array) => Promise<{ pages: number; thumb: Blob | null }>;
  /** Natural size of an image; may be missing (tests) or fail. */
  imageSize?: (blob: Blob) => Promise<{ width: number; height: number } | undefined>;
  /** P6.3: make a dataset of an XLSX or JSON file; answers the Database card's data and view. */
  importData?: (file: { name: string; mime: string; body: Blob }) => Promise<{ data: unknown; view: CardView }>;
};

type Draft = { type: CardType; w: number; h: number; data: unknown; view?: CardView };
export type IngestResult = { command: BoardCommandInput | null; errors: string[] };

const NOTE_TEXT_MAX = 20_000;
const SIZES = {
  note: { w: 280, h: 200 },
  source: { w: 300, h: 150 },
  file: { w: 260, h: 380 },
  table: { w: 520, h: 320 },
  image: { w: 320, h: 260 },
  database: { w: 560, h: 360 },
} as const;
/** Each further item of one drop is offset by this much (a cascade). */
export const CASCADE = 36;

const baseName = (name: string) => name.replace(/\.[A-Za-z0-9]+$/, '') || name;

/** Note data from free text: the first line is the title, the rest the body (cut to the note limit). */
export function noteFromText(text: string, title?: string): { title: string; body: string } {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  if (title !== undefined) return { title: title.slice(0, 500), body: clean.slice(0, NOTE_TEXT_MAX) };
  const [first = '', ...rest] = clean.split('\n');
  return {
    title: first.trim().slice(0, 500) || 'Pasted text',
    body: rest.join('\n').trim().slice(0, NOTE_TEXT_MAX),
  };
}

/** The items of a drop's DataTransfer: files first; otherwise the dropped link(s) or text. */
export function itemsFromTransfer(dt: Pick<DataTransfer, 'files' | 'getData'>): IngestItem[] {
  const files = Array.from(dt.files ?? []);
  if (files.length > 0) return files.map((file) => ({ kind: 'file', file }));
  const uris = (dt.getData('text/uri-list') || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const links = uris.filter(isHttpUrl);
  if (links.length > 0) return links.map((url) => ({ kind: 'url', url }));
  const text = dt.getData('text/plain') || '';
  if (!text.trim()) return [];
  return isHttpUrl(text) ? [{ kind: 'url', url: text.trim() }] : [{ kind: 'text', text }];
}

async function readText(blob: Blob): Promise<string> {
  return blob.text();
}

/** One item → one card draft (after uploading its file). Throws an Error with a user-facing message. */
async function draftFor(item: IngestItem, deps: IngestDeps): Promise<Draft> {
  if (item.kind === 'url') {
    return { type: 'source', ...SIZES.source, data: { url: item.url, title: sourceTitleOf(item.url) } };
  }
  if (item.kind === 'text') return { type: 'note', ...SIZES.note, data: noteFromText(item.text) };

  const { file } = item;
  const name = file.name || 'pasted';
  const dataFormat = importFormatOf(name, file.type);
  if ((dataFormat === 'xlsx' || dataFormat === 'json') && deps.importData) {
    if (file.size === 0) throw new Error(`${name} is empty`);
    const made = await deps.importData({ name, mime: file.type, body: file });
    return { type: 'database', ...SIZES.database, data: made.data, view: made.view };
  }
  const mime = assetMimeOf(name, file.type);
  if (!mime)
    throw new Error(`${name}: orb accepts PDF, PNG, JPG, GIF, WebP, CSV, XLSX, JSON, Markdown and text files`);
  const spec = ASSET_TYPES[mime];
  if (file.size > spec.max) throw new Error(`${name} is larger than ${spec.max / (1024 * 1024)} MB`);
  if (file.size === 0) throw new Error(`${name} is empty`);

  if (spec.kind === 'image') {
    const [asset, size] = await Promise.all([
      deps.upload({ name, mime, body: file }),
      deps.imageSize?.(file).catch(() => undefined),
    ]);
    const w = SIZES.image.w;
    const h = size
      ? Math.round(Math.min(900, Math.max(80, (w - 20) * (size.height / size.width))) + 56)
      : SIZES.image.h;
    return {
      type: 'image',
      w,
      h,
      data: {
        asset,
        title: baseName(name),
        ...(size ? { width: size.width, height: size.height } : {}),
      },
    };
  }
  if (mime === 'application/pdf') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const [asset, summary] = await Promise.all([
      deps.upload({ name, mime, body: file }),
      deps.pdfSummary ? deps.pdfSummary(bytes).catch(() => undefined) : Promise.resolve(undefined),
    ]);
    let thumb: AssetRef | undefined;
    if (summary?.thumb) {
      thumb = await deps
        .upload({ name: `${baseName(name)}-cover.png`, mime: 'image/png', body: summary.thumb })
        .catch(() => undefined);
    }
    return {
      type: 'file',
      ...SIZES.file,
      data: {
        asset,
        title: baseName(name),
        pages: summary ? summary.pages : null,
        ...(thumb ? { thumb } : {}),
      },
    };
  }
  const text = await readText(file);
  if (mime === 'text/csv') {
    const table = tableFromCsv(text, baseName(name)); // throws on an empty CSV before anything is uploaded
    const asset = await deps.upload({ name, mime, body: file });
    return { type: 'table', ...SIZES.table, data: { ...table, asset } };
  }
  const asset = await deps.upload({ name, mime, body: file });
  return { type: 'note', ...SIZES.note, data: { ...noteFromText(text, baseName(name)), asset } };
}

/**
 * P6.1: where each card of an ingest goes instead of the cascade at `at` (composer attachments: a free spot in the
 * current frame). Called once per card, in order, with the card's size; returns its top-left corner.
 */
export type Placer = (size: { w: number; h: number }) => { x: number; y: number };

/**
 * Build the batch that adds a card per item at world point `at` (the first card centred there, the rest cascading,
 * or wherever `place` puts them), each joining the frame under its centre. Items that fail are reported in `errors`;
 * the others still land.
 */
export async function ingest(
  items: readonly IngestItem[],
  at: { x: number; y: number },
  board: BoardState,
  deps: IngestDeps,
  place?: Placer,
): Promise<IngestResult> {
  const errors: string[] = [];
  const settled = await Promise.allSettled(items.slice(0, 50).map((item) => draftFor(item, deps)));
  if (items.length > 50) errors.push(`only the first 50 of ${items.length} items were added`);
  const frames = Object.values(board.frames);
  const commands: BoardCommandInput[] = [];
  let n = 0;
  for (const result of settled) {
    if (result.status === 'rejected') {
      errors.push((result.reason as Error)?.message ?? String(result.reason));
      continue;
    }
    const d = result.value;
    const spot = place?.({ w: d.w, h: d.h });
    const x = Math.round(spot ? spot.x : at.x - d.w / 2 + n * CASCADE);
    const y = Math.round(spot ? spot.y : at.y - d.h / 2 + n * CASCADE);
    n++;
    commands.push({
      type: 'card.added',
      card: {
        type: d.type,
        frameId: frameAt(frames, x + d.w / 2, y + d.h / 2),
        x,
        y,
        w: d.w,
        h: d.h,
        data: d.data,
        ...(d.view ? { view: d.view } : {}),
      },
    });
  }
  if (commands.length === 0) return { command: null, errors };
  return {
    command: commands.length === 1 ? commands[0]! : ({ type: 'batch', commands } as BoardCommandInput),
    errors,
  };
}
