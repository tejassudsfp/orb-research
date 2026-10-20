/** A real sidecar must keep a prematurely finishing model working until all ten frames have data. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { databaseDataOf, fold, type AgentStatus, type BoardState } from '@orb/shared';
import { startMockedSidecar, type MockedSidecar } from '../../../scripts/testkit/index.ts';
import { readSessionLog } from '../../../scripts/testkit/sessionLog.ts';
import { createWire, type Wire } from '../src/wire/index.js';

let sc: MockedSidecar;
let wire: Wire;
afterEach(async () => {
  wire?.dispose();
  await sc?.stop();
});

it('does not let the supervisor cancel a productive researcher just because its rows have not arrived', async () => {
  let frameId = '';
  let rootCalls = 0;
  let scoutCalls = 0;
  let stopResult: any;
  let repeatedAssignment: any;
  sc = await startMockedSidecar({
    llm: {
      defaultTurn: (req) => {
        const scout = JSON.stringify(req.body.messages[0]).includes('You are Scout');
        if (scout)
          return ++scoutCalls === 1
            ? {
                firstDelayMs: 400,
                toolCalls: [
                  {
                    id: 'late_evidence',
                    name: 'place_card',
                    arguments: {
                      type: 'source',
                      frameId,
                      title: 'Researched evidence',
                      url: 'https://example.com/evidence',
                      body: 'The source gathering pass has produced a finding.',
                      why: 'Evidence arrived after research.',
                    },
                  },
                ],
              }
            : { text: 'Source saved.' };
        const n = ++rootCalls;
        if (n === 1)
          return {
            toolCalls: [
              {
                id: 'start_researcher',
                name: 'delegate',
                arguments: {
                  role: 'scout',
                  frameIds: [frameId],
                  instruction: 'Research this section and save the evidence.',
                },
              },
            ],
          };
        if (n === 2)
          return {
            toolCalls: [
              {
                id: 'repeat_assignment',
                name: 'delegate',
                arguments: {
                  role: 'scout',
                  frameIds: [frameId],
                  instruction: 'Finish the same assigned frame.',
                },
              },
            ],
          };
        for (const m of req.body.messages)
          if (m.role === 'tool' && m.tool_call_id === 'repeat_assignment')
            repeatedAssignment = JSON.parse(m.content);
        if (n === 3)
          return { toolCalls: [{ id: 'premature_stop', name: 'stop_agent', arguments: { agent: 'scout' } }] };
        for (const m of req.body.messages)
          if (m.role === 'tool' && m.tool_call_id === 'premature_stop') stopResult = JSON.parse(m.content);
        return { text: 'Waiting for the active research batch.' };
      },
    },
  });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const meta = await wire.orb.canvas.create({ prompt: 'Research the section', start: false });
  const added = await wire.orb.board.command(meta.id, {
    type: 'frame.added',
    frame: { title: 'Evidence', color: 'sky', x: 0, y: 0, w: 700, h: 500 },
  });
  frameId = (added.events[0]!.data as any).frame.id;
  await wire.orb.chat.send(meta.id, { text: 'Research this section and fill the board.' });
  await expect
    .poll(() => Object.values(board(meta.id).cards).some((c) => c.type === 'source'), { timeout: 20_000 })
    .toBe(true);
  expect(stopResult).toMatchObject({ agent: 'scout', stopped: false, working: true });
  expect(repeatedAssignment).toMatchObject({ agent: 'scout', started: false, working: true });
  expect(
    sc.llm.requests
      .filter((r) => JSON.stringify(r.body.messages[0]).includes('You are Scout'))
      .some((r) => r.aborted),
  ).toBe(false);
});
const board = (id: string): BoardState =>
  fold(
    readFileSync(join(sc.paths.orbHome, 'canvases', id, 'board.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  );

it.each([true, false])(
  'reviews all populated frames and checks final consistency before completing detailed work (team=%s)',
  async (team) => {
    const calls = { orb: 0, critic: 0, builder: 0 };
    sc = await startMockedSidecar({
      llm: {
        defaultTurn: (req) => {
          const system = JSON.stringify(req.body.messages[0]);
          const role = system.includes('You are Critic')
            ? 'critic'
            : system.includes('You are Builder')
              ? 'builder'
              : 'orb';
          calls[role]++;
          return { text: 'The populated research is reviewed.' };
        },
      },
    });
    wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
    const meta = await wire.orb.canvas.create({ prompt: 'Existing populated research', start: false });
    for (let i = 0; i < 3; i++) {
      const added = await wire.orb.board.command(meta.id, {
        type: 'frame.added',
        frame: { title: `Research ${i}`, color: 'sky', x: i * 800, y: 0, w: 700, h: 500 },
      });
      await wire.orb.board.command(meta.id, {
        type: 'card.added',
        card: {
          type: 'doc',
          frameId: (added.events[0]!.data as any).frame.id,
          x: i * 800 + 24,
          y: 48,
          w: 280,
          h: 200,
          data: {
            title: `Analysis ${i}`,
            body: 'Evidence and implications with a recommendation and explicit limits. '.repeat(18),
          },
        },
      });
    }
    const statuses: AgentStatus[] = [];
    const ac = new AbortController();
    const following = (async () => {
      try {
        for await (const s of wire.orb.agents.status(meta.id, { signal: ac.signal })) statuses.push(s);
      } catch {
        /* stream closed */
      }
    })();
    try {
      await wire.orb.chat.send(meta.id, {
        text: `Complete the whole board with detailed research and final recommendations.${team ? '' : ' Do not use agents or team.'}`,
      });
      await expect
        .poll(
          () =>
            statuses.some((s) => s.agent === 'orb' && s.state === 'idle' && s.research?.state === 'complete'),
          { timeout: 20_000 },
        )
        .toBe(true);
      expect(calls.critic > 0).toBe(team);
      expect(calls.builder > 0).toBe(team);
      const finalChecks = readSessionLog(sc.paths.dshHome, meta.rootSessionId!).filter(
        (e) => e.type === 'user/message' && e.data?.source?.summary === 'Final research consistency check.',
      );
      expect(finalChecks).toHaveLength(1);
      expect(calls.orb).toBeLessThan(8);
      await expect.poll(() => Object.keys(board(meta.id).frames)).toHaveLength(3);
    } finally {
      ac.abort();
      await following;
    }
  },
);

