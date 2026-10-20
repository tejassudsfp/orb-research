# Competitive analysis

<!-- Generated from packages/shared/src/templates/competitive-analysis.ts by `pnpm templates:docs`. Do not edit by hand. -->

Map the competitive landscape for the product: a database of direct, indirect and substitute competitors, profiles of the ones that matter, feature coverage, pricing, positioning, customer voice, funding and momentum, a SWOT and threats, a recommendation on where to compete, and a battlecard for each top competitor. Cite every claim, date every price, and separate what a competitor says from what customers say.

Template id `competitive-analysis`. Canvas title: `{{product}}: competitive analysis`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Your product or company (`product`) | text | yes | placeholder "Acme Analytics" |
| Website URL (`website`) | url | no | placeholder "https://acme.com" |
| Category (`category`) | text | no | placeholder "Product analytics" |
| Who you sell to (`customer`) | longtext | no | placeholder "Mid-market SaaS product teams" |
| The decision this informs (`decision`) | longtext | no | placeholder "Whether to move up-market or defend the SMB base" |
| Where you think you win (`differentiators`) | longtext | no | placeholder "Faster setup, a better API, price" |
| Known competitors (`competitors`) | list | no | placeholder "Comma separated". Optional. Scout finds more. |
| Region (`geography`) | text | no | placeholder "Global, EU, US" |
| Materials (`materials`) | materials | no | Drop win/loss notes, existing battlecards, pricing sheets, screenshots or an analyst report. Each becomes a card or database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites G2, Crunchbase, LinkedIn, SimilarWeb. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, the top five competitors and the memo is the summary only.
- **Standard:** Quick, plus find_entities and batch_enrich for the competitor list and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra research on the category and the top competitors, full competitor discovery and battlecards for each.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 LANDSCAPE (signal; scout, orb)

Brief: Define the category and who {{product}} is compared with: direct competitors, indirect ones, incumbents, emerging startups and the substitutes buyers use instead (spreadsheets, in-house tools, agencies). One row per competitor in the Competitors database with a source on every row.

Target: 1+ database (Competitors, at least 10 rows); 1+ entity (your company); 4+ source.

Seed cards:
- entity: {{product}}
- database: Competitors (database `competitors`)
- question: Who do buyers actually compare us with?

### 02 COMPETITOR PROFILES (sky; scout)

Brief: A Product card for each competitor that matters (start with the top five by threat level): what it sells, to whom, pricing headline, strengths and weaknesses, with a source. Take a screenshot of each home page.

Target: 5+ product (kind competitor); 3+ image (home page screenshots); 6+ source.

Seed cards:
- question: Which three competitors matter most, and why?

### 03 FEATURES & CAPABILITIES (rho; scout, builder)

Brief: Which capabilities each competitor has: a row per feature and competitor in Feature coverage (Yes, Partial, No, Unknown) with the evidence url, and a weighted comparison matrix of the top competitors on the criteria buyers use. Say how you know each cell (docs, pricing page, changelog, review).

Target: 1+ database (Feature coverage, at least 20 rows); 1+ matrix; 4+ source.

Seed cards:
- database: Feature coverage (database `features`)
- matrix: Feature comparison

### 04 PRICING & PACKAGING (sky; scout, builder)

Brief: What each competitor charges: plans, price per unit (seat, usage, flat), billing, limits and what each plan includes, captured from the pricing page with the date. Note free tiers, enterprise-only pricing and discount patterns. A page behind a login is read only on a site the user connected.

Target: 1+ database (Pricing, one row per plan); 3+ image (pricing page screenshots); 1+ chart (entry price by competitor).

Seed cards:
- database: Pricing (database `pricing`)
- chart: Entry price by competitor (database `pricing`)

### 05 POSITIONING & MESSAGING (rho; scout, builder, critic)

Brief: How each competitor describes itself: the headline, the promise, the proof points, the target buyer and the words they own. Quote the page. Place every competitor on a 2x2 and say which position is empty.

