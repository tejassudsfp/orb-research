/**
 * Unit tests of the board tools' bodies (`placeCard`, `updateCard`, `queryBoard`) against a real CanvasStore
 * (BUILD_PLAN P3.1). The dsh wiring (preset-scoped registration, exec context from a live agent) is covered by
 * apps/ui/test/agent.contract.test.ts and apps/ui/test/cards.contract.test.ts.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentName, CardType, PLACEABLE_TYPES, cardDataSchema, type Card } from '@orb/shared';
import { CanvasStore } from '../src/store.js';
import {
  PLACE_CARD_DELAY_ENV,
  QUERY_BOARD_LIMIT,
  abortableDelay,
  actorOf,
  delayFrom,
  placeCard as placeCardTool,
  queryBoard,
  roleIn,
  updateCard,
  type BoardToolExec,
} from '../src/tools.js';

/** `place_card` that must place (these tests never fill a frame; budget.test.ts covers FRAME_FULL). */
async function placeCard(...a: Parameters<typeof placeCardTool>): Promise<{ cardId: string }> {
  const res = await placeCardTool(...a);
  if ('error' in res) throw new Error(`unexpected ${res.error}`);
  return res;
}

let home: string;
let store: CanvasStore;
let canvasId: string;

const SESSIONS: Record<AgentName, string> = {
  orb: 'orb-session-1',
  scout: 'scout-session-1',
  critic: 'critic-session-1',
  builder: 'builder-session-1',
};

const execFor = (
  cwd: string,
  extra: Partial<BoardToolExec> = {},
  sessionId = SESSIONS.orb,
): BoardToolExec => ({
  callId: 'call_1',
  signal: new AbortController().signal,
  agent: {
    id: sessionId,
    options: { provider: 'openai', model: 'gpt-6-luna' },
    session: { header: { cwd } },
  },
  ...extra,
});
const as = (role: AgentName, extra: Partial<BoardToolExec> = {}) =>
  execFor(store.dirOf(canvasId), extra, SESSIONS[role]);
const now = { delayMs: 0 };

const args = { type: 'doc', title: 'About X', body: 'X is a thing.', why: 'Asked for X.' };

it('reuses a source URL across roles and tracking fragments without changing its owner or creating duplicates', async () => {
  const first = await placeCard(store, { type: 'source', title: 'Evidence', url: 'https://example.org/evidence', body: 'Original evidence.', why: 'Primary authority.' }, as('orb'), now);
  const before = (await store.board(canvasId)).current;
  const again = await placeCard(store, { type: 'source', title: 'Evidence again', url: 'https://example.org/evidence?utm_source=search#results', body: 'Refined summary.', why: 'Same source.' }, as('scout'), now);
  expect(again).toMatchObject({ cardId: (first as any).cardId, warning: expect.stringContaining('Reuse its ID') });
  expect((await store.board(canvasId)).current).toBe(before);
  expect(Object.values(before.cards)).toHaveLength(1);
  expect(Object.values(before.cards)[0]!.provenance).toMatchObject({ agent: 'orb' });
});

it('does not append a research write for an identical card update, but keeps a real detail change', async () => {
  const made = await placeCard(store, args, as('orb'), now) as { cardId: string };
  const before = (await store.board(canvasId)).seq;
  expect(await updateCard(store, { cardId: made.cardId, body: args.body, why: args.why }, as('orb'))).toMatchObject({ updated: false });
  expect((await store.board(canvasId)).seq).toBe(before);
  expect(await updateCard(store, { cardId: made.cardId, detail: 'The evidence changes the recommendation.' }, as('orb'))).toMatchObject({ updated: true });
  expect((await store.board(canvasId)).seq).toBe(before + 1);
});

it('simultaneous source placements resolve to one card without changing the first writer’s ownership', async () => {
  const source = { type: 'source', title: 'Shared primary source', url: 'https://example.org/concurrent', body: 'A primary finding.', why: 'Evidence.' };
  const results = await Promise.all(['orb', 'scout'].map(role => placeCard(store, source, as(role as AgentName), now)));
  expect(new Set(results.map(r => (r as any).cardId)).size).toBe(1);
  expect((await store.board(canvasId)).cards()).toHaveLength(1);
  expect(results.filter(r => 'reused' in r && r.reused)).toHaveLength(1);
});

