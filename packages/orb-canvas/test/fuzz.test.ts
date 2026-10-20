/**
 * P5.5 Hardening: fuzz the board commands (`orb/board.command` as the canvas service runs it).
 *
 * fast-check drives one canvas through long random sequences of commands, mixing:
 *   - valid commands chosen on the current board (`toCommand` from the P2.4 generators), single and batched;
 *   - the same commands with stale or made-up ids (`c_…`, `f_…`, `l_…` that do not exist);
 *   - valid commands with ONE field replaced by an arbitrary JSON value (wrong types, NaN-free extremes, huge
 *     strings, nested objects, `__proto__` keys, missing ids…);
 *   - batches with one bad command inside (must be atomic: nothing written);
 *   - the same commands from an agent (which may not touch the user's notes: `orb/forbidden`);
 *   - undo / redo, `card.opened`, and pure garbage (any JSON value, `null`, arrays, unknown `type`s);
 *   - bursts fired without awaiting (concurrent callers).
 *
 * After every call:
 *   - the call either resolves, or rejects with a typed error: a ZodError when the request does not parse
 *     (orb-host turns that into `orb/invalid-args` before it reaches the store), otherwise a CanvasError with an
 *     `orb/*` code. Never a TypeError, RangeError or other internal failure.
 *   - a rejected call wrote nothing (same seq, same state);
 *   - the board is referentially sound (cards' frames, link ends exist; numbers finite; seq contiguous).
 * At the end of each run the store is flushed and closed, board.jsonl scans clean (no torn or corrupt line), and a
 * fresh store reopening the canvas folds exactly the same board.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect, isDeepStrictEqual } from 'node:util';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { BoardCommand, BoardCommandRequest, type Actor, type BoardState } from '@orb/shared';
import { BOARD_FILE, CanvasStore, isCanvasError, scanBoardLog } from '../src/index.js';
import { specArb, toCommand, view, type Spec } from '../../shared/test/boardArb.js';

/** Agents write through the same service (P3 tools): they may not touch the user's notes (`orb/forbidden`). */
const AGENT: Actor = { kind: 'agent', agent: 'scout', model: 'gpt-6-luna', sessionId: 's_fuzz' };
const RUNS = Number(process.env.ORB_FUZZ_RUNS ?? 60);
const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});

type Step =
  | { op: 'valid'; spec: Spec }
  | { op: 'agent'; spec: Spec; path: number | null; value: unknown }
  | { op: 'stale'; spec: Spec; id: string }
  | { op: 'mutate'; spec: Spec; path: number; value: unknown }
  | { op: 'batch'; specs: Spec[]; poison: number | null; value: unknown }
  | { op: 'undo' | 'redo' }
  | { op: 'opened'; pick: number; junk: string | null }
  | { op: 'garbage'; value: unknown }
  | { op: 'burst'; specs: Spec[] };

/** Arbitrary JSON-ish values, weighted towards the shapes that break naive handlers. */
const nasty: fc.Arbitrary<unknown> = fc.oneof(
  fc.jsonValue({ maxDepth: 3 }),
  fc.constantFrom(
    null,
    '',
    0,
    -0,
    -1,
    1e308,
    -1e308,
    Number.MAX_SAFE_INTEGER,
    2 ** 53 + 2,
    true,
    [],
    {},
    'c_',
    'f_',
    'l_',
    'c_doesnotexist',
    '__proto__',
    'constructor',
    'x'.repeat(100_000),
    '\u0000 \ud800',
    { __proto__: { polluted: true } },
    JSON.parse('{"__proto__":{"polluted":true}}'),
    { constructor: { prototype: { polluted: true } } },
  ),
  fc.string({ maxLength: 40 }),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.integer(),
);

