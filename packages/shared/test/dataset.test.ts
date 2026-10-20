/**
 * P6.3 datasets (packages/shared/src/dataset.ts): import conversions, the structured query engine (no SQL), views
 * (table / board / gallery with filter, sort, group), edits and role-checked upserts.
 */
import { describe, expect, it } from 'vitest';
import {
  Dataset,
  DatasetQuery,
  DATASET_LIMITS,
  activeView,
  applyEdit,
  applyView,
  databaseDataOf,
  datasetDigest,
  datasetFromRows,
  datasetFromText,
  defaultView,
  importFormatOf,
  newCardView,
  rowsFromJson,
  runQuery,
  upsertRows,
  cellText,
  DatabaseData,
  type Dataset as DatasetT,
} from '../src/index.js';

const ID = 'd_TESTDATASET01';
const csv = [
  'Company,Stage,ARR,Founded,Site,Active',
  'Acme,Seed,1.2,2020-03-01,https://acme.test,yes',
  'Globex,Series A,4.5,2018-07-15,https://globex.test,yes',
  'Initech,Seed,0.8,2021-01-20,https://initech.test,no',
  'Umbrella,Series B,12,2015-05-05,https://umbrella.test,yes',
  'Hooli,Seed,2.5,2019-09-09,https://hooli.test,no',
  'Pied Piper,Seed,0.1,2022-02-02,https://piper.test,yes',
  'Soylent,Series A,7,2017-04-04,https://soylent.test,yes',
  'Vandelay,Series A,3,2016-06-06,https://vandelay.test,no',
].join('\n');
const make = (): DatasetT => datasetFromText(ID, 'Pipeline.csv', csv, 'csv').dataset;
const col = (ds: DatasetT, name: string) => ds.columns.find((c) => c.name === name)!;

describe('import', () => {
  it('CSV: header, typed columns, rows', () => {
    const ds = make();
    expect(Dataset.safeParse(ds).success).toBe(true);
    expect(ds.rows).toHaveLength(8);
    expect(ds.columns.map((c) => [c.name, c.type])).toEqual([
      ['Company', 'text'],
      ['Stage', 'select'],
      ['ARR', 'number'],
      ['Founded', 'date'],
      ['Site', 'url'],
      ['Active', 'checkbox'],
    ]);
    expect(col(ds, 'Stage').options).toEqual(['Seed', 'Series A', 'Series B']);
    expect(ds.rows[0]!.cells[col(ds, 'ARR').id]).toBe(1.2);
    expect(ds.rows[0]!.cells[col(ds, 'Active').id]).toBe(true);
    expect(ds.rows.every((r) => r.by === 'user')).toBe(true);
    expect(ds.name).toBe('Pipeline.csv');
  });

  it('JSON: array of objects, {columns, rows}, array of arrays, wrapped array; nested values become text', () => {
    expect(rowsFromJson([{ a: 1, b: { x: 1 } }, { a: 2, c: 'z' }])).toEqual({
      header: ['a', 'b', 'c'],
      rows: [
        [1, '{"x":1}', undefined],
        [2, undefined, 'z'],
      ],
    });
    expect(rowsFromJson({ columns: ['p', 'q'], rows: [[1, 2]] })).toEqual({ header: ['p', 'q'], rows: [[1, 2]] });
    expect(rowsFromJson([['p', 'q'], [1, 2]])).toEqual({ header: ['p', 'q'], rows: [[1, 2]] });
    expect(rowsFromJson({ items: [{ k: 'v' }] })).toEqual({ header: ['k'], rows: [['v']] });
    expect(() => rowsFromJson([])).toThrow(/no rows/);
    const ds = datasetFromText(ID, 'x', '[{"n": 3, "s": "a"}, {"n": 4, "s": "b"}]').dataset;
    expect(ds.columns.map((c) => c.type)).toEqual(['number', 'text']);
  });

  it('pasted text: TSV and semicolon CSV; blank headers and duplicate names are made distinct', () => {
    const ds = datasetFromText(ID, 'p', 'a\tb\tb\n1\t2\t3\n').dataset;
    expect(ds.columns.map((c) => c.name)).toEqual(['a', 'b', 'b 2']);
    const blank = datasetFromRows(ID, 'p', ['', 'x'], [['1', '2']]).dataset;
    expect(blank.columns.map((c) => c.name)).toEqual(['Column 1', 'x']);
    expect(() => datasetFromText(ID, 'e', '   ')).toThrow(/empty/);
  });

  it('caps columns, rows and cell length, and reports truncation', () => {
    const wide = datasetFromRows(ID, 'w', Array.from({ length: 80 }, (_, i) => `c${i}`), [[...'x'.repeat(80)]]);
    expect(wide.dataset.columns).toHaveLength(DATASET_LIMITS.columns);
    const tall = datasetFromRows(ID, 't', ['a'], Array.from({ length: DATASET_LIMITS.rows + 5 }, (_, i) => [String(i)]));
    expect(tall.dataset.rows).toHaveLength(DATASET_LIMITS.rows);
    expect(tall.truncated).toBe(true);
    const long = datasetFromRows(ID, 'l', ['a'], [['x'.repeat(5000)]]);
    expect(String(long.dataset.rows[0]!.cells.k1).length).toBe(DATASET_LIMITS.cell);
  });

  it('file formats from names and types', () => {
    expect(importFormatOf('a.xlsx')).toBe('xlsx');
    expect(importFormatOf('a.JSON')).toBe('json');
    expect(importFormatOf('a.tsv')).toBe('csv');
    expect(importFormatOf('blob', 'application/json')).toBe('json');
    expect(importFormatOf('a.pdf')).toBeUndefined();
  });
});

