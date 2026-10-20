/**
 * Market entry for a new country (P6.14): should we enter, with what, how and in what order. The country, demand,
 * customers, competition, regulation, economics, channels and entry mode, operations and talent, risks, a roadmap, the
 * open questions and a go or no-go. The human-readable version of this file is docs/templates/market-entry.md
 * (generated: `pnpm templates:docs`).
 */
import {
  checklist,
  db,
  decisionSeed,
  depthField,
  emptyRisk,
  hypothesis,
  matrixSeed,
  materialsField,
  metric,
  proscons,
  question,
  quadrant,
  scorecardSeed,
  sitesField,
  step,
  swot,
  tiersFor,
} from './kit-business.js';
import type { RedFlag, RubricDimension, TemplateSpecInput } from './schema.js';

// ---- the rubric (weights add up to 100) ----

export const MARKET_ENTRY_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'attractiveness',
    name: 'Market attractiveness',
    weight: 25,
    anchors: {
      1: 'Small, flat or shrinking demand for what we sell.',
      3: 'A sizeable market with steady growth.',
      5: 'Large and fast growing, with a clear reason demand is rising now.',
    },
    frame: 'demand',
  },
  {
    id: 'win',
    name: 'Ability to win',
    weight: 20,
    anchors: {
      1: 'Entrenched incumbents win on price or relationships we cannot match.',
      3: 'A crowded market with a defensible niche.',
      5: 'A clear gap our offer fills, and proof from similar customers.',
    },
    frame: 'competition',
  },
  {
    id: 'regulation',
    name: 'Regulation and ease of operating',
    weight: 15,
    anchors: {
      1: 'A licence, a local partner or data localisation blocks entry for a year or more.',
      3: 'Manageable requirements; three to six months to comply.',
      5: 'Light requirements; we can sell within weeks.',
    },
    frame: 'regulation',
  },
  {
    id: 'economics',
    name: 'Economics',
    weight: 15,
    anchors: {
      1: 'Loses money in every scenario inside the planning horizon.',
      3: 'Break-even in the base case within 24 months.',
      5: 'Break-even inside 12 months in the base case, with room in price.',
    },
    frame: 'economics',
  },
  {
    id: 'channels',
    name: 'Channel and partner access',
    weight: 15,
    anchors: {
      1: 'No credible way to reach customers.',
      3: 'Known channels with some partner interest.',
      5: 'A shortlist of qualified partners or channels, with warm introductions.',
    },
    frame: 'channels',
  },
  {
    id: 'risk',
    name: 'Risk',
    weight: 10,
    anchors: {
      1: 'Several raised red flags with no mitigant.',
      3: 'Some raised flags, each with a mitigant.',
      5: 'No raised flag that a mitigant does not cover.',
    },
    frame: 'risks',
  },
];

// ---- the red-flag checklist ----

export const MARKET_ENTRY_RED_FLAGS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: 'Political instability, sanctions, export controls or a government stance that makes the sector unsafe.',
    check: 'Search sanctions lists, export-control rules and recent political and trade news for the country and sector.',
  },
  {
    id: 'RF02',
    text: 'Currency controls, a volatile currency or limits on moving profits out of the country.',
    check: 'Look for exchange-rate history, inflation, capital-control rules and the withholding tax on remittances.',
  },
  {
    id: 'RF03',
    text: 'A licence, a local partner, a minimum local ownership or local content rule is required to operate.',
    check: 'Read the Regulatory requirements database for any row marked Blocking and for foreign-ownership rules.',
  },
  {
    id: 'RF04',
    text: 'Data localisation or cross-border data rules that our product does not meet.',
    check: 'Compare the data rules with where we host and process data; raise a gap with the lead time to close it.',
  },
  {
    id: 'RF05',
    text: 'Entrenched local incumbents, or a price level well below our price.',
    check: 'Read Competitors in country and Pricing benchmarks: shares, price points and a local champion with a lock on channels.',
  },
  {
    id: 'RF06',
    text: 'Tax and invoicing complexity: VAT registration, e-invoicing mandates, withholding taxes or a permanent-establishment risk.',
    check: 'Read the tax rows in Regulatory requirements and the Cost model; raise anything not yet priced.',
  },
  {
    id: 'RF07',
    text: 'Weak intellectual-property enforcement or a trademark already taken locally.',
    check: 'Search the trademark register and read the IP enforcement record for the country.',
  },
  {
    id: 'RF08',
    text: 'Employment law, hiring cost or a talent shortage that breaks the plan.',
    check: 'Read Talent and operating costs for notice periods, works-council rules, salary levels and time to hire.',
  },
  {
    id: 'RF09',
    text: 'Product-market fit assumed from the home market: language, payment methods, buying habits or culture differ.',
    check: 'Read Segments and the quotes: is there local evidence of demand, or only home-market evidence?',
  },
  {
    id: 'RF10',
    text: 'Customer acquisition costs or sales cycles are likely higher than the home market, and the plan assumes they are the same.',
    check: 'Compare the Cost model’s acquisition assumptions with local benchmarks and the sales cycle in the Segments rows.',
  },
  {
    id: 'RF11',
    text: 'Payment, logistics or infrastructure gaps: low card use, poor delivery or unreliable connectivity.',
    check: 'Look for payment-method share, delivery times and connectivity data; raise any that the product needs.',
  },
  {
    id: 'RF12',
    text: 'Corruption, reputational or ethical exposure for the company in this market.',
    check: 'Check corruption indices, partner screening needs and recent enforcement actions against foreign firms.',
  },
];

