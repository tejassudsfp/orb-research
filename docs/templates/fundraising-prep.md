# Fundraising prep

<!-- Generated from packages/shared/src/templates/fundraising-prep.ts by `pnpm templates:docs`. Do not edit by hand. -->

Prepare a company to raise a round: the narrative, the traction proved against the company's own data, the market and competition, comparable rounds and a defensible valuation range, the financial plan and the use of funds, the investor target list, the deck and data room, the hard questions to rehearse, and a process and timeline. Look at the company the way an investor will during diligence: find the weak numbers before they do, and never state a figure that the data does not support.

Template id `fundraising-prep`. Canvas title: `{{company}}: fundraising prep`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Company name (`company`) | text | yes | placeholder "Acme Robotics" |
| Website URL (`website`) | url | yes | placeholder "https://acme.com" |
| Round (`stage`) | select | no | one of Pre-seed, Seed, Series A, Series B, Series C+, Bridge |
| Amount you want to raise (`raise`) | text | no | placeholder "$4M" |
| Valuation in mind (`valuation`) | text | no | placeholder "$20M post" |
| Sector (`sector`) | text | no | placeholder "Robotics, logistics" |
| HQ and region (`geography`) | text | no | placeholder "Berlin, EU" |
| Traction so far (`traction`) | longtext | no | placeholder "$30k MRR, 22 customers, growing 12% a month" |
| What the money is for (`use`) | longtext | no | placeholder "Two engineers, a sales lead, 18 months of runway" |
| Investors you already have in mind (`investors`) | list | no | placeholder "Comma separated". Optional. Scout finds more that fit the stage, sector and cheque. |
| What worries you about the raise (`concerns`) | longtext | no | placeholder "Churn in the SMB segment; a larger competitor just raised" |
| Materials (`materials`) | materials | no | Drop the pitch deck, the financial model (CSV or XLSX), the cap table (CSV or XLSX), KPI exports and any data-room documents. Each becomes a card or database; deck numbers are tagged Claimed. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites Crunchbase, PitchBook, LinkedIn. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** Review the materials against public sources: no deep research, no investor list, at most 12 cards per frame, and the memo is the summary only.
- **Standard:** Quick, plus find_entities and batch_enrich for comparable rounds, competitors and investor targets, the plan and dilution scenarios, and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra research on the market and comparable rounds, a larger investor list and the full memo and pitch deck.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 RAISE PLAN (signal; orb)

Brief: The round in numbers: the amount ({{raise|to confirm}}), the valuation in mind ({{valuation|to confirm}}), the round ({{stage|to confirm}}), the timeline, the runway and what the money buys ({{use|to confirm}}). Concerns to probe: {{concerns|none given}}.

Target: 5+ metric; 1+ entity (the company); 1+ doc (the round summary).

Seed cards:
- entity: {{company}}
- doc: Round summary
- metric: Target raise
- metric: Valuation in mind
- metric: Cash and burn
- metric: Runway
- metric: Raise timeline
- question: What must be true about the company at the end of this round?

### 02 STORY & NARRATIVE (sky; orb, builder)

Brief: The story in the order investors need it: the problem, the insight, why now, the product, why this team, the market, the traction, the ask. One sentence each, every claim backed by a card on this board. Write what makes the company different in one line.

Target: 2+ doc (the narrative and the one-liner); 3+ hypothesis (why now, why us, why this market); 1+ framework (SWOT).

Seed cards:
- doc: One-liner
- hypothesis: Why now: a shift makes {{company}} possible today
- hypothesis: Why us: this team has an edge nobody else has
- hypothesis: Why this market: it is large and growing fast enough
- framework: SWOT: {{company}}

### 03 TRACTION & METRICS (rho; orb, builder, critic)

Brief: The numbers investors will test: revenue or ARR, growth, customers, retention, churn, CAC, LTV, payback, gross margin, burn and runway. Separate Claimed from Verified, and reconcile the deck with the model and the data. Traction as given: {{traction|to confirm}}.

Target: 1+ database (KPIs with Basis filled); 6+ metric; 1+ chart (bound to the KPIs database).

