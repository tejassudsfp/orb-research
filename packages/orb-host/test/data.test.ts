/**
 * P6.3 dataset route handlers (orb-host), called with WHATWG Requests: import (CSV, JSON, XLSX, pasted), read, edit,
 * Table to Database data. Auth and the Origin fence are the gateway's (apps/ui/test/data.contract.test.ts runs them
 * against a real sidecar).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CanvasStore } from '@orb/canvas';
import {
  Dataset,
  DatasetEditResult,
  DatasetMetaResult,
  DatasetPromoteResult,
  type CanvasMeta,
} from '@orb/shared';
import { handleDataEdit, handleDataImport, handleDataPromote, handleDataRead } from '../src/data.js';
import { makeXlsx } from '../../../scripts/testkit/fixtures.js';

let home: string;
let store: CanvasStore;
let canvas: CanvasMeta;
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-host-data-'));
  store = new CanvasStore({ home, searchIndex: false });
  canvas = await store.create({ prompt: 'data routes' });
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

type BodyInit = NonNullable<RequestInit['body']>;
const base = 'http://127.0.0.1:1';
const url = (path: string, q: Record<string, string>) => `${base}${path}?${new URLSearchParams(q)}`;
const post = (path: string, q: Record<string, string>, body: BodyInit | null, type = 'text/plain') =>
  new Request(url(path, q), { method: 'POST', headers: { 'content-type': type }, ...(body !== null ? { body } : {}) });

async function importFile(name: string, body: BodyInit, type: string, extra: Record<string, string> = {}) {
  const res = await handleDataImport(store, post('/api/orb-data/import', { canvas: canvas.id, name, ...extra }, body, type));
  return { status: res.status, body: DatasetMetaResult.parse(await res.json()) };
}

describe('POST /api/orb-data/import', () => {
  it('CSV: answers the dataset identity; GET returns the rows', async () => {
    const { status, body } = await importFile('Pipeline.csv', 'Company,ARR\nAcme,1\nGlobex,2\n', 'text/csv');
    expect(status).toBe(200);
    if (!body.ok) throw new Error(body.error.message);
    expect(body.dataset).toMatchObject({ name: 'Pipeline', rowCount: 2, columns: 2, rev: 1, truncated: false });
    const res = await handleDataRead(store, new Request(url('/api/orb-data/dataset', { canvas: canvas.id, id: body.dataset.id })));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const ds = Dataset.parse(await res.json());
    expect(ds.rows.map((r) => r.cells.k1)).toEqual(['Acme', 'Globex']);
  });

  it('XLSX and JSON files, and pasted text', async () => {
    const xlsx = makeXlsx({ S: [['a', 'b'], ['x', 1], ['y', 2]] });
    const x = await importFile('book.xlsx', xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(x.body.ok && x.body.dataset).toMatchObject({ rowCount: 2, sheet: 'S' });
    const j = await importFile('d.json', '[{"a":1},{"a":2},{"a":3}]', 'application/json');
    expect(j.body.ok && j.body.dataset.rowCount).toBe(3);
    const p = await importFile('Pasted data', 'a\tb\n1\t2', 'text/plain', { format: 'text' });
    expect(p.body.ok && p.body.dataset.rowCount).toBe(1);
  });

  it('refuses what it cannot read, with a status and a code', async () => {
    const pdf = await importFile('a.pdf', 'x', 'application/pdf');
    expect(pdf.status).toBe(415);
    const empty = await importFile('e.csv', '', 'text/csv');
    expect(empty.status).toBe(400);
    const badZip = await importFile('b.xlsx', 'not a zip', 'application/octet-stream');
    expect(badZip.status).toBe(400);
    const noCanvas = await handleDataImport(store, post('/api/orb-data/import', { name: 'a.csv' }, 'a\n1'));
    expect(noCanvas.status).toBe(400);
    const wrongMethod = await handleDataImport(store, new Request(url('/api/orb-data/import', { canvas: canvas.id, name: 'a.csv' })));
    expect(wrongMethod.status).toBe(405);
    const big = await handleDataImport(
      store,
      post('/api/orb-data/import', { canvas: canvas.id, name: 'big.csv' }, new Uint8Array(11 * 1024 * 1024), 'text/csv'),
    );
    expect(big.status).toBe(413);
  });
});

describe('POST /api/orb-data/edit', () => {
  it('applies one edit and answers the new rev and row count; refuses a bad edit', async () => {
    const { body } = await importFile('d.csv', 'a,b\n1,2\n', 'text/csv');
    if (!body.ok) throw new Error('import');
    const id = body.dataset.id;
    const edit = async (e: unknown) => {
      const res = await handleDataEdit(store, post('/api/orb-data/edit', { canvas: canvas.id, id }, JSON.stringify({ edit: e }), 'application/json'));
      return { status: res.status, body: DatasetEditResult.parse(await res.json()) };
    };
    const added = await edit({ op: 'addRow', cells: { k1: 5 } });
    expect(added.body).toEqual({ ok: true, rev: 2, rowCount: 2 });
    const cell = await edit({ op: 'setCell', row: 'r1', column: 'k2', value: 9 });
    expect(cell.body).toEqual({ ok: true, rev: 3, rowCount: 2 });
    expect((await edit({ op: 'setCell', row: 'r99', column: 'k2', value: 9 })).status).toBe(400);
    expect((await edit({ op: 'drop table' })).status).toBe(400);
    const gone = await handleDataEdit(store, post('/api/orb-data/edit', { canvas: canvas.id, id: 'd_NOSUCHDATASET' }, JSON.stringify({ edit: { op: 'addRow' } }), 'application/json'));
    expect(gone.status).toBe(404);
  });
});

describe('POST /api/orb-data/from-table', () => {
  it('answers the Database card data and view for a Table card', async () => {
    const ev = await store.command(canvas.id, {
      type: 'card.added',
      card: { type: 'table', frameId: null, x: 0, y: 0, w: 400, h: 300, data: { title: 'T', columns: ['a', 'b'], rows: [['1', '2'], ['3', '4']], totalRows: 2 } },
    });
    const cardId = (ev.data as { card: { id: string } }).card.id;
    const res = await handleDataPromote(store, post('/api/orb-data/from-table', { canvas: canvas.id, card: cardId }, null));
    const out = DatasetPromoteResult.parse(await res.json());
    if (!out.ok) throw new Error(out.error.message);
    expect(out.data).toMatchObject({ title: 'T', rowCount: 2, columns: ['a', 'b'] });
    expect(out.view.datasetId).toBe(out.data.datasetId);
    const missing = await handleDataPromote(store, post('/api/orb-data/from-table', { canvas: canvas.id, card: 'c_nope' }, null));
    expect(missing.status).toBe(404);
  });
});
