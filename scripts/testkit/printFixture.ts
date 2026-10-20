/**
 * The export fixture (BUILD_PLAN P4.4, Gate 4 "all 11 card types appear in both export modes"; P6.2: every card
 * type, driven by the card-type list): a canvas with one card of every type, spread over `frames` frames (10 by
 * default, for the 10-frame PDF timing), with links, a user note on a card, real image/PDF assets, a scripted design
 * frame (Chart.js, P6.2) and a Mermaid diagram. Every card carries a unique marker word in its text, so a test can
 * find each one in the PDF's text.
 *
 * `FIXTURE_CARDS` is a `Record<CardType, …>`: a new card type does not compile until it has a fixture card, and it
 * then shows up in every export test (print.spec, port.spec, a11y.spec) and in the UI render test
 * (apps/ui/test/cardplatform.unit.test.ts).
 *
 * Written through the orb-canvas service (`CanvasStore.command` / `writeAsset`), the only writer of canvas files.
 */
import { CanvasStore } from '@orb/canvas';
import { chartPoints, databaseDataOf, plotTableOfDataset, newCardView, type Actor, type AssetRef, type CardType, type CardView, type DatabaseData } from '@orb/shared';
import { makePdf, makePng } from './fixtures.ts';

export const PRINT_URLS = {
  source: 'https://example.com/orb-print-source',
  quote: 'https://example.org/orb-print-quote',
} as const;

/** The marker word each card's printed text contains (design: its title; image: its caption). */
export const PRINT_MARKERS: Record<CardType, string> = {
  note: 'Notemarker',
  source: 'Sourcemarker',
  quote: 'Quotemarker',
  image: 'Imagemarker',
  file: 'Filemarker',
  question: 'Questionmarker',
  risk: 'Riskmarker',
  design: 'Designmarker',
  diagram: 'Diagrammarker',
  table: 'Tablemarker',
  doc: 'Docmarker',
  database: 'Databasemarker',
  chart: 'Chartmarker',
  metric: 'Metricmarker',
  timeline: 'Timelinemarker',
  matrix: 'Matrixmarker',
  insight: 'Insightmarker',
  hypothesis: 'Hypothesismarker',
  decision: 'Decisionmarker',
  framework: 'Frameworkmarker',
  entity: 'Entitymarker',
  product: 'Productmarker',
  video: 'Videomarker',
  code: 'Codemarker',
  math: 'Mathmarker',
  checklist: 'Checklistmarker',
  research: 'Researchmarker',
  watch: 'Watchmarker',
};

export type PrintFixture = {
  canvasId: string;
  title: string;
  frameIds: string[];
  cards: Record<CardType, string>;
  /** Every card on the board (the typed cards and the extra notes). */
  cardCount: number;
};

const agent = (who: 'orb' | 'scout' | 'critic' | 'builder'): Actor => ({
  kind: 'agent',
  agent: who,
  model: 'gpt-6-luna',
  sessionId: `orb-fixture-${who}`,
});

/** The colour the design frame's script paints its top-right corner (the snapshot proves the script ran). */
export const DESIGN_SCRIPT_RGB = [255, 0, 170] as const;
/** The bar colour of the design frame's Chart.js chart. */
export const DESIGN_CHART_RGB = [37, 99, 235] as const;

export const DESIGN_HTML = [
  '<!doctype html><html><head><style>',
  'body{margin:0;font:16px sans-serif;background:#f4f6fb;color:#11171d}main{padding:40px}',
  '.cta{background:#16a34a;color:#fff;border:0;border-radius:8px;padding:12px 24px}',
  '#ran{position:absolute;right:0;top:0;width:48px;height:48px}',
  '</style></head><body><main><h1>Create your orb account</h1><p id="note">Research with a team of agents.</p>',
  '<button class="cta">Start</button><canvas id="chart" width="520" height="140"></canvas></main><div id="ran"></div>',
  '<script>',
  `document.getElementById('ran').style.background = 'rgb(${DESIGN_SCRIPT_RGB.join(', ')})';`,
  "new Chart(document.getElementById('chart'), {type: 'bar', data: {labels: ['Q1', 'Q2', 'Q3'], datasets: ",
  `[{data: [3, 5, 8], backgroundColor: 'rgb(${DESIGN_CHART_RGB.join(', ')})'}]}, options: {responsive: false, `,
  'plugins: {legend: {display: false}}}});',
  '</script></body></html>',
].join('');

