/**
 * P6.16 contract test: the people and personal templates (candidate research, event prep, a big personal decision,
 * trip planning, an investigation) run end to end on a REAL sidecar (mock LLM scripted per agent, mock Parallel).
 * Each agent's model script FOLLOWS ITS PLAYBOOK, and the test proves the playbook is what reached the model and
 * what the scripted tool calls did to the board:
 *   - the new-canvas turn carries Orb's playbook (intake, tier, rubric, memo, the template's own rules); each
 *     child's first assignment carries its own (steps in order, its frames with real ids, target mix, red flags for
 *     Critic), never the persona;
 *   - Orb works the template's database with upsert_rows (read-materials step) and later fills the Scorecard seed and
 *     proposes the Decision (it stays open: a person decides);
 *   - Scout places a card and writes a row of the template's own database, runs find_entities and a core deep_research on
 *     the Standard tier and is refused pro by the tier gate;
 *   - Critic raises a flag as a Risk card, clears one with an Insight that cites cards, turns a gap into a Question and
 *     cannot change a database;
 *   - Builder binds a chart to the template's database;
 *   - on the Quick tier the costly Parallel tools are refused before anything is placed or spent.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AGENT_TOOLS,
  ChartData,
  DatabaseData,
  Dataset,
  specOf,
  type BoardEvent,
  type CanvasMeta,
  type Card,
  type Frame,
  type IntakeAnswers,
  type TemplateId,
} from '@orb/shared';
import {
  MOCK_PARALLEL_KEY,
  MockParallel,
  startMockedSidecar,
  type MockRequest,
  type MockTurn,
  type MockedSidecar,
} from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';

type Who = 'orb' | 'scout' | 'critic' | 'builder';
const WHO: Who[] = ['orb', 'scout', 'critic', 'builder'];
const scripts: Record<Who, MockTurn[]> = { orb: [], scout: [], critic: [], builder: [] };
const byAgent: Record<Who, MockRequest[]> = { orb: [], scout: [], critic: [], builder: [] };
let lastRequestAt = Date.now();

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
const toolResults = (req: MockRequest): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of req.body.messages as any[]) if (m.role === 'tool') out[m.tool_call_id] = String(m.content);
  return out;
};
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
let parallel: MockParallel;

beforeAll(async () => {
  parallel = await new MockParallel({ taskMs: 100 }).start();
  sc = await startMockedSidecar({
    env: { PARALLEL_API_KEY: MOCK_PARALLEL_KEY, PARALLEL_BASE_URL: parallel.baseURL },
    llm: {
      defaultTurn: (req) => {
        lastRequestAt = Date.now();
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
  wire.events.start();
}, 120_000);
afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
  await parallel?.close();
});

const boardEvents = (id: string): BoardEvent[] =>
  readFileSync(join(sc.paths.orbHome, 'canvases', id, 'board.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BoardEvent);
function cardsOf(id: string): Card[] {
  const cards = new Map<string, Card>();
  for (const e of boardEvents(id)) {
    const d = e.data as any;
    if (e.type === 'card.added') cards.set(d.card.id, d.card);
    if (e.type === 'card.updated') {
      const c = cards.get(d.id);
      if (c) cards.set(d.id, { ...c, ...d.patch, data: d.patch.data ?? c.data });
    }
  }
  return [...cards.values()];
}
const framesOf = (id: string): Frame[] =>
  boardEvents(id).flatMap((e) => (e.type === 'frame.added' ? [(e.data as { frame: Frame }).frame] : []));
const metaOf = (id: string): CanvasMeta =>
  JSON.parse(readFileSync(join(sc.paths.orbHome, 'canvases', id, 'canvas.json'), 'utf8'));
const datasetOf = (canvasId: string, datasetId: string): Dataset =>
  Dataset.parse(
    JSON.parse(
      readFileSync(join(sc.paths.orbHome, 'canvases', canvasId, 'assets', 'data', `${datasetId}.json`), 'utf8'),
    ),
  );
const waitFor = <T>(fn: () => T | undefined | false, timeout = 30_000) =>
  expect
    .poll(fn, { timeout, interval: 50 })
    .toBeTruthy()
    .then(() => fn() as T);
/** Wait until no model request has arrived for a while: the previous canvas's agents are done. */
const quiet = () => expect.poll(() => Date.now() - lastRequestAt > 1500, { timeout: 30_000, interval: 100 }).toBe(true);
const reset = () => {
  for (const w of WHO) {
    byAgent[w].length = 0;
    scripts[w].length = 0;
  }
};

