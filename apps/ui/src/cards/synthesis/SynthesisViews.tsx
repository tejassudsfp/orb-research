/**
 * The shared pieces of the synthesis cards' UI halves (P6.5): the board bodies, the reader and the print draw the
 * same components, so a card reads the same everywhere. Print uses the card's own data only (no board context).
 */
import {
  DecisionData,
  FrameworkData,
  HEIGHTS,
  HypothesisData,
  InsightData,
  cardTitle,
  confidenceLabel,
  decisionTotals,
  frameworkCells,
  hypothesisEvidence,
  readCardData,
  type Card,
} from '@orb/shared';
import { useBoardRefs, useCardActions } from '../context.js';
import y from './synthesis.module.css';

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

/** The title of a card the board holds, or undefined when it is gone. */
function useTitleOf() {
  const { cards } = useBoardRefs();
  return (id: string): string | undefined => {
    const card = cards[id];
    return card ? cardTitle(card) : undefined;
  };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** A card id, drawn as its title (or "card removed" when it is gone). Plain text; `open` makes it a button. */
function Ref({ id, open }: { id: string; open?: boolean }) {
  const titleOf = useTitleOf();
  const { open: openCard } = useCardActions();
  const title = titleOf(id);
  if (open && title !== undefined)
    return (
      <button type="button" className={y.chip} data-testid="synthesis-ref" onClick={() => openCard(id)}>
        {title}
      </button>
    );
  return <span className={cx(y.citeText, title === undefined && y.missing)}>{title ?? 'card removed'}</span>;
}

function Citations({ ids, max, open }: { ids: readonly string[]; max: number; open?: boolean }) {
  return (
    <ul className={y.cites} data-testid="insight-cites">
      {ids.slice(0, max).map((id) => (
        <li key={id} className={y.cite}>
          <Ref id={id} open={open} />
        </li>
      ))}
      {ids.length > max && <li className={y.meta}>+{ids.length - max} more</li>}
    </ul>
  );
}

// ---- Insight ----

export function InsightView({ card, lod, print }: { card: Card; lod: 'full' | 'compact' | 'reader'; print?: boolean }) {
  const d = readCardData(InsightData, card.data);
  if (!d) return null;
  const reader = lod === 'reader';
  return (
    <div className={y.stack} data-testid="card-insight">
      {d.body && <p className={cx(y.text, (reader || print) && y.textFull)}>{d.body}</p>}
      <p className={y.meta}>{plural(d.citations.length, 'citation')}</p>
      {lod === 'full' && !print && <Citations ids={d.citations} max={3} />}
      {print && <Citations ids={d.citations} max={d.citations.length} />}
      {reader && (
        <>
          <p className={y.heading}>Cites</p>
          <div className={y.chipRow}>
            {d.citations.map((id) => (
              <Ref key={id} id={id} open />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Hypothesis ----

export function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className={y.confidence} data-testid="hypothesis-confidence">
      <span className={y.confValue}>{value}%</span>
      <span className={y.bar} role="img" aria-label={`Confidence ${value}%`}>
        <span className={y.barFill} style={{ display: 'block', width: `${value}%` }} />
      </span>
      <span className={y.confWord}>{confidenceLabel(value)}</span>
    </div>
  );
}

export function HypothesisView({ card, lod, print }: { card: Card; lod: 'full' | 'compact' | 'reader'; print?: boolean }) {
  const { links } = useBoardRefs();
  const d = readCardData(HypothesisData, card.data);
  if (!d) return null;
  const ev = hypothesisEvidence(card, Object.values(links));
  const reader = lod === 'reader';
  return (
    <div className={y.stack} data-testid="card-hypothesis">
      <ConfidenceBar value={d.confidence} />
      <p className={cx(y.balance)} data-testid="hypothesis-balance">
        <span className={y.for}>{ev.for.length} for</span>
        <span>{ev.against.length} against</span>
      </p>
      {d.body && lod !== 'compact' && <p className={cx(y.text, (reader || print) && y.textFull)}>{d.body}</p>}
      {(reader || print) && (
        <>
          <p className={y.heading}>For</p>
          {ev.for.length ? <Citations ids={ev.for} max={ev.for.length} open={reader} /> : <p className={y.empty}>No evidence yet.</p>}
          <p className={y.heading}>Against</p>
          {ev.against.length ? (
            <Citations ids={ev.against} max={ev.against.length} open={reader} />
          ) : (
            <p className={y.empty}>Nothing against it yet.</p>
          )}
        </>
      )}
    </div>
  );
}

export const HypothesisTitleExtra = ({ card }: { card: Card }) => {
  const d = readCardData(HypothesisData, card.data);
  return d ? (
    <p className={y.titleExtra} data-testid="hypothesis-title-confidence">
      {d.confidence}%
    </p>
  ) : null;
};

// ---- Decision ----

/** The options a board card lists (four at most): ranked by the rubric when there is one; the choice always shows. */
function shownOptions(d: DecisionData, totals: ReturnType<typeof decisionTotals>) {
  const all: { label: string; total: number | undefined }[] = totals
    ? [...totals].sort((a, b) => a.rank - b.rank)
    : d.options.map((o) => ({ label: o.label, total: undefined }));
  const top = all.slice(0, 4);
  const chosen = all.find((o) => o.label === d.choice);
  if (chosen && !top.includes(chosen)) top[top.length - 1] = chosen;
  return top;
}

const STATUS_LABEL = { open: 'open', decided: 'decided', revisit: 'revisit' } as const;

export function DecisionView({ card, lod, print }: { card: Card; lod: 'full' | 'compact' | 'reader'; print?: boolean }) {
  const d = readCardData(DecisionData, card.data);
  if (!d) return null;
  const status = d.status ?? 'open';
  const totals = decisionTotals(d);
  const reader = lod === 'reader';
  const whole = reader || print;
  return (
    <div className={y.stack} data-testid="card-decision">
      <span className={cx(y.pill, status === 'decided' && y.pillDecided)} data-testid="decision-status">
        {STATUS_LABEL[status]}
      </span>
      {d.choice && (lod === 'compact' || whole) && (
        <p className={cx(y.text, y.chosen)} data-testid="decision-choice">
          {d.choice}
        </p>
      )}
      {lod === 'compact' && !d.choice && <p className={y.meta}>{plural(d.options.length, 'option')}</p>}
      {lod !== 'compact' && !whole && (
        <ul className={y.options} data-testid="decision-options">
          {shownOptions(d, totals).map((o) => (
            <li key={o.label} className={y.option} data-chosen={o.label === d.choice}>
              <span className={cx(y.optionName, o.label === d.choice && y.chosen)}>{o.label}</span>
              {o.total !== undefined && <span className={y.total}>{o.total.toFixed(1)}</span>}
            </li>
          ))}
        </ul>
      )}
      {d.rationale && lod !== 'compact' && <p className={cx(y.text, whole && y.textFull)}>{d.rationale}</p>}
      {whole && (
        <>
          {d.body && <p className={cx(y.text, y.textFull)}>{d.body}</p>}
          <p className={y.heading}>Options</p>
          {d.criteria?.length && totals ? (
            <table className={y.rubric} data-testid="decision-rubric">
              <thead>
                <tr>
                  <th scope="col">Option</th>
                  {d.criteria.map((c, i) => (
                    <th key={i} scope="col" className={y.num}>
                      {c.name} <span className={y.total}>×{c.weight}</span>
                    </th>
                  ))}
                  <th scope="col" className={y.num}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.options.map((o, i) => (
                  <tr key={o.label}>
                    <td className={cx(o.label === d.choice && y.chosen)}>{o.label}</td>
                    {(o.scores ?? []).map((sc, j) => (
                      <td key={j} className={y.num}>
                        {sc}
                      </td>
                    ))}
                    <td className={cx(y.num, y.chosen)} data-testid="decision-total">
                      {totals[i]!.total.toFixed(2)} (#{totals[i]!.rank})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <ul className={y.options}>
              {d.options.map((o) => (
                <li key={o.label} className={y.option}>
                  <span className={cx(o.label === d.choice && y.chosen)}>
                    {o.label}
                    {o.note ? ` — ${o.note}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ---- Framework ----

export function FrameworkView({ card, lod, print }: { card: Card; lod: 'full' | 'compact' | 'reader'; print?: boolean }) {
  const d = readCardData(FrameworkData, card.data);
  if (!d) return null;
  const cells = frameworkCells(d);
  if (lod === 'compact')
    return (
      <p className={y.meta} data-testid="card-framework">
        {cells.map((c) => `${c.label.split(',')[0]} ${c.items.length}`).join(' · ')}
      </p>
    );
  const whole = lod === 'reader' || print;
  const per = whole ? 8 : Math.max(1, Math.floor((HEIGHTS.framework.max - 150) / (d.variant === 'proscons' ? 22 : 44)));
  return (
    <div className={y.stack} data-testid="card-framework">
      {whole && d.body && <p className={cx(y.text, y.textFull)}>{d.body}</p>}
      {d.variant === 'quadrant' && d.xAxis && d.yAxis && (
        <p className={y.axes}>
          <span>↑ {d.yAxis}</span>
          <span>{d.xAxis} →</span>
        </p>
      )}
      <div className={y.grid} data-variant={d.variant}>
        {cells.map((c) => (
          <div key={c.key} className={y.cell} data-cell={c.key}>
            <p className={y.cellLabel}>{c.label}</p>
            {c.items.length ? (
              <ul className={y.items}>
                {c.items.slice(0, per).map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
                {c.items.length > per && <li className={y.meta}>+{c.items.length - per} more</li>}
              </ul>
            ) : (
              <p className={y.empty}>Nothing yet.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
