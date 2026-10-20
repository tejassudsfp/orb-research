/**
 * P3.7 unit tests of OrbAgents' controls with fake agents: pause (queue kept, agent held), resume ("continue" plus
 * everything queued), redirect (steer / message), the `agent/pre-step` hold, settlement notices kept out of Orb's
 * turns after a user stop, stop-all order, and the team tools honouring `exec.signal`.
 */
import { describe, expect, it } from 'vitest';
import { RESUME_TEXT, type AgentStatus } from '@orb/shared';
import { OrbAgents, type PreStepDecision } from '../src/service.js';

type Rec = { kind: string; text: string; source?: any; message: any };

const textOf = (m: any): string =>
  (m?.content ?? []).map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('');

/** A fake live agent recording what it is sent, running until `finish()`. */
function fakeAgent(id: string, calls: string[]) {
  let release: () => void = () => undefined;
  let idle: Promise<void> = Promise.resolve();
  const sent: Rec[] = [];
  const agent = {
    id,
    status: 'idle' as 'idle' | 'running',
    session: { header: { cwd: '/canvases/c1' } },
    cancels: [] as Array<{ cause: { kind: string }; keepInbox: boolean }>,
    sent,
    start() {
      agent.status = 'running';
      idle = new Promise<void>((r) => (release = r));
    },
    finish() {
      agent.status = 'idle';
      release();
    },
    cancel(cause: { kind: string }, options: { keepInbox?: boolean } = {}) {
      calls.push(`cancel ${id}`);
      agent.cancels.push({ cause, keepInbox: options.keepInbox === true });
      if (agent.status === 'running') setTimeout(() => agent.finish(), 5);
    },
    whenIdle: () => idle,
    followup: (m: any) => void sent.push({ kind: 'followup', text: textOf(m), source: m.source, message: m }),
    steer: (m: any) => void sent.push({ kind: 'steer', text: textOf(m), source: m.source, message: m }),
    inject: (m: any) => void sent.push({ kind: 'inject', text: textOf(m), source: m.source, message: m }),
  };
  return agent;
}

function controlCtx() {
  const calls: string[] = [];
  const root = fakeAgent('orb-root', calls);
  const scout = fakeAgent('scout-1', calls);
  const meta = {
    id: 'c1',
    title: 'C',
    created: 1,
    rootSessionId: root.id,
    childAgentIds: { scout: scout.id } as Record<string, string>,
  };
  const live = new Map<string, any>([
    [root.id, root],
    [scout.id, scout],
  ]);
  const interrupts: Array<{ target: string; authority: any }> = [];
  const messages: Array<{ sender: string; target: string; text: string }> = [];
  const ctx = {
    orbCanvas: {
      open: async () => structuredClone(meta),
      dirOf: () => '/canvases/c1',
      canvasIdOfDir: (dir: string) => (dir === '/canvases/c1' ? 'c1' : undefined),
      board: async () => ({
        current: { frames: { f_a: { id: 'f_a', title: 'Market' } }, cards: {}, links: {} },
      }),
      chatContext: async () => undefined,
    },
    agents: {
      get: (id: string) => live.get(id),
      list: () => [...live.values()],
      isOwnedBy: (id: string, parent: unknown) => id === scout.id && parent === root,
    },
    subagents: {
      interrupt: (target: string, authority: any) => {
        calls.push(`interrupt ${target}`);
        interrupts.push({ target, authority });
        const child = live.get(target);
        child?.cancel({ kind: authority.kind }, { keepInbox: true });
      },
      sendMessage: async (sender: any, target: string, content: any[]) => {
        messages.push({ sender: sender.id, target, text: content.map((c) => c.text).join('\n') });
        return 'm1';
      },
      startContinuable: async () => {
        throw new Error('not in these tests');
      },
    },
  };
  const agents = new OrbAgents(ctx);
  const statuses: AgentStatus[] = [];
  const ac = new AbortController();
  void (async () => {
    for await (const s of agents.followStatus('c1', ac.signal)) statuses.push(s);
  })();
  return {
    ctx,
    meta,
    agents,
    root,
    scout,
    live,
    calls,
    interrupts,
    messages,
    statuses,
    close: () => ac.abort(),
  };
}

