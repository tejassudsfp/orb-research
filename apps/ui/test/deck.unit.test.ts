/**
 * P6.17 Presentations, units: the Sources slide numbering, every slide layout and the print route drawn to static
 * markup, and Gate 6.1's "every card type exports to .pptx": the export fixture's card of EACH type (scripts/testkit/
 * printFixture.ts) is put on a visual slide, the .pptx is built with pptxgenjs and unzipped, and the parts that make
 * charts and tables native are checked. (The real window and the PDF are covered by apps/desktop/e2e/deck.spec.ts.)
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  CardType,
  chartPoints,
  databaseDataOf,
  datasetFromRows,
  deckCitationNumbers,
  newCardView,
  plotTableOfDataset,
  type BoardState,
  type Card,
  type Deck,
  type Slide,
} from '@orb/shared';
// The builder lives in @orb/port (the canvas service runs it); the renderer never imports it.
import { buildDeckPptx } from '../../../packages/orb-port/src/index.ts';
import { SlideFace, SourcesFace } from '../src/deck/SlideFace.js';
import { SOURCES_PER_PAGE, deckSources, exportSlideCount, sourcePages } from '../src/deck/sources.js';
import { DeckPrint } from '../src/print/DeckPrint.js';
import { pptxHook } from '../src/cards/pptx.js';
import { FIXTURE_CARDS, PRINT_MARKERS, type FixtureAssets } from '../../../scripts/testkit/printFixture.js';

const asset = (path: string, mime: 'image/png' | 'application/pdf') => ({ path, name: path.slice(7), mime, size: 10 });
const pipeline = datasetFromRows('d_TESTDATASET1', `${PRINT_MARKERS.database} pipeline`, ['Company', 'Stage', 'ARR'], [
  ['Acme', 'Seed', '1.2'],
  ['Globex', 'Series A', '4.5'],
]).dataset;
const assets: FixtureAssets = {
  database: { data: databaseDataOf(`${PRINT_MARKERS.database} pipeline`, pipeline), view: newCardView(pipeline) },
  chart: (() => {
    const spec = { mark: 'bar' as const, x: 'Company', y: 'ARR' };
    const plot = chartPoints(spec, plotTableOfDataset(pipeline));
    return {
      title: `${PRINT_MARKERS.chart} ARR by company`,
      ...spec,
      source: { kind: 'dataset', datasetId: pipeline.id },
      points: plot.points,
      xType: plot.xType,
      rev: pipeline.rev,
    };
  })(),
  image: asset('assets/chart-1.png', 'image/png'),
  pdf: asset('assets/report-1.pdf', 'application/pdf'),
  thumb: asset('assets/thumb-1.png', 'image/png'),
  cited: ['c_source1', 'c_quote1'],
};

function cardOf(type: CardType): Card {
  const spec = FIXTURE_CARDS[type];
  return {
    id: `c_${type}1`,
    type,
    frameId: null,
    x: 0,
    y: 0,
    w: spec.size?.w ?? 340,
    h: spec.size?.h ?? 230,
    data: spec.data(assets),
    provenance:
      spec.actor.kind === 'agent'
        ? { kind: 'agent', agent: spec.actor.agent, model: 'm', sessionId: 's', at: 1 }
        : { kind: 'user', at: 1 },
    ...(spec.extra as object),
    ...(type === 'database' ? { view: assets.database.view } : {}),
  } as Card;
}

const PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP8z8Dwn4GBgQEAFAAC/6ZkmgAAAABJRU5ErkJggg==', 'base64'),
);

const cards = Object.fromEntries(CardType.options.map((t) => [cardOf(t).id, cardOf(t)]));
const board: BoardState = { seq: 0, cards, frames: {}, links: {} };

const slide = (over: Partial<Slide> & Pick<Slide, 'id' | 'layout' | 'title'>): Slide => ({
  bullets: [],
  cardIds: [],
  composedAt: 1,
  ...over,
});

const deckOf = (slides: Slide[]): Deck => ({
  v: 1,
  version: 1,
  title: 'Fixture deck',
  scope: 'all',
  format: 'standard',
  instructions: '',
  slides,
  composedAt: 1,
  updatedAt: 1,
});

describe('the Sources slide', () => {
  it('numbers cited cards in order of first citation and pages them', () => {
    const many = CardType.options.slice(0, 20).map((t) => `c_${t}1`);
    const deck = deckOf([
      slide({ id: 'a', layout: 'bullets', title: 'A', bullets: ['x'], cardIds: [many[3]!, many[1]!] }),
      slide({ id: 'b', layout: 'bullets', title: 'B', bullets: ['x'], cardIds: [many[1]!, ...many.slice(4, 20), 'c_gone'] }),
    ]);
    const numbers = deckCitationNumbers(deck);
    expect(numbers.get(many[3]!)).toBe(1);
    expect(numbers.get(many[1]!)).toBe(2);
    const entries = deckSources(deck, board);
    expect(entries.at(-1)).toMatchObject({ cardId: 'c_gone', missing: true });
    const pages = sourcePages(entries);
    expect(pages.length).toBe(Math.ceil(entries.length / SOURCES_PER_PAGE));
    expect(pages.flat()).toHaveLength(entries.length);
    expect(sourcePages([])).toEqual([[]]);
    expect(exportSlideCount(deck, board)).toBe(2 + pages.length);
    expect(exportSlideCount(deckOf([]), board)).toBe(1);
  });
});

const props = (deck: Deck) => ({
  deckTitle: deck.title,
  numbers: deckCitationNumbers(deck),
  cardOf: (id: string) => cards[id],
});

describe('slide faces', () => {
  it('draws every layout, the cited numbers and the page number, and a card that left the board', () => {
    const deck = deckOf([
      slide({ id: 'title', layout: 'title', title: 'Cover title', subtitle: 'Sub' }),
      slide({ id: 'sec', layout: 'section', title: 'Part two' }),
      slide({ id: 'b', layout: 'bullets', title: 'Bullets', bullets: ['one', 'two'], cardIds: ['c_source1'] }),
      slide({ id: 'v', layout: 'visual', title: 'Visual', bullets: ['side'], visual: { cardId: 'c_chart1', caption: 'Chart caption' }, cardIds: ['c_source1', 'c_chart1'] }),
      slide({ id: 't', layout: 'two-column', title: 'Two', bullets: ['left'], visual: { cardId: 'c_table1', caption: '' }, cardIds: ['c_table1'] }),
      slide({ id: 'q', layout: 'quote', title: 'Said', visual: { cardId: 'c_quote1', caption: '' }, cardIds: ['c_quote1'] }),
      slide({ id: 'g', layout: 'visual', title: 'Gone', visual: { cardId: 'c_gone', caption: 'x' }, cardIds: ['c_gone'] }),
    ]);
    const out = deck.slides.map((s, i) => renderToStaticMarkup(createElement(SlideFace, { slide: s, page: i + 1, ...props(deck) })));
    expect(out[0]).toContain('Cover title');
    expect(out[0]).toContain('data-layout="title"');
    expect(out[2]).toContain('data-testid="slide-cites"');
    expect(out[2]).toContain('[1]');
    expect(out[3]).toContain('data-card-type="chart"');
    expect(out[3]).toContain('Chart caption');
    expect(out[4]).toContain('data-card-type="table"');
    expect(out[5]).toContain('data-slide-id="q"');
    expect(out[6]).toContain('no longer on the board');
    const sources = renderToStaticMarkup(
      createElement(SourcesFace, { entries: deckSources(deck, board).slice(0, 3), deckTitle: deck.title, page: 8, n: 1, of: 2 }),
    );
    expect(sources).toContain('Sources (1/2)');
    expect(sources).toContain('data-card-id="c_source1"');
  });

  it('the print route holds a page per slide and the Sources slides, 16:9', () => {
    const deck = deckOf([
      slide({ id: 'title', layout: 'title', title: 'Cover' }),
      slide({ id: 'b', layout: 'bullets', title: 'B', bullets: ['x'], cardIds: ['c_source1', 'c_quote1'] }),
    ]);
    const html = renderToStaticMarkup(createElement(DeckPrint, { deck, board }));
    expect(html).toContain('size: 960px 540px');
    expect((html.match(/data-testid="slide"/g) ?? []).length).toBe(3);
    expect(html).toContain('data-slide-id="sources"');
    expect(html).toContain('data-slides="2"');
  });
});

describe('every card type exports to .pptx (Gate 6.1)', () => {
  it('retains detailed analysis from cited cards even on a slide without a visual', async () => {
    const detail = 'The first paragraph records the evidence and its date.\n\nThe second paragraph explains assumptions and the recommendation.';
    const deck = deckOf([slide({ id: 'analysis', layout: 'bullets', title: 'Recommendation', bullets: ['Decision'], cardIds: ['c_source1', 'c_source1'] })]);
    const res = await buildDeckPptx(deck, {
      cardOf: (id) => cards[id] ? { ...cards[id]!, detail } : undefined,
      readAsset: async () => undefined,
      snapshotOf: async () => undefined,
    });
    const zip = await JSZip.loadAsync(res.data);
    const notes = await zip.file('ppt/notesSlides/notesSlide1.xml')!.async('string');
    expect(notes).toContain('The first paragraph records the evidence and its date.');
    expect(notes).toContain('The second paragraph explains assumptions and the recommendation.');
    expect(notes.match(/The first paragraph/g)).toHaveLength(1);
  });

  it('builds one slide per type, with native charts and tables and the pictures', async () => {
    const types = CardType.options;
    const slides = types.map((t) =>
      slide({
        id: `s-${t}`,
        layout: 'visual',
        title: `A ${t} card`,
        visual: { cardId: `c_${t}1`, caption: `The ${t}` },
        cardIds: [`c_${t}1`],
      }),
    );
    const deck = deckOf(slides);
    const res = await buildDeckPptx(deck, {
      cardOf: (id) => cards[id],
      readAsset: async () => PNG,
      snapshotOf: async () => PNG,
    });
    const natives = types.map((t) => pptxHook(cards[`c_${t}1`]!).kind);
    expect(res.slides).toBe(types.length + sourcePages(deckSources(deck, board)).length);
    expect(res.charts).toBe(natives.filter((k) => k === 'chart').length);
    expect(res.tables).toBe(natives.filter((k) => k === 'table').length);
    expect(res.images).toBe(natives.filter((k) => k === 'image' || k === 'snapshot').length);
    expect(res.charts).toBeGreaterThanOrEqual(1);
    expect(res.tables).toBeGreaterThanOrEqual(3);
    expect(res.images).toBeGreaterThanOrEqual(3);

    const zip = await JSZip.loadAsync(res.data);
    const names = Object.keys(zip.files);
    expect(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(res.slides);
    expect(names.filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))).toHaveLength(res.charts);
    expect(names.filter((n) => /^ppt\/embeddings\/.+\.xlsx$/.test(n))).toHaveLength(res.charts);
    // Every slide's speaker notes name its card.
    const notes = await Promise.all(
      names.filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).map((n) => zip.file(n)!.async('string')),
    );
    for (const t of types) expect(notes.some((x) => x.includes(`(card c_${t}1)`)), `notes cite the ${t}`).toBe(true);
    // The package is well-formed XML throughout.
    for (const n of names.filter((x) => x.endsWith('.xml') || x.endsWith('.rels'))) {
      const xml = await zip.file(n)!.async('string');
      expect(xml.startsWith('<?xml'), n).toBe(true);
      expect(xml, n).not.toContain('undefined');
    }
  });
});
