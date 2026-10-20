/**
 * Product teardown (P6.13, startup / product): the v1 "UI research" template (id `ui`, kept so saved canvases still
 * open) merged with product teardown into one v2 playbook. Human-readable spec: docs/templates/ui.md (generated:
 * `pnpm templates:docs`).
 *
 * Parallel use: find_entities and batch_enrich find comparable products to benchmark, deep_research closes gaps on the
 * product's history, a monitor (Orb, on request) watches its changelog and pricing. Screens come from capture_page.
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
  timeline,
} from './kit.js';

export const UI_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'clarity',
    name: 'Clarity',
    weight: 20,
    anchors: {
      1: 'A new user cannot tell what to do.',
      3: 'The main path is clear; secondary ones are not.',
      5: 'Every screen has one obvious next step.',
    },
    frame: 'flows',
  },
  {
    id: 'efficiency',
    name: 'Efficiency',
    weight: 20,
    anchors: {
      1: 'Many steps and forms before value.',
      3: 'A reasonable path with some friction.',
      5: 'Value in the fewest steps, with smart defaults.',
    },
    frame: 'flows',
  },
  {
    id: 'consistency',
    name: 'Consistency',
    weight: 15,
    anchors: {
      1: 'Components and wording differ screen to screen.',
      3: 'A shared style with some drift.',
      5: 'A coherent system across every screen.',
    },
    frame: 'patterns',
  },
  {
    id: 'access',
    name: 'Accessibility',
    weight: 15,
    anchors: {
      1: 'Fails contrast, keyboard or labels widely.',
      3: 'Mostly passes, with gaps.',
      5: 'Meets WCAG AA in the checked flows.',
    },
    frame: 'findings',
  },
  {
    id: 'conversion',
    name: 'Conversion design',
    weight: 20,
    anchors: {
      1: 'The paywall or sign-up blocks value.',
      3: 'A standard funnel.',
      5: 'Value shown before the ask; the ask is clear and honest.',
    },
    frame: 'business',
  },
  {
    id: 'delight',
    name: 'Brand and delight',
    weight: 10,
    anchors: {
      1: 'Generic, no point of view.',
      3: 'A recognisable style.',
      5: 'Distinct moments of craft that users mention.',
    },
    frame: 'copy',
  },
];

export const UI_RED_FLAGS = redFlags([
  [
    'A dark pattern: forced continuity, hidden costs, confirmshaming or a hard-to-find cancel path.',
    'Walk the sign-up, upgrade and cancel flows in the Flow steps database; quote the screen and copy.',
  ],
  [
    'Onboarding takes more than five steps before the user sees value.',
    'Count the steps in the onboarding flow up to the first useful result.',
  ],
  [
    'A paywall or sign-up wall appears before any value.',
    'Check the first-run screens and the paywall placement in the Screen inventory.',
  ],
  [
    'Text or controls fail colour contrast or have no keyboard path.',
    'Read the accessibility notes in Findings; compare text and background colours against WCAG AA (4.5 to 1).',
  ],
  [
    'Error messages blame the user or say nothing useful.',
    'Quote the error and empty-state copy from the copy frame.',
  ],
  [
    'Components, spacing or wording are inconsistent across screens.',
    'Compare the UI patterns database rows for the same pattern appearing in different forms.',
  ],
  [
    'Mobile and desktop differ in capability or flow without a reason.',
    'Compare the Screen inventory rows per platform when more than one platform was captured.',
  ],
  [
    'A finding rests on one screenshot of one version.',
    'Check the capture date and version of each screen; a finding on an old or single capture is marked and a Question asks for a recheck.',
  ],
  [
    'The product depends on a platform or API that could change the flow.',
    'Look in the tech notes and sources for a single dependency the flow cannot work without.',
  ],
  [
    'A pattern we plan to adopt is protected (brand, trade dress, patent).',
    'Before a pattern is marked Adopt, check the sources for protection; copy the idea and never the assets.',
  ],
]);

export const PRODUCT_TEARDOWN: TemplateSpecInput = {
  id: 'ui',
  label: 'Product teardown',
  dot: '#2563EB',
  placeholder: 'Which product or flow do you want to take apart?',
  brief:
    'Take a product apart: capture its screens, map its key flows step by step, list the patterns and the copy, ' +
    'read its business model and growth loops, evaluate it against usability and accessibility heuristics, compare ' +
    'it with the product you care about, and turn the lessons into mockups and a short list of what to adopt and ' +
    'avoid. Every finding cites a screenshot; lessons borrow ideas, never assets.',
  titleFrom: '{{product}}: product teardown',

  inputs: [
    {
      id: 'product',
      label: 'Product to tear down',
      kind: 'text',
      required: true,
      placeholder: 'Linear',
      maxLength: 70,
    },
    {
      id: 'website',
      label: 'Website URL',
      kind: 'url',
      required: true,
      placeholder: 'https://linear.app',
      maxLength: 300,
    },
    {
      id: 'focus',
      label: 'Flow or feature to focus on',
      kind: 'text',
      placeholder: 'Onboarding and the first project',
      maxLength: 200,
    },
    {
      id: 'goal',
      label: 'Why you are doing it',
      kind: 'select',
      options: ['Learn from a leader', 'Benchmark against our product', 'Inspiration for a redesign', 'Diligence on a product'],
      maxLength: 40,
    },
    {
      id: 'platform',
      label: 'Platform',
      kind: 'select',
      options: ['Web app', 'iOS', 'Android', 'Desktop', 'Marketing site', 'Several'],
      maxLength: 40,
    },
    {
      id: 'ours',
      label: 'Your product (to compare with)',
      kind: 'text',
      placeholder: 'Acme Tasks',
      maxLength: 70,
    },
    {
      id: 'competitors',
      label: 'Other products to compare',
      kind: 'list',
      placeholder: 'Comma separated',
      help: 'Optional. Scout finds more on Standard and Deep.',
      maxLength: 800,
    },
    materialsField(
      'Drop screenshots, screen recordings\' summaries, a PDF of the flow, analytics exports (CSV or XLSX) or your own product\'s screens. Each becomes a card or database; screenshots go to the Screens frame.',
    ),
    depthField,
    sitesField([
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'g2.com', label: 'G2' },
      { domain: 'similarweb.com', label: 'SimilarWeb' },
    ]),
  ],

  frames: [
    {
      id: 'overview',
      title: 'Overview',
      color: 'signal',
      brief:
        'What {{product}} is: who it is for, what it does in a sentence, the platforms, the pricing headline, ' +
        'the company behind it and why it is worth taking apart ({{goal|goal to confirm}}). Focus: {{focus|the whole ' +
        'product}}.',
      owners: ['orb', 'scout'],
      targets: [
        { type: 'product', min: 1, note: 'the product, kind product' },
        { type: 'metric', min: 4 },
        { type: 'source', min: 3 },
      ],
      seeds: [
        {
          type: 'product',
          data: {
            title: '{{product}}',
            kind: 'product',
            url: '{{website}}',
            body: 'The product under teardown, from your intake. Focus: {{focus|the whole product}}.',
            facts: [
              { label: 'Platform', value: '{{platform|to confirm}}' },
              { label: 'Goal', value: '{{goal|to confirm}}' },
              { label: 'Compared with', value: '{{ours|not given}}' },
            ],
          },
          why: 'The product, from your intake.',
        },
        metric('Entry price', 'The cheapest paid plan and the unit, with the date.'),
        metric('Store rating', 'Rating and number of reviews in the app store or G2, with the date.'),
        metric('Steps to first value', 'Counted from the first screen to the first useful result.'),
        metric('Screens captured', 'Screens in the Screen inventory.'),
        question('What does this product do better than anyone, and why does it matter to us?'),
      ],
      room: 300,
    },
    {
      id: 'screens',
      title: 'Screens',
      color: 'sky',
      brief:
        'Every screen of the flows in focus, in order: a screenshot (capture_page for public pages; dropped images for ' +
        'logged-in ones) and a row in the Screen inventory with its purpose, key elements, the pattern it uses and ' +
        'the capture date and version. Screens the user dropped stay in the Overview frame, where they were dropped: log each one here.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'image', min: 12, note: 'screens in flow order' },
        { type: 'database', min: 1, note: 'Screen inventory' },
      ],
      seeds: [db('Screen inventory', 'screens')],
    },
    {
      id: 'flows',
      title: 'Flows',
      color: 'rho',
      brief:
        'The key flows step by step: onboarding, the core action, upgrade and cancel. Per step the screen, what ' +
        'the user does, what the system does and the friction (1 to 5). Draw each flow as a diagram and say where ' +
        'users are likely to drop off.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Flow steps' },
        { type: 'diagram', min: 3, note: 'onboarding, core action, upgrade' },
        { type: 'chart', min: 1, note: 'friction by step' },
      ],
      seeds: [
        db('Flow steps', 'steps'),
        chart('Friction by step', 'steps', 'bar', 'Step', 'Friction', 'Flow'),
      ],
    },
    {
      id: 'ia',
      title: 'Information architecture',
      color: 'sky',
      brief:
        'How the product is organised: the sitemap, the navigation model (tabs, sidebar, command bar), what is one ' +
        'click away and what is buried, and how a new user finds things. Draw the sitemap.',
      owners: ['builder', 'scout'],
      targets: [
        { type: 'diagram', min: 1, note: 'the sitemap' },
        { type: 'source', min: 2 },
      ],
      seeds: [question('What is the primary navigation, and what does it say the product is about?')],
    },
    {
      id: 'patterns',
      title: 'Patterns & components',
      color: 'rho',
      brief:
        'The recurring patterns and components worth naming: empty states, onboarding checklists, command palettes, ' +
        'inline editing, progress, upsells. Per pattern where it appears, why it works, who else uses it and whether ' +
        'to adopt it. Recreate the best two as design frames.',
      owners: ['builder', 'scout'],
      targets: [
        { type: 'database', min: 1, note: 'UI patterns, at least 10 rows' },
        { type: 'design', min: 2, note: 'recreated patterns' },
      ],
      seeds: [db('UI patterns', 'patterns'), framework('Patterns: adopt and avoid', 'proscons')],
    },
    {
      id: 'copy',
      title: 'Copy & microcopy',
      color: 'sky',
      brief:
        'How the product talks: headlines, button labels, empty states, error messages, confirmations, tone. Quote ' +
        'the best and the worst, each with its screen.',
      owners: ['scout'],
      targets: [{ type: 'quote', min: 8, note: 'at least 2 error or empty-state messages' }],
      seeds: [question('What is the voice of the product, in three words?')],
    },
    {
      id: 'business',
      title: 'Business model & growth loops',
      color: 'rho',
      brief:
        'How the product makes money and grows: plans and the paywall, trial and free tier, sharing and invite loops, ' +
        'integrations and templates that bring users in, and where upgrades are prompted. Dated changes (launches, ' +
        'pricing changes) on a timeline.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'timeline', min: 1, note: 'product changes' },
        { type: 'framework', min: 1, note: 'pros and cons of the model' },
        { type: 'source', min: 4 },
      ],
      seeds: [
        timeline('Product changes', 'Teardown started', 'Scout adds dated launches and pricing changes, each with a source.'),
        framework('Business model: pros and cons', 'proscons'),
        hypothesis('The main growth loop is sharing, not paid acquisition', 'Test against the invite flows and the sources.'),
      ],
    },
    {
      id: 'tech',
      title: 'Tech & performance',
      color: 'sky',
      brief:
        'What can be learned from public signals: front-end stack and libraries from the page source, load behaviour, ' +
        'offline and mobile support, integrations and API. Say how each fact was found; make no claim about private ' +
        'systems.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'source', min: 3 },
        { type: 'code', min: 1, note: 'a public snippet that shows the pattern' },
      ],
      seeds: [question('What does the page source tell us about how the front end is built?')],
    },
    {
      id: 'findings',
      title: 'Heuristic evaluation',
      color: 'paper',
      brief:
        'Evaluate the flows against Nielsen\'s ten heuristics plus accessibility and trust: a row per finding with ' +
        'the heuristic, the screen, the severity (1 to 5), the observation, the screenshot and a recommendation. Then ' +
        'work through the red-flag checklist.',
      owners: ['critic', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Findings, at least 15 rows' },
        { type: 'risk', min: 5, note: 'every checklist item cleared with a source or raised' },
      ],
      seeds: [
        db('Findings', 'findings'),
        checklist(
          'Red-flag checklist',
          UI_RED_FLAGS.map((f) => `${f.id} ${f.text}`),
          'Critic raises or clears each; you tick them off.',
        ),
        emptyRisk('Dark patterns'),
        emptyRisk('Accessibility'),
        emptyRisk('Consistency'),
      ],
    },
    {
      id: 'compare',
      title: 'Comparison',
      color: 'rho',
      brief:
        'How {{product}} stacks up against {{ours|your product}} and the other products on the flows that matter: a ' +
        'weighted matrix and the biggest gaps, from the Screen inventory and Findings.',
      owners: ['builder', 'scout'],
      targets: [
        { type: 'matrix', min: 1, note: 'weighted flow comparison' },
        { type: 'chart', min: 1, note: 'findings by severity' },
        { type: 'product', min: 2, note: 'the products compared' },
      ],
      seeds: [
        matrix(
          'Flow comparison',
          [
            { name: 'Time to first value', weight: 30 },
            { name: 'Clarity of the main action', weight: 25 },
            { name: 'Consistency', weight: 15 },
            { name: 'Accessibility', weight: 15 },
            { name: 'Upgrade honesty', weight: 15 },
          ],
          ['{{product}}', '{{ours|Our product}}', 'Other'],
          'Placeholder: weighted criteria, scored from the Screen inventory and Findings.',
        ),
        chart('Findings by severity', 'findings', 'bar', 'Severity', undefined, 'Heuristic'),
      ],
    },
    {
      id: 'lessons',
      title: 'Lessons & mockups',
      color: 'signal',
      brief:
        'What to take from the teardown: the lessons ranked by impact, the patterns to adopt and avoid, and mockups ' +
        'that apply them to {{ours|your product}}. Mockups copy ideas, not branded assets. Score {{product}} against ' +
        'the rubric with cited screenshots.',
      owners: ['orb', 'builder'],
      targets: [
        { type: 'insight', min: 5, note: 'each citing at least 2 cards' },
        { type: 'design', min: 2, note: 'mockups' },
        { type: 'decision', min: 1 },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
      ],
      seeds: [
        {
          type: 'decision',
          data: {
            title: 'What should we take from {{product}}?',
            body: 'Open. orb proposes after the rubric is filled.',
            options: [
              { label: 'Adopt the onboarding pattern' },
              { label: 'Adopt the navigation model' },
              { label: 'Adopt the upgrade pattern' },
              { label: 'Learn from it but do nothing' },
            ],
            status: 'open',
          },
          why: 'Open decision: you choose; orb proposes.',
        },
        matrix(
          'UX quality (rubric score x 2, so 10 is a 5)',
          UI_RUBRIC.map((d) => ({ name: `${d.name} (${d.weight}%)`, weight: d.weight })),
          ['orb score', 'Your score'],
          'orb fills one score per dimension with cited evidence; you may override.',
        ),
        checklist('Adopt or avoid', [
          'Pattern to adopt: (add one)',
          'Pattern to avoid: (add one)',
          'Experiment to run on our product: (add one)',
        ]),
      ],
    },
  ],

  databases: [
    {
      key: 'screens',
      name: 'Screen inventory',
      frame: 'screens',
      purpose: 'Every captured screen in flow order.',
      keyColumn: 'Screen',
      columns: [
        { name: 'Screen', type: 'text', note: 'A short name, numbered in flow order.' },
        { name: 'Flow', type: 'text' },
        { name: 'URL or path', type: 'url' },
        { name: 'Purpose', type: 'text' },
        { name: 'Key elements', type: 'text' },
        { name: 'Pattern', type: 'text' },
        { name: 'Platform', type: 'enum', options: ['Web', 'iOS', 'Android', 'Desktop'] },
        { name: 'Captured on', type: 'date' },
        { name: 'Version', type: 'text', note: 'App version or release date, if shown.' },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By flow', kind: 'table', group: 'Flow' },
        { name: 'Gallery', kind: 'gallery' },
      ],
    },
    {
      key: 'steps',
      name: 'Flow steps',
      frame: 'flows',
      purpose: 'Each step of each flow with the friction it adds.',
      keyColumn: 'Step',
      columns: [
        { name: 'Flow', type: 'enum', options: ['Onboarding', 'Core action', 'Upgrade', 'Cancel', 'Other'] },
        { name: 'Step', type: 'text', note: 'Numbered, for example 3. Choose a template.' },
        { name: 'Screen', type: 'text', note: 'The name in the Screen inventory.' },
        { name: 'User action', type: 'text' },
        { name: 'System response', type: 'text' },
        { name: 'Friction', type: 'rating', note: '1 (none) to 5 (likely drop-off).' },
        { name: 'Note', type: 'text' },
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Step', dir: 'asc' }] },
        { name: 'By flow', kind: 'table', group: 'Flow' },
        { name: 'High friction', kind: 'table', filter: [{ column: 'Friction', op: 'gte', value: 4 }] },
      ],
    },
    {
      key: 'patterns',
      name: 'UI patterns',
      frame: 'patterns',
      purpose: 'Named patterns with where they appear, why they work and what to do with them.',
      keyColumn: 'Pattern',
      columns: [
        { name: 'Pattern', type: 'text' },
        { name: 'Where seen', type: 'text', note: 'Screens in the inventory.' },
        { name: 'What it does', type: 'text' },
        { name: 'Why it works', type: 'text' },
        { name: 'Also used by', type: 'text' },
        { name: 'Decision', type: 'enum', options: ['Adopt', 'Adapt', 'Avoid', 'Watch'] },
      ],
      views: [
        { name: 'All', kind: 'table' },
        { name: 'By decision', kind: 'board', group: 'Decision' },
      ],
    },
    {
      key: 'findings',
      name: 'Findings',
      frame: 'findings',
      purpose: 'Heuristic and accessibility findings, each with its evidence and a recommendation.',
      keyColumn: 'Finding',
      columns: [
        { name: 'Finding', type: 'text' },
        {
          name: 'Heuristic',
          type: 'enum',
          options: [
            'Visibility of status',
            'Match with the real world',
            'User control',
            'Consistency',
            'Error prevention',
            'Recognition over recall',
            'Flexibility',
            'Minimal design',
            'Error recovery',
            'Help',
            'Accessibility',
            'Trust',
          ],
        },
        { name: 'Screen', type: 'text' },
        { name: 'Severity', type: 'rating', note: '1 (cosmetic) to 5 (blocks the task).' },
        { name: 'Observation', type: 'text' },
        { name: 'Evidence', type: 'text', note: 'The title of the screenshot card.' },
        { name: 'Recommendation', type: 'text' },
      ],
      views: [
        { name: 'By severity', kind: 'table', sort: [{ column: 'Severity', dir: 'desc' }] },
        { name: 'By heuristic', kind: 'board', group: 'Heuristic' },
        { name: 'Severe', kind: 'table', filter: [{ column: 'Severity', op: 'gte', value: 4 }] },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text: 'Read what the user dropped first: screenshots, PDFs, analytics exports (board_map, read_card, read_source, query_dataset). Log every dropped screenshot as a row in Screen inventory (upsert_rows) with the platform and capture date where known. Hand the product, the focus flow and the comparison products to Scout in the delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['screens'],
      }),
      orbDelegate(
        'Scout first (screens, flows, copy, business model), Builder once the Screen inventory has rows, Critic once Scout has screens to review.',
      ),
      step({
        id: 'overview',
        text: 'Fill the overview metrics (update_card): entry price, store rating, steps to first value (count them from the Flow steps) and screens captured, each with its source and date.',
        tools: ['query_dataset', 'update_card', 'query_board'],
        frames: ['overview'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (the product\'s history, how it makes money), run deep_research (core) on that one question.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'lessons',
        text: 'Lessons: Insight cards that each cite at least two cards (screens, findings, patterns). Fill the UX quality matrix (one 1-to-5 score per dimension, doubled) with a cited screenshot per score, then the Decision with the weighted total in the rationale and the Adopt or avoid checklist.',
        tools: ['query_board', 'search_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['lessons'],
      }),
      orbMemo,
      orbMonitor,
    ],
    scout: [
      step({
        id: 'site',
        text: 'The product\'s public site: home, pricing, features, docs and changelog (fetch_url, parallel_extract). capture_page screenshots of each key public page; place them as image cards in Screens with a Screen inventory row each (upsert_rows, key Screen) in flow order, with capture date and version.',
        tools: ['fetch_url', 'parallel_extract', 'capture_page', 'place_card', 'upsert_rows'],
        frames: ['screens', 'overview'],
      }),
      step({
        id: 'flows',
        text: 'Flows: walk onboarding, the core action, upgrade and cancel from the public pages, docs, videos and screens the user dropped. One Flow steps row per step (upsert_rows, key Step) with the user action, the system response and the friction. Say where you could not see a step instead of guessing.',
        tools: ['fetch_url', 'read_card', 'query_dataset', 'upsert_rows', 'web_search'],
        frames: ['flows', 'ia'],
      }),
      step({
        id: 'copy',
        text: 'Copy: quote the headlines, button labels, empty states, error messages and confirmations as Quote cards, each naming its screen. Include at least two errors or empty states.',
        tools: ['fetch_url', 'read_card', 'place_card'],
        frames: ['copy'],
      }),
      step({
        id: 'business',
        text: 'Business model and growth loops: the plans and paywall, the trial and free tier, invite and sharing loops, templates and integrations that bring users in. A dated Product changes timeline from the changelog and press, each event with a source. G2 or SimilarWeb only via fetch_signed_in if the user ticked them.',
        tools: ['web_search', 'fetch_url', 'fetch_signed_in', 'place_card', 'parallel_extract'],
        frames: ['business'],
      }),
      step({
        id: 'tech',
        text: 'Tech and performance from public signals only: the page source and its libraries, the manifest, the docs. A Source card per fact, saying how it was found; a Code card for a public snippet that shows a pattern.',
        tools: ['fetch_url', 'web_search', 'place_card', 'parallel_extract'],
        frames: ['tech'],
      }),
      step({
        id: 'compare',
        text: 'The products to compare: the ones the user named, then find_entities and batch_enrich (what each does, platform, entry price, rating) for a short list of leaders; a Product card for each (kind competitor or product). Quick scan: find_entities is refused; read the named ones only.',
        tools: ['find_entities', 'batch_enrich', 'fetch_url', 'capture_page', 'place_card', 'query_dataset'],
        frames: ['compare'],
        minTier: 'standard',
      }),
      step({
        id: 'patterns',
        text: 'Patterns seen in the screens: one UI patterns row for each (upsert_rows, key Pattern) with where it was seen, what it does and who else uses it. Builder adds the why it works and the decision.',
        tools: ['query_dataset', 'read_card', 'upsert_rows'],
        frames: ['patterns'],
      }),
      step({
        id: 'deep',
        text: 'Deep research for the gaps that remain: deep_research (core or above, per the tier), for example the history of the product and how it makes money.',
        tools: ['deep_research', 'research_status'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
    ],
    critic: [
      criticStart,
      criticFlags(['findings']),
      step({
        id: 'heuristics',
        text: 'Evaluate each flow against the heuristics: place a Risk card for every severe finding (severity 4 or 5), titled with the heuristic and the screen, and link it to the screenshot card it rests on. You cannot write database rows: send the full list to Builder with send_message so it can log them in Findings.',
        tools: ['query_board', 'read_card', 'query_dataset', 'place_card', 'add_link', 'send_message'],
        frames: ['findings', 'flows'],
      }),
      step({
        id: 'single-source',
        text: 'Challenge any finding resting on one screenshot or an old capture: link it "tension" to the card that disagrees, or place a Question asking for a recheck. Challenge each pattern marked Adopt for protection.',
        tools: ['query_board', 'query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['patterns', 'findings'],
      }),
      criticReport,
    ],
    builder: [
      step({
        id: 'diagrams',
        text: 'Diagrams: one per key flow (onboarding, core action, upgrade) from the Flow steps rows, and the sitemap from the screens; each node names its screen.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['flows', 'ia'],
      }),
      step({
        id: 'findings',
        text: 'Log the findings: one Findings row per finding (upsert_rows, key Finding) with the heuristic, screen, severity, observation, evidence and recommendation, including the list Critic sends you. Findings by severity chart bound to the database.',
        tools: ['upsert_rows', 'query_dataset', 'place_card', 'read_card'],
        frames: ['findings'],
      }),
      step({
        id: 'patterns',
        text: 'Patterns: complete the UI patterns rows Scout started (add your own rows): why it works and the Decision. Recreate the two best as design frames (write_design_frame): the pattern, not the brand assets.',
        tools: ['upsert_rows', 'write_design_frame', 'query_dataset', 'read_card'],
        frames: ['patterns'],
      }),
      step({
        id: 'tech-compare',
        text: 'The flow comparison matrix (scores 0 to 10 per product, the note naming the rows used), friction by step chart, and a note for orb where the technical signals matter to a decision.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['compare', 'flows', 'tech'],
      }),
      step({
        id: 'mockups',
        text: 'Mockups applying the top lessons to the user\'s product as design frames: one per lesson, labelled with the pattern it borrows, using only ideas and layout, never copied assets or text.',
        tools: ['write_design_frame', 'query_board', 'read_card', 'place_card'],
        frames: ['lessons'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...UI_RUBRIC],
  redFlags: [...UI_RED_FLAGS],

  output: {
    memoTitle: 'Product teardown: {{product}}',
    citationRule:
      'Every finding cites a screenshot card; every quote names its screen; every claim about the business cites a source and a date; versions and capture dates are stated.',
    sections: [
      {
        id: 'summary',
        title: 'Summary & lessons',
        frames: ['lessons', 'findings'],
        words: 150,
        guidance: 'What the product does best, the top three lessons and the top three problems, in at most 150 words.',
      },
      {
        id: 'overview',
        title: 'The product',
        frames: ['overview'],
        guidance: 'What it is, who it is for, pricing and platform.',
      },
      {
        id: 'flows',
        title: 'Key flows',
        frames: ['screens', 'flows'],
        guidance: 'Each flow step by step with its screens and friction, and the flow diagrams.',
      },
      {
        id: 'ia',
        title: 'Information architecture',
        frames: ['ia'],
        guidance: 'The sitemap and the navigation model.',
      },
      {
        id: 'patterns',
        title: 'Patterns and components',
        frames: ['patterns'],
        guidance: 'The named patterns, why they work and the adopt or avoid decision.',
      },
      {
        id: 'copy',
        title: 'Copy and voice',
        frames: ['copy'],
        guidance: 'The voice, with the best and worst examples quoted.',
      },
      {
        id: 'business',
        title: 'Business model and growth',
        frames: ['business'],
        guidance: 'Plans, paywall, growth loops and the changes timeline.',
      },
      {
        id: 'tech',
        title: 'Technology',
        frames: ['tech'],
        guidance: 'What the public signals show, and how each fact was found.',
      },
      {
        id: 'findings',
        title: 'Usability and accessibility findings',
        frames: ['findings'],
        guidance: 'Findings by severity with their screenshots, and the red-flag outcomes.',
      },
      {
        id: 'compare',
        title: 'Comparison',
        frames: ['compare'],
        guidance: 'The weighted flow comparison and the biggest gaps.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard and recommendations',
        frames: ['lessons'],
        guidance: 'The rubric table and what to adopt, adapt and avoid, with the mockups.',
      },
    ],
    appendix: 'All sources and capture dates',
    onePager: {
      title: 'One-page summary: {{product}} teardown',
      includes: ['What it is', 'Score', 'Top lessons', 'Top problems'],
    },
    deckFormat: 'standard',
    deck: {
      title: 'Teardown: {{product}}',
      slides: [
        { title: 'What we learned', brief: 'The three lessons and the score.' },
        { title: 'The product', brief: 'What it is, who it is for and the pricing headline.' },
        { title: 'The core flow', brief: 'The main flow as screens with the friction marked.' },
        { title: 'Onboarding', brief: 'The onboarding diagram and the steps to first value.' },
        { title: 'Patterns worth stealing', brief: 'The patterns marked Adopt with a screenshot each.' },
        { title: 'How it talks', brief: 'The voice with quoted copy.' },
        { title: 'How it makes money', brief: 'Plans, paywall and growth loops.' },
        { title: 'Where it falls short', brief: 'The severe findings with screenshots.' },
        { title: 'Against our product', brief: 'The weighted comparison matrix.' },
        { title: 'What we will do', brief: 'The decision, the mockups and the experiments.' },
      ],
    },
  },

  tiers: tiers({
    quick:
      'Public pages only: no deep research, at most 12 cards per frame, the core flow and the summary memo.',
    standard:
      'Quick, plus find_entities and batch_enrich for the products to compare, the patterns and findings databases, mockups and one or two deep-research runs (core), asking before spend.',
    deep: 'Standard, plus pro research on the product\'s history and market, more flows and comparison products, and the full memo and deck.',
  }),

  followUps: [
    {
      label: 'Go deeper on a flow',
      prompt: 'Go deeper on the [flow] flow of {{product}}: every step, every screen, where it drops users and how ours compares.',
    },
    {
      label: 'Mock up the pattern',
      prompt: 'Mock up the pattern [pattern] for our product as a design frame, listing what it borrows and what it changes.',
    },
    {
      label: 'Add another product',
      prompt: 'Add [product] to the teardown: capture its screens for the same flows and add it to the comparison.',
    },
    {
      label: 'Run an accessibility pass',
      prompt: 'Run an accessibility pass on the screens captured: contrast, keyboard, labels, with the worst five findings.',
    },
    {
      label: 'Write the redesign brief',
      prompt: 'Write the redesign brief for [flow] from the findings and lessons, as a doc with the problems ranked.',
    },
    {
      label: 'Watch their changelog',
      prompt: 'Start a monitor on {{product}} launches, pricing changes and changelog entries.',
    },
  ],

  signedIn: [
    { domain: 'g2.com', label: 'G2', use: 'Reviews that mention usability, onboarding and pricing.' },
    { domain: 'linkedin.com', label: 'LinkedIn', use: 'The company\'s design and product team size and hiring.' },
    { domain: 'similarweb.com', label: 'SimilarWeb', use: 'Traffic sources and engagement of the marketing site.' },
  ],

  monitor: {
    query: '{{product}} product launches, redesigns, pricing changes and changelog announcements',
    why: 'A change that makes the teardown stale.',
  },
};
