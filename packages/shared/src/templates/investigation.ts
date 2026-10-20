/**
 * Journalism and investigation (P6.16): test a claim or reconstruct a story from public records and documents, with a
 * timeline, an entity map, a ledger of documents, a claim-by-claim verification table, a source assessment, the
 * counter-evidence and a findings brief. Ongoing: a watch on the subject is available on request. The human-readable
 * spec is docs/templates/investigation.md (generated: `pnpm templates:docs`).
 */
import type { RubricDimension, TemplateSpecInput } from './schema.js';
import {
  checklist,
  chartSeed,
  col,
  db,
  decisionSeed,
  depthField,
  doc,
  emptyRisk,
  flagChecklist,
  flags,
  framework,
  hypothesis,
  materialsField,
  metric,
  question,
  scorecard,
  step,
  tiers,
  timelineSeed,
} from './people-kit.js';

export const INVESTIGATION_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'evidence',
    name: 'Strength of the evidence',
    weight: 30,
    anchors: {
      1: 'Rests on claims, rumour or one document.',
      3: 'Key claims have a document or two independent sources.',
      5: 'Every key claim is backed by primary documents and independent sources.',
    },
    frame: 'claims',
  },
  {
    id: 'sources',
    name: 'Source reliability and independence',
    weight: 25,
    anchors: {
      1: 'Anonymous, interested or unverifiable sources carry the story.',
      3: 'A mix of primary and secondary sources; some interested.',
      5: 'Primary records and independent, named sources carry the story.',
    },
    frame: 'sources',
  },
  {
    id: 'significance',
    name: 'Public interest',
    weight: 15,
    anchors: {
      1: 'Little public interest; mainly private matters.',
      3: 'Of interest to a defined public.',
      5: 'Clear, significant public interest.',
    },
    frame: 'findings',
  },
  {
    id: 'counter',
    name: 'Counter-evidence and right of reply',
    weight: 20,
    anchors: {
      1: 'Alternative explanations not tested; no reply sought.',
      3: 'The main alternatives are tested; a reply is requested.',
      5: 'Alternatives tested and answered; replies sought and recorded.',
    },
    frame: 'gaps',
  },
  {
    id: 'ready',
    name: 'Legal and ethical readiness',
    weight: 10,
    anchors: {
      1: 'Privacy, defamation or source-safety questions open.',
      3: 'Known risks, a plan to resolve them.',
      5: 'Checked by the right reviewer; sources protected.',
    },
    frame: 'gaps',
  },
];

export const INVESTIGATION_FLAGS = flags([
  [
    'A key claim rests on a single source.',
    'For each key claim in Claims, count independent sources (not copies of one report). One is a flag.',
  ],
  [
    'A document’s authenticity is not checked (metadata, issuer, registry, a second copy).',
    'For each document in Documents that carries a claim, record how it was authenticated; “not checked” is a flag.',
  ],
  [
    'A source with an interest in the outcome carries a key claim (a party, a competitor, an advocacy group, a seller).',
    'Read the Source ledger; interested sources need an independent confirmation.',
  ],
  [
    'The timeline has a gap, an inconsistency or dates that depend on a single record.',
    'Sort Events by date; check the order, the gaps and the time zones, and the date of each source against the date of the event.',
  ],
  [
    'Entity confusion: two people or companies with the same or a similar name treated as one.',
    'For each Entity, check a second identifier (registry number, address of record, birth year of a public record, a distinct role).',
  ],
  [
    'Counter-evidence or an alternative explanation has not been tested.',
    'For each finding, search for the strongest alternative explanation; place it as a hypothesis with its evidence.',
  ],
  [
    'Right of reply has not been sought for people or organisations the findings criticise.',
    'List each named subject of criticism and whether a reply was requested; a draft request is a proposal for the user to send.',
  ],
  [
    'Defamation or privacy exposure: a statement about a named individual that rests on weak evidence, or private information with no public interest.',
    'Mark each such statement; weak evidence means “alleged”, “said”, or out. Private facts without public interest are raised for removal. This is not legal advice.',
  ],
  [
    'Source safety: material that could identify a confidential source or put someone at risk.',
    'Check the board and the draft for details that reveal a source; raise them for the user to decide. orb never contacts sources.',
  ],
  [
    'Provenance of materials: documents the user supplied may have been obtained improperly or may be leaked; legal and ethical status unknown.',
    'Ask the user how each file was obtained when it matters to publishing; mark the answer in Documents. Public records are preferred.',
  ],
  [
    'A visual or quote is out of context (a cropped image, a quote trimmed, a screenshot with no date).',
    'Find the original context for each image, video or quote card and cite it; undated screenshots are flagged.',
  ],
]);