it('repairs the missing three of ten databases after the model says done at 70 percent', async () => {
  let id = '';
  let repaired = false;
  let review = '';
  sc = await startMockedSidecar({
    llm: {
      defaultTurn: (req) => {
        const text = JSON.stringify(req.body.messages);
        if (!repaired && text.includes('<research-review>')) {
          repaired = true;
          review = text;
          const datasets = req.body.messages
            .filter((m: any) => m.role === 'tool')
            .map((m: any) => {
              try {
                return JSON.parse(m.content).datasetId;
              } catch {
                return undefined;
              }
            })
            .filter(Boolean)
            .slice(7, 10);
          return {
            toolCalls: datasets.map((datasetId: string, i: number) => ({
              id: `repair_${i}`,
              name: 'upsert_rows',
              arguments: {
                datasetId,
                key: 'Name',
                rows: [{ values: { Name: `Result ${i}`, Source: 'https://example.com/evidence' } }],
              },
            })),
          };
        }
        return { text: 'The researched data is on the board.' };
      },
    },
  });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const meta = await wire.orb.canvas.create({ prompt: 'Research all ten sections', start: false });
  id = meta.id;
  const frames: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = await wire.orb.board.command(id, {
      type: 'frame.added',
      frame: { title: `Section ${i + 1}`, color: 'sky', x: i * 750, y: 100, w: 700, h: 500 },
    });
    frames.push((r.events[0]!.data as any).frame.id);
  }
  sc.llm.enqueue(
    {
      toolCalls: frames.map((frameId, i) => ({
        id: `data_${i}`,
        name: 'place_card',
        arguments: {
          type: 'database',
          title: `Data ${i + 1}`,
          frameId,
          columns: ['Name', 'Source'],
          rows: i < 7 ? [[`Evidence ${i}`, 'https://example.com/evidence']] : [],
          why: 'Answers this section with evidence.',
        },
      })),
    },
    { text: 'Done. All ten sections are ready.' },
  );
  const statuses: AgentStatus[] = [];
  const ac = new AbortController();
  const following = (async () => {
    try {
      for await (const s of wire.orb.agents.status(id, { signal: ac.signal })) statuses.push(s);
    } catch (e) {
      if (!ac.signal.aborted) throw e;
    }
  })();
  try {
    await wire.orb.chat.send(id, {
      text: 'Fill all ten frames with only sourced rows, end to end; no analysis.',
    });
    await expect
      .poll(() => statuses.some((s) => s.research?.state === 'complete'), { timeout: 20_000 })
      .toBe(true);
    await expect
      .poll(() => Object.values(board(id).cards).filter((c) => (c.data as any).rowCount > 0).length)
      .toBe(10);
    expect(review).toContain('7/10 frames');
    expect(review).toContain('Section 10');
    expect(statuses.some((s) => s.research?.coveredFrames === 7)).toBe(true);
    // Steering the actual stop boundary continues the SAME user turn, rather than faking another user request.
    await expect
      .poll(
        () =>
          readSessionLog(sc.paths.dshHome, meta.rootSessionId!).filter((e) => e.type === 'turn/end').length,
      )
      .toBe(1);
  } finally {
    ac.abort();
    await following;
  }
});

