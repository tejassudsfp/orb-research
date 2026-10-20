# Portfolio monitoring

<!-- Generated from packages/shared/src/templates/portfolio-monitor.ts by `pnpm templates:docs`. Do not edit by hand. -->

Monitor a portfolio company: eleven numbered frames (status, KPIs against plan, thesis check, news and signals, team, customers and product, competitors, financing and runway, risks, actions, next check-in), a status call (On track, Watch, Needs help, Write-down risk), the red-flag checklist and a portfolio update. Separate what the company reported from what outside sources show, cite every number and keep the databases so the next run starts from this one.

Template id `portfolio-monitor`. Canvas title: `{{company}}: portfolio monitoring`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Portfolio company (`company`) | text | yes | placeholder "Acme Robotics" |
| Website URL (`website`) | url | no | placeholder "https://acme.com" |
| Your holding (`holding`) | text | no | placeholder "Series A lead, 12% fully diluted, Fund II". Stake, round and fund. Optional. |
| Your involvement (`involvement`) | select | no | one of Board seat, Board observer, Information rights only, No special rights |
| Check-in cadence (`cadence`) | select | no | one of Weekly, Monthly, Quarterly, Ad hoc |
| Original investment thesis (`thesis`) | longtext | no | placeholder "Why did you invest? What had to be true?" |
| What to watch (`watch`) | list | no | placeholder "Comma separated: runway, key hire, a customer renewal…" |
| Specific concerns to probe (`concerns`) | longtext | no | placeholder "Churn, a founder dispute, a delayed launch…" |
| Known competitors (`competitors`) | list | no | placeholder "Comma separated". Optional. Scout finds more. |
| Materials (`materials`) | materials | no | Drop the latest board deck, monthly update, financials or KPI export (CSV or XLSX). KPI files become the KPI tracker; decks become cards. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites Crunchbase, LinkedIn, PitchBook, G2. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** A fast check: the company site, recent news and the KPIs you provided, search and extract only, no deep research or competitor discovery, at most 12 cards per frame, and the memo is the summary only. No monitors.
- **Standard:** Quick, plus competitor discovery and enrichment, one or two deep-research runs (core) and monitors when you ask for them, asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on customers, financing and the market, and the full portfolio update.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 STATUS & CALL (signal; orb)

Brief: Where {{company}} stands right now in one view: the status call (On track, Watch, Needs help, Write-down risk), the headline numbers (ARR, growth, cash, burn, runway, headcount) with their dates and whether the company reported them or a source verified them, and the one sentence a partner needs.

Target: 6+ metric; 1+ decision (the status call); 1+ entity; 1+ doc (the one-liner).

Seed cards:
- entity: {{company}}
- doc: Status in one line
- decision: Status call: {{company}}
- metric: ARR
- metric: Growth
- metric: Cash
- metric: Monthly burn
- metric: Runway
- metric: Headcount

### 02 KPIS AGAINST PLAN (rho; scout, orb, builder, critic)

Brief: Every tracked KPI against its plan for the last reporting periods: revenue, growth, retention, pipeline, burn, gross margin and the company-specific ones. Plan and actual side by side with the variance, each marked reported or verified. A KPI file you dropped becomes this database.

Target: 1+ database (KPI tracker with plan and actual filled); 2+ chart (plan against actual, and the trend); 1+ question.

Seed cards:
- database: KPI tracker (database `kpis`)
- chart: Actual over time (database `kpis`)
- chart: Variance to plan (database `kpis`)
- question: Which KPI is off plan, and why?

### 03 THESIS CHECK (sky; orb, critic)

Brief: Is the reason you invested still true? Restate the original thesis as hypotheses, link the new evidence for and against each, note what has changed since the investment (market, product, team, competition) and tick the milestones that were met.

Target: 3+ hypothesis (with evidence links); 1+ checklist (thesis milestones); 1+ insight (what changed).

Seed cards:
- hypothesis: Original thesis: {{company}}
- hypothesis: The company is executing to plan
- hypothesis: The market position is improving
- checklist: Thesis milestones
- question: What has changed since we invested?

### 04 NEWS & SIGNALS (rho; scout)

Brief: Everything outside the company reporting on it since the last check: news, launches, press, hiring and job posts, web traffic and app downloads, awards, partnerships, legal and regulatory items. Each is logged with its date, type and impact, and a negative or an action-needed item is escalated.

