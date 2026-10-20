/**
 * P6.7: the Parallel REST client against the mock Parallel server (scripts/testkit/mockParallel.ts): every endpoint,
 * the SSE streams, error mapping, retries, the abort signal, and the pure cost and result mappers. There is no real
 * Parallel key anywhere in these tests.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MOCK_PARALLEL_KEY, MockParallel } from '../../../scripts/testkit/mockParallel.js';
import {
  ParallelClient,
  ParallelError,
  buildSearchBody,
  citationsOf,
  eventJson,
  extractCost,
  findAllCost,
  frequencyHours,
  groupCost,
  imageSearchCost,
  mapResponses,
  mapSearchResponse,
  monitorMonthlyCost,
  needsConfirmation,
  normalizeUrl,
  outputText,
  parallelWebSearch,
  responsesCost,
  searchCost,
  taskCost,
  trimExcerpts,
} from '../src/index.js';

let mock: MockParallel;
const client = (over: { key?: string | undefined; fetch?: typeof fetch } = {}) =>
  new ParallelClient({
    apiKey: async () => ('key' in over ? over.key : MOCK_PARALLEL_KEY),
    baseUrl: mock.baseURL,
    retryDelayMs: 1,
    ...(over.fetch ? { fetch: over.fetch } : {}),
  });

beforeAll(async () => {
  mock = await new MockParallel({ taskMs: 80, longPollCapMs: 60, findallStepMs: 15, groupRunMs: 30 }).start();
});
afterAll(() => mock.close());
afterEach(() => {
  mock.hold(false);
  mock.hangResponsesCalls(false);
});

describe('search, image search, extract', () => {
  it('search sends x-api-key, client_model and the advanced settings; maps results', async () => {
    const c = client();
    const out = await parallelWebSearch(
      c,
      { query: 'battery storage', maxResults: 5, objective: 'Find grid storage costs', queries: ['grid storage cost'], depth: 'advanced', afterDate: '2026-01-01', includeDomains: ['iea.org'], country: 'GB' },
      'sess_1',
    );
    const req = mock.last('POST', '/v1/search')!;
    expect(req.keyOk).toBe(true);
    expect(req.body).toMatchObject({
      client_model: 'gpt-6-luna',
      objective: 'Find grid storage costs',
      search_queries: ['grid storage cost'],
      mode: 'advanced',
      session_id: 'sess_1',
      advanced_settings: { max_results: 5, location: 'gb', source_policy: { include_domains: ['iea.org'], after_date: '2026-01-01' } },
    });
    expect(out.sources).toHaveLength(5);
    expect(out.sources[0]).toMatchObject({ url: expect.stringContaining('iea.org'), title: expect.any(String), snippet: expect.stringContaining('dense text') });
    expect(out.costUsd).toBeCloseTo(0.005);
  });

  it('search: query defaults, at most 5 queries of 200 characters, results capped at 20, exclude only without include', () => {
    const body = buildSearchBody('q'.repeat(300), 99, { queries: Array.from({ length: 8 }, (_, i) => `query ${i}`), excludeDomains: ['a.com'] });
    expect(body.search_queries).toHaveLength(5);
    expect(body.advanced_settings.max_results).toBe(20);
    expect(body.advanced_settings.source_policy).toEqual({ exclude_domains: ['a.com'] });
    const both = buildSearchBody('q', 5, { includeDomains: ['b.org'], excludeDomains: ['a.com'] });
    expect(both.advanced_settings.source_policy).toEqual({ include_domains: ['b.org'] });
    expect(buildSearchBody('q'.repeat(300), 5, {}).search_queries[0]).toHaveLength(200);
    expect(buildSearchBody('q', 5, {}).mode).toBe('fast');
  });

  it('search: results without an http(s) URL are dropped, excerpts trimmed', () => {
    const sources = mapSearchResponse({ results: [{ url: 'ftp://x/y' }, { url: 'https://a.com/p', title: 'A', excerpts: ['x'.repeat(5000)] }] }, 8, 100);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.snippet).toHaveLength(100);
  });

  it('image search and extract (with per-URL errors)', async () => {
    const c = client();
    const images = await c.imageSearch({ search_queries: ['solar farm'], mode: 'fast', advanced_settings: { max_results: 3 } });
    expect(images.results[0]).toMatchObject({ image_url: expect.any(String), source_page_url: expect.any(String), width: 800 });
    const ex = await c.extract({ urls: ['https://a.com/ok', 'https://a.com/fail'], objective: 'prices', advanced_settings: { full_content: true } });
    expect(ex.results).toHaveLength(1);
    expect(ex.results[0]!.full_content).toContain('Full content');
    expect(ex.errors).toEqual([expect.objectContaining({ url: 'https://a.com/fail', http_status_code: 403 })]);
    expect(mock.last('POST', '/v1/extract')!.body.client_model).toBe('gpt-6-luna');
  });
});

describe('errors, retries and the abort signal', () => {
  it('no key: NOT_CONFIGURED before any request', async () => {
    const before = mock.requests.length;
    await expect(client({ key: undefined }).search({ search_queries: ['x'] })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(mock.requests.length).toBe(before);
  });

  it('401 (wrong key), 402, 403, 404, 422 are not retried and carry the status', async () => {
    await expect(client({ key: 'wrong' }).search({ search_queries: ['x'] })).rejects.toMatchObject({ status: 401, retryable: false, message: expect.stringContaining('Settings') });
    for (const status of [402, 403, 422]) {
      const n = mock.count('POST', '/v1/search');
      mock.failNext('POST', '/v1/search', status);
      await expect(client().search({ search_queries: ['x'] })).rejects.toMatchObject({ status });
      expect(mock.count('POST', '/v1/search')).toBe(n + 1);
    }
    await expect(client().taskGet('trun_missing')).rejects.toMatchObject({ status: 404 });
    await expect(client().search({ search_queries: [] })).rejects.toBeInstanceOf(ParallelError);
  });

  it('429 is retried with backoff, then succeeds; a persistent 429 gives up after 2 retries', async () => {
    const n = mock.count('POST', '/v1/search');
    mock.failNext('POST', '/v1/search', 429, undefined, 2);
    await expect(client().search({ search_queries: ['x'] })).resolves.toMatchObject({ results: expect.any(Array) });
    expect(mock.count('POST', '/v1/search')).toBe(n + 3);
    const m = mock.count('POST', '/v1/search');
    mock.failNext('POST', '/v1/search', 429, undefined, 5);
    await expect(client().search({ search_queries: ['x'] })).rejects.toMatchObject({ status: 429, retryable: true });
    expect(mock.count('POST', '/v1/search')).toBe(m + 3);
    mock.failNext('POST', '/v1/search', 500, undefined, 0);
  });

  it('a Task create (POST) is never retried on a 500; a GET is', async () => {
    const posts = mock.count('POST', '/v1/tasks/runs');
    mock.failNext('POST', '/v1/tasks/runs', 500);
    await expect(client().taskCreate({ processor: 'lite', input: 'x' })).rejects.toMatchObject({ status: 500 });
    expect(mock.count('POST', '/v1/tasks/runs')).toBe(posts + 1);
    const run = await client().taskCreate({ processor: 'lite', input: 'retry me' });
    const gets = mock.count('GET', `/v1/tasks/runs/${run.run_id}`);
    mock.failNext('GET', `/v1/tasks/runs/${run.run_id}`, 503);
    await expect(client().taskGet(run.run_id)).resolves.toMatchObject({ run_id: run.run_id });
    expect(mock.count('GET', `/v1/tasks/runs/${run.run_id}`)).toBe(gets + 2);
  });

  it('an abort stops a hung request at once and rethrows the signal reason', async () => {
    mock.hangResponsesCalls();
    const ac = new AbortController();
    const before = mock.aborted;
    const p = client().responses({ input: 'hang' }, { signal: ac.signal });
    setTimeout(() => ac.abort(new Error('stop')), 30);
    await expect(p).rejects.toThrow('stop');
    await new Promise((r) => setTimeout(r, 30));
    expect(mock.aborted).toBeGreaterThan(before);
    // An already-aborted signal never reaches the network.
    const n = mock.requests.length;
    const pre = new AbortController();
    pre.abort(new Error('again'));
    await expect(client().search({ search_queries: ['x'] }, { signal: pre.signal })).rejects.toThrow('again');
    expect(mock.requests.length).toBe(n);
  });

  it('a slow answer times out with TIMEOUT', async () => {
    mock.hangResponsesCalls();
    await expect(client().responses({ input: 'slow' }, { timeoutMs: 40 })).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true });
  });
});

describe('Responses (the cited answer)', () => {
  it('JSON: maps the answer, the cited spans, the searches and pages read', async () => {
    const res = await client().responses({ input: 'What is the market size?', reasoning: { effort: 'low' }, tools: [{ type: 'web_search', filters: { allowed_domains: ['iea.org'] } }] });
    expect(mock.last('POST', '/v1/responses')!.body).toMatchObject({ model: 'parallel', reasoning: { effort: 'low' } });
    const mapped = mapResponses(res);
    expect(mapped.answer).toContain('The market is large');
    expect(mapped.citations).toHaveLength(2);
    expect(mapped.citations[0]).toMatchObject({ url: expect.stringContaining('source-1'), span: 'The market is large [1].' });
    expect(mapped.searches).toEqual(['mock query one', 'mock query two']);
    expect(mapped.reads).toHaveLength(1);
    expect(mapped.responseId).toMatch(/^resp_/);
  });

  it('a model other than "parallel" is a 400 (OpenAI envelope)', async () => {
    await expect(client().json('POST', '/v1/responses', { model: 'gpt', input: 'x' })).rejects.toMatchObject({ status: 400 });
  });

  it('streaming: the OpenAI event sequence arrives as SSE events', async () => {
    const seen: string[] = [];
    for await (const ev of client().responsesStream({ input: 'stream me' })) seen.push(ev.event);
    expect(seen[0]).toBe('response.created');
    expect(seen).toContain('response.web_search_call.searching');
    expect(seen).toContain('response.output_text.delta');
    expect(seen).toContain('response.output_text.annotation.added');
    expect(seen.at(-1)).toBe('response.completed');
  });
});

describe('Task API', () => {
  it('create → status → result, with a 408 (undefined) while the run is held, then the output', async () => {
    mock.hold();
    const c = client();
    const run = await c.taskCreate({ processor: 'core', input: 'Compare X and Y', task_spec: { output_schema: { type: 'text' } }, enable_events: true });
    expect(run).toMatchObject({ status: 'queued', processor: 'core', interaction_id: run.run_id });
    expect(await c.taskResult(run.run_id, 25)).toBeUndefined();
    expect(mock.last('GET', `/v1/tasks/runs/${run.run_id}/result`)!.query.timeout).toBe('25');
    mock.release(run.run_id);
    const result = await c.taskResult(run.run_id, 25);
    expect(result!.output.type).toBe('text');
    expect(outputText(result!.output.content)).toContain('Mock report');
    expect(citationsOf(result!.output.basis)).toHaveLength(4);
    expect((await c.taskGet(run.run_id)).status).toBe('completed');
  });

  it('a bad processor is 403 (not retried); a failed run answers 404 on result', async () => {
    await expect(client().taskCreate({ processor: 'bad', input: 'x' })).rejects.toMatchObject({ status: 403 });
    const run = await client().taskCreate({ processor: 'lite', input: 'make-it-fail' });
    await expect(client().taskResult(run.run_id, 5)).rejects.toMatchObject({ status: 404 });
  });

  it('events: state, progress_stats, progress_msg, and the final state with the output; aborting closes the stream', async () => {
    mock.hold();
    const c = client();
    const run = await c.taskCreate({ processor: 'pro', input: 'stream', enable_events: true });
    const types: string[] = [];
    const ac = new AbortController();
    const abortedBefore = mock.aborted;
    await expect(
      (async () => {
        for await (const ev of c.taskEvents(run.run_id, { signal: ac.signal })) {
          const data = eventJson<any>(ev)!;
          types.push(data.type);
          if (types.length >= 5) ac.abort(new Error('enough'));
        }
      })(),
    ).rejects.toThrow('enough');
    expect(types).toContain('task_run.progress_stats');
    expect(types.some((t) => t.startsWith('task_run.progress_msg'))).toBe(true);
    await new Promise((r) => setTimeout(r, 40));
    expect(mock.aborted).toBeGreaterThan(abortedBefore);
    mock.release(run.run_id);
    const last: any[] = [];
    for await (const ev of c.taskEvents(run.run_id)) last.push(eventJson(ev));
    expect(last.at(-1)).toMatchObject({ type: 'task_run.state', run: { status: 'completed' }, output: { type: 'json' } });
  });

  it('auto and json schemas produce basis with per-field citations and confidence', async () => {
    const c = client();
    const run = await c.taskCreate({ processor: 'base', input: 'ACME', task_spec: { output_schema: { type: 'json', json_schema: { type: 'object', properties: { founded: { type: 'string' }, employees: { type: 'integer' } } } } } });
    const result = await c.taskResult(run.run_id, 5);
    expect(result!.output.content).toMatchObject({ employees: 42 });
    expect(result!.output.basis!.map((b) => b.field)).toEqual(['founded', 'employees']);
    expect(result!.output.basis![1]!.confidence).toBe('low');
  });
});

describe('Task Groups', () => {
  it('create, add runs, resumable SSE events, per-run results', async () => {
    const c = client();
    const group = await c.groupCreate();
    const added = await c.groupAddRuns(group.taskgroup_id, {
      default_task_spec: { output_schema: { type: 'json', json_schema: { type: 'object', properties: { ceo: { type: 'string' } } } } },
      inputs: [{ processor: 'base', input: 'A' }, { processor: 'base', input: 'B' }, { processor: 'base', input: 'C' }],
    });
    expect(added.run_ids).toHaveLength(3);
    const states: string[] = [];
    let lastId = '';
    for await (const ev of c.groupEvents(group.taskgroup_id)) {
      lastId = ev.id ?? lastId;
      const d = eventJson<any>(ev)!;
      states.push(d.type + (d.run ? `:${d.run.run_id}` : ''));
    }
    expect(states.filter((s) => s.startsWith('task_run.state'))).toHaveLength(3);
    expect(states.at(-1)).toBe('task_group_status');
    expect((await c.groupGet(group.taskgroup_id)).status.is_active).toBe(false);
    // Resuming after the last event id replays nothing.
    const again: string[] = [];
    for await (const ev of c.groupEvents(group.taskgroup_id, { lastEventId: lastId })) again.push(ev.event);
    expect(again).toEqual([]);
    const r = await c.taskResult(added.run_ids[1]!, 5);
    expect(r!.output.content).toMatchObject({ ceo: expect.stringContaining('Mock ceo') });
    await expect(c.groupAddRuns(group.taskgroup_id, { inputs: [] })).rejects.toMatchObject({ status: 422 });
  });
});

describe('FindAll', () => {
  it('ingest, create, events resumed with last_event_id, result, extend only after match_limit_met', async () => {
    const c = client();
    const schema = await c.findallIngest('AI infra startups in Europe');
    expect(schema.match_conditions!.length).toBeGreaterThan(0);
    const run = await c.findallCreate({ objective: 'AI infra startups', entity_type: 'companies', match_conditions: schema.match_conditions, generator: 'preview', match_limit: 5 });
    const events: string[] = [];
    let lastId: string | undefined;
    for await (const ev of c.findallEvents(run.findall_id)) {
      if (ev.id) lastId = ev.id;
      events.push(ev.event);
    }
    expect(events.filter((e) => e === 'findall.candidate.matched')).toHaveLength(5);
    expect(events.at(-1)).toBe('findall.status');
    const result = await c.findallResult(run.findall_id);
    expect(result.candidates).toHaveLength(5);
    expect(result.run.status).toMatchObject({ status: 'completed', termination_reason: 'match_limit_met' });
    const resumed: string[] = [];
    for await (const ev of c.findallEvents(run.findall_id, { lastEventId: lastId! })) resumed.push(ev.event);
    expect(resumed.filter((e) => e.startsWith('findall.candidate'))).toEqual([]);
    expect(await c.findallEnrich(run.findall_id, { processor: 'core', output_schema: { type: 'json', json_schema: { type: 'object', properties: { funding: { type: 'string' } } } } })).toBeTruthy();
    await c.findallExtend(run.findall_id, 3);
    expect(mock.last('POST', `/v1beta/findall/runs/${run.findall_id}/extend`)!.body).toEqual({ additional_match_limit: 3 });
  });

  it('cancel is real (204 → true); cancelling a finished run is a 409 → false', async () => {
    const c = client();
    const slow = await new MockParallel({ findallStepMs: 200 }).start();
    try {
      const sc = new ParallelClient({ apiKey: async () => MOCK_PARALLEL_KEY, baseUrl: slow.baseURL });
      const run = await sc.findallCreate({ objective: 'x', entity_type: 'companies', match_conditions: [{ name: 'a', description: 'b' }], generator: 'base', match_limit: 6 });
      expect(await sc.findallCancel(run.findall_id)).toBe(true);
      expect((await sc.findallGet(run.findall_id)).status).toMatchObject({ status: 'cancelled', termination_reason: 'user_cancelled' });
      expect(await sc.findallCancel(run.findall_id)).toBe(false);
    } finally {
      await slow.close();
    }
    expect(c.clientModel).toBe('gpt-6-luna');
  });

  it('entity search is sync and returns unverified entities', async () => {
    const res = await client().entitySearch({ entity_type: 'people', objective: 'robotics founders', match_limit: 5 });
    expect(res.entities).toHaveLength(5);
    expect(res.entities[0]).toMatchObject({ name: 'Person 1', url: expect.any(String) });
  });
});

describe('Monitors, Memory, Task Suggest', () => {
  it('create, list, events newest first with a cursor, cancel', async () => {
    const c = client();
    const m = await c.monitorCreate({ type: 'event_stream', frequency: '1d', processor: 'lite', settings: { query: 'new LLM releases' }, metadata: { orb_board: 'k_1' } });
    expect(m).toMatchObject({ status: 'active', frequency: '1d' });
    expect((await c.monitorList()).monitors.map((x) => x.monitor_id)).toContain(m.monitor_id);
    for (let i = 1; i <= 3; i++) mock.addMonitorEvent(m.monitor_id, `Event ${i}`);
    const page1 = await c.monitorEvents(m.monitor_id, { limit: 2 });
    expect(page1.events).toHaveLength(2);
    expect(page1.next_cursor).toBe('2');
    expect((page1.events[0]!.output!.content as string)).toBe('Event 3');
    expect((await c.monitorEvents(m.monitor_id, { cursor: '2', limit: 2 })).events).toHaveLength(1);
    await c.monitorCancel(m.monitor_id);
    expect((await c.monitorList()).monitors.map((x) => x.monitor_id)).not.toContain(m.monitor_id);
    await expect(client().monitorCreate({ frequency: '1d' })).rejects.toMatchObject({ status: 422 });
  });

  it('memory retrieve and task suggest', async () => {
    const c = client();
    expect((await c.memoryRetrieve({ query: 'x', limit: 3, memory_scope_key: 'orb:c_1' })).results.length).toBeGreaterThan(0);
    const s = await c.taskSuggest('compare two vendors');
    expect(s.output_schema.json_schema.properties).toHaveProperty('summary');
  });
});

describe('pure helpers', () => {
  it('prices (spec §0, §5.3, §8.3, §9)', () => {
    expect(searchCost('fast')).toBeCloseTo(0.001);
    expect(searchCost('advanced')).toBeCloseTo(0.005);
    expect(searchCost('fast', 20)).toBeCloseTo(0.011);
    expect(imageSearchCost('advanced')).toBeCloseTo(0.005);
    expect(extractCost(20)).toBeCloseTo(0.02);
    expect(responsesCost('low')).toBeCloseTo(0.01);
    expect(responsesCost('high')).toBeCloseTo(0.25);
    expect(taskCost('pro')).toBeCloseTo(0.1);
    expect(taskCost('ultra8x')).toBeCloseTo(2.4);
    expect(groupCost('base', 100)).toBeCloseTo(1);
    expect(findAllCost('preview', 10)).toBeCloseTo(0.1);
    expect(findAllCost('core', 20)).toBeCloseTo(2 + 0.15 * 20);
    expect(findAllCost('base', 10, ['core'])).toBeCloseTo(0.25 + 0.3 + 0.025 * 10);
    expect(monitorMonthlyCost('1d', 'lite')).toBeCloseTo(0.09);
    expect(monitorMonthlyCost('6h', 'base')).toBeCloseTo(1.2);
    expect(frequencyHours('2w')).toBe(336);
    expect(frequencyHours('45d')).toBeUndefined();
    expect(frequencyHours('soon')).toBeUndefined();
  });

  it('the cost guard threshold is strict: exactly $0.50 does not ask, a cent over does', () => {
    expect(needsConfirmation(0.5, 0.5)).toBe(false);
    expect(needsConfirmation(0.51, 0.5)).toBe(true);
    expect(needsConfirmation(taskCost('ultra'), 0.5)).toBe(false);
    expect(needsConfirmation(taskCost('ultra2x'), 0.5)).toBe(true);
  });

  it('citations are deduplicated by normalised URL, ranked by fields supported, with the best confidence', () => {
    const cites = citationsOf([
      { field: 'a', citations: [{ url: 'https://www.x.com/p/?utm_source=z#frag', title: 'X', excerpts: ['ex x'] }, { url: 'https://y.com/q' }], reasoning: 'why a', confidence: 'low' },
      { field: 'b', citations: [{ url: 'https://x.com/p' }], reasoning: 'why b', confidence: 'high' },
      { field: 'c', citations: [{ url: 'javascript:alert(1)' }, { url: 'not a url' }] },
    ]);
    expect(cites.map((c) => c.url)).toEqual(['https://www.x.com/p/?utm_source=z#frag', 'https://y.com/q']);
    expect(cites[0]).toMatchObject({ title: 'X', excerpt: 'ex x', fields: ['a', 'b'], confidence: 'high' });
    expect(cites[1]).toMatchObject({ excerpt: 'why a', fields: ['a'], confidence: 'low' });
    expect(normalizeUrl('https://www.x.com/p/?utm_source=z#frag')).toBe('https://x.com/p');
  });

  it('output text and excerpts are bounded', () => {
    expect(outputText({ a: 'x', b: { c: 1 } })).toBe('a: x\nb:\n  c: 1');
    expect(outputText('y'.repeat(100), 10)).toHaveLength(10);
    expect(trimExcerpts(['a', 'b'], 100)).toBe('a\n\nb');
    expect(trimExcerpts(undefined)).toBe('');
  });
});