const fakeId = fc
  .tuple(fc.constantFrom('c_', 'f_', 'l_', 'x_', ''), fc.string({ minLength: 0, maxLength: 30 }))
  .map(([p, s]) => p + s);

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  { weight: 6, arbitrary: specArb().map((spec) => ({ op: 'valid' as const, spec })) },
  {
    weight: 2,
    arbitrary: fc.record({
      op: fc.constant('agent' as const),
      spec: specArb(),
      path: fc.option(fc.nat(), { nil: null }),
      value: nasty,
    }),
  },
  { weight: 2, arbitrary: fc.record({ op: fc.constant('stale' as const), spec: specArb(), id: fakeId }) },
  {
    weight: 4,
    arbitrary: fc.record({
      op: fc.constant('mutate' as const),
      spec: specArb(),
      path: fc.nat(),
      value: nasty,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      op: fc.constant('batch' as const),
      specs: fc.array(specArb(), { minLength: 1, maxLength: 6 }),
      poison: fc.option(fc.nat(), { nil: null }),
      value: nasty,
    }),
  },
  { weight: 2, arbitrary: fc.constantFrom({ op: 'undo' as const }, { op: 'redo' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      op: fc.constant('opened' as const),
      pick: fc.nat(),
      junk: fc.option(fakeId, { nil: null }),
    }),
  },
  {
    weight: 2,
    arbitrary: fc
      .oneof(
        nasty,
        fc.record({ type: fc.string({ maxLength: 20 }), id: nasty }),
        fc.record({
          type: fc.constantFrom(
            'card.added',
            'card.moved',
            'card.updated',
            'card.removed',
            'frame.added',
            'frame.updated',
            'frame.removed',
            'link.added',
            'link.removed',
            'batch',
            'card.opened',
            'undo',
            'redo',
          ),
          id: nasty,
          ids: nasty,
          card: nasty,
          frame: nasty,
          link: nasty,
          patch: nasty,
          moves: nasty,
          commands: nasty,
          pendingId: nasty,
          x: nasty,
          y: nasty,
        }),
      )
      .map((value) => ({ op: 'garbage' as const, value })),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      op: fc.constant('burst' as const),
      specs: fc.array(specArb(), { minLength: 2, maxLength: 8 }),
    }),
  },
);

/** Every object/array slot of a value, as [parent, key] pairs (for "replace one field" mutations). */
function slots(
  value: unknown,
  out: [Record<string, unknown>, string][] = [],
): [Record<string, unknown>, string][] {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      out.push([value as Record<string, unknown>, key]);
      slots((value as Record<string, unknown>)[key], out);
    }
  }
  return out;
}

function mutate(cmd: object, path: number, value: unknown): unknown {
  const copy = structuredClone(cmd) as Record<string, unknown>;
  const all = slots(copy);
  const [parent, key] = all[path % all.length]!;
  if (path % 7 === 0) delete parent[key];
  else parent[key] = value;
  return copy;
}

/** Replace every id-looking string in a command with `id` (stale/made-up ids). */
function restale(cmd: object, id: string): unknown {
  return JSON.parse(JSON.stringify(cmd), (_k, v) =>
    typeof v === 'string' && /^[cfl]_/.test(v) ? id : (v as unknown),
  );
}

function expectSound(state: BoardState): void {
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  for (const [id, card] of Object.entries(state.cards)) {
    expect(card.id).toBe(id);
    expect([card.x, card.y, card.w, card.h].every(finite)).toBe(true);
    expect(card.w > 0 && card.h > 0, `card ${id} size`).toBe(true);
    if (card.frameId) expect(state.frames[card.frameId], `card ${id} frame`).toBeDefined();
  }
  for (const [id, frame] of Object.entries(state.frames)) {
    expect(frame.id).toBe(id);
    expect([frame.x, frame.y, frame.w, frame.h].every(finite)).toBe(true);
  }
  const ends = (e: string) => Boolean(state.cards[e] ?? state.frames[e]);
  for (const [id, link] of Object.entries(state.links)) {
    expect(link.id).toBe(id);
    expect(ends(link.from) && ends(link.to), `link ${id} ends`).toBe(true);
  }
  expect(Object.prototype).not.toHaveProperty('polluted');
}

type Outcome = 'ok' | 'invalid' | 'rejected';

/** Run one request; assert the error is typed and that a rejected request wrote nothing. */
async function apply(store: CanvasStore, id: string, request: unknown, asAgent = false): Promise<Outcome> {
  const board = await store.board(id);
  const before = board.current;
  const parses = (asAgent ? BoardCommand : BoardCommandRequest).safeParse(request).success;
  try {
    if (asAgent) await store.commandEvents(id, request as never, AGENT);
    else await store.userCommand(id, request as never);
  } catch (err) {
    if (!parses) {
      expect((err as Error).name, String(err)).toBe('ZodError');
      expect(board.current).toBe(before);
      return 'invalid';
    }
    if (!isCanvasError(err))
      throw new Error(`untyped failure for ${JSON.stringify(request).slice(0, 300)}`, { cause: err });
    expect(['orb/invalid-args', 'orb/not-found', 'orb/forbidden']).toContain(err.code);
    expect(board.current).toBe(before);
    return 'rejected';
  }
  expect(parses, `accepted a request that does not parse: ${JSON.stringify(request).slice(0, 300)}`).toBe(
    true,
  );
  return 'ok';
}

