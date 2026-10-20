import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { themeIds, appearanceVariables } from '../../../packages/shared/src/appearance/index.js';

const captures = resolve('.orb-dev/oss-preparation/site-preview');
const failures: string[] = [];

test.beforeEach(async ({ page }) => {
  failures.length = 0;
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('/');
  const decline = page.getByRole('button', { name: 'Decline', exact: true });
  if (await decline.isVisible()) await decline.click();
  await page.evaluate(() => document.fonts.ready);
});
test.afterEach(() => expect(failures).toEqual([]));

test('all six themes and both modes load real screenshots, share app tokens and remain accessible', async ({
  page,
}) => {
  const remote: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4179')) remote.push(request.url());
  });
  for (const themeId of themeIds)
    for (const mode of ['light', 'dark'] as const) {
      await page.getByLabel('Style', { exact: true }).selectOption(themeId);
      await page.getByLabel('Brightness', { exact: true }).selectOption(mode);
      await expect(page.locator('html')).toHaveAttribute('data-style', themeId);
      const expected = appearanceVariables({ themeId, mode, accent: 'blue' }, mode);
      expect(
        await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--orb-bg')),
      ).toBe(expected['--orb-bg']);
      await expect
        .poll(() =>
          page
            .locator('#workspace-image')
            .evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth),
        )
        .toBe(1600);
      await page.evaluate(axe.source);
      const violations = await page.evaluate(
        async () =>
          (
            await (window as any).axe.run(document, {
              runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
            })
          ).violations,
      );
      expect(
        violations.map((v: any) => ({ id: v.id, nodes: v.nodes.map((n: any) => n.target) })),
        `${themeId} ${mode}`,
      ).toEqual([]);
    }
  expect(remote).toEqual([]);
});

test('appearance persists, System follows media changes, and the image dialog supports keyboard close', async ({
  page,
}) => {
  await page.getByLabel('Style', { exact: true }).selectOption('paper');
  await page.getByLabel('Accent', { exact: true }).selectOption('rose');
  await page.getByLabel('Brightness', { exact: true }).selectOption('dark');
  await page.reload();
  await expect(page.getByLabel('Style', { exact: true })).toHaveValue('paper');
  await expect(page.getByLabel('Accent', { exact: true })).toHaveValue('rose');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.getByRole('button', { name: 'Enlarge workspace screenshot' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Brightness', { exact: true }).selectOption('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.getByRole('button', { name: 'Use Meadow style' }).click();
  await expect(page.getByLabel('Style', { exact: true })).toHaveValue('meadow');
  await expect(page.getByRole('button', { name: 'Use Meadow style' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('desktop and mobile keep content inside the viewport and provide working FAQ controls', async ({
  page,
}) => {
  mkdirSync(captures, { recursive: true });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    const firstQuestion = page.locator('details').first().locator('summary');
    await firstQuestion.click();
    await expect(page.locator('details').first()).toHaveAttribute('open', '');
    await firstQuestion.click();
    await page.screenshot({ path: resolve(captures, `site-${width}.png`), fullPage: true });
  }
});

test('blocked browser storage still leaves theme controls usable', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('Storage disabled');
        },
      });
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4179');
    await page.getByLabel('Style', { exact: true }).selectOption('tide');
    await expect(page.locator('html')).toHaveAttribute('data-style', 'tide');
  } finally {
    await context.close();
  }
});
