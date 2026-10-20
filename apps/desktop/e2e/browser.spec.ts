/// <reference lib="dom" />
/** Actual Chromium search → JavaScript DOM → saved source → cited document, with no search API key. */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EgressProxy } from '../../../scripts/egress/proxy.ts';
import {
  MOCK_KEY_ENV,
  MockLlm,
  mockProviderPatch,
  type MockRequest,
  type MockTurn,
} from '../../../scripts/testkit/mockLlm.ts';
import { createCanvas, liveWindow } from './support/ui.ts';
import { pdfToText } from '@orb/sources';

const HOST = 'browser-evidence.orb.test';
const ARTICLE =
  '<article><h1>Rendered research fixture</h1><p>JAVASCRIPT-EVIDENCE: the fixture measured 42 units.</p>' +
  '<p>This is synthetic browser evidence for an automated research test.</p>'.repeat(160) +
  '</article>';
let app: ElectronApplication, page: Page, llm: MockLlm, site: Server, proxy: EgressProxy, tmp: string;
let sourceCardId = '',
  frameId = '';
const hits: string[] = [];
const scripts: Record<'orb' | 'scout', Array<MockTurn | ((r: MockRequest) => MockTurn)>> = {
  orb: [],
  scout: [],
};
const seen: Record<'orb' | 'scout', MockRequest[]> = { orb: [], scout: [] };
const text = (m: any): string =>
  typeof m?.content === 'string' ? m.content : (m?.content ?? []).map((p: any) => p.text ?? '').join('\n');
