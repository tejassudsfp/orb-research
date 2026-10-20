/**
 * Technology landscape (P6.15). The depth bar is docs/phase6/vc-dd-template.md; the human-readable spec of this file is
 * docs/templates/tech-landscape.md (generated: `pnpm templates:docs`, and a test keeps the two equal).
 */
import type { RedFlag, RubricDimension, TemplateSpecInput } from './schema.js';
import {
  chart,
  checklist,
  db,
  decision,
  depthField,
  doc,
  emptyRisk,
  framework,
  hypothesis,
  materialsField,
  matrix,
  metric,
  question,
  sitesField,
  step,
  tiers,
  timeline,
} from './kit-research.js';

// ---- the technology-readiness rubric (weights add up to 100) ----

export const TECH_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'maturity',
    name: 'Maturity',
    weight: 20,
    anchors: {
      1: 'Research prototype or a demo only.',
      3: 'Used in production by early adopters.',
      5: 'Widely deployed, stable, with long-term support.',
    },
    frame: 'maturity',
  },
  {
    id: 'performance',
    name: 'Performance and capability',
    weight: 20,
    anchors: {
      1: 'Fails the main requirement, or no independent numbers.',
      3: 'Meets the requirement with caveats.',
      5: 'Exceeds the requirement on independent benchmarks.',
    },
    frame: 'benchmarks',
  },
  {
    id: 'ecosystem',
    name: 'Ecosystem and community',
    weight: 15,
    anchors: {
      1: 'One vendor, little tooling, a tiny community.',
      3: 'Several vendors and decent tooling.',
      5: 'Large, active ecosystem with many integrations.',
    },
    frame: 'projects',
  },
  {
    id: 'cost',
    name: 'Cost and total cost of ownership',
    weight: 15,
    anchors: {
      1: 'Costs are high or opaque.',
      3: 'Reasonable, with some unknowns.',
      5: 'Low and predictable, including operations.',
    },
    frame: 'evaluation',
  },
  {
    id: 'security',
    name: 'Security and compliance',
    weight: 15,
    anchors: {
      1: 'Known incidents or no security posture.',
      3: 'Standard controls, partly audited.',
      5: 'Audited, certified and transparent about incidents.',
    },
    frame: 'risks',
  },
  {
    id: 'portability',
    name: 'Portability and lock-in',
    weight: 15,
    anchors: {
      1: 'Proprietary formats and no exit path.',
      3: 'Some standards, with an exit that is costly.',
      5: 'Open standards and an easy exit.',
    },
    frame: 'standards',
  },
];

// ---- the red-flag checklist (Critic clears or raises each) ----

export const TECH_RED_FLAGS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: 'The benchmark numbers come from the vendor, not from an independent party.',
    check: 'Read the Basis column of the Benchmarks database; any headline number marked Vendor with no independent run is raised.',
  },
  {
    id: 'RF02',
    text: 'An open-source project that looks abandoned: no release or commits in a year.',
    check: 'Read Last release and Activity in the Open-source projects database; raise projects the answer depends on.',
  },
  {
    id: 'RF03',
    text: 'A recent licence change away from open source, or a licence that blocks the use case.',
    check: 'Check the License column and the changelog or announcements for relicensing; match it with the constraints in the intake.',
  },
  {
    id: 'RF04',
    text: 'A single vendor or single maintainer holds the whole ecosystem.',
    check: 'Count the contributors and vendors in the databases; raise a leader with more than about half of the commits or revenue.',
  },
  {
    id: 'RF05',
    text: 'Hype without production use: many announcements, few named deployments.',
    check: 'Look for named production customers and case studies; claims with no named user are raised.',
  },
  {
    id: 'RF06',
    text: 'Security incidents, unpatched critical vulnerabilities or no audit.',
    check: 'Search advisories and CVE listings for each vendor and project and record the result.',
  },
  {
    id: 'RF07',
    text: 'The standards are unstable or competing, so today’s choice may be stranded.',
    check: 'Read the Standards frame: draft status, competing bodies and the vendors behind each.',
  },
  {
    id: 'RF08',
    text: 'Cost claims that leave out operations, support, egress or scale pricing.',
    check: 'Compare the Pricing column with the real workload from the intake; raise numbers that omit a cost line.',
  },
  {
    id: 'RF09',
    text: 'A key vendor has a funding, layoff or acquisition risk.',
    check: 'Look for recent funding, layoffs and acquisition news for the vendors in the Vendors database.',
  },
  {
    id: 'RF10',
    text: 'Benchmarks do not match the intended workload (wrong dataset, scale or hardware).',
    check: 'Compare each benchmark’s conditions with the use case in the intake; raise results that are not transferable.',
  },
  {
    id: 'RF11',
    text: 'Regulation or export controls could block or restrict the technology.',
    check: 'Search for regulation, data-residency and export-control rules and record them in the Standards frame.',
  },
  {
    id: 'RF12',
    text: 'Hard lock-in: proprietary formats, no export, or exit costs far above adoption costs.',
    check: 'Check export formats, API openness and migration reports; raise options with no tested exit path.',
  },
];

