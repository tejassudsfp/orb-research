/// <reference lib="dom" />
/**
 * P2.1 Done-when: the app shell (tokens, bundled Geist, floating chrome, router) renders, and the floating canvas chrome
 * retains its layout, with a reviewed flat Studio baseline after the P6.27 appearance redesign.
 *
 * P6.27 replaces the starfield prototype baseline with flat Studio. P6.31 intentionally replaces the corner
 * conversation with a full-height rail and reserves board space beside it; its reviewed baseline retains the
 * same 0.1% pixel-diff tolerance.
 * Captures use the same Electron at 1440×900; only conversation history/activity are masked as before.
 * The committed snapshot retains the original 0.1% tolerance for future chrome regressions.
 */
import { liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { VIEWPORT, repoRoot } from './support/screenshot.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';

const desktopDir = resolve(import.meta.dirname, '..');
/**
 * Share of compared pixels allowed to differ. Both captures come from the same Chromium, so the baseline is 0 px;
 * 0.1% (~1,150 px at 1440x900) still fails when a chrome element is missing (Publish Port is ~6,700 px) or moved
 * (the toolbar 40 px lower is ~3,250 px), which a 1% limit let through.
 */
const MAX_DIFF_RATIO = 0.001;

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
const consoleLines: string[] = [];
const requests: string[] = [];

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-shell-'));
  mkdirSync(join(tmp, 'Orb'));
  writeFileSync(join(tmp, 'Orb', 'orb.json'), JSON.stringify({ theme: 'night' }));
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
  page.on('console', (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));
  page.on('request', (req) => requests.push(req.url()));
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const go = (hash: string) => page.evaluate((h) => (location.hash = h), hash);

test('the router shows Home, Settings, First run, Port, diagnostics and a not-found screen', async () => {
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await expect(page.getByTestId('orb-ping')).toHaveText(/^orb-host /);
  await expect(page.getByTestId('orb-canvas-list')).toHaveAttribute('data-loaded', 'yes');

  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await expect(page.getByTestId('about-engine')).toHaveText(/^orb-host /);
  // Appearance is immediately reachable when Settings opens, before the long model/pricing sections.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 600));
  await expect(page.getByTestId('settings-appearance')).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.getByTestId('orb-root')).toHaveAttribute('data-theme', 'day');
  const screenDir = join(repoRoot, '.orb-dev', 'e2e-results', ...namespaceSegments(), 'screens');
  mkdirSync(screenDir, { recursive: true });
  await page.screenshot({ path: join(screenDir, 'theme-settings-light.png') });
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.getByTestId('orb-root')).toHaveAttribute('data-theme', 'night');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await page.goBack();
  await expect(page.getByTestId('home-screen')).toBeVisible();

  await go('#/first-run');
  await expect(page.getByTestId('first-run-screen')).toBeVisible();
  await page.getByTestId('first-run-continue').click();
  await expect(page.getByTestId('home-screen')).toBeVisible();

  await go('#/port/2026-01-01-anything');
  await expect(page.getByTestId('port-screen')).toBeVisible();
  await expect(page.getByTestId('back-to-canvas')).toHaveAttribute('href', '#/canvas/2026-01-01-anything');

  await go('#/dev');
  await expect(page.getByTestId('session-probe')).toBeVisible();

  await go('#/no/such/screen');
  await expect(page.getByTestId('not-found-screen')).toBeVisible();

  await go('#/');
  await expect(page.getByTestId('home-screen')).toBeVisible();
  // The page path never changes (the sidecar serves the UI at `/`).
  expect(new URL(page.url()).pathname).toBe('/');
});

