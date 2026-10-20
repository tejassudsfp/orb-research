/** P2.1 hash router: parse and format round-trip for every screen; unknown paths are not-found. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref, type Route } from '../src/app/router.ts';
import { HARNESS_VERSION } from '../src/app/versions.ts';

describe('router', () => {
  it('parses every screen', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#/canvas/2026-10-14-kites')).toEqual({ name: 'canvas', id: '2026-10-14-kites' });
    expect(parseRoute('#canvas/2026-10-14-kites/')).toEqual({ name: 'canvas', id: '2026-10-14-kites' });
    expect(parseRoute('#/port/2026-10-14-kites')).toEqual({ name: 'port', id: '2026-10-14-kites' });
    // P2.7: a Home search hit opens the canvas focused on the card or frame.
    expect(parseRoute('#/canvas/kites?focus=c_01ABC')).toEqual({
      name: 'canvas',
      id: 'kites',
      focus: 'c_01ABC',
    });
    expect(parseRoute('#/canvas/kites?other=1')).toEqual({ name: 'canvas', id: 'kites' });
    // P6.17: the slide view.
    expect(parseRoute('#/deck/2026-10-14-kites')).toEqual({ name: 'deck', id: '2026-10-14-kites' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/first-run')).toEqual({ name: 'first-run' });
    expect(parseRoute('#/dev')).toEqual({ name: 'dev' });
  });

  it('reports unknown or malformed paths as not-found', () => {
    expect(parseRoute('#/canvas')).toEqual({ name: 'not-found', path: '/canvas' });
    expect(parseRoute('#/canvas/a/b')).toEqual({ name: 'not-found', path: '/canvas/a/b' });
    expect(parseRoute('#/settings/x')).toEqual({ name: 'not-found', path: '/settings/x' });
    expect(parseRoute('#/canvas/%E0%A4%A')).toMatchObject({ name: 'not-found' });
    expect(parseRoute('#/nope')).toEqual({ name: 'not-found', path: '/nope' });
  });

  it('formats hrefs that parse back to the same route', () => {
    const routes: Route[] = [
      { name: 'home' },
      { name: 'canvas', id: '2026-10-14-kites' },
      { name: 'deck', id: '2026-10-14-kites' },
      { name: 'canvas', id: 'odd id/with#chars' },
      { name: 'canvas', id: 'kites?x', focus: 'f_01 &?#' },
      { name: 'port', id: '2026-10-14-kites' },
      { name: 'settings' },
      { name: 'first-run' },
      { name: 'dev' },
    ];
    for (const route of routes) expect(parseRoute(routeHref(route))).toEqual(route);
    expect(routeHref({ name: 'canvas', id: 'a b' })).toBe('#/canvas/a%20b');
  });

  it('shows the pinned harness version in About', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'package.json'), 'utf8'));
    expect(pkg.dependencies['@deepseek-ai/dsh']).toBe(HARNESS_VERSION);
  });
});
