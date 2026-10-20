/** Decision (P6.5): status, the choice, the options (ranked by the weighted rubric when there is one), the rationale. */
import { DecisionData, readCardData } from '@orb/shared';
import type { PrintHalf } from '../../print/kit.js';
import { pptxHook } from '../pptx.js';
import { DecisionView } from '../synthesis/SynthesisViews.js';
import { TextBody, type CardBody, type CardUi } from './kit.js';

const Body: CardBody = ({ card, lod }) =>
  readCardData(DecisionData, card.data) ? <DecisionView card={card} lod={lod} /> : <TextBody card={card} lod={lod} />;
const Print: PrintHalf = ({ card }) => <DecisionView card={card} lod="reader" print />;

export const decision: CardUi = {
  Body,
  Reader: ({ card }) => <DecisionView card={card} lod="reader" />,
  Print,
  pptx: pptxHook,
};
