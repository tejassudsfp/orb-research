/// <reference lib="dom" />
/**
 * P6.10 signed-in browsing, in the real app. A local site that needs a login cookie (scripts/testkit/mockSite.ts) is
 * reached through the egress proxy as `site.orb.test`. The test:
 *   - connects it through Settings › Connected sites: main opens the VISIBLE login window on `persist:orb-sites`, the
 *     test signs in through that window (types into its form like a user), closes it, and the site is listed;
 *   - has Scout (scripted on the mock LLM) call `fetch_signed_in`: refused by the user's approval prompt (the
 *     prompt, a main-process dialog, is stubbed), then allowed (with "don't ask again"), a long page in chunks
 *     (page 2 from the cache, no second request), an expired session, a missing page, a site that is not connected,
 *     a screenshot, and finally the rate limit;
 *   - checks what the site saw (every member request carried the cookie; the page's third-party script and image
 *     were never requested, the form never posted), what the proxy saw (only the connected domain), that the cookie
 *     value is nowhere in any tool result or in anything stored on disk by the sidecar, and the activity list;
 *   - checks the ToS warning for a listed site, and that Disconnect removes the cookies from the partition.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import {
  MOCK_KEY_ENV,
  MockLlm,
  mockProviderPatch,
  type MockRequest,
  type MockTurn,
} from '../../../scripts/testkit/mockLlm.ts';
import { EgressProxy } from '../../../scripts/egress/proxy.ts';
import { MEMBER_MARKER, MockSite, SESSION_SECRET, SITE_PASSWORD } from '../../../scripts/testkit/mockSite.ts';
import { createCanvas, liveWindow } from './support/ui.ts';

const desktopDir = resolve(import.meta.dirname, '..');
const HOST = 'site.orb.test';

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
let site: MockSite;
let proxy: EgressProxy;

type Who = 'orb' | 'scout';
const scripts: Record<Who, Array<MockTurn | ((req: MockRequest) => MockTurn)>> = { orb: [], scout: [] };
const byAgent: Record<Who, MockRequest[]> = { orb: [], scout: [] };
const textOf = (m: any): string =>
  typeof m?.content === 'string'
    ? m.content
    : Array.isArray(m?.content)
      ? m.content.map((p: any) => p?.text ?? '').join('\n')
      : '';
const whoOf = (req: MockRequest): Who =>
  textOf(req.body.messages[0]).includes('You are Scout') ? 'scout' : 'orb';
const lastTool = (req: MockRequest): string => {
  const messages = req.body.messages as any[];
  for (let i = messages.length - 1; i >= 0 && messages[i].role !== 'assistant'; i--)
    if (messages[i].role === 'tool') return textOf(messages[i]);
  return '';
};
const call = (name: string, args: Record<string, unknown>): MockTurn => ({
  toolCalls: [{ name, arguments: args }],
});

/** Every file under `dir`, read as text where small (for the "the cookie is nowhere on disk" check). */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-signedin-'));
  site = await new MockSite().start();
  proxy = await new EgressProxy({ routes: { [HOST]: { host: '127.0.0.1', port: site.port } } }).start();
  llm = await new MockLlm({
    defaultTurn: (req) => {
      const who = whoOf(req);
      byAgent[who].push(req);
      const next = scripts[who].shift();
      return typeof next === 'function' ? next(req) : (next ?? { text: 'OK.' });
    },
  }).start();
  const patchFile = join(tmp, 'mock.patch.yml');
  writeFileSync(patchFile, mockProviderPatch(llm.baseURL));
  app = await electron.launch({
    args: [desktopDir],
    env: {
      ...process.env,
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_HOME: join(tmp, 'Orb'),
      ORB_USER_DATA: join(tmp, 'electron'),
      ORB_EXTRA_PATCH_FILE: patchFile,
      [MOCK_KEY_ENV]: 'orb-mock-key',
      http_proxy: proxy.url,
      https_proxy: proxy.url,
      HTTP_PROXY: proxy.url,
      HTTPS_PROXY: proxy.url,
      no_proxy: '',
      NO_PROXY: '',
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900);
    await new Promise((r) => setTimeout(r, 300));
  });
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  await proxy?.close();
  await site?.close();
  rmSync(tmp, { recursive: true, force: true });
});

