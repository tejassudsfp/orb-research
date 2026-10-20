# Vendor / tool selection

<!-- Generated from packages/shared/src/templates/vendor-selection.ts by `pnpm templates:docs`. Do not edit by hand. -->

Choose a vendor or tool: ten numbered frames (the need, market landscape, shortlist comparison, pricing and total cost, reviews and references, security and viability, integration and rollout, risks and lock-in, questions for vendors, recommendation), the red-flag checklist, the weighted scorecard and a selection memo. Turn the requirements into weighted criteria first, find candidates with Parallel, compare finalists on the same evidence, price three years of ownership, and end with a recommendation (the winner and the runner-up, a proof of concept, keep looking, or do not buy).

Template id `vendor-selection`. Canvas title: `Vendor selection: {{need}}`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| What you need to buy (`need`) | text | yes | placeholder "A customer support platform" |
| Requirements (`requirements`) | longtext | yes | placeholder "Shared inbox, SSO, a public API, EU data residency, 50 agents…". What it must do and what would be nice. orb turns it into weighted criteria. |
| Hard must-haves (`must_haves`) | list | no | placeholder "Comma separated: SOC 2, SSO, EU data residency". A vendor that misses one is out. |
| Budget (`budget`) | text | no | placeholder "$40k per year" |
| Users / scale (`users`) | text | no | placeholder "50 agents, 200k tickets a year" |
| Decision / go-live (`timeline`) | text | no | placeholder "Decide by Dec 1, live by Q1" |
| What you use today (`current`) | list | no | placeholder "Comma separated". Optional. Used as the baseline and for migration effort. |
| Systems it must integrate with (`stack`) | list | no | placeholder "Comma separated: Salesforce, Slack, Okta" |
| Vendors you know (`vendors`) | list | no | placeholder "Comma separated". Optional. Scout finds more. |
| Security, compliance and legal constraints (`constraints`) | longtext | no | placeholder "SOC 2 Type II, EU data residency, no US subprocessors…" |
| Specific concerns to probe (`concerns`) | longtext | no | placeholder "Lock-in, price creep, migration pain…" |
| Materials (`materials`) | materials | no | Drop the requirements doc, an RFP, quotes, the current contract or usage exports (CSV, XLSX). Each becomes a card or database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites G2, Gartner Peer Insights, LinkedIn, Crunchbase. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 6 | no limit | full |

- **Quick scan:** No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the memo is the summary only (vendor selection).
- **Standard:** Quick, plus entity discovery, batch enrichment and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on the hardest questions, full entity discovery with extension and the full memo.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 THE NEED AND CRITERIA (signal; orb)

Brief: What is being bought, why now, for whom and at what scale; the budget and timeline; the must-haves and the wants turned into weighted criteria that add up to 100; the baseline of what is used today. Everything later is judged against this frame.

Target: 4+ metric (budget, scale, timeline, current spend); 2+ checklist (must-haves and weighted wants); 1+ doc (the need in one paragraph).

Seed cards:
- doc: The need
- checklist: Must-haves (a vendor that misses one is out)
- checklist: Weighted wants
- metric: Budget
- metric: Scale
- metric: Decision date
- metric: Current spend

### 02 MARKET LANDSCAPE (sky; scout)

Brief: The vendors that could meet the need: leaders, challengers, open-source and in-house options. For each: what it is, who it is for, size and funding, and why it is on or off the shortlist. Start from the vendors the user named, find the rest with Parallel entity discovery and cut to three to five finalists using the must-haves.

Target: 1+ database (Vendor longlist, at least 10 vendors); 1+ chart (vendors by category or size); 4+ source (including an analyst or independent landscape).

Seed cards:
- database: Vendor longlist (database `longlist`)
- chart: Longlist by category (database `longlist`)
- question: Which vendors are out on a must-have alone?

### 03 SHORTLIST COMPARISON (rho; scout, builder, critic)

Brief: The three to five finalists compared requirement by requirement: for each requirement and vendor, full, partial, none or unknown, with the evidence (docs, demo, trial, review). One Product card per finalist, a weighted comparison matrix and a 2x2 of function against cost.

