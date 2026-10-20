/**
 * P6.15 contract test: the research and knowledge templates (deep dive, literature review, policy analysis, technology
 * landscape, trend report) run end to end on a REAL sidecar (mock LLM scripted per agent, mock Parallel). Each
 * agent's script FOLLOWS ITS PLAYBOOK and the test proves the playbook is what reached the model and what the
 * scripted tool calls did to the board:
 *   - Orb's new-canvas turn carries its playbook (intake, tier, rubric, memo); each child's first assignment carries
 *     its own (steps in order, its frames with real ids, the ticked signed-in source, the red-flag checklist for Critic);
 *   - Scout upserts a row into the template's primary database, runs find_entities and a core deep_research on the
 *     Standard tier and is refused pro by the tier gate;
 *   - Builder binds a chart to a database of the template;
 *   - Critic raises a flag, clears one with a cited insight and turns a gap into a question; its upsert is refused;
 *   - Orb fills a metric seed (update_card);
 *   - on the Quick tier the costly Parallel tools are refused before anything is spent.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AGENT_TOOLS,
  Dataset,
  DatabaseData,
  ChartData,
  specOf,
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
afterEach(async () => {
  // The scripts fill samples of each playbook. Retire their outstanding work before reusing the role queues.
  if (wire) for (const canvas of await wire.orb.canvas.list()) await wire.orb.agents.control(canvas.id, { action: 'stop', agent: 'all' });
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

type Plan = {
  id: 'deep-dive' | 'literature-review' | 'policy-analysis' | 'tech-landscape' | 'trend-report';
  intake: Record<string, string | string[]>;
  /** Frame ids (of the spec). */
  scoutFrame: string;
  criticFrame: string;
  builderFrame: string;
  /** Database keys of the spec. */
  scoutDb: string;
  chartDb: string;
  chart: { mark: 'bar'; x: string; y?: string };
  row: Record<string, string | number>;
  keyColumn: string;
  metric: { frame: string; title: string };
  objective: string;
};

const PLANS: Plan[] = [
  {
    id: 'deep-dive',
    intake: { topic: 'Solid-state batteries', thesis: 'They reach mass-market cars before 2030.', sites: ['ft.com'] },
    scoutFrame: 'sources',
    criticFrame: 'risks',
    builderFrame: 'sources',
    scoutDb: 'sources',
    chartDb: 'sources',
    chart: { mark: 'bar', x: 'Stance' },
    row: { Title: 'IEA battery outlook', Type: 'Institutional report', Stance: 'Supports', Reliability: 4, URL: 'https://iea.example/batteries' },
    keyColumn: 'Title',
    metric: { frame: 'background', title: 'Scale' },
    objective: 'Best sources on solid-state batteries',
  },
  {
    id: 'literature-review',
    intake: { topic: 'Time-restricted eating and cardiometabolic health', review_type: 'Systematic review', sites: ['scholar.google.com'] },
    scoutFrame: 'papers',
    criticFrame: 'gaps',
    builderFrame: 'claims',
    scoutDb: 'papers',
    chartDb: 'claims',
    chart: { mark: 'bar', x: 'Evidence strength' },
    row: { Title: 'A randomised trial of time-restricted eating', Year: 2023, Venue: 'JAMA', 'Study type': 'RCT', 'Sample size': 120, Status: 'Include', Quality: 4, Link: 'https://doi.example/10.1/abc' },
    keyColumn: 'Title',
    metric: { frame: 'scope', title: 'Records found' },
    objective: 'Randomised trials of time-restricted eating',
  },
  {
    id: 'policy-analysis',
    intake: { policy: 'EU AI Act', jurisdiction: 'European Union', policy_type: 'Regulation', sites: ['westlaw.com'] },
    scoutFrame: 'provisions',
    criticFrame: 'legal',
    builderFrame: 'evidence',
    scoutDb: 'provisions',
    chartDb: 'impact',
    chart: { mark: 'bar', x: 'Direction' },
    row: { Section: 'Article 5', Topic: 'Prohibited practices', Kind: 'Prohibition', Requirement: 'Bans social scoring by public authorities', Quote: 'The following AI practices shall be prohibited', Source: 'https://eur-lex.example/ai-act' },
    keyColumn: 'Section',
    metric: { frame: 'snapshot', title: 'Enforcing body' },
    objective: 'Similar AI regulation in other jurisdictions',
  },
  {
    id: 'tech-landscape',
    intake: { technology: 'Vector databases', use_case: 'Semantic search over 50M documents', sites: ['github.com'] },
    scoutFrame: 'vendors',
    criticFrame: 'risks',
    builderFrame: 'benchmarks',
    scoutDb: 'vendors',
    chartDb: 'benchmarks',
    chart: { mark: 'bar', x: 'System', y: 'Value' },
    row: { Name: 'Acme Vector', URL: 'https://acmevector.example', Category: 'Platform', Maturity: 'Growing', Fit: 4, Source: 'https://acmevector.example' },
    keyColumn: 'Name',
    metric: { frame: 'overview', title: 'Market size' },
    objective: 'Vector database vendors',
  },
  {
    id: 'trend-report',
    intake: { trend: 'Remote-first work', horizon: '3 years', sites: ['statista.com'] },
    scoutFrame: 'signals',
    criticFrame: 'counter',
    builderFrame: 'signals',
    scoutDb: 'signals',
    chartDb: 'signals',
    chart: { mark: 'bar', x: 'Type' },
    row: { Signal: 'Share of workers fully remote, 2024', Type: 'Hard data', Date: '2024-06-01', Direction: 'Strengthens', Strength: 4, Source: 'https://stats.example/remote' },
    keyColumn: 'Signal',
    metric: { frame: 'definition', title: 'Headline figure' },
    objective: 'Remote-first companies',
  },
];