type Case = {
  id: TemplateId;
  intake: IntakeAnswers;
  /** A frame Scout owns, the card it places there and the database row it writes. */
  scout: {
    frame: string;
    entity: { title: string; kind: 'person' | 'org'; role?: string };
    db: string;
    key: string;
    row: Record<string, string | number | boolean>;
    /** A frame where find_entities builds its own list. */
    entities: string | undefined;
  };
  /** The database Orb writes in its first step (read-materials) and its row. */
  orb: { db: string; key: string; row: Record<string, string | number | boolean> };
  critic: { flagFrame: string; questionFrame: string; flag: string };
  builder: { frame: string; db: string; mark: 'bar' | 'pie'; x: string; y?: string };
  /** Sentences each agent's assignment must contain: the template's own rules. */
  orbSays: string[];
  scoutSays: string[];
  criticSays: string[];
};

const CASES: Case[] = [
  {
    id: 'candidate',
    intake: {
      candidate: 'Ada Lovelace',
      role: 'Senior Backend Engineer',
      hiring_org: 'Acme Robotics',
      level: 'Senior',
      basis: 'They applied',
      requirements: 'Distributed systems at scale\nLed a team of 5 or more',
      links: ['https://github.com/ada'],
      sites: ['github.com'],
    },
    scout: {
      frame: 'Work evidence',
      entity: { title: 'Ada Lovelace', kind: 'person', role: 'Staff engineer' },
      db: 'Work evidence',
      key: 'Work',
      row: {
        Work: 'ada/engine repository',
        Type: 'Code',
        Date: '2024-03-01',
        'Their part': 'Author of the scheduler',
        Strength: 5,
        Source: 'https://github.com/ada/engine',
      },
      entities: undefined,
    },
    orb: {
      db: 'Requirements',
      key: 'Requirement',
      row: { Requirement: 'Distributed systems at scale', Type: 'Must-have', Weight: 9 },
    },
    critic: {
      flagFrame: 'Verification & red flags',
      questionFrame: 'Interview & references',
      flag: 'RF01 raised: the 2019 title is not independently verified',
    },
    builder: { frame: 'Fit to the role', db: 'Requirements', mark: 'bar', x: 'Requirement', y: 'Weight' },
    orbSays: ['public professional information', 'Candidate brief: Ada Lovelace for Senior Backend Engineer'],
    scoutSays: ['Do not look for personal accounts', 'github.com'],
    criticSays: ['Sensitive or non-professional information'],
  },
  {
    id: 'event-prep',
    intake: {
      event: 'Acme Summit',
      event_url: 'https://summit.example',
      role: 'Attendee',
      dates: '12 to 14 May 2027',
      city: 'Lisbon',
      goals: 'Meet three prospective customers',
      sites: ['lu.ma'],
    },
    scout: {
      frame: 'Speakers & attendees',
      entity: { title: 'Grace Hopper', kind: 'person', role: 'Keynote speaker' },
      db: 'People',
      key: 'Name',
      row: {
        Name: 'Grace Hopper',
        Organisation: 'Navy Labs',
        Role: 'Keynote speaker',
        'At the event': 'Speaker',
        Priority: 5,
        Status: 'To contact',
      },
      entities: 'Companies & sponsors',
    },
    orb: {
      db: 'Sessions',
      key: 'Title',
      row: { Title: 'Opening keynote', Day: '2027-05-12', Track: 'Main', Format: 'Keynote', Priority: 5 },
    },
    critic: {
      flagFrame: 'Logistics & budget',
      questionFrame: 'Goals & strategy',
      flag: 'RF04 raised: no priority person is confirmed on the programme',
    },
    builder: { frame: 'Agenda & sessions', db: 'Sessions', mark: 'bar', x: 'Track' },
    orbSays: ['Event plan: Acme Summit', 'nothing is sent to anyone'],
    scoutSays: ['you never send anything', 'no personal contact details'],
    criticSays: ['Scam risk'],
  },
  {
    id: 'personal-decision',
    intake: {
      decision: 'Buy a flat in Leeds',
      kind: 'Home',
      budget: '280000 pounds all in',
      must_haves: 'Two bedrooms\nA garden',
    },
    scout: {
      frame: 'Options',
      entity: { title: '12 Mill Lane', kind: 'org', role: 'Listing' },
      db: 'Options',
      key: 'Name',
      row: {
        Name: '12 Mill Lane',
        Price: 265000,
        'Dealbreaker hit': false,
        Status: 'Shortlisted',
        Source: 'https://listing.example/12',
      },
      entities: 'Options',
    },
    orb: {
      db: 'Criteria',
      key: 'Criterion',
      row: { Criterion: 'Two bedrooms', Type: 'Must-have' },
    },
    critic: {
      flagFrame: 'Risks & regrets',
      questionFrame: 'Next steps & questions',
      flag: 'RF02 raised: council tax and ground rent are missing from the cost model',
    },
    builder: { frame: 'True cost', db: 'Cost model', mark: 'bar', x: 'Option', y: 'Total over 5 years' },
    orbSays: ['not a financial, legal or medical adviser', 'Decision memo: Buy a flat in Leeds'],
    scoutSays: ['listing portals', 'never submit anything'],
    criticSays: ['Artificial urgency'],
  },
  {
    id: 'trip-planning',
    intake: {
      destination: 'Japan',
      dates: '3 to 17 April',
      budget: '4500 pounds in total',
      interests: 'Food, old temples and one hike',
      pace: 'Balanced',
      sites: ['booking.com'],
    },
    scout: {
      frame: 'Where to stay',
      entity: { title: 'Hotel Gion', kind: 'org', role: 'Stay in Kyoto' },
      db: 'Stays',
      key: 'Name',
      row: {
        Name: 'Hotel Gion',
        Stop: 'Kyoto',
        'Price per night': 140,
        Rating: 4,
        Terms: 'Free cancellation',
        Pick: true,
      },
      entities: 'Where to stay',
    },
    orb: {
      db: 'Budget',
      key: 'Item',
      row: { Item: 'Return flights (booked)', Category: 'Transport', Estimate: 1200, Status: 'Booked' },
    },
    critic: {
      flagFrame: 'Prep, risks & packing',
      questionFrame: 'Itinerary',
      flag: 'RF01 raised: the visa rule was not checked against the official source',
    },
    builder: { frame: 'Budget', db: 'Budget', mark: 'pie', x: 'Category', y: 'Estimate' },
    orbSays: ['Trip plan: Japan', 'nothing is booked'],
    scoutSays: ['Do not search for personal data of any traveller', 'booking.com'],
    criticSays: ['no medical advice'],
  },
  {
    id: 'investigation',
    intake: {
      subject: 'Acme Holdings and the Riverside contract',
      question: 'Was the Riverside contract awarded unfairly?',
      kind: 'A money or contract trail',
      public_interest: 'Public money was spent; residents are affected.',
      sites: ['opencorporates.com'],
    },
    scout: {
      frame: 'Entities & network',
      entity: { title: 'Acme Holdings Ltd', kind: 'org', role: 'Contractor' },
      db: 'Entities',
      key: 'Name',
      row: {
        Name: 'Acme Holdings Ltd',
        Type: 'Company',
        Identifier: '12345678',
        Jurisdiction: 'UK',
        'Public figure': false,
      },
      entities: 'Entities & network',
    },
    orb: {
      db: 'Claims',
      key: 'Claim',
      row: { Claim: 'The contract was awarded without a tender', Status: 'Unchecked', 'Key claim': true },
    },
    critic: {
      flagFrame: 'Gaps, counter-evidence & checks',
      questionFrame: 'Gaps, counter-evidence & checks',
      flag: 'RF01 raised: the tender claim rests on one press report',
    },
    builder: { frame: 'Claims & verification', db: 'Claims', mark: 'bar', x: 'Status' },
    orbSays: ['Investigation brief: Acme Holdings and the Riverside contract', 'nobody is contacted'],
    scoutSays: ['A source that copies another counts once', 'opencorporates.com'],
    criticSays: ['Source safety'],
  },
];

