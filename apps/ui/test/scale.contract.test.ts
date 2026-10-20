/**
 * P6.8 contract test on a REAL sidecar whose model is the mock LLM: agents at scale.
 *
 * A board of 300 cards (20 frames; notes, docs with long bodies, sources, quotes, tables, questions) plus three
 * databases of 1,500 rows each. The mock model is a small policy that reads the last tool result and decides the next
 * call, so it really climbs the ladder: `board_map` → `search_board` → `read_card` (page after page) → `query_dataset`.
 *
 * Asserted:
 * - the agent finds a specific fact buried on page 2 of a long document, and a row of a database, by map → search → read;
 * - every request the mock model receives stays under the stated budgets (a fixed, cached prefix: the persona and
 *   the tool definitions; and a bounded rest), and no tool result is over its cap;
 * - `chat.send` injects only the cards the user put in context (selected or mentioned), never the board, and never
 *   more than the context budget;
 * - the prompt prefix (system prompt and tool list) is byte-identical across turns while the board and the context
 *   change (board context goes at the END of the messages, never into the system text: prompt-cache friendly);
 * - `query_board` pages through all 300 cards under its budget; `board_map` digests are incremental.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseDataOf, newCardView, type CanvasMeta } from '@orb/shared';
import {
  startMockedSidecar,
  type MockRequest,
  type MockTurn,
  type MockedSidecar,
} from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';

/**
 * The stated budgets, in characters (about 4 per token):
 * - the prompt PREFIX (the persona and the tool definitions) is fixed and cached, whatever the board holds: at most
 *   64,000 (about 16k tokens);
 * - what a request carries BEYOND the prefix (the user's message, its context and the tool results of one turn) is
 *   at most 48,000 (about 12k tokens) at the deepest point of the map → search → read ladder, on a 300-card board.
 */
const PREFIX_BUDGET_CHARS = 64_000;
const VARIABLE_BUDGET_CHARS = 48_000;
/** A tool result: at most this many characters (about 4k tokens; a `read_card` page is at most 8k). */
const RESULT_BUDGET_CHARS = 16_000;
const READ_PAGE_CHARS = 8_000;
/** What `chat.send` may inject: the context budget of orb-canvas (about 4k tokens). */
const CONTEXT_BUDGET_CHARS = 16_000;

const FACT = 'Zorbax-9 sintering yield reached 41.7 percent';
const DB_FACT = { company: 'Quillon Labs', stage: 'Series C', arr: 88.4 };

let sc: MockedSidecar;
let wire: Wire;
let canvas: CanvasMeta;
const frameIds: string[] = [];
const cardIds: string[] = [];
let needleCard = '';
const databaseCards: { id: string; datasetId: string }[] = [];

// ---- The scripted agent: the mock model's policy ----

type Step = { tool: string; args: Record<string, unknown> };

const toolCalls: { name: string; args: Record<string, unknown>; result: string }[] = [];
let policy: ((req: MockRequest) => MockTurn) | undefined;

const textOf = (message: any): string =>
  typeof message?.content === 'string'
    ? message.content
    : Array.isArray(message?.content)
      ? message.content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n')
      : '';

/** The tool call the last assistant message made, and the result that came back (the end of the conversation). */
function lastExchange(req: MockRequest): { name: string; args: any; result: string } | undefined {
  const messages = req.body.messages as any[];
  const last = messages.at(-1);
  if (last?.role !== 'tool') return undefined;
  const asked = [...messages].reverse().find((m) => m.role === 'assistant' && m.tool_calls?.length);
  const call = asked?.tool_calls?.find((c: any) => c.id === last.tool_call_id) ?? asked?.tool_calls?.[0];
  return {
    name: call?.function?.name,
    args: JSON.parse(call?.function?.arguments || '{}'),
    result: textOf(last),
  };
}

let nextCall = 0;
const call = ({ tool, args }: Step): MockTurn => ({
  toolCalls: [{ id: `call_scale_${++nextCall}`, name: tool, arguments: args }],
});

