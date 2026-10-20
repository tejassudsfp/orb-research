/// <reference lib="dom" />
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MockLlm, MOCK_KEY_ENV, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { seedPrintFixture, type PrintFixture } from '../../../scripts/testkit/printFixture.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';
import { liveWindow } from './support/ui.ts';
import { axeScan, contrastScan, formatContrast, formatViolations } from './support/a11y.ts';

test.describe.configure({ mode: 'serial' });
let app: ElectronApplication;
let page: Page;
let llm: MockLlm;
let tmp: string;
let fixture: PrintFixture;
const desktop = resolve(import.meta.dirname, '..');
const pictures = resolve('.orb-dev/e2e-results', ...namespaceSegments(), 'markdown');
const userText =
  '**Formatting request**\n\nKeep this as a display example.[^note]\n\n[^note]: User footnote.';
const answer = [
  '# Research summary',
  '',
  '**Useful detail** with *emphasis*, ~~outdated text~~ and `inline code`.',
  '',
  '- First finding',
  '  - Nested evidence',
  '- Second finding',
  '',
  '1. Review evidence',
  '2. Decide next step',
  '',
  '> A qualified conclusion.',
  '',
  '```js',
  `const evidence = "${'long evidence '.repeat(70)}";`,
  '```',
  '',
  '| Option | Evidence | Cost | Constraint |',
  '| --- | --- | ---: | --- |',
  '| Alpha | Primary source | 12 | Needs verification |',
  '| Beta | Second source | 24 | Date dependent |',
  '',
  '- [x] Reviewed',
  '- [ ] Follow up',
  '',
  '[Learn more](https://example.com/markdown-source)',
  '![Reference image](https://markdown-pixel.invalid/track.png)',
  '[Unsafe](javascript:alert%281%29)',
  '<img src="https://markdown-pixel.invalid/raw" onerror="window.__markdownExecuted=true">',
  '',
  'A cited finding.[^note]',
  '',
  '[^note]: Source details.',
].join('\n');

async function launch() {
  app = await electron.launch({
    args: [desktop],
    env: {
      ...process.env,
      ORB_HOME: join(tmp, 'Orb'),
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_USER_DATA: join(tmp, 'electron'),
      ORB_EXTRA_PATCH_FILE: join(tmp, 'mock.patch.yml'),
      [MOCK_KEY_ENV]: 'orb-mock-key',
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate((id) => {
    location.hash = `#/canvas/${id}`;
  }, fixture.canvasId);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
}
test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-chat-markdown-'));
  fixture = await seedPrintFixture(join(tmp, 'Orb'), { frames: 5, title: 'Markdown display example' });
  writeFileSync(join(tmp, 'Orb', 'orb.json'), JSON.stringify({ theme: 'night' }));
  llm = await new MockLlm({ defaultTurn: { text: 'Ready.' } }).start();
  writeFileSync(join(tmp, 'mock.patch.yml'), mockProviderPatch(llm.baseURL));
  mkdirSync(pictures, { recursive: true });
  await launch();
});
test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('streaming and saved messages render Markdown, contain wide content and keep links safe', async () => {
  const remote: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('markdown-pixel.invalid')) remote.push(request.url());
  });
  llm.enqueue({
    chunks: [
      '# Research summary\n\n**Useful detail**',
      ...Array(25).fill(''),
      answer.slice(answer.indexOf(' with *emphasis*')),
    ],
    chunkDelayMs: 60,
  });
  await page.getByTestId('orb-chat-input').fill(userText);
  await page.getByTestId('orb-chat-send').click();
  const live = page.locator('[data-testid="orb-chat-reply"][data-live="true"]');
  await expect(live.locator('h3')).toHaveText('Research summary');
  await expect(live.locator('strong')).toHaveText('Useful detail');
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-turn', 'completed');
  const reply = page.getByTestId('orb-chat-reply');
  await expect(reply.locator('em')).toHaveText('emphasis');
  await expect(reply.locator('ul ul li')).toHaveText('Nested evidence');
  await expect(reply.locator('ol').first().locator('li')).toHaveCount(2);
  await expect(reply.locator('blockquote')).toContainText('A qualified conclusion.');
  await expect(reply.locator('del')).toHaveText('outdated text');
  await expect(reply.locator('table tbody tr')).toHaveCount(2);
  await expect(reply.getByRole('checkbox', { name: 'Reviewed', exact: true })).toBeChecked();
  await expect(reply.getByRole('checkbox', { name: 'Follow up', exact: true })).toBeDisabled();
  await expect(page.getByTestId('chat-user-message').locator('strong')).toHaveText('Formatting request');
  expect(
    await page.locator('[data-markdown] img, [data-markdown] script, [data-markdown] iframe').count(),
  ).toBe(0);
  expect(await page.evaluate(() => (window as any).__markdownExecuted)).toBeUndefined();
  expect(remote).toEqual([]);
  expect(await reply.locator('a[href^="javascript:"], a[href^="file:"], a[href^="data:"]').count()).toBe(0);
  const ids = await page.locator('[data-markdown] [id]').evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(new Set(ids).size).toBe(ids.length);
  const hash = await page.evaluate(() => location.hash);
  await reply.locator('a[data-footnote-ref]').click();
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  const code = reply.getByRole('region', { name: 'Markdown table' });
  await code.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => code.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const pre = reply.locator('pre');
  await pre.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => pre.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  expect(
    await page.getByTestId('chat-body').evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1);
  await app.evaluate(({ shell }) => {
    (globalThis as any).__markdownOpened = [];
    shell.openExternal = async (url: string) => {
      (globalThis as any).__markdownOpened.push(url);
    };
  });
  await reply.getByRole('link', { name: 'Learn more', exact: true }).click();
  expect(await app.evaluate(() => (globalThis as any).__markdownOpened)).toEqual([
    'https://example.com/markdown-source',
  ]);
  await page.getByTestId('orb-chat-input').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('orb-chat-input')).toHaveValue(userText);
  await page.getByTestId('orb-chat-input').fill('');
});