describe('query_dataset engine', () => {
  const ds = make();
  const q = (query: object) => runQuery(ds, DatasetQuery.parse(query));

  it('filters, sorts and selects by column name (case-insensitive) or id', () => {
    const r = q({ filter: [{ column: 'stage', op: 'eq', value: 'Seed' }], sort: [{ column: 'ARR', dir: 'desc' }], select: ['Company', 'ARR'] });
    expect(r.columns).toEqual(['Company', 'ARR']);
    expect(r.rows).toEqual([
      ['Hooli', 2.5],
      ['Acme', 1.2],
      ['Initech', 0.8],
      ['Pied Piper', 0.1],
    ]);
    expect(r.total).toBe(4);
    expect(r.rowIds).toHaveLength(4);
    expect(q({ filter: [{ column: 'k3', op: 'gte', value: 7 }] }).rows.map((x) => x[0])).toEqual(['Umbrella', 'Soylent']);
  });

  it('operators: contains, in, empty, comparison on numbers and dates, or-matching', () => {
    expect(q({ filter: [{ column: 'Company', op: 'contains', value: 'o' }] }).total).toBe(3);
    expect(q({ filter: [{ column: 'Stage', op: 'in', value: ['Series A', 'Series B'] }] }).total).toBe(4);
    expect(q({ filter: [{ column: 'Founded', op: 'lt', value: '2018-01-01' }] }).total).toBe(3);
    expect(q({ filter: [{ column: 'Active', op: 'eq', value: false }] }).total).toBe(3);
    expect(
      q({ filter: [{ column: 'ARR', op: 'gt', value: 10 }, { column: 'Company', op: 'eq', value: 'Acme' }], match: 'or' }).total,
    ).toBe(2);
    expect(q({ filter: [{ column: 'ARR', op: 'notEmpty' }] }).total).toBe(8);
  });

  it('groups and aggregates; sorts groups by the first aggregate (descending) by default', () => {
    const r = q({
      groupBy: ['Stage'],
      aggregate: [{ fn: 'count' }, { fn: 'sum', column: 'ARR', as: 'total' }, { fn: 'avg', column: 'ARR' }, { fn: 'max', column: 'ARR' }],
    });
    expect(r.columns).toEqual(['Stage', 'count', 'total', 'avg(ARR)', 'max(ARR)']);
    expect(r.rows).toEqual([
      ['Seed', 4, 4.6, 1.15, 2.5],
      ['Series A', 3, 14.5, 4.833333, 7],
      ['Series B', 1, 12, 12, 12],
    ]);
    const byTotal = q({ groupBy: ['Stage'], aggregate: [{ fn: 'sum', column: 'ARR', as: 'total' }], sort: [{ column: 'total', dir: 'asc' }] });
    expect(byTotal.rows.map((x) => x[0])).toEqual(['Seed', 'Series B', 'Series A']);
    expect(q({ aggregate: [{ fn: 'countDistinct', column: 'Stage' }] }).rows).toEqual([[3]]);
    expect(q({ aggregate: [{ fn: 'count' }] }).rows).toEqual([[8]]);
  });

  it('never returns more than 50 rows; offset pages through', () => {
    const big = datasetFromRows(ID, 'big', ['n'], Array.from({ length: 130 }, (_, i) => [String(i)])).dataset;
    expect(() => DatasetQuery.parse({ limit: 51 })).toThrow();
    const first = runQuery(big, {});
    expect(first.rows).toHaveLength(50);
    expect(first.total).toBe(130);
    expect(first.more).toBe(80);
    const third = runQuery(big, { offset: 100, limit: 50 });
    expect(third.rows).toHaveLength(30);
    expect(third.more).toBe(0);
  });

  it('is data, not code: unknown columns and malformed queries are refused with the column list', () => {
    expect(() => q({ filter: [{ column: 'Nope', op: 'eq', value: 1 }] })).toThrow(/no column "Nope"; the columns are "Company"/);
    expect(() => q({ aggregate: [{ fn: 'sum' }] })).toThrow(/needs a column/);
    expect(() => DatasetQuery.parse({ sql: 'select * from t' })).toThrow();
    expect(() => DatasetQuery.parse({ filter: [{ column: 'a', op: 'eval', value: '1' }] })).toThrow();
  });
});

