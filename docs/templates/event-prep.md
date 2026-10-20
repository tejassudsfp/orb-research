# Event prep

<!-- Generated from packages/shared/src/templates/event-prep.ts by `pnpm templates:docs`. Do not edit by hand. -->

Prepare for an event or conference: confirm the facts, decide whether and how to attend, choose the sessions, the people and the companies worth meeting, plan the outreach and meetings, the budget and the logistics, and prepare the talking points and the follow-up. Eight numbered frames, a weighted rubric for the go or no-go, and an event plan. Public professional information only about people.

Template id `event-prep`. Canvas title: `{{event}}: event prep`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Event name (`event`) | text | yes | placeholder "Web Summit 2027" |
| Event website (`event_url`) | url | yes | placeholder "https://example-conf.com" |
| Your role at the event (`role`) | select | yes | one of Attendee, Speaker, Exhibitor, Sponsor, Investor scouting, Hiring, Press |
| Dates (`dates`) | text | no | placeholder "12 to 14 May 2027" |
| City (`city`) | text | no | placeholder "Lisbon" |
| Travelling from (`origin`) | text | no | placeholder "Berlin" |
| What you want from the event (`goals`) | longtext | yes | placeholder "E.g. three customer intros, two investors, learn how others price agents" |
| Who you want to meet (`audience`) | longtext | no | placeholder "Titles, companies or names. Public professional roles only." |
| Topics you care about (`topics`) | list | no | placeholder "Comma separated" |
| Budget (`budget`) | text | no | placeholder "$3,500 all in" |
| Who else from your team (`companions`) | text | no | placeholder "Just me" |
| Materials (`materials`) | materials | no | Drop the agenda PDF, an attendee or exhibitor list (CSV or XLSX), your ticket or your talk abstract. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites LinkedIn, Crunchbase, Luma, Sessionize. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, suggest_task_spec, parallel_extract, web_answer, image_search, entity_search, research_memory, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, batch_enrich, suggest_task_spec, parallel_extract, web_answer, image_search, entity_search, research_memory, watch_topic, find_entities_extend | 4 | no limit | full |

- **Quick scan:** No deep research: the organiser’s pages, search, extract and the signed-in fetches ticked, at most 12 cards per frame; the plan is the summary only.
- **Standard:** Quick, plus entity lists of people and companies enriched into the databases and one or two deep-research runs (core) on past editions, asking before spend.
- **Deep:** Standard, plus FindAll for the full list of matching people and companies, pro research on past editions and the full event plan.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 EVENT SNAPSHOT (signal; orb)

Brief: What {{event}} is, the organiser, the dates and the city, the audience and its size, the price, how many sessions, speakers and sponsors, how long it has run, and one sentence on why it matters for you as {{role|an attendee}}.

Target: 1+ entity (the event or its organiser); 6+ metric; 1+ doc (why it matters).

Seed cards:
- entity: {{event}}
- doc: Why it matters for you
- metric: Dates
- metric: Attendance
- metric: Ticket price
- metric: Sessions
- metric: Speakers
- metric: Sponsors and exhibitors

### 02 AGENDA & SESSIONS (sky; scout, builder, critic)

Brief: Every session worth considering: title, speaker, time, track, room, why it matters for your goals and a priority. Conflicts between must-see sessions, the keynotes, the workshops that cost extra, and what is recorded so you can skip it.

Target: 1+ database (Sessions); 1+ chart (sessions by track); 1+ timeline (your day-by-day plan).

Seed cards:
- database: Sessions (database `sessions`)
- chart: Sessions by track (database `sessions`)
- timeline: Event timeline
- question: Which sessions can only be had in person?

### 03 SPEAKERS & ATTENDEES (rho; scout, critic)

Brief: The people worth meeting: confirmed speakers, panelists, organisers and attendees in your target roles. For each: role, organisation, why they matter for your goals, how you know they will be there, the best public professional route to reach them, a priority. Public professional information only.

Target: 1+ database (People: at least 15 rows); 3+ entity (the top-priority people); 3+ source.