/** Valid agent fields for every type an agent may place. */
const SAMPLE: Record<Exclude<CardType, 'note'>, Record<string, unknown>> = {
  source: { title: 'Paper', url: 'https://example.org/p', body: 'It finds Y.', excerpts: ['Y holds.'] },
  quote: { title: 'Example Org', body: 'Y holds in every case we tried.', url: 'https://example.org/p' },
  image: { title: 'Chart of Y', asset: 'assets/chart.png', width: 640, height: 480 },
  file: { title: 'Report', asset: 'assets/report.pdf', pages: 12 },
  question: { title: 'Does Y hold at scale?', body: 'Only small samples so far.' },
  risk: { title: 'Y may not replicate', body: 'One lab.', kind: 'claim' },
  design: { title: 'Landing', html: '<h1>Orb</h1><p>Research canvas</p>', body: 'The hero.' },
  diagram: { title: 'Flow', mermaid: 'flowchart TD\n  A[Ask] --> B[Search]\n  B --> C{Enough?}' },
  table: { title: 'Prices', columns: ['Plan', 'Price'], rows: [['Pro', '$20']] },
  doc: { title: 'Summary', body: 'A draft section.' },
  database: { title: 'Pipeline', columns: ['Company', 'Stage'], rows: [['Acme', 'Seed']] },
  chart: { title: 'Revenue', mark: 'bar', x: 'Year', y: 'Revenue', columns: ['Year', 'Revenue'], rows: [['2024', '10'], ['2025', '14']] },
  metric: { title: 'ARR', value: '$4.2M', change: '+12%', direction: 'up', good: true, period: 'FY2025', sourceUrl: 'https://example.org/p' },
  timeline: { title: 'History', events: [{ date: '2024-03', label: 'Founded', sourceUrl: 'https://example.org/p' }] },
  matrix: {
    title: 'Options',
    criteria: [{ name: 'Cost', weight: 3 }, { name: 'Speed', weight: 1 }],
    options: [{ name: 'A', scores: [8, 5] }, { name: 'B', scores: [4, 9] }],
  },
  // An insight cites cards on the board: the loops below fill `citations` from the board.
  insight: { title: 'Y holds at small scale', body: 'Two sources agree.', citations: [] },
  hypothesis: { title: 'Y scales', body: 'Early signs.', confidence: 60 },
  decision: {
    title: 'Pick a plan',
    options: [{ label: 'Pro' }, { label: 'Team' }],
    choice: 'Pro',
    decisionStatus: 'decided',
    rationale: 'Cheaper.',
  },
  framework: {
    title: 'Plan fit',
    variant: 'proscons',
    entries: [
      { cell: 'pros', text: 'Cheap' },
      { cell: 'cons', text: 'Limits' },
    ],
  },
  entity: { title: 'Ada Lovelace', entityKind: 'person', role: 'Analyst', facts: [{ label: 'Born', value: '1815' }] },
  product: { title: 'Notebook Pro', entityKind: 'competitor', pricing: '$20', strengths: ['Search'] },
  video: { title: 'Launch talk', url: 'https://www.youtube.com/watch?v=x', thumbnail: 'assets/chart.png' },
  code: { title: 'Total', language: 'python', code: 'print(1)' },
  math: { title: 'Growth', latex: 'g = \\frac{a}{b}' },
  checklist: { title: 'To verify', items: ['Check the source', 'Call a customer'] },
  // P6.7: written by the Parallel service, never placed by an agent (no role may place them).
  research: { title: 'Run' },
  watch: { title: 'Watch' },
};

/** The sample fields of `type`; an insight cites the first two cards on the board. */
async function sampleOf(type: Exclude<CardType, 'note'>): Promise<Record<string, unknown>> {
  if (type !== 'insight') return SAMPLE[type];
  const cited = (await store.board(canvasId)).cards().slice(0, 2).map((c) => c.id);
  return { ...SAMPLE.insight, citations: cited };
}

async function readLog(id = canvasId) {
  await store.flush();
  return readFileSync(join(store.dirOf(id), 'board.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const cardOf = async (id: string): Promise<Card> => (await store.board(canvasId)).card(id)!;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-tools-'));
  store = new CanvasStore({ home, flushMs: 5 });
  canvasId = (await store.create({ prompt: 'Tools' })).id;
  await store.setRootSession(canvasId, SESSIONS.orb);
  await store.setChildAgent(canvasId, 'scout', SESSIONS.scout);
  await store.setChildAgent(canvasId, 'critic', SESSIONS.critic);
  await store.setChildAgent(canvasId, 'builder', SESSIONS.builder);
  const assets = join(store.dirOf(canvasId), 'assets');
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, 'chart.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  writeFileSync(join(assets, 'report.pdf'), '%PDF-1.4\n');
});

afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

