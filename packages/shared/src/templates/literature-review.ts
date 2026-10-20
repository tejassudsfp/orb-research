/**
 * Literature review (P6.15). The depth bar is docs/phase6/vc-dd-template.md; the human-readable spec of this file is
 * docs/templates/literature-review.md (generated: `pnpm templates:docs`, and a test keeps the two equal).
 */
import type { RedFlag, RubricDimension, TemplateSpecInput } from './schema.js';
import {
  chart,
  checklist,
  db,
  doc,
  emptyRisk,
  framework,
  hypothesis,
  materialsField,
  depthField,
  matrix,
  metric,
  question,
  sitesField,
  step,
  tiers,
  timeline,
} from './kit-research.js';

// ---- the evidence-quality rubric (weights add up to 100) ----

export const LIT_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'design',
    name: 'Study design',
    weight: 25,
    anchors: {
      1: 'Anecdote, opinion or a case report.',
      3: 'Observational or cohort studies with controls.',
      5: 'Randomised trials, systematic reviews or meta-analyses.',
    },
    frame: 'quality',
  },
  {
    id: 'sample',
    name: 'Sample and power',
    weight: 15,
    anchors: {
      1: 'Tiny or unrepresentative samples.',
      3: 'Adequate samples, some selection concerns.',
      5: 'Large, representative samples with a power calculation.',
    },
    frame: 'quality',
  },
  {
    id: 'replication',
    name: 'Replication and consistency',
    weight: 25,
    anchors: {
      1: 'One study, never replicated, or findings conflict.',
      3: 'A few independent groups roughly agree.',
      5: 'Many independent replications agree.',
    },
    frame: 'claims',
  },
  {
    id: 'directness',
    name: 'Directness to the question',
    weight: 15,
    anchors: {
      1: 'Indirect: another population, proxy outcome or setting.',
      3: 'Partly direct, with some extrapolation.',
      5: 'Directly measures the question in the target setting.',
    },
    frame: 'claims',
  },
  {
    id: 'bias',
    name: 'Risk of bias',
    weight: 10,
    anchors: {
      1: 'High: conflicts of interest, selective reporting.',
      3: 'Some concerns, mostly disclosed.',
      5: 'Low: pre-registered, independent, transparent data.',
    },
    frame: 'quality',
  },
  {
    id: 'recency',
    name: 'Recency and venue quality',
    weight: 10,
    anchors: {
      1: 'Outdated, or only preprints and unreviewed venues.',
      3: 'Mixed: some recent peer-reviewed work.',
      5: 'Recent, peer-reviewed in reputable venues.',
    },
    frame: 'papers',
  },
];

// ---- the red-flag checklist (Critic clears or raises each) ----

export const LIT_RED_FLAGS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: 'A key paper has been retracted, corrected or carries an expression of concern.',
    check:
      'For every paper marked Include with Citations above the median, search for a retraction or correction notice and record the result in Flags.',
  },
  {
    id: 'RF02',
    text: 'A conclusion rests on preprints that have not been peer reviewed.',
    check: 'Count Include rows whose Venue is a preprint server; a claim supported only by such rows is raised.',
  },
  {
    id: 'RF03',
    text: 'Small samples or no power calculation behind a headline result.',
    check: 'Read the Sample size column; any claim whose strongest support is under about 30 per group is raised.',
  },
  {
    id: 'RF04',
    text: 'Findings that have never been replicated by an independent group.',
    check: 'Look at the Claims database: a Strong claim whose papers all share authors or a lab is raised.',
  },
  {
    id: 'RF05',
    text: 'Undisclosed or industry funding and conflicts of interest.',
    check: 'Check the funding and disclosure statements of the papers behind each claim; note unfunded claims as unknown.',
  },
  {
    id: 'RF06',
    text: 'Predatory or low-quality venues.',
    check: 'Compare each Venue with indexing in the sources (DOAJ, Scopus, PubMed); raise venues that are in none.',
  },
  {
    id: 'RF07',
    text: 'Causal language drawn from correlational designs.',
    check: 'For every claim marked causal, check that the Study type supports it (trial or strong quasi-experiment).',
  },
  {
    id: 'RF08',
    text: 'Signs of publication bias: only positive results, a lopsided funnel.',
    check: 'Look for null or negative findings in the Papers database; if there are none, raise it and say what was searched.',
  },
  {
    id: 'RF09',
    text: 'Outcome measures differ across studies, so results are not comparable.',
    check: 'Read the Outcome and Measure columns side by side; raise claims that pool incomparable measures.',
  },
  {
    id: 'RF10',
    text: 'Citation circles or heavy self-citation propping up a claim.',
    check: 'Check whether the strongest papers for a claim cite mostly each other; raise a cluster from one group.',
  },
  {
    id: 'RF11',
    text: 'The evidence is old and the field has moved (a newer method or dataset exists).',
    check: 'Compare the Year range of the papers behind a claim with the date range in the intake; raise stale support.',
  },
  {
    id: 'RF12',
    text: 'The evidence comes from another population or setting than the research question.',
    check: 'Compare each paper’s Population with the research question; raise claims that are only indirectly supported.',
  },
];

