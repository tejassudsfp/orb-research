# Market map

<!-- Generated from packages/shared/src/templates/market-map.ts by `pnpm templates:docs`. Do not edit by hand. -->

Map the market: twelve numbered frames (scope, taxonomy, companies, sizing, capital flows, leaders, investors and acquirers, buyers, trends and white space, caveats, so-what, open questions) built on a Companies database that Parallel discovers and enriches. Cite every number, mark vendor-reported figures, and end with where to play or which companies to approach.

Template id `market-map`. Canvas title: `{{market}}: market map`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Market or category (`market`) | text | yes | placeholder "Warehouse robotics" |
| What is the map for (`purpose`) | select | no | one of Investment sourcing, Competitive strategy, Partnership scouting, Acquisition targets, Market entry, Learning the space |
| Scope: what is in and out (`scope`) | longtext | no | placeholder "Include software and hardware; exclude consumer robots…" |
| Known segments (`segments`) | list | no | placeholder "Comma separated". Optional. orb proposes a taxonomy if empty. |
| Known players (`players`) | list | no | placeholder "Comma separated". Optional. Scout finds the rest. |
| Company stage in scope (`focus`) | select | no | one of Early stage, Growth stage, Public companies, All |
| Geography (`geography`) | text | no | placeholder "Global, or Europe" |
| Your thesis or angle (`thesis`) | longtext | no | placeholder "What do you expect to find, or what decision will this inform?" |
| Materials (`materials`) | materials | no | Drop analyst reports, a spreadsheet of known companies (CSV or XLSX) or notes. A company list becomes rows in the Companies database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites Crunchbase, PitchBook, LinkedIn, G2. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** No deep research and no entity discovery: search and extract only, a hand-built list of up to 15 companies, at most 12 cards per frame, and the memo is the summary only.
- **Standard:** Quick, plus FindAll discovery and batch enrichment of the Companies database and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on sizing and regions, FindAll extension for full coverage and the full report.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 SCOPE & DEFINITION (signal; orb)

Brief: What {{market}} is: the boundary (what is in and out), the purpose of the map, the buyer and the problem, how the category is named and the adjacent categories. State the working definition before mapping so the rest can be checked against it.

Target: 1+ doc (the scope definition); 4+ metric; 2+ question.

Seed cards:
- doc: Scope definition
- metric: Companies mapped
- metric: Segments
- metric: Total funding
- metric: Deals in the last 12 months
- question: Where does this market end?
- question: Who is the buyer, and what budget does it come from?

### 02 TAXONOMY (sky; orb, builder, scout)

Brief: How the market divides: the segments, each with a definition, the buyer, the maturity (emerging, growing, mature, consolidating) and the number of players and funding in it. The taxonomy is MECE enough that every company fits one segment.

Target: 1+ database (Segments); 1+ diagram (the taxonomy tree); 1+ chart (companies per segment).

Seed cards:
- database: Segments (database `segments`)
- chart: Companies per segment (database `segments`)
- question: Is every company in exactly one segment?

### 03 COMPANIES (rho; scout, builder)

Brief: The landscape: every company in scope with its segment, country, founding year, stage, funding, headcount, business model, target customer, differentiator and status (active, acquired, shut down). Discovered with find_entities and enriched with batch_enrich; one row per company, a Source on every row, and acquired and shut-down companies included.

Target: 1+ database (Companies, at least 25 rows on Standard); 2+ chart (companies by stage and by segment); 4+ source.

Seed cards:
- database: Companies (database `companies`)
- chart: Companies by stage (database `companies`)

### 04 MARKET SIZE & GROWTH (sky; scout, builder, critic)

Brief: TAM, SAM and growth for the whole market and by segment, both top-down and bottom-up with the method stated, the drivers, the demand side (buyers and budgets) and the forecast horizon. At least one independent estimate.

Target: 4+ metric (TAM, SAM, CAGR, spend per buyer, each cited); 1+ database (Market sizing inputs); 2+ chart; 4+ source (including 1 independent report).

Seed cards:
- metric: TAM
- metric: SAM
- metric: CAGR
- metric: Spend per buyer
- database: Market sizing inputs (database `sizing`)
- chart: Market size build-up (database `sizing`)

### 05 FUNDING & CAPITAL FLOWS (rho; scout, builder)

