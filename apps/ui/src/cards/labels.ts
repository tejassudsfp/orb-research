/**
 * Card labels without React (P2.5): the mono kind label, Paper notes, the title, and the reading queue's order.
 * Kept JSX- and CSS-free so unit tests import them directly. Kind names and their data detail come from the shared
 * card-type manifest (packages/shared/src/cardTypes.ts).
 */
import { cardKindLabel, cardTitle, cardTypeLabel, type Card } from '@orb/shared';

export const isPaper = (card: Card) => card.type === 'note' && card.provenance.kind === 'user';

/** The plain kind name of a card type ("note", "design frame"…); unknown types read as themselves. */
export { cardTypeLabel };

/** The mono kind label on the card ("your note", "pdf · 12 pages", "table · 40 rows"). */
export function kindLabel(card: Card): string {
  if (isPaper(card)) return 'your note';
  return cardKindLabel(card);
}

/** The title drawn on the card (and in the reading queue). */
export const titleOf = (card: Card): string => cardTitle(card);

/** The reading queue: Must read cards first, then Skim, each in board order (stacked cards are left out). */
export function queueOf(cards: readonly Card[]): Card[] {
  const must = cards.filter((x) => x.badge === 'must' && !x.stackedInto);
  const skim = cards.filter((x) => x.badge === 'skim' && !x.stackedInto);
  return [...must, ...skim];
}
