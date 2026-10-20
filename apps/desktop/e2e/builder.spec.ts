/// <reference lib="dom" />
/**
 * P3.8 Builder cards, in the real window, with the mock LLM scripted per agent (routed by system prompt); P6.2
 * interactive design frames:
 * - Orb delegates Builder; Builder's `write_design_frame` writes `assets/design/<id>.html` and places a design card
 *   that renders as its own sidecar page (`/api/orb-design/frame`) in an iframe with `sandbox="allow-scripts"` (no
 *   `allow-same-origin`): the agent's script runs, the frame cannot reach the app (opaque origin, no cookie) nor
 *   the network (its CSP; a remote image never loads);
 * - Builder's diagram card renders its Mermaid source as SVG (`mermaid.render`, bundled, no network);
 * - editing via chat: the user asks for a change, Orb messages Builder, Builder rewrites the frame by its card id;
 *   the same card shows the new version with its time ("· v2") and the file holds the new HTML;
 * - the reader shows the frame live (a click runs the frame's handler) and the diagram with its source; no CSP
 *   violation in the app, nothing requested off the sidecar origin;
 * - a frame using the bundled Chart.js and D3 draws them, and every way out it tries (fetch, XHR, WebSocket,
 *   EventSource, beacon, image, script, style, font, nested frame, worker, form, navigation) reaches nothing: a
 *   local server counting requests sees none.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  MOCK_KEY_ENV,
  MockLlm,
  mockProviderPatch,
  type MockRequest,
  type MockTurn,
} from '../../../scripts/testkit/mockLlm.ts';
import { createCanvas, liveWindow } from './support/ui.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';

const desktopDir = resolve(import.meta.dirname, '..');
/** Design frames run as their own page: the console lines and requests of those pages are the frames' own. */
const isFramePage = (url: string) => url.includes('/api/orb-design/frame');

type Who = 'orb' | 'scout' | 'critic' | 'builder';
const scripts: Record<Who, MockTurn[]> = { orb: [], scout: [], critic: [], builder: [] };
const textOf = (message: any): string =>
  typeof message?.content === 'string'
    ? message.content
    : Array.isArray(message?.content)
      ? message.content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n')
      : '';
