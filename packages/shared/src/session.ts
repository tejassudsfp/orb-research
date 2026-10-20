/**
 * zod schemas for the harness `session` Remote namespace as Orb uses it over the gateway wire (BUILD_PLAN §2.3,
 * "Harness gateway, existing endpoints"). Shapes follow
 * `@deepseek-ai/dsh-api-session-controller/lib/types/types.d.ts` (SessionCreateRequest … SessionFollowFrame).
 * Objects are loose: the harness may add fields, and Orb validates only what it reads.
 */
import { z } from 'zod';

export const SessionId = z.string().min(1);
export type SessionId = z.infer<typeof SessionId>;

export const SessionCreateRequest = z.object({
  workspaceId: z.string().optional(),
  cwd: z.string().optional(),
  sessionId: SessionId.optional(),
  agentPreset: z.string().optional(),
});
export type SessionCreateRequest = z.infer<typeof SessionCreateRequest>;

export const SessionCreateValue = z.looseObject({ sessionId: SessionId, agentPreset: z.string().optional() });
export type SessionCreateValue = z.infer<typeof SessionCreateValue>;

export const PromptTextPart = z.object({ type: z.literal('text'), text: z.string() });
export type PromptTextPart = z.infer<typeof PromptTextPart>;

export const SessionPromptRequest = z.object({
  /** Client-minted; persisted on the accepted user message as `source.rpcId`. */
  requestId: z.string().min(1),
  sessionId: SessionId,
  mode: z.enum(['queue', 'steer']),
  content: z.array(PromptTextPart).min(1),
  clientTimeZone: z.string().optional(),
});
export type SessionPromptRequest = z.infer<typeof SessionPromptRequest>;

/** `session/prompt`, `session/cancel` and `session/updateQueue` all answer `{accepted: true}`. */
export const AcceptedValue = z.looseObject({ accepted: z.literal(true) });
export type AcceptedValue = z.infer<typeof AcceptedValue>;

/** One `session/list` entry (dsh-api-session-controller/lib/types/types.d.ts:159 `SessionSummary`). */
export const SessionSummary = z.looseObject({
  sessionId: SessionId,
  updatedAt: z.number(),
  agentAvailable: z.boolean(),
  running: z.boolean(),
  blank: z.boolean(),
  cwd: z.string().optional(),
});
export const SessionListValue = z.looseObject({ items: z.array(SessionSummary) });
export type SessionListValue = z.infer<typeof SessionListValue>;

/** One durable session event as carried on the wire (SessionWireEvent). */
export const SessionWireEvent = z.looseObject({
  type: z.string(),
  seq: z.number().int().nonnegative(),
  time: z.number(),
  data: z.unknown(),
});
export type SessionWireEvent = z.infer<typeof SessionWireEvent>;

export const SessionEventEntry = z.looseObject({ type: z.literal('event'), event: SessionWireEvent });
export type SessionEventEntry = z.infer<typeof SessionEventEntry>;

/** Process-local assistant presentation frames (follow with `assistantStream: true`). */
export const AssistantStreamFrame = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('start'),
    attemptId: z.string(),
    revision: z.number(),
    startedAfterSeq: z.number(),
    turn: z.number(),
    step: z.number(),
  }),
  z.looseObject({
    type: z.literal('chunk'),
    attemptId: z.string(),
    revision: z.number(),
    index: z.number().int().nonnegative(),
    time: z.number(),
    chunk: z.unknown(),
  }),
  z.looseObject({
    type: z.literal('end'),
    attemptId: z.string(),
    revision: z.number(),
    index: z.number().int().nonnegative(),
    outcome: z.union([
      z.looseObject({ kind: z.literal('committed'), eventType: z.string(), seq: z.number() }),
      z.looseObject({ kind: z.literal('abandoned') }),
    ]),
  }),
]);
export type AssistantStreamFrame = z.infer<typeof AssistantStreamFrame>;

/** One `session/follow` stream item: an opening snapshot, then durable events and assistant-stream frames. */
export const SessionFollowFrame = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('snapshot'),
    header: z.looseObject({ id: SessionId, cwd: z.string().optional(), agentPreset: z.string().optional() }),
    cursor: z.number().int(),
    records: z.array(SessionEventEntry),
    hasMore: z.boolean(),
    projections: z.unknown(),
    assistantStream: z.unknown().optional(),
  }),
  SessionEventEntry,
  z.looseObject({ type: z.literal('assistant-stream'), frame: AssistantStreamFrame }),
]);
export type SessionFollowFrame = z.infer<typeof SessionFollowFrame>;

/** Chunks inside an assistant-stream `chunk` frame that carry visible text. */
export const AssistantTextDelta = z.looseObject({
  type: z.literal('text-delta'),
  index: z.number(),
  text: z.string(),
});

/** `turn/end` event data. `reason.kind`: `completed`, `aborted` (+ `reason` cause), `blocked`, `error`, `max-tokens` (dsh-session TurnEndReasonMap). */
export const TurnEndData = z.looseObject({ turn: z.number(), reason: z.looseObject({ kind: z.string() }) });
export type TurnEndData = z.infer<typeof TurnEndData>;

/**
 * A durable session address (dsh-api-session-controller/lib/types/types.d.ts `SessionAddress`): a root session, or a
 * subagent child addressed through its parent (a child session cannot be read by its own id).
 */
export const SessionAddress = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session'), sessionId: SessionId }),
  z.object({
    kind: z.literal('subagent'),
    parentSessionId: SessionId,
    childSessionId: SessionId,
    mode: z.enum(['one-shot', 'continuable', 'unknown']),
  }),
]);
export type SessionAddress = z.infer<typeof SessionAddress>;

/**
 * `session/page` (types.d.ts `SessionPageRequest`): one backwards page of a session log ending at `throughSeq`
 * (inclusive), message-aligned; with `turnWindow` it stops at a turn start (P3.6 provenance view).
 */
export const SessionPageRequest = z.object({
  address: SessionAddress,
  throughSeq: z.number().int().min(-1),
  beforeSeq: z.number().int().nonnegative().optional(),
  maxMessages: z.number().int().positive().optional(),
  turnWindow: z
    .object({ minMessages: z.number().int().positive(), minTurns: z.number().int().positive() })
    .optional(),
});
export type SessionPageRequest = z.infer<typeof SessionPageRequest>;

export const SessionPageValue = z.looseObject({ records: z.array(SessionEventEntry), hasMore: z.boolean() });
export type SessionPageValue = z.infer<typeof SessionPageValue>;
