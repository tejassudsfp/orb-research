# Big decision

<!-- Generated from packages/shared/src/templates/personal-decision.ts by `pnpm templates:docs`. Do not edit by hand. -->

Help the user make a big personal decision (a home, a car, a school or another large choice): frame the decision and its deadline, set weighted criteria, build the options list, model the true cost, gather independent evidence, run a pre-mortem on the risks and compare the options in a weighted matrix. Eight numbered frames, a rubric and a decision memo. orb collects and compares evidence; the user decides, and orb is not a financial, legal or medical adviser.

Template id `personal-decision`. Canvas title: `Decision: {{decision}}`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| The decision (`decision`) | text | yes | placeholder "Buy a two-bedroom flat in Leeds" |
| Kind of decision (`kind`) | select | yes | one of Home, Car, School or course, Moving city, Large purchase, Other |
| Deadline (`deadline`) | text | no | placeholder "Offer by 30 November" |
| Budget (`budget`) | text | yes | placeholder "£280k all in, or £450/month" |
| How you would pay (`financing`) | text | no | placeholder "Mortgage with 15% down; cash; loan" |
| Where (`location`) | text | no | placeholder "Leeds, within 30 minutes of the city centre" |
| Must-haves (`must_haves`) | longtext | yes | placeholder "One per line: e.g. 2 bedrooms; garden; under 40 minutes to work" |
| Nice to have (`nice_to_have`) | longtext | no | placeholder "Optional." |
| Dealbreakers (`dealbreakers`) | longtext | no | placeholder "Anything that rules an option out" |
| Who else is affected (`affected`) | text | no | placeholder "Partner, two children, a parent who visits". orb treats this as private context for the decision and does not research these people. |
| Options you already know (`options`) | list | no | placeholder "Names, links or addresses: comma separated". Optional. Scout finds more that fit. |
| Materials (`materials`) | materials | no | Drop listings, offers, quotes, a brochure, a spreadsheet of your own. Each becomes a card or database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites Zillow, Rightmove, Autotrader, Niche. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. Pick the ones that fit the kind of decision. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, suggest_task_spec, parallel_extract, web_answer, image_search, entity_search, research_memory, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, batch_enrich, suggest_task_spec, parallel_extract, web_answer, image_search, entity_search, research_memory, watch_topic, find_entities_extend | 4 | no limit | full |

- **Quick scan:** No deep research: search, extract and the signed-in fetches ticked, at most 12 cards per frame; the memo is the summary only.
- **Standard:** Quick, plus the options list found with entity discovery and enriched, and one or two deep-research runs (core) on costs and outcomes, asking before spend.
- **Deep:** Standard, plus FindAll for the full options list, pro research on the hardest unknown and the full decision memo.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 THE DECISION (signal; orb)

Brief: What is being decided ({{decision}}), the deadline ({{deadline|none given}}), the budget ({{budget|to confirm}}), what success looks like in five years, who is affected and what they want, and the real alternatives, including doing nothing. One sentence that anyone affected could read and agree with.

Target: 2+ doc (the decision statement and the people affected); 4+ metric; 2+ question.

Seed cards:
- doc: Decision statement
- doc: Scope and limits
- metric: Budget
- metric: Deadline
- metric: Options on the table
- metric: Best score so far
- question: What does a good outcome look like in five years?
- question: Is doing nothing a real option?

### 02 CRITERIA & WEIGHTS (sky; orb)

Brief: The must-haves, nice-to-haves and dealbreakers as one list, each with a weight from 1 to 10 and how it is measured. Must-haves are gates, not weights: an option that misses one is out, or is shown as an exception for you to decide. Weights come from you; orb proposes and asks.

Target: 1+ database (Criteria); 1+ hypothesis.

Seed cards:
- database: Criteria (database `criteria`)
- hypothesis: These are the criteria that matter most

### 03 OPTIONS (rho; scout, critic)

Brief: Every real option with its key facts, price, source and status: the ones you named, and others found with find_entities and enriched into the database. Each row says which must-haves it meets. Keep the list honest: options that fail a dealbreaker stay in the database with the reason, so the choice is visible.

Target: 1+ database (Options: at least 8 rows); 3+ product (the leading options); 4+ source.

Seed cards:
- database: Options (database `options`)
- question: Which option have you not seen that fits?

### 04 TRUE COST (sky; scout, builder, critic)

Brief: The whole cost of each leading option over the holding period: price, financing, taxes, insurance, running costs, maintenance, fees and the cost of exit. Every assumption has a source or is marked as an estimate. The monthly and the five-year total against the budget.

Target: 1+ database (Cost model); 2+ chart (five-year cost by option; cost by category); 1+ math (the formula behind the figure).