function requestFor(state: BoardState, step: Step): unknown {
  switch (step.op) {
    case 'valid':
      return toCommand(state, step.spec);
    case 'agent': {
      const cmd = toCommand(state, step.spec);
      return cmd && (step.path === null ? cmd : mutate(cmd, step.path, step.value));
    }
    case 'stale': {
      const cmd = toCommand(state, step.spec);
      return cmd && restale(cmd, step.id);
    }
    case 'mutate': {
      const cmd = toCommand(state, step.spec);
      return cmd && mutate(cmd, step.path, step.value);
    }
    case 'batch': {
      // Sub-commands are chosen on the current board (not chained), so later ones may hit removed ids: also a test.
      const commands: unknown[] = step.specs.map((s) => toCommand(state, s)).filter(Boolean) as object[];
      if (commands.length === 0) return undefined;
      if (step.poison !== null) {
        const i = step.poison % commands.length;
        commands[i] = mutate(commands[i] as object, step.poison, step.value);
      }
      return { type: 'batch', commands };
    }
    case 'undo':
    case 'redo':
      return { type: step.op };
    case 'opened': {
      const ids = Object.keys(state.cards);
      return { type: 'card.opened', id: step.junk ?? ids[step.pick % Math.max(1, ids.length)] ?? 'c_none' };
    }
    case 'garbage':
      return step.value;
    case 'burst':
      return undefined;
  }
}

describe('board command fuzz (orb-canvas)', () => {
  it(`random, stale, mutated, batched, concurrent and garbage commands keep the board sound and the log reopenable (${RUNS} runs)`, async () => {
    const tally: Record<Outcome, number> = { ok: 0, invalid: 0, rejected: 0 };
    await fc.assert(
      fc.asyncProperty(fc.array(stepArb, { minLength: 5, maxLength: 60 }), async (steps) => {
        const home = mkdtempSync(join(tmpdir(), 'orb-fuzz-'));
        homes.push(home);
        const store = new CanvasStore({ home, searchIndex: false, flushMs: 5 });
        const { id } = await store.create({ prompt: 'fuzz' });
        const board = await store.board(id);
        for (const step of steps) {
          if (step.op === 'burst') {
            const requests = step.specs.map((s) => toCommand(board.current, s)).filter(Boolean);
            const results = await Promise.allSettled(requests.map((r) => store.userCommand(id, r as never)));
            for (const r of results) {
              if (r.status === 'rejected') {
                if (!isCanvasError(r.reason)) throw r.reason;
                expect(['orb/invalid-args', 'orb/not-found', 'orb/forbidden']).toContain(r.reason.code);
              } else tally.ok++;
            }
          } else {
            const request = requestFor(board.current, step);
            if (request === undefined) continue;
            tally[await apply(store, id, request, step.op === 'agent')]++;
          }
          expectSound(board.current);
        }
        const final = board.current;
        await store.close();

        const raw = readFileSync(join(home, 'canvases', id, BOARD_FILE));
        const scan = scanBoardLog(raw);
        expect(scan).toMatchObject({ goodBytes: raw.length, droppedLines: 0, corruptAt: null });
        expect(scan.events.map((e) => e.seq)).toEqual(scan.events.map((_, i) => i));

        const reopened = new CanvasStore({ home, searchIndex: false });
        try {
          const again = await reopened.board(id);
          expect(again.recovery.droppedLines).toBe(0);
          // Not toStrictEqual: Vitest's type check compares `a.constructor === b.constructor`, so two equal boards
          // whose card `data` holds an OWN `constructor` key (a fuzz value) would differ. isDeepStrictEqual still
          // tells -0 from 0 and checks prototypes.
          const reopenedView = view(again.current);
          const liveView = view(final);
          expect(
            isDeepStrictEqual(reopenedView, liveView),
            `reopened ${inspect(reopenedView, { depth: 8 })}\nlive ${inspect(liveView, { depth: 8 })}`,
          ).toBe(true);
          expect(again.seq).toBe(final.seq);
        } finally {
          await reopened.close();
        }
      }),
      {
        numRuns: RUNS,
        // Replay a reported failure: ORB_FUZZ_SEED=<seed> ORB_FUZZ_PATH=<path> (from fast-check's report).
        ...(process.env.ORB_FUZZ_SEED ? { seed: Number(process.env.ORB_FUZZ_SEED) } : {}),
        ...(process.env.ORB_FUZZ_PATH ? { path: process.env.ORB_FUZZ_PATH, endOnFailure: true } : {}),
      },
    );
    if (process.env.ORB_FUZZ_VERBOSE) process.stderr.write(`fuzz tally ${JSON.stringify(tally)}\n`);
    // The mix really exercised all three outcomes.
    expect(tally.ok).toBeGreaterThan(RUNS);
    expect(tally.invalid).toBeGreaterThan(RUNS / 4);
    expect(tally.rejected).toBeGreaterThan(RUNS / 10);
  }, 240_000);
});
