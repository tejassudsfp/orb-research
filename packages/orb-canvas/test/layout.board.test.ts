/**
 * P6.20 board layout quality (pure): a 12-frame VC-like template board with about 100 mixed agent cards placed round
 * the frames stays free of overlaps, every card inside its frame, the board roughly screen-shaped, frames growing
 * sideways before down, user-placed cards never moved; measured heights (`planMeasured`) reflow frames the same way
 * every time (idempotent, deterministic, never moving a pinned card, closing up after a shrink).
 */
import { describe, expect, it } from 'vitest';
import {
  applyChanges,
  emptyBoard,
  isPinned,
  specOf,
  type BoardChange,
  type BoardState,
  type Card,
  type CardType,
  type Frame,
} from '@orb/shared';
import {
  CELLS,
  HEIGHTS,
  LAYOUT,
  MEASURE_EPS,
  cellOf,
  frameColumns,
  layoutChanges,
  planMeasured,
  type Rect,
} from '../src/layout.js';
import { isCanvasError } from '../src/errors.js';
import { planTemplate } from '../src/templatePlan.js';

const at = 1;
const agent = { kind: 'agent', agent: 'scout', model: 'm', sessionId: 's', at } as const;

/** mulberry32: a small seeded generator, so the mix is the same on every run. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIX: CardType[] = [
  'source',
  'source',
  'source',
  'quote',
  'question',
  'question',
  'risk',
  'metric',
  'metric',
  'insight',
  'entity',
  'note',
  'doc',
  'table',
  'database',
  'chart',
  'matrix',
  'timeline',
  'checklist',
  'hypothesis',
];

/** The VC template laid out and seeded as the service does, as a folded board. */
function vcBoard(): { state: BoardState; frameIds: string[] } {
  const spec = specOf('vc-dd')!;
  const plan = planTemplate(spec);
  const frameIds = plan.frames.map((_, i) => `f_vc${i}`);
  const changes: BoardChange[] = plan.frames.map((f, i) => ({
    type: 'frame.added',
    data: {
      frame: {
        id: frameIds[i]!,
        title: f.title,
        color: f.color,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        provenance: { kind: 'user', at },
      } as Frame,
    },
  }));
  plan.seeds.forEach((p, n) =>
    changes.push({
      type: 'card.added',
      data: {
        card: {
          id: `c_seed${n}`,
          type: p.seed.type,
          frameId: frameIds[p.frameIndex]!,
          ...p.rect,
          data: p.seed.data,
          seed: true,
          provenance: { kind: 'user', at },
        } as Card,
      },
    }),
  );
  return { state: applyChanges(emptyBoard(), changes), frameIds };
}

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** `strict: false` allows frames to overlap (a frame blocked by one that holds a user card, which never moves). */
function check(state: BoardState, label: string, strict = true) {
  const frames = Object.values(state.frames);
  const cards = Object.values(state.cards).filter((c) => !c.stackedInto);
  if (strict)
    for (const [i, a] of frames.entries())
      for (const b of frames.slice(i + 1))
        expect(overlap(a, b), `${label}: ${a.title} / ${b.title}`).toBe(false);
  for (const c of cards) {
    const f = state.frames[c.frameId!]!;
    expect(c.x, `${label}: ${c.id} left`).toBeGreaterThanOrEqual(f.x + LAYOUT.pad);
    expect(c.x + c.w, `${label}: ${c.id} right`).toBeLessThanOrEqual(f.x + f.w - LAYOUT.pad);
    expect(c.y, `${label}: ${c.id} top`).toBeGreaterThanOrEqual(f.y + LAYOUT.top);
    expect(c.y + c.h, `${label}: ${c.id} bottom`).toBeLessThanOrEqual(f.y + f.h - LAYOUT.pad);
  }
  for (const [i, a] of cards.entries())
    for (const b of cards.slice(i + 1))
      if (strict || a.frameId === b.frameId) expect(overlap(a, b), `${label}: ${a.id} / ${b.id}`).toBe(false);
}

const boundsOf = (state: BoardState) => {
  const f = Object.values(state.frames);
  const x0 = Math.min(...f.map((r) => r.x));
  const y0 = Math.min(...f.map((r) => r.y));
  return { w: Math.max(...f.map((r) => r.x + r.w)) - x0, h: Math.max(...f.map((r) => r.y + r.h)) - y0 };
};

