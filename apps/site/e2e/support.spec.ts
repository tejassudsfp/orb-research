import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
const captures = resolve('.orb-dev/bug-report/screens');
test.beforeEach(async ({ page, request }) => {
  await request.post('/__test/reset');
  await page.addInitScript(() => localStorage.setItem('orb-site-analytics-v1', 'declined'));
});
async function fill(page: any) {
  await page.getByLabel('Email (required)', { exact: true }).fill('submitter@example.com');
  await page.getByLabel('Issue title (required)', { exact: true }).fill('Stack card cannot open');
  await page
    .getByLabel('What happened? (required)', { exact: true })
    .fill('The second source card in a stack does not open its full reader.');
}
test('bug reports send the required email, useful context and attached evidence through the server', async ({
  page,
  request,
}) => {
  await page.goto('/report-a-bug');
  await expect(page.getByRole('heading', { name: 'How to attach your Orb log' })).toBeVisible();
  await expect(page.locator('#evidence-instructions')).toContainText('~/Library/Logs/orb/');
  await expect(page.locator('#evidence-instructions')).toContainText('Shift–Command–G');
  await fill(page);
  await page
    .getByLabel('Steps to reproduce (optional)', { exact: true })
    .fill('Open board, open stack, choose the second source.');
  await page.getByLabel('AI provider and models (optional)', { exact: true }).fill('Example provider/model');
  await page.locator('#bug-evidence').setInputFiles({
    name: 'sidecar.log',
    mimeType: 'text/plain',
    buffer: Buffer.from('Readable synthetic log evidence'),
  });
  await expect(page.getByRole('list', { name: 'Selected evidence' })).toContainText('sidecar.log');
  await page.getByRole('button', { name: 'Send bug report', exact: true }).click();
  await expect(page.getByRole('heading', { name: "Thanks, it's on its way." })).toBeVisible();
  await expect(page.locator('#report-reply-email')).toHaveText('submitter@example.com');
  const sent = await (await request.get('/__test/mail')).json();
  expect(sent).toHaveLength(1);
  expect(sent[0].payload.to).toEqual(['projects.cases@gmail.com']);
  expect(sent[0].payload.from).toContain('orb@email.tejassuds.com');
  expect(sent[0].payload.reply_to).toBe('submitter@example.com');
  expect(sent[0].payload.text).toContain('Example provider/model');
  expect(Buffer.from(sent[0].payload.attachments[0].content, 'base64').toString()).toBe(
    'Readable synthetic log evidence',
  );
  await page.getByRole('button', { name: 'Send something else' }).click();
  await expect(page.locator('#bug-email')).toBeFocused();
});
test('failures retain the draft and evidence and reuse the same idempotency key on retry', async ({
  page,
  request,
}) => {
  await page.goto('/report-a-bug');
  await fill(page);
  await page.locator('#bug-evidence').setInputFiles({
    name: 'evidence.log',
    mimeType: 'text/plain',
    buffer: Buffer.from('Evidence to preserve on retry'),
  });
  await request.post('/__test/fail-next');
  await page.getByRole('button', { name: 'Send bug report', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be confirmed');
  await expect(page.locator('#bug-email')).toHaveValue('submitter@example.com');
  await expect(page.getByRole('list', { name: 'Selected evidence' })).toContainText('evidence.log');
  await page.getByRole('button', { name: 'Send bug report', exact: true }).click();
  await expect(page.locator('#bug-success')).toBeVisible();
  const attempts = await (await request.get('/__test/mail')).json();
  expect(attempts).toHaveLength(2);
  expect(attempts[0].idempotency).toBe(attempts[1].idempotency);
  expect(attempts[0].payload).toEqual(attempts[1].payload);
});
test('invalid evidence is explained and removable, while required email prevents incomplete submission', async ({
  page,
  request,
}) => {
  await page.goto('/report-a-bug');
  await page.getByRole('button', { name: 'Send bug report', exact: true }).click();
  expect(await (await request.get('/__test/mail')).json()).toEqual([]);
  await page.locator('#bug-evidence').setInputFiles({
    name: 'bad.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not allowed'),
  });
  await expect(page.getByRole('alert')).toContainText('Use logs');
  await page
    .locator('#bug-evidence')
    .setInputFiles({ name: 'good.log', mimeType: 'text/plain', buffer: Buffer.from('good evidence') });
  await page.getByRole('button', { name: 'Remove good.log' }).click();
  await expect(page.locator('#evidence-list li')).toHaveCount(0);
});

test('an unavailable backend gives a useful message and preserves the draft', async ({ page }) => {
  await page.goto('/report-a-bug');
  await fill(page);
  await page.route('**/api/bug-reports', (route) =>
    route.fulfill({ status: 404, contentType: 'text/html', body: 'Not found' }),
  );
  await page.getByRole('button', { name: 'Send bug report', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('report service is unavailable');
  await expect(page.locator('#bug-email')).toHaveValue('submitter@example.com');
  await expect(page.locator('#bug-success')).toBeHidden();
});
test('security and bug pages preserve themes, load directly and fit desktop/mobile with accessible forms', async ({
  page,
}) => {
  mkdirSync(captures, { recursive: true });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveText([
    'Workspace',
    'Security',
    'Report a bug',
  ]);
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Workspace', exact: true }),
  ).toHaveAttribute('href', '/');
  await expect(page.getByText(/Your research, together · Open source · Made for Mac/i)).toHaveCount(0);
  await page.getByLabel('Style', { exact: true }).selectOption('paper');
  await page.getByLabel('Brightness', { exact: true }).selectOption('dark');
  await page.getByRole('link', { name: 'Security', exact: true }).first().click();
  await expect(page).toHaveURL(/\/security$/);
  await expect(page.getByRole('heading', { name: 'Keys belong in Keychain.' })).toBeVisible();
  await expect(
    page.getByText(
      'The desktop app has no analytics, automatic crash uploads or background uploads of your boards and logs.',
    ),
  ).toBeVisible();
  for (const route of ['/security', '/report-a-bug', '/download']) {
    await page.goto(route);
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveText([
      'Workspace',
      'Security',
      'Report a bug',
    ]);
    await expect(page.locator('html')).toHaveAttribute('data-style', 'paper');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(axe.source);
      const violations = await page.evaluate(
        async () =>
          (
            await (window as any).axe.run(document, {
              runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
            })
          ).violations,
      );
      expect(
        violations.map((violation: any) => ({
          id: violation.id,
          nodes: violation.nodes.map((node: any) => node.target),
        })),
      ).toEqual([]);
      await page.screenshot({ path: resolve(captures, `${route.slice(1)}-${width}.png`), fullPage: true });
    }
  }
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Workspace', exact: true })
    .click();
  await expect(page).toHaveURL('http://127.0.0.1:4179/');
});
