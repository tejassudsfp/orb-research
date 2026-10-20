/// <reference lib="dom" />
/**
 * P2.2 Done-when: the canvas renderer (one transformed world layer, viewport culling with a 20% margin, LOD by zoom)
 * runs a board seeded by scripts/seed-board.ts (300 cards in 8 frames) at 60 fps while panning and zooming,
 * measured from a Chrome performance trace (CDP `Tracing`) recorded in the Orb window.
 *
 * Three phases, each bounded by performance marks: a real-input drag pan (CDP Input mouse events), a rAF-paced
 * scroll pan, and a rAF-paced Cmd+scroll zoom 100% → 25% → 250% → 100% (crossing every LOD threshold). The measure
 * is the page renderer's compositor frames (support/trace.ts): frame time = gap between consecutive `DrawFrame`s,
 * pass = p95 ≤ 20 ms and average ≥ 55 fps in every phase. Summary + slimmed gzipped trace go to
 * .orb-dev/e2e-results/perf/; ORB_UPDATE_PERF=1 also writes them to docs/perf/.
 */
import { liveWindow } from './support/ui.ts';
import {
  _electron as electron,
  expect,
  test,
  type CDPSession,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { seedBoard } from '../../../scripts/seed-board.ts';
import { analyseTrace, slimTrace, type TraceEvent } from './support/trace.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';
import { timingExpect } from '../../../scripts/testkit/namespace.ts';

const desktopDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(desktopDir, '..', '..');
const VIEWPORT = { width: 1440, height: 900 };
/** Pass criteria (recorded with the numbers in docs/PROGRESS.md). */
const MAX_P95_FRAME_MS = 20;
const MIN_AVG_FPS = 55;

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
let canvasId: string;

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-perf-'));
  const seeded = await seedBoard({ home: join(tmp, 'Orb'), title: 'Perf board' });
  canvasId = seeded.canvasId;
  llm = await new MockLlm().start();
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
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(async ({ BrowserWindow }, vp) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    win.setContentSize(vp.width, vp.height);
    win.show();
    win.focus();
  }, VIEWPORT);
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await page.evaluate((id) => (location.hash = `#/canvas/${id}`), canvasId);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await expect(page.getByTestId('world')).toHaveAttribute('data-total-cards', '300');
  await page.evaluate(() => document.fonts.ready);
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const world = () => page.getByTestId('world');
const attr = async (name: string) => Number(await world().getAttribute(name));

/**
 * Dispatch one wheel event on the canvas per animation frame for `ms` (in-page, so input never lags a frame).
 * - pan: a scroll that circles (every frame moves the board);
 * - zoom: Cmd+scroll following a log-space path 100% → 25% → 250% → 100%, so every frame changes the zoom (never
 *   parked at a clamp) and the board crosses each LOD threshold (0.6, 0.35) both ways.
 */
function wheelLoop(kind: 'pan' | 'zoom', ms: number, mark: string) {
  return page.evaluate(
    async ({ kind, ms, mark }) => {
      const el = document.querySelector('[data-testid="canvas-screen"]')!;
      const r = el.getBoundingClientRect();
      const WHEEL_ZOOM = 0.0015; // usePanZoom: factor = exp(-deltaY * 0.0015)
      const lnMin = Math.log(0.26);
      const lnMax = Math.log(2.45);
      const lnZoomAt = (k: number) =>
        k < 0.3
          ? (lnMin * k) / 0.3
          : k < 0.8
            ? lnMin + ((lnMax - lnMin) * (k - 0.3)) / 0.5
            : lnMax * (1 - (k - 0.8) / 0.2);
      let lnZoom = 0;
      const worldEl = document.querySelector<HTMLElement>('[data-testid="world"]')!;
      const seen = new Set<string>();
      performance.mark(`${mark}:start`);
      const t0 = performance.now();
      await new Promise<void>((done) => {
        const step = (t: number) => {
          const k = (t - t0) / ms;
          seen.add(worldEl.style.transform);
          if (k >= 1) return done();
          let init: WheelEventInit;
          if (kind === 'pan') {
            const a = k * Math.PI * 2;
            init = { deltaX: Math.cos(a) * 14, deltaY: Math.sin(a) * 9 };
          } else {
            const next = lnZoomAt(k);
            init = { deltaY: -(next - lnZoom) / WHEEL_ZOOM, ctrlKey: true };
            lnZoom = next;
          }
          el.dispatchEvent(
            new WheelEvent('wheel', {
              ...init,
              clientX: r.left + r.width * 0.45,
              clientY: r.top + r.height * 0.5,
              bubbles: true,
              cancelable: true,
            }),
          );
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      performance.mark(`${mark}:end`);
      return seen.size;
    },
    { kind, ms, mark },
  );
}

/** ORB_UPDATE_SCREENS=1: write a capture of the board at the current LOD to docs/screens/. */
async function capture(name: string) {
  if (process.env.ORB_UPDATE_SCREENS !== '1') return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  const dir = join(repoRoot, 'docs', 'screens');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `p2.2-${name}.png`) });
}

