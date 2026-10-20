/**
 * A mock Parallel Web Systems server (P6.7): every endpoint orb calls, in memory, on loopback. There is no Parallel
 * key, so every deterministic test (and the egress audit, through the proxy as `api.parallel.ai`) runs against this
 * and never against the real API.
 *
 * Covered (docs/phase6/parallel-api-spec.md): Search, Image Search, Extract, Responses (JSON and SSE), Task runs
 * (create, get, long-poll result with 408, SSE events: state, progress_stats, progress_msg.*), Task Groups (create,
 * add runs, get, resumable SSE events), FindAll (ingest, create, get, result, SSE events with `last_event_id`, cancel
 * with 409 when over, enrich, extend, schema), Entity Search, Monitors (create, list, get, update, events, cancel,
 * trigger), Memory retrieve and Task Suggest. Behaviour is scripted through `MockParallelOptions` and a few methods
 * (`hold`, `release`, `failNext`, `addMonitorEvent`) so a test can make a run slow, stuck, failing or reconnecting.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const MOCK_PARALLEL_KEY = 'orb-mock-parallel-key';
export const MOCK_PARALLEL_HOST = 'api.parallel.ai';
export const MOCK_PARALLEL_SITE = 'https://mock-site.orb.test';

export type MockParallelRequest = {
  method: string;
  path: string;
  query: Record<string, string>;
  body: any;
  /** The value of the `x-api-key` header (never logged by the mock; for assertions about auth only). */
  hasKey: boolean;
  keyOk: boolean;
};

export type MockParallelOptions = {
  /** The key the mock accepts. Default {@link MOCK_PARALLEL_KEY}; `null`: accept any. */
  key?: string | null;
  /** How long a Task run takes, ms (default 120). */
  taskMs?: number;
  /** Task SSE streams close after this long even when the run is still active (default 570 s, as Parallel). */
  streamMaxMs?: number;
  /** Task `/result` long poll: the most it blocks, ms, before a 408 (default 25 s). */
  longPollCapMs?: number;
  /** FindAll: ms between candidates (default 40). */
  findallStepMs?: number;
  /** FindAll: how many candidates match (default 6). */
  findallMatches?: number;
  /** Task Group: ms per run (default 60). */
  groupRunMs?: number;
  /** Responses/Search: answer after this long, ms (default 0). */
  latencyMs?: number;
  /** Search returns exactly these results (default: six `mock-site.orb.test/search-N` pages). */
  searchResults?: Array<{ url: string; title: string; excerpt: string }>;
};

type Fail = { method: string; path: string; status: number; body?: unknown; times: number };

type Task = {
  id: string;
  input: unknown;
  processor: string;
  schema: any;
  status: 'queued' | 'running' | 'completed' | 'failed';
  groupId?: string;
  created: number;
  doneAt?: number;
  held: boolean;
  previous?: string;
  metadata?: Record<string, string>;
};

type FindAll = {
  id: string;
  objective: string;
  generator: string;
  limit: number;
  status: 'queued' | 'running' | 'completed' | 'cancelled';
  candidates: any[];
  events: Array<{ id: string; event: string; data: any }>;
  enrichments: any[];
  termination?: string;
};

type Group = { id: string; runs: string[]; events: Array<{ id: string; event: string; data: any }> };

