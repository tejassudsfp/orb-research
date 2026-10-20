/**
 * The network half of `fetch_url` (BUILD_PLAN P3.5): one public HTTP(S) resource, safely.
 *
 * - Every hop's URL passes `checkUrl` (http/https, no user info, no local name or non-public IP literal).
 * - Direct connections: the host is resolved ONCE, every answer must be public, and the socket is pinned to those
 *   checked addresses through undici's `connect.lookup` (no second resolution, so no DNS rebinding). The URL's
 *   host name stays the Host header and TLS SNI.
 * - Proxied connections (the user exported HTTP(S)_PROXY; dsh-http-proxy's policy decides per URL): the proxy
 *   resolves the name, so the local address check cannot run; IP literals and local names are still refused
 *   before the proxy sees them (same rule as dsh-web-fetch-http, HARNESS_NOTES §P3.5).
 * - Redirects are followed by hand, at most 5 hops; each target is checked like the first URL (and resolved and
 *   pinned again), a downgrade from https to http is refused, and the chain is returned for the cache metadata.
 * - At most 5 MB: a larger Content-Length is refused before the body is read, and a body that grows past the cap
 *   while streaming is cut off and refused.
 * - Only HTML, text-like types and PDF are read; anything else is refused without reading the body.
 */
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';
import { SourceError } from './errors.js';
import { checkUrl, isPublicAddress, resolvePublic, type PinnedAddress, type Resolver } from './policy.js';

export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
export const FETCH_TIMEOUT_MS = 30_000;
export const ORB_USER_AGENT = 'Orb/0.1 (local research canvas)';

export type SourceKind = 'html' | 'text' | 'pdf';

/** How one URL must be sent: through the proxy dispatcher (dsh-http-proxy `proxyRouteFor`) or directly. */
export type ProxyRoute = { proxied: true; dispatcher: Dispatcher } | { proxied: false };

export type FetchOptions = {
  signal?: AbortSignal;
  /** Decides, per URL, whether the request goes through a proxy. Default: always direct. */
  route?: (url: URL) => ProxyRoute;
  resolver?: Resolver;
  /** Which resolved addresses may be dialled. Default: public unicast only. Tests widen it to loopback. */
  allowAddress?: (address: string) => boolean;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  userAgent?: string;
};

export type FetchedResource = {
  /** The URL asked for. */
  url: string;
  /** The URL that answered, after redirects. */
  finalUrl: string;
  /** Every URL requested, in order (the asked URL first, then each redirect target). */
  chain: string[];
  status: number;
  contentType: string;
  kind: SourceKind;
  /** Declared charset (lower-case), if any. */
  charset?: string;
  bytes: Uint8Array;
};

/** Classify a Content-Type (and the first bytes, for PDFs served as octet-stream) into a readable kind. */
export function classify(contentType: string | null, head: Uint8Array): SourceKind | undefined {
  const mime = (contentType ?? '').split(';', 1)[0]!.trim().toLowerCase();
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html';
  if (mime === 'application/pdf' || mime === 'application/x-pdf') return 'pdf';
  if (mime.startsWith('text/')) return 'text';
  if (
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime.endsWith('+json') ||
    mime.endsWith('+xml')
  )
    return 'text';
  if (
    (mime === '' || mime === 'application/octet-stream' || mime === 'binary/octet-stream') &&
    isPdfHead(head)
  )
    return 'pdf';
  return undefined;
}

const isPdfHead = (head: Uint8Array) => {
  const s = new TextDecoder('latin1').decode(head.subarray(0, 1024));
  return s.includes('%PDF-');
};

export const charsetOf = (contentType: string | null): string | undefined =>
  /;\s*charset\s*=\s*"?([^";]+)"?/i
    .exec(contentType ?? '')?.[1]
    ?.trim()
    .toLowerCase();

/** A connect `lookup` that serves only the addresses already checked (never resolves again). */
export function pinnedLookup(addresses: readonly PinnedAddress[]) {
  return (
    hostname: string,
    options: { family?: number | string; all?: boolean },
    callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void,
  ) => {
    const want =
      options.family === 4 || options.family === 'IPv4'
        ? 4
        : options.family === 6 || options.family === 'IPv6'
          ? 6
          : 0;
    const eligible = want === 0 ? addresses : addresses.filter((a) => a.family === want);
    if (eligible.length === 0) {
      const err = Object.assign(new Error(`no checked address for ${hostname}`), { code: 'ENOTFOUND' });
      callback(err, options.all ? [] : '', want);
      return;
    }
    if (options.all)
      callback(
        null,
        eligible.map((a) => ({ ...a })),
      );
    else callback(null, eligible[0]!.address, eligible[0]!.family);
  };
}

const isRedirect = (status: number) => [301, 302, 303, 307, 308].includes(status);

