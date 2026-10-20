# Trip planning

<!-- Generated from packages/shared/src/templates/trip-planning.ts by `pnpm templates:docs`. Do not edit by hand. -->

Plan a trip: the destination and the dates, the transport, where to stay, what to do, where to eat, a day-by-day itinerary that matches the pace asked for, the budget and the preparation (documents, safety, packing). Eight numbered frames, a weighted rubric and a trip plan. Prices, hours and rules are sourced and dated; nothing is booked by orb.

Template id `trip-planning`. Canvas title: `Trip: {{destination}}`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Destination (`destination`) | text | yes | placeholder "Japan: Tokyo, Kyoto and Osaka" |
| Dates (or how flexible) (`dates`) | text | yes | placeholder "3 to 17 April, flexible by two days" |
| Travelling from (`origin`) | text | no | placeholder "Manchester" |
| Who is travelling (`travellers`) | text | no | placeholder "2 adults, one child aged 7" |
| Budget (`budget`) | text | yes | placeholder "£4,500 in total" |
| What you want from the trip (`interests`) | longtext | yes | placeholder "Food, old temples, hiking, no more than two cities…" |
| Pace (`pace`) | select | no | one of Relaxed, Balanced, Packed |
| Where you like to stay (`stay_style`) | select | no | one of Hotels, Apartments, Hostels or guesthouses, Mixed |
| Must-see or must-do (`must_see`) | list | no | placeholder "Comma separated" |
| Constraints (`constraints`) | longtext | no | placeholder "Dietary needs, mobility, visas, fixed dates, things to avoid". Used only to plan this trip. |
| Materials (`materials`) | materials | no | Drop booking confirmations, a guidebook PDF, a saved list or a map export. Each becomes a card or database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites Tripadvisor, Booking.com, Airbnb, Google Travel. Only the sites you connected in Settings can be used. Scout reads them as you, read-only; it never books or pays. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, suggest_task_spec, parallel_extract, web_answer, image_search, entity_search, research_memory, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, batch_enrich, suggest_task_spec, parallel_extract, web_answer, image_search, entity_search, research_memory, watch_topic, find_entities_extend | 4 | no limit | full |

- **Quick scan:** No deep research: official pages, search, extract and the signed-in fetches ticked, at most 12 cards per frame; the plan is the summary only.
- **Standard:** Quick, plus stays and places found with entity discovery and enriched, and one or two deep-research runs (core) on rules and closures, asking before spend.
- **Deep:** Standard, plus FindAll for the full list of stays and places, pro research on the hardest unknowns and the full trip plan.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 TRIP SNAPSHOT (signal; orb)

Brief: The trip in one view: {{destination}}, the dates ({{dates|to confirm}}), the travellers, the budget ({{budget|to confirm}}), the season there, the visa or entry rule in one line, the daily budget and the one-sentence idea of the trip.

Target: 1+ entity (the destination); 6+ metric; 1+ doc (the idea of the trip).

Seed cards:
- entity: {{destination}}
- doc: The idea of the trip
- metric: Days
- metric: Budget
- metric: Season
- metric: Entry rule
- metric: Time zone shift
- metric: Cost to date

### 02 GETTING THERE & AROUND (sky; scout, builder, critic)

Brief: Flights or the main route from {{origin|home}}, the transfers, the trains, buses, car hire or internal flights between stops, the passes that pay off, the connections and their buffers, the local transport in each place and the cancellation terms of each booking. Compare origin airports and arrival/departure gateways before fixing city order: choose the best door-to-door route, not automatically the first and last cities in the destination list.

Target: 1+ database (Transport legs); 1+ diagram (the route and its legs); 3+ source.

Seed cards:
- database: Transport (database `transport`)
- doc: Gateway and route recommendation
- question: Is a pass or a rail ticket cheaper than point-to-point?

### 03 WHERE TO STAY (rho; scout, critic)

Brief: Areas to stay in and the options in each: price per night, rating, distance to what you want to do, the transport near it, cancellation terms, what past guests complain about, and the constraints it meets. Several options per stop; one pick per stop with the reason.

Target: 1+ database (Stays: at least 3 options per stop); 2+ product (the leading options); 3+ quote (including 1 negative).

Seed cards:
- database: Stays (database `stays`)

### 04 THINGS TO DO (sky; scout, builder)

Brief: Places, activities and experiences worth the time: what each is, how long it takes, its cost, opening days and times, whether to book ahead, the best time of day, the area and a priority. The must-sees first, then what matches your interests, then the alternatives for a rainy day.

