/** Local board lookup beside chat: open evidence or pin it for a grounded follow-up. */
import { useMemo, useState } from 'react';
import { cardTitle, foldText, searchBoard, type BoardState } from '@orb/shared';
import s from './Canvas.module.css';

export function ConversationBoard({
  board,
  context,
  onContext,
  onShowItem,
  onOpenCard,
}: {
  board: BoardState;
  context: string[];
  onContext: (ids: string[]) => void;
  onShowItem: (id: string) => void;
  onOpenCard: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => {
    if (!query.trim()) return [];
    const frames = Object.values(board.frames)
      .filter((frame) => foldText(frame.title).includes(foldText(query.trim())))
      .map((frame) => ({ id: frame.id, title: frame.title, kind: 'Frame' }));
    return [
      ...frames,
      ...searchBoard(board, query).map((id) => ({
        id,
        title: cardTitle(board.cards[id]!),
        kind: 'Card',
      })),
    ];
  }, [board, query]);
  const cards = Object.values(board.cards).filter((card) => !card.stackedInto).length;
  return (
    <div className={s.conversationBoard} data-testid="conversation-board">
      <button
        type="button"
        className={s.boardLookupToggle}
        aria-expanded={open}
        aria-controls="conversation-board-search"
        onClick={() => setOpen(!open)}
      >
        <span>Search this board</span>
        <span className={s.boardLookupCount}>
          {cards} cards · {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div
          id="conversation-board-search"
          className={s.boardLookup}
          role="search"
          aria-label="Search from conversation"
        >
          <input
            autoFocus
            type="search"
            value={query}
            maxLength={200}
            aria-label="Find cards or frames"
            placeholder="Find cards, facts or frames…"
            data-testid="conversation-board-search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                event.currentTarget
                  .closest('[data-testid="conversation-board"]')
                  ?.querySelector('button')
                  ?.focus();
              }
            }}
          />
          <p className={s.boardLookupHint} role="status">
            {query.trim()
              ? `${hits.length} results${hits.length > 8 ? ' · showing first 8; narrow your search' : ''}`
              : 'orb can search this whole board. Pin an item to focus your question.'}
          </p>
          <ul className={s.boardLookupResults}>
            {hits.slice(0, 8).map((hit) => (
              <li key={hit.id} data-testid="conversation-board-result" data-item-id={hit.id}>
                <button
                  type="button"
                  onClick={() => (hit.kind === 'Card' ? onOpenCard(hit.id) : onShowItem(hit.id))}
                >
                  <small>{hit.kind}</small> {hit.title}
                </button>
                <button
                  type="button"
                  aria-label={`Use ${hit.title} as context`}
                  aria-pressed={context.includes(hit.id)}
                  onClick={() =>
                    onContext(
                      context.includes(hit.id) ? context.filter((id) => id !== hit.id) : [...context, hit.id],
                    )
                  }
                >
                  {context.includes(hit.id) ? 'Pinned' : 'Ask about'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