describe('views', () => {
  const ds = make();
  it('table: filter + sort + group', () => {
    const view = { ...defaultView(), filter: [{ column: col(ds, 'Active').id, op: 'eq' as const, value: true }], sort: [{ column: col(ds, 'ARR').id, dir: 'desc' as const }], group: col(ds, 'Stage').id };
    const { rows, groups } = applyView(ds, view);
    expect(rows.map((r) => r.cells[col(ds, 'Company').id])).toEqual(['Umbrella', 'Soylent', 'Globex', 'Acme', 'Pied Piper']);
    expect(groups!.map((g) => [g.label, g.rows.length])).toEqual([
      ['Seed', 2],
      ['Series A', 2],
      ['Series B', 1],
    ]);
  });

  it('board: lanes follow the select options; a board view with no lane picks a select column', () => {
    const { groups } = applyView(ds, defaultView('v2', 'board'));
    expect(groups!.map((g) => g.label)).toEqual(['Seed', 'Series A', 'Series B']);
  });

  it('gallery: rows filtered and sorted', () => {
    const { rows } = applyView(ds, { ...defaultView('v3', 'gallery'), sort: [{ column: col(ds, 'Company').id, dir: 'asc' }] });
    expect(rows[0]!.cells[col(ds, 'Company').id]).toBe('Acme');
  });

  it('a filter, sort or group on a deleted column is ignored, not an error', () => {
    const gone = applyEdit(ds, { op: 'deleteColumn', column: col(ds, 'Stage').id }, 'user');
    const view = { ...defaultView(), filter: [{ column: col(ds, 'Stage').id, op: 'eq' as const, value: 'Seed' }], sort: [{ column: col(ds, 'Stage').id, dir: 'asc' as const }], group: col(ds, 'Stage').id };
    const { rows, groups } = applyView(gone, view);
    expect(rows).toHaveLength(8);
    expect(groups).toBeNull();
  });

  it('a card view starts with one table view and names the active one', () => {
    const cv = newCardView(ds);
    expect(cv).toMatchObject({ datasetId: ID, rowCount: 8, active: 'v1' });
    expect(activeView({ ...cv, active: 'v9' }).id).toBe('v1');
  });
});

