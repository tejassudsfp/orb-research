/**
 * A local OpenAI-compatible chat-completions server for deterministic tests. dsh's `llm-pi-ai` row reaches it
 * through a custom `openai-completions` route (see `mockProviderPatch`). It streams SSE chunks exactly the way
 * pi-ai's parser expects (`@earendil-works/pi-ai/dist/api/openai-completions.js`): `choices[0].delta.content`,
 * `delta.tool_calls[]`, a `finish_reason`, then a usage chunk (pi-ai sets `stream_options.include_usage`), then
 * `data: [DONE]`.
 *
 * Each request is answered by the next queued turn (`enqueue`), or by `defaultTurn` when the queue is empty.
 * Timing is controllable per turn so tests can hold a stream open (cancel tests) or pace it (streaming tests).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type MockToolCall = { id?: string; name: string; arguments: Record<string, unknown> };

export type MockTurn = {
  /** Assistant text. Split into `chunks` (default: one chunk per word) and streamed in order. */
  text?: string;
  chunks?: string[];
  /** Tool calls streamed after the text; `finish_reason` becomes `tool_calls`. */
  toolCalls?: MockToolCall[];
  /** Delay before the first chunk, ms. */
  firstDelayMs?: number;
  /**
   * Hold the reply until this resolves (then `firstDelayMs` applies), e.g. until another agent's turn has ended,
   * so an ordering a test depends on does not hang on wall-clock delays under load.
   */
  holdUntil?: () => Promise<unknown>;
  /** Delay between chunks, ms. */
  chunkDelayMs?: number;
  /** Reply with an HTTP error instead of a stream. */
  status?: number;
  /** P4.2: the error body's message (default `mock error <status>`), e.g. "Insufficient Balance". */
  errorMessage?: string;
  /**
   * P4.3: the usage the provider reports for this request (default: 10 prompt tokens, output = text length + 1).
   * `input` is the whole prompt; `cacheRead` of it were cache hits (OpenAI `cached_tokens`).
   */
  usage?: { input: number; output: number; cacheRead?: number };
};

/** P4.2: which wire protocol a request came in on. */
export type MockProtocol = 'openai-completions' | 'openai-responses' | 'anthropic-messages';

export type MockRequest = {
  id: number;
  body: any;
  /** Set when the client closed the connection before the stream finished (e.g. a cancelled turn). */
  aborted: boolean;
  /** Set when the full stream (including `[DONE]`) was written. */
  completed: boolean;
  /** Chunks actually written before completion or abort. */
  chunksSent: number;
  /** P5.1: `Date.now()` when the first content chunk (text or tool call) was written: "the provider responded". */
  firstChunkAt?: number;
  /** The request's `Authorization` header (P4.1: which key the route resolved). Mock keys only. */
  authorization?: string;
  /** P4.2: the `x-api-key` header (Anthropic messages). Mock keys only. */
  apiKey?: string;
  /** P4.2: the protocol (path) of the request. */
  protocol: MockProtocol;
  /** P4.2: the request path, e.g. `/v1/chat/completions`. */
  path: string;
};

export type MockLlmOptions = {
  /** Provider-issued model directories, separate from the model's generation queue. */
  models?: (request: {
    path: string;
    authorization?: string;
    apiKey?: string;
  }) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;
  /** Used when no turn is queued. Default: a short fixed greeting. */
  defaultTurn?: MockTurn | ((req: MockRequest) => MockTurn);
  /**
   * P3.5: answers `POST /v1/responses` (the OpenAI Responses API, used by Orb's OpenAI web search provider) with
   * this JSON body. Unset: 404. See `mockWebSearchResponse`.
   */
  responses?: (body: any) => unknown;
};

/**
 * A Responses API answer with one `web_search_call` and an output text citing `results` (url_citation
 * annotations), the shape Orb's OpenAI search provider reads (packages/orb-sources/src/search.ts).
 */
export function mockWebSearchResponse(
  results: Array<{ url: string; title: string; line: string }>,
  query = 'query',
): unknown {
  let text = '';
  const annotations: unknown[] = [];
  for (const r of results) {
    const start = text.length;
    text += `- ${r.title}: ${r.line} ([source](${r.url}))\n`;
    annotations.push({
      type: 'url_citation',
      start_index: start,
      end_index: text.length - 1,
      url: r.url,
      title: r.title,
    });
  }
  return {
    id: 'resp_mock',
    object: 'response',
    output: [
      {
        type: 'web_search_call',
        id: 'ws_mock',
        status: 'completed',
        action: { type: 'search', query, sources: results.map((r) => ({ type: 'url', url: r.url })) },
      },
      {
        type: 'message',
        id: 'msg_mock',
        role: 'assistant',
        content: [{ type: 'output_text', text, annotations }],
      },
    ],
  };
}

