/**
 * P3.4 contract test: Orb's team (Scout, Critic, Builder) as continuable children of the root agent, on a REAL
 * sidecar whose model is the mock LLM. The mock is scripted PER AGENT (each request is routed by its system prompt
 * to that agent's own queue of turns), since Orb and its children call the model concurrently.
 *
 * - `delegate` starts a child with `ctx.subagents.startContinuable`: its persona, `toolFilter.allow` = its §2.4
 *   allow-list (only the tools that exist today), its orb.json model; its id is in canvas.json before its first turn.
 * - The child places cards (stamped with its role and session), `report_progress` moves its cursor/label on
 *   `agents.status` and adds a one-line note to Orb's context (no wake); `send_message` (done) reaches Orb.
 * - `delegate` again messages the existing child; `stop_agent` interrupts it; `message_agent` redirects it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AGENT_TOOLS,
  type AgentStatus,
  type BoardEvent,
  type CanvasMeta,
  type Card,
  type Frame,
  PARALLEL_SCOUT_TOOL_NAMES,
  SCALE_TOOL_NAMES,
  LAYOUT_TOOL_NAMES,
} from '@orb/shared';
import {
  MOCK_MODEL,
  MOCK_MODEL_ALT,
  MOCK_PROVIDER,
  startMockedSidecar,
  type MockRequest,
  type MockTurn,
  type MockedSidecar,
} from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';

type Who = 'orb' | 'scout' | 'critic' | 'builder';
const scripts: Record<Who, MockTurn[]> = { orb: [], scout: [], critic: [], builder: [] };
/** Every model request, by agent. */
const byAgent: Record<Who, MockRequest[]> = { orb: [], scout: [], critic: [], builder: [] };

const textOf = (message: any): string =>
  typeof message?.content === 'string'
    ? message.content
    : Array.isArray(message?.content)
      ? message.content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n')
      : '';
const systemOf = (req: MockRequest) => textOf((req.body.messages as any[])[0]);
const whoOf = (req: MockRequest): Who => {
  const system = systemOf(req);
  if (system.includes('You are Scout')) return 'scout';
  if (system.includes('You are Critic')) return 'critic';
  if (system.includes('You are Builder')) return 'builder';
  return 'orb';
};
const allText = (req: MockRequest) => (req.body.messages as any[]).map(textOf).join('\n');
const toolNames = (req: MockRequest) => ((req.body.tools ?? []) as any[]).map((t) => t.function.name).sort();
/** Tool messages answering the last assistant message (a child's message may be steered in after them). */
const lastToolMessages = (req: MockRequest): any[] => {
  const messages = req.body.messages as any[];
  const out: any[] = [];
  for (let i = messages.length - 1; i >= 0 && messages[i].role !== 'assistant'; i--)
    if (messages[i].role === 'tool') out.unshift(messages[i]);
  return out;
};

/**
 * An Orb request that starts a turn only because a child messaged it (no user chat message in it, and not the
 * continuation of a tool call).
 */
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

let sc: MockedSidecar;
let wire: Wire;

