/// <reference lib="dom" />
/**
 * P5.3 Settings in the real app (temp homes, no model calls; the folder picker and the confirm box are stubbed in
 * main, Reveal in Finder is recorded instead of opening Finder):
 *   - About: the Orb version, the pinned harness version, the engine, the runtime, and the privacy statement;
 *   - Appearance: night/day, and Reduce motion "Always" (saved in orb.json, `<html data-motion>`, transitions cut,
 *     Home's topic words stop) and back to "Follow macOS";
 *   - Storage: the Orb folder is shown, Reveal in Finder reveals it; Move… moves the whole folder (canvases and all)
 *     to an empty folder, the engine restarts on it and the window comes back to Settings; the canvas opens from the
 *     new place; a taken destination is refused with nothing changed; Use existing folder… switches to an empty
 *     folder (after the confirm) and back to the library; the choice survives a relaunch.
 */
import { createCanvas, liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { HARNESS_VERSION } from '../../ui/src/app/versions.ts';

const desktopDir = resolve(import.meta.dirname, '..');
const appVersion = (JSON.parse(readFileSync(join(desktopDir, 'package.json'), 'utf8')) as { version: string })
  .version;

let tmp: string;
let app: ElectronApplication | undefined;
let page: Page;
let canvasId: string;

test.describe.configure({ mode: 'serial' });

async function launch(): Promise<Page> {
  app = await electron.launch({
    args: [desktopDir],
    env: {
      ...process.env,
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_HOME: join(tmp, 'Orb'),
      ORB_USER_DATA: join(tmp, 'electron'),
    } as Record<string, string>,
  });
  const p = await liveWindow(app);
  await p.waitForLoadState('domcontentloaded');
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900);
    await new Promise((r) => setTimeout(r, 300));
  });
  return p;
}

/** Stub the folder picker (and the confirm box) in main: the next picks return these folders, in order. */
async function stubDialogs(picks: string[], confirm = 0): Promise<void> {
  await app!.evaluate(
    ({ dialog }, { picks, confirm }) => {
      const queue = [...picks];
      const g = globalThis as unknown as { __orbDialogs?: string[] };
      g.__orbDialogs = [];
      dialog.showOpenDialog = (async (...args: unknown[]) => {
        const opts = (args.length > 1 ? args[1] : args[0]) as { title?: string };
        g.__orbDialogs!.push(opts.title ?? '');
        const next = queue.shift();
        return next ? { canceled: false, filePaths: [next] } : { canceled: true, filePaths: [] };
      }) as typeof dialog.showOpenDialog;
      dialog.showMessageBox = (async () => ({
        response: confirm,
        checkboxChecked: false,
      })) as typeof dialog.showMessageBox;
    },
    { picks, confirm },
  );
}

async function openSettings(): Promise<void> {
  await page.evaluate(() => (location.hash = '#/settings'));
  await expect(page.getByTestId('settings-screen')).toBeVisible();
}

/** Click a change button and wait for the engine to restart: a new sidecar origin, back on Settings. */
async function changeAndWaitRestart(button: string): Promise<void> {
  const before = new URL(page.url()).origin;
  await page.getByTestId(button).click();
  await expect(page.getByTestId('storage-done')).toBeVisible();
  await page.waitForURL((u) => u.origin !== before && /^http:\/\/127\.0\.0\.1:\d+$/.test(u.origin), {
    timeout: 60_000,
  });
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/settings');
  await expect(page.getByTestId('storage-path')).not.toHaveText('…');
}

const orbJson = (home: string) =>
  JSON.parse(readFileSync(join(home, 'orb.json'), 'utf8')) as { motion?: string; theme?: string };

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-settings-'));
  page = await launch();
  ({ canvasId } = await createCanvas(page, 'Kites in the stratosphere'));
});

test.afterAll(async () => {
  await app?.close().catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
});

test('About shows the orb, harness, engine and runtime versions and the privacy statement', async () => {
  await openSettings();
  await expect(page.getByTestId('about-orb')).toHaveText(`orb ${appVersion}`);
  await expect(page.getByTestId('about-harness')).toHaveText(`DeepSeek Harness ${HARNESS_VERSION}`);
  await expect(page.getByTestId('about-engine')).toHaveText(/^orb-host \S+/);
  await expect(page.getByTestId('about-runtime')).toContainText('Electron 44.7.0');
  await expect(page.getByTestId('about-privacy')).toHaveText(
    'Privacy: nothing is sent except to the providers you configured.',
  );
});

