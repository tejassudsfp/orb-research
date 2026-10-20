/// <reference lib="dom" />
/**
 * Gate 3, criterion 1: PRD Scenario A in one run, in the real window, with the mock LLM scripted per agent (requests
 * are routed by their system prompt, since Orb and its children call the model concurrently):
 * - the user types an idea in the Home box; Orb opens the canvas, proposes five frames (Thesis, Market, Competitors,
 *   Prototype, Open questions) and starts Scout and Critic on them in the same turn;
 * - Scout reports progress (its cursor glides to Market, then Competitors, with its label) and places source and
 *   quote cards; Critic places a risk on Thesis and a question on Open questions;
 * - the user threads on Scout's source (Orb's card lands next to it, linked) and adds a note of their own;
 * - the user asks for a first screen: Orb starts Builder, which places a design frame and a diagram in Prototype;
 * - the board ends with ≥3 frames, cards by Scout, Critic and Builder, each with its why line (the provenance view
 *   names the agent), a cursor per child on its frame, no frame above its 12-card budget, and the user's note as
 *   the user left it. A screenshot of the final board goes to .orb-dev/e2e-results/screens/gate3-scenario-a.png.
 */
import { liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { RESUME_TEXT } from '@orb/shared';
import {
  MOCK_KEY_ENV,
  MOCK_MODEL,
  MOCK_PROVIDER,
  MockLlm,
  mockProviderPatch,
  type MockRequest,
  type MockTurn,
} from '../../../scripts/testkit/mockLlm.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';

const desktopDir = resolve(import.meta.dirname, '..');

type Who = 'orb' | 'scout' | 'critic' | 'builder';
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
const trailingUser = (req: MockRequest): string => {
  const messages = req.body.messages as any[];
  const out: string[] = [];
  for (let i = messages.length - 1; i >= 0 && messages[i].role !== 'assistant'; i--)
    if (messages[i].role === 'user') out.unshift(textOf(messages[i]));
  return out.join('\n');
};
/**
 * Names of the tool calls the last assistant message made, when the request answers them (the children's progress
 * notes injected into Orb can follow the tool results as user messages).
 */
const answeredCalls = (req: MockRequest): string[] => {
  const messages = req.body.messages as any[];
  const i = messages.findLastIndex((m) => m.role === 'assistant');
  if (i < 0 || !messages.slice(i + 1).some((m) => m.role === 'tool')) return [];
  return (messages[i].tool_calls ?? []).map((c: any) => c.function?.name);
};
/** Tool results of the request (to check a child's calls succeeded). */
const toolResults = (req: MockRequest): string[] =>
  (req.body.messages as any[]).filter((m) => m.role === 'tool').map(textOf);

const IDEA = 'A research canvas where AI agents fill a board for analysts';
const FRAMES = ['Thesis', 'Market', 'Competitors', 'Prototype', 'Open questions'] as const;
type FrameTitle = (typeof FRAMES)[number];
const THREAD_MSG = 'Is this growth figure reliable?';
const BUILDER_ASK = 'Ask Builder for a first screen of the canvas.';
/** Frame ids by title, learned from Orb's add_frame results (Orb delegates to them; children work in them). */
const frames = new Map<FrameTitle, string>();
const fid = (t: FrameTitle) => frames.get(t) ?? '';
let initialPlanSent = false;
let threadAnswered = false;
let builderRequested = false;

const HTML = [
  '<!doctype html><html><head><title>Canvas</title><style>body{margin:0;font:15px sans-serif;background:#0b0f1a;',
  'color:#e8ecf5}main{padding:32px}.frame{border:1px solid #33405c;border-radius:10px;padding:12px;margin:8px 0}',
  '</style></head><body><main><h1 id="headline">Your research board</h1><div class="frame">01 Thesis</div>',
  '<div class="frame">02 Market</div><button>Ask Orb</button></main></body></html>',
].join('');
const MERMAID =
  'flowchart LR\n  A[Idea on Home] --> B[Orb proposes frames]\n  B --> C[Scout and Critic fill them]';

/** Each child's turns in order; each is built when its request arrives (the frame ids are known by then). */
const childSteps: Record<Exclude<Who, 'orb'>, Array<() => MockTurn>> = {
  scout: [
    () => call('report_progress', { status: 'Reading market reports', frameId: fid('Market') }),
    () =>
      call('place_card', {
        type: 'source',
        frameId: fid('Market'),
        title: 'Research tools market 2026',
        url: 'https://example.com/market',
        body: 'The market for research tools grows 20% a year, led by analyst teams.',
        why: 'Sizes the market for the canvas.',
      }),
    () =>
      call('place_card', {
        type: 'quote',
        frameId: fid('Market'),
        title: 'Research tools market 2026',
        body: 'Analysts spend a third of their week gathering and re-reading sources.',
        url: 'https://example.com/market',
        why: 'Shows the pain the canvas removes.',
      }),
    () => call('report_progress', { status: 'Comparing competitors', frameId: fid('Competitors') }),
    () =>
      call('place_card', {
        type: 'source',
        frameId: fid('Competitors'),
        title: 'Whiteboard tools with AI, 2026',
        url: 'https://example.com/competitors',
        // A long summary (as live models write them): the card stays at its layout size and clips it.
        body: 'Whiteboards add AI stickies, but none runs a research team on the board. '.repeat(20).trim(),
        why: 'The closest alternatives and their gap.',
      }),
    // Scout keeps reading for a while, so its cursor is seen running on the board.
    () => ({ text: 'reading '.repeat(60).trim(), chunkDelayMs: 25 }),
    () =>
      call('send_message', { about: 'done', message: 'Two sources and a quote in Market and Competitors.' }),
    () => ({ text: 'Done.' }),
  ],
  critic: [
    () => call('report_progress', { status: 'Testing the thesis', frameId: fid('Thesis') }),
    () =>
      call('place_card', {
        type: 'risk',
        frameId: fid('Thesis'),
        title: 'Analysts may not trust agent-written cards',
        body: 'Without visible sources, every card needs re-checking.',
        why: 'The thesis assumes trust the board has not earned yet.',
      }),
    () => call('report_progress', { status: 'Listing open questions', frameId: fid('Open questions') }),
    () =>
      call('place_card', {
        type: 'question',
        frameId: fid('Open questions'),
        title: 'Who pays: the analyst or the firm?',
        why: 'Pricing depends on the buyer.',
      }),
    () =>
      call('send_message', { about: 'done', message: 'One risk on Thesis, one question on Open questions.' }),
    () => ({ text: 'Done.' }),
  ],
  builder: [
    () => call('report_progress', { status: 'Drawing the first screen', frameId: fid('Prototype') }),
    () =>
      call('write_design_frame', {
        frameId: fid('Prototype'),
        title: 'Board, first screen',
        html: HTML,
        body: 'The first screen: the board with its frames.',
        why: 'The user asked for a first screen.',
      }),
    () =>
      call('place_card', {
        type: 'diagram',
        frameId: fid('Prototype'),
        title: 'From idea to board',
        mermaid: MERMAID,
        why: 'How the first minutes of a canvas flow.',
      }),
    () => call('send_message', { about: 'done', message: 'A first screen and the flow in Prototype.' }),
    () => ({ text: 'Done.' }),
  ],
};
let seq = 0;
const call = (name: string, args: Record<string, unknown>): MockTurn => ({
  toolCalls: [{ id: `call_a_${name}_${++seq}`, name, arguments: args }],
});

/** Orb, by what the request carries: the idea, tool results, a thread message, the Builder ask, or a wake. */
function orbTurn(req: MockRequest): MockTurn {
  const calls = answeredCalls(req);
  if (calls.includes('add_frame')) {
    const results = toolResults(req).slice(-FRAMES.length);
    results.forEach((r, i) => {
      const id = /"frameId":"(f_[^"]+)"/.exec(r)?.[1];
      if (id && !frames.has(FRAMES[i]!)) frames.set(FRAMES[i]!, id);
    });
    return {
      toolCalls: [
        {
          id: 'call_a_delegate_scout',
          name: 'delegate',
          arguments: {
            role: 'scout',
            frameIds: [fid('Market'), fid('Competitors')],
            instruction: 'Find market reports and the closest competitors.',
          },
        },
        {
          id: 'call_a_delegate_critic',
          name: 'delegate',
          arguments: {
            role: 'critic',
            frameIds: [fid('Thesis'), fid('Open questions')],
            instruction: 'Question the thesis and list what we do not know.',
          },
        },
      ],
    };
  }
  if (calls.includes('delegate'))
    return answeredBuilder(req)
      ? { text: 'Builder is drawing a first screen in Prototype.' }
      : { text: 'Five frames are up. Scout is reading the market; Critic is testing the thesis.' };
  if (calls.includes('place_card'))
    return { text: 'The figure comes from one report; I pinned the open question next to the source.' };
  if (calls.length) return { text: 'Done.' };
  const user = trailingUser(req);
  // Completion checkpoints repeat the original objective. They are not another Home submission:
  // this interaction fixture intentionally leaves research unfinished rather than inventing findings.
  if (user.includes(IDEA) && !initialPlanSent) {
    initialPlanSent = true;
    return {
      toolCalls: FRAMES.map((title, i) => ({
        id: `call_a_frame_${i}`,
        name: 'add_frame',
        arguments: { title },
      })),
    };
  }
  if (user.includes(THREAD_MSG) && !threadAnswered) {
    threadAnswered = true;
    return {
      toolCalls: [
        {
          id: 'call_a_thread_q',
          name: 'place_card',
          arguments: {
            type: 'question',
            title: 'Is the 20% growth from one report only?',
            body: 'Check a second source before the memo leans on it.',
            why: 'Raised in the thread on the market source.',
          },
        },
      ],
    };
  }
  if (user.includes(BUILDER_ASK) && !builderRequested) {
    builderRequested = true;
    return {
      toolCalls: [
        {
          id: 'call_a_delegate_builder',
          name: 'delegate',
          arguments: { role: 'builder', frameIds: [fid('Prototype')], instruction: 'Draw a first screen.' },
        },
      ],
    };
  }
  return { text: 'Noted.' };
}
const answeredBuilder = (req: MockRequest): boolean =>
  JSON.stringify(
    (req.body.messages as any[]).findLast((m) => m.role === 'assistant')?.tool_calls ?? [],
  ).includes('builder');

