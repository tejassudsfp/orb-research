/**
 * P6.7 Parallel AI: the shared, harness-free facts. The Research run card and the Watch card (`Card.data` schemas),
 * the tool names, the wire of the cost-guard confirmation, and the cost-guard threshold.
 *
 * A research run is a card on the board (written by the orb-canvas service on the agent's behalf, never by the
 * renderer), so its live progress is a series of `card.updated` events the board already streams to the UI.
 * The cost guard is the same card: a run that would cost more than the threshold is placed first with
 * `status: 'awaiting_approval'`, and the user's Approve or Decline (on the card or in the conversation panel) is the
 * `orb/parallel.confirm` call. The tool waits for it.
 */
import { z } from 'zod';

/** Ask the user before any single action estimated above this many US dollars (PLAN P6.7, persona budget rules). */
export const PARALLEL_CONFIRM_ABOVE_USD = 0.5;

/** The credential reference of the Parallel key (Keychain; never logged). */
export const PARALLEL_KEY_REF = 'PARALLEL_API_KEY';
export const PARALLEL_HOST = 'api.parallel.ai';
export const PARALLEL_BASE_URL = `https://${PARALLEL_HOST}`;

/** The tools of the `orb-parallel-tools` row (P6.7). `web_search` is the existing tool with a Parallel provider. */
export const PARALLEL_SCOUT_TOOL_NAMES = [
  'parallel_extract',
  'image_search',
  'web_answer',
  'deep_research',
  'research_status',
  'batch_enrich',
  'find_entities',
  'find_entities_extend',
  'entity_search',
  'research_memory',
  'suggest_task_spec',
] as const;
/** Monitors: Orb only, and only when the user asks (they cost money on every scheduled run). */
export const PARALLEL_WATCH_TOOL_NAMES = ['watch_topic', 'list_watches', 'watch_events', 'stop_watch'] as const;
export const PARALLEL_TOOL_NAMES = [...PARALLEL_SCOUT_TOOL_NAMES, ...PARALLEL_WATCH_TOOL_NAMES] as const;

/** What Orb (the root agent) may call: the answering and bulk tools, and the watches. Scouts do the page work. */
export const PARALLEL_ORB_TOOL_NAMES = [
  'web_answer',
  'deep_research',
  'research_status',
  'batch_enrich',
  'find_entities',
  'find_entities_extend',
  'entity_search',
  'research_memory',
  'suggest_task_spec',
  ...PARALLEL_WATCH_TOOL_NAMES,
] as const;

// ---- Research run card ----

export const ResearchKind = z.enum(['deep_research', 'batch_enrich', 'find_entities']);
export type ResearchKind = z.infer<typeof ResearchKind>;

export const ResearchStatus = z.enum([
  /** The cost guard: waiting for the user's OK. */
  'awaiting_approval',
  'queued',
  'running',
  'completed',
  'failed',
  /** The agent stopped waiting. The run goes on at Parallel (Task runs cannot be cancelled) and is billed. */
  'detached',
  'declined',
  /** A FindAll run cancelled for real (`POST /cancel`). */
  'cancelled',
]);
export type ResearchStatus = z.infer<typeof ResearchStatus>;

export const RESEARCH_ACTIVE: readonly ResearchStatus[] = ['queued', 'running', 'detached'];

const Line = (max: number) => z.string().max(max);

export const ResearchCitation = z.looseObject({
  url: z.string().max(4096),
  title: Line(300).optional(),
  excerpt: Line(600).optional(),
  /** The result fields this source supports. */
  fields: z.array(Line(120)).max(20).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
});
export type ResearchCitation = z.infer<typeof ResearchCitation>;

export const ResearchField = z.looseObject({
  field: Line(160),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  reasoning: Line(600).optional(),
});
export type ResearchField = z.infer<typeof ResearchField>;

