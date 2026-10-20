/**
 * P6.8 (PLAN "Caching" 3): the per-canvas result cache of Parallel calls. `web_search` (Parallel mode),
 * `parallel_extract`, `web_answer`, `deep_research` and `find_entities` are keyed on their normalised input (and the
 * processor / effort / generator); a repeat call is answered from `assets/parallel/cache/` with `cached: true` and
 * `costUsd: 0`, and Parallel is not called again. `refresh: true` runs it again. Against the mock Parallel server.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AgentName, type Card } from '@orb/shared';
import { MOCK_PARALLEL_KEY, MockParallel } from '../../../scripts/testkit/mockParallel.js';
import { CanvasStore } from '../src/store.js';
import type { BoardToolExec } from '../src/tools.js';
import { ParallelService, type CredentialsLike } from '../src/parallel.js';
import { webSearch, type SourceToolDeps } from '../src/sources.js';
import { deepResearch, findEntities, parallelExtract, webAnswer } from '../src/parallelTools.js';

const SESSIONS: Record<AgentName, string> = { orb: 'orb-s', scout: 'scout-s', critic: 'critic-s', builder: 'builder-s' };

let mock: MockParallel;
let home: string;
let store: CanvasStore;
let canvasId: string;
let svc: ParallelService;
let keyed = true;

const as = (role: AgentName, signal = new AbortController().signal): BoardToolExec => ({
  callId: `call_${role}`,
  signal,
  agent: { id: SESSIONS[role], options: { provider: 'openai', model: 'gpt-6-luna' }, session: { header: { cwd: store.dirOf(canvasId) } } },
});

const credentials: CredentialsLike = {
  resolve: async () => (keyed ? { value: MOCK_PARALLEL_KEY } : undefined),
  describe: async () => ({ configured: keyed }),
};

const cards = async (type?: string): Promise<Card[]> =>
  Object.values((await store.board(canvasId)).current.cards).filter((c) => !type || c.type === type);
const makeSvc = (over: Partial<ConstructorParameters<typeof ParallelService>[1]> = {}) =>
  new ParallelService(store, { credentials, baseUrl: mock.baseURL, throttleMs: 0, pollMs: 5, longPollSeconds: 1, retryDelayMs: 1, ...over });
const ctx = () => ({ svc, store });

beforeAll(async () => {
  mock = await new MockParallel({ taskMs: 60, longPollCapMs: 80, findallStepMs: 10, groupRunMs: 20 }).start();
});
afterAll(() => mock.close());

beforeEach(async () => {
  keyed = true;
  home = mkdtempSync(join(tmpdir(), 'orb-parallel-'));
  store = new CanvasStore({ home, flushMs: 5, searchIndex: false });
  canvasId = (await store.create({ prompt: 'Parallel' })).id;
  await store.setRootSession(canvasId, SESSIONS.orb);
  for (const role of ['scout', 'critic', 'builder'] as const) await store.setChildAgent(canvasId, role, SESSIONS[role]);
  svc = makeSvc();
  mock.hold(false);
  mock.hangResponsesCalls(false);
});
afterEach(async () => {
  svc.dispose();
  await store.close();
  rmSync(home, { recursive: true, force: true });
});


const requestsTo = (path: string) => mock.count('POST', path);
const cacheDir = () => join(store.dirOf(canvasId), 'assets', 'parallel', 'cache');

describe('web_answer is cached per canvas', () => {
  it('a repeat call is free and says so; normalised input hits, a different effort or question misses; refresh runs it again', async () => {
    const first: any = await webAnswer(ctx(), { question: 'How big is the market?' }, as('scout'));
    expect(first.cached).toBeUndefined();
    expect(first.costUsd).toBeCloseTo(0.01);
    expect(requestsTo('/v1/responses')).toBe(1);

    // the same question, spaced and cased differently, by another agent (the cache is the canvas's)
    const again: any = await webAnswer(ctx(), { question: '  how big   is the MARKET? ' }, as('scout'));
    expect(again).toMatchObject({ cached: true, costUsd: 0, answer: first.answer });
    expect(again.note).toMatch(/nothing was spent/);
    expect(requestsTo('/v1/responses')).toBe(1);

    // a different effort is a different request; a different question too
    const high: any = await webAnswer(ctx(), { question: 'How big is the market?', effort: 'high' }, as('scout'));
    expect(high.cached).toBeUndefined();
    expect(requestsTo('/v1/responses')).toBe(2);
    await webAnswer(ctx(), { question: 'Another question' }, as('scout'));
    expect(requestsTo('/v1/responses')).toBe(3);

    // `refresh` asks again, and the entry is replaced
    const fresh: any = await webAnswer(ctx(), { question: 'How big is the market?', refresh: true }, as('scout'));
    expect(fresh.cached).toBeUndefined();
    expect(fresh.costUsd).toBeCloseTo(0.01);
    expect(requestsTo('/v1/responses')).toBe(4);
    expect(((await webAnswer(ctx(), { question: 'How big is the market?' }, as('scout'))) as any).cached).toBe(true);
    expect(requestsTo('/v1/responses')).toBe(4);
  });

  it('is stored in the canvas folder by orb-canvas, survives a reopen, and is per canvas', async () => {
    await webAnswer(ctx(), { question: 'Persisted?' }, as('scout'));
    expect(readdirSync(cacheDir()).filter((f) => f.endsWith('.json'))).toHaveLength(1);
    expect(readdirSync(cacheDir()).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    const entry = JSON.parse(readFileSync(join(cacheDir(), readdirSync(cacheDir())[0]!), 'utf8'));
    expect(entry).toMatchObject({ tool: 'web_answer', value: { configured: true } });
    // no key in the saved entry
    expect(JSON.stringify(entry)).not.toContain(MOCK_PARALLEL_KEY);

    svc.dispose();
    await store.close();
    store = new CanvasStore({ home, flushMs: 5, searchIndex: false });
    svc = makeSvc();
    const before = requestsTo('/v1/responses');
    expect(((await webAnswer(ctx(), { question: 'persisted?' }, as('scout'))) as any).cached).toBe(true);
    expect(requestsTo('/v1/responses')).toBe(before);

    // another canvas does not share it
    const other = (await store.create({ prompt: 'Other' })).id;
    await store.setRootSession(other, 'orb-other');
    const exec: BoardToolExec = {
      callId: 'x',
      signal: new AbortController().signal,
      agent: { id: 'orb-other', options: { provider: 'openai', model: 'm' }, session: { header: { cwd: store.dirOf(other) } } },
    };
    expect(((await webAnswer(ctx(), { question: 'Persisted?' }, exec)) as any).cached).toBeUndefined();
    expect(requestsTo('/v1/responses')).toBe(before + 1);
  });

  it('an error is not cached', async () => {
    mock.failNext('POST', '/v1/responses', 402);
    await expect(webAnswer(ctx(), { question: 'q-err' }, as('scout'))).rejects.toThrow(/no credit/);
    const ok: any = await webAnswer(ctx(), { question: 'q-err' }, as('scout'));
    expect(ok.cached).toBeUndefined();
    expect(ok.answer).toBeTruthy();
  });
});

describe('web_search (Parallel) and parallel_extract are cached', () => {
  const deps = (): SourceToolDeps => ({
    web: { search: async () => ({ sources: [], truncated: false }) },
    search: { current: () => 'parallel', refresh: async () => {}, label: () => 'Parallel', parallel: svc.client },
    fetch: {},
    capture: { available: false } as never,
    now: () => 1,
  });

  it('web_search: the same search is free the second time; other options or refresh search again', async () => {
    const a = await webSearch(store, deps(), { query: 'iea ev outlook', objective: 'Find it', include_domains: ['b.org', 'a.org'] }, as('scout'));
    expect(a.cached).toBeUndefined();
    expect(requestsTo('/v1/search')).toBe(1);
    const b = await webSearch(store, deps(), { query: ' IEA EV outlook', objective: 'find it', include_domains: ['a.org', 'b.org'] }, as('scout'));
    expect(b).toMatchObject({ cached: true, costUsd: 0 });
    expect(b.results).toEqual(a.results);
    expect(requestsTo('/v1/search')).toBe(1);
    await webSearch(store, deps(), { query: 'iea ev outlook', objective: 'Find it', depth: 'advanced', include_domains: ['b.org', 'a.org'] }, as('scout'));
    expect(requestsTo('/v1/search')).toBe(2);
    const c = await webSearch(store, deps(), { query: 'iea ev outlook', objective: 'Find it', include_domains: ['b.org', 'a.org'], refresh: true }, as('scout'));
    expect(c.cached).toBeUndefined();
    expect(requestsTo('/v1/search')).toBe(3);
  });

  it('parallel_extract: the same pages and objective are free the second time', async () => {
    const a: any = await parallelExtract(ctx(), { urls: ['https://a.com/ok', 'https://b.com/ok'], objective: 'pricing' }, as('scout'));
    expect(requestsTo('/v1/extract')).toBe(1);
    const b: any = await parallelExtract(ctx(), { urls: ['https://b.com/ok', 'https://a.com/ok'], objective: 'Pricing' }, as('scout'));
    expect(b).toMatchObject({ cached: true, costUsd: 0 });
    expect(b.results).toEqual(a.results);
    expect(requestsTo('/v1/extract')).toBe(1);
    await parallelExtract(ctx(), { urls: ['https://a.com/ok', 'https://b.com/ok'], objective: 'pricing', refresh: true }, as('scout'));
    expect(requestsTo('/v1/extract')).toBe(2);
  });
});

describe('deep_research and find_entities are cached once they finish', () => {
  it('deep_research: the second call returns the saved result and the same card, starts no run, spends nothing', async () => {
    const first: any = await deepResearch(ctx(), { input: 'The EV charging market in Europe', processor: 'pro' }, as('scout'));
    expect(first.status).toBe('completed');
    const runs = requestsTo('/v1/tasks/runs');
    const cardsBefore = (await cards()).length;
    const again: any = await deepResearch(ctx(), { input: '  the ev charging market in europe ', processor: 'pro', title: 'A different title', wait: false }, as('orb'));
    expect(again).toMatchObject({ cached: true, costUsd: 0, estCostUsd: 0, status: 'completed', runId: first.runId, cardId: first.cardId });
    expect(again.result).toBe(first.result);
    expect(requestsTo('/v1/tasks/runs')).toBe(runs);
    expect((await cards()).length).toBe(cardsBefore);
    // another processor is another research
    const core: any = await deepResearch(ctx(), { input: 'The EV charging market in Europe', processor: 'core' }, as('scout'));
    expect(core.cached).toBeUndefined();
    expect(core.runId).not.toBe(first.runId);
    // refresh runs it again (a new run and card)
    const fresh: any = await deepResearch(ctx(), { input: 'The EV charging market in Europe', processor: 'pro', refresh: true }, as('scout'));
    expect(fresh.cached).toBeUndefined();
    expect(fresh.runId).not.toBe(first.runId);
  });

  it('a run still going is not cached', async () => {
    mock.hold(true);
    const started: any = await deepResearch(ctx(), { input: 'Slow topic', wait: false }, as('scout'));
    expect(started.status).toBe('running');
    const runs = requestsTo('/v1/tasks/runs');
    const second: any = await deepResearch(ctx(), { input: 'Slow topic', wait: false }, as('scout'));
    expect(second.cached).toBeUndefined();
    expect(requestsTo('/v1/tasks/runs')).toBe(runs + 1);
    mock.hold(false);
    mock.release();
  });

  it('find_entities: the same search is not run twice', async () => {
    const first: any = await findEntities(ctx(), { objective: 'Find companies that sell solid-state batteries', match_conditions: [{ name: 'sells', description: 'Sells solid-state batteries' }] }, as('scout'));
    expect(first.status).toBe('completed');
    const runs = requestsTo('/v1/findall');
    const again: any = await findEntities(ctx(), { objective: 'find companies that sell solid-state batteries', match_conditions: [{ name: 'sells', description: 'sells solid-state batteries' }] }, as('scout'));
    expect(again).toMatchObject({ cached: true, costUsd: 0, estCostUsd: 0, findallId: first.findallId, databaseCardId: first.databaseCardId });
    expect(requestsTo('/v1/findall')).toBe(runs);
  });
});