test('restart restores formatted history; light and dark remain readable', async () => {
  await app.close();
  await launch();
  await expect(page.getByTestId('orb-chat-reply').locator('strong')).toHaveText('Useful detail');
  await expect(page.getByTestId('orb-chat-reply').locator('table')).toHaveCount(1);
  for (const mode of ['light', 'dark']) {
    await page.evaluate(() => {
      location.hash = '#/settings';
    });
    await page.getByTestId(`appearance-mode-${mode}`).click();
    await page.evaluate((id) => {
      location.hash = `#/canvas/${id}`;
    }, fixture.canvasId);
    await expect(page.getByTestId('orb-chat-reply').locator('strong')).toBeVisible();
    await page.getByTestId('chat-body').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    expect(formatViolations(await axeScan(page, { exclude: ['iframe'] }))).toBe('');
    expect(formatContrast(await contrastScan(page))).toBe('');
    await page.getByTestId('chat-panel').screenshot({ path: join(pictures, `chat-${mode}.png`) });
  }
});

test('card threads render live and persisted Markdown replies', async () => {
  await page.evaluate(
    ({ id, card }) => {
      location.hash = `#/canvas/${id}?focus=${card}`;
    },
    { id: fixture.canvasId, card: fixture.cards.source },
  );
  await page.locator(`[data-card-id="${fixture.cards.source}"]`).getByTestId('card-thread').click();
  llm.enqueue({
    chunks: [
      '## Thread finding\n\n**Thread evidence**',
      ...Array(25).fill(''),
      '\n\n- Verified first\n- Verify next\n\n```txt\nReadable code\n```',
    ],
    chunkDelayMs: 60,
  });
  await page.getByTestId('thread-input').fill('**Thread request**');
  await page.getByTestId('thread-send').click();
  await expect(page.getByTestId('thread-live').locator('strong')).toHaveText('Thread evidence');
  await expect(page.getByTestId('thread-message').last().locator('ul li')).toHaveCount(2);
  await expect(page.getByTestId('thread-message').first().locator('strong')).toHaveText('Thread request');
  await app.close();
  await launch();
  await page.evaluate(
    ({ id, card }) => {
      location.hash = `#/canvas/${id}?focus=${card}`;
    },
    { id: fixture.canvasId, card: fixture.cards.source },
  );
  await page.locator(`[data-card-id="${fixture.cards.source}"]`).getByTestId('card-thread').click();
  await expect(page.getByTestId('thread-message').last().locator('strong')).toHaveText('Thread evidence');
  await expect(page.getByTestId('thread-message').last().locator('pre code')).toHaveText('Readable code\n');
});
