/**
 * P2.6 Home search: index.sqlite (node:sqlite FTS5) across all canvases, kept up to date incrementally by the canvas
 * service and rebuilt when missing. Done-when: search returns cards across 3 canvases, and deleting index.sqlite
 * triggers a rebuild.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SEARCH_MARK_CLOSE, SEARCH_MARK_OPEN, type Card } from '@orb/shared';
import { CanvasStore, INDEX_FILE, cardText, ftsQuery } from '../src/index.js';

let home: string;
let store: CanvasStore;
const open = (h = home) => new CanvasStore({ home: h, indexFlushMs: 5 });

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'orb-search-'));
  store = open();
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

const note = (title: string, body: string, x = 0) => ({
  type: 'note' as const,
  x,
  y: 0,
  w: 200,
  h: 120,
  data: { title, body },
});

/** Three canvases, each with a card that mentions "photosynthesis" and one unique card. */
async function threeCanvases() {
  const ids: string[] = [];
  const topics = ['Kelp forests', 'Rice paddies', 'Desert succulents'];
  for (const [i, topic] of topics.entries()) {
    const meta = await store.create({ prompt: topic });
    ids.push(meta.id);
    await store.command(meta.id, {
      type: 'card.added',
      card: note(`${topic} and light`, `How photosynthesis works for ${topic.toLowerCase()} (case ${i}).`),
    });
    await store.command(meta.id, {
      type: 'card.added',
      card: note(`Unique ${i}`, `zebra${i} marker text`, 300),
    });
  }
  return ids;
}

const plain = (s: string) => s.replaceAll(SEARCH_MARK_OPEN, '').replaceAll(SEARCH_MARK_CLOSE, '');

describe('search across canvases', () => {
  it('returns cards from 3 canvases', async () => {
    const ids = await threeCanvases();
    const { hits } = await store.search({ q: 'photosynthesis' });
    const cardHits = hits.filter((h) => h.kind === 'card');
    expect(new Set(cardHits.map((h) => h.canvasId))).toEqual(new Set(ids));
    expect(cardHits).toHaveLength(3);
    for (const hit of cardHits) {
      expect(hit.cardType).toBe('note');
      expect(hit.itemId).toMatch(/^c_/);
      expect(hit.snippet).toContain(`${SEARCH_MARK_OPEN}photosynthesis${SEARCH_MARK_CLOSE}`);
    }
    expect(cardHits.map((h) => h.canvasTitle).sort()).toEqual([
      'Desert succulents',
      'Kelp forests',
      'Rice paddies',
    ]);
    // A unique word finds exactly its card; prefixes match; case and diacritics are folded.
    const one = (await store.search({ q: 'zebra1' })).hits;
    expect(one.map((h) => [h.canvasId, h.title])).toEqual([[ids[1], 'Unique 1']]);
    expect((await store.search({ q: 'PHOTOSYN' })).hits.filter((h) => h.kind === 'card')).toHaveLength(3);
    expect((await store.search({ q: 'phötosynthesis' })).hits.filter((h) => h.kind === 'card')).toHaveLength(
      3,
    );
    // Every word must match.
    expect((await store.search({ q: 'photosynthesis kelp' })).hits.map((h) => h.canvasId)).toEqual([ids[0]]);
    expect((await store.search({ q: 'nothing-like-this' })).hits).toEqual([]);
  });

  it('deleting index.sqlite triggers a rebuild (same results)', async () => {
    const ids = await threeCanvases();
    const first = await store.search({ q: 'photosynthesis' });
    expect(existsSync(join(home, INDEX_FILE))).toBe(true);
    const rebuildsBefore = store.index!.rebuilds;

    rmSync(join(home, INDEX_FILE));
    const again = await store.search({ q: 'photosynthesis' });
    expect(again.rebuilt).toBe(true);
    expect(store.index!.rebuilds).toBe(rebuildsBefore + 1);
    expect(existsSync(join(home, INDEX_FILE))).toBe(true);
    const key = (h: { canvasId: string; itemId: string }) => `${h.canvasId}/${h.itemId}`;
    expect(again.hits.map(key).sort()).toEqual(first.hits.map(key).sort());
    expect(new Set(again.hits.filter((h) => h.kind === 'card').map((h) => h.canvasId))).toEqual(new Set(ids));
    // The next search uses the rebuilt index.
    expect((await store.search({ q: 'photosynthesis' })).rebuilt).toBe(false);
  });

  it('rebuilds from the board logs at start when index.sqlite is missing (boards not open)', async () => {
    const ids = await threeCanvases();
    await store.close();
    rmSync(join(home, INDEX_FILE), { force: true });
    store = open();
    const { hits, rebuilt } = await store.search({ q: 'photosynthesis' });
    expect(rebuilt).toBe(true);
    expect(new Set(hits.filter((h) => h.kind === 'card').map((h) => h.canvasId))).toEqual(new Set(ids));
  });

  it('an index left by a clean shutdown is current: no re-index on the next start', async () => {
    await threeCanvases();
    await store.search({ q: 'photosynthesis' });
    await store.close();
    store = open();
    let reads = 0;
    const read = store.readBoard.bind(store);
    store.readBoard = (id: string) => {
      reads++;
      return read(id);
    };
    const { hits, rebuilt } = await store.search({ q: 'photosynthesis' });
    expect(rebuilt).toBe(false);
    expect(reads).toBe(0);
    expect(hits.filter((h) => h.kind === 'card')).toHaveLength(3);
  });

  it('a board changed while the index was not looking (crash, copied folder) is re-indexed', async () => {
    const [a] = await threeCanvases();
    await store.search({ q: 'x' });
    await store.close();
    // Append a valid event to the log by hand (as if written by a run whose index update was lost).
    const log = join(home, 'canvases', a!, 'board.jsonl');
    const lines = readFileSync(log, 'utf8').trim().split('\n');
    const last = JSON.parse(lines.at(-1)!) as { seq: number; ts: number };
    const card: Card = {
      id: 'c_HANDWRITTEN000000000000000',
      type: 'note',
      frameId: null,
      x: 0,
      y: 400,
      w: 200,
      h: 100,
      data: { title: 'Late', body: 'quokka sighting' },
      provenance: { kind: 'user', at: last.ts },
    };
    writeFileSync(
      log,
      `${lines.join('\n')}\n${JSON.stringify({ v: 1, seq: last.seq + 1, ts: last.ts + 1, type: 'card.added', actor: { kind: 'user' }, data: { card } })}\n`,
    );
    store = open();
    expect((await store.search({ q: 'quokka' })).hits.map((h) => h.itemId)).toEqual([card.id]);
  });
});

