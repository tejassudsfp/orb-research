/**
 * P3.2 layout engine (pure), P6.20: first free cell in a frame's grid, per-type cells and height ranges, content-based
 * height estimates, growing the frame SIDEWAYS first and then downward, user cards anywhere in the frame avoided, the
 * open board keeping clear of frames, frames pushed right and below (and pulled closer when one shrinks). Property
 * tests (fast-check) for "a placed card never crowds another card of its frame, sits on the grid, and its frame
 * (grown) holds it".
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CardType as CardTypeEnum,
  UNMEASURED_TYPES,
  emptyBoard,
  type BoardState,
  type Card,
  type CardType,
  type Frame,
} from '@orb/shared';
import {
  CELLS,
  HEIGHTS,
  LAYOUT,
  clampHeight,
  cellOf,
  estimateHeight,
  frameColumns,
  frameWidth,
  placeInFrame,
  placeOnBoard,
  pushFrames,
  pushFramesBelow,
  relayoutFrame,
  spanWidth,
  type Rect,
} from '../src/layout.js';

const { col, gap, pad, top } = LAYOUT;
const at = 1;
const frame = (id: string, x: number, y: number, w: number, h: number): Frame => ({
  id,
  title: id,
  color: 'sky',
  x,
  y,
  w,
  h,
  provenance: { kind: 'user', at },
});
const card = (id: string, r: Rect, frameId: string | null, extra: Partial<Card> = {}): Card => ({
  id,
  type: 'note',
  frameId,
  ...r,
  data: { text: id },
  provenance: { kind: 'user', at },
  ...extra,
});
const board = (frames: Frame[], cards: Card[]): BoardState => ({
  ...emptyBoard(),
  frames: Object.fromEntries(frames.map((f) => [f.id, f])),
  cards: Object.fromEntries(cards.map((c) => [c.id, c])),
});
const crowd = (a: Rect, b: Rect) =>
  a.x < b.x + b.w + gap && a.x + a.w > b.x - gap && a.y < b.y + b.h + gap && a.y + a.h > b.y - gap;

describe('layout engine', () => {
  it('has a cell and a height range for every card type and for stacks; spans fit the grid', () => {
    for (const [type, cell] of Object.entries(CELLS)) {
      expect(cell.cols, type).toBeGreaterThanOrEqual(1);
      expect(cell.cols, type).toBeLessThanOrEqual(LAYOUT.maxCols);
      const range = HEIGHTS[type as CardType | 'stack'];
      expect(range.min, type).toBeLessThanOrEqual(cell.h);
      expect(range.max, type).toBeGreaterThanOrEqual(cell.h);
      // The title-only level of detail needs room for three 40 px lines.
      expect(range.min, type).toBeGreaterThanOrEqual(176);
    }
    // Every card type has both (a new type does not compile without them); the unmeasured ones are real types.
    for (const t of CardTypeEnum.options) {
      expect(CELLS[t], t).toBeDefined();
      expect(HEIGHTS[t], t).toBeDefined();
    }
    for (const t of UNMEASURED_TYPES) expect(CardTypeEnum.options).toContain(t);
    expect(cellOf({ type: 'design', data: {} }).cols).toBe(CELLS.design.cols);
    expect(
      cellOf({
        type: 'doc',
        data: {
          title: 'S',
          stack: {
            count: 2,
            items: [
              { id: 'c_a', type: 'quote', title: 'a' },
              { id: 'c_b', type: 'quote', title: 'b' },
            ],
          },
        },
      }).cols,
    ).toBe(CELLS.stack.cols);
    expect(spanWidth(2)).toBe(2 * col + gap);
    expect(frameWidth(4)).toBe(624);
    expect(frameColumns({ w: 400 })).toBe(2);
    expect(frameColumns({ w: 560 })).toBe(3);
    expect(frameColumns({ w: 640 })).toBe(4);
    expect(frameColumns({ w: 1216 })).toBe(8);
    expect(frameColumns({ w: 100 })).toBe(0);
  });

  it('estimates a height from the content, inside the type range; a card that has an h keeps it (clamped)', () => {
    const short = cellOf({ type: 'note', data: { title: 'Hi', text: 'ok' } });
    const long = cellOf({ type: 'note', data: { title: 'Hi', text: 'word '.repeat(200) }, why: 'because it matters' });
    expect(short.h).toBeLessThan(long.h);
    for (const type of Object.keys(CELLS) as (CardType | 'stack')[]) {
      for (const data of [{}, { title: 'T'.repeat(300), text: 'x'.repeat(5000), rowCount: 500 }]) {
        const h = estimateHeight(type, data, 'w'.repeat(140), CELLS[type].cols);
        expect(h, type).toBeGreaterThanOrEqual(HEIGHTS[type].min);
        expect(h, type).toBeLessThanOrEqual(HEIGHTS[type].max);
      }
    }
    expect(cellOf({ type: 'note', data: {}, h: 5000 }).h).toBe(HEIGHTS.note.max);
    expect(cellOf({ type: 'note', data: {}, h: 10 }).h).toBe(HEIGHTS.note.min);
    expect(cellOf({ type: 'note', data: {}, h: 250 }).h).toBe(250);
    // A database with two rows is shorter than one with a hundred.
    expect(estimateHeight('database', { title: 'Team', rowCount: 2 }, undefined, 4)).toBeLessThan(
      estimateHeight('database', { title: 'Team', rowCount: 100 }, undefined, 4),
    );
    expect(clampHeight('metric', 9999)).toBe(HEIGHTS.metric.max);
  });

  it('fills the first free cell in reading order, then grows the frame SIDEWAYS before downward', () => {
    const f0 = frame('f_a', 100, 100, 624, 520); // 4 columns
    let f = f0;
    const placed: Card[] = [];
    const cell = { cols: 2, h: 220 };
    const widths: number[] = [];
    const heights: number[] = [];
    for (let i = 0; i < 14; i++) {
      const p = placeInFrame(board([f], placed), f, cell);
      const { grow, ...r } = p;
      f = { ...f, ...(grow ?? {}) };
      placed.push(card(`c_${i}`, r, f.id));
      widths.push(f.w);
      heights.push(f.h);
      if (i === 0) expect(r).toEqual({ x: 124, y: 156, w: 2 * col + gap, h: 220 });
    }
    // Four columns hold four 2-column cards in two rows (the second row's bottom is 156 + 2*236 - 16 = 612 > 520 - 24:
    // the second row makes the frame grow... no: width comes first).
    expect(widths[0]).toBe(f0.w);
    // The width reaches 8 columns before the height ever grows past what the frame had.
    const firstTall = heights.findIndex((h) => h > f0.h);
    const firstFullWidth = widths.findIndex((w) => w >= frameWidth(LAYOUT.maxCols));
    expect(firstFullWidth).toBeGreaterThanOrEqual(0);
    expect(firstTall === -1 || firstFullWidth <= firstTall).toBe(true);
    // Never wider than the maximum, and widths never shrink.
    expect(Math.max(...widths)).toBeLessThanOrEqual(frameWidth(LAYOUT.maxCols));
    expect(widths.every((w, i) => i === 0 || w >= widths[i - 1]!)).toBe(true);
    // Once at 8 columns the frame grows down.
    expect(f.h).toBeGreaterThan(f0.h);
    expect(f.w).toBe(frameWidth(LAYOUT.maxCols));
  });

  it('does not grow sideways into a locked frame or past the landscape bound; it grows down instead', () => {
    // The frame is already as wide as 2.4 x its height allows: the next card makes it taller.
    const f = frame('f_a', 0, 0, frameWidth(4), 260); // 624 wide, 260 tall: 5 columns (772) would be 2.97 x
    const own = card('c_own', { x: pad, y: top, w: spanWidth(2), h: 176 }, f.id);
    const own2 = card('c_own2', { x: pad + 2 * (col + gap), y: top, w: spanWidth(2), h: 176 }, f.id);
    const p = placeInFrame(board([f], [own, own2]), f, { cols: 2, h: 200 });
    expect(p.grow?.w).toBeUndefined();
    expect(p.grow?.h).toBeGreaterThan(260);
    // A frame holding a user note to its right is never grown into.
    const g = frame('f_g', 0, 0, frameWidth(4), 520);
    const wall = frame('f_wall', frameWidth(4) + 8, 0, 300, 520);
    const note = card('c_note', { x: wall.x + 20, y: 80, w: 200, h: 100 }, wall.id);
    const fill = [0, 1].flatMap((r) =>
      [0, 1].map((c) => card(`c_${r}${c}`, { x: pad + c * 2 * (col + gap), y: top + r * 236, w: spanWidth(2), h: 220 }, g.id)),
    );
    const q = placeInFrame(board([g, wall], [...fill, note]), g, { cols: 2, h: 220 });
    expect(q.grow?.w).toBeUndefined();
    expect(q.grow?.h).toBeGreaterThan(520);
  });

  it('puts small cards side by side and keeps clear of a user card dropped in the frame', () => {
    const f = frame('f_a', 0, 0, 1000, 600);
    const user = card('c_user', { x: 30, y: 60, w: 240, h: 150 }, f.id);
    const p = placeInFrame(board([f], [user]), f, CELLS.question);
    // Columns 0-1 crowd the user note; the first free cell in the top row is column 2.
    expect(p).toEqual({ x: pad + 2 * (col + gap), y: top, w: spanWidth(2), h: CELLS.question.h });
    const user2 = card('c_far', { x: 900, y: 500, w: 50, h: 50 }, null); // lying on the frame, not in it
    const q = placeInFrame(board([f], [user, user2]), f, { cols: 6, h: 600 });
    expect(crowd(q, user2)).toBe(false);
  });

  it('ignores stacked cards and cards of other frames outside this one', () => {
    const f = frame('f_a', 0, 0, 400, 300);
    const g = frame('f_b', 0, 400, 400, 300);
    const hidden = card('c_hidden', { x: pad, y: top, w: spanWidth(2), h: 220 }, f.id, {
      stackedInto: 'c_stack',
    });
    const other = card('c_other', { x: pad, y: 456, w: spanWidth(2), h: 220 }, g.id);
    const p = placeInFrame(board([f, g], [hidden, other]), f, CELLS.quote);
    expect(p).toEqual({ x: pad, y: top, w: spanWidth(2), h: 220 });
    // Skipped ids (the cards being stacked) are free space too.
    const shown = card('c_shown', { x: pad, y: top, w: spanWidth(2), h: 220 }, f.id);
    expect(placeInFrame(board([f], [shown]), f, CELLS.quote, new Set(['c_shown']))).toEqual({
      x: pad,
      y: top,
      w: spanWidth(2),
      h: 220,
    });
  });

  it('keeps clear of cards below the frame that will not move with it (user cards, locked frames, open board)', () => {
    // a is full after one row; b below it holds a user note, so b is locked and a may grow over it, never over the note.
    // (a is too flat to be widened for the card: 5 columns would be wider than 2.4 x its height.)
    const a = frame('f_a', 0, 0, 600, 260);
    const b = frame('f_b', 0, 448, 600, 400);
    const own = card('c_own', { x: pad, y: top, w: spanWidth(2), h: 220 }, a.id, {
      provenance: { kind: 'agent', agent: 'scout', model: 'm', sessionId: 's', at },
    });
    const note = card('c_note', { x: pad, y: 504, w: spanWidth(2), h: 220 }, b.id);
    const p = placeInFrame(board([a, b], [own, note]), a, CELLS.quote);
    expect(crowd(p, note)).toBe(false);
    expect(p.grow?.h).toBeGreaterThanOrEqual(p.y + p.h + pad - a.y);
    // An open-board card lying below the frame does not move either.
    const loose = card('c_loose', { x: pad, y: 520, w: spanWidth(2), h: 200 }, null, {
      provenance: { kind: 'agent', agent: 'orb', model: 'm', sessionId: 's', at },
    });
    expect(crowd(placeInFrame(board([a], [own, loose]), a, CELLS.quote), loose)).toBe(false);
    // Agent cards of an unlocked frame below move down with it: they are not in the way.
    const theirs = card('c_theirs', { x: pad, y: 504, w: spanWidth(2), h: 220 }, b.id, {
      provenance: { kind: 'agent', agent: 'critic', model: 'm', sessionId: 's', at },
    });
    expect(placeInFrame(board([a, b], [own, theirs]), a, CELLS.quote)).toMatchObject({ y: top + 220 + gap });
  });

  it('widens the frame for a card wider than it (never cuts the card), and a frame narrower than one column', () => {
    const f = frame('f_a', 0, 0, 400, 300);
    expect(placeInFrame(board([f], []), f, CELLS.design)).toMatchObject({
      w: spanWidth(CELLS.design.cols),
      grow: { w: frameWidth(CELLS.design.cols), h: top + CELLS.design.h + pad },
    });
    const thin = frame('f_thin', 0, 0, 120, 600);
    expect(placeInFrame(board([thin], []), thin, CELLS.quote)).toMatchObject({
      x: pad,
      w: spanWidth(2),
      grow: { w: frameWidth(2) },
    });
  });

  it('places open-board cards clear of frames and cards', () => {
    const f = frame('f_a', 96, 120, 400, 300);
    const p = placeOnBoard(board([f], []), cellOf({ type: 'source', data: {} }));
    expect(crowd(p, f)).toBe(false);
    // The first free cell of the top row is right of the frame.
    expect(p).toMatchObject({ x: LAYOUT.board.x + 3 * (col + gap), y: LAYOUT.board.y });
  });
});

describe('frames beside and below a growing frame', () => {
  it('are pushed down to keep their gap (at most frameGap), in a cascade; locked frames stay', () => {
    // Template-like rows: a above b above c (gap 48), d beside a, e far below b, l (locked) below a.
    const a = frame('f_a', 0, 0, 400, 300);
    const b = frame('f_b', 0, 348, 400, 300);
    const c = frame('f_c', 100, 696, 400, 300);
    const d = frame('f_d', 448, 0, 400, 300);
    const e = frame('f_e', 0, 2000, 400, 300);
    const l = frame('f_l', 300, 400, 80, 80);
    const s = board([a, b, c, d, e, l], []);
    const pushes = pushFramesBelow(s, a, 900, (id) => id === 'f_l');
    // a grew by 600: b keeps its 48 gap (600), c follows b (600); d is beside a; l is locked.
    // e (gap 1352 below b) stays.
    expect(Object.fromEntries(pushes)).toEqual({ f_b: 600, f_c: 600 });
    // A far frame moves only once the growth eats into its gap beyond frameGap.
    const far = pushFramesBelow(board([a, e], []), a, 2000, () => false);
    expect(far.get('f_e')).toBe(2000 + LAYOUT.frameGap - 2000);
    expect(pushFramesBelow(board([a, e], []), a, 1600, () => false).size).toBe(0);
  });

  it('are pushed right when the frame grows sideways, in a cascade; frames below do not move', () => {
    const a = frame('f_a', 0, 0, 624, 400);
    const b = frame('f_b', 672, 0, 624, 400); // right of a, gap 48
    const c = frame('f_c', 1344, 100, 624, 400); // right of b
    const d = frame('f_d', 0, 448, 624, 400); // below a
    const s = board([a, b, c, d], []);
    const pushes = pushFrames(s, a, { w: 924, h: 400 }, () => false);
    expect(Object.fromEntries(pushes)).toEqual({ f_b: { dx: 300, dy: 0 }, f_c: { dx: 300, dy: 0 } });
    // Growing both ways pushes both neighbours.
    const both = pushFrames(s, a, { w: 724, h: 500 }, () => false);
    expect(both.get('f_b')).toEqual({ dx: 100, dy: 0 });
    expect(both.get('f_d')).toEqual({ dx: 0, dy: 100 });
    // A locked frame is never pushed and pushes nothing.
    const locked = pushFrames(s, a, { w: 924, h: 400 }, (id) => id === 'f_b');
    expect(locked.size).toBe(0);
  });

  it('a frame that shrinks pulls the frames after it closer, never into another frame', () => {
    const a = frame('f_a', 0, 0, 624, 600);
    const b = frame('f_b', 0, 648, 624, 400); // below a
    const c = frame('f_c', 0, 1096, 624, 400); // below b
    const side = frame('f_side', 672, 0, 624, 900); // right of a, taller: blocks b's columns? no, x ranges differ
    const s = board([a, b, c, side], []);
    const pulls = pushFrames(s, a, { w: 624, h: 400 }, () => false);
    expect(Object.fromEntries(pulls)).toEqual({ f_b: { dx: 0, dy: -200 }, f_c: { dx: 0, dy: -200 } });
    // b also sits under a wide frame x that keeps its bottom: b may only come as close as that frame allows.
    const wide = frame('f_wide', 0, 0, 1300, 600);
    const t = board([wide, b], []);
    const limited = pushFrames(t, a, { w: 624, h: 400 }, () => false);
    expect(limited.size).toBe(0);
    // A frame further than frameGap is not attached and does not follow a shrink.
    const far = frame('f_far', 0, 1200, 624, 300);
    expect(pushFrames(board([a, far], []), a, { w: 624, h: 400 }, () => false).size).toBe(0);
  });
});

const TYPES = Object.keys(CELLS).filter((t) => t !== 'stack') as CardType[];

describe('layout engine (property)', () => {
  it('a placed card sits on the grid, inside its (grown) frame, clear of every visible card of the frame', () => {
    const rect = fc.record({
      x: fc.integer({ min: -200, max: 1400 }),
      y: fc.integer({ min: -200, max: 1400 }),
      w: fc.integer({ min: 40, max: 700 }),
      h: fc.integer({ min: 40, max: 500 }),
    });
    fc.assert(
      fc.property(
        fc.record({
          x: fc.integer({ min: -500, max: 500 }),
          y: fc.integer({ min: -500, max: 500 }),
          w: fc.integer({ min: 60, max: 1400 }),
          h: fc.integer({ min: 60, max: 900 }),
        }),
        fc.array(fc.record({ r: rect, inFrame: fc.boolean(), stacked: fc.boolean() }), { maxLength: 25 }),
        fc.array(fc.constantFrom(...TYPES), { minLength: 1, maxLength: 14 }),
        (fr, obstacles, types) => {
          let f = frame('f_p', fr.x, fr.y, fr.w, fr.h);
          const cards: Card[] = obstacles.map((o, i) =>
            card(`c_o${i}`, o.r, o.inFrame ? f.id : null, o.stacked ? { stackedInto: 'c_x' } : {}),
          );
          for (const [i, type] of types.entries()) {
            const state = board([f], cards);
            const p = placeInFrame(state, f, cellOf({ type, data: {} }));
            const { grow, ...r } = p;
            // Frames only grow (sideways in whole columns, or downward), never shrink or move.
            if (grow?.h !== undefined) expect(grow.h).toBeGreaterThan(f.h);
            if (grow?.w !== undefined) {
              expect(grow.w).toBeGreaterThan(f.w);
              expect(grow.w).toBe(frameWidth(frameColumns({ w: grow.w })));
            }
            f = { ...f, ...(grow ?? {}) };
            // On the grid: a column start, below the title band.
            expect((r.x - f.x - pad) % (col + gap)).toBe(0);
            expect(r.y).toBeGreaterThanOrEqual(f.y + top);
            expect(r.w).toBe(spanWidth(CELLS[type].cols));
            // Inside the frame as it is now.
            expect(r.x + r.w).toBeLessThanOrEqual(f.x + f.w - pad);
            expect(r.y + r.h).toBeLessThanOrEqual(f.y + f.h - pad);
            // Clear of every visible card that belongs to or lies on the frame.
            for (const c of Object.values(state.cards)) {
              if (c.stackedInto) continue;
              // What the frame covered when the card was placed (widened first when it was too narrow).
              const before = state.frames[f.id]!;
              const w = Math.max(before.w, f.w);
              const relevant =
                c.frameId === f.id ||
                (c.x < before.x + w &&
                  c.x + c.w > before.x &&
                  c.y < before.y + before.h &&
                  c.y + c.h > before.y);
              if (relevant) expect(crowd(r, c), `${type} #${i} vs ${c.id}`).toBe(false);
            }
            cards.push(card(`c_p${i}`, r, f.id, { type }));
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('thread cards next to their card (P3.6)', () => {
  const x0 = 100 + pad;
  const y0 = 100 + top;
  const span2 = spanWidth(2);

  it('takes the free cell right of the anchor, else right below it, in the frame grid', () => {
    const f = frame('f_t', 100, 100, 800, 600);
    const anchor = card('c_a', { x: x0, y: y0, w: span2, h: 220 }, 'f_t');
    // Empty to its right: the next grid cell on the same row.
    expect(placeInFrame(board([f], [anchor]), f, { cols: 2, h: 220 }, new Set(), anchor)).toEqual({
      x: x0 + 2 * (col + gap),
      y: y0,
      w: span2,
      h: 220,
    });
    // Right of it is taken (and the cell after that): right below the anchor.
    const right = card('c_r', { x: x0 + 2 * (col + gap), y: y0, w: spanWidth(3), h: 220 }, 'f_t');
    const p = placeInFrame(board([f], [anchor, right]), f, { cols: 2, h: 220 }, new Set(), anchor);
    expect(p).toMatchObject({ x: x0, y: y0 + 220 + gap });
    // Never on another card; the first free cell (no anchor) would be the same row's end.
    expect(crowd(p, right)).toBe(false);
  });

  it('grows the frame sideways (landscape allowing) so the thread card sits right of its card, else downward', () => {
    const f = frame('f_g', 100, 100, 2 * pad + span2, top + 220 + pad);
    const anchor = card('c_a', { x: x0, y: y0, w: span2, h: 220 }, 'f_g');
    const p = placeInFrame(board([f], [anchor]), f, { cols: 2, h: 220 }, new Set(), anchor);
    expect(p).toMatchObject({ x: x0 + 2 * (col + gap), y: y0, grow: { w: frameWidth(4) } });
    // Too short a frame to be widened (a 4-column frame would be wider than 2.4 x 150): it grows down.
    const flat = frame('f_flat', 100, 100, 2 * pad + span2, 150);
    const q = placeInFrame(board([flat], [{ ...anchor, h: 70 }]), flat, { cols: 2, h: 220 }, new Set(), anchor);
    expect(q.grow?.w).toBeUndefined();
    expect(q.grow?.h).toBeGreaterThan(150);
  });

  it('on the open board: next to the anchor, clear of frames and cards', () => {
    const anchor = card('c_open', { x: 2000, y: 1500, w: span2, h: 200 }, null);
    const src = cellOf({ type: 'source', data: {} });
    const p = placeOnBoard(board([], [anchor]), src, new Set(), anchor);
    expect(p).toEqual({ x: 2000 + 2 * (col + gap), y: 1500, w: span2, h: src.h });
    const blocker = frame('f_b', 2000 + span2 + gap, 1400, 600, 600);
    const q = placeOnBoard(board([blocker], [anchor]), src, new Set(), anchor);
    expect(crowd(q, blocker)).toBe(false);
    expect(q).toMatchObject({ x: 2000, y: 1500 + 200 + gap });
  });
});

describe('relayoutFrame (P6.20)', () => {
  it('keeps the order cards read in when the frame has to widen: it widens before the first card is placed', () => {
    // A 3-column frame whose top-left holds a card that stays (the user's): the first 3-column card has to go below it
    // unless the frame is widened first; widened half way, the second card would take the top of the new columns.
    const f = frame('f_r', 0, 0, frameWidth(3), 300);
    const stays = card('c_stays', { x: pad, y: top, w: spanWidth(3), h: 200 }, f.id);
    const agent = { kind: 'agent', agent: 'scout', model: 'm', sessionId: 's', at } as const;
    const mk = (id: string) =>
      card(id, { x: pad, y: 900, w: spanWidth(3), h: 176 }, f.id, { type: 'doc', provenance: agent });
    const cards = [mk('c_a'), mk('c_b'), mk('c_c')];
    const s0 = board([f], [stays, ...cards]);
    const s1 = relayoutFrame(s0, f.id, cards);
    const order = ['c_a', 'c_b', 'c_c']
      .map((id) => s1.cards[id]!)
      .sort((x, y) => x.y - y.y || x.x - y.x)
      .map((c) => c.id);
    expect(order).toEqual(['c_a', 'c_b', 'c_c']);
    // The card that stays did not move, nothing overlaps, and the frame widened (sideways) rather than only growing down.
    expect(s1.cards.c_stays).toMatchObject({ x: pad, y: top, w: spanWidth(3), h: 200 });
    const all = Object.values(s1.cards);
    for (const [i, a] of all.entries())
      for (const b of all.slice(i + 1)) expect(crowd(a, b), `${a.id} / ${b.id}`).toBe(false);
    expect(s1.frames.f_r!.w).toBeGreaterThan(frameWidth(3));
  });
});
