/**
 * P6.3 datasets in the canvas service (orb-canvas): import (CSV, JSON, XLSX, pasted), edits and upserts that bump the
 * cards showing the dataset (outside the undo stack), attach a dataset view to any card, Table to Database promote
 * (undoable), the search index, and the `query_dataset` / `upsert_rows` tools with their role gates.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DatabaseData,
  databaseDataOf,
  newCardView,
  type AgentName,
  type Actor,
  type Card,
  type CanvasMeta,
} from '@orb/shared';
import { CanvasStore } from '../src/store.js';
import { placeCard, queryDataset, upsertDatasetRows, type BoardToolExec } from '../src/tools.js';
import { makeXlsx } from '../../../scripts/testkit/fixtures.js';

let home: string;
let store: CanvasStore;
let canvas: CanvasMeta;
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-datasets-'));
  store = new CanvasStore({ home, flushMs: 5, indexFlushMs: 5 });
  canvas = await store.create({ prompt: 'Datasets' });
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

const csv = 'Company,Stage,ARR\nAcme,Seed,1.2\nGlobex,Series A,4.5\nInitech,Seed,0.8\n';
const bytes = (t: string) => new TextEncoder().encode(t);
const agent = (who: AgentName): Actor => ({ kind: 'agent', agent: who, model: 'm', sessionId: `s-${who}` });
const cardOf = async (id: string): Promise<Card> => (await store.board(canvas.id)).card(id)!;

async function databaseCard(actor?: Actor) {
  const meta = await store.datasets.import(canvas.id, { name: 'Pipeline.csv', format: 'csv', bytes: bytes(csv) });
  const ds = await store.datasets.read(canvas.id, meta.id);
  const event = await store.command(
    canvas.id,
    { type: 'card.added', card: { type: 'database', frameId: null, x: 0, y: 0, w: 400, h: 300, data: databaseDataOf('Pipeline', ds), view: newCardView(ds) } },
    actor,
  );
  return { ds, card: (event.data as { card: Card }).card };
}

describe('import', () => {
  it('writes assets/data/<id>.json (+ a search digest) and returns the identity', async () => {
    const meta = await store.datasets.import(canvas.id, { name: 'Pipeline.csv', format: 'csv', bytes: bytes(csv) });
    expect(meta).toMatchObject({ name: 'Pipeline', rowCount: 3, columns: 3, rev: 1, truncated: false });
    const dir = join(store.dirOf(canvas.id), 'assets', 'data');
    expect(existsSync(join(dir, `${meta.id}.json`))).toBe(true);
    expect(readFileSync(join(dir, `${meta.id}.txt`), 'utf8')).toContain('Globex');
    expect(store.datasets.digestSync(canvas.id, meta.id)).toContain('Initech');
  });

  it('JSON and pasted text', async () => {
    const j = await store.datasets.import(canvas.id, { name: 'x.json', bytes: bytes('[{"a":1,"b":"x"},{"a":2,"b":"y"}]') });
    expect(j).toMatchObject({ rowCount: 2, columns: 2 });
    const pasted = await store.datasets.import(canvas.id, { name: 'Pasted data', text: 'p\tq\n1\t2\n3\t4' });
    expect(pasted.rowCount).toBe(2);
  });

  it('XLSX: the first sheet with data; numbers and booleans keep their type', async () => {
    const xlsx = makeXlsx({
      Empty: [],
      Pipeline: [
        ['Company', 'ARR', 'Active'],
        ['Acme', 1.2, true],
        ['Globex', 4.5, false],
      ],
      Other: [['ignored']],
    });
    const meta = await store.datasets.import(canvas.id, { name: 'book.xlsx', bytes: xlsx });
    expect(meta).toMatchObject({ rowCount: 2, columns: 3, sheet: 'Pipeline' });
    const ds = await store.datasets.read(canvas.id, meta.id);
    expect(ds.columns.map((c) => c.type)).toEqual(['text', 'number', 'checkbox']);
    expect(ds.rows[1]!.cells.k2).toBe(4.5);
  });

  it('refuses an unreadable workbook, empty data, bad JSON and files over the cap', async () => {
    await expect(store.datasets.import(canvas.id, { name: 'bad.xlsx', bytes: bytes('not a zip') })).rejects.toMatchObject({ code: 'orb/invalid-args' });
    await expect(store.datasets.import(canvas.id, { name: 'e.csv', text: '' })).rejects.toMatchObject({ code: 'orb/invalid-args' });
    await expect(store.datasets.import(canvas.id, { name: 'e.json', format: 'json', text: '{nope' })).rejects.toMatchObject({ code: 'orb/invalid-args' });
    await expect(
      store.datasets.import(canvas.id, { name: 'big.csv', bytes: new Uint8Array(11 * 1024 * 1024) }),
    ).rejects.toMatchObject({ code: 'orb/too-large' });
  });

  it('a card may only name a dataset of this canvas', async () => {
    await expect(
      store.command(canvas.id, {
        type: 'card.added',
        card: {
          type: 'note',
          frameId: null,
          x: 0,
          y: 0,
          w: 200,
          h: 100,
          data: { title: 'n' },
          view: newCardView({ id: 'd_NOSUCHDATASET', name: 'x', rows: [], rev: 1 }),
        },
      }),
    ).rejects.toMatchObject({ code: 'orb/not-found' });
  });
});

describe('edits and upserts update the cards that show the dataset', () => {
  it('a user edit patches the Database card (rows, preview, rev) and a note with a view attached, off the undo stack', async () => {
    const { ds, card } = await databaseCard();
    const note = (
      await store.command(canvas.id, {
        type: 'card.added',
        card: { type: 'note', frameId: null, x: 500, y: 0, w: 200, h: 100, data: { title: 'My note' } },
      })
    ).data as { card: Card };
    await store.command(canvas.id, { type: 'card.updated', id: note.card.id, patch: { view: newCardView(ds) } });
    const depth = (await store.history(canvas.id)).undo;

    const saved = await store.datasets.edit(canvas.id, ds.id, { op: 'addRow', cells: { k1: 'Hooli', k3: 9 } });
    expect(saved.rows).toHaveLength(4);
    const db = await cardOf(card.id);
    expect(DatabaseData.parse(db.data)).toMatchObject({ rowCount: 4, rev: saved.rev });
    expect(DatabaseData.parse(db.data).preview).toHaveLength(4);
    expect(db.view).toMatchObject({ rowCount: 4, rev: saved.rev });
    const attached = await cardOf(note.card.id);
    expect(attached.view).toMatchObject({ rowCount: 4, rev: saved.rev });
    expect(attached.data).toEqual({ title: 'My note' });
    expect((await store.history(canvas.id)).undo).toBe(depth);
  });

  it('serialises concurrent edits of one dataset', async () => {
    const { ds } = await databaseCard();
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.datasets.edit(canvas.id, ds.id, { op: 'addRow', cells: { k1: `n${i}` } })));
    const after = await store.datasets.read(canvas.id, ds.id);
    expect(after.rows).toHaveLength(13);
    expect(after.rev).toBe(ds.rev + 10);
    expect(new Set(after.rows.map((r) => r.id)).size).toBe(13);
  });

  it('survives a reopen: the file is the truth', async () => {
    const { ds } = await databaseCard();
    await store.datasets.edit(canvas.id, ds.id, { op: 'setCell', row: 'r1', column: 'k1', value: 'Acme Inc' });
    await store.close();
    store = new CanvasStore({ home, flushMs: 5 });
    const again = await store.datasets.read(canvas.id, ds.id);
    expect(again.rows[0]!.cells.k1).toBe('Acme Inc');
  });
});

describe('Table to Database', () => {
  it('makes the dataset from the stored CSV, and one undoable card.updated changes the card in place', async () => {
    const asset = await store.writeAsset(canvas.id, {
      name: 'pipeline.csv',
      mime: 'text/csv',
      data: (async function* () {
        yield bytes(csv + 'Hooli,Seed,2.5\n');
      })(),
    });
    const tableEvent = await store.command(canvas.id, {
      type: 'card.added',
      card: {
        type: 'table',
        frameId: null,
        x: 10,
        y: 20,
        w: 520,
        h: 320,
        // the card holds only two rows; the CSV has four
        data: { title: 'Pipeline', columns: ['Company', 'Stage', 'ARR'], rows: [['Acme', 'Seed', '1.2'], ['Globex', 'Series A', '4.5']], totalRows: 4, asset },
      },
    });
    const table = (tableEvent.data as { card: Card }).card;

    const made = await store.tableToDatabase(canvas.id, table.id);
    expect(made.data).toMatchObject({ title: 'Pipeline', rowCount: 4, columns: ['Company', 'Stage', 'ARR'] });
    const done = await store.userCommand(canvas.id, {
      type: 'card.updated',
      id: table.id,
      patch: { type: 'database', data: made.data, view: made.view },
    });
    expect(done.history.undo).toBeGreaterThan(0);
    const promoted = await cardOf(table.id);
    expect(promoted).toMatchObject({ type: 'database', x: 10, y: 20, w: 520, h: 320 });
    expect((await store.datasets.read(canvas.id, made.data.datasetId)).rows).toHaveLength(4);

    await store.userCommand(canvas.id, { type: 'undo' });
    const back = await cardOf(table.id);
    expect(back.type).toBe('table');
    expect(back.view).toBeUndefined();
    expect((back.data as { totalRows: number }).totalRows).toBe(4);
    await store.userCommand(canvas.id, { type: 'redo' });
    expect((await cardOf(table.id)).type).toBe('database');
  });

  it('refuses a card that is not a table; agents may not change a card type', async () => {
    const { card } = await databaseCard();
    await expect(store.tableToDatabase(canvas.id, card.id)).rejects.toMatchObject({ code: 'orb/invalid-args' });
    const note = ((await store.command(canvas.id, { type: 'card.added', card: { type: 'note', frameId: null, x: 0, y: 0, w: 1, h: 1, data: { title: 'n' } } }, agent('orb'))).data as { card: Card }).card;
    await expect(
      store.command(canvas.id, { type: 'card.updated', id: note.id, patch: { type: 'doc' } }, agent('orb')),
    ).rejects.toMatchObject({ code: 'orb/forbidden' });
  });
});

describe('attach a dataset view to any card, with undo', () => {
  it('attach, change the view, detach; each step is one undo', async () => {
    const { ds } = await databaseCard();
    const q = ((await store.command(canvas.id, { type: 'card.added', card: { type: 'question', frameId: null, x: 0, y: 400, w: 280, h: 160, data: { title: 'Why?' } } })).data as { card: Card }).card;
    await store.userCommand(canvas.id, { type: 'card.updated', id: q.id, patch: { view: newCardView(ds) } });
    expect((await cardOf(q.id)).view?.datasetId).toBe(ds.id);
    const view = { ...(await cardOf(q.id)).view! };
    view.views = [{ ...view.views[0]!, filter: [{ column: 'k2', op: 'eq', value: 'Seed' }], sort: [{ column: 'k3', dir: 'desc' }] }];
    await store.userCommand(canvas.id, { type: 'card.updated', id: q.id, patch: { view } });
    expect((await cardOf(q.id)).view?.views[0]?.filter).toHaveLength(1);
    await store.userCommand(canvas.id, { type: 'undo' });
    expect((await cardOf(q.id)).view?.views[0]?.filter).toHaveLength(0);
    await store.userCommand(canvas.id, { type: 'card.updated', id: q.id, patch: { view: null } });
    expect((await cardOf(q.id)).view).toBeUndefined();
    await store.userCommand(canvas.id, { type: 'undo' });
    expect((await cardOf(q.id)).view).toBeDefined();
  });
});

describe('search', () => {
  it('the dataset rows are found by Home search through the card that shows them', async () => {
    const { ds, card } = await databaseCard();
    const hit = async (q: string) => (await store.search({ q })).hits.filter((h) => h.itemId === card.id);
    expect(await hit('Globex')).toHaveLength(1);
    await store.datasets.edit(canvas.id, ds.id, { op: 'addRow', cells: { k1: 'Wonka Industries' } });
    await expect.poll(async () => (await hit('Wonka')).length, { timeout: 3000 }).toBe(1);
    expect((await hit('Wonka'))[0]).toMatchObject({ cardType: 'database', canvasId: canvas.id });
  });
});

// ---- Tools ----

const SESS: Record<AgentName, string> = { orb: 'sess-orb', scout: 'sess-scout', critic: 'sess-critic', builder: 'sess-builder' };
const execAs = (role: AgentName, signal = new AbortController().signal): BoardToolExec => ({
  callId: 'call_1',
  signal,
  agent: { id: SESS[role], options: { provider: 'openai', model: 'gpt-6-luna' }, session: { header: { cwd: store.dirOf(canvas.id) } } },
});
async function registerTeam() {
  await store.setRootSession(canvas.id, SESS.orb);
  for (const r of ['scout', 'critic', 'builder'] as const) await store.setChildAgent(canvas.id, r, SESS[r]);
}

describe('query_dataset and upsert_rows tools', () => {
  beforeEach(registerTeam);

  it('place_card database makes a dataset from columns and rows; query_dataset reads it with a structured query', async () => {
    const placed = (await placeCard(
      store,
      { type: 'database', title: 'Competitors', columns: ['Name', 'Price', 'Tier'], rows: [['A', '10', 'low'], ['B', '30', 'high'], ['C', '20', 'low']], why: 'The field' },
      execAs('scout'),
      { delayMs: 0 },
    )) as { cardId: string; datasetId: string };
    expect(placed.datasetId).toMatch(/^d_/);
    const card = await cardOf(placed.cardId);
    expect(card).toMatchObject({ type: 'database', provenance: { kind: 'agent', agent: 'scout' } });
    expect(card.view?.datasetId).toBe(placed.datasetId);
    expect(DatabaseData.parse(card.data).rowCount).toBe(3);

    const out = (await queryDataset(
      store,
      { cardId: placed.cardId, filter: [{ column: 'Tier', op: 'eq', value: 'low' }], sort: [{ column: 'Price', dir: 'desc' }] },
      execAs('critic'),
    )) as { rows: unknown[][]; rowIds: string[]; matched: number; schema: { name: string; type: string }[] };
    expect(out.rows).toEqual([['C', 20, 'low'], ['A', 10, 'low']]);
    expect(out.matched).toBe(2);
    expect(out.rowIds).toHaveLength(2);
    expect(out.schema.map((c) => c.type)).toEqual(['text', 'number', 'text']);

    const grouped = (await queryDataset(
      store,
      { datasetId: placed.datasetId, groupBy: ['Tier'], aggregate: [{ fn: 'avg', column: 'Price' }] },
      execAs('orb'),
    )) as { rows: unknown[][] };
    expect(grouped.rows).toEqual([['high', 30], ['low', 15]]);
  });

  it('answers at most 50 rows and says there are more; cells are cut', async () => {
    const meta = await store.datasets.create(canvas.id, 'Big', ['n', 'text'], Array.from({ length: 120 }, (_, i) => [String(i), 'x'.repeat(2000)]));
    const out = (await queryDataset(store, { datasetId: meta.dataset.id }, execAs('orb'))) as {
      rows: unknown[][];
      more: number;
      returned: number;
    };
    expect(out.rows).toHaveLength(50);
    expect(out.more).toBe(70);
    expect(String(out.rows[0]![1]).length).toBeLessThanOrEqual(301);
    await expect(queryDataset(store, { datasetId: meta.dataset.id, limit: 80 }, execAs('orb'))).rejects.toThrow(/limit/);
  });

  it('refuses SQL-shaped and unknown-column queries with a message for the model', async () => {
    const { ds } = await databaseCard();
    await expect(queryDataset(store, { datasetId: ds.id, sql: 'select 1' }, execAs('orb'))).rejects.toThrow(/Unrecognized|unrecognized|sql/i);
    await expect(queryDataset(store, { datasetId: ds.id, filter: [{ column: 'Nope', op: 'eq', value: 1 }] }, execAs('orb'))).rejects.toThrow(/no column "Nope"/);
    await expect(queryDataset(store, {}, execAs('orb'))).rejects.toThrow(/cardId|datasetId/);
    await expect(queryDataset(store, { datasetId: 'd_NOSUCHDATASET' }, execAs('orb'))).rejects.toThrow(/no dataset/);
  });

  it('upsert_rows is role-gated: the Critic is refused, others write; user rows are never overwritten', async () => {
    const { ds, card } = await databaseCard();
    await expect(
      upsertDatasetRows(store, { cardId: card.id, rows: [{ values: { Company: 'X' } }] }, execAs('critic')),
    ).rejects.toThrow(/not available to the critic/);
    const scout = (await upsertDatasetRows(
      store,
      { cardId: card.id, key: 'Company', rows: [{ values: { Company: 'Hooli', Stage: 'Seed', ARR: 2.5 } }, { values: { Company: 'acme', ARR: 99 } }] },
      execAs('scout'),
    )) as { added: number; updated: number; skipped: { reason: string }[]; totalRows: number };
    expect(scout.added).toBe(1);
    expect(scout.updated).toBe(0);
    expect(scout.skipped[0]!.reason).toMatch(/written by the user/);
    expect(scout.totalRows).toBe(4);
    const after = await store.datasets.read(canvas.id, ds.id);
    expect(after.rows.find((r) => r.cells.k1 === 'Acme')!.cells.k3).toBe(1.2);
    expect(after.rows.at(-1)).toMatchObject({ by: 'scout' });
    // the card shows the new size, with the agent as the author of the change
    expect(DatabaseData.parse((await cardOf(card.id)).data).rowCount).toBe(4);
    // Builder cannot change Scout's row; Orb can
    const hooli = after.rows.at(-1)!.id;
    const builder = (await upsertDatasetRows(store, { cardId: card.id, rows: [{ rowId: hooli, values: { ARR: 1 } }] }, execAs('builder'))) as { updated: number; skipped: unknown[] };
    expect(builder.updated).toBe(0);
    expect(builder.skipped).toHaveLength(1);
    const orb = (await upsertDatasetRows(store, { cardId: card.id, rows: [{ rowId: hooli, values: { ARR: 3 } }] }, execAs('orb'))) as { updated: number };
    expect(orb.updated).toBe(1);
    await expect(upsertDatasetRows(store, { cardId: card.id, rows: [{ values: { Missing: 1 } }] }, execAs('orb'))).rejects.toThrow(/no column "Missing"/);
  });

  it('removes duplicate agent rows through the tool and syncs the card once; invalid merges write nothing', async () => {
    const { ds, card } = await databaseCard();
    const added = await upsertDatasetRows(store, { cardId: card.id, rows: [
      { values: { Company: 'Canonical', ARR: 1 } }, { values: { Company: 'Duplicate', ARR: 1 } },
    ] }, execAs('scout')) as any;
    const [survivor, duplicate] = added.addedRowIds;
    const before = await store.datasets.read(canvas.id, ds.id);
    await expect(upsertDatasetRows(store, { cardId: card.id, rows: [{ rowId: survivor, values: { Missing: 2 } }], removeIds: [duplicate] }, execAs('orb'))).rejects.toThrow(/no column/);
    expect((await store.datasets.read(canvas.id, ds.id)).rev).toBe(before.rev);
    const merged = await upsertDatasetRows(store, { cardId: card.id, rows: [{ rowId: survivor, values: { ARR: 2 } }], removeIds: [duplicate, 'r1'] }, execAs('orb')) as any;
    expect(merged).toMatchObject({ updated: 1, removed: 1, removedRowIds: [duplicate], totalRows: 4 });
    expect(merged.removalSkipped[0].reason).toMatch(/user wrote/);
    expect(DatabaseData.parse((await cardOf(card.id)).data).rowCount).toBe(4);
    const after = await store.datasets.read(canvas.id, ds.id);
    expect(after.rev).toBe(before.rev + 1);
    const seq = (await store.board(canvas.id)).current.seq;
    const unchanged = await upsertDatasetRows(store, { cardId: card.id, rows: [{ rowId: survivor, values: { ARR: '2' } }] }, execAs('orb')) as any;
    expect(unchanged.updated).toBe(0);
    expect((await store.datasets.read(canvas.id, ds.id)).rev).toBe(after.rev);
    expect((await store.board(canvas.id)).current.seq).toBe(seq);
  });

  it('an aborted call writes nothing', async () => {
    const { ds, card } = await databaseCard();
    const ac = new AbortController();
    ac.abort(new Error('stop'));
    await expect(upsertDatasetRows(store, { cardId: card.id, rows: [{ values: { Company: 'Z' } }] }, execAs('orb', ac.signal))).rejects.toThrow();
    expect((await store.datasets.read(canvas.id, ds.id)).rows).toHaveLength(3);
  });
});
