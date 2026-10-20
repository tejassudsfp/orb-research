/**
 * Candidate research for hiring (P6.16). Public professional information only: the template says so in the intake,
 * in every agent's playbook, in a standing red flag and in the memo. The human-readable spec is
 * docs/templates/candidate.md (generated: `pnpm templates:docs`).
 */
import type { RubricDimension, TemplateSpecInput } from './schema.js';
import {
  checklist,
  col,
  db,
  depthField,
  doc,
  emptyRisk,
  flagChecklist,
  flags,
  hypothesis,
  materialsField,
  matrixSeed,
  metric,
  decisionSeed,
  question,
  scorecard,
  step,
  tiers,
  timelineSeed,
  framework,
} from './people-kit.js';

export const CANDIDATE_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'experience',
    name: 'Role-relevant experience',
    weight: 30,
    anchors: {
      1: 'No experience in the work the role does.',
      3: 'Has done most of the role at a similar scope.',
      5: 'Has done this exact job well, more than once.',
    },
    frame: 'career',
  },
  {
    id: 'impact',
    name: 'Evidence of impact',
    weight: 25,
    anchors: {
      1: 'No public evidence of results.',
      3: 'Some credited work with described outcomes.',
      5: 'Several verified outcomes that match what the role needs.',
    },
    frame: 'work',
  },
  {
    id: 'skills',
    name: 'Skill depth',
    weight: 20,
    anchors: {
      1: 'Skills are claimed but not shown.',
      3: 'Skills are shown in public work at a working level.',
      5: 'Deep, current skills shown across several pieces of work.',
    },
    frame: 'work',
  },
  {
    id: 'scope',
    name: 'Level and scope match',
    weight: 15,
    anchors: {
      1: 'Well below or above the level of the role.',
      3: 'Close to the level, with a stretch either way.',
      5: 'A clear match to the level and scope of the role.',
    },
    frame: 'fit',
  },
  {
    id: 'voice',
    name: 'Public professional record',
    weight: 10,
    anchors: {
      1: 'Little to read or a record that raises professional concerns.',
      3: 'A modest record: some talks, writing or open work.',
      5: 'A strong, consistent professional record others cite.',
    },
    frame: 'footprint',
  },
];

export const CANDIDATE_FLAGS = flags([
  [
    'Employment or education claims that cannot be verified.',
    'Compare each claim on the resume or profile with an independent source (company pages, press, registries, conference programmes). Unverified is not false: say what was searched.',
  ],
  [
    'Gaps or overlaps in the career timeline that are unexplained.',
    'Read the Career history database for gaps over six months and overlapping full-time roles; raise a question, never an inference.',
  ],
  [
    'Role titles or scope that look inflated against the company size or the work shown.',
    'Compare the title and claimed scope with the employer (size, team) and with the work evidence.',
  ],
  [
    'Public professional controversies: published disputes, retractions, licence or code-of-conduct findings about their work.',
    'Search for professional matters only (work, publications, code, licences). Do not search private life.',
  ],
  [
    'Work credited to the candidate that others may own or have done (team projects, forks, co-authors).',
    'Check authorship, commit history or credits on each Work evidence row before it counts as their impact.',
  ],
  [
    'Skills claimed for the role with no public evidence.',
    'For each must-have in the Requirements database, there is a Work evidence row or the requirement is marked "no public evidence".',
  ],
  [
    'Currency: the evidence is old and the field has moved.',
    'Check the dates on the Work evidence rows against how fast the skill area changes.',
  ],
  [
    'Sensitive or non-professional information on the board (age, health, family, religion, politics, origin, appearance, finances, home address, personal social media).',
    'Scan every card and row. Anything of this kind is not used: raise it as a process violation and ask the user to delete the card. It never enters the scorecard.',
  ],
  [
    'A conflict of interest or an undisclosed relationship between the candidate and the hiring team.',
    'Only from public professional records (shared employers, co-authors, investors). Raise as a question for the hiring manager.',
  ],
  [
    'The research asked a question the role does not need.',
    'Every card must trace to a requirement of the role. Cards that do not are flagged for removal.',
  ],
]);

