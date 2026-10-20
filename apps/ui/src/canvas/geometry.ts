/**
 * Board editing math (P2.3), pure so it is unit-tested without a DOM: hit tests, frame membership, marquee
 * selection, link curves, and the ONE command a gesture commits on release.
 */
import type { BoardCommandInput, BoardState, Card, CardMove, Frame, Link, SingleBoardCommand } from '@orb/shared';
import { intersects, type Rect } from './viewport.js';
import type { Preview } from '../store/board.js';

export const MIN_CARD = { w: 140, h: 90 } as const;
export const MIN_FRAME = { w: 200, h: 140 } as const;
export const NOTE_SIZE = { w: 240, h: 150 } as const;
export const FRAME_SIZE = { w: 640, h: 420 } as const;
/** A pointer that travels less than this (screen px) is a click, not a drag. */
export const DRAG_SLOP = 3;

export const normRect = (x0: number, y0: number, x1: number, y1: number): Rect => ({
  x: Math.min(x0, x1),
  y: Math.min(y0, y1),
  w: Math.abs(x1 - x0),
  h: Math.abs(y1 - y0),
});

const contains = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The frame a point lies in (the latest frame wins when frames overlap), or null. */
export function frameAt(
  frames: readonly Frame[],
  x: number,
  y: number,
  skip?: ReadonlySet<string>,
): string | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i]!;
    if (!skip?.has(f.id) && contains(f, x, y)) return f.id;
  }
  return null;
}

/** The card or frame at a world point (cards above frames; later items above earlier ones), or null. */
export function itemAt(board: BoardState, x: number, y: number): string | null {
  // Stacked cards (P3.2) are hidden behind their stack: never hit.
  const cards = Object.values(board.cards).filter((c) => !c.stackedInto);
  for (let i = cards.length - 1; i >= 0; i--) if (contains(cards[i]!, x, y)) return cards[i]!.id;
  return frameAt(Object.values(board.frames), x, y);
}

/** Marquee selection: cards that intersect the rectangle and frames that lie entirely inside it. */
export function marqueeIds(board: BoardState, r: Rect): string[] {
  const ids: string[] = [];
  for (const f of Object.values(board.frames)) {
    if (f.x >= r.x && f.y >= r.y && f.x + f.w <= r.x + r.w && f.y + f.h <= r.y + r.h) ids.push(f.id);
  }
  for (const c of Object.values(board.cards)) if (!c.stackedInto && intersects(c, r)) ids.push(c.id);
  return ids;
}

/** The rectangle of a card or frame id. */
export const rectOf = (board: BoardState, id: string): Rect | undefined =>
  id.startsWith('c_') ? board.cards[id] : board.frames[id];

/**
 * The item a link end is drawn at: the card itself, or, for a card stacked into a stack card (P3.2), the visible
 * stack that holds it (following nested stacks). Undefined when the end is missing.
 */
export function shownEnd(board: BoardState, id: string): string | undefined {
  if (!id.startsWith('c_')) return board.frames[id] ? id : undefined;
  let card = board.cards[id];
  for (let hops = 0; card?.stackedInto && hops < 64; hops++) card = board.cards[card.stackedInto];
  return card && !card.stackedInto ? card.id : undefined;
}

/**
 * Where to fly for a search hit or activity link (P6.9): the item's own rectangle, or, for a card stacked into a stack
 * card, the visible stack holding it (the card itself is not drawn). `id` is the id to select. Undefined when gone.
 */
export function flightTarget(board: BoardState, id: string): { id: string; rect: Rect } | undefined {
  const shown = shownEnd(board, id);
  const rect = shown ? rectOf(board, shown) : undefined;
  return shown && rect ? { id: shown, rect } : undefined;
}

export type LinkGeometry = {
  d: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  mid: { x: number; y: number };
};

/**
 * A link's curve: from the side of `a` facing `b` to the side of `b` facing `a` (horizontal when the boxes sit more
 * side by side than on top of each other), as a cubic Bézier like the prototype's tension edge.
 */
