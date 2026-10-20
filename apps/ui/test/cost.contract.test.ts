/**
 * P4.3 contract test: the canvas token and cost meter on a REAL sidecar whose model is the mock LLM.
 *
 * Every mock response reports its own usage (prompt, cached, completion tokens, as OpenAI does). Orb delegates to
 * Scout, which runs on a second model (orb.json per-agent pick), so the canvas spends on two sessions and two routes.
 * `orb/cost.get` must equal the provider-reported usage summed over every completed request (root + child sessions),
 * split per route; the mock routes have no catalog price until one is set in the table (`orb/prices.set`), then the
 * dollars are tokens × prices. The Home tile carries the same total, and a NEW sidecar on the same homes reads the
 * same meter from the stored sessions (cold reads).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { costOf, type BoardEvent, type CanvasCost, type Frame, type TokenBuckets } from '@orb/shared';
import {
  MOCK_KEY_ENV,
  MOCK_MODEL,
  MOCK_MODEL_ALT,
  MOCK_PROVIDER,
  MockLlm,
  mockProviderPatch,
  startSidecar,
  type MockRequest,
  type MockTurn,
  type TestSidecar,
} from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';

type Who = 'orb' | 'scout';
const scripts: Record<Who, MockTurn[]> = { orb: [], scout: [] };
/** The usage each request's response reported, by request id. */
const reported = new Map<number, { model: string; input: number; output: number; cacheRead: number }>();

const textOf = (message: any): string =>
  typeof message?.content === 'string'
    ? message.content
    : Array.isArray(message?.content)
      ? message.content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n')
      : '';
const whoOf = (req: MockRequest): Who =>
  textOf((req.body.messages as any[])[0]).includes('You are Scout') ? 'scout' : 'orb';

let llm: MockLlm;
let homeDir: string;

beforeAll(async () => {
  llm = await new MockLlm({
    defaultTurn: (req) => {
      const turn = scripts[whoOf(req)].shift() ?? { text: 'Noted.' };
      // Distinct, provider-style usage per request: the prompt includes its cached part.
      const usage = {
        input: 900 + req.id * 37,
        output: 40 + req.id * 3,
        cacheRead: req.id % 2 === 0 ? 256 : 0,
      };
      reported.set(req.id, { model: String(req.body.model), ...usage });
      return { ...turn, usage };
    },
  }).start();
  homeDir = mkdtempSync(join(tmpdir(), 'orb-cost-'));
});

afterAll(async () => {
  await llm?.close();
  rmSync(homeDir, { recursive: true, force: true });
});

async function boot(): Promise<{ sc: TestSidecar; wire: Wire }> {
  const sc = await startSidecar({
    homeDir,
    extraPatch: mockProviderPatch(llm.baseURL),
    env: { [MOCK_KEY_ENV]: 'orb-mock-key' },
  });
  const wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
  return { sc, wire };
}

