/**
 * `orb/board.command` (BUILD_PLAN §2.3, P2.3): the user commands, and `planCommand`, the ONE place that turns a
 * command into board changes. The canvas service plans with real ids and provenance and appends the changes as
 * events; the UI plans the same command with temporary ids to show it optimistically until the events arrive.
 *
 * A command appends one event, except `batch`, which appends its commands' events back to back (atomically: either
 * every command in it is valid, or nothing is written).
 */
import { z } from 'zod';
import { Card, CardMove, CardPatch, Frame, FramePatch, LinkDraft, type Actor, type Link } from './board.js';
import { cardDataSchema } from './cardTypes.js';
import { checklistTickViolation } from './mediaCards.js';
import { applyChanges, type BoardChange, type BoardState } from './fold.js';

/** A client-chosen id echoed on the follow stream with the events a command wrote (optimistic UI reconcile). */
export const PendingId = z.string().min(1).max(64);

/** A card as a client proposes it: the service mints `id` and stamps `provenance`. */
export const CardDraft = Card.omit({ id: true, provenance: true }).extend({
  frameId: z.string().nullable().default(null),
  // P5.5 (fuzz): a new card has a real size, as `card.updated` already requires (the event schema stays lenient
  // so older logs still open).
  w: z.number().positive(),
  h: z.number().positive(),
});
export type CardDraft = z.infer<typeof CardDraft>;

/** A frame as a client proposes it: the service mints `id` and stamps `provenance`. */
export const FrameDraft = Frame.omit({ id: true, provenance: true });
export type FrameDraft = z.infer<typeof FrameDraft>;

const base = { pendingId: PendingId.optional() };
const cardId = z.string().startsWith('c_');
const frameId = z.string().startsWith('f_');

/**
 * `adopt` (P6.9): cards that join the new frame in the same command (a frame drawn over loose cards adopts them). The
 * plan appends one `card.moved` (same x/y, `frameId` = the new frame), so the frame and its members are one undo step.
 */
export const AddFrameCommand = z.object({
  ...base,
  type: z.literal('frame.added'),
  frame: FrameDraft,
  adopt: z.array(cardId).max(1000).optional(),
});
export const UpdateFrameCommand = z.object({
  ...base,
  type: z.literal('frame.updated'),
  id: frameId,
  patch: FramePatch,
});
export const RemoveFrameCommand = z.object({ ...base, type: z.literal('frame.removed'), id: frameId });
export const AddCardCommand = z.object({ ...base, type: z.literal('card.added'), card: CardDraft });
/**
 * Move cards: `moves` (a drag of one or several selected cards, recorded on release as ONE event), or the Phase 1
 * single form `{id, x, y}`.
 */
export const MoveCardCommand = z.object({
  ...base,
  type: z.literal('card.moved'),
  moves: z.array(CardMove).min(1).max(1000).optional(),
  id: cardId.optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});
export const UpdateCardCommand = z.object({
  ...base,
  type: z.literal('card.updated'),
  id: cardId,
  patch: CardPatch,
});
export const RemoveCardCommand = z.object({
  ...base,
  type: z.literal('card.removed'),
  ids: z.array(cardId).min(1).max(1000),
});
export const AddLinkCommand = z.object({ ...base, type: z.literal('link.added'), link: LinkDraft });
export const RemoveLinkCommand = z.object({
  ...base,
  type: z.literal('link.removed'),
  ids: z.array(z.string().startsWith('l_')).min(1).max(1000),
});

/**
 * Record that the user opened a card (P2.5: the reader, a source link, a file). It ticks the card in the reading
 * queue. It is not an edit: the service writes `card.opened` once per card (never for a card already opened) and
 * keeps it off the undo stack. Not allowed inside a batch.
 */
export const OpenCardCommand = z.object({ ...base, type: z.literal('card.opened'), id: cardId });

/** One command that appends one event. */
export const SingleBoardCommand = z.discriminatedUnion('type', [
  AddFrameCommand,
  UpdateFrameCommand,
  RemoveFrameCommand,
  AddCardCommand,
  MoveCardCommand,
  UpdateCardCommand,
  RemoveCardCommand,
  AddLinkCommand,
  RemoveLinkCommand,
]);
export type SingleBoardCommand = z.infer<typeof SingleBoardCommand>;

/** Several commands as one user action (e.g. a frame dragged with its cards, a multi-selection deleted). */
export const BatchCommand = z.object({
  ...base,
  type: z.literal('batch'),
  commands: z.array(SingleBoardCommand).min(1).max(100),
});

