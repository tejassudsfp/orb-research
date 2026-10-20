/** Framework (P6.5): pros and cons, SWOT or a 2x2 quadrant as a grid of cells. */
import { FrameworkData, readCardData } from '@orb/shared';
import type { PrintHalf } from '../../print/kit.js';
import { pptxHook } from '../pptx.js';
import { FrameworkView } from '../synthesis/SynthesisViews.js';
import { TextBody, type CardBody, type CardUi } from './kit.js';

const Body: CardBody = ({ card, lod }) =>
  readCardData(FrameworkData, card.data) ? <FrameworkView card={card} lod={lod} /> : <TextBody card={card} lod={lod} />;
const Print: PrintHalf = ({ card }) => <FrameworkView card={card} lod="reader" print />;

export const framework: CardUi = {
  Body,
  Reader: ({ card }) => <FrameworkView card={card} lod="reader" />,
  Print,
  pptx: pptxHook,
};
