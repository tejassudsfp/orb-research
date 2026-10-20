/**
 * The board fold (BUILD_PLAN P1.7, P2.3): the pure function that turns `board.jsonl` events into board state. It
 * lives in `@orb/shared` so the canvas service (replay on open, live state) and the UI (follow stream, optimistic
 * commands) fold identically.
 *
 * Folded types: `frame.added|updated|removed`, `card.added|moved|updated|removed|opened|stacked`,
 * `link.added|removed`, `thread.message` (P3.6: appended to `threads[of]`, created on the first message). `undo.marker`
 * (P2.4) is validated and only advances `seq`: the compensating events after it do the work. Every other known type
 * (`context.changed`, `viewport.saved`) only advances `seq` until the task that owns it. A thread outlives its card
 * (an undone removal brings the card back with its thread).
 *
 * Rules the fold applies (the canvas service validates commands against them before appending):
 * - an update, move or removal of an unknown id is ignored (the event still advances seq);
 * - removing a card drops the links that touch it, and removing a stack card (P3.2) also removes the cards stacked
 *   into it (recursively); removing a frame drops its links and detaches its cards
 *   (`frameId: null`), the cards themselves stay on the board;
 * - a link whose end is missing when it is added is ignored;
 * - an `*.added` with `index` (P2.4, undo) re-inserts the item at that position of the insertion order;
 * - `card.stacked` (P3.2) sets `stackedInto` on the listed cards that exist (the stack card itself is never stacked).
 */
import {
  ARRANGEMENTS_KEPT,
  ArrangedData,
  CardAddedData,
  CardMovedData,
  CardOpenedData,
  CardRemovedData,
  CardStackedData,
  CardUpdatedData,
  FrameAddedData,
  FrameRemovedData,
  FrameUpdatedData,
  LinkAddedData,
  LinkRemovedData,
  movesOf,
  ThreadMessageData,
  type BoardEvent,
  type Arrangement,
  type BoardEventType,
  type Card,
  type Frame,
  type Link,
  type ThreadMessage,
} from './board.js';

export type BoardState = {
  /** seq of the last folded event; -1 when nothing has been folded. */
  seq: number;
  cards: Record<string, Card>;
  frames: Record<string, Frame>;
  links: Record<string, Link>;
  /**
   * P3.6: thread messages per card or frame id, oldest first. Absent until the board has a thread message, so a
   * board without threads folds exactly as before.
   */
  threads?: Record<string, ThreadMessage[]>;
  /** P6.8: the newest agent rearrangements, oldest first. Absent until there is one. */
  arrangements?: Arrangement[];
};

export const emptyBoard = (): BoardState => ({ seq: -1, cards: {}, frames: {}, links: {} });

/** One board change without envelope: what an event (or an optimistic command) does to the board. */
export type BoardChange = { type: BoardEventType; data: unknown; actor?: BoardEvent['actor']; ts?: number };

type Records = Omit<BoardState, 'seq'>;
type RecordKey = 'cards' | 'frames' | 'links';
/** Copy-on-write view of the records: a record is copied the first time a change writes to it. */
class Draft {
  private copied = { cards: false, frames: false, links: false, threads: false, arrangements: false };
  constructor(public r: Records) {}
  w<K extends RecordKey>(key: K): Records[K] {
    if (!this.copied[key]) {
      this.r = { ...this.r, [key]: { ...this.r[key] } };
      this.copied[key] = true;
    }
    return this.r[key];
  }
  arrangements(): Arrangement[] {
    if (!this.copied.arrangements) {
      this.r = { ...this.r, arrangements: [...(this.r.arrangements ?? [])] };
      this.copied.arrangements = true;
    }
    return this.r.arrangements!;
  }
  threads(): Record<string, ThreadMessage[]> {
    if (!this.copied.threads) {
      this.r = { ...this.r, threads: { ...this.r.threads } };
      this.copied.threads = true;
    }
    return this.r.threads!;
  }
}

export class BoardFoldError extends Error {
  override name = 'BoardFoldError';
}

function dropLinksTouching(d: Draft, ends: Set<string>): void {
  for (const link of Object.values(d.r.links)) {
    if (ends.has(link.from) || ends.has(link.to)) delete d.w('links')[link.id];
  }
}

