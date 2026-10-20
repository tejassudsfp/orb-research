/** A bounded, user-facing view of coverage. The detailed repair instructions stay with the agent. */
import { useId, useState } from 'react';
import type { ResearchCoverage } from '@orb/shared';
import { ChevronDownIcon } from '../../components/icons.js';
import s from './Canvas.module.css';

/** Never fall back to displaying diagnostic text: new checker reasons get a plain review label. */
export function researchGapSummary(reasons: readonly string[]): string {
  let cards = 0;
  let tables = 0;
  let analysis = false;
  let review = false;
  for (const reason of reasons) {
    if (/^(?:Untouched |Unresolved metric |Empty chart )/.test(reason)) cards++;
    else if (reason.startsWith('Empty database ')) tables++;
    else if (reason.startsWith('Missing detailed synthesis:')) analysis = true;
    else if (!reason.startsWith('No substantive findings yet:')) review = true;
  }
  return (
    [
      ...(cards ? [`${cards} ${cards === 1 ? 'card' : 'cards'} awaiting findings`] : []),
      ...(tables ? [`${tables} ${tables === 1 ? 'table' : 'tables'} awaiting data`] : []),
      ...(analysis ? ['Detailed analysis pending'] : []),
      ...(review ? ['Further review needed'] : []),
    ].join(' · ') || 'Findings pending'
  );
}

export function ResearchProgress({
  coverage,
  working,
  onShowFrame,
}: {
  coverage?: ResearchCoverage;
  working: boolean;
  onShowFrame: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (!coverage?.gaps.length) return null;
  return (
    <section className={s.researchCoverage} data-testid="research-coverage" aria-label="Research progress">
      <button
        type="button"
        className={s.researchCoverageToggle}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
      >
        <span>
          {coverage.coveredFrames}/{coverage.totalFrames} sections filled
        </span>
        <span className={s.researchCoverageState}>{working ? 'Researching' : 'Work remains'}</span>
        <ChevronDownIcon size={14} />
      </button>
      {open && (
        <div id={listId} className={s.researchCoverageList} data-testid="research-progress-details">
          <p className={s.researchCoverageNote}>
            Template cards are starting points. A section counts as filled when its planned content is
            populated; this does not verify every claim.
          </p>
          <ul>
            {coverage.gaps.map((gap) => (
              <li key={gap.frameId}>
                <button type="button" onClick={() => onShowFrame(gap.frameId)}>
                  {gap.title}
                </button>
                <p>{researchGapSummary(gap.reasons)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
