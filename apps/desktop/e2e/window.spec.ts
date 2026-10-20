/// <reference lib="dom" />
import { liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const desktopDir = resolve(import.meta.dirname, '..');

let app: ElectronApplication;
let page: Page;
let tmp: string;
const consoleLines: string[] = [];

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-'));
  app = await electron.launch({
    args: [desktopDir],
    env: {
      ...process.env,
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_HOME: join(tmp, 'Orb'),
      ORB_USER_DATA: join(tmp, 'electron'),
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  page.on('console', (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('the window shows the orb UI served by the sidecar', async () => {
  await expect(page.getByTestId('orb-root')).toBeVisible();
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await expect(page.getByTestId('home-screen').locator('header')).toContainText('orb');
  const url = new URL(page.url());
  expect(url.protocol).toBe('http:');
  expect(url.hostname).toBe('127.0.0.1');
  expect(url.pathname).toBe('/');
  // The token was swapped for a cookie and the gateway redirected to `/`.
  expect(url.search).toBe('');
  // Preload ran under contextIsolation + sandbox; no Node in the page.
  expect(await page.evaluate(() => (window as any).orbNative?.version)).toBe(4);
  expect(await page.evaluate(() => typeof (window as any).ipcRenderer)).toBe('undefined');
  expect(await page.evaluate(() => typeof (window as any).require)).toBe('undefined');
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    // Present at runtime in Electron 44 but missing from its typings.
    const p = (BrowserWindow.getAllWindows()[0]!.webContents as any).getLastWebPreferences();
    return { contextIsolation: p.contextIsolation, sandbox: p.sandbox, nodeIntegration: p.nodeIntegration };
  });
  expect(prefs).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false });
});

test('P6.1b brand: lowercase "orb" everywhere and the Constellation mark, no old mark', async () => {
  // Home top-left: the horizontal lockup, mark + lowercase wordmark.
  const lockup = page.getByTestId('brand-lockup');
  await expect(lockup).toHaveText('orb');
  await expect(lockup.locator('svg[data-mark="full"]')).toHaveCount(1);
  // Six points (four plain, the Signal point, the bright point) and two links (hexagon + chord).
  await expect(lockup.locator('svg circle')).toHaveCount(6);
  await expect(lockup.locator('svg path')).toHaveCount(2);
  // The pre-Constellation mark (core + tilted orbit ellipse) is gone.
  expect(await page.locator('svg ellipse').count()).toBe(0);
  // Page and window titles, the app (menu/About/Dock) name.
  expect(await page.title()).toBe('orb');
  const native = await app.evaluate(({ app: a, BrowserWindow, Menu }) => ({
    name: a.getName(),
    window: BrowserWindow.getAllWindows()[0]!.getTitle(),
    menu: Menu.getApplicationMenu()?.items[0]?.label,
    quit: Menu.getApplicationMenu()
      ?.items[0]?.submenu?.items.map((i) => i.label)
      .filter((l) => /orb/i.test(l)),
  }));
  expect(native.name).toBe('orb');
  expect(native.window).toBe('orb');
  expect(native.menu).toBe('orb');
  expect(native.quit).toEqual(expect.arrayContaining(['About orb', 'Hide orb', 'Quit orb']));
  // The tab icon: the simplified mark (ring + bright point), served from the sidecar origin.
  const favicon = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href;
    const svg = href.startsWith('data:')
      ? decodeURIComponent(href.slice(href.indexOf(',') + 1))
      : await (await fetch(href)).text();
    return svg;
  });
  expect(favicon).toContain('stroke-width="13"');
  expect(favicon).not.toContain('M25.4 40 L94.6 80');
  // Interactive mark follows the contrast-tested accent under each brightness.
  await page.getByTestId('open-settings').click();
  for (const mode of ['light', 'dark'] as const) {
    await page.getByTestId(`appearance-mode-${mode}`).click();
    const mark = page.getByTestId('about-lockup').locator('svg circle').last();
    const colours = await mark.evaluate((el) => ({
      actual: getComputedStyle(el).fill,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--orb-accent').trim(),
    }));
    const resolved = await page.evaluate((accent) => {
      const el = document.createElement('span');
      el.style.color = accent;
      document.body.append(el);
      const value = getComputedStyle(el).color;
      el.remove();
      return value;
    }, colours.accent);
    expect(colours.actual).toBe(resolved);
  }
});

