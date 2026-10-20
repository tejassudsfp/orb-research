/**
 * P3.5 contract test: Scout's source tools on a REAL sidecar whose model is the mock LLM.
 *
 * - `web_search` runs through the harness web seam with Orb's OpenAI web-search provider pointed at the mock's
 *   `/v1/responses` (the only configured search key here is the mock key), so the provider row, the credential
 *   check and the seam's single-provider selection are all real.
 * - `fetch_url` reaches a local test site through a logging proxy (scripts/egress/proxy.ts) exported to the sidecar
 *   as HTTP(S)_PROXY, addressed as `site.orb.test` (a name only the proxy resolves): dsh-http-proxy's route decides
 *   per URL, as in the app. HTML, PDF, a redirect, the cache, a refused private target and a refused redirect.
 * - `capture_page` answers that capture needs the app (no control channel in a bare sidecar).
 * - Scout places a source card from what it read; Orb then reads it back with `read_source` (served from the cache).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BoardEvent, CanvasMeta, Card } from '@orb/shared';
import {
  MOCK_MODEL,
  makePdf,
  mockSearchPatch,
  mockWebSearchResponse,
  startMockedSidecar,
  type MockRequest,
  type MockTurn,
  type MockedSidecar,
} from '../../../scripts/testkit/index.ts';
import { EgressProxy } from '../../../scripts/egress/proxy.ts';
import { createWire, type Wire } from '../src/wire/index.js';

const SITE = 'site.orb.test';
const url = (path: string) => `http://${SITE}${path}`;

type Who = 'orb' | 'scout';
const scripts: Record<Who, MockTurn[]> = { orb: [], scout: [] };
const byAgent: Record<Who, MockRequest[]> = { orb: [], scout: [] };
const textOf = (m: any): string =>
  typeof m?.content === 'string'
    ? m.content
    : Array.isArray(m?.content)
      ? m.content.map((p: any) => p?.text ?? '').join('\n')
      : '';
const whoOf = (req: MockRequest): Who =>
  textOf((req.body.messages as any[])[0]).includes('You are Scout') ? 'scout' : 'orb';
const lastToolMessages = (req: MockRequest): any[] => {
  const messages = req.body.messages as any[];
  const out: any[] = [];
  for (let i = messages.length - 1; i >= 0 && messages[i].role !== 'assistant'; i--)
    if (messages[i].role === 'tool') out.unshift(messages[i]);
  return out;
};
/** A tool result's first JSON part (fetch_url/read_source send the page text as a second part). */
const firstJson = (m: any): any => {
  const t = textOf(m);
  const end = t.indexOf('\n\n');
  return JSON.parse(end >= 0 ? t.slice(0, end) : t);
};
const isWake = (req: MockRequest): boolean => {
  const messages = req.body.messages as any[];
  let i = messages.length - 1;
  const trailing: any[] = [];
  for (; i >= 0 && messages[i].role !== 'assistant'; i--)
    if (messages[i].role === 'user') trailing.push(messages[i]);
  if (i >= 0 && messages[i].tool_calls?.length) return false;
  return (
    trailing.length > 0 &&
    trailing.every((m) => /sent a message|Background subagent|^\[Scout progress\]/.test(textOf(m)))
  );
};

const ARTICLE = `<html><head><title>Solid-state outlook</title></head><body><nav>Menu</nav><article><h1>Solid-state outlook 2026</h1>
${Array.from({ length: 30 }, (_, i) => `<p>Finding ${i}: ${'Solid electrolytes raise energy density. '.repeat(12)}</p>`).join('')}
<script>steal()</script></article></body></html>`;

let site: Server;
let proxy: EgressProxy;
let sc: MockedSidecar;
let wire: Wire;

