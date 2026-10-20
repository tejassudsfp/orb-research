/// <reference lib="dom" />
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { CanvasStore } from '@orb/canvas';
import type { Card } from '@orb/shared';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { liveWindow } from './support/ui.ts';
import { axeScan, formatViolations } from './support/a11y.ts';

test.describe.configure({ mode: 'serial' });
let app: ElectronApplication;
let page: Page;
let tmp: string;
let canvasId: string;
let stackId: string;
let innerId: string;
let tableId: string;
const inner: string[] = [];
const members: string[] = [];
const pictures = resolve('.orb-dev/stack-reader/screens');
async function launch() {
  if (process.env.ORB_STACK_TEST_EXECUTABLE) {
    // Packaged builds intentionally ignore development-home environment overrides.
    const userData = join(tmp, 'electron');
    mkdirSync(userData, { recursive: true });
    writeFileSync(join(userData, 'location.json'), JSON.stringify({ v: 1, orbHome: join(tmp, 'Orb') }));
  }
  app = await electron.launch({
    ...(process.env.ORB_STACK_TEST_EXECUTABLE
      ? {
          executablePath: process.env.ORB_STACK_TEST_EXECUTABLE,
          args: [`--user-data-dir=${join(tmp, 'electron')}`],
        }
      : { args: [resolve('apps/desktop')] }),
    env: {
      ...process.env,
      ORB_HOME: join(tmp, 'Orb'),
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_USER_DATA: join(tmp, 'electron'),
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 600));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate((id) => {
    location.hash = `#/canvas/${id}`;
  }, canvasId);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
}

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-stack-reader-'));
  const store = new CanvasStore({ home: join(tmp, 'Orb'), searchIndex: false });
  try {
    canvasId = (await store.create({ prompt: 'Readable stacks', start: false })).id;
    const actor = { kind: 'agent' as const, agent: 'scout' as const, model: 'fixture', sessionId: 'fixture' };
    const add = async (type: 'source' | 'table', data: unknown) => {
      const event = await store.placeAgentCard(
        canvasId,
        { type, data, why: 'Stack browsing regression.' } as never,
        actor,
      );
      return (event.data as { card: Card }).card.id;
    };
    for (let i = 0; i < 2; i++)
      inner.push(
        await add('source', {
          title: `Nested evidence ${i + 1}`,
          url: `https://example.org/nested/${i + 1}`,
          summary: `Nested full source notes ${i + 1}`,
          excerpts: [`Nested excerpt ${i + 1}`],
        }),
      );
    innerId = (
      await store.consolidateAgentCards(
        canvasId,
        { cardIds: inner, title: 'Nested evidence', summary: 'Two full sources remain available inside.' },
        actor,
      )
    ).stack.id;
    tableId = await add('table', {
      title: 'Complete comparison table',
      columns: ['Option', 'Details'],
      rows: [
        ['One', 'First full table row'],
        ['Two', 'Second full table row'],
      ],
      totalRows: 2,
    });
    members.push(innerId, tableId);
    for (let i = 0; i < 8; i++)
      members.push(
        await add('source', {
          title: `Evidence ${i + 1}: a detailed source title that wraps in the stack index instead of hiding the remaining cards`,
          url: `https://example.org/evidence/${i + 1}`,
          summary: `Full source notes ${i + 1}. ` + 'Detailed observations and limitations. '.repeat(80),
          excerpts: [`Unique source excerpt ${i + 1}`],
        }),
      );
    stackId = (
      await store.consolidateAgentCards(
        canvasId,
        {
          cardIds: members,
          title: 'All research evidence',
          summary:
            'Ten cards, including a nested stack and a table. Open each one to read its complete contents.',
        },
        actor,
      )
    ).stack.id;
    await store.flush();
  } finally {
    await store.close();
  }
  writeFileSync(join(tmp, 'Orb', 'orb.json'), JSON.stringify({ theme: 'night' }));
  mkdirSync(pictures, { recursive: true });
  await launch();
});
test.afterAll(async () => {
  await app?.close();
  rmSync(tmp, { recursive: true, force: true });
});
const reader = () => page.getByTestId('reader');
const board = async () => JSON.parse((await page.getByTestId('orb-board-state').textContent())!);
async function openStack() {
  await page
    .locator(`[data-testid="orb-card"][data-card-id="${stackId}"]`)
    .getByTestId('orb-card-title')
    .click();
  await expect(reader()).toHaveAttribute('data-card-id', stackId);
}

