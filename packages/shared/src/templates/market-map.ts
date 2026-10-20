/**
 * Market map (P6.12): the landscape of a market or category: who is in it, how it divides into segments, where the
 * money has gone, who leads, who is acquiring, and where the white space is. Built for investors, strategists and
 * corp-dev teams. Human-readable spec: docs/templates/market-map.md (generated: `pnpm templates:docs`).
 */
import type { RedFlag, RubricDimension, TemplateSpecInput } from './schema.js';
import {
  boardView,
  chart,
  checklist,
  col,
  db,
  decision,
  depthField,
  doc,
  emptyRisk,
  hypothesis,
  materialsField,
  matrix,
  metric,
  proscons,
  question,
  quadrant,
  redFlagChecklist,
  scorecard,
  sitesField,
  step,
  swot,
  tableView,
  target,
  tiersFor,
  timeline,
} from './finance-kit.js';

export const MAP_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'size',
    name: 'Market size',
    weight: 20,
    anchors: {
      1: 'Niche: under a few hundred million dollars with no route to more.',
      3: 'Large enough to support several billion-dollar outcomes.',
      5: 'Very large, with budgets moving into it from adjacent categories.',
    },
    frame: 'sizing',
  },
  {
    id: 'growth',
    name: 'Growth & momentum',
    weight: 25,
    anchors: {
      1: 'Flat or shrinking; funding and deal flow falling.',
      3: 'Steady growth; funding and deal flow stable.',
      5: 'Fast growth with rising funding, new entrants and customer pull.',
    },
    frame: 'capital',
  },
  {
    id: 'competition',
    name: 'Competitive structure',
    weight: 20,
    anchors: {
      1: 'Dominated by an entrenched incumbent or a crowd of identical players.',
      3: 'A few strong players and room for specialists.',
      5: 'Fragmented, with no player holding more than a small share and clear ways to differentiate.',
    },
    frame: 'leaders',
  },
  {
    id: 'whitespace',
    name: 'White space',
    weight: 20,
    anchors: {
      1: 'Every need is served; no unmet segment.',
      3: 'Some segments are under-served.',
      5: 'A large, unmet need that the map shows nobody is addressing.',
    },
    frame: 'trends',
  },
  {
    id: 'exits',
    name: 'Capital & exit environment',
    weight: 15,
    anchors: {
      1: 'No acquirers, no listings and write-offs.',
      3: 'Occasional acquisitions at reasonable multiples.',
      5: 'Active strategic acquirers, recent IPOs and rising multiples.',
    },
    frame: 'investors',
  },
];

export const MAP_CHECKS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: 'The market definition drifts: companies in the map do not fit the stated boundary.',
    check: 'Compare each Companies row with the Scope definition card; list the ones that do not fit.',
  },
  {
    id: 'RF02',
    text: 'Coverage gaps: whole regions, stages or segments with no companies.',
    check: 'Count Companies by Segment, region and stage; an empty cell is raised as a gap or cleared as "none exist".',
  },
  {
    id: 'RF03',
    text: 'Survivorship bias: shut-down and acquired companies are missing.',
    check: 'Check that Companies has Status values other than Active, and search for shutdowns and acquisitions.',
  },
  {
    id: 'RF04',
    text: 'Duplicated or renamed entities counted twice.',
    check: 'Look for rows sharing a URL or a former name in the Companies database.',
  },
  {
    id: 'RF05',
    text: 'Funding figures from a single, vendor-reported source or in mixed currencies.',
    check: 'Each Funding rounds row needs a Source; a total with one source is challenged; check currencies.',
  },
  {
    id: 'RF06',
    text: 'Market size built only top-down, or from a vendor report with an opaque method.',
    check: 'Read Market sizing inputs: is there a bottom-up build and an independent estimate?',
  },
  {
    id: 'RF07',
    text: 'Stale data: companies or rounds older than 18 months presented as current.',
    check: 'Check the "As of" and date columns; stale rows are flagged.',
  },
  {
    id: 'RF08',
    text: 'The leaders are chosen on funding or press, not on customers or revenue.',
    check: 'Check that the Leaders scorecard uses customer and revenue evidence, not only funding.',
  },
  {
    id: 'RF09',
    text: 'A hyped sub-segment with little revenue behind it.',
    check: 'Compare Segments funding with revenue and customer evidence in each segment.',
  },
  {
    id: 'RF10',
    text: 'A platform or incumbent can absorb the category as a feature.',
    check: 'Look for platform announcements and incumbent launches in the trends timeline.',
  },
];