describe('caller role from the agent identity', () => {
  it('roleIn maps the root session to orb and child sessions to their role', async () => {
    const meta = await store.open(canvasId);
    expect(roleIn(meta, SESSIONS.orb)).toBe('orb');
    expect(roleIn(meta, SESSIONS.scout)).toBe('scout');
    expect(roleIn(meta, SESSIONS.critic)).toBe('critic');
    expect(roleIn(meta, SESSIONS.builder)).toBe('builder');
    expect(roleIn(meta, 'someone-else')).toBeUndefined();
    // A forged "orb" child entry never grants the orb role.
    expect(roleIn({ ...meta, childAgentIds: { orb: 'x' } }, 'x')).toBeUndefined();
    expect(roleIn({ ...meta, rootSessionId: null }, SESSIONS.orb)).toBeUndefined();
  });

  it('stamps the resolved role in the provenance; a session that is not a canvas agent is refused', async () => {
    const { cardId } = await placeCard(
      store,
      { type: 'quote', ...SAMPLE.quote, why: 'Key line.' },
      as('scout'),
      now,
    );
    expect((await cardOf(cardId)).provenance).toMatchObject({
      kind: 'agent',
      agent: 'scout',
      sessionId: SESSIONS.scout,
    });
    await expect(placeCard(store, args, execFor(store.dirOf(canvasId), {}, 'stranger'), now)).rejects.toThrow(
      /not one of the canvas agents/,
    );
    await expect(queryBoard(store, {}, execFor(store.dirOf(canvasId), {}, 'stranger'))).rejects.toThrow(
      /not one of the canvas agents/,
    );
    // A role argument from the model is ignored: the identity decides.
    await expect(placeCard(store, { ...args, agent: 'orb', role: 'orb' }, as('critic'), now)).rejects.toThrow(
      /critic may not place doc/,
    );
  });
});