const whoOf = (req: MockRequest): Who => {
  const system = textOf((req.body.messages as any[])[0]);
  if (system.includes('You are Scout')) return 'scout';
  if (system.includes('You are Critic')) return 'critic';
  if (system.includes('You are Builder')) return 'builder';
  return 'orb';
};
/** An Orb request that only exists because a child messaged it or settled. */
const isWake = (req: MockRequest): boolean => {
  const messages = req.body.messages as any[];
  let i = messages.length - 1;
  const trailing: any[] = [];
  for (; i >= 0 && messages[i].role !== 'assistant'; i--)
    if (messages[i].role === 'user') trailing.push(messages[i]);
  if (i >= 0 && messages[i].tool_calls?.length) return false;
  return (
    trailing.length > 0 &&
    trailing.every((m) =>
      /sent a message|Background subagent|^\[(Scout|Critic|Builder) progress\]/.test(textOf(m)),
    )
  );
};
const builderRequests: MockRequest[] = [];

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
const consoleLines: string[] = [];
const offOrigin: string[] = [];
const frameAttempts: string[] = [];
const frameFinished: string[] = [];

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-builder-'));
  llm = await new MockLlm({
    defaultTurn: (req) => {
      const who = whoOf(req);
      if (who === 'builder') builderRequests.push(req);
      if (who === 'orb' && isWake(req)) return { text: 'Noted.' };
      return scripts[who].shift() ?? { text: 'OK.' };
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
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  page.on('console', (msg) => {
    if (!isFramePage(msg.location().url)) consoleLines.push(`${msg.type()}: ${msg.text()}`);
  });
  // A design frame's own attempts show up as requests that fail (blocked by its CSP before anything is sent; the
  // counting server in the last test proves nothing leaves): they are kept apart, and none may ever finish.
  const fromFrame = (req: { frame(): { url(): string } }) => {
    try {
      return isFramePage(req.frame().url());
    } catch {
      return false;
    }
  };
  page.on('request', (req) => {
    const url = req.url();
    if (/^(data|blob|about):/.test(url) || url.startsWith(new URL(page.url()).origin)) return;
    (fromFrame(req) ? frameAttempts : offOrigin).push(url);
  });
  page.on('requestfinished', (req) => {
    const url = req.url();
    // (The frame's own page, a navigation request of the frame itself, is the one request it may finish.)
    if (fromFrame(req) && !isFramePage(url) && !/^(data|blob|about):/.test(url)) frameFinished.push(url);
  });
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const capture = async (name: string) => {
  const dir = resolve(desktopDir, '..', '..', '.orb-dev', 'e2e-results', ...namespaceSegments(), 'screens');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `p3.8-${name}.png`) });
};
const send = async (text: string) => {
  await page.getByTestId('orb-chat-input').fill(text);
  await page.getByTestId('orb-chat-send').click();
};
const settled = async () => {
  const panel = page.locator('[data-testid="chat-panel"], [data-testid="chat-pill"]').first();
  await expect(panel).toHaveAttribute('data-agents-state', 'idle', { timeout: 15_000 });
};
/** A remote image the frame's CSP refuses. */
const REMOTE_IMG = 'http://example.com/logo.png';
const DOT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const htmlV1 = [
  '<!doctype html><html><head><title>Sign up</title>',
  '<style>body{margin:0;font:16px sans-serif;background:#f4f6fb}main{padding:48px}',
  '.cta{background:#2563EB;color:#fff;border:0;border-radius:8px;padding:12px 24px}.cta:hover{opacity:.8}</style>',
  '<script>document.title = "ran"</script></head>',
  `<body><main><img alt="logo" src="${REMOTE_IMG}"><img alt="dot" src="${DOT_PNG}">`,
  '<h1 id="headline">Create your Orb account</h1><p>Research with a team of agents.</p>',
  '<button class="cta" onclick="document.body.innerHTML=1">Start</button></main></body></html>',
].join('');
const htmlV2 = htmlV1
  .replace('background:#2563EB', 'background:#16a34a')
  .replace('>Start<', '>Start free<')
  .replace('Create your Orb account', 'Create your free Orb account');
const MERMAID =
  'flowchart LR\n  A[Ask a question] --> B[Scout reads]\n  B --> C{Enough?}\n  C -->|yes| D[Port]';

let canvasDir = '';
let designId = '';

