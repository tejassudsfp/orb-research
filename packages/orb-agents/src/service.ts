/**
 * Cordis row `orb-agents` (`@orb/agents/service`): provides `orbAgents`, which owns every canvas's root Orb agent.
 *
 * - `createRoot(canvasId)`: `ctx.agents.create({sessionId, meta:{cwd: canvas folder, agentPreset:'orb'},
 *   agentOptions: default model, setup})`. `setup` mounts the `orb` preset (whose plugin rows register
 *   the board tools in the preset scope), hides the preset board tools outside the role's allow-list from the agent
 *   (`ctx.tools.restrict({deny})`, P3.2: `consolidate_cards` for Orb) and installs an agent-scoped `ctx.tools.guard`
 *   that denies any tool outside the Orb allow-list (BUILD_PLAN §2.4). The session id is stored in canvas.json.
 * - `openRoot(canvasId)`: called when a canvas is opened. Makes the canvas's root agent live: an agent already in
 *   the registry is reused; a persisted root session is resumed with `ctx.agents.resume({resumeSessionId})` (the
 *   harness resume path, same setup), never replaced by a new session; a canvas without one gets a new root agent.
 * - `send(canvasId, text, {context, threadOf})`: queues a user turn on the root agent (`agent.followup`) with the
 *   in-context frames/cards and the thread's card as describe() text (P3.3), resuming the persisted session first
 *   when the agent is not live (e.g. after a sidecar restart).
 * - `startCanvas(canvasId, prompt)` (P3.3): the new-canvas turn (propose 3–5 frames, start Scout and Critic).
 * - Models (P3.3): every agent's route comes from orb.json `models[role]`, else the harness default model
 *   (openai/gpt-6-luna in the Orb profile).
 * - `stop(canvasId)` (P1.10): cancels the root agent with `{kind:'user'}` (clearing its inbox) and every live
 *   descendant it owns with `{kind:'parent'}`, then races `whenIdle()` of all of them against a 1 s timer.
 *   `agents.status` subscribers see `stopping` at once, then `stopped` or `stop-timeout` with the measured ms.
 * - `followStatus(canvasId, signal)` (P1.10): the root agent's state now, then every change. Running/idle come from
 *   the harness `agent/status` event; while a stop is in flight those transitions are held back so the stream reads
 *   `stopping` → `stopped`/`stop-timeout` (the next `running` is published as usual).
 *
 * - Team (P3.4): `delegate` starts Scout, Critic or Builder as a continuable child of the root agent
 *   (`ctx.subagents.startContinuable` with the role's persona, `toolFilter.allow` = its allow-list and its orb.json
 *   model) the first time, and messages the existing child afterwards; child ids live in canvas.json
 *   `childAgentIds` (written BEFORE the child's first turn, so the board tools and the guard know its role).
 *   `messageAgent` / `stopAgent` redirect or interrupt one child; `reportProgress` moves the child's cursor and
 *   label on `agents.status` and adds a one-line note to Orb's context with `inject()` (no wake);
 *   `messageOrb` is the child's `send_message` (done / need a decision), which wakes Orb.
 * - Status (P3.4): `agents.status` carries every agent of the canvas (Orb and its children), each with its own
 *   state, label and frame.
 *
 * - Controls (P3.7): `pause` halts an agent with its queue kept (root: `cancel({kind:'user'}, {keepInbox: true})`;
 *   child: `ctx.subagents.interrupt` with the user's authority) and holds it: every step it would start while paused
 *   is rejected at `agent/pre-step` with its messages kept, and `chat.send`, `delegate`, `message_agent`,
 *   `send_message` and redirects addressed to it are queued here instead of delivered. `resume` steers it with
 *   RESUME_TEXT plus everything queued. `redirect` steers Orb, or messages a child. Stop all cancels the children,
 *   then the root, and waits ≤1 s; the settlement notices of children the USER stopped or paused are kept out of
 *   Orb's turns (they would wake it, HARNESS_NOTES §P3.4) and handed to Orb with the user's next message instead.
 *
 * Agents created here are owned by this row's fiber: unloading it disposes them (handles kept in `handles`).
 */
import { createHash, randomUUID } from 'node:crypto';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { z } from 'zod';
import type { CanvasStore } from '@orb/canvas';
import { CanvasError } from '@orb/canvas';
import {
  AGENT_LABELS,
  CHILD_AGENTS,
  DEFAULT_AGENT_MODEL,
  RESUME_TEXT,
  STOP_TIMEOUT_MS,
  boardFrames,
  cardTitle,
  childToolAllow,
  hiddenPresetTools,
  isChildAgent,
  type ChildAgentName,
  type ChatContext,
  type ModelRoute,
  type AgentControlResult,
  type AgentName,
  type AgentStatus,
  type CanvasMeta,
  type PortComposeArgs,
  type DeckComposeArgs,
  type Deck,
  type DeckProgress,
  deckFormatById,
  STANDARD_DECK_FORMAT,
  type PortDoc,
  type PortFormat,
  reportProblems,
  reportPlan,
  type PortProgress,
  type PrintScope,
  unreadMustRead,
  specOf,
  scoringGuide,
  scrubSecrets,
  type ResearchCoverage,
} from '@orb/shared';
import {
  completionMessage,
  repairAllowed,
  researchFingerprint,
  researchRun,
  requestedResearchOutputs,
  reviewResearch,
  type ResearchRun,
} from './completion.js';
import { orbToolGuard } from './guard.js';
import {
  RESEARCH_CONTEXT_TOKENS,
  ResearchReads,
  researchCheckpoint,
  researchCompactRange,
} from './context.js';
import {
  CHILD_PERSONAS,
  assignmentMessage,
  composeMessage,
  deckMessage,
  regenerateSlideMessage,
  newCanvasMessage,
  isCapabilityQuestion,
  ORB_CAPABILITIES_CONTEXT,
  regenerateMessage,
} from './persona.js';

export const name = 'orb-agents';
export const inject = [
  'agents',
  'agentPresets',
  'agentDefaultModel',
  'orbCanvas',
  'subagents',
  'orbModels',
  'tokenMeter',
  'compaction',
  'llm',
];
/** The `ctx.subagents` provider that establishes in-process continuable children (dsh-base row `subagent-spawn-in-process`). */
export const SUBAGENT_PROVIDER = 'spawn';
export const ORB_AGENTS_SERVICE = 'orbAgents';
/** Id of the agent preset row inserted by packages/orb-bundle/cordis.patch.yml. */
export const ORB_PRESET_ID = 'orb';

type AgentLike = {
  id: string;
  ctx: any;
  status: 'idle' | 'running';
  followup(message: unknown): unknown;
  steer(message: unknown): void;
  inject?(message: unknown): void;
  /** The agent's pending input (dsh-agent runtime-types.d.ts `Inbox`). */
  inbox?: {
    readonly nextTurn: readonly unknown[];
    readonly nextStep: readonly unknown[];
    splice(
      target: 'next-turn' | 'next-step',
      start: number,
      deleteCount: number,
      inserted: unknown[],
    ): unknown[];
  };
  cancel(cause: { kind: string }, options?: { keepInbox?: boolean }): void;
  whenIdle(): Promise<void>;
  session?: { header?: { cwd?: string } };
};

/** The slice of a dsh tool exec context the team tools read: the calling live agent and the call's signal. */
export type TeamToolExec = { callId?: string; signal: AbortSignal; agent?: AgentLike };

/** The slice of `ctx.subagents` (dsh-subagent `SubagentRuntime`) Orb uses. */
type SubagentsLike = {
  startContinuable(spec: {
    provider: string;
    label: string;
    childId?: string;
    request: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<{ childId: string; messageId: string }>;
  sendMessage(
    sender: unknown,
    targetId: string,
    content: unknown[],
    options: { signal: AbortSignal },
  ): Promise<string>;
  interrupt(targetId: string, authority: { kind: 'ancestor'; agent: unknown }): void;
};

const ChildRole = z.enum(CHILD_AGENTS);
const FrameRef = z.string().startsWith('f_').max(64);
/** `delegate` (Orb): the role, its frames and a one-line instruction. */
export const DelegateArgs = z.strictObject({
  role: ChildRole,
  frameIds: z.array(FrameRef).min(1).max(12),
  instruction: z.string().trim().min(1).max(2000),
});
/** `message_agent` (Orb): redirect one child. */
export const MessageAgentArgs = z.strictObject({
  agent: ChildRole,
  message: z.string().trim().min(1).max(4000),
});
/** `stop_agent` (Orb): interrupt one child. */
export const StopAgentArgs = z.strictObject({ agent: ChildRole });
/** `report_progress` (children): a short status and the frame being worked on. */
export const ReportProgressArgs = z.strictObject({
  status: z.string().trim().min(1).max(80),
  frameId: FrameRef.nullable().optional(),
});
/** `send_message` (children): a message to Orb, only when done or when a decision is needed. */
export const SendMessageArgs = z.strictObject({
  about: z.enum(['done', 'decision']),
  message: z.string().trim().min(1).max(4000),
});

/** `delegate`'s result: `queued` when the child is paused (it gets the assignment on Resume, P3.7). */
export type DelegateResult = {
  agent: ChildAgentName;
  agentId: string;
  started: boolean;
  queued?: true;
  frames: string[];
  working?: true;
  message?: string;
};

/** Turns zod issues into the one-line tool error the model sees. */
function parseArgs<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new CanvasError(
    'orb/invalid-args',
    `invalid ${issue?.path.join('.') || 'arguments'}: ${issue?.message ?? 'bad value'}`,
  );
}

const textBlock = (text: string) => ({ type: 'text', text });
/** The text blocks of a message's content (a held message re-sent to a child). */
const contentBlocks = (content: unknown): Array<{ type: 'text'; text: string }> =>
  Array.isArray(content)
    ? content.flatMap((p) =>
        p?.type === 'text' && typeof p.text === 'string' ? [textBlock(p.text) as any] : [],
      )
    : [];

/**
 * A `ctx.subagents.sendMessage` failure meaning the child id can never be continued: its session is missing or has
 * no continuation state (`NOT_RESUMABLE`, dsh-subagent/lib/index.js:1911, :1917), or it belongs to another parent
 * session (`UNAUTHORIZED` from `authorizeLineage`, :958).
 */
function isStaleChildError(err: unknown): boolean {
  const e = err as { name?: string; code?: string; message?: string } | null;
  if (!e || e.name !== 'SubagentError') return false;
  return (
    e.code === 'NOT_RESUMABLE' ||
    (e.code === 'UNAUTHORIZED' && /belongs to another parent session/.test(e.message ?? ''))
  );
}
/** The `<thread of="…">` id in the context part of a user message (orb-canvas context.ts), if any. */
export function threadIdOf(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const texts = content.filter((p) => p?.type === 'text' && typeof p.text === 'string');
  // The context is the LAST text part (after the user's own text), so text the user typed never counts.
  if (texts.length < 2) return undefined;
  const match = /^<thread of="([cf]_[A-Za-z0-9_-]{1,62})">\n/.exec(texts.at(-1).text);
  return match?.[1];
}

/** The visible text of a message's content blocks. */
function textOfContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')
    .trim();
}

/** Wait for `agent` to be idle, at most `ms`; true when it was. */
async function idleWithin(agent: AgentLike, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    agent.whenIdle().then(
      () => true,
      () => true,
    ),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), ms);
    }),
  ]);
  clearTimeout(timer);
  return result;
}

/**
 * P3.7: what a paused agent is holding. `stashed`: messages a step claimed while the agent was paused (the step was
 * rejected); `followup` / `steer`: messages addressed to a paused Orb (chat, redirect, a child's send_message);
 * `text`: an assignment or message for a paused child.
 */
type HeldItem = { kind: 'stashed' | 'followup' | 'steer'; message: unknown } | { kind: 'text'; text: string };

type UserMessageLike = {
  id?: string;
  content?: unknown;
  source?: { kind?: string; senderSessionId?: string };
};

/** The `agent/pre-step` payload Orb reads (dsh-agent runtime-types.d.ts `agent/pre-step`). */
export type PreStepPayload = { agent: { id: string }; messages: unknown[]; turn?: number; step: number };
export type PreStepDecision =
  { kind: 'reject' } | { kind: 'enter'; messages: unknown[]; [k: string]: unknown };

/** The result of one control action. */
type ControlResult<A extends AgentControlResult['action']> = Extract<AgentControlResult, { action: A }>;

const pauseKey = (canvasId: string, agent: AgentName) => `${canvasId}:${agent}`;

/** What a pause holds; a push tells the book it changed (so the new queue is persisted). */
class HeldList extends Array<HeldItem> {
  static override get [Symbol.species](): ArrayConstructor {
    return Array;
  }
  onChange: () => void = () => undefined;
  override push(...items: HeldItem[]): number {
    const n = super.push(...items);
    this.onChange();
    return n;
  }
}

/**
 * P6.9: the paused agents (`canvasId:agent` → what they hold), with the same Map surface the service always used.
 * Every change calls `persist(canvasId)`; the service writes the canvas's whole pause state (`pause.json`) so a Pause,
 * and the messages queued behind it, survive quitting and reopening the app.
 */
class PauseBook {
  private readonly map = new Map<string, { held: HeldList }>();
  constructor(private readonly persist: (canvasId: string) => void) {}
  has(key: string): boolean {
    return this.map.has(key);
  }
  get(key: string): { held: HeldItem[] } | undefined {
    return this.map.get(key);
  }
  set(key: string, value: { held: HeldItem[] }): this {
    const held = new HeldList();
    for (const item of value.held) Array.prototype.push.call(held, item);
    held.onChange = () => this.persist(canvasOf(key));
    this.map.set(key, { held });
    this.persist(canvasOf(key));
    return this;
  }
  delete(key: string): boolean {
    const had = this.map.delete(key);
    if (had) this.persist(canvasOf(key));
    return had;
  }
  /** The paused agents of one canvas with what they hold, as persisted. */
  snapshot(canvasId: string): Record<string, { held: HeldItem[] }> {
    const out: Record<string, { held: HeldItem[] }> = {};
    for (const [key, v] of this.map) {
      if (canvasOf(key) === canvasId) out[key.slice(canvasId.length + 1)] = { held: [...v.held] };
    }
    return out;
  }
}
const canvasOf = (key: string): string => key.slice(0, key.lastIndexOf(':'));

