/**
 * P5.2 keyboard for the small `role="menu"` popovers (agent avatar menus, the conversation's Agent controls), as the
 * Add card menu already does (the menu element needs `tabIndex={-1}`): on open the focus goes to the first enabled item; ArrowDown / ArrowUp / Home / End
 * move between the enabled items (wrapping); Escape closes the menu; on close the focus goes back to the button
 * that opened it (when nothing else took it).
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';

const ITEMS = '[role="menuitem"]:not(:disabled)';

export function useMenu(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const menu = ref.current;
    // The first enabled item, or the menu itself when every item is disabled (so Escape still reaches it).
    if (menu && !menu.contains(document.activeElement))
      (menu.querySelector<HTMLElement>(ITEMS) ?? menu).focus();
    return () => {
      const at = document.activeElement;
      if (opener?.isConnected && (!at || at === document.body || !at.isConnected))
        opener.focus({ preventScroll: true });
    };
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(ITEMS)];
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown'
        ? (at + 1) % items.length
        : e.key === 'ArrowUp'
          ? (at - 1 + items.length) % items.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? items.length - 1
              : -1;
    if (next < 0 || (at < 0 && document.activeElement?.closest('input, textarea'))) return;
    e.preventDefault();
    items[next]?.focus();
  };
  return { ref, onKeyDown };
}
