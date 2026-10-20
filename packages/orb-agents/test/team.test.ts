import { describe, expect, it } from 'vitest';
import {
  AGENT_TOOLS,
  LAYOUT_TOOL_NAMES,
  PARALLEL_SCOUT_TOOL_NAMES,
  SCALE_TOOL_NAMES,
  PARALLEL_TOOL_NAMES,
  childToolAllow,
  hiddenPresetTools,
  reportPlanFromFrames,
  type AgentStatus,
} from '@orb/shared';
import { OrbAgents, SUBAGENT_PROVIDER } from '../src/service.js';
import { CHILD_PERSONAS, assignmentMessage } from '../src/persona.js';

type Meta = {
  id: string;
  title: string;
  created: number;
  rootSessionId: string | null;
  childAgentIds: Record<string, string>;
};

/** Fake host ctx: one canvas with a root Orb session and two frames; recording subagents. */
function teamCtx(options: { failStart?: boolean; staleChild?: { code: string; message: string } } = {}) {
  let meta: Meta = {
    id: 'c1',
    title: 'C',
    created: 1,
    rootSessionId: 'orb-root',
    childAgentIds: options.staleChild ? { scout: 'scout-old' } : {},
  };
  const log: string[] = [];
  const injected: any[] = [];
  const started: any[] = [];
  const sent: Array<{ sender: string; target: string; text: string }> = [];
  const interrupts: Array<{ target: string; authority: any }> = [];
  const frames = {
    f_a: { id: 'f_a', title: 'Market' },
    f_b: { id: 'f_b', title: 'Risks' },
  };
  const root = {
    id: 'orb-root',
    status: 'running',
    session: { header: { cwd: '/canvases/c1' } },
    inject: (m: unknown) => injected.push(m),
  };
  const children = new Map<string, any>();
  const ctx = {
    orbCanvas: {
      open: async () => structuredClone(meta),
      canvasIdOfDir: (dir: string) => (dir === '/canvases/c1' ? 'c1' : undefined),
      board: async () => ({ current: { frames, cards: {}, links: {} } }),
      settings: { get: async () => ({ models: { critic: { provider: 'openai', model: 'gpt-x' } } }) },
      setChildAgent: async (_id: string, role: string, sessionId: string) => {
        log.push(`setChildAgent ${role}`);
        meta = { ...meta, childAgentIds: { ...meta.childAgentIds, [role]: sessionId } };
        return structuredClone(meta);
      },
      unsetChildAgent: async (_id: string, role: string, sessionId: string) => {
        log.push(`unsetChildAgent ${role}`);
        if (meta.childAgentIds[role] === sessionId) {
          const { [role]: _drop, ...rest } = meta.childAgentIds;
          meta = { ...meta, childAgentIds: rest };
        }
        return structuredClone(meta);
      },
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'openai', model: 'gpt-6-luna' }) },
    agents: { get: (id: string) => (id === root.id ? root : children.get(id)) },
    subagents: {
      startContinuable: async (spec: any) => {
        log.push('startContinuable');
        if (options.failStart) throw new Error('boom');
        started.push(spec);
        children.set(spec.childId, {
          id: spec.childId,
          session: { header: { cwd: '/canvases/c1' } },
          whenIdle: async () => undefined,
        });
        return { childId: spec.childId, messageId: 'm1' };
      },
      sendMessage: async (sender: any, target: string, content: any[]) => {
        if (options.staleChild && target === 'scout-old')
          throw Object.assign(new Error(options.staleChild.message), {
            name: 'SubagentError',
            code: options.staleChild.code,
          });
        sent.push({ sender: sender.id, target, text: content.map((c) => c.text).join('') });
        return 'm2';
      },
      interrupt: (target: string, authority: unknown) => interrupts.push({ target, authority }),
    },
  };
  const exec = (agent: any) => ({ signal: new AbortController().signal, agent });
  return { ctx, root, children, log, injected, started, sent, interrupts, exec, meta: () => meta };
}

async function collect(agents: OrbAgents, n: number): Promise<AgentStatus[]> {
  const ac = new AbortController();
  const out: AgentStatus[] = [];
  for await (const s of agents.followStatus('c1', ac.signal)) {
    out.push(s);
    if (out.length >= n) break;
  }
  ac.abort();
  return out;
}