Brief: Where the money has gone: funding by year, by stage, by segment and by region, the biggest rounds, the pace of new company formation and the trend in round sizes. Totals come from the rows, not from vendor summaries.

Target: 1+ database (Funding rounds); 3+ chart (funding by year, by segment and by stage); 1+ timeline (the largest rounds).

Seed cards:
- database: Funding rounds (database `rounds`)
- chart: Funding by year (database `rounds`)
- chart: Funding by segment (database `rounds`)
- timeline: Largest rounds

### 06 LEADERS & CHALLENGERS (sky; scout, builder, critic)

Brief: Who is winning and why: the leaders by customers and revenue (not only funding), the fast challengers, the incumbents and the ones losing ground. A scored comparison of the top players and a positioning 2x2.

Target: 1+ matrix (weighted scorecard of the top players); 1+ framework (the 2x2); 3+ source.

Seed cards:
- matrix: Leaders scorecard
- framework: Positioning 2x2

### 07 INVESTORS & ACQUIRERS (rho; scout)

Brief: Who funds and buys in this market: the most active investors with their portfolio companies, corporate investors and strategic acquirers, and every acquisition with its date, value and rationale. Exit multiples where disclosed.

Target: 2+ database (Investors and Acquisitions); 1+ timeline (acquisitions); 3+ source.

Seed cards:
- database: Investors (database `investors`)
- database: Acquisitions (database `acquisitions`)
- timeline: Acquisitions timeline

### 08 BUYERS & PRICING (sky; scout)

Brief: The demand side: who buys, how they buy, what they pay (pricing model and price points), what reviews say and what makes buyers switch. Positive and negative voices.

Target: 1+ database (Pricing); 4+ quote (at least 1 negative); 3+ source.

Seed cards:
- database: Pricing (database `pricing`)
- question: Why do buyers switch?

### 09 TRENDS & WHITE SPACE (rho; orb, scout, builder)

Brief: What is changing (technology, regulation, behaviour, capital) and what that opens: the segments with a need and no strong player, the combinations nobody has built, and the trends that threaten the whole category. Each white-space claim is a hypothesis with evidence for and against.

Target: 3+ hypothesis (white-space claims with evidence links); 1+ framework; 2+ insight.

Seed cards:
- hypothesis: There is an under-served segment
- hypothesis: A platform or incumbent absorbs the category
- hypothesis: Capital is ahead of revenue
- framework: Entering this market now: pros and cons

### 10 CAVEATS & MAP QUALITY (paper; critic)

Brief: How far to trust the map: work through the map-quality checklist, raising each problem as a Risk card with evidence or clearing it with a source. Covers definition drift, coverage gaps, survivorship bias, duplicates and stale data.

Target: 5+ risk (every check cleared with a source or raised).

Seed cards:
- checklist: Map-quality checklist
- risk: Coverage risk
- risk: Data quality risk
- risk: Market sizing risk
- risk: Competitive risk
- risk: Timing risk

### 11 SO WHAT & RECOMMENDATION (signal; orb)

Brief: What the map means for the purpose in the intake: where to play, which segments are most attractive (scored against the rubric), which companies to approach, partner with or watch, and what would change the view.

Target: 1+ framework (SWOT); 1+ decision; 1+ matrix (the filled rubric).

Seed cards:
- framework: SWOT: entering {{market}}
- decision: Where to play in {{market}}
- matrix: Market scorecard (rubric score x 2, so 10 is a 5)

### 12 OPEN QUESTIONS (paper; critic, orb)

Brief: What the map could not settle, ranked: data to buy, experts to call, companies to meet, each linked to the gap that prompted it. Every unresolved question card on the board is collected here.

Target: 1+ checklist (at least 8 ranked questions, each linked to its source card).

Seed cards:
- checklist: Questions and next steps

## Databases

### Segments (frame `taxonomy`)

The taxonomy: one row per segment.

| Column | Type | Notes |
|---|---|---|
| Segment | text |  |
| Definition | text |  |
| Buyer | text |  |
| Maturity | enum (Emerging, Growing, Mature, Consolidating) |  |
| Companies | number | Count of rows in Companies. |
| Total funding | currency | US dollars. |
| Revenue evidence | text | Is there customer revenue behind the funding? |
| Source | url |  |

Views: All (table); By maturity (board, by Maturity).

