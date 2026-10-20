# M&A screening

<!-- Generated from packages/shared/src/templates/ma-screen.ts by `pnpm templates:docs`. Do not edit by hand. -->

Screen acquisition targets for the acquirer: eleven numbered frames (mandate, universe, screening matrix, profiles, financials, valuation, synergies, feasibility, risks, ranking, approach) built on a Target universe database that Parallel discovers and enriches, a screen against the criteria, precedent-deal valuation, red-flag checks and a weighted ranking. Mark every estimate, cite every number and end with a ranked shortlist and a recommended approach for each.

Template id `ma-screen`. Canvas title: `{{acquirer}}: M&A target screen`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Acquirer (your company or client) (`acquirer`) | text | yes | placeholder "Acme Software" |
| Acquirer website (`website`) | url | no | placeholder "https://acme.com" |
| Acquisition rationale (`strategy`) | select | no | one of Product or technology tuck-in, New geography, New customers or distribution, Vertical consolidation, Talent and capability, Platform add-on (roll-up), Diversification |
| Target sector / category (`sector`) | text | no | placeholder "Warehouse robotics software" |
| Target size range (`size_range`) | text | no | placeholder "$5M to $50M revenue, or EV up to $300M" |
| Budget or valuation ceiling (`budget`) | text | no | placeholder "$250M enterprise value" |
| Target geography (`geography`) | text | no | placeholder "North America and UK" |
| Must-have criteria (`criteria`) | longtext | no | placeholder "One per line: recurring revenue above 80%, 50+ engineers, SOC 2…" |
| Deal-breakers (`dealbreakers`) | longtext | no | placeholder "One per line: customer concentration, an existing competitor to us…" |
| Known targets (`known_targets`) | list | no | placeholder "Comma separated". Optional. Scout finds more. |
| Companies to exclude (`excluded`) | list | no | placeholder "Comma separated". Already approached, conflicts, competitors. |
| Materials (`materials`) | materials | no | Drop the acquisition strategy, criteria, a target list (CSV or XLSX), a banker book or a prior screen. A target list becomes rows in the Target universe. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites PitchBook, Crunchbase, LinkedIn, S&P Capital IQ. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** No deep research and no entity discovery: search and extract only, a hand-built universe of up to 12 companies, at most 12 cards per frame, and the memo is the summary only.
- **Standard:** Quick, plus FindAll discovery and batch enrichment of the Target universe and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on ownership and revenue estimates, FindAll extension for full coverage and the full report.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 MANDATE & CRITERIA (signal; orb)

Brief: What {{acquirer}} wants to buy and why: the rationale, the sector, the size range and budget, the geography, the must-have criteria and the deal-breakers. Turn the intake into screening criteria that can be checked row by row, and say what is assumed.

Target: 1+ doc (the mandate); 1+ checklist (screening criteria); 4+ metric.

Seed cards:
- doc: Mandate
- checklist: Screening criteria
- metric: Targets screened
- metric: Shortlisted
- metric: Median EV / revenue
- metric: Deal size range
- question: What does success look like in 12 months after closing?

### 02 TARGET UNIVERSE (sky; scout, builder)

Brief: Every company that could fit: discovered with find_entities from the mandate and enriched with batch_enrich (HQ, founded, headcount, funding, ownership, revenue estimate, what they sell). One row per company, a Source on every row, excluded companies marked, and a screening status (Screened, Shortlisted, Rejected) with the reason for a rejection.

Target: 1+ database (Target universe, at least 30 rows on Standard); 1+ chart (targets by ownership type); 4+ source.

Seed cards:
- database: Target universe (database `universe`)
- chart: Targets by ownership (database `universe`)

### 03 SCREENING MATRIX (rho; builder, scout, critic)

Brief: The screen: each candidate scored against the weighted criteria, the ones that fail a must-have or hit a deal-breaker dropped with a reason, and a fit-against-feasibility 2x2 of the survivors.

