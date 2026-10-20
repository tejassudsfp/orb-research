/**
 * P6.11: a v2 template instantiated on a fresh canvas. Every frame, seed card and database the spec declares exists;
 * the datasets have their schemas and views; the seeds are the user's (not undoable) but flagged `seed` so agents'
 * layout may still move them; frames do not overlap and every seed sits inside its frame; the intake and the depth
 * tier are kept in canvas.json and the intake is validated.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CanvasMeta,
  Dataset,
  DatabaseData,
  ChartData,
  TEMPLATE_SPECS,
  activeView,
  applyView,
  cardDataSchema,
  columnTypeOf,
  isPinned,
  specOf,
  type BoardEvent,
  type Card,
} from '@orb/shared';
import { BOARD_FILE, CANVAS_FILE, CanvasStore } from '../src/index.js';
import { planTemplate } from '../src/templatePlan.js';
import { SAMPLE_INTAKE } from '../../shared/test/businessIntakes.js';
import { sampleIntake } from './sampleIntake.js';

let home: string;
let store: CanvasStore;
const clock = Date.UTC(2026, 9, 15, 12);
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'orb-templates-'));
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

const baseIntake = {
  company: 'Acme Robotics',
  website: 'acme.com',
  stage: 'Series A',
  round_amount: '$12M',
  thesis: 'Warehouse robots that pay back in a year',
  concerns: 'Hardware margins and one big customer',
  founders: 'Ada Lovelace, https://linkedin.com/in/ada',
  sites: ['crunchbase.com'],
  depth: 'standard',
};

describe.each(TEMPLATE_SPECS.map((s) => [s.id] as const))('template %s on a fresh canvas', (id) => {
  const spec = specOf(id)!;
  // P6.14: each business template has its own sample intake; the others use the VC one or a minimal one from the spec.
  const intake: Record<string, string | string[]> =
    (SAMPLE_INTAKE as Record<string, Record<string, string | string[]>>)[id] ??
    (id === 'vc-dd' ? baseIntake : sampleIntake(spec));
  const field = spec.inputs[0]!.id;
  const subject = String(intake[field]);

  it('puts every frame, seed card and database on the board', async () => {
    const meta = await store.create({
      prompt: `${subject}: research`,
      template: id,
      intake,
      depth: 'standard',
    });
    const board = await store.board(meta.id);
    const frames = board.frames();
    expect(frames.map((f) => f.title)).toEqual(spec.frames.map((f) => f.title));
    expect(frames.map((f) => f.color)).toEqual(spec.frames.map((f) => f.color));
    const cards = board.cards();
    const total = spec.frames.reduce((n, f) => n + f.seeds.length, 0);
    expect(cards).toHaveLength(total);
    spec.frames.forEach((f, i) => {
      const mine = cards.filter((c) => c.frameId === frames[i]!.id);
      expect(mine.map((c) => c.type)).toEqual(f.seeds.map((s) => s.type));
    });
    // A database card per database, its dataset on disk with the schema.
    for (const d of spec.databases) {
      const frame = frames[spec.frames.findIndex((f) => f.id === d.frame)]!;
      const card = cards.find(
        (c) =>
          c.frameId === frame.id &&
          c.type === 'database' &&
          (c.data as { title: string }).title ===
            (spec.frames.find((f) => f.id === d.frame)!.seeds.find((s) => s.db === d.key)!.data.title ??
              d.name),
      )!;
      expect(card, d.name).toBeTruthy();
      const data = DatabaseData.parse(card.data);
      const ds = Dataset.parse(
        JSON.parse(
          readFileSync(join(home, 'canvases', meta.id, 'assets', 'data', `${data.datasetId}.json`), 'utf8'),
        ),
      );
      expect(ds.name).toBe(d.name);
      expect(ds.columns.map((c) => c.name)).toEqual(d.columns.map((c) => c.name));
      expect(ds.columns.map((c) => c.type)).toEqual(d.columns.map((c) => columnTypeOf(c.type)));
      for (const c of d.columns)
        if (c.type === 'enum') expect(ds.columns.find((x) => x.name === c.name)!.options).toEqual(c.options);
      expect(card.view!.views.map((v) => [v.name, v.kind])).toEqual(d.views.map((v) => [v.name, v.kind]));
      expect(card.view!.datasetId).toBe(data.datasetId);
      expect(existsSync(join(home, 'canvases', meta.id, 'assets', 'data', `${data.datasetId}.txt`))).toBe(
        true,
      );
      // Every view runs against the (empty) dataset without error.
      for (const v of card.view!.views) expect(() => applyView(ds, v)).not.toThrow();
      expect(activeView(card.view!).id).toBe('v1');
    }
  });

  it("validates every seed card against its type's schema", async () => {
    const meta = await store.create({ prompt: 'Acme', template: id, intake });
    for (const c of (await store.board(meta.id)).cards()) {
      const parsed = cardDataSchema(c.type).safeParse(c.data);
      expect(parsed.success, `${c.type} ${JSON.stringify(c.data).slice(0, 80)}`).toBe(true);
    }
  });

  it('binds each chart seed to its database, empty and without a crash', async () => {
    const meta = await store.create({ prompt: 'Acme', template: id, intake });
    const charts = (await store.board(meta.id)).cards().filter((c) => c.type === 'chart');
    for (const c of charts) {
      const d = ChartData.parse(c.data);
      expect(d.source.kind).toBe('dataset');
      expect(d.points).toEqual([]);
      expect(d.problem).toMatch(/no rows/);
    }
  });

  it("seeds are the user's, flagged seed, outside the undo stack, and not pinned for agents' layout", async () => {
    const meta = await store.create({ prompt: 'Acme', template: id, intake });
    const log = events(meta.id);
    expect(log.every((e) => e.actor.kind === 'user')).toBe(true);
    expect(await store.history(meta.id)).toEqual({ undo: 0, redo: 0 });
    for (const c of (await store.board(meta.id)).cards()) {
      expect(c.seed).toBe(true);
      expect(c.provenance.kind).toBe('user');
      expect(isPinned(c)).toBe(false);
    }
  });

  it('lays the frames out without overlap and every seed inside its frame without overlapping another', async () => {
    const meta = await store.create({ prompt: 'Acme', template: id, intake });
    const board = await store.board(meta.id);
    const frames = board.frames();
    for (const [i, a] of frames.entries())
      for (const b of frames.slice(i + 1))
        expect(
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y,
          `${a.title} / ${b.title}`,
        ).toBe(true);
    const cards = board.cards();
    for (const c of cards) {
      const f = frames.find((x) => x.id === c.frameId)!;
      expect(
        c.x >= f.x && c.y >= f.y && c.x + c.w <= f.x + f.w && c.y + c.h <= f.y + f.h,
        `${c.type} in ${f.title}`,
      ).toBe(true);
    }
    for (const [i, a] of cards.entries())
      for (const b of cards.slice(i + 1))
        expect(
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y,
          `${a.type} / ${b.type}`,
        ).toBe(true);
  });

  it('keeps room for materials in the first frame', async () => {
    const plan = planTemplate(spec);
    const first = plan.frames[0]!;
    const bottom = Math.max(...plan.seeds.filter((s) => s.frameIndex === 0).map((s) => s.rect.y + s.rect.h));
    expect(first.y + first.h - bottom).toBeGreaterThanOrEqual(spec.frames[0]!.room);
  });

  it('fills the intake into the seeds', async () => {
    const meta = await store.create({ prompt: 'Acme', template: id, intake });
    const text = JSON.stringify((await store.board(meta.id)).cards().map((c) => c.data));
    expect(text).toContain(subject);
    expect(text).not.toContain('{{');
    expect(text).toContain('2026'); // the date tokens
  });

  it('keeps the intake and depth in canvas.json, and a scripted caller with no form gets the prompt as the subject', async () => {
    const meta = await store.create({
      prompt: `${subject}: research`,
      template: id,
      intake,
      depth: 'deep',
    });
    const stored = CanvasMeta.parse(
      JSON.parse(readFileSync(join(home, 'canvases', meta.id, CANVAS_FILE), 'utf8')),
    );
    expect(stored).toMatchObject({ template: id, depth: 'deep', brief: spec.brief });
    expect(stored.intake).toMatchObject({
      [field]: subject,
      ...(id === 'vc-dd' ? { website: 'https://acme.com', stage: 'Series A' } : {}),
    });
    const bare = await store.create({ prompt: 'Globex', template: id });
    expect(bare).toMatchObject({ depth: 'standard', intake: { [field]: 'Globex' } });
  });

  it('refuses an invalid intake and leaves no canvas behind', async () => {
    await expect(
      store.create({ prompt: 'x', template: id, intake: { [field]: '', website: 'nope' } }),
    ).rejects.toThrow(/intake is not valid/);
    expect(await store.list()).toEqual([]);
  });

  it('survives a reopen exactly', async () => {
    const meta = await store.create({ prompt: 'Acme', template: id, intake });
    const before: Card[] = (await store.board(meta.id)).cards();
    await store.close();
    store = new CanvasStore({ home, now: () => clock });
    expect((await store.board(meta.id)).cards()).toEqual(before);
  });
});

describe('a v1 template is unchanged', () => {
  it('has no intake, depth or seed cards', async () => {
    const meta = await store.create({ prompt: 'Acme', template: 'topic' });
    expect(meta.intake).toBeUndefined();
    expect(meta.depth).toBeUndefined();
    expect((await store.board(meta.id)).cards()).toEqual([]);
  });
});
