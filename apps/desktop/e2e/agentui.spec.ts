/// <reference lib="dom" />
/**
 * P3.6 agent UI, in the real window, with the mock LLM scripted PER AGENT (requests are routed by their system
 * prompt, since Orb and its children call the model concurrently):
 * - the conversation panel: Orb's reply streams, and an "On the board" group under each turn lists what each agent
 *   added, linked to the cards (a click selects the card and flies to it); Stop replaces Send while agents work;
 * - cursors: Scout's cursor and label sit on the frame it reports, from `agents.status`;
 * - per-agent controls on the avatars: Stop on Scout's avatar stops Scout alone;
 * - "why it's here": the provenance popover shows the agent, model, time and tool call, and loads the turn that
 *   produced the card through the gateway's `session/page`;
 * - threads: a card's thread popover sends a grounded message; Orb's card from that turn lands next to the card,
 *   linked to it; the thread shows both messages and the card its reply count;
 * - context chip and @ mentions: `@Mar` + Enter puts the Market frame in context, the next message carries it;
 *   Up brings the last message back; Stop all from the header menu.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  MOCK_KEY_ENV,
  MOCK_MODEL,
  MOCK_PROVIDER,
  MockLlm,
  mockProviderPatch,
  type MockRequest,
  type MockTurn,
} from '../../../scripts/testkit/mockLlm.ts';
import { createCanvas, liveWindow } from './support/ui.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';
import { timingExpect } from '../../../scripts/testkit/namespace.ts';

const desktopDir = resolve(import.meta.dirname, '..');

type Who = 'orb' | 'scout' | 'critic' | 'builder';
const scripts: Record<Who, MockTurn[]> = { orb: [], scout: [], critic: [], builder: [] };
const byAgent: Record<Who, MockRequest[]> = { orb: [], scout: [], critic: [], builder: [] };
const textOf = (message: any): string =>
  typeof message?.content === 'string'
    ? message.content
    : Array.isArray(message?.content)
      ? message.content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n')
      : '';
const whoOf = (req: MockRequest): Who => {
  const system = textOf((req.body.messages as any[])[0]);
  if (system.includes('You are Scout')) return 'scout';
  if (system.includes('You are Critic')) return 'critic';
  if (system.includes('You are Builder')) return 'builder';
  return 'orb';
};
/** An Orb request that only exists because a child messaged it or settled. */
const isWake = (req: MockRequest): boolean => {
  const messages = req.body.messages as any[];
  let i = messages.length - 1;
  const trailing: any[] = [];
  for (; i >= 0 && messages[i].role !== 'assistant'; i--)
    if (messages[i].role === 'user') trailing.push(messages[i]);
  if (i >= 0 && messages[i].tool_calls?.length) return false;
  return (
    trailing.length > 0 &&
    trailing.every((m) =>
      /sent a message|Background subagent|^\[(Scout|Critic|Builder) progress\]/.test(textOf(m)),
    )
  );
};

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-agentui-'));
  llm = await new MockLlm({
    defaultTurn: (req) => {
      const who = whoOf(req);
      byAgent[who].push(req);
      if (who === 'orb' && isWake(req)) return { text: 'Noted.' };
      return (
        scripts[who].shift() ?? {
          text: who === 'orb' ? 'Research remains incomplete; check the unfinished frames.' : 'OK.',
        }
      );
    },
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
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const frameId = async (title: string) =>
  (await page.locator(`[data-testid="orb-frame"][aria-label="${title}"]`).getAttribute('data-frame-id'))!;
const board = async () => JSON.parse((await page.getByTestId('orb-board-state').textContent()) ?? '{}');
/** Screenshots for review: .orb-dev/e2e-results/screens/p3.6-<name>.png. */
const capture = async (name: string) => {
  const dir = resolve(desktopDir, '..', '..', '.orb-dev', 'e2e-results', ...namespaceSegments(), 'screens');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `p3.6-${name}.png`) });
};
const send = async (text: string) => {
  await page.getByTestId('orb-chat-input').fill(text);
  await page.getByTestId('orb-chat-send').click();
};

let marketId = '';
let sourceId = '';

