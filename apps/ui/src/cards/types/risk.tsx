/** Risk or claim: its text; printed as a dashed block with its label (print.module.css `type_risk`). */
import { PrintText } from '../../print/kit.js';
import { pptxHook } from '../pptx.js';
import { TextBody, type CardUi } from './kit.js';

export const risk: CardUi = { Body: TextBody, Print: PrintText, pptx: pptxHook };