describe('edits', () => {
  const ds = make();
  it('cells, rows, columns; rev goes up each time', () => {
    const company = col(ds, 'Company').id;
    let next = applyEdit(ds, { op: 'setCell', row: 'r1', column: company, value: 'Acme Inc' }, 'user');
    expect(next.rev).toBe(ds.rev + 1);
    expect(next.rows[0]!.cells[company]).toBe('Acme Inc');
    next = applyEdit(next, { op: 'setCell', row: 'r1', column: col(ds, 'ARR').id, value: '2,500' }, 'user');
    expect(next.rows[0]!.cells[col(ds, 'ARR').id]).toBe(2500);
    next = applyEdit(next, { op: 'addRow', cells: { [company]: 'NewCo' } }, 'user');
    expect(next.rows.at(-1)).toMatchObject({ id: 'r9', by: 'user' });
    next = applyEdit(next, { op: 'addColumn', name: 'Notes' }, 'user');
    expect(next.columns.at(-1)).toMatchObject({ id: 'k7', name: 'Notes', type: 'text' });
    next = applyEdit(next, { op: 'addColumn', name: 'notes' }, 'user');
    expect(next.columns.at(-1)!.name).toBe('notes 2');
    next = applyEdit(next, { op: 'deleteRows', rows: ['r1', 'r2'] }, 'user');
    expect(next.rows).toHaveLength(7);
    next = applyEdit(next, { op: 'setColumnType', column: col(ds, 'ARR').id, type: 'text' }, 'user');
    expect(next.columns.find((c) => c.id === col(ds, 'ARR').id)!.type).toBe('text');
    expect(Dataset.safeParse(next).success).toBe(true);
    expect(() => applyEdit(ds, { op: 'setCell', row: 'r99', column: company, value: 'x' }, 'user')).toThrow(/no row/);
    expect(() => applyEdit(ds, { op: 'deleteColumn', column: 'k99' }, 'user')).toThrow(/no column/);
  });

  it('a column type change coerces the cells; a select column gets its options from the values', () => {
    const next = applyEdit(ds, { op: 'setColumnType', column: col(ds, 'Company').id, type: 'select' }, 'user');
    expect(next.columns.find((c) => c.name === 'Company')!.options).toContain('Acme');
  });
});