test.describe.configure({ mode: 'serial' });

/** Stub the approval prompt in main: the next prompts answer in order; each prompt's text is recorded. */
async function stubApproval(answers: Array<{ response: number; checkboxChecked?: boolean }>): Promise<void> {
  await app.evaluate(({ dialog }, answers) => {
    const queue = [...answers];
    const g = globalThis as unknown as { __orbPrompts?: Array<{ message: string; detail: string }> };
    g.__orbPrompts = [];
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const opts = (args.length > 1 ? args[1] : args[0]) as { message: string; detail: string };
      g.__orbPrompts!.push({ message: opts.message, detail: opts.detail });
      return { checkboxChecked: false, ...(queue.shift() ?? { response: 1 }) };
    }) as typeof dialog.showMessageBox;
  }, answers);
}

test('Settings: a listed site shows the ToS warning first, and nothing opens until it is accepted', async () => {
  await page.evaluate(() => (location.hash = '#/settings'));
  await expect(page.getByTestId('settings-sites')).toBeVisible();
  await expect(page.getByTestId('sites-empty')).toBeVisible();
  await page.getByTestId('site-input').fill('www.linkedin.com');
  const windows = app.windows().length;
  await page.getByTestId('site-connect').click();
  await expect(page.getByTestId('site-tos')).toContainText('LinkedIn');
  await expect(page.getByTestId('site-connect')).toHaveText('Connect anyway');
  expect(app.windows().length).toBe(windows);
  // A bad address is refused with a reason.
  await page.getByTestId('site-input').fill('localhost');
  await page.getByTestId('site-connect').click();
  await expect(page.getByTestId('site-error')).toContainText('public site name');
  await page.getByTestId('site-input').fill('');
});

test('connect through the visible login window; the cookie stays in main', async () => {
  await page.getByTestId('site-input').fill(`http://${HOST}/login`);
  const opened = app.waitForEvent('window');
  await page.getByTestId('site-connect').click();
  await expect(page.getByTestId('site-waiting')).toBeVisible();
  const login = await opened;
  await login.waitForLoadState('domcontentloaded');
  expect(await login.evaluate(() => [typeof (window as any).orbNative, typeof require].join(','))).toBe(
    'undefined,undefined',
  );
  // Sign in like a user: a wrong password first, then the right one.
  await login.fill('#user', 'tejas');
  await login.fill('#pass', 'wrong');
  await login.click('#submit');
  await expect(login.locator('#err')).toHaveText('Wrong password.');
  await login.fill('#user', 'tejas');
  await login.fill('#pass', SITE_PASSWORD);
  await login.click('#submit');
  await login.waitForURL(`http://${HOST}/members/`);
  await expect(login.locator('article h1')).toHaveText('Member report');
  await login.close();
  await expect(page.getByTestId('site-note')).toHaveText(`${HOST} is connected.`);
  await expect(page.getByTestId('site-row')).toHaveAttribute('data-domain', HOST);
  await expect(page.getByTestId('site-approval')).toBeChecked();
  // The page itself can read no cookie: not through orbNative (only the list), not through document.cookie of the app.
  const cookies = await app.evaluate(async ({ session }) =>
    (await session.fromPartition('persist:orb-sites').cookies.get({})).map((c) => c.name),
  );
  expect(cookies).toEqual(['orb_session']);
  expect(await page.evaluate(() => JSON.stringify(Object.keys((window as any).orbNative.sites)))).not.toContain(
    'cookie',
  );
});