export const MARKET_ENTRY: TemplateSpecInput = {
  id: 'market-entry',
  label: 'Market entry',
  dot: '#0891B2',
  placeholder: 'Which country are you considering entering?',
  brief:
    'Decide whether and how to enter a new country: twelve numbered frames (country snapshot, market size and demand, ' +
    'customers and segments, competition, regulation and compliance, economics, channels and entry mode, localisation and ' +
    'operations, risks, go-to-market and roadmap, open questions, decision), the red-flag checklist, the weighted scorecard ' +
    'and an entry memo. Size demand bottom-up and top-down, find the competitors and channel partners with Parallel, price ' +
    'the compliance and the cost of entry, and end with a recommendation (Go, Go later, Test first, No-go) and a 90-day plan.',
  titleFrom: 'Market entry: {{country}}',

  // ---- the intake form ----
  inputs: [
    {
      id: 'country',
      label: 'Country (or region)',
      kind: 'text',
      required: true,
      placeholder: 'Germany',
      maxLength: 120,
    },
    {
      id: 'offer',
      label: 'What you would sell',
      kind: 'longtext',
      required: true,
      placeholder: 'A B2B invoicing app for small firms, in 6 languages',
      maxLength: 1500,
    },
    {
      id: 'mode',
      label: 'Entry mode in mind',
      kind: 'select',
      options: [
        'Direct (local entity)',
        'Distributor / reseller',
        'Partnership / JV',
        'Acquisition',
        'Online / cross-border',
        'Not sure',
      ],
      maxLength: 40,
    },
    {
      id: 'segment',
      label: 'Target customers',
      kind: 'text',
      placeholder: 'Firms with 10 to 200 employees',
      suggestions: ['Consumers', 'SMB', 'Mid-market', 'Enterprise', 'Public sector', 'Developers'],
      maxLength: 160,
    },
    {
      id: 'home',
      label: 'Where you operate today',
      kind: 'text',
      placeholder: 'United States, United Kingdom',
      group: 'where',
      maxLength: 160,
    },
    {
      id: 'traction',
      label: 'Traction at home',
      kind: 'text',
      placeholder: '$4M ARR, 600 customers',
      group: 'where',
      maxLength: 160,
    },
    {
      id: 'budget',
      label: 'Budget for entry',
      kind: 'text',
      placeholder: '$1.5M over 18 months',
      group: 'plan',
      maxLength: 120,
    },
    {
      id: 'timeline',
      label: 'Target launch',
      kind: 'text',
      placeholder: 'Q3 2027',
      group: 'plan',
      maxLength: 80,
    },
    {
      id: 'competitors',
      label: 'Competitors you know there',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout finds more.',
      maxLength: 800,
    },
    {
      id: 'contacts',
      label: 'People or partners you know there',
      kind: 'people',
      placeholder: 'One per line: Name, role, LinkedIn URL',
      help: 'Optional.',
      maxLength: 1500,
    },
    {
      id: 'concerns',
      label: 'Specific concerns to probe',
      kind: 'longtext',
      placeholder: 'Local data rules, a strong incumbent, hiring…',
      maxLength: 1500,
    },
    materialsField('Drop market research, a financial model, pricing sheets, a local partner proposal or legal advice. Each becomes a card or database.'),
    depthField(),
    sitesField([
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'crunchbase.com', label: 'Crunchbase' },
      { domain: 'similarweb.com', label: 'Similarweb' },
      { domain: 'g2.com', label: 'G2' },
    ]),
  ],

  // ---- the twelve frames ----
  frames: [
    {
      id: 'snapshot',
      title: 'Country snapshot',
      color: 'signal',
      brief:
        '{{country}} in one paragraph and in numbers: population, GDP and growth, GDP per capita, currency and inflation, ' +
        'internet and smartphone penetration, ease of doing business, languages, and the economic structure that matters for ' +
        '{{segment|the target customers}}. Every figure has a year and a source.',
      owners: ['orb'],
      targets: [
        { type: 'metric', min: 6 },
        { type: 'doc', min: 1, note: 'the country in one paragraph' },
        { type: 'source', min: 2, note: 'official statistics' },
      ],
      seeds: [
        {
          type: 'doc',
          data: {
            title: '{{country}} in one paragraph',
            body: 'What makes {{country}} worth considering for: {{offer}}. orb writes it after the first pass.',
          },
          why: 'The one-paragraph description.',
        },
        metric('Population', 'People, with the year and the source.'),
        metric('GDP', 'Nominal GDP in USD, with the year.'),
        metric('GDP growth', 'Real growth, with the year.'),
        metric('Internet penetration', 'Share of the population online, with the year.'),
        metric('Currency and inflation', 'Currency, exchange-rate trend and inflation, with the year.'),
        metric('Ease of doing business', 'The best current index or ranking, with the year; say which index.'),
      ],
      room: 360,
    },
    {
      id: 'demand',
      title: 'Market size and demand',
      color: 'sky',
      brief:
        'How big the opportunity is for {{offer}}: TAM, SAM and SOM both top-down and bottom-up with the method stated, ' +
        'growth, the why-now (technology, regulation, behaviour), how demand is shifting and what proves that customers ' +
        'there pay for this today. Separate home-market evidence from local evidence.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'metric', min: 4, note: 'TAM, SAM, SOM, CAGR, each cited' },
        { type: 'chart', min: 2, note: 'size build-up and growth, bound to the sizing database' },
        { type: 'database', min: 1, note: 'Market sizing inputs' },
        { type: 'source', min: 4, note: 'including 1 independent report' },
      ],
      seeds: [
        db('Market sizing inputs', 'sizing'),
        metric('TAM', 'Cite the source and the method (top-down or bottom-up).'),
        metric('SAM', 'The part of the TAM we can serve with the target customers and the entry mode.'),
        metric('SOM', 'What is plausibly winnable in 3 years.'),
        metric('CAGR', 'Market growth rate with its period.'),
        hypothesis('Demand for {{offer}} exists in {{country}}', 'Customers there pay for this today, and the reason demand is rising is clear.'),
        {
          type: 'chart',
          data: { title: 'Market size build-up', mark: 'bar', x: 'Assumption', y: 'Value' },
          db: 'sizing',
          why: 'Bound to Market sizing inputs: it fills as rows arrive.',
        },
      ],
    },
    {
      id: 'customers',
      title: 'Customers and segments',
      color: 'rho',
      brief:
        'Who buys, how they buy and what they pay: the segments by size, growth and willingness to pay, who decides, the ' +
        'buying process and its length, the language and payment habits, and which one or two segments to enter first. ' +
        'Quote local customers where possible.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Segments' },
        { type: 'quote', min: 4, note: 'local buyers or analysts' },
        { type: 'entity', min: 2, note: 'buyer personas or reference customers' },
        { type: 'chart', min: 1, note: 'segment size, bound to the Segments database' },
      ],
      seeds: [
        db('Segments', 'segments'),
        {
          type: 'chart',
          data: { title: 'Segments by size', mark: 'bar', x: 'Segment', y: 'Size (firms or people)' },
          db: 'segments',
          why: 'Bound to Segments: it fills as rows arrive.',
        },
        question(
          'Which segment should we enter first, and why?',
          'The one with the strongest local evidence of demand, the shortest buying cycle and the least entrenched competition.',
        ),
      ],
    },
    {
      id: 'competition',
      title: 'Competitive landscape',
      color: 'sky',
      brief:
        'Who we would face in {{country}}: local leaders, global players already present, regional challengers and substitutes ' +
        '(spreadsheets, in-house work). Share, positioning, pricing, strengths and weaknesses, funding and who is winning and ' +
        'why. Include the competitors the user named.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'at least 8 competitors, local and global' },
        { type: 'matrix', min: 1 },
        { type: 'framework', min: 1, note: 'the 2x2' },
        { type: 'product', min: 3, note: 'the strongest competitors' },
      ],
      seeds: [
        db('Competitors in country', 'competitors'),
        matrixSeed(
          'Competitor comparison',
          [
            ['Product depth', 25],
            ['Local fit (language, payments, compliance)', 25],
            ['Distribution', 20],
            ['Pricing', 15],
            ['Customer proof', 15],
          ],
          ['Us', 'Local leader', 'Global incumbent'],
        ),
        quadrant('Positioning in {{country}}', 'Local fit', 'Product depth'),
      ],
    },
    {
      id: 'regulation',
      title: 'Regulation and compliance',
      color: 'rho',
      brief:
        'What must be true to operate legally and to sell: entity setup, licences and registrations, data protection and ' +
        'localisation, tax and invoicing, employment law, consumer and sector rules, IP protection and customs. For each: ' +
        'the authority, the lead time, the cost and whether it blocks launch.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Regulatory requirements' },
        { type: 'timeline', min: 1, note: 'lead times to launch' },
        { type: 'source', min: 4, note: 'official sources, not blogs' },
      ],
      seeds: [
        db('Regulatory requirements', 'regulation'),
        {
          type: 'timeline',
          data: {
            title: 'Path to a legal launch',
            events: [
              {
                date: '{{year}}',
                label: 'Assessment started',
                detail: 'Scout adds the steps to launch in order, each with its lead time and source.',
                source: { label: 'orb template' },
              },
            ],
          },
          why: 'Placeholder: the steps to launch, each with a source.',
        },
        question(
          'What is the longest lead-time item, and can it start now?',
          'A licence, a registration or an audit that sets the earliest launch date.',
        ),
      ],
    },
    {
      id: 'economics',
      title: 'Economics and pricing',
      color: 'sky',
      brief:
        'What entry costs and what it earns: price points against local benchmarks, the cost of entry (setup, legal, ' +
        'localisation, people, marketing, taxes), unit economics in the new market, break-even in low, base and high ' +
        'scenarios and what must be true for the base case. Mark each cost as a quote, a benchmark or an assumption.',
      owners: ['scout', 'builder', 'orb'],
      targets: [
        { type: 'database', min: 2, note: 'Cost model and Pricing benchmarks' },
        { type: 'chart', min: 1, note: 'cost by category, bound to the Cost model' },
        { type: 'math', min: 1, note: 'the break-even' },
        { type: 'metric', min: 3 },
      ],
      seeds: [
        db('Cost model', 'costs'),
        db('Pricing benchmarks', 'pricing'),
        metric('Cost of entry (18 months)', 'Total of the Cost model for the first 18 months, with the assumptions.'),
        metric('Local price point', 'The price we would charge, in local currency and USD, against the benchmark.'),
        metric('Break-even', 'Month in which cumulative margin turns positive in the base case.'),
        {
          type: 'chart',
          data: { title: 'Cost of entry by category', mark: 'bar', x: 'Category', y: 'Amount (USD)' },
          db: 'costs',
          why: 'Bound to the Cost model: it fills as rows arrive.',
        },
      ],
    },
    {
      id: 'channels',
      title: 'Channels and entry mode',
      color: 'rho',
      brief:
        'How to reach customers and in what legal form: direct with a local entity, a distributor or reseller, a partnership ' +
        'or JV, an acquisition or selling cross-border online. Compare the modes on speed, cost, control, risk and learning, then ' +
        'build a list of the real partners and channels (distributors, agencies, platforms, associations) with fit and contact.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Channel partners, at least 10' },
        { type: 'matrix', min: 1, note: 'the entry modes compared' },
        { type: 'framework', min: 1, note: 'pros and cons of the leading mode' },
      ],
      seeds: [
        db('Channel partners', 'partners'),
        matrixSeed(
          'Entry modes compared',
          [
            ['Speed to first revenue', 25],
            ['Upfront cost', 20],
            ['Control of the customer', 20],
            ['Risk', 20],
            ['Learning about the market', 15],
          ],
          ['Direct (local entity)', 'Distributor / reseller', 'Partnership / JV', 'Acquisition', 'Online / cross-border'],
        ),
        proscons('The leading entry mode: pros and cons'),
      ],
    },
    {
      id: 'operations',
      title: 'Localisation, talent and operations',
      color: 'sky',
      brief:
        'What changes to run the business there: product localisation (language, currency, payments, formats), support hours ' +
        'and language, the first hires and their cost, employment rules, the office or the employer-of-record route, banking and ' +
        'insurance. Find the real cost and time to hire for each role.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Talent and operating costs' },
        { type: 'checklist', min: 1, note: 'the localisation checklist' },
        { type: 'source', min: 3 },
      ],
      seeds: [
        db('Talent and operating costs', 'talent'),
        checklist('Localisation checklist', [
          'Language: UI, documentation, support and contracts.',
          'Payments: the methods local customers use, and the fees.',
          'Currency, tax invoices and legal entity details on documents.',
          'Support hours and a local phone or chat channel.',
          'Data hosting location and the data-processing agreement.',
        ]),
      ],
    },
    {
      id: 'risks',
      title: 'Risks and red flags',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Also ' +
        'covers political, economic, legal, operational and reputational risk, key-person risk in the local team and the cost of ' +
        'being wrong (the exit plan).',
      owners: ['critic'],
      targets: [{ type: 'risk', min: 6, note: 'every checklist item cleared with a source or raised' }],
      seeds: [
        {
          type: 'checklist',
          data: {
            title: 'Red-flag checklist',
            items: MARKET_ENTRY_RED_FLAGS.map((f, i) => ({ id: `rf${i + 1}`, text: `${f.id} ${f.text}`, done: false })),
          },
          why: 'Critic raises or clears each; you tick them off.',
        },
        emptyRisk('Political and economic'),
        emptyRisk('Regulatory and legal'),
        emptyRisk('Competitive'),
        emptyRisk('Operational'),
        emptyRisk('Financial'),
      ],
    },
    {
      id: 'plan',
      title: 'Go-to-market and roadmap',
      color: 'signal',
      brief:
        'The plan if we go: the segment and message to lead with, the channel and the first partners, pricing, the milestones ' +
        'for the first 90, 180 and 365 days with owners and the budget, the metrics that prove it works and the stop conditions ' +
        'that end the effort. Reuse what the board says; do not invent new facts here.',
      owners: ['orb', 'builder'],
      targets: [
        { type: 'timeline', min: 1, note: 'the roadmap' },
        { type: 'checklist', min: 1, note: 'the first 90 days' },
        { type: 'framework', min: 1, note: 'pros and cons of the go-to-market motion' },
      ],
      seeds: [
        {
          type: 'timeline',
          data: {
            title: 'Roadmap: 90, 180 and 365 days',
            events: [
              {
                date: '{{year}}',
                label: 'Decision on {{country}}',
                detail: 'orb adds the milestones: entity, licences, hires, first partner, first revenue, review.',
                source: { label: 'orb template' },
              },
            ],
          },
          why: 'Placeholder: the milestones with owners.',
        },
        checklist('First 90 days', [
          'Start the longest lead-time registration or licence.',
          'Sign or shortlist the first channel partner.',
          'Fix the local price and the localised pricing page.',
          'Hire or contract the first local owner.',
          'Run a small paid test with five target customers.',
        ]),
        proscons('Go-to-market motion: pros and cons'),
      ],
    },
    {
      id: 'questions',
      title: 'Open questions and validation',
      color: 'paper',
      brief:
        'What we still do not know and how to find out cheaply before committing: the questions ranked by how much they would ' +
        'change the decision, each linked to the gap or risk behind it, and the small experiments (customer calls, a landing page ' +
        'test, a partner pilot) that would answer them. Every unresolved question card on the board is collected here.',
      owners: ['critic', 'orb'],
      targets: [
        { type: 'checklist', min: 2, note: 'at least 10 ranked questions and the validation experiments' },
      ],
      seeds: [
        checklist('Open questions', [
          'Your concerns to probe: {{concerns|none given yet}}',
          'Which of our assumptions would stop us if it were wrong?',
          'What would a local customer pay for this, and how do we know?',
        ]),
        checklist('Validation experiments', [
          'Five customer interviews in the first target segment.',
          'A localised landing page with a paid test to measure interest.',
          'A pilot with one channel partner before signing.',
        ]),
      ],
    },
    {
      id: 'decision',
      title: 'Thesis and decision',
      color: 'signal',
      brief:
        'The case for and against entering, the key hypotheses with confidence, what must be true, the scoring against the ' +
        'rubric and a recommendation (Go, Go later, Test first, No-go) with the conditions, the entry mode and the budget.',
      owners: ['orb'],
      targets: [
        { type: 'framework', min: 1, note: 'SWOT' },
        { type: 'decision', min: 1 },
        { type: 'hypothesis', min: 3, note: 'with evidence links' },
        { type: 'matrix', min: 1, note: 'the filled scorecard' },
      ],
      seeds: [
        hypothesis('We can comply and launch within the planned time', 'The longest lead-time item fits the launch date and the budget.'),
        hypothesis('We can win a defensible segment against the incumbents', 'A segment where local fit and proof beat the price and relationships of the leaders.'),
        hypothesis('The economics work in the base case', 'Break-even within the planning horizon with the entry cost and local prices.'),
        swot('SWOT: {{country}}'),
        scorecardSeed(MARKET_ENTRY_RUBRIC, '{{country}}'),
        decisionSeed('Recommendation on {{country}}', ['Go', 'Go later', 'Test first', 'No-go']),
      ],
    },
  ],

  // ---- the databases ----
  databases: [
    {
      key: 'sizing',
      name: 'Market sizing inputs',
      frame: 'demand',
      purpose: 'Every assumption behind a TAM, SAM or SOM figure, so the build-up can be checked.',
      keyColumn: 'Assumption',
      columns: [
        { name: 'Assumption', type: 'text' },
        { name: 'Value', type: 'number' },
        { name: 'Unit', type: 'text' },
        { name: 'Method', type: 'enum', options: ['Top-down', 'Bottom-up', 'Analyst report', 'Official statistic'] },
        { name: 'Year', type: 'number' },
        { name: 'Source', type: 'url' },
        { name: 'Confidence', type: 'enum', options: ['Low', 'Medium', 'High'] },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By confidence', kind: 'board', group: 'Confidence' },
        { name: 'By method', kind: 'table', group: 'Method' },
      ],
    },
    {
      key: 'segments',
      name: 'Segments',
      frame: 'customers',
      purpose: 'Customer segments in the country, with size, growth, willingness to pay and how they buy.',
      keyColumn: 'Segment',
      columns: [
        { name: 'Segment', type: 'text' },
        { name: 'Size (firms or people)', type: 'number' },
        { name: 'Growth (% per year)', type: 'number' },
        { name: 'Willingness to pay (USD)', type: 'currency', note: 'Per year per customer.' },
        { name: 'Decision maker', type: 'text' },
        { name: 'Sales cycle (weeks)', type: 'number' },
        { name: 'Local evidence', type: 'enum', options: ['None', 'Home market only', 'Local, indirect', 'Local, direct'] },
        { name: 'Priority', type: 'enum', options: ['Enter first', 'Enter later', 'Skip'] },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Size (firms or people)', dir: 'desc' }] },
        { name: 'By priority', kind: 'board', group: 'Priority' },
        { name: 'Enter first', kind: 'table', filter: [{ column: 'Priority', op: 'eq', value: 'Enter first' }] },
      ],
    },
    {
      key: 'competitors',
      name: 'Competitors in country',
      frame: 'competition',
      purpose: 'Local and global competitors in the country. Discovered with find_entities, enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'URL', type: 'url' },
        { name: 'Origin', type: 'enum', options: ['Local', 'Global, present', 'Regional', 'Substitute'] },
        { name: 'HQ', type: 'text' },
        { name: 'Founded', type: 'number' },
        { name: 'Share or customers', type: 'text' },
        { name: 'Total funding', type: 'currency', note: 'US dollars.' },
        { name: 'Pricing', type: 'text' },
        { name: 'Strengths', type: 'text' },
        { name: 'Weaknesses', type: 'text' },
        { name: 'Threat level', type: 'rating', note: '1 (low) to 5 (high).' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Threat level', dir: 'desc' }] },
        { name: 'By origin', kind: 'board', group: 'Origin' },
        { name: 'High threat', kind: 'table', filter: [{ column: 'Threat level', op: 'gte', value: 4 }] },
      ],
    },
    {
      key: 'regulation',
      name: 'Regulatory requirements',
      frame: 'regulation',
      purpose: 'Everything required to operate and sell in the country, with authority, lead time, cost and status.',
      keyColumn: 'Requirement',
      columns: [
        { name: 'Requirement', type: 'text' },
        {
          name: 'Area',
          type: 'enum',
          options: ['Entity setup', 'Licence', 'Data protection', 'Tax and invoicing', 'Employment', 'IP', 'Customs', 'Consumer', 'Sector rule'],
        },
        { name: 'Authority', type: 'text' },
        { name: 'Lead time (weeks)', type: 'number' },
        { name: 'Cost (USD)', type: 'currency' },
        { name: 'Blocking', type: 'boolean', note: 'Ticked when it stops us selling until done.' },
        { name: 'Status', type: 'enum', options: ['Not started', 'In progress', 'Done', 'Not needed'] },
        { name: 'Source', type: 'url', note: 'An official source.' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Lead time (weeks)', dir: 'desc' }] },
        { name: 'By area', kind: 'board', group: 'Area' },
        { name: 'Blocking', kind: 'table', filter: [{ column: 'Blocking', op: 'eq', value: true }] },
      ],
    },
    {
      key: 'costs',
      name: 'Cost model',
      frame: 'economics',
      purpose: 'Every cost of entering and running in the country, whether it is a quote, a benchmark or an assumption.',
      keyColumn: 'Item',
      columns: [
        { name: 'Item', type: 'text' },
        {
          name: 'Category',
          type: 'enum',
          options: ['Setup', 'Legal and tax', 'People', 'Localisation', 'Marketing and sales', 'Operations', 'Partners'],
        },
        { name: 'Amount (USD)', type: 'currency' },
        { name: 'Frequency', type: 'enum', options: ['One-off', 'Monthly', 'Annual'] },
        { name: 'Months', type: 'number', note: 'How many months it applies in the first 18.' },
        { name: 'Basis', type: 'enum', options: ['Quote', 'Benchmark', 'Assumption'] },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', group: 'Category' },
        { name: 'By basis', kind: 'board', group: 'Basis' },
        { name: 'Assumptions', kind: 'table', filter: [{ column: 'Basis', op: 'eq', value: 'Assumption' }] },
      ],
    },
    {
      key: 'pricing',
      name: 'Pricing benchmarks',
      frame: 'economics',
      purpose: 'What competitors and substitutes charge in the country, so our local price can be set against it.',
      keyColumn: 'Row',
      columns: [
        { name: 'Row', type: 'text', note: 'Vendor and plan.' },
        { name: 'Vendor', type: 'text' },
        { name: 'Plan', type: 'text' },
        { name: 'Local price', type: 'number' },
        { name: 'Currency', type: 'text' },
        { name: 'Price (USD per year)', type: 'currency' },
        { name: 'Unit', type: 'text' },
        { name: 'Date', type: 'date' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'By price', kind: 'table', sort: [{ column: 'Price (USD per year)', dir: 'asc' }] },
        { name: 'By vendor', kind: 'table', group: 'Vendor' },
      ],
    },
    {
      key: 'partners',
      name: 'Channel partners',
      frame: 'channels',
      purpose: 'Distributors, resellers, agencies, platforms and associations that could carry us. Discovered with find_entities.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'URL', type: 'url' },
        {
          name: 'Type',
          type: 'enum',
          options: ['Distributor', 'Reseller', 'Agency', 'Marketplace', 'System integrator', 'Association', 'Investor or advisor'],
        },
        { name: 'City', type: 'text' },
        { name: 'Customers or reach', type: 'text' },
        { name: 'Sells competitors', type: 'boolean' },
        { name: 'Contact', type: 'person' },
        { name: 'Fit', type: 'rating', note: '1 (weak) to 5 (strong).' },
        { name: 'Status', type: 'enum', options: ['Identified', 'Contacted', 'In talks', 'Signed', 'Declined'] },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Fit', dir: 'desc' }] },
        { name: 'By status', kind: 'board', group: 'Status' },
        { name: 'Strong fit', kind: 'table', filter: [{ column: 'Fit', op: 'gte', value: 4 }] },
      ],
    },
    {
      key: 'talent',
      name: 'Talent and operating costs',
      frame: 'operations',
      purpose: 'Roles we would hire and what they cost in the country, plus fixed operating costs and employment rules.',
      keyColumn: 'Item',
      columns: [
        { name: 'Item', type: 'text', note: 'A role (Account executive) or a cost (Office, EOR fee).' },
        { name: 'Kind', type: 'enum', options: ['Role', 'Fixed cost', 'Rule'] },
        { name: 'Salary or cost (USD per year)', type: 'currency' },
        { name: 'Employer on-cost (%)', type: 'number' },
        { name: 'Time to hire (weeks)', type: 'number' },
        { name: 'Notice period (weeks)', type: 'number' },
        { name: 'Note', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By kind', kind: 'board', group: 'Kind' },
      ],
    },
  ],

  // ---- the agent playbook ----
  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first: market research, the financial model, pricing sheets and partner proposals (read_card and ' +
          'read_source for files, query_dataset for tables). Put every figure the user already has into the Market sizing inputs and the ' +
          'Cost model (upsert_rows, Basis or Method set from the document). Hand Scout the competitors, the contacts and the ticked ' +
          'signed-in sources in its delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['economics', 'demand'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first (its eight-step playbook), Builder once Scout has placed its first sources, Critic once Scout ' +
          'has sources to review. Name the frames each agent owns.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'snapshot',
        text:
          "After Scout's first pass, fill the Country snapshot metrics (update_card on the six placeholders) and the one-paragraph " +
          'description, each with a cited figure and its year. Prefer official statistics. Never write a figure you cannot source.',
        tools: ['query_board', 'search_board', 'update_card', 'web_answer'],
        frames: ['snapshot'],
      }),
      step({
        id: 'economics',
        text:
          'Build the entry model from the Cost model and Pricing benchmarks (query_dataset): the cost of entry for 18 months, the local price ' +
          'point against the benchmark, unit economics and the break-even in low, base and high scenarios. Update the three metrics and ' +
          'place the break-even as a Math card; say which inputs are assumptions.',
        tools: ['query_dataset', 'upsert_rows', 'update_card', 'place_card'],
        frames: ['economics'],
      }),
      step({
        id: 'gaps',
        text:
          'For a gap Scout could not close (a market size with no independent source, a licence lead time, a local price), run web_answer, ' +
          'then deep_research (core) on that one question. Ask the user before spend over $0.50.',
        tools: ['web_answer', 'deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'score',
        text:
          'At the end, fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited ' +
          'card in the why line. Then the SWOT, the hypotheses (evidence for and against as card ids) and the Decision card: your proposed ' +
          'option and the weighted total in its rationale. The user decides.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['decision'],
      }),
      step({
        id: 'roadmap',
        text:
          'Write the plan: the roadmap milestones (entity, licences, hires, first partner, first revenue, review) with owners and budget from ' +
          'the Cost model, the First 90 days checklist and the stop conditions. Use only facts already on the board.',
        tools: ['query_board', 'query_dataset', 'update_card', 'place_card', 'add_link'],
        frames: ['plan'],
      }),
      step({
        id: 'questions',
        text: 'Keep the "Open questions" checklist current: collect every unresolved Question card, rank by how much it would change the decision, each linked to its source; keep the validation experiments current.',
        tools: ['search_board', 'update_card', 'add_link'],
        frames: ['questions'],
      }),
      step({
        id: 'memo',
        text: 'Write the memo with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only.',
        tools: ['compose_section'],
      }),
      step({
        id: 'monitor',
        text:
          'Only when the user asks to keep watching the country (a long entry): watch_topic with the country, the sector and the monitor ' +
          'query. Monitors cost money on every check, so each is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'country',
        text:
          'The country basics from official sources first (national statistics office, central bank, World Bank, trade promotion agency): ' +
          'population, GDP, growth, inflation, connectivity, ease of doing business (fetch_url, parallel_extract). Place each as a source ' +
          'card with the year, and a metric card when the figure is a headline number.',
        tools: ['fetch_url', 'parallel_extract', 'web_search', 'place_card'],
        frames: ['snapshot', 'demand'],
      }),
      step({
        id: 'sizing',
        text:
          'Market size: at least one independent report, official counts of the target customers and, bottom-up, the number of target ' +
          'customers times a realistic price. Every TAM, SAM, SOM and CAGR is a metric card with its source; each assumption is a row in ' +
          'Market sizing inputs (upsert_rows, Method set).',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card', 'upsert_rows'],
        frames: ['demand'],
      }),
      step({
        id: 'segments',
        text:
          'Customers: segments by size and growth from official counts, how local buyers buy (associations, trade press, review sites, ' +
          'LinkedIn if connected), and what they pay. One Segments row per segment (upsert_rows, Local evidence set honestly); quote cards ' +
          'from local buyers and analysts; Entity cards for two buyer personas or reference customers.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['customers'],
      }),
      step({
        id: 'competition',
        text:
          'Competition: add the competitors the user named, then find_entities for local and global players selling to the target ' +
          'customers in the country (the match limit follows the depth tier); it fills its own database card in this frame. batch_enrich ' +
          'fills origin, HQ, founded, share, pricing and funding; consolidate into Competitors in country with query_dataset and ' +
          'upsert_rows. One Product card per strong competitor; capture_page screenshots of their local pricing pages.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'capture_page', 'query_dataset', 'upsert_rows', 'place_card'],
        frames: ['competition'],
      }),
      step({
        id: 'regulation',
        text:
          'Regulation, from official sources only (the regulator, the tax authority, the company registry, the data-protection authority): ' +
          'entity setup, licences, data rules, tax and invoicing, employment, IP and consumer rules. One Regulatory requirements row per ' +
          'item with authority, lead time, cost and Blocking; dated steps on the Path-to-launch timeline.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card', 'upsert_rows'],
        frames: ['regulation'],
      }),
      step({
        id: 'costs-pricing',
        text:
          'Costs and prices: local pricing pages and marketplaces for Pricing benchmarks (upsert_rows, price in USD per year), then quotes ' +
          'or benchmarks for entity setup, legal, tax, localisation and marketing for the Cost model; mark each Basis honestly. Convert at ' +
          'a stated rate and date.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card', 'upsert_rows'],
        frames: ['economics'],
      }),
      step({
        id: 'channels',
        text:
          'Channels and talent: find_entities for distributors, resellers, agencies, platforms and associations that reach the target ' +
          'customers (it fills its own database card in this frame), batch_enrich for city, reach and whether they sell competitors; ' +
          'consolidate into Channel partners with query_dataset and upsert_rows and rate Fit. Salary ranges, employer on-costs, time to ' +
          'hire and notice rules for the first hires go into Talent and operating costs (upsert_rows).',
        tools: ['find_entities', 'batch_enrich', 'fetch_signed_in', 'web_search', 'fetch_url', 'query_dataset', 'upsert_rows', 'place_card'],
        frames: ['channels', 'operations'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain (a licence route, a local market size, a channel structure): deep_research (core or above, per the tier), one question per run. Ask before spend over $0.50.',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      step({
        id: 'start',
        text: "Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything.",
        tools: ['board_map', 'search_board', 'read_card', 'query_board'],
      }),
      step({
        id: 'red-flags',
        text:
          'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence ' +
          'and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source cards that clear it. ' +
          'Never leave a flag silent; if nothing was searched, say so and ask Scout for the search.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['risks', 'regulation', 'channels'],
      }),
      step({
        id: 'challenge',
        text:
          'Challenge the demand story: every TAM figure with a single source, sizing done only top-down, and any claim of demand that rests ' +
          'on home-market evidence (Local evidence "Home market only" or "None" in Segments). Link a "tension" to the card that disagrees or ' +
          'place a Question asking for local evidence; test the competition 2x2 against the Competitors in country threat levels.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['demand', 'competition'],
      }),
      step({
        id: 'questions',
        text: 'Turn every gap into a Question card or a checklist item in Open questions and validation, ranked, with a link to the card or gap that prompted it.',
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
        text: 'Charts: the market size build-up and growth bound to Market sizing inputs, segment size bound to Segments, and cost by category bound to the Cost model.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['demand', 'customers', 'economics'],
      }),
      step({
        id: 'competition',
        text: 'The competitor comparison matrix (weighted criteria, scores 0 to 10 from Competitors in country) and the positioning 2x2.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['competition'],
      }),
      step({
        id: 'entry-modes',
        text: 'Score the "Entry modes compared" matrix from the Cost model, Regulatory requirements and Channel partners (0 to 10 per criterion, with the evidence in the note) and place pros and cons for the leading mode.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['channels'],
      }),
      step({
        id: 'operations',
        text: 'The localisation checklist: add the items the Regulatory requirements and the competitor pages show are needed (language, payments, tax invoices, data hosting), each citing its source card.',
        tools: ['place_card', 'query_dataset', 'read_card', 'query_board'],
        frames: ['operations'],
      }),
      step({
        id: 'roadmap',
        text: 'The roadmap timeline from the regulation lead times and the Cost model, and the go-to-market pros and cons; each milestone cites the card it depends on.',
        tools: ['place_card', 'query_board', 'read_card'],
        frames: ['plan'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual summary (a design frame): the country, the score, the entry mode, the cost and the top risks, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...MARKET_ENTRY_RUBRIC],
  redFlags: [...MARKET_ENTRY_RED_FLAGS],

  // ---- the output ----
  output: {
    memoTitle: 'Market entry memo: {{country}}',
    citationRule:
      'Every paragraph cites cards; every figure cites its source and its year; official statistics are marked as such; every cost says whether it is a quote, a benchmark or an assumption.',
    sections: [
      {
        id: 'summary',
        title: 'Summary and recommendation',
        frames: ['decision', 'risks'],
        words: 150,
        guidance: 'The recommendation, the entry mode, the score, the top 3 reasons, the top 3 risks and the budget, in at most 150 words.',
      },
      {
        id: 'snapshot',
        title: 'The country at a glance',
        frames: ['snapshot'],
        guidance: 'A table of the country metrics and a paragraph on what matters for the offer.',
      },
      {
        id: 'demand',
        title: 'Market size and demand',
        frames: ['demand'],
        guidance: 'TAM, SAM and SOM with the method, growth and why now, with the market chart.',
      },
      {
        id: 'customers',
        title: 'Customers and segments',
        frames: ['customers'],
        guidance: 'The segments, which to enter first and the local evidence for each.',
      },
      {
        id: 'competition',
        title: 'Competition',
        frames: ['competition'],
        guidance: 'Local and global competitors, the comparison and where we win and lose.',
      },
      {
        id: 'regulation',
        title: 'Regulation and compliance',
        frames: ['regulation'],
        guidance: 'What is required to operate, with lead times and costs, and the path to a legal launch.',
      },
      {
        id: 'economics',
        title: 'Economics and pricing',
        frames: ['economics'],
        guidance: 'The local price, the cost of entry, the scenarios and the break-even, with the chart.',
      },
      {
        id: 'channels',
        title: 'Channels and entry mode',
        frames: ['channels'],
        guidance: 'The entry modes compared, the recommended one and the partners to approach first.',
      },
      {
        id: 'operations',
        title: 'Localisation, talent and operations',
        frames: ['operations'],
        guidance: 'What changes to run the business there and what the first hires cost.',
      },
      {
        id: 'risks',
        title: 'Risks and mitigants',
        frames: ['risks'],
        guidance: 'The red-flag outcomes: each raised flag with its mitigant, the cleared ones in one line.',
      },
      {
        id: 'plan',
        title: 'Roadmap and first 90 days',
        frames: ['plan'],
        guidance: 'The milestones for 90, 180 and 365 days with owners, the metrics and the stop conditions.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard',
        frames: ['decision'],
        guidance: 'The rubric table: each dimension, its weight, its score and its evidence.',
      },
      {
        id: 'next',
        title: 'Open questions and validation',
        frames: ['questions'],
        guidance: 'The ranked open questions and the experiments that would answer them.',
      },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{country}}',
      includes: ['Country snapshot', 'Market size', 'Entry mode', 'Score', 'Recommendation', 'Cost', 'Top risks'],
    },
    deckFormat: 'market-entry',
  },

  tiers: tiersFor({ subject: 'market entry', standardRuns: 3, deepRuns: 10 }),

  followUps: [
    {
      label: 'Compare with [other country]',
      prompt: 'Compare {{country}} with [other country] as an entry market: demand, competition, regulation, cost and score, side by side with a table.',
    },
    {
      label: 'Deep dive on the first segment',
      prompt: 'Go deeper on the first segment to enter in {{country}}: who buys, how, what they pay, three named target accounts and the message to lead with.',
    },
    {
      label: 'Shortlist partners',
      prompt: 'Shortlist the five best channel partners in {{country}} from the Channel partners database, with why each fits and the approach for each.',
    },
    {
      label: 'Stress-test the economics',
      prompt: 'Stress-test the entry economics for {{country}}: double the acquisition cost and delay launch by six months, and show the effect on the break-even.',
    },
    {
      label: 'Compliance checklist',
      prompt: 'Turn the Regulatory requirements for {{country}} into a launch checklist ordered by lead time, with an owner for each item.',
    },
    {
      label: 'Write the 90-day plan',
      prompt: 'Write the detailed 90-day plan to enter {{country}}: week by week, owners, budget and the decisions we need from leadership.',
    },
  ],

  signedIn: [
    {
      domain: 'linkedin.com',
      label: 'LinkedIn',
      use: 'Local buyers, competitors’ headcount and hiring, and the people at candidate channel partners.',
    },
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Funding and ownership of local and regional competitors.' },
    { domain: 'similarweb.com', label: 'Similarweb', use: 'Web traffic of competitors in the country, by channel.' },
    { domain: 'g2.com', label: 'G2', use: 'What local customers say about the competitors, by country where shown.' },
  ],

  monitor: {
    query: '{{country}} regulation, tax, data-protection and trade changes affecting software and foreign companies, and news about our competitors there',
    why: 'A rule or competitor move that changes the entry plan.',
  },
};
