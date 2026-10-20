import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  createDownloadRequestHandler,
  DOWNLOAD_NOTIFY,
  REQUESTS_PER_EMAIL_PER_HOUR,
  REQUESTS_PER_IP_PER_HOUR,
} from '../server/download-requests.js';
import { SITE_SENDER } from '../server/http.js';
import { RELEASE } from '../shared/release.js';
import { verifyLinkToken } from '../server/download-links.js';

const SECRET = 'test-only-link-secret';

let server: Server;
let base: string;
let key: string | undefined;
const send = vi.fn<typeof fetch>();
beforeEach(async () => {
  key = 'test-only-server-credential';
  send.mockReset().mockImplementation(async () => Response.json({ id: randomUUID() }));
  server = createServer(
    createDownloadRequestHandler({
      getApiKey: () => key,
      getLinkSecret: () => SECRET,
      fetch: send,
      country: () => 'IN',
      now: () => new Date('2026-10-20T07:00:00Z'),
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

function post(body: Record<string, unknown>, init: { origin?: string; type?: string } = {}) {
  return fetch(base, {
    method: 'POST',
    headers: { origin: init.origin ?? base, 'content-type': init.type ?? 'application/json' },
    body: JSON.stringify(body),
  });
}
const request = (email = 'reader@example.com') => ({ requestId: randomUUID(), email, placement: 'hero' });
const mails = () =>
  send.mock.calls.map(([url, init]) => ({
    url: String(url),
    key: new Headers(init!.headers).get('idempotency-key'),
    body: JSON.parse(String(init!.body)),
  }));

describe('website download requests', () => {
  it('emails the visitor the release link and notifies the maintainer with their email', async () => {
    const body = request();
    const response = await post(body);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ requestId: body.requestId });
    const [link, notify] = mails();
    expect(link!.url).toBe('https://api.resend.com/emails');
    expect(link!.key).toBe(`orb-download/${body.requestId}/link`);
    expect(link!.body).toMatchObject({
      from: `orb <${SITE_SENDER}>`,
      to: ['reader@example.com'],
      reply_to: DOWNLOAD_NOTIFY,
      subject: `Your orb ${RELEASE.version} download link`,
    });
    // The email carries a signed, expiring link back to this site, never the installer's own location.
    const url = link!.body.text.match(/(\S+\/api\/download\?token=\S+)/)![1];
    expect(url.startsWith(`${base}/api/download?token=`)).toBe(true);
    const claims = verifyLinkToken(SECRET, new URL(url).searchParams.get('token')!);
    expect(claims).toMatchObject({ email: 'reader@example.com', requestId: body.requestId });
    expect(link!.body.text).not.toContain('github.com/tejassudsfp/orb-releases');
    expect(link!.body.text).toContain('works for 7 days');
    expect(link!.body.text).toContain(RELEASE.sha256);
    expect(link!.body.text).toContain('several minutes or longer');
    expect(link!.body.html).toContain(`href="${url}"`);
    expect(notify!.key).toBe(`orb-download/${body.requestId}/notify`);
    expect(notify!.body).toMatchObject({
      from: `orb downloads <${SITE_SENDER}>`,
      to: [DOWNLOAD_NOTIFY],
      reply_to: 'reader@example.com',
      subject: '[orb download] reader@example.com',
    });
    expect(notify!.body.text).toContain('Email: reader@example.com');
    expect(notify!.body.text).toContain('From: the hero download button');
    expect(notify!.body.text).toContain('Country: IN');
    expect(notify!.body.text).toContain('Time (UTC): 2026-10-20T07:00:00.000Z');
    expect(SITE_SENDER).toBe('orb@email.tejassuds.com');
    expect(DOWNLOAD_NOTIFY).toBe('projects.tejassuds@gmail.com');
  });

  it('rejects invalid input, the bot trap, foreign origins and other content types without sending', async () => {
    expect((await post({ ...request(), email: 'not-an-email' })).status).toBe(422);
    expect((await post({ ...request(), email: 'a@b.co\nBcc: x@y.z' })).status).toBe(422);
    expect((await post({ ...request(), requestId: 'nope' })).status).toBe(422);
    expect((await post({ ...request(), website: 'https://spam.example' })).status).toBe(422);
    expect((await post(request(), { origin: 'https://evil.example' })).status).toBe(403);
    expect((await post(request(), { type: 'text/plain' })).status).toBe(415);
    expect((await fetch(base)).status).toBe(405);
    expect(send).not.toHaveBeenCalled();
  });

  it('records an unknown placement as direct', async () => {
    expect((await post({ ...request(), placement: '<script>' })).status).toBe(201);
    expect(mails()[1]!.body.text).toContain('From: the direct download button');
  });

  it('limits how often a person can request a link per hour, by email and by network', async () => {
    expect(REQUESTS_PER_EMAIL_PER_HOUR).toBe(3);
    expect(REQUESTS_PER_IP_PER_HOUR).toBe(10);
    for (let i = 0; i < 3; i++) expect((await post(request('Same@Example.com'))).status).toBe(201);
    const sameEmail = await post(request('same@example.com'));
    expect(sameEmail.status).toBe(429);
    expect(sameEmail.headers.get('retry-after')).toBe('3600');
    expect((await sameEmail.json()).error).toMatch(/in the last hour/);
    // Other addresses from the same network still work, up to the network's hourly limit.
    for (let i = 0; i < 7; i++) expect((await post(request(`person${i}@example.com`))).status).toBe(201);
    const sameNetwork = await post(request('newcomer@example.com'));
    expect(sameNetwork.status).toBe(429);
    expect((await sameNetwork.json()).error).toMatch(/from this network/);
    expect(send).toHaveBeenCalledTimes(20);
  });

  it('reports a failed link email, but not a failed notification', async () => {
    send.mockImplementationOnce(async () => Response.json({ error: 'down' }, { status: 503 }));
    const failed = await post(request());
    expect(failed.status).toBe(502);
    expect(JSON.stringify(await failed.json())).not.toContain('down');
    send.mockReset();
    send
      .mockImplementationOnce(async () => Response.json({ id: 'sent' }))
      .mockImplementationOnce(async () => Response.json({ error: 'down' }, { status: 503 }));
    expect((await post(request('other@example.com'))).status).toBe(201);
  });

  it('is unavailable without a sending key', async () => {
    key = undefined;
    const response = await post(request());
    expect(response.status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });
});
