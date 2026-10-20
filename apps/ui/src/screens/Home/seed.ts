/**
 * Seeding a canvas from Home (BUILD_PLAN P2.6, PRD Home › Search box and Scenario B): a file, link or text dropped on
 * the ask box (or a link typed into it) creates a canvas whose first card is that item.
 *
 * The canvas is created first (`canvas.create` with a `seed` description and the chosen template), because an
 * upload needs the canvas folder; then the item goes through the same path as a drop on the board (P2.5 ingest:
 * upload into `<canvas>/assets/`, then ONE board command). Items Orb cannot take are refused BEFORE anything is
 * created, so a bad drop never leaves an empty canvas behind.
 */
import {
  ASSET_TYPES,
  assetMimeOf,
  emptyBoard,
  sourceTitleOf,
  specOf,
  templateFrames,
  TEMPLATE_LAYOUT,
  type BoardState,
  type CanvasMeta,
  type CanvasSeed,
  type Depth,
  type IntakeAnswers,
  type TemplateId,
  databaseDataOf,
  newCardView,
} from '@orb/shared';
import { ingest, noteFromText, type IngestDeps, type IngestItem } from '../../cards/ingest.js';
import type { Wire } from '../../wire/index.js';

/** Where the seed card lands on a canvas without a template (inside the first view of a 1440×900 window). */
export const SEED_AT = { x: 520, y: 380 } as const;

const baseName = (name: string) => name.replace(/\.[A-Za-z0-9]+$/, '') || name;

/** Why an item cannot seed a canvas (the same checks the board applies before uploading), or null. */
export function refusal(item: IngestItem): string | null {
  if (item.kind !== 'file') return item.kind === 'text' && !item.text.trim() ? 'empty text' : null;
  const name = item.file.name || 'pasted';
  const mime = assetMimeOf(name, item.file.type);
  if (!mime) return `${name}: orb accepts PDF, PNG, JPG, GIF, WebP, CSV, Markdown and text files`;
  if (item.file.size === 0) return `${name} is empty`;
  const max = ASSET_TYPES[mime].max;
  if (item.file.size > max) return `${name} is larger than ${max / (1024 * 1024)} MB`;
  return null;
}

/** canvas.json's description of the seed: the first item's kind and name, and how many items there are. */
export function describeSeed(items: readonly IngestItem[]): CanvasSeed {
  const first = items[0]!;
  const name =
    first.kind === 'file'
      ? first.file.name || 'pasted file'
      : first.kind === 'url'
        ? first.url
        : noteFromText(first.text).title;
  return { kind: first.kind, name: name.slice(0, 300), count: Math.min(items.length, 50) };
}

/** The canvas title for a seed when the box is empty: the file's name, the link's site and path, or the text. */
export function seedPrompt(items: readonly IngestItem[]): string {
  const first = items[0]!;
  if (first.kind === 'file') return baseName(first.file.name || 'Dropped file');
  if (first.kind === 'url') return sourceTitleOf(first.url);
  return noteFromText(first.text).title;
}

/** The first board snapshot of a canvas (its template frames), as a fold for frame membership. */
async function boardOf(wire: Wire, canvasId: string): Promise<BoardState> {
  const ac = new AbortController();
  try {
    for await (const frame of wire.orb.board.follow(canvasId, { signal: ac.signal })) {
      if (frame.kind !== 'snapshot') continue;
      return {
        seq: frame.nextSeq - 1,
        cards: Object.fromEntries(frame.cards.map((c) => [c.id, c])),
        frames: Object.fromEntries(frame.frames.map((f) => [f.id, f])),
        links: Object.fromEntries(frame.links.map((l) => [l.id, l])),
      };
    }
  } finally {
    ac.abort();
  }
  return emptyBoard();
}

export type SeedDeps = Pick<IngestDeps, 'pdfSummary' | 'imageSize'>;

/**
 * Create a canvas seeded with `items` and add them as its first cards. Throws (with a user-facing message) when no
 * item can be used, before creating anything. Returns the canvas and the messages for items that were skipped.
 */
