/**
 * Dataset views (P6.3): a dataset shown as a table, a board (lanes) or a gallery, each with filter, sort and group.
 * `ViewBody` draws one view read-only (the board card, print, the attached strip); `DatasetEditor` is the reader's
 * full editor (cells, rows, columns, the view tabs and their filter / sort / group controls). Every view change is
 * one `setView` (one undoable `card.updated` of `Card.view`); every cell edit is a dataset edit.
 *
 * Nothing here loads a remote image: a gallery cover is drawn only from an `assets/…` path of this canvas or a
 * `data:` image; any other value shows as text.
 */
import { useMemo, useState } from 'react';
import {
  DATASET_LIMITS,
  activeView,
  applyView,
  cellText,
  defaultView,
  findColumn,
  type CardView,
  type Cell,
  type Dataset,
  type DatasetColumn,
  type DatasetEdit,
  type DatasetRow,
  type DatasetView,
  type Filter,
  type FilterOp,
  type ViewKind,
} from '@orb/shared';
import { useCardActions } from '../context.js';
import { RowDetails } from '../RowDetails.js';
import r from '../RowDetails.module.css';
import d from './dataset.module.css';

const OPS: { op: FilterOp; label: string; value: boolean }[] = [
  { op: 'contains', label: 'contains', value: true },
  { op: 'notContains', label: 'does not contain', value: true },
  { op: 'eq', label: 'is', value: true },
  { op: 'neq', label: 'is not', value: true },
  { op: 'gt', label: '>', value: true },
  { op: 'gte', label: '≥', value: true },
  { op: 'lt', label: '<', value: true },
  { op: 'lte', label: '≤', value: true },
  { op: 'empty', label: 'is empty', value: false },
  { op: 'notEmpty', label: 'is not empty', value: false },
];

const KIND_LABEL: Record<ViewKind, string> = { table: 'Table', board: 'Board', gallery: 'Gallery' };

/** The columns a view shows. */
export const shownColumns = (ds: Dataset, view: DatasetView): DatasetColumn[] => {
  const hidden = new Set(view.hidden);
  const shown = ds.columns.filter((c) => !hidden.has(c.id));
  return shown.length > 0 ? shown : ds.columns.slice(0, 1);
};

const isImage = (v: string) => /^assets\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v) || /^data:image\//.test(v);

function CellValue({ col, cell }: { col: DatasetColumn; cell: Cell | undefined }) {
  if (col.type === 'checkbox') {
    return <span aria-label={cell ? 'Yes' : 'No'}>{cell === true ? '☑' : cell === false ? '☐' : ''}</span>;
  }
  return <>{cellText(cell)}</>;
}

