/**
 * Research run (P6.7): a Parallel run on the board. The sidecar updates the card as the run goes (progress, the
 * latest messages, sources read), so the card is live; when the run is done it holds the cited result. A run over the
 * cost threshold waits here for the user: Approve or Decline. Print draws the result and its citations.
 */
import { ResearchData, readCardData, type Card } from '@orb/shared';
import { PrintBody, PrintLink, type PrintHalf } from '../../print/kit.js';
import { researchKindLabel, researchLine, usd } from '../parallel.js';
import { useCardActions } from '../context.js';
import { pptxHook } from '../pptx.js';
import { TextBody, type CardBody, ReaderText, type CardUi } from './kit.js';
import s from '../../canvas/canvas.module.css';
import c from '../cards.module.css';
import p from '../../print/print.module.css';

/** Approve / Decline for a run that waits for the user (also used by the conversation panel prompt). */
export function ApprovalButtons({ card }: { card: Card }) {
  const { confirmParallel } = useCardActions();
  return (
    <div className={c.runActions}>
      <button
        type="button"
        className={c.cardButton}
        data-card-action="approve"
        data-testid="parallel-approve"
        onClick={() => confirmParallel(card.id, true)}
      >
        Approve
      </button>
      <button
        type="button"
        className={c.cardButton}
        data-card-action="decline"
        data-testid="parallel-decline"
        onClick={() => confirmParallel(card.id, false)}
      >
        Decline
      </button>
    </div>
  );
}

const Body: CardBody = ({ card, lod }) => {
  const d = readCardData(ResearchData, card.data);
  if (!d) return <TextBody card={card} lod={lod} />;
  const active = d.status === 'running' || d.status === 'queued';
  return (
    <>
      <span className={c.runLine} data-testid="research-line" data-status={d.status}>
        {researchLine(d)}
      </span>
      {active && (
        <div
          className={c.runBar}
          role="progressbar"
          aria-label="Research progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(d.progress ?? 0)}
          data-testid="research-progress"
        >
          <div className={c.runBarFill} style={{ width: `${Math.round(d.progress ?? 0)}%` }} />
        </div>
      )}
      {d.status === 'awaiting_approval' && (
        <>
          <p className={s.cardBody} data-testid="research-approval">
            {researchKindLabel(d.kind)} could cost about {usd(d.estCostUsd)}. It starts when you approve.
          </p>
          {lod === 'full' && <ApprovalButtons card={card} />}
        </>
      )}
      {lod === 'full' && active && d.messages && d.messages.length > 0 && (
        <span className={c.runMsg} data-testid="research-message">
          {d.messages[d.messages.length - 1]}
        </span>
      )}
      {d.status === 'detached' && (
        <span className={c.runWarn} data-testid="research-note">
          {d.note ?? 'Stopped waiting. The run goes on at Parallel and is billed.'}
        </span>
      )}
      {d.status === 'failed' && d.error && <span className={c.runWarn}>{d.error}</span>}
      {d.status === 'completed' && d.summary && <p className={s.cardBody}>{d.summary}</p>}
      {lod === 'full' && d.status === 'completed' && (d.citations?.length ?? 0) > 0 && (
        <span className={c.runLine}>{d.citations!.length} sources cited</span>
      )}
    </>
  );
};

function Reader({ card }: { card: Card }) {
  const { openLink } = useCardActions();
  const d = readCardData(ResearchData, card.data);
  if (!d) return <ReaderText card={card} />;
  return (
    <div data-testid="research-reader">
      <p className={c.runLine}>
        {researchKindLabel(d.kind)} · {researchLine(d)}
        {d.estCostUsd !== undefined ? ` · est. ${usd(d.estCostUsd)}` : ''}
      </p>
      {d.note && <p className={c.runWarn}>{d.note}</p>}
      {d.error && <p className={c.runWarn}>{d.error}</p>}
      {d.status === 'awaiting_approval' && <ApprovalButtons card={card} />}
      {d.summary && (
        <p className={c.muted} style={{ whiteSpace: 'pre-wrap' }} data-testid="reader-text">
          {d.summary}
        </p>
      )}
      {(d.fields?.length ?? 0) > 0 && (
        <ul className={c.runList} data-testid="research-fields">
          {d.fields!.map((f) => (
            <li key={f.field}>
              <strong>{f.field}</strong>
              {f.confidence && (
                <span className={f.confidence === 'low' ? c.confLow : undefined}> · {f.confidence} confidence</span>
              )}
              {f.reasoning ? ` — ${f.reasoning}` : ''}
            </li>
          ))}
        </ul>
      )}
      {(d.citations?.length ?? 0) > 0 && (
        <>
          <h4 className={c.readerHeading}>All citations</h4>
          <ul className={c.runList} data-testid="research-citations">
            {d.citations!.map((cite) => (
              <li key={cite.url}>
                <button type="button" className={c.chip} onClick={() => openLink(card.id, cite.url)}>
                  {cite.title || cite.url}
                </button>
                {cite.fields && cite.fields.length > 0 ? ` supports ${cite.fields.join(', ')}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const Print: PrintHalf = ({ card }) => {
  const d = readCardData(ResearchData, card.data);
  if (!d) return null;
  return (
    <>
      <PrintBody>{`${researchKindLabel(d.kind)}: ${researchLine(d)}`}</PrintBody>
      <PrintBody>{d.summary}</PrintBody>
      {d.citations?.slice(0, 8).map((cite) => (
        <PrintLink key={cite.url} url={cite.url} />
      ))}
      {d.error && <p className={p.excerpt}>{d.error}</p>}
    </>
  );
};

export const research: CardUi = { Body, Reader, Print, pptx: pptxHook };
