/**
 * P3.5 unit tests: the source tools (`web_search`, `fetch_url`, `read_source`, `capture_page`) against a real
 * CanvasStore and a real local web server (addressed by names only the injected resolver knows; the address policy
 * is widened to 127.0.0.1 alone). The dsh wiring (preset row, ctx.web, the proxy route) is covered by
 * apps/ui/test/sources.contract.test.ts; the capture window by apps/desktop/e2e/capture.spec.ts.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AgentName } from '@orb/shared';
import {
  SourceError,
  sourceIdOf,
  type BrowserClient,
  type CaptureClient,
  type SignedInClient,
} from '@orb/sources';
import { CanvasStore } from '../src/store.js';
import { placeCard, type BoardToolExec } from '../src/tools.js';
import {
  NO_SEARCH_PROVIDER_MESSAGE,
  capturePage,
  fetchSignedIn,
  fetchUrl,
  readSource,
  webSearch,
  type SourceToolDeps,
} from '../src/sources.js';
import { makePdf, makePng } from '../../../scripts/testkit/fixtures.js';

let server: Server;
let port = 0;
const hits: string[] = [];
let retryReady = false;
const LONG = Array.from(
  { length: 40 },
  (_, i) => `<p>Paragraph ${i}. ${'Battery cells store energy. '.repeat(20)}</p>`,
).join('');

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? '');
    if (req.url?.startsWith('/retry.pdf')) {
      if (retryReady) {
        res.writeHead(200, { 'content-type': 'application/pdf' });
        res.end(makePdf(1, 'Recovered primary document'));
      }
    } else if (req.url === '/article') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(
        `<html><head><title>Cells</title></head><body><article><h1>Battery cells</h1>${LONG}</article></body></html>`,
      );
    } else if (req.url === '/paper.pdf') {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end(makePdf(2, 'Grid storage paper'));
    } else res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

let home: string;
let store: CanvasStore;
let canvasId: string;
const SESSIONS: Record<AgentName, string> = {
  orb: 'orb-s',
  scout: 'scout-s',
  critic: 'critic-s',
  builder: 'builder-s',
};
const as = (role: AgentName, signal = new AbortController().signal): BoardToolExec => ({
  callId: `call_${role}`,
  signal,
  agent: {
    id: SESSIONS[role],
    options: { provider: 'openai', model: 'gpt-6-luna' },
    session: { header: { cwd: store.dirOf(canvasId) } },
  },
});

const captured: string[] = [];
const capture: CaptureClient = {
  available: true,
  async capture(url) {
    captured.push(url);
    return { png: makePng(64, 48), info: { url, title: 'Captured page', width: 64, height: 48, cut: false } };
  },
};
const deps = (over: Partial<SourceToolDeps> = {}): SourceToolDeps => ({
  fetch: {
    resolver: async (host) =>
      host === 'site.test' ? [{ address: '127.0.0.1', family: 4 }] : [{ address: '10.9.9.9', family: 4 }],
    allowAddress: (a) => a === '127.0.0.1',
  },
  capture,
  now: () => 1_700_000_000_000,
  ...over,
});
const site = (path: string) => `http://site.test:${port}${path}`;
const errOf = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e: Error) => e.message,
  );

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-sources-tools-'));
  store = new CanvasStore({ home, flushMs: 5 });
  canvasId = (await store.create({ prompt: 'Sources' })).id;
  await store.setRootSession(canvasId, SESSIONS.orb);
  for (const role of ['scout', 'critic', 'builder'] as const)
    await store.setChildAgent(canvasId, role, SESSIONS[role]);
  hits.length = 0;
  retryReady = false;
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

describe('browser research', () => {
  it('searches without an API key, caches results, saves rendered evidence and reuses it through a cited source card', async () => {
    let searches = 0,
      reads = 0;
    const browser: BrowserClient = {
      available: true,
      search: async (query) => {
        searches++;
        return {
          action: 'search',
          query,
          engine: 'Bing',
          results: [
            { url: site('/rendered'), title: 'Rendered evidence', snippet: 'Discovery snippet only' },
          ],
        };
      },
      read: async (url) => {
        reads++;
        return {
          action: 'read',
          url,
          title: 'Rendered evidence',
          html: `<html><body><article><h1>Rendered evidence</h1><p>JAVASCRIPT-EVIDENCE-MARKER: cited public findings.</p>${LONG}</article><script>DO-NOT-EXTRACT</script></body></html>`,
          truncated: false,
        };
      },
    };
    const d = deps({ browser });
    expect(await webSearch(store, d, { query: 'Public evidence' }, as('scout'))).toMatchObject({
      configured: true,
      provider: 'Browser (Bing)',
    });
    await webSearch(store, d, { query: 'Public evidence' }, as('scout'));
    expect(searches).toBe(1);
    const source = await fetchUrl(store, d, { url: site('/rendered'), browser: true }, as('scout'));
    expect(source).toMatchObject({ rendered: true, cached: false });
    expect(source.text).toContain('JAVASCRIPT-EVIDENCE-MARKER');
    expect(source.text).not.toContain('DO-NOT-EXTRACT');
    const placed = await placeCard(
      store,
      {
        type: 'source',
        title: source.title,
        url: source.url,
        body: 'The rendered public findings support the assessment.',
        why: 'Evidence for this analysis',
        frameId: null,
      },
      as('scout'),
      { delayMs: 0 },
    );
    const reread = await readSource(store, d, { cardId: (placed as any).cardId }, as('critic'));
    expect(reread.text).toContain('JAVASCRIPT-EVIDENCE-MARKER');
    expect(reread.sourceId).toBe(source.sourceId);
    await fetchUrl(store, d, { url: site('/rendered'), browser: true, page: 2 }, as('scout'));
    expect(
      await fetchUrl(store, deps(), { url: site('/rendered'), browser: true, page: 2 }, as('scout')),
    ).toMatchObject({ cached: true, rendered: true, page: 2 });
    expect(reads).toBe(1);
    expect(hits).toEqual([]);
  });
  it('keeps browser blocks explicit and checks private URLs before starting a browser read', async () => {
    let reads = 0;
    const browser: BrowserClient = {
      available: true,
      search: async () => {
        throw new SourceError('BROWSER_BLOCKED', 'Human verification is required. Use another source.');
      },
      read: async () => {
        reads++;
        throw new SourceError('BROWSER_BLOCKED', 'Human verification is required. Use another source.');
      },
    };
    expect(
      await errOf(webSearch(store, deps({ browser }), { query: 'Blocked query' }, as('scout'))),
    ).toContain('Human verification');
    expect(
      await errOf(
        fetchUrl(store, deps({ browser }), { url: 'http://127.0.0.1/', browser: true }, as('scout')),
      ),
    ).toContain('local or private');
    expect(reads).toBe(0);
    expect(
      await errOf(fetchUrl(store, deps(), { url: site('/rendered'), browser: true }, as('scout'))),
    ).toContain('desktop app');
  });
});

describe('fetch_url', () => {
  it('backs off repeated PDF timeouts across URL variants, preserves cached reads and allows recovery and other sources', async () => {
    let now = 1_700_000_000_000;
    const slow = deps({ fetch: { ...deps().fetch, timeoutMs: 80 }, now: () => now });
    for (const suffix of ['?download=1', '?sequence=1'])
      expect(await errOf(fetchUrl(store, slow, { url: site(`/retry.pdf${suffix}`) }, as('scout')))).toMatch(
        /did not answer/,
      );
    expect(hits.filter((h) => h.startsWith('/retry.pdf'))).toHaveLength(2);
    expect(
      await errOf(fetchUrl(store, slow, { url: site('/retry.pdf?another=1'), refresh: true }, as('scout'))),
    ).toMatch(/Two requests.*backed off/);
    expect(hits.filter((h) => h.startsWith('/retry.pdf'))).toHaveLength(2);
    expect((await fetchUrl(store, deps(), { url: site('/article') }, as('scout'))).title).toBe(
      'Battery cells',
    );
    now += 5 * 60_000 + 1;
    retryReady = true;
    const recovered = await fetchUrl(store, slow, { url: site('/retry.pdf') }, as('scout'));
    expect(recovered.kind).toBe('pdf');
    retryReady = false;
    for (let i = 0; i < 2; i++)
      expect(
        await errOf(fetchUrl(store, slow, { url: site('/retry.pdf'), refresh: true }, as('scout'))),
      ).toMatch(/did not answer/);
    const before = hits.length;
    expect((await fetchUrl(store, slow, { url: site('/retry.pdf') }, as('scout'))).cached).toBe(true);
    expect(hits).toHaveLength(before);
    expect(
      await errOf(fetchUrl(store, slow, { url: site('/retry.pdf'), refresh: true }, as('scout'))),
    ).toMatch(/backed off/);
    expect(hits).toHaveLength(before);
  });

  it('fetches, extracts and caches a page; pages of ≤8k; served from the cache afterwards', async () => {
    const first = await fetchUrl(store, deps(), { url: site('/article') }, as('scout'));
    expect(first).toMatchObject({
      title: 'Battery cells',
      kind: 'html',
      page: 1,
      cached: false,
      url: site('/article'),
    });
    expect(first.pages).toBeGreaterThan(1);
    expect(first.text.length).toBeLessThanOrEqual(8000);
    expect(first.text).toContain('# Battery cells');
    expect(first.next).toMatch(/^page 2 of /);
    const dir = join(store.dirOf(canvasId), 'assets', 'sources');
    expect(readdirSync(dir).sort()).toEqual([`${first.sourceId}.json`, `${first.sourceId}.md`]);
    const meta = JSON.parse(readFileSync(join(dir, `${first.sourceId}.json`), 'utf8'));
    expect(meta).toMatchObject({
      url: site('/article'),
      kind: 'html',
      title: 'Battery cells',
      by: `scout ${SESSIONS.scout}`,
    });
    expect(hits).toEqual(['/article']);
    const second = await fetchUrl(store, deps(), { url: site('/article'), page: 2 }, as('scout'));
    expect(second).toMatchObject({ page: 2, cached: true, sourceId: first.sourceId });
    expect(hits).toEqual(['/article']);
    await fetchUrl(store, deps(), { url: site('/article'), refresh: true }, as('scout'));
    expect(hits).toEqual(['/article', '/article']);
    expect(await errOf(fetchUrl(store, deps(), { url: site('/article'), page: 999 }, as('scout')))).toMatch(
      /page 999 does not exist/,
    );
  });

  it('reads PDFs as text and refuses private addresses with a clear message', async () => {
    const pdf = await fetchUrl(store, deps(), { url: site('/paper.pdf') }, as('scout'));
    expect(pdf).toMatchObject({ kind: 'pdf', pdfPages: 2, title: 'Grid storage paper' });
    expect(pdf.text).toContain('--- page 2 ---');
    expect(await errOf(fetchUrl(store, deps(), { url: 'http://192.168.1.1/' }, as('scout')))).toMatch(
      /private address/,
    );
    expect(
      await errOf(fetchUrl(store, deps(), { url: `http://inner.test:${port}/article` }, as('scout'))),
    ).toMatch(/resolves to a private/);
    expect(await errOf(fetchUrl(store, deps(), { url: 'ftp://x.example/' }, as('scout')))).toMatch(
      /only http and https/,
    );
  });

  it('only Scout may fetch or capture; Critic and Orb may read sources', async () => {
    expect(await errOf(fetchUrl(store, deps(), { url: site('/article') }, as('critic')))).toBe(
      'fetch_url is not available to the critic agent',
    );
    expect(await errOf(fetchUrl(store, deps(), { url: site('/article') }, as('orb')))).toBe(
      'fetch_url is not available to the orb agent',
    );
    expect(await errOf(capturePage(store, deps(), { url: site('/article') }, as('builder')))).toBe(
      'capture_page is not available to the builder agent',
    );
    expect(await errOf(webSearch(store, deps(), { query: 'x' }, as('critic')))).toBe(
      'web_search is not available to the critic agent',
    );
    expect(await errOf(readSource(store, deps(), { cardId: 'c_none' }, as('builder')))).toBe(
      'read_source is not available to the builder agent',
    );
  });

  it('a cancelled call throws the abort reason', async () => {
    const ac = new AbortController();
    ac.abort(new Error('user stop'));
    await expect(fetchUrl(store, deps(), { url: site('/article') }, as('scout', ac.signal))).rejects.toThrow(
      'user stop',
    );
  });
});

describe('read_source', () => {
  it("reads a source card's page (fetching it on a cache miss), a quote's source, a dropped PDF and a doc's text", async () => {
    const { cardId: sourceId } = (await placeCard(
      store,
      {
        type: 'source',
        title: 'Cells',
        url: site('/article'),
        body: 'About cells',
        why: 'Primary source',
        frameId: null,
      },
      as('scout'),
      { delayMs: 0 },
    )) as { cardId: string };
    const viaCritic = await readSource(store, deps(), { cardId: sourceId }, as('critic'));
    expect(viaCritic).toMatchObject({ cardId: sourceId, title: 'Battery cells', page: 1 });
    expect(hits).toEqual(['/article']);
    const p2 = await readSource(store, deps(), { cardId: sourceId, page: 2 }, as('orb'));
    expect(p2.page).toBe(2);
    expect(hits).toEqual(['/article']);

    const { cardId: quoteId } = (await placeCard(
      store,
      {
        type: 'quote',
        title: 'Cells',
        body: 'Battery cells store energy.',
        sourceCardId: sourceId,
        why: 'Key line',
        frameId: null,
      },
      as('scout'),
      { delayMs: 0 },
    )) as { cardId: string };
    expect((await readSource(store, deps(), { cardId: quoteId }, as('critic'))).sourceId).toBe(
      viaCritic.sourceId,
    );

    const pdfAsset = await store.writeAsset(canvasId, {
      name: 'report.pdf',
      mime: 'application/pdf',
      data: (async function* () {
        yield makePdf(3, 'Dropped report');
      })(),
    });
    const { cardId: fileId } = (await placeCard(
      store,
      {
        type: 'file',
        title: 'Dropped report',
        asset: pdfAsset.path,
        why: 'The user dropped it',
        frameId: null,
      },
      as('orb'),
      { delayMs: 0 },
    )) as { cardId: string };
    const file = await readSource(store, deps(), { cardId: fileId }, as('critic'));
    expect(file).toMatchObject({
      kind: 'pdf',
      pdfPages: 3,
      asset: pdfAsset.path,
      sourceId: sourceIdOf(`asset:${pdfAsset.path}`),
    });
    expect(file.text).toContain('--- page 3 ---\nPage 3');

    const { cardId: docId } = (await placeCard(
      store,
      { type: 'doc', title: 'Synthesis', body: 'Long synthesis text.', why: 'Summary', frameId: null },
      as('orb'),
      { delayMs: 0 },
    )) as { cardId: string };
    expect(await readSource(store, deps(), { cardId: docId }, as('critic'))).toMatchObject({
      text: 'Synthesis\n\nLong synthesis text.',
      pages: 1,
    });
    expect(await errOf(readSource(store, deps(), { cardId: 'c_missing' }, as('critic')))).toBe(
      'no card c_missing on this board',
    );
  });
});

describe('web_search', () => {
  it('answers that no provider is configured (a result, not an error)', async () => {
    const out = await webSearch(
      store,
      deps({ search: { current: () => undefined, refresh: async () => {}, label: () => '' } }),
      { query: 'grid storage' },
      as('scout'),
    );
    expect(out).toEqual({
      configured: false,
      query: 'grid storage',
      results: [],
      message: NO_SEARCH_PROVIDER_MESSAGE,
    });
    const unavailable = Object.assign(new Error('no usable web provider is registered'), {
      code: 'WEB_PROVIDER_UNAVAILABLE',
    });
    const out2 = await webSearch(
      store,
      deps({
        search: { current: () => 'brave', refresh: async () => {}, label: () => 'Brave Search' },
        web: { search: async () => Promise.reject(unavailable) },
      }),
      { query: 'q' },
      as('scout'),
    );
    expect(out2.configured).toBe(false);
  });

  it('returns the in-force provider and its results; provider errors are tool errors', async () => {
    const seen: unknown[] = [];
    const ok = await webSearch(
      store,
      deps({
        search: { current: () => 'openai', refresh: async () => {}, label: () => 'OpenAI web search' },
        web: {
          search: async (req) => {
            seen.push(req);
            return {
              content: 'Answer',
              sources: [
                { url: 'https://a.example/', title: 'A', snippet: 'S' },
                { url: 'https://b.example/' },
                { url: 'https://c.example/' },
                { url: 'https://d.example/' },
              ],
              truncated: false,
            };
          },
        },
      }),
      { query: 'grid storage', maxResults: 3 },
      as('scout'),
    );
    expect(seen).toEqual([{ query: 'grid storage', maxResults: 3 }]);
    expect(ok).toEqual({
      configured: true,
      provider: 'OpenAI web search',
      query: 'grid storage',
      answer: 'Answer',
      // maxResults 3: the provider's fourth result is dropped.
      results: [
        { url: 'https://a.example/', title: 'A', snippet: 'S' },
        { url: 'https://b.example/' },
        { url: 'https://c.example/' },
      ],
    });
    const failing = deps({
      search: { current: () => 'tavily', refresh: async () => {}, label: () => 'Tavily' },
      web: {
        search: async () =>
          Promise.reject(
            new SourceError('PROVIDER_ERROR', 'Tavily answered HTTP 401 (check the key in Settings)'),
          ),
      },
    });
    expect(await errOf(webSearch(store, failing, { query: 'q' }, as('scout')))).toBe(
      'Tavily answered HTTP 401 (check the key in Settings)',
    );
  });
});

describe('capture_page', () => {
  it('stores the PNG in assets/ and returns the path for an image card', async () => {
    captured.length = 0;
    const out = await capturePage(store, deps(), { url: site('/article') }, as('scout'));
    expect(captured).toEqual([site('/article')]);
    expect(out).toMatchObject({ width: 64, height: 48, title: 'Captured page', cut: false });
    expect(out.asset).toMatch(/^assets\/[0-9a-z]+-capture-site-test\.png$/);
    expect(existsSync(join(store.dirOf(canvasId), out.asset))).toBe(true);
    // The image card takes it as is.
    const placed = await placeCard(
      store,
      {
        type: 'image',
        title: 'The page',
        asset: out.asset,
        width: 64,
        height: 48,
        why: 'UI reference',
        frameId: null,
      },
      as('scout'),
      { delayMs: 0 },
    );
    expect(placed).toHaveProperty('cardId');
    // Private addresses never reach the capture service.
    expect(await errOf(capturePage(store, deps(), { url: 'http://127.0.0.1:1/' }, as('scout')))).toMatch(
      /private address/,
    );
    expect(
      await errOf(capturePage(store, deps(), { url: `http://inner.test:${port}/` }, as('scout'))),
    ).toMatch(/private/);
    expect(captured).toHaveLength(1);
    // Without the app (no control channel) the tool says so.
    const none: CaptureClient = {
      available: false,
      capture: () => Promise.reject(new SourceError('CAPTURE_UNAVAILABLE', 'page capture needs the Orb app')),
    };
    expect(
      await errOf(capturePage(store, deps({ capture: none }), { url: site('/article') }, as('scout'))),
    ).toBe('page capture needs the Orb app');
  });
});

describe('fetch_signed_in', () => {
  const asked: Array<{ url: string; screenshot?: boolean; by?: string }> = [];
  const member = (url: string): { info: any; html: string } => ({
    info: { domain: 'members.test', url, title: 'Members' },
    html: `<html><head><title>Members</title></head><body><article><h1>Member report</h1>${LONG}</article></body></html>`,
  });
  const signedIn: SignedInClient = {
    available: true,
    async fetch(req) {
      asked.push(req);
      if (req.url.includes('denied'))
        throw new SourceError('DENIED', 'The user did not allow reading members.test this time.');
      const answer = member(req.url);
      if (req.screenshot)
        return {
          ...answer,
          info: { ...answer.info, screenshot: { width: 64, height: 48, cut: false } },
          png: makePng(64, 48).toString('base64'),
        };
      return answer;
    },
  };

  it('extracts the rendered page, caches it by URL (page 2 and read_source need no second fetch)', async () => {
    asked.length = 0;
    const url = 'https://members.test/report';
    const first = await fetchSignedIn(store, deps({ signedIn }), { url }, as('scout'));
    expect(first).toMatchObject({
      signedIn: true,
      domain: 'members.test',
      title: 'Member report',
      page: 1,
      cached: false,
    });
    expect(first.pages).toBeGreaterThan(1);
    expect(first.text.length).toBeLessThanOrEqual(8000);
    expect(asked).toEqual([{ url, by: expect.stringMatching(/^scout /) }]);
    const second = await fetchSignedIn(store, deps({ signedIn }), { url, page: 2 }, as('scout'));
    expect(second).toMatchObject({ page: 2, cached: true });
    expect(asked).toHaveLength(1);
    // A source card on that URL reads from the same cache (a public fetch would hit the login wall).
    const { cardId } = (await placeCard(
      store,
      { type: 'source', title: 'Report', url, body: 'Members only', why: 'Signed in', frameId: null },
      as('scout'),
      { delayMs: 0 },
    )) as { cardId: string };
    expect(await readSource(store, deps({ signedIn }), { cardId, page: 3 }, as('critic'))).toMatchObject({
      page: 3,
    });
    expect(asked).toHaveLength(1);
    // refresh asks again.
    await fetchSignedIn(store, deps({ signedIn }), { url, refresh: true }, as('scout'));
    expect(asked).toHaveLength(2);
  });

  it('a screenshot is saved in assets/ and returned as a path', async () => {
    asked.length = 0;
    const out = await fetchSignedIn(
      store,
      deps({ signedIn }),
      { url: 'https://members.test/shot', screenshot: true },
      as('scout'),
    );
    expect(out.screenshot).toMatchObject({ width: 64, height: 48, cut: false });
    expect(out.screenshot!.asset).toMatch(/^assets\/[0-9a-z]+-signed-in-members-test\.png$/);
    expect(existsSync(join(store.dirOf(canvasId), out.screenshot!.asset))).toBe(true);
    expect(asked[0]).toMatchObject({ screenshot: true });
  });

  it('only Scout may call it; refusals reach the model as one line; local addresses never leave the sidecar', async () => {
    asked.length = 0;
    for (const role of ['orb', 'critic', 'builder'] as const)
      expect(
        await errOf(fetchSignedIn(store, deps({ signedIn }), { url: 'https://members.test/a' }, as(role))),
      ).toBe(`fetch_signed_in is not available to the ${role} agent`);
    expect(
      await errOf(
        fetchSignedIn(store, deps({ signedIn }), { url: 'https://members.test/denied' }, as('scout')),
      ),
    ).toBe('The user did not allow reading members.test this time.');
    expect(
      await errOf(fetchSignedIn(store, deps({ signedIn }), { url: 'http://127.0.0.1/' }, as('scout'))),
    ).toMatch(/local or private/);
    expect(asked.map((a) => a.url)).toEqual(['https://members.test/denied']);
    const none: SignedInClient = {
      available: false,
      fetch: () =>
        Promise.reject(new SourceError('SIGNED_IN_UNAVAILABLE', 'signed-in browsing needs the orb app')),
    };
    expect(
      await errOf(
        fetchSignedIn(store, deps({ signedIn: none }), { url: 'https://members.test/x' }, as('scout')),
      ),
    ).toBe('signed-in browsing needs the orb app');
  });
});
