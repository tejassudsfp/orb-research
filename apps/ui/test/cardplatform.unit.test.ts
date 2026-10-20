/**
 * P6.2 card platform: every card type has a complete UI half (src/cards/types/<type>.tsx), and each part renders the
 * export fixture's card of that type (scripts/testkit/printFixture.ts `FIXTURE_CARDS`) without throwing: the board
 * body at full and compact LOD, the title-LOD extra, the reader, the print half in both export modes (Canvas PDF page
 * and research-document figure) and the pptx hook. Rendered to static markup (no DOM); the real window covers the
 * rest (apps/desktop/e2e/cards.spec.ts, print.spec.ts, builder.spec.ts).
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CardType,
  cardDataSchema,
  chartPoints,
  databaseDataOf,
  datasetFromRows,
  newCardView,
  plotTableOfDataset,
  type Card,
} from '@orb/shared';
import { CARD_UI } from '../src/cards/types/index.js';
import { pptxHook } from '../src/cards/pptx.js';
import { PrintCard } from '../src/print/PrintCard.js';
import { FIXTURE_CARDS, PRINT_MARKERS, type FixtureAssets } from '../../../scripts/testkit/printFixture.js';

const asset = (path: string, mime: 'image/png' | 'application/pdf') => ({
  path,
  name: path.slice(7),
  mime,
  size: 10,
});
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

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('card UI halves', () => {
  it('keeps an unentered matrix rating pending on the board, in the reader and in print', () => {
    const card = cardOf('matrix');
    card.data = { title: 'Scorecard', criteria: [{ name: 'Fit', weight: 1 }],
      options: [{ name: 'Orb', scores: [8] }, { name: 'Your rating', scores: [null] }] };
    const ui = CARD_UI.matrix;
    const full = html(createElement(ui.Body, { card, lod: 'full' }));
    const compact = html(createElement(ui.Body, { card, lod: 'compact' }));
    const reader = html(createElement(ui.Reader!, { card }));
    const printed = html(createElement(PrintCard, { card, mode: 'canvas' }));
    for (const rendered of [full, reader, printed]) {
      expect(rendered).toContain('Not scored');
      expect(rendered).not.toContain('matrix-winner');
    }
    expect(compact).toContain('scores pending');
  });

  it('one module per card type, each with every part of the contract', () => {
    const dir = resolve(import.meta.dirname, '..', 'src', 'cards', 'types');
    const modules = readdirSync(dir)
      .filter((f) => f.endsWith('.tsx') && f !== 'kit.tsx')
      .map((f) => f.slice(0, -4));
    expect(modules.sort()).toEqual([...CardType.options].sort());
    expect(Object.keys(CARD_UI).sort()).toEqual([...CardType.options].sort());
    for (const type of CardType.options) {
      const ui = CARD_UI[type];
      expect(typeof ui.Body, type).toBe('function');
      expect(typeof ui.Print, type).toBe('function');
      expect(typeof ui.pptx, type).toBe('function');
    }
  });

  it.each(CardType.options)('%s: the fixture card is valid and renders at every LOD, in the reader and in print', (type) => {
    const card = cardOf(type);
    expect(cardDataSchema(type).safeParse(card.data).success).toBe(true);
    const ui = CARD_UI[type];
    for (const lod of ['full', 'compact'] as const) html(createElement(ui.Body, { card, lod }));
    if (ui.TitleExtra) html(createElement(ui.TitleExtra, { card }));
    if (ui.Reader) html(createElement(ui.Reader, { card }));
    for (const mode of ['canvas', 'figure'] as const) {
      const printed = html(createElement(PrintCard, { card, mode }));
      expect(printed).toContain(`data-card-type="${type}"`);
      // Every printed card carries its marker (the image's caption is its alt text and title); a diagram's marker is
      // a node label, drawn later by Mermaid (print.spec checks it in the PDF).
      if (type !== 'diagram') expect(printed, `${type} ${mode}`).toContain(PRINT_MARKERS[type]);
    }
    const slide = ui.pptx(card);
    expect(slide).toMatchObject({ type });
    expect(['chart', 'table', 'image', 'snapshot', 'metric', 'text']).toContain(slide.kind);
    expect(`${slide.title} ${slide.text}`).toContain(type === 'diagram' ? 'Flow' : PRINT_MARKERS[type]);
  });

  it('every type uses the pptx hook, which names how the card exports (P6.17)', () => {
    for (const type of CardType.options) expect(CARD_UI[type].pptx).toBe(pptxHook);
    const kinds = Object.fromEntries(CardType.options.map((t) => [t, pptxHook(cardOf(t)).kind]));
    expect(kinds).toMatchObject({
      chart: 'chart',
      table: 'table',
      matrix: 'table',
      image: 'image',
      design: 'snapshot',
      metric: 'metric',
      note: 'text',
      source: 'text',
    });
  });

  it('a design frame without a snapshot prints its own page (not a srcdoc)', () => {
    const printed = html(createElement(PrintCard, { card: cardOf('design'), mode: 'canvas' }));
    expect(printed).toContain('data-testid="print-design-live"');
    expect(printed).toContain('sandbox="allow-scripts"');
    expect(printed).not.toContain('srcdoc');
  });
});