/** Place `n` agent cards round the frames (a mix of types and content lengths), as the service does. */
function fill(
  state: BoardState,
  frameIds: string[],
  n: number,
  seed: number,
  allowBlocked = false,
): BoardState {
  const rand = rng(seed);
  let s = state;
  for (let i = 0; i < n; i++) {
    const frameId = frameIds[i % frameIds.length]!;
    const type = MIX[Math.floor(rand() * MIX.length)]!;
    const text = 'word '.repeat(Math.floor(rand() * 60));
    const data = {
      title: `Card ${i} ${'t'.repeat(Math.floor(rand() * 40))}`,
      text,
      summary: text,
      rowCount: Math.floor(rand() * 30),
    };
    const cell = cellOf({ type, data, why: 'because this is why' });
    try {
      const { rect, changes } = layoutChanges(s, frameId, cell, new Set());
      const card: Card = {
        id: `c_a${i}`,
        type,
        frameId,
        ...rect,
        data,
        why: 'because this is why',
        provenance: agent,
      };
      s = applyChanges(s, [...changes, { type: 'card.added', data: { card } }]);
    } catch (error) {
      if (!allowBlocked || !isCanvasError(error) || !error.details.layoutBlocked) throw error;
    }
    if (i % 17 === 0) check(s, `after ${i + 1}`);
  }
  return s;
}

describe('the 12-frame VC board (P6.20)', () => {
  it('lays the template out wide: frames 4 to 8 columns, in a board shaped like a screen', () => {
    const { state, frameIds } = vcBoard();
    expect(frameIds).toHaveLength(12);
    const cols = Object.values(state.frames).map((f) => frameColumns(f));
    expect(Math.min(...cols)).toBeGreaterThanOrEqual(4);
    expect(Math.max(...cols)).toBeLessThanOrEqual(LAYOUT.maxCols);
    // The old board was three tall columns (aspect about 0.4); now it is a screen's shape.
    const b = boundsOf(state);
    expect(b.w / b.h).toBeGreaterThan(1.2);
    expect(b.w / b.h).toBeLessThan(2.1);
    check(state, 'seeded');
    // Frames come in the spec's order, left to right, top to bottom.
    const fr = frameIds.map((id) => state.frames[id]!);
    for (let i = 1; i < fr.length; i++)
      expect(fr[i]!.y > fr[i - 1]!.y - 1 || fr[i]!.x > fr[i - 1]!.x, `frame ${i}`).toBe(true);
  });

  it('about 100 mixed cards: no overlaps, every card inside its frame, still screen-shaped, frames grew sideways first', () => {
    for (const seed of [1, 2, 3]) {
      const { state, frameIds } = vcBoard();
      const before = Object.fromEntries(Object.values(state.frames).map((f) => [f.id, f]));
      const done = fill(state, frameIds, 100, seed);
      check(done, `seed ${seed}`);
      const b = boundsOf(done);
      expect(b.w / b.h, `aspect, seed ${seed}`).toBeGreaterThan(1.0);
      expect(b.w / b.h, `aspect, seed ${seed}`).toBeLessThan(2.2);
      for (const f of Object.values(done.frames)) {
        const old = before[f.id]!;
        // A frame that took 8 or more cards is wide: sideways growth came first.
        if (Object.values(done.cards).filter((c) => c.frameId === f.id && !c.seed).length >= 8)
          expect(frameColumns(f), `${f.title} columns`).toBeGreaterThanOrEqual(6);
        expect(f.w).toBeGreaterThanOrEqual(old.w);
      }
    }
  });

  it('never moves a user-placed card, nor a frame that holds one', () => {
    const { state, frameIds } = vcBoard();
    const home = state.frames[frameIds[2]!]!;
    // A free spot in the frame (what the layout engine would give a card), taken by the user's own note.
    const spot = layoutChanges(state, home.id, { cols: 2, h: 176 }, new Set());
    const mine: Card = {
      id: 'c_mine',
      type: 'note',
      frameId: home.id,
      ...spot.rect,
      data: { text: 'mine' },
      provenance: { kind: 'user', at },
    };
    const dragged = Object.values(state.cards).find((c) => c.frameId === frameIds[4]);
    let s = applyChanges(state, [
      ...spot.changes,
      { type: 'card.added', data: { card: mine } },
      ...(dragged
        ? [
            {
              type: 'card.moved' as const,
              data: { moves: [{ id: dragged.id, x: dragged.x, y: dragged.y }] },
              actor: { kind: 'user' as const },
            },
          ]
        : []),
    ]);
    const keep = Object.fromEntries(
      Object.values(s.cards)
        .filter((c) => isPinned(c))
        .map((c) => [c.id, [c.x, c.y, c.w, c.h]]),
    );
    const lockedFrame = { ...s.frames[home.id]! };
    s = fill(s, frameIds, 100, 7, true);
    check(s, 'pinned frames remain clear');
    for (const [id, r] of Object.entries(keep))
      expect([s.cards[id]!.x, s.cards[id]!.y, s.cards[id]!.w, s.cards[id]!.h], id).toEqual(r);
    expect(s.frames[home.id]).toMatchObject({ x: lockedFrame.x, y: lockedFrame.y });
    // Everything else is still clear of everything.
    const cards = Object.values(s.cards);
    for (const c of cards) if (c.id !== 'c_mine') expect(overlap(c, mine), c.id).toBe(false);
  });
});