Target: 6+ quote (headline claims, quoted); 1+ framework (the 2x2).

Seed cards:
- framework: Positioning 2x2
- question: Which position in the market is nobody claiming?

### 06 CUSTOMER VOICE (sky; scout)

Brief: What customers say: review themes from G2, Capterra, app stores and forums, switching stories, what people praise and complain about for each competitor. Quote positive and negative reviews, and tally recurring themes.

Target: 1+ database (Review themes); 8+ quote (at least 3 negative); 1+ video (a review or comparison video, if one exists).

Seed cards:
- database: Review themes (database `reviews`)

### 07 FUNDING & MOMENTUM (rho; scout, builder)

Brief: Who is rising and who is stalling: funding rounds, headcount and hiring trend, launches, partnerships, acquisitions, traffic. Dated events with a source each.

Target: 1+ timeline (market moves); 1+ chart (funding by competitor); 3+ metric (category size, growth, number of funded players).

Seed cards:
- timeline: Market moves
- chart: Total funding by competitor (database `competitors`)
- metric: Funded competitors
- metric: Category growth
- metric: Median entry price

### 08 STRENGTHS & WEAKNESSES (paper; builder, critic, orb)

Brief: A SWOT of {{product}} against the field, built only from cards on the board: strengths and weaknesses are internal and supported by feature, review and pricing cards; opportunities and threats come from the market and momentum. Add pros and cons of the most threatening competitor.

Target: 2+ framework (SWOT and pros and cons); 3+ insight (each citing at least 2 cards).

Seed cards:
- framework: SWOT: {{product}} vs the field
- framework: Top competitor: pros and cons

### 09 THREATS & GAPS (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Add the competitive risks the checklist misses, and the gaps in what we know as Questions.

Target: 5+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Red-flag checklist
- risk: Feature parity risk
- risk: Pricing pressure risk
- risk: Incumbent bundling risk
- risk: New entrant risk

### 10 STRATEGY & RECOMMENDATION (signal; orb)

Brief: Where to compete and how: the recommended position, which competitors to attack, avoid or partner with, what to build or message next, and what would change the answer. Score {{product}} against the rubric with cited evidence. The decision this informs: {{decision|not given}}.

Target: 1+ decision; 3+ hypothesis (with evidence links); 1+ matrix (the filled rubric); 3+ insight.

Seed cards:
- hypothesis: We win on {{differentiators|our claimed edge}}
- hypothesis: The strongest threat is a funded incumbent, not a startup
- hypothesis: There is an open position in the 2x2 we can own
- decision: Where should {{product}} compete?
- matrix: Competitive position (rubric score x 2, so 10 is a 5)

### 11 BATTLECARDS (signal; builder, orb)

Brief: A one-page battlecard per top competitor, for the sales and product team: how they pitch, where we win, where we lose, the objections to expect and the answer to each, with proof from the cards. Built only from cards on the board, each claim cited.

Target: 3+ design (one battlecard per top competitor); 1+ checklist (objection handling).

Seed cards:
- checklist: Objections to prepare for

## Databases

### Competitors (frame `landscape`)

Every competitor, discovered with find_entities and enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Category | enum (Direct, Indirect, Incumbent, Emerging, Substitute) |  |
| Target customer | text |  |
| Positioning | text | Their headline in a line. |
| HQ | text |  |
| Founded | number |  |
| Headcount | number |  |
| Total funding | currency | US dollars. |
| Last round | text |  |
| Key strength | text |  |
| Key weakness | text |  |
| Threat level | rating | 1 (low) to 5 (high). |
| Source | url |  |

Views: All (table, sorted by Threat level desc); By category (board, by Category); High threat (table, filtered).

### Feature coverage (frame `features`)

One row per feature and competitor, so coverage can be filtered, counted and charted.

