# Pricing research

<!-- Generated from packages/shared/src/templates/pricing-research.ts by `pnpm templates:docs`. Do not edit by hand. -->

Work out how to price the product: benchmark what the market charges, compare pricing models and value metrics, gather willingness-to-pay evidence, compute the customer value and the unit economics, design the tiers, model scenarios, check the risks, and recommend a price and packaging with experiments to confirm it. Date every price, separate list prices from what customers really pay, and mark assumptions as assumptions.

Template id `pricing-research`. Canvas title: `{{product}}: pricing research`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Product (`product`) | text | yes | placeholder "Acme Analytics" |
| Website URL (`website`) | url | no | placeholder "https://acme.com" |
| Business model (`model`) | select | no | one of SaaS subscription, Usage-based, Marketplace or transaction, Hardware, Services, Consumer freemium, Not sure |
| What you want to decide (`goal`) | select | no | one of Set the first price, Raise prices, Repackage the tiers, Add a free tier, Price for enterprise, Respond to a competitor |
| Current pricing (`current`) | longtext | no | placeholder "Pro $29 per seat per month, Team $79 ...". Leave empty if there is no price yet. |
| Who buys, and who pays (`customer`) | longtext | no | placeholder "Heads of growth at B2B SaaS; the CFO signs off above $10k" |
| Cost to serve and margin target (`cost`) | longtext | no | placeholder "About $4 per account per month in compute; 80% gross margin" |
| Known competitors (`competitors`) | list | no | placeholder "Comma separated". Optional. Scout finds more. |
| Materials (`materials`) | materials | no | Drop pricing sheets, a willingness-to-pay or Van Westendorp survey (CSV or XLSX), usage or churn data, cost data and win/loss notes. Each becomes a card or database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites G2, Crunchbase, SimilarWeb. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** No deep research: read pricing pages and public evidence, at most 12 cards per frame, a handful of competitors and the memo is the summary only.
- **Standard:** Quick, plus find_entities and batch_enrich for the comparable set, tier design and scenarios, and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra research on willingness to pay and category pricing, the full competitor set and the full memo and deck.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 PRICING QUESTION (signal; orb)

Brief: The decision for {{product}}: {{goal|to confirm}}. The current pricing is {{current|not set yet}}. Who pays: {{customer|to confirm}}. Cost and margin: {{cost|not given}}. State the question, the constraints and what a good answer looks like.

Target: 4+ metric; 1+ doc (the pricing brief); 2+ hypothesis.

Seed cards:
- doc: Pricing brief
- metric: Current price
- metric: Median competitor price
- metric: Target gross margin
- metric: Proposed price
- hypothesis: Customers will pay more for {{product}} than we charge today
- hypothesis: Our pricing metric matches the value customers see
- question: What would make the price feel obviously fair to the buyer?

### 02 MARKET PRICE BENCHMARKS (sky; scout, builder)

Brief: What comparable products charge: every plan of every comparable competitor in the Price points database with the unit, billing, limits and capture date, from the pricing page, and any evidence of real discounts or bundles. Include the substitutes (in-house, agencies) where they have a price.

Target: 1+ database (Price points, at least 20 rows); 4+ image (pricing page screenshots); 1+ chart (entry price by competitor).

Seed cards:
- database: Price points (database `prices`)
- chart: Entry price by competitor (database `prices`)

### 03 PRICING MODELS & METRICS (rho; scout, builder)

Brief: Which pricing models fit: flat, per seat, usage-based, tiered, hybrid, outcome-based. What the value metric is (the unit customers recognise and that grows with their value), how competitors charge, and the trade-offs of each model against our cost drivers.

Target: 1+ matrix (models on weighted criteria); 1+ framework (pros and cons of the front-runner); 3+ source.

Seed cards:
- matrix: Pricing model comparison
- framework: Front-runner model: pros and cons
- question: What is the unit of value customers recognise?

### 04 WILLINGNESS TO PAY (sky; scout, orb, builder)

