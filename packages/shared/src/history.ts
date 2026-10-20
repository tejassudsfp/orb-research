/**
 * Undo and redo (BUILD_PLAN P2.4, PRD Canvas › History): compensating changes.
 *
 * `invertChanges(state, changes)` returns the changes that take the board from `applyChanges(state, changes)` back
 * to `state`. Undo appends them as new events (the log is never rewritten); redo appends the inverse of the undo,
 * computed the same way against the board the undo started from. Both are pure, so the canvas service (which keeps
 * the per-session user-action stack) and the property tests use the same code.
 *
 * Every user command type has an exact inverse:
 * - `*.added` → `*.removed` (or the replaced item re-added, when the add overwrote an existing id);
 * - `frame.updated` / `card.updated` → the same type with the previous values of the patched fields (`null` clears
 *   a `badge`, `why` or `note` the card did not have);
 * - `card.moved` → `card.moved` to the previous positions and frames;
 * - `card.removed` → the cards re-added at their former positions in insertion order (`index`), then the links the
 *   removal dropped (a removed stack card's stacked cards are re-added too, still stacked: the fold removed them);
 * - `frame.removed` → the frame re-added at its position, its cards re-attached (one `card.moved`), its links
 *   re-added;
 * - `link.removed` → the links re-added at their positions.
 * Types that are not user commands (`card.opened`, `thread.message`…) have no inverse here.
 */
import {
  CardAddedData,
  CardMovedData,
  CardRemovedData,
  CardUpdatedData,
  FrameAddedData,
  FrameRemovedData,
  FrameUpdatedData,
  LinkAddedData,
  LinkRemovedData,
  movesOf,
  type Card,
  type CardMove,
  type CardPatch,
  type FramePatch,
  type Link,
} from './board.js';
import { applyChanges, withStacked, type BoardChange, type BoardState } from './fold.js';

const indexIn = (record: Record<string, unknown>) => {
  const keys = Object.keys(record);
  return (id: string) => keys.indexOf(id);
};

/** `link.added` changes that restore `links` (all from `before`) at their positions, in ascending order. */
function restoreLinks(before: BoardState, links: Link[]): BoardChange[] {
  const at = indexIn(before.links);
  return links
    .map((link) => ({ link, index: at(link.id) }))
    .sort((a, b) => a.index - b.index)
    .map(({ link, index }) => ({ type: 'link.added', data: { link, index } }));
}

const linksTouching = (state: BoardState, ends: Set<string>): Link[] =>
  Object.values(state.links).filter((l) => ends.has(l.from) || ends.has(l.to));

const pinFlag = (card: Card): { pinned?: boolean } =>
  card.provenance.kind === 'agent' || card.seed === true ? { pinned: card.userMoved === true } : {};

