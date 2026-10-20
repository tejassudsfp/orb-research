import { z } from 'zod';
import { AgentName, Arrangement, BoardEvent, Card, Frame, FrameColor, Link, ThreadMessage } from './board.js';
import { Depth, IntakeAnswersSchema, TemplateId } from './templates/schema.js';
import { CustomProvider, ProviderTestStatus, SavedModelCatalog } from './models.js';
import { CostTile, PriceTable } from './cost.js';
import { ResearchCoverage } from './research.js';
import { AppearanceSchema, AppearancePatch, DEFAULT_APPEARANCE } from './appearance/index.js';

/** orb-host Remote namespace (BUILD_PLAN §2.3). */
export const ORB_NAMESPACE = 'orb';

export const CanvasId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,127}$/);

/**
 * What a canvas was seeded with on Home (P2.6, PRD Scenario B): a dropped file, a link or text. The seed CARD is added
 * by the UI through the asset routes and `board.command` once the canvas exists (an upload needs the canvas folder);
 * canvas.json keeps this description so the agents (Phase 3) know the canvas starts from material.
 */
export const CanvasSeed = z.object({
  kind: z.enum(['file', 'url', 'text']),
  /** File name, URL or the first line of the text. */
  name: z.string().trim().min(1).max(300),
  /** Items in the drop (the first one is described). */
  count: z.number().int().positive().max(50).default(1),
});
export type CanvasSeed = z.infer<typeof CanvasSeed>;

export const CanvasCreateArgs = z.object({
  prompt: z.string().min(1).max(4000),
  /** P2.6: prefill the template's frames and keep its agent brief. */
  template: TemplateId.optional(),
  /** P6.11: the intake form's answers of a v2 template (validated by the canvas service against its inputs). */
  intake: IntakeAnswersSchema.optional(),
  /** P6.11: the depth tier (a v2 template's cost guard); default standard. */
  depth: Depth.optional(),
  seed: CanvasSeed.optional(),
  /**
   * P3.3: start the canvas's root Orb agent on it at once (the new-canvas turn: Orb proposes 3–5 frames with
   * add_frame and starts Scout and Critic unless the prompt says otherwise; a seeded canvas asks what the user wants
   * to understand first). Home sets it; scripted callers (tests, the egress audit) leave it off and prompt Orb
   * themselves.
   */
  start: z.boolean().optional(),
});
export type CanvasCreateArgs = z.input<typeof CanvasCreateArgs>;

/** `orb/canvas.rename` request (P2.1: the title pill's inline edit). Leading/trailing space is dropped. */
export const CanvasRenameArgs = z.object({
  title: z.string().trim().min(1).max(200),
});
export type CanvasRenameArgs = z.infer<typeof CanvasRenameArgs>;

/**
 * P6.20: the camera a canvas was last left at (canvas.json `camera`): the world point at the top-left of the screen
 * and the zoom, so reopening restores where the user was. Not board state (it is never in board.jsonl).
 */
export const CanvasCamera = z.object({
  panX: z.number().finite(),
  panY: z.number().finite(),
  zoom: z.number().min(0.05).max(2.5),
});
export type CanvasCamera = z.infer<typeof CanvasCamera>;

/** `orb/canvas.camera` request: remember the camera of a canvas. */
export const CanvasCameraArgs = z.object({ camera: CanvasCamera });
export type CanvasCameraArgs = z.infer<typeof CanvasCameraArgs>;

export const CanvasMeta = z.object({
  id: CanvasId,
  title: z.string(),
  created: z.number(),
  rootSessionId: z.string().nullable(),
  childAgentIds: z.record(z.string(), z.string()).default({}),
  /** P2.6: the Home template it was started from, and that template's agent brief. */
  template: TemplateId.optional(),
  brief: z.string().max(4000).optional(),
  /** P6.11: the intake answers and depth tier of a v2 template (the agents' playbook is built from them). */
  intake: IntakeAnswersSchema.optional(),
  depth: Depth.optional(),
  /** P2.6: what it was seeded with (Scenario B). */
  seed: CanvasSeed.optional(),
  /** P6.20: where the user left the camera (absent until they moved it: the canvas then opens fitted to its content). */
  camera: CanvasCamera.optional(),
});
export type CanvasMeta = z.infer<typeof CanvasMeta>;

/** One frame of a Home tile's mini preview, in board coordinates. */
export const PreviewFrame = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  color: FrameColor,
});

