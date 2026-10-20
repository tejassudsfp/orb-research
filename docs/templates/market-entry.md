# Market entry

<!-- Generated from packages/shared/src/templates/market-entry.ts by `pnpm templates:docs`. Do not edit by hand. -->

Decide whether and how to enter a new country: twelve numbered frames (country snapshot, market size and demand, customers and segments, competition, regulation and compliance, economics, channels and entry mode, localisation and operations, risks, go-to-market and roadmap, open questions, decision), the red-flag checklist, the weighted scorecard and an entry memo. Size demand bottom-up and top-down, find the competitors and channel partners with Parallel, price the compliance and the cost of entry, and end with a recommendation (Go, Go later, Test first, No-go) and a 90-day plan.

Template id `market-entry`. Canvas title: `Market entry: {{country}}`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Country (or region) (`country`) | text | yes | placeholder "Germany" |
| What you would sell (`offer`) | longtext | yes | placeholder "A B2B invoicing app for small firms, in 6 languages" |
| Entry mode in mind (`mode`) | select | no | one of Direct (local entity), Distributor / reseller, Partnership / JV, Acquisition, Online / cross-border, Not sure |
| Target customers (`segment`) | text | no | placeholder "Firms with 10 to 200 employees" |
| Where you operate today (`home`) | text | no | placeholder "United States, United Kingdom" |
| Traction at home (`traction`) | text | no | placeholder "$4M ARR, 600 customers" |
| Budget for entry (`budget`) | text | no | placeholder "$1.5M over 18 months" |
| Target launch (`timeline`) | text | no | placeholder "Q3 2027" |
| Competitors you know there (`competitors`) | list | no | placeholder "Comma separated". Optional. Scout finds more. |
| People or partners you know there (`contacts`) | people | no | placeholder "One per line: Name, role, LinkedIn URL". Optional. |
| Specific concerns to probe (`concerns`) | longtext | no | placeholder "Local data rules, a strong incumbent, hiring…" |
| Materials (`materials`) | materials | no | Drop market research, a financial model, pricing sheets, a local partner proposal or legal advice. Each becomes a card or database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites LinkedIn, Crunchbase, Similarweb, G2. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 3 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 10 | no limit | full |

- **Quick scan:** No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the memo is the summary only (market entry).
- **Standard:** Quick, plus entity discovery, batch enrichment and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on the hardest questions, full entity discovery with extension and the full memo.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 COUNTRY SNAPSHOT (signal; orb)

Brief: {{country}} in one paragraph and in numbers: population, GDP and growth, GDP per capita, currency and inflation, internet and smartphone penetration, ease of doing business, languages, and the economic structure that matters for {{segment|the target customers}}. Every figure has a year and a source.

Target: 6+ metric; 1+ doc (the country in one paragraph); 2+ source (official statistics).

Seed cards:
- doc: {{country}} in one paragraph
- metric: Population
- metric: GDP
- metric: GDP growth
- metric: Internet penetration
- metric: Currency and inflation
- metric: Ease of doing business

### 02 MARKET SIZE AND DEMAND (sky; scout, builder, critic)

Brief: How big the opportunity is for {{offer}}: TAM, SAM and SOM both top-down and bottom-up with the method stated, growth, the why-now (technology, regulation, behaviour), how demand is shifting and what proves that customers there pay for this today. Separate home-market evidence from local evidence.

Target: 4+ metric (TAM, SAM, SOM, CAGR, each cited); 2+ chart (size build-up and growth, bound to the sizing database); 1+ database (Market sizing inputs); 4+ source (including 1 independent report).

Seed cards:
- database: Market sizing inputs (database `sizing`)
- metric: TAM
- metric: SAM
- metric: SOM
- metric: CAGR
- hypothesis: Demand for {{offer}} exists in {{country}}
- chart: Market size build-up (database `sizing`)

### 03 CUSTOMERS AND SEGMENTS (rho; scout, builder)

Brief: Who buys, how they buy and what they pay: the segments by size, growth and willingness to pay, who decides, the buying process and its length, the language and payment habits, and which one or two segments to enter first. Quote local customers where possible.

Target: 1+ database (Segments); 4+ quote (local buyers or analysts); 2+ entity (buyer personas or reference customers); 1+ chart (segment size, bound to the Segments database).

Seed cards:
- database: Segments (database `segments`)
- chart: Segments by size (database `segments`)
- question: Which segment should we enter first, and why?

### 04 COMPETITIVE LANDSCAPE (sky; scout, builder, critic)

