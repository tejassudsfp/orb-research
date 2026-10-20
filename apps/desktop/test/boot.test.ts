import { DEFAULT_APPEARANCE } from '@orb/shared';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  bootCsp,
  bootMime,
  bootUrl,
  isBootUrl,
  parseDraft,
  readBootView,
  resolveBootFile,
} from '../src/main/boot.js';

const dist = '/opt/Orb/ui';

describe('P5.1 boot page', () => {
  it('serves only files inside the UI dist', () => {
    expect(resolveBootFile(dist, 'orb-boot://app/index.html')).toBe(join(dist, 'index.html'));
    expect(resolveBootFile(dist, 'orb-boot://app/')).toBe(join(dist, 'index.html'));
    expect(resolveBootFile(dist, 'orb-boot://app/assets/index-x.js?v=1')).toBe(
      join(dist, 'assets', 'index-x.js'),
    );
    // The URL parser already folds plain dot segments, which keeps them inside the dist.
    expect(resolveBootFile(dist, 'orb-boot://app/../secret')).toBe(join(dist, 'secret'));
    expect(resolveBootFile(dist, 'orb-boot://app/assets/%2e%2e/%2e%2e/etc/hosts')).toBe(
      join(dist, 'etc', 'hosts'),
    );
    for (const bad of [
      'orb-boot://app/assets/..%2f..%2fetc%2fhosts',
      'orb-boot://app/.env',
      'orb-boot://app/assets/index-x.js.map',
      'orb-boot://app/a%5cb',
      'orb-boot://app/a%00b',
      'orb-boot://other/index.html',
      'http://127.0.0.1:1/index.html',
      'not a url',
    ]) {
      expect(resolveBootFile(dist, bad), bad).toBeUndefined();
    }
  });

  it('has a URL on its own scheme and a CSP with no connections', () => {
    const url = bootUrl({ theme: 'day', view: 'home', motion: 'reduce' });
    expect(isBootUrl(url)).toBe(true);
    expect(new URL(url).searchParams.get('theme')).toBe('day');
    expect(new URL(url).searchParams.get('view')).toBe('home');
    expect(new URL(url).searchParams.get('motion')).toBe('reduce');
    expect(isBootUrl('http://127.0.0.1:1/')).toBe(false);
    const csp = bootCsp();
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-eval');
    expect(bootMime('/a/b.js')).toMatch(/javascript/);
    expect(bootMime('/a/b.woff2')).toBe('font/woff2');
  });

  const home = mkdtempSync(join(tmpdir(), 'orb-boot-test-'));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  it('reads the theme and first-run state from orb.json: splash until the first-run sheet was done', () => {
    const env = {};
    expect(readBootView(home, env, true)).toEqual({
      appearance: DEFAULT_APPEARANCE,
      theme: 'night',
      view: 'splash',
      motion: 'system',
    });
    writeFileSync(join(home, 'orb.json'), JSON.stringify({ theme: 'day' }));
    expect(readBootView(home, env, true)).toEqual({
      appearance: { ...DEFAULT_APPEARANCE, mode: 'light' },
      theme: 'day',
      view: 'splash',
      motion: 'system',
    });
    writeFileSync(join(home, 'orb.json'), JSON.stringify({ theme: 'day', firstRunDone: true }));
    expect(readBootView(home, env, true)).toEqual({
      appearance: { ...DEFAULT_APPEARANCE, mode: 'light' },
      theme: 'day',
      view: 'home',
      motion: 'system',
    });
    writeFileSync(join(home, 'orb.json'), '{not json');
    expect(readBootView(home, env, true)).toEqual({
      appearance: DEFAULT_APPEARANCE,
      theme: 'night',
      view: 'splash',
      motion: 'system',
    });
    expect(readBootView(home, { ORB_SKIP_FIRST_RUN: '1' }, true)).toEqual({
      appearance: DEFAULT_APPEARANCE,
      theme: 'night',
      view: 'home',
      motion: 'system',
    });
    writeFileSync(join(home, 'orb.json'), JSON.stringify({ firstRunDone: true, motion: 'reduce' }));
    expect(readBootView(home, env, true)).toEqual({
      appearance: DEFAULT_APPEARANCE,
      theme: 'night',
      view: 'home',
      motion: 'reduce',
    });
    writeFileSync(join(home, 'orb.json'), 'null');
    expect(readBootView(home, env, true)).toEqual({
      appearance: DEFAULT_APPEARANCE,
      theme: 'night',
      view: 'splash',
      motion: 'system',
    });
  });

  it('carries the selected style/accent into boot and resolves System against the native appearance', () => {
    const appearance = { themeId: 'paper', accent: '#7048E8', mode: 'system' };
    writeFileSync(join(home, 'orb.json'), JSON.stringify({ appearance, firstRunDone: true }));
    const light = readBootView(home, {}, false);
    expect(light).toMatchObject({ appearance, theme: 'day', view: 'home' });
    expect(readBootView(home, {}, true)).toMatchObject({ appearance, theme: 'night' });
    const url = new URL(bootUrl(light));
    expect(url.searchParams.get('style')).toBe('paper');
    expect(url.searchParams.get('accent')).toBe('#7048E8');
    expect(url.searchParams.get('brightness')).toBe('system');
  });

  it('accepts only a bounded draft', () => {
    expect(parseDraft({ prompt: 'Kites' })).toEqual({ prompt: 'Kites' });
    expect(parseDraft({ prompt: '', template: 'topic' })).toEqual({ prompt: '', template: 'topic' });
    expect(parseDraft({ prompt: 'x'.repeat(4001) })).toBeUndefined();
    expect(parseDraft({ prompt: 'a', template: '<script>' })).toBeUndefined();
    expect(parseDraft({ prompt: 3 })).toBeUndefined();
    expect(parseDraft(null)).toBeUndefined();
  });
});
