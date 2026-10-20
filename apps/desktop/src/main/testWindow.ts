/**
 * P6.9: e2e windows off-screen. The e2e specs drive the app with synthetic input, but a window shown on screen also
 * receives REAL input (a trackpad scroll or a click while a run is going), which once moved the board in a pan check
 * (HARNESS_NOTES §P4.gate). With `ORB_TEST_OFFSCREEN=1` (set by the Playwright config unless `ORB_E2E_VISIBLE=1`) the
 * window is placed as far off every display as macOS allows, shown WITHOUT taking focus, not focusable, and ignoring
 * real mouse and trackpad events (`setIgnoreMouseEvents`, applied in index.ts): real input cannot reach it, only
 * Playwright's synthetic CDP input does. macOS pulls a shown window back onto a display (it ends partly visible),
 * which is why the inert flags matter more than the position. Chromium is told not to throttle an occluded window
 * (which would pause requestAnimationFrame and break flights and the performance specs).
 *
 * Test-only: ignored by a packaged app, and never on without the variable.
 */
import type { BrowserWindowConstructorOptions } from 'electron';

/** Where the test window sits: well outside any plausible display arrangement. */
export const OFFSCREEN_ORIGIN = { x: -30000, y: -30000 } as const;

export type TestWindowEnv = { packaged: boolean; env: Record<string, string | undefined> };

/** True when this launch should keep its window off-screen. */
export const offscreenRequested = ({ packaged, env }: TestWindowEnv): boolean =>
  !packaged && env.ORB_TEST_OFFSCREEN === '1';

/** The extra BrowserWindow options of an off-screen test window (empty otherwise). */
export function testWindowOptions(opts: TestWindowEnv): BrowserWindowConstructorOptions {
  if (!offscreenRequested(opts)) return {};
  return {
    ...OFFSCREEN_ORIGIN,
    // macOS keeps a titled window's title bar on a display unless this is set (Electron's constrainFrameRect).
    enableLargerThanScreen: true,
    focusable: false,
  };
}

/** Chromium switches for an off-screen test run (occluded windows keep rendering at full rate). */
export const OFFSCREEN_SWITCHES = [
  'disable-backgrounding-occluded-windows',
  'disable-renderer-backgrounding',
  'disable-background-timer-throttling',
] as const;
