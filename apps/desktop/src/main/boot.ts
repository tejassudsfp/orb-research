/**
 * P5.1 instant Home: the window opens at once on a local copy of the Orb UI (`orb-boot://app/index.html`, served
 * from the UI dist by main) that renders Home in its "warming up" state while the sidecar boots; when the sidecar is
 * ready, main loads the real UI from the sidecar origin (PRD Non-functional requirements, Startup).
 *
 * The boot page has no engine: its CSP allows no connections at all (`connect-src 'none'`), the request filter lets
 * `orb-boot:` reach only this handler, and it gets none of `window.orbNative`'s services except the ask-box draft
 * hand-over (what the user typed while warming is put back in the live box).
 *
 * The pure parts (path resolution, CSP, theme read) are unit-tested in test/boot.test.ts; Electron is only
 * type-imported here except in `installBootProtocol`, which receives `protocol` from the caller.
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import type { Protocol } from 'electron';
import { appearanceFromSettings, resolveBrightness, type Appearance } from '@orb/shared';

export const BOOT_SCHEME = 'orb-boot';
export const BOOT_HOST = 'app';
export const BOOT_ORIGIN = `${BOOT_SCHEME}://${BOOT_HOST}`;

export type BootView = {
  /** The saved Home theme, so the first paint is already right. */
  theme: 'night' | 'day';
  appearance?: Appearance;
  /**
   * `home`: the warming-up Home. `splash`: just the Orb mark and "Warming up…", used until the first-run sheet has
   * been finished or skipped once (PRD: on first launch the setup sheet comes before Home).
   */
  view: 'home' | 'splash';
  /** P5.3: Settings › Appearance › Motion (`reduce` cuts motion whatever macOS says). */
  motion: 'system' | 'reduce';
};

/** The boot page's URL. */
export function bootUrl({ theme, view, motion, appearance }: BootView): string {
  const a = appearance ?? appearanceFromSettings({ theme });
  const query = new URLSearchParams({
    boot: '1',
    theme,
    view,
    motion,
    style: a.themeId,
    brightness: a.mode,
    accent: a.accent,
  });
  return `${BOOT_ORIGIN}/index.html?${query}#/`;
}

/** True for a URL the boot handler serves (scheme and host both match). */
export function isBootUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === `${BOOT_SCHEME}:` && u.host === BOOT_HOST;
  } catch {
    return false;
  }
}

/**
 * The file under `uiDist` a boot request asks for, or undefined (wrong host, traversal, dot files, source maps).
 * Paths are percent-decoded once and normalised; the result must stay inside `uiDist`.
 */
export function resolveBootFile(uiDist: string, raw: string): string | undefined {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return undefined;
  }
  if (u.protocol !== `${BOOT_SCHEME}:` || u.host !== BOOT_HOST) return undefined;
  let path: string;
  try {
    path = decodeURIComponent(u.pathname);
  } catch {
    return undefined;
  }
  if (path === '/' || path === '') path = '/index.html';
  if (path.includes('\0') || path.includes('\\')) return undefined;
  const segments = path.split('/').filter(Boolean);
  if (segments.some((s) => s === '..' || s.startsWith('.'))) return undefined;
  if (path.endsWith('.map')) return undefined;
  const root = normalize(uiDist + sep);
  const file = normalize(join(uiDist, ...segments));
  return file.startsWith(root) ? file : undefined;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

export function bootMime(file: string): string {
  return MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** The boot page's CSP: its own files only, and no connections of any kind (it has no engine to talk to). */
export function bootCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'none'",
    "worker-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * What the boot page shows, from `<ORB_HOME>/orb.json` (read-only; the canvas service owns the file): the theme
 * (night by default) and Home once `firstRunDone` (or the test switch ORB_SKIP_FIRST_RUN=1, which the sidecar honours
 * the same way), else the splash; the motion choice (P5.3). A missing or broken file reads as a first launch.
 */
export function readBootView(
  orbHome: string,
  env: NodeJS.ProcessEnv = process.env,
  systemDark = false,
): BootView {
  let value: { theme?: unknown; appearance?: unknown; firstRunDone?: unknown; motion?: unknown } = {};
  try {
    value = JSON.parse(readFileSync(join(orbHome, 'orb.json'), 'utf8')) as typeof value;
  } catch {
    // first launch, or unreadable: defaults
  }
  const appearance = appearanceFromSettings(value);
  return {
    theme: resolveBrightness(appearance, systemDark) === 'light' ? 'day' : 'night',
    appearance,
    view: value?.firstRunDone === true || env.ORB_SKIP_FIRST_RUN === '1' ? 'home' : 'splash',
    motion: value?.motion === 'reduce' ? 'reduce' : 'system',
  };
}

/** Serve `orb-boot://app/*` from the UI dist (read-only, GET only, strict CSP). */
export function installBootProtocol(protocol: Protocol, uiDist: string): void {
  protocol.handle(BOOT_SCHEME, async (request) => {
    const file = request.method === 'GET' ? resolveBootFile(uiDist, request.url) : undefined;
    if (!file) return new Response('Not found', { status: 404 });
    try {
      const body = await readFile(file);
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': bootMime(file),
          'content-security-policy': bootCsp(),
          'x-content-type-options': 'nosniff',
          'cache-control': 'no-store',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

/** The longest ask-box draft carried from the boot page to the live Home. */
export const MAX_DRAFT = 4000;

/** Validate a draft hand-over from the boot page: `{prompt, template?}` with bounded strings. */
export function parseDraft(value: unknown): { prompt: string; template?: string } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { prompt, template } = value as { prompt?: unknown; template?: unknown };
  if (typeof prompt !== 'string' || prompt.length > MAX_DRAFT) return undefined;
  if (template !== undefined && (typeof template !== 'string' || !/^[a-z-]{1,40}$/.test(template)))
    return undefined;
  return template === undefined ? { prompt } : { prompt, template };
}