Seed cards:
- database: KPIs (database `kpis`)
- metric: ARR
- metric: Growth
- metric: Net revenue retention
- metric: Gross margin
- metric: CAC payback
- metric: Customers
- chart: KPIs over time (database `kpis`)
- question: Which of these numbers could an investor verify from our own data today?

### 04 MARKET & COMPETITION (sky; scout, builder, critic)

Brief: TAM, SAM and SOM sized top-down and bottom-up with the assumptions, growth and why now; and the competitors investors will compare us with: direct, indirect, incumbents and substitutes, their funding and how we win. Be honest: name the funded rivals.

Target: 4+ metric (TAM, SAM, SOM, growth); 1+ database (Competitors, at least 8 rows); 1+ framework (the 2x2); 1+ chart (funding by competitor).

Seed cards:
- metric: TAM
- metric: SAM
- metric: SOM
- metric: Market growth
- database: Competitors (database `competitors`)
- chart: Total funding by competitor (database `competitors`)
- framework: Positioning 2x2

### 05 COMPARABLE ROUNDS & VALUATION (rho; scout, orb)

Brief: Rounds of comparable companies (stage, sector, region, time) with amount, valuation and revenue at the round, the median and the range, and what valuation range {{company}} can defend. Show how the implied multiple compares. A comparable older than 24 months is marked.

Target: 1+ database (Comparable rounds, at least 15 rows); 1+ chart (valuation by comparable); 3+ metric (median, range, our implied multiple).

Seed cards:
- database: Comparable rounds (database `rounds`)
- chart: Valuation by comparable (database `rounds`)
- metric: Median comparable valuation
- metric: Defensible range
- metric: Our implied multiple

### 06 FINANCIAL PLAN & USE OF FUNDS (sky; orb, builder)

Brief: Where the money goes and what it buys: the use of funds by category with the milestone each reaches, the runway under three scenarios, and the burn plan. The use of funds: {{use|to confirm}}. Show the formula and mark every assumption.

Target: 2+ database (Use of funds, Runway scenarios); 1+ chart (use of funds); 1+ math (the runway formula).

Seed cards:
- database: Use of funds (database `funds`)
- database: Runway scenarios (database `runway`)
- chart: Use of funds by category (database `funds`)
- math: Runway and dilution

### 07 VALUATION, DILUTION & TERMS (rho; scout, orb)

Brief: What the founders keep: dilution under three raise sizes and valuations, the option pool, the instruments (SAFE, convertible note, priced round) and the key terms to expect and to negotiate. Read the cap table if one was dropped. General information, not legal advice.

Target: 1+ database (Dilution scenarios); 1+ checklist (key terms); 3+ source (market term data).

Seed cards:
- database: Dilution scenarios (database `dilution`)
- checklist: Key terms to understand

### 08 INVESTOR TARGETS (sky; scout, orb)

Brief: Who to approach: funds and angels that invest at this stage, sector and cheque size, their recent deals and portfolio conflicts, and the warm path in. Public information only; no private contact details. Rank by fit. Investors in mind: {{investors|none given}}.

Target: 1+ database (Investor targets, at least 25 rows); 5+ entity (the top investors, kind org); 1+ chart (targets by status).

Seed cards:
- database: Investor targets (database `targets`)
- chart: Investor targets by status (database `targets`)
- question: Who has led a round like this in the last 18 months, and who do we know that knows them?

### 09 DECK & DATA ROOM (rho; builder, orb)

Brief: What investors will ask to see: the pitch deck outline, a one-page summary and the data room with its standard documents. Each item is ready, missing or inconsistent with another; the deck must match the model and the KPIs.

Target: 2+ checklist (deck outline and data room); 1+ design (a one-page summary).

Seed cards:
- checklist: Deck outline
- checklist: Data room

### 10 HARD QUESTIONS (paper; critic, orb)

Brief: Work through the red-flag checklist the way an investor would: raise each flag as a Risk card with evidence or clear it with a source. Then the hard questions investors will ask, each with the card that answers it, ranked.

