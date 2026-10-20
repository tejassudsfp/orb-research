/**
 * Security baseline for the Orb window (BUILD_PLAN P1.4).
 *
 * The UI is served by the dsh sidecar on `http://127.0.0.1:<port>`. The renderer may only talk to that origin,
 * may never reach the harness's unrestricted `/api/file` reader, and every other navigation goes to the default browser.
 *
 * The decision functions are pure (unit-tested in test/security.test.ts); `installSecurity` wires them into
 * Electron. Only type imports from 'electron' here, so the module loads under plain Node/Vitest.
 */
import { createHash } from 'node:crypto';
import type { BrowserWindow, Session } from 'electron';
import { DESIGN_FRAME_CSP, DESIGN_FRAME_PATH } from '@orb/shared';
import { bootCsp, isBootUrl } from './boot.js';

export type RequestDecision = 'allow' | 'cancel';

/** Schemes the renderer may load without going to the sidecar (in-memory or Chromium-internal). */
const LOCAL_SCHEMES = new Set(['data:', 'blob:', 'devtools:']);

/**
 * Canonical pathname used for blocking: percent-decoded (repeatedly, so double encoding can't hide a segment),
 * backslashes as slashes, repeated slashes collapsed, dot segments resolved, lower-cased. The gateway itself
 * matches `/api/file` by exact `url.pathname` (dsh-client-connection/lib/index.js:611-616); this is stricter.
 */
export function canonicalPath(pathname: string): string {
  let p = pathname;
  for (let i = 0; i < 4; i++) {
    let next: string;
    try {
      next = decodeURIComponent(p);
    } catch {
      break;
    }
    if (next === p) break;
    p = next;
  }
  p = p.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return `/${out.join('/')}`.toLowerCase();
}

/** True for the harness's arbitrary-file endpoint (`/api/file`, any suffix, any encoding). */
export function isBlockedApiPath(pathname: string): boolean {
  return canonicalPath(pathname).startsWith('/api/file');
}

/** The sidecar origin for a token URL, e.g. `http://127.0.0.1:5173`. Only loopback http is accepted. */
export function sidecarOrigin(url: string): string {
  const u = new URL(url);
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1')
    throw new Error('sidecar URL must be http://127.0.0.1:<port>');
  return u.origin;
}

/** Same host and port as the sidecar, over http or its WebSocket twin. */
export function isSidecarUrl(url: URL, origin: string): boolean {
  const o = new URL(origin);
  return (url.protocol === 'http:' || url.protocol === 'ws:') && url.host === o.host;
}

/** P6.2: true for the sidecar's design-frame page route (any encoding, any query). */
export function isDesignFramePath(pathname: string): boolean {
  return canonicalPath(pathname) === DESIGN_FRAME_PATH;
}

/** True when `rawUrl` is a design-frame page on the sidecar. */
export function isDesignFrameUrl(rawUrl: string | undefined, origin: string | undefined): boolean {
  if (!rawUrl || !origin) return false;
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' && url.host === new URL(origin).host && isDesignFramePath(url.pathname);
  } catch {
    return false;
  }
}

/** Where a request comes from (Electron's `details.frame` / `details.resourceType`), when known. */
export type RequestSource = { frameUrl?: string; resourceType?: string };

/**
 * Decide one renderer request (`session.webRequest.onBeforeRequest`).
 * - `/api/file` on the sidecar: cancel.
 * - Anything else on the sidecar origin (http + ws): allow.
 * - data:/blob:/devtools: allow (no network).
 * - `orb-boot://app/*` (P5.1): allow. Main serves it from the UI dist (the warming-up Home); its CSP allows no
 *   connections, and the sidecar page's CSP (`default-src 'self'`) cannot load it.
 * - Everything else, navigations included: cancel. External links are handed to the default browser by the
 *   navigation guards before they ever become a request.
 * - P6.2: nothing a design frame asks for, except its own page being (re)loaded as a sub-frame. Its CSP already
 *   refuses every fetch, so this is a second fence (data: and blob: stay allowed: they never leave the process).
 */
export function decideRequest(
  rawUrl: string,
  origin: string | undefined,
  source: RequestSource = {},
): RequestDecision {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return 'cancel';
  }
  if (LOCAL_SCHEMES.has(url.protocol)) return 'allow';
  if (isDesignFrameUrl(source.frameUrl, origin)) {
    const ownPage = source.resourceType === 'subFrame' && isDesignFrameUrl(rawUrl, origin);
    if (!ownPage) return 'cancel';
  }
  if (isBootUrl(rawUrl)) return 'allow';
  if (!origin || !isSidecarUrl(url, origin)) return 'cancel';
  return isBlockedApiPath(url.pathname) ? 'cancel' : 'allow';
}

/** What to do when the page navigates or opens a window to `rawUrl`. */
export function decideNavigation(rawUrl: string, origin: string | undefined): 'allow' | 'external' | 'deny' {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return 'deny';
  }
  if (origin && url.protocol === 'http:' && url.host === new URL(origin).host) {
    return isBlockedApiPath(url.pathname) ? 'deny' : 'allow';
  }
  if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:') return 'external';
  return 'deny';
}

