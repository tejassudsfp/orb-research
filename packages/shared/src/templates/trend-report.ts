/**
 * Trend report (P6.15). The depth bar is docs/phase6/vc-dd-template.md; the human-readable spec of this file is
 * docs/templates/trend-report.md (generated: `pnpm templates:docs`, and a test keeps the two equal). An ongoing
 * template: its leading indicators can be watched with a Parallel monitor.
 */
import type { RedFlag, RubricDimension, TemplateSpecInput } from './schema.js';
import {
  chart,
  checklist,
  db,
  decision,
  depthField,
  doc,
  emptyRisk,
  framework,
  hypothesis,
  materialsField,
  matrix,
  metric,
  question,
  sitesField,
  step,
  tiers,
  timeline,
} from './kit-research.js';

// ---- the trend-strength rubric (weights add up to 100) ----

export const TREND_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'evidence',
    name: 'Breadth of evidence',
    weight: 20,
    anchors: {
      1: 'A few articles or one vendor survey.',
      3: 'Several independent data sources agree.',
      5: 'Many independent, hard-data sources across regions and sectors.',
    },
    frame: 'signals',
  },
  {
    id: 'momentum',
    name: 'Momentum',
    weight: 20,
    anchors: {
      1: 'Flat or falling on the measured series.',
      3: 'Growing steadily.',
      5: 'Accelerating across several measures.',
    },
    frame: 'adoption',
  },
  {
    id: 'adoption',
    name: 'Real adoption',
    weight: 20,
    anchors: {
      1: 'Talk and announcements, no users.',
      3: 'Early adopters and pilots.',
      5: 'Mainstream use, with revenue or behaviour to show for it.',
    },
    frame: 'adoption',
  },
  {
    id: 'drivers',
    name: 'Strength of drivers',
    weight: 15,
    anchors: {
      1: 'Depends on one fragile driver (a subsidy, a fad).',
      3: 'Several drivers, some uncertain.',
      5: 'Multiple reinforcing structural drivers.',
    },
    frame: 'drivers',
  },
  {
    id: 'durability',
    name: 'Durability (not hype)',
    weight: 15,
    anchors: {
      1: 'Looks like a fad: spike-driven, no retention.',
      3: 'Likely to last, with open questions.',
      5: 'Structural and compounding over years.',
    },
    frame: 'counter',
  },
  {
    id: 'impact',
    name: 'Size of impact',
    weight: 10,
    anchors: {
      1: 'Niche, little effect on money or behaviour.',
      3: 'Meaningful for some sectors.',
      5: 'Large effect across sectors or society.',
    },
    frame: 'implications',
  },
];

// ---- the red-flag checklist (Critic clears or raises each) ----

export const TREND_RED_FLAGS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: 'The trend rests on one source, or on sources that copy each other.',
    check: 'Count independent origins in the Signals database; a claim whose Source column traces to one origin is raised.',
  },
  {
    id: 'RF02',
    text: 'A survey or forecast funded by a party that sells into the trend.',
    check: 'Check who sponsored each survey or market forecast and record it in Signals; raise sponsored-only claims.',
  },
  {
    id: 'RF03',
    text: 'Extrapolation from a short window or a single spike (a launch, a news cycle).',
    check: 'Look at the span of each series in the Indicators database; raise a trend inferred from less than about a year.',
  },
  {
    id: 'RF04',
    text: 'Search interest or social buzz is the only evidence of adoption.',
    check: 'Look for usage, revenue, shipment or behaviour data next to the buzz; raise when none exists.',
  },
  {
    id: 'RF05',
    text: 'Survivorship bias: only the winners are counted.',
    check: 'Look for failed companies and abandoned projects in the Players database and the counter-trends.',
  },
  {
    id: 'RF06',
    text: 'The trend is driven by a subsidy, a temporary condition or cheap money.',
    check: 'Read the Drivers database for a driver that expires or depends on policy; raise it with its date.',
  },
  {
    id: 'RF07',
    text: 'Regional or demographic bias: the evidence comes from one place or group.',
    check: 'Check the geography and segment of the Signals rows; raise a claim stated globally from one region.',
  },
  {
    id: 'RF08',
    text: 'Conflating adoption with intent: surveys of plans rather than behaviour.',
    check: 'Separate "plans to" from "uses" in the Signals Type column; raise claims built on intent.',
  },
  {
    id: 'RF09',
    text: 'A strong counter-trend or substitute is growing faster.',
    check: 'Compare the series in the Indicators database with the counter-trends in Counter-trends & skeptics.',
  },
  {
    id: 'RF10',
    text: 'The definition of the trend keeps changing, so the numbers cannot be compared.',
    check: 'Compare how each source defines the trend; raise sources that count different things.',
  },
  {
    id: 'RF11',
    text: 'Forecast numbers differ widely between sources with no explanation.',
    check: 'Compare the forecasts in Signals by year; raise a spread above about 3x and say what explains it.',
  },
  {
    id: 'RF12',
    text: 'Data are old or the series stopped being updated.',
    check: 'Check the Date column of the key indicators; raise any not updated in the last year.',
  },
];