export const CANDIDATE: TemplateSpecInput = {
  id: 'candidate',
  label: 'Candidate research',
  dot: '#7C3AED',
  placeholder: 'Who are you researching, and for which role?',
  brief:
    'Research a hiring candidate from public professional information only: career history, work evidence, public ' +
    'professional record, fit against the role requirements, verification of claims, and a plan for the interview ' +
    'and references. Eight numbered frames, a weighted rubric and a candidate brief. Never collect or use sensitive ' +
    'personal attributes; every card must trace to a requirement of the role.',
  titleFrom: '{{candidate}}: candidate research for {{role|the role}}',

  inputs: [
    {
      id: 'candidate',
      label: 'Candidate name',
      kind: 'text',
      required: true,
      placeholder: 'Ada Lovelace',
      maxLength: 120,
    },
    {
      id: 'role',
      label: 'Role being hired',
      kind: 'text',
      required: true,
      placeholder: 'Senior Backend Engineer',
      group: 'role',
      maxLength: 120,
    },
    {
      id: 'hiring_org',
      label: 'Hiring organisation',
      kind: 'text',
      placeholder: 'Acme Robotics',
      group: 'role',
      maxLength: 120,
    },
    {
      id: 'level',
      label: 'Level',
      kind: 'select',
      options: ['Early career', 'Mid-level', 'Senior', 'Lead / Manager', 'Director', 'VP or executive'],
      group: 'role',
      maxLength: 40,
    },
    {
      id: 'basis',
      label: 'Why you are researching them',
      kind: 'select',
      required: true,
      options: [
        'They applied',
        'Sourcing: before outreach',
        'Interview preparation',
        'Reference or background check with their consent',
      ],
      help: 'orb researches public professional information only, and never anything the role does not need.',
      maxLength: 60,
    },
    {
      id: 'requirements',
      label: 'What the role requires',
      kind: 'longtext',
      required: true,
      placeholder: 'Must-haves, one per line: e.g. distributed systems at scale; led a team of 5+; Go or Rust',
      maxLength: 2000,
    },
    {
      id: 'nice_to_have',
      label: 'Nice to have',
      kind: 'longtext',
      placeholder: 'Optional.',
      maxLength: 1000,
    },
    {
      id: 'links',
      label: 'Public professional links',
      kind: 'list',
      placeholder: 'LinkedIn, GitHub, personal site, publications: comma separated',
      help: 'Optional. orb finds the public professional presence if missing, and does not look for personal accounts.',
      maxLength: 800,
    },
    {
      id: 'location',
      label: 'Location (professional)',
      kind: 'text',
      placeholder: 'Berlin, or remote',
      group: 'where',
      maxLength: 120,
    },
    {
      id: 'concerns',
      label: 'Professional questions to probe',
      kind: 'longtext',
      placeholder: 'E.g. depth in the stack, management experience, reason for short tenures…',
      maxLength: 1500,
    },
    materialsField('Drop the resume, cover letter, portfolio or take-home. Each becomes a card or database.'),
    depthField(
      'Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending.',
    ),
    {
      id: 'sites',
      label: 'Signed-in sources to use',
      kind: 'sites',
      help: 'Only the sites you connected in Settings can be used. Scout reads them as you, read-only. Check each site’s terms: LinkedIn restricts automated access.',
      sites: [
        { domain: 'linkedin.com', label: 'LinkedIn' },
        { domain: 'github.com', label: 'GitHub' },
        { domain: 'scholar.google.com', label: 'Google Scholar' },
      ],
      maxLength: 400,
    },
  ],

  frames: [
    {
      id: 'profile',
      title: 'Profile',
      color: 'signal',
      brief:
        'Who {{candidate}} is professionally: current role and employer, years in the field, seniority, location and ' +
        'the one-paragraph professional summary, and what this research is for ({{basis|to confirm}}). Public ' +
        'professional information only: nothing about age, health, family, beliefs, origin, appearance, money or home.',
      owners: ['orb'],
      targets: [
        { type: 'entity', min: 1, note: 'the candidate' },
        { type: 'metric', min: 4 },
        { type: 'doc', min: 1, note: 'the professional summary' },
      ],
      seeds: [
        {
          type: 'entity',
          data: {
            title: '{{candidate}}',
            kind: 'person',
            role: '{{role|}}',
            location: '{{location|}}',
            body: 'The candidate, from your intake. Public professional information only.',
            facts: [
              { label: 'Role applied for', value: '{{role|to confirm}}' },
              { label: 'Hiring organisation', value: '{{hiring_org|to confirm}}' },
              { label: 'Level', value: '{{level|to confirm}}' },
              { label: 'Basis', value: '{{basis|to confirm}}' },
            ],
          },
          why: 'The candidate, from your intake.',
        },
        doc(
          'Professional summary',
          'Who {{candidate}} is professionally and why they are or are not a fit for {{role|the role}}. orb writes it after the first pass, from cited cards.',
        ),
        doc(
          'Scope and privacy',
          'This research uses public professional information only, for {{basis|the stated purpose}}. Agents do not collect or infer age, health, family, religion, politics, origin, appearance, finances, home address or personal social media. Critic checks the board for it and the user deletes anything found.',
          'Standing scope note: what this research will not do.',
        ),
        metric('Years in field', 'Count from the first relevant professional role; cite the career source.'),
        metric('Current tenure', 'Years in the current role; cite the source.'),
        metric('Roles held', 'Number of distinct roles; from the Career history database.'),
        metric('Requirements met', 'Number of must-haves with evidence, out of the total; from the Requirements database.'),
      ],
      room: 300,
    },
    {
      id: 'career',
      title: 'Career & experience',
      color: 'sky',
      brief:
        'Every employer and role with dates, title, scope (team size, budget, product), reason for moving where ' +
        'public, promotions, gaps and overlaps, education and certifications that the role asks for. Each row has a source.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Career history' },
        { type: 'timeline', min: 1 },
        { type: 'source', min: 3 },
      ],
      seeds: [
        db('Career history', 'career-history'),
        timelineSeed(
          'Career timeline',
          'Research started',
          'Scout adds each role start and end, dated, with a source.',
        ),
        question(
          'Is the career path coherent for this role?',
          'Progression, scope growth and any unexplained gap, from sources.',
        ),
      ],
    },
    {
      id: 'work',
      title: 'Work evidence',
      color: 'rho',
      brief:
        'Public evidence of the work: repositories, papers, products shipped, talks, case studies, design or writing ' +
        'portfolios. For each piece: what the candidate did (their part, not the team’s), the outcome, the date and ' +
        'the skills it shows. Link each to the requirement it supports.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Work evidence' },
        { type: 'source', min: 4 },
        { type: 'matrix', min: 1, note: 'skills against requirements' },
      ],
      seeds: [
        db('Work evidence', 'work-evidence'),
        matrixSeed(
          'Skills against requirements',
          [
            { name: 'Core technical or craft skill', weight: 35 },
            { name: 'Scope and ownership', weight: 25 },
            { name: 'Collaboration and leadership', weight: 20 },
            { name: 'Communication', weight: 10 },
            { name: 'Currency of skills', weight: 10 },
          ],
          ['{{candidate}}', 'Bar for the role'],
          'Placeholder: scored (0 to 10) from the Work evidence rows, each score cited.',
        ),
        question('What is the strongest piece of public work, and what part is theirs?', 'Authorship, outcome and date.'),
      ],
    },
    {
      id: 'footprint',
      title: 'Public professional record',
      color: 'sky',
      brief:
        'Talks, articles, open-source contributions, podcasts, patents and publications, endorsements by named ' +
        'colleagues or customers in public, awards. How they communicate and how others describe their work. ' +
        'Professional channels only.',
      owners: ['scout'],
      targets: [
        { type: 'quote', min: 3, note: 'what others say about the work; at least 1 critical or qualified' },
        { type: 'video', min: 1, note: 'a talk or interview, linked not embedded' },
        { type: 'source', min: 3 },
      ],
      seeds: [
        timelineSeed(
          'Public record',
          'Research started',
          'Scout adds talks, publications, releases and awards, dated, each with a source.',
        ),
        question('How do they explain their work to others?', 'Clarity, depth and honesty about trade-offs, from a talk or article.'),
      ],
    },
    {
      id: 'fit',
      title: 'Fit to the role',
      color: 'rho',
      brief:
        'The role’s requirements as a list, each with the evidence for it, the strength (strong, partial, none, not ' +
        'knowable from public sources) and the card that holds it. Weighted comparison of the candidate against the ' +
        'role; where the evidence is thin, what to ask in the interview.',
      owners: ['orb', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Requirements, each with evidence' },
        { type: 'framework', min: 1, note: 'strengths and gaps' },
        { type: 'chart', min: 1, note: 'evidence strength by requirement' },
      ],
      seeds: [
        db('Requirements', 'requirements'),
        framework('proscons', 'Strengths and gaps against the role'),
        {
          type: 'chart',
          data: { title: 'Evidence strength by requirement', mark: 'bar', x: 'Requirement', y: 'Weight', color: 'Evidence' },
          db: 'requirements',
          why: 'Bound to the Requirements database: it fills as rows arrive.',
        },
      ],
    },
    {
      id: 'verify',
      title: 'Verification & red flags',
      color: 'paper',
      brief:
        'Work through the red-flag checklist. Raise each flag as a Risk card with evidence, or clear it with a source. ' +
        'Unverified is not false: say what was searched. Flag anything on the board that is not professional ' +
        'information so that it can be removed.',
      owners: ['critic'],
      targets: [{ type: 'risk', min: 4, note: 'every checklist item cleared with a source or raised' }],
      seeds: [
        flagChecklist('Red-flag checklist', CANDIDATE_FLAGS),
        emptyRisk('Credentials', 'Nothing raised yet. Critic raises a specific unverified claim here with what was searched.'),
        emptyRisk('Career story'),
        emptyRisk('Authorship of work'),
        emptyRisk('Privacy and fairness', 'Nothing raised yet. Critic raises any card that holds non-professional information.'),
      ],
    },
    {
      id: 'interview',
      title: 'Interview & references',
      color: 'paper',
      brief:
        'The questions to ask, ranked, each linked to the gap or claim that prompted it; the work sample to request; ' +
        'references to ask for (never contacted by orb) and what to ask them. Questions about the role only.',
      owners: ['critic', 'orb'],
      targets: [
        { type: 'checklist', min: 1, note: 'at least 8 ranked interview questions, each linked to its source card' },
        { type: 'question', min: 3 },
      ],
      seeds: [
        checklist('Interview questions', [
          'Your professional questions to probe: {{concerns|none given yet}}',
          'Walk me through the project you are proudest of and what exactly you did.',
          'Tell me about a decision you got wrong and what changed afterwards.',
        ]),
        checklist('Reference questions', [
          'What was their specific role in the work you saw?',
          'What would you want a new manager to know about how they work?',
          'Would you work with them again, and in what setting?',
        ]),
      ],
    },
    {
      id: 'decision',
      title: 'Recommendation',
      color: 'signal',
      brief:
        'The case to advance and the case against, the hypotheses with confidence, the score against the rubric ' +
        'and a recommendation (Advance, Hold, Pass, Need more information) with conditions. Based on the role’s ' +
        'requirements only.',
      owners: ['orb'],
      targets: [
        { type: 'decision', min: 1 },
        { type: 'hypothesis', min: 2, note: 'with evidence links' },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
        { type: 'framework', min: 1, note: 'SWOT of the candidacy' },
      ],
      seeds: [
        hypothesis(
          '{{candidate}} can do the core of {{role|the role}} from day one',
          'The must-haves are met with verified public evidence.',
        ),
        hypothesis(
          'The strongest claims on the resume hold up',
          'Independent sources back the titles, scope and outcomes claimed.',
        ),
        framework('swot', 'SWOT: {{candidate}} for {{role|the role}}'),
        decisionSeed(
          'Recommendation on {{candidate}}',
          ['Advance', 'Hold', 'Pass', 'Need more information'],
          'Open. orb proposes after the rubric is filled and writes the weighted total here. A person decides; orb never does.',
        ),
        scorecard(CANDIDATE_RUBRIC),
      ],
    },
  ],

  databases: [
    {
      key: 'career-history',
      name: 'Career history',
      frame: 'career',
      purpose: 'Every role, in order, with scope and a source. Public professional sources only.',
      keyColumn: 'Role at employer',
      columns: [
        col('Role at employer'),
        col('Employer'),
        col('Title'),
        col('Start', 'date'),
        col('End', 'date', { note: 'Empty: current role.' }),
        col('Team or scope', 'text', { note: 'Team size, budget, product area, as the source states it.' }),
        col('Verified', 'enum', { options: ['Claimed only', 'Independent source', 'Not verifiable'] }),
        col('Source', 'url'),
        col('Flags', 'text', { note: 'A gap, an overlap or an unclear title; a fact, not a judgement.' }),
      ],
      views: [
        { name: 'By start', kind: 'table', sort: [{ column: 'Start', dir: 'asc' }] },
        { name: 'Verification', kind: 'board', group: 'Verified' },
        { name: 'Flagged', kind: 'table', filter: [{ column: 'Flags', op: 'notEmpty' }] },
      ],
    },
    {
      key: 'work-evidence',
      name: 'Work evidence',
      frame: 'work',
      purpose: 'Public pieces of work, what the candidate did in each, and the requirement each supports.',
      keyColumn: 'Work',
      columns: [
        col('Work'),
        col('Type', 'enum', {
          options: ['Code', 'Paper', 'Product', 'Talk', 'Article', 'Design', 'Case study', 'Other'],
        }),
        col('Date', 'date'),
        col('Their part', 'text', { note: 'What the candidate did, as the source credits it.' }),
        col('Outcome', 'text'),
        col('Skills shown', 'text'),
        col('Requirement', 'text', { note: 'The requirement it supports.' }),
        col('Strength', 'rating', { note: '1 (weak) to 5 (strong).' }),
        col('Source', 'url'),
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Strength', dir: 'desc' }] },
        { name: 'By type', kind: 'board', group: 'Type' },
        { name: 'Strong', kind: 'table', filter: [{ column: 'Strength', op: 'gte', value: 4 }] },
      ],
    },
    {
      key: 'requirements',
      name: 'Requirements',
      frame: 'fit',
      purpose: 'The role’s must-haves and nice-to-haves, each with the evidence for it.',
      keyColumn: 'Requirement',
      columns: [
        col('Requirement'),
        col('Type', 'enum', { options: ['Must-have', 'Nice to have'] }),
        col('Weight', 'number', { note: '1 to 10 from the hiring brief.' }),
        col('Evidence', 'enum', {
          options: ['Strong', 'Partial', 'None', 'Not knowable publicly'],
        }),
        col('Evidence summary', 'text'),
        col('Card', 'text', { note: 'The card or row that holds it.' }),
        col('Interview question', 'text', { note: 'What to ask when the evidence is partial or missing.' }),
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Weight', dir: 'desc' }] },
        { name: 'By evidence', kind: 'board', group: 'Evidence' },
        { name: 'Gaps', kind: 'table', filter: [{ column: 'Evidence', op: 'in', value: ['None', 'Not knowable publicly'] }] },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first (resume, portfolio, take-home): read_card and read_source for files. ' +
          'Turn the role requirements from the intake into one row each in the Requirements database ' +
          '(upsert_rows, key Requirement, Type Must-have or Nice to have, a Weight from 1 to 10). Put each resume ' +
          'claim in Career history with Verified "Claimed only". Confirm the privacy scope: public professional ' +
          'information only, for {{basis|the stated purpose}}.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows', 'ask_user_question'],
        frames: ['career', 'fit'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first (its playbook), Critic once Scout has placed its first sources, Builder ' +
          'once Work evidence has rows. Pass on the links given in the intake and the ticked signed-in sources. ' +
          'Tell each agent that anything outside the role’s requirements is not collected.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'profile',
        text:
          'After Scout’s first pass, fill the Profile metrics (update_card) and the professional summary with cited ' +
          'figures only; a figure you cannot source stays "—".',
        tools: ['query_board', 'search_board', 'update_card'],
        frames: ['profile'],
      }),
      step({
        id: 'gaps',
        text: 'For a requirement Scout could not evidence, run deep_research (core) on that one question about the candidate’s published work. Ask the user before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        frames: ['fit'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'rubric',
        text:
          'At the end, fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each ' +
          'with a cited card in the why line. Then the SWOT, the hypotheses with evidence for and against, and the ' +
          'Decision card: the proposed option and the weighted total in its rationale. A person decides.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['decision'],
      }),
      step({
        id: 'privacy-sweep',
        text: 'Act on Critic’s privacy flags: tell the user, with ask_user_question, which card holds non-professional information so that they can delete it (agents cannot delete cards), and keep it out of the summary, the scorecard and the memo meanwhile.',
        tools: ['search_board', 'ask_user_question', 'update_card'],
        frames: ['verify'],
      }),
      step({
        id: 'memo',
        text: 'Write the candidate brief with compose_section, in the order of the outline, then the one-page summary. On the Quick tier write the summary only.',
        tools: ['compose_section'],
      }),
      step({
        id: 'interview',
        text: 'Keep the interview questions current: collect every unresolved Question card into "Interview questions", ranked, each linked to its source card, and the work sample to request.',
        tools: ['search_board', 'update_card', 'add_link'],
        frames: ['interview'],
      }),
    ],
    scout: [
      step({
        id: 'identity',
        text: 'Confirm which public professional presence is the candidate’s, from the links in the intake, and say how you matched it (employer, name, work). If two people share the name, ask orb through send_message instead of guessing. Do not look for personal accounts.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card', 'send_message'],
        frames: ['profile'],
      }),
      step({
        id: 'career',
        text: 'Career: LinkedIn if connected (fetch_signed_in, read-only, terms apply), otherwise company pages, press, registries and conference bios. One row per role in Career history (upsert_rows, key "Role at employer"), Verified set honestly, a Source url on every row, and one dated event per role on the Career timeline. Employer pages for scope: team size, product.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'upsert_rows', 'place_card'],
        frames: ['career'],
      }),
      step({
        id: 'work',
        text: 'Work evidence: GitHub (fetch_signed_in if connected; the public pages otherwise), papers, launches, case studies and portfolios. One row per piece in Work evidence with the candidate’s own part, the outcome and the requirement it supports. Place a source card for each of the strongest pieces. Check authorship and commit history before crediting impact.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'read_source', 'place_card', 'upsert_rows'],
        frames: ['work'],
      }),
      step({
        id: 'footprint',
        text: 'Public professional record: talks (video cards, linked not embedded), articles, podcasts, publications, patents and awards on the Public record timeline; quote cards for what named colleagues or customers say in public about the work, including at least one critical or qualified view.',
        tools: ['web_search', 'fetch_url', 'place_card', 'image_search'],
        frames: ['footprint'],
      }),
      step({
        id: 'verify',
        text: 'Verification sweep for Critic: for each claim marked "Claimed only", search an independent source (press, registries, programmes, archives); update the rows you wrote with the Verified column and a Source. Professional matters only; stop at anything personal.',
        tools: ['web_search', 'fetch_url', 'upsert_rows', 'query_dataset'],
        frames: ['career', 'work'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain: deep_research (core or above, per the tier) on the candidate’s published work only. Ask before spend over $0.50.',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      step({
        id: 'start',
        text: 'Start after Scout’s first sources: read the cards of every frame (board_map, search_board, read_card) and the Career history and Work evidence rows (query_dataset) before judging anything.',
        tools: ['board_map', 'search_board', 'read_card', 'query_board', 'query_dataset'],
      }),
      step({
        id: 'red-flags',
        text: 'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source cards that clear it (an insight needs at least two cited cards). Unverified is not false: say what was searched. You cannot tick the checklist: the user does.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['verify', 'career', 'work'],
      }),
      step({
        id: 'privacy',
        text: 'Privacy sweep of every card and row: age, health, family, beliefs, origin, appearance, finances, home address, personal social media. Raise each as a Risk card titled "Privacy: ..." naming the card (not repeating the content) and asking orb to have the user delete it.',
        tools: ['query_board', 'search_board', 'place_card', 'add_link'],
        frames: ['verify'],
      }),
      step({
        id: 'questions',
        text: 'Turn every gap into a Question card in Interview & references, linked to the card or requirement that prompted it. Challenge each strength that has a single source.',
        tools: ['place_card', 'add_link', 'query_board'],
        frames: ['interview', 'footprint', 'fit'],
      }),
      step({
        id: 'report',
        text: 'Report progress per frame; send_message to orb when the checklist is complete, naming the flags raised and any privacy violations.',
        tools: ['report_progress', 'send_message'],
      }),
    ],
    builder: [
      step({
        id: 'skills-matrix',
        text: 'The skills-against-requirements matrix: weighted criteria, scores from 0 to 10 from the Work evidence strength (query_dataset), each with its basis in the cell note.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['work'],
      }),
      step({
        id: 'fit-chart',
        text: 'The evidence-strength chart bound to the Requirements database, and the strengths-and-gaps pros/cons card from it.',
        tools: ['place_card', 'query_dataset'],
        frames: ['fit'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual summary (a design frame): role, requirement coverage, score, recommendation and the top open questions, built only from cards on the board. No personal details beyond the professional summary.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['profile', 'decision'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...CANDIDATE_RUBRIC],
  redFlags: [...CANDIDATE_FLAGS],

  output: {
    memoTitle: 'Candidate brief: {{candidate}} for {{role|the role}}',
    citationRule:
      'Every paragraph cites cards; every claim about the candidate cites its public professional source; claimed and verified facts are marked as such. Nothing outside the role’s requirements appears.',
    sections: [
      {
        id: 'summary',
        title: 'Summary & recommendation',
        frames: ['decision', 'verify'],
        words: 150,
        guidance: 'The recommendation, the score, the top 3 strengths and the top 3 open questions, in at most 150 words.',
      },
      {
        id: 'profile',
        title: 'Professional profile',
        frames: ['profile'],
        guidance: 'Current role, years in the field, level and the scope of this research.',
      },
      {
        id: 'career',
        title: 'Career & experience',
        frames: ['career'],
        guidance: 'The career timeline with verification status, gaps and overlaps as questions.',
      },
      {
        id: 'work',
        title: 'Work evidence',
        frames: ['work'],
        guidance: 'The strongest pieces of work, the candidate’s own part in each and the skills matrix.',
      },
      {
        id: 'footprint',
        title: 'Public professional record',
        frames: ['footprint'],
        guidance: 'Talks, writing and what others say about the work, including critical views.',
      },
      {
        id: 'fit',
        title: 'Fit to the role',
        frames: ['fit'],
        guidance: 'Each requirement with its evidence strength; strengths and gaps.',
      },
      {
        id: 'verify',
        title: 'Verification & flags',
        frames: ['verify'],
        guidance: 'The red-flag outcomes: each raised flag with what to ask, the cleared ones in one line. Unverified is not false.',
      },
      {
        id: 'interview',
        title: 'Interview plan & references',
        frames: ['interview'],
        guidance: 'The ranked questions, the work sample to request and what to ask references.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard',
        frames: ['decision'],
        guidance: 'The rubric table: each dimension, weight, score and evidence.',
      },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'Candidate one-pager: {{candidate}}',
      includes: ['Role and level', 'Requirements covered', 'Score', 'Recommendation', 'Top open questions'],
    },
    deckFormat: 'standard',
  },

  tiers: tiers({
    quickSummary:
      'No deep research: public pages, search, extract and the signed-in fetches the user ticked, at most 12 cards per frame, and the candidate brief is the summary only.',
    standardSummary:
      'Quick, plus enrichment of the work-evidence list and one or two deep-research runs (core) on the candidate’s published work, asking before spend.',
    deepSummary:
      'Standard, plus pro deep research on the hardest requirement gaps and the full candidate brief.',
    deepRuns: 4,
  }),

  followUps: [
    {
      label: 'Draft interview questions',
      prompt:
        'Draft the interview for {{candidate}} ({{role|the role}}): ordered questions with a time for each, each linked to a requirement or a gap on the board.',
    },
    {
      label: 'What is thin?',
      prompt: 'Which requirements have the weakest evidence for {{candidate}}, and what is the cheapest way to close each gap?',
    },
    {
      label: 'Compare to [another candidate]',
      prompt: 'Compare {{candidate}} to [another candidate] against the same requirements, with a table and the evidence for each score.',
    },
    {
      label: 'Draft the reference questions',
      prompt: 'Draft reference questions for {{candidate}}: what to ask, in what order, tied to the claims we could not verify.',
    },
    {
      label: 'Privacy check',
      prompt: 'Check every card on this board: is anything not professional information about {{candidate}}? List the cards and ask before removing any.',
    },
    {
      label: 'Re-score after the interview',
      prompt: 'I added the interview notes. Re-score the rubric with them, say which scores moved and why, and update the recommendation.',
    },
  ],

  signedIn: [
    {
      domain: 'linkedin.com',
      label: 'LinkedIn',
      use: 'Role history, tenure and endorsements, as visible to the user. LinkedIn restricts automated access: read-only, rate-limited, the user’s own session.',
    },
    { domain: 'github.com', label: 'GitHub', use: 'Public repositories, contributions and commit history for authorship.' },
    { domain: 'scholar.google.com', label: 'Google Scholar', use: 'Publications and citations.' },
  ],
};
