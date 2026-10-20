/**
 * Cordis row `orb-board-tools` (`@orb/canvas/tools`): the shared agent board tools `place_card`, `update_card`,
 * `query_board` over the orb-cards registry (BUILD_PLAN P3.1), `consolidate_cards` (P3.2), and `add_frame`,
 * `update_frame`, `add_link` (P3.3), and the design card's own `write_design_frame` (P3.8). Every tool also checks the caller's role against its §2.4 allow-list.
 *
 * P3.2: `place_card` lays the card out with the layout engine (layout.ts) in the named frame; a frame that already
 * holds its budget (12) of cards answers `FRAME_FULL` with the caller's own cards in that frame, as a normal tool
 * result (not an error), so the agent can consolidate them. `consolidate_cards` stacks some of the caller's own cards
 * of one frame into a stack card; user cards are never touched (the canvas service enforces both).
 *
 * The row is NOT a host row. It sits in the `plugins` list of the `orb` agent preset (packages/orb-bundle/
 * cordis.patch.yml), so `ctx.tools.register` here lands in the preset's scope layer and only agents bound to that
 * preset see the tools (dsh-agent-preset-registry `activate` → `mountPreset` in a scope; agents join it through
 * `agentPresets.mount`). The global tool surface stays empty.
 *
 * Caller identity comes from the exec context only, never from model-supplied arguments (SPIKE_NOTES §P1.8):
 * - canvas: `exec.agent.session.header.cwd` is the agent's canvas folder, which maps the call to its board;
 * - role: `exec.agent.id` is the session id; canvas.json says whose it is (`rootSessionId` → orb, `childAgentIds`
 *   → scout/critic/builder). A session that is neither (e.g. a plain gateway session in a canvas folder) gets no
 *   board access. A session header carries no free-form metadata to hold a role (HARNESS_NOTES §P3.1);
 * - model route: `exec.agent.session.requestHeader().config.{provider,model}` (else `exec.agent.options`);
 * - tool call id: `exec.callId`.
 *
 * The role decides which card types the call may place or update (orb-cards `allowedRoles` = BUILD_PLAN §2.4); the
 * type's agent fields and `Card.data` schema decide whether the payload is valid. User notes are never changed by
 * an agent (planCommand refuses it). `query_board` returns each card's `describe()` text and ids, never coordinates.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import {
  AGENT_FIELD_NAMES,
  CardFieldError,
  buildCardData,
  cardDef,
  describeCard,
  fieldGuide,
  mayPlace,
  patchCardData,
  placeableTypes,
  type CardDataContext,
} from '@orb/cards';
import {
  AgentName,
  CardType,
  FrameColor,
  LinkDraft,
  LinkType,
  STACK_LIMITS,
  isToolAllowed,
  boardFrames,
  DESIGN_HTML_MAX,
  DesignData,
  cardTitle,
  foldText,
  readCardData,
  DATASET_LIMITS,
  DatabaseData,
  DatasetError,
  DatasetQuery,
  UpsertRow,
  databaseDataOf,
  synthesisRefs,
  datasetSummary,
  activeView,
  newCardView,
  runQuery,
  type CardView,
  type Dataset,
  searchWords,
  type Actor,
  type AssetRef,
  type Card,
  type CanvasMeta,
} from '@orb/shared';
import { basename } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { sourceIdentity } from './sourceIdentity.js';
import { z } from 'zod';
import { CanvasError, abortFirst, isCanvasError } from './errors.js';
import { cardsIn, ownedBy, type AgentCardInput, type CanvasStore } from './store.js';
import { ARRANGE_BY } from './arrange.js';
import {
  MAP_CARDS_MAX,
  MAP_FRAMES_MAX,
  QUERY_PAGE_DEFAULT,
  QUERY_PAGE_MAX,
  RESULT_BUDGET_CHARS,
  SEARCH_DEFAULT,
  SEARCH_MAX,
  boardMap,
  capText,
  readCardPage,
  scanBoard,
  type SearchHitView,
} from './scale.js';

export const name = 'orb-board-tools';
export const inject = ['tools', 'orbCanvas'];

export type OrbBoardToolsConfig = {
  /** Artificial delay before `place_card` writes, ms (stop-path tests). Falls back to ORB_TEST_PLACE_CARD_DELAY_MS. */
  placeCardDelayMs?: number;
};

/** Env var: artificial, abortable delay in `place_card` before it writes (tests; P1.10 stop path). */
export const PLACE_CARD_DELAY_ENV = 'ORB_TEST_PLACE_CARD_DELAY_MS';

const Why = z.string().trim().min(1).max(140);
const Badge = z.enum(['must', 'skim']);
const FrameRef = z.string().startsWith('f_').max(64);

/** `place_card`: the envelope; every other argument is a field of the card type (checked by orb-cards). */
export const PlaceCardArgs = z.looseObject({
  type: CardType,
  frameId: FrameRef.nullable().optional(),
  why: Why,
  detail: z.string().max(20_000).optional(),
  badge: Badge.optional(),
  /** P3.6: the card or frame whose thread this card answers (the card goes next to it, linked to it). */
  threadOf: z
    .string()
    .regex(/^[cf]_/)
    .max(64)
    .nullable()
    .optional(),
});
export type PlaceCardArgs = z.infer<typeof PlaceCardArgs>;

/** `update_card`: the card, optionally a new why or badge (`none` clears it), and any fields of its type. */
export const UpdateCardArgs = z.looseObject({
  cardId: z.string().startsWith('c_').max(64),
  why: Why.optional(),
  detail: z.string().max(20_000).optional(),
  badge: z.enum(['must', 'skim', 'none']).optional(),
});
export type UpdateCardArgs = z.infer<typeof UpdateCardArgs>;

/** `consolidate_cards`: the caller's own cards of one frame, and the stack's title and summary. */
export const ConsolidateArgs = z.strictObject({
  cardIds: z.array(z.string().startsWith('c_').max(64)).min(STACK_LIMITS.min).max(STACK_LIMITS.max),
  title: z.string().trim().min(1).max(STACK_LIMITS.title),
  summary: z.string().trim().min(1).max(STACK_LIMITS.summary),
});
export type ConsolidateArgs = z.infer<typeof ConsolidateArgs>;

/** What `place_card` answers when the frame is at its budget (PRD Canvas › Frames). */
export type FrameFullResult = {
  error: 'FRAME_FULL';
  /** The full frame. */
  frameId: string;
  budget: number;
  /** Visible cards in the frame now. */
  cards: number;
  reason?: 'pinned-layout';
  message: string;
  /** The caller's own visible cards in that frame (what it may consolidate). */
  ownCards: BoardCardView[];
};

/** Most cards one `query_board` page returns (P6.8: pages of {@link QUERY_PAGE_DEFAULT}, at most this). */
export const QUERY_BOARD_LIMIT = QUERY_PAGE_MAX;

export const QueryBoardArgs = z.strictObject({
  frameId: FrameRef.nullable().optional(),
  types: z.array(CardType).max(40).optional(),
  q: z.string().max(200).optional(),
  /** P6.8: page size (default 20, at most 50) and how many matches to skip. */
  limit: z.number().int().min(1).max(QUERY_PAGE_MAX).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
});
export type QueryBoardArgs = z.infer<typeof QueryBoardArgs>;

/** The minimal slice of a dsh exec context the tools read (dsh-tools ToolRunContext). */
export type BoardToolExec = {
  callId: string;
  signal: AbortSignal;
  agent?: {
    id: string;
    options?: { provider?: string; model?: string };
    session?: {
      header?: { cwd?: string };
      /** Folded `request/header` in force: the route of the request that produced this tool call. */
      requestHeader?: () => { config?: { provider?: string; model?: string } } | undefined;
      /** The next event's seq (the log length): the session's last event is `seq - 1`. */
      seq?: number;
    };
  };
};

/** One card as `query_board` returns it: ids and text, never coordinates or sizes. */
export type BoardCardView = {
  id: string;
  type: CardType;
  frameId: string | null;
  title: string;
  /** The type's `describe()` text. */
  description: string;
  why: string;
  by: AgentName | 'user';
  badge?: 'must' | 'skim';
  note?: string;
  opened?: true;
  detailChars?: number;
};

/** Board-facing view of a card for `query_board`. */
export function cardView(card: Card): BoardCardView {
  return {
    id: card.id,
    type: card.type,
    frameId: card.frameId,
    title: cardTitle(card),
    description: describeCard(card),
    why: card.why ?? '',
    by: card.provenance.kind === 'agent' ? card.provenance.agent : 'user',
    ...(card.detail ? { detailChars: card.detail.length } : {}),
    ...(card.badge ? { badge: card.badge } : {}),
    ...(card.note ? { note: card.note.slice(0, 500) } : {}),
    ...(card.opened ? { opened: true as const } : {}),
  };
}

