/**
 * Image or screenshot: the picture above the title on the board, the full-resolution image with its caption in
 * print. The reader (caption editing) is in Reader.tsx.
 */
import { useContext } from 'react';
import { ImageData, readCardData } from '@orb/shared';
import { PrintBody, PrintCtx, printBodyOf, type PrintHalf } from '../../print/kit.js';
import { useCardActions } from '../context.js';
import { pptxHook } from '../pptx.js';
import { TextBody, type CardBody, type CardUi } from './kit.js';
import c from '../cards.module.css';
import p from '../../print/print.module.css';

const Body: CardBody = ({ card }) => {
  const { assetUrl } = useCardActions();
  const d = readCardData(ImageData, card.data);
  if (!d) return <TextBody card={card} lod="full" />;
  return (
    <img
      className={c.image}
      src={assetUrl(d.asset)}
      alt={d.title}
      draggable={false}
      data-testid="card-image"
      loading="lazy"
      decoding="async"
    />
  );
};

const Print: PrintHalf = ({ card }) => {
  const { assetUrl } = useContext(PrintCtx);
  const d = readCardData(ImageData, card.data);
  if (!d) return <PrintBody>{printBodyOf(card)}</PrintBody>;
  return <img className={p.image} src={assetUrl(d.asset.path)} alt={d.title} data-testid="print-image" />;
};

export const image: CardUi = { Body, mediaFirst: true, Print, pptx: pptxHook };
