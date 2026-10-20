/**
 * The layout engine (BUILD_PLAN P3.2, PRD Canvas › Cards; P6.20 board layout quality): agents never pick coordinates.
 * They name a frame, and this places the card in that frame's grid. Pure and harness-free; the canvas service calls it
 * inside the same tick as the append, so two agents placing at once never get the same cell.
 *
 * The grid of a frame: columns of `LAYOUT.col` px with `LAYOUT.gap` between them, inside `LAYOUT.pad` of the frame's
 * sides and below its title band (`LAYOUT.top`). Each card type has a cell (`CELLS`: a column span and a default
 * height); a card's REAL height is its own `h`: an estimate from its content when it is placed (`cellOf`), then the
 * height the renderer measured (`planMeasured`, persisted as `card.updated` events, so a reopened board is exact), kept
 * inside the type's range (`HEIGHTS`). A card never exceeds its frame's width: the frame widens for it.
 *
 * Placement is "first free cell" in reading order, a masonry-style skyline pack: the candidate rows are the top of the
 * grid and the bottom (+ gap) of every card already in the frame; the first row, then the first column, where the
 * card's cell keeps a `gap` from every visible card of the frame (its own cards, and any card lying on it, user cards
 * too, wherever they were dragged) wins; below the frame, every card that will not move with a pushed frame (user
 * cards, cards of a locked frame, open-board cards) is in the way too.
 *
 * When no cell inside the frame is free the frame GROWS SIDEWAYS first: one grid column at a time, up to
 * `LAYOUT.maxCols` columns, while it stays landscape (`LAYOUT.aspect`) and does not run into a frame or card that
 * will not move; the first width where the card fits without growing taller wins. Only when no width helps does the
 * frame grow DOWNWARD. A frame that grows pushes the frames to its right and below it (`pushFrames`) so it does not
 * grow over them: each keeps the gap it had (at most `LAYOUT.frameGap`), in a cascade; a frame that holds a user card
 * is never moved by an agent's placement. Unlocked neighbours move around these fixed frames; impossible growth
 * between two fixed frames returns FRAME_FULL. A frame whose content shrinks (a card measured
 * shorter) pulls the frames that follow it closer, never into another frame.
 *
 * Cards on the open board (no frame) use the same rule in an open region from (80, 80), 8 columns wide, with every
 * frame as an obstacle too, so they never land on a frame.
 */
import {
  HEIGHTS,
  MIN_CARD_H,
  TEMPLATE_LAYOUT,
  applyChanges,
  boardCards,
  boardFrames,
  clampHeight,
  isPinned,
  stackOf,
  type BoardChange,
  type BoardState,
  type Card,
  type CardType,
  type Frame,
} from '@orb/shared';
import { CanvasError, isCanvasError } from './errors.js';

export const LAYOUT = {
  /** Width of one grid column. */
  col: 132,
  /** Space between columns, rows and any two cards. */
  gap: 16,
  /** Inner padding of a frame (sides and bottom). */
  pad: 24,
  /** Top of a frame's grid below its edge (the title band). */
  top: 56,
  /** Gap kept between a growing frame and the frames it pushes (the template frames' gap). */
  frameGap: 48,
  /** The open board's region: origin and columns. */
  board: { x: 80, y: 80, cols: 8 },
  /** P6.20: the most grid columns a frame grows to sideways before it grows taller. */
  maxCols: 8,
  /** P6.20: a frame stops growing sideways when it would be wider than this many times its height. */
  aspect: 2.4,
} as const;

/** A card type's cell: how many columns it spans and its default height (the estimate's ceiling for tall types). */
export type Cell = { cols: number; h: number };

/** Cell sizes per card type (P3.2). Small cards take two columns; long text, tables and diagrams three; designs four. */
export const CELLS: Readonly<Record<CardType | 'stack', Cell>> = Object.freeze({
  note: { cols: 2, h: 220 },
  source: { cols: 2, h: 240 },
  quote: { cols: 2, h: 220 },
  image: { cols: 2, h: 260 },
  file: { cols: 2, h: 260 },
  question: { cols: 2, h: 220 },
  risk: { cols: 2, h: 220 },
  doc: { cols: 3, h: 300 },
  table: { cols: 3, h: 300 },
  database: { cols: 4, h: 340 },
  insight: { cols: 3, h: 260 },
  hypothesis: { cols: 3, h: 280 },
  decision: { cols: 3, h: 340 },
  framework: { cols: 4, h: 360 },
  entity: { cols: 2, h: 260 },
  product: { cols: 3, h: 300 },
  video: { cols: 2, h: 300 },
  code: { cols: 3, h: 300 },
  math: { cols: 2, h: 220 },
  checklist: { cols: 2, h: 280 },
  research: { cols: 3, h: 300 },
  watch: { cols: 2, h: 260 },
  diagram: { cols: 3, h: 300 },
  design: { cols: 4, h: 380 },
  chart: { cols: 3, h: 300 },
  metric: { cols: 2, h: 240 },
  timeline: { cols: 4, h: 380 },
  matrix: { cols: 4, h: 300 },
  stack: { cols: 2, h: 240 },
});