it('brings Critic and Builder back after Scout adds the evidence they were missing', async () => {
  const calls = { orb: 0, scout: 0, critic: 0, builder: 0 };
  let releaseInitialReviews!: () => void;
  const initialReviewsStarted = new Promise<void>((resolve) => {
    releaseInitialReviews = resolve;
  });
  let frameId = '';
  sc = await startMockedSidecar({
    llm: {
      defaultTurn: (req) => {
        const system = JSON.stringify(req.body.messages[0]);
        const role = system.includes('You are Scout')
          ? 'scout'
          : system.includes('You are Critic')
            ? 'critic'
            : system.includes('You are Builder')
              ? 'builder'
              : 'orb';
        const n = ++calls[role];
        if (calls.critic > 0 && calls.builder > 0) releaseInitialReviews();
        if (role === 'orb' && n === 1)
          return {
            toolCalls: (['scout', 'critic', 'builder'] as const).map((r) => ({
              id: `delegate_${r}`,
              name: 'delegate',
              arguments: {
                role: r,
                frameIds: [frameId],
                instruction: 'Research, review and visualise the evidence in this frame.',
              },
            })),
          };
        if (role === 'scout' && n === 1)
          return {
            // Child creation can exceed 200 ms under load. Capture both initial assignments before the new
            // evidence arrives, so this proves stale-review refresh rather than relying on scheduling luck.
            holdUntil: () => initialReviewsStarted,
            toolCalls: [
              {
                id: 'evidence',
                name: 'place_card',
                arguments: {
                  type: 'source',
                  frameId,
                  title: 'New evidence',
                  url: 'https://example.com/evidence',
                  body: 'A sourced comparison is now available.',
                  why: 'Evidence for the decision.',
                },
              },
            ],
          };
        if (role === 'critic' && n === 2)
          return {
            toolCalls: [
              {
                id: 'reviewed',
                name: 'place_card',
                arguments: {
                  type: 'risk',
                  frameId,
                  title: 'Evidence reviewed',
                  body: 'The sourced comparison still needs a second independent confirmation.',
                  why: 'Review of the evidence Scout added.',
                },
              },
            ],
          };
        if (role === 'builder' && n === 2)
          return {
            toolCalls: [
              {
                id: 'visualised',
                name: 'place_card',
                arguments: {
                  type: 'table',
                  frameId,
                  title: 'Evidence comparison',
                  columns: ['Finding', 'Source'],
                  rows: [['A sourced finding', 'https://example.com/evidence']],
                  why: 'Comparison built after research.',
                },
              },
            ],
          };
        return { text: n === 1 ? 'Waiting for source evidence.' : 'This pass is done.' };
      },
    },
  });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const meta = await wire.orb.canvas.create({ prompt: 'Research and review this comparison', start: false });
  const added = await wire.orb.board.command(meta.id, {
    type: 'frame.added',
    frame: { title: 'Comparison', color: 'sky', x: 100, y: 100, w: 1000, h: 700 },
  });
  frameId = (added.events[0]!.data as any).frame.id;
  try {
    await wire.orb.chat.send(meta.id, {
      text: 'Research this, then critique the evidence and build a comparison.',
    });
    await expect
      .poll(
        () =>
          Object.values(board(meta.id).cards)
            .map((c) => c.type)
            .sort(),
        { timeout: 20_000 },
      )
      .toEqual(['risk', 'source', 'table']);
    // Board writes are visible before the model receives their tool results. Wait for both resumed reviews
    // to consume those results rather than sampling the request counters in that publication gap.
    await expect.poll(() => calls.critic).toBeGreaterThanOrEqual(3);
    await expect.poll(() => calls.builder).toBeGreaterThanOrEqual(3);
    await expect
      .poll(
        () =>
          readSessionLog(sc.paths.dshHome, meta.rootSessionId!).filter(
            (e) => e.type === 'user/message' && e.data?.source?.kind === 'orb-research-review',
          ).length,
      )
      .toBeGreaterThan(0);
    const log = readSessionLog(sc.paths.dshHome, meta.rootSessionId!);
    expect(log.filter((e) => e.type === 'user/message' && e.data?.source?.kind === 'user')).toHaveLength(1);
  } finally {
    releaseInitialReviews();
  }
});

