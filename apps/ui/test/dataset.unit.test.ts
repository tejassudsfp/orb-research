/**
 * P6.3 dataset views in the UI: table, board and gallery with filter / sort / group, the reader's editor controls,
 * the attach strip, and the drop path (XLSX and JSON become a Database card; CSV stays a Table). Rendered to static
 * markup (no DOM); apps/desktop/e2e/data.spec.ts drives the real window.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  BoardCommand,
  applyChanges,
  databaseDataOf,
  datasetFromText,
  defaultView,
  emptyBoard,
  newCardView,
  planCommand,
  type Card,
  type CardView,
  type Dataset,
} from '@orb/shared';
import { DatasetEditor, ViewBar, ViewBody } from '../src/cards/dataset/DatasetViews.js';
import { AttachedStrip, DataPicker } from '../src/cards/dataset/DataAttach.js';
import { CardActionsContext, type CardActions } from '../src/cards/context.js';
import { ingest, type IngestDeps } from '../src/cards/ingest.js';

const csv = [
  'Company,Stage,ARR,Logo',
  'Acme,Seed,1.2,assets/acme.png',
  'Globex,Series A,4.5,https://evil.test/logo.png',
  'Initech,Seed,0.8,',
  'Umbrella,Series B,12,',
  'Hooli,Seed,2.5,',
  'Pied Piper,Seed,0.1,',
  'Soylent,Series A,7,',
].join('\n');
const ds: Dataset = datasetFromText('d_UITESTDATA01', 'Pipeline', csv, 'csv').dataset;
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const id = (name: string) => ds.columns.find((c) => c.name === name)!.id;

describe('views', () => {
  it('table: filtered, sorted and grouped rows', () => {
    const view = {
      ...defaultView(),
      filter: [{ column: id('ARR'), op: 'gte' as const, value: 1 }],
      sort: [{ column: id('ARR'), dir: 'desc' as const }],
      group: id('Stage'),
    };
    const out = html(createElement(ViewBody, { ds, view }));
    expect(out).toContain('data-testid="dataset-table"');
    expect(out.match(/data-testid="dataset-row"/g)).toHaveLength(5);
    // groups: Seed (Acme 1.2, Hooli 2.5), Series A (Globex, Soylent), Series B (Umbrella)
    expect(out.indexOf('Seed')).toBeLessThan(out.indexOf('Series A'));
    expect(out.indexOf('Hooli')).toBeLessThan(out.indexOf('Acme'));
    expect(out).not.toContain('Initech');
  });

  it('table: maxRows counts the rest; no match says so', () => {
    expect(html(createElement(ViewBody, { ds, view: defaultView(), maxRows: 3 }))).toContain('4 more rows');
    const none = { ...defaultView(), filter: [{ column: id('Company'), op: 'eq' as const, value: 'Nobody' }] };
    expect(html(createElement(ViewBody, { ds, view: none }))).toContain('No rows match the filters');
  });

  it('board: one lane per stage with its cards', () => {
    const out = html(createElement(ViewBody, { ds, view: defaultView('v2', 'board') }));
    expect(out).toContain('data-testid="dataset-board"');
    for (const lane of ['Seed', 'Series A', 'Series B']) expect(out).toContain(`aria-label="${lane}"`);
    expect(out.match(/data-testid="dataset-card"/g)).toHaveLength(7);
  });

  it('gallery: tiles, and a cover draws only an asset or data image, never a remote one', () => {
    const view = { ...defaultView('v3', 'gallery'), cover: id('Logo') };
    const out = html(createElement(ViewBody, { ds, view }));
    expect(out.match(/data-testid="dataset-tile"/g)).toHaveLength(7);
    expect(out.match(/<img /g)).toHaveLength(1);
    expect(out).not.toContain('evil.test/logo.png"'); // shown as text at most, never loaded
    expect(out).not.toMatch(/<img[^>]*evil\.test/);
  });

  it('a hidden column is left out', () => {
    const out = html(createElement(ViewBody, { ds, view: { ...defaultView(), hidden: [id('ARR')] } }));
    expect(out).not.toContain('>ARR<');
    expect(out).toContain('>Stage<');
  });

  it('read-only views carry no editors; the editor has cells, row delete, add row and column', () => {
    expect(html(createElement(ViewBody, { ds, view: defaultView() }))).not.toContain('<input');
    const cv: CardView = newCardView(ds);
    const editor = html(createElement(DatasetEditor, { ds, cardView: cv, onView: () => undefined, edit: () => undefined, testid: 'reader-db' }));
    expect(editor).toContain('data-testid="reader-db-add-row"');
    expect(editor).toContain('data-testid="reader-db-add-column"');
    expect(editor).toContain('data-testid="reader-db-row-delete"');
    expect(editor).toContain('data-testid="reader-db-cell-r1-k1"');
    // a select column edits with its options
    expect(editor).toContain('<option value="Series A"');
    expect(editor).toContain('7 rows · 4 columns');
  });

  it('view bar: tabs, add table / board / gallery, filter / sort / group controls for the active view', () => {
    const cv: CardView = { ...newCardView(ds), views: [defaultView('v1', 'table', 'All'), { ...defaultView('v2', 'gallery', 'Cards'), filter: [{ column: id('Stage'), op: 'eq', value: 'Seed' }] }], active: 'v2' };
    const out = html(createElement(ViewBar, { ds, cardView: cv, onView: () => undefined }));
    expect(out).toContain('data-testid="dataset-tab-v1"');
    expect(out).toContain('data-testid="dataset-tab-v2"');
    expect(out).toContain('aria-selected="true"');
    for (const k of ['table', 'board', 'gallery']) expect(out).toContain(`data-testid="dataset-add-${k}"`);
    expect(out).toContain('data-testid="dataset-filter-0"');
    expect(out).toContain('data-testid="dataset-sort-column"');
    expect(out).toContain('data-testid="dataset-group"');
    expect(out).toContain('data-testid="dataset-cover"');
    expect(out).toContain('data-testid="dataset-remove-view"');
  });
});

describe('attach strip and picker', () => {
  it('a card with a view shows the dataset name, size and view name (rows load later)', () => {
    const card = {
      id: 'c_n1',
      type: 'note',
      frameId: null,
      x: 0,
      y: 0,
      w: 280,
      h: 200,
      data: { title: 'n' },
      provenance: { kind: 'user', at: 1 },
      view: newCardView(ds),
    } as Card & { view: CardView };
    const out = html(createElement(AttachedStrip, { card }));
    expect(out).toContain('data-testid="attached-strip"');
    expect(out).toContain('Pipeline · 7 rows · Table');
  });

  it('the picker lists the canvas datasets and offers a file import and pasted data', () => {
    const actions = { datasets: () => [{ id: ds.id, name: 'Pipeline', rowCount: 7 }] } as unknown as CardActions;
    const out = html(createElement(CardActionsContext.Provider, { value: actions }, createElement(DataPicker, { onPick: () => undefined })));
    expect(out).toContain('data-testid="data-pick-existing"');
    expect(out).toContain('data-testid="data-import-file"');
    expect(out).toContain('accept=".csv,.tsv,.json,.xlsx');
    expect(out).toContain('data-testid="data-paste"');
  });
});

describe('Database card on the board', () => {
  it('data carries a preview and a view; the card validates and is described', () => {
    const data = databaseDataOf('Pipeline', ds);
    const planned = planCommand(emptyBoard(), BoardCommand.parse({ type: 'card.added', card: { type: 'database', frameId: null, x: 0, y: 0, w: 560, h: 360, data, view: newCardView(ds) } }), {
      actor: { kind: 'user' },
      now: 1,
      mintId: (p) => `${p}_1`,
    });
    const card = Object.values(applyChanges(emptyBoard(), planned).cards)[0]!;
    expect(card.view?.datasetId).toBe(ds.id);
    // a view that names a dataset must be well-formed
    expect(() =>
      BoardCommand.parse({ type: 'card.updated', id: 'c_1', patch: { view: { datasetId: 'x', views: [], active: 'v1' } } }),
    ).toThrow();
  });
});

describe('drop path', () => {
  const file = (name: string, type: string, body: string | Uint8Array) =>
    new File([typeof body === 'string' ? body : new Uint8Array(body)], name, { type });
  const deps = (): IngestDeps & { imported: string[] } => {
    const imported: string[] = [];
    return {
      imported,
      upload: vi.fn(async ({ name, mime, body }) => ({ path: 'assets/01-x.csv', name, mime, size: body.size }) as never),
      importData: vi.fn(async ({ name }) => {
        imported.push(name);
        return { data: databaseDataOf(name, ds), view: newCardView(ds) };
      }),
    };
  };

  it('XLSX and JSON become Database cards with their view; CSV stays a Table card', async () => {
    const d = deps();
    const { command, errors } = await ingest(
      [
        { kind: 'file', file: file('book.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'PK') },
        { kind: 'file', file: file('rows.json', 'application/json', '[{"a":1}]') },
        { kind: 'file', file: file('t.csv', 'text/csv', 'a,b\n1,2\n') },
      ],
      { x: 0, y: 0 },
      emptyBoard(),
      d,
    );
    expect(errors).toEqual([]);
    expect(d.imported).toEqual(['book.xlsx', 'rows.json']);
    const cmds = (command as unknown as { commands: { card: Card }[] }).commands;
    expect(cmds.map((c) => c.card.type)).toEqual(['database', 'database', 'table']);
    expect(cmds[0]!.card.view?.datasetId).toBe(ds.id);
    expect(cmds[2]!.card.view).toBeUndefined();
    expect(BoardCommand.safeParse(command).success).toBe(true);
  });

  it('refuses other files with the list of what it takes', async () => {
    const { errors } = await ingest([{ kind: 'file', file: file('a.exe', 'application/x-msdownload', 'MZ') }], { x: 0, y: 0 }, emptyBoard(), deps());
    expect(errors[0]).toMatch(/CSV, XLSX, JSON/);
  });
});