export { HEIGHTS, MIN_CARD_H, clampHeight };

/** Types whose body is mostly running text: their height follows the text. */
const TEXT_TYPES: ReadonlySet<string> = new Set([
  'note',
  'quote',
  'question',
  'risk',
  'source',
  'doc',
  'insight',
  'hypothesis',
  'entity',
  'product',
]);
/** Data members that hold a card's running text, in the order they are tried. */
const TEXT_KEYS = [
  'summary',
  'text',
  'body',
  'statement',
  'quote',
  'description',
  'rationale',
  'takeaway',
] as const;

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** A guess of a card's height from its content (the renderer's measurement replaces it): text lines, rows, a title. */
export function estimateHeight(
  key: CardType | 'stack',
  data: unknown,
  why: string | undefined,
  cols: number,
): number {
  const base = CELLS[key].h;
  const d = record(data);
  const innerW = spanWidth(cols) - 30;
  const title = typeof d.title === 'string' ? d.title : '';
  const titleLines = Math.min(2, Math.max(1, Math.ceil((title.length * 9.6) / innerW)));
  const whyLines = why ? Math.min(2, Math.max(1, Math.ceil(((why.length + 5) * 6.6) / innerW))) : 0;
  // padding + border, kind row, title, why line, footer, and the gaps between them.
  const chrome = 30 + 24 + titleLines * 21 + 8 + (whyLines ? 8 + whyLines * 17 : 0) + 34;
  const ceiling = Math.max(0, base - (30 + 24 + 21 + 8 + 8 + 17 + 34));
  let body: number;
  if (TEXT_TYPES.has(key)) {
    const text = TEXT_KEYS.map((k) => d[k]).find((v) => typeof v === 'string') as string | undefined;
    const lines = Math.max(1, Math.ceil(((text?.length ?? 0) * 6.7) / innerW));
    body = Math.min(ceiling, lines * 19 + 8);
  } else if (key === 'database') {
    const rows = Math.min(10, typeof d.rowCount === 'number' ? d.rowCount : 3);
    body = Math.min(ceiling, 40 + rows * 28);
  } else if (key === 'table') {
    const rows = Array.isArray(d.rows) ? d.rows.length : 3;
    body = Math.min(ceiling, 40 + Math.min(10, rows) * 28);
  } else if (key === 'checklist') {
    const items = Array.isArray(d.items) ? d.items.length : 3;
    body = Math.min(ceiling, Math.min(12, items) * 26 + 8);
  } else {
    body = ceiling;
  }
  return clampHeight(key, chrome + body);
}

/** Grid columns a card of width `w` takes up (a card that is not a whole number of columns wide takes the next one). */
export const spanOfWidth = (w: number): number =>
  Math.max(1, Math.min(LAYOUT.maxCols, Math.ceil((w + LAYOUT.gap - 0.5) / (LAYOUT.col + LAYOUT.gap))));

/**
 * The cell of a card: its column span and its height. A card being placed (no `h`, no `w`) takes its type's span and an
 * estimate from its content; a card that is already on the board takes the columns its own width covers (so a card that
 * is not a whole number of columns wide never overlaps its neighbour when it is laid out again) and its own `h`, kept
 * in the type's range.
 */
export function cellOf(card: {
  type: CardType;
  data: unknown;
  why?: string | undefined;
  h?: number | undefined;
  w?: number | undefined;
}): Cell {
  const key = stackOf(card) ? 'stack' : card.type;
  const cols =
    typeof card.w === 'number' && Number.isFinite(card.w) && card.w > 0
      ? spanOfWidth(card.w)
      : CELLS[key].cols;
  return {
    cols,
    h:
      typeof card.h === 'number' && Number.isFinite(card.h)
        ? clampHeight(key, card.h)
        : estimateHeight(key, card.data, card.why, cols),
  };
}