const frameOf = (frames: Frame[], spec: NonNullable<ReturnType<typeof specOf>>, id: string) =>
  frames.find((f) => f.title === spec.frames.find((x) => x.id === id)!.title)!;

describe('the intake is validated by the wire', () => {
  it.each(PLANS.map((p) => [p.id] as const))('%s refuses an intake without its subject and leaves no canvas behind', async (id) => {
    const before = (await wire.orb.canvas.list()).length;
    await expect(
      wire.orb.canvas.create({ prompt: 'x', template: id, intake: { depth: 'standard' } }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/intake is not valid/) });
    expect((await wire.orb.canvas.list()).length).toBe(before);
  });
});

describe.each(PLANS.map((p) => [p.id, p] as const))('%s, Standard tier: the agents follow the playbook', (id, plan) => {
  const spec = specOf(id)!;
  let canvas: CanvasMeta;
  let frames: Frame[];

  it('starts from the intake with every frame, seed and database', async () => {
    canvas = await wire.orb.canvas.create({
      prompt: `${spec.label}: ${plan.id}`,
      template: id,
      intake: plan.intake,
      depth: 'standard',
    });
    frames = framesOf(canvas.id);
    expect(frames.map((f) => f.title)).toEqual(spec.frames.map((f) => f.title));
    expect(cardsOf(canvas.id)).toHaveLength(spec.frames.reduce((n, f) => n + f.seeds.length, 0));
    expect(metaOf(canvas.id)).toMatchObject({ template: id, depth: 'standard' });
  });

  it('Orb and its team run the playbook (scripted): delegate, work the databases, chart, clear and raise, fill', async () => {
    for (const k of ['orb', 'scout', 'critic', 'builder'] as const) {
      scripts[k].length = 0;
      byAgent[k].length = 0;
    }
    const scoutFrame = frameOf(frames, spec, plan.scoutFrame);
    const criticFrame = frameOf(frames, spec, plan.criticFrame);
    const builderFrame = frameOf(frames, spec, plan.builderFrame);
    const cards = cardsOf(canvas.id);
    const dbTitle = (key: string) => spec.frames.flatMap((f) => f.seeds).find((s) => s.db === key && s.type === 'database')!.data.title as string;
    const dbCard = (key: string) =>
      cards.find((c) => c.type === 'database' && (c.data as { title: string }).title === dbTitle(key))!;
    const scoutDbCard = dbCard(plan.scoutDb);
    const chartDbCard = dbCard(plan.chartDb);
    const checklist = cards.find((c) => c.type === 'checklist' && c.frameId === criticFrame.id && (c.data as { title: string }).title === 'Red-flag checklist')!;
    const metricSeed = cards.find(
      (c) => c.type === 'metric' && c.frameId === frameOf(frames, spec, plan.metric.frame).id && (c.data as { title: string }).title === plan.metric.title,
    )!;
    expect(scoutDbCard && chartDbCard && checklist && metricSeed).toBeTruthy();

    const orbTurnEnded = () => expect.poll(() => byAgent.orb[1]?.completed === true, { timeout: 30_000, interval: 20 }).toBe(true);
    const held = { holdUntil: orbTurnEnded, firstDelayMs: 200 } as const;
    const runs0 = parallel.count('POST', '/v1/tasks/runs');

    scripts.orb.push(
      {
        toolCalls: [
          { id: 'call_d_scout', name: 'delegate', arguments: { role: 'scout', frameIds: [scoutFrame.id], instruction: 'Start with the sources in the intake.' } },
          { id: 'call_d_builder', name: 'delegate', arguments: { role: 'builder', frameIds: [builderFrame.id], instruction: 'The chart from the database.' } },
          { id: 'call_d_critic', name: 'delegate', arguments: { role: 'critic', frameIds: [criticFrame.id], instruction: 'Work through the red-flag checklist.' } },
        ],
      },
      { text: 'The team is on it.' },
    );
    scripts.scout.push(
      { toolCalls: [{ id: 'call_s_p1', name: 'report_progress', arguments: { status: 'Sources', frameId: scoutFrame.id } }], ...held },
      {
        toolCalls: [
          {
            id: 'call_s_row',
            name: 'upsert_rows',
            arguments: { cardId: scoutDbCard.id, key: plan.keyColumn, rows: [{ values: plan.row }] },
          },
          {
            id: 'call_s_source',
            name: 'place_card',
            arguments: { type: 'source', frameId: scoutFrame.id, url: 'https://example.org/source', title: 'A source', summary: 'What it shows.', why: 'From the playbook.' },
          },
        ],
      },
      {
        toolCalls: [
          { id: 'call_s_find', name: 'find_entities', arguments: { objective: plan.objective, match_limit: 5, frameId: scoutFrame.id, wait: true } },
        ],
      },
      { toolCalls: [{ id: 'call_s_deep_pro', name: 'deep_research', arguments: { input: plan.objective, processor: 'pro', frameId: scoutFrame.id } }] },
      {
        toolCalls: [
          { id: 'call_s_deep_core', name: 'deep_research', arguments: { input: plan.objective, processor: 'core', title: plan.objective, frameId: scoutFrame.id, wait: true } },
        ],
      },
      { toolCalls: [{ id: 'call_s_done', name: 'send_message', arguments: { about: 'done', message: 'Sources are in.' } }] },
      { text: 'Done.' },
    );
    scripts.builder.push(
      { toolCalls: [{ id: 'call_b_p1', name: 'report_progress', arguments: { status: 'Chart', frameId: builderFrame.id } }], ...held },
      {
        toolCalls: [
          {
            id: 'call_b_chart',
            name: 'place_card',
            arguments: {
              type: 'chart',
              frameId: builderFrame.id,
              title: 'Chart from the database',
              mark: plan.chart.mark,
              x: plan.chart.x,
              ...(plan.chart.y ? { y: plan.chart.y } : {}),
              datasetId: DatabaseData.parse(chartDbCard.data).datasetId,
              why: 'Bound to the database.',
            },
          },
        ],
      },
      { toolCalls: [{ id: 'call_b_done', name: 'send_message', arguments: { about: 'done', message: 'Chart placed.' } }] },
      { text: 'Done.' },
    );
    scripts.critic.push(
      { toolCalls: [{ id: 'call_c_p1', name: 'report_progress', arguments: { status: 'Red flags', frameId: criticFrame.id } }], ...held },
      {
        toolCalls: [
          { id: 'call_c_raised', name: 'place_card', arguments: { type: 'risk', frameId: criticFrame.id, title: 'RF01 raised: one source behind the headline', body: 'Only one origin found.', why: 'Single source.' } },
          {
            id: 'call_c_cleared',
            name: 'place_card',
            arguments: {
              type: 'insight',
              frameId: criticFrame.id,
              title: 'RF02 cleared: no sponsor found',
              body: 'No sponsor is named in the sources.',
              citations: [checklist.id, scoutDbCard.id],
              why: 'Cleared with a source.',
            },
          },
          { id: 'call_c_q', name: 'place_card', arguments: { type: 'question', frameId: criticFrame.id, title: 'Is there an independent replication?', body: 'A gap behind RF04.', why: 'A gap becomes a question.' } },
          { id: 'call_c_upsert', name: 'upsert_rows', arguments: { cardId: scoutDbCard.id, rows: [{ values: { x: 'x' } }] } },
        ],
      },
      { toolCalls: [{ id: 'call_c_done', name: 'send_message', arguments: { about: 'done', message: 'RF01 raised; RF02 cleared.' } }] },
      { text: 'Done.' },
    );

    await wire.orb.canvas.start(canvas.id);

    // 1. Orb's first turn carries its playbook: intake, tier, rubric and memo, with the real frame ids.
    const orbFirst = await waitFor(() => byAgent.orb[0]);
    const orbText = allText(orbFirst);
    expect(orbText).toContain(`The ${spec.label} playbook`);
    expect(orbText).toContain(`- ${spec.inputs[0]!.label}: ${plan.intake[spec.inputs[0]!.id]}`);
    expect(orbText).toContain('Depth: Standard');
    expect(orbText).toContain(`${spec.rubric[0]!.name} (${spec.rubric[0]!.weight}%)`);
    expect(orbText).toContain(spec.output.memoTitle.replace(/\{\{[a-z_]+\}\}/, String(plan.intake[spec.inputs[0]!.id])));
    expect(orbText).toContain('The frames hold seed cards');
    for (const f of frames) expect(orbText).toContain(`[${f.id}]`);
    expect(systemOf(orbFirst)).not.toMatch(/playbook/i);

    // 2. Each child's FIRST assignment carries its playbook; the persona does not.
    const scoutFirst = await waitFor(() => byAgent.scout[0]);
    const scoutText = allText(scoutFirst);
    expect(scoutText).toContain('Your playbook, in this order:');
    expect(scoutText).toContain(`"${scoutFrame.title}" [${scoutFrame.id}]`);
    expect(scoutText).toContain('Target mix:');
    expect(scoutText).toContain((plan.intake.sites as string[])[0]!);
    const steps = spec.plan.scout;
    expect(scoutText.indexOf(steps[0]!.text.slice(0, 40))).toBeGreaterThan(-1);
    expect(scoutText.indexOf(steps[0]!.text.slice(0, 40))).toBeLessThan(scoutText.indexOf(steps[1]!.text.slice(0, 40)));
    expect(scoutText).not.toContain('The red-flag checklist');
    expect(systemOf(scoutFirst)).not.toMatch(/playbook/i);
    const criticText = allText(await waitFor(() => byAgent.critic[0]));
    for (const f of spec.redFlags) expect(criticText).toContain(f.id);
    expect(criticText).toContain(`"${criticFrame.title}" [${criticFrame.id}]`);
    expect(allText(await waitFor(() => byAgent.builder[0]))).toContain(`"${builderFrame.title}" [${builderFrame.id}]`);

    // 3. Scout's playbook calls did what the playbook says.
    const scoutDone = await waitFor(() => byAgent.scout.find((r) => 'call_s_deep_core' in toolResults(r)));
    const results = toolResults(scoutDone);
    const ds = datasetOf(canvas.id, DatabaseData.parse(scoutDbCard.data).datasetId);
    expect(ds.rows).toHaveLength(1);
    expect(ds.rows[0]).toMatchObject({ by: 'scout' });
    for (const [col, value] of Object.entries(plan.row))
      expect(ds.rows[0]!.cells[ds.columns.find((c) => c.name === col)!.id], col).toBe(value);
    expect(JSON.parse(results.call_s_find!)).toMatchObject({ status: 'completed' });
    expect(cardsOf(canvas.id).some((c) => c.type === 'research' && c.frameId === scoutFrame.id)).toBe(true);
    expect(JSON.parse(results.call_s_deep_pro!)).toMatchObject({
      refused: true,
      message: expect.stringMatching(/allows the processors lite, base, core for deep_research, not pro/),
    });
    expect(JSON.parse(results.call_s_deep_core!)).toMatchObject({ status: 'completed' });
    expect(parallel.count('POST', '/v1/tasks/runs') - runs0).toBe(1); // only the core run reached Parallel

    // 4. Builder bound its chart to the template's database.
    const chart = await waitFor(() => cardsOf(canvas.id).find((c) => c.type === 'chart' && c.provenance.kind === 'agent'));
    expect(chart.provenance).toMatchObject({ kind: 'agent', agent: 'builder' });
    expect(chart.frameId).toBe(builderFrame.id);
    expect(ChartData.parse(chart.data).source).toEqual({ kind: 'dataset', datasetId: DatabaseData.parse(chartDbCard.data).datasetId });

    // 5. Critic's cards sit in its frame with its role; its upsert was refused.
    await waitFor(() => cardsOf(canvas.id).filter((c) => c.provenance.kind === 'agent' && (c.provenance as any).agent === 'critic').length >= 3);
    const mine = cardsOf(canvas.id).filter((c) => c.provenance.kind === 'agent' && (c.provenance as any).agent === 'critic');
    expect(mine.map((c) => [c.type, c.frameId])).toEqual([
      ['risk', criticFrame.id],
      ['insight', criticFrame.id],
      ['question', criticFrame.id],
    ]);
    const criticAfter = await waitFor(() => byAgent.critic.find((r) => 'call_c_upsert' in toolResults(r)));
    expect(toolResults(criticAfter)['call_c_upsert']).toMatch(/not available to the critic|not found|unknown tool/i);
    expect(AGENT_TOOLS.critic).not.toContain('upsert_rows');
    expect(datasetOf(canvas.id, DatabaseData.parse(scoutDbCard.data).datasetId).rows).toHaveLength(1);

    // 6. Orb fills a metric seed (still a seed card, now filled).
    scripts.orb.push(
      {
        toolCalls: [
          { id: 'call_o_metric', name: 'update_card', arguments: { cardId: metricSeed.id, value: '42', period: '2026', sourceUrl: 'https://example.org/source', why: 'From the source.' } },
        ],
      },
      { text: 'Filled the metric.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'Fill in the first metric now.' });
    const filled = await waitFor(() => {
      const c = cardsOf(canvas.id).find((x) => x.id === metricSeed.id);
      return (c?.data as { value?: string })?.value === '42' ? c : undefined;
    });
    expect(filled.seed).toBe(true);
    expect((filled.data as { title: string }).title).toBe(plan.metric.title);
    // Every scripted turn was used: nothing is left to leak into the next canvas.
    await waitFor(() => Object.values(scripts).every((q) => q.length === 0));
  }, 120_000);

  it("the follow-up chips are the template's, filled with the intake", () => {
    const text = JSON.stringify(spec.followUps);
    expect(spec.followUps.length).toBeGreaterThanOrEqual(6);
    expect(text).toMatch(/\{\{(topic|policy|technology|trend)\}\}/);
  });
});

describe('Quick tier: the cost guard', () => {
  it('refuses deep_research, find_entities and batch_enrich before anything is placed or spent', async () => {
    const quick = await wire.orb.canvas.create({
      prompt: 'Globex',
      template: 'literature-review',
      intake: { topic: 'Globex effects' },
      depth: 'quick',
    });
    expect(metaOf(quick.id)).toMatchObject({ depth: 'quick' });
    for (const k of ['orb', 'scout', 'critic', 'builder'] as const) {
      scripts[k].length = 0;
      byAgent[k].length = 0;
    }
    const runs = parallel.count('POST', '/v1/tasks/runs');
    const findalls = parallel.count('POST', '/v1beta/findall/runs');
    const before = cardsOf(quick.id).length;
    scripts.orb.push(
      {
        toolCalls: [
          { id: 'call_q_deep', name: 'deep_research', arguments: { input: 'Globex effects', processor: 'core' } },
          { id: 'call_q_find', name: 'find_entities', arguments: { objective: 'Globex papers', wait: true } },
          {
            id: 'call_q_batch',
            name: 'batch_enrich',
            arguments: { rows: [{ name: 'Paper' }], output_json_schema: { type: 'object', properties: { year: { type: 'string', description: 'Year' } } } },
          },
          { id: 'call_q_answer', name: 'web_answer', arguments: { question: 'What is Globex?' } },
        ],
      },
      { text: 'Quick scan only.' },
    );
    await wire.orb.chat.send(quick.id, { text: 'Research Globex.' });
    const after = await waitFor(() => byAgent.orb.find((r) => 'call_q_batch' in toolResults(r)));
    const out = toolResults(after);
    for (const id of ['call_q_deep', 'call_q_find', 'call_q_batch'])
      expect(JSON.parse(out[id]!), id).toMatchObject({ refused: true, message: expect.stringMatching(/Quick scan depth tier.*does not allow/) });
    expect(JSON.parse(out.call_q_answer!)).not.toHaveProperty('refused');
    expect(parallel.count('POST', '/v1/tasks/runs')).toBe(runs);
    expect(parallel.count('POST', '/v1beta/findall/runs')).toBe(findalls);
    expect(cardsOf(quick.id).length).toBe(before);
  }, 60_000);
});