Brief: What customers will pay: survey results (Van Westendorp or Gabor-Granger), interview quotes about price, budgets, purchases, pilots and review comments on price, by segment. Separate stated intent from revealed behaviour. A dropped survey becomes a database; read it with query_dataset and compute the acceptable range.

Target: 1+ database (WTP evidence); 6+ quote (price talk, quoted); 1+ chart (price sensitivity or acceptance curve).

Seed cards:
- database: WTP evidence (database `wtp`)
- math: Van Westendorp: the acceptable price range

### 05 VALUE & ROI (rho; scout, builder)

Brief: The value the customer gets in money terms: hours saved, revenue gained, cost avoided, risk reduced, from case studies, reviews and interviews. A price should be a fraction of the value; show the calculation with its inputs and sources.

Target: 3+ metric (annual value, payback, ROI); 1+ math (the ROI calculation); 3+ source (case studies or studies of the value).

Seed cards:
- metric: Annual value per customer
- metric: Payback period
- metric: ROI at the proposed price
- math: Customer ROI

### 06 UNIT ECONOMICS (sky; orb, builder)

Brief: What it costs us to serve one customer and what is left: COGS (compute, support, payment fees), gross margin at each candidate price, CAC and payback where known, and the break-even price. Mark every figure Assumed or Measured.

Target: 1+ database (Unit economics); 3+ metric (gross margin, break-even price, CAC payback).

Seed cards:
- database: Unit economics (database `economics`)
- metric: Gross margin at the proposed price
- metric: Break-even price
- metric: CAC payback

### 07 PACKAGING & TIERS (rho; builder, orb)

Brief: How to package the product: the tiers, who each is for, what is included, the limits and the trigger that moves a customer to the next tier. Keep to three or four tiers, name each for its customer, and justify the price steps.

Target: 1+ database (Tier design); 1+ design (a pricing page mock-up).

Seed cards:
- database: Tier design (database `tiers`)

### 08 SCENARIOS & SENSITIVITY (sky; builder)

Brief: What happens to revenue and margin at each candidate price: customers, conversion and churn assumptions per scenario, with the formula stated, and a chart. Always show the assumption each scenario rests on and mark it.

Target: 1+ database (Revenue scenarios); 1+ chart (MRR by scenario).

Seed cards:
- database: Revenue scenarios (database `scenarios`)
- chart: Monthly revenue by scenario (database `scenarios`)

### 09 RISKS & RED FLAGS (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence or clear it with a source. Cover churn on a price rise, competitor response, discount leakage and legal or tax limits.

Target: 5+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Red-flag checklist
- risk: Churn risk
- risk: Competitor response risk
- risk: Discount leakage risk
- risk: Margin risk

### 10 RECOMMENDATION & EXPERIMENTS (signal; orb, critic)

Brief: The recommended price and packaging, the reasons, what would change it, and the experiments that would confirm it (price test, survey, fake door, pilot) with what result counts as a pass. Score against the rubric with cited evidence.

Target: 1+ decision; 1+ matrix (the filled rubric); 1+ checklist (pricing experiments); 3+ insight.

Seed cards:
- decision: How should {{product}} be priced?
- matrix: Pricing strategy (rubric score x 2, so 10 is a 5)
- checklist: Pricing experiments

## Databases

### Price points (frame `benchmarks`)

Every plan of every comparable product, dated. Discovered with find_entities and enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Competitor | text |  |
| Plan | text |  |
| Price (USD per month) | currency | Per unit; annual price divided by 12. |
| Unit | text | Seat, usage, flat, workspace. |
| Billing | enum (Monthly, Annual, Usage, Custom) |  |
| Free tier | boolean |  |
| Limits | text |  |
| Includes | text |  |
| Real discount seen | text | From reviews or sales posts; blank if none. |
| Captured on | date |  |
| Source | url |  |

Views: All (table, sorted by Price (USD per month) asc); By competitor (table, by Competitor); By billing (board, by Billing).

### WTP evidence (frame `wtp`)

Every piece of evidence about what customers will pay, with how strong it is.

