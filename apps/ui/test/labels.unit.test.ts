/** P6.9: link-label and cursor-label placement, and where search results fly. */
import { describe, expect, it } from 'vitest';
import { CURSOR_PILL, LINK_PILL, cursorSlots, linkPillSize, separateLinkLabels } from '../src/canvas/labels.js';

const box = (id: string, x: number, y: number, text = 'LEADS TO') => ({ id, x, y, ...linkPillSize(text) });
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;

describe('link labels', () => {
  it('leaves labels that do not touch where they are', () => {
    const out = separateLinkLabels([box('a', 0, 0), box('b', 400, 0)]);
    expect(out.get('a')).toEqual({ x: 0, y: 0 });
    expect(out.get('b')).toEqual({ x: 400, y: 0 });
  });

  it('moves pills that would sit on each other apart, first one stays', () => {
    const labels = [box('a', 100, 100), box('b', 104, 102, 'CONTRADICTS'), box('c', 98, 99, 'SUPPORTS')];
    const out = separateLinkLabels(labels);
    expect(out.get('a')).toEqual({ x: 100, y: 100 });
    const placed = labels.map((l) => ({ ...l, ...out.get(l.id)! }));
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) expect(overlap(placed[i]!, placed[j]!)).toBe(false);
    // Moved straight down or up, never sideways.
    expect(out.get('b')!.x).toBe(104);
  });

  it('keeps clear of a frame label and a thread button (obstacles)', () => {
    const thread = { x: 500, y: 50, w: 84, h: 26 };
    const out = separateLinkLabels([box('a', 540, 63)], [thread]);
    const a = { ...box('a', 540, 63), ...out.get('a')! };
    expect(overlap(a, { x: thread.x + thread.w / 2, y: thread.y + thread.h / 2, w: thread.w, h: thread.h })).toBe(false);
    expect(Math.abs(out.get('a')!.y - 63) % (LINK_PILL.h + LINK_PILL.gap)).toBe(0);
  });

  it('is deterministic for the same input', () => {
    const labels = Array.from({ length: 6 }, (_, i) => box(`l${i}`, 50 + i, 50));
    expect([...separateLinkLabels(labels)]).toEqual([...separateLinkLabels(labels)]);
  });
});

describe('cursor labels', () => {
  const cursor = (agent: string, x: number, y: number, label = 'Scout, reading sources') => ({ agent, x, y, label });

  it('gives cursors of one frame different rows so their pills never overlap', () => {
    const slots = cursorSlots([cursor('scout', 100, 100), cursor('critic', 104, 102), cursor('builder', 98, 101)], 1);
    expect(slots.get('scout')).toBe(0);
    expect(slots.get('critic')).toBe(1);
    expect(slots.get('builder')).toBe(2);
  });

  it('keeps cursors that are far apart on row 0, and measures on screen (zoomed out they crowd)', () => {
    const far = cursorSlots([cursor('scout', 0, 0), cursor('critic', 900, 0)], 1);
    expect([far.get('scout'), far.get('critic')]).toEqual([0, 0]);
    const out = cursorSlots([cursor('scout', 0, 0), cursor('critic', 300, 0)], 0.25);
    expect(out.get('critic')).toBe(1);
    expect(CURSOR_PILL.h).toBeGreaterThan(0);
  });
});
