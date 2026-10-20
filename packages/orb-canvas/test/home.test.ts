/** P2.6 Home pieces of the canvas service: templates, seeds, tile previews and orb.json settings. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CanvasMeta, TEMPLATES, TemplateId, templateFrames, templateOf, type BoardEvent } from '@orb/shared';
import { BOARD_FILE, CANVAS_FILE, CanvasStore, SETTINGS_FILE, SettingsStore } from '../src/index.js';

let home: string;
let store: CanvasStore;
let clock = Date.UTC(2026, 9, 14, 12);
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'orb-home-'));
  store = new CanvasStore({ home, now: () => clock });
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

const events = (id: string): BoardEvent[] =>
  readFileSync(join(home, 'canvases', id, BOARD_FILE), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BoardEvent);

describe('templates', () => {
  it('defines the five PRD templates and the v2 ones, each with frames and a brief', () => {
    // The v1 "Stocks" chip was merged into "Public equity" (P6.12); P6.13 upgraded company, gtm and ui in place.
    const labels = TEMPLATES.map((t) => t.label);
    expect(labels.slice(0, 2)).toEqual(['Topic deep dive', 'VC due diligence']);
    expect(labels).not.toContain('Stocks');
    expect(labels).toEqual(
      expect.arrayContaining([
        'Public equity',
        'Company research',
        'GTM plan',
        'Product teardown',
        'Competitive analysis',
      ]),
    );
    expect([...TEMPLATES.map((t) => t.id)].sort()).toEqual(
      TemplateId.options.filter((id) => id !== 'stocks').sort(),
    );
    for (const t of TEMPLATES) {
      expect(t.frames.length).toBeGreaterThanOrEqual(3);
      expect(t.brief.length).toBeGreaterThan(40);
      const frames = templateFrames(t.id);
      // No two frames overlap.
      for (const [i, a] of frames.entries())
        for (const b of frames.slice(i + 1))
          expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }
    expect(templateOf('stocks').brief).toMatch(/no live market data/i);
  });

  it('a canvas created from a template starts with its frames (user, not undoable) and keeps the brief', async () => {
    const meta = await store.create({ prompt: 'Acme Corp', template: 'topic' });
    expect(meta).toMatchObject({ template: 'topic', brief: templateOf('topic').brief });
    expect(
      CanvasMeta.parse(JSON.parse(readFileSync(join(home, 'canvases', meta.id, CANVAS_FILE), 'utf8'))),
    ).toEqual(meta);
    const log = events(meta.id);
    expect(log.map((e) => e.type)).toEqual(Array(5).fill('frame.added'));
    expect(log.map((e) => (e.data as { frame: { title: string } }).frame.title)).toEqual([
      'Thesis',
      'Background',
      'Key questions',
      'Evidence',
      'Open questions',
    ]);
    expect(log.every((e) => e.actor.kind === 'user')).toBe(true);
    expect(await store.history(meta.id)).toEqual({ undo: 0, redo: 0 });
    const board = await store.board(meta.id);
    expect(board.frames().map(({ x, y, w, h, color, title }) => ({ x, y, w, h, color, title }))).toEqual(
      templateFrames('topic'),
    );
  });

  it('refuses an unknown template', async () => {
    await expect(store.create({ prompt: 'x', template: 'nope' as never })).rejects.toThrow();
  });

  it('keeps the seed description in canvas.json', async () => {
    const meta = await store.create({ prompt: 'Attention', seed: { kind: 'file', name: 'Attention.pdf' } });
    expect(meta.seed).toEqual({ kind: 'file', name: 'Attention.pdf', count: 1 });
    expect((await store.open(meta.id)).seed).toEqual(meta.seed);
  });
});

describe('tile previews', () => {
  it('lists canvases most recently changed first, with frames as coloured rects and card counts', async () => {
    const a = await store.create({ prompt: 'Alpha', template: 'topic' });
    clock += 1000;
    const b = await store.create({ prompt: 'Beta' });
    clock += 1000;
    await store.command(a.id, {
      type: 'card.added',
      card: { type: 'note', x: 0, y: 0, w: 100, h: 80, data: { text: 'n' } },
    });
    const list = await store.summaries();
    expect(list.map((c) => c.id)).toEqual([a.id, b.id]);
    expect(list[0]!.preview).toMatchObject({ cardCount: 1, updated: clock });
    expect(list[0]!.preview.frames.map((f) => f.color)).toEqual(
      templateOf('topic').frames.map((f) => f.color),
    );
    expect(list[1]!.preview).toEqual({ frames: [], cards: [], cardCount: 0, updated: b.created });
  });

  it('reads boards that are not open without opening them (and caches by file size)', async () => {
    const a = await store.create({ prompt: 'Alpha', template: 'topic' });
    await store.close();
    store = new CanvasStore({ home, now: () => clock });
    const [tile] = await store.summaries();
    expect(tile!.preview.frames).toHaveLength(5);
    expect((store as unknown as { boards: Map<string, unknown> }).boards.has(a.id)).toBe(false);
  });
});

describe('orb.json settings', () => {
  it('defaults to night, persists the theme, and never stores anything else', async () => {
    expect(await store.settings.get()).toEqual({
      v: 1,
      theme: 'night',
      appearance: { themeId: 'studio', accent: 'blue', mode: 'system' },
      motion: 'system',
      customProviders: [],
      modelCatalogs: {},
      firstRunDone: false,
      models: {},
      prices: {},
      keyTests: {},
    });
    expect(await store.settings.set({ theme: 'day' })).toEqual({
      v: 1,
      theme: 'day',
      appearance: { themeId: 'studio', accent: 'blue', mode: 'light' },
      motion: 'system',
      customProviders: [],
      modelCatalogs: {},
      firstRunDone: false,
      models: {},
      prices: {},
      keyTests: {},
    });
    expect(JSON.parse(readFileSync(join(home, SETTINGS_FILE), 'utf8'))).toEqual({
      v: 1,
      theme: 'day',
      appearance: { themeId: 'studio', accent: 'blue', mode: 'light' },
      motion: 'system',
      customProviders: [],
      modelCatalogs: {},
      firstRunDone: false,
      models: {},
      prices: {},
      keyTests: {},
    });
    expect(await new SettingsStore(home).get()).toEqual({
      v: 1,
      theme: 'day',
      appearance: { themeId: 'studio', accent: 'blue', mode: 'light' },
      motion: 'system',
      customProviders: [],
      modelCatalogs: {},
      firstRunDone: false,
      models: {},
      prices: {},
      keyTests: {},
    });
    await expect(store.settings.set({ theme: 'dusk' })).rejects.toMatchObject({ code: 'orb/invalid-args' });
    await expect(store.settings.set({ apiKey: 'x' })).rejects.toMatchObject({ code: 'orb/invalid-args' });
    await expect(store.settings.set({})).rejects.toMatchObject({ code: 'orb/invalid-args' });
  });

  it('reads a damaged or foreign orb.json as defaults field by field', async () => {
    writeFileSync(join(home, SETTINGS_FILE), '{not json');
    expect(await store.settings.get()).toEqual({
      v: 1,
      theme: 'night',
      appearance: { themeId: 'studio', accent: 'blue', mode: 'system' },
      motion: 'system',
      customProviders: [],
      modelCatalogs: {},
      firstRunDone: false,
      models: {},
      prices: {},
      keyTests: {},
    });
    writeFileSync(join(home, SETTINGS_FILE), JSON.stringify({ theme: 'day', future: 1 }));
    expect(await store.settings.get()).toEqual({
      v: 1,
      theme: 'day',
      appearance: { themeId: 'studio', accent: 'blue', mode: 'light' },
      motion: 'system',
      customProviders: [],
      modelCatalogs: {},
      firstRunDone: false,
      models: {},
      prices: {},
      keyTests: {},
    });
    writeFileSync(join(home, SETTINGS_FILE), JSON.stringify({ theme: 7 }));
    expect(await store.settings.get()).toEqual({
      v: 1,
      theme: 'night',
      appearance: { themeId: 'studio', accent: 'blue', mode: 'system' },
      motion: 'system',
      customProviders: [],
      modelCatalogs: {},
      firstRunDone: false,
      models: {},
      prices: {},
      keyTests: {},
    });
  });

  it('P5.3: keeps the motion choice and refuses unknown values', async () => {
    expect((await store.settings.get()).motion).toBe('system');
    expect((await store.settings.set({ motion: 'reduce' })).motion).toBe('reduce');
    expect((await new SettingsStore(home).get()).motion).toBe('reduce');
    expect((await store.settings.set({ theme: 'day' })).motion).toBe('reduce');
    await expect(store.settings.set({ motion: 'fast' })).rejects.toMatchObject({ code: 'orb/invalid-args' });
    writeFileSync(join(home, SETTINGS_FILE), JSON.stringify({ motion: 'wobbly' }));
    expect((await store.settings.get()).motion).toBe('system');
  });

  it('P3.3: keeps a per-agent model map, merged per role, and refuses bad routes', async () => {
    const luna = { provider: 'openai', model: 'gpt-6-luna' };
    expect((await store.settings.get()).models).toEqual({});
    expect((await store.settings.set({ models: { scout: luna } })).models).toEqual({ scout: luna });
    const both = await store.settings.set({
      models: { critic: { provider: 'deepseek', model: 'deepseek-flash' } },
    });
    expect(both.models).toEqual({ scout: luna, critic: { provider: 'deepseek', model: 'deepseek-flash' } });
    expect(JSON.parse(readFileSync(join(home, SETTINGS_FILE), 'utf8')).models.scout).toEqual(luna);
    for (const models of [
      { analyst: luna },
      { orb: { provider: 'Open AI', model: 'x' } },
      { orb: { provider: 'openai', model: '' } },
      { orb: { provider: 'openai', model: 'x', apiKey: 'sk-x' } },
    ]) {
      await expect(store.settings.set({ models })).rejects.toMatchObject({ code: 'orb/invalid-args' });
    }
    // A damaged model entry reads as no entry (the harness default applies), the rest of the file is kept.
    writeFileSync(
      join(home, SETTINGS_FILE),
      JSON.stringify({ theme: 'day', models: { orb: { provider: 7 } } }),
    );
    expect(await store.settings.get()).toEqual({
      v: 1,
      theme: 'day',
      appearance: { themeId: 'studio', accent: 'blue', mode: 'light' },
      motion: 'system',
      customProviders: [],
      modelCatalogs: {},
      firstRunDone: false,
      models: {},
      prices: {},
      keyTests: {},
    });
  });

  it('serializes concurrent writes', async () => {
    await Promise.all([store.settings.set({ theme: 'day' }), store.settings.set({ theme: 'night' })]);
    expect((await store.settings.get()).theme).toBe('night');
  });
});
