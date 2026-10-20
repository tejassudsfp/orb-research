/** P6.20: links routed round cards (pure), their label spots, and the camera maths (insets, opening view). */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { emptyBoard, type BoardState, type Card, type Link } from '@orb/shared';
import {
  LinkRoutes,
  MARGIN,
  labelSpot,
  midOf,
  routeLink,
  samplePath,
  type Route,
} from '../src/canvas/routing.js';
import {
  FIT_MIN_ZOOM,
  MIN_ZOOM,
  chromeInsets,
  inFreeArea,
  openingView,
  zoomAt,
  type Insets,
  type Rect,
} from '../src/canvas/viewport.js';

const R = (x: number, y: number, w = 200, h = 160): Rect => ({ x, y, w, h });
const inside = (r: Rect, p: { x: number; y: number }, m = 0) =>
  p.x > r.x - m && p.x < r.x + r.w + m && p.y > r.y - m && p.y < r.y + r.h + m;
/** True when no sampled point of the route lies strictly inside a card. */
const clear = (route: Route, cards: readonly Rect[]) =>
  samplePath(route.points, 2).every((p) => cards.every((c) => !inside(c, p)));

describe('routeLink', () => {
  it('goes straight between two cards side by side with nothing between them', () => {
    const a = R(0, 0);
    const b = R(400, 0);
    const route = routeLink(a, b, []);
    expect(route.routed).toBe(true);
    expect(route.points).toEqual([
      { x: 200, y: 80 },
      { x: 400, y: 80 },
    ]);
    expect(route.d).toBe('M200 80 L400 80');
  });

  it('goes round a card that stands between them, through the gutters, with right-angle corners', () => {
    const a = R(0, 0);
    const b = R(600, 0);
    const wall = R(300, -40, 200, 240);
    const route = routeLink(a, b, [wall]);
    expect(route.routed).toBe(true);
    expect(clear(route, [wall])).toBe(true);
    // Every run is horizontal or vertical.
    for (let i = 1; i < route.points.length; i++) {
      const p = route.points[i - 1]!;
      const q = route.points[i]!;
      expect(p.x === q.x || p.y === q.y).toBe(true);
    }
    // It keeps the margin from the card it passes, and starts at a's edge and ends at b's.
    for (const p of samplePath(route.points, 4)) expect(inside(wall, p, MARGIN - 1)).toBe(false);
    const onEdge = (r: Rect, p: { x: number; y: number }) =>
      (p.x === r.x || p.x === r.x + r.w || p.y === r.y || p.y === r.y + r.h) &&
      p.x >= r.x &&
      p.x <= r.x + r.w &&
      p.y >= r.y &&
      p.y <= r.y + r.h;
    expect(onEdge(a, route.from)).toBe(true);
    expect(onEdge(b, route.to)).toBe(true);
    expect(route.d).toContain('Q');
  });

  it('routes between cards stacked in one column when a neighbour is in the way', () => {
    const a = R(0, 0, 200, 120);
    const mid = R(0, 136, 200, 120);
    const b = R(0, 272, 200, 120);
    const route = routeLink(a, b, [mid]);
    expect(route.routed).toBe(true);
    expect(clear(route, [mid])).toBe(true);
  });

  it('never crosses any card, for random boards (fuzz)', () => {
    const box = fc.record({
      x: fc.integer({ min: 0, max: 20 }).map((n) => n * 60),
      y: fc.integer({ min: 0, max: 12 }).map((n) => n * 60),
      w: fc.integer({ min: 2, max: 4 }).map((n) => n * 60),
      h: fc.integer({ min: 2, max: 3 }).map((n) => n * 60),
    });
    const overlaps = (p: Rect, q: Rect) =>
      p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y;
    fc.assert(
      fc.property(box, box, fc.array(box, { maxLength: 14 }), (a, b, others) => {
        fc.pre(!overlaps(a, b));
        const cards = others.filter((o) => !overlaps(o, a) && !overlaps(o, b));
        const route = routeLink(a, b, cards);
        if (!route.routed) return; // the curve fallback is allowed when no path exists
        expect(clear(route, [a, b, ...cards])).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('keeps the path inside the region whose obstacles were checked', () => {
    const a = R(0, 0, 120, 120);
    const b = R(240, 240, 120, 120);
    const cards = [
      R(0, 360, 120, 180),
      R(360, 120, 240, 120),
      R(0, 180, 120, 180),
      R(600, 0, 120, 120),
      R(60, 120, 240, 120),
    ];
    const route = routeLink(a, b, cards);
    expect(route.routed).toBe(true);
    expect(clear(route, [a, b, ...cards])).toBe(true);
  });

  it('falls back to the curve when there are too many cards in the way', () => {
    const cards = Array.from({ length: 300 }, (_, i) =>
      R(100 + (i % 20) * 20, (Math.floor(i / 20) - 7) * 20, 10, 10),
    );
    const route = routeLink(R(0, 0), R(600, 0), cards);
    expect(route.routed).toBe(false);
    expect(route.d.startsWith('M')).toBe(true);
  });

  it('midOf and samplePath walk the path by length', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(midOf(pts)).toEqual({ x: 100, y: 0 });
    const s = samplePath(pts, 10);
    expect(s[0]).toEqual({ x: 0, y: 0 });
    expect(s.at(-1)).toEqual({ x: 100, y: 100 });
    expect(s).toHaveLength(21);
  });
});

describe('labelSpot', () => {
  it('moves the label off a card the middle of the path runs beside', () => {
    const a = R(0, 0);
    const b = R(800, 0);
    // A card whose gutter-side lies on the path's middle: the pill there would cover it.
    const near = R(380, 90, 120, 60);
    const route = routeLink(a, b, [near]);
    const at = labelSpot(route, 'SUPPORTS', [near]);
    const w = 8.4 * 8 + 22;
    const pill = { x: at.x - w / 2, y: at.y - 12, w, h: 25 };
    const hit =
      pill.x < near.x + near.w &&
      pill.x + pill.w > near.x &&
      pill.y < near.y + near.h &&
      pill.y + pill.h > near.y;
    expect(hit).toBe(false);
  });
});

const card = (id: string, r: Rect): Card =>
  ({ id, type: 'note', frameId: null, ...r, data: {}, provenance: { kind: 'user', at: 1 } }) as Card;
const link = (id: string, from: string, to: string): Link =>
  ({ id, from, to, type: 'supports', provenance: { kind: 'user', at: 1 } }) as Link;

describe('LinkRoutes', () => {
  const board = (): BoardState => ({
    ...emptyBoard(),
    cards: {
      c_a: card('c_a', R(0, 0)),
      c_b: card('c_b', R(600, 0)),
      c_w: card('c_w', R(300, -40, 200, 240)),
    },
    links: { l_1: link('l_1', 'c_a', 'c_b') },
  });

  it('routes every link round the other cards, and keeps a route until something near it changes', () => {
    const routes = new LinkRoutes();
    const s = board();
    const [first] = routes.routes(s).items;
    expect(first!.route.routed).toBe(true);
    expect(routes.routes(s).items[0]!.route).toBe(first!.route); // cached: the same object
    // A card far away changes nothing for this link.
    const far = { ...s, cards: { ...s.cards, c_far: card('c_far', R(9000, 9000)) } };
    expect(routes.routes(far).items[0]!.route).toBe(first!.route);
    // The wall moves out of the way: the route is made again, and is straight.
    const moved = { ...s, cards: { ...s.cards, c_w: card('c_w', R(300, 400)) } };
    expect(routes.routes(moved).items[0]!.route.points).toHaveLength(2);
    // With no time left a link not routed yet is the plain curve and the result says so; the next call finishes it.
    const fresh = new LinkRoutes();
    const none = fresh.routes(s, -1);
    expect(none.stale).toBe(true);
    expect(none.items[0]!.route.routed).toBe(false);
    expect(fresh.routes(s).stale).toBe(false);
    expect(fresh.routes(s).items[0]!.route.routed).toBe(true);
  });

  it('draws a link to a stacked card to its stack, and skips a link between two cards of one stack', () => {
    const s = board();
    s.cards.c_a = { ...s.cards.c_a!, stackedInto: 'c_w' } as Card;
    const out = new LinkRoutes().routes(s).items;
    expect(out).toHaveLength(1);
    expect(out[0]!.a).toMatchObject({ x: 300 });
  });
});

describe('camera maths (P6.20)', () => {
  const size = { width: 1920, height: 1080 };
  const base: Insets = { top: 80, right: 24, bottom: 24, left: 96 };

  it('clears the chat panel, the reading queue and the minimap each on the cheapest side', () => {
    const chat = { x: 1500, y: 520, w: 380, h: 540 };
    const queue = { x: 1560, y: 84, w: 320, h: 260 };
    const minimap = { x: 24, y: 900, w: 190, h: 150 };
    const i = chromeInsets(size, [chat, queue, minimap], base);
    // Chat and queue are both cleared by one right inset (the queue lies inside it); the minimap by a left inset.
    expect(i.right).toBe(1920 - 1500 + 16);
    expect(i.left).toBe(24 + 190 + 16);
    expect(i.top).toBe(80);
    expect(i.bottom).toBe(24);
    // No panel intersects the free area afterwards.
    const free = { x: i.left, y: i.top, w: 1920 - i.left - i.right, h: 1080 - i.top - i.bottom };
    for (const p of [chat, queue, minimap])
      expect(p.x < free.x + free.w && p.x + p.w > free.x && p.y < free.y + free.h && p.y + p.h > free.y).toBe(
        false,
      );
  });

  it('a panel that already lies outside the free area changes nothing; a small pill goes below the board', () => {
    expect(chromeInsets(size, [{ x: 10, y: 300, w: 60, h: 200 }], base)).toEqual(base);
    const pill = { x: 1700, y: 1000, w: 170, h: 50 };
    const i = chromeInsets(size, [pill], base);
    expect(i.bottom).toBe(1080 - 1000 + 16);
    expect(i.right).toBe(24);
  });

  it('uses the largest free area when a small selection hits the zoom cap, keeping Actual size centred', () => {
    const viewport = { width: 1440, height: 900 };
    const panels = [
      { x: 96, y: 84, w: 1328, h: 48 },
      { x: 24, y: 726, w: 168, h: 150 },
      { x: 1200, y: 820, w: 216, h: 56 },
    ];
    const ordinary = chromeInsets(viewport, panels, base);
    expect(chromeInsets(viewport, panels, base, 16, { x: 500, y: 500, w: 240, h: 150 })).toEqual(ordinary);
  });

  it('opens a board that fits at 100% as it was, and a larger one fitted, never zoomed in', () => {
    const insets = chromeInsets(size, [], base);
    expect(openingView(null, size, insets)).toBeNull();
    expect(openingView({ x: 96, y: 120, w: 800, h: 500 }, size, insets)).toEqual({
      panX: 0,
      panY: 0,
      zoom: 1,
    });
    const big = { x: 96, y: 120, w: 4600, h: 3100 };
    const v = openingView(big, size, insets)!;
    expect(v.zoom).toBeLessThan(0.5);
    expect(inFreeArea(big, v, size, insets)).toBe(true);
    // A board bigger than a screen at 25% is fitted below 25% (an overview), never below the fit floor...
    const huge = { x: 96, y: 120, w: 9000, h: 6000 };
    const hv = openingView(huge, size, insets)!;
    expect(hv.zoom).toBeLessThan(MIN_ZOOM);
    expect(hv.zoom).toBeGreaterThanOrEqual(FIT_MIN_ZOOM);
    expect(inFreeArea(huge, hv, size, insets)).toBe(true);
    // ...and zooming out from there does not jump back up to 25%.
    expect(zoomAt(hv, 0.8, 700, 400).zoom).toBe(hv.zoom);
    expect(zoomAt(hv, 1.5, 700, 400).zoom).toBeCloseTo(hv.zoom * 1.5, 6);
    // A small board far from the origin is centred in the free area, still at 100%.
    const far = openingView({ x: 5000, y: 5000, w: 600, h: 400 }, size, insets)!;
    expect(far.zoom).toBe(1);
    expect(inFreeArea({ x: 5000, y: 5000, w: 600, h: 400 }, far, size, insets)).toBe(true);
  });
});
