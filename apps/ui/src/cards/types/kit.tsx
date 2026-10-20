/**
 * The UI half of a card type (PRD card contract part 4 "Render" and part 5 "Print"; P6.2 card platform). One module
 * per type in this folder; src/cards/registry.tsx collects them in a `Record<CardType, CardUi>`, so a type without
 * a UI half is a type error.
 *
 * - `Body`: the content under the title at full and compact LOD. Title LOD is the title alone, plus `TitleExtra`
 *   when the type has a glanceable value (e.g. a metric) that must stay readable at 25%.
 * - `mediaFirst`: the content is drawn above the title (an image).
 * - `Reader`: the reader's Card tab (`ReaderText` when its data is missing); undefined: the text, editable for the
 *   user's own cards (Reader.tsx).
 * - `Print`: the print half for a Canvas PDF page (`canvas`) and a research-document figure (`figure`).
 * - `pptx`: the slide hook (src/cards/pptx.ts; how the card becomes slide content, P6.17).
 */
import type { ReactNode } from 'react';
import type { Card } from '@orb/shared';
import type { PrintHalf } from '../../print/kit.js';
import type { PptxHook } from '../pptx.js';
import s from '../../canvas/canvas.module.css';
import c from '../cards.module.css';

export type CardBodyProps = { card: Card; lod: 'full' | 'compact' };
export type CardBody = (props: CardBodyProps) => ReactNode;

export type CardUi = {
  Body: CardBody;
  TitleExtra?: (props: { card: Card }) => ReactNode;
  mediaFirst?: boolean;
  Reader?: (props: { card: Card }) => ReactNode;
  Print: PrintHalf;
  pptx: PptxHook;
};

/** A text card's body: `body`, `summary`, or the lines of `text` after its first (the title). */
export function textOf(card: Card): string {
  const d = (card.data ?? {}) as { body?: unknown; summary?: unknown; text?: unknown; title?: unknown };
  const body = typeof d.body === 'string' ? d.body : typeof d.summary === 'string' ? d.summary : '';
  if (body) return body;
  // A text-only card shows its text below the title (the title is its first line).
  if (typeof d.title !== 'string' && typeof d.text === 'string')
    return d.text.split('\n').slice(1).join('\n');
  return '';
}

/** The default board body: the card's text. */
export const TextBody: CardBody = ({ card }) => {
  const body = textOf(card);
  return body ? (
    <p className={s.cardBody} data-testid="orb-card-body">
      {body}
    </p>
  ) : null;
};

/** The reader's default Card tab: the card's text, or a line saying there is nothing more. */
export function ReaderText({ card }: { card: Card }) {
  const d = (card.data ?? {}) as { body?: unknown; text?: unknown };
  const body = typeof d.body === 'string' ? d.body : typeof d.text === 'string' ? d.text : '';
  return body ? (
    <p className={c.muted} style={{ whiteSpace: 'pre-wrap' }} data-testid="reader-text">
      {body}
    </p>
  ) : (
    <p className={c.muted}>Nothing more on this card.</p>
  );
}