type StatusListener = (status: AgentStatus) => void;
const isResearchStatus = (text: string): boolean =>
  /^(?:please\s+)?(?:(?:can|could) you (?:tell|show|give) me\s+)?(?:stat(?:us)?|progress|where (?:are we|we are)|how (?:far|(?:are )?we doing|is it going|much (?:is )?(?:done|complete|left))|what(?:'s| is| all is) (?:the )?(?:status|progress|open|done|left))\b/i.test(
    text.trim(),
  );
type ResearchRequest = {
  text: string;
  objective?: string;
  continuation?: boolean;
  intentText?: string;
  defaultDetailed?: boolean;
  scope?: string[];
  whole: boolean;
  control: boolean;
  setupOnly: boolean;
  existingFrames?: number;
};
const SavedResearch = z.object({
  v: z.literal(1),
  status: z.enum(['working', 'stopped', 'incomplete', 'complete']),
  request: z.object({
    text: z.string().max(100_000),
    objective: z.string().max(100_000).optional(),
    continuation: z.boolean().optional(),
    intentText: z.string().max(100_000).optional(),
    defaultDetailed: z.boolean().optional(),
    scope: z.array(z.string().startsWith('f_')).max(200).optional(),
    whole: z.boolean(),
    control: z.boolean(),
    setupOnly: z.boolean(),
    existingFrames: z.number().int().nonnegative().optional(),
  }),
});
type AgentHandle = { agent: AgentLike; dispose(): Promise<void> };

export type RootAgentInfo = { canvas: CanvasMeta; sessionId: string };
/** How `openRoot` made the root agent live. */
export type RootAgentOrigin = 'live' | 'resumed' | 'created';

export class OrbAgents {
  private readonly researchRuns = new Map<string, ResearchRun>();
  private readonly currentAssignments = new Map<
    string,
    Map<AgentName, { frameIds: string[]; instruction: string; baseInstruction: string }>
  >();
  private setCurrentAssignment(
    canvasId: string,
    role: AgentName,
    frameIds: string[],
    instruction: string,
    baseInstruction = instruction,
  ): () => void {
    let assignments = this.currentAssignments.get(canvasId);
    if (!assignments) this.currentAssignments.set(canvasId, (assignments = new Map()));
    const previous = assignments.get(role);
    const current = { frameIds: [...frameIds], instruction, baseInstruction };
    assignments.set(role, current);
    return () => {
      if (assignments.get(role) !== current) return;
      if (previous) assignments.set(role, previous);
      else assignments.delete(role);
    };
  }
  private preserveChildDirection(canvasId: string, role: AgentName, text: string): () => void {
    const current = this.currentAssignments.get(canvasId)?.get(role);
    return this.setCurrentAssignment(
      canvasId,
      role,
      current?.frameIds ?? [],
      current
        ? `${current.instruction.slice(0, 3500)}\nLatest direction: ${text.slice(-2500)}`
        : text.slice(-6000),
      current?.baseInstruction ?? text,
    );
  }
  private readonly researchReads = new Map<string, ResearchReads>();
  private readonly contextFailures = new Map<string, number>();
  private readonly researchRequests = new Map<string, ResearchRequest>();
  private readonly pendingResearch = new Map<string, ResearchRequest[]>();
  private readonly researchArmed = new Set<string>();
  private readonly coverage = new Map<string, ResearchCoverage>();
  private readonly coverageRefreshes = new Map<string, Promise<void>>();
  private readonly outputJobs = new Set<string>();
  private readonly cancelledOutputJobs = new Set<string>();
  private readonly researchWrites = new Map<string, { canvasId: string; role: AgentName; tool: string }>();
  private readonly childResearchActivity = new Map<string, number>();
  private readonly handles = new Map<string, AgentHandle>();
  /** In-flight resume per session, so concurrent sends share one resume. */
  private readonly resuming = new Map<string, Promise<AgentLike>>();

  /** Agent session id → its canvas and role, for routing harness `agent/status` events to `agents.status`. */
  private readonly canvasOfSession = new Map<string, { canvasId: string; agent: AgentName }>();
  /** Last published status per canvas, per agent. */
  private readonly lastStatus = new Map<string, Map<AgentName, AgentStatus>>();
  /** In-flight delegate per canvas + role, so one role never gets two children. */
  private readonly delegating = new Map<string, Promise<unknown>>();
  private readonly statusListeners = new Map<string, Set<StatusListener>>();
  /** In-flight stop per canvas: concurrent stop calls share one outcome. */
  private readonly stopping = new Map<string, Promise<ControlResult<'stop'>>>();
  /** P3.7: paused agents, by `canvasId:agent`, with what they were sent (or would have taken) while paused. */
  private readonly paused = new PauseBook((canvasId) => this.persistPause(canvasId));
  /** P6.9: canvases whose persisted pause state was read into `paused` already, and the writes in flight. */
  private readonly pauseRestored = new Set<string>();
  private readonly pauseWrites = new Map<string, Promise<void>>();
  private readonly pauseDirty = new Set<string>();
  /** P3.7: child sessions the user stopped or paused: their settlement notice must not wake Orb. */
  private readonly quiet = new Set<string>();
  /** P3.7: per root session, settlement notices kept out of Orb's turns; Orb gets them with the next user message. */
  private readonly deferred = new Map<string, unknown[]>();

  constructor(private readonly ctx: any) {
    const logger = typeof ctx.logger === 'function' ? ctx.logger('orb-agents') : undefined;
    this.log = (message) => logger?.info?.(message);
  }

  private readonly log: (message: string) => void;

  private get canvas(): CanvasStore {
    return this.ctx.orbCanvas as CanvasStore;
  }

  private get subagents(): SubagentsLike {
    const subagents = this.ctx.subagents as SubagentsLike | undefined;
    if (!subagents)
      throw new CanvasError('orb/unsupported', 'subagents are not available in this composition');
    return subagents;
  }

  /** Remember the sessions of a canvas (root and children) for status routing. */
  private noteSessions(meta: CanvasMeta): void {
    if (meta.rootSessionId) this.canvasOfSession.set(meta.rootSessionId, { canvasId: meta.id, agent: 'orb' });
    for (const [role, sessionId] of Object.entries(meta.childAgentIds ?? {})) {
      if (isChildAgent(role)) this.canvasOfSession.set(sessionId, { canvasId: meta.id, agent: role });
    }
  }

  /**
   * The model route of `role` (P3.3): orb.json `models[role]`, else the harness default (`agent-default-model`, which
   * the Orb profile sets to openai/gpt-6-luna), else `DEFAULT_AGENT_MODEL`. Read whenever the agent starts (create
   * or resume), so a change applies the next time that agent starts (PRD Models › per-agent picker).
   */
  async modelFor(role: AgentName): Promise<ModelRoute> {
    // P4.2: orb-models knows which providers have a key, so a role with no pick gets the tier default of a usable
    // provider when the harness default has no key (PRD Models › per-agent picker, "sensible defaults per tier").
    const models = this.ctx.orbModels as
      { routeFor(role: AgentName): Promise<{ provider: string; model: string }> } | undefined;
    if (models?.routeFor) {
      const route = await models.routeFor(role).catch(() => undefined);
      if (route) return { provider: route.provider, model: route.model };
    }
    const settings = await this.canvas.settings?.get?.().catch(() => undefined);
    const chosen = settings?.models?.[role];
    if (chosen) return { provider: chosen.provider, model: chosen.model };
    const sel = this.ctx.agentDefaultModel?.currentSelection?.() as
      { provider?: string; model?: string } | undefined;
    if (sel?.provider && sel.model) return { provider: sel.provider, model: sel.model };
    return { ...DEFAULT_AGENT_MODEL };
  }

  /** One route for prompt assembly, pre-step compaction and the following request, including cold children. */
  private readonly stepRoutes = new Map<string, ModelRoute>();
  private readonly failures = new Map<string, NonNullable<AgentStatus['failure']>>();

  async routeForSession(sessionId: string): Promise<ModelRoute | undefined> {
    const known = this.canvasOfSession.get(sessionId);
    return known ? (this.stepRoutes.get(sessionId) ?? this.modelFor(known.agent)) : undefined;
  }

  async onPromptAssembly(context: { agent?: { id: string } }, next: () => Promise<any>): Promise<any> {
    const known = context.agent && this.canvasOfSession.get(context.agent.id);
    if (!known) return next();
    const route = await this.modelFor(known.agent);
    const assembled = await next();
    this.stepRoutes.set(context.agent!.id, route);
    return { ...assembled, variables: { ...assembled.variables, ...route } };
  }

  /** Planning and critique use supported reasoning levels; adapters without effort metadata keep their defaults. */
  async onAgentRequest(
    payload: { agent: { id: string }; signal?: AbortSignal },
    next: () => Promise<any>,
  ): Promise<any> {
    let proposal = await next();
    const known = this.canvasOfSession.get(payload.agent.id);
    if (!known) return proposal;
    const route = await this.routeForSession(payload.agent.id);
    if (route && (proposal.provider !== route.provider || proposal.model !== route.model)) {
      const { reasoningEffort: _oldEffort, ...rest } = proposal;
      proposal = { ...rest, ...route };
    }
    if (proposal.reasoningEffort !== undefined) return proposal;
    const info = await this.ctx.llm
      ?.resolveModelInfo?.(proposal.provider, proposal.model, payload.signal)
      .catch(() => undefined);
    const wanted = known.agent === 'orb' || known.agent === 'critic' ? 'high' : 'medium';
    const effort = info?.reasoning?.efforts?.find((e: { id: string }) => e.id === wanted)?.id;
    return effort ? { ...proposal, reasoningEffort: effort } : proposal;
  }

  private researchFor(request: ResearchRequest): ResearchRun {
    const run = researchRun(request.intentText ?? request.objective ?? request.text, request.scope);
    run.request = request.objective ?? request.text;
    run.whole = request.whole;
    if (request.whole && request.defaultDetailed) run.detailed = true;
    if (request.whole) run.outputs = requestedResearchOutputs(request.intentText ?? request.text);
    if (
      request.whole &&
      (request.existingFrames ?? 0) >= 3 &&
      !/\b(?:add|create|new|expand)\b.{0,30}\b(?:frames?|sections?)\b/i.test(
        request.intentText ?? request.text,
      )
    )
      run.preserveFrames = request.existingFrames;
    return run;
  }

  private readonly savedResearch = new Map<string, z.infer<typeof SavedResearch>>();
  private readonly researchRestored = new Set<string>();
  private readonly researchSaves = new Map<string, Promise<void>>();
  private readonly researchReadStreaks = new Map<string, number>();
  private async restoreResearch(canvasId: string): Promise<void> {
    if (this.researchRestored.has(canvasId)) return;
    this.researchRestored.add(canvasId);
    const raw = await this.canvas.readResearchState?.(canvasId).catch(() => undefined);
    const parsed = SavedResearch.safeParse(raw);
    if (parsed.success) this.savedResearch.set(canvasId, parsed.data);
  }
  private saveResearch(
    canvasId: string,
    request: ResearchRequest,
    status: z.infer<typeof SavedResearch>['status'],
  ): Promise<void> {
    const saved = SavedResearch.parse({ v: 1, status, request });
    this.savedResearch.set(canvasId, saved);
    const pending = (this.researchSaves.get(canvasId) ?? Promise.resolve())
      .then(async () => {
        await this.canvas.writeResearchState?.(canvasId, saved);
      })
      .catch((error) => this.log(`research objective not saved: ${String(error)}`));
    this.researchSaves.set(canvasId, pending);
    return pending;
  }

  private researchToolGuard(exec: { name: string; agent?: { id: string } }): string | undefined {
    const known = exec.agent && this.canvasOfSession.get(exec.agent.id);
    if (!known || known.agent !== 'orb' || this.outputJobs.has(known.canvasId)) return;
    const run = this.researchRuns.get(known.canvasId);
    if (!run?.active) return;
    if (exec.name === 'add_frame' && run.preserveFrames)
      return `Finish the ${run.preserveFrames} existing frames. Rename/reorganize them with update_frame if needed; additional frames were not requested. Do not expand the board to avoid filling its existing sections.`;
    if (
      exec.name === 'add_link' &&
      run.linkCalls > 12 &&
      !/\b(?:link|connect|relationships?)\b/i.test(run.request)
    )
      return 'Enough relationship links have been drawn for this research pass. Card citations already preserve evidence. Fill missing datasets and detailed assessments now; do not spend the run adding one link per source.';
  }

  /** Composition for a root Orb agent: the `orb` preset plus the allow-list guard on the agent's own scope. */
  private setupFor(role: AgentName) {
    return async (agentCtx: any) => {
      await this.ctx.agentPresets.mount(agentCtx, ORB_PRESET_ID);
      // The preset's board tools are inherited by every agent on it; hide the ones outside this role's allow-list
      // (e.g. consolidate_cards from Orb) so the model is not offered them. `restrict` filters the inherited surface
      // (dsh-tools/lib/types/index.d.ts:637-644, :658-680). The guard still denies them as defence in depth.
      const hidden = hiddenPresetTools(role);
      if (hidden.length > 0) agentCtx.tools.restrict({ deny: hidden });
      agentCtx.tools.guard(
        (exec: { name: string; agent?: { id: string } }) =>
          orbToolGuard(role)(exec) ?? this.researchToolGuard(exec),
      );
    };
  }

  /** In-flight root creation per canvas, so concurrent callers share one root agent. */
  private readonly creating = new Map<string, Promise<RootAgentInfo>>();

  /** Create the canvas's root Orb agent (once) and store its session id in canvas.json. */
  createRoot(canvasId: string): Promise<RootAgentInfo> {
    let pending = this.creating.get(canvasId);
    if (!pending) {
      pending = this.createRootOnce(canvasId);
      this.creating.set(canvasId, pending);
      void pending.finally(() => this.creating.delete(canvasId)).catch(() => undefined);
    }
    return pending;
  }

  private async createRootOnce(canvasId: string): Promise<RootAgentInfo> {
    const meta = await this.canvas.open(canvasId);
    if (meta.rootSessionId) {
      await this.ensureLive(meta);
      return { canvas: meta, sessionId: meta.rootSessionId };
    }
    const sessionId = `orb-${randomUUID()}`;
    const handle = (await this.ctx.agents.create({
      sessionId,
      meta: { cwd: this.canvas.dirOf(canvasId), agentPreset: ORB_PRESET_ID },
      agentOptions: await this.modelFor('orb'),
      setup: this.setupFor('orb'),
    })) as AgentHandle;
    this.handles.set(sessionId, handle);
    this.canvasOfSession.set(sessionId, { canvasId, agent: 'orb' });
    try {
      const canvas = await this.canvas.setRootSession(canvasId, sessionId);
      return { canvas, sessionId };
    } catch (err) {
      this.handles.delete(sessionId);
      await handle.dispose().catch(() => undefined);
      throw err;
    }
  }

  /** The live root agent of a canvas, resumed from its persisted session when needed. */
  async rootAgent(canvasId: string): Promise<AgentLike> {
    const meta = await this.canvas.open(canvasId);
    if (meta.rootSessionId) {
      this.noteSessions(meta);
      await this.restorePause(meta);
    }
    if (!meta.rootSessionId) {
      const { canvas } = await this.createRoot(canvasId);
      return this.ensureLive(canvas);
    }
    return this.ensureLive(meta);
  }

  /**
   * Make the canvas's root agent live when the canvas is opened: reuse the live agent, else resume the persisted
   * root session (never a new session for a canvas that has one), else create the first root agent.
   */
  async openRoot(canvasId: string): Promise<RootAgentInfo & { origin: RootAgentOrigin }> {
    const meta = await this.canvas.open(canvasId);
    if (!meta.rootSessionId) return { ...(await this.createRoot(canvasId)), origin: 'created' };
    this.noteSessions(meta);
    await this.restorePause(meta);
    const wasLive = this.ctx.agents.get(meta.rootSessionId) !== undefined;
    await this.ensureLive(meta);
    return { canvas: meta, sessionId: meta.rootSessionId, origin: wasLive ? 'live' : 'resumed' };
  }

  private async ensureLive(meta: CanvasMeta): Promise<AgentLike> {
    const sessionId = meta.rootSessionId!;
    this.noteSessions(meta);
    const live = this.ctx.agents.get(sessionId) as AgentLike | undefined;
    if (live) return live;
    let pending = this.resuming.get(sessionId);
    if (!pending) {
      pending = (async () => {
        const handle = (await this.ctx.agents.resume({
          resumeSessionId: sessionId,
          agentOptions: await this.modelFor('orb'),
          setup: this.setupFor('orb'),
        })) as AgentHandle;
        this.handles.set(sessionId, handle);
        this.log(`resumed root session ${sessionId} of canvas ${meta.id}`);
        return handle.agent;
      })();
      this.resuming.set(sessionId, pending);
      void pending.finally(() => this.resuming.delete(sessionId)).catch(() => undefined);
    }
    return pending;
  }

  /**
   * Queue `text` as a user turn for the canvas's root agent (P3.3: with its context). The frames and cards in
   * `options.context` and the card or frame of `options.threadOf` are rendered by the canvas service as describe()
   * text (orb-canvas context.ts) and sent in the same user message, after the text, so the context reaches the turn
   * that answers it even when the message is queued behind a running turn.
   */
  async send(
    canvasId: string,
    text: string,
    options: {
      context?: ChatContext | undefined;
      threadOf?: string | undefined;
      researchAll?: boolean;
      intentText?: string;
    } = {},
  ): Promise<{ sessionId: string }> {
    if (!text.trim()) throw new CanvasError('orb/invalid-args', 'empty message');
    const context =
      options.context || options.threadOf ? await this.canvas.chatContext(canvasId, options) : undefined;
    const agent = await this.rootAgent(canvasId);
    const meta = await this.canvas.open(canvasId);
    const teamNow = CHILD_AGENTS.map((role) => {
      const id = meta.childAgentIds?.[role];
      return `${role}=${this.isPaused(canvasId, role) ? 'paused' : id ? (this.ctx.agents.get(id)?.status ?? 'idle') : 'idle'}`;
    }).join(',');
    const board =
      options.threadOf || options.context ? (await this.canvas.board(canvasId)).current : undefined;
    const initialBoard = board ?? (await this.canvas.board?.(canvasId))?.current;
    const scope = options.threadOf
      ? [board?.cards[options.threadOf]?.frameId ?? options.threadOf].filter(
          (id): id is string => !!id && !!board?.frames[id],
        )
      : options.context?.frameIds;
    const pending = this.pendingResearch.get(canvasId) ?? [];
    const request: ResearchRequest = {
      text,
      intentText: options.intentText ?? text,
      defaultDetailed:
        meta.depth !== 'quick' &&
        !/\b(?:only|just)\b.{0,30}\b(?:rows|data|sources|links)\b|\bno (?:synthesis|analysis)\b/i.test(
          options.intentText ?? text,
        ),
      ...(initialBoard ? { existingFrames: Object.keys(initialBoard.frames).length } : {}),
      ...(scope?.length ? { scope } : {}),
      whole:
        options.researchAll ??
        /(?:all|every|whole|full|entire).{0,30}(?:board|canvas|frame|section)|end.to.end|\b(?:finish|complete|resume|continue)\b.*\b(?:board|canvas|research|plan)\b/i.test(
          options.intentText ?? text,
        ),
      setupOnly:
        /\b(?:just|only) (?:the )?(?:frames|structure|outline)\b|\b(?:do not|don't|no) research\b/i.test(
          options.intentText ?? text,
        ),
      control:
        /^(?:stop|pause|cancel|move|tell|message|redirect)\b/i.test((options.intentText ?? text).trim()) &&
        /\b(?:scout|critic|builder|agents?)\b/i.test(options.intentText ?? text),
    };
    await this.restoreResearch(canvasId);
    const saved = this.savedResearch.get(canvasId);
    const intent = options.intentText ?? text;
    const explicitResume = /^(?:please\s+)?(?:resume|continue|keep going|finish|complete)\b/i.test(
      intent.trim(),
    );
    const statusQuestion = isResearchStatus(intent);
    const scopeReplacement =
      /\b(?:only|just)\b.{0,30}\b(?:this|these|selected)\b.{0,20}\b(?:cards?|frames?|sections?|paragraphs?)\b/i.test(
        intent,
      );
    const replacement =
      scopeReplacement ||
      /\b(?:forget (?:that|the previous)|start over|new task)\b|^(?:(?:now|instead)[,\s]+)?(?:research|investigate|plan|compare)\b/i.test(
        intent.trim(),
      );
    if (
      !saved &&
      explicitResume &&
      !scopeReplacement &&
      initialBoard &&
      Object.keys(initialBoard.frames).length
    ) {
      // Upgrade existing canvases whose conversations predate research.json. Read only the public session surface;
      // the latest substantive user task takes precedence over earlier unrelated research.
      const session = (agent as any).session;
      const prior = (session?.surface?.nodes ?? [])
        .map((seq: any) => session.eventAt(seq))
        .reverse()
        .find((event: any) => {
          const message = event?.data?.message ?? event?.data;
          const body = textOfContent(
            Array.isArray(message?.content) ? message.content.slice(0, 1) : message?.content,
          );
          return (
            event?.type === 'user/message' &&
            message?.source?.kind === 'user' &&
            body.trim().length > 12 &&
            !isResearchStatus(body) &&
            !/^(?:please\s+)?(?:continue|resume|keep going)\b/i.test(body.trim())
          );
        });
      const message = prior?.data?.message ?? prior?.data;
      const objective = textOfContent(
        Array.isArray(message?.content) ? message.content.slice(0, 1) : message?.content,
      );
      const userIntent = objective.startsWith("New canvas. The user's question: ")
        ? objective.split('\n')[0]!.replace("New canvas. The user's question: ", '')
        : objective;
      if (
        /\bresearch\b|\b(?:whole|entire|all|full)\b.{0,30}\b(?:board|canvas|frames?|sections?)\b|\bplan\b.{0,30}\btrip\b/i.test(
          userIntent,
        )
      ) {
        request.whole = true;
        request.scope = undefined;
        request.objective = `Resume the saved task; reuse evidence and apply the latest conversation corrections.\n${objective.slice(0, 60_000)}\nCurrent request: ${text.slice(-30_000)}`;
        request.intentText = `${userIntent.slice(0, 60_000)}\n${intent.slice(-30_000)}`;
      }
    }
    if (
      saved &&
      saved.status !== 'complete' &&
      (saved.status === 'working' || explicitResume) &&
      !request.control &&
      !request.setupOnly &&
      (!request.scope?.length ||
        statusQuestion ||
        (saved.request.whole && (saved.status === 'working' || explicitResume))) &&
      !replacement
    ) {
      request.continuation = true;
      request.objective = `${(saved.request.objective ?? saved.request.text).slice(0, 60_000)}\nFollow-up: ${text.slice(-30_000)}`;
      request.intentText = `${(saved.request.intentText ?? saved.request.text).slice(0, 60_000)}\n${intent.slice(-30_000)}`;
      request.whole = saved.request.whole;
      request.scope = saved.request.scope;
      request.defaultDetailed ||= saved.request.defaultDetailed;
    }
    pending.push(request);
    this.pendingResearch.set(canvasId, pending);
    // Status must not overwrite a stopped objective or create a dummy "complete" task on a legacy canvas.
    // The latter would hide its older conversation objective from a subsequent cold continuation.
    if (!statusQuestion || request.continuation)
      await this.saveResearch(
        canvasId,
        request,
        request.whole && !request.setupOnly && !request.control ? 'working' : 'complete',
      );
    // P3.6: a thread message is stored in board.jsonl (the thread's history; Orb's reply follows at turn end).
    if (options.threadOf)
      await this.canvas.appendThreadMessage(canvasId, options.threadOf, text, { kind: 'user' });
    const content = [
      { type: 'text', text },
      textBlock(
        `Research date: ${new Date().toISOString().slice(0, 10)} (UTC). Scout owns web_search/fetch_url. Team: ${teamNow}. Verify dates/prices.\nBoard:${initialBoard ? ` ${Object.keys(initialBoard.frames).length} frames, ${Object.values(initialBoard.cards).filter((card) => !card.stackedInto).length} cards.` : ''} Search/read even without pinned context.`,
      ),
      ...(isCapabilityQuestion(text) || isCapabilityQuestion(meta.title)
        ? [textBlock(ORB_CAPABILITIES_CONTEXT)]
        : []),
      ...(specOf(meta.template)?.rubric.length
        ? [textBlock(scoringGuide(specOf(meta.template)!, true))]
        : []),
      ...(context ? [{ type: 'text', text: context }] : []),
    ];
    const message = createUserMessage({ content, source: { kind: 'user' } } as any);
    // P3.7: a paused Orb holds the message until Resume.
    const pause = this.paused.get(pauseKey(canvasId, 'orb'));
    if (pause) {
      pause.held.push({ kind: 'followup', message });
      return { sessionId: agent.id };
    }
    this.flushDeferred(agent);
    // A card clarification should reach the next safe step, not wait behind a long research turn.
    if (options.threadOf && agent.status === 'running') agent.steer(message);
    else agent.followup(message);
    return { sessionId: agent.id };
  }

  /**
   * The new-canvas turn (P3.3, PRD Agents › New canvas): the user's question with what the board already holds
   * (template frames, the seed), asking Orb to propose 3–5 frames with add_frame and start Scout and Critic unless
   * the user said otherwise (a seeded canvas asks what the user wants to understand first). `orb/canvas.create`
   * sends it when the request has `start: true`.
   */
  async startCanvas(canvasId: string, prompt: string): Promise<{ sessionId: string }> {
    const meta = await this.canvas.open(canvasId);
    const frames = boardFrames((await this.canvas.board(canvasId)).current).map((f) => ({
      id: f.id,
      title: f.title,
    }));
    return this.send(canvasId, newCanvasMessage(meta, prompt, frames), {
      researchAll: !meta.seed && (!!meta.template || !isCapabilityQuestion(prompt)),
      intentText: prompt,
    });
  }

  // ---- Port: the research document (P4.5) ----

  /**
   * One compose job (`port.compose`, `port.regenerateSection`): open it on the canvas service (scope, saved
   * instructions, the cards text), queue Orb's compose turn, and report every section Orb writes with
   * `compose_section` until Orb is idle again. The job runs to its end even when the caller goes away; `onEvent`
   * just stops being called. A paused Orb is refused (its turn would only wait for Resume).
   */
  private async runPortJob(
    canvasId: string,
    request:
      | { kind: 'compose'; scope: PrintScope; instructions: string; format: PortFormat }
      | { kind: 'section'; sectionId: string },
    onEvent: (event: PortProgress) => void,
  ): Promise<{ composed: string[]; doc: PortDoc | null }> {
    if (this.isPaused(canvasId, 'orb'))
      throw new CanvasError('orb/busy', 'orb is paused: resume it before composing the research document');
    const agent = await this.rootAgent(canvasId);
    const begun = await this.canvas.port.begin(canvasId, request);
    const { job } = begun;
    const off = this.canvas.port.onEvent(canvasId, (event) => onEvent(event));
    this.outputJobs.add(canvasId);
    this.cancelledOutputJobs.delete(canvasId);
    try {
      const state = (await this.canvas.board(canvasId)).current;
      const all = boardFrames(state).map((f, i) => ({ id: f.id, title: f.title, number: i + 1 }));
      const scopeFrames =
        job.scope === 'all' ? all : all.filter((f) => (job.scope as string[]).includes(f.id));
      const scope = job.scope === 'all' ? ('all' as const) : scopeFrames;
      let text: string;
      if (request.kind === 'compose') {
        text = composeMessage({
          instructions: job.instructions,
          frames: scopeFrames,
          scope,
          cards: begun.cards,
          context: begun.context,
          format: job.format ?? 'custom',
          ...(job.plan ? { plan: job.plan } : {}),
        });
      } else {
        const section = begun.doc!.sections.find((s) => s.id === request.sectionId)!;
        text = regenerateMessage({
          section,
          instructions: job.instructions,
          scope,
          cards: begun.cards,
          context: begun.context,
          ...(job.format ? { format: job.format } : {}),
          ...(job.plan ? { plan: job.plan.find((p) => p.id === request.sectionId) } : {}),
        });
      }
      onEvent({
        type: 'started',
        cards: begun.cards,
        frames: begun.frames,
        standard: request.kind === 'compose' && job.format === 'report',
      });
      this.flushDeferred(agent);
      agent.followup(createUserMessage({ content: [textBlock(text)], source: { kind: 'user' } } as any));
      this.log(`port: ${job.kind} job on canvas ${canvasId} queued`);
      // followup on an idle agent starts its driver at once; whenIdle() waits for that turn (and any queued one).
      let doc: PortDoc | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        await agent.whenIdle().catch(() => undefined);
        doc = (await this.canvas.port.get(canvasId)).doc;
        if (
          this.cancelledOutputJobs.has(canvasId) ||
          this.stopping.has(canvasId) ||
          this.isPaused(canvasId, 'orb')
        )
          throw new CanvasError(
            'orb/compose-failed',
            'Report composition was stopped or paused. Saved sections are retained.',
            {},
          );
        if (!job.plan) break;
        const required =
          request.kind === 'section' ? job.plan.filter((p) => p.id === request.sectionId) : job.plan;
        const problems = doc
          ? reportProblems(doc, required, (await this.canvas.board(canvasId)).current)
          : required.map((p) => `Missing section "${p.id}" (${p.heading}).`);
        if (!job.composed.length)
          problems.unshift(
            'This request has not saved any new section. Compose the requested report or regenerate the requested section; the previously saved document does not satisfy a new writing request.',
          );
        if (!problems.length) break;
        if (attempt === 2)
          throw new CanvasError(
            'orb/compose-failed',
            `The report is still a draft. ${problems.slice(0, 3).join(' ')}`.slice(0, 500),
            {},
          );
        agent.followup(
          createUserMessage({
            content: [
              textBlock(
                [
                  'Finish the research report already being composed. The saved document is incomplete; do not end with a completion claim.',
                  ...problems.slice(0, 16),
                  'Inspect full supporting cards with read_card, then use compose_section to fill or repair these sections. Keep completed sections; do not repeat them or restart research. Cite only supported evidence and precise limitations. The required plan remains:',
                  ...required.map((p) => `${p.id}: ${p.heading}. ${p.guidance}`),
                ].join('\n'),
              ),
            ],
            source: { kind: 'orb-output-review', form: 'notice', summary: 'Complete the research report.' },
          } as any),
        );
      }
      this.log(`port: ${job.kind} job on canvas ${canvasId} wrote ${job.composed.length} section(s)`);
      return { composed: [...new Set(job.composed)], doc };
    } finally {
      this.outputJobs.delete(canvasId);
      this.cancelledOutputJobs.delete(canvasId);
      off();
      this.canvas.port.end(canvasId, job);
    }
  }

  /**
   * `port.compose` (BUILD_PLAN P4.5): warn about unread Must read cards in scope (unless the user chose Continue
   * anyway), then Orb plans the sections (the instructions, or the standard format) and calls compose_section once
   * per section. Yields `unread` | `started`, each `section` / `rejected`, then `done` or `failed`.
   */
  async *compose(canvasId: string, args: PortComposeArgs, signal: AbortSignal): AsyncGenerator<PortProgress> {
    const state = (await this.canvas.board(canvasId)).current;
    if (!args.continueUnread) {
      const unread = unreadMustRead(state, args.scope);
      if (unread.length > 0) {
        yield { type: 'unread', cards: unread.slice(0, 500) };
        return;
      }
    }
    const queue: PortProgress[] = [];
    let wake: (() => void) | undefined;
    let started = false;
    let finished = false;
    const push = (event: PortProgress) => {
      queue.push(event);
      wake?.();
    };
    const run = this.runPortJob(
      canvasId,
      { kind: 'compose', scope: args.scope, instructions: args.instructions, format: args.format },
      push,
    ).then(
      ({ composed, doc }) =>
        push(
          composed.length > 0 && doc
            ? { type: 'done', sections: composed.length, version: doc.version }
            : { type: 'failed', message: 'orb did not write any section. Check the conversation for why.' },
        ),
      (err: unknown) => {
        // Refusals before the turn starts (busy, no cards, unknown frame) are the caller's errors.
        if (!started && !queue.some((e) => e.type === 'started')) throw err;
        push({ type: 'failed', message: String((err as Error)?.message ?? err).slice(0, 500) });
      },
    );
    const done = run.then(
      () => {
        finished = true;
        wake?.();
      },
      (err: unknown) => {
        finished = true;
        wake?.();
        throw err;
      },
    );
    done.catch(() => undefined);
    const stop = () => wake?.();
    signal.addEventListener('abort', stop, { once: true });
    try {
      for (;;) {
        while (queue.length > 0) {
          const event = queue.shift()!;
          if (event.type === 'started') started = true;
          yield event;
          if (event.type === 'done' || event.type === 'failed') return;
        }
        if (signal.aborted) return;
        if (finished) {
          await done;
          if (queue.length === 0) return;
          continue;
        }
        await new Promise<void>((resolve) => (wake = resolve));
        wake = undefined;
      }
    } finally {
      signal.removeEventListener('abort', stop);
    }
  }

  /** `port.regenerateSection`: Orb rewrites one section with the saved instructions; answers the new document. */
  async regenerateSection(canvasId: string, sectionId: string): Promise<PortDoc> {
    const { composed, doc } = await this.runPortJob(
      canvasId,
      { kind: 'section', sectionId },
      () => undefined,
    );
    if (!composed.includes(sectionId) || !doc)
      throw new CanvasError(
        'orb/compose-failed',
        'orb did not rewrite the section. Check the conversation for why.',
        {
          sectionId,
        },
      );
    return doc;
  }

  // ---- Deck: the slides (P6.17) ----

  /**
   * One deck job (`deck.compose`, `deck.regenerateSlide`): open it on the canvas service (scope, format, saved
   * instructions, the cards text), queue Orb's turn, and report every slide Orb writes with `compose_slides` until Orb is
   * idle again. Like the research document's job it runs to its end even when the caller goes away.
   */
  private async runDeckJob(
    canvasId: string,
    request:
      | { kind: 'compose'; scope: PrintScope; format?: string | undefined; instructions: string }
      | { kind: 'slide'; slideId: string; change: string },
    onEvent: (event: DeckProgress) => void,
  ): Promise<{ composed: string[]; deck: Deck | null }> {
    if (this.isPaused(canvasId, 'orb'))
      throw new CanvasError('orb/busy', 'orb is paused: resume it before composing the slides');
    const agent = await this.rootAgent(canvasId);
    const begun = await this.canvas.deck.begin(canvasId, request);
    const { job } = begun;
    const off = this.canvas.deck.onEvent(canvasId, (event) => onEvent(event));
    this.outputJobs.add(canvasId);
    try {
      const state = (await this.canvas.board(canvasId)).current;
      const all = boardFrames(state).map((f, i) => ({ id: f.id, title: f.title, number: i + 1 }));
      const scopeFrames =
        job.scope === 'all' ? all : all.filter((f) => (job.scope as string[]).includes(f.id));
      const scope = job.scope === 'all' ? ('all' as const) : scopeFrames;
      const format = deckFormatById(job.format) ?? STANDARD_DECK_FORMAT;
      let text: string;
      if (request.kind === 'compose') {
        text = deckMessage({
          instructions: job.instructions,
          format,
          frames: scopeFrames,
          scope,
          cards: begun.cards,
          context: begun.context,
        });
      } else {
        const deck = begun.deck!;
        const slide = deck.slides.find((x) => x.id === request.slideId)!;
        text = regenerateSlideMessage({
          slide,
          change: job.change ?? '',
          instructions: job.instructions,
          scope,
          cards: begun.cards,
          context: begun.context,
          outline: deck.slides.map((x, i) => `  ${i + 1}. ${x.id} (${x.layout}): ${x.title}`),
        });
      }
      onEvent({ type: 'started', cards: begun.cards, format: format.id });
      this.flushDeferred(agent);
      agent.followup(createUserMessage({ content: [textBlock(text)], source: { kind: 'user' } } as any));
      this.log(`deck: ${job.kind} job on canvas ${canvasId} queued`);
      await agent.whenIdle().catch(() => undefined);
      const { deck } = await this.canvas.deck.get(canvasId);
      this.log(`deck: ${job.kind} job on canvas ${canvasId} wrote ${job.composed.length} slide(s)`);
      return { composed: [...job.composed], deck };
    } finally {
      this.outputJobs.delete(canvasId);
      off();
      this.canvas.deck.end(canvasId, job);
    }
  }

  /**
   * `deck.compose` (P6.17): warn about unread Must read cards in scope (unless the user chose Continue anyway), then Orb
   * writes the slides of the format (or of the user's instructions) with compose_slides. Yields `unread` | `started`,
   * each `slide` / `rejected`, then `done` or `failed`.
   */
  async *composeDeck(
    canvasId: string,
    args: DeckComposeArgs,
    signal: AbortSignal,
  ): AsyncGenerator<DeckProgress> {
    const state = (await this.canvas.board(canvasId)).current;
    if (!args.continueUnread) {
      const unread = unreadMustRead(state, args.scope);
      if (unread.length > 0) {
        yield { type: 'unread', cards: unread.slice(0, 500) };
        return;
      }
    }
    const queue: DeckProgress[] = [];
    let wake: (() => void) | undefined;
    let started = false;
    let finished = false;
    const push = (event: DeckProgress) => {
      queue.push(event);
      wake?.();
    };
    const run = this.runDeckJob(
      canvasId,
      { kind: 'compose', scope: args.scope, format: args.format, instructions: args.instructions },
      push,
    ).then(
      ({ composed, deck }) =>
        push(
          composed.length > 0 && deck
            ? { type: 'done', slides: deck.slides.length, version: deck.version }
            : { type: 'failed', message: 'orb did not write any slide. Check the conversation for why.' },
        ),
      (err: unknown) => {
        if (!started && !queue.some((e) => e.type === 'started')) throw err;
        push({ type: 'failed', message: String((err as Error)?.message ?? err).slice(0, 500) });
      },
    );
    const done = run.then(
      () => {
        finished = true;
        wake?.();
      },
      (err: unknown) => {
        finished = true;
        wake?.();
        throw err;
      },
    );
    done.catch(() => undefined);
    const stop = () => wake?.();
    signal.addEventListener('abort', stop, { once: true });
    try {
      for (;;) {
        while (queue.length > 0) {
          const event = queue.shift()!;
          if (event.type === 'started') started = true;
          yield event;
          if (event.type === 'done' || event.type === 'failed') return;
        }
        if (signal.aborted) return;
        if (finished) {
          await done;
          if (queue.length === 0) return;
          continue;
        }
        await new Promise<void>((resolve) => (wake = resolve));
        wake = undefined;
      }
    } finally {
      signal.removeEventListener('abort', stop);
    }
  }

  /** `deck.regenerateSlide`: Orb rewrites one slide (with the user's change, if any); answers the new deck. */
  async regenerateSlide(canvasId: string, slideId: string, change: string): Promise<Deck> {
    const { composed, deck } = await this.runDeckJob(
      canvasId,
      { kind: 'slide', slideId, change },
      () => undefined,
    );
    if (!composed.includes(slideId) || !deck)
      throw new CanvasError(
        'orb/compose-failed',
        'orb did not rewrite the slide. Check the conversation for why.',
        {
          slideId,
        },
      );
    return deck;
  }

  /**
   * Stop every agent of the canvas (BUILD_PLAN P3.7 Stop all): every live descendant is cancelled with
   * `{kind:'parent'}` (its queue cleared), all at once, then the root agent with `{kind:'user'}` (its queue cleared
   * too); then `whenIdle()` of all of them is raced with STOP_TIMEOUT_MS. Pauses and everything they held are
   * dropped. Publishes `stopping` for every agent immediately and `stopped` / `stop-timeout` (with `stopMs`) when
   * the race settles. The children's settlement notices do not wake Orb afterwards (`quiet`).
   */
  stop(canvasId: string): Promise<ControlResult<'stop'>> {
    let pending = this.stopping.get(canvasId);
    if (!pending) {
      pending = this.stopOnce(canvasId);
      this.stopping.set(canvasId, pending);
      void pending.finally(() => this.stopping.delete(canvasId)).catch(() => undefined);
    }
    return pending;
  }

  private async stopOnce(canvasId: string): Promise<ControlResult<'stop'>> {
    if (this.outputJobs.has(canvasId) && this.canvas.port.job(canvasId))
      this.cancelledOutputJobs.add(canvasId);
    this.pendingResearch.delete(canvasId);
    const research = this.researchRuns.get(canvasId);
    if (research) research.active = false;
    const startedAt = performance.now();
    const meta = await this.canvas.open(canvasId);
    await this.restoreResearch(canvasId);
    const saved = this.researchRequests.get(canvasId) ?? this.savedResearch.get(canvasId)?.request;
    if (saved) void this.saveResearch(canvasId, saved, 'stopped');
    const sessionId = meta.rootSessionId ?? undefined;
    this.noteSessions(meta);
    await this.restorePause(meta);
    const root = sessionId ? (this.ctx.agents.get(sessionId) as AgentLike | undefined) : undefined;
    const children = root ? this.descendantsOf(root) : [];
    // Settlement notices of these children must not start a new Orb turn once they settle.
    for (const id of Object.values(meta.childAgentIds ?? {})) if (id) this.quiet.add(id);
    for (const child of children) this.quiet.add(child.id);
    for (const agent of ['orb', ...CHILD_AGENTS] as const) this.paused.delete(pauseKey(canvasId, agent));

    // Children first, all at once, then the root (a child's notice then finds Orb already cancelled).
    for (const child of children) child.cancel({ kind: 'parent' });
    root?.cancel({ kind: 'user' });
    this.publish(canvasId, { agent: 'orb', state: 'stopping', ...(sessionId ? { sessionId } : {}) });
    const known = children.flatMap((child) => {
      const k = this.canvasOfSession.get(child.id);
      return k && k.canvasId === canvasId && k.agent !== 'orb' ? [{ child, agent: k.agent }] : [];
    });
    for (const { child, agent } of known)
      this.publish(canvasId, {
        ...this.last(canvasId, agent),
        agent,
        state: 'stopping',
        sessionId: child.id,
      });

    const targets = root ? [root, ...children] : [];
    // A whenIdle() that rejects (agent disposed mid-stop) also means "no longer running".
    const idle = Promise.all(targets.map((a) => a.whenIdle().catch(() => undefined)));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const state = await Promise.race([
      idle.then(() => 'stopped' as const),
      new Promise<'stop-timeout'>((resolve) => {
        timer = setTimeout(() => resolve('stop-timeout'), STOP_TIMEOUT_MS);
      }),
    ]);
    clearTimeout(timer);
    const stopMs = Math.round((performance.now() - startedAt) * 10) / 10;
    this.log(`stop canvas ${canvasId}: ${state} in ${stopMs} ms (${targets.length} agent(s))`);
    // The canvas's children (P3.4) that were cancelled read `stopped` too (their cursor stays where it was).
    for (const { child, agent } of known)
      this.publish(canvasId, {
        ...this.last(canvasId, agent),
        agent,
        state: 'stopped',
        stopMs,
        sessionId: child.id,
      });
    this.publish(canvasId, { agent: 'orb', state, stopMs, ...(sessionId ? { sessionId } : {}) });
    if (state === 'stop-timeout' && root) {
      // Report the late idle once the agents do settle (unless a new turn already started).
      void idle.then(() => {
        if (this.last(canvasId, 'orb')?.state === 'stop-timeout')
          this.publish(canvasId, { agent: 'orb', state: root.status, sessionId: root.id });
      });
    }
    return { action: 'stop', state, stopMs, agents: targets.length };
  }

  /** Live agents created (transitively) through `root`'s scoped context: its subagents. */
  private descendantsOf(root: AgentLike): AgentLike[] {
    const registry = this.ctx.agents;
    if (typeof registry.list !== 'function' || typeof registry.isOwnedBy !== 'function') return [];
    const all = registry.list() as AgentLike[];
    const out: AgentLike[] = [];
    const queue = [root];
    while (queue.length) {
      const parent = queue.shift()!;
      for (const agent of all) {
        if (agent !== root && !out.includes(agent) && registry.isOwnedBy(agent.id, parent)) {
          out.push(agent);
          queue.push(agent);
        }
      }
    }
    return out;
  }

  /** Per root session: the thread its current turn answers and the reply text so far (P3.6). */
  private readonly threadTurns = new Map<
    string,
    { thread?: string; texts: string[]; model?: string; provider?: string }
  >();

  /** A direct thread answer ends before automatic whole-board repair continues in the same harness turn. */
  private async finishThreadReply(canvasId: string, sessionId: string): Promise<void> {
    const turn = this.threadTurns.get(sessionId);
    if (!turn?.thread) return;
    const thread = turn.thread;
    const reply = turn.texts.join('\n\n').trim();
    delete turn.thread;
    turn.texts = [];
    this.canvas.setActiveThread(sessionId, undefined);
    if (!reply) return;
    await this.canvas.appendThreadMessage(canvasId, thread, reply, {
      kind: 'agent',
      agent: 'orb',
      model: turn.model ?? 'unknown',
      ...(turn.provider ? { provider: turn.provider } : {}),
      sessionId,
    });
  }

  /**
   * Harness `session/event` of any session (P3.6 threads). For a canvas's root Orb session: a turn that takes a user
   * message carrying a `<thread of="…">` block answers that thread. While it runs, `place_card` puts Orb's cards next
   * to the thread's card (`orbCanvas.setActiveThread`). The answer's first stop boundary stores its reply and clears
   * placement context before automatic research continues; `turn/end` also handles cancellation/fallback.
   */
  onSessionEvent(sessionId: string, event: { type: string; data: any }): void {
    const known = this.canvasOfSession.get(sessionId);
    if (known && event.type === 'turn/start') this.failures.delete(sessionId);
    if (known && event.type === 'turn/end' && event.data?.reason?.kind === 'error') {
      const error = event.data.reason.error ?? {};
      const failure = {
        ...this.stepRoutes.get(sessionId),
        code: scrubSecrets(String(error.code ?? 'UNKNOWN'))
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 80),
        message: scrubSecrets(String(error.message ?? 'The agent stopped before finishing.')).replace(
          /\s+/g,
          ' ',
        ),
        ...(typeof error.status === 'number' ? { status: error.status } : {}),
        ...(typeof error.requestId === 'string' ? { requestId: scrubSecrets(error.requestId) } : {}),
      };
      this.failures.set(sessionId, failure);
      this.log(`agent failure ${known.agent} ${sessionId}: ${JSON.stringify(failure)}`);
      this.publish(known.canvasId, { agent: known.agent, state: 'idle', sessionId, failure });
      if (known.agent !== 'orb') this.researchRuns.get(known.canvasId)?.reviewed.delete(known.agent);
    }
    if (known?.agent === 'orb' && event.type === 'tool/call' && event.data?.name === 'add_link') {
      const run = this.researchRuns.get(known.canvasId);
      if (run?.active) run.linkCalls++;
    }
    if (event.type === 'turn/start' || event.type === 'compaction/end') this.researchReads.delete(sessionId);
    if (
      known &&
      known.agent !== 'orb' &&
      event.type === 'tool/call' &&
      [
        'web_search',
        'fetch_url',
        'fetch_signed_in',
        'parallel_extract',
        'deep_research',
        'batch_enrich',
        'find_entities',
        'upsert_rows',
        'place_card',
        'write_design_frame',
      ].includes(event.data?.name)
    )
      this.childResearchActivity.set(sessionId, Date.now());
    if (known && !this.outputJobs.has(known.canvasId)) {
      const name = event.data?.name;
      if (
        event.type === 'tool/call' &&
        ['delegate', 'upsert_rows', 'update_card', 'place_card', 'add_frame', 'write_design_frame'].includes(
          name,
        )
      ) {
        const request = this.researchRequests.get(known.canvasId);
        if (
          known.agent === 'orb' &&
          request &&
          !request.control &&
          !request.setupOnly &&
          !this.researchArmed.has(known.canvasId)
        ) {
          const run = this.researchFor({
            ...request,
            whole: request.whole || (name === 'delegate' && !request.scope?.length),
          });
          // A research delegation owns the board. A focused edit owns only the touched frames; scoring a single
          // card must not start researching every other empty table on an existing board.
          if (!request.whole && !request.scope?.length && name !== 'delegate') run.targets = new Set();
          this.researchRuns.set(known.canvasId, run);
          this.researchArmed.add(known.canvasId);
          void this.saveResearch(known.canvasId, { ...request, whole: !!run.whole }, 'working');
        }
        if (known.agent === 'orb') {
          const run = this.researchRuns.get(known.canvasId);
          let args = event.data?.arguments;
          if (typeof args === 'string') {
            try {
              args = JSON.parse(args);
            } catch {
              args = undefined;
            }
          }
          if (run?.active && run.targets && args && typeof args === 'object') {
            for (const id of [args.frameId, args.cardId, args.datasetId, ...(args.frameIds ?? [])])
              if (typeof id === 'string') run.targets.add(id);
          }
        }
        if (event.data.callId)
          this.researchWrites.set(`${sessionId}:${event.data.callId}`, {
            canvasId: known.canvasId,
            role: known.agent,
            tool: name,
          });
      }
      if (event.type === 'tool/result') {
        const message = event.data?.message;
        const callId = message?.toolCallId;
        const key = `${sessionId}:${callId}`;
        const write = this.researchWrites.get(key);
        if (write) {
          this.researchWrites.delete(key);
          const run = this.researchRuns.get(write.canvasId);
          let result: any;
          try {
            result = JSON.parse(textOfContent(message.content));
          } catch {
            /* Some tools return plain text. */
          }
          // FRAME_FULL is a normal tool result carrying an error, not a successful evidence write.
          const success = !message?.isError && !result?.error;
          if (success) this.refreshCoverage(write.canvasId);
          const changed =
            result?.reused !== true &&
            result?.updated !== false &&
            (write.tool !== 'upsert_rows' || result?.added > 0 || result?.updated > 0 || result?.removed > 0);
          if (
            run?.active &&
            success &&
            changed &&
            ['place_card', 'update_card', 'upsert_rows', 'write_design_frame'].includes(write.tool)
          ) {
            run.readsSinceWrite = 0;
            this.researchReadStreaks.delete(sessionId);
          }
          if (run?.active && success && changed && (write.role === 'scout' || write.tool === 'upsert_rows'))
            run.evidenceVersion++;
          if (
            run?.active &&
            write.role === 'orb' &&
            run.targets &&
            success &&
            typeof result?.frameId === 'string'
          ) {
            run.targets.add(result.frameId);
          }
        }
      }
    }
    if (!known || known.agent !== 'orb') return;
    const { canvasId } = known;
    const turn = this.threadTurns.get(sessionId);
    switch (event.type) {
      case 'turn/start':
        this.threadTurns.set(sessionId, { texts: [] });
        this.canvas.setActiveThread(sessionId, undefined);
        return;
      case 'user/message': {
        const message = event.data?.message ?? event.data;
        if (message?.source?.kind !== 'user') return;
        const text = textOfContent(
          Array.isArray(message.content) ? message.content.slice(0, 1) : message.content,
        );
        const pending = this.pendingResearch.get(canvasId) ?? [];
        const i = pending.findIndex((r) => r.text === text);
        if (i >= 0) {
          const [request] = pending.splice(i, 1);
          const previous = this.researchRuns.get(canvasId);
          this.researchRequests.set(canvasId, request!);
          if (request!.continuation && previous?.active) {
            previous.request = request!.objective ?? request!.text;
            previous.detailed ||= this.researchFor(request!).detailed;
            previous.outputs = [
              ...new Set([
                ...previous.outputs,
                ...requestedResearchOutputs(request!.intentText ?? request!.text),
              ]),
            ];
          } else {
            if (previous) previous.active = false;
            this.researchArmed.delete(canvasId);
            // A full-board request remains work even if the model ends without calling any tools.
            if (request!.whole && !request!.control && !request!.setupOnly) {
              this.researchRuns.set(canvasId, this.researchFor(request!));
              this.researchArmed.add(canvasId);
            }
          }
        }
        const thread = threadIdOf(message.content);
        const next = turn ?? { texts: [] };
        if (thread) next.thread = thread;
        else delete next.thread;
        this.threadTurns.set(sessionId, next);
        this.canvas.setActiveThread(sessionId, next.thread);
        return;
      }
      case 'assistant/message': {
        if (!turn?.thread) return;
        const message = event.data?.message;
        const text = textOfContent(message?.content);
        if (text) turn.texts.push(text);
        if (typeof message?.source?.model === 'string') turn.model = message.source.model;
        if (typeof message?.source?.provider === 'string') turn.provider = message.source.provider;
        return;
      }
      case 'turn/end': {
        if (!turn?.thread) this.canvas.setActiveThread(sessionId, undefined);
        void this.finishThreadReply(canvasId, sessionId).catch((err) =>
          this.log(`thread reply on canvas ${canvasId} not stored: ${String(err)}`),
        );
        this.threadTurns.delete(sessionId);
        return;
      }
      default:
        return;
    }
  }

  /**
   * Stop ONE agent of the canvas for the user (P3.6 per-agent Stop on the avatars): Orb's turn is cancelled with
   * `{kind:'user'}` (its queue cleared; its children keep working), a child is interrupted with the user's authority
   * (`{kind:'user', parentSessionId: root}`). Waits up to STOP_TIMEOUT_MS for it to be idle, publishing `stopping`
   * then `stopped` / `stop-timeout` for that agent on `agents.status`.
   */
  async stopOne(canvasId: string, agent: AgentName): Promise<ControlResult<'stop'>> {
    if (agent === 'orb' && this.outputJobs.has(canvasId) && this.canvas.port.job(canvasId))
      this.cancelledOutputJobs.add(canvasId);
    // No completion guard may restart a user-stopped member of the team.
    const research = this.researchRuns.get(canvasId);
    if (research) research.active = false;
    if (agent === 'orb') {
      const startedAt = performance.now();
      const meta = await this.canvas.open(canvasId);
      this.noteSessions(meta);
      await this.restorePause(meta);
      const sessionId = meta.rootSessionId ?? undefined;
      const root = sessionId ? (this.ctx.agents.get(sessionId) as AgentLike | undefined) : undefined;
      // Stop clears the queue: a pause and what it held go too (P3.7).
      this.paused.delete(pauseKey(canvasId, 'orb'));
      this.publish(canvasId, { agent: 'orb', state: 'stopping', ...(sessionId ? { sessionId } : {}) });
      root?.cancel({ kind: 'user' });
      const stopped = root ? await idleWithin(root, STOP_TIMEOUT_MS) : true;
      const stopMs = Math.round((performance.now() - startedAt) * 10) / 10;
      const state = stopped ? ('stopped' as const) : ('stop-timeout' as const);
      this.publish(canvasId, { agent: 'orb', state, stopMs, ...(sessionId ? { sessionId } : {}) });
      return { action: 'stop', state, stopMs, agents: root ? 1 : 0 };
    }
    const startedAt = performance.now();
    const meta = await this.canvas.open(canvasId);
    this.noteSessions(meta);
    await this.restorePause(meta);
    const role = agent as ChildAgentName;
    const childId = meta.childAgentIds[role];
    if (!childId || !meta.rootSessionId)
      throw new CanvasError('orb/not-found', `${AGENT_LABELS[role]} has not been started on this canvas`);
    const live = this.ctx.agents.get(childId) as AgentLike | undefined;
    const last = this.last(canvasId, role);
    this.paused.delete(pauseKey(canvasId, role));
    // Its settlement notice ("… was stopped") must not wake Orb into re-delegating what the user just stopped.
    this.quiet.add(childId);
    this.publish(canvasId, { ...last, agent: role, state: 'stopping', sessionId: childId });
    this.subagents.interrupt(childId, { kind: 'user', parentSessionId: meta.rootSessionId } as any);
    // `interrupt` keeps the child's unclaimed inbox; Stop clears it (the abort itself was the interrupt's).
    live?.cancel({ kind: 'user' });
    const stopped = live ? await idleWithin(live, STOP_TIMEOUT_MS) : true;
    const stopMs = Math.round((performance.now() - startedAt) * 10) / 10;
    const state = stopped ? ('stopped' as const) : ('stop-timeout' as const);
    this.publish(canvasId, {
      ...last,
      agent: role,
      state,
      stopMs,
      label: 'Stopped',
      sessionId: childId,
    });
    this.log(`stop ${role} on canvas ${canvasId}: ${state} in ${stopMs} ms`);
    return { action: 'stop', state, stopMs, agents: live ? 1 : 0 };
  }

  // ---- Pause, resume, redirect (P3.7) ----

  /**
   * P6.9: write the canvas's pause state (coalesced: changes in the same tick make one write; writes of a canvas are
   * serialized). Failures are logged, never thrown into a control action.
   */
  private persistPause(canvasId: string): void {
    if (!this.pauseRestored.has(canvasId)) return; // restore first: never overwrite a state not yet read
    if (this.pauseDirty.has(canvasId)) return;
    this.pauseDirty.add(canvasId);
    const run = (this.pauseWrites.get(canvasId) ?? Promise.resolve())
      .then(() => Promise.resolve())
      .then(async () => {
        this.pauseDirty.delete(canvasId);
        const snap = this.paused.snapshot(canvasId);
        const write = this.canvas.writePauseState;
        if (typeof write !== 'function') return;
        await write.call(this.canvas, canvasId, Object.keys(snap).length > 0 ? { v: 1, paused: snap } : null);
      })
      .catch((err) => this.log(`pause state of canvas ${canvasId} not saved: ${String(err)}`));
    this.pauseWrites.set(canvasId, run);
    void run.finally(() => {
      if (this.pauseWrites.get(canvasId) === run) this.pauseWrites.delete(canvasId);
    });
  }

  /** Resolves when every pause write queued so far has landed (tests, shutdown). */
  async flushPause(): Promise<void> {
    await Promise.all([...this.pauseWrites.values()]);
  }

  /**
   * P6.9: read a canvas's persisted pause state once per app session, when its agents are first used. A paused agent
   * stays paused (its queue back as it was): the agents are not running after a restart, so nothing is cancelled; the
   * UI shows `paused`, steps the harness would start are held, and Resume works as before.
   */
  private async restorePause(meta: CanvasMeta): Promise<void> {
    if (this.pauseRestored.has(meta.id)) return;
    this.pauseRestored.add(meta.id);
    const read = this.canvas.readPauseState;
    const raw =
      typeof read === 'function' ? await read.call(this.canvas, meta.id).catch(() => undefined) : undefined;
    const saved = (raw as { paused?: Record<string, { held?: unknown }> } | undefined)?.paused;
    if (!saved || typeof saved !== 'object') return;
    for (const role of ['orb', ...CHILD_AGENTS] as AgentName[]) {
      const entry = saved[role];
      if (!entry || typeof entry !== 'object') continue;
      const childId = role === 'orb' ? undefined : meta.childAgentIds[role];
      if (role !== 'orb' && !childId) continue; // the child no longer exists: nothing to hold
      const held = (Array.isArray(entry.held) ? entry.held : []).filter(
        (h): h is HeldItem =>
          !!h && typeof h === 'object' && typeof (h as { kind?: unknown }).kind === 'string',
      );
      this.paused.set(pauseKey(meta.id, role), { held });
      if (childId) this.quiet.add(childId);
      const sessionId = role === 'orb' ? meta.rootSessionId : childId;
      this.publish(meta.id, {
        ...(role === 'orb' ? {} : this.last(meta.id, role)),
        agent: role,
        state: 'paused',
        ...(sessionId ? { sessionId } : {}),
      });
    }
    this.log(`restored the pause of canvas ${meta.id}`);
  }

  /** Whether `agent` of the canvas is paused. */
  isPaused(canvasId: string, agent: AgentName): boolean {
    return this.paused.has(pauseKey(canvasId, agent));
  }

  /** The roles a control addresses: one agent, or Orb and every child the canvas has started. */
  private rolesOf(meta: CanvasMeta, target: AgentName | 'all'): AgentName[] {
    if (target !== 'all') {
      if (target !== 'orb' && !meta.childAgentIds[target])
        throw new CanvasError('orb/not-found', `${AGENT_LABELS[target]} has not been started on this canvas`);
      return [target];
    }
    return ['orb', ...CHILD_AGENTS.filter((role) => meta.childAgentIds[role])];
  }

  /**
   * Pause (PRD Agents › Controls): halt the current turn but keep the queue, and hold the agent until Resume. Orb is
   * cancelled with `{kind:'user'}, {keepInbox: true}`; a child is interrupted with the user's authority (which keeps
   * its unclaimed inbox). Both are marked paused at once: steps they would start meanwhile are rejected with their
   * messages kept (`onPreStep`), and messages addressed to them are queued. Waits ≤ STOP_TIMEOUT_MS for idle.
   */
  async pause(canvasId: string, target: AgentName | 'all'): Promise<ControlResult<'pause'>> {
    const startedAt = performance.now();
    const meta = await this.canvas.open(canvasId);
    this.noteSessions(meta);
    await this.restorePause(meta);
    const roles = this.rolesOf(meta, target);
    // Children first (in parallel), then Orb; every agent is marked paused before any cancel lands.
    const waits = [
      ...roles.filter((r): r is ChildAgentName => r !== 'orb').map((role) => this.pauseChild(meta, role)),
      ...(roles.includes('orb') ? [this.pauseRoot(meta)] : []),
    ];
    const idle = (await Promise.all(waits)).every(Boolean);
    const stopMs = Math.round((performance.now() - startedAt) * 10) / 10;
    this.log(`pause ${target} on canvas ${canvasId}: ${idle ? 'idle' : 'still busy'} in ${stopMs} ms`);
    return { action: 'pause', state: idle ? 'paused' : 'pause-timeout', stopMs, agents: roles.length };
  }

  private async pauseRoot(meta: CanvasMeta): Promise<boolean> {
    const sessionId = meta.rootSessionId ?? undefined;
    if (!this.paused.has(pauseKey(meta.id, 'orb'))) this.paused.set(pauseKey(meta.id, 'orb'), { held: [] });
    this.publish(meta.id, { agent: 'orb', state: 'paused', ...(sessionId ? { sessionId } : {}) });
    const root = sessionId ? (this.ctx.agents.get(sessionId) as AgentLike | undefined) : undefined;
    root?.cancel({ kind: 'user' }, { keepInbox: true });
    return root ? idleWithin(root, STOP_TIMEOUT_MS) : true;
  }

  private async pauseChild(meta: CanvasMeta, role: ChildAgentName): Promise<boolean> {
    const childId = meta.childAgentIds[role]!;
    if (!this.paused.has(pauseKey(meta.id, role))) this.paused.set(pauseKey(meta.id, role), { held: [] });
    this.quiet.add(childId);
    this.publish(meta.id, { ...this.last(meta.id, role), agent: role, state: 'paused', sessionId: childId });
    const live = this.ctx.agents.get(childId) as AgentLike | undefined;
    if (meta.rootSessionId)
      this.subagents.interrupt(childId, { kind: 'user', parentSessionId: meta.rootSessionId } as any);
    return live ? idleWithin(live, STOP_TIMEOUT_MS) : true;
  }

  /**
   * Resume: clear the paused flag and steer the agent with RESUME_TEXT plus everything queued while it was paused.
   * Orb: the held messages (chat, redirects, children's messages, the steps it was held from) go back into its inbox
   * in order (`inject`, no wake), then the steer wakes it and its first step takes them all. A child gets one
   * message (cold-resumed when it settled): RESUME_TEXT and the queued assignments and messages.
   */
  async resume(canvasId: string, target: AgentName | 'all'): Promise<ControlResult<'resume'>> {
    const meta = await this.canvas.open(canvasId);
    this.noteSessions(meta);
    await this.restorePause(meta);
    const roles =
      target === 'all'
        ? (['orb', ...CHILD_AGENTS] as AgentName[]).filter((r) => this.paused.has(pauseKey(canvasId, r)))
        : this.rolesOf(meta, target);
    let agents = 0;
    let queued = 0;
    for (const role of roles) {
      const pause = this.paused.get(pauseKey(canvasId, role));
      if (!pause) continue;
      this.paused.delete(pauseKey(canvasId, role));
      if (role !== 'orb' && !meta.childAgentIds[role]) {
        // The child is gone: Pause all landed while Orb was still starting it, so the aborted `delegate` took its
        // id back (HARNESS_NOTES §P3.7). Orb's own "continue" re-delegates if the work is still wanted.
        this.log(
          `resume ${role} on canvas ${canvasId}: never started; ${pause.held.length} queued item(s) dropped`,
        );
        this.publish(canvasId, { ...this.last(canvasId, role), agent: role, state: 'idle', label: 'Idle' });
        continue;
      }
      agents++;
      queued += pause.held.filter((h) => h.kind !== 'stashed').length;
      if (role === 'orb') await this.resumeRoot(canvasId, pause.held);
      else await this.resumeChild(meta, role, pause.held);
    }
    this.log(`resume ${target} on canvas ${canvasId}: ${agents} agent(s), ${queued} queued item(s)`);
    return { action: 'resume', state: 'resumed', agents, queued };
  }

  private async resumeRoot(canvasId: string, held: HeldItem[]): Promise<void> {
    const root = await this.rootAgent(canvasId);
    await this.restoreResearch(canvasId);
    const saved = this.savedResearch.get(canvasId);
    if (!this.researchRuns.get(canvasId)?.active && saved && saved.status !== 'complete') {
      this.researchRequests.set(canvasId, saved.request);
      this.researchRuns.set(canvasId, this.researchFor(saved.request));
      this.researchArmed.add(canvasId);
      root.inject?.(
        createUserMessage({
          content: [
            textBlock(
              `Resume the saved research objective, reusing existing evidence: ${saved.request.objective ?? saved.request.text}`,
            ),
          ],
          source: { kind: 'orb-research-review', form: 'notice' },
        } as any),
      );
      await this.saveResearch(canvasId, saved.request, 'working');
    }
    // Everything held goes back in order as next-step input (no wake), then the steer wakes Orb: its first step
    // takes it all together with the "continue" (a follow-up would only be claimed one turn later).
    for (const item of held) if (item.kind !== 'text') root.inject?.(item.message);
    root.steer(createUserMessage({ content: [textBlock(RESUME_TEXT)], source: { kind: 'user' } } as any));
    this.publish(canvasId, { agent: 'orb', state: root.status, sessionId: root.id });
  }

  private async resumeChild(meta: CanvasMeta, role: ChildAgentName, held: HeldItem[]): Promise<void> {
    const childId = meta.childAgentIds[role]!;
    this.quiet.delete(childId);
    this.dropDeferredOf(meta.rootSessionId, childId);
    const root = await this.rootAgent(meta.id);
    const content = [
      textBlock(RESUME_TEXT),
      ...held.flatMap((item) =>
        item.kind === 'text'
          ? [textBlock(item.text)]
          : contentBlocks((item.message as UserMessageLike).content),
      ),
    ];
    await this.subagents.sendMessage(root, childId, content, { signal: AbortSignal.timeout(30_000) });
    this.publish(meta.id, {
      ...this.last(meta.id, role),
      agent: role,
      state: 'running',
      label: 'Resuming',
      sessionId: childId,
    });
  }

  /**
   * Redirect: Orb (or `all`) is steered with the user's text (it takes it at its next step, or starts a turn when
   * idle); a child gets it as a message (cold-resumed when it settled). A paused agent queues it until Resume.
   */
  async redirect(
    canvasId: string,
    target: AgentName | 'all',
    text: string,
  ): Promise<ControlResult<'redirect'>> {
    const body = text.trim();
    if (!body) throw new CanvasError('orb/invalid-args', 'redirect needs text');
    const meta = await this.canvas.open(canvasId);
    this.noteSessions(meta);
    await this.restorePause(meta);
    const role: AgentName = target === 'all' ? 'orb' : target;
    const pause = this.paused.get(pauseKey(canvasId, role));
    if (role === 'orb') {
      const message = createUserMessage({ content: [textBlock(body)], source: { kind: 'user' } } as any);
      if (pause) {
        pause.held.push({ kind: 'steer', message });
        return { action: 'redirect', state: 'queued', agents: 1 };
      }
      const root = await this.rootAgent(canvasId);
      this.flushDeferred(root);
      root.steer(message);
      return { action: 'redirect', state: 'delivered', agents: 1 };
    }
    this.rolesOf(meta, role); // a role never started: orb/not-found
    const childId = meta.childAgentIds[role]!;
    const note = `The user redirects you: ${body}`;
    const restoreAssignment = this.preserveChildDirection(canvasId, role, note);
    if (pause) {
      pause.held.push({ kind: 'text', text: note });
      return { action: 'redirect', state: 'queued', agents: 1 };
    }
    this.quiet.delete(childId);
    try {
      const root = await this.rootAgent(canvasId);
      await this.subagents.sendMessage(root, childId, [textBlock(note)], {
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      restoreAssignment();
      throw error;
    }
    this.publish(canvasId, {
      ...this.last(canvasId, role),
      agent: role,
      state: 'running',
      label: 'Redirected',
      sessionId: childId,
    });
    return { action: 'redirect', state: 'delivered', agents: 1 };
  }

  /** Settlement notice of a child the user stopped or paused (it must not wake Orb). */
  private isQuietNotice(message: unknown): boolean {
    const source = (message as UserMessageLike | undefined)?.source;
    return (
      source?.kind === 'subagent-settled' &&
      typeof source.senderSessionId === 'string' &&
      this.quiet.has(source.senderSessionId)
    );
  }

  /**
   * `agent/pre-step` of every agent (P3.7). For a canvas agent that is paused, the step is rejected and the messages
   * it claimed are kept for Resume (the harness drops a rejected step's messages: dsh-agent-loop `preStep`/`turn`).
   * For Orb, settlement notices of children the user stopped or paused are taken out of the step (and kept for the
   * user's next message); a first step left with nothing else is rejected, so no model request is made.
   */
  async onPreStep(payload: PreStepPayload, next: () => Promise<PreStepDecision>): Promise<PreStepDecision> {
    const known = this.canvasOfSession.get(payload.agent.id);
    if (!known) return next();
    const notices =
      known.agent === 'orb' ? payload.messages.filter((m) => this.isQuietNotice(m)) : ([] as unknown[]);
    if (notices.length) {
      const list = this.deferred.get(payload.agent.id) ?? [];
      for (const m of notices) {
        this.quiet.delete((m as UserMessageLike).source!.senderSessionId!);
        list.push(m);
      }
      this.deferred.set(payload.agent.id, list);
    }
    let rest = payload.messages.filter((m) => !notices.includes(m));
    const pause = this.paused.get(pauseKey(known.canvasId, known.agent));
    if (pause) {
      for (const message of rest) pause.held.push({ kind: 'stashed', message });
      this.log(
        `held a step of paused ${known.agent} on canvas ${known.canvasId} (${rest.length} message(s))`,
      );
      return { kind: 'reject' };
    }
    if (notices.length && rest.length === 0 && payload.step <= 1) {
      this.log(`kept ${notices.length} settlement notice(s) out of orb's turn on canvas ${known.canvasId}`);
      this.rewakeAfterReject(payload.agent as AgentLike, known.canvasId);
      return { kind: 'reject' };
    }
    // Multiple user requests may be claimed in one step. Answer threads separately so later messages cannot
    // steal an earlier thread's answer. Requeue untouched messages through the native inbox after admission.
    const users = rest.filter((m) => (m as UserMessageLike)?.source?.kind === 'user');
    const threadInput = users.some((m) => !!threadIdOf((m as UserMessageLike).content));
    const deferredUsers = known.agent === 'orb' && threadInput ? users.slice(1) : [];
    rest = rest.filter((m) => !deferredUsers.includes(m));
    if (known.agent === 'orb' && users.length)
      await this.finishThreadReply(known.canvasId, payload.agent.id);
    // A real step: an agent that read stopped reads running again (its harness `running` was held back).
    const last = this.last(known.canvasId, known.agent);
    if (!this.stopping.has(known.canvasId) && (last?.state === 'stopped' || last?.state === 'stop-timeout'))
      this.publishHarnessState(known.canvasId, known.agent, payload.agent.id, 'running');
    // A large model window is not a useful working-context budget. Compact research history at 64k rather than
    // waiting for the adapter's 80%-of-window overflow policy. The backend preserves checkpoints on reopen.
    const live = payload.agent as AgentLike & { session?: any };
    const meter = this.ctx.tokenMeter;
    let checkpoint: unknown;
    const reportJob =
      known.agent === 'orb' && this.outputJobs.has(known.canvasId)
        ? this.canvas.port.job(known.canvasId)
        : undefined;
    if (
      live.session &&
      meter &&
      this.ctx.compaction &&
      (!this.outputJobs.has(known.canvasId) || reportJob?.format === 'report')
    ) {
      const measurement = meter.measure(live.session);
      if (
        measurement.totalTokens >= RESEARCH_CONTEXT_TOKENS &&
        measurement.logRevision > (this.contextFailures.get(live.id) ?? -1)
      ) {
        const range = researchCompactRange(live.session, measurement);
        if (range)
          try {
            await this.ctx.compaction.compactRegion(range.start, range.end, live, (payload as any).signal);
            this.researchReads.delete(live.id);
            if (reportJob?.format === 'report') {
              const current = (await this.canvas.port.get(known.canvasId)).doc;
              const state = (await this.canvas.board(known.canvasId)).current;
              const plan =
                reportJob.kind === 'section'
                  ? reportJob.plan!.filter((p) => p.id === reportJob.sectionId)
                  : reportJob.plan!;
              const problems = current
                ? reportProblems(current, plan, state)
                : plan.map((p) => `Missing ${p.id}: ${p.heading}`);
              this.canvas.port.resetInspections(known.canvasId);
              checkpoint = createUserMessage({
                content: [
                  textBlock(
                    [
                      'Report checkpoint: continue writing the current professional research report, not new board research. Do not delegate or place cards.',
                      `Saved instructions: ${reportJob.instructions}`,
                      `Already saved sections: ${current?.sections.map((s) => s.id).join(', ') || 'none'}. Keep completed sections and the user's additions.`,
                      ...problems,
                      ...plan.map((p) => `${p.id}: ${p.heading}. ${p.guidance}`),
                      'Re-read the full supporting cards for the next section (all pages), then save it with compose_section. Evidence inspection receipts were reset after compaction. Work incrementally, preserve qualifications and finish the remaining report before claiming completion.',
                    ].join('\n'),
                  ),
                ],
                source: {
                  kind: 'orb-research-review',
                  form: 'notice',
                  summary: 'Report checkpoint: resume document writing.',
                },
              } as any);
            } else {
              const run = this.researchRuns.get(known.canvasId);
              const meta = await this.canvas.open(known.canvasId);
              const report = reviewResearch((await this.canvas.board(known.canvasId)).current, meta, {
                detailed: run?.detailed,
              });
              const request = this.researchRequests.get(known.canvasId);
              const assignment = this.currentAssignments.get(known.canvasId)?.get(known.agent);
              const checkpointScope =
                known.agent === 'orb' ? run?.scope : (assignment?.frameIds ?? run?.scope);
              checkpoint = createUserMessage({
                content: [
                  textBlock(
                    researchCheckpoint({
                      request:
                        request?.intentText ??
                        run?.request ??
                        request?.text ??
                        'Continue the current request in the checkpoint.',
                      intake: meta.intake ?? {},
                      role: known.agent,
                      frameIds: assignment?.frameIds ?? run?.scope ?? [],
                      assignment: assignment?.instruction,
                      gaps: report.gaps.filter(
                        (g) => !checkpointScope || checkpointScope.includes(g.frameId),
                      ),
                    }),
                  ),
                ],
                source: {
                  kind: 'orb-research-review',
                  form: 'notice',
                  summary: 'Research checkpoint: resume pending work.',
                },
              } as any);
            }
          } catch (error) {
            // Do not buy another failed summary on every step. New substantive history can try again later.
            this.contextFailures.set(live.id, measurement.logRevision + 100);
            this.log(
              `research context compaction failed for ${known.agent}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
      }
    }
    // The first pre-step precedes the harness's user/message event. Preview the claimed request without arming
    // or persisting it here; otherwise a completed saved board misses delivery guidance on its first model call.
    const claimedRequest = this.pendingResearch.get(known.canvasId)?.findLast((request) =>
      rest.some((raw) => {
        const message = raw as UserMessageLike;
        return (
          message.source?.kind === 'user' &&
          textOfContent(Array.isArray(message.content) ? message.content.slice(0, 1) : message.content) ===
            request.text
        );
      }),
    );
    const currentRun =
      claimedRequest && !claimedRequest.setupOnly && !claimedRequest.control
        ? this.researchFor(claimedRequest)
        : this.researchRuns.get(known.canvasId);
    if (
      !checkpoint &&
      known.agent === 'orb' &&
      currentRun?.active &&
      !currentRun.targets &&
      !this.outputJobs.has(known.canvasId) &&
      ((payload.step >= 16 && payload.step % 16 === 0) ||
        (payload.step === 1 && currentRun.whole && currentRun.outputs.length > 0))
    ) {
      const meta = await this.canvas.open(known.canvasId);
      const report = reviewResearch((await this.canvas.board(known.canvasId)).current, meta, {
        detailed: currentRun.detailed,
      });
      const gaps = report.gaps.filter((g) => !currentRun.scope || currentRun.scope.includes(g.frameId));
      const nextGap = gaps[0];
      if (payload.step !== 1 || (report.totalFrames > 0 && !gaps.length))
        checkpoint = createUserMessage({
          content: [
            textBlock(
              nextGap
                ? `Execution check: ${gaps.length} requested frames remain unfinished. Finish ${nextGap.title} [${nextGap.frameId}] next: ${nextGap.reasons.join(' ').slice(0, 2300)}. Reuse frames and existing cards. Batch independent writes and combine body/detail in each update. If Scout is still researching its missing evidence, finish independent synthesis and end this pass to await its completion; do not poll, reassign busy children or claim web access is unavailable from the root catalog. Then proceed to the next gap.`
                : `Delivery phase: the requested frames have content. Complete only missing current reviews, reconcile material contradictions, then compose the requested ${currentRun.outputs.join(' and ') || 'research recommendation'} from this board. A provisional research output is complete when genuine unavailable/private/future inputs are explicitly qualified; booking confirmation, live quotes, user ratings or personal actions are not prerequisites for writing it. Reuse the recorded attempts and evidence limits; do not start another whole-board source round for those same unknowns. Wait for active children by ending this pass; their completion wakes you.`,
            ),
          ],
          source: {
            kind: 'orb-research-review',
            form: 'notice',
            summary: 'Research execution check: finish pending content.',
          },
        } as any);
    }
    const failureDetails =
      known.agent === 'orb'
        ? rest.flatMap((raw) => {
            const source = (raw as UserMessageLike)?.source;
            const failure =
              source?.kind === 'subagent-settled' && source.senderSessionId
                ? this.failures.get(source.senderSessionId)
                : undefined;
            return failure ? [`${source!.senderSessionId}: ${JSON.stringify(failure)}`] : [];
          })
        : [];
    const failureNotice = failureDetails.length
      ? createUserMessage({
          content: [
            textBlock(
              [
                'The failed agents have these execution diagnostics:',
                ...failureDetails,
                'Explain the actual cause and recovery action. Narrowing the research question does not fix an authentication, billing or transport failure. Do not repeat unchanged permission, plan-limit or invalid-request failures; preserve the board and state the required action. Continue independent work only when it is useful.',
              ].join('\n'),
            ),
          ],
          source: {
            kind: 'orb-agent-failure',
            form: 'notice',
            summary: 'Agent failure details and recovery.',
          },
        } as any)
      : undefined;
    if (!notices.length && !checkpoint && !failureNotice && !deferredUsers.length) return next();
    const decision = await next();
    if (decision.kind !== 'enter') return decision;
    for (const message of deferredUsers) (payload.agent as AgentLike).followup(message);
    return {
      ...decision,
      messages: [
        ...decision.messages.filter((m) => !notices.includes(m) && !deferredUsers.includes(m)),
        ...(checkpoint ? [checkpoint] : []),
        ...(failureNotice ? [failureNotice] : []),
      ],
    };
  }

  /** A requested deliverable must be based on completed, reviewed research, not the first partial batch. */
  async onResearchPreTool(exec: any, next: () => Promise<any>): Promise<any> {
    const decision = await next();
    if (decision.kind !== 'allow' || !['compose_section', 'compose_slides'].includes(exec.name))
      return decision;
    const known = exec.agent && this.canvasOfSession.get(exec.agent.id);
    if (!known || known.agent !== 'orb' || this.outputJobs.has(known.canvasId)) return decision;
    const run = this.researchRuns.get(known.canvasId);
    if (!run?.active || !run.whole) return decision;
    exec.signal.throwIfAborted();
    const meta = await this.canvas.open(known.canvasId);
    const state = (await this.canvas.board(known.canvasId)).current;
    const gaps = reviewResearch(state, meta, { detailed: run.detailed }).gaps.filter(
      (g) => !run.scope || run.scope.includes(g.frameId),
    );
    const busy = Object.values(meta.childAgentIds ?? {}).some(
      (id) => this.ctx.agents.get(id)?.status === 'running',
    );
    const pendingReviews =
      run.allowTeam && run.detailed
        ? (['critic', 'builder'] as const).filter(
            (role) =>
              run.evidenceVersion > (run.reviewed.get(role as AgentName) ?? -1) ||
              boardFrames(state).some(
                (f) => (!run.scope || run.scope.includes(f.id)) && !run.assignments.get(role)?.includes(f.id),
              ),
          )
        : [];
    exec.signal.throwIfAborted();
    if (!gaps.length && !busy && !pendingReviews.length) return decision;
    return {
      kind: 'deny',
      reason: [
        'Complete the requested research and current team reviews before composing the final deliverable.',
        ...gaps.slice(0, 4).map((g) => `${g.title} [${g.frameId}]: ${g.reasons.join(' ')}`),
        busy
          ? 'A researcher/reviewer is still working; end this pass with progress and its completion will wake you.'
          : '',
        pendingReviews.length
          ? `Current reviews still missing: ${pendingReviews.map((role) => AGENT_LABELS[role]).join(', ')}. Delegate these roles across the requested frames, or end this pass so the completion check starts them. Keep already-current reviews; do not repeat them.`
          : '',
        'Then compose the complete requested output from the current board; do not deliver a partial deck/document.',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  /** Repeated identical board reads carry a small reference, never another copy of the same tables. */
  async onResearchTool(exec: any, result: any, next: () => Promise<any>): Promise<any> {
    const decision = await next();
    const known = exec.agent && this.canvasOfSession.get(exec.agent.id);
    const active = known && this.researchRuns.get(known.canvasId);
    if (
      known?.agent === 'scout' &&
      active?.active &&
      !this.outputJobs.has(known.canvasId) &&
      decision.kind === 'accept' &&
      [
        'board_map',
        'query_board',
        'query_dataset',
        'read_card',
        'read_source',
        'search_board',
        'web_search',
        'fetch_url',
        'fetch_signed_in',
        'parallel_extract',
        'web_answer',
        'batch_enrich',
        'find_entities',
      ].includes(exec.name)
    ) {
      const streak = (this.researchReadStreaks.get(exec.agent.id) ?? 0) + 1;
      this.researchReadStreaks.set(exec.agent.id, streak);
      if (streak % 12 === 0) {
        exec.signal.throwIfAborted();
        const meta = await this.canvas.open(known.canvasId);
        const report = reviewResearch((await this.canvas.board(known.canvasId)).current, meta);
        const assigned =
          this.currentAssignments.get(known.canvasId)?.get('scout')?.frameIds ??
          active.assignments.get('scout') ??
          [];
        const nextGap = report.gaps.find(
          (g) => assigned.includes(g.frameId) && g.reasons.some((r) => r.startsWith('Empty database')),
        );
        exec.signal.throwIfAborted();
        const notice = createUserMessage({
          content: [
            textBlock(
              [
                `${streak} research reads since your last saved finding. Save verified evidence and candidate rows now, then continue section by section; do not gather the entire board before writing.`,
                nextGap
                  ? `Next unfinished data section: ${nextGap.title} [${nextGap.frameId}]. ${nextGap.reasons.filter((r) => r.startsWith('Empty database')).join(' ')}`
                  : `Save the findings for your assigned frames: ${assigned.join(', ')}.`,
                'Use existing datasets and source URLs in rows; query the exact schema if needed. Save the established facts with dates and source references. Unknown future price/availability or private fields remain explicitly unknown; do not invent a quote, fill placeholder rows, or claim an unsuccessful search was evidence. More exact-date searches must not block saving the other verified fields. Report specific blockers and continue the remaining sections.',
              ].join('\n'),
            ),
          ],
          source: {
            kind: 'orb-research-review',
            form: 'notice',
            summary: 'Save incremental research evidence.',
          },
        } as any);
        return { ...decision, additionalContexts: [...(decision.additionalContexts ?? []), notice] };
      }
    }
    if (
      !known ||
      this.outputJobs.has(known.canvasId) ||
      result.isError ||
      result.value?.error ||
      decision.kind !== 'accept' ||
      decision.content ||
      decision.value
    )
      return decision;
    const run = this.researchRuns.get(known.canvasId);
    if (known.agent === 'orb' && run?.active && ['compose_section', 'compose_slides'].includes(exec.name)) {
      const output = exec.name === 'compose_slides' ? 'deck' : 'doc';
      if (run.outputs.includes(output)) {
        const state = (await this.canvas.board(known.canvasId)).current;
        const fingerprint = researchFingerprint(state);
        const previous = run.composed.get(output);
        const parts =
          output === 'deck'
            ? (exec.arguments.slides ?? [])
            : [...(exec.arguments.paragraphs ?? []), ...(exec.arguments.figures ?? [])];
        const ids = parts
          .flatMap((part: any) => [...(part.cardIds ?? []), part.visualCardId, part.cardId])
          .filter(Boolean);
        const frames = ids.flatMap((id: string) =>
          state.cards[id]?.frameId ? [state.cards[id]!.frameId!] : [],
        );
        run.composed.set(output, {
          fingerprint,
          frames: [
            ...new Set([...(previous?.fingerprint === fingerprint ? previous.frames : []), ...frames]),
          ],
        });
      }
    }
    const reads = this.researchReads.get(exec.agent.id) ?? new ResearchReads();
    this.researchReads.set(exec.agent.id, reads);
    const key = reads.key(exec.name, exec.arguments);
    if (!key) return decision;
    if (
      known.agent === 'orb' &&
      run?.active &&
      run.whole &&
      run.detailed &&
      !run.targets &&
      ++run.readsSinceWrite >= 16 &&
      ['board_map', 'query_board'].includes(exec.name)
    ) {
      const meta = await this.canvas.open(known.canvasId);
      const state = (await this.canvas.board(known.canvasId)).current;
      const focus = reviewResearch(state, meta, { detailed: true }).gaps.find(
        (g) => !run.scope || run.scope.includes(g.frameId),
      );
      if (focus && exec.arguments?.frameId !== focus.frameId) {
        const cards = Object.values(state.cards).filter((c) => c.frameId === focus.frameId && !c.stackedInto);
        const analysisCards = cards
          .filter((c) => !['source', 'quote', 'image', 'file', 'video', 'research', 'watch'].includes(c.type))
          .sort((a, b) => Number(b.type === 'doc') - Number(a.type === 'doc'))
          .slice(0, 4)
          .map((c) => ({
            cardId: c.id,
            type: c.type,
            title: cardTitle(c),
            detailChars: c.detail?.length ?? 0,
            body: String((c.data as any).body ?? (c.data as any).summary ?? '').slice(0, 1000),
            ...((c.data as any).datasetId ? { datasetId: (c.data as any).datasetId } : {}),
          }));
        return {
          ...decision,
          content: [
            textBlock(
              JSON.stringify({
                researchFocus: { ...focus, analysisCards },
                message:
                  'Overview deferred after sixteen reads without a substantive write. Finish this unfinished frame using the evidence already read. Query this frame or read specific cards/dataset schemas if needed; search_board can locate a particular cross-frame fact. Batch useful analysis and data updates before another whole-board scan. Do not restart research, pad text or invent facts.',
              }),
            ),
          ],
        };
      }
    }
    // Compare actual results, including rows outside the preview. Concurrent writes can never be hidden by a stale cache.
    const revision = createHash('sha256').update(JSON.stringify(result.value)).digest('hex');
    exec.signal.throwIfAborted();
    const repeated = reads.repeated(key, revision);
    if (repeated) {
      const value = {
        unchanged: true,
        previousCallId: repeated.callId,
        message:
          'This read returned the same content as the previous successful call. Use that result already in context; other views or unread fields may differ. Read a different page/card only when needed; finish the next unfinished frame. If waiting for a child, end this pass with progress: completion wakes you. Do not poll or rewrite the same assessment repeatedly.',
      };
      return { ...decision, content: [textBlock(JSON.stringify(value))] };
    }
    reads.remember(key, revision, exec.callId);
    return decision;
  }

  /**
   * A rejected step ends its turn without looking at the inbox again (dsh-agent-loop `turn`: the reject path returns
   * before the `hasPending` check), so input that arrived while the rejected step ran (a chat message sent just as a
   * kept notice came in) would stay parked until the next wake. Once the rejected turn is over, re-deliver what is
   * pending, in order, so the first item wakes Orb as it would have. Not for a paused agent: Resume wakes it.
   */
  private rewakeAfterReject(agent: AgentLike, canvasId: string): void {
    void agent
      .whenIdle()
      .catch(() => undefined)
      .then(() => {
        const inbox = agent.inbox;
        if (!inbox || agent.status !== 'idle' || this.paused.has(pauseKey(canvasId, 'orb'))) return;
        if (this.ctx.agents.get(agent.id) !== agent) return;
        const steps = inbox.nextStep.length ? inbox.splice('next-step', 0, inbox.nextStep.length, []) : [];
        const turns = inbox.nextTurn.length ? inbox.splice('next-turn', 0, inbox.nextTurn.length, []) : [];
        if (!steps.length && !turns.length) return;
        this.log(
          `re-delivered ${steps.length + turns.length} parked message(s) to orb on canvas ${canvasId}`,
        );
        for (const message of steps) agent.steer(message);
        for (const message of turns) agent.followup(message);
      });
  }

  /** Hand Orb the notices kept out of its turns, as context for the turn about to start (no wake). */
  private flushDeferred(root: AgentLike): void {
    const list = this.deferred.get(root.id);
    if (!list?.length) return;
    this.deferred.delete(root.id);
    for (const message of list) root.inject?.(message);
  }

  /** Forget the kept notices of one child (it was resumed: "it was stopped" no longer holds). */
  private dropDeferredOf(rootSessionId: string | null | undefined, childId: string): void {
    if (!rootSessionId) return;
    const list = this.deferred.get(rootSessionId);
    if (!list) return;
    const kept = list.filter((m) => (m as UserMessageLike).source?.senderSessionId !== childId);
    if (kept.length) this.deferred.set(rootSessionId, kept);
    else this.deferred.delete(rootSessionId);
  }

  /** Harness `agent/status` (running/idle) of any agent; the canvas agents (root and children) are published. */
  async onTurnStopping(payload: { agent: AgentLike; signal: AbortSignal }): Promise<void> {
    const known = this.canvasOfSession.get(payload.agent.id);
    if (!known || payload.signal.aborted || this.outputJobs.has(known.canvasId)) return;
    const { canvasId, agent: role } = known;
    if (role === 'orb')
      await this.finishThreadReply(canvasId, payload.agent.id).catch((err) =>
        this.log(`thread reply on canvas ${canvasId} not stored: ${String(err)}`),
      );
    const run = this.researchRuns.get(canvasId);
    if (!run?.active || this.stopping.has(canvasId) || this.isPaused(canvasId, role)) return;
    const meta = await this.canvas.open(canvasId);
    const board = await this.canvas.board(canvasId);
    const state = board.current;
    if (payload.signal.aborted || !run.active) return;
    const boardReport = reviewResearch(state, meta, { detailed: run.detailed });
    let report = boardReport;
    if (run.targets)
      run.scope = [
        ...new Set(
          [...run.targets].flatMap((id) => {
            if (state.frames[id]) return [id];
            const card =
              state.cards[id] ??
              Object.values(state.cards).find(
                (c) => c.type === 'database' && (c.data as any).datasetId === id,
              );
            return card?.frameId ? [card.frameId] : [];
          }),
        ),
      ];
    if (run.scope !== undefined) {
      const totalFrames = run.scope.filter((id) => !!state.frames[id]).length;
      const gaps = report.gaps.filter((g) => run.scope!.includes(g.frameId));
      report = { ...report, totalFrames, coveredFrames: totalFrames - gaps.length, gaps };
    }
    const children = Object.entries(meta.childAgentIds ?? {});
    const busy = children.some(
      ([r, id]) => r !== role && id && this.ctx.agents.get(id)?.status === 'running',
    );
    // Paused work belongs to the user. A completion pass must never bypass it.
    if (CHILD_AGENTS.some((r) => this.isPaused(canvasId, r))) return;
    const reasons: string[] = [];
    if (role === 'orb' && !Object.keys(state.frames).length && !Object.keys(state.cards).length)
      reasons.push(
        'No research findings or board were created. Use add_frame to plan the requested research, then populate it; a reply alone does not fulfil this task.',
      );
    let gaps = report.gaps;
    if (role !== 'orb') {
      const assigned =
        this.currentAssignments.get(canvasId)?.get(role)?.frameIds ?? run.assignments.get(role) ?? [];
      // Scout fills the datasets; Orb owns edits to the template's assessment seeds. Builder cannot fix missing data.
      gaps =
        role === 'scout'
          ? gaps
              .filter((g) => assigned.includes(g.frameId))
              .map((g) => ({
                ...g,
                reasons: g.reasons.filter(
                  (r) => r.startsWith('Empty database') || r.startsWith('No substantive'),
                ),
              }))
              .filter((g) => g.reasons.length)
          : [];
      if (!gaps.length) return;
    } else {
      this.coverage.set(canvasId, { ...boardReport, state: 'working' });
      this.publish(canvasId, { agent: 'orb', state: 'running', sessionId: payload.agent.id });
      if (busy) return; // Completion notices wake Orb when its children actually finish; never poll the model.
      // Reviews are stale when Scout adds evidence or Orb reconciles the underlying datasets.
      for (const reviewer of ['critic', 'builder'] as const) {
        const fullReview = !gaps.length && run.whole && run.detailed;
        const unassigned =
          fullReview &&
          boardFrames(state).some(
            (f) => (!run.scope || run.scope.includes(f.id)) && !run.assignments.get(reviewer)?.includes(f.id),
          );
        if (
          run.allowTeam &&
          ((run.evidenceVersion > (run.reviewed.get(reviewer) ?? -1) && run.assignments.has(reviewer)) ||
            unassigned)
        )
          reasons.push(
            `${AGENT_LABELS[reviewer]}'s previous pass predates the latest research data; review the populated board again.`,
          );
      }
      if (!gaps.length && !reasons.length) {
        if (run.detailed && run.whole && !run.finalChecked) {
          run.finalChecked = true;
          const candidates = Object.values(state.cards)
            .filter(
              (c) =>
                !c.stackedInto &&
                (!run.scope || (!!c.frameId && run.scope.includes(c.frameId))) &&
                ['doc', 'risk', 'question', 'insight', 'metric', 'decision'].includes(c.type),
            )
            .flatMap((c) => {
              const text = `${JSON.stringify(c.data)}\n${c.detail ?? ''}`;
              const match =
                /\b(?:unverified|not yet|does not contain|no (?:current|verified|source|data|evidence)|blocked|placeholder|pending)\b/i.exec(
                  text,
                );
              return match
                ? [`${c.id}: ${text.slice(Math.max(0, match.index - 60), match.index + 240)}`]
                : [];
            })
            .slice(0, 12);
          payload.agent.steer(
            createUserMessage({
              content: [
                textBlock(
                  [
                    'Final consistency check before delivery: every requested frame now has content and the reviews are current. Reconcile the existing board, without adding more frames/cards or restarting research.',
                    'Check stale claims of missing sources, unavailable tools or empty datasets against the research now saved. Align the body and expanded analysis, tables, charts and final recommendation. Reconcile units, dates, totals, active/alternative budget rows and route or business-model assumptions. Historical evidence must stay dated; genuine private/future unknowns must remain explicit rather than becoming invented facts.',
                    'Candidate statements to check (some may be valid limits; keep those and explain their basis):',
                    ...candidates,
                    'Make only necessary substantive edits, batching independent updates. Then deliver the useful final recommendation, what was completed, and precise remaining evidence limits.',
                  ].join('\n'),
                ),
              ],
              source: {
                kind: 'orb-research-review',
                form: 'notice',
                summary: 'Final research consistency check.',
              },
            } as any),
          );
          return;
        }
        const fingerprint = researchFingerprint(state);
        for (const output of run.outputs) {
          const composed = run.composed.get(output);
          const missing = boardFrames(state).filter(
            (f) =>
              (!run.scope || run.scope.includes(f.id)) &&
              (composed?.fingerprint !== fingerprint || !composed.frames.includes(f.id)),
          );
          if (!composed || missing.length)
            reasons.push(
              `The requested ${output === 'deck' ? 'slide deck' : 'research document'} is not complete from the current board.${missing.length ? ` Still cover: ${missing.map((f) => `${f.title} [${f.id}]`).join(', ')}.` : ''} Use ${output === 'deck' ? 'compose_slides' : 'compose_section'} now, with useful content and citations to the cards supporting each requested section; replace obsolete output rather than append duplicates. A board-only reply or partial output does not finish the deliverable.`,
            );
          if (output === 'doc') {
            const doc = (await this.canvas.port.get(canvasId)).doc;
            if (doc?.format === 'report')
              reasons.push(
                ...reportProblems(doc, reportPlan(state, doc.scope), state).map(
                  (problem) => `Research report: ${problem}`,
                ),
              );
          }
        }
        if (!reasons.length) {
          // Do not durably mark an objective complete ahead of its buffered board writes.
          await board.flush?.();
          if (payload.signal.aborted || !run.active) return;
          run.active = false;
          const request = this.researchRequests.get(canvasId);
          if (request) await this.saveResearch(canvasId, request, 'complete');
          this.coverage.set(canvasId, boardReport);
          this.publish(canvasId, { agent: 'orb', state: 'running', sessionId: payload.agent.id });
          return;
        }
      }
    }
    if (
      !repairAllowed(
        run,
        role,
        `${run.evidenceVersion}:${researchFingerprint(state)}:${JSON.stringify([...run.reviewed])}:${JSON.stringify([...run.composed])}`,
      )
    ) {
      if (role === 'orb') {
        run.active = false;
        void this.saveResearch(canvasId, this.researchRequests.get(canvasId)!, 'incomplete');
        this.coverage.set(canvasId, { ...boardReport, state: 'incomplete' });
        this.publish(canvasId, { agent: 'orb', state: 'running', sessionId: payload.agent.id });
        payload.agent.steer(
          createUserMessage({
            content: [
              textBlock(
                `The completion check still finds unfinished work: ${reasons.join(' ')} ${report.gaps.length} unfinished frames: ${report.gaps
                  .map((g) => `${g.title}: ${g.reasons.join(' ')}`)
                  .join('\n')
                  .slice(0, 9000)}. ` +
                  'Further automatic passes made insufficient progress or reached the repair limit. Finish with an honest handoff: state what is filled, the specific remaining gaps, failed sources and any essential user inputs. Do not say the board is completed. Do not start another agent or paid run in this handoff.',
              ),
            ],
            source: {
              kind: 'orb-research-review',
              form: 'notice',
              summary: 'Research remains incomplete; automatic repair stopped.',
            },
          } as any),
        );
      }
      return;
    }
    if (role === 'orb' && run.allowTeam) {
      for (const reviewer of ['critic', 'builder'] as const) {
        const frameIds =
          !gaps.length && run.whole && run.detailed
            ? boardFrames(state)
                .map((f) => f.id)
                .filter((id) => !run.scope || run.scope.includes(id))
            : run.assignments.get(reviewer);
        const unassigned = frameIds?.some((id) => !run.assignments.get(reviewer)?.includes(id));
        if (!frameIds?.length || (run.evidenceVersion <= (run.reviewed.get(reviewer) ?? -1) && !unassigned))
          continue;
        try {
          for (let offset = 0; offset < frameIds.length; offset += 12)
            await this.delegate(
              { agent: payload.agent, signal: payload.signal },
              {
                role: reviewer,
                frameIds: frameIds.slice(offset, offset + 12),
                instruction:
                  'Research inputs have changed since your previous pass. Re-read the current sources and dataset rows, including orb’s reconciled route/budget or other updated data. Complete your original playbook against the evidence now available; update your existing visuals/conclusions or link revised cards instead of repeating old warnings. Use only sourced data and report specific remaining gaps.',
              },
            );
        } catch (err) {
          if (payload.signal.aborted) throw err;
          reasons.push(`${reviewer} could not restart: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    payload.signal.throwIfAborted();
    if (run.active)
      payload.agent.steer(
        createUserMessage({
          content: [textBlock(completionMessage(role, { ...report, gaps }, reasons, run.request))],
          source: {
            kind: 'orb-research-review',
            form: 'notice',
            summary: 'Checking unfinished research before ending the turn.',
          },
        } as any),
      );
  }

  onAgentStatus(sessionId: string, status: 'idle' | 'running'): void {
    // Sessions are known once their canvas was opened here (root and canvas.json children) or delegated to.
    const known = this.canvasOfSession.get(sessionId);
    if (!known) return;
    const { canvasId, agent } = known;
    // While a stop is in flight the stream reads `stopping` until the outcome is published.
    if (this.stopping.has(canvasId)) return;
    // A paused agent reads `paused` until Resume (a step it tries meanwhile is rejected at once).
    if (this.paused.has(pauseKey(canvasId, agent))) return;
    const last = this.last(canvasId, agent);
    // `stopped` already means idle; a late idle transition adds nothing.
    if (status === 'idle' && last?.state === 'stopped') return;
    // After a stop, the agent reads `running` again only once a step really starts (`onPreStep`): the harness also
    // flips running → idle for a turn whose first step Orb rejects (a kept settlement notice, P3.7).
    if (status === 'running' && (last?.state === 'stopped' || last?.state === 'stop-timeout')) return;
    this.publishHarnessState(canvasId, agent, sessionId, status);
  }

  /** Publish a harness running/idle transition of a canvas agent (children keep their cursor and label). */
  private publishHarnessState(
    canvasId: string,
    agent: AgentName,
    sessionId: string,
    status: 'idle' | 'running',
  ): void {
    const last = this.last(canvasId, agent);
    if (agent === 'orb') {
      this.publish(canvasId, { agent: 'orb', state: status, sessionId });
      return;
    }
    // A child keeps its cursor (frame) and label across running/idle; idle reads "Idle" until its next report.
    this.publish(canvasId, {
      agent,
      state: status,
      sessionId,
      ...(last?.frameId !== undefined ? { frameId: last.frameId } : {}),
      ...(status === 'idle'
        ? { label: 'Idle' }
        : last?.label && last.state !== 'stopped' && last.state !== 'stop-timeout' && last.state !== 'idle'
          ? { label: last.label }
          : { label: 'Working' }),
    });
  }

  private last(canvasId: string, agent: AgentName): AgentStatus | undefined {
    return this.lastStatus.get(canvasId)?.get(agent);
  }

  private publish(canvasId: string, status: AgentStatus): void {
    const stamped: AgentStatus = {
      ...(status.sessionId && status.state === 'idle' && this.failures.has(status.sessionId)
        ? { failure: this.failures.get(status.sessionId) }
        : {}),
      ...status,
      ...(status.agent === 'orb' && this.coverage.has(canvasId)
        ? { research: this.coverage.get(canvasId)! }
        : {}),
      at: Date.now(),
    };
    let perAgent = this.lastStatus.get(canvasId);
    if (!perAgent) this.lastStatus.set(canvasId, (perAgent = new Map()));
    perAgent.set(stamped.agent, stamped);
    for (const listener of [...(this.statusListeners.get(canvasId) ?? [])]) listener(stamped);
  }

  /** The canvas's root agent state now (from the live agent when there is no published state yet). */
  private refreshCoverage(canvasId: string): void {
    if (this.coverageRefreshes.has(canvasId)) return;
    const pending = Promise.resolve()
      .then(async () => {
        const meta = await this.canvas.open(canvasId);
        const report = reviewResearch((await this.canvas.board(canvasId)).current, meta, {
          detailed: this.researchRuns.get(canvasId)?.detailed,
        });
        if (this.researchRuns.get(canvasId)?.active) report.state = 'working';
        this.coverage.set(canvasId, report);
        const last = this.last(canvasId, 'orb');
        if (last) this.publish(canvasId, last);
      })
      .catch((error) => this.log(`coverage refresh: ${String(error)}`))
      .finally(() => this.coverageRefreshes.delete(canvasId));
    this.coverageRefreshes.set(canvasId, pending);
  }

  async statusOf(canvasId: string): Promise<AgentStatus> {
    const meta = await this.canvas.open(canvasId);
    if (specOf(meta.template) || this.coverage.has(canvasId)) {
      const report = reviewResearch((await this.canvas.board(canvasId)).current, meta, {
        detailed: this.researchRuns.get(canvasId)?.detailed,
      });
      if (this.researchRuns.get(canvasId)?.active) report.state = 'working';
      this.coverage.set(canvasId, report);
    }
    const last = this.last(canvasId, 'orb');
    if (last)
      return { ...last, ...(this.coverage.has(canvasId) ? { research: this.coverage.get(canvasId)! } : {}) };
    const sessionId = meta.rootSessionId ?? undefined;
    const live = sessionId ? (this.ctx.agents.get(sessionId) as AgentLike | undefined) : undefined;
    return {
      agent: 'orb',
      state: live?.status ?? 'idle',
      ...(this.coverage.has(canvasId) ? { research: this.coverage.get(canvasId)! } : {}),
      ...(sessionId ? { sessionId } : {}),
      at: Date.now(),
    };
  }

  /**
   * Every agent's state now (Orb first, then each child with a published state), then every published change,
   * until `signal` aborts.
   */
  async *followStatus(canvasId: string, signal: AbortSignal): AsyncGenerator<AgentStatus> {
    const queue: AgentStatus[] = [];
    let wake: (() => void) | undefined;
    const listener: StatusListener = (status) => {
      queue.push(status);
      wake?.();
    };
    let listeners = this.statusListeners.get(canvasId);
    if (!listeners) this.statusListeners.set(canvasId, (listeners = new Set()));
    listeners.add(listener);
    const onAbort = () => wake?.();
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      const first = await this.statusOf(canvasId);
      const children = CHILD_AGENTS.flatMap((agent) => {
        const last = this.last(canvasId, agent);
        return last ? [last] : [];
      });
      // Anything published while statusOf awaited is newer than the snapshot of that agent.
      for (const status of [first, ...children])
        if (!queue.some((q) => q.agent === status.agent)) yield status;
      while (!signal.aborted) {
        if (!queue.length) {
          await new Promise<void>((resolve) => (wake = resolve));
          wake = undefined;
          continue;
        }
        yield queue.shift()!;
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
      listeners.delete(listener);
      if (!listeners.size) this.statusListeners.delete(canvasId);
    }
  }

  // ---- Team (P3.4) ----

  /**
   * The calling agent of a team tool, from the exec context only (never from model arguments): its canvas (the
   * session's cwd is the canvas folder) and its role there (canvas.json: root → orb, `childAgentIds` → child).
   */
  private async callerOf(
    exec: TeamToolExec,
  ): Promise<{ agent: AgentLike; meta: CanvasMeta; role: AgentName }> {
    const agent = exec.agent;
    if (!agent) throw new CanvasError('orb/invalid-args', 'team tools only run for an agent');
    const canvasId = this.canvas.canvasIdOfDir(agent.session?.header?.cwd);
    if (!canvasId) throw new CanvasError('orb/not-found', 'this agent is not attached to a canvas');
    const meta = await this.canvas.open(canvasId);
    let role: AgentName | undefined;
    if (meta.rootSessionId === agent.id) role = 'orb';
    else
      for (const [r, id] of Object.entries(meta.childAgentIds))
        if (id === agent.id && isChildAgent(r)) role = r;
    if (!role) throw new CanvasError('orb/forbidden', 'this agent is not one of the canvas agents');
    this.noteSessions(meta);
    return { agent, meta, role };
  }

  private requireRole(role: AgentName, allowed: 'orb' | 'child', tool: string): void {
    if (allowed === 'orb' ? role !== 'orb' : role === 'orb')
      throw new CanvasError('orb/forbidden', `${tool} is not available to the ${role} agent`);
  }

  /** The canvas frames named by `frameIds`, with their board numbers; an unknown id is an error. */
  private async framesOf(canvasId: string, frameIds: readonly string[]) {
    const frames = boardFrames((await this.canvas.board(canvasId)).current);
    return [...new Set(frameIds)].map((id) => {
      const index = frames.findIndex((f) => f.id === id);
      if (index < 0) throw new CanvasError('orb/not-found', `no frame ${id} on this board (see query_board)`);
      return { id, number: index + 1, title: frames[index]!.title };
    });
  }

  /**
   * `delegate({role, frameIds, instruction})` (Orb): the first time for a role, start the child with
   * `ctx.subagents.startContinuable` (persona, `toolFilter.allow` = the role's allow-list, `agentOptions` = the role's
   * orb.json model), its id written to canvas.json first; afterwards send the existing child the new assignment.
   * One delegation per canvas and role at a time, so a role never gets two children.
   */
  delegate(exec: TeamToolExec, rawArgs: unknown): Promise<DelegateResult> {
    return (async () => {
      const args = parseArgs(DelegateArgs, rawArgs);
      exec.signal.throwIfAborted();
      const { agent: orb, meta, role } = await this.callerOf(exec);
      this.requireRole(role, 'orb', 'delegate');
      const key = `${meta.id}:${args.role}`;
      const previous = this.delegating.get(key) ?? Promise.resolve();
      const run = previous.catch(() => undefined).then(() => this.delegateOnce(exec, orb, meta.id, args));
      this.delegating.set(key, run);
      void run
        .finally(() => {
          if (this.delegating.get(key) === run) this.delegating.delete(key);
        })
        .catch(() => undefined);
      return run;
    })();
  }

  private async delegateOnce(
    exec: TeamToolExec,
    orb: AgentLike,
    canvasId: string,
    args: z.infer<typeof DelegateArgs>,
  ): Promise<DelegateResult> {
    exec.signal.throwIfAborted();
    const meta = await this.canvas.open(canvasId);
    const frames = await this.framesOf(canvasId, args.frameIds);
    const research = this.researchRuns.get(canvasId);
    const existing = meta.childAgentIds[args.role];
    const assigned = research?.assignments.get(args.role);
    if (
      research?.active &&
      existing &&
      this.ctx.agents.get(existing)?.status === 'running' &&
      assigned?.length &&
      args.frameIds.every((id) => assigned.includes(id)) &&
      !this.isPaused(canvasId, args.role)
    )
      return {
        agent: args.role,
        agentId: existing,
        started: false,
        working: true,
        frames: frames.map((f) => `${String(f.number).padStart(2, '0')} ${f.title}`),
        message:
          'This agent is already working on these frames. The assignment was not repeated. Do independent synthesis or end this pass; completion wakes you. Use message_agent only for a substantive correction or new evidence.',
      };
    if (research?.active) {
      // Coverage from an older evidence version cannot satisfy a fresh review of only one frame.
      const previousFrames =
        args.role !== 'scout' && research.reviewed.get(args.role) !== research.evidenceVersion
          ? []
          : (research.assignments.get(args.role) ?? []);
      research.assignments.set(args.role, [...new Set([...previousFrames, ...args.frameIds])]);
      if (args.role !== 'scout') research.reviewed.set(args.role, research.evidenceVersion);
    }
    const label = AGENT_LABELS[args.role];
    if (existing) this.childResearchActivity.set(existing, Date.now());
    let delivered = false;
    const frameNames = frames.map((f) => `${String(f.number).padStart(2, '0')} ${f.title}`);
    const rememberAssignment = () => {
      const previous = this.currentAssignments.get(canvasId)?.get(args.role);
      // A full review can be delivered in batches of twelve while the same child is running.
      const sameTask =
        existing &&
        this.ctx.agents.get(existing)?.status === 'running' &&
        previous?.baseInstruction === args.instruction;
      const frames = sameTask ? [...new Set([...previous.frameIds, ...args.frameIds])] : args.frameIds;
      return this.setCurrentAssignment(
        canvasId,
        args.role,
        frames,
        sameTask ? previous.instruction : args.instruction,
        args.instruction,
      );
    };
    const pause = existing ? this.paused.get(pauseKey(canvasId, args.role)) : undefined;
    if (existing && pause) {
      rememberAssignment();
      // P3.7: a paused child gets the assignment on Resume, not now.
      pause.held.push({
        kind: 'text',
        text: assignmentMessage(args.role, frames, args.instruction, false, meta),
      });
      this.log(`delegate canvas ${canvasId}: ${args.role} is paused; assignment queued`);
      return { agent: args.role, agentId: existing, started: false, queued: true, frames: frameNames };
    }
    if (existing) {
      // The child exists: a new assignment is a message (it cold-resumes from its session when not resident).
      this.canvasOfSession.set(existing, { canvasId, agent: args.role });
      this.quiet.delete(existing);
      delivered = true;
      const restoreAssignment = rememberAssignment();
      try {
        await this.subagents.sendMessage(
          orb,
          existing,
          [textBlock(assignmentMessage(args.role, frames, args.instruction, false, meta))],
          { signal: exec.signal },
        );
      } catch (err) {
        restoreAssignment();
        // A canvas.json child id whose session cannot be continued (the app quit between recording the id and the
        // child's first save, or the session belongs to an earlier root): forget it and start a fresh child instead
        // of failing every later delegate to this role (HARNESS_NOTES §P3.4 "stale child id").
        if (exec.signal.aborted || !isStaleChildError(err)) throw err;
        delivered = false;
        this.canvasOfSession.delete(existing);
        await this.canvas.unsetChildAgent(canvasId, args.role, existing);
        this.log(
          `delegate canvas ${canvasId}: ${args.role} ${existing} cannot be continued; starting a new one`,
        );
      }
    }
    if (existing && delivered) {
      this.publish(canvasId, {
        agent: args.role,
        state: 'running',
        label: `New assignment: ${frames[0]!.title}`.slice(0, 80),
        frameId: frames[0]!.id,
        sessionId: existing,
      });
      this.log(`delegate canvas ${canvasId}: new assignment for ${args.role} ${existing}`);
      return { agent: args.role, agentId: existing, started: false, frames: frameNames };
    }

    // Choose the child id up front and record it BEFORE the first turn: the board tools and the allow-list guard
    // resolve the caller's role from canvas.json by session id (HARNESS_NOTES §P3.1).
    const childId = `${args.role}-${randomUUID()}`;
    this.childResearchActivity.set(childId, Date.now());
    await this.canvas.setChildAgent(canvasId, args.role, childId);
    this.canvasOfSession.set(childId, { canvasId, agent: args.role });
    const restoreAssignment = rememberAssignment();
    try {
      const agentOptions = await this.modelFor(args.role);
      await this.subagents.startContinuable({
        provider: SUBAGENT_PROVIDER,
        label: `${label}: ${args.instruction}`.slice(0, 120),
        childId,
        request: {
          prompt: [textBlock(assignmentMessage(args.role, frames, args.instruction, true, meta))],
          parent: orb,
          persona: CHILD_PERSONAS[args.role],
          toolFilter: { allow: childToolAllow(args.role) },
          agentOptions,
        },
        signal: exec.signal,
      });
    } catch (err) {
      restoreAssignment();
      this.canvasOfSession.delete(childId);
      await this.canvas.unsetChildAgent(canvasId, args.role, childId).catch(() => undefined);
      throw err;
    }
    this.publish(canvasId, {
      agent: args.role,
      state: 'running',
      label: `Starting: ${frames[0]!.title}`.slice(0, 80),
      frameId: frames[0]!.id,
      sessionId: childId,
    });
    this.log(`delegate canvas ${canvasId}: started ${args.role} ${childId}`);
    return { agent: args.role, agentId: childId, started: true, frames: frameNames };
  }

  /** The id of a canvas's child of `role`, or a tool error naming `delegate`. */
  private childIdOf(meta: CanvasMeta, role: ChildAgentName): string {
    const id = meta.childAgentIds[role];
    if (!id)
      throw new CanvasError('orb/not-found', `${AGENT_LABELS[role]} has not been started; use delegate`);
    return id;
  }

  /** `message_agent({agent, message})` (Orb): redirect one child; it gets the message at its next step. */
  async messageAgent(
    exec: TeamToolExec,
    rawArgs: unknown,
  ): Promise<{ agent: ChildAgentName; agentId: string; delivered: boolean; queued?: true }> {
    const args = parseArgs(MessageAgentArgs, rawArgs);
    exec.signal.throwIfAborted();
    const { agent: orb, meta, role } = await this.callerOf(exec);
    this.requireRole(role, 'orb', 'message_agent');
    const childId = this.childIdOf(meta, args.agent);
    exec.signal.throwIfAborted();
    const restoreAssignment = this.preserveChildDirection(meta.id, args.agent, `orb: ${args.message}`);
    // P3.7: a paused child gets the message on Resume.
    const pause = this.paused.get(pauseKey(meta.id, args.agent));
    if (pause) {
      pause.held.push({ kind: 'text', text: `orb: ${args.message}` });
      return { agent: args.agent, agentId: childId, delivered: false, queued: true };
    }
    this.quiet.delete(childId);
    try {
      await this.subagents.sendMessage(orb, childId, [textBlock(`orb: ${args.message}`)], {
        signal: exec.signal,
      });
    } catch (error) {
      restoreAssignment();
      throw error;
    }
    return { agent: args.agent, agentId: childId, delivered: true };
  }

  /**
   * `stop_agent({agent})` (Orb): interrupt one child (`ctx.subagents.interrupt` with Orb as the ancestor authority:
   * its unclaimed inbox is kept, so a later message continues it), then wait up to STOP_TIMEOUT_MS for it to be idle.
   */
  async stopAgent(
    exec: TeamToolExec,
    rawArgs: unknown,
  ): Promise<{ agent: ChildAgentName; agentId: string; stopped: boolean; working?: true; message?: string }> {
    const args = parseArgs(StopAgentArgs, rawArgs);
    exec.signal.throwIfAborted();
    const { agent: orb, meta, role } = await this.callerOf(exec);
    this.requireRole(role, 'orb', 'stop_agent');
    const childId = this.childIdOf(meta, args.agent);
    exec.signal.throwIfAborted();
    const live = this.ctx.agents.get(childId) as AgentLike | undefined;
    const run = this.researchRuns.get(meta.id);
    // A supervisor polling an empty table must not cancel the researcher that is actively finding its rows.
    // Human Stop/Pause uses the direct controls above, bypassing this model-only safeguard immediately.
    if (
      run?.active &&
      run.allowTeam &&
      !this.researchRequests.get(meta.id)?.control &&
      live?.status === 'running' &&
      Date.now() - (this.childResearchActivity.get(childId) ?? 0) < 90_000
    ) {
      return {
        agent: args.agent,
        agentId: childId,
        stopped: false,
        working: true,
        message:
          'This agent is actively researching. Let it finish its current batch; lack of rows during source gathering is not a blocker. Do independent synthesis or end this pass with a progress update; its completion will wake you. Redirect only if the assignment is wrong.',
      };
    }
    // An explicitly stopped role is no longer an outstanding review assignment.
    run?.assignments.delete(args.agent);
    // Stopping clears what a pause held (P3.7).
    this.paused.delete(pauseKey(meta.id, args.agent));
    this.subagents.interrupt(childId, { kind: 'ancestor', agent: orb });
    let stopped = true;
    if (live) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;
      stopped = await Promise.race([
        live.whenIdle().then(
          () => true,
          () => true,
        ),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), STOP_TIMEOUT_MS);
          onAbort = () => resolve(false);
          exec.signal.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
      clearTimeout(timer);
      if (onAbort) exec.signal.removeEventListener('abort', onAbort);
      exec.signal.throwIfAborted();
    }
    this.publish(meta.id, {
      ...this.last(meta.id, args.agent),
      agent: args.agent,
      state: stopped ? 'stopped' : 'stop-timeout',
      label: 'Stopped by orb',
      sessionId: childId,
    });
    return { agent: args.agent, agentId: childId, stopped };
  }

  /**
   * `report_progress({status, frameId?})` (children): the child's cursor moves to the frame and its label changes on
   * `agents.status`, and Orb gets a one-line note in its context through `inject()`, which never wakes it.
   */
  async reportProgress(exec: TeamToolExec, rawArgs: unknown): Promise<{ ok: true }> {
    const args = parseArgs(ReportProgressArgs, rawArgs);
    exec.signal.throwIfAborted();
    const { agent: child, meta, role } = await this.callerOf(exec);
    this.requireRole(role, 'child', 'report_progress');
    const frame = args.frameId ? (await this.framesOf(meta.id, [args.frameId]))[0] : undefined;
    exec.signal.throwIfAborted();
    const last = this.last(meta.id, role);
    this.publish(meta.id, {
      agent: role,
      state: 'running',
      label: args.status,
      frameId: frame ? frame.id : (last?.frameId ?? null),
      sessionId: child.id,
    });
    const root = meta.rootSessionId
      ? (this.ctx.agents.get(meta.rootSessionId) as AgentLike | undefined)
      : undefined;
    const where = frame ? ` (frame ${String(frame.number).padStart(2, '0')} "${frame.title}")` : '';
    root?.inject?.(
      createUserMessage({
        content: [textBlock(`[${AGENT_LABELS[role]} progress] ${args.status}${where}`)],
        // The harness's own source for a message between adjacent agents (dsh-subagent continuation-messages).
        source: { kind: 'agent-message', form: 'relay', senderSessionId: child.id },
      } as any),
    );
    return { ok: true };
  }

  /** `send_message({about, message})` (children): tell Orb the work is done or a decision is needed; wakes Orb. */
  async messageOrb(exec: TeamToolExec, rawArgs: unknown): Promise<{ delivered: boolean; queued?: true }> {
    const args = parseArgs(SendMessageArgs, rawArgs);
    exec.signal.throwIfAborted();
    const { agent: child, meta, role } = await this.callerOf(exec);
    this.requireRole(role, 'child', 'send_message');
    if (!meta.rootSessionId) throw new CanvasError('orb/not-found', 'this canvas has no orb agent');
    exec.signal.throwIfAborted();
    const what = args.about === 'done' ? 'done' : 'needs a decision';
    // P3.7: a paused Orb gets the message on Resume, without being woken now.
    const pause = this.paused.get(pauseKey(meta.id, 'orb'));
    if (pause) {
      pause.held.push({
        kind: 'steer',
        message: createUserMessage({
          content: [textBlock(`${AGENT_LABELS[role]} (${what}): ${args.message}`)],
          source: { kind: 'agent-message', form: 'relay', senderSessionId: child.id },
        } as any),
      });
      return { delivered: false, queued: true };
    }
    await this.subagents.sendMessage(
      child,
      meta.rootSessionId,
      [textBlock(`${AGENT_LABELS[role]} (${what}): ${args.message}`)],
      { signal: exec.signal },
    );
    return { delivered: true };
  }

  /** Dispose every agent this service created or resumed. */
  async close(): Promise<void> {
    for (const run of this.researchRuns.values()) run.active = false;
    const handles = [...this.handles.values()];
    this.handles.clear();
    await Promise.allSettled(handles.map((h) => h.dispose()));
    await Promise.allSettled([...this.coverageRefreshes.values()]);
    await Promise.allSettled([...this.researchSaves.values()]);
  }
}

export function apply(ctx: any) {
  const agents = new OrbAgents(ctx);
  ctx.effect(() => () => agents.close(), 'orb-agents: dispose root agents');
  ctx.on('agent/status', ({ agent, status }: { agent: { id: string }; status: 'idle' | 'running' }) =>
    agents.onAgentStatus(agent.id, status),
  );
  // P3.6 threads: follow the root sessions' turns (session events are emitted in the agents' scopes).
  ctx.on(
    'session/event',
    (session: { id: string }, event: { type: string; data: unknown }) =>
      agents.onSessionEvent(session.id, event),
    { global: true },
  );
  // P3.7: hold paused agents and keep settlement notices of user-stopped children out of Orb's turns. A row-level
  // listener sees every agent's steps (the session controller rejects archived sessions' steps the same way).
  ctx.on('agent/pre-step', (payload: PreStepPayload, next: () => Promise<PreStepDecision>) =>
    agents.onPreStep(payload, next),
  );
  ctx.on(
    'system-prompt/assemble',
    (_assembly: unknown, context: { agent?: { id: string } }, next: () => Promise<unknown>) =>
      agents.onPromptAssembly(context, next),
  );
  ctx.on(
    'agent/request',
    (payload: { agent: { id: string }; signal?: AbortSignal }, next: () => Promise<unknown>) =>
      agents.onAgentRequest(payload, next),
  );
  ctx.on('tools/post-execute', (exec: unknown, result: unknown, next: () => Promise<unknown>) =>
    agents.onResearchTool(exec, result, next),
  );
  ctx.on('tools/pre-execute', (exec: unknown, next: () => Promise<unknown>) =>
    agents.onResearchPreTool(exec, next),
  );
  // dsh 0.2.0-rc.2 awaits this boundary and re-reads steering before closing the turn.
  ctx.on('agent/turn-stopping', (payload: { agent: AgentLike; signal: AbortSignal }) =>
    agents.onTurnStopping(payload),
  );
  ctx.provide(ORB_AGENTS_SERVICE, agents);
}
