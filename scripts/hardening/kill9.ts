/**
 * P5.5 Hardening: kill -9 durability soak (PRD Non-functional: "No more than 1 second of board work lost on crash
 * or force quit"; Gate 1: "After a kill and relaunch, the board and Orb's session both reopen correctly").
 *
 * Two soaks, each `runs` times:
 *
 *  - `store`: a child process writes board events through the BUILT CanvasStore as fast as it can
 *    (packages/orb-canvas/test/fixtures/crash-writer.mjs) and is SIGKILLed after a random 100–1500 ms. Checks:
 *    every byte of board.jsonl is a valid, contiguous line (no torn tail), the newest event on disk is at most the
 *    PRD's 1 s older than the kill (and reports whether it was inside the 250 ms flush window + 150 ms slack), and a fresh CanvasStore reopens the same board.
 *
 *  - `sidecar`: the real sidecar (Orb profile and bundle, dsh under Electron-as-Node, mock LLM). ONE library is
 *    reused across all runs, so each run reopens what every earlier crash left behind. Each run boots the sidecar,
 *    reopens the canvas (root Orb session resumed), sends a chat message whose reply streams slowly, writes board
 *    commands over the wire as fast as they are acknowledged (adds and moves), then SIGKILLs the sidecar after a
 *    random 150–1500 ms, mid-stream. Checks: board.jsonl scans clean; every command acknowledged more than 1 s
 *    before the kill is on disk (and reports the oldest acknowledged-but-lost write); the next boot reopens the
 *    canvas and its root session (agentAvailable, no SessionFormatUnsupportedError) and continues the board at
 *    the next seq; every 10th run a fresh chat turn completes and the model sees the canvas's earlier messages.
 *
 * Needs `pnpm build` first. Never needs a real key (mock LLM only).
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { BOARD_FILE, CanvasStore, DEFAULT_FLUSH_MS, scanBoardLog } from '@orb/canvas';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../testkit/mockLlm.ts';
import { startSidecar, type TestSidecar } from '../testkit/sidecar.ts';

/** PRD durability bound. */
export const DURABILITY_MS = 1000;
/**
 * The design target under the PRD bound: the 250 ms flush window plus timer jitter and one write/fdatasync.
 * Reported per run (`withinFlushWindow`); the pass criterion is the PRD's 1 s.
 */
const FLUSH_TARGET_MS = DEFAULT_FLUSH_MS + 150;
const FIXTURE = resolve(
  import.meta.dirname,
  '..',
  '..',
  'packages',
  'orb-canvas',
  'test',
  'fixtures',
  'crash-writer.mjs',
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) => Math.floor(min + Math.random() * (max - min));

export type StoreRun = {
  run: number;
  killAfterMs: number;
  events: number;
  lostMs: number;
  withinFlushWindow: boolean;
  ok: boolean;
  error?: string;
};
export type SidecarRun = {
  run: number;
  bootMs: number;
  reopened: boolean;
  killAfterMs: number;
  acked: number;
  onDisk: number;
  /** Acknowledged writes not on disk after the kill. */
  lostAcked: number;
  /** Age at the kill of the oldest acknowledged write that was lost (0 when none was). */
  oldestLostMs: number;
  /** Whether the chat reply was still streaming when the kill landed. */
  midTurn: boolean;
  ok: boolean;
  error?: string;
};

// ---------------------------------------------------------------- store soak

