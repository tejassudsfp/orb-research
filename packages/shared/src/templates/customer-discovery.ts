/**
 * Customer discovery (P6.13, startup / product): interview synthesis from dropped transcripts. Human-readable spec:
 * docs/templates/customer-discovery.md (generated: `pnpm templates:docs`).
 *
 * Parallel use: find_entities builds the recruiting list for the next interviews, deep_research sizes the problem
 * where interviews cannot, a monitor (Orb, on request) listens for new complaints. Transcripts dropped on the intake
 * become file cards; Orb logs one Interviews row per transcript and Scout reads each one page by page.
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

export const CD_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'frequency',
    name: 'Frequency',
    weight: 20,
    anchors: {
      1: 'Mentioned by one or two people, rarely.',
      3: 'Weekly for about half the participants.',
      5: 'Daily for most of them.',
    },
    frame: 'themes',
  },
  {
    id: 'severity',
    name: 'Severity',
    weight: 25,
    anchors: {
      1: 'An annoyance; people shrug.',
      3: 'Costs real time or money; people complain.',
      5: 'A blocker people describe with urgency and stories.',
    },
    frame: 'pains',
  },
  {
    id: 'workaround',
    name: 'Current workaround and spend',
    weight: 20,
    anchors: {
      1: 'Nobody does anything about it.',
      3: 'A manual workaround or a free tool.',
      5: 'People already pay, hire or build for it.',
    },
    frame: 'alternatives',
  },
  {
    id: 'reach',
    name: 'Reachable segment',
    weight: 15,
    anchors: {
      1: 'Scattered with no known channel.',
      3: 'A defined segment with some channels.',
      5: 'A tight segment with clear, cheap channels.',
    },
    frame: 'segments',
  },
  {
    id: 'pay',
    name: 'Evidence of willingness to pay',
    weight: 20,
    anchors: {
      1: 'Only "I would pay" statements.',
      3: 'A budget exists or pricing was discussed.',
      5: 'A pilot, a pre-order or a signed letter of intent.',
    },
    frame: 'validation',
  },
];

export const CD_RED_FLAGS = redFlags([
  [
    'Fewer than 5 interviews in the segment being judged.',
    'Count rows per segment in the Interviews database; a conclusion drawn from fewer than 5 is raised.',
  ],
  [
    'Leading questions in the transcripts.',
    'Read the interviewer turns for questions that suggest the answer or pitch the solution; quote them.',
  ],
  [
    'Participants are friends, family or colleagues.',
    'Check the Interviews database for relationship and source; raise a sample made of warm contacts only.',
  ],
  [
    'Willingness to pay rests on hypothetical statements.',
    'Search the evidence for "would pay" or "would buy"; without a budget, a price discussed or a commitment it is raised.',
  ],
  [
    'One segment dominates the sample.',
    'Group Interviews by Segment; raise when one segment is more than 70% of the interviews.',
  ],
  [
    'A theme rests on one loud participant.',
    'For each top theme count distinct interviews, not mentions; raise a theme heard from a single person.',
  ],
  [
    'What people say conflicts with what they do.',
    'Compare stated pain with the workaround and spend evidence; raise a pain nobody acts on.',
  ],
  [
    'The conversation was about our solution, not the problem.',
    'Check how much of each transcript is solution talk; raise interviews that never reached past behaviour.',
  ],
  [
    'Interview evidence is more than 12 months old.',
    'Check the Interviews database dates; old rows are marked stale and a Question asks for a refresh.',
  ],
  [
    'Insights are the interviewer\'s inference, not a participant\'s words.',
    'Every Insight must cite a Quote card; an Insight that cites none is raised.',
  ],
]);

export const CUSTOMER_DISCOVERY: TemplateSpecInput = {
  id: 'customer-discovery',
  label: 'Customer discovery',
  dot: '#2563EB',
  placeholder: 'Which problem or customer are you learning about?',
  brief:
    'Synthesise customer interviews: log every transcript, pull verbatim quotes, tag them into pains, needs, ' +
    'workarounds and buying triggers, find the themes and how many people raised each, segment the participants, ' +
    'test the hypotheses against the evidence, check the sample for bias, plan the next interviews, and recommend ' +
    'whether to proceed. Quote participants exactly, count people not mentions, and never invent a quote.',
  titleFrom: '{{topic}}: customer discovery',

  inputs: [
    {
      id: 'topic',
      label: 'Problem area or product',
      kind: 'text',
      required: true,
      placeholder: 'Expense reporting for field teams',
      maxLength: 100,
    },
    {
      id: 'segment',
      label: 'Who you are interviewing',
      kind: 'longtext',
      placeholder: 'Operations managers at 50 to 500 person logistics firms',
      maxLength: 600,
    },
    {
      id: 'hypotheses',
      label: 'Hypotheses to test',
      kind: 'list',
      placeholder: 'One per line: the problem is frequent; managers own the budget',
      help: 'Optional. orb proposes hypotheses from the transcripts if there are none.',
      maxLength: 1200,
    },
    {
      id: 'questions',
      label: 'Questions you want answered',
      kind: 'longtext',
      placeholder: 'How do they handle it today? What did the last failure cost?',
      maxLength: 800,
    },
    {
      id: 'stage',
      label: 'Stage of the idea',
      kind: 'select',
      options: ['Problem exploration', 'Solution validation', 'Pricing validation', 'Existing product'],
      maxLength: 40,
    },
    { id: 'geography', label: 'Region', kind: 'text', placeholder: 'US, EU', maxLength: 120 },
    materialsField(
      'Drop the interview transcripts (text, PDF, Word, Markdown), notes, survey exports (CSV or XLSX) and recordings\' summaries. Each becomes a card or database; every transcript gets a row in Interviews.',
    ),
    depthField,
    sitesField([
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'g2.com', label: 'G2' },
    ]),
  ],

  frames: [
    {
      id: 'goals',
      title: 'Research goals',
      color: 'signal',
      brief:
        'What this research must settle on {{topic}}: the decision it changes, the segment, the hypotheses and the ' +
        'questions. Your hypotheses: {{hypotheses|none given: orb proposes them from the transcripts}}. Your questions: ' +
        '{{questions|none given}}. Transcripts and notes dropped on the intake wait in the free room at the bottom of ' +
        'this frame.',
      owners: ['orb'],
      targets: [
        { type: 'hypothesis', min: 3, note: 'with evidence links' },
        { type: 'metric', min: 4 },
        { type: 'doc', min: 1, note: 'the research brief' },
      ],
      seeds: [
        {
          type: 'doc',
          data: {
            title: 'Research brief',
            body: 'Started {{date}}. Topic: {{topic}}. Segment: {{segment|to confirm}}. Stage: {{stage|to confirm}}. Questions: {{questions|none given}}.',
          },
          why: 'The brief, from your intake.',
        },
        hypothesis(
          'The problem in {{topic}} is frequent and painful',
          'For {{segment|the target segment}}. Confirm or refute with quotes from at least five people.',
        ),
        hypothesis('People already spend time or money working around it', 'Look for a workaround, a tool or a hire.'),
        hypothesis('A specific, reachable segment feels it most', 'Compare segments in the Interviews database.'),
        metric('Interviews analysed', 'Rows in the Interviews database with a transcript read.'),
        metric('Distinct participants', 'People, not conversations.'),
        metric('Segments covered', 'Distinct segments in the sample.'),
        metric('Top theme reach', 'Share of participants who raised the top theme.'),
        question('What decision will this research change?', 'Name the decision and what result would flip it.'),
      ],
      room: 360,
    },
    {
      id: 'interviews',
      title: 'Interview log',
      color: 'sky',
      brief:
        'One row per interview in the Interviews database: when, who, which segment, the source file and the key ' +
        'takeaway. Transcripts dropped on the intake wait in the first frame, Research goals, until each is ' +
        'logged here; a transcript without a row is a gap. Participants are logged by role and company type, never by private contact details.',
      owners: ['orb', 'scout'],
      targets: [
        { type: 'database', min: 1, note: 'Interviews, one row per transcript' },
      ],
      seeds: [db('Interviews', 'interviews')],
    },
    {
      id: 'evidence',
      title: 'Quotes & evidence',
      color: 'rho',
      brief:
        'Verbatim evidence from the transcripts: a Quote card for each strong statement, linked to its transcript, and a row ' +
        'per statement in the Evidence log tagged as a pain, need, workaround, goal, objection or buying trigger, ' +
        'with an intensity from 1 to 5. Quote exactly; do not tidy or merge two statements.',
      owners: ['scout'],
      targets: [
        { type: 'quote', min: 12, note: 'verbatim, each linked to its transcript' },
        { type: 'database', min: 1, note: 'Evidence log' },
      ],
      seeds: [db('Evidence log', 'evidence')],
    },
    {
      id: 'themes',
      title: 'Themes & affinity',
      color: 'sky',
      brief:
        'Group the evidence into themes: for each, how many distinct people raised it, how often, the average ' +
        'intensity and the best quote. Chart the themes by reach. An Insight names the pattern and cites at least ' +
        'two quotes.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Themes' },
        { type: 'chart', min: 1, note: 'themes by number of people' },
        { type: 'insight', min: 3, note: 'each citing at least 2 quotes' },
      ],
      seeds: [
        db('Themes', 'themes'),
        chart('Themes by number of people', 'themes', 'bar', 'Theme', 'People'),
      ],
    },
    {
      id: 'pains',
      title: 'Jobs, pains & gains',
      color: 'rho',
      brief:
        'What customers are trying to get done, what gets in the way and what a good outcome looks like. Rank the pains ' +
        'by frequency, severity, willingness to pay and the cost of the workaround, and place them on a frequency by severity 2x2.',
      owners: ['builder', 'critic'],
      targets: [
        { type: 'framework', min: 1, note: 'frequency by severity 2x2' },
        { type: 'matrix', min: 1, note: 'pains ranked on weighted criteria' },
      ],
      seeds: [
        framework('Pains: frequency by severity', 'quadrant', { xAxis: 'Frequency', yAxis: 'Severity' }),
        matrix(
          'Pain ranking',
          [
            { name: 'Frequency', weight: 25 },
            { name: 'Severity', weight: 30 },
            { name: 'Cost of the workaround', weight: 25 },
            { name: 'Willingness to pay', weight: 20 },
          ],
          ['Pain A', 'Pain B', 'Pain C'],
          'Placeholder: Builder names the top pains and scores them from the Themes database.',
        ),
      ],
    },
    {
      id: 'segments',
      title: 'Segments & personas',
      color: 'sky',
      brief:
        'Who feels the problem most: segments by role, company size and context, with the evidence for each, and ' +
        'one persona per distinct segment grounded in the participants (role, goals, triggers, objections). Say which segment to start with.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'entity', min: 2, note: 'personas, kind person' },
        { type: 'chart', min: 1, note: 'participants by segment' },
      ],
      seeds: [
        chart('Participants by segment', 'interviews', 'bar', 'Segment', 'Participant'),
        question('Which segment hurts most, and is it reachable?', 'Compare severity, spend and the channels to reach them.'),
      ],
    },
    {
      id: 'alternatives',
      title: 'Workarounds & alternatives',
      color: 'rho',
      brief:
        'What people use today: tools, spreadsheets, hires, agencies, doing nothing. A Product card per alternative ' +
        '(kind competitor) with what participants say about it, plus the competitors an outside search finds.',
      owners: ['scout'],
      targets: [
        { type: 'product', min: 4, note: 'alternatives and workarounds' },
        { type: 'source', min: 4 },
      ],
      seeds: [question('What do people do when this goes wrong, and what does it cost them?')],
    },
    {
      id: 'validation',
      title: 'Hypothesis validation',
      color: 'signal',
      brief:
        'Test each hypothesis against the evidence: link supporting and contradicting cards, set the confidence, ' +
        'and mark each validated, invalidated or still open. Score the problem against the rubric with cited evidence.',
      owners: ['critic', 'orb'],
      targets: [
        { type: 'hypothesis', min: 3, note: 'evidence for and against' },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
        { type: 'insight', min: 3 },
      ],
      seeds: [
        matrix(
          'Problem validation (rubric score x 2, so 10 is a 5)',
          CD_RUBRIC.map((d) => ({ name: `${d.name} (${d.weight}%)`, weight: d.weight })),
          ['orb score', 'Your score'],
          'orb fills one score per dimension with cited evidence; you may override.',
        ),
        framework('What is true, what is not, what is unknown', 'proscons'),
      ],
    },
    {
      id: 'bias',
      title: 'Gaps & bias check',
      color: 'paper',
      brief:
        'Work through the red-flag checklist on the research itself: sample size, leading questions, one segment, ' +
        'hypothetical willingness to pay. Raise each flag as a Risk card with evidence or clear it with a source.',
      owners: ['critic'],
      targets: [{ type: 'risk', min: 5, note: 'every checklist item cleared with a source or raised' }],
      seeds: [
        checklist(
          'Research-quality checklist',
          CD_RED_FLAGS.map((f) => `${f.id} ${f.text}`),
          'Critic raises or clears each; you tick them off.',
        ),
        emptyRisk('Sample bias'),
        emptyRisk('Interviewer bias'),
        emptyRisk('Stated vs real behaviour'),
      ],
    },
    {
      id: 'next',
      title: 'Next interviews',
      color: 'paper',
      brief:
        'Who to talk to next and what to ask: a recruiting list of people matching the segment (find_entities, public ' +
        'professional information only) and ranked follow-up questions, each linked to the gap that prompted it.',
      owners: ['critic', 'scout', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Recruiting list' },
        { type: 'checklist', min: 1, note: 'at least 10 ranked questions' },
      ],
      seeds: [
        db('Recruiting list', 'recruiting'),
        checklist('Questions for the next interviews', [
          'Walk me through the last time this happened: what did you do first?',
          'What did it cost you, in time or money?',
          'What have you tried, and why did you stop?',
        ]),
      ],
    },
    {
      id: 'recommendation',
      title: 'Recommendation',
      color: 'signal',
      brief:
        'What the evidence supports: proceed, narrow the segment, pivot the problem or keep researching, with the ' +
        'conditions and the next experiment. The weighted rubric total goes in the rationale.',
      owners: ['orb'],
      targets: [{ type: 'decision', min: 1 }, { type: 'insight', min: 2 }],
      seeds: [
        {
          type: 'decision',
          data: {
            title: 'What should we do about {{topic}}?',
            body: 'Open. orb proposes after the rubric is filled.',
            options: [
              { label: 'Proceed to a prototype' },
              { label: 'Narrow to one segment' },
              { label: 'Pivot the problem' },
              { label: 'Interview more people' },
            ],
            status: 'open',
          },
          why: 'Open decision: you choose; orb proposes.',
        },
      ],
    },
  ],

  databases: [
    {
      key: 'interviews',
      name: 'Interviews',
      frame: 'interviews',
      purpose: 'One row per interview, linked to its transcript card.',
      keyColumn: 'Interview',
      columns: [
        { name: 'Interview', type: 'text', note: 'An id such as I-01.' },
        { name: 'Date', type: 'date' },
        { name: 'Participant', type: 'person', note: 'Role and company type only; no contact details.' },
        { name: 'Role', type: 'text' },
        { name: 'Segment', type: 'text' },
        { name: 'Company size', type: 'text' },
        { name: 'Relationship', type: 'enum', options: ['Stranger', 'Warm intro', 'Friend or colleague', 'Customer'] },
        { name: 'Transcript', type: 'text', note: 'The title of the transcript card.' },
        { name: 'Key takeaway', type: 'text' },
        { name: 'Fit', type: 'rating', note: '1 to 5: how well the person matches the segment.' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Date', dir: 'asc' }] },
        { name: 'By segment', kind: 'board', group: 'Segment' },
      ],
    },
    {
      key: 'evidence',
      name: 'Evidence log',
      frame: 'evidence',
      purpose: 'Every strong statement, tagged, with its intensity and a pointer to its transcript.',
      keyColumn: 'Quote',
      columns: [
        { name: 'Quote', type: 'text', note: 'Verbatim.' },
        { name: 'Interview', type: 'text', note: 'The Interview id.' },
        { name: 'Type', type: 'enum', options: ['Pain', 'Need', 'Workaround', 'Goal', 'Objection', 'Buying trigger'] },
        { name: 'Theme', type: 'text' },
        { name: 'Intensity', type: 'rating', note: '1 (mild) to 5 (urgent).' },
        { name: 'Segment', type: 'text' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Intensity', dir: 'desc' }] },
        { name: 'By type', kind: 'board', group: 'Type' },
        { name: 'Urgent', kind: 'table', filter: [{ column: 'Intensity', op: 'gte', value: 4 }] },
      ],
    },
    {
      key: 'themes',
      name: 'Themes',
      frame: 'themes',
      purpose: 'One row per theme with the number of distinct people who raised it.',
      keyColumn: 'Theme',
      columns: [
        { name: 'Theme', type: 'text' },
        { name: 'Description', type: 'text' },
        { name: 'People', type: 'number', note: 'Distinct participants, not mentions.' },
        { name: 'Mentions', type: 'number' },
        { name: 'Avg intensity', type: 'number' },
        { name: 'Type', type: 'enum', options: ['Pain', 'Need', 'Workaround', 'Goal', 'Objection', 'Buying trigger'] },
        { name: 'Best quote', type: 'text' },
      ],
      views: [
        { name: 'By reach', kind: 'table', sort: [{ column: 'People', dir: 'desc' }] },
        { name: 'By type', kind: 'board', group: 'Type' },
      ],
    },
    {
      key: 'recruiting',
      name: 'Recruiting list',
      frame: 'next',
      purpose: 'People or companies that match the segment, for the next round of interviews. Public professional information only.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'Role', type: 'text' },
        { name: 'Company', type: 'text' },
        { name: 'Segment', type: 'text' },
        { name: 'Channel', type: 'enum', options: ['LinkedIn', 'Email', 'Community', 'Referral', 'Other'] },
        { name: 'Status', type: 'enum', options: ['Candidate', 'Contacted', 'Scheduled', 'Done', 'Declined'] },
        { name: 'Why a fit', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By status', kind: 'board', group: 'Status' },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'log-transcripts',
        text: 'List the transcripts the user dropped or pasted (board_map, query_board for file, doc and note cards). Add one Interviews row per transcript (upsert_rows, key Interview: I-01, I-02 ...) with the date, role, segment and relationship where the file says so, and the transcript title. A transcript you cannot read is a Question card, not a skipped row.',
        tools: ['board_map', 'query_board', 'read_card', 'upsert_rows', 'place_card'],
        frames: ['interviews'],
      }),
      step({
        id: 'brief',
        text: "Read the intake and the first transcript, then fill the research brief and propose hypotheses if the user gave none (update_card on the three seeds). Set the metric placeholders as the log fills.",
        tools: ['read_card', 'update_card', 'query_dataset'],
        frames: ['goals'],
      }),
      orbDelegate(
        'Scout first (reads every transcript), Builder once the Themes database has rows, Critic once Scout has quotes to review.',
      ),
      step({
        id: 'validate',
        text: 'Validate: for each hypothesis, link supporting and contradicting cards (add_link with supports or contradicts), set the confidence, and say validated, invalidated or open in the body. Fill the Problem validation matrix (rubric scores doubled on the matrix) with a cited card per score, then the Decision rationale with the weighted total.',
        tools: ['query_board', 'search_board', 'read_card', 'update_card', 'add_link', 'place_card'],
        frames: ['validation', 'recommendation'],
      }),
      step({
        id: 'gaps',
        text: 'Where interviews cannot answer a sizing or competitor question, run deep_research (core) on that one question.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      orbMemo,
      orbMonitor,
    ],
    scout: [
      step({
        id: 'read',
        text: 'Read every transcript the user dropped, page by page (the file, doc and note cards in Research goals: board_map to find them, read_card with page). Never skim: a transcript you did not read to the end is reported as such.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset'],
        frames: ['interviews', 'goals'],
      }),
      step({
        id: 'quotes',
        text: 'Quote cards: one per strong statement, body copied verbatim (under 50 words), sourceCardId set to the transcript card, the interview id in the why line. One Evidence log row per quote (upsert_rows, key Quote) tagged Type, Theme and Intensity. Do not merge two statements or fix wording. Quick scan: at most 12 cards.',
        tools: ['place_card', 'add_link', 'upsert_rows'],
        frames: ['evidence'],
      }),
      step({
        id: 'themes',
        text: 'Themes: group the Evidence log (query_dataset) into themes; one Themes row each (upsert_rows, key Theme) with the number of DISTINCT people, mentions, average intensity and the best quote. Names stay in the participant\'s words where possible.',
        tools: ['query_dataset', 'upsert_rows', 'place_card'],
        frames: ['themes'],
      }),
      step({
        id: 'alternatives',
        text: 'Alternatives and workarounds: what participants named, then what web_search and G2 show for the same job (fetch_signed_in only if the user ticked it). One Product card each (kind competitor) with a source.',
        tools: ['web_search', 'fetch_url', 'fetch_signed_in', 'place_card', 'parallel_extract'],
        frames: ['alternatives'],
      }),
      step({
        id: 'personas',
        text: 'Segments and personas: one entity card (kind person) per distinct segment, grounded only in what participants said (role, goals, triggers, objections); name the segment to start with.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['segments'],
      }),
      step({
        id: 'recruit',
        text: 'The recruiting list: find_entities for people or companies matching the segment (public professional information only, no private contact details); batch_enrich the role, company and why they fit; consolidate into Recruiting list (upsert_rows, key Name) with a Source url. Quick scan: find_entities is refused; add a few rows from web_search.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'upsert_rows', 'query_dataset'],
        frames: ['next'],
        minTier: 'standard',
      }),
      step({
        id: 'deep',
        text: 'Deep research for what interviews cannot answer: the size of the segment, how the alternatives are priced, regulatory limits (deep_research, core or above, per the tier).',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      criticStart,
      criticFlags(['bias', 'validation']),
      step({
        id: 'leading',
        text: 'Read the interviewer turns of each transcript (read_source, read_card) for leading questions, pitching and solution talk; place a Risk with the quoted turn. Count distinct people behind each top theme (query_dataset); a theme from one person is linked "tension" to the claim it supports.',
        tools: ['read_card', 'read_source', 'query_dataset', 'add_link', 'place_card'],
        frames: ['bias', 'pains'],
      }),
      step({
        id: 'followups',
        text: 'Turn every gap into a ranked question in "Questions for the next interviews" (place a Checklist or Question card; you cannot tick), each linked to the gap or risk that prompted it.',
        tools: ['place_card', 'add_link', 'query_board'],
        frames: ['next'],
      }),
      criticReport,
    ],
    builder: [
      step({
        id: 'charts',
        text: 'Charts bound to the databases: themes by number of people (bar, Themes), participants by segment (bar, Interviews). Rebuild a chart when a column is renamed.',
        tools: ['place_card', 'query_dataset'],
        frames: ['themes', 'segments'],
      }),
      step({
        id: 'pains',
        text: 'The pains: the frequency by severity 2x2 (framework, quadrant) and the Pain ranking matrix (scores 0 to 10 from Themes and Evidence log, the note naming the rows used).',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['pains'],
      }),
      step({
        id: 'personas',
        text: 'A persona one-pager per segment as a design frame (write_design_frame), using only quotes and facts on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card', 'place_card'],
        frames: ['segments'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...CD_RUBRIC],
  redFlags: [...CD_RED_FLAGS],

  output: {
    memoTitle: 'Customer discovery synthesis: {{topic}}',
    citationRule:
      'Every finding cites quote cards; counts are of people, not mentions; every quote is verbatim and names its interview.',
    sections: [
      {
        id: 'summary',
        title: 'Summary & recommendation',
        frames: ['recommendation', 'validation'],
        words: 150,
        guidance: 'What we learned, the recommendation and the three strongest pieces of evidence, in at most 150 words.',
      },
      {
        id: 'method',
        title: 'Who we spoke to and how',
        frames: ['goals', 'interviews'],
        guidance: 'The sample: number, segments, relationship, dates; and the limits of it.',
      },
      {
        id: 'themes',
        title: 'What we heard',
        frames: ['themes', 'evidence'],
        guidance: 'The themes ranked by number of people, each with two quotes, and the themes chart.',
      },
      {
        id: 'pains',
        title: 'Jobs, pains and gains',
        frames: ['pains'],
        guidance: 'The ranked pains and the frequency by severity 2x2.',
      },
      {
        id: 'segments',
        title: 'Segments and personas',
        frames: ['segments'],
        guidance: 'The segments, the personas and the one to start with.',
      },
      {
        id: 'alternatives',
        title: 'Workarounds and alternatives',
        frames: ['alternatives'],
        guidance: 'What people do today and what it costs them.',
      },
      {
        id: 'validation',
        title: 'Hypotheses and scorecard',
        frames: ['validation'],
        guidance: 'Each hypothesis with its verdict and confidence, and the rubric table.',
      },
      {
        id: 'quality',
        title: 'Limits and bias',
        frames: ['bias'],
        guidance: 'The raised research-quality flags and what they do to the conclusions.',
      },
      {
        id: 'next',
        title: 'Next interviews and experiments',
        frames: ['next', 'recommendation'],
        guidance: 'The ranked questions, the recruiting plan and the next experiment.',
      },
    ],
    appendix: 'All sources and transcripts',
    onePager: {
      title: 'One-page summary: {{topic}} customer discovery',
      includes: ['Sample', 'Top themes', 'Verdict', 'Next steps'],
    },
    deckFormat: 'standard',
    deck: {
      title: 'Customer discovery readout: {{topic}}',
      slides: [
        { title: 'What we set out to learn', brief: 'The decision, the segment and the hypotheses.' },
        { title: 'Who we spoke to', brief: 'Participants by segment and the limits of the sample.' },
        { title: 'The top themes', brief: 'Themes by number of people, with a chart.' },
        { title: 'In their words', brief: 'The best quotes per theme, each naming its interview.' },
        { title: 'Pains ranked', brief: 'The frequency by severity 2x2 and the ranking matrix.' },
        { title: 'Who feels it most', brief: 'The segments and personas.' },
        { title: 'What people do today', brief: 'Workarounds, alternatives and their cost.' },
        { title: 'Hypotheses: validated or not', brief: 'Each hypothesis with its verdict and evidence.' },
        { title: 'Recommendation', brief: 'The decision and the rubric score.' },
        { title: 'Next steps', brief: 'The next interviews and the experiment to run.' },
      ],
    },
  },

  tiers: tiers({
    quick:
      'Read the transcripts and synthesise: no deep research, no recruiting list, at most 12 cards per frame, the memo is the summary only.',
    standard:
      'Quick, plus a recruiting list with find_entities and batch_enrich, personas and one or two deep-research runs (core), asking before spend.',
    deep: 'Standard, plus pro research to size the problem and the alternatives, and the full memo and readout deck.',
  }),

  followUps: [
    {
      label: 'Which quotes support theme X',
      prompt: 'Show me every verbatim quote behind the theme [theme], with the interview and the person count.',
    },
    {
      label: 'Add the new transcripts',
      prompt: 'I added new transcripts. Log them, extend the evidence and themes, and tell me what changed in the verdicts.',
    },
    {
      label: 'Write the interview guide',
      prompt: 'Write the guide for the next round of interviews on {{topic}}: opening, behaviour questions, the gaps to probe, no leading questions.',
    },
    {
      label: 'Stress-test the top theme',
      prompt: 'Build the strongest case that the top theme is not real: who disagreed, who is missing from the sample, what would change the verdict.',
    },
    {
      label: 'Draft the readout deck',
      prompt: 'Make the readout deck from the customer discovery outline, each slide citing quotes and cards.',
    },
    {
      label: 'Listen for new complaints',
      prompt: 'Start a monitor for new public complaints and requests about {{topic}}.',
    },
  ],

  signedIn: [
    { domain: 'linkedin.com', label: 'LinkedIn', use: 'Public professional profiles for the recruiting list: role, company, segment.' },
    { domain: 'g2.com', label: 'G2', use: 'Reviews of the alternatives participants named.' },
  ],

  monitor: {
    query: '{{topic}} complaints, workarounds and unmet needs in public forums and reviews',
    why: 'New evidence for or against the hypotheses.',
  },
};
