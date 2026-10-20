/** Quote: the excerpt on the board; in print a pull quote with its citation (and link). */
import { QuoteData, cardTitle, readCardData } from '@orb/shared';
import { PrintLink, text, type PrintHalf } from '../../print/kit.js';
import { pptxHook } from '../pptx.js';
import { TextBody, type CardUi } from './kit.js';
import p from '../../print/print.module.css';

const Print: PrintHalf = ({ card, mode }) => {
  const d = readCardData(QuoteData, card.data);
  const quote = text(d?.body) || text(d?.text) || cardTitle(card);
  return (
    <figure className={p.quote}>
      <blockquote className={mode === 'figure' ? p.pullQuote : p.quoteText}>“{quote}”</blockquote>
      <figcaption className={p.cite}>
        {d?.title && d.title !== quote ? <span>{d.title}</span> : null}
        {d?.url && <PrintLink url={d.url} />}
      </figcaption>
    </figure>
  );
};

export const quote: CardUi = { Body: TextBody, Print, pptx: pptxHook };