export const INVESTIGATION: TemplateSpecInput = {
  id: 'investigation',
  label: 'Investigation',
  dot: '#B91C1C',
  placeholder: 'What are you investigating, and what is the question?',
  brief:
    'Investigate a claim, a person, an organisation, an event or a money flow from public records and the ' +
    'documents the user is entitled to use: a timeline, the entities and their links, a ledger of documents and ' +
    'sources, every claim verified or marked unverified with at least two independent sources, the counter-evidence, ' +
    'the right of reply and the legal and ethical flags. Eight numbered frames, a rubric and an investigation brief. ' +
    'Evidence over inference; protect sources and private people; the journalist decides and a lawyer reviews.',
  titleFrom: 'Investigation: {{subject}}',

  inputs: [
    {
      id: 'subject',
      label: 'The subject',
      kind: 'text',
      required: true,
      placeholder: 'Acme Holdings and the Riverside contract',
      maxLength: 160,
    },
    {
      id: 'question',
      label: 'The central question or claim',
      kind: 'longtext',
      required: true,
      placeholder: 'What exactly are you trying to find out or test?',
      maxLength: 1500,
    },
    {
      id: 'kind',
      label: 'Kind of investigation',
      kind: 'select',
      required: true,
      options: ['An organisation', 'A person in public life', 'An event', 'A viral claim or image', 'A money or contract trail', 'A policy or decision'],
      group: 'what',
      maxLength: 60,
    },
    {
      id: 'jurisdiction',
      label: 'Jurisdictions',
      kind: 'text',
      placeholder: 'UK, Cayman Islands',
      group: 'what',
      maxLength: 160,
    },
    {
      id: 'period',
      label: 'Period of interest',
      kind: 'text',
      placeholder: '2019 to 2024',
      group: 'what',
      maxLength: 80,
    },
    {
      id: 'public_interest',
      label: 'Why it is in the public interest',
      kind: 'longtext',
      required: true,
      placeholder: 'Who is affected, what is at stake',
      help: 'orb collects information about private people only where it serves this.',
      maxLength: 1000,
    },
    {
      id: 'known',
      label: 'What you already know or suspect',
      kind: 'longtext',
      placeholder: 'Leads, names, dates, documents you have',
      maxLength: 1500,
    },
    {
      id: 'sources',
      label: 'Known sources or links',
      kind: 'list',
      placeholder: 'URLs or names: comma separated. Confidential sources never go here.',
      help: 'Do not enter anyone who needs protection. orb never contacts sources.',
      maxLength: 1500,
    },
    {
      id: 'stage',
      label: 'Stage',
      kind: 'select',
      options: ['Early: is there a story?', 'Building the case', 'Pre-publication checks'],
      maxLength: 60,
    },
    materialsField('Drop documents you are entitled to use: filings, contracts, datasets (CSV or XLSX), PDFs, images. Each becomes a card or database.'),
    depthField(
      'Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending.',
    ),
    {
      id: 'sites',
      label: 'Signed-in sources to use',
      kind: 'sites',
      help: 'Only the sites you connected in Settings can be used. Scout reads them as you, read-only. Check each site’s terms.',
      sites: [
        { domain: 'lexisnexis.com', label: 'LexisNexis' },
        { domain: 'factiva.com', label: 'Factiva' },
        { domain: 'opencorporates.com', label: 'OpenCorporates' },
        { domain: 'linkedin.com', label: 'LinkedIn' },
      ],
      maxLength: 400,
    },
  ],

  frames: [
    {
      id: 'scope',
      title: 'Question & scope',
      color: 'signal',
      brief:
        'The central question ({{question|to confirm}}), the claims to test, what would count as proof, what is in and out ' +
        'of scope, the public interest, the stage ({{stage|to confirm}}), the working hypotheses, and the ethics note: ' +
        'what orb will and will not do.',
      owners: ['orb'],
      targets: [
        { type: 'doc', min: 2, note: 'question and scope; method and limits' },
        { type: 'hypothesis', min: 2 },
        { type: 'metric', min: 4 },
      ],
      seeds: [
        doc(
          'The question',
          '{{subject}}. The question: {{question|to confirm}}. Public interest: {{public_interest|to confirm}}. What you already know: {{known|nothing yet.}}',
          'Your question, from the intake.',
        ),
        doc(
          'Method and limits',
          'orb works from public records and the documents you supplied. Every claim is checked against at least two independent sources, or marked unverified. Evidence is kept apart from inference. orb does not contact sources, subjects or anyone else, does not gather private information with no public interest, and does not give legal advice: the Gaps frame lists the questions for a lawyer. You decide what is true and what is published.',
          'Standing note: how this investigation works and what it will not do.',
        ),
        hypothesis(
          'The central claim holds',
          '{{question|The claim as you stated it.}} Link the evidence that supports it and the evidence that contradicts it.',
        ),
        hypothesis(
          'There is an innocent explanation',
          'The strongest alternative explanation for the same facts; test it as hard as the first.',
        ),
        metric('Claims tested', 'Claims in the Claims database, and how many are supported.'),
        metric('Primary documents', 'Documents from the issuer or a public record.'),
        metric('Independent sources', 'Sources in the ledger that are independent of the subject.'),
        metric('Open gaps', 'Gaps and questions not yet resolved.'),
        question('What would disprove this?', 'The fact that, if found, ends the story.'),
      ],
      room: 300,
    },
    {
      id: 'timeline',
      title: 'Timeline',
      color: 'sky',
      brief:
        'What happened, in order, with dates and sources: events, decisions, filings, transactions, statements and ' +
        'reversals; who did what; where the record is silent; what depends on a single source. Dates are from the source, with ' +
        'the date the source was written next to the date of the event.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Events: at least 15 rows' },
        { type: 'timeline', min: 1, note: 'the key events' },
        { type: 'source', min: 5 },
      ],
      seeds: [
        db('Events', 'events'),
        timelineSeed(
          'Key events',
          'Investigation started',
          'Builder adds the key events from the Events database, dated, each with a source.',
        ),
        question('What happened in the gaps of the timeline?', 'Periods with no record, and what could explain them.'),
      ],
    },
    {
      id: 'entities',
      title: 'Entities & network',
      color: 'rho',
      brief:
        'The people, companies, agencies and other bodies in the story: who they are (by a second identifier), their ' +
        'role, their links to each other (ownership, employment, contracts, family or business ties from public records only), and the jurisdictions. A ' +
        'diagram of the network from sourced links, with every link’s source named. Private people appear only where the story needs them.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Entities: at least 10 rows' },
        { type: 'entity', min: 4, note: 'the central people and organisations' },
        { type: 'diagram', min: 1, note: 'the network of sourced links' },
      ],
      seeds: [
        db('Entities', 'entities'),
        question('Who is the same person or company under a different name?', 'Aliases, former names and shells, each with a registry reference.'),
      ],
    },
    {
      id: 'documents',
      title: 'Documents & records',
      color: 'sky',
      brief:
        'Every document and record: filings, registries, court and procurement records, contracts, reports, datasets, ' +
        'letters and screenshots. For each: the issuer, the date, how it was obtained, how its authenticity was checked, ' +
        'what it shows, what it does not and its reliability. Public records first.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Documents: every record, authenticated or marked not' },
        { type: 'source', min: 6 },
        { type: 'image', min: 1, note: 'page captures with the date seen' },
      ],
      seeds: [
        db('Documents', 'documents'),
        question('Which records exist that have not been requested yet?', 'Registries, courts, procurement and freedom-of-information routes.'),
      ],
    },
    {
      id: 'claims',
      title: 'Claims & verification',
      color: 'rho',
      brief:
        'Every claim in the story, one by one: who made it, where and when, what the evidence is, the status ' +
        '(unchecked, supported, contradicted, unverifiable), the independent sources behind it and the confidence. ' +
        'A claim is supported only with two independent sources or a primary record, and says which.',
      owners: ['scout', 'critic', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Claims: every claim with its status' },
        { type: 'insight', min: 3, note: 'supported or contradicted claims, each citing 2 or more cards' },
        { type: 'chart', min: 1, note: 'claims by status' },
      ],
      seeds: [
        db('Claims', 'claims'),
        chartSeed('Claims by status', 'bar', 'claims', 'Status'),
        question('Which claim carries the story, and how well is it supported?', 'The one claim without which there is no story.'),
      ],
    },
    {
      id: 'sources',
      title: 'Source assessment',
      color: 'sky',
      brief:
        'Every source in a ledger: what it is (primary record, official statement, news, expert, interested party, ' +
        'anonymous), who is behind it, what it knows first-hand, its track record, its interest in the outcome, how independent it ' +
        'is of the others, and a reliability rating. Confidential sources are never entered here by name.',
      owners: ['critic', 'scout'],
      targets: [
        { type: 'database', min: 1, note: 'Source ledger' },
        { type: 'matrix', min: 1, note: 'reliability of the key sources' },
        { type: 'insight', min: 2, note: 'independence findings, each citing 2 or more cards' },
      ],
      seeds: [
        db('Source ledger', 'source-ledger'),
        {
          type: 'matrix',
          data: {
            title: 'Reliability of the key sources',
            criteria: [
              { name: 'First-hand knowledge', weight: 30 },
              { name: 'Independence from the subject', weight: 25 },
              { name: 'Track record', weight: 20 },
              { name: 'Corroboration', weight: 25 },
            ],
            options: [
              { name: 'Source A', scores: [null, null, null, null] },
              { name: 'Source B', scores: [null, null, null, null] },
            ],
          },
          why: 'Placeholder: renamed and scored (0 to 10) from the ledger, each score cited.',
        },
      ],
    },
    {
      id: 'gaps',
      title: 'Gaps, counter-evidence & checks',
      color: 'paper',
      brief:
        'What is missing and what cuts against the story: the strongest alternative explanation, the evidence against, ' +
        'the questions that remain, the right of reply for every named subject of criticism, and the legal and ethical checks. ' +
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence or clear it with a source. Questions for a lawyer are listed, not answered.',
      owners: ['critic', 'orb'],
      targets: [
        { type: 'risk', min: 6, note: 'every checklist item cleared with a source or raised' },
        { type: 'question', min: 6 },
        { type: 'checklist', min: 2 },
      ],
      seeds: [
        flagChecklist('Verification and ethics red flags', INVESTIGATION_FLAGS),
        checklist('Right of reply', [
          'Each person or organisation criticised, and the date a reply was requested (the user sends it).',
          'The reply received, in their words, or that none came by the deadline.',
        ]),
        checklist('Questions for a lawyer or editor', [
          'Statements about named individuals that rest on weak evidence.',
          'Material whose origin is unclear.',
          'Public-interest justification for each private fact used.',
        ]),
        emptyRisk('Evidence'),
        emptyRisk('Defamation and privacy', 'Nothing raised yet. Critic raises a statement or fact that needs the right reviewer here, naming the card.'),
        emptyRisk('Source safety'),
        emptyRisk('Provenance of materials'),
      ],
    },
    {
      id: 'findings',
      title: 'Findings & story',
      color: 'signal',
      brief:
        'What the evidence supports and what it does not: findings as insights that cite at least two cards, the hypotheses ' +
        'with confidence, the SWOT of the case, the rubric scored with cited evidence and a publication readiness decision ' +
        '(Not ready, Needs more reporting, Ready for legal and editorial review, Spike). An outline of the story with a source for every line.',
      owners: ['orb', 'builder'],
      targets: [
        { type: 'insight', min: 3, note: 'each citing 2 or more cards' },
        { type: 'decision', min: 1 },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
        { type: 'framework', min: 1 },
      ],
      seeds: [
        framework('swot', 'SWOT of the case: {{subject}}'),
        doc(
          'Story outline',
          'The story in order, one line per beat, each with the card that supports it. orb writes it after the claims are verified; nothing unsupported goes in.',
        ),
        decisionSeed(
          'Readiness: {{subject}}',
          ['Not ready', 'Needs more reporting', 'Ready for legal and editorial review', 'Spike'],
          'Open. orb proposes after the rubric is filled and writes the weighted total here. The journalist and the editor decide; orb never publishes.',
        ),
        scorecard(INVESTIGATION_RUBRIC),
      ],
    },
  ],

  databases: [
    {
      key: 'events',
      name: 'Events',
      frame: 'timeline',
      purpose: 'Every dated event of the story with its source and how sure we are.',
      keyColumn: 'Event',
      columns: [
        col('Event'),
        col('Date', 'date', { note: 'The date of the event, from the source.' }),
        col('Date precision', 'enum', { options: ['Day', 'Month', 'Year', 'Approximate'] }),
        col('Actors', 'text', { note: 'Names as they appear in the Entities database.' }),
        col('What happened', 'text'),
        col('Source', 'url'),
        col('Source date', 'date', { note: 'When the source was written, to compare with the event date.' }),
        col('Confidence', 'enum', { options: ['High', 'Medium', 'Low'] }),
        col('Single source', 'boolean'),
      ],
      views: [
        { name: 'By date', kind: 'table', sort: [{ column: 'Date', dir: 'asc' }] },
        { name: 'Single source', kind: 'table', filter: [{ column: 'Single source', op: 'eq', value: true }] },
        { name: 'By confidence', kind: 'board', group: 'Confidence' },
      ],
    },
    {
      key: 'entities',
      name: 'Entities',
      frame: 'entities',
      purpose: 'People, companies and bodies in the story, with identifiers and links. Found with find_entities, enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        col('Name'),
        col('Type', 'enum', { options: ['Person', 'Company', 'Agency', 'Non-profit', 'Other'] }),
        col('Role in the story', 'text'),
        col('Identifier', 'text', { note: 'Registry number, regulator id or another second identifier.' }),
        col('Jurisdiction'),
        col('Aliases', 'text', { note: 'Former names, trading names.' }),
        col('Linked to', 'text', { note: 'Names in this database, each with the kind of link and the source in Notes.' }),
        col('Public figure', 'boolean', { note: 'Whether the person has a public role relevant to the story.' }),
        col('Registry or record', 'url'),
        col('Notes', 'text'),
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By type', kind: 'board', group: 'Type' },
        { name: 'No identifier', kind: 'table', filter: [{ column: 'Identifier', op: 'empty' }] },
      ],
    },
    {
      key: 'documents',
      name: 'Documents',
      frame: 'documents',
      purpose: 'Every document and record with issuer, date, provenance, authentication and reliability.',
      keyColumn: 'Title',
      columns: [
        col('Title'),
        col('Type', 'enum', {
          options: ['Filing', 'Registry record', 'Court record', 'Contract', 'Procurement', 'Report', 'Dataset', 'Letter or email', 'Image or video', 'Other'],
        }),
        col('Issuer'),
        col('Date', 'date'),
        col('Obtained', 'enum', { options: ['Public record', 'Public website', 'Freedom of information', 'Supplied by the user', 'Unknown'] }),
        col('Authenticated', 'enum', { options: ['Yes: how, in Notes', 'Partly', 'Not checked', 'Cannot be'] }),
        col('What it shows', 'text'),
        col('What it does not show', 'text'),
        col('Reliability', 'rating', { note: '1 (low) to 5 (high).' }),
        col('URL', 'url'),
        col('Notes', 'text'),
      ],
      views: [
        { name: 'By date', kind: 'table', sort: [{ column: 'Date', dir: 'asc' }] },
        { name: 'By authentication', kind: 'board', group: 'Authenticated' },
        { name: 'Not authenticated', kind: 'table', filter: [{ column: 'Authenticated', op: 'in', value: ['Not checked', 'Partly'] }] },
      ],
    },
    {
      key: 'claims',
      name: 'Claims',
      frame: 'claims',
      purpose: 'Every claim, the evidence behind it and where it stands.',
      keyColumn: 'Claim',
      columns: [
        col('Claim'),
        col('Made by'),
        col('Where and when', 'text'),
        col('Status', 'enum', { options: ['Unchecked', 'Supported', 'Contradicted', 'Unverifiable', 'Disputed'] }),
        col('Evidence 1', 'url'),
        col('Evidence 2', 'url', { note: 'An independent source or a primary record.' }),
        col('Independent sources', 'number'),
        col('Counter-evidence', 'text'),
        col('Confidence', 'enum', { options: ['High', 'Medium', 'Low'] }),
        col('Key claim', 'boolean', { note: 'The story fails without it.' }),
        col('Insight card', 'text', { note: 'The insight that records the finding.' }),
      ],
      views: [
        { name: 'By status', kind: 'board', group: 'Status' },
        { name: 'Key claims', kind: 'table', filter: [{ column: 'Key claim', op: 'eq', value: true }] },
        { name: 'Weak', kind: 'table', filter: [{ column: 'Independent sources', op: 'lt', value: 2 }] },
      ],
    },
    {
      key: 'source-ledger',
      name: 'Source ledger',
      frame: 'sources',
      purpose: 'Every source with its type, independence and reliability. Confidential sources are never entered by name.',
      keyColumn: 'Source',
      columns: [
        col('Source'),
        col('Type', 'enum', {
          options: ['Primary record', 'Official statement', 'News report', 'Expert', 'Interested party', 'Anonymous', 'Social post', 'Other'],
        }),
        col('Behind it', 'text', { note: 'Owner, funder or author.' }),
        col('First-hand', 'boolean'),
        col('Interest in the outcome', 'enum', { options: ['None known', 'Some', 'Direct'] }),
        col('Independent of', 'text', { note: 'Which other sources it does not depend on (and which it copies).' }),
        col('Track record', 'text'),
        col('Reliability', 'rating', { note: '1 (low) to 5 (high).' }),
        col('URL', 'url'),
      ],
      views: [
        { name: 'By reliability', kind: 'table', sort: [{ column: 'Reliability', dir: 'desc' }] },
        { name: 'By interest', kind: 'board', group: 'Interest in the outcome' },
        { name: 'Interested', kind: 'table', filter: [{ column: 'Interest in the outcome', op: 'in', value: ['Some', 'Direct'] }] },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first (documents, datasets, images): read_card, read_source, query_dataset. Put each file into Documents ' +
          'with Obtained as the user says; ask with ask_user_question how a file was obtained when it matters (leaked or unclear material is flagged, not refused). ' +
          'Turn the central question into the claims to test: one row each in Claims (upsert_rows, key Claim) with Status Unchecked and the Key claim flag. ' +
          'Hand the question, the known leads and sources, the period and the ticked signed-in sources to Scout in its delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows', 'ask_user_question'],
        frames: ['documents', 'claims'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first (its playbook), Builder once Events and Entities have rows, Critic once Scout has sources. ' +
          'Tell each agent: evidence apart from inference, nothing about private people beyond the public interest, nobody is contacted, confidential sources never appear.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'scope',
        text: 'After Scout’s first pass, fill the Scope metrics (update_card) and refine the central question, each figure computed from the databases (query_dataset) or cited. Update the two hypotheses with evidence for and against as card ids.',
        tools: ['query_board', 'search_board', 'query_dataset', 'update_card', 'add_link'],
        frames: ['scope'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (a registry, a decision, an unexplained transaction), run deep_research (core) on that one question; ask before spend over $0.50. For a related organisations list, find_entities or entity_search; for a list to enrich, batch_enrich.',
        tools: ['deep_research', 'research_status', 'find_entities', 'entity_search', 'batch_enrich', 'ask_user_question'],
        frames: ['gaps'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'findings',
        text:
          'Record each supported or contradicted claim as an Insight that cites at least two cards (the evidence cards) and set the Claims row (Status, Insight card); ' +
          'a claim you cannot support stays Unverifiable. Fill the Scorecard matrix (one 1-to-5 score per dimension, doubled on the matrix, each cited), the SWOT, the story outline (each line with its card) and the Readiness decision with your proposal and the weighted total. The user decides.',
        tools: ['query_board', 'query_dataset', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['findings', 'claims'],
      }),
      step({
        id: 'right-of-reply',
        text: 'Keep the “Right of reply” checklist current: every named subject of criticism, and a draft request as a doc card for the user to send (orb never contacts anyone).',
        tools: ['search_board', 'update_card', 'place_card', 'add_link'],
        frames: ['gaps'],
      }),
      step({
        id: 'memo',
        text: 'Write the investigation brief with compose_section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. The deck follows with compose_slides if asked.',
        tools: ['compose_section', 'compose_slides'],
      }),
      step({
        id: 'monitor',
        text: 'Only when the user asks to keep watching the subject: watch_topic with the monitor query (new filings, court records, news). Each monitor is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'baseline',
        text: 'The baseline: what is already public about the subject and the question: news (web_search), the subject’s own statements and pages (fetch_url, parallel_extract), and the sources named in the intake. Source cards with a date seen; a source ledger row for each (upsert_rows, key Source) with Type, Interest in the outcome and what it knows first-hand. Capture_page for pages that may change, so the date seen is kept.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'capture_page', 'place_card', 'upsert_rows'],
        frames: ['sources', 'documents'],
      }),
      step({
        id: 'records',
        text: 'Primary records: company registries, filings, courts, procurement, land and charity registers, regulator databases for the jurisdictions in the intake; signed-in databases the user connected (fetch_signed_in, read-only; terms apply). One row per record in Documents (upsert_rows, key Title) with Issuer, Date, Obtained and Authenticated set honestly; a source card for the key ones. Public records before anything else.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'parallel_extract', 'read_source', 'upsert_rows', 'place_card'],
        frames: ['documents'],
      }),
      step({
        id: 'entities',
        text: 'Entities: from the records and the intake. find_entities finds related companies and bodies (shareholders, directors, contractors) when the tier allows; batch_enrich fills identifier, jurisdiction and role. Consolidate into Entities with upsert_rows (key Name): a second identifier on each row, aliases, and “Linked to” with the source of each link in Notes. Entity cards for the central ones. Private individuals only if the story needs them, in their public role.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'fetch_url', 'query_dataset', 'upsert_rows', 'place_card'],
        frames: ['entities'],
      }),
      step({
        id: 'timeline',
        text: 'Timeline: one row per event in Events (upsert_rows, key Event) with Date from the source, Date precision, Actors, a Source and its date, and Single source set. Mark the events that rest on one record.',
        tools: ['web_search', 'fetch_url', 'upsert_rows', 'query_dataset'],
        frames: ['timeline'],
      }),
      step({
        id: 'verify',
        text: 'Verify the claims: for each claim in Claims, search for an independent source or a primary record; update the rows you wrote with Evidence and the number of independent sources (upsert_rows). A source that copies another counts once. Quote cards for the statements themselves, with where and when; images and videos with the original context and date, and what a reverse image search shows.',
        tools: ['web_search', 'fetch_url', 'image_search', 'place_card', 'query_dataset', 'upsert_rows'],
        frames: ['claims', 'sources'],
      }),
      step({
        id: 'counter',
        text: 'Counter-evidence: the strongest alternative explanation and the best case the subject would make; source cards and quote cards for it, with the same care. Report anything that cuts against the central claim to orb with send_message.',
        tools: ['web_search', 'fetch_url', 'place_card', 'send_message'],
        frames: ['claims', 'documents'],
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
        text: 'Start after Scout’s first sources: read every frame’s cards (board_map, search_board, read_card) and the Events, Documents, Claims and Source ledger rows (query_dataset) before judging anything.',
        tools: ['board_map', 'search_board', 'read_card', 'query_board', 'query_dataset'],
      }),
      step({
        id: 'red-flags',
        text: 'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." citing the source cards that clear it (an insight needs at least two cited cards). You give no legal advice: raise what needs a lawyer. You cannot tick the checklist: the user does.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['gaps', 'documents', 'timeline'],
      }),
      step({
        id: 'sources',
        text: 'Source assessment: score the key sources on the reliability matrix (0 to 10 per criterion, each with its basis), and place an Insight for every finding about independence (for example that two reports trace to one press release), citing both cards.',
        tools: ['place_card', 'add_link', 'query_dataset', 'read_card'],
        frames: ['sources'],
      }),
      step({
        id: 'claims',
        text: 'Claims: for each key claim place an Insight or a Question: supported by two independent sources or a primary record, or what is missing. Link tension to cards that disagree. Test the alternative explanation as a Hypothesis with its own evidence links.',
        tools: ['query_dataset', 'query_board', 'read_card', 'place_card', 'add_link'],
        frames: ['claims', 'entities'],
      }),
      step({
        id: 'gaps',
        text: 'Turn every gap into a Question card in Gaps, with a link to the card that prompted it: missing records, a silent period, an unreplied subject, a name that may be two people. Rank them by how much the story depends on each.',
        tools: ['place_card', 'add_link', 'query_board'],
        frames: ['gaps', 'timeline'],
      }),
      step({
        id: 'report',
        text: 'Report progress per frame; send_message to orb when the checklist is complete, naming the flags raised.',
        tools: ['report_progress', 'send_message'],
      }),
    ],
    builder: [
      step({
        id: 'timeline',
        text: 'The key-events timeline card, built from Events with their sources (query_dataset), single-source events marked; and the claims-by-status chart bound to Claims.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['timeline', 'claims'],
      }),
      step({
        id: 'network',
        text: 'The network as a diagram: nodes from Entities, edges only from sourced links in the Linked to column, edge labels naming the kind of link and source. Mark each edge’s confidence. No inferred links.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['entities'],
      }),
      step({
        id: 'follow-the-money',
        text: 'For a money or contract trail: a chart or a table of the flows from the Documents and Events rows (amounts, dates, parties), each figure sourced; a diagram of the flow if it helps.',
        tools: ['place_card', 'query_dataset', 'upsert_rows'],
        frames: ['timeline', 'entities'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual summary (a design frame): the question, the findings with their evidence strength, the timeline in brief and the open gaps, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['findings'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...INVESTIGATION_RUBRIC],
  redFlags: [...INVESTIGATION_FLAGS],

  output: {
    memoTitle: 'Investigation brief: {{subject}}',
    citationRule:
      'Every paragraph cites cards; every factual claim cites its source and says whether it rests on a primary record or independent sources; unverified claims are marked unverified; evidence and inference are kept apart.',
    sections: [
      {
        id: 'summary',
        title: 'Summary & readiness',
        frames: ['findings', 'gaps'],
        words: 150,
        guidance: 'The question, what the evidence supports, the score, the readiness decision and the three biggest gaps, in at most 150 words.',
      },
      {
        id: 'method',
        title: 'Question, method & limits',
        frames: ['scope'],
        guidance: 'The question, the public interest, how claims were verified, and what was not done.',
      },
      {
        id: 'timeline',
        title: 'Timeline',
        frames: ['timeline'],
        guidance: 'The events in order with sources, confidence and the gaps in the record.',
      },
      {
        id: 'entities',
        title: 'People, organisations & links',
        frames: ['entities'],
        guidance: 'Who is who, with identifiers, and the sourced links between them.',
      },
      {
        id: 'documents',
        title: 'Documents & records',
        frames: ['documents'],
        guidance: 'The key records, how each was obtained and authenticated, and what each shows and does not.',
      },
      {
        id: 'claims',
        title: 'Claims & verification',
        frames: ['claims'],
        guidance: 'Each claim, its status, the independent sources or primary record behind it and the counter-evidence.',
      },
      {
        id: 'sources',
        title: 'Sources & independence',
        frames: ['sources'],
        guidance: 'The source ledger in brief, the interested sources and the independence findings.',
      },
      {
        id: 'gaps',
        title: 'Gaps, counter-evidence & checks',
        frames: ['gaps'],
        guidance: 'The strongest alternative explanation, the red-flag outcomes, the right-of-reply status and the questions for a lawyer or editor.',
      },
      {
        id: 'findings',
        title: 'Findings & story outline',
        frames: ['findings'],
        guidance: 'What the evidence supports, each finding citing its cards, and the outline of the story.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard',
        frames: ['findings'],
        guidance: 'The rubric table: each dimension, weight, score and evidence.',
      },
    ],
    appendix: 'All sources and the source ledger',
    onePager: {
      title: 'Investigation one-pager: {{subject}}',
      includes: ['The question', 'Findings and strength of evidence', 'Score and readiness', 'Open gaps', 'Right of reply status'],
    },
    deckFormat: 'standard',
  },

  tiers: tiers({
    quickSummary:
      'No deep research: public pages, registries, search, extract and the signed-in fetches ticked, at most 12 cards per frame; the brief is the summary only.',
    standardSummary:
      'Quick, plus related entities found and enriched into the Entities database and one or two deep-research runs (core) on the gaps, asking before spend.',
    deepSummary:
      'Standard, plus FindAll for the full list of related organisations, pro research on the hardest gaps and the full investigation brief.',
    deepRuns: 5,
  }),

  followUps: [
    {
      label: 'Steelman the other side',
      prompt: 'Build the strongest case for the alternative explanation in {{subject}}, from the cards on this board, and say what evidence would decide between the two.',
    },
    {
      label: 'What is single-sourced?',
      prompt: 'List every key claim and event in {{subject}} that rests on a single source, and the cheapest way to get a second.',
    },
    {
      label: 'Draft the right-of-reply requests',
      prompt: 'Draft right-of-reply requests for everyone criticised in {{subject}}: what we found, what we ask, a deadline. For me to send.',
    },
    {
      label: 'Find the next record',
      prompt: 'Which public records for {{subject}} have we not looked at? List them by jurisdiction with where to get each, and the claim each would test.',
    },
    {
      label: 'Check for legal and ethical risks',
      prompt: 'Review every statement about a named person or organisation in {{subject}}: which rest on weak evidence, and what questions go to a lawyer or editor?',
    },
    {
      label: 'Watch for new filings',
      prompt: 'Watch {{subject}} for new filings, court records and news, and tell me what changes the findings.',
    },
  ],

  signedIn: [
    { domain: 'lexisnexis.com', label: 'LexisNexis', use: 'News archives and public records the user already has access to. Read-only.' },
    { domain: 'factiva.com', label: 'Factiva', use: 'News and company archives the user already has access to. Read-only.' },
    { domain: 'opencorporates.com', label: 'OpenCorporates', use: 'Company registry records and officers across jurisdictions.' },
    { domain: 'linkedin.com', label: 'LinkedIn', use: 'Public professional roles of people in public life. Terms apply: read-only, rate-limited.' },
  ],

  monitor: {
    query: '{{subject}} new filings, court records, investigations and news',
    why: 'New records or statements that would change the findings.',
  },
};
