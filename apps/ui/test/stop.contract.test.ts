/**
 * P1.10 contract test + benchmark: the stop path on a REAL sidecar whose default model is the local mock LLM.
 *   orb/agents.control(canvasId, {agent:'all', action:'stop'})
 *     → root agent cancel({kind:'user'}) (+ live descendants {kind:'parent'}), whenIdle() raced with 1 s
 *     → orb/agents.status: `stopping` at once, then `stopped` (or `stop-timeout`) with the measured ms.
 * Done-when: 20 runs mid-stream (the mock streams slowly) and 20 runs mid-tool (place_card inside its 3 s abortable
 * delay) all reach idle within 1000 ms. p50/p95 per scenario are printed (and recorded in docs/SPIKE_NOTES.md §P1.10).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentStatus, CanvasMeta } from '@orb/shared';
import { startMockedSidecar, type MockedSidecar } from '../../../scripts/testkit/index.ts';
import { WireError, createWire, type Wire } from '../src/wire/index.js';
import { timingExpect } from '../../../scripts/testkit/namespace.ts';

/** place_card's artificial, abortable delay (ORB_TEST_PLACE_CARD_DELAY_MS): the stop lands inside it. */
const TOOL_DELAY_MS = 3_000;
const RUNS = 20;
const IDLE_BUDGET_MS = 1_000;

let sc: MockedSidecar;
let wire: Wire;
let canvas: CanvasMeta;

beforeAll(async () => {
  sc = await startMockedSidecar({ env: { ORB_TEST_PLACE_CARD_DELAY_MS: String(TOOL_DELAY_MS) } });
  wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
  wire.events.start();
  canvas = await wire.orb.canvas.create({ prompt: 'Stop path benchmark' });
});

afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
});

/** Background collector for a stream, with `until(pred)`. */
function collect<T>(iterable: AsyncIterable<T>, ac: AbortController) {
  const items: T[] = [];
  const waiters = new Set<() => void>();
  const done = (async () => {
    try {
      for await (const item of iterable) {
        items.push(item);
        for (const w of [...waiters]) w();
      }
    } catch (e) {
      if (!ac.signal.aborted) throw e;
    }
  })();
  const until = (pred: (items: T[]) => boolean, timeoutMs = 10_000) =>
    new Promise<void>((resolve, reject) => {
      if (pred(items)) return resolve();
      const timer = setTimeout(() => {
        waiters.delete(check);
        reject(new Error(`stream: condition not met in ${timeoutMs} ms (${items.length} items)`));
      }, timeoutMs);
      const check = () => {
        if (!pred(items)) return;
        clearTimeout(timer);
        waiters.delete(check);
        resolve();
      };
      waiters.add(check);
    });
  return { items, until, stop: async () => (ac.abort(), done) };
}

function followStatus(canvasId: string) {
  const ac = new AbortController();
  return collect<AgentStatus>(wire.orb.agents.status(canvasId, { signal: ac.signal }), ac);
}

