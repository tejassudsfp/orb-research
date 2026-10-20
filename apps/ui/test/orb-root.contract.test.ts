/**
 * P3.3 contract test: the root Orb agent and the `orb` preset, on a REAL sidecar whose default model is the mock LLM.
 * - Persona: the system prompt is Orb's persona (role, 3–5 frame proposals, cite cards, typed cards over prose,
 *   delegate for research).
 * - New canvas (`canvas.create {start: true}`, what Home sends): Orb gets the new-canvas turn with the user's question
 *   and proposes frames with `add_frame`; the layout engine puts them on the template grid, with agent provenance.
 *   A template canvas's turn lists its frames instead; a seeded canvas's turn asks what to understand first.
 * - `add_frame` (no duplicates), `update_frame` (title/colour only), `add_link` (no duplicates).
 * - `chat.send` injects the frames and cards in context as describe() text, and the thread's card.
 * - orb.json `models.orb` routes the root agent.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEMPLATE_LAYOUT, type BoardEvent, type CanvasMeta, type Frame, type Link, PARALLEL_ORB_TOOL_NAMES, SCALE_TOOL_NAMES, LAYOUT_TOOL_NAMES, LAYOUT_ORB_TOOL_NAMES } from '@orb/shared';
import {
  MOCK_MODEL,
  MOCK_MODEL_ALT,
  MOCK_PROVIDER,
  startMockedSidecar,
  type MockRequest,
  type MockedSidecar,
} from '../../../scripts/testkit/index.ts';
import { WireError, createWire, type Wire } from '../src/wire/index.js';

let sc: MockedSidecar;
let wire: Wire;

beforeAll(async () => {
  sc = await startMockedSidecar();
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
const framesOnDisk = (id: string): Frame[] =>
  readBoard(id).flatMap((e) => (e.type === 'frame.added' ? [(e.data as { frame: Frame }).frame] : []));

/** Every text the model got in one message, whatever the route's content shape (string or parts). */
const textOf = (message: any): string =>
  typeof message?.content === 'string'
    ? message.content
    : Array.isArray(message?.content)
      ? message.content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n')
      : '';
const lastUser = (req: MockRequest) =>
  textOf([...(req.body.messages as any[])].reverse().find((m) => m.role === 'user'));
/** The tool messages of the last model turn (after the last assistant message), as sent to the model. */
const lastToolMessages = (req: MockRequest): any[] => {
  const messages = req.body.messages as any[];
  const out: any[] = [];
  for (let i = messages.length - 1; i >= 0 && messages[i].role === 'tool'; i--) out.unshift(messages[i]);
  return out;
};
const toolResults = (req: MockRequest) => lastToolMessages(req).map((m) => JSON.parse(String(m.content)));

/** board.jsonl is flushed every 250 ms: wait until `count` events of `type` are on disk. */
async function onDisk(id: string, type: BoardEvent['type'], count: number) {
  await expect
    .poll(() => readBoard(id).filter((e) => e.type === type).length, { timeout: 3_000 })
    .toBe(count);
}

/** Wait until the root session of `canvasId` is idle again (its turn ended). */
async function idle(sessionId: string) {
  await expect
    .poll(async () => (await wire.session.list()).items.find((s) => s.sessionId === sessionId)?.running, {
      timeout: 10_000,
    })
    .toBe(false);
}

let canvas: CanvasMeta;
const frameIds = {} as Record<'Thesis' | 'Market' | 'Competitors' | 'Open questions', string>;