Target: 1+ database (Requirements coverage); 3+ product (one card per finalist); 1+ matrix; 1+ framework (the 2x2).

Seed cards:
- database: Requirements coverage (database `coverage`)
- matrix: Finalist comparison
- framework: Function against cost
- hypothesis: One finalist is clearly best on the weighted criteria

### 04 PRICING AND TOTAL COST (sky; scout, builder)

Brief: What each finalist really costs: list price, units and tiers, implementation, training, integration, support and growth, over three years at our scale. Mark what is list price, what is quoted and what is assumed; show contract term, auto-renewal and uplift.

Target: 2+ database (Pricing and TCO model); 1+ chart (3-year TCO by vendor, bound to the TCO database); 1+ math (the cost formula); 2+ metric.

Seed cards:
- database: Pricing (database `pricing`)
- database: TCO model (database `tco`)
- metric: Cheapest finalist (3-year TCO)
- metric: Spread between finalists
- chart: 3-year total cost by vendor (database `tco`)

### 05 REVIEWS AND REFERENCES (rho; scout)

Brief: What real users and customers say: review sites, forums, social posts and reference customers like us. Praise and complaints by theme, the rating and count per site, how recent they are, and who would give a candid reference.

Target: 1+ database (Reviews); 6+ quote (at least 1 negative per finalist); 4+ source.

Seed cards:
- database: Reviews (database `reviews`)
- question: Which complaints recur across sites?

### 06 SECURITY, COMPLIANCE AND VIABILITY (sky; scout, critic)

Brief: Can we trust this vendor with our data and our business for five years: certifications, data residency and subprocessors, incidents, uptime and SLA, funding and ownership, headcount, customers and roadmap. Check each against our constraints.

Target: 1+ database (Vendor viability); 1+ timeline (incidents and ownership changes); 4+ source (trust centres, status pages, filings).

Seed cards:
- database: Vendor viability (database `viability`)
- timeline: Incidents and ownership changes
- question: Do the finalists meet every constraint, with proof?

### 07 INTEGRATION AND ROLLOUT (rho; scout, builder)

Brief: What it takes to get live: connectors for our stack, data migration from what we use today, security review, training, change management, effort in person-days and a realistic timeline per finalist. A diagram of how it fits with our systems and a proof-of-concept plan.

Target: 1+ database (Integration and rollout); 1+ diagram (how the finalist fits our stack); 1+ checklist (the proof-of-concept plan).

Seed cards:
- database: Integration and rollout (database `rollout`)
- checklist: Proof-of-concept plan

### 08 RISKS AND LOCK-IN (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Also covers lock-in and the exit plan, price risk over the term, dependency on one vendor and the cost of being wrong.

Target: 6+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Red-flag checklist
- risk: Functional risk
- risk: Cost risk
- risk: Security and compliance risk
- risk: Lock-in and exit risk
- risk: Implementation risk

### 09 QUESTIONS AND NEGOTIATION (paper; critic, orb)

Brief: What to put to each finalist before deciding: the questions that close the gaps (ranked, each linked to the gap or risk behind it), the vendors’ answers as they arrive, and the terms to negotiate (price, term, uplift cap, exit, SLA).

Target: 1+ checklist (at least 10 ranked questions, each linked to its source card); 1+ database (Vendor responses).

Seed cards:
- database: Vendor responses (database `responses`)
- checklist: Questions for vendors

### 10 SCORECARD AND DECISION (signal; orb)

Brief: Score each finalist against the rubric with cited evidence, show the weighted totals side by side, the pros and cons of the leader and the runner-up, and recommend (buy the winner, run a proof of concept, keep looking, do not buy) with the conditions and the terms to hold.

Target: 1+ matrix (the filled scorecard, one column per finalist); 1+ decision; 1+ framework (pros and cons of the leader).

Seed cards:
- matrix: Scorecard (rubric score x 2, so 10 is a 5)
- framework: The leading vendor: pros and cons
- framework: SWOT of the choice for {{need}}
- decision: Recommendation: {{need}}

## Databases

### Vendor longlist (frame `market`)

