/// <reference lib="dom" />
/**
 * P3.7 controls, in the real window, during a mock Scenario A (BUILD_PLAN P3.7 "Done when"):
 * - A question on Home opens a canvas; Orb (the mock LLM, scripted per agent by system prompt) proposes frames,
 *   delegates Scout and Critic, and keeps streaming while both children stream too.
 * - Stop all from the header menu, 20 times, each while Orb, Scout and Critic are all mid-stream: every run is idle
 *   within 1 s (the server's measured stop, `data-stop-ms`, and the UI reaching `stopped`), every model stream is
 *   aborted, and no settlement notice wakes Orb afterwards. Times are logged and written to
 *   .orb-dev/e2e-results/p3.7-stop-all.json (p50/p95 go to PROGRESS / HARNESS_NOTES).
 * - Pause all holds every agent (avatars and panel read paused, streams aborted); a chat message sent while paused is
 *   queued and reaches Orb only with Resume all, together with "continue"; Scout is resumed too.
 * - Redirect from Scout's avatar menu and Orb's header menu.
 */
import { liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { RESUME_TEXT } from '@orb/shared';
import {
  MOCK_KEY_ENV,
  MockLlm,
  mockProviderPatch,
  type MockRequest,
  type MockTurn,
} from '../../../scripts/testkit/mockLlm.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';
import { timingExpect } from '../../../scripts/testkit/namespace.ts';

const desktopDir = resolve(import.meta.dirname, '..');
const resultsDir = resolve(desktopDir, '..', '..', '.orb-dev', 'e2e-results', ...namespaceSegments());

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
/** Names of the tool calls the last assistant message made (when the request answers them). */
const answeredCalls = (req: MockRequest): string[] => {
  const messages = req.body.messages as any[];
  if (messages.at(-1)?.role !== 'tool') return [];
  const assistant = messages.findLast((m) => m.role === 'assistant');
  return (assistant?.tool_calls ?? []).map((c: any) => c.function?.name);
};
const slow: MockTurn = { text: 'reading '.repeat(400).trim(), chunkDelayMs: 40 };
const QUESTION = 'Should I build a research canvas for analysts?';
const FRAMES = ['Thesis', 'Market', 'Open questions'];

/** Frame ids the mock learned from add_frame results (Scenario A delegates to them). */
const frameIds: string[] = [];

/** Scenario A, per agent: Orb proposes frames, delegates Scout and Critic, then streams; the children stream. */
function turnFor(req: MockRequest): MockTurn {
  const who = whoOf(req);
  byAgent[who].push(req);
  if (who !== 'orb') return slow;
  const calls = answeredCalls(req);
  if (calls.includes('add_frame')) {
    for (const m of (req.body.messages as any[]).filter((x) => x.role === 'tool')) {
      const id = /"frameId":"(f_[^"]+)"/.exec(textOf(m))?.[1];
      if (id && !frameIds.includes(id)) frameIds.push(id);
    }
  }
  const delegate = (): MockTurn => ({
    toolCalls: [
      {
        name: 'delegate',
        arguments: {
          role: 'scout',
          frameIds: [frameIds[1] ?? frameIds[0]],
          instruction: 'Find market sources.',
        },
      },
      {
        name: 'delegate',
        arguments: {
          role: 'critic',
          frameIds: [frameIds[2] ?? frameIds[0]],
          instruction: 'Question the thesis.',
        },
      },
    ],
  });
  if (calls.includes('add_frame')) return delegate();
  if (calls.length) return slow; // after delegate: Orb keeps talking while its team works
  const user = trailingUser(req);
  if (user.includes(QUESTION))
    return { toolCalls: FRAMES.map((title) => ({ name: 'add_frame', arguments: { title } })) };
  if (/Round \d+/.test(user)) return delegate();
  if (user.includes('Focus on pricing')) return { text: 'Pricing first.' };
  return { text: 'Noted.' };
}

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-control-'));
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

