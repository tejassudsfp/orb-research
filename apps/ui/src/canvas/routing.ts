/**
 * Link routing (P6.20). Pure, so it is unit-tested without a DOM.
 *
 * A link used to be a Bézier straight between its two cards, so it ran through every card in between. Now it is routed:
 * an ORTHOGONAL path with rounded corners that goes round every other card, through the gutters between them.
 *
 * - The graph is the Hanan grid of the two end boxes' sides and every nearby card's edges grown by `MARGIN` (so the
 *   lines run in the middle of a 16 px gutter); a step is allowed when it neither enters a card nor runs along an end
 *   card's own edge.
 * - A* finds the cheapest path from any side of one end to any side of the other: its length plus `BEND` for every
 *   turn, so a path is short and has few corners. The cheapest side to leave by is therefore chosen too.
 * - When there are too many cards in the way (`MAX_OBSTACLES`) or no path exists, the old curve is drawn.
 * - A link's label goes where the path leaves the pill clear of cards (`labelSpot`).
 *
 * `LinkRoutes` keeps the route of every link until something near it changes, so panning, and dragging one card, only
 * route again the links that card touches.
 */
import type { BoardState, Link } from '@orb/shared';
import { linkGeometry, rectOf, shownEnd, type LinkGeometry } from './geometry.js';
import { linkPillSize } from './labels.js';
import type { Rect } from './viewport.js';

export type Pt = { x: number; y: number };

/** How far the routing lines keep from a card (half the layout's 16 px gutter). */
export const MARGIN = 8;
/** What a turn costs, in px of path. */
const BEND = 36;
/** The routing region is the two ends' box grown by this much. */
const REGION = 220;
/** More cards than this in the region and the link is drawn as a curve instead. */
const MAX_OBSTACLES = 260;
/** Corner radius of the drawn path. */
const RADIUS = 10;

export type Route = LinkGeometry & {
  /** The corners of the path, end to end (a curve fallback has none). */
  points: Pt[];
  /** True when the path was routed round cards; false for the straight curve. */
  routed: boolean;
};

type Dir = 0 | 1 | 2 | 3; // right, down, left, up
const DX = [1, 0, -1, 0] as const;
const DY = [0, 1, 0, -1] as const;

/** A box's port on side `dir` (the middle of that side) and the outward direction. */
const portOf = (r: Rect, dir: Dir): Pt => {
  switch (dir) {
    case 0:
      return { x: r.x + r.w, y: r.y + r.h / 2 };
    case 1:
      return { x: r.x + r.w / 2, y: r.y + r.h };
    case 2:
      return { x: r.x, y: r.y + r.h / 2 };
    default:
      return { x: r.x + r.w / 2, y: r.y };
  }
};

const strictlyInside = (r: Rect, x: number, y: number) =>
  x > r.x + 1e-6 && x < r.x + r.w - 1e-6 && y > r.y + 1e-6 && y < r.y + r.h - 1e-6;
const insideClosed = (r: Rect, x: number, y: number) =>
  x >= r.x - 1e-6 && x <= r.x + r.w + 1e-6 && y >= r.y - 1e-6 && y <= r.y + r.h + 1e-6;
const grow = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const touches = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** The sorted distinct numbers. */
const distinct = (values: number[]): number[] =>
  [...new Set(values.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);

/** A min-heap of (priority, item). */
class Heap<T> {
  private readonly items: { p: number; v: T }[] = [];
  get size() {
    return this.items.length;
  }
  push(p: number, v: T) {
    const a = this.items;
    a.push({ p, v });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent]!.p <= a[i]!.p) break;
      [a[parent], a[i]] = [a[i]!, a[parent]!];
      i = parent;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.p < a[m]!.p) m = l;
        if (r < a.length && a[r]!.p < a[m]!.p) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top.v;
  }
}

