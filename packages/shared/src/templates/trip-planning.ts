/**
 * Trip planning (P6.16): from a destination and a budget to a booked-ready itinerary: transport, stay, places, food,
 * a day-by-day plan, the budget and the preparation. Fares and advisories can be watched on request. The human-readable
 * spec is docs/templates/trip-planning.md (generated: `pnpm templates:docs`).
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

export const TRIP_RUBRIC: readonly RubricDimension[] = [
  {
    id: 'interests',
    name: 'Fit to your interests',
    weight: 30,
    anchors: {
      1: 'Most of the trip is not what you said you want.',
      3: 'A good share of the days match your interests.',
      5: 'Nearly every day is what you came for.',
    },
    frame: 'itinerary',
  },
  {
    id: 'cost',
    name: 'Cost against budget',
    weight: 25,
    anchors: {
      1: 'Over budget or costs unknown.',
      3: 'Within budget with a small buffer.',
      5: 'Comfortably within budget with a buffer of at least 10 percent.',
    },
    frame: 'budget',
  },
  {
    id: 'logistics',
    name: 'Logistics that work',
    weight: 20,
    anchors: {
      1: 'Tight connections, long transfers, unconfirmed bookings.',
      3: 'Workable, with a few long days.',
      5: 'Smooth: short transfers, buffers, everything confirmed.',
    },
    frame: 'transport',
  },
  {
    id: 'season',
    name: 'Season and risk',
    weight: 15,
    anchors: {
      1: 'Wrong season, closures or a travel warning in force.',
      3: 'Acceptable season; a risk or two with a plan.',
      5: 'Good season, no warnings, risks planned for.',
    },
    frame: 'prep',
  },
  {
    id: 'pace',
    name: 'Pace and energy',
    weight: 10,
    anchors: {
      1: 'Overpacked or empty days against the pace you asked for.',
      3: 'Mostly right with a few days to adjust.',
      5: 'The pace you asked for, with rest where you need it.',
    },
    frame: 'itinerary',
  },
];

export const TRIP_FLAGS = flags([
  [
    'Travel documents: passport validity, visa or entry authorisation not checked against the official source.',
    'Read the destination government’s entry page and your own government’s travel page; put the rule and date in the Preparation checklist with the source.',
  ],
  [
    'A government travel advisory in force for the destination or a stop on the route.',
    'Check your own government’s advisory page for each country and region on the route.',
  ],
  [
    'Closures: sites, restaurants or transport closed on the days planned (weekday, holiday, season, renovation).',
    'Compare each Itinerary row with the opening hours and the holiday calendar for the date.',
  ],
  [
    'Tight connections: under 90 minutes between flights or under 20 minutes between trains, or an overnight arrival with no transfer.',
    'Read the Transport database legs in order; compute the gap between each arrival and the next departure.',
  ],
  [
    'Hidden costs: resort or city fees, baggage, seat fees, deposits, card or exchange fees, tipping norms.',
    'Compare the Budget with the price pages and the cancellation terms on every booking.',
  ],
  [
    'Non-refundable bookings made before the plan is final.',
    'List each booking with its cancellation terms in Transport and Stay; mark non-refundable ones.',
  ],
  [
    'Weather, seasonal hazards or events (monsoon, extreme heat, snow, strikes, big festivals) that change the plan.',
    'Check seasonal climate data and the local events calendar for the dates.',
  ],
  [
    'Health and safety needs not checked (vaccination or medication rules, insurance cover, area safety).',
    'Source official public-health and government pages only; say “check with a doctor” where individual advice is needed. orb gives no medical advice.',
  ],
  [
    'Accessibility or dietary constraints from the intake are not met by the stay, the transport or the places.',
    'Match each constraint to the Stay, Places and Food rows; unverifiable ones become questions to ask the venue.',
  ],
  [
    'An overpacked day: more than the pace asked for, or a day without a meal break or rest.',
    'Count the hours on each itinerary day against the Pace; flag days over the limit.',
  ],
]);

export const TRIP_PLANNING: TemplateSpecInput = {
  id: 'trip-planning',
  label: 'Trip planning',
  dot: '#059669',
  placeholder: 'Where are you going, and when?',
  brief:
    'Plan a trip: the destination and the dates, the transport, where to stay, what to do, where to eat, a day-by-day ' +
    'itinerary that matches the pace asked for, the budget and the preparation (documents, safety, packing). Eight ' +
    'numbered frames, a weighted rubric and a trip plan. Prices, hours and rules are sourced and dated; nothing is ' +
    'booked by orb.',
  titleFrom: 'Trip: {{destination}}',

  inputs: [
    {
      id: 'destination',
      label: 'Destination',
      kind: 'text',
      required: true,
      placeholder: 'Japan: Tokyo, Kyoto and Osaka',
      maxLength: 160,
    },
    {
      id: 'dates',
      label: 'Dates (or how flexible)',
      kind: 'text',
      required: true,
      placeholder: '3 to 17 April, flexible by two days',
      group: 'when',
      maxLength: 120,
    },
    {
      id: 'origin',
      label: 'Travelling from',
      kind: 'text',
      placeholder: 'Manchester',
      group: 'when',
      maxLength: 120,
    },
    {
      id: 'travellers',
      label: 'Who is travelling',
      kind: 'text',
      placeholder: '2 adults, one child aged 7',
      group: 'who',
      maxLength: 160,
    },
    {
      id: 'budget',
      label: 'Budget',
      kind: 'text',
      required: true,
      placeholder: '£4,500 in total',
      group: 'who',
      maxLength: 120,
    },
    {
      id: 'interests',
      label: 'What you want from the trip',
      kind: 'longtext',
      required: true,
      placeholder: 'Food, old temples, hiking, no more than two cities…',
      maxLength: 1500,
    },
    {
      id: 'pace',
      label: 'Pace',
      kind: 'select',
      options: ['Relaxed', 'Balanced', 'Packed'],
      group: 'style',
      maxLength: 20,
    },
    {
      id: 'stay_style',
      label: 'Where you like to stay',
      kind: 'select',
      options: ['Hotels', 'Apartments', 'Hostels or guesthouses', 'Mixed'],
      group: 'style',
      maxLength: 40,
    },
    {
      id: 'must_see',
      label: 'Must-see or must-do',
      kind: 'list',
      placeholder: 'Comma separated',
      maxLength: 800,
    },
    {
      id: 'constraints',
      label: 'Constraints',
      kind: 'longtext',
      placeholder: 'Dietary needs, mobility, visas, fixed dates, things to avoid',
      help: 'Used only to plan this trip.',
      maxLength: 1200,
    },
    materialsField(
      'Drop booking confirmations, a guidebook PDF, a saved list or a map export. Each becomes a card or database.',
    ),
    depthField(
      'Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending.',
    ),
    {
      id: 'sites',
      label: 'Signed-in sources to use',
      kind: 'sites',
      help: 'Only the sites you connected in Settings can be used. Scout reads them as you, read-only; it never books or pays.',
      sites: [
        { domain: 'tripadvisor.com', label: 'Tripadvisor' },
        { domain: 'booking.com', label: 'Booking.com' },
        { domain: 'airbnb.com', label: 'Airbnb' },
        { domain: 'google.com', label: 'Google Travel' },
      ],
      maxLength: 400,
    },
  ],

  frames: [
    {
      id: 'snapshot',
      title: 'Trip snapshot',
      color: 'signal',
      brief:
        'The trip in one view: {{destination}}, the dates ({{dates|to confirm}}), the travellers, the budget ({{budget|to confirm}}), ' +
        'the season there, the visa or entry rule in one line, the daily budget and the one-sentence idea of the trip.',
      owners: ['orb'],
      targets: [
        { type: 'entity', min: 1, note: 'the destination' },
        { type: 'metric', min: 6 },
        { type: 'doc', min: 1, note: 'the idea of the trip' },
      ],
      seeds: [
        {
          type: 'entity',
          data: {
            title: '{{destination}}',
            kind: 'org',
            body: 'The destination, from your intake.',
            facts: [
              { label: 'Dates', value: '{{dates|to confirm}}' },
              { label: 'Travellers', value: '{{travellers|to confirm}}' },
              { label: 'From', value: '{{origin|to confirm}}' },
              { label: 'Pace', value: '{{pace|to confirm}}' },
            ],
          },
          why: 'The destination, from your intake.',
        },
        doc(
          'The idea of the trip',
          'What you want from {{destination}}: {{interests|to confirm}}. orb writes it as one sentence after the first pass.',
        ),
        metric('Days', 'Nights away and days on the ground.'),
        metric('Budget', 'Your total, and the per-day figure.'),
        metric('Season', 'Weather and crowds for the dates, with the source.'),
        metric('Entry rule', 'Visa or entry authorisation and passport validity, from the official source.'),
        metric('Time zone shift', 'Hours from home, and the jet-lag note.'),
        metric('Cost to date', 'Total of the Budget rows that are booked.'),
      ],
      room: 300,
    },
    {
      id: 'transport',
      title: 'Getting there & around',
      color: 'sky',
      brief:
        'Flights or the main route from {{origin|home}}, the transfers, the trains, buses, car hire or internal flights ' +
        'between stops, the passes that pay off, the connections and their buffers, the local transport in each place and the ' +
        'cancellation terms of each booking. Compare origin airports and arrival/departure gateways before fixing city ' +
        'order: choose the best door-to-door route, not automatically the first and last cities in the destination list.',
      owners: ['scout', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Transport legs' },
        { type: 'diagram', min: 1, note: 'the route and its legs' },
        { type: 'source', min: 3 },
      ],
      seeds: [
        db('Transport', 'transport'),
        doc(
          'Gateway and route recommendation',
          'Compare practical origin and destination airports, round-trip and open-jaw routes, connections and ground transfers; recommend one with evidence and tradeoffs.',
        ),
        question(
          'Is a pass or a rail ticket cheaper than point-to-point?',
          'Compare the legs with the pass price.',
        ),
      ],
    },
    {
      id: 'stay',
      title: 'Where to stay',
      color: 'rho',
      brief:
        'Areas to stay in and the options in each: price per night, rating, distance to what you want to do, the ' +
        'transport near it, cancellation terms, what past guests complain about, and the constraints it meets. Several options ' +
        'per stop; one pick per stop with the reason.',
      owners: ['scout', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Stays: at least 3 options per stop' },
        { type: 'product', min: 2, note: 'the leading options' },
        { type: 'quote', min: 3, note: 'including 1 negative' },
      ],
      seeds: [db('Stays', 'stays')],
    },
    {
      id: 'places',
      title: 'Things to do',
      color: 'sky',
      brief:
        'Places, activities and experiences worth the time: what each is, how long it takes, its cost, opening days and ' +
        'times, whether to book ahead, the best time of day, the area and a priority. The must-sees first, then what ' +
        'matches your interests, then the alternatives for a rainy day.',
      owners: ['scout', 'builder'],
      targets: [
        { type: 'database', min: 1, note: 'Places: at least 20 rows' },
        { type: 'image', min: 4 },
        { type: 'video', min: 1, note: 'a walkthrough, linked not embedded' },
      ],
      seeds: [
        db('Places', 'places'),
        question('What is the one thing you would regret missing?', 'Your must-sees and why.'),
      ],
    },
    {
      id: 'food',
      title: 'Food & local life',
      color: 'rho',
      brief:
        'Where to eat and what to try: places with cuisine, area, price band, whether to book, dietary fit and a ' +
        'source; local customs, tipping, phrases, apps, payment methods and what to avoid. Dietary needs from the intake are met or flagged.',
      owners: ['scout'],
      targets: [
        { type: 'database', min: 1, note: 'Food: at least 12 rows' },
        { type: 'quote', min: 3 },
        { type: 'source', min: 3 },
      ],
      seeds: [
        db('Food', 'food'),
        doc(
          'Local notes',
          'Customs, tipping, payment, language and safety notes for {{destination}}, each with a source. Scout writes them after the first pass.',
        ),
      ],
    },
    {
      id: 'itinerary',
      title: 'Itinerary',
      color: 'signal',
      brief:
        'The day-by-day plan: for each day the area, the activities with times, the meals, the transport and the cost, with ' +
        'a buffer, a rest slot on a {{pace|balanced}} pace and a rainy-day swap. Built from the Places, Food, Stays and ' +
        'Transport databases; each row says which booking it needs.',
      owners: ['orb', 'builder', 'critic'],
      targets: [
        { type: 'database', min: 1, note: 'Itinerary: a row per slot' },
        { type: 'timeline', min: 1, note: 'the days at a glance' },
        { type: 'framework', min: 1, note: 'pace: pros and cons of the plan' },
      ],
      seeds: [
        db('Itinerary', 'itinerary'),
        timelineSeed(
          'Trip timeline',
          'Planning started',
          'Builder adds the fixed points: flights, check-ins, tickets with a time, tours, each with a source.',
        ),
        framework('proscons', 'The plan: what works and what is tight'),
        hypothesis(
          'The itinerary fits the pace you asked for',
          'Count the hours and the transfers on each day.',
        ),
      ],
    },
    {
      id: 'budget',
      title: 'Budget',
      color: 'sky',
      brief:
        'The full budget by category and by day, each estimate sourced and dated: transport, stay, activities, ' +
        'food, local transport, insurance, visas, fees and a buffer. The total against the {{budget|budget}}, what is booked, ' +
        'what is not, and the cuts that cost least.',
      owners: ['scout', 'builder', 'orb'],
      targets: [
        { type: 'database', min: 1, note: 'Budget' },
        { type: 'chart', min: 2, note: 'cost by category; cost by day' },
        { type: 'metric', min: 2, note: 'total and buffer' },
      ],
      seeds: [
        db('Budget', 'budget'),
        chartSeed('Cost by category', 'pie', 'budget', 'Category', 'Estimate'),
        chartSeed('Booked against planned', 'bar', 'budget', 'Category', 'Estimate', 'Status'),
        metric('Total estimate', 'Sum of the Budget rows, with the date of the prices.'),
        metric('Buffer left', 'Budget minus the estimate, as a percentage.'),
      ],
    },
    {
      id: 'prep',
      title: 'Prep, risks & packing',
      color: 'paper',
      brief:
        'Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. ' +
        'Documents, insurance, money, phone and data, vaccinations and health rules from official sources (no medical advice), ' +
        'what to book first, what to pack for the season, and a rainy-day and a things-go-wrong plan.',
      owners: ['critic', 'orb', 'scout'],
      targets: [
        { type: 'risk', min: 5, note: 'every checklist item cleared with a source or raised' },
        { type: 'checklist', min: 2, note: 'documents and packing' },
        { type: 'decision', min: 1, note: 'ready to book' },
      ],
      seeds: [
        flagChecklist('Trip red flags', TRIP_FLAGS),
        checklist('Documents and bookings', [
          'Passport valid for the rule at the destination, with its date.',
          'Visa or entry authorisation, if needed, with the official link.',
          'Travel insurance that covers the activities planned.',
          'Book first: the transport that sells out, the stay in the busiest area.',
        ]),
        checklist('Packing', [
          'Clothes for the season at the destination.',
          'Adapters, chargers and a way to pay that works there.',
          'Medication and copies of documents.',
        ]),
        emptyRisk('Documents and entry'),
        emptyRisk(
          'Safety and health',
          'Nothing raised yet. Critic raises an advisory or a health rule from an official source here, or clears it.',
        ),
        emptyRisk('Weather and season'),
        emptyRisk('Money and fees'),
        decisionSeed(
          'Ready to book?',
          ['Book as planned', 'Adjust the plan', 'Change dates', 'Rethink the destination'],
          'Open. orb proposes after the rubric is filled and writes the weighted total here. You decide; orb never books.',
        ),
        scorecard(TRIP_RUBRIC),
      ],
    },
  ],

  databases: [
    {
      key: 'transport',
      name: 'Transport',
      frame: 'transport',
      purpose: 'Every leg of the trip, in order, with its price, its buffer and its terms.',
      keyColumn: 'Leg',
      columns: [
        col('Leg'),
        col('From'),
        col('To'),
        col('Departs', 'date'),
        col('Arrives', 'date'),
        col('Mode', 'enum', { options: ['Flight', 'Train', 'Bus', 'Ferry', 'Car', 'Transfer', 'Local'] }),
        col('Provider'),
        col('Duration (hours)', 'number'),
        col('Price', 'currency'),
        col('Terms', 'enum', { options: ['Refundable', 'Changeable', 'Non-refundable', 'Not booked'] }),
        col('Buffer to next leg (minutes)', 'number'),
        col('Source', 'url'),
      ],
      views: [
        { name: 'In order', kind: 'table', sort: [{ column: 'Departs', dir: 'asc' }] },
        { name: 'By mode', kind: 'board', group: 'Mode' },
        {
          name: 'Tight',
          kind: 'table',
          filter: [{ column: 'Buffer to next leg (minutes)', op: 'lt', value: 90 }],
        },
      ],
    },
    {
      key: 'stays',
      name: 'Stays',
      frame: 'stay',
      purpose:
        'Stay options per stop, with price, rating, location and terms. Found with find_entities, enriched with batch_enrich.',
      keyColumn: 'Name',
      columns: [
        col('Name'),
        col('Stop'),
        col('Area'),
        col('Type', 'enum', { options: ['Hotel', 'Apartment', 'Hostel', 'Guesthouse', 'Other'] }),
        col('Price per night', 'currency'),
        col('Rating', 'rating', { note: '1 to 5, from the booking site; the number of reviews in Notes.' }),
        col('Near', 'text', { note: 'Transport and what you want to do, in minutes.' }),
        col('Terms', 'enum', { options: ['Free cancellation', 'Partly refundable', 'Non-refundable'] }),
        col('Meets constraints', 'boolean'),
        col('Pick', 'boolean', { note: 'The pick for the stop.' }),
        col('Notes', 'text', { note: 'What guests complain about.' }),
        col('URL', 'url'),
      ],
      views: [
        { name: 'By stop', kind: 'table', group: 'Stop' },
        { name: 'Picks', kind: 'table', filter: [{ column: 'Pick', op: 'eq', value: true }] },
        { name: 'Gallery', kind: 'gallery' },
      ],
    },
    {
      key: 'places',
      name: 'Places',
      frame: 'places',
      purpose: 'Things to do: what, where, how long, how much, when, and how much you want it.',
      keyColumn: 'Name',
      columns: [
        col('Name'),
        col('Category', 'enum', {
          options: ['Landmark', 'Museum', 'Nature', 'Neighbourhood', 'Activity', 'Tour', 'Day trip', 'Event'],
        }),
        col('Stop'),
        col('Area'),
        col('Time needed (hours)', 'number'),
        col('Cost', 'currency'),
        col('Opens', 'text', { note: 'Days and hours, incl. closed days.' }),
        col('Book ahead', 'boolean'),
        col('Best time', 'text'),
        col('Priority', 'rating', { note: '1 (skip) to 5 (must do).' }),
        col('URL', 'url'),
      ],
      views: [
        { name: 'By priority', kind: 'table', sort: [{ column: 'Priority', dir: 'desc' }] },
        { name: 'By category', kind: 'board', group: 'Category' },
        { name: 'Gallery', kind: 'gallery' },
        { name: 'Book ahead', kind: 'table', filter: [{ column: 'Book ahead', op: 'eq', value: true }] },
      ],
    },
    {
      key: 'food',
      name: 'Food',
      frame: 'food',
      purpose: 'Places to eat and dishes to try, with price band, dietary fit and whether to book.',
      keyColumn: 'Name',
      columns: [
        col('Name'),
        col('Stop'),
        col('Area'),
        col('Cuisine'),
        col('Price band', 'enum', { options: ['$', '$$', '$$$', '$$$$'] }),
        col('Dietary fit', 'text', { note: 'Which of your needs it meets, as the menu or the venue says.' }),
        col('Book ahead', 'boolean'),
        col('Why', 'text'),
        col('Source', 'url'),
      ],
      views: [
        { name: 'By stop', kind: 'table', group: 'Stop' },
        { name: 'By price', kind: 'board', group: 'Price band' },
      ],
    },
    {
      key: 'itinerary',
      name: 'Itinerary',
      frame: 'itinerary',
      purpose: 'One row per slot of the day-by-day plan, linked to the place, the stay or the leg it uses.',
      keyColumn: 'Day and slot',
      columns: [
        col('Day and slot'),
        col('Day', 'number'),
        col('Date', 'date'),
        col('Slot', 'enum', { options: ['Morning', 'Midday', 'Afternoon', 'Evening', 'Transfer'] }),
        col('Activity'),
        col('Place or leg', 'text', { note: 'The name of the row in Places, Food, Stays or Transport.' }),
        col('Hours', 'number'),
        col('Cost', 'currency'),
        col('Needs booking', 'boolean'),
        col('Rainy-day swap', 'text'),
        col('Notes', 'text'),
      ],
      views: [
        { name: 'By day', kind: 'table', sort: [{ column: 'Day', dir: 'asc' }] },
        {
          name: 'Needs booking',
          kind: 'table',
          filter: [{ column: 'Needs booking', op: 'eq', value: true }],
        },
      ],
    },
    {
      key: 'budget',
      name: 'Budget',
      frame: 'budget',
      purpose: 'Every cost with its estimate, its source and whether it is booked.',
      keyColumn: 'Item',
      columns: [
        col('Item'),
        col('Category', 'enum', {
          options: [
            'Transport',
            'Stay',
            'Activities',
            'Food',
            'Local transport',
            'Insurance',
            'Visas and fees',
            'Buffer',
            'Other',
          ],
        }),
        col('Estimate', 'currency', { note: 'One currency; say which and the rate date in Note.' }),
        col('Status', 'enum', { options: ['Estimate', 'Quoted', 'Booked', 'Paid'] }),
        col('Day', 'number'),
        col('Source', 'url'),
        col('Note', 'text'),
      ],
      views: [
        { name: 'By category', kind: 'board', group: 'Category' },
        { name: 'All', kind: 'table', sort: [{ column: 'Estimate', dir: 'desc' }] },
        {
          name: 'Not booked',
          kind: 'table',
          filter: [{ column: 'Status', op: 'in', value: ['Estimate', 'Quoted'] }],
        },
      ],
    },
  ],

  plan: {
    orb: [
      step({
        id: 'read-materials',
        text:
          'Read the uploaded materials first (confirmations, guidebook, saved lists): read_card, read_source, query_dataset. Put each ' +
          'confirmed booking into Transport or Stays (upsert_rows) with Terms and its price into Budget with Status Booked. Hand the ' +
          'dates, the pace, the constraints, the must-sees and the ticked sources to Scout in its delegate instruction.',
        tools: ['board_map', 'read_card', 'read_source', 'query_dataset', 'upsert_rows'],
        frames: ['transport', 'stay', 'budget'],
      }),
      step({
        id: 'delegate',
        text:
          'Delegate with delegate: Scout first (its playbook), Builder once Places and Transport have rows, Critic once Scout has sources. ' +
          'Say that nothing is booked, paid or sent by any agent.',
        tools: ['delegate', 'message_agent'],
      }),
      step({
        id: 'gateway-decision',
        text:
          'Before the itinerary, compare the gateways Scout found. Choose the convenient origin airport (Chennai normally MAA), ' +
          'arrival and return airports by total door-to-door time, stops, baggage, through-ticket protection, ground transfers, ' +
          'cost and backtracking. For a Germany/central-Europe route explicitly test Chennai–Frankfurt round trip and a ' +
          'sensible open-jaw alternative; do not assume the first named city is the arrival airport. Fill Gateway and route ' +
          'recommendation with the preferred route, alternatives, evidence, dated fare assumptions and the reason. Use the ' +
          'chosen gateway to order the stops; offer a shorter itinerary if the requested route is overpacked.',
        tools: ['query_dataset', 'read_card', 'update_card', 'delegate'],
        frames: ['transport', 'itinerary'],
      }),
      step({
        id: 'snapshot',
        text: 'After Scout’s first pass, fill the Snapshot metrics (update_card) and the idea of the trip, each with a cited figure. Never write a price or a rule you cannot source.',
        tools: ['query_board', 'search_board', 'update_card', 'query_dataset'],
        frames: ['snapshot'],
      }),
      step({
        id: 'itinerary',
        text:
          'Build the Itinerary database from Places, Food, Stays and Transport: one row per slot (upsert_rows), grouped by area to cut transfers, ' +
          'rest at the pace asked for ({{pace|balanced}}), a rainy-day swap on each outdoor slot, and a Needs booking flag. Keep fixed points on the Trip timeline.',
        tools: ['query_dataset', 'upsert_rows', 'place_card', 'update_card'],
        frames: ['itinerary'],
      }),
      step({
        id: 'gaps',
        text: 'For a gap Scout could not close (a closure, a rule, a price), run deep_research (core) on that one question. Ask before spend over $0.50.',
        tools: ['deep_research', 'research_status', 'ask_user_question'],
        frames: ['prep'],
        minTier: 'standard',
        askAboveUsd: 0.5,
      }),
      step({
        id: 'rubric',
        text:
          'Fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with a cited card in the why line. ' +
          'Update the hypothesis, the pros and cons of the plan and the “Ready to book?” Decision with your proposal and the weighted total. The user decides.',
        tools: ['query_board', 'read_card', 'update_card', 'place_card', 'add_link'],
        frames: ['prep', 'itinerary'],
      }),
      step({
        id: 'memo',
        text: 'Write the trip plan with compose_section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. The deck follows with compose_slides if asked.',
        tools: ['compose_section', 'compose_slides'],
      }),
      step({
        id: 'monitor',
        text: 'Only when the user asks to watch fares, advisories or strikes: watch_topic with the monitor query. Each monitor is confirmed by the user.',
        tools: ['watch_topic', 'list_watches', 'stop_watch'],
        minTier: 'standard',
      }),
    ],
    scout: [
      step({
        id: 'destination',
        text: 'The destination first: official tourism and government entry pages, the season and events calendar for the dates (fetch_url, parallel_extract, web_search). Entry rule, time zone and season as sourced Snapshot figures. Calculate time differences from the actual travel dates and daylight-saving rules, not a fixed country offset. The destination’s official page as a source card; capture_page for the tourism board’s home page.',
        tools: ['fetch_url', 'parallel_extract', 'web_search', 'capture_page', 'place_card'],
        frames: ['snapshot'],
      }),
      step({
        id: 'transport',
        text: 'Transport: compare gateways from {{origin|home}}. Identify the convenient origin airport and compare at least two arrival/return gateways, round trip versus open jaw, nonstop versus connections and airport-to-city/rail transfers. For Chennai and a Germany/central-Europe trip investigate MAA–FRA–MAA before defaulting to Budapest or a small airport. Recommend by door-to-door time, stops, reliable connections, baggage and cost, then order cities to reduce backtracking. Put sourced alternatives and selected legs in Transport (upsert_rows, key Leg), with durations, dated indicative prices, transfer buffers and terms. Unavailable future fares block only a fare cell; fill real route options and the rest of the plan. Do not search for personal data of any traveller.',
        tools: [
          'web_search',
          'fetch_url',
          'parallel_extract',
          'fetch_signed_in',
          'upsert_rows',
          'place_card',
        ],
        frames: ['transport'],
      }),
      step({
        id: 'stay',
        text: 'Stay: for EACH overnight stop find at least three real options meeting the constraints and style. Use find_entities and batch_enrich when available; on ANY tier fall back to web_search and fetch_url if Parallel has no key or fails. Upsert the options into the EXISTING Stays dataset (key Name), with area, source, dated indicative price, terms where published and one recommended pick per stop. Mark only unavailable future price/availability cells as unverified; do not leave the whole table empty. Quote recurring review complaints and place product cards for the picks.',
        tools: [
          'find_entities',
          'batch_enrich',
          'web_search',
          'fetch_url',
          'fetch_signed_in',
          'query_dataset',
          'upsert_rows',
          'place_card',
        ],
        frames: ['stay'],
      }),
      step({
        id: 'places',
        text: 'Things to do: the must-sees from the intake first, then what matches the interests; one row per place in Places (upsert_rows, key Name) with time needed, cost, opening days and hours (including closed days), whether to book ahead and a priority. Image cards (image_search or capture_page), a video card for a walkthrough, linked not embedded.',
        tools: [
          'web_search',
          'fetch_url',
          'parallel_extract',
          'capture_page',
          'image_search',
          'upsert_rows',
          'place_card',
        ],
        frames: ['places'],
      }),
      step({
        id: 'food',
        text: 'Food: places that meet the dietary needs from the intake, by area; one row per place in Food (upsert_rows, key Name); quote cards from reviews, including a critical one; the Local notes card (customs, tipping, payment, phrases), each with a source.',
        tools: ['web_search', 'fetch_url', 'upsert_rows', 'place_card'],
        frames: ['food'],
      }),
      step({
        id: 'budget',
        text: 'Budget: one row per cost in Budget (upsert_rows, key Item) with an estimate in one currency, a Status, a source and the date of the price; include insurance, visas, local transport and a 10 percent buffer.',
        tools: ['web_search', 'fetch_url', 'upsert_rows', 'query_dataset'],
        frames: ['budget'],
      }),
      step({
        id: 'official-rules',
        text: 'The official rules for Critic: your own government’s travel advisory and the destination’s entry, customs and health pages for the dates (fetch_url, web_search). Source cards only; no interpretation of health matters.',
        tools: ['web_search', 'fetch_url', 'place_card'],
        frames: ['prep'],
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
        text: 'Start after Scout’s first sources: read the cards of every frame (board_map, search_board, read_card) and the Transport, Stays, Places and Itinerary rows (query_dataset) before judging anything.',
        tools: ['board_map', 'search_board', 'read_card', 'query_board', 'query_dataset'],
      }),
      step({
        id: 'red-flags',
        text: 'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." citing the source cards that clear it (an insight needs at least two cited cards). For health items say “check with a doctor”; you give no medical advice. You cannot tick the checklist: the user does.',
        tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
        frames: ['prep', 'transport', 'stay'],
      }),
      step({
        id: 'itinerary-check',
        text: 'Check the Itinerary row by row: closures on the day, connections under 90 minutes, a day over the pace limit, a place that needs a booking nobody has made. Raise each as a Risk card linked to the row’s card, or a Question to the user.',
        tools: ['query_dataset', 'query_board', 'place_card', 'add_link'],
        frames: ['itinerary'],
      }),
      step({
        id: 'single-source',
        text: 'Challenge every price and every rule with a single source or an old date: link tension to the card that disagrees or place a Question asking for the second source. Say which cost could break the budget.',
        tools: ['query_dataset', 'read_card', 'add_link', 'place_card'],
        frames: ['stay', 'transport'],
      }),
      step({
        id: 'report',
        text: 'Report progress per frame; send_message to orb when the checklist is complete, naming the flags raised.',
        tools: ['report_progress', 'send_message'],
      }),
    ],
    builder: [
      step({
        id: 'route',
        text: 'The route as a diagram: stops, legs, modes and times from Transport, the connection buffers marked, and a second diagram of a typical day in the busiest area if that helps.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['transport'],
      }),
      step({
        id: 'timeline',
        text: 'The trip timeline: the fixed points (flights, check-ins, timed tickets, tours) as a timeline card, from Transport, Stays and Itinerary; and the days at a glance.',
        tools: ['place_card', 'query_dataset', 'read_card'],
        frames: ['itinerary'],
      }),
      step({
        id: 'budget',
        text: 'The budget charts: cost by category (pie) and booked against planned (bar), bound to Budget; the totals into the metrics.',
        tools: ['place_card', 'query_dataset'],
        frames: ['budget'],
      }),
      step({
        id: 'maps',
        text: 'A neighbourhood chooser for the places: a chart or a diagram of the areas with the number of priority places in each, from Places, so that the stay is picked near the most.',
        tools: ['place_card', 'query_dataset'],
        frames: ['places', 'itinerary'],
      }),
      step({
        id: 'summary',
        text: 'Optional one-page visual summary (a design frame): the route, the days, the cost and the three things to book first, built only from cards on the board.',
        tools: ['write_design_frame', 'query_board', 'read_card'],
        frames: ['itinerary'],
        minTier: 'standard',
      }),
    ],
  },

  rubric: [...TRIP_RUBRIC],
  redFlags: [...TRIP_FLAGS],

  output: {
    memoTitle: 'Trip plan: {{destination}}',
    citationRule:
      'Every paragraph cites cards; every price, opening hour and rule cites its source and the date it was seen; estimates are marked as such.',
    sections: [
      {
        id: 'summary',
        title: 'The trip at a glance',
        frames: ['snapshot', 'prep'],
        words: 150,
        guidance:
          'The idea, the dates, the total cost against the budget, the score and the three things to book first, in at most 150 words.',
      },
      {
        id: 'transport',
        title: 'Getting there & around',
        frames: ['transport'],
        guidance: 'The route with the legs table and the connection buffers.',
      },
      {
        id: 'stay',
        title: 'Where to stay',
        frames: ['stay'],
        guidance: 'The pick for each stop, the alternatives and the guest complaints worth knowing.',
      },
      {
        id: 'places',
        title: 'Things to do',
        frames: ['places'],
        guidance: 'The must-sees, then the rest by area, with time, cost and booking notes.',
      },
      {
        id: 'food',
        title: 'Food & local notes',
        frames: ['food'],
        guidance: 'Where to eat by area, and the customs, tipping and payment notes.',
      },
      {
        id: 'itinerary',
        title: 'Day by day',
        frames: ['itinerary'],
        guidance: 'Each day with its slots, transfers, meals, cost and the rainy-day swap.',
      },
      {
        id: 'budget',
        title: 'Budget',
        frames: ['budget'],
        guidance: 'The cost table and charts against the budget, booked against planned.',
      },
      {
        id: 'prep',
        title: 'Before you go',
        frames: ['prep'],
        guidance: 'The red-flag outcomes, the documents and booking order, and the packing list.',
      },
      {
        id: 'scorecard',
        title: 'Scorecard',
        frames: ['prep'],
        guidance: 'The rubric table: each dimension, weight, score and evidence.',
      },
    ],
    appendix: 'All sources',
    onePager: {
      title: 'Trip one-pager: {{destination}}',
      includes: [
        'Dates and route',
        'Days at a glance',
        'Total cost against budget',
        'Book first',
        'Documents',
      ],
    },
    deckFormat: 'standard',
  },

  tiers: tiers({
    quickSummary:
      'No deep research: official pages, search, extract and the signed-in fetches ticked, at most 12 cards per frame; the plan is the summary only.',
    standardSummary:
      'Quick, plus stays and places found with entity discovery and enriched, and one or two deep-research runs (core) on rules and closures, asking before spend.',
    deepSummary:
      'Standard, plus FindAll for the full list of stays and places, pro research on the hardest unknowns and the full trip plan.',
    deepRuns: 4,
  }),

  followUps: [
    {
      label: 'Make it cheaper',
      prompt:
        'Cut the cost of the trip to {{destination}} by 15 percent: what to change, what it saves and what it costs in the experience.',
    },
    {
      label: 'Add a day trip',
      prompt:
        'Add a day trip from [a stop] to the itinerary for {{destination}}: where, how to get there, the cost, and what it replaces.',
    },
    {
      label: 'Rainy-day plan',
      prompt:
        'Build a rainy-day plan for every outdoor day of the trip to {{destination}}: indoor options near each, with hours and cost.',
    },
    {
      label: 'Slow it down',
      prompt:
        'The plan feels packed. Slow the trip to {{destination}} down: which days to cut, with the rest of the plan re-timed.',
    },
    {
      label: 'What to book first',
      prompt:
        'What must be booked first for {{destination}}, in what order and by which date, with the cancellation terms of each?',
    },
    {
      label: 'Watch fares and advisories',
      prompt:
        'Watch fares, strikes and travel advisories for {{destination}} and tell me what changes the plan.',
    },
  ],

  signedIn: [
    {
      domain: 'tripadvisor.com',
      label: 'Tripadvisor',
      use: 'Saved lists, reviews and rankings, as visible to the user.',
    },
    {
      domain: 'booking.com',
      label: 'Booking.com',
      use: 'Your saved stays, prices for the dates and cancellation terms. Read-only: it never books.',
    },
    {
      domain: 'airbnb.com',
      label: 'Airbnb',
      use: 'Saved listings and prices for the dates. Read-only: it never books.',
    },
    { domain: 'google.com', label: 'Google Travel', use: 'Saved places and fare calendars. Read-only.' },
  ],

  monitor: {
    query: '{{destination}} travel advisories, strikes, closures, flight price changes and weather alerts',
    why: 'Changes that would change the plan or the price before the dates.',
  },
};