beforeAll(async () => {
  site = createServer((req, res) => {
    if (req.url === '/article')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(ARTICLE);
    else if (req.url === '/report.pdf')
      res.writeHead(200, { 'content-type': 'application/pdf' }).end(makePdf(2, 'Battery report 2026'));
    else if (req.url === '/old') res.writeHead(301, { location: '/article' }).end();
    else if (req.url === '/to-private') res.writeHead(302, { location: 'http://127.0.0.1:9/admin' }).end();
    else res.writeHead(404).end();
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
  proxy = await new EgressProxy({
    routes: { [SITE]: { host: '127.0.0.1', port: (site.address() as AddressInfo).port } },
  }).start();
  const proxyEnv: NodeJS.ProcessEnv = { no_proxy: '', NO_PROXY: '' };
  for (const n of ['http_proxy', 'https_proxy']) {
    proxyEnv[n] = proxy.url;
    proxyEnv[n.toUpperCase()] = proxy.url;
  }
  sc = await startMockedSidecar({
    env: proxyEnv,
    extraPatch: (llm) => mockSearchPatch(llm.baseURL),
    llm: {
      defaultTurn: (req) => {
        const who = whoOf(req);
        byAgent[who].push(req);
        if (who === 'orb' && isWake(req)) return { text: 'Noted.' };
        return scripts[who].shift() ?? { text: 'OK.' };
      },
      responses: () =>
        mockWebSearchResponse(
          [
            {
              url: `${url('/article')}?utm_source=openai`,
              title: 'Solid-state outlook 2026',
              line: 'Energy density is up.',
            },
            { url: url('/report.pdf'), title: 'Battery report 2026', line: 'Costs fall.' },
          ],
          'solid-state batteries 2026',
        ),
    },
  });
  wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
}, 120_000);

afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
  await proxy?.close();
  site?.closeAllConnections();
  await new Promise<void>((r) => (site ? site.close(() => r()) : r()));
});