/** User commands accepted by `orb/board.command`. */
export const BoardCommand = z.discriminatedUnion('type', [
  AddFrameCommand,
  UpdateFrameCommand,
  RemoveFrameCommand,
  AddCardCommand,
  MoveCardCommand,
  UpdateCardCommand,
  RemoveCardCommand,
  AddLinkCommand,
  RemoveLinkCommand,
  BatchCommand,
  OpenCardCommand,
]);
export type BoardCommand = z.infer<typeof BoardCommand>;
/** What a client may send (`card.frameId` optional, defaulting to null). */
export type BoardCommandInput = z.input<typeof BoardCommand>;

export type BoardCommandErrorCode = 'not-found' | 'invalid' | 'forbidden';

/** A command that does not fit the board it is applied to (unknown id, agent touching a user note…). */
export class BoardCommandError extends Error {
  override name = 'BoardCommandError';
  constructor(
    readonly code: BoardCommandErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export type PlanContext = {
  actor: Actor;
  now: number;
  /** Mint a new id with this prefix (`c_`, `f_`, `l_`). */
  mintId: (prefix: 'c' | 'f' | 'l') => string;
};

const isUserNote = (state: BoardState, id: string) => {
  const card = state.cards[id];
  return card?.type === 'note' && card.provenance.kind === 'user';
};

function needCard(state: BoardState, id: string): void {
  if (!state.cards[id])
    throw new BoardCommandError('not-found', `no card ${JSON.stringify(id)}`, { cardId: id });
}
function needFrame(state: BoardState, id: string | null | undefined): void {
  if (id && !state.frames[id])
    throw new BoardCommandError('not-found', `no frame ${JSON.stringify(id)}`, { frameId: id });
}
function needEnd(state: BoardState, id: string): void {
  if (id.startsWith('c_')) needCard(state, id);
  else needFrame(state, id);
}
/** Card data must match its type's schema (cards.ts); the issue is reported with the card type. */
function needCardData(type: Card['type'], data: unknown): void {
  const parsed = cardDataSchema(type).safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BoardCommandError(
      'invalid',
      `invalid ${type} card data${issue ? `: ${issue.path.join('.') || 'data'} ${issue.message}` : ''}`,
      { cardType: type },
    );
  }
}
function agentMayNotTouchNote(state: BoardState, ctx: PlanContext, id: string): void {
  if (ctx.actor.kind === 'agent' && isUserNote(state, id)) {
    throw new BoardCommandError('forbidden', `agents cannot change the user's note ${id}`, { cardId: id });
  }
}
/** P6.6: an agent never ticks a checklist item (the user's flags): see `checklistTickViolation`. */
function agentMayNotTick(ctx: PlanContext, type: Card['type'], before: unknown, after: unknown): void {
  if (ctx.actor.kind !== 'agent' || type !== 'checklist') return;
  const why = checklistTickViolation(before, after);
  if (why) throw new BoardCommandError('forbidden', why);
}
const unique = <T>(items: T[]): T[] => [...new Set(items)];

/** Plan one single command against `state`. */
function planOne(state: BoardState, cmd: SingleBoardCommand, ctx: PlanContext): BoardChange {
  const provenance = { ...ctx.actor, at: ctx.now };
  switch (cmd.type) {
    case 'frame.added':
      return { type: 'frame.added', data: { frame: { ...cmd.frame, id: ctx.mintId('f'), provenance } } };
    case 'frame.updated':
      needFrame(state, cmd.id);
      return { type: 'frame.updated', data: { id: cmd.id, patch: cmd.patch } };
    case 'frame.removed':
      needFrame(state, cmd.id);
      return { type: 'frame.removed', data: { id: cmd.id } };
    case 'card.added':
      needFrame(state, cmd.card.frameId);
      needCardData(cmd.card.type, cmd.card.data);
      agentMayNotTick(ctx, cmd.card.type, undefined, cmd.card.data);
      return { type: 'card.added', data: { card: { ...cmd.card, id: ctx.mintId('c'), provenance } } };
    case 'card.moved': {
      let moves = cmd.moves;
      if (!moves) {
        if (cmd.id === undefined || cmd.x === undefined || cmd.y === undefined)
          throw new BoardCommandError('invalid', 'card.moved needs `moves` or `id`, `x` and `y`');
        moves = [{ id: cmd.id, x: cmd.x, y: cmd.y }];
      } else if (cmd.id !== undefined) {
        throw new BoardCommandError('invalid', 'card.moved takes `moves` or `id`, not both');
      }
      if (new Set(moves.map((m) => m.id)).size !== moves.length)
        throw new BoardCommandError('invalid', 'card.moved lists a card twice');
      for (const m of moves) {
        needCard(state, m.id);
        needFrame(state, m.frameId);
        agentMayNotTouchNote(state, ctx, m.id);
      }
      // The Phase 1 single form is kept on disk as written (it is still read by the fold).
      return {
        type: 'card.moved',
        data: cmd.moves ? { moves } : { id: moves[0]!.id, x: moves[0]!.x, y: moves[0]!.y },
      };
    }
    case 'card.updated':
      needCard(state, cmd.id);
      needFrame(state, cmd.patch.frameId);
      agentMayNotTouchNote(state, ctx, cmd.id);
      if (cmd.patch.type !== undefined && ctx.actor.kind === 'agent')
        throw new BoardCommandError('forbidden', "agents cannot change a card's type", { cardId: cmd.id });
      if ('data' in cmd.patch) needCardData(cmd.patch.type ?? state.cards[cmd.id]!.type, cmd.patch.data);
      else if (cmd.patch.type !== undefined) needCardData(cmd.patch.type, state.cards[cmd.id]!.data);
      if ('data' in cmd.patch)
        agentMayNotTick(ctx, state.cards[cmd.id]!.type, state.cards[cmd.id]!.data, cmd.patch.data);
      return { type: 'card.updated', data: { id: cmd.id, patch: cmd.patch } };
    case 'card.removed': {
      const ids = unique(cmd.ids);
      for (const id of ids) {
        needCard(state, id);
        agentMayNotTouchNote(state, ctx, id);
      }
      return { type: 'card.removed', data: { ids } };
    }
    case 'link.added': {
      needEnd(state, cmd.link.from);
      needEnd(state, cmd.link.to);
      const link: Link = { ...cmd.link, id: ctx.mintId('l'), provenance };
      if (link.type !== 'label') delete link.label;
      return { type: 'link.added', data: { link } };
    }
    case 'link.removed': {
      const ids = unique(cmd.ids);
      for (const id of ids) {
        if (!state.links[id])
          throw new BoardCommandError('not-found', `no link ${JSON.stringify(id)}`, { linkId: id });
      }
      return { type: 'link.removed', data: { ids } };
    }
  }
}

/**
 * Validate `command` against `state` and return the changes it makes, in order. A batch is planned command by
 * command on the board as the earlier ones leave it. Throws BoardCommandError (nothing to append) when any part
 * does not fit.
 */
export function planCommand(state: BoardState, command: BoardCommand, ctx: PlanContext): BoardChange[] {
  if (command.type === 'card.opened') {
    needCard(state, command.id);
    return [{ type: 'card.opened', data: { id: command.id } }];
  }
  const commands = command.type === 'batch' ? command.commands : [command];
  const changes: BoardChange[] = [];
  let scratch = state;
  for (const [i, cmd] of commands.entries()) {
    const change = planOne(scratch, cmd, ctx);
    const own: BoardChange[] = [change];
    if (cmd.type === 'frame.added' && cmd.adopt?.length) {
      const frameId = (change.data as { frame: { id: string } }).frame.id;
      const moves = unique(cmd.adopt).map((id) => {
        needCard(scratch, id);
        agentMayNotTouchNote(scratch, ctx, id);
        const c = scratch.cards[id]!;
        return { id, x: c.x, y: c.y, frameId };
      });
      own.push({ type: 'card.moved', data: { moves } });
    }
    changes.push(...own);
    if (i < commands.length - 1) scratch = applyChanges(scratch, own);
  }
  return changes;
}

// ---- Undo and redo (P2.4) ----

/**
 * Undo the user's last action on this canvas in this app session (`redo` re-applies the last undone one). The
 * canvas service keeps the stack; it appends compensating events after an `undo.marker` (see history.ts).
 */
export const HistoryCommand = z.object({ ...base, type: z.enum(['undo', 'redo']) });
export type HistoryCommand = z.infer<typeof HistoryCommand>;

/**
 * P6.20: the renderer reports the heights it measured for cards at full detail (card id → natural height in px). Not
 * an edit: the canvas service turns it into `card.updated` (`h`) events and a reflow of the frames concerned
 * (`planMeasured`), never on the undo stack. Only the user's window sends it.
 */
export const MeasureCommand = z.object({
  type: z.literal('layout.measured'),
  heights: z
    .record(z.string().startsWith('c_'), z.number().positive().max(4000))
    .refine((h) => Object.keys(h).length > 0 && Object.keys(h).length <= 200, {
      message: 'between 1 and 200 heights',
    }),
});
export type MeasureCommand = z.infer<typeof MeasureCommand>;

/** Everything `orb/board.command` accepts: a board command, a layout measurement, or undo/redo. */
export const RepackCommand = z.object({ type: z.literal('layout.repacked') });
export const BoardCommandRequest = z.union([BoardCommand, MeasureCommand, RepackCommand, HistoryCommand]);
export type BoardCommandRequest = z.infer<typeof BoardCommandRequest>;
export type BoardCommandRequestInput = z.input<typeof BoardCommandRequest>;

export const isMeasureCommand = (command: { type: string }): command is MeasureCommand =>
  command.type === 'layout.measured';

export const isHistoryCommand = (command: { type: string }): command is HistoryCommand =>
  command.type === 'undo' || command.type === 'redo';