| Column | Type | Notes |
|---|---|---|
| Evidence | text | A line describing it. |
| Segment | text |  |
| Signal | enum (Purchase, Pilot, Budget stated, Survey, Interview, Review comment) |  |
| Price point | currency | US dollars per month, if stated. |
| Reaction | enum (Too cheap, Fair, Expensive, Too expensive, Unknown) |  |
| Strength | rating | 1 (hearsay) to 5 (money changed hands). |
| Source | url |  |

Views: All (table, sorted by Strength desc); By signal (board, by Signal); Revealed behaviour (table, filtered).

### Unit economics (frame `economics`)

Cost and margin lines, each marked Assumed or Measured.

| Column | Type | Notes |
|---|---|---|
| Line | text | Compute, support, payment fees, CAC, gross margin ... |
| Value | number |  |
| Unit | text | USD per customer per month, percent, months. |
| Basis | enum (Assumed, Measured, Benchmark) |  |
| Source | url |  |
| Note | text |  |

Views: All (table); Assumed vs measured (board, by Basis).

### Tier design (frame `packaging`)

The proposed and chosen tiers.

| Column | Type | Notes |
|---|---|---|
| Tier | text |  |
| For | text | The customer it is named for. |
| Price (USD per month) | currency |  |
| Unit | text |  |
| Includes | text |  |
| Limits | text |  |
| Upgrade trigger | text |  |
| Status | enum (Proposed, Chosen, Rejected) |  |

Views: By price (table, sorted by Price (USD per month) asc); By status (board, by Status).

### Revenue scenarios (frame `scenarios`)

Revenue and margin per candidate price, with the assumptions behind each row.

| Column | Type | Notes |
|---|---|---|
| Scenario | text |  |
| Price (USD per month) | currency |  |
| Customers | number |  |
| Conversion | number | Percent of trials. |
| Monthly churn | number | Percent. |
| MRR | currency | Price times customers. |
| Gross margin | number | Percent. |
| Assumption | text | What the row rests on. |