/** A Home tile (P2.6): canvas.json plus a mini preview of the board and the agents' status. */
export const CanvasSummary = CanvasMeta.extend({
  preview: z.object({
    frames: z.array(PreviewFrame).max(64),
    /** Card rectangles (at most 200) for the preview when there are no frames. */
    cards: z.array(z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })).max(200),
    cardCount: z.number().int().nonnegative(),
    /** Last event time (ms), or `created` for an empty board. */
    updated: z.number(),
  }),
  status: z.object({
    /** Agents of this canvas working now. */
    working: z.number().int().nonnegative(),
    /** "Idle", "1 agent working", "3 agents working". */
    label: z.string(),
  }),
  /** P4.3: the canvas's token and estimated cost total (absent when it could not be read). */
  cost: CostTile.optional(),
});
export type CanvasSummary = z.infer<typeof CanvasSummary>;

/** `orb/canvas.list` value: every canvas, most recently updated first (P2.6; P1.9 sorted by `created`). */
export const CanvasList = z.array(CanvasSummary);

// ---- orb/canvas.search (P2.6) ----
//   orb/canvas.search {request: CanvasSearchArgs}
// Full-text search across every canvas (index.sqlite, FTS5), kept up to date by orb-canvas and rebuilt when missing.

export const CanvasSearchArgs = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(100).default(30),
});
export type CanvasSearchArgs = z.input<typeof CanvasSearchArgs>;

/** Marks around the matched terms of a `snippet` (private-use characters, never in board text). */
export const SEARCH_MARK_OPEN = '\uE000';
export const SEARCH_MARK_CLOSE = '\uE001';

export const SearchHit = z.object({
  canvasId: CanvasId,
  canvasTitle: z.string(),
  kind: z.enum(['card', 'frame', 'canvas']),
  /** Card or frame id (`c_…`/`f_…`), or the canvas id for a title match. */
  itemId: z.string(),
  cardType: z.string().optional(),
  title: z.string(),
  /** Matched text with the terms between SEARCH_MARK_OPEN and SEARCH_MARK_CLOSE. */
  snippet: z.string(),
});
export type SearchHit = z.infer<typeof SearchHit>;

export const CanvasSearchResult = z.object({
  hits: z.array(SearchHit),
  /** True when this search had to (re)build index.sqlite first. */
  rebuilt: z.boolean(),
});
export type CanvasSearchResult = z.infer<typeof CanvasSearchResult>;

// ---- orb/settings.get + orb/settings.set (P2.6) ----
//   orb/settings.get {}
//   orb/settings.set {request: OrbSettingsPatch}
// App settings in `<ORB_HOME>/orb.json` (no secrets, ever).

export const ThemeMode = z.enum(['night', 'day']);
export type ThemeMode = z.infer<typeof ThemeMode>;

/**
 * P5.3 Settings › Appearance: motion. `system` follows macOS Reduce Motion; `reduce` reduces motion in Orb whatever
 * the system says (the same effect: transitions and animations cut, flights instant, Home's topic rotation paused).
 */
export const MotionMode = z.enum(['system', 'reduce']);
export type MotionMode = z.infer<typeof MotionMode>;

/** A model route in orb.json: an `llm-pi-ai` provider id and one of its model ids (P3.3). */
export const ModelRouteSchema = z.strictObject({
  provider: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  model: z.string().trim().min(1).max(200),
});

/**
 * Per-agent model routes (P3.3; PRD Models › per-agent picker). A role without an entry uses the harness default
 * (`agent-default-model`, which the Orb profile sets to `DEFAULT_AGENT_MODEL`, openai/gpt-6-luna), so every agent
 * runs on GPT Luna 6 unless the user picks another model. A change applies the next time that agent starts.
 */
export const AgentModels = z
  .strictObject({
    orb: ModelRouteSchema,
    scout: ModelRouteSchema,
    critic: ModelRouteSchema,
    builder: ModelRouteSchema,
  })
  .partial();
export type AgentModels = z.infer<typeof AgentModels>;

