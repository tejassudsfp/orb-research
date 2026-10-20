/** Agent-policy acceptance, independent of manually repairing any saved user canvas. */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { databaseDataOf, fold, type AgentStatus } from '@orb/shared';
import { startMockedSidecar, type MockedSidecar } from '../../../scripts/testkit/index.ts';
import { readSessionLog } from '../../../scripts/testkit/sessionLog.ts';
import { createWire, type Wire } from '../src/wire/index.js';
let sc: MockedSidecar;
let wire: Wire;
let kept: string | undefined;
afterEach(async () => {
  wire?.dispose();
  await sc?.stop();
  if (kept) {
    rmSync(kept, { recursive: true, force: true });
    kept = undefined;
  }
});
const board = (id: string) =>
  fold(
    readFileSync(join(sc.paths.orbHome, 'canvases', id, 'board.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((x) => JSON.parse(x)),
  );
const analysis =
  'The evidence supports this recommendation under the stated assumptions. Compare alternatives, test the important constraint, and keep the specific unavailable input explicit. ';
async function fixture(depth?: 'quick' | 'standard') {
  const meta = await wire.orb.canvas.create({
    prompt: 'Workflow policy',
    ...(depth ? { template: 'trip-planning' as const, depth } : {}),
    start: false,
  });
  const b = board(meta.id);
  if (Object.keys(b.frames).length)
    await wire.orb.board.command(meta.id, {
      type: 'batch',
      commands: [
        { type: 'card.removed', ids: Object.keys(b.cards) },
        ...Object.keys(b.frames).map((id) => ({ type: 'frame.removed' as const, id })),
      ],
    });
  const cards: string[] = [],
    frames: string[] = [];
  for (let i = 0; i < 3; i++) {
    const f = await wire.orb.board.command(meta.id, {
      type: 'frame.added',
      frame: { title: `Section ${i}`, color: 'sky', x: i * 800, y: 0, w: 700, h: 500 },
    });
    frames.push((f.events[0]!.data as any).frame.id);
    const c = await wire.orb.board.command(meta.id, {
      type: 'card.added',
      card: {
        type: 'doc',
        frameId: (f.events[0]!.data as any).frame.id,
        x: i * 800 + 24,
        y: 48,
        w: 280,
        h: 200,
        data: { title: `Finding ${i}`, body: 'A short initial finding.' },
      },
    });
    cards.push((c.events[0]!.data as any).card.id);
  }
  return { meta, cards, frames };
}
async function completed(id: string, work: () => Promise<void>) {
  const statuses: AgentStatus[] = [],
    ac = new AbortController();
  const following = (async () => {
    try {
      for await (const s of wire.orb.agents.status(id, { signal: ac.signal })) statuses.push(s);
    } catch {
      /* closing */
    }
  })();
  try {
    await work();
    await expect
      .poll(
        () => {
          const started = statuses.findIndex((s) => s.agent === 'orb' && s.state === 'running');
          return (
            started >= 0 &&
            statuses
              .slice(started + 1)
              .some((s) => s.agent === 'orb' && s.state === 'idle' && s.research?.state === 'complete')
          );
        },
        { timeout: 30_000 },
      )
      .toBe(true);
  } finally {
    ac.abort();
    await following;
  }
}
const writes = (cards: string[]) => ({
  toolCalls: cards.map((cardId, i) => ({
    id: `analysis_${i}`,
    name: 'update_card',
    arguments: { cardId, body: analysis.repeat(6), detail: analysis.repeat(5) },
  })),
});

it.each(['quick', 'standard', undefined] as const)(
  'uses the selected %s depth without requiring a magic word in the user request',
  async (depth) => {
    let cards: string[] = [],
      filled = false,
      reviewers = 0;
    sc = await startMockedSidecar({
      llm: {
        defaultTurn: (req) => {
          const system = JSON.stringify(req.body.messages[0]);
          if (/You are Critic|You are Builder/.test(system)) {
            reviewers++;
            return { text: 'Reviewed the current findings.' };
          }
          if (!filled && JSON.stringify(req.body.messages).includes('Missing detailed synthesis')) {
            filled = true;
            return writes(cards);
          }
          return { text: 'The research is finished.' };
        },
      },
    });
    wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
    const f = await fixture(depth);
    cards = f.cards;
    await completed(f.meta.id, () =>
      wire.orb.chat.send(f.meta.id, { text: 'Complete the whole research board.' }).then(() => undefined),
    );
    expect(filled).toBe(depth !== 'quick');
    expect(reviewers > 0).toBe(depth !== 'quick');
  },
);

it.each([
  'Status?',
  'How we doing!? How much done!?',
  'Can you tell me where we are in the larger scheme of things?',
  'The budget is EUR6000 for two; keep all dates fixed.',
  'Use vegetarian restaurants instead of mixed-menu places; the rest stays the same.',
])('keeps the original objective and full completion checks for "%s" during research', async (status) => {
  let cards: string[] = [],
    calls = 0,
    filled = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  sc = await startMockedSidecar({
    llm: {
      defaultTurn: (req) => {
        if (++calls === 1) return { text: 'Research is in progress.', holdUntil: () => held };
        if (!filled && JSON.stringify(req.body.messages).includes('Missing detailed synthesis')) {
          filled = true;
          return writes(cards);
        }
        return { text: 'Current progress reported.' };
      },
    },
  });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const f = await fixture();
  cards = f.cards;
  await completed(f.meta.id, async () => {
    try {
      await wire.orb.chat.send(f.meta.id, {
        text: 'Complete the whole board for PROJECT-ALPHA with detailed research. Do not use agents or team.',
      });
      await expect.poll(() => sc.llm.requests.length).toBeGreaterThan(0);
      await wire.orb.chat.send(f.meta.id, { text: status, context: { frameIds: [f.frames[0]!] } });
    } finally {
      release();
    }
  });
  expect(filled).toBe(true);
  const savedFile = join(sc.paths.orbHome, 'canvases', f.meta.id, 'research.json');
  await expect.poll(() => JSON.parse(readFileSync(savedFile, 'utf8')).status).toBe('complete');
  const saved = JSON.parse(readFileSync(savedFile, 'utf8'));
  expect(saved.status).toBe('complete');
  expect(saved.request.objective).toContain('PROJECT-ALPHA');
  expect(saved.request.objective).toContain(status);
});

it.each([false, true])(
  'recovers an unfinished objective after restart from a simple continue request (legacy=%s)',
  async (legacy) => {
    sc = await startMockedSidecar({
      keepHome: true,
      llm: { defaultTurn: () => ({ text: 'Gathering evidence.', firstDelayMs: 10_000 }) },
    });
    kept = join(sc.paths.orbHome, '..');
    wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
    const f = await fixture();
    await wire.orb.chat.send(f.meta.id, {
      text: 'Complete the whole board for PROJECT-BETA with detailed research. Do not use agents or team.',
    });
    await expect.poll(() => sc.llm.requests.length).toBeGreaterThan(0);
    const paths = sc.paths;
    wire.dispose();
    await sc.stop();
    if (legacy) rmSync(join(paths.orbHome, 'canvases', f.meta.id, 'research.json'));
    let filled = false;
    sc = await startMockedSidecar({
      homeDir: join(paths.orbHome, '..'),
      llm: {
        defaultTurn: (req) => {
          if (!filled && JSON.stringify(req.body.messages).includes('Missing detailed synthesis')) {
            filled = true;
            return writes(f.cards);
          }
          return { text: 'Resumed the saved objective.' };
        },
      },
    });
    wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
    if (legacy) {
      const ended = readSessionLog(sc.paths.dshHome, f.meta.rootSessionId!).filter(
        (e) => e.type === 'turn/end',
      ).length;
      await wire.orb.chat.send(f.meta.id, { text: 'Status?', context: { frameIds: [f.frames[0]!] } });
      await expect
        .poll(
          () =>
            readSessionLog(sc.paths.dshHome, f.meta.rootSessionId!).filter((e) => e.type === 'turn/end')
              .length,
          { timeout: 20_000 },
        )
        .toBeGreaterThan(ended);
      expect(filled).toBe(false);
      expect(existsSync(join(sc.paths.orbHome, 'canvases', f.meta.id, 'research.json'))).toBe(false);
    }
    await completed(f.meta.id, () =>
      wire.orb.chat
        .send(f.meta.id, { text: 'Please continue.', context: { frameIds: [f.frames[0]!] } })
        .then(() => undefined),
    );
    expect(filled).toBe(true);
    expect(JSON.stringify(sc.llm.requests.map((r) => r.body.messages))).toContain('PROJECT-BETA');
    // A completed objective must not be persisted ahead of the board events it depends on.
    expect(Object.values(board(f.meta.id).cards).every((c) => (c.detail?.length ?? 0) >= 500)).toBe(true);
  },
  60_000,
);

it.each(['deck', 'doc'] as const)(
  'finishes the requested %s after research, rejects premature composition and repairs partial/stale output',
  async (output) => {
    let cards: string[] = [],
      attempted = false,
      filled = false,
      compositions = 0,
      partialReply = false,
      changed = false,
      changedReply = false,
      denied = false;
    const tool = output === 'deck' ? 'compose_slides' : 'compose_section';
    const compose = (ids: string[], id: string) => ({
      toolCalls: [
        {
          id,
          name: tool,
          arguments:
            output === 'deck'
              ? {
                  replaceAll: true,
                  slides: ids.map((cardId, i) => ({
                    slideId: `s${i}`,
                    layout: 'bullets',
                    title: `Finding ${i}`,
                    bullets: ['Evidence, alternatives and recommendation.'],
                    cardIds: [cardId],
                  })),
                }
              : {
                  format: 'custom',
                  sectionId: 'research',
                  heading: 'Research and recommendation',
                  paragraphs: ids.map((cardId) => ({ text: analysis.repeat(3), cardIds: [cardId] })),
                },
        },
      ],
    });
    sc = await startMockedSidecar({
      llm: {
        defaultTurn: (req) => {
          if (!attempted) {
            attempted = true;
            return compose(cards, 'premature');
          }
          const last = req.body.messages.findLast((m: any) => m.role === 'tool');
          if (last?.tool_call_id === 'premature')
            denied = /before composing|Complete the requested research/.test(last.content);
          if (!filled) {
            filled = true;
            return writes(cards);
          }
          if (compositions === 1 && !partialReply) {
            partialReply = true;
            return { text: 'The output is ready.' };
          }
          if (compositions === 2 && !changed) {
            changed = true;
            return {
              toolCalls: [
                {
                  id: 'material_correction',
                  name: 'update_card',
                  arguments: {
                    cardId: cards[1],
                    body: `${analysis.repeat(6)}Material correction from the final review.`,
                  },
                },
              ],
            };
          }
          if (changed && !changedReply) {
            changedReply = true;
            return { text: 'The correction is saved.' };
          }
          if (
            JSON.stringify(req.body.messages).includes(
              `The requested ${output === 'deck' ? 'slide deck' : 'research document'} is not complete`,
            ) &&
            compositions < 3
          ) {
            compositions++;
            return compose(compositions === 1 ? cards.slice(0, 1) : cards, `compose_${compositions}`);
          }
          return { text: 'The research and deliverable are complete.' };
        },
      },
    });
    wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
    const f = await fixture();
    cards = f.cards;
    await completed(f.meta.id, () =>
      wire.orb.chat
        .send(f.meta.id, {
          text: `Complete the whole board with detailed research and ${output === 'deck' ? 'prepare a slide deck' : 'write a research document as a brief memo'}. Do not use agents or team.`,
        })
        .then(() => undefined),
    );
    expect(denied).toBe(true);
    expect(compositions).toBe(3);
    expect(changed).toBe(true);
    if (output === 'deck') expect((await wire.orb.deck.get(f.meta.id)).deck?.slides).toHaveLength(3);
    else expect((await wire.orb.port.get(f.meta.id)).doc?.sections[0]?.paragraphs).toHaveLength(3);
  },
);

it('names only the missing reviewer at the composition boundary so the completed review is not repeated', async () => {
  let cards: string[] = [],
    frames: string[] = [];
  let filled = false,
    critic = false,
    early = false,
    attempts = 0,
    reason = '';
  const compose = (id: string) => ({
    toolCalls: [
      {
        id,
        name: 'compose_slides',
        arguments: {
          replaceAll: true,
          slides: cards.map((cardId, i) => ({
            slideId: `s${i}`,
            layout: 'bullets',
            title: `Finding ${i}`,
            bullets: ['Evidence, tradeoffs and recommendation.'],
            cardIds: [cardId],
          })),
        },
      },
    ],
  });
  const delegate = (role: 'critic' | 'builder') => ({
    toolCalls: [
      {
        id: `required_${role}`,
        name: 'delegate',
        arguments: { role, frameIds: frames, instruction: 'Review the complete current board.' },
      },
    ],
  });
  sc = await startMockedSidecar({
    llm: {
      defaultTurn: (req) => {
        if (/You are Critic|You are Builder/.test(JSON.stringify(req.body.messages[0])))
          return { text: 'Reviewed the current assigned findings.' };
        const lastAssistant = req.body.messages.findLast((m: any) => m.role === 'assistant');
        const answered = lastAssistant?.tool_calls?.[0]?.id as string | undefined;
        if (answered === 'early_deck') {
          reason = req.body.messages.findLast((m: any) => m.role === 'tool')?.content ?? '';
          return delegate('builder');
        }
        if (answered === 'required_builder' || answered?.startsWith('final_deck'))
          return { text: 'Current review and delivery progress recorded.' };
        if (!filled) {
          filled = true;
          return writes(cards);
        }
        if (!critic) {
          critic = true;
          return delegate('critic');
        }
        if (!early) {
          early = true;
          return compose('early_deck');
        }
        if (JSON.stringify(req.body.messages.at(-1)).includes('Final consistency check'))
          return { text: 'The current recommendation and citations are consistent.' };
        return compose(`final_deck_${++attempts}`);
      },
    },
  });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const f = await fixture();
  cards = f.cards;
  frames = f.frames;
  await completed(f.meta.id, () =>
    wire.orb.chat
      .send(f.meta.id, {
        text: 'Complete the whole board and prepare a slide deck.',
      })
      .then(() => undefined),
  );
  expect(reason).toContain('Current reviews still missing: Builder.');
  expect(reason).not.toContain('Current reviews still missing: Critic');
  expect((await wire.orb.deck.get(f.meta.id)).deck?.slides).toHaveLength(3);
});

it('delivers a qualified research deck when unavailable future inputs are explained rather than waiting for booking confirmation', async () => {
  let cards: string[] = [],
    unknown = '',
    deliveryNotice = false,
    composed = false;
  sc = await startMockedSidecar({
    llm: {
      defaultTurn: (req) => {
        if (JSON.stringify(req.body.messages).includes('Delivery phase:')) deliveryNotice = true;
        if (deliveryNotice && !composed) {
          composed = true;
          return {
            toolCalls: [
              {
                id: 'qualified_deck',
                name: 'compose_slides',
                arguments: {
                  replaceAll: true,
                  slides: cards.map((cardId, i) => ({
                    slideId: `s${i}`,
                    layout: 'bullets',
                    title: `Provisional finding ${i}`,
                    bullets: ['Sourced recommendation; exact future quote remains unknown.'],
                    cardIds: i === 0 ? [cardId, unknown] : [cardId],
                  })),
                },
              },
            ],
          };
        }
        return {
          text: composed
            ? 'The provisional recommendation and its evidence limits are consistent.'
            : 'Awaiting booking confirmation before preparing the deck.',
        };
      },
    },
  });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const f = await fixture();
  cards = f.cards;
  for (const id of cards)
    await wire.orb.board.command(f.meta.id, {
      type: 'card.updated',
      id,
      patch: { data: { title: 'Research finding', body: analysis.repeat(6) }, detail: analysis.repeat(5) },
    });
  const added = await wire.orb.board.command(f.meta.id, {
    type: 'card.added',
    card: {
      type: 'metric',
      frameId: f.frames[0]!,
      x: 340,
      y: 48,
      w: 280,
      h: 200,
      data: { title: 'Exact future booking quote', value: 'Unknown' },
      detail:
        'The booking source does not expose the exact future dates without an interactive quote. The board records the attempted source, dated indicative alternatives and the budget sensitivity. This input remains unknown, so the recommendation is provisional and requires a quote before booking. '.repeat(
          3,
        ),
    },
  });
  unknown = (added.events[0]!.data as any).card.id;
  await completed(f.meta.id, () =>
    wire.orb.chat
      .send(f.meta.id, {
        text: 'Complete the whole board and prepare a presentation. Do not use agents or team.',
      })
      .then(() => undefined),
  );
  expect(deliveryNotice).toBe(true);
  expect(composed).toBe(true);
  expect((await wire.orb.deck.get(f.meta.id)).deck?.slides).toHaveLength(3);
  expect(board(f.meta.id).cards[unknown]!.data).toMatchObject({ value: 'Unknown' });
  expect(sc.llm.requests.length).toBeLessThan(6);
});

it('prompts a researching Scout to save verified rows within its pass instead of gathering the entire board first', async () => {
  const frames: string[] = [],
    databases: string[] = [];
  let delegated = false,
    saved = false,
    reads = 0;
  sc = await startMockedSidecar({
    llm: {
      defaultTurn: (req) => {
        if (JSON.stringify(req.body.messages[0]).includes('You are Scout')) {
          if (
            !saved &&
            JSON.stringify(req.body.messages).includes('research reads since your last saved finding')
          ) {
            saved = true;
            return {
              toolCalls: databases.map((cardId, i) => ({
                id: `save_${i}`,
                name: 'upsert_rows',
                arguments: {
                  cardId,
                  key: 'Name',
                  rows: [
                    { values: { Name: `Option ${i}`, Source: 'https://example.com/provided-evidence' } },
                  ],
                },
              })),
            };
          }
          if (!saved)
            return {
              toolCalls: [
                { id: `research_${++reads}`, name: 'query_board', arguments: { offset: reads, limit: 1 } },
              ],
            };
          return { text: 'Saved the provided evidence into all assigned datasets.' };
        }
        if (!delegated) {
          delegated = true;
          return {
            toolCalls: [
              {
                id: 'research',
                name: 'delegate',
                arguments: {
                  role: 'scout',
                  frameIds: frames,
                  instruction:
                    'Populate the existing databases from the three options in the supplied evidence.',
                },
              },
            ],
          };
        }
        return { text: 'The requested data pass is finished.' };
      },
    },
  });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const meta = await wire.orb.canvas.create({ prompt: 'Incremental research', start: false });
  for (let i = 0; i < 3; i++) {
    const f = await wire.orb.board.command(meta.id, {
      type: 'frame.added',
      frame: { title: `Options ${i}`, color: 'sky', x: i * 800, y: 0, w: 700, h: 500 },
    });
    const frameId = (f.events[0]!.data as any).frame.id;
    frames.push(frameId);
    const imported = await wire.data.import(meta.id, {
      name: `Options ${i}`,
      body: 'Name,Source\n',
      format: 'csv',
    });
    const ds = await wire.data.read(meta.id, imported.id);
    const card = await wire.orb.board.command(meta.id, {
      type: 'card.added',
      card: {
        type: 'database',
        frameId,
        x: i * 800 + 24,
        y: 48,
        w: 560,
        h: 250,
        data: databaseDataOf(ds.name, ds),
      },
    });
    databases.push((card.events[0]!.data as any).card.id);
    await wire.orb.board.command(meta.id, {
      type: 'card.added',
      card: {
        type: 'source',
        frameId,
        x: i * 800 + 24,
        y: 320,
        w: 280,
        h: 180,
        data: {
          title: `Provided evidence ${i}`,
          url: 'https://example.com/provided-evidence',
          summary: `Option ${i} is the supported candidate for this section.`,
        },
      },
    });
  }
  await completed(meta.id, () =>
    wire.orb.chat
      .send(meta.id, { text: 'Research all frames with only sourced rows; no analysis.' })
      .then(() => undefined),
  );
  expect(reads).toBe(12);
  expect(saved).toBe(true);
  await expect
    .poll(() => databases.map((id) => (board(meta.id).cards[id]?.data as any)?.rowCount))
    .toEqual([1, 1, 1]);
});

it('keeps a stopped objective through a status question and resumes it only when explicitly asked', async () => {
  let first = true,
    cards: string[] = [],
    filled = false;
  sc = await startMockedSidecar({
    llm: {
      defaultTurn: (req) => {
        if (first) {
          first = false;
          return { text: 'Research in progress.', firstDelayMs: 10_000 };
        }
        if (!filled && JSON.stringify(req.body.messages).includes('Missing detailed synthesis')) {
          filled = true;
          return writes(cards);
        }
        return { text: 'Status reported; waiting for an explicit continuation.' };
      },
    },
  });
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  const f = await fixture();
  cards = f.cards;
  await wire.orb.chat.send(f.meta.id, {
    text: 'Complete the whole board for PROJECT-GAMMA. Do not use agents or team.',
  });
  await expect.poll(() => sc.llm.requests.length).toBeGreaterThan(0);
  await wire.orb.agents.control(f.meta.id, { agent: 'all', action: 'stop' });
  const savedFile = join(sc.paths.orbHome, 'canvases', f.meta.id, 'research.json');
  await expect.poll(() => JSON.parse(readFileSync(savedFile, 'utf8')).status).toBe('stopped');
  const ended = readSessionLog(sc.paths.dshHome, f.meta.rootSessionId!).filter(
    (e) => e.type === 'turn/end',
  ).length;
  await wire.orb.chat.send(f.meta.id, { text: 'Status?' });
  await expect
    .poll(
      () =>
        readSessionLog(sc.paths.dshHome, f.meta.rootSessionId!).filter((e) => e.type === 'turn/end').length,
    )
    .toBeGreaterThan(ended);
  expect(filled).toBe(false);
  expect(JSON.parse(readFileSync(savedFile, 'utf8')).status).toBe('stopped');
  await completed(f.meta.id, () =>
    wire.orb.chat.send(f.meta.id, { text: 'Please continue.' }).then(() => undefined),
  );
  expect(filled).toBe(true);
  expect(JSON.parse(readFileSync(savedFile, 'utf8')).request.objective).toContain('PROJECT-GAMMA');
});
