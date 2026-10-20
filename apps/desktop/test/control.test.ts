/**
 * P3.5: the main ↔ sidecar control channel (loopback, per-launch secret, no browser callers) and the capture
 * window's request policy. The capture itself is faked here; apps/desktop/e2e/capture.spec.ts runs the real one.
 */
import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTROL_SECRET_ENV, CONTROL_URL_ENV } from '@orb/shared';
import { createCaptureClient, createBrowserClient } from '@orb/sources';
import { ControlError, startControlServer, type ControlServer } from '../src/main/control.ts';
import {
  checkCaptureUrl,
  decideCaptureRequest,
  isProxied,
  proxyFromEnv,
  proxyRules,
} from '../src/main/captureFilter.ts';
import { makePng } from '../../../scripts/testkit/fixtures.ts';

let server: ControlServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const png = makePng(40, 30);
const info = { url: 'https://example.com/', title: 'Example', width: 40, height: 30, cut: false };

type Raw = { status: number; headers: Record<string, unknown>; body: Buffer };
function raw(
  port: number,
  opts: { method?: string; path?: string; headers?: Record<string, string>; body?: string },
): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: opts.method ?? 'POST',
        path: opts.path ?? '/capture',
        headers: opts.headers ?? {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on('error', reject);
    req.end(opts.body);
  });
}

