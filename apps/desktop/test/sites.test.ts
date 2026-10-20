/**
 * P6.10 signed-in browsing, the pure parts: site-address parsing and the ToS list (shared), the registry file,
 * the rate limiter, the activity list, and the fetch window's request policy. The real windows run in
 * e2e/signedin.spec.ts.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONTROL_SECRET_ENV,
  CONTROL_URL_ENV,
  SIGNED_IN,
  hostInDomain,
  parseSiteInput,
  tosWarningFor,
} from '@orb/shared';
import { SourceError, createSignedInClient } from '@orb/sources';
import { ControlError, startControlServer, type ControlServer } from '../src/main/control.ts';
import { RateLimiter, SitesStore, decideSitesRequest, redactUrl } from '../src/main/sitesCore.ts';

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'orb-sites-'));
  dirs.push(d);
  return d;
};
let server: ControlServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('site addresses and the ToS list', () => {
  it('parses what a user types', () => {
    expect(parseSiteInput('LinkedIn.com')).toEqual({ domain: 'linkedin.com', loginUrl: 'https://linkedin.com/' });
    expect(parseSiteInput('https://www.linkedin.com/login')).toEqual({
      domain: 'linkedin.com',
      loginUrl: 'https://www.linkedin.com/login',
    });
    expect(parseSiteInput('example.com/account?x=1')).toMatchObject({ domain: 'example.com' });
  });

  it('refuses http (unless allowed), local names, IP literals, user info and other schemes', () => {
    for (const bad of [
      'http://example.com',
      'localhost',
      'https://foo.local',
      'https://127.0.0.1/',
      'https://[::1]/',
      'https://user:pw@example.com/',
      'ftp://example.com',
      '',
      'not a url at all',
      'intranet',
    ])
      expect(parseSiteInput(bad), bad).toHaveProperty('error');
    expect(parseSiteInput('http://site.orb.test/login', { allowHttp: true })).toEqual({
      domain: 'site.orb.test',
      loginUrl: 'http://site.orb.test/login',
    });
  });

  it('warns for listed sites and their subdomains only', () => {
    expect(tosWarningFor('linkedin.com')).toMatch(/LinkedIn/);
    expect(tosWarningFor('www.linkedin.com')).toMatch(/LinkedIn/);
    expect(tosWarningFor('notlinkedin.com')).toBeUndefined();
    expect(tosWarningFor('example.com')).toBeUndefined();
    expect(hostInDomain('a.b.example.com', 'example.com')).toBe(true);
    expect(hostInDomain('evilexample.com', 'example.com')).toBe(false);
  });
});

describe('registry, activity and rate limit', () => {
  it('stores sites and activity in a small file that holds no cookie, and reloads them', () => {
    const dir = tmp();
    let t = 1000;
    const store = new SitesStore(dir, () => t++);
    const site = store.upsert('linkedin.com', 'https://linkedin.com/');
    expect(site).toMatchObject({ domain: 'linkedin.com', requireApproval: true });
    expect(site.warning).toMatch(/LinkedIn/);
    store.upsert('example.com', 'https://example.com/');
    store.setApproval('example.com', false);
    store.record({
      domain: 'example.com',
      url: 'https://example.com/a/b?token=SECRET#frag',
      by: 'scout s1',
      outcome: 'ok',
    });
    const file = readFileSync(join(dir, 'connected-sites.json'), 'utf8');
    expect(file).not.toContain('SECRET');
    const again = new SitesStore(dir);
    expect(again.list().map((s) => [s.domain, s.requireApproval])).toEqual([
      ['example.com', false],
      ['linkedin.com', true],
    ]);
    expect(again.recent()[0]).toMatchObject({ url: 'https://example.com/a/b', outcome: 'ok' });
    expect(again.siteFor('www.example.com')?.domain).toBe('example.com');
    expect(again.siteFor('other.com')).toBeUndefined();
    expect(again.remove('example.com')).toBe(true);
    expect(new SitesStore(dir).list().map((s) => s.domain)).toEqual(['linkedin.com']);
  });

  it('keeps the last entries only, and survives a corrupt file', () => {
    const dir = tmp();
    const store = new SitesStore(dir);
    for (let i = 0; i < SIGNED_IN.maxActivity + 15; i++)
      store.record({ domain: 'a.com', url: `https://a.com/${i}`, by: 'scout', outcome: 'ok' });
    expect(store.recent()).toHaveLength(SIGNED_IN.maxActivity);
    expect(store.recent()[0]!.url).toBe(`https://a.com/${SIGNED_IN.maxActivity + 14}`);
    writeFileSync(join(dir, 'connected-sites.json'), '{not json');
    expect(new SitesStore(dir).list()).toEqual([]);
  });

  it('allows a burst, then one fetch per refill, per domain', () => {
    let t = 0;
    const limiter = new RateLimiter(() => t, 3, 1000);
    expect([1, 2, 3].map(() => limiter.take('a.com').ok)).toEqual([true, true, true]);
    expect(limiter.take('a.com')).toEqual({ ok: false, retryAfterMs: 1000 });
    expect(limiter.take('b.com').ok).toBe(true);
    t = 500;
    expect(limiter.take('a.com')).toEqual({ ok: false, retryAfterMs: 500 });
    t = 1000;
    expect(limiter.take('a.com').ok).toBe(true);
    expect(limiter.take('a.com').ok).toBe(false);
    limiter.forget('a.com');
    expect(limiter.take('a.com').ok).toBe(true);
  });

  it('shows origin and path only', () => {
    expect(redactUrl('https://x.com/p?q=1#h')).toBe('https://x.com/p');
    expect(redactUrl('nonsense')).toBe('(invalid url)');
  });
});

describe('the fetch window request policy', () => {
  const opts = { proxy: { noProxy: [] as string[], http: 'http://127.0.0.1:9' } };
  const ask = (
    kind: 'login' | 'fetch',
    url: string,
    resourceType = 'xhr',
    method = 'GET',
  ): Promise<string> => decideSitesRequest(kind, 'example.com', { url, method, resourceType }, opts);

  it('a fetch reaches the connected domain and its subdomains, nothing else', async () => {
    expect(await ask('fetch', 'http://example.com/a', 'mainFrame')).toBe('allow');
    expect(await ask('fetch', 'http://www.example.com/a.js', 'script')).toBe('allow');
    expect(await ask('fetch', 'http://cdn.other.com/a.js', 'script')).toBe('cancel');
    expect(await ask('fetch', 'http://cdn.other.com/a.png', 'image')).toBe('cancel');
    expect(await ask('fetch', 'http://evilexample.com/', 'mainFrame')).toBe('cancel');
    expect(await ask('fetch', 'data:text/plain,hi', 'image')).toBe('allow');
  });

  it('a fetch never posts a page or frame, and never reaches a private address', async () => {
    expect(await ask('fetch', 'http://example.com/post', 'mainFrame', 'POST')).toBe('cancel');
    expect(await ask('fetch', 'http://example.com/post', 'subFrame', 'POST')).toBe('cancel');
    expect(await ask('fetch', 'http://example.com/api', 'xhr', 'POST')).toBe('allow');
    expect(await ask('fetch', 'http://127.0.0.1/', 'mainFrame')).toBe('cancel');
    expect(await ask('fetch', 'file:///etc/passwd', 'mainFrame')).toBe('cancel');
  });

  it('the sign-in window may use identity providers, but never a private address', async () => {
    expect(await ask('login', 'http://accounts.idp.com/sso', 'mainFrame', 'POST')).toBe('allow');
    expect(await ask('login', 'http://192.168.1.1/', 'mainFrame')).toBe('cancel');
  });
});

describe('control channel: signed-in route', () => {
  const secret = (s: ControlServer) => s.env[CONTROL_SECRET_ENV]!;
  const post = (port: number, auth: string, body: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/signed-in-fetch',
          headers: { host: `127.0.0.1:${port}`, authorization: auth, 'content-type': 'application/json' },
        },
        (res) => {
          let b = '';
          res.on('data', (c) => (b += c));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }));
        },
      );
      req.on('error', reject);
      req.end(body);
    });

  const answer = {
    info: { domain: 'example.com', url: 'https://example.com/a', title: 'A' },
    html: '<html><head><title>A</title></head><body><article><p>Hello member</p></article></body></html>',
  };

  it('authorizes first, then fetches; the client gets the page and typed errors', async () => {
    const calls: string[] = [];
    server = await startControlServer({
      capture: async () => {
        throw new Error('not used');
      },
      signedIn: {
        authorize: async (req) => {
          calls.push(`authorize ${req.url} by ${req.by}`);
          if (req.url.includes('nope')) throw new ControlError(403, 'DENIED', 'The user said no.');
        },
        fetch: async (req) => {
          calls.push(`fetch ${req.url}`);
          return answer;
        },
      },
    });
    const client = createSignedInClient({ [CONTROL_URL_ENV]: server.url, [CONTROL_SECRET_ENV]: secret(server) });
    expect(client.available).toBe(true);
    const got = await client.fetch({ url: 'https://example.com/a', by: 'scout s1' });
    expect(got).toEqual(answer);
    await expect(client.fetch({ url: 'https://example.com/nope' })).rejects.toMatchObject({
      code: 'DENIED',
      message: 'The user said no.',
    });
    expect(calls).toEqual([
      'authorize https://example.com/a by scout s1',
      'fetch https://example.com/a',
      'authorize https://example.com/nope by undefined',
    ]);
    // The wire never needs a cookie: the request schema has no place for one.
    const bad = await post(server.port, `Bearer ${secret(server)}`, JSON.stringify({ url: 'https://x.com/', cookie: 'a=b' }));
    expect(bad.status).toBe(400);
  });

  it('needs the secret, and says so when the service is not there', async () => {
    server = await startControlServer({
      capture: async () => {
        throw new Error('not used');
      },
    });
    expect((await post(server.port, 'Bearer nope', '{"url":"https://x.com/"}')).status).toBe(401);
    expect((await post(server.port, `Bearer ${secret(server)}`, '{"url":"https://x.com/"}')).status).toBe(503);
    const none = createSignedInClient({});
    expect(none.available).toBe(false);
    await expect(none.fetch({ url: 'https://x.com/' })).rejects.toBeInstanceOf(SourceError);
  });
});
