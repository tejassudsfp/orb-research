import { test, expect, type Request } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';

const consentKey = 'orb-site-analytics-v1';
const requests: Request[] = [];
// Exercise a normal visitor: the SDK deliberately discards webdriver/headless bot events.
test.use({
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
});
test.beforeEach(async ({ page }) => {
  requests.length = 0;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
  });
  await page.route('https://*.posthog.com/**', async (route) => {
    requests.push(route.request());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
      body: '{}',
    });
  });
});

function events() {
  return requests.filter((request) => request.method() === 'POST' && /\/e\//.test(request.url()));
}
function body(request: Request) {
  let bytes = request.postDataBuffer()!;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
  return bytes.toString('utf8');
}

test('no analytics before consent or after declining; the choice survives reload', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.locator('#cookie-notice')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-analytics', 'pending');
  expect(requests).toHaveLength(0);
  expect((await context.cookies()).filter((cookie) => cookie.name.startsWith('ph_'))).toEqual([]);
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), consentKey)).toBe('declined');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-analytics', 'declined');
  await expect(page.locator('#cookie-notice')).toBeHidden();
  await page.getByRole('button', { name: 'Cookie settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Decline', exact: true })).toBeFocused();
  await expect(page.locator('#cookie-status')).toHaveText('Analytics cookies are off.');
  expect(requests).toHaveLength(0);
});

test('acceptance sends a clean page view and sets cookies; withdrawal removes analytics persistence', async ({
  page,
  context,
}) => {
  await page.goto('/?private_query=do-not-capture#private-anchor');
  await page.getByRole('button', { name: 'Accept cookies', exact: true }).click();
  try {
    await expect.poll(() => events().length).toBe(1);
  } catch (error) {
    throw new Error(
      JSON.stringify({
        requests: requests.map((request) => `${request.method()} ${new URL(request.url()).pathname}`),
        status: await page.locator('#cookie-status').textContent(),
      }),
      { cause: error },
    );
  }
  const payload = body(events()[0]!);
  expect(payload).toContain('$pageview');
  expect(payload).not.toContain('do-not-capture');
  expect(payload).not.toContain('private-anchor');
  expect((await context.cookies()).some((cookie) => cookie.name.startsWith('ph_'))).toBe(true);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-analytics', 'accepted');
  await expect.poll(() => events().length).toBe(2);
  await page.getByRole('button', { name: 'Cookie settings', exact: true }).click();
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  expect((await context.cookies()).filter((cookie) => cookie.name.startsWith('ph_'))).toEqual([]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-analytics', 'declined');
  expect(events()).toHaveLength(2);
  await page.getByRole('button', { name: 'Cookie settings', exact: true }).click();
  await page.getByRole('button', { name: 'Accept cookies', exact: true }).click();
  await expect.poll(() => events().length).toBe(3);
});

test('cookie notice fits narrow screens and remains accessible in light and dark modes', async ({ page }) => {
  await page.goto('/');
  const captures = resolve('.orb-dev/site-cookies');
  mkdirSync(captures, { recursive: true });
  for (const mode of ['light', 'dark']) {
    await page.getByLabel('Brightness', { exact: true }).selectOption(mode);
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole('button', { name: 'Accept cookies', exact: true })).toBeInViewport();
      await page.evaluate(axe.source);
      const violations = await page.evaluate(
        async () =>
          (
            await (window as any).axe.run(document, {
              runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
            })
          ).violations,
      );
      expect(violations.map((violation: any) => violation.id)).toEqual([]);
      await page.screenshot({ path: resolve(captures, `cookies-${mode}-${width}.png`) });
    }
  }
  expect(requests).toHaveLength(0);
});

test('blocked preference storage still permits a decline without loading analytics', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Storage disabled');
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-analytics', 'declined');
  await expect(page.locator('#cookie-notice')).toBeHidden();
  expect(requests).toHaveLength(0);
});

test('download buttons lead to the email form; requests send the link and are tracked only after consent', async ({
  page,
  request,
}) => {
  await request.post('/__test/reset');
  const tracked = (name: string) => events().filter((item) => body(item).includes(name));

  await page.goto('/');
  const links = page.locator('a[data-download]');
  await expect(links).toHaveCount(3);
  for (const link of await links.all())
    await expect(link).toHaveAttribute('href', `/download?from=${await link.getAttribute('data-download')}`);
  expect(await page.locator('a[href*="releases/download"]').count()).toBe(0);

  // Declined: the form still works, and nothing is sent to analytics.
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  await page.locator('a[data-download="hero"]').click();
  await page.waitForURL('**/download?from=hero');
  await page.getByRole('button', { name: 'Email me the link' }).click();
  await expect(page.locator('#download-error')).toHaveText(/Enter your email/);
  await page.getByLabel('Email').fill('reader@example.com');
  await page.getByRole('button', { name: 'Email me the link' }).click();
  await expect(page.getByRole('heading', { name: 'Your link is on its way.' })).toBeVisible();
  await expect(page.locator('#download-sent-to')).toHaveText('reader@example.com');
  const mail = (await (await request.get('/__test/mail')).json()) as Array<{ payload: { to: string[]; text: string } }>;
  expect(mail.map((item) => item.payload.to[0])).toEqual(['reader@example.com', 'projects.tejassuds@gmail.com']);
  expect(mail[0]!.payload.text).toMatch(/\/api\/download\?token=[\w-]+\.[\w-]+/);
  expect(mail[1]!.payload.text).toContain('From: the hero download button');
  expect(events()).toHaveLength(0);

  // Accepted: the click and the request are recorded with version and placement, never the email.
  await page.goto('/');
  await page.getByRole('button', { name: 'Cookie settings', exact: true }).click();
  await page.getByRole('button', { name: 'Accept cookies', exact: true }).click();
  await expect.poll(() => events().length).toBeGreaterThan(0);
  await page.locator('a[data-download="closing"]').click();
  await page.waitForURL('**/download?from=closing');
  await expect.poll(() => tracked('download_clicked').length).toBe(1);
  expect(body(tracked('download_clicked')[0]!)).toContain('"placement":"closing"');
  await page.getByLabel('Email').fill('second@example.com');
  await page.getByRole('button', { name: 'Email me the link' }).click();
  await expect(page.getByRole('heading', { name: 'Your link is on its way.' })).toBeVisible();
  await expect.poll(() => tracked('download_requested').length).toBe(1);
  const payload = body(tracked('download_requested')[0]!);
  expect(payload).toContain('"version":"0.1.0"');
  expect(payload).not.toContain('second@example.com');
});

test('an expired or forged link returns to the form with an explanation', async ({ page }) => {
  await page.goto('/api/download?token=forged');
  await page.waitForURL('**/download?expired=1');
  await expect(page.locator('#download-error')).toHaveText(/expired or isn't valid/);
});
