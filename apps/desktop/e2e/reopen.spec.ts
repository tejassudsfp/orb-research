/// <reference lib="dom" />
/**
 * P1.9 reopen test, in the real app. Each run:
 *   1. launches Orb (temp homes, default model routed to the local mock LLM), creates a canvas, and has the root
 *      Orb agent place 3 cards (three sequential `place_card` tool turns);
 *   2. ends the app: a clean quit (run 1), or `kill -9` of the Electron main process AND the sidecar while the
 *      agent's next model call is still streaming (run 2, at least 600 ms after the last card, so past the 250 ms
 *      board batch window);
 *   3. relaunches on the same homes and opens the canvas from the list;
 *   4. sends another prompt that refers to the earlier conversation.
 * Done when: the board matches exactly (UI fold == fold(board.jsonl) == the board before the restart, and
 * board.jsonl is byte-identical), the canvas keeps its root session, which orb-agents resumed through the harness
 * resume path (`ctx.agents.resume`: a `request/header` with `reason: "resume"` in the session log), the model's
 * next request carries the earlier history, and no `SessionFormatUnsupportedError` appears in the sidecar log.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { fold, type BoardEvent, type BoardState } from '@orb/shared';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  MOCK_KEY_ENV,
  MockLlm,
  mockProviderPatch,
  type MockRequest,
} from '../../../scripts/testkit/mockLlm.ts';
import { listSessionIds, readSessionLog } from '../../../scripts/testkit/sessionLog.ts';
import { createCanvas, liveWindow } from './support/ui.ts';

const desktopDir = resolve(import.meta.dirname, '..');

type Run = { tmp: string; llm: MockLlm; patchFile: string };
type Launched = { app: ElectronApplication; page: Page };

const FIRST_PROMPT = 'Put three cards about the Kepler space telescope on the board.';
const CARDS = [
  { title: 'Kepler: mission', body: 'Launched 2009 to find Earth-size planets.', why: 'Sets the scene.' },
  { title: 'Kepler: transit method', body: 'Measures dips in starlight.', why: 'How it found planets.' },
  { title: 'Kepler: legacy', body: 'Over 2,600 confirmed exoplanets.', why: 'Why it mattered.' },
];
const FOLLOW_UP = 'Which card did you place second, and why?';

async function launch(run: Run): Promise<Launched> {
  const app = await electron.launch({
    args: [desktopDir],
    env: {
      ...process.env,
      ORB_DSH_HOME: join(run.tmp, 'dsh'),
      ORB_HOME: join(run.tmp, 'Orb'),
      ORB_USER_DATA: join(run.tmp, 'electron'),
      ORB_EXTRA_PATCH_FILE: run.patchFile,
      [MOCK_KEY_ENV]: 'orb-mock-key',
    } as Record<string, string>,
  });
  const page = await liveWindow(app);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('orb-ping')).toHaveText(/^orb-host /);
  return { app, page };
}

const boardFile = (run: Run, canvasId: string) => join(run.tmp, 'Orb', 'canvases', canvasId, 'board.jsonl');
const readBoardFile = (run: Run, canvasId: string) => {
  try {
    return readFileSync(boardFile(run, canvasId), 'utf8');
  } catch {
    return '';
  }
};
const eventsOf = (text: string): BoardEvent[] =>
  text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BoardEvent);
const uiBoard = async (page: Page): Promise<BoardState> =>
  JSON.parse((await page.getByTestId('orb-board-state').textContent())!) as BoardState;

/** Create a canvas and have the agent place the 3 cards. `holdLastTurn` keeps the agent's final reply streaming. */
async function createCanvasWithThreeCards(run: Run, page: Page, holdLastTurn: boolean) {
  const { canvasId, sessionId } = await createCanvas(page, 'Kepler space telescope');
  // Home started Orb's new-canvas turn (P3.3; the mock's default greeting, already ended): requests after it.
  const base = run.llm.requests.length;

  run.llm.enqueue(
    ...CARDS.map((card, i) => ({
      toolCalls: [{ id: `call_kepler_${i + 1}`, name: 'place_card', arguments: { type: 'doc', ...card } }],
    })),
    holdLastTurn
      ? { text: 'All three Kepler cards are placed.', firstDelayMs: 120_000 }
      : { text: 'All three Kepler cards are placed.' },
  );
  await page.getByTestId('orb-chat-input').fill(FIRST_PROMPT);
  await page.getByTestId('orb-chat-send').click();

  await expect(page.getByTestId('orb-card')).toHaveCount(3);
  await expect(page.getByTestId('orb-card-title')).toHaveText(CARDS.map((c) => c.title));
  if (holdLastTurn) {
    // The 4th model call (after the 3rd tool result) is open and held: the agent is mid-turn.
    await run.llm.waitForRequest((r) => r.id === base + 4);
    await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-turn', 'running');
  } else {
    await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-turn', 'completed');
  }
  await expect(page.getByTestId('orb-error')).toHaveCount(0);
  return { canvasId, sessionId, base, board: await uiBoard(page) };
}