Seed cards:
- database: Cost model (database `cost-model`)
- chart: Five-year cost by option (database `cost-model`)
- metric: Monthly cost of the leading option
- metric: Five-year total of the leading option

### 05 EVIDENCE & REVIEWS (rho; scout)

Brief: Independent evidence about the leading options: reviews from owners or residents, reliability and recall data, official statistics (crime, school outcomes, flood risk, commute), inspections, price history, and what experts say. Positive and negative; outsiders’ words, not the seller’s.

Target: 5+ quote (at least 2 negative); 5+ source (official or independent); 1+ timeline (price or event history).

Seed cards:
- timeline: History of the leading option

### 06 RISKS & REGRETS (paper; critic)

Brief: A pre-mortem: assume it is two years later and the decision was a mistake; what happened? Work through the red-flag checklist. Raise each flag as a Risk card with evidence or clear it with a source. Name the professional to ask where it needs one (surveyor, mechanic, adviser, school office). Reversibility and what the exit costs.

Target: 6+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Decision red flags
- risk: Money risk
- risk: Hidden costs risk
- risk: Reversibility risk
- risk: Life fit risk
- risk: Timing risk

### 07 COMPARE & DECIDE (signal; orb, builder)

Brief: The weighted comparison of the options against the criteria, the 2x2 of cost against fit, pros and cons of the top two, the hypotheses with confidence, the rubric scored with cited evidence, and the decision. orb proposes; you choose and the Decision card records it with the reasons.

Target: 2+ matrix (weighted options matrix and the filled rubric); 2+ framework (2x2 and pros and cons); 1+ decision; 2+ hypothesis.

Seed cards:
- matrix: Options against criteria
- framework: Cost against fit
- framework: Top two options: pros and cons
- hypothesis: The leading option is still the best after the pre-mortem
- decision: Decision: {{decision}}
- matrix: Scorecard (rubric score x 2, so 10 is a 5)

### 08 NEXT STEPS & QUESTIONS (paper; orb, critic)

Brief: What to do next, in order: visits and test drives, the questions for the seller, dealer or school, the documents to request, the professionals to ask, the negotiation points, and the date by which you will decide. Every unresolved Question card on the board is collected here.

Target: 2+ checklist (at least 10 ranked actions and questions).

Seed cards:
- checklist: Before you commit
- checklist: Questions to ask

## Databases

### Criteria (frame `criteria`)

Must-haves, nice-to-haves and dealbreakers with a weight and how each is measured.

| Column | Type | Notes |
|---|---|---|
| Criterion | text |  |
| Type | enum (Must-have, Nice to have, Dealbreaker) |  |
| Weight | number | 1 to 10 from you; blank for must-haves and dealbreakers. |
| How measured | text |  |
| Threshold | text | The level that passes. |
| Why it matters | text |  |

Views: By type (board, by Type); All (table, sorted by Weight desc).

### Options (frame `options`)

Every real option with facts, price and status. Found with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Price | currency | Headline price or monthly cost; say which in Key facts. |
| Key facts | text |  |
| Must-haves met | text | Which, and which are missed. |
| Dealbreaker hit | boolean |  |
| Pros | text |  |
| Cons | text |  |
| Score | number | Weighted score 0 to 100 from Compare & decide. |
| Status | enum (Considering, Shortlisted, Visited, Rejected, Chosen) |  |
| Source | url |  |

Views: By score (table, sorted by Score desc); By status (board, by Status); Gallery (gallery); Still in (table, filtered).

### Cost model (frame `cost`)

One row per cost item per option, with its basis and source, so totals can be checked.

| Column | Type | Notes |
|---|---|---|
| Option and item | text |  |
| Option | text |  |
| Item | enum (Price, Financing, Taxes, Insurance, Running costs, Maintenance, Fees, Exit, Other) |  |
| One-time | currency |  |
| Per month | currency |  |
| Years held | number |  |
| Total over 5 years | currency | One-time plus 60 months, or per the years held. |
| Basis | enum (Quote, Official, Estimate, Your figure) |  |
| Source | url |  |