test('Home creates a canvas and opens the Canvas screen with its chrome; the title edits inline', async () => {
  await page.getByTestId('home-prompt').fill('Research canvas idea');
  await page.getByTestId('orb-create').click();
  const screen = page.getByTestId('canvas-screen');
  await expect(screen).toHaveAttribute('data-follow', 'open');
  await expect(screen).toHaveAttribute('data-canvas-id', /^\d{4}-\d{2}-\d{2}-research-canvas-idea$/);
  expect(new URL(page.url()).hash).toMatch(/^#\/canvas\/\d{4}-\d{2}-\d{2}-research-canvas-idea$/);

  await expect(page.getByTestId('canvas-title')).toHaveText('Research canvas idea');
  await expect(page.getByTestId('save-state')).toHaveText('Saved locally');
  await expect(page.getByTestId('publish-port')).toBeVisible();
  // Theme is a visible, labelled action on the board, including at the smallest supported window size.
  const appearance = page.getByTestId('canvas-theme-toggle');
  await expect(appearance).toHaveText('Light mode');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 600));
  await expect(appearance).toBeInViewport({ ratio: 1 });
  const titleBounds = (await page.getByTestId('title-pill').boundingBox())!;
  const appearanceBounds = (await appearance.boundingBox())!;
  expect(titleBounds.x + titleBounds.width + 12).toBeLessThan(appearanceBounds.x);
  const screenDir = join(repoRoot, '.orb-dev', 'e2e-results', ...namespaceSegments(), 'screens');
  await page.screenshot({ path: join(screenDir, 'theme-board-dark.png') });
  await appearance.click();
  await expect(page.getByTestId('orb-root')).toHaveAttribute('data-theme', 'day');
  await expect(appearance).toHaveText('Dark mode');
  await page.screenshot({ path: join(screenDir, 'theme-board-light.png') });
  await appearance.click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  for (const label of ['Select', 'Add note', 'Add frame', 'Connect cards', 'Add card']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Add frame' }).click();
  await expect(page.getByRole('button', { name: 'Add frame' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.getByTestId('minimap')).toBeVisible();
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');

  // Zoom buttons scale the world (clamped 25%–250%); the level button resets.
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByTestId('zoom-level')).toHaveText('120%');
  await expect(page.getByTestId('world')).toHaveAttribute('style', /scale\(1\.2\)/);
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(page.getByTestId('zoom-level')).toHaveText('25%');
  await page.getByTestId('zoom-level').click();
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');

  // Conversation panel minimises to a pill and comes back.
  await page.getByTestId('chat-minimise').click();
  await expect(page.getByTestId('chat-panel')).toHaveCount(0);
  await page.getByTestId('chat-pill').click();
  await expect(page.getByTestId('chat-panel')).toBeVisible();

  // Inline rename: Escape cancels, Enter saves through orb/canvas.rename (canvas.json).
  const canvasId = (await screen.getAttribute('data-canvas-id'))!;
  await page.getByTestId('canvas-title').click();
  await page.getByTestId('canvas-title-input').fill('Something else');
  await page.getByTestId('canvas-title-input').press('Escape');
  await expect(page.getByTestId('canvas-title')).toHaveText('Research canvas idea');
  await page.getByTestId('canvas-title').click();
  await page.getByTestId('canvas-title-input').fill('Renamed board');
  await page.getByTestId('canvas-title-input').press('Enter');
  await expect(page.getByTestId('canvas-title')).toHaveText('Renamed board');
  await expect(page.getByTestId('save-state')).toHaveText('Saved locally');
  const list = await page.evaluate(async () => {
    const r = await fetch('/api/orb/canvas.list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'e2e-list',
        method: 'orb/canvas.list',
        payload: { args: {} },
      }),
    });
    return (await r.json()).result.value as { id: string; title: string }[];
  });
  expect(list.find((c) => c.id === canvasId)?.title).toBe('Renamed board');
  await page.getByTestId('canvas-title').click();
  await page.getByTestId('canvas-title-input').fill('Research canvas idea');
  await page.getByTestId('canvas-title-input').press('Enter');
  await expect(page.getByTestId('canvas-title')).toHaveText('Research canvas idea');

  // Publish Port opens the composer sheet (P4.4); its research-document mode links the reading view.
  await page.getByTestId('publish-port').click();
  await expect(page.getByTestId('composer')).toBeVisible();
  await page.getByTestId('composer-mode').locator('[data-value="doc"]').click();
  await page.getByTestId('composer-reading-view').click();
  await expect(page.getByTestId('port-screen')).toHaveAttribute('data-canvas-id', canvasId);
  await page.getByTestId('back-to-canvas').click();
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await expect(page.getByTestId('orb-error')).toHaveCount(0);
});

test('fonts are bundled: Geist loads from the sidecar origin, nothing else is requested', async () => {
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      geist: document.fonts.check("600 15px 'Geist Variable'"),
      mono: document.fonts.check("500 12px 'IBM Plex Mono'"),
      loaded: [...document.fonts]
        .filter((f) => f.status === 'loaded')
        .map((f) => `${f.family.replace(/['"]/g, '')} ${f.weight}`),
    };
  });
  expect(fonts.geist).toBe(true);
  expect(fonts.mono).toBe(true);
  expect(fonts.loaded).toEqual(expect.arrayContaining(['Geist Variable 100 900', 'IBM Plex Mono 500']));
  const origin = new URL(page.url()).origin;
  const foreign = requests.filter(
    (u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'),
  );
  expect(foreign).toEqual([]);
  expect(requests.some((u) => /\/assets\/geist-latin-wght-normal-[^/]+\.woff2$/.test(u))).toBe(true);
  expect(consoleLines.filter((l) => /Content Security Policy|Refused to/i.test(l))).toEqual([]);
});

/** P6.27 deliberately replaces the old starfield prototype's colours, fonts and geometry. */
test('the flat Studio shell matches its reviewed visual baseline', async () => {
  await expect(page.getByTestId('canvas-title')).toHaveText('Research canvas idea');
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await app.evaluate(
    ({ BrowserWindow }, vp) => BrowserWindow.getAllWindows()[0]!.setContentSize(vp.width, vp.height),
    VIEWPORT,
  );
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('canvas-studio-dark.png', {
    animations: 'disabled',
    mask: [page.getByTestId('chat-body'), page.getByTestId('chat-activity')],
    maxDiffPixelRatio: MAX_DIFF_RATIO,
    threshold: 0.1,
  });
});
