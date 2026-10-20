/**
 * P5.3 contract: after Settings › Storage moves the Orb folder (sidecar stopped, folder renamed, sidecar started on
 * the new ORB_HOME), an existing canvas's root agent resumes and its board tools still reach the board.
 */
import { mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { BoardEvent } from '@orb/shared';
import {
  MOCK_KEY_ENV,
  MockLlm,
  mockProviderPatch,
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

async function boot(homeDir: string, orbHome?: string): Promise<{ sc: TestSidecar; wire: Wire }> {
  const sc = await startSidecar({
    homeDir,
    extraPatch: mockProviderPatch(llm.baseURL),
    env: { [MOCK_KEY_ENV]: 'orb-mock-key', ...(orbHome ? { ORB_HOME: orbHome } : {}) },
  });
  const wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
  return { sc, wire };
}

const readBoard = (home: string, id: string): BoardEvent[] => {
  try {
    return readFileSync(join(home, 'canvases', id, 'board.jsonl'), 'utf8')
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

const placeCard = (id: string, title: string) => ({
  toolCalls: [
    { id, name: 'place_card', arguments: { type: 'doc', title, body: `${title}.`, why: 'Asked.' } },
  ],
});

it('a moved Orb folder: the resumed root agent still places cards on its board', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'orb-moved-'));
  const sidecars: TestSidecar[] = [];
  try {
    const first = await boot(homeDir);
    sidecars.push(first.sc);
    const canvas = await first.wire.orb.canvas.create({ prompt: 'Move me' });
    const sessionId = canvas.rootSessionId!;
    let start = llm.requests.length;
    llm.enqueue(placeCard('call_move_1', 'Tides'), { text: 'Placed.' });
    await first.wire.orb.chat.send(canvas.id, { text: 'Put a card about tides on the board.' });
    let last = await llm.waitForRequest((r) => r.id === start + 2);
    await expect.poll(() => last.completed).toBe(true);
    await idle(first.wire, sessionId);
    await expect.poll(() => readBoard(join(homeDir, 'Orb'), canvas.id).length).toBe(1);
    first.wire.dispose();
    await first.sc.stop();

    const moved = join(homeDir, 'Moved');
    renameSync(join(homeDir, 'Orb'), moved);
    const second = await boot(homeDir, moved);
    sidecars.push(second.sc);
    try {
      await second.wire.orb.canvas.open(canvas.id);
      start = llm.requests.length;
      llm.enqueue(placeCard('call_move_2', 'Currents'), { text: 'Placed again.' });
      await second.wire.orb.chat.send(canvas.id, { text: 'Now one about currents.' });
      last = await llm.waitForRequest((r) => r.id === start + 2);
      await expect.poll(() => last.completed).toBe(true);
      const toolResult = JSON.stringify(last.body.messages.at(-1));
      await idle(second.wire, sessionId);
      expect(toolResult).not.toMatch(/not a canvas|no canvas|refused|error/i);
      await expect.poll(() => readBoard(moved, canvas.id).length).toBe(2);
    } finally {
      second.wire.dispose();
      await second.sc.stop();
    }
  } finally {
    await Promise.allSettled(sidecars.map((sc) => sc.supervisor.stop()));
    rmSync(homeDir, { recursive: true, force: true });
  }
}, 90_000);