Views: By option (table, by Option); By item (board, by Item); Estimates (table, filtered).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first (listings, offers, quotes, brochures, your own spreadsheet): read_card, read_source and query_dataset. Turn the must-haves, nice-to-haves and dealbreakers from the intake into rows in Criteria (upsert_rows, key Criterion), propose a weight from 1 to 10 for each nice-to-have and ask the user to confirm them with ask_user_question. Put each option from the intake or the materials into Options. Hand the budget, the kind of decision and the ticked sources to Scout. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`, `ask_user_question`.
2. Delegate with delegate: Scout first, Builder once Options and Cost model have rows, Critic once Scout has sources. Tell each agent that this is the user’s own decision: evidence and comparison, never advice from a professional. Tools: `delegate`, `message_agent`.
3. After Scout’s first pass, write the Decision statement as one sentence, fill the metrics with cited figures and keep “Options on the table” current. Collect the people affected from the intake as private context; do not research them. Tools: `query_board`, `search_board`, `update_card`, `query_dataset`.
4. For a gap Scout could not close (a cost, a rule, an outcome statistic), run deep_research (core) on that one question. Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
5. Fill the options-against-criteria matrix (rename Option A to C to the real options; 0 to 10 per criterion from Options and Cost model, each cited). Write the weighted score into the Score column of the options you wrote or ask Scout to. Then the Scorecard rubric (one 1-to-5 score per dimension, doubled on the matrix, each cited), the hypotheses, the pros and cons of the top two and the Decision card with your proposal and the weighted total. The user decides. Tools: `query_board`, `query_dataset`, `read_card`, `update_card`, `place_card`, `add_link`.
6. Write the decision memo with compose_section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. The deck follows with compose_slides if asked. Tools: `compose_section`, `compose_slides`.
7. Keep “Next steps & questions” current: collect every unresolved Question card, ranked, each linked to its source card, and name the professionals to ask. Tools: `search_board`, `update_card`, `add_link`.
8. Only when the user asks to watch a market (price drops, new listings, recalls, rule changes): watch_topic with the query below. Each monitor is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. Work out what kind of decision this is from the intake and list the sources it needs before you start: a home (listing portals, sale history, council or tax records, flood and crime data, schools, commute), a car (listings, recalls, reliability surveys, insurance groups, running costs, depreciation), a school or course (official outcomes data, fees, aid, reviews from students, visit days), a move (cost of living, rent, jobs, climate), a large purchase (reviews, warranty, total cost). Say the list in report_progress. Tools: `report_progress`, `web_search`, `web_answer`.
2. Options: add the options named in the intake first (fetch_url, parallel_extract). find_entities discovers more that meet the must-haves; batch_enrich fills the Options columns. Consolidate into Options with upsert_rows (key Name) with a Source on every row and Dealbreaker hit set honestly; keep rejected ones with the reason. Product cards for the leading three. On the Quick tier, add rows from web_search instead. Tools: `find_entities`, `batch_enrich`, `web_search`, `fetch_url`, `parallel_extract`, `fetch_signed_in`, `query_dataset`, `upsert_rows`, `place_card`.
3. True cost: for each leading option, one row per cost item in Cost model (upsert_rows, key “Option and item”): price, financing from a quoted rate (a rate is Basis Quote only when it comes from a lender or an offer), taxes, insurance, running costs, maintenance, fees and the cost of exit. Official sources first; mark estimates. Metrics for the monthly and the five-year total. Tools: `web_search`, `fetch_url`, `parallel_extract`, `upsert_rows`, `place_card`, `query_dataset`.
4. Evidence: reviews from owners, residents or students (quote cards: at least two negative), official statistics, inspection or recall data and price history on the History timeline. Video cards for a walkthrough or review, linked not embedded. Images and screenshots with capture_page for what the user will want to see again. Tools: `web_search`, `fetch_url`, `capture_page`, `place_card`, `image_search`.
5. Only for sites the user ticked and connected: saved searches, price history or reports the user can already see (fetch_signed_in, read-only). Never log in on the user’s behalf, never submit anything. Tools: `fetch_signed_in`.
6. Deep research for the gaps that remain: deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout’s first sources: read the cards of every frame (board_map, search_board, read_card) and the Criteria, Options and Cost model rows (query_dataset) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`, `query_dataset`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links, or an Insight card titled "RFxx cleared: ..." citing the source cards that clear it (an insight needs at least two cited cards). Name the professional to ask where a flag needs one. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. The pre-mortem: for each of the top two options, a Hypothesis card “Two years on, this was a mistake because...” with the three likeliest causes, each linked to the evidence cards. Then a Question for each cause the user can still test before committing. Tools: `place_card`, `add_link`, `query_board`.
4. Challenge every figure with a single source or a seller’s source: link tension to the card that disagrees or place a Question for the second source. Check every dealbreaker against the options. Tools: `query_dataset`, `query_board`, `read_card`, `add_link`, `place_card`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming the flags raised. Tools: `report_progress`, `send_message`.

### Builder

