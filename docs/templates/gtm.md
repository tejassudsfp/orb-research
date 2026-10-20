# GTM plan

<!-- Generated from packages/shared/src/templates/gtm.ts by `pnpm templates:docs`. Do not edit by hand. -->

Work out a go-to-market plan: the ideal customer and the target accounts, the positioning and messaging, the competitive context, the channels ranked by fit and cost, the pricing headline, the funnel and the unit economics, partnerships, a dated launch plan with owners, and the risks. Cite every market claim, mark every CAC or conversion figure as measured or assumed, and end with a recommended motion and a first-90-days plan.

Template id `gtm`. Canvas title: `{{product}}: GTM plan`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| What you are taking to market (`product`) | text | yes | placeholder "Acme Analytics" |
| Website URL (`website`) | url | no | placeholder "https://acme.com" |
| Stage (`stage`) | select | no | one of Idea, MVP, Private beta, Launched, Scaling |
| Who it is for (`customer`) | longtext | no | placeholder "Heads of support at 50 to 500 person SaaS companies" |
| The promise (`value`) | longtext | no | placeholder "Halve ticket handling time without hiring" |
| Price or price idea (`price`) | text | no | placeholder "$99 per seat per month" |
| Team and budget for go-to-market (`team`) | longtext | no | placeholder "2 founders, one marketer, $20k for 6 months" |
| Target launch date (`launch`) | text | no | placeholder "2027-02-01" |
| Channels already tried (`tried`) | longtext | no | placeholder "Cold email: 2% reply; a Product Hunt launch: 300 sign-ups" |
| Known competitors (`competitors`) | list | no | placeholder "Comma separated". Optional. Scout finds more. |
| Region (`geography`) | text | no | placeholder "US first, then EU" |
| Materials (`materials`) | materials | no | Drop a product brief, a pitch deck, customer lists, funnel or campaign data (CSV or XLSX) and interview notes. Each becomes a card or database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites LinkedIn, G2, Crunchbase. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** No deep research: segments, competitors and channels from public search, at most 12 cards per frame, no partner list and the memo is the summary only.
- **Standard:** Quick, plus find_entities and batch_enrich for the target accounts, competitors and partners, the funnel and launch plan, and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra research on channel benchmarks and the segment, larger account and partner lists, and the full memo and deck.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 GOAL & CONSTRAINTS (signal; orb)

Brief: What the launch must achieve and within what limits: the target (customers, revenue, sign-ups) and its date, the budget, the team, the stage of {{product}} and what has been tried ({{tried|nothing yet}}). Success must be measurable and dated.

Target: 4+ metric; 1+ doc (the GTM brief); 2+ hypothesis.

Seed cards:
- doc: GTM brief
- metric: Launch target
- metric: Launch date
- metric: Budget
- metric: Team capacity
- hypothesis: A narrow first segment will convert faster than a broad launch
- hypothesis: One channel can carry the first 90 days
- question: What has to be true for this launch to hit its target?

### 02 MARKET & ICP (sky; scout, builder)

Brief: Who to sell to first: segments with their size, pain, buyer role, budget, urgency and how reachable they are, the segment to start with, and the target accounts in it (a list the team can act on, from public sources). Personas stay grounded in evidence.

Target: 2+ database (ICP & segments, Target accounts (at least 25 accounts)); 2+ entity (personas, kind person); 1+ chart (segments by attractiveness); 4+ source.

Seed cards:
- database: ICP & segments (database `segments`)
- database: Target accounts (database `accounts`)
- chart: Segments by urgency (database `segments`)
- question: Which segment has a trigger event we can sell into this quarter?

### 03 POSITIONING & MESSAGING (rho; scout, builder, critic)

Brief: How {{product}} is described: the positioning statement (for whom, what, against which alternative, why us), the message hierarchy (promise, three proof points, objections), and the words buyers use. Compare with the claims competitors make; place them on a 2x2 and find the open position.

Target: 1+ doc (the positioning statement); 6+ quote (buyer and competitor words); 1+ framework (the 2x2).

Seed cards:
- doc: Positioning statement
- framework: Positioning 2x2
- question: In the customer's words, what is the problem and what does a good result look like?

### 04 COMPETITIVE CONTEXT (sky; scout)

Brief: Who the buyer will compare {{product}} with and how they position and sell: the direct competitors and the substitutes, their pricing headline, their main channel, and where they are weak. Enough to choose a wedge, not a full competitive analysis (use that template for one).

Target: 1+ database (Competitors, at least 8 rows); 3+ product (kind competitor); 4+ source.

Seed cards:
- database: Competitors (database `competitors`)

