/**
 * P6.13 contract test: the startup / product templates run end to end on a REAL sidecar (mock LLM scripted per agent,
 * mock Parallel). Every agent's model script FOLLOWS ITS PLAYBOOK, and the test proves the playbook is what reached the
 * model and what the scripted tool calls did to the board:
 *   A. for all eight templates (competitive analysis, customer discovery, product teardown `ui`, pricing research, GTM
 *      plan `gtm`, feature PRD, fundraising prep, company research `company`): Orb's new-canvas turn carries its
 *      playbook (intake, tier, rubric, memo, deck), each child's first assignment carries its own (steps in order, its
 *      frames with real ids, the target mix, the ticked signed-in site, Critic the red flags), and no persona does;
 *   B. competitive analysis (market group): Scout fills the Competitors and Pricing databases with upsert_rows and runs
 *      find_entities, a deeper research processor is refused by the tier gate, Builder binds a chart to Pricing,
 *      Critic raises and clears red flags as cards and cannot change a database, Orb fills the rubric matrix;
 *   C. customer discovery (research group): transcripts dropped before Orb starts are logged by Orb, read by Scout page
 *      by page, quoted verbatim with the transcript as the source, tallied into Themes by distinct people, and Critic
 *      flags a leading question;
 *   D. fundraising prep (finance group): Orb tags deck numbers Claimed in KPIs and a model-checked one Verified, Scout
 *      builds Comparable rounds and Investor targets;
 *   E. pricing research on the Quick tier: the costly Parallel tools are refused before anything is placed or spent.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Dataset,
  DatabaseData,
  ChartData,
  fillTokens,
  specOf,
  type BoardEvent,
  type CanvasMeta,
  type Card,
  type Frame,
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
const scripts: Record<Who, MockTurn[]> = { orb: [], scout: [], critic: [], builder: [] };
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
// Scripts left over by a failed test must not feed the next one.
beforeEach(() => {
  for (const who of ['orb', 'scout', 'critic', 'builder'] as const) scripts[who].length = 0;
});
afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
  await parallel?.close();
});
// A fixture researches a sample of the template. Retire its remaining repair work before sharing the next script.
afterEach(async () => {
  if (wire)
    for (const canvas of await wire.orb.canvas.list())
      await wire.orb.agents.control(canvas.id, { action: 'stop', agent: 'all' });
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
      readFileSync(
        join(sc.paths.orbHome, 'canvases', canvasId, 'assets', 'data', `${datasetId}.json`),
        'utf8',
      ),
    ),
  );
const waitFor = <T>(fn: () => T | undefined | false, timeout = 30_000) =>
  expect
    .poll(fn, { timeout, interval: 50 })
    .toBeTruthy()
    .then(() => fn() as T);

const frameId = (frames: Frame[], title: string) => frames.find((f) => f.title === title)!.id;
const dbCard = (cards: Card[], title: string) =>
  cards.find((c) => c.type === 'database' && (c.data as { title: string }).title === title)!;
const dsIdOf = (card: Card) => DatabaseData.parse(card.data).datasetId;
const cell = (ds: Dataset, row: Dataset['rows'][number], column: string) =>
  row.cells[ds.columns.find((c) => c.name === column)!.id];
const mine = (cards: Card[], agent: string) =>
  cards.filter((c) => c.provenance.kind === 'agent' && (c.provenance as any).agent === agent);

/** Wait for the first request of `who` that mentions `needle` and `subject` (the canvas's own subject: the mock sees every canvas). */
const first = (who: Who, needle: string, subject: string) =>
  waitFor(() => byAgent[who].find((r) => allText(r).includes(needle) && allText(r).includes(subject)));

const delegate = (id: string, role: Who, frameIds: string[], instruction: string) => ({
  id,
  name: 'delegate',
  arguments: { role, frameIds, instruction },
});

// ---------------------------------------------------------------------------------------------------------------
// A. the playbook reaches every agent of every template
// ---------------------------------------------------------------------------------------------------------------

const GROUP: readonly TemplateId[] = [
  'competitive-analysis',
  'customer-discovery',
  'ui',
  'pricing-research',
  'gtm',
  'feature-prd',
  'fundraising-prep',
  'company',
];

