/// <reference lib="dom" />
/**
 * P3.5 `capture_page`, in the real app: Scout (scripted on the mock LLM) asks for a page capture; the sidecar calls
 * Electron main over the authenticated loopback control channel; main loads the page in a hidden sandboxed window
 * on the `temp:capture` partition (no preload), waits load + 1.5 s, and returns a full-page PNG; the sidecar stores
 * it in the canvas's assets/ and Scout places an image card with it.
 *
 * The test page is served on 127.0.0.1, which the capture policy refuses, so it is reached the way a user behind a
 * proxy would: the app gets HTTP(S)_PROXY pointing at a local proxy that knows `capture.orb.test` (main mirrors the
 * exported proxy into the capture session; the proxy resolves names, literals stay refused).
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import {
  MOCK_KEY_ENV,
  MockLlm,
  mockProviderPatch,
  type MockRequest,
  type MockTurn,
} from '../../../scripts/testkit/mockLlm.ts';
import { EgressProxy } from '../../../scripts/egress/proxy.ts';
import { createCanvas, liveWindow } from './support/ui.ts';

const desktopDir = resolve(import.meta.dirname, '..');
const HOST = 'capture.orb.test';

// A 2400 px tall page: blue top band, and a red band at the bottom that appears only 1 s after load (so it is in
// the PNG only if main waited for the page to settle and captured beyond the 900 px viewport). The title reports
// what the page can see of Orb: nothing (no preload, no Node).
const PAGE = `<!doctype html><html><head><title>t</title><style>
body{margin:0} #top{height:300px;background:rgb(37,99,235)} #mid{height:1800px;background:#fff}
#late{height:300px;background:#fff}</style></head><body><div id="top"></div><div id="mid"></div><div id="late"></div>
<script>
document.title = 'Capture probe ' + [typeof window.orbNative, typeof require, typeof process].join(',');
setTimeout(() => { document.getElementById('late').style.background = 'rgb(220,38,38)'; }, 1000);
</script></body></html>`;

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
let site: Server;
let proxy: EgressProxy;
const siteHits: string[] = [];

type Who = 'orb' | 'scout';
const scripts: Record<Who, Array<MockTurn | ((req: MockRequest) => MockTurn)>> = { orb: [], scout: [] };
const byAgent: Record<Who, MockRequest[]> = { orb: [], scout: [] };
const textOf = (m: any): string =>
  typeof m?.content === 'string'
    ? m.content
    : Array.isArray(m?.content)
      ? m.content.map((p: any) => p?.text ?? '').join('\n')
      : '';
const whoOf = (req: MockRequest): Who =>
  textOf(req.body.messages[0]).includes('You are Scout') ? 'scout' : 'orb';
const lastTool = (req: MockRequest): string => {
  const messages = req.body.messages as any[];
  for (let i = messages.length - 1; i >= 0 && messages[i].role !== 'assistant'; i--)
    if (messages[i].role === 'tool') return textOf(messages[i]);
  return '';
};

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-capture-'));
  site = createServer((req, res) => {
    siteHits.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
  proxy = await new EgressProxy({
    routes: { [HOST]: { host: '127.0.0.1', port: (site.address() as AddressInfo).port } },
  }).start();
  llm = await new MockLlm({
    defaultTurn: (req) => {
      const who = whoOf(req);
      byAgent[who].push(req);
      const next = scripts[who].shift();
      return typeof next === 'function' ? next(req) : (next ?? { text: 'OK.' });
    },
  }).start();
  const patchFile = join(tmp, 'mock.patch.yml');
  writeFileSync(patchFile, mockProviderPatch(llm.baseURL));
  app = await electron.launch({
    args: [desktopDir],
    env: {
      ...process.env,
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_HOME: join(tmp, 'Orb'),
      ORB_USER_DATA: join(tmp, 'electron'),
      ORB_EXTRA_PATCH_FILE: patchFile,
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
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  await proxy?.close();
  site?.closeAllConnections();
  await new Promise<void>((r) => (site ? site.close(() => r()) : r()));
  rmSync(tmp, { recursive: true, force: true });
});

test('capture_page: a hidden sandboxed window captures the full page into assets/, and Scout places it', async () => {
  test.setTimeout(90_000);
  const { canvasId } = await createCanvas(page, 'Capture a page');
  const call = (name: string, args: Record<string, unknown>): MockTurn => ({
    toolCalls: [{ name, arguments: args }],
  });
  // Orb adds a frame, then delegates it to Scout (the frame id comes from the add_frame result).
  scripts.orb.push(
    call('add_frame', { title: 'Screens' }),
    (req) =>
      call('delegate', {
        role: 'scout',
        frameIds: [JSON.parse(lastTool(req)).frameId],
        instruction: 'Capture the page.',
      }),
    { text: 'Scout is capturing it.' },
  );
  scripts.scout.push(
    call('capture_page', { url: `http://127.0.0.1:${(site.address() as AddressInfo).port}/` }),
    call('capture_page', { url: `http://${HOST}/page` }),
    (req) => {
      const result = JSON.parse(lastTool(req));
      return call('place_card', {
        type: 'image',
        title: 'Capture probe page',
        asset: result.asset,
        width: result.width,
        height: result.height,
        why: 'UI reference',
      });
    },
    { text: 'Done.' },
  );
  await page.getByTestId('orb-chat-input').fill('Capture the test page.');
  await page.getByTestId('orb-chat-send').click();

  // The private target never reached the capture window (refused in the sidecar).
  await expect.poll(() => byAgent.scout.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  expect(lastTool(byAgent.scout[1]!)).toMatch(/127\.0\.0\.1 is a local or private address/);

  // The capture result.
  await expect.poll(() => byAgent.scout.length, { timeout: 45_000 }).toBeGreaterThanOrEqual(3);
  const result = JSON.parse(lastTool(byAgent.scout[2]!));
  expect(result).toMatchObject({
    url: `http://${HOST}/page`,
    title: 'Capture probe undefined,undefined,undefined',
    width: 1280,
    cut: false,
  });
  expect(result.height).toBeGreaterThanOrEqual(2400);
  expect(result.asset).toMatch(/^assets\/[0-9a-z]+-capture-capture-orb-test\.png$/);
  expect(siteHits).toEqual(['/page']);
  expect(proxy.hits.filter((h) => h.host === HOST)).toHaveLength(1);

  // The PNG: full page (beyond the 900 px viewport), with the band that appeared 1 s after load.
  const file = join(tmp, 'Orb', 'canvases', canvasId, result.asset);
  expect(existsSync(file)).toBe(true);
  const png = PNG.sync.read(readFileSync(file));
  expect([png.width, png.height]).toEqual([result.width, result.height]);
  const at = (x: number, y: number) => [
    ...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3),
  ];
  // Within a small tolerance: the window's colour profile shifts sRGB values slightly.
  const near = (got: number[], want: number[]) => got.every((v, i) => Math.abs(v - want[i]!) <= 24);
  expect(near(at(640, 150), [37, 99, 235]), `top band ${at(640, 150)}`).toBe(true);
  expect(near(at(640, 2250), [220, 38, 38]), `late band ${at(640, 2250)}`).toBe(true);
  expect(near(at(640, 1200), [255, 255, 255]), `middle ${at(640, 1200)}`).toBe(true);

  // Scout's image card renders the capture on the board.
  const img = page.getByTestId('card-image');
  await expect(img).toHaveCount(1, { timeout: 15_000 });
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1280);
});
