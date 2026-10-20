/**
 * P3.1 contract test: the board tools over the orb-cards registry, on a REAL sidecar (mock LLM).
 * - The caller's role comes from its identity (session id → canvas.json), not from a tool argument: the canvas's
 *   root agent is Orb; a session listed under `childAgentIds.scout` is Scout; any other session in the canvas folder
 *   gets no board access.
 * - `place_card` checks the type's fields and the role's card-type permissions (BUILD_PLAN §2.4).
 * - `update_card` changes a card's fields, never a user note.
 * - `query_board` returns frames and cards with `describe()` text and ids, never coordinates.
 * - P3.2: `place_card` into a frame is laid out by the layout engine (grid cells, the frame grows downward) and a
 *   frame at its 12-card budget answers FRAME_FULL with the caller's own cards.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BoardEvent, CanvasMeta, Card } from '@orb/shared';
import { startMockedSidecar, type MockedSidecar } from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';

let sc: MockedSidecar;
let wire: Wire;
let canvas: CanvasMeta;
let scoutSession: string;

beforeAll(async () => {
  sc = await startMockedSidecar();
  wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
  canvas = await wire.orb.canvas.create({ prompt: 'Card registry check' });
});

afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
});

const canvasDir = () => join(sc.paths.orbHome, 'canvases', canvas.id);
const readBoard = (): BoardEvent[] =>
  readFileSync(join(canvasDir(), 'board.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BoardEvent);
const cardsOnDisk = (): Card[] =>
  readBoard().flatMap((e) => (e.type === 'card.added' ? [(e.data as { card: Card }).card] : []));

let callSeq = 0;

/** Script one tool call for the next model turn, send `text` with `send`, and return the tool result text. */
async function toolResult(
  name: string,
  args: Record<string, unknown>,
  send: (text: string) => Promise<unknown>,
) {
  const callId = `call_${name}_${++callSeq}`;
  const first = sc.llm.requests.length;
  sc.llm.enqueue({ toolCalls: [{ id: callId, name, arguments: args }] }, { text: 'ok' });
  await send(`run ${name}`);
  const followUp = await sc.llm.waitForRequest((r) => r.id === first + 2);
  const toolMsg = followUp.body.messages.at(-1);
  expect(toolMsg).toMatchObject({ role: 'tool', tool_call_id: callId });
  return String(toolMsg.content);
}
const asOrb = (name: string, args: Record<string, unknown>) =>
  toolResult(name, args, (text) => wire.orb.chat.send(canvas.id, { text }));
const asSession = (sessionId: string) => (name: string, args: Record<string, unknown>) =>
  toolResult(name, args, (text) => wire.session.prompt(sessionId, text));

describe('board tools over the card registry', () => {
  it('a session in the canvas folder that is not a canvas agent gets no board access', async () => {
    const created = await wire.session.create({ cwd: canvasDir() });
    scoutSession = created.sessionId;
    const res = await asSession(scoutSession)('place_card', {
      type: 'quote',
      title: 'Example Org',
      body: 'Y holds in every case.',
      why: 'Key line.',
    });
    expect(res).toContain('not one of the canvas agents');
    expect(cardsOnDisk()).toEqual([]);
  });

  it('a session registered as Scout places Scout types only, stamped as scout', async () => {
    // P3.4 `delegate` will write this; here the test registers the gateway session as the canvas's Scout.
    const file = join(canvasDir(), 'canvas.json');
    const meta = JSON.parse(readFileSync(file, 'utf8')) as CanvasMeta;
    writeFileSync(file, JSON.stringify({ ...meta, childAgentIds: { scout: scoutSession } }));
    const scout = asSession(scoutSession);

    const placed = await scout('place_card', {
      type: 'quote',
      title: 'Example Org',
      body: 'Y holds in every case.',
      url: 'https://example.org/y',
      why: 'Key line.',
    });
    const { cardId } = JSON.parse(placed) as { cardId: string };
    await expect
      .poll(() => cardsOnDisk().find((c) => c.id === cardId), { timeout: 2_000 })
      .toMatchObject({
        type: 'quote',
        data: { title: 'Example Org', body: 'Y holds in every case.', url: 'https://example.org/y' },
        provenance: { kind: 'agent', agent: 'scout', sessionId: scoutSession },
      });

    // A role claimed in the arguments is not an identity: the call is refused.
    const claimed = await scout('place_card', { type: 'risk', title: 'R', why: 'w', role: 'orb' });
    expect(claimed).toContain('scout may not place risk');
    const extra = await scout('place_card', { type: 'quote', title: 'Q', body: 'b', why: 'w', role: 'orb' });
    expect(extra).toContain('role does not apply to quote cards');
    const denied = await scout('place_card', { type: 'risk', title: 'R', body: 'b', why: 'w' });
    expect(denied).toContain('scout may not place risk cards (allowed: source, quote, image, database, chart, metric, timeline, entity, product, video, checklist)');
    const invalid = await scout('place_card', { type: 'source', title: 'No link', body: 'b', why: 'w' });
    expect(invalid).toMatch(/invalid source card url/);
    await new Promise((r) => setTimeout(r, 400));
    expect(cardsOnDisk()).toHaveLength(1);
  });

  it('Orb places typed cards, updates them, and never changes a user note', async () => {
    const q = await asOrb('place_card', {
      type: 'question',
      title: 'Does Y hold at scale?',
      body: 'Only small samples.',
      why: 'The key gap.',
    });
    const questionId = (JSON.parse(q) as { cardId: string }).cardId;
    const upd = await asOrb('update_card', { cardId: questionId, state: 'answered', answer: 'Yes, n=10k.' });
    expect(JSON.parse(upd)).toEqual({ cardId: questionId, updated: true });
    await expect
      .poll(() => readBoard().at(-1), { timeout: 2_000 })
      .toMatchObject({
        type: 'card.updated',
        actor: { kind: 'agent', agent: 'orb' },
        data: { id: questionId, patch: { data: { state: 'answered', answer: 'Yes, n=10k.' } } },
      });

    const { events } = await wire.orb.board.command(canvas.id, {
      type: 'card.added',
      card: { type: 'note', x: 0, y: 0, w: 200, h: 120, data: { title: 'Mine', body: 'my text' } },
    });
    const noteId = (events[0]!.data as { card: Card }).card.id;
    const refused = await asOrb('update_card', { cardId: noteId, body: 'rewritten' });
    expect(refused).toContain("agents cannot change the user's note");
    await new Promise((r) => setTimeout(r, 400));
    expect(readBoard().at(-1)!).toMatchObject({ type: 'card.added', actor: { kind: 'user' } });

    const noNote = await asOrb('place_card', { type: 'note', title: 'n', body: 'b', why: 'w' });
    expect(noNote).toMatch(/type/);
  });

  it('query_board returns describe() text and ids, never coordinates', async () => {
    const res = JSON.parse(await asOrb('query_board', { types: ['question', 'quote', 'note'] })) as {
      frames: unknown[];
      cards: Array<Record<string, unknown>>;
    };
    expect(res.frames).toEqual([]);
    expect(res.cards).toEqual([
      expect.objectContaining({
        type: 'quote',
        by: 'scout',
        description: '"Y holds in every case." — Example Org, https://example.org/y',
      }),
      expect.objectContaining({
        type: 'question',
        by: 'orb',
        title: 'Does Y hold at scale?',
        description: 'Answered question. Answer: Yes, n=10k. Only small samples.',
      }),
      expect.objectContaining({ type: 'note', by: 'user', title: 'Mine', description: 'my text' }),
    ]);
    for (const card of res.cards) {
      expect(Object.keys(card).sort()).toEqual(
        expect.not.arrayContaining(['x', 'y', 'w', 'h', 'data', 'provenance']),
      );
    }
    const q = JSON.parse(await asOrb('query_board', { q: 'scale' })) as { cards: Array<{ type: string }> };
    expect(q.cards.map((c) => c.type)).toEqual(['question']);
  });
});

