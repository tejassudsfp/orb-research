/**
 * Database (P6.3): rows of a dataset as a table, board or gallery. The board shows the active view of the fetched
 * dataset (the card's preview until it arrives); the reader is the full editor; print draws the preview rows.
 */
import { HEIGHTS, DatabaseData, activeView, readCardData, type Card } from '@orb/shared';
import { PrintBody, printBodyOf, type PrintHalf } from '../../print/kit.js';
import { useCardActions } from '../context.js';
import { DatasetEditor, ViewBody } from '../dataset/DatasetViews.js';
import { useDataset, useDatasetEdit } from '../dataset/useDataset.js';
import { pptxHook } from '../pptx.js';
import { TextBody, type CardBody, ReaderText, type CardUi } from './kit.js';
import s from '../../canvas/canvas.module.css';
import c from '../cards.module.css';
import p from '../../print/print.module.css';

const Body: CardBody = ({ card, lod }) => {
  const d = readCardData(DatabaseData, card.data);
  const { ds } = useDataset(lod === 'compact' ? undefined : d?.datasetId, d?.rev ?? 0);
  if (!d) return <TextBody card={card} lod={lod} />;
  if (lod === 'compact')
    return (
      <p className={s.cardBody}>
        {d.rowCount} rows · {d.columns.join(' · ')}
      </p>
    );
  // The rows that fit under the type's tallest card (P6.20): a card's content never depends on the height it has.
  const rows = Math.max(1, Math.floor((HEIGHTS.database.max - 120) / 28));
  if (ds && card.view) {
    return (
      <div data-testid="card-database">
        <ViewBody ds={ds} view={activeView(card.view)} maxRows={rows} testid="card-db" />
      </div>
    );
  }
  const shown = (d.preview ?? []).slice(0, rows);
  return (
    <div className={c.tableWrap} data-testid="card-database">
      <table className={c.table}>
        <thead>
          <tr>
            {d.columns.map((col, i) => (
              <th key={i} scope="col">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {d.rowCount > shown.length && <p className={c.tableMore}>{d.rowCount - shown.length} more rows</p>}
    </div>
  );
};

function Reader({ card }: { card: Card }) {
  const { setView } = useCardActions();
  const d = readCardData(DatabaseData, card.data);
  const { ds, error } = useDataset(d?.datasetId, d?.rev ?? 0);
  const edit = useDatasetEdit(d?.datasetId);
  if (!d) return <ReaderText card={card} />;
  if (!ds || !card.view) return <p className={c.muted}>{error ?? 'Loading the data…'}</p>;
  return (
    <DatasetEditor ds={ds} cardView={card.view} onView={(next) => setView(card.id, next)} edit={edit} testid="reader-db" />
  );
}

const Print: PrintHalf = ({ card, mode }) => {
  const d = readCardData(DatabaseData, card.data);
  if (!d) return <PrintBody>{printBodyOf(card)}</PrintBody>;
  const preview = d.preview ?? [];
  const shown = mode === 'canvas' ? preview.slice(0, Math.max(1, Math.floor((card.h - 110) / 26))) : preview;
  const more = d.rowCount - shown.length;
  return (
    <>
      <table className={p.table} data-testid="print-table">
        <thead>
          <tr>
            {d.columns.map((col, i) => (
              <th key={i}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {more > 0 && <p className={p.meta}>+{more} more rows</p>}
    </>
  );
};

export const database: CardUi = { Body, Reader, Print, pptx: pptxHook };