Views: All (table, sorted by MRR desc).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read what the user dropped first: pricing sheets, a survey, usage and cost data (read_card, read_source, query_dataset). Put every cost line into Unit economics (upsert_rows) with Basis "Measured" when the file measures it, otherwise "Assumed"; put survey results and quoted price talk into WTP evidence. Hand the competitors and the goal to Scout in the delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (benchmarks and evidence), Builder once Price points has rows, Critic once Scout has sources to review. Name the frames each agent owns, and hand over the intake facts (names, links, concerns) in the instruction. Tools: `delegate`, `message_agent`.
3. Compute the gross margin at each candidate price, the break-even price and the CAC payback from Unit economics and Price points (query_dataset); update the metric seeds with the unit and the basis. Never write a figure you cannot trace to a row. Tools: `query_dataset`, `upsert_rows`, `update_card`, `query_board`.
4. For a gap Scout could not close (no public price for a key competitor, no willingness-to-pay study), run deep_research (core) on that one question. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
5. Fill the Pricing strategy matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card. Then the hypotheses (evidence for and against as card ids), the Proposed price metric and the Decision: your proposed option and the weighted total in its rationale. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
6. Keep the pricing experiments current: what to test, the sample, the pass threshold, linked to the risk or gap that prompted each. The user ticks them off. Tools: `search_board`, `update_card`, `add_link`.
7. Write the memo with compose_section, section by section in the order of the memo outline, then the one-page summary. On the Quick tier write the summary only. When the user asks for slides, compose_slides with the deck outline. Tools: `compose_section`, `compose_slides`.
8. Only when the user asks to keep watching: watch_topic with the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. Our own pricing page and the current-pricing intake first (fetch_url, capture_page): rows in Price points (upsert_rows, Competitor set to our product) so the benchmark includes us. Tools: `fetch_url`, `capture_page`, `place_card`, `upsert_rows`.
2. Benchmarks: the competitors the user named, then find_entities for the rest of the comparable set; batch_enrich fills plans and prices. Read each pricing page (fetch_url, parallel_extract), screenshot it (capture_page) and write one Price points row per plan (upsert_rows, key Plan) with the capture date. Enterprise-only is Billing "Custom", never a guess. Quick scan: find_entities and batch_enrich are refused; read the pages directly. Tools: `find_entities`, `batch_enrich`, `fetch_url`, `parallel_extract`, `capture_page`, `upsert_rows`, `query_dataset`.
3. Real prices: what customers actually pay: discounts, bundles and negotiation in reviews, forums and sales posts (web_search, fetch_url; G2 only via fetch_signed_in if ticked). Fill Real discount seen; place Quote cards of price talk. Tools: `web_search`, `fetch_url`, `fetch_signed_in`, `place_card`, `upsert_rows`.
4. Pricing models: how each competitor charges and why (blog posts, interviews, analyst notes); the value metric of the category; a Source card for each useful piece. Fill the evidence the model comparison needs. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`.
5. Willingness-to-pay evidence beyond what the user dropped: public surveys, willingness studies, budget benchmarks, review comments on price. One WTP evidence row each (upsert_rows, key Evidence) with Signal and Strength; stated intent is never above 3. Tools: `web_search`, `fetch_url`, `web_answer`, `place_card`, `upsert_rows`.
6. Value: case studies and studies that put money on the outcome (hours saved, revenue gained, cost avoided). Metric cards for annual value and payback, each citing a source. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`.
7. Deep research for the gaps that remain: deep_research (core or above, per the tier), for example a pricing study of the category. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge every benchmark price with one source or an old date, and every willingness-to-pay claim built on stated intent: link it "tension" to the card that disagrees, or place a Question asking for the second source. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Design the experiments: for each raised risk, a Checklist or Question card that names the test, the sample and the pass threshold (you cannot tick). Tools: `place_card`, `add_link`, `query_board`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. Charts bound to the databases: entry price by competitor (bar, Price points), MRR by scenario (bar, Revenue scenarios). If a survey database exists, a price-sensitivity chart (line) from its cumulative shares. Tools: `place_card`, `query_dataset`.
2. The pricing model comparison (matrix, scores 0 to 10, the note naming the evidence) and pros and cons of the front-runner (framework). Tools: `place_card`, `query_dataset`, `read_card`.
3. The ROI calculation (math card) and the economics: use only values from cards and rows; show inputs and formula; mark assumptions. Tools: `place_card`, `query_dataset`, `upsert_rows`, `read_card`.
4. Tier design: three or four tiers in Tier design (upsert_rows, key Tier) with who each is for, includes, limits and the upgrade trigger; a pricing page mock-up as a design frame (write_design_frame). *(from the standard tier)* Tools: `upsert_rows`, `write_design_frame`, `place_card`, `query_dataset`.
5. Scenarios: one Revenue scenarios row per candidate price (upsert_rows, key Scenario) with customers, conversion, churn, MRR and gross margin computed from the stated assumptions; the Assumption column says what each rests on. Tools: `upsert_rows`, `query_dataset`, `place_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. The price is anchored to cost, not to value. *How:* Check the Unit economics and Value frames: is there any customer value figure behind the price, or only cost plus margin?
2. Competitor prices are list prices, not what customers pay. *How:* Look for discount, negotiation and bundle evidence in reviews and sources; list-only rows are marked.
3. Willingness to pay rests on stated intent only. *How:* Check the WTP evidence database for rows with Signal Purchase or Pilot; none is raised.
4. Gross margin is below the usual range for the model (SaaS below 70%). *How:* Read the Unit economics database; compare gross margin at the proposed price with the benchmark in the sources.
5. The value metric does not follow the cost driver. *How:* Compare what customers value (seats, outcomes) with what costs us (compute, support, usage); raise a mismatch.
6. Too many tiers or uneven jumps between tiers. *How:* Read Tier design: more than four tiers, or price jumps that differ by more than 3x, are raised.
7. A free tier or discount cannibalises paid plans. *How:* Check the limits of the free tier against the usage of paying customers in the evidence.
8. A price increase has no churn evidence for existing customers. *How:* If the goal is to raise prices, look for churn or downgrade data; if none was provided, raise and ask.
9. Benchmark data is older than six months. *How:* Check the Captured on dates in Price points; stale rows are marked and a Question asks for a refresh.
10. One segment's willingness to pay is generalised to all segments. *How:* Group WTP evidence by segment; raise a price that rests on one segment only.
11. Hidden costs are missing from the economics (support, infrastructure, payment fees). *How:* Compare the Unit economics rows with the cost lines in the sources and the materials.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Value alignment | 25% | Price is cost-plus and unrelated to the value delivered. | The metric loosely follows value. | The value metric is what customers say they get, and price scales with it. | value |
| Market position | 20% | Far above or below every comparable with no reason. | Within the benchmark range. | Deliberately placed, with a reason customers accept. | benchmarks |
| Willingness-to-pay evidence | 25% | Opinions only. | Stated willingness from interviews or a survey. | Revealed behaviour: purchases, pilots or a price test. | wtp |
| Margin health | 20% | Negative or unknown gross margin. | Positive margin that depends on assumptions. | Healthy margin on measured costs, with a safety buffer. | economics |
| Simplicity | 10% | Buyers cannot predict their bill. | Understandable with a calculator. | A buyer can explain it in one sentence. | packaging |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Pricing recommendation: {{product}}. Every paragraph cites cards; every price states its unit and date; stated willingness is marked apart from revealed behaviour; assumptions are marked as assumptions.

1. Summary & recommendation (at most 150 words): The recommended price and packaging, the three reasons and the three risks, in at most 150 words.
2. The pricing question: The decision, the constraints and what good looks like.
3. What the market charges: The price points table with dates and the entry price chart.
4. Pricing models and the value metric: The model comparison and the chosen value metric.
5. Willingness to pay: Evidence by strength and by segment; the acceptable price range.
6. Customer value and ROI: The value in money, the payback and the ROI at the proposed price.
7. Unit economics: Costs, gross margin at each price, break-even, with assumed and measured marked.
8. Packaging and tiers: The tiers, who each is for and what moves a customer up.
9. Scenarios: Revenue and margin per candidate price, with the assumptions.
10. Risks and mitigants: The red-flag outcomes: each raised flag with its mitigant.
11. Scorecard and experiments: The rubric table and the experiments that would confirm the price.

Appendix: All sources.

One-page summary: Recommended price, Benchmarks, Margin, Experiments.

Deck format: `standard`.

Deck: Pricing review: {{product}}. Slides, in order:

1. The recommendation: The price, the packaging and the three reasons.
2. What the market charges: The entry price chart and the price points table.
3. How competitors charge: The pricing model comparison matrix.
4. What customers will pay: Willingness-to-pay evidence by strength and segment.
5. The value we deliver: Annual value, payback and ROI.
6. Unit economics: Cost lines and gross margin at each price.
7. Tiers: The tier table and the upgrade triggers.
8. Scenarios: The revenue by scenario chart with assumptions.
9. Risks: Raised red flags with mitigants.
10. Experiments and next steps: The tests to run and the pass thresholds.

## Follow-up chips

Shown after the first pass.

- Refresh the benchmarks: Recheck every price in Price points today and tell me what changed since it was captured.
- Model a price rise: Model a [15]% price rise for {{product}}: revenue, margin and the churn level at which it stops paying off.
- Design the pricing page: Design the pricing page for the chosen tiers as a design frame, using only facts on the board.
- Write the experiment plan: Write the plan for the price test: variants, sample size, duration, metric and what result counts as a pass.
- Watch competitor pricing: Start a monitor on the competitors' pricing pages and announcements.
- Argue for the lower price: Build the strongest case for pricing {{product}} lower than recommended, from the cards on this board.

## Signed-in sources

- G2 (g2.com): Pricing pages, reviews that mention price and category pricing data.
- Crunchbase (crunchbase.com): Funding of the comparable set, to judge pricing power.
- SimilarWeb (similarweb.com): Traffic to the pricing pages of competitors.

## Monitor

Only when the user asks: `{{product}} competitors pricing changes, new plans and packaging announcements`. A competitor price move that would change the recommendation.
