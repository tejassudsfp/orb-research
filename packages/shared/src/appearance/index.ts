/** Symplist's six styles and independent accent/brightness, adapted for Orb's canvas and exports. */
import { z } from 'zod';
import {
  accentPresets,
  accentSeed,
  DEFAULT_ACCENT,
  isAccentPresetId,
  normalizeCustomAccent,
  resolveAccent,
  type AccentChoice,
} from './accent.js';
import { renderedChrome, renderedPalette } from './palette.js';
import {
  DEFAULT_THEME_ID,
  isThemeId,
  themes,
  themeIds,
  type ColorMode,
  type ThemeId,
  type FontFamilyId,
} from './registry.js';

export * from './registry.js';
export * from './accent.js';
export * from './palette.js';
export * from './color.js';

/** Registered Fontsource face names, shared by SVG renderers and native export typography. */
export const fontFamilies: Record<FontFamilyId, string> = {
  geist: 'Geist Variable',
  'source-sans-3': 'Source Sans 3 Variable',
  'source-serif-4': 'Source Serif 4 Variable',
  nunito: 'Nunito Variable',
  'public-sans': 'Public Sans Variable',
  'dm-sans': 'DM Sans Variable',
  fraunces: 'Fraunces Variable',
  manrope: 'Manrope Variable',
  'ibm-plex-mono': 'IBM Plex Mono',
};

export const Brightness = z.enum(['light', 'dark', 'system']);
export type Brightness = z.infer<typeof Brightness>;
export type Appearance = { themeId: ThemeId; accent: AccentChoice; mode: Brightness };
export const DEFAULT_APPEARANCE: Appearance = {
  themeId: DEFAULT_THEME_ID,
  accent: DEFAULT_ACCENT,
  mode: 'system',
};
const Accent = z.string().transform((value, ctx): AccentChoice => {
  if (isAccentPresetId(value)) return value;
  const custom = normalizeCustomAccent(value);
  if (custom) return custom;
  ctx.addIssue({ code: 'custom', message: 'Choose an accent preset or a valid hex colour' });
  return z.NEVER;
});
export const AppearanceSchema = z.strictObject({
  themeId: z.enum(themeIds),
  accent: Accent,
  mode: Brightness,
});
export const AppearancePatch = AppearanceSchema.partial();
export type AppearancePatch = z.infer<typeof AppearancePatch>;

/** Recover independent fields, including future/removed themes, without discarding other preferences. */
export function normalizeAppearance(value: unknown): Appearance {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const accent = Accent.safeParse(input.accent);
  return {
    themeId: isThemeId(input.themeId) ? input.themeId : DEFAULT_THEME_ID,
    accent: accent.success ? accent.data : DEFAULT_ACCENT,
    mode: Brightness.safeParse(input.mode).success ? (input.mode as Brightness) : 'system',
  };
}

/** Old night/day files preserve their explicit brightness. New installs follow the system. */
export function appearanceFromSettings(value: unknown): Appearance {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  if (input.appearance && typeof input.appearance === 'object') return normalizeAppearance(input.appearance);
  return {
    ...DEFAULT_APPEARANCE,
    mode: input.theme === 'day' ? 'light' : input.theme === 'night' ? 'dark' : 'system',
  };
}

export function resolveBrightness(appearance: Appearance, systemDark: boolean): ColorMode {
  return appearance.mode === 'system' ? (systemDark ? 'dark' : 'light') : appearance.mode;
}