describe.each(GROUP.map((id, i) => [id, i] as const))('A. %s: the agents follow the playbook', (id, i) => {
  const spec = specOf(id)!;
  const subject = `Subject${i}Corp`;
  const intake: Record<string, string | string[]> = {
    [spec.inputs[0]!.id]: subject,
    ...Object.fromEntries(
      spec.inputs.filter((f) => f.kind === 'url').map((f) => [f.id, `https://${id}.example.com`]),
    ),
    sites: [spec.signedIn[0]!.domain],
  };

  it('Orb gets its playbook with the intake, tier, rubric, memo and deck; each child its own; no persona has one', async () => {
    const canvas = await wire.orb.canvas.create({
      prompt: `${subject}: ${spec.label}`,
      template: id,
      intake,
      depth: 'standard',
    });
    const frames = framesOf(canvas.id);
    expect(frames.map((f) => f.title)).toEqual(spec.frames.map((f) => f.title));
    expect(metaOf(canvas.id)).toMatchObject({
      template: id,
      depth: 'standard',
      intake: { [spec.inputs[0]!.id]: subject },
    });
    const owned = (role: Who) =>
      spec.frames.filter((f) => f.owners.includes(role)).map((f) => frameId(frames, f.title));
    scripts.orb.push(
      {
        toolCalls: [
          delegate('call_d_scout', 'scout', owned('scout'), 'First pass.'),
          delegate('call_d_critic', 'critic', owned('critic'), 'Work through the red-flag checklist.'),
          delegate('call_d_builder', 'builder', owned('builder'), 'Charts and diagrams.'),
        ],
      },
      { text: 'The team is on it.' },
    );
    await wire.orb.canvas.start(canvas.id);

    // Orb's new-canvas turn.
    const orbReq = await first('orb', `${subject}: ${spec.label}`, subject);
    const orbText = allText(orbReq);
    expect(orbText).toContain(`The ${spec.label} playbook`);
    expect(orbText).toContain(`- ${spec.inputs[0]!.label}: ${subject}`);
    expect(orbText).toContain('Depth: Standard');
    for (const d of spec.rubric) expect(orbText).toContain(`${d.name} (${d.weight}%)`);
    expect(orbText).toContain(fillTokens(spec.output.memoTitle, intake));
    expect(orbText).toContain('The deck (');
    expect(orbText).toContain('The frames hold seed cards');
    for (const f of frames) expect(orbText).toContain(`[${f.id}]`);
    // Its own steps, in order.
    const at = (needle: string) => orbText.indexOf(needle, orbText.indexOf('Your playbook, in order:'));
    const [s1, s2] = spec.plan.orb;
    expect(at(fillTokens(s1!.text, intake).slice(0, 50))).toBeGreaterThan(0);
    expect(at(fillTokens(s1!.text, intake).slice(0, 50))).toBeLessThan(
      at(fillTokens(s2!.text, intake).slice(0, 50)),
    );
    expect(systemOf(orbReq)).not.toMatch(/playbook/i);

    // Each child's first assignment.
    const scoutReq = await first('scout', 'Your playbook, in this order:', subject);
    const scoutText = allText(scoutReq);
    expect(scoutText).toContain(`The ${spec.label} playbook`);
    const scoutFrame = spec.frames.find((f) => f.owners.includes('scout'))!;
    expect(scoutText).toContain(`"${scoutFrame.title}" [${frameId(frames, scoutFrame.title)}]`);
    expect(scoutText).toContain('Target mix:');
    expect(scoutText).toContain(spec.signedIn[0]!.domain); // the ticked signed-in source
    expect(scoutText).not.toContain('The red-flag checklist');
    const [a, b] = spec.plan.scout;
    expect(scoutText.indexOf(fillTokens(a!.text, intake).slice(0, 50))).toBeGreaterThan(0);
    expect(scoutText.indexOf(fillTokens(a!.text, intake).slice(0, 50))).toBeLessThan(
      scoutText.indexOf(fillTokens(b!.text, intake).slice(0, 50)),
    );
    expect(systemOf(scoutReq)).not.toMatch(/playbook/i);
    const criticText = allText(await first('critic', 'The red-flag checklist', subject));
    for (const f of spec.redFlags) expect(criticText).toContain(f.id);
    const builderFrame = spec.frames.find((f) => f.owners.includes('builder'))!;
    expect(allText(await first('builder', 'Your playbook, in this order:', subject))).toContain(
      `"${builderFrame.title}" [${frameId(frames, builderFrame.title)}]`,
    );
    // Let the turns settle before the next canvas starts.
    await new Promise((r) => setTimeout(r, 400));
  }, 90_000);
});

// ---------------------------------------------------------------------------------------------------------------
// B. competitive analysis: Scout, Builder, Critic and Orb do what the playbook says
// ---------------------------------------------------------------------------------------------------------------