/** Research run card: a Parallel Task, Task Group or FindAll run, live, then its cited result. */
export const ResearchData = z.looseObject({
  title: Line(500),
  kind: ResearchKind,
  status: ResearchStatus,
  /** The Task processor, or the FindAll generator. */
  processor: Line(40).optional(),
  runId: Line(120).optional(),
  interactionId: Line(120).optional(),
  /** The estimate shown to the user (US dollars). */
  estCostUsd: z.number().nonnegative().optional(),
  /** 0..100 (Task `progress_meter`, or done / total of a group). */
  progress: z.number().min(0).max(100).optional(),
  sourcesRead: z.number().int().nonnegative().optional(),
  /** The latest progress lines (plan, search, extract). */
  messages: z.array(Line(300)).max(8).optional(),
  /** Group: rows done / total. FindAll: candidates generated / matched. */
  done: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
  generated: z.number().int().nonnegative().optional(),
  matched: z.number().int().nonnegative().optional(),
  /** The cited result (Markdown for a report, a short digest for JSON). */
  summary: Line(12_000).optional(),
  fields: z.array(ResearchField).max(40).optional(),
  /** Every citation (deduplicated); the first few also became source cards on the board. */
  citations: z.array(ResearchCitation).max(60).optional(),
  /** The dataset a batch or FindAll run filled. */
  datasetId: Line(60).optional(),
  error: Line(600).optional(),
  /** A line for the user ("Stopped waiting: the run continues and is billed."). */
  note: Line(400).optional(),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
});
export type ResearchData = z.infer<typeof ResearchData>;

// ---- Watch card ----

export const WatchStatus = z.enum(['awaiting_approval', 'active', 'cancelled', 'declined', 'failed']);
export type WatchStatus = z.infer<typeof WatchStatus>;

export const WatchEvent = z.looseObject({
  id: Line(120),
  date: Line(40),
  summary: Line(600),
  url: z.string().max(4096).optional(),
});
export type WatchEvent = z.infer<typeof WatchEvent>;

/** Watch card: a Parallel Monitor on a topic. It runs on Parallel's servers; orb pulls its events when it is open. */
export const WatchData = z.looseObject({
  title: Line(500),
  query: Line(2000),
  frequency: Line(12),
  processor: Line(20).optional(),
  monitorId: Line(120).optional(),
  status: WatchStatus,
  /** Projected cost of a month of checks (US dollars). */
  monthlyUsd: z.number().nonnegative().optional(),
  lastEventAt: Line(40).optional(),
  checkedAt: z.number().optional(),
  eventCount: z.number().int().nonnegative().optional(),
  /** The newest events (the rest are on the board as cards). */
  events: z.array(WatchEvent).max(10).optional(),
  error: Line(600).optional(),
});
export type WatchData = z.infer<typeof WatchData>;

// ---- The cost-guard confirmation wire ----

/** `orb/parallel.confirm {request}` → `ParallelConfirmResult` (the user's answer to a card awaiting approval). */
export const ParallelConfirmArgs = z.strictObject({
  canvasId: z.string().min(1).max(80),
  cardId: z.string().startsWith('c_').max(64),
  approve: z.boolean(),
});
export type ParallelConfirmArgs = z.infer<typeof ParallelConfirmArgs>;

export const ParallelConfirmResult = z.strictObject({
  /** `expired`: orb was restarted since the request, so nothing is waiting for the answer any more. */
  state: z.enum(['approved', 'declined', 'expired']),
});
export type ParallelConfirmResult = z.infer<typeof ParallelConfirmResult>;

/** `orb/parallel.status` → whether the Parallel key is set (the tools say "key needed" when it is not). */
export const ParallelStatusResult = z.strictObject({
  configured: z.boolean(),
  confirmAboveUsd: z.number(),
});
export type ParallelStatusResult = z.infer<typeof ParallelStatusResult>;

/** A card awaiting the user's OK (for the conversation panel prompt). */
export function awaitingApproval(card: { type: string; data: unknown }): boolean {
  if (card.type !== 'research' && card.type !== 'watch') return false;
  return (card.data as { status?: unknown } | null)?.status === 'awaiting_approval';
}
