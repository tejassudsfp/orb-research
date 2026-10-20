import { describe, expect, it } from 'vitest';
import {
  CULL_MARGIN,
  MAX_ZOOM,
  MIN_ZOOM,
  bounds,
  cull,
  frameLabel,
  gridStyle,
  lodFor,
  toWorld,
  visibleWorldRect,
  zoomAt,
  type Viewport,
} from '../src/canvas/viewport.js';

const v0: Viewport = { panX: 0, panY: 0, zoom: 1 };

describe('canvas viewport math (P2.2)', () => {
  it('zoomAt keeps the world point under the cursor fixed and clamps to 25%–250%', () => {
    const v = { panX: 120, panY: -40, zoom: 0.8 };
    const before = toWorld(v, 600, 300);
    const z = zoomAt(v, 1.7, 600, 300);
    const after = toWorld(z, 600, 300);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(zoomAt(v0, 100, 0, 0).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(v0, 0.001, 0, 0).zoom).toBe(MIN_ZOOM);
    // At the clamp the pan does not drift.
    const clamped = zoomAt({ panX: 5, panY: 6, zoom: MAX_ZOOM }, 2, 300, 300);
    expect(clamped).toEqual({ panX: 5, panY: 6, zoom: MAX_ZOOM });
  });

  it('the visible world rect grows by 20% of the viewport on each side', () => {
    const r = visibleWorldRect({ panX: -200, panY: -100, zoom: 2 }, { width: 1000, height: 500 });
    // Unmargined: x 100..600, y 50..300 (500 x 250 world px).
    expect(r.x).toBeCloseTo(100 - 500 * CULL_MARGIN);
    expect(r.y).toBeCloseTo(50 - 250 * CULL_MARGIN);
    expect(r.w).toBeCloseTo(500 * 1.4);
    expect(r.h).toBeCloseTo(250 * 1.4);
  });

  it('culls items outside the margin and keeps the ones inside it, in order', () => {
    const size = { width: 1000, height: 1000 };
    const items = [
      { id: 'in', x: 100, y: 100, w: 10, h: 10 },
      { id: 'margin', x: 1150, y: 500, w: 10, h: 10 }, // right of the screen, inside the 20% margin
      { id: 'out', x: 1300, y: 500, w: 10, h: 10 },
      { id: 'straddle', x: -260, y: -260, w: 80, h: 80 }, // crosses the top-left margin edge
    ];
    expect(cull(items, visibleWorldRect(v0, size)).map((i) => i.id)).toEqual(['in', 'margin', 'straddle']);
    expect(cull(items, visibleWorldRect(v0, size, 0)).map((i) => i.id)).toEqual(['in']);
  });

  it('picks the level of detail by zoom: full ≥ 0.6, compact 0.35–0.6, title below 0.35', () => {
    expect(lodFor(2.5)).toBe('full');
    expect(lodFor(0.6)).toBe('full');
    expect(lodFor(0.5999)).toBe('compact');
    expect(lodFor(0.35)).toBe('compact');
    expect(lodFor(0.3499)).toBe('title');
    expect(lodFor(0.25)).toBe('title');
  });

  it('labels frames 01 THESIS and moves/scales the dot grid with the board', () => {
    expect(frameLabel(0, 'Thesis')).toBe('01 THESIS');
    expect(frameLabel(11, 'Open questions')).toBe('12 OPEN QUESTIONS');
    expect(gridStyle({ panX: 13, panY: -7, zoom: 0.5 })).toEqual({
      backgroundSize: '12px 12px',
      backgroundPosition: '13px -7px',
    });
  });

  it('bounds of rects', () => {
    expect(bounds([])).toBeNull();
    expect(
      bounds([
        { x: 10, y: 20, w: 5, h: 5 },
        { x: -5, y: 0, w: 10, h: 100 },
      ]),
    ).toEqual({ x: -5, y: 0, w: 20, h: 100 });
  });
});
