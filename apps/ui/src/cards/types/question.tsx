/** Question: its context on the board; in print a text block with its state (open or answered) and the answer. */
import { QuestionData, readCardData } from '@orb/shared';
import { PrintBody, printBodyOf, type PrintHalf } from '../../print/kit.js';
import { pptxHook } from '../pptx.js';
import { TextBody, type CardUi } from './kit.js';
import p from '../../print/print.module.css';

const Print: PrintHalf = ({ card }) => {
  const d = readCardData(QuestionData, card.data);
  return (
    <>
      <PrintBody>{printBodyOf(card)}</PrintBody>
      <p className={p.meta}>{d?.state === 'answered' ? 'Answered' : 'Open'}</p>
      {d?.answer && <p className={p.answer}>{d.answer}</p>}
    </>
  );
};

export const question: CardUi = { Body: TextBody, Print, pptx: pptxHook };