/** Fetch one public resource (see the module comment). Throws SourceError. */
export async function fetchResource(input: string, options: FetchOptions = {}): Promise<FetchedResource> {
  const maxBytes = options.maxBytes ?? MAX_SOURCE_BYTES;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const fail = (err: unknown): never => {
    if (options.signal?.aborted) throw options.signal.reason;
    if (timeout.aborted)
      throw new SourceError(
        'TIMEOUT',
        `the page did not answer within ${(options.timeoutMs ?? FETCH_TIMEOUT_MS) / 1000} s`,
      );
    if (err instanceof SourceError) throw err;
    throw new SourceError('NETWORK', `could not fetch the page: ${(err as Error)?.message ?? String(err)}`, {
      cause: err,
    });
  };

  let url = checkUrl(input);
  const chain = [url.href];
  for (let hop = 0; ; hop++) {
    let response: Response;
    let close: () => Promise<void>;
    try {
      ({ response, close } = await requestOnce(url, signal, options));
    } catch (err) {
      return fail(err);
    }
    try {
      if (isRedirect(response.status)) {
        await response.body?.cancel().catch(() => {});
        if (hop >= maxRedirects)
          throw new SourceError(
            'REDIRECT_BLOCKED',
            `more than ${maxRedirects} redirects; stopped at ${url.href}`,
          );
        const location = response.headers.get('location');
        if (!location)
          throw new SourceError('NETWORK', `HTTP ${response.status} redirect without a Location header`);
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          throw new SourceError('REDIRECT_BLOCKED', 'the redirect target is not a valid URL');
        }
        try {
          next = checkUrl(next.href);
        } catch (err) {
          throw new SourceError('REDIRECT_BLOCKED', `redirect refused: ${(err as Error).message}`);
        }
        if (url.protocol === 'https:' && next.protocol === 'http:')
          throw new SourceError(
            'REDIRECT_BLOCKED',
            `redirect from https to plain http refused (${next.href})`,
          );
        url = next;
        chain.push(url.href);
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        await response.body?.cancel().catch(() => {});
        throw new SourceError('HTTP_STATUS', `the page answered HTTP ${response.status}`);
      }
      const contentType = response.headers.get('content-type');
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) {
        await response.body?.cancel().catch(() => {});
        throw new SourceError(
          'TOO_LARGE',
          `the resource is larger than ${Math.round(maxBytes / (1024 * 1024))} MB`,
        );
      }
      const mime = (contentType ?? '').split(';', 1)[0]!.trim().toLowerCase();
      const maybe = mime === '' || mime === 'application/octet-stream' || mime === 'binary/octet-stream';
      // Refuse an unreadable type before reading its body (octet-stream is sniffed for a PDF header first).
      if (!maybe && classify(contentType, new Uint8Array()) === undefined) {
        await response.body?.cancel().catch(() => {});
        throw new SourceError(
          'UNSUPPORTED_TYPE',
          `orb reads web pages, text and PDFs, not ${mime || 'this type'}`,
        );
      }
      const bytes = await readCapped(response, maxBytes);
      const kind = classify(contentType, bytes);
      if (!kind)
        throw new SourceError(
          'UNSUPPORTED_TYPE',
          `orb reads web pages, text and PDFs, not ${mime || 'this type'}`,
        );
      const charset = charsetOf(contentType);
      return {
        url: chain[0]!,
        finalUrl: url.href,
        chain,
        status: response.status,
        contentType: mime,
        kind,
        ...(charset ? { charset } : {}),
        bytes,
      };
    } catch (err) {
      return fail(err);
    } finally {
      await close().catch(() => {});
    }
  }
}

async function requestOnce(
  url: URL,
  signal: AbortSignal,
  options: FetchOptions,
): Promise<{ response: Response; close: () => Promise<void> }> {
  const headers = {
    'user-agent': options.userAgent ?? ORB_USER_AGENT,
    accept:
      'text/html,application/xhtml+xml,application/pdf;q=0.9,text/*;q=0.8,application/json;q=0.5,*/*;q=0.1',
    'accept-language': 'en;q=1.0, *;q=0.5',
  };
  const route = options.route?.(url) ?? { proxied: false };
  if (route.proxied) {
    // The proxy resolves the name. Literals and local names were refused by checkUrl already.
    const response = (await undiciFetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers,
      signal,
      dispatcher: route.dispatcher,
    })) as unknown as Response;
    return { response, close: async () => {} };
  }
  const addresses = await resolvePublic(url.hostname, {
    ...(options.resolver ? { resolver: options.resolver } : {}),
    allowAddress: options.allowAddress ?? isPublicAddress,
    signal,
  });
  const dispatcher = new Agent({
    autoSelectFamily: true,
    connect: { lookup: pinnedLookup(addresses) as any },
  });
  try {
    const response = (await undiciFetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers,
      signal,
      dispatcher,
    })) as unknown as Response;
    return { response, close: () => dispatcher.close() };
  } catch (err) {
    await dispatcher.close().catch(() => {});
    throw err;
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes)
        throw new SourceError(
          'TOO_LARGE',
          `the resource is larger than ${Math.round(maxBytes / (1024 * 1024))} MB`,
        );
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}