const userMessage = (text: string, source: any = { kind: 'user' }) => ({
  id: `m-${text}`,
  role: 'user',
  content: [{ type: 'text', text }],
  source,
});
const enter = (messages: unknown[]) => async (): Promise<PreStepDecision> => ({ kind: 'enter', messages });
const exec = (agent: any, signal = new AbortController().signal) => ({ callId: 'call_1', signal, agent });

describe('Pause and Resume (P3.7)', () => {
  it('pausing Orb cancels with the queue kept, holds every step and message, and Resume steers "continue" plus all of it', async () => {
    const { agents, root, statuses, close } = controlCtx();
    await agents.openRoot?.('c1').catch(() => undefined);
    root.start();
    const result = await agents.pause('c1', 'orb');
    expect(result).toMatchObject({ action: 'pause', state: 'paused', agents: 1 });
    expect(root.cancels).toEqual([{ cause: { kind: 'user' }, keepInbox: true }]);
    expect(agents.isPaused('c1', 'orb')).toBe(true);
    await expect.poll(() => statuses.findLast((s) => s.agent === 'orb')?.state).toBe('paused');
    // The harness flips running/idle while paused (a rejected step): the stream keeps reading paused.
    agents.onAgentStatus(root.id, 'running');
    agents.onAgentStatus(root.id, 'idle');
    expect(statuses.findLast((s) => s.agent === 'orb')?.state).toBe('paused');

    // A step it would start (a child's settlement notice, a queued message) is rejected; its messages are kept.
    const woke = userMessage('Background subagent x finished.', {
      kind: 'subagent-settled',
      senderSessionId: 'x',
    });
    expect(await agents.onPreStep({ agent: root, messages: [woke], step: 1 }, enter([woke]))).toEqual({
      kind: 'reject',
    });
    // Chat and redirect while paused are queued, not delivered.
    await agents.send('c1', 'Also look at pricing.');
    expect(await agents.redirect('c1', 'orb', 'Focus on Europe.')).toEqual({
      action: 'redirect',
      state: 'queued',
      agents: 1,
    });
    expect(root.sent).toEqual([]);

    const resumed = await agents.resume('c1', 'all');
    expect(resumed).toEqual({ action: 'resume', state: 'resumed', agents: 1, queued: 2 });
    expect(agents.isPaused('c1', 'orb')).toBe(false);
    // Everything held goes back in order (no wake), then the "continue" steer wakes it: one step takes it all.
    expect(root.sent.map((r) => [r.kind, r.text])).toEqual([
      ['inject', 'Background subagent x finished.'],
      ['inject', expect.stringContaining('Also look at pricing.')],
      ['inject', 'Focus on Europe.'],
      ['steer', RESUME_TEXT],
    ]);
    expect(root.sent[3]!.source).toEqual({ kind: 'user' });
    // Not paused any more: steps go through.
    const m = userMessage('hello');
    expect(await agents.onPreStep({ agent: root, messages: [m], step: 1 }, enter([m]))).toEqual({
      kind: 'enter',
      messages: [m],
    });
    close();
  });

  it('pausing a child interrupts it with the user authority; Orb messages and delegations to it are queued until Resume', async () => {
    const { agents, root, scout, interrupts, messages, statuses, close } = controlCtx();
    await agents.statusOf('c1');
    scout.start();
    expect(await agents.pause('c1', 'scout')).toMatchObject({ action: 'pause', state: 'paused', agents: 1 });
    expect(interrupts).toEqual([{ target: scout.id, authority: { kind: 'user', parentSessionId: root.id } }]);
    expect(scout.cancels).toEqual([{ cause: { kind: 'user' }, keepInbox: true }]);
    expect(root.cancels).toEqual([]); // Orb keeps working
    await expect.poll(() => statuses.findLast((s) => s.agent === 'scout')?.state).toBe('paused');

    expect(await agents.messageAgent(exec(root), { agent: 'scout', message: 'Skip blogs.' })).toEqual({
      agent: 'scout',
      agentId: scout.id,
      delivered: false,
      queued: true,
    });
    const delegated = await agents.delegate(exec(root), {
      role: 'scout',
      frameIds: ['f_a'],
      instruction: 'Find pricing pages.',
    });
    expect(delegated).toMatchObject({ agent: 'scout', agentId: scout.id, started: false, queued: true });
    expect(messages).toEqual([]);
    // A step the child would take while paused is held too.
    const m = userMessage('stray');
    expect(await agents.onPreStep({ agent: scout, messages: [m], step: 1 }, enter([m]))).toEqual({
      kind: 'reject',
    });
    expect(await agents.redirect('c1', 'scout', 'Only primary sources.')).toMatchObject({ state: 'queued' });

    expect(await agents.resume('c1', 'scout')).toEqual({
      action: 'resume',
      state: 'resumed',
      agents: 1,
      queued: 3,
    });
    expect(messages).toHaveLength(1);
    const [sent] = messages;
    expect(sent!.sender).toBe(root.id);
    expect(sent!.target).toBe(scout.id);
    const parts = sent!.text.split('\n');
    expect(parts[0]).toBe(RESUME_TEXT);
    expect(sent!.text).toContain('orb: Skip blogs.');
    expect(sent!.text).toContain('Find pricing pages.');
    expect(sent!.text).toContain('stray');
    expect(sent!.text).toContain('The user redirects you: Only primary sources.');
    await expect
      .poll(() => statuses.findLast((s) => s.agent === 'scout'))
      .toMatchObject({ state: 'running', label: 'Resuming' });
    close();
  });

  it('a child send_message to a paused Orb is queued and arrives with the Resume', async () => {
    const { agents, root, scout, messages, close } = controlCtx();
    await agents.pause('c1', 'orb');
    expect(await agents.messageOrb(exec(scout), { about: 'done', message: 'Placed 3 sources.' })).toEqual({
      delivered: false,
      queued: true,
    });
    expect(messages).toEqual([]);
    await agents.resume('c1', 'orb');
    expect(root.sent.map((r) => [r.kind, r.text])).toEqual([
      ['inject', 'Scout (done): Placed 3 sources.'],
      ['steer', RESUME_TEXT],
    ]);
    expect(root.sent[0]!.source).toEqual({ kind: 'agent-message', form: 'relay', senderSessionId: scout.id });
    close();
  });

  it('Pause all pauses every started child and Orb; Resume all continues them; Stop drops a pause and its queue', async () => {
    const { agents, root, scout, messages, close } = controlCtx();
    root.start();
    scout.start();
    expect(await agents.pause('c1', 'all')).toMatchObject({ action: 'pause', state: 'paused', agents: 2 });
    expect(agents.isPaused('c1', 'orb') && agents.isPaused('c1', 'scout')).toBe(true);
    // Not started: not found.
    await expect(agents.pause('c1', 'critic')).rejects.toMatchObject({ code: 'orb/not-found' });
    expect(await agents.resume('c1', 'all')).toMatchObject({ agents: 2, queued: 0 });
    expect(messages.map((m) => m.target)).toEqual([scout.id]);
    expect(root.sent.map((r) => r.text)).toEqual([RESUME_TEXT]);

    await agents.pause('c1', 'orb');
    await agents.send('c1', 'queued chat');
    expect(await agents.stopOne('c1', 'orb')).toMatchObject({ action: 'stop', state: 'stopped' });
    expect(agents.isPaused('c1', 'orb')).toBe(false);
    expect(await agents.resume('c1', 'orb')).toMatchObject({ agents: 0, queued: 0 });
    expect(root.sent.map((r) => r.text)).toEqual([RESUME_TEXT]);
    close();
  });

  it('Resume all skips a child whose start was aborted by the pause (its id is gone from canvas.json)', async () => {
    const { agents, meta, root, messages, close } = controlCtx();
    expect(await agents.pause('c1', 'all')).toMatchObject({ agents: 2 });
    // Orb's in-flight delegate was aborted by the pause and took the child id back.
    delete meta.childAgentIds.scout;
    expect(await agents.resume('c1', 'all')).toMatchObject({ action: 'resume', agents: 1 });
    expect(messages).toEqual([]);
    expect(agents.isPaused('c1', 'scout')).toBe(false);
    expect(root.sent.map((r) => r.text)).toEqual([RESUME_TEXT]);
    close();
  });

  it('a redirect steers Orb or messages the child when they are not paused', async () => {
    const { agents, root, scout, messages, close } = controlCtx();
    expect(await agents.redirect('c1', 'all', 'Look at Asia.')).toEqual({
      action: 'redirect',
      state: 'delivered',
      agents: 1,
    });
    expect(root.sent.map((r) => [r.kind, r.text, r.source.kind])).toEqual([
      ['steer', 'Look at Asia.', 'user'],
    ]);
    expect(await agents.redirect('c1', 'scout', 'Read the 10-K.')).toMatchObject({ state: 'delivered' });
    expect(messages).toEqual([
      { sender: root.id, target: scout.id, text: 'The user redirects you: Read the 10-K.' },
    ]);
    await expect(agents.redirect('c1', 'builder', 'x')).rejects.toMatchObject({ code: 'orb/not-found' });
    await expect(agents.redirect('c1', 'orb', '  ')).rejects.toMatchObject({ code: 'orb/invalid-args' });
    close();
  });
});