export const TECH_LANDSCAPE: TemplateSpecInput = {
  id: 'tech-landscape',
  label: 'Technology landscape',
  dot: '#0369A1',
  placeholder: 'Which technology or category do you want to map?',
  brief:
    'Map a technology landscape: a definition and taxonomy, the players and products, the open-source projects, ' +
    'research and benchmarks, maturity and adoption, standards and regulation, a build-buy-partner evaluation, ' +
    'risks, and a roadmap with a recommendation scored by a technology-readiness rubric. Separate vendor claims from ' +
    'independent evidence, give every number a source and a date, and say how mature each option really is.',
  titleFrom: 'Technology landscape: {{technology}}',

  inputs: [
    {
      id: 'technology',
      label: 'Technology or category',
      kind: 'text',
      required: true,
      placeholder: 'Vector databases',
      maxLength: 160,
    },
    {
      id: 'use_case',
      label: 'Your use case',
      kind: 'longtext',
      placeholder: 'Semantic search over 50M documents with sub-100ms latency',
      help: 'The more specific, the more useful the comparison.',
      maxLength: 1500,
    },
    {
      id: 'decision',
      label: 'The decision to make',
      kind: 'select',
      options: ['Learn the landscape', 'Choose a technology', 'Build or buy', 'Plan a roadmap', 'Invest or partner'],
      group: 'goal',
      maxLength: 40,
    },
    {
      id: 'horizon',
      label: 'Time horizon',
      kind: 'select',
      options: ['Now', '1 year', '3 years', '5+ years'],
      group: 'goal',
      maxLength: 40,
    },
    {
      id: 'constraints',
      label: 'Constraints',
      kind: 'longtext',
      placeholder: 'Must self-host, open-source licence, SOC 2, under $50k a year, team of 3',
      maxLength: 1500,
    },
    {
      id: 'stack',
      label: 'Current stack',
      kind: 'text',
      placeholder: 'Python, Postgres, AWS',
      maxLength: 300,
    },
    {
      id: 'players',
      label: 'Known vendors or projects',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout finds more.',
      maxLength: 800,
    },
    {
      id: 'criteria',
      label: 'Criteria that matter most',
      kind: 'list',
      placeholder: 'Latency, cost, ease of use',
      help: 'Optional. They become the evaluation matrix.',
      maxLength: 800,
    },
    materialsField('Drop vendor decks, analyst reports, architecture notes or a benchmark CSV. Each becomes a card or database.'),
    depthField(),
    sitesField([
      { domain: 'github.com', label: 'GitHub' },
      { domain: 'g2.com', label: 'G2' },
      { domain: 'gartner.com', label: 'Gartner' },
      { domain: 'crunchbase.com', label: 'Crunchbase' },
    ]),
  ],

  frames: [
    {
      id: 'overview',
      title: 'Overview & definition',
      color: 'signal',
      brief:
        'What {{technology}} is in plain words, what problem it solves, how it differs from the neighbouring ' +
        'categories, why it matters now, and the size and growth of the market around it.',
      owners: ['orb'],
      targets: [
        { type: 'doc', min: 1, note: 'the definition' },
        { type: 'metric', min: 4 },
        { type: 'hypothesis', min: 1, note: 'why now' },
      ],
      seeds: [
        doc(
          'Definition',
          '{{technology}} in plain words. Use case: {{use_case|not given.}} orb writes it after the first pass.',
          'Your technology, from the intake.',
        ),
        hypothesis('Why now', 'The shift (cost, capability, regulation, demand) that makes {{technology}} worth a decision today.'),
        metric('Market size', 'Cite the source, the year and whether it is an estimate.'),
        metric('Market growth', 'CAGR with its period and source.'),
        metric('Number of vendors', 'Commercial and open-source, from the databases.'),
        metric('Production adoption', 'Share of organisations using it in production, with the survey and year.'),
      ],
      room: 300,
    },
    {
      id: 'taxonomy',
      title: 'Taxonomy & architecture',
      color: 'sky',
      brief:
        'How the category is organised: the layers or components of a typical system, the main approaches and how they ' +
        'trade off, and where each player sits. A reader should be able to place any product after reading this frame.',
      owners: ['builder', 'scout'],
      targets: [
        { type: 'diagram', min: 2, note: 'reference architecture and the taxonomy' },
        { type: 'framework', min: 1, note: 'the positioning 2x2' },
        { type: 'source', min: 3 },
      ],
      seeds: [
        framework('Positioning 2x2', 'quadrant', { x: 'Maturity', y: 'Capability' }),
        question('Which approach fits our use case, and why?', 'Name the competing architectures and what each assumes about scale, cost and team skills.'),
      ],
    },
    {
      id: 'vendors',
      title: 'Players & products',
      color: 'rho',
      brief:
        'The commercial vendors and cloud services: what each sells, its pricing model, founding year, funding, headcount, ' +
        'customers, strengths and weaknesses and a threat or fit rating against the use case. Include the incumbents and ' +
        'the newcomers. At least 10 on Standard.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'the Vendors database' },
        { type: 'product', min: 3, note: 'the leading products' },
        { type: 'source', min: 4 },
      ],
      seeds: [db('Vendors', 'vendors')],
    },
    {
      id: 'projects',
      title: 'Open-source projects',
      color: 'sky',
      brief:
        'The open-source projects and standards bodies: licence, language, stars, contributors, commit and release ' +
        'activity, the sponsoring company, governance and known production users. Activity and bus factor matter more ' +
        'than stars.',
      owners: ['scout'],
      targets: [
        { type: 'database', min: 1, note: 'Open-source projects' },
        { type: 'chart', min: 1, note: 'projects by activity' },
      ],
      seeds: [
        db('Open-source projects', 'projects'),
        chart('Projects by activity', 'projects', 'bar', 'Activity'),
      ],
    },
    {
      id: 'benchmarks',
      title: 'Research & benchmarks',
      color: 'rho',
      brief:
        'What the research and the measurements say: papers, independent benchmark results and vendor claims, each with ' +
        'its conditions (dataset, scale, hardware, date) and whether the number is Independent, Vendor or Academic. ' +
        'Compare like with like.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'the Benchmarks database' },
        { type: 'chart', min: 2 },
        { type: 'source', min: 4, note: 'including 2 independent' },
        { type: 'math', min: 1, note: 'a formula when the metric needs one' },
      ],
      seeds: [
        db('Benchmarks', 'benchmarks'),
        chart('Benchmark results by system', 'benchmarks', 'bar', 'System', 'Value', 'Metric'),
        question('Which benchmark matches our workload?', 'Compare dataset size, concurrency, hardware and the metric with the use case.'),
      ],
    },
    {
      id: 'maturity',
      title: 'Maturity & adoption',
      color: 'sky',
      brief:
        'Where the technology is on the adoption curve: key milestones, the named production users, the hiring and job-post ' +
        'signal, the analyst view and the hype against the delivery. Place it as emerging, growing, mature or declining ' +
        'and say what the evidence is.',
      owners: ['scout', 'critic', 'builder'],
      targets: [
        { type: 'timeline', min: 1, note: 'milestones and releases' },
        { type: 'quote', min: 3, note: 'production users, at least 1 skeptical' },
        { type: 'hypothesis', min: 1, note: 'the maturity stage' },
        { type: 'chart', min: 1 },
      ],
      seeds: [
        timeline('Milestones', 'Landscape started', 'Scout adds launches, releases, funding and failures with dates and sources.'),
        hypothesis('Maturity stage', 'The technology is [emerging, growing, mature or declining]. State the stage with the evidence for and against.'),
        chart('Vendors by maturity', 'vendors', 'pie', 'Maturity'),
      ],
    },
    {
      id: 'standards',
      title: 'Standards & regulation',
      color: 'rho',
      brief:
        'The standards, protocols and interoperability efforts, who stewards them and how stable they are, plus the ' +
        'regulation, data-residency, export-control and certification rules that apply. Say which ones constrain the ' +
        'use case in the intake.',
      owners: ['scout'],
      targets: [
        { type: 'source', min: 4, note: 'standards bodies and regulators' },
        { type: 'checklist', min: 1, note: 'the compliance requirements' },
      ],
      seeds: [
        checklist('Standards and compliance to check', [
          'Open standards and protocols the category uses',
          'Certifications buyers ask for (SOC 2, ISO 27001, HIPAA, FedRAMP)',
          'Data-residency and export-control rules that apply',
        ]),
        question('Which standard will win, and what happens to the losers?'),
      ],
    },
    {
      id: 'evaluation',
      title: 'Build, buy or partner',
      color: 'sky',
      brief:
        'The shortlist scored against the criteria that matter for the use case: the weighted matrix, the cost model over ' +
        'the time horizon, the build-versus-buy trade-offs and the migration and exit cost. Use the criteria in the intake ' +
        'when given.',
      owners: ['builder', 'orb'],
      targets: [
        { type: 'matrix', min: 1, note: 'the shortlist against weighted criteria' },
        { type: 'framework', min: 1, note: 'pros and cons of building' },
        { type: 'table', min: 1, note: 'cost model' },
        { type: 'metric', min: 2 },
      ],
      seeds: [
        matrix(
          'Shortlist against the criteria',
          [
            ['Capability for the use case', 30],
            ['Performance', 20],
            ['Total cost of ownership', 20],
            ['Security and compliance', 15],
            ['Portability', 15],
          ],
          ['Option A', 'Option B', 'Option C'],
        ),
        framework('Build in-house: pros and cons', 'proscons'),
        metric('Three-year cost of the leading option', 'Licence, infrastructure and people, with the assumptions.'),
      ],
    },
    {
      id: 'risks',
      title: 'Risks & unknowns',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. ' +
        'Also covers vendor viability, security, lock-in, skills and the chance that the category is replaced.',
      owners: ['critic'],
      targets: [{ type: 'risk', min: 6, note: 'every checklist item cleared with a source or raised' }],
      seeds: [
        {
          type: 'checklist',
          data: {
            title: 'Red-flag checklist',
            items: TECH_RED_FLAGS.map((f, i) => ({ id: `rf${i + 1}`, text: `${f.id} ${f.text}`, done: false })),
          },
          why: 'Critic raises or clears each; you tick them off.',
        },
        emptyRisk('Vendor'),
        emptyRisk('Technical'),
        emptyRisk('Security'),
        emptyRisk('Lock-in'),
        emptyRisk('Skills and operations'),
      ],
    },
    {
      id: 'roadmap',
      title: 'Roadmap & recommendation',
      color: 'signal',
      brief:
        'What to do and when: the recommended option for the use case with the technology-readiness score, a staged ' +
        'roadmap (now, next, later), the triggers that would change the choice and the leading indicators to watch.',
      owners: ['orb'],
      targets: [
        { type: 'decision', min: 1 },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
        { type: 'timeline', min: 1, note: 'the roadmap' },
        { type: 'hypothesis', min: 2 },
      ],
      seeds: [
        decision('Recommendation for {{technology}}', ['Adopt now', 'Pilot', 'Watch', 'Avoid']),
        matrix(
          'Technology-readiness scorecard (rubric score x 2, so 10 is a 5)',
          TECH_RUBRIC.map((d) => [`${d.name} (${d.weight}%)`, d.weight] as [string, number]),
          ['orb score', 'Your score'],
        ),
        timeline('Roadmap', 'Evaluation started', 'orb adds the staged steps with dates and the trigger for each.'),
        hypothesis('The leading option still wins in {{horizon|three years}}', 'Test against the trends, standards and vendor risks on this board.'),
      ],
    },
    {
      id: 'questions',
      title: 'Open questions',
      color: 'paper',
      brief:
        'What is still unknown, ranked by importance and linked to the gap behind each: numbers only a trial can give, ' +
        'vendor answers to ask for and experiments to run before committing.',
      owners: ['critic', 'orb'],
      targets: [{ type: 'checklist', min: 1, note: 'at least 8 ranked questions or experiments, each linked to its source card' }],
      seeds: [
        checklist('Questions to answer before committing', [
          'Your constraints: {{constraints|none given yet}}',
          'What would a one-week proof of concept have to show?',
          'What is the exit plan if the vendor changes terms?',
        ]),
      ],
    },
  ],

  databases: [
    {
      key: 'vendors',
      name: 'Vendors',
      frame: 'vendors',
      purpose: 'Commercial vendors and services. Discovered with find_entities, enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'URL', type: 'url' },
        { name: 'Category', type: 'enum', options: ['Platform', 'Managed service', 'Cloud provider', 'Tooling', 'Consultancy'] },
        { name: 'Maturity', type: 'enum', options: ['Emerging', 'Growing', 'Mature', 'Declining'] },
        { name: 'Founded', type: 'number' },
        { name: 'HQ', type: 'text' },
        { name: 'Total funding', type: 'currency', note: 'US dollars.' },
        { name: 'Headcount', type: 'number' },
        { name: 'Pricing model', type: 'text' },
        { name: 'Key customers', type: 'text' },
        { name: 'Strength', type: 'text' },
        { name: 'Weakness', type: 'text' },
        { name: 'Fit', type: 'rating', note: '1 (poor) to 5 (excellent) for the use case.' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Fit', dir: 'desc' }] },
        { name: 'By maturity', kind: 'board', group: 'Maturity' },
        { name: 'Best fit', kind: 'table', filter: [{ column: 'Fit', op: 'gte', value: 4 }] },
      ],
    },
    {
      key: 'projects',
      name: 'Open-source projects',
      frame: 'projects',
      purpose: 'Open-source projects, with the signals that show whether they are alive.',
      keyColumn: 'Project',
      columns: [
        { name: 'Project', type: 'text' },
        { name: 'Repository', type: 'url' },
        { name: 'License', type: 'text' },
        { name: 'Language', type: 'text' },
        { name: 'Stars', type: 'number' },
        { name: 'Contributors', type: 'number' },
        { name: 'Last release', type: 'date' },
        { name: 'Activity', type: 'enum', options: ['Very active', 'Active', 'Slow', 'Abandoned'] },
        { name: 'Sponsor', type: 'text', note: 'Company or foundation behind it.' },
        { name: 'Production users', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Stars', dir: 'desc' }] },
        { name: 'By activity', kind: 'board', group: 'Activity' },
        { name: 'Slow or abandoned', kind: 'table', filter: [{ column: 'Activity', op: 'in', value: ['Slow', 'Abandoned'] }] },
      ],
    },
    {
      key: 'benchmarks',
      name: 'Benchmarks',
      frame: 'benchmarks',
      purpose: 'Every performance number with its conditions and who measured it.',
      keyColumn: 'Result',
      columns: [
        { name: 'Result', type: 'text', note: 'A short label: system, benchmark, metric.' },
        { name: 'System', type: 'text' },
        { name: 'Benchmark', type: 'text' },
        { name: 'Metric', type: 'text' },
        { name: 'Value', type: 'number' },
        { name: 'Unit', type: 'text' },
        { name: 'Conditions', type: 'text', note: 'Dataset, scale, hardware.' },
        { name: 'Date', type: 'date' },
        { name: 'Basis', type: 'enum', options: ['Independent', 'Academic', 'Vendor'] },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Date', dir: 'desc' }] },
        { name: 'By basis', kind: 'board', group: 'Basis' },
        { name: 'Independent', kind: 'table', filter: [{ column: 'Basis', op: 'eq', value: 'Independent' }] },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first (read_card and read_source for decks and reports, query_dataset for a ' +
          'benchmark CSV). Put the criteria from the intake into the evaluation matrix, or propose five from the use ' +
          'case (update_card). Hand the known vendors, the constraints and the ticked signed-in sources to Scout in ' +
          'its delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'update_card'],
        frames: ['evaluation'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first (players, open source, benchmarks, standards), Builder once the Vendors ' +
          'database has rows, Critic once Scout has sources to review. Name the frames each agent owns.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'overview',
        text:
          'After Scout’s first pass, fill the Overview metrics, the definition and the why-now hypothesis (update_card), ' +
          'each with a cited figure and its year. Never write a market figure you cannot source.',
        tools: ['query_dataset', 'query_board', 'search_board', 'update_card'],
        frames: ['overview'],
      }),
      step({
        id: 'cost',
        text:
          'Work out the cost model: licence or usage price, infrastructure and people over the time horizon for the ' +
          'shortlist (query_dataset on Vendors and Benchmarks), as a table card, and update the three-year cost metric. ' +
          'State every assumption.',
        tools: ['query_dataset', 'place_card', 'update_card'],
        frames: ['evaluation'],
      }),
      step({
        id: 'gaps',
        text:
          'For a gap Scout could not close (pricing behind a sales call, a benchmark that does not exist, production users), ' +
          'run deep_research (core) on that one question. Ask the user before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'rubric',
        text:
          'At the end fill the Technology-readiness scorecard: one 1-to-5 score per rubric dimension (doubled on the ' +
          'matrix), each with a cited card. Then the roadmap timeline, the hypotheses (evidence for and against as card ' +
          'ids) and the Decision card: your proposed option and the weighted total in its rationale.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['roadmap'],
      }),
      step({
        id: 'memo',
        text:
          'Write the report with compose_section, section by section in the order of the outline, then the one-page ' +
          'summary. On the Quick tier write the summary only.',
        tools: ['compose_section'],
      }),
      step({
        id: 'questions',
        text: 'Keep the open questions current: collect every unresolved Question card into the checklist, ranked, each linked to its source card.',
        tools: ['search_board', 'update_card', 'add_link'],
        frames: ['questions'],
      }),
      step({
        id: 'monitor',
        text:
          'Only when the user asks to keep watching the category: watch_topic with the technology name and the monitor ' +
          'query. Monitors cost money on every check, so each is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'overview',
        text:
          'Sources for the overview: an analyst or survey for market size and growth (web_answer for a quick number, ' +
          'then the primary source), the vendors’ own explanations and one neutral definition. Place source cards and ' +
          'sizing metrics with the year.',
        tools: ['web_search', 'fetch_url', 'web_answer', 'parallel_extract', 'place_card'],
        frames: ['overview', 'taxonomy'],
      }),
      step({
        id: 'vendors',
        text:
          'Players: add the known vendors from the intake first. find_entities discovers more (the match limit follows ' +
          'the depth tier); batch_enrich fills Category, Founded, HQ, Total funding, Headcount, Pricing model and ' +
          'Strength with an output schema of those fields. Copy the rows into the Vendors database (query_dataset, ' +
          'upsert_rows, key Name), a Source on every row. Place a product card for the leaders. On the Quick tier those ' +
          'two tools are refused: add a few vendors from web_search with upsert_rows instead.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'fetch_url', 'place_card', 'query_dataset', 'upsert_rows'],
        frames: ['vendors'],
      }),
      step({
        id: 'projects',
        text:
          'Open source: the repositories (fetch_url, or fetch_signed_in on GitHub when connected) with licence, stars, ' +
          'contributors, last release and sponsor. One Open-source projects row each (upsert_rows, key Project); set ' +
          'Activity from the commit and release dates, not from stars. Quote the install or usage line from the README as a quote ' +
          'card for the leading project.',
        tools: ['fetch_signed_in', 'fetch_url', 'web_search', 'place_card', 'upsert_rows'],
        frames: ['projects'],
      }),
      step({
        id: 'benchmarks',
        text:
          'Research and benchmarks: papers and independent comparisons first, vendor numbers second. One Benchmarks row ' +
          'per result (upsert_rows, key Result) with its conditions, date and Basis (Independent, Academic or Vendor).',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card', 'upsert_rows'],
        frames: ['benchmarks'],
      }),
      step({
        id: 'adoption',
        text:
          'Maturity and adoption: named production users and case studies as quote cards (include at least one skeptical ' +
          'voice), job-post and hiring signals, analyst placement (fetch_signed_in on Gartner or G2 if connected) and ' +
          'dated milestones on the timeline.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'place_card'],
        frames: ['maturity'],
      }),
      step({
        id: 'standards',
        text:
          'Standards and regulation: the standards bodies, protocol specs and their status, plus data-residency, ' +
          'certification and export-control rules that apply to the use case; place source cards.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card'],
        frames: ['standards'],
      }),
      step({
        id: 'sweep',
        text:
          'A risk sweep for Critic: security advisories and CVEs, layoffs and acquisitions, licence changes and outages ' +
          'for each leading vendor and project; place source cards so Critic can clear or raise each flag.',
        tools: ['web_search', 'fetch_url', 'place_card'],
        frames: ['vendors', 'projects'],
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
        text:
          'Start after Scout’s first sources: read the databases and the cards of every frame (board_map, search_board, ' +
          'read_card, query_dataset) before judging anything.',
        tools: ['board_map', 'search_board', 'read_card', 'query_board', 'query_dataset'],
      }),
      step({
        id: 'red-flags',
        text:
          'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." ' +
          'with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites ' +
          'the source cards that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A ' +
          'flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['risks', 'vendors', 'benchmarks'],
      }),
      step({
        id: 'claims',
        text:
          'Challenge every number: a vendor benchmark with no independent run is linked with "tension" to an independent ' +
          'card that disagrees, or a Question asks for the independent result. Challenge every adoption claim with no named ' +
          'user.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['benchmarks', 'maturity'],
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
        id: 'architecture',
        text:
          'Diagrams of the reference architecture (layers and components) and the taxonomy of approaches, then place each ' +
          'player on the positioning 2x2 from the Vendors database.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['taxonomy'],
      }),
      step({
        id: 'charts',
        text:
          'Charts bound to the databases: benchmark results by system (bar, colour by Metric) from Benchmarks, vendors by ' +
          'maturity from Vendors, projects by activity from Open-source projects. A math card when a metric needs its formula.',
        tools: ['place_card', 'query_dataset'],
        frames: ['benchmarks', 'maturity'],
      }),
      step({
        id: 'matrix',
        text:
          'The shortlist matrix (weighted criteria, scores 0 to 10 from the databases), the build-in-house pros and ' +
          'cons, and the cost-model table.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['evaluation'],
      }),
      step({
        id: 'summary',
        text:
          'Optional one-page visual summary (a design frame): the landscape map, the score and the recommendation, built ' +
          'only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['overview', 'roadmap'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...TECH_RUBRIC],
  redFlags: [...TECH_RED_FLAGS],

  output: {
    memoTitle: 'Technology landscape: {{technology}}',
    citationRule:
      'Every paragraph cites cards; every number cites its source and its date; vendor claims are marked as vendor claims and independent results as independent.',
    sections: [
      { id: 'summary', title: 'Summary & recommendation', frames: ['roadmap', 'risks'], words: 200, guidance: 'The recommendation, the readiness score, the top 3 reasons and the top 3 risks, in at most 200 words.' },
      { id: 'overview', title: 'What it is & why now', frames: ['overview'], guidance: 'The definition, the problem it solves, the market and why it matters now.' },
      { id: 'taxonomy', title: 'Taxonomy & architecture', frames: ['taxonomy'], guidance: 'The layers, the main approaches and where the players sit, with the diagrams.' },
      { id: 'players', title: 'Players & products', frames: ['vendors'], guidance: 'The vendors table and a short note on each leader.' },
      { id: 'oss', title: 'Open source', frames: ['projects'], guidance: 'The projects, their licences and whether they are alive.' },
      { id: 'benchmarks', title: 'Research & benchmarks', frames: ['benchmarks'], guidance: 'The results with their conditions, independent separated from vendor.' },
      { id: 'maturity', title: 'Maturity & adoption', frames: ['maturity'], guidance: 'The stage, the named users, the milestones and the hype against the delivery.' },
      { id: 'standards', title: 'Standards & regulation', frames: ['standards'], guidance: 'The standards, their stability and the rules that apply.' },
      { id: 'evaluation', title: 'Build, buy or partner', frames: ['evaluation'], guidance: 'The shortlist matrix, the cost model and the trade-offs.' },
      { id: 'risks', title: 'Risks & unknowns', frames: ['risks'], guidance: 'The red-flag outcomes, each raised flag with its mitigant, and the cleared ones in one line.' },
      { id: 'scorecard', title: 'Scorecard', frames: ['roadmap'], guidance: 'The rubric table: each dimension, its weight, its score and its evidence.' },
      { id: 'roadmap', title: 'Roadmap & next steps', frames: ['roadmap', 'questions'], guidance: 'The staged roadmap, the triggers and the ranked open questions.' },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{technology}}',
      includes: ['Definition', 'Landscape map', 'Score', 'Recommendation', 'Top risks'],
    },
    deckFormat: 'tech-landscape',
  },

  tiers: tiers({
    quick: {
      summary:
        'No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the report is the summary only.',
    },
    standard: {
      summary:
        'Quick, plus vendor discovery with find_entities, batch enrichment of the Vendors database and one or two deep-research runs (core), asking before spend.',
    },
    deep: {
      summary:
        'Standard, plus pro or ultra deep research on benchmarks and adoption, FindAll extension for a complete vendor list and the full report.',
    },
    watch: true,
  }),

  followUps: [
    { label: 'Go deeper on vendor X', prompt: 'Go deeper on [vendor]: product, pricing, customers, benchmarks and how it fits "{{technology}}" for our use case.' },
    { label: 'Compare two options', prompt: 'Compare [option A] with [option B] for our use case: capability, cost, risk and lock-in, with a table and the cards behind it.' },
    { label: 'Plan a proof of concept', prompt: 'Plan a one-week proof of concept for the leading option: goals, test data, success numbers and what would make us stop.' },
    { label: 'Estimate the cost', prompt: 'Build a three-year cost model for the top three options with every assumption stated and a sensitivity table.' },
    { label: 'Draft the decision memo', prompt: 'Draft a one-page decision memo for "{{technology}}" for leadership: recommendation, cost, risk and next step.' },
    { label: 'Watch the category', prompt: 'Watch {{technology}} and tell me about new releases, funding, licence changes and security incidents.' },
  ],

  signedIn: [
    { domain: 'github.com', label: 'GitHub', use: 'Repository activity, issues, releases and contributors for the Open-source projects database.' },
    { domain: 'g2.com', label: 'G2', use: 'Buyer reviews, ratings and alternatives for the Vendors database.' },
    { domain: 'gartner.com', label: 'Gartner', use: 'Analyst placement, market guides and hype cycles.' },
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Funding, headcount and investors of the vendors.' },
  ],
  monitor: {
    query: '{{technology}} releases, funding, acquisitions, licence changes and security incidents',
    why: 'News that would change the recommendation or the maturity stage.',
  },
};