Target: 1+ matrix (weighted screen of the top candidates); 1+ framework (the 2x2); 1+ chart.

Seed cards:
- matrix: Screening matrix
- framework: Fit vs feasibility

### 04 TARGET PROFILES (sky; scout, builder)

Brief: A profile of each shortlisted target: what it sells and to whom, the product and technology, the team and founders, customers and traction, funding history and investors, and how it would sit inside {{acquirer}}. One entity card per shortlisted target with screenshots of its product and pricing pages.

Target: 3+ entity (one per shortlisted target); 3+ image (product or pricing page captures); 1+ diagram (how a target fits the acquirer); 6+ source.

Seed cards:
- question: Which target would we regret losing to a competitor?

### 05 FINANCIAL PROFILE (rho; scout, orb)

Brief: Revenue, growth, margins, profitability, funding raised, burn and employees for each shortlisted target, from filings where public and from estimates where private. Every private figure is marked Estimated with its method.

Target: 1+ database (Target financials); 1+ chart (revenue and growth by target); 2+ metric.

Seed cards:
- database: Target financials (database `financials`)
- chart: Revenue by target (database `financials`)
- metric: Median growth
- metric: Median gross margin

### 06 VALUATION & COMPS (sky; scout, orb, builder)

Brief: What each target might cost: precedent transactions in the sector (EV, multiples, rationale), trading comps of listed peers, the last round valuation of each private target, an implied EV range with a premium, and whether it fits the budget.

Target: 2+ database (Precedent transactions and Trading comps); 1+ chart (a football field of valuation ranges); 2+ metric.

Seed cards:
- database: Precedent transactions (database `precedents`)
- database: Trading comps (database `comps`)
- metric: Implied EV (median)
- metric: Premium assumed
- chart: Multiples of precedent deals (database `precedents`)

### 07 SYNERGIES & INTEGRATION (rho; orb, scout, critic)

Brief: Where value would come from: revenue synergies (cross-sell, new markets), cost synergies (overlap, platform), technology and talent, each with an estimated value, the evidence, the confidence and the cost and time to achieve it. Integration risks and the first 100 days.

Target: 1+ database (Synergies); 1+ framework (pros and cons); 1+ timeline (integration plan).

Seed cards:
- database: Synergies (database `synergies`)
- framework: Doing this deal: pros and cons
- timeline: Integration timeline
- question: Which synergies would we still believe if we were wrong by half?

### 08 OWNERSHIP & FEASIBILITY (sky; scout, critic)

Brief: Who owns each target and whether a deal is possible: founders, investors and their rights and incentives, the likely stance of each, change-of-control and preference terms, regulatory or antitrust review, competing bidders and whether the target is in a process.

Target: 1+ database (Stakeholders); 2+ risk; 3+ source.

Seed cards:
- database: Stakeholders (database `stakeholders`)
- question: Is any target already in a process, or about to raise?

### 09 RISKS & RED FLAGS (paper; critic)

Brief: Work through the red-flag checklist for each shortlisted target: raise each flag as a Risk card with evidence, or clear it with a source. Also covers integration, retention, regulatory, technology and valuation risk.

Target: 6+ risk (every checklist item cleared with a source or raised, per shortlisted target).

Seed cards:
- checklist: Red-flag checklist
- risk: Financial risk
- risk: Technology risk
- risk: People risk
- risk: Legal/Regulatory risk
- risk: Integration risk
- risk: Valuation risk

### 10 RANKING & RECOMMENDATION (signal; orb)

Brief: The ranked shortlist: scored against the rubric with cited evidence, the thesis for each top target, the bull and bear view, and a recommendation (Pursue, Approach, Monitor, Drop) with the proposed order of approach.

Target: 1+ matrix (the filled rubric); 1+ decision; 3+ hypothesis (with evidence links); 1+ framework (SWOT).

Seed cards:
- hypothesis: The top target is the best fit for {{acquirer}}
- hypothesis: The universe has at least three credible targets
- hypothesis: The price fits the budget
- framework: SWOT: the acquisition programme
- decision: Recommendation for {{acquirer}}
- matrix: Target scorecard (rubric score x 2, so 10 is a 5)

