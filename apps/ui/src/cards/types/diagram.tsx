/** Diagram (P3.8): the Mermaid SVG on the board, large with its source in the reader, vector in print. */
import { DiagramData, readCardData } from '@orb/shared';
import { PrintBody, printBodyOf, type PrintHalf } from '../../print/kit.js';
import { DiagramBody, DiagramReader, DiagramView } from '../BuilderViews.js';
import { pptxHook } from '../pptx.js';
import type { CardUi } from './kit.js';
import p from '../../print/print.module.css';

const Print: PrintHalf = ({ card }) => {
  const d = readCardData(DiagramData, card.data);
  if (!d?.mermaid) return <PrintBody>{printBodyOf(card)}</PrintBody>;
  return (
    <div className={p.diagram}>
      <DiagramView source={d.mermaid} testid="print-diagram" />
    </div>
  );
};

export const diagram: CardUi = { Body: DiagramBody, Reader: DiagramReader, Print, pptx: pptxHook };
