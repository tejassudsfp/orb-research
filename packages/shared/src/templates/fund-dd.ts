/**
 * Fund / LP manager diligence (P6.12): an LP (or an allocator's analyst) diligencing a fund manager before committing:
 * the firm and team, the strategy and its edge, the track record (fund by fund, verified against benchmarks), the portfolio
 * and exits, terms and economics, operations and references, peers, red flags and a scored recommendation.
 * Human-readable spec: docs/templates/fund-dd.md (generated: `pnpm templates:docs`).
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

export const FUND_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'team',
    name: 'Team & stability',
    weight: 20,
    anchors: {
      1: 'Key-person dependence, recent partner departures, thin bench.',
      3: 'A stable core team with relevant experience and some succession.',
      5: 'A deep, long-tenured team with clear succession and aligned carry.',
    },
    frame: 'team',
  },
  {
    id: 'strategy',
    name: 'Strategy & edge',
    weight: 15,
    anchors: {
      1: 'Generic strategy with no repeatable edge, or drifting from it.',
      3: 'A clear strategy with a plausible edge in sourcing or selection.',
      5: 'A differentiated, repeatable edge that has held up across funds.',
    },
    frame: 'strategy',
  },
  {
    id: 'track',
    name: 'Track record',
    weight: 25,
    anchors: {
      1: 'Bottom-quartile or unverifiable returns, mostly unrealised.',
      3: 'Second-quartile returns with some realisations, verified.',
      5: 'Consistent top-quartile net returns across funds, with distributions, verified.',
    },
    frame: 'track',
  },
  {
    id: 'portfolio',
    name: 'Portfolio quality',
    weight: 15,
    anchors: {
      1: 'Concentrated, marked up without evidence, many write-offs.',
      3: 'Reasonably diversified with sound marks.',
      5: 'High-quality companies, conservative marks and strong follow-on support.',
    },
    frame: 'portfolio',
  },
  {
    id: 'terms',
    name: 'Terms & alignment',
    weight: 15,
    anchors: {
      1: 'Above-market fees, weak GP commitment, poor LP protections.',
      3: 'Market terms with some protections.',
      5: 'Below-market fees or strong hurdles, large GP commitment and strong LP protections.',
    },
    frame: 'terms',
  },
  {
    id: 'ops',
    name: 'Operations & compliance',
    weight: 10,
    anchors: {
      1: 'Weak controls, regulatory history, thin back office.',
      3: 'Adequate controls and a clean record.',
      5: 'Institutional-quality operations, independent administrator and auditor, clean record.',
    },
    frame: 'operations',
  },
];

export const FUND_FLAGS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: 'Track record that cannot be verified, or net returns that are only gross or pro forma.',
    check: 'Compare the manager track record with LP reports, benchmark data and public portfolio information; unverified numbers are raised.',
  },
  {
    id: 'RF02',
    text: 'Returns driven by one or two investments.',
    check: 'Read Portfolio companies and Fund performance: the share of value from the top two deals.',
  },
  {
    id: 'RF03',
    text: 'Key-person dependence or recent partner departures.',
    check: 'Check the Investment team database for departures, short tenures and carry allocation.',
  },
  {
    id: 'RF04',
    text: 'Strategy drift: the new fund is larger or different from the one that produced the record.',
    check: 'Compare fund sizes, sectors, stages and check sizes across funds.',
  },
  {
    id: 'RF05',
    text: 'Fund size growth faster than the team or the strategy can absorb.',
    check: 'Compare the fund size step-up with the team size and the investment pace.',
  },
  {
    id: 'RF06',
    text: 'Aggressive or stale valuations: high unrealised share with no markdowns.',
    check: 'Check RVPI and DPI against realised exits, and the markdown history of the portfolio.',
  },
  {
    id: 'RF07',
    text: 'Low DPI in older funds (distributions that never came).',
    check: 'Read DPI for funds older than seven years in Fund performance.',
  },
  {
    id: 'RF08',
    text: 'Fee, carry or expense terms above market, or unusual fee bases.',
    check: 'Compare the Terms database with prior funds and market norms.',
  },
  {
    id: 'RF09',
    text: 'Weak LP protections: no key-person clause, no-fault removal, a clawback or LPAC rights.',
    check: 'Check the LPA review checklist and the Terms database for each protection.',
  },
  {
    id: 'RF10',
    text: 'Regulatory actions, litigation or a poor compliance history.',
    check: 'Search the regulator filings (for example Form ADV disclosures), court records and news for the firm and its partners.',
  },
  {
    id: 'RF11',
    text: 'Weak operations: no independent administrator, small auditor, or restated reports.',
    check: 'Look for the administrator, auditor and valuation policy in the materials and filings.',
  },
  {
    id: 'RF12',
    text: 'Reference or back-channel feedback that contradicts the pitch.',
    check: 'Read the References database and the negative quotes; recurring themes are raised.',
  },
  {
    id: 'RF13',
    text: 'Concentration: too much of the fund in one sector, region, vintage or company.',
    check: 'Group Portfolio companies by sector, stage and entry year, and check the top positions.',
  },
  {
    id: 'RF14',
    text: 'Conflicts of interest: affiliated funds, related-party deals or co-investment allocation.',
    check: 'Look for affiliates, cross-fund investments and co-invest policy in the materials and filings.',
  },
];

export const FUND_DD: TemplateSpecInput = {
  id: 'fund-dd',
  label: 'Fund / LP diligence',
  dot: '#2563EB',
  placeholder: 'Which fund or manager are you diligencing?',
  brief:
    'Run a full fund-manager diligence as an LP: twelve numbered frames (snapshot, firm and team, strategy, track record, ' +
    'portfolio, exits, terms, operations and references, peers, risks, thesis, open questions), the red-flag checklist, the ' +
    'weighted rubric and an LP investment memo. Separate what the manager reports from what independent sources verify, compare ' +
    'returns with benchmarks and peers, cite every number and end with a recommendation (Pass, Track, Next-stage diligence, Commit).',
  titleFrom: '{{fund}}: fund diligence',

  inputs: [
    {
      id: 'fund',
      label: 'Fund or manager',
      kind: 'text',
      required: true,
      placeholder: 'Acme Ventures Fund IV',
      maxLength: 120,
    },
    {
      id: 'manager',
      label: 'Management firm (GP)',
      kind: 'text',
      placeholder: 'Acme Ventures',
      maxLength: 120,
    },
    {
      id: 'website',
      label: 'Firm website',
      kind: 'url',
      placeholder: 'https://acmeventures.com',
      maxLength: 300,
    },
    {
      id: 'strategy',
      label: 'Strategy',
      kind: 'select',
      options: [
        'Venture capital',
        'Growth equity',
        'Buyout',
        'Real estate',
        'Infrastructure',
        'Private credit',
        'Hedge fund',
        'Fund of funds',
        'Secondaries',
        'Other',
      ],
      group: 'fund',
      maxLength: 40,
    },
    {
      id: 'vintage',
      label: 'Vintage',
      kind: 'text',
      placeholder: '2026',
      group: 'fund',
      maxLength: 20,
    },
    {
      id: 'fund_size',
      label: 'Target fund size',
      kind: 'text',
      placeholder: '$400M',
      group: 'fund',
      maxLength: 60,
    },
    {
      id: 'commitment',
      label: 'Proposed commitment',
      kind: 'text',
      placeholder: '$15M',
      group: 'deal',
      maxLength: 60,
    },
    {
      id: 'terms',
      label: 'Terms offered (if known)',
      kind: 'text',
      placeholder: '2% fee, 20% carry, 8% hurdle, 10-year term',
      group: 'deal',
      maxLength: 200,
    },
    {
      id: 'thesis',
      label: 'Your thesis or angle',
      kind: 'longtext',
      placeholder: 'Why are you looking at this manager? What role would it play in your portfolio?',
      maxLength: 1500,
    },
    {
      id: 'concerns',
      label: 'Specific concerns to probe',
      kind: 'longtext',
      placeholder: 'Fund size step-up, partner turnover, markups…',
      maxLength: 1500,
    },
    {
      id: 'peers',
      label: 'Peer managers to compare',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout finds more.',
      maxLength: 800,
    },
    materialsField(
      'Drop the private placement memorandum (PPM), the due-diligence questionnaire (DDQ), the track-record spreadsheet (CSV or XLSX), the LPA draft and quarterly LP reports. Track records become the Fund performance database.',
    ),
    depthField,
    sitesField([
      { domain: 'pitchbook.com', label: 'PitchBook' },
      { domain: 'preqin.com', label: 'Preqin' },
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'crunchbase.com', label: 'Crunchbase' },
    ]),
  ],

  frames: [
    {
      id: 'snapshot',
      title: 'Snapshot',
      color: 'signal',
      brief:
        'What {{fund}} is in one sentence: the manager, strategy, vintage, target size, the funds before it and the headline ' +
        'numbers of the last fund (net IRR, TVPI, DPI) with the as-of date and whether the manager reported or a source verified them.',
      owners: ['orb'],
      targets: [target('metric', 6), target('entity', 1, 'the manager'), target('doc', 1, 'the one-liner')],
      seeds: [
        {
          type: 'entity',
          data: {
            title: '{{fund}}',
            kind: 'org',
            url: '{{website}}',
            body: 'The manager under diligence, from your intake.',
            facts: [
              { label: 'Fund', value: '{{fund}}' },
              { label: 'Strategy', value: '{{strategy|to confirm}}' },
              { label: 'Vintage', value: '{{vintage|to confirm}}' },
              { label: 'Target size', value: '{{fund_size|to confirm}}' },
              { label: 'Proposed commitment', value: '{{commitment|to confirm}}' },
            ],
          },
          why: 'The manager, from your intake.',
        },
        doc('One-liner', 'What {{fund}} invests in, its edge and the role it would play for you. orb writes it after the first pass.'),
        metric('Fund size', 'Target and hard cap, with the source.'),
        metric('Funds raised to date', 'Number of prior funds and the total raised.'),
        metric('Last fund net IRR', 'Net to LPs, with the as-of date; reported or verified.'),
        metric('Last fund TVPI', 'With the as-of date; reported or verified.'),
        metric('Last fund DPI', 'Distributions over paid-in capital, with the as-of date.'),
        metric('Team size', 'Investment professionals now, with the source.'),
      ],
      room: 300,
    },
    {
      id: 'team',
      title: 'Firm & team',
      color: 'sky',
      brief:
        'Who runs the money: each partner and investment professional with background, tenure at the firm, prior firms and results, ' +
        'focus, carry share, departures and promotions, the firm’s ownership and succession, and the size of the bench against the fund. ' +
        'Key-person risk and attrition are explicit.',
      owners: ['scout', 'critic'],
      targets: [target('database', 1, 'Investment team'), target('entity', 3, 'one person card per partner'), target('source', 4)],
      seeds: [
        db('Investment team', 'team'),
        question('Who makes the decisions, and who would leave first?', 'The partners the returns depend on, their carry and their tenure.'),
        question('How is the firm owned, and what is the succession plan?', 'Founder-led or institutional; who gets carry; who takes over.'),
      ],
    },
    {
      id: 'strategy',
      title: 'Strategy & edge',
      color: 'rho',
      brief:
        'What the manager does and why it should work: the stated strategy, sector, stage, geography and check size, how it sources ' +
        'and selects deals, what it adds after investing, how consistent it has been across funds (style drift), and the evidence ' +
        'of a repeatable edge. Differentiation from peers.',
      owners: ['scout', 'builder'],
      targets: [target('diagram', 1, 'the investment process'), target('matrix', 1, 'strategy against peers'), target('source', 4)],
      seeds: [
        question('What is the repeatable edge?', 'Sourcing, selection or value-add, and the evidence it held across funds.'),
        question('Has the strategy drifted?', 'Sector, stage and check size by fund against what the PPM says.'),
        matrix(
          'Strategy against peers',
          [
            ['Sourcing advantage', 30],
            ['Selection discipline', 25],
            ['Value-add', 20],
            ['Consistency across funds', 25],
          ],
          ['{{fund}}', 'Peer A', 'Peer B'],
          'Placeholder: weighted criteria, scored from the sources.',
        ),
      ],
    },
    {
      id: 'track',
      title: 'Track record',
      color: 'sky',
      brief:
        'Fund by fund: size, vintage, gross and net IRR, TVPI, DPI, RVPI and the quartile against a benchmark, each as reported ' +
        'and as verified, with the as-of dates. Separate realised from unrealised value, and compare with benchmark and peers. A track ' +
        'record spreadsheet you dropped becomes this database.',
      owners: ['scout', 'orb', 'builder', 'critic'],
      targets: [
        target('database', 1, 'Fund performance with reported and verified rows'),
        target('chart', 2, 'TVPI and DPI by fund'),
        target('metric', 3),
        target('source', 3, 'including a benchmark source'),
      ],
      seeds: [
        db('Fund performance', 'performance'),
        chart('TVPI by fund', 'bar', 'performance', 'Fund', 'TVPI'),
        chart('DPI by fund', 'bar', 'performance', 'Fund', 'DPI'),
        metric('Top-quartile funds', 'How many funds are top quartile against the benchmark, with the benchmark and date.'),
        metric('Weighted net IRR', 'Capital-weighted net IRR across funds, with the method.'),
        metric('Loss ratio', 'Share of invested capital in investments below cost.'),
        question('Which of these numbers are verified independently?', 'Each reported figure and the second source behind it.'),
      ],
    },
    {
      id: 'portfolio',
      title: 'Portfolio analysis',
      color: 'rho',
      brief:
        'What the funds own: every portfolio company with fund, entry date, round, amount invested, current value or status, multiple ' +
        'and the source, then concentration by company, sector, stage and vintage, the top contributors to value, markdown history and the ' +
        'quality of the largest positions. Discovered from the manager’s website and press, plus any holdings list you dropped.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        target('database', 1, 'Portfolio companies, at least 15 rows on Standard'),
        target('chart', 2, 'concentration by sector and by company'),
        target('source', 4),
      ],
      seeds: [
        db('Portfolio companies', 'portfolio'),
        chart('Invested by sector', 'bar', 'portfolio', 'Sector', 'Invested'),
        chart('Value by company', 'bar', 'portfolio', 'Company', 'Current value'),
        question('How much of the value sits in the top two positions?', 'Concentration of the return, and how it is marked.'),
      ],
    },
    {
      id: 'exits',
      title: 'Exits & realisations',
      color: 'sky',
      brief:
        'What has actually been returned: every realised exit with its date, route (IPO, M&A, secondary, write-off), proceeds, multiple ' +
        'and holding period, the pace of realisations by vintage and what is likely next.',
      owners: ['scout'],
      targets: [target('database', 1, 'Exits'), target('timeline', 1, 'realisations'), target('source', 3)],
      seeds: [
        db('Exits', 'exits'),
        timeline('Realisations timeline', 'Diligence started', 'Scout adds each exit with its date and source.'),
      ],
    },
    {
      id: 'terms',
      title: 'Terms & economics',
      color: 'rho',
      brief:
        'The deal for LPs: management fee and its base and step-downs, carry, hurdle and catch-up, GP commitment, fund term and ' +
        'extensions, recycling, clawback, key-person clause, no-fault removal, LPAC rights, fee offsets, expenses and co-investment ' +
        'rights, each against the prior fund and the market norm. The net-return impact of fees.',
      owners: ['scout', 'orb', 'critic'],
      targets: [target('database', 1, 'Terms'), target('checklist', 1, 'LPA review'), target('metric', 2), target('framework', 1, 'pros and cons')],
      seeds: [
        db('Terms', 'terms'),
        checklist('LPA review', [
          'Key-person clause: who triggers it and what happens.',
          'No-fault removal and suspension of the investment period.',
          'Clawback: net of tax, escrow or guarantee.',
          'LPAC composition and its rights on conflicts and valuations.',
          'Fee base after the investment period and fee offsets.',
          'Recycling and the fund term with extensions.',
          'GP commitment and how it is funded (cash or fee waiver).',
          'Co-investment rights and allocation policy.',
        ]),
        metric('Fee drag', 'Estimated gross-to-net spread over the fund life, with the assumptions.'),
        metric('GP commitment', 'Percent of the fund and how funded.'),
        proscons('The terms: pros and cons'),
      ],
    },
    {
      id: 'operations',
      title: 'Operations & references',
      color: 'sky',
      brief:
        'The back office and the reputation: administrator, auditor, custodian and valuation policy, compliance and regulatory ' +
        'record (filings, actions, litigation), cybersecurity and ESG policy, insurance, and what references say: portfolio founders, ' +
        'co-investors, other LPs and former employees. Public sources only; calls are for you to make.',
      owners: ['scout', 'critic'],
      targets: [target('database', 1, 'References'), target('quote', 4, 'at least 1 negative'), target('source', 4)],
      seeds: [
        db('References', 'references'),
        question('Who are the references to call, and what should we ask?', 'Portfolio founders who were passed over or marked down, and co-investors.'),
      ],
    },
    {
      id: 'peers',
      title: 'Peers & benchmarks',
      color: 'rho',
      brief:
        'Where the manager sits: peer funds of the same strategy and vintage with size, net IRR, TVPI and quartile, benchmark ' +
        'ranges for each vintage, and a positioning view. Discovered with find_entities and enriched with batch_enrich; benchmark ' +
        'sources are cited.',
      owners: ['scout', 'builder'],
      targets: [target('database', 1, 'Peer funds, at least 8 rows on Standard'), target('framework', 1, 'the 2x2'), target('chart', 1, 'net IRR against peers')],
      seeds: [
        db('Peer funds', 'peers'),
        quadrant('Positioning 2x2', 'Fund size', 'Net IRR'),
        chart('Net IRR against peers', 'bar', 'peers', 'Fund', 'Net IRR'),
      ],
    },
    {
      id: 'risks',
      title: 'Risks & red flags',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Also covers ' +
        'key-person, style drift, concentration, valuation, fee and regulatory risk.',
      owners: ['critic'],
      targets: [target('risk', 6, 'every checklist item cleared with a source or raised')],
      seeds: [
        redFlagChecklist('Red-flag checklist', FUND_FLAGS),
        emptyRisk('Team'),
        emptyRisk('Strategy'),
        emptyRisk('Track record'),
        emptyRisk('Portfolio'),
        emptyRisk('Terms'),
        emptyRisk('Legal/Regulatory'),
      ],
    },
    {
      id: 'thesis',
      title: 'Thesis & decision',
      color: 'signal',
      brief:
        'Why commit and why not: the bull and bear cases, the key hypotheses with confidence, what must be true, the scoring against ' +
        'the rubric, how the fund would fit your portfolio, and a recommendation (Pass, Track, Next-stage diligence, Commit) with the ' +
        'conditions and a suggested commitment size.',
      owners: ['orb'],
      targets: [
        target('framework', 1, 'SWOT'),
        target('decision', 1),
        target('hypothesis', 3, 'with evidence links'),
        target('matrix', 1, 'the filled rubric'),
      ],
      seeds: [
        hypothesis('Thesis: {{fund}} earns top-quartile net returns', 'Your angle: {{thesis|not given.}} Link supporting and contradicting cards.'),
        hypothesis('The track record is real and independently verifiable', 'Reported returns hold up against LP reports, benchmarks and the portfolio.'),
        hypothesis('The team and strategy that produced the record are intact', 'No material turnover or drift since the funds that made the numbers.'),
        swot('SWOT: {{fund}}'),
        decision(
          'Recommendation on {{fund}}',
          ['Pass', 'Track', 'Next-stage diligence', 'Commit'],
          'Open. orb decides after the rubric is filled and writes the weighted total, the conditions and a commitment size here.',
        ),
        scorecard('Scorecard (rubric score x 2, so 10 is a 5)', FUND_RUBRIC),
      ],
    },
    {
      id: 'questions',
      title: 'Open questions',
      color: 'paper',
      brief:
        'Follow-ups for the manager (DDQ gaps, data requests, meetings) and for your own team, ranked by importance, each linked to the ' +
        'gap or risk that prompted it. Every unresolved question card on the board is collected here.',
      owners: ['critic', 'orb'],
      targets: [target('checklist', 1, 'at least 10 ranked questions and data requests, each linked to its source card')],
      seeds: [
        checklist('Questions and data requests', [
          'Your concerns to probe: {{concerns|none given yet}}',
          'Please provide fund-level cash flows (calls and distributions) for every prior fund, so we can recompute net IRR and DPI.',
          'Which investments account for the top 80% of value created, and how are they marked?',
        ]),
      ],
    },
  ],

  databases: [
    {
      key: 'team',
      name: 'Investment team',
      frame: 'team',
      purpose: 'One row per partner and investment professional.',
      keyColumn: 'Name',
      columns: [
        col('Name', 'person'),
        col('Role', 'text'),
        col('Joined', 'date'),
        col('Tenure (years)', 'number'),
        col('Prior firms', 'text'),
        col('Focus', 'text'),
        col('Carry share', 'number', { note: 'Percent, if known.' }),
        col('Status', 'enum', { options: ['Active', 'Departed', 'Transitioning'] }),
        col('LinkedIn', 'url'),
        col('Source', 'url'),
        col('Flags', 'text', { note: 'Departure, short tenure, unverifiable claim, regulatory item.' }),
      ],
      views: [tableView('All'), tableView('Flagged', { filter: [{ column: 'Flags', op: 'notEmpty' }] }), boardView('By status', 'Status')],
    },
    {
      key: 'performance',
      name: 'Fund performance',
      frame: 'track',
      purpose: 'Fund-by-fund performance: reported by the manager and verified by independent sources, with as-of dates.',
      keyColumn: 'Fund',
      columns: [
        col('Fund', 'text'),
        col('Vintage', 'number'),
        col('Size', 'currency'),
        col('Gross IRR', 'number', { note: 'Percent.' }),
        col('Net IRR', 'number', { note: 'Percent.' }),
        col('TVPI', 'number'),
        col('DPI', 'number'),
        col('RVPI', 'number'),
        col('Benchmark quartile', 'enum', { options: ['Top', 'Second', 'Third', 'Bottom', 'Unknown'] }),
        col('As of', 'date'),
        col('Basis', 'enum', { options: ['Reported', 'Verified'], note: 'Manager numbers are Reported.' }),
        col('Source', 'url'),
      ],
      views: [
        tableView('By vintage', { sort: [{ column: 'Vintage', dir: 'asc' }] }),
        boardView('Reported vs verified', 'Basis'),
        boardView('By quartile', 'Benchmark quartile'),
      ],
    },
    {
      key: 'portfolio',
      name: 'Portfolio companies',
      frame: 'portfolio',
      purpose: 'Every portfolio company across the funds.',
      keyColumn: 'Company',
      columns: [
        col('Company', 'text'),
        col('Fund', 'text'),
        col('Sector', 'text'),
        col('Entry date', 'date'),
        col('Entry round', 'text'),
        col('Invested', 'currency'),
        col('Current value', 'currency'),
        col('Multiple', 'number'),
        col('Status', 'enum', { options: ['Active', 'Realised', 'Written off', 'Unknown'] }),
        col('Last mark', 'date'),
        col('Source', 'url'),
        col('Flags', 'text', { note: 'Markdown, down round, layoffs, concentration.' }),
      ],
      views: [
        tableView('By value', { sort: [{ column: 'Current value', dir: 'desc' }] }),
        boardView('By status', 'Status'),
        tableView('Flagged', { filter: [{ column: 'Flags', op: 'notEmpty' }] }),
      ],
    },
    {
      key: 'exits',
      name: 'Exits',
      frame: 'exits',
      purpose: 'Every realised exit with proceeds and multiple.',
      keyColumn: 'Company',
      columns: [
        col('Company', 'text'),
        col('Fund', 'text'),
        col('Date', 'date'),
        col('Route', 'enum', { options: ['IPO', 'M&A', 'Secondary', 'Recap', 'Write-off'] }),
        col('Proceeds', 'currency'),
        col('Multiple', 'number'),
        col('Holding period (years)', 'number'),
        col('Source', 'url'),
      ],
      views: [tableView('By date', { sort: [{ column: 'Date', dir: 'desc' }] }), boardView('By route', 'Route')],
    },
    {
      key: 'terms',
      name: 'Terms',
      frame: 'terms',
      purpose: 'Each economic and governance term against the prior fund and the market norm.',
      keyColumn: 'Term',
      columns: [
        col('Term', 'text'),
        col('This fund', 'text'),
        col('Prior fund', 'text'),
        col('Market norm', 'text'),
        col('Assessment', 'enum', { options: ['Better than market', 'In line', 'Worse than market', 'Unknown'] }),
        col('Source', 'url'),
        col('Note', 'text'),
      ],
      views: [tableView('All'), boardView('By assessment', 'Assessment')],
    },
    {
      key: 'references',
      name: 'References',
      frame: 'operations',
      purpose: 'Public and back-channel references with what each said and who should call them.',
      keyColumn: 'Name',
      columns: [
        col('Name', 'person'),
        col('Relationship', 'enum', { options: ['Portfolio founder', 'Co-investor', 'LP', 'Former employee', 'Service provider', 'Other'] }),
        col('Organisation', 'text'),
        col('Sentiment', 'enum', { options: ['Positive', 'Mixed', 'Negative', 'Unknown'] }),
        col('Summary', 'text'),
        col('Contacted', 'boolean', { note: 'You tick this after a call.' }),
        col('Source', 'url'),
      ],
      views: [tableView('All'), boardView('By sentiment', 'Sentiment')],
    },
    {
      key: 'peers',
      name: 'Peer funds',
      frame: 'peers',
      purpose: 'Peer funds of the same strategy and vintage. Discovered with find_entities, enriched with batch_enrich.',
      keyColumn: 'Fund',
      columns: [
        col('Fund', 'text'),
        col('Manager', 'text'),
        col('Vintage', 'number'),
        col('Size', 'currency'),
        col('Net IRR', 'number', { note: 'Percent.' }),
        col('TVPI', 'number'),
        col('DPI', 'number'),
        col('Benchmark quartile', 'enum', { options: ['Top', 'Second', 'Third', 'Bottom', 'Unknown'] }),
        col('As of', 'date'),
        col('Source', 'url'),
      ],
      views: [tableView('By net IRR', { sort: [{ column: 'Net IRR', dir: 'desc' }] }), boardView('By quartile', 'Benchmark quartile')],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first: the PPM, the DDQ, the track-record spreadsheet, the LPA draft and LP reports ' +
          '(read_card and read_source for files, query_dataset for databases). Put every manager-reported fund number into Fund ' +
          'performance (upsert_rows) with Basis "Reported", and every term in the LPA into Terms. Hand the peers, the concerns and ' +
          'the ticked signed-in sources from the intake to Scout in its delegate instruction. A row an agent wrote can only be ' +
          'changed by that agent: when a reported number is verified, add a new row with Basis "Verified".',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['track', 'terms'],
      }),
      step({
        id: 'delegate',
        text: 'Delegate with delegate: Scout first (team, portfolio, exits, references, peers), Builder once Fund performance and Portfolio companies have rows, Critic once Scout has placed its first sources. Name the frames each agent owns.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'snapshot',
        text:
          "After Scout's first pass, fill the Snapshot metrics (update_card on the six placeholders) and the one-liner, each with a " +
          'cited figure, its as-of date and whether it is reported or verified. Never write a figure you cannot source.',
        tools: ['query_board', 'search_board', 'update_card'],
        frames: ['snapshot'],
      }),
      step({
        id: 'verify',
        text: 'Recompute from Fund performance (query_dataset): the capital-weighted net IRR, the share of funds in the top quartile and the loss ratio from Portfolio companies; fill the Track record metrics and the fee drag from Terms. State the method and the sample.',
        tools: ['query_dataset', 'update_card', 'read_card'],
        frames: ['track', 'terms'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (a fund the manager does not report, a regulatory item), run deep_research (core) on that one question. Ask the user before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'rubric',
        text:
          'At the end, fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least ' +
          'one cited card in the why line. Then the SWOT, the three hypotheses (evidence for and against as card ids) and the Decision ' +
          'card: your proposed option, the conditions, a commitment size and the weighted total in its rationale.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['thesis'],
      }),
      step({
        id: 'memo',
        text: 'Write the LP investment memo with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only.',
        tools: ['compose_section'],
      }),
      step({
        id: 'questions',
        text: 'Keep the follow-ups current: collect every unresolved Question card into the "Questions and data requests" checklist, ranked, each linked to its source card.',
        tools: ['search_board', 'update_card', 'add_link'],
        frames: ['questions'],
      }),
      step({
        id: 'monitor',
        text: 'Only when the user asks to keep watching the manager: watch_topic with the firm name and the monitor query. Monitors cost money on every check, so each is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'firm-site',
        text: 'The firm site: about, team, strategy, portfolio and news pages (fetch_url, parallel_extract). Take a capture_page of the team and portfolio pages for the record. Note every claim about returns, fund size and team for Fund performance and Investment team, as Reported.',
        tools: ['fetch_url', 'parallel_extract', 'capture_page', 'place_card', 'upsert_rows'],
        frames: ['team', 'strategy', 'portfolio'],
      }),
      step({
        id: 'team',
        text: 'The team: start from the partners on the site. Signed-in LinkedIn if connected (fetch_signed_in), otherwise public search. One person card per partner; one Investment team row each (upsert_rows, key Name) with tenure, prior firms and the Flags column for departures, short tenures and unverifiable claims.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['team'],
      }),
      step({
        id: 'track',
        text: 'Track record, verified: for each fund look for independent numbers (public pension and endowment disclosures, LP reports, PitchBook or Preqin when connected with fetch_signed_in, news). Add rows to Fund performance (upsert_rows, key Fund) with Basis "Verified", the as-of date and the Source. Add the benchmark quartile for each vintage from a cited benchmark.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'parallel_extract', 'upsert_rows'],
        frames: ['track'],
      }),
      step({
        id: 'portfolio',
        text: 'Portfolio and exits: every portfolio company from the site, press and filings into Portfolio companies (upsert_rows, key Company) with fund, entry, status and latest known round; every exit into Exits and on the timeline. Mark the latest funding round of each company in Flags when it is a down round or the company had layoffs.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'upsert_rows', 'place_card'],
        frames: ['portfolio', 'exits'],
      }),
      step({
        id: 'peers',
        text: "Peers: add the known peers from the intake first. find_entities discovers more peer funds of the same strategy and vintage (the match limit follows the depth tier); it fills its own database card in this frame. batch_enrich fills the Peer funds columns (manager, vintage, size, net IRR, TVPI, DPI, quartile) with an output schema of those fields and an as-of date. Then upsert the rows into Peer funds (upsert_rows, key Fund) so there is one table. On the Quick scan tier find_entities and batch_enrich are refused: add a few peers from web_search with upsert_rows instead.",
        tools: ['find_entities', 'batch_enrich', 'web_search', 'upsert_rows', 'query_dataset'],
        frames: ['peers'],
      }),
      step({
        id: 'terms',
        text: 'Terms: if no LPA was dropped, search public sources for the manager’s fees, carry and terms (pension fund disclosures, news) and put them in Terms (upsert_rows, key Term) with the Source and the market norm from a cited survey.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'upsert_rows'],
        frames: ['terms'],
      }),
      step({
        id: 'operations',
        text: 'Operations and references: the regulator filings (investment adviser registration and disclosures), litigation, the administrator and auditor, and what portfolio founders, co-investors and employees say publicly (blogs, podcasts, reviews). Quote cards, positive and negative; one References row each (upsert_rows, key Name) with the Sentiment. You do not contact anyone: the calls are the user’s.',
        tools: ['web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['operations'],
      }),
      step({
        id: 'sweep',
        text: 'A red-flag sweep: partner departures, markdowns, fund-size and strategy changes, regulatory actions and litigation, so Critic has sources to clear or raise each flag.',
        tools: ['web_search', 'fetch_url', 'place_card'],
        frames: ['risks', 'team'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain (a fund with no reported numbers, a regulatory history): deep_research (core or above, per the tier). Ask before spend over $0.50.',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      step({
        id: 'start',
        text: "Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) and query Fund performance and Portfolio companies (query_dataset) before judging anything.",
        tools: ['board_map', 'search_board', 'read_card', 'query_board', 'query_dataset'],
      }),
      step({
        id: 'track-check',
        text: 'Challenge the track record: compare Reported with Verified rows fund by fund (query_dataset), check DPI against realised exits, the unrealised share against the markdown history, and the contribution of the top two deals. Place a Risk card for each gap with the figures and links to the rows or cards it rests on.',
        tools: ['query_dataset', 'read_card', 'place_card', 'add_link'],
        frames: ['risks', 'track', 'portfolio'],
      }),
      step({
        id: 'red-flags',
        text: 'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card in Open questions. You cannot tick the checklist: the user does.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['risks', 'team', 'terms', 'operations'],
      }),
      step({
        id: 'gaps',
        text: 'Turn every gap into a Question card in Open questions (a data request for the manager or a question for a reference), with a link to the card or gap that prompted it.',
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
        text: 'Charts bound to the databases: TVPI and DPI by fund (Fund performance), invested by sector and value by company (Portfolio companies), and net IRR against peers (Peer funds).',
        tools: ['place_card', 'query_dataset'],
        frames: ['track', 'portfolio', 'peers'],
      }),
      step({
        id: 'positioning',
        text: 'The strategy-against-peers matrix (weighted criteria, scores 0 to 10 from the sources) and the size-against-net-IRR 2x2 (framework, quadrant) with the manager and its peers placed from Peer funds.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['strategy', 'peers'],
      }),
      step({
        id: 'process',
        text: 'A diagram of the manager’s investment process: sourcing, selection, investment committee, follow-on and exit, from the sources.',
        tools: ['place_card', 'read_card'],
        frames: ['strategy'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual summary (a design frame): snapshot, the fund-by-fund returns, score, recommendation and the top risks, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['snapshot', 'thesis'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...FUND_RUBRIC],
  redFlags: [...FUND_FLAGS],

  output: {
    memoTitle: 'LP investment memo: {{fund}}',
    citationRule:
      'Every paragraph cites cards; every number cites its source and as-of date; reported and verified returns are marked as such.',
    sections: [
      { id: 'summary', title: 'Summary & recommendation', frames: ['thesis', 'risks'], words: 150, guidance: 'The recommendation, the score, the proposed commitment, the top 3 reasons and the top 3 risks, in at most 150 words.' },
      { id: 'snapshot', title: 'Fund snapshot', frames: ['snapshot'], guidance: 'A table of the snapshot metrics: manager, strategy, vintage, size and last-fund returns with their dates.' },
      { id: 'team', title: 'Firm & team', frames: ['team'], guidance: 'The partners and bench, tenure, carry, succession and flags.' },
      { id: 'strategy', title: 'Strategy & edge', frames: ['strategy'], guidance: 'The strategy, the sourcing and selection edge, consistency and drift.' },
      { id: 'track', title: 'Track record', frames: ['track'], guidance: 'The fund-by-fund table, reported against verified, with TVPI and DPI charts and the benchmark quartile.' },
      { id: 'portfolio', title: 'Portfolio & exits', frames: ['portfolio', 'exits'], guidance: 'Concentration, the top positions, marks, and what has been realised.' },
      { id: 'terms', title: 'Terms & economics', frames: ['terms'], guidance: 'The terms table against the prior fund and the market, the fee drag and the LPA protections.' },
      { id: 'operations', title: 'Operations & references', frames: ['operations'], guidance: 'Service providers, compliance record and what references say.' },
      { id: 'peers', title: 'Peers & benchmarks', frames: ['peers'], guidance: 'Where the manager sits against peers and benchmarks, with the 2x2.' },
      { id: 'risks', title: 'Risks & mitigants', frames: ['risks'], guidance: 'The red-flag outcomes: each raised flag with its mitigant, and the cleared ones in one line.' },
      { id: 'thesis', title: 'Thesis: bull vs bear', frames: ['thesis'], guidance: 'The bull and bear cases, the key hypotheses with confidence and the fit with the portfolio.' },
      { id: 'scorecard', title: 'Scorecard', frames: ['thesis'], guidance: 'The rubric table: each dimension, its weight, its score and its evidence.' },
      { id: 'next', title: 'Open questions & next steps', frames: ['questions'], guidance: 'The ranked questions and data requests, the references to call and the proposed next step.' },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{fund}}',
      includes: ['Snapshot', 'Fund-by-fund returns', 'Score', 'Recommendation', 'Top risks'],
    },
    deckFormat: 'lp-ic',
  },

  tiers: tiersFor({
    quick:
      'No deep research and no entity discovery: the firm site, search, extract and signed-in fetches only, a few peers added by hand, at most 12 cards per frame, and the memo is the summary only.',
    standard:
      'Quick, plus peer-fund discovery and enrichment and one or two deep-research runs (core), asking before spend.',
    deep:
      'Standard, plus pro or ultra deep research on the track record and the regulatory history, full peer discovery and the full memo.',
  }),

  followUps: [
    {
      label: 'Draft the DDQ follow-up',
      prompt: 'Draft the follow-up request to {{fund}} after the first pass: the data we need, ordered by importance and linked to the gaps and risks on the board.',
    },
    {
      label: 'Build the bear case',
      prompt: 'Build the bear case for committing to {{fund}}: the strongest argument against, from the cards on this board, with the evidence that would change your mind.',
    },
    {
      label: 'Re-score after the meeting',
      prompt: 'I added the meeting notes. Re-score the rubric with them, say which scores moved and why, and update the decision.',
    },
    {
      label: 'Compare to [manager]',
      prompt: 'Compare {{fund}} to [manager]: team, strategy, net returns, terms and fit, side by side with a table.',
    },
    {
      label: 'Negotiate the terms',
      prompt: 'Which terms of {{fund}} should we push on, with the market norm for each and a priority order?',
    },
    {
      label: 'Size the commitment',
      prompt: 'Suggest a commitment size to {{fund}} given its risk, our {{commitment|proposed}} commitment and how it fits the rest of the portfolio, and the conditions to attach.',
    },
  ],

  signedIn: [
    { domain: 'pitchbook.com', label: 'PitchBook', use: 'Fund returns, benchmarks, portfolio and investor data.' },
    { domain: 'preqin.com', label: 'Preqin', use: 'Fund performance, benchmarks and LP data.' },
    { domain: 'linkedin.com', label: 'LinkedIn', use: 'Partner backgrounds, tenure and team changes.' },
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Portfolio companies, rounds and exits.' },
  ],

  monitor: {
    query: '{{fund}} {{manager|}} fundraise, partner departures, regulatory actions, markdowns and portfolio exits',
    why: 'News that would change the recommendation.',
  },
};