Seed cards:
- database: People (database `people`)
- question: Who are the five people you most want to meet?

### 04 COMPANIES & SPONSORS (sky; scout, builder)

Brief: The exhibitors, sponsors and companies around the event that matter: what they do, their stage and size, why they matter for your goals (customer, partner, competitor, investor, employer), who to talk to, and their booth, session or side-event if any.

Target: 1+ database (Companies: at least 15 rows); 1+ chart (companies by relevance or type); 2+ product (the most relevant companies).

Seed cards:
- database: Companies (database `companies`)
- chart: Companies by type (database `companies`)

### 05 GOALS & STRATEGY (rho; orb, critic)

Brief: Your goals as hypotheses with how you will know each worked, the weighted fit of the event to them, the go or no-go and how to attend (fully, selectively, send someone). The rubric is scored here with cited evidence.

Target: 2+ hypothesis (with evidence links); 1+ decision; 1+ matrix (the filled rubric); 1+ framework (2x2 priority of people and sessions).

Seed cards:
- hypothesis: {{event}} will deliver your main goal
- hypothesis: The people you want to meet will be there
- framework: Priority 2x2: effort against value
- decision: Go or no-go: {{event}}
- matrix: Scorecard (rubric score x 2, so 10 is a 5)

### 06 OUTREACH & MEETINGS (paper; scout, orb)

Brief: The meetings you want: person, organisation, the ask, the channel, a draft of the first message (for you to send, never sent by orb), the status and the slot. Where events publish a meeting tool, use it; otherwise propose times near the person’s session.

Target: 1+ database (Meetings); 1+ checklist (outreach to send); 2+ doc (draft messages).

Seed cards:
- database: Meetings (database `meetings`)
- checklist: Outreach to send

### 07 LOGISTICS & BUDGET (sky; scout, builder, critic)

Brief: Ticket, travel, stay, meals, workshop fees, time out of work: each with a price, a source and a status. Last refundable dates, visa or travel documents if needed, hotel blocks, transit from the airport, the weather, and the total against your budget {{budget|}}.

Target: 1+ database (Logistics); 1+ chart (cost by category); 2+ metric (total cost, last refundable date).

Seed cards:
- database: Logistics (database `logistics`)
- chart: Cost by category (database `logistics`)
- metric: Total cost
- metric: Last refundable date
- checklist: Event red flags
- risk: Cost risk
- risk: Programme risk
- risk: Scams and data risk

### 08 TALKING POINTS & FOLLOW-UP (signal; orb, builder)

Brief: Your two-sentence introduction, three questions to ask, the pitch or ask for each type of person, what to bring, and the post-event follow-up: who to write, within what time, with what. Notes taken at the event are added here and turned into follow-ups.

Target: 2+ doc (introduction and talking points); 2+ checklist.

Seed cards:
- doc: Your introduction
- checklist: Before you go
- checklist: After the event: within 48 hours

## Databases

### Sessions (frame `agenda`)

Sessions, keynotes and workshops worth considering, with priority and clashes.

| Column | Type | Notes |
|---|---|---|
| Title | text |  |
| Speaker | person |  |
| Organisation | text |  |
| Day | date |  |
| Time | text | Start and end, local time. |
| Track | text |  |
| Room | text |  |
| Format | enum (Keynote, Talk, Panel, Workshop, Side event, Meetup) |  |
| Extra cost | currency | Fee beyond the ticket; empty if none. |
| Priority | rating | 1 (skip) to 5 (must see). |
| Why it matters | text |  |
| Recorded | enum (Yes, No, Unknown) |  |
| Source | url |  |

Views: By day (table, sorted by Day asc); By priority (board, by Format); Must see (table, filtered).

### People (frame `people`)

People worth meeting, with the evidence they will be there. Public professional information only; no personal contact details.

