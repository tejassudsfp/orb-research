/**
 * P1.8 contract test: the first agent tool, end to end on a REAL sidecar whose default model is the local mock LLM.
 *   canvas.create → root Orb agent (session id in canvas.json)
 *   orb/chat.send "put a card about X on the board" → the agent calls place_card (scripted mock turn)
 *   → card.added in board.jsonl with agent provenance → live on orb/board.follow.
 * Also: the model is offered ONLY place_card and query_board, query_board reads the board back, and place_card
 * honours exec.signal (a session cancel during its artificial delay writes nothing).
 */
import { LAYOUT_ORB_TOOL_NAMES, LAYOUT_TOOL_NAMES, PARALLEL_ORB_TOOL_NAMES, SCALE_TOOL_NAMES } from '@orb/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BoardEvent, BoardFollowFrame, CanvasMeta } from '@orb/shared';
import {
  MOCK_MODEL,
  MOCK_PROVIDER,
  startMockedSidecar,
  type MockedSidecar,
} from '../../../scripts/testkit/index.ts';
import { ReplyTracker, WireError, createWire, type Wire } from '../src/wire/index.js';
import { timingExpect } from '../../../scripts/testkit/namespace.ts';

/** place_card waits this long before writing (ORB_TEST_PLACE_CARD_DELAY_MS), so a cancel can land mid-tool. */
const TOOL_DELAY_MS = 1_000;

let sc: MockedSidecar;
let wire: Wire;

beforeAll(async () => {
  sc = await startMockedSidecar({ env: { ORB_TEST_PLACE_CARD_DELAY_MS: String(TOOL_DELAY_MS) } });
  wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
  wire.events.start();
});

afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
});

const boardFile = (id: string) => join(sc.paths.orbHome, 'canvases', id, 'board.jsonl');
const readBoard = (id: string): BoardEvent[] =>
  readFileSync(boardFile(id), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BoardEvent);

/** Collect a stream in the background; `until` waits for a predicate over what has arrived. */
function collect<T>(iterable: AsyncIterable<T>, ac: AbortController) {
  const items: T[] = [];
  const waiters = new Set<() => void>();
  const done = (async () => {
    try {
      for await (const item of iterable) {
        items.push(item);
        for (const w of [...waiters]) w();
      }
    } catch (e) {
      if (!ac.signal.aborted) throw e;
    }
  })();
  const until = (pred: (items: T[]) => boolean, timeoutMs = 20_000) =>
    new Promise<void>((resolve, reject) => {
      if (pred(items)) return resolve();
      const timer = setTimeout(() => {
        waiters.delete(check);
        reject(new Error(`stream: condition not met in ${timeoutMs} ms (${items.length} items)`));
      }, timeoutMs);
      const check = () => {
        if (!pred(items)) return;
        clearTimeout(timer);
        waiters.delete(check);
        resolve();
      };
      waiters.add(check);
    });
  return { items, until, stop: async () => (ac.abort(), done) };
}

function followBoard(canvasId: string) {
  const ac = new AbortController();
  return collect<BoardFollowFrame>(wire.orb.board.follow(canvasId, { signal: ac.signal }), ac);
}

function followTurns(sessionId: string) {
  const ac = new AbortController();
  const tracker = new ReplyTracker();
  const turnEnds: string[] = [];
  const stream = (async function* () {
    for await (const frame of wire.session.follow(sessionId, { signal: ac.signal })) {
      const before = tracker.state.lastTurnEnd;
      const wasRunning = tracker.state.running;
      tracker.push(frame);
      if (wasRunning && !tracker.state.running && tracker.state.lastTurnEnd)
        turnEnds.push(tracker.state.lastTurnEnd);
      else if (frame.type === 'snapshot' && tracker.state.lastTurnEnd && tracker.state.lastTurnEnd !== before)
        turnEnds.push(tracker.state.lastTurnEnd);
      yield frame;
    }
  })();
  return { ...collect(stream, ac), tracker, turnEnds };
}

const cardEvents = (frames: BoardFollowFrame[]) =>
  frames.flatMap((f) => (f.kind === 'event' && f.event.type === 'card.added' ? [f.event] : []));

