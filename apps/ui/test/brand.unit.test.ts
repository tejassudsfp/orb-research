import { appearanceVariables, themeIds } from '@orb/shared';
/**
 * P6.1b the Constellation identity: the canonical SVGs match marks.ts (rerun `pnpm brand` after changing it), the
 * geometry and colours are the mockup's (design/identity/constellation/Constellation.dc.html), the generated app icon
 * has every macOS size, and no user-visible "Orb" is left in the product's source (the name is always lowercase).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BRIGHT_POINT,
  CHORD,
  HEX,
  NODES,
  PALETTES,
  RHO,
  SIGNAL_POINT,
  appIconSvg,
  canonicalSvgs,
  faviconSvg,
  markSvg,
} from '../src/brand/marks.ts';

const root = resolve(import.meta.dirname, '..', '..', '..');
const brandDir = join(root, 'apps', 'ui', 'src', 'brand');
const mockup = readFileSync(
  join(root, 'design', 'identity', 'constellation', 'Constellation.dc.html'),
  'utf8',
);

describe('the Constellation mark', () => {
  it('is the mockup primary hex mark: same paths, points and full colour on Night', () => {
    expect(mockup).toContain(`<path d="${HEX}"></path><path d="${CHORD}"></path>`);
    const primary =
      '<g fill="none" stroke="#60A5FA" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round" ' +
      'stroke-linejoin="round">';
    expect(mockup).toContain(primary);
    expect(markSvg(120)).toContain(primary);
    for (const [x, y] of [...NODES, SIGNAL_POINT, BRIGHT_POINT]) {
      // Six points on one circle (r 40 around 60,60).
      expect(Math.hypot(x - 60, y - 60)).toBeCloseTo(40, 0);
      expect(mockup).toContain(`cx="${x}" cy="${y}"`);
    }
    expect(mockup).toContain(`<circle cx="94.6" cy="40" r="11" fill="#F9FCFE"></circle>`);
    expect(markSvg(120)).toContain(`<circle cx="94.6" cy="40" r="11" fill="#F9FCFE"/>`);
    expect(markSvg(120, 'paper')).toContain(`<circle cx="94.6" cy="40" r="11" fill="#2563EB"/>`);
  });

  it('drops to the ring + bright point below 24 px', () => {
    expect(markSvg(24)).toContain(CHORD);
    expect(markSvg(23)).not.toContain(CHORD);
    expect(markSvg(16)).toContain('stroke-width="13"');
    expect(markSvg(16)).toContain('r="20"');
    expect(mockup).toContain(
      `<path d="${HEX}" fill="none" stroke="#60A5FA" stroke-width="13" stroke-linejoin="round"></path>` +
        `<circle cx="94.6" cy="40" r="20" fill="#F9FCFE"></circle>`,
    );
    expect(faviconSvg()).not.toContain(CHORD);
    expect(appIconSvg(16)).not.toContain(CHORD);
    expect(appIconSvg(1024)).toContain(CHORD);
  });

  it('uses Winsen Rho colours only', () => {
    const rho = new Set(
      Object.values(RHO)
        .map((c) => c.toUpperCase())
        .concat('#000000'),
    );
    for (const [name, svg] of Object.entries(canonicalSvgs())) {
      for (const colour of svg.match(/#[0-9A-Fa-f]{6}\b/g) ?? []) {
        expect(rho.has(colour.toUpperCase()), `${name}: ${colour}`).toBe(true);
      }
    }
    for (const p of Object.values(PALETTES))
      for (const c of [p.line, p.node, p.signal, p.bright]) expect(rho.has(c)).toBe(true);
  });

  it('canonical SVGs in src/brand match marks.ts (run `pnpm brand` after a change)', () => {
    for (const [name, svg] of Object.entries(canonicalSvgs())) {
      expect(readFileSync(join(brandDir, name), 'utf8'), name).toBe(`${svg}\n`);
    }
  });

  it('the interactive mark follows the selected style/accent in both modes', () => {
    for (const themeId of themeIds)
      for (const mode of ['light', 'dark'] as const) {
        const variables = appearanceVariables({ themeId, mode, accent: 'rose' }, mode);
        expect(variables['--orb-mark-line']).toBe(variables['--orb-accent']);
        expect(variables['--orb-mark-signal']).toBe(variables['--orb-accent-fill']);
        expect(variables['--orb-mark-small-bright']).toBe(variables['--orb-accent']);
      }
  });
});

/** The entry types of an .icns (each entry: 4-byte type, 4-byte big-endian length including the header, payload). */
function icnsTypes(file: string): string[] {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 4).toString('latin1')).toBe('icns');
  const types: string[] = [];
  for (let at = 8; at + 8 <= buf.length; at += buf.readUInt32BE(at + 4)) {
    types.push(buf.subarray(at, at + 4).toString('latin1'));
  }
  return types;
}

describe('generated platform assets', () => {
  const build = join(root, 'apps', 'desktop', 'build');

  it('the app icon has every macOS size (16–1024 px)', () => {
    // 16 and 32 px (ic04, ic05: ARGB), 16@2x ic11, 32@2x ic12, 128 ic07, 128@2x ic13, 256 ic08, 256@2x ic14,
    // 512 ic09, 512@2x ic10 (iconutil's types for an iconset with every size).
    const types = new Set(icnsTypes(join(build, 'icon.icns')));
    for (const t of ['ic04', 'ic05', 'ic11', 'ic12', 'ic07', 'ic13', 'ic08', 'ic14', 'ic09', 'ic10']) {
      expect(types.has(t), t).toBe(true);
    }
  });

  it('the dmg background and the dev Dock icon exist', () => {
    expect(statSync(join(build, 'background.tiff')).size).toBeGreaterThan(1000);
    expect(readFileSync(join(build, 'icon.png')).subarray(1, 4).toString('latin1')).toBe('PNG');
  });

  it('the page title is "orb" and the tab icon is the simplified mark', () => {
    const html = readFileSync(join(root, 'apps', 'ui', 'index.html'), 'utf8');
    expect(html).toContain('<title>orb</title>');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="./src/brand/favicon.svg" />');
  });
});

/** Source files the user's strings live in. */
function sources(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'dist' || name === 'lib' || name === 'out') continue;
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|tsx|html)$/.test(name)) out.push(path);
  }
  return out;
}

describe('the name is always lowercase', () => {
  it('no "Orb" outside comments in the app, the UI and the packages', () => {
    const dirs = [
      join(root, 'apps', 'ui', 'src'),
      join(root, 'apps', 'desktop', 'src'),
      ...readdirSync(join(root, 'packages')).map((p) => join(root, 'packages', p, 'src')),
    ];
    // Internal ids that are not shown: the fetcher's User-Agent, the dev data folder and the legacy ~/Orb fallback.
    const allowed = [/ORB_USER_AGENT = 'Orb\//, /'\.orb-dev', 'Orb'/, /const legacy = join\(/];
    const found: string[] = [];
    for (const file of [...dirs.flatMap((d) => sources(d)), join(root, 'apps', 'ui', 'index.html')]) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*|<!--)/.test(line)) return;
          const code = line.split(' // ')[0]!;
          if (!/\bOrb\b/.test(code) || allowed.some((re) => re.test(code))) return;
          found.push(`${relative(root, file)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(found).toEqual([]);
  });
});
