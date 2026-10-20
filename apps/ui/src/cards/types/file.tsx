/** File or PDF: the first-page thumbnail and Open; the reader renders the PDF's pages; print shows the cover. */
import { useContext } from 'react';
import { FileData, readCardData, type Card } from '@orb/shared';
import { PrintBody, PrintCtx, printBodyOf, type PrintHalf } from '../../print/kit.js';
import { useCardActions } from '../context.js';
import { PdfPages } from '../PdfPages.js';
import { pptxHook } from '../pptx.js';
import { TextBody, type CardBody, ReaderText, type CardUi } from './kit.js';
import c from '../cards.module.css';
import p from '../../print/print.module.css';

const Body: CardBody = ({ card, lod }) => {
  const { assetUrl, open } = useCardActions();
  const d = readCardData(FileData, card.data);
  if (!d) return <TextBody card={card} lod={lod} />;
  return (
    <>
      {d.thumb ? (
        <img
          className={c.thumb}
          src={assetUrl(d.thumb)}
          alt=""
          draggable={false}
          data-testid="card-thumb"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className={c.thumbEmpty} aria-hidden="true" />
      )}
      {lod === 'full' && (
        <button
          type="button"
          className={c.cardButton}
          data-card-action="open"
          data-testid="card-open"
          onClick={() => open(card.id)}
        >
          Open
        </button>
      )}
    </>
  );
};

function Reader({ card }: { card: Card }) {
  const { assetUrl } = useCardActions();
  const d = readCardData(FileData, card.data);
  if (!d) return <ReaderText card={card} />;
  return (
    <>
      <p className={c.muted}>{d.asset.name}</p>
      {d.asset.mime === 'application/pdf' && <PdfPages url={assetUrl(d.asset)} pages={d.pages} />}
    </>
  );
}

const Print: PrintHalf = ({ card }) => {
  const { assetUrl } = useContext(PrintCtx);
  const d = readCardData(FileData, card.data);
  if (!d) return <PrintBody>{printBodyOf(card)}</PrintBody>;
  const pages = d.pages !== null ? `${d.pages} ${d.pages === 1 ? 'page' : 'pages'}` : 'file';
  return (
    <div className={p.file}>
      {d.thumb ? (
        <img className={p.thumb} src={assetUrl(d.thumb.path)} alt="" data-testid="print-thumb" />
      ) : (
        <div className={p.thumbEmpty} aria-hidden="true" />
      )}
      <p className={p.meta}>
        {d.asset.name} · {d.asset.mime === 'application/pdf' ? `PDF, ${pages}` : pages}
      </p>
    </div>
  );
};

export const file: CardUi = { Body, Reader, Print, pptx: pptxHook };
