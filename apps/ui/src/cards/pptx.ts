/**
 * The .pptx hook of the card contract (P6.17 Presentations): how a card becomes slide content. Each card type's UI half
 * names it; the deck exporter itself (`buildDeckPptx` in @orb/port, run by the canvas service with pptxgenjs) draws the
 * same classes, and the slide view uses this hook to say what a slide's visual will be in PowerPoint.
 *
 * - `chart`: a native, editable PowerPoint chart with its data (a Chart card with plotted points);
 * - `table`: a native table (a Table card, a Database card's preview rows, a Comparison matrix);
 * - `image`: a picture (an Image card, a PDF's first-page thumbnail);
 * - `snapshot`: the design frame's 2x snapshot, taken by the print pipeline before the export;
 * - `metric`: the figure drawn big;
 * - `text`: the card's kind, title and plain text (every other card).
 * JSX-free so tests can import it.
 */
import {
  ChartData,
  DatabaseData,
  FileData,
  cardKindLabel,
  cardTitle,
  describeCardData,
  readCardData,
  type Card,
} from '@orb/shared';

export type PptxKind = 'chart' | 'table' | 'image' | 'snapshot' | 'metric' | 'text';

/** A card as slide content. */
export type PptxElement = {
  kind: PptxKind;
  type: Card['type'];
  /** The card's kind label ("table · 40 rows"). */
  label: string;
  title: string;
  /** Plain text for the slide body (or its speaker notes). */
  text: string;
  /** True when PowerPoint gets an editable chart or table, not a picture or text. */
  native: boolean;
};

export type PptxHook = (card: Card) => PptxElement;

function kindOf(card: Card): PptxKind {
  switch (card.type) {
    case 'chart':
      return (readCardData(ChartData, card.data)?.points.length ?? 0) > 0 ? 'chart' : 'text';
    case 'table':
    case 'matrix':
      return 'table';
    case 'database':
      return (readCardData(DatabaseData, card.data)?.preview?.length ?? 0) > 0 ? 'table' : 'text';
    case 'image':
      return 'image';
    case 'file':
      return readCardData(FileData, card.data)?.thumb ? 'image' : 'text';
    case 'design':
      return 'snapshot';
    case 'metric':
      return 'metric';
    default:
      return 'text';
  }
}

/** The hook every card type uses: the card's slide kind, label, title and plain text. */
export const pptxHook: PptxHook = (card) => {
  const kind = kindOf(card);
  return {
    kind,
    type: card.type,
    label: cardKindLabel(card),
    title: cardTitle(card),
    text: describeCardData(card, 2000),
    native: kind === 'chart' || kind === 'table',
  };
};
