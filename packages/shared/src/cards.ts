/**
 * Card data (BUILD_PLAN P2.5, PRD "Card types and the card plugin contract", part 1 Data): the per-type schema of
 * `Card.data`, the asset reference that card data uses for files copied into `<canvas>/assets/`, and the asset
 * upload limits that the orb-host upload endpoint enforces.
 *
 * Text-like types (note, source, quote, question, risk, doc, design, diagram) take a loose object: their text fields
 * are length-checked and extra fields are kept, so agent payloads and later card versions stay readable. The types
 * that point at files (image, file) and the table are strict: an image or file card without a valid asset
 * reference, or a table whose rows do not match its columns, is refused by `planCommand`.
 */
import { z } from 'zod';
import type { CardType } from './board.js';

// ---- Assets ----

/** File name of an asset inside `<canvas>/assets/`: no directories, no leading dot. */
export const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/** `assets/<name>`: the only shape of a path that card data may point at. */
export const AssetPath = z
  .string()
  .regex(/^assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/)
  .refine((p) => !p.includes('..'), { message: 'no dot-dot in asset paths' });

/**
 * What a user may drop or paste (PRD Canvas › Adding content): PDF, PNG, JPG, GIF, WebP, CSV, Markdown and plain
 * text. `max` is the upload cap in bytes; `ext` the extension the stored copy gets.
 */
export const ASSET_TYPES = {
  'application/pdf': { kind: 'pdf', ext: 'pdf', max: 50 * 1024 * 1024 },
  'image/png': { kind: 'image', ext: 'png', max: 20 * 1024 * 1024 },
  'image/jpeg': { kind: 'image', ext: 'jpg', max: 20 * 1024 * 1024 },
  'image/gif': { kind: 'image', ext: 'gif', max: 20 * 1024 * 1024 },
  'image/webp': { kind: 'image', ext: 'webp', max: 20 * 1024 * 1024 },
  'text/csv': { kind: 'text', ext: 'csv', max: 10 * 1024 * 1024 },
  'text/markdown': { kind: 'text', ext: 'md', max: 5 * 1024 * 1024 },
  'text/plain': { kind: 'text', ext: 'txt', max: 5 * 1024 * 1024 },
} as const;
export type AssetMime = keyof typeof ASSET_TYPES;
export const AssetMime = z.enum(Object.keys(ASSET_TYPES) as [AssetMime, ...AssetMime[]]);

/** Largest upload of any type (the endpoint refuses a body above the type's own cap). */
export const MAX_ASSET_BYTES = Math.max(...Object.values(ASSET_TYPES).map((t) => t.max));

const EXT_MIME: Record<string, AssetMime> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  csv: 'text/csv',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  text: 'text/plain',
};

/**
 * The asset type of a dropped file: its declared MIME type when Orb supports it, otherwise its extension (Finder
 * gives `.md` and `.csv` files an empty or vendor type). Undefined when the file is not supported.
 */
export function assetMimeOf(name: string, declared?: string): AssetMime | undefined {
  const type = (declared ?? '').split(';', 1)[0]!.trim().toLowerCase();
  if (type === 'image/jpg') return 'image/jpeg';
  if (type in ASSET_TYPES) return type as AssetMime;
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase();
  return ext ? EXT_MIME[ext] : undefined;
}

/** A file the orb-host endpoint stored in `<canvas>/assets/`. `name` is the original file name (display only). */
export const AssetRef = z.strictObject({
  path: AssetPath,
  name: z.string().min(1).max(255),
  mime: AssetMime,
  size: z.number().int().nonnegative(),
});
export type AssetRef = z.infer<typeof AssetRef>;

/** The JSON body the upload endpoint answers with. */
export const AssetUploadResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), asset: AssetRef }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string(), message: z.string() }),
  }),
]);
export type AssetUploadResult = z.infer<typeof AssetUploadResult>;

/** Endpoints of the asset routes (exact `/api` Fetch routes registered by orb-host). */
export const ASSET_UPLOAD_PATH = '/api/orb-asset/upload';
export const ASSET_FILE_PATH = '/api/orb-asset/file';

// ---- Per-type card data ----

const TEXT_MAX = 20_000;
const Text = (max = TEXT_MAX) => z.string().max(max);

