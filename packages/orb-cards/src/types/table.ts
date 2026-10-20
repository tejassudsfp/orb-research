/** Table: a small table of strings (columns and rows). */
import { TABLE_LIMITS, describeCardData } from '@orb/shared';
import { z } from 'zod';
import { Title, pick, type CardTypeSpec } from '../spec.js';
import { DESCRIBE_MAX } from '../describe.js';

export const table: CardTypeSpec<'table'> = {
  type: 'table',
  purpose: 'A small table of strings (columns and rows).',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    columns: z.array(z.string().max(TABLE_LIMITS.cell)).min(1).max(TABLE_LIMITS.columns),
    rows: z.array(z.array(z.string().max(TABLE_LIMITS.cell))).max(TABLE_LIMITS.rows),
  }),
  fieldHelp: `title, columns (≤${TABLE_LIMITS.columns} names), rows (arrays of strings, one per column, ≤${TABLE_LIMITS.rows})`,
  toData: (f) => ({
    ...pick(f, { title: 'title', columns: 'columns', rows: 'rows' }),
    ...(Array.isArray(f.rows) ? { totalRows: f.rows.length } : {}),
  }),
  describe: (_data, card) => describeCardData(card, DESCRIBE_MAX),
};
