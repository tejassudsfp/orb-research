/**
 * Public equity deep dive (P6.12). Upgrades and replaces the v1 "Stocks" template: a listed company researched from
 * filings and reporting, valued with scenarios against peers, red-flagged and scored into an equity research note.
 * The human-readable version is docs/templates/public-equity.md (generated: `pnpm templates:docs`).
 * There is no live market data in orb: every price and multiple states its "as of" date.
 */
import type { RedFlag, RubricDimension, TemplateSpecInput } from './schema.js';
import {
  boardView,
  checklist,
  chart,
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

export const EQUITY_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'quality',
    name: 'Business quality & moat',
    weight: 25,
    anchors: {
      1: 'Commodity business, no pricing power, returns below the cost of capital.',
      3: 'Solid franchise with some pricing power and returns above the cost of capital.',
      5: 'Durable moat (network, scale, switching costs) with high, stable returns on capital.',
    },
    frame: 'business',
  },
  {
    id: 'growth',
    name: 'Growth',
    weight: 20,
    anchors: {
      1: 'Shrinking or flat revenue; the market is saturated.',
      3: 'Steady mid-single to low-double-digit growth the company can fund itself.',
      5: 'Durable high growth with a long runway, visible in segment data.',
    },
    frame: 'financials',
  },
  {
    id: 'balance',
    name: 'Financial strength & earnings quality',
    weight: 15,
    anchors: {
      1: 'Leveraged, cash burning, earnings far above cash flow.',
      3: 'Manageable debt, positive free cash flow, earnings broadly match cash.',
      5: 'Net cash or low leverage, strong and clean free cash flow, conservative accounting.',
    },
    frame: 'quality',
  },
  {
    id: 'management',
    name: 'Management & governance',
    weight: 15,
    anchors: {
      1: 'Poor capital allocation, weak governance, insiders selling heavily.',
      3: 'Competent team, reasonable allocation, standard governance.',
      5: 'Owner-operators with a record of value-creating allocation and aligned pay.',
    },
    frame: 'management',
  },
  {
    id: 'valuation',
    name: 'Valuation',
    weight: 25,
    anchors: {
      1: 'Priced for perfection: the base case is below the price.',
      3: 'Fairly priced: the base case is near the price.',
      5: 'Clear margin of safety: the base case is well above the price and the bear case is limited.',
    },
    frame: 'valuation',
  },
];

export const EQUITY_RED_FLAGS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: 'Restatements, auditor changes, a going-concern note or late filings.',
    check: "Search the filings list and news for 8-K Item 4.02, auditor resignations and NT 10-K/10-Q notices.",
  },
  {
    id: 'RF02',
    text: 'A wide and growing gap between adjusted (non-GAAP) and GAAP earnings.',
    check: 'Compare adjusted and GAAP operating income in the Financials database; list what is added back.',
  },
  {
    id: 'RF03',
    text: 'Receivables or inventory growing much faster than revenue.',
    check: 'Check days sales outstanding and inventory days across the periods in Financials and the filings.',
  },
  {
    id: 'RF04',
    text: 'Free cash flow persistently below net income.',
    check: 'Read the FCF and net income columns over at least four periods; a persistent gap is raised.',
  },
  {
    id: 'RF05',
    text: 'Stock-based compensation or dilution that eats the buyback or the earnings.',
    check: 'Compare SBC with free cash flow and the share-count change in Financials.',
  },
  {
    id: 'RF06',
    text: 'A debt maturity wall, covenant pressure or heavy reliance on refinancing.',
    check: 'Read the Debt & liquidity database: maturities in the next 24 months against cash and operating cash flow.',
  },
  {
    id: 'RF07',
    text: 'Customer, supplier or segment concentration.',
    check: 'Look for the 10% customer disclosure, the top-customer share and the share of profit by segment.',
  },
  {
    id: 'RF08',
    text: 'Margin erosion, serial guidance cuts or repeated earnings misses.',
    check: 'Read the Financials margins and the analyst and guidance history; two or more misses in a row are raised.',
  },
  {
    id: 'RF09',
    text: 'Insider selling clusters, pledged shares or unusual related-party transactions.',
    check: 'Read the Management database flags and the insider timeline; cite the Form 4 or proxy line.',
  },
  {
    id: 'RF10',
    text: 'Material litigation, regulatory action, a short-seller report or a government investigation.',
    check: 'Search the legal proceedings note, regulator sites and news for the company and its executives.',
  },
  {
    id: 'RF11',
    text: 'Dividend or buyback payouts above free cash flow.',
    check: 'Compare shareholder returns with FCF over three periods; funding them with debt is raised.',
  },
  {
    id: 'RF12',
    text: 'A technological, regulatory or competitive shift that undermines the core franchise.',
    check: 'Check the Peers database and the industry sources for a rival or a rule that attacks the main profit pool.',
  },
];

