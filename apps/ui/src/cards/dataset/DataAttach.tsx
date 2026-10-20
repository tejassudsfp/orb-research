/**
 * Attachable data (P6.3): pick or import a dataset, the Data tab of the reader (attach a dataset view to ANY card,
 * edit its views, detach), and the strip a card with a view shows on the board.
 */
import { useRef, useState } from 'react';
import { activeView, newCardView, type Card, type CardView } from '@orb/shared';
import { useCardActions, type DatasetChoice } from '../context.js';
import { DatasetEditor, ViewBody } from './DatasetViews.js';
import { useDataset, useDatasetEdit } from './useDataset.js';
import d from './dataset.module.css';
import c from '../cards.module.css';

/** What the file picker takes: CSV, TSV, JSON, XLSX or text. */
export const DATA_ACCEPT = '.csv,.tsv,.json,.xlsx,.txt,text/csv,application/json,text/plain';

/** Choose one of the canvas's datasets, import a file, or paste data. */
export function DataPicker({ onPick }: { onPick: (choice: DatasetChoice) => void }) {
  const { datasets, importDataset } = useCardActions();
  const file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (input: Parameters<typeof importDataset>[0]) => {
    setBusy(true);
    setError('');
    try {
      onPick(await importDataset(input));
    } catch (err) {
      setError((err as Error)?.message ?? 'Could not import that');
    } finally {
      setBusy(false);
    }
  };
  const existing = datasets();
  return (
    <div className={d.pick} data-testid="data-picker">
      {existing.length > 0 && (
        <ul className={d.pickList} aria-label="Datasets on this canvas">
          {existing.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                className={d.pickItem}
                data-testid="data-pick-existing"
                onClick={() => onPick(x)}
              >
                <span>{x.name}</span>
                <span>{x.rowCount} rows</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={d.controlRow}>
        <button
          type="button"
          className={d.smallButton}
          disabled={busy}
          data-testid="data-import-file"
          onClick={() => file.current?.click()}
        >
          Import CSV, JSON or XLSX…
        </button>
        <input
          ref={file}
          type="file"
          hidden
          accept={DATA_ACCEPT}
          data-testid="data-import-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void run({ name: f.name, body: f, mime: f.type });
          }}
        />
      </div>
      <textarea
        className={d.paste}
        placeholder="Or paste a table (CSV, tab-separated or JSON)"
        aria-label="Pasted data"
        data-testid="data-paste"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className={d.controlRow}>
        <button
          type="button"
          className={d.smallButton}
          disabled={busy || text.trim() === ''}
          data-testid="data-import-paste"
          onClick={() => void run({ name: 'Pasted data', body: text })}
        >
          Import pasted data
        </button>
      </div>
      {error && (
        <p className={d.error} role="alert" data-testid="data-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** The Data tab: attach a dataset view to this card, or edit and detach the one it has. */
export function DataTab({ card }: { card: Card }) {
  const { setView } = useCardActions();
  const view = card.view;
  const { ds, error } = useDataset(view?.datasetId, view?.rev ?? 0);
  const edit = useDatasetEdit(view?.datasetId);
  if (!view) {
    return (
      <div data-testid="data-tab">
        <p className={c.muted}>
          Attach a dataset to show rows from it on this card, as a table, a board or a gallery.
        </p>
        <DataPicker
          onPick={(choice) =>
            setView(
              card.id,
              newCardView({ id: choice.id, name: choice.name, rows: { length: choice.rowCount }, rev: 0 }),
            )
          }
        />
      </div>
    );
  }
  return (
    <div data-testid="data-tab" className={d.editor}>
      <div className={d.controlRow}>
        <span className={c.muted}>
          {view.name} · {view.rowCount} rows
        </span>
        <button
          type="button"
          className={d.smallButton}
          data-testid="data-detach"
          onClick={() => setView(card.id, null)}
        >
          Detach data
        </button>
      </div>
      {ds ? (
        <DatasetEditor
          ds={ds}
          cardView={view}
          onView={(next) => setView(card.id, next)}
          edit={edit}
          testid="attached"
        />
      ) : (
        <p className={c.muted}>{error ?? 'Loading the data…'}</p>
      )}
    </div>
  );
}

/** A card with an attached view (not a Database card) shows the dataset's name and the top of the active view. */
export function AttachedStrip({ card }: { card: Card & { view: CardView } }) {
  const { open } = useCardActions();
  const view = card.view;
  const { ds } = useDataset(view.datasetId, view.rev);
  const active = activeView(view);
  return (
    <div className={d.strip} data-testid="attached-strip" data-dataset={view.datasetId}>
      <button
        type="button"
        className={d.stripHead}
        data-card-action="data"
        data-testid="attached-open"
        title="Open the data"
        onClick={() => open(card.id, 'data')}
      >
        {view.name} · {view.rowCount} rows · {active.name}
      </button>
      {ds && <ViewBody ds={ds} view={active} maxRows={3} testid="attached" />}
    </div>
  );
}
