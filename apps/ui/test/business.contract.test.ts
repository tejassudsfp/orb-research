/**
 * P6.14 contract test: the business template group (sales account research, partnership evaluation, vendor / tool
 * selection, market entry) run end to end on a REAL sidecar (mock LLM scripted per agent, mock Parallel). Each agent's
 * model script FOLLOWS ITS PLAYBOOK, and the test proves the playbook is what reached the model and what the scripted
 * tool calls did to the board, for every template of the group:
 *   - the new-canvas turn carries Orb's playbook (intake, tier, rubric, memo, deck format); each child's FIRST assignment
 *     carries its own (steps in order, its frames with real ids, target mix), never its persona; a later one does not;
 *   - Scout works the template's databases with upsert_rows, runs find_entities and a core deep_research on the
 *     Standard tier and is refused pro by the tier gate;
 *   - Critic clears or raises red flags as cards in the Risks frame and turns a gap into a Question; it cannot write
 *     to a database;
 *   - Builder binds a chart to the template's database;
 *   - Orb fills a seed metric, the Scorecard and proposes (never decides) on the Decision card;
 *   - on the Quick tier the costly Parallel tools are refused before anything is placed or spent.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AGENT_TOOLS,
  ChartData,
  Dataset,
  DatabaseData,
  specOf,
  stepsFor,
  fillTokens,
  type BoardEvent,
  type CanvasMeta,
  type Card,
  type Frame,
  type TemplateId,
  type TemplateSpecV2,
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
import { BUSINESS_IDS, SAMPLE_INTAKE, type BusinessId } from '../../../packages/shared/test/businessIntakes.js';

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
const reset = () => {
  for (const w of ['orb', 'scout', 'critic', 'builder'] as const) {
    scripts[w].length = 0;
    byAgent[w].length = 0;
  }
};

/** What each template's scripted agents do. Everything else is derived from the spec. */
type Plan = {
  /** The database Scout fills and the row it writes (its key column first). */
  scoutDb: string;
  row: Record<string, string | number | boolean>;
  /** Scout's find_entities lands in this frame; its deep_research in `deepFrame`. */
  findFrame: string;
  findObjective: string;
  deepFrame: string;
  /** Builder's chart: frame, database, x column and y column (omit y to count rows). */
  chartFrame: string;
  chartDb: string;
  chart: { x: string; y?: string };
  /** The seed metric Orb fills. */
  metric: string;
  /** A Critic-owned frame other than Risks where it places a Question. */
  questionFrame: string;
};
const PLANS: Record<BusinessId, Plan> = {
  'sales-account': {
    scoutDb: 'stakeholders',
    row: { Name: 'Ada Lovelace', Title: 'VP Operations', 'Role in the deal': 'Champion', Confirmed: true, 'Tenure (years)': 4 },
    findFrame: 'rivals',
    findObjective: 'Route-optimisation vendors for mid-market logistics',
    deepFrame: 'strategy',
    chartFrame: 'fit',
    chartDb: 'triggers',
    chart: { x: 'Type' },
    metric: 'Founded',
    questionFrame: 'people',
  },
  partnership: {
    scoutDb: 'overlap',
    row: { Segment: 'Regional banks', Region: 'EU', 'Partner customers': 120, 'Our customers': 8, Overlap: 'Low', 'Opportunity (USD)': 900000 },
    findFrame: 'alternatives',
    findObjective: 'Channel partners that sell to regional banks',
    deepFrame: 'fit',
    chartFrame: 'market',
    chartDb: 'overlap',
    chart: { x: 'Segment', y: 'Opportunity (USD)' },
    metric: 'Founded',
    questionFrame: 'plan',
  },
  'vendor-selection': {
    scoutDb: 'pricing',
    row: { Row: 'Zendesk: Suite', Vendor: 'Zendesk', Plan: 'Suite Team', 'Unit price (USD)': 55, Unit: 'per agent per month', Basis: 'List', 'Auto-renew': true },
    findFrame: 'market',
    findObjective: 'Customer support platforms with EU data residency',
    deepFrame: 'trust',
    chartFrame: 'pricing',
    chartDb: 'tco',
    chart: { x: 'Vendor', y: 'Total (USD)' },
    metric: 'Cheapest finalist (3-year TCO)',
    questionFrame: 'negotiation',
  },
  'market-entry': {
    scoutDb: 'sizing',
    row: { Assumption: 'Firms with 10 to 200 employees', Value: 480000, Unit: 'firms', Method: 'Official statistic', Year: 2025, Confidence: 'High' },
    findFrame: 'competition',
    findObjective: 'Invoicing software vendors selling to small firms in Germany',
    deepFrame: 'regulation',
    chartFrame: 'demand',
    chartDb: 'sizing',
    chart: { x: 'Assumption', y: 'Value' },
    metric: 'Population',
    questionFrame: 'questions',
  },
};

