/**
 * P6.17 `compose_slides` and the canvas service's `deck/` state, against a real CanvasStore (the dsh wiring and Orb's
 * compose turn are covered by apps/ui/test/deck.contract.test.ts): citations are enforced (an uncited slide and an
 * out-of-scope card are refused and nothing is written), slides persist to `deck/deck.json`, compose and regenerate jobs,
 * the slide view's edits, and the .pptx export (a zip in `exports/`, never overwriting an earlier one).
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Deck } from '@orb/shared';
import { composeSlides } from '../src/port.js';
import type { DeckEvent } from '../src/deckStore.js';
import { CanvasStore } from '../src/store.js';
import type { BoardToolExec } from '../src/tools.js';

let home: string;
let store: CanvasStore;
let canvasId: string;
const ids = {} as { frameA: string; frameB: string; a1: string; a2: string; b1: string };

const exec = (sessionId = 'orb-session-1'): BoardToolExec => ({
  callId: 'call_slides',
  signal: new AbortController().signal,
  agent: {
    id: sessionId,
    options: { provider: 'openai', model: 'gpt-6-luna' },
    session: { header: { cwd: store.dirOf(canvasId) } },
  },
});

async function frame(title: string, x: number): Promise<string> {
  const e = await store.command(canvasId, { type: 'frame.added', frame: { title, color: 'sky', x, y: 0, w: 600, h: 500 } });
  return (e.data as { frame: { id: string } }).frame.id;
}
async function note(frameId: string, text: string): Promise<string> {
  const e = await store.command(canvasId, {
    type: 'card.added',
    card: { type: 'note', frameId, x: 10, y: 10, w: 200, h: 120, data: { text } },
  } as never);
  return (e.data as { card: { id: string } }).card.id;
}
const deckFile = (name: string) => join(store.dirOf(canvasId), 'deck', name);
const storedDeck = (): Deck => JSON.parse(readFileSync(deckFile('deck.json'), 'utf8'));

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-deck-tool-'));
  store = new CanvasStore({ home, flushMs: 5, searchIndex: false });
  canvasId = (await store.create({ prompt: 'Deck board' })).id;
  await store.setRootSession(canvasId, 'orb-session-1');
  await store.setChildAgent(canvasId, 'scout', 'scout-session-1');
  ids.frameA = await frame('Market', 0);
  ids.frameB = await frame('Risks', 700);
  ids.a1 = await note(ids.frameA, 'The market grows 20% a year.');
  ids.a2 = await note(ids.frameA, 'Three incumbents.');
  ids.b1 = await note(ids.frameB, 'Regulation may bite.');
});

afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

const slide = (over: Record<string, unknown> = {}) => ({
  slideId: 'market',
  layout: 'bullets',
  title: 'Market',
  bullets: ['Growing'],
  cardIds: [ids.a1],
  ...over,
});

describe('compose_slides: citations are enforced', () => {
  it('rejects an uncited slide and writes nothing', async () => {
    await expect(composeSlides(store, { slides: [slide({ cardIds: [] })] }, exec())).rejects.toThrow(
      /must cite at least one card/,
    );
    expect(existsSync(join(store.dirOf(canvasId), 'deck'))).toBe(false);
  });

  it('rejects a card outside the compose scope and an id that is no card, and reports them', async () => {
    const events: DeckEvent[] = [];
    const off = store.deck.onEvent(canvasId, (e) => events.push(e));
    const { job } = await store.deck.begin(canvasId, { kind: 'compose', scope: [ids.frameA], instructions: '' });
    await expect(composeSlides(store, { slides: [slide({ cardIds: [ids.a1, ids.b1] })] }, exec())).rejects.toThrow(
      `card ${ids.b1} is outside the scope of this deck`,
    );
    await expect(composeSlides(store, { slides: [slide({ cardIds: ['c_doesnotexist'] })] }, exec())).rejects.toThrow(
      /not a card on this board/,
    );
    expect(events.map((e) => e.type)).toEqual(['rejected', 'rejected']);
    expect(existsSync(deckFile('deck.json'))).toBe(false);
    store.deck.end(canvasId, job);
    off();
  });

  it('is Orb-only: a child agent is refused', async () => {
    await expect(composeSlides(store, { slides: [slide()] }, exec('scout-session-1'))).rejects.toThrow(
      'compose_slides is not available to the scout agent',
    );
  });
});

describe('compose_slides: persistence, jobs, edits, export', () => {
  it('a compose job starts a new deck with its first call; a slide job writes its one slide only', async () => {
    const events: DeckEvent[] = [];
    store.deck.onEvent(canvasId, (e) => events.push(e));
    const { job } = await store.deck.begin(canvasId, { kind: 'compose', scope: 'all', format: 'vc-ic', instructions: 'Five minutes' });
    expect(JSON.parse(readFileSync(deckFile('instructions.json'), 'utf8'))).toMatchObject({
      format: 'vc-ic',
      instructions: 'Five minutes',
      scope: 'all',
    });
    const r = await composeSlides(
      store,
      { slides: [slide({ slideId: 'title', layout: 'title', title: 'Deck board', cardIds: [] }), slide(), slide({ slideId: 'risks', title: 'Risks', cardIds: [ids.b1] })] },
      exec(),
    );
    expect(r).toEqual({ slides: 3, total: 3, citations: 2 });
    expect(job.composed).toEqual(['title', 'market', 'risks']);
    expect(events.filter((e) => e.type === 'slide').map((e) => (e as { position: number }).position)).toEqual([1, 2, 3]);
    store.deck.end(canvasId, job);
    const first = storedDeck();
    expect(first).toMatchObject({ title: 'Deck board', format: 'vc-ic', instructions: 'Five minutes', version: 1 });

    // A second compose replaces the deck with its first call (the old one stays until then).
    const second = await store.deck.begin(canvasId, { kind: 'compose', scope: 'all', instructions: '' });
    expect(storedDeck().slides).toHaveLength(3);
    await composeSlides(store, { slides: [slide({ slideId: 'only', title: 'Only' })] }, exec());
    expect(storedDeck().slides.map((s) => s.id)).toEqual(['only']);
    expect(storedDeck().version).toBeGreaterThan(first.version);
    store.deck.end(canvasId, second.job);

    // A busy canvas refuses a second job; a slide job needs the slide and writes only it.
    await composeSlides(store, { slides: [slide({ slideId: 'one' }), slide({ slideId: 'two', title: 'Two' })] }, exec());
    const regen = await store.deck.begin(canvasId, { kind: 'slide', slideId: 'one', change: 'shorter' });
    await expect(store.deck.begin(canvasId, { kind: 'slide', slideId: 'one', change: '' })).rejects.toThrow(/already writing/);
    await expect(composeSlides(store, { slides: [slide({ slideId: 'two' })] }, exec())).rejects.toThrow(/regenerates slide "one" only/);
    await composeSlides(store, { slides: [slide({ slideId: 'one', title: 'One again' })] }, exec());
    store.deck.end(canvasId, regen.job);
    expect(storedDeck().slides.map((s) => [s.id, s.title])).toEqual([['only', 'Only'], ['one', 'One again'], ['two', 'Two']]);
    await expect(store.deck.begin(canvasId, { kind: 'slide', slideId: 'missing', change: '' })).rejects.toThrow(/no slide missing/);
  });

  it('refreshes a complete chat deck atomically instead of appending legacy slide ids', async () => {
    await composeSlides(store, { slides: [slide({ slideId: 'legacy' })] }, exec());
    const before = storedDeck();
    await expect(composeSlides(store, { replaceAll: true, slides: [slide({ slideId: 'invalid', cardIds: [] })] }, exec())).rejects.toThrow(/cite/);
    expect(storedDeck()).toEqual(before);
    await composeSlides(store, { replaceAll: true, slides: [slide({ slideId: 'refreshed' })] }, exec());
    expect(storedDeck().slides.map(s => s.id)).toEqual(['refreshed']);
    expect(storedDeck().version).toBeGreaterThan(before.version);
    const regen = await store.deck.begin(canvasId, { kind: 'slide', slideId: 'refreshed', change: 'Shorter' });
    await expect(composeSlides(store, { replaceAll: true, slides: [slide({ slideId: 'refreshed' })] }, exec())).rejects.toThrow(/cannot replace the whole deck/);
    expect(storedDeck().slides.map(s => s.id)).toEqual(['refreshed']);
    store.deck.end(canvasId, regen.job);
  });

  it('applies the slide view edits and refuses a stale version', async () => {
    await composeSlides(store, { slides: [slide({ slideId: 'a' }), slide({ slideId: 'b', title: 'B' })] }, exec());
    const deck = storedDeck();
    const edited = await store.deck.saveEdits(canvasId, {
      version: deck.version,
      slides: [{ id: 'b', title: 'B2', bullets: [] }, { id: 'a', title: 'Market', bullets: ['Growing'] }],
    });
    expect(edited.slides.map((s) => s.id)).toEqual(['b', 'a']);
    expect(edited.slides[0]).toMatchObject({ title: 'B2', edited: true, cardIds: [ids.a1] });
    expect(edited.slides[1]).toEqual(deck.slides[0]);
    await expect(store.deck.saveEdits(canvasId, { version: deck.version, slides: [] })).rejects.toMatchObject({ code: 'orb/conflict' });
    expect(storedDeck()).toEqual(edited);
  });

  it('exports a .pptx into exports/ without overwriting an earlier one; nothing to export is refused', async () => {
    await expect(store.deck.exportPptx(canvasId)).rejects.toMatchObject({ code: 'orb/not-found' });
    await composeSlides(store, { slides: [slide({ slideId: 'a' })] }, exec());
    const one = await store.deck.exportPptx(canvasId);
    const two = await store.deck.exportPptx(canvasId);
    expect(one.slides).toBe(2);
    expect(one.file).not.toBe(two.file);
    expect(readFileSync(one.file).subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(readdirSync(join(store.dirOf(canvasId), 'exports')).filter((f) => f.endsWith('.pptx'))).toHaveLength(2);
  });
});