### 11 APPROACH & NEXT STEPS (paper; critic, orb)

Brief: How to approach each target: the angle, the person to contact, the introduction route, the opening message and the questions for the first conversation, each linked to the gap or risk that prompted it. Every unresolved question card on the board is collected here.

Target: 1+ checklist (at least 10 ranked questions and approach steps, each linked to its source card).

Seed cards:
- checklist: Approach plan and questions

## Databases

### Target universe (frame `universe`)

Every candidate and its screening status. Discovered with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| What they sell | text |  |
| HQ | text |  |
| Founded | number |  |
| Headcount | number |  |
| Revenue estimate | currency | US dollars; Estimated unless filed. |
| Total funding | currency |  |
| Ownership | enum (Venture-backed, PE-owned, Founder-owned, Public, Subsidiary, Unknown) |  |
| Fit | rating | 1 (low) to 5 (high), from the screening matrix. |
| Status | enum (Screened, Shortlisted, Rejected, Excluded) |  |
| Reason | text | Why shortlisted or rejected, against the criteria. |
| Source | url |  |

Views: All (table, sorted by Fit desc); By status (board, by Status); By ownership (board, by Ownership); Shortlist (table, filtered).

### Target financials (frame `financials`)

Revenue, growth and margins of each shortlisted target, marked reported or estimated.

| Column | Type | Notes |
|---|---|---|
| Target | text |  |
| Period | text |  |
| Revenue | currency |  |
| Growth | number | Percent, year over year. |
| Gross margin | number | Percent. |
| EBITDA | currency |  |
| Employees | number |  |
| Funding raised | currency |  |
| Last valuation | currency |  |
| Basis | enum (Filed, Reported, Estimated) |  |
| Method | text | How an estimate was made. |
| Source | url |  |

Views: By revenue (table, sorted by Revenue desc); By basis (board, by Basis).

### Precedent transactions (frame `valuation`)

Comparable acquisitions with their value and multiples.

| Column | Type | Notes |
|---|---|---|
| Date | date |  |
| Acquirer | text |  |
| Target | text |  |
| EV | currency |  |
| EV / revenue | number |  |
| EV / EBITDA | number |  |
| Sector | text |  |
| Rationale | text |  |
| Source | url |  |

Views: By date (table, sorted by Date desc); By multiple (table, sorted by EV / revenue desc).

### Trading comps (frame `valuation`)

Listed peers with their current multiples (with an "as of" date).

| Column | Type | Notes |
|---|---|---|
| Company | text |  |
| Ticker | text |  |
| EV | currency |  |
| EV / revenue | number |  |
| EV / EBITDA | number |  |
| Revenue growth | number | Percent. |
| Operating margin | number | Percent. |
| As of | date |  |
| Source | url |  |

Views: By EV (table, sorted by EV desc).

### Synergies (frame `synergies`)

Each synergy with its value, evidence and confidence.

| Column | Type | Notes |
|---|---|---|
| Synergy | text |  |
| Target | text |  |
| Type | enum (Revenue, Cost, Technology, Talent, Distribution) |  |
| Annual value | currency |  |
| One-off cost | currency |  |
| Months to achieve | number |  |
| Confidence | enum (Low, Medium, High) |  |
| Evidence | text |  |
| Source | url |  |

Views: By value (table, sorted by Annual value desc); By type (board, by Type).

### Stakeholders (frame `feasibility`)

The owners, investors and decision makers of each shortlisted target.

| Column | Type | Notes |
|---|---|---|
| Name | person |  |
| Target | text |  |
| Role | text |  |
| Holder type | enum (Founder, Executive, Venture investor, PE sponsor, Corporate parent, Employee pool, Other) |  |
| Stake | number | Percent, if known. |
| Likely stance | enum (Supportive, Neutral, Resistant, Unknown) |  |
| Rights or terms | text | Preferences, ROFR, change of control, board seats. |
| LinkedIn | url |  |
| Source | url |  |

