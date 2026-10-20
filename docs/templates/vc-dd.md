# VC due diligence

<!-- Generated from packages/shared/src/templates/vc-dd.ts by `pnpm templates:docs`. Do not edit by hand. -->

Run a full venture due diligence on the company: twelve numbered frames (snapshot, team, product, market, traction, customers, competition, business model, financing, risks, thesis, founder questions), the red-flag checklist, the weighted rubric and an investment memo. Separate what the company claims from what independent sources verify, cite every number, and end with a recommendation (Pass, Track, Take meeting, Invest).

Template id `vc-dd`. Canvas title: `{{company}}: VC due diligence`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Company name (`company`) | text | yes | placeholder "Acme Robotics" |
| Website URL (`website`) | url | yes | placeholder "https://acme.com" |
| Stage (`stage`) | select | no | one of Pre-seed, Seed, Series A, Series B, Series C+, Growth |
| Round amount (`round_amount`) | text | no | placeholder "$8M" |
| Valuation (if known) (`round_valuation`) | text | no | placeholder "$40M post" |
| Lead (if known) (`round_lead`) | text | no | placeholder "Acme Ventures" |
| Sector / category (`sector`) | text | no | placeholder "Vertical SaaS for logistics" |
| Geography / HQ (`geography`) | text | no | placeholder "Berlin, Germany" |
| Your thesis or angle (`thesis`) | longtext | no | placeholder "Why are you looking at this company?" |
| Specific concerns to probe (`concerns`) | longtext | no | placeholder "Churn, key-person risk, a regulator…" |
| Founders (`founders`) | people | no | placeholder "One per line: Name, LinkedIn URL (Scout finds them if missing)". Optional. |
| Known competitors (`competitors`) | list | no | placeholder "Comma separated". Optional. Scout finds more. |
| Materials (`materials`) | materials | no | Drop the pitch deck, data-room PDFs, the financial model (CSV or XLSX) and the cap table (CSV or XLSX). Each becomes a card or database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites Crunchbase, PitchBook, LinkedIn, DocSend. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the memo is the summary only.
- **Standard:** Quick, plus batch enrichment of competitors and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on the market and the competitors, FindAll for full competitor discovery and the full memo.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 SNAPSHOT (signal; orb)

Brief: What {{company}} does in one sentence, the stage, the round, HQ, year founded, headcount, total raised, last valuation, key investors and the business model in one line.

Target: 6+ metric; 1+ entity (the company); 1+ doc (the one-liner).

Seed cards:
- entity: {{company}}
- doc: One-liner
- metric: Total raised
- metric: Last valuation
- metric: Headcount
- metric: Founded
- metric: Est. revenue / ARR
- metric: Growth rate

### 02 FOUNDERS & TEAM (sky; scout, critic)

Brief: Each founder's background, prior companies and outcomes, domain expertise, founder-market fit, how long they have worked together, key hires, leadership gaps, board composition, advisor quality, attrition signals and open roles (hiring as a strategy signal).

Target: 1+ entity (one person card per founder); 1+ database (the Team database); 3+ source.

Seed cards:
- database: Team (database `team`)
- question: What unfair advantage does this team have?
- question: Who is missing from the leadership team?

### 03 PROBLEM & PRODUCT (rho; scout, builder)

Brief: The problem and who feels it, how painful or frequent it is, the current alternatives, the product and how it works, differentiation, technical depth or moat, roadmap signals, a demo or screenshots, and pricing and packaging.

Target: 2+ image (screenshots from capture_page); 1+ diagram (how it works or the user flow); 1+ matrix; 3+ source.

Seed cards:
- question: Is this a painkiller or a vitamin?
- matrix: Product vs alternatives

### 04 MARKET (sky; scout, builder, critic)

Brief: TAM, SAM and SOM both top-down and bottom-up with the method stated, market growth (CAGR), why now (technology, regulation, behaviour), market structure (fragmented or consolidated), the buyer persona and budget owner, and the sales cycle.

Target: 4+ metric (TAM, SAM, SOM, CAGR, each cited); 2+ chart (size build-up (bar) and growth (line)); 4+ source (including 1 independent report).

Seed cards:
- metric: TAM
- metric: SAM
- metric: SOM
- metric: CAGR
- hypothesis: Why now
- database: Market sizing inputs (database `market-inputs`)

