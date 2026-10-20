/**
 * Label placement (P6.9). Pure, so it is unit-tested without a DOM.
 *
 * - Link labels sit at the middle of their curve, so two links between the same neighbours (or a link through a frame's
 *   corner) put pills on top of each other, or on the frame's label and thread button. `separateLinkLabels` keeps every
 *   pill where it is unless it would overlap a pill placed before it or an obstacle, and then moves it straight up or
 *   down in steps of one pill height, the nearest free slot first.
 * - Agent cursors of one frame sit within a few pixels of each other, so their name pills cover each other.
 *   `cursorSlots` gives each cursor a row (0, 1, 2 …) to drop its pill by; the arrows stay on their points.
 */
import type { Rect } from './viewport.js';

/** Pill metrics (canvas.module.css `.linkLabel`: 11 px mono, 1.2 px letter-spacing, 4 px / 10 px padding). */
export const LINK_PILL = { charW: 8.4, padX: 22, h: 25, gap: 4 } as const;

/** Estimated size of a link label pill (the layout must not measure the DOM). */
export const linkPillSize = (text: string): { w: number; h: number } => ({
  w: Math.ceil(text.length * LINK_PILL.charW + LINK_PILL.padX),
  h: LINK_PILL.h,
});

/** A label centred on (x, y). */
export type LabelBox = { id: string; x: number; y: number; w: number; h: number };

const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.w + gap && a.x + a.w > b.x - gap && a.y < b.y + b.h + gap && a.y + a.h > b.y - gap;

const boxOf = (l: { x: number; y: number; w: number; h: number }): Rect => ({
  x: l.x - l.w / 2,
  y: l.y - l.h / 2,
  w: l.w,
  h: l.h,
});

/**
 * The centre each label is drawn at. Labels keep their order (earlier ones win their spot); a label that overlaps a
 * placed one or an obstacle tries 1, 2, … steps down, then the same steps up, and takes the first free slot (the
 * original spot when nothing within `maxSteps` is free).
 */
export function separateLinkLabels(
  labels: readonly LabelBox[],
  obstacles: readonly Rect[] = [],
  maxSteps = 12,
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const taken: Rect[] = [...obstacles];
  const step = LINK_PILL.h + LINK_PILL.gap;
  for (const l of labels) {
    const free = (y: number) => !taken.some((t) => overlaps(boxOf({ ...l, y }), t, LINK_PILL.gap / 2));
    let y = l.y;
    if (!free(y)) {
      let found: number | undefined;
      for (let k = 1; k <= maxSteps && found === undefined; k++) {
        if (free(l.y + k * step)) found = l.y + k * step;
        else if (free(l.y - k * step)) found = l.y - k * step;
      }
      if (found !== undefined) y = found;
    }
    out.set(l.id, { x: l.x, y });
    taken.push(boxOf({ ...l, y }));
  }
  return out;
}

/** Name pill of an agent cursor: screen pixels (the cursor is drawn at screen size whatever the zoom). */
export const CURSOR_PILL = { charW: 7, padX: 24, h: 26, gap: 2 } as const;

/**
 * A row for each cursor so that no two name pills overlap on screen. Cursors are taken in the order given; a cursor
 * whose pill (at the zoom) would overlap an earlier cursor's pill in the same row moves down a row.
 */
export function cursorSlots(
  cursors: readonly { agent: string; x: number; y: number; label: string }[],
  zoom: number,
): Map<string, number> {
  const slots = new Map<string, number>();
  const placed: { row: number; x: number; y: number; w: number }[] = [];
  for (const c of cursors) {
    const w = c.label.length * CURSOR_PILL.charW + CURSOR_PILL.padX;
    let row = 0;
    const clash = (r: number) =>
      placed.some(
        (p) =>
          p.row === r &&
          Math.abs(p.y - c.y) * zoom < CURSOR_PILL.h &&
          c.x * zoom < p.x * zoom + p.w + CURSOR_PILL.gap &&
          c.x * zoom + w + CURSOR_PILL.gap > p.x * zoom,
      );
    while (clash(row) && row < 8) row++;
    placed.push({ row, x: c.x, y: c.y, w });
    slots.set(c.agent, row);
  }
  return slots;
}