/** Plain values can be used by Electron, CSS, chart/diagram renderers and native exporters alike. */
export function appearancePalette(appearance: Appearance, mode: ColorMode) {
  const style = themes[appearance.themeId];
  const palette = renderedPalette(style, mode);
  const accent = resolveAccent(accentSeed(appearance.accent), style, mode);
  // Orb's canvas scales text and composites borders. Leave a little contrast margin above 4.5:1.
  const towardText = (value: string) =>
    '#' +
    [1, 3, 5]
      .map((index) =>
        Math.round(
          parseInt(value.slice(index, index + 2), 16) * 0.95 +
            parseInt(palette.text.slice(index, index + 2), 16) * 0.05,
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase();
  return {
    style,
    palette: { ...palette, muted: towardText(palette.muted) },
    accent: { ...accent, link: towardText(accent.link) },
  };
}

export function appearanceVariables(appearance: Appearance, mode: ColorMode): Record<string, string> {
  const { style, palette: p, accent: a } = appearancePalette(appearance, mode);
  const g = style.geometry;
  const chrome = renderedChrome(style, mode);
  const cover = appearancePalette(appearance, 'dark');
  return {
    '--orb-cover-bg': cover.palette.bg,
    '--orb-cover-text': cover.palette.text,
    '--orb-cover-muted': cover.palette.muted,
    '--orb-cover-accent': cover.accent.link,
    '--orb-bg': p.bg,
    '--orb-text': p.text,
    '--orb-text-soft': p.text,
    '--orb-text-muted': p.muted,
    '--orb-text-faint': p.muted,
    '--orb-placeholder': p.text,
    '--orb-surface': p.panel,
    '--orb-surface-strong': p.surface,
    '--orb-surface-card': p.surface,
    '--orb-inset': p.codeBg,
    '--orb-border': p.line,
    '--orb-border-soft': p.line,
    '--orb-border-card': p.lineStrong,
    '--orb-chip': p.hover,
    '--orb-hover': p.hover,
    '--orb-selection': a.selection,
    '--orb-accent': a.link,
    '--orb-accent-fill': a.accent,
    '--orb-on-accent': a.onAccent,
    '--orb-accent-soft': a.accentSoft,
    '--orb-focus': a.focus,
    '--orb-border-accent': a.focus,
    '--orb-signal': a.accent,
    '--orb-sky': a.link,
    '--orb-rho': a.accent,
    '--orb-night': p.bg,
    '--orb-ink': p.panel,
    '--orb-paper': p.text,
    '--orb-danger': p.danger,
    '--orb-success': p.ok,
    '--orb-warning': p.warn,
    '--orb-font': `var(--font-${style.fonts.ui.family}), ${style.fonts.ui.fallback}`,
    '--orb-font-heading': `var(--font-${style.fonts.heading.family}), ${style.fonts.heading.fallback}`,
    '--orb-font-mono': `var(--font-${style.fonts.mono.family}), ${style.fonts.mono.fallback}`,
    '--orb-radius-frame': g.rl,
    '--orb-radius-card': g.r,
    '--orb-radius-panel': g.rl,
    '--orb-radius-pill': g.rc,
    '--orb-card-shadow': g.cardShadow,
    '--orb-shadow-card': g.cardShadow,
    '--orb-shadow-panel': g.panelShadow,
    '--orb-shadow-primary': 'none',
    '--orb-row-pad': g.rowPad,
    '--orb-sheet-max': g.sheetMax,
    '--orb-sheet-pad': g.sheetPad,
    '--orb-sheet-bg': g.sheet ? p.surface : p.panel,
    '--orb-sheet-border': g.sheet ? `${style.variants.sheetBorderWidth} solid ${p.line}` : '0',
    '--orb-chrome-bg': chrome.bg,
    '--orb-chrome-text': chrome.text,
    '--orb-chrome-muted': chrome.muted,
    '--orb-chrome-border': chrome.line,
    '--orb-chrome-hover': chrome.hover,
    '--orb-chrome-accent': a.chromeAccent,
    '--orb-grid-dot': p.line,
    '--orb-stars': 'none',
    '--orb-stars-size': 'auto',
    '--orb-mark-line': a.link,
    '--orb-mark-line-opacity': '0.7',
    '--orb-mark-node': a.link,
    '--orb-mark-signal': a.accent,
    '--orb-mark-bright': a.link,
    '--orb-mark-small-ring': a.link,
    '--orb-mark-small-bright': a.link,
  };
}

export const accentLabel = (accent: AccentChoice): string =>
  isAccentPresetId(accent) ? accentPresets[accent].label : accent;
