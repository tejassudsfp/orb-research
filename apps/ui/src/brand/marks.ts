/**
 * P6.1b the Constellation identity (design/identity/constellation/Constellation.dc.html): the one source of the mark's
 * geometry and colours. The React mark (OrbMark.tsx), the canonical SVG files next to this module, the app icon, the
 * dmg art (scripts/brand/build.ts) and the shell pixel-diff normalisation (apps/desktop/e2e/support/screenshot.ts)
 * are all built from here, so they cannot drift.
 *
 * The mark: six cards on one circle (r 40 around 60,60 in a 120 box) linked into a hexagon, one chord across, one
 * Signal point where the chord starts and one bright point (the insight). Full mark down to 24 px; below that the
 * simplified ring + bright point. Clear space = the bright point's diameter on every side. Winsen Rho colours only.
 */

/** The wordmark: always lowercase. */
export const WORDMARK = 'orb';
/** Below this size (px) the mark drops to the simplified ring + bright point. */
export const MARK_MIN_FULL = 24;

export const VIEWBOX = '0 0 120 120';
export const HEX = 'M60 20 L94.6 40 L94.6 80 L60 100 L25.4 80 L25.4 40 Z';
export const CHORD = 'M25.4 40 L94.6 80';
/** The four plain points, in the order the mockup draws them. */
export const NODES: ReadonlyArray<readonly [number, number]> = [
  [60, 20],
  [94.6, 80],
  [60, 100],
  [25.4, 80],
];
export const SIGNAL_POINT = [25.4, 40] as const;
export const BRIGHT_POINT = [94.6, 40] as const;
export const NODE_R = 6.5;
export const BRIGHT_R = 11;
export const LINE_WIDTH = 3;
/** Simplified mark (< 24 px): the hexagon ring and the bright point only, heavier. */
export const SMALL_LINE_WIDTH = 13;
export const SMALL_BRIGHT_R = 20;
/** Clear space around the mark, in viewBox units: the bright point's diameter. */
export const CLEAR_SPACE = BRIGHT_R * 2;

/** Winsen Rho. */
export const RHO = {
  night: '#03050C',
  ink: '#11171D',
  paper: '#F9FCFE',
  rho: '#3D5DCF',
  signal: '#2563EB',
  sky: '#60A5FA',
} as const;

export type MarkPalette = {
  /** Links (hexagon + chord). */
  line: string;
  lineOpacity: number;
  node: string;
  signal: string;
  bright: string;
};

/** Full colour on Night (primary), full colour on Paper, and the single-colour versions. */
export const PALETTES = {
  night: { line: RHO.sky, lineOpacity: 0.55, node: RHO.sky, signal: RHO.signal, bright: RHO.paper },
  paper: { line: RHO.rho, lineOpacity: 0.5, node: RHO.rho, signal: RHO.sky, bright: RHO.signal },
  /** Paper on Ink / on Signal blue. */
  paperMono: { line: RHO.paper, lineOpacity: 0.5, node: RHO.paper, signal: RHO.paper, bright: RHO.paper },
  /** Ink on Paper (print, stamps). */
  inkMono: { line: RHO.ink, lineOpacity: 0.5, node: RHO.ink, signal: RHO.ink, bright: RHO.ink },
} as const satisfies Record<string, MarkPalette>;
export type PaletteName = keyof typeof PALETTES;

/** Simplified-mark colours per palette (ring, bright point). */
export const SMALL_PALETTES: Record<PaletteName, { ring: string; bright: string }> = {
  night: { ring: RHO.sky, bright: RHO.paper },
  paper: { ring: RHO.rho, bright: RHO.signal },
  paperMono: { ring: RHO.paper, bright: RHO.paper },
  inkMono: { ring: RHO.ink, bright: RHO.ink },
};

const n = (v: number) => String(v);

/** The full mark's inner SVG (no <svg> wrapper), in the mockup's element order. */
export function markBody(p: MarkPalette): string {
  const points = NODES.map(
    ([x, y]) => `<circle cx="${n(x)}" cy="${n(y)}" r="${NODE_R}" fill="${p.node}"/>`,
  ).join('');
  return (
    `<g fill="none" stroke="${p.line}" stroke-opacity="${p.lineOpacity}" stroke-width="${LINE_WIDTH}" ` +
    `stroke-linecap="round" stroke-linejoin="round"><path d="${HEX}"/><path d="${CHORD}"/></g>` +
    points +
    `<circle cx="${SIGNAL_POINT[0]}" cy="${SIGNAL_POINT[1]}" r="${NODE_R}" fill="${p.signal}"/>` +
    `<circle cx="${BRIGHT_POINT[0]}" cy="${BRIGHT_POINT[1]}" r="${BRIGHT_R}" fill="${p.bright}"/>`
  );
}

/** The simplified mark's inner SVG (ring + bright point). */
export function smallMarkBody(c: { ring: string; bright: string }): string {
  return (
    `<path d="${HEX}" fill="none" stroke="${c.ring}" stroke-width="${SMALL_LINE_WIDTH}" stroke-linejoin="round"/>` +
    `<circle cx="${BRIGHT_POINT[0]}" cy="${BRIGHT_POINT[1]}" r="${SMALL_BRIGHT_R}" fill="${c.bright}"/>`
  );
}

/** A standalone mark SVG at `size` px; below 24 px the simplified form. */
export function markSvg(size: number, palette: PaletteName = 'night', extra = ''): string {
  const body = size < MARK_MIN_FULL ? smallMarkBody(SMALL_PALETTES[palette]) : markBody(PALETTES[palette]);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${VIEWBOX}"${extra}>` +
    body +
    `</svg>`
  );
}