Target: 1+ database (Places: at least 20 rows); 4+ image; 1+ video (a walkthrough, linked not embedded).

Seed cards:
- database: Places (database `places`)
- question: What is the one thing you would regret missing?

### 05 FOOD & LOCAL LIFE (rho; scout)

Brief: Where to eat and what to try: places with cuisine, area, price band, whether to book, dietary fit and a source; local customs, tipping, phrases, apps, payment methods and what to avoid. Dietary needs from the intake are met or flagged.

Target: 1+ database (Food: at least 12 rows); 3+ quote; 3+ source.

Seed cards:
- database: Food (database `food`)
- doc: Local notes

### 06 ITINERARY (signal; orb, builder, critic)

Brief: The day-by-day plan: for each day the area, the activities with times, the meals, the transport and the cost, with a buffer, a rest slot on a {{pace|balanced}} pace and a rainy-day swap. Built from the Places, Food, Stays and Transport databases; each row says which booking it needs.

Target: 1+ database (Itinerary: a row per slot); 1+ timeline (the days at a glance); 1+ framework (pace: pros and cons of the plan).

Seed cards:
- database: Itinerary (database `itinerary`)
- timeline: Trip timeline
- framework: The plan: what works and what is tight
- hypothesis: The itinerary fits the pace you asked for

### 07 BUDGET (sky; scout, builder, orb)

Brief: The full budget by category and by day, each estimate sourced and dated: transport, stay, activities, food, local transport, insurance, visas, fees and a buffer. The total against the {{budget|budget}}, what is booked, what is not, and the cuts that cost least.

Target: 1+ database (Budget); 2+ chart (cost by category; cost by day); 2+ metric (total and buffer).

Seed cards:
- database: Budget (database `budget`)
- chart: Cost by category (database `budget`)
- chart: Booked against planned (database `budget`)
- metric: Total estimate
- metric: Buffer left

### 08 PREP, RISKS & PACKING (paper; critic, orb, scout)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Documents, insurance, money, phone and data, vaccinations and health rules from official sources (no medical advice), what to book first, what to pack for the season, and a rainy-day and a things-go-wrong plan.

Target: 5+ risk (every checklist item cleared with a source or raised); 2+ checklist (documents and packing); 1+ decision (ready to book).

Seed cards:
- checklist: Trip red flags
- checklist: Documents and bookings
- checklist: Packing
- risk: Documents and entry risk
- risk: Safety and health risk
- risk: Weather and season risk
- risk: Money and fees risk
- decision: Ready to book?
- matrix: Scorecard (rubric score x 2, so 10 is a 5)

## Databases

### Transport (frame `transport`)

Every leg of the trip, in order, with its price, its buffer and its terms.

| Column | Type | Notes |
|---|---|---|
| Leg | text |  |
| From | text |  |
| To | text |  |
| Departs | date |  |
| Arrives | date |  |
| Mode | enum (Flight, Train, Bus, Ferry, Car, Transfer, Local) |  |
| Provider | text |  |
| Duration (hours) | number |  |
| Price | currency |  |
| Terms | enum (Refundable, Changeable, Non-refundable, Not booked) |  |
| Buffer to next leg (minutes) | number |  |
| Source | url |  |

Views: In order (table, sorted by Departs asc); By mode (board, by Mode); Tight (table, filtered).

### Stays (frame `stay`)

Stay options per stop, with price, rating, location and terms. Found with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| Stop | text |  |
| Area | text |  |
| Type | enum (Hotel, Apartment, Hostel, Guesthouse, Other) |  |
| Price per night | currency |  |
| Rating | rating | 1 to 5, from the booking site; the number of reviews in Notes. |
| Near | text | Transport and what you want to do, in minutes. |
| Terms | enum (Free cancellation, Partly refundable, Non-refundable) |  |
| Meets constraints | boolean |  |
| Pick | boolean | The pick for the stop. |
| Notes | text | What guests complain about. |
| URL | url |  |

Views: By stop (table, by Stop); Picks (table, filtered); Gallery (gallery).

### Places (frame `places`)

Things to do: what, where, how long, how much, when, and how much you want it.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| Category | enum (Landmark, Museum, Nature, Neighbourhood, Activity, Tour, Day trip, Event) |  |
| Stop | text |  |
| Area | text |  |
| Time needed (hours) | number |  |
| Cost | currency |  |
| Opens | text | Days and hours, incl. closed days. |
| Book ahead | boolean |  |
| Best time | text |  |
| Priority | rating | 1 (skip) to 5 (must do). |
| URL | url |  |

Views: By priority (table, sorted by Priority desc); By category (board, by Category); Gallery (gallery); Book ahead (table, filtered).

