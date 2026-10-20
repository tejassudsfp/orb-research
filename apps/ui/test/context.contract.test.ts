/** Real harness coverage of the seams that otherwise silently disappear when Orb replaces built-in presets. */
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { startMockedSidecar, type MockedSidecar } from '../../../scripts/testkit/index.ts';
import { readSessionLog } from '../../../scripts/testkit/sessionLog.ts';
import { MOCK_MODEL_ALT, MOCK_PROVIDER } from '../../../scripts/testkit/mockLlm.ts';
import { createWire, type Wire } from '../src/wire/index.js';

let sc: MockedSidecar;
let wire: Wire;
let keptHome: string | undefined;
afterEach(async () => {
  wire?.dispose();
  await sc?.stop();
  if (keptHome) {
    rmSync(keptHome, { recursive: true, force: true });
    keptHome = undefined;
  }
});

it('keeps read output contracts intact while reducing repeated model context, then returns changed data in full', async () => {
  sc = await startMockedSidecar();
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const meta = await wire.orb.canvas.create({ prompt: 'Read context fixture', start: false });
  sc.llm.enqueue(
    { toolCalls: [{ id: 'read_first', name: 'query_board', arguments: {} }] },
    { toolCalls: [{ id: 'read_repeat', name: 'query_board', arguments: {} }] },
    { text: 'Read twice.' },
  );
  await wire.orb.chat.send(meta.id, { text: 'Read the board twice, then reply.' });
  await expect.poll(() => sc.llm.requests.filter((r) => r.completed).length).toBe(3);
  const repeated = sc.llm.requests[2]!.body.messages.find(
    (m: any) => m.role === 'tool' && m.tool_call_id === 'read_repeat',
  );
  expect(JSON.parse(repeated.content)).toMatchObject({ unchanged: true, previousCallId: 'read_first' });
  expect(repeated.content).not.toContain('TOOL_OUTPUT_INVALID');
  await wire.orb.board.command(meta.id, {
    type: 'frame.added',
    frame: { title: 'New evidence', color: 'sky', x: 0, y: 0, w: 700, h: 500 },
  });
  sc.llm.enqueue(
    { toolCalls: [{ id: 'read_changed', name: 'query_board', arguments: {} }] },
    { text: 'Changed data read.' },
  );
  await wire.orb.chat.send(meta.id, { text: 'Read the changed board.' });
  await expect.poll(() => sc.llm.requests.filter((r) => r.completed).length).toBe(5);
  const changed = sc.llm.requests[4]!.body.messages.find(
    (m: any) => m.role === 'tool' && m.tool_call_id === 'read_changed',
  );
  expect(JSON.parse(changed.content).frames[0].title).toBe('New evidence');
});

