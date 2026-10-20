/**
 * Company research (P6.13, startup / product): the v1 "Company research" template (id `company`, kept so saved
 * canvases still open) upgraded to a v2 playbook. Human-readable spec: docs/templates/company.md (generated:
 * `pnpm templates:docs`). It profiles a company for a purpose (competitor, partner, employer, customer); the
 * investing templates (VC due diligence, public equity) go deeper on valuation and the competitive analysis template
 * deals with a whole market.
 *
 * Parallel use: find_entities and batch_enrich for competitors, deep_research for gaps, a monitor (Orb, on request)
 * for news about the company. Signed-in: LinkedIn, Crunchbase, Glassdoor.
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

export const CO_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'model',
    name: 'Business model',
    weight: 20,
    anchors: {
      1: 'Unclear how it makes money.',
      3: 'A proven model with ordinary margins.',
      5: 'A strong, repeatable model with expanding revenue per customer.',
    },
    frame: 'model',
  },
  {
    id: 'growth',
    name: 'Growth',
    weight: 20,
    anchors: {
      1: 'Shrinking or flat.',
      3: 'Growing with the market.',
      5: 'Growing well above the market, with signals to match.',
    },
    frame: 'financials',
  },
  {
    id: 'position',
    name: 'Competitive position',
    weight: 20,
    anchors: {
      1: 'A follower in a crowded market.',
      3: 'A solid player with a clear niche.',
      5: 'A leader with a moat.',
    },
    frame: 'market',
  },
  {
    id: 'leadership',
    name: 'Leadership',
    weight: 15,
    anchors: {
      1: 'High turnover or no relevant record.',
      3: 'A competent team with some gaps.',
      5: 'A proven, stable team with deep domain experience.',
    },
    frame: 'people',
  },
  {
    id: 'reputation',
    name: 'Customer reputation',
    weight: 15,
    anchors: {
      1: 'Frequent serious complaints.',
      3: 'Mixed to good reviews.',
      5: 'Strong, consistent praise with named references.',
    },
    frame: 'customers',
  },
  {
    id: 'health',
    name: 'Financial health',
    weight: 10,
    anchors: {
      1: 'Cash trouble signals.',
      3: 'Adequate runway or profitability.',
      5: 'Well funded or profitable with room to invest.',
    },
    frame: 'financials',
  },
];

export const CO_RED_FLAGS = redFlags([
  [
    'Leadership churn: several executives left in the last two years.',
    'Check the People database for short tenures, ex-executives and open leadership roles.',
  ],
  [
    'Layoffs, hiring freezes or a drop in open roles.',
    'Look for layoff news and the hiring trend in the News & events timeline.',
  ],
  [
    'Litigation, regulatory action or an investigation.',
    'Search court, regulator and news sources for the company and its leaders; if none were searched, ask for the search.',
  ],
  [
    'Security incidents or data breaches.',
    'Look for breach news, a status page history and security notices.',
  ],
  [
    'Negative review patterns on service, reliability or billing.',
    'Read the negative quotes in Customers & reputation and count recurring themes.',
  ],
  [
    'Claims that no independent source corroborates (customers, revenue, awards).',
    'For each claim in the Snapshot and Financial facts, find a second source; claimed-only numbers are raised.',
  ],
  [
    'Dependence on a single customer, supplier or platform.',
    'Read the Business model and Customers frames for a dependency the company cannot work without.',
  ],
  [
    'Funding trouble: a down round, a long gap since the last round or a debt-heavy structure.',
    'Read the Financial facts and the funding events; gaps and bridge rounds are raised.',
  ],
  [
    'A well-funded competitor shipping the same product.',
    'Check the Competitors database and the timeline for a funded rival launching the same capability.',
  ],
  [
    'Stale information: key facts older than 12 months presented as current.',
    'Check each fact\'s date; stale facts are marked and a Question asks for a refresh.',
  ],
]);

export const COMPANY: TemplateSpecInput = {
  id: 'company',
  label: 'Company research',
  dot: '#3D5DCF',
  placeholder: 'Which company do you want to research?',
  brief:
    'Profile the company from primary sources where possible, for the purpose in the intake: what it does, how it ' +
    'makes money, its products, leadership, market and competitors, customers and reputation, financials and ' +
    'funding, recent news and direction, and the main risks. Cite filings, official pages and reputable reporting; ' +
    'mark what the company says apart from what independent sources show, and date every figure.',
  titleFrom: '{{company}}: company research',

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
      id: 'purpose',
      label: 'Why you are researching it',
      kind: 'select',
      options: [
        'Understand a competitor',
        'Evaluate as a partner or supplier',
        'Evaluate as an employer',
        'Prepare to sell to it',
        'Screen as an investment',
        'General research',
      ],
      maxLength: 60,
    },
    {
      id: 'questions',
      label: 'What you most want to know',
      kind: 'longtext',
      placeholder: 'How stable is it, and who really buys from it?',
      maxLength: 400,
    },
    { id: 'geography', label: 'HQ and region', kind: 'text', placeholder: 'Berlin, EU', maxLength: 120 },
    {
      id: 'competitors',
      label: 'Known competitors',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout finds more.',
      maxLength: 800,
    },
    materialsField(
      'Drop annual reports, filings, decks, press kits or your own notes (PDF, text, CSV or XLSX). Each becomes a card or database; numbers from them are tagged as reported by the company.',
    ),
    depthField,
    sitesField([
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'crunchbase.com', label: 'Crunchbase' },
      { domain: 'glassdoor.com', label: 'Glassdoor' },
    ]),
  ],

  frames: [
    {
      id: 'snapshot',
      title: 'Snapshot',
      color: 'signal',
      brief:
        'What {{company}} does in a sentence, where it is based, when it was founded, how big it is, who owns it and why ' +
        'it matters for your purpose ({{purpose|general research}}). Questions to answer: {{questions|none given}}.',
      owners: ['orb', 'scout'],
      targets: [
        { type: 'entity', min: 1, note: 'the company' },
        { type: 'metric', min: 5 },
        { type: 'doc', min: 1, note: 'the one-liner' },
      ],
      seeds: [
        {
          type: 'entity',
          data: {
            title: '{{company}}',
            kind: 'org',
            url: '{{website}}',
            location: '{{geography|}}',
            body: 'The company under research, from your intake.',
            facts: [
              { label: 'Purpose', value: '{{purpose|to confirm}}' },
              { label: 'Questions', value: '{{questions|none given}}' },
            ],
          },
          why: 'The company, from your intake.',
        },
        {
          type: 'doc',
          data: {
            title: 'One-liner',
            body: 'What {{company}} does, in one sentence. orb writes it after the first pass.',
          },
          why: 'The one-sentence description.',
        },
        metric('Founded', 'Year, with the source.'),
        metric('Headcount', 'Employees now; say where the count comes from.'),
        metric('Revenue or funding', 'Reported revenue, or total funding raised; mark which and the period.'),
        metric('Customers', 'A count or a named range, with the source.'),
        metric('Locations', 'Countries or offices, with the source.'),
        question('What do I most need to know about {{company}}, given why I am researching it?'),
      ],
      room: 240,
    },
    {
      id: 'model',
      title: 'Business model',
      color: 'sky',
      brief:
        'How {{company}} makes money: who pays, for what, how (subscription, usage, transaction, licence, services, ' +
        'hardware), the pricing headline, the sales motion and where the margin comes from. Draw the flow of money.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'diagram', min: 1, note: 'how money flows' },
        { type: 'framework', min: 1, note: 'pros and cons of the model' },
        { type: 'source', min: 4 },
      ],
      seeds: [
        framework('Business model: pros and cons', 'proscons'),
        question('Who pays, who uses and who decides, and are they the same people?'),
      ],
    },
    {
      id: 'products',
      title: 'Products & offerings',
      color: 'rho',
      brief:
        'What it sells: products and services, who each is for, the pricing, the launch and status, and how they ' +
        'fit together. Screenshots of the main pages and products.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Products' },
        { type: 'product', min: 2, note: 'kind product' },
        { type: 'image', min: 2, note: 'screenshots' },
      ],
      seeds: [db('Products', 'products')],
    },
    {
      id: 'people',
      title: 'Leadership & people',
      color: 'sky',
      brief:
        'Who runs the company: the founders and executives, their backgrounds, tenure and prior companies, the board ' +
        'and the advisors, recent departures, and the hiring signal (open roles, headcount trend, employee sentiment). ' +
        'Public professional information only.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'People' },
        { type: 'entity', min: 2, note: 'the leaders, kind person' },
        { type: 'source', min: 3 },
      ],
      seeds: [db('People', 'people'), question('Who is missing from the leadership team, and who just left?')],
    },
    {
      id: 'market',
      title: 'Market & competitors',
      color: 'rho',
      brief:
        'The market it competes in: size and growth, who the competitors are (direct, indirect, incumbents, ' +
        'substitutes), where {{company}} stands against them and where it wins or loses. Place them on a 2x2.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Competitors, at least 8 rows' },
        { type: 'framework', min: 1, note: 'the 2x2' },
        { type: 'chart', min: 1, note: 'funding or size by competitor' },
        { type: 'metric', min: 2, note: 'market size and growth' },
      ],
      seeds: [
        db('Competitors', 'competitors'),
        chart('Total funding by competitor', 'competitors', 'bar', 'Name', 'Total funding'),
        framework('Positioning 2x2', 'quadrant', { xAxis: 'Product breadth', yAxis: 'Market presence' }),
        metric('Market size', 'Size of the market it serves, with the source and the year.'),
        metric('Market growth', 'Annual growth with its period.'),
      ],
    },
    {
      id: 'customers',
      title: 'Customers & reputation',
      color: 'sky',
      brief:
        'Who buys it and what they say: named customers and case studies, reviews (G2, Capterra, app stores, ' +
        'Trustpilot), the press, awards and social sentiment. Quote positive and negative voices.',
      owners: ['scout'],
      targets: [
        { type: 'database', min: 1, note: 'Customers' },
        { type: 'quote', min: 6, note: 'at least 2 negative' },
        { type: 'metric', min: 1, note: 'review rating' },
      ],
      seeds: [db('Customers', 'customers'), metric('Review rating', 'Average rating and number of reviews, with the site and the date.')],
    },
    {
      id: 'financials',
      title: 'Financials & funding',
      color: 'rho',
      brief:
        'The money side: revenue, growth, profitability and cash where public or reported, funding rounds and investors, ' +
        'ownership and debt. Mark each figure Reported, Estimated or Claimed, with the period. For a private company ' +
        'say plainly what is not public.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Financial facts' },
        { type: 'timeline', min: 1, note: 'funding' },
        { type: 'chart', min: 1, note: 'revenue or funding over time' },
      ],
      seeds: [
        db('Financial facts', 'financials'),
        timeline('Funding and ownership', 'Research started', 'Scout adds rounds, acquisitions and ownership changes, each with a source.'),
        chart('Financial facts over time', 'financials', 'line', 'Period', 'Value', 'Metric'),
      ],
    },
    {
      id: 'news',
      title: 'News & direction',
      color: 'sky',
      brief:
        'What has happened and where it is heading: launches, partnerships, acquisitions, executive moves, controversies, ' +
        'the stated strategy, hiring and the roadmap signals. Dated events with a source each, and your hypotheses ' +
        'about the direction.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'timeline', min: 1, note: 'events of the last 24 months' },
        { type: 'hypothesis', min: 2 },
        { type: 'source', min: 4 },
      ],
      seeds: [
        timeline('News and events', 'Research started', 'Scout adds dated launches, deals, moves and incidents, each with a source.'),
        hypothesis('The strategy is to move up-market', 'Test against the launches, hiring and pricing changes.'),
        hypothesis('The company is investing in a new line of business', 'Test against the news and the job posts.'),
      ],
    },
    {
      id: 'risks',
      title: 'Risks & red flags',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence or clear it with a source. ' +
        'Cover legal, security, reputation, financial and dependency risk.',
      owners: ['critic'],
      targets: [{ type: 'risk', min: 5, note: 'every checklist item cleared with a source or raised' }],
      seeds: [
        checklist(
          'Red-flag checklist',
          CO_RED_FLAGS.map((f) => `${f.id} ${f.text}`),
          'Critic raises or clears each; you tick them off.',
        ),
        emptyRisk('Financial'),
        emptyRisk('Legal and regulatory'),
        emptyRisk('Reputation'),
        emptyRisk('Dependency'),
      ],
    },
    {
      id: 'assessment',
      title: 'Assessment',
      color: 'signal',
      brief:
        'What the research means for your purpose ({{purpose|general research}}): the strengths and weaknesses, the answer ' +
        'to your questions, the score against the rubric with cited evidence, and a recommended next step.',
      owners: ['orb'],
      targets: [
        { type: 'framework', min: 1, note: 'SWOT' },
        { type: 'decision', min: 1 },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
        { type: 'insight', min: 3 },
      ],
      seeds: [
        framework('SWOT: {{company}}', 'swot'),
        {
          type: 'decision',
          data: {
            title: 'What should we do about {{company}}?',
            body: 'Open. orb proposes after the rubric is filled and writes the weighted total in the rationale.',
            options: [
              { label: 'Engage' },
              { label: 'Partner or buy from it' },
              { label: 'Compete differently' },
              { label: 'Monitor only' },
            ],
            status: 'open',
          },
          why: 'Open decision: you choose; orb proposes.',
        },
        {
          type: 'matrix',
          data: {
            title: 'Company scorecard (rubric score x 2, so 10 is a 5)',
            criteria: CO_RUBRIC.map((d) => ({ name: `${d.name} (${d.weight}%)`, weight: d.weight })),
            options: [
              { name: 'orb score', scores: CO_RUBRIC.map(() => null) },
              { name: 'Your score', scores: CO_RUBRIC.map(() => null) },
            ],
          },
          why: 'orb fills one score per dimension with cited evidence; you may override.',
        },
      ],
    },
  ],

  databases: [
    {
      key: 'products',
      name: 'Products',
      frame: 'products',
      purpose: 'Every product or service the company sells.',
      keyColumn: 'Product',
      columns: [
        { name: 'Product', type: 'text' },
        { name: 'What it does', type: 'text' },
        { name: 'For', type: 'text', note: 'The customer it is sold to.' },
        { name: 'Pricing', type: 'text' },
        { name: 'Launched', type: 'date' },
        { name: 'Status', type: 'enum', options: ['Current', 'New', 'Beta', 'Retired'] },
        { name: 'Source', type: 'url' },
      ],
      views: [{ name: 'All', kind: 'table' }, { name: 'By status', kind: 'board', group: 'Status' }],
    },
    {
      key: 'people',
      name: 'People',
      frame: 'people',
      purpose: 'One row per leader, board member or key hire. Public professional information only.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'person' },
        { name: 'Role', type: 'text' },
        { name: 'Background', type: 'text' },
        { name: 'Prior companies', type: 'text' },
        { name: 'Tenure (years)', type: 'number' },
        { name: 'LinkedIn', type: 'url' },
        { name: 'Source', type: 'url' },
        { name: 'Flags', type: 'text', note: 'Short tenure, departure, controversy, unverifiable claim.' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'Flagged', kind: 'table', filter: [{ column: 'Flags', op: 'notEmpty' }] },
      ],
    },
    {
      key: 'competitors',
      name: 'Competitors',
      frame: 'market',
      purpose: 'Direct and indirect competitors. Discovered with find_entities and enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'URL', type: 'url' },
        { name: 'Category', type: 'enum', options: ['Direct', 'Indirect', 'Incumbent', 'Substitute'] },
        { name: 'HQ', type: 'text' },
        { name: 'Founded', type: 'number' },
        { name: 'Headcount', type: 'number' },
        { name: 'Total funding', type: 'currency', note: 'US dollars.' },
        { name: 'Differentiator', type: 'text' },
        { name: 'Threat level', type: 'rating', note: '1 (low) to 5 (high).' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Threat level', dir: 'desc' }] },
        { name: 'By category', kind: 'board', group: 'Category' },
      ],
    },
    {
      key: 'customers',
      name: 'Customers',
      frame: 'customers',
      purpose: 'Named customers and the proof behind each.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'Segment', type: 'text' },
        { name: 'Since', type: 'date' },
        { name: 'Use case', type: 'text' },
        { name: 'Proof', type: 'enum', options: ['Case study', 'Press', 'Review', 'Logo only'] },
        { name: 'Source', type: 'url' },
      ],
      views: [{ name: 'All', kind: 'table' }, { name: 'By proof', kind: 'board', group: 'Proof' }],
    },
    {
      key: 'financials',
      name: 'Financial facts',
      frame: 'financials',
      purpose: 'Every financial figure with its period, how reliable it is and its source.',
      keyColumn: 'Metric',
      columns: [
        { name: 'Metric', type: 'text', note: 'Revenue, profit, cash, funding raised, valuation ...' },
        { name: 'Value', type: 'number' },
        { name: 'Unit', type: 'text', note: 'USD, percent, count.' },
        { name: 'Period', type: 'date', note: 'ISO date or year-month.' },
        { name: 'Basis', type: 'enum', options: ['Reported', 'Estimated', 'Claimed'] },
        { name: 'Source', type: 'url' },
        { name: 'Note', type: 'text' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Period', dir: 'asc' }] },
        { name: 'By basis', kind: 'board', group: 'Basis' },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text: 'Read what the user dropped first: reports, filings, decks, press kits (board_map, read_card, read_source, query_dataset). Put every financial figure from them into Financial facts (upsert_rows) with Basis "Reported" when it comes from a filing or report, otherwise "Claimed", and the file as Source. Hand the company, the purpose and the questions to Scout in the delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['financials'],
      }),
      orbDelegate(
        'Scout first (its eight-step playbook), Builder once Scout has the business model and competitors, Critic once Scout has sources to review.',
      ),
      step({
        id: 'snapshot',
        text: "After Scout's first pass, fill the Snapshot metrics (update_card) and the one-liner, each with a cited figure and its date. Never write a figure you cannot source; say \"not public\" where that is the case.",
        tools: ['query_board', 'search_board', 'update_card'],
        frames: ['snapshot'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (a private company\'s revenue, the strategy), run deep_research (core) on that one question.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'assessment',
        text: 'Answer the user\'s questions with cited Insight cards (each cites at least two cards). Fill the Company scorecard matrix: one 1-to-5 score per rubric dimension (doubled), each with a cited card; the SWOT; the hypotheses (evidence for and against); the Decision with the weighted total in its rationale.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['assessment', 'news'],
      }),
      orbMemo,
      orbMonitor,
    ],
    scout: [
      step({
        id: 'site',
        text: 'The company site first: home, about, products, pricing, customers, careers and press (fetch_url, parallel_extract). capture_page screenshots of the home and pricing pages as image cards in Products & offerings. Source cards for the claims that matter, marked as company claims.',
        tools: ['fetch_url', 'parallel_extract', 'capture_page', 'place_card'],
        frames: ['products', 'snapshot', 'model'],
      }),
      step({
        id: 'products',
        text: 'Products: one Products row each (upsert_rows, key Product) with who it is for, pricing and status; a Product card (kind product) for the main two. The business model: who pays, for what and how, with the pricing headline.',
        tools: ['fetch_url', 'web_search', 'place_card', 'upsert_rows'],
        frames: ['products', 'model'],
      }),
      step({
        id: 'people',
        text: 'Leadership: start with the about page and the press kit. LinkedIn or Crunchbase only via fetch_signed_in, and only if the user ticked them; otherwise public search. One entity card (kind person) per leader and one People row each (upsert_rows, key Name) with the Flags column. Public professional information only.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['people'],
      }),
      step({
        id: 'financials',
        text: 'Financials and funding: filings and reports first, then Crunchbase if connected, press otherwise. One Financial facts row per figure (upsert_rows, key Metric) with period, Basis Reported or Estimated and a Source url; one dated event per round or deal on the Funding and ownership timeline.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'parallel_extract', 'upsert_rows', 'place_card'],
        frames: ['financials'],
      }),
      step({
        id: 'competitors',
        text: 'Competitors: the ones the user named, then find_entities and batch_enrich (HQ, founded, headcount, total funding, differentiator); consolidate into Competitors (upsert_rows, key Name) with a Source url. Market size and growth as metric cards with their source. Quick scan: find_entities and batch_enrich are refused; add rows from web_search.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'fetch_url', 'upsert_rows', 'place_card', 'query_dataset'],
        frames: ['market'],
      }),
      step({
        id: 'customers',
        text: 'Customers and reputation: named customers and case studies into Customers (upsert_rows, key Name); G2, Capterra, app store, Trustpilot and Glassdoor reviews (fetch_signed_in only if ticked) as Quote cards, positive and negative; the average rating metric with the site and date.',
        tools: ['web_search', 'fetch_url', 'fetch_signed_in', 'place_card', 'upsert_rows'],
        frames: ['customers'],
      }),
      step({
        id: 'news',
        text: 'News and direction: dated launches, deals, moves and incidents of the last 24 months on the News and events timeline, each with a source; hiring trend and open roles; the stated strategy. Search litigation, layoffs, breaches and traffic decline so Critic has sources to clear or raise each flag.',
        tools: ['web_search', 'fetch_url', 'fetch_signed_in', 'place_card'],
        frames: ['news', 'risks'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain: deep_research (core or above, per the tier).',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      criticStart,
      criticFlags(['risks', 'people']),
      step({
        id: 'single-source',
        text: 'Challenge every figure or claim with a single source, a company-only source or an old date: link it "tension" to the card that disagrees, or place a Question asking for the second source. Challenge each market-size number.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['market', 'risks'],
      }),
      criticReport,
    ],
    builder: [
      step({
        id: 'model',
        text: 'A diagram of how money flows (who pays whom, for what) and the business model pros and cons (framework), from cards only.',
        tools: ['place_card', 'query_board', 'read_card'],
        frames: ['model'],
      }),
      step({
        id: 'products',
        text: 'How the products fit together as a diagram; a Product card for the main product if Scout has not placed one.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['products'],
      }),
      step({
        id: 'market',
        text: 'The funding chart bound to Competitors, the positioning 2x2 (framework, quadrant) and the SWOT from the cards on the board.',
        tools: ['place_card', 'query_dataset', 'query_board', 'read_card'],
        frames: ['market'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual summary of the company (a design frame): snapshot, business model, leaders, competitors, top risks, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['snapshot', 'assessment'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...CO_RUBRIC],
  redFlags: [...CO_RED_FLAGS],

  output: {
    memoTitle: 'Company profile: {{company}}',
    citationRule:
      'Every paragraph cites cards; every number cites its source, period and basis (reported, estimated or claimed); what the company says is marked apart from what independent sources show.',
    sections: [
      {
        id: 'summary',
        title: 'Summary & assessment',
        frames: ['assessment', 'risks'],
        words: 150,
        guidance: 'What the company is, the answer to the main question, the score and the top three risks, in at most 150 words.',
      },
      {
        id: 'snapshot',
        title: 'Company snapshot',
        frames: ['snapshot'],
        guidance: 'A table of the snapshot facts.',
      },
      {
        id: 'model',
        title: 'Business model',
        frames: ['model'],
        guidance: 'Who pays for what, the pricing headline and the margin logic.',
      },
      {
        id: 'products',
        title: 'Products and offerings',
        frames: ['products'],
        guidance: 'The products, who each is for and how they fit together.',
      },
      {
        id: 'people',
        title: 'Leadership and people',
        frames: ['people'],
        guidance: 'The leaders, their records, departures and hiring signals.',
      },
      {
        id: 'market',
        title: 'Market and competitors',
        frames: ['market'],
        guidance: 'The market, the competitor table and the 2x2.',
      },
      {
        id: 'customers',
        title: 'Customers and reputation',
        frames: ['customers'],
        guidance: 'Named customers, review themes and quotes.',
      },
      {
        id: 'financials',
        title: 'Financials and funding',
        frames: ['financials'],
        guidance: 'The financial facts table with basis and the funding timeline.',
      },
      {
        id: 'news',
        title: 'News and direction',
        frames: ['news'],
        guidance: 'The events timeline and the hypotheses about direction.',
      },
      {
        id: 'risks',
        title: 'Risks and red flags',
        frames: ['risks'],
        guidance: 'The red-flag outcomes: each raised flag with its mitigant, and the cleared ones in one line.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard and next step',
        frames: ['assessment'],
        guidance: 'The rubric table and the recommended next step.',
      },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{company}}',
      includes: ['Snapshot', 'Score', 'Business model', 'Top risks'],
    },
    deckFormat: 'standard',
    deck: {
      title: 'Company profile: {{company}}',
      slides: [
        { title: 'The company in one slide', brief: 'What it does, its size and the assessment.' },
        { title: 'Business model', brief: 'How money flows and the pricing headline.' },
        { title: 'Products', brief: 'The products with screenshots.' },
        { title: 'Leadership', brief: 'The leaders and the changes.' },
        { title: 'Market and competitors', brief: 'The competitor table and the 2x2.' },
        { title: 'Customers and reputation', brief: 'Named customers and review themes.' },
        { title: 'Financials and funding', brief: 'The financial facts and funding timeline.' },
        { title: 'News and direction', brief: 'The events timeline and where it is heading.' },
        { title: 'Risks', brief: 'The raised red flags with mitigants.' },
        { title: 'Assessment and next step', brief: 'The scorecard and the recommendation.' },
      ],
    },
  },

  tiers: tiers({
    quick:
      'Public pages and search only: no deep research, at most 12 cards per frame, a short competitor list and the memo is the summary only.',
    standard:
      'Quick, plus find_entities and batch_enrich for competitors and one or two deep-research runs (core), asking before spend.',
    deep: 'Standard, plus pro or ultra research on the market and the company\'s history, full competitor discovery and the full memo and deck.',
  }),

  followUps: [
    {
      label: 'Go deeper on a product',
      prompt: 'Go deeper on [product] of {{company}}: how it works, pricing, customers and the strongest rival.',
    },
    {
      label: 'Compare with a competitor',
      prompt: 'Compare {{company}} with [competitor]: product, pricing, funding, customers, with a table.',
    },
    {
      label: 'Profile the leadership',
      prompt: 'Profile the leadership of {{company}}: each leader\'s record, tenure and anything that needs checking, public sources only.',
    },
    {
      label: 'Prepare for a meeting',
      prompt: 'Prepare me for a meeting with {{company}}: what to know, the questions to ask and the topics to avoid.',
    },
    {
      label: 'Keep it current',
      prompt: 'Start a monitor on {{company}}: launches, funding, leadership changes, legal and security news.',
    },
    {
      label: 'Build the bear case',
      prompt: 'Build the strongest case against {{company}} from the cards on this board, with the evidence that would change your mind.',
    },
  ],

  signedIn: [
    { domain: 'linkedin.com', label: 'LinkedIn', use: 'Leaders\' backgrounds, tenure, headcount and hiring trend.' },
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Funding rounds, investors, acquisitions and headcount.' },
    { domain: 'glassdoor.com', label: 'Glassdoor', use: 'Employee sentiment, ratings and interview reports.' },
  ],

  monitor: {
    query: '{{company}} news: launches, funding, leadership changes, layoffs, lawsuits and security incidents',
    why: 'News that would change the assessment.',
  },
};