/**
 * Horizontal lockup (headers, the app): mark + "orb" in Geist Bold, as the mockup's 76 px mark / 72 px word
 * (gap 18, letter-spacing -0.05em), scaled to `markSize`.
 */
export function horizontalLockupSvg(markSize = 76, palette: 'night' | 'paper' = 'night'): string {
  const k = markSize / 76;
  const font = 72 * k;
  const gap = 18 * k;
  const wordW = font * 1.42; // Geist Bold "orb" at -0.05em is ~1.42 em wide.
  const w = Math.ceil(markSize + gap + wordW);
  const h = Math.ceil(markSize);
  const text = palette === 'night' ? RHO.paper : RHO.ink;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<svg x="0" y="0" width="${markSize}" height="${markSize}" viewBox="${VIEWBOX}">${markBody(PALETTES[palette])}</svg>` +
    `<text x="${markSize + gap}" y="${(h / 2 + font * 0.36).toFixed(2)}" fill="${text}" ` +
    `font-family="Geist, system-ui, sans-serif" font-weight="700" font-size="${font}" ` +
    `letter-spacing="${(-0.05 * font).toFixed(2)}">${WORDMARK}</text></svg>`
  );
}

/** Stacked lockup (splash, covers): 96 px mark over a 56 px word, gap 14. */
export function stackedLockupSvg(markSize = 96, palette: 'night' | 'paper' = 'night'): string {
  const k = markSize / 96;
  const font = 56 * k;
  const gap = 14 * k;
  const w = Math.ceil(Math.max(markSize, font * 1.42));
  const h = Math.ceil(markSize + gap + font);
  const text = palette === 'night' ? RHO.paper : RHO.ink;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<svg x="${((w - markSize) / 2).toFixed(2)}" y="0" width="${markSize}" height="${markSize}" viewBox="${VIEWBOX}">` +
    `${markBody(PALETTES[palette])}</svg>` +
    `<text x="${w / 2}" y="${(markSize + gap + font * 0.78).toFixed(2)}" text-anchor="middle" fill="${text}" ` +
    `font-family="Geist, system-ui, sans-serif" font-weight="700" font-size="${font}" ` +
    `letter-spacing="${(-0.05 * font).toFixed(2)}">${WORDMARK}</text></svg>`
  );
}

/**
 * The macOS app icon at 1024 px: Night body on Apple's icon grid (824 px squircle-ish rounded rect, radius 185, 100 px
 * margin for the system shadow) with a soft Signal glow (radial, 45% → 0 at 65%, centred 40% down, 90% wide, as the
 * mockup's 180 px tile) and the mark at 118/180 of the body. At `px` ≤ 32 the simplified mark is used (it is under
 * 24 px there).
 */
export function appIconSvg(px = 1024): string {
  const body = 824;
  const o = 100;
  const r = 185;
  const markSize = (body * 118) / 180;
  const m = o + (body - markSize) / 2;
  const small = px <= 32;
  const mark = small
    ? `<svg x="${o + body * 0.16}" y="${o + body * 0.16}" width="${body * 0.68}" height="${body * 0.68}" viewBox="${VIEWBOX}">${smallMarkBody(SMALL_PALETTES.night)}</svg>`
    : `<svg x="${m.toFixed(2)}" y="${m.toFixed(2)}" width="${markSize.toFixed(2)}" height="${markSize.toFixed(2)}" viewBox="${VIEWBOX}">${markBody(PALETTES.night)}</svg>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 1024 1024">` +
    `<defs>` +
    `<clipPath id="body"><rect x="${o}" y="${o}" width="${body}" height="${body}" rx="${r}"/></clipPath>` +
    `<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="14" ` +
    `flood-color="#000000" flood-opacity="0.35"/></filter>` +
    `</defs>` +
    `<rect x="${o}" y="${o}" width="${body}" height="${body}" rx="${r}" fill="${RHO.night}" filter="url(#shadow)"/>` +
    `<rect x="${o + 2}" y="${o + 2}" width="${body - 4}" height="${body - 4}" rx="${r - 2}" fill="none" ` +
    `stroke="${RHO.paper}" stroke-opacity="0.08" stroke-width="4"/>` +
    mark +
    `</svg>`
  );
}

/** Favicon / tab mark (< 24 px): the simplified mark on a Night tile, as the mockup's 16 and 32 px tiles. */
export function faviconSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="7" fill="${RHO.night}"/>` +
    `<svg x="5" y="5" width="22" height="22" viewBox="${VIEWBOX}">${smallMarkBody(SMALL_PALETTES.night)}</svg></svg>`
  );
}

/** Menu bar template image (single colour, black; macOS tints it). Not used by v0 (no menu bar item). */
export function templateSvg(): string {
  return markSvg(18, 'inkMono').replace(new RegExp(RHO.ink, 'g'), '#000000');
}

/** The canonical files in apps/ui/src/brand/ (written by `pnpm brand`; a unit test checks they match). */
export function canonicalSvgs(): Record<string, string> {
  return {
    'orb-mark.svg': markSvg(120, 'night'),
    'orb-mark-paper.svg': markSvg(120, 'paper'),
    'orb-mark-paper-mono.svg': markSvg(120, 'paperMono'),
    'orb-mark-ink-mono.svg': markSvg(120, 'inkMono'),
    'orb-mark-small.svg': markSvg(16, 'night'),
    'orb-mark-small-paper.svg': markSvg(16, 'paper'),
    'orb-mark-template.svg': templateSvg(),
    'orb-lockup-horizontal.svg': horizontalLockupSvg(76, 'night'),
    'orb-lockup-horizontal-paper.svg': horizontalLockupSvg(76, 'paper'),
    'orb-lockup-stacked.svg': stackedLockupSvg(96, 'night'),
    'orb-app-icon.svg': appIconSvg(1024),
    'favicon.svg': faviconSvg(),
  };
}