const SLOW: MockTurn = { text: 'reading '.repeat(400).trim(), chunkDelayMs: 40 };
function turnFor(req: MockRequest): MockTurn {
  const who = whoOf(req);
  byAgent[who].push(req);
  // The controls test: a redirect "Keep going." (or a Resume) gives the agent a long streaming turn.
  if (/Keep going\.|Continue where you left off\./.test(trailingUser(req))) return SLOW;
  if (who === 'orb') return orbTurn(req);
  const step = childSteps[who].shift();
  if (step) return step();
  // New evidence can legitimately reassign Critic to its first frame. Simulate its final review progress,
  // so the idle cursor still represents the last frame it reported rather than an unconsumed assignment.
  if (who === 'critic' && !answeredCalls(req).length)
    return call('report_progress', { status: 'Review complete', frameId: fid('Open questions') });
  return { text: 'Done.' };
}

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;

// The controls case continues on the board created by the first scenario.
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-scenario-a-'));
  llm = await new MockLlm({ defaultTurn: turnFor }).start();
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

const board = async () => JSON.parse((await page.getByTestId('orb-board-state').textContent()) ?? '{}');
const panel = () => page.locator('[data-testid="chat-panel"], [data-testid="chat-pill"]').first();
const idle = () => expect(panel()).toHaveAttribute('data-agents-state', 'idle', { timeout: 30_000 });
const cursor = (agent: Who) => page.locator(`[data-testid="agent-cursor"][data-agent="${agent}"]`);
const cards = (agent: Who) => page.locator(`[data-testid="orb-card"][data-agent="${agent}"]`);
const send = async (text: string) => {
  await page.getByTestId('orb-chat-input').fill(text);
  await page.getByTestId('orb-chat-send').click();
};
/** A box once the board's flight (Shift+1) has finished: two reads 150 ms apart agree. */
const stableBox = async (loc: ReturnType<Page['locator']>) => {
  let last = '';
  for (;;) {
    const box = (await loc.boundingBox())!;
    const key = JSON.stringify(box);
    if (key === last) return box;
    last = key;
    await page.waitForTimeout(150);
  }
};
/** Fit the board, select the card, zoom to it (Shift+2): it shows at full detail, with its why line. */
const focusCard = async (id: string) => {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+1');
  const card = page.locator(`[data-testid="orb-card"][data-card-id="${id}"]`);
  await stableBox(card);
  await card.getByTestId('card-select').check();
  await expect(card).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Shift+2');
  await expect(card).toHaveAttribute('data-lod', 'full');
};
/** The cursor's world x/y lies inside the frame's box. */
const cursorOn = async (agent: Who, title: FrameTitle) => {
  const f = (await board()).frames[fid(title)];
  const x = Number(await cursor(agent).getAttribute('data-x'));
  const y = Number(await cursor(agent).getAttribute('data-y'));
  return x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h;
};