### Food (frame `food`)

Places to eat and dishes to try, with price band, dietary fit and whether to book.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| Stop | text |  |
| Area | text |  |
| Cuisine | text |  |
| Price band | enum ($, $$, $$$, $$$$) |  |
| Dietary fit | text | Which of your needs it meets, as the menu or the venue says. |
| Book ahead | boolean |  |
| Why | text |  |
| Source | url |  |

Views: By stop (table, by Stop); By price (board, by Price band).

### Itinerary (frame `itinerary`)

One row per slot of the day-by-day plan, linked to the place, the stay or the leg it uses.

| Column | Type | Notes |
|---|---|---|
| Day and slot | text |  |
| Day | number |  |
| Date | date |  |
| Slot | enum (Morning, Midday, Afternoon, Evening, Transfer) |  |
| Activity | text |  |
| Place or leg | text | The name of the row in Places, Food, Stays or Transport. |
| Hours | number |  |
| Cost | currency |  |
| Needs booking | boolean |  |
| Rainy-day swap | text |  |
| Notes | text |  |

Views: By day (table, sorted by Day asc); Needs booking (table, filtered).

### Budget (frame `budget`)

Every cost with its estimate, its source and whether it is booked.

| Column | Type | Notes |
|---|---|---|
| Item | text |  |
| Category | enum (Transport, Stay, Activities, Food, Local transport, Insurance, Visas and fees, Buffer, Other) |  |
| Estimate | currency | One currency; say which and the rate date in Note. |
| Status | enum (Estimate, Quoted, Booked, Paid) |  |
| Day | number |  |
| Source | url |  |
| Note | text |  |