| Column | Type | Notes |
|---|---|---|
| Feature | text |  |
| Area | text | Core, integrations, security, admin, support. |
| Competitor | text | Use the name from the Competitors database. |
| Support | enum (Yes, Partial, No, Unknown) |  |
| Evidence | url |  |
| Note | text |  |

Views: All (table, sorted by Feature asc); By support (board, by Support); Gaps (table, filtered).

### Pricing (frame `pricing`)

Every plan of every competitor with the date it was captured.

| Column | Type | Notes |
|---|---|---|
| Competitor | text |  |
| Plan | text |  |
| Price (USD per month) | currency | Per unit; annual price divided by 12. |
| Unit | text | Seat, usage, flat, per workspace. |
| Billing | enum (Monthly, Annual, Usage, Custom) |  |
| Limits | text |  |
| Includes | text |  |
| Captured on | date |  |
| Source | url |  |

Views: All (table, sorted by Price (USD per month) asc); By competitor (table, by Competitor).

### Review themes (frame `voice`)

Recurring themes in customer reviews, with how often and one quote each.

| Column | Type | Notes |
|---|---|---|
| Competitor | text |  |
| Theme | text |  |
| Sentiment | enum (Positive, Mixed, Negative) |  |
| Mentions | number | How many reviews raise it. |
| Example quote | text |  |
| Source | url |  |