### Companies (frame `companies`)

Every company in the map. Discovered with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Segment | text |  |
| HQ | text |  |
| Founded | number |  |
| Stage | enum (Pre-seed / Seed, Series A, Series B, Series C+, Growth / Late, Public, Bootstrapped, Unknown) |  |
| Total funding | currency | US dollars. |
| Last round | text |  |
| Headcount | number |  |
| Business model | text |  |
| Target customer | text |  |
| Key differentiator | text |  |
| Notable investors | text |  |
| Status | enum (Active, Acquired, Shut down, Unknown) |  |
| As of | date |  |
| Source | url |  |

Views: All (table, sorted by Total funding desc); By segment (table, by Segment); By stage (board, by Stage); Acquired or shut down (table, filtered).

### Market sizing inputs (frame `sizing`)

Every assumption behind a market-size figure, so the build-up can be checked.

| Column | Type | Notes |
|---|---|---|
| Assumption | text |  |
| Value | number |  |
| Unit | text |  |
| Method | enum (Top-down, Bottom-up, Third-party) |  |
| Source | url |  |
| Confidence | enum (Low, Medium, High) |  |

Views: All (table); By method (board, by Method).

### Funding rounds (frame `capital`)

One row per disclosed round across the mapped companies.

| Column | Type | Notes |
|---|---|---|
| Company | text |  |
| Round | text |  |
| Date | date |  |
| Year | text |  |
| Amount | currency | US dollars. |
| Segment | text |  |
| Lead | text |  |
| Investors | text |  |
| Source | url |  |

Views: By date (table, sorted by Date desc); Largest (table, sorted by Amount desc).

### Investors (frame `investors`)

The most active investors in the market.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| Type | enum (VC, Corporate VC, Growth equity, PE, Strategic, Angel / other) |  |
| Deals | number | In the map. |
| Portfolio companies | text |  |
| Typical check | currency |  |
| Stage focus | text |  |
| Source | url |  |

Views: Most active (table, sorted by Deals desc); By type (board, by Type).

### Acquisitions (frame `investors`)

Every acquisition in the market with its value and rationale.

| Column | Type | Notes |
|---|---|---|
| Date | date |  |
| Acquirer | text |  |
| Target | text |  |
| Value | currency | US dollars, if disclosed. |
| Revenue multiple | number |  |
| Rationale | text |  |
| Source | url |  |

Views: By date (table, sorted by Date desc).

### Pricing (frame `buyers`)

How the players price, from public pages.

| Column | Type | Notes |
|---|---|---|
| Company | text |  |
| Model | enum (Subscription, Usage, Per seat, License, Hardware plus service, Custom quote, Free) |  |
| Entry price | text |  |
| Enterprise price | text |  |
| Free tier | boolean |  |
| Source | url |  |

