/**
 * Feature PRD research (P6.13, startup / product). Human-readable spec: docs/templates/feature-prd.md (generated:
 * `pnpm templates:docs`).
 *
 * Parallel use: find_entities and batch_enrich for how other products solve it, deep_research for feasibility and
 * market context, a monitor (Orb, on request) on the problem space. Signed-in: G2, LinkedIn, Crunchbase.
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
  matrix,
  metric,
  orbDelegate,
  orbMemo,
  orbMonitor,
  question,
  redFlags,
  sitesField,
  step,
  tiers,
} from './kit.js';

export const PRD_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'need',
    name: 'Evidence of need',
    weight: 25,
    anchors: {
      1: 'One request or an opinion.',
      3: 'Several users in more than one source.',
      5: 'Many users, several sources, and behaviour data.',
    },
    frame: 'evidence',
  },
  {
    id: 'reach',
    name: 'Reach and frequency',
    weight: 20,
    anchors: {
      1: 'A few users, rarely.',
      3: 'A real segment, monthly.',
      5: 'Most active users, weekly or more.',
    },
    frame: 'problem',
  },
  {
    id: 'fit',
    name: 'Strategic fit',
    weight: 15,
    anchors: {
      1: 'Off-strategy.',
      3: 'Supports a goal indirectly.',
      5: 'Moves a top company goal directly.',
    },
    frame: 'problem',
  },
  {
    id: 'feasible',
    name: 'Feasibility',
    weight: 15,
    anchors: {
      1: 'Needs new technology or an unavailable dependency.',
      3: 'Doable with known work and one dependency.',
      5: 'Small, well understood and independent.',
    },
    frame: 'tech',
  },
  {
    id: 'diff',
    name: 'Differentiation',
    weight: 10,
    anchors: {
      1: 'Parity with everyone.',
      3: 'Better than most.',
      5: 'Something no competitor does well.',
    },
    frame: 'market',
  },
  {
    id: 'measure',
    name: 'Measurability',
    weight: 15,
    anchors: {
      1: 'No way to tell if it worked.',
      3: 'A metric with an estimate of the baseline.',
      5: 'A metric with a baseline, target and guardrail.',
    },
    frame: 'success',
  },
];

export const PRD_RED_FLAGS = redFlags([
  [
    'The feature starts from a solution, with no evidence of the problem.',
    'Check the Evidence frame for quotes and rows that describe the problem rather than ask for the feature.',
  ],
  [
    'The evidence is fewer than five users or one source.',
    'Count distinct users and sources in Feedback evidence; fewer than five users or a single source is raised.',
  ],
  [
    'The loudest customers drive the case, not the target segment.',
    'Compare the segment of the evidence rows with the segment the feature is for; raise a mismatch.',
  ],
  [
    'There is no success metric, baseline or guardrail.',
    'Read the Metrics plan database: each metric needs a definition, a baseline or a way to get one, and a target.',
  ],
  [
    'Scope has no out-of-scope list.',
    'Check the Requirements database for rows of type Out of scope; none is raised.',
  ],
  [
    'Requirements have no acceptance criteria.',
    'Check that each Must requirement has an acceptance criterion that a tester could check.',
  ],
  [
    'A dependency on another team or a third party has no owner or date.',
    'Read the Dependencies database for rows with no owner, an unknown status or a high risk.',
  ],
  [
    'The effort estimate has no engineering input.',
    'Check the Options effort values: an estimate made by the agents alone is marked Unconfirmed and a Question asks engineering.',
  ],
  [
    'Privacy, security, accessibility or legal impact is not assessed.',
    'Look in Technical and Dependencies for a data, privacy or compliance note; none is raised.',
  ],
  [
    'The feature cannibalises or conflicts with a core use or revenue line.',
    'Compare the feature with the pricing and packaging in the sources and the competitor approaches.',
  ],
  [
    'Parity with a competitor is the only reason.',
    'Check whether any evidence from users supports the feature apart from the fact that a competitor has it.',
  ],
  [
    'There is no rollout or rollback plan.',
    'Check the Rollout checklist for a phased release, a flag or a way back.',
  ],
]);

export const FEATURE_PRD: TemplateSpecInput = {
  id: 'feature-prd',
  label: 'Feature PRD research',
  dot: '#2563EB',
  placeholder: 'Which feature or problem do you want to research?',
  brief:
    'Research a feature and write its product requirements document: the problem and who has it, the evidence ' +
    'from users and data, the jobs to be done, how other products solve it, the solution options with their ' +
    'trade-offs and a priority score, the requirements with acceptance criteria and what is out of scope, the ' +
    'success metrics, the technical dependencies, the risks, and a recommendation. Start from evidence of the ' +
    'problem, not from the solution, and cite every claim.',
  titleFrom: '{{feature}}: feature PRD',

  inputs: [
    {
      id: 'feature',
      label: 'Feature or problem',
      kind: 'text',
      required: true,
      placeholder: 'Bulk editing of tasks',
      maxLength: 90,
    },
    { id: 'product', label: 'Product', kind: 'text', placeholder: 'Acme Tasks', maxLength: 70 },
    { id: 'website', label: 'Product website', kind: 'url', placeholder: 'https://acme.com', maxLength: 300 },
    {
      id: 'users',
      label: 'Who it is for',
      kind: 'longtext',
      placeholder: 'Team leads who manage more than 50 open tasks',
      maxLength: 600,
    },
    {
      id: 'problem',
      label: 'The problem as you understand it',
      kind: 'longtext',
      placeholder: 'Editing many tasks one by one takes too long',
      maxLength: 800,
    },
    {
      id: 'goal',
      label: 'Goal or metric it should move',
      kind: 'text',
      placeholder: 'Weekly active team leads',
      maxLength: 200,
    },
    {
      id: 'constraints',
      label: 'Constraints',
      kind: 'longtext',
      placeholder: 'One engineer for six weeks; must work on mobile; no new data storage',
      maxLength: 600,
    },
    {
      id: 'stage',
      label: 'Where you are',
      kind: 'select',
      options: ['Exploring the problem', 'Comparing options', 'Scoping', 'Spec ready for review'],
      maxLength: 40,
    },
    {
      id: 'competitors',
      label: 'Products to learn from',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout finds more.',
      maxLength: 800,
    },
    materialsField(
      'Drop customer feedback, support tickets or survey exports (CSV or XLSX), interview notes, analytics exports, design mocks and any existing spec. Each becomes a card or database; feedback tables are read as evidence.',
    ),
    depthField,
    sitesField([
      { domain: 'g2.com', label: 'G2' },
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'crunchbase.com', label: 'Crunchbase' },
    ]),
  ],

  frames: [
    {
      id: 'problem',
      title: 'Problem statement',
      color: 'signal',
      brief:
        'The problem in one paragraph: who has it, when, how often, what it costs them and what happens today. The ' +
        'user problem as given: {{problem|not given}}. For: {{users|to confirm}}. Goal: {{goal|to confirm}}. ' +
        'Constraints: {{constraints|none given}}. Write the problem without naming the solution.',
      owners: ['orb'],
      targets: [
        { type: 'doc', min: 1, note: 'the problem statement' },
        { type: 'metric', min: 4 },
        { type: 'hypothesis', min: 3, note: 'with evidence links' },
      ],
      seeds: [
        {
          type: 'doc',
          data: {
            title: 'Problem statement',
            body: 'Started {{date}}. For {{users|to confirm}}: {{problem|the problem to confirm}}. Feature under research: {{feature}} (in {{product|the product}}). Goal: {{goal|to confirm}}.',
          },
          why: 'The statement, from your intake. orb rewrites it from the evidence.',
        },
        metric('Users affected', 'Number or share of users who have the problem, with the source.'),
        metric('Frequency', 'How often it happens per user, with the source.'),
        metric('Cost of the problem', 'Time or money lost per occurrence.'),
        metric('Requests', 'Feedback items that mention the problem.'),
        hypothesis(
          'The problem is real and frequent for {{product|our users}}',
          'Confirm or refute with the evidence in the Evidence frame.',
        ),
        hypothesis('Users work around it today', 'Look for workarounds in feedback and in how competitors are used.'),
        hypothesis('Solving it moves {{goal|the goal metric}}', 'Link to the metric and the evidence that connects them.'),
        question('What happens if we do nothing?', 'Say who churns, complains or works around it, and what that costs.'),
      ],
      room: 240,
    },
    {
      id: 'evidence',
      title: 'User evidence',
      color: 'sky',
      brief:
        'What users say and do: feedback tickets, interview quotes, reviews, forum posts, sales-call notes and analytics ' +
        'about this problem, each a row in Feedback evidence with its source type, segment, theme and intensity. ' +
        'Quote users exactly. Count distinct users, not mentions. Include evidence against the need.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Feedback evidence, at least 20 rows' },
        { type: 'quote', min: 10, note: 'at least 2 that disagree' },
        { type: 'chart', min: 1, note: 'evidence by theme' },
      ],
      seeds: [
        db('Feedback evidence', 'feedback'),
        chart('Evidence by theme', 'feedback', 'bar', 'Theme'),
      ],
    },
    {
      id: 'jobs',
      title: 'Jobs to be done & users',
      color: 'rho',
      brief:
        'What users are trying to get done and the situation they are in: job stories ("When ... I want to ... so I ' +
        'can ..."), the segments and one persona per distinct segment, grounded in the evidence. The users: ' +
        '{{users|to confirm}}.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'checklist', min: 1, note: 'job stories' },
        { type: 'entity', min: 2, note: 'personas, kind person' },
        { type: 'quote', min: 3 },
      ],
      seeds: [
        checklist(
          'Job stories',
          [
            'When [situation], I want to [motivation], so I can [outcome]. (replace with the first job)',
            'When [situation], I want to [motivation], so I can [outcome]. (replace with the second job)',
          ],
          'Agents propose job stories from the evidence; you tick the ones that are right.',
        ),
        question('Which segment feels this most, and which should we ignore for now?'),
      ],
    },
    {
      id: 'market',
      title: 'How others solve it',
      color: 'sky',
      brief:
        'How competitors and adjacent products solve the problem: the approach, the packaging and price, strengths ' +
        'and weaknesses, with screenshots. What is table stakes and what could differentiate {{product|our product}}.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Competitor approaches, at least 6 rows' },
        { type: 'product', min: 3, note: 'kind competitor' },
        { type: 'image', min: 3, note: 'how they do it' },
        { type: 'matrix', min: 1 },
      ],
      seeds: [
        db('Competitor approaches', 'approaches'),
        matrix(
          'Approach comparison',
          [
            { name: 'Solves the core job', weight: 35 },
            { name: 'Ease of use', weight: 25 },
            { name: 'Depth and control', weight: 20 },
            { name: 'Fit with our product', weight: 20 },
          ],
          ['Approach A', 'Approach B', 'Approach C'],
          'Placeholder: Builder names the approaches and scores them from the Competitor approaches rows.',
        ),
      ],
    },
    {
      id: 'options',
      title: 'Solution options',
      color: 'rho',
      brief:
        'Two to five ways to solve the problem, from a small change to a full feature: for each the user value, ' +
        'reach, effort, risk and confidence, and how it compares. Sketch the leading option. Effort estimates not ' +
        'confirmed by engineering are marked.',
      owners: ['builder', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Options, 2 to 5 rows' },
        { type: 'framework', min: 1, note: 'impact by effort 2x2' },
        { type: 'design', min: 1, note: 'a sketch of the leading option' },
      ],
      seeds: [
        db('Options', 'options'),
        framework('Options: impact by effort', 'quadrant', { xAxis: 'Effort', yAxis: 'Impact' }),
      ],
    },
    {
      id: 'priority',
      title: 'Prioritisation',
      color: 'sky',
      brief:
        'Rank the options with a transparent score (reach, impact, confidence and effort) and a weighted comparison ' +
        'of the criteria that matter for {{goal|the goal}}; show the formula and mark confidence honestly.',
      owners: ['orb', 'builder'],
      targets: [
        { type: 'matrix', min: 1, note: 'options on weighted criteria' },
        { type: 'math', min: 1, note: 'the score formula' },
        { type: 'chart', min: 1, note: 'option scores' },
      ],
      seeds: [
        {
          type: 'math',
          data: {
            title: 'The priority score',
            latex: '\\text{RICE} = \\frac{\\text{reach} \\times \\text{impact} \\times \\text{confidence}}{\\text{effort}}',
            body: 'Reach per quarter, impact from 0.25 to 3, confidence from 0 to 1, effort in person-weeks. Each input comes from the Options database and cites its source.',
          },
          why: 'The formula, so the ranking can be checked.',
        },
        chart('Priority score by option', 'options', 'bar', 'Option', 'RICE score'),
        matrix(
          'Option ranking',
          [
            { name: 'Evidence of need', weight: 30 },
            { name: 'Impact on the goal', weight: 30 },
            { name: 'Effort and risk', weight: 25 },
            { name: 'Differentiation', weight: 15 },
          ],
          ['Option A', 'Option B', 'Option C'],
          'Placeholder: scored from the Options database and the evidence.',
        ),
      ],
    },
    {
      id: 'requirements',
      title: 'Requirements',
      color: 'rho',
      brief:
        'The requirements for the chosen option: functional and non-functional, constraints, and an explicit list of ' +
        'what is out of scope. Each has a priority (must, should, could, won\'t), the evidence it comes from and an ' +
        'acceptance criterion a tester can check. Constraints: {{constraints|none given}}.',
      owners: ['orb', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Requirements, at least 12 rows including out of scope' },
        { type: 'checklist', min: 1, note: 'definition of done' },
      ],
      seeds: [
        db('Requirements', 'requirements'),
        checklist('Definition of done', [
          'Every Must requirement meets its acceptance criterion.',
          'Accessibility, privacy and security are reviewed.',
          'Analytics events for every success metric are live.',
          'Support and documentation are ready.',
          'The rollout plan and the way back are agreed.',
        ]),
      ],
    },
    {
      id: 'success',
      title: 'Success metrics',
      color: 'sky',
      brief:
        'How we will know it worked: the primary metric tied to {{goal|the goal}}, supporting and guardrail metrics, ' +
        'each with a definition, a baseline (or how to get one), a target and how it is measured.',
      owners: ['orb', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Metrics plan' },
        { type: 'metric', min: 3, note: 'baseline and target' },
      ],
      seeds: [
        db('Metrics plan', 'metrics'),
        metric('Primary metric target', 'The number and the date; tie it to the goal.'),
        metric('Adoption target', 'Share of the target segment who use it within 30 days.'),
        metric('Guardrail', 'The metric that must not get worse.'),
      ],
    },
    {
      id: 'tech',
      title: 'Technical & dependencies',
      color: 'rho',
      brief:
        'What it would take: the platform and API limits, data and privacy implications, the teams and vendors ' +
        'it depends on, and how similar products built it where that is public. Engineering confirms estimates; ' +
        'this frame holds what can be found without private systems.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Dependencies' },
        { type: 'source', min: 3 },
      ],
      seeds: [
        db('Dependencies', 'dependencies'),
        question('Which part of this is hardest to build, and who can say?'),
      ],
    },
    {
      id: 'risks',
      title: 'Risks & open questions',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence or clear it with a ' +
        'source. Every gap becomes a Question for the product, design or engineering owner, ranked.',
      owners: ['critic'],
      targets: [
        { type: 'risk', min: 5, note: 'every checklist item cleared with a source or raised' },
        { type: 'question', min: 5 },
      ],
      seeds: [
        checklist(
          'Red-flag checklist',
          PRD_RED_FLAGS.map((f) => `${f.id} ${f.text}`),
          'Critic raises or clears each; you tick them off.',
        ),
        emptyRisk('Evidence'),
        emptyRisk('Scope'),
        emptyRisk('Dependency'),
        emptyRisk('Adoption'),
      ],
    },
    {
      id: 'decision',
      title: 'Recommendation & PRD',
      color: 'signal',
      brief:
        'What to do: build, build smaller, validate first or do not build, with the reasons and the conditions. Score ' +
        'the opportunity against the rubric with cited evidence. The PRD is composed from the frames of this canvas.',
      owners: ['orb'],
      targets: [
        { type: 'decision', min: 1 },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
        { type: 'framework', min: 1, note: 'SWOT' },
        { type: 'insight', min: 3 },
      ],
      seeds: [
        {
          type: 'decision',
          data: {
            title: 'What should we do about {{feature}}?',
            body: 'Open. orb proposes after the rubric is filled and writes the weighted total in the rationale.',
            options: [
              { label: 'Build the full feature' },
              { label: 'Build the smaller option first' },
              { label: 'Validate with a prototype first' },
              { label: 'Do not build' },
            ],
            status: 'open',
          },
          why: 'Open decision: you choose; orb proposes.',
        },
        framework('SWOT: {{feature}}', 'swot'),
        matrix(
          'Opportunity score (rubric score x 2, so 10 is a 5)',
          PRD_RUBRIC.map((d) => ({ name: `${d.name} (${d.weight}%)`, weight: d.weight })),
          ['orb score', 'Your score'],
          'orb fills one score per dimension with cited evidence; you may override.',
        ),
        checklist('Rollout plan', [
          'A feature flag and a staged rollout.',
          'A way back if the guardrail metric drops.',
          'A message to affected users.',
        ]),
      ],
    },
  ],

  databases: [
    {
      key: 'feedback',
      name: 'Feedback evidence',
      frame: 'evidence',
      purpose: 'Every piece of user evidence about the problem, with its source and strength.',
      keyColumn: 'Evidence',
      columns: [
        { name: 'Evidence', type: 'text', note: 'Verbatim where possible.' },
        {
          name: 'Source type',
          type: 'enum',
          options: ['Interview', 'Support ticket', 'Review', 'Forum', 'Sales call', 'Survey', 'Analytics'],
        },
        { name: 'User', type: 'text', note: 'An id or a role; no private details.' },
        { name: 'Segment', type: 'text' },
        { name: 'Theme', type: 'text' },
        { name: 'Intensity', type: 'rating', note: '1 (mild) to 5 (urgent).' },
        { name: 'For or against', type: 'enum', options: ['For', 'Against', 'Neutral'] },
        { name: 'Date', type: 'date' },
        { name: 'Link', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Intensity', dir: 'desc' }] },
        { name: 'By source', kind: 'board', group: 'Source type' },
        { name: 'Against', kind: 'table', filter: [{ column: 'For or against', op: 'eq', value: 'Against' }] },
      ],
    },
    {
      key: 'approaches',
      name: 'Competitor approaches',
      frame: 'market',
      purpose: 'How each other product solves the problem. Discovered with find_entities and enriched with batch_enrich.',
      keyColumn: 'Product',
      columns: [
        { name: 'Product', type: 'text' },
        { name: 'URL', type: 'url' },
        { name: 'How it solves it', type: 'text' },
        { name: 'Packaging', type: 'text', note: 'Which plan includes it; free or paid.' },
        { name: 'Strength', type: 'text' },
        { name: 'Weakness', type: 'text' },
        { name: 'Table stakes', type: 'boolean' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'Table stakes', kind: 'table', filter: [{ column: 'Table stakes', op: 'eq', value: true }] },
      ],
    },
    {
      key: 'options',
      name: 'Options',
      frame: 'options',
      purpose: 'Candidate solutions with the inputs of the priority score.',
      keyColumn: 'Option',
      columns: [
        { name: 'Option', type: 'text' },
        { name: 'Description', type: 'text' },
        { name: 'Reach per quarter', type: 'number', note: 'Users.' },
        { name: 'Impact', type: 'number', note: '0.25 minimal, 0.5 low, 1 medium, 2 high, 3 massive.' },
        { name: 'Confidence', type: 'number', note: '0 to 1.' },
        { name: 'Effort (person-weeks)', type: 'number' },
        { name: 'Effort confirmed', type: 'boolean', note: 'Engineering has confirmed the estimate.' },
        { name: 'RICE score', type: 'number', note: 'Reach times impact times confidence, over effort.' },
        { name: 'Main risk', type: 'text' },
      ],
      views: [
        { name: 'By score', kind: 'table', sort: [{ column: 'RICE score', dir: 'desc' }] },
        { name: 'Unconfirmed effort', kind: 'table', filter: [{ column: 'Effort confirmed', op: 'eq', value: false }] },
      ],
    },
    {
      key: 'requirements',
      name: 'Requirements',
      frame: 'requirements',
      purpose: 'Every requirement, and what is out of scope, each with its evidence and acceptance criterion.',
      keyColumn: 'ID',
      columns: [
        { name: 'ID', type: 'text', note: 'R-01, R-02 ...' },
        { name: 'Type', type: 'enum', options: ['Functional', 'Non-functional', 'Constraint', 'Out of scope'] },
        { name: 'Requirement', type: 'text', note: 'As a user story or a plain statement.' },
        { name: 'Priority', type: 'enum', options: ['Must', 'Should', 'Could', 'Won\'t'] },
        { name: 'Evidence', type: 'text', note: 'The evidence row or card it comes from.' },
        { name: 'Acceptance criteria', type: 'text', note: 'A check a tester can run.' },
        { name: 'Status', type: 'enum', options: ['Proposed', 'Agreed', 'Dropped'] },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'ID', dir: 'asc' }] },
        { name: 'By priority', kind: 'board', group: 'Priority' },
        { name: 'Out of scope', kind: 'table', filter: [{ column: 'Type', op: 'eq', value: 'Out of scope' }] },
      ],
    },
    {
      key: 'metrics',
      name: 'Metrics plan',
      frame: 'success',
      purpose: 'The metrics that say whether the feature worked, with definition, baseline and target.',
      keyColumn: 'Metric',
      columns: [
        { name: 'Metric', type: 'text' },
        { name: 'Role', type: 'enum', options: ['Primary', 'Supporting', 'Guardrail'] },
        { name: 'Definition', type: 'text' },
        { name: 'Baseline', type: 'number' },
        { name: 'Target', type: 'number' },
        { name: 'Unit', type: 'text' },
        { name: 'How measured', type: 'text' },
        { name: 'Basis', type: 'enum', options: ['Measured', 'Estimated'] },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By role', kind: 'board', group: 'Role' },
      ],
    },
    {
      key: 'dependencies',
      name: 'Dependencies',
      frame: 'tech',
      purpose: 'Everything the feature depends on, with an owner and a status.',
      keyColumn: 'Dependency',
      columns: [
        { name: 'Dependency', type: 'text' },
        { name: 'Type', type: 'enum', options: ['Team', 'Third-party API', 'Platform limit', 'Data', 'Legal or compliance', 'Design'] },
        { name: 'Owner', type: 'person' },
        { name: 'Risk', type: 'rating', note: '1 (low) to 5 (high).' },
        { name: 'Status', type: 'enum', options: ['Unknown', 'Confirmed', 'Blocked', 'Done'] },
        { name: 'Note', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'By risk', kind: 'table', sort: [{ column: 'Risk', dir: 'desc' }] },
        { name: 'By status', kind: 'board', group: 'Status' },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text: 'Read what the user dropped first: feedback exports, tickets, interview notes, analytics, mocks and any existing spec (board_map, read_card, read_source, query_dataset). Each dropped feedback item that bears on the problem becomes a Feedback evidence row (upsert_rows, key Evidence) with the source type and For or Against. Hand the problem, the users and the products to learn from to Scout in the delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['evidence'],
      }),
      orbDelegate(
        'Scout first (evidence, how others solve it, technical signals), Builder once Scout has evidence and approaches, Critic once Scout has sources to review.',
      ),
      step({
        id: 'problem',
        text: 'Write the problem statement from the evidence without naming the solution (update_card on the doc), and fill the four problem metrics with a cited figure each. Count distinct users, not mentions (query_dataset).',
        tools: ['query_dataset', 'update_card', 'query_board', 'search_board'],
        frames: ['problem'],
      }),
      step({
        id: 'score',
        text: 'Score the options: for each Options row you wrote or for Builder\'s, compute the RICE score from its inputs (query_dataset) and write it back where you own the row; ask engineering through ask_user_question for any effort that is not confirmed.',
        tools: ['query_dataset', 'upsert_rows', 'ask_user_question', 'update_card'],
        frames: ['priority', 'options'],
      }),
      step({
        id: 'requirements',
        text: 'Write the requirements for the leading option: 12 or more Requirements rows (upsert_rows, key ID), each with type, priority, the evidence it comes from and an acceptance criterion; include an Out of scope row for everything you chose not to do. Fill the Metrics plan with a baseline or the way to get one.',
        tools: ['upsert_rows', 'query_dataset', 'read_card', 'place_card'],
        frames: ['requirements', 'success'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (how others built it, the size of the segment), run deep_research (core) on that one question.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'rubric',
        text: 'Fill the Opportunity score matrix: one 1-to-5 score per rubric dimension (doubled), each with a cited card. Then the SWOT, the hypotheses (evidence for and against as card ids), the Decision with the weighted total in the rationale, and the rollout checklist.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['decision', 'problem'],
      }),
      orbMemo,
      orbMonitor,
    ],
    scout: [
      step({
        id: 'evidence',
        text: 'User evidence beyond what the user dropped: reviews, forums, Reddit, public issue trackers and community posts about the problem (web_search, fetch_url; G2 only via fetch_signed_in if ticked). Quote cards, verbatim; one Feedback evidence row each (upsert_rows, key Evidence) with source type, segment, theme, intensity and For or Against. Keep evidence against the need.',
        tools: ['web_search', 'fetch_url', 'fetch_signed_in', 'place_card', 'upsert_rows', 'query_dataset'],
        frames: ['evidence'],
      }),
      step({
        id: 'jobs',
        text: 'Jobs and users: propose job stories from the evidence in the Job stories checklist (place a Checklist card; the user ticks), and one persona (entity card, kind person) per distinct segment, grounded only in the evidence.',
        tools: ['query_dataset', 'read_card', 'place_card'],
        frames: ['jobs'],
      }),
      step({
        id: 'others',
        text: 'How others solve it: the products the user named, then find_entities and batch_enrich (how it solves it, packaging, strength, weakness) for similar products; consolidate into Competitor approaches (upsert_rows, key Product) with a Source url. A Product card (kind competitor) and a capture_page screenshot for the best three. Quick scan: find_entities is refused; read the named ones.',
        tools: ['find_entities', 'batch_enrich', 'fetch_url', 'capture_page', 'place_card', 'upsert_rows', 'query_dataset'],
        frames: ['market'],
      }),
      step({
        id: 'tech',
        text: 'Technical and dependency signals from public sources: API and platform limits, privacy and legal notes, how similar products built it (engineering blogs, docs). A Source card per fact; one Dependencies row each (upsert_rows, key Dependency) with a Source url. Never claim to know private systems.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card', 'upsert_rows'],
        frames: ['tech'],
      }),
      step({
        id: 'segment-size',
        text: 'Size the segment: how many users or accounts have the problem, from public data or the materials; a metric card with its source. Ask orb through send_message for the product\'s own numbers.',
        tools: ['web_search', 'web_answer', 'place_card', 'send_message'],
        frames: ['problem', 'evidence'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain: deep_research (core or above, per the tier), for example how the category solved this problem.',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      criticStart,
      criticFlags(['risks', 'evidence', 'requirements']),
      step({
        id: 'single-source',
        text: 'Challenge every claim resting on one user or one source, and every effort estimate not confirmed: link it "tension" to the card that disagrees, or place a Question for the owner (product, design or engineering).',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['evidence', 'tech', 'risks'],
      }),
      step({
        id: 'questions',
        text: 'Turn every gap into a Question card (ranked by importance, each linked to the gap or risk that prompted it): what to ask engineering, design, legal and the users.',
        tools: ['place_card', 'add_link', 'query_board'],
        frames: ['risks'],
      }),
      criticReport,
    ],
    builder: [
      step({
        id: 'approaches',
        text: 'The approach comparison matrix (weighted criteria, scores 0 to 10 from Competitor approaches, the note naming the rows used) and the table-stakes list (mark the Table stakes column on rows you wrote).',
        tools: ['place_card', 'query_dataset', 'upsert_rows', 'read_card'],
        frames: ['market'],
      }),
      step({
        id: 'options',
        text: 'The options: two to five Options rows (upsert_rows, key Option) with reach, impact, confidence and effort (Effort confirmed false until engineering says), and the impact by effort 2x2 (framework, quadrant). A sketch of the leading option as a design frame (write_design_frame).',
        tools: ['upsert_rows', 'place_card', 'write_design_frame', 'query_dataset', 'read_card'],
        frames: ['options'],
      }),
      step({
        id: 'priority',
        text: 'The priority: the Option ranking matrix (scores 0 to 10, the note naming the evidence), the RICE chart bound to Options and the formula card with the inputs.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['priority'],
      }),
      step({
        id: 'metrics',
        text: 'The Metrics plan: a primary, two supporting and one guardrail metric (upsert_rows, key Metric) each with definition, baseline (or Estimated), target and how it is measured. Add Requirements rows of type Non-functional that the metrics need (analytics events).',
        tools: ['upsert_rows', 'query_dataset', 'place_card'],
        frames: ['success', 'requirements'],
      }),
      step({
        id: 'jobs',
        text: 'Persona one-pagers as design frames (write_design_frame), using only quotes and facts on the board; check each job story against the evidence.',
        tools: ['write_design_frame', 'query_board', 'read_card', 'place_card'],
        frames: ['jobs'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...PRD_RUBRIC],
  redFlags: [...PRD_RED_FLAGS],

  output: {
    memoTitle: 'Product requirements: {{feature}}',
    citationRule:
      'Every paragraph cites cards; every requirement names the evidence it comes from; user counts are of people, not mentions; unconfirmed estimates are marked.',
    sections: [
      {
        id: 'summary',
        title: 'Summary & recommendation',
        frames: ['decision', 'risks'],
        words: 150,
        guidance: 'The recommendation, the three strongest reasons and the three open risks, in at most 150 words.',
      },
      {
        id: 'problem',
        title: 'Problem and goals',
        frames: ['problem'],
        guidance: 'The problem statement, who has it, the goal and the constraints.',
      },
      {
        id: 'evidence',
        title: 'Evidence',
        frames: ['evidence', 'jobs'],
        guidance: 'What users say and do, by theme and source, the job stories, and the evidence against.',
      },
      {
        id: 'market',
        title: 'How others solve it',
        frames: ['market'],
        guidance: 'The approaches, what is table stakes and what could differentiate.',
      },
      {
        id: 'options',
        title: 'Options and trade-offs',
        frames: ['options', 'priority'],
        guidance: 'The options with effort, impact and score, and why the leading one leads.',
      },
      {
        id: 'requirements',
        title: 'Requirements',
        frames: ['requirements'],
        guidance: 'The requirements table by priority with acceptance criteria, and the out-of-scope list.',
      },
      {
        id: 'success',
        title: 'Success metrics',
        frames: ['success'],
        guidance: 'The metrics plan: baseline, target and guardrail for each.',
      },
      {
        id: 'tech',
        title: 'Technical considerations and dependencies',
        frames: ['tech'],
        guidance: 'The dependencies with owner and risk, and what engineering still has to confirm.',
      },
      {
        id: 'rollout',
        title: 'Rollout',
        frames: ['decision'],
        guidance: 'The staged rollout, the flag and the way back.',
      },
      {
        id: 'risks',
        title: 'Risks and open questions',
        frames: ['risks'],
        guidance: 'The red-flag outcomes, each raised flag with its mitigant, and the ranked open questions.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard',
        frames: ['decision'],
        guidance: 'The rubric table: each dimension, its weight, its score and its evidence.',
      },
    ],
    appendix: 'All sources and the evidence table',
    onePager: {
      title: 'One-page PRD summary: {{feature}}',
      includes: ['Problem', 'Recommendation', 'Requirements', 'Metrics', 'Top risks'],
    },
    deckFormat: 'standard',
    deck: {
      title: 'Feature review: {{feature}}',
      slides: [
        { title: 'The recommendation', brief: 'What to do and the three reasons.' },
        { title: 'The problem', brief: 'Who has it, how often and what it costs.' },
        { title: 'What users say', brief: 'Themes with quotes and the evidence against.' },
        { title: 'Jobs to be done', brief: 'The job stories and the target segment.' },
        { title: 'How others solve it', brief: 'The approach comparison matrix.' },
        { title: 'Options', brief: 'The options with the impact by effort 2x2.' },
        { title: 'The leading option', brief: 'The sketch and the key requirements.' },
        { title: 'Success metrics', brief: 'Primary, supporting and guardrail metrics with targets.' },
        { title: 'Dependencies and risks', brief: 'Dependencies with owners and the raised flags.' },
        { title: 'Rollout and next steps', brief: 'The staged rollout and the open questions.' },
      ],
    },
  },

  tiers: tiers({
    quick:
      'Evidence from the materials and a quick public search: no deep research, at most 12 cards per frame, three options and the memo is the summary only.',
    standard:
      'Quick, plus find_entities and batch_enrich for how others solve it, the requirements and metrics databases, and one or two deep-research runs (core), asking before spend.',
    deep: 'Standard, plus pro or ultra research on the category and feasibility, more options and the full PRD memo and deck.',
  }),

  followUps: [
    {
      label: 'Write the user stories',
      prompt: 'Write the user stories for the Must requirements, each with its acceptance criteria and the evidence it comes from.',
    },
    {
      label: 'Cut the scope',
      prompt: 'Cut the scope to what one engineer can do in [six] weeks: which requirements stay, which move to out of scope and why.',
    },
    {
      label: 'Add the new feedback',
      prompt: 'I added new feedback. Log it as evidence, update the counts and tell me whether the recommendation changes.',
    },
    {
      label: 'Draft the launch note',
      prompt: 'Draft the launch note and the support FAQ for {{feature}} from the requirements.',
    },
    {
      label: 'Build the case against',
      prompt: 'Build the strongest case against building {{feature}} now, from the evidence and the dependencies on this board.',
    },
    {
      label: 'Prep the review meeting',
      prompt: 'Prepare the review meeting: the five questions the reviewers will ask and the card that answers each.',
    },
  ],

  signedIn: [
    { domain: 'g2.com', label: 'G2', use: 'Reviews that mention the problem and the competitors\' approach.' },
    { domain: 'linkedin.com', label: 'LinkedIn', use: 'Public posts and discussions by people with the problem.' },
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Funding and focus of the products that solve it.' },
  ],

  monitor: {
    query: '{{feature}} problem space: complaints, new competitor launches and platform changes',
    why: 'New evidence that would change the recommendation.',
  },
};