const TEAM: Who[] = ['orb', 'scout', 'critic'];
const inFlight = (who: Who) => byAgent[who].find((r) => !r.completed && !r.aborted && r.chunksSent > 0);
const allStreaming = () => TEAM.every((w) => inFlight(w));
const panel = () => page.getByTestId('chat-panel');
const avatar = (agent: Who) => page.locator(`[data-testid="agent-avatar"][data-agent="${agent}"]`);
const send = async (text: string) => {
  await page.getByTestId('orb-chat-input').fill(text);
  await page.getByTestId('orb-chat-input').press('Enter');
};
const menuAction = async (testId: string) => {
  await page.getByTestId('chat-menu').click();
  await page.getByTestId(testId).click();
};
const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;

test('Scenario A: Stop all 20 times while Orb, Scout and Critic stream; every run idle within 1 s', async () => {
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await page.getByTestId('home-prompt').fill(QUESTION);
  await page.getByTestId('orb-create').click();
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await expect(page.getByTestId('orb-frame')).toHaveCount(3, { timeout: 30_000 });

  const runs: Array<{ run: number; serverMs: number; uiMs: number; agents: number }> = [];
  for (let run = 1; run <= 20; run++) {
    // Run 1 is the new-canvas turn itself; later runs start from the chat.
    if (run > 1) await send(`Round ${run}: dig into the market and question it.`);
    await expect.poll(allStreaming, { timeout: 30_000 }).toBe(true);
    const streams = TEAM.map((w) => inFlight(w)!);
    await expect(avatar('scout')).toHaveAttribute('data-state', 'running');
    await expect(avatar('critic')).toHaveAttribute('data-state', 'running');
    const orbBefore = byAgent.orb.length;

    await page.getByTestId('chat-menu').click();
    const clicked = Date.now();
    await page.getByTestId('stop-all').click();
    await expect(panel()).toHaveAttribute('data-agents-state', 'stopped', { timeout: 5_000 });
    const uiMs = Date.now() - clicked;
    const serverMs = Number(await panel().getAttribute('data-stop-ms'));
    await expect(avatar('scout')).toHaveAttribute('data-state', 'stopped');
    await expect(avatar('critic')).toHaveAttribute('data-state', 'stopped');
    for (const s of streams) await expect.poll(() => s.aborted, { timeout: 2_000 }).toBe(true);
    runs.push({ run, serverMs, uiMs, agents: 3 });
    console.log(`[P3.7 stop-all e2e] run ${run}: server ${serverMs} ms, UI ${uiMs} ms`);
    expect(serverMs).toBeGreaterThan(0);
    timingExpect(() => {
      expect(serverMs).toBeLessThan(1000);
    });
    timingExpect(() => {
      expect(uiMs).toBeLessThan(1000);
    });
    // Idle and staying idle: no child settlement notice starts an Orb turn, nobody streams again.
    await page.waitForTimeout(300);
    expect(byAgent.orb.length).toBe(orbBefore);
    expect(TEAM.some((w) => inFlight(w))).toBe(false);
    await expect(page.getByTestId('orb-error')).toHaveCount(0);
  }

  const server = runs.map((r) => r.serverMs).sort((a, b) => a - b);
  const ui = runs.map((r) => r.uiMs).sort((a, b) => a - b);
  const summary = {
    runs: runs.length,
    server: { p50: pct(server, 50), p95: pct(server, 95), max: server.at(-1) },
    ui: { p50: pct(ui, 50), p95: pct(ui, 95), max: ui.at(-1) },
    all: runs,
  };
  console.log(
    `[P3.7 stop-all e2e] 20 runs: server p50 ${summary.server.p50} / p95 ${summary.server.p95} / max ` +
      `${summary.server.max} ms; UI p50 ${summary.ui.p50} / p95 ${summary.ui.p95} / max ${summary.ui.max} ms`,
  );
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(join(resultsDir, 'p3.7-stop-all.json'), JSON.stringify(summary, null, 2));
});

