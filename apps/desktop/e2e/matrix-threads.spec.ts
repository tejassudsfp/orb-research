/// <reference lib="dom" />
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { CanvasStore } from '@orb/canvas';
import type { Card } from '@orb/shared';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';
import { liveWindow } from './support/ui.ts';
import { axeScan, contrastScan, formatContrast, formatViolations } from './support/a11y.ts';

test.describe.configure({ mode: 'serial' });
let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
let firstId: string;
let secondId: string;
let sourceId: string;
const pictures = resolve('.orb-dev/e2e-results', ...namespaceSegments(), 'screens');

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-matrix-threads-'));
  const store = new CanvasStore({ home: join(tmp, 'Orb'), searchIndex: false });
  let canvasId: string;
  try {
    const meta = await store.create({ prompt: 'Matrix and threads', start: false });
    canvasId = meta.id;
    const ev = await store.command(canvasId, {
      type: 'frame.added',
      frame: { title: 'Assessment', color: 'sky', x: 96, y: 120, w: 1400, h: 900 },
    });
    const frameId = (ev.data as any).frame.id;
    const actor = { kind: 'agent' as const, agent: 'orb' as const, model: 'fixture', sessionId: 'fixture' };
    const place = async (type: 'source' | 'matrix', data: unknown, detail?: string) => {
      const e = await store.placeAgentCard(
        canvasId,
        {
          type,
          frameId,
          data,
          why: 'Evidence and scoring regression.',
          ...(detail ? { detail } : {}),
        } as any,
        actor,
      );
      return (e.data as { card: Card }).card.id;
    };
    sourceId = await place('source', {
      title: 'Independent assessment evidence',
      url: 'https://example.org/evidence',
      summary: 'Observed results and their limitations.',
    });
    const criteria = [
      { name: 'Product depth and independently observed delivery capability', weight: 25 },
      { name: 'Distribution and current customer proof', weight: 20 },
      { name: 'Funding and runway', weight: 20 },
      { name: 'Pricing', weight: 15 },
      { name: 'Customer proof', weight: 20 },
    ];
    firstId = await place(
      'matrix',
      {
        title: 'Eight-option comparison',
        criteria,
        options: Array.from({ length: 8 }, (_, i) => ({
          name: `Candidate ${i + 1}: long product and vendor name`,
          scores: criteria.map(() => null),
        })),
      },
      `The assessment cites ${sourceId}. No comparative tests have been completed; unsupported scores remain unassessed.\n\nThe next step is a common test protocol and dated pricing evidence.`,
    );
    secondId = await place('matrix', {
      title: 'Personal scorecard',
      criteria: [
        { name: 'Team', weight: 25 },
        { name: 'Market', weight: 20 },
        { name: 'Product', weight: 15 },
        { name: 'Traction', weight: 20 },
        { name: 'Model', weight: 10 },
        { name: 'Deal', weight: 10 },
      ],
      options: [
        { name: 'orb score', scores: [4, 6, 4, 2, 4, 4] },
        { name: 'Your score', scores: [null, null, null, null, null, null] },
      ],
    });
    await store.flush();
  } finally {
    await store.close();
  }
  writeFileSync(join(tmp, 'Orb', 'orb.json'), JSON.stringify({ theme: 'night' }));
  llm = await new MockLlm({ defaultTurn: { text: 'Ready.' } }).start();
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

const card = (id: string) => page.locator(`[data-testid="orb-card"][data-card-id="${id}"]`);
const board = async () => JSON.parse((await page.getByTestId('orb-board-state').textContent())!);
async function open(id: string) {
  await card(id).getByTestId('orb-card-title').click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-card-id', id);
}

