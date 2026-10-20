/**
 * P3.6 contract test (agent UI, host halves), on a REAL sidecar whose model is the mock LLM, scripted per agent:
 * - Threads: `chat.send {threadOf}` stores the user's message as a `thread.message` in board.jsonl; Orb's cards from
 *   that turn go NEXT TO the thread's card (same frame) and are linked to it (`thread` label link) without Orb
 *   naming the thread; Orb's reply is stored as the thread's next message; `board.follow` snapshots carry threads.
 *   A plain message afterwards is no thread turn.
 * - Provenance: agent cards record `eventSeq`; `session/page` with `throughSeq: eventSeq` and a one-turn window
 *   returns the turn that produced the card (its user message and the `tool/call` with the card's tool call id),
 *   for Orb (session address) and for a child (subagent address through the root session).
 * - Per-agent Stop: `agents.control {agent: 'scout', action: 'stop'}` stops Scout alone within 1 s.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  STOP_TIMEOUT_MS,
  type AgentStatus,
  type BoardEvent,
  type BoardFollowFrame,
  type CanvasMeta,
  type Card,
  type Frame,
  type Link,
} from '@orb/shared';
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
/** An Orb request that only exists because a child messaged it or settled. */
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

const waitFor = <T>(fn: () => T | undefined | false, timeout = 15_000) =>
  expect
    .poll(fn, { timeout, interval: 50 })
    .toBeTruthy()
    .then(() => fn() as T);

/** The folded board through the follow stream's opening snapshot. */
async function snapshotOf(canvasId: string): Promise<Extract<BoardFollowFrame, { kind: 'snapshot' }>> {
  const ac = new AbortController();
  for await (const frame of wire.orb.board.follow(canvasId, { signal: ac.signal })) {
    ac.abort();
    if (frame.kind === 'snapshot') return frame;
  }
  throw new Error('no snapshot');
}

async function idle(sessionId: string) {
  await expect
    .poll(async () => (await wire.session.list()).items.find((s) => s.sessionId === sessionId)?.running, {
      timeout: 15_000,
    })
    .toBe(false);
}

