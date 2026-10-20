/**
 * Board editing input (BUILD_PLAN P2.3, PRD Canvas › Cards, Frames, Links). Pan and zoom stay in usePanZoom; this
 * hook takes the gestures that edit the board and commits ONE command per gesture on release:
 *
 * - Select tool: click a card to read it, a frame label to select it (Shift toggles); drag it to move the selection (a
 *   group move is one `card.moved`; frames carry their cards); Shift+drag on empty space draws a marquee; a plain
 *   drag on empty space still pans; drag a selected item's corner handle to resize it; click a link to select it.
 * - Note tool: click to place a note (double-click on empty space does too, with any tool).
 * - Frame tool: drag a rectangle (or click for the default size) to add a frame, then rename it inline.
 * - Connect tool: press on a card or frame and release on another to link them with the chosen link type.
 * - Delete/Backspace removes the selection; Escape clears it and goes back to Select.
 * - P6.32: an ordinary card click (or Enter with one card selected) opens the reader; selection checkboxes,
 *   modifier clicks and dragging select without opening. Buttons inside a card
 *   (`data-card-action`: Open, Open link, the note tab, table sort) take their click instead of starting a drag.
 *   While a modal (the reader) is open the board ignores its keys.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { LinkType } from '@orb/shared';
import type { BoardStore } from '../store/board.js';
import {
  DRAG_SLOP,
  MIN_CARD,
  MIN_FRAME,
  deleteCommand,
  frameCommand,
  itemAt,
  marqueeIds,
  moveCommand,
  movePreview,
  movedSet,
  noteCommand,
  normRect,
  rectOf,
} from './geometry.js';
import { toWorld, type Rect, type Viewport } from './viewport.js';

export type Tool = 'select' | 'note' | 'frame' | 'connect' | 'add-card';
export type LinkChoice = { type: LinkType; label?: string };

/** What the board overlay draws for the running gesture. */
export type Overlay =
  | { kind: 'marquee'; rect: Rect }
  | { kind: 'frame'; rect: Rect }
  | { kind: 'connect'; from: string; to: { x: number; y: number }; target: string | null }
  | null;

type Gesture =
  | {
      kind: 'move';
      pointer: number;
      sx: number;
      sy: number;
      wx: number;
      wy: number;
      set: { cards: string[]; frames: string[] };
      moved: boolean;
      openId?: string;
    }
  | { kind: 'resize'; pointer: number; id: string; wx: number; wy: number; w: number; h: number }
  | { kind: 'marquee'; pointer: number; wx: number; wy: number; base: string[] }
  | { kind: 'frame'; pointer: number; wx: number; wy: number }
  | { kind: 'connect'; pointer: number; from: string };

/** The size a resize gesture gives at world point `p` (clamped to the minimum card or frame size). */
function resizeTo(g: Extract<Gesture, { kind: 'resize' }>, p: { x: number; y: number }) {
  const min = g.id.startsWith('c_') ? MIN_CARD : MIN_FRAME;
  return {
    w: Math.round(Math.max(min.w, g.w + p.x - g.wx)),
    h: Math.round(Math.max(min.h, g.h + p.y - g.wy)),
  };
}

const isTyping = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest(
    'input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]',
  ) !== null;

/** True while a modal dialog (the card reader) is open over the board. */
const modalOpen = () => document.querySelector('[role="dialog"][aria-modal="true"]') !== null;

export type BoardInput = {
  overlay: Overlay;
  /** Returns true when the board took the pointer (pan must not start). */
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => boolean;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => boolean;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => boolean;
  onDoubleClick: (e: React.MouseEvent<HTMLElement>) => void;
};