export const OrbSettings = z.object({
  v: z.literal(1).default(1),
  theme: ThemeMode.default('night'),
  /** P6.27: style, accent and brightness are independent. `theme` is retained for older clients. */
  appearance: AppearanceSchema.default(DEFAULT_APPEARANCE),
  /** P5.3: motion reduction (`system` follows macOS). */
  motion: MotionMode.default('system'),
  models: AgentModels.default({}),
  /** P4.2: the user's custom providers (no keys; those live in the Keychain). Written by `orb/models.custom.*`. */
  customProviders: z.array(CustomProvider).max(32).default([]),
  /** P6.33: last successful provider model listings; no credentials. Restored offline and refreshed from Settings. */
  modelCatalogs: z.record(z.string(), SavedModelCatalog).default({}),
  /** P4.2: the first-run sheet was finished or skipped; it is not shown again. */
  firstRunDone: z.boolean().default(false),
  /** P4.3: the price table (`provider/model` → USD per 1M tokens), seeded from the pi-ai catalog, editable. */
  prices: PriceTable.default({}),
  /** P6.9: the last key test per provider (state, plain message, model, time; never a key), kept across restarts. */
  keyTests: z.record(z.string(), ProviderTestStatus).default({}),
});
export type OrbSettings = z.infer<typeof OrbSettings>;

/** A per-agent patch: a route sets the agent's model, `null` returns it to the default (P4.2 picker). */
export const AgentModelsPatch = z
  .strictObject({
    orb: ModelRouteSchema.nullable(),
    scout: ModelRouteSchema.nullable(),
    critic: ModelRouteSchema.nullable(),
    builder: ModelRouteSchema.nullable(),
  })
  .partial();
export type AgentModelsPatch = z.infer<typeof AgentModelsPatch>;

export const OrbSettingsPatch = z
  .object({
    theme: ThemeMode,
    appearance: AppearancePatch,
    motion: MotionMode,
    models: AgentModelsPatch,
    firstRunDone: z.boolean(),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: 'empty settings patch' });
export type OrbSettingsPatch = z.infer<typeof OrbSettingsPatch>;

export const AgentControlArgs = z
  .object({
    agent: z.union([AgentName, z.literal('all')]),
    action: z.enum(['pause', 'resume', 'stop', 'redirect']),
    /** `redirect` only: the user's new direction for the agent (Orb for `all`). */
    text: z.string().trim().min(1).max(4000).optional(),
  })
  .refine((a) => a.action !== 'redirect' || a.text !== undefined, {
    message: 'redirect needs text',
    path: ['text'],
  });
export type AgentControlArgs = z.infer<typeof AgentControlArgs>;

export const AgentRunState = z.enum(['idle', 'running', 'stopping', 'stopped', 'stop-timeout', 'paused']);
export type AgentRunState = z.infer<typeof AgentRunState>;

export const AgentStatus = z.object({
  agent: AgentName,
  state: AgentRunState,
  label: z.string().optional(),
  failure: z
    .object({
      code: z.string(),
      message: z.string(),
      provider: z.string().optional(),
      model: z.string().optional(),
      status: z.number().optional(),
      requestId: z.string().optional(),
    })
    .optional(),
  /** P6.21: actual frame coverage, including on a reopened, unfinished board. */
  research: ResearchCoverage.optional(),
  frameId: z.string().nullable().optional(),
  stopMs: z.number().optional(),
  /** Harness session id of the agent (P1.10). */
  sessionId: z.string().optional(),
  /** When the state was published, ms since epoch (P1.10). */
  at: z.number().optional(),
});
export type AgentStatus = z.infer<typeof AgentStatus>;

// ---- orb/agents.control + orb/agents.status (P1.10) ----
//   orb/agents.control {canvasId: CanvasId, request: AgentControlArgs}  (unary; stop P1.10/P3.6, pause/resume/redirect P3.7)
//   orb/agents.status  {canvasId: CanvasId}                             (stream of AgentStatus)
// Stop cancels the root agent with {kind:'user'} (and its live descendants with {kind:'parent'}), then waits for
// whenIdle() raced with STOP_TIMEOUT_MS. agents.status emits `stopping` at once, then `stopped` or `stop-timeout`.

/** How long `stop` waits for the agents to go idle before reporting `stop-timeout` (PRD: idle within 1 s). */
export const STOP_TIMEOUT_MS = 1_000;

