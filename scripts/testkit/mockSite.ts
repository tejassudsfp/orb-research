/**
 * A local site that needs a login cookie (P6.10 signed-in browsing tests). Reached the way a real site is: through
 * the egress proxy under a `.test` name (routes), because Orb refuses loopback targets.
 *
 * - `GET /login`: a real HTML form (`user`, `pass`); `POST /login` with the right password sets `orb_session`
 *   (HttpOnly, 1 day) and redirects to `/members/`; a wrong one re-shows the form with status 401.
 * - `/members/*`: 200 with the member page when the cookie is present; without it, 302 to `/login?next=…`.
 * - `/members/expired`: always answers 401 (an expired session), `/members/gone`: 404.
 * - `/members/long`: a page of ~30,000 characters of text (several 8k chunks).
 * - The member page embeds a script and an image from OTHER hosts and a form posting to `/members/post`; a
 *   read-only fetch must load neither the script nor submit the form (the log shows what was asked).
 * - `/public`: no cookie needed.
 *
 * `hits` records every request: method, path, whether the session cookie came with it. The cookie VALUE is the
 * test secret `SESSION_SECRET`; tests assert it never appears in tool output, logs or the board.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const SESSION_SECRET = 'sess-7f3a91c2d4b84e0f';
export const SITE_PASSWORD = 'hunter2-orb-test';
export const MEMBER_MARKER = 'Quarterly pipeline: 42 qualified accounts';

export type SiteHit = { method: string; path: string; cookie: boolean };

export class MockSite {
  readonly hits: SiteHit[] = [];
  private server?: Server;

  get port(): number {
    return (this.server!.address() as AddressInfo).port;
  }

  async start(): Promise<this> {
    this.server = createServer((req, res) => this.handle(req, res));
    await new Promise<void>((r) => this.server!.listen(0, '127.0.0.1', r));
    return this;
  }

  async close(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://x');
    const cookie = (req.headers.cookie ?? '').includes(`orb_session=${SESSION_SECRET}`);
    const path = url.pathname;
    this.hits.push({ method: req.method ?? 'GET', path: path + url.search, cookie });
    const html = (status: number, body: string, headers: Record<string, string> = {}): void => {
      res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers }).end(body);
    };

    if (path === '/login' && req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const form = new URLSearchParams(raw);
        if (form.get('pass') === SITE_PASSWORD)
          return void res
            .writeHead(302, {
              location: '/members/',
              'set-cookie': `orb_session=${SESSION_SECRET}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`,
            })
            .end();
        html(401, loginPage('Wrong password.'));
      });
      return;
    }
    if (path === '/login') return html(200, loginPage());
    if (path === '/public') return html(200, page('Public page', '<p>Anyone can read this.</p>'));
    if (path === '/members/expired') return html(401, page('Expired', '<p>Session expired.</p>'));
    if (!path.startsWith('/members/')) return html(404, page('Not found', '<p>No such page.</p>'));
    if (!cookie) return void res.writeHead(302, { location: `/login?next=${encodeURIComponent(path)}` }).end();
    if (path === '/members/gone') return html(404, page('Gone', '<p>Gone.</p>'));
    if (path === '/members/long') {
      const para = (i: number) =>
        `<p>Paragraph ${i}: ${'The signed-in report discusses retention, pricing and pipeline coverage in detail. '.repeat(5)}</p>`;
      return html(200, page('Long report', Array.from({ length: 80 }, (_, i) => para(i + 1)).join('\n')));
    }
    return html(
      200,
      page(
        'Member report',
        `<article><h1>Member report</h1><p>${MEMBER_MARKER}.</p><p>Only signed-in members see this.</p></article>
<img src="http://cdn.orb.test/pixel.png" width="1" height="1" alt="">
<script src="http://cdn.orb.test/tracker.js"></script>
<form method="post" action="/members/post"><button id="go">Delete everything</button></form>
<script>document.getElementById('go').form.addEventListener('submit', () => {});</script>`,
      ),
    );
  }
}

const page = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

const loginPage = (error = '') =>
  page(
    'Sign in',
    `<main><h1>Sign in</h1>${error ? `<p id="err">${error}</p>` : ''}<form method="post" action="/login">
<label>User <input name="user" id="user"></label><label>Password <input name="pass" id="pass" type="password"></label>
<button type="submit" id="submit">Sign in</button></form></main>`,
  );