Views: All (table); By stance (board, by Likely stance).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first (read_card, read_source, query_dataset): the strategy, the criteria and any target list. A target list becomes Target universe rows (upsert_rows, Status Screened). Turn the intake into the Mandate doc and the Screening criteria checklist (update_card), and say what you assumed. Hand the criteria, the size range, the excluded companies and the known targets to Scout in its delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`, `update_card`.
2. Delegate with delegate: Scout first (discovery, enrichment, financials, comps, stakeholders), Builder once the Target universe has rows, Critic once Scout has placed its first sources. Name the frames each agent owns. Tools: `delegate`, `message_agent`.
3. After Scout's first pass, apply the screen: for each Target universe row decide Shortlisted or Rejected against the criteria and the deal-breakers (add a new row with Status and a Reason; a row an agent wrote can only be changed by that agent). Never reject without a reason. Fill the four mandate metrics (update_card). Tools: `query_board`, `query_dataset`, `upsert_rows`, `update_card`, `search_board`.
4. Value the shortlist: from Target financials, Precedent transactions and Trading comps (query_dataset) compute an implied EV range per target (multiple times revenue plus the control premium), compare it with the budget and fill the Implied EV and Premium metrics. State the sample sizes. Tools: `query_dataset`, `update_card`, `read_card`, `place_card`.
5. Write the synergies for the top targets into Synergies (upsert_rows, key Synergy) with value, one-off cost, months and confidence, each citing the evidence, and the first-100-days milestones on the integration timeline. Tools: `query_board`, `upsert_rows`, `place_card`, `read_card`.
6. For a gap Scout could not close (a target revenue estimate, an ownership question), run deep_research (core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
7. At the end, fill the Target scorecard: for the top three targets, one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card. Then the three hypotheses (evidence for and against as card ids), the SWOT and the Decision card: your proposed option, the ranked shortlist and the weighted totals in its rationale. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
8. Write the screening report with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. Tools: `compose_section`.
9. Keep the approach plan current: collect every unresolved Question card into the "Approach plan and questions" checklist, ranked, each linked to its source card. Tools: `search_board`, `update_card`, `add_link`.
10. Only when the user asks to keep watching the shortlist: watch_topic for each named target (funding, sale process, leadership changes). Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. Start from the known targets in the intake: add them to Target universe (upsert_rows, key Name, Status Screened) with a Source url on every row, skipping the excluded companies. Read two or three independent overviews of the sector to learn its vocabulary and its acquirers. Tools: `web_search`, `fetch_url`, `parallel_extract`, `upsert_rows`, `place_card`.
2. Discovery: find_entities with the mandate (sector, size, geography, must-haves) as the objective; the match limit follows the depth tier. It fills its own database card in this frame. On the Quick scan tier find_entities is refused: add up to 12 names from web_search with upsert_rows instead. Tools: `find_entities`, `find_entities_extend`, `web_search`, `upsert_rows`.
3. Enrichment: batch_enrich fills the Target universe columns (what they sell, HQ, founded, headcount, revenue estimate, funding, ownership) with an output schema of those fields. Then read each run database with query_dataset and upsert the rows into Target universe (upsert_rows, key Name) so there is one table. Skip the excluded companies. Tools: `batch_enrich`, `query_dataset`, `upsert_rows`.
4. Profiles: for the shortlisted targets (Status Shortlisted in Target universe) one entity card each, a capture_page of its home and pricing pages, and the team, customers and traction as source cards. Signed-in sources (fetch_signed_in) only when the user ticked them. Tools: `fetch_signed_in`, `fetch_url`, `capture_page`, `place_card`, `web_search`.
5. Financial profile: filed numbers where the target is public or files accounts, reported numbers from press and its own pages, estimates (headcount times revenue per head, funding, traffic) otherwise. One Target financials row per target (upsert_rows, key Target) with Basis and, for an estimate, the Method. Tools: `fetch_url`, `parallel_extract`, `web_search`, `upsert_rows`.
6. Valuation inputs: precedent transactions in the sector (date, acquirer, target, EV, multiples, rationale) into Precedent transactions, listed peers into Trading comps (upsert_rows) with an "as of" date and a Source on every row. PitchBook or Capital IQ when connected (fetch_signed_in). Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `upsert_rows`.
7. Ownership and feasibility: founders, investors and their stakes and rights into Stakeholders (upsert_rows, key Name), signs of a sale process, a recent round or a competing bidder, and the regulatory review the combination would face. Evidence for synergies too: overlapping customers, shared stack, cross-sell proof and what the target already does that the acquirer pays for elsewhere, as source cards for orb to value. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `upsert_rows`, `place_card`.
8. A red-flag sweep for each shortlisted target: litigation, regulator actions, security incidents, departures and layoffs, so Critic has sources to clear or raise each flag. Tools: `web_search`, `fetch_url`, `place_card`.
9. Deep research for the gaps that remain (a target revenue estimate, an ownership structure): deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) and query Target universe and Target financials (query_dataset) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`, `query_dataset`.
2. Work through the red-flag checklist for each shortlisted target, one flag at a time. For each: place a Risk card titled "RFxx raised (Target): ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared (Target): ..." that cites the source card(s) that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card in Approach & next steps. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge every Estimated figure and every rejection: a revenue estimate on one source, a rejection with a thin Reason, or a target dropped for a criterion the mandate never set; and every synergy in Synergies that has no evidence or assumes more than the sources support. Link with "tension" to the card that disagrees, or place a Question. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Turn every gap into a Question card in Approach & next steps, with a link to the card or gap that prompted it. Tools: `place_card`, `add_link`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised and for which target. Tools: `report_progress`, `send_message`.