export const AgentControlResult = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('stop'),
    state: z.enum(['stopped', 'stop-timeout']),
    /** Measured from the control call to every cancelled agent's whenIdle(), ms. */
    stopMs: z.number().nonnegative(),
    /** Live agents that were cancelled (root + descendants); 0 when the root agent was not live. */
    agents: z.number().int().nonnegative(),
  }),
  z.object({
    /** P3.7: the agent(s) halted with their queue kept, held until Resume. */
    action: z.literal('pause'),
    /** `paused` once every paused agent is idle; `pause-timeout` when one was still busy after STOP_TIMEOUT_MS. */
    state: z.enum(['paused', 'pause-timeout']),
    stopMs: z.number().nonnegative(),
    /** Agents marked paused (live or not). */
    agents: z.number().int().nonnegative(),
  }),
  z.object({
    /** P3.7: paused agents continued ("continue" plus everything queued while paused). */
    action: z.literal('resume'),
    state: z.literal('resumed'),
    /** Agents that were paused and are resumed now. */
    agents: z.number().int().nonnegative(),
    /** Messages delivered with the "continue" (queued while paused). */
    queued: z.number().int().nonnegative(),
  }),
  z.object({
    /** P3.7: a new direction for one agent (Orb: a steer; a child: a message). */
    action: z.literal('redirect'),
    /** `queued` when the agent is paused: it gets the message on Resume. */
    state: z.enum(['delivered', 'queued']),
    agents: z.number().int().nonnegative(),
  }),
]);
export type AgentControlResult = z.infer<typeof AgentControlResult>;

// ---- orb-host Remote endpoints (P1.6) ----
// Wire args are keyed by the Remote method's PARAMETER NAMES (SRC fallback, see packages/orb-host/src/remote.ts):
//   orb/ping          {}
//   orb/canvas.create {request: CanvasCreateArgs}
//   orb/canvas.open   {id: CanvasId}   (P1.9: also resumes the canvas's root agent)
//   orb/canvas.list   {}               (P1.9; P2.6 CanvasSummary tiles)
//   orb/canvas.search {request: CanvasSearchArgs}   (P2.6)
//   orb/settings.get  {}  orb/settings.set {request: OrbSettingsPatch}   (P2.6)
//   orb/canvas.rename {canvasId: CanvasId, request: CanvasRenameArgs}   (P2.1)
//   orb/canvas.camera {canvasId: CanvasId, request: CanvasCameraArgs}   (P6.20: the camera a canvas was left at)
//   orb/board.follow  {canvasId: CanvasId}   (stream)
//   orb/board.command {canvasId: CanvasId, command: BoardCommand}   (P1.7; P2.3 every user command + batch)

/** Business error codes thrown by orb-host (RemoteError `code`). */
export const OrbErrorCode = {
  invalidArgs: 'orb/invalid-args',
  notFound: 'orb/not-found',
  /** The actor may not do this (e.g. an agent editing or deleting a user note). */
  forbidden: 'orb/forbidden',
  /** The board log on disk is damaged beyond a torn tail (see orb-canvas BoardLog). */
  boardCorrupt: 'orb/board-corrupt',
  /** A valid request this build does not implement yet (e.g. agents.control pause/resume/redirect in Phase 1). */
  unsupported: 'orb/unsupported',
  /** An upload above its type's size cap (P2.5 assets). */
  tooLarge: 'orb/too-large',
  /** An upload whose type Orb does not accept, or whose bytes do not match the declared type (P2.5 assets). */
  unsupportedType: 'orb/unsupported-type',
  /** An agent placed a card in a frame that already holds its budget of cards (P3.2 `FRAME_FULL`). */
  frameFull: 'orb/frame-full',
  /** P4.1: the key is supplied read-only by the launch environment, so keys.set/unset would have no effect. */
  keyShadowed: 'orb/key-shadowed',
  /** P4.5: the research document changed since the edits were made (`port.saveDoc` names an older version). */
  conflict: 'orb/conflict',
  /** P4.5: a compose or regenerate is already running for this canvas, or Orb is paused. */
  busy: 'orb/busy',
  /** P4.5: Orb's compose or regenerate turn ended without writing what was asked. */
  composeFailed: 'orb/compose-failed',
} as const;

export const OrbPingValue = z.object({
  ok: z.literal(true),
  service: z.literal('orb-host'),
  version: z.string(),
  now: z.number(),
});
export type OrbPingValue = z.infer<typeof OrbPingValue>;

