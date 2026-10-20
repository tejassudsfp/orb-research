/**
 * The Sources slide of a deck (P6.17), pure so it is unit-tested without a DOM: every card the slides cite, numbered in
 * order of first citation (the same numbers as the speaker notes of the .pptx and the page footers of the PDF), split
 * over as many Sources slides as the list needs.
 */
import { cardKindLabel, cardTitle, cardUrl, deckCitationNumbers, type BoardState, type Deck } from '@orb/shared';

export type SourceEntry = { n: number; cardId: string; title: string; kind: string; url?: string; missing?: true };

/** Entries per Sources slide (the .pptx uses 9; a 960 x 540 page fits 8 with their URLs). */
export const SOURCES_PER_PAGE = 8;

export function deckSources(deck: Pick<Deck, 'slides'>, board: Pick<BoardState, 'cards'>): SourceEntry[] {
  return [...deckCitationNumbers(deck)].map(([cardId, n]) => {
    const card = board.cards[cardId];
    if (!card) return { n, cardId, title: 'A card no longer on the board', kind: '', missing: true as const };
    const url = cardUrl(card);
    return { n, cardId, title: cardTitle(card), kind: cardKindLabel(card), ...(url ? { url } : {}) };
  });
}

/** The Sources slides: at least one, even when the deck cites nothing. */
export function sourcePages(entries: readonly SourceEntry[]): SourceEntry[][] {
  const pages: SourceEntry[][] = [];
  for (let i = 0; i < entries.length; i += SOURCES_PER_PAGE) pages.push(entries.slice(i, i + SOURCES_PER_PAGE));
  return pages.length > 0 ? pages : [[]];
}

/** Slides in an export: the deck's own and the Sources slide(s). */
export const exportSlideCount = (deck: Pick<Deck, 'slides'>, board: Pick<BoardState, 'cards'>): number =>
  deck.slides.length + sourcePages(deckSources(deck, board)).length;
