/** Table: rows that fit the card (sortable); the whole table in the reader; a real table in print. */
import { useState } from 'react';
import { HEIGHTS, TableData, readCardData, sortTableRows, type Card } from '@orb/shared';
import { PrintBody, printBodyOf, type PrintHalf } from '../../print/kit.js';
import { useCardActions } from '../context.js';
import { pptxHook } from '../pptx.js';
import { TableView } from '../TableView.js';
import { TextBody, type CardBody, ReaderText, type CardUi } from './kit.js';
import s from '../../canvas/canvas.module.css';
import c from '../cards.module.css';
import p from '../../print/print.module.css';

const Body: CardBody = ({ card, lod }) => {
  const { sortTable } = useCardActions();
  const d = readCardData(TableData, card.data);
  if (!d) return <TextBody card={card} lod={lod} />;
  if (lod === 'compact') return <p className={s.cardBody}>{d.columns.join(' · ')}</p>;
  const rows = Math.max(1, Math.floor((HEIGHTS.table.max - 96) / 30));
  return (
    <TableView data={d} maxRows={rows} onSort={(sort) => sortTable(card.id, sort)} testid="card-table" />
  );
};

function Reader({ card }: { card: Card }) {
  const { sortTable, promoteTable } = useCardActions();
  const [error, setError] = useState('');
  const d = readCardData(TableData, card.data);
  if (!d) return <ReaderText card={card} />;
  return (
    <div className={c.readerTable}>
      <p className={c.muted}>
        <button
          type="button"
          className={c.chip}
          data-testid="table-promote"
          title="Turn this table into a database with table, board and gallery views"
          onClick={() => void promoteTable(card.id).catch((e: Error) => setError(e.message))}
        >
          Make database
        </button>{' '}
        {error}
      </p>
      <TableView data={d} onSort={(sort) => sortTable(card.id, sort)} testid="reader-table" inspect />
    </div>
  );
}

const Print: PrintHalf = ({ card, mode }) => {
  const d = readCardData(TableData, card.data);
  if (!d) return <PrintBody>{printBodyOf(card)}</PrintBody>;
  const rows = sortTableRows(d.rows, d.sort).map((i) => d.rows[i]!);
  // On a canvas page the table keeps the card's size; a figure prints every row the card holds.
  const shown = mode === 'canvas' ? rows.slice(0, Math.max(1, Math.floor((card.h - 110) / 26))) : rows;
  const more = d.totalRows - shown.length;
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

export const table: CardUi = { Body, Reader, Print, pptx: pptxHook };
