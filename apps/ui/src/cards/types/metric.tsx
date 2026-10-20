/** Metric (P6.4): the figure large, its change, period and source; the figure stays readable at title zoom. */
import { MetricData, readCardData, sourceText, type Card } from '@orb/shared';
import { PrintBody, PrintLink, printBodyOf, type PrintHalf } from '../../print/kit.js';
import { useCardActions } from '../context.js';
import { pptxHook } from '../pptx.js';
import { TextBody, type CardBody, ReaderText, type CardUi } from './kit.js';
import c from '../cards.module.css';
import p from '../../print/print.module.css';

const ARROW = { up: '↑', down: '↓', flat: '→' } as const;

function Figure({ d, big = false }: { d: MetricData; big?: boolean }) {
  return (
    <div className={c.metric}>
      <span className={big ? `${c.metricValue} ${c.metricValueBig}` : c.metricValue} data-testid="metric-value">
        {d.value}
        {d.unit && <span className={c.metricUnit}>{d.unit}</span>}
      </span>
      {d.change && (
        <span
          className={`${c.metricChange} ${d.change.good === true ? c.metricGood : d.change.good === false ? c.metricBad : ''}`}
          data-testid="metric-change"
        >
          {ARROW[d.change.direction]} {d.change.value}
        </span>
      )}
      {d.period && <p className={c.metricMeta}>{d.period}</p>}
    </div>
  );
}

const Body: CardBody = ({ card, lod }) => {
  const d = readCardData(MetricData, card.data);
  if (!d) return <TextBody card={card} lod={lod} />;
  if (lod === 'compact')
    return (
      <p className={c.metricMeta}>
        {d.value}
        {d.unit ? ` ${d.unit}` : ''}
        {d.change ? ` · ${d.change.value}` : ''}
      </p>
    );
  const src = sourceText(d.source);
  return (
    <div data-testid="card-metric">
      <Figure d={d} />
      {src && <p className={c.metricMeta}>Source: {src}</p>}
    </div>
  );
};

function Reader({ card }: { card: Card }) {
  const { openLink } = useCardActions();
  const d = readCardData(MetricData, card.data);
  if (!d) return <ReaderText card={card} />;
  return (
    <div data-testid="reader-metric">
      <Figure d={d} big />
      {d.note && <p className={c.muted}>{d.note}</p>}
      {d.source && (
        <p className={c.muted}>
          Source: {sourceText(d.source)}{' '}
          {d.source.url && (
            <button type="button" className={c.chip} data-testid="reader-open-link" onClick={() => openLink(card.id, d.source!.url!)}>
              Open link in browser
            </button>
          )}
        </p>
      )}
    </div>
  );
};

const Print: PrintHalf = ({ card }) => {
  const d = readCardData(MetricData, card.data);
  if (!d) return <PrintBody>{printBodyOf(card)}</PrintBody>;
  return (
    <div className={c.metric} data-testid="print-metric">
      <span className={c.metricValue}>
        {d.value}
        {d.unit ? ` ${d.unit}` : ''}
      </span>
      {d.change && (
        <span className={p.meta}>
          {ARROW[d.change.direction]} {d.change.value}
        </span>
      )}
      {d.period && <span className={p.meta}>{d.period}</span>}
      {d.note && <PrintBody>{d.note}</PrintBody>}
      {d.source?.url ? <PrintLink url={d.source.url} /> : d.source && <span className={p.meta}>Source: {sourceText(d.source)}</span>}
    </div>
  );
};

export const metric: CardUi = {
  Body,
  Reader,
  Print,
  pptx: pptxHook,
  TitleExtra: ({ card }) => {
    const d = readCardData(MetricData, card.data);
    return d ? (
      <span className={c.titleExtra} data-testid="metric-title-value">
        {d.value}
        {d.unit ? ` ${d.unit}` : ''}
      </span>
    ) : null;
  },
};
