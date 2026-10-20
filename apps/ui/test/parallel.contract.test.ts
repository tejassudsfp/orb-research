/**
 * P6.7 contract test: Parallel AI through a REAL sidecar (mock LLM, mock Parallel on loopback, the Parallel key from the
 * environment). Orb calls deep_research (scripted): the Research run card is written by orb-canvas into board.jsonl
 * and fills live; a run over the cost threshold waits for `orb/parallel.confirm`; the answer is validated, a stale or
 * foreign card is refused; `orb/parallel.status` reports the key.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PARALLEL_BASE_URL, type BoardEvent, type CanvasMeta } from '@orb/shared';
import { MOCK_PARALLEL_KEY, MockParallel, startMockedSidecar, type MockedSidecar } from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';

let sc: MockedSidecar;
let wire: Wire;
let parallel: MockParallel;
let canvas: CanvasMeta;

beforeAll(async () => {
  parallel = await new MockParallel({ taskMs: 150 }).start();
  sc = await startMockedSidecar({ env: { PARALLEL_API_KEY: MOCK_PARALLEL_KEY, PARALLEL_BASE_URL: parallel.baseURL } });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket }, { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } });
  wire.events.start();
  canvas = await wire.orb.canvas.create({ prompt: 'Parallel contract' });
});

afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
  await parallel?.close();
});

const events = (): BoardEvent[] =>
  readFileSync(join(sc.paths.orbHome, 'canvases', canvas.id, 'board.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BoardEvent);

/** The latest data of a card: its `card.added` data, with every later `card.updated` patch applied. */
const dataOf = (id: string): Record<string, any> | undefined => {
  let data: Record<string, any> | undefined;
  for (const e of events()) {
    const d = e.data as any;
    if (e.type === 'card.added' && d.card.id === id) data = d.card.data;
    if (e.type === 'card.updated' && d.id === id && d.patch.data) data = d.patch.data;
  }
  return data;
};
const researchIds = () => events().flatMap((e) => (e.type === 'card.added' && (e.data as any).card.type === 'research' ? [(e.data as any).card.id as string] : []));

async function until<T>(what: string, probe: () => T | undefined | false, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = probe();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('Parallel through the sidecar', () => {
  it('the key from the environment makes Parallel available; the host is api.parallel.ai', async () => {
    expect(PARALLEL_BASE_URL).toBe('https://api.parallel.ai');
    expect(await wire.orb.parallel.status()).toEqual({ configured: true, confirmAboveUsd: 0.5 });
  });

  it('deep_research under the threshold runs without asking: the card fills and ends with the cited result', async () => {
    sc.llm.enqueue(
      { toolCalls: [{ id: 'call_dr_pro', name: 'deep_research', arguments: { input: 'The EV market', processor: 'pro', title: 'EV market' } }] },
      { text: 'Done.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'research the EV market' });
    const id = await until('the research card', () => researchIds()[0]);
    const done = await until('the completed card', () => (dataOf(id)?.status === 'completed' ? dataOf(id) : undefined));
    expect(done).toMatchObject({ kind: 'deep_research', processor: 'pro', progress: 100, title: 'EV market' });
    expect(done.citations.length).toBeGreaterThan(0);
    expect(events().filter((e) => e.type === 'card.added' && (e.data as any).card.type === 'source').length).toBeGreaterThan(0);
    // The key reached Parallel as x-api-key, and the run asked for events.
    const req = parallel.last('POST', '/v1/tasks/runs')!;
    expect(req.keyOk).toBe(true);
    expect(req.body.enable_events).toBe(true);
    const created = events().find((e) => e.type === 'card.added' && (e.data as any).card.id === id)!;
    expect(created.actor).toMatchObject({ kind: 'agent', agent: 'orb' });
    // Nothing waits: confirming it is refused.
    await expect(wire.orb.parallel.confirm({ canvasId: canvas.id, cardId: id, approve: true })).rejects.toMatchObject({ message: expect.stringMatching(/not waiting/) });
  });

  it('ultra asks: the card waits for orb/parallel.confirm; Approve runs it; a stale or unknown card is refused', async () => {
    const runs = parallel.count('POST', '/v1/tasks/runs');
    sc.llm.enqueue(
      { toolCalls: [{ id: 'call_dr_ultra', name: 'deep_research', arguments: { input: 'A hard report', processor: 'ultra', title: 'Hard report' } }] },
      { text: 'Started.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'go deep' });
    const id = await until('the approval card', () => researchIds().find((c) => dataOf(c)?.status === 'awaiting_approval'));
    expect(dataOf(id)).toMatchObject({ estCostUsd: 0.3, processor: 'ultra' });
    expect(parallel.count('POST', '/v1/tasks/runs')).toBe(runs);
    await expect(wire.orb.parallel.confirm({ canvasId: canvas.id, cardId: 'c_nope', approve: true })).rejects.toBeDefined();
    expect(await wire.orb.parallel.confirm({ canvasId: canvas.id, cardId: id, approve: true })).toEqual({ state: 'approved' });
    await until('the run to complete', () => dataOf(id)?.status === 'completed');
    expect(parallel.count('POST', '/v1/tasks/runs')).toBe(runs + 1);
  });

  it('the confirm wire is validated', async () => {
    await expect(wire.orb.parallel.confirm({ canvasId: canvas.id, cardId: 'not-a-card', approve: true })).rejects.toBeDefined();
  });
});
