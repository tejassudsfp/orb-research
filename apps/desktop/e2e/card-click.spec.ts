/// <reference lib="dom" />
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { CanvasStore } from '@orb/canvas';
import { CardType } from '@orb/shared';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { seedPrintFixture, type PrintFixture } from '../../../scripts/testkit/printFixture.ts';
import { liveWindow } from './support/ui.ts';

test.describe.configure({ mode: 'serial' });
let app: ElectronApplication;
let page: Page;
let tmp: string;
let fixture: PrintFixture;
test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-card-click-'));
  fixture = await seedPrintFixture(join(tmp, 'Orb'), { frames: 5, title: 'Card click regression' });
  // The print fixture packs media into fixed slots. Give each interaction target its own space so a tall
  // user-owned video/image cannot cover another card while this test checks pointer behaviour for every type.
  const store = new CanvasStore({ home: join(tmp, 'Orb'), searchIndex: false, flushMs: 5 });
  try {
    await store.command(fixture.canvasId, {
      type: 'card.moved',
      moves: CardType.options.map((type, i) => ({
        id: fixture.cards[type],
        x: i * 600,
        y: 0,
        frameId: null,
      })),
    });
  } finally {
    await store.close();
  }
  writeFileSync(join(tmp, 'Orb', 'orb.json'), JSON.stringify({ theme: 'night' }));
  app = await electron.launch({
    args: [resolve('apps/desktop')],
    env: {
      ...process.env,
      ORB_HOME: join(tmp, 'Orb'),
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_USER_DATA: join(tmp, 'electron'),
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});
test.afterAll(async () => {
  await app?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const card = (type: keyof PrintFixture['cards']) =>
  page.locator(`[data-testid="orb-card"][data-card-id="${fixture.cards[type]}"]`);
async function focus(type: keyof PrintFixture['cards']) {
  await page.evaluate((hash) => {
    location.hash = hash;
  }, `#/canvas/${fixture.canvasId}?focus=${fixture.cards[type]}`);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await expect(card(type)).toBeVisible();
}
const state = () => page.getByTestId('orb-board-state').evaluate((el) => JSON.parse(el.textContent!));

test('one ordinary click opens every card type in the full-screen reader and records it as read', async () => {
  expect(Object.keys(fixture.cards)).toHaveLength(CardType.options.length);
  for (const type of CardType.options) {
    await focus(type);
    await card(type).getByTestId('orb-card-title').click();
    const reader = page.getByTestId('reader');
    await expect(reader).toHaveAttribute('data-card-id', fixture.cards[type]);
    const viewport = await page.evaluate(() => ({ x: 0, y: 0, width: innerWidth, height: innerHeight }));
    expect(await reader.getByRole('dialog').boundingBox()).toEqual(viewport);
    await page.keyboard.press('Escape');
    await expect(reader).toHaveCount(0);
    await expect(card(type)).toBeFocused();
  }
  await expect
    .poll(async () => {
      const board = await state();
      return CardType.options.every((type) => board.cards[fixture.cards[type]].opened);
    })
    .toBe(true);
});

test('selection, modifier clicks, dragging and card controls keep their own actions', async () => {
  await focus('note');
  const select = card('note').getByTestId('card-select');
  await select.uncheck();
  await select.check();
  await expect(page.getByTestId('reader')).toHaveCount(0);
  await card('note')
    .getByTestId('orb-card-title')
    .click({ modifiers: ['Shift'] });
  await expect(select).not.toBeChecked();
  await expect(page.getByTestId('reader')).toHaveCount(0);
  await card('note')
    .getByTestId('orb-card-title')
    .click({ modifiers: ['Meta'] });
  await expect(select).toBeChecked();
  await expect(page.getByTestId('reader')).toHaveCount(0);
  await select.focus();
  await select.press('Enter');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-card-id', fixture.cards.note);
  await page.keyboard.press('Escape');
  const before = (await state()).cards[fixture.cards.note];
  const title = (await card('note').getByTestId('orb-card-title').boundingBox())!;
  await page.mouse.move(title.x + 30, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(title.x + 70, title.y + title.height / 2 + 35, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('reader')).toHaveCount(0);
  await expect.poll(async () => (await state()).cards[fixture.cards.note].x !== before.x).toBe(true);

  const screen = page.getByTestId('canvas-screen');
  await screen.evaluate((el) => {
    el.addEventListener(
      'pointerdown',
      (event) => el.setAttribute('data-test-pointer', String((event as PointerEvent).pointerId)),
      { once: true },
    );
  });
  const movedTitle = (await card('note').getByTestId('orb-card-title').boundingBox())!;
  await page.mouse.move(movedTitle.x + 30, movedTitle.y + movedTitle.height / 2);
  await page.mouse.down();
  await screen.dispatchEvent('pointercancel', {
    pointerId: Number(await screen.getAttribute('data-test-pointer')),
  });
  await page.mouse.up();
  await expect(page.getByTestId('reader')).toHaveCount(0);

  await focus('source');
  await card('source').getByTestId('orb-card-why').click();
  await expect(page.getByTestId('provenance')).toBeVisible();
  await expect(page.getByTestId('reader')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await card('source').getByText('A market study of research tools.', { exact: true }).click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-card-id', fixture.cards.source);
  await page.keyboard.press('Escape');
  await focus('table');
  await card('table').getByTestId('card-table-sort-0').click();
  await expect(page.getByTestId('reader')).toHaveCount(0);
  await expect.poll(async () => (await state()).cards[fixture.cards.table].data.sort?.column).toBe(0);

  // Low-zoom previews are just as clickable as full cards.
  await focus('diagram');
  for (const expected of ['compact', 'title']) {
    for (let i = 0; i < 12 && (await card('diagram').getAttribute('data-lod')) !== expected; i++) {
      await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    }
    await expect(card('diagram')).toHaveAttribute('data-lod', expected);
    await card('diagram').getByTestId('orb-card-title').click();
    await expect(page.getByTestId('reader')).toHaveAttribute('data-card-id', fixture.cards.diagram);
    await page.keyboard.press('Escape');
  }
});
