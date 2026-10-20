/**
 * A Table card's table (P2.5): header buttons sort by that column (ascending, descending, off) and the sort is saved
 * on the card, so it is the same after reopen. Used on the board (first rows) and in the reader (every row held).
 */
import { nextSort, sortTableRows, type TableData, type TableSort } from '@orb/shared';
import { useMemo, useState } from 'react';
import { RowDetails } from './RowDetails.js';
import r from './RowDetails.module.css';
import c from './cards.module.css';

export function TableView({
  data,
  maxRows,
  onSort,
  testid = 'table-view',
  inspect = false,
}: {
  data: TableData;
  /** Rows shown (the rest are counted below the table). */
  maxRows?: number;
  onSort?: (sort: TableSort | undefined) => void;
  testid?: string;
  inspect?: boolean;
}) {
  const [selected, setSelected] = useState<number | undefined>();
  const order = useMemo(() => sortTableRows(data.rows, data.sort), [data.rows, data.sort]);
  const shown = maxRows === undefined ? order : order.slice(0, maxRows);
  const hidden = data.totalRows - shown.length;
  const index = shown.findIndex((row) => row === selected);
  return (
    <div className={inspect ? `${r.workspace} ${index >= 0 ? r.withDetails : ''}` : undefined}>
      <div
        className={c.tableWrap}
        data-testid={testid}
        tabIndex={inspect ? 0 : undefined}
        role={inspect ? 'region' : undefined}
        aria-label={inspect ? 'Card table' : undefined}
      >
        <table className={c.table}>
          <thead>
            <tr>
              {data.columns.map((col, i) => {
                const dir = data.sort?.column === i ? data.sort.dir : undefined;
                return (
                  <th
                    key={i}
                    scope="col"
                    aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                  >
                    {onSort ? (
                      <button
                        type="button"
                        className={c.sortButton}
                        data-card-action="sort"
                        data-testid={`${testid}-sort-${i}`}
                        onClick={() => onSort(nextSort(data.sort, i))}
                      >
                        {col}
                        <span aria-hidden="true" className={c.sortMark}>
                          {dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : ''}
                        </span>
                      </button>
                    ) : (
                      col
                    )}
                  </th>
                );
              })}
              {inspect && <th scope="col">Row details</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r} data-testid={`${testid}-row`}>
                {data.rows[r]!.map((cell, i) => (
                  <td key={i}>{cell}</td>
                ))}
                {inspect && (
                  <td>
                    <button
                      type="button"
                      className={c.chip}
                      aria-label="View row details"
                      aria-expanded={selected === r}
                      data-testid={`${testid}-row-open`}
                      onClick={() => setSelected(r)}
                    >
                      Details
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {hidden > 0 && (
          <p className={c.tableMore}>
            {hidden} more row{hidden === 1 ? '' : 's'}
            {data.totalRows > data.rows.length
              ? ` (the card holds ${data.rows.length}; the CSV is in assets/)`
              : ''}
          </p>
        )}
      </div>
      {index >= 0 && selected !== undefined && (
        <RowDetails
          fields={data.columns.map((name, i) => ({ name, value: data.rows[selected]?.[i] ?? '' }))}
          index={index}
          total={shown.length}
          onPrevious={() => setSelected(shown[index - 1])}
          onNext={() => setSelected(shown[index + 1])}
          onClose={() => setSelected(undefined)}
        />
      )}
    </div>
  );
}