const frameId = (frames: Frame[], title: string) => frames.find((f) => f.title === title)!.id;
const col = (ds: Dataset, name: string) => ds.columns.find((c) => c.name === name)!.id;

describe.each(CASES.map((c) => [c.id, c] as const))('%s, Standard tier: the agents follow the playbook', (id, c) => {
  const spec = specOf(id)!;
  const first = spec.inputs[0]!;

  it('runs the playbook (scripted): read, delegate, write rows, raise flags, chart, score', async () => {
    await quiet();
    reset();
    const canvas = await wire.orb.canvas.create({
      prompt: `${String(c.intake[first.id])}: ${spec.label}`,
      template: id,
      intake: c.intake,
      depth: 'standard',
    });
    const frames = framesOf(canvas.id);
    expect(frames.map((f) => f.title)).toEqual(spec.frames.map((f) => f.title));
    expect(metaOf(canvas.id)).toMatchObject({ template: id, depth: 'standard' });
    const cards = cardsOf(canvas.id);
    const dbCard = (title: string) =>
      cards.find((x) => x.type === 'database' && (x.data as { title: string }).title === title)!;
    const scoutDb = dbCard(c.scout.db);
    const orbDb = dbCard(c.orb.db);
    const builderDb = dbCard(c.builder.db);
    const owned = (role: Who) =>
      frames.filter((f, i) => spec.frames[i]!.owners.includes(role)).map((f) => f.id);
    const flagFrame = frameId(frames, c.critic.flagFrame);
    const questionFrame = frameId(frames, c.critic.questionFrame);
    const scoutFrame = frameId(frames, c.scout.frame);
    const builderFrame = frameId(frames, c.builder.frame);
    const scorecard = cards.find(
      (x) => x.type === 'matrix' && (x.data as { title: string }).title.startsWith('Scorecard'),
    )!;
    const decision = cards.find((x) => x.type === 'decision')!;
    const checklist = cards.find((x) => x.type === 'checklist' && x.frameId === flagFrame)!;

    const held = {
      holdUntil: () =>
        expect
          .poll(() => byAgent.orb.some((r) => 'call_d_scout' in toolResults(r) && r.completed), {
            timeout: 30_000,
            interval: 20,
          })
          .toBe(true),
      firstDelayMs: 200,
    } as const;

    // Orb: playbook step 1 (write the template's database), step 2 (delegate), then the rubric.
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_o_row',
            name: 'upsert_rows',
            arguments: { cardId: orbDb.id, key: c.orb.key, rows: [{ values: c.orb.row }] },
          },
          {
            id: 'call_d_scout',
            name: 'delegate',
            arguments: { role: 'scout', frameIds: owned('scout'), instruction: 'Start from the intake.' },
          },
          {
            id: 'call_d_builder',
            name: 'delegate',
            arguments: { role: 'builder', frameIds: owned('builder'), instruction: 'The charts.' },
          },
          {
            id: 'call_d_critic',
            name: 'delegate',
            arguments: { role: 'critic', frameIds: owned('critic'), instruction: 'The red-flag checklist.' },
          },
        ],
      },
      { text: 'The team is on it.' },
    );
    scripts.scout.push(
      { toolCalls: [{ id: 'call_s_p1', name: 'report_progress', arguments: { status: 'Starting', frameId: scoutFrame } }], ...held },
      {
        toolCalls: [
          {
            id: 'call_s_card',
            name: 'place_card',
            arguments: {
              type: 'entity',
              frameId: scoutFrame,
              title: c.scout.entity.title,
              entityKind: c.scout.entity.kind,
              ...(c.scout.entity.role ? { role: c.scout.entity.role } : {}),
              body: 'From the first pass.',
              why: 'From the playbook.',
            },
          },
          {
            id: 'call_s_row',
            name: 'upsert_rows',
            arguments: { cardId: scoutDb.id, key: c.scout.key, rows: [{ values: c.scout.row }] },
          },
        ],
      },
      ...(c.scout.entities
        ? [
            {
              toolCalls: [
                {
                  id: 'call_s_find',
                  name: 'find_entities',
                  arguments: {
                    objective: 'Matching entities',
                    match_limit: 5,
                    frameId: frameId(frames, c.scout.entities),
                    wait: true,
                  },
                },
              ],
            },
          ]
        : []),
      {
        toolCalls: [
          {
            id: 'call_s_deep_pro',
            name: 'deep_research',
            arguments: { input: 'A gap in the research', processor: 'pro', frameId: scoutFrame },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_deep_core',
            name: 'deep_research',
            arguments: {
              input: 'A gap in the research',
              processor: 'core',
              title: 'Gap research',
              frameId: scoutFrame,
              wait: true,
            },
          },
        ],
      },
      { toolCalls: [{ id: 'call_s_done', name: 'send_message', arguments: { about: 'done', message: 'First pass is in.' } }] },
      { text: 'Done.' },
    );
    scripts.builder.push(
      { toolCalls: [{ id: 'call_b_p1', name: 'report_progress', arguments: { status: 'Chart', frameId: builderFrame } }], ...held },
      {
        toolCalls: [
          {
            id: 'call_b_chart',
            name: 'place_card',
            arguments: {
              type: 'chart',
              frameId: builderFrame,
              title: 'Built from the database',
              mark: c.builder.mark,
              x: c.builder.x,
              ...(c.builder.y ? { y: c.builder.y } : {}),
              datasetId: DatabaseData.parse(builderDb.data).datasetId,
              why: 'Bound to the template database.',
            },
          },
        ],
      },
      { toolCalls: [{ id: 'call_b_done', name: 'send_message', arguments: { about: 'done', message: 'Chart placed.' } }] },
      { text: 'Done.' },
    );
    scripts.critic.push(
      { toolCalls: [{ id: 'call_c_p1', name: 'report_progress', arguments: { status: 'Red flags', frameId: flagFrame } }], ...held },
      {
        toolCalls: [
          {
            id: 'call_c_raised',
            name: 'place_card',
            arguments: {
              type: 'risk',
              frameId: flagFrame,
              title: c.critic.flag,
              body: 'Evidence from the first pass.',
              why: 'A raised flag.',
            },
          },
          {
            id: 'call_c_cleared',
            name: 'place_card',
            arguments: {
              type: 'insight',
              frameId: flagFrame,
              title: 'RF05 cleared: the independent source agrees',
              body: 'A second source confirms it.',
              citations: [checklist.id, scoutDb.id],
              why: 'Cleared with sources.',
            },
          },
          {
            id: 'call_c_q',
            name: 'place_card',
            arguments: {
              type: 'question',
              frameId: questionFrame,
              title: 'What is the evidence for the remaining gap?',
              body: 'A gap from the checklist.',
              why: 'A gap becomes a question.',
            },
          },
          { id: 'call_c_upsert', name: 'upsert_rows', arguments: { cardId: scoutDb.id, rows: [{ values: { x: 'y' } }] } },
        ],
      },
      { toolCalls: [{ id: 'call_c_done', name: 'send_message', arguments: { about: 'done', message: 'One raised, one cleared.' } }] },
      { text: 'Done.' },
    );

    await wire.orb.canvas.start(canvas.id);

    // 1. Orb's new-canvas turn: the playbook, the intake, the tier, the rubric, the memo and the template's own rules.
    const orbFirst = await waitFor(() => byAgent.orb.find((r) => allText(r).includes(`The ${spec.label} playbook`)));
    const orbText = allText(orbFirst);
    expect(orbText).toContain(`The ${spec.label} playbook`);
    expect(orbText).toContain(`- ${first.label}: ${String(c.intake[first.id])}`);
    expect(orbText).toContain('Depth: Standard');
    expect(orbText).toContain(`${spec.rubric[0]!.name} (${spec.rubric[0]!.weight}%)`);
    for (const s of c.orbSays) expect(orbText).toContain(s);
    for (const f of frames) expect(orbText).toContain(`[${f.id}]`);
    expect(systemOf(orbFirst)).not.toMatch(/playbook/i);

    // 2. Each child's FIRST assignment carries its playbook, never its persona.
    const scoutFirst = await waitFor(() => byAgent.scout.find((r) => allText(r).includes('Your playbook, in this order:')));
    const scoutText = allText(scoutFirst);
    expect(scoutText).toContain('Your playbook, in this order:');
    expect(scoutText).toContain(`"${c.scout.frame}" [${scoutFrame}]`);
    expect(scoutText).toContain('Target mix:');
    for (const s of c.scoutSays) expect(scoutText).toContain(s);
    expect(scoutText).not.toContain('The red-flag checklist');
    const scoutSteps = spec.plan.scout.map((s) => s.text.slice(0, 25));
    const from = scoutText.indexOf('Your playbook, in this order:');
    const at = scoutSteps.map((s) => scoutText.indexOf(s, from));
    expect(at.every((n) => n >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(systemOf(scoutFirst)).not.toMatch(/playbook/i);
    const criticText = allText(await waitFor(() => byAgent.critic.find((r) => allText(r).includes('Your playbook, in this order:'))));
    for (const f of spec.redFlags) expect(criticText).toContain(f.id);
    for (const s of c.criticSays) expect(criticText).toContain(s);
    expect(criticText).toContain(`"${c.critic.flagFrame}" [${flagFrame}]`);
    expect(allText(await waitFor(() => byAgent.builder.find((r) => allText(r).includes('Your playbook, in this order:'))))).toContain(`"${c.builder.frame}" [${builderFrame}]`);

    // 3. Orb's own step: a row in the template's database, written by Orb.
    const orbDs = await waitFor(() => {
      const ds = datasetOf(canvas.id, DatabaseData.parse(orbDb.data).datasetId);
      return ds.rows.length > 0 ? ds : undefined;
    });
    expect(orbDs.rows[0]).toMatchObject({ by: 'orb' });
    expect(orbDs.rows[0]!.cells[col(orbDs, c.orb.key)]).toBe(c.orb.row[c.orb.key]);

    // 4. Scout's playbook calls did what the playbook says.
    const scoutDone = await waitFor(() => byAgent.scout.find((r) => 'call_s_deep_core' in toolResults(r)));
    const results = toolResults(scoutDone);
    const ds = datasetOf(canvas.id, DatabaseData.parse(scoutDb.data).datasetId);
    expect(ds.rows).toHaveLength(1);
    expect(ds.rows[0]).toMatchObject({ by: 'scout' });
    expect(ds.rows[0]!.cells[col(ds, c.scout.key)]).toBe(c.scout.row[c.scout.key]);
    for (const [name, value] of Object.entries(c.scout.row))
      expect(ds.rows[0]!.cells[col(ds, name)], name).toBe(value);
    if (c.scout.entities) {
      expect(JSON.parse(results.call_s_find!)).toMatchObject({ status: 'completed' });
      const inFrame = cardsOf(canvas.id).filter((x) => x.frameId === frameId(frames, c.scout.entities!));
      expect(inFrame.some((x) => x.type === 'research')).toBe(true);
    }
    expect(JSON.parse(results.call_s_deep_pro!)).toMatchObject({
      refused: true,
      message: expect.stringMatching(/allows the processors lite, base, core for deep_research, not pro/),
    });
    expect(JSON.parse(results.call_s_deep_core!)).toMatchObject({ status: 'completed' });
    expect(parallel.count('POST', '/v1/tasks/runs')).toBeGreaterThanOrEqual(1);
    const entity = cardsOf(canvas.id).find(
      (x) =>
        x.type === 'entity' &&
        x.provenance.kind === 'agent' &&
        (x.data as { title?: string }).title === c.scout.entity.title,
    )!;
    expect(entity.provenance).toMatchObject({ kind: 'agent', agent: 'scout' });
    expect(entity.frameId).toBe(scoutFrame);

    // 5. Builder bound its chart to the template's database.
    const chart = await waitFor(() =>
      cardsOf(canvas.id).find((x) => x.type === 'chart' && x.provenance.kind === 'agent'),
    );
    expect(chart.provenance).toMatchObject({ kind: 'agent', agent: 'builder' });
    expect(chart.frameId).toBe(builderFrame);
    expect(ChartData.parse(chart.data).source).toEqual({
      kind: 'dataset',
      datasetId: DatabaseData.parse(builderDb.data).datasetId,
    });

    // 6. Critic's cards sit in its frames with its role; its upsert was refused.
    await waitFor(
      () =>
        cardsOf(canvas.id).filter((x) => x.provenance.kind === 'agent' && (x.provenance as any).agent === 'critic')
          .length >= 3,
    );
    const mine = cardsOf(canvas.id).filter(
      (x) => x.provenance.kind === 'agent' && (x.provenance as any).agent === 'critic',
    );
    expect(mine.map((x) => [x.type, x.frameId])).toEqual([
      ['risk', flagFrame],
      ['insight', flagFrame],
      ['question', questionFrame],
    ]);
    const criticAfter = await waitFor(() => byAgent.critic.find((r) => 'call_c_upsert' in toolResults(r)));
    expect(toolResults(criticAfter)['call_c_upsert']).toMatch(/not available to the critic|not found|unknown tool/i);
    expect(AGENT_TOOLS.critic).not.toContain('upsert_rows');

    // 7. Orb scores the rubric and proposes the decision; the decision stays open (a person decides).
    const n = spec.rubric.length;
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_o_score',
            name: 'update_card',
            arguments: {
              cardId: scorecard.id,
              options: [
                { name: 'orb score', scores: spec.rubric.map((_, i) => 6 + (i % 3)), note: 'Cited in the cards.' },
                { name: 'Your score', scores: Array.from({ length: n }, () => null) },
              ],
              why: 'Scores cite the cards of each dimension.',
            },
          },
          {
            id: 'call_o_decision',
            name: 'update_card',
            arguments: {
              cardId: decision.id,
              rationale: 'Weighted total 3.4 of 5. Proposed, not decided.',
              why: 'Proposed, not decided.',
            },
          },
        ],
      },
      { text: 'Scored.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'Score the rubric now.' });
    const scored = await waitFor(() => {
      const x = cardsOf(canvas.id).find((y) => y.id === scorecard.id);
      return (x?.data as { options: { scores: (number | null)[] }[] }).options[0]!.scores[0] === 6 ? x : undefined;
    });
    expect((scored.data as { criteria: { weight: number }[] }).criteria.map((k) => k.weight)).toEqual(
      spec.rubric.map((d) => d.weight),
    );
    expect(scored.seed).toBe(true);
    const decided = await waitFor(() => {
      const x = cardsOf(canvas.id).find((y) => y.id === decision.id);
      return (x?.data as { rationale?: string })?.rationale ? x : undefined;
    });
    expect(decided.data).toMatchObject({ status: 'open', rationale: expect.stringContaining('Weighted total') });
  }, 150_000);
});

