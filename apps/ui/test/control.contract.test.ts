/**
 * P3.7 contract test: Pause, Resume, Redirect and Stop all on a REAL sidecar whose model is the mock LLM (scripted per
 * agent, routed by system prompt).
 *
 * - Pause Orb mid-stream: its model stream is aborted, `agents.status` reads `paused`, a chat message sent while
 *   paused is held (no model request); Resume steers "continue" and the held message reaches the model.
 * - Pause Scout mid-stream: interrupted with the user's authority; its settlement notice does not wake Orb; Orb's
 *   `message_agent` and `delegate` to it are queued (no Scout request); Resume sends Scout "continue" plus both.
 * - Redirect: Scout gets the user's direction as a message, Orb as a steer.
 * - Stop all, 20 times, while Orb, Scout and Critic all stream: every run is idle within 1 s, every model stream is
 *   aborted, and no settlement notice wakes Orb afterwards. Times are printed (p50/p95).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RESUME_TEXT, type AgentStatus, type CanvasMeta } from '@orb/shared';
import {
  startMockedSidecar,
  type MockRequest,
  type MockTurn,
  type MockedSidecar,
} from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';
import { timingExpect } from '../../../scripts/testkit/namespace.ts';

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
/** The user-role text after the last assistant message (what this request adds). */
const trailingUser = (req: MockRequest): string => {
  const messages = req.body.messages as any[];
  const out: string[] = [];
  for (let i = messages.length - 1; i >= 0 && messages[i].role !== 'assistant'; i--)
    if (messages[i].role === 'user') out.unshift(textOf(messages[i]));
  return out.join('\n');
};
const lastRole = (req: MockRequest) => (req.body.messages as any[]).at(-1)?.role;
const slow: MockTurn = { text: 'reading '.repeat(400).trim(), chunkDelayMs: 40 };

/** `rounds`: Scenario A loop for Stop all (Orb delegates Scout and Critic, everyone streams slowly). */
let mode: 'scripted' | 'rounds' = 'scripted';
let roundFrames: string[] = [];

let sc: MockedSidecar;
let wire: Wire;

beforeAll(async () => {
  sc = await startMockedSidecar({
    llm: {
      defaultTurn: (req) => {
        const who = whoOf(req);
        byAgent[who].push(req);
        if (mode === 'rounds') {
          if (who !== 'orb') return slow;
          if (lastRole(req) === 'tool') return slow;
          if (/Round \d+/.test(trailingUser(req)))
            return {
              toolCalls: [
                {
                  name: 'delegate',
                  arguments: { role: 'scout', frameIds: [roundFrames[0]], instruction: 'Find sources.' },
                },
                {
                  name: 'delegate',
                  arguments: { role: 'critic', frameIds: [roundFrames[1]], instruction: 'Question them.' },
                },
              ],
            };
          return { text: 'Noted.' };
        }
        return scripts[who].shift() ?? { text: 'OK.' };
      },
    },
  });
  wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
});

afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
});

const inFlight = (who: Who) => byAgent[who].find((r) => !r.completed && !r.aborted && r.chunksSent > 0);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The first request (now or later) matching `test`, polled: a request's progress (chunksSent) changes after it arrives. */
const waitReq = async (test: (r: MockRequest) => boolean, timeout = 15_000): Promise<MockRequest> => {
  await expect.poll(() => sc.llm.requests.some(test), { timeout, interval: 20 }).toBe(true);
  return sc.llm.requests.find(test)!;
};