Target: 6+ risk (every checklist item cleared with a source or raised); 10+ question (the questions investors will ask).

Seed cards:
- checklist: Red-flag checklist
- risk: Traction risk
- risk: Market risk
- risk: Valuation risk
- risk: Team risk
- risk: Legal and cap table risk

### 11 PROCESS & DECISION (signal; orb)

Brief: The plan for the raise: when to start, how to run a tight process, the weekly milestones, and whether to raise now, wait, bridge or look at another form of financing. Score the company's readiness against the rubric with cited evidence.

Target: 1+ decision; 1+ matrix (the filled readiness rubric); 1+ timeline (raise process); 3+ insight.

Seed cards:
- timeline: Raise process
- decision: Should {{company}} raise now?
- matrix: Investor readiness (rubric score x 2, so 10 is a 5)

## Databases

### KPIs (frame `traction`)

Every traction figure with its period, whether it is claimed or verified, and its source.

| Column | Type | Notes |
|---|---|---|
| Metric | text |  |
| Value | number |  |
| Period | date | ISO date or year-month. |
| Basis | enum (Claimed, Verified) | Deck numbers are Claimed until reconciled. |
| Source | text | The file, the billing export or the bank statement. |
| Matches the deck | enum (Yes, No, Not in the deck) |  |
| Note | text |  |

Views: All (table, sorted by Period asc); Claimed vs verified (board, by Basis); Deck mismatches (table, filtered).

### Competitors (frame `market`)

Direct and indirect competitors investors will compare the company with. Discovered with find_entities and enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Category | enum (Direct, Indirect, Incumbent, Substitute) |  |
| Founded | number |  |
| Total funding | currency | US dollars. |
| Last round | text |  |
| Headcount | number |  |
| How we win | text |  |
| Threat level | rating | 1 (low) to 5 (high). |
| Source | url |  |

Views: All (table, sorted by Total funding desc); By category (board, by Category).

### Comparable rounds (frame `comps`)

Recent rounds of comparable companies, to set the valuation range. Discovered with find_entities and enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Company | text |  |
| Round | text |  |
| Date | date |  |
| Amount | currency |  |
| Valuation | currency | Post-money, US dollars. |
| Revenue at the round | currency |  |
| Revenue multiple | number |  |
| Lead investors | text |  |
| Why comparable | text |  |
| Source | url |  |

Views: By date (table, sorted by Date desc); By multiple (table, sorted by Revenue multiple desc).

### Use of funds (frame `plan`)

Where the raise goes, with the milestone each line buys.

| Column | Type | Notes |
|---|---|---|
| Category | text | Engineering, sales, marketing, operations, runway buffer. |
| Amount | currency |  |
| Share of the raise (%) | number |  |
| Hires or spend | text |  |
| Milestone it buys | text |  |
| By when | date |  |

Views: All (table, sorted by Amount desc).

### Runway scenarios (frame `plan`)

Runway and the milestone reached under each scenario; every assumption is written in the row.

| Column | Type | Notes |
|---|---|---|
| Scenario | enum (Base, Upside, Downside) |  |
| Cash after the raise | currency |  |
| Net monthly burn | currency |  |
| Runway (months) | number |  |
| Revenue growth assumed (%) | number |  |
| Milestone reached | text |  |
| Assumption | text |  |

Views: All (table).

### Dilution scenarios (frame `terms`)

What the founders keep at different raise sizes and valuations.

| Column | Type | Notes |
|---|---|---|
| Scenario | text |  |
| Raise | currency |  |
| Pre-money valuation | currency |  |
| Post-money valuation | currency |  |
| Dilution (%) | number |  |
| Option pool added (%) | number |  |
| Founders own after (%) | number |  |
| Instrument | enum (Priced round, SAFE, Convertible note) |  |

Views: By dilution (table, sorted by Dilution (%) asc).

### Investor targets (frame `investors`)