/** An editable cell: Enter or blur saves, Escape drops the change. */
function CellEditor({
  col,
  cell,
  onSave,
  testid,
}: {
  col: DatasetColumn;
  cell: Cell | undefined;
  onSave: (value: Cell) => void;
  testid: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (col.type === 'checkbox') {
    return (
      <input
        type="checkbox"
        checked={cell === true}
        aria-label={col.name}
        data-testid={testid}
        onChange={(e) => onSave(e.target.checked)}
      />
    );
  }
  if (col.type === 'select' && col.options) {
    const value = cellText(cell);
    const options = value && !col.options.includes(value) ? [value, ...col.options] : col.options;
    return (
      <select
        className={d.cellInput}
        value={value}
        aria-label={col.name}
        data-testid={testid}
        onChange={(e) => onSave(e.target.value === '' ? null : e.target.value)}
      >
        <option value="" />
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  const shown = draft ?? cellText(cell);
  const commit = () => {
    if (draft === null) return;
    if (draft !== cellText(cell)) onSave(draft === '' ? null : draft);
    setDraft(null);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.currentTarget.tagName === 'INPUT' || !e.shiftKey)) {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (e.key === 'Escape' && draft !== null) {
      e.preventDefault();
      e.stopPropagation();
      setDraft(null);
    }
  };
  const props = {
    className: d.cellInput,
    'data-testid': testid,
    'aria-label': col.name,
    value: shown,
    maxLength: DATASET_LIMITS.cell,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown,
  };
  return col.type === 'text' || col.type === 'url' ? (
    <textarea {...props} rows={3} />
  ) : (
    <input {...props} inputMode={col.type === 'number' ? 'decimal' : undefined} />
  );
}

type BodyProps = {
  ds: Dataset;
  view: DatasetView;
  /** Rows shown (the rest are counted below); default all. */
  maxRows?: number;
  edit?: (edit: DatasetEdit) => void;
  testid?: string;
  onInspect?: ((row: string) => void) | undefined;
  selectedRow?: string | undefined;
};

function TableBody({ ds, view, maxRows, edit, testid, onInspect, selectedRow }: BodyProps) {
  const { rows, groups } = useMemo(() => applyView(ds, view), [ds, view]);
  const cols = shownColumns(ds, view);
  let budget = maxRows ?? Infinity;
  const sections = groups && view.group ? groups : [{ key: '', label: '', rows }];
  const totalShown = Math.min(rows.length, maxRows ?? rows.length);
  return (
    <div
      className={d.tableWrap}
      data-testid={`${testid}-table`}
      tabIndex={onInspect ? 0 : undefined}
      role={onInspect ? 'region' : undefined}
      aria-label={onInspect ? 'Dataset table' : undefined}
    >
      <table className={d.table}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.id} scope="col" className={c.type === 'number' ? d.num : undefined}>
                {c.name}
              </th>
            ))}
            {(edit || onInspect) && <th aria-label="Row actions" />}
          </tr>
        </thead>
        {sections.map((g) => {
          const take = g.rows.slice(0, Math.max(0, budget));
          budget -= take.length;
          if (view.group && take.length === 0 && budget <= 0) return null;
          return (
            <tbody key={g.key || 'all'}>
              {view.group && (
                <tr className={d.groupRow}>
                  <th colSpan={cols.length + (edit || onInspect ? 1 : 0)} scope="rowgroup">
                    {g.label} <span className={d.groupCount}>{g.rows.length}</span>
                  </th>
                </tr>
              )}
              {take.map((r) => (
                <tr
                  key={r.id}
                  data-testid={`${testid}-row`}
                  data-row-id={r.id}
                  data-selected={selectedRow === r.id}
                >
                  {cols.map((c) => (
                    <td key={c.id} className={c.type === 'number' ? d.num : undefined}>
                      {edit ? (
                        <CellEditor
                          col={c}
                          cell={r.cells[c.id]}
                          testid={`${testid}-cell-${r.id}-${c.id}`}
                          onSave={(value) => edit({ op: 'setCell', row: r.id, column: c.id, value })}
                        />
                      ) : (
                        <CellValue col={c} cell={r.cells[c.id]} />
                      )}
                    </td>
                  ))}
                  {(edit || onInspect) && (
                    <td>
                      {onInspect && (
                        <button
                          type="button"
                          className={d.smallButton}
                          aria-label="View row details"
                          aria-expanded={selectedRow === r.id}
                          data-testid={`${testid}-row-open`}
                          onClick={() => onInspect(r.id)}
                        >
                          Details
                        </button>
                      )}
                      {edit && (
                        <button
                          type="button"
                          className={d.rowDelete}
                          aria-label="Delete row"
                          data-testid={`${testid}-row-delete`}
                          onClick={() => edit({ op: 'deleteRows', rows: [r.id] })}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
      {rows.length > totalShown && (
        <p className={d.more}>
          {rows.length - totalShown} more row{rows.length - totalShown === 1 ? '' : 's'}
        </p>
      )}
      {rows.length === 0 && (
        <p className={d.more}>No rows{view.filter.length > 0 ? ' match the filters' : ''}.</p>
      )}
    </div>
  );
}

function RowCard({
  ds,
  view,
  row,
  lane,
  edit,
  testid,
  onInspect,
  selectedRow,
}: {
  ds: Dataset;
  view: DatasetView;
  row: DatasetRow;
  lane?: DatasetColumn | undefined;
  edit?: ((edit: DatasetEdit) => void) | undefined;
  testid: string;
  onInspect?: ((row: string) => void) | undefined;
  selectedRow?: string | undefined;
}) {
  const { assetUrl } = useCardActions();
  const cols = shownColumns(ds, view);
  const cover = view.kind === 'gallery' && view.cover ? findColumn(ds, view.cover) : undefined;
  const coverValue = cover ? cellText(row.cells[cover.id]) : '';
  const [first, ...rest] = cols.filter((c) => c.id !== cover?.id && c.id !== lane?.id);
  return (
    <li className={d.tile} data-testid={testid} data-row-id={row.id}>
      {cover && coverValue && isImage(coverValue) && (
        <img
          className={d.cover}
          alt=""
          src={coverValue.startsWith('assets/') ? assetUrl({ path: coverValue }) : coverValue}
        />
      )}
      {cover && coverValue && !isImage(coverValue) && (
        <span className={d.coverText}>{coverValue.slice(0, 60)}</span>
      )}
      <strong className={d.tileTitle}>
        {first ? cellText(row.cells[first.id]) || 'Untitled' : 'Untitled'}
      </strong>
      {onInspect && (
        <button
          type="button"
          className={d.smallButton}
          aria-label="View row details"
          aria-expanded={selectedRow === row.id}
          data-testid={`${testid}-open`}
          onClick={() => onInspect(row.id)}
        >
          View details
        </button>
      )}
      {rest.slice(0, 3).map((c) => {
        const text = cellText(row.cells[c.id]);
        return text ? (
          <span key={c.id} className={d.tileField}>
            <span className={d.tileLabel}>{c.name}</span> <CellValue col={c} cell={row.cells[c.id]} />
          </span>
        ) : null;
      })}
      {edit && lane && lane.options && (
        <select
          className={d.cellInput}
          aria-label={`Move to ${lane.name}`}
          value={cellText(row.cells[lane.id])}
          data-testid={`${testid}-lane`}
          onChange={(e) =>
            edit({ op: 'setCell', row: row.id, column: lane.id, value: e.target.value || null })
          }
        >
          <option value="" />
          {lane.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}

function BoardLanes({ ds, view, maxRows, edit, testid, onInspect, selectedRow }: BodyProps) {
  const { groups } = useMemo(() => applyView(ds, view), [ds, view]);
  const lane = (view.group ? findColumn(ds, view.group) : undefined) ?? undefined;
  if (!groups)
    return (
      <TableBody
        ds={ds}
        view={view}
        {...(maxRows !== undefined ? { maxRows } : {})}
        {...(edit ? { edit } : {})}
        testid={testid}
        onInspect={onInspect}
        selectedRow={selectedRow}
      />
    );
  let budget = maxRows ?? Infinity;
  return (
    <div className={d.lanes} data-testid={`${testid}-board`}>
      {groups.map((g) => {
        const take = g.rows.slice(0, Math.max(0, budget));
        budget -= take.length;
        return (
          <section
            key={g.key || 'none'}
            className={d.lane}
            aria-label={g.label}
            data-testid={`${testid}-lane-${g.key || 'none'}`}
          >
            <h4 className={d.laneTitle}>
              {g.label} <span className={d.groupCount}>{g.rows.length}</span>
            </h4>
            <ul className={d.tiles}>
              {take.map((r) => (
                <RowCard
                  key={r.id}
                  ds={ds}
                  view={view}
                  row={r}
                  lane={lane}
                  edit={edit}
                  testid={`${testid}-card`}
                  onInspect={onInspect}
                  selectedRow={selectedRow}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function GalleryGrid({ ds, view, maxRows, edit, testid, onInspect, selectedRow }: BodyProps) {
  const { rows } = useMemo(() => applyView(ds, view), [ds, view]);
  const shown = rows.slice(0, maxRows ?? rows.length);
  return (
    <div data-testid={`${testid}-gallery`}>
      <ul className={d.gallery}>
        {shown.map((r) => (
          <RowCard
            key={r.id}
            ds={ds}
            view={view}
            row={r}
            edit={edit}
            testid={`${testid}-tile`}
            onInspect={onInspect}
            selectedRow={selectedRow}
          />
        ))}
      </ul>
      {rows.length > shown.length && <p className={d.more}>{rows.length - shown.length} more</p>}
    </div>
  );
}

/** One view of a dataset, in its kind. */
export function ViewBody(props: BodyProps) {
  const testid = props.testid ?? 'dataset';
  const p = { ...props, testid };
  return props.view.kind === 'board' ? (
    <BoardLanes {...p} />
  ) : props.view.kind === 'gallery' ? (
    <GalleryGrid {...p} />
  ) : (
    <TableBody {...p} />
  );
}

// ---- Controls ----

function FilterRow({
  ds,
  filter,
  onChange,
  onRemove,
  index,
}: {
  ds: Dataset;
  filter: Filter;
  onChange: (f: Filter) => void;
  onRemove: () => void;
  index: number;
}) {
  const col = findColumn(ds, filter.column);
  const spec = OPS.find((o) => o.op === filter.op);
  const [draft, setDraft] = useState(
    Array.isArray(filter.value) ? filter.value.join(', ') : cellText((filter.value ?? null) as Cell),
  );
  const commit = () => {
    const cur = Array.isArray(filter.value)
      ? filter.value.join(', ')
      : cellText((filter.value ?? null) as Cell);
    if (draft !== cur) onChange({ ...filter, value: draft });
  };
  return (
    <div className={d.controlRow} data-testid={`dataset-filter-${index}`}>
      <select
        aria-label="Filter column"
        className={d.select}
        value={col?.id ?? ''}
        data-testid={`dataset-filter-${index}-column`}
        onChange={(e) => onChange({ ...filter, column: e.target.value })}
      >
        {ds.columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter operator"
        className={d.select}
        value={filter.op}
        data-testid={`dataset-filter-${index}-op`}
        onChange={(e) => onChange({ ...filter, op: e.target.value as FilterOp })}
      >
        {OPS.map((o) => (
          <option key={o.op} value={o.op}>
            {o.label}
          </option>
        ))}
      </select>
      {spec?.value && (
        <input
          className={d.cellInput}
          aria-label="Filter value"
          data-testid={`dataset-filter-${index}-value`}
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      )}
      <button type="button" className={d.rowDelete} aria-label="Remove filter" onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

/** Filter, sort and group controls of one view. */
function ViewControls({
  ds,
  view,
  onChange,
}: {
  ds: Dataset;
  view: DatasetView;
  onChange: (v: DatasetView) => void;
}) {
  const sort = view.sort[0];
  return (
    <div className={d.controls} data-testid="dataset-controls">
      {view.filter.map((f, i) => (
        <FilterRow
          key={`${i}-${f.column}-${f.op}`}
          ds={ds}
          filter={f}
          index={i}
          onChange={(next) => onChange({ ...view, filter: view.filter.map((x, j) => (j === i ? next : x)) })}
          onRemove={() => onChange({ ...view, filter: view.filter.filter((_, j) => j !== i) })}
        />
      ))}
      <div className={d.controlRow}>
        <button
          type="button"
          className={d.smallButton}
          data-testid="dataset-filter-add"
          disabled={view.filter.length >= DATASET_LIMITS.filters}
          onClick={() =>
            onChange({
              ...view,
              filter: [...view.filter, { column: ds.columns[0]!.id, op: 'contains', value: '' }],
            })
          }
        >
          + Filter
        </button>
        {view.filter.length > 1 && (
          <select
            aria-label="Match filters"
            className={d.select}
            value={view.match}
            onChange={(e) => onChange({ ...view, match: e.target.value as 'and' | 'or' })}
          >
            <option value="and">match all</option>
            <option value="or">match any</option>
          </select>
        )}
        <label className={d.inline}>
          Sort
          <select
            className={d.select}
            data-testid="dataset-sort-column"
            value={sort ? (findColumn(ds, sort.column)?.id ?? '') : ''}
            onChange={(e) =>
              onChange({
                ...view,
                sort: e.target.value ? [{ column: e.target.value, dir: sort?.dir ?? 'asc' }] : [],
              })
            }
          >
            <option value="">none</option>
            {ds.columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {sort && (
          <select
            aria-label="Sort direction"
            className={d.select}
            data-testid="dataset-sort-dir"
            value={sort.dir}
            onChange={(e) =>
              onChange({ ...view, sort: [{ column: sort.column, dir: e.target.value as 'asc' | 'desc' }] })
            }
          >
            <option value="asc">ascending</option>
            <option value="desc">descending</option>
          </select>
        )}
        <label className={d.inline}>
          {view.kind === 'board' ? 'Lanes' : 'Group'}
          <select
            className={d.select}
            data-testid="dataset-group"
            value={view.group ? (findColumn(ds, view.group)?.id ?? '') : ''}
            onChange={(e) => onChange({ ...view, group: e.target.value || null })}
          >
            <option value="">{view.kind === 'board' ? 'auto' : 'none'}</option>
            {ds.columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {view.kind === 'gallery' && (
          <label className={d.inline}>
            Cover
            <select
              className={d.select}
              data-testid="dataset-cover"
              value={view.cover ? (findColumn(ds, view.cover)?.id ?? '') : ''}
              onChange={(e) => onChange({ ...view, cover: e.target.value || null })}
            >
              <option value="">none</option>
              {ds.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

/** The view tabs, "New view" and the controls of the active view; every change goes to `onView`. */
export function ViewBar({
  ds,
  cardView,
  onView,
}: {
  ds: Dataset;
  cardView: CardView;
  onView: (next: CardView) => void;
}) {
  const view = activeView(cardView);
  const setView = (next: DatasetView) =>
    onView({ ...cardView, views: cardView.views.map((v) => (v.id === next.id ? next : v)) });
  const add = (kind: ViewKind) => {
    const n = Math.max(0, ...cardView.views.map((v) => Number(v.id.slice(1)))) + 1;
    const next = defaultView(
      `v${n}`,
      kind,
      `${KIND_LABEL[kind]}${cardView.views.some((v) => v.kind === kind) ? ` ${n}` : ''}`,
    );
    onView({ ...cardView, views: [...cardView.views, next], active: next.id });
  };
  return (
    <div data-testid="dataset-viewbar">
      <div className={d.tabs}>
        <div
          className={d.viewTabs}
          role="tablist"
          aria-label="Views"
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            const tabs = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
            const at = tabs.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? tabs.length - 1
                  : (at + (e.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
            e.preventDefault();
            tabs[next]?.click();
            tabs[next]?.focus();
          }}
        >
          {cardView.views.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={v.id === view.id}
              tabIndex={v.id === view.id ? 0 : -1}
              className={v.id === view.id ? d.tabOn : d.tab}
              data-testid={`dataset-tab-${v.id}`}
              data-kind={v.kind}
              onClick={() => onView({ ...cardView, active: v.id })}
            >
              {v.name}
            </button>
          ))}
        </div>
        {cardView.views.length < DATASET_LIMITS.views &&
          (['table', 'board', 'gallery'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={d.addView}
              data-testid={`dataset-add-${k}`}
              onClick={() => add(k)}
            >
              + {KIND_LABEL[k]}
            </button>
          ))}
        {cardView.views.length > 1 && (
          <button
            type="button"
            className={d.addView}
            data-testid="dataset-remove-view"
            onClick={() => {
              const views = cardView.views.filter((v) => v.id !== view.id);
              onView({ ...cardView, views, active: views[0]!.id });
            }}
          >
            Remove view
          </button>
        )}
      </div>
      <ViewControls ds={ds} view={view} onChange={setView} />
    </div>
  );
}

/** The reader's dataset editor: the views with their controls, the rows (editable), add row / column. */
export function DatasetEditor({
  ds,
  cardView,
  onView,
  edit,
  testid = 'dataset',
}: {
  ds: Dataset;
  cardView: CardView;
  onView: (next: CardView) => void;
  edit: (edit: DatasetEdit) => void;
  testid?: string;
}) {
  const view = activeView(cardView);
  const [column, setColumn] = useState('');
  const [selected, setSelected] = useState<string | undefined>();
  const { rows } = useMemo(() => applyView(ds, view), [ds, view]);
  const index = rows.findIndex((row) => row.id === selected);
  const row = rows[index];
  return (
    <div className={d.editor} data-testid={`${testid}-editor`}>
      <ViewBar ds={ds} cardView={cardView} onView={onView} />
      <div className={`${r.workspace} ${row ? r.withDetails : ''}`}>
        <div className={r.main}>
          <ViewBody
            ds={ds}
            view={view}
            edit={edit}
            testid={testid}
            onInspect={setSelected}
            selectedRow={row?.id}
          />
        </div>
        {row && (
          <RowDetails
            fields={ds.columns.map((col) => ({
              name: col.name,
              value:
                col.type === 'checkbox'
                  ? row.cells[col.id] === true
                    ? 'Yes'
                    : row.cells[col.id] === false
                      ? 'No'
                      : ''
                  : cellText(row.cells[col.id]),
            }))}
            index={index}
            total={rows.length}
            onPrevious={() => setSelected(rows[index - 1]?.id)}
            onNext={() => setSelected(rows[index + 1]?.id)}
            onClose={() => setSelected(undefined)}
          />
        )}
      </div>
      <div className={d.controlRow}>
        <button
          type="button"
          className={d.smallButton}
          data-testid={`${testid}-add-row`}
          onClick={() => edit({ op: 'addRow' })}
        >
          + Row
        </button>
        <input
          className={d.cellInput}
          placeholder="New column"
          aria-label="New column name"
          data-testid={`${testid}-column-name`}
          value={column}
          maxLength={100}
          onChange={(e) => setColumn(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && column.trim()) {
              edit({ op: 'addColumn', name: column.trim() });
              setColumn('');
            }
          }}
        />
        <button
          type="button"
          className={d.smallButton}
          data-testid={`${testid}-add-column`}
          disabled={!column.trim() || ds.columns.length >= DATASET_LIMITS.columns}
          onClick={() => {
            edit({ op: 'addColumn', name: column.trim() });
            setColumn('');
          }}
        >
          + Column
        </button>
        <span className={d.count} data-testid={`${testid}-count`}>
          {ds.rows.length} row{ds.rows.length === 1 ? '' : 's'} · {ds.columns.length} columns · rev {ds.rev}
        </span>
      </div>
    </div>
  );
}
