# Partnership evaluation

<!-- Generated from packages/shared/src/templates/partnership.ts by `pnpm templates:docs`. Do not edit by hand. -->

Evaluate a partnership with a company: eleven numbered frames (snapshot, strategic fit, partner health, market access, product and integration, economics and terms, track record, alternatives, risks, plan, decision), the red-flag checklist, the weighted scorecard and a partnership memo. Say what each side wants and brings, test the partner with independent sources, model the deal in scenarios, compare the alternatives and end with a recommendation (Proceed, Proceed with conditions, Renegotiate, Decline).

Template id `partnership`. Canvas title: `{{partner}}: partnership evaluation`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Partner company (`partner`) | text | yes | placeholder "Initech" |
| Website URL (`website`) | url | yes | placeholder "https://initech.com" |
| Kind of partnership (`kind`) | select | yes | one of Channel / reseller, Technology integration, Co-marketing, Co-development, Distribution, Joint venture, Strategic alliance, Referral |
| What you want from it (`goal`) | longtext | yes | placeholder "Reach mid-market banks through their channel without building a sales team" |
| What you bring (`ours`) | longtext | no | placeholder "Our product, customers, brand, data…" |
| Proposed terms (if any) (`terms`) | longtext | no | placeholder "Revenue share, exclusivity, term, minimums…" |
| Our commitment (`commitment`) | text | no | placeholder "2 engineers for 6 months, $200k" |
| Decision by (`timeline`) | text | no | placeholder "2026-12-01" |
| People on their side (`contacts`) | people | no | placeholder "One per line: Name, title, LinkedIn URL". Optional. |
| Alternatives you know (`alternatives`) | list | no | placeholder "Comma separated". Optional. Scout finds more. |
| Specific concerns to probe (`concerns`) | longtext | no | placeholder "Channel conflict, their financial position, exclusivity…" |
| Materials (`materials`) | materials | no | Drop the proposal, term sheet, an NDA summary, partner decks or call notes. Each becomes a card or database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites Crunchbase, LinkedIn, PitchBook, G2. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 6 | no limit | full |

- **Quick scan:** No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the memo is the summary only (partnership evaluation).
- **Standard:** Quick, plus entity discovery, batch enrichment and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on the hardest questions, full entity discovery with extension and the full memo.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 PARTNER SNAPSHOT (signal; orb)

Brief: Who {{partner}} is in one sentence: what it sells, to whom, HQ, size, growth, funding or revenue, leadership, ownership and investors, and the kind of partnership proposed. Every figure has a date and a source.

Target: 6+ metric; 1+ entity (the partner); 1+ doc (the one-liner).

Seed cards:
- entity: {{partner}}
- doc: One-liner
- metric: Employees
- metric: Revenue or funding
- metric: Growth
- metric: Customers
- metric: Partners
- metric: Founded

### 02 STRATEGIC FIT (sky; scout, critic, builder)

Brief: Why this partnership: the goal on our side, what the partner wants from it, what each brings, where interests overlap and where they diverge, and whether a partnership is the right route compared with building, buying or going alone. Test each assumption with evidence.

Target: 3+ hypothesis (with evidence links); 2+ framework (pros and cons; the build-buy-partner 2x2); 2+ insight (each cites 2 or more cards).

Seed cards:
- hypothesis: This partnership gets us what we want: {{goal}}
- hypothesis: {{partner}} wants this as much as we do
- hypothesis: Partnering beats building or buying
- framework: Partnering: pros and cons
- framework: Build, buy or partner

### 03 PARTNER HEALTH AND REPUTATION (rho; scout, critic)

Brief: Is the partner a safe bet: financial position and runway, growth, leadership stability, product momentum, customer satisfaction, security record, litigation and press. Separate what the partner reports from what outside sources show, and date every item.

Target: 1+ database (Partner financials); 1+ timeline (funding, leadership and news events); 3+ quote (including 1 negative); 4+ source.

