/**
 * Topic deep dive (P6.15): the v2 upgrade of the v1 "Topic deep dive" chip. The v1 chip (`topic`, no form, five empty
 * frames) stays as the one-click start; this template is the researched version of it. The depth bar is
 * docs/phase6/vc-dd-template.md; the human-readable spec of this file is docs/templates/deep-dive.md (generated:
 * `pnpm templates:docs`, and a test keeps the two equal).
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

// ---- the understanding rubric (weights add up to 100) ----

export const DIVE_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'evidence',
    name: 'Quality of evidence',
    weight: 25,
    anchors: {
      1: 'Opinion pieces and secondary summaries.',
      3: 'A mix of primary sources and reputable reporting.',
      5: 'Primary data, peer-reviewed work and independent confirmation.',
    },
    frame: 'for',
  },
  {
    id: 'diversity',
    name: 'Diversity of sources',
    weight: 20,
    anchors: {
      1: 'One outlet, one viewpoint.',
      3: 'Several outlets, mostly one viewpoint.',
      5: 'Independent sources across viewpoints, regions and time.',
    },
    frame: 'sources',
  },
  {
    id: 'counter',
    name: 'Counter-evidence addressed',
    weight: 25,
    anchors: {
      1: 'The best opposing evidence is not looked for.',
      3: 'Opposing views are listed, not answered.',
      5: 'The strongest opposing evidence is stated and answered.',
    },
    frame: 'against',
  },
  {
    id: 'recency',
    name: 'Recency',
    weight: 10,
    anchors: {
      1: 'Mostly outdated.',
      3: 'Some recent sources.',
      5: 'Current to the last few months where the topic moves fast.',
    },
    frame: 'sources',
  },
  {
    id: 'explanatory',
    name: 'Explanatory power',
    weight: 20,
    anchors: {
      1: 'The thesis explains little of the evidence.',
      3: 'It explains the main facts, with loose ends.',
      5: 'It explains the evidence, predicts and survives the objections.',
    },
    frame: 'synthesis',
  },
];

// ---- the red-flag checklist (Critic clears or raises each) ----

export const DIVE_RED_FLAGS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: 'The thesis rests on one source, or on sources that cite each other.',
    check: 'Count independent origins in the Key sources database; raise a claim that traces back to one.',
  },
  {
    id: 'RF02',
    text: 'The evidence for and the evidence against are very unequal in quality or amount.',
    check: 'Compare the counts and the reliability ratings of the For and Against frames and raise a lopsided pair.',
  },
  {
    id: 'RF03',
    text: 'Secondary summaries are used where a primary source exists.',
    check: 'For each key claim look for the original document, dataset or statement; raise those cited second-hand.',
  },
  {
    id: 'RF04',
    text: 'A source has a clear interest in the conclusion (funder, seller, campaign).',
    check: 'Read the Interest column of Key sources; raise claims backed only by interested parties.',
  },
  {
    id: 'RF05',
    text: 'Key sources are out of date for a topic that moves quickly.',
    check: 'Compare the Date column with the pace of the topic; raise outdated support for a current claim.',
  },
  {
    id: 'RF06',
    text: 'Definitions shift between sources, so the evidence is not about the same thing.',
    check: 'Compare how sources define the key terms; raise claims that stretch across incompatible definitions.',
  },
  {
    id: 'RF07',
    text: 'Correlation presented as causation.',
    check: 'For each causal claim look for a design or argument that supports cause; raise those with only association.',
  },
  {
    id: 'RF08',
    text: 'Numbers without a base rate, denominator or comparison.',
    check: 'Check each figure in the metrics and quotes for what it is a share of and what it is compared with.',
  },
  {
    id: 'RF09',
    text: 'One region, period or group stands for the whole.',
    check: 'Look at the place and time of the evidence; raise claims generalised from one setting.',
  },
  {
    id: 'RF10',
    text: 'Quotes or statistics that may be out of context, or that circulate with no origin.',
    check: 'Trace each striking quote or number to its origin and place the finding in Key sources.',
  },
];

export const DEEP_DIVE: TemplateSpecInput = {
  id: 'deep-dive',
  label: 'Deep dive',
  dot: '#2563EB',
  placeholder: 'Which topic do you want to understand deeply?',
  brief:
    'Build a deep, evidence-based understanding of a topic: a working thesis, the background and definitions, the ' +
    'strongest evidence for and against, the key sources with their reliability, the perspectives and debates, a ' +
    'timeline and a map of the concepts, and a synthesis scored by an understanding rubric. Look for the best ' +
    'opposing evidence, prefer primary sources, give every claim a citation and say what is still open.',
  titleFrom: 'Deep dive: {{topic}}',

  inputs: [
    {
      id: 'topic',
      label: 'Topic',
      kind: 'text',
      required: true,
      placeholder: 'Solid-state batteries',
      maxLength: 160,
    },
    {
      id: 'goal',
      label: 'Goal',
      kind: 'select',
      options: ['Understand it', 'Decide something', 'Write about it', 'Teach it', 'Test a claim'],
      group: 'why',
      maxLength: 40,
    },
    {
      id: 'level',
      label: 'Your level',
      kind: 'select',
      options: ['New to it', 'Some background', 'Expert'],
      group: 'why',
      maxLength: 40,
    },
    {
      id: 'thesis',
      label: 'Working thesis or claim',
      kind: 'longtext',
      placeholder: 'Solid-state batteries will reach mass-market cars before 2030.',
      help: 'Optional. orb proposes one when this is empty.',
      maxLength: 1500,
    },
    {
      id: 'known',
      label: 'What you already know',
      kind: 'longtext',
      placeholder: 'Anything you have read or believe.',
      maxLength: 1500,
    },
    {
      id: 'questions',
      label: 'Questions you want answered',
      kind: 'longtext',
      placeholder: 'One per line',
      maxLength: 1500,
    },
    {
      id: 'scope',
      label: 'Scope or period',
      kind: 'text',
      placeholder: 'Since 2015, worldwide',
      maxLength: 200,
    },
    {
      id: 'sources_known',
      label: 'Sources you trust or want included',
      kind: 'list',
      placeholder: 'URLs, outlets or authors, comma separated',
      help: 'Optional.',
      maxLength: 1000,
    },
    materialsField('Drop articles, PDFs, notes or a link list. Each becomes a card; Scout reads them first.'),
    depthField(),
    sitesField([
      { domain: 'nytimes.com', label: 'The New York Times' },
      { domain: 'ft.com', label: 'Financial Times' },
      { domain: 'wsj.com', label: 'The Wall Street Journal' },
      { domain: 'substack.com', label: 'Substack' },
    ]),
  ],

  frames: [
    {
      id: 'thesis',
      title: 'Thesis & key questions',
      color: 'signal',
      brief:
        'What you want to understand, stated as a thesis that could be wrong and a short list of key questions. The ' +
        'thesis is refined as evidence comes in; the questions decide what is researched.',
      owners: ['orb'],
      targets: [
        { type: 'hypothesis', min: 1, note: 'the working thesis' },
        { type: 'question', min: 4, note: 'the key questions' },
        { type: 'doc', min: 1 },
      ],
      seeds: [
        hypothesis('Thesis: {{topic}}', 'Your claim: {{thesis|not given; orb proposes one after the first pass.}} Link the cards that support and contradict it.'),
        doc(
          'What I want to know',
          'Goal: {{goal|understand it}}. Level: {{level|to confirm}}. Scope: {{scope|to confirm}}. What you already know: {{known|nothing given.}}',
          'Your goal, from the intake.',
        ),
        question('Your questions: {{questions|none given yet}}', 'orb splits these into separate questions after the first pass.'),
        question('What would change my mind?', 'The strongest result or fact that would show the thesis is wrong.'),
      ],
      room: 300,
    },
    {
      id: 'background',
      title: 'Background & definitions',
      color: 'sky',
      brief:
        'The shortest path to being able to read the rest: what the topic is, the key terms defined the way the sources ' +
        'use them, the history in a few paragraphs, the main concepts and how they connect, and the scale (numbers that ' +
        'give a sense of size).',
      owners: ['scout', 'builder', 'orb'],
      targets: [
        { type: 'doc', min: 2, note: 'definitions and a short history' },
        { type: 'metric', min: 4, note: 'the scale, each cited' },
        { type: 'diagram', min: 1, note: 'a concept map' },
        { type: 'timeline', min: 1 },
      ],
      seeds: [
        doc('Key terms', 'The terms the sources use and how each one is defined. Scout adds each with its source; a term that is used in two senses is flagged.'),
        metric('Scale', 'A number that shows how big or common the topic is, with its source and year.'),
        metric('Growth or change', 'How the main measure has changed, with the period.'),
        timeline('History', 'Deep dive started', 'Scout adds the events that shaped the topic with dates and sources.'),
      ],
    },
    {
      id: 'sources',
      title: 'Key sources',
      color: 'rho',
      brief:
        'The best sources on the topic and how far to trust each: primary documents, datasets, expert and institutional ' +
        'reports, reputable reporting and the strongest advocates on each side. One row each with the type, the date, ' +
        'the stance, any interest in the outcome and a reliability rating.',
      owners: ['scout', 'critic', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'the Key sources database, at least 15 on Standard' },
        { type: 'source', min: 6, note: 'the best sources as cards, including primary ones' },
        { type: 'chart', min: 1 },
      ],
      seeds: [
        db('Key sources', 'sources'),
        chart('Sources by stance', 'sources', 'bar', 'Stance'),
        chart('Sources by type', 'sources', 'pie', 'Type'),
      ],
    },
    {
      id: 'for',
      title: 'Evidence for',
      color: 'sky',
      brief:
        'The strongest evidence that supports the thesis: facts, data, studies, expert statements and examples, each as a ' +
        'card that says what it shows and how strong it is. Primary and independent evidence first; mark the rest.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'source', min: 4 },
        { type: 'quote', min: 3, note: 'with where in the source' },
        { type: 'metric', min: 2 },
        { type: 'insight', min: 1, note: 'what the evidence adds up to' },
      ],
      seeds: [question('What is the single strongest piece of evidence for the thesis, and why?')],
    },
    {
      id: 'against',
      title: 'Evidence against',
      color: 'rho',
      brief:
        'The strongest evidence and arguments against the thesis, stated as fairly as their holders would state them: ' +
        'contrary data, failed predictions, competing explanations and the best critics. Equal effort to the case for. ' +
        'Say which objections the thesis answers and which it does not.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'source', min: 4 },
        { type: 'quote', min: 3, note: 'the critics in their own words' },
        { type: 'risk', min: 2, note: 'the objections the thesis cannot yet answer' },
      ],
      seeds: [
        question('What is the strongest objection to the thesis?', 'State it the way its best defender would.'),
        framework('Thesis: pros and cons', 'proscons'),
      ],
    },
    {
      id: 'perspectives',
      title: 'Perspectives & debates',
      color: 'sky',
      brief:
        'Who disagrees with whom and why: the schools of thought, the main debates, what each side values and which ' +
        'facts each says matter most, and where the disagreement is about facts, values or definitions.',
      owners: ['scout', 'critic', 'builder'],
      targets: [
        { type: 'framework', min: 1, note: 'the positioning of the camps' },
        { type: 'matrix', min: 1, note: 'perspectives against the key questions' },
        { type: 'entity', min: 3, note: 'the leading voices' },
      ],
      seeds: [
        framework('Where the camps stand', 'quadrant', { x: 'Skeptical to confident', y: 'Weak to strong evidence' }),
        matrix(
          'Perspectives against the key questions',
          [
            ['Evidence offered', 30],
            ['Answers the key questions', 30],
            ['Addresses objections', 20],
            ['Independence', 20],
          ],
          ['Camp A', 'Camp B', 'Camp C'],
        ),
      ],
    },
    {
      id: 'risks',
      title: 'Evidence quality & red flags',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. ' +
        'Also covers weak links in the argument: unstated assumptions, definitions that shift, and conclusions that go ' +
        'further than the evidence.',
      owners: ['critic'],
      targets: [{ type: 'risk', min: 5, note: 'every checklist item cleared with a source or raised' }],
      seeds: [
        {
          type: 'checklist',
          data: {
            title: 'Red-flag checklist',
            items: DIVE_RED_FLAGS.map((f, i) => ({ id: `rf${i + 1}`, text: `${f.id} ${f.text}`, done: false })),
          },
          why: 'Critic raises or clears each; you tick them off.',
        },
        emptyRisk('Source'),
        emptyRisk('Reasoning'),
        emptyRisk('Bias'),
      ],
    },
    {
      id: 'synthesis',
      title: 'Synthesis',
      color: 'signal',
      brief:
        'What it adds up to: the thesis restated with the confidence it deserves, the answer to each key question, the ' +
        'understanding score by the rubric, the one thing to remember and what would change the conclusion.',
      owners: ['orb'],
      targets: [
        { type: 'matrix', min: 1, note: 'the filled rubric' },
        { type: 'decision', min: 1 },
        { type: 'hypothesis', min: 2, note: 'with evidence links' },
        { type: 'insight', min: 2 },
      ],
      seeds: [
        matrix(
          'Understanding scorecard (rubric score x 2, so 10 is a 5)',
          DIVE_RUBRIC.map((d) => [`${d.name} (${d.weight}%)`, d.weight] as [string, number]),
          ['orb score', 'Your score'],
        ),
        decision('Where the thesis stands: {{topic}}', ['Supported', 'Partly supported', 'Unsupported', 'Undecided']),
        hypothesis('The refined thesis', 'orb restates the thesis after the evidence is in, with its confidence and the evidence for and against.'),
      ],
    },
    {
      id: 'next',
      title: 'Open questions & next reads',
      color: 'paper',
      brief:
        'What is still unknown, ranked by importance and linked to the gap behind each, and a short reading list: where ' +
        'to go next to settle them, with the best primary source first.',
      owners: ['critic', 'orb'],
      targets: [{ type: 'checklist', min: 2, note: 'open questions and the reading list, ranked' }],
      seeds: [
        checklist('Next reads', [
          'The best primary source on the main question',
          'The strongest critic of the thesis',
          'A recent overview by a neutral institution',
        ]),
        checklist('Open questions', ['Your questions: {{questions|none given yet}}', 'What data would settle the main disagreement?']),
      ],
    },
  ],

  databases: [
    {
      key: 'sources',
      name: 'Key sources',
      frame: 'sources',
      purpose: 'The best sources, how reliable each is and what stake it has in the outcome.',
      keyColumn: 'Title',
      columns: [
        { name: 'Title', type: 'text' },
        { name: 'Author or organisation', type: 'text' },
        { name: 'Type', type: 'enum', options: ['Primary document', 'Dataset', 'Peer-reviewed', 'Institutional report', 'News', 'Analysis or opinion', 'Book', 'Video or talk'] },
        { name: 'Date', type: 'date' },
        { name: 'Stance', type: 'enum', options: ['Supports', 'Against', 'Mixed', 'Neutral'] },
        { name: 'Interest', type: 'text', note: 'Funder, seller or campaign, or none found.' },
        { name: 'Reliability', type: 'rating', note: '1 (weak) to 5 (very reliable).' },
        { name: 'Key point', type: 'text' },
        { name: 'URL', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Reliability', dir: 'desc' }] },
        { name: 'By stance', kind: 'board', group: 'Stance' },
        { name: 'Primary', kind: 'table', filter: [{ column: 'Type', op: 'in', value: ['Primary document', 'Dataset', 'Peer-reviewed'] }] },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first (read_card and read_source). Propose a working thesis in the Thesis card ' +
          'when the intake left it empty, and split the user’s questions into separate Question cards (place_card). ' +
          'Hand the trusted sources and the ticked signed-in sources to Scout in its delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'place_card', 'update_card'],
        frames: ['thesis'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first (background, sources, evidence for and against), Builder once Scout has ' +
          'placed its first sources, Critic once there is evidence on both sides. Tell Scout to give the case against the ' +
          'same effort as the case for.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'background',
        text:
          'After Scout’s first pass, write the key-terms card and fill the Scale and Growth metrics (update_card), each ' +
          'with a cited figure and its year. Never write a number you cannot source.',
        tools: ['query_dataset', 'query_board', 'search_board', 'update_card'],
        frames: ['background'],
      }),
      step({
        id: 'gaps',
        text:
          'For a gap Scout could not close (a primary source, the best critic, a figure with no origin), run deep_research ' +
          '(core) on that one question. Ask the user before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'synthesis',
        text:
          'At the end fill the Understanding scorecard: one 1-to-5 score per rubric dimension (doubled on the matrix), ' +
          'each with a cited card. Restate the thesis with its confidence (evidence for and against as card ids), place ' +
          'insight cards that cite at least two cards each, and fill the Decision card: your proposed option and the ' +
          'weighted total in its rationale.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['synthesis'],
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
        text: 'Keep the open questions and the reading list current: collect every unresolved Question card into the checklists, ranked, each linked to its source card.',
        tools: ['search_board', 'update_card', 'add_link'],
        frames: ['next'],
      }),
    ],
    scout: [
      step({
        id: 'trusted',
        text:
          'Start from the sources the user trusts or named in the intake, then the best overview you can find (an ' +
          'institution or a textbook, not a blog). Place source cards, and add each to Key sources (upsert_rows, key ' +
          'Title) with Type, Date, Stance, Interest and a Reliability rating. fetch_signed_in for the paywalled outlets the ' +
          'user connected.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['sources', 'background'],
      }),
      step({
        id: 'background',
        text:
          'Background: definitions in the terms the sources use, a short history as dated events on the timeline ' +
          '(place_card) and two or three numbers that show the scale, each as a metric card with source and year. Use ' +
          'web_answer for a quick figure, then the primary source.',
        tools: ['web_search', 'fetch_url', 'web_answer', 'parallel_extract', 'place_card'],
        frames: ['background'],
      }),
      step({
        id: 'discover',
        text:
          'More sources: find_entities with the topic and the key questions as objective (the match limit follows the ' +
          'depth tier) fills its own database card; batch_enrich fills Type, Author or organisation, Date, Stance and Key ' +
          'point. Copy the rows into Key sources (query_dataset, upsert_rows, key Title), a URL on every row. On the Quick ' +
          'tier those two are refused: add the best sources from web_search with upsert_rows instead.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'query_dataset', 'upsert_rows'],
        frames: ['sources'],
      }),
      step({
        id: 'for',
        text:
          'The case for: the strongest primary and independent evidence for the thesis. Source cards, quote cards with ' +
          'the place in the source, and metric cards for the numbers; say what each piece shows and how strong it is.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card'],
        frames: ['for'],
      }),
      step({
        id: 'against',
        text:
          'The case against, with equal effort: search for the best critics, contrary data, failed predictions and ' +
          'competing explanations; quote the critics in their own words and state their objections fairly. Do not stop at ' +
          'weak objections.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card'],
        frames: ['against'],
      }),
      step({
        id: 'voices',
        text:
          'The leading voices on each side: one entity card per person or organisation (role, affiliation, position) and ' +
          'a quote that shows where they stand.',
        tools: ['web_search', 'fetch_url', 'place_card'],
        frames: ['perspectives'],
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
          'Start once there is evidence on both sides: read the Key sources database and the cards of every frame ' +
          '(board_map, search_board, read_card, query_dataset) before judging anything.',
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
        frames: ['risks', 'sources', 'for', 'against'],
      }),
      step({
        id: 'weigh',
        text:
          'Weigh the two sides: link each strong piece of evidence for with "tension" to the evidence against that ' +
          'answers it, place an Insight that cites both when it settles the point, and place a Risk for each objection ' +
          'the thesis cannot yet answer. Place the perspectives matrix scoring each camp.',
        tools: ['read_card', 'query_dataset', 'add_link', 'place_card'],
        frames: ['against', 'for', 'perspectives'],
      }),
      step({
        id: 'gaps',
        text: 'Turn every gap into a Question card in the next frame, with a link to the card or gap that prompted it.',
        tools: ['place_card', 'add_link'],
        frames: ['next'],
      }),
      step({
        id: 'report',
        text: 'Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised.',
        tools: ['report_progress', 'send_message'],
      }),
    ],
    builder: [
      step({
        id: 'map',
        text: 'A concept map (diagram) of the key terms and how they connect, from the key-terms card and the sources, so a newcomer can read the rest.',
        tools: ['place_card', 'read_card', 'query_board'],
        frames: ['background'],
      }),
      step({
        id: 'charts',
        text: 'Charts bound to Key sources: sources by stance (bar) and by type (pie). Never an inline chart when a database holds the data.',
        tools: ['place_card', 'query_dataset'],
        frames: ['sources'],
      }),
      step({
        id: 'camps',
        text:
          'The camps quadrant (framework) and the perspectives matrix (weighted criteria, scores 0 to 10 from the ' +
          'cards), built from the voices Scout placed.',
        tools: ['place_card', 'read_card', 'query_board'],
        frames: ['perspectives'],
      }),
      step({
        id: 'summary',
        text:
          'Optional one-page visual summary (a design frame): the thesis, the strongest evidence each way and the score, ' +
          'built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['synthesis'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...DIVE_RUBRIC],
  redFlags: [...DIVE_RED_FLAGS],

  output: {
    memoTitle: 'Deep dive: {{topic}}',
    citationRule:
      'Every paragraph cites cards; every number cites its source and its year; the case for and the case against get equal space.',
    sections: [
      { id: 'summary', title: 'Summary', frames: ['synthesis', 'risks'], words: 200, guidance: 'The thesis, where it stands, the strongest evidence each way and what is open, in at most 200 words.' },
      { id: 'question', title: 'The question & thesis', frames: ['thesis'], guidance: 'What was asked, the working thesis and why it matters.' },
      { id: 'background', title: 'Background & definitions', frames: ['background'], guidance: 'The terms, the short history and the scale.' },
      { id: 'sources', title: 'The sources', frames: ['sources'], guidance: 'The best sources, how far each is trusted and what interest they have.' },
      { id: 'for', title: 'The case for', frames: ['for'], guidance: 'The strongest evidence for the thesis, with how strong it is.' },
      { id: 'against', title: 'The case against', frames: ['against'], guidance: 'The strongest evidence and arguments against it, stated fairly.' },
      { id: 'perspectives', title: 'Perspectives & debates', frames: ['perspectives'], guidance: 'The camps, what divides them and whether it is facts, values or definitions.' },
      { id: 'quality', title: 'Quality of the evidence', frames: ['risks', 'synthesis'], guidance: 'The red-flag outcomes and the scored rubric with its evidence.' },
      { id: 'conclusion', title: 'Conclusion', frames: ['synthesis'], guidance: 'The refined thesis with its confidence and what would change it.' },
      { id: 'next', title: 'Open questions & next reads', frames: ['next'], guidance: 'The ranked open questions and the reading list.' },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{topic}}',
      includes: ['Thesis', 'Evidence for', 'Evidence against', 'Score', 'Open questions'],
    },
    deckFormat: 'deep-dive',
  },

  tiers: tiers({
    quick: {
      summary:
        'No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the report is the summary only.',
    },
    standard: {
      summary:
        'Quick, plus source discovery with find_entities, batch enrichment of Key sources and one or two deep-research runs (core), asking before spend.',
    },
    deep: {
      summary:
        'Standard, plus pro or ultra deep research on the strongest objection and the key numbers, FindAll extension for a complete source list and the full report.',
    },
  }),

  followUps: [
    { label: 'Argue the other side', prompt: 'Write the strongest case against "{{topic}}" from the sources on this board, and say what would answer each point.' },
    { label: 'Explain it to a newcomer', prompt: 'Explain "{{topic}}" to someone new to it in five short paragraphs, citing the cards, defining each term on first use.' },
    { label: 'Find the primary source', prompt: 'Find the primary source behind [claim] and replace the second-hand citations with it.' },
    { label: 'Test a claim', prompt: 'Test this claim against the evidence on the board: [claim]. Say supported, partly or not, with the cards that decide it.' },
    { label: 'Make a reading plan', prompt: 'Make a reading plan for "{{topic}}": the order to read the key sources and what to look for in each, about three hours in all.' },
    { label: 'Turn it into a decision', prompt: 'Turn this deep dive into a decision: the options, what the evidence says about each and what I should do.' },
  ],

  signedIn: [
    { domain: 'nytimes.com', label: 'The New York Times', use: 'Paywalled reporting and archives.' },
    { domain: 'ft.com', label: 'Financial Times', use: 'Paywalled business and economic reporting.' },
    { domain: 'wsj.com', label: 'The Wall Street Journal', use: 'Paywalled business reporting.' },
    { domain: 'substack.com', label: 'Substack', use: 'Subscriber-only analysis from independent writers.' },
  ],
};
