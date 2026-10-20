/**
 * GTM plan (P6.13, startup / product): the v1 "GTM" template (id `gtm`, kept so saved canvases still open) upgraded to a
 * v2 playbook. Human-readable spec: docs/templates/gtm.md (generated: `pnpm templates:docs`).
 *
 * Parallel use: find_entities and batch_enrich build the target-account and partner lists, deep_research closes
 * channel and segment gaps, a monitor (Orb, on request) watches the launch space.
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

export const GTM_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'icp',
    name: 'ICP clarity',
    weight: 20,
    anchors: {
      1: 'A broad "anyone who needs X".',
      3: 'A defined segment with a buyer role.',
      5: 'A narrow segment with named accounts and a proven trigger.',
    },
    frame: 'market',
  },
  {
    id: 'message',
    name: 'Message-market fit',
    weight: 20,
    anchors: {
      1: 'Features, no customer words.',
      3: 'A clear promise that is not yet tested.',
      5: 'A message that matches how buyers describe the problem, tested.',
    },
    frame: 'positioning',
  },
  {
    id: 'channel',
    name: 'Channel fit',
    weight: 20,
    anchors: {
      1: 'No channel where the buyer is reachable.',
      3: 'One or two plausible channels.',
      5: 'A proven channel with measured conversion.',
    },
    frame: 'channels',
  },
  {
    id: 'econ',
    name: 'Economics',
    weight: 20,
    anchors: {
      1: 'CAC unknown or above lifetime value.',
      3: 'CAC and payback estimated and plausible.',
      5: 'Measured CAC with payback under 12 months.',
    },
    frame: 'funnel',
  },
  {
    id: 'exec',
    name: 'Execution capacity',
    weight: 20,
    anchors: {
      1: 'The plan needs people and budget that do not exist.',
      3: 'Doable with some hires or a stretch.',
      5: 'Fits the team and budget with room to learn.',
    },
    frame: 'launch',
  },
];

export const GTM_RED_FLAGS = redFlags([
  [
    'The first-launch ICP covers more than one buyer persona.',
    'Read the ICP & segments database: more than one primary segment or buyer role for the first launch is raised.',
  ],
  [
    'There is no evidence of buyer urgency.',
    'Look for a trigger event, budget or a dated pain in the sources and interviews; none is raised.',
  ],
  [
    'Channel CAC and conversion are assumed, not measured.',
    'Check the Channels database Basis column; a plan that rests on Assumed rows only is raised.',
  ],
  [
    'Payback is longer than 18 months for an SMB motion.',
    'Compute payback from the Funnel model and the price; raise if it is above 18 months (12 for self-serve).',
  ],
  [
    'The plan depends on one channel or one partner.',
    'Count channels with a high priority score; a single one, or a launch that needs one partner, is raised.',
  ],
  [
    'The sales motion does not fit the price.',
    'Compare the price point with the motion: high-touch sales below about $5k annual contract value, or self-serve at enterprise prices.',
  ],
  [
    'The team cannot execute the motion (no sellers, no content owner).',
    'Compare the Launch tasks owners and the team in the intake with what the motion needs.',
  ],
  [
    'The message is not tested against what competitors and buyers say.',
    'Compare the positioning statement with competitor quotes and buyer words; an untested claim is raised.',
  ],
  [
    'The channel is crowded and the product has no distribution advantage.',
    'Check competitor presence and cost in each top channel in the sources.',
  ],
  [
    'Success criteria are not measurable or have no date.',
    'Check the Goal frame metrics and the Launch tasks for numbers and dates.',
  ],
  [
    'A regulatory, platform or compliance constraint blocks a channel.',
    'Look for platform policies and regulation in the sources of each top channel (email, ads, outbound, regulated sectors).',
  ],
]);

export const GTM: TemplateSpecInput = {
  id: 'gtm',
  label: 'GTM plan',
  dot: '#2563EB',
  placeholder: 'What are you taking to market?',
  brief:
    'Work out a go-to-market plan: the ideal customer and the target accounts, the positioning and messaging, ' +
    'the competitive context, the channels ranked by fit and cost, the pricing headline, the funnel and the ' +
    'unit economics, partnerships, a dated launch plan with owners, and the risks. Cite every market claim, mark ' +
    'every CAC or conversion figure as measured or assumed, and end with a recommended motion and a first-90-days plan.',
  titleFrom: '{{product}}: GTM plan',

  inputs: [
    {
      id: 'product',
      label: 'What you are taking to market',
      kind: 'text',
      required: true,
      placeholder: 'Acme Analytics',
      maxLength: 70,
    },
    { id: 'website', label: 'Website URL', kind: 'url', placeholder: 'https://acme.com', maxLength: 300 },
    {
      id: 'stage',
      label: 'Stage',
      kind: 'select',
      options: ['Idea', 'MVP', 'Private beta', 'Launched', 'Scaling'],
      maxLength: 40,
    },
    {
      id: 'customer',
      label: 'Who it is for',
      kind: 'longtext',
      placeholder: 'Heads of support at 50 to 500 person SaaS companies',
      maxLength: 600,
    },
    {
      id: 'value',
      label: 'The promise',
      kind: 'longtext',
      placeholder: 'Halve ticket handling time without hiring',
      maxLength: 600,
    },
    {
      id: 'price',
      label: 'Price or price idea',
      kind: 'text',
      placeholder: '$99 per seat per month',
      maxLength: 120,
    },
    {
      id: 'team',
      label: 'Team and budget for go-to-market',
      kind: 'longtext',
      placeholder: '2 founders, one marketer, $20k for 6 months',
      maxLength: 600,
    },
    { id: 'launch', label: 'Target launch date', kind: 'text', placeholder: '2027-02-01', maxLength: 40 },
    {
      id: 'tried',
      label: 'Channels already tried',
      kind: 'longtext',
      placeholder: 'Cold email: 2% reply; a Product Hunt launch: 300 sign-ups',
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
    { id: 'geography', label: 'Region', kind: 'text', placeholder: 'US first, then EU', maxLength: 120 },
    materialsField(
      'Drop a product brief, a pitch deck, customer lists, funnel or campaign data (CSV or XLSX) and interview notes. Each becomes a card or database.',
    ),
    depthField,
    sitesField([
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'g2.com', label: 'G2' },
      { domain: 'crunchbase.com', label: 'Crunchbase' },
    ]),
  ],

  frames: [
    {
      id: 'goal',
      title: 'Goal & constraints',
      color: 'signal',
      brief:
        'What the launch must achieve and within what limits: the target (customers, revenue, sign-ups) and its date, ' +
        'the budget, the team, the stage of {{product}} and what has been tried ({{tried|nothing yet}}). Success ' +
        'must be measurable and dated.',
      owners: ['orb'],
      targets: [
        { type: 'metric', min: 4 },
        { type: 'doc', min: 1, note: 'the GTM brief' },
        { type: 'hypothesis', min: 2 },
      ],
      seeds: [
        {
          type: 'doc',
          data: {
            title: 'GTM brief',
            body: 'Product: {{product}} ({{stage|stage to confirm}}). For: {{customer|to confirm}}. Promise: {{value|to confirm}}. Price: {{price|not set}}. Team and budget: {{team|not given}}. Launch: {{launch|no date}}.',
          },
          why: 'The brief, from your intake.',
        },
        metric('Launch target', 'The number to reach and the date: customers, revenue or sign-ups.'),
        metric('Launch date', 'The date, or the window.'),
        metric('Budget', 'Money available for go-to-market, with the period.'),
        metric('Team capacity', 'People who can work on go-to-market, in full-time equivalents.'),
        hypothesis(
          'A narrow first segment will convert faster than a broad launch',
          'Test against the segment evidence and the channel data.',
        ),
        hypothesis('One channel can carry the first 90 days', 'Test against the Channels database and what has been tried.'),
        question('What has to be true for this launch to hit its target?', 'List the three assumptions that matter most.'),
      ],
      room: 240,
    },
    {
      id: 'market',
      title: 'Market & ICP',
      color: 'sky',
      brief:
        'Who to sell to first: segments with their size, pain, buyer role, budget, urgency and how reachable they are, ' +
        'the segment to start with, and the target accounts in it (a list the team can act on, from public sources). ' +
        'Personas stay grounded in evidence.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 2, note: 'ICP & segments, Target accounts (at least 25 accounts)' },
        { type: 'entity', min: 2, note: 'personas, kind person' },
        { type: 'chart', min: 1, note: 'segments by attractiveness' },
        { type: 'source', min: 4 },
      ],
      seeds: [
        db('ICP & segments', 'segments'),
        db('Target accounts', 'accounts'),
        chart('Segments by urgency', 'segments', 'bar', 'Segment', 'Urgency'),
        question('Which segment has a trigger event we can sell into this quarter?', 'Name the trigger and how to see it.'),
      ],
    },
    {
      id: 'positioning',
      title: 'Positioning & messaging',
      color: 'rho',
      brief:
        'How {{product}} is described: the positioning statement (for whom, what, against which alternative, why us), ' +
        'the message hierarchy (promise, three proof points, objections), and the words buyers use. Compare with the ' +
        'claims competitors make; place them on a 2x2 and find the open position.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'doc', min: 1, note: 'the positioning statement' },
        { type: 'quote', min: 6, note: 'buyer and competitor words' },
        { type: 'framework', min: 1, note: 'the 2x2' },
      ],
      seeds: [
        {
          type: 'doc',
          data: {
            title: 'Positioning statement',
            body: 'For [customer] who [need], {{product}} is a [category] that [benefit]. Unlike [alternative], {{product}} [differentiator]. orb drafts it from the evidence.',
          },
          why: 'The template of the statement; orb fills it.',
        },
        framework('Positioning 2x2', 'quadrant', { xAxis: 'Breadth of product', yAxis: 'Ease of adoption' }),
        question('In the customer\'s words, what is the problem and what does a good result look like?'),
      ],
    },
    {
      id: 'competition',
      title: 'Competitive context',
      color: 'sky',
      brief:
        'Who the buyer will compare {{product}} with and how they position and sell: the direct competitors and the ' +
        'substitutes, their pricing headline, their main channel, and where they are weak. Enough to choose a ' +
        'wedge, not a full competitive analysis (use that template for one).',
      owners: ['scout'],
      targets: [
        { type: 'database', min: 1, note: 'Competitors, at least 8 rows' },
        { type: 'product', min: 3, note: 'kind competitor' },
        { type: 'source', min: 4 },
      ],
      seeds: [db('Competitors', 'competitors')],
    },
    {
      id: 'channels',
      title: 'Channels',
      color: 'rho',
      brief:
        'Where the buyer can be reached and at what cost: outbound, content and search, paid, community, partnerships, ' +
        'product-led, events and marketplaces. Per channel the segment it fits, estimated CAC and volume, the time ' +
        'to first result and the evidence. Rank them. What has been tried: {{tried|nothing yet}}.',
      owners: ['scout', 'builder', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Channels, at least 8 rows' },
        { type: 'matrix', min: 1, note: 'channel prioritisation' },
        { type: 'chart', min: 1, note: 'channels by cost and fit' },
      ],
      seeds: [
        db('Channels', 'channels'),
        matrix(
          'Channel prioritisation',
          [
            { name: 'Reach into the ICP', weight: 30 },
            { name: 'Cost per customer', weight: 25 },
            { name: 'Speed to first result', weight: 20 },
            { name: 'Fit with the team', weight: 15 },
            { name: 'Evidence it works', weight: 10 },
          ],
          ['Channel A', 'Channel B', 'Channel C'],
          'Placeholder: Builder names the top channels and scores them from the Channels database.',
        ),
        chart('Channels by priority score', 'channels', 'bar', 'Channel', 'Priority score'),
      ],
    },
    {
      id: 'pricing',
      title: 'Pricing headline',
      color: 'sky',
      brief:
        'The price the plan assumes, and how it compares with the alternatives: entry price, the sales motion it ' +
        'implies and the contract value. This is the headline only; the pricing research template goes deeper.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'metric', min: 3 },
        { type: 'source', min: 3, note: 'competitor pricing pages' },
      ],
      seeds: [
        metric('Entry price', '{{price|The planned entry price}}, with the unit.'),
        metric('Median competitor price', 'Median entry price of the Competitors database, with the date.'),
        metric('Annual contract value', 'Entry price times the usual number of units; implies the motion.'),
        question('Does the price fit the motion: self-serve, sales-assisted or enterprise?'),
      ],
    },
    {
      id: 'funnel',
      title: 'Funnel & economics',
      color: 'rho',
      brief:
        'The path from awareness to a paying customer and what it costs: the funnel stages with conversion and volume, ' +
        'CAC by channel, payback and the target. Mark every rate as Measured, Benchmark or Assumed. Compute, do not ' +
        'guess: show the formula.',
      owners: ['builder', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Funnel model' },
        { type: 'chart', min: 1, note: 'funnel by stage' },
        { type: 'math', min: 1, note: 'the CAC and payback formulas' },
        { type: 'metric', min: 3 },
      ],
      seeds: [
        db('Funnel model', 'funnel'),
        chart('Customers by funnel stage', 'funnel', 'bar', 'Stage', 'Volume per month'),
        {
          type: 'math',
          data: {
            title: 'CAC and payback',
            latex: '\\text{CAC} = \\frac{\\text{sales and marketing spend}}{\\text{new customers}},\\quad \\text{payback} = \\frac{\\text{CAC}}{\\text{monthly gross profit per customer}}',
            body: 'Inputs come from the Funnel model and the price; each is marked Measured, Benchmark or Assumed.',
          },
          why: 'The formulas, so the numbers can be checked.',
        },
        metric('Target CAC', 'From the economics: the most we can pay per customer.'),
        metric('Payback period', 'Months to recover CAC, with the basis.'),
        metric('Customers needed', 'Customers required to reach the launch target.'),
      ],
    },
    {
      id: 'partners',
      title: 'Partners & distribution',
      color: 'sky',
      brief:
        'Who already reaches {{product}}\'s buyer and could resell, integrate or co-market: integrations and marketplaces, ' +
        'agencies, communities, influencers and complementary vendors, with the offer and the audience overlap.',
      owners: ['scout'],
      targets: [
        { type: 'database', min: 1, note: 'Partners, at least 12 rows' },
        { type: 'entity', min: 3, note: 'the best partners' },
      ],
      seeds: [db('Partners', 'partners')],
    },
    {
      id: 'launch',
      title: 'Launch plan',
      color: 'paper',
      brief:
        'The first 90 days as dated work: what happens before launch, on launch day and after, who owns each task, ' +
        'which channel it feeds and the number that says it worked. Launch date: {{launch|to be set}}. Fit the plan ' +
        'to the team: {{team|not given}}.',
      owners: ['builder', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Launch tasks, at least 15 rows' },
        { type: 'timeline', min: 1, note: 'launch milestones' },
        { type: 'checklist', min: 1, note: 'launch readiness' },
      ],
      seeds: [
        db('Launch tasks', 'launch'),
        timeline('Launch milestones', 'Plan started', 'Builder adds dated milestones: pre-launch, launch, week 4, week 12.'),
        checklist('Launch readiness', [
          'The ICP and the first segment are agreed.',
          'The positioning statement is tested with five buyers.',
          'Tracking for every funnel stage is in place.',
          'The pricing page and the sales material are ready.',
          'Each task has an owner and a date.',
        ]),
      ],
    },
    {
      id: 'risks',
      title: 'Risks & assumptions',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence or clear it with a source. ' +
        'List the assumptions the plan rests on and how each will be tested in the first 30 days.',
      owners: ['critic'],
      targets: [{ type: 'risk', min: 5, note: 'every checklist item cleared with a source or raised' }],
      seeds: [
        checklist(
          'Red-flag checklist',
          GTM_RED_FLAGS.map((f) => `${f.id} ${f.text}`),
          'Critic raises or clears each; you tick them off.',
        ),
        emptyRisk('Segment'),
        emptyRisk('Channel'),
        emptyRisk('Economics'),
        emptyRisk('Execution'),
      ],
    },
    {
      id: 'plan',
      title: 'Plan & decision',
      color: 'signal',
      brief:
        'The recommended go-to-market motion and the first 90 days: the segment, the message, the channels, the ' +
        'price, the targets and what would make you change course. Score the plan against the rubric with cited ' +
        'evidence; the weighted total goes in the Decision rationale.',
      owners: ['orb'],
      targets: [
        { type: 'decision', min: 1 },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
        { type: 'framework', min: 1, note: 'SWOT of the plan' },
        { type: 'insight', min: 3 },
      ],
      seeds: [
        {
          type: 'decision',
          data: {
            title: 'Which go-to-market motion for {{product}}?',
            body: 'Open. orb proposes after the rubric is filled.',
            options: [
              { label: 'Product-led, self-serve' },
              { label: 'Founder-led sales' },
              { label: 'Community and content led' },
              { label: 'Partner-led' },
            ],
            status: 'open',
          },
          why: 'Open decision: you choose; orb proposes.',
        },
        framework('SWOT of the plan', 'swot'),
        matrix(
          'GTM readiness (rubric score x 2, so 10 is a 5)',
          GTM_RUBRIC.map((d) => ({ name: `${d.name} (${d.weight}%)`, weight: d.weight })),
          ['orb score', 'Your score'],
          'orb fills one score per dimension with cited evidence; you may override.',
        ),
      ],
    },
  ],

  databases: [
    {
      key: 'segments',
      name: 'ICP & segments',
      frame: 'market',
      purpose: 'Candidate segments with the evidence behind each rating.',
      keyColumn: 'Segment',
      columns: [
        { name: 'Segment', type: 'text' },
        { name: 'Description', type: 'text' },
        { name: 'Accounts', type: 'number', note: 'Number of accounts in the segment.' },
        { name: 'Buyer role', type: 'text' },
        { name: 'Core pain', type: 'text' },
        { name: 'Budget', type: 'text' },
        { name: 'Urgency', type: 'rating', note: '1 to 5.' },
        { name: 'Reachability', type: 'rating', note: '1 to 5.' },
        { name: 'First launch', type: 'boolean', note: 'Chosen as the first segment.' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Urgency', dir: 'desc' }] },
        { name: 'Chosen', kind: 'table', filter: [{ column: 'First launch', op: 'eq', value: true }] },
      ],
    },
    {
      key: 'accounts',
      name: 'Target accounts',
      frame: 'market',
      purpose: 'Named accounts in the first segment. Public company information only. Discovered with find_entities and enriched with batch_enrich.',
      keyColumn: 'Company',
      columns: [
        { name: 'Company', type: 'text' },
        { name: 'Website', type: 'url' },
        { name: 'Segment', type: 'text' },
        { name: 'Size', type: 'text' },
        { name: 'HQ', type: 'text' },
        { name: 'Why a fit', type: 'text' },
        { name: 'Trigger', type: 'text', note: 'A dated event that makes them buy now.' },
        { name: 'Buyer role', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By segment', kind: 'table', group: 'Segment' },
      ],
    },
    {
      key: 'competitors',
      name: 'Competitors',
      frame: 'competition',
      purpose: 'Who the buyer compares the product with. Discovered with find_entities and enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'URL', type: 'url' },
        { name: 'Category', type: 'enum', options: ['Direct', 'Indirect', 'Incumbent', 'Substitute'] },
        { name: 'Positioning', type: 'text' },
        { name: 'Entry price (USD per month)', type: 'currency' },
        { name: 'Main channel', type: 'text' },
        { name: 'Weakness', type: 'text' },
        { name: 'Threat level', type: 'rating', note: '1 (low) to 5 (high).' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Threat level', dir: 'desc' }] },
        { name: 'By category', kind: 'board', group: 'Category' },
      ],
    },
    {
      key: 'channels',
      name: 'Channels',
      frame: 'channels',
      purpose: 'Every candidate channel with its cost, volume, speed and evidence.',
      keyColumn: 'Channel',
      columns: [
        { name: 'Channel', type: 'text' },
        {
          name: 'Type',
          type: 'enum',
          options: ['Outbound', 'Content and search', 'Paid', 'Community', 'Partnerships', 'Product-led', 'Events', 'Marketplace'],
        },
        { name: 'Segment', type: 'text' },
        { name: 'Est. CAC (USD)', type: 'currency' },
        { name: 'Est. customers per month', type: 'number' },
        { name: 'Weeks to first result', type: 'number' },
        { name: 'Fit with the team', type: 'rating', note: '1 to 5.' },
        { name: 'Priority score', type: 'number', note: '0 to 10, from the channel matrix.' },
        { name: 'Basis', type: 'enum', options: ['Measured', 'Benchmark', 'Assumed'] },
        { name: 'Evidence', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'By priority', kind: 'table', sort: [{ column: 'Priority score', dir: 'desc' }] },
        { name: 'By type', kind: 'board', group: 'Type' },
        { name: 'Measured', kind: 'table', filter: [{ column: 'Basis', op: 'eq', value: 'Measured' }] },
      ],
    },
    {
      key: 'funnel',
      name: 'Funnel model',
      frame: 'funnel',
      purpose: 'Each stage of the funnel with its conversion and volume, marked Measured, Benchmark or Assumed.',
      keyColumn: 'Stage',
      columns: [
        { name: 'Stage', type: 'text', note: 'Aware, visit, sign-up, activated, paid, expanded.' },
        { name: 'Conversion from the previous stage (%)', type: 'number' },
        { name: 'Volume per month', type: 'number' },
        { name: 'Basis', type: 'enum', options: ['Measured', 'Benchmark', 'Assumed'] },
        { name: 'Source', type: 'url' },
        { name: 'Note', type: 'text' },
      ],
      views: [{ name: 'All', kind: 'table' }, { name: 'By basis', kind: 'board', group: 'Basis' }],
    },
    {
      key: 'partners',
      name: 'Partners',
      frame: 'partners',
      purpose: 'Companies and communities that already reach the buyer. Discovered with find_entities.',
      keyColumn: 'Partner',
      columns: [
        { name: 'Partner', type: 'text' },
        { name: 'Type', type: 'enum', options: ['Integration', 'Marketplace', 'Agency', 'Community', 'Influencer', 'Complementary vendor'] },
        { name: 'Audience overlap', type: 'rating', note: '1 to 5.' },
        { name: 'Offer', type: 'text', note: 'What both sides get.' },
        { name: 'Contact role', type: 'text' },
        { name: 'Status', type: 'enum', options: ['Idea', 'Approached', 'In talks', 'Live', 'Declined'] },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Audience overlap', dir: 'desc' }] },
        { name: 'By status', kind: 'board', group: 'Status' },
      ],
    },
    {
      key: 'launch',
      name: 'Launch tasks',
      frame: 'launch',
      purpose: 'The first 90 days as work: task, owner, date, channel and the number that says it worked.',
      keyColumn: 'Task',
      columns: [
        { name: 'Task', type: 'text' },
        { name: 'Phase', type: 'enum', options: ['Before launch', 'Launch', 'Weeks 1 to 4', 'Weeks 5 to 12'] },
        { name: 'Owner', type: 'person' },
        { name: 'Due', type: 'date' },
        { name: 'Channel', type: 'text' },
        { name: 'Success metric', type: 'text' },
        { name: 'Status', type: 'enum', options: ['Todo', 'Doing', 'Done', 'Blocked'] },
      ],
      views: [
        { name: 'By date', kind: 'table', sort: [{ column: 'Due', dir: 'asc' }] },
        { name: 'By status', kind: 'board', group: 'Status' },
        { name: 'By phase', kind: 'table', group: 'Phase' },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text: 'Read what the user dropped first: the product brief, a deck, customer lists, funnel or campaign data (read_card, read_source, query_dataset). Put measured funnel numbers into Funnel model (upsert_rows) with Basis "Measured", and the channels already tried into Channels with their measured results. Hand the customer, the promise, the budget and the competitors to Scout in the delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['funnel', 'channels'],
      }),
      orbDelegate(
        'Scout first (segments, accounts, competitors, channels), Builder once Scout has channel and segment rows, Critic once Scout has sources to review.',
      ),
      step({
        id: 'goal',
        text: 'Fill the goal metrics from the intake (update_card): the launch target, the date, the budget and the team capacity. A target with no date or number is a Question to the user (ask_user_question), not a guess.',
        tools: ['update_card', 'ask_user_question', 'query_board'],
        frames: ['goal'],
      }),
      step({
        id: 'economics',
        text: 'Compute CAC, payback and the customers needed from Channels, Funnel model and the price (query_dataset); update the metric seeds with the basis. Show the formula in the card text. Never present an Assumed rate as measured.',
        tools: ['query_dataset', 'update_card', 'upsert_rows'],
        frames: ['funnel', 'pricing'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (a channel with no cost data, a segment with no size), run deep_research (core) on that one question.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'plan',
        text: 'Choose the first segment (mark First launch in ICP & segments if you wrote the row, otherwise ask Scout) and write the positioning statement (update_card). Fill the GTM readiness matrix: one 1-to-5 score per rubric dimension (doubled), each with a cited card; the SWOT; the hypotheses with evidence for and against; the Decision with the weighted total in its rationale.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['plan', 'positioning'],
      }),
      orbMemo,
      orbMonitor,
    ],
    scout: [
      step({
        id: 'own',
        text: 'Our own site and the materials first (fetch_url, capture_page): how {{product}} describes itself today, the pricing page, customers named. Source cards and a screenshot.',
        tools: ['fetch_url', 'parallel_extract', 'capture_page', 'place_card'],
        frames: ['positioning', 'pricing'],
      }),
      step({
        id: 'segments',
        text: 'Segments: 3 to 5 candidate segments in ICP & segments (upsert_rows, key Segment) with size, buyer role, pain, urgency and reachability, each with a Source url; a persona (entity card, kind person) for the best two, grounded in sources. Public analysis of the segment, not of private people.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card', 'upsert_rows'],
        frames: ['market'],
      }),
      step({
        id: 'accounts',
        text: 'Target accounts: find_entities for companies in the first segment (the match limit follows the depth tier); batch_enrich adds size, HQ, why a fit, trigger and buyer role; consolidate into Target accounts (upsert_rows, key Company) with a Source url. Quick scan: find_entities is refused; add a handful from web_search.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'upsert_rows', 'query_dataset'],
        frames: ['market'],
      }),
      step({
        id: 'competitors',
        text: 'Competitors: those the user named, then more through find_entities and batch_enrich (positioning, entry price, main channel, weakness); consolidate into Competitors (upsert_rows, key Name). A Product card (kind competitor) for the top three; their home page headlines as Quote cards in Positioning & messaging.',
        tools: ['find_entities', 'batch_enrich', 'fetch_url', 'place_card', 'upsert_rows', 'query_dataset'],
        frames: ['competition', 'positioning'],
      }),
      step({
        id: 'channels',
        text: 'Channels: for each candidate type, evidence of cost and conversion for this kind of product (benchmarks, case studies, where competitors show up); a row each in Channels (upsert_rows, key Channel) with Basis Benchmark or Assumed and a Source url. LinkedIn or G2 only via fetch_signed_in if the user ticked them.',
        tools: ['web_search', 'fetch_url', 'fetch_signed_in', 'web_answer', 'upsert_rows', 'place_card'],
        frames: ['channels'],
      }),
      step({
        id: 'pricing',
        text: 'Pricing headline: the competitor entry prices into Competitors and the Median competitor price metric with its date; one Source per price.',
        tools: ['fetch_url', 'parallel_extract', 'capture_page', 'place_card', 'upsert_rows'],
        frames: ['pricing'],
      }),
      step({
        id: 'partners',
        text: 'Partners: find_entities for integrations, marketplaces, agencies and communities that reach the buyer (public information only); consolidate into Partners (upsert_rows, key Partner); an entity card for the best three.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'place_card', 'upsert_rows'],
        frames: ['partners'],
        minTier: 'standard',
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain: deep_research (core or above, per the tier), for example channel benchmarks for the category.',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      criticStart,
      criticFlags(['risks', 'channels', 'market']),
      step({
        id: 'assumptions',
        text: 'Challenge every channel row and funnel rate that is Assumed or has one source: link it "tension" to the card that disagrees, or place a Question naming the test that would measure it in the first 30 days. Challenge the positioning claim against competitor quotes.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['positioning', 'channels', 'risks'],
      }),
      step({
        id: 'tests',
        text: 'List the first-30-day tests (Checklist or Question cards in Risks & assumptions): the assumption, the test, the sample and the pass threshold. You cannot tick; the user does.',
        tools: ['place_card', 'add_link', 'query_board'],
        frames: ['risks'],
      }),
      criticReport,
    ],
    builder: [
      step({
        id: 'charts',
        text: 'Charts bound to the databases: segments by urgency (bar, ICP & segments), channels by priority score (bar, Channels), customers by funnel stage (bar, Funnel model).',
        tools: ['place_card', 'query_dataset'],
        frames: ['market', 'channels', 'funnel'],
      }),
      step({
        id: 'channels',
        text: 'The channel prioritisation matrix: weighted criteria, scores 0 to 10 for the top channels from the Channels database, the option note naming the rows used; write the Priority score back into the rows you wrote.',
        tools: ['place_card', 'query_dataset', 'upsert_rows', 'read_card'],
        frames: ['channels'],
      }),
      step({
        id: 'positioning',
        text: 'The positioning 2x2 (framework, quadrant) from the competitor quotes and features, and a messaging hierarchy as a diagram or design frame: promise, three proof points, objections with answers, each tied to a card.',
        tools: ['place_card', 'write_design_frame', 'query_board', 'read_card'],
        frames: ['positioning'],
      }),
      step({
        id: 'funnel',
        text: 'The funnel: one Funnel model row per stage (upsert_rows, key Stage) from Channels and the price, with Basis and the formula in the Note; the CAC and payback math card citing its inputs.',
        tools: ['upsert_rows', 'query_dataset', 'place_card', 'read_card'],
        frames: ['funnel'],
      }),
      step({
        id: 'launch',
        text: 'The launch plan: 15 or more Launch tasks (upsert_rows, key Task) with phase, owner role, due date, channel and success metric, fitted to the team and the launch date; the milestones timeline with a source label each.',
        tools: ['upsert_rows', 'place_card', 'query_dataset'],
        frames: ['launch'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...GTM_RUBRIC],
  redFlags: [...GTM_RED_FLAGS],

  output: {
    memoTitle: 'Go-to-market plan: {{product}}',
    citationRule:
      'Every paragraph cites cards; every market figure cites its source; every CAC, conversion or volume is marked Measured, Benchmark or Assumed.',
    sections: [
      {
        id: 'summary',
        title: 'Summary & recommendation',
        frames: ['plan', 'risks'],
        words: 150,
        guidance: 'The recommended motion, the first segment, the three reasons and the three risks, in at most 150 words.',
      },
      {
        id: 'goal',
        title: 'Goal and constraints',
        frames: ['goal'],
        guidance: 'The target, the date, the budget and the team.',
      },
      {
        id: 'market',
        title: 'Market and ideal customer',
        frames: ['market'],
        guidance: 'The segments, the chosen first segment, the personas and the target accounts.',
      },
      {
        id: 'positioning',
        title: 'Positioning and messaging',
        frames: ['positioning', 'competition'],
        guidance: 'The positioning statement, the message hierarchy, the 2x2 and the competitive context.',
      },
      {
        id: 'channels',
        title: 'Channels',
        frames: ['channels'],
        guidance: 'The ranked channels with cost, volume and evidence, and the matrix.',
      },
      {
        id: 'pricing',
        title: 'Pricing and motion',
        frames: ['pricing'],
        guidance: 'The price headline against competitors and the motion it implies.',
      },
      {
        id: 'funnel',
        title: 'Funnel and economics',
        frames: ['funnel'],
        guidance: 'The funnel table, CAC, payback and the customers needed, with the basis of each rate.',
      },
      {
        id: 'partners',
        title: 'Partners and distribution',
        frames: ['partners'],
        guidance: 'The best partners and the offer to each.',
      },
      {
        id: 'launch',
        title: 'Launch plan',
        frames: ['launch'],
        guidance: 'The first 90 days: milestones, owners and the metric for each.',
      },
      {
        id: 'risks',
        title: 'Risks and assumptions',
        frames: ['risks'],
        guidance: 'The red-flag outcomes and the 30-day tests.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard',
        frames: ['plan'],
        guidance: 'The rubric table: each dimension, its weight, its score and its evidence.',
      },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{product}} go-to-market',
      includes: ['Motion', 'First segment', 'Top channels', 'Targets', 'Top risks'],
    },
    deckFormat: 'standard',
    deck: {
      title: 'Go-to-market plan: {{product}}',
      slides: [
        { title: 'The plan in one slide', brief: 'The motion, the first segment, the target and the date.' },
        { title: 'Who we sell to', brief: 'Segments, the chosen one and the personas.' },
        { title: 'Target accounts', brief: 'The first accounts and the trigger for each.' },
        { title: 'Positioning and message', brief: 'The positioning statement and the 2x2.' },
        { title: 'Competition', brief: 'Where competitors sell and where they are weak.' },
        { title: 'Channels', brief: 'The ranked channels with cost and evidence.' },
        { title: 'Pricing and motion', brief: 'The price against the market and what it implies.' },
        { title: 'Funnel and economics', brief: 'The funnel chart, CAC and payback.' },
        { title: 'Launch plan', brief: 'The 90-day timeline with owners.' },
        { title: 'Risks and tests', brief: 'The raised flags and the 30-day tests.' },
        { title: 'Decision and next steps', brief: 'The decision, the score and the next actions.' },
      ],
    },
  },

  tiers: tiers({
    quick:
      'No deep research: segments, competitors and channels from public search, at most 12 cards per frame, no partner list and the memo is the summary only.',
    standard:
      'Quick, plus find_entities and batch_enrich for the target accounts, competitors and partners, the funnel and launch plan, and one or two deep-research runs (core), asking before spend.',
    deep: 'Standard, plus pro or ultra research on channel benchmarks and the segment, larger account and partner lists, and the full memo and deck.',
  }),

  followUps: [
    {
      label: 'Go deeper on a channel',
      prompt: 'Go deeper on the channel [channel]: cost, conversion, who uses it well, and a 30-day test for {{product}}.',
    },
    {
      label: 'Write the outbound sequence',
      prompt: 'Write a five-step outbound sequence for the first segment, using the buyer\'s words from the quotes on this board.',
    },
    {
      label: 'Draft the launch announcement',
      prompt: 'Draft the launch announcement and the landing page copy for {{product}} from the positioning statement.',
    },
    {
      label: 'Stress-test the plan',
      prompt: 'Build the strongest case that this plan fails to hit its target, and what you would change.',
    },
    {
      label: 'Re-plan with the new numbers',
      prompt: 'I added campaign results. Update the Funnel model and Channels with the measured numbers and tell me what changes in the plan.',
    },
    {
      label: 'Watch the launch space',
      prompt: 'Start a monitor on competitor launches and announcements in our category.',
    },
  ],

  signedIn: [
    { domain: 'linkedin.com', label: 'LinkedIn', use: 'Public company pages and role counts for the target accounts and partners.' },
    { domain: 'g2.com', label: 'G2', use: 'Category, competitors, alternatives and buyer language in reviews.' },
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Funding and headcount of competitors and target accounts.' },
  ],

  monitor: {
    query: '{{product}} category: competitor launches, pricing changes, funding and buyer discussions',
    why: 'A market move that would change the plan.',
  },
};
