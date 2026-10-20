/**
 * P6.11 contract test: a v2 template run end to end on a REAL sidecar (mock LLM scripted per agent, mock Parallel).
 * Group: investing (VC due diligence). Each agent's model script FOLLOWS ITS PLAYBOOK, and the test proves the
 * playbook is what reached the model and what the scripted tool calls did to the board:
 *   - the new-canvas turn carries Orb's playbook (intake, tier, rubric, memo); each child's first assignment carries
 *     its own (steps in order, its frames with real ids, target mix), never the persona; a later assignment does not;
 *   - Scout works the Team and Competitors databases of the template with upsert_rows (one row per founder, the
 *     competitors), runs find_entities and a core deep_research on the Standard tier, and is refused pro (tier gate);
 *   - Critic clears or raises red flags as cards in the Risks frame and turns a gap into a Question card in 12;
 *   - Builder binds a chart to the template's Market sizing inputs database;
 *   - Orb fills a Snapshot metric seed (update_card) and the Scorecard seed;
 *   - on the Quick tier the costly Parallel tools are refused before anything is placed or spent;
 *   - an invalid intake is refused by the wire; the follow-up chips are computed from the intake.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

const spec = specOf('vc-dd')!;
const frameId = (frames: Frame[], title: string) => frames.find((f) => f.title === title)!.id;
const intake = {
  company: 'Acme Robotics',
  website: 'https://acme.com',
  stage: 'Series A',
  round_amount: '$12M',
  thesis: 'Warehouse robots that pay back in a year',
  concerns: 'Hardware margins',
  founders: 'Ada Lovelace, https://linkedin.com/in/ada',
  competitors: 'Rival One, Rival Two',
  sites: ['crunchbase.com'],
};

describe('the intake is validated by the wire', () => {
  it('refuses an intake without the required fields and leaves no canvas behind', async () => {
    const before = (await wire.orb.canvas.list()).length;
    await expect(
      wire.orb.canvas.create({
        prompt: 'x',
        template: 'vc-dd',
        intake: { company: 'Acme', website: 'nope' },
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/intake is not valid.*Website URL/) });
    expect((await wire.orb.canvas.list()).length).toBe(before);
  });
});

describe('VC due diligence, Standard tier: the agents follow the playbook', () => {
  let canvas: CanvasMeta;
  let frames: Frame[];
  let orbTurnEnded: () => Promise<void>;

  it('starts from the intake with every frame, seed and database; materials can be added before Orb starts', async () => {
    canvas = await wire.orb.canvas.create({
      prompt: 'Acme Robotics: VC due diligence',
      template: 'vc-dd',
      intake,
      depth: 'standard',
    });
    frames = framesOf(canvas.id);
    expect(frames.map((f) => f.title)).toEqual(spec.frames.map((f) => f.title));
    expect(cardsOf(canvas.id)).toHaveLength(spec.frames.reduce((n, f) => n + f.seeds.length, 0));
    expect(metaOf(canvas.id)).toMatchObject({
      template: 'vc-dd',
      depth: 'standard',
      intake: { company: 'Acme Robotics', founders: intake.founders },
    });
    // No Orb turn yet: start was not asked for (the materials come first).
    expect(byAgent.orb).toHaveLength(0);
  });

  it('Orb and its team run the playbook (scripted): read, delegate, fill, score', async () => {
    const team = frameId(frames, 'Founders & team');
    const market = frameId(frames, 'Market');
    const competition = frameId(frames, 'Competition');
    const risks = frameId(frames, 'Risks & red flags');
    const questions = frameId(frames, 'Open questions for founders');
    const product = frameId(frames, 'Problem & product');
    const cards = cardsOf(canvas.id);
    const dbCard = (title: string) =>
      cards.find((c) => c.type === 'database' && (c.data as { title: string }).title === title)!;
    const teamDb = dbCard('Team');
    const rivalsDb = dbCard('Competitors');
    const sizingDb = dbCard('Market sizing inputs');
    const foundedMetric = cards.find(
      (c) => c.type === 'metric' && (c.data as { title: string }).title === 'Founded',
    )!;

    orbTurnEnded = () =>
      expect.poll(() => byAgent.orb[1]?.completed === true, { timeout: 30_000, interval: 20 }).toBe(true);
    const held = { holdUntil: orbTurnEnded, firstDelayMs: 200 } as const;

    // Orb, step 2 of its playbook: delegate (Scout, Builder, Critic), then fill the Snapshot seed after Scout's pass.
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_d_scout',
            name: 'delegate',
            arguments: {
              role: 'scout',
              frameIds: [team, market, competition, product],
              instruction: 'Founders from the intake first, then competitors and market.',
            },
          },
          {
            id: 'call_d_builder',
            name: 'delegate',
            arguments: { role: 'builder', frameIds: [market], instruction: 'The market size chart.' },
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
    // Scout, steps 2 (founders), 4 (competitors via find_entities then upsert), 8 (deep research, core), pro refused.
    scripts.scout.push(
      {
        toolCalls: [
          { id: 'call_s_p1', name: 'report_progress', arguments: { status: 'Founders', frameId: team } },
        ],
        ...held,
      },
      {
        toolCalls: [
          {
            id: 'call_s_person',
            name: 'place_card',
            arguments: {
              type: 'entity',
              frameId: team,
              title: 'Ada Lovelace',
              entityKind: 'person',
              role: 'CEO',
              url: 'https://linkedin.com/in/ada',
              body: 'Founder and CEO of Acme Robotics.',
              why: 'Founder from the intake.',
            },
          },
          {
            id: 'call_s_team_row',
            name: 'upsert_rows',
            arguments: {
              cardId: teamDb.id,
              key: 'Name',
              rows: [
                {
                  values: {
                    Name: 'Ada Lovelace',
                    Role: 'CEO',
                    LinkedIn: 'https://linkedin.com/in/ada',
                    Source: 'https://acme.com/about',
                    'Tenure (years)': 4,
                  },
                },
              ],
            },
          },
          {
            id: 'call_s_rows',
            name: 'upsert_rows',
            arguments: {
              cardId: rivalsDb.id,
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
                    Category: 'Indirect',
                    'Threat level': 2,
                    Source: 'https://rival2.example',
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
            id: 'call_s_find',
            name: 'find_entities',
            arguments: {
              objective: 'Warehouse robotics startups',
              match_limit: 5,
              frameId: competition,
              wait: true,
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_deep_pro',
            name: 'deep_research',
            arguments: { input: 'The warehouse robotics market', processor: 'pro', frameId: market },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_s_deep_core',
            name: 'deep_research',
            arguments: {
              input: 'The warehouse robotics market',
              processor: 'core',
              title: 'Warehouse robotics market',
              frameId: market,
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
            arguments: { about: 'done', message: 'Founders, competitors and market are in.' },
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
            arguments: { status: 'Market chart', frameId: market },
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
              frameId: market,
              title: 'Market size build-up',
              mark: 'bar',
              x: 'Assumption',
              y: 'Value',
              datasetId: DatabaseData.parse(sizingDb.data).datasetId,
              why: 'Built from the Market sizing inputs.',
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_b_done',
            name: 'send_message',
            arguments: { about: 'done', message: 'Chart placed in Market.' },
          },
        ],
      },
      { text: 'Done.' },
    );
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
              title: 'RF04 raised: ARR has no independent source',
              body: 'Only the deck states $4M ARR.',
              why: 'Claimed-only revenue.',
            },
          },
          {
            id: 'call_c_cleared',
            name: 'place_card',
            arguments: {
              type: 'insight',
              frameId: risks,
              title: 'RF14 cleared: no breach in the sources',
              body: 'The status page shows no incident; no news of a breach.',
              citations: [cards.find((c) => c.type === 'checklist' && c.frameId === risks)!.id, teamDb.id],
              why: 'Cleared with a source.',
            },
          },
          {
            id: 'call_c_q',
            name: 'place_card',
            arguments: {
              type: 'question',
              frameId: questions,
              title: 'Can you share customer revenue by account?',
              body: 'Gap behind RF06: concentration is not knowable.',
              why: 'A gap becomes a question.',
            },
          },
          // The Critic cannot change a database (not in its tools): the call is refused.
          {
            id: 'call_c_upsert',
            name: 'upsert_rows',
            arguments: { cardId: teamDb.id, rows: [{ values: { Name: 'x' } }] },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: 'call_c_done',
            name: 'send_message',
            arguments: { about: 'done', message: 'RF04 raised; RF14 cleared; one question.' },
          },
        ],
      },
      { text: 'Done.' },
    );

    await wire.orb.canvas.start(canvas.id);

    // 1. Orb's new-canvas turn carries its playbook with the intake, the tier, the rubric and the memo.
    const orbFirst = await waitFor(() => byAgent.orb[0]);
    const orbText = allText(orbFirst);
    expect(orbText).toContain('The VC due diligence playbook');
    expect(orbText).toContain('- Company name: Acme Robotics');
    expect(orbText).toContain('- Round amount: $12M');
    expect(orbText).toContain('Depth: Standard');
    expect(orbText).toContain('Team (25%)');
    expect(orbText).toContain('Investment memo: Acme Robotics');
    expect(orbText).toContain('The frames hold seed cards');
    for (const f of frames) expect(orbText).toContain(`[${f.id}]`);
    expect(systemOf(orbFirst)).not.toMatch(/playbook/i);

    // 2. Each child's FIRST assignment carries its playbook; its persona does not.
    const scoutFirst = await waitFor(() => byAgent.scout[0]);
    const scoutText = allText(scoutFirst);
    expect(scoutText).toContain('Your playbook, in this order:');
    expect(scoutText).toContain(`"Founders & team" [${team}]`);
    expect(scoutText).toContain('Target mix:');
    expect(scoutText).toContain('crunchbase.com'); // the ticked signed-in source
    expect(scoutText).not.toContain('The red-flag checklist');
    expect(scoutText.indexOf('Founders: start from the founders')).toBeLessThan(
      scoutText.indexOf('Competitors: add the known competitors'),
    );
    expect(systemOf(scoutFirst)).not.toMatch(/playbook/i);
    const criticFirst = await waitFor(() => byAgent.critic[0]);
    const criticText = allText(criticFirst);
    for (const f of spec.redFlags) expect(criticText).toContain(f.id);
    expect(criticText).toContain(`"Risks & red flags" [${risks}]`);
    const builderFirst = await waitFor(() => byAgent.builder[0]);
    expect(allText(builderFirst)).toContain(`"Market" [${market}]`);

    // 3. Scout's playbook calls did what the playbook says.
    const scoutDone = await waitFor(() => byAgent.scout.find((r) => 'call_s_deep_core' in toolResults(r)));
    const results = toolResults(scoutDone);
    const teamDs = datasetOf(canvas.id, DatabaseData.parse(teamDb.data).datasetId);
    expect(teamDs.rows).toHaveLength(1);
    expect(teamDs.rows[0]).toMatchObject({ by: 'scout' });
    expect(teamDs.rows[0]!.cells[teamDs.columns.find((c) => c.name === 'Name')!.id]).toBe('Ada Lovelace');
    const rivalsDs = datasetOf(canvas.id, DatabaseData.parse(rivalsDb.data).datasetId);
    expect(rivalsDs.rows.map((r) => r.cells[rivalsDs.columns.find((c) => c.name === 'Name')!.id])).toEqual([
      'Rival One',
      'Rival Two',
    ]);
    // The enum and rating columns of the template took their values.
    expect(rivalsDs.rows[0]!.cells[rivalsDs.columns.find((c) => c.name === 'Threat level')!.id]).toBe(4);
    // find_entities ran on Standard and filled a database card of its own in the Competition frame (a run card + database).
    expect(JSON.parse(results.call_s_find!)).toMatchObject({ status: 'completed' });
    const inCompetition = cardsOf(canvas.id).filter((c) => c.frameId === competition);
    expect(inCompetition.some((c) => c.type === 'research')).toBe(true);
    expect(inCompetition.filter((c) => c.type === 'database').length).toBeGreaterThanOrEqual(2); // the template's + the run's
    // The tier gate refused pro (Standard allows lite, base, core) before anything was placed or spent.
    expect(JSON.parse(results.call_s_deep_pro!)).toMatchObject({
      refused: true,
      message: expect.stringMatching(/allows the processors lite, base, core for deep_research, not pro/),
    });
    expect(JSON.parse(results.call_s_deep_core!)).toMatchObject({ status: 'completed' });
    const taskRuns = parallel.count('POST', '/v1/tasks/runs');
    expect(taskRuns).toBe(1); // only the core run reached Parallel

    // 4. Builder bound its chart to the template's database.
    const chart = await waitFor(() =>
      cardsOf(canvas.id).find((c) => c.type === 'chart' && c.provenance.kind === 'agent'),
    );
    expect(chart.provenance).toMatchObject({ kind: 'agent', agent: 'builder' });
    expect(chart.frameId).toBe(market);
    expect(ChartData.parse(chart.data).source).toEqual({
      kind: 'dataset',
      datasetId: DatabaseData.parse(sizingDb.data).datasetId,
    });

    // 5. Critic's cards sit in its frames with its role; its upsert was refused (a Critic cannot change a database).
    await waitFor(
      () =>
        cardsOf(canvas.id).filter(
          (c) => c.provenance.kind === 'agent' && (c.provenance as any).agent === 'critic',
        ).length >= 3,
    );
    const mine = cardsOf(canvas.id).filter(
      (c) => c.provenance.kind === 'agent' && (c.provenance as any).agent === 'critic',
    );
    expect(mine.map((c) => [c.type, c.frameId])).toEqual([
      ['risk', risks],
      ['insight', risks],
      ['question', questions],
    ]);
    const criticAfter = await waitFor(() => byAgent.critic.find((r) => 'call_c_upsert' in toolResults(r)));
    expect(toolResults(criticAfter)['call_c_upsert']).toMatch(
      /not available to the critic|not found|unknown tool/i,
    );
    expect(AGENT_TOOLS.critic).not.toContain('upsert_rows');
    expect(teamDs.rows).toHaveLength(1);

    // 6. Orb, step 3: after Scout's first pass it fills the Snapshot seed with a cited figure (scripted now).
    const scorecard = cards.find(
      (c) => c.type === 'matrix' && (c.data as { title: string }).title.startsWith('Scorecard'),
    )!;
    const decision = cards.find((c) => c.type === 'decision')!;
    const rubric = spec.rubric;
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_o_metric',
            name: 'update_card',
            arguments: {
              cardId: foundedMetric.id,
              value: '2021',
              period: 'incorporation',
              sourceUrl: 'https://acme.com/about',
              why: 'From the about page.',
            },
          },
          // The rubric (playbook step 'rubric'): one score per dimension in the matrix's order, doubled (10 is a 5).
          {
            id: 'call_o_score',
            name: 'update_card',
            arguments: {
              cardId: scorecard.id,
              options: [
                {
                  name: 'orb score',
                  scores: [8, 6, 6, 4, 6, 6],
                  note: 'Team 4, Market 3, Product 3, Traction 2, Model 3, Deal 3: cited in the cards.',
                },
                { name: 'Your score', scores: [null, null, null, null, null, null] },
              ],
              why: 'Scores cite the Team and Market cards.',
            },
          },
          {
            id: 'call_o_decision',
            name: 'update_card',
            arguments: {
              cardId: decision.id,
              rationale: 'Weighted total 3.3 of 5: take a meeting. Team is strong; traction is claimed only.',
              why: 'Proposed, not decided.',
            },
          },
        ],
      },
      { text: 'Filled the snapshot and the scorecard.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'Fill in the snapshot now.' });
    const filled = await waitFor(() => {
      const c = cardsOf(canvas.id).find((x) => x.id === foundedMetric.id);
      return (c?.data as { value?: string })?.value === '2021' ? c : undefined;
    });
    expect(filled.seed).toBe(true); // still a seed card, now filled
    expect((filled.data as { title: string }).title).toBe('Founded');
    // The scorecard keeps the rubric's six weighted dimensions and carries Orb's scores; the decision stays open.
    const scored = await waitFor(() => {
      const c = cardsOf(canvas.id).find((x) => x.id === scorecard.id);
      return (c?.data as { options: { scores: (number | null)[] }[] }).options[0]!.scores[0] === 8
        ? c
        : undefined;
    });
    expect((scored.data as { criteria: { weight: number }[] }).criteria.map((c) => c.weight)).toEqual(
      rubric.map((d) => d.weight),
    );
    const decided = await waitFor(() => {
      const c = cardsOf(canvas.id).find((x) => x.id === decision.id);
      return (c?.data as { rationale?: string })?.rationale ? c : undefined;
    });
    expect(decided.data).toMatchObject({
      status: 'open',
      rationale: expect.stringContaining('Weighted total'),
    });
  }, 120_000);

  it('a later assignment to an existing child does not repeat the playbook', async () => {
    const before = byAgent.scout.length;
    scripts.orb.push(
      {
        toolCalls: [
          {
            id: 'call_d_again',
            name: 'delegate',
            arguments: {
              role: 'scout',
              frameIds: [frameId(frames, 'Customers & signals')],
              instruction: 'Now the reviews.',
            },
          },
        ],
      },
      { text: 'Asked Scout.' },
    );
    await wire.orb.chat.send(canvas.id, { text: 'Scout, look at the reviews too.' });
    const req = await waitFor(() =>
      byAgent.scout.slice(before).find((r) => allText(r).includes('Now the reviews.')),
    );
    // The earlier first assignment is in the history; the new message adds no second playbook.
    const messages = (req.body.messages as any[]).map(textOf);
    expect(messages.filter((t) => t.includes('Your playbook, in this order:'))).toHaveLength(1);
  }, 60_000);

  it("the follow-up chips are the template's, filled with the intake", () => {
    const labels = spec.followUps.map((f) => f.label);
    expect(labels).toContain('Build the bear case');
    expect(JSON.stringify(spec.followUps)).toContain('{{company}}');
  });
});

describe('VC due diligence, Quick tier: the cost guard', () => {
  it('refuses deep_research, find_entities and batch_enrich before anything is placed or spent', async () => {
    // Standard's final, deliberately partial child assignment can still wake its root. Stop that board
    // before giving this Quick board the shared mock responses, so the tier guard is exercised on Quick.
    for (const board of await wire.orb.canvas.list())
      await wire.orb.agents.control(board.id, { agent: 'all', action: 'stop' });
    for (const role of Object.keys(scripts) as Who[]) {
      scripts[role].length = 0;
      byAgent[role].length = 0;
    }
    const quick = await wire.orb.canvas.create({
      prompt: 'Globex: VC due diligence',
      template: 'vc-dd',
      intake: { company: 'Globex', website: 'https://globex.example' },
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
            arguments: { input: 'Globex market', processor: 'core' },
          },
          {
            id: 'call_q_find',
            name: 'find_entities',
            arguments: { objective: 'Globex competitors', wait: true },
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
          { id: 'call_q_extract', name: 'web_answer', arguments: { question: 'What does Globex do?' } },
        ],
      },
      { text: 'Quick scan only.' },
    );
    await wire.orb.chat.send(quick.id, { text: 'Research Globex.' });
    const after = await waitFor(() => byAgent.orb.find((r) => 'call_q_batch' in toolResults(r)));
    const out = toolResults(after);
    for (const id of ['call_q_deep', 'call_q_find', 'call_q_batch'])
      expect(JSON.parse(out[id]!), id).toMatchObject({
        refused: true,
        message: expect.stringMatching(/Quick scan depth tier.*does not allow/),
      });
    // The cheap tool is not gated by the tier.
    expect(JSON.parse(out.call_q_extract!)).not.toHaveProperty('refused');
    expect(parallel.count('POST', '/v1/tasks/runs')).toBe(runs);
    expect(parallel.count('POST', '/v1beta/findall/runs')).toBe(findalls);
    expect(cardsOf(quick.id).length).toBe(before); // no run card either
  }, 60_000);
});