Every vendor that could meet the need. Discovered with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Vendor | text |  |
| URL | url |  |
| Category | enum (Leader, Challenger, Niche, Open source, Build in-house, Suite add-on) |  |
| HQ | text |  |
| Founded | number |  |
| Employees | number |  |
| Total funding | currency | US dollars; blank if public or bootstrapped. |
| Best for | text |  |
| Must-haves met | enum (All, Some, None, Unknown) |  |
| Fit score | rating | 1 (poor) to 5 (strong). |
| Shortlisted | boolean |  |
| Source | url |  |

Views: All (table, sorted by Fit score desc); By category (board, by Category); Shortlist (table, filtered).

### Requirements coverage (frame `shortlist`)

One row per vendor and requirement: how well it meets it and the evidence.

| Column | Type | Notes |
|---|---|---|
| Row | text | Vendor and requirement, for example "Acme: SSO". |
| Vendor | text |  |
| Requirement | text |  |
| Must-have | boolean |  |
| Weight | number | From the weighted criteria. |
| Support | enum (Full, Partial, None, Unknown) |  |
| Evidence | enum (Docs, Demo, Trial, Review, Vendor claim) |  |
| Source | url |  |
| Note | text |  |

Views: All (table, by Vendor); By support (board, by Support); Vendor claims only (table, filtered).

### Pricing (frame `pricing`)

Every price point found for each finalist: plan, unit, list or quoted, term and renewal terms.

| Column | Type | Notes |
|---|---|---|
| Row | text | Vendor and plan, for example "Acme: Business". |
| Vendor | text |  |
| Plan | text |  |
| Unit price (USD) | currency |  |
| Unit | text | Per seat per month, per 1,000 events… |
| Basis | enum (List, Quoted, Estimated) |  |
| Contract term (months) | number |  |
| Auto-renew | boolean |  |
| Annual uplift (%) | number |  |
| Source | url |  |
| Note | text | Overages, minimums, add-ons. |

Views: All (table, by Vendor); By basis (board, by Basis); Auto-renewing (table, filtered).

### TCO model (frame `pricing`)

Three years of cost per finalist at our scale, with the assumptions, so the total can be checked.

| Column | Type | Notes |
|---|---|---|
| Vendor | text |  |
| Licence (USD) | currency | Three years at our scale. |
| Implementation (USD) | currency |  |
| Integration (USD) | currency |  |
| Training (USD) | currency |  |
| Support (USD) | currency |  |
| Total (USD) | currency |  |
| Within budget | boolean |  |
| Assumptions | text |  |

Views: By total (table, sorted by Total (USD) asc); Within budget (table, filtered).

### Reviews (frame `evidence`)

Ratings and recurring themes per vendor and review site, and who could give a reference.

| Column | Type | Notes |
|---|---|---|
| Row | text | Vendor and site, for example "Acme: G2". |
| Vendor | text |  |
| Site | text |  |
| Rating | number | Out of 5. |
| Reviews | number |  |
| Praised for | text |  |
| Complaints | text |  |
| Latest review | date |  |
| URL | url |  |

Views: All (table, by Vendor); By rating (table, sorted by Rating desc).

### Vendor viability (frame `trust`)

Security, compliance and financial health per finalist, checked against our constraints.

| Column | Type | Notes |
|---|---|---|
| Vendor | text |  |
| Certifications | text | SOC 2, ISO 27001… as shown on the trust centre. |
| Meets constraints | enum (Yes, Partly, No, Unproven) |  |
| Data residency | text |  |
| Last incident | date |  |
| Uptime (12 months, %) | number |  |
| Employees | number |  |
| Customers | number |  |
| Funding / ownership | text |  |
| Flags | text | Layoffs, sale, breach, outage pattern. |
| Source | url |  |

Views: All (table); By constraints (board, by Meets constraints); Flagged (table, filtered).

### Integration and rollout (frame `rollout`)

Each integration and migration step per finalist with method, effort, owner and risk.

| Column | Type | Notes |
|---|---|---|
| Row | text | Vendor and system, for example "Acme: Salesforce". |
| Vendor | text |  |
| System | text |  |
| Method | enum (Native connector, API, Middleware, Custom build, Not possible) |  |
| Effort (days) | number |  |
| Owner | enum (Vendor, Us, Partner) |  |
| Risk | enum (Low, Medium, High) |  |
| Source | url |  |