test('fetch_signed_in: approval, text and chunks, errors, screenshot, rate limit; egress is the connected domain only', async () => {
  test.setTimeout(240_000);
  // The sign-in window is the user's own visible browser (it may load the site's third parties); only the agent's
  // fetches are judged below.
  proxy.hits.length = 0;
  site.hits.length = 0;
  await page.evaluate(() => (location.hash = '#/'));
  const { canvasId } = await createCanvas(page, 'Read my member portal');
  await stubApproval([{ response: 1 }, { response: 0, checkboxChecked: true }]);
  const url = (path: string) => `http://${HOST}${path}`;
  scripts.orb.push(
    call('add_frame', { title: 'Portal' }),
    (req) =>
      call('delegate', {
        role: 'scout',
        frameIds: [JSON.parse(lastTool(req)).frameId],
        instruction: 'Read the member pages.',
      }),
    { text: 'Scout is reading.' },
  );
  let burst = 0;
  scripts.scout.push(
    call('fetch_signed_in', { url: url('/members/') }), // 0: the user says no
    call('fetch_signed_in', { url: url('/members/') }), // 1: yes, and "don't ask again"
    call('fetch_signed_in', { url: url('/members/long') }), // 2: no prompt any more
    call('fetch_signed_in', { url: url('/members/long'), page: 2 }), // 3: from the cache
    call('fetch_signed_in', { url: url('/members/expired') }), // 4
    call('fetch_signed_in', { url: url('/members/gone') }), // 5
    call('fetch_signed_in', { url: 'http://other.orb.test/x' }), // 6: not connected
    call('fetch_signed_in', { url: url('/members/'), screenshot: true }), // 7
    () => call('fetch_signed_in', { url: url(`/members/long?n=${burst++}`) }), // 8…: until refused for speed
    ...Array.from({ length: 14 }, () => (req: MockRequest) =>
      /Too many signed-in fetches/.test(lastTool(req))
        ? { text: 'Done.' }
        : call('fetch_signed_in', { url: url(`/members/long?n=${burst++}`) }),
    ),
    { text: 'Done.' },
  );
  await page.getByTestId('orb-chat-input').fill('Read the portal pages.');
  await page.getByTestId('orb-chat-send').click();

  // Wait for the whole script (the first three Scout requests precede each result).
  await expect.poll(() => byAgent.scout.length, { timeout: 200_000 }).toBeGreaterThanOrEqual(10);
  const result = (n: number) => lastTool(byAgent.scout[n]!);

  // 0: the prompt named Scout and the page (path, no query), and the user's "no" came back as a refusal.
  expect(result(1)).toMatch(/did not allow reading site\.orb\.test/);
  const prompts = await app.evaluate(
    () => (globalThis as unknown as { __orbPrompts: Array<{ message: string; detail: string }> }).__orbPrompts,
  );
  expect(prompts.length).toBe(2);
  expect(prompts[0]!.message).toContain('scout');
  expect(prompts[0]!.message).toContain(HOST);
  expect(prompts[0]!.detail).toContain(`http://${HOST}/members/`);

  // 1: the member page's text (Readability + turndown), with the metadata line first.
  const member = result(2);
  expect(member).toContain(MEMBER_MARKER);
  expect(JSON.parse(member.split('\n\n')[0]!)).toMatchObject({
    signedIn: true,
    domain: HOST,
    title: 'Member report',
    page: 1,
    pages: 1,
    cached: false,
  });
  // "Don't ask again": no prompt for the next fetches.
  expect(
    await app.evaluate(
      () => (globalThis as unknown as { __orbPrompts: unknown[] }).__orbPrompts.length,
    ),
  ).toBe(2);
  await page.evaluate(() => (location.hash = '#/settings'));
  await expect(page.getByTestId('site-approval')).not.toBeChecked();

  // 2/3: a long page in chunks, page 2 from the cache with no second request.
  const long1 = JSON.parse(result(3).split('\n\n')[0]!);
  expect(long1).toMatchObject({ page: 1, signedIn: true });
  expect(long1.pages).toBeGreaterThanOrEqual(3);
  const long2 = JSON.parse(result(4).split('\n\n')[0]!);
  expect(long2).toMatchObject({ page: 2, cached: true });
  expect(site.hits.filter((h) => h.path === '/members/long')).toHaveLength(1);

  // 4/5/6: expired session, a missing page, a site that is not connected.
  expect(result(5)).toMatch(/asked for a sign-in; the connection may have expired/);
  expect(result(6)).toMatch(/answered HTTP 404/);
  expect(result(7)).toMatch(/other\.orb\.test is not a connected site/);

  // 7: the screenshot is a PNG in assets/ of the canvas.
  const shot = JSON.parse(result(8).split('\n\n')[0]!).screenshot as { asset: string; width: number; height: number };
  expect(shot.asset).toMatch(/^assets\/[0-9a-z]+-signed-in-site-orb-test\.png$/);
  const file = join(tmp, 'Orb', 'canvases', canvasId, shot.asset);
  expect(existsSync(file)).toBe(true);
  const png = PNG.sync.read(readFileSync(file));
  expect([png.width, png.height]).toEqual([shot.width, shot.height]);

  // The rate limit stopped the burst, with a retry hint (and did not call the site again for it).
  await expect
    .poll(() => byAgent.scout.some((r) => /Too many signed-in fetches for site\.orb\.test; try again in \d+ s/.test(lastTool(r))))
    .toBe(true);

  // What the site saw: every member request had the cookie, the login-bounce never happened, no form was posted, and
  // the third-party script and image the page references were never requested.
  const memberHits = site.hits.filter((h) => h.path.startsWith('/members/'));
  expect(memberHits.length).toBeGreaterThanOrEqual(5);
  expect(memberHits.every((h) => h.cookie)).toBe(true);
  expect(site.hits.some((h) => h.method === 'POST' && h.path.startsWith('/members/'))).toBe(false);
  // What the proxy saw: the connected domain and nothing else (no cdn.orb.test, no other.orb.test).
  expect([...new Set(proxy.hits.map((h) => h.host))]).toEqual([HOST]);
  expect(proxy.hits.every((h) => h.decision === 'routed')).toBe(true);

  // The cookie value is in no tool result the model saw, and in nothing the sidecar stored.
  const everything = JSON.stringify([...byAgent.orb, ...byAgent.scout].map((r) => r.body));
  expect(everything).not.toContain(SESSION_SECRET);
  for (const root of [join(tmp, 'Orb'), join(tmp, 'dsh')]) {
    for (const f of filesUnder(root)) {
      if (statSync(f).size > 5_000_000) continue;
      expect(readFileSync(f).includes(SESSION_SECRET), `${f} holds the session cookie`).toBe(false);
      expect(readFileSync(f).includes(SITE_PASSWORD), `${f} holds the password`).toBe(false);
    }
  }
});

test('Settings lists every fetch, and Disconnect removes the sign-in', async () => {
  await page.evaluate(() => (location.hash = '#/settings'));
  const rows = page.getByTestId('site-activity-row');
  await expect(rows.first()).toBeVisible();
  const outcomes = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-outcome')));
  expect(outcomes).toContain('ok');
  expect(outcomes).toContain('denied');
  expect(outcomes).toContain('error');
  expect(outcomes).toContain('rate-limited');
  // The activity shows origin and path only (no query string).
  const text = await page.getByTestId('site-activity').innerText();
  expect(text).toContain(`http://${HOST}/members/long`);
  expect(text).not.toContain('?n=');

  await page.getByTestId('site-disconnect').click();
  await expect(page.getByTestId('sites-empty')).toBeVisible();
  const cookies = await app.evaluate(async ({ session }) =>
    (await session.fromPartition('persist:orb-sites').cookies.get({})).length,
  );
  expect(cookies).toBe(0);
});