Seed cards:
- database: Partner financials (database `financials`)
- timeline: Partner timeline
- question: Can the partner afford to deliver this?

### 04 MARKET ACCESS AND CUSTOMERS (sky; scout, builder)

Brief: What the partner adds to our reach: its customers, segments, regions and channels, the overlap with ours, the new accounts it could open and a size for the opportunity with the method stated.

Target: 1+ database (Customer overlap); 1+ chart (overlap or reach, bound to the database); 3+ metric (reach, overlap and opportunity size); 3+ source.

Seed cards:
- database: Customer overlap (database `overlap`)
- metric: Partner reach
- metric: Customer overlap
- metric: Opportunity size
- chart: Opportunity by segment (database `overlap`)

### 05 PRODUCT AND INTEGRATION (rho; scout, builder)

Brief: What the partnership needs technically and operationally: the APIs, data flows, branding and support model, who builds what, the effort in person-days, the dependencies and the security and compliance review each side will run. A diagram of how the two products fit together.

Target: 1+ database (Integration requirements); 1+ diagram (how the products connect); 3+ source (API docs, marketplace and integration pages); 2+ image (screenshots of their partner programme).

Seed cards:
- database: Integration requirements (database `integration`)
- question: What is the smallest integration that proves the partnership?

### 06 ECONOMICS AND TERMS (sky; orb, builder, scout)

Brief: The money and the contract: revenue share, fees, minimums, exclusivity, term and exit, who owns the customer and the data. Model at least three scenarios (low, base, high) with our cost, break-even and margin, and compare each term with the market standard.

Target: 2+ database (Deal scenarios and Terms); 1+ chart (scenario margins, bound to Deal scenarios); 1+ math (the break-even); 2+ metric.

Seed cards:
- database: Deal scenarios (database `scenarios`)
- database: Terms (database `terms`)
- metric: Break-even
- metric: Base-case margin
- chart: Margin by scenario (database `scenarios`)

### 07 PARTNERSHIP TRACK RECORD (rho; scout, critic)

Brief: How the partner's other partnerships went: who they partnered with, since when, what was achieved, which ended and why, and what those partners say. Look for partner programme terms, a partner portal and public disputes.

Target: 1+ database (Their partnerships); 3+ quote (partners in their own words); 3+ source.

Seed cards:
- database: Their partnerships (database `partnerships`)
- question: Which of their partners would give us a candid reference?

### 08 ALTERNATIVE PARTNERS (sky; scout, builder, critic)

Brief: Who else could deliver the same outcome: direct alternatives, adjacent companies and doing it ourselves. Compare them on the same criteria so the choice is clear, and say why this partner beats or loses to each.

Target: 1+ database (at least 6 alternatives); 1+ matrix; 1+ framework (the 2x2).

Seed cards:
- database: Alternative partners (database `alternatives`)
- matrix: Partner comparison
- framework: Alternatives on reach and fit

### 09 RISKS AND RED FLAGS (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Also covers channel conflict, dependency, IP and data rights, exit and the reputational risk of being tied to this partner.

Target: 6+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Red-flag checklist
- risk: Strategic risk
- risk: Financial risk
- risk: Channel conflict risk
- risk: Legal and IP risk
- risk: Execution risk

### 10 GOVERNANCE AND PLAN (paper; orb, critic)

Brief: If we proceed: the owners on each side, the first 30, 60 and 90 days, the success metrics and the review dates, the escalation path and the exit conditions. Turn every unresolved Question on the board into a question for the partner.

Target: 2+ checklist (the 90-day plan and the questions for the partner); 1+ timeline (milestones).

Seed cards:
- checklist: 90-day plan
- checklist: Questions for the partner
- timeline: Milestones

### 11 THESIS AND DECISION (signal; orb)

