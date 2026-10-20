/**
 * The world layer (BUILD_PLAN P2.2): one element transformed by `translate(panX, panY) scale(zoom)` holding the
 * frames and cards that intersect the viewport plus a 20% margin, each at the level of detail for the zoom.
 *
 * Cards fade and scale in only when they are placed while the board is open, never when virtualisation mounts them
 * again or when the opening snapshot arrives.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BoardState, Card, Frame } from '@orb/shared';
import { BoardCard } from './BoardCard.js';
import { FrameView } from './FrameView.js';
import { linkGeometry, rectOf } from './geometry.js';
import { LinksLabels, LinksPaths, useLinkLayout } from './LinksLayer.js';
import { CURSOR_PILL, cursorSlots } from './labels.js';
import type { Overlay } from './useBoardInput.js';
import { cull, lodFor, visibleWorldRect, type Size, type Viewport } from './viewport.js';
import s from './canvas.module.css';

export type WorldProps = {
  viewport: Viewport;
  size: Size;
  cards: Card[];
  frames: Frame[];
  /** True once the opening snapshot is folded: cards present then do not animate in. */
  ready: boolean;
  /** True while the user pans or zooms (promotes the layer for the gesture). */
  moving: boolean;
  /** The board drawn (for links and overlays; P2.3). */
  board?: BoardState;
  selection?: ReadonlySet<string>;
  overlay?: Overlay;
  /** Frame whose title is being edited inline. */
  renaming?: string | null;
  onRenameFrame?: (id: string, title: string) => void;
  onRenameEnd?: () => void;
  /** Stable React keys for items created optimistically (real id → temporary id). */
  keys?: Record<string, string>;
  /** Board search (P2.7): the matching card ids and the current result. */
  found?: { ids: ReadonlySet<string>; current: string | null } | undefined;
  /** P3.6: the agents' live cursors, in world coordinates. */
  cursors?: readonly CursorView[];
  /** P6.20: counts up when the renderer sent measured heights: the reflow that follows glides like an agent's arrangement. */
  glideNonce?: number;
};

/** One agent cursor as the world draws it (P3.6). */
export type CursorView = {
  agent: string;
  x: number;
  y: number;
  label: string;
  idle: boolean;
  bg: string;
  fg: string;
};