/** How many cards intersect the viewport plus a 20% margin, computed here from the folded board and the transform. */
async function expectedCulled(): Promise<number> {
  const style = (await world().getAttribute('style')) ?? '';
  const m = /translate\((-?[\d.e+-]+)px, (-?[\d.e+-]+)px\) scale\(([\d.e+-]+)\)/.exec(style);
  if (!m) throw new Error(`unexpected world transform: ${style}`);
  const [panX, panY, zoom] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const board = JSON.parse((await page.getByTestId('orb-board-state').textContent())!) as {
    cards: Record<string, { x: number; y: number; w: number; h: number }>;
  };
  // The expanded conversation rail reserves a column; culling follows the measured board viewport.
  const size = (await page.getByTestId('canvas-screen').boundingBox())!;
  const w = size.width / zoom;
  const h = size.height / zoom;
  const x0 = -panX / zoom - 0.2 * w;
  const y0 = -panY / zoom - 0.2 * h;
  const x1 = x0 + 1.4 * w;
  const y1 = y0 + 1.4 * h;
  return Object.values(board.cards).filter((c) => c.x < x1 && c.x + c.w > x0 && c.y < y1 && c.y + c.h > y0)
    .length;
}

async function resetView() {
  await page.getByTestId('zoom-level').click();
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
}

test('the renderer virtualises cards, switches LOD by zoom and pans with Space+drag', async () => {
  await resetView();
  // At 100% from the origin only part of the board is mounted.
  const atOne = await attr('data-rendered-cards');
  expect(atOne).toBeGreaterThan(0);
  expect(atOne).toBe(await expectedCulled());
  expect(atOne).toBeLessThan(120);
  await expect(world()).toHaveAttribute('data-lod', 'full');
  await expect(page.locator('[data-testid="orb-card"][data-lod="full"]').first()).toBeVisible();
  await expect(page.getByTestId('orb-frame-label').first()).toHaveText('01 THESIS');
  await expect(page.getByTestId('minimap-frame')).toHaveCount(8);
  await expect(page.getByTestId('minimap-viewport')).toHaveCount(1);
  await capture('lod-full');

  // Keep the original full-window (>150 mounted cards at 25%) scenario; the FPS benchmark below reopens the rail.
  await page.getByTestId('chat-minimise').click();
  await resetView();
  // Cmd+scroll zooms towards the cursor, through compact to title-only; at 25% the whole board is mounted.
  await page.mouse.move(400, 300);
  await page.keyboard.down('Meta');
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 100);
  await page.keyboard.up('Meta');
  await expect(page.getByTestId('zoom-level')).not.toHaveText('100%');
  const zoomed = Number((await page.getByTestId('zoom-level').textContent())!.replace('%', '')) / 100;
  await expect(world()).toHaveAttribute(
    'data-lod',
    zoomed >= 0.6 ? 'full' : zoomed >= 0.35 ? 'compact' : 'title',
  );
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(page.getByTestId('zoom-level')).toHaveText('25%');
  await expect(world()).toHaveAttribute('data-lod', 'title');
  // At 25% most of the board is mounted: exactly the cards inside the viewport grown by 20% on each side.
  await expect.poll(expectedCulled).toBe(await attr('data-rendered-cards'));
  expect(await attr('data-rendered-cards')).toBeGreaterThan(150);
  await expect(page.locator('[data-testid="orb-card"][data-lod="title"]')).toHaveCount(
    await attr('data-rendered-cards'),
  );
  await expect(page.locator('[data-testid="orb-card"]:not([data-lod="title"])')).toHaveCount(0);
  await capture('lod-title');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(world()).toHaveAttribute('data-lod', 'compact');
  await capture('lod-compact');

  // A plain drag that starts on a card does not pan; Space+drag does; plain scroll pans.
  await resetView();
  const card = page.locator('[data-testid="orb-card"]').first();
  const box = (await card.boundingBox())!;
  const transform = async () => (await world().getAttribute('style')) ?? '';
  const before = await transform();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 });
  await page.mouse.up();
  expect(await transform()).toBe(before);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.down('Space');
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  await expect(world()).toHaveAttribute('style', /translate\(100px, 60px\) scale\(1\)/);
  await page.mouse.wheel(30, 40);
  await expect(world()).toHaveAttribute('style', /translate\(70px, 20px\) scale\(1\)/);
  // Panning far right then back mounts and unmounts cards (virtualisation follows the viewport).
  await page.mouse.wheel(3000, 0);
  await expect.poll(() => attr('data-rendered-cards')).not.toBe(atOne);
  await resetView();
});