beforeAll(async () => {
  sc = await startMockedSidecar({
    llm: {
      defaultTurn: (req) => {
        const who = whoOf(req);
        byAgent[who].push(req);
        // Orb is also woken by its children (send_message, settlement notices): those turns get a plain reply so
        // the scripted turns stay with the chat messages they were written for.
        if (who === 'orb' && isWake(req)) return { text: 'Noted.' };
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

const readBoard = (id: string): BoardEvent[] =>
  readFileSync(join(sc.paths.orbHome, 'canvases', id, 'board.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BoardEvent);
const cardsOnDisk = (id: string): Card[] =>
  readBoard(id).flatMap((e) => (e.type === 'card.added' ? [(e.data as { card: Card }).card] : []));
const framesOnDisk = (id: string): Frame[] =>
  readBoard(id).flatMap((e) => (e.type === 'frame.added' ? [(e.data as { frame: Frame }).frame] : []));
const canvasJson = (id: string): CanvasMeta =>
  JSON.parse(readFileSync(join(sc.paths.orbHome, 'canvases', id, 'canvas.json'), 'utf8'));

const waitFor = <T>(fn: () => T | undefined, timeout = 15_000) =>
  expect
    .poll(fn, { timeout, interval: 50 })
    .toBeTruthy()
    .then(() => fn() as T);

describe('child agents (P3.4)', () => {
  let canvas: CanvasMeta;
  let frames: Frame[];
  const statuses: AgentStatus[] = [];
  const follow = new AbortController();

  it('delegate starts Scout and Critic; they place cards, report progress and message Orb', async () => {
    // orb.json routes Scout to the second mock model (agentOptions from orb.json).
    await wire.orb.settings.set({ models: { scout: { provider: MOCK_PROVIDER, model: MOCK_MODEL_ALT } } });
    canvas = await wire.orb.canvas.create({
      prompt: 'Is solid-state battery tech ready?',
      template: 'topic',
    });
    frames = framesOnDisk(canvas.id);
    expect(frames.length).toBeGreaterThanOrEqual(3);
    const [f0, f1] = frames as [Frame, Frame];
    void (async () => {
      for await (const s of wire.orb.agents.status(canvas.id, { signal: follow.signal })) statuses.push(s);
    })().catch(() => undefined);

    // Resolves once Orb's reply after the delegate calls has fully streamed (the children's first replies wait
    // for it; a fixed delay was not enough under parallel test load).
    const orbTurnEnded = () =>
      expect.poll(() => byAgent.orb[1]?.completed === true, { timeout: 15_000, interval: 20 }).toBe(true);
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_delegate_scout',
            name: 'delegate',
            arguments: { role: 'scout', frameIds: [f0.id], instruction: 'Find the key 2025 reports.' },
          },
          {
            id: 'call_delegate_critic',
            name: 'delegate',
            arguments: { role: 'critic', frameIds: [f1.id], instruction: 'Question the claims.' },
          },
        ],
      },
      { text: 'Scout and Critic are on it.' },
    );
    scripts.scout.push(
      {
        toolCalls: [
          {
            id: 'call_s_p1',
            name: 'report_progress',
            arguments: { status: 'Searching reports', frameId: f0.id },
          },
        ],
        // Orb's turn ends first, so the note waits for Orb's next wake (inject never wakes an idle agent; a note
        // that lands while Orb's turn is still running is taken by that turn's next step).
        holdUntil: orbTurnEnded,
        firstDelayMs: 300,
      },
      {
        toolCalls: [
          {
            id: 'call_s_card1',
            name: 'place_card',
            arguments: {
              type: 'source',
              frameId: f0.id,
              title: 'IEA battery outlook 2025',
              url: 'https://www.iea.org/reports/batteries-2025',
              body: 'Solid-state cells reach pilot lines in 2025.',
              why: 'Primary market data.',
            },
          },
          {
            id: 'call_s_card2',
            name: 'place_card',
            arguments: {
              type: 'source',
              frameId: f0.id,
              title: 'Nature review of solid electrolytes',
              url: 'https://www.nature.com/articles/solid-electrolytes',
              body: 'Interface stability is the main barrier.',
              why: 'Peer-reviewed state of the art.',
            },
          },
        ],
      },
      { toolCalls: [{ id: 'call_s_p2', name: 'report_progress', arguments: { status: 'Wrapping up' } }] },
      {
        toolCalls: [
          {
            id: 'call_s_done',
            name: 'send_message',
            arguments: { about: 'done', message: 'Placed 2 sources in 01.' },
          },
        ],
      },
      { text: 'Done.' },
    );
    scripts.critic.push(
      {
        toolCalls: [
          {
            id: 'call_c_p1',
            name: 'report_progress',
            arguments: { status: 'Reading claims', frameId: f1.id },
          },
          // Not in Critic's tools at all: the call fails.
          {
            id: 'call_c_delegate',
            name: 'delegate',
            arguments: { role: 'scout', frameIds: [f1.id], instruction: 'x' },
          },
        ],
        holdUntil: orbTurnEnded,
        firstDelayMs: 300,
      },
      {
        toolCalls: [
          {
            id: 'call_c_q',
            name: 'place_card',
            arguments: {
              type: 'question',
              frameId: f1.id,
              title: 'Does it scale past pilot lines?',
              body: 'No volume data yet.',
              why: 'The readiness claim depends on it.',
            },
          },
        ],
      },
      { text: 'Critic done.' },
    );

    await wire.orb.chat.send(canvas.id, { text: 'Research this with your team.' });

    // Orb is offered its team tools, never the children's.
    const orbFirst = await waitFor(() => byAgent.orb[0]);
    const orbTools = toolNames(orbFirst);
    expect(orbTools).toEqual(expect.arrayContaining(['delegate', 'message_agent', 'stop_agent']));
    expect(orbTools).not.toContain('report_progress');
    expect(orbTools).not.toContain('send_message');
    expect(orbTools).not.toContain('consolidate_cards');

    // Delegate results: two children started, ids recorded in canvas.json.
    const orbSecond = await waitFor(() => byAgent.orb[1]);
    const results = lastToolMessages(orbSecond).map((m) => JSON.parse(String(m.content)));
    expect(results.map((r) => [r.agent, r.started])).toEqual([
      ['scout', true],
      ['critic', true],
    ]);
    const meta = canvasJson(canvas.id);
    expect(meta.childAgentIds.scout).toBe(results[0].agentId);
    expect(meta.childAgentIds.critic).toBe(results[1].agentId);
    expect(meta.childAgentIds.scout).toMatch(/^scout-/);

    // Scout: its persona, its allow-list (tools that exist today), its orb.json model, its assignment.
    const scoutFirst = await waitFor(() => byAgent.scout[0]);
    expect(systemOf(scoutFirst)).toContain('You are Scout');
    expect(systemOf(scoutFirst)).toContain('Call report_progress often');
    expect(systemOf(scoutFirst)).not.toContain('You are orb');
    expect(toolNames(scoutFirst)).toEqual(
      [
        'add_link',
        'capture_page',
        'consolidate_cards',
        'fetch_signed_in',
        'fetch_url',
        'place_card',
        'query_board',
        'query_dataset',
        'read_source',
        'report_progress',
        'send_message',
        'upsert_rows',
        'web_search',
        // P6.7: Scout's Parallel tools.
        ...PARALLEL_SCOUT_TOOL_NAMES,
        ...SCALE_TOOL_NAMES,
        ...LAYOUT_TOOL_NAMES,
      ].sort(),
    );
    for (const t of toolNames(scoutFirst)) expect(AGENT_TOOLS.scout).toContain(t);
    expect(scoutFirst.body.model).toBe(MOCK_MODEL_ALT);
    expect(allText(scoutFirst)).toContain(`"${f0.title}" [${f0.id}]`);
    expect(allText(scoutFirst)).toContain('Instruction: Find the key 2025 reports.');
    expect(allText(scoutFirst)).toContain('The canvas: Is solid-state battery tech ready?');

    const criticFirst = await waitFor(() => byAgent.critic[0]);
    expect(systemOf(criticFirst)).toContain('You are Critic');
    expect(toolNames(criticFirst)).toEqual(
      [
        'add_link',
        'consolidate_cards',
        'place_card',
        'query_board',
        'query_dataset',
        'read_source',
        'report_progress',
        'send_message',
        ...SCALE_TOOL_NAMES,
        ...LAYOUT_TOOL_NAMES,
      ].sort(),
    );
    expect(criticFirst.body.model).toBe(MOCK_MODEL);

    // Critic's delegate call never ran.
    const criticSecond = await waitFor(() => byAgent.critic[1]);
    const [progress, refused] = lastToolMessages(criticSecond).map((m) => String(m.content));
    expect(progress).not.toMatch(/^Error/);
    expect(refused).toMatch(/Error|not|unknown/i);

    // Cards on the board: stamped with the child's role and session id, in the child's frames.
    await expect.poll(() => cardsOnDisk(canvas.id).length, { timeout: 15_000 }).toBe(3);
    const cards = cardsOnDisk(canvas.id);
    const scoutCards = cards.filter((c) => c.provenance.kind === 'agent' && c.provenance.agent === 'scout');
    expect(scoutCards.map((c) => c.frameId)).toEqual([f0.id, f0.id]);
    for (const c of scoutCards)
      expect(c.provenance).toMatchObject({ sessionId: meta.childAgentIds.scout, model: MOCK_MODEL_ALT });
    const criticCards = cards.filter((c) => c.provenance.kind === 'agent' && c.provenance.agent === 'critic');
    expect(criticCards.map((c) => [c.type, c.frameId])).toEqual([['question', f1.id]]);

    // agents.status: Scout's cursor moved to its frame with its label; Critic too.
    await expect
      .poll(() => statuses.some((s) => s.agent === 'scout' && s.label === 'Searching reports'), {
        timeout: 10_000,
      })
      .toBe(true);
    const scoutProgress = statuses.find((s) => s.agent === 'scout' && s.label === 'Searching reports')!;
    expect(scoutProgress).toMatchObject({
      state: 'running',
      frameId: f0.id,
      sessionId: meta.childAgentIds.scout,
    });
    expect(statuses.find((s) => s.agent === 'critic' && s.label === 'Reading claims')).toMatchObject({
      frameId: f1.id,
    });
    // A report without a frame keeps the cursor where it was.
    await expect
      .poll(() => statuses.find((s) => s.agent === 'scout' && s.label === 'Wrapping up')?.frameId, {
        timeout: 10_000,
      })
      .toBe(f0.id);

    // Orb is woken by Scout's send_message, and its context carries the progress notes (inject, one line each).
    const woken = await waitFor(() =>
      byAgent.orb.find((r) => allText(r).includes('Scout (done): Placed 2 sources in 01.')),
    );
    expect(allText(woken)).toContain(`[Scout progress] Searching reports (frame 01 "${f0.title}")`);
    // Progress notes alone never woke Orb: every Orb request after the first turn carries a child message.
    for (const r of byAgent.orb.slice(2))
      expect(allText(r)).toMatch(/Scout \(done\)|subagent|sent a message/);

    // Both children settle idle; the stream says so.
    await expect
      .poll(
        () =>
          ['scout', 'critic'].every((a) => statuses.filter((s) => s.agent === a).at(-1)?.state === 'idle'),
        { timeout: 15_000 },
      )
      .toBe(true);
    // This fixture covers delegation with only three cards, not a completed multi-frame research board.
    // Stop its outstanding repair pass before the next test queues a different supervisor script.
    await wire.orb.agents.control(canvas.id, { action: 'stop', agent: 'all' });
  });

  it('a new subscriber gets every agent: Orb first, then the children with their cursors', async () => {
    const ac = new AbortController();
    const seen: AgentStatus[] = [];
    const it = wire.orb.agents.status(canvas.id, { signal: ac.signal })[Symbol.asyncIterator]();
    for (let i = 0; i < 3; i++) seen.push((await it.next()).value as AgentStatus);
    ac.abort();
    expect(seen.map((s) => s.agent)).toEqual(['orb', 'scout', 'critic']);
    expect(seen[1]).toMatchObject({ frameId: frames[0]!.id });
  });

  it('delegate again messages the existing child; stop_agent interrupts it; message_agent redirects it', async () => {
    const [f0, , f2] = frames as [Frame, Frame, Frame];
    const scoutId = canvasJson(canvas.id).childAgentIds.scout!;
    const scoutBefore = byAgent.scout.length;
    const orbBefore = byAgent.orb.length;
    // Both sessions already exist; a fresh per-agent choice must override their persisted/creation routes.
    await wire.orb.settings.set({ models: { scout: { provider: MOCK_PROVIDER, model: MOCK_MODEL } } });
    await wire.orb.settings.set({ models: { orb: { provider: MOCK_PROVIDER, model: MOCK_MODEL_ALT } } });
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_delegate_again',
            name: 'delegate',
            arguments: { role: 'scout', frameIds: [f2.id], instruction: 'Now cover the costs.' },
          },
        ],
      },
      // Give Scout time to start its turn on the assignment before it is stopped.
      {
        toolCalls: [{ id: 'call_stop', name: 'stop_agent', arguments: { agent: 'scout' } }],
        firstDelayMs: 1_000,
      },
      { text: 'Stopped Scout.' },
    );
    // Scout's answer to the new assignment hangs until it is interrupted.
    scripts.scout.push({ text: 'Working on costs…', firstDelayMs: 20_000 });
    await wire.orb.chat.send(canvas.id, { text: 'Move Scout to costs, then stop it.' });

    const afterDelegate = await waitFor(() =>
      byAgent.orb
        .slice(orbBefore)
        .find((r) => lastToolMessages(r).some((m) => String(m.content).includes('scout'))),
    );
    const again = JSON.parse(String(lastToolMessages(afterDelegate)[0].content));
    expect(again).toMatchObject({ agent: 'scout', agentId: scoutId, started: false });
    // The same child (cold-resumed after it settled) gets the assignment as a message.
    const assigned = await waitFor(() => byAgent.scout[scoutBefore]);
    expect(allText(assigned)).toContain('a new assignment from orb');
    expect(allText(assigned)).toContain(`"${f2.title}" [${f2.id}]`);
    expect(systemOf(assigned)).toContain('You are Scout');
    expect(assigned.body.model).toBe(MOCK_MODEL);
    expect(afterDelegate.body.model).toBe(MOCK_MODEL_ALT);
    expect(canvasJson(canvas.id).childAgentIds.scout).toBe(scoutId);

    const afterStop = await waitFor(() =>
      byAgent.orb
        .slice(orbBefore)
        .find((r) => lastToolMessages(r).some((m) => String(m.content).includes('"stopped"'))),
    );
    expect(JSON.parse(String(lastToolMessages(afterStop)[0].content))).toEqual({
      agent: 'scout',
      agentId: scoutId,
      stopped: true,
    });
    await expect.poll(() => assigned.aborted, { timeout: 5_000 }).toBe(true);
    expect(statuses.filter((s) => s.agent === 'scout').some((s) => s.state === 'stopped')).toBe(true);

    // message_agent: the child gets Orb's message.
    const scoutBefore2 = byAgent.scout.length;
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_msg',
            name: 'message_agent',
            arguments: { agent: 'scout', message: 'Focus on cost per kWh.' },
          },
        ],
      },
      { text: 'Redirected.' },
    );
    scripts.scout.push({ text: 'On it.' });
    await wire.orb.chat.send(canvas.id, { text: 'Tell Scout to focus on cost per kWh.' });
    const redirected = await waitFor(() =>
      byAgent.scout.slice(scoutBefore2).find((r) => allText(r).includes('orb: Focus on cost per kWh.')),
    );
    expect(redirected).toBeTruthy();
    await wire.orb.settings.set({ models: { scout: { provider: MOCK_PROVIDER, model: MOCK_MODEL_ALT } } });
    await wire.orb.settings.set({ models: { orb: { provider: MOCK_PROVIDER, model: MOCK_MODEL } } });
    void f0;
  });

  it('message_agent / stop_agent on a role that was never started tell Orb to delegate', async () => {
    const orbBefore = byAgent.orb.length;
    scripts.orb.push(
      {
        toolCalls: [
          { id: 'call_msg_b', name: 'message_agent', arguments: { agent: 'builder', message: 'hi' } },
        ],
      },
      { text: 'Builder is not running.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'Ping Builder.' });
    const req = await waitFor(() =>
      byAgent.orb
        .slice(orbBefore)
        .find((r) => lastToolMessages(r).some((m) => String(m.content).includes('Builder'))),
    );
    expect(String(lastToolMessages(req)[0].content)).toContain('Builder has not been started; use delegate');
    follow.abort();
  });
});