/**
 * Put `value` under `id` in `record`. Without `index` a new id goes last and an existing one is replaced in place;
 * with `index` the id is (re)inserted at that position of the key order (clamped to the end).
 */
function put<T>(d: Draft, key: RecordKey, id: string, value: T, index: number | undefined): void {
  const rec = d.w(key) as Record<string, T>;
  if (index === undefined) {
    rec[id] = value;
    return;
  }
  const keys = Object.keys(rec).filter((k) => k !== id);
  if (index >= keys.length) {
    delete rec[id];
    rec[id] = value;
    return;
  }
  const entries = keys.map((k) => [k, rec[k]] as const);
  for (const k of keys) delete rec[k];
  delete rec[id];
  entries.forEach(([k, v], i) => {
    if (i === index) rec[id] = value;
    rec[k] = v as T;
  });
}

/**
 * `ids` plus every card stacked into one of them, recursively (removing a stack removes what it holds). Only ids of
 * existing cards are returned.
 */
export function withStacked(cards: Record<string, Card>, ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of ids) if (id in cards) out.add(id);
  if (out.size === 0) return out;
  let grew = true;
  while (grew) {
    grew = false;
    for (const card of Object.values(cards)) {
      if (card.stackedInto && out.has(card.stackedInto) && !out.has(card.id)) {
        out.add(card.id);
        grew = true;
      }
    }
  }
  return out;
}

const exists = (r: Records, id: string) => (id.startsWith('c_') ? id in r.cards : id in r.frames);

/** Apply one change to the draft. Validates the per-type payload (throws on an invalid one). */
function mutate(d: Draft, { type, data, actor, ts }: BoardChange): void {
  switch (type) {
    case 'frame.added': {
      const { frame, index } = FrameAddedData.parse(data);
      put(d, 'frames', frame.id, frame, index);
      break;
    }
    case 'frame.updated': {
      const { id, patch } = FrameUpdatedData.parse(data);
      const frame = d.r.frames[id];
      if (frame) d.w('frames')[id] = { ...frame, ...patch };
      break;
    }
    case 'frame.removed': {
      const { id } = FrameRemovedData.parse(data);
      if (!(id in d.r.frames)) break;
      delete d.w('frames')[id];
      for (const card of Object.values(d.r.cards)) {
        if (card.frameId === id) d.w('cards')[card.id] = { ...card, frameId: null };
      }
      dropLinksTouching(d, new Set([id]));
      break;
    }
    case 'card.added': {
      const { card, index } = CardAddedData.parse(data);
      put(d, 'cards', card.id, card, index);
      break;
    }
    case 'card.moved': {
      for (const { id, x, y, frameId, pinned } of movesOf(CardMovedData.parse(data))) {
        const card = d.r.cards[id];
        if (!card) continue;
        const next: Card = frameId === undefined ? { ...card, x, y } : { ...card, x, y, frameId };
        // P6.8: a move by the user pins the card; `pinned` says it outright (undo of an agent's move clears it).
        const pin = pinned === null ? undefined : (pinned ?? (actor?.kind === 'user' ? true : undefined));
        // (A user's own card is pinned by its provenance; the flag is only kept on agent cards.)
        if (pin === true && (card.provenance.kind === 'agent' || card.seed === true)) next.userMoved = true;
        else if (pin === false) delete next.userMoved;
        d.w('cards')[id] = next;
      }
      break;
    }
    case 'card.updated': {
      const { id, patch } = CardUpdatedData.parse(data);
      const card = d.r.cards[id];
      if (!card) break;
      const { badge, why, note, view, detail, ...rest } = patch;
      const next: Card = { ...card, ...rest };
      // `null` clears an optional field; `undefined` (absent) leaves it.
      if (badge === null) delete next.badge;
      else if (badge !== undefined) next.badge = badge;
      if (why === null) delete next.why;
      else if (why !== undefined) next.why = why;
      if (note === null) delete next.note;
      else if (note !== undefined) next.note = note;
      if (detail === null) delete next.detail;
      else if (detail !== undefined) next.detail = detail;
      if (view === null) delete next.view;
      else if (view !== undefined) next.view = view;
      d.w('cards')[id] = next;
      break;
    }
    case 'card.removed': {
      const { ids } = CardRemovedData.parse(data);
      const gone = withStacked(d.r.cards, ids);
      if (gone.size === 0) break;
      const cards = d.w('cards');
      for (const id of gone) delete cards[id];
      dropLinksTouching(d, gone);
      break;
    }
    case 'card.opened': {
      const { id } = CardOpenedData.parse(data);
      const card = d.r.cards[id];
      if (card && !card.opened) d.w('cards')[id] = { ...card, opened: true };
      break;
    }
    case 'card.stacked': {
      const { stackId, ids } = CardStackedData.parse(data);
      for (const id of ids) {
        const card = d.r.cards[id];
        if (card && card.stackedInto !== stackId) d.w('cards')[id] = { ...card, stackedInto: stackId };
      }
      break;
    }
    case 'link.added': {
      const { link, index } = LinkAddedData.parse(data);
      if (exists(d.r, link.from) && exists(d.r, link.to)) put(d, 'links', link.id, link, index);
      break;
    }
    case 'link.removed': {
      const { ids } = LinkRemovedData.parse(data);
      for (const id of ids) if (id in d.r.links) delete d.w('links')[id];
      break;
    }
    case 'thread.message': {
      const message = ThreadMessageData.parse(data);
      const by = actor?.kind === 'agent' ? actor.agent : 'user';
      const threads = d.threads();
      const list = threads[message.of] ?? [];
      if (list.some((m) => m.id === message.id)) break;
      threads[message.of] = [...list, { ...message, by, at: ts ?? 0 }];
      break;
    }
    case 'board.arranged': {
      const arranged = ArrangedData.parse(data);
      // Only an agent's rearrangement is recorded (the user's own moves are the user's undo stack).
      if (actor?.kind !== 'agent') break;
      const list = d.arrangements();
      list.push({ ...arranged, by: actor.agent, at: ts ?? 0 });
      if (list.length > ARRANGEMENTS_KEPT) list.splice(0, list.length - ARRANGEMENTS_KEPT);
      break;
    }
    default:
      break;
  }
}