export const LITERATURE_REVIEW: TemplateSpecInput = {
  id: 'literature-review',
  label: 'Literature review',
  dot: '#7C3AED',
  placeholder: 'What is your research question or topic?',
  brief:
    'Run a structured literature review: a search log, a Papers database with study type and quality, the authors and ' +
    'groups, claims with the evidence for and against each, methods and bias appraisal, themes and a timeline of the ' +
    'field, gaps and contradictions, and a synthesis with a weighted evidence-quality score. Cite every paper, separate ' +
    'what a paper shows from what its authors claim, and say how strong the evidence is.',
  titleFrom: 'Literature review: {{topic}}',

  inputs: [
    {
      id: 'topic',
      label: 'Topic or research question',
      kind: 'text',
      required: true,
      placeholder: 'Does intermittent fasting improve cardiometabolic health in adults?',
      maxLength: 200,
    },
    {
      id: 'discipline',
      label: 'Field',
      kind: 'text',
      placeholder: 'Nutrition science',
      suggestions: [
        'Medicine',
        'Psychology',
        'Economics',
        'Computer science',
        'Education',
        'Neuroscience',
        'Public health',
        'Sociology',
        'Climate science',
        'Materials science',
      ],
      group: 'scope',
      maxLength: 120,
    },
    {
      id: 'review_type',
      label: 'Review type',
      kind: 'select',
      options: ['Narrative review', 'Scoping review', 'Systematic review', 'Rapid review', 'State of the art'],
      group: 'scope',
      maxLength: 40,
    },
    {
      id: 'years',
      label: 'Years to cover',
      kind: 'text',
      placeholder: '2015 to now',
      group: 'window',
      maxLength: 60,
    },
    {
      id: 'languages',
      label: 'Languages',
      kind: 'text',
      placeholder: 'English',
      group: 'window',
      maxLength: 80,
    },
    {
      id: 'population',
      label: 'Population / setting',
      kind: 'text',
      placeholder: 'Adults, free-living, any country',
      maxLength: 200,
    },
    {
      id: 'inclusion',
      label: 'Inclusion and exclusion criteria',
      kind: 'longtext',
      placeholder: 'Include randomised trials and cohort studies. Exclude animal studies.',
      help: 'Optional. orb proposes criteria from the question when this is empty.',
      maxLength: 1500,
    },
    {
      id: 'seed_papers',
      label: 'Papers you already know',
      kind: 'list',
      placeholder: 'DOIs, URLs or titles, comma separated',
      help: 'Optional. Scout starts from these and follows their citations.',
      maxLength: 1500,
    },
    {
      id: 'authors',
      label: 'Authors or groups to include',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional.',
      maxLength: 800,
    },
    {
      id: 'concerns',
      label: 'Specific questions or doubts',
      kind: 'longtext',
      placeholder: 'Is the effect real outside the lab?',
      maxLength: 1500,
    },
    materialsField('Drop papers (PDF), a reference export (CSV) or notes. Each paper becomes a card; a CSV becomes a database.'),
    depthField(),
    sitesField([
      { domain: 'scholar.google.com', label: 'Google Scholar' },
      { domain: 'jstor.org', label: 'JSTOR' },
      { domain: 'sciencedirect.com', label: 'ScienceDirect' },
      { domain: 'webofscience.com', label: 'Web of Science' },
    ]),
  ],

  frames: [
    {
      id: 'scope',
      title: 'Scope & research question',
      color: 'signal',
      brief:
        'The research question stated precisely (population, intervention or exposure, comparison, outcome), the review ' +
        'type, the years and languages covered, the inclusion and exclusion criteria and what is out of scope. This is ' +
        'the frame every later decision is checked against.',
      owners: ['orb'],
      targets: [
        { type: 'doc', min: 1, note: 'the question in one sentence' },
        { type: 'checklist', min: 1, note: 'inclusion and exclusion criteria' },
        { type: 'metric', min: 4 },
      ],
      seeds: [
        doc(
          'Research question',
          '{{topic}}. Field: {{discipline|to confirm}}. Review type: {{review_type|to confirm}}. Population: {{population|to confirm}}. Years: {{years|to confirm}}. orb restates this precisely after the first pass.',
          'Your question, from the intake.',
        ),
        checklist('Inclusion and exclusion criteria', [
          'Include: {{inclusion|peer-reviewed studies that measure the outcome in the target population}}',
          'Exclude: studies outside the years {{years|covered}} and outside the population',
          'Exclude retracted papers; flag preprints',
        ]),
        metric('Records found', 'Papers found across all searches, before screening.'),
        metric('Included', 'Papers kept after screening.'),
        metric('Excluded', 'Papers screened out, with the reason in the Papers database.'),
        metric('Years covered', 'Earliest and latest publication year of the included papers.'),
      ],
      room: 360,
    },
    {
      id: 'search',
      title: 'Search strategy',
      color: 'sky',
      brief:
        'Every search that was run: the databases and indexes, the exact query strings, the date, the number of hits and ' +
        'what was done with them, plus citation chasing (backward and forward) from the key papers. A reader must be ' +
        'able to repeat the search.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'the Search log' },
        { type: 'source', min: 3, note: 'the indexes searched' },
      ],
      seeds: [
        db('Search log', 'search-log'),
        question(
          'Which databases and keywords are missing?',
          'Synonyms, other fields that study the same thing, grey literature, preprint servers.',
        ),
      ],
    },
    {
      id: 'papers',
      title: 'Papers',
      color: 'rho',
      brief:
        'One row per paper: title, authors, year, venue, link, study type, population and sample size, the key finding, ' +
        'citations, a relevance and a quality score and the screening status. Include a short source card for the ' +
        'landmark papers. Include null and negative results, not only the successes.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'the Papers database, at least 25 rows on Standard' },
        { type: 'source', min: 5, note: 'landmark papers' },
        { type: 'quote', min: 3, note: 'key passages with the page or section' },
      ],
      seeds: [db('Papers', 'papers')],
    },
    {
      id: 'authors',
      title: 'Authors & groups',
      color: 'sky',
      brief:
        'The research groups, labs and institutions that produce the evidence: who the most cited and most prolific ' +
        'authors are, who works together, who funds them and whether the whole field rests on one lab.',
      owners: ['scout'],
      targets: [
        { type: 'database', min: 1, note: 'Authors and groups' },
        { type: 'entity', min: 3, note: 'the leading authors or labs' },
      ],
      seeds: [
        db('Authors & groups', 'authors-db'),
        question(
          'Is the evidence independent?',
          'Count how many separate groups, funders and countries stand behind the main claims.',
        ),
      ],
    },
    {
      id: 'claims',
      title: 'Claims & evidence',
      color: 'rho',
      brief:
        'The main claims of the literature, each with the papers that support it, the papers that contradict it, the ' +
        'strength of the evidence and whether there is consensus. Separate what a paper measured from what its authors ' +
        'concluded. Aim for 8 to 15 claims.',
      owners: ['scout', 'critic', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'the Claims database' },
        { type: 'hypothesis', min: 3, note: 'with evidence for and against' },
        { type: 'chart', min: 1, note: 'claims by evidence strength' },
        { type: 'insight', min: 2, note: 'each citing at least two cards' },
      ],
      seeds: [
        db('Claims', 'claims'),
        chart('Claims by evidence strength', 'claims', 'bar', 'Evidence strength'),
        hypothesis(
          'The main finding holds in the target population',
          'The headline result of the field holds for {{population|the population in your question}}. Link the papers for and against.',
        ),
      ],
    },
    {
      id: 'quality',
      title: 'Methods & quality appraisal',
      color: 'sky',
      brief:
        'How each body of work was done: designs, samples, measures, controls, pre-registration and data availability; ' +
        'a risk-of-bias judgement per important paper and the checklist of appraisal questions. This frame feeds the ' +
        'study-design, sample and bias scores of the rubric.',
      owners: ['critic', 'builder'],
      targets: [
        { type: 'checklist', min: 1, note: 'the appraisal checklist' },
        { type: 'matrix', min: 1, note: 'key papers against appraisal criteria' },
        { type: 'chart', min: 1, note: 'papers by study type' },
      ],
      seeds: [
        checklist('Appraisal questions', [
          'Was the design able to answer the question (control group, randomisation)?',
          'Was the sample large and representative enough?',
          'Were outcomes measured with a validated instrument?',
          'Was the analysis pre-registered, and are the data available?',
          'Are funding and conflicts of interest disclosed?',
        ]),
        matrix(
          'Key papers against the appraisal criteria',
          [
            ['Design', 30],
            ['Sample', 20],
            ['Measures', 20],
            ['Transparency', 15],
            ['Independence', 15],
          ],
          ['Landmark paper A', 'Landmark paper B', 'Landmark paper C'],
        ),
        chart('Papers by study type', 'papers', 'bar', 'Study type'),
      ],
    },
    {
      id: 'themes',
      title: 'Themes & timeline',
      color: 'rho',
      brief:
        'How the field developed: the major themes and schools of thought, the turning points (a landmark paper, a ' +
        'method, a dataset, a controversy), and how the number of papers moved over time. Builder maps the themes; ' +
        'Scout dates the events.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'timeline', min: 1, note: 'turning points of the field' },
        { type: 'diagram', min: 1, note: 'a map of the themes' },
        { type: 'chart', min: 1, note: 'papers per year' },
        { type: 'framework', min: 1 },
      ],
      seeds: [
        timeline('Timeline of the field', 'Review started', 'Scout adds landmark papers, methods and controversies with dates.'),
        chart('Papers per year', 'papers', 'bar', 'Year'),
        framework('Schools of thought', 'quadrant', { x: 'Strength of evidence', y: 'Breadth of adoption' }),
      ],
    },
    {
      id: 'gaps',
      title: 'Gaps & contradictions',
      color: 'paper',
      brief:
        'Work through the red-flag checklist (raise each flag with evidence or clear it with a source), then list what ' +
        'the literature does not answer: contradictory findings and why they might differ, populations and outcomes ' +
        'nobody studied, and methods that need replication.',
      owners: ['critic'],
      targets: [
        { type: 'risk', min: 6, note: 'every checklist item cleared with a source or raised' },
        { type: 'question', min: 3, note: 'the gaps' },
      ],
      seeds: [
        {
          type: 'checklist',
          data: {
            title: 'Red-flag checklist',
            items: LIT_RED_FLAGS.map((f, i) => ({ id: `rf${i + 1}`, text: `${f.id} ${f.text}`, done: false })),
          },
          why: 'Critic raises or clears each; you tick them off.',
        },
        emptyRisk('Evidence quality'),
        emptyRisk('Bias'),
        emptyRisk('Generalisability'),
        emptyRisk('Replication'),
      ],
    },
    {
      id: 'synthesis',
      title: 'Synthesis & conclusions',
      color: 'signal',
      brief:
        'What the literature says, in a form a reader can use: the answer to the research question with its confidence, ' +
        'the evidence-quality score by the rubric, what practitioners or researchers should do, and what would change the ' +
        'conclusion.',
      owners: ['orb'],
      targets: [
        { type: 'hypothesis', min: 2, note: 'the conclusions, with evidence links' },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
        { type: 'decision', min: 1 },
        { type: 'insight', min: 1 },
      ],
      seeds: [
        hypothesis(
          'Answer: {{topic}}',
          'Your doubts: {{concerns|none given.}} orb states the answer with its confidence and links the evidence for and against.',
        ),
        matrix(
          'Evidence-quality scorecard (rubric score x 2, so 10 is a 5)',
          LIT_RUBRIC.map((d) => [`${d.name} (${d.weight}%)`, d.weight] as [string, number]),
          ['orb score', 'Your score'],
        ),
        {
          type: 'decision',
          data: {
            title: 'How strong is the evidence?',
            body: 'Open. orb proposes after the rubric is filled and writes the weighted total and its rationale here; you decide.',
            options: [
              { label: 'Strong' },
              { label: 'Moderate' },
              { label: 'Weak' },
              { label: 'Inconclusive' },
            ],
            status: 'open',
          },
          why: 'Open decision: the user chooses; orb proposes.',
        },
      ],
    },
    {
      id: 'next',
      title: 'Future research & reading list',
      color: 'paper',
      brief:
        'The studies that would settle the open questions, the ranked reading list for someone new to the field, and every ' +
        'unresolved question card on the board.',
      owners: ['critic', 'orb'],
      targets: [{ type: 'checklist', min: 2, note: 'the reading list and the open questions, ranked' }],
      seeds: [
        checklist('Reading list', [
          'Start with the most recent systematic review or meta-analysis',
          'Then the landmark papers in the timeline, oldest first',
          'Finally the strongest contradicting paper',
        ]),
        checklist('Open questions', ['Your doubts: {{concerns|none given yet}}', 'What study would settle the main disagreement?']),
      ],
    },
  ],

  databases: [
    {
      key: 'search-log',
      name: 'Search log',
      frame: 'search',
      purpose: 'Every search run, so the review can be repeated.',
      keyColumn: 'Query',
      columns: [
        { name: 'Query', type: 'text', note: 'The exact string typed.' },
        { name: 'Source', type: 'text', note: 'Database or index.' },
        { name: 'Date', type: 'date' },
        { name: 'Hits', type: 'number' },
        { name: 'Kept', type: 'number', note: 'Papers carried to screening.' },
        { name: 'Link', type: 'url' },
        { name: 'Note', type: 'text' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Date', dir: 'asc' }] },
        { name: 'By source', kind: 'table', group: 'Source' },
      ],
    },
    {
      key: 'papers',
      name: 'Papers',
      frame: 'papers',
      purpose: 'One row per paper, with its design, size, finding, quality and screening status.',
      keyColumn: 'Title',
      columns: [
        { name: 'Title', type: 'text' },
        { name: 'Authors', type: 'text' },
        { name: 'Year', type: 'number' },
        { name: 'Venue', type: 'text', note: 'Journal or conference, or "preprint".' },
        { name: 'Link', type: 'url', note: 'DOI or landing page.' },
        { name: 'Study type', type: 'enum', options: ['RCT', 'Cohort', 'Case-control', 'Cross-sectional', 'Meta-analysis', 'Systematic review', 'Qualitative', 'Modelling', 'Theory', 'Other'] },
        { name: 'Population', type: 'text' },
        { name: 'Sample size', type: 'number' },
        { name: 'Key finding', type: 'text', note: 'What was measured, not what the authors hope.' },
        { name: 'Citations', type: 'number' },
        { name: 'Relevance', type: 'rating', note: '1 (marginal) to 5 (central).' },
        { name: 'Quality', type: 'rating', note: '1 (weak) to 5 (strong), from the appraisal.' },
        { name: 'Status', type: 'enum', options: ['Include', 'Maybe', 'Exclude'] },
        { name: 'Reason', type: 'text', note: 'Why a paper is Maybe or Exclude.' },
        { name: 'Flags', type: 'text', note: 'Retraction, preprint, conflict of interest, small sample.' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Relevance', dir: 'desc' }] },
        { name: 'By status', kind: 'board', group: 'Status' },
        { name: 'Included', kind: 'table', filter: [{ column: 'Status', op: 'eq', value: 'Include' }], sort: [{ column: 'Year', dir: 'desc' }] },
        { name: 'Flagged', kind: 'table', filter: [{ column: 'Flags', op: 'notEmpty' }] },
      ],
    },
    {
      key: 'authors-db',
      name: 'Authors & groups',
      frame: 'authors',
      purpose: 'The people and labs behind the evidence.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'person' },
        { name: 'Institution', type: 'text' },
        { name: 'Country', type: 'text' },
        { name: 'Papers', type: 'number', note: 'Papers in this review.' },
        { name: 'Topics', type: 'text' },
        { name: 'Collaborators', type: 'text' },
        { name: 'Funding', type: 'text' },
        { name: 'Profile', type: 'url' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Papers', dir: 'desc' }] },
        { name: 'By country', kind: 'table', group: 'Country' },
      ],
    },
    {
      key: 'claims',
      name: 'Claims',
      frame: 'claims',
      purpose: 'The main claims, the papers for and against and how strong the evidence is.',
      keyColumn: 'Claim',
      columns: [
        { name: 'Claim', type: 'text' },
        { name: 'Theme', type: 'text' },
        { name: 'Supporting papers', type: 'text', note: 'Titles or DOIs.' },
        { name: 'Contradicting papers', type: 'text' },
        { name: 'Evidence strength', type: 'enum', options: ['Strong', 'Moderate', 'Weak', 'Conflicting', 'None'] },
        { name: 'Consensus', type: 'enum', options: ['Agreed', 'Mostly agreed', 'Contested', 'Unknown'] },
        { name: 'Causal', type: 'boolean', note: 'True when the claim is causal.' },
        { name: 'Note', type: 'text' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By strength', kind: 'board', group: 'Evidence strength' },
        { name: 'Contested', kind: 'table', filter: [{ column: 'Consensus', op: 'eq', value: 'Contested' }] },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first (read_card and read_source for papers, query_dataset for a reference export). ' +
          'Restate the research question precisely in the Research question card (update_card) and propose the inclusion ' +
          'criteria when the intake left them empty. Hand the seed papers and authors from the intake to Scout in its ' +
          'delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'update_card'],
        frames: ['scope'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first (search, papers, authors, timeline), Builder once the Papers database has ' +
          'rows, Critic once Scout has placed the first papers. Name the frames each agent owns.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'counts',
        text:
          'After Scout’s first pass, fill the metric seeds of Scope (Records found, Included, Excluded, Years covered) ' +
          'from the Search log and Papers databases (query_dataset, update_card). Never write a count you cannot read ' +
          'from the databases.',
        tools: ['query_dataset', 'query_board', 'update_card'],
        frames: ['scope'],
      }),
      step({
        id: 'gaps',
        text:
          'For a gap Scout could not close (an area with no papers found, a paper that is paywalled), run deep_research ' +
          '(core) on that one question. Ask the user before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'synthesis',
        text:
          'At the end fill the Evidence-quality scorecard: one 1-to-5 score per rubric dimension (doubled on the matrix), ' +
          'each with a cited card. Write the answer hypothesis (confidence, evidence for and against as card ids) and the ' +
          'strength decision: your proposed option and the weighted total in its rationale.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['synthesis'],
      }),
      step({
        id: 'memo',
        text:
          'Write the review with compose_section, section by section in the order of the outline, then the one-page ' +
          'summary. On the Quick tier write the summary only. State the review type and the limits of the search.',
        tools: ['compose_section'],
      }),
      step({
        id: 'reading',
        text:
          'Keep the reading list and the open questions current: collect every unresolved Question card into the ' +
          'checklists, ranked, each linked to its source card.',
        tools: ['search_board', 'update_card', 'add_link'],
        frames: ['next'],
      }),
      step({
        id: 'monitor',
        text:
          'Only when the user asks to keep the review current: watch_topic with the topic and the monitor query, so new ' +
          'papers appear. Monitors cost money on every check, so each is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'seed',
        text:
          'Start from the seed papers in the intake: find each (web_search, fetch_url or fetch_signed_in), place a source ' +
          'card and add a Papers row (upsert_rows, key Title). Note every search you run in the Search log (upsert_rows, ' +
          'key Query) with the source, the date and the hit count.',
        tools: ['web_search', 'fetch_url', 'fetch_signed_in', 'place_card', 'upsert_rows'],
        frames: ['search', 'papers'],
      }),
      step({
        id: 'discover',
        text:
          'Discover more papers: find_entities with the research question as objective (the match limit follows the depth ' +
          'tier) fills its own database card; then batch_enrich fills Year, Venue, Study type, Sample size, Citations and ' +
          'Key finding with an output schema of those fields. Copy the rows into the Papers database (query_dataset, ' +
          'upsert_rows, key Title) so there is one table, a Link on every row. On the Quick tier those two are refused: ' +
          'add the best papers from web_search with upsert_rows instead.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'query_dataset', 'upsert_rows'],
        frames: ['papers'],
      }),
      step({
        id: 'signed-in',
        text:
          'Where the user connected Google Scholar, JSTOR, ScienceDirect or Web of Science, read them as the user ' +
          '(fetch_signed_in) for full text, citation counts and "cited by" lists; chase citations backwards and forwards ' +
          'from the key papers. Record each as a Search log row.',
        tools: ['fetch_signed_in', 'fetch_url', 'upsert_rows'],
        frames: ['search', 'papers'],
      }),
      step({
        id: 'extract',
        text:
          'Read the important papers: parallel_extract or fetch_url for the abstract and methods; place short quote cards ' +
          'with the section or page, and fill Study type, Population, Sample size and Key finding. Mark null and ' +
          'negative results explicitly. Put preprints and retractions in Flags.',
        tools: ['parallel_extract', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['papers'],
      }),
      step({
        id: 'authors',
        text:
          'Authors and groups: one entity card per leading author or lab and one Authors & groups row each (upsert_rows, ' +
          'key Name) with institution, country, funding and number of papers.',
        tools: ['web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['authors'],
      }),
      step({
        id: 'claims',
        text:
          'Claims: one row per claim in the Claims database (upsert_rows, key Claim) naming the supporting and ' +
          'contradicting papers and the evidence strength; mark each claim causal or not.',
        tools: ['query_dataset', 'upsert_rows', 'place_card'],
        frames: ['claims'],
      }),
      step({
        id: 'timeline',
        text:
          'The history of the field: landmark papers, methods, datasets and controversies as dated events on the timeline ' +
          '(place_card), each with a source.',
        tools: ['web_search', 'fetch_url', 'place_card'],
        frames: ['themes'],
      }),
      step({
        id: 'deep',
        text:
          'Deep research for the questions that remain, such as a sub-field you could not map: deep_research (core or ' +
          'above, per the tier). Ask before spend over $0.50.',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      step({
        id: 'start',
        text:
          'Start after Scout’s first papers: read the cards of every frame (board_map, search_board, read_card) and the ' +
          'Papers database before judging anything.',
        tools: ['board_map', 'search_board', 'read_card', 'query_board', 'query_dataset'],
      }),
      step({
        id: 'appraise',
        text:
          'Appraise the key papers: place an insight per important body of work titled "Quality: ..." that cites the ' +
          'paper cards and the appraisal checklist, and a matrix scoring the landmark papers against the appraisal ' +
          'criteria. Your quality scores go in the cards, since you cannot change the Papers database.',
        tools: ['query_dataset', 'read_card', 'place_card', 'add_link'],
        frames: ['quality', 'papers'],
      }),
      step({
        id: 'red-flags',
        text:
          'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." ' +
          'with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites ' +
          'the source cards that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A ' +
          'flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['gaps', 'papers', 'claims'],
      }),
      step({
        id: 'claims',
        text:
          'Challenge every claim marked Strong: link it with "tension" to the paper that disagrees, or place a Question ' +
          'asking for an independent replication. Place a hypothesis for each major disagreement with the evidence both ' +
          'ways.',
        tools: ['query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['claims'],
      }),
      step({
        id: 'gaps',
        text:
          'Turn every gap (no replication, missing population, unmeasured outcome) into a Question card, linked to the ' +
          'card that prompted it, and keep the future-research checklist honest.',
        tools: ['place_card', 'add_link'],
        frames: ['gaps', 'next'],
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
        text:
          'Charts bound to the Papers and Claims databases: claims by evidence strength (bar), papers per year (bar, ' +
          'x Year) and papers by study type. Never an inline chart when a database holds the data.',
        tools: ['place_card', 'query_dataset'],
        frames: ['claims', 'quality', 'themes'],
      }),
      step({
        id: 'map',
        text:
          'A diagram that maps the themes and how they relate, and the schools-of-thought quadrant, built from the claims ' +
          'and timeline cards.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['themes'],
      }),
      step({
        id: 'appraisal',
        text: 'The appraisal matrix for the landmark papers, scored 0 to 10 per criterion from the Papers database.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['quality'],
      }),
      step({
        id: 'summary',
        text:
          'Optional one-page visual summary (a design frame): question, the evidence-strength chart, the answer and the ' +
          'top gaps, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['synthesis'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...LIT_RUBRIC],
  redFlags: [...LIT_RED_FLAGS],

  output: {
    memoTitle: 'Literature review: {{topic}}',
    citationRule:
      'Every claim cites the papers it rests on; every number cites its paper; what a paper found and what its authors concluded are kept apart.',
    sections: [
      { id: 'summary', title: 'Summary', frames: ['synthesis', 'gaps'], words: 200, guidance: 'The answer to the research question, how strong the evidence is and the main gap, in at most 200 words.' },
      { id: 'question', title: 'Research question & scope', frames: ['scope'], guidance: 'The question, the review type, the years, the population and the inclusion criteria.' },
      { id: 'method', title: 'Search method', frames: ['search'], guidance: 'Databases, search strings, dates and screening, with the counts of papers found and kept.' },
      { id: 'landscape', title: 'The field at a glance', frames: ['papers', 'authors', 'themes'], guidance: 'Who studies this, the main schools of thought and the timeline.' },
      { id: 'findings', title: 'Findings by theme', frames: ['claims'], guidance: 'Each theme with its claims, the papers for and against and the strength of evidence.' },
      { id: 'quality', title: 'Quality of the evidence', frames: ['quality', 'synthesis'], guidance: 'Designs, samples and bias, and the scored rubric with its evidence.' },
      { id: 'contradictions', title: 'Contradictions & gaps', frames: ['gaps', 'claims'], guidance: 'Where studies disagree and why, the raised red flags and what nobody has studied.' },
      { id: 'conclusions', title: 'Conclusions', frames: ['synthesis'], guidance: 'What the evidence supports, with its confidence, and what would change it.' },
      { id: 'future', title: 'Future research & reading list', frames: ['next'], guidance: 'The studies that would settle the open questions and the ranked reading list.' },
    ],
    appendix: 'References',
    onePager: {
      title: 'One-page summary: {{topic}}',
      includes: ['Question', 'Answer', 'Evidence strength', 'Top gaps'],
    },
    deckFormat: 'lit-review',
  },

  tiers: tiers({
    quick: {
      summary:
        'No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the review is the summary only.',
    },
    standard: {
      summary:
        'Quick, plus paper discovery with find_entities, batch enrichment of the Papers database and one or two deep-research runs (core), asking before spend.',
    },
    deep: {
      summary:
        'Standard, plus pro or ultra deep research on the contested claims, FindAll extension for complete paper discovery and the full review.',
    },
    watch: true,
  }),

  followUps: [
    { label: 'Go deeper on a claim', prompt: 'Go deeper on [claim]: find every paper that supports or contradicts it and re-score the evidence strength.' },
    { label: 'Find the strongest counter-evidence', prompt: 'Find the strongest evidence against the main finding of "{{topic}}": papers, null results and replications that failed.' },
    { label: 'Extend the search', prompt: 'Extend the search for "{{topic}}" to [another database or keyword set] and add only the papers not already in the Papers database.' },
    { label: 'Write the abstract', prompt: 'Write a 250-word structured abstract (background, methods, results, conclusion) for this review of "{{topic}}", citing the cards.' },
    { label: 'Add the new papers', prompt: 'I added new papers. Read them, add them to the Papers database, and say which claims or scores change.' },
    { label: 'Keep it current', prompt: 'Watch for new papers on "{{topic}}" and tell me when one changes a conclusion.' },
  ],

  signedIn: [
    { domain: 'scholar.google.com', label: 'Google Scholar', use: 'Citation counts, "cited by" lists and versions of a paper.' },
    { domain: 'jstor.org', label: 'JSTOR', use: 'Full text of humanities and social science papers the user can access.' },
    { domain: 'sciencedirect.com', label: 'ScienceDirect', use: 'Full text and abstracts of journals the user has access to.' },
    { domain: 'webofscience.com', label: 'Web of Science', use: 'Indexing, citation networks and journal quality.' },
  ],
  monitor: {
    query: 'new papers, retractions and replications on {{topic}}',
    why: 'New evidence that would change the conclusion.',
  },
};