async function storeRun(run: number): Promise<StoreRun> {
  const home = mkdtempSync(join(tmpdir(), 'orb-kill9-store-'));
  const killAfterMs = rand(100, 1500);
  try {
    const child = spawn(process.execPath, [FIXTURE, home], { stdio: ['ignore', 'pipe', 'inherit'] });
    const exited = new Promise<NodeJS.Signals | null>((r) => child.once('exit', (_c, signal) => r(signal)));
    const lines = createInterface({ input: child.stdout! });
    const ready = await new Promise<{ id: string; cardId: string }>((res, rej) => {
      lines.once('line', (l) => res(JSON.parse(l)));
      child.once('exit', () => rej(new Error('crash-writer exited early')));
    });
    // The first event (the card) was acknowledged before the ready line.
    const readyAt = Date.now();
    await sleep(killAfterMs);
    const killedAt = Date.now();
    child.kill('SIGKILL');
    if ((await exited) !== 'SIGKILL') throw new Error('child did not die by SIGKILL');
    const raw = readFileSync(join(home, 'canvases', ready.id, BOARD_FILE));
    const scan = scanBoardLog(raw);
    if (scan.goodBytes !== raw.length || scan.droppedLines !== 0 || scan.corruptAt !== null)
      throw new Error(`board.jsonl not clean: ${JSON.stringify({ ...scan, events: scan.events.length })}`);
    if (scan.events.some((e, i) => e.seq !== i)) throw new Error('seq not contiguous');
    // The age of the newest event on disk bounds what was lost. A kill inside the first flush window leaves an
    // empty log: then everything since the first acknowledged event was lost.
    const lostMs = killedAt - (scan.events.at(-1)?.ts ?? readyAt);
    const store = new CanvasStore({ home, searchIndex: false });
    try {
      const board = await store.board(ready.id);
      if (board.nextSeq !== scan.events.length) throw new Error('reopened board does not match the log');
    } finally {
      await store.close();
    }
    const ok = lostMs <= DURABILITY_MS;
    const withinFlushWindow = lostMs <= FLUSH_TARGET_MS;
    return {
      run,
      killAfterMs,
      events: scan.events.length,
      lostMs,
      withinFlushWindow,
      ok,
      ...(ok ? {} : { error: `lost ${lostMs} ms` }),
    };
  } catch (err) {
    return {
      run,
      killAfterMs,
      events: 0,
      lostMs: -1,
      withinFlushWindow: false,
      ok: false,
      error: (err as Error).message,
    };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- sidecar soak

class RpcError extends Error {}

async function rpc(sc: TestSidecar, ns: string, method: string, args: unknown): Promise<any> {
  const rpcId = randomUUID();
  const res = await sc.fetch(`${sc.origin}/api/${ns}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: `${ns}/${method}`, payload: { args } }),
  });
  if (!res.ok) throw new RpcError(`${ns}/${method} → HTTP ${res.status}`);
  const body = (await res.json()) as any;
  if (!body?.result?.ok)
    throw new RpcError(`${ns}/${method}: ${JSON.stringify(body?.result?.error ?? body)}`);
  return body.result.value;
}

const note = (i: number) => ({
  type: 'note',
  frameId: null,
  x: (i % 20) * 60,
  y: Math.floor(i / 20) * 60,
  w: 200,
  h: 120,
  data: { text: `kill9 note ${i}` },
});

export type SoakOptions = { runs: number; log?: (line: string) => void };

export async function storeSoak({ runs, log = () => {} }: SoakOptions): Promise<StoreRun[]> {
  const results: StoreRun[] = [];
  for (let run = 1; run <= runs; run++) {
    const r = await storeRun(run);
    results.push(r);
    log(
      `store ${run}/${runs}: kill after ${r.killAfterMs} ms, ${r.events} events, newest on disk ${r.lostMs} ms old ${r.ok ? 'OK' : `FAIL ${r.error}`}`,
    );
  }
  return results;
}

export async function sidecarSoak({ runs, log = () => {} }: SoakOptions): Promise<SidecarRun[]> {
  const homeDir = mkdtempSync(join(tmpdir(), 'orb-kill9-sidecar-'));
  const llm = await new MockLlm({ defaultTurn: { text: 'ok' } }).start();
  const results: SidecarRun[] = [];
  let canvasId = '';
  let rootSessionId = '';
  let expectSeq = -1;
  const boot = () =>
    startSidecar({
      homeDir,
      extraPatch: mockProviderPatch(llm.baseURL),
      env: { [MOCK_KEY_ENV]: 'orb-mock-key' },
    });
  const boardFile = () => join(homeDir, 'Orb', 'canvases', canvasId, BOARD_FILE);
  try {
    for (let run = 1; run <= runs; run++) {
      const t0 = Date.now();
      let sc: TestSidecar | undefined;
      const result: SidecarRun = {
        run,
        bootMs: 0,
        reopened: false,
        killAfterMs: rand(150, 1500),
        acked: 0,
        onDisk: 0,
        lostAcked: 0,
        oldestLostMs: 0,
        midTurn: false,
        ok: false,
      };
      try {
        sc = await boot();
        result.bootMs = Date.now() - t0;
        if (!canvasId) {
          const meta = await rpc(sc, 'orb', 'canvas.create', { request: { prompt: 'Kill -9 soak' } });
          canvasId = meta.id;
          rootSessionId = meta.rootSessionId;
        } else {
          const meta = await rpc(sc, 'orb', 'canvas.open', { id: canvasId });
          if (meta.rootSessionId !== rootSessionId) throw new Error('root session id changed on reopen');
          const listed = (await rpc(sc, 'session', 'list', { _request: {} })).items.find(
            (i: any) => i.sessionId === rootSessionId,
          );
          if (!listed?.agentAvailable) throw new Error('root session not available after reopen');
          if (readFileSync(sc.logPath, 'utf8').includes('SessionFormatUnsupportedError'))
            throw new Error('SessionFormatUnsupportedError in the sidecar log');
          result.reopened = true;
        }

        // Every 10th reopen: a full chat turn completes, and the model sees the earlier messages.
        if (run > 1 && run % 10 === 0) {
          const before = llm.requests.length;
          llm.enqueue({ text: `turn ${run} done` });
          await rpc(sc, 'orb', 'chat.send', { canvasId, request: { text: `check ${run}` } });
          const req = await llm.waitForRequest((r) => r.id === before + 1);
          const deadline = Date.now() + 15_000;
          while (!req.completed && Date.now() < deadline) await sleep(20);
          if (!JSON.stringify(req.body).includes('soak message 1'))
            throw new Error('resumed turn lost history');
          // Let the turn settle so the next kill does not race this check.
          for (let i = 0; i < 100; i++) {
            const it = (await rpc(sc, 'session', 'list', { _request: {} })).items.find(
              (x: any) => x.sessionId === rootSessionId,
            );
            if (!it?.running) break;
            await sleep(50);
          }
        }

        // A slow reply streams while the board is written, so the kill lands mid-turn.
        llm.enqueue({ text: Array.from({ length: 80 }, (_, i) => `w${i}`).join(' '), chunkDelayMs: 25 });
        const turnStart = llm.requests.length;
        await rpc(sc, 'orb', 'chat.send', { canvasId, request: { text: `soak message ${run}` } }).catch(
          () => {},
        );

        // Board writes as fast as they are acknowledged.
        const acks: { seq: number; at: number }[] = [];
        let killed = false;
        const scRef = sc;
        const writer = (async () => {
          let i = 0;
          while (!killed) {
            try {
              const value = await rpc(scRef, 'orb', 'board.command', {
                canvasId,
                command: { type: 'card.added', card: note(i++) },
              });
              const at = Date.now();
              for (const e of value.events) {
                if (expectSeq >= 0 && e.seq !== expectSeq)
                  throw new Error(`seq ${e.seq}, expected ${expectSeq}`);
                expectSeq = e.seq + 1;
                acks.push({ seq: e.seq, at });
              }
            } catch (err) {
              if (!killed) throw err;
            }
          }
        })();
        await sleep(result.killAfterMs);
        const req = llm.requests[turnStart];
        result.midTurn = Boolean(req && !req.completed);
        killed = true;
        const killedAt = Date.now();
        process.kill(sc.supervisor.pid!, 'SIGKILL');
        await writer;
        await sc.supervisor.stop();

        const raw = readFileSync(boardFile());
        const scan = scanBoardLog(raw);
        if (scan.goodBytes !== raw.length || scan.droppedLines !== 0 || scan.corruptAt !== null)
          throw new Error(`board.jsonl not clean after the kill`);
        if (scan.events.some((e, i) => e.seq !== i)) throw new Error('seq not contiguous');
        const lastSeq = scan.events.at(-1)?.seq ?? -1;
        const lost = acks.filter((a) => a.seq > lastSeq);
        result.acked = acks.length;
        result.onDisk = scan.events.length;
        result.lostAcked = lost.length;
        result.oldestLostMs = lost.length ? Math.max(0, killedAt - lost[0]!.at) : 0;
        expectSeq = lastSeq + 1; // the next boot continues from what is on disk
        result.ok = result.oldestLostMs <= DURABILITY_MS && (run === 1 || result.reopened);
        if (!result.ok) result.error = `lost a write acknowledged ${result.oldestLostMs} ms before the kill`;
      } catch (err) {
        result.error = (err as Error).message;
        if (sc) {
          try {
            process.kill(sc.supervisor.pid!, 'SIGKILL');
          } catch {
            // already gone
          }
          await sc.supervisor.stop().catch(() => {});
        }
      }
      results.push(result);
      log(
        `sidecar ${run}/${runs}: boot ${result.bootMs} ms, ${result.reopened ? 'reopened' : 'created'}, kill after ${result.killAfterMs} ms${result.midTurn ? ' (mid-turn)' : ''}, ${result.acked} acked, ${result.lostAcked} lost (oldest ${result.oldestLostMs} ms) ${result.ok ? 'OK' : `FAIL ${result.error}`}`,
      );
    }
    // Final reopen after the last kill.
    const sc = await boot();
    try {
      await rpc(sc, 'orb', 'canvas.open', { id: canvasId });
      const value = await rpc(sc, 'orb', 'board.command', {
        canvasId,
        command: { type: 'card.added', card: note(0) },
      });
      if (value.events[0].seq !== expectSeq) throw new Error('final reopen did not continue at the next seq');
    } finally {
      await sc.stop();
    }
    return results;
  } finally {
    await llm.close();
    rmSync(homeDir, { recursive: true, force: true });
  }
}