test('Builder places a sandboxed design frame and a Mermaid diagram', async () => {
  scripts.orb.push(
    { toolCalls: [{ id: 'call_b_frame', name: 'add_frame', arguments: { title: 'Prototype' } }] },
    { text: 'A Prototype frame is up.' },
  );
  const { canvasId } = await createCanvas(page, 'Prototype a research canvas sign-up');
  canvasDir = join(tmp, 'Orb', 'canvases', canvasId);
  const frameId = (await page
    .locator('[data-testid="orb-frame"][aria-label="Prototype"]')
    .getAttribute('data-frame-id'))!;

  scripts.orb.push(
    {
      toolCalls: [
        {
          id: 'call_b_delegate',
          name: 'delegate',
          arguments: {
            role: 'builder',
            frameIds: [frameId],
            instruction: 'Draw the sign-up screen and the flow.',
          },
        },
      ],
    },
    { text: 'Builder is drawing the sign-up screen.' },
  );
  scripts.builder.push(
    {
      toolCalls: [
        {
          id: 'call_b_design',
          name: 'write_design_frame',
          arguments: {
            frameId,
            title: 'Sign up',
            html: htmlV1,
            body: 'The first screen.',
            why: 'First screen of the sign-up flow.',
          },
        },
      ],
    },
    {
      toolCalls: [
        {
          id: 'call_b_diagram',
          name: 'place_card',
          arguments: {
            type: 'diagram',
            frameId,
            title: 'Research flow',
            mermaid: MERMAID,
            detail:
              'The flow starts with a research question, gathers evidence on the canvas and carries that evidence into a document. Each stage should preserve the links back to its sources.\n\nA draft is ready for review only when the evidence and the synthesis agree. Revisit gaps before exporting, and use the diagram to check where a missing source would interrupt the flow.',
            why: 'How a question becomes a document.',
          },
        },
      ],
    },
    { text: 'Done: the sign-up screen and the flow.' },
  );
  await send('Draw the sign-up screen and the research flow.');

  // The design card: its own sidecar page in a sandboxed iframe (P6.2), not a srcdoc.
  const design = page.locator('[data-testid="orb-card"][data-card-type="design"]');
  await expect(design).toHaveCount(1, { timeout: 15_000 });
  designId = (await design.getAttribute('data-card-id'))!;
  await expect(design).toHaveAttribute('data-agent', 'builder');
  const iframe = design.getByTestId('design-frame');
  await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(iframe).toHaveAttribute('data-version', '1');
  expect(await iframe.getAttribute('srcdoc')).toBeNull();
  const src = new URL((await iframe.getAttribute('src'))!);
  expect(src.origin).toBe(new URL(page.url()).origin);
  expect(src.pathname).toBe('/api/orb-design/frame');
  expect(Object.fromEntries(src.searchParams)).toEqual({ canvas: canvasId, card: designId, v: '1' });
  const frame = page.frameLocator(`[data-card-id="${designId}"] [data-testid="design-frame"]`);
  await expect(frame.locator('#headline')).toHaveText('Create your Orb account');
  await expect(frame.locator('button.cta')).toHaveText('Start');
  await expect(design.getByTestId('design-updated')).toHaveAttribute('data-version', '1');
  await expect(design.getByTestId('design-updated')).toHaveText(/^Updated /);

  // Inside the frame: the agent's script ran; no access to the app (opaque origin, no cookie, no parent); the
  // remote image never loaded (CSP), the data: image did.
  const inner = page.frames().find((f) => isFramePage(f.url()) && f.url().includes(designId));
  expect(inner).toBeTruthy();
  await expect.poll(() => inner!.evaluate(() => document.title)).toBe('ran');
  const probe = await inner!.evaluate(() => ({
    // The document's own origin (location.origin shows the URL's; the sandbox makes the document opaque).
    origin: self.origin,
    parent: (() => {
      try {
        return String(window.parent.document.title);
      } catch {
        return 'blocked';
      }
    })(),
    cookie: (() => {
      try {
        return document.cookie;
      } catch {
        return 'blocked';
      }
    })(),
    storage: (() => {
      try {
        return String(window.localStorage.length);
      } catch {
        return 'blocked';
      }
    })(),
    remoteImage: (document.querySelector('img[alt="logo"]') as HTMLImageElement).naturalWidth,
    dataImage: (document.querySelector('img[alt="dot"]') as HTMLImageElement).naturalWidth,
    handler: typeof (document.querySelector('button.cta') as HTMLButtonElement).onclick,
  }));
  expect(probe).toEqual({
    origin: 'null',
    parent: 'blocked',
    cookie: 'blocked',
    storage: 'blocked',
    remoteImage: 0,
    dataImage: 1,
    handler: 'function',
  });

  // The file in the canvas folder holds the HTML Builder wrote.
  expect(readFileSync(join(canvasDir, 'assets', 'design', `${designId}.html`), 'utf8')).toBe(htmlV1);

  // The diagram: Mermaid's SVG with the node labels.
  const diagram = page.locator('[data-testid="orb-card"][data-card-type="diagram"]');
  await expect(diagram).toHaveCount(1);
  const svg = diagram.getByTestId('card-diagram');
  await expect(svg).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
  await expect(svg.locator('svg')).toHaveCount(1);
  for (const label of ['Ask a question', 'Scout reads', 'Enough?', 'Port'])
    await expect(svg.locator('svg')).toContainText(label);
  await settled();
  await page.getByTestId('chat-minimise').click();
  await capture('builder-cards');
  await page.getByTestId('chat-pill').click();

  // Builder was offered write_design_frame (its §2.4 list) and never a file or shell tool.
  const offered = (builderRequests[0]!.body.tools as any[]).map((t) => t.function?.name ?? t.name);
  expect(offered).toContain('write_design_frame');
  for (const banned of ['bash', 'read', 'write', 'edit', 'update_card', 'add_frame'])
    expect(offered).not.toContain(banned);
});

