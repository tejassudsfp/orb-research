/**
 * P6.1b `pnpm brand`: (re)generate every brand file from apps/ui/src/brand/marks.ts.
 *
 * - apps/ui/src/brand/*.svg: the canonical SVGs (mark in each palette, simplified mark, menu bar template, lockups,
 *   app icon, favicon). apps/ui/test/brand.unit.test.ts fails when they drift from marks.ts.
 * - apps/desktop/build/icon.icns: the macOS app icon (Night body, soft Signal glow), every size macOS asks for
 *   (16–512 pt at 1x and 2x; the simplified mark at 16 and 32 px), packed with macOS `iconutil`. electron-builder
 *   picks it up from buildResources; the dmg uses it as its volume icon too.
 * - apps/desktop/build/icon.png (512 px): the Dock icon of the unpackaged dev app.
 * - apps/desktop/build/background.tiff: the dmg window background (540×380, 1x + 2x, `tiffutil -cathidpicheck`).
 *
 * Rasterising is done by the pinned Electron (scripts/brand/render.mjs; no new dependency). The outputs are committed,
 * so `pnpm dist` does not need this step; rerun it only when marks.ts changes.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  PALETTES,
  RHO,
  VIEWBOX,
  WORDMARK,
  appIconSvg,
  canonicalSvgs,
  markBody,
} from '../../apps/ui/src/brand/marks.ts';

const REPO = resolve(import.meta.dirname, '..', '..');
const BRAND_DIR = join(REPO, 'apps', 'ui', 'src', 'brand');
const BUILD_DIR = join(REPO, 'apps', 'desktop', 'build');

/** The iconset macOS `iconutil` expects: name → pixel size. */
export const ICONSET: Record<string, number> = {
  'icon_16x16.png': 16,
  'icon_16x16@2x.png': 32,
  'icon_32x32.png': 32,
  'icon_32x32@2x.png': 64,
  'icon_128x128.png': 128,
  'icon_128x128@2x.png': 256,
  'icon_256x256.png': 256,
  'icon_256x256@2x.png': 512,
  'icon_512x512.png': 512,
  'icon_512x512@2x.png': 1024,
};

/** dmg window: electron-builder's default 540×380 window, app icon at (130, 220), Applications at (410, 220). */
export const DMG = {
  width: 540,
  height: 380,
  iconSize: 96,
  app: { x: 130, y: 210 },
  apps: { x: 410, y: 210 },
};

function geistBoldDataUrl(): string {
  const require = createRequire(join(REPO, 'apps', 'ui', 'package.json'));
  const css = require.resolve('@fontsource/geist/700.css');
  const file = join(dirname(css), 'files', 'geist-latin-700-normal.woff2');
  return `data:font/woff2;base64,${readFileSync(file).toString('base64')}`;
}

/**
 * The dmg background on Paper (Finder draws the icon labels in dark text, so a Night background would hide them):
 * a soft Sky glow, the Paper-palette horizontal lockup at the top and a quiet arrow from the app to Applications.
 */
export function dmgBackgroundSvg(font: string): string {
  const { width: w, height: h } = DMG;
  const mark = 34;
  const word = (mark * 22) / 30;
  const gap = (mark * 10) / 30;
  const lockupW = mark + gap + word * 1.42;
  const x0 = (w - lockupW) / 2;
  const y0 = 44;
  const ay = DMG.app.y;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><style>@font-face{font-family:GeistBrand;font-weight:700;src:url(${font}) format('woff2');}</style>` +
    `</defs>` +
    `<rect width="${w}" height="${h}" fill="${RHO.paper}"/>` +
    `<svg x="${x0.toFixed(2)}" y="${y0}" width="${mark}" height="${mark}" viewBox="${VIEWBOX}">${markBody(PALETTES.paper)}</svg>` +
    `<text x="${(x0 + mark + gap).toFixed(2)}" y="${(y0 + mark / 2 + word * 0.36).toFixed(2)}" fill="${RHO.ink}" ` +
    `font-family="GeistBrand" font-weight="700" font-size="${word.toFixed(2)}" letter-spacing="${(-0.046 * word).toFixed(2)}">${WORDMARK}</text>` +
    `<g fill="none" stroke="${RHO.ink}" stroke-opacity="0.28" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M${DMG.app.x + 78} ${ay} L${DMG.apps.x - 78} ${ay}"/>` +
    `<path d="M${DMG.apps.x - 88} ${ay - 9} L${DMG.apps.x - 78} ${ay} L${DMG.apps.x - 88} ${ay + 9}"/></g>` +
    `</svg>`
  );
}

function render(
  jobs: Array<{ svg: string; width: number; height: number; out: string }>,
  work: string,
): void {
  const jobsFile = join(work, 'jobs.json');
  writeFileSync(jobsFile, JSON.stringify(jobs));
  const require = createRequire(join(REPO, 'apps', 'desktop', 'package.json'));
  const electron = require('electron') as unknown as string;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  execFileSync(electron, [join(import.meta.dirname, 'render.mjs'), jobsFile], { stdio: 'inherit', env });
}

function main(): void {
  for (const [name, svg] of Object.entries(canonicalSvgs())) writeFileSync(join(BRAND_DIR, name), `${svg}\n`);

  const work = mkdtempSync(join(tmpdir(), 'orb-brand-'));
  try {
    const iconset = join(work, 'orb.iconset');
    mkdirSync(iconset);
    const jobs = Object.entries(ICONSET).map(([name, px]) => ({
      svg: appIconSvg(px),
      width: px,
      height: px,
      out: join(iconset, name),
    }));
    const font = geistBoldDataUrl();
    const bg1 = join(work, 'background.png');
    const bg2 = join(work, 'background@2x.png');
    jobs.push(
      { svg: appIconSvg(512), width: 512, height: 512, out: join(BUILD_DIR, 'icon.png') },
      { svg: dmgBackgroundSvg(font), width: DMG.width, height: DMG.height, out: bg1 },
      { svg: dmgBackgroundSvg(font), width: DMG.width * 2, height: DMG.height * 2, out: bg2 },
    );
    render(jobs, work);
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(BUILD_DIR, 'icon.icns')]);
    execFileSync('tiffutil', ['-cathidpicheck', bg1, bg2, '-out', join(BUILD_DIR, 'background.tiff')]);
    console.log('brand: SVGs, icon.icns, icon.png and background.tiff written');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