test('300 cards and 8 frames pan and zoom at 60 fps (Chrome performance trace)', async () => {
  if (await page.getByTestId('chat-pill').count()) await page.getByTestId('chat-pill').click();
  await resetView();
  await page.mouse.move(0, 0);
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const events: TraceEvent[] = [];
  cdp.on('Tracing.dataCollected', (e) => events.push(...(e.value as unknown as TraceEvent[])));
  const complete = new Promise<void>((done) => cdp.once('Tracing.tracingComplete', () => done()));
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      recordMode: 'recordAsMuchAsPossible',
      includedCategories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'blink.user_timing',
        'benchmark',
        'toplevel',
      ],
    },
  });

  // Real input through the browser's input pipeline (CDP Input), then rAF-paced gestures.
  await page.evaluate(() => performance.mark('drag:start'));
  await page.mouse.move(720, 120);
  await page.mouse.down();
  for (let i = 1; i <= 120; i++) await page.mouse.move(720 - i * 6, 120 + Math.sin(i / 10) * 80);
  await page.mouse.up();
  await page.evaluate(() => performance.mark('drag:end'));
  // Each phase really moved the board (frames presented while nothing moved would not prove anything):
  // a plain drag on empty space pans by exactly the pointer travel, scroll pans, Cmd+scroll zooms.
  await expect(world()).toHaveAttribute('style', /translate\(-720px, -?[\d.]+px\) scale\(1\)/);
  // The scroll pan and the zoom publish a new transform on (nearly) every frame.
  expect(await wheelLoop('pan', 4000, 'pan'), 'pan: distinct transforms').toBeGreaterThan(200);
  expect(await wheelLoop('zoom', 6000, 'zoom'), 'zoom: distinct transforms').toBeGreaterThan(300);

  await cdp.send('Tracing.end');
  await complete;
  await cdp.detach();

  const summary = analyseTrace(events, ['drag', 'pan', 'zoom']);
  const slim = slimTrace(events, summary.rendererPid);
  const outDir = join(repoRoot, '.orb-dev', 'e2e-results', ...namespaceSegments(), 'perf');
  mkdirSync(outDir, { recursive: true });
  const full = {
    task: 'P2.2',
    board: { cards: 300, frames: 8, seededBy: 'scripts/seed-board.ts' },
    window: VIEWPORT,
    criteria: { maxP95FrameMs: MAX_P95_FRAME_MS, minAvgFps: MIN_AVG_FPS },
    ...summary,
  };
  const summaryJson = `${JSON.stringify(full, null, 2)}\n`;
  const traceGz = gzipSync(JSON.stringify({ traceEvents: slim }));
  writeFileSync(join(outDir, 'p2.2-trace-summary.json'), summaryJson);
  writeFileSync(join(outDir, 'p2.2-trace.json.gz'), traceGz);
  if (process.env.ORB_UPDATE_PERF === '1') {
    const docs = join(repoRoot, 'docs', 'perf');
    mkdirSync(docs, { recursive: true });
    writeFileSync(join(docs, 'p2.2-trace-summary.json'), summaryJson);
    writeFileSync(join(docs, 'p2.2-trace.json.gz'), traceGz);
  }
  console.log(summaryJson);

  for (const phase of summary.phases) {
    expect(phase.presentedFrames, `${phase.name}: frames presented`).toBeGreaterThan(30);
    timingExpect(() => {
      expect(phase.p95FrameMs, `${phase.name}: p95 frame time`).toBeLessThanOrEqual(MAX_P95_FRAME_MS);
    });
    timingExpect(() => {
      expect(phase.avgFps, `${phase.name}: average fps`).toBeGreaterThanOrEqual(MIN_AVG_FPS);
    });
  }
});
