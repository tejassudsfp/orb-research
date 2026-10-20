/** Code: the snippet, syntax-highlighted by the bundled highlight.js (never a CDN); print keeps the colours. */
import { HEIGHTS, CodeData, readCardData, type Card } from '@orb/shared';
import { useMemo } from 'react';
import { PrintBody, type PrintHalf } from '../../print/kit.js';
import { EditFields, isUserCard, type FieldDef } from '../media/edit.js';
import { highlightCode } from '../media/highlight.js';
import { pptxHook } from '../pptx.js';
import { type CardBody, type CardUi, ReaderText, TextBody } from './kit.js';
import m from '../media/media.module.css';

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Title', max: 500 },
  { key: 'language', label: 'Language', max: 30, placeholder: 'python, typescript, sql…' },
  { key: 'code', label: 'Code', kind: 'code', max: 20_000 },
  { key: 'body', label: 'Note', kind: 'area', max: 2000 },
];

/** The highlighted snippet; `lines` clamps the board view. */
export function CodeBlock({ code, language, testid, className }: {
  code: string;
  language: string | undefined;
  testid: string;
  className?: string;
}) {
  const out = useMemo(() => highlightCode(code, language), [code, language]);
  return (
    <pre className={className ? `${m.code} ${className}` : m.code} data-testid={testid} data-language={out.language ?? ''}>
      <code dangerouslySetInnerHTML={{ __html: out.html }} />
    </pre>
  );
}

const Body: CardBody = ({ card, lod }) => {
  const d = readCardData(CodeData, card.data);
  if (!d) return <TextBody card={card} lod={lod} />;
  // The board shows the first lines that fit; the rest is in the reader.
  const maxLines = Math.max(3, Math.floor((HEIGHTS.code.max - 120) / 18));
  const snippet = (d.code ?? '').split('\n').slice(0, lod === 'compact' ? 4 : maxLines).join('\n');
  return (
    <>
      <CodeBlock code={snippet} language={d.language} testid="card-code" />
    </>
  );
};

function Reader({ card }: { card: Card }) {
  const d = readCardData(CodeData, card.data);
  if (!d) return <ReaderText card={card} />;
  return (
    <>
      <CodeBlock code={d.code ?? ''} language={d.language} testid="reader-code" className={m.codeFull} />
      {isUserCard(card) ? (
        <EditFields card={card} fields={FIELDS} />
      ) : (
        d.body && <p className={m.text}>{d.body}</p>
      )}
    </>
  );
}

const Print: PrintHalf = ({ card }) => {
  const d = readCardData(CodeData, card.data);
  if (!d) return null;
  return (
    <>
      <PrintBody>{d.body}</PrintBody>
      <CodeBlock code={d.code ?? ''} language={d.language} testid="print-code" className={m.codeWrap} />
    </>
  );
};

export const code: CardUi = { Body, Reader, Print, pptx: pptxHook };
