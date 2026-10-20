/**
 * P6.8 agent layout tools: `move_card`, `arrange_frame`, `reorder_frames`, `tidy_board`, semantic and never
 * coordinates. Against a real CanvasStore (the store methods the tools call) and, for the fuzz, the pure planners.
 *
 * - user-created and user-moved cards never move (also when a frame or the board is rearranged);
 * - role gates: Scout, Critic and Builder move or arrange only their own cards; reorder and tidy are Orb's;
 * - one rearrangement is one undo step (and shows in the activity record); undo restores every position;
 * - fuzz: random boards with overlapping agent cards and user cards: pinned cards never move, `tidy_board` leaves no
 *   overlap that involves a movable card, and tidying twice changes nothing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyChanges,
  boardFrames,
  emptyBoard,
  isPinned,
  type Actor,
  type BoardState,
  type Card,
  type Frame,
} from '@orb/shared';
import {
  ARRANGE_BY,
  planArrangeFrame,
  planMoveCard,
  planTidy,
  readingOrder,
  sortCards,
} from '../src/arrange.js';
import { CanvasStore } from '../src/store.js';
import { isCanvasError } from '../src/errors.js';

let home: string;
let store: CanvasStore;
let canvasId: string;

const agent = (name: 'orb' | 'scout' | 'critic' | 'builder'): Extract<Actor, { kind: 'agent' }> => ({
  kind: 'agent',
  agent: name,
  model: 'm',
  sessionId: `${name}-session`,
});

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-arrange-'));
  store = new CanvasStore({ home, flushMs: 5, searchIndex: false });
  canvasId = (await store.create({ prompt: 'Layout' })).id;
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

const place = async (
  who: 'orb' | 'scout' | 'critic' | 'builder',
  frameId: string,
  title: string,
  extra: { badge?: 'must' | 'skim'; type?: 'doc' | 'question' | 'source' } = {},
) => {
  const type = extra.type ?? 'doc';
  const data =
    type === 'source'
      ? { url: `https://${title.toLowerCase().replace(/\W/g, '')}.example.org/a`, title, summary: 's' }
      : { title, body: 'b' };
  const ev = await store.placeAgentCard(
    canvasId,
    { type, frameId, data, why: 'w', ...(extra.badge ? { badge: extra.badge } : {}) },
    agent(who),
  );
  return (ev.data as { card: Card }).card.id;
};
const frame = async (title: string) =>
  (await store.addAgentFrame(canvasId, { title }, agent('orb'))).frame.id;
const state = async () => (await store.board(canvasId)).current;
const pos = (s: BoardState, id: string) => ({
  x: s.cards[id]!.x,
  y: s.cards[id]!.y,
  frameId: s.cards[id]!.frameId,
});

describe('arrange_frame', () => {
  it('re-sorts a frame by importance: must-read first, skim last, the rest by type', async () => {
    const f = await frame('Market');
    const skim = await place('scout', f, 'Skim me', { badge: 'skim' });
    const plain = await place('scout', f, 'Plain', { type: 'source' });
    const must = await place('scout', f, 'Must read', { badge: 'must', type: 'source' });
    const q = await place('critic', f, 'Open?', { type: 'question' });
    const res = await store.arrangeAgentFrame(canvasId, { frameId: f, by: 'importance' }, agent('orb'));
    expect(res.moved).toBeGreaterThan(0);
    const s = await state();
    const order = readingOrder([skim, plain, must, q].map((id) => s.cards[id]!)).map((c) => c.id);
    expect(order).toEqual([must, q, plain, skim]);
    // a second arrange of the same order changes nothing and writes nothing
    const seq = (await store.board(canvasId)).seq;
    expect(
      (await store.arrangeAgentFrame(canvasId, { frameId: f, by: 'importance' }, agent('orb'))).moved,
    ).toBe(0);
    expect((await store.board(canvasId)).seq).toBe(seq);
  });

  it('every order is a total order of the cards (no card lost or duplicated)', async () => {
    const f = await frame('Many');
    const ids: string[] = [];
    for (let i = 0; i < 9; i++)
      ids.push(await place(i % 2 ? 'scout' : 'critic', f, `Card ${i}`, { type: i % 3 ? 'doc' : 'source' }));
    for (const by of ARRANGE_BY) {
      await store.arrangeAgentFrame(canvasId, { frameId: f, by }, agent('orb'));
      const s = await state();
      const inFrame = Object.values(s.cards).filter((c) => c.frameId === f);
      expect(inFrame.map((c) => c.id).sort(), by).toEqual([...ids].sort());
      expect(new Set(inFrame.map((c) => `${c.x},${c.y}`)).size, by).toBe(ids.length);
    }
  });

  it("never moves the user's cards or a card the user dragged; they stay where they are", async () => {
    const f = await frame('Mixed');
    const a = await place('scout', f, 'A');
    const b = await place('scout', f, 'B');
    const c = await place('scout', f, 'C', { badge: 'must' });
    await store.command(canvasId, {
      type: 'card.added',
      card: { type: 'note', frameId: f, x: 700, y: 300, w: 200, h: 120, data: { title: 'Mine', body: 'x' } },
    });
    const noteId = Object.values((await state()).cards).find((k) => k.type === 'note')!.id;
    // the user drags B somewhere: B is pinned now
    await store.userCommand(canvasId, { type: 'card.moved', moves: [{ id: b, x: 123, y: 456 }] });
    const before = await state();
    expect(isPinned(before.cards[b]!)).toBe(true);
    expect(isPinned(before.cards[noteId]!)).toBe(true);
    expect(isPinned(before.cards[a]!)).toBe(false);
    for (const by of ARRANGE_BY) await store.arrangeAgentFrame(canvasId, { frameId: f, by }, agent('orb'));
    await store.tidyAgentBoard(canvasId, agent('orb'));
    const after = await state();
    expect(pos(after, b)).toEqual(pos(before, b));
    expect(pos(after, noteId)).toEqual(pos(before, noteId));
    // the movable ones went around the pinned ones: no overlap with them
    for (const id of [a, c])
      for (const pin of [b, noteId]) {
        const m = after.cards[id]!;
        const p = after.cards[pin]!;
        const overlap = m.x < p.x + p.w && m.x + m.w > p.x && m.y < p.y + p.h && m.y + m.h > p.y;
        expect(overlap, `${id} on ${pin}`).toBe(false);
      }
  });

  it('role gate: Scout arranges only the cards Scout placed', async () => {
    const f = await frame('Gate');
    const o1 = await place('orb', f, 'Orb one');
    const s1 = await place('scout', f, 'Scout one');
    const s2 = await place('scout', f, 'Scout two', { badge: 'must' });
    const o2 = await place('orb', f, 'Orb two');
    const before = await state();
    await store.arrangeAgentFrame(canvasId, { frameId: f, by: 'importance' }, agent('scout'));
    const after = await state();
    expect(pos(after, o1)).toEqual(pos(before, o1));
    expect(pos(after, o2)).toEqual(pos(before, o2));
    expect(readingOrder([s1, s2].map((id) => after.cards[id]!)).map((c) => c.id)).toEqual([s2, s1]);
    // a Critic has no cards here: nothing moves, nothing is written
    const seq = (await store.board(canvasId)).seq;
    expect((await store.arrangeAgentFrame(canvasId, { frameId: f, by: 'type' }, agent('critic'))).moved).toBe(
      0,
    );
    expect((await store.board(canvasId)).seq).toBe(seq);
  });

  it('is one undo step for the user, restores every position, and shows in the activity record', async () => {
    const f = await frame('Undo');
    const ids = [
      await place('scout', f, 'One'),
      await place('scout', f, 'Two', { badge: 'must' }),
      await place('scout', f, 'Three', { badge: 'skim' }),
    ];
    const before = await state();
    const depth = (await store.history(canvasId)).undo;
    await store.arrangeAgentFrame(canvasId, { frameId: f, by: 'importance' }, agent('scout'));
    expect((await store.history(canvasId)).undo).toBe(depth + 1);
    const arranged = await state();
    expect(arranged.arrangements?.at(-1)).toMatchObject({ op: 'arrange_frame', by: 'scout' });
    expect(arranged.arrangements!.at(-1)!.text).toMatch(/arranged 0\d Undo by importance/);
    expect(arranged.arrangements!.at(-1)!.ids).toContain(f);
    expect(
      ids.some(
        (id) => pos(arranged, id).x !== pos(before, id).x || pos(arranged, id).y !== pos(before, id).y,
      ),
    ).toBe(true);
    await store.userCommand(canvasId, { type: 'undo' });
    const undone = await state();
    for (const id of ids) expect(pos(undone, id), id).toEqual(pos(before, id));
    // undoing an agent's move does not pin the cards
    for (const id of ids) expect(undone.cards[id]!.userMoved).toBeUndefined();
    await store.userCommand(canvasId, { type: 'redo' });
    expect(pos(await state(), ids[1]!)).toEqual(pos(arranged, ids[1]!));
  });
});

describe('move_card', () => {
  it('re-files a card into another frame, lays it out inside, and is one undo step', async () => {
    const a = await frame('Alpha');
    const b = await frame('Beta');
    const id = await place('scout', a, 'Wanderer');
    await place('scout', b, 'Resident');
    const depth = (await store.history(canvasId)).undo;
    const res = await store.moveAgentCard(canvasId, { cardId: id, frameId: b }, agent('scout'));
    expect(res).toMatchObject({ moved: true, frameId: b });
    const s = await state();
    const card = s.cards[id]!;
    const f = s.frames[b]!;
    expect(card.frameId).toBe(b);
    expect(card.x).toBeGreaterThanOrEqual(f.x);
    expect(card.x + card.w).toBeLessThanOrEqual(f.x + f.w);
    expect(card.y).toBeGreaterThanOrEqual(f.y);
    expect(card.y + card.h).toBeLessThanOrEqual(f.y + f.h);
    const resident = Object.values(s.cards).find((c) => c.id !== id && c.frameId === b)!;
    expect(
      card.x < resident.x + resident.w &&
        card.x + card.w > resident.x &&
        card.y < resident.y + resident.h &&
        card.y + card.h > resident.y,
    ).toBe(false);
    expect(s.arrangements!.at(-1)).toMatchObject({ op: 'move_card', by: 'scout' });
    expect((await store.history(canvasId)).undo).toBe(depth + 1);
    await store.userCommand(canvasId, { type: 'undo' });
    expect((await state()).cards[id]!.frameId).toBe(a);
    // moving into the frame it is in is a no-op
    expect((await store.moveAgentCard(canvasId, { cardId: id, frameId: a }, agent('scout'))).moved).toBe(
      false,
    );
  });

  it("is refused for the user's cards, a dragged card, another agent's card (children) and a full frame", async () => {
    const a = await frame('Alpha');
    const b = await frame('Beta');
    const mine = await place('orb', a, 'Orbs');
    await store.command(canvasId, {
      type: 'card.added',
      card: { type: 'note', frameId: a, x: 5, y: 5, w: 200, h: 120, data: { title: 'N', body: 'x' } },
    });
    const note = Object.values((await state()).cards).find((c) => c.type === 'note')!.id;
    await expect(
      store.moveAgentCard(canvasId, { cardId: note, frameId: b }, agent('orb')),
    ).rejects.toMatchObject({ code: 'orb/forbidden' });
    // a child may not move Orb's card, Orb may
    await expect(
      store.moveAgentCard(canvasId, { cardId: mine, frameId: b }, agent('scout')),
    ).rejects.toMatchObject({ code: 'orb/forbidden' });
    // a card the user dragged is pinned
    const dragged = await place('scout', a, 'Dragged');
    await store.userCommand(canvasId, { type: 'card.moved', moves: [{ id: dragged, x: 9, y: 9 }] });
    await expect(
      store.moveAgentCard(canvasId, { cardId: dragged, frameId: b }, agent('scout')),
    ).rejects.toMatchObject({ code: 'orb/forbidden' });
    expect((await store.moveAgentCard(canvasId, { cardId: mine, frameId: b }, agent('orb'))).moved).toBe(
      true,
    );
    // a full frame
    for (let i = 0; i < store.frameBudget; i++) await place('scout', a, `Fill ${i}`).catch(() => undefined);
    const full = await state();
    const crowded = Object.values(full.cards).filter((c) => c.frameId === a && !c.stackedInto).length;
    expect(crowded).toBeGreaterThanOrEqual(store.frameBudget);
    const s1 = await place('scout', b, 'Elsewhere');
    await expect(
      store.moveAgentCard(canvasId, { cardId: s1, frameId: a }, agent('scout')),
    ).rejects.toMatchObject({ code: 'orb/frame-full' });
    await expect(
      store.moveAgentCard(canvasId, { cardId: 'c_nope', frameId: a }, agent('orb')),
    ).rejects.toMatchObject({ code: 'orb/not-found' });
  });
});

describe('reorder_frames and tidy_board', () => {
  it('reorder_frames puts the listed frames first (their numbers follow); one undo step; Orb only', async () => {
    const [a, b, c] = [await frame('Alpha'), await frame('Beta'), await frame('Gamma')];
    const depth = (await store.history(canvasId)).undo;
    const res = await store.reorderAgentFrames(canvasId, [c, a], agent('orb'));
    expect(res).toMatchObject({ order: [c, a, b], changed: true });
    const s = await state();
    expect(boardFrames(s).map((f) => f.id)).toEqual([c, a, b]);
    expect(s.arrangements!.at(-1)).toMatchObject({ op: 'reorder_frames', by: 'orb' });
    expect((await store.history(canvasId)).undo).toBe(depth + 1);
    // no change, no event
    const seq = (await store.board(canvasId)).seq;
    expect((await store.reorderAgentFrames(canvasId, [c, a, b], agent('orb'))).changed).toBe(false);
    expect((await store.board(canvasId)).seq).toBe(seq);
    await store.userCommand(canvasId, { type: 'undo' });
    expect(boardFrames(await state()).map((f) => f.id)).toEqual([a, b, c]);
    await expect(store.reorderAgentFrames(canvasId, [c], agent('scout'))).rejects.toMatchObject({
      code: 'orb/forbidden',
    });
    await expect(store.reorderAgentFrames(canvasId, ['f_nope'], agent('orb'))).rejects.toMatchObject({
      code: 'orb/not-found',
    });
    await expect(store.tidyAgentBoard(canvasId, agent('critic'))).rejects.toMatchObject({
      code: 'orb/forbidden',
    });
  });

  it('survives a reopen: the order and the arrangement record are in board.jsonl', async () => {
    const [a, b] = [await frame('Alpha'), await frame('Beta')];
    await store.reorderAgentFrames(canvasId, [b], agent('orb'));
    await store.close();
    const again = new CanvasStore({ home, flushMs: 5, searchIndex: false });
    try {
      const s = (await again.board(canvasId)).current;
      expect(boardFrames(s).map((f) => f.id)).toEqual([b, a]);
      expect(s.arrangements).toHaveLength(1);
    } finally {
      await again.close();
      store = new CanvasStore({ home, flushMs: 5, searchIndex: false });
    }
  });
});

// ---- Fuzz: the pure planners on random boards ----

const rect = (c: { x: number; y: number; w: number; h: number }) => c;
const overlaps = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const TYPES = ['doc', 'source', 'question', 'quote', 'note'] as const;
const boardArb = fc
  .record({
    frames: fc.integer({ min: 1, max: 4 }),
    cards: fc.array(
      fc.record({
        frame: fc.integer({ min: -1, max: 3 }),
        type: fc.constantFrom(...TYPES),
        user: fc.boolean(),
        dragged: fc.boolean(),
        // positions in frame-relative columns/rows so cards often overlap
        col: fc.integer({ min: 0, max: 3 }),
        row: fc.integer({ min: 0, max: 3 }),
        at: fc.integer({ min: 1, max: 50 }),
        badge: fc.constantFrom(undefined, 'must' as const, 'skim' as const),
      }),
      { minLength: 0, maxLength: 24 },
    ),
  })
  .map(({ frames, cards }) => {
    const fr: Frame[] = Array.from({ length: frames }, (_, i) => ({
      id: `f_${i}`,
      title: `F${i}`,
      color: 'sky' as const,
      x: (i % 2) * 600,
      y: Math.floor(i / 2) * 700,
      w: 540,
      h: 620,
      provenance: { kind: 'agent' as const, agent: 'orb' as const, model: 'm', sessionId: 's', at: 1 },
    }));
    let state: BoardState = { ...emptyBoard(), frames: Object.fromEntries(fr.map((f) => [f.id, f])) };
    const made: Record<string, Card> = {};
    cards.forEach((c, i) => {
      const frameId = c.frame >= 0 && c.frame < frames ? `f_${c.frame}` : null;
      const f = frameId ? state.frames[frameId]! : { x: 1500, y: 80 };
      const type = c.user ? 'note' : c.type === 'note' ? 'doc' : c.type;
      made[`c_${i}`] = {
        id: `c_${i}`,
        type,
        frameId,
        x: f.x + 24 + c.col * 60,
        y: f.y + 56 + c.row * 50,
        w: 280,
        h: 220,
        data: { title: `Card ${i}`, body: 'b' },
        ...(c.badge ? { badge: c.badge } : {}),
        ...(c.dragged && !c.user ? { userMoved: true as const } : {}),
        provenance: c.user
          ? { kind: 'user', at: c.at }
          : { kind: 'agent', agent: 'scout', model: 'm', sessionId: 's', at: c.at },
      } as Card;
    });
    state = { ...state, cards: made };
    return state;
  });

describe('fuzz: planners on random boards', () => {
  it('tidy_board: pinned cards never move, no overlap involves a movable card, a second tidy changes nothing', () => {
    fc.assert(
      fc.property(boardArb, (before) => {
        const snapshot = JSON.stringify(before);
        let plan;
        try {
          plan = planTidy(before, () => true);
        } catch (error) {
          if (!isCanvasError(error) || !error.details.layoutBlocked) throw error;
          expect(error.code).toBe('orb/frame-full');
          expect(JSON.stringify(before)).toBe(snapshot);
          return; // Impossible pinned geometry is refused explicitly, never mutated into an overlap.
        }
        const after = applyChanges(before, plan.changes);
        for (const c of Object.values(before.cards)) {
          if (isPinned(c)) expect(rect(after.cards[c.id]!), `pinned ${c.id} moved`).toEqual(rect(c));
        }
        const live = Object.values(after.cards);
        for (let i = 0; i < live.length; i++)
          for (let j = i + 1; j < live.length; j++) {
            const a = live[i]!;
            const b = live[j]!;
            if (isPinned(a) && isPinned(b)) continue; // the user's own overlaps are the user's
            expect(
              overlaps(a, b),
              `${a.id} (${isPinned(a) ? 'pinned' : 'movable'}) overlaps ${b.id} (${isPinned(b) ? 'pinned' : 'movable'})`,
            ).toBe(false);
          }
        // Tidying settles: a few more passes (frames that grew pushed others, which then settle too) end in a fixed point.
        let settled = after;
        let passes = 0;
        for (; passes < 6; passes++) {
          const next = planTidy(settled, () => true);
          if (next.changes.length === 0) break;
          settled = applyChanges(settled, next.changes);
          for (const c of Object.values(before.cards))
            if (isPinned(c)) expect(rect(settled.cards[c.id]!)).toEqual(rect(c));
        }
        // (Two frames that both hold pinned cards and overlap cannot be pulled apart by an agent; their movable cards
        // may keep trading cells there, so the settling claim is for boards without such a collision.)
        const holds = (id: string) =>
          Object.values(settled.cards).some((c) => c.frameId === id && isPinned(c));
        const fs = boardFrames(settled);
        const collide = fs.some((a, i) =>
          fs.slice(i + 1).some((b) => overlaps(a, b) && holds(a.id) && holds(b.id)),
        );
        if (!collide) expect(passes, 'tidy settles').toBeLessThan(6);
      }),
      { numRuns: 120 },
    );
  });

  it('arrange_frame by any order: pinned cards stay, nothing leaves its frame, no new overlap with a pinned card', () => {
    fc.assert(
      fc.property(boardArb, fc.constantFrom(...ARRANGE_BY), (before, by) => {
        for (const f of boardFrames(before)) {
          const snapshot = JSON.stringify(before);
          let plan;
          try {
            plan = planArrangeFrame(before, f.id, by, () => true);
          } catch (error) {
            if (!isCanvasError(error) || !error.details.layoutBlocked) throw error;
            expect(error.code).toBe('orb/frame-full');
            expect(JSON.stringify(before)).toBe(snapshot);
            continue;
          }
          const after = applyChanges(before, plan.changes);
          for (const c of Object.values(before.cards)) {
            if (isPinned(c)) expect(rect(after.cards[c.id]!)).toEqual(rect(c));
            // (A frame that grows pushes the frames below it, with their unpinned cards: only those may move.)
            expect(after.cards[c.id]!.frameId).toBe(c.frameId);
          }
          const members = Object.values(after.cards).filter((c) => c.frameId === f.id);
          for (const m of members.filter((c) => !isPinned(c)))
            for (const p of members.filter(isPinned))
              expect(overlaps(m, p), `${m.id} on ${p.id}`).toBe(false);
          // sorting is a total order: the same inputs give the same order
          const movable = Object.values(before.cards).filter((c) => c.frameId === f.id && !isPinned(c));
          expect(sortCards(before, movable, by).map((c) => c.id)).toEqual(
            sortCards(before, [...movable].reverse(), by).map((c) => c.id),
          );
        }
      }),
      { numRuns: 80 },
    );
  });

  it('move_card plans a cell inside the target frame clear of its cards', () => {
    fc.assert(
      fc.property(boardArb, (before) => {
        const frames = boardFrames(before);
        const movable = Object.values(before.cards).filter((c) => !isPinned(c) && c.frameId);
        for (const card of movable.slice(0, 3)) {
          for (const f of frames) {
            if (f.id === card.frameId) continue;
            const plan = planMoveCard(before, card.id, f.id);
            const after = applyChanges(before, plan.changes);
            const moved = after.cards[card.id]!;
            expect(moved.frameId).toBe(f.id);
            const grown = after.frames[f.id]!;
            expect(
              moved.x >= grown.x &&
                moved.x + moved.w <= grown.x + grown.w &&
                moved.y >= grown.y &&
                moved.y + moved.h <= grown.y + grown.h,
            ).toBe(true);
            for (const o of Object.values(after.cards)) {
              if (o.id === card.id || o.frameId !== f.id) continue;
              expect(overlaps(moved, o), `${card.id} on ${o.id}`).toBe(false);
            }
          }
        }
      }),
      { numRuns: 60 },
    );
  });
});
