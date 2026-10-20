/**
 * P4.3 unit tests: the per-route usage fold (costFold.ts, the harness tokenUsage fold split by route) and the
 * `orbCost` service over a stand-in `sessionQuery`: which sessions belong to a canvas, Σ tokens × prices, catalog
 * seeding, user prices kept, reset to the catalog. The real harness wiring is apps/ui/test/cost.contract.test.ts.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CanvasStore } from '@orb/canvas';
import { costOf, totalTokens, type TokenBuckets } from '@orb/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { foldRouteUsage } from '../src/costFold.js';
import { catalogRates, OrbCost, type SessionQueryLike } from '../src/cost.js';

type Ev = { type: string; data: any };
const header = (provider: string, model: string): Ev => ({
  type: 'request/header',
  data: { header: { config: { provider, model } }, reason: 'initial' },
});
const message = (turn: number, step: number, input: number, output: number, cacheRead = 0): Ev => ({
  type: 'assistant/message',
  data: { turn, step, usage: { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead } },
});
const attempt = (turn: number, step: number, input: number, output: number): Ev => ({
  type: 'assistant/attempt',
  data: {
    turn,
    step,
    stream: [
      { type: 'chunk', chunk: { type: 'usage', usage: { inputTokens: input, outputTokens: output } } },
    ],
  },
});
const b = (i: number, o: number, r = 0, w = 0): TokenBuckets => ({
  uncachedInputTokens: i,
  outputTokens: o,
  cacheReadTokens: r,
  cacheWriteTokens: w,
});

describe('per-route usage fold', () => {
  it('attributes each sample to the route of the request that produced it', () => {
    const { byRoute } = foldRouteUsage([
      header('openai', 'gpt-6-luna'),
      message(1, 1, 100, 20, 50),
      message(1, 2, 120, 30),
      { type: 'request/context', data: { provider: 'orb-mock', model: 'mock-1' } },
      message(2, 1, 10, 5),
    ]);
    expect(byRoute).toEqual({ 'openai/gpt-6-luna': b(220, 50, 50), 'orb-mock/mock-1': b(10, 5) });
  });

  it('a second sample of the same step replaces the first; a retry adds', () => {
    const { byRoute } = foldRouteUsage([
      header('openai', 'gpt-6-luna'),
      attempt(1, 1, 100, 10),
      message(1, 1, 100, 12), // replaces the attempt's sample
      { type: 'llm/retry-started', data: { turn: 1, step: 2 } },
      attempt(1, 2, 50, 0),
      { type: 'llm/retry-started', data: { turn: 1, step: 2 } },
      message(1, 2, 60, 7), // the retried attempt adds
      message(1, 2, 60, 7), // the same sample again: no change
    ]);
    expect(byRoute).toEqual({ 'openai/gpt-6-luna': b(210, 19) });
  });
});

describe('orbCost', () => {
  let home: string;
  let store: CanvasStore;
  let cost: OrbCost;
  const logs: Record<string, Ev[]> = {};
  const headers: Array<{ id: string; parentSession?: string; cwd?: string }> = [];
  let observed = 0;

  const query: SessionQueryLike = {
    async listSessions() {
      return headers.map((header) => ({ header }));
    },
    async observeSession(id) {
      observed++;
      const events = logs[id];
      if (!events) throw Object.assign(new Error('not found'), { code: 'SESSION_QUERY_NOT_FOUND' });
      return { cursor: events.length - 1, events, [Symbol.dispose]: () => undefined };
    },
  };

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'orb-cost-'));
    store = new CanvasStore({ home });
    cost = new OrbCost({ orbCanvas: store, sessionQuery: query });
    await cost.ready;
  });
  afterAll(async () => {
    await store.close();
    rmSync(home, { recursive: true, force: true });
  });

  it('seeds the table from the pi-ai catalog (gpt-6-luna and every provider card model it knows)', async () => {
    const prices = (await store.settings.get()).prices;
    expect(catalogRates('openai', 'gpt-6-luna')).toEqual({
      input: 0.1,
      output: 0.5,
      cacheRead: 0.01,
      cacheWrite: 0.125,
    });
    expect(prices['openai/gpt-6-luna']).toEqual({
      input: 0.1,
      output: 0.5,
      cacheRead: 0.01,
      cacheWrite: 0.125,
      source: 'catalog',
    });
    expect(prices['anthropic/claude-haiku-4-5']?.source).toBe('catalog');
    expect(catalogRates('orb-mock', 'mock-1')).toBeUndefined();
    expect(catalogRates('openai', 'no-such-model')).toBeUndefined();
  });

  it('sums the root, its descendants and the canvas folder sessions, priced per route', async () => {
    const meta = await store.create({ prompt: 'Cost meter', template: 'topic' });
    await store.setRootSession(meta.id, 'orb-root');
    await store.setChildAgent(meta.id, 'scout', 'scout-2');
    const dir = join(home, 'canvases', meta.id);
    headers.push(
      { id: 'orb-root', cwd: dir },
      { id: 'scout-1', parentSession: 'orb-root' }, // an earlier Scout canvas.json forgot (stale id)
      { id: 'scout-2', parentSession: 'orb-root' },
      { id: 'helper', parentSession: 'scout-1' }, // a grandchild
      { id: 'elsewhere', cwd: join(home, 'canvases', 'other') },
    );
    logs['orb-root'] = [header('openai', 'gpt-6-luna'), message(1, 1, 1000, 200, 400)];
    logs['scout-1'] = [header('openai', 'gpt-6-luna'), message(1, 1, 500, 100)];
    logs['scout-2'] = [header('orb-mock', 'mock-1'), message(1, 1, 300, 30)];
    logs['helper'] = [header('openai', 'gpt-6-luna'), message(1, 1, 10, 1)];
    logs['elsewhere'] = [header('openai', 'gpt-6-luna'), message(1, 1, 99_999, 99_999)];

    expect((await cost.sessionsOf(meta.id)).sort()).toEqual(['helper', 'orb-root', 'scout-1', 'scout-2']);
    const c = await cost.get(meta.id);
    const luna = b(1510, 301, 400);
    expect(c.tokens).toEqual(b(1810, 331, 400));
    expect(c.total).toBe(totalTokens(c.tokens));
    expect(c.sessions).toBe(4);
    expect(c.unpriced).toEqual(['orb-mock/mock-1']);
    const lunaUsd = costOf(luna, { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 });
    expect(c.routes).toEqual([
      { provider: 'openai', model: 'gpt-6-luna', tokens: luna, usd: lunaUsd },
      { provider: 'orb-mock', model: 'mock-1', tokens: b(300, 30) },
    ]);
    expect(c.usd).toBeCloseTo((1510 * 0.1 + 301 * 0.5 + 400 * 0.01) / 1e6, 12);
    expect(await cost.tile(meta.id)).toEqual({ total: c.total, usd: c.usd, partial: true });

    // An unchanged log is not folded again; a new event is.
    logs['scout-2'] = [...logs['scout-2'], message(2, 1, 100, 10)];
    expect((await cost.get(meta.id)).tokens).toEqual(b(1910, 341, 400));

    // A user price for the custom route; it counts at once and is never re-seeded.
    await cost.set({
      provider: 'orb-mock',
      model: 'mock-1',
      rates: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
    });
    const priced = await cost.get(meta.id);
    expect(priced.unpriced).toEqual([]);
    expect(priced.usd).toBeCloseTo(lunaUsd + (400 * 1 + 40 * 2) / 1e6, 12);
    await cost.seed([{ provider: 'orb-mock', model: 'mock-1' }]);
    expect((await store.settings.get()).prices['orb-mock/mock-1']?.source).toBe('user');

    // Editing a catalog row makes it the user's; Reset goes back to the catalog price.
    let rows = await cost.set({
      provider: 'openai',
      model: 'gpt-6-luna',
      rates: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 },
    });
    expect(rows.find((r) => r.key === 'openai/gpt-6-luna')).toMatchObject({
      source: 'user',
      rates: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 },
      catalog: { input: 0.1, output: 0.5 },
    });
    await cost.seed([{ provider: 'openai', model: 'gpt-6-luna' }]);
    expect((await store.settings.get()).prices['openai/gpt-6-luna']?.source).toBe('user');
    rows = await cost.set({ provider: 'openai', model: 'gpt-6-luna', rates: null });
    expect(rows.find((r) => r.key === 'openai/gpt-6-luna')).toMatchObject({
      source: 'catalog',
      rates: { input: 0.1 },
    });
    // Removing a custom route's price leaves it unpriced again.
    rows = await cost.set({ provider: 'orb-mock', model: 'mock-1', rates: null });
    expect(rows.some((r) => r.key === 'orb-mock/mock-1')).toBe(false);
    expect((await cost.get(meta.id)).unpriced).toEqual(['orb-mock/mock-1']);
  });

  it('a route first seen in usage is seeded from the catalog; a canvas with no sessions reads zero', async () => {
    const meta = await store.create({ prompt: 'Haiku', template: 'topic' });
    await store.setRootSession(meta.id, 'orb-haiku');
    headers.push({ id: 'orb-haiku' });
    logs['orb-haiku'] = [header('anthropic', 'claude-opus-4-7'), message(1, 1, 1_000_000, 0)];
    const rates = catalogRates('anthropic', 'claude-opus-4-7');
    expect(rates).toBeDefined();
    expect((await store.settings.get()).prices['anthropic/claude-opus-4-7']).toBeUndefined();
    const c = await cost.get(meta.id);
    expect(c.usd).toBeCloseTo(rates!.input, 9);
    expect((await store.settings.get()).prices['anthropic/claude-opus-4-7']?.source).toBe('catalog');

    const empty = await store.create({ prompt: 'Empty', template: 'topic' });
    await store.setRootSession(empty.id, 'orb-never-saved');
    expect(await cost.get(empty.id)).toMatchObject({
      total: 0,
      usd: 0,
      unpriced: [],
      routes: [],
      sessions: 1,
    });
    expect(observed).toBeGreaterThan(0);
  });

  it('counts plan tokens without inventing an API dollar charge or asking for a price', async () => {
    const meta = await store.create({ prompt: 'Plan research', template: 'topic' });
    await store.setRootSession(meta.id, 'orb-plan');
    headers.push({ id: 'orb-plan' });
    logs['orb-plan'] = [header('chatgpt-plan', 'gpt-6-luna'), message(1, 1, 1000, 100)];
    const usage = await cost.get(meta.id);
    expect(usage).toMatchObject({
      total: 1100,
      usd: 0,
      unpriced: [],
      routes: [{ provider: 'chatgpt-plan', billing: 'chatgpt-plan', tokens: b(1000, 100) }],
    });
    expect(usage.routes[0]?.usd).toBeUndefined();
    expect(await cost.tile(meta.id)).toEqual({ total: 1100, usd: 0, partial: false, planOnly: true });
  });
});
