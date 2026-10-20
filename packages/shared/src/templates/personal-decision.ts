/**
 * A big personal decision (P6.16): a home, a car, a school, or another large choice. The template frames the
 * decision, weighs criteria, builds the options list, models the true cost, gathers evidence, pre-mortems the risks and
 * ends with a weighted comparison and a decision the user makes. orb collects and compares evidence; it is not a
 * financial, legal or medical adviser and says so. The human-readable spec is docs/templates/personal-decision.md.
 */
import type { RubricDimension, TemplateSpecInput } from './schema.js';
import {
  checklist,
  chartSeed,
  col,
  db,
  decisionSeed,
  depthField,
  doc,
  emptyRisk,
  flagChecklist,
  flags,
  framework,
  hypothesis,
  materialsField,
  matrixSeed,
  metric,
  question,
  scorecard,
  step,
  tiers,
  timelineSeed,
} from './people-kit.js';

export const DECISION_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'cost',
    name: 'Total cost',
    weight: 25,
    anchors: {
      1: 'Over budget or costs that are not known yet.',
      3: 'Within budget with a margin of safety.',
      5: 'Comfortably within budget over the whole holding period, all costs known.',
    },
    frame: 'cost',
  },
  {
    id: 'fit',
    name: 'Fit to your must-haves',
    weight: 25,
    anchors: {
      1: 'Misses a must-have.',
      3: 'Meets the must-haves and some nice-to-haves.',
      5: 'Meets every must-have and most nice-to-haves.',
    },
    frame: 'criteria',
  },
  {
    id: 'risk',
    name: 'Risk and reversibility',
    weight: 20,
    anchors: {
      1: 'Hard to undo and an open serious risk.',
      3: 'Risks are known and bounded; some cost to undo.',
      5: 'Low risk and easy to reverse if it goes wrong.',
    },
    frame: 'risks',
  },
  {
    id: 'value',
    name: 'Long-term value',
    weight: 20,
    anchors: {
      1: 'Loses value or options over time.',
      3: 'Holds its value and options.',
      5: 'Gains in value, options or opportunity over time.',
    },
    frame: 'evidence',
  },
  {
    id: 'life',
    name: 'Life fit',
    weight: 10,
    anchors: {
      1: 'Works against how you live or who it affects.',
      3: 'Works with a few adjustments.',
      5: 'Fits how you want to live, and everyone affected is on board.',
    },
    frame: 'evidence',
  },
];

export const DECISION_FLAGS = flags([
  [
    'The comparison rests on one source or the seller’s own claims.',
    'For each top option, find at least one independent source (inspection, history report, official statistics, reviews from outsiders).',
  ],
  [
    'A recurring or hidden cost is missing from the cost model (insurance, taxes, maintenance, fees, interest, parking, tuition increases).',
    'Compare the Cost model rows with the category list for this kind of decision; each missing category is raised.',
  ],
  [
    'Artificial urgency: “only today”, an exploding offer, a deadline you cannot verify.',
    'Check the deadline in the source; separate the real deadline from the pressure.',
  ],
  [
    'A dealbreaker is present in an option that is still ranked high.',
    'Compare each option’s row with the dealbreakers in Criteria; any hit removes it or is raised as an exception for the user.',
  ],
  [
    'The financing, loan or aid assumptions are not sourced (rate, term, fees, eligibility).',
    'Each assumption has a source row in Cost model; a rate that is not a quote is marked as an estimate.',
  ],
  [
    'The decision is hard to reverse and no exit has been priced.',
    'Find the exit: resale cost or time, transfer rules, contract terms. Put it in Cost model.',
  ],
  [
    'Anchoring: the first option seen is the benchmark for all others.',
    'Check that the weighted matrix was filled before the favourite was named; ask for one option the user has not considered.',
  ],
  [
    'Sunk cost: past spending or effort is driving the choice.',
    'Look for reasoning that cites what has already been spent; reframe to what happens from here.',
  ],
  [
    'People affected by the decision have not been asked.',
    'The Affected people list in the Decision frame has an entry for each person; unanswered ones become questions.',
  ],
  [
    'Safety, legal or health issues that need a professional (structure, recalls, contracts, regulations).',
    'Raise it as a Risk with the professional to ask; orb does not give professional advice.',
  ],
]);