Views: All (table); By model (board, by Model).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first (read_card, read_source, query_dataset): a company list becomes Companies rows (upsert_rows). Refine the Scope definition doc with the intake, propose the taxonomy as Segments rows (upsert_rows, key Segment) and give Scout the segments, the players and the stage in scope in its delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`, `update_card`.
2. Delegate with delegate: Scout first (discovery and enrichment), Builder once the Companies rows exist, Critic once Scout has placed its first sources. Name the frames each agent owns. Tools: `delegate`, `message_agent`.
3. After Scout's first pass, fill the four scope metrics (update_card) and tidy the taxonomy: split or merge segments, move rows to the segment that fits (add a corrected row; a row an agent wrote can only be changed by that agent). Tools: `query_board`, `search_board`, `query_dataset`, `update_card`, `upsert_rows`.
4. For a gap Scout could not close (a segment with no data, a sizing method), run deep_research (core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
5. At the end, fill the Market scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card. Then the hypotheses on white space (evidence for and against as card ids), the SWOT and the Decision card with your proposed option, the weighted total and the list of companies to approach. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
6. Write the market report with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. Tools: `compose_section`.
7. Keep the open questions current: collect every unresolved Question card into the "Questions and next steps" checklist, ranked, each linked to its source card. Tools: `search_board`, `update_card`, `add_link`.
8. Only when the user asks to keep watching the market: watch_topic with the market name and the monitor query (new entrants, rounds, acquisitions). Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. Start from the known players and segments in the intake: add them to Companies (upsert_rows, key Name) with a Source url on every row. Read two or three independent overviews of the market (web_search, fetch_url) to learn its vocabulary and to find more names. Tools: `web_search`, `fetch_url`, `parallel_extract`, `upsert_rows`, `place_card`.
2. Discovery: find_entities with the scope as the objective (the match limit follows the depth tier); it fills its own database card in this frame. Run it once per segment when the market is wide. On the Quick scan tier find_entities is refused: add the names from web_search with upsert_rows instead, up to 15. Tools: `find_entities`, `find_entities_extend`, `web_search`, `upsert_rows`.
3. Enrichment: batch_enrich fills the Companies columns (segment, HQ, founded, stage, total funding, last round, headcount, business model, target customer, differentiator, status) with an output schema of those fields. Then read each run database with query_dataset and upsert the rows into the Companies database (upsert_rows, key Name) so there is one table. Include acquired and shut-down companies and set Status. Tools: `batch_enrich`, `query_dataset`, `upsert_rows`.
4. Funding: one Funding rounds row per disclosed round (upsert_rows, key Company), with Year and Segment filled so the charts can group by them. Crunchbase or PitchBook when connected (fetch_signed_in), press otherwise. Add the largest rounds to the timeline. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `upsert_rows`, `place_card`.
5. Market size: at least one independent report; every TAM, SAM and CAGR is a metric card with its source, and the assumptions go into Market sizing inputs (upsert_rows) with the method (top-down, bottom-up or third-party). Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`, `upsert_rows`.
6. Investors and acquirers: the most active investors into Investors, every acquisition into Acquisitions (upsert_rows) and onto the timeline, each with a Source. Tools: `web_search`, `fetch_url`, `upsert_rows`, `place_card`.
7. Buyers: pricing pages into Pricing (upsert_rows, key Company); reviews from G2 or similar (fetch_signed_in when connected) as quote cards, positive and negative; a capture_page of two or three leaders for the record. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `capture_page`, `place_card`, `upsert_rows`.
8. Trends: technology, regulation, behaviour and capital shifts, as source cards with dated evidence; platform or incumbent launches that could absorb the category. Tools: `web_search`, `fetch_url`, `place_card`.
9. Deep research for the gaps that remain (a segment with no data, a regional market): deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) and query Companies and Funding rounds (query_dataset) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`, `query_dataset`.
2. Work through the map-quality checklist, one check at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence (the rows or counts) and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) and the checklist card (an insight needs at least two cited cards). A check with no evidence either way becomes a Question card in Open questions. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge every market-size number: one source, an opaque method, or only top-down is raised. Link it with "tension" to the card that disagrees. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Turn every gap into a Question card in Open questions, with a link to the card or gap that prompted it. Tools: `place_card`, `add_link`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which checks were raised. Tools: `report_progress`, `send_message`.

### Builder

1. A diagram of the taxonomy (a tree from the market to its segments to the leading names), built from Segments and Companies, and a bar chart of companies per segment bound to Segments. Tools: `place_card`, `query_dataset`, `read_card`.
2. Charts bound to the databases: companies by stage (Companies), the market size build-up (Market sizing inputs), and funding by year, by segment and by stage (Funding rounds). Tools: `place_card`, `query_dataset`.
3. The Leaders scorecard (weighted criteria, scores 0 to 10 from customer and revenue evidence) and the positioning 2x2 (framework, quadrant) with the leaders and challengers placed; then the white-space 2x2 (segment attractiveness against competitive intensity, from Segments and Companies) that the white-space hypotheses point at. Tools: `place_card`, `query_dataset`, `read_card`.
4. Optional one-page visual map (a design frame): the segments as columns with the leading companies in each, built only from the Companies database. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. The market definition drifts: companies in the map do not fit the stated boundary. *How:* Compare each Companies row with the Scope definition card; list the ones that do not fit.
2. Coverage gaps: whole regions, stages or segments with no companies. *How:* Count Companies by Segment, region and stage; an empty cell is raised as a gap or cleared as "none exist".
3. Survivorship bias: shut-down and acquired companies are missing. *How:* Check that Companies has Status values other than Active, and search for shutdowns and acquisitions.
4. Duplicated or renamed entities counted twice. *How:* Look for rows sharing a URL or a former name in the Companies database.
5. Funding figures from a single, vendor-reported source or in mixed currencies. *How:* Each Funding rounds row needs a Source; a total with one source is challenged; check currencies.
6. Market size built only top-down, or from a vendor report with an opaque method. *How:* Read Market sizing inputs: is there a bottom-up build and an independent estimate?
7. Stale data: companies or rounds older than 18 months presented as current. *How:* Check the "As of" and date columns; stale rows are flagged.
8. The leaders are chosen on funding or press, not on customers or revenue. *How:* Check that the Leaders scorecard uses customer and revenue evidence, not only funding.
9. A hyped sub-segment with little revenue behind it. *How:* Compare Segments funding with revenue and customer evidence in each segment.
10. A platform or incumbent can absorb the category as a feature. *How:* Look for platform announcements and incumbent launches in the trends timeline.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Market size | 20% | Niche: under a few hundred million dollars with no route to more. | Large enough to support several billion-dollar outcomes. | Very large, with budgets moving into it from adjacent categories. | sizing |
| Growth & momentum | 25% | Flat or shrinking; funding and deal flow falling. | Steady growth; funding and deal flow stable. | Fast growth with rising funding, new entrants and customer pull. | capital |
| Competitive structure | 20% | Dominated by an entrenched incumbent or a crowd of identical players. | A few strong players and room for specialists. | Fragmented, with no player holding more than a small share and clear ways to differentiate. | leaders |
| White space | 20% | Every need is served; no unmet segment. | Some segments are under-served. | A large, unmet need that the map shows nobody is addressing. | trends |
| Capital & exit environment | 15% | No acquirers, no listings and write-offs. | Occasional acquisitions at reasonable multiples. | Active strategic acquirers, recent IPOs and rising multiples. | investors |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Market report: {{market}}. Every paragraph cites cards; every number cites its source and date; vendor-reported figures are marked as such.

1. Summary & recommendation (at most 150 words): What the map shows, the recommendation, the top 3 findings and the top 3 caveats, in at most 150 words.
2. Scope & definition: The boundary, the purpose and the headline numbers.
3. Taxonomy: The segments with their maturity and size, with the taxonomy diagram.
4. The landscape: The companies by segment and stage with the charts; who is acquired or shut down.
5. Market size & growth: TAM, SAM and growth with the method and the build-up chart.
6. Funding & capital flows: Funding by year, segment and stage, and the largest rounds.
7. Leaders & challengers: The scorecard and the 2x2, and why the leaders lead.
8. Investors & acquirers: The most active investors, the acquirers and the acquisitions.
9. Buyers & pricing: Who buys, what they pay and what reviews say.
10. Trends & white space: The shifts, the white-space hypotheses and their evidence.
11. Caveats & map quality: The map-quality outcomes: each raised check with its mitigant, and the cleared ones in one line.
12. Scorecard: The rubric table: each dimension, its weight, its score and its evidence.
13. Open questions & next steps: The ranked questions and the proposed next steps.

Appendix: All sources.

One-page summary: Segments, Top companies, Size and growth, Recommendation.

Deck format: `market-map`.

## Follow-up chips

Shown after the first pass.

- Add a segment: Add a segment for [segment] to the {{market}} map: define it, find its companies and enrich them.
- Find more companies: Extend the Companies database with 20 more companies in {{market}}, especially in under-covered regions and segments.
- Deep dive on a company: Go deeper on [company] from the map: product, customers, funding, team and how it compares with the leaders.
- Where is the white space: Where is the white space in {{market}}? Rank the three best opportunities with the evidence for and against each.
- Refresh the map: Refresh the {{market}} map: new companies, rounds and acquisitions since the last pass, and what changed in the scorecard.
- Draft an outreach list: From the map, draft a ranked list of companies to approach for {{purpose|our goal}}, with a reason for each.

## Signed-in sources

- Crunchbase (crunchbase.com): Companies, funding rounds, investors and acquisitions.
- PitchBook (pitchbook.com): Round valuations, deal terms and investor activity.
- LinkedIn (linkedin.com): Headcount, hiring and company descriptions.
- G2 (g2.com): Reviews, categories and the competitive grid.

## Monitor

Only when the user asks: `{{market}} startup funding rounds, acquisitions, new entrants and product launches`. New companies, rounds and deals that change the map.