Brief: Who we would face in {{country}}: local leaders, global players already present, regional challengers and substitutes (spreadsheets, in-house work). Share, positioning, pricing, strengths and weaknesses, funding and who is winning and why. Include the competitors the user named.

Target: 1+ database (at least 8 competitors, local and global); 1+ matrix; 1+ framework (the 2x2); 3+ product (the strongest competitors).

Seed cards:
- database: Competitors in country (database `competitors`)
- matrix: Competitor comparison
- framework: Positioning in {{country}}

### 05 REGULATION AND COMPLIANCE (rho; scout, critic)

Brief: What must be true to operate legally and to sell: entity setup, licences and registrations, data protection and localisation, tax and invoicing, employment law, consumer and sector rules, IP protection and customs. For each: the authority, the lead time, the cost and whether it blocks launch.

Target: 1+ database (Regulatory requirements); 1+ timeline (lead times to launch); 4+ source (official sources, not blogs).

Seed cards:
- database: Regulatory requirements (database `regulation`)
- timeline: Path to a legal launch
- question: What is the longest lead-time item, and can it start now?

### 06 ECONOMICS AND PRICING (sky; scout, builder, orb)

Brief: What entry costs and what it earns: price points against local benchmarks, the cost of entry (setup, legal, localisation, people, marketing, taxes), unit economics in the new market, break-even in low, base and high scenarios and what must be true for the base case. Mark each cost as a quote, a benchmark or an assumption.

Target: 2+ database (Cost model and Pricing benchmarks); 1+ chart (cost by category, bound to the Cost model); 1+ math (the break-even); 3+ metric.

Seed cards:
- database: Cost model (database `costs`)
- database: Pricing benchmarks (database `pricing`)
- metric: Cost of entry (18 months)
- metric: Local price point
- metric: Break-even
- chart: Cost of entry by category (database `costs`)

### 07 CHANNELS AND ENTRY MODE (rho; scout, builder, critic)

Brief: How to reach customers and in what legal form: direct with a local entity, a distributor or reseller, a partnership or JV, an acquisition or selling cross-border online. Compare the modes on speed, cost, control, risk and learning, then build a list of the real partners and channels (distributors, agencies, platforms, associations) with fit and contact.

Target: 1+ database (Channel partners, at least 10); 1+ matrix (the entry modes compared); 1+ framework (pros and cons of the leading mode).

Seed cards:
- database: Channel partners (database `partners`)
- matrix: Entry modes compared
- framework: The leading entry mode: pros and cons

### 08 LOCALISATION, TALENT AND OPERATIONS (sky; scout, builder)

Brief: What changes to run the business there: product localisation (language, currency, payments, formats), support hours and language, the first hires and their cost, employment rules, the office or the employer-of-record route, banking and insurance. Find the real cost and time to hire for each role.

Target: 1+ database (Talent and operating costs); 1+ checklist (the localisation checklist); 3+ source.

Seed cards:
- database: Talent and operating costs (database `talent`)
- checklist: Localisation checklist

### 09 RISKS AND RED FLAGS (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Also covers political, economic, legal, operational and reputational risk, key-person risk in the local team and the cost of being wrong (the exit plan).

Target: 6+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Red-flag checklist
- risk: Political and economic risk
- risk: Regulatory and legal risk
- risk: Competitive risk
- risk: Operational risk
- risk: Financial risk

### 10 GO-TO-MARKET AND ROADMAP (signal; orb, builder)

Brief: The plan if we go: the segment and message to lead with, the channel and the first partners, pricing, the milestones for the first 90, 180 and 365 days with owners and the budget, the metrics that prove it works and the stop conditions that end the effort. Reuse what the board says; do not invent new facts here.

Target: 1+ timeline (the roadmap); 1+ checklist (the first 90 days); 1+ framework (pros and cons of the go-to-market motion).

Seed cards:
- timeline: Roadmap: 90, 180 and 365 days
- checklist: First 90 days
- framework: Go-to-market motion: pros and cons

### 11 OPEN QUESTIONS AND VALIDATION (paper; critic, orb)

Brief: What we still do not know and how to find out cheaply before committing: the questions ranked by how much they would change the decision, each linked to the gap or risk behind it, and the small experiments (customer calls, a landing page test, a partner pilot) that would answer them. Every unresolved question card on the board is collected here.

Target: 2+ checklist (at least 10 ranked questions and the validation experiments).

Seed cards:
- checklist: Open questions
- checklist: Validation experiments