let canvas: CanvasMeta;

describe('root Orb agent', () => {
  it('canvas.create creates the root agent and stores its session id in canvas.json', async () => {
    canvas = await wire.orb.canvas.create({ prompt: 'Card about X' });
    expect(canvas.rootSessionId).toMatch(/^orb-[0-9a-f-]{36}$/);
    const onDisk = JSON.parse(
      readFileSync(join(sc.paths.orbHome, 'canvases', canvas.id, 'canvas.json'), 'utf8'),
    ) as CanvasMeta;
    expect(onDisk.rootSessionId).toBe(canvas.rootSessionId);
    expect(await wire.orb.canvas.open(canvas.id)).toEqual(canvas);
    // The root session is an ordinary harness session: listed by the gateway, cwd = the canvas folder, live agent.
    const { items } = await wire.session.list();
    expect(items.find((i) => i.sessionId === canvas.rootSessionId)).toMatchObject({
      cwd: join(sc.paths.orbHome, 'canvases', canvas.id),
      agentAvailable: true,
      running: false,
    });
  });

  it('"put a card about X on the board" → place_card → board.jsonl + live board event with provenance', async () => {
    const board = followBoard(canvas.id);
    const turns = followTurns(canvas.rootSessionId!);
    await board.until((f) => f.length >= 1);
    const first = sc.llm.requests.length;
    sc.llm.enqueue(
      {
        text: 'Placing it. ',
        toolCalls: [
          {
            id: 'call_card_x',
            name: 'place_card',
            arguments: {
              type: 'doc',
              title: 'About X',
              body: 'X is the thing you asked about.',
              why: 'You asked for a card about X.',
            },
          },
        ],
      },
      { text: 'Done: the card about X is on the board.' },
    );
    const sent = await wire.orb.chat.send(canvas.id, { text: 'put a card about X on the board' });
    expect(sent).toEqual({ accepted: true, sessionId: canvas.rootSessionId });

    // The model is offered exactly the Orb board and team tools registered so far (P3.1–P3.4) and nothing else
    // (consolidate_cards, report_progress and send_message are hidden from Orb: they are not on Orb's §2.4 allow-list).
    const req = await sc.llm.waitForRequest((r) => r.id === first + 1);
    const tools =
      (req.body.tools as Array<{ type: string; function: { name: string; parameters: any } }>) ?? [];
    expect(tools.map((t) => t.function.name).sort()).toEqual([
      'add_frame',
      'add_link',
      'compose_section',
      'compose_slides',
      'delegate',
      'message_agent',
      'place_card',
      'query_board',
      'query_dataset',
      'read_source',
      'stop_agent',
      'update_card',
      'update_frame',
      'upsert_rows',
      ...SCALE_TOOL_NAMES,
      ...LAYOUT_TOOL_NAMES,
      ...LAYOUT_ORB_TOOL_NAMES,
      // P6.7: Orb's Parallel tools (answers, bulk runs, watches).
      ...PARALLEL_ORB_TOOL_NAMES,
    ].sort());
    const place = tools.find((t) => t.function.name === 'place_card')!.function.parameters;
    expect([...place.required].sort()).toEqual(['title', 'type', 'why']);
    // Every agent-placeable type from the orb-cards registry; never `note`.
    expect([...place.properties.type.enum].sort()).toEqual(
      [
        'chart', 'checklist', 'code', 'database', 'decision', 'design', 'diagram', 'doc', 'entity', 'file', 'framework',
        'hypothesis', 'image', 'insight', 'math', 'matrix', 'metric', 'product', 'question', 'quote', 'risk', 'source',
        'table', 'timeline', 'video',
      ].sort(),
    );
    // The user's text reached the model.
    expect(JSON.stringify(req.body.messages)).toContain('put a card about X on the board');

    await board.until((f) => cardEvents(f).length === 1);
    const event = cardEvents(board.items)[0]!;
    const actor = {
      kind: 'agent',
      agent: 'orb',
      model: MOCK_MODEL,
      provider: MOCK_PROVIDER,
      sessionId: canvas.rootSessionId,
      toolCallId: 'call_card_x',
    };
    expect(event).toMatchObject({ seq: 0, type: 'card.added', actor });
    const card = (event.data as { card: any }).card;
    expect(card).toMatchObject({
      type: 'doc',
      frameId: null,
      data: { title: 'About X', body: 'X is the thing you asked about.' },
      why: 'You asked for a card about X.',
      provenance: { ...actor, at: expect.any(Number) },
    });

    // The tool result (the new card id) goes back to the model, which then ends the turn.
    const followUp = await sc.llm.waitForRequest((r) => r.id === first + 2);
    const toolMsg = followUp.body.messages.at(-1);
    expect(toolMsg).toMatchObject({ role: 'tool', tool_call_id: 'call_card_x' });
    expect(JSON.parse(toolMsg.content)).toEqual({ cardId: card.id });
    await turns.until(() => turns.turnEnds.includes('completed'));
    expect(turns.tracker.state.committed.join('')).toContain('Done: the card about X is on the board.');

    // Durable: the same event is in board.jsonl (flushed within the 250 ms batch window).
    await expect.poll(() => readBoard(canvas.id), { timeout: 2_000 }).toEqual([event]);
    await board.stop();
    await turns.stop();
  });

  it('query_board reads the board back to the agent', async () => {
    const first = sc.llm.requests.length;
    sc.llm.enqueue(
      { toolCalls: [{ id: 'call_query', name: 'query_board', arguments: {} }] },
      { text: 'There is one card about X.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'what is on the board?' });
    const followUp = await sc.llm.waitForRequest((r) => r.id === first + 2);
    const toolMsg = followUp.body.messages.at(-1);
    expect(toolMsg).toMatchObject({ role: 'tool', tool_call_id: 'call_query' });
    const { cards } = JSON.parse(toolMsg.content) as { cards: Array<Record<string, unknown>> };
    expect(cards).toEqual([
      expect.objectContaining({
        type: 'doc',
        title: 'About X',
        why: 'You asked for a card about X.',
        by: 'orb',
      }),
    ]);
  });

  it('place_card honours exec.signal: a cancel during the tool delay writes no card', async () => {
    const turns = followTurns(canvas.rootSessionId!);
    await turns.until((f) => f.length >= 1);
    await turns.until(() => !turns.tracker.state.running);
    const endsBefore = turns.turnEnds.length;
    const seqBefore = readBoard(canvas.id).length;
    const first = sc.llm.requests.length;
    sc.llm.enqueue({
      toolCalls: [
        {
          id: 'call_slow',
          name: 'place_card',
          arguments: { type: 'doc', title: 'Slow', body: 'never lands', why: 'cancel test' },
        },
      ],
    });
    await wire.orb.chat.send(canvas.id, { text: 'put a slow card on the board' });
    const req = await sc.llm.waitForRequest((r) => r.id === first + 1);
    await expect.poll(() => req.completed, { timeout: 5_000, interval: 10 }).toBe(true);
    // The model stream is done, so place_card is now inside its 1 s delay.
    const cancelAt = Date.now();
    await wire.session.cancel(canvas.rootSessionId!);
    await turns.until(() => turns.turnEnds.length > endsBefore, 5_000);
    timingExpect(() => {
      expect(Date.now() - cancelAt).toBeLessThan(TOOL_DELAY_MS);
    });
    expect(turns.turnEnds.at(-1)).toBe('aborted');
    await new Promise((r) => setTimeout(r, TOOL_DELAY_MS + 300));
    expect(readBoard(canvas.id)).toHaveLength(seqBefore);
    expect(sc.llm.requests.length).toBe(first + 1);
    await turns.stop();
  });

  it('chat.send validates its arguments and the canvas', async () => {
    const err = (p: Promise<unknown>) =>
      p.then(
        () => undefined,
        (e: unknown) => (e instanceof WireError ? e.code : String(e)),
      );
    expect(await err(wire.orb.chat.send(canvas.id, { text: '' }))).toBe('orb/invalid-args');
    expect(await err(wire.orb.chat.send('2020-01-01-missing', { text: 'hi' }))).toBe('orb/not-found');
  });
});