test('Pause all holds every agent and queues chat; Resume all continues them; Redirect from the menus', async () => {
  await send('Round 21: once more.');
  await expect.poll(allStreaming, { timeout: 30_000 }).toBe(true);
  const streams = TEAM.map((w) => inFlight(w)!);

  await menuAction('pause-all');
  await expect(panel()).toHaveAttribute('data-agents-state', 'paused');
  await expect(avatar('scout')).toHaveAttribute('data-state', 'paused');
  await expect(avatar('critic')).toHaveAttribute('data-state', 'paused');
  await expect(page.getByTestId('chat-activity')).toHaveText('Paused');
  for (const s of streams) await expect.poll(() => s.aborted, { timeout: 2_000 }).toBe(true);
  await expect(page.locator('[data-testid="agent-cursor"][data-agent="scout"]')).toHaveCount(1);

  // A message while paused is queued: shown as queued, no model request.
  const orbBefore = byAgent.orb.length;
  await send('Also check pricing pages.');
  await expect(page.locator('[data-testid="chat-user-message"][data-queued="true"]')).toHaveText(
    'Also check pricing pages.',
  );
  await page.waitForTimeout(500);
  expect(byAgent.orb.length).toBe(orbBefore);
  expect(TEAM.some((w) => inFlight(w))).toBe(false);

  const scoutBefore = byAgent.scout.length;
  await menuAction('resume-all');
  await expect
    .poll(() => byAgent.orb.slice(orbBefore).some((r) => trailingUser(r).includes(RESUME_TEXT)), {
      timeout: 15_000,
    })
    .toBe(true);
  const resumed = byAgent.orb.slice(orbBefore).find((r) => trailingUser(r).includes(RESUME_TEXT))!;
  expect(trailingUser(resumed)).toContain('Also check pricing pages.');
  await expect
    .poll(() => byAgent.scout.slice(scoutBefore).some((r) => trailingUser(r).includes(RESUME_TEXT)), {
      timeout: 15_000,
    })
    .toBe(true);
  await expect(avatar('scout')).toHaveAttribute('data-state', 'running');
  // The queued message is now part of the conversation; the "continue" is not shown as a chat message.
  await expect(page.locator('[data-testid="chat-user-message"][data-queued="true"]')).toHaveCount(0);
  await expect(page.getByTestId('chat-user-message').last()).toHaveText('Also check pricing pages.');
  await expect(page.getByTestId('chat-panel')).not.toContainText(RESUME_TEXT);
  mkdirSync(join(resultsDir, 'screens'), { recursive: true });
  await page.screenshot({ path: join(resultsDir, 'screens', 'p3.7-resumed.png') });

  // Stop all again, then Redirect Scout from its avatar menu: it is continued with the user's direction.
  await menuAction('stop-all');
  await expect(panel()).toHaveAttribute('data-agents-state', 'stopped');
  const scoutAt = byAgent.scout.length;
  await avatar('scout').click();
  await page.getByTestId('agent-menu-redirect').click();
  await page.getByTestId('redirect-input').fill('Only primary sources from 2025.');
  await page.screenshot({ path: join(resultsDir, 'screens', 'p3.7-redirect.png') });
  await page.getByTestId('redirect-input').press('Enter');
  await expect
    .poll(
      () =>
        byAgent.scout
          .slice(scoutAt)
          .some((r) => trailingUser(r).includes('The user redirects you: Only primary sources from 2025.')),
      { timeout: 15_000 },
    )
    .toBe(true);

  // Redirect Orb from the header menu: a steer that shows as the user's message.
  const orbAt = byAgent.orb.length;
  await page.getByTestId('chat-menu').click();
  await page.getByTestId('redirect-orb').click();
  await page.getByTestId('redirect-input').fill('Focus on pricing.');
  await page.getByTestId('redirect-send').click();
  await expect
    .poll(() => byAgent.orb.slice(orbAt).some((r) => trailingUser(r).includes('Focus on pricing.')), {
      timeout: 15_000,
    })
    .toBe(true);
  await expect(page.getByTestId('orb-chat-reply')).toHaveText('Pricing first.');
  await expect(page.getByTestId('chat-user-message').last()).toHaveText('Focus on pricing.');
  await menuAction('stop-all');
  await expect(panel()).toHaveAttribute('data-agents-state', 'stopped');
  await expect(page.getByTestId('orb-error')).toHaveCount(0);
});