/** Width of `span` columns. */
export const spanWidth = (span: number): number => span * LAYOUT.col + (span - 1) * LAYOUT.gap;

/** Width of a frame with `cols` grid columns. */
export const frameWidth = (cols: number): number => spanWidth(cols) + 2 * LAYOUT.pad;

export type Rect = { x: number; y: number; w: number; h: number };

/** Where a card goes, and the frame's new size when it had to grow for it. */
export type Placement = Rect & { grow?: { w?: number; h?: number } };

/** True when `r` comes within `gap` of `o` (touching at exactly `gap` is fine). */
const crowds = (r: Rect, o: Rect, gap: number) =>
  r.x < o.x + o.w + gap && r.x + r.w > o.x - gap && r.y < o.y + o.h + gap && r.y + r.h > o.y - gap;

/** Visible cards: every card that is not stacked into another (and not in `skip`). */
export function visibleCards(state: BoardState, skip: ReadonlySet<string> = new Set()): Card[] {
  return Object.values(state.cards).filter((c) => !c.stackedInto && !skip.has(c.id));
}

/**
 * First free cell of `size` in a grid at (`x0`, `y0`) with `cols` columns, avoiding `obstacles`. Rows are tried top
 * to bottom (the grid top, then every obstacle bottom + gap), columns left to right. Always finds a cell: the row
 * below every obstacle is free.
 */
export function firstFreeCell(
  x0: number,
  y0: number,
  cols: number,
  cell: Cell,
  obstacles: readonly Rect[],
): Rect {
  const { col, gap } = LAYOUT;
  const span = Math.max(1, Math.min(cell.cols, cols));
  const w = spanWidth(span);
  const bandRight = x0 + spanWidth(Math.max(1, cols));
  // Only what overlaps the grid's column band (from y0 down, with the gap) can block a cell.
  const near = obstacles.filter((o) => o.x < bandRight + gap && o.x + o.w > x0 - gap && o.y + o.h + gap > y0);
  const rows = [...new Set([y0, ...near.map((o) => o.y + o.h + gap).filter((y) => y > y0)])].sort(
    (a, b) => a - b,
  );
  for (const y of rows) {
    for (let c = 0; c + span <= Math.max(span, cols); c++) {
      const r = { x: x0 + c * (col + gap), y, w, h: cell.h };
      if (!near.some((o) => crowds(r, o, gap))) return r;
    }
  }
  // Unreachable: the last row is below every obstacle. Kept as a safe fallback.
  const bottom = Math.max(y0, ...near.map((o) => o.y + o.h + gap));
  return { x: x0, y: bottom, w, h: cell.h };
}

/**
 * P3.6 (thread cards, PRD Threads › "placed next to the card the thread belongs to"): the free cell of `size` in the
 * same grid as `firstFreeCell` that is closest to `anchor`: right of it or below it, measured from the cell's corner
 * to those two spots. Rows are the grid top, every obstacle bottom + gap and the row below everything, so a free
 * cell always exists.
 */
export function nearestFreeCell(
  x0: number,
  y0: number,
  cols: number,
  cell: Cell,
  obstacles: readonly Rect[],
  anchor: Rect,
): Rect {
  const { col, gap } = LAYOUT;
  const span = Math.max(1, Math.min(cell.cols, cols));
  const w = spanWidth(span);
  const bandRight = x0 + spanWidth(Math.max(1, cols));
  const near = obstacles.filter((o) => o.x < bandRight + gap && o.x + o.w > x0 - gap && o.y + o.h + gap > y0);
  const bottom = Math.max(y0, ...near.map((o) => o.y + o.h + gap));
  const rows = [...new Set([y0, bottom, ...near.map((o) => o.y + o.h + gap).filter((y) => y > y0)])].sort(
    (a, b) => a - b,
  );
  const spots = [
    { x: anchor.x + anchor.w + gap, y: anchor.y },
    { x: anchor.x, y: anchor.y + anchor.h + gap },
  ];
  let best: Rect | undefined;
  let bestScore = Infinity;
  for (const y of rows) {
    for (let c = 0; c + span <= Math.max(span, cols); c++) {
      const r = { x: x0 + c * (col + gap), y, w, h: cell.h };
      if (near.some((o) => crowds(r, o, gap))) continue;
      const score = Math.min(...spots.map((p) => Math.hypot(r.x - p.x, r.y - p.y)));
      if (score < bestScore) {
        best = r;
        bestScore = score;
      }
    }
  }
  return best ?? { x: x0, y: bottom, w, h: cell.h };
}

