/**
 * Crash durability (BUILD_PLAN P1.7 "Done when"): a child process writing board events through the built
 * CanvasStore is killed with SIGKILL. On reopen, at most ~250 ms (the flush window) of events is lost, every line
 * on disk is a valid event with contiguous seq, and a torn tail (simulated: a crash mid-write) is truncated.
 * Needs `pnpm build` first (the child imports lib/).
 */
import { spawn } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { afterAll, describe, expect, it } from 'vitest';
import { BOARD_FILE, CanvasStore, DEFAULT_FLUSH_MS, scanBoardLog } from '../src/index.js';

const FIXTURE = resolve(import.meta.dirname, 'fixtures', 'crash-writer.mjs');
/** Timer jitter + one write/fdatasync on a loaded machine, on top of the 250 ms flush window. */
const SLACK_MS = 100;
const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});

async function writeThenKill(runMs: number) {
  const home = mkdtempSync(join(tmpdir(), 'orb-crash-'));
  homes.push(home);
  const child = spawn(process.execPath, [FIXTURE, home], { stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise<NodeJS.Signals | null>((r) => child.once('exit', (_code, signal) => r(signal)));
  const lines = createInterface({ input: child.stdout! });
  const ready = await new Promise<{ id: string; cardId: string }>((res, rej) => {
    lines.once('line', (l) => res(JSON.parse(l)));
    child.once('exit', () => rej(new Error('crash-writer exited early')));
  });
  await new Promise((r) => setTimeout(r, runMs));
  const killedAt = Date.now();
  child.kill('SIGKILL');
  expect(await exited).toBe('SIGKILL');
  return { home, killedAt, ...ready };
}

describe('board.jsonl survives kill -9', () => {
  for (const runMs of [300, 700, 1200]) {
    it(`loses at most the flush window and leaves no corrupt line (killed after ${runMs} ms)`, async () => {
      const { home, killedAt, id, cardId } = await writeThenKill(runMs);
      const path = join(home, 'canvases', id, BOARD_FILE);
      const raw = readFileSync(path);
      const scan = scanBoardLog(raw);
      // Every byte on disk is a committed, valid, contiguous line: no torn or corrupt tail from the kill.
      expect(scan).toMatchObject({ goodBytes: raw.length, droppedLines: 0, corruptAt: null });
      expect(scan.events.length).toBeGreaterThan(10);
      expect(scan.events.map((e) => e.seq)).toEqual(scan.events.map((_, i) => i));
      const lastTs = scan.events.at(-1)!.ts;
      const lostMs = killedAt - lastTs;
      expect(lostMs).toBeLessThanOrEqual(DEFAULT_FLUSH_MS + SLACK_MS);

      // Reopen through the service: the fold rebuilds the state from the log.
      const store = new CanvasStore({ home });
      const board = await store.board(id);
      expect(board.nextSeq).toBe(scan.events.length);
      const lastMove = scan.events.at(-1)!.data as { x: number };
      expect(board.card(cardId)!.x).toBe(lastMove.x);
      await store.close();
    });
  }

  it('a torn tail left by a crash mid-write is truncated on open and appends continue cleanly', async () => {
    const { home, id, cardId } = await writeThenKill(300);
    const path = join(home, 'canvases', id, BOARD_FILE);
    const before = readFileSync(path);
    const committed = scanBoardLog(before).events.length;
    appendFileSync(path, '{"v":1,"seq":' + committed + ',"ts":17,"type":"card.mo');
    const store = new CanvasStore({ home });
    const board = await store.board(id);
    expect(board.recovery.droppedLines).toBe(1);
    expect(readFileSync(path).equals(before)).toBe(true);
    const event = await store.command(id, { type: 'card.moved', id: cardId, x: -1, y: -1 });
    expect(event.seq).toBe(committed);
    await store.close();
    const after = scanBoardLog(readFileSync(path));
    expect(after).toMatchObject({ droppedLines: 0, corruptAt: null });
    expect(after.events).toHaveLength(committed + 1);
  });
});