test('Scenario A: from the Home box to a board with frames, Scout, Critic and Builder cards, cursors and why lines', async () => {
  // ---- Home: the idea → a canvas; Orb proposes five frames and starts Scout and Critic in the same turn.
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await page.getByTestId('home-prompt').fill(IDEA);
  await page.getByTestId('orb-create').click();
  const screen = page.getByTestId('canvas-screen');
  await expect(screen).toHaveAttribute('data-follow', 'open');
  await expect(page.getByTestId('orb-frame')).toHaveCount(FRAMES.length);
  for (const [i, title] of FRAMES.entries())
    await expect(
      page.locator(`[data-testid="orb-frame"][aria-label="${title}"]`).getByTestId('orb-frame-label'),
    ).toHaveText(`${String(i + 1).padStart(2, '0')} ${title.toUpperCase()}`);
  expect(trailingUser(byAgent.orb[0]!)).toContain(IDEA);

  // Scout's cursor glides to Market and then Competitors, with its label, while it works.
  await expect(cursor('scout').getByTestId('agent-cursor-label')).toHaveText(
    /^Scout, (reading market reports|comparing competitors)$/,
  );
  await expect(cursor('scout').getByTestId('agent-cursor-label')).toHaveText('Scout, comparing competitors');
  expect(await cursorOn('scout', 'Competitors')).toBe(true);
  await expect(page.locator('[data-testid="agent-avatar"][data-agent="scout"]')).toHaveAttribute(
    'data-state',
    'running',
  );
  await expect(cards('scout')).toHaveCount(3);
  await expect(cards('critic')).toHaveCount(2);
  await idle();
  // (Later replies to the children's "done" messages follow it in the panel.)
  await expect(page.getByTestId('chat-panel')).toContainText(
    'Five frames are up. Scout is reading the market; Critic is testing the thesis.',
  );
  // Each child's cursor stays on the frame it last reported, now idle.
  expect(await cursorOn('scout', 'Competitors')).toBe(true);
  expect(await cursorOn('critic', 'Open questions')).toBe(true);
  await expect(cursor('critic').getByTestId('agent-cursor-label')).toHaveText('Critic');
  // The turn's "On the board" group lists what each agent added.
  const activity = page.getByTestId('chat-panel').getByTestId('activity-line');
  await expect(activity.filter({ hasText: 'orb added 5 frames' })).toHaveCount(1);
  await expect(activity.filter({ hasText: /^Scout added/ }).first()).toBeVisible();
  await expect(activity.filter({ hasText: /^Critic added/ }).first()).toBeVisible();

  // ---- A thread on Scout's market source: Orb's question lands next to it, linked; the reply is in the thread.
  let state = await board();
  const sourceId = Object.values<any>(state.cards).find(
    (c) => c.data?.title === 'Research tools market 2026' && c.type === 'source',
  )!.id;
  await page
    .getByTestId('activity-line')
    .filter({ hasText: 'Scout added' })
    .getByTestId('activity-link')
    .first()
    .click();
  await page.getByTestId('chat-minimise').click();
  const source = page.locator(`[data-testid="orb-card"][data-card-id="${sourceId}"]`);
  await source.getByTestId('card-thread').click();
  const thread = page.getByTestId('thread');
  await thread.getByTestId('thread-input').fill(THREAD_MSG);
  await thread.getByTestId('thread-input').press('Enter');
  await expect(thread.getByTestId('thread-message')).toHaveCount(2);
  await expect(thread.getByTestId('thread-message').nth(1)).toHaveAttribute('data-by', 'orb');
  await expect(source.getByTestId('card-thread')).toHaveText('Thread, 2 replies');
  await expect(cards('orb')).toHaveCount(1);
  const qId = (await cards('orb').getAttribute('data-card-id'))!;
  state = await board();
  expect(state.cards[qId].frameId).toBe(fid('Market'));
  await expect(
    page.locator(`[data-testid="orb-link"][data-link-from="${sourceId}"][data-link-to="${qId}"]`),
  ).toHaveCount(1);
  await thread.getByTestId('thread-close').click();

  // ---- The user's own note, in the Prototype frame (empty so far).
  await page.keyboard.press('Shift+1');
  const proto = page.locator(`[data-testid="orb-frame"][data-frame-id="${fid('Prototype')}"]`);
  const pb = await stableBox(proto);
  await page.mouse.dblclick(pb.x + pb.width / 2, pb.y + pb.height - 24);
  await expect(page.locator('[data-testid="orb-card"][data-card-type="note"]')).toHaveCount(1);
  await expect(screen).toHaveAttribute('data-pending', '0');
  state = await board();
  const note = Object.values<any>(state.cards).find((c) => c.type === 'note')!;
  expect(note.frameId).toBe(fid('Prototype'));
  expect(note.provenance.kind).toBe('user');

  // ---- "Ask Builder for a first screen": Orb starts Builder on Prototype; a design frame and a diagram land.
  await page.keyboard.press('Escape');
  await page.getByTestId('chat-pill').click();
  await send(BUILDER_ASK);
  await expect(cursor('builder').getByTestId('agent-cursor-label')).toHaveText(/^Builder/);
  const design = page.locator('[data-testid="orb-card"][data-card-type="design"]');
  await expect(design).toHaveCount(1);
  await expect(design).toHaveAttribute('data-agent', 'builder');
  const designId = (await design.getAttribute('data-card-id'))!;
  // The live preview shows at full detail: select the card and zoom to it (Shift+2).
  await page.getByTestId('chat-minimise').click();
  await design.getByTestId('card-select').check();
  await page.keyboard.press('Shift+2');
  await expect(
    page.frameLocator(`[data-card-id="${designId}"] [data-testid="design-frame"]`).locator('#headline'),
  ).toHaveText('Your research board');
  const diagram = page.locator('[data-testid="orb-card"][data-card-type="diagram"]');
  await expect(diagram.getByTestId('card-diagram')).toHaveAttribute('data-state', 'ready');
  await idle();
  await page.getByTestId('chat-pill').click();
  expect(await cursorOn('builder', 'Prototype')).toBe(true);

  // ---- The board: ≥3 frames; Scout, Critic and Builder cards in their frames, each with a why line.
  await page.getByTestId('chat-minimise').click();
  state = await board();
  expect(Object.keys(state.frames).length).toBeGreaterThanOrEqual(3);
  const byRole = (agent: string) =>
    Object.values<any>(state.cards).filter(
      (c) => c.provenance.kind === 'agent' && c.provenance.agent === agent,
    );
  expect(
    byRole('scout')
      .map((c) => c.type)
      .sort(),
  ).toEqual(['quote', 'source', 'source']);
  expect(
    byRole('critic')
      .map((c) => c.type)
      .sort(),
  ).toEqual(['question', 'risk']);
  expect(
    byRole('builder')
      .map((c) => c.type)
      .sort(),
  ).toEqual(['design', 'diagram']);
  for (const c of byRole('builder')) expect(c.frameId).toBe(fid('Prototype'));
  for (const c of [...byRole('scout'), ...byRole('critic'), ...byRole('builder'), ...byRole('orb')]) {
    expect(c.why, c.id).toBeTruthy();
    expect([c.provenance.provider, c.provenance.model]).toEqual([MOCK_PROVIDER, MOCK_MODEL]);
    await focusCard(c.id);
    const el = page.locator(`[data-testid="orb-card"][data-card-id="${c.id}"]`);
    // At full detail an agent card keeps its layout height (its frame grew for exactly that), long body or not.
    expect(await el.evaluate((n) => (n as HTMLElement).offsetHeight)).toBe(c.h);
    const why = el.getByTestId('orb-card-why');
    await expect(why).toHaveText(new RegExp(c.why.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const [wb, cb] = [(await why.boundingBox())!, (await el.boundingBox())!];
    expect(wb.y + wb.height).toBeLessThanOrEqual(cb.y + cb.height + 0.5); // the why line is not clipped
  }
  // Budgets: no frame above 12 visible cards. The user's note is as the user left it.
  const perFrame = new Map<string, number>();
  for (const c of Object.values<any>(state.cards))
    if (c.frameId && !c.stackedInto) perFrame.set(c.frameId, (perFrame.get(c.frameId) ?? 0) + 1);
  for (const n of perFrame.values()) expect(n).toBeLessThanOrEqual(12);
  expect(state.cards[note.id]).toEqual(note);
  // Cursors for every child, each on its frame, idle now (the label is the bare name).
  for (const [who, name] of [
    ['scout', 'Scout'],
    ['critic', 'Critic'],
    ['builder', 'Builder'],
  ] as const)
    await expect(cursor(who).getByTestId('agent-cursor-label')).toHaveText(name);
  expect(await cursorOn('scout', 'Competitors')).toBe(true);
  expect(await cursorOn('critic', 'Open questions')).toBe(true);
  expect(await cursorOn('builder', 'Prototype')).toBe(true);

  // A why line opens the provenance view: Critic's risk names Critic and its call.
  const riskId = byRole('critic').find((c) => c.type === 'risk')!.id;
  await focusCard(riskId);
  const risk = page.locator(`[data-testid="orb-card"][data-card-id="${riskId}"]`);
  await risk.getByTestId('orb-card-why').click();
  const prov = page.getByTestId('provenance');
  await expect(prov.getByTestId('provenance-agent')).toHaveText('Critic');
  await expect(prov.getByTestId('provenance-model')).toHaveText(`${MOCK_PROVIDER} / ${MOCK_MODEL}`);
  await page.keyboard.press('Escape');

  // No agent was offered a tool outside its allow-list (spot check on the first request of each).
  const offered = (who: Who) => (byAgent[who][0]!.body.tools as any[]).map((t) => t.function?.name ?? t.name);
  for (const who of ['orb', 'scout', 'critic', 'builder'] as const)
    for (const banned of ['bash', 'read', 'write', 'edit', 'glob', 'grep', 'subagent', 'workflow'])
      expect(offered(who)).not.toContain(banned);
  await expect(page.getByTestId('orb-error')).toHaveCount(0);

  await page.keyboard.press('Shift+1');
  await stableBox(page.locator(`[data-testid="orb-frame"][data-frame-id="${fid('Prototype')}"]`));
  const dir = resolve(desktopDir, '..', '..', '.orb-dev', 'e2e-results', ...namespaceSegments(), 'screens');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, 'gate3-scenario-a.png') });
});