const boardLines = (id: string): number => {
  try {
    return readFileSync(join(sc.paths.orbHome, 'canvases', id, 'board.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean).length;
  } catch {
    return 0;
  }
};

/** Nearest-rank percentile. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

const summary = (values: number[]) => ({
  p50: percentile(values, 50),
  p95: percentile(values, 95),
  max: Math.max(...values),
});

const results: Record<string, { server: number[]; client: number[] }> = {
  'mid-stream': { server: [], client: [] },
  'mid-tool': { server: [], client: [] },
};

async function rootRunning(sessionId: string): Promise<boolean | undefined> {
  const { items } = await wire.session.list();
  return items.find((i) => i.sessionId === sessionId)?.running;
}

/**
 * One stop run: queue `turn`, send a prompt, wait until `ready` says the stop would land where we want it, stop,
 * and check the outcome on the control result, the status stream, the session list and the mock LLM.
 */
async function stopRun(
  scenario: 'mid-stream' | 'mid-tool',
  status: ReturnType<typeof followStatus>,
  run: number,
) {
  const first = sc.llm.requests.length;
  const boardBefore = boardLines(canvas.id);
  if (scenario === 'mid-stream') {
    // ~60 chunks 50 ms apart: the model would stream for ~3 s.
    sc.llm.enqueue({ text: Array.from({ length: 60 }, (_, i) => `word${i}`).join(' '), chunkDelayMs: 50 });
  } else {
    sc.llm.enqueue({
      toolCalls: [
        {
          id: `call_stop_${run}`,
          name: 'place_card',
          arguments: { type: 'doc', title: `Slow ${run}`, body: 'never lands', why: 'stop benchmark' },
        },
      ],
    });
  }
  const mark = status.items.length;
  await wire.orb.chat.send(canvas.id, { text: `${scenario} run ${run}` });
  const req = await sc.llm.waitForRequest((r) => r.id === first + 1);
  await status.until((s) => s.slice(mark).some((x) => x.state === 'running'));
  if (scenario === 'mid-stream') {
    await expect.poll(() => req.chunksSent, { timeout: 5_000, interval: 5 }).toBeGreaterThanOrEqual(3);
    expect(req.completed).toBe(false);
  } else {
    // The model stream is complete; place_card is now inside its 3 s delay.
    await expect.poll(() => req.completed, { timeout: 5_000, interval: 5 }).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
  }

  const stopMark = status.items.length;
  const t0 = performance.now();
  const result = await wire.orb.agents.control(canvas.id, { agent: 'all', action: 'stop' });
  const clientMs = Math.round((performance.now() - t0) * 10) / 10;

  expect(result).toMatchObject({ action: 'stop', state: 'stopped', agents: 1 });
  timingExpect(() => {
    expect(result.stopMs).toBeLessThan(IDLE_BUDGET_MS);
  });
  // The status stream: `stopping` first, then `stopped` with the same measured ms, and nothing in between.
  await status.until((s) => s.slice(stopMark).some((x) => x.state === 'stopped'));
  const states = status.items.slice(stopMark);
  expect(states.map((s) => s.state).slice(0, 2)).toEqual(['stopping', 'stopped']);
  expect(states[1]!.stopMs).toBe(result.stopMs);
  // Idle per the harness as soon as control returns.
  expect(await rootRunning(canvas.rootSessionId!)).toBe(false);

  if (scenario === 'mid-stream') {
    await expect.poll(() => req.aborted, { timeout: 2_000, interval: 10 }).toBe(true);
  }
  results[scenario]!.server.push(result.stopMs);
  results[scenario]!.client.push(clientMs);
  return { first, boardBefore };
}

describe('stop path (orb/agents.control stop + orb/agents.status)', () => {
  it('agents.status starts with the root agent idle; stopping an idle canvas is immediate', async () => {
    const status = followStatus(canvas.id);
    await status.until((s) => s.length >= 1);
    expect(status.items[0]).toMatchObject({ agent: 'orb', state: 'idle', sessionId: canvas.rootSessionId });
    const result = await wire.orb.agents.control(canvas.id, { agent: 'all', action: 'stop' });
    expect(result).toMatchObject({ action: 'stop', state: 'stopped', agents: 1 });
    timingExpect(() => {
      expect(result.stopMs).toBeLessThan(100);
    });
    await status.until((s) => s.some((x) => x.state === 'stopped'));
    expect(status.items.slice(1).map((s) => s.state)).toEqual(['stopping', 'stopped']);
    await status.stop();
  });

  it('validates its arguments; a child never started is not-found', async () => {
    const code = (p: Promise<unknown>) =>
      p.then(
        () => 'ok',
        (e: unknown) => (e instanceof WireError ? e.code : String(e)),
      );
    // P3.7 (apps/ui/test/control.contract.test.ts covers pause/resume/redirect): a redirect needs text, and a
    // child never started cannot be paused.
    expect(await code(wire.orb.agents.control(canvas.id, { agent: 'orb', action: 'redirect' }))).toBe(
      'orb/invalid-args',
    );
    expect(await code(wire.orb.agents.control(canvas.id, { agent: 'critic', action: 'pause' }))).toBe(
      'orb/not-found',
    );
    // P3.6: one agent can be stopped; Scout was never started on this canvas.
    expect(await code(wire.orb.agents.control(canvas.id, { agent: 'scout', action: 'stop' }))).toBe(
      'orb/not-found',
    );
    expect(await code(wire.orb.agents.control(canvas.id, { agent: 'nobody', action: 'stop' } as never))).toBe(
      'orb/invalid-args',
    );
    expect(await code(wire.orb.agents.control('2020-01-01-missing', { agent: 'all', action: 'stop' }))).toBe(
      'orb/not-found',
    );
  });

  it(`mid-stream: ${RUNS} stops of a slowly streaming reply each reach idle within ${IDLE_BUDGET_MS} ms`, async () => {
    const status = followStatus(canvas.id);
    await status.until((s) => s.length >= 1);
    for (let run = 1; run <= RUNS; run++) {
      const { first } = await stopRun('mid-stream', status, run);
      // The cancelled reply never continues: no further model request for this turn.
      await new Promise((r) => setTimeout(r, 50));
      expect(sc.llm.requests.length).toBe(first + 1);
    }
    await status.stop();
  }, 180_000);

  it(`mid-tool: ${RUNS} stops during place_card's ${TOOL_DELAY_MS} ms delay each reach idle within ${IDLE_BUDGET_MS} ms and write nothing`, async () => {
    const status = followStatus(canvas.id);
    await status.until((s) => s.length >= 1);
    const pending: Array<{ first: number; boardBefore: number }> = [];
    for (let run = 1; run <= RUNS; run++) pending.push(await stopRun('mid-tool', status, run));
    // Wait past the tool delay of the last run: no card was ever written and no tool result went to the model.
    await new Promise((r) => setTimeout(r, TOOL_DELAY_MS + 300));
    expect(boardLines(canvas.id)).toBe(pending[0]!.boardBefore);
    expect(sc.llm.requests.length).toBe(pending.at(-1)!.first + 1);
    await status.stop();
  }, 240_000);

  it('logs the measured ms in the sidecar log and reports p50/p95', async () => {
    await expect
      .poll(
        () =>
          readFileSync(sc.logPath, 'utf8').match(/\[orb-agents\] stop canvas \S+: stopped in [\d.]+ ms/g)
            ?.length ?? 0,
        {
          timeout: 5_000,
        },
      )
      .toBeGreaterThanOrEqual(2 * RUNS);
    const report = Object.fromEntries(
      Object.entries(results).map(([k, v]) => [
        k,
        { runs: v.server.length, server: summary(v.server), client: summary(v.client) },
      ]),
    );
    console.log(`[P1.10 stop benchmark] ${JSON.stringify(report)}`);
    for (const v of Object.values(results)) {
      expect(v.server).toHaveLength(RUNS);
      timingExpect(() => {
        expect(Math.max(...v.server)).toBeLessThan(IDLE_BUDGET_MS);
      });
      timingExpect(() => {
        expect(Math.max(...v.client)).toBeLessThan(IDLE_BUDGET_MS);
      });
    }
  });
});