### Builder

1. The Screening matrix (weighted criteria, scores 0 to 10 from the Target universe rows and the sources, for the top candidates) and the fit-against-feasibility 2x2 (framework, quadrant) with the survivors placed. Tools: `place_card`, `query_dataset`, `read_card`.
2. Charts bound to the databases: targets by ownership (Target universe), revenue by target (Target financials), and the precedent multiples as a football field of valuation ranges (Precedent transactions). Tools: `place_card`, `query_dataset`.
3. A diagram of how each top target would sit in the acquirer: product, customers, technology and team joined to the acquirer’s own. Tools: `place_card`, `read_card`.
4. Optional one-page visual summary (a design frame): the ranked shortlist, valuation range, the budget and the top risks, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. Customer concentration: one customer or channel above 20% of revenue. *How:* Look for customer-share disclosures in the materials, press and reviews; say "not knowable" if absent.
2. Revenue quality: one-off, non-recurring or hard-to-verify revenue. *How:* Compare the revenue claims in Target financials with independent signals; flag estimates that rest on one source.
3. Key-person dependency: the founder or a few engineers are the business. *How:* Read the founder and leadership profiles and the Stakeholders database for single points of failure.
4. Litigation, regulatory action, or an IP dispute. *How:* Search court, regulator and news sources for the target and its founders; cite them.
5. Intellectual property is not clearly owned (open-source licence exposure, employee or contractor ownership). *How:* Look for licence notes, patents and trademark records; raise if the product depends on code or marks it may not own.
6. Technology debt or a platform dependency that would be costly to unwind. *How:* Read the product and stack sources; check dependence on one cloud, API or vendor.
7. Antitrust or sector-regulator review is likely. *How:* Check combined market share from the Target universe and sector rules for merger review.
8. Change-of-control terms, investor preferences or rights of first refusal that block or reprice a deal. *How:* Look for investor rights and cap-table signals in the Stakeholders database and any materials.
9. Retention risk: leadership or critical staff are likely to leave after a deal. *How:* Check hiring and departure signals, tenure and vesting where known.
10. Cultural or geographic mismatch that integration would struggle with. *How:* Compare locations, team size and operating model with the acquirer in the mandate.
11. Valuation expectations are far above precedent deals. *How:* Compare the last round valuation and any reported ask with the Precedent transactions multiples.
12. A competing bidder, or the target is already in a sale process. *How:* Search for acquisition rumours, banker mandates and recent strategic investors.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Strategic fit | 30% | Little overlap with the strategy; a distraction. | Supports the strategy in one clear way. | Directly delivers the strategic goal and is hard for anyone else to replicate. | profiles |
| Financial profile | 20% | Losing money with no path, or shrinking. | Growing with acceptable margins or a credible path to them. | Strong growth with healthy margins and cash generation. | financials |
| Valuation & affordability | 20% | Expected price is far above comparable deals or the budget. | In line with comparable deals and inside the budget. | Attractively priced against comparable deals and well inside the budget. | valuation |
| Synergy potential | 15% | Few identifiable synergies, mostly hoped for. | Clear cost or revenue synergies with evidence. | Large, evidenced synergies that pay for the premium. | synergies |
| Deal feasibility & risk | 15% | Owners unwilling, regulatory blockers or major red flags. | A plausible path to a deal with manageable risks. | Willing owners, a clean regulatory path and no major red flags. | feasibility |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: M&A screening report: {{acquirer}}. Every paragraph cites cards; every number cites its source; filed, reported and estimated figures are marked as such.