export const PERSONAL_DECISION: TemplateSpecInput = {
  id: 'personal-decision',
  label: 'Big decision',
  dot: '#D97706',
  placeholder: 'What are you deciding: a home, a car, a school, something else?',
  brief:
    'Help the user make a big personal decision (a home, a car, a school or another large choice): frame the ' +
    'decision and its deadline, set weighted criteria, build the options list, model the true cost, gather independent ' +
    'evidence, run a pre-mortem on the risks and compare the options in a weighted matrix. Eight numbered frames, ' +
    'a rubric and a decision memo. orb collects and compares evidence; the user decides, and orb is not a financial, ' +
    'legal or medical adviser.',
  titleFrom: 'Decision: {{decision}}',

  inputs: [
    {
      id: 'decision',
      label: 'The decision',
      kind: 'text',
      required: true,
      placeholder: 'Buy a two-bedroom flat in Leeds',
      maxLength: 160,
    },
    {
      id: 'kind',
      label: 'Kind of decision',
      kind: 'select',
      required: true,
      options: ['Home', 'Car', 'School or course', 'Moving city', 'Large purchase', 'Other'],
      group: 'what',
      maxLength: 40,
    },
    {
      id: 'deadline',
      label: 'Deadline',
      kind: 'text',
      placeholder: 'Offer by 30 November',
      group: 'what',
      maxLength: 80,
    },
    {
      id: 'budget',
      label: 'Budget',
      kind: 'text',
      required: true,
      placeholder: '£280k all in, or £450/month',
      group: 'money',
      maxLength: 120,
    },
    {
      id: 'financing',
      label: 'How you would pay',
      kind: 'text',
      placeholder: 'Mortgage with 15% down; cash; loan',
      group: 'money',
      maxLength: 160,
    },
    {
      id: 'location',
      label: 'Where',
      kind: 'text',
      placeholder: 'Leeds, within 30 minutes of the city centre',
      maxLength: 160,
    },
    {
      id: 'must_haves',
      label: 'Must-haves',
      kind: 'longtext',
      required: true,
      placeholder: 'One per line: e.g. 2 bedrooms; garden; under 40 minutes to work',
      maxLength: 1500,
    },
    {
      id: 'nice_to_have',
      label: 'Nice to have',
      kind: 'longtext',
      placeholder: 'Optional.',
      maxLength: 1000,
    },
    {
      id: 'dealbreakers',
      label: 'Dealbreakers',
      kind: 'longtext',
      placeholder: 'Anything that rules an option out',
      maxLength: 1000,
    },
    {
      id: 'affected',
      label: 'Who else is affected',
      kind: 'text',
      placeholder: 'Partner, two children, a parent who visits',
      help: 'orb treats this as private context for the decision and does not research these people.',
      maxLength: 200,
    },
    {
      id: 'options',
      label: 'Options you already know',
      kind: 'list',
      placeholder: 'Names, links or addresses: comma separated',
      help: 'Optional. Scout finds more that fit.',
      maxLength: 1500,
    },
    materialsField('Drop listings, offers, quotes, a brochure, a spreadsheet of your own. Each becomes a card or database.'),
    depthField(
      'Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending.',
    ),
    {
      id: 'sites',
      label: 'Signed-in sources to use',
      kind: 'sites',
      help: 'Only the sites you connected in Settings can be used. Scout reads them as you, read-only. Pick the ones that fit the kind of decision.',
      sites: [
        { domain: 'zillow.com', label: 'Zillow' },
        { domain: 'rightmove.co.uk', label: 'Rightmove' },
        { domain: 'autotrader.com', label: 'Autotrader' },
        { domain: 'niche.com', label: 'Niche' },
      ],
      maxLength: 400,
    },
  ],

  frames: [
    {
      id: 'decision',
      title: 'The decision',
      color: 'signal',
      brief:
        'What is being decided ({{decision}}), the deadline ({{deadline|none given}}), the budget ({{budget|to confirm}}), ' +
        'what success looks like in five years, who is affected and what they want, and the real alternatives, ' +
        'including doing nothing. One sentence that anyone affected could read and agree with.',
      owners: ['orb'],
      targets: [
        { type: 'doc', min: 2, note: 'the decision statement and the people affected' },
        { type: 'metric', min: 4 },
        { type: 'question', min: 2 },
      ],
      seeds: [
        doc(
          'Decision statement',
          '{{decision}}. Budget: {{budget|to confirm}}. Deadline: {{deadline|none given}}. How you would pay: {{financing|to confirm}}. orb writes it as one sentence after the first pass.',
          'Your decision, from the intake.',
        ),
        doc(
          'Scope and limits',
          'orb collects and compares evidence and models the cost from stated assumptions. It is not a financial, legal, medical or tax adviser: for anything of that kind, the Risks frame names the professional to ask. You make the decision.',
          'Standing note: what this does not do.',
        ),
        metric('Budget', 'Your stated budget, with what it includes.'),
        metric('Deadline', 'The real deadline, with its source.'),
        metric('Options on the table', 'Number of options still in the running.'),
        metric('Best score so far', 'Weighted score of the leading option, from Compare & decide.'),
        question('What does a good outcome look like in five years?', 'In your own words: money, time, how you live.'),
        question(
          'Is doing nothing a real option?',
          'What it costs, and what it keeps open.',
        ),
      ],
      room: 300,
    },
    {
      id: 'criteria',
      title: 'Criteria & weights',
      color: 'sky',
      brief:
        'The must-haves, nice-to-haves and dealbreakers as one list, each with a weight from 1 to 10 and how it is ' +
        'measured. Must-haves are gates, not weights: an option that misses one is out, or is shown as an exception for you to decide. ' +
        'Weights come from you; orb proposes and asks.',
      owners: ['orb'],
      targets: [
        { type: 'database', min: 1, note: 'Criteria' },
        { type: 'hypothesis', min: 1 },
      ],
      seeds: [
        db('Criteria', 'criteria'),
        hypothesis(
          'These are the criteria that matter most',
          'Your must-haves: {{must_haves|not given.}} Dealbreakers: {{dealbreakers|none given.}} Link the cards that show a criterion matters more or less than you thought.',
        ),
      ],
    },
    {
      id: 'options',
      title: 'Options',
      color: 'rho',
      brief:
        'Every real option with its key facts, price, source and status: the ones you named, and others found with ' +
        'find_entities and enriched into the database. Each row says which must-haves it meets. Keep the list ' +
        'honest: options that fail a dealbreaker stay in the database with the reason, so the choice is visible.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Options: at least 8 rows' },
        { type: 'product', min: 3, note: 'the leading options' },
        { type: 'source', min: 4 },
      ],
      seeds: [
        db('Options', 'options'),
        question('Which option have you not seen that fits?', 'One more option from a different source or category.'),
      ],
    },
    {
      id: 'cost',
      title: 'True cost',
      color: 'sky',
      brief:
        'The whole cost of each leading option over the holding period: price, financing, taxes, insurance, running ' +
        'costs, maintenance, fees and the cost of exit. Every assumption has a source or is marked as an estimate. The ' +
        'monthly and the five-year total against the budget.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Cost model' },
        { type: 'chart', min: 2, note: 'five-year cost by option; cost by category' },
        { type: 'math', min: 1, note: 'the formula behind the figure' },
      ],
      seeds: [
        db('Cost model', 'cost-model'),
        chartSeed('Five-year cost by option', 'bar', 'cost-model', 'Option', 'Total over 5 years'),
        metric('Monthly cost of the leading option', 'All recurring costs, with the assumptions.'),
        metric('Five-year total of the leading option', 'Including the cost of exit.'),
      ],
    },
    {
      id: 'evidence',
      title: 'Evidence & reviews',
      color: 'rho',
      brief:
        'Independent evidence about the leading options: reviews from owners or residents, reliability and ' +
        'recall data, official statistics (crime, school outcomes, flood risk, commute), inspections, price history, ' +
        'and what experts say. Positive and negative; outsiders’ words, not the seller’s.',
      owners: ['scout'],
      targets: [
        { type: 'quote', min: 5, note: 'at least 2 negative' },
        { type: 'source', min: 5, note: 'official or independent' },
        { type: 'timeline', min: 1, note: 'price or event history' },
      ],
      seeds: [
        timelineSeed(
          'History of the leading option',
          'Research started',
          'Scout adds dated events (price changes, recalls, inspections, rule changes), each with a source.',
        ),
      ],
    },
    {
      id: 'risks',
      title: 'Risks & regrets',
      color: 'paper',
      brief:
        'A pre-mortem: assume it is two years later and the decision was a mistake; what happened? Work through the ' +
        'red-flag checklist. Raise each flag as a Risk card with evidence or clear it with a source. Name the professional ' +
        'to ask where it needs one (surveyor, mechanic, adviser, school office). Reversibility and what the exit costs.',
      owners: ['critic'],
      targets: [{ type: 'risk', min: 6, note: 'every checklist item cleared with a source or raised' }],
      seeds: [
        flagChecklist('Decision red flags', DECISION_FLAGS),
        emptyRisk('Money'),
        emptyRisk('Hidden costs'),
        emptyRisk('Reversibility'),
        emptyRisk('Life fit'),
        emptyRisk('Timing'),
      ],
    },
    {
      id: 'compare',
      title: 'Compare & decide',
      color: 'signal',
      brief:
        'The weighted comparison of the options against the criteria, the 2x2 of cost against fit, pros and cons of ' +
        'the top two, the hypotheses with confidence, the rubric scored with cited evidence, and the decision. orb ' +
        'proposes; you choose and the Decision card records it with the reasons.',
      owners: ['orb', 'builder'],
      targets: [
        { type: 'matrix', min: 2, note: 'weighted options matrix and the filled rubric' },
        { type: 'framework', min: 2, note: '2x2 and pros and cons' },
        { type: 'decision', min: 1 },
        { type: 'hypothesis', min: 2 },
      ],
      seeds: [
        matrixSeed(
          'Options against criteria',
          [
            { name: 'Total cost', weight: 30 },
            { name: 'Must-haves met', weight: 30 },
            { name: 'Risk and reversibility', weight: 20 },
            { name: 'Long-term value', weight: 20 },
          ],
          ['Option A', 'Option B', 'Option C'],
          'Placeholder: renamed and scored (0 to 10) from the Options and Cost model rows, each score cited.',
        ),
        framework('quadrant', 'Cost against fit', { x: 'Cost', y: 'Fit to your criteria' }),
        framework('proscons', 'Top two options: pros and cons'),
        hypothesis('The leading option is still the best after the pre-mortem', 'Test it against the risks raised.'),
        decisionSeed(
          'Decision: {{decision}}',
          ['Option A', 'Option B', 'Option C', 'Wait', 'Do nothing'],
          'Open. orb proposes after the rubric is filled and writes the weighted total here. Rename the options to yours. You decide.',
        ),
        scorecard(DECISION_RUBRIC),
      ],
    },
    {
      id: 'next',
      title: 'Next steps & questions',
      color: 'paper',
      brief:
        'What to do next, in order: visits and test drives, the questions for the seller, dealer or school, the ' +
        'documents to request, the professionals to ask, the negotiation points, and the date by which you will decide. Every ' +
        'unresolved Question card on the board is collected here.',
      owners: ['orb', 'critic'],
      targets: [{ type: 'checklist', min: 2, note: 'at least 10 ranked actions and questions' }],
      seeds: [
        checklist('Before you commit', [
          'Visit or test the top two options in person.',
          'Ask a professional about each risk named in Risks & regrets.',
          'Ask for every document that proves a claim from the seller.',
          'Sleep on it for two nights and re-read the Decision card.',
        ]),
        checklist('Questions to ask', [
          'Your must-haves: {{must_haves|none given yet}}',
          'What would make you walk away from this option?',
        ]),
      ],
    },
  ],

  databases: [
    {
      key: 'criteria',
      name: 'Criteria',
      frame: 'criteria',
      purpose: 'Must-haves, nice-to-haves and dealbreakers with a weight and how each is measured.',
      keyColumn: 'Criterion',
      columns: [
        col('Criterion'),
        col('Type', 'enum', { options: ['Must-have', 'Nice to have', 'Dealbreaker'] }),
        col('Weight', 'number', { note: '1 to 10 from you; blank for must-haves and dealbreakers.' }),
        col('How measured', 'text'),
        col('Threshold', 'text', { note: 'The level that passes.' }),
        col('Why it matters', 'text'),
      ],
      views: [
        { name: 'By type', kind: 'board', group: 'Type' },
        { name: 'All', kind: 'table', sort: [{ column: 'Weight', dir: 'desc' }] },
      ],
    },
    {
      key: 'options',
      name: 'Options',
      frame: 'options',
      purpose: 'Every real option with facts, price and status. Found with find_entities, enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        col('Name'),
        col('URL', 'url'),
        col('Price', 'currency', { note: 'Headline price or monthly cost; say which in Key facts.' }),
        col('Key facts', 'text'),
        col('Must-haves met', 'text', { note: 'Which, and which are missed.' }),
        col('Dealbreaker hit', 'boolean'),
        col('Pros', 'text'),
        col('Cons', 'text'),
        col('Score', 'number', { note: 'Weighted score 0 to 100 from Compare & decide.' }),
        col('Status', 'enum', { options: ['Considering', 'Shortlisted', 'Visited', 'Rejected', 'Chosen'] }),
        col('Source', 'url'),
      ],
      views: [
        { name: 'By score', kind: 'table', sort: [{ column: 'Score', dir: 'desc' }] },
        { name: 'By status', kind: 'board', group: 'Status' },
        { name: 'Gallery', kind: 'gallery' },
        { name: 'Still in', kind: 'table', filter: [{ column: 'Status', op: 'neq', value: 'Rejected' }] },
      ],
    },
    {
      key: 'cost-model',
      name: 'Cost model',
      frame: 'cost',
      purpose: 'One row per cost item per option, with its basis and source, so totals can be checked.',
      keyColumn: 'Option and item',
      columns: [
        col('Option and item'),
        col('Option'),
        col('Item', 'enum', {
          options: ['Price', 'Financing', 'Taxes', 'Insurance', 'Running costs', 'Maintenance', 'Fees', 'Exit', 'Other'],
        }),
        col('One-time', 'currency'),
        col('Per month', 'currency'),
        col('Years held', 'number'),
        col('Total over 5 years', 'currency', { note: 'One-time plus 60 months, or per the years held.' }),
        col('Basis', 'enum', { options: ['Quote', 'Official', 'Estimate', 'Your figure'] }),
        col('Source', 'url'),
      ],
      views: [
        { name: 'By option', kind: 'table', group: 'Option' },
        { name: 'By item', kind: 'board', group: 'Item' },
        { name: 'Estimates', kind: 'table', filter: [{ column: 'Basis', op: 'eq', value: 'Estimate' }] },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first (listings, offers, quotes, brochures, your own spreadsheet): read_card, read_source and ' +
          'query_dataset. Turn the must-haves, nice-to-haves and dealbreakers from the intake into rows in Criteria (upsert_rows, ' +
          'key Criterion), propose a weight from 1 to 10 for each nice-to-have and ask the user to confirm them with ' +
          'ask_user_question. Put each option from the intake or the materials into Options. Hand the budget, the kind of decision and the ticked sources to Scout.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows', 'ask_user_question'],
        frames: ['criteria', 'options'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first, Builder once Options and Cost model have rows, Critic once Scout has sources. ' +
          'Tell each agent that this is the user’s own decision: evidence and comparison, never advice from a professional.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'statement',
        text: 'After Scout’s first pass, write the Decision statement as one sentence, fill the metrics with cited figures and keep “Options on the table” current. Collect the people affected from the intake as private context; do not research them.',
        tools: ['query_board', 'search_board', 'update_card', 'query_dataset'],
        frames: ['decision'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (a cost, a rule, an outcome statistic), run deep_research (core) on that one question. Ask before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        frames: ['cost', 'evidence'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'compare',
        text:
          'Fill the options-against-criteria matrix (rename Option A to C to the real options; 0 to 10 per criterion from Options and Cost model, each cited). ' +
          'Write the weighted score into the Score column of the options you wrote or ask Scout to. Then the Scorecard rubric (one 1-to-5 score per dimension, ' +
          'doubled on the matrix, each cited), the hypotheses, the pros and cons of the top two and the Decision card with your proposal and the weighted total. The user decides.',
        tools: ['query_board', 'query_dataset', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['compare'],
      }),
      step({
        id: 'memo',
        text: 'Write the decision memo with compose_section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. The deck follows with compose_slides if asked.',
        tools: ['compose_section', 'compose_slides'],
      }),
      step({
        id: 'next',
        text: 'Keep “Next steps & questions” current: collect every unresolved Question card, ranked, each linked to its source card, and name the professionals to ask.',
        tools: ['search_board', 'update_card', 'add_link'],
        frames: ['next'],
      }),
      step({
        id: 'monitor',
        text: 'Only when the user asks to watch a market (price drops, new listings, recalls, rule changes): watch_topic with the query below. Each monitor is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'kind',
        text: 'Work out what kind of decision this is from the intake and list the sources it needs before you start: a home (listing portals, sale history, council or tax records, flood and crime data, schools, commute), a car (listings, recalls, reliability surveys, insurance groups, running costs, depreciation), a school or course (official outcomes data, fees, aid, reviews from students, visit days), a move (cost of living, rent, jobs, climate), a large purchase (reviews, warranty, total cost). Say the list in report_progress.',
        tools: ['report_progress', 'web_search', 'web_answer'],
        frames: ['options'],
      }),
      step({
        id: 'options',
        text: 'Options: add the options named in the intake first (fetch_url, parallel_extract). find_entities discovers more that meet the must-haves; batch_enrich fills the Options columns. Consolidate into Options with upsert_rows (key Name) with a Source on every row and Dealbreaker hit set honestly; keep rejected ones with the reason. Product cards for the leading three. On the Quick tier, add rows from web_search instead.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'fetch_url', 'parallel_extract', 'fetch_signed_in', 'query_dataset', 'upsert_rows', 'place_card'],
        frames: ['options'],
      }),
      step({
        id: 'cost',
        text: 'True cost: for each leading option, one row per cost item in Cost model (upsert_rows, key “Option and item”): price, financing from a quoted rate (a rate is Basis Quote only when it comes from a lender or an offer), taxes, insurance, running costs, maintenance, fees and the cost of exit. Official sources first; mark estimates. Metrics for the monthly and the five-year total.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'upsert_rows', 'place_card', 'query_dataset'],
        frames: ['cost'],
      }),
      step({
        id: 'evidence',
        text: 'Evidence: reviews from owners, residents or students (quote cards: at least two negative), official statistics, inspection or recall data and price history on the History timeline. Video cards for a walkthrough or review, linked not embedded. Images and screenshots with capture_page for what the user will want to see again.',
        tools: ['web_search', 'fetch_url', 'capture_page', 'place_card', 'image_search'],
        frames: ['evidence', 'options'],
      }),
      step({
        id: 'signed-in',
        text: 'Only for sites the user ticked and connected: saved searches, price history or reports the user can already see (fetch_signed_in, read-only). Never log in on the user’s behalf, never submit anything.',
        tools: ['fetch_signed_in'],
        frames: ['options'],
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
        text: 'Start after Scout’s first sources: read the cards of every frame (board_map, search_board, read_card) and the Criteria, Options and Cost model rows (query_dataset) before judging anything.',
        tools: ['board_map', 'search_board', 'read_card', 'query_board', 'query_dataset'],
      }),
      step({
        id: 'red-flags',
        text: 'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links, or an Insight card titled "RFxx cleared: ..." citing the source cards that clear it (an insight needs at least two cited cards). Name the professional to ask where a flag needs one. You cannot tick the checklist: the user does.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['risks', 'cost', 'options'],
      }),
      step({
        id: 'premortem',
        text: 'The pre-mortem: for each of the top two options, a Hypothesis card “Two years on, this was a mistake because...” with the three likeliest causes, each linked to the evidence cards. Then a Question for each cause the user can still test before committing.',
        tools: ['place_card', 'add_link', 'query_board'],
        frames: ['risks', 'next'],
      }),
      step({
        id: 'single-source',
        text: 'Challenge every figure with a single source or a seller’s source: link tension to the card that disagrees or place a Question for the second source. Check every dealbreaker against the options.',
        tools: ['query_dataset', 'query_board', 'read_card', 'add_link', 'place_card'],
        frames: ['evidence', 'criteria'],
      }),
      step({
        id: 'report',
        text: 'Report progress per frame; send_message to orb when the checklist is complete, naming the flags raised.',
        tools: ['report_progress', 'send_message'],
      }),
    ],
    builder: [
      step({
        id: 'charts',
        text: 'The cost charts: five-year cost by option (bar) and cost by category (stacked or bar), bound to Cost model; compute the totals with query_dataset and write them into the Total over 5 years column of the rows you wrote.',
        tools: ['place_card', 'query_dataset', 'upsert_rows'],
        frames: ['cost'],
      }),
      step({
        id: 'math',
        text: 'The formula behind each key figure (a loan payment, a total cost of ownership, a break-even) as a math card with its inputs and the cell it feeds.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['cost'],
      }),
      step({
        id: 'compare',
        text: 'The cost-against-fit 2x2 and the pros and cons of the top two options, built from the Options and Cost model rows.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['compare'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual summary (a design frame): the decision, the top options with their five-year cost and score, the main risks and the next three steps, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['compare', 'decision'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...DECISION_RUBRIC],
  redFlags: [...DECISION_FLAGS],

  output: {
    memoTitle: 'Decision memo: {{decision}}',
    citationRule:
      'Every paragraph cites cards; every cost and statistic cites its source; estimates and quotes are marked as such. The memo says what is not known and what orb is not.',
    sections: [
      {
        id: 'summary',
        title: 'Summary & recommendation',
        frames: ['compare', 'risks'],
        words: 150,
        guidance: 'The proposed choice, the score, the three reasons and the three risks, in at most 150 words, and that the user decides.',
      },
      {
        id: 'decision',
        title: 'The decision and what matters',
        frames: ['decision', 'criteria'],
        guidance: 'The decision statement, the deadline, the budget and the weighted criteria.',
      },
      {
        id: 'options',
        title: 'The options',
        frames: ['options'],
        guidance: 'The options still in the running with key facts, and why the others were dropped.',
      },
      {
        id: 'cost',
        title: 'True cost',
        frames: ['cost'],
        guidance: 'The five-year cost by option, assumptions marked quote or estimate, against the budget.',
      },
      {
        id: 'evidence',
        title: 'Evidence',
        frames: ['evidence'],
        guidance: 'What independent sources and reviewers say about the leading options, positive and negative.',
      },
      {
        id: 'risks',
        title: 'Risks & regrets',
        frames: ['risks'],
        guidance: 'The pre-mortem and the red-flag outcomes, with the professional to ask for each.',
      },
      {
        id: 'compare',
        title: 'The comparison',
        frames: ['compare'],
        guidance: 'The weighted matrix, the 2x2 and pros and cons of the top two.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard',
        frames: ['compare'],
        guidance: 'The rubric table: each dimension, weight, score and evidence.',
      },
      {
        id: 'next',
        title: 'Next steps',
        frames: ['next'],
        guidance: 'The ranked actions and questions, the professionals to ask and the date to decide.',
      },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'Decision one-pager: {{decision}}',
      includes: ['The decision and deadline', 'Top options and five-year cost', 'Score', 'Top risks', 'Next steps'],
    },
    deckFormat: 'standard',
  },

  tiers: tiers({
    quickSummary:
      'No deep research: search, extract and the signed-in fetches ticked, at most 12 cards per frame; the memo is the summary only.',
    standardSummary:
      'Quick, plus the options list found with entity discovery and enriched, and one or two deep-research runs (core) on costs and outcomes, asking before spend.',
    deepSummary:
      'Standard, plus FindAll for the full options list, pro research on the hardest unknown and the full decision memo.',
    deepRuns: 4,
  }),

  followUps: [
    {
      label: 'What would change my mind?',
      prompt: 'What evidence would change the proposed choice for {{decision}}? List the three things to check before committing.',
    },
    {
      label: 'Stress-test the cost',
      prompt: 'Stress-test the cost of the leading option for {{decision}}: rates up two points, income down 10 percent, a big repair. Show the effect on the five-year total.',
    },
    {
      label: 'Add an option',
      prompt: 'Add [an option] to {{decision}}: research it like the others, fill the Options and Cost model rows and re-score.',
    },
    {
      label: 'Questions for the visit',
      prompt: 'Draft the questions to ask at the visit or test drive for the top two options, tied to the risks on the board.',
    },
    {
      label: 'Change a weight',
      prompt: 'I care more about [a criterion]. Change its weight, re-score and tell me which option moves.',
    },
    {
      label: 'Watch the market',
      prompt: 'Watch for new options and price changes for {{decision}} and tell me what changes the ranking.',
    },
  ],

  signedIn: [
    { domain: 'zillow.com', label: 'Zillow', use: 'Saved homes, price history and neighbourhood data, as visible to the user.' },
    { domain: 'rightmove.co.uk', label: 'Rightmove', use: 'Saved properties and sold-price history, as visible to the user.' },
    { domain: 'autotrader.com', label: 'Autotrader', use: 'Saved cars and listing history, as visible to the user.' },
    { domain: 'niche.com', label: 'Niche', use: 'Detailed school and neighbourhood reviews and data.' },
  ],

  monitor: {
    query: '{{decision}} new listings, price changes, recalls, rule changes and rates',
    why: 'New options or changes that would move the ranking.',
  },
};
