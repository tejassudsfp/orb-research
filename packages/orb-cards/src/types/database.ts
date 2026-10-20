/**
 * Database (P6.3): a dataset on the board. The rows live in `assets/data/<datasetId>.json` (written only by the
 * canvas service); the card keeps the dataset's name, columns, row count and a preview. An agent creates one with
 * `columns` (and optional first `rows`), and fills or edits it with `upsert_rows`; it reads it with `query_dataset`.
 */
import { DATASET_LIMITS, databaseDataOf, datasetFromRows, type DatabaseData } from '@orb/shared';
import { z } from 'zod';
import { Title, type CardTypeSpec } from '../spec.js';
import { CardFieldError } from '../spec.js';
import { DESCRIBE_MAX, clip } from '../describe.js';

/** The id the card data holds until the canvas service has written the dataset and replaces it. */
export const PENDING_DATASET = 'd_PENDING00';

export const database: CardTypeSpec<'database'> = {
  type: 'database',
  purpose:
    'A database: named, typed columns and many rows (more than a table holds). Read it with query_dataset, add or change rows with upsert_rows.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    columns: z.array(z.string().trim().min(1).max(100)).min(1).max(DATASET_LIMITS.columns),
    rows: z.array(z.array(z.string().max(DATASET_LIMITS.cell))).max(DATASET_LIMITS.upsert).optional(),
  }),
  fieldHelp: `title, columns (≤${DATASET_LIMITS.columns} names), rows (optional first rows, arrays of strings, one per column, ≤${DATASET_LIMITS.upsert}; add more with upsert_rows)`,
  tools: ['query_dataset', 'upsert_rows'],
  toData(fields, _ctx, mode) {
    if (mode === 'update') {
      if (fields.columns !== undefined || fields.rows !== undefined)
        throw new CardFieldError('use upsert_rows to change a database\'s rows; update_card only renames it');
      return fields.title !== undefined ? { title: String(fields.title) } : {};
    }
    const columns = (fields.columns as string[]) ?? [];
    const rows = (fields.rows as string[][] | undefined) ?? [];
    // A placeholder dataset only to shape the card data; the canvas service writes the real one and its id.
    const { dataset } = datasetFromRows(PENDING_DATASET, String(fields.title), columns, rows);
    return databaseDataOf(String(fields.title), dataset) as unknown as Record<string, unknown>;
  },
  describe(data, card) {
    const d = (data ?? {}) as Partial<DatabaseData>;
    const cols = Array.isArray(d.columns) ? d.columns : [];
    const rows = Array.isArray(d.preview) ? d.preview.slice(0, 3).map((r) => r.join(' | ')) : [];
    const n = typeof d.rowCount === 'number' ? d.rowCount : 0;
    void card;
    return clip(
      `Database "${d.title ?? ''}" (dataset ${d.datasetId ?? '?'}): ${n} rows; columns ${cols.join(', ')}.` +
        (rows.length ? ` First rows: ${rows.join('; ')}. Use query_dataset for more.` : ''),
      DESCRIBE_MAX,
    );
  },
};