1. Summary & recommendation (at most 150 words): The recommendation, the ranked shortlist, the implied price range, the top 3 reasons and the top 3 risks, in at most 150 words.
2. Mandate & criteria: The rationale, the criteria and the deal-breakers, and what was assumed.
3. Target universe & screen: How the universe was built, how many were screened and why the rest were rejected, with the screening matrix and the 2x2.
4. Target profiles: One short profile per shortlisted target.
5. Financial profile: The financials table with reported against estimated, and the charts.
6. Valuation & comps: Precedent deals, trading comps and the implied EV range against the budget.
7. Synergies & integration: The synergy table with evidence and confidence, and the first-100-days plan.
8. Ownership & feasibility: Who owns each target, their likely stance, regulatory review and competing interest.
9. Risks & mitigants: The red-flag outcomes per target: each raised flag with its mitigant, and the cleared ones in one line.
10. Ranking & scorecard: The rubric table per target, the weighted totals and the bull and bear view.
11. Approach & next steps: The approach plan per target, the ranked questions and the proposed order.

Appendix: All sources.

One-page summary: Mandate, Ranked shortlist, Implied price range, Top risks, Recommendation.

Deck format: `ma-screen`.

## Follow-up chips

Shown after the first pass.

- Widen the search: Widen the {{acquirer}} target search: find 20 more candidates that fit the mandate, especially in [region or segment].
- Deep dive on a target: Go deeper on [target]: product, customers, team, financials, owners and how it would fit inside {{acquirer}}.
- Rerun with a new criterion: Re-screen the universe with a new criterion: [criterion]. Say which targets enter or leave the shortlist and why.
- Draft the outreach: Draft the first approach to [target]: the angle, the person to contact, the introduction route and the opening message.
- Stress-test the valuation: Stress-test the implied price of [target]: which multiples and synergies drive it and what happens at a 20% lower multiple.
- Build the case against: Build the strongest case against acquiring [target] from the cards on this board, with the evidence that would change your mind.

## Signed-in sources

- PitchBook (pitchbook.com): Private company financials, valuations, investors and precedent deals.
- Crunchbase (crunchbase.com): Funding, headcount, investors and acquisitions.
- LinkedIn (linkedin.com): Founder and executive profiles, headcount and hiring.
- S&P Capital IQ (capitaliq.com): Public comps, precedent transactions and ownership.

## Monitor

Only when the user asks: `{{acquirer}} acquisition targets: funding rounds, sale processes, leadership changes and acquisitions in {{sector|the sector}}`. News that changes which targets are available or priced out.