describe('B. competitive analysis, Standard tier', () => {
  const spec = specOf('competitive-analysis')!;
  it('fills the databases, discovers competitors, is refused a deeper processor, charts, flags and scores', async () => {
    const canvas = await wire.orb.canvas.create({
      prompt: 'Acme Analytics: competitive analysis',
      template: 'competitive-analysis',
      intake: {
        product: 'Acme Analytics',
        website: 'https://acme-analytics.example.com',
        competitors: ['Rival One', 'Rival Two'],
      },
      depth: 'standard',
    });
    const frames = framesOf(canvas.id);
    const cards = cardsOf(canvas.id);
    const landscape = frameId(frames, 'Landscape');
    const pricingFrame = frameId(frames, 'Pricing & packaging');
    const positioning = frameId(frames, 'Positioning & messaging');
    const threats = frameId(frames, 'Threats & gaps');
    const competitorsDb = dbCard(cards, 'Competitors');
    const pricingDb = dbCard(cards, 'Pricing');
    const checklist = cards.find((c) => c.type === 'checklist' && c.frameId === threats)!;
    const base = byAgent.orb.length;
    const held = {
      holdUntil: () =>
        expect
          .poll(() => byAgent.orb[base + 1]?.completed === true, { timeout: 30_000, interval: 20 })
          .toBe(true),
      firstDelayMs: 200,
    } as const;

    scripts.orb.push(
      {
        toolCalls: [
          delegate(
            'call_d_scout',
            'scout',
            [landscape, pricingFrame, positioning],
            'Rival One and Rival Two first.',
          ),
          delegate('call_d_builder', 'builder', [pricingFrame], 'The entry price chart.'),
          delegate('call_d_critic', 'critic', [threats, positioning], 'Work through the red-flag checklist.'),
        ],
      },
      { text: 'The team is on it.' },
    );
    scripts.scout.push(
      {
        toolCalls: [
          {
            id: 'call_s_p1',
            name: 'report_progress',
            arguments: { status: 'Competitors', frameId: landscape },
          },
        ],
        ...held,
      },
      {
        toolCalls: [
          {
            id: 'call_s_rows',
            name: 'upsert_rows',
            arguments: {
              cardId: competitorsDb.id,
              key: 'Name',
              rows: [
                {
                  values: {
                    Name: 'Rival One',
                    URL: 'https://rival1.example',
                    Category: 'Direct',
                    'Threat level': 4,
                    Source: 'https://rival1.example',
                  },
                },
                {
                  values: {
                    Name: 'Rival Two',
                    URL: 'https://rival2.example',
                    Category: 'Substitute',
                    'Threat level': 2,
                    Source: 'https://rival2.example',
                  },
                },
              ],
            },
          },
          {
            id: 'call_s_price',
            name: 'upsert_rows',
            arguments: {
              cardId: pricingDb.id,
              key: 'Plan',
              rows: [
                {
                  values: {
                    Competitor: 'Rival One',
                    Plan: 'Pro',
                    'Price (USD per month)': 49,
                    Unit: 'seat',
                    Billing: 'Monthly',
                    'Captured on': '2026-10-15',
                    Source: 'https://rival1.example/pricing',
                  },
                },
                {
                  values: {
                    Competitor: 'Rival Two',
                    Plan: 'Team',
                    'Price (USD per month)': 99,
                    Unit: 'workspace',
                    Billing: 'Annual',
                    'Captured on': '2026-10-15',
                    Source: 'https://rival2.example/pricing',
                  },
                },
              ],
            },
          },
          {
            id: 'call_s_quote',
            name: 'place_card',
            arguments: {
              type: 'quote',
              frameId: positioning,
              title: 'Rival One home page',
              body: 'Analytics your whole team will actually use.',
              url: 'https://rival1.example',
              why: 'Their headline claim.',
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_find',
            name: 'find_entities',
            arguments: {
              objective: 'Product analytics startups',
              match_limit: 5,
              frameId: landscape,
              wait: true,
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_deep_ultra',
            name: 'deep_research',
            arguments: { input: 'The analytics market', processor: 'ultra', frameId: landscape },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_done',
            name: 'send_message',
            arguments: { about: 'done', message: 'Competitors and pricing are in.' },
          },
        ],
      },
      { text: 'Done.' },
    );
    scripts.builder.push(
      {
        toolCalls: [
          {
            id: 'call_b_p1',
            name: 'report_progress',
            arguments: { status: 'Price chart', frameId: pricingFrame },
          },
        ],
        ...held,
      },
      {
        toolCalls: [
          {
            id: 'call_b_chart',
            name: 'place_card',
            arguments: {
              type: 'chart',
              frameId: pricingFrame,
              title: 'Entry price by competitor',
              mark: 'bar',
              x: 'Competitor',
              y: 'Price (USD per month)',
              datasetId: dsIdOf(pricingDb),
              why: 'Bound to the Pricing database.',
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_b_done',
            name: 'send_message',
            arguments: { about: 'done', message: 'Price chart placed.' },
          },
        ],
      },
      { text: 'Done.' },
    );
    scripts.critic.push(
      {
        toolCalls: [
          { id: 'call_c_p1', name: 'report_progress', arguments: { status: 'Red flags', frameId: threats } },
        ],
        ...held,
      },
      {
        toolCalls: [
          {
            id: 'call_c_raised',
            name: 'place_card',
            arguments: {
              type: 'risk',
              frameId: threats,
              title: 'RF02 raised: Rival Two plan is cheaper per seat',
              body: 'Rival Two charges 99 per workspace.',
              why: 'Price pressure.',
            },
          },
          {
            id: 'call_c_cleared',
            name: 'place_card',
            arguments: {
              type: 'insight',
              frameId: threats,
              title: 'RF06 cleared: substitutes are in the list',
              body: 'Rival Two is categorised as a Substitute.',
              citations: [checklist.id, competitorsDb.id],
              why: 'Cleared with the database.',
            },
          },
          {
            id: 'call_c_upsert',
            name: 'upsert_rows',
            arguments: { cardId: pricingDb.id, rows: [{ values: { Plan: 'x' } }] },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_c_done',
            name: 'send_message',
            arguments: { about: 'done', message: 'RF02 raised; RF06 cleared.' },
          },
        ],
      },
      { text: 'Done.' },
    );

    await wire.orb.canvas.start(canvas.id);

    const scoutDone = await waitFor(() => byAgent.scout.find((r) => 'call_s_deep_ultra' in toolResults(r)));
    const out = toolResults(scoutDone);
    // Scout's playbook calls did what the playbook says.
    const rivals = datasetOf(canvas.id, dsIdOf(competitorsDb));
    expect(rivals.rows.map((r) => cell(rivals, r, 'Name'))).toEqual(['Rival One', 'Rival Two']);
    expect(rivals.rows[0]).toMatchObject({ by: 'scout' });
    const prices = datasetOf(canvas.id, dsIdOf(pricingDb));
    expect(prices.rows.map((r) => cell(prices, r, 'Captured on'))).toEqual(['2026-10-15', '2026-10-15']);
    // find_entities ran on Standard and filled a database card of its own in the Landscape frame.
    expect(JSON.parse(out.call_s_find!)).toMatchObject({ status: 'completed' });
    const inLandscape = cardsOf(canvas.id).filter((c) => c.frameId === landscape);
    expect(inLandscape.some((c) => c.type === 'research')).toBe(true);
    expect(inLandscape.filter((c) => c.type === 'database').length).toBeGreaterThanOrEqual(2);
    // The tier gate refused ultra on Standard before anything was spent.
    expect(JSON.parse(out.call_s_deep_ultra!)).toMatchObject({
      refused: true,
      message: expect.stringMatching(/allows the processors lite, base, core for deep_research, not ultra/),
    });
    expect(parallel.count('POST', '/v1/tasks/runs')).toBe(0);
    const quote = cardsOf(canvas.id).find((c) => c.type === 'quote' && c.frameId === positioning)!;
    expect(quote.provenance).toMatchObject({ kind: 'agent', agent: 'scout' });

    // Builder bound its chart to the template's Pricing database.
    const chart = await waitFor(() =>
      cardsOf(canvas.id).find((c) => c.type === 'chart' && c.provenance.kind === 'agent'),
    );
    expect(chart.frameId).toBe(pricingFrame);
    expect(ChartData.parse(chart.data).source).toEqual({ kind: 'dataset', datasetId: dsIdOf(pricingDb) });

    // Critic's cards sit in its frame; its upsert was refused (a Critic cannot change a database).
    await waitFor(() => mine(cardsOf(canvas.id), 'critic').length >= 2);
    expect(mine(cardsOf(canvas.id), 'critic').map((c) => [c.type, c.frameId])).toEqual([
      ['risk', threats],
      ['insight', threats],
    ]);
    const criticAfter = await waitFor(() => byAgent.critic.find((r) => 'call_c_upsert' in toolResults(r)));
    expect(toolResults(criticAfter)['call_c_upsert']).toMatch(
      /not available to the critic|not found|unknown tool/i,
    );
    expect(datasetOf(canvas.id, dsIdOf(pricingDb)).rows).toHaveLength(2);

    // Orb fills the rubric matrix and proposes the decision (it stays open).
    const scorecard = cards.find(
      (c) => c.type === 'matrix' && (c.data as { title: string }).title.startsWith('Competitive position'),
    )!;
    const decision = cards.find((c) => c.type === 'decision')!;
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_o_score',
            name: 'update_card',
            arguments: {
              cardId: scorecard.id,
              options: [
                {
                  name: 'orb score',
                  scores: [6, 6, 4, 6, 6, 4],
                  note: 'Fit 3, Price 3, Position 2, Proof 3, Momentum 3, Moat 2: cited in the cards.',
                },
                { name: 'Your score', scores: [null, null, null, null, null, null] },
              ],
              why: 'Scores cite the Pricing and Competitors cards.',
            },
          },
          {
            id: 'call_o_decision',
            name: 'update_card',
            arguments: {
              cardId: decision.id,
              rationale: 'Weighted total 3.0 of 5: differentiate on one capability.',
              why: 'Proposed, not decided.',
            },
          },
        ],
      },
      { text: 'Scored.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'Score it now.' });
    const scored = await waitFor(() => {
      const c = cardsOf(canvas.id).find((x) => x.id === scorecard.id);
      return (c?.data as { options: { scores: (number | null)[] }[] }).options[0]!.scores[0] === 6
        ? c
        : undefined;
    });
    expect((scored.data as { criteria: { weight: number }[] }).criteria.map((c) => c.weight)).toEqual(
      spec.rubric.map((d) => d.weight),
    );
    const decided = await waitFor(() => {
      const c = cardsOf(canvas.id).find((x) => x.id === decision.id);
      return (c?.data as { rationale?: string })?.rationale ? c : undefined;
    });
    expect(decided.data).toMatchObject({ status: 'open' });
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------------------------
// C. customer discovery: transcripts dropped before Orb starts
// ---------------------------------------------------------------------------------------------------------------

describe('C. customer discovery: interview synthesis from dropped transcripts', () => {
  const spec = specOf('customer-discovery')!;
  const T1 = [
    'Interviewer: Tell me about the last time expenses went wrong.',
    'Participant: Honestly, I spend every Friday chasing receipts from the field team. It eats half a day.',
    'Interviewer: Would you pay for something that fixes it, because it sounds like a great idea?',
    'Participant: Maybe. We already pay a bookkeeper to clean it up each month.',
  ].join('\n');
  const T2 = [
    'Interviewer: How do you handle receipts today?',
    'Participant: A shared spreadsheet and a lot of reminders. People forget, and I chase them every Friday.',
  ].join('\n');
  const QUOTE1 = 'I spend every Friday chasing receipts from the field team.';

  it('Orb logs each transcript, Scout reads and quotes it verbatim and counts people, Critic flags the leading question', async () => {
    const canvas = await wire.orb.canvas.create({
      prompt: 'Field expenses: customer discovery',
      template: 'customer-discovery',
      intake: {
        topic: 'Field expenses',
        segment: 'Operations managers at logistics firms',
        hypotheses: ['The problem is weekly'],
      },
      depth: 'standard',
    });
    const frames = framesOf(canvas.id);
    const goals = frameId(frames, 'Research goals');
    const interviews = frameId(frames, 'Interview log');
    const evidence = frameId(frames, 'Quotes & evidence');
    const themes = frameId(frames, 'Themes & affinity');
    const bias = frameId(frames, 'Gaps & bias check');
    // The user drops two transcripts before Orb starts: they land in the first frame's free room, Research goals.
    const added: string[] = [];
    for (const [i, body] of [T1, T2].entries()) {
      const res = await wire.orb.board.command(canvas.id, {
        type: 'card.added',
        card: {
          type: 'doc',
          frameId: goals,
          x: 40 + i * 300,
          y: 560,
          w: 280,
          h: 200,
          data: { title: `Interview ${i + 1} transcript`, body },
        } as any,
      });
      added.push((res.events[0]!.data as { card: { id: string } }).card.id);
    }
    const cards = cardsOf(canvas.id);
    const interviewsDb = dbCard(cards, 'Interviews');
    const evidenceDb = dbCard(cards, 'Evidence log');
    const themesDb = dbCard(cards, 'Themes');
    const base = byAgent.orb.length;
    const held = {
      holdUntil: () =>
        expect
          .poll(() => byAgent.orb[base + 2]?.completed === true, { timeout: 30_000, interval: 20 })
          .toBe(true),
      firstDelayMs: 200,
    } as const;

    scripts.orb.push(
      // Playbook step 1: log one Interviews row per transcript.
      {
        toolCalls: [
          { id: 'call_o_map', name: 'board_map', arguments: { frameId: goals } },
          {
            id: 'call_o_log',
            name: 'upsert_rows',
            arguments: {
              cardId: interviewsDb.id,
              key: 'Interview',
              rows: [
                {
                  values: {
                    Interview: 'I-01',
                    Participant: 'Ops manager, 200 staff',
                    Segment: 'Logistics',
                    Relationship: 'Stranger',
                    Transcript: 'Interview 1 transcript',
                    Fit: 5,
                  },
                },
                {
                  values: {
                    Interview: 'I-02',
                    Participant: 'Ops lead, 80 staff',
                    Segment: 'Logistics',
                    Relationship: 'Warm intro',
                    Transcript: 'Interview 2 transcript',
                    Fit: 4,
                  },
                },
              ],
            },
          },
        ],
      },
      // Then delegate.
      {
        toolCalls: [
          delegate('call_d_scout', 'scout', [interviews, evidence, themes], 'Read every transcript.'),
          delegate('call_d_critic', 'critic', [bias], 'Check the research quality.'),
          delegate('call_d_builder', 'builder', [themes], 'The themes chart.'),
        ],
      },
      { text: 'The team is on it.' },
    );
    scripts.scout.push(
      {
        toolCalls: [
          {
            id: 'call_s_p1',
            name: 'report_progress',
            arguments: { status: 'Reading the transcripts', frameId: interviews },
          },
        ],
        ...held,
      },
      {
        toolCalls: [
          { id: 'call_s_read1', name: 'read_card', arguments: { cardId: added[0] } },
          { id: 'call_s_read2', name: 'read_card', arguments: { cardId: added[1] } },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_quote',
            name: 'place_card',
            arguments: {
              type: 'quote',
              frameId: evidence,
              title: 'I-01',
              body: QUOTE1,
              sourceCardId: added[0],
              why: 'I-01: a pain, intensity 4.',
            },
          },
          {
            id: 'call_s_ev',
            name: 'upsert_rows',
            arguments: {
              cardId: evidenceDb.id,
              key: 'Quote',
              rows: [
                {
                  values: {
                    Quote: QUOTE1,
                    Interview: 'I-01',
                    Type: 'Pain',
                    Theme: 'Chasing receipts',
                    Intensity: 4,
                    Segment: 'Logistics',
                  },
                },
                {
                  values: {
                    Quote: 'People forget, and I chase them every Friday.',
                    Interview: 'I-02',
                    Type: 'Pain',
                    Theme: 'Chasing receipts',
                    Intensity: 3,
                    Segment: 'Logistics',
                  },
                },
              ],
            },
          },
          {
            id: 'call_s_theme',
            name: 'upsert_rows',
            arguments: {
              cardId: themesDb.id,
              key: 'Theme',
              rows: [
                {
                  values: {
                    Theme: 'Chasing receipts',
                    Description: 'Weekly manual chasing',
                    People: 2,
                    Mentions: 2,
                    'Avg intensity': 3.5,
                    Type: 'Pain',
                    'Best quote': QUOTE1,
                  },
                },
              ],
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_done',
            name: 'send_message',
            arguments: { about: 'done', message: 'Both transcripts read; one theme from two people.' },
          },
        ],
      },
      { text: 'Done.' },
    );
    scripts.builder.push(
      {
        toolCalls: [
          {
            id: 'call_b_p1',
            name: 'report_progress',
            arguments: { status: 'Themes chart', frameId: themes },
          },
        ],
        ...held,
      },
      {
        toolCalls: [
          {
            id: 'call_b_chart',
            name: 'place_card',
            arguments: {
              type: 'chart',
              frameId: themes,
              title: 'Themes by number of people',
              mark: 'bar',
              x: 'Theme',
              y: 'People',
              datasetId: dsIdOf(themesDb),
              why: 'Bound to Themes.',
            },
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
            arguments: { status: 'Leading questions', frameId: bias },
          },
        ],
        ...held,
      },
      { toolCalls: [{ id: 'call_c_read', name: 'read_card', arguments: { cardId: added[0] } }] },
      {
        toolCalls: [
          {
            id: 'call_c_risk',
            name: 'place_card',
            arguments: {
              type: 'risk',
              frameId: bias,
              title: 'RF02 raised: a leading question in I-01',
              body: 'The interviewer asked: "Would you pay for something that fixes it, because it sounds like a great idea?"',
              why: 'A leading question inflates willingness to pay.',
            },
          },
        ],
      },
      { text: 'Done.' },
    );

    await wire.orb.canvas.start(canvas.id);

    // Orb's playbook said to log every transcript, and the transcripts it listed are the ones dropped.
    const orbFirst = await first('orb', 'Field expenses', 'Field expenses');
    expect(allText(orbFirst)).toContain('one Interviews row per transcript');
    const orbMap = await waitFor(() => byAgent.orb.find((r) => 'call_o_map' in toolResults(r)));
    expect(toolResults(orbMap).call_o_map).toContain('Interview 1 transcript');
    const log = datasetOf(canvas.id, dsIdOf(interviewsDb));
    expect(log.rows.map((r) => [cell(log, r, 'Interview'), cell(log, r, 'Transcript')])).toEqual([
      ['I-01', 'Interview 1 transcript'],
      ['I-02', 'Interview 2 transcript'],
    ]);
    expect(log.rows[0]).toMatchObject({ by: 'orb' });

    // Scout read both transcripts in full (the tool result holds the text), then quoted verbatim.
    const scoutRead = await waitFor(() => byAgent.scout.find((r) => 'call_s_read2' in toolResults(r)));
    expect(toolResults(scoutRead).call_s_read1).toContain('chasing receipts from the field team');
    expect(toolResults(scoutRead).call_s_read2).toContain('A shared spreadsheet');
    const quote = await waitFor(() =>
      cardsOf(canvas.id).find((c) => c.type === 'quote' && c.frameId === evidence),
    );
    expect(quote.provenance).toMatchObject({ kind: 'agent', agent: 'scout' });
    const qd = quote.data as { body: string; sourceCardId: string };
    expect(T1).toContain(qd.body); // verbatim: a substring of the transcript
    expect(qd.sourceCardId).toBe(added[0]);
    await expect
      .poll(
        () =>
          datasetOf(canvas.id, dsIdOf(evidenceDb)).rows.map((r) =>
            cell(datasetOf(canvas.id, dsIdOf(evidenceDb)), r, 'Interview'),
          ),
        { timeout: 15000 },
      )
      .toEqual(['I-01', 'I-02']);
    const ev = datasetOf(canvas.id, dsIdOf(evidenceDb));
    expect(ev.rows.map((r) => cell(ev, r, 'Interview'))).toEqual(['I-01', 'I-02']);
    await expect.poll(() => datasetOf(canvas.id, dsIdOf(themesDb)).rows.length, { timeout: 15000 }).toBe(1);
    const th = datasetOf(canvas.id, dsIdOf(themesDb));
    expect(cell(th, th.rows[0]!, 'People')).toBe(2); // people, not mentions
    expect(th.rows[0]).toMatchObject({ by: 'scout' });

    // Builder bound the themes chart; Critic flagged the leading question with the quoted turn.
    const chart = await waitFor(() =>
      cardsOf(canvas.id).find((c) => c.type === 'chart' && c.provenance.kind === 'agent'),
    );
    expect(ChartData.parse(chart.data).source).toEqual({ kind: 'dataset', datasetId: dsIdOf(themesDb) });
    const risk = await waitFor(() => mine(cardsOf(canvas.id), 'critic').find((c) => c.type === 'risk'));
    expect(risk.frameId).toBe(bias);
    expect((risk.data as { body: string }).body).toContain('Would you pay for something');
    // Scout's own playbook told it to read every transcript to the end.
    expect(allText(await first('scout', 'Your playbook, in this order:', 'Field expenses'))).toContain(
      'Read every transcript',
    );
    expect(spec.plan.scout[0]!.id).toBe('read');
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------------------------
// D. fundraising prep: Orb tags claimed against verified, Scout builds the comps and the investor list
// ---------------------------------------------------------------------------------------------------------------

describe('D. fundraising prep: claimed vs verified, comparable rounds, investor targets', () => {
  it('Orb tags the deck numbers Claimed and a reconciled one Verified; Scout consolidates comps and investors', async () => {
    const canvas = await wire.orb.canvas.create({
      prompt: 'Globex: fundraising prep',
      template: 'fundraising-prep',
      intake: {
        company: 'Globex',
        website: 'https://globex.example.com',
        stage: 'Seed',
        raise: '$4M',
        sector: 'Logistics',
      },
      depth: 'standard',
    });
    const frames = framesOf(canvas.id);
    const cards = cardsOf(canvas.id);
    const traction = frameId(frames, 'Traction & metrics');
    const comps = frameId(frames, 'Comparable rounds & valuation');
    const investors = frameId(frames, 'Investor targets');
    const kpis = dbCard(cards, 'KPIs');
    const rounds = dbCard(cards, 'Comparable rounds');
    const targets = dbCard(cards, 'Investor targets');
    const base = byAgent.orb.length;
    const held = {
      holdUntil: () =>
        expect
          .poll(() => byAgent.orb[base + 1]?.completed === true, { timeout: 30_000, interval: 20 })
          .toBe(true),
      firstDelayMs: 200,
    } as const;

    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_o_kpis',
            name: 'upsert_rows',
            arguments: {
              cardId: kpis.id,
              key: 'Metric',
              rows: [
                {
                  values: {
                    Metric: 'ARR',
                    Value: 480000,
                    Period: '2026-09',
                    Basis: 'Claimed',
                    Source: 'pitch deck',
                    'Matches the deck': 'Yes',
                  },
                },
                {
                  values: {
                    Metric: 'Monthly burn',
                    Value: 42000,
                    Period: '2026-09',
                    Basis: 'Verified',
                    Source: 'financial model',
                    'Matches the deck': 'No',
                    Note: 'The deck says 35000.',
                  },
                },
              ],
            },
          },
          delegate('call_d_scout', 'scout', [comps, investors], 'Comparable rounds and the investor list.'),
        ],
      },
      { text: 'Scout is on it.' },
    );
    scripts.scout.push(
      {
        toolCalls: [
          {
            id: 'call_s_p1',
            name: 'report_progress',
            arguments: { status: 'Comparable rounds', frameId: comps },
          },
        ],
        ...held,
      },
      {
        toolCalls: [
          {
            id: 'call_s_find',
            name: 'find_entities',
            arguments: {
              objective: 'Seed rounds of logistics software companies in the last 24 months',
              match_limit: 5,
              frameId: comps,
              wait: true,
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_rounds',
            name: 'upsert_rows',
            arguments: {
              cardId: rounds.id,
              key: 'Company',
              rows: [
                {
                  values: {
                    Company: 'FreightCo',
                    Round: 'Seed',
                    Date: '2026-03-01',
                    Amount: 4000000,
                    Valuation: 20000000,
                    'Revenue multiple': 25,
                    'Why comparable': 'Same stage and sector',
                    Source: 'https://news.example/freightco',
                  },
                },
                {
                  values: {
                    Company: 'HaulIQ',
                    Round: 'Seed',
                    Date: '2026-05-01',
                    Amount: 3000000,
                    Valuation: 15000000,
                    'Revenue multiple': 20,
                    'Why comparable': 'Same stage and sector',
                    Source: 'https://news.example/hauliq',
                  },
                },
              ],
            },
          },
          {
            id: 'call_s_targets',
            name: 'upsert_rows',
            arguments: {
              cardId: targets.id,
              key: 'Investor',
              rows: [
                {
                  values: {
                    Investor: 'Northline Ventures',
                    Type: 'Seed fund',
                    'Stage fit': 5,
                    'Sector fit': 4,
                    'Recent relevant deals': 'FreightCo seed',
                    'Warm path': 'Via a mutual founder',
                    Status: 'Researching',
                    Source: 'https://northline.example',
                  },
                },
              ],
            },
          },
        ],
      },
      { text: 'Done.' },
    );

    await wire.orb.canvas.start(canvas.id);
    const scoutDone = await waitFor(() => byAgent.scout.find((r) => 'call_s_targets' in toolResults(r)));
    expect(JSON.parse(toolResults(scoutDone).call_s_find!)).toMatchObject({ status: 'completed' });

    const k = datasetOf(canvas.id, dsIdOf(kpis));
    expect(
      k.rows.map((r) => [cell(k, r, 'Metric'), cell(k, r, 'Basis'), cell(k, r, 'Matches the deck')]),
    ).toEqual([
      ['ARR', 'Claimed', 'Yes'],
      ['Monthly burn', 'Verified', 'No'],
    ]);
    expect(k.rows[0]).toMatchObject({ by: 'orb' });
    const r = datasetOf(canvas.id, dsIdOf(rounds));
    expect(r.rows.map((x) => cell(r, x, 'Company'))).toEqual(['FreightCo', 'HaulIQ']);
    expect(r.rows[0]).toMatchObject({ by: 'scout' });
    const t = datasetOf(canvas.id, dsIdOf(targets));
    expect(cell(t, t.rows[0]!, 'Stage fit')).toBe(5);
    // find_entities filled a database card of its own in the comparable-rounds frame.
    expect(
      cardsOf(canvas.id).filter((c) => c.frameId === comps && c.type === 'research').length,
    ).toBeGreaterThan(0);
    expect(traction).toBeTruthy();
    // Scout's assignment told it to leave out private contact details.
    expect(allText(await first('scout', 'Your playbook, in this order:', 'Globex'))).toContain(
      'no private contact details',
    );
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------------------------
// E. the cost guard on the Quick tier
// ---------------------------------------------------------------------------------------------------------------

describe('E. pricing research, Quick tier: the cost guard', () => {
  it('refuses deep_research, find_entities and batch_enrich before anything is placed or spent', async () => {
    const quick = await wire.orb.canvas.create({
      prompt: 'Initech: pricing research',
      template: 'pricing-research',
      intake: { product: 'Initech Suite' },
      depth: 'quick',
    });
    expect(metaOf(quick.id)).toMatchObject({ depth: 'quick' });
    const runs = parallel.count('POST', '/v1/tasks/runs');
    const findalls = parallel.count('POST', '/v1beta/findall/runs');
    const before = cardsOf(quick.id).length;
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_q_deep',
            name: 'deep_research',
            arguments: { input: 'Pricing of suites', processor: 'core' },
          },
          {
            id: 'call_q_find',
            name: 'find_entities',
            arguments: { objective: 'Comparable suites', wait: true },
          },
          {
            id: 'call_q_batch',
            name: 'batch_enrich',
            arguments: {
              rows: [{ name: 'Rival' }],
              output_json_schema: {
                type: 'object',
                properties: { price: { type: 'string', description: 'Entry price' } },
              },
            },
          },
          {
            id: 'call_q_answer',
            name: 'web_answer',
            arguments: { question: 'What does Initech Suite cost?' },
          },
        ],
      },
      { text: 'Quick scan only.' },
    );
    await wire.orb.chat.send(quick.id, { text: 'Research the pricing.' });
    const after = await waitFor(() => byAgent.orb.find((r) => 'call_q_batch' in toolResults(r)));
    const out = toolResults(after);
    for (const id of ['call_q_deep', 'call_q_find', 'call_q_batch'])
      expect(JSON.parse(out[id]!), id).toMatchObject({
        refused: true,
        message: expect.stringMatching(/Quick scan depth tier.*does not allow/),
      });
    expect(JSON.parse(out.call_q_answer!)).not.toHaveProperty('refused');
    expect(parallel.count('POST', '/v1/tasks/runs')).toBe(runs);
    expect(parallel.count('POST', '/v1beta/findall/runs')).toBe(findalls);
    expect(cardsOf(quick.id).length).toBe(before);
  }, 60_000);
});
