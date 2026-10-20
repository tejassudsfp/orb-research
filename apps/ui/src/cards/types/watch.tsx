/** Watch (P6.7): a Parallel monitor on a topic: its schedule, projected cost, and the newest events. */
import { WatchData, readCardData, type Card } from '@orb/shared';
import { PrintBody, type PrintHalf } from '../../print/kit.js';
import { usd, watchLine } from '../parallel.js';
import { useCardActions } from '../context.js';
import { pptxHook } from '../pptx.js';
import { ApprovalButtons } from './research.js';
import { TextBody, type CardBody, ReaderText, type CardUi } from './kit.js';
import s from '../../canvas/canvas.module.css';
import c from '../cards.module.css';

const Body: CardBody = ({ card, lod }) => {
  const d = readCardData(WatchData, card.data);
  if (!d) return <TextBody card={card} lod={lod} />;
  return (
    <>
      <span className={c.runLine} data-testid="watch-line" data-status={d.status}>
        {watchLine(d)}
      </span>
      <p className={s.cardBody}>{d.query}</p>
      {d.status === 'awaiting_approval' && (
        <>
          <span className={c.runWarn} data-testid="watch-approval">
            Runs on Parallel's servers about {usd(d.monthlyUsd)} a month, even when orb is closed.
          </span>
          {lod === 'full' && <ApprovalButtons card={card} />}
        </>
      )}
      {lod === 'full' && d.events?.[0] && (
        <span className={c.runMsg} data-testid="watch-latest">
          {d.events[0].date}: {d.events[0].summary}
        </span>
      )}
      {d.error && <span className={c.runWarn}>{d.error}</span>}
    </>
  );
};

function Reader({ card }: { card: Card }) {
  const { openLink } = useCardActions();
  const d = readCardData(WatchData, card.data);
  if (!d) return <ReaderText card={card} />;
  return (
    <div data-testid="watch-reader">
      <p className={c.runLine}>{watchLine(d)}</p>
      <p className={c.muted}>{d.query}</p>
      {d.status === 'awaiting_approval' && <ApprovalButtons card={card} />}
      {(d.events?.length ?? 0) > 0 && (
        <ul className={c.runList}>
          {d.events!.map((e) => (
            <li key={e.id}>
              {e.date}: {e.summary}{' '}
              {e.url && (
                <button type="button" className={c.chip} onClick={() => openLink(card.id, e.url!)}>
                  Open
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const Print: PrintHalf = ({ card }) => {
  const d = readCardData(WatchData, card.data);
  if (!d) return null;
  return (
    <>
      <PrintBody>{`${watchLine(d)}. ${d.query}`}</PrintBody>
      {d.events?.slice(0, 5).map((e) => <PrintBody key={e.id}>{`${e.date}: ${e.summary}`}</PrintBody>)}
    </>
  );
};

export const watch: CardUi = { Body, Reader, Print, pptx: pptxHook };
