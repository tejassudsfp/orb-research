import { z } from 'zod';
import { CardView } from './dataset.js';

export const AgentName = z.enum(['orb', 'scout', 'critic', 'builder']);
export type AgentName = z.infer<typeof AgentName>;

export const Actor = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user') }),
  z.object({
    kind: z.literal('agent'),
    agent: AgentName,
    model: z.string(),
    /** llm-pi-ai provider route of `model` (e.g. `deepseek`), when known. */
    provider: z.string().optional(),
    sessionId: z.string(),
    toolCallId: z.string().optional(),
    /**
     * P3.6: the last event seq of the agent's harness session when the tool ran (its `tool/call` is at or before
     * it). The provenance view loads the turn that produced the card through `session/page` with
     * `throughSeq: eventSeq` (PRD Agents › Provenance: "the session event range").
     */
    eventSeq: z.number().int().nonnegative().optional(),
  }),
]);
export type Actor = z.infer<typeof Actor>;

export const CardType = z.enum([
  'note',
  'source',
  'quote',
  'image',
  'file',
  'question',
  'risk',
  'design',
  'diagram',
  'table',
  'doc',
  'database',
  'chart',
  'metric',
  'timeline',
  'matrix',
  'insight',
  'hypothesis',
  'decision',
  'framework',
  'entity',
  'product',
  'video',
  'code',
  'math',
  'checklist',
  'research',
  'watch',
]);
export type CardType = z.infer<typeof CardType>;

export const BoardEventType = z.enum([
  'frame.added',
  'frame.updated',
  'frame.removed',
  'card.added',
  'card.moved',
  'card.updated',
  'card.removed',
  'card.stacked',
  'link.added',
  'link.removed',
  'thread.message',
  'board.arranged',
  'card.opened',
  'context.changed',
  'viewport.saved',
  'undo.marker',
]);
export type BoardEventType = z.infer<typeof BoardEventType>;

export const Provenance = z.intersection(Actor, z.object({ at: z.number() }));
export type Provenance = z.infer<typeof Provenance>;

