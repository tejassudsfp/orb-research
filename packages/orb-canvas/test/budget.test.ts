/**
 * P3.2 Done-when: frame budgets and `consolidate_cards`, through the tool bodies on a real CanvasStore.
 *
 * - `place_card` into a frame that shows 12 cards answers FRAME_FULL with the caller's own cards there, and writes
 *   nothing;
 * - `consolidate_cards` stacks only the caller's own visible cards of one frame (a stack card + `card.stacked`),
 *   never a user card or another agent's card;
 * - a fuzz test (fast-check) runs random interleavings of agent placements, consolidations and updates with user
 *   notes, moves and deletions, and checks after every step that no agent action takes a frame over its budget and
 *   that no agent action ever changes, stacks or removes a user card; the log on disk folds to the same board.
 */
import fc from 'fast-check';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PLACEABLE_TYPES,
  isToolAllowed,
  fold,
  parseBoardEvent,
  stackOf,
  type AgentName,
  type BoardState,
  type Card,
  type CardType,
} from '@orb/shared';
import { LAYOUT } from '../src/layout.js';
import { CanvasStore, FRAME_BUDGET } from '../src/store.js';
import {
  consolidateCards,
  placeCard,
  queryBoard,
  updateCard,
  type BoardToolExec,
  type FrameFullResult,
} from '../src/tools.js';

const SESSIONS: Record<AgentName, string> = {
  orb: 'orb-session',
  scout: 'scout-session',
  critic: 'critic-session',
  builder: 'builder-session',
};
const ROLES = Object.keys(SESSIONS) as AgentName[];

/** Valid agent fields per type (no assets: image/file need a stored file, left out here). */
const FIELDS: Partial<Record<CardType, Record<string, unknown>>> = {
  source: { title: 'Paper', url: 'https://example.org/p', body: 'It finds Y.' },
  quote: { title: 'Org', body: 'Y holds.', url: 'https://example.org/p' },
  question: { title: 'Does Y hold?', body: 'Small samples.' },
  risk: { title: 'Y may fail', body: 'One lab.', kind: 'risk' },
  design: { title: 'Landing', html: '<h1>Orb</h1>' },
  diagram: { title: 'Flow', mermaid: 'flowchart TD\n  A --> B' },
  table: { title: 'Prices', columns: ['Plan', 'Price'], rows: [['Pro', '$20']] },
  doc: { title: 'Summary', body: 'A draft.' },
};
const typesOf = (role: AgentName) => PLACEABLE_TYPES[role].filter((t) => FIELDS[t]);

async function setup(home: string): Promise<{ store: CanvasStore; canvasId: string }> {
  const store = new CanvasStore({ home, flushMs: 5, searchIndex: false });
  const canvasId = (await store.create({ prompt: 'Budgets' })).id;
  await store.setRootSession(canvasId, SESSIONS.orb);
  await store.setChildAgent(canvasId, 'scout', SESSIONS.scout);
  await store.setChildAgent(canvasId, 'critic', SESSIONS.critic);
  await store.setChildAgent(canvasId, 'builder', SESSIONS.builder);
  return { store, canvasId };
}

const execAs = (store: CanvasStore, canvasId: string, role: AgentName, n = 0): BoardToolExec => ({
  callId: `call_${role}_${n}`,
  signal: new AbortController().signal,
  agent: {
    id: SESSIONS[role],
    options: { provider: 'openai', model: 'gpt-6-luna' },
    session: { header: { cwd: store.dirOf(canvasId) } },
  },
});

const visibleIn = (state: BoardState, frameId: string | null) =>
  Object.values(state.cards).filter((c) => c.frameId === frameId && !c.stackedInto);

async function addFrame(store: CanvasStore, canvasId: string, x: number, y: number, w = 400, h = 300) {
  const [ev] = await store.commandEvents(canvasId, {
    type: 'frame.added',
    frame: { title: `F${x}`, color: 'sky', x, y, w, h },
  });
  return (ev!.data as { frame: { id: string } }).frame.id;
}

async function addNote(store: CanvasStore, canvasId: string, frameId: string | null, x = 40, y = 70) {
  const [ev] = await store.commandEvents(canvasId, {
    type: 'card.added',
    card: { type: 'note', frameId, x, y, w: 240, h: 150, data: { text: 'mine' } },
  });
  return (ev!.data as { card: Card }).card.id;
}

