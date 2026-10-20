/**
 * @orb/port deck (P6.17): the citation rule of `compose_slides`, slide upserts, the slide view's edits, the `deck/`
 * files, and the .pptx (unzipped and checked: slide count, native chart and table parts with their embedded data,
 * pictures, citations in the speaker notes, the Sources slide).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, describe, expect, it } from 'vitest';
import {
  appearancePalette,
  slideNotesText,
  deckCitationNumbers,
  deckFormatFor,
  type Card,
  type Deck,
} from '@orb/shared';
import {
  applyDeckEdits,
  buildDeckPptx,
  emptyDeck,
  imageSize,
  isPortError,
  readDeck,
  upsertSlides,
  validateSlides,
  writeDeck,
  writeDeckInstructions,
} from '../src/index.js';

const scope = new Set(['c_src', 'c_chart', 'c_table', 'c_img', 'c_metric', 'c_design']);
const inScope = (id: string) => scope.has(id);
const exists = (id: string) => scope.has(id) || id === 'c_outside';

function refusal(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (err) {
    if (isPortError(err)) return { code: err.code, message: err.message };
    throw err;
  }
  throw new Error('expected a refusal');
}

const slide = (over: Record<string, unknown> = {}) => ({
  slideId: 'one',
  layout: 'bullets',
  title: 'One',
  bullets: ['a point'],
  cardIds: ['c_src'],
  ...over,
});

describe('validateSlides (the citation rule)', () => {
  it('accepts cited slides, covers without citations, and adds the visual to the citations', () => {
    const out = validateSlides(
      {
        slides: [
          slide({ slideId: 'title', layout: 'title', title: 'Deck', bullets: undefined, cardIds: [] }),
          slide({
            slideId: 'chart',
            layout: 'visual',
            visualCardId: 'c_chart',
            caption: 'Revenue',
            cardIds: ['c_src'],
          }),
        ],
      },
      inScope,
      exists,
    );
    expect(out).toHaveLength(2);
    expect(out[1]!.cardIds).toEqual(['c_src', 'c_chart']);
    expect(out[1]!.visual).toEqual({ cardId: 'c_chart', caption: 'Revenue' });
  });

  it('rejects an uncited content slide, an out-of-scope card, and a visual layout without a visual', () => {
    expect(refusal(() => validateSlides({ slides: [slide({ cardIds: [] })] }, inScope, exists)).code).toBe(
      'uncited',
    );
    const out = refusal(() =>
      validateSlides({ slides: [slide({ cardIds: ['c_outside'] })] }, inScope, exists),
    );
    expect(out.code).toBe('out-of-scope');
    expect(out.message).toContain('outside the scope');
    expect(
      refusal(() => validateSlides({ slides: [slide({ cardIds: ['c_nope'] })] }, inScope, exists)).message,
    ).toContain('not a card on this board');
    expect(
      refusal(() => validateSlides({ slides: [slide({ layout: 'visual' })] }, inScope, exists)).message,
    ).toContain('visualCardId');
    expect(refusal(() => validateSlides({ slides: [slide(), slide()] }, inScope, exists)).message).toContain(
      'twice',
    );
    expect(refusal(() => validateSlides({ slides: [] }, inScope, exists)).code).toBe('invalid');
  });
});

describe('upsertSlides and applyDeckEdits', () => {
  const base = () =>
    upsertSlides(
      emptyDeck({ title: 'T', scope: 'all', instructions: '', format: 'standard' }, 1),
      validateSlides(
        { slides: [slide({ slideId: 'a' }), slide({ slideId: 'b', title: 'B' })] },
        inScope,
        exists,
      ),
      { now: 2, model: 'p/m' },
    );

  it('replaces a slide in place and appends new ones', () => {
    const { deck, positions } = base();
    expect(positions).toEqual([1, 2]);
    const again = upsertSlides(
      deck,
      validateSlides(
        { slides: [slide({ slideId: 'a', title: 'A2' }), slide({ slideId: 'c' })] },
        inScope,
        exists,
      ),
      { now: 3 },
    );
    expect(again.deck.slides.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(again.deck.slides[0]!.title).toBe('A2');
    expect(again.deck.version).toBe(deck.version + 1);
  });

  it('reorders, edits (keeping citations), deletes and adds a user slide', () => {
    const { deck } = base();
    const edited = applyDeckEdits(
      deck,
      {
        version: deck.version,
        slides: [
          { id: 'b', title: 'B edited', bullets: ['x'] },
          { title: 'Mine', bullets: ['own'] },
        ],
      },
      9,
    );
    expect(edited.slides.map((s) => s.id)).toEqual(['b', 'mine']);
    expect(edited.slides[0]).toMatchObject({ title: 'B edited', edited: true, cardIds: ['c_src'] });
    expect(edited.slides[1]).toMatchObject({ userAuthored: true, cardIds: [] });
    expect(refusal(() => applyDeckEdits(deck, { version: 99, slides: [] }, 9)).code).toBe('conflict');
    expect(
      refusal(() =>
        applyDeckEdits(deck, { version: deck.version, slides: [{ id: 'zz', title: 'x', bullets: [] }] }, 9),
      ).code,
    ).toBe('not-found');
  });

  it('stores and reads deck/ files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orb-deck-'));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));
    expect(await readDeck(dir)).toEqual({ deck: null, instructions: null });
    const { deck } = base();
    await writeDeck(dir, deck);
    await writeDeckInstructions(dir, { format: 'standard', instructions: 'x', scope: 'all', savedAt: 5 });
    const back = await readDeck(dir);
    expect(back.deck).toEqual(deck);
    expect(back.instructions?.instructions).toBe('x');
  });
});

describe('deck formats', () => {
  it('names the VC deck for the VC templates and the standard deck otherwise', () => {
    expect(deckFormatFor('vc').id).toBe('vc-ic');
    expect(deckFormatFor('vc-dd').slides.length).toBeGreaterThanOrEqual(12);
    expect(deckFormatFor('company').id).toBe('standard');
    expect(deckFormatFor(undefined).id).toBe('standard');
  });
});

// A 2x2 PNG (valid) for the picture tests.
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP8z8Dwn4GBgQEAFAAC/6ZkmgAAAABJRU5ErkJggg==',
    'base64',
  ),
);

const prov = { kind: 'agent', agent: 'scout', at: 1 } as unknown as Card['provenance'];
const card = (id: string, type: Card['type'], data: unknown): Card => ({
  id,
  type,
  frameId: 'f_1',
  x: 0,
  y: 0,
  w: 300,
  h: 200,
  data,
  provenance: prov,
});

const CARDS: Record<string, Card> = {
  c_src: card('c_src', 'source', {
    url: 'https://example.com/report',
    title: 'Annual report',
    summary: 'Revenue grew.',
  }),
  c_chart: card('c_chart', 'chart', {
    title: 'Revenue',
    mark: 'bar',
    x: 'year',
    y: 'revenue',
    source: {
      kind: 'inline',
      columns: ['year', 'revenue'],
      rows: [
        ['2024', 10],
        ['2025', 14],
      ],
    },
    points: [
      { x: '2024', y: 10 },
      { x: '2025', y: 14 },
    ],
  }),
  c_table: card('c_table', 'table', {
    title: 'KPIs',
    columns: ['Metric', 'Value'],
    rows: [
      ['ARR', '$4M'],
      ['NRR', '120%'],
    ],
    totalRows: 2,
  }),
  c_img: card('c_img', 'image', {
    asset: { path: 'assets/pic.png', name: 'pic.png', mime: 'image/png', size: PNG.length },
    title: 'A picture',
  }),
  c_metric: card('c_metric', 'metric', {
    title: 'ARR',
    value: '$4.2M',
    change: { value: '+12%', direction: 'up' },
  }),
  c_design: card('c_design', 'design', { title: 'Mockup', html: '<p>x</p>' }),
};

describe('buildDeckPptx', () => {
  it('keeps each selected style and accent in native output during simultaneous exports', async () => {
    const { deck } = upsertSlides(
      emptyDeck({ title: 'Theme output', scope: 'all', instructions: '', format: 'standard' }, 1),
      validateSlides({ slides: [slide()] }, inScope),
      { now: 2 },
    );
    const choices = [
      { themeId: 'paper', mode: 'dark', accent: 'rose' },
      { themeId: 'tide', mode: 'light', accent: '#7048E8' },
    ] as const;
    const results = await Promise.all(
      choices.map((appearance) =>
        buildDeckPptx(deck, {
          appearance,
          cardOf: () =>
            card('c_src', 'source', { title: 'Source', url: 'https://example.com', summary: 'Evidence' }),
          readAsset: async () => undefined,
          snapshotOf: async () => undefined,
        }),
      ),
    );
    for (const [index, result] of results.entries()) {
      const palette = appearancePalette(choices[index]!, 'light');
      const zip = await JSZip.loadAsync(result.data);
      const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
      expect(xml.toUpperCase()).toContain(palette.accent.accent.slice(1).toUpperCase());
      expect(xml.toUpperCase()).toContain(palette.palette.text.slice(1).toUpperCase());
      expect(xml.toUpperCase()).toContain(palette.palette.surface.slice(1).toUpperCase());
    }
  });

  it('preserves full table cells in notes when the native slide preview condenses long text', async () => {
    const value = `${'Evidence and explicit assumptions. '.repeat(9)}The final qualification must survive.`;
    const table = card('c_dense', 'table', {
      title: 'Detailed comparison',
      columns: ['Option', 'Evidence'],
      rows: [['A', value]],
      totalRows: 1,
    });
    const { deck } = upsertSlides(
      emptyDeck({ title: 'Dense table', scope: 'all', instructions: '', format: 'standard' }, 1),
      validateSlides(
        { slides: [slide({ layout: 'visual', visualCardId: table.id, cardIds: [table.id] })] },
        (id) => id === table.id,
      ),
      { now: 2 },
    );
    const result = await buildDeckPptx(deck, {
      cardOf: (id) => (id === table.id ? table : undefined),
      readAsset: async () => undefined,
      snapshotOf: async () => undefined,
    });
    const zip = await JSZip.loadAsync(result.data);
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const notes = await zip.file('ppt/notesSlides/notesSlide1.xml')!.async('string');
    expect(xml).toContain('full cell text in speaker notes');
    expect(notes).toContain(value);
  });

  it('exports unentered matrix ratings as unscored without a false zero or winner', async () => {
    const pending = card('c_pending', 'matrix', {
      title: 'Scorecard',
      criteria: [{ name: 'Fit', weight: 1 }],
      options: [
        { name: 'Orb', scores: [8] },
        { name: 'Your rating', scores: [null] },
      ],
    });
    const { deck } = upsertSlides(
      emptyDeck({ title: 'Scores', scope: 'all', instructions: '', format: 'standard' }, 1),
      validateSlides(
        { slides: [slide({ layout: 'visual', visualCardId: pending.id, cardIds: [pending.id] })] },
        (id) => id === pending.id,
      ),
      { now: 2 },
    );
    const result = await buildDeckPptx(deck, {
      cardOf: (id) => (id === pending.id ? pending : undefined),
      readAsset: async () => undefined,
      snapshotOf: async () => undefined,
    });
    const zip = await JSZip.loadAsync(result.data);
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(result.tables).toBe(1);
    expect(xml).toContain('Not scored');
    expect(xml).toContain('8.00');
    expect(xml).not.toContain('(winner)');
    expect(xml).not.toContain('<a:t>0.00</a:t>');
  });

  it('writes a valid .pptx with native charts and tables, pictures, notes citations and a Sources slide', async () => {
    const { deck } = upsertSlides(
      emptyDeck({ title: 'Acme IC', scope: 'all', instructions: '', format: 'vc-ic' }, 1),
      validateSlides(
        {
          slides: [
            slide({
              slideId: 'title',
              layout: 'title',
              title: 'Acme IC',
              subtitle: 'Investment committee',
              bullets: undefined,
              cardIds: [],
            }),
            slide({
              slideId: 'rec',
              title: 'Recommendation',
              bullets: ['Proceed', 'Strong growth'],
              notes: 'Say it plainly.',
            }),
            slide({
              slideId: 'rev',
              layout: 'visual',
              title: 'Revenue',
              visualCardId: 'c_chart',
              caption: 'Revenue by year',
            }),
            slide({
              slideId: 'kpi',
              layout: 'two-column',
              title: 'KPIs',
              bullets: ['ARR is $4M'],
              visualCardId: 'c_table',
              caption: 'Claimed',
            }),
            slide({ slideId: 'pic', layout: 'visual', title: 'Picture', visualCardId: 'c_img' }),
            slide({ slideId: 'arr', layout: 'visual', title: 'ARR', visualCardId: 'c_metric' }),
            slide({ slideId: 'des', layout: 'visual', title: 'Design', visualCardId: 'c_design' }),
            slide({
              slideId: 'quote',
              layout: 'quote',
              title: 'Customer said',
              bullets: ['It saved us a week.'],
              subtitle: 'A customer',
            }),
          ],
        },
        inScope,
        exists,
      ),
      { now: 2 },
    );
    const res = await buildDeckPptx(deck, {
      cardOf: (id) => CARDS[id],
      readAsset: async (p) => (p === 'assets/pic.png' ? PNG : undefined),
      snapshotOf: async (id) => (id === 'c_design' ? PNG : undefined),
    });
    // 8 slides + 1 Sources slide; 1 chart, 1 table; 2 pictures (the image and the design snapshot).
    expect(res).toMatchObject({ slides: 9, charts: 1, tables: 1, images: 2 });

    const zip = await JSZip.loadAsync(res.data);
    const names = Object.keys(zip.files);
    expect(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(9);
    const chartParts = names.filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    expect(chartParts).toHaveLength(1);
    expect(names.some((n) => /^ppt\/embeddings\/.*\.xlsx$/.test(n))).toBe(true);
    const chartXml = await zip.file(chartParts[0]!)!.async('string');
    expect(chartXml).toContain('<c:barChart>');
    expect(chartXml).toContain('2024');
    expect(chartXml).toContain('<c:v>14</c:v>');
    expect(names.filter((n) => /^ppt\/media\/.*\.png$/.test(n)).length).toBeGreaterThanOrEqual(2);
    const slides = await Promise.all(
      names
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => Number(/(\d+)\.xml/.exec(a)![1]) - Number(/(\d+)\.xml/.exec(b)![1]))
        .map((n) => zip.file(n)!.async('string')),
    );
    expect(slides[3]).toContain('<a:tbl>');
    expect(slides[3]).toContain('NRR');
    // The Sources slide lists the cited cards with their URL.
    expect(slides[8]).toContain('Sources');
    expect(slides[8]).toContain('Annual report');
    // Speaker notes: the model's notes then the numbered sources.
    const notes = await Promise.all(
      names
        .filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))
        .map((n) => zip.file(n)!.async('string')),
    );
    expect(
      notes.some(
        (x) => x.includes('Say it plainly.') && x.includes('Sources: [1] Annual report (card c_src)'),
      ),
    ).toBe(true);
    // No network: nothing in the package points at a remote picture.
    for (const n of names.filter((x) => x.endsWith('.rels'))) {
      const rels = await zip.file(n)!.async('string');
      expect(rels).not.toMatch(/Target="https?:\/\/[^"]+"[^>]*image/);
    }
  });

  it('draws a card without a native form as text, and charts every mark', async () => {
    const marks = ['line', 'area', 'scatter', 'pie'] as const;
    const slides = marks.map((m) =>
      slide({ slideId: `m-${m}`, layout: 'visual', title: m, visualCardId: `c_${m}` }),
    );
    const cards: Record<string, Card> = { c_src: CARDS.c_src! };
    for (const m of marks)
      cards[`c_${m}`] = card(`c_${m}`, 'chart', {
        title: m,
        mark: m,
        x: 'x',
        y: 'y',
        source: { kind: 'inline', columns: ['x', 'y'], rows: [] },
        points:
          m === 'scatter'
            ? [
                { x: 1, y: 2 },
                { x: 2, y: 5 },
                { x: 3, y: 4 },
              ]
            : [
                { x: 'a', y: 1 },
                { x: 'b', y: 3 },
              ],
      });
    const all = new Set(Object.keys(cards));
    const { deck } = upsertSlides(
      emptyDeck({ title: 'Marks', scope: 'all', instructions: '', format: 'standard' }, 1),
      validateSlides({ slides }, (id) => all.has(id)),
      { now: 2 },
    );
    const res = await buildDeckPptx(deck, {
      cardOf: (id) => cards[id],
      readAsset: async () => undefined,
      snapshotOf: async () => undefined,
    });
    expect(res.charts).toBe(4);
    const zip = await JSZip.loadAsync(res.data);
    const xml = await Promise.all(
      Object.keys(zip.files)
        .filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))
        .map((n) => zip.file(n)!.async('string')),
    );
    for (const tag of ['lineChart', 'areaChart', 'scatterChart', 'pieChart'])
      expect(
        xml.some((x) => x.includes(`<c:${tag}>`)),
        tag,
      ).toBe(true);
    for (const x of xml) expect(x).not.toMatch(/NaN|<c:v>null<\/c:v>/);
  });
});

describe('helpers', () => {
  it('reads image sizes and builds the notes text', () => {
    expect(imageSize(PNG)).toEqual({ w: 2, h: 2 });
    const deck = { slides: [{ cardIds: ['c_src'] }] } as unknown as Deck;
    const numbers = deckCitationNumbers(deck);
    const text = slideNotesText(
      { notes: 'n', cardIds: ['c_src'] } as unknown as Deck['slides'][number],
      numbers,
      (id) => CARDS[id],
    );
    expect(text).toBe('n\n\nSources: [1] Annual report (card c_src)');
  });
});