test('editing via chat: Builder rewrites the frame, the card shows the new version and its time', async () => {
  const design = page.locator(`[data-testid="orb-card"][data-card-id="${designId}"]`);
  const before = Number(await design.getByTestId('design-updated').getAttribute('data-updated-at'));
  scripts.orb.push(
    {
      toolCalls: [
        {
          id: 'call_b_msg',
          name: 'message_agent',
          arguments: { agent: 'builder', message: `Make the Start button green on card ${designId}.` },
        },
      ],
    },
    { text: 'Asked Builder to make the button green.' },
  );
  scripts.builder.push(
    {
      toolCalls: [
        {
          id: 'call_b_rewrite',
          name: 'write_design_frame',
          arguments: { cardId: designId, title: 'Sign up', html: htmlV2 },
        },
      ],
    },
    { text: 'The button is green now.' },
  );
  await send('Make the Start button green and say it is free.');
  await expect(design.getByTestId('design-updated')).toHaveAttribute('data-version', '2', {
    timeout: 15_000,
  });
  await expect(design.getByTestId('design-updated')).toHaveText(/^Updated .* · v2$/);
  expect(Number(await design.getByTestId('design-updated').getAttribute('data-updated-at'))).toBeGreaterThan(
    before,
  );
  const frame = page.frameLocator(`[data-card-id="${designId}"] [data-testid="design-frame"]`);
  await expect(frame.locator('#headline')).toHaveText('Create your free Orb account');
  await expect(frame.locator('button.cta')).toHaveText('Start free');
  expect(await frame.locator('button.cta').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(22, 163, 74)',
  );
  // Still one design card, the same file, now the new HTML.
  await expect(page.locator('[data-testid="orb-card"][data-card-type="design"]')).toHaveCount(1);
  expect(readFileSync(join(canvasDir, 'assets', 'design', `${designId}.html`), 'utf8')).toBe(htmlV2);
  await settled();

  // The reader: the frame live (it takes the pointer) and the diagram with its source.
  await page.getByTestId('chat-minimise').click();
  await design.getByTestId('orb-card-title').dblclick();
  const reader = page.getByTestId('reader');
  await expect(reader).toBeVisible();
  const live = reader.getByTestId('reader-design-frame');
  await expect(live).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(live).toHaveAttribute('data-version', '2');
  expect(await live.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('auto');
  const readerFrame = page.frameLocator('[data-testid="reader-design-frame"]');
  await expect(readerFrame.locator('#headline')).toHaveText('Create your free Orb account');
  const initialWidth = (await live.boundingBox())!.width;
  const designCamera = await page.getByTestId('world').getAttribute('style');
  await reader.getByRole('button', { name: 'Zoom in visual', exact: true }).click();
  await reader.getByRole('button', { name: 'Zoom in visual', exact: true }).click();
  expect((await live.boundingBox())!.width).toBeGreaterThan(initialWidth * 1.5);
  const panMode = reader.getByRole('button', { name: 'Pan visual', exact: true });
  await panMode.click();
  await expect(panMode).toHaveAttribute('aria-pressed', 'true');
  expect(await live.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  const designView = reader.getByTestId('visual-viewport');
  // A full-screen reader can still fit the visual at 156%. Zoom until there is room to test a real pan.
  for (let i = 0; i < 6 && (await designView.evaluate((el) => el.scrollWidth - el.clientWidth)) < 160; i++) {
    await reader.getByRole('button', { name: 'Zoom in visual', exact: true }).click();
  }
  expect(await designView.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(160);
  await designView.evaluate((el) => {
    el.scrollLeft = 0;
  });
  const left = await designView.evaluate((el) => el.scrollLeft);
  const designBox = (await designView.boundingBox())!;
  await page.mouse.move(designBox.x + designBox.width * 0.7, designBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(designBox.x + designBox.width * 0.7 - 80, designBox.y + 100, { steps: 5 });
  await page.mouse.up();
  expect(await designView.evaluate((el) => el.scrollLeft)).toBeGreaterThan(left + 50);
  await reader.getByRole('button', { name: 'Fit', exact: true }).click();
  await panMode.click();
  expect(await live.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('auto');
  expect(await page.getByTestId('world').getAttribute('style')).toBe(designCamera);
  await capture('reader-design');
  // P6.2: the reader's frame is live: a real pointer click on its button runs the frame's own handler (it replaces
  // the page with "1"). The frame is scaled to the reader, so the point is mapped by hand.
  const box = (await live.boundingBox())!;
  const scale = box.width / (await live.evaluate((el) => (el as HTMLElement).offsetWidth));
  const rect = await readerFrame.locator('button.cta').evaluate((b) => {
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x + rect.x * scale, box.y + rect.y * scale);
  await expect(readerFrame.locator('body')).toHaveText('1');
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  const diagram = page.locator('[data-testid="orb-card"][data-card-type="diagram"]');
  await diagram.getByTestId('orb-card-title').dblclick();
  await expect(reader.getByTestId('reader-diagram')).toHaveAttribute('data-state', 'ready');
  await expect(reader.getByTestId('reader-diagram-source')).toHaveText(MERMAID);
  await expect(reader.getByTestId('reader-detail').locator('p')).toHaveCount(2);
  await expect(reader.getByTestId('reader-detail')).toContainText('Revisit gaps before exporting');
  const svgWidth = await reader
    .getByTestId('reader-diagram')
    .locator('svg')
    .evaluate((el) => el.getBoundingClientRect().width);
  const boardCamera = await page.getByTestId('world').getAttribute('style');
  await reader.getByRole('button', { name: 'Zoom in visual', exact: true }).click();
  await reader.getByRole('button', { name: 'Zoom in visual', exact: true }).click();
  await expect(reader.getByTestId('visual-zoom')).toHaveText('156%');
  expect(
    await reader
      .getByTestId('reader-diagram')
      .locator('svg')
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBeGreaterThan(svgWidth * 1.5);
  expect(await page.getByTestId('world').getAttribute('style')).toBe(boardCamera);
  const visual = reader.getByTestId('visual-viewport');
  for (let i = 0; i < 6 && (await visual.evaluate((el) => el.scrollWidth - el.clientWidth)) < 160; i++) {
    await reader.getByRole('button', { name: 'Zoom in visual', exact: true }).click();
  }
  expect(await visual.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(160);
  await visual.evaluate((el) => {
    el.scrollLeft = 0;
  });
  const beforePan = await visual.evaluate((el) => el.scrollLeft);
  const visualBox = (await visual.boundingBox())!;
  await page.mouse.move(visualBox.x + visualBox.width * 0.7, visualBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(visualBox.x + visualBox.width * 0.7 - 80, visualBox.y + 100, { steps: 5 });
  await page.mouse.up();
  expect(await visual.evaluate((el) => el.scrollLeft)).toBeGreaterThan(beforePan + 50);
  await reader.getByRole('button', { name: 'Fit', exact: true }).click();
  await expect(reader.getByTestId('visual-zoom')).toHaveText('100%');
  await visual.focus();
  await page.keyboard.press('+');
  await expect(reader.getByTestId('visual-zoom')).toHaveText('125%');
  await page.keyboard.press('0');
  await expect(reader.getByTestId('visual-zoom')).toHaveText('100%');
  await reader.getByTestId('visual-viewport').evaluate((el) =>
    el.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -200,
        ctrlKey: true,
        clientX: el.getBoundingClientRect().x + 100,
        clientY: el.getBoundingClientRect().y + 100,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(reader.getByTestId('visual-zoom')).not.toHaveText('100%');
  expect(await page.getByTestId('world').getAttribute('style')).toBe(boardCamera);
  await page.keyboard.press('Escape');

  // No CSP violation in the app, nothing off the sidecar origin, no error notice.
  expect(consoleLines.filter((l) => /Content Security Policy|Refused to/i.test(l))).toEqual([]);
  expect(offOrigin).toEqual([]);
  // The frame's remote image was attempted and refused, never fetched.
  expect(frameAttempts).toContain(REMOTE_IMG);
  expect(frameFinished).toEqual([]);
  await expect(page.getByTestId('orb-error')).toHaveCount(0);
});

/** A frame that draws with Chart.js and D3, then tries every way out it can think of. */
const probeHtml = (target: string, appOrigin: string) =>
  [
    '<!doctype html><html><head><title>Probe</title>',
    '<script>var violations = []; document.addEventListener("securitypolicyviolation", function (e) {',
    '  violations.push(e.effectiveDirective); });</script>',
    `<style>@font-face{font-family:x;src:url(${target}/font.woff2)}body{font-family:x;margin:0;background:url(${target}/bg.png)}</style>`,
    `<link rel="stylesheet" href="${target}/style.css"><link rel="prefetch" href="${target}/prefetch">`,
    `<script src="${target}/script.js"></script>`,
    '</head><body><canvas id="chart" width="300" height="150"></canvas><svg id="d3" width="300" height="60"></svg>',
    `<img src="${target}/img.png"><iframe src="${target}/frame"></iframe>`,
    `<form id="f" action="${target}/form" method="post"><input name="q" value="1"></form>`,
    '<pre id="out"></pre><script>',
    'var tried = {};',
    'function note(k, v) { tried[k] = v; }',
    "new Chart(document.getElementById('chart'), {type: 'bar', data: {labels: ['a', 'b'], datasets: [{data: [2, 3]}]},",
    '  options: {animation: false, responsive: false}});',
    "d3.select('#d3').selectAll('rect').data([10, 30, 50]).enter().append('rect')",
    "  .attr('x', function (d, i) { return i * 40; }).attr('width', 30).attr('height', function (d) { return d; });",
    `fetch('${target}/fetch').then(function () { note('fetch', 'sent'); }, function () { note('fetch', 'refused'); });`,
    `fetch('${appOrigin}/api/orb/canvas.list', {method: 'POST', body: '{}'}).then(function () { note('app', 'sent'); },`,
    "  function () { note('app', 'refused'); });",
    `try { var x = new XMLHttpRequest(); x.open('GET', '${target}/xhr'); x.onerror = function () { note('xhr', 'refused'); };`,
    "  x.onload = function () { note('xhr', 'sent'); }; x.send(); } catch (e) { note('xhr', 'refused'); }",
    `try { var ws = new WebSocket('${target.replace('http', 'ws')}/ws'); ws.onerror = function () { note('ws', 'refused'); };`,
    "  ws.onopen = function () { note('ws', 'sent'); }; } catch (e) { note('ws', 'refused'); }",
    `try { var es = new EventSource('${target}/sse'); es.onerror = function () { note('sse', 'refused'); es.close(); }; }`,
    "  catch (e) { note('sse', 'refused'); }",
    `try { note('beacon', navigator.sendBeacon('${target}/beacon', 'x') ? 'queued' : 'refused'); } catch (e) { note('beacon', 'refused'); }`,
    `try { new Worker('${target}/worker.js'); note('worker', 'created'); } catch (e) { note('worker', 'refused'); }`,
    `try { note('popup', window.open('${target}/popup') ? 'opened' : 'refused'); } catch (e) { note('popup', 'refused'); }`,
    "try { document.getElementById('f').submit(); } catch (e) {}",
    'setTimeout(function () {',
    "  document.getElementById('out').textContent = JSON.stringify({tried: tried, violations: violations,",
    "    bars: document.querySelectorAll('#d3 rect').length, chart: typeof Chart, d3: typeof d3});",
    '}, 1500);',
    '</script></body></html>',
  ].join('\n');

test('an interactive frame draws Chart.js and D3, and nothing it tries leaves the frame', async () => {
  // A local server standing in for "the network": every request to it is counted.
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/plain' });
    res.end('ok');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const target = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const appOrigin = new URL(page.url()).origin;
  try {
    const frameId = (await page
      .locator('[data-testid="orb-frame"][aria-label="Prototype"]')
      .getAttribute('data-frame-id'))!;
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_b_msg_probe',
            name: 'message_agent',
            arguments: { agent: 'builder', message: 'Draw the quarterly chart.' },
          },
        ],
      },
      { text: 'Asked Builder for the chart.' },
    );
    scripts.builder.push(
      {
        toolCalls: [
          {
            id: 'call_b_probe',
            name: 'write_design_frame',
            arguments: {
              frameId,
              title: 'Quarterly chart',
              html: probeHtml(target, appOrigin),
              why: 'Charts the quarters.',
            },
          },
        ],
      },
      { text: 'The chart is up.' },
    );
    await page.getByTestId('chat-pill').click();
    await send('Draw the quarterly chart.');
    const card = page
      .locator('[data-testid="orb-card"][data-card-type="design"]')
      .filter({ hasText: 'Quarterly chart' });
    await expect(card).toHaveCount(1, { timeout: 15_000 });
    const id = (await card.getAttribute('data-card-id'))!;
    const frame = page.frameLocator(`[data-card-id="${id}"] [data-testid="design-frame"]`);
    await expect(frame.locator('#out')).not.toBeEmpty({ timeout: 15_000 });
    const out = JSON.parse((await frame.locator('#out').textContent())!) as {
      tried: Record<string, string>;
      violations: string[];
      bars: number;
      chart: string;
      d3: string;
    };
    // The bundled libraries ran: three D3 bars, a Chart.js chart.
    expect(out.chart).toBe('function');
    expect(out.d3).toBe('object');
    expect(out.bars).toBe(3);
    const drawn = await frame.locator('#chart').evaluate((c: HTMLCanvasElement) => {
      const px = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i]! > 0) n++;
      return n;
    });
    expect(drawn).toBeGreaterThan(500);
    // Every way out failed, and the CSP reported the attempts.
    expect(out.tried.fetch).toBe('refused');
    expect(out.tried.app).toBe('refused');
    expect(out.tried.xhr).toBe('refused');
    expect(out.tried.ws).toBe('refused');
    expect(out.tried.sse).toBe('refused');
    expect(out.tried.beacon).not.toBe('sent');
    expect(out.tried.worker).toBe('refused');
    expect(out.tried.popup).toBe('refused');
    expect(out.violations).toEqual(expect.arrayContaining(['connect-src', 'img-src', 'script-src-elem']));
    // A navigation of the frame itself is refused too (the app's frame-src names only the frame route).
    const inner = page.frames().find((f) => isFramePage(f.url()) && f.url().includes(id))!;
    await inner.evaluate((url) => void (location.href = url), `${target}/navigate`).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 1000));
    // Nothing reached the stand-in network.
    expect(hits).toEqual([]);
    expect(offOrigin).toEqual([]);
    expect(frameFinished).toEqual([]);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
