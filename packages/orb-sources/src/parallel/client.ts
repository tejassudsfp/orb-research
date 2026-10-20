/**
 * Parallel Web Systems REST client (P6.7; docs/phase6/parallel-api-spec.md). Thin `fetch` wrappers over the one host
 * `api.parallel.ai` (`x-api-key`): no SDK, no MCP, no beta headers. Harness-free. Every call takes an AbortSignal and
 * stops at once when it fires. Requests go through the global dispatcher (dsh-http-proxy installs the proxy there), so
 * in the egress audit the mock `api.parallel.ai` is reached only through the logging proxy.
 *
 * Errors are SourceErrors (`NOT_CONFIGURED` with no key, `TIMEOUT`, `NETWORK`, `PROVIDER_ERROR`) carrying the HTTP
 * status and whether a retry makes sense (401, 402, 403, 404, 422 never; 408, 429, 5xx may).
 */
import { SourceError } from '../errors.js';
import { eventJson, parseSse, type SseEvent } from './sse.js';

export const PARALLEL_DEFAULT_BASE = 'https://api.parallel.ai';
export const CLIENT_MODEL = 'gpt-6-luna';

export class ParallelError extends SourceError {
  constructor(
    code: SourceError['code'],
    message: string,
    readonly status?: number,
    readonly retryable = false,
    options?: { cause?: unknown },
  ) {
    super(code, message, options);
    this.name = 'ParallelError';
  }
}

export type ParallelDeps = {
  /** The key for THIS operation (never cached across operations). */
  apiKey: () => Promise<string | undefined>;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Per-request timeout, ms (default 60 s; long polls and streams set their own). */
  timeoutMs?: number;
  clientModel?: string;
  /** Pause before a retry, ms (tests set 0). */
  retryDelayMs?: number;
};

export type RequestOptions = {
  signal?: AbortSignal | undefined;
  timeoutMs?: number;
  query?: Record<string, string | number | undefined>;
  /** Retry a POST on a server error too (only for calls that are safe to repeat). */
  retryPost?: boolean;
};

