/** Product or competitor: vendor, summary, pricing, strengths and weaknesses; the Data tab attaches a dataset. */
import { ProductData, readCardData, type Card } from '@orb/shared';
import { PrintBody, PrintLink, type PrintHalf } from '../../print/kit.js';
import { useCardActions } from '../context.js';
import { EditFields, isUserCard, type FieldDef } from '../media/edit.js';
import { pptxHook } from '../pptx.js';
import { type CardBody, type CardUi, ReaderText, TextBody } from './kit.js';
import c from '../cards.module.css';
import m from '../media/media.module.css';

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Name', max: 200 },
  { key: 'vendor', label: 'Vendor', max: 200 },
  { key: 'url', label: 'Link', kind: 'url', max: 4096, placeholder: 'https://' },
  { key: 'pricing', label: 'Pricing', max: 500 },
  { key: 'body', label: 'What it is', kind: 'area', max: 4000 },
];

const kindText = (d: ProductData) => (d.kind === 'competitor' ? 'Competitor' : 'Product');

function Lists({ d, max }: { d: ProductData; max?: number }) {
  return (
    <>
      {d.strengths && d.strengths.length > 0 && (
        <ul className={m.list} aria-label="Strengths" data-testid="product-strengths">
          {d.strengths.slice(0, max ?? 99).map((s, i) => (
            <li key={i} className={m.pros}>{s}</li>
          ))}
        </ul>
      )}
      {d.weaknesses && d.weaknesses.length > 0 && (
        <ul className={m.list} aria-label="Weaknesses" data-testid="product-weaknesses">
          {d.weaknesses.slice(0, max ?? 99).map((s, i) => (
            <li key={i} className={m.cons}>{s}</li>
          ))}
        </ul>
      )}
    </>
  );
}

const Body: CardBody = ({ card, lod }) => {
  const d = readCardData(ProductData, card.data);
  if (!d) return <TextBody card={card} lod={lod} />;
  return (
    <>
      <p className={m.sub} data-testid="product-sub">
        {[kindText(d), d.vendor, d.pricing].filter(Boolean).join(' · ')}
      </p>
      {d.body && <p className={m.text}>{d.body}</p>}
      {lod === 'full' && <Lists d={d} max={2} />}
    </>
  );
};

function Reader({ card }: { card: Card }) {
  const { openLink } = useCardActions();
  const d = readCardData(ProductData, card.data);
  if (!d) return <ReaderText card={card} />;
  return (
    <>
      <p className={m.sub}>{[kindText(d), d.vendor, d.pricing].filter(Boolean).join(' · ')}</p>
      {isUserCard(card) ? (
        <EditFields card={card} fields={FIELDS} />
      ) : (
        d.body && <p className={`${m.text} ${m.full}`} data-testid="reader-text">{d.body}</p>
      )}
      <Lists d={d} />
      {d.facts && d.facts.length > 0 && (
        <dl className={m.facts}>
          {d.facts.flatMap((f, i) => [<dt key={`t${i}`}>{f.label}</dt>, <dd key={`d${i}`}>{f.value}</dd>])}
        </dl>
      )}
      <p className={c.muted}>Use the Data tab to attach a dataset (pricing history, reviews, a feature matrix).</p>
      {d.url && (
        <button type="button" className={c.chip} data-testid="reader-open-link" onClick={() => openLink(card.id, d.url!)}>
          Open link in browser
        </button>
      )}
    </>
  );
}

const Print: PrintHalf = ({ card }) => {
  const d = readCardData(ProductData, card.data);
  if (!d) return null;
  return (
    <>
      <p className={m.sub}>{[kindText(d), d.vendor, d.pricing].filter(Boolean).join(' · ')}</p>
      <PrintBody>{d.body}</PrintBody>
      <Lists d={d} />
      {d.url && <PrintLink url={d.url} />}
    </>
  );
};

export const product: CardUi = { Body, Reader, Print, pptx: pptxHook };