Brief: The case for and against, the key hypotheses with confidence, what must be true, the scoring against the rubric, and a recommendation (Proceed, Proceed with conditions, Renegotiate, Decline) with the conditions and the terms to hold.

Target: 1+ framework (SWOT); 1+ decision; 1+ matrix (the filled scorecard).

Seed cards:
- framework: SWOT: partnering with {{partner}}
- matrix: Scorecard: {{partner}} (rubric score x 2, so 10 is a 5)
- decision: Recommendation on {{partner}}

## Databases

### Partner financials (frame `health`)

Every figure about the partner’s size and health with its period, whether reported or estimated, and its source.

| Column | Type | Notes |
|---|---|---|
| Metric | text |  |
| Value | number |  |
| Period | date | ISO date or year-month. |
| Basis | enum (Reported, Estimated, Third party) |  |
| Trend | enum (Up, Flat, Down, Unknown) |  |
| Source | url |  |
| Note | text |  |

Views: All (table, sorted by Period asc); By basis (board, by Basis).

### Customer overlap (frame `market`)

Segments and regions the partner reaches, against ours, with the size of the opportunity in each.

| Column | Type | Notes |
|---|---|---|
| Segment | text |  |
| Region | text |  |
| Partner customers | number |  |
| Our customers | number |  |
| Overlap | enum (None, Low, Medium, High) |  |
| Opportunity (USD) | currency | Annual, with the method in Note. |
| Source | url |  |
| Note | text |  |

Views: By opportunity (table, sorted by Opportunity (USD) desc); By overlap (board, by Overlap).

### Integration requirements (frame `product`)

Everything that has to be built, connected or agreed for the partnership to work, with owner, effort and risk.

| Column | Type | Notes |
|---|---|---|
| Item | text |  |
| Type | enum (API, Data, UX, Branding, Support, Security, Legal) |  |
| Owner | enum (Us, Partner, Both) |  |
| Effort (days) | number |  |
| Risk | enum (Low, Medium, High) |  |
| Depends on | text |  |
| Source | url |  |

Views: All (table); By owner (board, by Owner); High risk (table, filtered).

### Deal scenarios (frame `terms`)

Low, base and high scenarios of the deal with revenue, cost and margin, so the economics can be checked.

| Column | Type | Notes |
|---|---|---|
| Scenario | text |  |
| Partner-sourced revenue (USD) | currency |  |
| Revenue share (%) | number |  |
| Our cost (USD) | currency | Build, support and sales cost in the period. |
| Margin (USD) | currency |  |
| Break-even (months) | number |  |
| Assumptions | text |  |

Views: All (table); By margin (table, sorted by Margin (USD) desc).

### Terms (frame `terms`)

Each term of the deal: what we want, what they offered, the market standard and how much it matters.

| Column | Type | Notes |
|---|---|---|
| Term | text |  |
| Our position | text |  |
| Their position | text |  |
| Market standard | text |  |
| Priority | enum (Must have, Important, Nice to have) |  |
| Status | enum (Open, Agreed, Disputed) |  |
| Source | url |  |

Views: All (table); By status (board, by Status); Must have (table, filtered).

### Their partnerships (frame `track`)

The partner’s existing and past partnerships and how each went.

| Column | Type | Notes |
|---|---|---|
| Partner | text |  |
| Kind | text |  |
| Since | date |  |
| Status | enum (Active, Ended, Dormant, Unknown) |  |
| Outcome | text |  |
| Competes with us | boolean |  |
| Source | url |  |
| Quote | text |  |

Views: All (table); By status (board, by Status); Competitors of ours (table, filtered).

### Alternative partners (frame `alternatives`)

Other companies that could deliver the same outcome. Discovered with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Kind | enum (Direct alternative, Adjacent, Build ourselves, Acquire) |  |
| HQ | text |  |
| Size | text |  |
| Reach | text |  |
| Capability fit | rating | 1 (weak) to 5 (strong). |
| Why not | text |  |
| Source | url |  |