let home: string;
let store: CanvasStore;
let canvasId: string;
let sourceSerial = 0;

beforeEach(async () => {
  sourceSerial = 0;
  home = mkdtempSync(join(tmpdir(), 'orb-budget-'));
  ({ store, canvasId } = await setup(home));
});

afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

const place = (role: AgentName, type: CardType, frameId: string | null, n = 0) =>
  placeCard(
    store,
    { type, ...FIELDS[type], ...(type === 'source' ? { url: `https://example.org/p/${++sourceSerial}` } : {}), why: `${role} ${type}`, ...(frameId ? { frameId } : {}) },
    execAs(store, canvasId, role, n),
    { delayMs: 0 },
  );

describe('frame budget (P3.2)', () => {
  it("the 13th card answers FRAME_FULL with the caller's own cards and writes nothing", async () => {
    const frameId = await addFrame(store, canvasId, 0, 0);
    const note = await addNote(store, canvasId, frameId);
    const scoutIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await place('scout', 'source', frameId, i);
      expect(res).toHaveProperty('cardId');
      scoutIds.push((res as { cardId: string }).cardId);
    }
    for (let i = 0; i < 5; i++) expect(await place('critic', 'risk', frameId, i)).toHaveProperty('cardId');
    const board = await store.board(canvasId);
    expect(visibleIn(board.current, frameId)).toHaveLength(FRAME_BUDGET);
    const seq = board.seq;

    const full = (await place('scout', 'quote', frameId, 99)) as FrameFullResult;
    expect(full).toMatchObject({ error: 'FRAME_FULL', frameId, budget: 12, cards: 12 });
    expect(full.message).toMatch(/consolidate_cards/);
    expect(full.ownCards.map((c) => c.id)).toEqual(scoutIds);
    expect(full.ownCards.every((c) => c.by === 'scout')).toBe(true);
    expect(JSON.stringify(full)).not.toMatch(/"(x|y|w|h)":/);
    expect(board.seq).toBe(seq);
    // Orb has no consolidate tool: its hint says to use another frame.
    const orbFull = (await place('orb', 'doc', frameId)) as FrameFullResult;
    expect(orbFull).toMatchObject({ error: 'FRAME_FULL', ownCards: [] });
    expect(orbFull.message).toMatch(/another frame/);

    // The user is not limited by the budget, and the open board has none.
    await addNote(store, canvasId, frameId, 600, 600);
    for (let i = 0; i < FRAME_BUDGET + 2; i++)
      expect(await place('critic', 'question', null, i)).toHaveProperty('cardId');
    expect(board.current.cards[note]).toBeDefined();
    expect((await queryBoard(store, { frameId }, execAs(store, canvasId, 'orb'))).frames[0]).toMatchObject({
      cards: 13,
      budget: 12,
    });
  });

  it('honours a configured budget', async () => {
    await store.close();
    store = new CanvasStore({ home, flushMs: 5, searchIndex: false, frameBudget: 2 });
    const frameId = await addFrame(store, canvasId, 0, 0);
    expect(await place('scout', 'source', frameId)).toHaveProperty('cardId');
    expect(await place('scout', 'source', frameId)).toHaveProperty('cardId');
    expect(await place('scout', 'source', frameId)).toMatchObject({ error: 'FRAME_FULL', budget: 2 });
  });

  it('concurrent placements never overfill a frame', async () => {
    const frameId = await addFrame(store, canvasId, 0, 0);
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        place(i % 2 ? 'scout' : 'critic', i % 2 ? 'source' : 'risk', frameId, i),
      ),
    );
    expect(results.filter((r) => 'cardId' in r)).toHaveLength(FRAME_BUDGET);
    expect(results.filter((r) => 'error' in r)).toHaveLength(30 - FRAME_BUDGET);
    expect(visibleIn((await store.board(canvasId)).current, frameId)).toHaveLength(FRAME_BUDGET);
  });
});

