/**
 * Fundraising prep (P6.13, startup / product): the founder's side of a round. Human-readable spec:
 * docs/templates/fundraising-prep.md (generated: `pnpm templates:docs`). It is the mirror of the VC due-diligence
 * template: it prepares the company for the diligence that template runs.
 *
 * Parallel use: find_entities and batch_enrich for comparable rounds and the investor target list, deep_research for
 * market and valuation gaps, a monitor (Orb, on request) on investors and comparable rounds. Signed-in: Crunchbase,
 * PitchBook, LinkedIn.
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

export const FP_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'story',
    name: 'Narrative',
    weight: 15,
    anchors: {
      1: 'A list of features with no why-now.',
      3: 'A clear problem, product and market.',
      5: 'A story investors repeat: insight, why now, why us.',
    },
    frame: 'story',
  },
  {
    id: 'traction',
    name: 'Traction proof',
    weight: 25,
    anchors: {
      1: 'Claims with no data.',
      3: 'Real numbers from the company\'s own records.',
      5: 'Numbers reconciled to bank or billing data, with cohorts.',
    },
    frame: 'traction',
  },
  {
    id: 'market',
    name: 'Market and competition',
    weight: 15,
    anchors: {
      1: 'Top-down TAM and no competitors named.',
      3: 'Sized both ways; competitors mapped.',
      5: 'A bottom-up size and an honest map of where we win.',
    },
    frame: 'market',
  },
  {
    id: 'plan',
    name: 'Financial plan',
    weight: 15,
    anchors: {
      1: 'No model, or one that does not tie to the ask.',
      3: 'A model with the use of funds and runway.',
      5: 'Scenarios, milestones per tranche, and a runway buffer.',
    },
    frame: 'plan',
  },
  {
    id: 'valuation',
    name: 'Valuation realism',
    weight: 15,
    anchors: {
      1: 'Far above comparable rounds with no reason.',
      3: 'Within the comparable range.',
      5: 'Justified by comparable rounds and a clear growth case.',
    },
    frame: 'comps',
  },
  {
    id: 'room',
    name: 'Data room readiness',
    weight: 15,
    anchors: {
      1: 'Documents scattered or missing.',
      3: 'Most of the standard documents ready.',
      5: 'A complete, indexed data room that matches the deck.',
    },
    frame: 'room',
  },
];

export const FP_RED_FLAGS = redFlags([
  [
    'A number in the deck does not match the model or the data.',
    'Compare every deck figure with the KPIs database and the financial model; a mismatch is raised.',
  ],
  [
    'Traction is claimed but not backed by bank, billing or analytics data.',
    'Check the KPIs database Basis column; claimed-only numbers are raised.',
  ],
  [
    'The market is sized top-down only.',
    'Check the Market frame for a bottom-up build with its assumptions.',
  ],
  [
    'Runway at the start of the raise is under six months.',
    'Compute runway from cash and burn in the Runway scenarios; under six months weakens the negotiating position and is raised.',
  ],
  [
    'The valuation ask is above comparable rounds with no justification.',
    'Compare the implied multiple with the Comparable rounds database; raise when above the 75th percentile without a stated reason.',
  ],
  [
    'The use of funds does not tie to milestones or runway.',
    'Check that each Use of funds row has a milestone and that the months of runway add up.',
  ],
  [
    'No competitors are named, or only the weak ones.',
    'Compare the competitor list with what investors will find: funded rivals and incumbents.',
  ],
  [
    'A cap table problem: heavy dilution, dead equity or unusual terms.',
    'If a cap table was dropped, read it (query_dataset): founder share, option pool, SAFEs and notes, preferences. Otherwise mark "no cap table provided".',
  ],
  [
    'The investor list is long but none is a fit for the stage, sector and cheque.',
    'Check Investor targets for rows with Stage fit and Sector fit both high; fewer than five is raised.',
  ],
  [
    'IP, contractor or employee agreements are missing from the data room.',
    'Check the Data room checklist for IP assignment, founder vesting and contractor agreements.',
  ],
  [
    'Customer concentration, or a single key customer, is not disclosed.',
    'Look in the KPIs and the materials for revenue by customer; undisclosed concentration is raised.',
  ],
  [
    'Metrics are stale: older than the last full month.',
    'Check the Period of each KPIs row; stale rows are marked and a Question asks for a refresh.',
  ],
]);

export const FUNDRAISING_PREP: TemplateSpecInput = {
  id: 'fundraising-prep',
  label: 'Fundraising prep',
  dot: '#2563EB',
  placeholder: 'Which company is raising?',
  brief:
    'Prepare a company to raise a round: the narrative, the traction proved against the company\'s own data, the ' +
    'market and competition, comparable rounds and a defensible valuation range, the financial plan and ' +
    'the use of funds, the investor target list, the deck and data room, the hard questions to rehearse, and a ' +
    'process and timeline. Look at the company the way an investor will during diligence: find the weak numbers ' +
    'before they do, and never state a figure that the data does not support.',
  titleFrom: '{{company}}: fundraising prep',

  inputs: [
    {
      id: 'company',
      label: 'Company name',
      kind: 'text',
      required: true,
      placeholder: 'Acme Robotics',
      maxLength: 70,
    },
    {
      id: 'website',
      label: 'Website URL',
      kind: 'url',
      required: true,
      placeholder: 'https://acme.com',
      maxLength: 300,
    },
    {
      id: 'stage',
      label: 'Round',
      kind: 'select',
      options: ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Bridge'],
      maxLength: 40,
    },
    {
      id: 'raise',
      label: 'Amount you want to raise',
      kind: 'text',
      placeholder: '$4M',
      group: 'round',
      maxLength: 80,
    },
    {
      id: 'valuation',
      label: 'Valuation in mind',
      kind: 'text',
      placeholder: '$20M post',
      group: 'round',
      maxLength: 80,
    },
    {
      id: 'sector',
      label: 'Sector',
      kind: 'text',
      placeholder: 'Robotics, logistics',
      suggestions: ['SaaS', 'Fintech', 'Healthcare', 'Climate', 'AI infrastructure', 'Consumer', 'Developer tools'],
      maxLength: 120,
    },
    { id: 'geography', label: 'HQ and region', kind: 'text', placeholder: 'Berlin, EU', maxLength: 120 },
    {
      id: 'traction',
      label: 'Traction so far',
      kind: 'longtext',
      placeholder: '$30k MRR, 22 customers, growing 12% a month',
      maxLength: 800,
    },
    {
      id: 'use',
      label: 'What the money is for',
      kind: 'longtext',
      placeholder: 'Two engineers, a sales lead, 18 months of runway',
      maxLength: 800,
    },
    {
      id: 'investors',
      label: 'Investors you already have in mind',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout finds more that fit the stage, sector and cheque.',
      maxLength: 800,
    },
    {
      id: 'concerns',
      label: 'What worries you about the raise',
      kind: 'longtext',
      placeholder: 'Churn in the SMB segment; a larger competitor just raised',
      maxLength: 800,
    },
    materialsField(
      'Drop the pitch deck, the financial model (CSV or XLSX), the cap table (CSV or XLSX), KPI exports and any data-room documents. Each becomes a card or database; deck numbers are tagged Claimed.',
    ),
    depthField,
    sitesField([
      { domain: 'crunchbase.com', label: 'Crunchbase' },
      { domain: 'pitchbook.com', label: 'PitchBook' },
      { domain: 'linkedin.com', label: 'LinkedIn' },
    ]),
  ],

  frames: [
    {
      id: 'plan-summary',
      title: 'Raise plan',
      color: 'signal',
      brief:
        'The round in numbers: the amount ({{raise|to confirm}}), the valuation in mind ({{valuation|to confirm}}), ' +
        'the round ({{stage|to confirm}}), the timeline, the runway and what the money buys ({{use|to confirm}}). ' +
        'Concerns to probe: {{concerns|none given}}.',
      owners: ['orb'],
      targets: [
        { type: 'metric', min: 5 },
        { type: 'entity', min: 1, note: 'the company' },
        { type: 'doc', min: 1, note: 'the round summary' },
      ],
      seeds: [
        {
          type: 'entity',
          data: {
            title: '{{company}}',
            kind: 'org',
            url: '{{website}}',
            location: '{{geography|}}',
            body: 'The company raising, from your intake.',
            facts: [
              { label: 'Round', value: '{{stage|to confirm}}' },
              { label: 'Raise', value: '{{raise|to confirm}}' },
              { label: 'Valuation in mind', value: '{{valuation|to confirm}}' },
              { label: 'Sector', value: '{{sector|to confirm}}' },
            ],
          },
          why: 'The company, from your intake.',
        },
        {
          type: 'doc',
          data: {
            title: 'Round summary',
            body: '{{company}} is raising {{raise|an amount to confirm}} ({{stage|round to confirm}}) at {{valuation|a valuation to confirm}}. Traction so far: {{traction|to confirm}}. Use of funds: {{use|to confirm}}.',
          },
          why: 'The summary, from your intake. orb rewrites it from the evidence.',
        },
        metric('Target raise', 'The amount, from the intake; reconcile with the use of funds.'),
        metric('Valuation in mind', 'Post-money, with the basis (comparable rounds).'),
        metric('Cash and burn', 'Cash in the bank and net monthly burn, with the date.'),
        metric('Runway', 'Months at the current burn, before and after the raise.'),
        metric('Raise timeline', 'Weeks from first outreach to money in the bank.'),
        question('What must be true about the company at the end of this round?', 'Name the milestone that makes the next round easy.'),
      ],
      room: 300,
    },
    {
      id: 'story',
      title: 'Story & narrative',
      color: 'sky',
      brief:
        'The story in the order investors need it: the problem, the insight, why now, the product, why this team, ' +
        'the market, the traction, the ask. One sentence each, every claim backed by a card on this board. Write what ' +
        'makes the company different in one line.',
      owners: ['orb', 'builder'],
      targets: [
        { type: 'doc', min: 2, note: 'the narrative and the one-liner' },
        { type: 'hypothesis', min: 3, note: 'why now, why us, why this market' },
        { type: 'framework', min: 1, note: 'SWOT' },
      ],
      seeds: [
        {
          type: 'doc',
          data: {
            title: 'One-liner',
            body: '{{company}} helps [customer] [do something] by [how]. orb writes it from the evidence.',
          },
          why: 'The one-sentence description.',
        },
        hypothesis('Why now: a shift makes {{company}} possible today', 'The technology, regulatory or behaviour shift, with evidence.'),
        hypothesis('Why us: this team has an edge nobody else has', 'Founder-market fit and unfair advantage, with evidence.'),
        hypothesis('Why this market: it is large and growing fast enough', 'The size and growth, with a bottom-up build.'),
        framework('SWOT: {{company}}', 'swot'),
      ],
    },
    {
      id: 'traction',
      title: 'Traction & metrics',
      color: 'rho',
      brief:
        'The numbers investors will test: revenue or ARR, growth, customers, retention, churn, CAC, LTV, payback, gross ' +
        'margin, burn and runway. Separate Claimed from Verified, and reconcile the deck with the model and the data. Traction ' +
        'as given: {{traction|to confirm}}.',
      owners: ['orb', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'KPIs with Basis filled' },
        { type: 'metric', min: 6 },
        { type: 'chart', min: 1, note: 'bound to the KPIs database' },
      ],
      seeds: [
        db('KPIs', 'kpis'),
        metric('ARR', 'Claimed or verified; period and source.'),
        metric('Growth', 'MoM or YoY, with the period.'),
        metric('Net revenue retention', 'Cohort basis if known.'),
        metric('Gross margin', 'Percent, with how it is computed.'),
        metric('CAC payback', 'Months, with the basis.'),
        metric('Customers', 'Paying customers now, with the date.'),
        chart('KPIs over time', 'kpis', 'line', 'Period', 'Value', 'Metric'),
        question('Which of these numbers could an investor verify from our own data today?'),
      ],
    },
    {
      id: 'market',
      title: 'Market & competition',
      color: 'sky',
      brief:
        'TAM, SAM and SOM sized top-down and bottom-up with the assumptions, growth and why now; and the competitors ' +
        'investors will compare us with: direct, indirect, incumbents and substitutes, their funding and how we ' +
        'win. Be honest: name the funded rivals.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'metric', min: 4, note: 'TAM, SAM, SOM, growth' },
        { type: 'database', min: 1, note: 'Competitors, at least 8 rows' },
        { type: 'framework', min: 1, note: 'the 2x2' },
        { type: 'chart', min: 1, note: 'funding by competitor' },
      ],
      seeds: [
        metric('TAM', 'Cite the source and the method.'),
        metric('SAM', 'The part of the TAM we can serve; show the filter.'),
        metric('SOM', 'What is winnable in 3 to 5 years, bottom-up.'),
        metric('Market growth', 'CAGR with its period.'),
        db('Competitors', 'competitors'),
        chart('Total funding by competitor', 'competitors', 'bar', 'Name', 'Total funding'),
        framework('Positioning 2x2', 'quadrant', { xAxis: 'Product breadth', yAxis: 'Go-to-market strength' }),
      ],
    },
    {
      id: 'comps',
      title: 'Comparable rounds & valuation',
      color: 'rho',
      brief:
        'Rounds of comparable companies (stage, sector, region, time) with amount, valuation and revenue at the round, ' +
        'the median and the range, and what valuation range {{company}} can defend. Show how the implied multiple ' +
        'compares. A comparable older than 24 months is marked.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Comparable rounds, at least 15 rows' },
        { type: 'chart', min: 1, note: 'valuation by comparable' },
        { type: 'metric', min: 3, note: 'median, range, our implied multiple' },
      ],
      seeds: [
        db('Comparable rounds', 'rounds'),
        chart('Valuation by comparable', 'rounds', 'bar', 'Company', 'Valuation'),
        metric('Median comparable valuation', 'Median of the Comparable rounds database, with the date range.'),
        metric('Defensible range', 'Low to high valuation we can argue, with the basis.'),
        metric('Our implied multiple', 'Valuation divided by ARR; compare with the comps.'),
      ],
    },
    {
      id: 'plan',
      title: 'Financial plan & use of funds',
      color: 'sky',
      brief:
        'Where the money goes and what it buys: the use of funds by category with the milestone each reaches, the ' +
        'runway under three scenarios, and the burn plan. The use of funds: {{use|to confirm}}. Show the formula and mark every ' +
        'assumption.',
      owners: ['orb', 'builder'],
      targets: [
        { type: 'database', min: 2, note: 'Use of funds, Runway scenarios' },
        { type: 'chart', min: 1, note: 'use of funds' },
        { type: 'math', min: 1, note: 'the runway formula' },
      ],
      seeds: [
        db('Use of funds', 'funds'),
        db('Runway scenarios', 'runway'),
        chart('Use of funds by category', 'funds', 'pie', 'Category', 'Amount'),
        {
          type: 'math',
          data: {
            title: 'Runway and dilution',
            latex: '\\text{runway (months)} = \\frac{\\text{cash}}{\\text{net monthly burn}},\\quad \\text{dilution} = \\frac{\\text{raise}}{\\text{post-money valuation}}',
            body: 'Cash and burn come from the model and the bank data; each scenario states its burn assumption.',
          },
          why: 'The formulas, so the scenarios can be checked.',
        },
      ],
    },
    {
      id: 'terms',
      title: 'Valuation, dilution & terms',
      color: 'rho',
      brief:
        'What the founders keep: dilution under three raise sizes and valuations, the option pool, the instruments ' +
        '(SAFE, convertible note, priced round) and the key terms to expect and to negotiate. Read the cap table if ' +
        'one was dropped. General information, not legal advice.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Dilution scenarios' },
        { type: 'checklist', min: 1, note: 'key terms' },
        { type: 'source', min: 3, note: 'market term data' },
      ],
      seeds: [
        db('Dilution scenarios', 'dilution'),
        checklist('Key terms to understand', [
          'Valuation cap or pre-money valuation, and what it implies.',
          'Option pool size and whether it is in the pre-money.',
          'Liquidation preference and participation.',
          'Pro-rata and information rights.',
          'Board composition and protective provisions.',
          'Vesting and any founder re-vesting.',
        ]),
      ],
    },
    {
      id: 'investors',
      title: 'Investor targets',
      color: 'sky',
      brief:
        'Who to approach: funds and angels that invest at this stage, sector and cheque size, their recent deals and ' +
        'portfolio conflicts, and the warm path in. Public information only; no private contact details. Rank by ' +
        'fit. Investors in mind: {{investors|none given}}.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Investor targets, at least 25 rows' },
        { type: 'entity', min: 5, note: 'the top investors, kind org' },
        { type: 'chart', min: 1, note: 'targets by status' },
      ],
      seeds: [
        db('Investor targets', 'targets'),
        chart('Investor targets by status', 'targets', 'bar', 'Status'),
        question('Who has led a round like this in the last 18 months, and who do we know that knows them?'),
      ],
    },
    {
      id: 'room',
      title: 'Deck & data room',
      color: 'rho',
      brief:
        'What investors will ask to see: the pitch deck outline, a one-page summary and the data room with its standard ' +
        'documents. Each item is ready, missing or inconsistent with another; the deck must match the model and the KPIs.',
      owners: ['builder', 'orb'],
      targets: [
        { type: 'checklist', min: 2, note: 'deck outline and data room' },
        { type: 'design', min: 1, note: 'a one-page summary' },
      ],
      seeds: [
        checklist('Deck outline', [
          'Title and the one-liner',
          'Problem',
          'Solution and product',
          'Why now',
          'Market',
          'Business model',
          'Traction',
          'Competition',
          'Go-to-market',
          'Team',
          'Financials and the plan',
          'The ask and the use of funds',
        ]),
        checklist('Data room', [
          'Pitch deck and one-pager',
          'Financial model with assumptions',
          'Cap table (current and pro forma)',
          'KPI and cohort exports',
          'Customer contracts and references',
          'Founder vesting and employee agreements',
          'IP assignment and licences',
          'Corporate documents and past financing terms',
          'Security and privacy policies',
        ]),
      ],
    },
    {
      id: 'questions',
      title: 'Hard questions',
      color: 'paper',
      brief:
        'Work through the red-flag checklist the way an investor would: raise each flag as a Risk card with evidence ' +
        'or clear it with a source. Then the hard questions investors will ask, each with the card that answers it, ranked.',
      owners: ['critic', 'orb'],
      targets: [
        { type: 'risk', min: 6, note: 'every checklist item cleared with a source or raised' },
        { type: 'question', min: 10, note: 'the questions investors will ask' },
      ],
      seeds: [
        checklist(
          'Red-flag checklist',
          FP_RED_FLAGS.map((f) => `${f.id} ${f.text}`),
          'Critic raises or clears each; you tick them off.',
        ),
        emptyRisk('Traction'),
        emptyRisk('Market'),
        emptyRisk('Valuation'),
        emptyRisk('Team'),
        emptyRisk('Legal and cap table'),
      ],
    },
    {
      id: 'process',
      title: 'Process & decision',
      color: 'signal',
      brief:
        'The plan for the raise: when to start, how to run a tight process, the weekly milestones, and whether to raise ' +
        'now, wait, bridge or look at another form of financing. Score the company\'s readiness against the rubric with ' +
        'cited evidence.',
      owners: ['orb'],
      targets: [
        { type: 'decision', min: 1 },
        { type: 'matrix', min: 1, note: 'the filled readiness rubric' },
        { type: 'timeline', min: 1, note: 'raise process' },
        { type: 'insight', min: 3 },
      ],
      seeds: [
        timeline('Raise process', 'Preparation started', 'orb adds dated milestones: materials ready, first meetings, term sheets, close.'),
        {
          type: 'decision',
          data: {
            title: 'Should {{company}} raise now?',
            body: 'Open. orb proposes after the readiness rubric is filled and writes the weighted total in the rationale.',
            options: [
              { label: 'Start the process now' },
              { label: 'Fix the gaps first, then start' },
              { label: 'Raise a small bridge' },
              { label: 'Consider non-dilutive financing' },
            ],
            status: 'open',
          },
          why: 'Open decision: you choose; orb proposes.',
        },
        {
          type: 'matrix',
          data: {
            title: 'Investor readiness (rubric score x 2, so 10 is a 5)',
            criteria: FP_RUBRIC.map((d) => ({ name: `${d.name} (${d.weight}%)`, weight: d.weight })),
            options: [
              { name: 'orb score', scores: FP_RUBRIC.map(() => null) },
              { name: 'Your score', scores: FP_RUBRIC.map(() => null) },
            ],
          },
          why: 'orb fills one score per dimension with cited evidence; you may override.',
        },
      ],
    },
  ],

  databases: [
    {
      key: 'kpis',
      name: 'KPIs',
      frame: 'traction',
      purpose: 'Every traction figure with its period, whether it is claimed or verified, and its source.',
      keyColumn: 'Metric',
      columns: [
        { name: 'Metric', type: 'text' },
        { name: 'Value', type: 'number' },
        { name: 'Period', type: 'date', note: 'ISO date or year-month.' },
        { name: 'Basis', type: 'enum', options: ['Claimed', 'Verified'], note: 'Deck numbers are Claimed until reconciled.' },
        { name: 'Source', type: 'text', note: 'The file, the billing export or the bank statement.' },
        { name: 'Matches the deck', type: 'enum', options: ['Yes', 'No', 'Not in the deck'] },
        { name: 'Note', type: 'text' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Period', dir: 'asc' }] },
        { name: 'Claimed vs verified', kind: 'board', group: 'Basis' },
        { name: 'Deck mismatches', kind: 'table', filter: [{ column: 'Matches the deck', op: 'eq', value: 'No' }] },
      ],
    },
    {
      key: 'competitors',
      name: 'Competitors',
      frame: 'market',
      purpose: 'Direct and indirect competitors investors will compare the company with. Discovered with find_entities and enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'URL', type: 'url' },
        { name: 'Category', type: 'enum', options: ['Direct', 'Indirect', 'Incumbent', 'Substitute'] },
        { name: 'Founded', type: 'number' },
        { name: 'Total funding', type: 'currency', note: 'US dollars.' },
        { name: 'Last round', type: 'text' },
        { name: 'Headcount', type: 'number' },
        { name: 'How we win', type: 'text' },
        { name: 'Threat level', type: 'rating', note: '1 (low) to 5 (high).' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Total funding', dir: 'desc' }] },
        { name: 'By category', kind: 'board', group: 'Category' },
      ],
    },
    {
      key: 'rounds',
      name: 'Comparable rounds',
      frame: 'comps',
      purpose: 'Recent rounds of comparable companies, to set the valuation range. Discovered with find_entities and enriched with batch_enrich.',
      keyColumn: 'Company',
      columns: [
        { name: 'Company', type: 'text' },
        { name: 'Round', type: 'text' },
        { name: 'Date', type: 'date' },
        { name: 'Amount', type: 'currency' },
        { name: 'Valuation', type: 'currency', note: 'Post-money, US dollars.' },
        { name: 'Revenue at the round', type: 'currency' },
        { name: 'Revenue multiple', type: 'number' },
        { name: 'Lead investors', type: 'text' },
        { name: 'Why comparable', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'By date', kind: 'table', sort: [{ column: 'Date', dir: 'desc' }] },
        { name: 'By multiple', kind: 'table', sort: [{ column: 'Revenue multiple', dir: 'desc' }] },
      ],
    },
    {
      key: 'funds',
      name: 'Use of funds',
      frame: 'plan',
      purpose: 'Where the raise goes, with the milestone each line buys.',
      keyColumn: 'Category',
      columns: [
        { name: 'Category', type: 'text', note: 'Engineering, sales, marketing, operations, runway buffer.' },
        { name: 'Amount', type: 'currency' },
        { name: 'Share of the raise (%)', type: 'number' },
        { name: 'Hires or spend', type: 'text' },
        { name: 'Milestone it buys', type: 'text' },
        { name: 'By when', type: 'date' },
      ],
      views: [{ name: 'All', kind: 'table', sort: [{ column: 'Amount', dir: 'desc' }] }],
    },
    {
      key: 'runway',
      name: 'Runway scenarios',
      frame: 'plan',
      purpose: 'Runway and the milestone reached under each scenario; every assumption is written in the row.',
      keyColumn: 'Scenario',
      columns: [
        { name: 'Scenario', type: 'enum', options: ['Base', 'Upside', 'Downside'] },
        { name: 'Cash after the raise', type: 'currency' },
        { name: 'Net monthly burn', type: 'currency' },
        { name: 'Runway (months)', type: 'number' },
        { name: 'Revenue growth assumed (%)', type: 'number' },
        { name: 'Milestone reached', type: 'text' },
        { name: 'Assumption', type: 'text' },
      ],
      views: [{ name: 'All', kind: 'table' }],
    },
    {
      key: 'dilution',
      name: 'Dilution scenarios',
      frame: 'terms',
      purpose: 'What the founders keep at different raise sizes and valuations.',
      keyColumn: 'Scenario',
      columns: [
        { name: 'Scenario', type: 'text' },
        { name: 'Raise', type: 'currency' },
        { name: 'Pre-money valuation', type: 'currency' },
        { name: 'Post-money valuation', type: 'currency' },
        { name: 'Dilution (%)', type: 'number' },
        { name: 'Option pool added (%)', type: 'number' },
        { name: 'Founders own after (%)', type: 'number' },
        { name: 'Instrument', type: 'enum', options: ['Priced round', 'SAFE', 'Convertible note'] },
      ],
      views: [{ name: 'By dilution', kind: 'table', sort: [{ column: 'Dilution (%)', dir: 'asc' }] }],
    },
    {
      key: 'targets',
      name: 'Investor targets',
      frame: 'investors',
      purpose: 'Funds and angels that fit the stage, sector and cheque, ranked. Public information only. Discovered with find_entities and enriched with batch_enrich.',
      keyColumn: 'Investor',
      columns: [
        { name: 'Investor', type: 'text' },
        { name: 'Type', type: 'enum', options: ['Seed fund', 'Venture fund', 'Angel', 'Corporate', 'Accelerator'] },
        { name: 'Stage fit', type: 'rating', note: '1 to 5.' },
        { name: 'Sector fit', type: 'rating', note: '1 to 5.' },
        { name: 'Typical cheque (USD)', type: 'currency' },
        { name: 'Recent relevant deals', type: 'text' },
        { name: 'Portfolio conflict', type: 'text' },
        { name: 'Warm path', type: 'text', note: 'Who can introduce; no private contact details.' },
        { name: 'Status', type: 'enum', options: ['Researching', 'Intro asked', 'Meeting set', 'In diligence', 'Passed', 'Term sheet'] },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'By fit', kind: 'table', sort: [{ column: 'Stage fit', dir: 'desc' }] },
        { name: 'Pipeline', kind: 'board', group: 'Status' },
        { name: 'Strong fit', kind: 'table', filter: [{ column: 'Sector fit', op: 'gte', value: 4 }] },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text: 'Read the uploaded materials first: the deck, the financial model, the cap table, KPI exports and data-room files (board_map, read_card, read_source, query_dataset). Put every deck number into the KPIs database (upsert_rows) with Basis "Claimed", and every number you can tie to a dropped export or the model with Basis "Verified" and the file as Source. Note any deck number that does not match the model in Matches the deck. Hand the company, the round and the investors in mind to Scout in the delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['traction'],
      }),
      orbDelegate(
        'Scout first (market, comparable rounds, investor targets), Builder once KPIs has rows, Critic once Scout has sources to review.',
      ),
      step({
        id: 'plan-summary',
        text: 'Fill the raise-plan metrics from the intake and the model (update_card): target raise, valuation in mind, cash and burn, runway. Write the use of funds (upsert_rows, key Category) so it adds up to the raise and each line names its milestone.',
        tools: ['query_dataset', 'update_card', 'upsert_rows', 'query_board'],
        frames: ['plan-summary', 'plan'],
      }),
      step({
        id: 'story',
        text: 'Write the narrative and the one-liner from the evidence (update_card): problem, insight, why now, why us. Link the evidence for and against each of the three hypotheses (add_link supports or contradicts) and set their confidence. Never state a figure the board does not support.',
        tools: ['query_board', 'search_board', 'read_card', 'update_card', 'add_link', 'place_card'],
        frames: ['story'],
      }),
      step({
        id: 'valuation',
        text: 'Compute the median and range of the Comparable rounds (query_dataset), the implied multiple and three dilution scenarios (Dilution scenarios rows, upsert_rows); update the valuation metrics. Mark the range as a negotiating range, not advice.',
        tools: ['query_dataset', 'upsert_rows', 'update_card'],
        frames: ['comps', 'terms'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (a market size, comparable rounds in a niche), run deep_research (core) on that one question.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'readiness',
        text: 'Fill the Investor readiness matrix: one 1-to-5 score per rubric dimension (doubled), each with a cited card. Then the SWOT, the Decision with the weighted total in the rationale, the Raise process timeline (dated milestones), and the hard questions each with the card that answers it.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['process', 'questions'],
      }),
      orbMemo,
      orbMonitor,
    ],
    scout: [
      step({
        id: 'company',
        text: 'The company\'s own site and public record first (fetch_url, capture_page): what is claimed publicly about the product, customers and team, so the deck can be checked against it. Source cards for what matters.',
        tools: ['fetch_url', 'parallel_extract', 'capture_page', 'place_card'],
        frames: ['market'],
      }),
      step({
        id: 'competitors',
        text: 'Competitors: those the user named, then find_entities and batch_enrich (founded, funding, last round, headcount) for the rest of the funded field; consolidate into Competitors (upsert_rows, key Name) with a Source url. Crunchbase or PitchBook only via fetch_signed_in, and only if the user ticked them. Quick scan: find_entities and batch_enrich are refused; read the named ones.',
        tools: ['find_entities', 'batch_enrich', 'fetch_signed_in', 'web_search', 'upsert_rows', 'query_dataset'],
        frames: ['market'],
      }),
      step({
        id: 'market',
        text: 'Market sizing: at least one independent report; every TAM, SAM, SOM and growth figure is a metric card with its source and method; build the bottom-up size from the customer count and price and say so.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'web_answer', 'place_card'],
        frames: ['market'],
      }),
      step({
        id: 'comps',
        text: 'Comparable rounds: find_entities for companies of the same stage, sector and region that raised in the last 24 months; batch_enrich amount, valuation, revenue at the round, lead investors; consolidate into Comparable rounds (upsert_rows, key Company) with a Source url and Why comparable. Quick scan: find_entities is refused; add rows from press search.',
        tools: ['find_entities', 'batch_enrich', 'fetch_signed_in', 'web_search', 'upsert_rows', 'query_dataset'],
        frames: ['comps'],
      }),
      step({
        id: 'investors',
        text: 'Investor targets: find_entities for funds and angels that led or joined rounds like this in the last 18 months; batch_enrich the type, typical cheque, recent deals and portfolio conflicts; consolidate into Investor targets (upsert_rows, key Investor) with fit scores and a Source url. Public information only: no private contact details, no personal emails or phone numbers. An entity card for the top five.',
        tools: ['find_entities', 'batch_enrich', 'fetch_signed_in', 'web_search', 'place_card', 'upsert_rows'],
        frames: ['investors'],
        minTier: 'standard',
      }),
      step({
        id: 'terms',
        text: 'Terms: current market terms for the round (SAFE caps, option pools, preferences) from reputable public sources, as Source cards; the key-terms checklist items each cite one. Say clearly this is general information, not legal advice.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card'],
        frames: ['terms'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain: deep_research (core or above, per the tier), for example the valuation range in a niche.',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      criticStart,
      criticFlags(['questions', 'traction', 'comps']),
      step({
        id: 'reconcile',
        text: 'Reconcile: read the KPIs database against the deck and the model (query_dataset, read_card). For every number with one source, or a deck number marked as not matching, link it "tension" to the card that disagrees or place a Question for the founder naming the document that would prove it.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['traction', 'questions', 'market'],
      }),
      step({
        id: 'hard-questions',
        text: 'Write the hard questions investors will ask as Question cards, ranked by how much they would hurt (traction quality, market size, competition, valuation, team, legal), each linked to the gap, risk or number that prompted it. You cannot tick the checklist; the user does.',
        tools: ['place_card', 'add_link', 'query_board'],
        frames: ['questions'],
      }),
      criticReport,
    ],
    builder: [
      step({
        id: 'charts',
        text: 'Charts bound to the databases: KPIs over time (line, KPIs), total funding by competitor (bar, Competitors), valuation by comparable (bar, Comparable rounds), use of funds by category (pie, Use of funds).',
        tools: ['place_card', 'query_dataset'],
        frames: ['traction', 'market', 'comps', 'plan'],
      }),
      step({
        id: 'market',
        text: 'The positioning 2x2 (framework, quadrant) and the SWOT from the competitor and traction cards only.',
        tools: ['place_card', 'query_board', 'read_card', 'query_dataset'],
        frames: ['market', 'story'],
      }),
      step({
        id: 'plan',
        text: 'Runway scenarios: Base, Upside and Downside rows (upsert_rows, key Scenario) with cash after the raise, burn, runway and milestone from the model and the stated assumption; no figure without an input on the board.',
        tools: ['upsert_rows', 'query_dataset', 'read_card', 'place_card'],
        frames: ['plan'],
      }),
      step({
        id: 'room',
        text: 'Deck and data room: a one-page summary as a design frame (write_design_frame) from cards only (snapshot, traction, ask, use of funds). Propose checklist items for what is missing from the data room (place a Checklist card; the user ticks).',
        tools: ['write_design_frame', 'place_card', 'query_board', 'read_card'],
        frames: ['room'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...FP_RUBRIC],
  redFlags: [...FP_RED_FLAGS],

  output: {
    memoTitle: 'Fundraising readiness: {{company}}',
    citationRule:
      'Every paragraph cites cards; every number cites its source and says Claimed or Verified; valuations are a range with its basis; terms are general information, not legal advice.',
    sections: [
      {
        id: 'summary',
        title: 'Summary & recommendation',
        frames: ['process', 'questions'],
        words: 150,
        guidance: 'Whether to raise now, the readiness score, the three strengths and the three gaps to fix, in at most 150 words.',
      },
      {
        id: 'plan',
        title: 'The round',
        frames: ['plan-summary'],
        guidance: 'The amount, valuation, timeline, runway and what the money buys.',
      },
      {
        id: 'story',
        title: 'Narrative',
        frames: ['story'],
        guidance: 'The story in investor order: problem, insight, why now, why us.',
      },
      {
        id: 'traction',
        title: 'Traction and metrics',
        frames: ['traction'],
        guidance: 'The KPI table: claimed against verified, with reconciliation to the deck.',
      },
      {
        id: 'market',
        title: 'Market and competition',
        frames: ['market'],
        guidance: 'The market sized both ways and the competitor map with the funded rivals.',
      },
      {
        id: 'comps',
        title: 'Comparable rounds and valuation',
        frames: ['comps'],
        guidance: 'The comparable rounds, the median and range, and the defensible valuation range.',
      },
      {
        id: 'financials',
        title: 'Financial plan and use of funds',
        frames: ['plan'],
        guidance: 'The use of funds with milestones and the runway scenarios.',
      },
      {
        id: 'terms',
        title: 'Dilution and terms',
        frames: ['terms'],
        guidance: 'Founder ownership under each scenario and the key terms to expect.',
      },
      {
        id: 'investors',
        title: 'Investor targets',
        frames: ['investors'],
        guidance: 'The ranked targets, the fit and the warm paths.',
      },
      {
        id: 'room',
        title: 'Deck and data room',
        frames: ['room'],
        guidance: 'What is ready, missing and inconsistent.',
      },
      {
        id: 'risks',
        title: 'Hard questions and red flags',
        frames: ['questions'],
        guidance: 'The red-flag outcomes and the ranked questions with their answers.',
      },
      {
        id: 'scorecard',
        title: 'Readiness scorecard and plan',
        frames: ['process'],
        guidance: 'The rubric table and the dated raise process.',
      },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{company}} fundraising readiness',
      includes: ['The round', 'Readiness score', 'Top gaps', 'Timeline'],
    },
    deckFormat: 'standard',
    deck: {
      title: '{{company}}: pitch deck',
      slides: [
        { title: 'Title and one-liner', brief: 'The company, the one-liner and the round.' },
        { title: 'Problem', brief: 'Who has it, how often and what it costs, with a quote.' },
        { title: 'Solution and product', brief: 'What the product does and a screenshot.' },
        { title: 'Why now', brief: 'The shift that makes this possible today.' },
        { title: 'Market', brief: 'TAM, SAM and SOM with the bottom-up build.' },
        { title: 'Business model', brief: 'How the company makes money and the unit economics.' },
        { title: 'Traction', brief: 'The verified KPIs and the growth chart.' },
        { title: 'Competition', brief: 'The 2x2 and why the company wins.' },
        { title: 'Go-to-market', brief: 'The motion, the channels and the early results.' },
        { title: 'Team', brief: 'The founders and key hires, with proof of fit.' },
        { title: 'Financials and use of funds', brief: 'The use of funds chart, runway and milestones.' },
        { title: 'The ask', brief: 'The amount, the terms in mind and what the round delivers.' },
      ],
    },
  },

  tiers: tiers({
    quick:
      'Review the materials against public sources: no deep research, no investor list, at most 12 cards per frame, and the memo is the summary only.',
    standard:
      'Quick, plus find_entities and batch_enrich for comparable rounds, competitors and investor targets, the plan and dilution scenarios, and one or two deep-research runs (core), asking before spend.',
    deep: 'Standard, plus pro or ultra research on the market and comparable rounds, a larger investor list and the full memo and pitch deck.',
  }),

  followUps: [
    {
      label: 'Rehearse the hard questions',
      prompt: 'Run me through the ten hardest investor questions about {{company}} one at a time, with the best answer from the board for each.',
    },
    {
      label: 'Refresh with the new month',
      prompt: 'I added this month\'s numbers. Update KPIs and the runway, and tell me what changes in the readiness score.',
    },
    {
      label: 'Draft the outreach email',
      prompt: 'Draft a short intro email to [investor] for {{company}} from the one-liner and the traction, with no claim the board cannot support.',
    },
    {
      label: 'Tighten the valuation case',
      prompt: 'Build the strongest honest case for our valuation range from the comparable rounds, and the counter-arguments an investor will make.',
    },
    {
      label: 'Compare the investors',
      prompt: 'Compare [investor] and [investor] for {{company}}: fit, recent deals, conflicts and the warm path.',
    },
    {
      label: 'Watch the funding news',
      prompt: 'Start a monitor on rounds in our space and on our target investors\' new deals.',
    },
  ],

  signedIn: [
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Comparable rounds, competitors\' funding and investor portfolios.' },
    { domain: 'pitchbook.com', label: 'PitchBook', use: 'Round valuations and investor deal history.' },
    { domain: 'linkedin.com', label: 'LinkedIn', use: 'Public investor profiles and the shared connections the user already has.' },
  ],

  monitor: {
    query: '{{sector|our sector}} funding rounds, valuations and new deals by target investors',
    why: 'A round or a deal that moves the valuation range or the investor list.',
  },
};