export function linkGeometry(a: Rect, b: Rect): LinkGeometry {
  const ca = centre(a);
  const cb = centre(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  let from: { x: number; y: number };
  let to: { x: number; y: number };
  let c1: { x: number; y: number };
  let c2: { x: number; y: number };
  if (Math.abs(dx) >= Math.abs(dy)) {
    const s = Math.sign(dx) || 1;
    from = { x: s > 0 ? a.x + a.w : a.x, y: ca.y };
    to = { x: s > 0 ? b.x : b.x + b.w, y: cb.y };
    const k = Math.max(40, Math.abs(to.x - from.x) / 2);
    c1 = { x: from.x + s * k, y: from.y };
    c2 = { x: to.x - s * k, y: to.y };
  } else {
    const s = Math.sign(dy) || 1;
    from = { x: ca.x, y: s > 0 ? a.y + a.h : a.y };
    to = { x: cb.x, y: s > 0 ? b.y : b.y + b.h };
    const k = Math.max(40, Math.abs(to.y - from.y) / 2);
    c1 = { x: from.x, y: from.y + s * k };
    c2 = { x: to.x, y: to.y - s * k };
  }
  // Point at t = 0.5 of the cubic.
  const mid = {
    x: (from.x + 3 * c1.x + 3 * c2.x + to.x) / 8,
    y: (from.y + 3 * c1.y + 3 * c2.y + to.y) / 8,
  };
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    d: `M${r(from.x)} ${r(from.y)} C ${r(c1.x)} ${r(c1.y)}, ${r(c2.x)} ${r(c2.y)}, ${r(to.x)} ${r(to.y)}`,
    from,
    to,
    mid,
  };
}

/** Link label text: the free label, or the type in words (`leads-to` → `LEADS TO`). */
export const linkText = (link: Pick<Link, 'type' | 'label'>): string =>
  (link.type === 'label' ? (link.label ?? '') : link.type.replace(/-/g, ' ')).toUpperCase();

/**
 * What a drag of `ids` moves: the selected cards and frames, plus the cards inside any moved frame (they travel
 * with it).
 */
export function movedSet(board: BoardState, ids: readonly string[]): { cards: string[]; frames: string[] } {
  const frames = ids.filter((id) => id in board.frames);
  const frameSet = new Set(frames);
  const cards = new Set(ids.filter((id) => id in board.cards));
  for (const c of Object.values(board.cards)) if (c.frameId && frameSet.has(c.frameId)) cards.add(c.id);
  return { cards: [...cards], frames };
}

export function movePreview(
  board: BoardState,
  set: { cards: string[]; frames: string[] },
  dx: number,
  dy: number,
): Preview {
  const cards: NonNullable<Preview['cards']> = {};
  const frames: NonNullable<Preview['frames']> = {};
  for (const id of set.cards) {
    const c = board.cards[id];
    if (c) cards[id] = { x: c.x + dx, y: c.y + dy };
  }
  for (const id of set.frames) {
    const f = board.frames[id];
    if (f) frames[id] = { x: f.x + dx, y: f.y + dy };
  }
  return { cards, frames };
}

/**
 * The command for a finished drag by (dx, dy): one `card.moved` with every moved card (a group move is one event);
 * a card dragged on its own joins the frame under its centre (or leaves its frame). Frames moved too make it a
 * batch of `frame.updated` + that `card.moved`.
 */
export function moveCommand(
  board: BoardState,
  set: { cards: string[]; frames: string[] },
  dx: number,
  dy: number,
): BoardCommandInput | null {
  if (dx === 0 && dy === 0) return null;
  const movedFrames = new Set(set.frames);
  const frames = Object.values(board.frames);
  const moves = set.cards.flatMap((id): CardMove[] => {
    const c = board.cards[id];
    if (!c) return [];
    const x = c.x + dx;
    const y = c.y + dy;
    // P6.8: a card carried by its frame's drag is not "placed by hand" (pinned: null leaves the flag alone).
    if (c.frameId && movedFrames.has(c.frameId)) return [{ id, x, y, pinned: null }];
    const frameId = frameAt(frames, x + c.w / 2, y + c.h / 2, movedFrames);
    return [frameId === c.frameId ? { id, x, y } : { id, x, y, frameId }];
  });
  const frameCommands: SingleBoardCommand[] = set.frames.flatMap((id) => {
    const f = board.frames[id];
    return f ? [{ type: 'frame.updated' as const, id, patch: { x: f.x + dx, y: f.y + dy } }] : [];
  });
  const cardCommand: SingleBoardCommand | null = moves.length > 0 ? { type: 'card.moved', moves } : null;
  const all = [...frameCommands, ...(cardCommand ? [cardCommand] : [])];
  if (all.length === 0) return null;
  return all.length === 1 ? all[0]! : { type: 'batch', commands: all };
}

/** Delete a selection as one user action: links first, then cards, then frames (their cards stay on the board). */
export function deleteCommand(board: BoardState, selection: readonly string[]): BoardCommandInput | null {
  const cards = selection.filter((id) => id in board.cards);
  const frames = selection.filter((id) => id in board.frames);
  const gone = new Set([...cards, ...frames]);
  // Links that a removed card or frame takes with it are not removed twice.
  const links = selection.filter((id) => {
    const l = board.links[id];
    return l && !gone.has(l.from) && !gone.has(l.to);
  });
  const commands: SingleBoardCommand[] = [
    ...(links.length ? [{ type: 'link.removed' as const, ids: links }] : []),
    ...(cards.length ? [{ type: 'card.removed' as const, ids: cards }] : []),
    ...frames.map((id) => ({ type: 'frame.removed' as const, id })),
  ];
  if (commands.length === 0) return null;
  return commands.length === 1 ? commands[0]! : { type: 'batch', commands };
}