/** map → search → read (all pages until the fact shows) → answer. */
function ladder(question: { words: string; fact: string }): (req: MockRequest) => MockTurn {
  return (req) => {
    const ex = lastExchange(req);
    if (!ex) return call({ tool: 'board_map', args: {} });
    toolCalls.push({ name: ex.name, args: ex.args, result: ex.result });
    if (ex.name === 'board_map') return call({ tool: 'search_board', args: { q: question.words } });
    if (ex.name === 'search_board') {
      const hits = (JSON.parse(ex.result) as { hits: { id: string }[] }).hits;
      return hits[0] ? call({ tool: 'read_card', args: { cardId: hits[0].id } }) : { text: 'Nothing found.' };
    }
    if (ex.name === 'read_card') {
      const page = JSON.parse(ex.result) as { cardId: string; page: number; more?: boolean; text: string };
      if (page.text.includes(question.fact)) return { text: `Found it: ${question.fact}.` };
      if (page.more) return call({ tool: 'read_card', args: { cardId: page.cardId, page: page.page + 1 } });
    }
    return { text: 'I could not find it.' };
  };
}

beforeAll(async () => {
  sc = await startMockedSidecar({ llm: { defaultTurn: (req) => (policy ? policy(req) : { text: 'ok' }) } });
  wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
  canvas = await wire.orb.canvas.create({ prompt: 'A big board' });

  const topics = [
    'battery',
    'solar',
    'wind',
    'grid',
    'hydrogen',
    'nuclear',
    'storage',
    'carbon',
    'policy',
    'finance',
  ];
  // 20 frames
  for (let i = 0; i < 20; i++) {
    const res = await wire.orb.board.command(canvas.id, {
      type: 'frame.added',
      frame: {
        title: `Theme ${String(i + 1).padStart(2, '0')} ${topics[i % 10]}`,
        color: 'sky',
        x: (i % 5) * 700,
        y: Math.floor(i / 5) * 1500,
        w: 660,
        h: 1400,
      },
    });
    frameIds.push((res.events[0]!.data as { frame: { id: string } }).frame.id);
  }
  // 300 cards in batches (a batch is at most 100 commands): types cycle; long bodies on every 7th card.
  const longBody = (i: number) =>
    Array.from(
      { length: 14 },
      (_, p) =>
        `Section ${p + 1} of note ${i} on ${topics[i % 10]}. ${'Background text about the market and the plan. '.repeat(24)}`,
    ).join('\n\n');
  const make = (i: number) => {
    const topic = topics[i % 10];
    const base = {
      frameId: frameIds[i % 20]!,
      x: 40 + (i % 3) * 200,
      y: 80 + Math.floor(i / 20) * 80,
      w: 340,
      h: 230,
    };
    switch (i % 6) {
      case 0:
        return {
          ...base,
          type: 'doc',
          data: { title: `Brief ${i} on ${topic}`, body: i === 143 ? needleBody() : longBody(i) },
        };
      case 1:
        return {
          ...base,
          type: 'source',
          data: {
            url: `https://example.org/${topic}/${i}`,
            title: `Report ${i}: ${topic} outlook`,
            summary: `What report ${i} says about ${topic}. ${'It is long. '.repeat(30)}`,
            excerpts: [`Excerpt of report ${i}.`],
          },
        };
      case 2:
        return {
          ...base,
          type: 'quote',
          data: {
            title: `Quote ${i}`,
            body: `A passage about ${topic} number ${i}.`,
            url: `https://example.org/${topic}/q${i}`,
          },
        };
      case 3:
        return {
          ...base,
          type: 'table',
          data: {
            title: `Table ${i} ${topic}`,
            columns: ['Item', 'Value'],
            rows: Array.from({ length: 30 }, (_, r) => [`row ${r}`, String(r * i)]),
            totalRows: 30,
          },
        };
      case 4:
        return {
          ...base,
          type: 'question',
          data: { title: `Question ${i}: does ${topic} scale?`, body: `Open question ${i}.` },
        };
      default:
        return {
          ...base,
          type: 'note',
          data: { title: `Note ${i}`, body: `My own note ${i} about ${topic}.` },
        };
    }
  };
  // The needle: one long document (card 144 is a doc: 143 % 6 === 5 is a note, so use a doc index instead).
  const needleBody = () =>
    `${Array.from({ length: 8 }, (_, p) => `Section ${p + 1}. ${'Background text about sintering furnaces and ceramics. '.repeat(24)}`).join('\n\n')}\n\n` +
    `Results. In the pilot run, ${FACT}, up from 33.0 percent in the baseline.\n\n${'Closing remarks about ceramics. '.repeat(40)}`;
  const specs = Array.from({ length: 300 }, (_, i) => make(i));
  // make card 144 (a doc, 144 % 6 === 0) the needle holder
  specs[144] = { ...specs[144]!, data: { title: 'Brief 144 on ceramics', body: needleBody() } } as any;
  for (let from = 0; from < specs.length; from += 100) {
    const res = await wire.orb.board.command(canvas.id, {
      type: 'batch',
      commands: specs.slice(from, from + 100).map((card) => ({ type: 'card.added' as const, card })) as any,
    });
    for (const e of res.events) cardIds.push((e.data as { card: { id: string } }).card.id);
  }
  needleCard = cardIds[144]!;

  // 3 databases of 1,500 rows; one row is the needle.
  for (let d = 0; d < 3; d++) {
    const rows = ['Company,Stage,ARR'];
    for (let r = 0; r < 1500; r++) rows.push(`Company ${d}-${r},Seed,${(r % 90) + 0.5}`);
    if (d === 1) rows[777] = `${DB_FACT.company},${DB_FACT.stage},${DB_FACT.arr}`;
    const meta = await wire.data.import(canvas.id, {
      name: `Deals ${d}.csv`,
      body: rows.join('\n'),
      mime: 'text/csv',
    });
    const ds = await wire.data.read(canvas.id, meta.id);
    const res = await wire.orb.board.command(canvas.id, {
      type: 'card.added',
      card: {
        type: 'database',
        frameId: frameIds[d]!,
        x: 40,
        y: 900,
        w: 560,
        h: 360,
        data: databaseDataOf(`Deals ${d}`, ds),
        view: newCardView(ds),
      },
    });
    databaseCards.push({ id: (res.events[0]!.data as { card: { id: string } }).card.id, datasetId: meta.id });
  }
}, 180_000);

afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
});

/** Wait until the model has been quiet for a moment: the last request is answered and no new one comes. */
async function quiet(): Promise<void> {
  const ac = new AbortController();
  let state = 'unknown';
  const following = (async () => {
    try {
      for await (const s of wire.orb.agents.status(canvas.id, { signal: ac.signal }))
        if (s.agent === 'orb') state = s.state;
    } catch (error) {
      if (!ac.signal.aborted) throw error;
    }
  })();
  try {
    let seen = -1;
    let since = Date.now();
    for (let i = 0; i < 600; i++) {
      const n = sc.llm.requests.length;
      if (n === 0 && state !== 'unknown' && state !== 'running') return;
      // A finished model stream can still have a tool executing. Wait for the agent, including its stop hooks.
      if (n !== seen || !sc.llm.requests.at(-1)?.completed || state === 'unknown' || state === 'running') {
        seen = n;
        since = Date.now();
      } else if (Date.now() - since > 700) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('the model never went quiet');
  } finally {
    ac.abort();
    await following;
  }
}
/** Send a message with the policy installed and wait for the whole turn to end; returns the requests it made. */
async function turn(
  text: string,
  p: (req: MockRequest) => MockTurn,
  context?: { cardIds?: string[]; frameIds?: string[] },
) {
  await quiet();
  policy = p;
  const first = sc.llm.requests.length;
  await wire.orb.chat.send(canvas.id, { text, ...(context ? { context } : {}) });
  await sc.llm.waitForRequest((r) => r.id > first);
  await quiet();
  return sc.llm.requests.slice(first);
}

const size = (req: MockRequest) => JSON.stringify(req.body).length;
const systemOf = (req: MockRequest) =>
  textOf((req.body.messages as any[]).find((m) => m.role === 'system' || m.role === 'developer'));
const toolDefs = (req: MockRequest) => JSON.stringify(req.body.tools ?? []);
const prefixOf = (req: MockRequest) => systemOf(req).length + toolDefs(req).length;
/** What a request carries beyond its fixed prefix. */
const variableOf = (req: MockRequest) => size(req) - prefixOf(req);

describe('agents at scale: a 300-card board with databases', () => {
  it('the board is as big as it should be', async () => {
    expect(cardIds).toHaveLength(300);
    expect(databaseCards).toHaveLength(3);
    const ds = await wire.data.read(canvas.id, databaseCards[1]!.datasetId);
    expect(ds.rows.length).toBe(1500);
  });

  it('finds a fact on page 2 of a long document by map → search → read, within the request budget', async () => {
    toolCalls.length = 0;
    // The same first message on an empty canvas and on the 300-card board: the request is the same size, because
    // nothing of the board is injected (the agent has to ask for what it needs).
    const tiny = await wire.orb.canvas.create({ prompt: 'A tiny board' });
    const firstTiny = sc.llm.requests.length;
    policy = () => ({ text: 'ok' });
    await wire.orb.chat.send(tiny.id, { text: 'What sintering yield did Zorbax-9 reach?' });
    const tinyReq = await sc.llm.waitForRequest((r) => r.id > firstTiny);
    await quiet();
    const mine = await turn(
      'What sintering yield did Zorbax-9 reach?',
      ladder({ words: 'Zorbax sintering yield', fact: FACT }),
    );
    expect(Math.abs(size(mine[0]!) - size(tinyReq))).toBeLessThan(500);
    const names = toolCalls.map((c) => c.name);
    expect(names.slice(0, 3)).toEqual(['board_map', 'search_board', 'read_card']);
    // the fact is past the first 8k page: read_card page 2 shows it
    expect(names).toEqual(['board_map', 'search_board', 'read_card', 'read_card']);
    expect(toolCalls.at(-1)!.args).toMatchObject({ cardId: needleCard, page: 2 });
    expect(toolCalls.at(-1)!.result).toContain(FACT);
    const hit = JSON.parse(toolCalls[1]!.result) as { hits: { id: string; snippet: string }[] };
    expect(hit.hits[0]!.id).toBe(needleCard);
    // the final answer reached the model's conversation
    expect(JSON.stringify(mine.at(-1)!.body.messages)).toContain(FACT);

    // every request of the turn is under the budget, and no result is over its cap
    const chat = mine.filter((r) => r.path.endsWith('/chat/completions'));
    expect(chat.length).toBe(5);
    for (const r of chat) {
      expect(prefixOf(r), `prefix of request ${r.id}`).toBeLessThanOrEqual(PREFIX_BUDGET_CHARS);
      expect(variableOf(r), `request ${r.id} beyond its prefix`).toBeLessThanOrEqual(VARIABLE_BUDGET_CHARS);
    }
    // the prefix is the same in every request of the turn
    expect(new Set(chat.map(prefixOf)).size).toBe(1);
    for (const c of toolCalls)
      expect(c.result.length, c.name).toBeLessThanOrEqual(
        c.name === 'read_card' ? READ_PAGE_CHARS + 600 : RESULT_BUDGET_CHARS + 400,
      );
    // the map is one screen: 20 frames with digests
    const map = JSON.parse(toolCalls[0]!.result) as {
      board: { cards: number; frames: number };
      frames: unknown[];
    };
    expect(map.board).toMatchObject({ cards: 303, frames: 20 });
    expect(map.frames).toHaveLength(20);
  });

  it('finds a row of a database: search_board sees the rows, query_dataset answers with a filter', async () => {
    toolCalls.length = 0;
    await turn('Which stage is Quillon Labs at?', (req) => {
      const ex = lastExchange(req);
      if (!ex) return call({ tool: 'search_board', args: { q: 'Quillon Labs' } });
      toolCalls.push({ name: ex.name, args: ex.args, result: ex.result });
      if (ex.name === 'search_board') {
        const hits = (JSON.parse(ex.result) as { hits: { id: string; type: string }[] }).hits;
        const db = hits.find((h) => h.type === 'database');
        return db
          ? call({
              tool: 'query_dataset',
              args: { cardId: db.id, filter: [{ column: 'Company', op: 'eq', value: DB_FACT.company }] },
            })
          : { text: 'no database hit' };
      }
      return { text: `Quillon Labs is at ${DB_FACT.stage}.` };
    });
    expect(toolCalls.map((c) => c.name)).toEqual(['search_board', 'query_dataset']);
    const search = JSON.parse(toolCalls[0]!.result) as { hits: { id: string; type: string }[] };
    expect(search.hits.find((h) => h.type === 'database')!.id).toBe(databaseCards[1]!.id);
    const rows = JSON.parse(toolCalls[1]!.result) as { rows: unknown[][]; matched: number };
    expect(rows.matched).toBe(1);
    expect(rows.rows[0]).toEqual([DB_FACT.company, DB_FACT.stage, DB_FACT.arr]);
    expect(toolCalls[1]!.result.length).toBeLessThan(RESULT_BUDGET_CHARS);
  });

  it('chat.send injects only the cards in context, within the context budget', async () => {
    const [req] = await turn('Summarise these.', () => ({ text: 'ok' }), {
      cardIds: cardIds.slice(0, 50),
      frameIds: frameIds.slice(0, 3),
    });
    const user = textOf((req!.body.messages as any[]).findLast((m) => m.role === 'user'));
    const context = user.slice(user.indexOf('<board-context>'));
    expect(context.length).toBeLessThanOrEqual(CONTEXT_BUDGET_CHARS + 200);
    // the cards in context are there, a card nobody selected is not
    expect(context).toContain(`[${cardIds[0]}]`);
    expect(context).not.toContain(`[${cardIds[299]}]`);
    expect(context).not.toContain('Theme 20');
    // the whole user message (text + context) is what the context budget allows
    expect(user.length).toBeLessThanOrEqual(CONTEXT_BUDGET_CHARS + 300);
    // without context nothing of the board is injected
    const [plain] = await turn('Hello again.', () => ({ text: 'ok' }));
    expect(textOf((plain!.body.messages as any[]).findLast((m) => m.role === 'user'))).not.toContain(
      '<board-context>',
    );
  });

  it('keeps the prompt prefix (system text and tool list) byte-identical while the board and the context change', async () => {
    const sent: MockRequest[] = [];
    const contexts = [
      undefined,
      { cardIds: cardIds.slice(0, 5) },
      { frameIds: [frameIds[2]!] },
      { cardIds: cardIds.slice(100, 140) },
    ];
    for (const [i, context] of contexts.entries()) {
      // the board changes between the turns
      await wire.orb.board.command(canvas.id, {
        type: 'card.added',
        card: {
          type: 'note',
          frameId: frameIds[i]!,
          x: 10,
          y: 10,
          w: 200,
          h: 120,
          data: { title: `Prefix probe ${i}`, body: 'x' },
        },
      });
      const [req] = await turn(`Turn ${i}`, () => ({ text: 'ok' }), context);
      sent.push(req!);
    }
    const prefixes = new Set(sent.map((r) => `${systemOf(r)}\n---\n${toolDefs(r)}`));
    expect(prefixes.size).toBe(1);
    // board context lives at the END of the messages: never in the system text
    for (const r of sent) {
      expect(systemOf(r)).not.toContain(cardIds[0]!);
      expect(systemOf(r)).not.toContain('Prefix probe');
      expect(systemOf(r)).not.toContain('Theme 03');
      const userText = textOf((r.body.messages as any[]).findLast((m) => m.role === 'user'));
      expect(userText.startsWith('Turn ')).toBe(true);
    }
    expect(prefixOf(sent[0]!)).toBeLessThanOrEqual(PREFIX_BUDGET_CHARS);
    // Long prompt-cache retention reaches the provider (the route profile's `cacheRetention: long` → pi-ai's
    // `prompt_cache_retention`), with one cache key for the whole session, so every turn lands on the same entry.
    for (const r of sent) expect(r.body.prompt_cache_retention, `request ${r.id}`).toBe('24h');
    expect(new Set(sent.map((r) => r.body.prompt_cache_key)).size).toBe(1);
    expect(sent[0]!.body.prompt_cache_key).toEqual(expect.any(String));
  });

  it('query_board pages through every card under its budget; board_map zooms into a frame', async () => {
    const tool = async (name: string, args: Record<string, unknown>) => {
      const mine = await turn(`run ${name}`, (req) =>
        lastExchange(req) ? { text: 'done' } : call({ tool: name, args }),
      );
      return textOf(
        (mine.find((r) => (r.body.messages as any[]).at(-1)?.role === 'tool')!.body.messages as any[]).at(-1),
      );
    };
    const seen = new Set<string>();
    let offset = 0;
    for (let page = 0; page < 40; page++) {
      const out = JSON.parse(await tool('query_board', { limit: 50, offset })) as {
        cards: { id: string }[];
        more?: number;
        nextOffset?: number;
      };
      expect(JSON.stringify(out).length).toBeLessThanOrEqual(RESULT_BUDGET_CHARS + 400);
      for (const c of out.cards) seen.add(c.id);
      if (!out.more) break;
      offset = out.nextOffset!;
    }
    // 300 cards + the 3 databases + the probe notes of the previous test
    expect(seen.size).toBeGreaterThanOrEqual(303);

    const zoom = JSON.parse(await tool('board_map', { frameId: frameIds[0] })) as {
      frame: { cards: number; digest: string };
      cards: { id: string; title: string }[];
    };
    expect(zoom.frame.cards).toBeGreaterThan(10);
    expect(zoom.cards.length).toBeLessThanOrEqual(60);
    expect(zoom.frame.digest.length).toBeGreaterThan(10);
  });
});
