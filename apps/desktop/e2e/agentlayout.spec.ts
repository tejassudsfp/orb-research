/// <reference lib="dom" />
/**
 * P6.8 agent layout tools in the real window (mock LLM scripted to call them):
 * - `arrange_frame` re-sorts a frame by importance; the cards GLIDE to their new places (the world is marked
 *   `data-gliding` for a moment); the conversation panel's "On the board" list says what the agent arranged;
 * - the whole rearrangement is ONE undo step (Cmd+Z restores every position) and the undo does not pin the cards;
 * - a card the user dragged is pinned: a later arrange leaves it where the user put it.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { createCanvas, liveWindow } from './support/ui.ts';

const desktopDir = resolve(import.meta.dirname, '..');

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-agentlayout-'));
  llm = await new MockLlm().start();
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
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

type BoardJson = { cards: Record<string, { id: string; frameId: string | null; x: number; y: number; data: { title?: string }; userMoved?: true }> };
const board = async (): Promise<BoardJson> => JSON.parse((await page.getByTestId('orb-board-state').textContent()) ?? '{}');
const byTitle = async (title: string) => Object.values((await board()).cards).find((c) => c.data.title === title)!;
const send = async (text: string) => {
  await page.getByTestId('orb-chat-input').fill(text);
  await page.getByTestId('orb-chat-send').click();
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-turn', 'completed');
};
const settledTurn = () => expect(page.getByTestId('chat-panel')).toHaveAttribute('data-agents-state', 'idle');

test('arrange_frame glides the cards, shows in the activity list, is one undo step and spares a dragged card', async () => {
  await createCanvas(page, 'Layout probe');

  llm.enqueue(
    { toolCalls: [{ id: 'call_l_frame', name: 'add_frame', arguments: { title: 'Market' } }] },
    { text: 'Frame ready.' },
  );
  await send('Add a Market frame.');
  await settledTurn();
  const frameId = (await page.locator('[data-testid="orb-frame"][aria-label="Market"]').getAttribute('data-frame-id'))!;

  const doc = (title: string, extra: Record<string, unknown> = {}, id = title) => ({
    id: `call_l_${id}`,
    name: 'place_card',
    arguments: { type: 'doc', frameId, title, body: `${title} body`, why: 'A card to arrange.', ...extra },
  });
  llm.enqueue({ toolCalls: [doc('Dragged card'), doc('Plain card'), doc('Skim card', { badge: 'skim' }), doc('Must card', { badge: 'must' })] }, { text: 'Cards placed.' });
  await send('Put four cards in Market.');
  await settledTurn();
  // (the board draws only the cards in view, so count them in the folded board)
  await expect.poll(async () => Object.keys((await board()).cards).length).toBe(4);

  const first = { plain: await byTitle('Plain card'), skim: await byTitle('Skim card'), must: await byTitle('Must card'), dragged: await byTitle('Dragged card') };
  // placed in reading order: the first card takes the first cell
  expect(first.plain.y).toBeLessThanOrEqual(first.must.y);
  expect([first.plain.x, first.plain.y]).not.toEqual([first.must.x, first.must.y]);

  // The user drags one card by hand: it is pinned from now on.
  const draggedBox = (await page.locator(`[data-testid="orb-card"][data-card-id="${first.dragged.id}"]`).boundingBox())!;
  await page.mouse.move(draggedBox.x + 40, draggedBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(draggedBox.x + 70, draggedBox.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await byTitle('Dragged card')).userMoved).toBe(true);
  const dragged = await byTitle('Dragged card');

  // Watch the world for the glide (it lasts well under a second).
  await page.evaluate(() => {
    const world = document.querySelector('[data-testid="world"]')!;
    (window as unknown as { __glided: boolean }).__glided = false;
    new MutationObserver(() => {
      if (world.getAttribute('data-gliding') === 'true') (window as unknown as { __glided: boolean }).__glided = true;
    }).observe(world, { attributes: true, attributeFilter: ['data-gliding'] });
  });

  llm.enqueue(
    { toolCalls: [{ id: 'call_l_arrange', name: 'arrange_frame', arguments: { frameId, by: 'importance' } }] },
    { text: 'Arranged by importance.' },
  );
  await send('Arrange Market by importance.');
  await settledTurn();

  // The must-read card now has the first free cell, then the plain one, the skim card last.
  const readingOrder = async () =>
    (await Promise.all(['Plain card', 'Skim card', 'Must card'].map(byTitle))).sort((x, y) => x.y - y.y || x.x - y.x).map((c) => c.data.title);
  await expect.poll(readingOrder).toEqual(['Must card', 'Plain card', 'Skim card']);
  // The dragged card did not move.
  const draggedAfter = await byTitle('Dragged card');
  expect([draggedAfter.x, draggedAfter.y]).toEqual([dragged.x, dragged.y]);
  expect(await page.evaluate(() => (window as unknown as { __glided: boolean }).__glided)).toBe(true);
  await expect(page.getByTestId('world')).not.toHaveAttribute('data-gliding', 'true', { timeout: 3_000 });

  // The conversation panel's "On the board" list says what it did.
  await expect(page.getByTestId('chat-panel').getByTestId('activity-line').filter({ hasText: 'orb arranged 01 Market by importance' })).toHaveCount(1);

  // One Cmd+Z takes the whole rearrangement back (the user's drag stays: it was an earlier step).
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => {
    const now = { plain: await byTitle('Plain card'), skim: await byTitle('Skim card'), must: await byTitle('Must card') };
    return (['plain', 'skim', 'must'] as const).every((k) => now[k].x === first[k].x && now[k].y === first[k].y);
  }).toBe(true);
  const undone = await byTitle('Plain card');
  expect(undone.userMoved).toBeUndefined();
  expect((await byTitle('Dragged card')).userMoved).toBe(true);
});
