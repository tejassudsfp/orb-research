/**
 * Competitive analysis (P6.13, startup / product). Human-readable spec: docs/templates/competitive-analysis.md
 * (generated: `pnpm templates:docs`). Depth bar: docs/phase6/vc-dd-template.md.
 *
 * Parallel use: find_entities discovers the list, batch_enrich fills the Competitors database, deep_research closes
 * gaps, a monitor (Orb, on request) watches the field. Signed-in: G2, Crunchbase, LinkedIn, SimilarWeb.
 */
import type { RubricDimension, TemplateSpecInput } from './schema.js';
import {
  chart,
  checklist,
  criticFlags,
  criticReport,
  criticStart,
  db,
  depthField,
  emptyRisk,
  framework,
  hypothesis,
  materialsField,
  matrix,
  metric,
  orbDelegate,
  orbMemo,
  orbMonitor,
  question,
  redFlags,
  sitesField,
  step,
  tiers,
  timeline,
} from './kit.js';

export const CA_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'fit',
    name: 'Product fit',
    weight: 25,
    anchors: {
      1: 'Competitors meet the need better today.',
      3: 'On par: customers could pick either.',
      5: 'Clearly better for the target customer.',
    },
    frame: 'features',
  },
  {
    id: 'price',
    name: 'Price and packaging',
    weight: 15,
    anchors: {
      1: 'Priced above comparable plans with less included.',
      3: 'In line with the market.',
      5: 'Cheaper or simpler for the same outcome.',
    },
    frame: 'pricing',
  },
  {
    id: 'position',
    name: 'Positioning',
    weight: 15,
    anchors: {
      1: 'Indistinguishable from the field.',
      3: 'A clear claim, shared with one or two rivals.',
      5: 'An owned position buyers repeat back.',
    },
    frame: 'positioning',
  },
  {
    id: 'proof',
    name: 'Customer proof',
    weight: 20,
    anchors: {
      1: 'Few reviews and no named customers.',
      3: 'Solid reviews and a handful of references.',
      5: 'Strong reviews and marquee references, verified.',
    },
    frame: 'voice',
  },
  {
    id: 'momentum',
    name: 'Momentum',
    weight: 15,
    anchors: {
      1: 'Shrinking: fewer hires, launches and reviews.',
      3: 'Steady.',
      5: 'Accelerating faster than the field.',
    },
    frame: 'momentum',
  },
  {
    id: 'moat',
    name: 'Defensibility',
    weight: 10,
    anchors: {
      1: 'Easy to copy or switch away from.',
      3: 'Some switching costs.',
      5: 'Data, network, integration or brand lock-in.',
    },
    frame: 'swot',
  },
];

export const CA_RED_FLAGS = redFlags([
  [
    'A funded competitor ships our headline feature.',
    'Check the Feature coverage database and the changelogs for the product feature the intake calls our edge.',
  ],
  [
    'A comparable plan costs at least 30% less.',
    'Compare the Pricing database rows per unit and per seat; raise when a like-for-like plan is much cheaper.',
  ],
  [
    'An incumbent bundles the capability for free.',
    'Look for bundles, free tiers and suite announcements in the sources of the incumbents.',
  ],
  [
    'Our differentiator is a claim, not evidence.',
    'For each differentiator in the intake, find a feature row or review quote that proves it; a claim alone is raised.',
  ],
  [
    'One competitor holds a clear majority of review mentions.',
    'Count competitor mentions in the Review themes database; a dominant share is raised.',
  ],
  [
    'The real competitor is a substitute that was not counted (spreadsheets, in-house tools, agencies).',
    'Check the Competitors database for rows with category Substitute; none is raised as a gap.',
  ],
  [
    'A competitor is hiring or raising far faster than the field.',
    'Read the Momentum timeline and the funding chart for outsized rounds and open-role counts.',
  ],
  [
    'Consolidation: a rival was acquired or merged.',
    'Look for acquisition news in the sources; a recent deal changes who is the threat.',
  ],
  [
    'Pricing or feature data older than 12 months is used as if current.',
    'Check each row and source date; stale rows are marked and a Question asks for a refresh.',
  ],
  [
    'A review pattern we share (support, reliability, billing) is also a pattern for us.',
    'Compare the negative themes of competitors with our own reviews and notes.',
  ],
]);