test('conversation panel, On the board, cursors, per-agent Stop and the provenance view', async () => {
  scripts.orb.push(
    {
      toolCalls: ['Thesis', 'Market', 'Risks'].map((title, i) => ({
        id: `call_ui_frame_${i}`,
        name: 'add_frame',
        arguments: { title },
      })),
    },
    { text: 'Three frames are up: Thesis, Market and Risks.' },
  );
  await createCanvas(page, 'Should I build a research canvas?');
  await expect(page.getByTestId('orb-frame')).toHaveCount(3);
  marketId = await frameId('Market');
  // The new-canvas turn shows the question, Orb's reply, and what it put on the board.
  const panel = page.getByTestId('chat-panel');
  await expect(panel.getByTestId('chat-user-message').first()).toHaveText(
    'Should I build a research canvas?',
  );
  await expect(page.getByTestId('orb-chat-reply')).toHaveText(
    'Research remains incomplete; check the unfinished frames.',
  );
  await expect(page.getByTestId('research-coverage')).toContainText('0/3 sections filled');
  await expect(panel.getByTestId('activity-line').first()).toContainText('orb added 3 frames');

  scripts.orb.push(
    {
      toolCalls: [
        {
          id: 'call_ui_delegate',
          name: 'delegate',
          arguments: { role: 'scout', frameIds: [marketId], instruction: 'Find market reports.' },
        },
      ],
    },
    { text: 'Scout is on the market.', chunkDelayMs: 40 },
  );
  scripts.scout.push(
    {
      toolCalls: [
        {
          id: 'call_ui_progress',
          name: 'report_progress',
          arguments: { status: 'Reading market reports', frameId: marketId },
        },
      ],
    },
    {
      toolCalls: [
        {
          id: 'call_ui_source',
          name: 'place_card',
          arguments: {
            type: 'source',
            frameId: marketId,
            title: 'Research tools market 2026',
            url: 'https://example.com/market',
            body: 'The market for research tools grows 20% a year.',
            why: 'Sizes the market for the canvas.',
          },
        },
      ],
    },
    // Scout keeps reading (a slow turn), so its cursor stays on the board until the user stops it.
    { text: 'reading '.repeat(200).trim(), chunkDelayMs: 60 },
  );
  await send('Research the market for this.');
  // Stop replaces Send while agents work (typing brings Send back).
  await expect(page.getByTestId('orb-stop')).toBeVisible();
  await expect(page.getByTestId('orb-chat-send')).toHaveCount(0);

  // Scout's cursor glides to Market with its label; its avatar shows it working.
  const cursor = page.locator('[data-testid="agent-cursor"][data-agent="scout"]');
  await expect(cursor.getByTestId('agent-cursor-label')).toHaveText('Scout, reading market reports');
  const frameBox = await page
    .locator(`[data-testid="orb-frame"][data-frame-id="${marketId}"]`)
    .evaluate((el) => ({
      x: parseFloat((el as HTMLElement).style.left),
      w: parseFloat((el as HTMLElement).style.width),
    }));
  const cx = Number(await cursor.getAttribute('data-x'));
  expect(cx).toBeGreaterThan(frameBox.x);
  expect(cx).toBeLessThan(frameBox.x + frameBox.w);
  await expect(page.locator('[data-testid="agent-avatar"][data-agent="scout"]')).toHaveAttribute(
    'data-state',
    'running',
  );

  // Its card lands, and the turn's "On the board" group links to it.
  const source = page.locator('[data-testid="orb-card"][data-agent="scout"]');
  await expect(source).toHaveCount(1);
  sourceId = (await source.getAttribute('data-card-id'))!;
  const line = panel.getByTestId('activity-line').filter({ hasText: 'Scout added a source to 02 Market' });
  await expect(line).toHaveCount(1);
  await line.getByTestId('activity-link').click();
  await expect(source).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('chat-activity')).toContainText(/working/);
  await capture('cursor-activity');

  // Per-agent Stop on Scout's avatar: Scout alone stops; its cursor goes.
  await page.locator('[data-testid="agent-avatar"][data-agent="scout"]').click();
  await expect(page.getByTestId('agent-menu')).toHaveAttribute('data-agent', 'scout');
  await expect(page.getByTestId('agent-menu-state')).toContainText('Working');
  await page.getByTestId('agent-menu-stop').click();
  await expect(page.locator('[data-testid="agent-avatar"][data-agent="scout"]')).toHaveAttribute(
    'data-state',
    'stopped',
    {
      timeout: 5_000,
    },
  );
  await expect(cursor).toHaveCount(0);
  await expect(panel).not.toHaveAttribute('data-agents-state', 'stopped');

  // "Why it's here": agent, model, time, tool call; the turn loads through session/page.
  await page.getByTestId('chat-minimise').click();
  await source.getByTestId('orb-card-why').click();
  const why = page.getByTestId('provenance');
  await expect(why).toBeVisible();
  await expect(why.getByTestId('provenance-agent')).toHaveText('Scout');
  await expect(why.getByTestId('provenance-model')).toHaveText(`${MOCK_PROVIDER} / ${MOCK_MODEL}`);
  await expect(why.getByTestId('provenance-call')).toHaveText('call_ui_source');
  await expect(why.getByTestId('provenance-time')).not.toBeEmpty();
  await why.getByTestId('provenance-load').click();
  await expect(why.getByTestId('provenance-own-call')).toContainText('place_card(');
  await expect(why.getByTestId('provenance-own-call')).toContainText('Research tools market 2026');
  await expect(why.getByTestId('provenance-turn')).toContainText('Find market reports.');
  await capture('provenance');
  await page.keyboard.press('Escape');
  await expect(why).toHaveCount(0);
  await page.getByTestId('chat-pill').click();
  await expect(page.getByTestId('orb-error')).toHaveCount(0);
});

