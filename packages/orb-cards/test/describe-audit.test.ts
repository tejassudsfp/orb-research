/**
 * P6.8 audit: every card type describes itself to agents (`describe()`), and the guides built from the type list are
 * complete. The print half of every type is covered by apps/ui/test/cardplatform.unit.test.ts (each fixture card
 * prints in both export modes and carries its marker); this checks the agent-facing half on the same fixture cards:
 * a describe() text exists for every type, is one clipped line, names what the card is about (its marker word, the
 * thing a reader or an agent would search for), and never leaks JSON or "undefined".
 */
import { describe, expect, it } from 'vitest';
import {
  AgentName,
  CardType,
  PLACEABLE_TYPES,
  WHEN_TO_USE,
  cardTitle,
  cardGuideFor,
  chartPoints,
  databaseDataOf,
  datasetFromRows,
  newCardView,
  plotTableOfDataset,
  type Card,
} from '@orb/shared';
import { CARD_REGISTRY, DESCRIBE_MAX, describeCard } from '@orb/cards';
import { FIXTURE_CARDS, PRINT_MARKERS, type FixtureAssets } from '../../../scripts/testkit/printFixture.ts';

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

const cardOf = (type: CardType): Card => {
  const spec = FIXTURE_CARDS[type];
  return {
    id: `c_${type}1`,
    type,
    frameId: null,
    x: 0,
    y: 0,
    w: 340,
    h: 230,
    data: spec.data(assets),
    provenance: { kind: 'user', at: 1 },
    ...(spec.extra as object),
  } as Card;
};

describe('describe() of every card type', () => {
  it.each(CardType.options)('%s: one clipped line that says what the card is about', (type) => {
    const text = describeCard(cardOf(type));
    expect(text.length, type).toBeGreaterThan(8);
    expect(text.length, type).toBeLessThanOrEqual(DESCRIBE_MAX);
    expect(text, type).not.toMatch(/\n/);
    expect(text, type).not.toMatch(/undefined|\[object|NaN|\{"/);
    // The marker word of the fixture card is in its title or its text. Agents read the pair (query_board gives the
    // title beside the description), so the pair must carry it (a diagram's marker is a Mermaid node label).
    const card = cardOf(type);
    if (type !== 'diagram') expect(`${cardTitle(card)} ${text}`, `${type}: ${text}`).toContain(PRINT_MARKERS[type]);
  });

  it('a card with empty data still describes itself without throwing', () => {
    for (const type of CardType.options) {
      expect(() => describeCard({ type, data: {} }), type).not.toThrow();
      expect(() => describeCard({ type, data: null }), type).not.toThrow();
    }
  });
});

describe('the "when to use which card" guide', () => {
  it('has a line for every card type, and the registry has a purpose for every type', () => {
    expect(Object.keys(WHEN_TO_USE).sort()).toEqual([...CardType.options].sort());
    for (const type of CardType.options) {
      expect(WHEN_TO_USE[type].length, type).toBeGreaterThan(10);
      expect(WHEN_TO_USE[type].length, type).toBeLessThanOrEqual(130);
      expect(CARD_REGISTRY[type].purpose, type).toBeTruthy();
    }
  });

  it('a role is told exactly the types it may place, and a persona stays compact', () => {
    for (const role of AgentName.options) {
      const guide = cardGuideFor(role);
      for (const type of CardType.options) {
        const listed = guide.includes(`\n- ${type}: `);
        expect(listed, `${role} ${type}`).toBe(PLACEABLE_TYPES[role].includes(type));
      }
      expect(guide.length, role).toBeLessThan(2_600);
    }
  });
});