it('switches existing research and its summaries to the selected model and preserves the checkpoint after restart', async () => {
  const summary =
    '## Primary Request and Intent\nKeep requirement PROJECT-ALPHA and complete its remaining comparison.\n## Current Work\nThe earlier background is recorded.\n## Pending Jobs\nFinish PROJECT-ALPHA with its saved constraints.';
  const llm = {
    defaultTurn: (req: any) => {
      const last = JSON.stringify(req.body.messages.at(-1));
      const compacting = last.includes('acting as a compaction engine');
      const input = Math.ceil(JSON.stringify(req.body.messages).length / 4);
      return {
        text: compacting ? summary : 'Background retained for PROJECT-ALPHA.',
        usage: { input, output: 30 },
      };
    },
  };
  sc = await startMockedSidecar({ llm, keepHome: true });
  expect(readFileSync(sc.logPath, 'utf8')).not.toContain('name mismatch for "compaction-basic"');
  keptHome = join(sc.paths.orbHome, '..');
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const meta = await wire.orb.canvas.create({
    prompt: 'Context checkpoint',
    template: 'trip-planning',
    intake: {
      destination: 'PROJECT-ALPHA',
      dates: '22–30 December 2026',
      budget: 'BUDGET-LIMIT-6000',
      interests: 'Architecture',
    },
    start: false,
  });
  const status = new Map<string, string>();
  const ac = new AbortController();
  const following = (async () => {
    try {
      for await (const s of wire.orb.agents.status(meta.id, { signal: ac.signal }))
        status.set(s.agent, s.state);
    } catch {
      /* closing stream */
    }
  })();
  let sessionId = '';
  for (let i = 0; i < 16; i++) {
    if (i === 3)
      await wire.orb.settings.set({ models: { orb: { provider: MOCK_PROVIDER, model: MOCK_MODEL_ALT } } });
    status.set('orb', 'queued');
    const sent = await wire.orb.chat.send(meta.id, {
      text: `Background batch ${i} for PROJECT-ALPHA. ${'Evidence context for the ongoing comparison. '.repeat(430)} Latest constraint: KEEP-EIGHT-NIGHTS.`,
    });
    sessionId = sent.sessionId;
    await expect.poll(() => status.get('orb'), { timeout: 20_000 }).toBe('idle');
    if (readSessionLog(sc.paths.dshHome, sessionId).some((e) => e.type === 'compaction/end')) break;
  }
  const events = readSessionLog(sc.paths.dshHome, sessionId);
  expect(events.some((e) => e.type === 'compaction/end')).toBe(true);
  const summaries = sc.llm.requests.filter((r) =>
    JSON.stringify(r.body.messages.at(-1)).includes('acting as a compaction engine'),
  );
  expect(summaries.length).toBeGreaterThan(0);
  expect(summaries.every((r) => r.body.model === MOCK_MODEL_ALT)).toBe(true);
  expect(
    events
      .filter((e) => e.type === 'user/message')
      .some((e) => JSON.stringify(e.data).includes('Research checkpoint: resume pending work.')),
  ).toBe(true);
  const checkpoint = events.findLast(
    (e) =>
      e.type === 'user/message' && e.data?.source?.summary === 'Research checkpoint: resume pending work.',
  )!.data.content[0].text;
  for (const part of ['BUDGET-LIMIT-6000', 'KEEP-EIGHT-NIGHTS', 'Your role: orb', 'Unfinished frames:'])
    expect(checkpoint).toContain(part);
  const after = sc.llm.requests.at(-1)!.body.messages;
  expect(JSON.stringify(after)).toContain('PROJECT-ALPHA');
  expect(JSON.stringify(after).length).toBeLessThan(150_000);
  const paths = sc.paths;
  ac.abort();
  await following;
  wire.dispose();
  await sc.stop();
  sc = await startMockedSidecar({ homeDir: join(paths.orbHome, '..'), llm });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  await wire.orb.chat.send(meta.id, { text: 'Continue PROJECT-ALPHA from the saved checkpoint.' });
  await expect.poll(() => sc.llm.requests.length).toBeGreaterThan(0);
  expect(JSON.stringify(sc.llm.requests[0]!.body.messages)).toContain('compacted-summary');
  expect(JSON.stringify(sc.llm.requests[0]!.body.messages)).toContain('PROJECT-ALPHA');
  expect(sc.llm.requests.every((r) => r.body.model === MOCK_MODEL_ALT)).toBe(true);
  // The source log remains append-only; the checkpoint changes the surface rather than erasing audit history.
  expect(readFileSync(join(paths.orbHome, 'canvases', meta.id, 'board.jsonl'), 'utf8')).toBeDefined();
}, 90_000);

