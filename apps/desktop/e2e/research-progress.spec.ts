/// <reference lib="dom" />
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { CanvasStore } from '@orb/canvas';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';
import { liveWindow } from './support/ui.ts';
import { axeScan, contrastScan, formatContrast, formatViolations } from './support/a11y.ts';

test.describe.configure({ mode: 'serial' });
let app: ElectronApplication;
let page: Page;
let llm: MockLlm;
let tmp: string;
let lastFrame: { id: string; title: string };
const pictures = resolve('.orb-dev/e2e-results', ...namespaceSegments(), 'screens');

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-research-progress-'));
  const store = new CanvasStore({ home: join(tmp, 'Orb'), searchIndex: false });
  let canvasId: string;
  try {
    const meta = await store.create({
      prompt: 'Example Research: VC due diligence',
      template: 'vc-dd',
      intake: {
        company: 'Example Research',
        website: 'https://example.org',
        stage: 'Seed',
        round_amount: 'Unknown',
      },
      start: false,
    });
    canvasId = meta.id;
    const frames = (await store.board(canvasId)).frames();
    lastFrame = frames.at(-1)!;
    await store.flush();
  } finally {
    await store.close();
  }
  writeFileSync(join(tmp, 'Orb', 'orb.json'), JSON.stringify({ theme: 'night' }));
  llm = await new MockLlm({ defaultTurn: { text: 'This board is waiting for research.' } }).start();
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
  }, canvasId);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  mkdirSync(pictures, { recursive: true });
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('template progress is compact, does not expose agent instructions and keeps conversation readable', async () => {
  const progress = page.getByTestId('research-coverage');
  const toggle = progress.getByRole('button', { name: /sections filled/ });
  await expect(toggle).toContainText('0/12 sections filled');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('chat-body').getByTestId('research-coverage')).toHaveCount(0);
  await expect(page.getByTestId('research-progress-details')).toHaveCount(0);
  await toggle.press('Enter');
  const details = page.getByTestId('research-progress-details');
  await expect(details.locator('li')).toHaveCount(12);
  await expect(details).toContainText('Template cards are starting points');
  await expect(details).toContainText('cards awaiting findings');
  await expect(details).toContainText('table awaiting data');
  expect(await progress.innerText()).not.toMatch(
    /update_card|upsert_rows|c_01|d_01|Untouched|No substantive/,
  );
  expect((await progress.innerText()).length).toBeLessThan(2200);
  const scroll = await details.evaluate((el) => ({ height: el.clientHeight, total: el.scrollHeight }));
  expect(scroll.total).toBeGreaterThan(scroll.height + 100);
  await details.getByRole('button', { name: lastFrame.title, exact: true }).click();
  await expect(page.locator(`[data-testid="orb-frame"][data-frame-id="${lastFrame.id}"]`)).toBeInViewport({
    ratio: 0.1,
  });
  await page.getByTestId('orb-chat-input').fill('What is this board?');
  await page.getByTestId('orb-chat-send').click();
  await expect(page.getByTestId('orb-chat-reply')).toContainText('This board is waiting for research.');
  await expect(page.getByTestId('orb-chat-input')).toBeInViewport({ ratio: 1 });
  await toggle.click();
  await expect(page.getByTestId('research-progress-details')).toHaveCount(0);
  expect(llm.requests.length).toBe(1);
});

test('progress remains bounded and accessible at the minimum window size in both modes', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 600));
  const toggle = page.getByTestId('research-coverage').getByRole('button', { name: /sections filled/ });
  await toggle.click();
  await page.getByRole('button', { name: /Search this board/ }).click();
  await page.getByTestId('conversation-board-search').fill('market');
  const queueToggle = page.getByTestId('reading-queue-toggle');
  if (await queueToggle.count()) await queueToggle.click();
  for (const mode of ['night', 'day']) {
    if (mode === 'day') await page.getByTestId('canvas-theme-toggle').click();
    const panelHeight = (await page.getByTestId('research-coverage').boundingBox())!.height;
    expect(panelHeight).toBeLessThanOrEqual(170);
    await expect(page.getByTestId('orb-chat-input')).toBeInViewport({ ratio: 1 });
    expect((await page.getByTestId('chat-body').boundingBox())!.height).toBeGreaterThanOrEqual(80);
    const violations = await axeScan(page);
    expect(violations, formatViolations(violations)).toEqual([]);
    const contrast = await contrastScan(page);
    expect(contrast, formatContrast(contrast)).toEqual([]);
    await page.screenshot({ path: join(pictures, `research-progress-${mode}-960.png`) });
  }
});