/** The Electron main process's sidecar (the dsh bin it spawned under ELECTRON_RUN_AS_NODE). */
function sidecarPid(mainPid: number): number {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,command='], { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => m !== null);
  const hit = rows.find((m) => Number(m[2]) === mainPid && m[3]!.includes('dsh/lib/bin.js'));
  if (!hit) throw new Error(`no sidecar child of ${mainPid}`);
  return Number(hit[1]);
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Reopen the canvas after a restart and check the board, the resumed session and the history. */
async function reopenAndVerify(
  run: Run,
  page: Page,
  before: { canvasId: string; sessionId: string; board: BoardState; boardText: string },
) {
  // Board on disk: byte-identical, 3 events (nothing lost, nothing torn).
  const boardText = readBoardFile(run, before.canvasId);
  expect(boardText).toBe(before.boardText);
  expect(eventsOf(boardText).map((e) => e.seq)).toEqual([0, 1, 2]);

  // Open it from the list: the host resumes the root agent before answering.
  const open = page.locator(`[data-testid="orb-canvas-open"][data-canvas-id="${before.canvasId}"]`);
  await expect(open).toHaveCount(1);
  await open.click();
  const screen = page.getByTestId('canvas-screen');
  await expect(screen).toHaveAttribute('data-canvas-id', before.canvasId);
  await expect(screen).toHaveAttribute('data-follow', 'open');
  await expect(screen).toHaveAttribute('data-session-id', before.sessionId);
  await expect(screen).toHaveAttribute('data-snapshot', '3 cards, next seq 3');
  await expect(page.getByTestId('orb-card-title')).toHaveText(CARDS.map((c) => c.title));
  await expect(page.getByTestId('orb-error')).toHaveCount(0);

  // The board matches exactly: UI fold == fold(board.jsonl) == the board before the restart.
  const after = await uiBoard(page);
  expect(after).toEqual(before.board);
  expect(after).toEqual(fold(eventsOf(boardText)));

  // The canvas still points at the same root session (no new session was created on open).
  const meta = JSON.parse(
    readFileSync(join(run.tmp, 'Orb', 'canvases', before.canvasId, 'canvas.json'), 'utf8'),
  );
  expect(meta.rootSessionId).toBe(before.sessionId);

  // Another prompt that refers to the earlier context: the model request carries the earlier history.
  const sentBefore = run.llm.requests.length;
  run.llm.enqueue({
    text: 'The second card was "Kepler: transit method": it explains how Kepler found planets.',
  });
  await page.getByTestId('orb-chat-input').fill(FOLLOW_UP);
  await page.getByTestId('orb-chat-send').click();
  const request: MockRequest = await run.llm.waitForRequest(
    (r) => r.id > sentBefore && JSON.stringify(r.body.messages).includes(FOLLOW_UP),
  );
  await expect(page.getByTestId('orb-chat-reply')).toContainText('Kepler: transit method');
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-turn', 'completed');
  await expect(page.getByTestId('orb-error')).toHaveCount(0);

  const messages = request.body.messages as Array<{
    role: string;
    content?: unknown;
    tool_calls?: any[];
    tool_call_id?: string;
  }>;
  const text = (m: { content?: unknown }) =>
    typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
  const users = messages.filter((m) => m.role === 'user').map(text);
  expect(users.some((t) => t.includes(FIRST_PROMPT))).toBe(true);
  expect(users.at(-1)).toContain(FOLLOW_UP);
  // The three earlier place_card calls, in order, each followed by its tool result naming the placed card.
  const calls = messages.flatMap((m) => (m.role === 'assistant' ? (m.tool_calls ?? []) : []));
  expect(calls.map((c) => [c.id, c.function.name, JSON.parse(c.function.arguments).title])).toEqual(
    CARDS.map((c, i) => [`call_kepler_${i + 1}`, 'place_card', c.title]),
  );
  const results = messages.filter((m) => m.role === 'tool');
  expect(results.map((m) => m.tool_call_id)).toEqual(CARDS.map((_, i) => `call_kepler_${i + 1}`));
  const cardIds = Object.keys(before.board.cards);
  for (const id of cardIds) expect(results.some((m) => text(m).includes(id))).toBe(true);
  // The follow-up is the last message: the history comes first.
  expect(messages.at(-1)!.role).toBe('user');
  expect(messages.findIndex((m) => m.role === 'user' && text(m).includes(FIRST_PROMPT))).toBeLessThan(
    messages.length - 1,
  );
  return request;
}

/** Harness resume path + no format errors, from the session log and the sidecar log. */
function verifyResumeLogs(run: Run, sessionId: string, killedMidTurn: boolean, cutTurnEnd = 'interrupted') {
  const events = readSessionLog(join(run.tmp, 'dsh'), sessionId);
  const headers = events.filter((e) => e.type === 'request/header').map((e) => e.data?.reason);
  // The first launch's agent logged `initial`; the resumed agent (agents.resume) logged `resume`.
  expect(headers[0]).toBe('initial');
  expect(headers).toContain('resume');
  const turnEnds = events.filter((e) => e.type === 'turn/end').map((e) => e.data?.reason?.kind);
  // The new-canvas turn Home started (P3.3), then the Kepler turn, then the follow-up after the reopen.
  // A turn cut by kill -9 is closed by the resume itself (dsh-agent-loop `interruptedTurnClosers`).
  expect(turnEnds).toEqual(
    killedMidTurn ? ['completed', cutTurnEnd, 'completed'] : ['completed', 'completed', 'completed'],
  );
  // Exactly one harness session exists for the canvas: reopening never created a second one.
  expect(listSessionIds(join(run.tmp, 'dsh'))).toEqual([sessionId]);
  const sidecarLog = readFileSync(join(run.tmp, 'logs', 'sidecar.log'), 'utf8');
  expect(
    sidecarLog.match(new RegExp(`\\[orb-agents\\] resumed root session ${sessionId}`, 'g')),
  ).toHaveLength(1);
  expect(sidecarLog).not.toContain('SessionFormatUnsupportedError');
  expect(sidecarLog).not.toMatch(
    /unsupported session|SessionPersistenceCorruptionError|^\S+ \[err\] error /im,
  );
}

let run: Run;
let current: Launched | undefined;

test.beforeEach(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-reopen-'));
  const llm = await new MockLlm().start();
  const patchFile = join(tmp, 'mock.patch.yml');
  writeFileSync(patchFile, mockProviderPatch(llm.baseURL));
  run = { tmp, llm, patchFile };
});

