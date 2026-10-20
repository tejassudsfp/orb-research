/**
 * Canvas renderer math (BUILD_PLAN P2.2), pure so it is unit-tested without a DOM.
 *
 * - The world layer is ONE element transformed by `translate(panX, panY) scale(zoom)`: a world point (x, y) shows
 *   at screen (panX + x * zoom, panY + y * zoom) relative to the canvas screen.
 * - Zoom is clamped to 25%–250% and zooms towards a screen point (the prototype's `zoomAt`).
 * - Virtualisation: only items intersecting the viewport grown by 20% on each side are rendered.
 * - Level of detail by zoom: full ≥ 0.6, compact 0.35–0.6, title-only below 0.35 (PRD Card registry › Render).
 */

export type Viewport = { panX: number; panY: number; zoom: number };
export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Lod = 'full' | 'compact' | 'title';

export const MIN_ZOOM = 0.25;
/**
 * P6.20: how far a fit may zoom out. A board of a dozen wide frames is bigger than a screen even at 25%; fitting it (on
 * open, Shift+1) shows all of it as an overview, below the 25% a pinch or the minimap's minus can reach.
 */
export const FIT_MIN_ZOOM = 0.08;
/** The room kept round a board fitted on open (a fit by the user, Shift+1, keeps 48). */
export const OPEN_PAD = 32;
export const MAX_ZOOM = 2.5;
/** Share of the viewport added on every side before culling. */
export const CULL_MARGIN = 0.2;
export const LOD_FULL_MIN = 0.6;
export const LOD_COMPACT_MIN = 0.35;
/** Dot grid pitch in world px (PRD Canvas look). */
export const GRID = 24;

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Zoom by `factor` keeping the world point under screen point (mx, my) fixed, clamped to 25%–250%. */
export function zoomAt(v: Viewport, factor: number, mx: number, my: number): Viewport {
  // (A view fitted below 25% never jumps up when the user zooms out: the floor is wherever it is.)
  const zoom = Math.min(MAX_ZOOM, Math.max(Math.min(MIN_ZOOM, v.zoom), v.zoom * factor));
  const k = zoom / v.zoom;
  return { zoom, panX: mx - (mx - v.panX) * k, panY: my - (my - v.panY) * k };
}

export const panBy = (v: Viewport, dx: number, dy: number): Viewport => ({
  ...v,
  panX: v.panX + dx,
  panY: v.panY + dy,
});

/** Screen point → world point. */
export const toWorld = (v: Viewport, sx: number, sy: number) => ({
  x: (sx - v.panX) / v.zoom,
  y: (sy - v.panY) / v.zoom,
});

/** The world rectangle visible in a screen of `size`, grown by `margin` × its size on every side. */
export function visibleWorldRect(v: Viewport, size: Size, margin = CULL_MARGIN): Rect {
  const w = size.width / v.zoom;
  const h = size.height / v.zoom;
  const x = -v.panX / v.zoom;
  const y = -v.panY / v.zoom;
  return { x: x - w * margin, y: y - h * margin, w: w * (1 + 2 * margin), h: h * (1 + 2 * margin) };
}

export const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Items whose box intersects `rect`, in their original order. */
export function cull<T extends Rect>(items: readonly T[], rect: Rect): T[] {
  return items.filter((item) => intersects(item, rect));
}

export function lodFor(zoom: number): Lod {
  if (zoom >= LOD_FULL_MIN) return 'full';
  if (zoom >= LOD_COMPACT_MIN) return 'compact';
  return 'title';
}

/** `01 THESIS`: the 1-based position in insertion order, two digits, then the upper-cased title. */
export const frameLabel = (index: number, title: string): string =>
  `${String(index + 1).padStart(2, '0')} ${title.toUpperCase()}`;

/** The dot grid's CSS background size and position for a viewport (it moves with pan and scales with zoom). */
export function gridStyle(v: Viewport): { backgroundSize: string; backgroundPosition: string } {
  const pitch = GRID * v.zoom;
  return { backgroundSize: `${pitch}px ${pitch}px`, backgroundPosition: `${v.panX}px ${v.panY}px` };
}

