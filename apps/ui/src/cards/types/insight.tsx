/** Insight (P6.5): the conclusion with the cards it cites; the reader opens each cited card. */
import { pptxHook } from '../pptx.js';
import { InsightView } from '../synthesis/SynthesisViews.js';
import { TextBody, type CardBody, type CardUi } from './kit.js';
import type { PrintHalf } from '../../print/kit.js';
import { InsightData, readCardData } from '@orb/shared';

const Body: CardBody = ({ card, lod }) =>
  readCardData(InsightData, card.data) ? <InsightView card={card} lod={lod} /> : <TextBody card={card} lod={lod} />;
const Print: PrintHalf = ({ card }) => <InsightView card={card} lod="reader" print />;

export const insight: CardUi = {
  Body,
  Reader: ({ card }) => <InsightView card={card} lod="reader" />,
  Print,
  pptx: pptxHook,
};
