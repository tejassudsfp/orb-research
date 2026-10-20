/// <reference lib="dom" />
/**
 * P6.1 composer attachments, in the real window with the mock LLM (docs/phase6/PLAN.md):
 * - paperclip (the panel's file picker), paste (a PNG pasted into the chat input) and drop (a CSV dropped on the
 *   chat panel) each ingest the file through the board's ordinary path into ONE card that lands in view, in the
 *   current frame (Orb's "Evidence" frame, which fills the view), clear of the other cards and of the panel;
 * - the drop on the panel is not also a drop on the board behind it (no board drop target, one card only, not at the
 *   drop point);
 * - each message is sent with its card as context: the mock LLM's request carries the card's id and text in the
 *   Attached block of the board context;
 * - the sent message shows a chip per attachment; after panning away, a click on the chip flies to the card (selected,
 *   in view again).
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  MOCK_KEY_ENV,
  MockLlm,
  mockProviderPatch,
  type MockRequest,
  type MockTurn,
} from '../../../scripts/testkit/mockLlm.ts';
import { makePng } from '../../../scripts/testkit/fixtures.ts';
import { createCanvas, liveWindow } from './support/ui.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';

const desktopDir = resolve(import.meta.dirname, '..');
const ATTACHED = 'Attached with this message';

const textOf = (message: any): string =>
  typeof message?.content === 'string'
    ? message.content
    : Array.isArray(message?.content)
      ? message.content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n')
      : '';
const isOrb = (req: MockRequest) => {
  const system = textOf((req.body.messages as any[])[0]);
  return !/You are (Scout|Critic|Builder)/.test(system);
};
/** The last user message of a request (what the user just sent, with its injected context). */
const lastUser = (req: MockRequest): string =>
  textOf([...(req.body.messages as any[])].reverse().find((m) => m.role === 'user'));

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
const script: MockTurn[] = [];

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-attach-'));
  llm = await new MockLlm({
    defaultTurn: (req) => (isOrb(req) ? (script.shift() ?? { text: 'Got it.' }) : { text: 'OK.' }),
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
  rmSync(tmp, { recursive: true, force: true });
});

const board = async () => JSON.parse((await page.getByTestId('orb-board-state').textContent()) ?? '{}');
const settled = () => expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-pending', '0');
const cardEl = (id: string) => page.locator(`[data-testid="orb-card"][data-card-id="${id}"]`);
const capture = async (name: string) => {
  const dir = resolve(desktopDir, '..', '..', '.orb-dev', 'e2e-results', ...namespaceSegments(), 'screens');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `p6.1-${name}.png`) });
};

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The card is drawn wholly in the window, clear of the conversation panel. */
async function expectInView(id: string) {
  await expect
    .poll(async () => {
      const box = await cardEl(id).boundingBox();
      const panel = await page.getByTestId('chat-panel').boundingBox();
      if (!box || !panel) return 'not drawn';
      if (box.x < 0 || box.y < 0 || box.x + box.width > 1440 || box.y + box.height > 900) return 'off screen';
      return overlaps(box, panel) ? 'under the panel' : 'in view';
    })
    .toBe('in view');
}

/**
 * In the current frame, or (once it is full) right next to it: a free spot no farther from the frame than the
 * card's own size.
 */
async function expectInOrNearFrame(id: string) {
  const b = await board();
  const c = b.cards[id];
  if (c.frameId === frameId) return;
  expect(c.frameId).toBeNull();
  const f = b.frames[frameId];
  const dx = Math.max(f.x - (c.x + c.w), c.x - (f.x + f.w), 0);
  const dy = Math.max(f.y - (c.y + c.h), c.y - (f.y + f.h), 0);
  expect(Math.max(dx, dy)).toBeLessThanOrEqual(Math.max(c.w, c.h));
}

/** The ready attachment chip's card id (the newest chip). */
async function attachedId(): Promise<string> {
  const chip = page.locator('[data-testid="attachment-chip"][data-state="ready"]').last();
  await expect(chip).toHaveAttribute('data-item-id', /^c_[0-9A-Z]{26}$/);
  return (await chip.getAttribute('data-item-id'))!;
}

/** Send the composer's message; wait for Orb's request that carries `id` as an attachment and for the turn's end. */
async function sendWith(id: string, text: string): Promise<string> {
  const before = llm.requests.length;
  const input = page.getByTestId('orb-chat-input');
  await input.fill(text);
  await input.press('Enter');
  await expect(page.getByTestId('attachment-chips')).toHaveCount(0);
  let sent = '';
  await expect
    .poll(() => {
      const req = llm.requests.slice(before).find((r) => isOrb(r) && lastUser(r).includes(`[${id}]`));
      sent = req ? lastUser(req) : '';
      return !!req;
    })
    .toBe(true);
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-turn', 'completed');
  return sent;
}

let frameId = '';