describe('the root Orb agent (P3.3)', () => {
  it('a new canvas started from Home gets the new-canvas turn, and Orb proposes frames with add_frame', async () => {
    const first = sc.llm.requests.length;
    const titles = ['Thesis', 'Market', 'Competitors', 'Open questions'];
    sc.llm.enqueue(
      {
        toolCalls: titles.map((title, i) => ({
          id: `call_frame_${i}`,
          name: 'add_frame',
          arguments: { title },
        })),
      },
      { text: 'I set up four frames; Scout and Critic will start once delegation is available.' },
    );
    canvas = await wire.orb.canvas.create({ prompt: 'A research canvas for founders', start: true });
    expect(canvas.rootSessionId).toMatch(/^orb-/);

    const kickoff = await sc.llm.waitForRequest((r) => r.id === first + 1);
    // The persona: Orb's role, frame proposals, citing cards, typed cards, delegation.
    const system = textOf((kickoff.body.messages as any[])[0]);
    expect((kickoff.body.messages as any[])[0].role).toMatch(/system|developer/);
    expect(system).toContain('You are orb, a research partner');
    expect(system).toContain('propose 3 to 5 frames');
    expect(system).toContain('start Scout and Critic with delegate');
    expect(system).toContain('Always cite cards');
    expect(system).toContain('Never write a prose card when a typed card fits');
    expect(system).toContain('Use delegate for research');
    // The new-canvas turn: the question, and what to do with it.
    const prompt = lastUser(kickoff);
    expect(prompt).toContain("New canvas. The user's question: A research canvas for founders");
    expect(prompt).toContain('Propose 3 to 5 frames for this question with add_frame');
    expect(prompt).toContain('start Scout and Critic with delegate unless the question says otherwise');
    expect((kickoff.body.tools as any[]).map((t) => t.function.name).sort()).toEqual([
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

    const followUp = await sc.llm.waitForRequest((r) => r.id === first + 2);
    const results = toolResults(followUp);
    expect(results.map((r) => [r.number, r.title, r.created])).toEqual([
      ['01', 'Thesis', true],
      ['02', 'Market', true],
      ['03', 'Competitors', true],
      ['04', 'Open questions', true],
    ]);
    await idle(canvas.rootSessionId!);
    await onDisk(canvas.id, 'frame.added', 4);

    // On disk: four frames on the template grid, stamped with Orb's provenance from the exec context.
    const frames = framesOnDisk(canvas.id);
    expect(frames.map((f) => f.title)).toEqual(titles);
    const { w, h, gap, originX, originY } = TEMPLATE_LAYOUT;
    expect(frames.map((f) => [f.x, f.y, f.w, f.h])).toEqual([
      [originX, originY, w, h],
      [originX + w + gap, originY, w, h],
      [originX + 2 * (w + gap), originY, w, h],
      [originX, originY + h + gap, w, h],
    ]);
    expect(frames.map((f) => f.color)).toEqual(['signal', 'sky', 'rho', 'sky']);
    for (const [i, f] of frames.entries()) {
      expect(f.provenance).toMatchObject({
        kind: 'agent',
        agent: 'orb',
        model: MOCK_MODEL,
        provider: MOCK_PROVIDER,
        sessionId: canvas.rootSessionId,
        toolCallId: `call_frame_${i}`,
      });
      frameIds[f.title as keyof typeof frameIds] = f.id;
    }
    expect(results.map((r) => r.frameId)).toEqual(frames.map((f) => f.id));
  });

  it('add_frame never duplicates a frame; update_frame renames and recolours; add_link links once', async () => {
    const first = sc.llm.requests.length;
    sc.llm.enqueue(
      {
        toolCalls: [
          { id: 'call_dup', name: 'add_frame', arguments: { title: '  market ' } },
          {
            id: 'call_rename',
            name: 'update_frame',
            arguments: { frameId: frameIds.Market, title: 'Market size', color: 'paper' },
          },
          {
            id: 'call_q',
            name: 'place_card',
            arguments: {
              type: 'question',
              frameId: frameIds.Thesis,
              title: 'Who pays first?',
              body: 'Founders or their investors?',
              why: 'Decides the go-to-market.',
            },
          },
          { id: 'call_empty', name: 'update_frame', arguments: { frameId: frameIds.Thesis } },
        ],
      },
      { text: 'Done.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'tidy the frames' });
    const req = await sc.llm.waitForRequest((r) => r.id === first + 2);
    const tools = lastToolMessages(req);
    expect(tools).toHaveLength(4);
    const [dup, renamed, question] = tools.slice(0, 3).map((m) => {
      const content = String(m.content);
      expect(content.startsWith('Error'), content).toBe(false);
      return JSON.parse(content);
    });
    expect(dup).toEqual({ frameId: frameIds.Market, number: '02', title: 'Market', created: false });
    expect(renamed).toEqual({ frameId: frameIds.Market, title: 'Market size', color: 'paper' });
    expect(question.cardId).toMatch(/^c_/);
    const empty = (req.body.messages as any[]).at(-1);
    expect(String(empty.content)).toContain('nothing to update');
    await idle(canvas.rootSessionId!);

    const second = sc.llm.requests.length;
    const link = { from: question.cardId, to: frameIds.Competitors, type: 'leads-to' };
    sc.llm.enqueue(
      {
        toolCalls: [
          { id: 'call_link', name: 'add_link', arguments: link },
          { id: 'call_link_again', name: 'add_link', arguments: { ...link, from: link.to, to: link.from } },
          { id: 'call_label', name: 'add_link', arguments: { ...link, type: 'label' } },
        ],
      },
      { text: 'Linked.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'link the question to competitors' });
    const linkReq = await sc.llm.waitForRequest((r) => r.id === second + 2);
    const messages = lastToolMessages(linkReq);
    const [made, again] = messages.slice(0, 2).map((m) => JSON.parse(String(m.content)));
    expect(made).toMatchObject({ created: true });
    expect(again).toEqual({ linkId: made.linkId, created: false });
    expect(String(messages[2].content)).toContain('a label link needs a label');
    await idle(canvas.rootSessionId!);

    await onDisk(canvas.id, 'link.added', 1);
    const events = readBoard(canvas.id);
    const links = events.flatMap((e) => (e.type === 'link.added' ? [(e.data as { link: Link }).link] : []));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      ...link,
      provenance: { kind: 'agent', agent: 'orb', toolCallId: 'call_link' },
    });
    const update = events.find((e) => e.type === 'frame.updated')!;
    expect(update.data).toEqual({ id: frameIds.Market, patch: { title: 'Market size', color: 'paper' } });
    expect(update.actor).toMatchObject({ kind: 'agent', agent: 'orb', toolCallId: 'call_rename' });
    expect(framesOnDisk(canvas.id)).toHaveLength(4);
  });

  it('chat.send injects the frames and cards in context, and the thread card, as describe() text', async () => {
    const note = await wire.orb.board.command(canvas.id, {
      type: 'card.added',
      card: {
        type: 'note',
        frameId: frameIds.Competitors,
        x: 1000,
        y: 200,
        w: 240,
        h: 160,
        data: { text: 'Ask Dana about the incumbents.' },
      },
    });
    const noteId = (note.event!.data as { card: { id: string } }).card.id;
    const question = readBoard(canvas.id)
      .filter((e) => e.type === 'card.added')
      .map((e) => (e.data as { card: { id: string; type: string } }).card)
      .find((c) => c.type === 'question');
    if (!question) throw new Error('no question card');

    const first = sc.llm.requests.length;
    sc.llm.enqueue({ text: 'Founders pay first, per the question card.' });
    await wire.orb.chat.send(canvas.id, {
      text: 'what do we know?',
      context: { frameIds: [frameIds.Thesis], cardIds: [noteId] },
      threadOf: question.id,
    });
    const req = await sc.llm.waitForRequest((r) => r.id === first + 1);
    const user = lastUser(req);
    expect(user.startsWith('what do we know?')).toBe(true);
    expect(user).toContain('<board-context>');
    expect(user).toContain(`Frame 01 "Thesis" [${frameIds.Thesis}]: 1 card`);
    expect(user).toContain(`- [${question.id}] question "Who pays first?" (by orb)`);
    expect(user).toContain('Why: Decides the go-to-market.');
    expect(user).toContain(
      `- [${noteId}] note "Ask Dana about the incumbents." (by user, in frame 03 "Competitors" [${frameIds.Competitors}])`,
    );
    expect(user).toContain(`<thread of="${question.id}">`);
    expect(user).toContain(`This message was written in the thread of card [${question.id}]`);
    expect(user).toContain('put next to it and linked to it (place_card threadOf=');
    // Never coordinates.
    expect(user).not.toMatch(/"x"|\bx: \d/);
    await idle(canvas.rootSessionId!);

    // Context that is not on the board is refused before anything is sent.
    const before = sc.llm.requests.length;
    const bad = await wire.orb.chat
      .send(canvas.id, { text: 'and this?', context: { cardIds: ['c_missing'] } })
      .catch((e: unknown) => e);
    expect((bad as WireError).code).toBe('orb/not-found');
    const badThread = await wire.orb.chat
      .send(canvas.id, { text: 'and this?', threadOf: 'f_missing' })
      .catch((e: unknown) => e);
    expect((badThread as WireError).code).toBe('orb/not-found');
    await new Promise((r) => setTimeout(r, 200));
    expect(sc.llm.requests.length).toBe(before);
  });

  it("a template canvas's turn lists its frames; a seeded canvas's turn asks what to understand first", async () => {
    let first = sc.llm.requests.length;
    const tpl = await wire.orb.canvas.create({ prompt: 'Acme Corp', template: 'topic', start: true });
    let req = await sc.llm.waitForRequest((r) => r.id === first + 1);
    let prompt = lastUser(req);
    expect(prompt).toContain("New canvas. The user's question: Acme Corp");
    expect(prompt).toContain(
      'They started from the "Topic deep dive" template. Its brief: Build a deep understanding',
    );
    expect(prompt).toMatch(/The board already has these frames:\n- 01 "Thesis" \[f_[0-9A-Z]+\]/);
    expect(prompt).toContain('- 05 "Open questions" [');
    expect(prompt).toContain('Start Scout and Critic with delegate on these frames');
    expect(prompt).not.toContain('Propose 3 to 5 frames');
    await idle(tpl.rootSessionId!);

    first = sc.llm.requests.length;
    const seeded = await wire.orb.canvas.create({
      prompt: 'paper.pdf',
      seed: { kind: 'file', name: 'paper.pdf', count: 2 },
      start: true,
    });
    req = await sc.llm.waitForRequest((r) => r.id === first + 1);
    prompt = lastUser(req);
    expect(prompt).toContain('They started this canvas from material: a file, "paper.pdf" (and 1 more item)');
    expect(prompt).toContain('ask in one or two sentences what they want to understand about it');
    expect(prompt).not.toContain('Propose 3 to 5 frames');
    await idle(seeded.rootSessionId!);

    // Without `start` (scripted callers) nothing is sent.
    first = sc.llm.requests.length;
    await wire.orb.canvas.create({ prompt: 'Quiet canvas' });
    await new Promise((r) => setTimeout(r, 300));
    expect(sc.llm.requests.length).toBe(first);
  });

  it('orb.json models.orb routes the root agent (applies the next time it starts)', async () => {
    await wire.orb.settings.set({ models: { orb: { provider: MOCK_PROVIDER, model: MOCK_MODEL_ALT } } });
    try {
      const first = sc.llm.requests.length;
      sc.llm.enqueue({
        toolCalls: [{ id: 'call_alt_frame', name: 'add_frame', arguments: { title: 'Thesis' } }],
      });
      const meta = await wire.orb.canvas.create({ prompt: 'Model routing', start: true });
      const req = await sc.llm.waitForRequest((r) => r.id === first + 1);
      expect(req.body.model).toBe(MOCK_MODEL_ALT);
      await idle(meta.rootSessionId!);
      await onDisk(meta.id, 'frame.added', 1);
      expect(framesOnDisk(meta.id)[0]!.provenance).toMatchObject({ agent: 'orb', model: MOCK_MODEL_ALT });
    } finally {
      await wire.orb.settings.set({ models: { orb: { provider: MOCK_PROVIDER, model: MOCK_MODEL } } });
    }
  });
});