const MESSAGES: Record<number, string> = {
  401: 'the Parallel key was refused (check it in Settings)',
  402: 'Parallel has no credit left for this (add credit at platform.parallel.ai)',
  403: 'Parallel refused this request (an invalid processor, or the account may not use it)',
  404: 'Parallel has no such run or item',
  422: 'Parallel could not accept the request',
  429: 'Parallel rate limit reached; wait a moment',
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal!.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/** The error text Parallel sent, one short line. */
function detailOf(body: any): string {
  const e = body?.error;
  const d =
    (typeof e === 'string' ? e : undefined) ?? e?.message ?? body?.message ?? (Array.isArray(body?.detail) ? body.detail[0]?.msg : body?.detail);
  return typeof d === 'string' ? d.replace(/\s+/g, ' ').slice(0, 300) : '';
}

export class ParallelClient {
  private readonly base: string;
  private readonly doFetch: typeof fetch;

  constructor(private readonly deps: ParallelDeps) {
    this.base = (deps.baseUrl || PARALLEL_DEFAULT_BASE).replace(/\/+$/, '');
    this.doFetch = deps.fetch ?? fetch;
  }

  get clientModel(): string {
    return this.deps.clientModel ?? CLIENT_MODEL;
  }

  private async key(): Promise<string> {
    const key = await this.deps.apiKey();
    if (!key) throw new ParallelError('NOT_CONFIGURED', 'Parallel has no key (PARALLEL_API_KEY): add it in Settings › Models');
    return key;
  }

  private url(path: string, query?: RequestOptions['query']): string {
    const u = new URL(`${this.base}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) u.searchParams.set(k, String(v));
    return u.href;
  }

  /** One HTTP round trip, with the timeout, the error mapping and the retry policy. */
  private async send(method: 'GET' | 'POST', path: string, body: unknown, opts: RequestOptions, stream: boolean): Promise<Response> {
    const key = await this.key();
    const timeoutMs = opts.timeoutMs ?? this.deps.timeoutMs ?? 60_000;
    for (let attempt = 0; ; attempt++) {
      opts.signal?.throwIfAborted();
      const timeout = stream ? undefined : AbortSignal.timeout(timeoutMs);
      const signals = [opts.signal, timeout].filter((s): s is AbortSignal => s !== undefined);
      const all = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
      let res: Response;
      try {
        res = await this.doFetch(this.url(path, opts.query), {
          method,
          redirect: 'error',
          headers: {
            'x-api-key': key,
            accept: stream ? 'text/event-stream' : 'application/json',
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          ...(all ? { signal: all } : {}),
        });
      } catch (err) {
        if (opts.signal?.aborted) throw opts.signal.reason;
        if (timeout?.aborted) throw new ParallelError('TIMEOUT', `Parallel did not answer within ${Math.round(timeoutMs / 1000)} s`, undefined, true);
        if (attempt < 2 && method === 'GET') {
          await sleep(this.retryDelay(attempt), opts.signal);
          continue;
        }
        throw new ParallelError('NETWORK', `Parallel could not be reached: ${(err as Error).message}`, undefined, true, { cause: err });
      }
      if (res.ok) return res;
      let detail = '';
      try {
        detail = detailOf(await res.json());
      } catch {
        // no JSON body
      }
      const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
      const mayRetry = res.status === 429 || res.status === 503 || (method === 'GET' && retryable) || (opts.retryPost === true && retryable);
      if (mayRetry && attempt < 2 && !stream) {
        await sleep(this.retryDelay(attempt), opts.signal);
        continue;
      }
      const base = MESSAGES[res.status] ?? `Parallel answered HTTP ${res.status}`;
      throw new ParallelError('PROVIDER_ERROR', `${base}${detail ? `: ${detail}` : ''}`, res.status, retryable);
    }
  }

  private retryDelay(attempt: number): number {
    return (this.deps.retryDelayMs ?? 500) * 2 ** attempt;
  }

  async json<T = any>(method: 'GET' | 'POST', path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    const res = await this.send(method, path, body, opts, false);
    if (res.status === 204) return undefined as T;
    try {
      return (await res.json()) as T;
    } catch (err) {
      throw new ParallelError('PROVIDER_ERROR', 'Parallel sent a response orb could not read', res.status, false, { cause: err });
    }
  }

  /** A server-sent event stream. Ends when Parallel closes it (a Task stream closes after at most 570 s). */
  async *events(path: string, opts: RequestOptions = {}): AsyncGenerator<SseEvent> {
    const res = await this.send('GET', path, undefined, opts, true);
    if (!res.body) return;
    yield* parseSse(res.body, opts.signal);
  }

  // ---- Search, Image Search, Extract ----

  search(body: ParallelSearchRequest, opts?: RequestOptions): Promise<ParallelSearchResponse> {
    return this.json('POST', '/v1/search', { client_model: this.clientModel, ...body }, { retryPost: true, ...opts });
  }
  imageSearch(body: ImageSearchRequest, opts?: RequestOptions): Promise<ImageSearchResponse> {
    return this.json('POST', '/v1/images/search', { client_model: this.clientModel, ...body }, { retryPost: true, ...opts });
  }
  extract(body: ExtractRequest, opts?: RequestOptions): Promise<ExtractResponse> {
    return this.json('POST', '/v1/extract', { client_model: this.clientModel, ...body }, { retryPost: true, timeoutMs: 100_000, ...opts });
  }

  // ---- Responses (the cited, synthesized answer) ----

  responses(body: Record<string, unknown>, opts?: RequestOptions): Promise<any> {
    return this.json('POST', '/v1/responses', { model: 'parallel', ...body }, { ...opts });
  }
  /** `stream: true`: the OpenAI event sequence (`response.created`, `…web_search_call.searching`, `…output_text.delta`, `…completed`). */
  responsesStream(body: Record<string, unknown>, opts?: RequestOptions): AsyncGenerator<SseEvent> {
    return this.postEvents('/v1/responses', { model: 'parallel', ...body, stream: true }, opts);
  }
  private async *postEvents(path: string, body: unknown, opts: RequestOptions = {}): AsyncGenerator<SseEvent> {
    const res = await this.send('POST', path, body, opts, true);
    if (!res.body) return;
    yield* parseSse(res.body, opts.signal);
  }

  // ---- Task API ----

  taskCreate(body: Record<string, unknown>, opts?: RequestOptions): Promise<TaskRun> {
    return this.json('POST', '/v1/tasks/runs', body, opts);
  }
  taskGet(runId: string, opts?: RequestOptions): Promise<TaskRun> {
    return this.json('GET', `/v1/tasks/runs/${encodeURIComponent(runId)}`, undefined, opts);
  }
  /** Blocks up to `timeout` s; a 408 means the run is still active (returned as `undefined`). */
  async taskResult(runId: string, timeoutSeconds: number, opts: RequestOptions = {}): Promise<TaskRunResult | undefined> {
    try {
      return await this.json('GET', `/v1/tasks/runs/${encodeURIComponent(runId)}/result`, undefined, {
        ...opts,
        query: { timeout: timeoutSeconds },
        timeoutMs: (timeoutSeconds + 20) * 1000,
      });
    } catch (err) {
      if (err instanceof ParallelError && err.status === 408) return undefined;
      throw err;
    }
  }
  taskEvents(runId: string, opts?: RequestOptions): AsyncGenerator<SseEvent> {
    return this.events(`/v1/tasks/runs/${encodeURIComponent(runId)}/events`, opts);
  }

  // ---- Task Groups ----

  groupCreate(opts?: RequestOptions & { metadata?: Record<string, string> }): Promise<TaskGroup> {
    return this.json('POST', '/v1/tasks/groups', { ...(opts?.metadata ? { metadata: opts.metadata } : {}) }, opts);
  }
  groupAddRuns(groupId: string, body: { default_task_spec?: unknown; inputs: unknown[] }, opts?: RequestOptions): Promise<{ run_ids: string[]; status: TaskGroup['status'] }> {
    return this.json('POST', `/v1/tasks/groups/${encodeURIComponent(groupId)}/runs`, body, opts);
  }
  groupGet(groupId: string, opts?: RequestOptions): Promise<TaskGroup> {
    return this.json('GET', `/v1/tasks/groups/${encodeURIComponent(groupId)}`, undefined, opts);
  }
  /** Resumable with `lastEventId`; open up to an hour while runs are active. */
  groupEvents(groupId: string, opts: RequestOptions & { lastEventId?: string } = {}): AsyncGenerator<SseEvent> {
    const { lastEventId, ...rest } = opts;
    return this.events(`/v1/tasks/groups/${encodeURIComponent(groupId)}/events`, { ...rest, query: { ...rest.query, last_event_id: lastEventId, timeout: 600 } });
  }

  // ---- FindAll ----

  findallIngest(objective: string, opts?: RequestOptions): Promise<FindAllSchema> {
    return this.json('POST', '/v1beta/findall/ingest', { objective }, { retryPost: true, ...opts });
  }
  findallCreate(body: Record<string, unknown>, opts?: RequestOptions): Promise<FindAllRun> {
    return this.json('POST', '/v1beta/findall/runs', body, opts);
  }
  findallGet(id: string, opts?: RequestOptions): Promise<FindAllRun> {
    return this.json('GET', `/v1beta/findall/runs/${encodeURIComponent(id)}`, undefined, opts);
  }
  findallResult(id: string, opts?: RequestOptions): Promise<FindAllResult> {
    return this.json('GET', `/v1beta/findall/runs/${encodeURIComponent(id)}/result`, undefined, opts);
  }
  findallEvents(id: string, opts: RequestOptions & { lastEventId?: string } = {}): AsyncGenerator<SseEvent> {
    const { lastEventId, ...rest } = opts;
    return this.events(`/v1beta/findall/runs/${encodeURIComponent(id)}/events`, { ...rest, query: { ...rest.query, last_event_id: lastEventId, timeout: 600 } });
  }
  /** A real cancellation (204; 409 when the run is already over, which is not a failure here). */
  async findallCancel(id: string, opts?: RequestOptions): Promise<boolean> {
    try {
      await this.json('POST', `/v1beta/findall/runs/${encodeURIComponent(id)}/cancel`, {}, opts);
      return true;
    } catch (err) {
      if (err instanceof ParallelError && err.status === 409) return false;
      throw err;
    }
  }
  findallEnrich(id: string, body: Record<string, unknown>, opts?: RequestOptions): Promise<FindAllSchema> {
    return this.json('POST', `/v1beta/findall/runs/${encodeURIComponent(id)}/enrich`, body, opts);
  }
  findallExtend(id: string, additional: number, opts?: RequestOptions): Promise<unknown> {
    return this.json('POST', `/v1beta/findall/runs/${encodeURIComponent(id)}/extend`, { additional_match_limit: additional }, opts);
  }
  entitySearch(body: { entity_type: 'people' | 'companies'; objective: string; match_limit?: number }, opts?: RequestOptions): Promise<EntitySearchResponse> {
    return this.json('POST', '/v1beta/findall/entity-search', body, { retryPost: true, ...opts });
  }

  // ---- Monitors ----

  monitorCreate(body: Record<string, unknown>, opts?: RequestOptions): Promise<Monitor> {
    return this.json('POST', '/v1/monitors', body, opts);
  }
  monitorList(opts?: RequestOptions & { status?: string }): Promise<{ monitors: Monitor[]; next_cursor?: string | null }> {
    return this.json('GET', '/v1/monitors', undefined, { ...opts, query: { ...opts?.query, limit: 100 } });
  }
  monitorGet(id: string, opts?: RequestOptions): Promise<Monitor> {
    return this.json('GET', `/v1/monitors/${encodeURIComponent(id)}`, undefined, opts);
  }
  monitorEvents(id: string, opts: RequestOptions & { cursor?: string; limit?: number } = {}): Promise<{ events: MonitorEvent[]; next_cursor?: string | null }> {
    const { cursor, limit, ...rest } = opts;
    return this.json('GET', `/v1/monitors/${encodeURIComponent(id)}/events`, undefined, { ...rest, query: { ...rest.query, cursor, limit: limit ?? 20 } });
  }
  async monitorCancel(id: string, opts?: RequestOptions): Promise<void> {
    await this.json('POST', `/v1/monitors/${encodeURIComponent(id)}/cancel`, {}, opts);
  }

  // ---- Memory and Task Suggest (beta) ----

  memoryRetrieve(body: Record<string, unknown>, opts?: RequestOptions): Promise<{ results: any[] }> {
    return this.json('POST', '/v1beta/memory/retrieve', body, { retryPost: true, ...opts });
  }
  taskSuggest(userIntent: string, opts?: RequestOptions): Promise<any> {
    return this.json('POST', '/v1beta/tasks/suggest', { user_intent: userIntent }, { retryPost: true, ...opts });
  }
}

// ---- Wire shapes (only what orb reads; unknown fields are kept) ----

export type SourcePolicy = { include_domains?: string[]; exclude_domains?: string[]; after_date?: string };
export type ParallelSearchRequest = {
  search_queries: string[];
  objective?: string;
  mode?: 'turbo' | 'fast' | 'basic' | 'advanced';
  session_id?: string;
  max_chars_total?: number;
  advanced_settings?: { source_policy?: SourcePolicy; location?: string; max_results?: number };
};
export type ParallelSearchResult = { url: string; title?: string | null; publish_date?: string | null; excerpts?: string[] };
export type ParallelSearchResponse = { search_id?: string; session_id?: string; results: ParallelSearchResult[]; warnings?: unknown[] };
export type ImageSearchRequest = {
  search_queries: string[];
  objective?: string;
  mode?: 'fast' | 'advanced';
  session_id?: string;
  advanced_settings?: { location?: string; max_results?: number };
};
export type ImageResult = { title?: string; image_url: string; source_page_url: string; width?: number; height?: number };
export type ImageSearchResponse = { search_id?: string; results: ImageResult[] };
export type ExtractRequest = {
  urls: string[];
  objective?: string;
  search_queries?: string[];
  session_id?: string;
  advanced_settings?: { fetch_policy?: { max_age_seconds?: number }; full_content?: boolean | { max_chars_per_result: number } };
};
export type ExtractResponse = {
  extract_id?: string;
  results: Array<{ url: string; title?: string | null; publish_date?: string | null; excerpts?: string[]; full_content?: string }>;
  errors?: Array<{ url: string; error_type?: string; http_status_code?: number; content?: string }>;
};

export type Basis = { field: string; citations?: Array<{ url: string; title?: string | null; excerpts?: string[] | null }>; reasoning?: string; confidence?: 'high' | 'medium' | 'low' | null };
export type TaskRun = { run_id: string; interaction_id?: string; status: string; is_active?: boolean; error?: { message?: string } | null; processor?: string };
export type TaskRunResult = { run: TaskRun; output: { type: 'text' | 'json'; content: unknown; basis?: Basis[] } };
export type TaskGroup = { taskgroup_id: string; status: { num_task_runs: number; task_run_status_counts?: Record<string, number>; is_active: boolean; status_message?: string | null } };
export type FindAllSchema = { objective?: string; entity_type?: string; match_conditions?: Array<{ name: string; description: string }>; generator?: string; match_limit?: number; enrichments?: unknown[] };
export type FindAllRun = { findall_id: string; status: { status: string; is_active: boolean; metrics?: { generated_candidates_count?: number; matched_candidates_count?: number }; termination_reason?: string | null }; generator?: string };
export type FindAllCandidate = { candidate_id: string; name: string; url?: string; description?: string; match_status: string; output?: Record<string, { value?: unknown; type?: string; is_matched?: boolean }>; basis?: Basis[] };
export type FindAllResult = { run: FindAllRun; candidates: FindAllCandidate[]; last_event_id?: string };
export type EntitySearchResponse = { entity_set_id?: string; entities: Array<{ name: string; url?: string; description?: string }> };
export type Monitor = { monitor_id: string; status?: string; frequency?: string; processor?: string; type?: string; settings?: { query?: string } };
export type MonitorEvent = { event_id: string; event_group_id?: string; event_type?: string; event_date?: string; output?: { type?: string; content?: unknown; basis?: Basis[] }; changed_output?: unknown; error_message?: string };

export { eventJson, parseSse };
export type { SseEvent };