test('eight-option matrix keeps a readable pinned first column, wrapped headers, explicit scale and usable evidence', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 600));
  await open(firstId);
  const table = page.getByTestId('reader-matrix-table');
  const first = table.locator('tbody th').first();
  const before = (await first.boundingBox())!;
  expect(before.width).toBeGreaterThanOrEqual(230);
  expect(before.width).toBeLessThan(270);
  const scroll = page.getByRole('region', { name: 'Comparison scores' });
  await scroll.evaluate((el) => {
    el.scrollLeft = 500;
  });
  expect((await first.boundingBox())!.x).toBeCloseTo(before.x, 0);
  expect(await scroll.evaluate((el) => el.scrollWidth)).toBeGreaterThan(
    await scroll.evaluate((el) => el.clientWidth),
  );
  await scroll.hover();
  await page.mouse.wheel(0, 400);
  await expect
    .poll(() =>
      page
        .getByTestId('reader')
        .locator('[data-layout]')
        .evaluate((el) => el.scrollTop),
    )
    .toBeGreaterThan(10);
  await expect(table.locator('tfoot')).toContainText('Weighted / 10');
  await expect(table.getByTestId('matrix-winner')).toHaveCount(0);
  await expect(page.getByTestId('reader-detail')).not.toContainText(sourceId);
  await page.getByTestId('card-reference').click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-card-id', sourceId);
  await page.getByTestId('reader-close').click();
  await open(secondId);
  await expect(table.locator('tfoot td').first()).toHaveText('4');
  await expect(table.locator('tfoot td').nth(1)).toHaveText('Not scored');
  await page.getByTestId('reader-close').click();
  await open(firstId);
  for (const mode of ['night', 'day']) {
    if (mode === 'day') {
      await page.getByTestId('reader-close').click();
      await page.getByTestId('canvas-theme-toggle').click();
      await open(firstId);
    }
    const violations = await axeScan(page);
    expect(violations, formatViolations(violations)).toEqual([]);
    const contrast = await contrastScan(page);
    expect(contrast, formatContrast(contrast)).toEqual([]);
    await page.screenshot({ path: join(pictures, `matrix-first-column-${mode}.png`) });
  }
  await page.getByTestId('reader-thread').click();
  await expect(page.getByTestId('reader')).toHaveCount(0);
  await expect(page.getByTestId('thread')).toHaveAttribute('data-thread-of', firstId);
  await page.getByTestId('thread-close').click();
});

test('threads submitted during a running step are answered separately without waiting for the full turn', async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  llm.enqueue(
    { holdUntil: () => held, toolCalls: [{ id: 'background_read', name: 'query_board', arguments: {} }] },
    { text: 'First thread answer.' },
    { text: 'Second thread answer.' },
  );
  await page.getByTestId('orb-chat-input').fill('Read the board and explain its contents.');
  const before = llm.requests.length;
  await page.getByTestId('orb-chat-send').click();
  await expect.poll(() => llm.requests.length).toBe(before + 1);
  await open(firstId);
  await page.getByTestId('reader-thread').click();
  await page.getByTestId('thread-input').fill('Explain the first comparison.');
  await page.getByTestId('thread-send').click();
  await expect(page.getByTestId('thread-status')).toBeVisible();
  await page.getByTestId('thread-close').click();
  await open(secondId);
  await page.getByTestId('reader-thread').click();
  await page.getByTestId('thread-input').fill('Explain my personal scorecard.');
  await page.getByTestId('thread-send').click();
  release();
  await expect.poll(async () => (await board()).threads[firstId]?.at(-1)?.text).toBe('First thread answer.');
  await expect
    .poll(async () => (await board()).threads[secondId]?.at(-1)?.text)
    .toBe('Second thread answer.');
  const state = await board();
  expect(state.threads[firstId]).toHaveLength(2);
  expect(state.threads[secondId]).toHaveLength(2);
  const messages = llm.requests[before + 1]!.body.messages;
  expect(JSON.stringify(messages)).toContain('Explain the first comparison.');
  expect(JSON.stringify(messages)).not.toContain('Explain my personal scorecard.');
  expect(llm.requests[before]!.aborted).toBe(false);
  await expect(page.getByTestId('thread-send')).toBeInViewport({ ratio: 1 });
  await page.getByTestId('thread-close').click();
});

test('a failed thread request shows its error and can be retried', async () => {
  await open(firstId);
  await page.getByTestId('reader-thread').click();
  llm.enqueue({ status: 401, errorMessage: 'Test provider authentication rejected.' });
  await page.getByTestId('thread-input').fill('Check this evidence.');
  await page.getByTestId('thread-send').click();
  await expect(page.getByTestId('thread-error')).toBeVisible();
  llm.enqueue({ text: 'The thread recovered after authentication was restored.' });
  await page.getByTestId('thread-input').fill('Try checking the evidence again.');
  await page.getByTestId('thread-send').click();
  await expect(page.getByTestId('thread-message').last()).toContainText('The thread recovered');
});
