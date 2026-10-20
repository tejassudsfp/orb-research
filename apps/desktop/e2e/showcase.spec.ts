/// <reference lib="dom" />
/** Opt-in public image capture; no private homes, real providers, accounts or source fetches. */
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { themeIds } from '@orb/shared';
import { seedShowcase } from '../../../scripts/testkit/showcase.ts';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { liveWindow } from './support/ui.ts';

test('capture the public example workspace and readers', async () => {
  test.skip(
    process.env.ORB_CAPTURE_SHOWCASE !== '1',
    'Run pnpm screenshots to update public assets intentionally.',
  );
  test.setTimeout(180_000);
  const tmp = mkdtempSync(join(tmpdir(), 'orb-public-showcase-'));
  const pictures = resolve('docs/images');
  mkdirSync(pictures, { recursive: true });
  const fixture = await seedShowcase(join(tmp, 'Orb'));
  const llm = await new MockLlm({
    defaultTurn: {
      text: '**Start with one session.**\n\nBefore committing to a recurring program:\n\n1. Confirm the venue and safety rules.\n2. Recruit a small repair team.\n3. Record demand, repairs and volunteer time.\n\nThe board compares three formats. Its scores are provisional judgments in this invented example; review the assumptions before deciding.\n\n**Next step:** speak with the venue manager and agree a safe pilot scope.',
    },
  }).start();
  writeFileSync(join(tmp, 'mock.patch.yml'), mockProviderPatch(llm.baseURL));
  const app = await electron.launch({
    args: [resolve('apps/desktop')],
    env: {
      ...process.env,
      ORB_HOME: join(tmp, 'Orb'),
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_USER_DATA: join(tmp, 'electron'),
      ORB_EXTRA_PATCH_FILE: join(tmp, 'mock.patch.yml'),
      [MOCK_KEY_ENV]: 'orb-mock-key',
    } as Record<string, string>,
  });
  try {
    const page = await liveWindow(app);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1600, 1000));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const go = async (hash: string) =>
      page.evaluate((value) => {
        location.hash = value;
      }, hash);
    const paint = async () => {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(350); // Electron's compositor can lag a theme repaint by a frame.
    };
    await go(`#/canvas/${fixture.canvasId}`);
    await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
    await page.getByTestId('orb-chat-input').fill('What should we validate before committing to a venue?');
    await page.getByTestId('orb-chat-send').click();
    await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-turn', 'completed');
    for (const id of themeIds)
      for (const mode of ['light', 'dark'] as const) {
        await go('#/settings');
        await page.getByTestId(`appearance-style-${id}`).click();
        await page.getByTestId('appearance-accent-blue').click();
        await page.getByTestId(`appearance-mode-${mode}`).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'light' ? 'day' : 'night');
        await go(`#/canvas/${fixture.canvasId}`);
        await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
        await page.keyboard.press('Shift+1');
        await paint();
        await page.screenshot({ path: join(pictures, `workspace-${id}-${mode}.png`) });
      }
    await go('#/settings');
    await page.getByTestId('appearance-style-studio').click();
    await page.getByTestId('appearance-mode-light').click();
    await go(`#/canvas/${fixture.canvasId}?focus=${fixture.matrix}`);
    await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
    await page
      .locator(`[data-testid="orb-card"][data-card-id="${fixture.matrix}"]`)
      .getByTestId('orb-card-title')
      .click();
    await expect(page.getByTestId('reader')).toHaveAttribute('data-card-id', fixture.matrix);
    await expect(page.getByTestId('reader-matrix-table')).toBeVisible();
    await paint();
    await page.screenshot({ path: join(pictures, 'matrix.png') });
    writeFileSync(
      join(pictures, 'capture.json'),
      JSON.stringify(
        {
          generated: '2026-10-19',
          content: 'Entirely invented community repair-café scenario; not completed real research.',
          source: 'scripts/testkit/showcase.ts',
          capture: 'apps/desktop/e2e/showcase.spec.ts',
          viewport: { width: 1600, height: 1000 },
          themes: themeIds,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await app.close();
    await llm.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});
