/** Note (Paper for the user's own): its text on the board and in print. The reader edits it (Reader.tsx). */
import { PrintText } from '../../print/kit.js';
import { pptxHook } from '../pptx.js';
import { TextBody, type CardUi } from './kit.js';

export const note: CardUi = { Body: TextBody, Print: PrintText, pptx: pptxHook };
