/// <reference lib="dom" />
/** Six Symplist styles × two modes in the actual Electron app, including source-backed visuals and restart. */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { appearancePalette, appearanceVariables, themeIds } from '@orb/shared';
import { seedPrintFixture, type PrintFixture } from '../../../scripts/testkit/printFixture.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';
import { liveWindow } from './support/ui.ts';
import { contrastScan, formatContrast } from './support/a11y.ts';

test.describe.configure({ mode: 'serial' });
let app: ElectronApplication;
let page: Page;
let tmp: string;
let fixture: PrintFixture;
const desktop = resolve(import.meta.dirname, '..');
const screenshots = resolve('.orb-dev/e2e-results', ...namespaceSegments(), 'appearance');
const go = async (hash: string) => {
  await page.evaluate((value) => {
    location.hash = value;
  }, hash);
};
// Electron can return the previous compositor frame immediately after a DOM/theme change.
const settlePaint = () =>
  page.evaluate(() =>
    document.fonts.ready.then(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    ),
  );
async function launch() {
  app = await electron.launch({
    args: [desktop],
    env: {
      ...process.env,
      ORB_HOME: join(tmp, 'Orb'),
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_USER_DATA: join(tmp, 'electron'),
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await page.emulateMedia({ reducedMotion: 'reduce' });
}
test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-appearance-'));
  fixture = await seedPrintFixture(join(tmp, 'Orb'), { frames: 5, title: 'Theme acceptance board' });
  mkdirSync(screenshots, { recursive: true });
  await launch();
});
test.afterAll(async () => {
  await app?.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('all six styles retain independent accents and brightness on Settings, Home, board and expanded diagrams', async () => {
  for (const themeId of themeIds)
    for (const mode of ['light', 'dark'] as const) {
      await go('#/settings');
      await page.getByTestId(`appearance-style-${themeId}`).click();
      await page.getByTestId('appearance-accent-rose').click();
      await page.getByTestId(`appearance-mode-${mode}`).click();
      const appearance = { themeId, mode, accent: 'rose' as const };
      await expect(page.locator('html')).toHaveAttribute('data-style', themeId);
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'light' ? 'day' : 'night');
      const expected = appearanceVariables(appearance, mode);
      expect(
        await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--orb-bg').trim(),
        ),
      ).toBe(expected['--orb-bg']);
      await expect(page.getByTestId(`appearance-style-${themeId}`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('appearance-accent-rose')).toHaveAttribute('aria-pressed', 'true');
      await settlePaint();
      await page.screenshot({ path: join(screenshots, `${themeId}-${mode}-settings.png`) });
      const contrast = await contrastScan(page);
      expect(formatContrast(contrast), `${themeId} ${mode} Settings contrast`).toBe('');
      await go('#/');
      await expect(page.getByTestId('home-screen')).toBeVisible();
      expect(
        await page.getByTestId('home-screen').evaluate((el) => getComputedStyle(el).backgroundImage),
      ).toBe('none');
      expect(
        await page
          .getByTestId('home-screen')
          .evaluate(
            (el) =>
              el.querySelectorAll('[class*="glow"]').length === 0 ||
              [...el.querySelectorAll('[class*="glow"]')].every(
                (node) => getComputedStyle(node).backgroundImage === 'none',
              ),
          ),
      ).toBe(true);
      await settlePaint();
      await page.screenshot({ path: join(screenshots, `${themeId}-${mode}-home.png`) });
      expect(formatContrast(await contrastScan(page)), `${themeId} ${mode} Home contrast`).toBe('');
      await go(`#/canvas/${fixture.canvasId}?focus=${fixture.cards.diagram}`);
      await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
      await page.screenshot({ path: join(screenshots, `${themeId}-${mode}-board.png`) });
      await page.getByTestId('card-open-reader').click();
      const diagram = page.getByTestId('reader-diagram');
      await expect(diagram).toHaveAttribute('data-state', 'ready');
      const svg = await diagram.innerHTML();
      expect(svg.toLowerCase()).toContain(appearancePalette(appearance, mode).accent.accent.toLowerCase());
      await page.getByTestId('reader-close').click();
      await settlePaint();
      await page.screenshot({ path: join(screenshots, `${themeId}-${mode}-board.png`) });
    }
});

test('custom colours, System changes and cold restart preserve all three independent choices', async () => {
  await go('#/settings');
  await page.getByTestId('appearance-style-paper').click();
  await page.getByLabel('Custom hex colour').fill('#7048E8');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByTestId('appearance-mode-system').click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await expect(page.locator('html')).toHaveAttribute('data-style', 'paper');
  await expect
    .poll(() => JSON.parse(readFileSync(join(tmp, 'Orb/orb.json'), 'utf8')).appearance)
    .toEqual({ themeId: 'paper', accent: '#7048E8', mode: 'system' });
  await app.close();
  await launch();
  await go('#/settings');
  await expect(page.getByTestId('appearance-style-paper')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('appearance-mode-system')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Custom hex colour')).toHaveValue('#7048E8');
  await page.getByLabel('Custom hex colour').fill('badcss');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByLabel('Custom hex colour')).toHaveAttribute('aria-invalid', 'true');
  expect(JSON.parse(readFileSync(join(tmp, 'Orb/orb.json'), 'utf8')).appearance.accent).toBe('#7048E8');
});

test('failed saves are explicit and retryable; rapid independent changes persist in click order', async () => {
  await go('#/settings');
  const endpoint = '**/api/orb/settings.set';
  await page.route(endpoint, (route) => route.fulfill({ status: 503, body: 'temporarily unavailable' }));
  await page.getByTestId('appearance-accent-teal').click();
  await expect(page.getByTestId('appearance-save-state')).toHaveText('Preview only — save failed');
  expect(JSON.parse(readFileSync(join(tmp, 'Orb/orb.json'), 'utf8')).appearance.accent).toBe('#7048E8');
  await page.unroute(endpoint);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByTestId('appearance-save-state')).toHaveText('Saved on this Mac');
  await page.getByTestId('appearance-style-meadow').click();
  await page.getByTestId('appearance-accent-amber').click();
  await page.getByTestId('appearance-mode-dark').click();
  await expect(page.getByTestId('appearance-save-state')).toHaveText('Saved on this Mac');
  await expect
    .poll(() => JSON.parse(readFileSync(join(tmp, 'Orb/orb.json'), 'utf8')).appearance)
    .toEqual({ themeId: 'meadow', accent: 'amber', mode: 'dark' });
  await page.reload();
  await expect(page.getByTestId('appearance-style-meadow')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('appearance-accent-amber')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('appearance-mode-dark')).toHaveAttribute('aria-pressed', 'true');
});