describe('upsert_rows rules', () => {
  const ds = make();
  const company = col(ds, 'Company').id;
  it('adds rows and updates by rowId or by key; unknown columns are refused', () => {
    const r = upsertRows(ds, [{ values: { Company: 'NewCo', ARR: 3 } }, { rowId: 'r1', values: { ARR: 9 } }], { by: 'user' });
    expect(r.added).toEqual(['r9']);
    expect(r.updated).toEqual(['r1']);
    expect(r.dataset.rev).toBe(ds.rev + 1);
    const keyed = upsertRows(ds, [{ values: { Company: 'acme', ARR: 5 } }, { values: { Company: 'Zed', ARR: 1 } }], { by: 'user', key: 'Company' });
    expect(keyed.updated).toEqual(['r1']);
    expect(keyed.added).toHaveLength(1);
    expect(() => upsertRows(ds, [{ values: { Missing: 1 } }], { by: 'scout' })).toThrow(/no column "Missing"; the columns are/);
    expect(() => upsertRows(ds, Array.from({ length: 201 }, () => ({ values: {} })), { by: 'orb' })).toThrow(/at most 200/);
  });

  it('agents never change a row the user wrote; scout and builder change only their own rows', () => {
    const skipped = upsertRows(ds, [{ rowId: 'r1', values: { ARR: 99 } }], { by: 'orb' });
    expect(skipped.skipped[0]!.reason).toMatch(/written by the user/);
    expect(skipped.dataset).toBe(ds);
    const scoutAdds = upsertRows(ds, [{ values: { Company: 'ScoutCo' } }], { by: 'scout' });
    const id = scoutAdds.added[0]!;
    const orbEdits = upsertRows(scoutAdds.dataset, [{ rowId: id, values: { ARR: 1 } }], { by: 'orb' });
    expect(orbEdits.updated).toEqual([id]);
    const builderEdits = upsertRows(scoutAdds.dataset, [{ rowId: id, values: { ARR: 1 } }], { by: 'builder' });
    expect(builderEdits.skipped[0]!.reason).toMatch(/builder changes only its own rows/);
    const userEdits = upsertRows(scoutAdds.dataset, [{ rowId: 'r1', values: { Company: 'Renamed' } }], { by: 'user' });
    expect(userEdits.updated).toEqual(['r1']);
    expect(userEdits.dataset.rows[0]!.cells[company]).toBe('Renamed');
  });

  it('merges evidence and removes obsolete agent rows atomically, protecting user and other-role rows', () => {
    const added = upsertRows(ds, [{ values: { Company: 'Survivor' } }, { values: { Company: 'Duplicate' } }], { by: 'scout' });
    const [survivor, duplicate] = added.added as [string, string];
    const denied = upsertRows(added.dataset, [], { by: 'builder', removeIds: [duplicate, 'r1'] });
    expect(denied.dataset).toBe(added.dataset);
    expect(denied.removalSkipped?.map(s => s.reason)).toEqual([
      'builder removes only its own rows', 'the user wrote this row; agents do not remove it',
    ]);
    const merged = upsertRows(added.dataset, [{ rowId: survivor, values: { ARR: 3 } }], { by: 'orb', removeIds: [duplicate, 'r1', 'r999'] });
    expect(merged.removed).toEqual([duplicate]);
    expect(merged.updated).toEqual([survivor]);
    expect(merged.dataset.rows.find(r => r.id === survivor)?.cells.k3).toBe(3);
    expect(merged.dataset.rows.some(r => r.id === duplicate)).toBe(false);
    expect(merged.dataset.rows.some(r => r.id === 'r1')).toBe(true);
    expect(merged.dataset.rev).toBe(added.dataset.rev + 1);
    expect(merged.dataset.nextRow).toBe(added.dataset.nextRow);
    expect(() => upsertRows(added.dataset, [{ rowId: survivor, values: { Missing: 1 } }], { by: 'orb', removeIds: [duplicate] })).toThrow(/no column/);
    expect(added.dataset.rows.some(r => r.id === duplicate)).toBe(true);
    expect(() => upsertRows(added.dataset, [{ rowId: duplicate, values: { ARR: 4 } }], { by: 'orb', removeIds: [duplicate] })).toThrow(/updated and removed/);
  });

  it('does not advance revisions for identical normalized updates or already removed rows', () => {
    const added = upsertRows(ds, [{ values: { Company: 'New', ARR: 3 } }], { by: 'scout' });
    const unchanged = upsertRows(added.dataset, [{ rowId: added.added[0], values: { Company: 'New', ARR: '3' } }], { by: 'orb' });
    expect(unchanged.dataset).toBe(added.dataset);
    expect(unchanged.updated).toEqual([]);
    const removed = upsertRows(added.dataset, [], { by: 'scout', removeIds: added.added });
    expect(removed.removed).toEqual(added.added);
    expect(upsertRows(removed.dataset, [], { by: 'orb', removeIds: added.added }).dataset).toBe(removed.dataset);
  });
});

describe('card data, digest', () => {
  it('Database card data holds the name, columns, count, rev and a small preview', () => {
    const ds = make();
    const data = databaseDataOf('Pipeline', ds);
    expect(DatabaseData.safeParse(data).success).toBe(true);
    expect(data).toMatchObject({ title: 'Pipeline', rowCount: 8, columns: ds.columns.map((c) => c.name), rev: ds.rev });
    expect(data.preview).toHaveLength(DATASET_LIMITS.preview > 8 ? 8 : DATASET_LIMITS.preview);
    expect(data.preview![0]).toEqual(['Acme', 'Seed', '1.2', '2020-03-01', 'https://acme.test', 'Yes']);
  });
  it('the search digest holds the name, the columns and the rows', () => {
    const digest = datasetDigest(make());
    expect(digest).toContain('Pipeline.csv');
    expect(digest).toContain('Pied Piper');
    expect(datasetDigest(make(), 100).length).toBeLessThanOrEqual(100);
    expect(cellText(true)).toBe('Yes');
  });
});