/** Frames that hold a pinned card (the user's own, or one the user moved; P6.8): an agent's placement never moves them (`pushFrames`' `locked`). */
export function lockedFrames(state: BoardState): Set<string> {
  const out = new Set<string>();
  for (const c of Object.values(state.cards)) if (isPinned(c) && c.frameId) out.add(c.frameId);
  return out;
}

/** Grid columns that fit in a frame (0 when the frame is narrower than one column). */
export const frameColumns = (frame: Pick<Frame, 'w'>): number =>
  Math.max(0, Math.floor((frame.w - 2 * LAYOUT.pad + LAYOUT.gap) / (LAYOUT.col + LAYOUT.gap)));

/**
 * Place a card of `cell` in `frame`, among the visible cards of `state` (minus `skip`: e.g. the cards being stacked).
 * Returns the card's rectangle, and `grow` when the frame must grow to hold it: SIDEWAYS first (one grid column at a
 * time, up to `LAYOUT.maxCols`, while the frame stays landscape and clear of what will not move), the first width
 * where the card fits without a taller frame; only then downward. A card wider than the frame always widens it.
 */
export function placeInFrame(
  state: BoardState,
  frame: Frame,
  cell: Cell,
  skip: ReadonlySet<string> = new Set(),
  /** P3.6: take the free cell nearest this rectangle (a thread's card) instead of the first one. */
  near?: Rect,
): Placement {
  const { pad, top } = LAYOUT;
  const cols0 = frameColumns(frame);
  const need = Math.max(1, Math.min(cell.cols, LAYOUT.maxCols));
  // Cards that will move with a frame this one pushes when it grows (an unlocked frame below it or to its right) are
  // not in the way; every other visible card stays where it is, so the cell must keep clear of it: this frame's
  // cards, anything lying on it, user cards (anywhere), cards of a locked frame (one holding a user card, which is
  // never pushed), cards of frames above or left of this one, and open-board cards.
  const locked = lockedFrames(state);
  const pushable = (frameId: string | null) => {
    const f = frameId && frameId !== frame.id ? state.frames[frameId] : undefined;
    return !!f && !locked.has(f.id) && (f.y > frame.y || f.x > frame.x);
  };
  const obstacles = visibleCards(state, skip).filter(
    (c) => c.frameId === frame.id || crowds(c, frame, 0) || isPinned(c) || !pushable(c.frameId),
  );
  const lockedRects = [...locked]
    .filter((id) => id !== frame.id && state.frames[id])
    .map((id) => state.frames[id]!);
  const x0 = frame.x + pad;
  const y0 = frame.y + top;
  const place = (cols: number): Rect =>
    near
      ? nearestFreeCell(x0, y0, Math.max(1, cols), cell, obstacles, near)
      : firstFreeCell(x0, y0, Math.max(1, cols), cell, obstacles);
  const fits = (r: Rect) => r.y + r.h + pad <= frame.y + frame.h;
  let cols = Math.max(cols0, need);
  let r = place(cols);
  if (!fits(r)) {
    for (let c = cols + 1; c <= LAYOUT.maxCols; c++) {
      const w = frameWidth(c);
      if (w > LAYOUT.aspect * frame.h) break;
      if (lockedRects.some((f) => crowds({ x: frame.x, y: frame.y, w, h: frame.h }, f, 0))) break;
      const wider = place(c);
      if (fits(wider)) {
        cols = c;
        r = wider;
        break;
      }
    }
  }
  const grow: { w?: number; h?: number } = {};
  if (cols > cols0) grow.w = frameWidth(cols);
  const needH = r.y + r.h + pad - frame.y;
  if (needH > frame.h) grow.h = needH;
  return grow.w !== undefined || grow.h !== undefined ? { ...r, grow } : r;
}

/** Place a card of `cell` on the open board (no frame): clear of every visible card and every frame. */
export function placeOnBoard(
  state: BoardState,
  cell: Cell,
  skip: ReadonlySet<string> = new Set(),
  /** P3.6: a grid starting at this card (a thread's card, on the open board), its nearest free cell. */
  near?: Rect,
): Rect {
  const obstacles: Rect[] = [...visibleCards(state, skip), ...Object.values(state.frames)];
  if (near) return nearestFreeCell(near.x, near.y, LAYOUT.board.cols, cell, obstacles, near);
  const { x, y, cols } = LAYOUT.board;
  return firstFreeCell(x, y, cols, cell, obstacles);
}