### 05 TRACTION & METRICS (rho; scout, orb, critic)

Brief: Revenue or ARR, growth (MoM and YoY), customers and logos, retention (gross and net), churn, cohort data if available, CAC, LTV, LTV/CAC, payback, gross margin, burn, runway and unit economics. Separate claimed numbers (the deck) from verified ones (independent sources).

Target: 6+ metric; 1+ chart (bound to the KPIs database); 1+ database (KPIs with the claimed or verified column filled).

Seed cards:
- database: KPIs (database `kpis`)
- metric: ARR
- metric: Growth
- metric: NRR
- metric: Gross margin
- metric: Burn
- metric: Runway
- chart: KPIs over time (database `kpis`)
- question: Which numbers are verified independently?

### 06 CUSTOMERS & SIGNALS (sky; scout)

Brief: Named customers and case studies, reviews (G2, Capterra, App Store, Trustpilot), social sentiment, web traffic and app-download trends if available, hiring velocity, GitHub activity for developer tools, press and awards, partnerships.

Target: 1+ database (Customers); 4+ quote (at least 1 negative); 1+ timeline (momentum events).

Seed cards:
- database: Customers (database `customers`)
- timeline: Momentum

### 07 COMPETITION (rho; scout, builder, critic)

Brief: Direct and indirect competitors, incumbents, substitutes, positioning, pricing, the funding of each, differentiation claims against reality, switching costs, and who is winning and why.

Target: 1+ database (at least 8 competitors); 1+ matrix; 1+ framework (the 2x2); 1+ chart (funding by competitor).

Seed cards:
- database: Competitors (database `competitors`)
- matrix: Competitor comparison
- framework: Positioning 2x2

### 08 BUSINESS MODEL & GTM (sky; scout, orb)

Brief: The revenue model, pricing, ACV, sales motion (product-led, sales-led or channel), channels, CAC sources, expansion levers, partnerships and international plans.

Target: 1+ framework (pros and cons of the GTM motion); 3+ source.

Seed cards:
- framework: GTM motion: pros and cons
- question: What has to be true for this GTM to scale 10x?

### 09 FINANCING & CAP TABLE (rho; scout, orb)

Brief: Funding history (rounds, dates, amounts, valuations, leads), investor quality, the cap table if provided, dilution, the option pool, the use of proceeds for this round, and implied valuation multiples against comparables.

Target: 2+ database (Funding rounds and Comparable valuations); 1+ timeline; 1+ metric (implied multiple).

Seed cards:
- database: Funding rounds (database `funding`)
- timeline: Funding timeline
- database: Comparable valuations (database `comps`)
- metric: Implied multiple

### 10 RISKS & RED FLAGS (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Also covers key-person risk, concentration risk, regulatory and legal risk, technical risk and market timing.

Target: 6+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Red-flag checklist
- risk: Team risk
- risk: Market risk
- risk: Product risk
- risk: Competition risk
- risk: Financial risk
- risk: Legal/Regulatory risk

### 11 THESIS & DECISION (signal; orb)

Brief: The bull case, the bear case, key hypotheses with confidence, what must be true, the scoring against the rubric, and a recommendation (Pass, Track, Take meeting, Invest) with conditions.

Target: 1+ framework (SWOT); 1+ decision; 3+ hypothesis (with evidence links); 1+ matrix (the filled rubric).

Seed cards:
- hypothesis: Thesis: {{company}} is a venture-scale opportunity
- hypothesis: The traction is real and independently verifiable
- hypothesis: The round is priced fairly against comparable companies
- framework: SWOT: {{company}}
- decision: Recommendation on {{company}}
- matrix: Scorecard (rubric score x 2, so 10 is a 5)

### 12 OPEN QUESTIONS FOR FOUNDERS (paper; critic, orb)

Brief: Questions for the next meeting, ranked by importance, each linked to the gap or risk that prompted it. Every unresolved question card on the board is collected here.

Target: 1+ checklist (at least 10 ranked questions, each linked to its source card).

Seed cards:
- checklist: Founder call questions

## Databases

### Team (frame `team`)

One row per founder, executive and key hire.

| Column | Type | Notes |
|---|---|---|
| Name | person |  |
| Role | text |  |
| Background | text |  |
| Prior companies | text |  |
| Prior exits | text | Outcome and year, or none. |
| Tenure (years) | number | At this company. |
| LinkedIn | url |  |
| Source | url |  |
| Flags | text | Short tenure, unverifiable claim, litigation, departure. |