function step(d: Draft, seq: number, event: BoardEvent): number {
  if (event.seq !== seq + 1)
    throw new BoardFoldError(`board fold: expected seq ${seq + 1}, got ${event.seq}`);
  mutate(d, event);
  return event.seq;
}

const records = ({ cards, frames, links, threads, arrangements }: BoardState): Records => ({
  cards,
  frames,
  links,
  ...(threads ? { threads } : {}),
  ...(arrangements ? { arrangements } : {}),
});

/**
 * Pure fold step: returns a new state and never mutates `state`. Throws on a seq gap or an invalid payload. Only
 * the records the event touches are copied, so untouched records and cards keep their identity (cheap React memo).
 */
export function applyEvent(state: BoardState, event: BoardEvent): BoardState {
  const d = new Draft(records(state));
  const seq = step(d, state.seq, event);
  return { seq, ...d.r };
}

/**
 * Apply changes WITHOUT an envelope or seq (the UI's optimistic view of pending commands). Same rules as the fold;
 * `seq` is kept.
 */
export function applyChanges(state: BoardState, changes: Iterable<BoardChange>): BoardState {
  const d = new Draft(records(state));
  for (const change of changes) mutate(d, change);
  return { seq: state.seq, ...d.r };
}

/** Fold a sequence of events onto `initial` (default: the empty board). */
export function fold(events: Iterable<BoardEvent>, initial: BoardState = emptyBoard()): BoardState {
  const d = new Draft(records(initial));
  let seq = initial.seq;
  for (const event of events) seq = step(d, seq, event);
  return { seq, ...d.r };
}

/** Cards of a state in a stable order (insertion order of their `card.added`). */
export const boardCards = (state: BoardState): Card[] => Object.values(state.cards);

/** Frames of a state in insertion order (their label number is the 1-based position). */
export const boardFrames = (state: BoardState): Frame[] => Object.values(state.frames);

/** The messages of the thread of card or frame `id`, oldest first (empty when it has none). */
export const threadOf = (state: BoardState, id: string): ThreadMessage[] => state.threads?.[id] ?? [];

/** Links of a state in insertion order. */
export const boardLinks = (state: BoardState): Link[] => Object.values(state.links);
