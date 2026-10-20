import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createDownloadFileHandler } from '../server/download-file.js';
import { createLinkToken, LINK_TTL_MS, verifyLinkToken } from '../server/download-links.js';
import { RELEASE } from '../shared/release.js';

const SECRET = 'test-only-link-secret';
const SIGNED = 'https://release-assets.githubusercontent.com/github-production-release-asset/signed?sig=abc';
const ASSET_API = 'https://api.github.com/repos/tejassudsfp/orb-releases/releases/assets/42';
let server: Server;
let base: string;
const calls = vi.fn<typeof fetch>();
beforeEach(async () => {
  calls.mockReset().mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === 'https://api.resend.com/emails') return Response.json({ id: 'sent' });
    if (url.endsWith(`/releases/tags/${RELEASE.tag}`))
      return Response.json({ assets: [{ name: 'other.tar', url: 'x' }, { name: RELEASE.asset, url: ASSET_API }] });
    if (url === ASSET_API) {
      expect(new Headers(init!.headers).get('accept')).toBe('application/octet-stream');
      expect(init!.redirect).toBe('manual');
      return new Response(null, { status: 302, headers: { location: SIGNED } });
    }
    return new Response('unexpected', { status: 500 });
  });
  server = createServer(
    createDownloadFileHandler({
      getApiKey: () => 'test-only-server-credential',
      getLinkSecret: () => SECRET,
      getGithubToken: () => 'test-only-github-token',
      fetch: calls,
      country: () => 'IN',
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
const get = (token: string) => fetch(`${base}/api/download?token=${token}`, { redirect: 'manual' });
const resend = () => calls.mock.calls.filter(([url]) => String(url) === 'https://api.resend.com/emails');

describe('download link tokens', () => {
  it('round-trip, and reject tampering, another secret and expiry', () => {
    const now = Date.UTC(2026, 9, 20);
    const token = createLinkToken(SECRET, { email: 'reader@example.com', requestId: 'r1' }, now);
    expect(verifyLinkToken(SECRET, token, now)).toEqual({
      email: 'reader@example.com',
      requestId: 'r1',
      expires: now + LINK_TTL_MS,
    });
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ e: 'x@y.z', r: 'r1', x: now + LINK_TTL_MS })).toString('base64url');
    expect(verifyLinkToken(SECRET, `${forged}.${signature}`, now)).toBeUndefined();
    expect(verifyLinkToken('another-secret', token, now)).toBeUndefined();
    expect(verifyLinkToken(SECRET, `${payload}.${signature}.extra`, now)).toBeUndefined();
    expect(verifyLinkToken(SECRET, token, now + LINK_TTL_MS)).toBeUndefined();
  });
});

describe('/api/download', () => {
  it('redirects a valid link to the short-lived asset URL and tells the maintainer who downloaded', async () => {
    const token = createLinkToken(SECRET, { email: 'reader@example.com', requestId: 'r1' });
    const response = await get(token);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(SIGNED);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [, init] = resend()[0]!;
    const mail = JSON.parse(String(init!.body));
    expect(mail).toMatchObject({
      to: ['projects.tejassuds@gmail.com'],
      reply_to: 'reader@example.com',
      subject: '[orb downloaded] reader@example.com',
    });
    expect(mail.text).toContain('Country: IN');
    expect(new Headers(init!.headers).get('idempotency-key')).toBe('orb-download/r1/downloaded');
    // The release lookup is cached; a second click only asks GitHub for a fresh signed URL.
    await get(token);
    expect(calls.mock.calls.filter(([url]) => String(url).includes('/releases/tags/'))).toHaveLength(1);
  });

  it('sends invalid or expired links back to the form without touching GitHub or email', async () => {
    const expired = createLinkToken(SECRET, { email: 'reader@example.com', requestId: 'r1' }, Date.now() - LINK_TTL_MS);
    for (const token of ['', 'forged', expired]) {
      const response = await get(token);
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/download?expired=1');
    }
    expect(calls).not.toHaveBeenCalled();
  });

  it('reports the download as unavailable when GitHub cannot provide the asset', async () => {
    calls.mockImplementation(async () => new Response('nope', { status: 404 }));
    const response = await get(createLinkToken(SECRET, { email: 'reader@example.com', requestId: 'r2' }));
    expect(response.headers.get('location')).toBe('/download?unavailable=1');
    expect(resend()).toHaveLength(0);
  });
});