const inFlight = (who: Who) => byAgent[who].find((r) => !r.completed && !r.aborted && r.chunksSent > 0);
const avatar = (who: Who) => page.locator(`[data-testid="agent-avatar"][data-agent="${who}"]`);
const agentMenu = async (who: Who, item: 'pause' | 'stop' | 'redirect') => {
  await avatar(who).click();
  await expect(page.getByTestId('agent-menu')).toHaveAttribute('data-agent', who);
  await page.getByTestId(`agent-menu-${item}`).click();
};
const redirect = async (who: Who, text: string) => {
  if (who === 'orb') {
    await page.getByTestId('chat-menu').click();
    await page.getByTestId('redirect-orb').click();
  } else await agentMenu(who, 'redirect');
  await page.getByTestId('redirect-input').fill(text);
  await page.getByTestId('redirect-input').press('Enter');
};
const orbMenu = async (item: 'pause-orb' | 'stop-orb') => {
  await page.getByTestId('chat-menu').click();
  await page.getByTestId(item).click();
};
const requestWith = (who: Who, from: number, ...parts: string[]) =>
  byAgent[who].slice(from).some((r) => parts.every((p) => trailingUser(r).includes(p)));

test('every control works per agent on the Scenario A board: Redirect, Pause (queues), Resume, Stop', async () => {
  const chat = page.getByTestId('chat-panel');
  if (!(await chat.count())) await page.getByTestId('chat-pill').click();
  for (const who of ['scout', 'critic', 'builder', 'orb'] as const) {
    // Redirect: the agent gets the user's direction and works on it (a long stream).
    let at = byAgent[who].length;
    await redirect(who, 'Keep going.');
    await expect.poll(() => inFlight(who) !== undefined, { timeout: 15_000 }).toBe(true);
    expect(requestWith(who, at, 'Keep going.')).toBe(true);
    const stream = inFlight(who)!;

    // Pause: the stream is aborted and the agent reads paused; a redirect meanwhile is queued, not sent.
    if (who === 'orb') await orbMenu('pause-orb');
    else await agentMenu(who, 'pause');
    if (who === 'orb') await expect(chat).toHaveAttribute('data-agents-state', 'paused');
    else await expect(avatar(who)).toHaveAttribute('data-state', 'paused');
    await expect.poll(() => stream.aborted, { timeout: 2_000 }).toBe(true);
    at = byAgent[who].length;
    await redirect(who, `Note the date, ${who}.`);
    await page.waitForTimeout(500);
    expect(byAgent[who].length).toBe(at);

    // Resume: "continue" plus the queued direction, in one request; the agent works again.
    if (who === 'orb') await orbMenu('pause-orb');
    else await agentMenu(who, 'pause');
    await expect
      .poll(() => requestWith(who, at, RESUME_TEXT, `Note the date, ${who}.`), { timeout: 15_000 })
      .toBe(true);
    await expect.poll(() => inFlight(who) !== undefined, { timeout: 15_000 }).toBe(true);
    const resumed = inFlight(who)!;

    // Stop: the agent alone stops within 1 s; a child's cursor goes.
    const t = Date.now();
    if (who === 'orb') await orbMenu('stop-orb');
    else await agentMenu(who, 'stop');
    await expect.poll(() => resumed.aborted, { timeout: 1_000 }).toBe(true);
    console.log(`[gate3] ${who}: Stop → stream aborted in ${Date.now() - t} ms (UI click included)`);
    if (who === 'orb') await expect(chat).toHaveAttribute('data-agents-state', 'stopped');
    else {
      await expect(avatar(who)).toHaveAttribute('data-state', 'stopped');
      await expect(cursor(who)).toHaveCount(0);
    }
  }
  await expect(page.getByTestId('orb-error')).toHaveCount(0);
});