/** http(s) URL a Source card links to. */
export const SourceUrl = z
  .string()
  .max(4096)
  .refine(
    (u) => {
      try {
        const url = new URL(u);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'a source URL must be http(s)' },
  );

/** Loose text card: title/body/text checked, anything else kept. */
const TextData = z.looseObject({
  title: Text(500).optional(),
  body: Text().optional(),
  text: Text().optional(),
});

/** Note (Paper): the user's own text. A dropped Markdown or text file becomes a note with its text (+ the file). */
export const NoteData = z.looseObject({
  title: Text(500).optional(),
  body: Text().optional(),
  text: Text().optional(),
  asset: AssetRef.optional(),
});
export type NoteData = z.infer<typeof NoteData>;

/** Most excerpts a Source card keeps, and the longest one (PRD: the link, the summary and SHORT excerpts). */
export const SOURCE_EXCERPTS = { count: 5, chars: 400 } as const;

/** Source: a link, the agent's summary and short excerpts (P2.5: a pasted URL alone). */
export const SourceData = z.looseObject({
  url: SourceUrl.optional(),
  title: Text(500).optional(),
  body: Text().optional(),
  summary: Text().optional(),
  excerpts: z.array(Text(SOURCE_EXCERPTS.chars)).max(SOURCE_EXCERPTS.count).optional(),
});
export type SourceData = z.infer<typeof SourceData>;

/** Image or screenshot: the stored file, a caption, and the natural size. */
export const ImageData = z.strictObject({
  asset: AssetRef,
  title: Text(500),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type ImageData = z.infer<typeof ImageData>;

/** File or PDF: the stored file, its title, the page count and the first-page thumbnail (rendered by pdf.js). */
export const FileData = z.strictObject({
  asset: AssetRef,
  title: Text(500),
  pages: z.number().int().nonnegative().nullable(),
  thumb: AssetRef.optional(),
});
export type FileData = z.infer<typeof FileData>;

/** Table limits: what the card itself holds (the full CSV stays in assets/). */
export const TABLE_LIMITS = { columns: 50, rows: 1000, cell: 500, bytes: 512 * 1024 } as const;

export const TableSort = z.strictObject({
  column: z.number().int().nonnegative(),
  dir: z.enum(['asc', 'desc']),
});
export type TableSort = z.infer<typeof TableSort>;

/** Table: columns + rows (strings, as imported), the full row count, the CSV file, and the saved sort. */
export const TableData = z
  .strictObject({
    title: Text(500),
    columns: z.array(z.string().max(TABLE_LIMITS.cell)).min(1).max(TABLE_LIMITS.columns),
    rows: z.array(z.array(z.string().max(TABLE_LIMITS.cell))).max(TABLE_LIMITS.rows),
    totalRows: z.number().int().nonnegative(),
    asset: AssetRef.optional(),
    sort: TableSort.optional(),
  })
  .refine((t) => t.rows.every((r) => r.length === t.columns.length), {
    message: 'every table row needs one cell per column',
  })
  .refine((t) => !t.sort || t.sort.column < t.columns.length, { message: 'sort column out of range' })
  .refine((t) => t.totalRows >= t.rows.length, { message: 'totalRows is less than the rows held' })
  .refine((t) => JSON.stringify(t).length <= TABLE_LIMITS.bytes, { message: 'table data is too large' });
export type TableData = z.infer<typeof TableData>;

/** A card id (`c_…`) that card data points at (a quote's source card). */
const CardRef = z.string().regex(/^c_[A-Za-z0-9]{1,64}$/);

/**
 * Quote (P3.1): `body` is the excerpt (an agent's is under 50 words, checked by the orb-cards registry), `title` the
 * source's name; `url` and `sourceCardId` say where it comes from.
 */
export const QuoteData = z.looseObject({
  title: Text(500).optional(),
  body: Text().optional(),
  text: Text().optional(),
  url: SourceUrl.optional(),
  sourceCardId: CardRef.optional(),
});
export type QuoteData = z.infer<typeof QuoteData>;

/** Question (P3.1): the question as `title`, context in `body`, an open or answered state and the answer. */
export const QuestionData = z.looseObject({
  title: Text(500).optional(),
  body: Text().optional(),
  text: Text().optional(),
  state: z.enum(['open', 'answered']).optional(),
  answer: Text(4000).optional(),
});
export type QuestionData = z.infer<typeof QuestionData>;

/** Risk or claim (P3.1): the risk or claim as `title`, why it matters in `body`; `kind` picks the label. */
export const RiskData = z.looseObject({
  title: Text(500).optional(),
  body: Text().optional(),
  text: Text().optional(),
  kind: z.enum(['risk', 'claim']).optional(),
});
export type RiskData = z.infer<typeof RiskData>;

/** Largest HTML a design frame card holds (P3.1). */
export const DESIGN_HTML_MAX = 100_000;

/** Folder of the design frames' HTML files inside a canvas (P3.8): `assets/design/<cardId>.html`. */
export const DESIGN_DIR = 'assets/design';

/** Path of a design card's HTML file inside its canvas (P3.8). */
export const designAssetPath = (cardId: string): string => `${DESIGN_DIR}/${cardId}.html`;

/** `assets/design/<cardId>.html`: the only shape of a design card's file path. */
export const DesignAssetPath = z.string().regex(/^assets\/design\/c_[A-Za-z0-9_-]{1,60}\.html$/);

/**
 * The Content-Security-Policy every design frame renders under (PRD Card types › Design frames; P6.2 interactive
 * frames). The frame is its own page served by the sidecar (`DESIGN_FRAME_PATH`), so this policy is the document's
 * own (a response header), not the app's: inline scripts run (with the bundled Chart.js and D3 inlined when the HTML
 * uses them), and nothing can reach the network (`connect-src 'none'`, no remote script, style, image, font, media,
 * frame, worker, form or base). `sandbox allow-scripts` makes the document an opaque origin even when it is opened
 * on its own: no cookie, no storage, no access to the app.
 */
export const DESIGN_FRAME_CSP = [
  'sandbox allow-scripts',
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "worker-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
  "manifest-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join('; ');

/** The sandbox of a design frame's iframe: scripts in an opaque origin, never `allow-same-origin` (PRD). */
export const DESIGN_FRAME_SANDBOX = 'allow-scripts';

/**
 * P6.2: the sidecar route that serves one design frame as its own page,
 * `GET /api/orb-design/frame?canvas=<id>&card=<cardId>&v=<version>[&print=1]` (an exact `/api` Fetch route of
 * orb-host, behind the gateway's auth cookie). The app's CSP allows only this path in `frame-src`, and the Electron
 * CSP override leaves this route's own CSP in place.
 */
export const DESIGN_FRAME_PATH = '/api/orb-design/frame';

/** The message a design frame posts to its parent once it has loaded and drawn (print waits for it). */
export const DESIGN_FRAME_READY = 'orb-design-frame-ready';

/** The message a design frame posts when Escape is pressed inside it (focus is in the frame; the reader closes). */
export const DESIGN_FRAME_ESCAPE = 'orb-design-frame-escape';

/** The query of a design frame's URL (relative to the sidecar origin). */
export function designFrameQuery(
  canvasId: string,
  cardId: string,
  version: number,
  options: { print?: boolean } = {},
): string {
  const q = new URLSearchParams({ canvas: canvasId, card: cardId, v: String(version) });
  if (options.print) q.set('print', '1');
  return q.toString();
}

/**
 * Design frame (P3.1, P3.8; interactive since P6.2): one HTML screen, what it shows (`body`), when it was last written and how many
 * times (`version`), and its file in the canvas (`asset` = `assets/design/<cardId>.html`, written by orb-canvas on
 * every write). The HTML stays in the card too, so the board renders, searches and describes it from the log alone.
 */
export const DesignData = z.looseObject({
  title: Text(500).optional(),
  body: Text().optional(),
  html: Text(DESIGN_HTML_MAX).optional(),
  updatedAt: z.number().int().nonnegative().optional(),
  version: z.number().int().positive().optional(),
  asset: DesignAssetPath.optional(),
});
export type DesignData = z.infer<typeof DesignData>;

/** Diagram (P3.1): Mermaid source and a caption (`body`). */
export const DiagramData = z.looseObject({
  title: Text(500).optional(),
  body: Text().optional(),
  mermaid: Text(TEXT_MAX).optional(),
});
export type DiagramData = z.infer<typeof DiagramData>;

/** How many cards one `consolidate_cards` call may stack (P3.2). */
export const STACK_LIMITS = { min: 2, max: 50, title: 200, summary: 4000 } as const;

/** One consolidated card as its stack lists it: id, type and title at the time it was stacked. */
export const StackItem = z.strictObject({
  id: CardRef,
  type: z.string().min(1).max(32),
  title: Text(STACK_LIMITS.title),
});
export type StackItem = z.infer<typeof StackItem>;

/**
 * A stack card (P3.2, `consolidate_cards`): a doc card whose `data.stack` lists the cards an agent collapsed into it.
 * The stacked cards stay in the board with `stackedInto` = the stack's id; they are hidden on the board, left out of
 * `query_board`, search and the reading queue, and removed with the stack.
 */
export const StackInfo = z.strictObject({
  count: z.number().int().min(STACK_LIMITS.min).max(STACK_LIMITS.max),
  items: z.array(StackItem).min(STACK_LIMITS.min).max(STACK_LIMITS.max),
});
export type StackInfo = z.infer<typeof StackInfo>;

/** Doc draft: Orb's long text card, a heading (`title`) and a body. A stack card is a doc with `stack` (P3.2). */
export const DocData = TextData.extend({ stack: StackInfo.optional() });
export type DocData = z.infer<typeof DocData>;

/** The stack a card holds (a doc card made by `consolidate_cards`), or undefined. */
export function stackOf(card: { type: CardType; data: unknown }): StackInfo | undefined {
  if (card.type !== 'doc') return undefined;
  const parsed = StackInfo.safeParse((card.data as { stack?: unknown } | null | undefined)?.stack);
  return parsed.success ? parsed.data : undefined;
}

/** Parse card data for rendering: the typed data, or undefined when it does not match its type. */
export function readCardData<T>(schema: z.ZodType<T>, data: unknown): T | undefined {
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

/** The title of any card (for the reading queue, search and tooltips). */
export function cardTitle(card: { type: CardType; data: unknown }): string {
  const d = (card.data ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const first = str(d.title) ?? str(d.text)?.split('\n', 1)[0] ?? str(d.body)?.split('\n', 1)[0];
  if (first) return first.slice(0, 200);
  if (card.type === 'source' && typeof d.url === 'string') return d.url;
  return card.type === 'note' ? 'Untitled note' : `Untitled ${card.type}`;
}

// ---- CSV (Table import) ----

/**
 * Parse CSV text (RFC 4180: quoted fields, doubled quotes, CR/LF/CRLF line ends, quoted line breaks). A leading
 * BOM is dropped; a final empty line is not a row. The delimiter is `,` unless the first line has more `;` or tabs.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const firstLine = text.slice(0, text.search(/\r|\n|$/));
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delim = [',', ';', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === delim) endField();
    else if (ch === '\r') {
      endRow();
      if (text[i + 1] === '\n') i++;
    } else if (ch === '\n') endRow();
    else field += ch;
    i++;
  }
  if (field !== '' || row.length > 0 || quoted) endRow();
  return rows;
}

/** Bytes of the table budget tableFromCsv leaves for fields added after the cut (see below). */
const TABLE_RESERVE = 2048;

/**
 * Table card data from CSV text: the first row is the header (blank headers become `Column n`), rows are padded or
 * cut to the header width, and the card keeps at most TABLE_LIMITS rows/columns/cell length and bytes (`totalRows`
 * counts every data row). Throws when the text has no header row.
 */
export function tableFromCsv(csv: string, title: string, asset?: AssetRef): TableData {
  const all = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ''));
  if (all.length === 0) throw new Error('the CSV file has no rows');
  const cut = (s: string) => s.slice(0, TABLE_LIMITS.cell);
  const header = all[0]!.slice(0, TABLE_LIMITS.columns);
  const columns = header.map((h, i) => cut(h.trim()) || `Column ${i + 1}`);
  const body = all.slice(1);
  const rows: string[][] = [];
  // Room kept for what the card gains later and the schema counts too: the stored CSV's ref (`asset`, whose
  // display name alone may be 255 characters, more once JSON-escaped), `totalRows`, the keys, and a saved `sort`.
  let bytes = JSON.stringify({ title, columns }).length + TABLE_RESERVE;
  for (const r of body.slice(0, TABLE_LIMITS.rows)) {
    const cells = columns.map((_, i) => cut(r[i] ?? ''));
    bytes += JSON.stringify(cells).length + 1;
    if (bytes > TABLE_LIMITS.bytes) break;
    rows.push(cells);
  }
  return {
    title: title.slice(0, 500),
    columns,
    rows,
    totalRows: body.length,
    ...(asset ? { asset } : {}),
  };
}

/** Numeric value of a cell for sorting (`1,234.5`, `-3`, `12%`, `$40`), or undefined for text. */
function numeric(cell: string): number | undefined {
  const s = cell
    .trim()
    .replace(/^[$€£]/, '')
    .replace(/%$/, '')
    .replace(/,(?=\d{3}\b)/g, '');
  if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return undefined;
  return Number(s);
}

/**
 * Rows sorted by one column (stable): numbers before text, numbers numerically, text with a natural locale compare;
 * empty cells always last. Returns the row indexes in display order.
 */
export function sortTableRows(rows: readonly string[][], sort: TableSort | undefined): number[] {
  const order = rows.map((_, i) => i);
  if (!sort) return order;
  const sign = sort.dir === 'asc' ? 1 : -1;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return order.sort((a, b) => {
    const x = rows[a]![sort.column] ?? '';
    const y = rows[b]![sort.column] ?? '';
    if (x.trim() === '' || y.trim() === '') {
      if (x.trim() === '' && y.trim() === '') return a - b;
      return x.trim() === '' ? 1 : -1;
    }
    const nx = numeric(x);
    const ny = numeric(y);
    let c: number;
    if (nx !== undefined && ny !== undefined) c = nx - ny;
    else if (nx !== undefined) c = -1;
    else if (ny !== undefined) c = 1;
    else c = collator.compare(x, y);
    return c !== 0 ? c * sign : a - b;
  });
}

/** The next sort when a column header is clicked: ascending, then descending, then unsorted. */
export function nextSort(current: TableSort | undefined, column: number): TableSort | undefined {
  if (!current || current.column !== column) return { column, dir: 'asc' };
  return current.dir === 'asc' ? { column, dir: 'desc' } : undefined;
}

/** A Source card title from its URL: the host without `www.` plus the path. */
export function sourceTitleOf(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : decodeURIComponent(u.pathname).replace(/\/$/, '');
    return `${u.hostname.replace(/^www\./, '')}${path}`.slice(0, 200);
  } catch {
    return url.slice(0, 200);
  }
}

/** True when `text` is a single http(s) URL (what a paste or a dropped link must be to become a Source card). */
export function isHttpUrl(text: string): boolean {
  const t = text.trim();
  return !/\s/.test(t) && SourceUrl.safeParse(t).success;
}

/**
 * Plain-text description of a card's content for agents (PRD card contract part 3 "Describe"; `query_board`):
 * an image's caption and size, a PDF's title and page count, a table's columns, row count and first rows, a source's
 * link and summary, a note's text. At most `max` characters.
 */
export function describeCardData(card: { type: CardType; data: unknown }, max = 500): string {
  const cut = (s: string) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
  const d = (card.data ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  if (card.type === 'image') {
    const img = readCardData(ImageData, card.data);
    if (img) {
      const size = img.width && img.height ? `, ${img.width}×${img.height}` : '';
      return cut(`Image "${img.title}" (${img.asset.name}${size}).`);
    }
  }
  if (card.type === 'file') {
    const f = readCardData(FileData, card.data);
    if (f) {
      const pages = f.pages === null ? '' : `, ${f.pages} page${f.pages === 1 ? '' : 's'}`;
      return cut(`File "${f.title}" (${f.asset.name}${pages}).`);
    }
  }
  if (card.type === 'table') {
    const t = readCardData(TableData, card.data);
    if (t) {
      const rows = t.rows
        .slice(0, 5)
        .map((r) => r.join(' | '))
        .join('; ');
      return cut(`Table with columns ${t.columns.join(', ')}; ${t.totalRows} rows. First rows: ${rows}`);
    }
  }
  if (card.type === 'source') {
    const url = str(d.url);
    const text = str(d.summary) || str(d.body);
    return cut([url, text].filter(Boolean).join(' — '));
  }
  return cut(str(d.body) || str(d.text));
}
