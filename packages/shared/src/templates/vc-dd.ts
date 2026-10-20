/**
 * VC due diligence (P6.11): the template that sets the depth bar for every later one. The spec is
 * docs/phase6/vc-dd-template.md; the human-readable version of this file is docs/templates/vc-dd.md (generated from it:
 * `pnpm templates:docs`, and a test keeps the two equal).
 */
import type { PlayStepInput, RedFlag, RubricDimension, SeedCard, TemplateSpecInput } from './schema.js';

// ---- the rubric (weights add up to 100) ----

export const VC_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'team',
    name: 'Team',
    weight: 25,
    anchors: {
      1: 'No relevant experience.',
      3: 'Relevant domain experience.',
      5: 'Repeat founders with an exit in the domain.',
    },
    frame: 'team',
  },
  {
    id: 'market',
    name: 'Market',
    weight: 20,
    anchors: {
      1: 'Small or shrinking.',
      3: 'Large but crowded.',
      5: 'Large, fast-growing, with a clear why-now.',
    },
    frame: 'market',
  },
  {
    id: 'product',
    name: 'Product & moat',
    weight: 15,
    anchors: {
      1: 'Commodity.',
      3: 'Clearly differentiated.',
      5: 'Defensible (data, network, or tech moat).',
    },
    frame: 'product',
  },
  {
    id: 'traction',
    name: 'Traction',
    weight: 20,
    anchors: {
      1: 'Pre-product.',
      3: 'Early revenue with growth.',
      5: 'Strong growth with good retention, verified.',
    },
    frame: 'traction',
  },
  {
    id: 'model',
    name: 'Business model',
    weight: 10,
    anchors: {
      1: 'Unclear.',
      3: 'Proven model with okay margins.',
      5: 'Great unit economics.',
    },
    frame: 'gtm',
  },
  {
    id: 'deal',
    name: 'Deal',
    weight: 10,
    anchors: {
      1: 'Overpriced vs comps.',
      3: 'Market price.',
      5: 'Attractive price and terms.',
    },
    frame: 'financing',
  },
];

// ---- the red-flag checklist (Critic clears or raises each) ----

export const VC_RED_FLAGS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: "Founder background claims that can't be verified.",
    check:
      'Compare each founder bio (site, deck, LinkedIn) with an independent source: press, registries, prior-company pages.',
  },
  {
    id: 'RF02',
    text: 'Past litigation, fraud allegations, or regulatory actions involving the company or founders.',
    check:
      "Look for court, regulator and news items on the Team database and Scout's sources; if none were searched, ask for the search.",
  },
  {
    id: 'RF03',
    text: 'Founder departures, or high leadership churn.',
    check: 'Check the Team database for short tenures, ex-executives and open leadership roles.',
  },
  {
    id: 'RF04',
    text: 'Revenue or customer claims with no independent corroboration.',
    check: 'For every claimed KPI and named customer, find a second source; claimed-only numbers are raised.',
  },
  {
    id: 'RF05',
    text: 'Down rounds, flat rounds, bridge notes or long gaps between rounds.',
    check: 'Read the Funding rounds database: valuation steps, round dates and any bridge or extension.',
  },
  {
    id: 'RF06',
    text: 'Customer concentration (>30% revenue from one customer, if knowable).',
    check:
      'Look in the deck, data room and Customers database for revenue by customer; say "not knowable" if absent.',
  },
  {
    id: 'RF07',
    text: 'Negative review patterns (security, reliability, support, billing).',
    check: 'Read the negative quotes and review sources in Customers & signals; count recurring themes.',
  },
  {
    id: 'RF08',
    text: 'Layoffs or hiring freezes (news, layoffs trackers, job-post drops).',
    check: 'Look for layoff news and the hiring trend in the timeline; compare open roles with headcount.',
  },
  {
    id: 'RF09',
    text: 'Dependency on a single platform, API, supplier or regulation.',
    check:
      'Read the product and business-model cards for a platform or supplier the product cannot run without.',
  },
  {
    id: 'RF10',
    text: 'IP or ownership issues (open-source licence exposure, patents, trademark conflicts).',
    check:
      "Look for licence notes, patents or trademark records in Scout's sources; raise if the product leans on code or marks it may not own.",
  },
  {
    id: 'RF11',
    text: 'Unclear or circular unit economics.',
    check:
      'Check that CAC, LTV, payback and margin in the KPIs database are consistent and not derived from each other.',
  },
  {
    id: 'RF12',
    text: 'A well-funded incumbent shipping the same feature.',
    check:
      'Check the Competitors database and timeline for a funded rival or incumbent launching the same capability.',
  },
  {
    id: 'RF13',
    text: 'Domain or web-traffic decline.',
    check:
      'Look for traffic, app-download and search-interest trends in Customers & signals; a decline is raised.',
  },
  {
    id: 'RF14',
    text: 'Security incidents or data breaches.',
    check: 'Look for breach news, a status page history and security-review items in the sources.',
  },
  {
    id: 'RF15',
    text: 'A cap table problem (heavy dilution, dead equity, unusual terms) if a cap table is provided.',
    check:
      'If a cap table was dropped, read it (query_dataset): founder share, option pool, dead equity, preferences. Otherwise mark "no cap table provided".',
  },
];