it('refreshes reviews when Orb reconciles dataset inputs after assigning the team', async () => {
  let frameId = '';
  let datasetId = '';
  const calls = { orb: 0, critic: 0, builder: 0 };
  sc = await startMockedSidecar({
    llm: {
      defaultTurn: (req) => {
        const system = JSON.stringify(req.body.messages[0]);
        const role = system.includes('You are Critic')
          ? 'critic'
          : system.includes('You are Builder')
            ? 'builder'
            : 'orb';
        const n = ++calls[role];
        if (role !== 'orb') return { text: 'Reviewed the current inputs.' };
        if (n === 1)
          return {
            toolCalls: [
              {
                id: 'budget',
                name: 'place_card',
                arguments: {
                  type: 'database',
                  frameId,
                  title: 'Budget',
                  columns: ['Name', 'Estimate'],
                  rows: [['Active plan', '100']],
                  why: 'One active scenario.',
                },
              },
            ],
          };
        if (n === 2) {
          for (const m of req.body.messages)
            if (m.role === 'tool' && m.tool_call_id === 'budget') datasetId = JSON.parse(m.content).datasetId;
          return {
            toolCalls: (['critic', 'builder'] as const).map((role) => ({
              id: `assign_${role}`,
              name: 'delegate',
              arguments: {
                role,
                frameIds: [frameId],
                instruction: 'Review the budget and visualise the current total.',
              },
            })),
          };
        }
        if (n === 3)
          return {
            firstDelayMs: 200,
            toolCalls: [
              {
                id: 'reconcile',
                name: 'upsert_rows',
                arguments: {
                  datasetId,
                  key: 'Name',
                  rows: [{ values: { Name: 'Active plan', Estimate: '200' } }],
                },
              },
            ],
          };
        return { text: 'The research inputs are reconciled.' };
      },
    },
  });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const meta = await wire.orb.canvas.create({ prompt: 'Review the budget', start: false });
  const f = await wire.orb.board.command(meta.id, {
    type: 'frame.added',
    frame: { title: 'Budget', color: 'sky', x: 0, y: 0, w: 900, h: 700 },
  });
  frameId = (f.events[0]!.data as any).frame.id;
  await wire.orb.chat.send(meta.id, {
    text: 'Finish the whole board and refresh all reviews after reconciling the budget.',
  });
  await expect.poll(() => calls.critic >= 2 && calls.builder >= 2, { timeout: 20_000 }).toBe(true);
  expect(
    sc.llm.requests
      .filter((r) => JSON.stringify(r.body.messages[0]).includes('You are Builder'))
      .some((r) => JSON.stringify(r.body.messages).includes('Research inputs have changed')),
  ).toBe(true);
});