test("a card's thread: a grounded message, Orb's card next to it and linked, the reply and the count", async () => {
  // Let Orb's turns settle first (P3.7: the notice of the Scout the user stopped no longer wakes Orb; a turn it
  // would have started ends `blocked` without a model request).
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-turn', /^(completed|aborted|blocked)$/);
  const panelUsers = await page.getByTestId('chat-user-message').count();
  scripts.orb.push(
    {
      toolCalls: [
        {
          id: 'call_ui_thread_q',
          name: 'place_card',
          arguments: {
            type: 'question',
            title: 'Who pays for research tools?',
            body: 'The 20% growth says nothing about buyers.',
            why: 'Raised in the thread on the market source.',
          },
        },
      ],
    },
    { text: 'Growth is real, but the buyer is unclear. I pinned the question next to the source.' },
  );
  const source = page.locator(`[data-testid="orb-card"][data-card-id="${sourceId}"]`);
  await source.getByTestId('card-thread').click();
  const thread = page.getByTestId('thread');
  await expect(thread.getByTestId('thread-title')).toHaveText('THREAD ON RESEARCH TOOLS MARKET 2026');
  await thread.getByTestId('thread-input').fill('Is this growth figure reliable?');
  await thread.getByTestId('thread-input').press('Enter');

  await expect(thread.getByTestId('thread-message')).toHaveCount(2);
  await expect(thread.getByTestId('thread-message').first()).toHaveText('Is this growth figure reliable?');
  await expect(thread.getByTestId('thread-message').nth(1)).toHaveText(
    'Growth is real, but the buyer is unclear. I pinned the question next to the source.',
  );
  await expect(thread.getByTestId('thread-message').nth(1)).toHaveAttribute('data-by', 'orb');
  await expect(source.getByTestId('card-thread')).toHaveText('Thread, 2 replies');
  // The model got the card's content with the message.
  // Inspect the first grounded request, before automatic completion notices repeat the objective.
  const req = byAgent.orb.find((r) =>
    textOf((r.body.messages as any[]).findLast((m: any) => m.role === 'user')).includes(
      'Is this growth figure reliable?',
    ),
  )!;
  expect(textOf((req.body.messages as any[]).findLast((m: any) => m.role === 'user'))).toContain(
    `<thread of="${sourceId}">`,
  );

  // Orb's card from the thread turn: in the source's frame, next to it, linked from it.
  const question = page.locator('[data-testid="orb-card"][data-card-type="question"]');
  await expect(question).toHaveCount(1);
  const qId = (await question.getAttribute('data-card-id'))!;
  const state = await board();
  const q = state.cards[qId];
  const src = state.cards[sourceId];
  expect(q.frameId).toBe(marketId);
  expect(
    (q.y === src.y && q.x - (src.x + src.w) >= 0 && q.x - (src.x + src.w) <= 32) ||
      (q.x === src.x && q.y - (src.y + src.h) >= 0 && q.y - (src.y + src.h) <= 32),
  ).toBe(true);
  await expect(
    page.locator(`[data-testid="orb-link"][data-link-from="${sourceId}"][data-link-to="${qId}"]`),
  ).toHaveCount(1);
  await capture('thread');
  // Thread turns stay out of the main conversation.
  await expect(page.getByTestId('chat-user-message')).toHaveCount(panelUsers);
  await thread.getByTestId('thread-close').click();
  await expect(thread).toHaveCount(0);

  // Frames have threads too.
  // (a frame shows its Thread button when it is selected or has a thread)
  const market = page.locator(`[data-testid="orb-frame"][data-frame-id="${marketId}"]`);
  await expect(market.getByTestId('frame-thread')).toHaveCount(0);
  await market.getByTestId('orb-frame-label').click();
  await market.getByTestId('frame-thread').click();
  await expect(page.getByTestId('thread').getByTestId('thread-title')).toHaveText('THREAD ON MARKET');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('thread')).toHaveCount(0);
});