test('Appearance: Reduce motion "Always" is saved, cuts transitions and stops the Home topics; then back', async () => {
  await openSettings();
  const motion = page.getByTestId('settings-motion');
  await expect(motion.locator('[data-motion="system"]')).toHaveAttribute('aria-pressed', 'true');
  // Under a no-preference system, transitions run at their own length.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const transition = () =>
    page.getByTestId('storage-reveal').evaluate((el) => getComputedStyle(el).transitionDuration);

  await motion.locator('[data-motion="reduce"]').click();
  await expect(motion.locator('[data-motion="reduce"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  await expect.poll(() => orbJson(join(tmp, 'Orb')).motion).toBe('reduce');
  expect(await transition()).toBe('1e-05s');

  // Home's topic words rotate every 2.8 s; with motion reduced they stay still.
  await page.evaluate(() => (location.hash = '#/'));
  const words = page.getByTestId('topic-words');
  await expect(words).toBeVisible();
  const first = await words.textContent();
  await page.waitForTimeout(3500);
  expect(await words.textContent()).toBe(first);

  await openSettings();
  await motion.locator('[data-motion="system"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'system');
  await expect.poll(() => orbJson(join(tmp, 'Orb')).motion).toBe('system');
  await page.evaluate(() => (location.hash = '#/'));
  const still = await words.textContent();
  await expect.poll(() => words.textContent(), { timeout: 8000 }).not.toBe(still);
});

test('Storage shows the orb folder and reveals it in Finder', async () => {
  await openSettings();
  await expect(page.getByTestId('storage-path')).toHaveText(join(tmp, 'Orb'));
  await app!.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __orbRevealed?: string[] };
    g.__orbRevealed = [];
    shell.showItemInFolder = (p: string) => void g.__orbRevealed!.push(p);
  });
  await page.getByTestId('storage-reveal').click();
  await expect
    .poll(() => app!.evaluate(() => (globalThis as unknown as { __orbRevealed?: string[] }).__orbRevealed))
    .toEqual([join(tmp, 'Orb')]);
});

test('Move… moves the whole folder; the engine restarts on it and the canvas opens from there', async () => {
  const dest = join(tmp, 'Moved');
  mkdirSync(dest);
  await stubDialogs([dest]);
  await openSettings();
  await changeAndWaitRestart('storage-move');
  await expect(page.getByTestId('storage-path')).toHaveText(dest);
  expect(existsSync(join(tmp, 'Orb'))).toBe(false);
  expect(existsSync(join(dest, 'canvases', canvasId, 'board.jsonl'))).toBe(true);
  expect(existsSync(join(dest, 'orb.json'))).toBe(true);
  // The pointer lives next to DSH_HOME, not in the Orb folder.
  expect(JSON.parse(readFileSync(join(tmp, 'location.json'), 'utf8'))).toEqual({ v: 1, orbHome: dest });

  await page.evaluate(() => (location.hash = '#/'));
  await expect(page.getByTestId('orb-canvas-open')).toHaveCount(1);
  await page.getByTestId('orb-canvas-open').first().click();
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-canvas-id', canvasId);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
});

test('a taken destination is refused and nothing changes', async () => {
  const taken = join(tmp, 'Taken');
  mkdirSync(join(taken, 'orb'), { recursive: true });
  writeFileSync(join(taken, 'orb', 'orb.json'), '{}');
  writeFileSync(join(taken, 'notes.txt'), 'x');
  await stubDialogs([taken]);
  const origin = new URL(page.url()).origin;
  await openSettings();
  await page.getByTestId('storage-move').click();
  await expect(page.getByTestId('storage-error')).toContainText('already a folder named “orb”');
  await expect(page.getByTestId('storage-path')).toHaveText(join(tmp, 'Moved'));
  expect(new URL(page.url()).origin).toBe(origin);
  // A cancelled picker does nothing either.
  await stubDialogs([]);
  await page.getByTestId('storage-move').click();
  await expect(page.getByTestId('storage-move')).toBeEnabled();
  expect(new URL(page.url()).origin).toBe(origin);
});

test('Use existing folder… switches to an empty folder after the confirm, and back to the library', async () => {
  const fresh = join(tmp, 'Fresh');
  mkdirSync(fresh);
  await stubDialogs([fresh], 0);
  await openSettings();
  await changeAndWaitRestart('storage-existing');
  await expect(page.getByTestId('storage-path')).toHaveText(fresh);
  await page.evaluate(() => (location.hash = '#/'));
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await expect(page.getByTestId('orb-canvas-open')).toHaveCount(0);
  // The library was not touched.
  expect(existsSync(join(tmp, 'Moved', 'canvases', canvasId, 'board.jsonl'))).toBe(true);

  await stubDialogs([join(tmp, 'Moved')]);
  await openSettings();
  await changeAndWaitRestart('storage-existing');
  await expect(page.getByTestId('storage-path')).toHaveText(join(tmp, 'Moved'));
  await page.evaluate(() => (location.hash = '#/'));
  await expect(page.getByTestId('orb-canvas-open')).toHaveCount(1);
});

test('the chosen folder is used again after a relaunch', async () => {
  await app!.close();
  page = await launch();
  await openSettings();
  await expect(page.getByTestId('storage-path')).toHaveText(join(tmp, 'Moved'));
  await page.evaluate(() => (location.hash = '#/'));
  await expect(page.getByTestId('orb-canvas-open')).toHaveCount(1);
  expect(existsSync(join(tmp, 'Orb'))).toBe(false);
});