/** How far a frame moved. */
export type FrameShift = { dx: number; dy: number };

const xOverlap = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x;
const yOverlap = (a: Rect, b: Rect) => a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * The frames to move when `frame` changes size to `next` (it grows, or shrinks), and by how much (`id → {dx, dy}`).
 * A frame to the right of the changing one (rows overlapping) follows its right edge, and a frame below it (columns
 * overlapping) follows its bottom edge, each keeping the gap it had, at most `LAYOUT.frameGap`; a frame that is
 * further away than that is only pushed when the growth reaches it. A frame that follows moves rigidly with the frames
 * behind it, in a cascade. When the frame SHRINKS, an attached frame (gap at most `frameGap`) is pulled closer by as
 * much, but never to within its gap of another frame. Frames for which `locked(id)` is true (they hold a user card)
 * never move and push nothing.
 */
export function pushFrames(
  state: BoardState,
  frame: Frame,
  next: { w: number; h: number },
  locked: (frameId: string) => boolean,
): Map<string, FrameShift> {
  const others = Object.values(state.frames).filter((f) => f.id !== frame.id);
  const orig = new Map<string, Rect>(others.map((f) => [f.id, { x: f.x, y: f.y, w: f.w, h: f.h }]));
  const cur = new Map(orig);
  const mover: Rect = { x: frame.x, y: frame.y, w: frame.w, h: frame.h };
  const queue: { id: string; old: Rect; now: Rect }[] = [
    { id: frame.id, old: mover, now: { ...mover, w: next.w, h: next.h } },
  ];
  /** The nearest edge another frame (or the mover) leaves free on one side of `p` along one axis. */
  const clampTo = (
    p: Rect,
    self: string,
    axis: 'x' | 'y',
    gapMin: number,
    now: Rect,
    nowId: string,
  ): number => {
    let limit = -Infinity;
    const consider = (g: Rect, id: string) => {
      if (id === self) return;
      if (axis === 'x') {
        if (yOverlap(g, p) && g.x + g.w <= p.x + 1) limit = Math.max(limit, g.x + g.w + gapMin);
      } else if (xOverlap(g, p) && g.y + g.h <= p.y + 1) limit = Math.max(limit, g.y + g.h + gapMin);
    };
    for (const [id, g] of cur) consider(g, id);
    consider(now, nowId);
    return limit;
  };
  for (let guard = 0; queue.length > 0 && guard < 10_000; guard++) {
    const { id: moverId, old, now } = queue.shift()!;
    if (old.x === now.x && old.y === now.y && old.w === now.w && old.h === now.h) continue;
    for (const f of others) {
      if (f.id === moverId || locked(f.id)) continue;
      let p = cur.get(f.id)!;
      // To the right: follow the right edge (rows overlapping, or the mover grew down onto the frame's rows).
      if (p.x >= old.x + old.w - 1 && yOverlap(now, p)) {
        const g0 = p.x - (old.x + old.w);
        const g = Math.max(0, Math.min(LAYOUT.frameGap, g0));
        const target = now.x + now.w + g;
        let x = g0 <= LAYOUT.frameGap ? target : Math.max(p.x, target);
        if (x < p.x) x = Math.max(x, clampTo(p, f.id, 'x', g, now, moverId));
        if (x !== p.x) {
          const moved = { ...p, x };
          cur.set(f.id, moved);
          queue.push({ id: f.id, old: p, now: moved });
          p = moved;
        }
      }
      // Below: follow the bottom edge (columns overlapping).
      if (p.y >= old.y + old.h - 1 && xOverlap(now, p)) {
        const g0 = p.y - (old.y + old.h);
        const g = Math.max(0, Math.min(LAYOUT.frameGap, g0));
        const target = now.y + now.h + g;
        let y = g0 <= LAYOUT.frameGap ? target : Math.max(p.y, target);
        if (y < p.y) y = Math.max(y, clampTo(p, f.id, 'y', g, now, moverId));
        if (y !== p.y) {
          const moved = { ...p, y };
          cur.set(f.id, moved);
          queue.push({ id: f.id, old: p, now: moved });
        }
      }
    }
  }
  const out = new Map<string, FrameShift>();
  for (const [id, p] of cur) {
    const o = orig.get(id)!;
    if (p.x !== o.x || p.y !== o.y) out.set(id, { dx: p.x - o.x, dy: p.y - o.y });
  }
  return out;
}

/**
 * The frames to move down when `frame` grows to height `newH`, and by how much (`id → dy`): `pushFrames` without
 * the sideways part (kept for callers that only grow a frame downward).
 */
