/** P6.9: the e2e off-screen window options (test-only; never for a packaged app). */
import { describe, expect, it } from 'vitest';
import { OFFSCREEN_ORIGIN, offscreenRequested, testWindowOptions } from '../src/main/testWindow.ts';

describe('test window', () => {
  it('is off-screen only for an unpackaged app with ORB_TEST_OFFSCREEN=1', () => {
    expect(offscreenRequested({ packaged: false, env: { ORB_TEST_OFFSCREEN: '1' } })).toBe(true);
    expect(offscreenRequested({ packaged: false, env: {} })).toBe(false);
    expect(offscreenRequested({ packaged: false, env: { ORB_TEST_OFFSCREEN: '0' } })).toBe(false);
    // A packaged app ignores the variable.
    expect(offscreenRequested({ packaged: true, env: { ORB_TEST_OFFSCREEN: '1' } })).toBe(false);
    expect(testWindowOptions({ packaged: true, env: { ORB_TEST_OFFSCREEN: '1' } })).toEqual({});
  });

  it('places the window far outside every display and allows that on macOS', () => {
    const o = testWindowOptions({ packaged: false, env: { ORB_TEST_OFFSCREEN: '1' } });
    expect(o).toMatchObject({ ...OFFSCREEN_ORIGIN, enableLargerThanScreen: true, focusable: false });
    expect(o.x).toBeLessThan(-10000);
  });
});