Views: All (table, by Vendor); By method (board, by Method); High risk (table, filtered).

### Vendor responses (frame `negotiation`)

Questions put to vendors and their answers, as they arrive.

| Column | Type | Notes |
|---|---|---|
| Row | text | Vendor and question number. |
| Vendor | text |  |
| Question | text |  |
| Answer | text |  |
| Answered on | date |  |
| Satisfactory | enum (Yes, Partly, No, Waiting) |  |
| Source | url |  |

Views: All (table, by Vendor); By status (board, by Satisfactory).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. First, read the uploaded materials (the requirements doc, RFP, quotes, the current contract and usage exports: read_card and read_source for files, query_dataset for tables). Then turn the requirements into the weighted criteria: update the "Weighted wants" checklist with 6 to 10 criteria whose weights add up to 100, split the must-haves from the wants, and fill the Budget, Scale, Decision date and Current spend metrics. Ask the user (ask_user_question) only when a must-have is ambiguous. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `update_card`, `place_card`, `ask_user_question`.
2. Delegate with delegate: Scout first (its eight-step playbook), with the criteria, the vendors the user named and the ticked signed-in sources in the instruction; Builder once Scout has the shortlist; Critic once Scout has sources to review. Name the frames each agent owns. Tools: `delegate`, `message_agent`.
3. When Scout has the longlist, decide the shortlist of three to five (those that meet every must-have with evidence) and message Scout (message_agent) with the names, because only Scout can tick Shortlisted on the rows it wrote. Rename the finalists in the comparison matrix and the Scorecard columns (update_card). Tools: `query_dataset`, `message_agent`, `update_card`.
4. For a gap Scout could not close (a price that is not public, a certification, a migration path), run web_answer, then deep_research (core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `web_answer`, `deep_research`, `research_status`, `ask_user_question`.
5. Keep the "Questions for vendors" checklist current: collect every unresolved Question card, rank them, link each to its source; record vendors’ answers the user pastes in Vendor responses (upsert_rows) and re-check the affected red flags with Critic. Tools: `search_board`, `update_card`, `add_link`, `upsert_rows`, `message_agent`.
6. At the end, fill the Scorecard matrix: one 1-to-5 score per rubric dimension and finalist (doubled on the matrix), each with at least one cited card in the why line. Then the pros and cons of the leader, the SWOT of the choice and the Decision card: your proposed option and the weighted totals in its rationale. The user decides. Tools: `query_board`, `query_dataset`, `read_card`, `update_card`, `place_card`, `add_link`.
7. Write the selection memo with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. Tools: `compose_section`.
8. Only when the user asks to keep watching the finalists (a long procurement): watch_topic with the vendor names and the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. Start from what the user named: the vendors they know and what they use today. Read each vendor’s home, product, pricing, security or trust, integrations and docs pages (fetch_url, parallel_extract). Capture the pricing and product pages (capture_page) as image cards. Add each named vendor to Vendor longlist (upsert_rows, key Vendor). Tools: `fetch_url`, `parallel_extract`, `capture_page`, `place_card`, `upsert_rows`.
2. Longlist: find_entities for vendors in the category that serve our scale and constraints (the match limit follows the depth tier); it fills its own database card in this frame. batch_enrich fills category, HQ, founded, employees, funding and best-for; consolidate into Vendor longlist with query_dataset and upsert_rows. Add one analyst or independent landscape as a source card, and set Must-haves met per vendor from its docs (Unknown if not checked). Tools: `find_entities`, `batch_enrich`, `web_search`, `fetch_url`, `query_dataset`, `upsert_rows`, `place_card`.
3. Requirements coverage for each finalist: one row per vendor and requirement (upsert_rows, key Row) with Support and Evidence. Prefer docs, release notes and trials over the marketing page; mark a vendor’s own claim as "Vendor claim". One Product card per finalist with pricing, strengths and weaknesses. Tools: `fetch_url`, `parallel_extract`, `web_search`, `place_card`, `upsert_rows`.
4. Pricing: public price pages, marketplace listings, reviews that mention bills and any quote in the materials. One Pricing row per plan with the Basis (List, Quoted, Estimated), term, auto-renew and uplift; then one TCO model row per finalist for three years at our scale with every assumption written in Assumptions (upsert_rows). Tools: `fetch_url`, `parallel_extract`, `web_search`, `place_card`, `upsert_rows`.
5. Reviews and references: G2, Gartner Peer Insights, Capterra, Reddit and vendor case studies (use fetch_signed_in for G2 or Gartner if connected). One Reviews row per vendor and site with rating, count, praise and complaints; quote cards, with at least one negative per finalist; and reference customers of our size as source cards. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
6. Security, compliance and viability: the trust centre, status page history, subprocessor list, funding and headcount (Crunchbase or LinkedIn if connected). One Vendor viability row per finalist with Meets constraints set against the intake constraints; dated incidents and ownership changes on the timeline. A claim with no proof is Unproven. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
7. Integration and rollout: the connectors and docs for each system in our stack, migration tools from what we use today and implementation timelines in case studies. One Integration and rollout row per vendor and system (upsert_rows). Tools: `fetch_url`, `parallel_extract`, `web_search`, `place_card`, `upsert_rows`.
8. Deep research for the gaps that remain (a hidden price, a certification, a migration path): deep_research (core or above, per the tier), one question per run. Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source cards that clear it. Never leave a flag silent; if nothing was searched, say so and ask Scout for the search. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge every requirement marked Full on a Vendor claim alone and every price with Basis "List" or "Estimated": link a "tension" to the card that disagrees, or place a Question asking for the proof. Check that the finalists were not cut on a must-have that rests on a vendor claim. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Turn every gap into an item of the "Questions for vendors" checklist or a Question card in Questions and negotiation, ranked, with a link to the card or gap that prompted it. Tools: `place_card`, `add_link`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. The "Finalist comparison" matrix (weighted criteria, scores 0 to 10 from Requirements coverage, Reviews and Vendor viability) and the function-against-cost 2x2. Tools: `place_card`, `query_dataset`, `read_card`.
2. The 3-year total-cost chart bound to the TCO model, the cost formula as a Math card, and a Table card of list price against quoted price when quotes exist. Tools: `place_card`, `query_dataset`, `read_card`.
3. A diagram of how the leading finalist fits our stack (systems, data flows, who connects what) from Integration and rollout. Tools: `place_card`, `query_dataset`, `read_card`.
4. Optional one-page visual summary (a design frame): the need, the finalists, the scores, the cost and the recommendation, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. A must-have rests on the vendor’s marketing page only, with no demo, docs or independent confirmation. *How:* Read Requirements coverage: every must-have row needs Evidence that is not the vendor’s own sales material.
2. Opaque or open-ended pricing: usage overages, mandatory services, per-seat creep or price escalators. *How:* Read Pricing and the TCO model for overage rates, minimums and annual uplift; compare list price with reviews of real bills.
3. Lock-in: no data export, a proprietary format, or fees to leave. *How:* Look in the docs and contract terms for export formats, API coverage of all data and termination assistance.
4. Auto-renewal, a long minimum term or a large renewal uplift. *How:* Read the Pricing rows for Contract term and Auto-renew and any quote in the materials.
5. A certification or data-residency requirement the vendor cannot show (for example SOC 2, ISO 27001, GDPR, a region). *How:* Compare the constraints in the intake with Vendor viability › Certifications and Data residency; a missing proof is raised.
6. Vendor financial instability: layoffs, a down round, a pending sale or a recent ownership change. *How:* Check Vendor viability and news for funding, layoffs and acquisitions in the last 18 months.
7. A pattern of complaints in reviews: support, billing, reliability or forced upgrades. *How:* Read the Reviews database and the negative quotes; count recurring themes across sites.
8. A security incident or breach in the last three years. *How:* Search breach news, status pages and the vendor trust centre; weigh how it was handled.
9. A weak SLA or a history of outages. *How:* Read the status page history and the SLA terms: uptime, credits, support response times.
10. A key requirement depends on a roadmap promise (“coming soon”, “beta”). *How:* Look for features marked beta, preview or planned in Requirements coverage and the vendor’s release notes.
11. The vendor is small or has few customers like us, so we would be a single point of its revenue or its reference. *How:* Check headcount, customer count and the Reference customers; a vendor with no peer references is raised.
12. Implementation effort or change-management cost is underestimated. *How:* Read Integration and rollout: effort missing, a High risk row or an item only the vendor can do.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Functional fit | 30% | Misses a must-have. | Meets every must-have; some wants are partial. | Meets every must-have and most wants, verified in a demo or trial. | shortlist |
| Cost and total cost of ownership | 20% | Over budget, or the price is open-ended. | Within budget at the planned scale. | Clearly under budget with predictable growth in cost. | pricing |
| Security and compliance | 15% | Required certifications or data residency missing. | Required certifications held; some gaps in documentation. | Certified, audited, with a clean record and a security pack ready. | trust |
| Integration and implementation | 15% | Custom build with no supported route. | Supported connectors, a plan of several weeks. | Native connectors for our stack and a proven fast rollout. | rollout |
| Vendor viability and support | 10% | Distressed, or support complaints are common. | Stable; support is adequate. | Profitable or well funded, with strong support and a clear roadmap. | trust |
| Reviews and references | 10% | Poor or sparse reviews; no reference. | Good reviews; one reference. | Consistently strong reviews and references from companies like ours. | evidence |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Vendor selection memo: {{need}}. Every paragraph cites cards; every price says whether it is list, quoted or estimated; every capability says whether it is verified or a vendor claim.

1. Recommendation (at most 150 words): The recommended vendor and runner-up, the score, three reasons, the cost and the top three risks, in at most 150 words.
2. The need and criteria: What is being bought, the budget and timeline, the must-haves and the weighted criteria.
3. Market landscape: The longlist by category, how it was cut and why the finalists are the finalists, with the chart.
4. Shortlist comparison: The finalists side by side: requirement coverage, the comparison matrix and the 2x2.
5. Pricing and total cost: Three-year cost per finalist with the assumptions and the chart; contract terms and renewal.
6. Reviews and references: What users and references say per finalist, praise and complaints by theme.
7. Security, compliance and viability: Certifications, residency, incidents, uptime and financial health, against our constraints.
8. Integration and rollout: Connectors, migration, effort and timeline, with the diagram and the proof-of-concept plan.
9. Risks and lock-in: The red-flag outcomes: each raised flag with its mitigant, the cleared ones in one line, and the exit plan.
10. Scorecard: The rubric table: each dimension, its weight, each finalist’s score and the evidence.
11. Negotiation and next steps: The terms to negotiate, the ranked questions for vendors and the proposed next step.

Appendix: All sources.

One-page summary: The need, Finalists and scores, Cost, Recommendation, Top risks, Next step.

Deck format: `vendor-selection`.

## Follow-up chips

Shown after the first pass.

- Draft the RFP: Draft an RFP for {{need}} from the criteria and must-haves on this board, with the questions each vendor must answer.
- Compare [vendor] head to head: Compare [vendor] head to head with the current leader for {{need}}: function, price, security and what users complain about.
- Plan the proof of concept: Plan the proof of concept for {{need}}: tests, sample data, owners, a two-week schedule and the pass mark for each test.
- Negotiation brief: Write the negotiation brief for the winning vendor for {{need}}: price at 2x volume, term, uplift cap, exit and SLA, with our fallback on each.
- Change a weight and re-score: Change the weight of [criterion] to [weight] and re-score the finalists for {{need}}; say whether the ranking changes.
- Write the rollout plan: Write the rollout plan for the chosen vendor for {{need}}: migration, integration, training and the first 90 days.

## Signed-in sources

- G2 (g2.com): Ratings, reviews and the category grid for the longlist and finalists.
- Gartner Peer Insights (gartner.com): Peer reviews and the analyst view of the vendors in the category.
- LinkedIn (linkedin.com): Vendor headcount and hiring, and the people at companies like ours who use it.
- Crunchbase (crunchbase.com): Vendor funding, ownership and acquisitions.

## Monitor

Only when the user asks: `{{need}} vendor pricing changes, acquisitions, outages, breaches and layoffs among the shortlisted vendors`. News that changes a vendor’s price, safety or survival during a long procurement.