export function pushFramesBelow(
  state: BoardState,
  frame: Frame,
  newH: number,
  locked: (frameId: string) => boolean,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, s] of pushFrames(state, frame, { w: frame.w, h: newH }, locked))
    if (s.dy !== 0) out.set(id, s.dy);
  return out;
}

/** Most grid slots `placeFrame` tries before it falls back to the row below everything. */
const FRAME_SLOTS = 600;

/**
 * Where a new agent frame goes (P3.3 `add_frame`): agents never pick coordinates. Frames take the template grid
 * (`TEMPLATE_LAYOUT`: 400×300 slots, 3 per row, 48 px apart, from (96, 120)), so the frames Orb proposes on a new
 * canvas sit exactly where a Home template's frames would. The first slot, in reading order, that keeps the frame gap
 * from every frame and every visible card wins; when none of the first `FRAME_SLOTS` is free, the frame goes in the
 * first column below everything.
 */
export function placeFrame(state: BoardState): Rect {
  const { w, h, gap, columns, originX, originY } = TEMPLATE_LAYOUT;
  const obstacles: Rect[] = [...Object.values(state.frames), ...visibleCards(state)];
  for (let i = 0; i < FRAME_SLOTS; i++) {
    const r = {
      x: originX + (i % columns) * (w + gap),
      y: originY + Math.floor(i / columns) * (h + gap),
      w,
      h,
    };
    if (!obstacles.some((o) => crowds(r, o, gap))) return r;
  }
  const bottom = Math.max(originY, ...obstacles.map((o) => o.y + o.h + gap));
  return { x: originX, y: bottom, w, h };
}

/** The changes that move frames by `shifts` and the cards inside them (`frame.updated` each, then one `card.moved`). */
function shiftChanges(state: BoardState, shifts: ReadonlyMap<string, FrameShift>): BoardChange[] {
  const changes: BoardChange[] = [];
  const moves: { id: string; x: number; y: number; pinned: null }[] = [];
  for (const [id, { dx, dy }] of shifts) {
    const f = state.frames[id]!;
    changes.push({
      type: 'frame.updated',
      data: { id, patch: { ...(dx ? { x: f.x + dx } : {}), ...(dy ? { y: f.y + dy } : {}) } },
    });
    for (const c of boardCards(state))
      if (c.frameId === id) moves.push({ id: c.id, x: c.x + dx, y: c.y + dy, pinned: null });
  }
  if (moves.length > 0) changes.push({ type: 'card.moved', data: { moves } });
  return changes;
}

/** Keep cascaded growth clear of pinned frames too. Relocate only an unlocked frame, together with its cards. */
function resizeFrame(state: BoardState, frame: Frame, size: { w: number; h: number }): BoardChange[] {
  const locked = lockedFrames(state);
  let next = applyChanges(state, [
    { type: 'frame.updated', data: { id: frame.id, patch: size } },
    ...shiftChanges(
      state,
      pushFrames(state, frame, size, (id) => locked.has(id)),
    ),
  ]);
  const frames = boardFrames(next);
  for (let pass = 0; pass < frames.length * frames.length; pass++) {
    const pair = frames
      .flatMap((a, i) => frames.slice(i + 1).map((b) => [a.id, b.id] as const))
      .find(
        ([a, b]) =>
          crowds(next.frames[a]!, next.frames[b]!, 0) && !crowds(state.frames[a]!, state.frames[b]!, 0),
      );
    if (!pair) return diffChanges(state, next, true);
    const [a, b] = pair;
    if (locked.has(a) && locked.has(b))
      throw new CanvasError(
        'orb/frame-full',
        'Frame growth is blocked by pinned cards. Consolidate existing cards or use another frame.',
        { frameId: frame.id, layoutBlocked: true },
      );
    const id = locked.has(a) ? b : locked.has(b) ? a : b;
    const f = next.frames[id]!;
    const obstacles: Rect[] = [
      ...Object.values(next.frames).filter((g) => g.id !== id),
      ...visibleCards(next).filter((c) => c.frameId !== id),
    ];
    const xs = [...new Set([f.x, ...obstacles.map((r) => r.x + r.w + LAYOUT.frameGap)])];
    const ys = [...new Set([f.y, ...obstacles.map((r) => r.y + r.h + LAYOUT.frameGap)])];
    const spots = xs
      .flatMap((x) => ys.map((y) => ({ ...f, x, y })))
      .filter((r) => !obstacles.some((o) => crowds(r, o, LAYOUT.frameGap)))
      .sort(
        (p, q) =>
          Math.hypot(p.x - f.x, p.y - f.y) - Math.hypot(q.x - f.x, q.y - f.y) || p.y - q.y || p.x - q.x,
      );
    const spot = spots[0]!; // The bottom/right of all obstacles is always free on the infinite board.
    next = applyChanges(next, shiftChanges(next, new Map([[id, { dx: spot.x - f.x, dy: spot.y - f.y }]])));
  }
  throw new CanvasError(
    'orb/frame-full',
    'No clear frame layout found; consolidate cards or use another frame.',
    { frameId: frame.id, layoutBlocked: true },
  );
}