| Column | Type | Notes |
|---|---|---|
| Name | person |  |
| Organisation | text |  |
| Role | text |  |
| At the event | enum (Speaker, Panelist, Organiser, Exhibitor, Attendee, Unconfirmed) |  |
| Evidence they attend | url | The programme entry or their own post. |
| Why meet | text |  |
| Priority | rating | 1 (low) to 5 (top). |
| Route | text | The public professional way to reach them: their own post, the event app, a mutual intro. |
| Status | enum (To contact, Contacted, Meeting set, Met, Declined) |  |

Views: By priority (table, sorted by Priority desc); By status (board, by Status); Confirmed (table, filtered).

### Companies (frame `orgs`)

Exhibitors, sponsors and other companies worth a conversation. Found with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Relationship | enum (Customer, Partner, Competitor, Investor, Employer, Supplier, Peer) |  |
| What they do | text |  |
| Stage or size | text |  |
| At the event | text | Booth, session, side event or sponsor tier. |
| Relevance | rating | 1 (low) to 5 (high) for your goals. |
| Who to talk to | text | A role, not a private contact. |
| Source | url |  |

Views: By relevance (table, sorted by Relevance desc); By relationship (board, by Relationship); Top (table, filtered).

### Meetings (frame `outreach`)

Each meeting you want: who, the ask, the channel, the status, the slot.

| Column | Type | Notes |
|---|---|---|
| Person | person |  |
| Organisation | text |  |
| The ask | text |  |
| Channel | enum (Event app, Email, LinkedIn, Mutual intro, At the booth, Side event) |  |
| Draft message | text |  |
| Status | enum (Draft, Sent, Replied, Booked, Done, No reply) |  |
| Slot | text |  |
| Notes | text |  |

Views: By status (board, by Status); All (table).

### Logistics (frame `logistics`)

Every cost and booking with its price, source and status.

| Column | Type | Notes |
|---|---|---|
| Item | text |  |
| Category | enum (Ticket, Flights or transport, Stay, Meals, Workshop, Local transport, Other) |  |
| Cost | currency | In one currency; say which in the note. |
| Due | date | Booking deadline or last refundable date. |
| Status | enum (To book, Booked, Refundable, Non-refundable) |  |
| Source | url |  |
| Note | text |  |