Views: By category (board, by Category); All (table, sorted by Estimate desc); Not booked (table, filtered).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first (confirmations, guidebook, saved lists): read_card, read_source, query_dataset. Put each confirmed booking into Transport or Stays (upsert_rows) with Terms and its price into Budget with Status Booked. Hand the dates, the pace, the constraints, the must-sees and the ticked sources to Scout in its delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (its playbook), Builder once Places and Transport have rows, Critic once Scout has sources. Say that nothing is booked, paid or sent by any agent. Tools: `delegate`, `message_agent`.
3. Before the itinerary, compare the gateways Scout found. Choose the convenient origin airport (Chennai normally MAA), arrival and return airports by total door-to-door time, stops, baggage, through-ticket protection, ground transfers, cost and backtracking. For a Germany/central-Europe route explicitly test Chennai–Frankfurt round trip and a sensible open-jaw alternative; do not assume the first named city is the arrival airport. Fill Gateway and route recommendation with the preferred route, alternatives, evidence, dated fare assumptions and the reason. Use the chosen gateway to order the stops; offer a shorter itinerary if the requested route is overpacked. Tools: `query_dataset`, `read_card`, `update_card`, `delegate`.
4. After Scout’s first pass, fill the Snapshot metrics (update_card) and the idea of the trip, each with a cited figure. Never write a price or a rule you cannot source. Tools: `query_board`, `search_board`, `update_card`, `query_dataset`.
5. Build the Itinerary database from Places, Food, Stays and Transport: one row per slot (upsert_rows), grouped by area to cut transfers, rest at the pace asked for ({{pace|balanced}}), a rainy-day swap on each outdoor slot, and a Needs booking flag. Keep fixed points on the Trip timeline. Tools: `query_dataset`, `upsert_rows`, `place_card`, `update_card`.
6. For a gap Scout could not close (a closure, a rule, a price), run deep_research (core) on that one question. Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
7. Fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with a cited card in the why line. Update the hypothesis, the pros and cons of the plan and the “Ready to book?” Decision with your proposal and the weighted total. The user decides. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
8. Write the trip plan with compose_section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. The deck follows with compose_slides if asked. Tools: `compose_section`, `compose_slides`.
9. Only when the user asks to watch fares, advisories or strikes: watch_topic with the monitor query. Each monitor is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. The destination first: official tourism and government entry pages, the season and events calendar for the dates (fetch_url, parallel_extract, web_search). Entry rule, time zone and season as sourced Snapshot figures. Calculate time differences from the actual travel dates and daylight-saving rules, not a fixed country offset. The destination’s official page as a source card; capture_page for the tourism board’s home page. Tools: `fetch_url`, `parallel_extract`, `web_search`, `capture_page`, `place_card`.
2. Transport: compare gateways from {{origin|home}}. Identify the convenient origin airport and compare at least two arrival/return gateways, round trip versus open jaw, nonstop versus connections and airport-to-city/rail transfers. For Chennai and a Germany/central-Europe trip investigate MAA–FRA–MAA before defaulting to Budapest or a small airport. Recommend by door-to-door time, stops, reliable connections, baggage and cost, then order cities to reduce backtracking. Put sourced alternatives and selected legs in Transport (upsert_rows, key Leg), with durations, dated indicative prices, transfer buffers and terms. Unavailable future fares block only a fare cell; fill real route options and the rest of the plan. Do not search for personal data of any traveller. Tools: `web_search`, `fetch_url`, `parallel_extract`, `fetch_signed_in`, `upsert_rows`, `place_card`.
3. Stay: for EACH overnight stop find at least three real options meeting the constraints and style. Use find_entities and batch_enrich when available; on ANY tier fall back to web_search and fetch_url if Parallel has no key or fails. Upsert the options into the EXISTING Stays dataset (key Name), with area, source, dated indicative price, terms where published and one recommended pick per stop. Mark only unavailable future price/availability cells as unverified; do not leave the whole table empty. Quote recurring review complaints and place product cards for the picks. Tools: `find_entities`, `batch_enrich`, `web_search`, `fetch_url`, `fetch_signed_in`, `query_dataset`, `upsert_rows`, `place_card`.
4. Things to do: the must-sees from the intake first, then what matches the interests; one row per place in Places (upsert_rows, key Name) with time needed, cost, opening days and hours (including closed days), whether to book ahead and a priority. Image cards (image_search or capture_page), a video card for a walkthrough, linked not embedded. Tools: `web_search`, `fetch_url`, `parallel_extract`, `capture_page`, `image_search`, `upsert_rows`, `place_card`.
5. Food: places that meet the dietary needs from the intake, by area; one row per place in Food (upsert_rows, key Name); quote cards from reviews, including a critical one; the Local notes card (customs, tipping, payment, phrases), each with a source. Tools: `web_search`, `fetch_url`, `upsert_rows`, `place_card`.
6. Budget: one row per cost in Budget (upsert_rows, key Item) with an estimate in one currency, a Status, a source and the date of the price; include insurance, visas, local transport and a 10 percent buffer. Tools: `web_search`, `fetch_url`, `upsert_rows`, `query_dataset`.
7. The official rules for Critic: your own government’s travel advisory and the destination’s entry, customs and health pages for the dates (fetch_url, web_search). Source cards only; no interpretation of health matters. Tools: `web_search`, `fetch_url`, `place_card`.
8. Deep research for the gaps that remain: deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout’s first sources: read the cards of every frame (board_map, search_board, read_card) and the Transport, Stays, Places and Itinerary rows (query_dataset) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`, `query_dataset`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." citing the source cards that clear it (an insight needs at least two cited cards). For health items say “check with a doctor”; you give no medical advice. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Check the Itinerary row by row: closures on the day, connections under 90 minutes, a day over the pace limit, a place that needs a booking nobody has made. Raise each as a Risk card linked to the row’s card, or a Question to the user. Tools: `query_dataset`, `query_board`, `place_card`, `add_link`.
4. Challenge every price and every rule with a single source or an old date: link tension to the card that disagrees or place a Question asking for the second source. Say which cost could break the budget. Tools: `query_dataset`, `read_card`, `add_link`, `place_card`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming the flags raised. Tools: `report_progress`, `send_message`.

### Builder

1. The route as a diagram: stops, legs, modes and times from Transport, the connection buffers marked, and a second diagram of a typical day in the busiest area if that helps. Tools: `place_card`, `query_dataset`, `read_card`.
2. The trip timeline: the fixed points (flights, check-ins, timed tickets, tours) as a timeline card, from Transport, Stays and Itinerary; and the days at a glance. Tools: `place_card`, `query_dataset`, `read_card`.
3. The budget charts: cost by category (pie) and booked against planned (bar), bound to Budget; the totals into the metrics. Tools: `place_card`, `query_dataset`.
4. A neighbourhood chooser for the places: a chart or a diagram of the areas with the number of priority places in each, from Places, so that the stay is picked near the most. Tools: `place_card`, `query_dataset`.
5. Optional one-page visual summary (a design frame): the route, the days, the cost and the three things to book first, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. Travel documents: passport validity, visa or entry authorisation not checked against the official source. *How:* Read the destination government’s entry page and your own government’s travel page; put the rule and date in the Preparation checklist with the source.
2. A government travel advisory in force for the destination or a stop on the route. *How:* Check your own government’s advisory page for each country and region on the route.
3. Closures: sites, restaurants or transport closed on the days planned (weekday, holiday, season, renovation). *How:* Compare each Itinerary row with the opening hours and the holiday calendar for the date.
4. Tight connections: under 90 minutes between flights or under 20 minutes between trains, or an overnight arrival with no transfer. *How:* Read the Transport database legs in order; compute the gap between each arrival and the next departure.
5. Hidden costs: resort or city fees, baggage, seat fees, deposits, card or exchange fees, tipping norms. *How:* Compare the Budget with the price pages and the cancellation terms on every booking.
6. Non-refundable bookings made before the plan is final. *How:* List each booking with its cancellation terms in Transport and Stay; mark non-refundable ones.
7. Weather, seasonal hazards or events (monsoon, extreme heat, snow, strikes, big festivals) that change the plan. *How:* Check seasonal climate data and the local events calendar for the dates.
8. Health and safety needs not checked (vaccination or medication rules, insurance cover, area safety). *How:* Source official public-health and government pages only; say “check with a doctor” where individual advice is needed. orb gives no medical advice.
9. Accessibility or dietary constraints from the intake are not met by the stay, the transport or the places. *How:* Match each constraint to the Stay, Places and Food rows; unverifiable ones become questions to ask the venue.
10. An overpacked day: more than the pace asked for, or a day without a meal break or rest. *How:* Count the hours on each itinerary day against the Pace; flag days over the limit.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Fit to your interests | 30% | Most of the trip is not what you said you want. | A good share of the days match your interests. | Nearly every day is what you came for. | itinerary |
| Cost against budget | 25% | Over budget or costs unknown. | Within budget with a small buffer. | Comfortably within budget with a buffer of at least 10 percent. | budget |
| Logistics that work | 20% | Tight connections, long transfers, unconfirmed bookings. | Workable, with a few long days. | Smooth: short transfers, buffers, everything confirmed. | transport |
| Season and risk | 15% | Wrong season, closures or a travel warning in force. | Acceptable season; a risk or two with a plan. | Good season, no warnings, risks planned for. | prep |
| Pace and energy | 10% | Overpacked or empty days against the pace you asked for. | Mostly right with a few days to adjust. | The pace you asked for, with rest where you need it. | itinerary |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Trip plan: {{destination}}. Every paragraph cites cards; every price, opening hour and rule cites its source and the date it was seen; estimates are marked as such.

1. The trip at a glance (at most 150 words): The idea, the dates, the total cost against the budget, the score and the three things to book first, in at most 150 words.
2. Getting there & around: The route with the legs table and the connection buffers.
3. Where to stay: The pick for each stop, the alternatives and the guest complaints worth knowing.
4. Things to do: The must-sees, then the rest by area, with time, cost and booking notes.
5. Food & local notes: Where to eat by area, and the customs, tipping and payment notes.
6. Day by day: Each day with its slots, transfers, meals, cost and the rainy-day swap.
7. Budget: The cost table and charts against the budget, booked against planned.
8. Before you go: The red-flag outcomes, the documents and booking order, and the packing list.
9. Scorecard: The rubric table: each dimension, weight, score and evidence.

Appendix: All sources.

One-page summary: Dates and route, Days at a glance, Total cost against budget, Book first, Documents.

Deck format: `standard`.

## Follow-up chips

Shown after the first pass.

- Make it cheaper: Cut the cost of the trip to {{destination}} by 15 percent: what to change, what it saves and what it costs in the experience.
- Add a day trip: Add a day trip from [a stop] to the itinerary for {{destination}}: where, how to get there, the cost, and what it replaces.
- Rainy-day plan: Build a rainy-day plan for every outdoor day of the trip to {{destination}}: indoor options near each, with hours and cost.
- Slow it down: The plan feels packed. Slow the trip to {{destination}} down: which days to cut, with the rest of the plan re-timed.
- What to book first: What must be booked first for {{destination}}, in what order and by which date, with the cancellation terms of each?
- Watch fares and advisories: Watch fares, strikes and travel advisories for {{destination}} and tell me what changes the plan.

## Signed-in sources

- Tripadvisor (tripadvisor.com): Saved lists, reviews and rankings, as visible to the user.
- Booking.com (booking.com): Your saved stays, prices for the dates and cancellation terms. Read-only: it never books.
- Airbnb (airbnb.com): Saved listings and prices for the dates. Read-only: it never books.
- Google Travel (google.com): Saved places and fare calendars. Read-only.

## Monitor

Only when the user asks: `{{destination}} travel advisories, strikes, closures, flight price changes and weather alerts`. Changes that would change the plan or the price before the dates.
