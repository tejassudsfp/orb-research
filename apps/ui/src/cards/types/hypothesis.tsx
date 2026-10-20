/** Hypothesis (P6.5): a confidence meter and the for/against balance (data plus the links into the card). */
import { HypothesisData, readCardData } from '@orb/shared';
import type { PrintHalf } from '../../print/kit.js';
import { pptxHook } from '../pptx.js';
import { HypothesisTitleExtra, HypothesisView } from '../synthesis/SynthesisViews.js';
import { TextBody, type CardBody, type CardUi } from './kit.js';

const Body: CardBody = ({ card, lod }) =>
  readCardData(HypothesisData, card.data) ? <HypothesisView card={card} lod={lod} /> : <TextBody card={card} lod={lod} />;
const Print: PrintHalf = ({ card }) => <HypothesisView card={card} lod="reader" print />;

export const hypothesis: CardUi = {
  Body,
  TitleExtra: HypothesisTitleExtra,
  Reader: ({ card }) => <HypothesisView card={card} lod="reader" />,
  Print,
  pptx: pptxHook,
};
