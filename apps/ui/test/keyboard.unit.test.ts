/** P2.7: zoom to fit / selection / 100% / search flight maths, and the key → shortcut table. */
import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  FIT_MIN_ZOOM,
  MIN_ZOOM,
  actualSize,
  easeInOut,
  fitView,
  flightAt,
  focusView,
  toWorld,
  type Insets,
  type Viewport,
} from '../src/canvas/viewport.js';
import { shortcutFor } from '../src/canvas/useShortcuts.js';

const size = { width: 1440, height: 900 };
const insets: Insets = { top: 80, right: 428, bottom: 24, left: 96 };
const free = { x: 96, y: 80, w: 1440 - 96 - 428, h: 900 - 80 - 24 };
/** The screen rect of a world rect under a viewport. */
const onScreen = (v: Viewport, r: { x: number; y: number; w: number; h: number }) => ({
  x: v.panX + r.x * v.zoom,
  y: v.panY + r.y * v.zoom,
  w: r.w * v.zoom,
  h: r.h * v.zoom,
});

describe('view maths (P2.7)', () => {
  it('fitView centres the rect in the free area and makes it as large as fits (with padding)', () => {
    const rect = { x: -500, y: 300, w: 2400, h: 900 };
    const v = fitView(rect, size, insets, 48);
    const s = onScreen(v, rect);
    expect(s.x + s.w / 2).toBeCloseTo(free.x + free.w / 2, 6);
    expect(s.y + s.h / 2).toBeCloseTo(free.y + free.h / 2, 6);
    expect(s.x).toBeGreaterThanOrEqual(free.x + 48 - 1e-6);
    expect(s.x + s.w).toBeLessThanOrEqual(free.x + free.w - 48 + 1e-6);
    // One dimension is tight.
    expect(Math.min(free.w - 96 - s.w, free.h - 96 - s.h)).toBeCloseTo(0, 6);
  });

  it('fitView clamps to 8%–250% (P6.20: a fit may go below the 25% a pinch reaches), and focusView stays at 25%', () => {
    expect(fitView({ x: 0, y: 0, w: 100_000, h: 100_000 }, size, insets).zoom).toBe(FIT_MIN_ZOOM);
    expect(fitView({ x: 0, y: 0, w: 6000, h: 4000 }, size, insets).zoom).toBeLessThan(MIN_ZOOM);
    expect(focusView({ x: 0, y: 0, w: 100_000, h: 100_000 }, { panX: 0, panY: 0, zoom: 1 }, size, insets).zoom).toBe(MIN_ZOOM);
    expect(fitView({ x: 0, y: 0, w: 10, h: 10 }, size, insets).zoom).toBe(MAX_ZOOM);
  });

  it('focusView centres a card, keeps the zoom when it is at least the minimum, never larger than fits', () => {
    const card = { x: 4000, y: 2000, w: 280, h: 200 };
    const at = (zoom: number) => focusView(card, { panX: 0, panY: 0, zoom }, size, insets);
    expect(at(0.3).zoom).toBe(0.8);
    expect(at(1.5).zoom).toBe(1.5);
    const s = onScreen(at(1), card);
    expect(s.x + s.w / 2).toBeCloseTo(free.x + free.w / 2, 6);
    expect(s.y + s.h / 2).toBeCloseTo(free.y + free.h / 2, 6);
    const huge = { x: 0, y: 0, w: 3000, h: 3000 };
    const hv = focusView(huge, { panX: 0, panY: 0, zoom: 1 }, size, insets);
    expect(onScreen(hv, huge).h).toBeLessThanOrEqual(free.h);
  });

  it('actualSize goes to 100% keeping the world point at the centre of the free area', () => {
    const v = { panX: -300, panY: 120, zoom: 0.4 };
    const before = toWorld(v, 720, 450);
    const a = actualSize(v, size);
    expect(a.zoom).toBe(1);
    const after = toWorld(a, 720, 450);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    const cx = free.x + free.w / 2;
    const cy = free.y + free.h / 2;
    const b = actualSize(v, size, insets);
    expect(toWorld(b, cx, cy).x).toBeCloseTo(toWorld(v, cx, cy).x, 6);
    expect(toWorld(b, cx, cy).y).toBeCloseTo(toWorld(v, cx, cy).y, 6);
  });

  it('flightAt starts and ends exactly, and changes the zoom geometrically', () => {
    const from = { panX: 0, panY: 0, zoom: 0.25 };
    const to = { panX: -2000, panY: -900, zoom: 1 };
    expect(flightAt(from, to, 0, size)).toEqual(from);
    expect(flightAt(from, to, 1, size)).toEqual(to);
    expect(flightAt(from, to, 0.5, size).zoom).toBeCloseTo(0.5, 9);
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 9);
  });
});

const key = (
  k: string,
  code: string,
  mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  key: k,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('shortcut table (P2.7)', () => {
  it('maps the PRD keys', () => {
    expect(shortcutFor(key('f', 'KeyF', { metaKey: true }), false)).toBe('openSearch');
    expect(shortcutFor(key('!', 'Digit1', { shiftKey: true }), false)).toBe('fitBoard');
    expect(shortcutFor(key('@', 'Digit2', { shiftKey: true }), false)).toBe('fitSelection');
    expect(shortcutFor(key('0', 'Digit0', { metaKey: true }), false)).toBe('actualSize');
    expect(shortcutFor(key('v', 'KeyV'), false)).toEqual({ tool: 'select' });
    expect(shortcutFor(key('n', 'KeyN'), false)).toEqual({ tool: 'note' });
    expect(shortcutFor(key('f', 'KeyF'), false)).toEqual({ tool: 'frame' });
    expect(shortcutFor(key('C', 'KeyC'), false)).toEqual({ tool: 'connect' });
  });

  it('leaves copy/paste, other modifiers and plain digits alone', () => {
    expect(shortcutFor(key('c', 'KeyC', { metaKey: true }), false)).toBeNull();
    expect(shortcutFor(key('v', 'KeyV', { metaKey: true }), false)).toBeNull();
    expect(shortcutFor(key('n', 'KeyN', { altKey: true }), false)).toBeNull();
    expect(shortcutFor(key('N', 'KeyN', { shiftKey: true }), false)).toBeNull();
    expect(shortcutFor(key('1', 'Digit1'), false)).toBeNull();
    expect(shortcutFor(key('f', 'KeyF', { metaKey: true, shiftKey: true }), false)).toBeNull();
  });

  it('in a text field only Cmd+F and Cmd+0 are taken', () => {
    expect(shortcutFor(key('f', 'KeyF', { metaKey: true }), true)).toBe('openSearch');
    expect(shortcutFor(key('n', 'KeyN'), true)).toBeNull();
    expect(shortcutFor(key('!', 'Digit1', { shiftKey: true }), true)).toBeNull();
    expect(shortcutFor(key('0', 'Digit0', { metaKey: true }), true)).toBe('actualSize');
  });
});