// ---- seed helpers ----

const metric = (title: string, note: string): SeedCard => ({
  type: 'metric',
  data: { title, value: '—', note },
  why: 'Placeholder: filled with a cited figure.',
});
const question = (title: string, body?: string): SeedCard => ({
  type: 'question',
  data: { title, ...(body ? { body } : {}), state: 'open' },
  why: 'Template question to answer with cards.',
});
const checklist = (title: string, texts: readonly string[]): SeedCard => ({
  type: 'checklist',
  data: { title, items: texts.map((text, i) => ({ id: `i${i + 1}`, text, done: false })) },
  why: 'You tick items; agents propose them.',
});
const emptyRisk = (category: string): SeedCard => ({
  type: 'risk',
  data: {
    title: `${category} risk`,
    body: 'Nothing raised yet. Critic raises a specific risk here with evidence, or clears it with a source.',
    kind: 'risk',
  },
  why: `Pre-seeded ${category} risk category.`,
});
const db = (title: string, key: string): SeedCard => ({ type: 'database', data: { title }, db: key });

/** A step of every plan: tools are checked against the role's allow-list by the tests. */
const step = (s: PlayStepInput): PlayStepInput => ({
  minTier: 'quick',
  frames: [],
  ...s,
});

const ALL_DEEP = [
  'deep_research',
  'research_status',
  'find_entities',
  'find_entities_extend',
  'batch_enrich',
  'entity_search',
  'research_memory',
  'suggest_task_spec',
  'web_answer',
  'parallel_extract',
  'image_search',
];