export const TREND_REPORT: TemplateSpecInput = {
  id: 'trend-report',
  label: 'Trend report',
  dot: '#B45309',
  placeholder: 'Which trend or theme do you want to understand?',
  brief:
    'Write a trend report: a definition and the signals that show it, the drivers and forces behind it, the data on ' +
    'adoption, the early movers, the counter-trends and skeptics, scenarios, the implications and opportunities, and ' +
    'the leading indicators to watch, scored by a trend-strength rubric. Separate hard data from buzz and surveys of ' +
    'intent, show the evidence against the trend, give each number a source and a date, and say how confident you are.',
  titleFrom: 'Trend report: {{trend}}',

  inputs: [
    {
      id: 'trend',
      label: 'Trend or theme',
      kind: 'text',
      required: true,
      placeholder: 'Remote-first work',
      maxLength: 160,
    },
    {
      id: 'domain',
      label: 'Industry or domain',
      kind: 'text',
      placeholder: 'Commercial real estate',
      suggestions: ['Consumer', 'Enterprise software', 'Health care', 'Energy', 'Finance', 'Education', 'Media', 'Retail', 'Mobility', 'Manufacturing'],
      group: 'scope',
      maxLength: 120,
    },
    {
      id: 'geography',
      label: 'Geography',
      kind: 'text',
      placeholder: 'Global, or a region',
      group: 'scope',
      maxLength: 120,
    },
    {
      id: 'horizon',
      label: 'Time horizon',
      kind: 'select',
      options: ['1 year', '3 years', '5 years', '10 years'],
      group: 'when',
      maxLength: 40,
    },
    {
      id: 'audience',
      label: 'Audience',
      kind: 'select',
      options: ['Leadership team', 'Investors', 'Product team', 'Marketing and brand', 'Policy makers', 'General readers'],
      group: 'when',
      maxLength: 40,
    },
    {
      id: 'question',
      label: 'What you need to decide',
      kind: 'longtext',
      placeholder: 'Should we build for this now or in two years?',
      maxLength: 1500,
    },
    {
      id: 'claims',
      label: 'Claims you want tested',
      kind: 'longtext',
      placeholder: 'Everyone says it will double by 2028.',
      maxLength: 1500,
    },
    {
      id: 'players',
      label: 'Known early movers',
      kind: 'list',
      placeholder: 'Companies, products, places. Comma separated',
      help: 'Optional. Scout finds more.',
      maxLength: 800,
    },
    {
      id: 'signals',
      label: 'Signals to track',
      kind: 'list',
      placeholder: 'Search interest, job posts, funding, patents',
      help: 'Optional. They become the leading indicators.',
      maxLength: 800,
    },
    materialsField('Drop a report, survey results, a dataset (CSV) or notes. Each becomes a card or database.'),
    depthField(),
    sitesField([
      { domain: 'statista.com', label: 'Statista' },
      { domain: 'gartner.com', label: 'Gartner' },
      { domain: 'crunchbase.com', label: 'Crunchbase' },
      { domain: 'similarweb.com', label: 'Similarweb' },
    ]),
  ],

  frames: [
    {
      id: 'definition',
      title: 'Trend definition',
      color: 'signal',
      brief:
        'What the trend is and is not, in one precise paragraph: the behaviour, technology or condition that is changing, ' +
        'the scope (domain, geography, horizon), where it began and the headline numbers. Everything else is checked ' +
        'against this definition.',
      owners: ['orb'],
      targets: [
        { type: 'doc', min: 1, note: 'the definition' },
        { type: 'metric', min: 4 },
        { type: 'hypothesis', min: 1 },
      ],
      seeds: [
        doc(
          'Definition',
          '{{trend}}. Domain: {{domain|to confirm}}. Geography: {{geography|to confirm}}. Horizon: {{horizon|to confirm}}. orb sharpens this after the first pass: what counts and what does not.',
          'Your trend, from the intake.',
        ),
        hypothesis('The trend is real and durable', 'Your doubts to test: {{claims|none given.}} Link the evidence for and against.'),
        metric('Headline figure', 'The single number that best shows the trend, with its source and date.'),
        metric('Growth rate', 'Annual growth of the main measure, with the period.'),
        metric('Where it stands', 'Adoption or penetration today, with the source and year.'),
        metric('Forecast', 'A forecast for the horizon, with who made it and who paid for it.'),
      ],
      room: 300,
    },
    {
      id: 'signals',
      title: 'Signals & evidence',
      color: 'sky',
      brief:
        'Every piece of evidence that the trend exists: data series, product launches, funding, policy, research, job ' +
        'posts, search interest and behaviour. One row each with its type (hard data, event, survey of behaviour, survey ' +
        'of intent, buzz), the date, the direction (strengthens or weakens) and a strength rating.',
      owners: ['scout', 'critic', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'the Signals database, at least 25 rows on Standard' },
        { type: 'chart', min: 2, note: 'signals by type and over time' },
        { type: 'source', min: 5 },
      ],
      seeds: [
        db('Signals', 'signals'),
        chart('Signals over time', 'signals', 'line', 'Date', undefined, 'Direction'),
        chart('Signals by type', 'signals', 'bar', 'Type'),
      ],
    },
    {
      id: 'drivers',
      title: 'Drivers & forces',
      color: 'rho',
      brief:
        'What makes the trend happen: the technological, economic, social, environmental, political and regulatory forces ' +
        'behind it, each with the direction, the strength, the time to full effect and whether it could expire. Look for ' +
        'reinforcing loops.',
      owners: ['scout', 'critic', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Drivers' },
        { type: 'framework', min: 1, note: 'SWOT of the trend' },
        { type: 'diagram', min: 1, note: 'the causal map' },
      ],
      seeds: [
        db('Drivers', 'drivers'),
        framework('Forces for and against: {{trend}}', 'swot'),
        question('Which driver, if it disappeared, would end the trend?'),
      ],
    },
    {
      id: 'adoption',
      title: 'Adoption & data',
      color: 'sky',
      brief:
        'How far and how fast it has spread: the adoption curve by segment and region, the data series behind it (usage, ' +
        'shipments, revenue, penetration), the stage on the diffusion curve and the saturation point. Use official or ' +
        'primary data first.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Indicators, with a series per measure' },
        { type: 'chart', min: 2, note: 'the main series and a regional split' },
        { type: 'metric', min: 3 },
        { type: 'timeline', min: 1 },
      ],
      seeds: [
        db('Indicators', 'indicators'),
        chart('Main indicators over time', 'indicators', 'line', 'Date', 'Value', 'Indicator'),
        timeline('Milestones of the trend', 'Report started', 'Scout adds the dated events that shaped the trend, each with a source.'),
        metric('Adoption today', 'Share of the target population using it, with source and year.'),
        metric('Years to saturation', 'Estimate with the method; say who made it.'),
      ],
    },
    {
      id: 'players',
      title: 'Players & early movers',
      color: 'rho',
      brief:
        'Who is ahead: companies, products, projects, cities or institutions that moved first, what each did, how it is ' +
        'going and what to learn from it. Include the ones that failed.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Players, at least 10 on Standard' },
        { type: 'entity', min: 3 },
        { type: 'quote', min: 3 },
      ],
      seeds: [db('Players', 'players'), question('What do the early movers know that the rest do not?')],
    },
    {
      id: 'counter',
      title: 'Counter-trends & skeptics',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. ' +
        'Also collect the strongest case against the trend: counter-trends, substitutes, failed predictions of the same kind ' +
        'and the skeptics’ best arguments, each with a source.',
      owners: ['critic', 'scout'],
      targets: [
        { type: 'risk', min: 6, note: 'every checklist item cleared with a source or raised' },
        { type: 'quote', min: 3, note: 'the skeptics in their own words' },
      ],
      seeds: [
        {
          type: 'checklist',
          data: {
            title: 'Red-flag checklist',
            items: TREND_RED_FLAGS.map((f, i) => ({ id: `rf${i + 1}`, text: `${f.id} ${f.text}`, done: false })),
          },
          why: 'Critic raises or clears each; you tick them off.',
        },
        emptyRisk('Evidence'),
        emptyRisk('Hype'),
        emptyRisk('Counter-trend'),
        emptyRisk('Timing'),
      ],
    },
    {
      id: 'scenarios',
      title: 'Scenarios',
      color: 'sky',
      brief:
        'Where it could go by the end of the horizon: three or four scenarios built on the two most uncertain drivers, ' +
        'each with the conditions that lead to it, what it looks like, the probability and the signals that show it is ' +
        'happening.',
      owners: ['orb', 'builder'],
      targets: [
        { type: 'framework', min: 1, note: 'the scenario 2x2' },
        { type: 'hypothesis', min: 3, note: 'one per scenario with a probability' },
        { type: 'timeline', min: 1 },
      ],
      seeds: [
        framework('Scenario 2x2', 'quadrant', { x: 'Pace of adoption', y: 'Strength of the main driver' }),
        hypothesis('Scenario A: the trend accelerates', 'The conditions, what it looks like and the signals that confirm it.', 30),
        hypothesis('Scenario B: the trend plateaus', 'The conditions, what it looks like and the signals that confirm it.', 45),
        hypothesis('Scenario C: the trend reverses', 'The conditions, what it looks like and the signals that confirm it.', 25),
      ],
    },
    {
      id: 'implications',
      title: 'Implications & opportunities',
      color: 'rho',
      brief:
        'What it means for {{audience|the reader}}: who gains and who loses, the opportunities and threats, the actions ' +
        'for each scenario, what to do now, what to prepare and what to avoid. Tie each action to the evidence behind it.',
      owners: ['orb', 'builder'],
      targets: [
        { type: 'framework', min: 1, note: 'pros and cons of acting now' },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
        { type: 'decision', min: 1 },
        { type: 'insight', min: 2 },
      ],
      seeds: [
        matrix(
          'Trend-strength scorecard (rubric score x 2, so 10 is a 5)',
          TREND_RUBRIC.map((d) => [`${d.name} (${d.weight}%)`, d.weight] as [string, number]),
          ['orb score', 'Your score'],
        ),
        framework('Acting now: pros and cons', 'proscons'),
        decision('What to do about {{trend}}', ['Act now', 'Prepare', 'Watch', 'Ignore']),
      ],
    },
    {
      id: 'indicators',
      title: 'Leading indicators & monitoring',
      color: 'signal',
      brief:
        'The few measures that would show early whether the trend is on track or turning: each with its source, how often ' +
        'it updates, the threshold that matters and what to do when it is crossed. orb can watch them with a monitor ' +
        'when the user asks.',
      owners: ['orb', 'scout'],
      targets: [
        { type: 'checklist', min: 1, note: 'the indicators to watch with their thresholds' },
        { type: 'timeline', min: 1 },
      ],
      seeds: [
        checklist('Indicators to watch', [
          'Signals to track from your intake: {{signals|none given yet}}',
          'The headline series, with the update frequency and the source',
          'A threshold that would change the recommendation',
        ]),
        question('Which single indicator would change our mind fastest?'),
      ],
    },
    {
      id: 'questions',
      title: 'Open questions',
      color: 'paper',
      brief:
        'What is still unknown, ranked by importance and linked to the gap behind each: data that does not exist yet, ' +
        'claims that need a second source, and the questions to put to experts.',
      owners: ['critic', 'orb'],
      targets: [{ type: 'checklist', min: 1, note: 'at least 8 ranked questions, each linked to its source card' }],
      seeds: [
        checklist('Questions to answer next', [
          'What you need to decide: {{question|not given yet}}',
          'Which claim has only one source?',
          'Who are the three experts to ask?',
        ]),
      ],
    },
  ],

  databases: [
    {
      key: 'signals',
      name: 'Signals',
      frame: 'signals',
      purpose: 'Every piece of evidence for or against the trend, with its type and who produced it.',
      keyColumn: 'Signal',
      columns: [
        { name: 'Signal', type: 'text' },
        { name: 'Type', type: 'enum', options: ['Hard data', 'Event', 'Product launch', 'Funding', 'Policy', 'Research', 'Behaviour survey', 'Intent survey', 'Buzz'] },
        { name: 'Date', type: 'date' },
        { name: 'Direction', type: 'enum', options: ['Strengthens', 'Weakens', 'Neutral'] },
        { name: 'Strength', type: 'rating', note: '1 (weak) to 5 (strong evidence).' },
        { name: 'Region', type: 'text' },
        { name: 'Producer', type: 'text', note: 'Who produced and who sponsored it.' },
        { name: 'Value', type: 'text', note: 'The figure, with the unit.' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Date', dir: 'desc' }] },
        { name: 'By direction', kind: 'board', group: 'Direction' },
        { name: 'Hard evidence', kind: 'table', filter: [{ column: 'Type', op: 'in', value: ['Hard data', 'Behaviour survey'] }] },
      ],
    },
    {
      key: 'drivers',
      name: 'Drivers',
      frame: 'drivers',
      purpose: 'The forces that cause the trend, and whether each could expire.',
      keyColumn: 'Driver',
      columns: [
        { name: 'Driver', type: 'text' },
        { name: 'Category', type: 'enum', options: ['Technology', 'Economic', 'Social', 'Environmental', 'Political', 'Regulatory'] },
        { name: 'Direction', type: 'enum', options: ['Accelerates', 'Slows', 'Both'] },
        { name: 'Impact', type: 'rating', note: '1 (small) to 5 (decisive).' },
        { name: 'Time to effect', type: 'text' },
        { name: 'Could expire', type: 'boolean', note: 'True for a subsidy or temporary condition.' },
        { name: 'Evidence', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Impact', dir: 'desc' }] },
        { name: 'By category', kind: 'board', group: 'Category' },
        { name: 'Fragile', kind: 'table', filter: [{ column: 'Could expire', op: 'eq', value: true }] },
      ],
    },
    {
      key: 'indicators',
      name: 'Indicators',
      frame: 'adoption',
      purpose: 'Data series behind the trend: one row per indicator and period.',
      keyColumn: 'Point',
      columns: [
        { name: 'Point', type: 'text', note: 'A key such as "Share of workers, 2024".' },
        { name: 'Indicator', type: 'text' },
        { name: 'Date', type: 'date' },
        { name: 'Value', type: 'number' },
        { name: 'Unit', type: 'text' },
        { name: 'Region', type: 'text' },
        { name: 'Basis', type: 'enum', options: ['Official', 'Survey', 'Company data', 'Estimate'] },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Date', dir: 'asc' }] },
        { name: 'By indicator', kind: 'table', group: 'Indicator' },
      ],
    },
    {
      key: 'players',
      name: 'Players',
      frame: 'players',
      purpose: 'Early movers and leaders, and how they are doing. Discovered with find_entities, enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'URL', type: 'url' },
        { name: 'Type', type: 'enum', options: ['Company', 'Startup', 'Product', 'Project', 'City or country', 'Institution'] },
        { name: 'HQ', type: 'text' },
        { name: 'Founded', type: 'number' },
        { name: 'What they did', type: 'text' },
        { name: 'Outcome', type: 'enum', options: ['Leading', 'Growing', 'Struggling', 'Failed', 'Too early'] },
        { name: 'Funding', type: 'currency', note: 'US dollars, if a company.' },
        { name: 'Lesson', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By outcome', kind: 'board', group: 'Outcome' },
        { name: 'Failures', kind: 'table', filter: [{ column: 'Outcome', op: 'in', value: ['Struggling', 'Failed'] }] },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first (read_card and read_source for reports, query_dataset for datasets). Put ' +
          'every series from a dataset into the Indicators database (upsert_rows) with Basis from its source. Sharpen ' +
          'the definition card (update_card) so that it says what counts. Hand the early movers, the claims to test and ' +
          'the ticked signed-in sources from the intake to Scout in its delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows', 'update_card'],
        frames: ['definition', 'adoption'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first (signals, drivers, adoption data, players), Builder once the Signals ' +
          'database has rows, Critic once Scout has sources to review. Name the frames each agent owns.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'headline',
        text:
          'After Scout’s first pass, fill the Definition metrics (update_card): the headline figure, the growth rate, ' +
          'where it stands and the forecast, each with a source and a date. For the forecast name who made it and who ' +
          'paid for it. Never write a figure you cannot source.',
        tools: ['query_dataset', 'query_board', 'search_board', 'update_card'],
        frames: ['definition'],
      }),
      step({
        id: 'gaps',
        text:
          'For a gap Scout could not close (a data series that is behind a paywall, the strongest forecast, evidence ' +
          'from another region), run deep_research (core) on that one question. Ask the user before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'scenarios',
        text:
          'Build the scenarios from the two most uncertain drivers in the Drivers database (query_dataset): fill the ' +
          '2x2 and the three scenario hypotheses (update_card), probabilities that add up to about 100 and the signals ' +
          'that would show each one.',
        tools: ['query_dataset', 'query_board', 'update_card', 'place_card', 'add_link'],
        frames: ['scenarios'],
      }),
      step({
        id: 'rubric',
        text:
          'At the end fill the Trend-strength scorecard: one 1-to-5 score per rubric dimension (doubled on the matrix), ' +
          'each with a cited card. Then the pros and cons of acting now and the Decision card: your proposed action and ' +
          'the weighted total in its rationale. Place insight cards that cite at least two cards each for the implications.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['implications'],
      }),
      step({
        id: 'memo',
        text:
          'Write the report with compose_section, section by section in the order of the outline, then the one-page ' +
          'summary. On the Quick tier write the summary only.',
        tools: ['compose_section'],
      }),
      step({
        id: 'monitor',
        text:
          'Only when the user asks to keep the trend current: watch_topic on the leading indicators (the monitor ' +
          'query, one watch per indicator that has news) and list the watches on the Indicators checklist. Monitors cost ' +
          'money on every check, so each is confirmed by the user; stop_watch when it is no longer needed.',
        tools: ['watch_topic', 'list_watches', 'watch_events', 'stop_watch', 'update_card'],
        frames: ['indicators'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'definition',
        text:
          'The framing sources: where the trend began, the common definitions and the competing ones (web_search, ' +
          'fetch_url, web_answer for a quick figure and then the primary source). Place source cards; sizing and growth ' +
          'figures go into Signals rows (upsert_rows, key Signal) with the date and who produced and sponsored them.',
        tools: ['web_search', 'fetch_url', 'web_answer', 'parallel_extract', 'place_card', 'upsert_rows'],
        frames: ['signals', 'definition'],
      }),
      step({
        id: 'signals',
        text:
          'Signals: one Signals row per piece of evidence (upsert_rows, key Signal) with Type (Hard data, Event, Product ' +
          'launch, Funding, Policy, Research, Behaviour survey, Intent survey or Buzz), Date, Direction and Strength; ' +
          'keep surveys of intent apart from surveys of behaviour. Statista, Gartner, Crunchbase or Similarweb through ' +
          'fetch_signed_in when connected. Add signals that weaken the trend too.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'parallel_extract', 'upsert_rows', 'place_card'],
        frames: ['signals'],
      }),
      step({
        id: 'drivers',
        text:
          'Drivers: one row per force (upsert_rows, key Driver) with the category, direction, impact and whether it could ' +
          'expire (a subsidy, a temporary condition), with a source.',
        tools: ['web_search', 'fetch_url', 'upsert_rows', 'place_card'],
        frames: ['drivers'],
      }),
      step({
        id: 'adoption',
        text:
          'Adoption data: official and primary series first. One Indicators row per indicator and period (upsert_rows, ' +
          'key Point) with unit, region and Basis; milestones on the timeline (place_card); fill the Adoption metrics.',
        tools: ['fetch_url', 'parallel_extract', 'web_search', 'place_card', 'upsert_rows'],
        frames: ['adoption', 'indicators'],
      }),
      step({
        id: 'players',
        text:
          'Players: the early movers in the intake first. find_entities discovers more (the match limit follows the ' +
          'depth tier); batch_enrich fills Type, HQ, Founded, What they did, Outcome and Funding with an output schema ' +
          'of those fields. Copy the rows into the Players database (query_dataset, upsert_rows, key Name), a Source ' +
          'on every row, and include failures. Place an entity card for the leaders and quote cards for what they say. ' +
          'On the Quick tier those two tools are refused: add a few from web_search with upsert_rows instead.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'fetch_url', 'place_card', 'query_dataset', 'upsert_rows'],
        frames: ['players'],
      }),
      step({
        id: 'skeptics',
        text:
          'The case against: skeptics and counter-trends in their own words as quote cards, failed predictions of the same ' +
          'kind, and substitutes; also search for sponsors and funders of the surveys so Critic has sources to clear or ' +
          'raise each flag.',
        tools: ['web_search', 'fetch_url', 'place_card'],
        frames: ['counter'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain: deep_research (core or above, per the tier). Ask before spend over $0.50.',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      step({
        id: 'start',
        text:
          'Start after Scout’s first sources: read the databases and the cards of every frame (board_map, search_board, ' +
          'read_card, query_dataset) before judging anything.',
        tools: ['board_map', 'search_board', 'read_card', 'query_board', 'query_dataset'],
      }),
      step({
        id: 'red-flags',
        text:
          'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." ' +
          'with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites ' +
          'the source cards that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A ' +
          'flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['counter', 'signals', 'players'],
      }),
      step({
        id: 'weigh',
        text:
          'Weigh the evidence: for every claim that rests on a survey of intent, a sponsored forecast or one source, ' +
          'link it with "tension" to the card that disagrees or place a Question asking for the second source. Name the ' +
          'driver in Drivers that is most fragile and say why.',
        tools: ['query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['signals', 'drivers'],
      }),
      step({
        id: 'gaps',
        text: 'Turn every gap into a Question card in Open questions, with a link to the card or gap that prompted it.',
        tools: ['place_card', 'add_link'],
        frames: ['questions'],
      }),
      step({
        id: 'report',
        text: 'Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised.',
        tools: ['report_progress', 'send_message'],
      }),
    ],
    builder: [
      step({
        id: 'charts',
        text:
          'Charts bound to the databases: signals over time (line) and signals by type from Signals, the main indicators ' +
          'over time from Indicators, with a regional split. Never an inline chart when a database holds the data.',
        tools: ['place_card', 'query_dataset'],
        frames: ['signals', 'adoption'],
      }),
      step({
        id: 'causal',
        text: 'A diagram of the causal map: how the drivers reinforce each other and what feeds back, from the Drivers database.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['drivers'],
      }),
      step({
        id: 'scenarios',
        text:
          'The scenario 2x2 (framework, quadrant) and a timeline of when each scenario’s signals would appear, from the ' +
          'hypotheses orb wrote.',
        tools: ['place_card', 'read_card', 'query_board'],
        frames: ['scenarios'],
      }),
      step({
        id: 'implications',
        text: 'The pros and cons of acting now (framework) and, where a table helps, the actions by scenario.',
        tools: ['place_card', 'read_card', 'query_board'],
        frames: ['implications'],
      }),
      step({
        id: 'summary',
        text:
          'Optional one-page visual summary (a design frame): the definition, the headline chart, the score and the ' +
          'three actions, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['definition', 'implications'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...TREND_RUBRIC],
  redFlags: [...TREND_RED_FLAGS],

  output: {
    memoTitle: 'Trend report: {{trend}}',
    citationRule:
      'Every paragraph cites cards; every number cites its source, its date and who sponsored it; hard data, surveys of behaviour and surveys of intent are marked as such.',
    sections: [
      { id: 'summary', title: 'Summary & so what', frames: ['implications', 'counter'], words: 200, guidance: 'The trend in a sentence, how strong it is, what to do and the top risks of being wrong, in at most 200 words.' },
      { id: 'definition', title: 'What the trend is', frames: ['definition'], guidance: 'The definition, the scope and the headline numbers.' },
      { id: 'signals', title: 'The evidence', frames: ['signals'], guidance: 'The strongest signals by type, with the signals chart, hard data separated from buzz.' },
      { id: 'drivers', title: 'Drivers & forces', frames: ['drivers'], guidance: 'What drives the trend, how strongly, and which drivers are fragile.' },
      { id: 'adoption', title: 'Adoption & data', frames: ['adoption'], guidance: 'How far and how fast it has spread, with the main series and its source.' },
      { id: 'players', title: 'Early movers', frames: ['players'], guidance: 'Who is ahead, who failed and what to learn.' },
      { id: 'counter', title: 'The case against', frames: ['counter'], guidance: 'Counter-trends and skeptics, and the red-flag outcomes with the raised flags.' },
      { id: 'scenarios', title: 'Scenarios', frames: ['scenarios'], guidance: 'Each scenario with its conditions, probability and signals.' },
      { id: 'scorecard', title: 'Scorecard', frames: ['implications'], guidance: 'The rubric table: each dimension, its weight, its score and its evidence.' },
      { id: 'implications', title: 'Implications & opportunities', frames: ['implications'], guidance: 'Who gains and loses and the actions now, for each scenario.' },
      { id: 'indicators', title: 'Leading indicators & next steps', frames: ['indicators', 'questions'], guidance: 'The indicators to watch with thresholds and the ranked open questions.' },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{trend}}',
      includes: ['Definition', 'Headline chart', 'Score', 'Actions', 'Indicators to watch'],
    },
    deckFormat: 'trend-report',
  },

  tiers: tiers({
    quick: {
      summary:
        'No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the report is the summary only.',
    },
    standard: {
      summary:
        'Quick, plus early-mover discovery with find_entities, batch enrichment of the Players database, one or two deep-research runs (core) and optional monitors, asking before spend.',
    },
    deep: {
      summary:
        'Standard, plus pro or ultra deep research on forecasts and the strongest counter-trend, FindAll extension for a complete players list and the full report.',
    },
    watch: true,
  }),

  followUps: [
    { label: 'Stress-test the headline number', prompt: 'Stress-test the headline figure for "{{trend}}": trace it to its origin, who sponsored it and what independent sources say.' },
    { label: 'Add a region', prompt: 'Extend the evidence for "{{trend}}" to [region]: signals, adoption data and early movers, flagged where they differ.' },
    { label: 'Write the exec brief', prompt: 'Write a one-page brief on "{{trend}}" for {{audience|leadership}}: the trend, the score, three actions and the indicators to watch.' },
    { label: 'Build the scenario plan', prompt: 'Turn the scenarios into an action plan: for each scenario, what to do now, what to prepare and the trigger that tells us it is happening.' },
    { label: 'Watch the indicators', prompt: 'Watch the leading indicators for "{{trend}}" and tell me when one crosses its threshold.' },
    { label: 'Refresh with new data', prompt: 'I added new data. Update the Indicators database, re-score the rubric and say which conclusions moved.' },
  ],

  signedIn: [
    { domain: 'statista.com', label: 'Statista', use: 'Market statistics and forecasts, with the underlying source.' },
    { domain: 'gartner.com', label: 'Gartner', use: 'Analyst forecasts, hype cycles and market guides.' },
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Funding and company signals for the early movers.' },
    { domain: 'similarweb.com', label: 'Similarweb', use: 'Traffic and engagement series for products and sites.' },
  ],
  monitor: {
    query: '{{trend}} leading indicators, new data releases, forecasts and counter-evidence',
    why: 'New data that would move the trend score or one of the scenarios.',
  },
};
