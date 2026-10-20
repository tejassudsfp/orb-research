/**
 * P2.4 "Done when": fold(apply, undo) equals the previous state for every command type (and redo too).
 *
 * For each command type, fast-check builds a random board (a seed with frames, user and agent cards and links,
 * plus random user/agent commands), picks a random valid command of that type, plans it with the real
 * `planCommand`, and checks, through the event fold (`applyEvent` on validated event envelopes):
 *   undo: fold(board, apply ++ invert(board, apply))             == board
 *   redo: fold(board, apply ++ undo ++ invert(after, undo))      == fold(board, apply)
 * "==" compares cards, frames and links AND their insertion order (draw order and frame numbers), not just the
 * record contents. A batch (one user action of several commands) is covered the same way.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyEvent,
  invertChanges,
  parseBoardEvent,
  type BoardChange,
  type BoardState,
} from '../src/index.js';
import {
  SINGLE_KINDS,
  growthArb,
  grow,
  minter,
  plan,
  seedBoard,
  specArb,
  toBatch,
  toCommand,
  view,
} from './boardArb.js';

const RUNS = 300;

/** Fold changes as real events: each is wrapped in a validated envelope and folded with `applyEvent`. */
function foldChanges(state: BoardState, changes: readonly BoardChange[]): BoardState {
  let s = state;
  for (const { type, data } of changes) {
    s = applyEvent(s, parseBoardEvent({ v: 1, seq: s.seq + 1, ts: 1, type, actor: { kind: 'user' }, data }));
  }
  return s;
}

function checkRoundTrip(before: BoardState, apply: BoardChange[]): void {
  const after = foldChanges(before, apply);
  const undo = invertChanges(before, apply);
  expect(undo.length).toBeGreaterThan(0);
  const undone = foldChanges(after, undo);
  expect(view(undone)).toStrictEqual(view(before));
  const redo = invertChanges(after, undo);
  const redone = foldChanges(undone, redo);
  expect(view(redone)).toStrictEqual(view(after));
  // Undo again after redo: the stack can go back and forth.
  expect(view(foldChanges(redone, invertChanges(undone, redo)))).toStrictEqual(view(before));
}

describe('undo/redo compensating events (property)', () => {
  for (const kind of SINGLE_KINDS) {
    it(`${kind}: fold(apply, undo) == previous state, and redo == applied state`, () => {
      const seen = { applied: 0 };
      fc.assert(
        fc.property(growthArb, specArb(kind), (growth, spec) => {
          const m = minter();
          const before = grow(seedBoard(m), growth, m);
          const cmd = toCommand(before, spec);
          fc.pre(cmd !== undefined);
          seen.applied++;
          checkRoundTrip(before, plan(before, cmd!, m));
        }),
        { numRuns: RUNS },
      );
      // The seed guarantees the command type almost always applies: the property did not pass vacuously.
      expect(seen.applied).toBeGreaterThan(RUNS * 0.8);
    });
  }

  it('batch (one user action of several commands): fold(apply, undo) == previous state, redo too', () => {
    let applied = 0;
    fc.assert(
      fc.property(growthArb, fc.array(specArb(), { minLength: 2, maxLength: 8 }), (growth, specs) => {
        const m = minter();
        const before = grow(seedBoard(m), growth, m);
        const cmd = toBatch(before, specs, m);
        fc.pre(cmd !== undefined);
        applied++;
        checkRoundTrip(before, plan(before, cmd!, m));
      }),
      { numRuns: RUNS },
    );
    expect(applied).toBeGreaterThan(RUNS * 0.8);
  });

  it('a sequence of user actions undone one by one walks back through every earlier state', () => {
    fc.assert(
      fc.property(fc.array(specArb(), { minLength: 1, maxLength: 20 }), (specs) => {
        const m = minter();
        let state = seedBoard(m);
        const history: { before: BoardState; undo: BoardChange[] }[] = [];
        for (const spec of specs) {
          const cmd = toCommand(state, spec);
          if (!cmd) continue;
          const changes = plan(state, cmd, m);
          history.push({ before: state, undo: invertChanges(state, changes) });
          state = foldChanges(state, changes);
        }
        for (const { before, undo } of history.reverse()) {
          state = foldChanges(state, undo);
          expect(view(state)).toStrictEqual(view(before));
        }
      }),
      { numRuns: 150 },
    );
  });
});

describe('invertChanges specifics', () => {
  it('restores a removed frame at its number, re-attaches its cards and re-adds its links', () => {
    const m = minter();
    const before = seedBoard(m);
    const [f1] = Object.keys(before.frames);
    const changes = plan(before, { type: 'frame.removed', id: f1! }, m);
    const after = foldChanges(before, changes);
    expect(Object.values(after.cards).some((c) => c.frameId === f1)).toBe(false);
    const undo = invertChanges(before, changes);
    expect(undo.map((c) => c.type)).toEqual(['frame.added', 'card.moved', 'link.added']);
    expect((undo[0]!.data as { index: number }).index).toBe(0);
    expect(view(foldChanges(after, undo))).toStrictEqual(view(before));
  });

  it('clears a badge, why or note the card did not have (null in the compensating patch)', () => {
    const m = minter();
    const before = seedBoard(m);
    const id = Object.keys(before.cards)[0]!;
    const changes = plan(
      before,
      { type: 'card.updated', id, patch: { badge: 'skim', why: 'w', note: 'n' } },
      m,
    );
    const undo = invertChanges(before, changes);
    expect(undo).toEqual([
      { type: 'card.updated', data: { id, patch: { badge: null, why: null, note: null } } },
    ]);
    const back = foldChanges(foldChanges(before, changes), undo).cards[id]!;
    expect('badge' in back || 'why' in back || 'note' in back).toBe(false);
  });

  it('a removed agent card comes back with its agent provenance', () => {
    const m = minter();
    const before = seedBoard(m);
    const agentCard = Object.values(before.cards).find((c) => c.provenance.kind === 'agent')!;
    const changes = plan(before, { type: 'card.removed', ids: [agentCard.id] }, m);
    const back = foldChanges(foldChanges(before, changes), invertChanges(before, changes));
    expect(back.cards[agentCard.id]).toStrictEqual(agentCard);
  });

  it('a change that did nothing has no inverse', () => {
    const m = minter();
    const before = seedBoard(m);
    expect(invertChanges(before, [{ type: 'card.removed', data: { ids: ['c_gone'] } }])).toEqual([]);
    expect(
      invertChanges(before, [{ type: 'card.moved', data: { moves: [{ id: 'c_gone', x: 1, y: 1 }] } }]),
    ).toEqual([]);
  });
});
