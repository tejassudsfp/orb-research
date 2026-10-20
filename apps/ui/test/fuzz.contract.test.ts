/**
 * P5.5 Hardening: fuzz `orb/board.command` over the wire, against a REAL sidecar (temp homes, Orb profile and
 * bundle, dsh under Electron-as-Node). The store-level fuzz (packages/orb-canvas/test/fuzz.test.ts) covers the
 * planner and the log in depth; this one checks the seam a hostile or buggy client reaches:
 *   - random valid commands, mutated commands, garbage `command` and `canvasId` arguments (any JSON), and raw
 *     request bodies that are not even a valid envelope;
 *   - every typed call answers with a value or a typed error (`orb/*`, or the gateway's own `gateway/*` argument
 *     errors), never an internal error, an HTTP 500 or a dropped connection;
 *   - raw garbage bodies get a 4xx, never a 5xx;
 *   - the sidecar stays up (ping) and its board.follow snapshot equals fold(board.jsonl) at the end, and again on
 *     a new sidecar after a kill -9.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyEvent, fold, parseBoardEvent, type BoardEvent, type BoardState } from '@orb/shared';
import { startSidecar, type TestSidecar } from '../../../scripts/testkit/index.ts';
import { call } from '../src/wire/call.js';
import { WireError, createWire, type Wire } from '../src/wire/index.js';
import { specArb, toCommand, type Spec } from '../../../packages/shared/test/boardArb.js';

const CALLS = Number(process.env.ORB_WIRE_FUZZ_CALLS ?? 250);
const TYPED = /^(orb|gateway)\//;

async function boot(homeDir: string): Promise<{ sc: TestSidecar; wire: Wire }> {
  const sc = await startSidecar({ homeDir });
  const wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 } },
  );
  return { sc, wire };
}

const fileBoard = (sc: TestSidecar, id: string): BoardState =>
  fold(
    readFileSync(join(sc.paths.orbHome, 'canvases', id, 'board.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => parseBoardEvent(JSON.parse(l))),
  );

async function snapshotOf(wire: Wire, id: string) {
  const ac = new AbortController();
  for await (const frame of wire.orb.board.follow(id, { signal: ac.signal })) {
    ac.abort();
    if (frame.kind === 'snapshot') return frame;
  }
  throw new Error('no snapshot');
}

const records = (s: { cards: { id: string }[]; frames: { id: string }[]; links: { id: string }[] }) => ({
  cards: s.cards,
  frames: s.frames,
  links: s.links,
});
const recordsOf = (s: BoardState) => ({
  cards: Object.values(s.cards),
  frames: Object.values(s.frames),
  links: Object.values(s.links),
});

function mutate(cmd: object, n: number, value: unknown): unknown {
  const copy = structuredClone(cmd) as Record<string, unknown>;
  const slots: [Record<string, unknown>, string][] = [];
  const walk = (v: unknown) => {
    if (v && typeof v === 'object')
      for (const k of Object.keys(v)) {
        slots.push([v as Record<string, unknown>, k]);
        walk((v as Record<string, unknown>)[k]);
      }
  };
  walk(copy);
  const [parent, key] = slots[n % slots.length]!;
  if (n % 5 === 0) delete parent[key];
  else parent[key] = value;
  return copy;
}

type Step =
  | { op: 'valid'; spec: Spec }
  | { op: 'mutate'; spec: Spec; n: number; value: unknown }
  | { op: 'command'; value: unknown }
  | { op: 'canvas'; value: unknown }
  | { op: 'args'; value: unknown }
  | { op: 'raw'; body: string; contentType: string };

const json = fc.jsonValue({ maxDepth: 3 });
const stepArb: fc.Arbitrary<Step> = fc.oneof(
  { weight: 5, arbitrary: specArb().map((spec) => ({ op: 'valid' as const, spec })) },
  {
    weight: 4,
    arbitrary: fc.record({ op: fc.constant('mutate' as const), spec: specArb(), n: fc.nat(), value: json }),
  },
  { weight: 2, arbitrary: json.map((value) => ({ op: 'command' as const, value })) },
  {
    weight: 1,
    arbitrary: fc
      .oneof(json, fc.constantFrom('../..', '/etc/passwd', '2026-01-01-x/../../y', 'x'.repeat(5000)))
      .map((value) => ({ op: 'canvas' as const, value })),
  },
  { weight: 1, arbitrary: json.map((value) => ({ op: 'args' as const, value })) },
  {
    weight: 1,
    arbitrary: fc.record({
      op: fc.constant('raw' as const),
      body: fc.oneof(
        fc.string({ maxLength: 200 }),
        json.map((v) => JSON.stringify(v)),
        json.map((v) =>
          JSON.stringify({ type: 'client-request', rpcId: 'r1', method: 'orb/board.command', payload: v }),
        ),
      ),
      contentType: fc.constantFrom('application/json', 'text/plain', 'application/octet-stream'),
    }),
  },
);

describe('board.command wire fuzz (real sidecar)', () => {
  it(`${CALLS} random, mutated and garbage calls get typed answers; the board stays sound across kill -9`, async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'orb-wirefuzz-'));
    const sidecars: TestSidecar[] = [];
    const tally = { ok: 0, typed: 0, http4xx: 0 };
    try {
      const first = await boot(homeDir);
      sidecars.push(first.sc);
      const { wire, sc } = first;
      const canvas = await wire.orb.canvas.create({ prompt: 'Wire fuzz' });
      let state: BoardState = fold([]);
      const env = { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket };
      const steps = fc.sample(stepArb, { numRuns: CALLS, seed: Number(process.env.ORB_FUZZ_SEED ?? 5050) });
      for (const step of steps) {
        if (step.op === 'raw') {
          const res = await sc.fetch(new URL('api/orb/board.command', sc.baseUrl).href, {
            method: 'POST',
            headers: { 'content-type': step.contentType },
            body: step.body,
          });
          await res.arrayBuffer();
          expect(res.status, `raw body ${JSON.stringify(step.body).slice(0, 200)}`).toBeLessThan(500);
          if (res.status >= 400) tally.http4xx++;
          continue;
        }
        let args: unknown;
        if (step.op === 'args') args = step.value;
        else if (step.op === 'canvas') args = { canvasId: step.value, command: { type: 'undo' } };
        else if (step.op === 'command') args = { canvasId: canvas.id, command: step.value };
        else {
          const cmd = toCommand(state, step.spec);
          if (!cmd) continue;
          args = {
            canvasId: canvas.id,
            command: step.op === 'valid' ? cmd : mutate(cmd, step.n, step.value),
          };
        }
        try {
          const value = (await call(env, 'orb', 'board.command', args)) as { events: BoardEvent[] };
          for (const e of value.events) state = applyEvent(state, parseBoardEvent(e));
          tally.ok++;
        } catch (err) {
          expect(err, String(err)).toBeInstanceOf(WireError);
          const code = (err as WireError).code;
          expect(
            code,
            `${code}: ${(err as Error).message} for ${JSON.stringify(args).slice(0, 300)}`,
          ).toMatch(TYPED);
          tally.typed++;
        }
      }
      if (process.env.ORB_FUZZ_VERBOSE) process.stderr.write(`wire fuzz tally ${JSON.stringify(tally)}\n`);
      expect(tally.ok).toBeGreaterThan(CALLS / 5);
      expect(tally.typed).toBeGreaterThan(CALLS / 5);

      // Still up, and the live board, the client's fold of the returned events and the file all agree.
      expect(await wire.orb.ping()).toMatchObject({ ok: true });
      const live = await snapshotOf(wire, canvas.id);
      expect(records(live)).toStrictEqual(recordsOf(state));
      await new Promise((r) => setTimeout(r, 400)); // past the 250 ms flush window
      expect(recordsOf(fileBoard(sc, canvas.id))).toStrictEqual(recordsOf(state));

      // kill -9 and reopen on a new sidecar: the same board.
      wire.dispose();
      process.kill(sc.supervisor.pid!, 'SIGKILL');
      await sc.supervisor.stop();
      const second = await boot(homeDir);
      sidecars.push(second.sc);
      await second.wire.orb.canvas.open(canvas.id);
      expect(records(await snapshotOf(second.wire, canvas.id))).toStrictEqual(recordsOf(state));
      second.wire.dispose();
    } finally {
      await Promise.allSettled(sidecars.map((s) => s.stop()));
      rmSync(homeDir, { recursive: true, force: true });
    }
  }, 180_000);
});
