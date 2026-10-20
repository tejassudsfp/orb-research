/**
 * Screenshot-diff helpers for the P2.1 shell test: render design/screens/canvas.html offline (fonts from the same
 * @fontsource files the UI bundles, no network) and compare two captures with pixelmatch.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { markSvg } from '../../../ui/src/brand/marks.ts';

export const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..');
export const VIEWPORT = { width: 1440, height: 900 } as const;

export type Rect = { x: number; y: number; width: number; height: number };

/** The @font-face rules the UI imports (apps/ui/src/theme/fonts.ts), with absolute file:// URLs. */
function localFontCss(): string {
  const require = createRequire(join(repoRoot, 'apps', 'ui', 'package.json'));
  const sheets = [
    '@fontsource/geist/400.css',
    '@fontsource/geist/500.css',
    '@fontsource/geist/600.css',
    '@fontsource/geist/700.css',
    '@fontsource/geist-mono/400.css',
    '@fontsource/geist-mono/500.css',
  ];
  return sheets
    .map((sheet) => {
      const path = require.resolve(sheet);
      const base = pathToFileURL(dirname(path) + '/').href;
      return readFileSync(path, 'utf8').replace(/url\(\.\/files\//g, `url(${base}files/`);
    })
    .join('\n');
}

/**
 * design/screens/canvas.html made renderable offline: its Google Fonts block (and the unpacker's asset ids) is
 * replaced by the bundled Geist files, and the unpacker script tag is dropped. Everything else is untouched.
 */
export function prototypeHtml(): string {
  const html = readFileSync(join(repoRoot, 'design', 'screens', 'canvas.html'), 'utf8');
  const start = html.indexOf('<style>/* cyrillic-ext */');
  const end = html.indexOf('</style>', start);
  if (start < 0 || end < 0) throw new Error('canvas.html: font block not found');
  return (
    html.slice(0, start) +
    `<style>${localFontCss()}</style>` +
    html.slice(end + '</style>'.length)
  ).replace(/<script src="[^"]*"><\/script>/g, '');
}

/**
 * Runs inside the prototype window. Puts the prototype in the state the P2.1 shell renders without harness data:
 * the template's initial values filled in (`{{ zoomPct }}` → 100%, the dot grid at 24 px, chat open, and the
 * template's escaped `sc-camel-view-box` attributes turned back into SVG `viewBox`, as the live prototype does), the board
 * content (frames, cards, cursors, thread popover) and the minimap frames removed (an empty board), and the
 * out-of-scope "Share board" action replaced with the labelled appearance action (P6.26). Returns the rects to mask: the conversation's
 * history area and its "N agents on the board" line, which carry conversation data.
 *
 * P6.1b (intentional baseline change): the prototype still draws the pre-Constellation mark (core + tilted orbit) in
 * the title pill. The user replaced the identity after the prototype was made (design/identity/constellation), and
 * design/ is not edited, so the prototype's mark is swapped for the new 24 px mark from src/brand/marks.ts (same
 * box, same place) before the capture. The rest of the comparison is unchanged, so the pill's layout is still
 * checked against the prototype.
 *
 * P6.26 (intentional baseline change): the user called out theme discoverability. Use the prototype's secondary
 * action slot for a static Light mode reference, with the existing pill treatment and a sun icon. The comparison
 * still measures this button's text, position and full outline; neither its pixels nor a larger area are masked.
 */
export const PROTOTYPE_MARK = markSvg(24, 'night', ' aria-hidden="true"');
export const PREPARE_PROTOTYPE = `(async () => {
  for (const el of document.querySelectorAll('[sc-camel-view-box]')) el.setAttribute('viewBox', el.getAttribute('sc-camel-view-box'));
  const oldMark = document.querySelector('a[aria-label="Home"] svg');
  if (!oldMark || !oldMark.querySelector('ellipse')) throw new Error('prototype: the old mark was not found');
  oldMark.outerHTML = ${JSON.stringify(PROTOTYPE_MARK)};
  const space = document.querySelector('.space');
  const kids = [...space.children];
  const world = kids.find((el) => el.style.transformOrigin === '0px 0px');
  world.replaceChildren();
  world.style.transform = 'translate(0px, 0px) scale(1)';
  const grid = kids.find((el) => el.style.backgroundImage.includes('radial-gradient') && el.style.inset === '0px');
  grid.style.backgroundSize = '24px 24px';
  grid.style.backgroundPosition = '0px 0px';
  space.style.cursor = 'grab';
  const appearance = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Share board');
  if (!appearance) throw new Error('prototype: the secondary action slot was not found');
  appearance.setAttribute('aria-label', 'Switch to light mode');
  Object.assign(appearance.style, { padding: '0 16px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' });
  appearance.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><span>Light mode</span>';
  for (const s of document.querySelectorAll('sc-if')) if (s.getAttribute('value') === '{{ chatClosed }}') s.remove();
  document.querySelector('button[aria-label="Reset view"]').textContent = '100%';
  const minimap = [...document.querySelectorAll('div[aria-hidden="true"]')].find((el) => el.style.width === '168px');
  minimap.replaceChildren();
  await document.fonts.ready;
  const panel = document.querySelector('[data-panel="chat"]');
  const body = panel.children[1];
  const subtitle = [...panel.querySelectorAll('span')].find((el) => el.textContent.trim() === '3 agents on the board');
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  return { masks: [rect(body), rect(subtitle)], fonts: document.fonts.check('600 15px Geist') && document.fonts.check("500 12px 'Geist Mono'") };
})()`;

export type DiffResult = {
  width: number;
  height: number;
  /** Pixels compared (not masked). */
  compared: number;
  /** Pixels that differ (pixelmatch, threshold 0.1, anti-aliasing ignored). */
  different: number;
  ratio: number;
  diffPng: Buffer;
};

/** Black out `masks` (CSS px; scaled to the capture's pixel ratio) in both images and pixelmatch the rest. */
export function diffImages(
  a: Buffer,
  b: Buffer,
  masks: Rect[],
  cssWidth: number = VIEWPORT.width,
): DiffResult {
  const imgA = PNG.sync.read(a);
  const imgB = PNG.sync.read(b);
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    throw new Error(`capture sizes differ: ${imgA.width}x${imgA.height} vs ${imgB.width}x${imgB.height}`);
  }
  const { width, height } = imgA;
  const scale = width / cssWidth;
  let masked = 0;
  const isMasked = new Uint8Array(width * height);
  for (const m of masks) {
    const x0 = Math.max(0, Math.floor(m.x * scale));
    const y0 = Math.max(0, Math.floor(m.y * scale));
    const x1 = Math.min(width, Math.ceil((m.x + m.width) * scale));
    const y1 = Math.min(height, Math.ceil((m.y + m.height) * scale));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * width + x;
        if (isMasked[i]) continue;
        isMasked[i] = 1;
        masked++;
        for (const img of [imgA, imgB]) {
          img.data[i * 4] = 0;
          img.data[i * 4 + 1] = 0;
          img.data[i * 4 + 2] = 0;
          img.data[i * 4 + 3] = 255;
        }
      }
    }
  }
  const diff = new PNG({ width, height });
  const different = pixelmatch(imgA.data, imgB.data, diff.data, width, height, { threshold: 0.1 });
  const compared = width * height - masked;
  return { width, height, compared, different, ratio: different / compared, diffPng: PNG.sync.write(diff) };
}
