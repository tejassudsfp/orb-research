/**
 * Sales account research (P6.14): the pre-call brief. One target account, the people you will meet, why now, what they
 * run today, where your offer fits, what could go wrong and exactly how to open the call. The human-readable version
 * of this file is docs/templates/sales-account.md (generated: `pnpm templates:docs`).
 */
import {
  checklist,
  db,
  decisionSeed,
  depthField,
  emptyRisk,
  hypothesis,
  matrixSeed,
  materialsField,
  metric,
  proscons,
  question,
  scorecardSeed,
  sitesField,
  step,
  swot,
  tiersFor,
  timelineSeed,
} from './kit-business.js';
import type { RedFlag, RubricDimension, TemplateSpecInput } from './schema.js';

// ---- the rubric: how good a target is this account right now (weights add up to 100) ----

export const SALES_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'fit',
    name: 'Fit with your ideal customer',
    weight: 25,
    anchors: {
      1: 'Outside the segment, size or use case you win in.',
      3: 'Matches the segment; the use case is plausible.',
      5: 'A textbook customer: same profile as your best accounts.',
    },
    frame: 'fit',
  },
  {
    id: 'pain',
    name: 'Evidence of the pain',
    weight: 20,
    anchors: {
      1: 'No sign the problem exists here.',
      3: 'The problem is common in their sector; one indirect sign.',
      5: 'Their own words (job posts, calls, filings) state the problem.',
    },
    frame: 'fit',
  },
  {
    id: 'timing',
    name: 'Timing and triggers',
    weight: 20,
    anchors: {
      1: 'Nothing changing; no budget moment in sight.',
      3: 'A relevant event in the last year.',
      5: 'A fresh trigger plus a budget or contract date inside 6 months.',
    },
    frame: 'triggers',
  },
  {
    id: 'access',
    name: 'Access to the buying committee',
    weight: 15,
    anchors: {
      1: 'No named contact; no warm path.',
      3: 'A user or influencer is reachable.',
      5: 'A champion and the economic buyer are identified and reachable.',
    },
    frame: 'people',
  },
  {
    id: 'position',
    name: 'Competitive position',
    weight: 10,
    anchors: {
      1: 'A rival is locked in under a long contract.',
      3: 'A rival is present but replaceable.',
      5: 'Greenfield, or a rival they are unhappy with.',
    },
    frame: 'stack',
  },
  {
    id: 'budget',
    name: 'Ability to buy',
    weight: 10,
    anchors: {
      1: 'Cost-cutting or distress.',
      3: 'Stable; budget exists but is contested.',
      5: 'Funded or growing, with spend in this category.',
    },
    frame: 'snapshot',
  },
];

// ---- the red-flag checklist (Critic clears or raises each) ----

export const SALES_RED_FLAGS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: 'The main contact has left, changed role or is not who the CRM says.',
    check: 'Compare the contact in the intake with their current profile and the company site: title, start date, team.',
  },
  {
    id: 'RF02',
    text: 'Layoffs, a hiring freeze or a restructuring in the buying team.',
    check: 'Search layoff news and trackers, job-post drops and reorg announcements; note which function was hit.',
  },
  {
    id: 'RF03',
    text: 'A competitor signed or renewed recently, so a contract may lock the account.',
    check: 'Look for press releases, case studies and job posts naming a rival in this category in the last 18 months.',
  },
  {
    id: 'RF04',
    text: 'Financial distress: going-concern language, missed payments, a down round or falling revenue.',
    check: 'Read the latest results or funding news; compare the funding date and runway signals with the buying cycle.',
  },
  {
    id: 'RF05',
    text: 'A pending acquisition or merger, which usually freezes new vendors.',
    check: 'Search M&A news and filings for the account and its parent; a freeze is raised with its expected end date.',
  },
  {
    id: 'RF06',
    text: 'The champion has no budget or authority, or the real buyer is unknown.',
    check: 'Check the Stakeholders database: is there an Economic buyer row with a source? If not, raise it.',
  },
  {
    id: 'RF07',
    text: 'A long procurement, security or legal review is likely (regulated sector, large enterprise).',
    check: 'Look for the sector, certifications they demand of vendors and any public vendor-onboarding page.',
  },
  {
    id: 'RF08',
    text: 'A security incident, outage or public complaint in your category at this account.',
    check: 'Search incident news, status pages and review sites; note whether it makes them more or less open to you.',
  },
  {
    id: 'RF09',
    text: 'An in-house build or a strategic decision to stop spending in this area.',
    check: 'Look for engineering blogs, job posts for the capability and executive statements on build versus buy.',
  },
  {
    id: 'RF10',
    text: 'Stale or single-source facts: the brief rests on information older than 12 months.',
    check: 'For every fact the brief leans on, find the date and a second source; undated or single-source facts are raised.',
  },
];

