/**
 * P6.12 contract test: the investing and finance templates run end to end on a REAL sidecar (mock LLM scripted per
 * agent, mock Parallel), one scripted run per template. Groups:
 *   - public markets: Public equity;
 *   - private markets and sourcing: Market map, M&A screening;
 *   - ongoing and manager diligence: Portfolio monitoring, Fund / LP diligence.
 * Each agent's model script FOLLOWS ITS PLAYBOOK, and the test proves the playbook is what reached the model and what the
 * scripted tool calls did to the board:
 *   - the new-canvas turn carries Orb's playbook (intake, tier, rubric, memo, deck); each child's first assignment carries
 *     its own (steps in order, its frames with real ids, target mix, the ticked signed-in source), never the persona;
 *   - Scout upserts the template's own databases, runs find_entities and a core deep_research on the Standard tier, and is
 *     refused pro (tier gate);
 *   - Critic raises a red flag as a Risk card, clears another as an Insight citing two cards, turns a gap into a Question
 *     card, and cannot change a database;
 *   - Builder binds a chart to a database of the template;
 *   - Orb fills a metric seed, the scorecard (rubric weights kept) and proposes on the decision, which stays open;
 *   - on the Quick tier the costly Parallel tools are refused before anything is placed or spent;
 *   - the v1 "stocks" id opens the public-equity template.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  Dataset,
  DatabaseData,
  ChartData,
  specOf,
  fillTokens,
  type TemplateId,
  type BoardEvent,
  type CanvasMeta,
  type Card,
  type Frame,
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
/** The tool messages answering the assistant message before the last one: the result of the previous step's calls. */
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
afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
  await parallel?.close();
});
// These fixtures deliberately populate only a sample of each playbook. Stop their remaining research before
// sharing the role scripts with the next scenario; completion checking can now extend the original turn.
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
/** The folded cards of a board (added, then every patch applied). */
function cardsOf(id: string): Card[] {
  const cards = new Map<string, Card>();
  for (const e of boardEvents(id)) {
    const d = e.data as any;
    if (e.type === 'card.added') cards.set(d.card.id, d.card);
    if (e.type === 'card.updated') {
      const c = cards.get(d.id);
      if (c) cards.set(d.id, { ...c, ...d.patch, data: d.patch.data ?? c.data });
    }
    if (e.type === 'card.moved')
      for (const m of d.moves) if (cards.has(m.id)) cards.set(m.id, { ...cards.get(m.id)!, x: m.x, y: m.y });
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

/** What each template's scripted run does: the databases Scout fills, the chart Builder binds, what Orb fills. */
type Case = {
  id: TemplateId;
  intake: Record<string, string | string[]>;
  /** The database of the discovery frame: find_entities adds its own database card to that frame. */
  discoveryFrame: string;
  /** Scout's playbook upserts (database name, key column, rows of values). */
  rows: { db: string; key: string; rows: Record<string, string | number | boolean>[] }[];
  /** Builder's chart (a database of the template, by name; frame title). */
  chart: { db: string; frame: string; mark: 'bar' | 'line'; x: string; y: string };
  /** Orb's metric seed to fill and the scorecard title. */
  metric: { title: string; value: string };
  scorecard: string;
  decision: string;
  risksFrame: string;
  questionsFrame: string;
  flag: { raised: string; cleared: string };
};

const CASES: Case[] = [
  {
    id: 'public-equity',
    intake: {
      company: 'Costco Wholesale',
      ticker: 'COST',
      exchange: 'Nasdaq',
      position: 'Considering a new position',
      horizon: '3 to 5 years',
      thesis: 'Membership economics compound',
      concerns: 'Valuation',
      peers: 'Walmart, Target',
      sites: ['seekingalpha.com'],
    },
    discoveryFrame: 'Industry & competition',
    rows: [
      {
        db: 'Peers',
        key: 'Name',
        rows: [
          {
            Name: 'Walmart',
            Ticker: 'WMT',
            'EV / EBITDA': 14.5,
            Relation: 'Direct peer',
            Source: 'https://walmart.example/ir',
          },
          {
            Name: 'Target',
            Ticker: 'TGT',
            'EV / EBITDA': 9.1,
            Relation: 'Direct peer',
            Source: 'https://target.example/ir',
          },
        ],
      },
      {
        db: 'Financials',
        key: 'Period',
        rows: [
          {
            Period: 'FY2025',
            Revenue: 254_000_000_000,
            'Free cash flow': 6_000_000_000,
            Basis: 'GAAP',
            Source: 'https://costco.example/10k',
          },
        ],
      },
    ],
    chart: { db: 'Segments', frame: 'Business & segments', mark: 'bar', x: 'Segment', y: 'Revenue' },
    metric: { title: 'Share price', value: '$100.00 (as of 2026-10-14)' },
    scorecard: 'Scorecard',
    decision: 'Recommendation on',
    risksFrame: 'Risks & red flags',
    questionsFrame: 'Open questions',
    flag: {
      raised: 'RF04 raised: free cash flow trails net income',
      cleared: 'RF01 cleared: no restatement or auditor change',
    },
  },
  {
    id: 'market-map',
    intake: {
      market: 'Warehouse robotics',
      purpose: 'Investment sourcing',
      scope: 'Hardware and software, no consumer robots',
      segments: 'Picking, Sorting',
      players: 'Rival One, Rival Two',
      thesis: 'Labour shortages pull robots into every DC',
      sites: ['crunchbase.com'],
    },
    discoveryFrame: 'Companies',
    rows: [
      {
        db: 'Companies',
        key: 'Name',
        rows: [
          {
            Name: 'Rival One',
            URL: 'https://rival1.example',
            Segment: 'Picking',
            Stage: 'Series A',
            'Total funding': 12_000_000,
            Status: 'Active',
            Source: 'https://rival1.example',
          },
          {
            Name: 'Rival Two',
            URL: 'https://rival2.example',
            Segment: 'Sorting',
            Stage: 'Series B',
            'Total funding': 40_000_000,
            Status: 'Acquired',
            Source: 'https://rival2.example',
          },
        ],
      },
      {
        db: 'Funding rounds',
        key: 'Company',
        rows: [
          {
            Company: 'Rival One',
            Round: 'Series A',
            Year: '2025',
            Amount: 12_000_000,
            Segment: 'Picking',
            Source: 'https://news.example/rival1',
          },
        ],
      },
    ],
    chart: { db: 'Segments', frame: 'Taxonomy', mark: 'bar', x: 'Segment', y: 'Companies' },
    metric: { title: 'Companies mapped', value: '34' },
    scorecard: 'Market scorecard',
    decision: 'Where to play in',
    risksFrame: 'Caveats & map quality',
    questionsFrame: 'Open questions',
    flag: {
      raised: 'RF03 raised: no shut-down companies in the map',
      cleared: 'RF04 cleared: no duplicate URLs',
    },
  },
  {
    id: 'portfolio-monitor',
    intake: {
      company: 'Acme Robotics',
      website: 'https://acme.com',
      holding: 'Series A lead, 12%',
      involvement: 'Board seat',
      cadence: 'Monthly',
      thesis: 'Robots that pay back in a year',
      watch: 'runway, key hire',
      competitors: 'Rival One',
      sites: ['linkedin.com'],
    },
    discoveryFrame: 'Competitors',
    rows: [
      {
        db: 'Signal log',
        key: 'Headline',
        rows: [
          {
            Type: 'News',
            Headline: 'Acme announces a layoff of 10%',
            Impact: 'Negative',
            'Action needed': true,
            Source: 'https://news.example/acme-layoff',
          },
        ],
      },
      {
        db: 'KPI tracker',
        key: 'Metric',
        rows: [
          {
            Metric: 'ARR',
            Period: '2026-09',
            Plan: 5_000_000,
            Actual: 4_400_000,
            Basis: 'Reported',
            Source: 'https://acme.example/update',
          },
        ],
      },
    ],
    chart: { db: 'KPI tracker', frame: 'KPIs against plan', mark: 'line', x: 'Period', y: 'Actual' },
    metric: { title: 'Runway', value: '14 months' },
    scorecard: 'Health scorecard',
    decision: 'Status call',
    risksFrame: 'Risks & red flags',
    questionsFrame: 'Next check-in',
    flag: { raised: 'RF04 raised: layoffs announced', cleared: 'RF07 cleared: no litigation or incident' },
  },
  {
    id: 'ma-screen',
    intake: {
      acquirer: 'Globex Software',
      strategy: 'Product or technology tuck-in',
      sector: 'Warehouse robotics software',
      size_range: '$5M to $50M revenue',
      budget: '$250M EV',
      criteria: 'Recurring revenue above 80%',
      known_targets: 'Rival One',
      excluded: 'Rival Nine',
      sites: ['pitchbook.com'],
    },
    discoveryFrame: 'Target universe',
    rows: [
      {
        db: 'Target universe',
        key: 'Name',
        rows: [
          {
            Name: 'Rival One',
            URL: 'https://rival1.example',
            Ownership: 'Venture-backed',
            Fit: 4,
            Status: 'Shortlisted',
            Reason: 'Meets the recurring-revenue criterion',
            Source: 'https://rival1.example',
          },
          {
            Name: 'Rival Three',
            URL: 'https://rival3.example',
            Ownership: 'PE-owned',
            Fit: 2,
            Status: 'Rejected',
            Reason: 'Above the size range',
            Source: 'https://rival3.example',
          },
        ],
      },
      {
        db: 'Precedent transactions',
        key: 'Target',
        rows: [
          {
            Acquirer: 'Big Co',
            Target: 'Old Rival',
            EV: 120_000_000,
            'EV / revenue': 6.5,
            Sector: 'Warehouse software',
            Source: 'https://news.example/deal',
          },
        ],
      },
    ],
    chart: { db: 'Target universe', frame: 'Target universe', mark: 'bar', x: 'Ownership', y: 'Headcount' },
    metric: { title: 'Targets screened', value: '41' },
    scorecard: 'Target scorecard',
    decision: 'Recommendation for',
    risksFrame: 'Risks & red flags',
    questionsFrame: 'Approach & next steps',
    flag: {
      raised: 'RF01 raised (Rival One): one customer is above 20% of revenue',
      cleared: 'RF04 cleared (Rival One): no litigation found',
    },
  },
  {
    id: 'fund-dd',
    intake: {
      fund: 'Acme Ventures Fund IV',
      manager: 'Acme Ventures',
      website: 'https://acmeventures.example',
      strategy: 'Venture capital',
      vintage: '2026',
      fund_size: '$400M',
      commitment: '$15M',
      thesis: 'A seed specialist with a clear edge',
      peers: 'Peer Capital',
      sites: ['pitchbook.com'],
    },
    discoveryFrame: 'Peers & benchmarks',
    rows: [
      {
        db: 'Investment team',
        key: 'Name',
        rows: [
          {
            Name: 'Grace Hopper',
            Role: 'Managing partner',
            Status: 'Active',
            'Tenure (years)': 11,
            Source: 'https://acmeventures.example/team',
          },
        ],
      },
      {
        db: 'Fund performance',
        key: 'Fund',
        rows: [
          {
            Fund: 'Fund III',
            Vintage: 2019,
            'Net IRR': 18,
            TVPI: 2.1,
            DPI: 0.8,
            'Benchmark quartile': 'Top',
            Basis: 'Verified',
            Source: 'https://pension.example/report',
          },
        ],
      },
    ],
    chart: { db: 'Fund performance', frame: 'Track record', mark: 'bar', x: 'Fund', y: 'TVPI' },
    metric: { title: 'Last fund TVPI', value: '2.1x' },
    scorecard: 'Scorecard',
    decision: 'Recommendation on',
    risksFrame: 'Risks & red flags',
    questionsFrame: 'Open questions',
    flag: {
      raised: 'RF02 raised: two deals drive most of the value',
      cleared: 'RF10 cleared: no regulatory action on file',
    },
  },
];

const reset = () => {
  for (const w of ['orb', 'scout', 'critic', 'builder'] as const) {
    scripts[w].length = 0;
    byAgent[w].length = 0;
  }
};

describe.each(CASES)('$id: the agents follow the playbook (Standard tier)', (c) => {
  const spec = specOf(c.id)!;
  const subject = String(c.intake[spec.inputs[0]!.id]);
  let canvas: CanvasMeta;
  let frames: Frame[];

  it('starts from the intake with every frame, seed and database', async () => {
    reset();
    canvas = await wire.orb.canvas.create({
      prompt: `${subject}: ${spec.label}`,
      template: c.id,
      intake: c.intake,
      depth: 'standard',
    });
    frames = framesOf(canvas.id);
    expect(frames.map((f) => f.title)).toEqual(spec.frames.map((f) => f.title));
    expect(cardsOf(canvas.id)).toHaveLength(spec.frames.reduce((n, f) => n + f.seeds.length, 0));
    expect(metaOf(canvas.id)).toMatchObject({
      template: c.id,
      depth: 'standard',
      intake: { [spec.inputs[0]!.id]: subject },
    });
    expect(
      spec.databases
        .map((d) => d.name)
        .every((n) =>
          cardsOf(canvas.id).some((k) => k.type === 'database' && (k.data as { title: string }).title === n),
        ),
    ).toBe(true);
    expect(byAgent.orb).toHaveLength(0); // start was not asked for
  });

  it('Orb and its team run the playbook (scripted): read, delegate, fill, score', async () => {
    const cards = cardsOf(canvas.id);
    const dbCard = (name: string) =>
      cards.find((k) => k.type === 'database' && (k.data as { title: string }).title === name)!;
    const scoutFrames = spec.frames
      .filter((f) => f.owners.includes('scout'))
      .map((f) => frameId(frames, f.title));
    const builderFrame = frameId(frames, c.chart.frame);
    const risks = frameId(frames, c.risksFrame);
    const questions = frameId(frames, c.questionsFrame);
    const discovery = frameId(frames, c.discoveryFrame);
    const taskRuns0 = parallel.count('POST', '/v1/tasks/runs');

    const orbTurnEnded = () =>
      expect.poll(() => byAgent.orb[1]?.completed === true, { timeout: 30_000, interval: 20 }).toBe(true);
    const held = { holdUntil: orbTurnEnded, firstDelayMs: 200 } as const;

    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_d_scout',
            name: 'delegate',
            arguments: {
              role: 'scout',
              frameIds: scoutFrames,
              instruction: 'Start from the intake, then discovery and enrichment.',
            },
          },
          {
            id: 'call_d_builder',
            name: 'delegate',
            arguments: { role: 'builder', frameIds: [builderFrame], instruction: 'The charts.' },
          },
          {
            id: 'call_d_critic',
            name: 'delegate',
            arguments: {
              role: 'critic',
              frameIds: [risks, questions],
              instruction: 'Work through the red-flag checklist.',
            },
          },
        ],
      },
      { text: 'The team is on it.' },
    );

    const chartDb = dbCard(c.chart.db);
    const upserts = c.rows.map((r, i) => ({
      id: `call_s_rows_${i}`,
      name: 'upsert_rows',
      arguments: {
        cardId: dbCard(r.db).id,
        key: r.key,
        rows: r.rows.map((values) => ({ values })),
      },
    }));
    scripts.scout.push(
      {
        toolCalls: [
          {
            id: 'call_s_p1',
            name: 'report_progress',
            arguments: { status: 'Starting', frameId: scoutFrames[0] },
          },
        ],
        ...held,
      },
      { toolCalls: upserts },
      {
        toolCalls: [
          {
            id: 'call_s_find',
            name: 'find_entities',
            arguments: { objective: `${subject} peers`, match_limit: 5, frameId: discovery, wait: true },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_deep_pro',
            name: 'deep_research',
            arguments: { input: `${subject} market`, processor: 'pro', frameId: discovery },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_deep_core',
            name: 'deep_research',
            arguments: {
              input: `${subject} market`,
              processor: 'core',
              title: `${subject} research`,
              frameId: discovery,
              wait: true,
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_done',
            name: 'send_message',
            arguments: { about: 'done', message: 'The databases are filled.' },
          },
        ],
      },
      { text: 'Done.' },
    );
    scripts.builder.push(
      {
        toolCalls: [
          { id: 'call_b_p1', name: 'report_progress', arguments: { status: 'Chart', frameId: builderFrame } },
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
              frameId: builderFrame,
              title: `${c.chart.db} chart`,
              mark: c.chart.mark,
              x: c.chart.x,
              y: c.chart.y,
              datasetId: DatabaseData.parse(chartDb.data).datasetId,
              why: 'Built from the database.',
            },
          },
        ],
      },
      {
        toolCalls: [
          { id: 'call_b_done', name: 'send_message', arguments: { about: 'done', message: 'Chart placed.' } },
        ],
      },
      { text: 'Done.' },
    );
    const checklist = cards.find((k) => k.type === 'checklist' && k.frameId === risks)!;
    scripts.critic.push(
      {
        toolCalls: [
          { id: 'call_c_p1', name: 'report_progress', arguments: { status: 'Red flags', frameId: risks } },
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
              frameId: risks,
              title: c.flag.raised,
              body: 'One source states it; no second source.',
              why: 'Raised with evidence.',
            },
          },
          {
            id: 'call_c_cleared',
            name: 'place_card',
            arguments: {
              type: 'insight',
              frameId: risks,
              title: c.flag.cleared,
              body: 'The sources show nothing against it.',
              citations: [checklist.id, dbCard(c.rows[0]!.db).id],
              why: 'Cleared with a source.',
            },
          },
          {
            id: 'call_c_q',
            name: 'place_card',
            arguments: {
              type: 'question',
              frameId: questions,
              title: 'What is the second source for the headline number?',
              body: 'A gap behind the raised flag.',
              why: 'A gap becomes a question.',
            },
          },
          {
            id: 'call_c_upsert',
            name: 'upsert_rows',
            arguments: { cardId: dbCard(c.rows[0]!.db).id, rows: [{ values: { [c.rows[0]!.key]: 'x' } }] },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_c_done',
            name: 'send_message',
            arguments: { about: 'done', message: 'One raised, one cleared, one question.' },
          },
        ],
      },
      { text: 'Done.' },
    );

    await wire.orb.canvas.start(canvas.id);

    // 1. Orb's new-canvas turn carries its playbook: the intake, the tier, the rubric, the memo and the deck.
    const orbFirst = await waitFor(() => byAgent.orb[0]);
    const orbText = allText(orbFirst);
    expect(orbText).toContain(`The ${spec.label} playbook`);
    expect(orbText).toContain(`- ${spec.inputs[0]!.label}: ${subject}`);
    expect(orbText).toContain('Depth: Standard');
    for (const d of spec.rubric) expect(orbText).toContain(`${d.name} (${d.weight}%)`);
    expect(orbText).toContain(fillTokens(spec.output.memoTitle, c.intake as never));
    expect(orbText).toContain(`The deck format is ${spec.output.deckFormat}`);
    expect(orbText).toContain('The frames hold seed cards');
    for (const f of frames) expect(orbText).toContain(`[${f.id}]`);
    expect(systemOf(orbFirst)).not.toMatch(/playbook/i);

    // 2. Each child's FIRST assignment carries its playbook, in order; its persona does not.
    const scoutFirst = await waitFor(() => byAgent.scout[0]);
    const scoutText = allText(scoutFirst);
    expect(scoutText).toContain('Your playbook, in this order:');
    const scoutFrame = spec.frames.find((f) => f.owners.includes('scout'))!;
    expect(scoutText).toContain(`"${scoutFrame.title}" [${frameId(frames, scoutFrame.title)}]`);
    expect(scoutText).toContain('Target mix:');
    expect(scoutText).toContain(c.intake.sites![0]); // the ticked signed-in source
    expect(scoutText).not.toContain('The red-flag checklist');
    const stepAt = spec.plan.scout.slice(0, 4).map((s) => scoutText.indexOf(s.text.slice(0, 30)));
    expect(stepAt.every((n) => n >= 0)).toBe(true);
    expect(stepAt).toEqual([...stepAt].sort((a, b) => a - b));
    expect(systemOf(scoutFirst)).not.toMatch(/playbook/i);
    const criticText = allText(await waitFor(() => byAgent.critic[0]));
    for (const f of spec.redFlags) expect(criticText).toContain(f.id);
    expect(criticText).toContain(`"${c.risksFrame}" [${risks}]`);
    expect(allText(await waitFor(() => byAgent.builder[0]))).toContain(
      `"${c.chart.frame}" [${builderFrame}]`,
    );

    // 3. Scout's playbook calls did what the playbook says.
    const scoutDone = await waitFor(() => byAgent.scout.find((r) => 'call_s_deep_core' in toolResults(r)));
    const results = toolResults(scoutDone);
    for (const [i, r] of c.rows.entries()) {
      const ds = datasetOf(canvas.id, DatabaseData.parse(dbCard(r.db).data).datasetId);
      const keyCol = ds.columns.find((k) => k.name === r.key)!.id;
      expect(
        ds.rows.map((row) => row.cells[keyCol]),
        `${r.db} rows`,
      ).toEqual(r.rows.map((v) => v[r.key]));
      expect(
        ds.rows.every((row) => row.by === 'scout'),
        `${r.db} by`,
      ).toBe(true);
      expect(JSON.parse(results[`call_s_rows_${i}`]!), `${r.db} result`).not.toHaveProperty('error');
      // The typed columns took their values (enum, number, boolean).
      for (const [name, value] of Object.entries(r.rows[0]!)) {
        const col = ds.columns.find((k) => k.name === name)!;
        expect(ds.rows[0]!.cells[col.id], `${r.db}.${name}`).toBe(value);
      }
    }
    expect(JSON.parse(results.call_s_find!)).toMatchObject({ status: 'completed' });
    const inFrame = cardsOf(canvas.id).filter((k) => k.frameId === discovery);
    expect(inFrame.some((k) => k.type === 'research')).toBe(true);
    expect(inFrame.filter((k) => k.type === 'database').length).toBeGreaterThanOrEqual(2); // the template's + the run's
    expect(JSON.parse(results.call_s_deep_pro!)).toMatchObject({
      refused: true,
      message: expect.stringMatching(/allows the processors lite, base, core for deep_research, not pro/),
    });
    expect(JSON.parse(results.call_s_deep_core!)).toMatchObject({ status: 'completed' });
    expect(parallel.count('POST', '/v1/tasks/runs') - taskRuns0).toBe(1); // only the core run reached Parallel

    // 4. Builder bound its chart to the template's database.
    const chart = await waitFor(() =>
      cardsOf(canvas.id).find((k) => k.type === 'chart' && k.provenance.kind === 'agent'),
    );
    expect(chart.provenance).toMatchObject({ kind: 'agent', agent: 'builder' });
    expect(chart.frameId).toBe(builderFrame);
    expect(ChartData.parse(chart.data).source).toEqual({
      kind: 'dataset',
      datasetId: DatabaseData.parse(chartDb.data).datasetId,
    });

    // 5. Critic: a Risk, an Insight with two citations, a Question; its upsert was refused.
    await waitFor(
      () => cardsOf(canvas.id).filter((k) => (k.provenance as any).agent === 'critic').length >= 3,
    );
    const mine = cardsOf(canvas.id).filter((k) => (k.provenance as any).agent === 'critic');
    expect(mine.map((k) => [k.type, k.frameId])).toEqual([
      ['risk', risks],
      ['insight', risks],
      ['question', questions],
    ]);
    expect(mine[0]!.data).toMatchObject({ title: c.flag.raised });
    const criticAfter = await waitFor(() => byAgent.critic.find((r) => 'call_c_upsert' in toolResults(r)));
    expect(toolResults(criticAfter)['call_c_upsert']).toMatch(
      /not available to the critic|not found|unknown tool/i,
    );
    const guarded = datasetOf(canvas.id, DatabaseData.parse(dbCard(c.rows[0]!.db).data).datasetId);
    expect(guarded.rows).toHaveLength(c.rows[0]!.rows.length);

    // 6. Orb fills its metric seed with a cited figure, scores the rubric (weights kept) and proposes on the decision.
    const metricSeed = cards.find(
      (k) => k.type === 'metric' && (k.data as { title: string }).title === c.metric.title,
    )!;
    const scorecard = cards.find(
      (k) => k.type === 'matrix' && (k.data as { title: string }).title.startsWith(c.scorecard),
    )!;
    const decision = cards.find(
      (k) => k.type === 'decision' && (k.data as { title: string }).title.startsWith(c.decision),
    )!;
    const scoreCard = scorecard.data as {
      criteria: { weight: number }[];
      options: { name: string; scores: (number | null)[] }[];
    };
    const scores = spec.rubric.map((_, i) => [8, 6, 6, 4, 6, 6][i]!);
    expect(scoreCard.criteria.map((k) => k.weight)).toEqual(spec.rubric.map((d) => d.weight));
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_o_metric',
            name: 'update_card',
            arguments: {
              cardId: metricSeed.id,
              value: c.metric.value,
              sourceUrl: 'https://example.com/source',
              why: 'From the source.',
            },
          },
          {
            id: 'call_o_score',
            name: 'update_card',
            arguments: {
              cardId: scorecard.id,
              options: scoreCard.options.map((o, i) =>
                i === 0
                  ? { name: o.name, scores, note: 'Each score cites a card.' }
                  : { name: o.name, scores: o.scores },
              ),
              why: 'Scores cite the cards of each rubric frame.',
            },
          },
          {
            id: 'call_o_decision',
            name: 'update_card',
            arguments: {
              cardId: decision.id,
              rationale: 'Weighted total 3.3 of 5: proposed, not decided.',
              why: 'Proposed, not decided.',
            },
          },
        ],
      },
      { text: 'Filled the metric and the scorecard.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'Fill in the first metric and score it now.' });
    const filled = await waitFor(() => {
      const k = cardsOf(canvas.id).find((x) => x.id === metricSeed.id);
      return (k?.data as { value?: string })?.value === c.metric.value ? k : undefined;
    });
    expect(filled.seed).toBe(true);
    expect((filled.data as { title: string }).title).toBe(c.metric.title);
    const scored = await waitFor(() => {
      const k = cardsOf(canvas.id).find((x) => x.id === scorecard.id);
      return (k?.data as typeof scoreCard).options[0]!.scores[0] === 8 ? k : undefined;
    });
    expect((scored.data as typeof scoreCard).criteria.map((k) => k.weight)).toEqual(
      spec.rubric.map((d) => d.weight),
    );
    const decided = await waitFor(() => {
      const k = cardsOf(canvas.id).find((x) => x.id === decision.id);
      return (k?.data as { rationale?: string })?.rationale ? k : undefined;
    });
    expect(decided.data).toMatchObject({ status: 'open' }); // an agent never decides for the user
  }, 180_000);

  it("the follow-up chips are the template's, filled with the intake", () => {
    const chips = spec.followUps.map((f) => f.prompt);
    expect(chips.join(' ')).toContain(`{{${spec.inputs[0]!.id}`);
    expect(spec.followUps.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Quick tier and the v1 stocks id', () => {
  it('Market map on Quick: deep_research, find_entities and batch_enrich are refused before anything is placed or spent', async () => {
    reset();
    const quick = await wire.orb.canvas.create({
      prompt: 'Warehouse robotics: market map',
      template: 'market-map',
      intake: { market: 'Warehouse robotics' },
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
            arguments: { input: 'Warehouse robotics', processor: 'core' },
          },
          {
            id: 'call_q_find',
            name: 'find_entities',
            arguments: { objective: 'Warehouse robotics companies', wait: true },
          },
          {
            id: 'call_q_batch',
            name: 'batch_enrich',
            arguments: {
              rows: [{ name: 'Rival' }],
              output_json_schema: {
                type: 'object',
                properties: { hq: { type: 'string', description: 'HQ' } },
              },
            },
          },
          { id: 'call_q_answer', name: 'web_answer', arguments: { question: 'What is warehouse robotics?' } },
        ],
      },
      { text: 'Quick scan only.' },
    );
    await wire.orb.chat.send(quick.id, { text: 'Map it.' });
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

  it('a scripted caller that still asks for the v1 "stocks" template gets Public equity', async () => {
    reset();
    const meta = await wire.orb.canvas.create({ prompt: 'Costco', template: 'stocks' });
    expect(metaOf(meta.id)).toMatchObject({
      template: 'public-equity',
      depth: 'standard',
      intake: { company: 'Costco' },
    });
    expect(framesOf(meta.id).map((f) => f.title)).toEqual(
      specOf('public-equity')!.frames.map((f) => f.title),
    );
  });

  it('an invalid intake is refused by the wire for each template and leaves no canvas behind', async () => {
    const before = (await wire.orb.canvas.list()).length;
    for (const c of CASES) {
      const first = specOf(c.id)!.inputs[0]!;
      await expect(
        wire.orb.canvas.create({ prompt: 'x', template: c.id, intake: { [first.id]: '' } }),
      ).rejects.toMatchObject({
        message: expect.stringMatching(
          new RegExp(`intake is not valid.*${first.label.replace(/[()]/g, '.')}`),
        ),
      });
    }
    expect((await wire.orb.canvas.list()).length).toBe(before);
  });
});