describe('place_card', () => {
  it('appends card.added with agent provenance from the exec context, laid out on a grid', async () => {
    const exec = as('orb');
    const { cardId } = await placeCard(store, args, exec, now);
    const second = await placeCard(
      store,
      { type: 'source', ...SAMPLE.source, why: 'Y' },
      { ...exec, callId: 'call_2' },
      now,
    );
    expect(cardId).toMatch(/^c_[0-9A-Z]{26}$/);
    const events = await readLog();
    const actor = {
      kind: 'agent',
      agent: 'orb',
      model: 'gpt-6-luna',
      provider: 'openai',
      sessionId: SESSIONS.orb,
      toolCallId: 'call_1',
    };
    expect(events[0]).toMatchObject({ seq: 0, type: 'card.added', actor });
    expect(events[0].data.card).toEqual({
      id: cardId,
      type: 'doc',
      frameId: null,
      // The layout engine (P3.2): a doc spans 3 grid columns, from the open board's origin.
      x: 80,
      y: 80,
      w: 3 * 132 + 2 * 16,
      // P6.20: a short body is a short card (an estimate; the renderer's measurement refines it).
      h: 176,
      data: { title: 'About X', body: 'X is a thing.' },
      why: 'Asked for X.',
      provenance: { ...actor, at: expect.any(Number) },
    });
    expect(events[1].data.card).toMatchObject({
      id: second.cardId,
      type: 'source',
      x: 80 + 3 * (132 + 16),
      y: 80,
      w: 2 * 132 + 16,
      data: { title: 'Paper', url: 'https://example.org/p', summary: 'It finds Y.', excerpts: ['Y holds.'] },
    });
    expect(events[1].actor.toolCallId).toBe('call_2');
  });

  it('enforces the §2.4 card-type permissions for every role and type', async () => {
    for (const role of AgentName.options) {
      for (const type of CardType.options) {
        const call = placeCard(
          store,
          { type, ...(type === 'note' ? { title: 'n', body: 'b' } : await sampleOf(type)),
            // This case tests a new card's permission/provenance; source reuse is exercised separately.
            ...(type === 'source' ? { url: `https://example.org/${role}/paper` } : {}),
            why: `${role} ${type}` },
          as(role),
          now,
        );
        if (PLACEABLE_TYPES[role].includes(type)) {
          const { cardId } = await call;
          const card = await cardOf(cardId);
          expect(card.type).toBe(type);
          expect(card.provenance).toMatchObject({ agent: role });
          // What landed on the board is valid data for its type.
          expect(cardDataSchema(type).safeParse(card.data).success).toBe(true);
        } else {
          await expect(call, `${role} placing ${type}`).rejects.toThrow(
            type === 'note' ? /may not place note|type/ : new RegExp(`${role} may not place ${type}`),
          );
        }
      }
    }
    // Nothing forbidden was written: exactly the allowed pairs are on the board.
    const allowed = AgentName.options.reduce((n, r) => n + PLACEABLE_TYPES[r].length, 0);
    expect((await store.board(canvasId)).cards()).toHaveLength(allowed);
  });

  it("validates the payload against the type's fields and schema", async () => {
    const orb = as('orb');
    const place = (extra: Record<string, unknown>) => placeCard(store, { why: 'w', ...extra }, orb, now);
    await expect(place({ ...args, why: 'x'.repeat(141) })).rejects.toThrow(/why/);
    await expect(place({ ...args, title: '' })).rejects.toThrow(/title/);
    await expect(place({ ...args, type: 'nope' })).rejects.toThrow(/type/);
    await expect(place({ type: 'source', ...SAMPLE.source, url: 'ftp://x.org' })).rejects.toThrow(/url/);
    await expect(place({ type: 'source', title: 'No link', body: 'b' })).rejects.toThrow(/url/);
    await expect(place({ type: 'quote', ...SAMPLE.quote, body: 'word '.repeat(50) })).rejects.toThrow(
      /under 50 words/,
    );
    await expect(place({ type: 'doc', ...SAMPLE.doc, html: '<p>x</p>' })).rejects.toThrow(
      /html does not apply to doc cards/,
    );
    await expect(place({ type: 'table', ...SAMPLE.table, rows: [['only one cell']] })).rejects.toThrow(
      /one cell per column/,
    );
    await expect(place({ type: 'image', ...SAMPLE.image, asset: 'assets/missing.png' })).rejects.toThrow(
      /no asset/,
    );
    await expect(place({ type: 'image', ...SAMPLE.image, asset: 'assets/report.pdf' })).rejects.toThrow(
      /not an image/,
    );
    await expect(place({ type: 'image', ...SAMPLE.image, asset: '../../etc/passwd' })).rejects.toThrow(
      /asset/,
    );
    await expect(place({ type: 'design', title: 'Empty' })).rejects.toThrow(/html/);
    await expect(place({ type: 'diagram', title: 'No source', mermaid: '   ' })).rejects.toThrow(/mermaid/);
    await expect(place({ ...args, frameId: 'f_1' })).rejects.toThrow(/no frame/);
    expect((await store.board(canvasId)).cards()).toEqual([]);
  });

  it('builds typed data: asset references, defaults, totals and the design timestamp', async () => {
    const orb = as('orb');
    const ids: Record<string, string> = {};
    for (const type of ['image', 'file', 'question', 'risk', 'design', 'table'] as const) {
      ids[type] = (await placeCard(store, { type, ...SAMPLE[type], why: type }, orb, now)).cardId;
    }
    expect((await cardOf(ids.image!)).data).toEqual({
      title: 'Chart of Y',
      width: 640,
      height: 480,
      asset: { path: 'assets/chart.png', name: 'chart.png', mime: 'image/png', size: 8 },
    });
    expect((await cardOf(ids.file!)).data).toMatchObject({ pages: 12, asset: { mime: 'application/pdf' } });
    expect((await cardOf(ids.question!)).data).toMatchObject({ state: 'open' });
    expect((await cardOf(ids.risk!)).data).toMatchObject({ kind: 'claim' });
    expect((await cardOf(ids.design!)).data).toMatchObject({ updatedAt: expect.any(Number) });
    expect((await cardOf(ids.table!)).data).toMatchObject({ totalRows: 1 });
    // Empty and null values the model sends for fields it did not mean are ignored.
    const { cardId } = await placeCard(store, { ...args, html: '', url: null, badge: 'must' }, orb, now);
    expect(await cardOf(cardId)).toMatchObject({
      badge: 'must',
      data: { title: 'About X', body: 'X is a thing.' },
    });
  });

  it("places a card named to a frame inside that frame's grid", async () => {
    const [ev] = await store.commandEvents(canvasId, {
      type: 'frame.added',
      frame: { title: 'Market', color: 'sky', x: 1000, y: 500, w: 640, h: 480 },
    });
    const frameId = (ev!.data as { frame: { id: string } }).frame.id;
    const placed: Card[] = [];
    for (let i = 0; i < 3; i++) {
      const { cardId } = await placeCard(store, { ...args, title: `T${i}`, frameId }, as('orb'), now);
      placed.push(await cardOf(cardId));
    }
    // A 640-wide frame has 4 grid columns; a doc spans 3, so the second doc starts a row (176 px, its estimate); the
    // third does not fit below, so the frame grows SIDEWAYS first (P6.20: 6 columns) and it takes the top of the new
    // columns.
    expect(placed.map((c) => [c.frameId, c.x, c.y])).toEqual([
      [frameId, 1024, 556],
      [frameId, 1024, 556 + 192],
      [frameId, 1024 + 3 * 148, 556],
    ]);
    const frame = (await store.board(canvasId)).current.frames[frameId]!;
    expect(frame).toMatchObject({ x: 1000, y: 500, w: 6 * 132 + 5 * 16 + 48, h: 480 });
  });

  it('refuses a caller that is not an agent on a canvas', async () => {
    await expect(placeCard(store, args, { ...execFor('/tmp'), agent: undefined }, now)).rejects.toThrow(
      /agent/,
    );
    await expect(placeCard(store, args, execFor('/tmp/elsewhere'), now)).rejects.toThrow(/not attached/);
    await expect(placeCard(store, args, execFor(join(store.canvasesDir, 'nope')), now)).rejects.toThrow();
  });

  it('honours exec.signal: an abort during the artificial delay writes nothing', async () => {
    const ac = new AbortController();
    const started = Date.now();
    const pending = placeCard(store, args, as('orb', { signal: ac.signal }), { delayMs: 5_000 });
    setTimeout(() => ac.abort(new Error('user stop')), 50);
    await expect(pending).rejects.toThrow('user stop');
    expect(Date.now() - started).toBeLessThan(1_000);
    expect((await store.board(canvasId)).cards()).toEqual([]);
  });

  it('an already aborted signal fails before writing', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(placeCard(store, args, as('orb', { signal: ac.signal }), now)).rejects.toThrow();
    expect((await store.board(canvasId)).cards()).toEqual([]);
  });

  it('reads the delay from config, else from the test env var', () => {
    expect(delayFrom({ placeCardDelayMs: 10 }, { [PLACE_CARD_DELAY_ENV]: '99' })).toBe(10);
    expect(delayFrom({}, { [PLACE_CARD_DELAY_ENV]: '99' })).toBe(99);
    expect(delayFrom({}, { [PLACE_CARD_DELAY_ENV]: 'nope' })).toBe(0);
    expect(delayFrom({}, {})).toBe(0);
  });

  it('abortableDelay resolves after the delay', async () => {
    const t = Date.now();
    await abortableDelay(30, new AbortController().signal);
    expect(Date.now() - t).toBeGreaterThanOrEqual(25);
  });

  it('actorOf prefers the logged request route over the creation-time agent options', () => {
    const exec = execFor('/x');
    exec.agent!.session!.requestHeader = () => ({ config: { provider: 'llm-mock', model: 'gpt-x' } });
    expect(actorOf(exec, 'orb')).toMatchObject({
      provider: 'llm-mock',
      model: 'gpt-x',
      sessionId: SESSIONS.orb,
    });
    exec.agent!.session!.requestHeader = () => undefined;
    expect(actorOf(exec, 'orb')).toMatchObject({ provider: 'openai', model: 'gpt-6-luna' });
  });

  it('actorOf takes identity only from exec, defaulting an unknown model', () => {
    expect(actorOf({ callId: 'c', signal: new AbortController().signal, agent: { id: 's' } }, 'orb')).toEqual(
      {
        kind: 'agent',
        agent: 'orb',
        model: 'unknown',
        sessionId: 's',
        toolCallId: 'c',
      },
    );
  });
});

