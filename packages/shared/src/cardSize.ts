/**
 * P6.20: how tall a card may be. The layout engine (orb-canvas `layout.ts`) keeps a card's height inside its type's
 * range; the renderer shows only as many rows, lines and items as fit under the type's ceiling, so a card's natural
 * height never depends on the height it is given (the measure-and-reflow loop converges), and everything past the
 * ceiling is behind "Show more", which opens the reader.
 */
import type { CardType } from './board.js';

/** The floor: the title-only level of detail (a 40 px title, up to three lines) fits inside a card of this height. */
export const MIN_CARD_H = 176;

/** Height range per card type (px): `min` is the floor, `max` the longest a card of the type grows on the board. */
export const HEIGHTS: Readonly<Record<CardType | 'stack', { min: number; max: number }>> = Object.freeze({
  note: { min: MIN_CARD_H, max: 300 },
  source: { min: MIN_CARD_H, max: 340 },
  quote: { min: MIN_CARD_H, max: 300 },
  image: { min: 200, max: 400 },
  file: { min: MIN_CARD_H, max: 320 },
  question: { min: MIN_CARD_H, max: 280 },
  risk: { min: MIN_CARD_H, max: 300 },
  doc: { min: MIN_CARD_H, max: 420 },
  table: { min: 200, max: 440 },
  database: { min: 200, max: 460 },
  insight: { min: MIN_CARD_H, max: 360 },
  hypothesis: { min: MIN_CARD_H, max: 380 },
  decision: { min: 220, max: 460 },
  framework: { min: 240, max: 480 },
  entity: { min: MIN_CARD_H, max: 340 },
  product: { min: 200, max: 400 },
  video: { min: 220, max: 380 },
  code: { min: 200, max: 420 },
  math: { min: MIN_CARD_H, max: 300 },
  checklist: { min: MIN_CARD_H, max: 420 },
  research: { min: 200, max: 420 },
  watch: { min: MIN_CARD_H, max: 340 },
  diagram: { min: 220, max: 440 },
  design: { min: 260, max: 480 },
  chart: { min: 240, max: 440 },
  metric: { min: MIN_CARD_H, max: 280 },
  timeline: { min: 240, max: 480 },
  matrix: { min: 220, max: 480 },
  stack: { min: MIN_CARD_H, max: 280 },
});

/** `h` kept inside the type's range (whole pixels). */
export const clampHeight = (type: CardType | 'stack', h: number): number => {
  const { min, max } = HEIGHTS[type];
  return Math.round(Math.min(max, Math.max(min, h)));
};

/**
 * Types whose body fills the height it is given (a picture, a chart, a frame): their natural height means nothing, so
 * the renderer never reports one and the layout keeps their estimate. Every other type is measured.
 */
export const UNMEASURED_TYPES: ReadonlySet<CardType> = new Set<CardType>([
  'image',
  'video',
  'chart',
  'design',
  'diagram',
]);
