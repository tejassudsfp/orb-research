/**
 * Request policy of the page-capture window (BUILD_PLAN P3.5 `capture_page`). Pure (no Electron import), unit-tested
 * in test/capture.test.ts; capture.ts wires it into the `temp:capture` session's `onBeforeRequest`.
 *
 * Every request the hidden window makes (the page, its scripts, images, XHRs, sockets) is judged on its own:
 * - `data:`/`blob:`/`about:` are local (no network) and allowed;
 * - `http(s):`/`ws(s):` are allowed only to public hosts: never a local special-use name or a non-public IP
 *   literal, and, when the request goes direct (no proxy for that scheme), only to a name whose every address is
 *   public (looked up here, cached briefly);
 * - everything else (`file:`, `chrome:`, `devtools:`, custom schemes) is refused.
 * With a proxy the proxy resolves names, so only the name/literal rules apply (as in the sidecar's fetch_url).
 */
import { checkUrl, isLocalName, isNonPublicLiteral, resolvePublic, type Resolver } from '@orb/sources/policy';
import { ControlError } from './control.js';

export type CaptureDecision = 'allow' | 'cancel';

export type ProxyConfig = { http?: string; https?: string; noProxy: string[] };

/** Proxy settings from the launch environment (lowercase first, as dsh-http-proxy reads them). */
export function proxyFromEnv(env: NodeJS.ProcessEnv): ProxyConfig {
  const pick = (name: string) => (env[name] || env[name.toUpperCase()] || '').trim() || undefined;
  const all = pick('all_proxy');
  const http = pick('http_proxy') ?? all;
  const https = pick('https_proxy') ?? all;
  const noProxy = (pick('no_proxy') ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return { ...(http ? { http } : {}), ...(https ? { https } : {}), noProxy };
}

/** Chromium `proxyRules` for a ProxyConfig ('' = direct). Only http(s) proxies are used. */
export function proxyRules(config: ProxyConfig): string {
  const hostPort = (u?: string) => {
    if (!u) return undefined;
    try {
      const url = new URL(u);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
      return url.host;
    } catch {
      return undefined;
    }
  };
  const rules: string[] = [];
  const h = hostPort(config.http);
  const s = hostPort(config.https);
  if (h) rules.push(`http=${h}`);
  if (s) rules.push(`https=${s}`);
  return rules.join(';');
}

/** Whether a request to `url` goes through the configured proxy. */
export function isProxied(url: URL, config: ProxyConfig): boolean {
  const scheme = url.protocol === 'https:' || url.protocol === 'wss:' ? 'https' : 'http';
  if (!config[scheme] || !proxyRules({ [scheme]: config[scheme], noProxy: [] })) return false;
  const host = url.hostname.toLowerCase();
  return !config.noProxy.some(
    (p) => p === '*' || host === p.replace(/^\./, '') || host.endsWith(p.startsWith('.') ? p : `.${p}`),
  );
}

export type FilterOptions = {
  proxy: ProxyConfig;
  resolver?: Resolver;
  allowAddress?: (address: string) => boolean;
  /** Cache of host → verdict (shared across one capture). */
  cache?: Map<string, Promise<boolean>>;
};

/** Decide one request of the capture window. */
export async function decideCaptureRequest(rawUrl: string, options: FilterOptions): Promise<CaptureDecision> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return 'cancel';
  }
  if (url.protocol === 'data:' || url.protocol === 'blob:' || url.href === 'about:blank') return 'allow';
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return 'cancel';
  if (url.username || url.password) return 'cancel';
  if (isLocalName(url.hostname) || isNonPublicLiteral(url.hostname)) return 'cancel';
  if (isProxied(url, options.proxy)) return 'allow';
  const host = url.hostname.toLowerCase();
  const cache = options.cache ?? new Map<string, Promise<boolean>>();
  let verdict = cache.get(host);
  if (!verdict) {
    verdict = resolvePublic(host, {
      ...(options.resolver ? { resolver: options.resolver } : {}),
      ...(options.allowAddress ? { allowAddress: options.allowAddress } : {}),
    }).then(
      () => true,
      () => false,
    );
    cache.set(host, verdict);
  }
  return (await verdict) ? 'allow' : 'cancel';
}

/** Refuse a URL main will not load at all (the sidecar checked it too). */
export function checkCaptureUrl(url: string): void {
  try {
    checkUrl(url);
  } catch (err) {
    const code = (err as { code?: string }).code === 'BLOCKED_URL' ? 'BLOCKED_URL' : 'INVALID_URL';
    throw new ControlError(code === 'BLOCKED_URL' ? 403 : 400, code, (err as Error).message);
  }
}