describe('update_card', () => {
  it('merges the given fields into the card data, re-validates it, and records agent provenance', async () => {
    const { cardId } = await placeCard(
      store,
      { type: 'question', ...SAMPLE.question, why: 'Gap.' },
      as('critic'),
      now,
    );
    const res = await updateCard(
      store,
      {
        cardId,
        state: 'answered',
        answer: 'Yes, at n=10k.',
        why: 'Answered by the 2026 study.',
        badge: 'skim',
      },
      as('orb', { callId: 'call_upd' }),
    );
    expect(res).toEqual({ cardId, updated: true });
    const card = await cardOf(cardId);
    expect(card).toMatchObject({
      why: 'Answered by the 2026 study.',
      badge: 'skim',
      data: {
        title: 'Does Y hold at scale?',
        body: 'Only small samples so far.',
        state: 'answered',
        answer: 'Yes, at n=10k.',
      },
    });
    const last = (await readLog()).at(-1);
    expect(last).toMatchObject({ type: 'card.updated', actor: { agent: 'orb', toolCallId: 'call_upd' } });
    await updateCard(store, { cardId, badge: 'none' }, as('orb'));
    expect((await cardOf(cardId)).badge).toBeUndefined();
    // Agent edits are never on the user's undo stack.
    expect((await store.board(canvasId)).history).toEqual({ undo: 0, redo: 0 });
  });

  it("never touches the user's notes, checks the role and the type's fields", async () => {
    const [ev] = await store.commandEvents(canvasId, {
      type: 'card.added',
      card: { type: 'note', x: 0, y: 0, w: 200, h: 120, data: { title: 'Mine', body: 'my text' } },
    });
    const noteId = (ev!.data as { card: Card }).card.id;
    await expect(updateCard(store, { cardId: noteId, body: 'hacked' }, as('orb'))).rejects.toThrow(
      /cannot change the user's note/,
    );
    await expect(updateCard(store, { cardId: noteId, why: 'mine now' }, as('orb'))).rejects.toThrow(/note/);
    expect((await cardOf(noteId)).data).toEqual({ title: 'Mine', body: 'my text' });

    const { cardId } = await placeCard(
      store,
      { type: 'source', ...SAMPLE.source, why: 'Read.' },
      as('scout'),
      now,
    );
    // update_card is on Orb's allow-list only (§2.4); the tool refuses other roles itself too.
    await expect(updateCard(store, { cardId, body: 'x' }, as('critic'))).rejects.toThrow(
      /update_card is not available to the critic agent/,
    );
    await expect(updateCard(store, { cardId, url: 'javascript:alert(1)' }, as('orb'))).rejects.toThrow(/url/);
    await expect(updateCard(store, { cardId, mermaid: 'graph' }, as('orb'))).rejects.toThrow(
      /does not apply/,
    );
    await expect(updateCard(store, { cardId }, as('orb'))).rejects.toThrow(/nothing to update/);
    await expect(updateCard(store, { cardId: 'c_missing', body: 'x' }, as('orb'))).rejects.toThrow(/no card/);
    const { cardId: tableId } = await placeCard(
      store,
      { type: 'table', ...SAMPLE.table, why: 't' },
      as('builder'),
      now,
    );
    await expect(updateCard(store, { cardId: tableId, columns: ['a', 'b', 'c'] }, as('orb'))).rejects.toThrow(
      /one cell per column/,
    );
    await updateCard(
      store,
      {
        cardId: tableId,
        rows: [
          ['Pro', '$20'],
          ['Team', '$30'],
        ],
      },
      as('orb'),
    );
    expect((await cardOf(tableId)).data).toMatchObject({ totalRows: 2 });
  });
});