it('requires fresh full-frame coverage after a newer focused review instead of reusing old assignment history', async () => {
  const frames: string[] = [];
  const calls = { orb: 0, critic: 0, builder: 0 };
  let datasetId = '';
  sc = await startMockedSidecar({
    llm: {
      defaultTurn: (req) => {
        const system = JSON.stringify(req.body.messages[0]);
        const role = system.includes('You are Critic')
          ? 'critic'
          : system.includes('You are Builder')
            ? 'builder'
            : 'orb';
        const n = ++calls[role];
        if (role !== 'orb') return { text: 'Reviewed the assigned current sections.' };
        if (n === 1)
          return {
            toolCalls: (['critic', 'builder'] as const).map((role) => ({
              id: `initial_${role}`,
              name: 'delegate',
              arguments: { role, frameIds: frames, instruction: 'Review every section.' },
            })),
          };
        if (n === 2)
          return {
            firstDelayMs: 200,
            toolCalls: [
              {
                id: 'changed_input',
                name: 'upsert_rows',
                arguments: {
                  datasetId,
                  key: 'Name',
                  rows: [{ values: { Name: 'New evidence', Estimate: '200' } }],
                },
              },
            ],
          };
        if (n === 3)
          return {
            toolCalls: [
              {
                id: 'focused_review',
                name: 'delegate',
                arguments: {
                  role: 'critic',
                  frameIds: [frames[0]],
                  instruction: 'Re-review only this changed section.',
                },
              },
            ],
          };
        return { text: 'Current evidence and review findings reconciled.' };
      },
    },
  });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const meta = await wire.orb.canvas.create({ prompt: 'Fresh review coverage', start: false });
  for (let i = 0; i < 3; i++) {
    const added = await wire.orb.board.command(meta.id, {
      type: 'frame.added',
      frame: { title: `Section ${i}`, color: 'sky', x: i * 800, y: 0, w: 700, h: 600 },
    });
    const frameId = (added.events[0]!.data as any).frame.id;
    frames.push(frameId);
    await wire.orb.board.command(meta.id, {
      type: 'card.added',
      card: {
        type: 'doc',
        frameId,
        x: i * 800 + 24,
        y: 48,
        w: 280,
        h: 200,
        data: {
          title: `Assessment ${i}`,
          body: 'Supported finding with assumptions, alternatives and a useful recommendation. '.repeat(18),
        },
      },
    });
  }
  const imported = await wire.data.import(meta.id, {
    name: 'Budget',
    format: 'csv',
    body: 'Name,Estimate\nActive,100\n',
  });
  datasetId = imported.id;
  const ds = await wire.data.read(meta.id, datasetId);
  await wire.orb.board.command(meta.id, {
    type: 'card.added',
    card: {
      type: 'database',
      frameId: frames[0],
      x: 24,
      y: 300,
      w: 560,
      h: 250,
      data: databaseDataOf(ds.name, ds),
    },
  });
  await wire.orb.chat.send(meta.id, {
    text: 'Complete the whole board with detailed research and current reviews.',
  });
  await expect.poll(() => calls.critic, { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
  const lastReview = sc.llm.requests.findLast((req) =>
    JSON.stringify(req.body.messages[0]).includes('You are Critic'),
  )!;
  const assignment = JSON.stringify(lastReview.body.messages.at(-1));
  for (const frameId of frames) expect(assignment).toContain(frameId);
  await expect.poll(() => calls.builder).toBeGreaterThanOrEqual(2);
});

it('stops bounded no-progress repairs with an incomplete status instead of claiming completion or looping', async () => {
  sc = await startMockedSidecar({ llm: { defaultTurn: { text: 'Done.' } } });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const meta = await wire.orb.canvas.create({ prompt: 'A research database', start: false });
  const f = await wire.orb.board.command(meta.id, {
    type: 'frame.added',
    frame: { title: 'Data', color: 'sky', x: 0, y: 0, w: 700, h: 500 },
  });
  sc.llm.enqueue({
    toolCalls: [
      {
        id: 'empty',
        name: 'place_card',
        arguments: {
          type: 'database',
          frameId: (f.events[0]!.data as any).frame.id,
          title: 'Still empty',
          columns: ['Name'],
          rows: [],
          why: 'Research this list.',
        },
      },
    ],
  });
  await wire.orb.chat.send(meta.id, { text: 'Fill the database.' });
  await expect
    .poll(() => readSessionLog(sc.paths.dshHome, meta.rootSessionId!).some((e) => e.type === 'turn/end'), {
      timeout: 20_000,
    })
    .toBe(true);
  expect(sc.llm.requests.length).toBeLessThanOrEqual(6);
  const ac = new AbortController();
  try {
    const s = await wire.orb.agents.status(meta.id, { signal: ac.signal }).next();
    expect(s.value).toMatchObject({
      state: 'idle',
      research: { state: 'incomplete', coveredFrames: 0, totalFrames: 1 },
    });
  } finally {
    ac.abort();
  }
});

it('keeps a focused card edit within its frame while reporting the whole board honestly', async () => {
  sc = await startMockedSidecar({ llm: { defaultTurn: { text: 'Updated this source.' } } });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const meta = await wire.orb.canvas.create({ prompt: 'Two independent research sections', start: false });
  let frameId = '';
  for (const title of ['Current source', 'Unrelated unfinished section']) {
    const added = await wire.orb.board.command(meta.id, {
      type: 'frame.added',
      frame: { title, color: 'sky', x: frameId ? 800 : 0, y: 0, w: 700, h: 500 },
    });
    if (!frameId) frameId = (added.events[0]!.data as any).frame.id;
  }
  const detail =
    'The source establishes the basis for this finding and explains the limits of its sample.\n\nAn alternative explanation remains plausible; the next step is to compare independent evidence before making a recommendation.';
  sc.llm.enqueue({
    toolCalls: [
      {
        id: 'focused',
        name: 'place_card',
        arguments: {
          type: 'source',
          frameId,
          title: 'Focused evidence',
          url: 'https://example.com/evidence',
          body: 'Summary of this finding.',
          detail,
          why: 'Supports this section.',
        },
      },
    ],
  });
  await wire.orb.chat.send(meta.id, { text: 'Add this source to the current section only.' });
  await expect
    .poll(() => readSessionLog(sc.paths.dshHome, meta.rootSessionId!).some((e) => e.type === 'turn/end'), {
      timeout: 20_000,
    })
    .toBe(true);
  expect(sc.llm.requests).toHaveLength(2);
  await expect.poll(() => Object.values(board(meta.id).cards)[0]?.detail).toBe(detail);
  const ac = new AbortController();
  try {
    const status = await wire.orb.agents.status(meta.id, { signal: ac.signal }).next();
    expect(status.value).toMatchObject({
      research: { state: 'incomplete', coveredFrames: 1, totalFrames: 2 },
    });
  } finally {
    ac.abort();
  }
});

it('checks a full-board request even when the model says done without calling any tool', async () => {
  sc = await startMockedSidecar({ llm: { defaultTurn: { text: 'Done.' } } });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const meta = await wire.orb.canvas.create({ prompt: 'Research these sections', start: false });
  await wire.orb.board.command(meta.id, {
    type: 'frame.added',
    frame: { title: 'Unfinished evidence', color: 'sky', x: 0, y: 0, w: 700, h: 500 },
  });
  await wire.orb.chat.send(meta.id, { text: 'Finish the whole board.' });
  await expect
    .poll(() => readSessionLog(sc.paths.dshHome, meta.rootSessionId!).some((e) => e.type === 'turn/end'), {
      timeout: 20000,
    })
    .toBe(true);
  expect(sc.llm.requests.length).toBeGreaterThan(1);
  expect(sc.llm.requests.length).toBeLessThanOrEqual(4);
  const ac = new AbortController();
  try {
    const status = await wire.orb.agents.status(meta.id, { signal: ac.signal }).next();
    expect(status.value).toMatchObject({
      research: { state: 'incomplete', coveredFrames: 0, totalFrames: 1 },
    });
  } finally {
    ac.abort();
  }
});
