/**
 * Board keyboard shortcuts (BUILD_PLAN P2.7, PRD Canvas › Navigation, Search on the board, Accessibility).
 *
 * | Keys            | Action                                   | Where                      |
 * |-----------------|------------------------------------------|----------------------------|
 * | Cmd+F           | open board search (or refocus it)        | here                       |
 * | Shift+1         | zoom to fit the board                    | here                       |
 * | Shift+2         | zoom to the selection                    | here                       |
 * | Cmd+0           | 100% (keeps the screen centre)           | here                       |
 * | V / N / F / C   | Select / Note / Frame / Connect tool     | here                       |
 * | Delete, ⌫       | delete the selection                     | useBoardInput (P2.3)       |
 * | Cmd+Z, ⇧Cmd+Z   | undo / redo the user's own actions       | useBoardInput (P2.4)       |
 * | Escape          | clear the selection, back to Select      | useBoardInput (P2.3)       |
 * | Enter           | open the selected card                   | useBoardInput (P2.5)       |
 * | Space (held)    | pan mode                                 | usePanZoom (P2.2)          |
 *
 * In a text field only Cmd+F and Cmd+0 are taken (the others keep their text meaning); while a modal (the reader)
 * is open the board takes no keys. Shift+1 / Shift+2 are matched on the physical key (`code`), so they work on any layout.
 * Cmd shortcuts call preventDefault: the app menu's View › Actual Size must not also reset the page zoom.
 */
import { useEffect, useRef } from 'react';
import type { Tool } from './useBoardInput.js';

export type ShortcutHandlers = {
  setTool: (tool: Tool) => void;
  openSearch: () => void;
  fitBoard: () => void;
  fitSelection: () => void;
  actualSize: () => void;
};

const TOOL_KEYS: Record<string, Tool> = { v: 'select', n: 'note', f: 'frame', c: 'connect' };

const isTyping = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest(
    'input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]',
  ) !== null;

const modalOpen = () => document.querySelector('[role="dialog"][aria-modal="true"]') !== null;

/** Which shortcut a key event is, if any (pure: unit-tested). */
export function shortcutFor(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  typing: boolean,
): keyof Omit<ShortcutHandlers, 'setTool'> | { tool: Tool } | null {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') return 'openSearch';
  if (mod && !e.altKey && !e.shiftKey && (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0')) {
    return 'actualSize';
  }
  if (typing) return null;
  if (mod || e.altKey) return null;
  if (e.shiftKey && e.code === 'Digit1') return 'fitBoard';
  if (e.shiftKey && e.code === 'Digit2') return 'fitSelection';
  if (e.shiftKey) return null;
  const tool = TOOL_KEYS[e.key.toLowerCase()];
  return tool ? { tool } : null;
}

export function useShortcuts(handlers: ShortcutHandlers): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || modalOpen()) return;
      const hit = shortcutFor(e, isTyping(e.target));
      if (!hit) return;
      e.preventDefault();
      const h = latest.current;
      if (typeof hit === 'object') {
        if (!e.repeat) h.setTool(hit.tool);
      } else {
        h[hit]();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
