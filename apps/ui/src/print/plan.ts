/**
 * Print layout (BUILD_PLAN P4.4, PRD Port › Canvas PDF), pure so it is unit-tested without a DOM
 * (apps/ui/test/print.unit.test.ts).
 *
 * - **One page per frame** (A4 landscape): each frame in scope, in board order, with its cards and the links
 *   between them, scaled to fit the page above the footer. Cards on the open board (no frame) get their own page
 *   when the scope is the whole board.
 * - **Poster**: one page holding every frame in scope (and the open-board cards for the whole board) at a scale
 *   that keeps the longest side within POSTER_MAX.
 *
 * Stacked cards (P3.2) are left out, as on the board; a link to a stacked card is drawn to its stack.
 */
import type { BoardState, Card, Frame, Link, PrintLayout, PrintScope } from '@orb/shared';

export type Rect = { x: number; y: number; w: number; h: number };

/** A4 landscape in CSS px (297 x 210 mm at 96 dpi). */
export const A4_LANDSCAPE = { w: 1123, h: 794 } as const;
/** Page margin and footer band (CSS px). */
export const PAGE_MARGIN = 36;
export const FOOTER_H = 30;
/** Largest scale-up of a small frame on its page. */
export const MAX_SCALE = 1.5;
/** Longest side of a poster's drawing (CSS px; 50 inches, far under the PDF page limit). */
export const POSTER_MAX = 4800;

export type PlannedFrame = Frame & { index: number };

export type CanvasPage = {
  key: string;
  /** The footer's frame name ("01 Thesis", "Open board", "Whole board"). */
  label: string;
  /** World area drawn on the page. */
  world: Rect;
  /** World → page: page = (world - world.x|y) * scale + offset. */
  scale: number;
  offset: { x: number; y: number };
  frames: PlannedFrame[];
  cards: Card[];
  /** Links drawn on the page, with the ids of the items their ends are drawn at. */
  links: PlannedLink[];
};

export type PlannedLink = { link: Link; from: string; to: string };

export type CanvasPlan = { size: { w: number; h: number }; pages: CanvasPage[] };

const visible = (card: Card) => !card.stackedInto;

export function union(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** The frames of `scope` in board order, each with its board number (index in insertion order). */
export function framesInScope(board: BoardState, scope: PrintScope): PlannedFrame[] {
  const all = Object.values(board.frames).map((f, index) => ({ ...f, index }));
  if (scope === 'all') return all;
  const wanted = new Set(scope);
  return all.filter((f) => wanted.has(f.id));
}

/** Visible cards of a frame, or of the open board (`null`), in reading order (top to bottom, left to right). */
export function cardsOf(board: BoardState, frameId: string | null): Card[] {
  return Object.values(board.cards)
    .filter(visible)
    .filter((c) => (frameId === null ? !c.frameId || !board.frames[c.frameId] : c.frameId === frameId))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Every card the print of `scope` shows (frames in scope, plus the open board for the whole board). */
export function cardsInScope(board: BoardState, scope: PrintScope): Card[] {
  const out = framesInScope(board, scope).flatMap((f) => cardsOf(board, f.id));
  return scope === 'all' ? [...out, ...cardsOf(board, null)] : out;
}

/** The visible end a link is drawn at (a stacked card's stack), or undefined. */
function shownEnd(board: BoardState, id: string): string | undefined {
  if (!id.startsWith('c_')) return board.frames[id] ? id : undefined;
  let card = board.cards[id];
  for (let hops = 0; card?.stackedInto && hops < 64; hops++) card = board.cards[card.stackedInto];
  return card && !card.stackedInto ? card.id : undefined;
}

/** Links whose two (shown) ends are both among `ids`. */
function linksWithin(board: BoardState, ids: ReadonlySet<string>): PlannedLink[] {
  return Object.values(board.links).flatMap((link) => {
    const from = shownEnd(board, link.from);
    const to = shownEnd(board, link.to);
    return from !== undefined && to !== undefined && from !== to && ids.has(from) && ids.has(to)
      ? [{ link, from, to }]
      : [];
  });
}

function fit(world: Rect, area: Rect, maxScale: number): { scale: number; offset: { x: number; y: number } } {
  const scale = Math.min(area.w / world.w, area.h / world.h, maxScale);
  return {
    scale,
    offset: {
      x: area.x + (area.w - world.w * scale) / 2,
      y: area.y + (area.h - world.h * scale) / 2,
    },
  };
}

const frameName = (f: PlannedFrame) => `${String(f.index + 1).padStart(2, '0')} ${f.title}`;
/** Room around the drawing inside the page area, in world px (frame labels sit inside, links may bow out). */
const BLEED = 16;
const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by });