### 12 THESIS AND DECISION (signal; orb)

Brief: The case for and against entering, the key hypotheses with confidence, what must be true, the scoring against the rubric and a recommendation (Go, Go later, Test first, No-go) with the conditions, the entry mode and the budget.

Target: 1+ framework (SWOT); 1+ decision; 3+ hypothesis (with evidence links); 1+ matrix (the filled scorecard).

Seed cards:
- hypothesis: We can comply and launch within the planned time
- hypothesis: We can win a defensible segment against the incumbents
- hypothesis: The economics work in the base case
- framework: SWOT: {{country}}
- matrix: Scorecard: {{country}} (rubric score x 2, so 10 is a 5)
- decision: Recommendation on {{country}}

## Databases

### Market sizing inputs (frame `demand`)

Every assumption behind a TAM, SAM or SOM figure, so the build-up can be checked.

| Column | Type | Notes |
|---|---|---|
| Assumption | text |  |
| Value | number |  |
| Unit | text |  |
| Method | enum (Top-down, Bottom-up, Analyst report, Official statistic) |  |
| Year | number |  |
| Source | url |  |
| Confidence | enum (Low, Medium, High) |  |

Views: All (table); By confidence (board, by Confidence); By method (table, by Method).

### Segments (frame `customers`)

Customer segments in the country, with size, growth, willingness to pay and how they buy.

| Column | Type | Notes |
|---|---|---|
| Segment | text |  |
| Size (firms or people) | number |  |
| Growth (% per year) | number |  |
| Willingness to pay (USD) | currency | Per year per customer. |
| Decision maker | text |  |
| Sales cycle (weeks) | number |  |
| Local evidence | enum (None, Home market only, Local, indirect, Local, direct) |  |
| Priority | enum (Enter first, Enter later, Skip) |  |
| Source | url |  |

Views: All (table, sorted by Size (firms or people) desc); By priority (board, by Priority); Enter first (table, filtered).

### Competitors in country (frame `competition`)

Local and global competitors in the country. Discovered with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Origin | enum (Local, Global, present, Regional, Substitute) |  |
| HQ | text |  |
| Founded | number |  |
| Share or customers | text |  |
| Total funding | currency | US dollars. |
| Pricing | text |  |
| Strengths | text |  |
| Weaknesses | text |  |
| Threat level | rating | 1 (low) to 5 (high). |
| Source | url |  |

Views: All (table, sorted by Threat level desc); By origin (board, by Origin); High threat (table, filtered).

### Regulatory requirements (frame `regulation`)

Everything required to operate and sell in the country, with authority, lead time, cost and status.

| Column | Type | Notes |
|---|---|---|
| Requirement | text |  |
| Area | enum (Entity setup, Licence, Data protection, Tax and invoicing, Employment, IP, Customs, Consumer, Sector rule) |  |
| Authority | text |  |
| Lead time (weeks) | number |  |
| Cost (USD) | currency |  |
| Blocking | boolean | Ticked when it stops us selling until done. |
| Status | enum (Not started, In progress, Done, Not needed) |  |
| Source | url | An official source. |

Views: All (table, sorted by Lead time (weeks) desc); By area (board, by Area); Blocking (table, filtered).

### Cost model (frame `economics`)

Every cost of entering and running in the country, whether it is a quote, a benchmark or an assumption.

| Column | Type | Notes |
|---|---|---|
| Item | text |  |
| Category | enum (Setup, Legal and tax, People, Localisation, Marketing and sales, Operations, Partners) |  |
| Amount (USD) | currency |  |
| Frequency | enum (One-off, Monthly, Annual) |  |
| Months | number | How many months it applies in the first 18. |
| Basis | enum (Quote, Benchmark, Assumption) |  |
| Source | url |  |

Views: All (table, by Category); By basis (board, by Basis); Assumptions (table, filtered).

### Pricing benchmarks (frame `economics`)

What competitors and substitutes charge in the country, so our local price can be set against it.

| Column | Type | Notes |
|---|---|---|
| Row | text | Vendor and plan. |
| Vendor | text |  |
| Plan | text |  |
| Local price | number |  |
| Currency | text |  |
| Price (USD per year) | currency |  |
| Unit | text |  |
| Date | date |  |
| Source | url |  |

Views: By price (table, sorted by Price (USD per year) asc); By vendor (table, by Vendor).

### Channel partners (frame `channels`)

