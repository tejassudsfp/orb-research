/**
 * P6.11, P6.20: where a v2 template's frames and seed cards go. Pure and harness-free (it uses the layout engine's grid
 * and height estimate, so a seed sits exactly where an agent's card of that type would, and the measured heights then
 * reflow it: `planMeasured`).
 *
 * Each frame is as wide as its seeds and its expected card mix call for: 4 to `LAYOUT.maxCols` grid columns, the width
 * that makes the frame closest to landscape (`FRAME_ASPECT`) once the seeds and its free `room` are in. The frames are
 * then packed in the spec's order, first free spot (top, then left) in a board whose width is the one that makes the
 * whole board closest to a screen's shape (`BOARD_ASPECT`), so a 12-frame board is a few wide rows instead of three
 * tall columns. Agents' cards then land in the room below the seeds with the normal engine, which grows a frame
 * sideways first (and pushes the frames next to it).
 */
import { TEMPLATE_LAYOUT_V2, type SeedCard, type TemplateSpecV2 } from '@orb/shared';
import { LAYOUT, cellOf, firstFreeCell, frameWidth, type Rect } from './layout.js';

export type PlannedFrame = {
  specId: string;
  title: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type PlannedSeed = { frameIndex: number; seedIndex: number; seed: SeedCard; rect: Rect };

/** The minimum frame height (the engine's template slot). */
const MIN_H = 300;
/** Width over height a frame aims for, and the board's (a 16:10 screen). */
export const FRAME_ASPECT = 1.5;
export const BOARD_ASPECT = 1.6;
/** Fewest grid columns of a v2 frame (the old 624 px frames). */
const MIN_COLS = 4;

type Sized = { cols: number; w: number; h: number; rects: Rect[] };

/** One frame's seeds placed in `cols` columns with the frame at the origin of its own grid. */
function sizeAt(cols: number, cells: readonly ReturnType<typeof cellOf>[], room: number): Sized {
  const rects: Rect[] = [];
  for (const cell of cells) rects.push(firstFreeCell(LAYOUT.pad, LAYOUT.top, cols, cell, rects));
  const bottom = rects.length
    ? Math.max(...rects.map((r) => r.y + r.h)) + LAYOUT.pad
    : LAYOUT.top + LAYOUT.pad;
  return { cols, w: frameWidth(cols), h: Math.max(MIN_H, bottom + room), rects };
}

/** The width (4 to 8 columns, at least the widest seed) whose frame is closest to landscape. */
export function bestFrameSize(cells: readonly ReturnType<typeof cellOf>[], room: number): Sized {
  const widest = Math.max(1, ...cells.map((c) => c.cols));
  let best: Sized | undefined;
  let bestScore = Infinity;
  for (let cols = Math.max(MIN_COLS, widest); cols <= LAYOUT.maxCols; cols++) {
    const sized = sizeAt(cols, cells, room);
    const score = Math.abs(Math.log(sized.w / sized.h / FRAME_ASPECT));
    if (score < bestScore - 1e-9) {
      best = sized;
      bestScore = score;
    }
  }
  return best ?? sizeAt(Math.max(MIN_COLS, widest), cells, room);
}

const crowded = (r: Rect, o: Rect, gap: number) =>
  r.x < o.x + o.w + gap && r.x + r.w > o.x - gap && r.y < o.y + o.h + gap && r.y + r.h > o.y - gap;

/**
 * Pack frames of the given sizes in order, each into the first free spot (top, then left) inside `width`; returns their
 * origins (relative to (0, 0)) and the bounds.
 */
export function packFrames(
  sizes: readonly { w: number; h: number }[],
  width: number,
  gap: number = LAYOUT.frameGap,
  obstacles: readonly Rect[] = [],
): { at: { x: number; y: number }[]; w: number; h: number } {
  const placed: Rect[] = [...obstacles];
  let right = 0;
  let bottom = 0;
  for (const s of sizes) {
    const xs = [0, ...placed.map((p) => p.x + p.w + gap)].sort((a, b) => a - b);
    const ys = [0, ...placed.map((p) => p.y + p.h + gap)].sort((a, b) => a - b);
    let spot: Rect | undefined;
    for (const y of ys) {
      for (const x of xs) {
        const r = { x, y, w: s.w, h: s.h };
        if (x + s.w > Math.max(width, s.w)) continue;
        if (!placed.some((p) => crowded(r, p, gap - 1))) {
          spot = r;
          break;
        }
      }
      if (spot) break;
    }
    // Unreachable: the row below everything is free. Kept as a safe fallback.
    spot ??= { x: 0, y: Math.max(0, ...placed.map((p) => p.y + p.h + gap)), w: s.w, h: s.h };
    placed.push(spot);
    right = Math.max(right, spot.x + spot.w);
    bottom = Math.max(bottom, spot.y + spot.h);
  }
  return { at: placed.slice(obstacles.length).map((p) => ({ x: p.x, y: p.y })), w: right, h: bottom };
}

/** The board width (from the widest frame up to everything in one row) whose packing is closest to `BOARD_ASPECT`. */
export function bestBoardWidth(sizes: readonly { w: number; h: number }[]): number {
  const widest = Math.max(0, ...sizes.map((s) => s.w));
  const total = sizes.reduce((sum, s) => sum + s.w + LAYOUT.frameGap, 0);
  let best = widest;
  let bestScore = Infinity;
  for (let width = widest; width <= Math.max(widest, total); width += LAYOUT.col + LAYOUT.gap) {
    const packed = packFrames(sizes, width);
    const score = Math.abs(Math.log(packed.w / packed.h / BOARD_ASPECT));
    if (score < bestScore - 1e-9) {
      best = width;
      bestScore = score;
    }
  }
  return best;
}

export function planTemplate(
  spec: TemplateSpecV2,
  seeds: readonly (readonly SeedCard[])[] = spec.frames.map((f) => f.seeds),
): {
  frames: PlannedFrame[];
  seeds: PlannedSeed[];
} {
  const { originX, originY } = TEMPLATE_LAYOUT_V2;
  const sized = spec.frames.map((f, i) =>
    bestFrameSize(
      (seeds[i] ?? []).map((seed) => cellOf({ type: seed.type, data: seed.data, why: seed.why })),
      f.room,
    ),
  );
  const packed = packFrames(sized, bestBoardWidth(sized));
  const frames: PlannedFrame[] = [];
  const placed: PlannedSeed[] = [];
  spec.frames.forEach((f, i) => {
    const size = sized[i]!;
    const x = originX + packed.at[i]!.x;
    const y = originY + packed.at[i]!.y;
    frames.push({ specId: f.id, title: f.title, color: f.color, x, y, w: size.w, h: size.h });
    (seeds[i] ?? []).forEach((seed, s) => {
      const r = size.rects[s]!;
      placed.push({ frameIndex: i, seedIndex: s, seed, rect: { x: x + r.x, y: y + r.y, w: r.w, h: r.h } });
    });
  });
  return { frames, seeds: placed };
}
