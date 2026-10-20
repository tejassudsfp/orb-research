/**
 * Cordis row `orb-agent-tools` (`@orb/agents/tools`): the team tools of BUILD_PLAN P3.4.
 *
 * - Orb: `delegate({role, frameIds, instruction})`, `message_agent({agent, message})`, `stop_agent({agent})`.
 * - Scout, Critic, Builder: `report_progress({status, frameId?})` and `send_message({about, message})`.
 *
 * Like `orb-board-tools`, the row sits in the `plugins` list of the `orb` agent preset (packages/orb-bundle/
 * cordis.patch.yml), so the tools land in the preset's scope layer: only agents bound to the preset (the root agent,
 * and its continuable children, which join the parent's preset: dsh-subagent `applyChildComposition`) see them.
 * Each role is offered only its §2.4 tools: Orb hides the children's tools with `tools.restrict({deny})`, and each
 * child is started with `toolFilter.allow` = its allow-list. The guard and the role check inside every tool are
 * the second and third walls.
 *
 * The work is done by the `orbAgents` service (service.ts); this row only declares the model-facing tools. Caller
 * identity comes from the exec context (`exec.agent`), never from model arguments.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { abortFirst, isCanvasError } from '@orb/canvas';
import type { OrbAgents, TeamToolExec } from './service.js';

export const name = 'orb-agent-tools';
export const inject = ['tools', 'orbAgents'];

const CHILD_ROLES = ['scout', 'critic', 'builder'];

const text = (value: unknown) => [{ type: 'text', text: JSON.stringify(value) }];

/** Business errors reach the model as one short line (`Error: <message>`), like the board tools'. */
async function run<T>(exec: TeamToolExec, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (exec.signal.aborted) throw err;
    if (isCanvasError(err)) throw new Error(err.message, { cause: err });
    throw err;
  }
}

export function apply(ctx: any) {
  // Every tool fails at once with the abort reason when its call is already aborted (P3.7).
  const tools = { register: (tool: any) => ctx.tools.register(abortFirst(tool)) };
  const agents = () => ctx.orbAgents as OrbAgents;

  tools.register(
    defineTool({
      name: 'delegate',
      description:
        'Give research work to one of your agents: Scout (finds and reads web sources: source, quote and image ' +
        'cards), Critic (finds contradictions, weak claims and gaps: question and risk cards) or Builder (HTML ' +
        'mockups, diagrams, tables). Name the frames it should work on (frameIds from query_board or add_frame) ' +
        'and a one-line instruction. The first call starts the agent; later calls send it a new assignment. It ' +
        'works in the background and places its cards itself; you get its progress as notes and a message when ' +
        'it is done.',
      parameters: {
        role: { type: 'string', enum: CHILD_ROLES, required: true, description: 'Which agent.' },
        frameIds: {
          type: 'array',
          items: { type: 'string' },
          required: true,
          description: 'Frames it works on (ids like f_…), most important first.',
        },
        instruction: {
          type: 'string',
          required: true,
          description: 'What to do there, in one or two lines.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            agent: { type: 'string', required: true, description: 'The agent role.' },
            agentId: { type: 'string', required: true, description: "The agent's id." },
            started: { type: 'boolean', required: true, description: 'True when the agent was started now.' },
            working: { type: 'boolean', description: 'Already researching these frames; await completion instead of repeating the assignment.' },
            message: { type: 'string', description: 'Guidance when the assignment is already active.' },
            queued: {
              type: 'boolean',
              description: 'True when the agent is paused by the user: it gets the assignment when resumed.',
            },
            frames: { type: 'array', required: true, items: { type: 'string' }, description: 'Its frames.' },
          },
        },
        render: (_args: unknown, value: unknown) => text(value),
      },
      execute: (args: unknown, exec: TeamToolExec) => run(exec, () => agents().delegate(exec, args)),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'message_agent',
      description:
        'Redirect one of your running agents (Scout, Critic or Builder): it gets your message at its next step. ' +
        'Use it to change focus, add a constraint or answer its question.',
      parameters: {
        agent: { type: 'string', enum: CHILD_ROLES, required: true, description: 'Which agent.' },
        message: { type: 'string', required: true, description: 'The message.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            agent: { type: 'string', required: true, description: 'The agent role.' },
            agentId: { type: 'string', required: true, description: "The agent's id." },
            delivered: { type: 'boolean', required: true, description: 'True when it was delivered.' },
            queued: {
              type: 'boolean',
              description: 'True when the agent is paused by the user: it gets the message when resumed.',
            },
          },
        },
        render: (_args: unknown, value: unknown) => text(value),
      },
      execute: (args: unknown, exec: TeamToolExec) => run(exec, () => agents().messageAgent(exec, args)),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'stop_agent',
      description:
        'Stop one of your agents (Scout, Critic or Builder) now. Its cards stay on the board; delegate or ' +
        'message_agent continues it later. During research, a recently active worker is kept running; wait for ' +
        'its completion notice instead of cancelling source gathering because rows have not arrived yet. User Stop controls always interrupt immediately.',
      parameters: {
        agent: { type: 'string', enum: CHILD_ROLES, required: true, description: 'Which agent.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            agent: { type: 'string', required: true, description: 'The agent role.' },
            agentId: { type: 'string', required: true, description: "The agent's id." },
            stopped: { type: 'boolean', required: true, description: 'True when it stopped within 1 s.' },
            working: {
              type: 'boolean',
              description: 'True when active research should be allowed to finish.',
            },
            message: {
              type: 'string',
              description: 'Why active research was kept running and what to do next.',
            },
          },
        },
        render: (_args: unknown, value: unknown) => text(value),
      },
      execute: (args: unknown, exec: TeamToolExec) => run(exec, () => agents().stopAgent(exec, args)),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'report_progress',
      description:
        'Tell the user and orb what you are doing now: a short status (≤80 chars) and the frame you are working ' +
        'in. Your cursor moves to that frame. Call it often: when you start, when you change frame and every few ' +
        'cards. It does not interrupt orb.',
      parameters: {
        status: { type: 'string', required: true, description: 'What you are doing, ≤80 chars.' },
        frameId: { type: 'string', description: 'The frame you are working in.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { ok: { type: 'boolean', required: true, description: 'Always true.' } },
        },
        render: () => [{ type: 'text', text: 'progress reported' }],
      },
      execute: (args: unknown, exec: TeamToolExec) => run(exec, () => agents().reportProgress(exec, args)),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'send_message',
      description:
        'Send a message to orb, the lead agent. Only when you are done (what you placed and where, in one or ' +
        'two lines) or when you need a decision you cannot make yourself. It wakes orb, so do not use it for ' +
        'progress: use report_progress for that.',
      parameters: {
        about: {
          type: 'string',
          enum: ['done', 'decision'],
          required: true,
          description: 'done: your work is finished; decision: you need orb to decide something.',
        },
        message: { type: 'string', required: true, description: 'The message, short and self-contained.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            delivered: { type: 'boolean', required: true, description: 'True when delivered.' },
            queued: {
              type: 'boolean',
              description: 'True when orb is paused: it gets the message when resumed.',
            },
          },
        },
        render: (_args: unknown, value: unknown) => [
          {
            type: 'text',
            text: (value as { queued?: boolean })?.queued
              ? 'orb is paused; it gets your message when resumed'
              : 'message delivered to orb',
          },
        ],
      },
      execute: (args: unknown, exec: TeamToolExec) => run(exec, () => agents().messageOrb(exec, args)),
    } as any),
  );
}
