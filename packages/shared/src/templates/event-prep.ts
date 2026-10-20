/**
 * Event and conference prep (P6.16): decide whether and how to attend, pick the sessions, the people and the
 * companies, plan the meetings and the budget, and follow up. Ongoing: a watch on the event is available on request.
 * The human-readable spec is docs/templates/event-prep.md (generated: `pnpm templates:docs`).
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

export const EVENT_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'goals',
    name: 'Fit to your goals',
    weight: 30,
    anchors: {
      1: 'Little connection to what you want out of the event.',
      3: 'Some of your goals can be met here.',
      5: 'Most of your goals can only be met at this event.',
    },
    frame: 'strategy',
  },
  {
    id: 'people',
    name: 'Quality of the people',
    weight: 25,
    anchors: {
      1: 'Few of the people you want to meet will be there.',
      3: 'A fair number of relevant people are confirmed.',
      5: 'Many of your priority people and companies are confirmed.',
    },
    frame: 'people',
  },
  {
    id: 'content',
    name: 'Content quality',
    weight: 20,
    anchors: {
      1: 'Generic or sponsor-driven sessions.',
      3: 'A few sessions worth the time.',
      5: 'Several sessions you could not get elsewhere.',
    },
    frame: 'agenda',
  },
  {
    id: 'cost',
    name: 'Cost against benefit',
    weight: 15,
    anchors: {
      1: 'Costs more than the likely benefit.',
      3: 'Roughly pays for itself.',
      5: 'Clear return for the money and time.',
    },
    frame: 'logistics',
  },
  {
    id: 'timing',
    name: 'Timing and logistics',
    weight: 10,
    anchors: {
      1: 'Conflicts, hard travel or unconfirmed details.',
      3: 'Workable with some effort.',
      5: 'Easy to reach, dates confirmed, nothing in the way.',
    },
    frame: 'logistics',
  },
];

export const EVENT_FLAGS = flags([
  [
    'Dates, venue or programme not confirmed by the organiser.',
    'Compare the organiser’s own pages with aggregators and the agenda; an aggregator-only date is a flag.',
  ],
  [
    'Fees beyond the ticket: workshops, gated sessions, dinners, badge upgrades.',
    'Read the ticket and registration pages to the end; list extras with prices in the Logistics database.',
  ],
  [
    'A pay-to-play programme: most speaking slots are sponsor slots.',
    'Check the speakers database for how many speakers are from sponsors; read the organiser’s speaker policy.',
  ],
  [
    'The people you want to meet are not confirmed (not on the programme, not on the speaker list).',
    'For each priority person, find a programme entry, their own post or the organiser listing. A guess is not confirmation.',
  ],
  [
    'Past editions disappointed: negative recaps or reviews, falling attendance, a cancelled edition.',
    'Search recaps and reviews of the last two editions; quote what attendees said, positive and negative.',
  ],
  [
    'A conflict: another event, a deadline or a travel constraint in the same dates.',
    'Check the dates against the Logistics database and the user’s stated constraints.',
  ],
  [
    'A cancellation or refund policy that locks you in before the programme is final.',
    'Read the policy; note the last refundable date as a metric.',
  ],
  [
    'Scam risk: look-alike sites, unsolicited “attendee list” sellers, phishing around the event.',
    'Confirm the registration and hotel-block links lead to the organiser’s domain; never buy or scrape attendee lists.',
  ],
  [
    'Personal data on the board about people beyond their professional role at the event.',
    'Rows about people hold only their role, organisation, session and public professional contact route.',
  ],
  [
    'The total cost (ticket, travel, stay, time) exceeds the budget or the likely benefit.',
    'Sum the Logistics database; compare with the budget and the weighted goal fit.',
  ],
]);

export const EVENT_PREP: TemplateSpecInput = {
  id: 'event-prep',
  label: 'Event prep',
  dot: '#0891B2',
  placeholder: 'Which event or conference are you preparing for?',
  brief:
    'Prepare for an event or conference: confirm the facts, decide whether and how to attend, choose the sessions, ' +
    'the people and the companies worth meeting, plan the outreach and meetings, the budget and the logistics, and ' +
    'prepare the talking points and the follow-up. Eight numbered frames, a weighted rubric for the go or no-go, and ' +
    'an event plan. Public professional information only about people.',
  titleFrom: '{{event}}: event prep',

  inputs: [
    {
      id: 'event',
      label: 'Event name',
      kind: 'text',
      required: true,
      placeholder: 'Web Summit 2027',
      maxLength: 120,
    },
    {
      id: 'event_url',
      label: 'Event website',
      kind: 'url',
      required: true,
      placeholder: 'https://example-conf.com',
      maxLength: 300,
    },
    {
      id: 'role',
      label: 'Your role at the event',
      kind: 'select',
      required: true,
      options: ['Attendee', 'Speaker', 'Exhibitor', 'Sponsor', 'Investor scouting', 'Hiring', 'Press'],
      group: 'who',
      maxLength: 40,
    },
    {
      id: 'dates',
      label: 'Dates',
      kind: 'text',
      placeholder: '12 to 14 May 2027',
      group: 'who',
      maxLength: 80,
    },
    {
      id: 'city',
      label: 'City',
      kind: 'text',
      placeholder: 'Lisbon',
      group: 'where',
      maxLength: 120,
    },
    {
      id: 'origin',
      label: 'Travelling from',
      kind: 'text',
      placeholder: 'Berlin',
      group: 'where',
      maxLength: 120,
    },
    {
      id: 'goals',
      label: 'What you want from the event',
      kind: 'longtext',
      required: true,
      placeholder: 'E.g. three customer intros, two investors, learn how others price agents',
      maxLength: 1500,
    },
    {
      id: 'audience',
      label: 'Who you want to meet',
      kind: 'longtext',
      placeholder: 'Titles, companies or names. Public professional roles only.',
      maxLength: 1500,
    },
    {
      id: 'topics',
      label: 'Topics you care about',
      kind: 'list',
      placeholder: 'Comma separated',
      maxLength: 600,
    },
    {
      id: 'budget',
      label: 'Budget',
      kind: 'text',
      placeholder: '$3,500 all in',
      group: 'money',
      maxLength: 80,
    },
    {
      id: 'companions',
      label: 'Who else from your team',
      kind: 'text',
      placeholder: 'Just me',
      group: 'money',
      maxLength: 120,
    },
    materialsField('Drop the agenda PDF, an attendee or exhibitor list (CSV or XLSX), your ticket or your talk abstract.'),
    depthField(
      'Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending.',
    ),
    {
      id: 'sites',
      label: 'Signed-in sources to use',
      kind: 'sites',
      help: 'Only the sites you connected in Settings can be used. Scout reads them as you, read-only.',
      sites: [
        { domain: 'linkedin.com', label: 'LinkedIn' },
        { domain: 'crunchbase.com', label: 'Crunchbase' },
        { domain: 'lu.ma', label: 'Luma' },
        { domain: 'sessionize.com', label: 'Sessionize' },
      ],
      maxLength: 400,
    },
  ],

  frames: [
    {
      id: 'snapshot',
      title: 'Event snapshot',
      color: 'signal',
      brief:
        'What {{event}} is, the organiser, the dates and the city, the audience and its size, the price, how many ' +
        'sessions, speakers and sponsors, how long it has run, and one sentence on why it matters for you as {{role|an attendee}}.',
      owners: ['orb'],
      targets: [
        { type: 'entity', min: 1, note: 'the event or its organiser' },
        { type: 'metric', min: 6 },
        { type: 'doc', min: 1, note: 'why it matters' },
      ],
      seeds: [
        {
          type: 'entity',
          data: {
            title: '{{event}}',
            kind: 'org',
            url: '{{event_url}}',
            location: '{{city|}}',
            body: 'The event, from your intake.',
            facts: [
              { label: 'Your role', value: '{{role|to confirm}}' },
              { label: 'Dates', value: '{{dates|to confirm}}' },
              { label: 'City', value: '{{city|to confirm}}' },
              { label: 'Budget', value: '{{budget|to confirm}}' },
            ],
          },
          why: 'The event, from your intake.',
        },
        doc(
          'Why it matters for you',
          'What you want from {{event}}: {{goals|to confirm}}. orb writes the summary after the first pass.',
        ),
        metric('Dates', 'Confirmed on the organiser’s own page.'),
        metric('Attendance', 'Expected attendees, with the source and the last edition’s figure.'),
        metric('Ticket price', 'The price you would pay, with the date it changes.'),
        metric('Sessions', 'Number of sessions and tracks on the programme.'),
        metric('Speakers', 'Number of confirmed speakers.'),
        metric('Sponsors and exhibitors', 'Number, with the top tier named.'),
      ],
      room: 300,
    },
    {
      id: 'agenda',
      title: 'Agenda & sessions',
      color: 'sky',
      brief:
        'Every session worth considering: title, speaker, time, track, room, why it matters for your goals and a priority. ' +
        'Conflicts between must-see sessions, the keynotes, the workshops that cost extra, and what is recorded so you can skip it.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Sessions' },
        { type: 'chart', min: 1, note: 'sessions by track' },
        { type: 'timeline', min: 1, note: 'your day-by-day plan' },
      ],
      seeds: [
        db('Sessions', 'sessions'),
        chartSeed('Sessions by track', 'bar', 'sessions', 'Track'),
        timelineSeed(
          'Event timeline',
          'Prep started',
          'Builder adds the fixed points: keynotes, your slots, deadlines, with a source.',
        ),
        question('Which sessions can only be had in person?', 'What is not recorded or shared afterwards.'),
      ],
    },
    {
      id: 'people',
      title: 'Speakers & attendees',
      color: 'rho',
      brief:
        'The people worth meeting: confirmed speakers, panelists, organisers and attendees in your target roles. For each: ' +
        'role, organisation, why they matter for your goals, how you know they will be there, the best public ' +
        'professional route to reach them, a priority. Public professional information only.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'People: at least 15 rows' },
        { type: 'entity', min: 3, note: 'the top-priority people' },
        { type: 'source', min: 3 },
      ],
      seeds: [
        db('People', 'people'),
        question(
          'Who are the five people you most want to meet?',
          'Role, organisation, why, and the evidence they will be there.',
        ),
      ],
    },
    {
      id: 'orgs',
      title: 'Companies & sponsors',
      color: 'sky',
      brief:
        'The exhibitors, sponsors and companies around the event that matter: what they do, their stage and size, ' +
        'why they matter for your goals (customer, partner, competitor, investor, employer), who to talk to, and their booth, ' +
        'session or side-event if any.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Companies: at least 15 rows' },
        { type: 'chart', min: 1, note: 'companies by relevance or type' },
        { type: 'product', min: 2, note: 'the most relevant companies' },
      ],
      seeds: [
        db('Companies', 'companies'),
        chartSeed('Companies by type', 'pie', 'companies', 'Relationship'),
      ],
    },
    {
      id: 'strategy',
      title: 'Goals & strategy',
      color: 'rho',
      brief:
        'Your goals as hypotheses with how you will know each worked, the weighted fit of the event to them, the ' +
        'go or no-go and how to attend (fully, selectively, send someone). The rubric is scored here with cited evidence.',
      owners: ['orb', 'critic'],
      targets: [
        { type: 'hypothesis', min: 2, note: 'with evidence links' },
        { type: 'decision', min: 1 },
        { type: 'matrix', min: 1, note: 'the filled rubric' },
        { type: 'framework', min: 1, note: '2x2 priority of people and sessions' },
      ],
      seeds: [
        hypothesis(
          '{{event}} will deliver your main goal',
          'Your goals: {{goals|not given.}} Link the cards that support it and the cards that contradict it.',
        ),
        hypothesis(
          'The people you want to meet will be there',
          'Confirmed in the programme, not just likely.',
        ),
        framework('quadrant', 'Priority 2x2: effort against value', { x: 'Effort', y: 'Value to your goals' }),
        decisionSeed(
          'Go or no-go: {{event}}',
          ['Attend fully', 'Attend selectively', 'Send someone else', 'Skip'],
          'Open. orb proposes after the rubric is filled and writes the weighted total here. You decide.',
        ),
        scorecard(EVENT_RUBRIC),
      ],
    },
    {
      id: 'outreach',
      title: 'Outreach & meetings',
      color: 'paper',
      brief:
        'The meetings you want: person, organisation, the ask, the channel, a draft of the first message ' +
        '(for you to send, never sent by orb), the status and the slot. Where events publish a meeting tool, use it; otherwise propose times near the person’s session.',
      owners: ['scout', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Meetings' },
        { type: 'checklist', min: 1, note: 'outreach to send' },
        { type: 'doc', min: 2, note: 'draft messages' },
      ],
      seeds: [
        db('Meetings', 'meetings'),
        checklist('Outreach to send', [
          'Top five people: a short note with one specific reason to meet.',
          'Companies to book a booth chat with.',
          'Invitations to the side events that fit.',
        ]),
      ],
    },
    {
      id: 'logistics',
      title: 'Logistics & budget',
      color: 'sky',
      brief:
        'Ticket, travel, stay, meals, workshop fees, time out of work: each with a price, a source and a status. Last ' +
        'refundable dates, visa or travel documents if needed, hotel blocks, transit from the airport, the weather, and the total against your budget {{budget|}}.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Logistics' },
        { type: 'chart', min: 1, note: 'cost by category' },
        { type: 'metric', min: 2, note: 'total cost, last refundable date' },
      ],
      seeds: [
        db('Logistics', 'logistics'),
        chartSeed('Cost by category', 'bar', 'logistics', 'Category', 'Cost'),
        metric('Total cost', 'Sum of the Logistics rows; compare with your budget.'),
        metric('Last refundable date', 'From the ticket policy.'),
        flagChecklist('Event red flags', EVENT_FLAGS),
        emptyRisk('Cost'),
        emptyRisk('Programme', 'Nothing raised yet. Critic raises an unconfirmed date, venue or speaker here with evidence, or clears it.'),
        emptyRisk('Scams and data'),
      ],
    },
    {
      id: 'followup',
      title: 'Talking points & follow-up',
      color: 'signal',
      brief:
        'Your two-sentence introduction, three questions to ask, the pitch or ask for each type of person, what to bring, ' +
        'and the post-event follow-up: who to write, within what time, with what. Notes taken at the event are added here and turned into follow-ups.',
      owners: ['orb', 'builder'],
      targets: [
        { type: 'doc', min: 2, note: 'introduction and talking points' },
        { type: 'checklist', min: 2 },
      ],
      seeds: [
        doc(
          'Your introduction',
          'Two sentences about who you are and what you are here for, written for {{role|an attendee}} at {{event}}.',
        ),
        checklist('Before you go', [
          'Ticket and badge in your wallet.',
          'Schedule in your calendar with travel time.',
          'Cards, one-pager and a demo that works offline.',
        ]),
        checklist('After the event: within 48 hours', [
          'Write each priority contact with one specific follow-up.',
          'Add notes and photos of whiteboards as cards on this board.',
          'Re-score the event and decide whether to attend next year.',
        ]),
      ],
    },
  ],

  databases: [
    {
      key: 'sessions',
      name: 'Sessions',
      frame: 'agenda',
      purpose: 'Sessions, keynotes and workshops worth considering, with priority and clashes.',
      keyColumn: 'Title',
      columns: [
        col('Title'),
        col('Speaker', 'person'),
        col('Organisation'),
        col('Day', 'date'),
        col('Time', 'text', { note: 'Start and end, local time.' }),
        col('Track', 'text'),
        col('Room'),
        col('Format', 'enum', { options: ['Keynote', 'Talk', 'Panel', 'Workshop', 'Side event', 'Meetup'] }),
        col('Extra cost', 'currency', { note: 'Fee beyond the ticket; empty if none.' }),
        col('Priority', 'rating', { note: '1 (skip) to 5 (must see).' }),
        col('Why it matters', 'text'),
        col('Recorded', 'enum', { options: ['Yes', 'No', 'Unknown'] }),
        col('Source', 'url'),
      ],
      views: [
        { name: 'By day', kind: 'table', sort: [{ column: 'Day', dir: 'asc' }] },
        { name: 'By priority', kind: 'board', group: 'Format' },
        { name: 'Must see', kind: 'table', filter: [{ column: 'Priority', op: 'gte', value: 4 }] },
      ],
    },
    {
      key: 'people',
      name: 'People',
      frame: 'people',
      purpose:
        'People worth meeting, with the evidence they will be there. Public professional information only; no personal contact details.',
      keyColumn: 'Name',
      columns: [
        col('Name', 'person'),
        col('Organisation'),
        col('Role'),
        col('At the event', 'enum', {
          options: ['Speaker', 'Panelist', 'Organiser', 'Exhibitor', 'Attendee', 'Unconfirmed'],
        }),
        col('Evidence they attend', 'url', { note: 'The programme entry or their own post.' }),
        col('Why meet', 'text'),
        col('Priority', 'rating', { note: '1 (low) to 5 (top).' }),
        col('Route', 'text', { note: 'The public professional way to reach them: their own post, the event app, a mutual intro.' }),
        col('Status', 'enum', { options: ['To contact', 'Contacted', 'Meeting set', 'Met', 'Declined'] }),
      ],
      views: [
        { name: 'By priority', kind: 'table', sort: [{ column: 'Priority', dir: 'desc' }] },
        { name: 'By status', kind: 'board', group: 'Status' },
        { name: 'Confirmed', kind: 'table', filter: [{ column: 'At the event', op: 'neq', value: 'Unconfirmed' }] },
      ],
    },
    {
      key: 'companies',
      name: 'Companies',
      frame: 'orgs',
      purpose: 'Exhibitors, sponsors and other companies worth a conversation. Found with find_entities, enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        col('Name'),
        col('URL', 'url'),
        col('Relationship', 'enum', {
          options: ['Customer', 'Partner', 'Competitor', 'Investor', 'Employer', 'Supplier', 'Peer'],
        }),
        col('What they do', 'text'),
        col('Stage or size', 'text'),
        col('At the event', 'text', { note: 'Booth, session, side event or sponsor tier.' }),
        col('Relevance', 'rating', { note: '1 (low) to 5 (high) for your goals.' }),
        col('Who to talk to', 'text', { note: 'A role, not a private contact.' }),
        col('Source', 'url'),
      ],
      views: [
        { name: 'By relevance', kind: 'table', sort: [{ column: 'Relevance', dir: 'desc' }] },
        { name: 'By relationship', kind: 'board', group: 'Relationship' },
        { name: 'Top', kind: 'table', filter: [{ column: 'Relevance', op: 'gte', value: 4 }] },
      ],
    },
    {
      key: 'meetings',
      name: 'Meetings',
      frame: 'outreach',
      purpose: 'Each meeting you want: who, the ask, the channel, the status, the slot.',
      keyColumn: 'Person',
      columns: [
        col('Person', 'person'),
        col('Organisation'),
        col('The ask', 'text'),
        col('Channel', 'enum', { options: ['Event app', 'Email', 'LinkedIn', 'Mutual intro', 'At the booth', 'Side event'] }),
        col('Draft message', 'text'),
        col('Status', 'enum', { options: ['Draft', 'Sent', 'Replied', 'Booked', 'Done', 'No reply'] }),
        col('Slot', 'text'),
        col('Notes', 'text'),
      ],
      views: [
        { name: 'By status', kind: 'board', group: 'Status' },
        { name: 'All', kind: 'table' },
      ],
    },
    {
      key: 'logistics',
      name: 'Logistics',
      frame: 'logistics',
      purpose: 'Every cost and booking with its price, source and status.',
      keyColumn: 'Item',
      columns: [
        col('Item'),
        col('Category', 'enum', {
          options: ['Ticket', 'Flights or transport', 'Stay', 'Meals', 'Workshop', 'Local transport', 'Other'],
        }),
        col('Cost', 'currency', { note: 'In one currency; say which in the note.' }),
        col('Due', 'date', { note: 'Booking deadline or last refundable date.' }),
        col('Status', 'enum', { options: ['To book', 'Booked', 'Refundable', 'Non-refundable'] }),
        col('Source', 'url'),
        col('Note', 'text'),
      ],
      views: [
        { name: 'All', kind: 'table', sort: [{ column: 'Due', dir: 'asc' }] },
        { name: 'By category', kind: 'board', group: 'Category' },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first (agenda PDF, attendee or exhibitor lists, your abstract): read_card, read_source and ' +
          'query_dataset. Put each session of the agenda into Sessions (upsert_rows, key Title) and each listed person or company into ' +
          'People or Companies. Hand the goals, the target roles and the ticked sources to Scout in its delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['agenda', 'people', 'orgs'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first, Builder once Sessions and Logistics have rows, Critic once Scout has sources. ' +
          'Say the people rows hold roles and organisations only, and that nothing is sent to anyone.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'snapshot',
        text: 'After Scout’s first pass, fill the Snapshot metrics (update_card) and “Why it matters for you”, each with a cited figure. Never write a figure you cannot source.',
        tools: ['query_board', 'search_board', 'update_card'],
        frames: ['snapshot'],
      }),
      step({
        id: 'gaps',
        text: 'For one gap Scout could not close (a past-edition outcome, a speaker confirmation), run deep_research (core). Ask before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        frames: ['strategy'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'rubric',
        text:
          'Fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with a cited card in the ' +
          'why line. Update the goal hypotheses with evidence for and against, and the Decision card with your proposed option ' +
          'and the weighted total in its rationale. Place drafts of the first messages as doc cards in Outreach & meetings: you write drafts, the user sends.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['strategy', 'outreach'],
      }),
      step({
        id: 'plan',
        text: 'Write the event plan with compose_section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. The deck follows with compose_slides if asked.',
        tools: ['compose_section', 'compose_slides'],
      }),
      step({
        id: 'followup',
        text: 'Keep “Talking points & follow-up” current: the introduction, three questions per priority person, and, when the user adds event notes, the follow-up list.',
        tools: ['search_board', 'update_card', 'place_card', 'add_link'],
        frames: ['followup'],
      }),
      step({
        id: 'monitor',
        text: 'Only when the user asks to keep watching the event: watch_topic with the event name and the monitor query (speaker announcements, programme changes, price changes). Each monitor is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'organiser',
        text: 'The organiser’s own pages: about, programme, speakers, tickets, venue, sponsors and the FAQ (fetch_url, parallel_extract). Take capture_page screenshots of the programme and the ticket page. Dates, price and the refund policy become the Snapshot figures and Logistics rows (upsert_rows).',
        tools: ['fetch_url', 'parallel_extract', 'capture_page', 'place_card', 'upsert_rows'],
        frames: ['snapshot', 'logistics'],
      }),
      step({
        id: 'agenda',
        text: 'Sessions: one row per session worth considering in Sessions (upsert_rows, key Title) with track, time, format, an extra cost if any, and why it matters for the goals. Put the fixed points on the Event timeline. Mark recording where the organiser says so.',
        tools: ['fetch_url', 'parallel_extract', 'upsert_rows', 'place_card', 'web_search'],
        frames: ['agenda'],
      }),
      step({
        id: 'people',
        text: 'People: start from the target roles in the intake. Speakers, panelists and organisers from the programme first, then public posts announcing attendance (LinkedIn if connected, fetch_signed_in, read-only). find_entities builds a longer list of people matching the target roles; batch_enrich fills role, organisation and evidence. One row per person in People (upsert_rows, key Name) with the evidence url for attendance. Roles and organisations only: no personal contact details, home or family information. Entity cards for the top five.',
        tools: ['fetch_signed_in', 'web_search', 'find_entities', 'batch_enrich', 'query_dataset', 'upsert_rows', 'place_card'],
        frames: ['people'],
      }),
      step({
        id: 'companies',
        text: 'Companies: sponsors and exhibitors from the organiser, plus companies announced around the event. find_entities lists more that match your goals; batch_enrich fills what they do, stage and size. Consolidate into Companies with upsert_rows (key Name), a Source on every row. Product cards for the two or three most relevant. On the Quick tier, add rows from web_search instead.',
        tools: ['find_entities', 'batch_enrich', 'web_search', 'fetch_url', 'query_dataset', 'upsert_rows', 'place_card'],
        frames: ['orgs'],
      }),
      step({
        id: 'past-editions',
        text: 'Past editions: recaps, attendee reviews and attendance trends for the last two editions; quote cards, positive and critical. Look for a pay-to-play programme and for scam warnings about the event.',
        tools: ['web_search', 'fetch_url', 'place_card'],
        frames: ['snapshot', 'logistics'],
      }),
      step({
        id: 'logistics',
        text: 'Logistics: flights or transport from {{origin|the traveller’s city}}, a stay near the venue and the hotel block, meals, local transport and visa or entry rules from official sources. One row per item in Logistics (upsert_rows) with a price and a source; mark what is refundable.',
        tools: ['web_search', 'fetch_url', 'parallel_extract', 'upsert_rows', 'place_card'],
        frames: ['logistics'],
      }),
      step({
        id: 'outreach',
        text: 'Meetings: for each priority person, the best public route to reach them and a row in Meetings (upsert_rows, Status Draft). You propose; you never send anything.',
        tools: ['upsert_rows', 'query_dataset', 'web_search'],
        frames: ['outreach'],
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
        text: 'Start after Scout’s first sources: read the cards of every frame (board_map, search_board, read_card) and the databases (query_dataset) before judging anything.',
        tools: ['board_map', 'search_board', 'read_card', 'query_board', 'query_dataset'],
      }),
      step({
        id: 'red-flags',
        text: 'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links, or an Insight card titled "RFxx cleared: ..." citing the source cards that clear it (an insight needs at least two cited cards). You cannot tick the checklist: the user does.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['logistics', 'agenda'],
      }),
      step({
        id: 'confirmation',
        text: 'Challenge every priority person and session with a single source: is the attendance confirmed? Place a Question card for each that is not, linked to the row’s card, and link tension to cards that disagree.',
        tools: ['query_dataset', 'query_board', 'read_card', 'place_card', 'add_link'],
        frames: ['people', 'agenda'],
      }),
      step({
        id: 'strategy',
        text: 'Challenge the goal hypotheses: place an Insight or Hypothesis that argues the other side with cited cards, and mark any goal the event cannot meet.',
        tools: ['place_card', 'add_link', 'query_board'],
        frames: ['strategy'],
      }),
      step({
        id: 'report',
        text: 'Report progress per frame; send_message to orb when the checklist is complete, naming the flags raised.',
        tools: ['report_progress', 'send_message'],
      }),
    ],
    builder: [
      step({
        id: 'charts',
        text: 'The charts: sessions by track bound to Sessions, companies by relationship bound to Companies, cost by category bound to Logistics.',
        tools: ['place_card', 'query_dataset'],
        frames: ['agenda', 'orgs', 'logistics'],
      }),
      step({
        id: 'timeline',
        text: 'The day-by-day plan: a timeline card of the fixed points and the meetings booked, built from Sessions and Meetings. Show clashes between must-see sessions with a note.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['agenda'],
      }),
      step({
        id: 'priority',
        text: 'The priority 2x2 in Goals & strategy: place people and sessions by effort and value to the goals, from the databases.',
        tools: ['place_card', 'query_dataset'],
        frames: ['strategy'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual summary (a design frame): dates, the go or no-go, the top five people, the must-see sessions and the budget, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['followup', 'snapshot'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...EVENT_RUBRIC],
  redFlags: [...EVENT_FLAGS],

  output: {
    memoTitle: 'Event plan: {{event}}',
    citationRule:
      'Every paragraph cites cards; every date, price and attendance claim cites the organiser or another named source; unconfirmed items are marked as such.',
    sections: [
      {
        id: 'summary',
        title: 'Summary & recommendation',
        frames: ['strategy', 'logistics'],
        words: 150,
        guidance: 'The go or no-go, the score, the three reasons and the three risks, in at most 150 words.',
      },
      {
        id: 'snapshot',
        title: 'The event at a glance',
        frames: ['snapshot'],
        guidance: 'A table: dates, city, organiser, attendance, price, sessions, speakers, sponsors.',
      },
      {
        id: 'agenda',
        title: 'Your sessions',
        frames: ['agenda'],
        guidance: 'The must-see sessions by day, clashes, the keynotes and what is recorded.',
      },
      {
        id: 'people',
        title: 'People to meet',
        frames: ['people', 'outreach'],
        guidance: 'The priority people with evidence they will attend, the route and the planned meetings.',
      },
      {
        id: 'orgs',
        title: 'Companies to see',
        frames: ['orgs'],
        guidance: 'The relevant companies and why each, with their stand or session.',
      },
      {
        id: 'logistics',
        title: 'Logistics & budget',
        frames: ['logistics'],
        guidance: 'The cost table against the budget, the dates to book by and the red-flag outcomes.',
      },
      {
        id: 'talking',
        title: 'Talking points',
        frames: ['followup'],
        guidance: 'The introduction, the questions and the ask by type of person.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard',
        frames: ['strategy'],
        guidance: 'The rubric table: each dimension, weight, score and evidence.',
      },
      {
        id: 'next',
        title: 'Before and after',
        frames: ['followup', 'outreach'],
        guidance: 'The before-you-go checklist and the follow-up plan.',
      },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'Event one-pager: {{event}}',
      includes: ['Dates and city', 'Go or no-go and score', 'Must-see sessions', 'Top people', 'Budget'],
    },
    deckFormat: 'standard',
  },

  tiers: tiers({
    quickSummary:
      'No deep research: the organiser’s pages, search, extract and the signed-in fetches ticked, at most 12 cards per frame; the plan is the summary only.',
    standardSummary:
      'Quick, plus entity lists of people and companies enriched into the databases and one or two deep-research runs (core) on past editions, asking before spend.',
    deepSummary:
      'Standard, plus FindAll for the full list of matching people and companies, pro research on past editions and the full event plan.',
    deepRuns: 4,
  }),

  followUps: [
    {
      label: 'Plan my day one',
      prompt: 'Plan day one at {{event}} hour by hour: sessions, meetings and breaks, with travel time between rooms.',
    },
    {
      label: 'Draft the first messages',
      prompt: 'Draft the first outreach message for each person marked top priority at {{event}}: short, specific, for me to send.',
    },
    {
      label: 'Find more people like [person]',
      prompt: 'Find more people at {{event}} like [person]: same role and interest, with the evidence they will attend.',
    },
    {
      label: 'Cut the budget',
      prompt: 'Cut the cost of {{event}} by 25 percent: what to drop or change, and what it costs in value against the goals.',
    },
    {
      label: 'Add my notes and follow up',
      prompt: 'I added notes from {{event}}. Turn them into follow-ups per person, with a draft message for each, and update the meetings.',
    },
    {
      label: 'Watch this event',
      prompt: 'Watch {{event}} for programme changes and speaker announcements, and tell me what changes the plan.',
    },
  ],

  signedIn: [
    {
      domain: 'linkedin.com',
      label: 'LinkedIn',
      use: 'Public announcements of attendance and roles of people, as visible to the user. Terms apply: read-only, rate-limited.',
    },
    { domain: 'crunchbase.com', label: 'Crunchbase', use: 'Stage and size of the companies and sponsors.' },
    { domain: 'lu.ma', label: 'Luma', use: 'Side events and RSVP lists the user can already see.' },
    { domain: 'sessionize.com', label: 'Sessionize', use: 'The programme and speaker lists for events that publish there.' },
  ],

  monitor: {
    query: '{{event}} programme changes, speaker announcements, ticket price changes and cancellations',
    why: 'Changes to the programme or the price that would change the plan.',
  },
};
