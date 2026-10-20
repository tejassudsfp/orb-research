/**
 * P6.8 progressive disclosure against a real CanvasStore with 300 cards: `board_map` (budget, incremental frame
 * digests), `search_board` (FTS index and the scan behind it), `read_card` (pages), the paginated `query_board`, and the
 * hard cap on any board tool's result. The sidecar-level proof (every model request under budget, map → search → read)
 * is apps/ui/test/scale.contract.test.ts.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Actor } from '@orb/shared';
import { CanvasStore } from '../src/store.js';
import {
  READ_PAGE_CHARS,
  RESULT_BUDGET_CHARS,
  TOOL_RESULT_HARD_CAP_CHARS,
  capText,
  paginate,
  scanBoard,
  themesOf,
} from '../src/scale.js';
import {
  boardMapTool,
  queryBoard,
  readCardTool,
  searchBoardTool,
  type BoardToolExec,
} from '../src/tools.js';

let home: string;
let store: CanvasStore;
let canvasId: string;
let frames: string[] = [];
let cards: string[] = [];

const orb: Extract<Actor, { kind: 'agent' }> = { kind: 'agent', agent: 'orb', model: 'm', sessionId: 'orb-s' };
const exec = (): BoardToolExec => ({
  callId: 'c',
  signal: new AbortController().signal,
  agent: { id: 'orb-s', options: { provider: 'openai', model: 'm' }, session: { header: { cwd: store.dirOf(canvasId) } } },
});
const json = async (p: Promise<unknown>) => JSON.parse(JSON.stringify(await p)) as any;
const NEEDLE = 'Zorbax-9 sintering yield reached 41.7 percent';

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-scale-'));
  store = new CanvasStore({ home, flushMs: 5, indexFlushMs: 5 });
  canvasId = (await store.create({ prompt: 'Big board' })).id;
  await store.setRootSession(canvasId, 'orb-s');
  frames = [];
  cards = [];
  const topics = ['battery', 'solar', 'wind', 'grid', 'hydrogen', 'nuclear', 'storage', 'carbon'];
  for (let i = 0; i < 20; i++) frames.push((await store.addAgentFrame(canvasId, { title: `Theme ${i + 1} ${topics[i % 8]}` }, orb)).frame.id);
  const long = (i: number) => Array.from({ length: 12 }, (_, p) => `Part ${p} of note ${i}. ${'Background about the market. '.repeat(40)}`).join('\n\n');
  const board = await store.board(canvasId);
  for (let i = 0; i < 300; i++) {
    const frameId = frames[i % 20]!;
    const topic = topics[i % 8];
    const input =
      i % 3 === 0
        ? { type: 'doc' as const, data: { title: `Brief ${i} on ${topic}`, body: i === 120 ? `${long(i)}\n\n${NEEDLE}. ${'End. '.repeat(100)}` : long(i) } }
        : i % 3 === 1
          ? { type: 'source' as const, data: { url: `https://example.org/${topic}/${i}`, title: `Report ${i} on ${topic}`, summary: `What report ${i} says about ${topic}. ${'More. '.repeat(40)}` } }
          : { type: 'question' as const, data: { title: `Question ${i}: does ${topic} scale?`, body: 'Open.' } };
    // 15 cards per frame: past the agents' budget of 12, as a user's own additions would be
    const ev = await store.command(canvasId, { type: 'card.added', card: { ...input, frameId, x: (i % 5) * 300, y: Math.floor(i / 20) * 40, w: 280, h: 200 } as never }, i % 4 === 0 ? { kind: 'user' } : orb);
    cards.push((ev.data as { card: { id: string } }).card.id);
  }
  expect(Object.keys(board.current.cards)).toHaveLength(300);
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

describe('board_map', () => {
  it('shows 20 frames and 300 cards in one screen under the budget, with digests and top titles', async () => {
    const out = await json(boardMapTool(store, {}, exec()));
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(RESULT_BUDGET_CHARS);
    expect(out.board).toMatchObject({ cards: 300, frames: 20 });
    expect(out.frames).toHaveLength(20);
    for (const f of out.frames) {
      expect(f.cards).toBe(15);
      expect(f.digest).toMatch(/themes|top:/);
      expect(f.types).toBeTypeOf('object');
    }
    expect(out.hint).toMatch(/board_map \{frameId\}/);
    // the cards are named by ids the agent can use next
    expect(JSON.stringify(out)).toMatch(/c_[0-9A-Z]{20,}/);
  });

  it('zooms into a frame (paged) and refuses an unknown one', async () => {
    const page = await json(boardMapTool(store, { frameId: frames[0], limit: 6 }, exec()));
    expect(page.frame).toMatchObject({ id: frames[0], cards: 15 });
    expect(page.cards).toHaveLength(6);
    expect(page).toMatchObject({ more: 9, nextOffset: 6 });
    const rest = await json(boardMapTool(store, { frameId: frames[0], offset: 6, limit: 60 }, exec()));
    expect(rest.cards).toHaveLength(9);
    expect(rest.more).toBeUndefined();
    await expect(boardMapTool(store, { frameId: 'f_nope' }, exec())).rejects.toThrow(/no frame/);
  });

  it('shrinks to fit when the board is far bigger (more frames than fit says so)', async () => {
    // (an agent may add 24 frames at most; the user can draw more)
    for (let i = 20; i < 40; i++)
      await store.command(canvasId, { type: 'frame.added', frame: { title: `Extra theme with a rather long title number ${i}`, color: 'sky', x: i * 500, y: 5000, w: 400, h: 300 } }, { kind: 'user' });
    const out = await json(boardMapTool(store, {}, exec()));
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(RESULT_BUDGET_CHARS);
    expect(out.frames.length + (out.more ?? 0)).toBe(40);
  });

  it('digests are incremental: only a frame whose cards changed is recomputed', async () => {
    await boardMapTool(store, {}, exec());
    expect(store.mapCache.stats).toEqual({ computed: 20, reused: 0 });
    await boardMapTool(store, {}, exec());
    expect(store.mapCache.stats).toEqual({ computed: 20, reused: 20 });
    // one card changes in one frame
    await store.command(canvasId, { type: 'card.updated', id: cards[5]!, patch: { badge: 'must' } }, { kind: 'user' });
    await boardMapTool(store, {}, exec());
    expect(store.mapCache.stats).toEqual({ computed: 21, reused: 39 });
    // a new card in one frame
    await store.command(canvasId, { type: 'card.added', card: { type: 'note', frameId: frames[3]!, x: 5, y: 5, w: 200, h: 120, data: { title: 'One more', body: 'b' } } }, { kind: 'user' });
    await boardMapTool(store, {}, exec());
    expect(store.mapCache.stats).toEqual({ computed: 22, reused: 58 });
    // a rename of a frame
    await store.updateAgentFrame(canvasId, frames[9]!, { title: 'Renamed' }, orb);
    const out = await json(boardMapTool(store, {}, exec()));
    expect(store.mapCache.stats.computed).toBe(23);
    expect(out.frames.find((f: { id: string }) => f.id === frames[9])).toMatchObject({ title: 'Renamed' });
  });
});

describe('search_board and read_card', () => {
  it('finds the needle in the middle of a long document, and read_card pages to it', async () => {
    const hits = await json(searchBoardTool(store, { q: 'Zorbax sintering yield' }, exec()));
    expect(hits.hits).toHaveLength(1);
    expect(hits.hits[0]).toMatchObject({ id: cards[120], type: 'doc' });
    expect(hits.hits[0].snippet).toContain('«');
    expect(JSON.stringify(hits).length).toBeLessThanOrEqual(RESULT_BUDGET_CHARS);

    let found = '';
    let pages = 0;
    for (let page = 1; page < 40 && !found; page++) {
      const out = await json(readCardTool(store, { cardId: cards[120], page }, exec()));
      expect(out.text.length).toBeLessThanOrEqual(READ_PAGE_CHARS);
      pages = out.pages;
      if (out.text.includes(NEEDLE)) found = out.text;
      else expect(out.more).toBe(true);
    }
    expect(found).toContain(NEEDLE);
    expect(pages).toBeGreaterThan(1);
    // the last page says nothing is left; a page past the end is the last page
    const last = await json(readCardTool(store, { cardId: cards[120], page: 999 }, exec()));
    expect(last.page).toBe(pages);
    expect(last.more).toBeUndefined();
    await expect(readCardTool(store, { cardId: 'c_nope' }, exec())).rejects.toThrow(/no card/);
  });

  it('pages and filters hits; the scan gives the same answer when the index is off', async () => {
    const all = await json(searchBoardTool(store, { q: 'report', types: ['source'], limit: 5 }, exec()));
    expect(all.hits).toHaveLength(5);
    expect(all.more).toBeGreaterThan(0);
    expect(all.hits.every((h: { type: string }) => h.type === 'source')).toBe(true);
    const next = await json(searchBoardTool(store, { q: 'report', types: ['source'], limit: 5, offset: all.nextOffset }, exec()));
    expect(next.hits.map((h: { id: string }) => h.id)).not.toEqual(all.hits.map((h: { id: string }) => h.id));
    const inFrame = await json(searchBoardTool(store, { q: 'report', frameId: frames[1] }, exec()));
    expect(inFrame.hits.length).toBeGreaterThan(0);
    for (const h of inFrame.hits) expect(h.frameId).toBe(frames[1]);
    expect((await json(searchBoardTool(store, { q: 'nothing matches this xyzzy' }, exec()))).hint).toMatch(/no card matches/);

    const scanned = scanBoard((await store.board(canvasId)).current, 'Zorbax sintering yield');
    expect(scanned.map((h) => h.id)).toEqual([cards[120]]);
    expect(scanned[0]!.snippet).toContain('Zorbax');
  });

  it('works with the index off (a scan of the board)', async () => {
    const plain = new CanvasStore({ home, flushMs: 5, searchIndex: false });
    try {
      const ex: BoardToolExec = { callId: 'c', signal: new AbortController().signal, agent: { id: 'orb-s', options: { provider: 'openai', model: 'm' }, session: { header: { cwd: plain.dirOf(canvasId) } } } };
      const hits = await json(searchBoardTool(plain, { q: 'Zorbax' }, ex));
      expect(hits.hits.map((h: { id: string }) => h.id)).toEqual([cards[120]]);
    } finally {
      await plain.close();
    }
  });
});

describe('query_board and the hard cap', () => {
  it('pages through all 300 cards, each page under the budget', async () => {
    const seen = new Set<string>();
    let offset = 0;
    let pages = 0;
    for (; pages < 40; pages++) {
      const out = await json(queryBoard(store, { limit: 50, offset }, exec()));
      expect(JSON.stringify(out).length).toBeLessThanOrEqual(RESULT_BUDGET_CHARS);
      for (const c of out.cards) seen.add(c.id);
      if (!out.more) break;
      offset = out.nextOffset;
    }
    expect(seen.size).toBe(300);
    expect(pages).toBeGreaterThan(5); // the 16k budget cuts a 50-card page short
  });

  it('capText marks a cut and keeps small results as they are', () => {
    expect(capText('short')).toBe('short');
    const cut = capText('x'.repeat(TOOL_RESULT_HARD_CAP_CHARS + 100));
    expect(cut.length).toBeLessThan(TOOL_RESULT_HARD_CAP_CHARS + 200);
    expect(cut).toContain('[result cut at');
  });

  it('paginate breaks at line ends and loses nothing', () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i} ${'x'.repeat(300)}`).join('\n');
    const pages = paginate(text, 2000);
    expect(pages.every((p) => p.length <= 2000)).toBe(true);
    expect(pages.join('\n').replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
    expect(paginate('tiny')).toEqual(['tiny']);
  });

  it('themesOf names what several titles share', () => {
    expect(themesOf(['Battery cost trends', 'Battery supply chain', 'Solar cost', 'Wind farms'])).toEqual(['battery', 'cost']);
  });
});