describe('damage and warm-up', () => {
  it('a damaged index.sqlite is deleted and rebuilt', async () => {
    const ids = await threeCanvases();
    await store.close();
    writeFileSync(join(home, INDEX_FILE), 'this is not a database, just bytes '.repeat(200));
    store = open();
    const { hits, rebuilt } = await store.search({ q: 'photosynthesis' });
    expect(rebuilt).toBe(true);
    expect(new Set(hits.filter((h) => h.kind === 'card').map((h) => h.canvasId))).toEqual(new Set(ids));
  });

  it('warmIndex builds the index in the background, before any search', async () => {
    await threeCanvases();
    expect(existsSync(join(home, INDEX_FILE))).toBe(false);
    store.warmIndex(1);
    await expect.poll(() => store.index!.rebuilds, { timeout: 5_000 }).toBe(1);
    // `rebuilds` counts when the warm-up run creates the file; wait for that same run to finish indexing (a sync
    // joins the run in flight), else a loaded machine lets the search below join it and report its rebuild.
    await store.index!.sync();
    expect(store.index!.rebuilds).toBe(1);
    const { rebuilt, hits } = await store.search({ q: 'zebra0' });
    expect(rebuilt).toBe(false);
    expect(hits).toHaveLength(1);
  });
});

describe('incremental updates', () => {
  it('follows adds, edits, notes, removals, frames, renames and undo', async () => {
    const meta = await store.create({ prompt: 'Tidal energy' });
    const added = await store.command(meta.id, {
      type: 'card.added',
      card: note('Barrage', 'lagoon turbines'),
    });
    const id = (added.data as { card: Card }).card.id;
    expect((await store.search({ q: 'lagoon' })).hits.map((h) => h.itemId)).toEqual([id]);

    await store.command(meta.id, {
      type: 'card.updated',
      id,
      patch: { data: { title: 'Barrage', body: 'stream turbines' } },
    });
    expect((await store.search({ q: 'lagoon' })).hits).toEqual([]);
    expect((await store.search({ q: 'stream' })).hits.map((h) => h.itemId)).toEqual([id]);

    await store.command(meta.id, { type: 'card.updated', id, patch: { note: 'ask the harbour master' } });
    expect((await store.search({ q: 'harbour' })).hits.map((h) => h.itemId)).toEqual([id]);

    const frame = await store.command(meta.id, {
      type: 'frame.added',
      frame: { title: 'Orkney sites', color: 'sky', x: 0, y: 0, w: 400, h: 300 },
    });
    const fid = (frame.data as { frame: { id: string } }).frame.id;
    expect((await store.search({ q: 'orkney' })).hits.map((h) => [h.kind, h.itemId])).toEqual([
      ['frame', fid],
    ]);

    await store.rename(meta.id, 'Marine power');
    const titleHits = (await store.search({ q: 'marine' })).hits;
    expect(titleHits.map((h) => [h.kind, h.itemId, h.canvasTitle])).toEqual([
      ['canvas', meta.id, 'Marine power'],
    ]);

    await store.command(meta.id, { type: 'card.removed', ids: [id] });
    expect((await store.search({ q: 'stream' })).hits).toEqual([]);
    await store.userCommand(meta.id, { type: 'undo' });
    expect((await store.search({ q: 'stream' })).hits.map((h) => h.itemId)).toEqual([id]);
  });

  it('writes incremental changes without waiting for a search', async () => {
    const meta = await store.create({ prompt: 'Lichen' });
    await store.search({ q: 'x' }); // index exists and knows the canvas
    await store.command(meta.id, { type: 'card.added', card: note('Symbiosis', 'algae and fungi') });
    await new Promise((r) => setTimeout(r, 60)); // > indexFlushMs
    // Read the file directly with a second connection: the row is there.
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(home, INDEX_FILE), { readOnly: true });
    try {
      const rows = db.prepare("SELECT title FROM items WHERE items MATCH 'algae'").all() as {
        title: string;
      }[];
      expect(rows.map((r) => r.title)).toEqual(['Symbiosis']);
    } finally {
      db.close();
    }
  });

  it('drops canvases whose folder is gone', async () => {
    const [a, b] = await threeCanvases();
    await store.search({ q: 'x' });
    await store.close();
    rmSync(join(home, 'canvases', a!), { recursive: true });
    store = open();
    const ids = (await store.search({ q: 'photosynthesis' })).hits.map((h) => h.canvasId);
    expect(ids).not.toContain(a);
    expect(ids).toContain(b);
  });
});