Distributors, resellers, agencies, platforms and associations that could carry us. Discovered with find_entities.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Type | enum (Distributor, Reseller, Agency, Marketplace, System integrator, Association, Investor or advisor) |  |
| City | text |  |
| Customers or reach | text |  |
| Sells competitors | boolean |  |
| Contact | person |  |
| Fit | rating | 1 (weak) to 5 (strong). |
| Status | enum (Identified, Contacted, In talks, Signed, Declined) |  |
| Source | url |  |

Views: All (table, sorted by Fit desc); By status (board, by Status); Strong fit (table, filtered).

### Talent and operating costs (frame `operations`)

Roles we would hire and what they cost in the country, plus fixed operating costs and employment rules.

| Column | Type | Notes |
|---|---|---|
| Item | text | A role (Account executive) or a cost (Office, EOR fee). |
| Kind | enum (Role, Fixed cost, Rule) |  |
| Salary or cost (USD per year) | currency |  |
| Employer on-cost (%) | number |  |
| Time to hire (weeks) | number |  |
| Notice period (weeks) | number |  |
| Note | text |  |
| Source | url |  |

Views: All (table); By kind (board, by Kind).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first: market research, the financial model, pricing sheets and partner proposals (read_card and read_source for files, query_dataset for tables). Put every figure the user already has into the Market sizing inputs and the Cost model (upsert_rows, Basis or Method set from the document). Hand Scout the competitors, the contacts and the ticked signed-in sources in its delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (its eight-step playbook), Builder once Scout has placed its first sources, Critic once Scout has sources to review. Name the frames each agent owns. Tools: `delegate`, `message_agent`.
3. After Scout's first pass, fill the Country snapshot metrics (update_card on the six placeholders) and the one-paragraph description, each with a cited figure and its year. Prefer official statistics. Never write a figure you cannot source. Tools: `query_board`, `search_board`, `update_card`, `web_answer`.
4. Build the entry model from the Cost model and Pricing benchmarks (query_dataset): the cost of entry for 18 months, the local price point against the benchmark, unit economics and the break-even in low, base and high scenarios. Update the three metrics and place the break-even as a Math card; say which inputs are assumptions. Tools: `query_dataset`, `upsert_rows`, `update_card`, `place_card`.
5. For a gap Scout could not close (a market size with no independent source, a licence lead time, a local price), run web_answer, then deep_research (core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `web_answer`, `deep_research`, `research_status`, `ask_user_question`.
6. At the end, fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card in the why line. Then the SWOT, the hypotheses (evidence for and against as card ids) and the Decision card: your proposed option and the weighted total in its rationale. The user decides. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
7. Write the plan: the roadmap milestones (entity, licences, hires, first partner, first revenue, review) with owners and budget from the Cost model, the First 90 days checklist and the stop conditions. Use only facts already on the board. Tools: `query_board`, `query_dataset`, `update_card`, `place_card`, `add_link`.
8. Keep the "Open questions" checklist current: collect every unresolved Question card, rank by how much it would change the decision, each linked to its source; keep the validation experiments current. Tools: `search_board`, `update_card`, `add_link`.
9. Write the memo with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. Tools: `compose_section`.
10. Only when the user asks to keep watching the country (a long entry): watch_topic with the country, the sector and the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. The country basics from official sources first (national statistics office, central bank, World Bank, trade promotion agency): population, GDP, growth, inflation, connectivity, ease of doing business (fetch_url, parallel_extract). Place each as a source card with the year, and a metric card when the figure is a headline number. Tools: `fetch_url`, `parallel_extract`, `web_search`, `place_card`.
2. Market size: at least one independent report, official counts of the target customers and, bottom-up, the number of target customers times a realistic price. Every TAM, SAM, SOM and CAGR is a metric card with its source; each assumption is a row in Market sizing inputs (upsert_rows, Method set). Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`, `upsert_rows`.
3. Customers: segments by size and growth from official counts, how local buyers buy (associations, trade press, review sites, LinkedIn if connected), and what they pay. One Segments row per segment (upsert_rows, Local evidence set honestly); quote cards from local buyers and analysts; Entity cards for two buyer personas or reference customers. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
4. Competition: add the competitors the user named, then find_entities for local and global players selling to the target customers in the country (the match limit follows the depth tier); it fills its own database card in this frame. batch_enrich fills origin, HQ, founded, share, pricing and funding; consolidate into Competitors in country with query_dataset and upsert_rows. One Product card per strong competitor; capture_page screenshots of their local pricing pages. Tools: `find_entities`, `batch_enrich`, `web_search`, `capture_page`, `query_dataset`, `upsert_rows`, `place_card`.
5. Regulation, from official sources only (the regulator, the tax authority, the company registry, the data-protection authority): entity setup, licences, data rules, tax and invoicing, employment, IP and consumer rules. One Regulatory requirements row per item with authority, lead time, cost and Blocking; dated steps on the Path-to-launch timeline. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`, `upsert_rows`.
6. Costs and prices: local pricing pages and marketplaces for Pricing benchmarks (upsert_rows, price in USD per year), then quotes or benchmarks for entity setup, legal, tax, localisation and marketing for the Cost model; mark each Basis honestly. Convert at a stated rate and date. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`, `upsert_rows`.
7. Channels and talent: find_entities for distributors, resellers, agencies, platforms and associations that reach the target customers (it fills its own database card in this frame), batch_enrich for city, reach and whether they sell competitors; consolidate into Channel partners with query_dataset and upsert_rows and rate Fit. Salary ranges, employer on-costs, time to hire and notice rules for the first hires go into Talent and operating costs (upsert_rows). Tools: `find_entities`, `batch_enrich`, `fetch_signed_in`, `web_search`, `fetch_url`, `query_dataset`, `upsert_rows`, `place_card`.
8. Deep research for the gaps that remain (a licence route, a local market size, a channel structure): deep_research (core or above, per the tier), one question per run. Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source cards that clear it. Never leave a flag silent; if nothing was searched, say so and ask Scout for the search. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge the demand story: every TAM figure with a single source, sizing done only top-down, and any claim of demand that rests on home-market evidence (Local evidence "Home market only" or "None" in Segments). Link a "tension" to the card that disagrees or place a Question asking for local evidence; test the competition 2x2 against the Competitors in country threat levels. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Turn every gap into a Question card or a checklist item in Open questions and validation, ranked, with a link to the card or gap that prompted it. Tools: `place_card`, `add_link`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. Charts: the market size build-up and growth bound to Market sizing inputs, segment size bound to Segments, and cost by category bound to the Cost model. Tools: `place_card`, `query_dataset`, `read_card`.
2. The competitor comparison matrix (weighted criteria, scores 0 to 10 from Competitors in country) and the positioning 2x2. Tools: `place_card`, `query_dataset`, `read_card`.
3. Score the "Entry modes compared" matrix from the Cost model, Regulatory requirements and Channel partners (0 to 10 per criterion, with the evidence in the note) and place pros and cons for the leading mode. Tools: `place_card`, `query_dataset`, `read_card`.
4. The localisation checklist: add the items the Regulatory requirements and the competitor pages show are needed (language, payments, tax invoices, data hosting), each citing its source card. Tools: `place_card`, `query_dataset`, `read_card`, `query_board`.
5. The roadmap timeline from the regulation lead times and the Cost model, and the go-to-market pros and cons; each milestone cites the card it depends on. Tools: `place_card`, `query_board`, `read_card`.
6. Optional one-page visual summary (a design frame): the country, the score, the entry mode, the cost and the top risks, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. Political instability, sanctions, export controls or a government stance that makes the sector unsafe. *How:* Search sanctions lists, export-control rules and recent political and trade news for the country and sector.
2. Currency controls, a volatile currency or limits on moving profits out of the country. *How:* Look for exchange-rate history, inflation, capital-control rules and the withholding tax on remittances.
3. A licence, a local partner, a minimum local ownership or local content rule is required to operate. *How:* Read the Regulatory requirements database for any row marked Blocking and for foreign-ownership rules.
4. Data localisation or cross-border data rules that our product does not meet. *How:* Compare the data rules with where we host and process data; raise a gap with the lead time to close it.
5. Entrenched local incumbents, or a price level well below our price. *How:* Read Competitors in country and Pricing benchmarks: shares, price points and a local champion with a lock on channels.
6. Tax and invoicing complexity: VAT registration, e-invoicing mandates, withholding taxes or a permanent-establishment risk. *How:* Read the tax rows in Regulatory requirements and the Cost model; raise anything not yet priced.
7. Weak intellectual-property enforcement or a trademark already taken locally. *How:* Search the trademark register and read the IP enforcement record for the country.
8. Employment law, hiring cost or a talent shortage that breaks the plan. *How:* Read Talent and operating costs for notice periods, works-council rules, salary levels and time to hire.
9. Product-market fit assumed from the home market: language, payment methods, buying habits or culture differ. *How:* Read Segments and the quotes: is there local evidence of demand, or only home-market evidence?
10. Customer acquisition costs or sales cycles are likely higher than the home market, and the plan assumes they are the same. *How:* Compare the Cost model’s acquisition assumptions with local benchmarks and the sales cycle in the Segments rows.
11. Payment, logistics or infrastructure gaps: low card use, poor delivery or unreliable connectivity. *How:* Look for payment-method share, delivery times and connectivity data; raise any that the product needs.
12. Corruption, reputational or ethical exposure for the company in this market. *How:* Check corruption indices, partner screening needs and recent enforcement actions against foreign firms.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Market attractiveness | 25% | Small, flat or shrinking demand for what we sell. | A sizeable market with steady growth. | Large and fast growing, with a clear reason demand is rising now. | demand |
| Ability to win | 20% | Entrenched incumbents win on price or relationships we cannot match. | A crowded market with a defensible niche. | A clear gap our offer fills, and proof from similar customers. | competition |
| Regulation and ease of operating | 15% | A licence, a local partner or data localisation blocks entry for a year or more. | Manageable requirements; three to six months to comply. | Light requirements; we can sell within weeks. | regulation |
| Economics | 15% | Loses money in every scenario inside the planning horizon. | Break-even in the base case within 24 months. | Break-even inside 12 months in the base case, with room in price. | economics |
| Channel and partner access | 15% | No credible way to reach customers. | Known channels with some partner interest. | A shortlist of qualified partners or channels, with warm introductions. | channels |
| Risk | 10% | Several raised red flags with no mitigant. | Some raised flags, each with a mitigant. | No raised flag that a mitigant does not cover. | risks |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Market entry memo: {{country}}. Every paragraph cites cards; every figure cites its source and its year; official statistics are marked as such; every cost says whether it is a quote, a benchmark or an assumption.

1. Summary and recommendation (at most 150 words): The recommendation, the entry mode, the score, the top 3 reasons, the top 3 risks and the budget, in at most 150 words.
2. The country at a glance: A table of the country metrics and a paragraph on what matters for the offer.
3. Market size and demand: TAM, SAM and SOM with the method, growth and why now, with the market chart.
4. Customers and segments: The segments, which to enter first and the local evidence for each.
5. Competition: Local and global competitors, the comparison and where we win and lose.
6. Regulation and compliance: What is required to operate, with lead times and costs, and the path to a legal launch.
7. Economics and pricing: The local price, the cost of entry, the scenarios and the break-even, with the chart.
8. Channels and entry mode: The entry modes compared, the recommended one and the partners to approach first.
9. Localisation, talent and operations: What changes to run the business there and what the first hires cost.
10. Risks and mitigants: The red-flag outcomes: each raised flag with its mitigant, the cleared ones in one line.
11. Roadmap and first 90 days: The milestones for 90, 180 and 365 days with owners, the metrics and the stop conditions.
12. Scorecard: The rubric table: each dimension, its weight, its score and its evidence.
13. Open questions and validation: The ranked open questions and the experiments that would answer them.

Appendix: All sources.

One-page summary: Country snapshot, Market size, Entry mode, Score, Recommendation, Cost, Top risks.

Deck format: `market-entry`.

## Follow-up chips

Shown after the first pass.

- Compare with [other country]: Compare {{country}} with [other country] as an entry market: demand, competition, regulation, cost and score, side by side with a table.
- Deep dive on the first segment: Go deeper on the first segment to enter in {{country}}: who buys, how, what they pay, three named target accounts and the message to lead with.
- Shortlist partners: Shortlist the five best channel partners in {{country}} from the Channel partners database, with why each fits and the approach for each.
- Stress-test the economics: Stress-test the entry economics for {{country}}: double the acquisition cost and delay launch by six months, and show the effect on the break-even.
- Compliance checklist: Turn the Regulatory requirements for {{country}} into a launch checklist ordered by lead time, with an owner for each item.
- Write the 90-day plan: Write the detailed 90-day plan to enter {{country}}: week by week, owners, budget and the decisions we need from leadership.

## Signed-in sources

- LinkedIn (linkedin.com): Local buyers, competitors’ headcount and hiring, and the people at candidate channel partners.
- Crunchbase (crunchbase.com): Funding and ownership of local and regional competitors.
- Similarweb (similarweb.com): Web traffic of competitors in the country, by channel.
- G2 (g2.com): What local customers say about the competitors, by country where shown.

## Monitor

Only when the user asks: `{{country}} regulation, tax, data-protection and trade changes affecting software and foreign companies, and news about our competitors there`. A rule or competitor move that changes the entry plan.