Views: All (table, sorted by Mentions desc); By sentiment (board, by Sentiment).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read what the user dropped first: win/loss notes, battlecards, pricing sheets, screenshots (read_card, read_source; query_dataset for databases). Put every competitor named in them into the Competitors database (upsert_rows) with the file as its source. Note the decision the analysis informs and keep it in view. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (its seven-step playbook), Builder once Scout has pricing and feature rows, Critic once Scout has sources to review. Name the frames each agent owns, and hand over the intake facts (names, links, concerns) in the instruction. Tools: `delegate`, `message_agent`.
3. For a gap Scout could not close (a competitor with no pricing, a segment with no reviews), run deep_research (core) on that one question. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
4. Fill the Competitive position matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card in the why line. Then the SWOT, the three hypotheses (evidence for and against as card ids) and the Decision: your proposed option and the weighted total in its rationale. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
5. Write the memo with compose_section, section by section in the order of the memo outline, then the one-page summary. On the Quick tier write the summary only. When the user asks for slides, compose_slides with the deck outline. Tools: `compose_section`, `compose_slides`.
6. Check each battlecard Builder made against the cards it cites; any claim without a citation is removed or sent back to Builder with message_agent. *(from the standard tier)* Tools: `search_board`, `read_card`, `message_agent`.
7. Only when the user asks to keep watching: watch_topic with the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. Our own site first (fetch_url): positioning, pricing, customers. Then the competitors the user named: home and pricing page of each, screenshot with capture_page, one Product card (kind competitor) for the top five and a row in Competitors (upsert_rows, key Name) for every one. Tools: `fetch_url`, `parallel_extract`, `capture_page`, `place_card`, `upsert_rows`.
2. Discover the rest of the field: find_entities (the match limit follows the depth tier) fills a database card of its own; batch_enrich fills the Competitors columns (target customer, positioning, HQ, founded, headcount, funding, last round, strength, weakness). Read each run database with query_dataset and upsert the rows into Competitors (key Name) with a Source url. Quick scan: find_entities and batch_enrich are refused, so add rows from web_search and "alternatives to" pages. Tools: `find_entities`, `batch_enrich`, `web_search`, `upsert_rows`, `query_dataset`.
3. Features: for the top competitors read docs, feature pages and changelogs (fetch_url, parallel_extract) and write one Feature coverage row per feature and competitor (upsert_rows, key Feature, with the Competitor column) with an evidence url. Mark Unknown rather than guess. Tools: `fetch_url`, `parallel_extract`, `web_search`, `upsert_rows`, `place_card`.
4. Pricing: every plan of every top competitor into Pricing (upsert_rows) with the capture date; screenshot each pricing page. Enterprise-only pricing is a row with Billing "Custom", not a guess. G2 or SimilarWeb pages only through fetch_signed_in, and only if the user ticked them. Tools: `fetch_url`, `capture_page`, `fetch_signed_in`, `upsert_rows`, `place_card`.
5. Positioning: quote each competitor's home page headline and promise as Quote cards (positioning frame). Add the words competitors own as a Question or note for Builder. Tools: `fetch_url`, `place_card`, `query_board`.
6. Customer voice: G2, Capterra, app stores, Reddit and Hacker News (web_search, fetch_url, fetch_signed_in if ticked). Quote cards, positive and negative; tally themes into Review themes (upsert_rows, key Theme). A review or comparison video becomes a Video card. Tools: `web_search`, `fetch_url`, `fetch_signed_in`, `place_card`, `upsert_rows`.
7. Momentum: funding, headcount, hiring, launches and acquisitions on the Market moves timeline (each event with its source); fill Total funding and Last round in Competitors; fill the three metrics. Tools: `web_search`, `fetch_url`, `fetch_signed_in`, `place_card`, `upsert_rows`.
8. Deep research for the gaps that remain: deep_research (core or above, per the tier), for example a category report or a competitor with little public data. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge every price, feature cell and funding figure that has a single source or an old date: link it with "tension" to the card that disagrees, or place a Question asking for the second source. Challenge each differentiator claim the user made: evidence or a Risk. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Turn patterns into Insight cards that cite at least two cards each (for example: three competitors raise price on annual plans; the same support complaint appears across rivals). Tools: `query_board`, `search_board`, `place_card`, `add_link`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. Charts bound to the databases: entry price by competitor (bar, Pricing), total funding by competitor (bar, Competitors). Fix the axes if a column is empty. Tools: `place_card`, `query_dataset`.
2. The feature comparison matrix: weighted criteria, scores 0 to 10 for each competitor derived from Feature coverage (query_dataset); the note of each option says which rows it came from. Tools: `place_card`, `query_dataset`, `read_card`.
3. The positioning 2x2 (framework, quadrant): place every competitor on the two axes from the quotes and features; name the empty quadrant. The SWOT of our product, from cards only. Tools: `place_card`, `query_board`, `read_card`.
4. One battlecard per top competitor as a design frame (write_design_frame): how they pitch, where we win and lose, objections and answers, built only from cards on the board and each claim cited in the card text. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`, `place_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. A funded competitor ships our headline feature. *How:* Check the Feature coverage database and the changelogs for the product feature the intake calls our edge.
2. A comparable plan costs at least 30% less. *How:* Compare the Pricing database rows per unit and per seat; raise when a like-for-like plan is much cheaper.
3. An incumbent bundles the capability for free. *How:* Look for bundles, free tiers and suite announcements in the sources of the incumbents.
4. Our differentiator is a claim, not evidence. *How:* For each differentiator in the intake, find a feature row or review quote that proves it; a claim alone is raised.
5. One competitor holds a clear majority of review mentions. *How:* Count competitor mentions in the Review themes database; a dominant share is raised.
6. The real competitor is a substitute that was not counted (spreadsheets, in-house tools, agencies). *How:* Check the Competitors database for rows with category Substitute; none is raised as a gap.
7. A competitor is hiring or raising far faster than the field. *How:* Read the Momentum timeline and the funding chart for outsized rounds and open-role counts.
8. Consolidation: a rival was acquired or merged. *How:* Look for acquisition news in the sources; a recent deal changes who is the threat.
9. Pricing or feature data older than 12 months is used as if current. *How:* Check each row and source date; stale rows are marked and a Question asks for a refresh.
10. A review pattern we share (support, reliability, billing) is also a pattern for us. *How:* Compare the negative themes of competitors with our own reviews and notes.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Product fit | 25% | Competitors meet the need better today. | On par: customers could pick either. | Clearly better for the target customer. | features |
| Price and packaging | 15% | Priced above comparable plans with less included. | In line with the market. | Cheaper or simpler for the same outcome. | pricing |
| Positioning | 15% | Indistinguishable from the field. | A clear claim, shared with one or two rivals. | An owned position buyers repeat back. | positioning |
| Customer proof | 20% | Few reviews and no named customers. | Solid reviews and a handful of references. | Strong reviews and marquee references, verified. | voice |
| Momentum | 15% | Shrinking: fewer hires, launches and reviews. | Steady. | Accelerating faster than the field. | momentum |
| Defensibility | 10% | Easy to copy or switch away from. | Some switching costs. | Data, network, integration or brand lock-in. | swot |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Competitive analysis: {{product}}. Every paragraph cites cards; every price and funding figure cites its source and date; what a competitor says is marked apart from what customers say.