test('attach by paperclip, paste and drop: a card in view, sent as context, a chip that flies to it', async () => {
  script.push(
    { toolCalls: [{ id: 'call_attach_frame', name: 'add_frame', arguments: { title: 'Evidence' } }] },
    { text: 'The Evidence frame is up.' },
  );
  await createCanvas(page, 'Is the Q3 plan sound?');
  await expect(page.getByTestId('orb-frame')).toHaveCount(1);
  frameId = (await page.getByTestId('orb-frame').getAttribute('data-frame-id'))!;
  // Fit the board: the frame fills the free view, so it is the current frame.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Shift+1');
  await page.waitForTimeout(500);

  // ---- 1. Paperclip ----
  await expect(page.getByTestId('chat-attach')).toBeVisible();
  await page.getByTestId('chat-attach-input').setInputFiles({
    name: 'Q3 memo.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Revenue grew 40% in Q3.\nChurn fell to 2%.'),
  });
  const memo = await attachedId();
  await settled();
  await expect(cardEl(memo)).toHaveAttribute('data-card-type', 'note');
  expect((await board()).cards[memo].frameId).toBe(frameId);
  await expectInView(memo);
  await expect(page.locator('[data-testid="attachment-chip"]')).toContainText('Q3 memo');
  const sent1 = await sendWith(memo, 'What does the memo say?');
  expect(sent1).toContain('What does the memo say?');
  expect(sent1).toContain(ATTACHED);
  expect(sent1).toContain(`- [${memo}] note "Q3 memo"`);
  expect(sent1).toContain('Revenue grew 40% in Q3.');
  const message1 = page.getByTestId('chat-user-message').filter({ hasText: 'What does the memo say?' });
  await expect(message1.getByTestId('message-attachment')).toHaveAttribute('data-item-id', memo);
  await expect(message1.getByTestId('message-attachment')).toHaveText('Q3 memo');
  await capture('paperclip');

  // ---- 2. Paste (an image pasted into the chat input) ----
  const png = makePng(40, 30).toString('base64');
  await page.getByTestId('orb-chat-input').focus();
  await page.evaluate((b64) => {
    const dt = new DataTransfer();
    dt.items.add(
      new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'chart.png', { type: 'image/png' }),
    );
    document
      .querySelector('[data-testid="orb-chat-input"]')!
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, png);
  const chart = await attachedId();
  await settled();
  await expect(cardEl(chart)).toHaveAttribute('data-card-type', 'image');
  await expectInOrNearFrame(chart);
  await expectInView(chart);
  // Pasted into the input, it is not ALSO pasted on the board.
  expect(Object.values((await board()).cards).filter((c: any) => c.type === 'image')).toHaveLength(1);
  // A message with only an attachment.
  const sent2 = await sendWith(chart, '');
  expect(sent2).toContain('See the attached file.');
  expect(sent2).toContain(`- [${chart}] image "chart"`);

  // ---- 3. Drop on the chat panel ----
  const cardsBefore = Object.keys((await board()).cards).length;
  const target = await page.getByTestId('chat-body').boundingBox();
  const at = { x: target!.x + target!.width / 2, y: target!.y + target!.height / 2 };
  const dragShown = await page.evaluate(({ x, y }) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['quarter,revenue\nQ2,100\nQ3,140\n'], 'revenue.csv', { type: 'text/csv' }));
    const el = document.elementFromPoint(x, y)!;
    const fire = (type: string) =>
      el.dispatchEvent(
        new DragEvent(type, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }),
      );
    fire('dragenter');
    fire('dragover');
    return new Promise<{ chat: boolean; board: boolean }>((done) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const shown = {
            chat: !!document.querySelector('[data-testid="chat-drop-target"]'),
            board: !!document.querySelector('[data-testid="drop-target"]'),
          };
          fire('drop');
          done(shown);
        }),
      ),
    );
  }, at);
  expect(dragShown).toEqual({ chat: true, board: false });
  const revenue = await attachedId();
  await settled();
  await expect(page.getByTestId('chat-drop-target')).toHaveCount(0);
  const after = (await board()).cards;
  expect(Object.keys(after)).toHaveLength(cardsBefore + 1);
  expect(after[revenue].type).toBe('table');
  await expectInOrNearFrame(revenue);
  await expectInView(revenue);
  const sent3 = await sendWith(revenue, 'Compare these.');
  expect(sent3).toContain(`- [${revenue}] table "revenue"`);
  await capture('drop');

  // The three attached cards do not overlap.
  const rects = [memo, chart, revenue].map((id) => after[id]);
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
    }

  // ---- The chip in the message flies to the card ----
  // Pan far away: the memo card is no longer drawn.
  await page.mouse.move(500, 400);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(1200, 900);
  await expect(cardEl(memo)).toHaveCount(0);
  await page.getByTestId('orb-chat-input').click(); // nothing selected on the board
  await message1.getByTestId('message-attachment').click();
  await expectInView(memo);
  await expect(cardEl(memo)).toHaveAttribute('data-selected', 'true');
  await capture('flown');

  // ---- At most 20 attachments per message (the wire's limit): the 21st file is not added and the panel says so ----
  const many = Array.from({ length: 21 }, (_, i) => ({
    name: `part ${i + 1}.md`,
    mimeType: 'text/markdown',
    buffer: Buffer.from(`Part ${i + 1}.`),
  }));
  const countBefore = Object.keys((await board()).cards).length;
  await page.getByTestId('chat-attach-input').setInputFiles(many);
  await expect(page.getByTestId('attach-note')).toContainText('at most 20');
  await expect(page.locator('[data-testid="attachment-chip"][data-state="ready"]')).toHaveCount(20);
  await settled();
  expect(Object.keys((await board()).cards)).toHaveLength(countBefore + 20);
  const last = await attachedId();
  const sent4 = await sendWith(last, 'Read all of these.');
  expect(sent4.match(/^- \[c_[0-9A-Z]{26}\] note "part /gm)).toHaveLength(20);
  await expect(page.getByTestId('orb-error')).toHaveCount(0);
  await expect(page.getByTestId('attach-note')).toHaveCount(0);
});