const lastTool = (r: MockRequest) => {
  for (let i = r.body.messages.length - 1; i >= 0; i--)
    if (r.body.messages[i].role === 'tool') return text(r.body.messages[i]);
  return '';
};
const call = (name: string, args: Record<string, unknown>): MockTurn => ({
  toolCalls: [{ name, arguments: args }],
});

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-browser-'));
  site = createServer((req, res) => {
    hits.push(req.url ?? '');
    if (req.url === '/slow') return;
    if (req.url === '/error') return res.writeHead(503).end('Temporary server error, not research evidence.');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    if (req.url === '/blocked')
      return res.end(
        '<html><head><title>Just a moment</title></head><body><form id="challenge-form">Verify that you are human</form></body></html>',
      );
    res.end(
      `<html><head><title>Rendered research fixture</title></head><body><main id="content">Loading...</main><script>setTimeout(() => { document.getElementById('content').innerHTML = ${JSON.stringify(ARTICLE)}; }, 1000); fetch('http://127.0.0.1:${(site.address() as AddressInfo).port}/private').catch(() => {});</script></body></html>`,
    );
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
  proxy = await new EgressProxy({
    routes: { [HOST]: { host: '127.0.0.1', port: (site.address() as AddressInfo).port } },
  }).start();
  llm = await new MockLlm({
    defaultTurn: (req) => {
      const who = text(req.body.messages[0]).includes('You are Scout') ? 'scout' : 'orb';
      seen[who].push(req);
      const next = scripts[who].shift();
      return typeof next === 'function' ? next(req) : (next ?? { text: 'Done.' });
    },
  }).start();
  const patch = join(tmp, 'mock.patch.yml');
  writeFileSync(patch, mockProviderPatch(llm.baseURL));
  app = await electron.launch({
    args: [resolve(import.meta.dirname, '..')],
    env: {
      ...process.env,
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_HOME: join(tmp, 'Orb'),
      ORB_USER_DATA: join(tmp, 'electron'),
      ORB_EXTRA_PATCH_FILE: patch,
      [MOCK_KEY_ENV]: 'orb-mock-key',
      http_proxy: proxy.url,
      https_proxy: proxy.url,
      HTTP_PROXY: proxy.url,
      HTTPS_PROXY: proxy.url,
      no_proxy: '',
      NO_PROXY: '',
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  // Deterministic search pages still run through Chromium's real page loader and DOM extractor.
  await app.evaluate(({ session }, host) => {
    const ses = session.fromPartition('temp:capture', { cache: false });
    ses.protocol.handle('https', (request) => {
      const url = new URL(request.url);
      if (!['www.bing.com', 'html.duckduckgo.com'].includes(url.hostname))
        return new Response('', { status: 403 });
      if (url.searchParams.get('q') === 'blocked-fixture')
        return new Response(
          '<html><head><title>Just a moment</title></head><body><form id="challenge-form">Verify that you are human</form></body></html>',
          { headers: { 'content-type': 'text/html' } },
        );
      return new Response(
        `<html><head><title>Browser search fixture</title></head><body><ul><li class="b_algo"><h2><a href="http://${host}/article">Rendered research fixture</a></h2><p>A public source with JavaScript-rendered evidence.</p></li></ul></body></html>`,
        { headers: { 'content-type': 'text/html' } },
      );
    });
  }, HOST);
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  await proxy?.close();
  site?.closeAllConnections();
  await new Promise<void>((r) => (site ? site.close(() => r()) : r()));
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

test('Scout searches without a key, reads JavaScript evidence and saves a source that the document can cite offline', async () => {
  test.setTimeout(90_000);
  const { canvasId } = await createCanvas(page, 'Browser workflow fixture');
  scripts.orb.push(
    call('add_frame', { title: 'Evidence' }),
    (req) => {
      frameId = JSON.parse(lastTool(req)).frameId;
      return call('delegate', {
        role: 'scout',
        frameIds: [frameId],
        instruction: 'Search the browser fixture, render its result, and save the source.',
      });
    },
    { text: 'Scout is reading the source.' },
  );
  scripts.scout.push(
    call('web_search', { query: 'browser-workflow-fixture' }),
    (req) => {
      const result = JSON.parse(lastTool(req));
      expect(result.provider).toBe('Browser (Bing)');
      return call('fetch_url', { url: result.results[0].url, browser: true });
    },
    (req) => {
      expect(lastTool(req)).toContain('JAVASCRIPT-EVIDENCE');
      expect(JSON.parse(lastTool(req).split('\n\n')[0]!)).toMatchObject({
        rendered: true,
        title: 'Rendered research fixture',
      });
      return call('place_card', {
        type: 'source',
        frameId,
        title: 'Rendered research fixture',
        url: `http://${HOST}/article`,
        body: 'The rendered fixture reports a measurement of 42 units.',
        why: 'Primary evidence read in Chromium',
      });
    },
    (req) => {
      sourceCardId = JSON.parse(lastTool(req)).cardId;
      return call('read_source', { cardId: sourceCardId });
    },
    (req) => {
      expect(lastTool(req)).toContain('JAVASCRIPT-EVIDENCE');
      return { text: 'The source is saved and ready for citation.' };
    },
  );
  await page
    .getByTestId('orb-chat-input')
    .fill('Search the browser workflow fixture, read its rendered page, and save one source card.');
  await page.getByTestId('orb-chat-send').click();
  await expect.poll(() => sourceCardId, { timeout: 45_000 }).not.toBe('');
  await expect(page.locator(`[data-card-id="${sourceCardId}"]`).first()).toBeVisible();
  expect(hits).toEqual(['/article']);
  expect(proxy.hits.every((hit) => hit.host === HOST)).toBe(true);
  // The article's attempt to access a local address never reaches the server.
  expect(hits).not.toContain('/private');
  await expect.poll(() => seen.scout.length).toBeGreaterThanOrEqual(5);
  await expect.poll(() => seen.scout.at(-1)?.completed).toBe(true);
  await expect(page.locator('[data-testid="chat-panel"], [data-testid="chat-pill"]').first()).toHaveAttribute(
    'data-agents-state',
    'idle',
  );
  await app.evaluate(({ BrowserWindow }) => {
    expectNoExtraWindows(BrowserWindow.getAllWindows().length);
    function expectNoExtraWindows(count: number) {
      if (count !== 1) throw new Error(`Expected the main window only, got ${count}`);
    }
  });
  await page.getByTestId('publish-port').click();
  await page.getByTestId('composer-mode').locator('[data-value="doc"]').click();
  await page.getByTestId('composer-document-format').selectOption('custom');
  await page.getByTestId('composer-instructions').fill('Write a short evidence brief from the saved source.');
  scripts.orb.push(
    call('read_source', { cardId: sourceCardId }),
    (req) => {
      expect(lastTool(req)).toContain('JAVASCRIPT-EVIDENCE');
      return call('compose_section', {
        sectionId: 'evidence',
        heading: 'Browser research evidence',
        paragraphs: [
          {
            text: 'The rendered research fixture reports 42 units. This evidence was read and saved before writing the brief.',
            cardIds: [sourceCardId],
          },
        ],
      });
    },
    { text: 'The cited evidence brief is complete.' },
  );
  await page.getByTestId('composer-compose').click();
  await expect(page.getByTestId('composer-progress')).toHaveAttribute('data-phase', 'composed', {
    timeout: 30_000,
  });
  const doc = JSON.parse(
    readFileSync(join(tmp, 'Orb', 'canvases', canvasId, 'port', 'citations.json'), 'utf8'),
  );
  expect(doc.sections[0].paragraphs[0].cardIds).toEqual([sourceCardId]);
  expect(hits).toEqual(['/article']);
  const callsBeforeExport = llm.requests.length;
  await page.getByTestId('composer-export').click();
  await expect(page.getByTestId('composer-saved')).toBeVisible();
  const file = (await page.getByTestId('composer-saved').getAttribute('data-file'))!;
  const bytes = readFileSync(file);
  expect((await pdfToText(new Uint8Array(bytes), 'file:///browser-evidence.pdf')).text).toContain('42 units');
  expect(bytes.toString('latin1')).toContain(`http://${HOST}/article`);
  expect(llm.requests.length).toBe(callsBeforeExport);
  await page.getByTestId('composer-close').click();
});

test('browser CAPTCHA failures stay explicit and Stop all closes an in-flight page', async () => {
  test.setTimeout(90_000);
  const before = seen.scout.length;
  scripts.orb.push(
    call('delegate', {
      role: 'scout',
      frameIds: [frameId],
      instruction: 'Check the blocked browser fixture once.',
    }),
    { text: 'Checking access.' },
  );
  scripts.scout.push(
    call('web_search', { query: 'blocked-fixture', browser: true }),
    (req) => {
      expect(lastTool(req)).toMatch(/verification|blocked browser access/i);
      return call('fetch_url', { url: `http://${HOST}/blocked`, browser: true });
    },
    (req) => {
      expect(lastTool(req)).toMatch(/verification|blocked browser access/i);
      return call('fetch_url', { url: `http://${HOST}/error`, browser: true });
    },
    (req) => {
      expect(lastTool(req)).toContain('HTTP 503');
      return { text: 'The site requires human verification; the saved research remains available.' };
    },
  );
  await page
    .getByTestId('orb-chat-input')
    .fill('Check browser access for the blocked fixture once; keep the existing board.');
  await page.getByTestId('orb-chat-send').click();
  await expect.poll(() => seen.scout.length).toBeGreaterThanOrEqual(before + 4);
  await expect.poll(() => seen.scout.at(-1)?.completed).toBe(true);
  await expect(page.locator('[data-testid="chat-panel"], [data-testid="chat-pill"]').first()).toHaveAttribute(
    'data-agents-state',
    'idle',
  );
  scripts.orb.push(
    call('delegate', { role: 'scout', frameIds: [frameId], instruction: 'Read the slow browser fixture.' }),
    { text: 'Reading the page.' },
  );
  scripts.scout.push(call('fetch_url', { url: `http://${HOST}/slow`, browser: true }));
  await page.getByTestId('orb-chat-input').fill('Read the slow public browser fixture.');
  await page.getByTestId('orb-chat-send').click();
  await expect.poll(() => hits.includes('/slow')).toBe(true);
  await page.getByTestId('chat-menu').click();
  await page.getByTestId('stop-all').click();
  await expect
    .poll(async () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), {
      timeout: 1000,
    })
    .toBe(1);
});