/**
 * Inline scripts the gateway injects into every served index: the boot-ready tail
 * (dsh-host-webserver/lib/index.js:65) and the connection-recovery global (dsh-client-connection/lib/index.js:825,
 * rendered by dsh-host-webserver/lib/index.js:26-29). Orb's UI does not use them, but allowing them by hash keeps
 * the console free of CSP violations without 'unsafe-inline'. If the harness changes them they are simply blocked
 * (Orb does not depend on them); the e2e test fails on any CSP violation so drift is noticed.
 */
export const GATEWAY_INLINE_SCRIPTS = [
  '(globalThis.__DSH_BOOT_READY__ ??= Promise.withResolvers()).resolve()',
  'globalThis["__DSH_CONNECTION_RECOVERY__"] = {"backoffBaseMs":500,"backoffFactor":2,"backoffMaxMs":10000,"generationReadyWarnMs":3000,"generationReadyTimeoutMs":15000}',
];

export const scriptHash = (text: string) => `sha256-${createHash('sha256').update(text).digest('base64')}`;

/** Content-Security-Policy for documents served by the sidecar. */
export function contentSecurityPolicy(origin: string): string {
  const ws = origin.replace(/^http:/, 'ws:');
  const hashes = GATEWAY_INLINE_SCRIPTS.map((t) => `'${scriptHash(t)}'`).join(' ');
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes}`,
    // React and the canvas set style attributes; no remote styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${ws}`,
    "media-src 'self' blob:",
    // Workers (pdf.js, P2.5) only from the sidecar origin: the worker is bundled into dist, never a blob or CDN.
    "worker-src 'self'",
    "object-src 'none'",
    // P6.2: only design frames, each its own sidecar page with its own CSP (scripts, no network).
    `frame-src ${origin}${DESIGN_FRAME_PATH}`,
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Response headers with Orb's CSP set (replacing any CSP from the server for sidecar documents). */
export function withCsp(
  headers: Record<string, string | string[]> | undefined,
  url: string,
  origin: string | undefined,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  // P5.1: the boot page keeps its own, stricter CSP (no connections) even once the sidecar origin is known.
  if (isBootUrl(url)) {
    for (const [k, v] of Object.entries(headers ?? {}))
      if (k.toLowerCase() !== 'content-security-policy') out[k] = v;
    out['Content-Security-Policy'] = [bootCsp()];
    return out;
  }
  // P6.2: a design frame keeps its own policy (scripts allowed, no network), forced here whatever the server sent.
  if (isDesignFrameUrl(url, origin)) {
    for (const [k, v] of Object.entries(headers ?? {}))
      if (k.toLowerCase() !== 'content-security-policy') out[k] = v;
    out['Content-Security-Policy'] = [DESIGN_FRAME_CSP];
    return out;
  }
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (k.toLowerCase() !== 'content-security-policy') out[k] = v;
    // Keep a stricter server CSP (e.g. /api/file's sandbox) on non-sidecar responses untouched.
    else if (!origin || !isSidecarUrl(new URL(url), origin)) out[k] = v;
  }
  if (origin) out['Content-Security-Policy'] = [contentSecurityPolicy(origin)];
  return out;
}

export type SecurityDeps = {
  /** The current sidecar origin (changes when the sidecar restarts on a new port). */
  origin: () => string | undefined;
  openExternal: (url: string) => void | Promise<void>;
  log?: (line: string) => void;
};

/** Install the request filter, CSP and permission denial on a session. Call once per session. */
export function installSessionSecurity(ses: Session, deps: SecurityDeps): void {
  ses.webRequest.onBeforeRequest((details, callback) => {
    let frameUrl: string | undefined;
    try {
      frameUrl = details.frame?.url;
    } catch {
      // the frame is gone
    }
    const decision = decideRequest(details.url, deps.origin(), {
      ...(frameUrl !== undefined ? { frameUrl } : {}),
      resourceType: details.resourceType,
    });
    if (decision === 'cancel')
      deps.log?.(`blocked ${details.resourceType} request to ${redactUrl(details.url)}`);
    callback({ cancel: decision === 'cancel' });
  });
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: withCsp(details.responseHeaders, details.url, deps.origin()) });
  });
  // No camera, mic, notifications, geolocation, etc. in v0.
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
}

/** Install navigation guards on a window. External http(s)/mailto links go to the default browser. */
export function installWindowSecurity(win: BrowserWindow, deps: SecurityDeps): void {
  const wc = win.webContents;
  const route = (url: string): boolean => {
    const d = decideNavigation(url, deps.origin());
    if (d === 'external') void deps.openExternal(url);
    else if (d === 'deny') deps.log?.(`denied navigation to ${redactUrl(url)}`);
    return d === 'allow';
  };
  wc.setWindowOpenHandler(({ url }) => {
    // Never open a second Electron window; same-origin opens are denied too (single-window app).
    if (decideNavigation(url, deps.origin()) === 'external') void deps.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    if (!route(url)) event.preventDefault();
  });
  wc.on('will-redirect', (event, url) => {
    if (decideNavigation(url, deps.origin()) !== 'allow') event.preventDefault();
  });
  wc.on('will-attach-webview', (event) => event.preventDefault());
}

/** Strip query strings (tokens) from URLs before they reach a log. */
export function redactUrl(url: string): string {
  const i = url.search(/[?#]/);
  return i === -1 ? url : `${url.slice(0, i)}?<redacted>`;
}
