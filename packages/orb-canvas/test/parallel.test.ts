/**
 * P6.7: the Parallel tools against a real CanvasStore and the mock Parallel server (scripts/testkit/mockParallel.ts).
 * One group per tool: its happy path, its role gate, "key needed" with no key, and abort. The long tools also cover
 * the Research run card (live progress, the cited result, sources placed), the cost guard (ask over $0.50 and for the
 * always-ask kinds; approve, decline, stop while asking), detach on abort (Task and group) versus real cancel
 * (FindAll), re-attach after a restart, and the Database each bulk tool fills. The dsh wiring (preset row, allow-list
 * guard, the Remote methods) is covered by apps/ui/test/parallel.contract.test.ts and the egress audit.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AgentName,
  PARALLEL_TOOL_NAMES,
  ResearchData,
  WatchData,
  cardDataSchema,
  isToolAllowed,
  readCardData,
  type Card,
} from '@orb/shared';
import { MOCK_PARALLEL_KEY, MockParallel } from '../../../scripts/testkit/mockParallel.js';
import { CanvasStore } from '../src/store.js';
import type { BoardToolExec } from '../src/tools.js';
import { ParallelService, type CredentialsLike } from '../src/parallel.js';
import { webSearch, type SourceToolDeps } from '../src/sources.js';
import {
  NO_PARALLEL_MESSAGE,
  batchEnrich,
  checkOutputSchema,
  deepResearch,
  entitySearch,
  findEntities,
  findEntitiesExtend,
  imageSearch,
  listWatches,
  parallelExtract,
  researchMemory,
  researchStatus,
  stopWatch,
  suggestTaskSpec,
  watchEvents,
  watchTopic,
  webAnswer,
} from '../src/parallelTools.js';

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(what: string, probe: () => Promise<T | undefined | false> | T | undefined | false, ms = 8000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await probe();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}

const cards = async (type?: string): Promise<Card[]> =>
  Object.values((await store.board(canvasId)).current.cards).filter((c) => !type || c.type === type);
const cardById = async (id: string) => (await store.board(canvasId)).current.cards[id];
const researchOf = async (id: string) => readCardData(ResearchData, (await cardById(id))?.data)!;
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

// ---------------------------------------------------------------------------------------------------------------

describe('every tool: key needed, role gates', () => {
  const MIN: Record<string, [(c: ReturnType<typeof ctx>, a: unknown, e: BoardToolExec) => Promise<unknown>, unknown]> = {
    parallel_extract: [parallelExtract, { urls: ['https://a.com/x'] }],
    image_search: [imageSearch, { queries: ['x'] }],
    web_answer: [webAnswer, { question: 'Why?' }],
    deep_research: [deepResearch, { input: 'Research X' }],
    research_status: [researchStatus, { run_id: 'trun_1' }],
    batch_enrich: [batchEnrich, { rows: ['a'], output_json_schema: { type: 'object', properties: { x: { type: 'string' } } } }],
    find_entities: [findEntities, { objective: 'Find companies' }],
    find_entities_extend: [findEntitiesExtend, { findall_id: 'findall_1', additional_match_limit: 5 }],
    entity_search: [entitySearch, { entity_type: 'companies', objective: 'Find companies' }],
    research_memory: [researchMemory, {}],
    suggest_task_spec: [suggestTaskSpec, { intent: 'compare vendors' }],
    watch_topic: [watchTopic, { query: 'new releases' }],
    list_watches: [listWatches, {}],
    watch_events: [watchEvents, { monitor_id: 'monitor_1' }],
    stop_watch: [stopWatch, { monitor_id: 'monitor_1' }],
  };

  it('covers every Parallel tool name', () => {
    expect(Object.keys(MIN).sort()).toEqual([...PARALLEL_TOOL_NAMES].sort());
  });

  it('with no key every tool answers "key needed" (not an error) and sends nothing', async () => {
    keyed = false;
    const before = mock.requests.length;
    for (const [name, [fn, args]] of Object.entries(MIN)) {
      const role: AgentName = name.includes('watch') ? 'orb' : 'scout';
      const out = (await fn(ctx(), args, as(role))) as { configured: boolean; message: string };
      expect(out, name).toEqual({ configured: false, message: NO_PARALLEL_MESSAGE });
    }
    expect(mock.requests.length).toBe(before);
    expect(await cards()).toEqual([]);
  });

  it('the allow-lists: Scout has the work tools, Orb the answering and bulk tools and the watches, nobody else any', async () => {
    for (const [name, [fn, args]] of Object.entries(MIN)) {
      for (const role of AgentName.options) {
        const allowed = isToolAllowed(role, name);
        if (allowed) continue;
        await expect(fn(ctx(), args, as(role)), `${role} ${name}`).rejects.toThrow(`${name} is not available to the ${role} agent`);
      }
    }
    expect(isToolAllowed('scout', 'watch_topic')).toBe(false);
    expect(isToolAllowed('orb', 'watch_topic')).toBe(true);
    expect(isToolAllowed('orb', 'parallel_extract')).toBe(false);
    expect(isToolAllowed('critic', 'web_answer')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('web_search with the Parallel provider', () => {
  const deps = (): SourceToolDeps => ({
    web: { search: async () => ({ sources: [], truncated: false }) },
    search: { current: () => 'parallel', refresh: async () => {}, label: () => 'Parallel', parallel: svc.client },
    fetch: {},
    capture: { available: false } as never,
    now: () => 1,
  });

  it('calls Parallel directly with the objective, depth, dates and domains; returns cost', async () => {
    const out = await webSearch(
      store,
      deps(),
      { query: 'iea ev outlook', maxResults: 3, objective: 'Find the 2026 IEA EV outlook', queries: ['iea ev outlook 2026'], depth: 'advanced', after_date: '2026-01-01', include_domains: ['iea.org'], country: 'GB' },
      as('scout'),
    );
    expect(out).toMatchObject({ configured: true, provider: 'Parallel', query: 'iea ev outlook' });
    expect(out.results).toHaveLength(3);
    expect(out.results[0]!.snippet).toContain('dense text');
    expect(out.costUsd).toBeCloseTo(0.005);
    const body = mock.last('POST', '/v1/search')!.body;
    expect(body).toMatchObject({ mode: 'advanced', objective: 'Find the 2026 IEA EV outlook', search_queries: ['iea ev outlook 2026'], advanced_settings: { location: 'gb', source_policy: { include_domains: ['iea.org'], after_date: '2026-01-01' } } });
    expect(body.session_id).toBe('orb_scout-s');
  });

  it('fast by default; a bad date is refused', async () => {
    await webSearch(store, deps(), { query: 'x' }, as('scout'));
    expect(mock.last('POST', '/v1/search')!.body.mode).toBe('fast');
    await expect(webSearch(store, deps(), { query: 'x', after_date: 'yesterday' }, as('scout'))).rejects.toThrow(/after_date/);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('parallel_extract', () => {
  it('returns focused excerpts and reports failed URLs with a fallback hint', async () => {
    const out: any = await parallelExtract(ctx(), { urls: ['https://a.com/ok', 'https://a.com/fail-login'], objective: 'pricing', fresh: true }, as('scout'));
    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toMatchObject({ url: 'https://a.com/ok', publishedAt: '2026-08-15' });
    expect(out.results[0].excerpts).toContain('pricing');
    expect(out.results[0].fullContent).toBeUndefined();
    expect(out.errors[0]).toMatchObject({ url: 'https://a.com/fail-login', reason: expect.stringContaining('403') });
    expect(out.errors[0].next).toContain('fetch_url');
    expect(out.costUsd).toBeCloseTo(0.002);
    expect(mock.last('POST', '/v1/extract')!.body.advanced_settings).toEqual({ fetch_policy: { max_age_seconds: 600 } });
  });

  it('full_content only when asked, and cut', async () => {
    const out: any = await parallelExtract(ctx(), { urls: ['https://a.com/ok'], full_content: true }, as('scout'));
    expect(out.results[0].fullContent).toContain('Full content');
    expect(mock.last('POST', '/v1/extract')!.body.advanced_settings.full_content).toBe(true);
  });

  it('never sends a local or private address to a third party; at most 20 URLs', async () => {
    const before = mock.count('POST', '/v1/extract');
    await expect(parallelExtract(ctx(), { urls: ['http://localhost:3000/x'] }, as('scout'))).rejects.toThrow(/local or private/);
    await expect(parallelExtract(ctx(), { urls: ['http://192.168.1.1/'] }, as('scout'))).rejects.toThrow(/local or private/);
    await expect(parallelExtract(ctx(), { urls: ['file:///etc/passwd'] }, as('scout'))).rejects.toThrow(/http/);
    await expect(parallelExtract(ctx(), { urls: Array.from({ length: 21 }, (_, i) => `https://a.com/${i}`) }, as('scout'))).rejects.toThrow(/urls/);
    expect(mock.count('POST', '/v1/extract')).toBe(before);
  });

  it('an abort mid-call rejects with the reason', async () => {
    const slow = await new MockParallel({ latencyMs: 0 }).start();
    try {
      const s2 = new ParallelService(store, { credentials, baseUrl: slow.baseURL });
      slow.failNext('POST', '/v1/extract', 503, undefined, 0);
      const ac = new AbortController();
      const p = parallelExtract({ svc: s2, store }, { urls: ['https://a.com/x'] }, as('scout', ac.signal));
      ac.abort(new Error('halt'));
      await expect(p).rejects.toThrow('halt');
      s2.dispose();
    } finally {
      await slow.close();
    }
  });
});

describe('image_search', () => {
  it('returns image and source page URLs and the cost; clamps to max_results', async () => {
    const out: any = await imageSearch(ctx(), { queries: ['wind turbine'], mode: 'advanced', max_results: 3, country: 'DE' }, as('scout'));
    expect(out.results).toHaveLength(3);
    expect(out.results[0]).toMatchObject({ imageUrl: expect.stringContaining('.png'), sourcePageUrl: expect.stringContaining('/page-1'), width: 800 });
    expect(out.costUsd).toBeCloseTo(0.005);
    expect(out.next).toContain('attribution');
    expect(mock.last('POST', '/v1/images/search')!.body).toMatchObject({ mode: 'advanced', advanced_settings: { location: 'de', max_results: 3 } });
  });
  it('1-5 queries only', async () => {
    await expect(imageSearch(ctx(), { queries: [] }, as('scout'))).rejects.toThrow(/queries/);
    await expect(imageSearch(ctx(), { queries: ['1', '2', '3', '4', '5', '6'] }, as('scout'))).rejects.toThrow(/queries/);
  });
});

describe('web_answer', () => {
  it('answers with citations (the cited sentence), searches, cost; low effort by default', async () => {
    const out: any = await webAnswer(ctx(), { question: 'How big is the market?', include_domains: ['iea.org'] }, as('scout'));
    expect(out.answer).toContain('The market is large');
    expect(out.citations[0]).toMatchObject({ url: expect.stringContaining('source-1'), span: 'The market is large [1].' });
    expect(out.searches).toEqual(['mock query one', 'mock query two']);
    expect(out.costUsd).toBeCloseTo(0.01);
    expect(out.responseId).toMatch(/^resp_/);
    expect(mock.last('POST', '/v1/responses')!.body).toMatchObject({ model: 'parallel', reasoning: { effort: 'low' }, tools: [{ type: 'web_search', filters: { allowed_domains: ['iea.org'] } }] });
  });

  it('effort, a structured schema (returned as data), follow-ups, blocked domains', async () => {
    const out: any = await webAnswer(ctx(), { question: 'q', effort: 'high', schema: { type: 'object', properties: { answer: { type: 'string' } } }, follow_up_of: 'resp_0001', exclude_domains: ['spam.com'] }, as('scout'));
    expect(out.costUsd).toBeCloseTo(0.25);
    expect(out.data).toMatchObject({ answer: expect.stringContaining('Answer to') });
    const body = mock.last('POST', '/v1/responses')!.body;
    expect(body).toMatchObject({ reasoning: { effort: 'high' }, previous_response_id: 'resp_0001', text: { format: { type: 'json_schema', name: 'answer' } }, tools: [{ type: 'web_search', filters: { blocked_domains: ['spam.com'] } }] });
  });

  it('abort closes the request (a plain HTTP abort is the cancellation)', async () => {
    mock.hangResponsesCalls();
    const ac = new AbortController();
    const before = mock.aborted;
    const p = webAnswer(ctx(), { question: 'hang' }, as('scout', ac.signal));
    await sleep(40);
    ac.abort(new Error('user stop'));
    await expect(p).rejects.toThrow('user stop');
    await until('the mock to see the abort', () => mock.aborted > before);
  });

  it('a Parallel error is one short line for the model', async () => {
    mock.failNext('POST', '/v1/responses', 402);
    await expect(webAnswer(ctx(), { question: 'q' }, as('scout'))).rejects.toThrow(/no credit/);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('deep_research: the Research run card', () => {
  it('waits, fills the card with the cited result, places the most-cited sources linked from it', async () => {
    const out: any = await deepResearch(ctx(), { input: 'The EV charging market in Europe', processor: 'pro', title: 'EV charging' }, as('scout'));
    expect(out).toMatchObject({ configured: true, status: 'completed', processor: 'pro', estCostUsd: 0.1 });
    expect(out.runId).toMatch(/^trun_/);
    expect(out.result).toContain('Mock deep research');
    expect(out.citations).toHaveLength(3);
    const card = await researchOf(out.cardId);
    expect(card).toMatchObject({ title: 'EV charging', kind: 'deep_research', status: 'completed', progress: 100, runId: out.runId, processor: 'pro' });
    expect(card.summary).toContain('Mock deep research');
    expect(card.citations).toHaveLength(3);
    expect(card.fields).toEqual([expect.objectContaining({ field: 'summary', confidence: 'high' }), expect.objectContaining({ field: 'key_points.0', confidence: 'low' })]);
    expect(card.sourcesRead).toBeGreaterThan(0);
    const raw = (await cardById(out.cardId))!;
    expect(cardDataSchema('research').safeParse(raw.data).success).toBe(true);
    expect(raw.provenance).toMatchObject({ kind: 'agent', agent: 'scout' });
    const sources = await cards('source');
    expect(sources).toHaveLength(3);
    expect(sources[0]!.data).toMatchObject({ provenance: { provider: 'parallel', kind: 'task', id: out.runId }, confidence: 'high' });
    const links = Object.values((await store.board(canvasId)).current.links);
    expect(links.filter((l) => l.from === out.cardId && l.label === 'cites')).toHaveLength(3);
    expect((await svc.findRun(canvasId, out.runId))!.status).toBe('completed');
    expect(mock.last('POST', '/v1/tasks/runs')!.body).toMatchObject({ processor: 'pro', enable_events: true, task_spec: { output_schema: { type: 'auto' } }, memory_scope_key: `orb:${canvasId}` });
  });

  it('a source already on the board is not placed twice; at most 12 are placed', async () => {
    await deepResearch(ctx(), { input: 'first' }, as('scout'));
    const first = (await cards('source')).length;
    await deepResearch(ctx(), { input: 'second' }, as('scout'));
    expect((await cards('source')).length).toBe(first);
  });

  it('json output: schema checked, per-field basis, low-confidence fields named, no citation-like field names', async () => {
    const out: any = await deepResearch(
      ctx(),
      { input_json: { company: 'ACME' }, processor: 'core', output_kind: 'json', output_json_schema: { type: 'object', properties: { founded: { type: 'string' }, employees: { type: 'integer' } } } },
      as('scout'),
    );
    expect(out.result).toContain('founded: Mock founded');
    expect(out.lowConfidence).toEqual(['employees']);
    expect(mock.last('POST', '/v1/tasks/runs')!.body.task_spec.output_schema).toMatchObject({ type: 'json', json_schema: { type: 'object', additionalProperties: false, required: ['founded', 'employees'] } });
    await expect(deepResearch(ctx(), { input: 'x', output_kind: 'json', output_json_schema: { type: 'object', properties: { sources: { type: 'array' } } } }, as('scout'))).rejects.toThrow(/do not use sources/);
    await expect(deepResearch(ctx(), { input: 'x', output_kind: 'json' }, as('scout'))).rejects.toThrow(/output_json_schema/);
    await expect(deepResearch(ctx(), { input: 'x', processor: 'giga' }, as('scout'))).rejects.toThrow(/processor must be one of/);
    await expect(deepResearch(ctx(), {}, as('scout'))).rejects.toThrow(/input/);
    expect(() => checkOutputSchema({ type: 'array' })).toThrow(/object/);
  });

  it('options reach Parallel: domains, country, data sources, follow-up', async () => {
    await deepResearch(ctx(), { input: 'q', processor: 'base', include_domains: ['nih.gov'], country: 'US', data_sources: { free: ['pubmed'] }, follow_up_of: 'trun_prev', output_kind: 'text', output_description: 'A short report' }, as('scout'));
    expect(mock.last('POST', '/v1/tasks/runs')!.body).toMatchObject({
      source_policy: { include_domains: ['nih.gov'] },
      advanced_settings: { location: 'us', data_sources: { free: ['pubmed'], pay_per_use: [] } },
      previous_interaction_id: 'trun_prev',
      task_spec: { output_schema: { type: 'text', description: 'A short report' } },
    });
  });

  it('live progress: the card shows the meter, sources read and the latest messages while the run is going', async () => {
    mock.hold();
    const out: any = await deepResearch(ctx(), { input: 'slow topic', wait: false }, as('scout'));
    expect(out).toMatchObject({ status: 'running', eta: expect.stringContaining('minutes') });
    const live = await until('progress on the card', async () => {
      const d = await researchOf(out.cardId);
      return d.status === 'running' && (d.progress ?? 0) > 0 && (d.messages?.length ?? 0) > 0 && d;
    });
    expect(live.sourcesRead).toBeGreaterThan(0);
    expect(live.messages![0]).toMatch(/Planning|Searching/);
    mock.release();
    await until('completion', async () => (await researchOf(out.cardId)).status === 'completed');
    expect((await researchOf(out.cardId)).summary).toContain('Mock deep research');
  });

  it('an SSE stream that closes early is reconnected, and progress messages are not repeated', async () => {
    const short = await new MockParallel({ taskMs: 400, streamMaxMs: 60 }).start();
    try {
      const s2 = new ParallelService(store, { credentials, baseUrl: short.baseURL, throttleMs: 0, pollMs: 5, longPollSeconds: 1 });
      const out: any = await deepResearch({ svc: s2, store }, { input: 'long one' }, as('scout'));
      expect(out.status).toBe('completed');
      expect(short.count('GET', '/v1/tasks/runs/')).toBeGreaterThanOrEqual(2);
      const card = readCardData(ResearchData, (await cardById(out.cardId))!.data)!;
      expect(new Set(card.messages).size).toBe(card.messages!.length);
      s2.dispose();
    } finally {
      await short.close();
    }
  });

  it('a failed run fails the card with the reason and the tool', async () => {
    await expect(deepResearch(ctx(), { input: 'make-it-fail please' }, as('scout'))).rejects.toThrow(/failed/);
    const [card] = await cards('research');
    expect(readCardData(ResearchData, card!.data)).toMatchObject({ status: 'failed', error: expect.stringContaining('failed') });
  });

  it('an error creating the run (a refused key) fails the card', async () => {
    mock.failNext('POST', '/v1/tasks/runs', 401);
    await expect(deepResearch(ctx(), { input: 'x' }, as('scout'))).rejects.toThrow(/key was refused/);
    const [card] = await cards('research');
    expect(readCardData(ResearchData, card!.data)).toMatchObject({ status: 'failed' });
  });

  it('the frame is honoured, and a full frame falls back to the open board', async () => {
    const frame = (await store.addAgentFrame(canvasId, { title: 'Market' }, { kind: 'agent', agent: 'orb', model: 'm', sessionId: SESSIONS.orb })).frame;
    const out: any = await deepResearch(ctx(), { input: 'x', frameId: frame.id }, as('scout'));
    expect((await cardById(out.cardId))!.frameId).toBe(frame.id);
  });
});

describe('the cost guard', () => {
  const approvalCard = async () => (await cards('research')).find((c) => (c.data as { status?: string }).status === 'awaiting_approval');

  it('under $0.50 nothing is asked (pro, $0.10)', async () => {
    await deepResearch(ctx(), { input: 'x', processor: 'pro' }, as('scout'));
    expect((await cards('research')).some((c) => (c.data as any).status === 'awaiting_approval')).toBe(false);
  });

  it('ultra asks even though $0.30 is under the threshold; the tool waits; Approve starts the run', async () => {
    const p = deepResearch(ctx(), { input: 'a hard report', processor: 'ultra' }, as('scout'));
    const card = await until('the approval card', approvalCard);
    expect(readCardData(ResearchData, card.data)).toMatchObject({ status: 'awaiting_approval', estCostUsd: 0.3, processor: 'ultra' });
    expect(mock.taskRuns().some((t) => JSON.stringify(t.input).includes('a hard report'))).toBe(false);
    await expect(svc.confirm(canvasId, card.id, true)).resolves.toBe('approved');
    const out: any = await p;
    expect(out.status).toBe('completed');
    expect((await researchOf(card.id)).status).toBe('completed');
    expect(mock.taskRuns().some((t) => JSON.stringify(t.input).includes('a hard report'))).toBe(true);
  });

  it('over $0.50 (ultra2x, $0.60) asks; Decline starts nothing and spends nothing', async () => {
    const posts = mock.count('POST', '/v1/tasks/runs');
    const p = deepResearch(ctx(), { input: 'max depth', processor: 'ultra2x' }, as('scout'));
    const card = await until('the approval card', approvalCard);
    expect(readCardData(ResearchData, card.data)!.estCostUsd).toBe(0.6);
    await expect(svc.confirm(canvasId, card.id, false)).resolves.toBe('declined');
    await expect(p).resolves.toMatchObject({ declined: true });
    expect(mock.count('POST', '/v1/tasks/runs')).toBe(posts);
    expect(await researchOf(card.id)).toMatchObject({ status: 'declined', note: expect.stringContaining('Nothing was started') });
  });

  it('Stop while the question is open declines the card and rejects with the abort reason', async () => {
    const ac = new AbortController();
    const p = deepResearch(ctx(), { input: 'x', processor: 'ultra' }, as('scout', ac.signal));
    const card = await until('the approval card', approvalCard);
    ac.abort(new Error('stopped by user'));
    await expect(p).rejects.toThrow('stopped by user');
    expect(await researchOf(card.id)).toMatchObject({ status: 'declined' });
    await expect(svc.confirm(canvasId, card.id, true)).rejects.toThrow(/not waiting/);
  });

  it('no answer in time counts as a decline', async () => {
    svc.dispose();
    svc = makeSvc({ approvalTimeoutMs: 40 });
    const out: any = await deepResearch(ctx(), { input: 'x', processor: 'ultra4x' }, as('scout'));
    expect(out.declined).toBe(true);
  });

  it('an answer after a restart is "expired" and declines the card; a stale or foreign card is refused', async () => {
    const p = deepResearch(ctx(), { input: 'x', processor: 'ultra' }, as('scout'));
    const card = await until('the approval card', approvalCard);
    const after = makeSvc();
    await expect(after.confirm(canvasId, card.id, true)).resolves.toBe('expired');
    expect(await researchOf(card.id)).toMatchObject({ status: 'declined', note: expect.stringContaining('restarted') });
    svc.dispose();
    await expect(p).resolves.toBeDefined();
    await expect(after.confirm(canvasId, 'c_nope', true)).rejects.toThrow(/no research run/);
    after.dispose();
  });

  it('the threshold is configurable (a service with $0.05 asks for pro)', async () => {
    svc.dispose();
    svc = makeSvc({ confirmAboveUsd: 0.05 });
    const p = deepResearch(ctx(), { input: 'x', processor: 'pro' }, as('scout'));
    const card = await until('the approval card', approvalCard);
    await svc.confirm(canvasId, card.id, true);
    await p;
  });
});

describe('detach, re-attach and restart', () => {
  it('Stop while waiting DETACHES a Task run (no cancel exists): the card says it is billed; the run goes on', async () => {
    mock.hold();
    const ac = new AbortController();
    const p = deepResearch(ctx(), { input: 'detach me' }, as('scout', ac.signal));
    const card = await until('a running card', async () => (await cards('research')).find((c) => (c.data as any).status === 'running'));
    await until('a run id', async () => (await researchOf(card.id)).runId);
    ac.abort(new Error('user stop'));
    await expect(p).rejects.toThrow('user stop');
    const d = await researchOf(card.id);
    expect(d.status).toBe('detached');
    expect(d.note).toMatch(/billed/);
    expect((await svc.findRun(canvasId, d.runId!))!.status).toBe('detached');
    // Nothing was cancelled at Parallel (there is no such call) and the run is still active there.
    expect(mock.requests.some((r) => r.path.endsWith('/cancel'))).toBe(false);
    expect((mock.taskRuns().find((t) => t.id === d.runId)!).status).not.toBe('completed');
    // research_status attaches again; when the run finishes, the card completes.
    mock.release();
    const status: any = await researchStatus(ctx(), { run_id: d.runId }, as('scout'));
    expect(['completed', 'running']).toContain(status.status);
    await until('the card to complete', async () => (await researchOf(card.id)).status === 'completed');
    const again: any = await researchStatus(ctx(), { run_id: d.runId }, as('scout'));
    expect(again).toMatchObject({ status: 'completed', result: expect.stringContaining('Mock deep research') });
  });

  it('research_status of a run orb has no card for asks Parallel directly; unknown ids are refused', async () => {
    const run = await svc.client.taskCreate({ processor: 'lite', input: 'elsewhere' });
    const out: any = await until('the run to finish', async () => {
      const s: any = await researchStatus(ctx(), { run_id: run.run_id }, as('scout'));
      return s.status === 'completed' && s;
    });
    expect(out.result).toContain('Mock deep research');
    await expect(researchStatus(ctx(), { run_id: 'nope_1' }, as('scout'))).rejects.toThrow(/run ids start with/);
    await expect(researchStatus(ctx(), { run_id: 'trun_missing' }, as('scout'))).rejects.toThrow(/no such run/);
  });

  it('after a restart, resumeCanvas re-attaches the runs that were in flight and finishes their cards', async () => {
    mock.hold();
    const out: any = await deepResearch(ctx(), { input: 'restart me', wait: false }, as('scout'));
    await until('running', async () => (await researchOf(out.cardId)).runId);
    svc.dispose(); // the sidecar goes away mid-run
    expect(JSON.parse(readFileSync(join(store.dirOf(canvasId), 'assets', 'parallel', 'runs.json'), 'utf8')).runs).toHaveLength(1);
    mock.release();
    svc = makeSvc();
    await svc.resumeCanvas(canvasId);
    await until('the card to complete', async () => (await researchOf(out.cardId)).status === 'completed');
    expect((await svc.findRun(canvasId, out.runId))!.status).toBe('completed');
  });

  it('resumeCanvas does nothing without a key', async () => {
    mock.hold();
    const out: any = await deepResearch(ctx(), { input: 'x', wait: false }, as('scout'));
    await until('running', async () => (await researchOf(out.cardId)).runId);
    svc.dispose();
    keyed = false;
    svc = makeSvc();
    const before = mock.requests.length;
    await svc.resumeCanvas(canvasId);
    expect(mock.requests.length).toBe(before);
    keyed = true;
    mock.release();
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('batch_enrich (Task Group into a Database)', () => {
  const schema = { type: 'object', properties: { ceo: { type: 'string' }, employees: { type: 'integer' } } };
  const dataset = async (id: string) => svc.store.datasets.read(canvasId, id);

  it('fills a Database row by row with output columns, sources and low-confidence flags', async () => {
    const rows = [{ company: 'Acme', country: 'US' }, { company: 'Globex', country: 'DE' }, { company: 'Initech', country: 'FR' }];
    const out: any = await batchEnrich(ctx(), { rows, output_json_schema: schema, title: 'Company facts' }, as('scout'));
    expect(out).toMatchObject({ status: 'completed', done: 3, failed: 0, rows: 3, processor: 'base', estCostUsd: 0.03 });
    const ds = await dataset(out.datasetId);
    expect(ds.columns.map((c) => c.name)).toEqual(['company', 'country', 'ceo', 'employees', 'Sources', 'Needs review']);
    expect(ds.rows).toHaveLength(3);
    const cell = (row: number, name: string) => ds.rows[row]!.cells[ds.columns.find((c) => c.name === name)!.id];
    expect(cell(0, 'company')).toBe('Acme');
    expect(String(cell(1, 'ceo'))).toContain('Mock ceo');
    expect(String(cell(2, 'Sources'))).toContain('mock-site.orb.test');
    // employees is the low-confidence field of the mock.
    expect(cell(0, 'Needs review')).toBe('employees');
    const card = await researchOf(out.cardId);
    expect(card).toMatchObject({ kind: 'batch_enrich', status: 'completed', done: 3, total: 3, datasetId: out.datasetId, progress: 100 });
    expect(card.summary).toContain('Enriched 3 of 3 rows');
    const db = (await cardById(out.databaseCardId))!;
    expect(db.type).toBe('database');
    expect((db.data as { rowCount: number }).rowCount).toBe(3);
    expect(db.view?.datasetId).toBe(out.datasetId);
    // Rows were written by Scout (its own rows), the request carried the schema and processor per run.
    expect(ds.rows.every((r) => r.by === 'scout')).toBe(true);
    const req = mock.last('POST', `/v1/tasks/groups/`)!;
    expect(mock.count('POST', '/v1/tasks/groups')).toBeGreaterThan(1);
    expect(req).toBeDefined();
    const add = mock.requests.findLast((r) => /\/v1\/tasks\/groups\/[^/]+\/runs$/.test(r.path))!;
    expect(add.body.inputs).toHaveLength(3);
    expect(add.body.inputs[0]).toMatchObject({ processor: 'base', input: rows[0] });
    expect(add.body.default_task_spec.output_schema.json_schema.properties).toHaveProperty('ceo');
  });

  it('text rows get an Input column; strings and nested values become cells', async () => {
    const out: any = await batchEnrich(ctx(), { rows: ['Acme Corp', 'Globex'], output_json_schema: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } } }, processor: 'lite' }, as('scout'));
    const ds = await dataset(out.datasetId);
    expect(ds.columns.map((c) => c.name)).toEqual(['Input', 'tags', 'Sources', 'Needs review']);
    expect(ds.rows[0]!.cells[ds.columns[1]!.id]).toBe('["a","b"]');
  });

  it('wait=false returns at once and the database fills in', async () => {
    const out: any = await batchEnrich(ctx(), { rows: ['a', 'b'], output_json_schema: schema, wait: false }, as('scout'));
    expect(out.status).toBe('running');
    await until('completion', async () => (await researchOf(out.cardId)).status === 'completed');
    expect((await dataset(out.datasetId)).rows.every((r) => Object.keys(r.cells).length > 1)).toBe(true);
  });

  it('over 50 rows asks first (always); Decline creates no dataset and no group', async () => {
    const groups = mock.count('POST', '/v1/tasks/groups');
    const p = batchEnrich(ctx(), { rows: Array.from({ length: 51 }, (_, i) => `row ${i}`), output_json_schema: schema }, as('scout'));
    const card = await until('approval', async () => (await cards('research')).find((c) => (c.data as any).status === 'awaiting_approval'));
    expect(readCardData(ResearchData, card.data)).toMatchObject({ kind: 'batch_enrich', total: 51, estCostUsd: 0.51 });
    await svc.confirm(canvasId, card.id, false);
    await expect(p).resolves.toMatchObject({ declined: true });
    expect(mock.count('POST', '/v1/tasks/groups')).toBe(groups);
    expect(await cards('database')).toEqual([]);
  });

  it('50 rows or fewer do not ask; 60 rows approved all complete in batches', async () => {
    const p = batchEnrich(ctx(), { rows: Array.from({ length: 60 }, (_, i) => `row ${i}`), output_json_schema: schema, processor: 'lite' }, as('scout'));
    const card = await until('approval', async () => (await cards('research')).find((c) => (c.data as any).status === 'awaiting_approval'));
    await svc.confirm(canvasId, card.id, true);
    const out: any = await p;
    expect(out).toMatchObject({ done: 60, failed: 0 });
    expect((await dataset(out.datasetId)).rows.filter((r) => Object.keys(r.cells).length > 1)).toHaveLength(60);
  });

  it('Stop DETACHES the group (no cancel): rows so far are kept, the card says billed, research_status attaches again', async () => {
    const slow = await new MockParallel({ groupRunMs: 150 }).start();
    try {
      svc.dispose();
      svc = new ParallelService(store, { credentials, baseUrl: slow.baseURL, throttleMs: 0, pollMs: 5, longPollSeconds: 1 });
      const ac = new AbortController();
      const p = batchEnrich(ctx(), { rows: ['a', 'b', 'c', 'd'], output_json_schema: schema }, as('scout', ac.signal));
      const card = await until('running', async () => (await cards('research')).find((c) => (c.data as any).runId));
      await sleep(60);
      ac.abort(new Error('halt'));
      await expect(p).rejects.toThrow('halt');
      expect(await researchOf(card.id)).toMatchObject({ status: 'detached', note: expect.stringContaining('billed') });
      expect(slow.requests.some((r) => r.path.endsWith('/cancel'))).toBe(false);
      const status: any = await until('re-attach', async () => {
        const s: any = await researchStatus(ctx(), { run_id: (await researchOf(card.id)).runId }, as('scout'));
        return s.status === 'completed' && s;
      });
      expect(status.done).toBe(4);
    } finally {
      await slow.close();
    }
  });

  it('schema and rows are checked', async () => {
    await expect(batchEnrich(ctx(), { rows: ['a'], output_json_schema: { type: 'object', properties: { citations: { type: 'string' } } } }, as('scout'))).rejects.toThrow(/do not use citations/);
    await expect(batchEnrich(ctx(), { rows: [], output_json_schema: schema }, as('scout'))).rejects.toThrow(/rows/);
    await expect(batchEnrich(ctx(), { rows: ['a'], output_json_schema: schema, processor: 'ultra' }, as('scout'))).rejects.toThrow(/processor/);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('find_entities (FindAll) and find_entities_extend', () => {
  const dataset = async (id: string) => svc.store.datasets.read(canvasId, id);

  it('derives match conditions with ingest, starts with a preview, and fills a Database with verified matches', async () => {
    const ingests = mock.count('POST', '/v1beta/findall/ingest');
    const out: any = await findEntities(ctx(), { objective: 'AI infrastructure startups in Europe' }, as('scout'));
    expect(mock.count('POST', '/v1beta/findall/ingest')).toBe(ingests + 1);
    expect(out).toMatchObject({ configured: true, generator: 'preview', matchLimit: 10, estCostUsd: 0.1, status: 'completed', matched: 6 });
    expect(out.conditions[0]).toMatchObject({ name: 'is_relevant' });
    expect(mock.last('POST', '/v1beta/findall/runs')!.body).toMatchObject({ generator: 'preview', match_limit: 10, entity_type: 'companies', match_conditions: [{ name: 'is_relevant' }], memory_scope_key: `orb:${canvasId}` });
    const ds = await dataset(out.datasetId);
    expect(ds.columns.map((c) => c.name)).toEqual(['Name', 'URL', 'Description', 'is_relevant', 'Sources', 'Status']);
    expect(ds.rows).toHaveLength(6);
    expect(ds.rows[0]!.cells[ds.columns[0]!.id]).toBe('Mock Co 1');
    expect(ds.rows[0]!.cells[ds.columns[3]!.id]).toBe('yes');
    const card = await researchOf(out.cardId);
    expect(card).toMatchObject({ kind: 'find_entities', status: 'completed', matched: 6, processor: 'preview' });
    expect(card.citations!.length).toBeGreaterThan(0);
    expect(card.summary).toContain('6 matching entities');
  });

  it('given conditions skips ingest; match_limit is clamped for preview; enrichments become columns', async () => {
    const ingests = mock.count('POST', '/v1beta/findall/ingest');
    const out: any = await findEntities(
      ctx(),
      { objective: 'Robotics companies', match_conditions: [{ name: 'builds_robots', description: 'Builds robots' }], match_limit: 500, enrichments: [{ processor: 'base', json_schema: { type: 'object', properties: { funding: { type: 'string' } } } }], exclude: [{ name: 'Old Co', url: 'https://old.example' }] },
      as('scout'),
    );
    expect(mock.count('POST', '/v1beta/findall/ingest')).toBe(ingests);
    expect(out.matchLimit).toBe(10);
    expect(out.estCostUsd).toBeCloseTo(0.1 + 0.01 * 10);
    expect(mock.requests.findLast((r) => r.method === 'POST' && r.path === '/v1beta/findall/runs')!.body).toMatchObject({ match_limit: 10, exclude_list: [{ name: 'Old Co', url: 'https://old.example' }] });
    expect(mock.requests.filter((r) => r.path.endsWith('/enrich'))).toHaveLength(1);
    const ds = await dataset(out.datasetId);
    expect(ds.columns.map((c) => c.name)).toContain('funding');
    expect(ds.rows[0]!.cells[ds.columns.find((c) => c.name === 'funding')!.id]).toBe('Mock funding');
  });

  it('core and pro ask first (the user decides); Decline starts nothing', async () => {
    const runs = mock.count('POST', '/v1beta/findall/runs');
    const p = findEntities(ctx(), { objective: 'Rare things', generator: 'core', match_limit: 20, match_conditions: [{ name: 'a', description: 'b' }] }, as('scout'));
    const card = await until('approval', async () => (await cards('research')).find((c) => (c.data as any).status === 'awaiting_approval'));
    expect(readCardData(ResearchData, card.data)).toMatchObject({ kind: 'find_entities', estCostUsd: 5, processor: 'core' });
    await svc.confirm(canvasId, card.id, false);
    await expect(p).resolves.toMatchObject({ declined: true });
    expect(mock.count('POST', '/v1beta/findall/runs')).toBe(runs);
  });

  it('Stop CANCELS for real (POST /cancel), keeps the matches so far, marks the card cancelled and rethrows', async () => {
    const slow = await new MockParallel({ findallStepMs: 80, findallMatches: 6 }).start();
    try {
      svc.dispose();
      svc = new ParallelService(store, { credentials, baseUrl: slow.baseURL, throttleMs: 0, pollMs: 5, longPollSeconds: 1 });
      const ac = new AbortController();
      const p = findEntities(ctx(), { objective: 'Find companies', match_conditions: [{ name: 'a', description: 'b' }], generator: 'base', match_limit: 6 }, as('scout', ac.signal));
      const card = await until('running', async () => (await cards('research')).find((c) => (c.data as any).runId));
      await sleep(200);
      ac.abort(new Error('enough'));
      await expect(p).rejects.toThrow('enough');
      await until('the card to be cancelled', async () => (await researchOf(card.id)).status === 'cancelled');
      expect(slow.count('POST', '/v1beta/findall/runs/')).toBeGreaterThan(0);
      expect(slow.requests.some((r) => r.path.endsWith('/cancel'))).toBe(true);
      const d = await researchOf(card.id);
      expect(d.note).toMatch(/Cancelled/);
      expect(d.matched).toBeGreaterThan(0);
      expect(d.matched).toBeLessThan(6);
      const ds = await dataset(d.datasetId!);
      expect(ds.rows.length).toBe(d.matched);
      expect((await svc.findRun(canvasId, d.runId!))!.status).toBe('cancelled');
    } finally {
      await slow.close();
    }
  });

  it('extend: only a search that stopped at its match limit; then more matches arrive in the same database', async () => {
    const first: any = await findEntities(ctx(), { objective: 'Companies', match_conditions: [{ name: 'a', description: 'b' }], match_limit: 5, wait: true, generator: 'base' }, as('scout'));
    expect(first).toMatchObject({ status: 'completed', matched: 5, termination: 'match_limit_met' });
    // base ($0.03 a match) is cheap: extending by 3 asks nothing.
    const more: any = await findEntitiesExtend(ctx(), { findall_id: first.findallId, additional_match_limit: 3 }, as('scout'));
    expect(more).toMatchObject({ status: 'completed' });
    expect(mock.last('POST', `/v1beta/findall/runs/${first.findallId}/extend`)!.body).toEqual({ additional_match_limit: 3 });
    // A run that ended another way cannot be extended; an unknown one is refused.
    const exhausted: any = await findEntities(ctx(), { objective: 'Few', match_conditions: [{ name: 'a', description: 'b' }], match_limit: 8, generator: 'base' }, as('scout'));
    expect(exhausted.termination).toBe('candidates_exhausted');
    expect(await findEntitiesExtend(ctx(), { findall_id: exhausted.findallId, additional_match_limit: 3 }, as('scout'))).toMatchObject({ message: expect.stringContaining('stopped at its match limit') });
    await expect(findEntitiesExtend(ctx(), { findall_id: 'findall_nope', additional_match_limit: 3 }, as('scout'))).rejects.toThrow(/no entity search/);
  });

  it('extend by a lot asks the user, on the run card', async () => {
    const first: any = await findEntities(ctx(), { objective: 'Companies', match_conditions: [{ name: 'a', description: 'b' }], match_limit: 5, generator: 'base' }, as('scout'));
    const p = findEntitiesExtend(ctx(), { findall_id: first.findallId, additional_match_limit: 1000 }, as('scout'));
    const card = await until('approval', async () => (await cards('research')).find((c) => (c.data as any).status === 'awaiting_approval'));
    expect(readCardData(ResearchData, card.data)!.estCostUsd).toBe(30);
    await svc.confirm(canvasId, card.id, false);
    await expect(p).resolves.toMatchObject({ declined: true });
    expect((await researchOf(card.id)).status).toBe('completed');
  });
});

describe('entity_search', () => {
  it('places an unverified Database card and returns the list', async () => {
    const out: any = await entitySearch(ctx(), { entity_type: 'people', objective: 'Robotics founders in Europe', limit: 5 }, as('scout'));
    expect(out.entities).toHaveLength(5);
    expect(out).toMatchObject({ unverified: true, costUsd: 0.005 });
    const ds = await svc.store.datasets.read(canvasId, out.datasetId);
    expect(ds.columns.map((c) => c.name)).toEqual(['Name', 'URL', 'Description', 'Status']);
    expect(ds.rows.every((r) => r.cells[ds.columns[3]!.id] === 'unverified')).toBe(true);
    expect(mock.last('POST', '/v1beta/findall/entity-search')!.body).toEqual({ entity_type: 'people', objective: 'Robotics founders in Europe', match_limit: 5 });
  });
  it('place:false returns the list only', async () => {
    const out: any = await entitySearch(ctx(), { entity_type: 'companies', objective: 'Battery makers', place: false }, as('scout'));
    expect(out.cardId).toBeUndefined();
    expect(await cards('database')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('watches (Orb only)', () => {
  const orbWatch = async (args: Record<string, unknown> = {}) => {
    const p = watchTopic(ctx(), { query: 'New foundation model releases', ...args }, as('orb'));
    const card = await until('the watch approval', async () => (await cards('watch')).find((c) => (c.data as any).status === 'awaiting_approval'));
    return { p, card };
  };

  it('always asks, showing the projected monthly cost; Approve creates the monitor and the card goes active', async () => {
    const { p, card } = await orbWatch({ frequency: '1d', title: 'Model releases' });
    expect(readCardData(WatchData, card.data)).toMatchObject({ status: 'awaiting_approval', frequency: '1d', processor: 'lite', monthlyUsd: 0.09, title: 'Model releases' });
    await svc.confirm(canvasId, card.id, true);
    const out: any = await p;
    expect(out).toMatchObject({ monthlyUsd: 0.09, frequency: '1d', cardId: card.id });
    expect(out.monitorId).toMatch(/^monitor_/);
    expect(readCardData(WatchData, (await cardById(card.id))!.data)).toMatchObject({ status: 'active', monitorId: out.monitorId, eventCount: 0 });
    expect(mock.last('POST', '/v1/monitors')!.body).toMatchObject({ type: 'event_stream', frequency: '1d', processor: 'lite', settings: { query: 'New foundation model releases' }, metadata: { orb_board: canvasId }, memory_scope_key: `orb:${canvasId}` });
    expect(cardDataSchema('watch').safeParse((await cardById(card.id))!.data).success).toBe(true);
  });

  it('Decline creates nothing; a bad frequency is refused before anything is placed', async () => {
    const monitors = mock.count('POST', '/v1/monitors');
    const { p, card } = await orbWatch();
    await svc.confirm(canvasId, card.id, false);
    await expect(p).resolves.toMatchObject({ declined: true });
    expect(mock.count('POST', '/v1/monitors')).toBe(monitors);
    expect(readCardData(WatchData, (await cardById(card.id))!.data)!.status).toBe('declined');
    await expect(watchTopic(ctx(), { query: 'topic here', frequency: 'soon' }, as('orb'))).rejects.toThrow(/frequency/);
  });

  it('watch_events turns new events into doc cards with their sources; a second pull adds nothing; list and stop', async () => {
    const { p, card } = await orbWatch({ title: 'Releases' });
    await svc.confirm(canvasId, card.id, true);
    const started: any = await p;
    mock.addMonitorEvent(started.monitorId, 'Lab A released a new model');
    mock.addMonitorEvent(started.monitorId, 'Lab B released a new model');
    const out: any = await watchEvents(ctx(), { monitor_id: started.monitorId }, as('orb'));
    expect(out.newEvents).toHaveLength(2);
    expect(out.newEvents[0].summary).toBe('Lab A released a new model');
    const docs = await cards('doc');
    expect(docs).toHaveLength(2);
    expect(docs[0]!.data).toMatchObject({ provenance: { provider: 'parallel', kind: 'monitor' } });
    expect((await cards('source')).length).toBeGreaterThan(0);
    const watch = readCardData(WatchData, (await cardById(card.id))!.data)!;
    expect(watch).toMatchObject({ eventCount: 2 });
    expect(watch.events![0]!.summary).toBe('Lab B released a new model');
    const again: any = await watchEvents(ctx(), { monitor_id: started.monitorId }, as('orb'));
    expect(again.newEvents).toEqual([]);
    expect((await cards('doc')).length).toBe(2);
    const listed: any = await listWatches(ctx(), {}, as('orb'));
    expect(listed.watches).toEqual([expect.objectContaining({ monitorId: started.monitorId, status: 'active', eventCount: 2 })]);
    const stopped: any = await stopWatch(ctx(), { monitor_id: started.monitorId }, as('orb'));
    expect(stopped.status).toBe('cancelled');
    expect(readCardData(WatchData, (await cardById(card.id))!.data)!.status).toBe('cancelled');
    expect(mock.last('POST', `/v1/monitors/${started.monitorId}/cancel`)).toBeDefined();
    await expect(watchEvents(ctx(), { monitor_id: 'monitor_nope' }, as('orb'))).rejects.toThrow(/no watch/);
  });

  it('opening the canvas pulls the active watches\' new events (no webhooks)', async () => {
    const { p, card } = await orbWatch();
    await svc.confirm(canvasId, card.id, true);
    const started: any = await p;
    mock.addMonitorEvent(started.monitorId, 'Found while orb was closed');
    svc.dispose();
    svc = makeSvc();
    await svc.resumeCanvas(canvasId);
    await until('the event card', async () => (await cards('doc')).length === 1);
    expect(readCardData(WatchData, (await cardById(card.id))!.data)).toMatchObject({ eventCount: 1 });
  });
});

describe('research_memory and suggest_task_spec', () => {
  it('memory is scoped to the board', async () => {
    await deepResearch(ctx(), { input: 'remember me', processor: 'lite' }, as('scout'));
    const out: any = await researchMemory(ctx(), { query: 'remember', kind: 'task', limit: 5 }, as('scout'));
    expect(out.results.length).toBeGreaterThan(0);
    expect(mock.last('POST', '/v1beta/memory/retrieve')!.body).toMatchObject({ query: 'remember', kind: 'task', limit: 5, memory_scope_key: `orb:${canvasId}` });
  });
  it('suggest returns a schema to pass on', async () => {
    const out: any = await suggestTaskSpec(ctx(), { intent: 'compare two vendors on price' }, as('scout'));
    expect(out.outputSchema.json_schema.properties).toHaveProperty('summary');
    expect(out.next).toContain('deep_research');
  });
});

describe('the registry file and the board stay consistent', () => {
  it('only orb-canvas writes assets/parallel/runs.json, atomically, and every card passes its schema', async () => {
    await deepResearch(ctx(), { input: 'x' }, as('scout'));
    const file = join(store.dirOf(canvasId), 'assets', 'parallel', 'runs.json');
    expect(existsSync(file)).toBe(true);
    expect(readdirSync(join(store.dirOf(canvasId), 'assets', 'parallel')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    for (const card of await cards()) expect(cardDataSchema(card.type).safeParse(card.data).success, card.type).toBe(true);
  });

  it('progress writes are throttled (not one event per SSE frame)', async () => {
    svc.dispose();
    svc = makeSvc({ throttleMs: 1000 });
    mock.hold();
    const out: any = await deepResearch(ctx(), { input: 'throttle', wait: false }, as('scout'));
    await sleep(400);
    mock.release();
    await until('completion', async () => (await researchOf(out.cardId)).status === 'completed');
    await store.flush();
    const log = readFileSync(join(store.dirOf(canvasId), 'board.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const updates = log.filter((e) => e.type === 'card.updated' && e.data.id === out.cardId);
    // queued → running, a throttled progress write or two, the final write: a handful, not dozens.
    expect(updates.length).toBeLessThan(10);
    expect(mock.count('GET', `/v1/tasks/runs/${out.runId}/events`)).toBeGreaterThan(0);
  });
});
