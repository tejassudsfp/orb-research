/**
 * The deck's print route (P6.17 `/print/deck`): PDF slides, one 16:9 page (960 x 540 CSS px = 10 x 5.625 in) per slide,
 * then the Sources slide(s). Light, with the lockup, the deck title, the slide's citation numbers and the page number in
 * each footer, and clickable source links. The print page is complete when the slides' charts, diagrams and images are.
 */
import type { BoardState, Deck } from '@orb/shared';
import { deckCitationNumbers } from '@orb/shared';
import { SlideFace, SourcesFace } from '../deck/SlideFace.js';
import { deckSources, sourcePages } from '../deck/sources.js';
import p from './print.module.css';

const PAGE_CSS = '@page { size: 960px 540px; margin: 0; }';

export function DeckPrint({ deck, board }: { deck: Deck; board: BoardState }) {
  const numbers = deckCitationNumbers(deck);
  const pages = sourcePages(deckSources(deck, board));
  const cardOf = (id: string) => board.cards[id];
  return (
    <>
      <style>{PAGE_CSS}</style>
      <main className={p.docRoot} data-testid="print-deck" data-slides={deck.slides.length}>
        {deck.slides.map((slide, i) => (
          <SlideFace
            key={slide.id}
            slide={slide}
            deckTitle={deck.title}
            page={i + 1}
            numbers={numbers}
            cardOf={cardOf}
          />
        ))}
        {pages.map((entries, i) => (
          <SourcesFace
            key={i}
            entries={entries}
            deckTitle={deck.title}
            page={deck.slides.length + i + 1}
            n={i + 1}
            of={pages.length}
          />
        ))}
      </main>
    </>
  );
}
