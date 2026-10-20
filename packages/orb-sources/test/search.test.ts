/** P3.5 search providers: request shapes, mapping, priority and errors, against a local stand-in for each API. */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BraveSearchProvider,
  OpenAiSearchProvider,
  TavilySearchProvider,
  mapResponsesSearch,
  selectSearchProvider,
} from '../src/index.js';

type Seen = { method: string; path: string; headers: IncomingMessage['headers']; body: any };
let server: Server;
let base = '';
const seen: Seen[] = [];
let failNext = 0;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const url = new URL(req.url ?? '/', 'http://x');
    seen.push({
      method: req.method ?? '',
      path: `${url.pathname}${url.search}`,
      headers: req.headers,
      body: raw ? JSON.parse(raw) : undefined,
    });
    if (failNext) {
      res
        .writeHead(failNext, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: { message: 'bad key' } }));
      failNext = 0;
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (url.pathname === '/brave')
      res.end(
        JSON.stringify({
          web: {
            results: [
              {
                title: 'A <strong>battery</strong> study',
                url: 'https://a.example/study',
                description: 'Cells &amp; <strong>density</strong>',
                page_age: '2026-01-02',
              },
              { title: 'Bad', url: 'javascript:alert(1)' },
            ],
          },
        }),
      );
    else if (url.pathname === '/tavily')
      res.end(
        JSON.stringify({
          answer: 'Short answer.',
          results: [
            { title: 'T', url: 'https://t.example/', content: 'Snippet', published_date: '2026-02-03' },
          ],
        }),
      );
    else if (url.pathname === '/v1/responses')
      res.end(
        JSON.stringify({
          output: [
            {
              type: 'web_search_call',
              id: 'ws_1',
              status: 'completed',
              action: {
                type: 'search',
                query: 'q',
                sources: [
                  { type: 'url', url: 'https://extra.example/' },
                  { type: 'url', url: 'https://o.example/r?utm_source=openai' },
                ],
              },
            },
            {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: '- Report 2026: grid storage doubled ([o.example](https://o.example/r?utm_source=openai)).\n- Other line.',
                  annotations: [
                    {
                      type: 'url_citation',
                      start_index: 37,
                      end_index: 85,
                      url: 'https://o.example/r?utm_source=openai',
                      title: 'Report 2026',
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );
    else res.end('{}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

const deps = (endpoint: string, key: string | undefined = 'k-123') => ({
  apiKey: async () => key,
  inForce: () => true,
  endpoint,
});

describe('search providers', () => {
  it('picks the first configured provider: Brave, then Tavily, then OpenAI', () => {
    expect(selectSearchProvider({})).toBeUndefined();
    expect(selectSearchProvider({ openai: true })).toBe('openai');
    expect(selectSearchProvider({ openai: true, tavily: true })).toBe('tavily');
    expect(selectSearchProvider({ openai: true, tavily: true, brave: true })).toBe('brave');
  });

  it('Brave: key in X-Subscription-Token, tags stripped, non-http results dropped', async () => {
    const out = await new BraveSearchProvider(deps(`${base}/brave`)).search({
      query: 'solid state',
      maxResults: 5,
    });
    const req = seen.at(-1)!;
    expect(req.path).toBe('/brave?q=solid+state&count=5');
    expect(req.headers['x-subscription-token']).toBe('k-123');
    expect(out.sources).toEqual([
      {
        url: 'https://a.example/study',
        title: 'A battery study',
        snippet: 'Cells & density',
        publishedAt: '2026-01-02',
      },
    ]);
  });

  it('Tavily: bearer key, JSON body, answer as content', async () => {
    const out = await new TavilySearchProvider(deps(`${base}/tavily`)).search({ query: 'q', maxResults: 3 });
    const req = seen.at(-1)!;
    expect(req.headers.authorization).toBe('Bearer k-123');
    expect(req.body).toMatchObject({ query: 'q', max_results: 3, search_depth: 'basic' });
    expect(out).toEqual({
      content: 'Short answer.',
      sources: [{ url: 'https://t.example/', title: 'T', snippet: 'Snippet', publishedAt: '2026-02-03' }],
      truncated: false,
    });
  });

  it('OpenAI: Responses API with the web_search tool; citations become sources', async () => {
    const out = await new OpenAiSearchProvider({ ...deps(`${base}/v1`), model: 'gpt-6-luna' }).search({
      query: 'grid storage',
    });
    const req = seen.at(-1)!;
    expect(req.path).toBe('/v1/responses');
    expect(req.headers.authorization).toBe('Bearer k-123');
    expect(req.body).toMatchObject({
      model: 'gpt-6-luna',
      tools: [{ type: 'web_search' }],
      include: ['web_search_call.action.sources'],
      store: false,
    });
    expect(req.body.input).toContain('grid storage');
    expect(out.sources).toEqual([
      { url: 'https://o.example/r', title: 'Report 2026', snippet: 'Report 2026: grid storage doubled.' },
      { url: 'https://extra.example/' },
    ]);
    expect(out.content).toContain('grid storage doubled');
  });

  it('OpenAI: at most maxResults sources, cited ones first (the search call lists every page it saw)', async () => {
    const out = await new OpenAiSearchProvider({ ...deps(`${base}/v1`), model: 'gpt-6-luna' }).search({
      query: 'grid storage',
      maxResults: 1,
    });
    expect(out.sources).toEqual([
      { url: 'https://o.example/r', title: 'Report 2026', snippet: 'Report 2026: grid storage doubled.' },
    ]);
    expect(out.truncated).toBe(true);
  });

  it('an answer without a search call is an error, not a made-up result', () => {
    expect(() =>
      mapResponsesSearch({
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'From memory', annotations: [] }] },
        ],
      }),
    ).toThrow(/did not search/);
  });

  it('missing keys and HTTP errors are clear errors (the key is never echoed)', async () => {
    await expect(
      new BraveSearchProvider(deps(`${base}/brave`, '')).search({ query: 'q' }),
    ).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });
    failNext = 401;
    const err = await new TavilySearchProvider(deps(`${base}/tavily`)).search({ query: 'q' }).catch((e) => e);
    expect(err).toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(err.message).toMatch(/HTTP 401: bad key \(check the key in Settings\)/);
    expect(err.message).not.toContain('k-123');
  });
});