export const MOCK_PROVIDER = 'orb-mock';
export const MOCK_MODEL = 'mock-1';
/** A second model id on the mock route (P3.3: orb.json per-agent model routes). */
export const MOCK_MODEL_ALT = 'mock-2';
/** Env var holding the mock's (meaningless) API key; pi-ai requires a key for the route. */
export const MOCK_KEY_ENV = 'ORB_MOCK_KEY';

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });

export class MockLlm {
  readonly modelListRequests: Array<{ path: string; authorization?: string; apiKey?: string }> = [];
  readonly requests: MockRequest[] = [];
  /** Bodies of `POST /v1/responses` requests (web search), in order. */
  readonly responsesRequests: any[] = [];
  private readonly queue: MockTurn[] = [];
  private readonly waiters = new Set<{
    test: (r: MockRequest) => boolean;
    resolve: (r: MockRequest) => void;
  }>();
  private server?: Server;
  private port = 0;

  constructor(private readonly options: MockLlmOptions = {}) {}

  /** `http://127.0.0.1:<port>/v1`, the route's `baseURL`. */
  get baseURL(): string {
    if (!this.server) throw new Error('mock llm: not started');
    return `http://127.0.0.1:${this.port}/v1`;
  }

  async start(): Promise<this> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.port = (this.server.address() as AddressInfo).port;
    return this;
  }

  async close(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** Queue the reply for the next chat-completions request. */
  enqueue(...turns: MockTurn[]): this {
    this.queue.push(...turns);
    return this;
  }

  /** Resolves with the first request (already received or future) that matches. */
  waitForRequest(test: (r: MockRequest) => boolean = () => true, timeoutMs = 30_000): Promise<MockRequest> {
    const hit = this.requests.find(test);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const waiter = {
        test,
        resolve: (r: MockRequest) => {
          clearTimeout(timer);
          this.waiters.delete(waiter);
          resolve(r);
        },
      };
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error('mock llm: no matching request in time'));
      }, timeoutMs);
      this.waiters.add(waiter);
    });
  }

  private notify(r: MockRequest) {
    for (const w of [...this.waiters]) if (w.test(r)) w.resolve(r);
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    // P4.2: model listings for discovery (OpenAI-style `/models`; Anthropic `/v1/models`).
    if (req.method === 'GET' && path.endsWith('/models')) {
      const request = {
        path: req.url!,
        ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
        ...(req.headers['x-api-key'] ? { apiKey: String(req.headers['x-api-key']) } : {}),
      };
      this.modelListRequests.push(request);
      const listed = await this.options.models?.(request);
      res.writeHead(listed?.status ?? 200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify(
          listed
            ? listed.body
            : {
                object: 'list',
                data: [
                  { id: MOCK_MODEL, object: 'model', owned_by: 'orb' },
                  { id: MOCK_MODEL_ALT, object: 'model', owned_by: 'orb' },
                ],
              },
        ),
      );
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(404).end();
      return;
    }
    let protocol: MockProtocol;
    if (path.endsWith('/chat/completions')) protocol = 'openai-completions';
    else if (path.endsWith('/messages')) protocol = 'anthropic-messages';
    else if (path.endsWith('/responses')) protocol = 'openai-responses';
    else {
      res.writeHead(404).end();
      return;
    }
    let raw = '';
    for await (const part of req) raw += part;
    const body = JSON.parse(raw || '{}');
    // P3.5: a non-streaming Responses request is Orb's OpenAI web search provider.
    if (protocol === 'openai-responses' && body.stream !== true) {
      if (!this.options.responses) {
        res.writeHead(404).end();
        return;
      }
      this.responsesRequests.push(body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(this.options.responses(body)));
      return;
    }
    const record: MockRequest = {
      id: this.requests.length + 1,
      body,
      aborted: false,
      completed: false,
      chunksSent: 0,
      protocol,
      path,
      ...(typeof req.headers.authorization === 'string' ? { authorization: req.headers.authorization } : {}),
      ...(typeof req.headers['x-api-key'] === 'string' ? { apiKey: req.headers['x-api-key'] } : {}),
    };
    this.requests.push(record);

    const closed = new AbortController();
    res.on('close', () => {
      if (!record.completed) record.aborted = true;
      closed.abort();
    });

    const fallback = this.options.defaultTurn ?? { text: 'Hello from the mock model.' };
    const turn = this.queue.shift() ?? (typeof fallback === 'function' ? fallback(record) : fallback);
    this.notify(record);

    if (turn.status && turn.status >= 400) {
      const message = turn.errorMessage ?? `mock error ${turn.status}`;
      res.writeHead(turn.status, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify(
          protocol === 'anthropic-messages'
            ? { type: 'error', error: { type: 'mock_error', message } }
            : { error: { message, type: 'mock', code: null } },
        ),
      );
      return;
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const write = (payload: unknown, event?: string) => {
      if (closed.signal.aborted) return false;
      res.write(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(payload)}\n\n`);
      return true;
    };
    const model = typeof record.body.model === 'string' ? record.body.model : MOCK_MODEL;
    const chunks = turn.chunks ?? (turn.text ? turn.text.split(/(?<= )/) : []);
    if (turn.holdUntil) await turn.holdUntil().catch(() => undefined);
    await sleep(turn.firstDelayMs ?? 0, closed.signal);

    if (protocol === 'anthropic-messages') {
      // P4.2: the Anthropic messages stream (text only), the events pi-ai reads (api/anthropic-messages.js).
      const id = `msg_mock_${record.id}`;
      const usage = { input_tokens: 10, output_tokens: 0 };
      if (
        !write(
          {
            type: 'message_start',
            message: { id, type: 'message', role: 'assistant', model, content: [], usage },
          },
          'message_start',
        )
      )
        return;
      if (
        !write(
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          'content_block_start',
        )
      )
        return;
      for (const [i, text] of chunks.entries()) {
        if (i > 0) await sleep(turn.chunkDelayMs ?? 0, closed.signal);
        if (
          !write(
            { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
            'content_block_delta',
          )
        )
          return;
        record.firstChunkAt ??= Date.now();
        record.chunksSent++;
      }
      if (!write({ type: 'content_block_stop', index: 0 }, 'content_block_stop')) return;
      const output = chunks.join('').length + 1;
      if (
        !write(
          {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: output },
          },
          'message_delta',
        )
      )
        return;
      if (!write({ type: 'message_stop' }, 'message_stop')) return;
      record.completed = true;
      res.end();
      return;
    }

    if (protocol === 'openai-responses') {
      // P4.2: the OpenAI Responses stream (text only), the events pi-ai reads (api/openai-responses-shared.js).
      const id = `resp_mock_${record.id}`;
      const msgId = `msg_mock_${record.id}`;
      if (!write({ type: 'response.created', response: { id, status: 'in_progress', output: [] } })) return;
      if (
        !write({
          type: 'response.output_item.added',
          output_index: 0,
          item: { type: 'message', id: msgId, role: 'assistant', content: [] },
        })
      )
        return;
      for (const [i, delta] of chunks.entries()) {
        if (i > 0) await sleep(turn.chunkDelayMs ?? 0, closed.signal);
        if (!write({ type: 'response.output_text.delta', output_index: 0, content_index: 0, delta })) return;
        record.firstChunkAt ??= Date.now();
        record.chunksSent++;
      }
      const text = chunks.join('');
      const item = {
        type: 'message',
        id: msgId,
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      };
      if (!write({ type: 'response.output_item.done', output_index: 0, item })) return;
      const output = turn.usage?.output ?? text.length + 1;
      const input = turn.usage?.input ?? 10;
      if (
        !write({
          type: 'response.completed',
          response: {
            id,
            status: 'completed',
            output: [item],
            usage: {
              input_tokens: input,
              output_tokens: output,
              total_tokens: input + output,
              input_tokens_details: { cached_tokens: turn.usage?.cacheRead ?? 0 },
            },
          },
        })
      )
        return;
      record.completed = true;
      res.end();
      return;
    }

    const id = `chatcmpl-mock-${record.id}`;
    const base = { id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model };
    if (
      !write({
        ...base,
        choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
      })
    )
      return;

    for (const [i, content] of chunks.entries()) {
      if (i > 0) await sleep(turn.chunkDelayMs ?? 0, closed.signal);
      if (!write({ ...base, choices: [{ index: 0, delta: { content }, finish_reason: null }] })) return;
      record.firstChunkAt ??= Date.now();
      record.chunksSent++;
    }
    for (const [index, call] of (turn.toolCalls ?? []).entries()) {
      await sleep(turn.chunkDelayMs ?? 0, closed.signal);
      const delta = {
        tool_calls: [
          {
            index,
            id: call.id ?? `call_mock_${record.id}_${index}`,
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.arguments) },
          },
        ],
      };
      if (!write({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })) return;
      record.firstChunkAt ??= Date.now();
      record.chunksSent++;
    }
    const finish = turn.toolCalls?.length ? 'tool_calls' : 'stop';
    if (!write({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finish }] })) return;
    const completion = turn.usage?.output ?? chunks.join('').length + 1;
    const prompt = turn.usage?.input ?? 10;
    if (
      !write({
        ...base,
        choices: [],
        usage: {
          prompt_tokens: prompt,
          completion_tokens: completion,
          total_tokens: prompt + completion,
          ...(turn.usage?.cacheRead
            ? { prompt_tokens_details: { cached_tokens: turn.usage.cacheRead } }
            : {}),
        },
      })
    )
      return;
    record.completed = true;
    res.end('data: [DONE]\n\n');
  }
}

/**
 * Profile patch rows that route the default model to the mock. `config` replaces a row's config whole, so the
 * OpenAI route from `profiles/orb/cordis.patch.yml` is restated.
 */
export function mockProviderPatch(baseURL: string): string {
  return [
    '# Test-only: route the default model to the local mock LLM (scripts/testkit/mockLlm.ts).',
    '- id: llm-pi-ai',
    '  config:',
    '    providers:',
    '      openai:',
    '        apiKeyEnv: OPENAI_API_KEY',
    '        cacheRetention: long',
    `      ${MOCK_PROVIDER}:`,
    '        api: openai-completions',
    '        cacheRetention: long',
    `        baseURL: ${JSON.stringify(baseURL)}`,
    `        apiKeyEnv: ${MOCK_KEY_ENV}`,
    '        models:',
    `          - id: ${MOCK_MODEL}`,
    '            contextWindow: 128000',
    '            maxTokens: 4096',
    `          - id: ${MOCK_MODEL_ALT}`,
    '            contextWindow: 128000',
    '            maxTokens: 4096',
    '- id: agent-default-model',
    '  config:',
    `    provider: ${MOCK_PROVIDER}`,
    `    model: ${MOCK_MODEL}`,
    '',
  ].join('\n');
}

/**
 * P3.5: point Orb's OpenAI web search provider (`orb-web-search` row, packages/orb-canvas/src/web.ts) at the mock's
 * `/v1/responses`, with the mock key as its key reference, so `web_search` runs through the real harness web seam.
 */
export function mockSearchPatch(baseURL: string): string {
  return [
    "# Test-only: Orb's OpenAI web search provider on the mock LLM.",
    '- id: orb-web-search',
    '  config:',
    '    openai:',
    `      apiKeyEnv: ${MOCK_KEY_ENV}`,
    `      endpoint: ${JSON.stringify(baseURL)}`,
    `      model: ${MOCK_MODEL}`,
    '',
  ].join('\n');
}

/**
 * P4.2: the four provider cards' catalog routes (OpenAI, DeepSeek, Anthropic, OpenRouter) pointed at the mock with a
 * route-level `baseURL`, so each one's real wire protocol (OpenAI responses, chat completions, Anthropic messages) runs
 * against the local server with the key the route resolves from the Keychain. Plus the mock route, whose key reference
 * is `mockKeyRef` (default: the env mock key). `defaultRoute` sets `agent-default-model` (default: the mock route).
 */
export function mockCatalogPatch(
  baseURL: string,
  opts: { mockKeyRef?: string; defaultRoute?: { provider: string; model: string } } = {},
): string {
  const origin = new URL(baseURL).origin;
  const route = opts.defaultRoute ?? { provider: MOCK_PROVIDER, model: MOCK_MODEL };
  return [
    '# Test-only (P4.2): every provider card routed to the local mock LLM (scripts/testkit/mockLlm.ts).',
    '- id: llm-pi-ai',
    '  config:',
    '    providers:',
    '      openai:',
    '        apiKeyEnv: OPENAI_API_KEY',
    `        baseURL: ${JSON.stringify(baseURL)}`,
    '      deepseek:',
    '        apiKeyEnv: DEEPSEEK_API_KEY',
    `        baseURL: ${JSON.stringify(baseURL)}`,
    '      anthropic:',
    '        apiKeyEnv: ANTHROPIC_API_KEY',
    `        baseURL: ${JSON.stringify(origin)}`,
    '      openrouter:',
    '        apiKeyEnv: OPENROUTER_API_KEY',
    `        baseURL: ${JSON.stringify(baseURL)}`,
    `      ${MOCK_PROVIDER}:`,
    '        api: openai-completions',
    `        baseURL: ${JSON.stringify(baseURL)}`,
    `        apiKeyEnv: ${opts.mockKeyRef ?? MOCK_KEY_ENV}`,
    '        models:',
    `          - id: ${MOCK_MODEL}`,
    '            contextWindow: 128000',
    '            maxTokens: 4096',
    `          - id: ${MOCK_MODEL_ALT}`,
    '            contextWindow: 128000',
    '            maxTokens: 4096',
    '- id: agent-default-model',
    '  config:',
    `    provider: ${route.provider}`,
    `    model: ${route.model}`,
    '',
  ].join('\n');
}