/**
 * Lay out a new agent card in `frameId` (or on the open board) with the layout engine: the card's rectangle, and the
 * changes to append before it when the frame grows (its `frame.updated`, then the frames it pushes right or down and
 * their cards: `frame.updated` each + one `card.moved`).
 */
export function layoutChanges(
  state: BoardState,
  frameId: string | null,
  cell: Cell,
  skip: ReadonlySet<string>,
  near?: { x: number; y: number; w: number; h: number },
): { rect: { x: number; y: number; w: number; h: number }; changes: BoardChange[] } {
  const frame = frameId ? state.frames[frameId] : undefined;
  if (!frame) return { rect: placeOnBoard(state, cell, skip, near), changes: [] };
  const { grow, ...rect } = placeInFrame(state, frame, cell, skip, near);
  if (!grow) return { rect, changes: [] };
  const changes = resizeFrame(state, frame, { w: grow.w ?? frame.w, h: grow.h ?? frame.h });
  const after = applyChanges(state, changes).frames[frame.id]!;
  return { rect: { ...rect, x: rect.x + after.x - frame.x, y: rect.y + after.y - frame.y }, changes };
}

// ---- Reflow (P6.20): heights measured by the renderer ----

/** What `card.moved` / `frame.updated` differ between two boards, as board changes (one `card.moved`). */
export function diffChanges(before: BoardState, after: BoardState, unpinned = false): BoardChange[] {
  const out: BoardChange[] = [];
  for (const f of boardFrames(after)) {
    const old = before.frames[f.id];
    if (!old) continue;
    const patch: Record<string, number> = {};
    for (const k of ['x', 'y', 'w', 'h'] as const) if (old[k] !== f[k]) patch[k] = f[k];
    if (Object.keys(patch).length > 0) out.push({ type: 'frame.updated', data: { id: f.id, patch } });
  }
  const moves: { id: string; x: number; y: number; frameId?: string | null; pinned?: null }[] = [];
  for (const c of Object.values(after.cards)) {
    const old = before.cards[c.id];
    if (!old) continue;
    if (old.x !== c.x || old.y !== c.y || old.frameId !== c.frameId)
      moves.push({
        id: c.id,
        x: c.x,
        y: c.y,
        ...(old.frameId !== c.frameId ? { frameId: c.frameId } : {}),
        ...(unpinned ? { pinned: null } : {}),
      });
  }
  if (moves.length > 0) out.push({ type: 'card.moved', data: { moves } });
  return out;
}

/** Place `ordered` one after another in the frame, each in the first free cell (a frame that is full grows). */
function placeAll(state: BoardState, frameId: string | null, ordered: readonly Card[]): BoardState {
  let scratch = state;
  const skip = new Set(ordered.map((c) => c.id));
  for (const card of ordered) {
    const { rect, changes } = layoutChanges(scratch, frameId, cellOf(card), skip);
    skip.delete(card.id);
    scratch = applyChanges(scratch, [
      ...changes,
      { type: 'card.moved', data: { moves: [{ id: card.id, x: rect.x, y: rect.y, pinned: null }] } },
    ]);
  }
  return scratch;
}

/**
 * Lay `ordered` (movable cards of one frame, or of the open board) out again in that order: each takes the first free
 * cell of the frame, around the cards that stay, growing the frame (sideways first) and pushing other frames only
 * when the grid is full. Returns the board after.
 *
 * The frame is widened to the width the whole run needs BEFORE the first card is placed (found by a dry run), so the
 * order of the cards is the order they read in: were the frame widened half way through, a later card would take the
 * top of the new columns, above an earlier one that had to go below a card that stays.
 */