Target: 1+ database (Signal log); 1+ timeline (dated events); 4+ source.

Seed cards:
- database: Signal log (database `signals`)
- timeline: Signals timeline

### 05 TEAM & HIRING (sky; scout, critic)

Brief: Who joined, who left and who changed role since the last check, the open roles and what hiring says about strategy, leadership gaps, board changes and any sign of founder or executive strain.

Target: 1+ database (Team changes); 1+ metric (open roles); 3+ source.

Seed cards:
- database: Team changes (database `team`)
- metric: Open roles
- question: Who is missing from the leadership team?

### 06 CUSTOMERS & PRODUCT (rho; scout)

Brief: Customer proof and product momentum: named customers won and lost, case studies, reviews (positive and negative), pricing changes, releases and the roadmap, partnerships, usage and traffic signals.

Target: 1+ database (Customer signals); 4+ quote (at least 1 negative); 1+ image (a capture of the product or pricing page).

Seed cards:
- database: Customer signals (database `customers`)

### 07 COMPETITORS (sky; scout, builder, critic)

Brief: What rivals did since the last check: funding, launches, pricing, hires, wins and losses, and how the landscape compares with the investment case. Discovered with find_entities and enriched with batch_enrich on the first run, then updated each period.

Target: 1+ database (Competitor moves); 1+ framework (the 2x2); 1+ chart (funding by competitor).

Seed cards:
- database: Competitor moves (database `rivals`)
- framework: Positioning 2x2

### 08 FINANCING & RUNWAY (rho; scout, orb, builder)

Brief: Cash, burn and runway, the last round and its valuation, the plan for the next round, signals of the next round (investor activity, bridge or extension news), market multiples for comparable companies and the likely outcome (up, flat or down round).

Target: 1+ database (Financing events); 2+ metric (runway and last valuation); 1+ framework (next-round readiness).

Seed cards:
- database: Financing events (database `financing`)
- metric: Last valuation
- metric: Months to next round
- framework: Next-round readiness

### 09 RISKS & RED FLAGS (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Also covers key-person, customer-concentration, runway, product and legal risk.

Target: 6+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Red-flag checklist
- risk: Runway risk
- risk: Team risk
- risk: Customers risk
- risk: Product risk
- risk: Competition risk
- risk: Legal/Regulatory risk

### 10 HEALTH SCORE & ACTIONS (signal; orb)

Brief: The scored health of the company against the rubric, the actions this check produces (intros, hires, board asks, follow-ups) with an owner and a due date, and the asks to the founders.

Target: 1+ matrix (the filled rubric); 1+ database (Action items); 1+ framework (SWOT).

Seed cards:
- matrix: Health scorecard (rubric score x 2, so 10 is a 5)
- database: Action items (database `actions`)

### 11 NEXT CHECK-IN (paper; critic, orb)

Brief: What to ask the founders and what to look at next time: questions ranked by importance, each linked to the signal or gap that prompted it. Every unresolved question card on the board is collected here.

Target: 1+ checklist (at least 8 ranked questions, each linked to its source card).

Seed cards:
- checklist: Questions for the next check-in

## Databases

### KPI tracker (frame `kpis`)

One row per KPI per period, with the plan, the actual and the variance. History stays across check-ins.

| Column | Type | Notes |
|---|---|---|
| Metric | text |  |
| Period | text | ISO month or quarter, e.g. 2026-09 or 2026-Q3. |
| Plan | number |  |
| Actual | number |  |
| Variance | number | Percent: (actual - plan) / plan. |
| Basis | enum (Reported, Verified, Estimated) | Company numbers are Reported. |
| Source | url |  |
| Note | text |  |

Views: By period (table, sorted by Period desc); By basis (board, by Basis); Off plan (table, filtered).

### Signal log (frame `signals`)

Every outside signal about the company, with its type, impact and whether it needs action.

| Column | Type | Notes |
|---|---|---|
| Date | date |  |
| Type | enum (News, Product, Customer, Hiring, Funding, Executive, Legal, Security, Competitor, Traffic, Other) |  |
| Headline | text |  |
| Impact | enum (Positive, Neutral, Negative) |  |
| Action needed | boolean |  |
| Source | url |  |
| Note | text |  |