describe.each(BUSINESS_IDS)('%s, Standard tier: the agents follow the playbook', (id) => {
  const spec = specOf(id as TemplateId) as TemplateSpecV2;
  const plan = PLANS[id];
  const intake = SAMPLE_INTAKE[id];
  const subject = String(Object.values(intake)[0]);
  let canvas: CanvasMeta;
  let frames: Frame[];
  const frameBy = (specId: string) => frames[spec.frames.findIndex((f) => f.id === specId)]!;
  const ownedBy = (role: Who) => spec.frames.filter((f) => f.owners.includes(role)).map((f) => frameBy(f.id).id);
  const dbCard = (key: string) => {
    const d = spec.databases.find((x) => x.key === key)!;
    const seed = spec.frames.flatMap((f) => f.seeds).find((s) => s.type === 'database' && s.db === key)!;
    const title = String(seed.data.title ?? d.name);
    return cardsOf(canvas.id).find(
      (c) => c.type === 'database' && (c.data as { title: string }).title === title && c.frameId === frameBy(d.frame).id,
    )!;
  };

  it('starts from the intake with every frame, seed and database', async () => {
    reset();
    canvas = await wire.orb.canvas.create({
      prompt: `${subject}: research`,
      template: id,
      intake,
      depth: 'standard',
    });
    frames = framesOf(canvas.id);
    expect(frames.map((f) => f.title)).toEqual(spec.frames.map((f) => f.title));
    expect(cardsOf(canvas.id)).toHaveLength(spec.frames.reduce((n, f) => n + f.seeds.length, 0));
    expect(metaOf(canvas.id)).toMatchObject({ template: id, depth: 'standard' });
    expect(metaOf(canvas.id).intake).toMatchObject({ [spec.inputs[0]!.id]: subject });
    expect(byAgent.orb).toHaveLength(0); // start was not asked for yet
  });

  it('Orb and its team run the playbook (scripted): delegate, fill the databases, chart, clear and raise, score', async () => {
    const runsBefore = parallel.count('POST', '/v1/tasks/runs');
    const cards = cardsOf(canvas.id);
    const scoutDb = dbCard(plan.scoutDb);
    const chartDb = dbCard(plan.chartDb);
    const risks = frameBy('risks').id;
    const checklist = cards.find((c) => c.type === 'checklist' && c.frameId === risks)!;
    const seedMetric = cards.find((c) => c.type === 'metric' && (c.data as { title: string }).title === plan.metric)!;
    expect(seedMetric, plan.metric).toBeTruthy();
    const key = spec.databases.find((d) => d.key === plan.scoutDb)!.keyColumn!;
    expect(Object.keys(plan.row)[0]).toBe(key);

    const orbTurnEnded = () =>
      expect.poll(() => byAgent.orb[1]?.completed === true, { timeout: 30_000, interval: 20 }).toBe(true);
    const held = { holdUntil: orbTurnEnded, firstDelayMs: 200 } as const;

    scripts.orb.push(
      {
        toolCalls: (['scout', 'builder', 'critic'] as const).map((role) => ({
          id: `call_d_${role}`,
          name: 'delegate',
          arguments: { role, frameIds: ownedBy(role), instruction: `Follow your playbook for ${subject}.` },
        })),
      },
      { text: 'The team is on it.' },
    );
    scripts.scout.push(
      {
        toolCalls: [
          { id: 'call_s_p1', name: 'report_progress', arguments: { status: 'Starting', frameId: frameBy(plan.deepFrame).id } },
        ],
        ...held,
      },
      {
        toolCalls: [
          {
            id: 'call_s_row',
            name: 'upsert_rows',
            arguments: { cardId: scoutDb.id, key, rows: [{ values: plan.row }] },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_find',
            name: 'find_entities',
            arguments: { objective: plan.findObjective, match_limit: 5, frameId: frameBy(plan.findFrame).id, wait: true },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_deep_pro',
            name: 'deep_research',
            arguments: { input: `${subject} gaps`, processor: 'pro', frameId: frameBy(plan.deepFrame).id },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_deep_core',
            name: 'deep_research',
            arguments: {
              input: `${subject} gaps`,
              processor: 'core',
              title: `${subject} gaps`,
              frameId: frameBy(plan.deepFrame).id,
              wait: true,
            },
          },
        ],
      },
      {
        toolCalls: [
          { id: 'call_s_done', name: 'send_message', arguments: { about: 'done', message: 'The first pass is in.' } },
        ],
      },
      { text: 'Done.' },
    );
    scripts.builder.push(
      {
        toolCalls: [
          { id: 'call_b_p1', name: 'report_progress', arguments: { status: 'Chart', frameId: frameBy(plan.chartFrame).id } },
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
              frameId: frameBy(plan.chartFrame).id,
              title: 'Built from the database',
              mark: 'bar',
              x: plan.chart.x,
              ...(plan.chart.y ? { y: plan.chart.y } : {}),
              datasetId: DatabaseData.parse(chartDb.data).datasetId,
              why: 'Bound to the template database.',
            },
          },
        ],
      },
      {
        toolCalls: [{ id: 'call_b_done', name: 'send_message', arguments: { about: 'done', message: 'Chart placed.' } }],
      },
      { text: 'Done.' },
    );
    scripts.critic.push(
      {
        toolCalls: [{ id: 'call_c_p1', name: 'report_progress', arguments: { status: 'Red flags', frameId: risks } }],
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
              title: 'RF01 raised: the claim has no independent source',
              body: 'Only the proposer states it.',
              why: 'Raised with evidence.',
            },
          },
          {
            id: 'call_c_cleared',
            name: 'place_card',
            arguments: {
              type: 'insight',
              frameId: risks,
              title: 'RF02 cleared: nothing found in the sources',
              body: 'No news or filing shows the problem.',
              citations: [checklist.id, scoutDb.id],
              why: 'Cleared with a source.',
            },
          },
          {
            id: 'call_c_q',
            name: 'place_card',
            arguments: {
              type: 'question',
              frameId: frameBy(plan.questionFrame).id,
              title: 'Can you share the figure behind this claim?',
              body: 'A gap behind RF01.',
              why: 'A gap becomes a question.',
            },
          },
          // The Critic cannot change a database (not in its tools): the call is refused.
          { id: 'call_c_upsert', name: 'upsert_rows', arguments: { cardId: scoutDb.id, rows: [{ values: { x: 'x' } }] } },
        ],
      },
      {
        toolCalls: [
          { id: 'call_c_done', name: 'send_message', arguments: { about: 'done', message: 'RF01 raised; RF02 cleared.' } },
        ],
      },
      { text: 'Done.' },
    );

    await wire.orb.canvas.start(canvas.id);

    // 1. Orb's new-canvas turn carries its playbook: intake, tier, rubric, memo and deck format.
    const orbFirst = await waitFor(() => byAgent.orb[0]);
    const orbText = allText(orbFirst);
    expect(orbText).toContain(`The ${spec.label} playbook`);
    expect(orbText).toContain(`${spec.inputs[0]!.label}: ${subject}`);
    expect(orbText).toContain('Depth: Standard');
    for (const d of spec.rubric) expect(orbText).toContain(`${d.name} (${d.weight}%)`);
    expect(orbText).toContain(fillTokens(spec.output.memoTitle, intake as never));
    expect(orbText).toContain(`deck format is ${spec.output.deckFormat}`);
    expect(orbText).toContain('The frames hold seed cards');
    for (const f of frames) expect(orbText).toContain(`[${f.id}]`);
    expect(systemOf(orbFirst)).not.toMatch(/playbook/i);

    // 2. Each child's FIRST assignment carries its playbook; its persona does not.
    const scoutFirst = await waitFor(() => byAgent.scout[0]);
    const scoutText = allText(scoutFirst);
    expect(scoutText).toContain('Your playbook, in this order:');
    expect(scoutText).toContain('Target mix:');
    expect((intake.sites as string[])[0]).toBeTruthy();
    expect(scoutText).toContain((intake.sites as string[])[0]!); // the ticked signed-in source
    expect(scoutText).not.toContain('The red-flag checklist');
    let at = scoutText.indexOf('Your playbook');
    for (const s of stepsFor(spec, 'scout', 'standard')) {
      const next = scoutText.indexOf(fillTokens(s.text, intake as never).slice(0, 40), at);
      expect(next, s.id).toBeGreaterThanOrEqual(at);
      at = next;
    }
    for (const f of spec.frames.filter((x) => x.owners.includes('scout')))
      expect(scoutText).toContain(`"${f.title}" [${frameBy(f.id).id}]`);
    expect(systemOf(scoutFirst)).not.toMatch(/playbook/i);
    const criticText = allText(await waitFor(() => byAgent.critic[0]));
    for (const f of spec.redFlags) expect(criticText).toContain(f.id);
    expect(criticText).toContain(`"${spec.frames.find((f) => f.id === 'risks')!.title}" [${risks}]`);
    const builderText = allText(await waitFor(() => byAgent.builder[0]));
    expect(builderText).toContain(`"${frameBy(plan.chartFrame).title}" [${frameBy(plan.chartFrame).id}]`);

    // 3. Scout's playbook calls did what the playbook says.
    const scoutDone = await waitFor(() => byAgent.scout.find((r) => 'call_s_deep_core' in toolResults(r)));
    const results = toolResults(scoutDone);
    const ds = datasetOf(canvas.id, DatabaseData.parse(scoutDb.data).datasetId);
    expect(ds.rows).toHaveLength(1);
    expect(ds.rows[0]).toMatchObject({ by: 'scout' });
    for (const [col, value] of Object.entries(plan.row))
      expect(ds.rows[0]!.cells[ds.columns.find((c) => c.name === col)!.id], col).toBe(value);
    expect(JSON.parse(results.call_s_find!)).toMatchObject({ status: 'completed' });
    const inFind = cardsOf(canvas.id).filter((c) => c.frameId === frameBy(plan.findFrame).id);
    expect(inFind.some((c) => c.type === 'research')).toBe(true);
    expect(JSON.parse(results.call_s_deep_pro!)).toMatchObject({
      refused: true,
      message: expect.stringMatching(/allows the processors lite, base, core for deep_research, not pro/),
    });
    expect(JSON.parse(results.call_s_deep_core!)).toMatchObject({ status: 'completed' });
    expect(parallel.count('POST', '/v1/tasks/runs') - runsBefore).toBe(1); // only the core run reached Parallel

    // 4. Builder bound its chart to the template's database.
    const chart = await waitFor(() => cardsOf(canvas.id).find((c) => c.type === 'chart' && c.provenance.kind === 'agent'));
    expect(chart.provenance).toMatchObject({ kind: 'agent', agent: 'builder' });
    expect(chart.frameId).toBe(frameBy(plan.chartFrame).id);
    expect(ChartData.parse(chart.data).source).toEqual({
      kind: 'dataset',
      datasetId: DatabaseData.parse(chartDb.data).datasetId,
    });

    // 5. Critic's cards sit in its frames with its role; its upsert was refused.
    await waitFor(
      () =>
        cardsOf(canvas.id).filter((c) => c.provenance.kind === 'agent' && (c.provenance as any).agent === 'critic')
          .length >= 3,
    );
    const mine = cardsOf(canvas.id).filter(
      (c) => c.provenance.kind === 'agent' && (c.provenance as any).agent === 'critic',
    );
    expect(mine.map((c) => [c.type, c.frameId])).toEqual([
      ['risk', risks],
      ['insight', risks],
      ['question', frameBy(plan.questionFrame).id],
    ]);
    const criticAfter = await waitFor(() => byAgent.critic.find((r) => 'call_c_upsert' in toolResults(r)));
    expect(toolResults(criticAfter)['call_c_upsert']).toMatch(/not available to the critic|not found|unknown tool/i);
    expect(AGENT_TOOLS.critic).not.toContain('upsert_rows');

    // 6. Orb fills a seed metric, the Scorecard (one score per rubric dimension) and proposes on the Decision card.
    const scorecard = cards.find((c) => c.type === 'matrix' && (c.data as { title: string }).title.startsWith('Scorecard'))!;
    const decision = cards.find((c) => c.type === 'decision')!;
    const options = (scorecard.data as { options: { name: string; scores: (number | null)[] }[] }).options.map((o, i) =>
      i === 0 ? { ...o, scores: spec.rubric.map(() => 6) } : o,
    );
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_o_metric',
            name: 'update_card',
            arguments: { cardId: seedMetric.id, value: '2021', period: 'as of 2026', sourceUrl: 'https://example.org/facts', why: 'From the source.' },
          },
          { id: 'call_o_score', name: 'update_card', arguments: { cardId: scorecard.id, options, why: 'Scores cite the cards.' } },
          {
            id: 'call_o_decision',
            name: 'update_card',
            arguments: { cardId: decision.id, rationale: 'Weighted total 3.0 of 5: proposed, not decided.', why: 'Proposed, not decided.' },
          },
        ],
      },
      { text: 'Filled the metric and the scorecard.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'Fill in the snapshot now.' });
    const filled = await waitFor(() => {
      const c = cardsOf(canvas.id).find((x) => x.id === seedMetric.id);
      return (c?.data as { value?: string })?.value === '2021' ? c : undefined;
    });
    expect(filled.seed).toBe(true); // still a seed card, now filled
    const scored = await waitFor(() => {
      const c = cardsOf(canvas.id).find((x) => x.id === scorecard.id);
      return (c?.data as { options: { scores: (number | null)[] }[] }).options[0]!.scores[0] === 6 ? c : undefined;
    });
    expect((scored.data as { criteria: { weight: number }[] }).criteria.map((c) => c.weight)).toEqual(
      spec.rubric.map((d) => d.weight),
    );
    const decided = await waitFor(() => {
      const c = cardsOf(canvas.id).find((x) => x.id === decision.id);
      return (c?.data as { rationale?: string })?.rationale ? c : undefined;
    });
    expect(decided.data).toMatchObject({ status: 'open' }); // orb proposes; the user decides
  }, 120_000);

  it('a later assignment to an existing child does not repeat the playbook', async () => {
    const before = byAgent.scout.length;
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_d_again',
            name: 'delegate',
            arguments: { role: 'scout', frameIds: [frameBy(plan.findFrame).id], instruction: 'Now one more pass on this frame.' },
          },
        ],
      },
      { text: 'Asked Scout.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'Scout, take one more pass.' });
    const req = await waitFor(() =>
      byAgent.scout.slice(before).find((r) => allText(r).includes('Now one more pass on this frame.')),
    );
    const messages = (req.body.messages as any[]).map(textOf);
    expect(messages.filter((t) => t.includes('Your playbook, in this order:'))).toHaveLength(1);
  }, 60_000);

  it('Quick tier: the cost guard refuses deep_research, find_entities and batch_enrich before anything is spent', async () => {
    // The prior Standard board may still be completing its deliberately partial script. It must not consume
    // the shared mock queue intended for this new Quick board.
    await wire.orb.agents.control(canvas.id, { agent: 'all', action: 'stop' });
    reset();
    const quick = await wire.orb.canvas.create({
      prompt: `${subject}: quick`,
      template: id,
      intake,
      depth: 'quick',
    });
    expect(metaOf(quick.id)).toMatchObject({ depth: 'quick' });
    const runs = parallel.count('POST', '/v1/tasks/runs');
    const findalls = parallel.count('POST', '/v1beta/findall/runs');
    const before = cardsOf(quick.id).length;
    scripts.orb.push(
      {
        toolCalls: [
          { id: 'call_q_deep', name: 'deep_research', arguments: { input: `${subject} market`, processor: 'core' } },
          { id: 'call_q_find', name: 'find_entities', arguments: { objective: `${subject} competitors`, wait: true } },
          {
            id: 'call_q_batch',
            name: 'batch_enrich',
            arguments: {
              rows: [{ name: 'Rival' }],
              output_json_schema: { type: 'object', properties: { hq: { type: 'string', description: 'HQ' } } },
            },
          },
          { id: 'call_q_answer', name: 'web_answer', arguments: { question: `What is ${subject}?` } },
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
  }, 60_000);
});
