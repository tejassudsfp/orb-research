/**
 * Policy and regulation analysis (P6.15). The depth bar is docs/phase6/vc-dd-template.md; the human-readable spec of
 * this file is docs/templates/policy-analysis.md (generated: `pnpm templates:docs`, and a test keeps the two equal).
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

// ---- the policy-assessment rubric (weights add up to 100) ----

export const POLICY_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'effectiveness',
    name: 'Effectiveness',
    weight: 25,
    anchors: {
      1: 'No evidence it achieves its stated goal.',
      3: 'Plausible, with mixed evidence from comparable cases.',
      5: 'Strong evidence it achieves the goal.',
    },
    frame: 'evidence',
  },
  {
    id: 'cost',
    name: 'Cost and efficiency',
    weight: 15,
    anchors: {
      1: 'Costs clearly exceed benefits, or are unknown.',
      3: 'Benefits plausibly exceed costs.',
      5: 'Large net benefit at low cost.',
    },
    frame: 'evidence',
  },
  {
    id: 'feasibility',
    name: 'Feasibility and enforcement',
    weight: 20,
    anchors: {
      1: 'No enforcement body, budget or capacity.',
      3: 'Enforceable with effort and some gaps.',
      5: 'Clear enforcement, funded, with capacity in place.',
    },
    frame: 'compliance',
  },
  {
    id: 'equity',
    name: 'Equity and distribution',
    weight: 10,
    anchors: {
      1: 'Concentrated harm on a vulnerable group.',
      3: 'Mixed: some groups gain, others lose.',
      5: 'Broadly shared benefits, with protections for the vulnerable.',
    },
    frame: 'stakeholders',
  },
  {
    id: 'durability',
    name: 'Legal durability',
    weight: 15,
    anchors: {
      1: 'Likely to be struck down or pre-empted.',
      3: 'Open legal questions, but defensible.',
      5: 'Firm legal footing, tested in court.',
    },
    frame: 'legal',
  },
  {
    id: 'politics',
    name: 'Political viability',
    weight: 15,
    anchors: {
      1: 'Strong organised opposition and no champion.',
      3: 'Contested, with a coalition on each side.',
      5: 'Broad support across parties and stakeholders.',
    },
    frame: 'stakeholders',
  },
];

// ---- the red-flag checklist (Critic clears or raises each) ----

export const POLICY_RED_FLAGS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: 'The text is vague on key terms, so what is covered is unclear.',
    check: 'Read the definitions in the Provisions database; raise terms with no definition or with open-ended standards.',
  },
  {
    id: 'RF02',
    text: 'An unfunded mandate: obligations with no budget or enforcement body.',
    check: 'Look for the funding clause and the enforcing authority in the Provisions database.',
  },
  {
    id: 'RF03',
    text: 'Conflicts or overlap with existing statutes, regulations or treaties.',
    check: 'Search for overlapping rules in the same and in higher jurisdictions; note each in the Provisions Conflicts column.',
  },
  {
    id: 'RF04',
    text: 'Pre-emption risk: a higher level of government may override it.',
    check: 'Check the legal basis against the constitution or the framework law of the jurisdiction and the Cases database.',
  },
  {
    id: 'RF05',
    text: 'A sunset, review or expiry clause that changes the long-run effect.',
    check: 'Read the effective dates and any sunset or review clause in the Provisions and timeline.',
  },
  {
    id: 'RF06',
    text: 'The evidence for the policy comes from the groups that benefit from it.',
    check: 'Check who produced each source in Impact evidence; raise claims backed only by interested parties.',
  },
  {
    id: 'RF07',
    text: 'Loopholes, exemptions or thresholds that let the main target avoid it.',
    check: 'List the exemptions and thresholds in Provisions and ask who could organise around them.',
  },
  {
    id: 'RF08',
    text: 'Likely unintended consequences, such as displacement or compliance avoidance.',
    check: 'Look in the comparable policies for side effects and place each one that applies here as a risk.',
  },
  {
    id: 'RF09',
    text: 'Retroactive application, or too short a transition period.',
    check: 'Compare the effective date, the transition and the compliance deadlines in the Provisions database.',
  },
  {
    id: 'RF10',
    text: 'Pending or likely litigation or constitutional challenge.',
    check: 'Search the Cases database and news for challenges; if none were searched, ask for the search.',
  },
  {
    id: 'RF11',
    text: 'Regulatory capture: the rules were drafted or shaped mainly by the regulated.',
    check: 'Read the consultation record and the Stakeholders database for who wrote or lobbied for the text.',
  },
  {
    id: 'RF12',
    text: 'The cost estimates are missing, or are far from what comparable jurisdictions found.',
    check: 'Compare the impact assessment with the comparable policies; a missing assessment is raised.',
  },
];

export const POLICY_ANALYSIS: TemplateSpecInput = {
  id: 'policy-analysis',
  label: 'Policy & regulation',
  dot: '#0F766E',
  placeholder: 'Which policy, law or regulation do you want to analyse?',
  brief:
    'Analyse a policy, law or regulation: a snapshot, the provisions clause by clause with obligations and penalties, ' +
    'the legislative history, the stakeholders and their positions, the evidence on impact, comparable jurisdictions, ' +
    'compliance and implementation, legal risks, and options with a recommendation. Quote the text, cite every claim ' +
    'about effects, separate what the law says from what people say about it, and state that this is research, not ' +
    'legal advice.',
  titleFrom: 'Policy analysis: {{policy}}',

  inputs: [
    {
      id: 'policy',
      label: 'Policy, law or regulation',
      kind: 'text',
      required: true,
      placeholder: 'EU AI Act',
      maxLength: 200,
    },
    {
      id: 'jurisdiction',
      label: 'Jurisdiction',
      kind: 'text',
      required: true,
      placeholder: 'European Union',
      suggestions: ['United States (federal)', 'California', 'European Union', 'United Kingdom', 'India', 'China', 'Canada', 'Singapore', 'International'],
      maxLength: 120,
      group: 'where',
    },
    {
      id: 'policy_type',
      label: 'Type',
      kind: 'select',
      options: ['Statute', 'Bill', 'Regulation', 'Executive order', 'Court ruling', 'Treaty', 'Guidance', 'Standard'],
      group: 'where',
      maxLength: 40,
    },
    {
      id: 'status',
      label: 'Status',
      kind: 'select',
      options: ['Proposed', 'Passed, not in force', 'In force', 'Amended', 'Repealed', 'Contested in court'],
      group: 'when',
      maxLength: 40,
    },
    {
      id: 'effective',
      label: 'Effective date',
      kind: 'text',
      placeholder: '2026-08-01',
      group: 'when',
      maxLength: 60,
    },
    {
      id: 'perspective',
      label: 'Whose perspective',
      kind: 'select',
      options: ['Neutral analyst', 'Company affected', 'Regulator or government', 'Advocacy group', 'Investor', 'Researcher'],
      help: 'Changes the recommendation, not the facts.',
      maxLength: 40,
    },
    {
      id: 'question',
      label: 'Your question',
      kind: 'longtext',
      placeholder: 'Does this apply to us? What would it cost to comply?',
      maxLength: 1500,
    },
    {
      id: 'sector',
      label: 'Sector affected',
      kind: 'text',
      placeholder: 'Health care',
      maxLength: 120,
    },
    {
      id: 'comparables',
      label: 'Comparable jurisdictions',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout finds more.',
      maxLength: 800,
    },
    {
      id: 'stakeholders',
      label: 'Stakeholders to cover',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional.',
      maxLength: 800,
    },
    materialsField('Drop the text of the law (PDF), the impact assessment, comment letters or your notes. Each becomes a card.'),
    depthField(),
    sitesField([
      { domain: 'westlaw.com', label: 'Westlaw' },
      { domain: 'lexisnexis.com', label: 'LexisNexis' },
      { domain: 'bloomberglaw.com', label: 'Bloomberg Law' },
      { domain: 'policycommons.net', label: 'Policy Commons' },
    ]),
  ],

  frames: [
    {
      id: 'snapshot',
      title: 'Policy snapshot',
      color: 'signal',
      brief:
        'What the policy is in plain words: its stated goal, the authority that made it, the jurisdiction, its type and ' +
        'status, the date it takes effect, who it applies to, the main obligation and the penalty for breach.',
      owners: ['orb'],
      targets: [
        { type: 'entity', min: 1, note: 'the policy or its issuing body' },
        { type: 'metric', min: 4 },
        { type: 'doc', min: 1, note: 'the plain-language summary' },
      ],
      seeds: [
        {
          type: 'entity',
          data: {
            title: '{{policy}}',
            kind: 'org',
            location: '{{jurisdiction}}',
            body: 'The policy under analysis, from your intake.',
            facts: [
              { label: 'Type', value: '{{policy_type|to confirm}}' },
              { label: 'Status', value: '{{status|to confirm}}' },
              { label: 'Effective', value: '{{effective|to confirm}}' },
              { label: 'Sector', value: '{{sector|to confirm}}' },
              { label: 'Perspective', value: '{{perspective|Neutral analyst}}' },
            ],
          },
          why: 'The policy, from your intake.',
        },
        doc(
          'In plain words',
          'What {{policy}} requires, of whom and by when, in three sentences. orb writes it after the first pass. This is research, not legal advice.',
        ),
        metric('Applies to', 'Who is covered, with the threshold (size, sector, activity).'),
        metric('Effective date', 'When obligations begin, and any phase-in dates.'),
        metric('Maximum penalty', 'The largest fine or sanction, with the section.'),
        metric('Enforcing body', 'The authority that enforces it.'),
      ],
      room: 300,
    },
    {
      id: 'provisions',
      title: 'Text & provisions',
      color: 'sky',
      brief:
        'The text itself, read closely: one row per operative provision with the section, the obligation, who holds it, ' +
        'the penalty, the effective date and the exact quote. Definitions, exemptions and thresholds are provisions too. ' +
        'Quote the text; never paraphrase a number or a deadline.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'the Provisions database, one row per operative section' },
        { type: 'quote', min: 5, note: 'exact text with the section number' },
        { type: 'diagram', min: 1, note: 'who must do what, to whom' },
      ],
      seeds: [
        db('Provisions', 'provisions'),
        question(
          'What does the text leave undefined?',
          'Terms, thresholds or standards that regulators or courts will have to fill in.',
        ),
      ],
    },
    {
      id: 'history',
      title: 'History & timeline',
      color: 'rho',
      brief:
        'How the policy came to be and what happens next: the problem that prompted it, the drafts, the consultation, the ' +
        'votes, amendments, the effective dates, the court dates and the deadlines still to come.',
      owners: ['scout'],
      targets: [
        { type: 'timeline', min: 1, note: 'drafts, votes, effective and upcoming dates' },
        { type: 'source', min: 4, note: 'official records first' },
      ],
      seeds: [
        timeline('Timeline', 'Analysis started', 'Scout adds each stage of the policy with its date and an official source.'),
        question('What happens next, and when?', 'Pending votes, rulemaking deadlines, court dates and transition periods.'),
      ],
    },
    {
      id: 'stakeholders',
      title: 'Stakeholders & positions',
      color: 'sky',
      brief:
        'Who gains, who pays and who decides: the regulator, the regulated, advocacy groups, trade associations, ' +
        'legislators and affected people, each with their position and the strongest argument they make, in their own ' +
        'words where possible. Note who has the power to change the outcome.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Stakeholders, at least 10' },
        { type: 'quote', min: 4, note: 'positions in their own words, at least 1 opposing' },
        { type: 'matrix', min: 1 },
      ],
      seeds: [
        db('Stakeholders', 'stakeholders'),
        matrix(
          'Stakeholder map',
          [
            ['Influence', 40],
            ['Interest', 30],
            ['Affected', 30],
          ],
          ['Regulator', 'Industry', 'Advocacy'],
        ),
        framework('Support and opposition', 'quadrant', { x: 'Support for the policy', y: 'Influence over the outcome' }),
      ],
    },
    {
      id: 'evidence',
      title: 'Evidence & impact',
      color: 'rho',
      brief:
        'What the policy is expected to do and what it did: the official impact assessment, independent studies, ' +
        'early results, cost and benefit estimates and who bears them. Mark each source as official, independent or ' +
        'interested, and every number with its basis (estimate, observed).',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Impact evidence' },
        { type: 'chart', min: 2, note: 'estimated impact by group, cost by source' },
        { type: 'metric', min: 3 },
        { type: 'insight', min: 1 },
      ],
      seeds: [
        db('Impact evidence', 'impact'),
        chart('Impact by direction', 'impact', 'bar', 'Direction'),
        metric('Estimated cost', 'Compliance or fiscal cost, with the basis and who estimated it.'),
        metric('Estimated benefit', 'The stated benefit, with the basis and who estimated it.'),
        hypothesis('The policy achieves its stated goal', 'Link the evidence for and against; weigh independent evidence above interested evidence.'),
      ],
    },
    {
      id: 'comparables',
      title: 'Comparable jurisdictions',
      color: 'sky',
      brief:
        'The same or similar policies elsewhere and what happened: jurisdiction, year, design differences, outcome and ' +
        'lessons, with the closest analogues first. Say how comparable each case really is.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Comparable policies, at least 5' },
        { type: 'matrix', min: 1, note: 'design differences' },
        { type: 'chart', min: 1 },
      ],
      seeds: [
        db('Comparable policies', 'comparables'),
        matrix(
          'Design comparison',
          [
            ['Scope', 25],
            ['Enforcement', 25],
            ['Penalties', 20],
            ['Flexibility', 15],
            ['Cost to comply', 15],
          ],
          ['{{policy}}', 'Comparable A', 'Comparable B'],
        ),
        chart('Comparable outcomes', 'comparables', 'bar', 'Outcome type'),
      ],
    },
    {
      id: 'compliance',
      title: 'Compliance & implementation',
      color: 'rho',
      brief:
        'What it takes to comply and to run: the steps, the owners, the deadlines, the cost and the capacity needed, ' +
        'the guidance issued, the enforcement record so far and the practical questions an affected party would ask.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'checklist', min: 1, note: 'the compliance steps in order' },
        { type: 'timeline', min: 1, note: 'deadlines' },
        { type: 'diagram', min: 1, note: 'the compliance flow' },
      ],
      seeds: [
        checklist('Compliance steps', [
          'Work out whether {{policy}} applies: scope and thresholds',
          'Map the obligations that apply to the role',
          'Assign an owner and a deadline to each obligation',
          'Record the evidence of compliance',
          'Track the guidance and the enforcement record',
        ]),
        timeline('Compliance deadlines', 'Deadlines to be added', 'Scout adds each compliance date with the section that sets it.'),
      ],
    },
    {
      id: 'legal',
      title: 'Legal risks & challenges',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. ' +
        'Also covers litigation and court rulings, constitutional or pre-emption questions, conflicts with other law ' +
        'and how courts have read similar texts. This is research, not legal advice.',
      owners: ['critic', 'scout'],
      targets: [
        { type: 'risk', min: 6, note: 'every checklist item cleared with a source or raised' },
        { type: 'database', min: 1, note: 'Cases' },
      ],
      seeds: [
        {
          type: 'checklist',
          data: {
            title: 'Red-flag checklist',
            items: POLICY_RED_FLAGS.map((f, i) => ({ id: `rf${i + 1}`, text: `${f.id} ${f.text}`, done: false })),
          },
          why: 'Critic raises or clears each; you tick them off.',
        },
        db('Cases', 'cases'),
        emptyRisk('Legal'),
        emptyRisk('Implementation'),
        emptyRisk('Political'),
        emptyRisk('Unintended effects'),
      ],
    },
    {
      id: 'options',
      title: 'Options & recommendation',
      color: 'signal',
      brief:
        'The choices open to the reader, such as comply, lobby, challenge, adapt or wait; each option with its cost, ' +
        'risk and benefit; the policy scored against the rubric; and a recommendation from the chosen perspective ' +
        'that states what would change it.',
      owners: ['orb', 'builder'],
      targets: [
        { type: 'framework', min: 1, note: 'pros and cons of the main option' },
        { type: 'decision', min: 1 },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
        { type: 'hypothesis', min: 2 },
      ],
      seeds: [
        hypothesis('Your question: {{question|the effect of this policy}}', 'orb answers it here and links the cards behind the answer.'),
        framework('{{policy}}: pros and cons', 'proscons'),
        matrix(
          'Policy scorecard (rubric score x 2, so 10 is a 5)',
          POLICY_RUBRIC.map((d) => [`${d.name} (${d.weight}%)`, d.weight] as [string, number]),
          ['orb score', 'Your score'],
        ),
        decision('Recommended response to {{policy}}', ['Comply', 'Comply and lobby', 'Challenge', 'Wait and watch']),
      ],
    },
    {
      id: 'questions',
      title: 'Open questions',
      color: 'paper',
      brief:
        'What is still unknown, ranked by importance, each linked to the gap that prompted it: ambiguous text, missing ' +
        'guidance, untested enforcement and facts only a regulator or a lawyer can settle.',
      owners: ['critic', 'orb'],
      targets: [{ type: 'checklist', min: 1, note: 'at least 8 ranked questions, each linked to its source card' }],
      seeds: [
        checklist('Questions for a lawyer or the regulator', [
          'Your question: {{question|none given yet}}',
          'Which reading of the undefined terms will the regulator take?',
          'What does the first enforcement action look like?',
        ]),
      ],
    },
  ],

  databases: [
    {
      key: 'provisions',
      name: 'Provisions',
      frame: 'provisions',
      purpose: 'One row per operative provision, definition, exemption and threshold of the text.',
      keyColumn: 'Section',
      columns: [
        { name: 'Section', type: 'text', note: 'Article or section number.' },
        { name: 'Topic', type: 'text' },
        { name: 'Kind', type: 'enum', options: ['Obligation', 'Prohibition', 'Right', 'Definition', 'Exemption', 'Threshold', 'Penalty', 'Procedure'] },
        { name: 'Applies to', type: 'text' },
        { name: 'Requirement', type: 'text', note: 'In plain words, numbers exact.' },
        { name: 'Penalty', type: 'text' },
        { name: 'Effective', type: 'date' },
        { name: 'Enforced by', type: 'text' },
        { name: 'Conflicts', type: 'text', note: 'Overlapping or conflicting rules.' },
        { name: 'Quote', type: 'text', note: 'The exact words.' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By kind', kind: 'board', group: 'Kind' },
        { name: 'Obligations', kind: 'table', filter: [{ column: 'Kind', op: 'eq', value: 'Obligation' }], sort: [{ column: 'Effective', dir: 'asc' }] },
      ],
    },
    {
      key: 'stakeholders',
      name: 'Stakeholders',
      frame: 'stakeholders',
      purpose: 'Everyone with a stake, their position and their strongest argument.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'Type', type: 'enum', options: ['Regulator', 'Legislator', 'Industry', 'Trade association', 'Advocacy', 'Academic', 'Citizens', 'Court'] },
        { name: 'Position', type: 'enum', options: ['Supports', 'Opposes', 'Mixed', 'Neutral', 'Unknown'] },
        { name: 'Key argument', type: 'text' },
        { name: 'Interest', type: 'text', note: 'What they win or lose.' },
        { name: 'Influence', type: 'rating', note: '1 (low) to 5 (decisive).' },
        { name: 'Link', type: 'url' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Influence', dir: 'desc' }] },
        { name: 'By position', kind: 'board', group: 'Position' },
        { name: 'Opponents', kind: 'table', filter: [{ column: 'Position', op: 'eq', value: 'Opposes' }] },
      ],
    },
    {
      key: 'impact',
      name: 'Impact evidence',
      frame: 'evidence',
      purpose: 'Every claim about the effects of the policy, with who made it and how it was measured.',
      keyColumn: 'Claim',
      columns: [
        { name: 'Claim', type: 'text' },
        { name: 'Group affected', type: 'text' },
        { name: 'Direction', type: 'enum', options: ['Benefit', 'Cost', 'Mixed', 'No effect'] },
        { name: 'Magnitude', type: 'text', note: 'With the unit.' },
        { name: 'Basis', type: 'enum', options: ['Observed', 'Modelled', 'Estimated', 'Claimed'] },
        { name: 'Producer', type: 'enum', options: ['Official', 'Independent', 'Interested'] },
        { name: 'Confidence', type: 'rating', note: '1 (low) to 5 (high).' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By direction', kind: 'board', group: 'Direction' },
        { name: 'Independent only', kind: 'table', filter: [{ column: 'Producer', op: 'eq', value: 'Independent' }] },
      ],
    },
    {
      key: 'comparables',
      name: 'Comparable policies',
      frame: 'comparables',
      purpose: 'Similar policies in other jurisdictions and what happened. Discovered with find_entities, enriched with batch_enrich.',
      keyColumn: 'Jurisdiction',
      columns: [
        { name: 'Jurisdiction', type: 'text' },
        { name: 'Policy', type: 'text' },
        { name: 'Year', type: 'number' },
        { name: 'Design difference', type: 'text' },
        { name: 'Outcome', type: 'text' },
        { name: 'Outcome type', type: 'enum', options: ['Worked', 'Mixed', 'Failed', 'Too early'] },
        { name: 'Similarity', type: 'rating', note: '1 (loose) to 5 (close analogue).' },
        { name: 'Lessons', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Similarity', dir: 'desc' }] },
        { name: 'By outcome', kind: 'board', group: 'Outcome type' },
      ],
    },
    {
      key: 'cases',
      name: 'Cases',
      frame: 'legal',
      purpose: 'Court cases and rulings that bear on the policy or on similar texts.',
      keyColumn: 'Case',
      columns: [
        { name: 'Case', type: 'text' },
        { name: 'Court', type: 'text' },
        { name: 'Date', type: 'date' },
        { name: 'Status', type: 'enum', options: ['Decided', 'Pending', 'Appealed', 'Settled'] },
        { name: 'Holding', type: 'text' },
        { name: 'Relevance', type: 'rating', note: '1 (background) to 5 (directly on point).' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'By date', kind: 'table', sort: [{ column: 'Date', dir: 'desc' }] },
        { name: 'Pending', kind: 'table', filter: [{ column: 'Status', op: 'eq', value: 'Pending' }] },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first: the text of the law, the impact assessment and comment letters (read_card ' +
          'and read_source). Hand the comparable jurisdictions and the stakeholders from the intake, and the ticked ' +
          'signed-in sources, to Scout in its delegate instruction. Fill the Policy snapshot metrics from the text only ' +
          'when you can quote the section.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'update_card'],
        frames: ['snapshot'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first (text, history, stakeholders, comparables), Builder once the Provisions ' +
          'database has rows, Critic once Scout has sources to review. Name the frames each agent owns.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'snapshot',
        text:
          'After Scout’s first pass, fill the Snapshot metrics and the plain-words summary (update_card), each with a ' +
          'cited section or source. Never state a date, threshold or penalty you cannot source from the text.',
        tools: ['query_board', 'query_dataset', 'search_board', 'update_card'],
        frames: ['snapshot'],
      }),
      step({
        id: 'gaps',
        text:
          'For a gap Scout could not close (an impact assessment, a foreign case, enforcement so far), run deep_research ' +
          '(core) on that one question. Ask the user before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'assess',
        text:
          'At the end fill the Policy scorecard: one 1-to-5 score per rubric dimension (doubled on the matrix), each with ' +
          'a cited card. Then the pros and cons, the hypotheses (evidence for and against as card ids) and the Decision ' +
          'card: your proposed response from the chosen perspective and the weighted total in its rationale.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['options'],
      }),
      step({
        id: 'memo',
        text:
          'Write the policy brief with compose_section, section by section in the order of the outline, then the ' +
          'one-page summary. On the Quick tier write the summary only. End the brief with a line that it is research and ' +
          'not legal advice.',
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
          'Only when the user asks to keep following the policy: watch_topic with the policy name and the monitor query, ' +
          'so amendments, rulemaking and rulings appear. Monitors cost money on every check, so each is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'text',
        text:
          'The text first, from the official source (fetch_url or parallel_extract; an official gazette or legislature ' +
          'site over a summary). One Provisions row per operative section (upsert_rows, key Section) with the exact ' +
          'quote, the penalty and the effective date; place the most important sections as quote cards with the ' +
          'section number. Definitions, exemptions and thresholds are rows too.',
        tools: ['fetch_url', 'parallel_extract', 'web_search', 'place_card', 'upsert_rows'],
        frames: ['provisions', 'snapshot'],
      }),
      step({
        id: 'history',
        text:
          'The legislative and regulatory history: the problem, drafts, consultations, votes, amendments, effective dates ' +
          'and what is still to come, as dated events on the timeline (place_card), each with an official source.',
        tools: ['web_search', 'fetch_url', 'place_card'],
        frames: ['history', 'compliance'],
      }),
      step({
        id: 'stakeholders',
        text:
          'Stakeholders: the ones in the intake first, then find_entities for the organisations that commented or lobbied ' +
          '(the match limit follows the depth tier); batch_enrich fills Type, Position, Key argument and Interest. Copy the ' +
          'rows into the Stakeholders database (query_dataset, upsert_rows, key Name), each with a Source. Quote each ' +
          'position in their own words as a quote card. On the Quick tier add a few from web_search with upsert_rows.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'fetch_url', 'place_card', 'query_dataset', 'upsert_rows'],
        frames: ['stakeholders'],
      }),
      step({
        id: 'evidence',
        text:
          'Evidence on impact: the official impact assessment first, then independent studies and early results. One ' +
          'Impact evidence row per claim (upsert_rows, key Claim) saying who produced it (Official, Independent or ' +
          'Interested) and how (Observed, Modelled, Estimated, Claimed). Fill the cost and benefit metrics.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card', 'upsert_rows'],
        frames: ['evidence'],
      }),
      step({
        id: 'comparables',
        text:
          'Comparable jurisdictions: the ones in the intake first, then find_entities for similar policies. Fill the ' +
          'Comparable policies database (upsert_rows, key Jurisdiction) with year, design differences, outcome and a ' +
          'Source. Say how close each analogue is in Similarity.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'fetch_url', 'query_dataset', 'upsert_rows'],
        frames: ['comparables'],
      }),
      step({
        id: 'legal',
        text:
          'Legal sweep for Critic: court cases, challenges and rulings (fetch_signed_in on Westlaw, LexisNexis or ' +
          'Bloomberg Law when the user connected them, otherwise public sources) as Cases rows (upsert_rows, key Case); ' +
          'also search for conflicts with other law, pre-emption and the enforcement record so Critic has sources.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'upsert_rows', 'place_card'],
        frames: ['legal'],
      }),
      step({
        id: 'compliance',
        text:
          'Compliance and implementation: official guidance, FAQs and the steps an affected party takes; deadlines onto ' +
          'the Compliance deadlines timeline (place_card) with the section that sets each one.',
        tools: ['fetch_url', 'parallel_extract', 'web_search', 'place_card'],
        frames: ['compliance'],
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
          'Start after Scout’s first sources: read the Provisions database and the cards of every frame (board_map, ' +
          'search_board, read_card, query_dataset) before judging anything.',
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
        frames: ['legal', 'evidence'],
      }),
      step({
        id: 'sources',
        text:
          'Challenge the evidence: for every impact claim from an interested producer, link it with "tension" to an ' +
          'independent card that disagrees, or place a Question asking for independent evidence. Check each stakeholder ' +
          'position against its quote.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['evidence', 'stakeholders'],
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
        id: 'flow',
        text:
          'A diagram of who must do what to whom (regulator, regulated, third parties) from the Provisions database, and ' +
          'the compliance flow as a second diagram.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['provisions', 'compliance'],
      }),
      step({
        id: 'charts',
        text:
          'Charts bound to the databases: impact by direction (bar) from Impact evidence, comparable outcomes from ' +
          'Comparable policies. Never an inline chart when a database holds the data.',
        tools: ['place_card', 'query_dataset'],
        frames: ['evidence', 'comparables'],
      }),
      step({
        id: 'matrix',
        text:
          'The design-comparison matrix (weighted criteria, scores 0 to 10 from the Comparable policies database) ' +
          'and the pros-and-cons framework for the main option.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['comparables', 'options'],
      }),
      step({
        id: 'summary',
        text:
          'Optional one-page visual summary (a design frame): the policy in plain words, the score, the recommendation ' +
          'and the dates, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['snapshot', 'options'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...POLICY_RUBRIC],
  redFlags: [...POLICY_RED_FLAGS],

  output: {
    memoTitle: 'Policy brief: {{policy}}',
    citationRule:
      'Every statement about what the text says quotes or cites its section; every statement about effects cites its source and says who produced it. This is research, not legal advice.',
    sections: [
      { id: 'summary', title: 'Summary & recommendation', frames: ['options', 'legal'], words: 200, guidance: 'What the policy does, the score, the recommended response and the top 3 risks, in at most 200 words.' },
      { id: 'snapshot', title: 'The policy in brief', frames: ['snapshot'], guidance: 'A table of type, status, effective date, who is covered, the main obligation and the penalty.' },
      { id: 'provisions', title: 'What the text requires', frames: ['provisions'], guidance: 'The key provisions with section numbers and exact quotes, definitions and exemptions.' },
      { id: 'history', title: 'History & what comes next', frames: ['history'], guidance: 'How it came about, the milestones and the upcoming dates.' },
      { id: 'stakeholders', title: 'Stakeholders & positions', frames: ['stakeholders'], guidance: 'Who supports and opposes it and why, with the stakeholder map.' },
      { id: 'evidence', title: 'Evidence on impact', frames: ['evidence'], guidance: 'Expected and observed effects, with who produced each estimate and the cost against the benefit.' },
      { id: 'comparables', title: 'Comparable jurisdictions', frames: ['comparables'], guidance: 'What similar policies did elsewhere and how close the analogues are.' },
      { id: 'compliance', title: 'Compliance & implementation', frames: ['compliance'], guidance: 'The steps, deadlines and enforcement record.' },
      { id: 'legal', title: 'Legal risks & challenges', frames: ['legal'], guidance: 'The red-flag outcomes, each raised flag with its mitigant, and the cases.' },
      { id: 'scorecard', title: 'Scorecard', frames: ['options'], guidance: 'The rubric table: each dimension, its weight, its score and its evidence.' },
      { id: 'options', title: 'Options & next steps', frames: ['options', 'questions'], guidance: 'The options with their trade-offs, the recommendation and the ranked open questions.' },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{policy}}',
      includes: ['Policy snapshot', 'Score', 'Recommendation', 'Key dates', 'Top risks'],
    },
    deckFormat: 'policy-brief',
  },

  tiers: tiers({
    quick: {
      summary:
        'No deep research: the text, search, extract and signed-in fetches only, at most 12 cards per frame, and the brief is the summary only.',
    },
    standard: {
      summary:
        'Quick, plus stakeholder and comparable discovery with find_entities, batch enrichment and one or two deep-research runs (core), asking before spend.',
    },
    deep: {
      summary:
        'Standard, plus pro or ultra deep research on impact and legal questions, FindAll extension for a complete stakeholder and comparables list and the full brief.',
    },
    watch: true,
  }),

  followUps: [
    { label: 'Does it apply to us?', prompt: 'Check whether {{policy}} applies to [our organisation]: walk through the scope and thresholds with the quoted sections.' },
    { label: 'Build the compliance plan', prompt: 'Build a compliance plan for {{policy}}: owners, deadlines and evidence for each obligation, from the Provisions database.' },
    { label: 'Argue the opposing side', prompt: 'Write the strongest case against {{policy}} from the stakeholders and the evidence on this board, and the evidence that would answer it.' },
    { label: 'Compare with [jurisdiction]', prompt: 'Compare {{policy}} with the policy in [jurisdiction]: scope, penalties, enforcement and outcomes, side by side in a table.' },
    { label: 'What changed?', prompt: 'Check for amendments, rulemaking and rulings on {{policy}} since this canvas was made and update the timeline and the scores.' },
    { label: 'Keep following it', prompt: 'Watch {{policy}} and tell me when it is amended, when guidance is issued and when a court rules on it.' },
  ],

  signedIn: [
    { domain: 'westlaw.com', label: 'Westlaw', use: 'Case law, statutes and citators for the Cases database.' },
    { domain: 'lexisnexis.com', label: 'LexisNexis', use: 'Case law, statutes and legal news.' },
    { domain: 'bloomberglaw.com', label: 'Bloomberg Law', use: 'Dockets, regulatory tracking and legal analysis.' },
    { domain: 'policycommons.net', label: 'Policy Commons', use: 'Policy reports and think-tank papers on the impact.' },
  ],
  monitor: {
    query: '{{policy}} amendments, rulemaking, guidance and court rulings',
    why: 'Changes that alter what the policy requires or whether it stands.',
  },
};
