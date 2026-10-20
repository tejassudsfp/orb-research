/**
 * Board search bar (BUILD_PLAN P2.7, PRD Canvas › Search on the board): Cmd+F opens it at the top centre, under the
 * selection bar. Typing searches the card text of this canvas (`searchBoard`, in the UI over the folded board) and
 * flies to the first result; Enter / the down arrow button go to the next result, Shift+Enter / the up arrow to the
 * previous one (both wrap). The current result is selected; every match carries a ring. Escape or the close button
 * closes the bar and gives the focus back to where it was.
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, SearchIcon } from '../components/icons.js';
import s from './canvas.module.css';

export function BoardSearch({
  query,
  count,
  index,
  focusNonce,
  onQuery,
  onStep,
  onClose,
}: {
  query: string;
  /** Number of results for the query. */
  count: number;
  /** 0-based position of the current result, or -1. */
  index: number;
  /** Changes every time Cmd+F is pressed: focus and select the field again. */
  focusNonce: number;
  onQuery: (query: string) => void;
  onStep: (delta: 1 | -1) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusNonce]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onStep(e.shiftKey ? -1 : 1);
    }
  };
  /** Escape closes the bar from anywhere inside it (the field or one of its buttons), not the board's Escape. */
  const onBarKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };
  const status = !query.trim()
    ? ''
    : count === 0
      ? 'No results'
      : `${index >= 0 ? index + 1 : '–'} of ${count}`;
  return (
    <div className={s.search} data-panel="search" data-testid="board-search" role="search" onKeyDown={onBarKey}>
      <span className={s.searchIcon} aria-hidden="true">
        <SearchIcon />
      </span>
      <input
        ref={input}
        className={s.searchInput}
        data-testid="board-search-input"
        aria-label="Search cards on this board"
        placeholder="Search this board"
        value={query}
        maxLength={200}
        spellCheck={false}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={onKey}
      />
      <span className={s.searchCount} data-testid="board-search-count" role="status" aria-live="polite">
        {status}
      </span>
      <button
        type="button"
        className={s.searchButton}
        aria-label="Previous result"
        title="Previous result (Shift+Enter)"
        data-testid="board-search-prev"
        disabled={count === 0}
        onClick={() => onStep(-1)}
      >
        <ChevronUpIcon />
      </button>
      <button
        type="button"
        className={s.searchButton}
        aria-label="Next result"
        title="Next result (Enter)"
        data-testid="board-search-next"
        disabled={count === 0}
        onClick={() => onStep(1)}
      >
        <ChevronDownIcon size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        className={s.searchButton}
        aria-label="Close search"
        title="Close (Escape)"
        data-testid="board-search-close"
        onClick={onClose}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