### 05 CHANNELS (rho; scout, builder, orb)

Brief: Where the buyer can be reached and at what cost: outbound, content and search, paid, community, partnerships, product-led, events and marketplaces. Per channel the segment it fits, estimated CAC and volume, the time to first result and the evidence. Rank them. What has been tried: {{tried|nothing yet}}.

Target: 1+ database (Channels, at least 8 rows); 1+ matrix (channel prioritisation); 1+ chart (channels by cost and fit).

Seed cards:
- database: Channels (database `channels`)
- matrix: Channel prioritisation
- chart: Channels by priority score (database `channels`)

### 06 PRICING HEADLINE (sky; scout, orb)

Brief: The price the plan assumes, and how it compares with the alternatives: entry price, the sales motion it implies and the contract value. This is the headline only; the pricing research template goes deeper.

Target: 3+ metric; 3+ source (competitor pricing pages).

Seed cards:
- metric: Entry price
- metric: Median competitor price
- metric: Annual contract value
- question: Does the price fit the motion: self-serve, sales-assisted or enterprise?

### 07 FUNNEL & ECONOMICS (rho; builder, orb)

Brief: The path from awareness to a paying customer and what it costs: the funnel stages with conversion and volume, CAC by channel, payback and the target. Mark every rate as Measured, Benchmark or Assumed. Compute, do not guess: show the formula.

Target: 1+ database (Funnel model); 1+ chart (funnel by stage); 1+ math (the CAC and payback formulas); 3+ metric.

Seed cards:
- database: Funnel model (database `funnel`)
- chart: Customers by funnel stage (database `funnel`)
- math: CAC and payback
- metric: Target CAC
- metric: Payback period
- metric: Customers needed

### 08 PARTNERS & DISTRIBUTION (sky; scout)

Brief: Who already reaches {{product}}'s buyer and could resell, integrate or co-market: integrations and marketplaces, agencies, communities, influencers and complementary vendors, with the offer and the audience overlap.

Target: 1+ database (Partners, at least 12 rows); 3+ entity (the best partners).

Seed cards:
- database: Partners (database `partners`)

### 09 LAUNCH PLAN (paper; builder, orb)

Brief: The first 90 days as dated work: what happens before launch, on launch day and after, who owns each task, which channel it feeds and the number that says it worked. Launch date: {{launch|to be set}}. Fit the plan to the team: {{team|not given}}.

Target: 1+ database (Launch tasks, at least 15 rows); 1+ timeline (launch milestones); 1+ checklist (launch readiness).

Seed cards:
- database: Launch tasks (database `launch`)
- timeline: Launch milestones
- checklist: Launch readiness

### 10 RISKS & ASSUMPTIONS (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence or clear it with a source. List the assumptions the plan rests on and how each will be tested in the first 30 days.

Target: 5+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Red-flag checklist
- risk: Segment risk
- risk: Channel risk
- risk: Economics risk
- risk: Execution risk

### 11 PLAN & DECISION (signal; orb)

Brief: The recommended go-to-market motion and the first 90 days: the segment, the message, the channels, the price, the targets and what would make you change course. Score the plan against the rubric with cited evidence; the weighted total goes in the Decision rationale.

Target: 1+ decision; 1+ matrix (the filled rubric); 1+ framework (SWOT of the plan); 3+ insight.

Seed cards:
- decision: Which go-to-market motion for {{product}}?
- framework: SWOT of the plan
- matrix: GTM readiness (rubric score x 2, so 10 is a 5)

## Databases

### ICP & segments (frame `market`)

Candidate segments with the evidence behind each rating.

| Column | Type | Notes |
|---|---|---|
| Segment | text |  |
| Description | text |  |
| Accounts | number | Number of accounts in the segment. |
| Buyer role | text |  |
| Core pain | text |  |
| Budget | text |  |
| Urgency | rating | 1 to 5. |
| Reachability | rating | 1 to 5. |
| First launch | boolean | Chosen as the first segment. |
| Source | url |  |

Views: All (table, sorted by Urgency desc); Chosen (table, filtered).

### Target accounts (frame `market`)

Named accounts in the first segment. Public company information only. Discovered with find_entities and enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Company | text |  |
| Website | url |  |
| Segment | text |  |
| Size | text |  |
| HQ | text |  |
| Why a fit | text |  |
| Trigger | text | A dated event that makes them buy now. |
| Buyer role | text |  |
| Source | url |  |

Views: All (table); By segment (table, by Segment).

### Competitors (frame `competition`)

