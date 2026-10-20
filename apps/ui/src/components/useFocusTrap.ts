/**
 * P5.2 dialog focus (WAI-ARIA dialog pattern) for the sheets marked `aria-modal="true"` (Port composer, card reader)
 * and, without the trap, the popovers:
 * - on open, the focus moves into the dialog (unless it is already there, e.g. on an autofocused field), to the
 *   container itself when it is focusable (`tabIndex={-1}`), else to its first tab stop;
 * - Tab and Shift+Tab wrap inside the dialog, so the keyboard never walks onto the board behind it;
 * - on close, the focus goes back to what had it before (the Publish button, the selection bar's Open, ...) when
 *   that is still on the page.
 */
import { useEffect, type RefObject } from 'react';

const TABBABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** The visible tab stops inside `root`, in DOM order. */
export function tabStops(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => {
    if (el.tabIndex < 0 || el.closest('[inert]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility === 'visible';
  });
}

/**
 * `trap: false` is for the non-modal popovers (Why it's here, threads): the focus still moves in on open and back on
 * close, but Tab may leave.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  { trap = true }: { trap?: boolean } = {},
): void {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!root.contains(document.activeElement)) {
      if (root.tabIndex >= -1 && root.hasAttribute('tabindex')) root.focus();
      else tabStops(root)[0]?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (!trap || e.key !== 'Tab' || e.defaultPrevented) return;
      const stops = tabStops(root);
      if (stops.length === 0) {
        e.preventDefault();
        return;
      }
      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const at = document.activeElement;
      const inside = !!at && root.contains(at);
      if (e.shiftKey && (!inside || at === first || at === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || at === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const at = document.activeElement;
      if (opener?.isConnected && (!at || at === document.body || root.contains(at) || !at.isConnected))
        opener.focus({ preventScroll: true });
    };
  }, [ref, trap]);
}
