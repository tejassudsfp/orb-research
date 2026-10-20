/**
 * Semantic layout (P6.8, PLAN "Agent layout tools"): how an agent re-files, re-sorts and tidies cards WITHOUT ever
 * choosing a coordinate. Pure and harness-free, like layout.ts: each planner takes the folded board and returns the
 * changes to append (as ONE undoable group, see `Board.appendAgentGroup`), computed by the layout engine.
 *
 * Rules, enforced here and not by prompts:
 * - **Pinned cards never move** ({@link isPinned}): the user's own cards and notes, and any card the user dragged.
 *   They stay where they are and are obstacles the movable cards are laid out around.
 * - A role gate (`mayMove`) narrows what an agent may touch further: Scout, Critic and Builder only their own cards.
 * - Frames that hold a pinned card are never moved, and frames are only moved by `tidy`.
 * - The result is a diff against the board (`diffChanges`): only what really moves is written, as `frame.updated`
 *   patches and one `card.moved`; nothing when the board is already arranged.
 */
import {
  applyChanges,
  boardFrames,
  boardLinks,
  cardTitle,
  isPinned,
  type BoardChange,
  type BoardState,
  type Card,
  type CardType,
  type Frame,
} from '@orb/shared';
import { LAYOUT, cellOf, diffChanges, layoutChanges, placeOnBoard, relayoutFrame, visibleCards, type Rect } from './layout.js';

export { diffChanges };

/** `arrange_frame` orders. */
export const ARRANGE_BY = ['importance', 'date', 'type', 'source', 'cluster'] as const;
export type ArrangeBy = (typeof ARRANGE_BY)[number];

/** True when the calling role may rearrange this card (on top of the pin rule). */
export type Mover = (card: Card) => boolean;

/** A planned rearrangement: the changes (empty when nothing moves) and the ids that move. */
export type ArrangePlan = { changes: BoardChange[]; movedCards: string[]; movedFrames: string[] };

const NONE: ArrangePlan = { changes: [], movedCards: [], movedFrames: [] };

/** Cards an agent may rearrange: visible, not pinned, and allowed by the role gate. */
export const isMovable = (card: Card, mayMove: Mover): boolean =>
  !card.stackedInto && !isPinned(card) && mayMove(card);

/** Visible cards of a frame (or of the open board for null). */
const cardsOf = (state: BoardState, frameId: string | null): Card[] =>
  visibleCards(state).filter((c) => c.frameId === frameId);

// ---- Sorting ----

/** Types in the order of "importance" (what a reader wants first), the rest after. */
const IMPORTANCE: readonly CardType[] = [
  'insight',
  'decision',
  'hypothesis',
  'metric',
  'chart',
  'matrix',
  'framework',
  'timeline',
  'risk',
  'question',
  'source',
  'quote',
];
const typeRank = (type: CardType): number => {
  const i = IMPORTANCE.indexOf(type);
  return i < 0 ? IMPORTANCE.length : i;
};
const badgeRank = (card: Card) => (card.badge === 'must' ? 0 : card.badge === 'skim' ? 2 : 1);
const atOf = (card: Card) => card.provenance.at;

/** The site a card came from (its url or source url), for `by: source`. */
export function sourceHost(card: Card): string {
  const d = (card.data ?? {}) as Record<string, unknown>;
  const raw = [d.url, d.sourceUrl, d.link].find((v) => typeof v === 'string' && v) as string | undefined;
  if (!raw) return '';
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const byId = (a: Card, b: Card) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Link degree of each card among `ids` (links with both ends in the set). */
function degrees(state: BoardState, ids: ReadonlySet<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of boardLinks(state)) {
    if (!ids.has(l.from) || !ids.has(l.to)) continue;
    out.set(l.from, (out.get(l.from) ?? 0) + 1);
    out.set(l.to, (out.get(l.to) ?? 0) + 1);
  }
  return out;
}