it('finishes the existing frame plan before expanding, while allowing an explicitly requested new section', async () => {
  sc = await startMockedSidecar();
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const meta = await wire.orb.canvas.create({ prompt: 'Existing frame plan', start: false });
  for (let i = 0; i < 3; i++) {
    const added = await wire.orb.board.command(meta.id, {
      type: 'frame.added',
      frame: { title: `Section ${i}`, color: 'sky', x: i * 800, y: 0, w: 700, h: 500 },
    });
    const frameId = (added.events[0]!.data as any).frame.id;
    await wire.orb.board.command(meta.id, {
      type: 'card.added',
      card: {
        type: 'doc',
        frameId,
        x: i * 800 + 24,
        y: 48,
        w: 280,
        h: 200,
        data: { title: 'Findings', body: 'Existing substantive findings for this section.' },
      },
    });
  }
  sc.llm.enqueue(
    {
      toolCalls: [{ id: 'unrequested_frame', name: 'add_frame', arguments: { title: 'Unrequested sprawl' } }],
    },
    { text: 'Kept the existing research plan.' },
  );
  await wire.orb.chat.send(meta.id, { text: 'Finish the whole board using its existing frames.' });
  await expect.poll(() => sc.llm.requests.filter((r) => r.completed).length).toBeGreaterThanOrEqual(2);
  const denied = sc.llm.requests[1]!.body.messages.find(
    (m: any) => m.role === 'tool' && m.tool_call_id === 'unrequested_frame',
  );
  expect(denied.content).toContain('Finish the 3 existing frames');
  const lines = () => readFileSync(join(sc.paths.orbHome, 'canvases', meta.id, 'board.jsonl'), 'utf8');
  expect(lines()).not.toContain('Unrequested sprawl');
  await expect
    .poll(() => readSessionLog(sc.paths.dshHome, meta.rootSessionId!).some((e) => e.type === 'turn/end'))
    .toBe(true);
  sc.llm.enqueue(
    { toolCalls: [{ id: 'requested_frame', name: 'add_frame', arguments: { title: 'Requested addition' } }] },
    { text: 'Added the requested frame; its content is next.' },
  );
  // Setup-only explicitly permits the new frame without claiming that its research is filled.
  await wire.orb.chat.send(meta.id, {
    text: 'Add a new frame called Requested addition. Only the structure; do not research yet.',
  });
  await expect.poll(lines).toContain('Requested addition');
});

it('redirects varied whole-board scans toward unfinished analysis, then restores overviews after real writes', async () => {
  let reads = 0;
  let filled = false;
  let checked = false;
  let fullOverview = false;
  const cardIds: string[] = [];
  sc = await startMockedSidecar({
    llm: {
      defaultTurn: (req: any) => {
        const last = req.body.messages.findLast((m: any) => m.role === 'tool');
        let result: any;
        try {
          result = JSON.parse(last?.content ?? '{}');
        } catch {
          /* text-only result */
        }
        if (!filled && result.researchFocus) {
          expect(result.researchFocus.analysisCards[0].cardId).toBe(cardIds[0]);
          filled = true;
          return {
            toolCalls: cardIds.map((cardId, i) => ({
              id: `finish_${i}`,
              name: 'update_card',
              arguments: {
                cardId,
                body: 'Evidence, analysis, tradeoffs and a precise recommendation. '.repeat(20),
                detail: 'A substantive assessment of the evidence, its implications and limits. '.repeat(12),
              },
            })),
          };
        }
        if (!filled)
          return {
            toolCalls: [
              { id: `scan_${++reads}`, name: 'query_board', arguments: { offset: reads, limit: 1 } },
            ],
          };
        if (!checked) {
          checked = true;
          return { toolCalls: [{ id: 'after_writes', name: 'board_map', arguments: {} }] };
        }
        if (last?.tool_call_id === 'after_writes')
          fullOverview = result.frames?.length === 3 && !result.researchFocus;
        return { text: 'The detailed board is complete.' };
      },
    },
  });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const meta = await wire.orb.canvas.create({ prompt: 'Read pacing', start: false });
  for (let i = 0; i < 3; i++) {
    const f = await wire.orb.board.command(meta.id, {
      type: 'frame.added',
      frame: { title: `Section ${i}`, color: 'sky', x: i * 800, y: 0, w: 700, h: 500 },
    });
    const c = await wire.orb.board.command(meta.id, {
      type: 'card.added',
      card: {
        type: 'doc',
        frameId: (f.events[0]!.data as any).frame.id,
        x: i * 800 + 24,
        y: 48,
        w: 280,
        h: 200,
        data: { title: `Analysis ${i}`, body: 'Initial short assessment.' },
      },
    });
    cardIds.push((c.events[0]!.data as any).card.id);
  }
  await wire.orb.chat.send(meta.id, {
    text: 'Finish the whole board with detailed useful research. Do not use agents or team.',
  });
  await expect
    .poll(() => readSessionLog(sc.paths.dshHome, meta.rootSessionId!).some((e) => e.type === 'turn/end'), {
      timeout: 30_000,
    })
    .toBe(true);
  expect(reads).toBe(16);
  expect(filled).toBe(true);
  expect(fullOverview).toBe(true);
  expect(sc.llm.requests.length).toBeLessThan(24);
});