describe('pause, resume, redirect, stop all (P3.7)', () => {
  let canvas: CanvasMeta;
  let frames: string[] = [];
  const statuses: AgentStatus[] = [];
  const follow = new AbortController();
  const last = (agent: string) => statuses.findLast((s) => s.agent === agent);

  it('Pause Orb mid-stream holds it and the chat sent meanwhile; Resume continues with both', async () => {
    canvas = await wire.orb.canvas.create({
      prompt: 'Is a research canvas worth building?',
      template: 'topic',
    });
    await wire.orb.canvas.open(canvas.id);
    frames = readFileSync(join(sc.paths.orbHome, 'canvases', canvas.id, 'board.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((e) => e.type === 'frame.added')
      .map((e) => e.data.frame.id as string);
    expect(frames.length).toBeGreaterThanOrEqual(3);
    void (async () => {
      for await (const s of wire.orb.agents.status(canvas.id, { signal: follow.signal })) statuses.push(s);
    })().catch(() => undefined);

    scripts.orb.push(slow, { text: 'Continuing, with prices in mind.' });
    await wire.orb.chat.send(canvas.id, { text: 'Write a long overview.' });
    const streaming = await waitReq((r) => whoOf(r) === 'orb' && r.chunksSent >= 3, 15_000);
    const paused = await wire.orb.agents.control(canvas.id, { agent: 'orb', action: 'pause' });
    expect(paused).toMatchObject({ action: 'pause', state: 'paused', agents: 1 });
    timingExpect(() => {
      expect(paused.stopMs).toBeLessThan(1000);
    });
    await expect.poll(() => streaming.aborted).toBe(true);
    await expect.poll(() => last('orb')?.state).toBe('paused');

    const before = byAgent.orb.length;
    await wire.orb.chat.send(canvas.id, { text: 'Also check prices.' });
    await sleep(500);
    expect(byAgent.orb.length).toBe(before); // held, not delivered
    expect(last('orb')?.state).toBe('paused');

    expect(await wire.orb.agents.control(canvas.id, { agent: 'orb', action: 'resume' })).toEqual({
      action: 'resume',
      state: 'resumed',
      agents: 1,
      queued: 1,
    });
    const resumed = await waitReq((r) => whoOf(r) === 'orb' && trailingUser(r).includes(RESUME_TEXT), 15_000);
    expect(trailingUser(resumed)).toContain('Also check prices.');
    await expect.poll(() => last('orb')?.state, { timeout: 15_000 }).toBe('idle');
  });

  it('Pause Scout: interrupted, Orb not woken; Orb messages and delegations to it are queued until Resume', async () => {
    scripts.orb.push(
      {
        toolCalls: [
          {
            name: 'delegate',
            arguments: { role: 'scout', frameIds: [frames[0]], instruction: 'Find market reports.' },
          },
        ],
      },
      { text: 'Scout is on it.' },
    );
    scripts.scout.push(slow);
    await wire.orb.chat.send(canvas.id, { text: 'Research the market.' });
    const scoutStream = await waitReq((r) => whoOf(r) === 'scout' && r.chunksSent >= 3, 15_000);
    await expect.poll(() => last('orb')?.state, { timeout: 15_000 }).toBe('idle');
    const orbBefore = byAgent.orb.length;

    const paused = await wire.orb.agents.control(canvas.id, { agent: 'scout', action: 'pause' });
    expect(paused).toMatchObject({ state: 'paused', agents: 1 });
    timingExpect(() => {
      expect(paused.stopMs).toBeLessThan(1000);
    });
    await expect.poll(() => scoutStream.aborted).toBe(true);
    await expect.poll(() => last('scout')?.state).toBe('paused');
    await sleep(600);
    // The child's "was stopped" settlement notice did not start an Orb turn.
    expect(byAgent.orb.length).toBe(orbBefore);

    // Orb messages and re-delegates Scout: both queued; Scout gets no request.
    scripts.orb.push(
      {
        toolCalls: [
          { name: 'message_agent', arguments: { agent: 'scout', message: 'Skip blog posts.' } },
          {
            name: 'delegate',
            arguments: { role: 'scout', frameIds: [frames[1]], instruction: 'Then look at pricing pages.' },
          },
        ],
      },
      { text: 'Scout is paused; it will get both when resumed.' },
    );
    const scoutBefore = byAgent.scout.length;
    await wire.orb.chat.send(canvas.id, { text: 'Tell Scout to skip blogs, then pricing.' });
    const after = await waitReq(
      (r) =>
        whoOf(r) === 'orb' &&
        lastRole(r) === 'tool' &&
        (r.body.messages as any[]).some((m) =>
          m.tool_calls?.some((c: any) => c.function?.name === 'message_agent'),
        ),
      15_000,
    );
    const toolResults = (after.body.messages as any[])
      .filter((m) => m.role === 'tool')
      .slice(-2)
      .map(textOf);
    expect(toolResults[0]).toContain('"queued":true');
    expect(toolResults[1]).toContain('"queued":true');
    await sleep(300);
    expect(byAgent.scout.length).toBe(scoutBefore);

    scripts.scout.push({ text: 'Resumed: skipping blogs, then pricing.' });
    expect(await wire.orb.agents.control(canvas.id, { agent: 'scout', action: 'resume' })).toMatchObject({
      action: 'resume',
      agents: 1,
      queued: 2,
    });
    const resumed = await waitReq(
      (r) => whoOf(r) === 'scout' && trailingUser(r).includes(RESUME_TEXT),
      15_000,
    );
    expect(trailingUser(resumed)).toContain('orb: Skip blog posts.');
    expect(trailingUser(resumed)).toContain('Then look at pricing pages.');
  });

  it('Redirect messages Scout and steers Orb', async () => {
    await expect.poll(() => (inFlight('scout') ? 'busy' : 'idle'), { timeout: 15_000 }).toBe('idle');
    scripts.scout.push({ text: 'Primary sources only, noted.' });
    expect(
      await wire.orb.agents.control(canvas.id, {
        agent: 'scout',
        action: 'redirect',
        text: 'Primary sources only.',
      }),
    ).toEqual({ action: 'redirect', state: 'delivered', agents: 1 });
    await waitReq(
      (r) =>
        whoOf(r) === 'scout' && trailingUser(r).includes('The user redirects you: Primary sources only.'),
      15_000,
    );
    await expect.poll(() => (inFlight('orb') ? 'busy' : 'idle'), { timeout: 15_000 }).toBe('idle');
    scripts.orb.push({ text: 'Europe first.' });
    expect(
      await wire.orb.agents.control(canvas.id, {
        agent: 'orb',
        action: 'redirect',
        text: 'Focus on Europe.',
      }),
    ).toMatchObject({ state: 'delivered' });
    await waitReq((r) => whoOf(r) === 'orb' && trailingUser(r).includes('Focus on Europe.'), 15_000);
    await expect.poll(() => last('orb')?.state, { timeout: 15_000 }).toBe('idle');
  });

  it('Stop all, 20 runs while Orb, Scout and Critic stream: idle within 1 s, streams aborted, Orb not woken', async () => {
    await expect
      .poll(() => (['orb', 'scout', 'critic'] as Who[]).some((w) => inFlight(w)), { timeout: 15_000 })
      .toBe(false);
    mode = 'rounds';
    roundFrames = frames;
    const times: number[] = [];
    for (let round = 1; round <= 20; round++) {
      await wire.orb.chat.send(canvas.id, { text: `Round ${round}: research and question it.` });
      await expect
        .poll(() => (['orb', 'scout', 'critic'] as Who[]).every((w) => inFlight(w)), { timeout: 15_000 })
        .toBe(true);
      const streams = (['orb', 'scout', 'critic'] as Who[]).map((w) => inFlight(w)!);
      const stopped = await wire.orb.agents.control(canvas.id, { agent: 'all', action: 'stop' });
      expect(stopped.state).toBe('stopped');
      expect(stopped.agents).toBeGreaterThanOrEqual(3);
      timingExpect(() => {
        expect(stopped.stopMs).toBeLessThan(1000);
      });
      times.push(stopped.stopMs);
      for (const s of streams) await expect.poll(() => s.aborted).toBe(true);
      await expect.poll(() => last('scout')?.state).toBe('stopped');
      await expect.poll(() => last('critic')?.state).toBe('stopped');
      const orbCount = byAgent.orb.length;
      await sleep(400);
      // No settlement notice started a new Orb turn, and no child came back.
      expect(byAgent.orb.length).toBe(orbCount);
      expect((['orb', 'scout', 'critic'] as Who[]).some((w) => inFlight(w))).toBe(false);
    }
    const sorted = [...times].sort((a, b) => a - b);
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
    console.log(
      `[P3.7 stop-all contract] 20 runs, server ms: p50 ${pct(50)}, p95 ${pct(95)}, max ${sorted.at(-1)}; ` +
        `all: ${times.join(', ')}`,
    );
    timingExpect(() => {
      expect(sorted.at(-1)).toBeLessThan(1000);
    });
    mode = 'scripted';
    follow.abort();
  }, 240_000);
});