/** The assets the fixture's image and file cards point at. */
export type FixtureAssets = {
  image: AssetRef;
  pdf: AssetRef;
  thumb: AssetRef;
  /** P6.3: the Database card's data and view (its dataset is written first). */
  database: { data: DatabaseData; view: CardView };
  /** P6.4: the Chart card's data (bound to the Database's dataset). */
  chart: Record<string, unknown>;
  /** P6.5: the two cards the insight cites (the seed sets the real ids once they exist). */
  cited: [string, string];
};

/** One fixture card: where it goes, who made it, its data, and the card fields beside the data. */
export type FixtureCard = {
  frame: number;
  slot: number;
  actor: Actor;
  data: (assets: FixtureAssets) => unknown;
  extra?: Record<string, unknown>;
  size?: { w: number; h: number };
};

const m = PRINT_MARKERS;

/** One card of every type. Frames: 1 sources (Scout), 2 media (user), 3 critique, 4 Builder, 5 notes. */
export const FIXTURE_CARDS: Record<CardType, FixtureCard> = {
  source: {
    frame: 0,
    slot: 0,
    actor: agent('scout'),
    data: () => ({
      url: PRINT_URLS.source,
      title: `${m.source} market study`,
      summary: 'A market study of research tools.',
    }),
    extra: { why: 'Sizes the market for the thesis', badge: 'must' },
  },
  quote: {
    frame: 0,
    slot: 1,
    actor: agent('scout'),
    data: () => ({ title: 'Research weekly', body: `${m.quote}: the board is the research.`, url: PRINT_URLS.quote }),
    extra: { why: 'States the thesis in one line' },
  },
  image: {
    frame: 1,
    slot: 0,
    actor: { kind: 'user' },
    data: (a) => ({ asset: a.image, title: `${m.image} chart`, width: 320, height: 200 }),
  },
  file: {
    frame: 1,
    slot: 1,
    actor: { kind: 'user' },
    data: (a) => ({ asset: a.pdf, title: `${m.file} report`, pages: 3, thumb: a.thumb }),
  },
  question: {
    frame: 2,
    slot: 0,
    actor: agent('critic'),
    data: () => ({ title: `${m.question}: who pays first?`, body: 'Researchers or their teams.', state: 'open' }),
    extra: { why: 'The buyer is unclear' },
  },
  risk: {
    frame: 2,
    slot: 1,
    actor: agent('critic'),
    data: () => ({ title: `${m.risk}: boards get cluttered`, body: 'Too many cards hide the thread.', kind: 'risk' }),
    extra: { why: 'Clutter kills the canvas' },
  },
  design: {
    frame: 3,
    slot: 0,
    actor: agent('builder'),
    data: () => ({
      title: `${m.design} sign up`,
      body: 'The sign-up screen.',
      html: DESIGN_HTML,
      updatedAt: Date.now(),
      version: 2,
    }),
    extra: { why: 'Shows the first screen' },
    size: { w: 340, h: 300 },
  },
  diagram: {
    frame: 3,
    slot: 1,
    actor: agent('builder'),
    data: () => ({
      title: 'Flow',
      body: 'How research flows.',
      mermaid: `flowchart LR\n  A[${m.diagram} ask] --> B[Scout reads]\n  B --> C[Port]`,
    }),
    extra: { why: 'Maps the flow' },
  },
  table: {
    frame: 3,
    slot: 2,
    actor: agent('builder'),
    data: () => ({
      title: `${m.table} pricing`,
      columns: ['Plan', 'Price'],
      rows: [
        ['Free', '0'],
        ['Pro', '20'],
        ['Team', '50'],
      ],
      totalRows: 3,
    }),
    extra: { why: 'Compares the plans' },
  },
  note: {
    frame: 4,
    slot: 0,
    actor: { kind: 'user' },
    data: () => ({ title: `${m.note} my idea`, body: 'Run the brainstorm on the board.' }),
    extra: { note: 'Check with the team' },
  },
  doc: {
    frame: 4,
    slot: 1,
    actor: agent('orb'),
    data: () => ({ title: `${m.doc} draft`, body: 'A short draft of the thesis written by Orb.' }),
    extra: { why: 'Summarises the board so far' },
  },
  database: {
    frame: 3,
    slot: 3,
    actor: agent('builder'),
    data: (a) => a.database.data,
    extra: { why: 'Holds the pipeline rows' },
    size: { w: 340, h: 300 },
  },
  chart: {
    frame: 3,
    slot: 4,
    actor: agent('builder'),
    data: (a) => a.chart,
    extra: { why: 'Shows ARR by company' },
    size: { w: 340, h: 300 },
  },
  metric: {
    frame: 0,
    slot: 2,
    actor: agent('scout'),
    data: () => ({
      title: `${m.metric} ARR`,
      value: '$4.2M',
      change: { value: '+12%', direction: 'up', good: true },
      period: 'FY2025',
      source: { url: PRINT_URLS.source },
    }),
    extra: { why: 'The headline figure' },
  },
  timeline: {
    frame: 0,
    slot: 3,
    actor: agent('scout'),
    data: () => ({
      title: `${m.timeline} history`,
      events: [
        { date: '2023-05', label: 'Seed round', source: { url: PRINT_URLS.source } },
        { date: '2024', label: 'Launch', detail: 'Public beta.', source: { label: 'Company blog' } },
        { date: '2025-09-30', label: 'Series A', source: { url: PRINT_URLS.quote } },
      ],
    }),
    extra: { why: 'Orders the milestones' },
    size: { w: 340, h: 300 },
  },
  matrix: {
    frame: 3,
    slot: 5,
    actor: agent('builder'),
    data: () => ({
      title: `${m.matrix} vendors`,
      criteria: [
        { name: 'Cost', weight: 3 },
        { name: 'Speed', weight: 1 },
      ],
      options: [
        { name: 'Alpha', scores: [8, 5] },
        { name: 'Beta', scores: [4, 9] },
      ],
    }),
    extra: { why: 'Weighs the vendors' },
  },
  hypothesis: {
    frame: 2,
    slot: 2,
    actor: agent('critic'),
    data: (a) => ({
      title: `${m.hypothesis}: teams pay first`,
      body: 'Buying is a team decision.',
      confidence: 70,
      evidenceFor: [a.cited[0]],
      evidenceAgainst: [a.cited[1]],
    }),
    extra: { why: 'Tests who the buyer is' },
    size: { w: 340, h: 300 },
  },
  framework: {
    frame: 2,
    slot: 3,
    actor: agent('critic'),
    data: () => ({
      title: `${m.framework} plan fit`,
      variant: 'swot',
      cells: {
        strengths: ['Cheap to start'],
        weaknesses: ['Few integrations'],
        opportunities: ['Teams adopt together'],
        threats: ['Incumbents bundle it'],
      },
    }),
    extra: { why: 'Weighs the plan from four sides' },
    size: { w: 340, h: 300 },
  },
  insight: {
    frame: 4,
    slot: 2,
    actor: agent('builder'),
    data: (a) => ({
      title: `${m.insight}: the board is the product`,
      body: 'Both sources point to the board as the thing people keep.',
      citations: [...a.cited],
    }),
    extra: { why: 'What the sources add up to' },
    size: { w: 340, h: 300 },
  },
  decision: {
    frame: 4,
    slot: 3,
    actor: agent('builder'),
    data: () => ({
      title: `${m.decision}: which plan`,
      options: [
        { label: 'Pro', scores: [8, 6] },
        { label: 'Team', scores: [6, 9] },
      ],
      criteria: [
        { name: 'Price', weight: 2 },
        { name: 'Reach', weight: 1 },
      ],
      choice: 'Pro',
      rationale: 'Cheapest for one researcher.',
      status: 'decided',
    }),
    extra: { why: 'Picks the first plan to ship' },
    size: { w: 340, h: 300 },
  },
  // P6.6: entity and media cards
  entity: {
    frame: 1,
    slot: 3,
    actor: agent('scout'),
    data: () => ({
      title: `${m.entity} Ada Lovelace`,
      kind: 'person',
      role: 'Analyst',
      org: 'Analytical Engines',
      body: 'Wrote the first program.',
      facts: [{ label: 'Born', value: '1815' }],
    }),
    extra: { why: 'The person behind the thesis' },
  },
  product: {
    frame: 1,
    slot: 4,
    actor: agent('scout'),
    data: () => ({
      title: `${m.product} Notebook Pro`,
      kind: 'competitor',
      vendor: 'Acme',
      body: 'A research notebook.',
      pricing: '$20 per month',
      strengths: ['Fast search'],
      weaknesses: ['No agents'],
    }),
    extra: { why: 'The closest competitor' },
  },
  video: {
    frame: 1,
    slot: 2,
    actor: { kind: 'user' },
    data: (a) => ({
      title: `${m.video} launch talk`,
      url: 'https://www.youtube.com/watch?v=orbprint',
      author: 'Acme',
      duration: '12:30',
      thumb: a.thumb,
    }),
  },
  code: {
    frame: 4,
    slot: 4,
    actor: agent('builder'),
    data: () => ({
      title: `${m.code} snippet`,
      language: 'python',
      code: 'def total(rows):\n    return sum(r["arr"] for r in rows)  # annual\n',
    }),
    extra: { why: 'Shows the calculation' },
  },
  math: {
    frame: 2,
    slot: 4,
    actor: agent('critic'),
    data: () => ({ title: `${m.math} growth`, latex: 'g = \\frac{ARR_1 - ARR_0}{ARR_0}' }),
    extra: { why: 'Defines the growth rate' },
  },
  checklist: {
    frame: 2,
    slot: 5,
    // The user's: an agent's checklist starts with every item open (it cannot tick), and this one has a tick.
    actor: { kind: 'user' },
    data: () => ({
      title: `${m.checklist} to verify`,
      items: [
        { id: 'i1', text: 'Check the market size source', done: false },
        { id: 'i2', text: 'Call two customers', done: true },
      ],
    }),
  },
  research: {
    frame: 0,
    slot: 4,
    actor: agent('scout'),
    data: () => ({
      title: `${m.research} market report`,
      kind: 'deep_research',
      status: 'completed',
      processor: 'pro',
      runId: 'trun_fixture',
      estCostUsd: 0.1,
      progress: 100,
      sourcesRead: 12,
      summary: 'The market grows 14% a year [1]. Pricing is the open question [2].',
      fields: [{ field: 'output', confidence: 'high', reasoning: 'Cross-checked on two sources.' }],
      citations: [
        { url: PRINT_URLS.source, title: 'Market study', excerpt: 'A market study of research tools.', fields: ['output'] },
        { url: PRINT_URLS.quote, title: 'Research weekly', fields: ['output'] },
      ],
    }),
    extra: { why: 'Deep research on the market' },
  },
  watch: {
    frame: 0,
    slot: 5,
    actor: agent('orb'),
    data: () => ({
      title: `${m.watch} competitor launches`,
      query: 'New product launches by research-tool competitors',
      frequency: '1d',
      processor: 'lite',
      monitorId: 'monitor_fixture',
      status: 'active',
      monthlyUsd: 0.09,
      eventCount: 1,
      events: [{ id: 'mevent_1', date: '2026-10-14', summary: 'A competitor shipped a canvas mode.' }],
    }),
    extra: { why: 'Tracks launches over time' },
  },
};