test.afterEach(async () => {
  await current?.app.close().catch(() => undefined);
  current = undefined;
  await run?.llm.close();
  // ORB_E2E_KEEP=1 keeps the temp homes (sidecar log, session artifacts) for inspection.
  if (process.env.ORB_E2E_KEEP) console.log(`kept ${run.tmp}`);
  else rmSync(run.tmp, { recursive: true, force: true });
});

test('quit, relaunch: the board is exact and the root session resumes with its history', async () => {
  current = await launch(run);
  const created = await createCanvasWithThreeCards(run, current.page, false);
  await expect.poll(() => eventsOf(readBoardFile(run, created.canvasId)).length).toBe(3);

  // Clean quit: Electron's before-quit stops the sidecar (SIGTERM), which flushes the board and the session.
  await current.app.close();
  current = undefined;
  const boardText = readBoardFile(run, created.canvasId);

  current = await launch(run);
  await reopenAndVerify(run, current.page, { ...created, boardText });
  verifyResumeLogs(run, created.sessionId, false);
});

test('kill -9 of Electron and the sidecar mid-session, relaunch: the board is exact and the session resumes', async () => {
  current = await launch(run);
  const created = await createCanvasWithThreeCards(run, current.page, true);

  // > 250 ms after the last card (the board batch window), with the agent's next model call still streaming.
  await current.page.waitForTimeout(600);
  const boardText = readBoardFile(run, created.canvasId);
  expect(eventsOf(boardText)).toHaveLength(3);

  const mainPid = current.app.process().pid!;
  const sidePid = sidecarPid(mainPid);
  process.kill(sidePid, 'SIGKILL');
  process.kill(mainPid, 'SIGKILL');
  await expect.poll(() => alive(mainPid) || alive(sidePid)).toBe(false);
  current = undefined;
  // The held model call was cut by the kill.
  await expect.poll(() => run.llm.requests[created.base + 3]?.aborted).toBe(true);

  current = await launch(run);
  await reopenAndVerify(run, current.page, { ...created, boardText });
  verifyResumeLogs(run, created.sessionId, true);
});