export function useBoardInput({
  store,
  root,
  viewportRef,
  spaceRef,
  tool,
  setTool,
  link,
  onFrameCreated,
  onOpenCard,
}: {
  store: BoardStore;
  root: RefObject<HTMLElement | null>;
  viewportRef: RefObject<Viewport>;
  spaceRef: RefObject<boolean>;
  tool: Tool;
  setTool: (tool: Tool) => void;
  link: LinkChoice;
  /** Open the inline rename of a frame (one just drawn with the Frame tool, or a double-clicked label). */
  onFrameCreated: (id: string) => void;
  /** Open a card in the reader (ordinary click, Enter). */
  onOpenCard?: (id: string) => void;
}): BoardInput {
  const gesture = useRef<Gesture | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);

  const world = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const r = root.current!.getBoundingClientRect();
      return toWorld(viewportRef.current, e.clientX - r.left, e.clientY - r.top);
    },
    [root, viewportRef],
  );

  const addNote = useCallback(
    (x: number, y: number) => {
      void store.getState().dispatch(noteCommand(store.getState().board, x, y), { select: 'created' });
    },
    [store],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>): boolean => {
      if (e.button !== 0 || spaceRef.current) return false;
      const target = e.target as Element;
      const s = store.getState();
      const p = world(e);
      const capture = () => e.currentTarget.setPointerCapture(e.pointerId);
      // A button inside a card takes the click (no drag, no pan).
      if (target.closest('[data-card-action], button, a, input, textarea, select, [contenteditable="true"]'))
        return true;

      const handle = target.closest<HTMLElement>('[data-resize-handle]');
      if (handle) {
        const id = handle.dataset.resizeHandle!;
        const r = rectOf(s.board, id);
        if (!r) return true;
        gesture.current = { kind: 'resize', pointer: e.pointerId, id, wx: p.x, wy: p.y, w: r.w, h: r.h };
        capture();
        return true;
      }

      const linkEl = target.closest<HTMLElement>('[data-link-id]');
      if (linkEl) {
        s.select([linkEl.dataset.linkId!], e.shiftKey ? 'toggle' : 'replace');
        return true;
      }

      const itemEl = target.closest<HTMLElement>('article[data-card-id], [data-frame-handle]');
      const itemId = itemEl?.dataset.cardId ?? itemEl?.dataset.frameHandle;
      if (itemId) {
        if (tool === 'connect') {
          gesture.current = { kind: 'connect', pointer: e.pointerId, from: itemId };
          setOverlay({ kind: 'connect', from: itemId, to: p, target: null });
          capture();
          return true;
        }
        if (e.shiftKey) s.select([itemId], 'toggle');
        else if (!s.selection.includes(itemId)) s.select([itemId]);
        const selection = store.getState().selection.filter((id) => !id.startsWith('l_'));
        if (!selection.includes(itemId)) return true; // shift-click deselected it
        gesture.current = {
          kind: 'move',
          pointer: e.pointerId,
          sx: e.clientX,
          sy: e.clientY,
          wx: p.x,
          wy: p.y,
          set: movedSet(s.board, selection),
          moved: false,
          ...(tool === 'select' &&
          itemEl?.dataset.cardId &&
          !e.shiftKey &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey
            ? { openId: itemId }
            : {}),
        };
        capture();
        return true;
      }

      // Empty space (the screen itself: frames bodies, glows and grid let the pointer through).
      if (target !== e.currentTarget) return false;
      if (tool === 'note') {
        addNote(p.x, p.y);
        setTool('select');
        return true;
      }
      if (tool === 'frame') {
        gesture.current = { kind: 'frame', pointer: e.pointerId, wx: p.x, wy: p.y };
        setOverlay({ kind: 'frame', rect: normRect(p.x, p.y, p.x, p.y) });
        capture();
        return true;
      }
      if (e.shiftKey) {
        gesture.current = { kind: 'marquee', pointer: e.pointerId, wx: p.x, wy: p.y, base: s.selection };
        setOverlay({ kind: 'marquee', rect: normRect(p.x, p.y, p.x, p.y) });
        capture();
        return true;
      }
      // A plain press on empty space clears the selection and pans.
      s.select([]);
      return false;
    },
    [store, world, tool, setTool, addNote, spaceRef],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>): boolean => {
      const g = gesture.current;
      if (!g || g.pointer !== e.pointerId) return false;
      const s = store.getState();
      const p = world(e);
      switch (g.kind) {
        case 'move': {
          if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < DRAG_SLOP) return true;
          g.moved = true;
          s.setPreview(movePreview(s.base, g.set, p.x - g.wx, p.y - g.wy));
          return true;
        }
        case 'resize': {
          const size = resizeTo(g, p);
          s.setPreview(g.id.startsWith('c_') ? { cards: { [g.id]: size } } : { frames: { [g.id]: size } });
          return true;
        }
        case 'marquee': {
          const rect = normRect(g.wx, g.wy, p.x, p.y);
          setOverlay({ kind: 'marquee', rect });
          s.select([...g.base, ...marqueeIds(s.board, rect)]);
          return true;
        }
        case 'frame':
          setOverlay({ kind: 'frame', rect: normRect(g.wx, g.wy, p.x, p.y) });
          return true;
        case 'connect': {
          const hit = itemAt(s.board, p.x, p.y);
          setOverlay({ kind: 'connect', from: g.from, to: p, target: hit && hit !== g.from ? hit : null });
          return true;
        }
      }
    },
    [store, world],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>): boolean => {
      const g = gesture.current;
      if (!g || g.pointer !== e.pointerId) return false;
      gesture.current = null;
      setOverlay(null);
      const s = store.getState();
      const p = world(e);
      if (e.type === 'pointercancel') {
        s.setPreview(null);
        return true;
      }
      switch (g.kind) {
        case 'move': {
          if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < DRAG_SLOP) {
            s.setPreview(null);
            if (g.openId && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && s.board.cards[g.openId]) {
              s.select([g.openId]);
              root.current
                ?.querySelector<HTMLElement>(`article[data-card-id="${g.openId}"]`)
                ?.focus({ preventScroll: true });
              onOpenCard?.(g.openId);
            }
            return true;
          }
          const command = moveCommand(s.base, g.set, Math.round(p.x - g.wx), Math.round(p.y - g.wy));
          if (command) void s.dispatch(command, { clearPreview: true });
          else s.setPreview(null);
          return true;
        }
        case 'resize': {
          // The size comes from the release point (not the last preview), like every other gesture.
          const size = resizeTo(g, p);
          if (size.w === g.w && size.h === g.h) {
            s.setPreview(null);
            return true;
          }
          void s.dispatch(
            g.id.startsWith('c_')
              ? { type: 'card.updated', id: g.id, patch: size }
              : { type: 'frame.updated', id: g.id, patch: size },
            { clearPreview: true },
          );
          return true;
        }
        case 'marquee':
          // The release point is final even if the last move was coalesced away.
          s.select([...g.base, ...marqueeIds(s.board, normRect(g.wx, g.wy, p.x, p.y))]);
          return true;
        case 'frame': {
          const command = frameCommand(s.board, normRect(g.wx, g.wy, p.x, p.y));
          setTool('select');
          void s.dispatch(command, { select: 'created' });
          const created = store.getState().selection[0];
          if (created) onFrameCreated(created);
          return true;
        }
        case 'connect': {
          const to = itemAt(s.board, p.x, p.y);
          if (to && to !== g.from) {
            void s.dispatch({
              type: 'link.added',
              link: {
                from: g.from,
                to,
                type: link.type,
                ...(link.type === 'label' ? { label: link.label || 'Label' } : {}),
              },
            });
          }
          return true;
        }
      }
    },
    [store, world, setTool, link, onFrameCreated, onOpenCard, root],
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (spaceRef.current) return;
      // A press on a card or a frame label captured the pointer, so the event's target is the screen whatever was
      // double-clicked: hit-test the point instead.
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (hit?.closest('[data-card-action]')) return;
      const cardEl = hit?.closest<HTMLElement>('article[data-card-id]');
      if (cardEl && onOpenCard) {
        onOpenCard(cardEl.dataset.cardId!);
        return;
      }
      const label = hit?.closest<HTMLElement>('[data-frame-handle]');
      if (label) {
        // Double-click on a frame label renames the frame inline.
        onFrameCreated(label.dataset.frameHandle!);
        return;
      }
      // Only a double-click on empty space adds a note (not one on a card, a link or the chrome).
      if (e.target !== e.currentTarget || hit !== e.currentTarget) return;
      const p = world(e);
      addNote(p.x, p.y);
    },
    [world, addNote, spaceRef, onFrameCreated, onOpenCard],
  );

  // Delete / Backspace removes the selection; Escape clears it and returns to Select; Cmd+Z undoes and Cmd+Shift+Z
  // redoes the user's last board action (P2.4). In a text field these keys keep their text-editing meaning.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || modalOpen()) return;
      const s = store.getState();
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'z') {
        // preventDefault keeps the app menu's Edit › Undo (a no-op on the board) from also handling it.
        e.preventDefault();
        if (e.repeat && s.historyBusy > 0) return;
        void (e.shiftKey ? s.redo() : s.undo());
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const command = deleteCommand(s.board, s.selection);
        if (!command) return;
        e.preventDefault();
        void s.dispatch(command);
      } else if (e.key === 'Escape') {
        s.select([]);
        setTool('select');
      } else if (
        e.key === 'Enter' &&
        onOpenCard &&
        s.selection.length === 1 &&
        s.selection[0]!.startsWith('c_')
      ) {
        if (e.target instanceof Element && e.target.closest('button, a')) return;
        e.preventDefault();
        onOpenCard(s.selection[0]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, setTool, onOpenCard]);

  return { overlay, onPointerDown, onPointerMove, onPointerUp, onDoubleClick };
}
