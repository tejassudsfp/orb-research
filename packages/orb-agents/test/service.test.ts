import { describe, expect, it } from 'vitest';
import { OrbAgents } from '../src/service.js';

// ORB_SKIP_TIMING=1 skips timing assertions (P6.prep; this package cannot import scripts/testkit).
const timingExpect = (check: () => void): void => {
  if (process.env.ORB_SKIP_TIMING !== '1') check();
};

/** Fake host ctx: one canvas without a root session, a counting agents.create. */
function fakeCtx() {
  let meta: Record<string, unknown> = { id: 'c1', title: 'C', createdAt: 1 };
  const created: string[] = [];
  const ctx = {
    orbCanvas: {
      open: async () => ({ ...meta }),
      dirOf: (id: string) => `/canvases/${id}`,
      setRootSession: async (_id: string, rootSessionId: string) => {
        await new Promise((r) => setTimeout(r, 10));
        meta = { ...meta, rootSessionId };
        return { ...meta };
      },
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    agents: {
      create: async (opts: { sessionId: string }) => {
        created.push(opts.sessionId);
        const agent = { id: opts.sessionId, followup: () => undefined };
        return { agent, dispose: async () => undefined };
      },
      get: (id: string) => (created.includes(id) ? { id, followup: () => undefined } : undefined),
    },
  };
  return { ctx, created };
}

describe('OrbAgents.createRoot', () => {
  it('concurrent callers on a canvas without a root share one root agent', async () => {
    const { ctx, created } = fakeCtx();
    const agents = new OrbAgents(ctx);
    const [a, b, c] = await Promise.all([
      agents.createRoot('c1'),
      agents.send('c1', 'hi'),
      agents.send('c1', 'there'),
    ]);
    expect(created).toHaveLength(1);
    expect(a.sessionId).toBe(created[0]);
    expect(b.sessionId).toBe(created[0]);
    expect(c.sessionId).toBe(created[0]);
  });
});

/** Fake host ctx for openRoot: a canvas that already has a persisted root session, and counting create/resume. */
function persistedCtx(rootSessionId: string | null) {
  const live = new Map<string, { id: string; followup: () => void }>();
  const calls = { create: 0, resume: [] as string[] };
  let meta: Record<string, unknown> = { id: 'c1', title: 'C', created: 1, rootSessionId, childAgentIds: {} };
  const ctx = {
    orbCanvas: {
      open: async () => ({ ...meta }),
      dirOf: (id: string) => `/canvases/${id}`,
      setRootSession: async (_id: string, sessionId: string) => {
        meta = { ...meta, rootSessionId: sessionId };
        return { ...meta };
      },
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    agentPresets: { mount: async () => undefined },
    agents: {
      create: async (opts: { sessionId: string }) => {
        calls.create++;
        const agent = { id: opts.sessionId, followup: () => undefined };
        live.set(agent.id, agent);
        return { agent, dispose: async () => void live.delete(agent.id) };
      },
      resume: async (opts: { resumeSessionId: string; setup: (c: unknown) => Promise<void> }) => {
        calls.resume.push(opts.resumeSessionId);
        await new Promise((r) => setTimeout(r, 10));
        const restricted: unknown[] = [];
        await opts.setup({
          tools: { guard: () => undefined, restrict: (f: unknown) => void restricted.push(f) },
        });
        // P3.2/P3.4: the preset tools outside Orb's allow-list are hidden from it.
        expect(restricted).toEqual([
          {
            deny: [
              'consolidate_cards',
              'write_design_frame',
              'report_progress',
              'send_message',
              'web_search',
              'fetch_url',
              'capture_page',
              'fetch_signed_in',
              // P6.7: Scout's Parallel tools Orb does not hold.
              'parallel_extract',
              'image_search',
            ],
          },
        ]);
        const agent = { id: opts.resumeSessionId, followup: () => undefined };
        live.set(agent.id, agent);
        return { agent, dispose: async () => void live.delete(agent.id) };
      },
      get: (id: string) => live.get(id),
    },
  };
  return { ctx, calls };
}

describe('OrbAgents.openRoot', () => {
  it('resumes a persisted root session (never creates a new one), once for concurrent opens', async () => {
    const { ctx, calls } = persistedCtx('orb-old');
    const agents = new OrbAgents(ctx);
    const [a, b] = await Promise.all([agents.openRoot('c1'), agents.openRoot('c1')]);
    expect(calls.resume).toEqual(['orb-old']);
    expect(calls.create).toBe(0);
    expect(a).toMatchObject({ sessionId: 'orb-old', origin: 'resumed' });
    expect(b.sessionId).toBe('orb-old');
    // Already live: reused, not resumed again.
    expect(await agents.openRoot('c1')).toMatchObject({ sessionId: 'orb-old', origin: 'live' });
    expect(calls.resume).toHaveLength(1);
    expect(await agents.send('c1', 'hello again')).toEqual({ sessionId: 'orb-old' });
    expect(calls.resume).toHaveLength(1);
  });

  it('creates the first root agent for a canvas without one', async () => {
    const { ctx, calls } = persistedCtx(null);
    const agents = new OrbAgents(ctx);
    const opened = await agents.openRoot('c1');
    expect(opened.origin).toBe('created');
    expect(opened.canvas.rootSessionId).toBe(opened.sessionId);
    expect(calls).toEqual({ create: 1, resume: [] });
  });
});

/** Fake agent whose activity ends when `finish()` is called (or never). */
function fakeAgent(id: string) {
  let release: () => void = () => undefined;
  let idle: Promise<void> = Promise.resolve();
  const agent = {
    id,
    status: 'idle' as 'idle' | 'running',
    cancels: [] as Array<{ kind: string }>,
    followup: () => undefined,
    start() {
      agent.status = 'running';
      idle = new Promise<void>((r) => (release = r));
    },
    finish() {
      agent.status = 'idle';
      release();
    },
    cancel(cause: { kind: string }) {
      agent.cancels.push(cause);
    },
    whenIdle: () => idle,
  };
  return agent;
}

function stopCtx() {
  const root = fakeAgent('orb-root');
  const child = fakeAgent('orb-child');
  const grandchild = fakeAgent('orb-grandchild');
  const stranger = fakeAgent('orb-other');
  const owner = new Map<string, unknown>([
    [child.id, root],
    [grandchild.id, child],
  ]);
  const all = [root, child, grandchild, stranger];
  const meta = { id: 'c1', title: 'C', created: 1, rootSessionId: root.id, childAgentIds: {} };
  const ctx = {
    orbCanvas: { open: async () => ({ ...meta }), dirOf: () => '/c1' },
    agents: {
      get: (id: string) => all.find((a) => a.id === id),
      list: () => all,
      isOwnedBy: (id: string, parent: unknown) => owner.get(id) === parent,
    },
  };
  return { ctx, root, child, grandchild, stranger };
}

async function take<T>(it: AsyncGenerator<T>, n: number): Promise<T[]> {
  const out: T[] = [];
  while (out.length < n) {
    const r = await it.next();
    if (r.done) break;
    out.push(r.value);
  }
  return out;
}

describe('OrbAgents.stop', () => {
  it('cancels the root as user and its live descendants as parent, then reports stopped', async () => {
    const { ctx, root, child, grandchild, stranger } = stopCtx();
    const agents = new OrbAgents(ctx);
    for (const a of [root, child, grandchild]) a.start();
    const ac = new AbortController();
    const status = agents.followStatus('c1', ac.signal);
    expect((await take(status, 1))[0]).toMatchObject({ agent: 'orb', state: 'running', sessionId: root.id });

    const stopping = agents.stop('c1');
    expect(agents.stop('c1')).toBe(stopping); // concurrent callers share one stop
    // Harness running/idle transitions during the stop are held back.
    setTimeout(() => {
      for (const a of [root, child, grandchild]) a.finish();
      agents.onAgentStatus(root.id, 'idle');
    }, 30);
    const result = await stopping;
    expect(result).toMatchObject({ action: 'stop', state: 'stopped', agents: 3 });
    expect(result.stopMs).toBeGreaterThanOrEqual(25);
    expect(root.cancels).toEqual([{ kind: 'user' }]);
    expect(child.cancels).toEqual([{ kind: 'parent' }]);
    expect(grandchild.cancels).toEqual([{ kind: 'parent' }]);
    expect(stranger.cancels).toEqual([]);
    const [a, b] = await take(status, 2);
    expect(a).toMatchObject({ state: 'stopping' });
    expect(b).toMatchObject({ state: 'stopped', stopMs: result.stopMs });
    // A late idle adds nothing; the harness `running` of the next turn waits for its first real step (P3.7: a turn
    // whose step is rejected, e.g. a kept settlement notice, never reads running), then it is published again.
    agents.onAgentStatus(root.id, 'idle');
    agents.onAgentStatus(root.id, 'running');
    const m = { id: 'm1', content: [{ type: 'text', text: 'next' }], source: { kind: 'user' } };
    expect(
      await agents.onPreStep({ agent: root, messages: [m], step: 1 }, async () => ({
        kind: 'enter',
        messages: [m],
      })),
    ).toEqual({
      kind: 'enter',
      messages: [m],
    });
    expect((await take(status, 1))[0]).toMatchObject({ state: 'running' });
    ac.abort();
    expect((await status.next()).done).toBe(true);
  });

  it('reports stop-timeout after 1 s when an agent does not go idle, then idle once it does', async () => {
    const { ctx, root } = stopCtx();
    const agents = new OrbAgents(ctx);
    root.start();
    const ac = new AbortController();
    const status = agents.followStatus('c1', ac.signal);
    await take(status, 1);
    const result = await agents.stop('c1');
    expect(result.state).toBe('stop-timeout');
    expect(result.stopMs).toBeGreaterThanOrEqual(990);
    timingExpect(() => {
      expect(result.stopMs).toBeLessThan(1_500);
    });
    expect((await take(status, 2)).map((s) => s.state)).toEqual(['stopping', 'stop-timeout']);
    root.finish();
    expect((await take(status, 1))[0]).toMatchObject({ state: 'idle' });
    ac.abort();
  });

  it('a canvas whose root agent is not live stops at once with 0 agents', async () => {
    const { ctx } = stopCtx();
    ctx.agents.get = () => undefined;
    const result = await new OrbAgents(ctx).stop('c1');
    expect(result).toMatchObject({ state: 'stopped', agents: 0 });
  });
});

/** Fake host ctx for P3.3: a canvas with a live root agent that records follow-ups, settings and a board. */
function chatCtx(models: Record<string, { provider: string; model: string }> = {}) {
  const followups: unknown[] = [];
  const created: Array<{ agentOptions: unknown }> = [];
  const contexts: unknown[] = [];
  const threadMessages: unknown[] = [];
  const active: unknown[] = [];
  const live = new Map<string, unknown>();
  let meta: Record<string, unknown> = {
    id: 'c1',
    title: 'C',
    created: 1,
    rootSessionId: null,
    childAgentIds: {},
  };
  const ctx = {
    orbCanvas: {
      open: async () => ({ ...meta }),
      dirOf: (id: string) => `/canvases/${id}`,
      setRootSession: async (_id: string, rootSessionId: string) => {
        meta = { ...meta, rootSessionId };
        return { ...meta };
      },
      settings: { get: async () => ({ v: 1, theme: 'night', models }) },
      board: async () => ({
        current: { frames: { f_1: { id: 'f_1', title: 'Thesis' } }, cards: {}, links: {} },
      }),
      chatContext: async (_id: string, request: unknown) => {
        contexts.push(request);
        return '<board-context>\nctx\n</board-context>';
      },
      appendThreadMessage: async (id: string, of: string, text: string, actor: unknown) => {
        threadMessages.push({ id, of, text, actor });
      },
      setActiveThread: (sessionId: string, of: string | undefined) => void active.push([sessionId, of]),
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'openai', model: 'gpt-6-luna' }) },
    agentPresets: { mount: async () => undefined },
    agents: {
      create: async (opts: { sessionId: string; agentOptions: unknown }) => {
        created.push({ agentOptions: opts.agentOptions });
        const agent = { id: opts.sessionId, followup: (m: unknown) => void followups.push(m) };
        live.set(agent.id, agent);
        return { agent, dispose: async () => undefined };
      },
      get: (id: string) => live.get(id),
    },
  };
  return { ctx, followups, created, contexts, threadMessages, active };
}