export async function seedPrintFixture(
  home: string,
  options: { frames?: number; title?: string } = {},
): Promise<PrintFixture> {
  const nFrames = Math.max(5, options.frames ?? 10);
  const title = options.title ?? 'Print fixture board';
  const store = new CanvasStore({ home, searchIndex: false, flushMs: 5 });
  try {
    const meta = await store.create({ prompt: title });
    const id = meta.id;
    const frameIds: string[] = [];
    const FRAME = { w: 760, h: 700 };
    const names = ['Sources', 'Media', 'Critique', 'Builder', 'Notes'];
    for (let i = 0; i < nFrames; i++) {
      const event = await store.command(id, {
        type: 'frame.added',
        frame: {
          title: names[i] ?? `Frame ${i + 1}`,
          color: (['sky', 'signal', 'rho', 'paper'] as const)[i % 4]!,
          x: 80 + (i % 4) * (FRAME.w + 120),
          y: 120 + Math.floor(i / 4) * (FRAME.h + 120),
          ...FRAME,
        },
      });
      frameIds.push((event.data as { frame: { id: string } }).frame.id);
    }
    const frameAt = (i: number) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      return { x: 80 + col * (FRAME.w + 120), y: 120 + row * (FRAME.h + 120) };
    };
    const cards = {} as Record<CardType, string>;
    let cardCount = 0;
    const write = async (name: string, mime: 'image/png' | 'application/pdf', bytes: Uint8Array) =>
      store.writeAsset(id, {
        name,
        mime,
        data: (async function* () {
          yield bytes;
        })(),
      });
    const pipeline = await store.datasets.create(
      id,
      `${m.database} pipeline`,
      ['Company', 'Stage', 'ARR'],
      [
        ['Acme', 'Seed', '1.2'],
        ['Globex', 'Series A', '4.5'],
        ['Initech', 'Seed', '0.8'],
      ],
      agent('builder'),
    );
    const assets: FixtureAssets = {
      database: {
        data: databaseDataOf(`${m.database} pipeline`, pipeline.dataset),
        view: newCardView(pipeline.dataset),
      },
      chart: (() => {
        const spec = { mark: 'bar' as const, x: 'Company', y: 'ARR' };
        const plot = chartPoints(spec, plotTableOfDataset(pipeline.dataset));
        return {
          title: `${m.chart} ARR by company`,
          ...spec,
          source: { kind: 'dataset', datasetId: pipeline.dataset.id },
          points: plot.points,
          xType: plot.xType,
          rev: pipeline.dataset.rev,
        };
      })(),
      image: await write('chart.png', 'image/png', new Uint8Array(makePng(320, 200, [96, 165, 250]))),
      pdf: await write('report.pdf', 'application/pdf', new Uint8Array(makePdf(3, 'Fixture PDF'))),
      thumb: await write('report-thumb.png', 'image/png', new Uint8Array(makePng(120, 160, [17, 23, 29]))),
      cited: ['c_placeholder1', 'c_placeholder2'],
    };
    for (const [type, spec] of Object.entries(FIXTURE_CARDS) as [CardType, FixtureCard][]) {
      // Types beyond the first five frames' plan go round the remaining frames.
      const frame = Math.min(spec.frame, nFrames - 1);
      const f = frameAt(frame);
      const size = spec.size ?? { w: 340, h: 230 };
      const event = await store.command(
        id,
        {
          type: 'card.added',
          card: {
            type,
            frameId: frameIds[frame]!,
            x: f.x + 24 + (spec.slot % 2) * 370,
            y: f.y + 56 + Math.floor(spec.slot / 2) * 330,
            ...size,
            data: spec.data(assets),
            ...spec.extra,
            ...(type === 'database' ? { view: assets.database.view } : {}),
          },
        } as never,
        spec.actor,
      );
      cards[type] = (event.data as { card: { id: string } }).card.id;
      cardCount += 1;
      // P6.5: the insight and the hypothesis cite the source and the quote (placed first).
      if (cards.source && cards.quote) assets.cited = [cards.source, cards.quote];
    }
    const { source, quote, question, risk } = cards;

    // The other frames: one note each.
    for (let i = 5; i < nFrames; i++) {
      const f = frameAt(i);
      await store.command(id, {
        type: 'card.added',
        card: {
          type: 'note',
          frameId: frameIds[i]!,
          x: f.x + 24,
          y: f.y + 56,
          w: 300,
          h: 160,
          data: { title: `Extra note ${i + 1}`, body: 'More thinking.' },
        },
      } as never);
      cardCount += 1;
    }

    await store.command(id, {
      type: 'link.added',
      link: { from: source, to: quote, type: 'supports' },
    } as never);
    await store.command(id, {
      type: 'link.added',
      link: { from: risk, to: question, type: 'tension' },
    } as never);
    await store.flush();
    return { canvasId: id, title, frameIds, cards, cardCount };
  } finally {
    await store.close();
  }
}