test('the CSP header is set and the served page raises no CSP violations', async () => {
  const csp = await page.evaluate(async () => (await fetch('/')).headers.get('content-security-policy'));
  expect(csp).toContain("script-src 'self'");
  // Reload with the console listener attached from the start of the document.
  consoleLines.length = 0;
  await page.reload();
  await expect(page.getByTestId('orb-root')).toBeVisible();
  expect(consoleLines.filter((l) => /Content Security Policy|Refused to/i.test(l))).toEqual([]);
  // The gateway's inline scripts ran because their hashes are allowed...
  expect(await page.evaluate(() => typeof (globalThis as any).__DSH_CONNECTION_RECOVERY__)).toBe('object');
  // ...but any other inline script (e.g. injected markup) is refused.
  const ran = await page.evaluate(async () => {
    const s = document.createElement('script');
    s.textContent = 'globalThis.__orbInjected = true';
    document.body.append(s);
    await new Promise((r) => setTimeout(r, 50));
    return (globalThis as any).__orbInjected === true;
  });
  expect(ran).toBe(false);
});

test('fetch POST /api/session/list from the page succeeds', async () => {
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/session/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'e2e-1',
        method: 'session/list',
        payload: { args: { _request: {} } },
      }),
    });
    return { status: r.status, body: await r.json() };
  });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    type: 'server-response',
    rpcId: 'e2e-1',
    result: { ok: true, value: { items: [] } },
  });
});

test('a request to /api/file?path=/etc/hosts is blocked', async () => {
  const attempts = ['/api/file?path=/etc/hosts', '/api/%66ile?path=/etc/hosts', '//api/file?path=/etc/hosts'];
  for (const path of attempts) {
    const out = await page.evaluate(async (p) => {
      try {
        const r = await fetch(p);
        return `status ${r.status}: ${(await r.text()).slice(0, 40)}`;
      } catch (err) {
        return `network error: ${(err as Error).name}`;
      }
    }, path);
    expect(out, path).toBe('network error: TypeError');
  }
});

test('external links open in the default browser and never navigate the window', async () => {
  await app.evaluate(({ shell }) => {
    (globalThis as any).__opened = [];
    shell.openExternal = async (url: string) => void (globalThis as any).__opened.push(url);
  });
  const before = page.url();
  // window.open → setWindowOpenHandler (denied, handed to the browser).
  await page.evaluate(() => window.open('https://example.com/open', '_blank'));
  // Top-level navigation → will-navigate (prevented, handed to the browser).
  await page.evaluate(() => {
    location.href = 'https://example.com/nav';
  });
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).__opened as string[]))
    .toEqual(['https://example.com/open', 'https://example.com/nav']);
  expect(page.url()).toBe(before);
  expect(app.windows()).toHaveLength(1);
  // Cross-origin subresource fetches never leave the machine either.
  const ext = await page.evaluate(() =>
    fetch('https://example.com/').then(
      () => 'reached',
      () => 'blocked',
    ),
  );
  expect(ext).toBe('blocked');
});

test('P6.9: the e2e window is moved off-screen, inert and unfocused (real input cannot reach it)', async () => {
  test.skip(process.env.ORB_E2E_VISIBLE === '1', 'a visible run was asked for');
  const b = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    const bounds = win.getBounds();
    return { x: bounds.x, visible: win.isVisible(), focused: win.isFocused(), focusable: win.isFocusable() };
  });
  // macOS keeps a shown window partly on a display, so the position only moved it; the window must be inert.
  expect(b.x).toBeLessThan(0);
  expect(b.focusable).toBe(false);
  // Still a live page: shown (for Chromium), rendering, and not focused.
  expect(b.visible).toBe(true);
  expect(b.focused).toBe(false);
  // Animation frames keep firing (an occluded window would throttle them).
  const frames = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - t0 < 500) requestAnimationFrame(tick);
          else resolve(n);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(frames).toBeGreaterThan(15);
});
