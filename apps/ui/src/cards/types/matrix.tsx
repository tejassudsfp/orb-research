/** Comparison matrix (P6.4): options in columns, weighted criteria in rows, the weighted total, the winner highlighted. */
import { HEIGHTS, MatrixData, matrixTotals, readCardData, type Card } from '@orb/shared';
import { PrintBody, printBodyOf, type PrintHalf } from '../../print/kit.js';
import { pptxHook } from '../pptx.js';
import { TextBody, type CardBody, ReaderText, type CardUi } from './kit.js';
import s from '../../canvas/canvas.module.css';
import c from '../cards.module.css';
import { CardReferences } from '../CardReferences.js';

function Matrix({
  d,
  maxRows,
  cls,
  win,
  testid,
  reader,
}: {
  d: MatrixData;
  maxRows?: number;
  cls: string | undefined;
  win: string | undefined;
  testid: string;
  reader?: boolean;
}) {
  const { totals, winners, tie } = matrixTotals(d);
  const isWin = (i: number) => winners.includes(i);
  const rows = d.criteria.slice(0, maxRows ?? d.criteria.length);
  return (
    <table
      className={cls}
      data-testid={testid}
      data-reader={reader || undefined}
      style={reader ? { minWidth: 240 + d.options.length * 120 } : undefined}
    >
      <colgroup>
        <col className={c.matrixCriterion} />
        {d.options.map((_, i) => (
          <col key={i} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Criterion</th>
          {d.options.map((o, i) => (
            <th key={i} scope="col" className={isWin(i) ? win : undefined}>
              {o.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cr, ci) => (
          <tr key={ci}>
            <th scope="row">
              {cr.name}
              <span className={c.matrixWeight}>
                {Math.round((cr.weight / d.criteria.reduce((n, c) => n + c.weight, 0)) * 10000) / 100}% weight
              </span>
            </th>
            {d.options.map((o, i) => (
              <td key={i} className={isWin(i) ? win : undefined}>
                {o.scores[ci] ?? '–'}
              </td>
            ))}
          </tr>
        ))}
        {rows.length < d.criteria.length && (
          <tr>
            <th scope="row">+{d.criteria.length - rows.length} more criteria</th>
            {d.options.map((_, i) => (
              <td key={i} className={isWin(i) ? win : undefined}>
                …
              </td>
            ))}
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr className={c.matrixTotal}>
          <th scope="row">Weighted / 10</th>
          {d.options.map((_, i) => (
            <td
              key={i}
              className={isWin(i) ? win : undefined}
              data-testid={isWin(i) ? 'matrix-winner' : undefined}
            >
              {totals[i] ?? 'Not scored'}
              {isWin(i) && <span className={c.matrixBadge}>{tie ? 'tie' : 'best'}</span>}
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  );
}

const Body: CardBody = ({ card, lod }) => {
  const d = readCardData(MatrixData, card.data);
  if (!d) return <TextBody card={card} lod={lod} />;
  if (lod === 'compact') {
    const { winners, tie } = matrixTotals(d);
    return (
      <p className={s.cardBody}>
        {d.options.length} options ·{' '}
        {!winners.length ? 'scores pending' : tie ? 'tie' : `best: ${d.options[winners[0]!]!.name}`}
      </p>
    );
  }
  const maxRows = Math.max(1, Math.floor((HEIGHTS.matrix.max - 150) / 40));
  return (
    <div className={c.tableWrap} data-testid="card-matrix">
      <Matrix d={d} maxRows={maxRows} cls={c.matrix} win={c.matrixWin} testid="card-matrix-table" />
    </div>
  );
};

function Reader({ card }: { card: Card }) {
  const d = readCardData(MatrixData, card.data);
  if (!d) return <ReaderText card={card} />;
  const notes = d.options.filter((o) => o.note);
  return (
    <div className={c.matrixReader} data-testid="reader-matrix">
      <p className={c.matrixNote}>
        Scores are out of 10. Unassessed cells stay blank; they are not zero. Your score, when present, is
        optional.
      </p>
      <div className={c.matrixScroll} role="region" aria-label="Comparison scores" tabIndex={0}>
        <Matrix d={d} reader cls={c.matrix} win={c.matrixWin} testid="reader-matrix-table" />
      </div>
      {notes.map((o, i) => (
        <p key={i} className={c.matrixNote}>
          <strong>{o.name}:</strong> <CardReferences text={o.note!} />
        </p>
      ))}
    </div>
  );
}

const Print: PrintHalf = ({ card }) => {
  const d = readCardData(MatrixData, card.data);
  if (!d) return <PrintBody>{printBodyOf(card)}</PrintBody>;
  return <Matrix d={d} cls={c.matrix} win={c.matrixWin} testid="print-matrix" />;
};

export const matrix: CardUi = { Body, Reader, Print, pptx: pptxHook };
