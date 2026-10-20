/// <reference lib="dom" />
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
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
const pictures = resolve('.orb-dev/e2e-results', ...namespaceSegments(), 'screens');

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-conversation-rail-'));
  fixture = await seedPrintFixture(join(tmp, 'Orb'), { frames: 5, title: 'Grounded research' });
  writeFileSync(join(tmp, 'Orb', 'orb.json'), JSON.stringify({ theme: 'night' }));
  llm = await new MockLlm({ defaultTurn: { text: 'Ready to discuss this board.' } }).start();
  writeFileSync(join(tmp, 'mock.patch.yml'), mockProviderPatch(llm.baseURL));
  app = await electron.launch({
    args: [resolve('apps/desktop')],
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
  mkdirSync(pictures, { recursive: true });
});
test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('rail reserves board space, reading dropdown opens full-screen evidence, collapse preserves the draft and focus', async () => {
  const rail = page.getByTestId('chat-panel');
  const workspace = page.getByTestId('canvas-workspace');
  const screen = page.getByTestId('canvas-screen');
  const checkLayout = async () => {
    const a = (await screen.boundingBox())!;
    const b = (await rail.boundingBox())!;
    const full = (await workspace.boundingBox())!;
    expect(a.x + a.width).toBeCloseTo(b.x, 0);
    expect(b.y).toBe(full.y);
    expect(b.height).toBe(full.height);
    expect(b.x + b.width).toBeCloseTo(full.x + full.width, 0);
    await expect(page.getByTestId('orb-chat-input')).toBeInViewport({ ratio: 1 });
  };
  await checkLayout();
  const queue = rail.getByTestId('reading-queue');
  await expect(queue).toBeVisible();
  const toggle = queue.getByTestId('reading-queue-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  const first = queue.getByTestId('reading-queue-item').first();
  const id = (await first.getAttribute('data-card-id'))!;
  await first.click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-card-id', id);
  expect((await page.getByTestId('reader').boundingBox())!.width).toBe(
    (await workspace.boundingBox())!.width,
  );
  await page.keyboard.press('Escape');
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute('data-opened', 'true');
  await toggle.click();
  await page.getByTestId('orb-chat-input').fill('Explain the assumptions in this board');
  const narrow = (await screen.boundingBox())!.width;
  const worldCentre = () =>
    page.getByTestId('world').evaluate((el) => {
      const transform = new DOMMatrix(getComputedStyle(el).transform);
      const viewport = document.querySelector('[data-testid="canvas-screen"]')!.getBoundingClientRect();
      return {
        x: (viewport.width / 2 - transform.e) / transform.a,
        y: (viewport.height / 2 - transform.f) / transform.d,
      };
    });
  const before = await worldCentre();
  await page.getByTestId('chat-minimise').click();
  await expect(page.getByTestId('chat-pill')).toBeFocused();
  await expect(rail).toHaveCount(0);
  expect((await screen.boundingBox())!.width).toBeGreaterThan(narrow + 300);
  await expect.poll(async () => Math.abs((await worldCentre()).x - before.x)).toBeLessThan(1);
  await page.getByTestId('chat-pill').press('Enter');
  await expect(page.getByTestId('orb-chat-input')).toBeFocused();
  await expect(page.getByTestId('orb-chat-input')).toHaveValue('Explain the assumptions in this board');
  await checkLayout();
  await page.getByTestId('orb-chat-input').fill('');
});

test('search within chat opens cards, pins evidence and sends its content for clarification', async () => {
  await page.getByRole('button', { name: /Search this board/ }).click();
  const search = page.getByTestId('conversation-board-search');
  await search.fill('Sourcemarker');
  const result = page.getByTestId('conversation-board-result');
  await expect(result).toHaveCount(1);
  await result.getByRole('button', { name: /^Card/ }).click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-card-id', fixture.cards.source);
  await page.keyboard.press('Escape');
  await result.getByRole('button', { name: /Use .* as context/ }).click();
  await expect(page.getByTestId('context-chip')).toHaveAttribute('data-item-id', fixture.cards.source);
  llm.enqueue({
    text: 'The source describes the supporting evidence. Which assumption would you like to clarify?',
  });
  await page.getByTestId('orb-chat-input').fill('Can you clarify this?');
  await page.getByTestId('orb-chat-send').click();
  await expect(page.getByTestId('orb-chat-reply')).toContainText('Which assumption');
  const request = JSON.stringify(llm.requests.at(-1)!.body);
  expect(request).toContain('<board-context>');
  expect(request).toContain(fixture.cards.source);
  expect(request).toContain('Sourcemarker');
  await page.getByTestId('context-chip-remove').click();
  await search.fill('nonexistent-rail-evidence');
  await expect(page.getByTestId('conversation-board')).toContainText('0 results');
  await search.press('Escape');
});

test('an unpinned board question can search and read the canvas through agent tools', async () => {
  llm.enqueue(
    { toolCalls: [{ id: 'rail-search', name: 'search_board', arguments: { q: 'Sourcemarker' } }] },
    { toolCalls: [{ id: 'rail-read', name: 'read_card', arguments: { cardId: fixture.cards.source } }] },
    { text: `The evidence is recorded in Sourcemarker [${fixture.cards.source}].` },
  );
  await page.getByTestId('orb-chat-input').fill('What evidence is already on this board about Sourcemarker?');
  await page.getByTestId('orb-chat-send').click();
  await expect(page.getByTestId('orb-chat-reply')).toContainText('The evidence is recorded');
  const request = llm.requests.at(-1)!.body;
  const encoded = JSON.stringify(request);
  expect(encoded).toContain('even without pinned context');
  expect(encoded).toContain('ask one focused clarification');
  const tools = (request.messages as any[]).filter((message) => message.role === 'tool');
  expect(tools.some((message) => JSON.stringify(message).includes('Sourcemarker'))).toBe(true);
  expect(tools.some((message) => JSON.stringify(message).includes(fixture.cards.source))).toBe(true);
  const question = (request.messages as any[]).findLast(
    (message) => message.role === 'user' && JSON.stringify(message).includes('What evidence is already'),
  );
  expect(JSON.stringify(question)).not.toContain('<board-context>');
});

test('reading older messages is stable while new tokens arrive and across collapse', async () => {
  llm.enqueue({
    text: Array.from(
      { length: 35 },
      (_, i) => `Saved finding ${i + 1}: detailed research evidence.\n\n`,
    ).join(''),
  });
  await page.getByTestId('orb-chat-input').fill('Show the saved findings.');
  await page.getByTestId('orb-chat-send').click();
  await expect(page.getByTestId('orb-chat-reply')).toContainText('Saved finding 35');
  llm.enqueue({
    chunks: ['More findings.\n\n', ...Array(25).fill('Another new detail.\n\n'), 'Stream finished.'],
    chunkDelayMs: 40,
  });
  await page.getByTestId('orb-chat-input').fill('Explain these findings.');
  await page.getByTestId('orb-chat-send').click();
  await expect(page.getByTestId('orb-chat-reply')).toContainText('More findings.');
  const history = page.getByTestId('chat-body');
  await history.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(page.getByTestId('orb-chat-reply')).toContainText('Stream finished.');
  expect(await history.evaluate((el) => el.scrollTop)).toBeLessThan(5);
  const cardCount = () =>
    page
      .getByTestId('orb-board-state')
      .evaluate((el) => Object.keys(JSON.parse(el.textContent!).cards).length);
  const before = await cardCount();
  await history.focus();
  await history.press('Delete');
  await history.press('n');
  expect(await cardCount()).toBe(before);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-tool', 'select');
  await page.getByTestId('chat-minimise').click();
  await page.getByTestId('chat-pill').click();
  expect(await history.evaluate((el) => el.scrollTop)).toBeLessThan(5);
});

test('expanded dropdowns and rail are usable at the minimum window size in both modes', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 600));
  await page.getByTestId('reading-queue-toggle').click();
  await page.getByRole('button', { name: /Search this board/ }).click();
  await page.getByTestId('conversation-board-search').fill('marker');
  for (const mode of ['night', 'day']) {
    if (mode === 'day') await page.getByTestId('canvas-theme-toggle').click();
    await expect(page.getByTestId('orb-chat-input')).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('chat-minimise')).toBeInViewport({ ratio: 1 });
    const selection = (await page.getByTestId('selection-bar').boundingBox())!;
    const header = (await page.getByTestId('title-pill').boundingBox())!;
    expect(selection.y).toBeGreaterThan(header.y + header.height + 8);
    expect(selection.width).toBeGreaterThan(200);
    await expect(
      page.locator(`[data-testid="orb-card"][data-card-id="${fixture.cards.source}"]`),
    ).toBeInViewport({ ratio: 0.5 });
    const violations = await axeScan(page);
    expect(violations, formatViolations(violations)).toEqual([]);
    const contrast = await contrastScan(page);
    expect(contrast, formatContrast(contrast)).toEqual([]);
    await page.screenshot({ path: join(pictures, `conversation-rail-${mode}-960.png`) });
  }
});
