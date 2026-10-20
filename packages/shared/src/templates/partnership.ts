/**
 * Partnership evaluation (P6.14): should we partner with this company, on what terms, and what could go wrong. Strategic
 * fit, the partner's health, market access, integration effort, economics and terms, their track record, alternatives,
 * risks and the plan. The human-readable version of this file is docs/templates/partnership.md
 * (generated: `pnpm templates:docs`).
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
  quadrant,
  scorecardSeed,
  sitesField,
  step,
  swot,
  tiersFor,
  timelineSeed,
} from './kit-business.js';
import type { RedFlag, RubricDimension, TemplateSpecInput } from './schema.js';

// ---- the rubric (weights add up to 100) ----

export const PARTNERSHIP_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'fit',
    name: 'Strategic fit',
    weight: 25,
    anchors: {
      1: 'The partnership does not move a goal that matters.',
      3: 'It supports a goal, but other routes would too.',
      5: 'It is the best route to a top goal, and the partner wants the same outcome.',
    },
    frame: 'fit',
  },
  {
    id: 'access',
    name: 'Market access and complementarity',
    weight: 20,
    anchors: {
      1: 'Same customers and same product: a duplicate.',
      3: 'Some new reach or a useful extra capability.',
      5: 'A large new segment or capability we cannot build or buy quickly.',
    },
    frame: 'market',
  },
  {
    id: 'health',
    name: 'Partner health and reputation',
    weight: 15,
    anchors: {
      1: 'Distressed, or a record of damaging partners.',
      3: 'Stable; mixed references.',
      5: 'Growing, well funded and praised by past partners.',
    },
    frame: 'health',
  },
  {
    id: 'economics',
    name: 'Economics',
    weight: 15,
    anchors: {
      1: 'Loses money in every scenario.',
      3: 'Break-even in the base case within 18 months.',
      5: 'Clear margin in the base case, with upside and low commitments.',
    },
    frame: 'terms',
  },
  {
    id: 'execution',
    name: 'Execution feasibility',
    weight: 15,
    anchors: {
      1: 'Heavy integration, unclear owners.',
      3: 'Moderate work with named owners on both sides.',
      5: 'Light integration, an executive sponsor on each side and a launch plan.',
    },
    frame: 'product',
  },
  {
    id: 'conflict',
    name: 'Alignment and conflict risk',
    weight: 10,
    anchors: {
      1: 'Channel conflict or exclusivity that blocks our core business.',
      3: 'Some overlap that clear rules can manage.',
      5: 'Incentives line up; no conflict with our other partners or customers.',
    },
    frame: 'risks',
  },
];

// ---- the red-flag checklist ----

export const PARTNERSHIP_RED_FLAGS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: 'Partner financial distress: a down round, layoffs, going-concern language or missed payments.',
    check: 'Read the Partner financials database and the health timeline; search funding and layoff news.',
  },
  {
    id: 'RF02',
    text: 'The partner also works with, or is owned by, our direct competitor.',
    check: 'Check Their partnerships and the ownership and investor list; a competitor on either is raised.',
  },
  {
    id: 'RF03',
    text: 'Channel conflict: the partner sells a product that competes with ours, or sells to our customers directly.',
    check: 'Compare the partner product pages with ours and read Customer overlap for shared accounts.',
  },
  {
    id: 'RF04',
    text: 'The partner asks for exclusivity, a minimum commitment or a most-favoured-nation clause.',
    check: 'Read the proposed terms (materials, Terms database); raise each clause that restricts us or commits spend.',
  },
  {
    id: 'RF05',
    text: 'A pattern of past partners leaving badly: public disputes, ended partnerships or complaints.',
    check: 'Read Their partnerships for Ended or Dormant rows and search for disputes, reviews and partner forums.',
  },
  {
    id: 'RF06',
    text: 'Unclear IP, data-sharing or customer-ownership rights.',
    check: 'Look in the terms and the integration requirements for joint IP, data access and who owns the customer.',
  },
  {
    id: 'RF07',
    text: 'Over-dependence: more than a quarter of our plan rests on this one partner.',
    check: 'Compare the deal scenarios with our plan or revenue; if it is not knowable, raise a Question.',
  },
  {
    id: 'RF08',
    text: 'The executive sponsor has left, or leadership changed recently, on either side.',
    check: 'Check the Snapshot and health timeline for leadership moves; ask who owns the relationship on each side.',
  },
  {
    id: 'RF09',
    text: 'A change-of-control, termination or assignment clause that lets the partner leave when acquired.',
    check: 'Read the proposed terms for change-of-control and termination rights; note the notice period.',
  },
  {
    id: 'RF10',
    text: 'Regulatory, antitrust or data-protection exposure from the arrangement.',
    check: 'Search for rules in the partner sector and region; raise any that need a filing, consent or a data agreement.',
  },
  {
    id: 'RF11',
    text: 'Reputational risk: lawsuits, controversies, security incidents or bad press.',
    check: 'Search litigation, incident and press items; weigh them against the brand we would be tied to.',
  },
  {
    id: 'RF12',
    text: 'Integration effort that is underestimated or has a hard dependency outside our control.',
    check: 'Read Integration requirements: effort missing, a Risk of High, or an item owned only by the partner.',
  },
];

export const PARTNERSHIP: TemplateSpecInput = {
  id: 'partnership',
  label: 'Partnership evaluation',
  dot: '#7C3AED',
  placeholder: 'Which company are you considering partnering with?',
  brief:
    'Evaluate a partnership with a company: eleven numbered frames (snapshot, strategic fit, partner health, market ' +
    'access, product and integration, economics and terms, track record, alternatives, risks, plan, decision), the ' +
    'red-flag checklist, the weighted scorecard and a partnership memo. Say what each side wants and brings, test the ' +
    'partner with independent sources, model the deal in scenarios, compare the alternatives and end with a recommendation ' +
    '(Proceed, Proceed with conditions, Renegotiate, Decline).',
  titleFrom: '{{partner}}: partnership evaluation',

  // ---- the intake form ----
  inputs: [
    {
      id: 'partner',
      label: 'Partner company',
      kind: 'text',
      required: true,
      placeholder: 'Initech',
      maxLength: 120,
    },
    {
      id: 'website',
      label: 'Website URL',
      kind: 'url',
      required: true,
      placeholder: 'https://initech.com',
      maxLength: 300,
    },
    {
      id: 'kind',
      label: 'Kind of partnership',
      kind: 'select',
      required: true,
      options: [
        'Channel / reseller',
        'Technology integration',
        'Co-marketing',
        'Co-development',
        'Distribution',
        'Joint venture',
        'Strategic alliance',
        'Referral',
      ],
      maxLength: 40,
    },
    {
      id: 'goal',
      label: 'What you want from it',
      kind: 'longtext',
      required: true,
      placeholder: 'Reach mid-market banks through their channel without building a sales team',
      maxLength: 1500,
    },
    {
      id: 'ours',
      label: 'What you bring',
      kind: 'longtext',
      placeholder: 'Our product, customers, brand, data…',
      maxLength: 1500,
    },
    {
      id: 'terms',
      label: 'Proposed terms (if any)',
      kind: 'longtext',
      placeholder: 'Revenue share, exclusivity, term, minimums…',
      maxLength: 1500,
    },
    {
      id: 'commitment',
      label: 'Our commitment',
      kind: 'text',
      placeholder: '2 engineers for 6 months, $200k',
      group: 'deal',
      maxLength: 120,
    },
    {
      id: 'timeline',
      label: 'Decision by',
      kind: 'text',
      placeholder: '2026-12-01',
      group: 'deal',
      maxLength: 60,
    },
    {
      id: 'contacts',
      label: 'People on their side',
      kind: 'people',
      placeholder: 'One per line: Name, title, LinkedIn URL',
      help: 'Optional.',
      maxLength: 1500,
    },
    {
      id: 'alternatives',
      label: 'Alternatives you know',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout finds more.',
      maxLength: 800,
    },
    {
      id: 'concerns',
      label: 'Specific concerns to probe',
      kind: 'longtext',
      placeholder: 'Channel conflict, their financial position, exclusivity…',
      maxLength: 1500,
    },
    materialsField('Drop the proposal, term sheet, an NDA summary, partner decks or call notes. Each becomes a card or database.'),
    depthField(),
    sitesField([
      { domain: 'crunchbase.com', label: 'Crunchbase' },
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'pitchbook.com', label: 'PitchBook' },
      { domain: 'g2.com', label: 'G2' },
    ]),
  ],

  // ---- the eleven frames ----
  frames: [
    {
      id: 'snapshot',
      title: 'Partner snapshot',
      color: 'signal',
      brief:
        'Who {{partner}} is in one sentence: what it sells, to whom, HQ, size, growth, funding or revenue, leadership, ' +
        'ownership and investors, and the kind of partnership proposed. Every figure has a date and a source.',
      owners: ['orb'],
      targets: [
        { type: 'metric', min: 6 },
        { type: 'entity', min: 1, note: 'the partner' },
        { type: 'doc', min: 1, note: 'the one-liner' },
      ],
      seeds: [
        {
          type: 'entity',
          data: {
            title: '{{partner}}',
            kind: 'org',
            url: '{{website}}',
            body: 'The proposed partner, from your intake.',
            facts: [
              { label: 'Kind', value: '{{kind|to confirm}}' },
              { label: 'Our commitment', value: '{{commitment|to confirm}}' },
              { label: 'Decision by', value: '{{timeline|not set}}' },
            ],
          },
          why: 'The partner, from your intake.',
        },
        {
          type: 'doc',
          data: {
            title: 'One-liner',
            body: 'What {{partner}} does and what a partnership would be, in one sentence. orb writes it after the first pass.',
          },
          why: 'The one-sentence description.',
        },
        metric('Employees', 'Headcount now, with the source and date.'),
        metric('Revenue or funding', 'Revenue (public) or total funding (private), with the period.'),
        metric('Growth', 'Revenue or customer growth, with the period.'),
        metric('Customers', 'Customers or users, with how they count them.'),
        metric('Partners', 'Number of partners or integrations they list.'),
        metric('Founded', 'Year of founding.'),
      ],
      room: 360,
    },
    {
      id: 'fit',
      title: 'Strategic fit',
      color: 'sky',
      brief:
        'Why this partnership: the goal on our side, what the partner wants from it, what each brings, where interests ' +
        'overlap and where they diverge, and whether a partnership is the right route compared with building, buying or ' +
        'going alone. Test each assumption with evidence.',
      owners: ['scout', 'critic', 'builder'],
      targets: [
        { type: 'hypothesis', min: 3, note: 'with evidence links' },
        { type: 'framework', min: 2, note: 'pros and cons; the build-buy-partner 2x2' },
        { type: 'insight', min: 2, note: 'each cites 2 or more cards' },
      ],
      seeds: [
        hypothesis(
          'This partnership gets us what we want: {{goal}}',
          'Link the cards that show the partner can deliver it and the cards that contradict it.',
        ),
        hypothesis(
          '{{partner}} wants this as much as we do',
          'The partner has a reason, a budget and an owner for the partnership.',
        ),
        hypothesis(
          'Partnering beats building or buying',
          'Speed, cost and control compared with the alternatives.',
        ),
        proscons('Partnering: pros and cons'),
        quadrant('Build, buy or partner', 'Speed to market', 'Control over the outcome'),
      ],
    },
    {
      id: 'health',
      title: 'Partner health and reputation',
      color: 'rho',
      brief:
        'Is the partner a safe bet: financial position and runway, growth, leadership stability, product momentum, ' +
        'customer satisfaction, security record, litigation and press. Separate what the partner reports from what outside ' +
        'sources show, and date every item.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Partner financials' },
        { type: 'timeline', min: 1, note: 'funding, leadership and news events' },
        { type: 'quote', min: 3, note: 'including 1 negative' },
        { type: 'source', min: 4 },
      ],
      seeds: [
        db('Partner financials', 'financials'),
        timelineSeed('Partner timeline', 'Evaluation started', 'Scout adds dated events (funding, leadership, launches, incidents), each with a source.'),
        question(
          'Can the partner afford to deliver this?',
          'Runway, headcount for the partnership and what happens if they lose their lead investor or champion.',
        ),
      ],
    },
    {
      id: 'market',
      title: 'Market access and customers',
      color: 'sky',
      brief:
        'What the partner adds to our reach: its customers, segments, regions and channels, the overlap with ours, the ' +
        'new accounts it could open and a size for the opportunity with the method stated.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Customer overlap' },
        { type: 'chart', min: 1, note: 'overlap or reach, bound to the database' },
        { type: 'metric', min: 3, note: 'reach, overlap and opportunity size' },
        { type: 'source', min: 3 },
      ],
      seeds: [
        db('Customer overlap', 'overlap'),
        metric('Partner reach', 'Customers or users the partner reaches that we do not.'),
        metric('Customer overlap', 'Share of its customers that are already ours, with the method.'),
        metric('Opportunity size', 'Annual revenue a partnership could add, with the assumptions.'),
        {
          type: 'chart',
          data: { title: 'Opportunity by segment', mark: 'bar', x: 'Segment', y: 'Opportunity (USD)' },
          db: 'overlap',
          why: 'Bound to Customer overlap: it fills as rows arrive.',
        },
      ],
    },
    {
      id: 'product',
      title: 'Product and integration',
      color: 'rho',
      brief:
        'What the partnership needs technically and operationally: the APIs, data flows, branding and support model, who ' +
        'builds what, the effort in person-days, the dependencies and the security and compliance review each side will ' +
        'run. A diagram of how the two products fit together.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Integration requirements' },
        { type: 'diagram', min: 1, note: 'how the products connect' },
        { type: 'source', min: 3, note: 'API docs, marketplace and integration pages' },
        { type: 'image', min: 2, note: 'screenshots of their partner programme' },
      ],
      seeds: [
        db('Integration requirements', 'integration'),
        question(
          'What is the smallest integration that proves the partnership?',
          'A thin first version that tests demand before the full build.',
        ),
      ],
    },
    {
      id: 'terms',
      title: 'Economics and terms',
      color: 'sky',
      brief:
        'The money and the contract: revenue share, fees, minimums, exclusivity, term and exit, who owns the customer ' +
        'and the data. Model at least three scenarios (low, base, high) with our cost, break-even and margin, and compare ' +
        'each term with the market standard.',
      owners: ['orb', 'builder', 'scout'],
      targets: [
        { type: 'database', min: 2, note: 'Deal scenarios and Terms' },
        { type: 'chart', min: 1, note: 'scenario margins, bound to Deal scenarios' },
        { type: 'math', min: 1, note: 'the break-even' },
        { type: 'metric', min: 2 },
      ],
      seeds: [
        db('Deal scenarios', 'scenarios'),
        db('Terms', 'terms'),
        metric('Break-even', 'Month in which cumulative margin turns positive in the base case.'),
        metric('Base-case margin', 'Annual margin after revenue share and our cost, with the assumptions.'),
        {
          type: 'chart',
          data: { title: 'Margin by scenario', mark: 'bar', x: 'Scenario', y: 'Margin (USD)' },
          db: 'scenarios',
          why: 'Bound to Deal scenarios: it fills as rows arrive.',
        },
      ],
    },
    {
      id: 'track',
      title: 'Partnership track record',
      color: 'rho',
      brief:
        "How the partner's other partnerships went: who they partnered with, since when, what was achieved, which ended " +
        'and why, and what those partners say. Look for partner programme terms, a partner portal and public disputes.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Their partnerships' },
        { type: 'quote', min: 3, note: 'partners in their own words' },
        { type: 'source', min: 3 },
      ],
      seeds: [
        db('Their partnerships', 'partnerships'),
        question(
          'Which of their partners would give us a candid reference?',
          'One active partner and one that ended, if there is one.',
        ),
      ],
    },
    {
      id: 'alternatives',
      title: 'Alternative partners',
      color: 'sky',
      brief:
        'Who else could deliver the same outcome: direct alternatives, adjacent companies and doing it ourselves. Compare ' +
        'them on the same criteria so the choice is clear, and say why this partner beats or loses to each.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'at least 6 alternatives' },
        { type: 'matrix', min: 1 },
        { type: 'framework', min: 1, note: 'the 2x2' },
      ],
      seeds: [
        db('Alternative partners', 'alternatives'),
        matrixSeed(
          'Partner comparison',
          [
            ['Reach', 25],
            ['Capability fit', 25],
            ['Financial strength', 15],
            ['Terms', 20],
            ['Ease of working together', 15],
          ],
          ['{{partner}}', 'Alternative A', 'Alternative B'],
        ),
        quadrant('Alternatives on reach and fit', 'Reach', 'Capability fit'),
      ],
    },
    {
      id: 'risks',
      title: 'Risks and red flags',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. ' +
        'Also covers channel conflict, dependency, IP and data rights, exit and the reputational risk of being tied to this partner.',
      owners: ['critic'],
      targets: [{ type: 'risk', min: 6, note: 'every checklist item cleared with a source or raised' }],
      seeds: [
        {
          type: 'checklist',
          data: {
            title: 'Red-flag checklist',
            items: PARTNERSHIP_RED_FLAGS.map((f, i) => ({ id: `rf${i + 1}`, text: `${f.id} ${f.text}`, done: false })),
          },
          why: 'Critic raises or clears each; you tick them off.',
        },
        emptyRisk('Strategic'),
        emptyRisk('Financial'),
        emptyRisk('Channel conflict'),
        emptyRisk('Legal and IP'),
        emptyRisk('Execution'),
      ],
    },
    {
      id: 'plan',
      title: 'Governance and plan',
      color: 'paper',
      brief:
        'If we proceed: the owners on each side, the first 30, 60 and 90 days, the success metrics and the review dates, ' +
        'the escalation path and the exit conditions. Turn every unresolved Question on the board into a question for the partner.',
      owners: ['orb', 'critic'],
      targets: [
        { type: 'checklist', min: 2, note: 'the 90-day plan and the questions for the partner' },
        { type: 'timeline', min: 1, note: 'milestones' },
      ],
      seeds: [
        checklist('90-day plan', [
          'Name an executive sponsor and a day-to-day owner on each side.',
          'Agree the success metrics and the review dates.',
          'Run the smallest integration that proves demand.',
          'Decide the exit conditions before signing.',
        ]),
        checklist('Questions for the partner', [
          'Your concerns to probe: {{concerns|none given yet}}',
          'Who owns the relationship on your side, and what are they measured on?',
          'Which of your other partners overlap with us, and how do you handle it?',
        ]),
        timelineSeed('Milestones', 'Decision due', 'orb adds the milestones: legal, build, launch, first review.'),
      ],
    },
    {
      id: 'decision',
      title: 'Thesis and decision',
      color: 'signal',
      brief:
        'The case for and against, the key hypotheses with confidence, what must be true, the scoring against the rubric, ' +
        'and a recommendation (Proceed, Proceed with conditions, Renegotiate, Decline) with the conditions and the terms ' +
        'to hold.',
      owners: ['orb'],
      targets: [
        { type: 'framework', min: 1, note: 'SWOT' },
        { type: 'decision', min: 1 },
        { type: 'matrix', min: 1, note: 'the filled scorecard' },
      ],
      seeds: [
        swot('SWOT: partnering with {{partner}}'),
        scorecardSeed(PARTNERSHIP_RUBRIC, '{{partner}}'),
        decisionSeed('Recommendation on {{partner}}', ['Proceed', 'Proceed with conditions', 'Renegotiate', 'Decline']),
      ],
    },
  ],

  // ---- the databases ----
  databases: [
    {
      key: 'financials',
      name: 'Partner financials',
      frame: 'health',
      purpose: 'Every figure about the partner’s size and health with its period, whether reported or estimated, and its source.',
      keyColumn: 'Metric',
      columns: [
        { name: 'Metric', type: 'text' },
        { name: 'Value', type: 'number' },
        { name: 'Period', type: 'date', note: 'ISO date or year-month.' },
        { name: 'Basis', type: 'enum', options: ['Reported', 'Estimated', 'Third party'] },
        { name: 'Trend', type: 'enum', options: ['Up', 'Flat', 'Down', 'Unknown'] },
        { name: 'Source', type: 'url' },
        { name: 'Note', type: 'text' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Period', dir: 'asc' }] },
        { name: 'By basis', kind: 'board', group: 'Basis' },
      ],
    },
    {
      key: 'overlap',
      name: 'Customer overlap',
      frame: 'market',
      purpose: 'Segments and regions the partner reaches, against ours, with the size of the opportunity in each.',
      keyColumn: 'Segment',
      columns: [
        { name: 'Segment', type: 'text' },
        { name: 'Region', type: 'text' },
        { name: 'Partner customers', type: 'number' },
        { name: 'Our customers', type: 'number' },
        { name: 'Overlap', type: 'enum', options: ['None', 'Low', 'Medium', 'High'] },
        { name: 'Opportunity (USD)', type: 'currency', note: 'Annual, with the method in Note.' },
        { name: 'Source', type: 'url' },
        { name: 'Note', type: 'text' },
      ],
      views: [
        { name: 'By opportunity', kind: 'table', sort: [{ column: 'Opportunity (USD)', dir: 'desc' }] },
        { name: 'By overlap', kind: 'board', group: 'Overlap' },
      ],
    },
    {
      key: 'integration',
      name: 'Integration requirements',
      frame: 'product',
      purpose: 'Everything that has to be built, connected or agreed for the partnership to work, with owner, effort and risk.',
      keyColumn: 'Item',
      columns: [
        { name: 'Item', type: 'text' },
        { name: 'Type', type: 'enum', options: ['API', 'Data', 'UX', 'Branding', 'Support', 'Security', 'Legal'] },
        { name: 'Owner', type: 'enum', options: ['Us', 'Partner', 'Both'] },
        { name: 'Effort (days)', type: 'number' },
        { name: 'Risk', type: 'enum', options: ['Low', 'Medium', 'High'] },
        { name: 'Depends on', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By owner', kind: 'board', group: 'Owner' },
        { name: 'High risk', kind: 'table', filter: [{ column: 'Risk', op: 'eq', value: 'High' }] },
      ],
    },
    {
      key: 'scenarios',
      name: 'Deal scenarios',
      frame: 'terms',
      purpose: 'Low, base and high scenarios of the deal with revenue, cost and margin, so the economics can be checked.',
      keyColumn: 'Scenario',
      columns: [
        { name: 'Scenario', type: 'text' },
        { name: 'Partner-sourced revenue (USD)', type: 'currency' },
        { name: 'Revenue share (%)', type: 'number' },
        { name: 'Our cost (USD)', type: 'currency', note: 'Build, support and sales cost in the period.' },
        { name: 'Margin (USD)', type: 'currency' },
        { name: 'Break-even (months)', type: 'number' },
        { name: 'Assumptions', type: 'text' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By margin', kind: 'table', sort: [{ column: 'Margin (USD)', dir: 'desc' }] },
      ],
    },
    {
      key: 'terms',
      name: 'Terms',
      frame: 'terms',
      purpose: 'Each term of the deal: what we want, what they offered, the market standard and how much it matters.',
      keyColumn: 'Term',
      columns: [
        { name: 'Term', type: 'text' },
        { name: 'Our position', type: 'text' },
        { name: 'Their position', type: 'text' },
        { name: 'Market standard', type: 'text' },
        { name: 'Priority', type: 'enum', options: ['Must have', 'Important', 'Nice to have'] },
        { name: 'Status', type: 'enum', options: ['Open', 'Agreed', 'Disputed'] },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By status', kind: 'board', group: 'Status' },
        { name: 'Must have', kind: 'table', filter: [{ column: 'Priority', op: 'eq', value: 'Must have' }] },
      ],
    },
    {
      key: 'partnerships',
      name: 'Their partnerships',
      frame: 'track',
      purpose: 'The partner’s existing and past partnerships and how each went.',
      keyColumn: 'Partner',
      columns: [
        { name: 'Partner', type: 'text' },
        { name: 'Kind', type: 'text' },
        { name: 'Since', type: 'date' },
        { name: 'Status', type: 'enum', options: ['Active', 'Ended', 'Dormant', 'Unknown'] },
        { name: 'Outcome', type: 'text' },
        { name: 'Competes with us', type: 'boolean' },
        { name: 'Source', type: 'url' },
        { name: 'Quote', type: 'text' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By status', kind: 'board', group: 'Status' },
        { name: 'Competitors of ours', kind: 'table', filter: [{ column: 'Competes with us', op: 'eq', value: true }] },
      ],
    },
    {
      key: 'alternatives',
      name: 'Alternative partners',
      frame: 'alternatives',
      purpose: 'Other companies that could deliver the same outcome. Discovered with find_entities, enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'URL', type: 'url' },
        { name: 'Kind', type: 'enum', options: ['Direct alternative', 'Adjacent', 'Build ourselves', 'Acquire'] },
        { name: 'HQ', type: 'text' },
        { name: 'Size', type: 'text' },
        { name: 'Reach', type: 'text' },
        { name: 'Capability fit', type: 'rating', note: '1 (weak) to 5 (strong).' },
        { name: 'Why not', type: 'text' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Capability fit', dir: 'desc' }] },
        { name: 'By kind', kind: 'board', group: 'Kind' },
        { name: 'Strong fit', kind: 'table', filter: [{ column: 'Capability fit', op: 'gte', value: 4 }] },
      ],
    },
  ],

  // ---- the agent playbook ----
  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first: the proposal, the term sheet, decks and call notes (read_card and read_source for ' +
          'files, query_dataset for tables). Put every proposed term in the Terms database (upsert_rows, Their position) and ' +
          'every stated figure in Deal scenarios. Hand Scout the contacts, the alternatives the user knows and the ticked signed-in ' +
          'sources in its delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['terms'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first (its eight-step playbook), Builder once Scout has placed its first sources, Critic once ' +
          'Scout has sources to review. Name the frames each agent owns.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'snapshot',
        text:
          "After Scout's first pass, fill the Partner snapshot metrics and the one-liner (update_card on the placeholders), each " +
          'with a cited figure and date. Never write a figure you cannot source.',
        tools: ['query_board', 'search_board', 'update_card'],
        frames: ['snapshot'],
      }),
      step({
        id: 'economics',
        text:
          'Build the deal model: one row per scenario in Deal scenarios (low, base, high; upsert_rows) from the stated terms, the ' +
          'opportunity size and our cost; update the Break-even and Base-case margin metrics and the break-even Math card; say which ' +
          'inputs are assumptions. Compare each term with the market standard in Terms.',
        tools: ['query_dataset', 'upsert_rows', 'update_card', 'place_card'],
        frames: ['terms'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (the partner’s runway, a market-standard term, an ended partnership), run web_answer, then deep_research (core) on that one question. Ask the user before spend over $0.50.',
        tools: ['web_answer', 'deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'rubric',
        text:
          'At the end, fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least ' +
          'one cited card in the why line. Then the SWOT, the hypotheses in Strategic fit (evidence for and against as card ids) and ' +
          'the Decision card: your proposed option and the weighted total in its rationale.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['decision', 'fit'],
      }),
      step({
        id: 'plan',
        text:
          'Write the plan: the 90-day checklist (owners, metrics, review dates), the milestones on the timeline and the "Questions ' +
          'for the partner" list, collecting every unresolved Question card from the other frames, ranked, each linked to its source.',
        tools: ['search_board', 'update_card', 'place_card', 'add_link'],
        frames: ['plan'],
      }),
      step({
        id: 'memo',
        text: 'Write the memo with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only.',
        tools: ['compose_section'],
      }),
      step({
        id: 'monitor',
        text: 'Only when the user asks to keep watching the partner: watch_topic with the partner name and the monitor query. Monitors cost money on every check, so each is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'partner-site',
        text:
          'The partner site: home, about, customers, partners and integrations, pricing and the partner-programme pages (fetch_url, ' +
          'parallel_extract). Capture the partner-programme and marketplace pages (capture_page) as image cards. Place an Entity card ' +
          'for the partner and the snapshot facts.',
        tools: ['fetch_url', 'parallel_extract', 'capture_page', 'place_card'],
        frames: ['snapshot', 'product', 'market'],
      }),
      step({
        id: 'health',
        text:
          'Health: funding and leadership (Crunchbase or PitchBook if connected, fetch_signed_in; press otherwise), headcount and hiring ' +
          '(LinkedIn if connected), customer reviews and any layoffs, lawsuits or incidents. One Partner financials row per figure ' +
          '(upsert_rows, key Metric, Basis set), dated events on the Partner timeline and quote cards, with at least one negative.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['health'],
      }),
      step({
        id: 'market-access',
        text:
          'Reach and overlap: the partner’s customers, segments and regions from its site, case studies and review sites; ours from the ' +
          'user’s materials. One Customer overlap row per segment (upsert_rows) with the opportunity and the method.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'place_card', 'upsert_rows'],
        frames: ['market'],
      }),
      step({
        id: 'integration',
        text:
          'Integration: the partner’s API docs, marketplace and existing integrations (fetch_url, parallel_extract). One Integration ' +
          'requirements row per item with type, owner, effort and risk (upsert_rows); the sources as source cards.',
        tools: ['fetch_url', 'parallel_extract', 'web_search', 'place_card', 'upsert_rows'],
        frames: ['product'],
      }),
      step({
        id: 'track-record',
        text:
          'Track record: the partner directory, press releases and partner announcements. One Their partnerships row per partner with ' +
          'status (Active, Ended, Dormant) and whether it competes with us; what partners say as quote cards; disputes and ended ' +
          'partnerships found by search.',
        tools: ['web_search', 'fetch_url', 'fetch_signed_in', 'place_card', 'upsert_rows'],
        frames: ['track'],
      }),
      step({
        id: 'terms-standard',
        text: 'Market standard: search for typical revenue shares, exclusivity and term for this kind of partnership; write the figure and the source in the Market standard column of the Terms rows (upsert_rows).',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'upsert_rows'],
        frames: ['terms'],
      }),
      step({
        id: 'alternatives',
        text:
          'Alternatives: add the ones the user knows first. find_entities discovers more (the match limit follows the depth tier); it ' +
          'fills its own database card in this frame. batch_enrich fills in kind, HQ, size and reach; consolidate into Alternative partners ' +
          'with query_dataset and upsert_rows, with a Capability fit rating each.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'query_dataset', 'upsert_rows', 'place_card'],
        frames: ['alternatives'],
      }),
      step({
        id: 'strategic-fit',
        text:
          'Fit evidence: for each hypothesis in Strategic fit place the evidence as quote or source cards and link them (add_link). Also ' +
          'sweep for litigation, incidents, layoffs and competitor ties so Critic has sources to clear or raise each flag.',
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
          'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence ' +
          'and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source cards that clear it. ' +
          'Never leave a flag silent; if nothing was searched, say so and ask Scout for the search.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['risks', 'health', 'track'],
      }),
      step({
        id: 'fit-test',
        text:
          'Test strategic fit: place an Insight (two or more citations) for each hypothesis; link a "tension" from any card that disagrees. ' +
          'Check that the partner’s stated goals and its Their partnerships rows agree with the claim that it wants this as much as we do.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['fit', 'alternatives'],
      }),
      step({
        id: 'questions',
        text: 'Turn every gap into an item of the "Questions for the partner" checklist (place_card on the checklist or a Question card), with a link to the card or gap that prompted it.',
        tools: ['place_card', 'add_link'],
        frames: ['plan'],
      }),
      step({
        id: 'report',
        text: 'Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised.',
        tools: ['report_progress', 'send_message'],
      }),
    ],
    builder: [
      step({
        id: 'fit-frameworks',
        text: 'The "Partnering: pros and cons" framework and the build-buy-partner 2x2, each item citing a card in Strategic fit.',
        tools: ['place_card', 'query_board', 'read_card'],
        frames: ['fit'],
      }),
      step({
        id: 'charts',
        text: 'Charts: opportunity by segment bound to Customer overlap and margin by scenario bound to Deal scenarios; the break-even as a Math card from the scenario rows.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['market', 'terms'],
      }),
      step({
        id: 'architecture',
        text: 'A diagram of how the two products connect (data flows, who builds what) from Integration requirements, and a design frame of the joint customer journey when it helps.',
        tools: ['place_card', 'write_design_frame', 'query_dataset', 'read_card'],
        frames: ['product'],
      }),
      step({
        id: 'compare',
        text: 'The partner comparison matrix (weighted criteria, scores 0 to 10 from Alternative partners) and the alternatives 2x2.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['alternatives'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual summary (a design frame): partner, score, recommendation, the economics and the top risks, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...PARTNERSHIP_RUBRIC],
  redFlags: [...PARTNERSHIP_RED_FLAGS],

  // ---- the output ----
  output: {
    memoTitle: 'Partnership evaluation: {{partner}}',
    citationRule:
      'Every paragraph cites cards; every figure cites its source and date; what the partner claims is marked as claimed and what outside sources show as verified; every assumption in the deal model is labelled.',
    sections: [
      {
        id: 'summary',
        title: 'Summary and recommendation',
        frames: ['decision', 'risks'],
        words: 150,
        guidance: 'The recommendation, the score, the top 3 reasons, the top 3 risks and the conditions, in at most 150 words.',
      },
      {
        id: 'snapshot',
        title: 'The partner',
        frames: ['snapshot'],
        guidance: 'A table of the snapshot metrics: what they do, size, funding, customers, partners.',
      },
      {
        id: 'fit',
        title: 'Strategic fit',
        frames: ['fit'],
        guidance: 'What each side wants and brings, the hypotheses and their evidence, and why partnering beats building or buying.',
      },
      {
        id: 'health',
        title: 'Partner health and reputation',
        frames: ['health'],
        guidance: 'Financial position, momentum, leadership, reviews and incidents, with the timeline.',
      },
      {
        id: 'market',
        title: 'Market access and customers',
        frames: ['market'],
        guidance: 'The reach the partner adds, the overlap and the opportunity size with the method and the chart.',
      },
      {
        id: 'product',
        title: 'Product and integration',
        frames: ['product'],
        guidance: 'What has to be built, by whom, the effort and the dependencies, with the diagram.',
      },
      {
        id: 'terms',
        title: 'Economics and terms',
        frames: ['terms'],
        guidance: 'The scenarios, the break-even and each term against the market standard, with the chart.',
      },
      {
        id: 'track',
        title: 'Track record',
        frames: ['track'],
        guidance: 'Their other partnerships, how they went and what partners say.',
      },
      {
        id: 'alternatives',
        title: 'Alternatives',
        frames: ['alternatives'],
        guidance: 'The alternatives compared on the same criteria, and where this partner wins and loses.',
      },
      {
        id: 'risks',
        title: 'Risks and mitigants',
        frames: ['risks'],
        guidance: 'The red-flag outcomes: each raised flag with its mitigant, the cleared ones in one line.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard',
        frames: ['decision'],
        guidance: 'The rubric table: each dimension, its weight, its score and its evidence.',
      },
      {
        id: 'next',
        title: 'Plan and next steps',
        frames: ['plan'],
        guidance: 'The 90-day plan, the questions for the partner and the proposed next step.',
      },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{partner}}',
      includes: ['The partner', 'Score', 'Recommendation', 'Economics', 'Top risks', 'Next step'],
    },
    deckFormat: 'partnership-review',
  },

  tiers: tiersFor({ subject: 'partnership evaluation', standardRuns: 2, deepRuns: 6 }),

  followUps: [
    {
      label: 'Negotiation brief',
      prompt: 'Write the negotiation brief for {{partner}}: the terms that matter most, our fallback on each, theirs, and the trade we offer.',
    },
    {
      label: 'Go deeper on [alternative]',
      prompt: 'Go deeper on [alternative] as a replacement for {{partner}}: reach, capability, terms and how it compares on the scorecard.',
    },
    {
      label: 'Stress-test the economics',
      prompt: 'Stress-test the deal economics with {{partner}}: halve the partner-sourced revenue, double our cost and show what happens to the break-even.',
    },
    {
      label: 'Draft the partner call agenda',
      prompt: 'Draft the agenda for the next call with {{partner}}: ordered questions with a time for each, linked to the gaps and risks on the board.',
    },
    {
      label: 'Draft the term-sheet outline',
      prompt: 'Draft a term-sheet outline for the partnership with {{partner}} from the Terms database and the risks raised.',
    },
    {
      label: 'Re-score after their answers',
      prompt: 'I added their answers. Re-score the rubric, say which scores moved and why, and update the decision.',
    },
  ],

  signedIn: [
    {
      domain: 'crunchbase.com',
      label: 'Crunchbase',
      use: 'Funding, investors, acquisitions and leadership of the partner and its alternatives.',
    },
    {
      domain: 'linkedin.com',
      label: 'LinkedIn',
      use: 'Leadership backgrounds, tenure, headcount and hiring on the partner side.',
    },
    { domain: 'pitchbook.com', label: 'PitchBook', use: 'Valuations, ownership and comparable deals.' },
    { domain: 'g2.com', label: 'G2', use: 'What the partner’s customers and partners say in reviews.' },
  ],

  monitor: {
    query: '{{partner}} funding, leadership changes, layoffs, acquisitions, lawsuits and new partnerships',
    why: 'News that would change the partnership decision or the terms.',
  },
};