Who the buyer compares the product with. Discovered with find_entities and enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Category | enum (Direct, Indirect, Incumbent, Substitute) |  |
| Positioning | text |  |
| Entry price (USD per month) | currency |  |
| Main channel | text |  |
| Weakness | text |  |
| Threat level | rating | 1 (low) to 5 (high). |
| Source | url |  |

Views: All (table, sorted by Threat level desc); By category (board, by Category).

### Channels (frame `channels`)

Every candidate channel with its cost, volume, speed and evidence.

| Column | Type | Notes |
|---|---|---|
| Channel | text |  |
| Type | enum (Outbound, Content and search, Paid, Community, Partnerships, Product-led, Events, Marketplace) |  |
| Segment | text |  |
| Est. CAC (USD) | currency |  |
| Est. customers per month | number |  |
| Weeks to first result | number |  |
| Fit with the team | rating | 1 to 5. |
| Priority score | number | 0 to 10, from the channel matrix. |
| Basis | enum (Measured, Benchmark, Assumed) |  |
| Evidence | text |  |
| Source | url |  |

Views: By priority (table, sorted by Priority score desc); By type (board, by Type); Measured (table, filtered).

### Funnel model (frame `funnel`)

Each stage of the funnel with its conversion and volume, marked Measured, Benchmark or Assumed.

| Column | Type | Notes |
|---|---|---|
| Stage | text | Aware, visit, sign-up, activated, paid, expanded. |
| Conversion from the previous stage (%) | number |  |
| Volume per month | number |  |
| Basis | enum (Measured, Benchmark, Assumed) |  |
| Source | url |  |
| Note | text |  |

Views: All (table); By basis (board, by Basis).

### Partners (frame `partners`)

Companies and communities that already reach the buyer. Discovered with find_entities.

| Column | Type | Notes |
|---|---|---|
| Partner | text |  |
| Type | enum (Integration, Marketplace, Agency, Community, Influencer, Complementary vendor) |  |
| Audience overlap | rating | 1 to 5. |
| Offer | text | What both sides get. |
| Contact role | text |  |
| Status | enum (Idea, Approached, In talks, Live, Declined) |  |
| Source | url |  |

Views: All (table, sorted by Audience overlap desc); By status (board, by Status).

### Launch tasks (frame `launch`)

The first 90 days as work: task, owner, date, channel and the number that says it worked.

| Column | Type | Notes |
|---|---|---|
| Task | text |  |
| Phase | enum (Before launch, Launch, Weeks 1 to 4, Weeks 5 to 12) |  |
| Owner | person |  |
| Due | date |  |
| Channel | text |  |
| Success metric | text |  |
| Status | enum (Todo, Doing, Done, Blocked) |  |