describe('agent UI host halves (P3.6)', () => {
  let canvas: CanvasMeta;
  let frames: Frame[];
  let anchor: Card;

  it('a thread message is stored, Orb places its card next to the thread card, linked, and its reply is stored', async () => {
    canvas = await wire.orb.canvas.create({
      prompt: 'Is solid-state battery tech ready?',
      template: 'topic',
    });
    await wire.orb.canvas.open(canvas.id);
    frames = (await snapshotOf(canvas.id)).frames;
    const f1 = frames[1]!;
    // A first card for the thread to be about.
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_anchor',
            name: 'place_card',
            arguments: {
              type: 'source',
              frameId: f1.id,
              title: 'Pilot lines in 2025',
              body: 'Two makers run pilot lines.',
              url: 'https://example.com/pilot',
              why: 'The readiness evidence.',
            },
          },
        ],
      },
      { text: 'Added [the pilot lines card].' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'Put the pilot line evidence on the board.' });
    anchor = await waitFor(() =>
      Object.values(sc && readBoard(canvas.id))
        .filter((e) => e.type === 'card.added')
        .map((e) => (e.data as { card: Card }).card)
        .find((c) => c.provenance.kind === 'agent' && c.provenance.toolCallId === 'call_anchor'),
    );
    await idle(canvas.rootSessionId!);

    // The thread turn: Orb places a question WITHOUT naming the thread, then replies.
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_thread_q',
            name: 'place_card',
            arguments: {
              type: 'question',
              frameId: f1.id,
              title: 'Do pilot lines prove yield?',
              body: 'Pilot output says little about yield at volume.',
              why: 'Raised in the thread on the pilot lines card.',
            },
          },
        ],
      },
      { text: 'Pilot lines show feasibility, not yield. I pinned the open question next to the card.' },
    );
    const before = byAgent.orb.length;
    await wire.orb.chat.send(canvas.id, { text: 'Does this prove it scales?', threadOf: anchor.id });
    await idle(canvas.rootSessionId!);
    // The model got the thread block.
    const threadReq = byAgent.orb[before]!;
    expect(textOf((threadReq.body.messages as any[]).findLast((m: any) => m.role === 'user'))).toContain(
      `<thread of="${anchor.id}">`,
    );

    await waitFor(() => readBoard(canvas.id).filter((e) => e.type === 'thread.message').length === 2);
    const events = readBoard(canvas.id);
    const messages = events.filter((e) => e.type === 'thread.message');
    expect(messages.map((e) => [e.actor.kind, (e.data as any).of, (e.data as any).text])).toEqual([
      ['user', anchor.id, 'Does this prove it scales?'],
      [
        'agent',
        anchor.id,
        'Pilot lines show feasibility, not yield. I pinned the open question next to the card.',
      ],
    ]);
    expect(messages[1]!.actor).toMatchObject({
      kind: 'agent',
      agent: 'orb',
      sessionId: canvas.rootSessionId,
    });

    const question = events
      .filter((e) => e.type === 'card.added')
      .map((e) => (e.data as { card: Card }).card)
      .find((c) => c.provenance.kind === 'agent' && c.provenance.toolCallId === 'call_thread_q')!;
    expect(question.frameId).toBe(f1.id);
    // Next to the anchor: right of it or right below it, within one cell.
    const dx = question.x - (anchor.x + anchor.w);
    const dy = question.y - (anchor.y + anchor.h);
    expect(
      (dx >= 0 && dx <= 32 && question.y === anchor.y) || (dy >= 0 && dy <= 32 && question.x === anchor.x),
    ).toBe(true);
    const link = events
      .filter((e) => e.type === 'link.added')
      .map((e) => (e.data as { link: Link }).link)
      .find((l) => l.to === question.id)!;
    expect(link).toMatchObject({ from: anchor.id, to: question.id, type: 'label', label: 'thread' });
    expect(link.provenance).toMatchObject({ kind: 'agent', agent: 'orb', toolCallId: 'call_thread_q' });

    // The follow snapshot carries the thread (reply count on the card).
    const snap = await snapshotOf(canvas.id);
    expect(snap.threads?.[anchor.id]?.map((m) => [m.by, m.text.slice(0, 20)])).toEqual([
      ['user', 'Does this prove it s'],
      ['orb', 'Pilot lines show fea'],
    ]);
  });

  it('a frame thread places the card in that frame; a plain message afterwards is no thread turn', async () => {
    const f2 = frames[2]!;
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_frame_thread',
            name: 'place_card',
            arguments: {
              type: 'risk',
              title: 'Supply of lithium metal',
              body: 'Few suppliers.',
              why: 'Frame thread.',
            },
          },
        ],
      },
      { text: 'Added a risk to this frame.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'What could go wrong here?', threadOf: f2.id });
    await idle(canvas.rootSessionId!);
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_plain',
            name: 'place_card',
            arguments: { type: 'doc', title: 'Summary', body: 'So far so good.', why: 'Plain chat.' },
          },
        ],
      },
      { text: 'Summary added.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'Summarise.' });
    // The agent can read idle while the harness runs between-turn maintenance with the message still queued
    // (`status` is idle in the maintenance phase), so wait for the turn's card itself, then for idle.
    await waitFor(() =>
      readBoard(canvas.id).some(
        (e) =>
          e.type === 'card.added' &&
          (e.data as { card: Card }).card.provenance.kind === 'agent' &&
          ((e.data as { card: Card }).card.provenance as { toolCallId?: string }).toolCallId === 'call_plain',
      ),
    );
    await idle(canvas.rootSessionId!);
    await waitFor(() => readBoard(canvas.id).filter((e) => e.type === 'thread.message').length === 4);
    const events = readBoard(canvas.id);
    const cards = events.filter((e) => e.type === 'card.added').map((e) => (e.data as { card: Card }).card);
    const links = events.filter((e) => e.type === 'link.added').map((e) => (e.data as { link: Link }).link);
    const risk = cards.find(
      (c) => c.provenance.kind === 'agent' && c.provenance.toolCallId === 'call_frame_thread',
    )!;
    expect(risk.frameId).toBe(f2.id);
    expect(links.find((l) => l.to === risk.id)).toMatchObject({
      from: f2.id,
      type: 'label',
      label: 'thread',
    });
    const plain = cards.find(
      (c) => c.provenance.kind === 'agent' && c.provenance.toolCallId === 'call_plain',
    )!;
    expect(plain.frameId).toBeNull();
    expect(links.some((l) => l.to === plain.id)).toBe(false);
    // Unknown thread ids are refused before anything is stored or sent.
    await expect(wire.orb.chat.send(canvas.id, { text: 'x', threadOf: 'c_nope' })).rejects.toMatchObject({
      code: 'orb/not-found',
    });
    expect(readBoard(canvas.id).filter((e) => e.type === 'thread.message')).toHaveLength(4);
  });

  it("the provenance detail: session/page with throughSeq = eventSeq returns the card's turn, with its tool call", async () => {
    const seq = anchor.provenance.kind === 'agent' ? anchor.provenance.eventSeq : undefined;
    expect(typeof seq).toBe('number');
    const page = await wire.session.page({
      address: { kind: 'session', sessionId: canvas.rootSessionId! },
      throughSeq: seq!,
      maxMessages: 40,
      turnWindow: { minMessages: 1, minTurns: 1 },
    });
    const types = page.records.map((r) => r.event.type);
    expect(types[0]).toBe('turn/start');
    expect(types.filter((t) => t === 'turn/start')).toHaveLength(1);
    const call = page.records.find((r) => r.event.type === 'tool/call')?.event.data as any;
    expect(call).toMatchObject({ callId: 'call_anchor', name: 'place_card' });
    const user = page.records.find((r) => r.event.type === 'user/message')?.event.data as any;
    expect(JSON.stringify(user)).toContain('Put the pilot line evidence on the board.');
    expect(page.records.at(-1)!.event.seq).toBe(seq);
  });

  it("a child's card: session/page through the subagent address; per-agent Stop stops Scout alone", async () => {
    const f0 = frames[0]!;
    const statuses: AgentStatus[] = [];
    const follow = new AbortController();
    void (async () => {
      for await (const s of wire.orb.agents.status(canvas.id, { signal: follow.signal })) statuses.push(s);
    })().catch(() => undefined);
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_delegate',
            name: 'delegate',
            arguments: { role: 'scout', frameIds: [f0.id], instruction: 'Find reports.' },
          },
        ],
      },
      { text: 'Scout is on it.' },
    );
    scripts.scout.push(
      {
        toolCalls: [
          {
            id: 'call_scout_card',
            name: 'place_card',
            arguments: {
              type: 'source',
              frameId: f0.id,
              title: 'IEA outlook',
              url: 'https://www.iea.org/reports/batteries',
              body: 'Pilot lines in 2025.',
              why: 'Market data.',
            },
          },
        ],
      },
      // A long, slow turn: Scout is mid-stream when the user stops it.
      { text: 'Reading the report now, '.repeat(60), chunkDelayMs: 50 },
    );
    await wire.orb.chat.send(canvas.id, { text: 'Get Scout on the market.' });
    const card = await waitFor(() =>
      readBoard(canvas.id)
        .filter((e) => e.type === 'card.added')
        .map((e) => (e.data as { card: Card }).card)
        .find((c) => c.provenance.kind === 'agent' && c.provenance.toolCallId === 'call_scout_card'),
    );
    expect(card.provenance).toMatchObject({ kind: 'agent', agent: 'scout' });
    const scoutId = card.provenance.kind === 'agent' ? card.provenance.sessionId : '';
    const page = await wire.session.page({
      address: {
        kind: 'subagent',
        parentSessionId: canvas.rootSessionId!,
        childSessionId: scoutId,
        mode: 'continuable',
      },
      throughSeq: card.provenance.kind === 'agent' ? card.provenance.eventSeq! : 0,
      maxMessages: 40,
      turnWindow: { minMessages: 1, minTurns: 1 },
    });
    expect((page.records.find((r) => r.event.type === 'tool/call')?.event.data as any)?.callId).toBe(
      'call_scout_card',
    );

    // Scout's slow turn is streaming: stop Scout alone.
    await waitFor(
      () => byAgent.scout.length >= 2 && statuses.some((s) => s.agent === 'scout' && s.state === 'running'),
    );
    const result = await wire.orb.agents.control(canvas.id, { agent: 'scout', action: 'stop' });
    expect(result).toMatchObject({ action: 'stop', state: 'stopped', agents: 1 });
    timingExpect(() => {
      expect(result.stopMs).toBeLessThan(STOP_TIMEOUT_MS);
    });
    await waitFor(() => statuses.some((s) => s.agent === 'scout' && s.state === 'stopped'));
    expect(statuses.some((s) => s.agent === 'scout' && s.state === 'stopping')).toBe(true);
    // Orb was not stopped.
    expect(statuses.filter((s) => s.agent === 'orb').some((s) => s.state === 'stopping')).toBe(false);
    // Unknown child: a clear refusal.
    await expect(
      wire.orb.agents.control(canvas.id, { agent: 'builder', action: 'stop' }),
    ).rejects.toMatchObject({
      code: 'orb/not-found',
    });
    follow.abort();
  });
});