export const Card = z.object({
  id: z.string().startsWith('c_'),
  type: CardType,
  frameId: z.string().nullable(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  data: z.unknown(),
  why: z.string().max(140).optional(),
  /** Original, detailed analysis behind any card's compact summary (never a copy of a fetched page). */
  detail: z.string().max(20_000).optional(),
  badge: z.enum(['must', 'skim']).optional(),
  provenance: Provenance,
  opened: z.boolean().optional(),
  note: z.string().optional(),
  stackedInto: z.string().optional(),
  /**
   * P6.8: the user placed this card by hand (a drag). Set by the fold from a user's `card.moved`; with the user's own
   * cards it is what agents' layout tools never move ({@link isPinned}).
   */
  userMoved: z.literal(true).optional(),
  /**
   * P6.11: a template's seed card (a placeholder placed when the canvas was created). It is the user's by provenance
   * (they picked the template) but agents' layout may still move it until the user drags it ({@link isPinned}), and it
   * does not lock its frame against being pushed down by an agent's placement.
   */
  seed: z.literal(true).optional(),
  /** P6.3: the dataset views this card shows (a Database card's own, or a view attached to any card). */
  view: CardView.optional(),
});
export type Card = z.infer<typeof Card>;

/** Palette tones a frame can take (PRD Design system; the prototype's Thesis/Harness/Card plugins/Open questions). */
export const FrameColor = z.enum(['sky', 'signal', 'rho', 'paper']);
export type FrameColor = z.infer<typeof FrameColor>;

/**
 * A frame: a titled, numbered region of the board (PRD Canvas › Frames). Its number (`01`, `02`…) is its position
 * in insertion order, derived by the renderer, so it is not stored.
 */
export const Frame = z.object({
  id: z.string().startsWith('f_'),
  title: z.string().trim().min(1).max(80),
  color: FrameColor,
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  provenance: Provenance,
});
export type Frame = z.infer<typeof Frame>;

/** Link types (PRD Canvas › Links). `label` is a free label carried in `Link.label`. */
export const LinkType = z.enum(['supports', 'contradicts', 'tension', 'leads-to', 'example-of', 'label']);
export type LinkType = z.infer<typeof LinkType>;

/** Link types drawn with the prototype's dashed accent style. */
export const DASHED_LINK_TYPES: readonly LinkType[] = ['tension', 'contradicts'];

/** A card (`c_…`) or frame (`f_…`) id: a link endpoint. */
export const LinkEnd = z.string().regex(/^[cf]_/);

/**
 * A link between two cards or frames. `label` is required for type `label` and optional (ignored) otherwise.
 */
export const LinkFields = z.object({
  id: z.string().startsWith('l_'),
  from: LinkEnd,
  to: LinkEnd,
  type: LinkType,
  label: z.string().trim().min(1).max(60).optional(),
  provenance: Provenance,
});
const linkRules = <T extends { from: string; to: string; type: LinkType; label?: string | undefined }>(
  schema: z.ZodType<T>,
) =>
  schema
    .refine((l) => l.from !== l.to, { message: 'a link needs two different ends' })
    .refine((l) => l.type !== 'label' || l.label !== undefined, { message: 'a label link needs a label' });
export const Link = linkRules(LinkFields);
/** A link as a client proposes it: the service mints `id` and stamps `provenance`. */
export const LinkDraft = linkRules(LinkFields.omit({ id: true, provenance: true }));
export type LinkDraft = z.infer<typeof LinkDraft>;
export type Link = z.infer<typeof Link>;

/** What `frame.updated` may change (rename, recolour, move, resize). */
export const FramePatch = z
  .object({
    title: Frame.shape.title,
    color: FrameColor,
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: 'empty frame patch' });
export type FramePatch = z.infer<typeof FramePatch>;

/**
 * What `card.updated` may change (resize, content, badge, note, frame membership). `null` clears `badge`, `why` or
 * `note` (undo of a first badge/why/note uses it, P2.4).
 */
export const CardPatch = z
  .object({
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
    data: z.unknown(),
    why: z.string().max(140).nullable(),
    detail: z.string().max(20_000).nullable(),
    badge: z.enum(['must', 'skim']).nullable(),
    note: z.string().nullable(),
    frameId: z.string().nullable(),
    /** P6.3: `null` detaches the dataset view. */
    view: CardView.nullable(),
    /** P6.3: a Table card promoted to a Database card (the data changes with it). */
    type: CardType,
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: 'empty card patch' });
export type CardPatch = z.infer<typeof CardPatch>;

/** One card position in a `card.moved` (optionally re-homing it to a frame, or `null` = no frame). */
export const CardMove = z.object({
  id: z.string().startsWith('c_'),
  x: z.number(),
  y: z.number(),
  frameId: z.string().nullable().optional(),
  /**
   * P6.8: set or clear the card's "placed by hand" flag. Absent: a user's move sets it, an agent's move leaves it
   * (undo writes it explicitly, so undoing an agent's tidy never pins the cards). `null`: leave the flag as it is
   * whoever moves it (a card carried along by its frame's drag).
   */
  pinned: z.boolean().nullable().optional(),
});
export type CardMove = z.infer<typeof CardMove>;

// ---- Per-type payloads ----

/**
 * `index` (P2.4) re-inserts the item at that position of its record's insertion order (clamped), instead of at the
 * end. Undo uses it to restore a removed card, frame or link where it was: insertion order is draw order for cards
 * and the label number for frames. Re-adding an existing id replaces it (at `index`, or in place).
 */
const AddIndex = z.number().int().nonnegative().optional();

export const FrameAddedData = z.object({ frame: Frame, index: AddIndex });
export const FrameUpdatedData = z.object({ id: z.string().startsWith('f_'), patch: FramePatch });
/** Removing a frame keeps its cards (they lose their frameId) and drops links that touch the frame. */
export const FrameRemovedData = z.object({ id: z.string().startsWith('f_') });
export const CardAddedData = z.object({ card: Card, index: AddIndex });
/**
 * `card.moved`: one drag, recorded on release. A group move is ONE event with several `moves`. The Phase 1 form
 * `{id, x, y}` (one card) is still read.
 */
export const CardMovedData = z.union([
  z.object({ moves: z.array(CardMove).min(1) }),
  z.object({ id: z.string(), x: z.number(), y: z.number() }),
]);
export type CardMovedData = z.infer<typeof CardMovedData>;
export const CardUpdatedData = z.object({ id: z.string().startsWith('c_'), patch: CardPatch });
/** Removing cards also drops the links that touch them. */
export const CardRemovedData = z.object({ ids: z.array(z.string().startsWith('c_')).min(1) });
export const LinkAddedData = z.object({ link: Link, index: AddIndex });
export const LinkRemovedData = z.object({ ids: z.array(z.string().startsWith('l_')).min(1) });
export const CardOpenedData = z.object({ id: z.string().startsWith('c_') });

/** Longest thread message kept in board.jsonl (a model reply longer than this is cut, with an ellipsis). */
export const THREAD_MESSAGE_MAX = 20_000;

/**
 * `thread.message` (P3.6, PRD Chat and threads › Threads): one message of the thread of card or frame `of`. The
 * user's messages are written when `orb/chat.send` gets a `threadOf`; Orb's reply is written when the turn that
 * answered it ends. Who wrote it is the event's actor. The model-side turns stay in Orb's harness session.
 */
export const ThreadMessageData = z.object({
  id: z.string().startsWith('t_'),
  of: z.string().regex(/^[cf]_/),
  text: z.string().min(1).max(THREAD_MESSAGE_MAX),
});
export type ThreadMessageData = z.infer<typeof ThreadMessageData>;

/** A thread message as the fold keeps it: the payload plus its author and time. */
export const ThreadMessage = ThreadMessageData.extend({
  by: z.union([AgentName, z.literal('user')]),
  at: z.number(),
});
export type ThreadMessage = z.infer<typeof ThreadMessage>;
/**
 * `board.arranged` (P6.8): the activity record of one agent rearrangement (`move_card`, `arrange_frame`,
 * `reorder_frames`, `tidy_board`). It is appended FIRST in the same unit as the moves it describes (so a client knows to glide the cards
 * that follow), and the activity panel can say "Scout arranged 01 Market by importance"; the moves themselves are `card.moved` / `frame.updated` /
 * `frame.added` events. The fold keeps the newest {@link ARRANGEMENTS_KEPT} in `BoardState.arrangements`.
 */
export const ARRANGE_OPS = ['move_card', 'arrange_frame', 'reorder_frames', 'tidy_board'] as const;
export const ArrangedData = z.object({
  op: z.enum(ARRANGE_OPS),
  /** A one-line summary for the activity panel. */
  text: z.string().min(1).max(200),
  /** Cards (or frames) the line links to (at most 30). */
  ids: z.array(z.string().regex(/^[cf]_/)).max(30),
  /** How many cards or frames moved. */
  count: z.number().int().nonnegative(),
});
export type ArrangedData = z.infer<typeof ArrangedData>;
/** An arrangement as the fold keeps it: the payload plus its author and time. */
export const Arrangement = ArrangedData.extend({ by: AgentName, at: z.number() });
export type Arrangement = z.infer<typeof Arrangement>;
/** Arrangement records the fold keeps (oldest dropped). */
export const ARRANGEMENTS_KEPT = 200;

/**
 * `card.stacked` (P3.2, `consolidate_cards`): the cards `ids` are collapsed into the stack card `stackId` (added just
 * before, in the same append). The fold sets their `stackedInto`; they stay in the board, hidden.
 */
export const CardStackedData = z
  .object({
    stackId: z.string().startsWith('c_'),
    ids: z.array(z.string().startsWith('c_')).min(1),
  })
  .refine((d) => !d.ids.includes(d.stackId), { message: 'a card cannot be stacked into itself' });
export type CardStackedData = z.infer<typeof CardStackedData>;
/**
 * `undo.marker` (P2.4): written first in the same append as the compensating events of one undo or redo; `count`
 * is how many events follow it. The fold only advances seq for it.
 */
export const UndoMarkerData = z.object({ op: z.enum(['undo', 'redo']), count: z.number().int().positive() });
export type UndoMarkerData = z.infer<typeof UndoMarkerData>;

/** The moves of a `card.moved` payload in one shape. */
export const movesOf = (data: CardMovedData): CardMove[] =>
  'moves' in data ? data.moves : [data as CardMove];

export const BoardEvent = z.object({
  v: z.literal(1),
  seq: z.number().int().nonnegative(),
  ts: z.number(),
  type: BoardEventType,
  actor: Actor,
  data: z.unknown(),
});
export type BoardEvent = z.infer<typeof BoardEvent>;

const dataSchemas: Partial<Record<BoardEventType, z.ZodType>> = {
  'frame.added': FrameAddedData,
  'frame.updated': FrameUpdatedData,
  'frame.removed': FrameRemovedData,
  'card.added': CardAddedData,
  'card.moved': CardMovedData,
  'card.updated': CardUpdatedData,
  'card.removed': CardRemovedData,
  'card.opened': CardOpenedData,
  'thread.message': ThreadMessageData,
  'board.arranged': ArrangedData,
  'card.stacked': CardStackedData,
  'link.added': LinkAddedData,
  'link.removed': LinkRemovedData,
  'undo.marker': UndoMarkerData,
};

/** The per-type payload schema of an event type (undefined for types not folded yet). */
export const boardEventDataSchema = (type: BoardEventType): z.ZodType | undefined => dataSchemas[type];

/** Validate an event envelope plus its per-type payload. Throws on invalid input. */
export function parseBoardEvent(input: unknown): BoardEvent {
  const event = BoardEvent.parse(input);
  dataSchemas[event.type]?.parse(event.data);
  return event;
}

/** P6.8: a card agents' layout tools never move: the user's own cards and notes, and any card the user dragged. */
export const isPinned = (
  card: Pick<Card, 'provenance' | 'userMoved'> & { seed?: true | undefined },
): boolean => card.userMoved === true || (card.provenance.kind === 'user' && card.seed !== true);