describe('allow-lists of the team (P3.4)', () => {
  it('carries safe child failure details to status and the parent instead of an unexplained failure notice', async () => {
    const f = teamCtx();
    const agents = new OrbAgents(f.ctx);
    const child = await agents.delegate(f.exec(f.root), {
      role: 'scout',
      frameIds: ['f_a'],
      instruction: 'Read this frame.',
    });
    agents.onSessionEvent(child.agentId, {
      type: 'turn/end',
      data: {
        reason: {
          kind: 'error',
          error: { code: 'AUTH', message: 'Missing credential sk-testsecret12345', status: 401 },
        },
      },
    });
    const statuses = await collect(agents, 2);
    expect(statuses.find((s) => s.agent === 'scout')?.failure).toMatchObject({ code: 'AUTH', status: 401 });
    expect(JSON.stringify(statuses)).not.toContain('sk-testsecret');
    const notice = {
      source: { kind: 'subagent-settled', senderSessionId: child.agentId },
      content: [{ type: 'text', text: 'Background subagent failed before it finished.' }],
    };
    const result = await agents.onPreStep(
      { agent: f.root as any, messages: [notice], step: 1 },
      async () => ({ kind: 'enter', messages: [notice] }),
    );
    expect(JSON.stringify(result)).toContain('Missing credential');
    expect(JSON.stringify(result)).toContain('Narrowing the research question does not fix');
    expect(JSON.stringify(result)).not.toContain('sk-testsecret');
  });
  it('children are allowed only their §2.4 tools that exist; Orb hides the children tools', () => {
    // P3.5: Scout's source tools exist now (its whole §2.4 list).
    expect(childToolAllow('scout')).toEqual([
      'web_search',
      'fetch_url',
      'fetch_signed_in',
      'read_source',
      'capture_page',
      'query_board',
      'place_card',
      'add_link',
      'consolidate_cards',
      'report_progress',
      'send_message',
      'query_dataset',
      'upsert_rows',
      ...PARALLEL_SCOUT_TOOL_NAMES,
      // P6.8: progressive disclosure and own-card layout.
      ...SCALE_TOOL_NAMES,
      ...LAYOUT_TOOL_NAMES,
    ]);
    // P3.8: Builder's write_design_frame exists now (its whole §2.4 list).
    expect(childToolAllow('builder')).toEqual([
      'query_board',
      'write_design_frame',
      'place_card',
      'consolidate_cards',
      'report_progress',
      'send_message',
      'query_dataset',
      'upsert_rows',
      ...SCALE_TOOL_NAMES,
      ...LAYOUT_TOOL_NAMES,
    ]);
    for (const role of ['scout', 'critic', 'builder'] as const)
      for (const t of childToolAllow(role)) expect(AGENT_TOOLS[role]).toContain(t);
    expect(childToolAllow('critic')).toContain('read_source');
    expect(hiddenPresetTools('orb')).toEqual([
      'consolidate_cards',
      'write_design_frame',
      'report_progress',
      'send_message',
      'web_search',
      'fetch_url',
      'capture_page',
      'fetch_signed_in',
      // P6.7: Scout's Parallel tools Orb does not hold (Orb keeps the answering, bulk and watch tools).
      'parallel_extract',
      'image_search',
    ]);
    expect(hiddenPresetTools('critic')).toEqual([
      'update_card',
      'add_frame',
      'update_frame',
      'write_design_frame',
      'upsert_rows',
      // P6.8: the whole-board layout tools are Orb's alone.
      'reorder_frames',
      'tidy_board',
      'delegate',
      'message_agent',
      'stop_agent',
      'web_search',
      'fetch_url',
      'capture_page',
      'fetch_signed_in',
      // P4.5: Orb's research document tool.
      'compose_section',
      // P6.17: the slides are Orb's too.
      'compose_slides',
      // P6.7: Parallel is for Orb and Scout only.
      ...PARALLEL_TOOL_NAMES,
    ]);
    expect(childToolAllow('critic')).not.toContain('compose_section');
    expect(childToolAllow('scout')).not.toContain('compose_slides');
  });
});