/** The path as an SVG `d`: straight runs with rounded corners. */
export function pathOf(points: readonly Pt[], radius = RADIUS): string {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const first = points[0]!;
  let d = `M${r1(first.x)} ${r1(first.y)}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    const prev = points[i - 1]!;
    const next = points[i + 1];
    if (!next) {
      d += ` L${r1(p.x)} ${r1(p.y)}`;
      break;
    }
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y);
    const outLen = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const a = { x: p.x - ((p.x - prev.x) / inLen) * r, y: p.y - ((p.y - prev.y) / inLen) * r };
    const b = { x: p.x + ((next.x - p.x) / outLen) * r, y: p.y + ((next.y - p.y) / outLen) * r };
    d += ` L${r1(a.x)} ${r1(a.y)} Q${r1(p.x)} ${r1(p.y)} ${r1(b.x)} ${r1(b.y)}`;
  }
  return d;
}

/** Drop the points that lie on a straight run. */
const simplify = (pts: Pt[]): Pt[] => {
  const out: Pt[] = [];
  for (const p of pts) {
    const n = out.length;
    if (n >= 1 && out[n - 1]!.x === p.x && out[n - 1]!.y === p.y) continue;
    if (n >= 2) {
      const a = out[n - 2]!;
      const b = out[n - 1]!;
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) out.pop();
    }
    out.push(p);
  }
  return out;
};

/** The point halfway along the path, by length. */
export function midOf(points: readonly Pt[]): Pt {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  let left = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= len && len > 0)
      return { x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len };
    left -= len;
  }
  return points[points.length - 1]!;
}

/** Points along the path at most `step` px apart (the ends included). */
export function samplePath(points: readonly Pt[], step = 4): Pt[] {
  const out: Pt[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/**
 * The orthogonal route from box `a` to box `b` round `cards` (every card that is neither end), or a straight curve
 * when none is found (or there are too many cards near).
 */
export function routeLink(a: Rect, b: Rect, cards: readonly Rect[]): Route {
  const curve = (): Route => ({ ...linkGeometry(a, b), points: [], routed: false });
  const region = grow(
    {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
      h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
    },
    REGION,
  );
  const near = cards.filter((c) => touches(c, region));
  if (near.length > MAX_OBSTACLES) return curve();
  // The obstacles: the other cards grown by the margin (the routing lines lie on their edges, in the gutters), and the
  // two end boxes themselves (a path never crosses its own ends).
  const blocks = near.map((c) => grow(c, MARGIN));
  const ends = [a, b];
  const ports = ([0, 1, 2, 3] as const).flatMap((dir) => [
    { end: 0, dir, p: portOf(a, dir) },
    { end: 1, dir, p: portOf(b, dir) },
  ]);
  const xs = distinct([
    region.x,
    region.x + region.w,
    ...ports.map((q) => q.p.x),
    ...ends.flatMap((e) => [e.x - MARGIN, e.x + e.w + MARGIN]),
    ...blocks.flatMap((o) => [o.x, o.x + o.w]),
  ]).filter((x) => x >= region.x && x <= region.x + region.w);
  const ys = distinct([
    region.y,
    region.y + region.h,
    ...ports.map((q) => q.p.y),
    ...ends.flatMap((e) => [e.y - MARGIN, e.y + e.h + MARGIN]),
    ...blocks.flatMap((o) => [o.y, o.y + o.h]),
  ]).filter((y) => y >= region.y && y <= region.y + region.h);
  const nx = xs.length;
  const ny = ys.length;
  if (nx * ny > 160_000) return curve();
  const xi = new Map(xs.map((v, i) => [v, i]));
  const yi = new Map(ys.map((v, i) => [v, i]));
  const blockedMemo = new Map<number, boolean>();
  const nodeBlocked = (i: number, j: number) => {
    const k = j * nx + i;
    let v = blockedMemo.get(k);
    if (v === undefined) {
      const x = xs[i]!;
      const y = ys[j]!;
      v = blocks.some((o) => strictlyInside(o, x, y)) || strictlyInside(a, x, y) || strictlyInside(b, x, y);
      blockedMemo.set(k, v);
    }
    return v;
  };
  // A step between two adjacent nodes: open when its middle is clear of every card and of the end boxes (closed: not
  // along an end's own edge either).
  const stepOpen = (i: number, j: number, dir: Dir) => {
    const i2 = i + DX[dir];
    const j2 = j + DY[dir];
    if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) return false;
    const mx = (xs[i]! + xs[i2]!) / 2;
    const my = (ys[j]! + ys[j2]!) / 2;
    if (blocks.some((o) => strictlyInside(o, mx, my))) return false;
    if (insideClosed(a, mx, my) || insideClosed(b, mx, my)) return false;
    return !nodeBlocked(i2, j2);
  };
  const key = (i: number, j: number, d: Dir) => (j * nx + i) * 4 + d;
  const heap = new Heap<{ i: number; j: number; d: Dir; g: number }>();
  const best = new Map<number, number>();
  const from = new Map<number, number>();
  const goals = new Map<number, { dir: Dir }>(); // node index → the side of b
  for (const q of ports) {
    const i = xi.get(Math.round(q.p.x * 100) / 100)!;
    const j = yi.get(Math.round(q.p.y * 100) / 100)!;
    if (q.end === 0) {
      // Leave `a` outward from this side.
      const k = key(i, j, q.dir);
      best.set(k, 0);
      heap.push(0, { i, j, d: q.dir, g: 0 });
    } else goals.set(j * nx + i, { dir: q.dir });
  }
  const target = ports.filter((q) => q.end === 1).map((q) => q.p);
  const h = (i: number, j: number) =>
    Math.min(...target.map((t) => Math.abs(xs[i]! - t.x) + Math.abs(ys[j]! - t.y)));
  let found: { i: number; j: number; d: Dir } | undefined;
  for (let guard = 0; guard < 600_000; guard++) {
    const cur = heap.pop();
    if (!cur) break;
    const k = key(cur.i, cur.j, cur.d);
    if (cur.g > (best.get(k) ?? Infinity)) continue;
    if (goals.has(cur.j * nx + cur.i)) {
      found = cur;
      break;
    }
    for (const nd of [0, 1, 2, 3] as const) {
      if (nd === (((cur.d + 2) % 4) as Dir)) continue; // no U-turn
      if (!stepOpen(cur.i, cur.j, nd)) continue;
      const i2 = cur.i + DX[nd];
      const j2 = cur.j + DY[nd];
      const len = Math.abs(xs[i2]! - xs[cur.i]!) + Math.abs(ys[j2]! - ys[cur.j]!);
      const g = cur.g + len + (nd === cur.d ? 0 : BEND);
      const k2 = key(i2, j2, nd);
      if (g < (best.get(k2) ?? Infinity)) {
        best.set(k2, g);
        from.set(k2, k);
        heap.push(g + h(i2, j2), { i: i2, j: j2, d: nd, g });
      }
    }
  }
  if (!found) return curve();
  const pts: Pt[] = [];
  for (let k: number | undefined = key(found.i, found.j, found.d); k !== undefined; k = from.get(k)) {
    const node = Math.floor(k / 4);
    pts.push({ x: xs[node % nx]!, y: ys[Math.floor(node / nx)]! });
  }
  pts.reverse();
  const points = simplify(pts);
  if (points.length < 2) return curve();
  return {
    d: pathOf(points),
    from: points[0]!,
    to: points[points.length - 1]!,
    mid: midOf(points),
    points,
    routed: true,
  };
}

/**
 * Where a link's label goes: along the path (not within `margin` of its ends), the place whose pill covers the least
 * of `avoid` (cards and frame furniture), nearest the middle when several are equally clear.
 */
export function labelSpot(route: Route, text: string, avoid: readonly Rect[], margin = 28): Pt {
  if (!route.routed || route.points.length < 2) return route.mid;
  const pill = linkPillSize(text);
  const samples = samplePath(route.points, 6);
  const total = samples.length;
  const lo = Math.min(Math.floor(total / 2), Math.ceil(margin / 6));
  const usable = samples.slice(lo, Math.max(lo + 1, total - lo));
  let bestPt = route.mid;
  let bestScore = Infinity;
  const clearance = (p: Pt) => {
    const r = { x: p.x - pill.w / 2 - 3, y: p.y - pill.h / 2 - 3, w: pill.w + 6, h: pill.h + 6 };
    let area = 0;
    for (const o of avoid) {
      const w = Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x);
      const hh = Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y);
      if (w > 0 && hh > 0) area += w * hh;
    }
    return area;
  };
  for (const p of usable) {
    const score = clearance(p) * 1000 + Math.hypot(p.x - route.mid.x, p.y - route.mid.y);
    if (score < bestScore) {
      bestScore = score;
      bestPt = p;
    }
  }
  return bestPt;
}

/**
 * The routes of every link of a board, kept between calls: a link is routed again only when one of its ends, or a card
 * near it, moved or changed size. Routing a link takes a few milliseconds, so `routes` takes a time budget: the links
 * that are not routed yet are drawn as the plain curve (`stale`) and the caller comes back for them.
 */
export class LinkRoutes {
  private readonly cache = new Map<string, { sig: string; route: Route }>();

  /** The route of every link with both ends drawn, in link order; `stale` when some are still the plain curve. */
  routes(
    board: BoardState,
    budgetMs = Infinity,
  ): { items: { link: Link; route: Route; a: Rect; b: Rect }[]; stale: boolean } {
    const cards = Object.values(board.cards).filter((c) => !c.stackedInto);
    const items: { link: Link; route: Route; a: Rect; b: Rect }[] = [];
    const seen = new Set<string>();
    const start = typeof performance !== 'undefined' ? performance.now() : 0;
    let stale = false;
    for (const link of Object.values(board.links)) {
      const fromId = shownEnd(board, link.from);
      const toId = shownEnd(board, link.to);
      if (!fromId || !toId || fromId === toId) continue;
      const a = rectOf(board, fromId);
      const b = rectOf(board, toId);
      if (!a || !b) continue;
      const rects = cards.filter((c) => c.id !== fromId && c.id !== toId);
      const region = grow(
        {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
          h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
        },
        REGION,
      );
      const near = rects.filter((c) => touches(c, region));
      const sig = [a, b, ...near].map((r) => `${r.x},${r.y},${r.w},${r.h}`).join('|');
      seen.add(link.id);
      const hit = this.cache.get(link.id);
      if (hit && hit.sig === sig) {
        items.push({ link, route: hit.route, a, b });
        continue;
      }
      if (budgetMs !== Infinity && performance.now() - start > budgetMs) {
        // Out of time: the plain curve for now (the previous route, when it is not too far off, would lag behind).
        stale = true;
        items.push({ link, route: { ...linkGeometry(a, b), points: [], routed: false }, a, b });
        continue;
      }
      const route = routeLink(a, b, near);
      this.cache.set(link.id, { sig, route });
      items.push({ link, route, a, b });
    }
    for (const id of this.cache.keys()) if (!seen.has(id)) this.cache.delete(id);
    return { items, stale };
  }
}