/** The empty cards the Add card menu makes (P2.gate): their starting title. */
export const MANUAL_CARD_TITLES = {
  note: 'New note',
  question: 'New question',
  risk: 'New risk or claim',
  quote: 'New quote',
  // P6.6: the entity, media and technical cards, written in the reader
  entity: 'New person or org',
  product: 'New product',
  video: 'New video',
  code: 'New code',
  math: 'New formula',
  checklist: 'New checklist',
} as const;
export type ManualCardKind = keyof typeof MANUAL_CARD_TITLES;

/** What a new user card of a P6.6 type starts with (the text kinds start with an empty body). */
const MANUAL_START: Partial<Record<ManualCardKind, Record<string, unknown>>> = {
  entity: { kind: 'person' },
  product: { kind: 'product' },
  video: {},
  code: { language: '', code: '' },
  math: { latex: 'E = mc^2' },
  checklist: { items: [] },
};

/**
 * A new empty user card centred on a world point (joins the frame under that point). A spot already taken by a card
 * at exactly that position moves down-right by one cascade step, so repeated adds never hide each other.
 */
export function manualCardCommand(
  board: BoardState,
  type: ManualCardKind,
  x: number,
  y: number,
): BoardCommandInput {
  const size = type === 'video' ? { w: 300, h: 300 } : MANUAL_START[type] ? { w: 300, h: 230 } : NOTE_SIZE;
  let left = Math.round(x - size.w / 2);
  let top = Math.round(y - size.h / 2);
  const taken = new Set(Object.values(board.cards).map((c) => `${c.x},${c.y}`));
  for (let i = 0; i < 50 && taken.has(`${left},${top}`); i++) {
    left += 24;
    top += 24;
  }
  const card: Omit<Card, 'id' | 'provenance'> = {
    type,
    frameId: frameAt(Object.values(board.frames), left + size.w / 2, top + size.h / 2),
    x: left,
    y: top,
    ...size,
    data: { title: MANUAL_CARD_TITLES[type], ...(MANUAL_START[type] ?? { body: '' }) },
  };
  return { type: 'card.added', card };
}

/** A new user note centred on a world point (joins the frame under that point). */
export function noteCommand(board: BoardState, x: number, y: number): BoardCommandInput {
  const card: Omit<Card, 'id' | 'provenance'> = {
    type: 'note',
    frameId: frameAt(Object.values(board.frames), x, y),
    x: Math.round(x - NOTE_SIZE.w / 2),
    y: Math.round(y - NOTE_SIZE.h / 2),
    ...NOTE_SIZE,
    data: { title: 'New note', body: '' },
  };
  return { type: 'card.added', card };
}

/**
 * The default title of a new frame: `Frame N` with the smallest N no frame uses yet. (P6.9: it was the frame count + 1,
 * so after a delete the next frame repeated a title still on the board.)
 */
export function nextFrameTitle(board: Pick<BoardState, 'frames'>): string {
  const used = new Set(Object.values(board.frames).map((f) => f.title.trim().toLowerCase()));
  for (let n = Object.keys(board.frames).length + 1; ; n++) {
    if (!used.has(`frame ${n}`)) return `Frame ${n}`;
  }
}

/** A new frame from a drawn rectangle (a click, or a tiny drag, gives the default size at that point). */
export function frameCommand(board: BoardState, r: Rect): BoardCommandInput {
  const big = r.w >= MIN_FRAME.w / 2 && r.h >= MIN_FRAME.h / 2;
  const rect = big
    ? {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(Math.max(r.w, MIN_FRAME.w)),
        h: Math.round(Math.max(r.h, MIN_FRAME.h)),
      }
    : { x: Math.round(r.x), y: Math.round(r.y), ...FRAME_SIZE };
  // Loose cards whose centre lies inside the new frame join it (P6.9); cards already in a frame stay there.
  const adopt = Object.values(board.cards)
    .filter(
      (c) =>
        !c.stackedInto && !c.frameId && contains(rect, c.x + c.w / 2, c.y + c.h / 2),
    )
    .map((c) => c.id);
  return {
    type: 'frame.added',
    frame: { title: nextFrameTitle(board), color: 'sky', ...rect },
    ...(adopt.length > 0 ? { adopt } : {}),
  };
}