export const BoardSnapshotFrame = z.object({
  kind: z.literal('snapshot'),
  canvasId: CanvasId,
  /** seq of the next event; events with a lower seq are folded into this snapshot. */
  nextSeq: z.number().int().nonnegative(),
  cards: z.array(Card),
  /** Frames in insertion order (P2.2). */
  frames: z.array(Frame),
  /** Links in insertion order (P2.3). */
  links: z.array(Link),
  /** P3.6: thread messages per card or frame id (absent when the board has none). */
  threads: z.record(z.string(), z.array(ThreadMessage)).optional(),
  /** P6.8: the newest agent rearrangements (absent when there are none). */
  arrangements: z.array(Arrangement).optional(),
});
export type BoardSnapshotFrame = z.infer<typeof BoardSnapshotFrame>;

export const BoardEventFrame = z.object({
  kind: z.literal('event'),
  event: BoardEvent,
  /**
   * The `pendingId` of the command that wrote this event, when it had one (not persisted: only on the stream).
   * `final` marks the command's last event, so a client drops its optimistic copy only once all of them arrived.
   */
  pendingId: z.string().optional(),
  final: z.boolean().optional(),
});
export type BoardEventFrame = z.infer<typeof BoardEventFrame>;

/** One `orb/board.follow` stream item: a snapshot first, then events. */
export const BoardFollowFrame = z.discriminatedUnion('kind', [BoardSnapshotFrame, BoardEventFrame]);
export type BoardFollowFrame = z.infer<typeof BoardFollowFrame>;

// ---- orb/board.command (P1.7; P2.3: every user command, see commands.ts) ----

/** How many user actions can be undone and redone on this canvas in this app session (P2.4). */
export const BoardHistoryDepth = z.object({
  undo: z.number().int().nonnegative(),
  redo: z.number().int().nonnegative(),
});
export type BoardHistoryDepth = z.infer<typeof BoardHistoryDepth>;

/**
 * The events a command wrote, in order (`event` is the last one; a batch writes several). An undo or redo with
 * nothing to do writes none (`events: []`, no `event`). `history` is the stack depth after the command.
 */
export const BoardCommandResult = z.object({
  event: BoardEvent.optional(),
  events: z.array(BoardEvent),
  history: BoardHistoryDepth.optional(),
});
export type BoardCommandResult = z.infer<typeof BoardCommandResult>;

// ---- orb/chat.send (P1.8) ----
//   orb/chat.send {canvasId: CanvasId, request: ChatSendArgs}
// Queues the text as a user turn for the canvas's root Orb agent (agent.followup). The reply arrives on the
// harness session stream (`session/follow` of `rootSessionId`); board changes arrive on `orb/board.follow`.

/**
 * What the user has in context for a message (P3.3; PRD Chat › context chip and @ mentions): frames and cards whose
 * `describe()` text is injected with the message.
 */
/** P6.1: the most cards one message can carry as attachments (the composer holds no more). */
export const MAX_ATTACHMENTS = 20;

export const ChatContext = z.strictObject({
  frameIds: z.array(z.string().startsWith('f_').max(64)).max(20).optional(),
  cardIds: z.array(z.string().startsWith('c_').max(64)).max(50).optional(),
  /**
   * P6.1: cards the user attached to this message from the composer (paperclip, paste or drop on the chat panel):
   * files ingested onto the board a moment ago. Injected like context cards, in their own "Attached" block first.
   */
  attachmentIds: z.array(z.string().startsWith('c_').max(64)).max(MAX_ATTACHMENTS).optional(),
});
export type ChatContext = z.infer<typeof ChatContext>;

/**
 * P6.1: the header of the `<board-context>` block listing the cards attached to a message (orb-canvas context.ts
 * writes it; the UI reads a sent message's attachment chips back from its `- [c_…] <type> "<title>" (by …` lines).
 */
export const ATTACHED_HEADER =
  'Attached with this message (files the user just added to the board for you; read these first):';

export const ChatSendArgs = z.object({
  text: z.string().min(1).max(20_000),
  context: ChatContext.optional(),
  /** The card or frame whose thread this message belongs to: its content is injected (PRD Threads › Grounding). */
  threadOf: z
    .string()
    .regex(/^[cf]_/)
    .max(64)
    .optional(),
});
export type ChatSendArgs = z.infer<typeof ChatSendArgs>;

export const ChatSendResult = z.object({ accepted: z.literal(true), sessionId: z.string() });
export type ChatSendResult = z.infer<typeof ChatSendResult>;