const readBoard = (id: string): BoardEvent[] =>
  readFileSync(join(sc.paths.orbHome, 'canvases', id, 'board.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BoardEvent);
const waitFor = <T>(fn: () => T | undefined, timeout = 20_000) =>
  expect
    .poll(fn, { timeout, interval: 50 })
    .toBeTruthy()
    .then(() => fn() as T);

describe('source tools (P3.5)', () => {
  it('Scout searches, fetches pages and PDFs through the proxy, caches them, and Orb reads them back', async () => {
    const canvas: CanvasMeta = await wire.orb.canvas.create({
      prompt: 'Are solid-state batteries ready?',
      template: 'topic',
    });
    const frame = await waitFor(() => readBoard(canvas.id).find((e) => e.type === 'frame.added'));
    const frameId = (frame.data as { frame: { id: string } }).frame.id;

    scripts.orb.push(
      {
        toolCalls: [
          {
            name: 'delegate',
            arguments: { role: 'scout', frameIds: [frameId], instruction: 'Find 2026 sources.' },
          },
        ],
      },
      { text: 'Scout is on it.' },
    );
    const call = (name: string, args: Record<string, unknown>): MockTurn => ({
      toolCalls: [{ name, arguments: args }],
    });
    scripts.scout.push(
      call('web_search', { query: 'solid-state batteries 2026', maxResults: 5 }),
      call('fetch_url', { url: url('/article') }),
      call('fetch_url', { url: url('/article'), page: 2 }),
      call('fetch_url', { url: url('/report.pdf') }),
      call('fetch_url', { url: url('/old') }),
      call('fetch_url', { url: 'http://127.0.0.1:9/admin' }),
      call('fetch_url', { url: url('/to-private') }),
      call('capture_page', { url: url('/article') }),
      call('place_card', {
        type: 'source',
        frameId,
        title: 'Solid-state outlook 2026',
        url: url('/article'),
        body: 'Energy density is up.',
        why: 'Primary 2026 outlook',
      }),
      call('send_message', { about: 'done', message: 'Placed one source.' }),
      { text: 'Done.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'Research this.' });

    // ---- web_search through ctx.web → Orb's OpenAI provider → the mock's /v1/responses ----
    const s2 = await waitFor(() => byAgent.scout[1]);
    const search = JSON.parse(textOf(lastToolMessages(s2)[0]));
    expect(search).toMatchObject({
      configured: true,
      provider: 'OpenAI web search',
      query: 'solid-state batteries 2026',
    });
    expect(search.results.map((r: any) => r.url)).toEqual([url('/article'), url('/report.pdf')]);
    expect(sc.llm.responsesRequests).toHaveLength(1);
    expect(sc.llm.responsesRequests[0]).toMatchObject({ model: MOCK_MODEL, tools: [{ type: 'web_search' }] });

    // ---- fetch_url: HTML → Markdown page 1, then page 2 from the cache ----
    const s3 = await waitFor(() => byAgent.scout[2]);
    const page1 = lastToolMessages(s3)[0];
    expect(firstJson(page1)).toMatchObject({
      title: 'Solid-state outlook 2026',
      kind: 'html',
      page: 1,
      cached: false,
    });
    expect(textOf(page1)).toContain('# Solid-state outlook 2026');
    expect(textOf(page1)).not.toContain('steal()');
    const s4 = await waitFor(() => byAgent.scout[3]);
    expect(firstJson(lastToolMessages(s4)[0])).toMatchObject({ page: 2, cached: true });
    // ---- PDF ----
    const s5 = await waitFor(() => byAgent.scout[4]);
    const pdf = lastToolMessages(s5)[0];
    expect(firstJson(pdf)).toMatchObject({ kind: 'pdf', pdfPages: 2, title: 'Battery report 2026' });
    expect(textOf(pdf)).toContain('--- page 2 ---');
    // ---- a redirect is followed and recorded ----
    const s6 = await waitFor(() => byAgent.scout[5]);
    expect(firstJson(lastToolMessages(s6)[0])).toMatchObject({
      url: url('/old'),
      finalUrl: url('/article'),
      cached: false,
    });
    // ---- refusals ----
    const s7 = await waitFor(() => byAgent.scout[6]);
    expect(textOf(lastToolMessages(s7)[0])).toMatch(/127\.0\.0\.1 is a local or private address/);
    const s8 = await waitFor(() => byAgent.scout[7]);
    expect(textOf(lastToolMessages(s8)[0])).toMatch(
      /redirect refused: 127\.0\.0\.1 is a local or private address/,
    );
    const s9 = await waitFor(() => byAgent.scout[8]);
    expect(textOf(lastToolMessages(s9)[0])).toMatch(/page capture needs the orb app/);

    // The proxy saw exactly the fetched URLs (each once: page 2 came from the cache) and nothing else.
    expect(proxy.hits.map((h) => `${h.via} ${h.host} ${h.path} ${h.decision}`)).toEqual([
      `forward ${SITE} /article routed`,
      `forward ${SITE} /report.pdf routed`,
      `forward ${SITE} /old routed`,
      `forward ${SITE} /article routed`,
      `forward ${SITE} /to-private routed`,
    ]);

    // ---- the cache on disk ----
    const dir = join(sc.paths.orbHome, 'canvases', canvas.id, 'assets', 'sources');
    const metas = readdirSync(dir)
      .filter((n) => n.endsWith('.json'))
      .map((n) => JSON.parse(readFileSync(join(dir, n), 'utf8')));
    expect(metas.map((m) => m.url).sort()).toEqual([url('/article'), url('/old'), url('/report.pdf')]);
    expect(metas.find((m) => m.url === url('/old')).chain).toEqual([url('/old'), url('/article')]);
    for (const m of metas) expect(m.by).toMatch(/^scout scout-/);

    // ---- Scout's source card, then Orb reads it with read_source (from the cache) ----
    const card = await waitFor(() =>
      readBoard(canvas.id)
        .filter((e) => e.type === 'card.added')
        .map((e) => (e.data as { card: Card }).card)
        .find((c) => c.type === 'source'),
    );
    expect(card.provenance).toMatchObject({ kind: 'agent', agent: 'scout' });
    scripts.orb.push(call('read_source', { cardId: card.id, page: 1 }), { text: 'Read it.' });
    const before = byAgent.orb.length;
    await wire.orb.chat.send(canvas.id, { text: 'Read the source card.' });
    const after = await waitFor(() =>
      byAgent.orb
        .slice(before)
        .find((r) => lastToolMessages(r).length > 0 && textOf(lastToolMessages(r)[0]).includes('"cardId"')),
    );
    expect(firstJson(lastToolMessages(after)[0])).toMatchObject({
      cardId: card.id,
      title: 'Solid-state outlook 2026',
      page: 1,
    });
    expect(proxy.hits).toHaveLength(5);
  });
});
