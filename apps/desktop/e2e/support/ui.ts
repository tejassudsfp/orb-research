/// <reference lib="dom" />
/** Shared e2e steps on the P2.1 shell. */
import { expect, type ElectronApplication, type Page } from '@playwright/test';

/**
 * From Home: type a prompt, create the canvas, and wait for its Canvas screen (board stream open, root agent). Home
 * starts Orb's new-canvas turn (P3.3); this waits until that turn has ended, so a test's next scripted mock turn is
 * never taken by it (with nothing queued, the mock answers it with its default greeting). Specs that run without the
 * mock LLM have no model key, so there the turn ends in `error` at once (no request leaves the machine).
 */
export async function createCanvas(
  page: Page,
  prompt: string,
): Promise<{ canvasId: string; sessionId: string }> {
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await page.getByTestId('home-prompt').fill(prompt);
  await page.getByTestId('orb-create').click();
  const screen = page.getByTestId('canvas-screen');
  await expect(screen).toHaveAttribute('data-follow', 'open');
  await expect(screen).toHaveAttribute('data-session-id', /^orb-/);
  const panel = page.locator('[data-testid="chat-panel"], [data-testid="chat-pill"]').first();
  await expect(panel).toHaveAttribute('data-turn', /^(completed|error)$/, { timeout: 15_000 });
  await expect(panel).toHaveAttribute('data-agents-state', 'idle');
  return {
    canvasId: (await screen.getAttribute('data-canvas-id'))!,
    sessionId: (await screen.getAttribute('data-session-id'))!,
  };
}

/**
 * P5.1: the window opens on the warming-up Home (`orb-boot://app/`) and switches to the live UI on the sidecar
 * origin when the sidecar is ready. Specs that drive the live UI start from here, so nothing they do lands on the
 * boot page (and its local asset loads are over before their request listeners attach).
 */
export async function liveWindow(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow();
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 30_000, waitUntil: 'domcontentloaded' });
  return page;
}
