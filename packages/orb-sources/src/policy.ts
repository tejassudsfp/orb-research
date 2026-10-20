/**
 * URL and address policy for everything Orb fetches or captures on an agent's behalf (BUILD_PLAN P3.5).
 *
 * - Only `http:` and `https:` URLs, at most 2048 characters, without user info.
 * - Never a loopback, private, link-local, multicast, reserved or otherwise non-public address: an IP literal is
 *   judged as written, a host name by EVERY address it resolves to (one non-public answer refuses the whole set),
 *   and the connection is then pinned to exactly the addresses that were checked (see fetcher.ts), so a second DNS
 *   answer cannot rebind the host to a private address between the check and the connect.
 * - `localhost`, `*.localhost` and the other special-use names that always mean this machine or the local network
 *   are refused before any lookup.
 *
 * Pure (node:dns, node:net and ipaddr.js only): shared by orb-canvas's tools and unit-tested on its own.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { SourceError } from './errors.js';

export const MAX_URL_LENGTH = 2048;

/** A resolved, validated address the connection may use. */
export type PinnedAddress = { address: string; family: 4 | 6 };

/** `dns.lookup(host, {all: true})` (injectable for tests). */
export type Resolver = (hostname: string) => Promise<ReadonlyArray<{ address: string; family: number }>>;

export const systemResolver: Resolver = (hostname) => dnsLookup(hostname, { all: true, order: 'verbatim' });

const stripBrackets = (host: string) =>
  host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

/**
 * True only for a globally reachable unicast address. IPv4-mapped IPv6 is judged by its IPv4 address; the
 * translation and tunnelling prefixes (6to4, Teredo, NAT64 well-known prefix) are refused because their final
 * IPv4 destination cannot be checked here.
 */
export function isPublicAddress(input: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(stripBrackets(input));
  } catch {
    return false;
  }
  if (parsed.kind() === 'ipv4') return (parsed as ipaddr.IPv4).range() === 'unicast';
  const v6 = parsed as ipaddr.IPv6;
  if (v6.isIPv4MappedAddress()) return v6.toIPv4Address().range() === 'unicast';
  return v6.range() === 'unicast';
}

/** Host names that always mean this machine or the local network, refused without a lookup (RFC 6761/6762). */
export function isLocalName(hostname: string): boolean {
  const h = stripBrackets(hostname).toLowerCase().replace(/\.$/, '');
  return (
    h === '' ||
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.home.arpa') ||
    h === 'local'
  );
}

/** True for a host written as an IP literal that is not public (no lookup needed to refuse it). */
export function isNonPublicLiteral(hostname: string): boolean {
  const h = stripBrackets(hostname);
  return isIP(h) !== 0 && !isPublicAddress(h);
}

/**
 * Parse and check a URL before anything touches the network: scheme, length, user info, and the host's NAME
 * (a literal non-public IP or a local special-use name is refused here; resolved addresses are checked by
 * {@link resolvePublic}).
 */
export function checkUrl(input: string): URL {
  if (typeof input !== 'string' || input.length === 0)
    throw new SourceError('INVALID_URL', 'a URL is required');
  if (input.length > MAX_URL_LENGTH)
    throw new SourceError('INVALID_URL', `the URL is longer than ${MAX_URL_LENGTH} characters`);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SourceError('INVALID_URL', `not a valid URL: ${input.slice(0, 200)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new SourceError('INVALID_URL', `only http and https URLs can be fetched (got ${url.protocol})`);
  if (url.username || url.password)
    throw new SourceError('BLOCKED_URL', 'URLs with a user name or password are not fetched');
  if (isLocalName(url.hostname) || isNonPublicLiteral(url.hostname))
    throw new SourceError(
      'BLOCKED_URL',
      `${url.hostname} is a local or private address; orb only fetches public web pages`,
    );
  return url;
}

/**
 * Resolve a host name ONCE and accept the answer only when every address is public. The returned set is the only
 * set the connection may use (pinned), which is what defeats DNS rebinding: the name is never resolved again.
 */
export async function resolvePublic(
  hostname: string,
  options: { resolver?: Resolver; allowAddress?: (address: string) => boolean; signal?: AbortSignal } = {},
): Promise<PinnedAddress[]> {
  const allow = options.allowAddress ?? isPublicAddress;
  const host = stripBrackets(hostname);
  const family = isIP(host);
  let answers: ReadonlyArray<{ address: string; family: number }>;
  if (family !== 0) answers = [{ address: host, family }];
  else {
    options.signal?.throwIfAborted();
    try {
      answers = await raceAbort((options.resolver ?? systemResolver)(host), options.signal);
    } catch (err) {
      if (options.signal?.aborted) throw err;
      throw new SourceError('NETWORK', `could not resolve ${hostname}`, { cause: err });
    }
  }
  if (answers.length === 0) throw new SourceError('NETWORK', `${hostname} resolved to no address`);
  const out: PinnedAddress[] = [];
  for (const a of answers) {
    if ((a.family !== 4 && a.family !== 6) || isIP(a.address) !== a.family)
      throw new SourceError('NETWORK', `${hostname} resolved to an invalid address`);
    if (!allow(a.address))
      throw new SourceError(
        'BLOCKED_URL',
        `${hostname} resolves to a private or local address; orb only fetches public web pages`,
      );
    out.push({ address: a.address, family: a.family });
  }
  return out;
}

/** Race a promise that cannot be cancelled (an OS lookup) against the caller's signal. */
export function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}