describe('query_board', () => {
  it("describes the caller canvas's frames and cards by id and text, never by coordinates", async () => {
    const other = (await store.create({ prompt: 'Other' })).id;
    await store.setRootSession(other, 'orb-other');
    await placeCard(store, args, execFor(store.dirOf(other), {}, 'orb-other'), now);
    expect(await queryBoard(store, {}, as('scout'))).toEqual({ frames: [], cards: [], total: 0 });

    const [ev] = await store.commandEvents(canvasId, {
      type: 'frame.added',
      frame: { title: 'Thesis', color: 'signal', x: 0, y: 0, w: 640, h: 480 },
    });
    const frameId = (ev!.data as { frame: { id: string } }).frame.id;
    const doc = await placeCard(store, args, as('orb'), now);
    const diagram = await placeCard(
      store,
      { type: 'diagram', ...SAMPLE.diagram, frameId, why: 'Flow.' },
      as('builder'),
      now,
    );
    const design = await placeCard(
      store,
      { type: 'design', ...SAMPLE.design, frameId, why: 'UI.' },
      as('builder'),
      now,
    );

    const all = await queryBoard(store, undefined, as('critic'));
    expect(all.frames).toEqual([{ id: frameId, number: '01', title: 'Thesis', cards: 2, budget: 12 }]);
    expect(all.cards).toEqual([
      {
        id: doc.cardId,
        type: 'doc',
        frameId: null,
        title: 'About X',
        description: 'X is a thing.',
        why: 'Asked for X.',
        by: 'orb',
      },
      expect.objectContaining({
        id: diagram.cardId,
        type: 'diagram',
        frameId,
        description: 'Mermaid flowchart. Shows: Ask, Search, Enough?.',
        by: 'builder',
      }),
      expect.objectContaining({
        id: design.cardId,
        description: expect.stringContaining('Visible text: "Orb Research canvas"'),
      }),
    ]);
    // No coordinates or sizes anywhere in the answer.
    const keys = JSON.stringify(all).match(/"(x|y|w|h|width|height)":/g);
    expect(keys).toBeNull();

    expect((await queryBoard(store, { frameId }, as('orb'))).cards.map((c) => c.id)).toEqual([
      diagram.cardId,
      design.cardId,
    ]);
    expect((await queryBoard(store, { frameId: null }, as('orb'))).cards.map((c) => c.id)).toEqual([
      doc.cardId,
    ]);
    expect((await queryBoard(store, { types: ['design', 'doc'] }, as('orb'))).cards.map((c) => c.id)).toEqual(
      [doc.cardId, design.cardId],
    );
    expect((await queryBoard(store, { q: 'research CANVAS' }, as('orb'))).cards.map((c) => c.id)).toEqual([
      design.cardId,
    ]);
    expect((await queryBoard(store, { q: 'asked' }, as('orb'))).cards.map((c) => c.id)).toEqual([doc.cardId]);
    await expect(queryBoard(store, { frameId: 'f_nope' }, as('orb'))).rejects.toThrow(/no frame/);
    await expect(queryBoard(store, { types: ['nope'] }, as('orb'))).rejects.toThrow(/types/);
  });

  it('caps the answer and says how many matching cards were left out', async () => {
    const board = await store.board(canvasId);
    const actor = actorOf(as('orb'), 'orb');
    for (let i = 0; i < QUERY_BOARD_LIMIT + 5; i++) {
      await store.placeAgentCard(
        canvasId,
        { type: 'doc', data: { title: `T${i}`, body: 'b' }, why: 'w' },
        actor,
      );
    }
    expect(board.cards()).toHaveLength(QUERY_BOARD_LIMIT + 5);
    // P6.8: a page is 20 cards by default; `more` and `nextOffset` say where the rest is.
    const res = await queryBoard(store, {}, as('orb'));
    expect(res.cards).toHaveLength(20);
    expect(res).toMatchObject({ total: QUERY_BOARD_LIMIT + 5, more: QUERY_BOARD_LIMIT + 5 - 20, nextOffset: 20 });
    const big = await queryBoard(store, { limit: QUERY_BOARD_LIMIT }, as('orb'));
    expect(big.cards).toHaveLength(QUERY_BOARD_LIMIT);
    expect(big.more).toBe(5);
    const rest = await queryBoard(store, { offset: big.nextOffset }, as('orb'));
    expect(rest.cards).toHaveLength(5);
    expect(rest.more).toBeUndefined();
  });
});