1. The cost charts: five-year cost by option (bar) and cost by category (stacked or bar), bound to Cost model; compute the totals with query_dataset and write them into the Total over 5 years column of the rows you wrote. Tools: `place_card`, `query_dataset`, `upsert_rows`.
2. The formula behind each key figure (a loan payment, a total cost of ownership, a break-even) as a math card with its inputs and the cell it feeds. Tools: `place_card`, `query_dataset`, `read_card`.
3. The cost-against-fit 2x2 and the pros and cons of the top two options, built from the Options and Cost model rows. Tools: `place_card`, `query_dataset`, `read_card`.
4. Optional one-page visual summary (a design frame): the decision, the top options with their five-year cost and score, the main risks and the next three steps, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. The comparison rests on one source or the seller’s own claims. *How:* For each top option, find at least one independent source (inspection, history report, official statistics, reviews from outsiders).
2. A recurring or hidden cost is missing from the cost model (insurance, taxes, maintenance, fees, interest, parking, tuition increases). *How:* Compare the Cost model rows with the category list for this kind of decision; each missing category is raised.
3. Artificial urgency: “only today”, an exploding offer, a deadline you cannot verify. *How:* Check the deadline in the source; separate the real deadline from the pressure.
4. A dealbreaker is present in an option that is still ranked high. *How:* Compare each option’s row with the dealbreakers in Criteria; any hit removes it or is raised as an exception for the user.
5. The financing, loan or aid assumptions are not sourced (rate, term, fees, eligibility). *How:* Each assumption has a source row in Cost model; a rate that is not a quote is marked as an estimate.
6. The decision is hard to reverse and no exit has been priced. *How:* Find the exit: resale cost or time, transfer rules, contract terms. Put it in Cost model.
7. Anchoring: the first option seen is the benchmark for all others. *How:* Check that the weighted matrix was filled before the favourite was named; ask for one option the user has not considered.
8. Sunk cost: past spending or effort is driving the choice. *How:* Look for reasoning that cites what has already been spent; reframe to what happens from here.
9. People affected by the decision have not been asked. *How:* The Affected people list in the Decision frame has an entry for each person; unanswered ones become questions.
10. Safety, legal or health issues that need a professional (structure, recalls, contracts, regulations). *How:* Raise it as a Risk with the professional to ask; orb does not give professional advice.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Total cost | 25% | Over budget or costs that are not known yet. | Within budget with a margin of safety. | Comfortably within budget over the whole holding period, all costs known. | cost |
| Fit to your must-haves | 25% | Misses a must-have. | Meets the must-haves and some nice-to-haves. | Meets every must-have and most nice-to-haves. | criteria |
| Risk and reversibility | 20% | Hard to undo and an open serious risk. | Risks are known and bounded; some cost to undo. | Low risk and easy to reverse if it goes wrong. | risks |
| Long-term value | 20% | Loses value or options over time. | Holds its value and options. | Gains in value, options or opportunity over time. | evidence |
| Life fit | 10% | Works against how you live or who it affects. | Works with a few adjustments. | Fits how you want to live, and everyone affected is on board. | evidence |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Decision memo: {{decision}}. Every paragraph cites cards; every cost and statistic cites its source; estimates and quotes are marked as such. The memo says what is not known and what orb is not.

1. Summary & recommendation (at most 150 words): The proposed choice, the score, the three reasons and the three risks, in at most 150 words, and that the user decides.
2. The decision and what matters: The decision statement, the deadline, the budget and the weighted criteria.
3. The options: The options still in the running with key facts, and why the others were dropped.
4. True cost: The five-year cost by option, assumptions marked quote or estimate, against the budget.
5. Evidence: What independent sources and reviewers say about the leading options, positive and negative.
6. Risks & regrets: The pre-mortem and the red-flag outcomes, with the professional to ask for each.
7. The comparison: The weighted matrix, the 2x2 and pros and cons of the top two.
8. Scorecard: The rubric table: each dimension, weight, score and evidence.
9. Next steps: The ranked actions and questions, the professionals to ask and the date to decide.

Appendix: All sources.

One-page summary: The decision and deadline, Top options and five-year cost, Score, Top risks, Next steps.

Deck format: `standard`.

## Follow-up chips

Shown after the first pass.

- What would change my mind?: What evidence would change the proposed choice for {{decision}}? List the three things to check before committing.
- Stress-test the cost: Stress-test the cost of the leading option for {{decision}}: rates up two points, income down 10 percent, a big repair. Show the effect on the five-year total.
- Add an option: Add [an option] to {{decision}}: research it like the others, fill the Options and Cost model rows and re-score.
- Questions for the visit: Draft the questions to ask at the visit or test drive for the top two options, tied to the risks on the board.
- Change a weight: I care more about [a criterion]. Change its weight, re-score and tell me which option moves.
- Watch the market: Watch for new options and price changes for {{decision}} and tell me what changes the ranking.

## Signed-in sources

- Zillow (zillow.com): Saved homes, price history and neighbourhood data, as visible to the user.
- Rightmove (rightmove.co.uk): Saved properties and sold-price history, as visible to the user.
- Autotrader (autotrader.com): Saved cars and listing history, as visible to the user.
- Niche (niche.com): Detailed school and neighbourhood reviews and data.

## Monitor

Only when the user asks: `{{decision}} new listings, price changes, recalls, rule changes and rates`. New options or changes that would move the ranking.