describe('OrbAgents.delegate', () => {
  it('checkpoints a report at the working-context budget and resets evidence receipts', async () => {
    const t = teamCtx();
    const agents = new OrbAgents(t.ctx);
    await agents.delegate(t.exec(t.root), {
      role: 'scout',
      frameIds: ['f_a'],
      instruction: 'Initial research.',
    });
    (agents as any).outputJobs.add('c1');
    let compactions = 0;
    let receiptsReset = 0;
    const nodes = Array.from({ length: 20 }, (_, seq) => ({ seq, tokens: 4000 }));
    Object.assign(t.ctx.orbCanvas, {
      port: {
        job: () => ({
          kind: 'compose',
          format: 'report',
          instructions: 'For procurement review.',
          plan: reportPlanFromFrames([{ id: 'f_a', title: 'Market' }]),
        }),
        get: async () => ({ doc: null }),
        resetInspections: () => {
          receiptsReset++;
        },
      },
    });
    Object.assign(t.ctx, {
      tokenMeter: { measure: () => ({ nodes, totalTokens: 80_000, logRevision: 1 }) },
      compaction: {
        compactRegion: async () => {
          compactions++;
        },
      },
    });
    Object.assign(t.root.session, {
      surface: { nodes: nodes.map((n) => n.seq), replaceGeneration: 0 },
      eventAt: (seq: number) => ({ seq, type: 'user/message', data: {} }),
    });
    const decision = await agents.onPreStep({ agent: t.root, step: 2, messages: [] } as any, async () => ({
      kind: 'enter',
      messages: [],
    }));
    expect(compactions).toBe(1);
    expect(receiptsReset).toBe(1);
    expect(JSON.stringify(decision)).toContain('Report checkpoint: continue writing');
    expect(JSON.stringify(decision)).toContain('For procurement review.');
    expect(JSON.stringify(decision)).toContain('scope-methodology');
    expect(JSON.stringify(decision)).toContain('Do not delegate or place cards.');
  });
  it.each([false, true])(
    'checkpoints current scope and corrections through compaction (same pending task=%s)',
    async (sameTask) => {
      const t = teamCtx();
      const agents = new OrbAgents(t.ctx);
      const { agentId } = await agents.delegate(t.exec(t.root), {
        role: 'scout',
        frameIds: ['f_a'],
        instruction: 'ORIGINAL-MARKET research.',
      });
      const child = t.children.get(agentId);
      child.status = 'running';
      await agents.delegate(t.exec(t.root), {
        role: 'scout',
        frameIds: ['f_b'],
        instruction: sameTask
          ? 'ORIGINAL-MARKET research.'
          : 'FOCUSED-BUDGET: verify only the missing costs.',
      });
      await agents.messageAgent(t.exec(t.root), {
        agent: 'scout',
        message: 'COUPLE-ONLY: quote both adults.',
      });
      let compactions = 0;
      const nodes = Array.from({ length: 20 }, (_, seq) => ({ seq, tokens: 4000 }));
      Object.assign(t.ctx, {
        tokenMeter: { measure: () => ({ nodes, totalTokens: 80_000, logRevision: 1 }) },
        compaction: {
          compactRegion: async () => {
            compactions++;
          },
        },
      });
      Object.assign(child.session, {
        surface: { nodes: nodes.map((n) => n.seq), replaceGeneration: 0 },
        eventAt: (seq: number) => ({ seq, type: 'user/message', data: {} }),
      });
      const decision = await agents.onPreStep({ agent: child, step: 2, messages: [] } as any, async () => ({
        kind: 'enter',
        messages: [],
      }));
      expect(compactions).toBe(1);
      const checkpoint = JSON.stringify(decision);
      expect(checkpoint).toContain(sameTask ? 'Assigned frames: f_a, f_b.' : 'Assigned frames: f_b.');
      expect(checkpoint).toContain(sameTask ? 'ORIGINAL-MARKET' : 'FOCUSED-BUDGET');
      expect(checkpoint).toContain('COUPLE-ONLY');
      expect(checkpoint).toContain('Risks [f_b]');
      if (!sameTask) {
        expect(checkpoint).not.toContain('ORIGINAL-MARKET');
        expect(checkpoint).not.toContain('Market [f_a]');
      }
    },
  );

  it('starts a continuable child with persona, allow-list and orb.json model, id written first', async () => {
    const t = teamCtx();
    const agents = new OrbAgents(t.ctx);
    const res = await agents.delegate(t.exec(t.root), {
      role: 'critic',
      frameIds: ['f_b', 'f_a'],
      instruction: 'Question the claims.',
    });
    expect(res).toMatchObject({ agent: 'critic', started: true, frames: ['02 Risks', '01 Market'] });
    expect(res.agentId).toMatch(/^critic-/);
    expect(t.log).toEqual(['setChildAgent critic', 'startContinuable']);
    expect(t.meta().childAgentIds).toEqual({ critic: res.agentId });
    const spec = t.started[0];
    expect(spec).toMatchObject({ provider: SUBAGENT_PROVIDER, childId: res.agentId });
    expect(spec.label).toBe('Critic: Question the claims.');
    expect(spec.request.parent).toBe(t.root);
    expect(spec.request.persona).toBe(CHILD_PERSONAS.critic);
    expect(spec.request.toolFilter).toEqual({ allow: childToolAllow('critic') });
    expect(spec.request.agentOptions).toEqual({ provider: 'openai', model: 'gpt-x' });
    expect(spec.request.outputSchema).toBeUndefined();
    expect(spec.request.prompt[0].text).toBe(
      assignmentMessage(
        'critic',
        [
          { id: 'f_b', number: 2, title: 'Risks' },
          { id: 'f_a', number: 1, title: 'Market' },
        ],
        'Question the claims.',
        true,
        { title: 'C' },
      ),
    );
    expect(spec.request.prompt[0].text).toContain('The canvas: C');
    // The child's cursor starts on its first frame.
    const [orb, critic] = await collect(agents, 2);
    expect(orb!.agent).toBe('orb');
    expect(critic).toMatchObject({
      agent: 'critic',
      state: 'running',
      frameId: 'f_b',
      sessionId: res.agentId,
    });

    // A second delegate to the same role messages the existing child.
    const again = await agents.delegate(t.exec(t.root), {
      role: 'critic',
      frameIds: ['f_a'],
      instruction: 'More.',
    });
    expect(again).toEqual({ agent: 'critic', agentId: res.agentId, started: false, frames: ['01 Market'] });
    expect(t.started).toHaveLength(1);
    expect(t.sent).toEqual([
      { sender: 'orb-root', target: res.agentId, text: expect.stringContaining('a new assignment from orb') },
    ]);
  });

  it('a failed start removes the child id from canvas.json again', async () => {
    const t = teamCtx({ failStart: true });
    const agents = new OrbAgents(t.ctx);
    await expect(
      agents.delegate(t.exec(t.root), { role: 'scout', frameIds: ['f_a'], instruction: 'x' }),
    ).rejects.toThrow('boom');
    expect(t.log).toEqual(['setChildAgent scout', 'startContinuable', 'unsetChildAgent scout']);
    expect(t.meta().childAgentIds).toEqual({});
  });

  it('a child id that cannot be continued is replaced by a fresh child', async () => {
    for (const stale of [
      { code: 'NOT_RESUMABLE', message: 'subagent "scout-old" is unavailable' },
      { code: 'UNAUTHORIZED', message: 'subagent "scout-old" belongs to another parent session' },
    ]) {
      const t = teamCtx({ staleChild: stale });
      const agents = new OrbAgents(t.ctx);
      const res = await agents.delegate(t.exec(t.root), {
        role: 'scout',
        frameIds: ['f_a'],
        instruction: 'x',
      });
      expect(res.started).toBe(true);
      expect(res.agentId).toMatch(/^scout-(?!old)/);
      expect(t.log).toEqual(['unsetChildAgent scout', 'setChildAgent scout', 'startContinuable']);
      expect(t.meta().childAgentIds).toEqual({ scout: res.agentId });
    }
    // Any other delivery failure is the tool's error; the id stays.
    const t = teamCtx({ staleChild: { code: 'ACTIVATION_CLOSING', message: 'closing' } });
    await expect(
      new OrbAgents(t.ctx).delegate(t.exec(t.root), { role: 'scout', frameIds: ['f_a'], instruction: 'x' }),
    ).rejects.toThrow('closing');
    expect(t.meta().childAgentIds).toEqual({ scout: 'scout-old' });
  });

  it('concurrent delegates to one role start one child', async () => {
    const t = teamCtx();
    const agents = new OrbAgents(t.ctx);
    const [a, b] = await Promise.all([
      agents.delegate(t.exec(t.root), { role: 'scout', frameIds: ['f_a'], instruction: 'x' }),
      agents.delegate(t.exec(t.root), { role: 'scout', frameIds: ['f_b'], instruction: 'y' }),
    ]);
    expect(t.started).toHaveLength(1);
    expect([a.started, b.started]).toEqual([true, false]);
    expect(b.agentId).toBe(a.agentId);
  });

  it('refuses unknown frames, bad arguments and non-Orb callers', async () => {
    const t = teamCtx();
    const agents = new OrbAgents(t.ctx);
    await expect(
      agents.delegate(t.exec(t.root), { role: 'scout', frameIds: ['f_zzz'], instruction: 'x' }),
    ).rejects.toThrow('no frame f_zzz');
    await expect(
      agents.delegate(t.exec(t.root), { role: 'orb', frameIds: ['f_a'], instruction: 'x' }),
    ).rejects.toThrow(/invalid role/);
    const { agentId } = await agents.delegate(t.exec(t.root), {
      role: 'scout',
      frameIds: ['f_a'],
      instruction: 'x',
    });
    const scout = t.children.get(agentId);
    await expect(
      agents.delegate(t.exec(scout), { role: 'critic', frameIds: ['f_a'], instruction: 'x' }),
    ).rejects.toThrow('delegate is not available to the scout agent');
    const stranger = { id: 'other', session: { header: { cwd: '/canvases/c1' } } };
    await expect(agents.messageAgent(t.exec(stranger), { agent: 'scout', message: 'x' })).rejects.toThrow(
      'not one of the canvas agents',
    );
  });
});