describe('Stop and settlement notices (P3.7)', () => {
  it('stop all cancels the children before the root, and their settlement notices never start an Orb turn', async () => {
    const { agents, root, scout, calls, close } = controlCtx();
    root.start();
    scout.start();
    await agents.pause('c1', 'scout'); // a pause is dropped by Stop all
    calls.length = 0;
    const result = await agents.stop('c1');
    expect(result).toMatchObject({ action: 'stop', state: 'stopped', agents: 2 });
    expect(calls).toEqual([`cancel ${scout.id}`, `cancel ${root.id}`]);
    expect(agents.isPaused('c1', 'scout')).toBe(false);

    // The harness then tells Orb the child was stopped: the step is rejected (no model request, no wake turn).
    const notice = userMessage('Background subagent scout-1 was stopped before it finished.', {
      kind: 'subagent-settled',
      form: 'notice',
      summary: 'stopped',
      senderSessionId: scout.id,
    });
    expect(await agents.onPreStep({ agent: root, messages: [notice], step: 1 }, enter([notice]))).toEqual({
      kind: 'reject',
    });
    // Only once: a later natural settlement of that child (re-delegated) wakes Orb as usual.
    const later = { ...notice, id: 'm-later' };
    expect(await agents.onPreStep({ agent: root, messages: [later], step: 1 }, enter([later]))).toEqual({
      kind: 'enter',
      messages: [later],
    });
    // Orb gets the kept notice as context with the user's next message.
    await agents.send('c1', 'What next?');
    expect(root.sent.map((r) => [r.kind, r.text])).toEqual([
      ['inject', 'Background subagent scout-1 was stopped before it finished.'],
      ['followup', expect.stringContaining('What next?')],
    ]);
    close();
  });

  it('a chat message that arrived while a kept notice was rejected is re-delivered once that turn ends', async () => {
    const { agents, root, scout, close } = controlCtx();
    scout.start();
    await agents.stopOne('c1', 'scout');
    const parked = userMessage('Summarise.');
    // The harness inbox: the message came in while the rejected step ran, so the turn left it parked.
    const inbox = {
      nextTurn: [parked] as unknown[],
      nextStep: [] as unknown[],
      splice(target: 'next-turn' | 'next-step', start: number, count: number) {
        const list = target === 'next-turn' ? inbox.nextTurn : inbox.nextStep;
        return list.splice(start, count);
      },
    };
    (root as any).inbox = inbox;
    const notice = userMessage('Background subagent scout-1 was stopped.', {
      kind: 'subagent-settled',
      senderSessionId: scout.id,
    });
    expect(await agents.onPreStep({ agent: root, messages: [notice], step: 1 }, enter([notice]))).toEqual({
      kind: 'reject',
    });
    await expect.poll(() => root.sent.map((r) => [r.kind, r.text])).toEqual([['followup', 'Summarise.']]);
    expect(inbox.nextTurn).toEqual([]);
    close();
  });

  it('a kept notice inside a running turn is filtered out of the step, the rest goes through', async () => {
    const { agents, root, scout, close } = controlCtx();
    scout.start();
    await agents.stopOne('c1', 'scout');
    const notice = userMessage('Background subagent scout-1 was stopped.', {
      kind: 'subagent-settled',
      senderSessionId: scout.id,
    });
    const user = userMessage('Keep going');
    const context = userMessage('runtime context', { kind: 'runtime-context' });
    expect(
      await agents.onPreStep(
        { agent: root, messages: [notice, user], step: 2 },
        enter([notice, user, context]),
      ),
    ).toEqual({ kind: 'enter', messages: [user, context] });
    close();
  });

  it('Stop on one child clears its queue (interrupt, then cancel without keepInbox)', async () => {
    const { agents, scout, close } = controlCtx();
    scout.start();
    await agents.stopOne('c1', 'scout');
    expect(scout.cancels.map((c) => c.keepInbox)).toEqual([true, false]);
    close();
  });
});