Views: All (table); Flagged (table, filtered).

### Market sizing inputs (frame `market`)

Every assumption behind a TAM, SAM or SOM figure, so the build-up can be checked.

| Column | Type | Notes |
|---|---|---|
| Assumption | text |  |
| Value | number |  |
| Unit | text |  |
| Source | url |  |
| Confidence | enum (Low, Medium, High) |  |

Views: All (table); By confidence (board, by Confidence).

### KPIs (frame `traction`)

Every traction figure with its period, whether it is claimed or verified, and its source.

| Column | Type | Notes |
|---|---|---|
| Metric | text |  |
| Value | number |  |
| Period | date | ISO date or year-month. |
| Basis | enum (Claimed, Verified) | Deck numbers are Claimed. |
| Source | url |  |
| Note | text |  |

Views: All (table, sorted by Period asc); Claimed vs verified (board, by Basis).

### Customers (frame `customers`)

Named customers and the proof behind each.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| Segment | text |  |
| Size | text | Employees or revenue band. |
| Since | date |  |
| Source | url |  |
| Quote | text |  |

Views: All (table); By segment (table, by Segment).

### Competitors (frame `competition`)

Direct and indirect competitors. Discovered with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Category | enum (Direct, Indirect, Incumbent, Substitute) |  |
| HQ | text |  |
| Founded | number |  |
| Total funding | currency | US dollars. |
| Last round | text |  |
| Headcount | number |  |
| Pricing | text |  |
| Key differentiator | text |  |
| Threat level | rating | 1 (low) to 5 (high). |
| Source | url |  |

Views: All (table, sorted by Threat level desc); By category (board, by Category); High threat (table, filtered).

### Funding rounds (frame `financing`)

Every round the company raised.

| Column | Type | Notes |
|---|---|---|
| Round | text |  |
| Date | date |  |
| Amount | currency | US dollars. |
| Pre-money valuation | currency |  |
| Post-money valuation | currency |  |
| Lead | text |  |
| Participants | text |  |
| Source | url |  |

Views: By date (table, sorted by Date asc).

### Comparable valuations (frame `financing`)

Valuations of comparable companies, to judge the price of this round.

| Column | Type | Notes |
|---|---|---|
| Company | text |  |
| Round | text |  |
| Valuation | currency |  |
| Revenue multiple | number |  |
| Date | date |  |
| Source | url |  |

