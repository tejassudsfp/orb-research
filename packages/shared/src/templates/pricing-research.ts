/**
 * Pricing research (P6.13, startup / product). Human-readable spec: docs/templates/pricing-research.md (generated:
 * `pnpm templates:docs`).
 *
 * Parallel use: find_entities and batch_enrich for the benchmark list, deep_research for willingness-to-pay studies and
 * analyst data, a monitor (Orb, on request) on competitor pricing pages. Signed-in: G2 (pricing and reviews),
 * Crunchbase, SimilarWeb.
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
} from './kit.js';

export const PR_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'value',
    name: 'Value alignment',
    weight: 25,
    anchors: {
      1: 'Price is cost-plus and unrelated to the value delivered.',
      3: 'The metric loosely follows value.',
      5: 'The value metric is what customers say they get, and price scales with it.',
    },
    frame: 'value',
  },
  {
    id: 'market',
    name: 'Market position',
    weight: 20,
    anchors: {
      1: 'Far above or below every comparable with no reason.',
      3: 'Within the benchmark range.',
      5: 'Deliberately placed, with a reason customers accept.',
    },
    frame: 'benchmarks',
  },
  {
    id: 'wtp',
    name: 'Willingness-to-pay evidence',
    weight: 25,
    anchors: {
      1: 'Opinions only.',
      3: 'Stated willingness from interviews or a survey.',
      5: 'Revealed behaviour: purchases, pilots or a price test.',
    },
    frame: 'wtp',
  },
  {
    id: 'margin',
    name: 'Margin health',
    weight: 20,
    anchors: {
      1: 'Negative or unknown gross margin.',
      3: 'Positive margin that depends on assumptions.',
      5: 'Healthy margin on measured costs, with a safety buffer.',
    },
    frame: 'economics',
  },
  {
    id: 'simple',
    name: 'Simplicity',
    weight: 10,
    anchors: {
      1: 'Buyers cannot predict their bill.',
      3: 'Understandable with a calculator.',
      5: 'A buyer can explain it in one sentence.',
    },
    frame: 'packaging',
  },
];

export const PR_RED_FLAGS = redFlags([
  [
    'The price is anchored to cost, not to value.',
    'Check the Unit economics and Value frames: is there any customer value figure behind the price, or only cost plus margin?',
  ],
  [
    'Competitor prices are list prices, not what customers pay.',
    'Look for discount, negotiation and bundle evidence in reviews and sources; list-only rows are marked.',
  ],
  [
    'Willingness to pay rests on stated intent only.',
    'Check the WTP evidence database for rows with Signal Purchase or Pilot; none is raised.',
  ],
  [
    'Gross margin is below the usual range for the model (SaaS below 70%).',
    'Read the Unit economics database; compare gross margin at the proposed price with the benchmark in the sources.',
  ],
  [
    'The value metric does not follow the cost driver.',
    'Compare what customers value (seats, outcomes) with what costs us (compute, support, usage); raise a mismatch.',
  ],
  [
    'Too many tiers or uneven jumps between tiers.',
    'Read Tier design: more than four tiers, or price jumps that differ by more than 3x, are raised.',
  ],
  [
    'A free tier or discount cannibalises paid plans.',
    'Check the limits of the free tier against the usage of paying customers in the evidence.',
  ],
  [
    'A price increase has no churn evidence for existing customers.',
    'If the goal is to raise prices, look for churn or downgrade data; if none was provided, raise and ask.',
  ],
  [
    'Benchmark data is older than six months.',
    'Check the Captured on dates in Price points; stale rows are marked and a Question asks for a refresh.',
  ],
  [
    'One segment\'s willingness to pay is generalised to all segments.',
    'Group WTP evidence by segment; raise a price that rests on one segment only.',
  ],
  [
    'Hidden costs are missing from the economics (support, infrastructure, payment fees).',
    'Compare the Unit economics rows with the cost lines in the sources and the materials.',
  ],
]);

export const PRICING_RESEARCH: TemplateSpecInput = {
  id: 'pricing-research',
  label: 'Pricing research',
  dot: '#2563EB',
  placeholder: 'Which product are you pricing?',
  brief:
    'Work out how to price the product: benchmark what the market charges, compare pricing models and value ' +
    'metrics, gather willingness-to-pay evidence, compute the customer value and the unit economics, design the ' +
    'tiers, model scenarios, check the risks, and recommend a price and packaging with experiments to confirm it. ' +
    'Date every price, separate list prices from what customers really pay, and mark assumptions as assumptions.',
  titleFrom: '{{product}}: pricing research',

  inputs: [
    {
      id: 'product',
      label: 'Product',
      kind: 'text',
      required: true,
      placeholder: 'Acme Analytics',
      maxLength: 70,
    },
    { id: 'website', label: 'Website URL', kind: 'url', placeholder: 'https://acme.com', maxLength: 300 },
    {
      id: 'model',
      label: 'Business model',
      kind: 'select',
      options: ['SaaS subscription', 'Usage-based', 'Marketplace or transaction', 'Hardware', 'Services', 'Consumer freemium', 'Not sure'],
      maxLength: 40,
    },
    {
      id: 'goal',
      label: 'What you want to decide',
      kind: 'select',
      options: ['Set the first price', 'Raise prices', 'Repackage the tiers', 'Add a free tier', 'Price for enterprise', 'Respond to a competitor'],
      maxLength: 40,
    },
    {
      id: 'current',
      label: 'Current pricing',
      kind: 'longtext',
      placeholder: 'Pro $29 per seat per month, Team $79 ...',
      help: 'Leave empty if there is no price yet.',
      maxLength: 800,
    },
    {
      id: 'customer',
      label: 'Who buys, and who pays',
      kind: 'longtext',
      placeholder: 'Heads of growth at B2B SaaS; the CFO signs off above $10k',
      maxLength: 600,
    },
    {
      id: 'cost',
      label: 'Cost to serve and margin target',
      kind: 'longtext',
      placeholder: 'About $4 per account per month in compute; 80% gross margin',
      maxLength: 600,
    },
    {
      id: 'competitors',
      label: 'Known competitors',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout finds more.',
      maxLength: 800,
    },
    materialsField(
      'Drop pricing sheets, a willingness-to-pay or Van Westendorp survey (CSV or XLSX), usage or churn data, cost data and win/loss notes. Each becomes a card or database.',
    ),
    depthField,
    sitesField([
      { domain: 'g2.com', label: 'G2' },
      { domain: 'crunchbase.com', label: 'Crunchbase' },
      { domain: 'similarweb.com', label: 'SimilarWeb' },
    ]),
  ],

  frames: [
    {
      id: 'question',
      title: 'Pricing question',
      color: 'signal',
      brief:
        'The decision for {{product}}: {{goal|to confirm}}. The current pricing is {{current|not set yet}}. Who pays: ' +
        '{{customer|to confirm}}. Cost and margin: {{cost|not given}}. State the question, the constraints and what a ' +
        'good answer looks like.',
      owners: ['orb'],
      targets: [
        { type: 'metric', min: 4 },
        { type: 'doc', min: 1, note: 'the pricing brief' },
        { type: 'hypothesis', min: 2 },
      ],
      seeds: [
        {
          type: 'doc',
          data: {
            title: 'Pricing brief',
            body: 'Started {{date}}. Product: {{product}}. Model: {{model|to confirm}}. Goal: {{goal|to confirm}}. Current pricing: {{current|none}}. Who pays: {{customer|to confirm}}.',
          },
          why: 'The brief, from your intake.',
        },
        metric('Current price', 'The entry price today, with the unit and the date.'),
        metric('Median competitor price', 'Median entry price in the Price points database, with the date.'),
        metric('Target gross margin', 'From the intake or the benchmark; say which.'),
        metric('Proposed price', 'orb fills this after the rubric, with the unit.'),
        hypothesis(
          'Customers will pay more for {{product}} than we charge today',
          'Test against willingness-to-pay evidence and the value delivered.',
        ),
        hypothesis('Our pricing metric matches the value customers see', 'Test against what customers say they get.'),
        question('What would make the price feel obviously fair to the buyer?', 'Say the buyer, the budget owner and the comparison they will make.'),
      ],
      room: 240,
    },
    {
      id: 'benchmarks',
      title: 'Market price benchmarks',
      color: 'sky',
      brief:
        'What comparable products charge: every plan of every comparable competitor in the Price points database ' +
        'with the unit, billing, limits and capture date, from the pricing page, and any evidence of real discounts ' +
        'or bundles. Include the substitutes (in-house, agencies) where they have a price.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Price points, at least 20 rows' },
        { type: 'image', min: 4, note: 'pricing page screenshots' },
        { type: 'chart', min: 1, note: 'entry price by competitor' },
      ],
      seeds: [
        db('Price points', 'prices'),
        chart('Entry price by competitor', 'prices', 'bar', 'Competitor', 'Price (USD per month)'),
      ],
    },
    {
      id: 'models',
      title: 'Pricing models & metrics',
      color: 'rho',
      brief:
        'Which pricing models fit: flat, per seat, usage-based, tiered, hybrid, outcome-based. What the value metric ' +
        'is (the unit customers recognise and that grows with their value), how competitors charge, and the trade-offs of each model ' +
        'against our cost drivers.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'matrix', min: 1, note: 'models on weighted criteria' },
        { type: 'framework', min: 1, note: 'pros and cons of the front-runner' },
        { type: 'source', min: 3 },
      ],
      seeds: [
        matrix(
          'Pricing model comparison',
          [
            { name: 'Tracks the value customers get', weight: 30 },
            { name: 'Simple to explain', weight: 20 },
            { name: 'Predictable bill', weight: 15 },
            { name: 'Grows with the customer', weight: 20 },
            { name: 'Fits our cost drivers', weight: 15 },
          ],
          ['Per seat', 'Usage-based', 'Tiered flat fee', 'Hybrid'],
          'Placeholder: scored from the benchmarks, the cost data and the customer evidence.',
        ),
        framework('Front-runner model: pros and cons', 'proscons'),
        question('What is the unit of value customers recognise?', 'Seats, projects, events, outcomes: use their words.'),
      ],
    },
    {
      id: 'wtp',
      title: 'Willingness to pay',
      color: 'sky',
      brief:
        'What customers will pay: survey results (Van Westendorp or Gabor-Granger), interview quotes about price, ' +
        'budgets, purchases, pilots and review comments on price, by segment. Separate stated intent from revealed behaviour. A dropped survey ' +
        'becomes a database; read it with query_dataset and compute the acceptable range.',
      owners: ['scout', 'orb', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'WTP evidence' },
        { type: 'quote', min: 6, note: 'price talk, quoted' },
        { type: 'chart', min: 1, note: 'price sensitivity or acceptance curve' },
      ],
      seeds: [
        db('WTP evidence', 'wtp'),
        {
          type: 'math',
          data: {
            title: 'Van Westendorp: the acceptable price range',
            latex: 'P_{\\min} = \\text{too cheap} \\cap \\text{not cheap},\\quad P_{\\max} = \\text{too expensive} \\cap \\text{not expensive}',
            body: 'The range between the point of marginal cheapness and the point of marginal expensiveness; use it only with a survey of at least 30 relevant respondents.',
          },
          why: 'The method, so the survey analysis can be checked.',
        },
      ],
    },
    {
      id: 'value',
      title: 'Value & ROI',
      color: 'rho',
      brief:
        'The value the customer gets in money terms: hours saved, revenue gained, cost avoided, risk reduced, from ' +
        'case studies, reviews and interviews. A price should be a fraction of the value; show the calculation with its inputs and sources.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'metric', min: 3, note: 'annual value, payback, ROI' },
        { type: 'math', min: 1, note: 'the ROI calculation' },
        { type: 'source', min: 3, note: 'case studies or studies of the value' },
      ],
      seeds: [
        metric('Annual value per customer', 'Money value of the outcome per year, with the inputs and the source.'),
        metric('Payback period', 'Price divided by monthly value, in months.'),
        metric('ROI at the proposed price', 'Value minus price, divided by price.'),
        {
          type: 'math',
          data: {
            title: 'Customer ROI',
            latex: '\\text{ROI} = \\frac{V - P}{P},\\quad \\text{payback (months)} = \\frac{P}{V/12}',
            body: 'V is the annual value per customer, P the annual price. Each input is a card on this board.',
          },
          why: 'The calculation, with inputs cited from cards.',
        },
      ],
    },
    {
      id: 'economics',
      title: 'Unit economics',
      color: 'sky',
      brief:
        'What it costs us to serve one customer and what is left: COGS (compute, support, payment fees), gross margin at ' +
        'each candidate price, CAC and payback where known, and the break-even price. Mark every figure Assumed or Measured.',
      owners: ['orb', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Unit economics' },
        { type: 'metric', min: 3, note: 'gross margin, break-even price, CAC payback' },
      ],
      seeds: [
        db('Unit economics', 'economics'),
        metric('Gross margin at the proposed price', 'Computed from the Unit economics rows.'),
        metric('Break-even price', 'The price at which gross margin reaches zero.'),
        metric('CAC payback', 'Months to recover CAC at the proposed price, if CAC is known.'),
      ],
    },
    {
      id: 'packaging',
      title: 'Packaging & tiers',
      color: 'rho',
      brief:
        'How to package the product: the tiers, who each is for, what is included, the limits and the trigger that ' +
        'moves a customer to the next tier. Keep to three or four tiers, name each for its customer, and justify the ' +
        'price steps.',
      owners: ['builder', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Tier design' },
        { type: 'design', min: 1, note: 'a pricing page mock-up' },
      ],
      seeds: [db('Tier design', 'tiers')],
    },
    {
      id: 'scenarios',
      title: 'Scenarios & sensitivity',
      color: 'sky',
      brief:
        'What happens to revenue and margin at each candidate price: customers, conversion and churn assumptions per ' +
        'scenario, with the formula stated, and a chart. Always show the assumption each scenario rests on and mark it.',
      owners: ['builder'],
      targets: [
        { type: 'database', min: 1, note: 'Revenue scenarios' },
        { type: 'chart', min: 1, note: 'MRR by scenario' },
      ],
      seeds: [
        db('Revenue scenarios', 'scenarios'),
        chart('Monthly revenue by scenario', 'scenarios', 'bar', 'Scenario', 'MRR'),
      ],
    },
    {
      id: 'risks',
      title: 'Risks & red flags',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence or clear it with a ' +
        'source. Cover churn on a price rise, competitor response, discount leakage and legal or tax limits.',
      owners: ['critic'],
      targets: [{ type: 'risk', min: 5, note: 'every checklist item cleared with a source or raised' }],
      seeds: [
        checklist(
          'Red-flag checklist',
          PR_RED_FLAGS.map((f) => `${f.id} ${f.text}`),
          'Critic raises or clears each; you tick them off.',
        ),
        emptyRisk('Churn'),
        emptyRisk('Competitor response'),
        emptyRisk('Discount leakage'),
        emptyRisk('Margin'),
      ],
    },
    {
      id: 'recommendation',
      title: 'Recommendation & experiments',
      color: 'signal',
      brief:
        'The recommended price and packaging, the reasons, what would change it, and the experiments that would ' +
        'confirm it (price test, survey, fake door, pilot) with what result counts as a pass. Score against the rubric with cited evidence.',
      owners: ['orb', 'critic'],
      targets: [
        { type: 'decision', min: 1 },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
        { type: 'checklist', min: 1, note: 'pricing experiments' },
        { type: 'insight', min: 3 },
      ],
      seeds: [
        {
          type: 'decision',
          data: {
            title: 'How should {{product}} be priced?',
            body: 'Open. orb proposes after the rubric is filled and writes the weighted total in the rationale.',
            options: [
              { label: 'Raise the price' },
              { label: 'Hold the price and repackage' },
              { label: 'Add a usage component' },
              { label: 'Run a price test first' },
            ],
            status: 'open',
          },
          why: 'Open decision: you choose; orb proposes.',
        },
        matrix(
          'Pricing strategy (rubric score x 2, so 10 is a 5)',
          PR_RUBRIC.map((d) => ({ name: `${d.name} (${d.weight}%)`, weight: d.weight })),
          ['orb score', 'Your score'],
          'orb fills one score per dimension with cited evidence; you may override.',
        ),
        checklist('Pricing experiments', [
          'Van Westendorp survey with at least 30 target buyers.',
          'A/B test of the entry price on new sign-ups.',
          'Fake-door test of the new tier on the pricing page.',
          'Ask five existing customers about a 15% increase.',
        ]),
      ],
    },
  ],

  databases: [
    {
      key: 'prices',
      name: 'Price points',
      frame: 'benchmarks',
      purpose: 'Every plan of every comparable product, dated. Discovered with find_entities and enriched with batch_enrich.',
      keyColumn: 'Plan',
      columns: [
        { name: 'Competitor', type: 'text' },
        { name: 'Plan', type: 'text' },
        { name: 'Price (USD per month)', type: 'currency', note: 'Per unit; annual price divided by 12.' },
        { name: 'Unit', type: 'text', note: 'Seat, usage, flat, workspace.' },
        { name: 'Billing', type: 'enum', options: ['Monthly', 'Annual', 'Usage', 'Custom'] },
        { name: 'Free tier', type: 'boolean' },
        { name: 'Limits', type: 'text' },
        { name: 'Includes', type: 'text' },
        { name: 'Real discount seen', type: 'text', note: 'From reviews or sales posts; blank if none.' },
        { name: 'Captured on', type: 'date' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Price (USD per month)', dir: 'asc' }] },
        { name: 'By competitor', kind: 'table', group: 'Competitor' },
        { name: 'By billing', kind: 'board', group: 'Billing' },
      ],
    },
    {
      key: 'wtp',
      name: 'WTP evidence',
      frame: 'wtp',
      purpose: 'Every piece of evidence about what customers will pay, with how strong it is.',
      keyColumn: 'Evidence',
      columns: [
        { name: 'Evidence', type: 'text', note: 'A line describing it.' },
        { name: 'Segment', type: 'text' },
        { name: 'Signal', type: 'enum', options: ['Purchase', 'Pilot', 'Budget stated', 'Survey', 'Interview', 'Review comment'] },
        { name: 'Price point', type: 'currency', note: 'US dollars per month, if stated.' },
        { name: 'Reaction', type: 'enum', options: ['Too cheap', 'Fair', 'Expensive', 'Too expensive', 'Unknown'] },
        { name: 'Strength', type: 'rating', note: '1 (hearsay) to 5 (money changed hands).' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Strength', dir: 'desc' }] },
        { name: 'By signal', kind: 'board', group: 'Signal' },
        { name: 'Revealed behaviour', kind: 'table', filter: [{ column: 'Strength', op: 'gte', value: 4 }] },
      ],
    },
    {
      key: 'economics',
      name: 'Unit economics',
      frame: 'economics',
      purpose: 'Cost and margin lines, each marked Assumed or Measured.',
      keyColumn: 'Line',
      columns: [
        { name: 'Line', type: 'text', note: 'Compute, support, payment fees, CAC, gross margin ...' },
        { name: 'Value', type: 'number' },
        { name: 'Unit', type: 'text', note: 'USD per customer per month, percent, months.' },
        { name: 'Basis', type: 'enum', options: ['Assumed', 'Measured', 'Benchmark'] },
        { name: 'Source', type: 'url' },
        { name: 'Note', type: 'text' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'Assumed vs measured', kind: 'board', group: 'Basis' },
      ],
    },
    {
      key: 'tiers',
      name: 'Tier design',
      frame: 'packaging',
      purpose: 'The proposed and chosen tiers.',
      keyColumn: 'Tier',
      columns: [
        { name: 'Tier', type: 'text' },
        { name: 'For', type: 'text', note: 'The customer it is named for.' },
        { name: 'Price (USD per month)', type: 'currency' },
        { name: 'Unit', type: 'text' },
        { name: 'Includes', type: 'text' },
        { name: 'Limits', type: 'text' },
        { name: 'Upgrade trigger', type: 'text' },
        { name: 'Status', type: 'enum', options: ['Proposed', 'Chosen', 'Rejected'] },
      ],
      views: [
        { name: 'By price', kind: 'table', sort: [{ column: 'Price (USD per month)', dir: 'asc' }] },
        { name: 'By status', kind: 'board', group: 'Status' },
      ],
    },
    {
      key: 'scenarios',
      name: 'Revenue scenarios',
      frame: 'scenarios',
      purpose: 'Revenue and margin per candidate price, with the assumptions behind each row.',
      keyColumn: 'Scenario',
      columns: [
        { name: 'Scenario', type: 'text' },
        { name: 'Price (USD per month)', type: 'currency' },
        { name: 'Customers', type: 'number' },
        { name: 'Conversion', type: 'number', note: 'Percent of trials.' },
        { name: 'Monthly churn', type: 'number', note: 'Percent.' },
        { name: 'MRR', type: 'currency', note: 'Price times customers.' },
        { name: 'Gross margin', type: 'number', note: 'Percent.' },
        { name: 'Assumption', type: 'text', note: 'What the row rests on.' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'MRR', dir: 'desc' }] },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text: 'Read what the user dropped first: pricing sheets, a survey, usage and cost data (read_card, read_source, query_dataset). Put every cost line into Unit economics (upsert_rows) with Basis "Measured" when the file measures it, otherwise "Assumed"; put survey results and quoted price talk into WTP evidence. Hand the competitors and the goal to Scout in the delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['economics', 'wtp'],
      }),
      orbDelegate(
        'Scout first (benchmarks and evidence), Builder once Price points has rows, Critic once Scout has sources to review.',
      ),
      step({
        id: 'economics',
        text: 'Compute the gross margin at each candidate price, the break-even price and the CAC payback from Unit economics and Price points (query_dataset); update the metric seeds with the unit and the basis. Never write a figure you cannot trace to a row.',
        tools: ['query_dataset', 'upsert_rows', 'update_card', 'query_board'],
        frames: ['economics', 'question'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (no public price for a key competitor, no willingness-to-pay study), run deep_research (core) on that one question.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'rubric',
        text: 'Fill the Pricing strategy matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card. Then the hypotheses (evidence for and against as card ids), the Proposed price metric and the Decision: your proposed option and the weighted total in its rationale.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['recommendation', 'question'],
      }),
      step({
        id: 'experiments',
        text: 'Keep the pricing experiments current: what to test, the sample, the pass threshold, linked to the risk or gap that prompted each. The user ticks them off.',
        tools: ['search_board', 'update_card', 'add_link'],
        frames: ['recommendation'],
      }),
      orbMemo,
      orbMonitor,
    ],
    scout: [
      step({
        id: 'own',
        text: 'Our own pricing page and the current-pricing intake first (fetch_url, capture_page): rows in Price points (upsert_rows, Competitor set to our product) so the benchmark includes us.',
        tools: ['fetch_url', 'capture_page', 'place_card', 'upsert_rows'],
        frames: ['benchmarks'],
      }),
      step({
        id: 'benchmarks',
        text: 'Benchmarks: the competitors the user named, then find_entities for the rest of the comparable set; batch_enrich fills plans and prices. Read each pricing page (fetch_url, parallel_extract), screenshot it (capture_page) and write one Price points row per plan (upsert_rows, key Plan) with the capture date. Enterprise-only is Billing "Custom", never a guess. Quick scan: find_entities and batch_enrich are refused; read the pages directly.',
        tools: ['find_entities', 'batch_enrich', 'fetch_url', 'parallel_extract', 'capture_page', 'upsert_rows', 'query_dataset'],
        frames: ['benchmarks'],
      }),
      step({
        id: 'real-prices',
        text: 'Real prices: what customers actually pay: discounts, bundles and negotiation in reviews, forums and sales posts (web_search, fetch_url; G2 only via fetch_signed_in if ticked). Fill Real discount seen; place Quote cards of price talk.',
        tools: ['web_search', 'fetch_url', 'fetch_signed_in', 'place_card', 'upsert_rows'],
        frames: ['benchmarks', 'wtp'],
      }),
      step({
        id: 'models',
        text: 'Pricing models: how each competitor charges and why (blog posts, interviews, analyst notes); the value metric of the category; a Source card for each useful piece. Fill the evidence the model comparison needs.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card'],
        frames: ['models'],
      }),
      step({
        id: 'wtp',
        text: 'Willingness-to-pay evidence beyond what the user dropped: public surveys, willingness studies, budget benchmarks, review comments on price. One WTP evidence row each (upsert_rows, key Evidence) with Signal and Strength; stated intent is never above 3.',
        tools: ['web_search', 'fetch_url', 'web_answer', 'place_card', 'upsert_rows'],
        frames: ['wtp'],
      }),
      step({
        id: 'value',
        text: 'Value: case studies and studies that put money on the outcome (hours saved, revenue gained, cost avoided). Metric cards for annual value and payback, each citing a source.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card'],
        frames: ['value'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain: deep_research (core or above, per the tier), for example a pricing study of the category.',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      criticStart,
      criticFlags(['risks', 'wtp', 'economics']),
      step({
        id: 'single-source',
        text: 'Challenge every benchmark price with one source or an old date, and every willingness-to-pay claim built on stated intent: link it "tension" to the card that disagrees, or place a Question asking for the second source.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['benchmarks', 'wtp'],
      }),
      step({
        id: 'experiments',
        text: 'Design the experiments: for each raised risk, a Checklist or Question card that names the test, the sample and the pass threshold (you cannot tick).',
        tools: ['place_card', 'add_link', 'query_board'],
        frames: ['recommendation'],
      }),
      criticReport,
    ],
    builder: [
      step({
        id: 'charts',
        text: 'Charts bound to the databases: entry price by competitor (bar, Price points), MRR by scenario (bar, Revenue scenarios). If a survey database exists, a price-sensitivity chart (line) from its cumulative shares.',
        tools: ['place_card', 'query_dataset'],
        frames: ['benchmarks', 'scenarios', 'wtp'],
      }),
      step({
        id: 'models',
        text: 'The pricing model comparison (matrix, scores 0 to 10, the note naming the evidence) and pros and cons of the front-runner (framework).',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['models'],
      }),
      step({
        id: 'roi',
        text: 'The ROI calculation (math card) and the economics: use only values from cards and rows; show inputs and formula; mark assumptions.',
        tools: ['place_card', 'query_dataset', 'upsert_rows', 'read_card'],
        frames: ['value', 'economics'],
      }),
      step({
        id: 'tiers',
        text: 'Tier design: three or four tiers in Tier design (upsert_rows, key Tier) with who each is for, includes, limits and the upgrade trigger; a pricing page mock-up as a design frame (write_design_frame).',
        tools: ['upsert_rows', 'write_design_frame', 'place_card', 'query_dataset'],
        frames: ['packaging'],
        minTier: 'standard',
      }),
      step({
        id: 'scenarios',
        text: 'Scenarios: one Revenue scenarios row per candidate price (upsert_rows, key Scenario) with customers, conversion, churn, MRR and gross margin computed from the stated assumptions; the Assumption column says what each rests on.',
        tools: ['upsert_rows', 'query_dataset', 'place_card'],
        frames: ['scenarios'],
      }),
    ],
  },

  rubric: [...PR_RUBRIC],
  redFlags: [...PR_RED_FLAGS],

  output: {
    memoTitle: 'Pricing recommendation: {{product}}',
    citationRule:
      'Every paragraph cites cards; every price states its unit and date; stated willingness is marked apart from revealed behaviour; assumptions are marked as assumptions.',
    sections: [
      {
        id: 'summary',
        title: 'Summary & recommendation',
        frames: ['recommendation', 'risks'],
        words: 150,
        guidance: 'The recommended price and packaging, the three reasons and the three risks, in at most 150 words.',
      },
      {
        id: 'question',
        title: 'The pricing question',
        frames: ['question'],
        guidance: 'The decision, the constraints and what good looks like.',
      },
      {
        id: 'benchmarks',
        title: 'What the market charges',
        frames: ['benchmarks'],
        guidance: 'The price points table with dates and the entry price chart.',
      },
      {
        id: 'models',
        title: 'Pricing models and the value metric',
        frames: ['models'],
        guidance: 'The model comparison and the chosen value metric.',
      },
      {
        id: 'wtp',
        title: 'Willingness to pay',
        frames: ['wtp'],
        guidance: 'Evidence by strength and by segment; the acceptable price range.',
      },
      {
        id: 'value',
        title: 'Customer value and ROI',
        frames: ['value'],
        guidance: 'The value in money, the payback and the ROI at the proposed price.',
      },
      {
        id: 'economics',
        title: 'Unit economics',
        frames: ['economics'],
        guidance: 'Costs, gross margin at each price, break-even, with assumed and measured marked.',
      },
      {
        id: 'packaging',
        title: 'Packaging and tiers',
        frames: ['packaging'],
        guidance: 'The tiers, who each is for and what moves a customer up.',
      },
      {
        id: 'scenarios',
        title: 'Scenarios',
        frames: ['scenarios'],
        guidance: 'Revenue and margin per candidate price, with the assumptions.',
      },
      {
        id: 'risks',
        title: 'Risks and mitigants',
        frames: ['risks'],
        guidance: 'The red-flag outcomes: each raised flag with its mitigant.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard and experiments',
        frames: ['recommendation'],
        guidance: 'The rubric table and the experiments that would confirm the price.',
      },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{product}} pricing',
      includes: ['Recommended price', 'Benchmarks', 'Margin', 'Experiments'],
    },
    deckFormat: 'standard',
    deck: {
      title: 'Pricing review: {{product}}',
      slides: [
        { title: 'The recommendation', brief: 'The price, the packaging and the three reasons.' },
        { title: 'What the market charges', brief: 'The entry price chart and the price points table.' },
        { title: 'How competitors charge', brief: 'The pricing model comparison matrix.' },
        { title: 'What customers will pay', brief: 'Willingness-to-pay evidence by strength and segment.' },
        { title: 'The value we deliver', brief: 'Annual value, payback and ROI.' },
        { title: 'Unit economics', brief: 'Cost lines and gross margin at each price.' },
        { title: 'Tiers', brief: 'The tier table and the upgrade triggers.' },
        { title: 'Scenarios', brief: 'The revenue by scenario chart with assumptions.' },
        { title: 'Risks', brief: 'Raised red flags with mitigants.' },
        { title: 'Experiments and next steps', brief: 'The tests to run and the pass thresholds.' },
      ],
    },
  },

  tiers: tiers({
    quick:
      'No deep research: read pricing pages and public evidence, at most 12 cards per frame, a handful of competitors and the memo is the summary only.',
    standard:
      'Quick, plus find_entities and batch_enrich for the comparable set, tier design and scenarios, and one or two deep-research runs (core), asking before spend.',
    deep: 'Standard, plus pro or ultra research on willingness to pay and category pricing, the full competitor set and the full memo and deck.',
  }),

  followUps: [
    {
      label: 'Refresh the benchmarks',
      prompt: 'Recheck every price in Price points today and tell me what changed since it was captured.',
    },
    {
      label: 'Model a price rise',
      prompt: 'Model a [15]% price rise for {{product}}: revenue, margin and the churn level at which it stops paying off.',
    },
    {
      label: 'Design the pricing page',
      prompt: 'Design the pricing page for the chosen tiers as a design frame, using only facts on the board.',
    },
    {
      label: 'Write the experiment plan',
      prompt: 'Write the plan for the price test: variants, sample size, duration, metric and what result counts as a pass.',
    },
    {
      label: 'Watch competitor pricing',
      prompt: 'Start a monitor on the competitors\' pricing pages and announcements.',
    },
    {
      label: 'Argue for the lower price',
      prompt: 'Build the strongest case for pricing {{product}} lower than recommended, from the cards on this board.',
    },
  ],

  signedIn: [
    { domain: 'g2.com', label: 'G2', use: 'Pricing pages, reviews that mention price and category pricing data.' },
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Funding of the comparable set, to judge pricing power.' },
    { domain: 'similarweb.com', label: 'SimilarWeb', use: 'Traffic to the pricing pages of competitors.' },
  ],

  monitor: {
    query: '{{product}} competitors pricing changes, new plans and packaging announcements',
    why: 'A competitor price move that would change the recommendation.',
  },
};