/** Abortable sleep that rejects with the signal's reason. */
export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (!(ms > 0)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function delayFrom(config: OrbBoardToolsConfig, env: NodeJS.ProcessEnv = process.env): number {
  if (config.placeCardDelayMs !== undefined) return Math.max(0, config.placeCardDelayMs);
  const raw = Number(env[PLACE_CARD_DELAY_ENV]);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/** Provenance of a tool call, from the exec context only (never from model-supplied arguments). */
export function actorOf(exec: BoardToolExec, agent: AgentName): Extract<Actor, { kind: 'agent' }> {
  if (!exec.agent) throw new CanvasError('orb/invalid-args', 'board tools only run for an agent');
  // The logged request header is the route that actually produced this call (a session/selectModel switch
  // applies through the `agent/request` waterfall, not agent.options); agent.options is the creation-time route.
  const logged = exec.agent.session?.requestHeader?.()?.config;
  const provider = logged?.provider || exec.agent.options?.provider;
  const model = logged?.model || exec.agent.options?.model;
  // P3.6: where this call sits in the session log (its `tool/call` event is at or before the last event).
  const next = exec.agent.session?.seq;
  return {
    kind: 'agent',
    agent,
    model: model ?? 'unknown',
    ...(provider ? { provider } : {}),
    sessionId: exec.agent.id,
    toolCallId: exec.callId,
    ...(typeof next === 'number' && next > 0 ? { eventSeq: next - 1 } : {}),
  };
}

/** Which canvas a call belongs to: the agent session's cwd is its canvas folder. */
export function canvasOf(store: CanvasStore, exec: BoardToolExec): string {
  if (!exec.agent) throw new CanvasError('orb/invalid-args', 'board tools only run for an agent');
  const id = store.canvasIdOfDir(exec.agent.session?.header?.cwd);
  if (!id) throw new CanvasError('orb/not-found', 'this agent is not attached to a canvas');
  return id;
}

/** The role of session `sessionId` on a canvas: its root agent is Orb; its children are listed by role. */
export function roleIn(meta: CanvasMeta, sessionId: string): AgentName | undefined {
  if (meta.rootSessionId && meta.rootSessionId === sessionId) return 'orb';
  for (const [role, id] of Object.entries(meta.childAgentIds)) {
    const parsed = AgentName.safeParse(role);
    if (id === sessionId && parsed.success && parsed.data !== 'orb') return parsed.data;
  }
  return undefined;
}

/** The calling agent: its canvas, its role there (from canvas.json, by session id) and its provenance. */
export async function callerOf(
  store: CanvasStore,
  exec: BoardToolExec,
): Promise<{ canvasId: string; role: AgentName; actor: Extract<Actor, { kind: 'agent' }> }> {
  const canvasId = canvasOf(store, exec);
  const role = roleIn(await store.open(canvasId), exec.agent!.id);
  if (!role) throw new CanvasError('orb/forbidden', 'this agent is not one of the canvas agents');
  return { canvasId, role, actor: actorOf(exec, role) };
}

/** A board tool outside the caller's §2.4 allow-list is refused inside the tool too (the guard is the first wall). */
export function requireTool(role: AgentName, tool: string): void {
  if (!isToolAllowed(role, tool))
    throw new CanvasError('orb/forbidden', `${tool} is not available to the ${role} agent`);
}

/** `add_frame` (Orb): a frame title and an optional palette tone. */
export const AddFrameArgs = z.strictObject({
  title: z.string().trim().min(1).max(80),
  color: FrameColor.optional(),
});
export type AddFrameArgs = z.infer<typeof AddFrameArgs>;

/** `update_frame` (Orb): rename or recolour a frame; never its position or size. */
export const UpdateFrameArgs = z.strictObject({
  frameId: FrameRef,
  title: z.string().trim().min(1).max(80).optional(),
  color: FrameColor.optional(),
});
export type UpdateFrameArgs = z.infer<typeof UpdateFrameArgs>;

/** `add_link` (Orb, Scout, Critic): two card or frame ids and a link type (a `label` link needs its label). */
export const AddLinkArgs = z.strictObject({
  from: z
    .string()
    .regex(/^[cf]_/)
    .max(64),
  to: z
    .string()
    .regex(/^[cf]_/)
    .max(64),
  type: LinkType,
  label: z.string().trim().min(1).max(60).optional(),
});
export type AddLinkArgs = z.infer<typeof AddLinkArgs>;

/** Execute `add_frame`: a new frame placed by the layout engine (or the existing frame of that title). */
export async function addFrame(
  store: CanvasStore,
  rawArgs: unknown,
  exec: BoardToolExec,
): Promise<{ frameId: string; number: string; title: string; created: boolean }> {
  try {
    const args = AddFrameArgs.parse(rawArgs);
    const { canvasId, role, actor } = await callerOf(store, exec);
    requireTool(role, 'add_frame');
    exec.signal.throwIfAborted();

    const { frame, created, number } = await store.addAgentFrame(canvasId, args, actor);
    return { frameId: frame.id, number: String(number).padStart(2, '0'), title: frame.title, created };
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

/** Execute `update_frame`: rename or recolour a frame. */
export async function updateFrame(
  store: CanvasStore,
  rawArgs: unknown,
  exec: BoardToolExec,
): Promise<{ frameId: string; title: string; color: string }> {
  try {
    const args = UpdateFrameArgs.parse(rawArgs);
    const { canvasId, role, actor } = await callerOf(store, exec);
    requireTool(role, 'update_frame');
    exec.signal.throwIfAborted();
    const frame = await store.updateAgentFrame(canvasId, args.frameId, args, actor);
    return { frameId: frame.id, title: frame.title, color: frame.color };
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

/** Execute `add_link`: link two cards or frames (or return the same existing link). */
export async function addLink(
  store: CanvasStore,
  rawArgs: unknown,
  exec: BoardToolExec,
): Promise<{ linkId: string; created: boolean }> {
  try {
    const args = AddLinkArgs.parse(rawArgs);
    const { canvasId, role, actor } = await callerOf(store, exec);
    requireTool(role, 'add_link');
    const draft = LinkDraft.parse({
      from: args.from,
      to: args.to,
      type: args.type,
      ...(args.type === 'label' && args.label ? { label: args.label } : {}),
    });
    exec.signal.throwIfAborted();
    return await store.addAgentLink(canvasId, draft, actor);
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

/** Tool errors go back to the model as text; keep them short and actionable. */
function toolError(err: unknown): never {
  if (
    err instanceof CardFieldError &&
    /body|summary/i.test(err.message) &&
    /Too big|too long/i.test(err.message)
  )
    throw new Error(
      `${err.message}. Keep the body or summary within its limit and put the full multi-paragraph analysis in detail (up to 20000 characters), then retry.`,
    );
  if (isCanvasError(err) || err instanceof CardFieldError) throw new Error(err.message);
  if (err instanceof z.ZodError) {
    const issue = err.issues[0];
    throw new Error(`invalid ${issue?.path.join('.') || 'arguments'}: ${issue?.message ?? 'bad value'}`);
  }
  throw err;
}

/** The type fields of a tool call: every argument except the envelope keys. */
function fieldsOf(args: Record<string, unknown>, envelope: readonly string[]): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) if (!envelope.includes(k)) fields[k] = v;
  return fields;
}

/** The data context for one call: assets resolve against the caller's canvas folder only. */
function dataContext(store: CanvasStore, canvasId: string): CardDataContext {
  return {
    now: Date.now(),
    async resolveAsset(path: string): Promise<AssetRef> {
      const { mime, size } = await store.assetFile(canvasId, path).catch(() => {
        throw new CardFieldError(`no asset ${JSON.stringify(path)} in this canvas`);
      });
      return { path, name: basename(path), mime, size };
    },
  };
}

const PLACE_ENVELOPE = ['type', 'frameId', 'why', 'detail', 'badge', 'threadOf'] as const;
const UPDATE_ENVELOPE = ['cardId', 'why', 'detail', 'badge'] as const;

/**
 * P6.5: the cards an insight cites, or a hypothesis names as evidence, must be on this board (and not the card
 * itself), so a citation is never a made-up id.
 */
async function requireCitedCards(
  store: CanvasStore,
  canvasId: string,
  type: CardType,
  data: unknown,
  selfId?: string,
): Promise<void> {
  const refs = synthesisRefs(type, data);
  if (refs.length === 0) return;
  const board = await store.board(canvasId);
  const missing = refs.filter((id) => id === selfId || !board.card(id));
  if (missing.length > 0)
    throw new CanvasError(
      'orb/invalid-args',
      `${type} cards must cite other cards on this board; not found: ${missing.join(', ')} (ids come from query_board)`,
    );
}

/** Execute `place_card` (exported for unit tests; the tool wraps it). */
export async function placeCard(
  store: CanvasStore,
  rawArgs: unknown,
  exec: BoardToolExec,
  options: { delayMs: number },
): Promise<{ cardId: string; datasetId?: string; warning?: string; reused?: true } | FrameFullResult> {
  let caller: Awaited<ReturnType<typeof callerOf>> | undefined;
  try {
    const args = PlaceCardArgs.parse(rawArgs);
    caller = await callerOf(store, exec);
    const { canvasId, role, actor } = caller;
    requireTool(role, 'place_card');
    if (!mayPlace(role, args.type)) {
      throw new CanvasError(
        'orb/forbidden',
        `${role} may not place ${args.type} cards (allowed: ${placeableTypes(role).join(', ') || 'none'})`,
      );
    }
    const fields = fieldsOf(args, PLACE_ENVELOPE);
    let data = await buildCardData(args.type, fields, dataContext(store, canvasId));
    await requireCitedCards(store, canvasId, args.type, data);
    await abortableDelay(options.delayMs, exec.signal);
    exec.signal.throwIfAborted();
    if (args.type === 'source') {
      const url = sourceIdentity(data.url);
      const existing = (await store.board(canvasId)).cards().find(c => c.type === 'source' && !c.stackedInto && sourceIdentity((c.data as any).url) === url);
      if (existing) return { cardId: existing.id, reused: true,
        warning: 'This source URL already has a card. Reuse its ID and link it to relevant findings; another source was not created. Your new text was not applied. orb can update the existing card if its summary needs refreshing; never duplicate it because another role owns it.' };
    }
    // P6.3: a Database card gets its dataset first (rows in assets/data/), removed again if the card is not placed.
    let dataset: Dataset | undefined;
    let view: CardView | undefined;
    if (args.type === 'database') {
      const made = await store.datasets.create(
        canvasId,
        String(fields.title),
        (fields.columns as string[]) ?? [],
        (fields.rows as string[][] | undefined) ?? [],
        actor,
      );
      dataset = made.dataset;
      data = databaseDataOf(String(fields.title), dataset) as unknown as Record<string, unknown>;
      view = newCardView(dataset);
    }
    let card: Card;
    try {
      card = await placeWithFiles(
        store,
        canvasId,
        {
          type: args.type,
          frameId: args.frameId ?? null,
          data,
          why: args.why,
          ...(args.detail !== undefined ? { detail: args.detail } : {}),
          ...(args.badge ? { badge: args.badge } : {}),
          ...(view ? { view } : {}),
          ...(await threadPlacement(store, canvasId, args, actor)),
        },
        actor,
        exec.signal,
      );
    } catch (err) {
      if (dataset) await store.datasets.discard(canvasId, dataset.id).catch(() => undefined);
      throw err;
    }
    const warning = await chartWarning(store, canvasId, card.id);
    return {
      cardId: card.id,
      ...(dataset ? { datasetId: dataset.id } : {}),
      ...(warning ? { warning } : {}),
    };
  } catch (err) {
    if (exec.signal.aborted) throw err;
    if (isCanvasError(err) && typeof err.details.reusedSourceCardId === 'string')
      return { cardId: err.details.reusedSourceCardId, reused: true,
        warning: 'This source URL already has a card. Reuse its ID; a concurrent agent already placed it. Ask orb to refresh its summary when needed.' };
    if (caller && isCanvasError(err) && err.code === 'orb/frame-full')
      return frameFull(store, caller, err.details);
    return toolError(err);
  }
}

/** P6.4: why a chart has nothing to plot (a column that is not there), so the agent can fix it; undefined when fine. */
async function chartWarning(
  store: CanvasStore,
  canvasId: string,
  cardId: string,
): Promise<string | undefined> {
  const card = (await store.board(canvasId)).card(cardId);
  if (card?.type !== 'chart') return undefined;
  const problem = (card.data as { problem?: unknown }).problem;
  return typeof problem === 'string'
    ? `the chart has nothing to plot: ${problem}. Fix it with update_card.`
    : undefined;
}

/**
 * Place an agent card; a design card first gets its id and its HTML file (`assets/design/<id>.html`, P3.8), and the
 * file is removed again when the card cannot be placed (a full frame, a stop).
 */
async function placeWithFiles(
  store: CanvasStore,
  canvasId: string,
  input: AgentCardInput,
  actor: Extract<Actor, { kind: 'agent' }>,
  signal: AbortSignal,
): Promise<Card> {
  if (input.type !== 'design') {
    const event = await store.placeAgentCard(canvasId, input, actor);
    return (event.data as { card: Card }).card;
  }
  const html = (input.data as DesignData).html ?? '';
  const id = store.mintCardId();
  try {
    const asset = await store.writeDesignFile(canvasId, id, html);
    signal.throwIfAborted();
    const data = { ...(input.data as DesignData), version: 1, asset };
    const event = await store.placeAgentCard(canvasId, { ...input, id, data }, actor);
    return (event.data as { card: Card }).card;
  } catch (err) {
    await store.removeDesignFile(canvasId, id).catch(() => undefined);
    throw err;
  }
}

/**
 * Card data of a design card's rewrite (P3.8): the HTML file is rewritten first, then the data carries the next
 * version and the file path. A data change without new HTML keeps the version.
 */
async function rewriteDesign(
  store: CanvasStore,
  canvasId: string,
  card: Card,
  data: Record<string, unknown>,
  htmlGiven: boolean,
): Promise<Record<string, unknown>> {
  if (!htmlGiven) return data;
  const current = readCardData(DesignData, card.data);
  const html = (data as DesignData).html ?? '';
  const asset = await store.writeDesignFile(canvasId, card.id, html);
  return { ...data, version: (current?.version ?? 1) + 1, asset };
}

/**
 * Commit a design card's rewrite after its file was rewritten (P3.8): when the commit does not happen (a stop, a
 * refused event), the file goes back to the card's current HTML, so the card and its file never disagree.
 */
async function commitOrRestoreDesign(
  store: CanvasStore,
  canvasId: string,
  card: Card,
  commit: () => Promise<unknown>,
): Promise<void> {
  try {
    await commit();
  } catch (err) {
    const previous = readCardData(DesignData, card.data)?.html;
    await (
      previous
        ? store.writeDesignFile(canvasId, card.id, previous)
        : store.removeDesignFile(canvasId, card.id)
    ).catch(() => undefined);
    throw err;
  }
}

/**
 * Which thread a card answers (P3.6): the `threadOf` argument, else, for Orb, the thread its current turn answers
 * (orb-agents records it when the turn takes a thread message), unless the call names another frame than the
 * thread's. `threadOf: null` places the card without a thread.
 */
async function threadPlacement(
  store: CanvasStore,
  canvasId: string,
  args: PlaceCardArgs,
  actor: Extract<Actor, { kind: 'agent' }>,
): Promise<{ threadOf?: string }> {
  if (args.threadOf) return { threadOf: args.threadOf };
  if (args.threadOf === null || actor.agent !== 'orb') return {};
  const active = store.activeThreadOf(actor.sessionId);
  if (!active) return {};
  if (args.frameId) {
    const anchorFrame = active.startsWith('f_')
      ? active
      : (await store.board(canvasId)).card(active)?.frameId;
    if (anchorFrame !== args.frameId) return {};
  }
  return { threadOf: active };
}

/** The `FRAME_FULL` answer: the frame's budget and the caller's own visible cards there. */
async function frameFull(
  store: CanvasStore,
  caller: { canvasId: string; role: AgentName },
  details: Record<string, unknown>,
): Promise<FrameFullResult> {
  const frameId = String(details.frameId);
  const state = (await store.board(caller.canvasId)).current;
  const inFrame = cardsIn(state, frameId);
  const own = inFrame.filter((c) => ownedBy(c, caller.role)).map(cardView);
  const where = `Frame ${frameId}`;
  const next =
    caller.role === 'orb'
      ? 'Place the card in another frame, or add a frame for it.'
      : own.length >= STACK_LIMITS.min
        ? `Call consolidate_cards with ${STACK_LIMITS.min} or more of your own cards listed in ownCards (a title and a summary), then place again; or use another frame.`
        : 'Not enough of your own cards to consolidate here: use another frame.';
  return {
    error: 'FRAME_FULL',
    frameId,
    budget: store.frameBudget,
    cards: inFrame.length,
    ...(details.layoutBlocked ? { reason: 'pinned-layout' as const } : {}),
    message: details.layoutBlocked
      ? `${where} cannot grow without overlapping pinned cards. ${next}`
      : `${where} is full (${inFrame.length} of ${store.frameBudget} cards). ${next}`,
    ownCards: own,
  };
}

/** Execute `consolidate_cards`: stack some of the caller's own cards of one frame into one stack card. */
export async function consolidateCards(
  store: CanvasStore,
  rawArgs: unknown,
  exec: BoardToolExec,
): Promise<{ stackId: string; stacked: number; frameId?: string; cards: number; budget: number }> {
  try {
    const args = ConsolidateArgs.parse(rawArgs);
    const { canvasId, role, actor } = await callerOf(store, exec);
    requireTool(role, 'consolidate_cards');
    exec.signal.throwIfAborted();
    const { stack } = await store.consolidateAgentCards(canvasId, args, actor);
    const state = (await store.board(canvasId)).current;
    return {
      stackId: stack.id,
      stacked: args.cardIds.length,
      ...(stack.frameId ? { frameId: stack.frameId } : {}),
      cards: cardsIn(state, stack.frameId).length,
      budget: store.frameBudget,
    };
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

/** Execute `update_card`: change an existing card's fields, why or badge (never a user note). */
export async function updateCard(
  store: CanvasStore,
  rawArgs: unknown,
  exec: BoardToolExec,
): Promise<{ cardId: string; updated: boolean; warning?: string }> {
  try {
    const args = UpdateCardArgs.parse(rawArgs);
    const { canvasId, role, actor } = await callerOf(store, exec);
    requireTool(role, 'update_card');
    const board = await store.board(canvasId);
    const card = board.card(args.cardId);
    if (!card) throw new CanvasError('orb/not-found', `no card ${JSON.stringify(args.cardId)} on this board`);
    if (card.type === 'note' && card.provenance.kind === 'user') {
      throw new CanvasError('orb/forbidden', `agents cannot change the user's note ${card.id}`);
    }
    if (!mayPlace(role, card.type)) {
      throw new CanvasError('orb/forbidden', `${role} may not edit ${card.type} cards`);
    }
    if (card.stackedInto) {
      throw new CanvasError('orb/invalid-args', `card ${card.id} is stacked into ${card.stackedInto}`);
    }
    const fields = fieldsOf(args, UPDATE_ENVELOPE);
    let data = await patchCardData(card.type, card.data, fields, dataContext(store, canvasId));
    if (data) await requireCitedCards(store, canvasId, card.type, data, card.id);
    const patch: Record<string, unknown> = {};
    if (args.why !== undefined) patch.why = args.why;
    if (args.detail !== undefined) patch.detail = args.detail;
    if (args.badge !== undefined) patch.badge = args.badge === 'none' ? null : args.badge;
    if (!data && Object.keys(patch).length === 0)
      throw new CanvasError('orb/invalid-args', 'nothing to update');
    if ((!data || isDeepStrictEqual(data, card.data)) &&
      (args.why === undefined || args.why === card.why) &&
      (args.detail === undefined || args.detail === card.detail) &&
      (args.badge === undefined || (args.badge === 'none' ? !card.badge : args.badge === card.badge)))
      return { cardId: card.id, updated: false };
    exec.signal.throwIfAborted();
    // P3.8: new HTML for a design card rewrites its file and bumps its version.
    if (data && card.type === 'design')
      data = await rewriteDesign(
        store,
        canvasId,
        card,
        data,
        typeof fields.html === 'string' && fields.html !== '',
      );
    if (data) patch.data = data;
    const rewritten = card.type === 'design' && patch.data !== undefined;
    const commit = async () => {
      if (rewritten) exec.signal.throwIfAborted();
      await store.commandEvents(canvasId, { type: 'card.updated', id: card.id, patch }, actor);
    };
    if (rewritten) await commitOrRestoreDesign(store, canvasId, card, commit);
    else await commit();
    const warning = await chartWarning(store, canvasId, card.id);
    return { cardId: card.id, updated: true, ...(warning ? { warning } : {}) };
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

/** `write_design_frame` (Builder, P3.8): one HTML screen as a design card, or a new version of an existing one. */
export const WriteDesignFrameArgs = z.strictObject({
  frameId: FrameRef.nullable().optional(),
  title: z.string().trim().min(1).max(200),
  html: z.string().min(1).max(DESIGN_HTML_MAX),
  body: z.string().trim().max(1000).optional(),
  why: Why.optional(),
  cardId: z.string().startsWith('c_').max(64).optional(),
});
export type WriteDesignFrameArgs = z.infer<typeof WriteDesignFrameArgs>;

export type WriteDesignFrameResult = {
  cardId: string;
  /** False when an existing design frame got a new version. */
  created: boolean;
  version: number;
  updatedAt: number;
  /** The frame's file in the canvas folder. */
  asset: string;
};

/**
 * The design card a `write_design_frame` call rewrites: the named card (it must be a visible design card), else the
 * caller's own design card with the same title in the same frame (so "change the button" without an id edits the
 * frame instead of adding a second one); undefined for a new frame.
 */
function designTarget(
  board: Awaited<ReturnType<CanvasStore['board']>>,
  args: WriteDesignFrameArgs,
  role: AgentName,
): Card | undefined {
  if (args.cardId) {
    const card = board.card(args.cardId);
    if (!card) throw new CanvasError('orb/not-found', `no card ${JSON.stringify(args.cardId)} on this board`);
    if (card.type !== 'design')
      throw new CanvasError('orb/invalid-args', `card ${card.id} is a ${card.type} card, not a design frame`);
    if (card.stackedInto)
      throw new CanvasError('orb/invalid-args', `card ${card.id} is stacked into ${card.stackedInto}`);
    return card;
  }
  const title = foldText(args.title.trim());
  return cardsIn(board.current, args.frameId ?? null).find(
    (c) => c.type === 'design' && ownedBy(c, role) && foldText(cardTitle(c).trim()) === title,
  );
}

/** Execute `write_design_frame`: write a design frame's HTML (file + card), new or as the next version. */
export async function writeDesignFrame(
  store: CanvasStore,
  rawArgs: unknown,
  exec: BoardToolExec,
): Promise<WriteDesignFrameResult | FrameFullResult> {
  let caller: Awaited<ReturnType<typeof callerOf>> | undefined;
  try {
    const args = WriteDesignFrameArgs.parse(rawArgs);
    caller = await callerOf(store, exec);
    const { canvasId, role, actor } = caller;
    requireTool(role, 'write_design_frame');
    if (!mayPlace(role, 'design'))
      throw new CanvasError('orb/forbidden', `${role} may not place design cards`);
    const board = await store.board(canvasId);
    if (args.frameId && !board.current.frames[args.frameId])
      throw new CanvasError('orb/not-found', `no frame ${JSON.stringify(args.frameId)} on this board`);
    const target = designTarget(board, args, role);
    const fields = { title: args.title, html: args.html, ...(args.body ? { body: args.body } : {}) };
    const ctx = dataContext(store, canvasId);
    exec.signal.throwIfAborted();
    if (target) {
      const patched = (await patchCardData('design', target.data, fields, ctx))!;
      const data = await rewriteDesign(store, canvasId, target, patched, true);
      await commitOrRestoreDesign(store, canvasId, target, async () => {
        exec.signal.throwIfAborted();
        await store.commandEvents(
          canvasId,
          { type: 'card.updated', id: target.id, patch: { data, ...(args.why ? { why: args.why } : {}) } },
          actor,
        );
      });
      const d = data as DesignData;
      return {
        cardId: target.id,
        created: false,
        version: d.version!,
        updatedAt: d.updatedAt!,
        asset: d.asset!,
      };
    }
    if (!args.why)
      throw new CanvasError('orb/invalid-args', 'a new design frame needs a "why" line (≤140 chars)');
    const data = await buildCardData('design', fields, ctx);
    const card = await placeWithFiles(
      store,
      canvasId,
      { type: 'design', frameId: args.frameId ?? null, data, why: args.why },
      actor,
      exec.signal,
    );
    const d = card.data as DesignData;
    return { cardId: card.id, created: true, version: d.version!, updatedAt: d.updatedAt!, asset: d.asset! };
  } catch (err) {
    if (exec.signal.aborted) throw err;
    if (caller && isCanvasError(err) && err.code === 'orb/frame-full')
      return frameFull(store, caller, err.details);
    return toolError(err);
  }
}

/**
 * Execute `query_board`: the frames (id, number, title, counts), then one PAGE of the matching cards, each with its
 * describe() text; no coordinates. P6.8: a page is at most `limit` cards (default 20) AND at most
 * {@link RESULT_BUDGET_CHARS} characters; what does not fit is counted in `more` with `nextOffset` and a hint, never
 * sent. On a big board start with `board_map` and `search_board`; this is for listing a frame or a type.
 */
export async function queryBoard(store: CanvasStore, rawArgs: unknown, exec: BoardToolExec) {
  try {
    const args = QueryBoardArgs.parse(rawArgs ?? {});
    const { canvasId, role } = await callerOf(store, exec);
    requireTool(role, 'query_board');
    const board = await store.board(canvasId);
    exec.signal.throwIfAborted();
    const state = board.current;
    if (args.frameId && !state.frames[args.frameId]) {
      throw new CanvasError('orb/not-found', `no frame ${JSON.stringify(args.frameId)} on this board`);
    }
    const live = board.cards().filter((c) => !c.stackedInto);
    const allFrames = boardFrames(state).map((f, i) => ({
      id: f.id,
      number: String(i + 1).padStart(2, '0'),
      title: f.title,
      cards: live.filter((c) => c.frameId === f.id).length,
      budget: store.frameBudget,
    }));
    const frames = allFrames.slice(0, MAP_FRAMES_MAX);
    const words = searchWords(args.q ?? '');
    const types = args.types && args.types.length > 0 ? new Set(args.types) : undefined;
    const matches = live
      .filter((c) => args.frameId === undefined || c.frameId === args.frameId)
      .filter((c) => !types || types.has(c.type))
      .map(cardView)
      .filter((v) => {
        if (words.length === 0) return true;
        const text = foldText(`${v.title}\n${v.description}\n${v.why}\n${v.note ?? ''}`);
        return words.every((w) => text.includes(w));
      });
    const offset = args.offset ?? 0;
    const want = matches.slice(offset, offset + (args.limit ?? QUERY_PAGE_DEFAULT));
    // Hard budget: drop cards from the end until the page fits, always keeping one.
    let cards = want;
    const size = (list: BoardCardView[]) => JSON.stringify({ frames, cards: list }).length;
    while (cards.length > 1 && size(cards) > RESULT_BUDGET_CHARS) cards = cards.slice(0, cards.length - 1);
    if (cards.length === 1 && size(cards) > RESULT_BUDGET_CHARS)
      cards = [
        {
          ...cards[0]!,
          description: cards[0]!.description.slice(0, 300),
          ...(cards[0]!.note ? { note: cards[0]!.note.slice(0, 200) } : {}),
        },
      ];
    const left = matches.length - offset - cards.length;
    return {
      frames,
      ...(allFrames.length > frames.length ? { framesMore: allFrames.length - frames.length } : {}),
      cards,
      total: matches.length,
      ...(left > 0
        ? {
            more: left,
            nextOffset: offset + cards.length,
            hint: 'more cards match: call query_board again with offset, narrow with frameId / types / q, or use board_map and search_board',
          }
        : {}),
    };
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

// ---- Progressive disclosure (P6.8) ----

export const BoardMapArgs = z.strictObject({
  frameId: FrameRef.optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
  limit: z.number().int().min(1).max(MAP_CARDS_MAX).optional(),
});
export const SearchBoardArgs = z.strictObject({
  q: z.string().trim().min(1).max(200),
  frameId: FrameRef.optional(),
  types: z.array(CardType).max(40).optional(),
  limit: z.number().int().min(1).max(SEARCH_MAX).optional(),
  offset: z.number().int().min(0).max(1000).optional(),
});
export const ReadCardArgs = z.strictObject({
  cardId: z.string().startsWith('c_').max(64),
  page: z.number().int().min(1).max(10_000).optional(),
});

/** Execute `board_map`: the board in one screen, or one frame's cards (paged); digests are cached per frame. */
export async function boardMapTool(store: CanvasStore, rawArgs: unknown, exec: BoardToolExec) {
  try {
    const args = BoardMapArgs.parse(rawArgs ?? {});
    const { canvasId, role } = await callerOf(store, exec);
    requireTool(role, 'board_map');
    const board = await store.board(canvasId);
    exec.signal.throwIfAborted();
    try {
      return boardMap(board.current, store.mapCache, canvasId, args, store.frameBudget);
    } catch (err) {
      if (err instanceof Error && /^no frame/.test(err.message))
        throw new CanvasError('orb/not-found', err.message);
      throw err;
    }
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

/** Execute `search_board`: ids and snippets of the cards matching every word (FTS over index.sqlite). */
export async function searchBoardTool(store: CanvasStore, rawArgs: unknown, exec: BoardToolExec) {
  try {
    const args = SearchBoardArgs.parse(rawArgs ?? {});
    const { canvasId, role } = await callerOf(store, exec);
    requireTool(role, 'search_board');
    const board = await store.board(canvasId);
    exec.signal.throwIfAborted();
    const state = board.current;
    if (args.frameId && !state.frames[args.frameId])
      throw new CanvasError('orb/not-found', `no frame ${JSON.stringify(args.frameId)} on this board`);
    let hits: SearchHitView[];
    if (store.index) {
      const rows = await store.index.searchCanvas(canvasId, args.q, 400);
      hits = rows.flatMap((r) => {
        const card = state.cards[r.itemId];
        if (!card || card.stackedInto) return [];
        return [
          {
            id: card.id,
            type: card.type,
            title: r.title.slice(0, 90),
            frameId: card.frameId,
            snippet: r.snippet.replace(/\s+/g, ' ').slice(0, 260),
          },
        ];
      });
    } else {
      hits = scanBoard(state, args.q);
    }
    const types = args.types && args.types.length > 0 ? new Set<string>(args.types) : undefined;
    hits = hits.filter((h) => (!args.frameId || h.frameId === args.frameId) && (!types || types.has(h.type)));
    const frames = boardFrames(state);
    const offset = args.offset ?? 0;
    const view = (h: SearchHitView) => ({
      id: h.id,
      type: h.type,
      title: h.title,
      ...(h.frameId
        ? {
            frame: String(frames.findIndex((f) => f.id === h.frameId) + 1).padStart(2, '0'),
            frameId: h.frameId,
          }
        : {}),
      snippet: h.snippet,
    });
    let page = hits.slice(offset, offset + (args.limit ?? SEARCH_DEFAULT)).map(view);
    while (page.length > 1 && JSON.stringify(page).length > RESULT_BUDGET_CHARS)
      page = page.slice(0, page.length - 1);
    const left = hits.length - offset - page.length;
    return {
      query: args.q,
      total: hits.length,
      hits: page,
      ...(left > 0
        ? {
            more: left,
            nextOffset: offset + page.length,
            hint: 'more matches: call search_board again with offset, or add words / a frameId / types',
          }
        : {}),
      ...(hits.length === 0
        ? { hint: 'no card matches every word: try fewer or different words, or board_map' }
        : {}),
    };
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

/** Execute `read_card`: one card in full, a page (at most 8k characters) at a time. */
export async function readCardTool(store: CanvasStore, rawArgs: unknown, exec: BoardToolExec) {
  try {
    const args = ReadCardArgs.parse(rawArgs ?? {});
    const { canvasId, role } = await callerOf(store, exec);
    requireTool(role, 'read_card');
    const board = await store.board(canvasId);
    exec.signal.throwIfAborted();
    const card = board.card(args.cardId);
    if (!card)
      throw new CanvasError('orb/not-found', `no card ${JSON.stringify(args.cardId)} on this board`, {
        cardId: args.cardId,
      });
    const result = readCardPage(board.current, card, args.page ?? 1);
    if (role === 'orb') store.port.inspected(canvasId, card, result.page, result.pages);
    return result;
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

// ---- Layout (P6.8): semantic, never coordinates ----

export const MoveCardArgs = z.strictObject({
  cardId: z.string().startsWith('c_').max(64),
  frameId: FrameRef,
});
export const ArrangeFrameArgs = z.strictObject({
  frameId: FrameRef,
  by: z.enum(ARRANGE_BY),
});
export const ReorderFramesArgs = z.strictObject({ order: z.array(FrameRef).min(1).max(100) });
export const TidyBoardArgs = z.strictObject({});

/** Execute `move_card`: re-file one of the caller's cards into another frame; the board picks the cell. */
export async function moveCardTool(store: CanvasStore, rawArgs: unknown, exec: BoardToolExec) {
  try {
    const args = MoveCardArgs.parse(rawArgs ?? {});
    const { canvasId, role, actor } = await callerOf(store, exec);
    requireTool(role, 'move_card');
    exec.signal.throwIfAborted();
    return await store.moveAgentCard(canvasId, args, actor);
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

/** Execute `arrange_frame`: re-sort or cluster the movable cards of a frame. */
export async function arrangeFrameTool(store: CanvasStore, rawArgs: unknown, exec: BoardToolExec) {
  try {
    const args = ArrangeFrameArgs.parse(rawArgs ?? {});
    const { canvasId, role, actor } = await callerOf(store, exec);
    requireTool(role, 'arrange_frame');
    exec.signal.throwIfAborted();
    return await store.arrangeAgentFrame(canvasId, args, actor);
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

/** Execute `reorder_frames` (Orb only). */
export async function reorderFramesTool(store: CanvasStore, rawArgs: unknown, exec: BoardToolExec) {
  try {
    const args = ReorderFramesArgs.parse(rawArgs ?? {});
    const { canvasId, role, actor } = await callerOf(store, exec);
    requireTool(role, 'reorder_frames');
    exec.signal.throwIfAborted();
    return await store.reorderAgentFrames(canvasId, args.order, actor);
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

/** Execute `tidy_board` (Orb only). */
export async function tidyBoardTool(store: CanvasStore, rawArgs: unknown, exec: BoardToolExec) {
  try {
    TidyBoardArgs.parse(rawArgs ?? {});
    const { canvasId, role, actor } = await callerOf(store, exec);
    requireTool(role, 'tidy_board');
    exec.signal.throwIfAborted();
    return await store.tidyAgentBoard(canvasId, actor);
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

// ---- Datasets (P6.3) ----

/** `query_dataset` / `upsert_rows` name the dataset by a card that shows it, or by dataset id. */
const DatasetRefArgs = {
  cardId: z.string().startsWith('c_').max(64).optional(),
  datasetId: z.string().max(64).optional(),
};
export const QueryDatasetArgs = DatasetQuery.extend({
  ...DatasetRefArgs,
  /** Apply the card's active view (its filters and sort) before this query's own. */
  useView: z.boolean().optional(),
});
export type QueryDatasetArgs = z.infer<typeof QueryDatasetArgs>;
export const UpsertRowsArgs = z.strictObject({
  ...DatasetRefArgs,
  /** A column (name) whose value identifies a row: a row with the same value is updated, else added. */
  key: z.string().max(100).optional(),
  rows: z.array(UpsertRow).max(DATASET_LIMITS.upsert),
  removeIds: z.array(z.string().regex(/^r[0-9]+$/)).max(DATASET_LIMITS.upsert).optional(),
}).refine(a => a.rows.length > 0 || !!a.removeIds?.length, 'provide rows or removeIds');
export type UpsertRowsArgs = z.infer<typeof UpsertRowsArgs>;

/** Characters of one cell, and of a whole `query_dataset` answer. */
const QUERY_CELL_CHARS = 200;
const QUERY_OUTPUT_CHARS = RESULT_BUDGET_CHARS;

/** The dataset a call names: by card (a Database card, or a card with a view attached) or by dataset id. */
async function datasetOf(
  store: CanvasStore,
  canvasId: string,
  args: { cardId?: string | undefined; datasetId?: string | undefined },
): Promise<{ dataset: Dataset; card?: Card }> {
  if (!args.cardId && !args.datasetId)
    throw new CanvasError('orb/invalid-args', 'name the dataset with cardId (a database card) or datasetId');
  let id = args.datasetId;
  let card: Card | undefined;
  if (args.cardId) {
    card = (await store.board(canvasId)).card(args.cardId);
    if (!card) throw new CanvasError('orb/not-found', `no card ${JSON.stringify(args.cardId)} on this board`);
    const db = card.type === 'database' ? readCardData(DatabaseData, card.data) : undefined;
    const fromCard = card.view?.datasetId ?? db?.datasetId;
    if (!fromCard)
      throw new CanvasError(
        'orb/invalid-args',
        `card ${card.id} is a ${card.type} card with no dataset attached`,
      );
    if (id && id !== fromCard)
      throw new CanvasError('orb/invalid-args', `card ${card.id} shows dataset ${fromCard}, not ${id}`);
    id = fromCard;
  }
  return { dataset: await store.datasets.read(canvasId, id!), ...(card ? { card } : {}) };
}

const datasetError = (err: unknown): never => {
  if (err instanceof DatasetError || (err as Error)?.name === 'DatasetError')
    throw new Error((err as Error).message);
  return toolError(err);
};

/** Execute `query_dataset`: a structured filter / group / aggregate / sort / limit query (at most 50 rows). */
export async function queryDataset(store: CanvasStore, rawArgs: unknown, exec: BoardToolExec) {
  try {
    const args = QueryDatasetArgs.parse(rawArgs ?? {});
    const { canvasId, role } = await callerOf(store, exec);
    requireTool(role, 'query_dataset');
    const { dataset, card } = await datasetOf(store, canvasId, args);
    exec.signal.throwIfAborted();
    const { cardId: _c, datasetId: _d, useView, ...query } = args;
    if (useView && card?.view) {
      const v = activeView(card.view);
      query.filter = [...v.filter, ...(query.filter ?? [])];
      if (v.match === 'or' && v.filter.length > 1 && (args.filter?.length ?? 0) > 0)
        throw new CanvasError(
          'orb/invalid-args',
          'useView with an OR view cannot be combined with extra filters',
        );
      if (v.match === 'or') query.match = 'or';
      query.sort = query.sort ?? v.sort;
    }
    let result;
    try {
      result = runQuery(dataset, query);
    } catch (err) {
      return datasetError(err);
    }
    // Keep the answer small: long cells are cut, and rows are dropped until the answer fits.
    const cut = (c: unknown) =>
      typeof c === 'string' && c.length > QUERY_CELL_CHARS ? `${c.slice(0, QUERY_CELL_CHARS)}…` : c;
    let rows = result.rows.map((r) => r.map(cut));
    let size = JSON.stringify(rows).length;
    while (rows.length > 1 && size > QUERY_OUTPUT_CHARS) {
      rows = rows.slice(0, Math.max(1, Math.floor(rows.length * 0.7)));
      size = JSON.stringify(rows).length;
    }
    const dropped = result.rows.length - rows.length;
    return {
      datasetId: dataset.id,
      name: dataset.name,
      schema: dataset.columns.map((c) => ({
        name: c.name,
        type: c.type,
        ...(c.options ? { options: c.options.slice(0, 20) } : {}),
      })),
      totalRows: dataset.rows.length,
      columns: result.columns,
      rows,
      ...(result.rowIds ? { rowIds: result.rowIds.slice(0, rows.length) } : {}),
      matched: result.total,
      returned: rows.length,
      ...(result.more + dropped > 0
        ? {
            more: result.more + dropped,
            hint: 'more rows match: raise offset, narrow the filter, or aggregate',
          }
        : {}),
    };
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

/** Execute `upsert_rows`: add or update rows, as the calling role (user rows are never overwritten). */
export async function upsertDatasetRows(store: CanvasStore, rawArgs: unknown, exec: BoardToolExec) {
  try {
    const args = UpsertRowsArgs.parse(rawArgs);
    const { canvasId, role, actor } = await callerOf(store, exec);
    requireTool(role, 'upsert_rows');
    const { dataset } = await datasetOf(store, canvasId, args);
    exec.signal.throwIfAborted();
    const result = await store.datasets.upsert(
      canvasId,
      dataset.id,
      args.rows,
      { ...(args.key ? { key: args.key } : {}), ...(args.removeIds ? { removeIds: args.removeIds } : {}) },
      actor,
    );
    return {
      datasetId: dataset.id,
      added: result.added.length,
      updated: result.updated.length,
      ...(result.removed ? { removed: result.removed.length, removedRowIds: result.removed, removalSkipped: result.removalSkipped } : {}),
      addedRowIds: result.added.slice(0, 50),
      skipped: result.skipped.slice(0, 20),
      totalRows: result.dataset.rows.length,
      summary: datasetSummary(result.dataset).slice(0, 400),
    };
  } catch (err) {
    if (exec.signal.aborted) throw err;
    return toolError(err);
  }
}

/** A tool result as text, with the hard cap of P6.8 as the last line of defence (every tool sizes itself below it). */
const text = (value: unknown) => [{ type: 'text' as const, text: capText(JSON.stringify(value)) }];

/** Parameter DSL entries for the type fields (flat; which apply depends on the card type). */
const FIELD_PARAMS: Record<string, Record<string, unknown>> = {
  detail: {
    type: 'string',
    description:
      'Detailed original analysis for ANY card, up to 20000 characters. Write 2–5 useful paragraphs: evidence and source URLs/card ids, explanation, implications, alternatives and uncertainty. The reader shows it in full; body stays a compact summary. Do not paste full source articles or pad with generic text.',
  },
  title: { type: 'string', description: 'Card title (every type).' },
  body: {
    type: 'string',
    description:
      'Summary text, usually up to 2000 characters (doc up to 20000). Put full multi-paragraph analysis in detail.',
  },
  url: { type: 'string', description: 'source, quote: http(s) link.' },
  excerpts: { type: 'array', items: { type: 'string' }, description: 'source: short excerpts.' },
  sourceCardId: {
    type: 'string',
    description: 'quote: id of its source card; metric: id of the card the figure comes from.',
  },
  asset: { type: 'string', description: 'image, file: "assets/…" path of a file saved in this canvas.' },
  width: { type: 'integer', description: 'image: width in px.' },
  height: { type: 'integer', description: 'image: height in px.' },
  pages: { type: 'integer', description: 'file: page count.' },
  state: { type: 'string', enum: ['open', 'answered'], description: 'question: open or answered.' },
  answer: { type: 'string', description: 'question: the answer, when answered.' },
  kind: { type: 'string', enum: ['risk', 'claim'], description: 'risk: risk or claim.' },
  html: { type: 'string', description: 'design: one self-contained HTML screen.' },
  mermaid: { type: 'string', description: 'diagram: Mermaid source.' },
  columns: {
    type: 'array',
    items: { type: 'string' },
    description: 'table, database, chart (inline data): column names.',
  },
  rows: {
    type: 'array',
    items: { type: 'array', items: { type: 'string' } },
    description: 'table, database, chart (inline data): rows, one string per column (numbers as text).',
  },
  mark: { type: 'string', enum: ['bar', 'line', 'area', 'scatter', 'pie'], description: 'chart: the mark.' },
  x: { type: 'string', description: 'chart: the x-axis column name (the category for a pie).' },
  y: { type: 'string', description: 'chart: the numeric column name (omit to count rows).' },
  color: { type: 'string', description: 'chart: a column that splits the data into series.' },
  agg: {
    type: 'string',
    enum: ['sum', 'avg', 'count', 'min', 'max'],
    description: 'chart: how to combine rows with the same x.',
  },
  datasetId: {
    type: 'string',
    description: 'chart: id of a Database (d_…) to bind to; the chart follows its rows.',
  },
  tableCardId: {
    type: 'string',
    description: 'chart: id of a Table card (c_…) to bind to; the chart follows its rows.',
  },
  value: { type: 'string', description: 'metric: the figure as written ("$4.2B").' },
  unit: { type: 'string', description: 'metric: the unit.' },
  change: { type: 'string', description: 'metric: the change as written ("+12%"); with direction.' },
  direction: {
    type: 'string',
    enum: ['up', 'down', 'flat'],
    description: 'metric: direction of the change.',
  },
  good: { type: 'boolean', description: 'metric: true when the change is good news.' },
  period: { type: 'string', description: 'metric: what the figure covers ("FY2025").' },
  sourceUrl: { type: 'string', description: 'metric: http(s) link to the source of the figure.' },
  sourceLabel: { type: 'string', description: 'metric: plain-text source when there is no link.' },
  note: { type: 'string', description: 'metric: a short qualification.' },
  events: {
    type: 'array',
    items: { type: 'object', additionalProperties: true, properties: {} },
    description:
      'timeline: events, each { date: "2026" | "2026-10" | "2026-10-15", label, detail?, sourceUrl? | sourceCardId? | sourceLabel? (at least one source) }.',
  },
  criteria: {
    type: 'array',
    items: { type: 'object', additionalProperties: true, properties: {} },
    description:
      'matrix or decision: weighted criteria, each { name, weight } (matrix weight 1 to 100; decision weight above 0). Replaces the list on update.',
  },
  options: {
    type: 'array',
    items: { type: 'object', additionalProperties: true, properties: {} },
    description:
      'matrix: 2 to 8 options, each { name, scores: [one number 0 to 10 per criterion, in order; null = unscored], note? }. decision: 2 to 8 options, each { label (unique), note?, scores? (one 0 to 10 per criterion, in the criteria order) }. Replaces the list on update.',
  },
  // P6.5: synthesis cards.
  citations: {
    type: 'array',
    items: { type: 'string' },
    description: 'insight: ids of at least 2 different cards on this board that it rests on.',
  },
  confidence: { type: 'integer', description: 'hypothesis: confidence 0 to 100 (percent).' },
  evidenceFor: {
    type: 'array',
    items: { type: 'string' },
    description: 'hypothesis: ids of cards that support it (replaces the list on update).',
  },
  evidenceAgainst: {
    type: 'array',
    items: { type: 'string' },
    description: 'hypothesis: ids of cards that count against it (replaces the list on update).',
  },
  choice: { type: 'string', description: 'decision: the label of the chosen option.' },
  rationale: { type: 'string', description: 'decision: why that choice.' },
  decisionStatus: {
    type: 'string',
    enum: ['open', 'decided', 'revisit'],
    description: 'decision: its status.',
  },
  variant: {
    type: 'string',
    enum: ['proscons', 'swot', 'quadrant'],
    description: 'framework: pros and cons, SWOT, or a 2x2 quadrant.',
  },
  entries: {
    type: 'array',
    description: 'framework: the items, one per entry (replaces all entries on update).',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        cell: {
          type: 'string',
          required: true,
          description: 'Cell key for the variant (see the type list).',
        },
        text: { type: 'string', required: true, description: 'The item, one short line.' },
      },
    },
  },
  xAxis: { type: 'string', description: 'framework quadrant: name of the horizontal axis.' },
  yAxis: { type: 'string', description: 'framework quadrant: name of the vertical axis.' },
  // P6.6: entity, product, video, code, math, checklist
  entityKind: {
    type: 'string',
    enum: ['person', 'org', 'product', 'competitor'],
    description: 'entity: person | org; product: product | competitor.',
  },
  role: { type: 'string', description: 'entity: job title or role.' },
  org: { type: 'string', description: "entity: the person's organisation." },
  location: { type: 'string', description: 'entity: where they are based.' },
  vendor: { type: 'string', description: 'product: who makes it.' },
  pricing: { type: 'string', description: 'product: pricing in a line.' },
  strengths: { type: 'array', items: { type: 'string' }, description: 'product: short strengths.' },
  weaknesses: { type: 'array', items: { type: 'string' }, description: 'product: short weaknesses.' },
  facts: {
    type: 'array',
    items: {
      type: 'object',
      properties: { label: { type: 'string' }, value: { type: 'string' } },
      additionalProperties: false,
    },
    description: 'entity, product: labelled facts [{label, value}].',
  },
  photo: { type: 'string', description: 'entity: "assets/…" path of a saved image of them.' },
  platform: { type: 'string', description: 'video: YouTube, X, LinkedIn…' },
  author: { type: 'string', description: 'video: channel or author.' },
  duration: { type: 'string', description: 'video: length such as "12:30".' },
  publishedAt: { type: 'string', description: 'video: publish date.' },
  thumbnail: { type: 'string', description: 'video: "assets/…" path of a saved image.' },
  code: { type: 'string', description: 'code: the snippet.' },
  language: { type: 'string', description: 'code: its language.' },
  latex: { type: 'string', description: 'math: LaTeX without $ delimiters.' },
  items: {
    type: 'array',
    items: { type: 'string' },
    description: 'checklist: item texts (you propose, the user ticks).',
  },
};

function fieldParams(): Record<string, Record<string, unknown>> {
  for (const f of AGENT_FIELD_NAMES) {
    if (!FIELD_PARAMS[f]) throw new Error(`board tools: no parameter for card field ${f}`);
  }
  return Object.fromEntries(AGENT_FIELD_NAMES.map((f) => [f, FIELD_PARAMS[f]!]));
}

const AGENT_TYPES = CardType.options.filter((t) => cardDef(t).fields);

export function apply(ctx: any, config: OrbBoardToolsConfig = {}) {
  // Every tool fails at once with the abort reason when its call is already aborted (P3.7).
  const tools = { register: (tool: any) => ctx.tools.register(abortFirst(tool)) };
  const store = ctx.orbCanvas as CanvasStore;
  const fields = fieldParams();

  tools.register(
    defineTool({
      name: 'place_card',
      description:
        'Put one card on the research board. Pick the card type that fits; name a frame (frameId from ' +
        'query_board) and the board lays the card out. A frame holds at most 12 cards: a full frame answers ' +
        'FRAME_FULL with your own cards there (consolidate some, or use another frame). Every card needs a "why": ' +
        'one short line (≤140 chars) on ' +
        'why it belongs on the board. Your role decides which types you may place (Scout: source, quote, image; ' +
        'Critic: question, risk; Builder: design, diagram, table; orb: any but note). Fields per type:\n' +
        fieldGuide(AGENT_TYPES) +
        '\nReturns the new card id, or FRAME_FULL.',
      parameters: {
        type: { type: 'string', enum: [...AGENT_TYPES], required: true, description: 'Card type.' },
        frameId: { type: 'string', description: 'Frame to place the card in. Omit for the open board.' },
        why: { type: 'string', required: true, description: 'Why this card is on the board, ≤140 chars.' },
        badge: { type: 'string', enum: ['must', 'skim'], description: 'Reading badge: Must read or Skim.' },
        threadOf: {
          type: 'string',
          description:
            'When answering a <thread of="…"> message: that card or frame id. The card is placed next to it and ' +
            'linked to it (in a thread turn this is the default).',
        },
        ...fields,
        detail: FIELD_PARAMS.detail,
        title: { type: 'string', required: true, description: 'Card title (every type).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cardId: { type: 'string', description: 'Id of the placed card.' },
            reused: { type: 'boolean', description: 'True when this source URL already has a card: reuse its ID, no new write.' },
            datasetId: {
              type: 'string',
              description: 'database: id of its dataset (for query_dataset and upsert_rows).',
            },
            error: { type: 'string', enum: ['FRAME_FULL'], description: 'Set when the frame is full.' },
            frameId: { type: 'string', description: 'FRAME_FULL: the full frame.' },
            budget: { type: 'integer', description: 'FRAME_FULL: cards a frame may hold.' },
            cards: { type: 'integer', description: 'FRAME_FULL: cards in the frame now.' },
            message: { type: 'string', description: 'FRAME_FULL: what to do next.' },
            ownCards: {
              type: 'array',
              items: { type: 'object', additionalProperties: true, properties: {} },
              description: 'FRAME_FULL: your own cards in the frame (id, type, title, description, why).',
            },
          },
        },
        render: (_args: unknown, value: unknown) => text(value),
      },
      execute: (args: unknown, exec: BoardToolExec) =>
        placeCard(store, args, exec, { delayMs: delayFrom(config) }),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'update_card',
      description:
        'Change a card already on the board: give its id and only the fields to change (same fields as ' +
        'place_card for its type), a new "why", or a badge ("none" clears it). The user\'s notes can never be ' +
        'changed.',
      parameters: {
        cardId: { type: 'string', required: true, description: 'Id of the card to change.' },
        why: { type: 'string', description: 'New why line, ≤140 chars.' },
        badge: {
          type: 'string',
          enum: ['must', 'skim', 'none'],
          description: 'Reading badge; none clears it.',
        },
        ...fields,
        detail: FIELD_PARAMS.detail,
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cardId: { type: 'string', required: true, description: 'Id of the card.' },
            updated: { type: 'boolean', required: true, description: 'True when the card changed.' },
          },
        },
        render: (_args: unknown, value: unknown) => text(value),
      },
      execute: (args: unknown, exec: BoardToolExec) => updateCard(store, args, exec),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'consolidate_cards',
      description:
        'Collapse several of YOUR OWN cards in one frame into a single stack card with a title and a summary, ' +
        'to make room when a frame is full (FRAME_FULL) or to tidy related findings. The stacked cards stay ' +
        "inside the stack. You can only stack cards you placed, never the user's cards or other agents' cards.",
      parameters: {
        cardIds: {
          type: 'array',
          required: true,
          items: { type: 'string' },
          description: `Ids of ${STACK_LIMITS.min} to ${STACK_LIMITS.max} of your own cards, all in the same frame.`,
        },
        title: { type: 'string', required: true, description: 'Title of the stack card.' },
        summary: {
          type: 'string',
          required: true,
          description: 'What the stacked cards say together (the stack card body).',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            stackId: { type: 'string', required: true, description: 'Id of the new stack card.' },
            stacked: { type: 'integer', required: true, description: 'How many cards were stacked.' },
            frameId: { type: 'string', description: 'The frame of the stack.' },
            cards: { type: 'integer', required: true, description: 'Cards in the frame now.' },
            budget: { type: 'integer', required: true, description: 'Cards a frame may hold.' },
          },
        },
        render: (_args: unknown, value: unknown) => text(value),
      },
      execute: (args: unknown, exec: BoardToolExec) => consolidateCards(store, args, exec),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'add_frame',
      description:
        'Add a titled frame (a region of the board that groups cards on one theme, e.g. Thesis, Market, ' +
        'Competitors, Open questions). The board places it; you never give coordinates. A frame with the same ' +
        'title is not added twice (you get the existing one back). Returns its id and number.',
      parameters: {
        title: { type: 'string', required: true, description: 'Short frame title, 1–3 words, ≤80 chars.' },
        color: {
          type: 'string',
          enum: [...FrameColor.options],
          description: 'Palette tone (optional; frames get the next tone otherwise).',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            frameId: { type: 'string', required: true, description: 'Id of the frame.' },
            number: { type: 'string', required: true, description: 'Its number on the board, e.g. 02.' },
            title: { type: 'string', required: true, description: 'Its title.' },
            created: {
              type: 'boolean',
              required: true,
              description: 'False when the frame already existed.',
            },
          },
        },
        render: (_args: unknown, value: unknown) => text(value),
      },
      execute: (args: unknown, exec: BoardToolExec) => addFrame(store, args, exec),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'update_frame',
      description:
        'Rename or recolour a frame (by id from query_board or add_frame). Frames are never moved or resized by agents.',
      parameters: {
        frameId: { type: 'string', required: true, description: 'Id of the frame.' },
        title: { type: 'string', description: 'New title, ≤80 chars.' },
        color: { type: 'string', enum: [...FrameColor.options], description: 'New palette tone.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            frameId: { type: 'string', required: true, description: 'Id of the frame.' },
            title: { type: 'string', required: true, description: 'Its title now.' },
            color: { type: 'string', required: true, description: 'Its tone now.' },
          },
        },
        render: (_args: unknown, value: unknown) => text(value),
      },
      execute: (args: unknown, exec: BoardToolExec) => updateFrame(store, args, exec),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'add_link',
      description:
        'Draw a typed link between two cards or frames (ids from query_board): supports, contradicts, tension, ' +
        'leads-to, example-of, or label (with a short label). The same link is not drawn twice.',
      parameters: {
        from: { type: 'string', required: true, description: 'Card (c_…) or frame (f_…) id.' },
        to: { type: 'string', required: true, description: 'Card (c_…) or frame (f_…) id.' },
        type: { type: 'string', required: true, enum: [...LinkType.options], description: 'Link type.' },
        label: { type: 'string', description: 'label links only: the label, ≤60 chars.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            linkId: { type: 'string', required: true, description: 'Id of the link.' },
            created: { type: 'boolean', required: true, description: 'False when the link already existed.' },
          },
        },
        render: (_args: unknown, value: unknown) => text(value),
      },
      execute: (args: unknown, exec: BoardToolExec) => addLink(store, args, exec),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'write_design_frame',
      description:
        'Draw one screen as a design frame: a self-contained HTML page (inline <style> and <script>; no external ' +
        'files, scripts or fonts; images only as data: URLs) shown live on the board in a sandbox with no network ' +
        '(fetch fails). Scripts run, and Chart.js 4 (global Chart) and D3 v7 (global d3) are preloaded for charts and ' +
        'interactive prototypes. Name the ' +
        'frame (frameId from query_board). To change a design frame (for example when the user asks in chat), call ' +
        'again with its cardId (or the same title in the same frame) and the whole new HTML: the card shows the new ' +
        'version with its time. Returns the card id and the version.',
      parameters: {
        frameId: {
          type: 'string',
          description: 'Frame to place a new design frame in. Omit for the open board.',
        },
        title: { type: 'string', required: true, description: 'Screen name, e.g. "Onboarding, step 1".' },
        html: {
          type: 'string',
          required: true,
          description: `The whole screen as one HTML document (≤${DESIGN_HTML_MAX} chars), inline CSS and scripts only.`,
        },
        body: { type: 'string', description: 'What the screen shows, one or two sentences.' },
        why: {
          type: 'string',
          description: 'Why it is on the board, ≤140 chars (required for a new frame).',
        },
        cardId: { type: 'string', description: 'The design card to rewrite (a new version of it).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cardId: { type: 'string', description: 'Id of the design card.' },
            created: { type: 'boolean', description: 'False when an existing frame got a new version.' },
            version: { type: 'integer', description: 'Version of the frame now (1 for a new one).' },
            updatedAt: { type: 'integer', description: 'When this version was written (ms).' },
            asset: { type: 'string', description: 'Its HTML file in the canvas folder.' },
            error: { type: 'string', enum: ['FRAME_FULL'], description: 'Set when the frame is full.' },
            frameId: { type: 'string', description: 'FRAME_FULL: the full frame.' },
            budget: { type: 'integer', description: 'FRAME_FULL: cards a frame may hold.' },
            cards: { type: 'integer', description: 'FRAME_FULL: cards in the frame now.' },
            message: { type: 'string', description: 'FRAME_FULL: what to do next.' },
            ownCards: {
              type: 'array',
              items: { type: 'object', additionalProperties: true, properties: {} },
              description: 'FRAME_FULL: your own cards in the frame.',
            },
          },
        },
        render: (_args: unknown, value: unknown) => text(value),
      },
      execute: (args: unknown, exec: BoardToolExec) => writeDesignFrame(store, args, exec),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'query_dataset',
      description:
        'Query the rows of a database card (or of any card with a dataset attached) with a structured query: ' +
        'filter, groupBy + aggregate, sort, select, limit (at most 50 rows; page with offset). Name the dataset by ' +
        'cardId (the database card) or datasetId. Columns are named by their column name. No SQL. With no query ' +
        'it returns the schema and the first rows. Plain queries also return rowIds for upsert_rows.',
      parameters: {
        cardId: { type: 'string', description: 'A card that shows the dataset (database card id).' },
        datasetId: { type: 'string', description: 'Or the dataset id (d_…).' },
        filter: {
          type: 'array',
          items: { type: 'object', additionalProperties: true, properties: {} },
          description:
            'Filters {column, op, value}; op is eq, neq, contains, notContains, gt, gte, lt, lte, in, empty or notEmpty.',
        },
        match: {
          type: 'string',
          enum: ['and', 'or'],
          description: 'Combine filters with and (default) or or.',
        },
        select: { type: 'array', items: { type: 'string' }, description: 'Columns to return (default all).' },
        groupBy: { type: 'array', items: { type: 'string' }, description: 'Up to two columns to group by.' },
        aggregate: {
          type: 'array',
          items: { type: 'object', additionalProperties: true, properties: {} },
          description:
            'Aggregates {fn, column, as}; fn is count, sum, avg, min, max or countDistinct (count needs no column).',
        },
        sort: {
          type: 'array',
          items: { type: 'object', additionalProperties: true, properties: {} },
          description: 'Sort keys {column, dir: asc|desc}.',
        },
        limit: {
          type: 'integer',
          description: `Rows to return, 1-${DATASET_LIMITS.query} (default ${DATASET_LIMITS.query}).`,
        },
        offset: { type: 'integer', description: 'Rows to skip (paging).' },
        useView: {
          type: 'boolean',
          description: "Apply the card's active view (its filters and sort) first.",
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            datasetId: { type: 'string' },
            rows: { type: 'array', required: true, items: { type: 'array', items: { type: 'json' } } },
          },
        },
        render: (_args: unknown, value: unknown) => text(value),
      },
      execute: (args: unknown, exec: BoardToolExec) => queryDataset(store, args, exec),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'upsert_rows',
      description:
        `Add or update rows (at most ${DATASET_LIMITS.upsert} per call) of a database card's dataset. Each row is ` +
        '{values: {column name: value}} to add one, or {rowId, values} to update one (rowIds come from ' +
        'query_dataset). With key (a column name), a row whose key value already exists is updated instead of added. ' +
        'Rows the user wrote are never changed by an agent; Scout, Builder only change their own rows. Unknown ' +
        'columns are refused with the list of columns. To remove obsolete agent-written rows or duplicates, merge evidence into a surviving row then pass their exact removeIds (rows may be []). User-written rows are protected; children remove only their own rows. Changes are committed together only after validation. Identical updates write nothing.',
      parameters: {
        cardId: { type: 'string', description: 'The database card (or a card with the dataset attached).' },
        datasetId: { type: 'string', description: 'Or the dataset id (d_…).' },
        key: { type: 'string', description: 'Column name that identifies a row (upsert by key).' },
        removeIds: { type: 'array', items: { type: 'string' }, description: 'Exact obsolete/duplicate row ids to remove, at most 200. Merge evidence into survivors first. Never removes user-written rows.' },
        rows: {
          type: 'array',
          required: true,
          items: { type: 'object', additionalProperties: true, properties: {} },
          description: 'The rows: {rowId?, values: {…}}.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            added: { type: 'integer', required: true },
            updated: { type: 'integer', required: true },
          },
        },
        render: (_args: unknown, value: unknown) => text(value),
      },
      execute: (args: unknown, exec: BoardToolExec) => upsertDatasetRows(store, args, exec),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'query_board',
      description:
        'List cards of the research board: its frames (id, number, title, card count, budget) and one PAGE of cards (id, ' +
        'type, frameId, title, a plain-text description of the content, why, who added it). Filter by frame, card ' +
        'types or words. A page is at most 20 cards by default (limit up to 50, offset to page) and about 4k tokens; ' +
        '"more" says what was left out. On a big board look with board_map and search_board first. Positions are not ' +
        'returned: name a frame to place cards.',
      parameters: {
        frameId: { type: 'string', description: 'Only cards in this frame. Omit for the whole board.' },
        types: {
          type: 'array',
          items: { type: 'string', enum: [...CardType.options] },
          description: 'Only cards of these types.',
        },
        q: { type: 'string', description: 'Only cards whose text contains every one of these words.' },
        limit: {
          type: 'integer',
          description: `Cards in this page (default ${QUERY_PAGE_DEFAULT}, at most ${QUERY_PAGE_MAX}).`,
        },
        offset: { type: 'integer', description: 'Matching cards to skip (paging; use nextOffset).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            frames: {
              type: 'array',
              required: true,
              items: { type: 'object', additionalProperties: true, properties: {} },
            },
            framesMore: { type: 'integer', description: 'Frames left out of the list.' },
            cards: {
              type: 'array',
              required: true,
              items: { type: 'object', additionalProperties: true, properties: {} },
            },
            total: { type: 'integer', description: 'Cards that match.' },
            more: { type: 'integer', description: 'Matching cards left out of this page.' },
            nextOffset: { type: 'integer', description: 'Pass as offset for the next page.' },
            hint: { type: 'string' },
          },
        },
        render: (_args: unknown, value: unknown) => text(value),
      },
      execute: (args: unknown, exec: BoardToolExec) => queryBoard(store, args, exec),
    }),
  );

  const open = { type: 'object', additionalProperties: true, properties: {} };
  const rendered = { render: (_args: unknown, value: unknown) => text(value) };

  tools.register(
    defineTool({
      name: 'board_map',
      description:
        'See a big board in one screen (about 3k tokens at most): every frame with its card count, type mix, a one-line ' +
        'digest and its top card titles (ids included), the open board, and the databases. Start here when the board ' +
        "has more than a few dozen cards. Pass frameId to list that frame's cards (id, type, title), paged with offset.",
      parameters: {
        frameId: { type: 'string', description: 'List the cards of this frame instead of the whole map.' },
        offset: { type: 'integer', description: 'Frames (or, with frameId, cards) to skip.' },
        limit: {
          type: 'integer',
          description: `With frameId: cards in this page (default 60, at most ${MAP_CARDS_MAX}).`,
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: { frames: { type: 'array', items: open } },
        },
        ...rendered,
      },
      execute: (args: unknown, exec: BoardToolExec) => boardMapTool(store, args, exec),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'search_board',
      description:
        'Find cards by words (full-text search over every card on this board, including the rows of databases): ' +
        'returns ids, types, titles, frame and a snippet around the match, best first. Every word must match (prefixes ' +
        'count). Then read_card for the whole card. Use it before reading anything: it is the cheap way to find a fact.',
      parameters: {
        q: { type: 'string', description: 'Words to find (names, numbers, terms).', required: true },
        frameId: { type: 'string', description: 'Only cards in this frame.' },
        types: {
          type: 'array',
          items: { type: 'string', enum: [...CardType.options] },
          description: 'Only cards of these types.',
        },
        limit: {
          type: 'integer',
          description: `Hits in this page (default ${SEARCH_DEFAULT}, at most ${SEARCH_MAX}).`,
        },
        offset: { type: 'integer', description: 'Hits to skip (paging; use nextOffset).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: { hits: { type: 'array', required: true, items: open } },
        },
        ...rendered,
      },
      execute: (args: unknown, exec: BoardToolExec) => searchBoardTool(store, args, exec),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'read_card',
      description:
        'Read one card in full: its header, summary and whole text, in pages of at most 8,000 characters (page 2, 3… ' +
        'for more). For a database use query_dataset; for the page behind a source or quote card use read_source.',
      parameters: {
        cardId: { type: 'string', description: 'The card id (c_…).', required: true },
        page: { type: 'integer', description: 'Page number, from 1.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: { text: { type: 'string', required: true } },
        },
        ...rendered,
      },
      execute: (args: unknown, exec: BoardToolExec) => readCardTool(store, args, exec),
    } as any),
  );

  const LAYOUT_RULES =
    'You never give coordinates: the board lays cards out. Cards the user wrote or moved by hand are pinned and never ' +
    'move. The whole change is one undo step for the user and shows in the activity panel.';
  tools.register(
    defineTool({
      name: 'move_card',
      description:
        'Re-file one card into another frame (the board picks the cell). orb may move any unpinned card; Scout, Critic ' +
        'and Builder only the cards they placed. A full frame (12 cards) refuses. ' +
        LAYOUT_RULES,
      parameters: {
        cardId: { type: 'string', description: 'The card to move (c_…).', required: true },
        frameId: { type: 'string', description: 'The frame to move it into (f_…).', required: true },
      },
      output: {
        schema: { type: 'object', additionalProperties: true, properties: { moved: { type: 'boolean' } } },
        ...rendered,
      },
      execute: (args: unknown, exec: BoardToolExec) => moveCardTool(store, args, exec),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'arrange_frame',
      description:
        'Re-sort or cluster the cards of one frame: by importance (must-read first, then insights, decisions, metrics…), ' +
        'date (oldest first), type, source (cards of one site together) or cluster (linked cards together). orb arranges ' +
        'any unpinned card; Scout, Critic and Builder only their own. ' +
        LAYOUT_RULES,
      parameters: {
        frameId: { type: 'string', description: 'The frame to arrange (f_…).', required: true },
        by: { type: 'string', enum: [...ARRANGE_BY], description: 'The order.', required: true },
      },
      output: {
        schema: { type: 'object', additionalProperties: true, properties: { moved: { type: 'integer' } } },
        ...rendered,
      },
      execute: (args: unknown, exec: BoardToolExec) => arrangeFrameTool(store, args, exec),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'reorder_frames',
      description:
        'Put the frames in a reading order (their numbers follow): the listed frame ids first, in that order, the rest ' +
        'after. Only orb. ' +
        LAYOUT_RULES,
      parameters: {
        order: {
          type: 'array',
          items: { type: 'string' },
          description: 'Frame ids (f_…) in the order to read them.',
          required: true,
        },
      },
      output: {
        schema: { type: 'object', additionalProperties: true, properties: { changed: { type: 'boolean' } } },
        ...rendered,
      },
      execute: (args: unknown, exec: BoardToolExec) => reorderFramesTool(store, args, exec),
    } as any),
  );

  tools.register(
    defineTool({
      name: 'tidy_board',
      description:
        'Close the gaps and fix the overlaps on the whole board (agent cards are laid out again around the pinned ones; ' +
        'agent frames that overlap move apart). Only orb. ' +
        LAYOUT_RULES,
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: true, properties: { moved: { type: 'integer' } } },
        ...rendered,
      },
      execute: (args: unknown, exec: BoardToolExec) => tidyBoardTool(store, args, exec),
    } as any),
  );
}