describe('team tools honour exec.signal (P3.7)', () => {
  it('an aborted call fails before any side effect', async () => {
    const { agents, root, scout, messages, interrupts, statuses, close } = controlCtx();
    const ac = new AbortController();
    ac.abort(new Error('user stop'));
    await expect.poll(() => statuses.length).toBeGreaterThan(0);
    const before = statuses.length;
    for (const run of [
      () => agents.delegate(exec(root, ac.signal), { role: 'scout', frameIds: ['f_a'], instruction: 'x' }),
      () => agents.messageAgent(exec(root, ac.signal), { agent: 'scout', message: 'x' }),
      () => agents.stopAgent(exec(root, ac.signal), { agent: 'scout' }),
      () => agents.reportProgress(exec(scout, ac.signal), { status: 'x', frameId: 'f_a' }),
      () => agents.messageOrb(exec(scout, ac.signal), { about: 'done', message: 'x' }),
    ])
      await expect(run()).rejects.toThrow('user stop');
    expect(messages).toEqual([]);
    expect(interrupts).toEqual([]);
    expect(root.sent).toEqual([]);
    await new Promise((r) => setTimeout(r, 20));
    expect(statuses.length).toBe(before);
    close();
  });
});

describe('Pause survives a restart (P6.9)', () => {
  /** A canvas service double that keeps pause.json in memory, shared across "app sessions". */
  function withDisk(disk: { state: unknown | null }) {
    const c = controlCtx();
    (c.ctx.orbCanvas as any).writePauseState = async (_id: string, state: unknown | null) => {
      disk.state = state === null ? null : structuredClone(state);
    };
    (c.ctx.orbCanvas as any).readPauseState = async () => structuredClone(disk.state ?? undefined);
    return c;
  }

  it('a paused Orb and Scout, and what they were sent, are paused again after the app restarts; Stop clears it', async () => {
    const disk: { state: unknown | null } = { state: null };
    const a = withDisk(disk);
    await a.agents.openRoot('c1');
    await a.agents.pause('c1', 'all');
    await a.agents.send('c1', 'while paused');
    await a.agents.redirect('c1', 'scout', 'look at pricing');
    await a.agents.flushPause();
    expect(disk.state).toMatchObject({
      v: 1,
      paused: { orb: { held: [{ kind: 'followup' }] }, scout: { held: [{ kind: 'text' }] } },
    });
    a.close();

    // A new app session: nothing in memory, the disk state is read when the canvas is opened.
    const b = withDisk(disk);
    expect(b.agents.isPaused('c1', 'orb')).toBe(false);
    await b.agents.openRoot('c1');
    expect(b.agents.isPaused('c1', 'orb')).toBe(true);
    expect(b.agents.isPaused('c1', 'scout')).toBe(true);
    await expect.poll(() => b.statuses.findLast((s) => s.agent === 'orb')?.state).toBe('paused');
    await expect.poll(() => b.statuses.findLast((s) => s.agent === 'scout')?.state).toBe('paused');
    // Resume delivers what was queued before the restart.
    const resumed = await b.agents.resume('c1', 'all');
    expect(resumed).toMatchObject({ action: 'resume', state: 'resumed', queued: 2 });
    expect(b.root.sent.some((m) => m.text.includes('while paused'))).toBe(true);
    expect(b.messages.some((m) => m.target === 'scout-1' && m.text.includes('look at pricing'))).toBe(true);
    await b.agents.flushPause();
    expect(disk.state).toBeNull();
    b.close();

    // Stop clears a pause (and its file).
    const c = withDisk(disk);
    await c.agents.openRoot('c1');
    await c.agents.pause('c1', 'orb');
    await c.agents.flushPause();
    expect(disk.state).not.toBeNull();
    await c.agents.stop('c1');
    await c.agents.flushPause();
    expect(disk.state).toBeNull();
    c.close();
  });
});