Views: All (table, sorted by Capability fit desc); By kind (board, by Kind); Strong fit (table, filtered).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first: the proposal, the term sheet, decks and call notes (read_card and read_source for files, query_dataset for tables). Put every proposed term in the Terms database (upsert_rows, Their position) and every stated figure in Deal scenarios. Hand Scout the contacts, the alternatives the user knows and the ticked signed-in sources in its delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (its eight-step playbook), Builder once Scout has placed its first sources, Critic once Scout has sources to review. Name the frames each agent owns. Tools: `delegate`, `message_agent`.
3. After Scout's first pass, fill the Partner snapshot metrics and the one-liner (update_card on the placeholders), each with a cited figure and date. Never write a figure you cannot source. Tools: `query_board`, `search_board`, `update_card`.
4. Build the deal model: one row per scenario in Deal scenarios (low, base, high; upsert_rows) from the stated terms, the opportunity size and our cost; update the Break-even and Base-case margin metrics and the break-even Math card; say which inputs are assumptions. Compare each term with the market standard in Terms. Tools: `query_dataset`, `upsert_rows`, `update_card`, `place_card`.
5. For a gap Scout could not close (the partner’s runway, a market-standard term, an ended partnership), run web_answer, then deep_research (core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `web_answer`, `deep_research`, `research_status`, `ask_user_question`.
6. At the end, fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card in the why line. Then the SWOT, the hypotheses in Strategic fit (evidence for and against as card ids) and the Decision card: your proposed option and the weighted total in its rationale. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
7. Write the plan: the 90-day checklist (owners, metrics, review dates), the milestones on the timeline and the "Questions for the partner" list, collecting every unresolved Question card from the other frames, ranked, each linked to its source. Tools: `search_board`, `update_card`, `place_card`, `add_link`.
8. Write the memo with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. Tools: `compose_section`.
9. Only when the user asks to keep watching the partner: watch_topic with the partner name and the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. The partner site: home, about, customers, partners and integrations, pricing and the partner-programme pages (fetch_url, parallel_extract). Capture the partner-programme and marketplace pages (capture_page) as image cards. Place an Entity card for the partner and the snapshot facts. Tools: `fetch_url`, `parallel_extract`, `capture_page`, `place_card`.
2. Health: funding and leadership (Crunchbase or PitchBook if connected, fetch_signed_in; press otherwise), headcount and hiring (LinkedIn if connected), customer reviews and any layoffs, lawsuits or incidents. One Partner financials row per figure (upsert_rows, key Metric, Basis set), dated events on the Partner timeline and quote cards, with at least one negative. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
3. Reach and overlap: the partner’s customers, segments and regions from its site, case studies and review sites; ours from the user’s materials. One Customer overlap row per segment (upsert_rows) with the opportunity and the method. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`, `upsert_rows`.
4. Integration: the partner’s API docs, marketplace and existing integrations (fetch_url, parallel_extract). One Integration requirements row per item with type, owner, effort and risk (upsert_rows); the sources as source cards. Tools: `fetch_url`, `parallel_extract`, `web_search`, `place_card`, `upsert_rows`.
5. Track record: the partner directory, press releases and partner announcements. One Their partnerships row per partner with status (Active, Ended, Dormant) and whether it competes with us; what partners say as quote cards; disputes and ended partnerships found by search. Tools: `web_search`, `fetch_url`, `fetch_signed_in`, `place_card`, `upsert_rows`.
6. Market standard: search for typical revenue shares, exclusivity and term for this kind of partnership; write the figure and the source in the Market standard column of the Terms rows (upsert_rows). Tools: `web_search`, `fetch_url`, `parallel_extract`, `upsert_rows`.
7. Alternatives: add the ones the user knows first. find_entities discovers more (the match limit follows the depth tier); it fills its own database card in this frame. batch_enrich fills in kind, HQ, size and reach; consolidate into Alternative partners with query_dataset and upsert_rows, with a Capability fit rating each. Tools: `find_entities`, `batch_enrich`, `web_search`, `query_dataset`, `upsert_rows`, `place_card`.
8. Fit evidence: for each hypothesis in Strategic fit place the evidence as quote or source cards and link them (add_link). Also sweep for litigation, incidents, layoffs and competitor ties so Critic has sources to clear or raise each flag. Tools: `web_search`, `fetch_url`, `place_card`, `add_link`.
9. Deep research for the gaps that remain: deep_research (core or above, per the tier), one question per run. Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source cards that clear it. Never leave a flag silent; if nothing was searched, say so and ask Scout for the search. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Test strategic fit: place an Insight (two or more citations) for each hypothesis; link a "tension" from any card that disagrees. Check that the partner’s stated goals and its Their partnerships rows agree with the claim that it wants this as much as we do. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Turn every gap into an item of the "Questions for the partner" checklist (place_card on the checklist or a Question card), with a link to the card or gap that prompted it. Tools: `place_card`, `add_link`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. The "Partnering: pros and cons" framework and the build-buy-partner 2x2, each item citing a card in Strategic fit. Tools: `place_card`, `query_board`, `read_card`.
2. Charts: opportunity by segment bound to Customer overlap and margin by scenario bound to Deal scenarios; the break-even as a Math card from the scenario rows. Tools: `place_card`, `query_dataset`, `read_card`.
3. A diagram of how the two products connect (data flows, who builds what) from Integration requirements, and a design frame of the joint customer journey when it helps. Tools: `place_card`, `write_design_frame`, `query_dataset`, `read_card`.
4. The partner comparison matrix (weighted criteria, scores 0 to 10 from Alternative partners) and the alternatives 2x2. Tools: `place_card`, `query_dataset`, `read_card`.
5. Optional one-page visual summary (a design frame): partner, score, recommendation, the economics and the top risks, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. Partner financial distress: a down round, layoffs, going-concern language or missed payments. *How:* Read the Partner financials database and the health timeline; search funding and layoff news.
2. The partner also works with, or is owned by, our direct competitor. *How:* Check Their partnerships and the ownership and investor list; a competitor on either is raised.
3. Channel conflict: the partner sells a product that competes with ours, or sells to our customers directly. *How:* Compare the partner product pages with ours and read Customer overlap for shared accounts.
4. The partner asks for exclusivity, a minimum commitment or a most-favoured-nation clause. *How:* Read the proposed terms (materials, Terms database); raise each clause that restricts us or commits spend.
5. A pattern of past partners leaving badly: public disputes, ended partnerships or complaints. *How:* Read Their partnerships for Ended or Dormant rows and search for disputes, reviews and partner forums.
6. Unclear IP, data-sharing or customer-ownership rights. *How:* Look in the terms and the integration requirements for joint IP, data access and who owns the customer.
7. Over-dependence: more than a quarter of our plan rests on this one partner. *How:* Compare the deal scenarios with our plan or revenue; if it is not knowable, raise a Question.
8. The executive sponsor has left, or leadership changed recently, on either side. *How:* Check the Snapshot and health timeline for leadership moves; ask who owns the relationship on each side.
9. A change-of-control, termination or assignment clause that lets the partner leave when acquired. *How:* Read the proposed terms for change-of-control and termination rights; note the notice period.
10. Regulatory, antitrust or data-protection exposure from the arrangement. *How:* Search for rules in the partner sector and region; raise any that need a filing, consent or a data agreement.
11. Reputational risk: lawsuits, controversies, security incidents or bad press. *How:* Search litigation, incident and press items; weigh them against the brand we would be tied to.
12. Integration effort that is underestimated or has a hard dependency outside our control. *How:* Read Integration requirements: effort missing, a Risk of High, or an item owned only by the partner.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Strategic fit | 25% | The partnership does not move a goal that matters. | It supports a goal, but other routes would too. | It is the best route to a top goal, and the partner wants the same outcome. | fit |
| Market access and complementarity | 20% | Same customers and same product: a duplicate. | Some new reach or a useful extra capability. | A large new segment or capability we cannot build or buy quickly. | market |
| Partner health and reputation | 15% | Distressed, or a record of damaging partners. | Stable; mixed references. | Growing, well funded and praised by past partners. | health |
| Economics | 15% | Loses money in every scenario. | Break-even in the base case within 18 months. | Clear margin in the base case, with upside and low commitments. | terms |
| Execution feasibility | 15% | Heavy integration, unclear owners. | Moderate work with named owners on both sides. | Light integration, an executive sponsor on each side and a launch plan. | product |
| Alignment and conflict risk | 10% | Channel conflict or exclusivity that blocks our core business. | Some overlap that clear rules can manage. | Incentives line up; no conflict with our other partners or customers. | risks |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Partnership evaluation: {{partner}}. Every paragraph cites cards; every figure cites its source and date; what the partner claims is marked as claimed and what outside sources show as verified; every assumption in the deal model is labelled.

1. Summary and recommendation (at most 150 words): The recommendation, the score, the top 3 reasons, the top 3 risks and the conditions, in at most 150 words.
2. The partner: A table of the snapshot metrics: what they do, size, funding, customers, partners.
3. Strategic fit: What each side wants and brings, the hypotheses and their evidence, and why partnering beats building or buying.
4. Partner health and reputation: Financial position, momentum, leadership, reviews and incidents, with the timeline.
5. Market access and customers: The reach the partner adds, the overlap and the opportunity size with the method and the chart.
6. Product and integration: What has to be built, by whom, the effort and the dependencies, with the diagram.
7. Economics and terms: The scenarios, the break-even and each term against the market standard, with the chart.
8. Track record: Their other partnerships, how they went and what partners say.
9. Alternatives: The alternatives compared on the same criteria, and where this partner wins and loses.
10. Risks and mitigants: The red-flag outcomes: each raised flag with its mitigant, the cleared ones in one line.
11. Scorecard: The rubric table: each dimension, its weight, its score and its evidence.
12. Plan and next steps: The 90-day plan, the questions for the partner and the proposed next step.

Appendix: All sources.

One-page summary: The partner, Score, Recommendation, Economics, Top risks, Next step.

Deck format: `partnership-review`.

## Follow-up chips

Shown after the first pass.

- Negotiation brief: Write the negotiation brief for {{partner}}: the terms that matter most, our fallback on each, theirs, and the trade we offer.
- Go deeper on [alternative]: Go deeper on [alternative] as a replacement for {{partner}}: reach, capability, terms and how it compares on the scorecard.
- Stress-test the economics: Stress-test the deal economics with {{partner}}: halve the partner-sourced revenue, double our cost and show what happens to the break-even.
- Draft the partner call agenda: Draft the agenda for the next call with {{partner}}: ordered questions with a time for each, linked to the gaps and risks on the board.
- Draft the term-sheet outline: Draft a term-sheet outline for the partnership with {{partner}} from the Terms database and the risks raised.
- Re-score after their answers: I added their answers. Re-score the rubric, say which scores moved and why, and update the decision.

## Signed-in sources

- Crunchbase (crunchbase.com): Funding, investors, acquisitions and leadership of the partner and its alternatives.
- LinkedIn (linkedin.com): Leadership backgrounds, tenure, headcount and hiring on the partner side.
- PitchBook (pitchbook.com): Valuations, ownership and comparable deals.
- G2 (g2.com): What the partner’s customers and partners say in reviews.

## Monitor

Only when the user asks: `{{partner}} funding, leadership changes, layoffs, acquisitions, lawsuits and new partnerships`. News that would change the partnership decision or the terms.