Views: By multiple (table, sorted by Revenue multiple desc).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first: the pitch deck, data-room PDFs, the financial model and the cap table (read_card and read_source for files, query_dataset for databases). Put every deck number into the KPIs database (upsert_rows) with Basis "Claimed". Hand the founders, the known competitors and the ticked signed-in sources from the intake to Scout in its delegate instruction. A row an agent wrote can only be changed by that agent: when a claimed number is verified, add a new row with Basis "Verified". Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (its eight-step playbook), Builder once Scout has placed its first sources, Critic once Scout has sources to review. Name the frames each agent owns. Tools: `delegate`, `message_agent`.
3. After Scout's first pass, fill the Snapshot metrics (update_card on the six placeholders) and the one-liner, each with a cited figure. Never write a figure you cannot source. Tools: `query_board`, `search_board`, `update_card`.
4. Compute the implied valuation multiple and the unit economics from the KPIs and Funding rounds databases (query_dataset), and update the Implied multiple metric. Tools: `query_dataset`, `update_card`.
5. For a gap Scout could not close, run deep_research (core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
6. At the end, fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card in the why line. Then the SWOT, the three hypotheses (evidence for and against as card ids) and the Decision card: your proposed option and the weighted total in its rationale. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
7. Write the memo with compose_section, section by section in the order of the memo outline, then the one-page summary. On the Quick tier write the summary only. Tools: `compose_section`.
8. Keep the founder questions current: collect every unresolved Question card into the "Founder call questions" checklist, ranked, each linked to its source card. Tools: `search_board`, `update_card`, `add_link`.
9. Only when the user asks to keep watching the company: watch_topic with the company name and the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. The company site: home, about/team, pricing and customers pages (fetch_url). Take capture_page screenshots of the home and pricing pages and place them as image cards in Problem & product. Note the pricing and sales motion for Business model & GTM, and any traction claims (ARR, growth, logos) as KPIs rows with Basis "Claimed" until a second source verifies them. Tools: `fetch_url`, `parallel_extract`, `capture_page`, `place_card`, `upsert_rows`.
2. Founders: start from the founders named in the intake. Signed-in LinkedIn or Crunchbase if the user connected them (fetch_signed_in), otherwise public search. One person card per founder; one Team row each (upsert_rows, key Name), with the Flags column for short tenures, unverifiable claims, litigation and departures. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
3. Funding history: Crunchbase or PitchBook if connected (fetch_signed_in), press otherwise. One row per round in Funding rounds (upsert_rows), one dated event per round on the Funding timeline. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `upsert_rows`, `place_card`.
4. Competitors: add the known competitors from the intake first. find_entities discovers more (the match limit follows the depth tier); it fills its own database card in this frame. batch_enrich fills in the Competitors columns (category, HQ, founded, total funding, last round, headcount, pricing, key differentiator) with an output schema of those fields. Then read each run's database with query_dataset and upsert the rows into the Competitors database (upsert_rows, key Name) so there is one table, with a Source url on every row. On the Quick scan tier find_entities and batch_enrich are refused: add a few rows from web_search with upsert_rows instead. Tools: `find_entities`, `batch_enrich`, `web_search`, `upsert_rows`, `query_dataset`.
5. Market reports and sizing: at least one independent report; every TAM, SAM, SOM and CAGR is a metric card with its source and the assumptions in Market sizing inputs (upsert_rows). Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`, `upsert_rows`.
6. Reviews and customer signals: G2, Capterra, App Store and Trustpilot pages, social sentiment, traffic and downloads. Quote cards, positive and negative; named customers into the Customers database. Tools: `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
7. Hiring, news and a red-flag sweep: hiring velocity, press and awards on the momentum timeline; also search litigation, layoffs, security incidents and traffic decline so Critic has sources to clear or raise each flag. Tools: `web_search`, `fetch_url`, `place_card`.
8. Deep research for the gaps that remain: deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card in Open questions for founders. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge every metric that has a single source: link it with "tension" to the card that disagrees, or place a Question asking for the second source. Challenge every TAM number; flag sizing done only top-down. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Turn every gap into a Question card in Open questions for founders, with a link to the card or gap that prompted it. Tools: `place_card`, `add_link`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. Charts: market size build-up (bar) and growth (line) bound to the Market sizing inputs database, funding by competitor (bar) bound to Competitors, and the traction chart bound to KPIs. Tools: `place_card`, `query_dataset`.
2. The competitor matrix (weighted criteria, scores 0 to 10 from the Competitors database) and the positioning 2x2 (framework, quadrant). Tools: `place_card`, `query_dataset`, `read_card`.
3. A diagram of how the product works or the user flow, and, from the screenshots, a design frame recreating the key screen when it helps. Tools: `place_card`, `write_design_frame`, `read_card`.
4. Optional one-page visual summary (a design frame): snapshot, score, recommendation and the top risks, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. Founder background claims that can't be verified. *How:* Compare each founder bio (site, deck, LinkedIn) with an independent source: press, registries, prior-company pages.
2. Past litigation, fraud allegations, or regulatory actions involving the company or founders. *How:* Look for court, regulator and news items on the Team database and Scout's sources; if none were searched, ask for the search.
3. Founder departures, or high leadership churn. *How:* Check the Team database for short tenures, ex-executives and open leadership roles.
4. Revenue or customer claims with no independent corroboration. *How:* For every claimed KPI and named customer, find a second source; claimed-only numbers are raised.
5. Down rounds, flat rounds, bridge notes or long gaps between rounds. *How:* Read the Funding rounds database: valuation steps, round dates and any bridge or extension.
6. Customer concentration (>30% revenue from one customer, if knowable). *How:* Look in the deck, data room and Customers database for revenue by customer; say "not knowable" if absent.
7. Negative review patterns (security, reliability, support, billing). *How:* Read the negative quotes and review sources in Customers & signals; count recurring themes.
8. Layoffs or hiring freezes (news, layoffs trackers, job-post drops). *How:* Look for layoff news and the hiring trend in the timeline; compare open roles with headcount.
9. Dependency on a single platform, API, supplier or regulation. *How:* Read the product and business-model cards for a platform or supplier the product cannot run without.
10. IP or ownership issues (open-source licence exposure, patents, trademark conflicts). *How:* Look for licence notes, patents or trademark records in Scout's sources; raise if the product leans on code or marks it may not own.
11. Unclear or circular unit economics. *How:* Check that CAC, LTV, payback and margin in the KPIs database are consistent and not derived from each other.
12. A well-funded incumbent shipping the same feature. *How:* Check the Competitors database and timeline for a funded rival or incumbent launching the same capability.
13. Domain or web-traffic decline. *How:* Look for traffic, app-download and search-interest trends in Customers & signals; a decline is raised.
14. Security incidents or data breaches. *How:* Look for breach news, a status page history and security-review items in the sources.
15. A cap table problem (heavy dilution, dead equity, unusual terms) if a cap table is provided. *How:* If a cap table was dropped, read it (query_dataset): founder share, option pool, dead equity, preferences. Otherwise mark "no cap table provided".

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Team | 25% | No relevant experience. | Relevant domain experience. | Repeat founders with an exit in the domain. | team |
| Market | 20% | Small or shrinking. | Large but crowded. | Large, fast-growing, with a clear why-now. | market |
| Product & moat | 15% | Commodity. | Clearly differentiated. | Defensible (data, network, or tech moat). | product |
| Traction | 20% | Pre-product. | Early revenue with growth. | Strong growth with good retention, verified. | traction |
| Business model | 10% | Unclear. | Proven model with okay margins. | Great unit economics. | gtm |
| Deal | 10% | Overpriced vs comps. | Market price. | Attractive price and terms. | financing |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Investment memo: {{company}}. Every paragraph cites cards; every number cites its source; claimed and verified figures are marked as such.

1. Summary & recommendation (at most 150 words): The decision, the score, the top 3 reasons and the top 3 risks, in at most 150 words.
2. Company snapshot: A table of the snapshot metrics: what, stage, round, HQ, founded, headcount, raised, valuation.
3. Team: Founders and key hires, founder-market fit, gaps, flags.
4. Problem & product: The problem, the product, how it works, differentiation and pricing.
5. Market: TAM, SAM and SOM with method, growth and why now, with the market chart.
6. Traction & metrics: The KPI table, claimed against verified, with the traction chart.
7. Customers & signals: Named customers, reviews, hiring, traffic and press.
8. Competition: The competitor matrix and the 2x2, and where the company wins and loses.
9. Business model & GTM: Revenue model, pricing, sales motion, channels and expansion.
10. Financing & valuation: The rounds table and the comparable valuations, with the implied multiple.
11. Risks & mitigants: The red-flag outcomes: each raised flag with its mitigant, and the cleared ones in one line.
12. Investment thesis: bull vs bear: The bull and bear cases and the key hypotheses with their confidence.
13. Scorecard: The rubric table: each dimension, its weight, its score and its evidence.
14. Open questions / next steps: The ranked founder-call questions and the proposed next step.

Appendix: All sources.

One-page summary: Snapshot, Score, Recommendation, Top risks.

Deck format: `vc-ic`.

## Follow-up chips

Shown after the first pass.

- Go deeper on competitor X: Go deeper on [competitor]: funding, product, pricing, customers and how it beats or loses to {{company}}.
- Build the bear case: Build the bear case for {{company}}: the strongest argument against investing, from the cards on this board, with the evidence that would change your mind.
- Draft the founder call agenda: Draft the founder call agenda for {{company}}: ordered questions with a time for each, linked to the gaps and risks on the board.
- Compare to [portfolio company]: Compare {{company}} to [portfolio company]: team, market, traction and terms, side by side with a table.
- Update with the new deck: I added a new deck. Read it, update the KPIs (tag deck numbers Claimed) and tell me what changed since the last version.
- Re-score after the call notes: I added the call notes. Re-score the rubric with them, say which scores moved and why, and update the decision.

## Signed-in sources

- Crunchbase (crunchbase.com): Funding rounds, investors, headcount and founder profiles.
- PitchBook (pitchbook.com): Round valuations and comparable deals.
- LinkedIn (linkedin.com): Founder and executive backgrounds, tenure, hiring and headcount.
- DocSend (docsend.com): A data room or deck shared with the user.

## Monitor

Only when the user asks: `{{company}} funding, launches, layoffs, lawsuits and leadership changes`. News that would change the recommendation.