Views: By date (table, sorted by Due asc); By status (board, by Status); By phase (table, by Phase).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read what the user dropped first: the product brief, a deck, customer lists, funnel or campaign data (read_card, read_source, query_dataset). Put measured funnel numbers into Funnel model (upsert_rows) with Basis "Measured", and the channels already tried into Channels with their measured results. Hand the customer, the promise, the budget and the competitors to Scout in the delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (segments, accounts, competitors, channels), Builder once Scout has channel and segment rows, Critic once Scout has sources to review. Name the frames each agent owns, and hand over the intake facts (names, links, concerns) in the instruction. Tools: `delegate`, `message_agent`.
3. Fill the goal metrics from the intake (update_card): the launch target, the date, the budget and the team capacity. A target with no date or number is a Question to the user (ask_user_question), not a guess. Tools: `update_card`, `ask_user_question`, `query_board`.
4. Compute CAC, payback and the customers needed from Channels, Funnel model and the price (query_dataset); update the metric seeds with the basis. Show the formula in the card text. Never present an Assumed rate as measured. Tools: `query_dataset`, `update_card`, `upsert_rows`.
5. For a gap Scout could not close (a channel with no cost data, a segment with no size), run deep_research (core) on that one question. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
6. Choose the first segment (mark First launch in ICP & segments if you wrote the row, otherwise ask Scout) and write the positioning statement (update_card). Fill the GTM readiness matrix: one 1-to-5 score per rubric dimension (doubled), each with a cited card; the SWOT; the hypotheses with evidence for and against; the Decision with the weighted total in its rationale. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
7. Write the memo with compose_section, section by section in the order of the memo outline, then the one-page summary. On the Quick tier write the summary only. When the user asks for slides, compose_slides with the deck outline. Tools: `compose_section`, `compose_slides`.
8. Only when the user asks to keep watching: watch_topic with the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. Our own site and the materials first (fetch_url, capture_page): how {{product}} describes itself today, the pricing page, customers named. Source cards and a screenshot. Tools: `fetch_url`, `parallel_extract`, `capture_page`, `place_card`.
2. Segments: 3 to 5 candidate segments in ICP & segments (upsert_rows, key Segment) with size, buyer role, pain, urgency and reachability, each with a Source url; a persona (entity card, kind person) for the best two, grounded in sources. Public analysis of the segment, not of private people. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`, `upsert_rows`.
3. Target accounts: find_entities for companies in the first segment (the match limit follows the depth tier); batch_enrich adds size, HQ, why a fit, trigger and buyer role; consolidate into Target accounts (upsert_rows, key Company) with a Source url. Quick scan: find_entities is refused; add a handful from web_search. Tools: `find_entities`, `batch_enrich`, `web_search`, `upsert_rows`, `query_dataset`.
4. Competitors: those the user named, then more through find_entities and batch_enrich (positioning, entry price, main channel, weakness); consolidate into Competitors (upsert_rows, key Name). A Product card (kind competitor) for the top three; their home page headlines as Quote cards in Positioning & messaging. Tools: `find_entities`, `batch_enrich`, `fetch_url`, `place_card`, `upsert_rows`, `query_dataset`.
5. Channels: for each candidate type, evidence of cost and conversion for this kind of product (benchmarks, case studies, where competitors show up); a row each in Channels (upsert_rows, key Channel) with Basis Benchmark or Assumed and a Source url. LinkedIn or G2 only via fetch_signed_in if the user ticked them. Tools: `web_search`, `fetch_url`, `fetch_signed_in`, `web_answer`, `upsert_rows`, `place_card`.
6. Pricing headline: the competitor entry prices into Competitors and the Median competitor price metric with its date; one Source per price. Tools: `fetch_url`, `parallel_extract`, `capture_page`, `place_card`, `upsert_rows`.
7. Partners: find_entities for integrations, marketplaces, agencies and communities that reach the buyer (public information only); consolidate into Partners (upsert_rows, key Partner); an entity card for the best three. *(from the standard tier)* Tools: `find_entities`, `batch_enrich`, `web_search`, `place_card`, `upsert_rows`.
8. Deep research for the gaps that remain: deep_research (core or above, per the tier), for example channel benchmarks for the category. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge every channel row and funnel rate that is Assumed or has one source: link it "tension" to the card that disagrees, or place a Question naming the test that would measure it in the first 30 days. Challenge the positioning claim against competitor quotes. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. List the first-30-day tests (Checklist or Question cards in Risks & assumptions): the assumption, the test, the sample and the pass threshold. You cannot tick; the user does. Tools: `place_card`, `add_link`, `query_board`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. Charts bound to the databases: segments by urgency (bar, ICP & segments), channels by priority score (bar, Channels), customers by funnel stage (bar, Funnel model). Tools: `place_card`, `query_dataset`.
2. The channel prioritisation matrix: weighted criteria, scores 0 to 10 for the top channels from the Channels database, the option note naming the rows used; write the Priority score back into the rows you wrote. Tools: `place_card`, `query_dataset`, `upsert_rows`, `read_card`.
3. The positioning 2x2 (framework, quadrant) from the competitor quotes and features, and a messaging hierarchy as a diagram or design frame: promise, three proof points, objections with answers, each tied to a card. Tools: `place_card`, `write_design_frame`, `query_board`, `read_card`.
4. The funnel: one Funnel model row per stage (upsert_rows, key Stage) from Channels and the price, with Basis and the formula in the Note; the CAC and payback math card citing its inputs. Tools: `upsert_rows`, `query_dataset`, `place_card`, `read_card`.
5. The launch plan: 15 or more Launch tasks (upsert_rows, key Task) with phase, owner role, due date, channel and success metric, fitted to the team and the launch date; the milestones timeline with a source label each. *(from the standard tier)* Tools: `upsert_rows`, `place_card`, `query_dataset`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. The first-launch ICP covers more than one buyer persona. *How:* Read the ICP & segments database: more than one primary segment or buyer role for the first launch is raised.
2. There is no evidence of buyer urgency. *How:* Look for a trigger event, budget or a dated pain in the sources and interviews; none is raised.
3. Channel CAC and conversion are assumed, not measured. *How:* Check the Channels database Basis column; a plan that rests on Assumed rows only is raised.
4. Payback is longer than 18 months for an SMB motion. *How:* Compute payback from the Funnel model and the price; raise if it is above 18 months (12 for self-serve).
5. The plan depends on one channel or one partner. *How:* Count channels with a high priority score; a single one, or a launch that needs one partner, is raised.
6. The sales motion does not fit the price. *How:* Compare the price point with the motion: high-touch sales below about $5k annual contract value, or self-serve at enterprise prices.
7. The team cannot execute the motion (no sellers, no content owner). *How:* Compare the Launch tasks owners and the team in the intake with what the motion needs.
8. The message is not tested against what competitors and buyers say. *How:* Compare the positioning statement with competitor quotes and buyer words; an untested claim is raised.
9. The channel is crowded and the product has no distribution advantage. *How:* Check competitor presence and cost in each top channel in the sources.
10. Success criteria are not measurable or have no date. *How:* Check the Goal frame metrics and the Launch tasks for numbers and dates.
11. A regulatory, platform or compliance constraint blocks a channel. *How:* Look for platform policies and regulation in the sources of each top channel (email, ads, outbound, regulated sectors).

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| ICP clarity | 20% | A broad "anyone who needs X". | A defined segment with a buyer role. | A narrow segment with named accounts and a proven trigger. | market |
| Message-market fit | 20% | Features, no customer words. | A clear promise that is not yet tested. | A message that matches how buyers describe the problem, tested. | positioning |
| Channel fit | 20% | No channel where the buyer is reachable. | One or two plausible channels. | A proven channel with measured conversion. | channels |
| Economics | 20% | CAC unknown or above lifetime value. | CAC and payback estimated and plausible. | Measured CAC with payback under 12 months. | funnel |
| Execution capacity | 20% | The plan needs people and budget that do not exist. | Doable with some hires or a stretch. | Fits the team and budget with room to learn. | launch |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Go-to-market plan: {{product}}. Every paragraph cites cards; every market figure cites its source; every CAC, conversion or volume is marked Measured, Benchmark or Assumed.

1. Summary & recommendation (at most 150 words): The recommended motion, the first segment, the three reasons and the three risks, in at most 150 words.
2. Goal and constraints: The target, the date, the budget and the team.
3. Market and ideal customer: The segments, the chosen first segment, the personas and the target accounts.
4. Positioning and messaging: The positioning statement, the message hierarchy, the 2x2 and the competitive context.
5. Channels: The ranked channels with cost, volume and evidence, and the matrix.
6. Pricing and motion: The price headline against competitors and the motion it implies.
7. Funnel and economics: The funnel table, CAC, payback and the customers needed, with the basis of each rate.
8. Partners and distribution: The best partners and the offer to each.
9. Launch plan: The first 90 days: milestones, owners and the metric for each.
10. Risks and assumptions: The red-flag outcomes and the 30-day tests.
11. Scorecard: The rubric table: each dimension, its weight, its score and its evidence.

Appendix: All sources.

One-page summary: Motion, First segment, Top channels, Targets, Top risks.

Deck format: `standard`.

Deck: Go-to-market plan: {{product}}. Slides, in order:

1. The plan in one slide: The motion, the first segment, the target and the date.
2. Who we sell to: Segments, the chosen one and the personas.
3. Target accounts: The first accounts and the trigger for each.
4. Positioning and message: The positioning statement and the 2x2.
5. Competition: Where competitors sell and where they are weak.
6. Channels: The ranked channels with cost and evidence.
7. Pricing and motion: The price against the market and what it implies.
8. Funnel and economics: The funnel chart, CAC and payback.
9. Launch plan: The 90-day timeline with owners.
10. Risks and tests: The raised flags and the 30-day tests.
11. Decision and next steps: The decision, the score and the next actions.

## Follow-up chips

Shown after the first pass.

- Go deeper on a channel: Go deeper on the channel [channel]: cost, conversion, who uses it well, and a 30-day test for {{product}}.
- Write the outbound sequence: Write a five-step outbound sequence for the first segment, using the buyer's words from the quotes on this board.
- Draft the launch announcement: Draft the launch announcement and the landing page copy for {{product}} from the positioning statement.
- Stress-test the plan: Build the strongest case that this plan fails to hit its target, and what you would change.
- Re-plan with the new numbers: I added campaign results. Update the Funnel model and Channels with the measured numbers and tell me what changes in the plan.
- Watch the launch space: Start a monitor on competitor launches and announcements in our category.

## Signed-in sources

- LinkedIn (linkedin.com): Public company pages and role counts for the target accounts and partners.
- G2 (g2.com): Category, competitors, alternatives and buyer language in reviews.
- Crunchbase (crunchbase.com): Funding and headcount of competitors and target accounts.

## Monitor

Only when the user asks: `{{product}} category: competitor launches, pricing changes, funding and buyer discussions`. A market move that would change the plan.