/** The agents' cursors: a pointer and a label in the agent's colour, kept at screen size, gliding between frames. */
function Cursors({ cursors, zoom }: { cursors: readonly CursorView[]; zoom: number }) {
  // P6.9: cursors close together drop their name pill by a row each, so the pills never cover each other.
  const slots = useMemo(() => cursorSlots(cursors, zoom), [cursors, zoom]);
  return (
    <>
      {cursors.map((c) => (
        <div
          key={c.agent}
          className={c.idle ? `${s.cursor} ${s.cursorIdle}` : s.cursor}
          data-testid="agent-cursor"
          data-agent={c.agent}
          data-x={Math.round(c.x)}
          data-y={Math.round(c.y)}
          style={{ transform: `translate(${c.x}px, ${c.y}px)` }}
          aria-hidden="true"
        >
          <div className={s.cursorInner} style={{ transform: `scale(${1 / zoom})` }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M3 2l7 19 2.5-7.5L20 11z" fill={c.bg} stroke="#03050C" strokeWidth="1.5" />
            </svg>
            <span
              className={s.cursorLabel}
              data-testid="agent-cursor-label"
              data-row={slots.get(c.agent) ?? 0}
              style={{
                background: c.bg,
                color: c.fg,
                marginTop: 12 + (slots.get(c.agent) ?? 0) * (CURSOR_PILL.h + CURSOR_PILL.gap),
              }}
            >
              {c.label}
            </span>
          </div>
        </div>
      ))}
    </>
  );
}

/** How long cards glide after an agent rearranged the board (the CSS transition runs 450 ms). */
const GLIDE_MS = 700;
const NO_KEYS: Record<string, string> = {};
/** How long a newly placed card keeps its enter class (the CSS animation runs 220 ms). */
const ENTER_MS = 400;
const NONE: ReadonlySet<string> = new Set();
const NO_CURSORS: readonly CursorView[] = [];

/** The running gesture's helper drawing (marquee, frame being drawn, connect line), in world coordinates. */
function OverlayView({ overlay, board }: { overlay: Overlay; board: BoardState | undefined }) {
  if (!overlay) return null;
  if (overlay.kind === 'connect') {
    const from = board && rectOf(board, overlay.from);
    if (!from) return null;
    const target = overlay.target && board ? rectOf(board, overlay.target) : undefined;
    const to = target ?? { x: overlay.to.x, y: overlay.to.y, w: 0, h: 0 };
    return (
      <svg className={s.links} width="1" height="1" aria-hidden="true">
        <path className={s.connectPreview} d={linkGeometry(from, to).d} data-testid="connect-preview" />
      </svg>
    );
  }
  const { rect } = overlay;
  return (
    <div
      className={overlay.kind === 'marquee' ? s.marquee : s.frameDraft}
      data-testid={overlay.kind === 'marquee' ? 'marquee' : 'frame-draft'}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    />
  );
}

export function World({
  viewport,
  size,
  cards,
  frames,
  ready,
  moving,
  board,
  selection = NONE,
  overlay = null,
  renaming = null,
  onRenameFrame,
  onRenameEnd,
  keys = NO_KEYS,
  found,
  cursors = NO_CURSORS,
  glideNonce = 0,
}: WorldProps) {
  const seen = useRef<Set<string> | null>(null);
  // P6.8: when an agent rearranges the board (a new `board.arranged` record), cards and frames glide to their new
  // places instead of jumping; a user's drag never glides (it follows the pointer), nor does the opening snapshot.
  const arranged = board?.arrangements?.length ?? 0;
  const arrangedSeen = useRef<number | null>(null);
  const [gliding, setGliding] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const before = arrangedSeen.current;
    arrangedSeen.current = arranged;
    if (before === null || arranged <= before) return;
    setGliding(true);
    const timer = setTimeout(() => setGliding(false), GLIDE_MS);
    return () => clearTimeout(timer);
  }, [arranged, ready]);
  // P6.20: cards the layout reflowed after the renderer's measurements glide too (a short window after sending them).
  useEffect(() => {
    if (!ready || glideNonce === 0) return;
    setGliding(true);
    const timer = setTimeout(() => setGliding(false), GLIDE_MS + 900);
    return () => clearTimeout(timer);
  }, [glideNonce, ready]);
  /** When each card placed since opening was first seen: it keeps its enter class for ENTER_MS (agent bursts). */
  const enteredAt = useRef(new Map<string, number>());
  const laid = useLinkLayout(board, selection);
  const lod = lodFor(viewport.zoom);
  const rect = visibleWorldRect(viewport, size);
  const visibleCards = cull(cards, rect);
  // Frame numbers come from insertion order, so keep each frame's index before culling.
  const indexed = useMemo(() => frames.map((frame, index) => ({ frame, index })), [frames]);
  const visibleFrames = indexed.filter(({ frame }) => cull([frame], rect).length > 0);

  // Which cards were placed after the board opened (they get the enter animation once). A card keeps the class for
  // ENTER_MS, so a burst of agent placements (one render per card) does not cut the earlier cards' animation short;
  // after that it is dropped, so a card that virtualisation mounts again does not animate again.
  const entering = useMemo(() => {
    const fresh = new Set<string>();
    if (!ready) return fresh;
    if (!seen.current) {
      seen.current = new Set(cards.map((c) => c.id));
      return fresh;
    }
    const now = performance.now();
    for (const c of cards) {
      if (seen.current.has(c.id)) continue;
      seen.current.add(c.id);
      // A confirmed card that replaced its optimistic copy already entered.
      const temp = keys[c.id];
      if (!temp || !seen.current.has(temp)) enteredAt.current.set(c.id, now);
    }
    for (const [id, at] of enteredAt.current) {
      if (now - at < ENTER_MS) fresh.add(id);
      else enteredAt.current.delete(id);
    }
    return fresh;
  }, [cards, ready, keys]);

  return (
    <div
      className={[s.world, moving ? s.moving : '', gliding ? s.glide : ''].filter(Boolean).join(' ')}
      data-testid="world"
      data-gliding={gliding ? 'true' : undefined}
      data-lod={lod}
      data-rendered-cards={visibleCards.length}
      data-rendered-frames={visibleFrames.length}
      data-total-cards={cards.length}
      style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})` }}
    >
      {visibleFrames.map(({ frame, index }) => (
        <FrameView
          key={keys[frame.id] ?? frame.id}
          frame={frame}
          index={index}
          lod={lod}
          selected={selection.has(frame.id)}
          renaming={renaming === frame.id}
          replies={board?.threads?.[frame.id]?.length ?? 0}
          {...(onRenameFrame ? { onRename: onRenameFrame } : {})}
          {...(onRenameEnd ? { onRenameEnd } : {})}
        />
      ))}
      {/* Link paths behind the cards (P6.20); their labels above them, below. */}
      {laid.length > 0 && <LinksPaths laid={laid} view={rect} selected={selection} />}
      {visibleCards.map((card) => (
        <BoardCard
          key={keys[card.id] ?? card.id}
          card={card}
          lod={lod}
          enter={entering.has(card.id)}
          selected={selection.has(card.id)}
          found={found?.ids.has(card.id) ? (found.current === card.id ? 'current' : 'match') : undefined}
          replies={board?.threads?.[card.id]?.length ?? 0}
        />
      ))}
      {laid.length > 0 && <LinksLabels laid={laid} view={rect} selected={selection} />}
      <OverlayView overlay={overlay} board={board} />
      <Cursors cursors={cursors} zoom={viewport.zoom} />
    </div>
  );
}