export async function seedCanvas(
  wire: Wire,
  items: readonly IngestItem[],
  options: { prompt?: string; template?: TemplateId | undefined },
  deps: SeedDeps = {},
): Promise<{ meta: CanvasMeta; errors: string[] }> {
  const usable = items.filter((item) => refusal(item) === null).slice(0, 50);
  const refused = items.map(refusal).filter((r): r is string => r !== null);
  if (usable.length === 0) throw new Error(refused.join(' · ') || 'Nothing to add');
  const prompt = options.prompt?.trim() || seedPrompt(usable);
  // start: Orb's new-canvas turn (P3.3); for a seeded canvas it asks what the user wants to understand.
  const meta = await wire.orb.canvas.create({
    prompt,
    seed: describeSeed(usable),
    start: true,
    ...(options.template ? { template: options.template } : {}),
  });
  let board = emptyBoard();
  let at: { x: number; y: number } = SEED_AT;
  if (options.template) {
    // Into the template's first frame.
    board = await boardOf(wire, meta.id);
    if (specOf(options.template)) {
      // P6.11: a v2 template's first frame holds seed cards: the drop goes into its free room at the bottom.
      const f = Object.values(board.frames).sort((a, b) => a.y - b.y || a.x - b.x)[0];
      if (f) at = { x: f.x + f.w / 2, y: f.y + f.h - 150 };
    } else {
      const first = templateFrames(options.template)[0]!;
      at = { x: first.x + TEMPLATE_LAYOUT.w / 2, y: first.y + TEMPLATE_LAYOUT.h / 2 };
    }
  }
  const { command, errors } = await ingest(usable, at, board, {
    upload: (file) => wire.assets.upload(meta.id, file),
    ...deps,
  });
  if (command) await wire.orb.board.command(meta.id, command);
  return { meta, errors: [...refused, ...errors] };
}

/**
 * P6.11: start a canvas from a v2 template's intake form. The canvas is created without Orb's turn (`start: false`),
 * the materials go onto the board (into the first frame's free room, as one board command; XLSX and JSON become
 * Databases), and only then does Orb start: the first thing its playbook does is read them.
 */
export async function startFromIntake(
  wire: Wire,
  options: {
    prompt: string;
    template: TemplateId;
    intake: IntakeAnswers;
    depth: Depth;
    items: readonly IngestItem[];
  },
  deps: SeedDeps = {},
): Promise<{ meta: CanvasMeta; errors: string[] }> {
  const usable = options.items.filter((item) => refusal(item) === null).slice(0, 50);
  const refused = options.items.map(refusal).filter((r): r is string => r !== null);
  const meta = await wire.orb.canvas.create({
    prompt: options.prompt,
    template: options.template,
    intake: options.intake,
    depth: options.depth,
    start: usable.length === 0,
  });
  if (usable.length === 0) return { meta, errors: refused };
  const errors = [...refused];
  try {
    const board = await boardOf(wire, meta.id);
    // Into the free room at the bottom of the first frame.
    const first = Object.values(board.frames).sort((a, b) => a.y - b.y || a.x - b.x)[0];
    const at = first ? { x: first.x + first.w / 2, y: first.y + first.h - 150 } : SEED_AT;
    const result = await ingest(usable, at, board, {
      upload: (file) => wire.assets.upload(meta.id, file),
      importData: async (file) => {
        const made = await wire.data.import(meta.id, { name: file.name, body: file.body, mime: file.mime });
        const ds = await wire.data.read(meta.id, made.id);
        return { data: databaseDataOf(made.name, ds), view: newCardView(ds) };
      },
      ...deps,
    });
    errors.push(...result.errors);
    if (result.command) await wire.orb.board.command(meta.id, result.command);
  } finally {
    // Orb starts even when a material could not be added: the canvas must not be left idle.
    await wire.orb.canvas.start(meta.id);
  }
  return { meta, errors };
}