type Monitor = {
  id: string;
  body: any;
  status: 'active' | 'cancelled';
  events: any[];
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const CITES = (n: number, topic: string) =>
  Array.from({ length: n }, (_, i) => ({
    url: `${MOCK_PARALLEL_SITE}/source-${i + 1}`,
    title: `Mock source ${i + 1}`,
    excerpts: [`Excerpt ${i + 1} about ${topic}.`],
  }));

export class MockParallel {
  readonly requests: MockParallelRequest[] = [];
  /** Requests the client gave up on before the mock answered (a hung Responses call, a closed stream). */
  aborted = 0;
  private server?: Server;
  private readonly tasks = new Map<string, Task>();
  private readonly findalls = new Map<string, FindAll>();
  private readonly groups = new Map<string, Group>();
  private readonly monitors = new Map<string, Monitor>();
  private readonly fails: Fail[] = [];
  private seq = 0;
  private holdAll = false;
  private hangResponses = false;
  private readonly open = new Set<ServerResponse>();

  constructor(readonly options: MockParallelOptions = {}) {}

  get baseURL(): string {
    return `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  }
  get port(): number {
    return (this.server!.address() as AddressInfo).port;
  }

  async start(): Promise<this> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((r) => this.server!.listen(0, '127.0.0.1', r));
    return this;
  }

  async close(): Promise<void> {
    for (const res of this.open) res.destroy();
    this.server?.closeAllConnections();
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
  }

  // ---- test controls ----

  /** New Task runs stay `running` until {@link release}. */
  hold(on = true): void {
    this.holdAll = on;
  }
  /** Let a held run (or every held run) finish. */
  release(runId?: string): void {
    for (const t of this.tasks.values()) if (t.held && (!runId || t.id === runId)) t.held = false;
  }
  /** The next call to `METHOD path-prefix` answers `status` (`times` times). */
  failNext(method: string, path: string, status: number, body?: unknown, times = 1): void {
    this.fails.push({ method, path, status, ...(body !== undefined ? { body } : {}), times });
  }
  /** `/v1/responses` never answers (until the client aborts). */
  hangResponsesCalls(on = true): void {
    this.hangResponses = on;
  }
  count(method: string, pathPrefix: string): number {
    return this.requests.filter((r) => r.method === method && r.path.startsWith(pathPrefix)).length;
  }
  last(method: string, pathPrefix: string): MockParallelRequest | undefined {
    return this.requests.findLast((r) => r.method === method && r.path.startsWith(pathPrefix));
  }
  taskRuns(): Task[] {
    return [...this.tasks.values()];
  }
  /** Add an event to a monitor (what a scheduled check found). */
  addMonitorEvent(monitorId: string, summary: string, date = '2026-10-14'): void {
    const m = this.monitors.get(monitorId);
    if (!m) throw new Error(`no monitor ${monitorId}`);
    const n = m.events.length + 1;
    m.events.unshift({
      event_id: `mevent_${monitorId}_${n}`,
      event_group_id: `mgroup_${n}`,
      event_type: 'event_stream',
      event_date: date,
      output: {
        type: 'text',
        content: summary,
        basis: [{ field: 'output', citations: CITES(2, summary), reasoning: 'Found in two sources.', confidence: 'medium' }],
      },
    });
  }
  monitorIds(): string[] {
    return [...this.monitors.keys()];
  }
  findallRuns(): FindAll[] {
    return [...this.findalls.values()];
  }

  // ---- plumbing ----

  private id(prefix: string): string {
    return `${prefix}_${String(++this.seq).padStart(4, '0')}`;
  }

  private send(res: ServerResponse, status: number, body?: unknown): void {
    if (status === 204) return void res.writeHead(204).end();
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body ?? {}));
  }

  private err(res: ServerResponse, status: number, message: string): void {
    this.send(res, status, { type: 'error', error: { ref_id: this.id('ref'), message } });
  }

  private sse(req: IncomingMessage, res: ServerResponse): { write: (event: string, data: unknown, id?: string) => void; end: () => void; closed: () => boolean } {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    this.open.add(res);
    let closed = false;
    void req;
    res.on('close', () => {
      if (!closed && !res.writableFinished) this.aborted++;
      closed = true;
      this.open.delete(res);
    });
    return {
      write: (event, data, id) => {
        if (closed) return;
        res.write(`${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      },
      end: () => {
        if (!closed) {
          closed = true;
          this.open.delete(res);
          res.end();
        }
      },
      closed: () => closed,
    };
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://mock');
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    let body: any;
    const raw = Buffer.concat(chunks).toString('utf8');
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    const method = req.method ?? 'GET';
    const path = url.pathname;
    const sent = req.headers['x-api-key'];
    const expected = this.options.key === undefined ? MOCK_PARALLEL_KEY : this.options.key;
    const keyOk = expected === null ? typeof sent === 'string' : sent === expected;
    this.requests.push({ method, path, query: Object.fromEntries(url.searchParams), body, hasKey: typeof sent === 'string', keyOk });
    if (!keyOk) return this.err(res, 401, 'Invalid API key');
    const fail = this.fails.find((f) => f.method === method && path.startsWith(f.path) && f.times > 0);
    if (fail) {
      fail.times--;
      return this.send(res, fail.status, fail.body ?? { type: 'error', error: { ref_id: this.id('ref'), message: `mock failure ${fail.status}` } });
    }
    try {
      await this.route(method, path, url, body, req, res);
    } catch (err) {
      if (!res.headersSent) this.err(res, 500, `mock error: ${(err as Error).message}`);
    }
  }

  private async route(method: string, path: string, url: URL, body: any, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const latency = this.options.latencyMs ?? 0;
    if (method === 'POST' && path === '/v1/search') {
      if (latency) await sleep(latency);
      const queries: string[] = body?.search_queries ?? [];
      if (queries.length === 0) return this.err(res, 422, 'search_queries is required');
      const n = Math.min(body?.advanced_settings?.max_results ?? 10, 20);
      const policy = body?.advanced_settings?.source_policy;
      const fixed = this.options.searchResults;
      const results = fixed
        ? fixed.slice(0, n).map((r) => ({ url: r.url, title: r.title, publish_date: null, excerpts: [r.excerpt] }))
        : Array.from({ length: Math.min(n, 6) }, (_, i) => ({
        url: policy?.include_domains?.[0] ? `https://${policy.include_domains[0]}/result-${i + 1}` : `${MOCK_PARALLEL_SITE}/search-${i + 1}`,
        title: `Result ${i + 1} for ${queries[0]}`,
        publish_date: i === 0 ? '2026-09-01' : null,
        excerpts: [`Excerpt for ${queries[0]} (mode ${body?.mode ?? 'advanced'}): ${'dense text. '.repeat(6)}`],
      }));
      return this.send(res, 200, { search_id: this.id('search'), session_id: body?.session_id ?? this.id('sess'), results, usage: [{ name: 'sku_search', count: 1 }] });
    }
    if (method === 'POST' && path === '/v1/images/search') {
      const queries: string[] = body?.search_queries ?? [];
      if (queries.length === 0) return this.err(res, 422, 'search_queries is required');
      const n = Math.min(body?.advanced_settings?.max_results ?? 10, 20, 5);
      return this.send(res, 200, {
        search_id: this.id('isearch'),
        results: Array.from({ length: n }, (_, i) => ({
          title: `Image ${i + 1} of ${queries[0]}`,
          image_url: `${MOCK_PARALLEL_SITE}/img-${i + 1}.png`,
          source_page_url: `${MOCK_PARALLEL_SITE}/page-${i + 1}`,
          width: 800,
          height: 600,
        })),
      });
    }
    if (method === 'POST' && path === '/v1/extract') {
      const urls: string[] = body?.urls ?? [];
      if (urls.length === 0 || urls.length > 20) return this.err(res, 422, 'urls must hold 1 to 20 URLs');
      const full = body?.advanced_settings?.full_content;
      return this.send(res, 200, {
        extract_id: this.id('extract'),
        results: urls
          .filter((u) => !u.includes('fail'))
          .map((u) => ({
            url: u,
            title: `Page ${new URL(u).pathname}`,
            publish_date: '2026-08-15',
            excerpts: [`Focused excerpt of ${u}${body?.objective ? ` for: ${body.objective}` : ''}.`],
            ...(full ? { full_content: `Full content of ${u}. ${'Long text. '.repeat(40)}` } : {}),
          })),
        errors: urls.filter((u) => u.includes('fail')).map((u) => ({ url: u, error_type: 'fetch_failed', http_status_code: 403, content: 'login required' })),
      });
    }
    if (method === 'POST' && path === '/v1/responses') return this.responses(body, req, res);
    if (method === 'POST' && path === '/v1/tasks/runs') {
      if (!body?.processor || body.input === undefined) return this.err(res, 422, 'processor and input are required');
      if (body.processor === 'bad') return this.err(res, 403, 'invalid processor');
      const t = this.newTask(body);
      return this.send(res, 202, this.taskRun(t));
    }
    let m = /^\/v1\/tasks\/runs\/([^/]+)(?:\/(result|events|input))?$/.exec(path);
    if (m && method === 'GET') {
      const t = this.tasks.get(m[1]!);
      if (!t) return this.err(res, 404, 'run not found');
      this.advance(t);
      if (!m[2]) return this.send(res, 200, this.taskRun(t));
      if (m[2] === 'input') return this.send(res, 200, { input: t.input });
      if (m[2] === 'result') return this.taskResult(t, Number(url.searchParams.get('timeout') ?? 600), req, res);
      return this.taskEvents(t, req, res);
    }
    if (method === 'POST' && path === '/v1/tasks/groups') {
      const g: Group = { id: this.id('tgrp'), runs: [], events: [] };
      this.groups.set(g.id, g);
      return this.send(res, 201, this.groupStatus(g));
    }
    m = /^\/v1\/tasks\/groups\/([^/]+)(?:\/(runs|events))?$/.exec(path);
    if (m) {
      const g = this.groups.get(m[1]!);
      if (!g) return this.err(res, 404, 'group not found');
      if (method === 'POST' && m[2] === 'runs') {
        const inputs: any[] = body?.inputs ?? [];
        if (inputs.length === 0 || inputs.length > 1000) return this.err(res, 422, 'inputs must hold 1 to 1000 runs');
        const ids = inputs.map((i) => {
          const spec = { ...(body.default_task_spec ?? {}), ...(i.task_spec ?? {}) };
          const t = this.newTask({ processor: i.processor ?? body.default_processor ?? 'base', input: i.input, task_spec: spec }, g.id, this.options.groupRunMs ?? 60);
          g.runs.push(t.id);
          return t.id;
        });
        return this.send(res, 202, { status: this.groupStatus(g).status, run_ids: ids, run_cursor: null, event_cursor: null });
      }
      if (method === 'GET' && !m[2]) return this.send(res, 200, this.groupStatus(g));
      if (method === 'GET' && m[2] === 'events') return this.groupEvents(g, url.searchParams.get('last_event_id'), req, res);
    }
    if (method === 'POST' && path === '/v1beta/findall/ingest')
      return this.send(res, 200, {
        objective: body?.objective,
        entity_type: 'companies',
        match_conditions: [{ name: 'is_relevant', description: `Matches: ${body?.objective}` }],
        generator: 'core',
        match_limit: 10,
      });
    if (method === 'POST' && path === '/v1beta/findall/runs') return this.findallCreate(body, res);
    m = /^\/v1beta\/findall\/runs\/([^/]+)(?:\/(result|events|cancel|enrich|extend|schema))?$/.exec(path);
    if (m) return this.findallRoute(method, m[1]!, m[2], url, body, req, res);
    if (method === 'POST' && path === '/v1beta/findall/entity-search') {
      const limit = Math.min(body?.match_limit ?? 100, 8);
      return this.send(res, 200, {
        entity_set_id: this.id('eset'),
        entities: Array.from({ length: limit }, (_, i) => ({ name: `${body?.entity_type === 'people' ? 'Person' : 'Company'} ${i + 1}`, url: `${MOCK_PARALLEL_SITE}/entity-${i + 1}`, description: `A ${body?.entity_type} for: ${body?.objective}` })),
      });
    }
    if (method === 'POST' && path === '/v1/monitors') {
      if (!body?.frequency || !body?.settings?.query) return this.err(res, 422, 'frequency and settings.query are required');
      const mon: Monitor = { id: this.id('monitor'), body, status: 'active', events: [] };
      this.monitors.set(mon.id, mon);
      return this.send(res, 201, this.monitorOf(mon));
    }
    if (method === 'GET' && path === '/v1/monitors') return this.send(res, 200, { monitors: [...this.monitors.values()].filter((x) => x.status === 'active').map((x) => this.monitorOf(x)), next_cursor: null });
    m = /^\/v1\/monitors\/([^/]+)(?:\/(events|cancel|trigger|update))?$/.exec(path);
    if (m) {
      const mon = this.monitors.get(m[1]!);
      if (!mon) return this.err(res, 404, 'monitor not found');
      if (method === 'GET' && !m[2]) return this.send(res, 200, this.monitorOf(mon));
      if (method === 'GET' && m[2] === 'events') {
        const limit = Number(url.searchParams.get('limit') ?? 20);
        const cursor = url.searchParams.get('cursor');
        const start = cursor ? Number(cursor) : 0;
        const page = mon.events.slice(start, start + limit);
        return this.send(res, 200, { events: page, next_cursor: start + limit < mon.events.length ? String(start + limit) : null });
      }
      if (method === 'POST' && m[2] === 'cancel') {
        mon.status = 'cancelled';
        return this.send(res, 200, this.monitorOf(mon));
      }
      if (method === 'POST' && m[2] === 'trigger') return this.send(res, 204);
      if (method === 'POST' && m[2] === 'update') return this.send(res, 200, this.monitorOf(mon));
    }
    if (method === 'POST' && path === '/v1beta/memory/retrieve')
      return this.send(res, 200, {
        results: [...this.tasks.values()].slice(0, body?.limit ?? 10).map((t) => ({ kind: 'task', id: t.id, updated_at: '2026-10-14', input_excerpt: String(typeof t.input === 'string' ? t.input : JSON.stringify(t.input)).slice(0, 200), output_excerpt: 'Mock output.' })),
      });
    if (method === 'POST' && path === '/v1beta/tasks/suggest')
      return this.send(res, 200, {
        title: `Task: ${String(body?.user_intent).slice(0, 40)}`,
        input_schema: { type: 'json', json_schema: { type: 'object', properties: { company: { type: 'string' } }, required: ['company'], additionalProperties: false } },
        output_schema: { type: 'json', json_schema: { type: 'object', properties: { summary: { type: 'string' }, founded: { type: 'string' } }, required: ['summary', 'founded'], additionalProperties: false } },
        inputs: [],
        warnings: [],
      });
    this.err(res, 404, `mock has no ${method} ${path}`);
  }

  // ---- Responses ----

  private async responses(body: any, req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (body?.model !== 'parallel') return this.send(res, 400, { error: { message: 'model must be "parallel"', type: 'invalid_request_error', param: 'model', code: null } });
    if (this.hangResponses) {
      this.open.add(res);
      res.on('close', () => {
        if (!res.writableFinished) this.aborted++;
        this.open.delete(res);
      });
      return;
    }
    if (this.options.latencyMs) await sleep(this.options.latencyMs);
    const question = typeof body.input === 'string' ? body.input : JSON.stringify(body.input);
    const text = `Answer to: ${question.slice(0, 80)}. The market is large [1]. Growth is steady [2].`;
    const a1 = text.indexOf('The market is large');
    const a2 = text.indexOf('Growth is steady');
    const annotations = [
      { type: 'url_citation', url: `${MOCK_PARALLEL_SITE}/source-1`, title: 'Mock source 1', start_index: a1, end_index: a1 + 'The market is large [1].'.length },
      { type: 'url_citation', url: `${MOCK_PARALLEL_SITE}/source-2`, title: 'Mock source 2', start_index: a2, end_index: a2 + 'Growth is steady [2].'.length },
    ];
    const output = [
      { type: 'web_search_call', id: 'ws_1', status: 'completed', action: { type: 'search', queries: ['mock query one', 'mock query two'] } },
      { type: 'web_search_call', id: 'ws_2', status: 'completed', action: { type: 'open_page', url: `${MOCK_PARALLEL_SITE}/source-1` } },
      { type: 'message', id: 'msg_1', role: 'assistant', content: [{ type: 'output_text', text: body?.text?.format ? JSON.stringify({ answer: text }) : text, annotations }] },
    ];
    const response = { id: this.id('resp'), object: 'response', status: 'completed', output, usage: { input_tokens: 10, output_tokens: 20 } };
    if (!body.stream) return this.send(res, 200, response);
    const s = this.sse(req, res);
    s.write('response.created', { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } });
    await sleep(15);
    s.write('response.output_item.added', { type: 'response.output_item.added', item: output[0] });
    s.write('response.web_search_call.searching', { type: 'response.web_search_call.searching', item_id: 'ws_1' });
    await sleep(15);
    s.write('response.output_text.delta', { type: 'response.output_text.delta', delta: text });
    for (const a of annotations) s.write('response.output_text.annotation.added', { type: 'response.output_text.annotation.added', annotation: a });
    s.write('response.completed', { type: 'response.completed', response });
    s.end();
  }

  // ---- Tasks ----

  private newTask(body: any, groupId?: string, ms?: number): Task {
    const t: Task = {
      id: this.id('trun'),
      input: body.input,
      processor: body.processor,
      schema: body.task_spec?.output_schema ?? { type: 'auto' },
      status: 'queued',
      created: Date.now(),
      held: this.holdAll && !groupId,
      ...(groupId ? { groupId } : {}),
      ...(body.previous_interaction_id ? { previous: body.previous_interaction_id } : {}),
      ...(body.metadata ? { metadata: body.metadata } : {}),
    };
    (t as any).ms = ms ?? this.options.taskMs ?? 120;
    this.tasks.set(t.id, t);
    return t;
  }

  /** Move a run along with the clock. */
  private advance(t: Task): void {
    if (t.status === 'completed' || t.status === 'failed') return;
    const age = Date.now() - t.created;
    if (age > 8) t.status = 'running';
    if (!t.held && age >= (t as any).ms) {
      if (JSON.stringify(t.input).includes('make-it-fail')) t.status = 'failed';
      else t.status = 'completed';
      t.doneAt = Date.now();
    }
  }

  private taskRun(t: Task) {
    this.advance(t);
    return {
      run_id: t.id,
      interaction_id: t.id,
      status: t.status,
      is_active: t.status === 'queued' || t.status === 'running',
      processor: t.processor,
      ...(t.groupId ? { taskgroup_id: t.groupId } : {}),
      ...(t.status === 'failed' ? { error: { message: 'mock run failed' } } : {}),
      created_at: new Date(t.created).toISOString(),
    };
  }

  private output(t: Task) {
    const topic = typeof t.input === 'string' ? t.input.slice(0, 80) : JSON.stringify(t.input).slice(0, 80);
    const schema = t.schema;
    if (schema?.type === 'json' && schema.json_schema?.properties) {
      const props = schema.json_schema.properties as Record<string, any>;
      const content: Record<string, unknown> = {};
      const basis: any[] = [];
      let i = 0;
      for (const [k, v] of Object.entries(props)) {
        const type = Array.isArray(v?.type) ? v.type[0] : v?.type;
        content[k] = type === 'number' || type === 'integer' ? 42 : type === 'boolean' ? true : type === 'array' ? ['a', 'b'] : `Mock ${k} for ${topic}`;
        basis.push({ field: k, citations: CITES(1 + (i % 2), k), reasoning: `Found ${k}.`, confidence: i === 1 ? 'low' : 'high' });
        i++;
      }
      return { type: 'json', content, basis };
    }
    if (schema?.type === 'auto') {
      return {
        type: 'json',
        content: { summary: `Mock deep research on ${topic}.`, key_points: ['Point one', 'Point two'] },
        basis: [
          { field: 'summary', citations: CITES(3, topic), reasoning: 'Cross-checked.', confidence: 'high' },
          { field: 'key_points.0', citations: CITES(1, topic), reasoning: 'Single source.', confidence: 'low' },
        ],
      };
    }
    return {
      type: 'text',
      content: `# Mock report\n\nResearch on ${topic}. The finding is clear [1], and a second source agrees [2].`,
      basis: [{ field: 'output', citations: CITES(4, topic), reasoning: 'Visited four sites.', confidence: 'high' }],
    };
  }

  private async taskResult(t: Task, timeoutS: number, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const cap = Math.min(timeoutS * 1000, this.options.longPollCapMs ?? 25_000);
    const until = Date.now() + cap;
    let gone = false;
    void req;
    res.on('close', () => {
      gone = true;
    });
    while (Date.now() < until && !gone) {
      this.advance(t);
      if (t.status === 'completed' || t.status === 'failed') break;
      await sleep(15);
    }
    if (gone) {
      this.aborted++;
      return;
    }
    this.advance(t);
    if (t.status === 'failed') return this.err(res, 404, 'run failed');
    if (t.status !== 'completed') return this.err(res, 408, 'run still active');
    this.send(res, 200, { run: this.taskRun(t), output: this.output(t) });
  }

  private async taskEvents(t: Task, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const s = this.sse(req, res);
    const started = Date.now();
    const max = this.options.streamMaxMs ?? 570_000;
    const initial = this.taskRun(t);
    // A busy event loop can finish the mock run before SSE connects. Keep this fixture's promised stats before
    // its terminal event; followTask correctly stops consuming a stream as soon as it sees completion.
    if (initial.status !== 'completed' && initial.status !== 'failed')
      s.write('task_run.state', { type: 'task_run.state', run: initial });
    // Every stream carries at least one plan message and one stats event before the run can finish.
    s.write('task_run.progress_msg.plan', { type: 'task_run.progress_msg.plan', message: 'Planning the research', timestamp: new Date(t.created).toISOString() });
    s.write('task_run.progress_stats', { type: 'task_run.progress_stats', source_stats: { num_sources_considered: 10, num_sources_read: 3, sources_read_sample: [`${MOCK_PARALLEL_SITE}/source-1`] }, progress_meter: 10 });
    let step = 0;
    while (!s.closed()) {
      this.advance(t);
      if (t.status === 'completed' || t.status === 'failed') {
        s.write('task_run.state', { type: 'task_run.state', run: this.taskRun(t), ...(t.status === 'completed' ? { output: this.output(t) } : {}) });
        return s.end();
      }
      if (Date.now() - started > max) return s.end();
      step++;
      const meter = Math.min(95, step * 20);
      s.write('task_run.progress_msg.plan', { type: 'task_run.progress_msg.plan', message: `Searching, step ${step}`, timestamp: new Date(t.created + step * 1000).toISOString() });
      s.write('task_run.progress_stats', { type: 'task_run.progress_stats', source_stats: { num_sources_considered: step * 10, num_sources_read: step * 3, sources_read_sample: [`${MOCK_PARALLEL_SITE}/source-${step}`] }, progress_meter: meter });
      await sleep(25);
    }
  }

  // ---- Task Groups ----

  private groupStatus(g: Group) {
    const counts: Record<string, number> = {};
    for (const id of g.runs) {
      const t = this.tasks.get(id)!;
      this.advance(t);
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    }
    const active = g.runs.some((id) => ['queued', 'running'].includes(this.tasks.get(id)!.status));
    return { taskgroup_id: g.id, status: { num_task_runs: g.runs.length, task_run_status_counts: counts, is_active: active, status_message: active ? 'running' : 'done' } };
  }

  private async groupEvents(g: Group, lastEventId: string | null, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const s = this.sse(req, res);
    const reported = new Set<string>();
    let n = 0;
    const skip = lastEventId ? Number(lastEventId) : 0;
    const emit = (event: string, data: unknown) => {
      n++;
      if (n > skip) s.write(event, data, String(n));
    };
    while (!s.closed()) {
      const status = this.groupStatus(g);
      for (const id of g.runs) {
        const t = this.tasks.get(id)!;
        if ((t.status === 'completed' || t.status === 'failed') && !reported.has(id)) {
          reported.add(id);
          emit('task_run.state', { type: 'task_run.state', run: this.taskRun(t) });
        }
      }
      if (!status.status.is_active) {
        emit('task_group_status', { type: 'task_group_status', status: status.status });
        return s.end();
      }
      await sleep(20);
    }
  }

  // ---- FindAll ----

  private findallBody(f: FindAll) {
    const matched = f.candidates.filter((c) => c.match_status === 'matched').length;
    return {
      findall_id: f.id,
      status: { status: f.status, is_active: f.status === 'queued' || f.status === 'running', metrics: { generated_candidates_count: f.candidates.length, matched_candidates_count: matched }, ...(f.termination ? { termination_reason: f.termination } : {}) },
      generator: f.generator,
    };
  }

  private findallCreate(body: any, res: ServerResponse): void {
    if (!body?.objective || !body?.entity_type || !Array.isArray(body?.match_conditions) || !body?.generator || !body?.match_limit)
      return this.err(res, 422, 'objective, entity_type, match_conditions, generator and match_limit are required');
    const f: FindAll = { id: this.id('findall'), objective: body.objective, generator: body.generator, limit: body.match_limit, status: 'queued', candidates: [], events: [], enrichments: [] };
    this.findalls.set(f.id, f);
    void this.runFindall(f);
    this.send(res, 202, this.findallBody(f));
  }

  private async runFindall(f: FindAll): Promise<void> {
    const step = this.options.findallStepMs ?? 40;
    const total = Math.min(f.limit, this.options.findallMatches ?? 6);
    f.status = 'running';
    for (let i = 1; i <= total && f.status === 'running'; i++) {
      await sleep(step);
      if (f.status !== 'running') break;
      const c = { candidate_id: `cand_${f.id}_${i}`, name: `Mock Co ${i}`, url: `${MOCK_PARALLEL_SITE}/co-${i}`, description: `Company ${i} for: ${f.objective}`, match_status: 'matched', output: { is_relevant: { value: 'yes', type: 'match_condition', is_matched: true } }, basis: [{ field: 'is_relevant', citations: CITES(1, `co ${i}`), reasoning: 'Relevant.', confidence: 'high' }] };
      // Enrichments apply to every match, present and future (spec §8.2).
      for (const e of f.enrichments) for (const p of Object.keys(e?.output_schema?.json_schema?.properties ?? {})) c.output = { ...c.output, [p]: { value: `Mock ${p}`, type: 'enrichment' } };
      f.candidates.push(c);
      f.events.push({ id: String(f.events.length + 1), event: 'findall.candidate.matched', data: { type: 'findall.candidate.matched', data: c } });
    }
    if (f.status === 'running') {
      f.status = 'completed';
      f.termination = total >= f.limit ? 'match_limit_met' : 'candidates_exhausted';
    }
  }

  private async findallRoute(method: string, id: string, sub: string | undefined, url: URL, body: any, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const f = this.findalls.get(id);
    if (!f) return this.err(res, 404, 'findall run not found');
    if (method === 'GET' && !sub) return this.send(res, 200, this.findallBody(f));
    if (method === 'GET' && sub === 'result') return this.send(res, 200, { run: this.findallBody(f), candidates: f.candidates, last_event_id: String(f.events.length) });
    if (method === 'GET' && sub === 'schema') return this.send(res, 200, { objective: f.objective, entity_type: 'companies', match_conditions: [], generator: f.generator });
    if (method === 'POST' && sub === 'cancel') {
      if (f.status === 'completed' || f.status === 'cancelled') return this.err(res, 409, 'run is already over');
      f.status = 'cancelled';
      f.termination = 'user_cancelled';
      return this.send(res, 204);
    }
    if (method === 'POST' && sub === 'enrich') {
      f.enrichments.push(body);
      const props = Object.keys(body?.output_schema?.json_schema?.properties ?? {});
      for (const c of f.candidates) for (const p of props) c.output = { ...c.output, [p]: { value: `Mock ${p}`, type: 'enrichment' } };
      return this.send(res, 200, { objective: f.objective, enrichments: f.enrichments });
    }
    if (method === 'POST' && sub === 'extend') {
      if (f.termination !== 'match_limit_met') return this.err(res, 422, 'only a run that met its match limit can be extended');
      f.limit += Number(body?.additional_match_limit ?? 0);
      f.status = 'queued';
      void this.runFindall(f);
      return this.send(res, 200, this.findallBody(f));
    }
    if (method === 'GET' && sub === 'events') {
      const s = this.sse(req, res);
      let sent = Number(url.searchParams.get('last_event_id') ?? 0);
      while (!s.closed()) {
        s.write('findall.status', { type: 'findall.status', data: this.findallBody(f) });
        while (sent < f.events.length) {
          const e = f.events[sent]!;
          sent++;
          s.write(e.event, e.data, e.id);
        }
        if (f.status === 'completed' || f.status === 'cancelled') {
          s.write('findall.status', { type: 'findall.status', data: this.findallBody(f) });
          return s.end();
        }
        await sleep(25);
      }
      return;
    }
    this.err(res, 404, `mock has no ${method} findall ${sub}`);
  }

  // ---- Monitors ----

  private monitorOf(m: Monitor) {
    return { monitor_id: m.id, status: m.status, frequency: m.body.frequency, processor: m.body.processor ?? 'lite', type: m.body.type ?? 'event_stream', settings: m.body.settings, metadata: m.body.metadata };
  }
}
