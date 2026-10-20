/**
 * P1.8 review: the BUILD_PLAN §2.4 allow-list guard binds EVERY agent on the `orb` preset, on a real sidecar.
 *
 * The test profile re-enables one harmless non-Orb global tool (`todo_write`, @deepseek-ai/dsh-tool-todo) so the
 * model can try a tool outside the allow-list. The guard must deny it both for the canvas's root agent (composed
 * by orbAgents) and for a plain gateway session (`session/create`, composed by the session-controller, which only
 * mounts the preset): the guard is a row in the preset scope (`@orb/agents/guard`).
 *
 * P3.3: the preset guard applies the CALLER's allow-list: a session listed as Critic in canvas.json is refused Orb's
 * frame tools by the guard itself (before the tool body runs), and keeps the board tools on Critic's list.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CanvasMeta } from '@orb/shared';
import { startMockedSidecar, type MockedSidecar } from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';

/** Test-only: one global non-Orb tool, so a forbidden call can reach the guard. */
const EXTRA_TOOL_PATCH = [
  '- insert:',
  '    - id: test-tool-todo',
  "      name: '@deepseek-ai/dsh-tool-todo'",
  '      config:',
  '        allowParallelInProgress: true',
  '',
].join('\n');

let sc: MockedSidecar;
let wire: Wire;

beforeAll(async () => {
  sc = await startMockedSidecar({ extraPatch: EXTRA_TOOL_PATCH });
  wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
});

afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
});

const TODO_ARGS = { todos: [{ content: 'step', status: 'pending' }] };

/** Script one forbidden call, run `send`, and return the tool result message the model gets back. */
async function forbiddenCallResult(callId: string, send: () => Promise<unknown>) {
  const first = sc.llm.requests.length;
  sc.llm.enqueue({ toolCalls: [{ id: callId, name: 'todo_write', arguments: TODO_ARGS }] }, { text: 'ok' });
  await send();
  const req = await sc.llm.waitForRequest((r) => r.id === first + 1);
  // The extra tool really is offered, so the call is a real dispatch that reaches the guard.
  const offered = (req.body.tools as Array<{ function: { name: string } }>).map((t) => t.function.name);
  expect(offered).toContain('todo_write');
  const followUp = await sc.llm.waitForRequest((r) => r.id === first + 2);
  const toolMsg = followUp.body.messages.at(-1);
  expect(toolMsg).toMatchObject({ role: 'tool', tool_call_id: callId });
  return String(toolMsg.content);
}

describe('orb allow-list guard', () => {
  it('denies a non-Orb tool to the root agent of a canvas', async () => {
    const canvas = await wire.orb.canvas.create({ prompt: 'Guard check' });
    const content = await forbiddenCallResult('call_root_todo', () =>
      wire.orb.chat.send(canvas.id, { text: 'make a todo list' }),
    );
    expect(content).toContain('not available to the orb agent');
  });

  it('denies a non-Orb tool to a gateway-composed session on the orb preset', async () => {
    const created = await wire.session.create();
    expect(created.agentPreset).toBe('orb');
    const content = await forbiddenCallResult('call_gw_todo', () =>
      wire.session.prompt(created.sessionId, 'make a todo list'),
    );
    expect(content).toContain('not available to the orb agent');
  });

  it("P3.3: applies the caller's own allow-list: a Critic session is refused add_frame by the guard", async () => {
    const canvas = await wire.orb.canvas.create({ prompt: 'Guard roles' });
    const dir = join(sc.paths.orbHome, 'canvases', canvas.id);
    const critic = (await wire.session.create({ cwd: dir })).sessionId;
    // P3.4 `delegate` will write this; here the test lists the gateway session as the canvas's Critic.
    const file = join(dir, 'canvas.json');
    const meta = JSON.parse(readFileSync(file, 'utf8')) as CanvasMeta;
    writeFileSync(file, JSON.stringify({ ...meta, childAgentIds: { critic } }));
    await wire.orb.canvas.open(canvas.id);

    const call = async (callId: string, name: string, args: Record<string, unknown>) => {
      const first = sc.llm.requests.length;
      sc.llm.enqueue({ toolCalls: [{ id: callId, name, arguments: args }] }, { text: 'ok' });
      await wire.session.prompt(critic, `run ${name}`);
      const followUp = await sc.llm.waitForRequest((r) => r.id === first + 2);
      const toolMsg = followUp.body.messages.at(-1);
      expect(toolMsg).toMatchObject({ role: 'tool', tool_call_id: callId });
      return String(toolMsg.content);
    };
    expect(await call('call_critic_frame', 'add_frame', { title: 'Mine' })).toContain(
      'tool "add_frame" is not available to the critic agent',
    );
    expect(await call('call_critic_todo', 'todo_write', TODO_ARGS)).toContain(
      'tool "todo_write" is not available to the critic agent',
    );
    const placed = await call('call_critic_q', 'place_card', {
      type: 'question',
      title: 'Is it real?',
      body: 'No source yet.',
      why: 'Unsupported claim.',
    });
    expect(JSON.parse(placed)).toHaveProperty('cardId');
  });
});
