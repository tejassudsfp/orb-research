/** Explicit user action: bring an existing board onto the compact frame layout, with one-step undo. */
import { boardFrames, isPinned, stackOf, type BoardChange, type BoardState, type Card } from '@orb/shared';
import { CELLS, LAYOUT, cellOf, visibleCards, type Rect } from './layout.js';
import { bestBoardWidth, bestFrameSize, packFrames } from './templatePlan.js';

export function planRepack(state: BoardState): BoardChange[] {
  const frames = boardFrames(state);
  const locked = new Set(
    Object.values(state.cards)
      .filter(isPinned)
      .flatMap((c) => (c.frameId ? [c.frameId] : [])),
  );
  const movable = frames.filter((f) => !locked.has(f.id));
  if (!movable.length) return [];
  const reading = (a: Card, b: Card) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id);
  const groups = movable.map((f) =>
    visibleCards(state)
      .filter((c) => c.frameId === f.id)
      .sort(reading),
  );
  // Use the current measured height, and the type's grid width. Pinned cards are excluded above.
  const sized = groups.map((cards) =>
    bestFrameSize(
      cards.map((c) => ({ ...cellOf(c), cols: CELLS[stackOf(c) ? 'stack' : c.type].cols })),
      48,
    ),
  );
  const x0 = Math.min(...frames.map((f) => f.x));
  const y0 = Math.min(...frames.map((f) => f.y));
  const fixed: Rect[] = [
    ...frames.filter((f) => locked.has(f.id)),
    ...visibleCards(state).filter((c) => !c.frameId),
  ].map((r) => ({ ...r, x: r.x - x0, y: r.y - y0 }));
  const packed = packFrames(sized, bestBoardWidth(sized), LAYOUT.frameGap, fixed);
  const changes: BoardChange[] = [];
  const moves: { id: string; x: number; y: number; pinned: null }[] = [];
  movable.forEach((frame, i) => {
    const size = sized[i]!;
    const x = x0 + packed.at[i]!.x;
    const y = y0 + packed.at[i]!.y;
    if (frame.x !== x || frame.y !== y || frame.w !== size.w || frame.h !== size.h)
      changes.push({ type: 'frame.updated', data: { id: frame.id, patch: { x, y, w: size.w, h: size.h } } });
    groups[i]!.forEach((card, j) => {
      const r = size.rects[j]!;
      if (card.w !== r.w || card.h !== r.h)
        changes.push({ type: 'card.updated', data: { id: card.id, patch: { w: r.w, h: r.h } } });
      if (card.x !== x + r.x || card.y !== y + r.y)
        moves.push({ id: card.id, x: x + r.x, y: y + r.y, pinned: null });
    });
    for (const card of Object.values(state.cards))
      if (card.frameId === frame.id && card.stackedInto && (frame.x !== x || frame.y !== y))
        moves.push({ id: card.id, x: card.x + x - frame.x, y: card.y + y - frame.y, pinned: null });
  });
  if (moves.length) changes.push({ type: 'card.moved', data: { moves } });
  return changes;
}