const texts = (message: any): string[] => message.content.map((p: { text: string }) => p.text);

describe('OrbAgents chat (P3.3)', () => {
  it('gives existing template boards the current scoring anchors on a follow-up', async () => {
    const { ctx, followups } = chatCtx();
    const open = ctx.orbCanvas.open;
    ctx.orbCanvas.open = async () => ({ ...await open(), template: 'vc-dd' });
    await new OrbAgents(ctx).send('c1', 'Review this scorecard.');
    expect(texts(followups[0]).join('\n')).toContain('Keep evidence confidence separate');
    expect(texts(followups[0]).join('\n')).toContain('Scoring anchor — Deal (10%)');
  });

  it('steers a thread clarification into the next running step without cancelling research', async () => {
    const { ctx, followups } = chatCtx();
    const agents = new OrbAgents(ctx);
    const { sessionId } = await agents.createRoot('c1');
    const live = ctx.agents.get(sessionId) as any;
    const steered: unknown[] = [];
    live.status = 'running';
    live.steer = (message: unknown) => steered.push(message);
    await agents.send('c1', 'Explain this comparison.', { threadOf: 'c_2' });
    expect(steered).toHaveLength(1);
    expect(followups).toHaveLength(0);
  });
  it('send preserves the human text first, then the task date and optional board context in the same message', async () => {
    const { ctx, followups, contexts } = chatCtx();
    const agents = new OrbAgents(ctx);
    await agents.send('c1', 'plain');
    await agents.send('c1', 'with context', { context: { cardIds: ['c_1'] }, threadOf: 'c_2' });
    const date = expect.stringMatching(/^Research date: \d{4}-\d{2}-\d{2} \(UTC\)/);
    expect(texts(followups[0])).toEqual(['plain', date]);
    expect(texts(followups[0])[1]).toContain('Board: 1 frames, 0 cards');
    expect(texts(followups[0])[1]).toContain('even without pinned context');
    expect(texts(followups[1])).toEqual(['with context', date, '<board-context>\nctx\n</board-context>']);
    expect(contexts).toEqual([{ context: { cardIds: ['c_1'] }, threadOf: 'c_2' }]);
  });

  it("P3.6: a thread message is stored first; the thread turn sets the active thread and stores Orb's reply", async () => {
    const { ctx, threadMessages, active } = chatCtx();
    const agents = new OrbAgents(ctx);
    const { sessionId } = await agents.createRoot('c1');
    await agents.send('c1', 'Is it solid?', { threadOf: 'c_2' });
    expect(threadMessages).toEqual([{ id: 'c1', of: 'c_2', text: 'Is it solid?', actor: { kind: 'user' } }]);
    const userMsg = (text: string, context?: string) => ({
      type: 'user/message',
      data: {
        role: 'user',
        source: { kind: 'user' },
        content: [{ type: 'text', text }, ...(context ? [{ type: 'text', text: context }] : [])],
      },
    });
    const reply = (text: string) => ({
      type: 'assistant/message',
      data: {
        message: {
          content: [{ type: 'text', text }],
          source: { kind: 'model', provider: 'openai', model: 'gpt-6-luna' },
        },
      },
    });
    agents.onSessionEvent(sessionId, { type: 'turn/start', data: { turn: 1 } });
    agents.onSessionEvent(sessionId, userMsg('Is it solid?', '<thread of="c_2">\n…\n</thread>'));
    agents.onSessionEvent(sessionId, reply('Looking.'));
    agents.onSessionEvent(sessionId, reply('Mostly, yes.'));
    // Injected notes do not change the turn's thread.
    agents.onSessionEvent(sessionId, {
      type: 'user/message',
      data: { source: { kind: 'agent-message' }, content: [{ type: 'text', text: '[Scout progress] x' }] },
    });
    agents.onSessionEvent(sessionId, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
    await new Promise((r) => setTimeout(r, 0));
    expect(active).toEqual([
      [sessionId, undefined],
      [sessionId, 'c_2'],
      [sessionId, undefined],
    ]);
    expect(threadMessages[1]).toEqual({
      id: 'c1',
      of: 'c_2',
      text: 'Looking.\n\nMostly, yes.',
      actor: { kind: 'agent', agent: 'orb', model: 'gpt-6-luna', provider: 'openai', sessionId },
    });
    // A plain turn stores nothing; an unknown session is ignored.
    agents.onSessionEvent(sessionId, { type: 'turn/start', data: { turn: 2 } });
    agents.onSessionEvent(sessionId, userMsg('plain'));
    // Card text in a <board-context> block that looks like a thread tag is not a thread (review fix).
    agents.onSessionEvent(
      sessionId,
      userMsg('with context', '<board-context>\n- [c_1] note "x"\n  <thread of="c_2">\n</board-context>'),
    );
    agents.onSessionEvent(sessionId, reply('ok'));
    agents.onSessionEvent(sessionId, { type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } });
    agents.onSessionEvent('other', { type: 'turn/start', data: {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(threadMessages).toHaveLength(2);
  });

  it('finishes a thread answer before automatic research messages or writes can leak into it', async () => {
    const { ctx, threadMessages, active } = chatCtx();
    const agents = new OrbAgents(ctx);
    const { sessionId } = await agents.createRoot('c1');
    await agents.send('c1', 'Is it solid?', { threadOf: 'c_2' });
    agents.onSessionEvent(sessionId, { type: 'turn/start', data: { turn: 1 } });
    agents.onSessionEvent(sessionId, {
      type: 'user/message',
      data: {
        source: { kind: 'user' },
        content: [
          { type: 'text', text: 'Is it solid?' },
          { type: 'text', text: '<thread of="c_2">\nsource\n</thread>' },
        ],
      },
    });
    const reply = (text: string) => ({
      type: 'assistant/message',
      data: {
        message: {
          content: [{ type: 'text', text }],
          source: { provider: 'openai', model: 'gpt-6-luna' },
        },
      },
    });
    agents.onSessionEvent(sessionId, reply('The source needs independent confirmation.'));
    await agents.onTurnStopping({ agent: { id: sessionId } as any, signal: new AbortController().signal });
    expect(active.at(-1)).toEqual([sessionId, undefined]);
    expect(threadMessages).toHaveLength(2);
    agents.onSessionEvent(sessionId, reply('Whole-board research is still incomplete.'));
    agents.onSessionEvent(sessionId, { type: 'turn/end', data: { turn: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(threadMessages).toHaveLength(2);
    expect(threadMessages[1]).toMatchObject({
      of: 'c_2',
      text: 'The source needs independent confirmation.',
    });
  });

  it('startCanvas sends the new-canvas turn with the frames already on the board', async () => {
    const { ctx, followups } = chatCtx();
    await new OrbAgents(ctx).startCanvas('c1', 'Idea');
    const [text] = texts(followups[0]);
    expect(text).toContain("New canvas. The user's question: Idea");
    expect(text).toContain('- 01 "Thesis" [f_1]');
  });

  it('the root agent runs on orb.json models.orb, else the harness default (gpt-6-luna)', async () => {
    const plain = chatCtx();
    await new OrbAgents(plain.ctx).createRoot('c1');
    expect(plain.created[0]!.agentOptions).toEqual({ provider: 'openai', model: 'gpt-6-luna' });
    const chosen = chatCtx({ orb: { provider: 'deepseek', model: 'deepseek-v4-pro' } });
    await new OrbAgents(chosen.ctx).createRoot('c1');
    expect(chosen.created[0]!.agentOptions).toEqual({ provider: 'deepseek', model: 'deepseek-v4-pro' });
    const none = chatCtx();
    (none.ctx as { agentDefaultModel?: unknown }).agentDefaultModel = undefined;
    expect(await new OrbAgents(none.ctx).modelFor('scout')).toEqual({
      provider: 'openai',
      model: 'gpt-6-luna',
    });
  });
});

describe('reasoning effort for research planning', () => {
  it('binds prompt assembly and the next request to the current choice despite a stale session route', async () => {
    const { ctx } = fakeCtx();
    let selected = { provider: 'chatgpt-plan', model: 'plan-model' };
    Object.assign(ctx, { orbModels: { routeFor: async () => selected } });
    const agents = new OrbAgents(ctx);
    const root = await agents.createRoot('c1');
    const assembly = await agents.onPromptAssembly({ agent: { id: root.sessionId } }, async () => ({
      variables: { provider: 'openai', model: 'old', other: 'kept' },
    }));
    expect(assembly.variables).toEqual({ ...selected, other: 'kept' });
    selected = { provider: 'other', model: 'later' };
    expect(
      await agents.onAgentRequest({ agent: { id: root.sessionId } }, async () => ({
        provider: 'openai',
        model: 'old',
        reasoningEffort: 'unsupported-old-effort',
      })),
    ).toEqual({ provider: 'chatgpt-plan', model: 'plan-model' });
    expect(await agents.routeForSession(root.sessionId)).toEqual({
      provider: 'chatgpt-plan',
      model: 'plan-model',
    });
    await agents.onPromptAssembly({ agent: { id: root.sessionId } }, async () => ({ variables: {} }));
    expect(await agents.routeForSession(root.sessionId)).toEqual(selected);
  });
  it('uses the selected model’s supported high effort, and preserves adapter defaults when unavailable', async () => {
    for (const supported of [true, false]) {
      const { ctx } = fakeCtx();
      Object.assign(ctx, {
        llm: {
          resolveModelInfo: async () =>
            supported ? { reasoning: { efforts: [{ id: 'high' }, { id: 'medium' }] } } : {},
        },
      });
      const agents = new OrbAgents(ctx);
      const root = await agents.createRoot('c1');
      const route = { provider: 'p', model: 'm' };
      expect(await agents.onAgentRequest({ agent: { id: root.sessionId } }, async () => route)).toEqual({
        ...route,
        ...(supported ? { reasoningEffort: 'high' } : {}),
      });
      expect(
        await agents.onAgentRequest({ agent: { id: root.sessionId } }, async () => ({
          ...route,
          reasoningEffort: 'low',
        })),
      ).toEqual({ ...route, reasoningEffort: 'low' });
    }
  });
});