Views: By date (table, sorted by Date desc); By impact (board, by Impact); Needs action (table, filtered).

### Team changes (frame `team`)

Joiners, leavers and role changes since monitoring started.

| Column | Type | Notes |
|---|---|---|
| Name | person |  |
| Role | text |  |
| Change | enum (Joined, Left, Promoted, Role change, Board change) |  |
| Date | date |  |
| Background | text |  |
| LinkedIn | url |  |
| Source | url |  |
| Flags | text | Key departure, short tenure, replaced by. |

Views: By date (table, sorted by Date desc); By change (board, by Change).

### Customer signals (frame `customers`)

Named customers, wins, losses and the proof behind each.

| Column | Type | Notes |
|---|---|---|
| Customer | text |  |
| Segment | text |  |
| Event | enum (Won, Expanded, Renewed, Downsized, Lost, Case study, Review) |  |
| Date | date |  |
| Size | text | Employees or contract band. |
| Source | url |  |
| Quote | text |  |

Views: By date (table, sorted by Date desc); By event (board, by Event).

### Competitor moves (frame `competitors`)

Competitors and what each did lately. Discovered with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Category | enum (Direct, Indirect, Incumbent, Substitute) |  |
| Total funding | currency | US dollars. |
| Last round | text |  |
| Headcount | number |  |
| Latest move | text |  |
| Latest move date | date |  |
| Threat level | rating | 1 (low) to 5 (high). |
| Source | url |  |

Views: All (table, sorted by Threat level desc); By category (board, by Category).

### Financing events (frame `financing`)

Every round and financing event, and the cash position over time.

| Column | Type | Notes |
|---|---|---|
| Event | text | Round name, bridge, venture debt, or "Cash update". |
| Date | date |  |
| Amount | currency |  |
| Post-money valuation | currency |  |
| Lead | text |  |
| Cash after | currency |  |
| Basis | enum (Reported, Verified, Estimated) |  |
| Source | url |  |

Views: By date (table, sorted by Date asc).

### Action items (frame `actions`)

What follows from this check: asks, intros and follow-ups.

| Column | Type | Notes |
|---|---|---|
| Action | text |  |
| Owner | person |  |
| Due | date |  |
| Status | enum (Open, In progress, Done, Dropped) |  |
| Priority | enum (High, Medium, Low) |  |
| Why | text | The signal or KPI that prompted it. |

