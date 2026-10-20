/**
 * M&A target screening (P6.12): from a mandate (who is buying, why, what size) to a ranked shortlist: a target universe
 * discovered and enriched with Parallel, screened against criteria, profiled, valued against precedent deals and trading
 * comps, checked for synergies, feasibility and red flags, and scored. Human-readable spec: docs/templates/ma-screen.md
 * (generated: `pnpm templates:docs`).
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

export const MA_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'fit',
    name: 'Strategic fit',
    weight: 30,
    anchors: {
      1: 'Little overlap with the strategy; a distraction.',
      3: 'Supports the strategy in one clear way.',
      5: 'Directly delivers the strategic goal and is hard for anyone else to replicate.',
    },
    frame: 'profiles',
  },
  {
    id: 'financial',
    name: 'Financial profile',
    weight: 20,
    anchors: {
      1: 'Losing money with no path, or shrinking.',
      3: 'Growing with acceptable margins or a credible path to them.',
      5: 'Strong growth with healthy margins and cash generation.',
    },
    frame: 'financials',
  },
  {
    id: 'valuation',
    name: 'Valuation & affordability',
    weight: 20,
    anchors: {
      1: 'Expected price is far above comparable deals or the budget.',
      3: 'In line with comparable deals and inside the budget.',
      5: 'Attractively priced against comparable deals and well inside the budget.',
    },
    frame: 'valuation',
  },
  {
    id: 'synergy',
    name: 'Synergy potential',
    weight: 15,
    anchors: {
      1: 'Few identifiable synergies, mostly hoped for.',
      3: 'Clear cost or revenue synergies with evidence.',
      5: 'Large, evidenced synergies that pay for the premium.',
    },
    frame: 'synergies',
  },
  {
    id: 'feasibility',
    name: 'Deal feasibility & risk',
    weight: 15,
    anchors: {
      1: 'Owners unwilling, regulatory blockers or major red flags.',
      3: 'A plausible path to a deal with manageable risks.',
      5: 'Willing owners, a clean regulatory path and no major red flags.',
    },
    frame: 'feasibility',
  },
];

export const MA_FLAGS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: 'Customer concentration: one customer or channel above 20% of revenue.',
    check: 'Look for customer-share disclosures in the materials, press and reviews; say "not knowable" if absent.',
  },
  {
    id: 'RF02',
    text: 'Revenue quality: one-off, non-recurring or hard-to-verify revenue.',
    check: 'Compare the revenue claims in Target financials with independent signals; flag estimates that rest on one source.',
  },
  {
    id: 'RF03',
    text: 'Key-person dependency: the founder or a few engineers are the business.',
    check: 'Read the founder and leadership profiles and the Stakeholders database for single points of failure.',
  },
  {
    id: 'RF04',
    text: 'Litigation, regulatory action, or an IP dispute.',
    check: 'Search court, regulator and news sources for the target and its founders; cite them.',
  },
  {
    id: 'RF05',
    text: 'Intellectual property is not clearly owned (open-source licence exposure, employee or contractor ownership).',
    check: 'Look for licence notes, patents and trademark records; raise if the product depends on code or marks it may not own.',
  },
  {
    id: 'RF06',
    text: 'Technology debt or a platform dependency that would be costly to unwind.',
    check: 'Read the product and stack sources; check dependence on one cloud, API or vendor.',
  },
  {
    id: 'RF07',
    text: 'Antitrust or sector-regulator review is likely.',
    check: 'Check combined market share from the Target universe and sector rules for merger review.',
  },
  {
    id: 'RF08',
    text: 'Change-of-control terms, investor preferences or rights of first refusal that block or reprice a deal.',
    check: 'Look for investor rights and cap-table signals in the Stakeholders database and any materials.',
  },
  {
    id: 'RF09',
    text: 'Retention risk: leadership or critical staff are likely to leave after a deal.',
    check: 'Check hiring and departure signals, tenure and vesting where known.',
  },
  {
    id: 'RF10',
    text: 'Cultural or geographic mismatch that integration would struggle with.',
    check: 'Compare locations, team size and operating model with the acquirer in the mandate.',
  },
  {
    id: 'RF11',
    text: 'Valuation expectations are far above precedent deals.',
    check: 'Compare the last round valuation and any reported ask with the Precedent transactions multiples.',
  },
  {
    id: 'RF12',
    text: 'A competing bidder, or the target is already in a sale process.',
    check: 'Search for acquisition rumours, banker mandates and recent strategic investors.',
  },
];

export const MA_SCREEN: TemplateSpecInput = {
  id: 'ma-screen',
  label: 'M&A screening',
  dot: '#2563EB',
  placeholder: 'Who is the acquirer?',
  brief:
    'Screen acquisition targets for the acquirer: eleven numbered frames (mandate, universe, screening matrix, ' +
    'profiles, financials, valuation, synergies, feasibility, risks, ranking, approach) built on a Target universe ' +
    'database that Parallel discovers and enriches, a screen against the criteria, precedent-deal valuation, ' +
    'red-flag checks and a weighted ranking. Mark every estimate, cite every number and end with a ranked shortlist ' +
    'and a recommended approach for each.',
  titleFrom: '{{acquirer}}: M&A target screen',

  inputs: [
    {
      id: 'acquirer',
      label: 'Acquirer (your company or client)',
      kind: 'text',
      required: true,
      placeholder: 'Acme Software',
      maxLength: 120,
    },
    {
      id: 'website',
      label: 'Acquirer website',
      kind: 'url',
      placeholder: 'https://acme.com',
      maxLength: 300,
    },
    {
      id: 'strategy',
      label: 'Acquisition rationale',
      kind: 'select',
      options: [
        'Product or technology tuck-in',
        'New geography',
        'New customers or distribution',
        'Vertical consolidation',
        'Talent and capability',
        'Platform add-on (roll-up)',
        'Diversification',
      ],
      maxLength: 80,
    },
    {
      id: 'sector',
      label: 'Target sector / category',
      kind: 'text',
      required: false,
      placeholder: 'Warehouse robotics software',
      suggestions: ['B2B SaaS', 'Fintech', 'Healthtech', 'Industrial tech', 'Cybersecurity', 'Data and AI', 'Services', 'Consumer'],
      maxLength: 120,
    },
    {
      id: 'size_range',
      label: 'Target size range',
      kind: 'text',
      placeholder: '$5M to $50M revenue, or EV up to $300M',
      group: 'size',
      maxLength: 120,
    },
    {
      id: 'budget',
      label: 'Budget or valuation ceiling',
      kind: 'text',
      placeholder: '$250M enterprise value',
      group: 'size',
      maxLength: 120,
    },
    {
      id: 'geography',
      label: 'Target geography',
      kind: 'text',
      placeholder: 'North America and UK',
      maxLength: 120,
    },
    {
      id: 'criteria',
      label: 'Must-have criteria',
      kind: 'longtext',
      placeholder: 'One per line: recurring revenue above 80%, 50+ engineers, SOC 2…',
      maxLength: 1500,
    },
    {
      id: 'dealbreakers',
      label: 'Deal-breakers',
      kind: 'longtext',
      placeholder: 'One per line: customer concentration, an existing competitor to us…',
      maxLength: 1500,
    },
    {
      id: 'known_targets',
      label: 'Known targets',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout finds more.',
      maxLength: 800,
    },
    {
      id: 'excluded',
      label: 'Companies to exclude',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Already approached, conflicts, competitors.',
      maxLength: 800,
    },
    materialsField(
      'Drop the acquisition strategy, criteria, a target list (CSV or XLSX), a banker book or a prior screen. A target list becomes rows in the Target universe.',
    ),
    depthField,
    sitesField([
      { domain: 'pitchbook.com', label: 'PitchBook' },
      { domain: 'crunchbase.com', label: 'Crunchbase' },
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'capitaliq.com', label: 'S&P Capital IQ' },
    ]),
  ],

  frames: [
    {
      id: 'mandate',
      title: 'Mandate & criteria',
      color: 'signal',
      brief:
        'What {{acquirer}} wants to buy and why: the rationale, the sector, the size range and budget, the geography, the ' +
        'must-have criteria and the deal-breakers. Turn the intake into screening criteria that can be checked row by row, ' +
        'and say what is assumed.',
      owners: ['orb'],
      targets: [target('doc', 1, 'the mandate'), target('checklist', 1, 'screening criteria'), target('metric', 4)],
      seeds: [
        doc(
          'Mandate',
          'Acquirer: {{acquirer}}. Rationale: {{strategy|to confirm}}. Sector: {{sector|to confirm}}. Size: {{size_range|to confirm}}. Budget: {{budget|to confirm}}. Geography: {{geography|to confirm}}.',
          'From your intake; orb refines it after the first pass.',
        ),
        checklist(
          'Screening criteria',
          [
            'Your must-haves: {{criteria|none given yet}}',
            'Your deal-breakers: {{dealbreakers|none given yet}}',
            'Inside the size range: {{size_range|to confirm}}',
            'Inside the budget: {{budget|to confirm}}',
          ],
          'You tick criteria a target meets; agents propose them.',
        ),
        metric('Targets screened', 'Rows in the Target universe.'),
        metric('Shortlisted', 'Targets with Status Shortlisted.'),
        metric('Median EV / revenue', 'Median of the precedent deals, with the sample size and dates.'),
        metric('Deal size range', 'Implied EV range of the shortlist, from the valuation frame.'),
        question('What does success look like in 12 months after closing?', 'The outcome the deal is for: revenue, capability, market access.'),
      ],
      room: 280,
    },
    {
      id: 'universe',
      title: 'Target universe',
      color: 'sky',
      brief:
        'Every company that could fit: discovered with find_entities from the mandate and enriched with batch_enrich ' +
        '(HQ, founded, headcount, funding, ownership, revenue estimate, what they sell). One row per company, a Source on every ' +
        'row, excluded companies marked, and a screening status (Screened, Shortlisted, Rejected) with the reason for a rejection.',
      owners: ['scout', 'builder'],
      targets: [target('database', 1, 'Target universe, at least 30 rows on Standard'), target('chart', 1, 'targets by ownership type'), target('source', 4)],
      seeds: [
        db('Target universe', 'universe'),
        chart('Targets by ownership', 'bar', 'universe', 'Ownership', 'Headcount'),
      ],
    },
    {
      id: 'screen',
      title: 'Screening matrix',
      color: 'rho',
      brief:
        'The screen: each candidate scored against the weighted criteria, the ones that fail a must-have or hit a deal-breaker ' +
        'dropped with a reason, and a fit-against-feasibility 2x2 of the survivors.',
      owners: ['builder', 'scout', 'critic'],
      targets: [target('matrix', 1, 'weighted screen of the top candidates'), target('framework', 1, 'the 2x2'), target('chart', 1)],
      seeds: [
        matrix(
          'Screening matrix',
          [
            ['Strategic fit', 30],
            ['Size and growth', 20],
            ['Technology or product', 20],
            ['Customer base', 15],
            ['Geography and culture', 15],
          ],
          ['Target A', 'Target B', 'Target C'],
          'Placeholder: weighted criteria, scored from the Target universe and the sources.',
        ),
        quadrant('Fit vs feasibility', 'Feasibility of a deal', 'Strategic fit'),
      ],
    },
    {
      id: 'profiles',
      title: 'Target profiles',
      color: 'sky',
      brief:
        'A profile of each shortlisted target: what it sells and to whom, the product and technology, the team and founders, ' +
        'customers and traction, funding history and investors, and how it would sit inside {{acquirer}}. One entity card per ' +
        'shortlisted target with screenshots of its product and pricing pages.',
      owners: ['scout', 'builder'],
      targets: [target('entity', 3, 'one per shortlisted target'), target('image', 3, 'product or pricing page captures'), target('diagram', 1, 'how a target fits the acquirer'), target('source', 6)],
      seeds: [question('Which target would we regret losing to a competitor?', 'The one a rival would pay most for, and why.')],
    },
    {
      id: 'financials',
      title: 'Financial profile',
      color: 'rho',
      brief:
        'Revenue, growth, margins, profitability, funding raised, burn and employees for each shortlisted target, from filings ' +
        'where public and from estimates where private. Every private figure is marked Estimated with its method.',
      owners: ['scout', 'orb'],
      targets: [target('database', 1, 'Target financials'), target('chart', 1, 'revenue and growth by target'), target('metric', 2)],
      seeds: [
        db('Target financials', 'financials'),
        chart('Revenue by target', 'bar', 'financials', 'Target', 'Revenue'),
        metric('Median growth', 'Median revenue growth of the shortlist, with the sample.'),
        metric('Median gross margin', 'Median of the shortlist where known.'),
      ],
    },
    {
      id: 'valuation',
      title: 'Valuation & comps',
      color: 'sky',
      brief:
        'What each target might cost: precedent transactions in the sector (EV, multiples, rationale), trading comps of listed ' +
        'peers, the last round valuation of each private target, an implied EV range with a premium, and whether it fits the budget.',
      owners: ['scout', 'orb', 'builder'],
      targets: [target('database', 2, 'Precedent transactions and Trading comps'), target('chart', 1, 'a football field of valuation ranges'), target('metric', 2)],
      seeds: [
        db('Precedent transactions', 'precedents'),
        db('Trading comps', 'comps'),
        metric('Implied EV (median)', 'Median multiple times the target revenue, with the multiple and its sample.'),
        metric('Premium assumed', 'Control premium used, with its basis.'),
        chart('Multiples of precedent deals', 'bar', 'precedents', 'Target', 'EV / revenue'),
      ],
    },
    {
      id: 'synergies',
      title: 'Synergies & integration',
      color: 'rho',
      brief:
        'Where value would come from: revenue synergies (cross-sell, new markets), cost synergies (overlap, platform), ' +
        'technology and talent, each with an estimated value, the evidence, the confidence and the cost and time to achieve it. ' +
        'Integration risks and the first 100 days.',
      owners: ['orb', 'scout', 'critic'],
      targets: [target('database', 1, 'Synergies'), target('framework', 1, 'pros and cons'), target('timeline', 1, 'integration plan')],
      seeds: [
        db('Synergies', 'synergies'),
        proscons('Doing this deal: pros and cons'),
        timeline('Integration timeline', 'Deal closes', 'orb adds the first-100-days milestones for the top target.'),
        question('Which synergies would we still believe if we were wrong by half?', 'Discount each by what the evidence supports.'),
      ],
    },
    {
      id: 'feasibility',
      title: 'Ownership & feasibility',
      color: 'sky',
      brief:
        'Who owns each target and whether a deal is possible: founders, investors and their rights and incentives, the likely ' +
        'stance of each, change-of-control and preference terms, regulatory or antitrust review, competing bidders and whether the ' +
        'target is in a process.',
      owners: ['scout', 'critic'],
      targets: [target('database', 1, 'Stakeholders'), target('risk', 2), target('source', 3)],
      seeds: [db('Stakeholders', 'stakeholders'), question('Is any target already in a process, or about to raise?', 'Signs of a banker, a recent round or a bidder.')],
    },
    {
      id: 'risks',
      title: 'Risks & red flags',
      color: 'paper',
      brief:
        'Work through the red-flag checklist for each shortlisted target: raise each flag as a Risk card with evidence, or clear ' +
        'it with a source. Also covers integration, retention, regulatory, technology and valuation risk.',
      owners: ['critic'],
      targets: [target('risk', 6, 'every checklist item cleared with a source or raised, per shortlisted target')],
      seeds: [
        redFlagChecklist('Red-flag checklist', MA_FLAGS),
        emptyRisk('Financial'),
        emptyRisk('Technology'),
        emptyRisk('People'),
        emptyRisk('Legal/Regulatory'),
        emptyRisk('Integration'),
        emptyRisk('Valuation'),
      ],
    },
    {
      id: 'ranking',
      title: 'Ranking & recommendation',
      color: 'signal',
      brief:
        'The ranked shortlist: scored against the rubric with cited evidence, the thesis for each top target, the bull and bear ' +
        'view, and a recommendation (Pursue, Approach, Monitor, Drop) with the proposed order of approach.',
      owners: ['orb'],
      targets: [target('matrix', 1, 'the filled rubric'), target('decision', 1), target('hypothesis', 3, 'with evidence links'), target('framework', 1, 'SWOT')],
      seeds: [
        hypothesis('The top target is the best fit for {{acquirer}}', 'Its strategic fit outweighs its price and risks. Link the evidence for and against.'),
        hypothesis('The universe has at least three credible targets', 'Enough fit and feasibility to run a competitive process.'),
        hypothesis('The price fits the budget', 'The implied EV range sits inside {{budget|the budget}} with a control premium.'),
        swot('SWOT: the acquisition programme'),
        decision(
          'Recommendation for {{acquirer}}',
          ['Pursue the top target', 'Approach the top three', 'Keep monitoring', 'Widen the search', 'Drop'],
          'Open. orb decides after the rubric is filled and writes the ranked shortlist and the weighted totals here.',
        ),
        scorecard('Target scorecard (rubric score x 2, so 10 is a 5)', MA_RUBRIC, ['Top target', 'Second target', 'Third target']),
      ],
    },
    {
      id: 'approach',
      title: 'Approach & next steps',
      color: 'paper',
      brief:
        'How to approach each target: the angle, the person to contact, the introduction route, the opening message and the ' +
        'questions for the first conversation, each linked to the gap or risk that prompted it. Every unresolved question card ' +
        'on the board is collected here.',
      owners: ['critic', 'orb'],
      targets: [target('checklist', 1, 'at least 10 ranked questions and approach steps, each linked to its source card')],
      seeds: [
        checklist('Approach plan and questions', [
          'Excluded and already approached: {{excluded|none given}}',
          'Who is the right first contact at each shortlisted target?',
          'What would make the owners say yes at this price?',
        ]),
      ],
    },
  ],

  databases: [
    {
      key: 'universe',
      name: 'Target universe',
      frame: 'universe',
      purpose: 'Every candidate and its screening status. Discovered with find_entities, enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        col('Name', 'text'),
        col('URL', 'url'),
        col('What they sell', 'text'),
        col('HQ', 'text'),
        col('Founded', 'number'),
        col('Headcount', 'number'),
        col('Revenue estimate', 'currency', { note: 'US dollars; Estimated unless filed.' }),
        col('Total funding', 'currency'),
        col('Ownership', 'enum', { options: ['Venture-backed', 'PE-owned', 'Founder-owned', 'Public', 'Subsidiary', 'Unknown'] }),
        col('Fit', 'rating', { note: '1 (low) to 5 (high), from the screening matrix.' }),
        col('Status', 'enum', { options: ['Screened', 'Shortlisted', 'Rejected', 'Excluded'] }),
        col('Reason', 'text', { note: 'Why shortlisted or rejected, against the criteria.' }),
        col('Source', 'url'),
      ],
      views: [
        tableView('All', { sort: [{ column: 'Fit', dir: 'desc' }] }),
        boardView('By status', 'Status'),
        boardView('By ownership', 'Ownership'),
        tableView('Shortlist', { filter: [{ column: 'Status', op: 'eq', value: 'Shortlisted' }] }),
      ],
    },
    {
      key: 'financials',
      name: 'Target financials',
      frame: 'financials',
      purpose: 'Revenue, growth and margins of each shortlisted target, marked reported or estimated.',
      keyColumn: 'Target',
      columns: [
        col('Target', 'text'),
        col('Period', 'text'),
        col('Revenue', 'currency'),
        col('Growth', 'number', { note: 'Percent, year over year.' }),
        col('Gross margin', 'number', { note: 'Percent.' }),
        col('EBITDA', 'currency'),
        col('Employees', 'number'),
        col('Funding raised', 'currency'),
        col('Last valuation', 'currency'),
        col('Basis', 'enum', { options: ['Filed', 'Reported', 'Estimated'] }),
        col('Method', 'text', { note: 'How an estimate was made.' }),
        col('Source', 'url'),
      ],
      views: [tableView('By revenue', { sort: [{ column: 'Revenue', dir: 'desc' }] }), boardView('By basis', 'Basis')],
    },
    {
      key: 'precedents',
      name: 'Precedent transactions',
      frame: 'valuation',
      purpose: 'Comparable acquisitions with their value and multiples.',
      keyColumn: 'Target',
      columns: [
        col('Date', 'date'),
        col('Acquirer', 'text'),
        col('Target', 'text'),
        col('EV', 'currency'),
        col('EV / revenue', 'number'),
        col('EV / EBITDA', 'number'),
        col('Sector', 'text'),
        col('Rationale', 'text'),
        col('Source', 'url'),
      ],
      views: [tableView('By date', { sort: [{ column: 'Date', dir: 'desc' }] }), tableView('By multiple', { sort: [{ column: 'EV / revenue', dir: 'desc' }] })],
    },
    {
      key: 'comps',
      name: 'Trading comps',
      frame: 'valuation',
      purpose: 'Listed peers with their current multiples (with an "as of" date).',
      keyColumn: 'Company',
      columns: [
        col('Company', 'text'),
        col('Ticker', 'text'),
        col('EV', 'currency'),
        col('EV / revenue', 'number'),
        col('EV / EBITDA', 'number'),
        col('Revenue growth', 'number', { note: 'Percent.' }),
        col('Operating margin', 'number', { note: 'Percent.' }),
        col('As of', 'date'),
        col('Source', 'url'),
      ],
      views: [tableView('By EV', { sort: [{ column: 'EV', dir: 'desc' }] })],
    },
    {
      key: 'synergies',
      name: 'Synergies',
      frame: 'synergies',
      purpose: 'Each synergy with its value, evidence and confidence.',
      keyColumn: 'Synergy',
      columns: [
        col('Synergy', 'text'),
        col('Target', 'text'),
        col('Type', 'enum', { options: ['Revenue', 'Cost', 'Technology', 'Talent', 'Distribution'] }),
        col('Annual value', 'currency'),
        col('One-off cost', 'currency'),
        col('Months to achieve', 'number'),
        col('Confidence', 'enum', { options: ['Low', 'Medium', 'High'] }),
        col('Evidence', 'text'),
        col('Source', 'url'),
      ],
      views: [tableView('By value', { sort: [{ column: 'Annual value', dir: 'desc' }] }), boardView('By type', 'Type')],
    },
    {
      key: 'stakeholders',
      name: 'Stakeholders',
      frame: 'feasibility',
      purpose: 'The owners, investors and decision makers of each shortlisted target.',
      keyColumn: 'Name',
      columns: [
        col('Name', 'person'),
        col('Target', 'text'),
        col('Role', 'text'),
        col('Holder type', 'enum', { options: ['Founder', 'Executive', 'Venture investor', 'PE sponsor', 'Corporate parent', 'Employee pool', 'Other'] }),
        col('Stake', 'number', { note: 'Percent, if known.' }),
        col('Likely stance', 'enum', { options: ['Supportive', 'Neutral', 'Resistant', 'Unknown'] }),
        col('Rights or terms', 'text', { note: 'Preferences, ROFR, change of control, board seats.' }),
        col('LinkedIn', 'url'),
        col('Source', 'url'),
      ],
      views: [tableView('All'), boardView('By stance', 'Likely stance')],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'mandate',
        text:
          'Read the uploaded materials first (read_card, read_source, query_dataset): the strategy, the criteria and any target ' +
          'list. A target list becomes Target universe rows (upsert_rows, Status Screened). Turn the intake into the Mandate doc ' +
          'and the Screening criteria checklist (update_card), and say what you assumed. Hand the criteria, the size range, the ' +
          'excluded companies and the known targets to Scout in its delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows', 'update_card'],
        frames: ['mandate', 'universe'],
      }),
      step({
        id: 'delegate',
        text: 'Delegate with delegate: Scout first (discovery, enrichment, financials, comps, stakeholders), Builder once the Target universe has rows, Critic once Scout has placed its first sources. Name the frames each agent owns.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'screen',
        text: "After Scout's first pass, apply the screen: for each Target universe row decide Shortlisted or Rejected against the criteria and the deal-breakers (add a new row with Status and a Reason; a row an agent wrote can only be changed by that agent). Never reject without a reason. Fill the four mandate metrics (update_card).",
        tools: ['query_board', 'query_dataset', 'upsert_rows', 'update_card', 'search_board'],
        frames: ['universe', 'mandate'],
      }),
      step({
        id: 'valuation',
        text: 'Value the shortlist: from Target financials, Precedent transactions and Trading comps (query_dataset) compute an implied EV range per target (multiple times revenue plus the control premium), compare it with the budget and fill the Implied EV and Premium metrics. State the sample sizes.',
        tools: ['query_dataset', 'update_card', 'read_card', 'place_card'],
        frames: ['valuation'],
      }),
      step({
        id: 'synergies',
        text: 'Write the synergies for the top targets into Synergies (upsert_rows, key Synergy) with value, one-off cost, months and confidence, each citing the evidence, and the first-100-days milestones on the integration timeline.',
        tools: ['query_board', 'upsert_rows', 'place_card', 'read_card'],
        frames: ['synergies'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (a target revenue estimate, an ownership question), run deep_research (core) on that one question. Ask the user before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'rank',
        text: 'At the end, fill the Target scorecard: for the top three targets, one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card. Then the three hypotheses (evidence for and against as card ids), the SWOT and the Decision card: your proposed option, the ranked shortlist and the weighted totals in its rationale.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['ranking'],
      }),
      step({
        id: 'memo',
        text: 'Write the screening report with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only.',
        tools: ['compose_section'],
      }),
      step({
        id: 'questions',
        text: 'Keep the approach plan current: collect every unresolved Question card into the "Approach plan and questions" checklist, ranked, each linked to its source card.',
        tools: ['search_board', 'update_card', 'add_link'],
        frames: ['approach'],
      }),
      step({
        id: 'monitor',
        text: 'Only when the user asks to keep watching the shortlist: watch_topic for each named target (funding, sale process, leadership changes). Monitors cost money on every check, so each is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'seed',
        text: 'Start from the known targets in the intake: add them to Target universe (upsert_rows, key Name, Status Screened) with a Source url on every row, skipping the excluded companies. Read two or three independent overviews of the sector to learn its vocabulary and its acquirers.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'upsert_rows', 'place_card'],
        frames: ['universe'],
      }),
      step({
        id: 'discover',
        text: "Discovery: find_entities with the mandate (sector, size, geography, must-haves) as the objective; the match limit follows the depth tier. It fills its own database card in this frame. On the Quick scan tier find_entities is refused: add up to 12 names from web_search with upsert_rows instead.",
        tools: ['find_entities', 'find_entities_extend', 'web_search', 'upsert_rows'],
        frames: ['universe'],
      }),
      step({
        id: 'enrich',
        text: 'Enrichment: batch_enrich fills the Target universe columns (what they sell, HQ, founded, headcount, revenue estimate, funding, ownership) with an output schema of those fields. Then read each run database with query_dataset and upsert the rows into Target universe (upsert_rows, key Name) so there is one table. Skip the excluded companies.',
        tools: ['batch_enrich', 'query_dataset', 'upsert_rows'],
        frames: ['universe', 'screen'],
      }),
      step({
        id: 'profiles',
        text: 'Profiles: for the shortlisted targets (Status Shortlisted in Target universe) one entity card each, a capture_page of its home and pricing pages, and the team, customers and traction as source cards. Signed-in sources (fetch_signed_in) only when the user ticked them.',
        tools: ['fetch_signed_in', 'fetch_url', 'capture_page', 'place_card', 'web_search'],
        frames: ['profiles'],
      }),
      step({
        id: 'financials',
        text: 'Financial profile: filed numbers where the target is public or files accounts, reported numbers from press and its own pages, estimates (headcount times revenue per head, funding, traffic) otherwise. One Target financials row per target (upsert_rows, key Target) with Basis and, for an estimate, the Method.',
        tools: ['fetch_url', 'parallel_extract', 'web_search', 'upsert_rows'],
        frames: ['financials'],
      }),
      step({
        id: 'comps',
        text: 'Valuation inputs: precedent transactions in the sector (date, acquirer, target, EV, multiples, rationale) into Precedent transactions, listed peers into Trading comps (upsert_rows) with an "as of" date and a Source on every row. PitchBook or Capital IQ when connected (fetch_signed_in).',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'upsert_rows'],
        frames: ['valuation'],
      }),
      step({
        id: 'feasibility',
        text: 'Ownership and feasibility: founders, investors and their stakes and rights into Stakeholders (upsert_rows, key Name), signs of a sale process, a recent round or a competing bidder, and the regulatory review the combination would face. Evidence for synergies too: overlapping customers, shared stack, cross-sell proof and what the target already does that the acquirer pays for elsewhere, as source cards for orb to value.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'upsert_rows', 'place_card'],
        frames: ['feasibility', 'synergies'],
      }),
      step({
        id: 'sweep',
        text: 'A red-flag sweep for each shortlisted target: litigation, regulator actions, security incidents, departures and layoffs, so Critic has sources to clear or raise each flag.',
        tools: ['web_search', 'fetch_url', 'place_card'],
        frames: ['risks'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain (a target revenue estimate, an ownership structure): deep_research (core or above, per the tier). Ask before spend over $0.50.',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      step({
        id: 'start',
        text: "Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) and query Target universe and Target financials (query_dataset) before judging anything.",
        tools: ['board_map', 'search_board', 'read_card', 'query_board', 'query_dataset'],
      }),
      step({
        id: 'red-flags',
        text: 'Work through the red-flag checklist for each shortlisted target, one flag at a time. For each: place a Risk card titled "RFxx raised (Target): ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared (Target): ..." that cites the source card(s) that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card in Approach & next steps. You cannot tick the checklist: the user does.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['risks', 'feasibility'],
      }),
      step({
        id: 'estimates',
        text: 'Challenge every Estimated figure and every rejection: a revenue estimate on one source, a rejection with a thin Reason, or a target dropped for a criterion the mandate never set; and every synergy in Synergies that has no evidence or assumes more than the sources support. Link with "tension" to the card that disagrees, or place a Question.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['universe', 'screen', 'financials', 'valuation', 'synergies'],
      }),
      step({
        id: 'gaps',
        text: 'Turn every gap into a Question card in Approach & next steps, with a link to the card or gap that prompted it.',
        tools: ['place_card', 'add_link'],
        frames: ['approach'],
      }),
      step({
        id: 'report',
        text: 'Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised and for which target.',
        tools: ['report_progress', 'send_message'],
      }),
    ],
    builder: [
      step({
        id: 'screen',
        text: 'The Screening matrix (weighted criteria, scores 0 to 10 from the Target universe rows and the sources, for the top candidates) and the fit-against-feasibility 2x2 (framework, quadrant) with the survivors placed.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['screen'],
      }),
      step({
        id: 'charts',
        text: 'Charts bound to the databases: targets by ownership (Target universe), revenue by target (Target financials), and the precedent multiples as a football field of valuation ranges (Precedent transactions).',
        tools: ['place_card', 'query_dataset'],
        frames: ['universe', 'financials', 'valuation'],
      }),
      step({
        id: 'fit',
        text: 'A diagram of how each top target would sit in the acquirer: product, customers, technology and team joined to the acquirer’s own.',
        tools: ['place_card', 'read_card'],
        frames: ['profiles'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual summary (a design frame): the ranked shortlist, valuation range, the budget and the top risks, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['ranking', 'valuation'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...MA_RUBRIC],
  redFlags: [...MA_FLAGS],

  output: {
    memoTitle: 'M&A screening report: {{acquirer}}',
    citationRule:
      'Every paragraph cites cards; every number cites its source; filed, reported and estimated figures are marked as such.',
    sections: [
      { id: 'summary', title: 'Summary & recommendation', frames: ['ranking', 'risks'], words: 150, guidance: 'The recommendation, the ranked shortlist, the implied price range, the top 3 reasons and the top 3 risks, in at most 150 words.' },
      { id: 'mandate', title: 'Mandate & criteria', frames: ['mandate'], guidance: 'The rationale, the criteria and the deal-breakers, and what was assumed.' },
      { id: 'universe', title: 'Target universe & screen', frames: ['universe', 'screen'], guidance: 'How the universe was built, how many were screened and why the rest were rejected, with the screening matrix and the 2x2.' },
      { id: 'profiles', title: 'Target profiles', frames: ['profiles'], guidance: 'One short profile per shortlisted target.' },
      { id: 'financials', title: 'Financial profile', frames: ['financials'], guidance: 'The financials table with reported against estimated, and the charts.' },
      { id: 'valuation', title: 'Valuation & comps', frames: ['valuation'], guidance: 'Precedent deals, trading comps and the implied EV range against the budget.' },
      { id: 'synergies', title: 'Synergies & integration', frames: ['synergies'], guidance: 'The synergy table with evidence and confidence, and the first-100-days plan.' },
      { id: 'feasibility', title: 'Ownership & feasibility', frames: ['feasibility'], guidance: 'Who owns each target, their likely stance, regulatory review and competing interest.' },
      { id: 'risks', title: 'Risks & mitigants', frames: ['risks'], guidance: 'The red-flag outcomes per target: each raised flag with its mitigant, and the cleared ones in one line.' },
      { id: 'ranking', title: 'Ranking & scorecard', frames: ['ranking'], guidance: 'The rubric table per target, the weighted totals and the bull and bear view.' },
      { id: 'next', title: 'Approach & next steps', frames: ['approach'], guidance: 'The approach plan per target, the ranked questions and the proposed order.' },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{acquirer}} M&A screen',
      includes: ['Mandate', 'Ranked shortlist', 'Implied price range', 'Top risks', 'Recommendation'],
    },
    deckFormat: 'ma-screen',
  },

  tiers: tiersFor({
    quick:
      'No deep research and no entity discovery: search and extract only, a hand-built universe of up to 12 companies, at most 12 cards per frame, and the memo is the summary only.',
    standard:
      'Quick, plus FindAll discovery and batch enrichment of the Target universe and one or two deep-research runs (core), asking before spend.',
    deep:
      'Standard, plus pro or ultra deep research on ownership and revenue estimates, FindAll extension for full coverage and the full report.',
  }),

  followUps: [
    {
      label: 'Widen the search',
      prompt: 'Widen the {{acquirer}} target search: find 20 more candidates that fit the mandate, especially in [region or segment].',
    },
    {
      label: 'Deep dive on a target',
      prompt: 'Go deeper on [target]: product, customers, team, financials, owners and how it would fit inside {{acquirer}}.',
    },
    {
      label: 'Rerun with a new criterion',
      prompt: 'Re-screen the universe with a new criterion: [criterion]. Say which targets enter or leave the shortlist and why.',
    },
    {
      label: 'Draft the outreach',
      prompt: 'Draft the first approach to [target]: the angle, the person to contact, the introduction route and the opening message.',
    },
    {
      label: 'Stress-test the valuation',
      prompt: 'Stress-test the implied price of [target]: which multiples and synergies drive it and what happens at a 20% lower multiple.',
    },
    {
      label: 'Build the case against',
      prompt: 'Build the strongest case against acquiring [target] from the cards on this board, with the evidence that would change your mind.',
    },
  ],

  signedIn: [
    { domain: 'pitchbook.com', label: 'PitchBook', use: 'Private company financials, valuations, investors and precedent deals.' },
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Funding, headcount, investors and acquisitions.' },
    { domain: 'linkedin.com', label: 'LinkedIn', use: 'Founder and executive profiles, headcount and hiring.' },
    { domain: 'capitaliq.com', label: 'S&P Capital IQ', use: 'Public comps, precedent transactions and ownership.' },
  ],

  monitor: {
    query: '{{acquirer}} acquisition targets: funding rounds, sale processes, leadership changes and acquisitions in {{sector|the sector}}',
    why: 'News that changes which targets are available or priced out.',
  },
};
