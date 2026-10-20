/** Math: LaTeX typeset by the bundled KaTeX (its CSS and fonts ship in the app; nothing is fetched). */
import 'katex/dist/katex.min.css';
import { MathData, readCardData, type Card } from '@orb/shared';
import { useMemo } from 'react';
import { PrintBody, type PrintHalf } from '../../print/kit.js';
import { EditFields, isUserCard, type FieldDef } from '../media/edit.js';
import { renderMath } from '../media/math.js';
import { pptxHook } from '../pptx.js';
import { type CardBody, type CardUi, ReaderText, TextBody } from './kit.js';
import m from '../media/media.module.css';

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Title', max: 500 },
  { key: 'latex', label: 'LaTeX', kind: 'code', max: 4000, placeholder: 'E = mc^2' },
  { key: 'body', label: 'Note', kind: 'area', max: 2000 },
];

export function Formula({ latex, testid, className }: { latex: string; testid: string; className?: string }) {
  const out = useMemo(() => renderMath(latex), [latex]);
  if (!out.ok)
    return (
      <p className={m.mathError} data-testid={`${testid}-error`}>
        {out.error}
      </p>
    );
  return (
    <div
      className={className ? `${m.math} ${className}` : m.math}
      data-testid={testid}
      // KaTeX output: escaped text and its own spans; `trust` is off, so no links or images.
      dangerouslySetInnerHTML={{ __html: out.html }}
    />
  );
}

const Body: CardBody = ({ card, lod }) => {
  const d = readCardData(MathData, card.data);
  if (!d) return <TextBody card={card} lod={lod} />;
  return (
    <>
      <Formula latex={d.latex ?? ''} testid="card-math" />
      {lod === 'full' && d.body && <p className={m.text}>{d.body}</p>}
    </>
  );
};

function Reader({ card }: { card: Card }) {
  const d = readCardData(MathData, card.data);
  if (!d) return <ReaderText card={card} />;
  return (
    <>
      <Formula latex={d.latex ?? ''} testid="reader-math" className={m.mathFull} />
      {isUserCard(card) ? (
        <EditFields card={card} fields={FIELDS} />
      ) : (
        d.body && <p className={`${m.text} ${m.full}`}>{d.body}</p>
      )}
    </>
  );
}

const Print: PrintHalf = ({ card }) => {
  const d = readCardData(MathData, card.data);
  if (!d) return null;
  return (
    <>
      <Formula latex={d.latex ?? ''} testid="print-math" />
      <PrintBody>{d.body}</PrintBody>
    </>
  );
};

export const math: CardUi = { Body, Reader, Print, pptx: pptxHook };