test('every card is reachable from the stack, with full contents and bounded Previous/Next navigation', async () => {
  await openStack();
  await expect(page.getByTestId('stack-member')).toHaveCount(10);
  await page.getByTestId('stack-member').last().click();
  await expect(reader()).toHaveAttribute('data-card-id', members[9]!);
  await expect(page.getByTestId('reader-text')).toContainText('Full source notes 8.');
  await expect(page.getByTestId('reader-source-excerpts')).toContainText('Unique source excerpt 8');
  await expect(page.getByTestId('stack-position')).toHaveText('Card 10 of 10');
  await expect(page.getByTestId('stack-next')).toBeDisabled();
  expect(await page.getByTestId('reader-body').evaluate((el) => el.scrollTop)).toBe(0);
  expect(formatViolations(await axeScan(page))).toBe('');
  await page.screenshot({ path: join(pictures, 'stack-member-dark.png') });
  for (let i = 9; i > 0; i--) {
    await page.getByTestId('stack-previous').click();
    await expect(reader()).toHaveAttribute('data-card-id', members[i - 1]!);
    await expect(page.getByTestId('stack-position')).toHaveText(`Card ${i} of 10`);
  }
  await expect(page.getByTestId('stack-previous')).toBeDisabled();
  await page.getByTestId('stack-next').click();
  await expect(reader()).toHaveAttribute('data-card-id', tableId);
  await expect(page.getByTestId('reader-body')).toContainText('Second full table row');
  await page.getByTestId('stack-back').click();
  await expect(reader()).toHaveAttribute('data-card-id', stackId);
  await expect(page.getByTestId('stack-member')).toHaveCount(10);
  expect(await page.getByTestId('reader-body').evaluate((el) => el.scrollTop)).toBe(0);
  await page.screenshot({ path: join(pictures, 'stack-index-dark.png') });
  await page.keyboard.press('Escape');
  await expect(reader()).toHaveCount(0);
  const state = await board();
  expect(members.every((id) => state.cards[id].opened)).toBe(true);
  expect(members.every((id) => state.cards[id].stackedInto === stackId)).toBe(true);
});

test('nested stacks return to the correct parent, retain read state and stay accessible after reopening', async () => {
  await app.close();
  await launch();
  await page.evaluate(() => {
    location.hash = '#/settings';
  });
  await page.getByTestId('appearance-mode-light').click();
  await page.evaluate((id) => {
    location.hash = `#/canvas/${id}`;
  }, canvasId);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await openStack();
  await page.getByTestId('stack-member').first().click();
  await expect(reader()).toHaveAttribute('data-card-id', innerId);
  await expect(page.getByTestId('stack-member')).toHaveCount(2);
  await page.getByTestId('stack-member').last().focus();
  await page.keyboard.press('Enter');
  await expect(reader()).toHaveAttribute('data-card-id', inner[1]!);
  await expect(page.getByTestId('reader-text')).toHaveText('Nested full source notes 2');
  await expect(page.getByTestId('stack-position')).toHaveText('Card 2 of 2');
  await expect(page.getByRole('dialog')).toBeFocused();
  await page.screenshot({ path: join(pictures, 'stack-member-light.png') });
  await page.getByTestId('stack-previous').click();
  await expect(reader()).toHaveAttribute('data-card-id', inner[0]!);
  await page.getByTestId('stack-back').click();
  await expect(reader()).toHaveAttribute('data-card-id', innerId);
  await page.getByTestId('stack-back').click();
  await expect(reader()).toHaveAttribute('data-card-id', stackId);
  expect(formatViolations(await axeScan(page))).toBe('');
  await page.screenshot({ path: join(pictures, 'stack-index-light.png') });
  const state = await board();
  expect(members.every((id) => state.cards[id].opened)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(reader()).toHaveCount(0);
});