describe('control channel', () => {
  it('serves only structured browser reads/searches to the authenticated sidecar and refuses scripts or browser callers', async () => {
    const seen: unknown[] = [];
    server = await startControlServer({
      capture: async () => ({ png, info }),
      checkUrl: checkCaptureUrl,
      browse: async (input) => {
        seen.push(input);
        return input.action === 'read'
          ? {
              action: 'read',
              url: input.url,
              title: 'Rendered evidence',
              html: '<article>Evidence</article>',
              truncated: false,
            }
          : {
              action: 'search',
              query: input.query,
              engine: 'Bing',
              results: [{ url: 'https://example.com/', title: 'Evidence', snippet: 'Findings' }],
            };
      },
    });
    const client = createBrowserClient(server.env);
    expect((await client.search('Public research', 4)).results[0]!.title).toBe('Evidence');
    expect((await client.read('https://example.com/')).html).toContain('Evidence');
    await expect(client.read('http://127.0.0.1/')).rejects.toMatchObject({ code: 'BLOCKED_URL' });
    const headers = {
      host: `127.0.0.1:${server.port}`,
      authorization: `Bearer ${server.env[CONTROL_SECRET_ENV]}`,
      'content-type': 'application/json',
    };
    expect(
      (
        await raw(server.port, {
          path: '/browse',
          headers,
          body: JSON.stringify({ action: 'read', url: 'https://example.com/', script: 'process.env' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await raw(server.port, {
          path: '/browse',
          headers: { ...headers, origin: 'https://example.com' },
          body: JSON.stringify({ action: 'search', query: 'x' }),
        })
      ).status,
    ).toBe(403);
    expect(seen).toHaveLength(2);
    expect(createBrowserClient({}).available).toBe(false);
  });
  it('opens only official ChatGPT authorization URLs for the authenticated sidecar', async () => {
    const opened: string[] = [];
    server = await startControlServer({
      capture: async () => ({ png, info }),
      openChatGPT: async (url) => {
        opened.push(new URL(url).origin);
      },
    });
    const headers = {
      host: `127.0.0.1:${server.port}`,
      authorization: `Bearer ${server.env[CONTROL_SECRET_ENV]}`,
      'content-type': 'application/json',
    };
    const send = (url: string, extra: Record<string, string> = {}) =>
      raw(server!.port, {
        path: '/chatgpt/open',
        headers: { ...headers, ...extra },
        body: JSON.stringify({ url }),
      });
    const valid = `https://auth.openai.com/api/accounts/authorize?redirect_uri=${encodeURIComponent('http://127.0.0.1:12345/auth/callback')}`;
    expect((await send(valid)).status).toBe(204);
    expect((await send(valid, { origin: 'https://example.com' })).status).toBe(403);
    expect((await send(valid, { authorization: 'Bearer wrong' })).status).toBe(401);
    for (const url of [
      valid.replace('auth.openai.com', 'example.com'),
      valid.replace('/authorize?', '/oauth/token?'),
      valid.replace('127.0.0.1', 'localhost'),
      valid.replace('127.0.0.1', '192.168.1.1'),
      'file:///etc/passwd',
    ])
      expect((await send(url)).status).toBe(400);
    expect(opened).toEqual(['https://auth.openai.com']);
  });
  it('serves captures to the sidecar client with the per-launch secret', async () => {
    const seen: string[] = [];
    server = await startControlServer({
      capture: async (url) => {
        seen.push(url);
        return { png, info };
      },
    });
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(server.env[CONTROL_SECRET_ENV]).toMatch(/^[0-9a-f]{64}$/);
    const client = createCaptureClient({ ...server.env });
    expect(client.available).toBe(true);
    const out = await client.capture('https://example.com/');
    expect(out.png.equals(png)).toBe(true);
    expect(out.info).toEqual(info);
    expect(seen).toEqual(['https://example.com/']);
    // A second launch has another secret.
    const other = await startControlServer({ capture: async () => ({ png, info }) });
    expect(other.env[CONTROL_SECRET_ENV]).not.toBe(server.env[CONTROL_SECRET_ENV]);
    await other.close();
  });

  it('refuses a wrong secret, a browser, a foreign Host, other routes and bad bodies', async () => {
    let calls = 0;
    server = await startControlServer({
      capture: async () => {
        calls++;
        return { png, info };
      },
    });
    const secret = server.env[CONTROL_SECRET_ENV]!;
    const ok = {
      host: `127.0.0.1:${server.port}`,
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    };
    const body = JSON.stringify({ url: 'https://example.com/' });
    const code = async (
      h: Record<string, string>,
      extra: { method?: string; path?: string; body?: string } = {},
    ) => {
      const r = await raw(server!.port, { headers: h, body, ...extra });
      return [
        r.status,
        r.headers['content-type'] === 'application/json'
          ? JSON.parse(r.body.toString()).error?.code
          : undefined,
      ];
    };
    expect(await code({ ...ok, authorization: 'Bearer nope' })).toEqual([401, 'UNAUTHORIZED']);
    // Change the last hex digit (a fixed '0' would equal the real secret 1 time in 16).
    const wrong = `${secret.slice(0, -1)}${secret.endsWith('0') ? '1' : '0'}`;
    expect(await code({ ...ok, authorization: `Bearer ${wrong}` })).toEqual([401, 'UNAUTHORIZED']);
    expect(await code({ host: ok.host, 'content-type': ok['content-type'] })).toEqual([401, 'UNAUTHORIZED']);
    expect(await code({ ...ok, origin: 'http://evil.example' })).toEqual([403, 'FORBIDDEN']);
    expect(await code({ ...ok, 'sec-fetch-site': 'cross-site' })).toEqual([403, 'FORBIDDEN']);
    expect(await code({ ...ok, host: `evil.example:${server.port}` })).toEqual([403, 'FORBIDDEN']);
    expect(await code({ ...ok, host: `localhost:${server.port}` })).toEqual([403, 'FORBIDDEN']);
    expect(await code(ok, { path: '/other' })).toEqual([404, 'NOT_FOUND']);
    expect(await code(ok, { method: 'GET', body: '' })).toEqual([404, 'NOT_FOUND']);
    expect(await code({ ...ok, 'content-type': 'text/plain' })).toEqual([415, 'UNSUPPORTED']);
    expect(await code(ok, { body: '{"url": 1}' })).toEqual([400, 'INVALID_URL']);
    expect(await code(ok, { body: JSON.stringify({ url: 'x'.repeat(9000) }) })).toEqual([413, 'TOO_LARGE']);
    expect(calls).toBe(0);
    expect(await code(ok)).toEqual([200, undefined]);
    expect(calls).toBe(1);
  });

  it('passes URL refusals and capture failures back as codes; one capture at a time', async () => {
    let running = 0;
    let maxRunning = 0;
    server = await startControlServer({
      checkUrl: (url) => {
        if (url.includes('127.0.0.1')) throw new ControlError(403, 'BLOCKED_URL', 'private address');
      },
      capture: async (url) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 30));
        running--;
        if (url.includes('fail')) throw new Error('boom');
        return { png, info };
      },
    });
    const client = createCaptureClient({ ...server.env });
    await expect(client.capture('http://127.0.0.1/')).rejects.toMatchObject({
      code: 'BLOCKED_URL',
      message: 'private address',
    });
    await expect(client.capture('https://fail.example/')).rejects.toMatchObject({ code: 'CAPTURE_FAILED' });
    await Promise.all([
      client.capture('https://a.example/'),
      client.capture('https://b.example/'),
      client.capture('https://c.example/'),
    ]);
    expect(maxRunning).toBe(1);
  });

  it('a sidecar without the channel says capture is unavailable', async () => {
    expect(createCaptureClient({}).available).toBe(false);
    expect(
      createCaptureClient({
        [CONTROL_URL_ENV]: 'http://example.com:80',
        [CONTROL_SECRET_ENV]: 'a'.repeat(64),
      }).available,
    ).toBe(false);
    await expect(createCaptureClient({}).capture('https://example.com/')).rejects.toMatchObject({
      code: 'CAPTURE_UNAVAILABLE',
    });
  });
});

describe('capture window request policy', () => {
  const resolver = async (host: string) =>
    host === 'public.test'
      ? [{ address: '93.184.216.34', family: 4 }]
      : host === 'rebind.test'
        ? [{ address: '10.0.0.1', family: 4 }]
        : [];
  const direct = { proxy: { noProxy: [] }, resolver };

  it('allows public hosts and local schemes, refuses private, local and odd schemes', async () => {
    expect(await decideCaptureRequest('https://public.test/a.js', direct)).toBe('allow');
    expect(await decideCaptureRequest('data:image/png;base64,AAAA', direct)).toBe('allow');
    expect(await decideCaptureRequest('about:blank', direct)).toBe('allow');
    for (const url of [
      'https://rebind.test/',
      'http://127.0.0.1:5173/api/orb/ping',
      'http://localhost:3000/',
      'http://[::1]/',
      'http://169.254.169.254/latest/meta-data/',
      'ws://10.0.0.2/socket',
      'file:///etc/passwd',
      'chrome://settings',
      'devtools://devtools/bundled/inspector.html',
      'https://user:pw@public.test/',
      'https://unknown.test/',
    ])
      expect(await decideCaptureRequest(url, direct), url).toBe('cancel');
  });

  it('with a proxy, names go to the proxy but literals and local names are still refused', async () => {
    const proxy = proxyFromEnv({
      HTTPS_PROXY: 'http://127.0.0.1:8888',
      http_proxy: 'http://127.0.0.1:8888',
      NO_PROXY: '.corp.example',
    });
    expect(proxyRules(proxy)).toBe('http=127.0.0.1:8888;https=127.0.0.1:8888');
    expect(isProxied(new URL('https://site.orb.test/'), proxy)).toBe(true);
    expect(isProxied(new URL('https://intra.corp.example/'), proxy)).toBe(false);
    const opts = { proxy, resolver };
    expect(await decideCaptureRequest('https://unknown.test/', opts)).toBe('allow');
    expect(await decideCaptureRequest('http://127.0.0.1/', opts)).toBe('cancel');
    expect(await decideCaptureRequest('http://localhost/', opts)).toBe('cancel');
    expect(proxyRules(proxyFromEnv({ ALL_PROXY: 'socks5://127.0.0.1:1080' }))).toBe('');
  });

  it('main refuses private capture URLs outright', () => {
    expect(() => checkCaptureUrl('http://127.0.0.1/')).toThrow(
      expect.objectContaining({ status: 403, code: 'BLOCKED_URL' }),
    );
    expect(() => checkCaptureUrl('file:///x')).toThrow(
      expect.objectContaining({ status: 400, code: 'INVALID_URL' }),
    );
    expect(() => checkCaptureUrl('https://example.com/')).not.toThrow();
  });
});
