/**
 * Contract test (P2.6 Home) on a REAL sidecar (dsh under Electron-as-Node, temp homes, mock LLM, no model calls):
 *   - Done-when: `orb/canvas.search` returns cards across 3 canvases, and deleting `<ORB_HOME>/index.sqlite` triggers
 *     a rebuild (node:sqlite FTS5 inside the sidecar's Node 24);
 *   - the index is kept up to date incrementally while the sidecar runs, and survives a sidecar restart;
 *   - `canvas.create` with a template prefills its frames; `canvas.list` returns tiles with previews and status;
 *   - `settings.get/set` read and write orb.json (no secrets).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockedSidecar, type MockedSidecar } from '../../../scripts/testkit/index.ts';
import { createWire, WireError, type Wire } from '../src/wire/index.js';

let dir: string;
let sc: MockedSidecar | undefined;
let wire: Wire;

async function boot() {
  sc = await startMockedSidecar({ homeDir: dir });
  wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 } },
  );
}
async function shutdown() {
  wire?.dispose();
  await sc?.stop();
  sc = undefined;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'orb-home-contract-'));
  await boot();
});
afterAll(async () => {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
});

const indexPath = () => join(sc!.paths.orbHome, 'index.sqlite');
const note = (title: string, body: string) => ({
  type: 'card.added' as const,
  card: { type: 'note' as const, x: 0, y: 0, w: 200, h: 120, data: { title, body } },
});

describe('orb/canvas.search (index.sqlite)', () => {
  const ids: string[] = [];

  it('returns cards across 3 canvases', async () => {
    for (const topic of ['Kelp forests', 'Rice paddies', 'Desert succulents']) {
      const meta = await wire.orb.canvas.create({ prompt: topic });
      ids.push(meta.id);
      await wire.orb.board.command(
        meta.id,
        note(`${topic} light`, `photosynthesis in ${topic.toLowerCase()}`),
      );
      await wire.orb.board.command(meta.id, note('Other', 'unrelated words'));
    }
    const { hits } = await wire.orb.canvas.search({ q: 'photosynthesis' });
    const cards = hits.filter((h) => h.kind === 'card');
    expect(cards).toHaveLength(3);
    expect(new Set(cards.map((h) => h.canvasId))).toEqual(new Set(ids));
    expect(cards.every((h) => h.cardType === 'note' && h.itemId.startsWith('c_'))).toBe(true);
    expect(existsSync(indexPath())).toBe(true);
  });

  it('deleting index.sqlite triggers a rebuild', async () => {
    rmSync(indexPath());
    const { hits, rebuilt } = await wire.orb.canvas.search({ q: 'photosynthesis' });
    expect(rebuilt).toBe(true);
    expect(existsSync(indexPath())).toBe(true);
    expect(new Set(hits.filter((h) => h.kind === 'card').map((h) => h.canvasId))).toEqual(new Set(ids));
    expect((await wire.orb.canvas.search({ q: 'photosynthesis' })).rebuilt).toBe(false);
  });

  it('follows edits incrementally and survives a sidecar restart', async () => {
    const { events } = await wire.orb.board.command(ids[0]!, note('Late', 'quokka census'));
    const id = (events[0]!.data as { card: { id: string } }).card.id;
    expect((await wire.orb.canvas.search({ q: 'quokka' })).hits.map((h) => h.itemId)).toEqual([id]);
    await wire.orb.board.command(ids[0]!, { type: 'card.removed', ids: [id] });
    expect((await wire.orb.canvas.search({ q: 'quokka' })).hits).toEqual([]);

    await shutdown();
    await boot();
    const after = await wire.orb.canvas.search({ q: 'photosynthesis' });
    expect(after.rebuilt).toBe(false);
    expect(after.hits.filter((h) => h.kind === 'card')).toHaveLength(3);
  });

  it('validates the request', async () => {
    const err = await wire.call('orb', 'canvas.search', { request: { q: '' } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WireError);
    expect((err as WireError).code).toBe('orb/invalid-args');
  });
});

describe('templates, tiles and settings', () => {
  it('a template canvas starts with its frames; canvas.list shows them in the tile preview', async () => {
    const meta = await wire.orb.canvas.create({ prompt: 'Acme', template: 'topic' });
    expect(meta).toMatchObject({ template: 'topic', brief: expect.stringContaining('topic') });
    const tile = (await wire.orb.canvas.list()).find((c) => c.id === meta.id)!;
    expect(tile.preview.frames.map((f) => f.color)).toEqual(['signal', 'sky', 'rho', 'sky', 'paper']);
    expect(tile.status).toEqual({ working: 0, label: 'Idle' });
    expect((await wire.orb.canvas.search({ q: 'evidence' })).hits).toEqual([
      expect.objectContaining({ canvasId: meta.id, kind: 'frame', title: 'Evidence' }),
    ]);
  });

  it('settings persist in orb.json', async () => {
    // P4.3: orb-cost seeds the price table from the pi-ai catalog at start (gpt-6-luna among it).
    await expect
      .poll(async () => (await wire.orb.settings.get()).prices['openai/gpt-6-luna']?.source, {
        timeout: 10_000,
      })
      .toBe('catalog');
    const before = await wire.orb.settings.get();
    expect(before).toMatchObject({
      v: 1,
      theme: 'night',
      customProviders: [],
      modelCatalogs: {},
      firstRunDone: false,
      models: {},
    });
    expect(before.prices['openai/gpt-6-luna']).toMatchObject({ source: 'catalog', input: 0.1, output: 0.5 });
    await wire.orb.settings.set({ theme: 'day' });
    // P5.3: the motion choice goes through the same wire.
    expect((await wire.orb.settings.set({ motion: 'reduce' })).motion).toBe('reduce');
    await wire.orb.settings.set({ motion: 'system' });
    expect(JSON.parse(readFileSync(join(sc!.paths.orbHome, 'orb.json'), 'utf8'))).toEqual({
      v: 1,
      theme: 'day',
      appearance: { themeId: 'studio', accent: 'blue', mode: 'light' },
      motion: 'system',
      customProviders: [],
      modelCatalogs: {},
      firstRunDone: false,
      models: {},
      prices: before.prices,
      keyTests: {},
    });
    const bad = await wire
      .call('orb', 'settings.set', { request: { theme: 'day', apiKey: 'x' } })
      .catch((e: unknown) => e);
    expect((bad as WireError).code).toBe('orb/invalid-args');
  });
});
