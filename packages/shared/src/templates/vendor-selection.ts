/**
 * Vendor / tool selection (P6.14): choose what to buy. Requirements and weights, the market, the shortlist compared on
 * the same criteria, pricing and three-year cost, reviews and references, security and viability, integration, risks
 * and lock-in, the questions to put to vendors and a recommendation. The human-readable version of this file is
 * docs/templates/vendor-selection.md (generated: `pnpm templates:docs`).
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
  sitesField,
  step,
  swot,
  tiersFor,
} from './kit-business.js';
import type { RedFlag, RubricDimension, TemplateSpecInput } from './schema.js';

// ---- the rubric (weights add up to 100) ----

export const VENDOR_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'function',
    name: 'Functional fit',
    weight: 30,
    anchors: {
      1: 'Misses a must-have.',
      3: 'Meets every must-have; some wants are partial.',
      5: 'Meets every must-have and most wants, verified in a demo or trial.',
    },
    frame: 'shortlist',
  },
  {
    id: 'cost',
    name: 'Cost and total cost of ownership',
    weight: 20,
    anchors: {
      1: 'Over budget, or the price is open-ended.',
      3: 'Within budget at the planned scale.',
      5: 'Clearly under budget with predictable growth in cost.',
    },
    frame: 'pricing',
  },
  {
    id: 'security',
    name: 'Security and compliance',
    weight: 15,
    anchors: {
      1: 'Required certifications or data residency missing.',
      3: 'Required certifications held; some gaps in documentation.',
      5: 'Certified, audited, with a clean record and a security pack ready.',
    },
    frame: 'trust',
  },
  {
    id: 'integration',
    name: 'Integration and implementation',
    weight: 15,
    anchors: {
      1: 'Custom build with no supported route.',
      3: 'Supported connectors, a plan of several weeks.',
      5: 'Native connectors for our stack and a proven fast rollout.',
    },
    frame: 'rollout',
  },
  {
    id: 'viability',
    name: 'Vendor viability and support',
    weight: 10,
    anchors: {
      1: 'Distressed, or support complaints are common.',
      3: 'Stable; support is adequate.',
      5: 'Profitable or well funded, with strong support and a clear roadmap.',
    },
    frame: 'trust',
  },
  {
    id: 'evidence',
    name: 'Reviews and references',
    weight: 10,
    anchors: {
      1: 'Poor or sparse reviews; no reference.',
      3: 'Good reviews; one reference.',
      5: 'Consistently strong reviews and references from companies like ours.',
    },
    frame: 'evidence',
  },
];

// ---- the red-flag checklist ----

export const VENDOR_RED_FLAGS: readonly RedFlag[] = [
  {
    id: 'RF01',
    text: 'A must-have rests on the vendor’s marketing page only, with no demo, docs or independent confirmation.',
    check: 'Read Requirements coverage: every must-have row needs Evidence that is not the vendor’s own sales material.',
  },
  {
    id: 'RF02',
    text: 'Opaque or open-ended pricing: usage overages, mandatory services, per-seat creep or price escalators.',
    check: 'Read Pricing and the TCO model for overage rates, minimums and annual uplift; compare list price with reviews of real bills.',
  },
  {
    id: 'RF03',
    text: 'Lock-in: no data export, a proprietary format, or fees to leave.',
    check: 'Look in the docs and contract terms for export formats, API coverage of all data and termination assistance.',
  },
  {
    id: 'RF04',
    text: 'Auto-renewal, a long minimum term or a large renewal uplift.',
    check: 'Read the Pricing rows for Contract term and Auto-renew and any quote in the materials.',
  },
  {
    id: 'RF05',
    text: 'A certification or data-residency requirement the vendor cannot show (for example SOC 2, ISO 27001, GDPR, a region).',
    check: 'Compare the constraints in the intake with Vendor viability › Certifications and Data residency; a missing proof is raised.',
  },
  {
    id: 'RF06',
    text: 'Vendor financial instability: layoffs, a down round, a pending sale or a recent ownership change.',
    check: 'Check Vendor viability and news for funding, layoffs and acquisitions in the last 18 months.',
  },
  {
    id: 'RF07',
    text: 'A pattern of complaints in reviews: support, billing, reliability or forced upgrades.',
    check: 'Read the Reviews database and the negative quotes; count recurring themes across sites.',
  },
  {
    id: 'RF08',
    text: 'A security incident or breach in the last three years.',
    check: 'Search breach news, status pages and the vendor trust centre; weigh how it was handled.',
  },
  {
    id: 'RF09',
    text: 'A weak SLA or a history of outages.',
    check: 'Read the status page history and the SLA terms: uptime, credits, support response times.',
  },
  {
    id: 'RF10',
    text: 'A key requirement depends on a roadmap promise (“coming soon”, “beta”).',
    check: 'Look for features marked beta, preview or planned in Requirements coverage and the vendor’s release notes.',
  },
  {
    id: 'RF11',
    text: 'The vendor is small or has few customers like us, so we would be a single point of its revenue or its reference.',
    check: 'Check headcount, customer count and the Reference customers; a vendor with no peer references is raised.',
  },
  {
    id: 'RF12',
    text: 'Implementation effort or change-management cost is underestimated.',
    check: 'Read Integration and rollout: effort missing, a High risk row or an item only the vendor can do.',
  },
];

export const VENDOR_SELECTION: TemplateSpecInput = {
  id: 'vendor-selection',
  label: 'Vendor / tool selection',
  dot: '#D97706',
  placeholder: 'What do you need to buy?',
  brief:
    'Choose a vendor or tool: ten numbered frames (the need, market landscape, shortlist comparison, pricing and total cost, ' +
    'reviews and references, security and viability, integration and rollout, risks and lock-in, questions for vendors, ' +
    'recommendation), the red-flag checklist, the weighted scorecard and a selection memo. Turn the requirements into weighted ' +
    'criteria first, find candidates with Parallel, compare finalists on the same evidence, price three years of ownership, ' +
    'and end with a recommendation (the winner and the runner-up, a proof of concept, keep looking, or do not buy).',
  titleFrom: 'Vendor selection: {{need}}',

  // ---- the intake form ----
  inputs: [
    {
      id: 'need',
      label: 'What you need to buy',
      kind: 'text',
      required: true,
      placeholder: 'A customer support platform',
      suggestions: [
        'CRM',
        'Support platform',
        'Observability',
        'HRIS',
        'Data warehouse',
        'Security tool',
        'Billing',
        'Marketing automation',
        'Project management',
        'AI coding assistant',
      ],
      maxLength: 120,
    },
    {
      id: 'requirements',
      label: 'Requirements',
      kind: 'longtext',
      required: true,
      placeholder: 'Shared inbox, SSO, a public API, EU data residency, 50 agents…',
      help: 'What it must do and what would be nice. orb turns it into weighted criteria.',
      maxLength: 2500,
    },
    {
      id: 'must_haves',
      label: 'Hard must-haves',
      kind: 'list',
      placeholder: 'Comma separated: SOC 2, SSO, EU data residency',
      help: 'A vendor that misses one is out.',
      maxLength: 800,
    },
    {
      id: 'budget',
      label: 'Budget',
      kind: 'text',
      placeholder: '$40k per year',
      group: 'scale',
      maxLength: 80,
    },
    {
      id: 'users',
      label: 'Users / scale',
      kind: 'text',
      placeholder: '50 agents, 200k tickets a year',
      group: 'scale',
      maxLength: 120,
    },
    {
      id: 'timeline',
      label: 'Decision / go-live',
      kind: 'text',
      placeholder: 'Decide by Dec 1, live by Q1',
      group: 'scale',
      maxLength: 120,
    },
    {
      id: 'current',
      label: 'What you use today',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Used as the baseline and for migration effort.',
      maxLength: 800,
    },
    {
      id: 'stack',
      label: 'Systems it must integrate with',
      kind: 'list',
      placeholder: 'Comma separated: Salesforce, Slack, Okta',
      maxLength: 800,
    },
    {
      id: 'vendors',
      label: 'Vendors you know',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout finds more.',
      maxLength: 800,
    },
    {
      id: 'constraints',
      label: 'Security, compliance and legal constraints',
      kind: 'longtext',
      placeholder: 'SOC 2 Type II, EU data residency, no US subprocessors…',
      maxLength: 1500,
    },
    {
      id: 'concerns',
      label: 'Specific concerns to probe',
      kind: 'longtext',
      placeholder: 'Lock-in, price creep, migration pain…',
      maxLength: 1500,
    },
    materialsField('Drop the requirements doc, an RFP, quotes, the current contract or usage exports (CSV, XLSX). Each becomes a card or database.'),
    depthField(),
    sitesField([
      { domain: 'g2.com', label: 'G2' },
      { domain: 'gartner.com', label: 'Gartner Peer Insights' },
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'crunchbase.com', label: 'Crunchbase' },
    ]),
  ],

  // ---- the ten frames ----
  frames: [
    {
      id: 'need',
      title: 'The need and criteria',
      color: 'signal',
      brief:
        'What is being bought, why now, for whom and at what scale; the budget and timeline; the must-haves and the wants ' +
        'turned into weighted criteria that add up to 100; the baseline of what is used today. Everything later is judged against ' +
        'this frame.',
      owners: ['orb'],
      targets: [
        { type: 'metric', min: 4, note: 'budget, scale, timeline, current spend' },
        { type: 'checklist', min: 2, note: 'must-haves and weighted wants' },
        { type: 'doc', min: 1, note: 'the need in one paragraph' },
      ],
      seeds: [
        {
          type: 'doc',
          data: {
            title: 'The need',
            body: 'We need: {{need}}.\n\nRequirements: {{requirements}}\n\nConstraints: {{constraints|none given.}}',
          },
          why: 'From your intake; orb refines it after the first pass.',
        },
        checklist('Must-haves (a vendor that misses one is out)', [
          '{{must_haves|orb proposes must-haves from the requirements.}}',
          'Fits the budget at the planned scale.',
          'Meets the security and compliance constraints.',
        ]),
        checklist(
          'Weighted wants',
          [
            'orb turns the requirements into 6 to 10 weighted criteria that add up to 100.',
          ],
          'orb replaces this with the weighted criteria; you adjust the weights.',
        ),
        metric('Budget', '{{budget|Annual budget, with the source.}}'),
        metric('Scale', '{{users|Users, volume and growth.}}'),
        metric('Decision date', '{{timeline|When the decision and go-live are due.}}'),
        metric('Current spend', 'What this costs today, with the period.'),
      ],
      room: 300,
    },
    {
      id: 'market',
      title: 'Market landscape',
      color: 'sky',
      brief:
        'The vendors that could meet the need: leaders, challengers, open-source and in-house options. For each: what it ' +
        'is, who it is for, size and funding, and why it is on or off the shortlist. Start from the vendors the user named, ' +
        'find the rest with Parallel entity discovery and cut to three to five finalists using the must-haves.',
      owners: ['scout'],
      targets: [
        { type: 'database', min: 1, note: 'Vendor longlist, at least 10 vendors' },
        { type: 'chart', min: 1, note: 'vendors by category or size' },
        { type: 'source', min: 4, note: 'including an analyst or independent landscape' },
      ],
      seeds: [
        db('Vendor longlist', 'longlist'),
        {
          type: 'chart',
          data: { title: 'Longlist by category', mark: 'bar', x: 'Category', y: 'Fit score' },
          db: 'longlist',
          why: 'Bound to Vendor longlist: it fills as rows arrive.',
        },
        question(
          'Which vendors are out on a must-have alone?',
          'Cut the longlist with evidence, not with the vendor’s own page.',
        ),
      ],
    },
    {
      id: 'shortlist',
      title: 'Shortlist comparison',
      color: 'rho',
      brief:
        'The three to five finalists compared requirement by requirement: for each requirement and vendor, full, partial, none ' +
        'or unknown, with the evidence (docs, demo, trial, review). One Product card per finalist, a weighted comparison matrix ' +
        'and a 2x2 of function against cost.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Requirements coverage' },
        { type: 'product', min: 3, note: 'one card per finalist' },
        { type: 'matrix', min: 1 },
        { type: 'framework', min: 1, note: 'the 2x2' },
      ],
      seeds: [
        db('Requirements coverage', 'coverage'),
        matrixSeed(
          'Finalist comparison',
          [
            ['Core functionality', 30],
            ['Ease of use', 15],
            ['Integrations', 20],
            ['Security and compliance', 20],
            ['Support', 15],
          ],
          ['Finalist A', 'Finalist B', 'Finalist C'],
        ),
        {
          type: 'framework',
          data: { title: 'Function against cost', variant: 'quadrant', xAxis: 'Total cost', yAxis: 'Functional fit', cells: {} },
          why: 'Placeholder: Builder places each finalist on the axes.',
        },
        hypothesis('One finalist is clearly best on the weighted criteria', 'The top score is ahead of the runner-up by more than the uncertainty in the scores.'),
      ],
    },
    {
      id: 'pricing',
      title: 'Pricing and total cost',
      color: 'sky',
      brief:
        'What each finalist really costs: list price, units and tiers, implementation, training, integration, support and ' +
        'growth, over three years at our scale. Mark what is list price, what is quoted and what is assumed; show contract ' +
        'term, auto-renewal and uplift.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 2, note: 'Pricing and TCO model' },
        { type: 'chart', min: 1, note: '3-year TCO by vendor, bound to the TCO database' },
        { type: 'math', min: 1, note: 'the cost formula' },
        { type: 'metric', min: 2 },
      ],
      seeds: [
        db('Pricing', 'pricing'),
        db('TCO model', 'tco'),
        metric('Cheapest finalist (3-year TCO)', 'Total over three years at our scale, with the assumptions.'),
        metric('Spread between finalists', 'Most expensive less cheapest, as a share of the cheapest.'),
        {
          type: 'chart',
          data: { title: '3-year total cost by vendor', mark: 'bar', x: 'Vendor', y: 'Total (USD)' },
          db: 'tco',
          why: 'Bound to the TCO model: it fills as rows arrive.',
        },
      ],
    },
    {
      id: 'evidence',
      title: 'Reviews and references',
      color: 'rho',
      brief:
        'What real users and customers say: review sites, forums, social posts and reference customers like us. Praise and ' +
        'complaints by theme, the rating and count per site, how recent they are, and who would give a candid reference.',
      owners: ['scout'],
      targets: [
        { type: 'database', min: 1, note: 'Reviews' },
        { type: 'quote', min: 6, note: 'at least 1 negative per finalist' },
        { type: 'source', min: 4 },
      ],
      seeds: [
        db('Reviews', 'reviews'),
        question(
          'Which complaints recur across sites?',
          'A theme that appears on three sites is a finding; one angry review is not.',
        ),
      ],
    },
    {
      id: 'trust',
      title: 'Security, compliance and viability',
      color: 'sky',
      brief:
        'Can we trust this vendor with our data and our business for five years: certifications, data residency and ' +
        'subprocessors, incidents, uptime and SLA, funding and ownership, headcount, customers and roadmap. Check each ' +
        'against our constraints.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Vendor viability' },
        { type: 'timeline', min: 1, note: 'incidents and ownership changes' },
        { type: 'source', min: 4, note: 'trust centres, status pages, filings' },
      ],
      seeds: [
        db('Vendor viability', 'viability'),
        {
          type: 'timeline',
          data: {
            title: 'Incidents and ownership changes',
            events: [
              {
                date: '{{year}}',
                label: 'Selection started',
                detail: 'Scout adds dated incidents, outages, funding and ownership events per finalist, each with a source.',
                source: { label: 'orb template' },
              },
            ],
          },
          why: 'Placeholder: dated events, each with a source.',
        },
        question(
          'Do the finalists meet every constraint, with proof?',
          'Constraints from the intake: {{constraints|none given}}.',
        ),
      ],
    },
    {
      id: 'rollout',
      title: 'Integration and rollout',
      color: 'rho',
      brief:
        'What it takes to get live: connectors for our stack, data migration from what we use today, security review, ' +
        'training, change management, effort in person-days and a realistic timeline per finalist. A diagram of how it fits ' +
        'with our systems and a proof-of-concept plan.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Integration and rollout' },
        { type: 'diagram', min: 1, note: 'how the finalist fits our stack' },
        { type: 'checklist', min: 1, note: 'the proof-of-concept plan' },
      ],
      seeds: [
        db('Integration and rollout', 'rollout'),
        checklist('Proof-of-concept plan', [
          'Agree 3 to 5 success tests drawn from the must-haves.',
          'Run each finalist on the same sample of our own data.',
          'Score each test with the same rubric and two reviewers.',
        ]),
      ],
    },
    {
      id: 'risks',
      title: 'Risks and lock-in',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. ' +
        'Also covers lock-in and the exit plan, price risk over the term, dependency on one vendor and the cost of being wrong.',
      owners: ['critic'],
      targets: [{ type: 'risk', min: 6, note: 'every checklist item cleared with a source or raised' }],
      seeds: [
        {
          type: 'checklist',
          data: {
            title: 'Red-flag checklist',
            items: VENDOR_RED_FLAGS.map((f, i) => ({ id: `rf${i + 1}`, text: `${f.id} ${f.text}`, done: false })),
          },
          why: 'Critic raises or clears each; you tick them off.',
        },
        emptyRisk('Functional'),
        emptyRisk('Cost'),
        emptyRisk('Security and compliance'),
        emptyRisk('Lock-in and exit'),
        emptyRisk('Implementation'),
      ],
    },
    {
      id: 'negotiation',
      title: 'Questions and negotiation',
      color: 'paper',
      brief:
        'What to put to each finalist before deciding: the questions that close the gaps (ranked, each linked to the gap or ' +
        'risk behind it), the vendors’ answers as they arrive, and the terms to negotiate (price, term, uplift cap, exit, SLA).',
      owners: ['critic', 'orb'],
      targets: [
        { type: 'checklist', min: 1, note: 'at least 10 ranked questions, each linked to its source card' },
        { type: 'database', min: 1, note: 'Vendor responses' },
      ],
      seeds: [
        db('Vendor responses', 'responses'),
        checklist('Questions for vendors', [
          'Your concerns to probe: {{concerns|none given yet}}',
          'Please send your security pack and the latest penetration-test summary.',
          'What is the price at 2x our volume, and what caps the annual uplift?',
          'How do we export all our data, and in what format, if we leave?',
        ]),
      ],
    },
    {
      id: 'decision',
      title: 'Scorecard and decision',
      color: 'signal',
      brief:
        'Score each finalist against the rubric with cited evidence, show the weighted totals side by side, the pros and ' +
        'cons of the leader and the runner-up, and recommend (buy the winner, run a proof of concept, keep looking, do not ' +
        'buy) with the conditions and the terms to hold.',
      owners: ['orb'],
      targets: [
        { type: 'matrix', min: 1, note: 'the filled scorecard, one column per finalist' },
        { type: 'decision', min: 1 },
        { type: 'framework', min: 1, note: 'pros and cons of the leader' },
      ],
      seeds: [
        {
          type: 'matrix',
          data: {
            title: 'Scorecard (rubric score x 2, so 10 is a 5)',
            criteria: VENDOR_RUBRIC.map((d) => ({ name: `${d.name} (${d.weight}%)`, weight: d.weight })),
            options: ['Finalist A', 'Finalist B', 'Finalist C'].map((name) => ({
              name,
              scores: VENDOR_RUBRIC.map(() => null),
            })),
          },
          why: 'orb renames the columns to the finalists and fills one score per dimension with cited evidence; you may override.',
        },
        proscons('The leading vendor: pros and cons'),
        swot('SWOT of the choice for {{need}}'),
        decisionSeed('Recommendation: {{need}}', [
          'Buy the winner',
          'Run a proof of concept first',
          'Keep looking',
          'Do not buy',
        ]),
      ],
    },
  ],

  // ---- the databases ----
  databases: [
    {
      key: 'longlist',
      name: 'Vendor longlist',
      frame: 'market',
      purpose: 'Every vendor that could meet the need. Discovered with find_entities, enriched with batch_enrich.',
      keyColumn: 'Vendor',
      columns: [
        { name: 'Vendor', type: 'text' },
        { name: 'URL', type: 'url' },
        {
          name: 'Category',
          type: 'enum',
          options: ['Leader', 'Challenger', 'Niche', 'Open source', 'Build in-house', 'Suite add-on'],
        },
        { name: 'HQ', type: 'text' },
        { name: 'Founded', type: 'number' },
        { name: 'Employees', type: 'number' },
        { name: 'Total funding', type: 'currency', note: 'US dollars; blank if public or bootstrapped.' },
        { name: 'Best for', type: 'text' },
        { name: 'Must-haves met', type: 'enum', options: ['All', 'Some', 'None', 'Unknown'] },
        { name: 'Fit score', type: 'rating', note: '1 (poor) to 5 (strong).' },
        { name: 'Shortlisted', type: 'boolean' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Fit score', dir: 'desc' }] },
        { name: 'By category', kind: 'board', group: 'Category' },
        { name: 'Shortlist', kind: 'table', filter: [{ column: 'Shortlisted', op: 'eq', value: true }] },
      ],
    },
    {
      key: 'coverage',
      name: 'Requirements coverage',
      frame: 'shortlist',
      purpose: 'One row per vendor and requirement: how well it meets it and the evidence.',
      keyColumn: 'Row',
      columns: [
        { name: 'Row', type: 'text', note: 'Vendor and requirement, for example "Acme: SSO".' },
        { name: 'Vendor', type: 'text' },
        { name: 'Requirement', type: 'text' },
        { name: 'Must-have', type: 'boolean' },
        { name: 'Weight', type: 'number', note: 'From the weighted criteria.' },
        { name: 'Support', type: 'enum', options: ['Full', 'Partial', 'None', 'Unknown'] },
        { name: 'Evidence', type: 'enum', options: ['Docs', 'Demo', 'Trial', 'Review', 'Vendor claim'] },
        { name: 'Source', type: 'url' },
        { name: 'Note', type: 'text' },
      ],
      views: [
        { name: 'All', kind: 'table', group: 'Vendor' },
        { name: 'By support', kind: 'board', group: 'Support' },
        { name: 'Vendor claims only', kind: 'table', filter: [{ column: 'Evidence', op: 'eq', value: 'Vendor claim' }] },
      ],
    },
    {
      key: 'pricing',
      name: 'Pricing',
      frame: 'pricing',
      purpose: 'Every price point found for each finalist: plan, unit, list or quoted, term and renewal terms.',
      keyColumn: 'Row',
      columns: [
        { name: 'Row', type: 'text', note: 'Vendor and plan, for example "Acme: Business".' },
        { name: 'Vendor', type: 'text' },
        { name: 'Plan', type: 'text' },
        { name: 'Unit price (USD)', type: 'currency' },
        { name: 'Unit', type: 'text', note: 'Per seat per month, per 1,000 events…' },
        { name: 'Basis', type: 'enum', options: ['List', 'Quoted', 'Estimated'] },
        { name: 'Contract term (months)', type: 'number' },
        { name: 'Auto-renew', type: 'boolean' },
        { name: 'Annual uplift (%)', type: 'number' },
        { name: 'Source', type: 'url' },
        { name: 'Note', type: 'text', note: 'Overages, minimums, add-ons.' },
      ],
      views: [
        { name: 'All', kind: 'table', group: 'Vendor' },
        { name: 'By basis', kind: 'board', group: 'Basis' },
        { name: 'Auto-renewing', kind: 'table', filter: [{ column: 'Auto-renew', op: 'eq', value: true }] },
      ],
    },
    {
      key: 'tco',
      name: 'TCO model',
      frame: 'pricing',
      purpose: 'Three years of cost per finalist at our scale, with the assumptions, so the total can be checked.',
      keyColumn: 'Vendor',
      columns: [
        { name: 'Vendor', type: 'text' },
        { name: 'Licence (USD)', type: 'currency', note: 'Three years at our scale.' },
        { name: 'Implementation (USD)', type: 'currency' },
        { name: 'Integration (USD)', type: 'currency' },
        { name: 'Training (USD)', type: 'currency' },
        { name: 'Support (USD)', type: 'currency' },
        { name: 'Total (USD)', type: 'currency' },
        { name: 'Within budget', type: 'boolean' },
        { name: 'Assumptions', type: 'text' },
      ],
      views: [
        { name: 'By total', kind: 'table', sort: [{ column: 'Total (USD)', dir: 'asc' }] },
        { name: 'Within budget', kind: 'table', filter: [{ column: 'Within budget', op: 'eq', value: true }] },
      ],
    },
    {
      key: 'reviews',
      name: 'Reviews',
      frame: 'evidence',
      purpose: 'Ratings and recurring themes per vendor and review site, and who could give a reference.',
      keyColumn: 'Row',
      columns: [
        { name: 'Row', type: 'text', note: 'Vendor and site, for example "Acme: G2".' },
        { name: 'Vendor', type: 'text' },
        { name: 'Site', type: 'text' },
        { name: 'Rating', type: 'number', note: 'Out of 5.' },
        { name: 'Reviews', type: 'number' },
        { name: 'Praised for', type: 'text' },
        { name: 'Complaints', type: 'text' },
        { name: 'Latest review', type: 'date' },
        { name: 'URL', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', group: 'Vendor' },
        { name: 'By rating', kind: 'table', sort: [{ column: 'Rating', dir: 'desc' }] },
      ],
    },
    {
      key: 'viability',
      name: 'Vendor viability',
      frame: 'trust',
      purpose: 'Security, compliance and financial health per finalist, checked against our constraints.',
      keyColumn: 'Vendor',
      columns: [
        { name: 'Vendor', type: 'text' },
        { name: 'Certifications', type: 'text', note: 'SOC 2, ISO 27001… as shown on the trust centre.' },
        { name: 'Meets constraints', type: 'enum', options: ['Yes', 'Partly', 'No', 'Unproven'] },
        { name: 'Data residency', type: 'text' },
        { name: 'Last incident', type: 'date' },
        { name: 'Uptime (12 months, %)', type: 'number' },
        { name: 'Employees', type: 'number' },
        { name: 'Customers', type: 'number' },
        { name: 'Funding / ownership', type: 'text' },
        { name: 'Flags', type: 'text', note: 'Layoffs, sale, breach, outage pattern.' },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By constraints', kind: 'board', group: 'Meets constraints' },
        { name: 'Flagged', kind: 'table', filter: [{ column: 'Flags', op: 'notEmpty' }] },
      ],
    },
    {
      key: 'rollout',
      name: 'Integration and rollout',
      frame: 'rollout',
      purpose: 'Each integration and migration step per finalist with method, effort, owner and risk.',
      keyColumn: 'Row',
      columns: [
        { name: 'Row', type: 'text', note: 'Vendor and system, for example "Acme: Salesforce".' },
        { name: 'Vendor', type: 'text' },
        { name: 'System', type: 'text' },
        { name: 'Method', type: 'enum', options: ['Native connector', 'API', 'Middleware', 'Custom build', 'Not possible'] },
        { name: 'Effort (days)', type: 'number' },
        { name: 'Owner', type: 'enum', options: ['Vendor', 'Us', 'Partner'] },
        { name: 'Risk', type: 'enum', options: ['Low', 'Medium', 'High'] },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', group: 'Vendor' },
        { name: 'By method', kind: 'board', group: 'Method' },
        { name: 'High risk', kind: 'table', filter: [{ column: 'Risk', op: 'eq', value: 'High' }] },
      ],
    },
    {
      key: 'responses',
      name: 'Vendor responses',
      frame: 'negotiation',
      purpose: 'Questions put to vendors and their answers, as they arrive.',
      keyColumn: 'Row',
      columns: [
        { name: 'Row', type: 'text', note: 'Vendor and question number.' },
        { name: 'Vendor', type: 'text' },
        { name: 'Question', type: 'text' },
        { name: 'Answer', type: 'text' },
        { name: 'Answered on', type: 'date' },
        { name: 'Satisfactory', type: 'enum', options: ['Yes', 'Partly', 'No', 'Waiting'] },
        { name: 'Source', type: 'url' },
      ],
      views: [
        { name: 'All', kind: 'table', group: 'Vendor' },
        { name: 'By status', kind: 'board', group: 'Satisfactory' },
      ],
    },
  ],

  // ---- the agent playbook ----
  plan: {
    orb: [
      step({
        id: 'criteria',
        text:
          'First, read the uploaded materials (the requirements doc, RFP, quotes, the current contract and usage exports: read_card and ' +
          'read_source for files, query_dataset for tables). Then turn the requirements into the weighted criteria: update the "Weighted ' +
          'wants" checklist with 6 to 10 criteria whose weights add up to 100, split the must-haves from the wants, and fill the Budget, ' +
          'Scale, Decision date and Current spend metrics. Ask the user (ask_user_question) only when a must-have is ambiguous.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'update_card', 'place_card', 'ask_user_question'],
        frames: ['need'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first (its eight-step playbook), with the criteria, the vendors the user named and the ticked ' +
          'signed-in sources in the instruction; Builder once Scout has the shortlist; Critic once Scout has sources to review. Name the ' +
          'frames each agent owns.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'shortlist',
        text:
          'When Scout has the longlist, decide the shortlist of three to five (those that meet every must-have with evidence) and message Scout ' +
          '(message_agent) with the names, because only Scout can tick Shortlisted on the rows it wrote. Rename the finalists in the comparison matrix ' +
          'and the Scorecard columns (update_card).',
        tools: ['query_dataset', 'message_agent', 'update_card'],
        frames: ['need'],
      }),
      step({
        id: 'gaps',
        text:
          'For a gap Scout could not close (a price that is not public, a certification, a migration path), run web_answer, then ' +
          'deep_research (core) on that one question. Ask the user before spend over $0.50.',
        tools: ['web_answer', 'deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'questions',
        text:
          'Keep the "Questions for vendors" checklist current: collect every unresolved Question card, rank them, link each to its source; ' +
          'record vendors’ answers the user pastes in Vendor responses (upsert_rows) and re-check the affected red flags with Critic.',
        tools: ['search_board', 'update_card', 'add_link', 'upsert_rows', 'message_agent'],
        frames: ['negotiation'],
      }),
      step({
        id: 'score',
        text:
          'At the end, fill the Scorecard matrix: one 1-to-5 score per rubric dimension and finalist (doubled on the matrix), each with at ' +
          'least one cited card in the why line. Then the pros and cons of the leader, the SWOT of the choice and the Decision card: your ' +
          'proposed option and the weighted totals in its rationale. The user decides.',
        tools: ['query_board', 'query_dataset', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['decision'],
      }),
      step({
        id: 'memo',
        text: 'Write the selection memo with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only.',
        tools: ['compose_section'],
      }),
      step({
        id: 'monitor',
        text: 'Only when the user asks to keep watching the finalists (a long procurement): watch_topic with the vendor names and the monitor query. Monitors cost money on every check, so each is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'baseline',
        text:
          'Start from what the user named: the vendors they know and what they use today. Read each vendor’s home, product, pricing, ' +
          'security or trust, integrations and docs pages (fetch_url, parallel_extract). Capture the pricing and product pages ' +
          '(capture_page) as image cards. Add each named vendor to Vendor longlist (upsert_rows, key Vendor).',
        tools: ['fetch_url', 'parallel_extract', 'capture_page', 'place_card', 'upsert_rows'],
        frames: ['market', 'shortlist'],
      }),
      step({
        id: 'longlist',
        text:
          'Longlist: find_entities for vendors in the category that serve our scale and constraints (the match limit follows the depth ' +
          'tier); it fills its own database card in this frame. batch_enrich fills category, HQ, founded, employees, funding and best-for; ' +
          'consolidate into Vendor longlist with query_dataset and upsert_rows. Add one analyst or independent landscape as a source card, ' +
          'and set Must-haves met per vendor from its docs (Unknown if not checked).',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'fetch_url', 'query_dataset', 'upsert_rows', 'place_card'],
        frames: ['market'],
      }),
      step({
        id: 'coverage',
        text:
          'Requirements coverage for each finalist: one row per vendor and requirement (upsert_rows, key Row) with Support and Evidence. ' +
          'Prefer docs, release notes and trials over the marketing page; mark a vendor’s own claim as "Vendor claim". One Product card per ' +
          'finalist with pricing, strengths and weaknesses.',
        tools: ['fetch_url', 'parallel_extract', 'web_search', 'place_card', 'upsert_rows'],
        frames: ['shortlist'],
      }),
      step({
        id: 'pricing',
        text:
          'Pricing: public price pages, marketplace listings, reviews that mention bills and any quote in the materials. One Pricing row per ' +
          'plan with the Basis (List, Quoted, Estimated), term, auto-renew and uplift; then one TCO model row per finalist for three years at ' +
          'our scale with every assumption written in Assumptions (upsert_rows).',
        tools: ['fetch_url', 'parallel_extract', 'web_search', 'place_card', 'upsert_rows'],
        frames: ['pricing'],
      }),
      step({
        id: 'reviews',
        text:
          'Reviews and references: G2, Gartner Peer Insights, Capterra, Reddit and vendor case studies (use fetch_signed_in for G2 or Gartner if ' +
          'connected). One Reviews row per vendor and site with rating, count, praise and complaints; quote cards, with at least one negative ' +
          'per finalist; and reference customers of our size as source cards.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['evidence'],
      }),
      step({
        id: 'trust',
        text:
          'Security, compliance and viability: the trust centre, status page history, subprocessor list, funding and headcount (Crunchbase or ' +
          'LinkedIn if connected). One Vendor viability row per finalist with Meets constraints set against the intake constraints; dated ' +
          'incidents and ownership changes on the timeline. A claim with no proof is Unproven.',
        tools: ['fetch_signed_in', 'web_search', 'fetch_url', 'place_card', 'upsert_rows'],
        frames: ['trust'],
      }),
      step({
        id: 'integration',
        text:
          'Integration and rollout: the connectors and docs for each system in our stack, migration tools from what we use today and ' +
          'implementation timelines in case studies. One Integration and rollout row per vendor and system (upsert_rows).',
        tools: ['fetch_url', 'parallel_extract', 'web_search', 'place_card', 'upsert_rows'],
        frames: ['rollout'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain (a hidden price, a certification, a migration path): deep_research (core or above, per the tier), one question per run. Ask before spend over $0.50.',
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
        frames: ['risks', 'trust'],
      }),
      step({
        id: 'claims',
        text:
          'Challenge every requirement marked Full on a Vendor claim alone and every price with Basis "List" or "Estimated": link a "tension" ' +
          'to the card that disagrees, or place a Question asking for the proof. Check that the finalists were not cut on a must-have that ' +
          'rests on a vendor claim.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['shortlist'],
      }),
      step({
        id: 'vendor-questions',
        text: 'Turn every gap into an item of the "Questions for vendors" checklist or a Question card in Questions and negotiation, ranked, with a link to the card or gap that prompted it.',
        tools: ['place_card', 'add_link'],
        frames: ['negotiation'],
      }),
      step({
        id: 'report',
        text: 'Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised.',
        tools: ['report_progress', 'send_message'],
      }),
    ],
    builder: [
      step({
        id: 'compare',
        text: 'The "Finalist comparison" matrix (weighted criteria, scores 0 to 10 from Requirements coverage, Reviews and Vendor viability) and the function-against-cost 2x2.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['shortlist'],
      }),
      step({
        id: 'cost',
        text: 'The 3-year total-cost chart bound to the TCO model, the cost formula as a Math card, and a Table card of list price against quoted price when quotes exist.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['pricing'],
      }),
      step({
        id: 'architecture',
        text: 'A diagram of how the leading finalist fits our stack (systems, data flows, who connects what) from Integration and rollout.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['rollout'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual summary (a design frame): the need, the finalists, the scores, the cost and the recommendation, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...VENDOR_RUBRIC],
  redFlags: [...VENDOR_RED_FLAGS],

  // ---- the output ----
  output: {
    memoTitle: 'Vendor selection memo: {{need}}',
    citationRule:
      'Every paragraph cites cards; every price says whether it is list, quoted or estimated; every capability says whether it is verified or a vendor claim.',
    sections: [
      {
        id: 'summary',
        title: 'Recommendation',
        frames: ['decision', 'risks'],
        words: 150,
        guidance: 'The recommended vendor and runner-up, the score, three reasons, the cost and the top three risks, in at most 150 words.',
      },
      {
        id: 'need',
        title: 'The need and criteria',
        frames: ['need'],
        guidance: 'What is being bought, the budget and timeline, the must-haves and the weighted criteria.',
      },
      {
        id: 'market',
        title: 'Market landscape',
        frames: ['market'],
        guidance: 'The longlist by category, how it was cut and why the finalists are the finalists, with the chart.',
      },
      {
        id: 'shortlist',
        title: 'Shortlist comparison',
        frames: ['shortlist'],
        guidance: 'The finalists side by side: requirement coverage, the comparison matrix and the 2x2.',
      },
      {
        id: 'pricing',
        title: 'Pricing and total cost',
        frames: ['pricing'],
        guidance: 'Three-year cost per finalist with the assumptions and the chart; contract terms and renewal.',
      },
      {
        id: 'evidence',
        title: 'Reviews and references',
        frames: ['evidence'],
        guidance: 'What users and references say per finalist, praise and complaints by theme.',
      },
      {
        id: 'trust',
        title: 'Security, compliance and viability',
        frames: ['trust'],
        guidance: 'Certifications, residency, incidents, uptime and financial health, against our constraints.',
      },
      {
        id: 'rollout',
        title: 'Integration and rollout',
        frames: ['rollout'],
        guidance: 'Connectors, migration, effort and timeline, with the diagram and the proof-of-concept plan.',
      },
      {
        id: 'risks',
        title: 'Risks and lock-in',
        frames: ['risks'],
        guidance: 'The red-flag outcomes: each raised flag with its mitigant, the cleared ones in one line, and the exit plan.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard',
        frames: ['decision'],
        guidance: 'The rubric table: each dimension, its weight, each finalist’s score and the evidence.',
      },
      {
        id: 'next',
        title: 'Negotiation and next steps',
        frames: ['negotiation'],
        guidance: 'The terms to negotiate, the ranked questions for vendors and the proposed next step.',
      },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'One-page summary: {{need}}',
      includes: ['The need', 'Finalists and scores', 'Cost', 'Recommendation', 'Top risks', 'Next step'],
    },
    deckFormat: 'vendor-selection',
  },

  tiers: tiersFor({ subject: 'vendor selection', standardRuns: 2, deepRuns: 6 }),

  followUps: [
    {
      label: 'Draft the RFP',
      prompt: 'Draft an RFP for {{need}} from the criteria and must-haves on this board, with the questions each vendor must answer.',
    },
    {
      label: 'Compare [vendor] head to head',
      prompt: 'Compare [vendor] head to head with the current leader for {{need}}: function, price, security and what users complain about.',
    },
    {
      label: 'Plan the proof of concept',
      prompt: 'Plan the proof of concept for {{need}}: tests, sample data, owners, a two-week schedule and the pass mark for each test.',
    },
    {
      label: 'Negotiation brief',
      prompt: 'Write the negotiation brief for the winning vendor for {{need}}: price at 2x volume, term, uplift cap, exit and SLA, with our fallback on each.',
    },
    {
      label: 'Change a weight and re-score',
      prompt: 'Change the weight of [criterion] to [weight] and re-score the finalists for {{need}}; say whether the ranking changes.',
    },
    {
      label: 'Write the rollout plan',
      prompt: 'Write the rollout plan for the chosen vendor for {{need}}: migration, integration, training and the first 90 days.',
    },
  ],

  signedIn: [
    { domain: 'g2.com', label: 'G2', use: 'Ratings, reviews and the category grid for the longlist and finalists.' },
    {
      domain: 'gartner.com',
      label: 'Gartner Peer Insights',
      use: 'Peer reviews and the analyst view of the vendors in the category.',
    },
    {
      domain: 'linkedin.com',
      label: 'LinkedIn',
      use: 'Vendor headcount and hiring, and the people at companies like ours who use it.',
    },
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Vendor funding, ownership and acquisitions.' },
  ],

  monitor: {
    query: '{{need}} vendor pricing changes, acquisitions, outages, breaches and layoffs among the shortlisted vendors',
    why: 'News that changes a vendor’s price, safety or survival during a long procurement.',
  },
};