export const VC_DD: TemplateSpecInput = {
  id: 'vc-dd',
  label: 'VC due diligence',
  dot: '#2563EB',
  placeholder: 'Which company are you diligencing?',
  brief:
    'Run a full venture due diligence on the company: twelve numbered frames (snapshot, team, product, market, ' +
    'traction, customers, competition, business model, financing, risks, thesis, founder questions), the red-flag ' +
    'checklist, the weighted rubric and an investment memo. Separate what the company claims from what independent ' +
    'sources verify, cite every number, and end with a recommendation (Pass, Track, Take meeting, Invest).',
  titleFrom: '{{company}}: VC due diligence',

  // ---- the intake form (Home › VC due diligence chip) ----
  inputs: [
    {
      id: 'company',
      label: 'Company name',
      kind: 'text',
      required: true,
      placeholder: 'Acme Robotics',
      maxLength: 120,
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
      label: 'Stage',
      kind: 'select',
      required: false,
      options: ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Growth'],
      maxLength: 40,
    },
    {
      id: 'round_amount',
      label: 'Round amount',
      kind: 'text',
      placeholder: '$8M',
      group: 'round',
      maxLength: 80,
    },
    {
      id: 'round_valuation',
      label: 'Valuation (if known)',
      kind: 'text',
      placeholder: '$40M post',
      group: 'round',
      maxLength: 80,
    },
    {
      id: 'round_lead',
      label: 'Lead (if known)',
      kind: 'text',
      placeholder: 'Acme Ventures',
      group: 'round',
      maxLength: 120,
    },
    {
      id: 'sector',
      label: 'Sector / category',
      kind: 'text',
      placeholder: 'Vertical SaaS for logistics',
      suggestions: [
        'B2B SaaS',
        'Fintech',
        'Healthtech',
        'Climate',
        'AI / ML infrastructure',
        'Developer tools',
        'Consumer',
        'Marketplace',
        'Hardware',
        'Biotech',
      ],
      group: 'where',
      maxLength: 120,
    },
    {
      id: 'geography',
      label: 'Geography / HQ',
      kind: 'text',
      placeholder: 'Berlin, Germany',
      group: 'where',
      maxLength: 120,
    },
    {
      id: 'thesis',
      label: 'Your thesis or angle',
      kind: 'longtext',
      placeholder: 'Why are you looking at this company?',
      maxLength: 1500,
    },
    {
      id: 'concerns',
      label: 'Specific concerns to probe',
      kind: 'longtext',
      placeholder: 'Churn, key-person risk, a regulator…',
      maxLength: 1500,
    },
    {
      id: 'founders',
      label: 'Founders',
      kind: 'people',
      placeholder: 'One per line: Name, LinkedIn URL (Scout finds them if missing)',
      help: 'Optional.',
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
    {
      id: 'materials',
      label: 'Materials',
      kind: 'materials',
      help: 'Drop the pitch deck, data-room PDFs, the financial model (CSV or XLSX) and the cap table (CSV or XLSX). Each becomes a card or database.',
      maxLength: 400,
    },
    {
      id: 'depth',
      label: 'Depth',
      kind: 'depth',
      required: true,
      help: 'Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending.',
      maxLength: 20,
    },
    {
      id: 'sites',
      label: 'Signed-in sources to use',
      kind: 'sites',
      help: 'Only the sites you connected in Settings can be used. Scout reads them as you, read-only.',
      sites: [
        { domain: 'crunchbase.com', label: 'Crunchbase' },
        { domain: 'pitchbook.com', label: 'PitchBook' },
        { domain: 'linkedin.com', label: 'LinkedIn' },
        { domain: 'docsend.com', label: 'DocSend' },
      ],
      maxLength: 400,
    },
  ],

  // ---- the twelve frames ----
  frames: [
    {
      id: 'snapshot',
      title: 'Snapshot',
      color: 'signal',
      brief:
        'What {{company}} does in one sentence, the stage, the round, HQ, year founded, headcount, total raised, last ' +
        'valuation, key investors and the business model in one line.',
      owners: ['orb'],
      targets: [
        { type: 'metric', min: 6 },
        { type: 'entity', min: 1, note: 'the company' },
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
            body: 'The company under diligence, from your intake.',
            facts: [
              { label: 'Stage', value: '{{stage|to confirm}}' },
              { label: 'Sector', value: '{{sector|to confirm}}' },
              { label: 'Round', value: '{{round_amount|to confirm}}' },
              { label: 'Valuation', value: '{{round_valuation|to confirm}}' },
              { label: 'Lead', value: '{{round_lead|to confirm}}' },
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
        metric('Total raised', 'Cite the source (Crunchbase, press, the company).'),
        metric('Last valuation', 'Post-money of the last priced round, with its date.'),
        metric('Headcount', 'Employees now; say where the count comes from.'),
        metric('Founded', 'Year of incorporation or launch.'),
        metric('Est. revenue / ARR', 'Claimed or estimated; mark which.'),
        metric('Growth rate', 'MoM or YoY; mark claimed or verified.'),
      ],
      room: 360,
    },
    {
      id: 'team',
      title: 'Founders & team',
      color: 'sky',
      brief:
        "Each founder's background, prior companies and outcomes, domain expertise, founder-market fit, how long they " +
        'have worked together, key hires, leadership gaps, board composition, advisor quality, attrition signals and ' +
        'open roles (hiring as a strategy signal).',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'entity', min: 1, note: 'one person card per founder' },
        { type: 'database', min: 1, note: 'the Team database' },
        { type: 'source', min: 3 },
      ],
      seeds: [
        db('Team', 'team'),
        question(
          'What unfair advantage does this team have?',
          'Founder-market fit, prior outcomes, distribution or insight others lack.',
        ),
        question(
          'Who is missing from the leadership team?',
          'Sales, product, technical or finance leadership the next stage needs.',
        ),
      ],
    },
    {
      id: 'product',
      title: 'Problem & product',
      color: 'rho',
      brief:
        'The problem and who feels it, how painful or frequent it is, the current alternatives, the product and how it ' +
        'works, differentiation, technical depth or moat, roadmap signals, a demo or screenshots, and pricing and packaging.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'image', min: 2, note: 'screenshots from capture_page' },
        { type: 'diagram', min: 1, note: 'how it works or the user flow' },
        { type: 'matrix', min: 1 },
        { type: 'source', min: 3 },
      ],
      seeds: [
        question(
          'Is this a painkiller or a vitamin?',
          'Who pays today to solve this, how often, and what happens if they do nothing.',
        ),
        {
          type: 'matrix',
          data: {
            title: 'Product vs alternatives',
            criteria: [
              { name: 'Core capability', weight: 30 },
              { name: 'Ease of use', weight: 20 },
              { name: 'Price', weight: 20 },
              { name: 'Integrations', weight: 15 },
              { name: 'Support and trust', weight: 15 },
            ],
            options: [
              { name: '{{company}}', scores: [null, null, null, null, null] },
              { name: 'Alternative A', scores: [null, null, null, null, null] },
              { name: 'Alternative B', scores: [null, null, null, null, null] },
            ],
          },
          why: 'Placeholder: scored once the alternatives are known.',
        },
      ],
    },
    {
      id: 'market',
      title: 'Market',
      color: 'sky',
      brief:
        'TAM, SAM and SOM both top-down and bottom-up with the method stated, market growth (CAGR), why now (technology, ' +
        'regulation, behaviour), market structure (fragmented or consolidated), the buyer persona and budget owner, and the sales cycle.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'metric', min: 4, note: 'TAM, SAM, SOM, CAGR, each cited' },
        { type: 'chart', min: 2, note: 'size build-up (bar) and growth (line)' },
        { type: 'source', min: 4, note: 'including 1 independent report' },
      ],
      seeds: [
        metric('TAM', 'Cite the source and the method (top-down or bottom-up).'),
        metric('SAM', 'The part of the TAM this product can serve; show the filter.'),
        metric('SOM', 'What is plausibly winnable in 3 to 5 years.'),
        metric('CAGR', 'Market growth rate with its period.'),
        {
          type: 'hypothesis',
          data: {
            title: 'Why now',
            body: 'The technology, regulatory or behavioural shift that makes this company possible today.',
            confidence: 50,
          },
          why: 'Why now: confirm or refute with evidence.',
        },
        db('Market sizing inputs', 'market-inputs'),
      ],
    },
    {
      id: 'traction',
      title: 'Traction & metrics',
      color: 'rho',
      brief:
        'Revenue or ARR, growth (MoM and YoY), customers and logos, retention (gross and net), churn, cohort data if ' +
        'available, CAC, LTV, LTV/CAC, payback, gross margin, burn, runway and unit economics. Separate claimed numbers ' +
        '(the deck) from verified ones (independent sources).',
      owners: ['scout', 'orb', 'critic'],
      targets: [
        { type: 'metric', min: 6 },
        { type: 'chart', min: 1, note: 'bound to the KPIs database' },
        { type: 'database', min: 1, note: 'KPIs with the claimed or verified column filled' },
      ],
      seeds: [
        db('KPIs', 'kpis'),
        metric('ARR', 'Claimed or verified; period and source.'),
        metric('Growth', 'MoM or YoY, with the period.'),
        metric('NRR', 'Net revenue retention; cohort basis if known.'),
        metric('Gross margin', 'Percent, with how it is computed.'),
        metric('Burn', 'Net monthly burn.'),
        metric('Runway', 'Months at the current burn.'),
        {
          type: 'chart',
          data: { title: 'KPIs over time', mark: 'line', x: 'Period', y: 'Value', color: 'Metric' },
          db: 'kpis',
          why: 'Bound to the KPIs database: it fills as rows arrive.',
        },
        question(
          'Which numbers are verified independently?',
          'List each claimed figure and the second source that backs it.',
        ),
      ],
    },
    {
      id: 'customers',
      title: 'Customers & signals',
      color: 'sky',
      brief:
        'Named customers and case studies, reviews (G2, Capterra, App Store, Trustpilot), social sentiment, web traffic ' +
        'and app-download trends if available, hiring velocity, GitHub activity for developer tools, press and awards, partnerships.',
      owners: ['scout'],
      targets: [
        { type: 'database', min: 1, note: 'Customers' },
        { type: 'quote', min: 4, note: 'at least 1 negative' },
        { type: 'timeline', min: 1, note: 'momentum events' },
      ],
      seeds: [
        db('Customers', 'customers'),
        {
          type: 'timeline',
          data: {
            title: 'Momentum',
            events: [
              {
                date: '{{year}}',
                label: 'Due diligence started',
                detail: 'Scout adds dated events (launches, customers, hires, press), each with a source.',
                source: { label: 'orb template' },
              },
            ],
          },
          why: 'Placeholder: Scout fills the momentum events.',
        },
      ],
    },
    {
      id: 'competition',
      title: 'Competition',
      color: 'rho',
      brief:
        'Direct and indirect competitors, incumbents, substitutes, positioning, pricing, the funding of each, ' +
        'differentiation claims against reality, switching costs, and who is winning and why.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'at least 8 competitors' },
        { type: 'matrix', min: 1 },
        { type: 'framework', min: 1, note: 'the 2x2' },
        { type: 'chart', min: 1, note: 'funding by competitor' },
      ],
      seeds: [
        db('Competitors', 'competitors'),
        {
          type: 'matrix',
          data: {
            title: 'Competitor comparison',
            criteria: [
              { name: 'Product depth', weight: 25 },
              { name: 'Distribution', weight: 20 },
              { name: 'Funding and runway', weight: 20 },
              { name: 'Pricing', weight: 15 },
              { name: 'Customer proof', weight: 20 },
            ],
            options: [
              { name: '{{company}}', scores: [null, null, null, null, null] },
              { name: 'Competitor A', scores: [null, null, null, null, null] },
              { name: 'Competitor B', scores: [null, null, null, null, null] },
            ],
          },
          why: 'Placeholder: weighted criteria, scored from the Competitors database.',
        },
        {
          type: 'framework',
          data: {
            title: 'Positioning 2x2',
            variant: 'quadrant',
            xAxis: 'Product breadth',
            yAxis: 'Go-to-market strength',
            cells: {},
          },
          why: 'Placeholder: Builder places each competitor on the axes.',
        },
      ],
    },
    {
      id: 'gtm',
      title: 'Business model & GTM',
      color: 'sky',
      brief:
        'The revenue model, pricing, ACV, sales motion (product-led, sales-led or channel), channels, CAC sources, ' +
        'expansion levers, partnerships and international plans.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'framework', min: 1, note: 'pros and cons of the GTM motion' },
        { type: 'source', min: 3 },
      ],
      seeds: [
        {
          type: 'framework',
          data: { title: 'GTM motion: pros and cons', variant: 'proscons', cells: {} },
          why: 'Placeholder: pros and cons of the sales motion.',
        },
        question(
          'What has to be true for this GTM to scale 10x?',
          "Sales capacity, channel economics, expansion and the buyer's budget cycle.",
        ),
      ],
    },
    {
      id: 'financing',
      title: 'Financing & cap table',
      color: 'rho',
      brief:
        'Funding history (rounds, dates, amounts, valuations, leads), investor quality, the cap table if provided, ' +
        'dilution, the option pool, the use of proceeds for this round, and implied valuation multiples against comparables.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'database', min: 2, note: 'Funding rounds and Comparable valuations' },
        { type: 'timeline', min: 1 },
        { type: 'metric', min: 1, note: 'implied multiple' },
      ],
      seeds: [
        db('Funding rounds', 'funding'),
        {
          type: 'timeline',
          data: {
            title: 'Funding timeline',
            events: [
              {
                date: '{{year}}',
                label: 'This round under review',
                detail: '{{round_amount|Amount to confirm}} {{round_valuation}} {{round_lead}}',
                source: { label: 'intake' },
              },
            ],
          },
          why: 'Placeholder: one event per round, each with a source.',
        },
        db('Comparable valuations', 'comps'),
        metric('Implied multiple', 'Valuation divided by ARR; compare with the comps.'),
      ],
    },
    {
      id: 'risks',
      title: 'Risks & red flags',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. ' +
        'Also covers key-person risk, concentration risk, regulatory and legal risk, technical risk and market timing.',
      owners: ['critic'],
      targets: [{ type: 'risk', min: 6, note: 'every checklist item cleared with a source or raised' }],
      seeds: [
        {
          type: 'checklist',
          data: {
            title: 'Red-flag checklist',
            items: VC_RED_FLAGS.map((f, i) => ({ id: `rf${i + 1}`, text: `${f.id} ${f.text}`, done: false })),
          },
          why: 'Critic raises or clears each; you tick them off.',
        },
        emptyRisk('Team'),
        emptyRisk('Market'),
        emptyRisk('Product'),
        emptyRisk('Competition'),
        emptyRisk('Financial'),
        emptyRisk('Legal/Regulatory'),
      ],
    },
    {
      id: 'thesis',
      title: 'Thesis & decision',
      color: 'signal',
      brief:
        'The bull case, the bear case, key hypotheses with confidence, what must be true, the scoring against the ' +
        'rubric, and a recommendation (Pass, Track, Take meeting, Invest) with conditions.',
      owners: ['orb'],
      targets: [
        { type: 'framework', min: 1, note: 'SWOT' },
        { type: 'decision', min: 1 },
        { type: 'hypothesis', min: 3, note: 'with evidence links' },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
      ],
      seeds: [
        {
          type: 'hypothesis',
          data: {
            title: 'Thesis: {{company}} is a venture-scale opportunity',
            body: 'Your angle: {{thesis|not given.}} Link the cards that support it and the cards that contradict it.',
            confidence: 50,
          },
          why: 'From your thesis.',
        },
        {
          type: 'hypothesis',
          data: {
            title: 'The traction is real and independently verifiable',
            body: 'Claimed numbers hold up against independent sources.',
            confidence: 50,
          },
          why: 'Standing hypothesis.',
        },
        {
          type: 'hypothesis',
          data: {
            title: 'The round is priced fairly against comparable companies',
            body: 'Implied multiple and terms against the comps database.',
            confidence: 50,
          },
          why: 'Standing hypothesis.',
        },
        {
          type: 'framework',
          data: { title: 'SWOT: {{company}}', variant: 'swot', cells: {} },
          why: 'Placeholder: filled from the cards of the other frames.',
        },
        {
          type: 'decision',
          data: {
            title: 'Recommendation on {{company}}',
            body: 'Open. orb decides after the rubric is filled and writes the weighted total here.',
            options: [
              { label: 'Pass' },
              { label: 'Track' },
              { label: 'Take meeting' },
              { label: 'Proceed to term sheet' },
            ],
            status: 'open',
          },
          why: 'Open decision: the user chooses; orb proposes.',
        },
        {
          type: 'matrix',
          data: {
            title: 'Scorecard (rubric score x 2, so 10 is a 5)',
            criteria: VC_RUBRIC.map((d) => ({ name: `${d.name} (${d.weight}%)`, weight: d.weight })),
            options: [
              { name: 'orb score', scores: VC_RUBRIC.map(() => null) },
              { name: 'Your score', scores: VC_RUBRIC.map(() => null) },
            ],
          },
          why: 'orb fills one score per dimension with cited evidence; you may override.',
        },
      ],
    },
    {
      id: 'questions',
      title: 'Open questions for founders',
      color: 'paper',
      brief:
        'Questions for the next meeting, ranked by importance, each linked to the gap or risk that prompted it. Every ' +
        'unresolved question card on the board is collected here.',
      owners: ['critic', 'orb'],
      targets: [
        { type: 'checklist', min: 1, note: 'at least 10 ranked questions, each linked to its source card' },
      ],
      seeds: [
        checklist('Founder call questions', [
          'Your concerns to probe: {{concerns|none given yet}}',
          'Walk us through the three numbers you watch every week.',
          'What would make you stop building this?',
        ]),
      ],
    },
  ],

  // ---- the databases ----
  databases: [
    {
      key: 'team',
      name: 'Team',
      frame: 'team',
      purpose: 'One row per founder, executive and key hire.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'person' },
        { name: 'Role', type: 'text' },
        { name: 'Background', type: 'text' },
        { name: 'Prior companies', type: 'text' },
        { name: 'Prior exits', type: 'text', note: 'Outcome and year, or none.' },
        { name: 'Tenure (years)', type: 'number', note: 'At this company.' },
        { name: 'LinkedIn', type: 'url' },
        { name: 'Source', type: 'url' },
        { name: 'Flags', type: 'text', note: 'Short tenure, unverifiable claim, litigation, departure.' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'Flagged', kind: 'table', filter: [{ column: 'Flags', op: 'notEmpty' }] },
      ],
    },
    {
      key: 'market-inputs',
      name: 'Market sizing inputs',
      frame: 'market',
      purpose: 'Every assumption behind a TAM, SAM or SOM figure, so the build-up can be checked.',
      keyColumn: 'Assumption',
      columns: [
        { name: 'Assumption', type: 'text' },
        { name: 'Value', type: 'number' },
        { name: 'Unit', type: 'text' },
        { name: 'Source', type: 'url' },
        { name: 'Confidence', type: 'enum', options: ['Low', 'Medium', 'High'] },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By confidence', kind: 'board', group: 'Confidence' },
      ],
    },
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
        { name: 'Basis', type: 'enum', options: ['Claimed', 'Verified'], note: 'Deck numbers are Claimed.' },
        { name: 'Source', type: 'url' },
        { name: 'Note', type: 'text' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Period', dir: 'asc' }] },
        { name: 'Claimed vs verified', kind: 'board', group: 'Basis' },
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
        { name: 'Size', type: 'text', note: 'Employees or revenue band.' },
        { name: 'Since', type: 'date' },
        { name: 'Source', type: 'url' },
        { name: 'Quote', type: 'text' },
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
      purpose: 'Direct and indirect competitors. Discovered with find_entities, enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'URL', type: 'url' },
        { name: 'Category', type: 'enum', options: ['Direct', 'Indirect', 'Incumbent', 'Substitute'] },
        { name: 'HQ', type: 'text' },
        { name: 'Founded', type: 'number' },
        { name: 'Total funding', type: 'currency', note: 'US dollars.' },
        { name: 'Last round', type: 'text' },
        { name: 'Headcount', type: 'number' },
        { name: 'Pricing', type: 'text' },
        { name: 'Key differentiator', type: 'text' },
        { name: 'Threat level', type: 'rating', note: '1 (low) to 5 (high).' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Threat level', dir: 'desc' }] },
        { name: 'By category', kind: 'board', group: 'Category' },
        { name: 'High threat', kind: 'table', filter: [{ column: 'Threat level', op: 'gte', value: 4 }] },
      ],
    },
    {
      key: 'funding',
      name: 'Funding rounds',
      frame: 'financing',
      purpose: 'Every round the company raised.',
      keyColumn: 'Round',
      columns: [
        { name: 'Round', type: 'text' },
        { name: 'Date', type: 'date' },
        { name: 'Amount', type: 'currency', note: 'US dollars.' },
        { name: 'Pre-money valuation', type: 'currency' },
        { name: 'Post-money valuation', type: 'currency' },
        { name: 'Lead', type: 'text' },
        { name: 'Participants', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [{ name: 'By date', kind: 'table', sort: [{ column: 'Date', dir: 'asc' }] }],
    },
    {
      key: 'comps',
      name: 'Comparable valuations',
      frame: 'financing',
      purpose: 'Valuations of comparable companies, to judge the price of this round.',
      keyColumn: 'Company',
      columns: [
        { name: 'Company', type: 'text' },
        { name: 'Round', type: 'text' },
        { name: 'Valuation', type: 'currency' },
        { name: 'Revenue multiple', type: 'number' },
        { name: 'Date', type: 'date' },
        { name: 'Source', type: 'url' },
      ],
      views: [{ name: 'By multiple', kind: 'table', sort: [{ column: 'Revenue multiple', dir: 'desc' }] }],
    },
  ],

  // ---- the agent playbook (injected into each agent's first assignment) ----
  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first: the pitch deck, data-room PDFs, the financial model and the cap table ' +
          '(read_card and read_source for files, query_dataset for databases). Put every deck number into the KPIs ' +
          'database (upsert_rows) with Basis "Claimed". Hand the founders, the known competitors and the ticked ' +
          'signed-in sources from the intake to Scout in its delegate instruction. A row an agent wrote can only be ' +
          'changed by that agent: when a claimed number is verified, add a new row with Basis "Verified".',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['traction'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first (its eight-step playbook), Builder once Scout has placed its first ' +
          'sources, Critic once Scout has sources to review. Name the frames each agent owns.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'snapshot',
        text:
          "After Scout's first pass, fill the Snapshot metrics (update_card on the six placeholders) and the one-liner, " +
          'each with a cited figure. Never write a figure you cannot source.',
        tools: ['query_board', 'search_board', 'update_card'],
        frames: ['snapshot'],
      }),
      step({
        id: 'unit-economics',
        text: 'Compute the implied valuation multiple and the unit economics from the KPIs and Funding rounds databases (query_dataset), and update the Implied multiple metric.',
        tools: ['query_dataset', 'update_card'],
        frames: ['financing', 'traction'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close, run deep_research (core) on that one question. Ask the user before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],

        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'rubric',
        text:
          'At the end, fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each ' +
          'with at least one cited card in the why line. Then the SWOT, the three hypotheses (evidence for and against ' +
          'as card ids) and the Decision card: your proposed option and the weighted total in its rationale.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['thesis'],
      }),
      step({
        id: 'memo',
        text: 'Write the memo with compose_section, section by section in the order of the memo outline, then the one-page summary. On the Quick tier write the summary only.',
        tools: ['compose_section'],
      }),
      step({
        id: 'questions',
        text: 'Keep the founder questions current: collect every unresolved Question card into the "Founder call questions" checklist, ranked, each linked to its source card.',
        tools: ['search_board', 'update_card', 'add_link'],
        frames: ['questions'],
      }),
      step({
        id: 'monitor',
        text: 'Only when the user asks to keep watching the company: watch_topic with the company name and the monitor query. Monitors cost money on every check, so each is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'company-site',
        text: 'The company site: home, about/team, pricing and customers pages (fetch_url). Take capture_page screenshots of the home and pricing pages and place them as image cards in Problem & product. Note the pricing and sales motion for Business model & GTM, and any traction claims (ARR, growth, logos) as KPIs rows with Basis "Claimed" until a second source verifies them.',
        tools: ['fetch_url', 'parallel_extract', 'capture_page', 'place_card', 'upsert_rows'],
        frames: ['product', 'team', 'customers', 'gtm', 'traction'],
      }),
      step({
        id: 'founders',
        text: 'Founders: start from the founders named in the intake. Signed-in LinkedIn or Crunchbase if the user connected them (fetch_signed_in), otherwise public search. One person card per founder; one Team row each (upsert_rows, key Name), with the Flags column for short tenures, unverifiable claims, litigation and departures.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['team'],
      }),
      step({
        id: 'funding',
        text: 'Funding history: Crunchbase or PitchBook if connected (fetch_signed_in), press otherwise. One row per round in Funding rounds (upsert_rows), one dated event per round on the Funding timeline.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'upsert_rows', 'place_card'],
        frames: ['financing'],
      }),
      step({
        id: 'competitors',
        text: "Competitors: add the known competitors from the intake first. find_entities discovers more (the match limit follows the depth tier); it fills its own database card in this frame. batch_enrich fills in the Competitors columns (category, HQ, founded, total funding, last round, headcount, pricing, key differentiator) with an output schema of those fields. Then read each run's database with query_dataset and upsert the rows into the Competitors database (upsert_rows, key Name) so there is one table, with a Source url on every row. On the Quick scan tier find_entities and batch_enrich are refused: add a few rows from web_search with upsert_rows instead.",
        tools: ['find_entities', 'batch_enrich', 'web_search', 'upsert_rows', 'query_dataset'],
        frames: ['competition'],
      }),
      step({
        id: 'market',
        text: 'Market reports and sizing: at least one independent report; every TAM, SAM, SOM and CAGR is a metric card with its source and the assumptions in Market sizing inputs (upsert_rows).',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card', 'upsert_rows'],
        frames: ['market'],
      }),
      step({
        id: 'reviews',
        text: 'Reviews and customer signals: G2, Capterra, App Store and Trustpilot pages, social sentiment, traffic and downloads. Quote cards, positive and negative; named customers into the Customers database.',
        tools: ['web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['customers'],
      }),
      step({
        id: 'timeline',
        text: 'Hiring, news and a red-flag sweep: hiring velocity, press and awards on the momentum timeline; also search litigation, layoffs, security incidents and traffic decline so Critic has sources to clear or raise each flag.',
        tools: ['web_search', 'fetch_url', 'place_card'],
        frames: ['customers', 'risks'],
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
        text: "Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything.",
        tools: ['board_map', 'search_board', 'read_card', 'query_board'],
      }),
      step({
        id: 'red-flags',
        text: 'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card in Open questions for founders. You cannot tick the checklist: the user does.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['risks', 'team', 'competition'],
      }),
      step({
        id: 'single-source',
        text: 'Challenge every metric that has a single source: link it with "tension" to the card that disagrees, or place a Question asking for the second source. Challenge every TAM number; flag sizing done only top-down.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['market', 'traction'],
      }),
      step({
        id: 'gaps',
        text: 'Turn every gap into a Question card in Open questions for founders, with a link to the card or gap that prompted it.',
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
        text: 'Charts: market size build-up (bar) and growth (line) bound to the Market sizing inputs database, funding by competitor (bar) bound to Competitors, and the traction chart bound to KPIs.',
        tools: ['place_card', 'query_dataset'],
        frames: ['market', 'competition', 'traction'],
      }),
      step({
        id: 'competition',
        text: 'The competitor matrix (weighted criteria, scores 0 to 10 from the Competitors database) and the positioning 2x2 (framework, quadrant).',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['competition'],
      }),
      step({
        id: 'product',
        text: 'A diagram of how the product works or the user flow, and, from the screenshots, a design frame recreating the key screen when it helps.',
        tools: ['place_card', 'write_design_frame', 'read_card'],
        frames: ['product'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual summary (a design frame): snapshot, score, recommendation and the top risks, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['snapshot', 'thesis'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...VC_RUBRIC],
  redFlags: [...VC_RED_FLAGS],

  // ---- the output ----
  output: {
    memoTitle: 'Investment memo: {{company}}',
    citationRule:
      'Every paragraph cites cards; every number cites its source; claimed and verified figures are marked as such.',
    sections: [
      {
        id: 'summary',
        title: 'Summary & recommendation',
        frames: ['thesis', 'risks'],
        words: 150,
        guidance: 'The decision, the score, the top 3 reasons and the top 3 risks, in at most 150 words.',
      },
      {
        id: 'snapshot',
        title: 'Company snapshot',
        frames: ['snapshot'],
        guidance:
          'A table of the snapshot metrics: what, stage, round, HQ, founded, headcount, raised, valuation.',
      },
      {
        id: 'team',
        title: 'Team',
        frames: ['team'],
        guidance: 'Founders and key hires, founder-market fit, gaps, flags.',
      },
      {
        id: 'product',
        title: 'Problem & product',
        frames: ['product'],
        guidance: 'The problem, the product, how it works, differentiation and pricing.',
      },
      {
        id: 'market',
        title: 'Market',
        frames: ['market'],
        guidance: 'TAM, SAM and SOM with method, growth and why now, with the market chart.',
      },
      {
        id: 'traction',
        title: 'Traction & metrics',
        frames: ['traction'],
        guidance: 'The KPI table, claimed against verified, with the traction chart.',
      },
      {
        id: 'customers',
        title: 'Customers & signals',
        frames: ['customers'],
        guidance: 'Named customers, reviews, hiring, traffic and press.',
      },
      {
        id: 'competition',
        title: 'Competition',
        frames: ['competition'],
        guidance: 'The competitor matrix and the 2x2, and where the company wins and loses.',
      },
      {
        id: 'gtm',
        title: 'Business model & GTM',
        frames: ['gtm'],
        guidance: 'Revenue model, pricing, sales motion, channels and expansion.',
      },
      {
        id: 'financing',
        title: 'Financing & valuation',
        frames: ['financing'],
        guidance: 'The rounds table and the comparable valuations, with the implied multiple.',
      },
      {
        id: 'risks',
        title: 'Risks & mitigants',
        frames: ['risks'],
        guidance:
          'The red-flag outcomes: each raised flag with its mitigant, and the cleared ones in one line.',
      },
      {
        id: 'thesis',
        title: 'Investment thesis: bull vs bear',
        frames: ['thesis'],
        guidance: 'The bull and bear cases and the key hypotheses with their confidence.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard',
        frames: ['thesis'],
        guidance: 'The rubric table: each dimension, its weight, its score and its evidence.',
      },
      {
        id: 'next',
        title: 'Open questions / next steps',
        frames: ['questions'],
        guidance: 'The ranked founder-call questions and the proposed next step.',
      },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{company}}',
      includes: ['Snapshot', 'Score', 'Recommendation', 'Top risks'],
    },
    deckFormat: 'vc-ic',
  },

  // ---- depth tiers (the cost guard) ----
  tiers: {
    quick: {
      label: 'Quick scan',
      time: 'about 15 minutes',
      cost: 'low cost',
      summary:
        'No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the memo is the summary only.',
      parallelTools: ['parallel_extract', 'web_answer', 'image_search', 'entity_search', 'research_memory'],
      processors: [],
      deepRuns: 0,
      askAboveUsd: 0.5,
      cardsPerFrame: 12,
      memo: 'summary',
    },
    standard: {
      label: 'Standard',
      time: 'about 45 minutes',
      cost: 'moderate cost',
      summary:
        'Quick, plus batch enrichment of competitors and one or two deep-research runs (core), asking before spend.',
      parallelTools: [...ALL_DEEP.filter((t) => t !== 'find_entities_extend'), 'watch_topic'],
      processors: ['lite', 'base', 'core'],
      deepRuns: 2,
      askAboveUsd: 0.5,
      cardsPerFrame: null,
      memo: 'full',
    },
    deep: {
      label: 'Deep',
      time: 'about 2 hours',
      cost: 'higher cost, asks before spend',
      summary:
        'Standard, plus pro or ultra deep research on the market and the competitors, FindAll for full competitor discovery and the full memo.',
      parallelTools: [...ALL_DEEP, 'watch_topic'],
      processors: ['lite', 'base', 'core', 'pro', 'ultra'],
      deepRuns: 8,
      askAboveUsd: 0.5,
      cardsPerFrame: null,
      memo: 'full',
    },
  },

  followUps: [
    {
      label: 'Go deeper on competitor X',
      prompt:
        'Go deeper on [competitor]: funding, product, pricing, customers and how it beats or loses to {{company}}.',
    },
    {
      label: 'Build the bear case',
      prompt:
        'Build the bear case for {{company}}: the strongest argument against investing, from the cards on this board, with the evidence that would change your mind.',
    },
    {
      label: 'Draft the founder call agenda',
      prompt:
        'Draft the founder call agenda for {{company}}: ordered questions with a time for each, linked to the gaps and risks on the board.',
    },
    {
      label: 'Compare to [portfolio company]',
      prompt:
        'Compare {{company}} to [portfolio company]: team, market, traction and terms, side by side with a table.',
    },
    {
      label: 'Update with the new deck',
      prompt:
        'I added a new deck. Read it, update the KPIs (tag deck numbers Claimed) and tell me what changed since the last version.',
    },
    {
      label: 'Re-score after the call notes',
      prompt:
        'I added the call notes. Re-score the rubric with them, say which scores moved and why, and update the decision.',
    },
  ],

  signedIn: [
    {
      domain: 'crunchbase.com',
      label: 'Crunchbase',
      use: 'Funding rounds, investors, headcount and founder profiles.',
    },
    { domain: 'pitchbook.com', label: 'PitchBook', use: 'Round valuations and comparable deals.' },
    {
      domain: 'linkedin.com',
      label: 'LinkedIn',
      use: 'Founder and executive backgrounds, tenure, hiring and headcount.',
    },
    { domain: 'docsend.com', label: 'DocSend', use: 'A data room or deck shared with the user.' },
  ],

  monitor: {
    query: '{{company}} funding, launches, layoffs, lawsuits and leadership changes',
    why: 'News that would change the recommendation.',
  },
};