describe('planMeasured (P6.20)', () => {
  it('rejects impossible growth between two pinned frames without changing their geometry', () => {
    const b = emptyBoard();
    for (let i = 0; i < 2; i++) {
      const f = {
        id: `f_fixed${i}`,
        title: `Fixed ${i}`,
        color: 'sky',
        x: 0,
        y: i * 348,
        w: 640,
        h: 300,
        provenance: { kind: 'user', at },
      } as Frame;
      b.frames[f.id] = f;
      b.cards[`c_pin${i}`] = {
        id: `c_pin${i}`,
        type: 'note',
        frameId: f.id,
        x: 24,
        y: f.y + 56,
        w: 280,
        h: 176,
        data: { text: 'Keep here' },
        provenance: { kind: 'user', at },
      } as Card;
    }
    const original = JSON.stringify(b);
    expect(() => layoutChanges(b, 'f_fixed0', { cols: 3, h: 440 }, new Set())).toThrow(/pinned cards/);
    expect(JSON.stringify(b)).toBe(original);
    // A measured card must also retain its preview size when growing it would cover the pinned neighbour.
    b.cards.c_measured = {
      id: 'c_measured',
      type: 'source',
      frameId: 'f_fixed0',
      x: 320,
      y: 56,
      w: 280,
      h: 176,
      data: { title: 'A source' },
      provenance: agent,
    } as Card;
    expect(planMeasured(b, { c_measured: 340 })).toEqual([]);
  });
  it('applies measured heights in the type range, reflows the frame, and is idempotent', () => {
    const { state, frameIds } = vcBoard();
    const s0 = fill(state, frameIds.slice(0, 3), 18, 11);
    const heights: Record<string, number> = {};
    const rand = rng(5);
    for (const c of Object.values(s0.cards)) heights[c.id] = 150 + Math.floor(rand() * 400);
    const changes = planMeasured(s0, heights);
    expect(changes.length).toBeGreaterThan(0);
    const s1 = applyChanges(s0, changes);
    for (const c of Object.values(s1.cards)) {
      const want = Math.round(Math.min(HEIGHTS[c.type].max, Math.max(HEIGHTS[c.type].min, heights[c.id]!)));
      // A card whose height is within the tolerance of the measurement keeps it.
      if (Math.abs(want - s0.cards[c.id]!.h) < MEASURE_EPS) expect(c.h, c.id).toBe(s0.cards[c.id]!.h);
      else expect(c.h, c.id).toBe(want);
    }
    check(s1, 'measured');
    // The same measurements again change nothing; reopening (replaying the events) gives the same board.
    expect(planMeasured(s1, heights)).toEqual([]);
    expect(applyChanges(s0, changes)).toEqual(s1);
    // Deterministic: the same input, the same events.
    expect(planMeasured(s0, heights)).toEqual(changes);
  });

  it('a reflow never pins a card and never moves one the user placed', () => {
    const { state, frameIds } = vcBoard();
    const f = state.frames[frameIds[0]!]!;
    const mine: Card = {
      id: 'c_mine',
      type: 'note',
      frameId: f.id,
      x: f.x + 24,
      y: f.y + f.h - 24 - 150,
      w: 240,
      h: 150,
      data: { text: 'mine' },
      provenance: { kind: 'user', at },
    };
    const s0 = fill(
      applyChanges(state, [{ type: 'card.added', data: { card: mine } }]),
      frameIds.slice(0, 2),
      12,
      3,
      false,
    );
    const heights = Object.fromEntries(
      Object.values(s0.cards).map((c) => [c.id, c.id === 'c_mine' ? 600 : c.h + 90]),
    );
    const changes = planMeasured(s0, heights);
    // Applied as the service appends them: by the user, so a move without `pinned: null` would pin the card.
    const s1 = applyChanges(
      s0,
      changes.map((c) => ({ ...c, actor: { kind: 'user' as const } })),
    );
    expect(s1.cards.c_mine).toMatchObject({ x: mine.x, y: mine.y, w: 240, h: 150 });
    expect(Object.values(s1.cards).some((c) => c.userMoved)).toBe(false);
    // No event of a measure is a user drag: every card.moved says `pinned: null`.
    for (const ch of changes)
      if (ch.type === 'card.moved')
        for (const m of (ch.data as { moves: { pinned?: null }[] }).moves) expect(m.pinned).toBeNull();
  });

  it('shorter cards give the frame its height back and the frames after it close up', () => {
    const { state, frameIds } = vcBoard();
    const s0 = fill(state, frameIds, 36, 21);
    const heights = Object.fromEntries(Object.values(s0.cards).map((c) => [c.id, Math.max(176, c.h - 80)]));
    const s1 = applyChanges(s0, planMeasured(s0, heights));
    check(s1, 'shrunk');
    const a = boundsOf(s0);
    const b = boundsOf(s1);
    expect(b.h).toBeLessThan(a.h);
    // Content only ever moves up or stays: no frame moved down or right in a shrink.
    for (const f of Object.values(s1.frames)) {
      expect(f.y).toBeLessThanOrEqual(s0.frames[f.id]!.y);
      expect(f.x).toBeLessThanOrEqual(s0.frames[f.id]!.x + 0.5);
    }
  });

  it('brings a card that is not a whole number of columns wide onto the grid, then measures it at its new width', () => {
    const { state, frameIds } = vcBoard();
    const f = state.frames[frameIds[1]!]!;
    const off: Card = {
      id: 'c_off',
      type: 'source',
      frameId: f.id,
      x: f.x + 24,
      y: f.y + f.h - 24 - 230,
      w: 340,
      h: 230,
      data: { title: 'Off the grid', url: 'https://example.org' },
      provenance: agent,
    };
    const s0 = applyChanges(state, [{ type: 'card.added', data: { card: off } }]);
    const changes = planMeasured(s0, { c_off: 230 });
    const s1 = applyChanges(s0, changes);
    expect(s1.cards.c_off!.w).toBe(2 * 132 + 16);
    // The height was measured at the old width, so it is kept until the card is measured again.
    expect(s1.cards.c_off!.h).toBe(230);
    check(s1, 'on the grid');
    expect(planMeasured(s1, { c_off: 230 })).toEqual([]);
    expect(planMeasured(s1, { c_off: 300 }).some((c) => c.type === 'card.updated')).toBe(true);
  });

  it('ignores unknown, stacked, frameless and pinned cards, and heights within the tolerance', () => {
    const { state, frameIds } = vcBoard();
    const f = state.frames[frameIds[0]!]!;
    const mine: Card = {
      id: 'c_mine',
      type: 'note',
      frameId: f.id,
      x: f.x + 24,
      y: f.y + f.h - 24 - 150,
      w: 240,
      h: 150,
      data: { text: 'mine' },
      provenance: { kind: 'user', at },
    };
    const s = applyChanges(state, [{ type: 'card.added', data: { card: mine } }]);
    const seed = Object.values(s.cards).find((c) => c.seed)!;
    expect(planMeasured(s, { c_nope: 300, c_mine: 500 })).toEqual([]);
    expect(planMeasured(s, { [seed.id]: seed.h + 2 })).toEqual([]);
    expect(planMeasured(s, { [seed.id]: seed.h + 60 }).some((c) => c.type === 'card.updated')).toBe(true);
    // The CELLS table is still what a type's default is built from.
    expect(CELLS.note.cols).toBe(2);
  });
});