describe('canvas.json agents', () => {
  it('setRootSession rewrites canvas.json atomically and canvasIdOfDir maps a folder back', async () => {
    const meta = await store.setRootSession(canvasId, 'orb-abc');
    expect(meta.rootSessionId).toBe('orb-abc');
    expect(JSON.parse(readFileSync(join(store.dirOf(canvasId), 'canvas.json'), 'utf8')).rootSessionId).toBe(
      'orb-abc',
    );
    expect(store.canvasIdOfDir(store.dirOf(canvasId))).toBe(canvasId);
    expect(store.canvasIdOfDir(`${store.dirOf(canvasId)}/`)).toBe(canvasId);
    expect(store.canvasIdOfDir(join(store.dirOf(canvasId), 'assets'))).toBeUndefined();
    expect(store.canvasIdOfDir(undefined)).toBeUndefined();
    // P5.3: a session created before the Orb folder moved still names the old folder; it maps to the same canvas
    // when that canvas exists here (callers then check canvas.json), never to a missing one or a non-canvas folder.
    expect(store.canvasIdOfDir(join('/old/place/Orb/canvases', canvasId))).toBe(canvasId);
    expect(store.canvasIdOfDir('/old/place/Orb/canvases/2020-01-01-missing')).toBeUndefined();
    expect(store.canvasIdOfDir(join('/old/place/Orb/elsewhere', canvasId))).toBeUndefined();
    await expect(store.setRootSession('2020-01-01-missing', 'x')).rejects.toMatchObject({
      code: 'orb/not-found',
    });
  });

  it('setChildAgent records a child session under its role', async () => {
    const meta = await store.setChildAgent(canvasId, 'scout', 'scout-2');
    expect(meta.childAgentIds).toEqual({
      scout: 'scout-2',
      critic: SESSIONS.critic,
      builder: SESSIONS.builder,
    });
    expect(
      JSON.parse(readFileSync(join(store.dirOf(canvasId), 'canvas.json'), 'utf8')).childAgentIds.scout,
    ).toBe('scout-2');
  });
});