/** What the provider billed, per model: Σ over completed requests, in the harness's disjoint buckets. */
function providerUsage(): Map<string, TokenBuckets> {
  const out = new Map<string, TokenBuckets>();
  for (const req of llm.requests) {
    const r = reported.get(req.id);
    if (!r || !req.completed) continue;
    const prev = out.get(r.model) ?? {
      uncachedInputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    out.set(r.model, {
      uncachedInputTokens: prev.uncachedInputTokens + r.input - r.cacheRead,
      outputTokens: prev.outputTokens + r.output,
      cacheReadTokens: prev.cacheReadTokens + r.cacheRead,
      cacheWriteTokens: 0,
    });
  }
  return out;
}

const sum = (m: Map<string, TokenBuckets>): TokenBuckets =>
  [...m.values()].reduce(
    (a, b) => ({
      uncachedInputTokens: a.uncachedInputTokens + b.uncachedInputTokens,
      outputTokens: a.outputTokens + b.outputTokens,
      cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
      cacheWriteTokens: 0,
    }),
    { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  );

/** Wait until every request has finished, nothing new started for a while, and the meter matches the provider. */
async function settledCost(wire: Wire, canvasId: string): Promise<CanvasCost> {
  let last: CanvasCost | undefined;
  let seen = -1;
  let quietSince = Date.now();
  await expect
    .poll(
      async () => {
        if (llm.requests.length !== seen) {
          seen = llm.requests.length;
          quietSince = Date.now();
        }
        last = await wire.orb.cost.get(canvasId);
        const open = llm.requests.some((r) => !r.completed && !r.aborted);
        return (
          !open &&
          Date.now() - quietSince > 800 &&
          JSON.stringify(last.tokens) === JSON.stringify(sum(providerUsage()))
        );
      },
      { timeout: 30_000, interval: 200 },
    )
    .toBe(true);
  return last!;
}

describe('cost meter (P4.3)', () => {
  let canvasId = '';
  let first: CanvasCost;

  it('sums the provider-reported usage of Orb and Scout, per route; prices make dollars', async () => {
    const { sc, wire } = await boot();
    try {
      await wire.orb.settings.set({ models: { scout: { provider: MOCK_PROVIDER, model: MOCK_MODEL_ALT } } });
      const canvas = await wire.orb.canvas.create({
        prompt: 'What does a solid-state cell cost?',
        template: 'topic',
      });
      canvasId = canvas.id;
      const frames = readFileSync(join(sc.paths.orbHome, 'canvases', canvasId, 'board.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as BoardEvent)
        .flatMap((e) => (e.type === 'frame.added' ? [(e.data as { frame: Frame }).frame] : []));
      scripts.orb.push(
        {
          toolCalls: [
            {
              id: 'call_delegate_scout',
              name: 'delegate',
              arguments: { role: 'scout', frameIds: [frames[0]!.id], instruction: 'Find cell cost data.' },
            },
          ],
        },
        { text: 'Scout is on it.' },
      );
      scripts.scout.push({ text: 'Nothing to add yet.' });

      // A fresh canvas has spent nothing.
      expect(await wire.orb.cost.get(canvasId)).toMatchObject({ total: 0, usd: 0, routes: [] });

      await wire.orb.chat.send(canvasId, { text: 'Research the cost with Scout.' });
      first = await settledCost(wire, canvasId);

      const billed = providerUsage();
      expect([...billed.keys()].sort()).toEqual([MOCK_MODEL, MOCK_MODEL_ALT]);
      expect(first.tokens).toEqual(sum(billed));
      expect(first.total).toBe(
        first.tokens.uncachedInputTokens + first.tokens.outputTokens + first.tokens.cacheReadTokens,
      );
      expect(first.sessions).toBeGreaterThanOrEqual(2);
      // P6.8: the cache hit rate (cached input ÷ total input), per canvas and per agent, from the same usage.
      const hit = (who?: Who) => {
        let input = 0;
        let cached = 0;
        for (const req of llm.requests) {
          const r = reported.get(req.id);
          if (!r || !req.completed || (who && whoOf(req) !== who)) continue;
          input += r.input;
          cached += r.cacheRead;
        }
        return cached / input;
      };
      expect(first.cacheHitRate).toBeCloseTo(hit(), 10);
      expect(first.cacheHitRate).toBeGreaterThan(0);
      expect(first.agents?.map((a) => a.agent)).toEqual(['orb', 'scout']);
      for (const a of first.agents!) expect(a.cacheHitRate).toBeCloseTo(hit(a.agent as Who), 10);
      expect(first.agents!.reduce((n, a) => n + a.tokens.cacheReadTokens, 0)).toBe(first.tokens.cacheReadTokens);
      // Per route: Orb's model and Scout's model, each with exactly what the provider reported for it.
      expect(first.routes).toEqual([
        { provider: MOCK_PROVIDER, model: MOCK_MODEL, tokens: billed.get(MOCK_MODEL) },
        { provider: MOCK_PROVIDER, model: MOCK_MODEL_ALT, tokens: billed.get(MOCK_MODEL_ALT) },
      ]);
      // The mock routes are not in the pi-ai catalog: unpriced, no dollars invented.
      expect(first.usd).toBe(0);
      expect(first.unpriced).toEqual([
        `${MOCK_PROVIDER}/${MOCK_MODEL}`,
        `${MOCK_PROVIDER}/${MOCK_MODEL_ALT}`,
      ]);

      // Prices from Settings: dollars = tokens × prices, per route.
      const p1 = { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 };
      const p2 = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };
      await wire.orb.prices.set({ provider: MOCK_PROVIDER, model: MOCK_MODEL, rates: p1 });
      const table = await wire.orb.prices.set({ provider: MOCK_PROVIDER, model: MOCK_MODEL_ALT, rates: p2 });
      expect(table.prices.find((r) => r.key === `${MOCK_PROVIDER}/${MOCK_MODEL}`)).toMatchObject({
        source: 'user',
        rates: p1,
      });
      expect(table.prices.find((r) => r.key === 'openai/gpt-6-luna')).toMatchObject({
        source: 'catalog',
        rates: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
      });
      const priced = await wire.orb.cost.get(canvasId);
      const expected = costOf(billed.get(MOCK_MODEL)!, p1) + costOf(billed.get(MOCK_MODEL_ALT)!, p2);
      expect(priced.unpriced).toEqual([]);
      expect(priced.usd).toBeCloseTo(expected, 12);
      expect(priced.usd).toBeGreaterThan(0);
      first = priced;

      // The Home tile carries the same meter.
      const tile = (await wire.orb.canvas.list()).find((c) => c.id === canvasId);
      expect(tile?.cost).toEqual({ total: priced.total, usd: priced.usd, partial: false });

      // Bad arguments.
      const bad = await wire
        .call('orb', 'prices.set', { request: { provider: 'Not Valid', model: 'x', rates: null } })
        .catch((e: unknown) => e as { code?: string });
      expect((bad as { code?: string }).code).toBe('orb/invalid-args');
      const missing = await wire.orb.cost.get('no-such-canvas').catch((e: unknown) => e as { code?: string });
      expect((missing as { code?: string }).code).toBe('orb/not-found');
    } finally {
      wire.dispose();
      await sc.stop();
    }
  });

  it('a new sidecar reads the same meter from the stored sessions', async () => {
    const { sc, wire } = await boot();
    try {
      const again = await wire.orb.cost.get(canvasId);
      expect(again.tokens).toEqual(first.tokens);
      expect(again.usd).toBeCloseTo(first.usd, 12);
      expect(again.routes).toEqual(first.routes);
      const tile = (await wire.orb.canvas.list()).find((c) => c.id === canvasId);
      expect(tile?.cost?.total).toBe(first.total);
    } finally {
      wire.dispose();
      await sc.stop();
    }
  });
});
