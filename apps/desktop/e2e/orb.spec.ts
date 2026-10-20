/// <reference lib="dom" />
/**
 * P1.6 Done-when, in the real window: the UI calls `orb/ping` on Orb's own Remote namespace (orb-host) and receives
 * an `orb/board.follow` stream (snapshot first, stream stays open).
 */
import { liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const desktopDir = resolve(import.meta.dirname, '..');

let app: ElectronApplication;
let page: Page;
let tmp: string;

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-orb-'));
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
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('the UI pings orb-host and follows a board stream', async () => {
  await expect(page.getByTestId('orb-ping')).toHaveText(/^orb-host /);
  await page.getByTestId('home-prompt').fill('Orb probe canvas');
  await page.getByTestId('orb-create').click();
  const screen = page.getByTestId('canvas-screen');
  await expect(screen).toHaveAttribute('data-canvas-id', /^\d{4}-\d{2}-\d{2}-orb-probe-canvas$/);
  await expect(screen).toHaveAttribute('data-follow', 'open');
  await expect(screen).toHaveAttribute('data-snapshot', '0 cards, next seq 0');
  // The stream stays open (no end frame) after the snapshot.
  await page.waitForTimeout(500);
  await expect(screen).toHaveAttribute('data-follow', 'open');
  await expect(screen).toHaveAttribute('data-frames', '1');
  await expect(page.getByTestId('orb-error')).toHaveCount(0);
});