Views: All (table, sorted by Due asc); By category (board, by Category).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first (agenda PDF, attendee or exhibitor lists, your abstract): read_card, read_source and query_dataset. Put each session of the agenda into Sessions (upsert_rows, key Title) and each listed person or company into People or Companies. Hand the goals, the target roles and the ticked sources to Scout in its delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first, Builder once Sessions and Logistics have rows, Critic once Scout has sources. Say the people rows hold roles and organisations only, and that nothing is sent to anyone. Tools: `delegate`, `message_agent`.
3. After Scout’s first pass, fill the Snapshot metrics (update_card) and “Why it matters for you”, each with a cited figure. Never write a figure you cannot source. Tools: `query_board`, `search_board`, `update_card`.
4. For one gap Scout could not close (a past-edition outcome, a speaker confirmation), run deep_research (core). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
5. Fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with a cited card in the why line. Update the goal hypotheses with evidence for and against, and the Decision card with your proposed option and the weighted total in its rationale. Place drafts of the first messages as doc cards in Outreach & meetings: you write drafts, the user sends. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
6. Write the event plan with compose_section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. The deck follows with compose_slides if asked. Tools: `compose_section`, `compose_slides`.
7. Keep “Talking points & follow-up” current: the introduction, three questions per priority person, and, when the user adds event notes, the follow-up list. Tools: `search_board`, `update_card`, `place_card`, `add_link`.
8. Only when the user asks to keep watching the event: watch_topic with the event name and the monitor query (speaker announcements, programme changes, price changes). Each monitor is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. The organiser’s own pages: about, programme, speakers, tickets, venue, sponsors and the FAQ (fetch_url, parallel_extract). Take capture_page screenshots of the programme and the ticket page. Dates, price and the refund policy become the Snapshot figures and Logistics rows (upsert_rows). Tools: `fetch_url`, `parallel_extract`, `capture_page`, `place_card`, `upsert_rows`.
2. Sessions: one row per session worth considering in Sessions (upsert_rows, key Title) with track, time, format, an extra cost if any, and why it matters for the goals. Put the fixed points on the Event timeline. Mark recording where the organiser says so. Tools: `fetch_url`, `parallel_extract`, `upsert_rows`, `place_card`, `web_search`.
3. People: start from the target roles in the intake. Speakers, panelists and organisers from the programme first, then public posts announcing attendance (LinkedIn if connected, fetch_signed_in, read-only). find_entities builds a longer list of people matching the target roles; batch_enrich fills role, organisation and evidence. One row per person in People (upsert_rows, key Name) with the evidence url for attendance. Roles and organisations only: no personal contact details, home or family information. Entity cards for the top five. Tools: `fetch_signed_in`, `web_search`, `find_entities`, `batch_enrich`, `query_dataset`, `upsert_rows`, `place_card`.
4. Companies: sponsors and exhibitors from the organiser, plus companies announced around the event. find_entities lists more that match your goals; batch_enrich fills what they do, stage and size. Consolidate into Companies with upsert_rows (key Name), a Source on every row. Product cards for the two or three most relevant. On the Quick tier, add rows from web_search instead. Tools: `find_entities`, `batch_enrich`, `web_search`, `fetch_url`, `query_dataset`, `upsert_rows`, `place_card`.
5. Past editions: recaps, attendee reviews and attendance trends for the last two editions; quote cards, positive and critical. Look for a pay-to-play programme and for scam warnings about the event. Tools: `web_search`, `fetch_url`, `place_card`.
6. Logistics: flights or transport from {{origin|the traveller’s city}}, a stay near the venue and the hotel block, meals, local transport and visa or entry rules from official sources. One row per item in Logistics (upsert_rows) with a price and a source; mark what is refundable. Tools: `web_search`, `fetch_url`, `parallel_extract`, `upsert_rows`, `place_card`.
7. Meetings: for each priority person, the best public route to reach them and a row in Meetings (upsert_rows, Status Draft). You propose; you never send anything. Tools: `upsert_rows`, `query_dataset`, `web_search`.
8. Deep research for the gaps that remain: deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout’s first sources: read the cards of every frame (board_map, search_board, read_card) and the databases (query_dataset) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`, `query_dataset`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links, or an Insight card titled "RFxx cleared: ..." citing the source cards that clear it (an insight needs at least two cited cards). You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge every priority person and session with a single source: is the attendance confirmed? Place a Question card for each that is not, linked to the row’s card, and link tension to cards that disagree. Tools: `query_dataset`, `query_board`, `read_card`, `place_card`, `add_link`.
4. Challenge the goal hypotheses: place an Insight or Hypothesis that argues the other side with cited cards, and mark any goal the event cannot meet. Tools: `place_card`, `add_link`, `query_board`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming the flags raised. Tools: `report_progress`, `send_message`.

### Builder

1. The charts: sessions by track bound to Sessions, companies by relationship bound to Companies, cost by category bound to Logistics. Tools: `place_card`, `query_dataset`.
2. The day-by-day plan: a timeline card of the fixed points and the meetings booked, built from Sessions and Meetings. Show clashes between must-see sessions with a note. Tools: `place_card`, `query_dataset`, `read_card`.
3. The priority 2x2 in Goals & strategy: place people and sessions by effort and value to the goals, from the databases. Tools: `place_card`, `query_dataset`.
4. Optional one-page visual summary (a design frame): dates, the go or no-go, the top five people, the must-see sessions and the budget, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. Dates, venue or programme not confirmed by the organiser. *How:* Compare the organiser’s own pages with aggregators and the agenda; an aggregator-only date is a flag.
2. Fees beyond the ticket: workshops, gated sessions, dinners, badge upgrades. *How:* Read the ticket and registration pages to the end; list extras with prices in the Logistics database.
3. A pay-to-play programme: most speaking slots are sponsor slots. *How:* Check the speakers database for how many speakers are from sponsors; read the organiser’s speaker policy.
4. The people you want to meet are not confirmed (not on the programme, not on the speaker list). *How:* For each priority person, find a programme entry, their own post or the organiser listing. A guess is not confirmation.
5. Past editions disappointed: negative recaps or reviews, falling attendance, a cancelled edition. *How:* Search recaps and reviews of the last two editions; quote what attendees said, positive and negative.
6. A conflict: another event, a deadline or a travel constraint in the same dates. *How:* Check the dates against the Logistics database and the user’s stated constraints.
7. A cancellation or refund policy that locks you in before the programme is final. *How:* Read the policy; note the last refundable date as a metric.
8. Scam risk: look-alike sites, unsolicited “attendee list” sellers, phishing around the event. *How:* Confirm the registration and hotel-block links lead to the organiser’s domain; never buy or scrape attendee lists.
9. Personal data on the board about people beyond their professional role at the event. *How:* Rows about people hold only their role, organisation, session and public professional contact route.
10. The total cost (ticket, travel, stay, time) exceeds the budget or the likely benefit. *How:* Sum the Logistics database; compare with the budget and the weighted goal fit.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Fit to your goals | 30% | Little connection to what you want out of the event. | Some of your goals can be met here. | Most of your goals can only be met at this event. | strategy |
| Quality of the people | 25% | Few of the people you want to meet will be there. | A fair number of relevant people are confirmed. | Many of your priority people and companies are confirmed. | people |
| Content quality | 20% | Generic or sponsor-driven sessions. | A few sessions worth the time. | Several sessions you could not get elsewhere. | agenda |
| Cost against benefit | 15% | Costs more than the likely benefit. | Roughly pays for itself. | Clear return for the money and time. | logistics |
| Timing and logistics | 10% | Conflicts, hard travel or unconfirmed details. | Workable with some effort. | Easy to reach, dates confirmed, nothing in the way. | logistics |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Event plan: {{event}}. Every paragraph cites cards; every date, price and attendance claim cites the organiser or another named source; unconfirmed items are marked as such.

1. Summary & recommendation (at most 150 words): The go or no-go, the score, the three reasons and the three risks, in at most 150 words.
2. The event at a glance: A table: dates, city, organiser, attendance, price, sessions, speakers, sponsors.
3. Your sessions: The must-see sessions by day, clashes, the keynotes and what is recorded.
4. People to meet: The priority people with evidence they will attend, the route and the planned meetings.
5. Companies to see: The relevant companies and why each, with their stand or session.
6. Logistics & budget: The cost table against the budget, the dates to book by and the red-flag outcomes.
7. Talking points: The introduction, the questions and the ask by type of person.
8. Scorecard: The rubric table: each dimension, weight, score and evidence.
9. Before and after: The before-you-go checklist and the follow-up plan.

Appendix: All sources.

One-page summary: Dates and city, Go or no-go and score, Must-see sessions, Top people, Budget.

Deck format: `standard`.

## Follow-up chips

Shown after the first pass.

- Plan my day one: Plan day one at {{event}} hour by hour: sessions, meetings and breaks, with travel time between rooms.
- Draft the first messages: Draft the first outreach message for each person marked top priority at {{event}}: short, specific, for me to send.
- Find more people like [person]: Find more people at {{event}} like [person]: same role and interest, with the evidence they will attend.
- Cut the budget: Cut the cost of {{event}} by 25 percent: what to drop or change, and what it costs in value against the goals.
- Add my notes and follow up: I added notes from {{event}}. Turn them into follow-ups per person, with a draft message for each, and update the meetings.
- Watch this event: Watch {{event}} for programme changes and speaker announcements, and tell me what changes the plan.

## Signed-in sources

- LinkedIn (linkedin.com): Public announcements of attendance and roles of people, as visible to the user. Terms apply: read-only, rate-limited.
- Crunchbase (crunchbase.com): Stage and size of the companies and sponsors.
- Luma (lu.ma): Side events and RSVP lists the user can already see.
- Sessionize (sessionize.com): The programme and speaker lists for events that publish there.

## Monitor

Only when the user asks: `{{event}} programme changes, speaker announcements, ticket price changes and cancellations`. Changes to the programme or the price that would change the plan.