describe('message_agent, stop_agent, report_progress, send_message', () => {
  it('route between Orb and its child and publish the child status', async () => {
    const t = teamCtx();
    const agents = new OrbAgents(t.ctx);
    const { agentId } = await agents.delegate(t.exec(t.root), {
      role: 'scout',
      frameIds: ['f_a'],
      instruction: 'x',
    });
    const scout = t.children.get(agentId);

    expect(await agents.messageAgent(t.exec(t.root), { agent: 'scout', message: 'Focus.' })).toEqual({
      agent: 'scout',
      agentId,
      delivered: true,
    });
    expect(t.sent.at(-1)).toEqual({ sender: 'orb-root', target: agentId, text: 'orb: Focus.' });
    await expect(agents.messageAgent(t.exec(t.root), { agent: 'critic', message: 'x' })).rejects.toThrow(
      'Critic has not been started; use delegate',
    );

    // report_progress: status with cursor + label, and a one-line note injected into Orb (no wake).
    expect(await agents.reportProgress(t.exec(scout), { status: 'Reading IEA', frameId: 'f_b' })).toEqual({
      ok: true,
    });
    const statuses = await collect(agents, 2);
    expect(statuses[1]).toMatchObject({
      agent: 'scout',
      state: 'running',
      label: 'Reading IEA',
      frameId: 'f_b',
    });
    expect(t.injected).toHaveLength(1);
    expect(t.injected[0].content[0].text).toBe('[Scout progress] Reading IEA (frame 02 "Risks")');
    expect(t.injected[0].source).toEqual({ kind: 'agent-message', form: 'relay', senderSessionId: agentId });
    // Without a frame the cursor stays.
    await agents.reportProgress(t.exec(scout), { status: 'Still reading' });
    expect((await collect(agents, 2))[1]).toMatchObject({ label: 'Still reading', frameId: 'f_b' });
    await expect(agents.reportProgress(t.exec(t.root), { status: 'x' })).rejects.toThrow(
      'report_progress is not available to the orb agent',
    );
    await expect(agents.reportProgress(t.exec(scout), { status: 'x'.repeat(81) })).rejects.toThrow(
      /invalid status/,
    );

    // send_message: to Orb, labelled.
    expect(await agents.messageOrb(t.exec(scout), { about: 'done', message: 'Placed 3 sources.' })).toEqual({
      delivered: true,
    });
    expect(t.sent.at(-1)).toEqual({
      sender: agentId,
      target: 'orb-root',
      text: 'Scout (done): Placed 3 sources.',
    });
    await expect(agents.messageOrb(t.exec(t.root), { about: 'done', message: 'x' })).rejects.toThrow(
      'send_message is not available to the orb agent',
    );

    // stop_agent: interrupt with Orb as the ancestor authority.
    expect(await agents.stopAgent(t.exec(t.root), { agent: 'scout' })).toEqual({
      agent: 'scout',
      agentId,
      stopped: true,
    });
    expect(t.interrupts).toEqual([{ target: agentId, authority: { kind: 'ancestor', agent: t.root } }]);
    expect((await collect(agents, 2))[1]).toMatchObject({ agent: 'scout', state: 'stopped', frameId: 'f_b' });

    // Harness transitions of the child keep its cursor; a late idle after stopped adds nothing.
    agents.onAgentStatus(agentId, 'idle');
    expect((await collect(agents, 2))[1]).toMatchObject({ state: 'stopped' });
    // A stopped child reads running again once a step really starts (P3.7: the harness `running` is held back).
    agents.onAgentStatus(agentId, 'running');
    expect((await collect(agents, 2))[1]).toMatchObject({ state: 'stopped' });
    const m = { id: 'm1', content: [{ type: 'text', text: 'Orb: go on' }], source: { kind: 'user' } };
    await agents.onPreStep({ agent: { id: agentId }, messages: [m], step: 1 }, async () => ({
      kind: 'enter',
      messages: [m],
    }));
    expect((await collect(agents, 2))[1]).toMatchObject({
      state: 'running',
      frameId: 'f_b',
      label: 'Working',
    });
    agents.onAgentStatus(agentId, 'idle');
    expect((await collect(agents, 2))[1]).toMatchObject({ state: 'idle', frameId: 'f_b', label: 'Idle' });
  });
});