/** Connected components of the cards joined by links (largest first; ties by oldest member). */
function clusters(state: BoardState, cards: readonly Card[]): Card[][] {
  const ids = new Set(cards.map((c) => c.id));
  const parent = new Map(cards.map((c) => [c.id, c.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const l of boardLinks(state)) {
    if (ids.has(l.from) && ids.has(l.to)) parent.set(find(l.from), find(l.to));
  }
  const groups = new Map<string, Card[]>();
  for (const c of cards) groups.set(find(c.id), [...(groups.get(find(c.id)) ?? []), c]);
  return [...groups.values()].sort(
    (a, b) => b.length - a.length || Math.min(...a.map(atOf)) - Math.min(...b.map(atOf)) || byId(a[0]!, b[0]!),
  );
}

/** The cards in the order `by` asks for (a total order: ties end on the id). */
export function sortCards(state: BoardState, cards: readonly Card[], by: ArrangeBy): Card[] {
  const ids = new Set(cards.map((c) => c.id));
  const deg = degrees(state, ids);
  const degree = (c: Card) => deg.get(c.id) ?? 0;
  const list = [...cards];
  switch (by) {
    case 'importance':
      return list.sort(
        (a, b) =>
          badgeRank(a) - badgeRank(b) ||
          typeRank(a.type) - typeRank(b.type) ||
          degree(b) - degree(a) ||
          atOf(a) - atOf(b) ||
          byId(a, b),
      );
    case 'date':
      // Oldest first: the order the research happened in.
      return list.sort((a, b) => atOf(a) - atOf(b) || byId(a, b));
    case 'type':
      return list.sort(
        (a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) || atOf(a) - atOf(b) || byId(a, b),
      );
    case 'source': {
      // Cards of one site together (sites in the order they first appear), cards without one last.
      const first = new Map<string, number>();
      for (const c of [...list].sort((a, b) => atOf(a) - atOf(b) || byId(a, b))) {
        const h = sourceHost(c);
        if (!first.has(h)) first.set(h, first.size);
      }
      const rank = (c: Card) => {
        const h = sourceHost(c);
        return h === '' ? Number.MAX_SAFE_INTEGER : first.get(h)!;
      };
      return list.sort((a, b) => rank(a) - rank(b) || atOf(a) - atOf(b) || byId(a, b));
    }
    case 'cluster': {
      const groups = clusters(state, list);
      const linked = groups.filter((g) => g.length > 1);
      const loose = groups.filter((g) => g.length === 1).map((g) => g[0]!);
      const within = (g: Card[]) => g.sort((a, b) => degree(b) - degree(a) || atOf(a) - atOf(b) || byId(a, b));
      return [...linked.flatMap(within), ...sortCards(state, loose, 'type')];
    }
  }
}

/**
 * Reading order of cards as they lie now: top to bottom, then left to right, exactly (the layout engine fills the
 * lowest free row first, so this is the order it placed them in: tidying twice gives the same board).
 */
export const readingOrder = (cards: readonly Card[]): Card[] =>
  [...cards].sort((a, b) => a.y - b.y || a.x - b.x || byId(a, b));

// ---- Diffing ----

const planOf = (before: BoardState, after: BoardState): ArrangePlan => {
  const changes = diffChanges(before, after);
  if (changes.length === 0) return NONE;
  const movedCards = Object.values(after.cards)
    .filter((c) => {
      const o = before.cards[c.id];
      return o && (o.x !== c.x || o.y !== c.y || o.frameId !== c.frameId);
    })
    .map((c) => c.id);
  const movedFrames = boardFrames(after)
    .filter((f) => {
      const o = before.frames[f.id];
      return o && (o.x !== f.x || o.y !== f.y);
    })
    .map((f) => f.id);
  return { changes, movedCards, movedFrames };
};

// ---- Planners ----

const relayout = relayoutFrame;

/** `arrange_frame`: re-sort or cluster the movable cards of a frame. */
export function planArrangeFrame(
  state: BoardState,
  frameId: string,
  by: ArrangeBy,
  mayMove: Mover,
): ArrangePlan {
  if (!state.frames[frameId]) return NONE;
  const movable = cardsOf(state, frameId).filter((c) => isMovable(c, mayMove));
  if (movable.length === 0) return NONE;
  return planOf(state, relayout(state, frameId, sortCards(state, movable, by)));
}

/** `move_card`: re-file one card into another frame; the layout engine picks its cell. */
export function planMoveCard(state: BoardState, cardId: string, frameId: string): ArrangePlan {
  const card = state.cards[cardId];
  const frame = state.frames[frameId];
  if (!card || !frame) return NONE;
  const { rect, changes } = layoutChanges(state, frameId, cellOf(card), new Set([card.id]));
  const after = applyChanges(state, [
    ...changes,
    { type: 'card.moved', data: { moves: [{ id: card.id, x: rect.x, y: rect.y, frameId }] } },
  ]);
  return planOf(state, after);
}

/** `reorder_frames`: the listed frames first, in that order; the others keep their order after them. */
export function planReorderFrames(state: BoardState, order: readonly string[]): BoardChange[] {
  const frames = boardFrames(state);
  const listed = [...new Set(order)].filter((id) => state.frames[id]);
  const rest = frames.filter((f) => !listed.includes(f.id)).map((f) => f.id);
  const next = [...listed, ...rest];
  if (next.every((id, i) => frames[i]!.id === id)) return [];
  // Re-adding a frame under its own id re-inserts it at `index` (the fold's undo rule), so the order is rewritten
  // without touching the frames or their cards; undo restores each frame's old index.
  return next.map((id, index) => ({ type: 'frame.added' as const, data: { frame: state.frames[id]!, index } }));
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * `tidy_board`: close the gaps and fix the overlaps, without taking any pinned card from its place. Each frame's
 * movable cards are laid out again in the order they read now; movable open-board cards are placed clear of every
 * frame and card; a frame that overlaps another and holds no pinned card moves below it, with its cards.
 */
export function planTidy(state: BoardState, mayMove: Mover): ArrangePlan {
  // One pass can leave work for the next (a frame that grew pushed another; cards that were laid out around cards
  // that then moved), so tidy passes until the board stops changing, at most a few times. Two frames that both hold
  // pinned cards and overlap cannot be separated by any agent, and their movable cards may keep trading cells: the
  // last pass stands then.
  let current = state;
  for (let pass = 0; pass < 4; pass++) {
    const next = tidyPass(current, mayMove);
    if (next === current) break;
    current = next;
  }
  return planOf(state, current);
}

function tidyPass(state: BoardState, mayMove: Mover): BoardState {
  let scratch = state;
  const order = boardFrames(state).map((f) => f.id);
  const locked = (s: BoardState, id: string) => cardsOf(s, id).some((c) => isPinned(c) || !mayMove(c));
  // Frames lying on top of each other: the later one moves below the earlier (with its cards), or, when the later one
  // holds a pinned card, the earlier one moves below it. A frame that holds a pinned card never moves.
  const separate = () => {
    const move = (id: string, below: Frame) => {
      const cur = scratch.frames[id]!;
      const dy = below.y + below.h + LAYOUT.frameGap - cur.y;
      const inside = cardsOf(scratch, id);
      scratch = applyChanges(scratch, [
        { type: 'frame.updated', data: { id, patch: { y: cur.y + dy } } },
        ...(inside.length > 0
          ? [{ type: 'card.moved' as const, data: { moves: inside.map((c) => ({ id: c.id, x: c.x, y: c.y + dy, pinned: null })) } }]
          : []),
      ]);
    };
    const free = (id: string) => !locked(scratch, id) && scratch.frames[id]!.provenance.kind !== 'user';
    for (let guard = 0; guard < order.length * order.length + 4; guard++) {
      let moved = false;
      for (let i = 0; i < order.length && !moved; i++)
        for (let j = i + 1; j < order.length && !moved; j++) {
          const a = scratch.frames[order[i]!]!;
          const b = scratch.frames[order[j]!]!;
          if (!overlaps(a, b)) continue;
          if (free(b.id)) {
            move(b.id, a);
            moved = true;
          } else if (free(a.id)) {
            move(a.id, b);
            moved = true;
          }
        }
      if (!moved) return;
    }
  };
  // Each frame: movable cards in the order they read now, into the first free cells (a frame that grows can run into
  // the next one, so frames are separated again afterwards; two rounds settle it).
  for (let round = 0; round < 2; round++) {
    separate();
    for (const id of order) {
      const movable = cardsOf(scratch, id).filter((c) => isMovable(c, mayMove));
      if (movable.length > 0) scratch = relayout(scratch, id, readingOrder(movable));
    }
  }
  separate();
  // The open board: movable cards clear of frames and each other.
  const loose = cardsOf(scratch, null).filter((c) => isMovable(c, mayMove));
  if (loose.length > 0) {
    const skip = new Set(loose.map((c) => c.id));
    for (const card of readingOrder(loose)) {
      const rect = placeOnBoard(scratch, cellOf(card), skip);
      skip.delete(card.id);
      scratch = applyChanges(scratch, [
        { type: 'card.moved', data: { moves: [{ id: card.id, x: rect.x, y: rect.y }] } },
      ]);
    }
  }
  return diffChanges(state, scratch).length === 0 ? state : scratch;
}

/** A short title for a frame in activity lines: `01 Market`. */
export const frameLabelOf = (state: BoardState, frame: Frame): string =>
  `${String(boardFrames(state).findIndex((f) => f.id === frame.id) + 1).padStart(2, '0')} ${frame.title}`;

export { cardTitle };
