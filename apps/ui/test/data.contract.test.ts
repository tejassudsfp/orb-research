/**
 * P6.3 contract test against a REAL sidecar (mock LLM): datasets over the authenticated gateway, the board events that
 * reference them, and the agent tools through the real tool path.
 * - import CSV, JSON, XLSX and pasted text through `api/orb-data/import`; read, edit; the files land in
 *   `<canvas>/assets/data/` and only the sidecar wrote them;
 * - without the auth cookie 401, with a foreign Origin 403; nothing is stored;
 * - a Database card and a view attached to a note persist in board.jsonl; an edit patches both through the follow
 *   stream and is not an undo step; Table to Database is one undoable change;
 * - a model calls `place_card` (database), `query_dataset` (structured, at most 50 rows, never SQL) and `upsert_rows`
 *   (role-gated: the Critic is refused, user rows are never overwritten).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DatabaseData,
  databaseDataOf,
  newCardView,
  type BoardEvent,
  type CanvasMeta,
  type Card,
} from '@orb/shared';
import { makeXlsx, startMockedSidecar, type MockedSidecar } from '../../../scripts/testkit/index.ts';
import { WireError, createWire, type Wire } from '../src/wire/index.js';
import { createBoardStore, type BoardStore } from '../src/store/board.js';

let sc: MockedSidecar;
let wire: Wire;
let canvas: CanvasMeta;
let follower: AbortController;
let store: BoardStore;

beforeAll(async () => {
  sc = await startMockedSidecar();
  wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
  canvas = await wire.orb.canvas.create({ prompt: 'Datasets contract' });
  follower = new AbortController();
  store = createBoardStore(canvas.id, (command) => wire.orb.board.command(canvas.id, command));
  void (async () => {
    try {
      for await (const frame of wire.orb.board.follow(canvas.id, { signal: follower.signal }))
        store.getState().receive(frame);
    } catch {
      // aborted
    }
  })();
  await vi.waitFor(() => {
    if (!store.getState().ready) throw new Error('the board is not ready');
  });
}, 120_000);
afterAll(async () => {
  follower?.abort();
  wire?.dispose();
  await sc?.stop();
});

const canvasDir = () => join(sc.paths.orbHome, 'canvases', canvas.id);
const dataDir = () => join(canvasDir(), 'assets', 'data');
const log = (): BoardEvent[] =>
  readFileSync(join(canvasDir(), 'board.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BoardEvent);
const card = (id: string): Card => store.getState().board.cards[store.getState().resolve(id)]!;

const csv = 'Company,Stage,ARR\nAcme,Seed,1.2\nGlobex,Series A,4.5\nInitech,Seed,0.8\n';
let datasetId = '';
let dbCardId = '';

describe('datasets over the gateway', () => {
  it('imports CSV, JSON, XLSX and pasted text; reads and edits through the routes', async () => {
    const a = await wire.data.import(canvas.id, { name: 'Pipeline.csv', body: csv, mime: 'text/csv' });
    datasetId = a.id;
    expect(a).toMatchObject({ name: 'Pipeline', rowCount: 3, columns: 3, rev: 1 });
    const j = await wire.data.import(canvas.id, { name: 'rows.json', body: '[{"a":1},{"a":2}]', mime: 'application/json' });
    expect(j.rowCount).toBe(2);
    const x = await wire.data.import(canvas.id, {
      name: 'book.xlsx',
      body: new Blob([makeXlsx({ Sheet1: [['n', 'm'], [1, 'x'], [2, 'y']] }) as BlobPart]),
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(x).toMatchObject({ rowCount: 2, sheet: 'Sheet1' });
    const p = await wire.data.import(canvas.id, { name: 'Pasted data', body: 'a\tb\n1\t2', format: 'text' });
    expect(p.rowCount).toBe(1);
    expect(readdirSync(dataDir()).filter((f) => f.endsWith('.json')).sort()).toEqual(
      [a.id, j.id, x.id, p.id].map((i) => `${i}.json`).sort(),
    );

    const ds = await wire.data.read(canvas.id, datasetId);
    expect(ds.rows.map((r) => r.cells.k1)).toEqual(['Acme', 'Globex', 'Initech']);
    const saved = await wire.data.edit(canvas.id, datasetId, { op: 'setCell', row: 'r1', column: 'k3', value: 2 });
    expect(saved).toMatchObject({ rev: 2, rowCount: 3 });
    expect((await wire.data.read(canvas.id, datasetId)).rows[0]!.cells.k3).toBe(2);
    await expect(wire.data.edit(canvas.id, datasetId, { op: 'setCell', row: 'r99', column: 'k3', value: 2 })).rejects.toMatchObject({ code: 'orb/invalid-args' });
    await expect(wire.data.import(canvas.id, { name: 'x.pdf', body: 'x', mime: 'application/pdf' })).rejects.toBeInstanceOf(WireError);
    await expect(wire.data.read(canvas.id, 'd_NOSUCHDATASET')).rejects.toBeInstanceOf(WireError);
  });

  it('refuses requests without the auth cookie (401) or from another origin (403); nothing is stored', async () => {
    const before = readdirSync(dataDir()).sort();
    const url = `${sc.origin}/api/orb-data/import?canvas=${canvas.id}&name=x.csv`;
    const anon = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/csv' }, body: csv });
    expect(anon.status).toBe(401);
    const foreign = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/csv', cookie: sc.headers.cookie!, origin: 'https://evil.example' },
      body: csv,
    });
    expect(foreign.status).toBe(403);
    const read = await fetch(`${sc.origin}/api/orb-data/dataset?canvas=${canvas.id}&id=${datasetId}`);
    expect(read.status).toBe(401);
    expect(readdirSync(dataDir()).sort()).toEqual(before);
  });
});

describe('cards that reference a dataset', () => {
  it('a Database card and a view attached to a note persist; a dataset edit patches both, off the undo stack', async () => {
    const ds = await wire.data.read(canvas.id, datasetId);
    const s = store.getState;
    expect(
      await s().dispatch(
        { type: 'card.added', card: { type: 'database', frameId: null, x: 0, y: 0, w: 560, h: 360, data: databaseDataOf('Pipeline', ds), view: newCardView(ds) } },
        { select: 'created' },
      ),
    ).toBe(true);
    dbCardId = s().selection[0]!;
    dbCardId = s().resolve(dbCardId);
    expect(
      await s().dispatch({ type: 'card.added', card: { type: 'note', frameId: null, x: 600, y: 0, w: 280, h: 200, data: { title: 'About the pipeline', body: 'Notes.' } } }, { select: 'created' }),
    ).toBe(true);
    const noteId = s().resolve(s().selection[0]!);
    expect(await s().dispatch({ type: 'card.updated', id: noteId, patch: { view: newCardView(ds) } })).toBe(true);
    expect(card(noteId).view?.datasetId).toBe(datasetId);

    const undoBefore = s().history?.undo ?? 0;
    await wire.data.edit(canvas.id, datasetId, { op: 'addRow', cells: { k1: 'Hooli', k2: 'Seed', k3: 9 } });
    await expect.poll(() => DatabaseData.parse(card(dbCardId).data).rowCount).toBe(4);
    await expect.poll(() => card(noteId).view?.rowCount).toBe(4);
    expect(DatabaseData.parse(card(dbCardId).data).preview!.at(-1)).toEqual(['Hooli', 'Seed', '9']);
    expect(s().history?.undo ?? 0).toBe(undoBefore);
    // on disk too
    await expect
      .poll(() => log().filter((e) => e.type === 'card.updated' && (e.data as { id: string }).id === dbCardId).length)
      .toBeGreaterThan(0);
    expect(existsSync(join(dataDir(), `${datasetId}.json`))).toBe(true);

    // a card may not name a dataset that does not exist
    expect(
      await s().dispatch({ type: 'card.updated', id: noteId, patch: { view: newCardView({ id: 'd_NOSUCHDATASET', name: 'x', rows: [], rev: 1 }) } }),
    ).toBe(false);
  });

  it('Table to Database over the gateway: one undoable change that keeps the card in place', async () => {
    const s = store.getState;
    expect(
      await s().dispatch(
        { type: 'card.added', card: { type: 'table', frameId: null, x: 0, y: 500, w: 520, h: 320, data: { title: 'Prices', columns: ['Plan', 'Price'], rows: [['Pro', '20'], ['Team', '50']], totalRows: 2 } } },
        { select: 'created' },
      ),
    ).toBe(true);
    const id = s().resolve(s().selection[0]!);
    const made = await wire.data.promote(canvas.id, id);
    expect(made.data).toMatchObject({ title: 'Prices', rowCount: 2 });
    expect(await s().dispatch({ type: 'card.updated', id, patch: { type: 'database', data: made.data, view: made.view } })).toBe(true);
    expect(card(id)).toMatchObject({ type: 'database', x: 0, y: 500, w: 520 });
    expect(await s().undo()).toBe(true);
    expect(card(id).type).toBe('table');
    expect(await s().redo()).toBe(true);
    expect(card(id).type).toBe('database');
  });
});

// ---- The agent tools, through a real model turn ----

let callSeq = 0;
async function toolResult(name: string, args: Record<string, unknown>, send: (text: string) => Promise<unknown>) {
  const callId = `call_${name}_${++callSeq}`;
  const first = sc.llm.requests.length;
  sc.llm.enqueue({ toolCalls: [{ id: callId, name, arguments: args }] }, { text: 'ok' });
  await send(`run ${name}`);
  const followUp = await sc.llm.waitForRequest((r) => r.id === first + 2);
  const toolMsg = followUp.body.messages.at(-1);
  expect(toolMsg).toMatchObject({ role: 'tool', tool_call_id: callId });
  return String(toolMsg.content);
}
const asOrb = (name: string, args: Record<string, unknown>) =>
  toolResult(name, args, (text) => wire.orb.chat.send(canvas.id, { text }));

describe('query_dataset and upsert_rows through the model', () => {
  it('Orb reads with a structured query (50 rows at most) and never with SQL', async () => {
    const out = JSON.parse(
      await asOrb('query_dataset', { cardId: dbCardId, filter: [{ column: 'Stage', op: 'eq', value: 'Seed' }], sort: [{ column: 'ARR', dir: 'desc' }], select: ['Company', 'ARR'] }),
    ) as { rows: unknown[][]; matched: number; columns: string[]; totalRows: number };
    expect(out.columns).toEqual(['Company', 'ARR']);
    expect(out.rows).toEqual([['Hooli', 9], ['Acme', 2], ['Initech', 0.8]]);
    expect(out.matched).toBe(3);
    expect(out.totalRows).toBe(4);

    const sql = await asOrb('query_dataset', { cardId: dbCardId, sql: 'select * from t' });
    expect(sql).toMatch(/unrecognized|sql/i);

    const big = await wire.data.import(canvas.id, { name: 'big.csv', body: `n\n${Array.from({ length: 200 }, (_, i) => i).join('\n')}\n`, mime: 'text/csv' });
    const page = JSON.parse(await asOrb('query_dataset', { datasetId: big.id })) as { rows: unknown[][]; more: number };
    expect(page.rows).toHaveLength(50);
    expect(page.more).toBe(150);
  });

  it('Orb upserts rows; the user rows stay; the card shows the new count', async () => {
    const res = JSON.parse(
      await asOrb('upsert_rows', {
        cardId: dbCardId,
        key: 'Company',
        rows: [{ values: { Company: 'Wonka', Stage: 'Series B', ARR: 30 } }, { values: { Company: 'acme', ARR: 999 } }],
      }),
    ) as { added: number; updated: number; skipped: { reason: string }[] };
    expect(res).toMatchObject({ added: 1, updated: 0 });
    expect(res.skipped[0]!.reason).toMatch(/written by the user/);
    const ds = await wire.data.read(canvas.id, datasetId);
    expect(ds.rows.find((r) => r.cells.k1 === 'Acme')!.cells.k3).toBe(2);
    expect(ds.rows.find((r) => r.cells.k1 === 'Wonka')).toMatchObject({ by: 'orb' });
    await expect.poll(() => DatabaseData.parse(card(dbCardId).data).rowCount).toBe(5);
    await expect
      .poll(() => log().filter((e) => e.type === 'card.updated' && (e.data as { id: string }).id === dbCardId).at(-1)?.actor)
      .toMatchObject({ kind: 'agent', agent: 'orb' });
  });

  it('place_card makes a Database card with its dataset; a Critic session cannot upsert', async () => {
    const placed = JSON.parse(
      await asOrb('place_card', { type: 'database', title: 'Rivals', columns: ['Name', 'Price'], rows: [['A', '10'], ['B', '20']], why: 'The field' }),
    ) as { cardId: string; datasetId: string };
    expect(placed.datasetId).toMatch(/^d_/);
    await expect.poll(() => store.getState().board.cards[placed.cardId]?.type).toBe('database');
    expect((await wire.data.read(canvas.id, placed.datasetId)).rows).toHaveLength(2);

    const created = await wire.session.create({ cwd: canvasDir() });
    const file = join(canvasDir(), 'canvas.json');
    const meta = JSON.parse(readFileSync(file, 'utf8')) as CanvasMeta;
    writeFileSync(file, JSON.stringify({ ...meta, childAgentIds: { ...meta.childAgentIds, critic: created.sessionId } }));
    const asCritic = (name: string, args: Record<string, unknown>) =>
      toolResult(name, args, (text) => wire.session.prompt(created.sessionId, text));
    const refused = await asCritic('upsert_rows', { cardId: placed.cardId, rows: [{ values: { Name: 'Z' } }] });
    expect(refused).toMatch(/not available to the critic|not found|unknown tool/i);
    expect((await wire.data.read(canvas.id, placed.datasetId)).rows).toHaveLength(2);
    const read = JSON.parse(await asCritic('query_dataset', { cardId: placed.cardId })) as { rows: unknown[][] };
    expect(read.rows).toEqual([['A', 10], ['B', 20]]);
  });
});
