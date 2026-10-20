/** Timeline (P6.4): dated events in order, each with its source. */
import { HEIGHTS, TimelineData, dateLabel, readCardData, sourceText, timelineOrdered, type Card, type TimelineEvent } from '@orb/shared';
import { PrintBody, PrintLink, printBodyOf, type PrintHalf } from '../../print/kit.js';
import { useCardActions } from '../context.js';
import { pptxHook } from '../pptx.js';
import { TextBody, type CardBody, ReaderText, type CardUi } from './kit.js';
import s from '../../canvas/canvas.module.css';
import c from '../cards.module.css';
import p from '../../print/print.module.css';

function Event({ e, detail, onOpen }: { e: TimelineEvent; detail: boolean; onOpen?: (url: string) => void }) {
  return (
    <li className={c.timelineItem} data-testid="timeline-event">
      <span className={c.timelineDate}>{dateLabel(e.date)}</span>
      <p className={c.timelineLabel}>{e.label}</p>
      {detail && e.detail && <p className={c.timelineDetail}>{e.detail}</p>}
      <p className={c.timelineSource}>
        {sourceText(e.source)}
        {onOpen && e.source.url && (
          <>
            {' '}
            <button type="button" className={c.chip} onClick={() => onOpen(e.source.url!)}>
              Open
            </button>
          </>
        )}
      </p>
    </li>
  );
}

const Body: CardBody = ({ card, lod }) => {
  const d = readCardData(TimelineData, card.data);
  if (!d) return <TextBody card={card} lod={lod} />;
  const ev = timelineOrdered(d.events);
  if (lod === 'compact')
    return (
      <p className={s.cardBody}>
        {ev.length} events · {dateLabel(ev[0]!.date)} to {dateLabel(ev.at(-1)!.date)}
      </p>
    );
  const fit = Math.max(1, Math.floor((HEIGHTS.timeline.max - 96) / 62));
  const shown = ev.slice(0, fit);
  return (
    <div data-testid="card-timeline">
      <ol className={c.timeline}>
        {shown.map((e, i) => (
          <Event key={i} e={e} detail={false} />
        ))}
      </ol>
      {ev.length > shown.length && <p className={c.timelineMore}>{ev.length - shown.length} more events</p>}
    </div>
  );
};

function Reader({ card }: { card: Card }) {
  const { openLink } = useCardActions();
  const d = readCardData(TimelineData, card.data);
  if (!d) return <ReaderText card={card} />;
  return (
    <ol className={c.timeline} data-testid="reader-timeline">
      {timelineOrdered(d.events).map((e, i) => (
        <Event key={i} e={e} detail onOpen={(url) => openLink(card.id, url)} />
      ))}
    </ol>
  );
}

const Print: PrintHalf = ({ card, mode }) => {
  const d = readCardData(TimelineData, card.data);
  if (!d) return <PrintBody>{printBodyOf(card)}</PrintBody>;
  const all = timelineOrdered(d.events);
  const ev = mode === 'canvas' ? all.slice(0, Math.max(1, Math.floor((card.h - 100) / 54))) : all;
  return (
    <>
      <ol className={c.timeline} data-testid="print-timeline">
        {ev.map((e, i) => (
          <li key={i}>
            <span className={p.meta}>{dateLabel(e.date)}</span> <strong>{e.label}</strong>
            {e.detail && <span> {e.detail}</span>}
            <br />
            {e.source.url ? <PrintLink url={e.source.url} /> : <span className={p.meta}>{sourceText(e.source)}</span>}
          </li>
        ))}
      </ol>
      {all.length > ev.length && <p className={p.meta}>+{all.length - ev.length} more events</p>}
    </>
  );
};

export const timeline: CardUi = { Body, Reader, Print, pptx: pptxHook };
