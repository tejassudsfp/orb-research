import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BoardEvent } from '@orb/shared';
import { BoardLog, scanBoardLog } from '../src/index.js';

const user = { kind: 'user' } as const;
const ev = (seq: number): BoardEvent => ({
  v: 1,
  seq,
  ts: 1_000 + seq,
  type: 'card.added',
  actor: user,
  data: {
    card: {
      id: `c_${seq}`,
      type: 'note',
      frameId: null,
      x: seq,
      y: 0,
      w: 1,
      h: 1,
      data: {},
      provenance: { ...user, at: 1 },
    },
  },
});
const line = (seq: number) => `${JSON.stringify(ev(seq))}\n`;

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orb-boardlog-'));
  path = join(dir, 'board.jsonl');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('BoardLog write and reopen', () => {
  it('creates the file, appends lines, and replays them on reopen', async () => {
    const { log, events, recovery } = await BoardLog.open(path);
    expect(events).toEqual([]);
    expect(recovery).toEqual({ truncatedBytes: 0, droppedLines: 0 });
    for (let i = 0; i < 5; i++) log.append(ev(i));
    await log.close();
    expect(readFileSync(path, 'utf8')).toBe([0, 1, 2, 3, 4].map(line).join(''));
    const again = await BoardLog.open(path);
    expect(again.events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4]);
    again.log.append(ev(5));
    await again.log.close();
    const third = await BoardLog.open(path);
    expect(third.events).toHaveLength(6);
    await third.log.close();
  });

  it('batches: nothing reaches the file before the flush window, everything after it', async () => {
    const { log } = await BoardLog.open(path, { flushMs: 120 });
    log.append(ev(0));
    log.append(ev(1));
    expect(log.pendingLines).toBe(2);
    await new Promise((r) => setTimeout(r, 30));
    expect(statSync(path).size).toBe(0);
    await new Promise((r) => setTimeout(r, 200));
    expect(log.pendingLines).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(line(0) + line(1));
    await log.close();
  });

  it('flush() writes immediately; close() flushes pending lines', async () => {
    const { log } = await BoardLog.open(path, { flushMs: 60_000 });
    log.append(ev(0));
    await log.flush();
    expect(readFileSync(path, 'utf8')).toBe(line(0));
    log.append(ev(1));
    await log.close();
    expect(readFileSync(path, 'utf8')).toBe(line(0) + line(1));
    expect(() => log.append(ev(2))).toThrow(/closed/);
  });

  it('serializes concurrent flushes without interleaving', async () => {
    const { log } = await BoardLog.open(path, { flushMs: 60_000 });
    const flushes: Promise<void>[] = [];
    for (let i = 0; i < 200; i++) {
      log.append(ev(i));
      if (i % 7 === 0) flushes.push(log.flush());
    }
    await Promise.all(flushes);
    await log.close();
    const scan = scanBoardLog(readFileSync(path));
    expect(scan.events.map((e) => e.seq)).toEqual(Array.from({ length: 200 }, (_, i) => i));
    expect(scan.droppedLines).toBe(0);
  });
});

describe('BoardLog tail repair on open', () => {
  it('truncates a torn (unterminated) last line', async () => {
    const good = line(0) + line(1);
    writeFileSync(path, good + line(2).slice(0, 37));
    const { log, events, recovery } = await BoardLog.open(path);
    expect(events.map((e) => e.seq)).toEqual([0, 1]);
    expect(recovery).toEqual({ truncatedBytes: 37, droppedLines: 1 });
    expect(readFileSync(path, 'utf8')).toBe(good);
    log.append(ev(2));
    await log.close();
    expect(readFileSync(path, 'utf8')).toBe(good + line(2));
  });

  it('truncates a complete JSON line that lost its newline (not committed)', async () => {
    writeFileSync(path, line(0) + line(1).trimEnd());
    const { log, events } = await BoardLog.open(path);
    expect(events).toHaveLength(1);
    await log.close();
    expect(readFileSync(path, 'utf8')).toBe(line(0));
  });

  it('truncates a run of invalid tail lines (garbage, NULs, wrong seq)', async () => {
    const good = line(0) + line(1);
    writeFileSync(path, `${good}${line(7)}\u0000\u0000\u0000\n{"v":1,"seq":\nnot json`);
    const { log, events, recovery } = await BoardLog.open(path);
    expect(events).toHaveLength(2);
    expect(recovery.droppedLines).toBe(4);
    expect(readFileSync(path, 'utf8')).toBe(good);
    await log.close();
  });

  it('refuses (and does not modify) a log with garbage BEFORE valid events', async () => {
    const content = `${line(0)}garbage\n${line(2)}`;
    writeFileSync(path, content);
    await expect(BoardLog.open(path)).rejects.toMatchObject({ code: 'orb/board-corrupt' });
    expect(readFileSync(path, 'utf8')).toBe(content);
  });

  it('an empty file and a file of only a torn line both open empty', async () => {
    writeFileSync(path, '');
    const first = await BoardLog.open(path);
    expect(first.events).toEqual([]);
    await first.log.close();
    writeFileSync(path, '{"v":1,"se');
    const { log, events } = await BoardLog.open(path);
    expect(events).toEqual([]);
    await log.close();
    expect(readFileSync(path, 'utf8')).toBe('');
  });

  it('appends after a repaired tail produce a clean log', async () => {
    writeFileSync(path, line(0));
    appendFileSync(path, line(1).slice(0, 10));
    const { log } = await BoardLog.open(path);
    log.append(ev(1));
    await log.close();
    const scan = scanBoardLog(readFileSync(path));
    expect(scan).toMatchObject({ droppedLines: 0, corruptAt: null });
    expect(scan.events.map((e) => e.seq)).toEqual([0, 1]);
  });
});
