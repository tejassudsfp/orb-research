/**
 * P6.4 data cards in the canvas service: a Chart bound to a dataset or a Table card keeps its plotted `points` current
 * (the dataset's writes, the table's edits, undo), outside the user's undo stack; bad columns come back as a warning;
 * place_card / update_card / query_board work for the four data card types.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChartData, type AgentName, type Card, type CanvasMeta } from '@orb/shared';
import { CanvasStore } from '../src/store.js';
import { placeCard, queryBoard, updateCard, upsertDatasetRows, type BoardToolExec } from '../src/tools.js';

let home: string;
let store: CanvasStore;
let canvas: CanvasMeta;
const SESS: Record<AgentName, string> = { orb: 'sess-orb', scout: 'sess-scout', critic: 'sess-critic', builder: 'sess-builder' };
const execAs = (role: AgentName): BoardToolExec => ({
  callId: 'call_1',
  signal: new AbortController().signal,
  agent: { id: SESS[role], options: { provider: 'openai', model: 'gpt-6-luna' }, session: { header: { cwd: store.dirOf(canvas.id) } } },
});
const place = (role: AgentName, args: Record<string, unknown>) =>
  placeCard(store, { why: 'Because', ...args }, execAs(role), { delayMs: 0 }) as Promise<{ cardId: string; datasetId?: string; warning?: string; error?: string }>;
const cardOf = async (id: string): Promise<Card> => (await store.board(canvas.id)).card(id)!;
const chartOf = async (id: string) => ChartData.parse((await cardOf(id)).data);

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-charts-'));
  store = new CanvasStore({ home, flushMs: 5, searchIndex: false });
  canvas = await store.create({ prompt: 'Charts' });
  await store.setRootSession(canvas.id, SESS.orb);
  for (const r of ['scout', 'critic', 'builder'] as const) await store.setChildAgent(canvas.id, r, SESS[r]);
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

const pipeline = async () =>
  place('builder', {
    type: 'database',
    title: 'Pipeline',
    columns: ['Company', 'Stage', 'ARR'],
    rows: [['Acme', 'Seed', '1.2'], ['Globex', 'Series A', '4.5'], ['Acme', 'Seed', '0.8']],
  });

describe('bound to a dataset', () => {
  it('place_card plots the dataset (summed by x), and every dataset write refreshes the points and rev', async () => {
    const db = await pipeline();
    const chart = await place('builder', { type: 'chart', title: 'ARR', mark: 'bar', x: 'Company', y: 'ARR', datasetId: db.datasetId });
    expect(chart.warning).toBeUndefined();
    let d = await chartOf(chart.cardId);
    expect(d.points).toEqual([{ x: 'Acme', y: 2 }, { x: 'Globex', y: 4.5 }]);
    expect(d.xType).toBe('nominal');
    expect(d.rev).toBe(1);

    await upsertDatasetRows(store, { datasetId: db.datasetId, rows: [{ values: { Company: 'Initech', ARR: '3' } }] }, execAs('builder'));
    d = await chartOf(chart.cardId);
    expect(d.points.map((p) => p.x)).toEqual(['Acme', 'Globex', 'Initech']);
    expect(d.rev).toBe(2);
  });

  it('the refresh is not on the user undo stack (undo only reverses user actions)', async () => {
    const db = await pipeline();
    const chart = await place('builder', { type: 'chart', title: 'ARR', x: 'Company', y: 'ARR', datasetId: db.datasetId });
    const before = (await store.history(canvas.id)).undo;
    await store.datasets.edit(canvas.id, db.datasetId!, { op: 'addRow', cells: { k1: 'Zed', k3: 9 } });
    expect((await store.history(canvas.id)).undo).toBe(before);
    expect((await chartOf(chart.cardId)).points.some((p) => p.x === 'Zed')).toBe(true);
  });

  it('a column that is not there is a warning that lists the columns; fixing it with update_card plots', async () => {
    const db = await pipeline();
    const chart = await place('orb', { type: 'chart', title: 'ARR', x: 'Compny', y: 'ARR', datasetId: db.datasetId });
    expect(chart.warning).toMatch(/no column "Compny".*"Company", "Stage", "ARR"/);
    expect((await chartOf(chart.cardId)).points).toEqual([]);
    const fixed = (await updateCard(store, { cardId: chart.cardId, x: 'Company' }, execAs('orb'))) as { warning?: string };
    expect(fixed.warning).toBeUndefined();
    expect((await chartOf(chart.cardId)).points).toHaveLength(2);
  });

  it('refuses a dataset that is not on this canvas', async () => {
    await expect(place('builder', { type: 'chart', title: 'X', x: 'a', datasetId: 'd_NOSUCHSET01' })).rejects.toThrow(/no dataset d_NOSUCHSET01/);
  });
});

describe('bound to a Table card', () => {
  it('follows the table when it is edited, and when the edit is undone', async () => {
    const table = await place('builder', { type: 'table', title: 'Prices', columns: ['Plan', 'Price'], rows: [['Free', '0'], ['Pro', '20']] });
    const chart = await place('builder', { type: 'chart', title: 'Prices', mark: 'bar', x: 'Plan', y: 'Price', tableCardId: table.cardId });
    expect((await chartOf(chart.cardId)).points).toEqual([{ x: 'Free', y: 0 }, { x: 'Pro', y: 20 }]);

    await store.userCommand(canvas.id, {
      type: 'card.updated',
      id: table.cardId,
      patch: { data: { ...((await cardOf(table.cardId)).data as object), rows: [['Free', '0'], ['Pro', '20'], ['Team', '50']], totalRows: 3 } },
    });
    expect((await chartOf(chart.cardId)).points.map((p) => p.x)).toEqual(['Free', 'Pro', 'Team']);

    await store.userCommand(canvas.id, { type: 'undo' });
    expect((await chartOf(chart.cardId)).points.map((p) => p.x)).toEqual(['Free', 'Pro']);
  });

  it('a removed table leaves a problem, not a crash', async () => {
    const table = await place('builder', { type: 'table', title: 'T', columns: ['a', 'b'], rows: [['x', '1']] });
    const chart = await place('builder', { type: 'chart', title: 'C', x: 'a', y: 'b', tableCardId: table.cardId });
    await store.userCommand(canvas.id, { type: 'card.removed', ids: [table.cardId] });
    expect((await chartOf(chart.cardId)).problem).toMatch(/is gone/);
  });
});

describe('inline data and the other data cards', () => {
  it('inline rows plot without a source; describe states what the chart shows (query_board)', async () => {
    const chart = await place('orb', { type: 'chart', title: 'Revenue', mark: 'line', x: 'Year', y: 'Revenue', columns: ['Year', 'Revenue'], rows: [['2023', '10'], ['2024', '14'], ['2025', '21']] });
    const out = (await queryBoard(store, {}, execAs('orb'))) as { cards: { id: string; description?: string }[] };
    const mine = out.cards.find((c) => c.id === chart.cardId)!;
    expect(mine.description).toMatch(/line chart "Revenue": Revenue by Year/);
    expect(mine.description).toMatch(/2025 21/);
  });

  it('two data sources at once are refused', async () => {
    await expect(
      place('orb', { type: 'chart', title: 'X', x: 'a', datasetId: 'd_ABCDEFGH12', tableCardId: 'c_abc', columns: ['a'], rows: [['1']] }),
    ).rejects.toThrow(/ONE data source/);
  });

  it('metric needs its source; timeline events each need one; matrix scores must match the criteria', async () => {
    await expect(place('scout', { type: 'metric', title: 'ARR', value: '$4M' })).rejects.toThrow(/needs its source/);
    expect((await place('scout', { type: 'metric', title: 'ARR', value: '$4M', sourceUrl: 'https://example.org/a' })).cardId).toMatch(/^c_/);
    await expect(place('scout', { type: 'metric', title: 'ARR', value: '1', change: '+2%', sourceLabel: 'x' })).rejects.toThrow(/direction/);
    await expect(place('scout', { type: 'timeline', title: 'H', events: [{ date: '2024', label: 'Founded' }] })).rejects.toThrow(/source/);
    const tl = await place('scout', { type: 'timeline', title: 'H', events: [{ date: '2024-05', label: 'Launch', sourceUrl: 'https://example.org/a' }, { date: '2023', label: 'Founded', sourceLabel: 'Blog' }] });
    expect(tl.cardId).toMatch(/^c_/);
    await expect(place('critic', { type: 'matrix', title: 'M', criteria: [{ name: 'a', weight: 1 }], options: [{ name: 'A', scores: [1, 2] }, { name: 'B', scores: [3] }] })).rejects.toThrow(/one score per criterion/);
    const m = await place('critic', { type: 'matrix', title: 'M', criteria: [{ name: 'a', weight: 1 }], options: [{ name: 'A', scores: [1] }, { name: 'B', scores: [3] }] });
    expect(m.cardId).toMatch(/^c_/);
  });

  it('role gates: the Critic cannot place a chart; Scout cannot place a matrix', async () => {
    await expect(place('critic', { type: 'chart', title: 'X', x: 'a', columns: ['a'], rows: [['1']] })).rejects.toThrow(/may not place chart/);
    await expect(place('scout', { type: 'matrix', title: 'M', criteria: [{ name: 'a', weight: 1 }], options: [{ name: 'A', scores: [1] }, { name: 'B', scores: [3] }] })).rejects.toThrow(/may not place matrix/);
  });
});

describe('a user adds a chart (Chart this)', () => {
  it('card.added of a chart bound to a table gets its points at once, one undoable action', async () => {
    const table = await place('builder', { type: 'table', title: 'Prices', columns: ['Plan', 'Price'], rows: [['Free', '0'], ['Pro', '20']] });
    const { events } = await store.userCommand(canvas.id, {
      type: 'card.added',
      card: {
        type: 'chart',
        frameId: null,
        x: 0,
        y: 400,
        w: 440,
        h: 340,
        data: { title: 'Prices', mark: 'bar', x: 'Plan', y: 'Price', source: { kind: 'table', cardId: table.cardId }, points: [] },
      },
    });
    const id = (events[0]!.data as { card: Card }).card.id;
    expect((await chartOf(id)).points).toEqual([{ x: 'Free', y: 0 }, { x: 'Pro', y: 20 }]);
    await store.userCommand(canvas.id, { type: 'undo' });
    expect(await cardOf(id)).toBeUndefined();
  });
});