function page(
  board: BoardState,
  key: string,
  label: string,
  frames: PlannedFrame[],
  cards: Card[],
  size: { w: number; h: number },
  maxScale: number,
): CanvasPage {
  const world = grow(union([...frames, ...cards]) ?? { x: 0, y: 0, w: 1, h: 1 }, BLEED);
  const area = {
    x: PAGE_MARGIN,
    y: PAGE_MARGIN,
    w: size.w - 2 * PAGE_MARGIN,
    h: size.h - 2 * PAGE_MARGIN - FOOTER_H,
  };
  const ids = new Set<string>([...frames.map((f) => f.id), ...cards.map((c) => c.id)]);
  return { key, label, world, ...fit(world, area, maxScale), frames, cards, links: linksWithin(board, ids) };
}

/** The pages of a Canvas PDF. Never empty: an empty scope prints one empty page. */
export function planCanvas(
  board: BoardState,
  options: { layout: PrintLayout; scope: PrintScope },
): CanvasPlan {
  const frames = framesInScope(board, options.scope);
  const open = options.scope === 'all' ? cardsOf(board, null) : [];
  if (options.layout === 'poster') {
    const cards = [...frames.flatMap((f) => cardsOf(board, f.id)), ...open];
    const world = grow(union([...frames, ...cards]) ?? { x: 0, y: 0, w: 1, h: 1 }, BLEED);
    const scale = Math.min(1, POSTER_MAX / Math.max(world.w, world.h));
    const size = {
      w: Math.max(A4_LANDSCAPE.w, Math.ceil(world.w * scale + 2 * PAGE_MARGIN)),
      h: Math.max(A4_LANDSCAPE.h, Math.ceil(world.h * scale + 2 * PAGE_MARGIN + FOOTER_H)),
    };
    return { size, pages: [page(board, 'poster', 'Whole board', frames, cards, size, 1)] };
  }
  const size = { ...A4_LANDSCAPE };
  const pages = frames.map((f) =>
    page(board, f.id, frameName(f), [f], cardsOf(board, f.id), size, MAX_SCALE),
  );
  if (open.length > 0 || pages.length === 0)
    pages.push(page(board, 'open', 'Open board', [], open, size, MAX_SCALE));
  return { size, pages };
}

/** Page position of a world rectangle on `p`. */
export const toPage = (p: CanvasPage, r: Rect): Rect => ({
  x: (r.x - p.world.x) * p.scale + p.offset.x,
  y: (r.y - p.world.y) * p.scale + p.offset.y,
  w: r.w * p.scale,
  h: r.h * p.scale,
});

/** "Board · 01 Thesis · 14 Oct 2026 · 1 / 10". */
export function footerText(title: string, label: string, date: string, n: number, total: number): string {
  return `${title} · ${label} · ${date} · ${n} / ${total}`;
}

/** Width a design frame is laid out at for its snapshot (the board's DESIGN_VIEW_WIDTH). */
export const SNAPSHOT_VIEW_WIDTH = 640;
const SNAPSHOT_MAX_HEIGHT = 1000;
/** The design card's chrome on the board (BuilderViews DESIGN_CHROME). */
const DESIGN_CHROME = 172;

/** The CSS size a design card's screen is laid out at (as on the board: its card's aspect at 640 px wide). */
export function snapshotSize(card: Pick<Card, 'w' | 'h'>): { w: number; h: number } {
  const shownW = Math.max(120, card.w - 30);
  const shownH = Math.max(120, card.h - DESIGN_CHROME);
  const h = Math.round((shownH * SNAPSHOT_VIEW_WIDTH) / shownW);
  return { w: SNAPSHOT_VIEW_WIDTH, h: Math.min(SNAPSHOT_MAX_HEIGHT, Math.max(120, h)) };
}

/** A CSS string literal (for `content:` in `@page` margin boxes). */
export const cssString = (s: string): string =>
  `"${s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\n\r\f]/g, ' ')}"`;