Funds and angels that fit the stage, sector and cheque, ranked. Public information only. Discovered with find_entities and enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Investor | text |  |
| Type | enum (Seed fund, Venture fund, Angel, Corporate, Accelerator) |  |
| Stage fit | rating | 1 to 5. |
| Sector fit | rating | 1 to 5. |
| Typical cheque (USD) | currency |  |
| Recent relevant deals | text |  |
| Portfolio conflict | text |  |
| Warm path | text | Who can introduce; no private contact details. |
| Status | enum (Researching, Intro asked, Meeting set, In diligence, Passed, Term sheet) |  |
| Source | url |  |

Views: By fit (table, sorted by Stage fit desc); Pipeline (board, by Status); Strong fit (table, filtered).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first: the deck, the financial model, the cap table, KPI exports and data-room files (board_map, read_card, read_source, query_dataset). Put every deck number into the KPIs database (upsert_rows) with Basis "Claimed", and every number you can tie to a dropped export or the model with Basis "Verified" and the file as Source. Note any deck number that does not match the model in Matches the deck. Hand the company, the round and the investors in mind to Scout in the delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (market, comparable rounds, investor targets), Builder once KPIs has rows, Critic once Scout has sources to review. Name the frames each agent owns, and hand over the intake facts (names, links, concerns) in the instruction. Tools: `delegate`, `message_agent`.
3. Fill the raise-plan metrics from the intake and the model (update_card): target raise, valuation in mind, cash and burn, runway. Write the use of funds (upsert_rows, key Category) so it adds up to the raise and each line names its milestone. Tools: `query_dataset`, `update_card`, `upsert_rows`, `query_board`.
4. Write the narrative and the one-liner from the evidence (update_card): problem, insight, why now, why us. Link the evidence for and against each of the three hypotheses (add_link supports or contradicts) and set their confidence. Never state a figure the board does not support. Tools: `query_board`, `search_board`, `read_card`, `update_card`, `add_link`, `place_card`.
5. Compute the median and range of the Comparable rounds (query_dataset), the implied multiple and three dilution scenarios (Dilution scenarios rows, upsert_rows); update the valuation metrics. Mark the range as a negotiating range, not advice. Tools: `query_dataset`, `upsert_rows`, `update_card`.
6. For a gap Scout could not close (a market size, comparable rounds in a niche), run deep_research (core) on that one question. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
7. Fill the Investor readiness matrix: one 1-to-5 score per rubric dimension (doubled), each with a cited card. Then the SWOT, the Decision with the weighted total in the rationale, the Raise process timeline (dated milestones), and the hard questions each with the card that answers it. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
8. Write the memo with compose_section, section by section in the order of the memo outline, then the one-page summary. On the Quick tier write the summary only. When the user asks for slides, compose_slides with the deck outline. Tools: `compose_section`, `compose_slides`.
9. Only when the user asks to keep watching: watch_topic with the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. The company's own site and public record first (fetch_url, capture_page): what is claimed publicly about the product, customers and team, so the deck can be checked against it. Source cards for what matters. Tools: `fetch_url`, `parallel_extract`, `capture_page`, `place_card`.
2. Competitors: those the user named, then find_entities and batch_enrich (founded, funding, last round, headcount) for the rest of the funded field; consolidate into Competitors (upsert_rows, key Name) with a Source url. Crunchbase or PitchBook only via fetch_signed_in, and only if the user ticked them. Quick scan: find_entities and batch_enrich are refused; read the named ones. Tools: `find_entities`, `batch_enrich`, `fetch_signed_in`, `web_search`, `upsert_rows`, `query_dataset`.
3. Market sizing: at least one independent report; every TAM, SAM, SOM and growth figure is a metric card with its source and method; build the bottom-up size from the customer count and price and say so. Tools: `web_search`, `fetch_url`, `parallel_extract`, `web_answer`, `place_card`.
4. Comparable rounds: find_entities for companies of the same stage, sector and region that raised in the last 24 months; batch_enrich amount, valuation, revenue at the round, lead investors; consolidate into Comparable rounds (upsert_rows, key Company) with a Source url and Why comparable. Quick scan: find_entities is refused; add rows from press search. Tools: `find_entities`, `batch_enrich`, `fetch_signed_in`, `web_search`, `upsert_rows`, `query_dataset`.
5. Investor targets: find_entities for funds and angels that led or joined rounds like this in the last 18 months; batch_enrich the type, typical cheque, recent deals and portfolio conflicts; consolidate into Investor targets (upsert_rows, key Investor) with fit scores and a Source url. Public information only: no private contact details, no personal emails or phone numbers. An entity card for the top five. *(from the standard tier)* Tools: `find_entities`, `batch_enrich`, `fetch_signed_in`, `web_search`, `place_card`, `upsert_rows`.
6. Terms: current market terms for the round (SAFE caps, option pools, preferences) from reputable public sources, as Source cards; the key-terms checklist items each cite one. Say clearly this is general information, not legal advice. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`.
7. Deep research for the gaps that remain: deep_research (core or above, per the tier), for example the valuation range in a niche. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Reconcile: read the KPIs database against the deck and the model (query_dataset, read_card). For every number with one source, or a deck number marked as not matching, link it "tension" to the card that disagrees or place a Question for the founder naming the document that would prove it. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Write the hard questions investors will ask as Question cards, ranked by how much they would hurt (traction quality, market size, competition, valuation, team, legal), each linked to the gap, risk or number that prompted it. You cannot tick the checklist; the user does. Tools: `place_card`, `add_link`, `query_board`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. Charts bound to the databases: KPIs over time (line, KPIs), total funding by competitor (bar, Competitors), valuation by comparable (bar, Comparable rounds), use of funds by category (pie, Use of funds). Tools: `place_card`, `query_dataset`.
2. The positioning 2x2 (framework, quadrant) and the SWOT from the competitor and traction cards only. Tools: `place_card`, `query_board`, `read_card`, `query_dataset`.
3. Runway scenarios: Base, Upside and Downside rows (upsert_rows, key Scenario) with cash after the raise, burn, runway and milestone from the model and the stated assumption; no figure without an input on the board. Tools: `upsert_rows`, `query_dataset`, `read_card`, `place_card`.
4. Deck and data room: a one-page summary as a design frame (write_design_frame) from cards only (snapshot, traction, ask, use of funds). Propose checklist items for what is missing from the data room (place a Checklist card; the user ticks). *(from the standard tier)* Tools: `write_design_frame`, `place_card`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. A number in the deck does not match the model or the data. *How:* Compare every deck figure with the KPIs database and the financial model; a mismatch is raised.
2. Traction is claimed but not backed by bank, billing or analytics data. *How:* Check the KPIs database Basis column; claimed-only numbers are raised.
3. The market is sized top-down only. *How:* Check the Market frame for a bottom-up build with its assumptions.
4. Runway at the start of the raise is under six months. *How:* Compute runway from cash and burn in the Runway scenarios; under six months weakens the negotiating position and is raised.
5. The valuation ask is above comparable rounds with no justification. *How:* Compare the implied multiple with the Comparable rounds database; raise when above the 75th percentile without a stated reason.
6. The use of funds does not tie to milestones or runway. *How:* Check that each Use of funds row has a milestone and that the months of runway add up.
7. No competitors are named, or only the weak ones. *How:* Compare the competitor list with what investors will find: funded rivals and incumbents.
8. A cap table problem: heavy dilution, dead equity or unusual terms. *How:* If a cap table was dropped, read it (query_dataset): founder share, option pool, SAFEs and notes, preferences. Otherwise mark "no cap table provided".
9. The investor list is long but none is a fit for the stage, sector and cheque. *How:* Check Investor targets for rows with Stage fit and Sector fit both high; fewer than five is raised.
10. IP, contractor or employee agreements are missing from the data room. *How:* Check the Data room checklist for IP assignment, founder vesting and contractor agreements.
11. Customer concentration, or a single key customer, is not disclosed. *How:* Look in the KPIs and the materials for revenue by customer; undisclosed concentration is raised.
12. Metrics are stale: older than the last full month. *How:* Check the Period of each KPIs row; stale rows are marked and a Question asks for a refresh.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Narrative | 15% | A list of features with no why-now. | A clear problem, product and market. | A story investors repeat: insight, why now, why us. | story |
| Traction proof | 25% | Claims with no data. | Real numbers from the company's own records. | Numbers reconciled to bank or billing data, with cohorts. | traction |
| Market and competition | 15% | Top-down TAM and no competitors named. | Sized both ways; competitors mapped. | A bottom-up size and an honest map of where we win. | market |
| Financial plan | 15% | No model, or one that does not tie to the ask. | A model with the use of funds and runway. | Scenarios, milestones per tranche, and a runway buffer. | plan |
| Valuation realism | 15% | Far above comparable rounds with no reason. | Within the comparable range. | Justified by comparable rounds and a clear growth case. | comps |
| Data room readiness | 15% | Documents scattered or missing. | Most of the standard documents ready. | A complete, indexed data room that matches the deck. | room |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Fundraising readiness: {{company}}. Every paragraph cites cards; every number cites its source and says Claimed or Verified; valuations are a range with its basis; terms are general information, not legal advice.

1. Summary & recommendation (at most 150 words): Whether to raise now, the readiness score, the three strengths and the three gaps to fix, in at most 150 words.
2. The round: The amount, valuation, timeline, runway and what the money buys.
3. Narrative: The story in investor order: problem, insight, why now, why us.
4. Traction and metrics: The KPI table: claimed against verified, with reconciliation to the deck.
5. Market and competition: The market sized both ways and the competitor map with the funded rivals.
6. Comparable rounds and valuation: The comparable rounds, the median and range, and the defensible valuation range.
7. Financial plan and use of funds: The use of funds with milestones and the runway scenarios.
8. Dilution and terms: Founder ownership under each scenario and the key terms to expect.
9. Investor targets: The ranked targets, the fit and the warm paths.
10. Deck and data room: What is ready, missing and inconsistent.
11. Hard questions and red flags: The red-flag outcomes and the ranked questions with their answers.
12. Readiness scorecard and plan: The rubric table and the dated raise process.

Appendix: All sources.

One-page summary: The round, Readiness score, Top gaps, Timeline.

Deck format: `standard`.

Deck: {{company}}: pitch deck. Slides, in order:

1. Title and one-liner: The company, the one-liner and the round.
2. Problem: Who has it, how often and what it costs, with a quote.
3. Solution and product: What the product does and a screenshot.
4. Why now: The shift that makes this possible today.
5. Market: TAM, SAM and SOM with the bottom-up build.
6. Business model: How the company makes money and the unit economics.
7. Traction: The verified KPIs and the growth chart.
8. Competition: The 2x2 and why the company wins.
9. Go-to-market: The motion, the channels and the early results.
10. Team: The founders and key hires, with proof of fit.
11. Financials and use of funds: The use of funds chart, runway and milestones.
12. The ask: The amount, the terms in mind and what the round delivers.

## Follow-up chips

Shown after the first pass.

- Rehearse the hard questions: Run me through the ten hardest investor questions about {{company}} one at a time, with the best answer from the board for each.
- Refresh with the new month: I added this month's numbers. Update KPIs and the runway, and tell me what changes in the readiness score.
- Draft the outreach email: Draft a short intro email to [investor] for {{company}} from the one-liner and the traction, with no claim the board cannot support.
- Tighten the valuation case: Build the strongest honest case for our valuation range from the comparable rounds, and the counter-arguments an investor will make.
- Compare the investors: Compare [investor] and [investor] for {{company}}: fit, recent deals, conflicts and the warm path.
- Watch the funding news: Start a monitor on rounds in our space and on our target investors' new deals.

## Signed-in sources

- Crunchbase (crunchbase.com): Comparable rounds, competitors' funding and investor portfolios.
- PitchBook (pitchbook.com): Round valuations and investor deal history.
- LinkedIn (linkedin.com): Public investor profiles and the shared connections the user already has.

## Monitor

Only when the user asks: `{{sector|our sector}} funding rounds, valuations and new deals by target investors`. A round or a deal that moves the valuation range or the investor list.