test('kill -9 of Electron main only: the orphaned sidecar shuts itself down, relaunch resumes the session', async () => {
  current = await launch(run);
  const created = await createCanvasWithThreeCards(run, current.page, true);
  await current.page.waitForTimeout(600);
  const boardText = readBoardFile(run, created.canvasId);
  expect(eventsOf(boardText)).toHaveLength(3);

  // Force Quit / crash of the main process only: the sidecar is not signalled by anyone. Its parent watch
  // (ORB_PARENT_PID, @orb/host/web-shell) sees the parent gone and shuts it down, releasing the session lock.
  const mainPid = current.app.process().pid!;
  const sidePid = sidecarPid(mainPid);
  process.kill(mainPid, 'SIGKILL');
  await expect.poll(() => alive(mainPid)).toBe(false);
  current = undefined;
  const t0 = Date.now();
  await expect.poll(() => alive(sidePid), { timeout: 15_000 }).toBe(false);
  console.log(`[P1.gate] orphaned sidecar exited ${Date.now() - t0} ms after main was killed`);
  await expect.poll(() => run.llm.requests[created.base + 3]?.aborted).toBe(true);

  current = await launch(run);
  await reopenAndVerify(run, current.page, { ...created, boardText });
  // The orphan shut down gracefully, so the cut turn was committed as aborted by its own shutdown, or closed as
  // interrupted by the resume if the shutdown did not get that far.
  const turnEnd = readSessionLog(join(run.tmp, 'dsh'), created.sessionId)
    .filter((e) => e.type === 'turn/end')
    .map((e) => e.data?.reason?.kind)[1]; // [0] is the new-canvas turn Home started (P3.3)
  console.log(`[P1.gate] cut turn ended as ${turnEnd}`);
  expect(['aborted', 'interrupted', 'disposed']).toContain(turnEnd);
  verifyResumeLogs(run, created.sessionId, true, turnEnd);
});