Views: Open first (table, sorted by Due asc); By status (board, by Status).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first: the board deck, the monthly update, financials and KPI exports (read_card and read_source for files, query_dataset for databases). Put every reported KPI into the KPI tracker (upsert_rows) with Basis "Reported", and the cash balance into Financing events. Hand the competitors, the watch list and the ticked signed-in sources from the intake to Scout in its delegate instruction. A row an agent wrote can only be changed by that agent: when a reported number is verified, add a new row with Basis "Verified". Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (signals, team, customers, competitors, financing), Builder once the KPI tracker has rows, Critic once Scout has placed its first sources. Name the frames each agent owns. Tools: `delegate`, `message_agent`.
3. After Scout's first pass, fill the six Status metrics (update_card) and the one-line status, each with a cited figure and its date, marked reported or verified. Never write a figure you cannot source. Tools: `query_board`, `search_board`, `query_dataset`, `update_card`.
4. Compute the Variance column from Plan and Actual for each KPI (query_dataset, then a new row with the variance filled when you wrote the rows) and note the KPIs that are off plan in the "Which KPI is off plan" question. Tools: `query_dataset`, `upsert_rows`, `update_card`.
5. Thesis check: restate the original thesis as the three hypotheses, link the evidence for and against (add_link) and write what changed since the investment as one insight that cites at least two cards. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
6. For a gap Scout could not close (a customer count, a round rumour), run deep_research (core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
7. At the end, fill the Health scorecard: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card. Then propose the Status call (your proposed option and the weighted total in its rationale) and write the action items (upsert_rows, key Action): owner, due date and the signal that prompted each. Tools: `query_board`, `read_card`, `update_card`, `upsert_rows`, `place_card`, `add_link`.
8. Write the portfolio update with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. Tools: `compose_section`.
9. Keep the check-in questions current: collect every unresolved Question card into the "Questions for the next check-in" checklist, ranked, each linked to its source card. Tools: `search_board`, `update_card`, `add_link`.
10. This template is meant to be run again: when the user wants the company watched between check-ins, offer watch_topic for the company (news, funding, layoffs, lawsuits, launches) and one for each competitor they name. Monitors cost money on every check, so each is confirmed by the user; list_watches before adding one, and stop_watch when the user asks. New events arrive in watch_events: log them in the Signal log. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `watch_events`, `stop_watch`.

### Scout

1. The company site: news, blog, careers, pricing and changelog pages (fetch_url). Take capture_page screenshots of the home and pricing pages as image cards in Customers & product. Log what changed since the last check in the Signal log (upsert_rows, key Headline) and any claimed KPI as a KPI tracker row with Basis "Reported". Tools: `fetch_url`, `parallel_extract`, `capture_page`, `place_card`, `upsert_rows`.
2. News and signals: press, launches, awards, partnerships, legal and regulatory items and security incidents since the last check (web_search, fetch_url, web_answer for quick checks). One Signal log row each with Type, Impact and a Source; dated events on the timeline; set Action needed for a negative or time-sensitive item. Tools: `web_search`, `fetch_url`, `web_answer`, `upsert_rows`, `place_card`.
3. Team and hiring: founders and executives (fetch_signed_in LinkedIn when connected, public search otherwise), joiners and leavers into Team changes (upsert_rows, key Name), the open-role count and mix into the Open roles metric source, and any board changes. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `upsert_rows`, `place_card`.
4. Customers and product: named wins and losses, case studies and reviews (G2 or similar, fetch_signed_in when connected) into Customer signals, quote cards (positive and negative), pricing and release changes, and traffic or download trends as signals. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
5. Competitors: add the known competitors from the intake first. On the first run find_entities discovers more (the match limit follows the depth tier); it fills its own database card in this frame, and batch_enrich fills funding, headcount and latest move. Then upsert the rows into Competitor moves (upsert_rows, key Name). On later runs only refresh what changed. On the Quick scan tier find_entities and batch_enrich are refused: use web_search with upsert_rows instead. Tools: `find_entities`, `batch_enrich`, `web_search`, `upsert_rows`, `query_dataset`.
6. Financing: the last round and any new financing news (Crunchbase or PitchBook when connected, fetch_signed_in; press otherwise) into Financing events (upsert_rows, key Event), investor activity and bridge or extension signals, and comparable market multiples for the next-round view. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `upsert_rows`, `place_card`.
7. A red-flag sweep: search layoffs, litigation, regulator actions, security incidents and executive departures so Critic has sources to clear or raise each flag. Tools: `web_search`, `fetch_url`, `place_card`.
8. Deep research for the gaps that remain (a customer, a round, a market question): deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) and query the KPI tracker and Signal log (query_dataset) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`, `query_dataset`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card in Next check-in. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge every KPI that is Reported only: link it with "tension" to the card that disagrees, or place a Question asking for the second source. Look for KPIs that quietly disappeared from the update or changed definition. Where the signals show the original thesis breaking, link them to the thesis hypothesis with "contradicts". Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Turn every gap into a Question card in Next check-in, with a link to the card or gap that prompted it. Tools: `place_card`, `add_link`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. Charts bound to the KPI tracker: actual over time per metric (line) and variance to plan (bar); and funding by competitor (bar) bound to Competitor moves. Tools: `place_card`, `query_dataset`.
2. The positioning 2x2 (framework, quadrant) with the company and its competitors placed from the Competitor moves database. Tools: `place_card`, `query_dataset`, `read_card`.
3. A runway chart: cash after each Financing events row against the burn, with the month the cash runs out. Tools: `place_card`, `query_dataset`.
4. Optional one-page visual summary (a design frame): status call, the six headline numbers, the KPIs off plan and the top risks, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. Runway under 12 months with no round in progress. *How:* Read Cash and runway in the financing frame and the latest financials; compute runway from cash and burn.
2. Growth or revenue behind plan for two periods running. *How:* Read the KPI tracker variance column for the last two periods.
3. Departure of a founder, an executive or a key engineer. *How:* Check Team changes and the signal log for departures and open leadership roles.
4. Layoffs, a hiring freeze or a sharp drop in open roles. *How:* Look for layoff news and the open-role count over time.
5. Loss or downsizing of a top customer, or rising churn. *How:* Check Customer signals, reviews and the retention KPIs.
6. A competitor raised a large round or launched the same product. *How:* Read the Competitor moves database and the competitor signals.
7. Litigation, a regulatory action or a security incident. *How:* Search news, regulator pages and the company status page; cite the source.
8. Reporting got late, thinner or less consistent. *How:* Compare the dates and completeness of the board materials and updates that were provided.
9. The next round looks like a down round or a bridge. *How:* Compare the last valuation, current growth and market multiples; look for bridge or extension news.
10. Web traffic, downloads or product-usage signals are declining. *How:* Look for traffic and download trends in the signal log; a decline over two periods is raised.
11. The company missed something it promised the board. *How:* Compare the thesis milestones and last board commitments with what the sources show.
12. Concentration: one customer, one channel or one supplier carries the business. *How:* Look for revenue by customer or channel in the materials; say "not knowable" if absent.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Performance against plan | 25% | Missing the plan on the main KPIs for two or more periods. | Near plan, with misses explained. | Ahead of plan on the KPIs that matter, verified. | kpis |
| Runway & financing | 20% | Under six months of runway with no round in sight. | 12 to 18 months of runway or a round in progress. | More than 24 months of runway, or a strong round just closed. | financing |
| Team & hiring | 15% | Key departures and a hiring freeze. | Stable team, hiring to plan. | Strong senior hires, low attrition, hiring ahead of growth. | team |
| Customers & product | 20% | Churn rising, reviews souring, product slipping. | Steady retention and product on the roadmap. | Expanding customers, strong reviews, product shipping ahead. | customers |
| Thesis intact & market position | 20% | The original thesis is broken or the market has turned against the company. | Thesis partly intact; competition has moved. | Thesis confirmed and the company is gaining position. | thesis |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Portfolio update: {{company}}. Every paragraph cites cards; every number cites its source; reported and verified figures are marked as such.

1. Status & call (at most 150 words): The status call, the health score, what changed, the top 3 reasons and the top 3 risks, in at most 150 words.
2. KPIs against plan: The KPI table with plan, actual and variance, reported against verified, with the charts.
3. Thesis check: Each original hypothesis, the evidence for and against, and what changed since the investment.
4. News & signals: The notable signals since the last check, with their impact.
5. Team & hiring: Joiners, leavers, open roles and leadership gaps.
6. Customers & product: Wins, losses, reviews, releases and pricing.
7. Competitors: What rivals did and the positioning 2x2.
8. Financing & runway: Cash, burn, runway, the last round and the outlook for the next one.
9. Risks & mitigants: The red-flag outcomes: each raised flag with its mitigant, and the cleared ones in one line.
10. Health scorecard: The rubric table: each dimension, its weight, its score and its evidence.
11. Actions & asks: The action items with owners and dates, and the asks to the founders.
12. Questions for the next check-in: The ranked questions and what to look at next time.

Appendix: All sources.

One-page summary: Status call, Headline numbers, Off-plan KPIs, Top risks, Actions.

Deck format: `portfolio-review`.

## Follow-up chips

Shown after the first pass.

- Watch this company: Set up monitoring for {{company}} between check-ins: news, funding, layoffs, lawsuits and launches. Tell me the cost before you start.
- Refresh since last check: Refresh {{company}}: what happened since the last check, which KPIs moved against plan and whether the status call changes.
- Draft the board prep: Draft my board prep for {{company}}: the five questions to ask, linked to the gaps and risks on the board, with what a good answer looks like.
- Draft a note to the founders: Draft a short note to the {{company}} founders: what we noticed, what we need to understand and what we can help with.
- Assess the next round: Assess the next {{company}} round: likely size, valuation range against comparable multiples, who might lead and the risk of a down round.
- Compare to [portfolio company]: Compare {{company}} to [portfolio company] on growth, burn, runway and team, side by side with a table.

## Signed-in sources

- Crunchbase (crunchbase.com): New rounds, investors, headcount and acquisitions.
- LinkedIn (linkedin.com): Joiners, leavers, open roles and executive profiles.
- PitchBook (pitchbook.com): Valuations, comparable deals and investor activity.
- G2 (g2.com): Customer reviews and ratings over time.

## Monitor

Only when the user asks: `{{company}} funding, layoffs, lawsuits, executive changes, customer wins and product launches`. News between check-ins that changes the status call.