export const MARKET_MAP: TemplateSpecInput = {
  id: 'market-map',
  label: 'Market map',
  dot: '#2563EB',
  placeholder: 'Which market or category do you want to map?',
  brief:
    'Map the market: twelve numbered frames (scope, taxonomy, companies, sizing, capital flows, leaders, investors and ' +
    'acquirers, buyers, trends and white space, caveats, so-what, open questions) built on a Companies database that ' +
    'Parallel discovers and enriches. Cite every number, mark vendor-reported figures, and end with where to play or which ' +
    'companies to approach.',
  titleFrom: '{{market}}: market map',

  inputs: [
    {
      id: 'market',
      label: 'Market or category',
      kind: 'text',
      required: true,
      placeholder: 'Warehouse robotics',
      maxLength: 120,
    },
    {
      id: 'purpose',
      label: 'What is the map for',
      kind: 'select',
      options: [
        'Investment sourcing',
        'Competitive strategy',
        'Partnership scouting',
        'Acquisition targets',
        'Market entry',
        'Learning the space',
      ],
      maxLength: 60,
    },
    {
      id: 'scope',
      label: 'Scope: what is in and out',
      kind: 'longtext',
      placeholder: 'Include software and hardware; exclude consumer robots…',
      maxLength: 1500,
    },
    {
      id: 'segments',
      label: 'Known segments',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. orb proposes a taxonomy if empty.',
      maxLength: 800,
    },
    {
      id: 'players',
      label: 'Known players',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout finds the rest.',
      maxLength: 800,
    },
    {
      id: 'focus',
      label: 'Company stage in scope',
      kind: 'select',
      options: ['Early stage', 'Growth stage', 'Public companies', 'All'],
      group: 'where',
      maxLength: 40,
    },
    {
      id: 'geography',
      label: 'Geography',
      kind: 'text',
      placeholder: 'Global, or Europe',
      group: 'where',
      maxLength: 120,
    },
    {
      id: 'thesis',
      label: 'Your thesis or angle',
      kind: 'longtext',
      placeholder: 'What do you expect to find, or what decision will this inform?',
      maxLength: 1500,
    },
    materialsField(
      'Drop analyst reports, a spreadsheet of known companies (CSV or XLSX) or notes. A company list becomes rows in the Companies database.',
    ),
    depthField,
    sitesField([
      { domain: 'crunchbase.com', label: 'Crunchbase' },
      { domain: 'pitchbook.com', label: 'PitchBook' },
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'g2.com', label: 'G2' },
    ]),
  ],

  frames: [
    {
      id: 'scope',
      title: 'Scope & definition',
      color: 'signal',
      brief:
        'What {{market}} is: the boundary (what is in and out), the purpose of the map, the buyer and the problem, how the ' +
        'category is named and the adjacent categories. State the working definition before mapping so the rest can be checked against it.',
      owners: ['orb'],
      targets: [target('doc', 1, 'the scope definition'), target('metric', 4), target('question', 2)],
      seeds: [
        doc('Scope definition', 'Market: {{market}}. In scope: {{scope|to define}} Purpose: {{purpose|to confirm}}. Geography: {{geography|global}}. Stage: {{focus|all}}.', 'From your intake; orb refines it after the first pass.'),
        metric('Companies mapped', 'Rows in the Companies database.'),
        metric('Segments', 'Number of segments in the taxonomy.'),
        metric('Total funding', 'Sum of disclosed funding of the mapped private companies, with the date.'),
        metric('Deals in the last 12 months', 'Funding rounds and acquisitions, with the source.'),
        question('Where does this market end?', 'The adjacent categories that are in or out, and why.'),
        question('Who is the buyer, and what budget does it come from?', 'The line item the spend moves from or to.'),
      ],
      room: 300,
    },
    {
      id: 'taxonomy',
      title: 'Taxonomy',
      color: 'sky',
      brief:
        'How the market divides: the segments, each with a definition, the buyer, the maturity (emerging, growing, mature, ' +
        'consolidating) and the number of players and funding in it. The taxonomy is MECE enough that every company fits one segment.',
      owners: ['orb', 'builder', 'scout'],
      targets: [target('database', 1, 'Segments'), target('diagram', 1, 'the taxonomy tree'), target('chart', 1, 'companies per segment')],
      seeds: [
        db('Segments', 'segments'),
        chart('Companies per segment', 'bar', 'segments', 'Segment', 'Companies'),
        question('Is every company in exactly one segment?', 'Rows that straddle segments, and whether a segment should split or merge.'),
      ],
    },
    {
      id: 'companies',
      title: 'Companies',
      color: 'rho',
      brief:
        'The landscape: every company in scope with its segment, country, founding year, stage, funding, headcount, business ' +
        'model, target customer, differentiator and status (active, acquired, shut down). Discovered with find_entities and ' +
        'enriched with batch_enrich; one row per company, a Source on every row, and acquired and shut-down companies included.',
      owners: ['scout', 'builder'],
      targets: [
        target('database', 1, 'Companies, at least 25 rows on Standard'),
        target('chart', 2, 'companies by stage and by segment'),
        target('source', 4),
      ],
      seeds: [
        db('Companies', 'companies'),
        chart('Companies by stage', 'bar', 'companies', 'Stage', 'Total funding'),
      ],
    },
    {
      id: 'sizing',
      title: 'Market size & growth',
      color: 'sky',
      brief:
        'TAM, SAM and growth for the whole market and by segment, both top-down and bottom-up with the method stated, ' +
        'the drivers, the demand side (buyers and budgets) and the forecast horizon. At least one independent estimate.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        target('metric', 4, 'TAM, SAM, CAGR, spend per buyer, each cited'),
        target('database', 1, 'Market sizing inputs'),
        target('chart', 2),
        target('source', 4, 'including 1 independent report'),
      ],
      seeds: [
        metric('TAM', 'Cite the source and the method (top-down or bottom-up).'),
        metric('SAM', 'The part of the TAM within the scope; show the filter.'),
        metric('CAGR', 'Market growth rate with its period.'),
        metric('Spend per buyer', 'Average annual spend of one buyer, with the source.'),
        db('Market sizing inputs', 'sizing'),
        chart('Market size build-up', 'bar', 'sizing', 'Assumption', 'Value'),
      ],
    },
    {
      id: 'capital',
      title: 'Funding & capital flows',
      color: 'rho',
      brief:
        'Where the money has gone: funding by year, by stage, by segment and by region, the biggest rounds, the pace of new ' +
        'company formation and the trend in round sizes. Totals come from the rows, not from vendor summaries.',
      owners: ['scout', 'builder'],
      targets: [
        target('database', 1, 'Funding rounds'),
        target('chart', 3, 'funding by year, by segment and by stage'),
        target('timeline', 1, 'the largest rounds'),
      ],
      seeds: [
        db('Funding rounds', 'rounds'),
        chart('Funding by year', 'bar', 'rounds', 'Year', 'Amount'),
        chart('Funding by segment', 'bar', 'rounds', 'Segment', 'Amount'),
        timeline('Largest rounds', 'Map started', 'Scout adds the largest rounds with their dates, each with a source.'),
      ],
    },
    {
      id: 'leaders',
      title: 'Leaders & challengers',
      color: 'sky',
      brief:
        'Who is winning and why: the leaders by customers and revenue (not only funding), the fast challengers, the incumbents ' +
        'and the ones losing ground. A scored comparison of the top players and a positioning 2x2.',
      owners: ['scout', 'builder', 'critic'],
      targets: [target('matrix', 1, 'weighted scorecard of the top players'), target('framework', 1, 'the 2x2'), target('source', 3)],
      seeds: [
        matrix(
          'Leaders scorecard',
          [
            ['Customer traction', 30],
            ['Product breadth', 20],
            ['Funding and runway', 15],
            ['Distribution', 20],
            ['Momentum', 15],
          ],
          ['Leader A', 'Leader B', 'Challenger C'],
          'Placeholder: weighted criteria, scored from the Companies database and the sources.',
        ),
        quadrant('Positioning 2x2', 'Product breadth', 'Customer traction'),
      ],
    },
    {
      id: 'investors',
      title: 'Investors & acquirers',
      color: 'rho',
      brief:
        'Who funds and buys in this market: the most active investors with their portfolio companies, corporate investors and ' +
        'strategic acquirers, and every acquisition with its date, value and rationale. Exit multiples where disclosed.',
      owners: ['scout'],
      targets: [target('database', 2, 'Investors and Acquisitions'), target('timeline', 1, 'acquisitions'), target('source', 3)],
      seeds: [
        db('Investors', 'investors'),
        db('Acquisitions', 'acquisitions'),
        timeline('Acquisitions timeline', 'Map started', 'Scout adds each acquisition with its date and source.'),
      ],
    },
    {
      id: 'buyers',
      title: 'Buyers & pricing',
      color: 'sky',
      brief:
        'The demand side: who buys, how they buy, what they pay (pricing model and price points), what reviews say and what ' +
        'makes buyers switch. Positive and negative voices.',
      owners: ['scout'],
      targets: [target('database', 1, 'Pricing'), target('quote', 4, 'at least 1 negative'), target('source', 3)],
      seeds: [db('Pricing', 'pricing'), question('Why do buyers switch?', 'Triggers, costs and the alternatives they consider.')],
    },
    {
      id: 'trends',
      title: 'Trends & white space',
      color: 'rho',
      brief:
        'What is changing (technology, regulation, behaviour, capital) and what that opens: the segments with a need and no ' +
        'strong player, the combinations nobody has built, and the trends that threaten the whole category. Each white-space ' +
        'claim is a hypothesis with evidence for and against.',
      owners: ['orb', 'scout', 'builder'],
      targets: [target('hypothesis', 3, 'white-space claims with evidence links'), target('framework', 1), target('insight', 2)],
      seeds: [
        hypothesis('There is an under-served segment', 'A segment with real demand and few credible players; link the Segments and Companies rows behind it.'),
        hypothesis('A platform or incumbent absorbs the category', 'The scenario in which this is a feature, not a market.'),
        hypothesis('Capital is ahead of revenue', 'Funding growing faster than customer revenue in at least one segment.'),
        proscons('Entering this market now: pros and cons'),
      ],
    },
    {
      id: 'caveats',
      title: 'Caveats & map quality',
      color: 'paper',
      brief:
        'How far to trust the map: work through the map-quality checklist, raising each problem as a Risk card with evidence ' +
        'or clearing it with a source. Covers definition drift, coverage gaps, survivorship bias, duplicates and stale data.',
      owners: ['critic'],
      targets: [target('risk', 5, 'every check cleared with a source or raised')],
      seeds: [
        redFlagChecklist('Map-quality checklist', MAP_CHECKS),
        emptyRisk('Coverage'),
        emptyRisk('Data quality'),
        emptyRisk('Market sizing'),
        emptyRisk('Competitive'),
        emptyRisk('Timing'),
      ],
    },
    {
      id: 'sowhat',
      title: 'So what & recommendation',
      color: 'signal',
      brief:
        'What the map means for the purpose in the intake: where to play, which segments are most attractive (scored against ' +
        'the rubric), which companies to approach, partner with or watch, and what would change the view.',
      owners: ['orb'],
      targets: [target('framework', 1, 'SWOT'), target('decision', 1), target('matrix', 1, 'the filled rubric')],
      seeds: [
        swot('SWOT: entering {{market}}'),
        decision(
          'Where to play in {{market}}',
          ['Enter now', 'Enter a segment', 'Partner or invest', 'Watch', 'Stay out'],
          'Open. orb decides after the rubric is filled and writes the weighted total and the target list here.',
        ),
        scorecard('Market scorecard (rubric score x 2, so 10 is a 5)', MAP_RUBRIC),
      ],
    },
    {
      id: 'questions',
      title: 'Open questions',
      color: 'paper',
      brief:
        'What the map could not settle, ranked: data to buy, experts to call, companies to meet, each linked to the gap that ' +
        'prompted it. Every unresolved question card on the board is collected here.',
      owners: ['critic', 'orb'],
      targets: [target('checklist', 1, 'at least 8 ranked questions, each linked to its source card')],
      seeds: [
        checklist('Questions and next steps', [
          'Your thesis to test: {{thesis|none given yet}}',
          'Which three companies should we meet first, and why?',
          'Which expert would settle the biggest open question?',
        ]),
      ],
    },
  ],

  databases: [
    {
      key: 'segments',
      name: 'Segments',
      frame: 'taxonomy',
      purpose: 'The taxonomy: one row per segment.',
      keyColumn: 'Segment',
      columns: [
        col('Segment', 'text'),
        col('Definition', 'text'),
        col('Buyer', 'text'),
        col('Maturity', 'enum', { options: ['Emerging', 'Growing', 'Mature', 'Consolidating'] }),
        col('Companies', 'number', { note: 'Count of rows in Companies.' }),
        col('Total funding', 'currency', { note: 'US dollars.' }),
        col('Revenue evidence', 'text', { note: 'Is there customer revenue behind the funding?' }),
        col('Source', 'url'),
      ],
      views: [tableView('All'), boardView('By maturity', 'Maturity')],
    },
    {
      key: 'companies',
      name: 'Companies',
      frame: 'companies',
      purpose: 'Every company in the map. Discovered with find_entities, enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        col('Name', 'text'),
        col('URL', 'url'),
        col('Segment', 'text'),
        col('HQ', 'text'),
        col('Founded', 'number'),
        col('Stage', 'enum', { options: ['Pre-seed / Seed', 'Series A', 'Series B', 'Series C+', 'Growth / Late', 'Public', 'Bootstrapped', 'Unknown'] }),
        col('Total funding', 'currency', { note: 'US dollars.' }),
        col('Last round', 'text'),
        col('Headcount', 'number'),
        col('Business model', 'text'),
        col('Target customer', 'text'),
        col('Key differentiator', 'text'),
        col('Notable investors', 'text'),
        col('Status', 'enum', { options: ['Active', 'Acquired', 'Shut down', 'Unknown'] }),
        col('As of', 'date'),
        col('Source', 'url'),
      ],
      views: [
        tableView('All', { sort: [{ column: 'Total funding', dir: 'desc' }] }),
        tableView('By segment', { group: 'Segment' }),
        boardView('By stage', 'Stage'),
        tableView('Acquired or shut down', { filter: [{ column: 'Status', op: 'in', value: ['Acquired', 'Shut down'] }] }),
      ],
    },
    {
      key: 'sizing',
      name: 'Market sizing inputs',
      frame: 'sizing',
      purpose: 'Every assumption behind a market-size figure, so the build-up can be checked.',
      keyColumn: 'Assumption',
      columns: [
        col('Assumption', 'text'),
        col('Value', 'number'),
        col('Unit', 'text'),
        col('Method', 'enum', { options: ['Top-down', 'Bottom-up', 'Third-party'] }),
        col('Source', 'url'),
        col('Confidence', 'enum', { options: ['Low', 'Medium', 'High'] }),
      ],
      views: [tableView('All'), boardView('By method', 'Method')],
    },
    {
      key: 'rounds',
      name: 'Funding rounds',
      frame: 'capital',
      purpose: 'One row per disclosed round across the mapped companies.',
      keyColumn: 'Company',
      columns: [
        col('Company', 'text'),
        col('Round', 'text'),
        col('Date', 'date'),
        col('Year', 'text'),
        col('Amount', 'currency', { note: 'US dollars.' }),
        col('Segment', 'text'),
        col('Lead', 'text'),
        col('Investors', 'text'),
        col('Source', 'url'),
      ],
      views: [tableView('By date', { sort: [{ column: 'Date', dir: 'desc' }] }), tableView('Largest', { sort: [{ column: 'Amount', dir: 'desc' }] })],
    },
    {
      key: 'investors',
      name: 'Investors',
      frame: 'investors',
      purpose: 'The most active investors in the market.',
      keyColumn: 'Name',
      columns: [
        col('Name', 'text'),
        col('Type', 'enum', { options: ['VC', 'Corporate VC', 'Growth equity', 'PE', 'Strategic', 'Angel / other'] }),
        col('Deals', 'number', { note: 'In the map.' }),
        col('Portfolio companies', 'text'),
        col('Typical check', 'currency'),
        col('Stage focus', 'text'),
        col('Source', 'url'),
      ],
      views: [tableView('Most active', { sort: [{ column: 'Deals', dir: 'desc' }] }), boardView('By type', 'Type')],
    },
    {
      key: 'acquisitions',
      name: 'Acquisitions',
      frame: 'investors',
      purpose: 'Every acquisition in the market with its value and rationale.',
      keyColumn: 'Target',
      columns: [
        col('Date', 'date'),
        col('Acquirer', 'text'),
        col('Target', 'text'),
        col('Value', 'currency', { note: 'US dollars, if disclosed.' }),
        col('Revenue multiple', 'number'),
        col('Rationale', 'text'),
        col('Source', 'url'),
      ],
      views: [tableView('By date', { sort: [{ column: 'Date', dir: 'desc' }] })],
    },
    {
      key: 'pricing',
      name: 'Pricing',
      frame: 'buyers',
      purpose: 'How the players price, from public pages.',
      keyColumn: 'Company',
      columns: [
        col('Company', 'text'),
        col('Model', 'enum', { options: ['Subscription', 'Usage', 'Per seat', 'License', 'Hardware plus service', 'Custom quote', 'Free'] }),
        col('Entry price', 'text'),
        col('Enterprise price', 'text'),
        col('Free tier', 'boolean'),
        col('Source', 'url'),
      ],
      views: [tableView('All'), boardView('By model', 'Model')],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'scope',
        text:
          'Read the uploaded materials first (read_card, read_source, query_dataset): a company list becomes Companies rows ' +
          '(upsert_rows). Refine the Scope definition doc with the intake, propose the taxonomy as Segments rows (upsert_rows, ' +
          'key Segment) and give Scout the segments, the players and the stage in scope in its delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows', 'update_card'],
        frames: ['scope', 'taxonomy'],
      }),
      step({
        id: 'delegate',
        text: 'Delegate with delegate: Scout first (discovery and enrichment), Builder once the Companies rows exist, Critic once Scout has placed its first sources. Name the frames each agent owns.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'snapshot',
        text: "After Scout's first pass, fill the four scope metrics (update_card) and tidy the taxonomy: split or merge segments, move rows to the segment that fits (add a corrected row; a row an agent wrote can only be changed by that agent).",
        tools: ['query_board', 'search_board', 'query_dataset', 'update_card', 'upsert_rows'],
        frames: ['scope', 'taxonomy'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (a segment with no data, a sizing method), run deep_research (core) on that one question. Ask the user before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'rubric',
        text: 'At the end, fill the Market scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card. Then the hypotheses on white space (evidence for and against as card ids), the SWOT and the Decision card with your proposed option, the weighted total and the list of companies to approach.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['trends', 'sowhat'],
      }),
      step({
        id: 'memo',
        text: 'Write the market report with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only.',
        tools: ['compose_section'],
      }),
      step({
        id: 'questions',
        text: 'Keep the open questions current: collect every unresolved Question card into the "Questions and next steps" checklist, ranked, each linked to its source card.',
        tools: ['search_board', 'update_card', 'add_link'],
        frames: ['questions'],
      }),
      step({
        id: 'monitor',
        text: 'Only when the user asks to keep watching the market: watch_topic with the market name and the monitor query (new entrants, rounds, acquisitions). Monitors cost money on every check, so each is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'seed',
        text: 'Start from the known players and segments in the intake: add them to Companies (upsert_rows, key Name) with a Source url on every row. Read two or three independent overviews of the market (web_search, fetch_url) to learn its vocabulary and to find more names.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'upsert_rows', 'place_card'],
        frames: ['companies', 'taxonomy'],
      }),
      step({
        id: 'discover',
        text: "Discovery: find_entities with the scope as the objective (the match limit follows the depth tier); it fills its own database card in this frame. Run it once per segment when the market is wide. On the Quick scan tier find_entities is refused: add the names from web_search with upsert_rows instead, up to 15.",
        tools: ['find_entities', 'find_entities_extend', 'web_search', 'upsert_rows'],
        frames: ['companies'],
      }),
      step({
        id: 'enrich',
        text: 'Enrichment: batch_enrich fills the Companies columns (segment, HQ, founded, stage, total funding, last round, headcount, business model, target customer, differentiator, status) with an output schema of those fields. Then read each run database with query_dataset and upsert the rows into the Companies database (upsert_rows, key Name) so there is one table. Include acquired and shut-down companies and set Status.',
        tools: ['batch_enrich', 'query_dataset', 'upsert_rows'],
        frames: ['companies'],
      }),
      step({
        id: 'funding',
        text: 'Funding: one Funding rounds row per disclosed round (upsert_rows, key Company), with Year and Segment filled so the charts can group by them. Crunchbase or PitchBook when connected (fetch_signed_in), press otherwise. Add the largest rounds to the timeline.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'upsert_rows', 'place_card'],
        frames: ['capital'],
      }),
      step({
        id: 'sizing',
        text: 'Market size: at least one independent report; every TAM, SAM and CAGR is a metric card with its source, and the assumptions go into Market sizing inputs (upsert_rows) with the method (top-down, bottom-up or third-party).',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card', 'upsert_rows'],
        frames: ['sizing'],
      }),
      step({
        id: 'investors',
        text: 'Investors and acquirers: the most active investors into Investors, every acquisition into Acquisitions (upsert_rows) and onto the timeline, each with a Source.',
        tools: ['web_search', 'fetch_url', 'upsert_rows', 'place_card'],
        frames: ['investors'],
      }),
      step({
        id: 'buyers',
        text: 'Buyers: pricing pages into Pricing (upsert_rows, key Company); reviews from G2 or similar (fetch_signed_in when connected) as quote cards, positive and negative; a capture_page of two or three leaders for the record.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'capture_page', 'place_card', 'upsert_rows'],
        frames: ['buyers', 'leaders'],
      }),
      step({
        id: 'trends',
        text: 'Trends: technology, regulation, behaviour and capital shifts, as source cards with dated evidence; platform or incumbent launches that could absorb the category.',
        tools: ['web_search', 'fetch_url', 'place_card'],
        frames: ['trends', 'caveats'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain (a segment with no data, a regional market): deep_research (core or above, per the tier). Ask before spend over $0.50.',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      step({
        id: 'start',
        text: "Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) and query Companies and Funding rounds (query_dataset) before judging anything.",
        tools: ['board_map', 'search_board', 'read_card', 'query_board', 'query_dataset'],
      }),
      step({
        id: 'checks',
        text: 'Work through the map-quality checklist, one check at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence (the rows or counts) and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) and the checklist card (an insight needs at least two cited cards). A check with no evidence either way becomes a Question card in Open questions. You cannot tick the checklist: the user does.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['caveats', 'companies', 'capital'],
      }),
      step({
        id: 'sizing',
        text: 'Challenge every market-size number: one source, an opaque method, or only top-down is raised. Link it with "tension" to the card that disagrees.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['sizing', 'leaders'],
      }),
      step({
        id: 'gaps',
        text: 'Turn every gap into a Question card in Open questions, with a link to the card or gap that prompted it.',
        tools: ['place_card', 'add_link'],
        frames: ['questions'],
      }),
      step({
        id: 'report',
        text: 'Report progress per frame; send_message to orb when the checklist is complete, naming which checks were raised.',
        tools: ['report_progress', 'send_message'],
      }),
    ],
    builder: [
      step({
        id: 'taxonomy',
        text: 'A diagram of the taxonomy (a tree from the market to its segments to the leading names), built from Segments and Companies, and a bar chart of companies per segment bound to Segments.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['taxonomy'],
      }),
      step({
        id: 'charts',
        text: 'Charts bound to the databases: companies by stage (Companies), the market size build-up (Market sizing inputs), and funding by year, by segment and by stage (Funding rounds).',
        tools: ['place_card', 'query_dataset'],
        frames: ['companies', 'sizing', 'capital'],
      }),
      step({
        id: 'leaders',
        text: 'The Leaders scorecard (weighted criteria, scores 0 to 10 from customer and revenue evidence) and the positioning 2x2 (framework, quadrant) with the leaders and challengers placed; then the white-space 2x2 (segment attractiveness against competitive intensity, from Segments and Companies) that the white-space hypotheses point at.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['leaders', 'trends'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual map (a design frame): the segments as columns with the leading companies in each, built only from the Companies database.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['taxonomy', 'companies'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...MAP_RUBRIC],
  redFlags: [...MAP_CHECKS],

  output: {
    memoTitle: 'Market report: {{market}}',
    citationRule:
      'Every paragraph cites cards; every number cites its source and date; vendor-reported figures are marked as such.',
    sections: [
      { id: 'summary', title: 'Summary & recommendation', frames: ['sowhat', 'caveats'], words: 150, guidance: 'What the map shows, the recommendation, the top 3 findings and the top 3 caveats, in at most 150 words.' },
      { id: 'scope', title: 'Scope & definition', frames: ['scope'], guidance: 'The boundary, the purpose and the headline numbers.' },
      { id: 'taxonomy', title: 'Taxonomy', frames: ['taxonomy'], guidance: 'The segments with their maturity and size, with the taxonomy diagram.' },
      { id: 'landscape', title: 'The landscape', frames: ['companies'], guidance: 'The companies by segment and stage with the charts; who is acquired or shut down.' },
      { id: 'sizing', title: 'Market size & growth', frames: ['sizing'], guidance: 'TAM, SAM and growth with the method and the build-up chart.' },
      { id: 'capital', title: 'Funding & capital flows', frames: ['capital'], guidance: 'Funding by year, segment and stage, and the largest rounds.' },
      { id: 'leaders', title: 'Leaders & challengers', frames: ['leaders'], guidance: 'The scorecard and the 2x2, and why the leaders lead.' },
      { id: 'investors', title: 'Investors & acquirers', frames: ['investors'], guidance: 'The most active investors, the acquirers and the acquisitions.' },
      { id: 'buyers', title: 'Buyers & pricing', frames: ['buyers'], guidance: 'Who buys, what they pay and what reviews say.' },
      { id: 'trends', title: 'Trends & white space', frames: ['trends'], guidance: 'The shifts, the white-space hypotheses and their evidence.' },
      { id: 'caveats', title: 'Caveats & map quality', frames: ['caveats'], guidance: 'The map-quality outcomes: each raised check with its mitigant, and the cleared ones in one line.' },
      { id: 'scorecard', title: 'Scorecard', frames: ['sowhat'], guidance: 'The rubric table: each dimension, its weight, its score and its evidence.' },
      { id: 'next', title: 'Open questions & next steps', frames: ['questions'], guidance: 'The ranked questions and the proposed next steps.' },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page market map: {{market}}',
      includes: ['Segments', 'Top companies', 'Size and growth', 'Recommendation'],
    },
    deckFormat: 'market-map',
  },

  tiers: tiersFor({
    quick:
      'No deep research and no entity discovery: search and extract only, a hand-built list of up to 15 companies, at most 12 cards per frame, and the memo is the summary only.',
    standard:
      'Quick, plus FindAll discovery and batch enrichment of the Companies database and one or two deep-research runs (core), asking before spend.',
    deep:
      'Standard, plus pro or ultra deep research on sizing and regions, FindAll extension for full coverage and the full report.',
  }),

  followUps: [
    {
      label: 'Add a segment',
      prompt: 'Add a segment for [segment] to the {{market}} map: define it, find its companies and enrich them.',
    },
    {
      label: 'Find more companies',
      prompt: 'Extend the Companies database with 20 more companies in {{market}}, especially in under-covered regions and segments.',
    },
    {
      label: 'Deep dive on a company',
      prompt: 'Go deeper on [company] from the map: product, customers, funding, team and how it compares with the leaders.',
    },
    {
      label: 'Where is the white space',
      prompt: 'Where is the white space in {{market}}? Rank the three best opportunities with the evidence for and against each.',
    },
    {
      label: 'Refresh the map',
      prompt: 'Refresh the {{market}} map: new companies, rounds and acquisitions since the last pass, and what changed in the scorecard.',
    },
    {
      label: 'Draft an outreach list',
      prompt: 'From the map, draft a ranked list of companies to approach for {{purpose|our goal}}, with a reason for each.',
    },
  ],

  signedIn: [
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Companies, funding rounds, investors and acquisitions.' },
    { domain: 'pitchbook.com', label: 'PitchBook', use: 'Round valuations, deal terms and investor activity.' },
    { domain: 'linkedin.com', label: 'LinkedIn', use: 'Headcount, hiring and company descriptions.' },
    { domain: 'g2.com', label: 'G2', use: 'Reviews, categories and the competitive grid.' },
  ],

  monitor: {
    query: '{{market}} startup funding rounds, acquisitions, new entrants and product launches',
    why: 'New companies, rounds and deals that change the map.',
  },
};
