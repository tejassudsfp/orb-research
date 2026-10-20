/**
 * P6.17 contract test: the deck (Deck mode) on a REAL sidecar whose model is the mock LLM.
 *
 * - `deck.compose` warns about unread Must read cards (`unread`, nothing sent to Orb) unless the user chose Continue
 *   anyway; Orb gets the compose turn (the format's outline, the citation rule, the cards in scope with ids) and is
 *   offered `compose_slides`. An UNCITED slide, a card outside the scope and a visual layout without a visual are
 *   refused (the model gets the error, nothing is written); cited slides are written to `deck/deck.json`; the stream
 *   reports `started`, `rejected`, each `slide`, then `done`;
 * - a template canvas whose template names a deck format (VC) gets that outline (about 12 slides);
 * - `deck.save` reorders, edits text (citations kept), deletes and adds the user's own slide; a stale version is refused;
 * - `deck.regenerateSlide` rewrites only that slide (and refuses another slide id in that turn);
 * - `deck.exportPptx` writes `exports/deck-<stamp>.pptx`: the file is unzipped and checked (slide count with the Sources
 *   slide, a native chart part with its embedded workbook, a native table, the pictures, the citations in the notes).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeckProgress } from '@orb/shared';
import { startMockedSidecar, type MockRequest, type MockedSidecar } from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';

let sc: MockedSidecar;
let wire: Wire;
let canvasId: string;
const ids = {} as { market: string; risks: string; study: string; chart: string; table: string; note: string; risk: string };

beforeAll(async () => {
  sc = await startMockedSidecar();
  wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
  canvasId = (await wire.orb.canvas.create({ prompt: 'Deck contract board' })).id;
  const frame = async (title: string, x: number) =>
    (
      (
        await wire.orb.board.command(canvasId, {
          type: 'frame.added',
          frame: { title, color: 'sky', x, y: 0, w: 700, h: 600 },
        })
      ).event!.data as { frame: { id: string } }
    ).frame.id;
  ids.market = await frame('Market', 0);
  ids.risks = await frame('Risks', 800);
  const card = async (frameId: string, c: Record<string, unknown>) =>
    (
      (
        await wire.orb.board.command(canvasId, {
          type: 'card.added',
          card: { frameId, x: 20, y: 60, w: 300, h: 180, ...c } as never,
        })
      ).event!.data as { card: { id: string } }
    ).card.id;
  ids.study = await card(ids.market, {
    type: 'source',
    badge: 'must',
    data: { title: 'Market study 2026', url: 'https://example.com/study', summary: 'The market grows 20% a year.' },
  });
  ids.chart = await card(ids.market, {
    type: 'chart',
    data: {
      title: 'Market size',
      mark: 'bar',
      x: 'year',
      y: 'size',
      source: { kind: 'inline', columns: ['year', 'size'], rows: [['2024', 10], ['2025', 12], ['2026', 14.4]] },
      points: [
        { x: '2024', y: 10 },
        { x: '2025', y: 12 },
        { x: '2026', y: 14.4 },
      ],
    },
  });
  ids.table = await card(ids.market, {
    type: 'table',
    data: { title: 'Players', columns: ['Company', 'Share'], rows: [['Acme', '30%'], ['Globex', '25%']], totalRows: 2 },
  });
  ids.note = await card(ids.market, { type: 'note', data: { text: 'Three incumbents hold most of it.' } });
  ids.risk = await card(ids.risks, { type: 'note', data: { text: 'Regulation could slow adoption.' } });
});

afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
});

const textOf = (message: any): string =>
  typeof message?.content === 'string'
    ? message.content
    : Array.isArray(message?.content)
      ? message.content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n')
      : '';
const lastUser = (req: MockRequest) =>
  textOf([...(req.body.messages as any[])].reverse().find((m) => m.role === 'user'));
const lastToolMessages = (req: MockRequest): any[] => {
  const messages = req.body.messages as any[];
  const out: any[] = [];
  for (let i = messages.length - 1; i >= 0 && messages[i].role === 'tool'; i--) out.unshift(messages[i]);
  return out;
};
async function collect(iterable: AsyncIterable<DeckProgress>): Promise<DeckProgress[]> {
  const out: DeckProgress[] = [];
  for await (const e of iterable) out.push(e);
  return out;
}
const deckFile = (name: string) => join(sc.paths.orbHome, 'canvases', canvasId, 'deck', name);

describe('the deck (P6.17)', () => {
  it('warns about unread Must read cards and composes nothing', async () => {
    const before = sc.llm.requests.length;
    const events = await collect(wire.orb.deck.compose(canvasId, { scope: 'all' }));
    expect(events).toEqual([
      { type: 'unread', cards: [{ id: ids.study, title: 'Market study 2026', frameId: ids.market }] },
    ]);
    expect(sc.llm.requests.length).toBe(before);
  });

  it('Orb composes with compose_slides; an uncited slide, an out-of-scope card and a missing visual are rejected', async () => {
    const first = sc.llm.requests.length;
    sc.llm.enqueue(
      {
        toolCalls: [
          {
            id: 'call_uncited',
            name: 'compose_slides',
            arguments: { slides: [{ slideId: 'summary', layout: 'bullets', title: 'Summary', bullets: ['Fast'], cardIds: [] }] },
          },
          {
            id: 'call_outside',
            name: 'compose_slides',
            arguments: { slides: [{ slideId: 'risks', layout: 'bullets', title: 'Risks', bullets: ['Rules'], cardIds: [ids.risk] }] },
          },
          {
            id: 'call_novisual',
            name: 'compose_slides',
            arguments: { slides: [{ slideId: 'chart', layout: 'visual', title: 'Chart', cardIds: [ids.chart] }] },
          },
          {
            id: 'call_ok',
            name: 'compose_slides',
            arguments: {
              slides: [
                { slideId: 'title', layout: 'title', title: 'Market deck', subtitle: 'A first look', cardIds: [] },
                {
                  slideId: 'summary',
                  layout: 'bullets',
                  title: 'The market grows 20% a year',
                  bullets: ['Growth is steady', 'Three incumbents dominate'],
                  notes: 'Open with the growth number.',
                  cardIds: [ids.study, ids.note],
                },
                {
                  slideId: 'size',
                  layout: 'visual',
                  title: 'Market size doubles in two years',
                  visualCardId: ids.chart,
                  caption: 'Market size, $B',
                  cardIds: [ids.study],
                },
                {
                  slideId: 'players',
                  layout: 'two-column',
                  title: 'Who holds the share',
                  bullets: ['Acme leads'],
                  visualCardId: ids.table,
                  caption: 'Share by company',
                  cardIds: [ids.note],
                },
              ],
            },
          },
        ],
      },
      { text: 'The deck has four slides.' },
    );
    const events = await collect(
      wire.orb.deck.compose(canvasId, { scope: [ids.market], instructions: '', continueUnread: true }),
    );
    expect(events.map((e) => e.type)).toEqual([
      'started',
      'rejected',
      'rejected',
      'rejected',
      'slide',
      'slide',
      'slide',
      'slide',
      'done',
    ]);
    expect(events[0]).toEqual({ type: 'started', cards: 4, format: 'standard' });
    expect(events[1]).toMatchObject({ message: expect.stringMatching(/must cite at least one card/) });
    expect(events[2]).toMatchObject({ message: expect.stringMatching(/outside the scope of this deck/) });
    expect(events[3]).toMatchObject({ message: expect.stringMatching(/needs visualCardId/) });
    expect(events.slice(4, 8)).toMatchObject([
      { slideId: 'title', position: 1 },
      { slideId: 'summary', position: 2 },
      { slideId: 'size', position: 3 },
      { slideId: 'players', position: 4 },
    ]);
    expect(events.at(-1)).toMatchObject({ type: 'done', slides: 4 });

    // The compose turn: the standard outline, the citation rule, the cards in scope (not the other frame's).
    const req = await sc.llm.waitForRequest((r) => r.id === first + 1);
    const prompt = lastUser(req);
    expect(prompt.split('\n')[0]).toBe('Compose the slides');
    expect(prompt).toContain('"Standard deck" format');
    expect(prompt).toContain('slideId "summary"');
    expect(prompt).toContain('slideId "market", layout visual or bullets, "Market"');
    expect(prompt).toContain('slideId "open-questions"');
    expect(prompt).toContain('cites the cards it is based on in cardIds');
    expect(prompt).toContain(`[${ids.chart}]`);
    expect(prompt).not.toContain(ids.risk);
    expect((req.body.tools as any[]).map((t) => t.function.name)).toContain('compose_slides');
    const after = await sc.llm.waitForRequest((r) => r.id === first + 2);
    const results = lastToolMessages(after).map((m) => String(m.content));
    expect(results[0]).toMatch(/must cite at least one card in cardIds/);
    expect(results[1]).toMatch(/outside the scope of this deck/);
    expect(JSON.parse(results[3]!)).toEqual({ slides: 4, total: 4, citations: 4 });

    const { deck, instructions } = await wire.orb.deck.get(canvasId);
    expect(instructions).toMatchObject({ format: 'standard', scope: [ids.market] });
    expect(deck!.slides.map((s) => s.id)).toEqual(['title', 'summary', 'size', 'players']);
    expect(deck!.slides[2]).toMatchObject({ visual: { cardId: ids.chart, caption: 'Market size, $B' }, cardIds: [ids.study, ids.chart] });
    expect(deck!.slides[0]!.model).toBe('orb-mock/mock-1');
    expect(JSON.parse(readFileSync(deckFile('deck.json'), 'utf8'))).toEqual(deck);
  });

  it('a card outside the saved scope is refused when Orb is asked in chat', async () => {
    const first = sc.llm.requests.length;
    sc.llm.enqueue(
      {
        toolCalls: [
          {
            id: 'call_out',
            name: 'compose_slides',
            arguments: { slides: [{ slideId: 'risks', layout: 'bullets', title: 'Risks', bullets: ['x'], cardIds: [ids.risk] }] },
          },
        ],
      },
      { text: 'That card is outside the deck.' },
    );
    await wire.orb.chat.send(canvasId, { text: 'add a risks slide' });
    const after = await sc.llm.waitForRequest((r) => r.id === first + 2);
    expect(String(lastToolMessages(after)[0].content)).toContain('outside the scope of this deck');
    expect((await wire.orb.deck.get(canvasId)).deck!.slides).toHaveLength(4);
  });

  it('exports a .pptx with native chart and table parts, pictures, notes citations and a Sources slide', async () => {
    const r = await wire.orb.deck.exportPptx(canvasId);
    expect(r.path).toMatch(/^exports\/deck-\d{4}-\d{2}-\d{2}-\d{6}\.pptx$/);
    expect(r).toMatchObject({ slides: 5, charts: 1, tables: 1 });
    expect(existsSync(r.file)).toBe(true);
    const zip = await JSZip.loadAsync(readFileSync(r.file));
    const names = Object.keys(zip.files);
    expect(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(5);
    expect(names.filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))).toHaveLength(1);
    expect(names.some((n) => /^ppt\/embeddings\/.+\.xlsx$/.test(n))).toBe(true);
    const chart = await zip.file(names.find((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))!)!.async('string');
    expect(chart).toContain('<c:barChart>');
    expect(chart).toContain('<c:v>14.4</c:v>');
    const slideXml = await Promise.all(
      names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map((n) => zip.file(n)!.async('string')),
    );
    expect(slideXml.some((x) => x.includes('<a:tbl>') && x.includes('Globex'))).toBe(true);
    expect(slideXml.some((x) => x.includes('Sources') && x.includes('Market study 2026') && x.includes('example.com/study'))).toBe(true);
    const notes = await Promise.all(
      names.filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).map((n) => zip.file(n)!.async('string')),
    );
    expect(notes.some((x) => x.includes('Open with the growth number.') && x.includes(`(card ${ids.study})`))).toBe(true);
    // A second export gets its own file.
    const again = await wire.orb.deck.exportPptx(canvasId);
    expect(again.file).not.toBe(r.file);
    expect(readdirSync(join(sc.paths.orbHome, 'canvases', canvasId, 'exports')).filter((f) => f.endsWith('.pptx'))).toHaveLength(2);
  });

  it('saveDeck reorders, edits (citations kept), deletes and adds a slide of the user; a stale version is refused', async () => {
    const { deck } = await wire.orb.deck.get(canvasId);
    const by = Object.fromEntries(deck!.slides.map((s) => [s.id, s]));
    const keep = (id: string, over: Record<string, unknown> = {}) => ({
      id,
      title: by[id]!.title,
      bullets: by[id]!.bullets,
      ...over,
    });
    const { deck: edited } = await wire.orb.deck.save(canvasId, {
      version: deck!.version,
      slides: [
        keep('title'),
        keep('size'),
        keep('summary', { title: 'Growth is 20% a year', bullets: ['Steady'] }),
        { title: 'My own slide', bullets: ['A point of mine'] },
      ],
    });
    expect(edited.slides.map((s) => s.id)).toEqual(['title', 'size', 'summary', 'my-own-slide']);
    expect(edited.slides[2]).toMatchObject({ title: 'Growth is 20% a year', edited: true, cardIds: [ids.study, ids.note] });
    expect(edited.slides[3]).toMatchObject({ userAuthored: true, cardIds: [] });
    expect(edited.slides[1]).toEqual(by.size);
    await expect(wire.orb.deck.save(canvasId, { version: deck!.version, slides: [] })).rejects.toMatchObject({
      code: 'orb/conflict',
    });
    // The user's slide is in the export, without sources.
    const r = await wire.orb.deck.exportPptx(canvasId);
    expect(r.slides).toBe(5);
  });

  it('regenerateSlide rewrites one slide only', async () => {
    const first = sc.llm.requests.length;
    sc.llm.enqueue(
      {
        toolCalls: [
          {
            id: 'call_other',
            name: 'compose_slides',
            arguments: { slides: [{ slideId: 'title', layout: 'title', title: 'Wrong slide', cardIds: [] }] },
          },
          {
            id: 'call_regen',
            name: 'compose_slides',
            arguments: {
              slides: [
                {
                  slideId: 'summary',
                  layout: 'bullets',
                  title: 'Incumbents dominate a growing market',
                  bullets: ['Three players', '20% growth'],
                  cardIds: [ids.note, ids.study],
                },
              ],
            },
          },
        ],
      },
      { text: 'Rewrote the slide.' },
    );
    const { deck } = await wire.orb.deck.regenerateSlide(canvasId, { slideId: 'summary', instruction: 'lead with the incumbents' });
    const req = await sc.llm.waitForRequest((r) => r.id === first + 1);
    const prompt = lastUser(req);
    expect(prompt.split('\n')[0]).toBe('Regenerate one slide');
    expect(prompt).toContain('slideId "summary"');
    expect(prompt).toContain('lead with the incumbents');
    expect(prompt).toContain('Growth is 20% a year');
    expect(prompt).not.toContain(ids.risk);
    const after = await sc.llm.waitForRequest((r) => r.id === first + 2);
    expect(String(lastToolMessages(after)[0].content)).toMatch(/regenerates slide "summary" only/);
    expect(deck.slides.map((s) => s.id)).toEqual(['title', 'size', 'summary', 'my-own-slide']);
    expect(deck.slides[2]).toMatchObject({ title: 'Incumbents dominate a growing market', cardIds: [ids.note, ids.study] });
    expect(deck.slides[0]!.title).toBe('Market deck');
    expect(deck.slides[3]!.userAuthored).toBe(true);
  });

  it('refuses a regenerate of a slide that does not exist, an export without slides, and a compose with no cards', async () => {
    await expect(wire.orb.deck.regenerateSlide(canvasId, { slideId: 'nope' })).rejects.toMatchObject({ code: 'orb/not-found' });
    const bare = await wire.orb.canvas.create({ prompt: 'Bare board' });
    await expect(wire.orb.deck.exportPptx(bare.id)).rejects.toMatchObject({ code: 'orb/not-found' });
    await expect(collect(wire.orb.deck.compose(bare.id, { scope: 'all' }))).rejects.toMatchObject({
      code: 'orb/invalid-args',
    });
    await expect(collect(wire.orb.deck.compose(canvasId, { scope: 'all', format: 'nope', continueUnread: true }))).rejects.toMatchObject({
      code: 'orb/invalid-args',
    });
  });

  it('a VC format gets the investment-committee outline of about 12 slides', async () => {
    const first = sc.llm.requests.length;
    sc.llm.enqueue({ text: 'ok' });
    const events = await collect(
      wire.orb.deck.compose(canvasId, { scope: [ids.market], format: 'vc-ic', instructions: '', continueUnread: true }),
    );
    expect(events[0]).toEqual({ type: 'started', cards: 4, format: 'vc-ic' });
    const prompt = lastUser(await sc.llm.waitForRequest((r) => r.id === first + 1));
    expect(prompt).toContain('"Investment committee deck" format');
    for (const id of ['recommendation', 'snapshot', 'team', 'market', 'traction', 'competition', 'scorecard', 'next-steps'])
      expect(prompt).toContain(`slideId "${id}"`);
    expect(prompt.match(/^\d+\. slideId /gm)).toHaveLength(13);
    // Orb wrote nothing: the compose failed, and the earlier deck is still there.
    expect(events.at(-1)).toMatchObject({ type: 'failed' });
    expect((await wire.orb.deck.get(canvasId)).deck!.slides).toHaveLength(4);
  });
});
