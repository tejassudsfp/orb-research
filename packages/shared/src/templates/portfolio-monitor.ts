/**
 * Portfolio company monitoring (P6.12): an ongoing template. A company the user already backs is checked against its
 * plan and its original thesis, watched for news, hiring, customer and financing signals (Parallel monitors, on request),
 * and turned into a status call, an action list and a portfolio update. Run it again each period: the databases keep
 * the history. Human-readable spec: docs/templates/portfolio-monitor.md (generated: `pnpm templates:docs`).
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
  metric,
  proscons,
  question,
  quadrant,
  redFlagChecklist,
  scorecard,
  sitesField,
  step,
  tableView,
  target,
  tiersFor,
  timeline,
} from './finance-kit.js';

export const MONITOR_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'plan',
    name: 'Performance against plan',
    weight: 25,
    anchors: {
      1: 'Missing the plan on the main KPIs for two or more periods.',
      3: 'Near plan, with misses explained.',
      5: 'Ahead of plan on the KPIs that matter, verified.',
    },
    frame: 'kpis',
  },
  {
    id: 'runway',
    name: 'Runway & financing',
    weight: 20,
    anchors: {
      1: 'Under six months of runway with no round in sight.',
      3: '12 to 18 months of runway or a round in progress.',
      5: 'More than 24 months of runway, or a strong round just closed.',
    },
    frame: 'financing',
  },
  {
    id: 'team',
    name: 'Team & hiring',
    weight: 15,
    anchors: {
      1: 'Key departures and a hiring freeze.',
      3: 'Stable team, hiring to plan.',
      5: 'Strong senior hires, low attrition, hiring ahead of growth.',
    },
    frame: 'team',
  },
  {
    id: 'customers',
    name: 'Customers & product',
    weight: 20,
    anchors: {
      1: 'Churn rising, reviews souring, product slipping.',
      3: 'Steady retention and product on the roadmap.',
      5: 'Expanding customers, strong reviews, product shipping ahead.',
    },
    frame: 'customers',
  },
  {
    id: 'thesis',
    name: 'Thesis intact & market position',
    weight: 20,
    anchors: {
      1: 'The original thesis is broken or the market has turned against the company.',
      3: 'Thesis partly intact; competition has moved.',
      5: 'Thesis confirmed and the company is gaining position.',
    },
    frame: 'thesis',
  },
];

export const MONITOR_FLAGS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: 'Runway under 12 months with no round in progress.',
    check: 'Read Cash and runway in the financing frame and the latest financials; compute runway from cash and burn.',
  },
  {
    id: 'RF02',
    text: 'Growth or revenue behind plan for two periods running.',
    check: 'Read the KPI tracker variance column for the last two periods.',
  },
  {
    id: 'RF03',
    text: 'Departure of a founder, an executive or a key engineer.',
    check: 'Check Team changes and the signal log for departures and open leadership roles.',
  },
  {
    id: 'RF04',
    text: 'Layoffs, a hiring freeze or a sharp drop in open roles.',
    check: 'Look for layoff news and the open-role count over time.',
  },
  {
    id: 'RF05',
    text: 'Loss or downsizing of a top customer, or rising churn.',
    check: 'Check Customer signals, reviews and the retention KPIs.',
  },
  {
    id: 'RF06',
    text: 'A competitor raised a large round or launched the same product.',
    check: 'Read the Competitor moves database and the competitor signals.',
  },
  {
    id: 'RF07',
    text: 'Litigation, a regulatory action or a security incident.',
    check: 'Search news, regulator pages and the company status page; cite the source.',
  },
  {
    id: 'RF08',
    text: 'Reporting got late, thinner or less consistent.',
    check: 'Compare the dates and completeness of the board materials and updates that were provided.',
  },
  {
    id: 'RF09',
    text: 'The next round looks like a down round or a bridge.',
    check: 'Compare the last valuation, current growth and market multiples; look for bridge or extension news.',
  },
  {
    id: 'RF10',
    text: 'Web traffic, downloads or product-usage signals are declining.',
    check: 'Look for traffic and download trends in the signal log; a decline over two periods is raised.',
  },
  {
    id: 'RF11',
    text: 'The company missed something it promised the board.',
    check: 'Compare the thesis milestones and last board commitments with what the sources show.',
  },
  {
    id: 'RF12',
    text: 'Concentration: one customer, one channel or one supplier carries the business.',
    check: 'Look for revenue by customer or channel in the materials; say "not knowable" if absent.',
  },
];

export const PORTFOLIO_MONITOR: TemplateSpecInput = {
  id: 'portfolio-monitor',
  label: 'Portfolio monitoring',
  dot: '#3D5DCF',
  placeholder: 'Which portfolio company do you want to check on?',
  brief:
    'Monitor a portfolio company: eleven numbered frames (status, KPIs against plan, thesis check, news and signals, ' +
    'team, customers and product, competitors, financing and runway, risks, actions, next check-in), a status call ' +
    '(On track, Watch, Needs help, Write-down risk), the red-flag checklist and a portfolio update. Separate what the ' +
    'company reported from what outside sources show, cite every number and keep the databases so the next run starts ' +
    'from this one.',
  titleFrom: '{{company}}: portfolio monitoring',

  inputs: [
    {
      id: 'company',
      label: 'Portfolio company',
      kind: 'text',
      required: true,
      placeholder: 'Acme Robotics',
      maxLength: 120,
    },
    {
      id: 'website',
      label: 'Website URL',
      kind: 'url',
      placeholder: 'https://acme.com',
      maxLength: 300,
    },
    {
      id: 'holding',
      label: 'Your holding',
      kind: 'text',
      placeholder: 'Series A lead, 12% fully diluted, Fund II',
      help: 'Stake, round and fund. Optional.',
      maxLength: 200,
    },
    {
      id: 'involvement',
      label: 'Your involvement',
      kind: 'select',
      options: ['Board seat', 'Board observer', 'Information rights only', 'No special rights'],
      group: 'role',
      maxLength: 60,
    },
    {
      id: 'cadence',
      label: 'Check-in cadence',
      kind: 'select',
      options: ['Weekly', 'Monthly', 'Quarterly', 'Ad hoc'],
      group: 'role',
      maxLength: 40,
    },
    {
      id: 'thesis',
      label: 'Original investment thesis',
      kind: 'longtext',
      placeholder: 'Why did you invest? What had to be true?',
      maxLength: 1500,
    },
    {
      id: 'watch',
      label: 'What to watch',
      kind: 'list',
      placeholder: 'Comma separated: runway, key hire, a customer renewal…',
      maxLength: 800,
    },
    {
      id: 'concerns',
      label: 'Specific concerns to probe',
      kind: 'longtext',
      placeholder: 'Churn, a founder dispute, a delayed launch…',
      maxLength: 1500,
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
      'Drop the latest board deck, monthly update, financials or KPI export (CSV or XLSX). KPI files become the KPI tracker; decks become cards.',
    ),
    depthField,
    sitesField([
      { domain: 'crunchbase.com', label: 'Crunchbase' },
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'pitchbook.com', label: 'PitchBook' },
      { domain: 'g2.com', label: 'G2' },
    ]),
  ],

  frames: [
    {
      id: 'status',
      title: 'Status & call',
      color: 'signal',
      brief:
        'Where {{company}} stands right now in one view: the status call (On track, Watch, Needs help, Write-down risk), the ' +
        'headline numbers (ARR, growth, cash, burn, runway, headcount) with their dates and whether the company reported them ' +
        'or a source verified them, and the one sentence a partner needs.',
      owners: ['orb'],
      targets: [target('metric', 6), target('decision', 1, 'the status call'), target('entity', 1), target('doc', 1, 'the one-liner')],
      seeds: [
        {
          type: 'entity',
          data: {
            title: '{{company}}',
            kind: 'org',
            url: '{{website}}',
            body: 'The portfolio company being monitored, from your intake.',
            facts: [
              { label: 'Your holding', value: '{{holding|to confirm}}' },
              { label: 'Your involvement', value: '{{involvement|to confirm}}' },
              { label: 'Cadence', value: '{{cadence|to confirm}}' },
            ],
          },
          why: 'The company, from your intake.',
        },
        doc('Status in one line', 'Where {{company}} stands and what changed since the last check. orb writes it after the first pass.'),
        decision(
          'Status call: {{company}}',
          ['On track', 'Watch', 'Needs help', 'Write-down risk'],
          'Open. orb proposes the call after the scorecard is filled; you decide.',
        ),
        metric('ARR', 'Latest, with the period; say whether reported or verified.'),
        metric('Growth', 'MoM or YoY with the period; reported or verified.'),
        metric('Cash', 'Cash at the last reporting date.'),
        metric('Monthly burn', 'Net burn, with how it is computed.'),
        metric('Runway', 'Months at the current burn.'),
        metric('Headcount', 'Employees now; say where the count comes from.'),
      ],
      room: 300,
    },
    {
      id: 'kpis',
      title: 'KPIs against plan',
      color: 'rho',
      brief:
        'Every tracked KPI against its plan for the last reporting periods: revenue, growth, retention, pipeline, burn, ' +
        'gross margin and the company-specific ones. Plan and actual side by side with the variance, each marked reported or ' +
        'verified. A KPI file you dropped becomes this database.',
      owners: ['scout', 'orb', 'builder', 'critic'],
      targets: [target('database', 1, 'KPI tracker with plan and actual filled'), target('chart', 2, 'plan against actual, and the trend'), target('question', 1)],
      seeds: [
        db('KPI tracker', 'kpis'),
        chart('Actual over time', 'line', 'kpis', 'Period', 'Actual', 'Metric'),
        chart('Variance to plan', 'bar', 'kpis', 'Metric', 'Variance'),
        question('Which KPI is off plan, and why?', 'The explanation the company gave, and whether the data supports it.'),
      ],
    },
    {
      id: 'thesis',
      title: 'Thesis check',
      color: 'sky',
      brief:
        'Is the reason you invested still true? Restate the original thesis as hypotheses, link the new evidence for and ' +
        'against each, note what has changed since the investment (market, product, team, competition) and tick the ' +
        'milestones that were met.',
      owners: ['orb', 'critic'],
      targets: [target('hypothesis', 3, 'with evidence links'), target('checklist', 1, 'thesis milestones'), target('insight', 1, 'what changed')],
      seeds: [
        hypothesis('Original thesis: {{company}}', 'Why you invested: {{thesis|not given.}} Link the evidence for and against.'),
        hypothesis('The company is executing to plan', 'KPIs, hiring and launches against what was promised.'),
        hypothesis('The market position is improving', 'Share, competition and customer pull against the investment case.'),
        checklist('Thesis milestones', [
          'The product milestone the thesis depended on.',
          'The revenue or customer milestone for the next round.',
          'The key hire the thesis depended on.',
        ], 'You tick milestones; agents propose them.'),
        question('What has changed since we invested?', 'Market, product, team, competition and capital markets.'),
      ],
    },
    {
      id: 'signals',
      title: 'News & signals',
      color: 'rho',
      brief:
        'Everything outside the company reporting on it since the last check: news, launches, press, hiring and job posts, ' +
        'web traffic and app downloads, awards, partnerships, legal and regulatory items. Each is logged with its date, type ' +
        'and impact, and a negative or an action-needed item is escalated.',
      owners: ['scout'],
      targets: [target('database', 1, 'Signal log'), target('timeline', 1, 'dated events'), target('source', 4)],
      seeds: [
        db('Signal log', 'signals'),
        timeline('Signals timeline', 'Monitoring started', 'Scout adds dated events (launches, press, hires, incidents), each with a source.'),
      ],
    },
    {
      id: 'team',
      title: 'Team & hiring',
      color: 'sky',
      brief:
        'Who joined, who left and who changed role since the last check, the open roles and what hiring says about strategy, ' +
        'leadership gaps, board changes and any sign of founder or executive strain.',
      owners: ['scout', 'critic'],
      targets: [target('database', 1, 'Team changes'), target('metric', 1, 'open roles'), target('source', 3)],
      seeds: [
        db('Team changes', 'team'),
        metric('Open roles', 'Count of open roles with the source and date, and the mix (engineering, sales, other).'),
        question('Who is missing from the leadership team?', 'The hire the next stage needs.'),
      ],
    },
    {
      id: 'customers',
      title: 'Customers & product',
      color: 'rho',
      brief:
        'Customer proof and product momentum: named customers won and lost, case studies, reviews (positive and negative), ' +
        'pricing changes, releases and the roadmap, partnerships, usage and traffic signals.',
      owners: ['scout'],
      targets: [target('database', 1, 'Customer signals'), target('quote', 4, 'at least 1 negative'), target('image', 1, 'a capture of the product or pricing page')],
      seeds: [db('Customer signals', 'customers')],
    },
    {
      id: 'competitors',
      title: 'Competitors',
      color: 'sky',
      brief:
        'What rivals did since the last check: funding, launches, pricing, hires, wins and losses, and how the landscape ' +
        'compares with the investment case. Discovered with find_entities and enriched with batch_enrich on the first run, ' +
        'then updated each period.',
      owners: ['scout', 'builder', 'critic'],
      targets: [target('database', 1, 'Competitor moves'), target('framework', 1, 'the 2x2'), target('chart', 1, 'funding by competitor')],
      seeds: [
        db('Competitor moves', 'rivals'),
        quadrant('Positioning 2x2', 'Product breadth', 'Go-to-market strength'),
      ],
    },
    {
      id: 'financing',
      title: 'Financing & runway',
      color: 'rho',
      brief:
        'Cash, burn and runway, the last round and its valuation, the plan for the next round, signals of the next round ' +
        '(investor activity, bridge or extension news), market multiples for comparable companies and the likely outcome ' +
        '(up, flat or down round).',
      owners: ['scout', 'orb', 'builder'],
      targets: [target('database', 1, 'Financing events'), target('metric', 2, 'runway and last valuation'), target('framework', 1, 'next-round readiness')],
      seeds: [
        db('Financing events', 'financing'),
        metric('Last valuation', 'Post-money of the last priced round, with its date.'),
        metric('Months to next round', 'Months until the company must raise at the current burn.'),
        proscons('Next-round readiness'),
      ],
    },
    {
      id: 'risks',
      title: 'Risks & red flags',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Also ' +
        'covers key-person, customer-concentration, runway, product and legal risk.',
      owners: ['critic'],
      targets: [target('risk', 6, 'every checklist item cleared with a source or raised')],
      seeds: [
        redFlagChecklist('Red-flag checklist', MONITOR_FLAGS),
        emptyRisk('Runway'),
        emptyRisk('Team'),
        emptyRisk('Customers'),
        emptyRisk('Product'),
        emptyRisk('Competition'),
        emptyRisk('Legal/Regulatory'),
      ],
    },
    {
      id: 'actions',
      title: 'Health score & actions',
      color: 'signal',
      brief:
        'The scored health of the company against the rubric, the actions this check produces (intros, hires, board asks, ' +
        'follow-ups) with an owner and a due date, and the asks to the founders.',
      owners: ['orb'],
      targets: [target('matrix', 1, 'the filled rubric'), target('database', 1, 'Action items'), target('framework', 1, 'SWOT')],
      seeds: [
        scorecard('Health scorecard (rubric score x 2, so 10 is a 5)', MONITOR_RUBRIC),
        db('Action items', 'actions'),
      ],
    },
    {
      id: 'questions',
      title: 'Next check-in',
      color: 'paper',
      brief:
        'What to ask the founders and what to look at next time: questions ranked by importance, each linked to the signal ' +
        'or gap that prompted it. Every unresolved question card on the board is collected here.',
      owners: ['critic', 'orb'],
      targets: [target('checklist', 1, 'at least 8 ranked questions, each linked to its source card')],
      seeds: [
        checklist('Questions for the next check-in', [
          'Your concerns to probe: {{concerns|none given yet}}',
          'What are the three numbers you watch every week, and how did they move?',
          'What is the biggest thing that could go wrong in the next quarter?',
        ]),
      ],
    },
  ],

  databases: [
    {
      key: 'kpis',
      name: 'KPI tracker',
      frame: 'kpis',
      purpose: 'One row per KPI per period, with the plan, the actual and the variance. History stays across check-ins.',
      keyColumn: 'Metric',
      columns: [
        col('Metric', 'text'),
        col('Period', 'text', { note: 'ISO month or quarter, e.g. 2026-09 or 2026-Q3.' }),
        col('Plan', 'number'),
        col('Actual', 'number'),
        col('Variance', 'number', { note: 'Percent: (actual - plan) / plan.' }),
        col('Basis', 'enum', { options: ['Reported', 'Verified', 'Estimated'], note: 'Company numbers are Reported.' }),
        col('Source', 'url'),
        col('Note', 'text'),
      ],
      views: [
        tableView('By period', { sort: [{ column: 'Period', dir: 'desc' }] }),
        boardView('By basis', 'Basis'),
        tableView('Off plan', { filter: [{ column: 'Variance', op: 'lt', value: 0 }] }),
      ],
    },
    {
      key: 'signals',
      name: 'Signal log',
      frame: 'signals',
      purpose: 'Every outside signal about the company, with its type, impact and whether it needs action.',
      keyColumn: 'Headline',
      columns: [
        col('Date', 'date'),
        col('Type', 'enum', { options: ['News', 'Product', 'Customer', 'Hiring', 'Funding', 'Executive', 'Legal', 'Security', 'Competitor', 'Traffic', 'Other'] }),
        col('Headline', 'text'),
        col('Impact', 'enum', { options: ['Positive', 'Neutral', 'Negative'] }),
        col('Action needed', 'boolean'),
        col('Source', 'url'),
        col('Note', 'text'),
      ],
      views: [
        tableView('By date', { sort: [{ column: 'Date', dir: 'desc' }] }),
        boardView('By impact', 'Impact'),
        tableView('Needs action', { filter: [{ column: 'Action needed', op: 'eq', value: true }] }),
      ],
    },
    {
      key: 'team',
      name: 'Team changes',
      frame: 'team',
      purpose: 'Joiners, leavers and role changes since monitoring started.',
      keyColumn: 'Name',
      columns: [
        col('Name', 'person'),
        col('Role', 'text'),
        col('Change', 'enum', { options: ['Joined', 'Left', 'Promoted', 'Role change', 'Board change'] }),
        col('Date', 'date'),
        col('Background', 'text'),
        col('LinkedIn', 'url'),
        col('Source', 'url'),
        col('Flags', 'text', { note: 'Key departure, short tenure, replaced by.' }),
      ],
      views: [tableView('By date', { sort: [{ column: 'Date', dir: 'desc' }] }), boardView('By change', 'Change')],
    },
    {
      key: 'customers',
      name: 'Customer signals',
      frame: 'customers',
      purpose: 'Named customers, wins, losses and the proof behind each.',
      keyColumn: 'Customer',
      columns: [
        col('Customer', 'text'),
        col('Segment', 'text'),
        col('Event', 'enum', { options: ['Won', 'Expanded', 'Renewed', 'Downsized', 'Lost', 'Case study', 'Review'] }),
        col('Date', 'date'),
        col('Size', 'text', { note: 'Employees or contract band.' }),
        col('Source', 'url'),
        col('Quote', 'text'),
      ],
      views: [tableView('By date', { sort: [{ column: 'Date', dir: 'desc' }] }), boardView('By event', 'Event')],
    },
    {
      key: 'rivals',
      name: 'Competitor moves',
      frame: 'competitors',
      purpose: 'Competitors and what each did lately. Discovered with find_entities, enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        col('Name', 'text'),
        col('URL', 'url'),
        col('Category', 'enum', { options: ['Direct', 'Indirect', 'Incumbent', 'Substitute'] }),
        col('Total funding', 'currency', { note: 'US dollars.' }),
        col('Last round', 'text'),
        col('Headcount', 'number'),
        col('Latest move', 'text'),
        col('Latest move date', 'date'),
        col('Threat level', 'rating', { note: '1 (low) to 5 (high).' }),
        col('Source', 'url'),
      ],
      views: [tableView('All', { sort: [{ column: 'Threat level', dir: 'desc' }] }), boardView('By category', 'Category')],
    },
    {
      key: 'financing',
      name: 'Financing events',
      frame: 'financing',
      purpose: 'Every round and financing event, and the cash position over time.',
      keyColumn: 'Event',
      columns: [
        col('Event', 'text', { note: 'Round name, bridge, venture debt, or "Cash update".' }),
        col('Date', 'date'),
        col('Amount', 'currency'),
        col('Post-money valuation', 'currency'),
        col('Lead', 'text'),
        col('Cash after', 'currency'),
        col('Basis', 'enum', { options: ['Reported', 'Verified', 'Estimated'] }),
        col('Source', 'url'),
      ],
      views: [tableView('By date', { sort: [{ column: 'Date', dir: 'asc' }] })],
    },
    {
      key: 'actions',
      name: 'Action items',
      frame: 'actions',
      purpose: 'What follows from this check: asks, intros and follow-ups.',
      keyColumn: 'Action',
      columns: [
        col('Action', 'text'),
        col('Owner', 'person'),
        col('Due', 'date'),
        col('Status', 'enum', { options: ['Open', 'In progress', 'Done', 'Dropped'] }),
        col('Priority', 'enum', { options: ['High', 'Medium', 'Low'] }),
        col('Why', 'text', { note: 'The signal or KPI that prompted it.' }),
      ],
      views: [tableView('Open first', { sort: [{ column: 'Due', dir: 'asc' }] }), boardView('By status', 'Status')],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first: the board deck, the monthly update, financials and KPI exports (read_card and ' +
          'read_source for files, query_dataset for databases). Put every reported KPI into the KPI tracker (upsert_rows) with ' +
          'Basis "Reported", and the cash balance into Financing events. Hand the competitors, the watch list and the ticked ' +
          'signed-in sources from the intake to Scout in its delegate instruction. A row an agent wrote can only be changed by ' +
          'that agent: when a reported number is verified, add a new row with Basis "Verified".',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['kpis', 'financing'],
      }),
      step({
        id: 'delegate',
        text: 'Delegate with delegate: Scout first (signals, team, customers, competitors, financing), Builder once the KPI tracker has rows, Critic once Scout has placed its first sources. Name the frames each agent owns.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'status',
        text:
          "After Scout's first pass, fill the six Status metrics (update_card) and the one-line status, each with a cited figure " +
          'and its date, marked reported or verified. Never write a figure you cannot source.',
        tools: ['query_board', 'search_board', 'query_dataset', 'update_card'],
        frames: ['status'],
      }),
      step({
        id: 'variance',
        text: 'Compute the Variance column from Plan and Actual for each KPI (query_dataset, then a new row with the variance filled when you wrote the rows) and note the KPIs that are off plan in the "Which KPI is off plan" question.',
        tools: ['query_dataset', 'upsert_rows', 'update_card'],
        frames: ['kpis'],
      }),
      step({
        id: 'thesis',
        text: 'Thesis check: restate the original thesis as the three hypotheses, link the evidence for and against (add_link) and write what changed since the investment as one insight that cites at least two cards.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['thesis'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (a customer count, a round rumour), run deep_research (core) on that one question. Ask the user before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'score',
        text: 'At the end, fill the Health scorecard: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card. Then propose the Status call (your proposed option and the weighted total in its rationale) and write the action items (upsert_rows, key Action): owner, due date and the signal that prompted each.',
        tools: ['query_board', 'read_card', 'update_card', 'upsert_rows', 'place_card', 'add_link'],
        frames: ['actions', 'status'],
      }),
      step({
        id: 'memo',
        text: 'Write the portfolio update with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only.',
        tools: ['compose_section'],
      }),
      step({
        id: 'questions',
        text: 'Keep the check-in questions current: collect every unresolved Question card into the "Questions for the next check-in" checklist, ranked, each linked to its source card.',
        tools: ['search_board', 'update_card', 'add_link'],
        frames: ['questions'],
      }),
      step({
        id: 'monitor',
        text: 'This template is meant to be run again: when the user wants the company watched between check-ins, offer watch_topic for the company (news, funding, layoffs, lawsuits, launches) and one for each competitor they name. Monitors cost money on every check, so each is confirmed by the user; list_watches before adding one, and stop_watch when the user asks. New events arrive in watch_events: log them in the Signal log.',
        tools: ['watch_topic', 'list_watches', 'watch_events', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'company-site',
        text: 'The company site: news, blog, careers, pricing and changelog pages (fetch_url). Take capture_page screenshots of the home and pricing pages as image cards in Customers & product. Log what changed since the last check in the Signal log (upsert_rows, key Headline) and any claimed KPI as a KPI tracker row with Basis "Reported".',
        tools: ['fetch_url', 'parallel_extract', 'capture_page', 'place_card', 'upsert_rows'],
        frames: ['customers', 'signals', 'kpis'],
      }),
      step({
        id: 'signals',
        text: 'News and signals: press, launches, awards, partnerships, legal and regulatory items and security incidents since the last check (web_search, fetch_url, web_answer for quick checks). One Signal log row each with Type, Impact and a Source; dated events on the timeline; set Action needed for a negative or time-sensitive item.',
        tools: ['web_search', 'fetch_url', 'web_answer', 'upsert_rows', 'place_card'],
        frames: ['signals'],
      }),
      step({
        id: 'team',
        text: 'Team and hiring: founders and executives (fetch_signed_in LinkedIn when connected, public search otherwise), joiners and leavers into Team changes (upsert_rows, key Name), the open-role count and mix into the Open roles metric source, and any board changes.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'upsert_rows', 'place_card'],
        frames: ['team'],
      }),
      step({
        id: 'customers',
        text: 'Customers and product: named wins and losses, case studies and reviews (G2 or similar, fetch_signed_in when connected) into Customer signals, quote cards (positive and negative), pricing and release changes, and traffic or download trends as signals.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['customers', 'signals'],
      }),
      step({
        id: 'competitors',
        text: "Competitors: add the known competitors from the intake first. On the first run find_entities discovers more (the match limit follows the depth tier); it fills its own database card in this frame, and batch_enrich fills funding, headcount and latest move. Then upsert the rows into Competitor moves (upsert_rows, key Name). On later runs only refresh what changed. On the Quick scan tier find_entities and batch_enrich are refused: use web_search with upsert_rows instead.",
        tools: ['find_entities', 'batch_enrich', 'web_search', 'upsert_rows', 'query_dataset'],
        frames: ['competitors'],
      }),
      step({
        id: 'financing',
        text: 'Financing: the last round and any new financing news (Crunchbase or PitchBook when connected, fetch_signed_in; press otherwise) into Financing events (upsert_rows, key Event), investor activity and bridge or extension signals, and comparable market multiples for the next-round view.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'upsert_rows', 'place_card'],
        frames: ['financing'],
      }),
      step({
        id: 'sweep',
        text: 'A red-flag sweep: search layoffs, litigation, regulator actions, security incidents and executive departures so Critic has sources to clear or raise each flag.',
        tools: ['web_search', 'fetch_url', 'place_card'],
        frames: ['risks', 'team'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain (a customer, a round, a market question): deep_research (core or above, per the tier). Ask before spend over $0.50.',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      step({
        id: 'start',
        text: "Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) and query the KPI tracker and Signal log (query_dataset) before judging anything.",
        tools: ['board_map', 'search_board', 'read_card', 'query_board', 'query_dataset'],
      }),
      step({
        id: 'red-flags',
        text: 'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card in Next check-in. You cannot tick the checklist: the user does.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['risks', 'team', 'competitors'],
      }),
      step({
        id: 'reported-vs-verified',
        text: 'Challenge every KPI that is Reported only: link it with "tension" to the card that disagrees, or place a Question asking for the second source. Look for KPIs that quietly disappeared from the update or changed definition. Where the signals show the original thesis breaking, link them to the thesis hypothesis with "contradicts".',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['kpis', 'financing', 'thesis'],
      }),
      step({
        id: 'gaps',
        text: 'Turn every gap into a Question card in Next check-in, with a link to the card or gap that prompted it.',
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
        text: 'Charts bound to the KPI tracker: actual over time per metric (line) and variance to plan (bar); and funding by competitor (bar) bound to Competitor moves.',
        tools: ['place_card', 'query_dataset'],
        frames: ['kpis', 'competitors'],
      }),
      step({
        id: 'positioning',
        text: 'The positioning 2x2 (framework, quadrant) with the company and its competitors placed from the Competitor moves database.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['competitors'],
      }),
      step({
        id: 'runway',
        text: 'A runway chart: cash after each Financing events row against the burn, with the month the cash runs out.',
        tools: ['place_card', 'query_dataset'],
        frames: ['financing'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual summary (a design frame): status call, the six headline numbers, the KPIs off plan and the top risks, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['status', 'kpis'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...MONITOR_RUBRIC],
  redFlags: [...MONITOR_FLAGS],

  output: {
    memoTitle: 'Portfolio update: {{company}}',
    citationRule:
      'Every paragraph cites cards; every number cites its source; reported and verified figures are marked as such.',
    sections: [
      { id: 'status', title: 'Status & call', frames: ['status', 'actions'], words: 150, guidance: 'The status call, the health score, what changed, the top 3 reasons and the top 3 risks, in at most 150 words.' },
      { id: 'kpis', title: 'KPIs against plan', frames: ['kpis'], guidance: 'The KPI table with plan, actual and variance, reported against verified, with the charts.' },
      { id: 'thesis', title: 'Thesis check', frames: ['thesis'], guidance: 'Each original hypothesis, the evidence for and against, and what changed since the investment.' },
      { id: 'signals', title: 'News & signals', frames: ['signals'], guidance: 'The notable signals since the last check, with their impact.' },
      { id: 'team', title: 'Team & hiring', frames: ['team'], guidance: 'Joiners, leavers, open roles and leadership gaps.' },
      { id: 'customers', title: 'Customers & product', frames: ['customers'], guidance: 'Wins, losses, reviews, releases and pricing.' },
      { id: 'competitors', title: 'Competitors', frames: ['competitors'], guidance: 'What rivals did and the positioning 2x2.' },
      { id: 'financing', title: 'Financing & runway', frames: ['financing'], guidance: 'Cash, burn, runway, the last round and the outlook for the next one.' },
      { id: 'risks', title: 'Risks & mitigants', frames: ['risks'], guidance: 'The red-flag outcomes: each raised flag with its mitigant, and the cleared ones in one line.' },
      { id: 'scorecard', title: 'Health scorecard', frames: ['actions'], guidance: 'The rubric table: each dimension, its weight, its score and its evidence.' },
      { id: 'actions', title: 'Actions & asks', frames: ['actions', 'questions'], guidance: 'The action items with owners and dates, and the asks to the founders.' },
      { id: 'next', title: 'Questions for the next check-in', frames: ['questions'], guidance: 'The ranked questions and what to look at next time.' },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page update: {{company}}',
      includes: ['Status call', 'Headline numbers', 'Off-plan KPIs', 'Top risks', 'Actions'],
    },
    deckFormat: 'portfolio-review',
  },

  tiers: tiersFor({
    quick:
      'A fast check: the company site, recent news and the KPIs you provided, search and extract only, no deep research or competitor discovery, at most 12 cards per frame, and the memo is the summary only. No monitors.',
    standard:
      'Quick, plus competitor discovery and enrichment, one or two deep-research runs (core) and monitors when you ask for them, asking before spend.',
    deep:
      'Standard, plus pro or ultra deep research on customers, financing and the market, and the full portfolio update.',
  }),

  followUps: [
    {
      label: 'Watch this company',
      prompt: 'Set up monitoring for {{company}} between check-ins: news, funding, layoffs, lawsuits and launches. Tell me the cost before you start.',
    },
    {
      label: 'Refresh since last check',
      prompt: 'Refresh {{company}}: what happened since the last check, which KPIs moved against plan and whether the status call changes.',
    },
    {
      label: 'Draft the board prep',
      prompt: 'Draft my board prep for {{company}}: the five questions to ask, linked to the gaps and risks on the board, with what a good answer looks like.',
    },
    {
      label: 'Draft a note to the founders',
      prompt: 'Draft a short note to the {{company}} founders: what we noticed, what we need to understand and what we can help with.',
    },
    {
      label: 'Assess the next round',
      prompt: 'Assess the next {{company}} round: likely size, valuation range against comparable multiples, who might lead and the risk of a down round.',
    },
    {
      label: 'Compare to [portfolio company]',
      prompt: 'Compare {{company}} to [portfolio company] on growth, burn, runway and team, side by side with a table.',
    },
  ],

  signedIn: [
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'New rounds, investors, headcount and acquisitions.' },
    { domain: 'linkedin.com', label: 'LinkedIn', use: 'Joiners, leavers, open roles and executive profiles.' },
    { domain: 'pitchbook.com', label: 'PitchBook', use: 'Valuations, comparable deals and investor activity.' },
    { domain: 'g2.com', label: 'G2', use: 'Customer reviews and ratings over time.' },
  ],

  monitor: {
    query: '{{company}} funding, layoffs, lawsuits, executive changes, customer wins and product launches',
    why: 'News between check-ins that changes the status call.',
  },
};
