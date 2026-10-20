/** Source: its link, summary and an Open link button; the reader opens it in the browser; print keeps a real link. */
import { SourceData, readCardData, type Card } from '@orb/shared';
import { PrintBody, PrintLink, printBodyOf, type PrintHalf } from '../../print/kit.js';
import { useCardActions } from '../context.js';
import { pptxHook } from '../pptx.js';
import { textOf, type CardBody, ReaderText, type CardUi } from './kit.js';
import s from '../../canvas/canvas.module.css';
import c from '../cards.module.css';
import p from '../../print/print.module.css';

const Body: CardBody = ({ card, lod }) => {
  const { openLink } = useCardActions();
  const d = readCardData(SourceData, card.data);
  const body = textOf(card);
  return (
    <>
      {d?.url && (
        <span className={c.url} data-testid="card-url">
          {d.url}
        </span>
      )}
      {body && <p className={s.cardBody}>{body}</p>}
      {lod === 'full' && d?.url && (
        <button
          type="button"
          className={c.cardButton}
          data-card-action="open-link"
          data-testid="card-open-link"
          onClick={() => openLink(card.id, d.url!)}
        >
          Open link
        </button>
      )}
    </>
  );
};

function Reader({ card }: { card: Card }) {
  const { openLink } = useCardActions();
  const d = readCardData(SourceData, card.data);
  if (!d) return <ReaderText card={card} />;
  const body = d.body || d.summary || (typeof d.text === 'string' ? d.text : '');
  return (
    <>
      {d.url && (
        <span className={c.readerLink} data-testid="reader-url">
          {d.url}
        </span>
      )}
      {body && (
        <p className={c.muted} style={{ whiteSpace: 'pre-wrap' }} data-testid="reader-text">
          {body}
        </p>
      )}
      {d.excerpts?.length ? (
        <section aria-label="Source excerpts" data-testid="reader-source-excerpts">
          <h3>Source excerpts</h3>
          {d.excerpts.map((excerpt, i) => (
            <p key={i} className={c.muted} style={{ whiteSpace: 'pre-wrap' }}>
              {excerpt}
            </p>
          ))}
        </section>
      ) : null}
      {d.url && (
        <button
          type="button"
          className={c.chip}
          data-testid="reader-open-link"
          onClick={() => openLink(card.id, d.url!)}
        >
          Open link in browser
        </button>
      )}
    </>
  );
}

const Print: PrintHalf = ({ card }) => {
  const d = readCardData(SourceData, card.data);
  return (
    <>
      <PrintBody>{printBodyOf(card)}</PrintBody>
      {d?.excerpts?.[0] && <p className={p.excerpt}>“{d.excerpts[0]}”</p>}
      {d?.url && <PrintLink url={d.url} />}
    </>
  );
};

export const source: CardUi = { Body, Reader, Print, pptx: pptxHook };