describe('layout engine and frame budget over the wire (P3.2)', () => {
  it('lays cards out in the frame grid, grows the frame, and answers the 13th with FRAME_FULL', async () => {
    const add = await wire.orb.board.command(canvas.id, {
      type: 'frame.added',
      frame: { title: 'Budget', color: 'sky', x: 3000, y: 0, w: 640, h: 300 },
    });
    const frameId = (add.event!.data as { frame: { id: string } }).frame.id;
    const calls = Array.from({ length: 13 }, (_, i) => ({
      id: `call_budget_${i}`,
      name: 'place_card',
      arguments: { type: i % 2 ? 'question' : 'risk', title: `Card ${i}`, body: 'b', why: 'budget', frameId },
    }));
    const first = sc.llm.requests.length;
    sc.llm.enqueue({ toolCalls: calls }, { text: 'ok' });
    await wire.orb.chat.send(canvas.id, { text: 'fill the frame' });
    const followUp = await sc.llm.waitForRequest((r) => r.id === first + 2);
    const results = followUp.body.messages
      .filter((m: { role: string; tool_call_id?: string }) => m.role === 'tool' && m.tool_call_id?.startsWith('call_budget_'))
      .map((m: { content: unknown }) => JSON.parse(String(m.content)) as Record<string, unknown>);
    expect(results).toHaveLength(13);
    const full = results.filter((r: Record<string, unknown>) => r.error === 'FRAME_FULL');
    expect(full).toHaveLength(1);
    expect(full[0]).toMatchObject({ frameId, budget: 12, cards: 12 });
    // Orb placed all 12: they are its own cards there.
    expect((full[0]!.ownCards as unknown[]).length).toBe(12);
    expect(results.filter((r: Record<string, unknown>) => typeof r.cardId === 'string')).toHaveLength(12);

    await new Promise((r) => setTimeout(r, 400));
    const events = readBoard();
    const inFrame = cardsOnDisk().filter((c) => c.frameId === frameId);
    expect(inFrame).toHaveLength(12);
    const grew = events.filter((e) => e.type === 'frame.updated' && (e.data as { id: string }).id === frameId);
    expect(grew.length).toBeGreaterThan(0);
    expect(grew.every((e) => e.actor.kind === 'agent')).toBe(true);
    // P6.20: the frame grows sideways first (up to 8 grid columns), then down: its final size is every patch applied.
    const final = { x: 3000, y: 0, w: 640, h: 300 };
    for (const e of grew) Object.assign(final, (e.data as { patch: Partial<typeof final> }).patch);
    expect(final.w).toBeGreaterThan(640);
    expect(final.w).toBeLessThanOrEqual(8 * 132 + 7 * 16 + 48);
    for (const [i, a] of inFrame.entries()) {
      expect(a.x).toBeGreaterThanOrEqual(3000);
      expect(a.x + a.w).toBeLessThanOrEqual(final.x + final.w);
      expect(a.y + a.h).toBeLessThanOrEqual(final.y + final.h);
      for (const b of inFrame.slice(i + 1)) {
        expect(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y).toBe(false);
      }
    }
  });
});