/** Bounding box of a set of rects (null when empty). */
export function bounds(items: readonly Rect[]): Rect | null {
  if (items.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of items) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Screen space the floating chrome leaves free for the board (px from each edge of the canvas screen). */
export type Insets = { top: number; right: number; bottom: number; left: number };
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** The zoom (clamped to 25%–250%) that fits `rect` into the free area of the screen with `pad` px around it. */
export function fitZoom(
  rect: Rect,
  size: Size,
  insets: Insets = NO_INSETS,
  pad = 48,
  minZoom = MIN_ZOOM,
): number {
  const aw = Math.max(1, size.width - insets.left - insets.right - 2 * pad);
  const ah = Math.max(1, size.height - insets.top - insets.bottom - 2 * pad);
  return Math.min(MAX_ZOOM, Math.max(minZoom, Math.min(aw / Math.max(1, rect.w), ah / Math.max(1, rect.h))));
}

/** The viewport that shows world point (wx, wy) at the centre of the free area, at `zoom` (clamped). */
export function centreOn(
  wx: number,
  wy: number,
  zoom: number,
  size: Size,
  insets: Insets = NO_INSETS,
  minZoom = MIN_ZOOM,
): Viewport {
  const z = Math.min(MAX_ZOOM, Math.max(minZoom, zoom));
  const cx = insets.left + (size.width - insets.left - insets.right) / 2;
  const cy = insets.top + (size.height - insets.top - insets.bottom) / 2;
  return { zoom: z, panX: cx - wx * z, panY: cy - wy * z };
}

/** Zoom to fit (Shift+1 for the board, Shift+2 for the selection): `rect` centred in the free area, as large as fits. */
export function fitView(rect: Rect, size: Size, insets: Insets = NO_INSETS, pad = 48): Viewport {
  return centreOn(
    rect.x + rect.w / 2,
    rect.y + rect.h / 2,
    fitZoom(rect, size, insets, pad, FIT_MIN_ZOOM),
    size,
    insets,
    FIT_MIN_ZOOM,
  );
}

/**
 * Fly to one search result: the card centred in the free area, at the current zoom but at least `minZoom` (so it is
 * drawn in full), and never so large that it does not fit.
 */
export function focusView(
  rect: Rect,
  current: Viewport,
  size: Size,
  insets: Insets = NO_INSETS,
  minZoom = 0.8,
): Viewport {
  const zoom = Math.min(Math.max(current.zoom, minZoom), fitZoom(rect, size, insets, 24));
  return centreOn(rect.x + rect.w / 2, rect.y + rect.h / 2, zoom, size, insets);
}

/** 100% zoom keeping the world point at the centre of the free area where it is (Cmd+0). */
export function actualSize(v: Viewport, size: Size, insets: Insets = NO_INSETS): Viewport {
  const cx = insets.left + (size.width - insets.left - insets.right) / 2;
  const cy = insets.top + (size.height - insets.top - insets.bottom) / 2;
  return zoomAt(v, 1 / v.zoom, cx, cy);
}

/**
 * A point of a flight between two viewports at progress t ∈ [0, 1]: the world point at the screen centre moves in
 * a straight line and the zoom changes geometrically, so the motion looks even at any zoom.
 */
export function flightAt(from: Viewport, to: Viewport, t: number, size: Size): Viewport {
  if (t >= 1) return to;
  if (t <= 0) return from;
  const cx = size.width / 2;
  const cy = size.height / 2;
  const a = toWorld(from, cx, cy);
  const b = toWorld(to, cx, cy);
  const zoom = from.zoom * Math.pow(to.zoom / from.zoom, t);
  const wx = a.x + (b.x - a.x) * t;
  const wy = a.y + (b.y - a.y) * t;
  return { zoom, panX: cx - wx * zoom, panY: cy - wy * zoom };
}

/** Ease in-out (cubic) for flights. */
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * P6.20: the insets that keep the board clear of the floating chrome (the conversation panel, the reading queue, the
 * minimap...). Each panel, as a rectangle of the screen, is cleared by the one inset (the side of the screen its centre
 * is on) that leaves the largest free area, on top of `base` (the toolbar, the title pill). A panel that does not touch
 * the free area is already clear.
 */
export function chromeInsets(
  size: Size,
  panels: readonly Rect[],
  base: Insets,
  gap = 16,
  /** The content that will be fitted: the side is then the one that lets it be fitted largest, not the one that frees most area. */
  content?: Rect | null,
): Insets {
  const out = { ...base };
  const availableArea = (i: Insets) =>
    Math.max(0, size.width - i.left - i.right) * Math.max(0, size.height - i.top - i.bottom);
  const free = (i: Insets) => (content ? fitZoom(content, size, i, OPEN_PAD, FIT_MIN_ZOOM) : availableArea(i));
  const ordered = [...panels].filter((p) => p.w > 0 && p.h > 0).sort((a, b) => b.w * b.h - a.w * a.h);
  for (const p of ordered) {
    const area: Rect = {
      x: out.left,
      y: out.top,
      w: size.width - out.left - out.right,
      h: size.height - out.top - out.bottom,
    };
    if (!intersects(p, area)) continue;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const options: Insets[] = [];
    if (cx < size.width / 2) options.push({ ...out, left: Math.max(out.left, p.x + p.w + gap) });
    else options.push({ ...out, right: Math.max(out.right, size.width - p.x + gap) });
    if (cy < size.height / 2) options.push({ ...out, top: Math.max(out.top, p.y + p.h + gap) });
    else options.push({ ...out, bottom: Math.max(out.bottom, size.height - p.y + gap) });
    let best = options[0]!;
    for (const o of options) {
      const score = free(o),
        bestScore = free(best);
      // At the zoom cap, equally fitting choices still prefer more usable board space. This also keeps a
      // selected card centred when Actual size recalculates the area without a fit target.
      if (score > bestScore || (score === bestScore && availableArea(o) > availableArea(best))) best = o;
    }
    Object.assign(out, best);
  }
  return out;
}

/**
 * P6.20: the view a canvas opens at. A board that already fits the free area at 100% from the origin keeps the plain
 * 100% view; a larger one is fitted (centred in the free area, as large as fits but never larger than 100%). An
 * empty board has no view of its own (null).
 */
export function openingView(content: Rect | null, size: Size, insets: Insets = NO_INSETS): Viewport | null {
  if (!content) return null;
  const plain: Viewport = { panX: 0, panY: 0, zoom: 1 };
  if (inFreeArea(content, plain, size, insets)) return plain;
  const zoom = Math.min(1, fitZoom(content, size, insets, OPEN_PAD, FIT_MIN_ZOOM));
  return centreOn(content.x + content.w / 2, content.y + content.h / 2, zoom, size, insets, FIT_MIN_ZOOM);
}

/** True when `content` lies wholly inside the free area of the screen at the viewport. */
export function inFreeArea(content: Rect, v: Viewport, size: Size, insets: Insets = NO_INSETS): boolean {
  const x0 = insets.left;
  const y0 = insets.top;
  const x1 = size.width - insets.right;
  const y1 = size.height - insets.bottom;
  const l = v.panX + content.x * v.zoom;
  const t = v.panY + content.y * v.zoom;
  return l >= x0 - 1 && t >= y0 - 1 && l + content.w * v.zoom <= x1 + 1 && t + content.h * v.zoom <= y1 + 1;
}