1. Summary & recommendation (at most 150 words): The recommended position, the top 3 reasons, the top 3 threats, in at most 150 words.
2. The landscape: The category, the competitors by group, and the substitutes, as a table.
3. Key competitors: A paragraph per top competitor: what it sells, to whom, strengths and weaknesses.
4. Features & capabilities: The coverage matrix and where we lead, match and lag.
5. Pricing & packaging: A pricing table with dates, the entry price chart and the packaging patterns.
6. Positioning & messaging: The 2x2, the claims quoted, the open position.
7. Customer voice: Review themes by competitor, with quotes.
8. Funding & momentum: The market moves timeline and the funding chart.
9. Strengths, weaknesses, threats: The SWOT and the red-flag outcomes: each raised flag with its mitigant.
10. Scorecard: The rubric table: each dimension, its weight, its score and its evidence.
11. Strategy & next steps: Where to compete, who to attack, avoid or partner with, and what would change the answer.

Appendix: All sources.

One-page summary: Landscape, Score, Recommendation, Top threats.

Deck format: `standard`.

Deck: Competitive review: {{product}}. Slides, in order:

1. The answer: The recommendation and the three reasons.
2. The landscape: Competitors grouped by direct, indirect, incumbent and substitute.
3. Who matters most: The top competitors with one line each and the threat level.
4. Feature comparison: The weighted matrix with the winner highlighted.
5. Pricing: The pricing table and the entry price chart.
6. Positioning: The 2x2 and the open position.
7. What customers say: Review themes and two quotes per competitor.
8. Momentum: Funding and the market moves timeline.
9. Threats: The raised red flags with mitigants.
10. Recommendation and next steps: Where to compete and what to do in the next 30 days.

## Follow-up chips

Shown after the first pass.

- Go deeper on competitor X: Go deeper on [competitor]: product, pricing, customers, funding, how it beats or loses to {{product}}, with sources.
- Refresh the pricing: Recheck every price in the Pricing database today and tell me what changed since it was captured.
- Write the sales battlecard: Write a one-page sales battlecard for [competitor] against {{product}}: pitch, where we win and lose, objections and answers, each cited.
- Find the open position: Which position in the market is nobody claiming? Use the 2x2 and the quotes, and say what proof we would need.
- Watch the field: Start a monitor on the competitors: launches, pricing changes, funding and leadership moves.
- Stress-test our edge: Build the strongest case that {{differentiators|our claimed edge}} is not a real advantage, from the cards on the board.

## Signed-in sources

- G2 (g2.com): Reviews, ratings, alternatives and category rankings.
- Crunchbase (crunchbase.com): Funding rounds, investors and headcount of competitors.
- LinkedIn (linkedin.com): Headcount, hiring trend and leadership of competitors.
- SimilarWeb (similarweb.com): Traffic and audience trend of competitor sites.

## Monitor

Only when the user asks: `{{product}} competitors: launches, pricing changes, funding, acquisitions and leadership moves`. A competitor move that would change the recommendation.