describe('thread cards and provenance seq (P3.6)', () => {
  it('place_card threadOf: next to the thread card, in its frame, linked from it; eventSeq from the session', async () => {
    const frame = (
      await store.commandEvents(
        canvasId,
        { type: 'frame.added', frame: { title: 'Market', color: 'sky', x: 0, y: 0, w: 800, h: 600 } },
        { kind: 'user' },
      )
    ).at(-1)!.data as { frame: { id: string } };
    const fId = frame.frame.id;
    const exec = (callId: string, seq: number) =>
      as('orb', {
        callId,
        agent: {
          id: SESSIONS.orb,
          options: { provider: 'openai', model: 'gpt-6-luna' },
          session: { header: { cwd: store.dirOf(canvasId) }, seq },
        },
      });
    const { cardId: anchor } = await placeCard(store, { ...args, frameId: fId }, exec('call_a', 12), now);
    // The model names another frame? threadOf wins: the card goes with the thread's card.
    const { cardId } = await placeCard(
      store,
      { ...args, title: 'Follow-up', threadOf: anchor },
      exec('call_b', 20),
      now,
    );
    const state = (await store.board(canvasId)).current;
    const a = state.cards[anchor]!;
    const b = state.cards[cardId]!;
    expect(b.frameId).toBe(fId);
    // A doc spans 3 of the frame's 5 columns: there is no room on its right, so it goes right below.
    expect({ x: b.x, y: b.y }).toEqual({ x: a.x, y: a.y + a.h + 16 });
    expect(Object.values(state.links)).toEqual([
      expect.objectContaining({ from: anchor, to: cardId, type: 'label', label: 'thread' }),
    ]);
    expect(a.provenance).toMatchObject({ toolCallId: 'call_a', eventSeq: 11 });
    expect(b.provenance).toMatchObject({ toolCallId: 'call_b', eventSeq: 19 });
    // The active thread of Orb's session is the default; naming another frame opts out; null opts out.
    store.setActiveThread(SESSIONS.orb, anchor);
    const { cardId: c } = await placeCard(store, { ...args, title: 'Default' }, exec('call_c', 30), now);
    const { cardId: d } = await placeCard(
      store,
      { ...args, title: 'Elsewhere', threadOf: null },
      exec('call_d', 31),
      now,
    );
    store.setActiveThread(SESSIONS.orb, undefined);
    const links = Object.values((await store.board(canvasId)).current.links);
    expect(links.filter((l) => l.from === anchor).map((l) => l.to)).toEqual([cardId, c]);
    expect(links.some((l) => l.to === d)).toBe(false);
    await expect(
      placeCardTool(store, { ...args, threadOf: 'c_missing' }, exec('call_e', 32), now),
    ).rejects.toThrow(/no card or frame/);
  });

  it('thread messages: stored per card, the card must exist', async () => {
    const { cardId } = await placeCard(store, args, as('orb'), now);
    await store.appendThreadMessage(canvasId, cardId, ' Why? ', { kind: 'user' });
    const state = (await store.board(canvasId)).current;
    expect(state.threads?.[cardId]).toEqual([expect.objectContaining({ text: 'Why?', by: 'user' })]);
    await expect(store.appendThreadMessage(canvasId, 'c_nope', 'x', { kind: 'user' })).rejects.toThrow(
      /no card or frame/,
    );
    await expect(store.appendThreadMessage(canvasId, cardId, '  ', { kind: 'user' })).rejects.toThrow(
      /empty/,
    );
    // The follow snapshot carries the threads.
    const it = store.follow(canvasId);
    const first = await it.next();
    await it.return(undefined);
    expect((first.value as { threads?: Record<string, unknown[]> }).threads?.[cardId]).toHaveLength(1);
  });
});

describe('P6.6 checklist: agents propose, the user ticks', () => {
  const userActor = { kind: 'user' } as const;
  const stateItems = async (id: string) =>
    ((await cardOf(id)).data as { items: { id: string; text: string; done: boolean }[] }).items;

  it('an agent places an open checklist; only the user ticks; an agent edit keeps the tick', async () => {
    const { cardId } = await placeCard(store, { type: 'checklist', ...SAMPLE.checklist, why: 'To check' }, as('critic'), now);
    expect((await stateItems(cardId)).map((i) => [i.id, i.done])).toEqual([['i1', false], ['i2', false]]);

    await store.command(canvasId, { type: 'card.updated', id: cardId, patch: { data: { title: 'To verify', items: [
      { id: 'i1', text: 'Check the source', done: true },
      { id: 'i2', text: 'Call a customer', done: false },
    ] } } } as never, userActor);
    expect((await stateItems(cardId))[0]!.done).toBe(true);

    // The agent adds an item and rewords the other: the user's tick stays on the unchanged one.
    await updateCard(store, { cardId, items: ['Check the source', 'Call two customers', 'Read the filing'] }, as('orb'));
    expect((await stateItems(cardId)).map((i) => [i.text, i.done])).toEqual([
      ['Check the source', true],
      ['Call two customers', false],
      ['Read the filing', false],
    ]);

    // A raw agent command that ticks (or unticks) is refused by the planner, and the board is unchanged.
    const before = await stateItems(cardId);
    const flipped = before.map((i) => ({ ...i, done: !i.done }));
    await expect(
      store.command(canvasId, { type: 'card.updated', id: cardId, patch: { data: { title: 'To verify', items: flipped } } } as never, {
        kind: 'agent', agent: 'critic', model: 'm', sessionId: SESSIONS.critic,
      }),
    ).rejects.toThrow(/cannot tick/);
    expect(await stateItems(cardId)).toEqual(before);
  });

  it('place_card refuses roles that may not place a type and non-image thumbnails', async () => {
    await expect(placeCard(store, { type: 'code', ...SAMPLE.code, why: 'x' }, as('scout'), now)).rejects.toThrow(/scout may not place code/);
    await expect(
      placeCard(store, { type: 'video', title: 'V', url: 'https://youtu.be/x', thumbnail: 'assets/report.pdf', why: 'x' }, as('scout'), now),
    ).rejects.toThrow(/not an image/);
  });
});
