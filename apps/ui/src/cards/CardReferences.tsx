/** Resolve local card references without exposing opaque IDs or fetching remote content. */
import { Fragment } from 'react';
import { cardTitle } from '@orb/shared';
import { useBoardRefs, useCardActions } from './context.js';
import c from './cards.module.css';

export function CardReferences({ text }: { text: string }) {
  const { cards } = useBoardRefs();
  const { open } = useCardActions();
  const parts = [];
  let at = 0;
  for (const match of text.matchAll(/\bc_[A-Za-z0-9_-]{1,64}\b/g)) {
    const id = match[0];
    parts.push(text.slice(at, match.index));
    const card = cards[id];
    parts.push(
      card ? (
        <button
          key={match.index}
          type="button"
          className={c.inlineCardRef}
          data-testid="card-reference"
          data-card-id={id}
          onClick={() => open(id)}
        >
          {cardTitle(card)}
        </button>
      ) : (
        <span key={match.index} className={c.muted}>
          Unavailable reference
        </span>
      ),
    );
    at = match.index! + id.length;
  }
  parts.push(text.slice(at));
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  );
}