export function relayoutFrame(
  state: BoardState,
  frameId: string | null,
  ordered: readonly Card[],
): BoardState {
  const frame = frameId ? state.frames[frameId] : undefined;
  if (frame && ordered.length > 1) {
    const widest = placeAll(state, frameId, ordered).frames[frame.id]!.w;
    if (widest > frame.w) {
      state = applyChanges(state, resizeFrame(state, frame, { w: widest, h: frame.h }));
    }
  }
  return placeAll(state, frameId, ordered);
}

/** Cards in the order they read now: top to bottom, then left to right (ties by id). */
const reading = (cards: readonly Card[]): Card[] =>
  [...cards].sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Bottom edge of the lowest visible card of a frame (the frame's top band when it is empty); `hOf` overrides heights. */
const contentBottom = (state: BoardState, frame: Frame, hOf: (c: Card) => number = (c) => c.h): number =>
  Math.max(
    frame.y + LAYOUT.top,
    ...visibleCards(state)
      .filter((c) => c.frameId === frame.id)
      .map((c) => c.y + hOf(c)),
  );

/** A height change below this many pixels is not worth a reflow. */
export const MEASURE_EPS = 4;

/**
 * P6.20: the changes that follow the renderer reporting the real heights of cards (`heights`: card id → px). Each
 * movable card of a frame (an agent's, or a template's seed: never a pinned one, which the user sized) takes the
 * measured height, kept in the type's range; then each frame whose cards changed is laid out again in reading order
 * (cards the user placed stay where they are and are laid out around), growing sideways first, and a frame whose
 * content got shorter shrinks by as much so the frames after it close up. The `card.moved` events carry
 * `pinned: null`, so a reflow never pins a card. Nothing when no height differs by `MEASURE_EPS` or more.
 */
export function planMeasured(state: BoardState, heights: Readonly<Record<string, number>>): BoardChange[] {
  const patches: BoardChange[] = [];
  const touched = new Set<string>();
  for (const id of Object.keys(heights).sort()) {
    const card = state.cards[id];
    const n = heights[id];
    if (!card || card.stackedInto || !card.frameId || !state.frames[card.frameId]) continue;
    if (isPinned(card) || n === undefined || !Number.isFinite(n)) continue;
    const key = stackOf(card) ? 'stack' : card.type;
    const h = clampHeight(key, n);
    // A card the layout owns is a whole number of grid columns wide (the type's span): one that is not (a board from
    // before the grid, a card written by a script) is brought onto the grid, and measured again at its new width.
    const w = spanWidth(CELLS[key].cols);
    const widen = Math.abs(card.w - w) >= 1;
    if (!widen && Math.abs(h - card.h) < MEASURE_EPS) continue;
    patches.push({ type: 'card.updated', data: { id, patch: widen ? { w, h: card.h } : { h } } });
    touched.add(card.frameId);
  }
  if (patches.length === 0) return [];
  const withHeights = applyChanges(state, patches);
  let scratch = withHeights;
  for (const frame of boardFrames(state)) {
    if (!touched.has(frame.id)) continue;
    const before = scratch.frames[frame.id]!;
    // The content's bottom as it was: positions as they are, heights as they were before the measure.
    const oldBottom = contentBottom(scratch, before, (c) => state.cards[c.id]?.h ?? c.h);
    const movable = reading(visibleCards(scratch).filter((c) => c.frameId === frame.id && !isPinned(c)));
    try {
      scratch = relayoutFrame(scratch, frame.id, movable);
    } catch (error) {
      if (!isCanvasError(error) || !error.details.layoutBlocked) throw error;
      // A renderer measurement must not move pinned cards or create an overlap. Keep this frame's existing
      // geometry and its clipped preview/Show more; independently reflow the other reported frames.
      return planMeasured(
        state,
        Object.fromEntries(Object.entries(heights).filter(([id]) => state.cards[id]?.frameId !== frame.id)),
      );
    }
    const now = scratch.frames[frame.id]!;
    // Shorter content: the frame gives the space back (its free room stays), and the frames after it close up.
    const shrink = oldBottom - contentBottom(scratch, now);
    if (shrink > 0 && now.h - shrink >= 120) {
      const userIn = lockedFrames(scratch);
      const h = now.h - shrink;
      const pulls = pushFrames(scratch, now, { w: now.w, h }, (id) => userIn.has(id));
      scratch = applyChanges(scratch, [
        { type: 'frame.updated', data: { id: now.id, patch: { h } } },
        ...shiftChanges(scratch, pulls),
      ]);
    }
  }
  return [...patches, ...diffChanges(withHeights, scratch, true)];
}