export const SALES_ACCOUNT: TemplateSpecInput = {
  id: 'sales-account',
  label: 'Sales account research',
  dot: '#0D9488',
  placeholder: 'Which account are you preparing a call for?',
  brief:
    'Prepare a pre-call brief on one target account: ten numbered frames (snapshot, buying committee, strategy, triggers, ' +
    'current stack, pain and fit, rivals in the account, proof from similar customers, risks, call plan), the red-flag ' +
    'checklist, the weighted account score and a one-page brief. Separate what the account says about itself from what ' +
    'independent sources show, cite every fact with its date, and end with the opening, the discovery questions and the next step.',
  titleFrom: '{{company}}: pre-call brief',

  // ---- the intake form (Home › Sales account research chip) ----
  inputs: [
    {
      id: 'company',
      label: 'Account (company) name',
      kind: 'text',
      required: true,
      placeholder: 'Globex Logistics',
      maxLength: 120,
    },
    {
      id: 'website',
      label: 'Website URL',
      kind: 'url',
      required: true,
      placeholder: 'https://globex.com',
      maxLength: 300,
    },
    {
      id: 'contacts',
      label: 'People you will meet',
      kind: 'people',
      placeholder: 'One per line: Name, title, LinkedIn URL (Scout finds the rest)',
      help: 'Optional but best: the brief is written around them.',
      maxLength: 1500,
    },
    {
      id: 'offer',
      label: 'What you sell here',
      kind: 'longtext',
      required: true,
      placeholder: 'A route-optimisation platform that cuts last-mile cost',
      maxLength: 1500,
    },
    {
      id: 'goal',
      label: 'Goal of the call',
      kind: 'select',
      options: ['First discovery call', 'Demo', 'Follow-up', 'Renewal', 'Expansion', 'Negotiation', 'Win-back'],
      maxLength: 40,
      group: 'call',
    },
    {
      id: 'meeting_date',
      label: 'Meeting date',
      kind: 'text',
      placeholder: '2026-10-22',
      group: 'call',
      maxLength: 40,
    },
    {
      id: 'deal_size',
      label: 'Deal size (if known)',
      kind: 'text',
      placeholder: '$120k ACV',
      group: 'call',
      maxLength: 80,
    },
    {
      id: 'segment',
      label: 'Segment / industry',
      kind: 'text',
      placeholder: 'Mid-market logistics',
      suggestions: ['Enterprise', 'Mid-market', 'SMB', 'Public sector', 'Fintech', 'Healthcare', 'Retail', 'Manufacturing', 'SaaS'],
      maxLength: 120,
    },
    {
      id: 'competitors',
      label: 'Rivals you expect',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout looks for them in the account.',
      maxLength: 800,
    },
    {
      id: 'history',
      label: 'History with the account',
      kind: 'longtext',
      placeholder: 'Past calls, emails, a lost deal, a pilot…',
      maxLength: 1500,
    },
    {
      id: 'concerns',
      label: 'What worries you about this call',
      kind: 'longtext',
      placeholder: 'A rival is in there, the champion is junior…',
      maxLength: 1500,
    },
    materialsField('Drop CRM notes, past emails, call transcripts, an RFP or your own deck. Each becomes a card.'),
    depthField(),
    sitesField([
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'crunchbase.com', label: 'Crunchbase' },
      { domain: 'glassdoor.com', label: 'Glassdoor' },
      { domain: 'g2.com', label: 'G2' },
    ]),
  ],

  // ---- the ten frames ----
  frames: [
    {
      id: 'snapshot',
      title: 'Account snapshot',
      color: 'signal',
      brief:
        'What {{company}} does in one sentence, HQ, employees, revenue or funding, growth direction, business model, ' +
        'ownership, the segment and how large a spender it is in your category. Every figure has a date and a source.',
      owners: ['orb'],
      targets: [
        { type: 'metric', min: 6 },
        { type: 'entity', min: 1, note: 'the account' },
        { type: 'doc', min: 1, note: 'the one-liner' },
      ],
      seeds: [
        {
          type: 'entity',
          data: {
            title: '{{company}}',
            kind: 'org',
            url: '{{website}}',
            body: 'The target account, from your intake.',
            facts: [
              { label: 'Segment', value: '{{segment|to confirm}}' },
              { label: 'Goal of the call', value: '{{goal|to confirm}}' },
              { label: 'Meeting', value: '{{meeting_date|not set}}' },
              { label: 'Deal size', value: '{{deal_size|to confirm}}' },
            ],
          },
          why: 'The account, from your intake.',
        },
        {
          type: 'doc',
          data: {
            title: 'One-liner',
            body: 'What {{company}} does and why it may need what you sell, in one sentence. orb writes it after the first pass.',
          },
          why: 'The one-sentence description.',
        },
        metric('Employees', 'Headcount now, with the source and date.'),
        metric('Revenue or funding', 'Annual revenue (public) or total funding (private), with the period.'),
        metric('Growth', 'Revenue or headcount growth, with the period.'),
        metric('Founded', 'Year of founding.'),
        metric('Spend in your category', 'Estimated, if knowable; mark it estimated.'),
        metric('Locations', 'Offices or sites relevant to the deal.'),
      ],
      room: 360,
    },
    {
      id: 'people',
      title: 'Buying committee',
      color: 'sky',
      brief:
        'Who decides, who influences and who uses: for each person their title, tenure, background, what they own, what ' +
        'they have said publicly about priorities and how they like to be approached. Name the economic buyer, the likely ' +
        'champion, the blocker and the end users, and say which are confirmed and which are guesses.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'entity', min: 3, note: 'one person card per contact and per likely buyer' },
        { type: 'database', min: 1, note: 'the Stakeholders database' },
        { type: 'quote', min: 2, note: 'what they said, in their words' },
      ],
      seeds: [
        db('Stakeholders', 'stakeholders'),
        question(
          'Who owns the budget for this?',
          'The economic buyer: the person who can say yes without asking anyone else.',
        ),
        question(
          'Who is likely to block it?',
          'Security, procurement, an incumbent owner or a leader with a competing priority.',
        ),
      ],
    },
    {
      id: 'strategy',
      title: 'Business and priorities',
      color: 'rho',
      brief:
        'What the account is trying to achieve this year: strategy, results and guidance, executive statements, product ' +
        'launches, markets entered or left, investment themes and cost programmes. Quote the account in its own words and ' +
        'translate each priority into an angle for your offer.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'quote', min: 4, note: 'from earnings calls, interviews, posts' },
        { type: 'source', min: 4, note: 'including 1 primary document' },
        { type: 'framework', min: 1, note: 'priorities versus your offer' },
      ],
      seeds: [
        question(
          'What are the top three priorities this year?',
          'From the account itself: results, strategy day, executive interviews, careers page.',
        ),
        proscons('Where our offer helps and where it does not'),
      ],
    },
    {
      id: 'triggers',
      title: 'Triggers and timing',
      color: 'sky',
      brief:
        'Events that make a purchase more or less likely now: funding, leadership changes, launches, hiring waves, ' +
        'layoffs, acquisitions, regulation, outages, earnings and contract or budget dates. Each event is dated, sourced and ' +
        'tagged with why it matters for this call.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Trigger events' },
        { type: 'timeline', min: 1 },
        { type: 'metric', min: 1, note: 'open roles that point at your category' },
      ],
      seeds: [
        db('Trigger events', 'triggers'),
        timelineSeed('Account timeline', 'Brief started', 'Scout adds dated events (news, hires, launches), each with a source.'),
        metric('Open roles in your area', 'Count roles that point at your category, with the date counted.'),
      ],
    },
    {
      id: 'stack',
      title: 'Current stack and vendors',
      color: 'rho',
      brief:
        'What the account runs today in and around your category: tools, vendors, in-house builds and how long they have ' +
        'been in place. Evidence from job posts, case studies, integrations pages, review sites and public tech data. Mark ' +
        'each entry confirmed or inferred.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Stack and vendors' },
        { type: 'matrix', min: 1 },
        { type: 'source', min: 3 },
      ],
      seeds: [
        db('Stack and vendors', 'stack'),
        matrixSeed(
          'Incumbent versus us',
          [
            ['Capability', 30],
            ['Cost', 20],
            ['Ease of use', 20],
            ['Integrations', 15],
            ['Support', 15],
          ],
          ['Incumbent', '{{company}} need', 'Our offer'],
        ),
      ],
    },
    {
      id: 'fit',
      title: 'Pain and fit',
      color: 'sky',
      brief:
        'Your hypotheses about the problem the account has and how your offer solves it: each with the evidence for and ' +
        'against, the metric it moves, who feels it, and what it is worth. End with the fit against your ideal customer.',
      owners: ['scout', 'critic', 'builder'],
      targets: [
        { type: 'hypothesis', min: 3, note: 'with evidence links' },
        { type: 'insight', min: 2, note: 'each cites 2 or more cards' },
        { type: 'matrix', min: 1, note: 'the fit score against your ICP' },
      ],
      seeds: [
        hypothesis(
          '{{company}} has the problem we solve',
          'Your offer: {{offer}}. Link the cards that show the problem and the cards that contradict it.',
        ),
        hypothesis(
          'The problem is costly enough to fund now',
          'The pain is tied to a metric the buyer is measured on and a budget line.',
        ),
        hypothesis(
          'They will choose us over doing nothing or the incumbent',
          'Switching cost, urgency and the strength of the incumbent.',
        ),
        matrixSeed(
          'Fit with our ideal customer',
          [
            ['Segment and size', 25],
            ['Use case match', 30],
            ['Technical fit', 20],
            ['Buying process', 15],
            ['Strategic value', 10],
          ],
          ['{{company}}', 'Our best customer'],
        ),
      ],
    },
    {
      id: 'rivals',
      title: 'Rivals in the account',
      color: 'rho',
      brief:
        'Every competitor present or pitching at the account: what they sell there, since when, how it is going, who owns ' +
        'it internally and how to position against it. Also the substitutes: in-house work, spreadsheets, doing nothing.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Rivals present or pitching' },
        { type: 'product', min: 2, note: 'one card per rival present' },
        { type: 'framework', min: 1, note: 'how to position against the strongest' },
      ],
      seeds: [db('Rivals present or pitching', 'rivals'), proscons('Our position against the strongest rival')],
    },
    {
      id: 'proof',
      title: 'Proof from similar customers',
      color: 'sky',
      brief:
        'Your customers (or public ones) most like this account: segment, size, the result they got, a quote and a ' +
        'reference you can use. Pick two to lead with and say why each is credible to this buyer.',
      owners: ['scout'],
      targets: [
        { type: 'database', min: 1, note: 'Reference customers' },
        { type: 'quote', min: 3 },
        { type: 'source', min: 2, note: 'published case studies' },
      ],
      seeds: [db('Reference customers', 'references')],
    },
    {
      id: 'risks',
      title: 'Risks and objections',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. ' +
        'Then list the objections you will hear (price, security, timing, switching cost, build-versus-buy), each with the ' +
        'best answer and the proof that backs it.',
      owners: ['critic'],
      targets: [
        { type: 'risk', min: 5, note: 'every checklist item cleared with a source or raised' },
        { type: 'checklist', min: 1, note: 'objections with answers' },
      ],
      seeds: [
        {
          type: 'checklist',
          data: {
            title: 'Red-flag checklist',
            items: SALES_RED_FLAGS.map((f, i) => ({ id: `rf${i + 1}`, text: `${f.id} ${f.text}`, done: false })),
          },
          why: 'Critic raises or clears each; you tick them off.',
        },
        checklist(
          'Objections and answers',
          [
            'We already have a vendor for this: how do we win on switching cost?',
            'It is too expensive: what is the payback and the proof?',
            'Security and compliance will block it: what do we hand over first?',
            'Now is not the time: what does waiting cost them?',
          ],
          'Critic extends it with the objections the evidence supports; orb writes the answers.',
        ),
        emptyRisk('Timing'),
        emptyRisk('Competitive'),
        emptyRisk('Stakeholder'),
        emptyRisk('Budget'),
      ],
    },
    {
      id: 'plan',
      title: 'Call plan',
      color: 'signal',
      brief:
        'The call itself: the angle and the opening line, the three to five discovery questions that test the hypotheses, ' +
        'the proof to show, the ask, the next step to propose and what to do if the champion is not in the room. End with ' +
        'the account score and the call (Prioritise, Nurture, Deprioritise).',
      owners: ['orb'],
      targets: [
        { type: 'checklist', min: 1, note: 'discovery questions, ranked, each linked to its hypothesis' },
        { type: 'decision', min: 1 },
        { type: 'matrix', min: 1, note: 'the filled scorecard' },
        { type: 'doc', min: 1, note: 'the opening and the ask' },
      ],
      seeds: [
        {
          type: 'doc',
          data: {
            title: 'Opening and ask',
            body: 'Angle for {{company}}, the first 60 seconds and the single next step to ask for. orb writes it after the scorecard.',
          },
          why: 'The opening line and the ask.',
        },
        checklist('Discovery questions', [
          'Your concerns: {{concerns|none given yet}}',
          'What is the one number you are measured on this year?',
          'What happens if you change nothing for 12 months?',
          'Who else needs to be involved before a decision?',
        ]),
        scorecardSeed(SALES_RUBRIC, '{{company}}'),
        decisionSeed('Call on {{company}}', ['Prioritise', 'Nurture', 'Deprioritise']),
        swot('SWOT of our position at {{company}}'),
      ],
    },
  ],

  // ---- the databases ----
  databases: [
    {
      key: 'stakeholders',
      name: 'Stakeholders',
      frame: 'people',
      purpose: 'One row per person who decides, influences or uses. Contacts from the intake first.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'person' },
        { name: 'Title', type: 'text' },
        {
          name: 'Role in the deal',
          type: 'enum',
          options: ['Economic buyer', 'Champion', 'Influencer', 'User', 'Blocker', 'Unknown'],
        },
        { name: 'Confirmed', type: 'boolean', note: 'Ticked when the role is sourced, not guessed.' },
        { name: 'Tenure (years)', type: 'number', note: 'At this company.' },
        { name: 'Background', type: 'text' },
        { name: 'Priorities', type: 'text', note: 'In their own words where possible.' },
        { name: 'LinkedIn', type: 'url' },
        { name: 'Source', type: 'url' },
        { name: 'Flags', type: 'text', note: 'Recent move, left, junior, no authority.' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By role', kind: 'board', group: 'Role in the deal' },
        { name: 'Flagged', kind: 'table', filter: [{ column: 'Flags', op: 'notEmpty' }] },
      ],
    },
    {
      key: 'triggers',
      name: 'Trigger events',
      frame: 'triggers',
      purpose: 'Dated events at the account that change the odds, each with why it matters for this call.',
      keyColumn: 'Event',
      columns: [
        { name: 'Event', type: 'text' },
        { name: 'Date', type: 'date' },
        {
          name: 'Type',
          type: 'enum',
          options: ['Funding', 'Leadership change', 'Launch', 'Hiring', 'Layoff', 'M&A', 'Regulation', 'Earnings', 'Incident', 'Contract date'],
        },
        { name: 'Effect', type: 'enum', options: ['Helps', 'Neutral', 'Hurts'] },
        { name: 'Why it matters', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'By date', kind: 'table', sort: [{ column: 'Date', dir: 'desc' }] },
        { name: 'By effect', kind: 'board', group: 'Effect' },
      ],
    },
    {
      key: 'stack',
      name: 'Stack and vendors',
      frame: 'stack',
      purpose: 'What the account runs in and around your category, with the evidence for each entry.',
      keyColumn: 'Tool',
      columns: [
        { name: 'Category', type: 'text' },
        { name: 'Tool', type: 'text' },
        { name: 'Vendor', type: 'text' },
        {
          name: 'Evidence',
          type: 'enum',
          options: ['Case study', 'Job post', 'Integration page', 'Review site', 'Public tech data', 'Told by the account'],
        },
        { name: 'Confidence', type: 'enum', options: ['Low', 'Medium', 'High'] },
        { name: 'In place since', type: 'date' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By confidence', kind: 'board', group: 'Confidence' },
      ],
    },
    {
      key: 'rivals',
      name: 'Rivals present or pitching',
      frame: 'rivals',
      purpose: 'Competitors in the account or pitching it. Discovered with find_entities, enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'URL', type: 'url' },
        { name: 'Status', type: 'enum', options: ['Incumbent', 'Pitching', 'Past vendor', 'Substitute'] },
        { name: 'Since', type: 'date' },
        { name: 'What they sell there', type: 'text' },
        { name: 'How it is going', type: 'text' },
        { name: 'Our angle', type: 'text' },
        { name: 'Threat level', type: 'rating', note: '1 (low) to 5 (high).' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Threat level', dir: 'desc' }] },
        { name: 'By status', kind: 'board', group: 'Status' },
      ],
    },
    {
      key: 'references',
      name: 'Reference customers',
      frame: 'proof',
      purpose: 'Customers most like the account, with the result and whether they can be used as a reference.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'Segment', type: 'text' },
        { name: 'Size', type: 'text', note: 'Employees or revenue band.' },
        { name: 'Result', type: 'text', note: 'The number they got, with the period.' },
        { name: 'Public', type: 'boolean', note: 'A published case study exists.' },
        { name: 'Similarity', type: 'rating', note: '1 (loose) to 5 (twin).' },
        { name: 'Source', type: 'url' },
        { name: 'Quote', type: 'text' },
      ],
      views: [
        { name: 'Most similar', kind: 'table', sort: [{ column: 'Similarity', dir: 'desc' }] },
        { name: 'Public only', kind: 'table', filter: [{ column: 'Public', op: 'eq', value: true }] },
      ],
    },
  ],

  // ---- the agent playbook (injected into each agent's first assignment) ----
  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read what the user dropped first: CRM notes, emails, transcripts, an RFP (read_card and read_source for files, ' +
          'query_dataset for tables). Pull every person into the Stakeholders database (upsert_rows, Confirmed ticked only ' +
          'when the role is stated). Hand Scout the contacts, the rivals the user expects, the history and the ticked ' +
          'signed-in sources in its delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['people'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first (its seven-step playbook), Builder once Scout has placed its first sources, ' +
          'Critic once Scout has sources to review. Name the frames each agent owns.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'snapshot',
        text:
          "After Scout's first pass, fill the six Account snapshot metrics (update_card on the placeholders) and the " +
          'one-liner, each with a cited figure and its date. Never write a figure you cannot source.',
        tools: ['query_board', 'search_board', 'update_card'],
        frames: ['snapshot', 'triggers'],
      }),
      step({
        id: 'gaps',
        text:
          'For a gap Scout could not close (an executive priority, a contract date, a budget cycle), run web_answer first; ' +
          'if it is still open run deep_research (base or core) on that one question. Ask the user before spend over $0.50.',
        tools: ['web_answer', 'deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'score',
        text:
          'Fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one ' +
          'cited card in the why line. Update the three hypotheses (evidence for and against as card ids), then propose the ' +
          'call on the Decision card with the weighted total in its rationale.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['plan', 'fit'],
      }),
      step({
        id: 'call-plan',
        text:
          'Write the call plan: the "Opening and ask" doc (angle, first 60 seconds, the one ask), the Discovery questions ' +
          '(ranked; each tests a hypothesis and is linked to it) and an answer for each objection Critic listed.',
        tools: ['place_card', 'update_card', 'add_link', 'query_board'],
        frames: ['plan', 'risks'],
      }),
      step({
        id: 'memo',
        text: 'Write the brief with compose_section, section by section in the order of the outline, then the one-page brief. On the Quick tier write the one-page brief only.',
        tools: ['compose_section'],
      }),
      step({
        id: 'monitor',
        text:
          'Only when the user asks to keep watching the account (an open opportunity, a long cycle): watch_topic with the ' +
          'company name and the monitor query. Monitors cost money on every check, so each is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'account-site',
        text:
          'The account site: home, about, leadership, customers, careers, press and the page for the product line you sell ' +
          'against (fetch_url, parallel_extract). Fill the snapshot facts and place an Entity card for the company. ' +
          'Capture the home page and the most relevant product page (capture_page) as image cards.',
        tools: ['fetch_url', 'parallel_extract', 'capture_page', 'place_card'],
        frames: ['snapshot', 'strategy', 'stack'],
      }),
      step({
        id: 'people',
        text:
          'The buying committee: start from the contacts in the intake. Signed-in LinkedIn if the user connected it ' +
          '(fetch_signed_in), otherwise public search. One person card per contact and per likely buyer in this frame, and one ' +
          'Stakeholders row each (upsert_rows, key Name) with the role in the deal and whether it is confirmed. Quote what they ' +
          'have said publicly (talks, posts, interviews) as quote cards.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['people'],
      }),
      step({
        id: 'strategy',
        text:
          'Strategy and priorities: the latest results or funding news, executive interviews and the strategy page. Quote the ' +
          'account in its own words, place the primary documents as sources and give each priority an angle for the offer.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card'],
        frames: ['strategy'],
      }),
      step({
        id: 'triggers',
        text:
          'Triggers: news in the last 12 months (funding, leadership changes, launches, layoffs, M&A, regulation, incidents), ' +
          'hiring in your area (count the open roles; Glassdoor and LinkedIn if connected). One row per event in Trigger events ' +
          'with its date, effect and why it matters (upsert_rows), and the same events on the timeline.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['triggers'],
      }),
      step({
        id: 'stack-and-rivals',
        text:
          'Stack and rivals: job posts, case studies, integration pages and review sites for what they run. Add the rivals the ' +
          'user expects first, then find_entities for vendors in your category serving this segment (the match limit follows ' +
          'the depth tier); it fills its own database card in the Rivals frame. batch_enrich adds status, since when and ' +
          'what they sell there; consolidate into Rivals present or pitching with query_dataset and upsert_rows. One Stack and ' +
          'vendors row per tool, with the evidence and confidence.',
        tools: ['web_search', 'fetch_url', 'find_entities', 'batch_enrich', 'query_dataset', 'upsert_rows', 'place_card'],
        frames: ['stack', 'rivals'],
      }),
      step({
        id: 'proof',
        text:
          'Proof: published case studies and quotes from customers most like the account (same segment, size and use case), ' +
          'from your own site and public sources. One Reference customers row each with the result and the source; a quote ' +
          'card for every strong line.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card', 'upsert_rows'],
        frames: ['proof'],
      }),
      step({
        id: 'pain-evidence',
        text:
          'Pain evidence: search for the account naming the problem you solve (job posts, earnings calls, reviews, ' +
          'forums). Place each find as a quote or source card in Pain and fit, with a link to the hypothesis it supports. ' +
          'Also sweep for layoffs, acquisitions, security incidents and rival announcements so Critic has sources to clear or raise each flag.',
        tools: ['web_search', 'fetch_url', 'place_card', 'add_link'],
        frames: ['fit', 'risks'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain: deep_research (core or above, per the tier), one question per run. Ask before spend over $0.50.',
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
        text:
          'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the ' +
          'evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source cards that ' +
          'clear it. Never leave a flag silent; if nothing was searched, say so and ask Scout for the search.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['risks', 'people', 'rivals'],
      }),
      step({
        id: 'hypotheses',
        text:
          'Challenge the three hypotheses in Pain and fit: place an Insight (two or more citations) that tests each, and link ' +
          'a "tension" from any card that disagrees. Flag a stakeholder whose role is a guess (Confirmed unticked) as a Question.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['fit', 'people'],
      }),
      step({
        id: 'objections',
        text: 'Extend the "Objections and answers" checklist with every objection the evidence supports (a rival in place, a security review, a build-versus-buy signal); one item per objection, each linked to the card behind it.',
        tools: ['place_card', 'add_link', 'query_board'],
        frames: ['risks'],
      }),
      step({
        id: 'report',
        text: 'Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised.',
        tools: ['report_progress', 'send_message'],
      }),
    ],
    builder: [
      step({
        id: 'stack-matrix',
        text: 'The "Incumbent versus us" matrix: scores 0 to 10 for each criterion from the Stack and vendors, Rivals and Reference customers databases.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['stack'],
      }),
      step({
        id: 'fit-matrix',
        text: 'The "Fit with our ideal customer" matrix, scored from the cards of Account snapshot and Pain and fit (query_dataset, read_card), and a chart of trigger events by type bound to Trigger events.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['fit'],
      }),
      step({
        id: 'priorities',
        text: 'Turn the priorities Scout quoted into the "Where our offer helps and where it does not" framework (pros and cons), each item citing a quote card.',
        tools: ['place_card', 'read_card', 'query_board'],
        frames: ['strategy'],
      }),
      step({
        id: 'one-pager',
        text: 'Optional one-page visual brief (a design frame): the account, the score, the buying committee, the angle and the opening, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...SALES_RUBRIC],
  redFlags: [...SALES_RED_FLAGS],

  // ---- the output ----
  output: {
    memoTitle: 'Pre-call brief: {{company}}',
    citationRule:
      'Every paragraph cites cards; every figure cites its source and its date; what the account says is marked as claimed and what independent sources show as verified.',
    sections: [
      {
        id: 'summary',
        title: 'Summary and call',
        frames: ['plan', 'risks'],
        words: 120,
        guidance: 'The call (prioritise, nurture or deprioritise), the score, the angle and the top 3 risks, in at most 120 words.',
      },
      {
        id: 'snapshot',
        title: 'Account snapshot',
        frames: ['snapshot'],
        guidance: 'A table of the snapshot metrics: what they do, size, growth, funding or revenue, locations.',
      },
      {
        id: 'people',
        title: 'Who you are meeting and who decides',
        frames: ['people'],
        guidance: 'Each contact and the likely buying committee: role in the deal, background, priorities, how to approach, and what is a guess.',
      },
      {
        id: 'strategy',
        title: 'Priorities and strategy',
        frames: ['strategy'],
        guidance: 'The top priorities in the account\'s own words and the angle each gives your offer.',
      },
      {
        id: 'triggers',
        title: 'Why now',
        frames: ['triggers'],
        guidance: 'The trigger events that make the call timely or risky, dated, with the timeline.',
      },
      {
        id: 'stack',
        title: 'Current stack and rivals',
        frames: ['stack', 'rivals'],
        guidance: 'What they run today, who the rivals are and how to position against the strongest.',
      },
      {
        id: 'fit',
        title: 'Pain and fit',
        frames: ['fit'],
        guidance: 'The hypotheses with their evidence for and against, and the fit score.',
      },
      {
        id: 'proof',
        title: 'Proof to bring',
        frames: ['proof'],
        guidance: 'The two reference customers to lead with and why each is credible to this buyer.',
      },
      {
        id: 'risks',
        title: 'Risks and objections',
        frames: ['risks'],
        guidance: 'Red-flag outcomes with mitigants; the objections you will hear with the best answer for each.',
      },
      {
        id: 'plan',
        title: 'Call plan',
        frames: ['plan'],
        guidance: 'The opening, the ranked discovery questions, the ask and the next step.',
      },
      {
        id: 'scorecard',
        title: 'Account score',
        frames: ['plan'],
        guidance: 'The rubric table: each dimension, its weight, its score and its evidence.',
      },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page brief: {{company}}',
      includes: ['Snapshot', 'Who decides', 'Why now', 'Angle and opening', 'Top risks', 'Next step'],
    },
    deckFormat: 'sales-brief',
  },

  // ---- depth tiers (the cost guard) ----
  tiers: tiersFor({ subject: 'account brief', standardRuns: 2, deepRuns: 6 }),

  followUps: [
    {
      label: 'Brief me on [person]',
      prompt: 'Go deeper on [person] at {{company}}: background, what they care about, how they talk about the problem, and how to open with them.',
    },
    {
      label: 'Draft the first email',
      prompt: 'Draft the outreach email to the likely champion at {{company}}: one angle, one proof point and one ask, from the cards on this board.',
    },
    {
      label: 'Build the battlecard',
      prompt: 'Build a battlecard against the strongest rival at {{company}}: where we win, where we lose, the traps to set and the proof to bring.',
    },
    {
      label: 'Map the rest of the account',
      prompt: 'Map the other teams at {{company}} that could use our offer, with a champion guess and a trigger for each.',
    },
    {
      label: 'Update after the call',
      prompt: 'I added the call notes. Update the stakeholders and hypotheses, say what changed in the score, and propose the next step.',
    },
    {
      label: 'Prepare the follow-up plan',
      prompt: 'Plan the next 30 days at {{company}}: touches, owners, the proof to send and the trigger that should change the plan.',
    },
  ],

  signedIn: [
    {
      domain: 'linkedin.com',
      label: 'LinkedIn',
      use: 'Contacts and likely buyers: titles, tenure, background, hiring and headcount.',
    },
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Funding rounds, investors, headcount and acquisitions.' },
    { domain: 'glassdoor.com', label: 'Glassdoor', use: 'Morale, layoffs and hiring signals; leadership reviews.' },
    { domain: 'g2.com', label: 'G2', use: 'Which vendors the account reviews or uses in your category, and what reviewers say.' },
  ],

  monitor: {
    query: '{{company}} funding, leadership changes, layoffs, acquisitions, product launches and new vendors',
    why: 'A trigger that changes the call or reopens a stalled deal.',
  },
};
