/**
 * P3.5 fetch_url network half: address policy (private ranges, IPv4-mapped IPv6, local names), pinned DNS (no second
 * resolution, so no rebinding), careful redirects, the 5 MB cap and type checks, against a real local HTTP server.
 *
 * The server listens on 127.0.0.1, which the real policy refuses; tests address it by made-up names that only the
 * injected resolver knows, and widen `allowAddress` to 127.0.0.1 alone. Everything else is the production path.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_SOURCE_BYTES,
  SourceError,
  checkUrl,
  classify,
  fetchResource,
  isLocalName,
  isPublicAddress,
  resolvePublic,
  type Resolver,
} from '../src/index.js';
import { makePdf } from '../../../scripts/testkit/fixtures.js';

let server: Server;
let port = 0;
const hits: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(`${req.headers.host} ${req.url}`);
    const url = new URL(req.url ?? '/', 'http://x');
    switch (url.pathname) {
      case '/article':
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<html><head><title>Hello</title></head><body><p>Article text.</p></body></html>');
        return;
      case '/paper.pdf':
        res.writeHead(200, { 'content-type': 'application/pdf' });
        res.end(makePdf(2, 'A paper'));
        return;
      case '/octet':
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        res.end(makePdf(1));
        return;
      case '/zip':
        res.writeHead(200, { 'content-type': 'application/zip' });
        res.end(Buffer.alloc(100));
        return;
      case '/big-declared':
        res.writeHead(200, { 'content-type': 'text/plain', 'content-length': String(MAX_SOURCE_BYTES + 1) });
        res.end();
        return;
      case '/big-stream': {
        res.writeHead(200, { 'content-type': 'text/plain' });
        const chunk = Buffer.alloc(1024 * 1024, 'a');
        for (let i = 0; i < 6; i++) res.write(chunk);
        res.end();
        return;
      }
      case '/to-article':
        res.writeHead(302, { location: '/article' });
        res.end();
        return;
      case '/to-other-host':
        res.writeHead(301, { location: `http://other.test:${port}/article` });
        res.end();
        return;
      case '/to-loopback':
        res.writeHead(302, { location: `http://127.0.0.1:${port}/article` });
        res.end();
        return;
      case '/to-private-name':
        res.writeHead(302, { location: `http://private.test:${port}/article` });
        res.end();
        return;
      case '/to-ftp':
        res.writeHead(302, { location: 'ftp://example.com/file' });
        res.end();
        return;
      case '/loop':
        res.writeHead(302, { location: '/loop' });
        res.end();
        return;
      case '/missing':
        res.writeHead(404, { 'content-type': 'text/html' });
        res.end('not found');
        return;
      default:
        res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

/** site.test and other.test → the test server; private.test → a private address; split.test → public + private. */
const lookups: string[] = [];
const resolver: Resolver = async (host) => {
  lookups.push(host);
  if (host === 'site.test' || host === 'other.test') return [{ address: '127.0.0.1', family: 4 }];
  if (host === 'private.test') return [{ address: '10.0.0.7', family: 4 }];
  if (host === 'split.test')
    return [
      { address: '93.184.216.34', family: 4 },
      { address: '192.168.1.10', family: 4 },
    ];
  if (host === 'mapped.test') return [{ address: '::ffff:127.0.0.1', family: 6 }];
  throw Object.assign(new Error(`ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
};
const opts = { resolver, allowAddress: (a: string) => a === '127.0.0.1' };
const site = (path: string) => `http://site.test:${port}${path}`;
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (err) {
    return err instanceof SourceError ? err.code : `other: ${(err as Error).message}`;
  }
};

describe('address policy', () => {
  it('accepts only public unicast addresses', () => {
    for (const a of ['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '::ffff:93.184.216.34'])
      expect(isPublicAddress(a)).toBe(true);
    for (const a of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.0.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '255.255.255.255',
      '224.0.0.1',
      '::1',
      '::',
      'fe80::1',
      'fc00::1',
      'fd12:3456::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      '64:ff9b::7f00:1',
      '2002:7f00:1::',
      'not-an-ip',
    ])
      expect(isPublicAddress(a), a).toBe(false);
  });

  it('refuses local names and private literals before any lookup', () => {
    for (const host of [
      'localhost',
      'LOCALHOST.',
      'app.localhost',
      'printer.local',
      'db.internal',
      'x.home.arpa',
    ])
      expect(isLocalName(host), host).toBe(true);
    expect(isLocalName('example.com')).toBe(false);
    for (const url of [
      'http://localhost/',
      'http://127.0.0.1:8080/',
      'http://[::1]/',
      'http://10.0.0.1/',
      'http://169.254.169.254/latest/meta-data',
      'http://[::ffff:7f00:1]/',
      'http://0x7f000001/',
      'http://2130706433/',
    ])
      expect(() => checkUrl(url), url).toThrowError(expect.objectContaining({ code: 'BLOCKED_URL' }));
    expect(() => checkUrl('file:///etc/passwd')).toThrowError(
      expect.objectContaining({ code: 'INVALID_URL' }),
    );
    expect(() => checkUrl('https://user:pw@example.com/')).toThrowError(
      expect.objectContaining({ code: 'BLOCKED_URL' }),
    );
    expect(() => checkUrl(`https://example.com/${'a'.repeat(2100)}`)).toThrowError(
      expect.objectContaining({ code: 'INVALID_URL' }),
    );
    expect(checkUrl('https://example.com/a#b').href).toBe('https://example.com/a#b');
  });

  it('refuses a name when ANY of its addresses is private (no partial answers)', async () => {
    expect(await codeOf(resolvePublic('split.test', { resolver }))).toBe('BLOCKED_URL');
    expect(await codeOf(resolvePublic('private.test', { resolver }))).toBe('BLOCKED_URL');
    expect(await codeOf(resolvePublic('mapped.test', { resolver }))).toBe('BLOCKED_URL');
    expect(await resolvePublic('site.test', { resolver, allowAddress: () => true })).toEqual([
      { address: '127.0.0.1', family: 4 },
    ]);
  });
});

describe('fetchResource', () => {
  it('fetches through the pinned address (the name is resolved once, by Orb, and never again)', async () => {
    lookups.length = 0;
    const r = await fetchResource(site('/article'), opts);
    expect(r).toMatchObject({
      status: 200,
      kind: 'html',
      contentType: 'text/html',
      charset: 'utf-8',
      finalUrl: site('/article'),
    });
    expect(Buffer.from(r.bytes).toString()).toContain('Article text.');
    // `site.test` does not exist in real DNS: the request could only connect through the pinned lookup.
    expect(lookups).toEqual(['site.test']);
    expect(hits.at(-1)).toBe(`site.test:${port} /article`);
  });

  it('refuses private targets with the real policy', async () => {
    expect(await codeOf(fetchResource(site('/article'), { resolver }))).toBe('BLOCKED_URL');
    expect(await codeOf(fetchResource(`http://private.test:${port}/article`, opts))).toBe('BLOCKED_URL');
    expect(await codeOf(fetchResource(`http://split.test:${port}/article`, opts))).toBe('BLOCKED_URL');
    expect(await codeOf(fetchResource(`http://127.0.0.1:${port}/article`, opts))).toBe('BLOCKED_URL');
  });

  it('follows redirects carefully: each hop re-checked, chain recorded, at most 5', async () => {
    const same = await fetchResource(site('/to-article'), opts);
    expect(same.chain).toEqual([site('/to-article'), site('/article')]);
    expect(same.finalUrl).toBe(site('/article'));
    const cross = await fetchResource(site('/to-other-host'), opts);
    expect(cross.finalUrl).toBe(`http://other.test:${port}/article`);
    expect(await codeOf(fetchResource(site('/to-loopback'), opts))).toBe('REDIRECT_BLOCKED');
    expect(await codeOf(fetchResource(site('/to-private-name'), opts))).toBe('BLOCKED_URL');
    expect(await codeOf(fetchResource(site('/to-ftp'), opts))).toBe('REDIRECT_BLOCKED');
    expect(await codeOf(fetchResource(site('/loop'), opts))).toBe('REDIRECT_BLOCKED');
  });

  it('caps size at 5 MB (declared and streamed) and reads only html, text and pdf', async () => {
    expect(await codeOf(fetchResource(site('/big-declared'), opts))).toBe('TOO_LARGE');
    expect(await codeOf(fetchResource(site('/big-stream'), opts))).toBe('TOO_LARGE');
    expect(await codeOf(fetchResource(site('/zip'), opts))).toBe('UNSUPPORTED_TYPE');
    expect(await codeOf(fetchResource(site('/missing'), opts))).toBe('HTTP_STATUS');
    expect((await fetchResource(site('/paper.pdf'), opts)).kind).toBe('pdf');
    expect((await fetchResource(site('/octet'), opts)).kind).toBe('pdf');
  });

  it('honours the caller signal and the timeout', async () => {
    const ac = new AbortController();
    ac.abort(new Error('stopped'));
    await expect(fetchResource(site('/article'), { ...opts, signal: ac.signal })).rejects.toThrow('stopped');
    const slowResolver: Resolver = () => new Promise(() => {});
    expect(
      await codeOf(fetchResource(site('/article'), { ...opts, resolver: slowResolver, timeoutMs: 100 })),
    ).toBe('TIMEOUT');
  });

  it('classifies content types', () => {
    const empty = new Uint8Array();
    expect(classify('text/html; charset=utf-8', empty)).toBe('html');
    expect(classify('application/xhtml+xml', empty)).toBe('html');
    expect(classify('text/markdown', empty)).toBe('text');
    expect(classify('application/ld+json', empty)).toBe('text');
    expect(classify('application/pdf', empty)).toBe('pdf');
    expect(classify('application/octet-stream', new TextEncoder().encode('%PDF-1.7'))).toBe('pdf');
    expect(classify('application/octet-stream', empty)).toBeUndefined();
    expect(classify('image/png', empty)).toBeUndefined();
  });
});