test('context chip and @ mentions; Up edits the last message; Stop all from the header menu', async () => {
  const input = page.getByTestId('orb-chat-input');
  await input.fill('');
  await input.pressSequentially('@Mar');
  await expect(page.getByTestId('mention-option').first()).toHaveText(/02 Market/);
  await input.press('Enter');
  await expect(page.getByTestId('context-chip')).toHaveCount(1);
  await expect(page.getByTestId('context-chip')).toHaveAttribute('data-item-id', marketId);
  await expect(page.getByTestId('context-chips')).toContainText('02 Market');
  await expect(input).toHaveValue('');
  await input.pressSequentially('@Re');
  await expect(page.getByTestId('mention-list')).toBeVisible();
  await capture('mentions');
  await input.fill('');

  scripts.orb.push({ text: 'Market holds one source and one open question.' });
  await input.pressSequentially('What is in here?');
  await input.press('Enter');
  await expect(page.getByTestId('orb-chat-reply')).toHaveText(
    'Market holds one source and one open question.',
  );
  const req = byAgent.orb.findLast((r) =>
    textOf((r.body.messages as any[]).findLast((m: any) => m.role === 'user')).includes('What is in here?'),
  )!;
  const sent = textOf((req.body.messages as any[]).findLast((m: any) => m.role === 'user'));
  expect(sent).toContain('<board-context>');
  expect(sent).toContain(marketId);
  // The chip stays pinned; the message shows how much was in context.
  await expect(page.getByTestId('context-chip')).toHaveCount(1);
  await expect(page.getByTestId('chat-user-message').last()).toContainText('1 in context');
  await page.getByTestId('context-chip-remove').click();
  await expect(page.getByTestId('context-chip')).toHaveCount(0);

  // Up in the empty box brings the last message back; Shift+Enter adds a line.
  await input.press('ArrowUp');
  await expect(input).toHaveValue('What is in here?');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('What is in here?\n');
  await input.fill('');

  // Stop all from the header menu while Orb streams.
  scripts.orb.push({ text: 'slow '.repeat(200).trim(), chunkDelayMs: 50 });
  await send('Write a long answer.');
  await expect(page.getByTestId('orb-chat-reply')).toContainText('slow slow');
  await page.getByTestId('chat-menu').click();
  await page.getByTestId('stop-all').click();
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-agents-state', 'stopped', {
    timeout: 5_000,
  });
  const stopMs = Number(await page.getByTestId('chat-panel').getAttribute('data-stop-ms'));
  timingExpect(() => {
    expect(stopMs).toBeLessThan(1000);
  });
  await expect(page.getByTestId('orb-error')).toHaveCount(0);
});
