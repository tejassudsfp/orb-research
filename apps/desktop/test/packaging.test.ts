/**
 * P5.4 packaging invariants: the electron-builder config, the entitlements and the packaged paths main uses must
 * agree with each other (the packaged app itself is exercised by apps/desktop/e2e-packaged, `pnpm e2e:packaged`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { defaultOrbHome, dshBinPath, packagedPaths } from '../src/main/dshHome.js';

const root = resolve(import.meta.dirname, '..', '..', '..');
const desktop = resolve(import.meta.dirname, '..');
const config = yaml.load(readFileSync(join(desktop, 'electron-builder.yml'), 'utf8')) as Record<string, any>;
const entitlements = readFileSync(join(desktop, 'build', 'entitlements.mac.plist'), 'utf8');
const pkg = (dir: string) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

describe('packaged paths', () => {
  it('put DSH_HOME in userData, the orb folder in ~/orb, and the sidecar, profile and UI in Resources', () => {
    const p = packagedPaths(
      '/Applications/orb.app/Contents/Resources',
      '/Users/u/Library/Application Support/orb',
      '/Users/u',
    );
    expect(p).toEqual({
      root: '/Applications/orb.app/Contents/Resources',
      dshHome: '/Users/u/Library/Application Support/orb/dsh',
      orbHome: '/Users/u/orb',
      uiDist: '/Applications/orb.app/Contents/Resources/ui',
    });
    expect(relative(p.root, dshBinPath(p.root))).toBe(
      join('node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    );
  });

  it('keep a pre-P6.1b ~/Orb only where there is no ~/orb (case-sensitive volumes)', () => {
    expect(defaultOrbHome('/Users/u', () => false)).toBe('/Users/u/orb');
    expect(defaultOrbHome('/Users/u', (p) => p === '/Users/u/Orb')).toBe('/Users/u/Orb');
    expect(defaultOrbHome('/Users/u', () => true)).toBe('/Users/u/orb');
  });

  it('match what electron-builder copies into Resources', () => {
    const to = (config.extraResources as Array<{ from: string; to: string }>).map((r) => [r.from, r.to]);
    expect(to).toEqual([
      ['release/stage/licenses', 'licenses'],
      ['release/stage/node_modules', 'node_modules'],
      ['release/stage/profiles/orb', 'profiles/orb'],
      ['release/stage/ui', 'ui'],
    ]);
  });
});

describe('electron-builder config', () => {
  it('builds an arm64 dmg of ai.orb.app on the pinned Electron, nothing published', () => {
    expect(config.appId).toBe('ai.orb.app');
    // P6.1b: CFBundleName / CFBundleDisplayName, the .app, the menus and About are lowercase "orb".
    expect(config.productName).toBe('orb');
    expect(config.electronVersion).toBe(pkg(desktop).devDependencies.electron);
    expect(config.electronDist).toBe('node_modules/electron/dist');
    expect(config.mac.target).toEqual([{ target: 'dmg', arch: ['arm64'] }]);
    expect(config.asar).toBe(true);
    expect(config.publish).toBeNull();
    expect(config.directories).toMatchObject({ app: 'release/stage/app', output: 'release/dist' });
  });

  it('keeps node_modules out of app.asar (beforeBuild hands them to the stage)', async () => {
    expect(config.npmRebuild).toBe(true);
    expect(config.files).toEqual(['package.json', 'out/**']);
    const hook = (await import(join(root, config.beforeBuild))) as { default: () => Promise<boolean> };
    await expect(hook.default()).resolves.toBe(false);
  });

  it('signs with the Developer ID and the hardened runtime, and notarises (release builds, v0.1.0)', () => {
    expect(config.mac.identity).toBe('Fanpit Technologies Private Limited (Q78J7L8TLR)');
    expect(config.mac.hardenedRuntime).toBe(true);
    expect(config.mac.notarize).toBe(true);
    expect(config.mac.entitlements).toBe('apps/desktop/build/entitlements.mac.plist');
    expect(config.mac.entitlementsInherit).toBe('apps/desktop/build/entitlements.mac.plist');
  });

  it('names the dmg and its volume "orb" and uses the Constellation icon and dmg art (P6.1b)', () => {
    expect(config.dmg.artifactName).toBe('orb-${version}-${arch}.${ext}');
    expect(config.dmg.title).toBe('orb ${version}');
    expect(config.copyright).toBe('Copyright © 2026 Tejas Parthasarathi Sudarshan (https://tejassuds.com)');
    for (const file of [config.mac.icon, config.dmg.icon, config.dmg.background]) {
      expect(existsSync(join(root, file)), file).toBe(true);
    }
    expect(config.dmg.contents).toEqual([
      { x: 130, y: 210, type: 'file' },
      { x: 410, y: 210, type: 'link', path: '/Applications' },
    ]);
  });

  it('pins electron-builder exactly', () => {
    expect(pkg(root).devDependencies['electron-builder']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('entitlements', () => {
  const keys = [
    ...entitlements.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<key>([^<]+)<\/key>\s*<true\/>/g),
  ].map((m) => m[1]);
  it('grant only what Electron needs: the JIT; library validation stays on for the Developer ID build', () => {
    expect(keys).toEqual(['com.apple.security.cs.allow-jit']);
  });

  it('the ad-hoc build (pnpm dist:adhoc) adds only disable-library-validation, since ad-hoc has no Team ID', () => {
    const adhoc = readFileSync(join(root, 'apps/desktop/build/entitlements.adhoc.plist'), 'utf8');
    const adhocKeys = [...adhoc.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<key>([^<]+)<\/key>\s*<true\/>/g)].map(
      (m) => m[1],
    );
    expect(adhocKeys).toEqual([
      'com.apple.security.cs.allow-jit',
      'com.apple.security.cs.disable-library-validation',
    ]);
    const scripts = pkg(root).scripts as Record<string, string>;
    expect(scripts['dist:adhoc']).toContain('-c.mac.identity=-');
    expect(scripts['dist:adhoc']).toContain('-c.mac.notarize=false');
    expect(scripts['dist:adhoc']).toContain('entitlements.adhoc.plist');
  });
});
