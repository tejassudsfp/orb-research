/**
 * Card UI halves (BUILD_PLAN P2.5, PRD card contract part 4 "Render" at three zoom levels; P6.2 card platform): the
 * board's entry point into the per-type UI modules in ./types (one `CardUi` per type: board renderer at full /
 * compact / title LOD, reader, print half, pptx hook). Data that does not match its type falls back to the text
 * half inside each module, so a card is never blank.
 */
import type { Card } from '@orb/shared';
import { isPaper, kindLabel, titleOf } from './labels.js';
import { CARD_UI } from './types/index.js';
import type { CardUi } from './types/kit.js';

/** The UI half of a card's type. */
export const cardUi = (card: Pick<Card, 'type'>): CardUi => CARD_UI[card.type];

/** The card's content under its title at full or compact LOD. */
export function CardContent({ card, lod }: { card: Card; lod: 'full' | 'compact' }) {
  const { Body } = cardUi(card);
  return <Body card={card} lod={lod} />;
}

/** What a type adds next to the title at title LOD (most types: nothing). */
export function CardTitleExtra({ card }: { card: Card }) {
  const { TitleExtra } = cardUi(card);
  return TitleExtra ? <TitleExtra card={card} /> : null;
}

export { CARD_UI, isPaper, kindLabel, titleOf };