describe('the Quick tier: the cost guard on every people template', () => {
  it.each(CASES.map((c) => [c.id, c] as const))(
    '%s refuses deep_research, find_entities and batch_enrich before anything is placed or spent',
    async (id, c) => {
      await quiet();
      reset();
      const spec = specOf(id)!;
      const quick = await wire.orb.canvas.create({
        prompt: `Quick ${spec.label}`,
        template: id,
        intake: c.intake,
        depth: 'quick',
      });
      expect(metaOf(quick.id)).toMatchObject({ depth: 'quick' });
      const runs = parallel.count('POST', '/v1/tasks/runs');
      const findalls = parallel.count('POST', '/v1beta/findall/runs');
      const before = cardsOf(quick.id).length;
      scripts.orb.push(
        {
          toolCalls: [
            { id: 'call_q_deep', name: 'deep_research', arguments: { input: 'A market question', processor: 'core' } },
            { id: 'call_q_find', name: 'find_entities', arguments: { objective: 'Matching entities', wait: true } },
            {
              id: 'call_q_batch',
              name: 'batch_enrich',
              arguments: {
                rows: [{ name: 'Row' }],
                output_json_schema: { type: 'object', properties: { hq: { type: 'string', description: 'HQ' } } },
              },
            },
            { id: 'call_q_answer', name: 'web_answer', arguments: { question: 'What is this?' } },
          ],
        },
        { text: 'Quick scan only.' },
      );
      await wire.orb.chat.send(quick.id, { text: 'Research it.' });
      const after = await waitFor(() => byAgent.orb.find((r) => 'call_q_batch' in toolResults(r)));
      const out = toolResults(after);
      for (const callId of ['call_q_deep', 'call_q_find', 'call_q_batch'])
        expect(JSON.parse(out[callId]!), callId).toMatchObject({
          refused: true,
          message: expect.stringMatching(/Quick scan depth tier.*does not allow/),
        });
      expect(JSON.parse(out.call_q_answer!)).not.toHaveProperty('refused');
      expect(parallel.count('POST', '/v1/tasks/runs')).toBe(runs);
      expect(parallel.count('POST', '/v1beta/findall/runs')).toBe(findalls);
      expect(cardsOf(quick.id).length).toBe(before);
    },
    60_000,
  );
});

describe('follow-up chips and intake validation', () => {
  it.each(CASES.map((c) => [c.id, c] as const))('%s: the wire refuses an intake without its required fields', async (id) => {
    const spec = specOf(id)!;
    const before = (await wire.orb.canvas.list()).length;
    await expect(
      wire.orb.canvas.create({ prompt: 'x', template: id, intake: { [spec.inputs[0]!.id]: '' } }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/intake is not valid/) });
    expect((await wire.orb.canvas.list()).length).toBe(before);
  });
});