export const PUBLIC_EQUITY: TemplateSpecInput = {
  id: 'public-equity',
  label: 'Public equity',
  dot: '#60A5FA',
  placeholder: 'Which listed company or ticker?',
  brief:
    'Run a full public equity deep dive: twelve numbered frames (snapshot, business, financials, earnings quality, ' +
    'industry, management, valuation scenarios, catalysts, sentiment, risks, thesis, open questions), the red-flag ' +
    'checklist, the weighted rubric and an equity research note. Work from filings and reporting, say how recent ' +
    'every figure is (there is no live market data), cite every number and end with a recommendation (Buy, Add, ' +
    'Hold, Trim, Avoid, Short).',
  titleFrom: '{{company}}: public equity deep dive',

  inputs: [
    {
      id: 'company',
      label: 'Company or ticker',
      kind: 'text',
      required: true,
      placeholder: 'Costco Wholesale (COST)',
      maxLength: 120,
    },
    {
      id: 'ticker',
      label: 'Ticker',
      kind: 'text',
      placeholder: 'COST',
      group: 'listing',
      maxLength: 20,
    },
    {
      id: 'exchange',
      label: 'Exchange',
      kind: 'select',
      options: ['NYSE', 'Nasdaq', 'LSE', 'Euronext', 'TSE', 'HKEX', 'NSE / BSE', 'ASX', 'TSX', 'Other'],
      group: 'listing',
      maxLength: 40,
    },
    {
      id: 'position',
      label: 'Your position',
      kind: 'select',
      options: ['Considering a new position', 'Own it', 'Short candidate', 'Watchlist'],
      maxLength: 60,
    },
    {
      id: 'horizon',
      label: 'Holding horizon',
      kind: 'select',
      options: ['Under 1 year', '1 to 3 years', '3 to 5 years', 'More than 5 years'],
      maxLength: 40,
    },
    {
      id: 'sector',
      label: 'Sector / industry',
      kind: 'text',
      placeholder: 'Warehouse retail',
      suggestions: [
        'Technology',
        'Financials',
        'Healthcare',
        'Consumer staples',
        'Consumer discretionary',
        'Industrials',
        'Energy',
        'Utilities',
        'Materials',
        'Real estate',
      ],
      maxLength: 120,
    },
    {
      id: 'thesis',
      label: 'Your thesis or angle',
      kind: 'longtext',
      placeholder: 'Why are you looking at this stock?',
      maxLength: 1500,
    },
    {
      id: 'concerns',
      label: 'Specific concerns to probe',
      kind: 'longtext',
      placeholder: 'Margins, a lawsuit, an accounting question…',
      maxLength: 1500,
    },
    {
      id: 'peers',
      label: 'Known peers',
      kind: 'list',
      placeholder: 'Comma separated tickers or names',
      help: 'Optional. Scout finds more.',
      maxLength: 800,
    },
    materialsField(
      'Drop the annual report (10-K), recent 10-Qs, earnings-call transcripts, your own model (CSV or XLSX) or broker notes. Each becomes a card or database.',
    ),
    depthField,
    sitesField([
      { domain: 'seekingalpha.com', label: 'Seeking Alpha' },
      { domain: 'morningstar.com', label: 'Morningstar' },
      { domain: 'ft.com', label: 'Financial Times' },
      { domain: 'wsj.com', label: 'Wall Street Journal' },
    ]),
  ],

  frames: [
    {
      id: 'snapshot',
      title: 'Snapshot',
      color: 'signal',
      brief:
        'What {{company}} does in one sentence, where and how it is listed, and the headline numbers with their dates: ' +
        'price, market capitalisation, enterprise value, P/E, EV/EBITDA and dividend yield. There is no live market data: ' +
        'every figure says "as of" and where it comes from.',
      owners: ['orb'],
      targets: [target('metric', 6), target('entity', 1, 'the company'), target('doc', 1, 'the one-liner')],
      seeds: [
        {
          type: 'entity',
          data: {
            title: '{{company}}',
            kind: 'org',
            body: 'The listed company under research, from your intake.',
            facts: [
              { label: 'Ticker', value: '{{ticker|to confirm}}' },
              { label: 'Exchange', value: '{{exchange|to confirm}}' },
              { label: 'Sector', value: '{{sector|to confirm}}' },
              { label: 'Your position', value: '{{position|to confirm}}' },
              { label: 'Horizon', value: '{{horizon|to confirm}}' },
            ],
          },
          why: 'The company, from your intake.',
        },
        doc('One-liner', 'What {{company}} does and how it earns, in one sentence. orb writes it after the first pass.'),
        metric('Share price', 'Last close with its date and source ("as of").'),
        metric('Market cap', 'Shares outstanding times price, with the date.'),
        metric('Enterprise value', 'Market cap plus net debt and other claims; show the build.'),
        metric('P/E (TTM)', 'Price over trailing GAAP EPS; say if adjusted.'),
        metric('EV / EBITDA', 'Trailing or forward; say which and the source.'),
        metric('Dividend yield', 'Annual dividend over price, with the payout ratio if known.'),
      ],
      room: 360,
    },
    {
      id: 'business',
      title: 'Business & segments',
      color: 'sky',
      brief:
        'How {{company}} makes money: the segments and their revenue and profit, the geographic mix, the customers, ' +
        'pricing power, the moat and where it is eroding, and what the company says is its strategy. Segment numbers ' +
        'come from the filings, not from summaries.',
      owners: ['scout', 'builder'],
      targets: [
        target('database', 1, 'Segments'),
        target('chart', 1, 'revenue by segment'),
        target('diagram', 1, 'how the business earns, from customer to profit'),
        target('source', 4, 'including the latest annual report'),
      ],
      seeds: [
        db('Segments', 'segments'),
        chart('Revenue by segment', 'bar', 'segments', 'Segment', 'Revenue'),
        question(
          'Where does the profit really come from?',
          'Operating profit by segment and geography, and which line carries the multiple.',
        ),
        question('What is the moat, and what would erode it?', 'Scale, switching costs, network, brand, regulation.'),
      ],
    },
    {
      id: 'financials',
      title: 'Financials',
      color: 'rho',
      brief:
        'Five years of revenue, margins, earnings, cash flow, capital spending and share count from the filings, with the ' +
        'latest quarter and the trend. Growth, operating margin, FCF margin, return on invested capital and leverage, each ' +
        'with the period it covers. Claimed (guidance, management) separate from reported.',
      owners: ['scout', 'orb', 'builder'],
      targets: [
        target('database', 1, 'Financials with at least 5 annual periods'),
        target('metric', 6),
        target('chart', 2, 'revenue and free cash flow over time'),
      ],
      seeds: [
        db('Financials', 'financials'),
        metric('Revenue growth', 'Latest year over year, and the 5-year CAGR.'),
        metric('Operating margin', 'GAAP; say if adjusted and the trend.'),
        metric('FCF margin', 'Operating cash flow less capex, over revenue.'),
        metric('ROIC', 'After-tax operating profit over invested capital; show the method.'),
        metric('Net debt / EBITDA', 'Leverage with the date.'),
        metric('Share count change', 'Diluted shares over 3 to 5 years: buybacks or dilution.'),
        chart('Revenue and net income', 'line', 'financials', 'Period', 'Revenue'),
        chart('Free cash flow', 'bar', 'financials', 'Period', 'Free cash flow'),
      ],
    },
    {
      id: 'quality',
      title: 'Earnings quality & balance sheet',
      color: 'paper',
      brief:
        'Whether the earnings are real and the balance sheet is safe: GAAP against adjusted earnings, accruals, working ' +
        'capital, stock-based compensation, off-balance-sheet items, leases, pensions, debt maturities and liquidity.',
      owners: ['scout', 'critic'],
      targets: [
        target('database', 1, 'Debt & liquidity'),
        target('checklist', 1, 'earnings-quality checks'),
        target('risk', 2),
        target('source', 3),
      ],
      seeds: [
        db('Debt & liquidity', 'debt'),
        checklist('Earnings-quality checks', [
          'Cash conversion: operating cash flow over net income for 4+ years.',
          'GAAP against adjusted earnings: what is added back and is it recurring.',
          'Receivables and inventory against revenue growth.',
          'Stock-based compensation as a share of revenue and of free cash flow.',
          'Leases, pensions and other off-balance-sheet obligations.',
          'Auditor, its opinion and any change.',
        ]),
        question('What does management add back, and would you?', 'Restructuring, SBC, acquisition costs, one-offs that recur.'),
      ],
    },
    {
      id: 'industry',
      title: 'Industry & competition',
      color: 'sky',
      brief:
        'The industry structure and growth, the profit pool, the listed peers with their multiples and operating metrics, ' +
        'private and new entrants, substitutes, regulation and where {{company}} wins and loses against each.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        target('database', 1, 'Peers with at least 6 listed companies'),
        target('matrix', 1),
        target('framework', 1, 'the positioning 2x2'),
        target('source', 3, 'including 1 independent industry report'),
      ],
      seeds: [
        db('Peers', 'peers'),
        matrix(
          'Peer scorecard',
          [
            ['Growth', 25],
            ['Profitability', 25],
            ['Balance sheet', 20],
            ['Moat', 20],
            ['Valuation', 10],
          ],
          ['{{company}}', 'Peer A', 'Peer B'],
          'Placeholder: weighted criteria, scored from the Peers database.',
        ),
        quadrant('Positioning 2x2', 'Growth', 'Profitability'),
      ],
    },
    {
      id: 'management',
      title: 'Management & governance',
      color: 'rho',
      brief:
        'The executives and the board: tenure, track record, ownership, pay and what it is tied to, insider buying and ' +
        'selling, capital-allocation history (buybacks, M&A, dividends, capex), related-party items and shareholder rights.',
      owners: ['scout', 'critic'],
      targets: [
        target('database', 1, 'Management'),
        target('timeline', 1, 'insider activity and executive changes'),
        target('source', 3),
      ],
      seeds: [
        db('Management', 'management'),
        timeline('Insider and leadership timeline', 'Research started', 'Scout adds dated insider trades and executive changes, each with its filing.'),
        question('Has management allocated capital well?', 'Acquisitions against returns, buyback price against value, dividend cover.'),
      ],
    },
    {
      id: 'valuation',
      title: 'Valuation',
      color: 'sky',
      brief:
        'What the price implies and what the company is worth: bear, base and bull scenarios with the assumptions stated ' +
        '(growth, margin, multiple, discount rate), the peer multiples, the implied expectations in the price and the ' +
        'margin of safety. Every assumption cites a card.',
      owners: ['orb', 'builder', 'scout'],
      targets: [
        target('database', 1, 'Valuation scenarios'),
        target('metric', 3, 'base fair value, upside or downside, implied expectations'),
        target('chart', 1, 'scenario values against the price'),
        target('hypothesis', 1, 'what the price is pricing in'),
      ],
      seeds: [
        db('Valuation scenarios', 'scenarios'),
        metric('Base fair value', 'Per share, from the base scenario; the method and the date.'),
        metric('Upside / downside', 'Base fair value against the price, with the bear and bull values.'),
        metric('Implied expectations', 'The growth or margin the current price needs (reverse DCF).'),
        chart('Scenario values per share', 'bar', 'scenarios', 'Scenario', 'Fair value per share'),
        hypothesis('The price already discounts the base case', 'Compare the reverse-DCF expectation with the scenarios.'),
      ],
    },
    {
      id: 'catalysts',
      title: 'Catalysts & calendar',
      color: 'rho',
      brief:
        'Dated events that could move the stock in the horizon: earnings dates, guidance, investor days, product or ' +
        'regulatory decisions, index changes, debt events, lock-ups, and the long-term structural catalysts.',
      owners: ['scout'],
      targets: [target('database', 1, 'Catalysts'), target('timeline', 1, 'upcoming events'), target('source', 3)],
      seeds: [
        db('Catalysts', 'catalysts'),
        timeline('Catalyst calendar', 'Research started', 'Scout adds the dated catalysts, each with its source.'),
      ],
    },
    {
      id: 'sentiment',
      title: 'Sentiment & positioning',
      color: 'sky',
      brief:
        'What the market thinks: analyst ratings and targets, the range of estimates, short interest, institutional and ' +
        'insider ownership, notable holders, the news flow and the main bull and bear arguments in the press. Say how old ' +
        'each data point is.',
      owners: ['scout'],
      targets: [
        target('database', 1, 'Analyst views'),
        target('quote', 4, 'at least 1 bear argument'),
        target('metric', 2, 'short interest and consensus target'),
      ],
      seeds: [
        db('Analyst views', 'analysts'),
        metric('Consensus target', 'Mean or median target with the number of analysts and the date.'),
        metric('Short interest', 'Percent of float or days to cover, with the date.'),
      ],
    },
    {
      id: 'risks',
      title: 'Risks & red flags',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. ' +
        'Also covers valuation risk, macro and rate sensitivity, regulatory and legal risk, concentration and event risk.',
      owners: ['critic'],
      targets: [target('risk', 6, 'every checklist item cleared with a source or raised')],
      seeds: [
        redFlagChecklist('Red-flag checklist', EQUITY_RED_FLAGS),
        emptyRisk('Business'),
        emptyRisk('Financial'),
        emptyRisk('Governance'),
        emptyRisk('Valuation'),
        emptyRisk('Regulatory/Legal'),
        emptyRisk('Macro'),
      ],
    },
    {
      id: 'thesis',
      title: 'Thesis & decision',
      color: 'signal',
      brief:
        'The bull, base and bear cases, the key hypotheses with confidence, what must be true, what would make you wrong, ' +
        'the scoring against the rubric and a recommendation (Buy, Add, Hold, Trim, Avoid, Short) with a sizing view.',
      owners: ['orb'],
      targets: [
        target('framework', 1, 'SWOT'),
        target('decision', 1),
        target('hypothesis', 3, 'with evidence links'),
        target('matrix', 1, 'the filled rubric'),
      ],
      seeds: [
        hypothesis('Thesis: {{company}} compounds value over the horizon', 'Your angle: {{thesis|not given.}} Link supporting and contradicting cards.'),
        hypothesis('Earnings are of high quality and cash-backed', 'Cash conversion and accounting hold up against the checks.'),
        hypothesis('The valuation leaves a margin of safety', 'The base case sits above the price with a limited bear case.'),
        swot('SWOT: {{company}}'),
        decision(
          'Recommendation on {{company}}',
          ['Buy', 'Add', 'Hold', 'Trim', 'Avoid', 'Short'],
          'Open. orb decides after the rubric is filled and writes the weighted total and a sizing view here.',
        ),
        scorecard('Scorecard (rubric score x 2, so 10 is a 5)', EQUITY_RUBRIC),
      ],
    },
    {
      id: 'questions',
      title: 'Open questions',
      color: 'paper',
      brief:
        'Questions for management or the next earnings call, and things to monitor, ranked by importance, each linked to the ' +
        'gap or risk that prompted it. Every unresolved question card on the board is collected here.',
      owners: ['critic', 'orb'],
      targets: [target('checklist', 1, 'at least 10 ranked questions and monitoring items, each linked to its source card')],
      seeds: [
        checklist('Questions and monitoring items', [
          'Your concerns to probe: {{concerns|none given yet}}',
          'Which two numbers in the next quarterly report would change the thesis?',
          'What would make you sell?',
        ]),
      ],
    },
  ],

  databases: [
    {
      key: 'segments',
      name: 'Segments',
      frame: 'business',
      purpose: 'Revenue and profit by business segment and geography, from the filings.',
      keyColumn: 'Segment',
      columns: [
        col('Segment', 'text'),
        col('Revenue', 'currency', { note: 'US dollars, latest fiscal year.' }),
        col('Share of revenue', 'number', { note: 'Percent.' }),
        col('Growth', 'number', { note: 'Percent, year over year.' }),
        col('Operating margin', 'number', { note: 'Percent.' }),
        col('Period', 'text', { note: 'Fiscal year, e.g. FY2025.' }),
        col('Source', 'url'),
      ],
      views: [tableView('All', { sort: [{ column: 'Revenue', dir: 'desc' }] })],
    },
    {
      key: 'financials',
      name: 'Financials',
      frame: 'financials',
      purpose: 'One row per fiscal period: the income statement, cash flow and share count. Reported numbers only.',
      keyColumn: 'Period',
      columns: [
        col('Period', 'text', { note: 'FY2025 or Q3 FY2026.' }),
        col('Revenue', 'currency'),
        col('Gross profit', 'currency'),
        col('Operating income', 'currency'),
        col('Net income', 'currency'),
        col('Diluted EPS', 'number'),
        col('Operating cash flow', 'currency'),
        col('Capex', 'currency'),
        col('Free cash flow', 'currency'),
        col('Diluted shares', 'number', { note: 'Millions.' }),
        col('Basis', 'enum', { options: ['GAAP', 'Adjusted'] }),
        col('Source', 'url'),
      ],
      views: [tableView('By period', { sort: [{ column: 'Period', dir: 'asc' }] })],
    },
    {
      key: 'debt',
      name: 'Debt & liquidity',
      frame: 'quality',
      purpose: 'Every debt instrument and the liquidity that covers it.',
      keyColumn: 'Instrument',
      columns: [
        col('Instrument', 'text'),
        col('Amount', 'currency'),
        col('Rate', 'number', { note: 'Percent.' }),
        col('Maturity', 'date'),
        col('Secured', 'boolean'),
        col('Covenants', 'text'),
        col('Source', 'url'),
      ],
      views: [tableView('By maturity', { sort: [{ column: 'Maturity', dir: 'asc' }] })],
    },
    {
      key: 'peers',
      name: 'Peers',
      frame: 'industry',
      purpose: 'Listed peers with multiples and operating metrics. Discovered with find_entities, enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        col('Name', 'text'),
        col('Ticker', 'text'),
        col('Market cap', 'currency'),
        col('EV / EBITDA', 'number'),
        col('P/E', 'number'),
        col('Revenue growth', 'number', { note: 'Percent.' }),
        col('Operating margin', 'number', { note: 'Percent.' }),
        col('ROIC', 'number', { note: 'Percent.' }),
        col('Relation', 'enum', { options: ['Direct peer', 'Adjacent', 'Larger', 'Smaller'] }),
        col('As of', 'date'),
        col('Source', 'url'),
      ],
      views: [
        tableView('All', { sort: [{ column: 'Market cap', dir: 'desc' }] }),
        boardView('By relation', 'Relation'),
      ],
    },
    {
      key: 'management',
      name: 'Management',
      frame: 'management',
      purpose: 'Executives and directors with tenure, ownership and flags.',
      keyColumn: 'Name',
      columns: [
        col('Name', 'person'),
        col('Role', 'text'),
        col('Since', 'date'),
        col('Prior roles', 'text'),
        col('Ownership', 'number', { note: 'Percent of shares.' }),
        col('Pay and its basis', 'text'),
        col('Insider activity', 'text', { note: 'Recent Form 4 buys and sells.' }),
        col('Source', 'url'),
        col('Flags', 'text', { note: 'Heavy selling, pledged shares, related party, short tenure.' }),
      ],
      views: [tableView('All'), tableView('Flagged', { filter: [{ column: 'Flags', op: 'notEmpty' }] })],
    },
    {
      key: 'scenarios',
      name: 'Valuation scenarios',
      frame: 'valuation',
      purpose: 'Bear, base and bull scenarios with their assumptions and the value per share each implies.',
      keyColumn: 'Scenario',
      columns: [
        col('Scenario', 'enum', { options: ['Bear', 'Base', 'Bull'] }),
        col('Revenue CAGR', 'number', { note: 'Percent, over the explicit period.' }),
        col('Terminal margin', 'number', { note: 'Percent.' }),
        col('Exit multiple', 'number'),
        col('Discount rate', 'number', { note: 'Percent.' }),
        col('Fair value per share', 'currency'),
        col('Upside', 'number', { note: 'Percent against the price on the "as of" date.' }),
        col('Probability', 'number', { note: 'Percent.' }),
        col('Key assumption', 'text'),
      ],
      views: [tableView('By scenario', { sort: [{ column: 'Fair value per share', dir: 'asc' }] })],
    },
    {
      key: 'catalysts',
      name: 'Catalysts',
      frame: 'catalysts',
      purpose: 'Dated events that could move the stock.',
      keyColumn: 'Event',
      columns: [
        col('Date', 'date'),
        col('Event', 'text'),
        col('Type', 'enum', {
          options: ['Earnings', 'Guidance', 'Product', 'Regulatory', 'Capital return', 'Index', 'Legal', 'Macro', 'Other'],
        }),
        col('Direction', 'enum', { options: ['Positive', 'Negative', 'Uncertain'] }),
        col('Expected impact', 'text'),
        col('Source', 'url'),
      ],
      views: [tableView('By date', { sort: [{ column: 'Date', dir: 'asc' }] }), boardView('By type', 'Type')],
    },
    {
      key: 'analysts',
      name: 'Analyst views',
      frame: 'sentiment',
      purpose: 'Sell-side and independent views with their rating, target and main argument.',
      keyColumn: 'Firm',
      columns: [
        col('Firm', 'text'),
        col('Rating', 'enum', { options: ['Buy', 'Hold', 'Sell'] }),
        col('Target price', 'currency'),
        col('Date', 'date'),
        col('Key argument', 'text'),
        col('Source', 'url'),
      ],
      views: [tableView('By date', { sort: [{ column: 'Date', dir: 'desc' }] }), boardView('By rating', 'Rating')],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first: the annual report, 10-Qs, transcripts and your own model (read_card and ' +
          'read_source for files, query_dataset for databases). Hand the peers, the signed-in sources and the position and ' +
          'horizon from the intake to Scout in its delegate instruction. A row an agent wrote can only be changed by that ' +
          'agent: add a new row to correct a figure and say why.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['financials'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first (its playbook), Builder once Scout has placed the Financials and Peers rows, ' +
          'Critic once Scout has sources to review. Name the frames each agent owns.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'snapshot',
        text:
          "After Scout's first pass, fill the Snapshot metrics (update_card on the six placeholders) and the one-liner, " +
          'each with a cited figure and its "as of" date. There is no live market data: never write a price you cannot source.',
        tools: ['query_board', 'search_board', 'update_card'],
        frames: ['snapshot'],
      }),
      step({
        id: 'valuation',
        text:
          'Build the valuation: from Financials and Peers (query_dataset) write the bear, base and bull rows in Valuation ' +
          'scenarios (upsert_rows) with the assumptions stated, then fill the Base fair value, Upside / downside and Implied ' +
          'expectations metrics. Cite the cards each assumption rests on.',
        tools: ['query_dataset', 'upsert_rows', 'update_card', 'read_card'],
        frames: ['valuation'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (a segment split, a footnote, a transcript), run deep_research (core) on that one question. Ask the user before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'rubric',
        text:
          'At the end, fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with ' +
          'at least one cited card in the why line. Then the SWOT, the three hypotheses (evidence for and against as card ids) ' +
          'and the Decision card: your proposed option, a sizing view and the weighted total in its rationale.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['thesis'],
      }),
      step({
        id: 'memo',
        text: 'Write the research note with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only.',
        tools: ['compose_section'],
      }),
      step({
        id: 'questions',
        text: 'Keep the questions current: collect every unresolved Question card into the "Questions and monitoring items" checklist, ranked, each linked to its source card.',
        tools: ['search_board', 'update_card', 'add_link'],
        frames: ['questions'],
      }),
      step({
        id: 'monitor',
        text: 'Only when the user asks to keep watching the stock: watch_topic with the company name and the monitor query. Monitors cost money on every check, so each is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'filings',
        text: 'Primary sources first: the latest annual report and quarterly reports, the proxy statement and the investor-relations page (fetch_url, parallel_extract). The segment note goes into Segments (upsert_rows, key Segment) with the fiscal period and a Source url on every row. Take a capture_page of the investor-relations page for Business & segments.',
        tools: ['fetch_url', 'parallel_extract', 'capture_page', 'place_card', 'upsert_rows'],
        frames: ['business', 'financials'],
      }),
      step({
        id: 'financials',
        text: 'Five years of annual figures and the latest quarters into Financials (upsert_rows, key Period): reported numbers only, Basis GAAP unless a row is adjusted. Add the debt table to Debt & liquidity. Say what each source is in the Source column.',
        tools: ['fetch_url', 'parallel_extract', 'web_search', 'upsert_rows', 'place_card'],
        frames: ['financials', 'quality'],
      }),
      step({
        id: 'peers',
        text: "Peers: add the known peers from the intake first. find_entities discovers more listed peers (the match limit follows the depth tier); it fills its own database card in this frame. batch_enrich fills the Peers columns (ticker, market cap, EV/EBITDA, P/E, growth, margin, ROIC) with an output schema of those fields and an as-of date. Then upsert the rows into the Peers database (upsert_rows, key Name) so there is one table. On the Quick scan tier find_entities and batch_enrich are refused: add a few peers from web_search with upsert_rows instead.",
        tools: ['find_entities', 'batch_enrich', 'web_search', 'upsert_rows', 'query_dataset'],
        frames: ['industry', 'valuation'],
      }),
      step({
        id: 'management',
        text: 'Management and governance: the proxy statement and insider filings (Form 4 summaries, ownership). One Management row per executive and director (upsert_rows, key Name), the Flags column for heavy selling, pledged shares and related-party items, and dated insider events on the timeline. Signed-in sources (fetch_signed_in) only when the user ticked them.',
        tools: ['fetch_signed_in', 'fetch_url', 'web_search', 'upsert_rows', 'place_card'],
        frames: ['management'],
      }),
      step({
        id: 'industry',
        text: 'Industry: at least one independent industry report and the regulatory regime; sources and quotes for the competitive position. Note private and new entrants for Critic.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card'],
        frames: ['industry'],
      }),
      step({
        id: 'catalysts',
        text: 'Catalysts: the earnings calendar, guidance, investor days, regulatory decisions and debt events into Catalysts (upsert_rows, key Event) and the calendar timeline.',
        tools: ['web_search', 'fetch_url', 'upsert_rows', 'place_card'],
        frames: ['catalysts'],
      }),
      step({
        id: 'sentiment',
        text: 'Sentiment: analyst ratings and targets into Analyst views (upsert_rows, key Firm), short interest, institutional ownership and the strongest bull and bear arguments as quote cards (at least one bear). Seeking Alpha or Morningstar when connected (fetch_signed_in). Date every data point.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['sentiment'],
      }),
      step({
        id: 'sweep',
        text: 'A red-flag sweep: search restatements, auditor changes, short-seller reports, litigation and regulator actions so Critic has sources to clear or raise each flag.',
        tools: ['web_search', 'fetch_url', 'place_card'],
        frames: ['risks', 'quality'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain (a segment margin, a litigation outcome, an industry model): deep_research (core or above, per the tier). Ask before spend over $0.50.',
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
        id: 'earnings-quality',
        text: 'Run the earnings-quality checks on the Financials and Debt & liquidity databases (query_dataset): cash conversion, the GAAP against adjusted gap, receivables and inventory against revenue, SBC and the maturity wall. Place a Risk card for each failed check with the figures and links to the rows or cards it rests on.',
        tools: ['query_dataset', 'read_card', 'place_card', 'add_link'],
        frames: ['quality'],
      }),
      step({
        id: 'red-flags',
        text: 'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card in Open questions. You cannot tick the checklist: the user does.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['risks', 'management', 'industry'],
      }),
      step({
        id: 'single-source',
        text: 'Challenge every number that rests on a single source or an "as of" date that is old: link it with "tension" to the card that disagrees, or place a Question asking for the second source. Challenge every valuation assumption, and flag a scenario whose base case needs more than the history supports.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['financials', 'quality', 'industry'],
      }),
      step({
        id: 'gaps',
        text: 'Turn every gap into a Question card in Open questions, with a link to the card or gap that prompted it.',
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
        text: 'Charts bound to the databases: revenue by segment (bar, Segments), revenue and net income and free cash flow over time (line and bar, Financials), and the scenario values per share (bar, Valuation scenarios).',
        tools: ['place_card', 'query_dataset'],
        frames: ['business', 'financials', 'valuation'],
      }),
      step({
        id: 'peers',
        text: 'The peer scorecard (weighted criteria, scores 0 to 10 from the Peers database) and the growth-against-profitability 2x2 (framework, quadrant).',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['industry'],
      }),
      step({
        id: 'flow',
        text: 'A diagram of how the business earns: customer, product, segment, profit pool and the cost that sits between them.',
        tools: ['place_card', 'read_card'],
        frames: ['business'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual summary (a design frame): snapshot, valuation range, score, recommendation and the top risks, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['snapshot', 'valuation', 'thesis'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...EQUITY_RUBRIC],
  redFlags: [...EQUITY_RED_FLAGS],

  output: {
    memoTitle: 'Equity research note: {{company}}',
    citationRule:
      'Every paragraph cites cards; every number cites its source and its "as of" date; reported and estimated figures are marked as such.',
    sections: [
      {
        id: 'summary',
        title: 'Summary & recommendation',
        frames: ['thesis', 'risks'],
        words: 150,
        guidance: 'The recommendation, the score, the base fair value against the price, the top 3 reasons and the top 3 risks, in at most 150 words.',
      },
      { id: 'snapshot', title: 'Company snapshot', frames: ['snapshot'], guidance: 'A table of the snapshot metrics with their dates.' },
      { id: 'business', title: 'Business & segments', frames: ['business'], guidance: 'How it earns, the segment table, the moat and what erodes it.' },
      { id: 'financials', title: 'Financial performance', frames: ['financials'], guidance: 'Five years of growth, margins, cash flow and returns, with the charts.' },
      { id: 'quality', title: 'Earnings quality & balance sheet', frames: ['quality'], guidance: 'GAAP against adjusted, cash conversion, leverage and the maturity profile.' },
      { id: 'industry', title: 'Industry & competition', frames: ['industry'], guidance: 'The peer table, the scorecard and the 2x2, and where the company wins and loses.' },
      { id: 'management', title: 'Management & governance', frames: ['management'], guidance: 'The team, ownership, pay, insider activity and capital allocation.' },
      { id: 'valuation', title: 'Valuation', frames: ['valuation', 'industry'], guidance: 'The scenarios with their assumptions, the peer multiples and what the price implies.' },
      { id: 'catalysts', title: 'Catalysts', frames: ['catalysts'], guidance: 'The dated events and how each could move the stock.' },
      { id: 'sentiment', title: 'Sentiment & positioning', frames: ['sentiment'], guidance: 'Analyst views, short interest, ownership and the main arguments for and against.' },
      { id: 'risks', title: 'Risks & mitigants', frames: ['risks'], guidance: 'The red-flag outcomes: each raised flag with its mitigant, and the cleared ones in one line.' },
      { id: 'thesis', title: 'Thesis: bull, base and bear', frames: ['thesis'], guidance: 'The three cases, the key hypotheses with confidence and what would make us wrong.' },
      { id: 'scorecard', title: 'Scorecard', frames: ['thesis'], guidance: 'The rubric table: each dimension, its weight, its score and its evidence.' },
      { id: 'next', title: 'Open questions & monitoring plan', frames: ['questions', 'catalysts'], guidance: 'The ranked questions, the dated catalysts to watch and what would change the call.' },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{company}}',
      includes: ['Snapshot', 'Valuation range', 'Score', 'Recommendation', 'Top risks'],
    },
    deckFormat: 'equity-ic',
  },

  tiers: tiersFor({
    quick:
      'No deep research: filings, search, extract and signed-in fetches only, at most 12 cards per frame, a handful of peers added by hand, and the memo is the summary only.',
    standard:
      'Quick, plus peer discovery and enrichment and one or two deep-research runs (core), asking before spend.',
    deep:
      'Standard, plus pro or ultra deep research on the industry model and the open footnotes, full peer discovery and the full research note.',
  }),

  followUps: [
    {
      label: 'Stress-test the base case',
      prompt:
        'Stress-test the base case for {{company}}: which two assumptions move the fair value most, and what happens to it if each is 20% worse?',
    },
    {
      label: 'Build the short case',
      prompt:
        'Build the strongest short case for {{company}} from the cards on this board, with the evidence that would change your mind.',
    },
    {
      label: 'Compare to [peer]',
      prompt:
        'Compare {{company}} to [peer]: growth, margins, returns, balance sheet and valuation, side by side with a table.',
    },
    {
      label: 'Prepare earnings-call questions',
      prompt:
        'Draft the questions to ask on the next {{company}} earnings call, ordered by importance and linked to the gaps and risks on the board.',
    },
    {
      label: 'Update with the new quarter',
      prompt:
        'The new quarterly report is out. Add it to Financials, tell me which numbers moved against the base case and update the scenarios.',
    },
    {
      label: 'Size the position',
      prompt:
        'Suggest a position size for {{company}} given the scenarios, the probabilities and my {{horizon|holding}} horizon, and what would make me add or trim.',
    },
  ],

  signedIn: [
    { domain: 'seekingalpha.com', label: 'Seeking Alpha', use: 'Transcripts, analyst articles and the bull and bear arguments.' },
    { domain: 'morningstar.com', label: 'Morningstar', use: 'Fair value estimates, moat ratings and peer financials.' },
    { domain: 'ft.com', label: 'Financial Times', use: 'Reporting and analysis on the company and its sector.' },
    { domain: 'wsj.com', label: 'Wall Street Journal', use: 'Reporting and analysis on the company and its sector.' },
  ],

  monitor: {
    query: '{{company}} earnings, guidance, SEC filings, lawsuits, short-seller reports and executive changes',
    why: 'News that would change the recommendation.',
  },
};