describe('consolidate_cards (P3.2)', () => {
  const consolidate = (role: AgentName, cardIds: string[], title = 'Stack', summary = 'They agree.') =>
    consolidateCards(store, { cardIds, title, summary }, execAs(store, canvasId, role));

  it('stacks own cards into a stack card, frees the budget, and lays the stack out in the frame', async () => {
    const frameId = await addFrame(store, canvasId, 0, 0);
    const ids: string[] = [];
    for (let i = 0; i < FRAME_BUDGET; i++)
      ids.push(((await place('scout', 'source', frameId, i)) as { cardId: string }).cardId);
    const board = await store.board(canvasId);
    const before = board.seq;
    const res = await consolidate(
      'scout',
      ids.slice(0, 5),
      'Five papers on Y',
      'All five find Y at small scale.',
    );
    expect(res).toMatchObject({ stacked: 5, frameId, cards: FRAME_BUDGET - 5 + 1, budget: 12 });

    await store.flush();
    const events = readFileSync(join(store.dirOf(canvasId), 'board.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => parseBoardEvent(JSON.parse(l)))
      .filter((e) => e.seq > before);
    expect(events.map((e) => e.type)).toEqual(['card.added', 'card.stacked']);
    expect(events.every((e) => e.actor.kind === 'agent' && e.actor.agent === 'scout')).toBe(true);
    expect(events[1]!.data).toEqual({ stackId: res.stackId, ids: ids.slice(0, 5) });

    const stack = board.current.cards[res.stackId]!;
    expect(stack).toMatchObject({ type: 'doc', frameId, provenance: { kind: 'agent', agent: 'scout' } });
    expect(stack.why!.length).toBeLessThanOrEqual(140);
    expect(stackOf(stack)).toEqual({
      count: 5,
      items: ids.slice(0, 5).map((id) => ({ id, type: 'source', title: 'Paper' })),
    });
    // The stack takes the first free cell: where the first stacked card was.
    expect([stack.x, stack.y]).toEqual([LAYOUT.pad, LAYOUT.top]);
    for (const id of ids.slice(0, 5)) expect(board.current.cards[id]!.stackedInto).toBe(res.stackId);

    // query_board shows the stack (with what it holds), not the stacked cards.
    const q = await queryBoard(store, { frameId }, execAs(store, canvasId, 'critic'));
    expect(q.cards.map((c) => c.id)).not.toContain(ids[0]);
    expect(q.cards.find((c) => c.id === res.stackId)?.description).toMatch(
      /^Stack of 5 cards\. All five find Y at small scale\. Holds: source "Paper"/,
    );
    // Room again: the frame takes cards up to the budget.
    for (let i = 0; i < 4; i++)
      expect(await place('scout', 'quote', frameId, 50 + i)).toHaveProperty('cardId');
    expect(await place('scout', 'quote', frameId, 60)).toMatchObject({ error: 'FRAME_FULL' });
    // A stacked card cannot be updated or stacked again; the stack itself can be stacked by its owner.
    await expect(
      updateCard(store, { cardId: ids[0], why: 'x' }, execAs(store, canvasId, 'orb')),
    ).rejects.toThrow(/stacked/);
    await expect(consolidate('scout', [ids[0]!, ids[6]!])).rejects.toThrow(/already stacked/);
    const nested = await consolidate('scout', [res.stackId, ids[6]!]);
    expect(board.current.cards[res.stackId]!.stackedInto).toBe(nested.stackId);
  });

  it("never touches user cards or other agents' cards, and refuses bad requests without writing", async () => {
    const frameId = await addFrame(store, canvasId, 0, 0);
    const other = await addFrame(store, canvasId, 600, 0);
    const note = await addNote(store, canvasId, frameId);
    const s1 = ((await place('scout', 'source', frameId, 1)) as { cardId: string }).cardId;
    const s2 = ((await place('scout', 'quote', frameId, 2)) as { cardId: string }).cardId;
    const s3 = ((await place('scout', 'source', other, 3)) as { cardId: string }).cardId;
    const c1 = ((await place('critic', 'risk', frameId, 4)) as { cardId: string }).cardId;
    // A user-made card of an agent's type is still the user's.
    const [ev] = await store.commandEvents(canvasId, {
      type: 'card.added',
      card: { type: 'source', frameId, x: 0, y: 0, w: 200, h: 100, data: { url: 'https://example.org/u' } },
    });
    const userSource = (ev!.data as { card: Card }).card.id;
    const board = await store.board(canvasId);
    const before = board.current;

    await expect(consolidate('scout', [s1, note])).rejects.toThrow(/user's/);
    await expect(consolidate('scout', [s1, userSource])).rejects.toThrow(/user's/);
    await expect(consolidate('scout', [s1, c1])).rejects.toThrow(/not placed by scout/);
    await expect(consolidate('critic', [s1, s2])).rejects.toThrow(/not placed by critic/);
    await expect(consolidate('scout', [s1, s3])).rejects.toThrow(/one frame/);
    await expect(consolidate('scout', [s1])).rejects.toThrow(/cardIds/);
    await expect(consolidate('scout', [s1, s1])).rejects.toThrow(/twice/);
    await expect(consolidate('scout', [s1, 'c_nope'])).rejects.toThrow(/no card/);
    await expect(consolidate('scout', [s1, s2], '')).rejects.toThrow(/title/);
    await expect(consolidate('scout', [s1, s2], 'T', ' ')).rejects.toThrow(/summary/);
    await expect(
      consolidateCards(
        store,
        { cardIds: [s1, s2], title: 'T', summary: 'S' },
        {
          ...execAs(store, canvasId, 'scout'),
          agent: { id: 'stranger', session: { header: { cwd: store.dirOf(canvasId) } } },
        },
      ),
    ).rejects.toThrow(/not one of the canvas agents/);
    expect(board.current).toBe(before);

    await consolidate('scout', [s1, s2]);
    expect(board.current.cards[note]).toBe(before.cards[note]);
    expect(board.current.cards[userSource]).toBe(before.cards[userSource]);
    expect(board.current.cards[c1]).toBe(before.cards[c1]);
  });

  it('removing a stack (a user action) removes what it holds; undo brings both back, still stacked', async () => {
    const frameId = await addFrame(store, canvasId, 0, 0);
    const a = ((await place('critic', 'risk', frameId, 1)) as { cardId: string }).cardId;
    const b = ((await place('critic', 'question', frameId, 2)) as { cardId: string }).cardId;
    const { stackId } = await consolidate('critic', [a, b]);
    const board = await store.board(canvasId);
    const before = board.current;
    await store.userCommand(canvasId, { type: 'card.removed', ids: [stackId] });
    expect(Object.keys(board.current.cards)).toEqual([]);
    await store.userCommand(canvasId, { type: 'undo' });
    expect(board.current.cards).toEqual(before.cards);
    expect(Object.keys(board.current.cards)).toEqual(Object.keys(before.cards));
  });
});

// ---- Fuzz ----

type Op =
  | { k: 'place'; role: AgentName; t: number; frame: number }
  | { k: 'consolidate'; role: AgentName; picks: number[]; sameFrame: boolean; own: boolean; frame: number }
  | { k: 'update'; role: AgentName; pick: number }
  | { k: 'note'; frame: number; x: number; y: number }
  | { k: 'move'; pick: number; frame: number }
  | { k: 'remove'; pick: number };

const role = fc.constantFrom(...ROLES);
/** Frame slot 0 = open board; 1..3 = frames. Biased to frame 1 so it fills up and FRAME_FULL happens. */
const frameSlot = fc.oneof({ weight: 3, arbitrary: fc.constant(1) }, { weight: 2, arbitrary: fc.nat(3) });
const opArb: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 10,
    arbitrary: fc.record({ k: fc.constant('place' as const), role, t: fc.nat(), frame: frameSlot }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      k: fc.constant('consolidate' as const),
      role,
      picks: fc.array(fc.nat(), { minLength: 1, maxLength: 6 }),
      sameFrame: fc.boolean(),
      // Mostly a plausible request (the role's own visible cards of one frame); otherwise any cards at all.
      own: fc.boolean(),
      frame: frameSlot,
    }),
  },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('update' as const), role, pick: fc.nat() }) },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('note' as const),
      frame: fc.nat(3),
      x: fc.integer({ min: -50, max: 1500 }),
      y: fc.integer({ min: -50, max: 900 }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('move' as const), pick: fc.nat(), frame: fc.nat(3) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('remove' as const), pick: fc.nat() }) },
);

