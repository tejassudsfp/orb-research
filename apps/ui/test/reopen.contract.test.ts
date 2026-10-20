/**
 * P1.9 contract test (the Electron e2e is apps/desktop/e2e/reopen.spec.ts): reopening a canvas on a NEW sidecar
 * resumes its root Orb agent through the harness resume path, keeps the session id, and the next model request
 * carries the earlier history. Two ways the first sidecar ends: SIGTERM (clean dispose) and SIGKILL (no dispose,
 * after the turn completed and > 250 ms after the last board event).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BoardEvent } from '@orb/shared';
import {
  MOCK_KEY_ENV,
  MockLlm,
  mockProviderPatch,
  readSessionLog,
  startSidecar,
  type TestSidecar,
} from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';

let llm: MockLlm;

beforeAll(async () => {
  llm = await new MockLlm().start();
});
afterAll(async () => {
  await llm?.close();
});

async function boot(homeDir: string): Promise<{ sc: TestSidecar; wire: Wire }> {
  const sc = await startSidecar({
    homeDir,
    extraPatch: mockProviderPatch(llm.baseURL),
    env: { [MOCK_KEY_ENV]: 'orb-mock-key' },
  });
  const wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
  return { sc, wire };
}

const readBoard = (sc: TestSidecar, id: string): BoardEvent[] => {
  try {
    return readFileSync(join(sc.paths.orbHome, 'canvases', id, 'board.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as BoardEvent);
  } catch {
    return [];
  }
};

async function idle(wire: Wire, sessionId: string) {
  await expect
    .poll(async () => (await wire.session.list()).items.find((i) => i.sessionId === sessionId)?.running, {
      timeout: 20_000,
    })
    .toBe(false);
}

describe.each([
  ['SIGTERM', false],
  ['SIGKILL', true],
] as const)('reopen after %s', (_label, kill) => {
  it('resumes the root session with its history; the board is unchanged', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'orb-reopen-'));
    const sidecars: TestSidecar[] = [];
    try {
      const first = await boot(homeDir);
      sidecars.push(first.sc);
      const canvas = await first.wire.orb.canvas.create({ prompt: 'Reopen me' });
      const sessionId = canvas.rootSessionId!;
      const start = llm.requests.length;
      llm.enqueue(
        {
          toolCalls: [
            {
              id: 'call_reopen_1',
              name: 'place_card',
              arguments: {
                type: 'doc',
                title: 'Tides',
                body: 'The moon pulls the sea.',
                why: 'Asked for tides.',
              },
            },
          ],
        },
        { text: 'The tides card is on the board.' },
      );
      await first.wire.orb.chat.send(canvas.id, { text: 'Put a card about tides on the board.' });
      const last = await llm.waitForRequest((r) => r.id === start + 2);
      await expect.poll(() => last.completed).toBe(true);
      await idle(first.wire, sessionId);
      await expect.poll(() => readBoard(first.sc, canvas.id).length).toBe(1);
      const board = readFileSync(join(first.sc.paths.orbHome, 'canvases', canvas.id, 'board.jsonl'), 'utf8');
      first.wire.dispose();
      if (kill) {
        process.kill(first.sc.supervisor.pid!, 'SIGKILL');
        await first.sc.supervisor.stop();
      } else {
        await first.sc.stop();
      }

      const second = await boot(homeDir);
      sidecars.push(second.sc);
      try {
        // Open: same root session, resumed (not replaced) before the call returns.
        const reopened = await second.wire.orb.canvas.open(canvas.id);
        expect(reopened).toEqual(canvas);
        expect((await second.wire.session.list()).items.find((i) => i.sessionId === sessionId)).toMatchObject(
          { agentAvailable: true },
        );
        // A second open reuses the live agent (no second resume).
        expect(await second.wire.orb.canvas.open(canvas.id)).toEqual(canvas);
        expect(
          readFileSync(join(second.sc.paths.orbHome, 'canvases', canvas.id, 'board.jsonl'), 'utf8'),
        ).toBe(board);

        const before = llm.requests.length;
        llm.enqueue({ text: 'Earlier I placed a card about tides.' });
        await second.wire.orb.chat.send(canvas.id, { text: 'What did you put on the board earlier?' });
        const req = await llm.waitForRequest((r) => r.id === before + 1);
        const messages = JSON.stringify(req.body.messages);
        expect(messages).toContain('Put a card about tides on the board.');
        expect(messages).toContain('call_reopen_1');
        expect(messages).toContain('The tides card is on the board.');
        expect(req.body.messages.at(-1)).toMatchObject({ role: 'user' });
        await idle(second.wire, sessionId);

        const reasons = readSessionLog(second.sc.paths.dshHome, sessionId)
          .filter((e) => e.type === 'request/header')
          .map((e) => e.data?.reason);
        expect(reasons[0]).toBe('initial');
        expect(reasons).toContain('resume');
        const log = readFileSync(second.sc.logPath, 'utf8');
        expect(log.match(new RegExp(`resumed root session ${sessionId}`, 'g'))).toHaveLength(1);
        expect(log).not.toContain('SessionFormatUnsupportedError');
      } finally {
        second.wire.dispose();
        await second.sc.stop();
      }
    } finally {
      // Never leave a sidecar behind when an assertion fails early (stop is idempotent).
      await Promise.allSettled(sidecars.map((sc) => sc.supervisor.stop()));
      rmSync(homeDir, { recursive: true, force: true });
    }
  }, 60_000);
});