export const COMPETITIVE_ANALYSIS: TemplateSpecInput = {
  id: 'competitive-analysis',
  label: 'Competitive analysis',
  dot: '#2563EB',
  placeholder: 'Which product or market do you want to analyse?',
  brief:
    'Map the competitive landscape for the product: a database of direct, indirect and substitute competitors, ' +
    'profiles of the ones that matter, feature coverage, pricing, positioning, customer voice, funding and ' +
    'momentum, a SWOT and threats, a recommendation on where to compete, and a battlecard for each top ' +
    'competitor. Cite every claim, date every price, and separate what a competitor says from what customers say.',
  titleFrom: '{{product}}: competitive analysis',

  inputs: [
    {
      id: 'product',
      label: 'Your product or company',
      kind: 'text',
      required: true,
      placeholder: 'Acme Analytics',
      maxLength: 70,
    },
    { id: 'website', label: 'Website URL', kind: 'url', placeholder: 'https://acme.com', maxLength: 300 },
    {
      id: 'category',
      label: 'Category',
      kind: 'text',
      placeholder: 'Product analytics',
      suggestions: ['Product analytics', 'CRM', 'Developer tools', 'Fintech', 'Healthcare software', 'Marketplace'],
      maxLength: 120,
    },
    {
      id: 'customer',
      label: 'Who you sell to',
      kind: 'longtext',
      placeholder: 'Mid-market SaaS product teams',
      maxLength: 400,
    },
    {
      id: 'decision',
      label: 'The decision this informs',
      kind: 'longtext',
      placeholder: 'Whether to move up-market or defend the SMB base',
      maxLength: 600,
    },
    {
      id: 'differentiators',
      label: 'Where you think you win',
      kind: 'longtext',
      placeholder: 'Faster setup, a better API, price',
      maxLength: 400,
    },
    {
      id: 'competitors',
      label: 'Known competitors',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout finds more.',
      maxLength: 800,
    },
    {
      id: 'geography',
      label: 'Region',
      kind: 'text',
      placeholder: 'Global, EU, US',
      maxLength: 120,
    },
    materialsField(
      'Drop win/loss notes, existing battlecards, pricing sheets, screenshots or an analyst report. Each becomes a card or database.',
    ),
    depthField,
    sitesField([
      { domain: 'g2.com', label: 'G2' },
      { domain: 'crunchbase.com', label: 'Crunchbase' },
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'similarweb.com', label: 'SimilarWeb' },
    ]),
  ],

  frames: [
    {
      id: 'landscape',
      title: 'Landscape',
      color: 'signal',
      brief:
        'Define the category and who {{product}} is compared with: direct competitors, indirect ones, incumbents, ' +
        'emerging startups and the substitutes buyers use instead (spreadsheets, in-house tools, agencies). One row ' +
        'per competitor in the Competitors database with a source on every row.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Competitors, at least 10 rows' },
        { type: 'entity', min: 1, note: 'your company' },
        { type: 'source', min: 4 },
      ],
      seeds: [
        {
          type: 'entity',
          data: {
            title: '{{product}}',
            kind: 'org',
            url: '{{website|}}',
            location: '{{geography|}}',
            body: 'The product under analysis, from your intake.',
            facts: [
              { label: 'Category', value: '{{category|to confirm}}' },
              { label: 'Sells to', value: '{{customer|to confirm}}' },
              { label: 'Claimed edge', value: '{{differentiators|to confirm}}' },
            ],
          },
          why: 'Your product, from your intake.',
        },
        db('Competitors', 'competitors'),
        question(
          'Who do buyers actually compare us with?',
          'Check review sites, "alternatives to" pages and win/loss notes, not only our own list.',
        ),
      ],
      room: 240,
    },
    {
      id: 'profiles',
      title: 'Competitor profiles',
      color: 'sky',
      brief:
        'A Product card for each competitor that matters (start with the top five by threat level): what it sells, ' +
        'to whom, pricing headline, strengths and weaknesses, with a source. Take a screenshot of each home page.',
      owners: ['scout'],
      targets: [
        { type: 'product', min: 5, note: 'kind competitor' },
        { type: 'image', min: 3, note: 'home page screenshots' },
        { type: 'source', min: 6 },
      ],
      seeds: [
        question(
          'Which three competitors matter most, and why?',
          'Rank by overlap with the target customer, funding and momentum, not by size alone.',
        ),
      ],
    },
    {
      id: 'features',
      title: 'Features & capabilities',
      color: 'rho',
      brief:
        'Which capabilities each competitor has: a row per feature and competitor in Feature coverage (Yes, ' +
        'Partial, No, Unknown) with the evidence url, and a weighted comparison matrix of the top competitors on ' +
        'the criteria buyers use. Say how you know each cell (docs, pricing page, changelog, review).',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Feature coverage, at least 20 rows' },
        { type: 'matrix', min: 1 },
        { type: 'source', min: 4 },
      ],
      seeds: [
        db('Feature coverage', 'features'),
        matrix(
          'Feature comparison',
          [
            { name: 'Core capability', weight: 30 },
            { name: 'Ease of use', weight: 20 },
            { name: 'Integrations', weight: 20 },
            { name: 'Security and admin', weight: 15 },
            { name: 'Support', weight: 15 },
          ],
          ['{{product}}', 'Competitor A', 'Competitor B'],
          'Placeholder: weighted criteria, scored from the Feature coverage database.',
        ),
      ],
    },
    {
      id: 'pricing',
      title: 'Pricing & packaging',
      color: 'sky',
      brief:
        'What each competitor charges: plans, price per unit (seat, usage, flat), billing, limits and what each ' +
        'plan includes, captured from the pricing page with the date. Note free tiers, enterprise-only pricing and ' +
        'discount patterns. A page behind a login is read only on a site the user connected.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Pricing, one row per plan' },
        { type: 'image', min: 3, note: 'pricing page screenshots' },
        { type: 'chart', min: 1, note: 'entry price by competitor' },
      ],
      seeds: [
        db('Pricing', 'pricing'),
        chart('Entry price by competitor', 'pricing', 'bar', 'Competitor', 'Price (USD per month)'),
      ],
    },
    {
      id: 'positioning',
      title: 'Positioning & messaging',
      color: 'rho',
      brief:
        'How each competitor describes itself: the headline, the promise, the proof points, the target buyer and ' +
        'the words they own. Quote the page. Place every competitor on a 2x2 and say which position is empty.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'quote', min: 6, note: 'headline claims, quoted' },
        { type: 'framework', min: 1, note: 'the 2x2' },
      ],
      seeds: [
        framework('Positioning 2x2', 'quadrant', { xAxis: 'Product breadth', yAxis: 'Ease of adoption' }),
        question('Which position in the market is nobody claiming?', 'Name the buyer and the message.'),
      ],
    },
    {
      id: 'voice',
      title: 'Customer voice',
      color: 'sky',
      brief:
        'What customers say: review themes from G2, Capterra, app stores and forums, switching stories, what people ' +
        'praise and complain about for each competitor. Quote positive and negative reviews, and tally recurring themes.',
      owners: ['scout'],
      targets: [
        { type: 'database', min: 1, note: 'Review themes' },
        { type: 'quote', min: 8, note: 'at least 3 negative' },
        { type: 'video', min: 1, note: 'a review or comparison video, if one exists' },
      ],
      seeds: [db('Review themes', 'reviews')],
    },
    {
      id: 'momentum',
      title: 'Funding & momentum',
      color: 'rho',
      brief:
        'Who is rising and who is stalling: funding rounds, headcount and hiring trend, launches, partnerships, ' +
        'acquisitions, traffic. Dated events with a source each.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'timeline', min: 1, note: 'market moves' },
        { type: 'chart', min: 1, note: 'funding by competitor' },
        { type: 'metric', min: 3, note: 'category size, growth, number of funded players' },
      ],
      seeds: [
        timeline('Market moves', 'Analysis started', 'Scout adds dated launches, rounds, hires and acquisitions.'),
        chart('Total funding by competitor', 'competitors', 'bar', 'Name', 'Total funding'),
        metric('Funded competitors', 'Count of competitors that raised venture funding; cite Crunchbase or press.'),
        metric('Category growth', 'Annual growth of the category, with the period and source.'),
        metric('Median entry price', 'Median of the entry prices in the Pricing database, with the date.'),
      ],
    },
    {
      id: 'swot',
      title: 'Strengths & weaknesses',
      color: 'paper',
      brief:
        'A SWOT of {{product}} against the field, built only from cards on the board: strengths and weaknesses are ' +
        'internal and supported by feature, review and pricing cards; opportunities and threats come from the market ' +
        'and momentum. Add pros and cons of the most threatening competitor.',
      owners: ['builder', 'critic', 'orb'],
      targets: [
        { type: 'framework', min: 2, note: 'SWOT and pros and cons' },
        { type: 'insight', min: 3, note: 'each citing at least 2 cards' },
      ],
      seeds: [
        framework('SWOT: {{product}} vs the field', 'swot'),
        framework('Top competitor: pros and cons', 'proscons'),
      ],
    },
    {
      id: 'threats',
      title: 'Threats & gaps',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a ' +
        'source. Add the competitive risks the checklist misses, and the gaps in what we know as Questions.',
      owners: ['critic'],
      targets: [{ type: 'risk', min: 5, note: 'every checklist item cleared with a source or raised' }],
      seeds: [
        checklist(
          'Red-flag checklist',
          CA_RED_FLAGS.map((f) => `${f.id} ${f.text}`),
          'Critic raises or clears each; you tick them off.',
        ),
        emptyRisk('Feature parity'),
        emptyRisk('Pricing pressure'),
        emptyRisk('Incumbent bundling'),
        emptyRisk('New entrant'),
      ],
    },
    {
      id: 'strategy',
      title: 'Strategy & recommendation',
      color: 'signal',
      brief:
        'Where to compete and how: the recommended position, which competitors to attack, avoid or partner with, ' +
        'what to build or message next, and what would change the answer. Score {{product}} against the rubric with ' +
        'cited evidence. The decision this informs: {{decision|not given}}.',
      owners: ['orb'],
      targets: [
        { type: 'decision', min: 1 },
        { type: 'hypothesis', min: 3, note: 'with evidence links' },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
        { type: 'insight', min: 3 },
      ],
      seeds: [
        hypothesis(
          'We win on {{differentiators|our claimed edge}}',
          'Evidence for and against the edge in your intake, from features, reviews and pricing.',
        ),
        hypothesis('The strongest threat is a funded incumbent, not a startup', 'Test against momentum and bundling.'),
        hypothesis(
          'There is an open position in the 2x2 we can own',
          'Name the position, the buyer and the proof we would need.',
        ),
        {
          type: 'decision',
          data: {
            title: 'Where should {{product}} compete?',
            body: 'Open. orb proposes after the rubric is filled and writes the weighted total in the rationale.',
            options: [
              { label: 'Attack the leader head on' },
              { label: 'Niche down to an underserved segment' },
              { label: 'Differentiate on one capability' },
              { label: 'Partner or integrate' },
            ],
            status: 'open',
          },
          why: 'Open decision: you choose; orb proposes.',
        },
        matrix(
          'Competitive position (rubric score x 2, so 10 is a 5)',
          CA_RUBRIC.map((d) => ({ name: `${d.name} (${d.weight}%)`, weight: d.weight })),
          ['orb score', 'Your score'],
          'orb fills one score per dimension with cited evidence; you may override.',
        ),
      ],
    },
    {
      id: 'battlecards',
      title: 'Battlecards',
      color: 'signal',
      brief:
        'A one-page battlecard per top competitor, for the sales and product team: how they pitch, where we win, ' +
        'where we lose, the objections to expect and the answer to each, with proof from the cards. Built only from ' +
        'cards on the board, each claim cited.',
      owners: ['builder', 'orb'],
      targets: [
        { type: 'design', min: 3, note: 'one battlecard per top competitor' },
        { type: 'checklist', min: 1, note: 'objection handling' },
      ],
      seeds: [
        checklist('Objections to prepare for', [
          'They are cheaper: what is our answer and our proof?',
          'They have more integrations: which of ours matter to this buyer?',
          'They are the safe choice: what reference stories do we have?',
        ]),
      ],
    },
  ],

  databases: [
    {
      key: 'competitors',
      name: 'Competitors',
      frame: 'landscape',
      purpose: 'Every competitor, discovered with find_entities and enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'URL', type: 'url' },
        {
          name: 'Category',
          type: 'enum',
          options: ['Direct', 'Indirect', 'Incumbent', 'Emerging', 'Substitute'],
        },
        { name: 'Target customer', type: 'text' },
        { name: 'Positioning', type: 'text', note: 'Their headline in a line.' },
        { name: 'HQ', type: 'text' },
        { name: 'Founded', type: 'number' },
        { name: 'Headcount', type: 'number' },
        { name: 'Total funding', type: 'currency', note: 'US dollars.' },
        { name: 'Last round', type: 'text' },
        { name: 'Key strength', type: 'text' },
        { name: 'Key weakness', type: 'text' },
        { name: 'Threat level', type: 'rating', note: '1 (low) to 5 (high).' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Threat level', dir: 'desc' }] },
        { name: 'By category', kind: 'board', group: 'Category' },
        { name: 'High threat', kind: 'table', filter: [{ column: 'Threat level', op: 'gte', value: 4 }] },
      ],
    },
    {
      key: 'features',
      name: 'Feature coverage',
      frame: 'features',
      purpose: 'One row per feature and competitor, so coverage can be filtered, counted and charted.',
      keyColumn: 'Feature',
      columns: [
        { name: 'Feature', type: 'text' },
        { name: 'Area', type: 'text', note: 'Core, integrations, security, admin, support.' },
        { name: 'Competitor', type: 'text', note: 'Use the name from the Competitors database.' },
        { name: 'Support', type: 'enum', options: ['Yes', 'Partial', 'No', 'Unknown'] },
        { name: 'Evidence', type: 'url' },
        { name: 'Note', type: 'text' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Feature', dir: 'asc' }] },
        { name: 'By support', kind: 'board', group: 'Support' },
        { name: 'Gaps', kind: 'table', filter: [{ column: 'Support', op: 'in', value: ['No', 'Unknown'] }] },
      ],
    },
    {
      key: 'pricing',
      name: 'Pricing',
      frame: 'pricing',
      purpose: 'Every plan of every competitor with the date it was captured.',
      keyColumn: 'Plan',
      columns: [
        { name: 'Competitor', type: 'text' },
        { name: 'Plan', type: 'text' },
        { name: 'Price (USD per month)', type: 'currency', note: 'Per unit; annual price divided by 12.' },
        { name: 'Unit', type: 'text', note: 'Seat, usage, flat, per workspace.' },
        { name: 'Billing', type: 'enum', options: ['Monthly', 'Annual', 'Usage', 'Custom'] },
        { name: 'Limits', type: 'text' },
        { name: 'Includes', type: 'text' },
        { name: 'Captured on', type: 'date' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Price (USD per month)', dir: 'asc' }] },
        { name: 'By competitor', kind: 'table', group: 'Competitor' },
      ],
    },
    {
      key: 'reviews',
      name: 'Review themes',
      frame: 'voice',
      purpose: 'Recurring themes in customer reviews, with how often and one quote each.',
      keyColumn: 'Theme',
      columns: [
        { name: 'Competitor', type: 'text' },
        { name: 'Theme', type: 'text' },
        { name: 'Sentiment', type: 'enum', options: ['Positive', 'Mixed', 'Negative'] },
        { name: 'Mentions', type: 'number', note: 'How many reviews raise it.' },
        { name: 'Example quote', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Mentions', dir: 'desc' }] },
        { name: 'By sentiment', kind: 'board', group: 'Sentiment' },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read what the user dropped first: win/loss notes, battlecards, pricing sheets, screenshots (read_card, ' +
          'read_source; query_dataset for databases). Put every competitor named in them into the Competitors ' +
          'database (upsert_rows) with the file as its source. Note the decision the analysis informs and keep it in view.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['landscape'],
      }),
      orbDelegate(
        'Scout first (its seven-step playbook), Builder once Scout has pricing and feature rows, Critic once Scout has sources to review.',
      ),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (a competitor with no pricing, a segment with no reviews), run deep_research (core) on that one question.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'rubric',
        text: 'Fill the Competitive position matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card in the why line. Then the SWOT, the three hypotheses (evidence for and against as card ids) and the Decision: your proposed option and the weighted total in its rationale.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['strategy', 'swot'],
      }),
      orbMemo,
      step({
        id: 'battlecards',
        text: 'Check each battlecard Builder made against the cards it cites; any claim without a citation is removed or sent back to Builder with message_agent.',
        tools: ['search_board', 'read_card', 'message_agent'],
        frames: ['battlecards'],
        minTier: 'standard',
      }),
      orbMonitor,
    ],
    scout: [
      step({
        id: 'site',
        text: "Our own site first (fetch_url): positioning, pricing, customers. Then the competitors the user named: home and pricing page of each, screenshot with capture_page, one Product card (kind competitor) for the top five and a row in Competitors (upsert_rows, key Name) for every one.",
        tools: ['fetch_url', 'parallel_extract', 'capture_page', 'place_card', 'upsert_rows'],
        frames: ['landscape', 'profiles'],
      }),
      step({
        id: 'discover',
        text: 'Discover the rest of the field: find_entities (the match limit follows the depth tier) fills a database card of its own; batch_enrich fills the Competitors columns (target customer, positioning, HQ, founded, headcount, funding, last round, strength, weakness). Read each run database with query_dataset and upsert the rows into Competitors (key Name) with a Source url. Quick scan: find_entities and batch_enrich are refused, so add rows from web_search and "alternatives to" pages.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'upsert_rows', 'query_dataset'],
        frames: ['landscape'],
      }),
      step({
        id: 'features',
        text: 'Features: for the top competitors read docs, feature pages and changelogs (fetch_url, parallel_extract) and write one Feature coverage row per feature and competitor (upsert_rows, key Feature, with the Competitor column) with an evidence url. Mark Unknown rather than guess.',
        tools: ['fetch_url', 'parallel_extract', 'web_search', 'upsert_rows', 'place_card'],
        frames: ['features'],
      }),
      step({
        id: 'pricing',
        text: 'Pricing: every plan of every top competitor into Pricing (upsert_rows) with the capture date; screenshot each pricing page. Enterprise-only pricing is a row with Billing "Custom", not a guess. G2 or SimilarWeb pages only through fetch_signed_in, and only if the user ticked them.',
        tools: ['fetch_url', 'capture_page', 'fetch_signed_in', 'upsert_rows', 'place_card'],
        frames: ['pricing'],
      }),
      step({
        id: 'positioning',
        text: 'Positioning: quote each competitor\'s home page headline and promise as Quote cards (positioning frame). Add the words competitors own as a Question or note for Builder.',
        tools: ['fetch_url', 'place_card', 'query_board'],
        frames: ['positioning'],
      }),
      step({
        id: 'voice',
        text: 'Customer voice: G2, Capterra, app stores, Reddit and Hacker News (web_search, fetch_url, fetch_signed_in if ticked). Quote cards, positive and negative; tally themes into Review themes (upsert_rows, key Theme). A review or comparison video becomes a Video card.',
        tools: ['web_search', 'fetch_url', 'fetch_signed_in', 'place_card', 'upsert_rows'],
        frames: ['voice'],
      }),
      step({
        id: 'momentum',
        text: 'Momentum: funding, headcount, hiring, launches and acquisitions on the Market moves timeline (each event with its source); fill Total funding and Last round in Competitors; fill the three metrics.',
        tools: ['web_search', 'fetch_url', 'fetch_signed_in', 'place_card', 'upsert_rows'],
        frames: ['momentum'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain: deep_research (core or above, per the tier), for example a category report or a competitor with little public data.',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      criticStart,
      criticFlags(['threats', 'features', 'pricing']),
      step({
        id: 'single-source',
        text: 'Challenge every price, feature cell and funding figure that has a single source or an old date: link it with "tension" to the card that disagrees, or place a Question asking for the second source. Challenge each differentiator claim the user made: evidence or a Risk.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['positioning', 'threats'],
      }),
      step({
        id: 'insights',
        text: 'Turn patterns into Insight cards that cite at least two cards each (for example: three competitors raise price on annual plans; the same support complaint appears across rivals).',
        tools: ['query_board', 'search_board', 'place_card', 'add_link'],
        frames: ['swot'],
      }),
      criticReport,
    ],
    builder: [
      step({
        id: 'charts',
        text: 'Charts bound to the databases: entry price by competitor (bar, Pricing), total funding by competitor (bar, Competitors). Fix the axes if a column is empty.',
        tools: ['place_card', 'query_dataset'],
        frames: ['pricing', 'momentum'],
      }),
      step({
        id: 'matrix',
        text: 'The feature comparison matrix: weighted criteria, scores 0 to 10 for each competitor derived from Feature coverage (query_dataset); the note of each option says which rows it came from.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['features'],
      }),
      step({
        id: 'positioning',
        text: 'The positioning 2x2 (framework, quadrant): place every competitor on the two axes from the quotes and features; name the empty quadrant. The SWOT of our product, from cards only.',
        tools: ['place_card', 'query_board', 'read_card'],
        frames: ['positioning', 'swot'],
      }),
      step({
        id: 'battlecards',
        text: 'One battlecard per top competitor as a design frame (write_design_frame): how they pitch, where we win and lose, objections and answers, built only from cards on the board and each claim cited in the card text.',
        tools: ['write_design_frame', 'query_board', 'read_card', 'place_card'],
        frames: ['battlecards'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...CA_RUBRIC],
  redFlags: [...CA_RED_FLAGS],

  output: {
    memoTitle: 'Competitive analysis: {{product}}',
    citationRule:
      'Every paragraph cites cards; every price and funding figure cites its source and date; what a competitor says is marked apart from what customers say.',
    sections: [
      {
        id: 'summary',
        title: 'Summary & recommendation',
        frames: ['strategy', 'threats'],
        words: 150,
        guidance: 'The recommended position, the top 3 reasons, the top 3 threats, in at most 150 words.',
      },
      {
        id: 'landscape',
        title: 'The landscape',
        frames: ['landscape'],
        guidance: 'The category, the competitors by group, and the substitutes, as a table.',
      },
      {
        id: 'profiles',
        title: 'Key competitors',
        frames: ['profiles'],
        guidance: 'A paragraph per top competitor: what it sells, to whom, strengths and weaknesses.',
      },
      {
        id: 'features',
        title: 'Features & capabilities',
        frames: ['features'],
        guidance: 'The coverage matrix and where we lead, match and lag.',
      },
      {
        id: 'pricing',
        title: 'Pricing & packaging',
        frames: ['pricing'],
        guidance: 'A pricing table with dates, the entry price chart and the packaging patterns.',
      },
      {
        id: 'positioning',
        title: 'Positioning & messaging',
        frames: ['positioning'],
        guidance: 'The 2x2, the claims quoted, the open position.',
      },
      {
        id: 'voice',
        title: 'Customer voice',
        frames: ['voice'],
        guidance: 'Review themes by competitor, with quotes.',
      },
      {
        id: 'momentum',
        title: 'Funding & momentum',
        frames: ['momentum'],
        guidance: 'The market moves timeline and the funding chart.',
      },
      {
        id: 'swot',
        title: 'Strengths, weaknesses, threats',
        frames: ['swot', 'threats'],
        guidance: 'The SWOT and the red-flag outcomes: each raised flag with its mitigant.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard',
        frames: ['strategy'],
        guidance: 'The rubric table: each dimension, its weight, its score and its evidence.',
      },
      {
        id: 'strategy',
        title: 'Strategy & next steps',
        frames: ['strategy', 'battlecards'],
        guidance: 'Where to compete, who to attack, avoid or partner with, and what would change the answer.',
      },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{product}} competitive position',
      includes: ['Landscape', 'Score', 'Recommendation', 'Top threats'],
    },
    deckFormat: 'standard',
    deck: {
      title: 'Competitive review: {{product}}',
      slides: [
        { title: 'The answer', brief: 'The recommendation and the three reasons.' },
        { title: 'The landscape', brief: 'Competitors grouped by direct, indirect, incumbent and substitute.' },
        { title: 'Who matters most', brief: 'The top competitors with one line each and the threat level.' },
        { title: 'Feature comparison', brief: 'The weighted matrix with the winner highlighted.' },
        { title: 'Pricing', brief: 'The pricing table and the entry price chart.' },
        { title: 'Positioning', brief: 'The 2x2 and the open position.' },
        { title: 'What customers say', brief: 'Review themes and two quotes per competitor.' },
        { title: 'Momentum', brief: 'Funding and the market moves timeline.' },
        { title: 'Threats', brief: 'The raised red flags with mitigants.' },
        { title: 'Recommendation and next steps', brief: 'Where to compete and what to do in the next 30 days.' },
      ],
    },
  },

  tiers: tiers({
    quick:
      'No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, the top five competitors and the memo is the summary only.',
    standard:
      'Quick, plus find_entities and batch_enrich for the competitor list and one or two deep-research runs (core), asking before spend.',
    deep: 'Standard, plus pro or ultra research on the category and the top competitors, full competitor discovery and battlecards for each.',
  }),

  followUps: [
    {
      label: 'Go deeper on competitor X',
      prompt:
        'Go deeper on [competitor]: product, pricing, customers, funding, how it beats or loses to {{product}}, with sources.',
    },
    {
      label: 'Refresh the pricing',
      prompt: 'Recheck every price in the Pricing database today and tell me what changed since it was captured.',
    },
    {
      label: 'Write the sales battlecard',
      prompt:
        'Write a one-page sales battlecard for [competitor] against {{product}}: pitch, where we win and lose, objections and answers, each cited.',
    },
    {
      label: 'Find the open position',
      prompt: 'Which position in the market is nobody claiming? Use the 2x2 and the quotes, and say what proof we would need.',
    },
    {
      label: 'Watch the field',
      prompt: 'Start a monitor on the competitors: launches, pricing changes, funding and leadership moves.',
    },
    {
      label: 'Stress-test our edge',
      prompt: 'Build the strongest case that {{differentiators|our claimed edge}} is not a real advantage, from the cards on the board.',
    },
  ],

  signedIn: [
    { domain: 'g2.com', label: 'G2', use: 'Reviews, ratings, alternatives and category rankings.' },
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Funding rounds, investors and headcount of competitors.' },
    { domain: 'linkedin.com', label: 'LinkedIn', use: 'Headcount, hiring trend and leadership of competitors.' },
    { domain: 'similarweb.com', label: 'SimilarWeb', use: 'Traffic and audience trend of competitor sites.' },
  ],

  monitor: {
    query: '{{product}} competitors: launches, pricing changes, funding, acquisitions and leadership moves',
    why: 'A competitor move that would change the recommendation.',
  },
};