const userCards = (s: BoardState) => Object.values(s.cards).filter((c) => c.provenance.kind === 'user');

describe('budget and user-note fuzz (P3.2 Done-when)', () => {
  it('no agent action overfills a frame or touches a user card, over random interleavings', async () => {
    let run = 0;
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { minLength: 20, maxLength: 90, size: 'max' }), async (ops) => {
        const dir = mkdtempSync(join(tmpdir(), 'orb-budget-fuzz-'));
        const { store: st, canvasId: id } = await setup(dir);
        try {
          const frames = [
            null,
            await addFrame(st, id, 0, 0, 400, 300),
            await addFrame(st, id, 520, 0, 640, 420),
            await addFrame(st, id, 0, 348, 200, 140),
          ];
          const board = await st.board(id);
          let n = 0;
          for (const op of ops) {
            const before = board.current;
            const cards = Object.values(before.cards);
            const pickCard = (i: number) => (cards.length ? cards[i % cards.length]! : undefined);
            const exec = (r: AgentName) => execAs(st, id, r, ++n);
            let agentStep = true;
            let placedIn: string | null | undefined;
            switch (op.k) {
              case 'place': {
                const types = typesOf(op.role);
                const type = types[op.t % types.length]!;
                const frameId = frames[op.frame]!;
                const res = await placeCard(
                  st,
                  { type, ...FIELDS[type], why: 'fuzz', ...(frameId ? { frameId } : {}) },
                  exec(op.role),
                  { delayMs: 0 },
                );
                const count = visibleIn(before, frameId).length;
                if ('reused' in res && res.reused) {
                  expect(board.current).toBe(before);
                  expect(before.cards[res.cardId]!.type).toBe('source');
                  break; // Reading an existing shared source neither places nor moves a card.
                }
                if ('error' in res) {
                  // FRAME_FULL covers the budget and impossible growth between pinned frames; neither may write.
                  expect(frameId).not.toBeNull();
                  if (res.reason === 'pinned-layout') expect(res.message).toContain('pinned cards');
                  else expect(count).toBeGreaterThanOrEqual(FRAME_BUDGET);
                  expect(res.ownCards.map((c) => c.id).sort()).toEqual(
                    visibleIn(before, frameId)
                      .filter((c) => c.provenance.kind === 'agent' && c.provenance.agent === op.role)
                      .map((c) => c.id)
                      .sort(),
                  );
                  expect(board.current).toBe(before);
                } else {
                  if (frameId) expect(count).toBeLessThan(FRAME_BUDGET);
                  placedIn = frameId;
                  const card = board.current.cards[res.cardId]!;
                  expect(card.frameId).toBe(frameId);
                  if (frameId) {
                    // Laid out inside its (possibly grown) frame.
                    const f = board.current.frames[frameId]!;
                    expect(card.x).toBeGreaterThanOrEqual(f.x);
                    expect(card.x + card.w).toBeLessThanOrEqual(f.x + f.w);
                    expect(card.y + card.h).toBeLessThanOrEqual(f.y + f.h);
                    // Never on another visible card of the frame.
                    for (const o of visibleIn(before, frameId)) {
                      const overlap =
                        card.x < o.x + o.w &&
                        card.x + card.w > o.x &&
                        card.y < o.y + o.h &&
                        card.y + card.h > o.y;
                      expect(overlap).toBe(false);
                    }
                  }
                  // Never on a user card, wherever it lies (user cards never move).
                  for (const u of userCards(board.current)) {
                    const overlap =
                      card.x < u.x + u.w &&
                      card.x + card.w > u.x &&
                      card.y < u.y + u.h &&
                      card.y + card.h > u.y;
                    expect(overlap).toBe(false);
                  }
                }
                break;
              }
              case 'consolidate': {
                const pool = op.own
                  ? visibleIn(before, frames[op.frame]!).filter(
                      (c) => c.provenance.kind === 'agent' && c.provenance.agent === op.role,
                    )
                  : cards;
                const picked = [
                  ...new Set(
                    op.picks
                      .map((p) => (pool.length ? pool[p % pool.length]!.id : undefined))
                      .filter((x): x is string => !!x),
                  ),
                ];
                const anchor = picked[0] ? before.cards[picked[0]] : undefined;
                const ids =
                  op.sameFrame && anchor
                    ? picked.filter((cid) => before.cards[cid]!.frameId === anchor.frameId)
                    : picked;
                // P3.3: consolidate_cards is on the Scout/Critic/Builder allow-lists only (§2.4), not Orb's.
                const valid =
                  isToolAllowed(op.role, 'consolidate_cards') &&
                  ids.length >= 2 &&
                  ids.every((cid) => {
                    const c = before.cards[cid]!;
                    return (
                      c.provenance.kind === 'agent' &&
                      c.provenance.agent === op.role &&
                      !c.stackedInto &&
                      c.frameId === before.cards[ids[0]!]!.frameId
                    );
                  });
                let ok = false;
                let layoutBlocked = false;
                try {
                  await consolidateCards(st, { cardIds: ids, title: 'S', summary: 'fuzz' }, exec(op.role));
                  ok = true;
                } catch (error) {
                  layoutBlocked =
                    error instanceof Error &&
                    /blocked by pinned cards|No clear frame layout/.test(error.message);
                  expect(board.current).toBe(before);
                }
                expect(ok || (valid && layoutBlocked)).toBe(valid);
                break;
              }
              case 'update': {
                const c = pickCard(op.pick);
                if (!c) break;
                await updateCard(st, { cardId: c.id, why: 'changed' }, exec(op.role)).catch(() => undefined);
                break;
              }
              case 'note':
                agentStep = false;
                await addNote(st, id, frames[op.frame]!, op.x, op.y);
                break;
              case 'move': {
                agentStep = false;
                const c = pickCard(op.pick);
                if (!c || c.stackedInto) break;
                const frameId = frames[op.frame]!;
                await st.userCommand(id, {
                  type: 'card.moved',
                  moves: [{ id: c.id, x: c.x + 5, y: c.y, frameId }],
                });
                break;
              }
              case 'remove': {
                agentStep = false;
                const c = pickCard(op.pick);
                if (!c || c.stackedInto) break;
                await st.userCommand(id, { type: 'card.removed', ids: [c.id] });
                break;
              }
            }
            const after = board.current;
            if (agentStep) {
              // User cards: identical objects (never changed, moved, stacked or removed by an agent).
              for (const u of userCards(before)) expect(after.cards[u.id]).toBe(u);
              // A frame holding a user card is never moved by an agent (frames below a growing one are pushed).
              for (const u of userCards(before)) {
                if (!u.frameId) continue;
                const [was, now] = [before.frames[u.frameId]!, after.frames[u.frameId]!];
                expect([now.x, now.y]).toEqual([was.x, was.y]);
              }
              // A pushed frame's cards move with it.
              for (const c of Object.values(after.cards)) {
                const f0 = c.frameId ? before.frames[c.frameId] : undefined;
                const f1 = c.frameId ? after.frames[c.frameId] : undefined;
                const c0 = before.cards[c.id];
                if (f0 && f1 && c0 && c0.frameId === c.frameId) expect(c.y - c0.y).toBe(f1.y - f0.y);
              }
              // No agent action takes a frame above its budget (the user may; agents then cannot add).
              for (const f of frames) {
                if (!f) continue;
                const was = visibleIn(before, f).length;
                const now = visibleIn(after, f).length;
                expect(now).toBeLessThanOrEqual(Math.max(was, FRAME_BUDGET));
                if (now > was) expect(placedIn).toBe(f);
              }
            }
            // Stacks are consistent: every stacked card points at an existing stack listing it.
            for (const c of Object.values(after.cards)) {
              if (!c.stackedInto) continue;
              const stack = after.cards[c.stackedInto];
              expect(stack).toBeDefined();
              expect(stackOf(stack!)?.items.map((i) => i.id)).toContain(c.id);
              expect(c.provenance.kind).toBe('agent');
            }
          }
          // The log on disk folds to the same board.
          await st.flush();
          const events = readFileSync(join(st.dirOf(id), 'board.jsonl'), 'utf8')
            .trim()
            .split('\n')
            .map((l) => parseBoardEvent(JSON.parse(l)));
          expect(fold(events)).toEqual(board.current);
        } finally {
          await st.close();
          rmSync(dir, { recursive: true, force: true });
          run++;
        }
      }),
      { numRuns: 100 },
    );
    expect(run).toBeGreaterThanOrEqual(100);
  });
});
