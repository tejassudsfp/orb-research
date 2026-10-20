/**
 * Composer attachments (P6.1, docs/phase6/PLAN.md): a file attached in the chat panel (paperclip, paste or drop)
 * goes through the ordinary ingest path into a card IN VIEW: in the current frame when there is one, else near it,
 * else on a free spot of the open board near the middle of the view. Pure, so it is unit-tested without a DOM.
 *
 * - The current frame: the selected frame (or the frame of the selected card) when it shows in the view; else the
 *   frame under the middle of the view; else the frame that shows most in the view.
 * - A spot is free when the card keeps `GAP` from every visible card (and from the cards placed earlier in the same
 *   attach). Inside a frame it stays within the frame's padding and below its title band; outside one it keeps clear
 *   of every frame. Among free spots, one that is wholly in view wins, then the one nearest the middle of the view
 *   (inside a frame: reading order first, so attachments fill a frame the way the layout engine does).
 */
import type { BoardState, Frame } from '@orb/shared';
import { intersects, type Rect } from '../canvas/viewport.js';

/** Space kept between an attached card and any other card or frame. */
export const GAP = 16;
/** A frame's inner padding and the height of its title band (orb-canvas layout.ts LAYOUT.pad / LAYOUT.top). */
const PAD = 24;
const TOP = 56;
/** Candidate grid steps (world px). */
const STEP_IN_FRAME = 16;
const STEP_OPEN = 24;
/** Upper bound of the candidate spots one scan tries (the grid step grows past it). */
const MAX_CANDIDATES = 12_000;

type Size = { w: number; h: number };
type Point = { x: number; y: number };

const area = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const inside = (r: Rect, outer: Rect) =>
  r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;
const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by });

/** The frame attachments go to (see the header), or undefined. `selection` holds resolved ids. */
export function currentFrame(board: BoardState, view: Rect, selection: readonly string[]): Frame | undefined {
  for (const id of selection) {
    const frameId = id.startsWith('f_') ? id : board.cards[id]?.frameId;
    const frame = frameId ? board.frames[frameId] : undefined;
    if (frame && intersects(frame, view)) return frame;
  }
  const frames = Object.values(board.frames);
  const cx = view.x + view.w / 2;
  const cy = view.y + view.h / 2;
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i]!;
    if (cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h) return f;
  }
  let best: Frame | undefined;
  let bestArea = 0;
  for (const f of frames) {
    const a = area(f, view);
    if (a > bestArea) {
      best = f;
      bestArea = a;
    }
  }
  return best;
}

/**
 * The top-left corner of a free spot for a card of `size` (see the header). `taken` holds the cards already placed
 * by this attach (not on the board yet). Falls back to the middle of the view when nothing is free.
 */
export function freeSpot(
  board: BoardState,
  size: Size,
  { frame, view, taken = [] }: { frame?: Frame | undefined; view: Rect; taken?: readonly Rect[] },
): Point {
  const cards: Rect[] = [...Object.values(board.cards).filter((c) => !c.stackedInto), ...taken].map((r) =>
    grow(r, GAP),
  );
  const frames = Object.values(board.frames);
  const others = frames.filter((f) => f.id !== frame?.id).map((f) => grow(f, GAP));
  const centre = { x: view.x + view.w / 2, y: view.y + view.h / 2 };
  const free = (r: Rect, obstacles: readonly Rect[]) => !obstacles.some((o) => intersects(o, r));

  type Pick = { p: Point; inView: boolean; rank: number };
  const better = (a: Pick | undefined, b: Pick) =>
    !a || (b.inView && !a.inView) || (b.inView === a.inView && b.rank < a.rank);

  const scan = (
    region: Rect,
    minStep: number,
    obstacles: readonly Rect[],
    rankOf: (p: Point) => number,
  ): Point | undefined => {
    let best: Pick | undefined;
    // A wide region (a zoomed-out view) is scanned on a coarser grid, so one placement stays a few ms on a 300-card
    // board (≤ MAX_CANDIDATES spots), and each row only checks the obstacles that cross it.
    const step = Math.max(minStep, Math.ceil(Math.sqrt((region.w * region.h) / MAX_CANDIDATES)));
    for (let y = region.y; y + size.h <= region.y + region.h; y += step) {
      const row = obstacles.filter((o) => o.y < y + size.h && o.y + o.h > y);
      for (let x = region.x; x + size.w <= region.x + region.w; x += step) {
        const r = { x, y, w: size.w, h: size.h };
        if (!free(r, row)) continue;
        const pick = { p: { x, y }, inView: inside(r, view), rank: rankOf({ x, y }) };
        if (better(best, pick)) best = pick;
      }
    }
    return best?.p;
  };
  const distance = (p: Point) => Math.hypot(p.x + size.w / 2 - centre.x, p.y + size.h / 2 - centre.y);

  if (frame) {
    // Inside the frame, in reading order.
    const grid = { x: frame.x + PAD, y: frame.y + TOP, w: frame.w - 2 * PAD, h: frame.h - TOP - PAD };
    const within = scan(grid, STEP_IN_FRAME, [...cards, ...others], (p) => p.y * 1e6 + p.x);
    if (within) return within;
    // Full: right next to the frame (its right side, then below it), nearest the middle of the view.
    const span = Math.max(size.w, size.h) * 3;
    const near = {
      x: frame.x - span,
      y: frame.y - span,
      w: frame.w + 2 * span,
      h: frame.h + 2 * span,
    };
    const beside = scan(near, STEP_OPEN, [...cards, ...frames.map((f) => grow(f, GAP))], (p) => distance(p));
    if (beside) return beside;
  }
  // The open board around the view, clear of every frame.
  const margin = Math.max(size.w, size.h) + 400;
  const open = grow(view, margin);
  const spot = scan(open, STEP_OPEN, [...cards, ...frames.map((f) => grow(f, GAP))], distance);
  return spot ?? { x: Math.round(centre.x - size.w / 2), y: Math.round(centre.y - size.h / 2) };
}