describe('query and text helpers', () => {
  it('quotes every word as a prefix term (FTS5 operators are plain text)', () => {
    expect(ftsQuery('heat pumps')).toBe('"heat"* "pumps"*');
    expect(ftsQuery('NOT a OR "b" NEAR(c)')).toBe('"NOT"* "a"* "OR"* "b"* "NEAR"* "c"*');
    expect(ftsQuery('  -- ** ')).toBeNull();
  });

  it('survives hostile queries', async () => {
    await threeCanvases();
    for (const q of ['"', "'; DROP TABLE items; --", 'a*b', '(', 'NEAR/3', '^x']) {
      await expect(store.search({ q })).resolves.toMatchObject({ hits: expect.any(Array) });
    }
  });

  it('indexes table cells, file names, notes and why', () => {
    const base = {
      id: 'c_X',
      frameId: null,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      provenance: { kind: 'user' as const, at: 0 },
    };
    const table = cardText({
      ...base,
      type: 'table',
      data: { title: 'Scores', columns: ['name', 'score'], rows: [['ada', '9']], totalRows: 1 },
    });
    expect(table.title).toBe('Scores');
    expect(table.body).toContain('name score');
    expect(table.body).toContain('ada 9');
    const file = cardText({
      ...base,
      type: 'file',
      why: 'primary source',
      note: 'read p. 4',
      data: {
        title: 'Attention',
        pages: 3,
        asset: { path: 'assets/a.pdf', name: 'attention-is-all.pdf', mime: 'application/pdf', size: 10 },
      },
    });
    expect(file.body).toContain('attention-is-all.pdf');
    expect(file.body).toContain('read p. 4');
    expect(file.body).toContain('primary source');
  });

  it('validates search arguments', async () => {
    await expect(store.search({ q: '' })).rejects.toMatchObject({ code: 'orb/invalid-args' });
    await expect(store.search({ q: 'x', limit: 0 })).rejects.toMatchObject({ code: 'orb/invalid-args' });
  });

  it('marks are plain text when stripped', async () => {
    await threeCanvases();
    const hit = (await store.search({ q: 'zebra2' })).hits[0]!;
    expect(plain(hit.snippet)).toContain('zebra2 marker text');
  });
});