/** The inverse of ONE change applied to `before` (empty when the change did nothing). */
export function invertChange(before: BoardState, change: BoardChange): BoardChange[] {
  const { type, data } = change;
  switch (type) {
    case 'frame.added': {
      const { frame } = FrameAddedData.parse(data);
      const old = before.frames[frame.id];
      if (old) return [{ type: 'frame.added', data: { frame: old, index: indexIn(before.frames)(old.id) } }];
      return [{ type: 'frame.removed', data: { id: frame.id } }];
    }
    case 'frame.updated': {
      const { id, patch } = FrameUpdatedData.parse(data);
      const frame = before.frames[id];
      if (!frame) return [];
      const back: Record<string, unknown> = {};
      for (const key of Object.keys(patch) as (keyof FramePatch)[]) back[key] = frame[key];
      return [{ type: 'frame.updated', data: { id, patch: back } }];
    }
    case 'frame.removed': {
      const { id } = FrameRemovedData.parse(data);
      const frame = before.frames[id];
      if (!frame) return [];
      const out: BoardChange[] = [
        { type: 'frame.added', data: { frame, index: indexIn(before.frames)(id) } },
      ];
      const members = Object.values(before.cards).filter((c) => c.frameId === id);
      if (members.length > 0) {
        out.push({
          type: 'card.moved',
          data: { moves: members.map((c) => ({ id: c.id, x: c.x, y: c.y, frameId: id, ...pinFlag(c) })) },
        });
      }
      out.push(...restoreLinks(before, linksTouching(before, new Set([id]))));
      return out;
    }
    case 'card.added': {
      const { card } = CardAddedData.parse(data);
      const old = before.cards[card.id];
      if (old) return [{ type: 'card.added', data: { card: old, index: indexIn(before.cards)(old.id) } }];
      return [{ type: 'card.removed', data: { ids: [card.id] } }];
    }
    case 'card.moved': {
      const seen = new Set<string>();
      const moves: CardMove[] = [];
      for (const { id } of movesOf(CardMovedData.parse(data))) {
        const card = before.cards[id];
        if (!card || seen.has(id)) continue;
        seen.add(id);
        // P6.8: an agent's card says outright whether it was placed by hand (the user's own cards are always pinned).
        moves.push({ id, x: card.x, y: card.y, frameId: card.frameId, ...pinFlag(card) });
      }
      return moves.length > 0 ? [{ type: 'card.moved', data: { moves } }] : [];
    }
    case 'card.updated': {
      const { id, patch } = CardUpdatedData.parse(data);
      const card = before.cards[id];
      if (!card) return [];
      const back: Record<string, unknown> = {};
      for (const key of Object.keys(patch) as (keyof CardPatch)[]) {
        const value = card[key];
        back[key] =
          value === undefined &&
          (key === 'badge' || key === 'why' || key === 'note' || key === 'view' || key === 'detail')
            ? null
            : value;
      }
      return [{ type: 'card.updated', data: { id, patch: back } }];
    }
    case 'card.removed': {
      const { ids } = CardRemovedData.parse(data);
      const gone = [...withStacked(before.cards, ids)];
      if (gone.length === 0) return [];
      const at = indexIn(before.cards);
      const cards: BoardChange[] = gone
        .map((id) => ({ card: before.cards[id]!, index: at(id) }))
        .sort((a, b) => a.index - b.index)
        .map(({ card, index }) => ({ type: 'card.added', data: { card, index } }));
      return [...cards, ...restoreLinks(before, linksTouching(before, new Set(gone)))];
    }
    case 'link.added': {
      const { link } = LinkAddedData.parse(data);
      const old = before.links[link.id];
      if (old) return [{ type: 'link.added', data: { link: old, index: indexIn(before.links)(old.id) } }];
      // The fold ignores a link whose end is missing: then nothing happened.
      const has = (end: string) => (end.startsWith('c_') ? end in before.cards : end in before.frames);
      return has(link.from) && has(link.to) ? [{ type: 'link.removed', data: { ids: [link.id] } }] : [];
    }
    case 'link.removed': {
      const { ids } = LinkRemovedData.parse(data);
      const links = [...new Set(ids)].flatMap((id) => (before.links[id] ? [before.links[id]] : []));
      return restoreLinks(before, links);
    }
    default:
      return [];
  }
}

/**
 * The compensating changes of `changes` applied in order to `before`: each change is inverted against the board as
 * the earlier ones left it, and the inverses run in reverse order.
 */
export function invertChanges(before: BoardState, changes: readonly BoardChange[]): BoardChange[] {
  const inverses: BoardChange[][] = [];
  let state = before;
  for (const [i, change] of changes.entries()) {
    inverses.push(invertChange(state, change));
    if (i < changes.length - 1) state = applyChanges(state, [change]);
  }
  return inverses.reverse().flat();
}

/** True when `a` and `b` hold the same records (same object identity: the fold copies only what it changes). */
export const sameRecords = (a: BoardState, b: BoardState): boolean =>
  a.cards === b.cards && a.frames === b.frames && a.links === b.links;
