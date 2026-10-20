# Feature PRD research

<!-- Generated from packages/shared/src/templates/feature-prd.ts by `pnpm templates:docs`. Do not edit by hand. -->

Research a feature and write its product requirements document: the problem and who has it, the evidence from users and data, the jobs to be done, how other products solve it, the solution options with their trade-offs and a priority score, the requirements with acceptance criteria and what is out of scope, the success metrics, the technical dependencies, the risks, and a recommendation. Start from evidence of the problem, not from the solution, and cite every claim.

Template id `feature-prd`. Canvas title: `{{feature}}: feature PRD`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Feature or problem (`feature`) | text | yes | placeholder "Bulk editing of tasks" |
| Product (`product`) | text | no | placeholder "Acme Tasks" |
| Product website (`website`) | url | no | placeholder "https://acme.com" |
| Who it is for (`users`) | longtext | no | placeholder "Team leads who manage more than 50 open tasks" |
| The problem as you understand it (`problem`) | longtext | no | placeholder "Editing many tasks one by one takes too long" |
| Goal or metric it should move (`goal`) | text | no | placeholder "Weekly active team leads" |
| Constraints (`constraints`) | longtext | no | placeholder "One engineer for six weeks; must work on mobile; no new data storage" |
| Where you are (`stage`) | select | no | one of Exploring the problem, Comparing options, Scoping, Spec ready for review |
| Products to learn from (`competitors`) | list | no | placeholder "Comma separated". Optional. Scout finds more. |
| Materials (`materials`) | materials | no | Drop customer feedback, support tickets or survey exports (CSV or XLSX), interview notes, analytics exports, design mocks and any existing spec. Each becomes a card or database; feedback tables are read as evidence. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites G2, LinkedIn, Crunchbase. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** Evidence from the materials and a quick public search: no deep research, at most 12 cards per frame, three options and the memo is the summary only.
- **Standard:** Quick, plus find_entities and batch_enrich for how others solve it, the requirements and metrics databases, and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra research on the category and feasibility, more options and the full PRD memo and deck.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 PROBLEM STATEMENT (signal; orb)

Brief: The problem in one paragraph: who has it, when, how often, what it costs them and what happens today. The user problem as given: {{problem|not given}}. For: {{users|to confirm}}. Goal: {{goal|to confirm}}. Constraints: {{constraints|none given}}. Write the problem without naming the solution.

Target: 1+ doc (the problem statement); 4+ metric; 3+ hypothesis (with evidence links).

Seed cards:
- doc: Problem statement
- metric: Users affected
- metric: Frequency
- metric: Cost of the problem
- metric: Requests
- hypothesis: The problem is real and frequent for {{product|our users}}
- hypothesis: Users work around it today
- hypothesis: Solving it moves {{goal|the goal metric}}
- question: What happens if we do nothing?

### 02 USER EVIDENCE (sky; scout, orb)

Brief: What users say and do: feedback tickets, interview quotes, reviews, forum posts, sales-call notes and analytics about this problem, each a row in Feedback evidence with its source type, segment, theme and intensity. Quote users exactly. Count distinct users, not mentions. Include evidence against the need.

Target: 1+ database (Feedback evidence, at least 20 rows); 10+ quote (at least 2 that disagree); 1+ chart (evidence by theme).

Seed cards:
- database: Feedback evidence (database `feedback`)
- chart: Evidence by theme (database `feedback`)

### 03 JOBS TO BE DONE & USERS (rho; scout, builder)

Brief: What users are trying to get done and the situation they are in: job stories ("When ... I want to ... so I can ..."), the segments and one persona per distinct segment, grounded in the evidence. The users: {{users|to confirm}}.

Target: 1+ checklist (job stories); 2+ entity (personas, kind person); 3+ quote.

Seed cards:
- checklist: Job stories
- question: Which segment feels this most, and which should we ignore for now?

### 04 HOW OTHERS SOLVE IT (sky; scout, builder)

Brief: How competitors and adjacent products solve the problem: the approach, the packaging and price, strengths and weaknesses, with screenshots. What is table stakes and what could differentiate {{product|our product}}.

Target: 1+ database (Competitor approaches, at least 6 rows); 3+ product (kind competitor); 3+ image (how they do it); 1+ matrix.

Seed cards:
- database: Competitor approaches (database `approaches`)
- matrix: Approach comparison

### 05 SOLUTION OPTIONS (rho; builder, orb)

Brief: Two to five ways to solve the problem, from a small change to a full feature: for each the user value, reach, effort, risk and confidence, and how it compares. Sketch the leading option. Effort estimates not confirmed by engineering are marked.

Target: 1+ database (Options, 2 to 5 rows); 1+ framework (impact by effort 2x2); 1+ design (a sketch of the leading option).

Seed cards:
- database: Options (database `options`)
- framework: Options: impact by effort

### 06 PRIORITISATION (sky; orb, builder)

Brief: Rank the options with a transparent score (reach, impact, confidence and effort) and a weighted comparison of the criteria that matter for {{goal|the goal}}; show the formula and mark confidence honestly.

Target: 1+ matrix (options on weighted criteria); 1+ math (the score formula); 1+ chart (option scores).

Seed cards:
- math: The priority score
- chart: Priority score by option (database `options`)
- matrix: Option ranking

### 07 REQUIREMENTS (rho; orb, builder)

Brief: The requirements for the chosen option: functional and non-functional, constraints, and an explicit list of what is out of scope. Each has a priority (must, should, could, won't), the evidence it comes from and an acceptance criterion a tester can check. Constraints: {{constraints|none given}}.

Target: 1+ database (Requirements, at least 12 rows including out of scope); 1+ checklist (definition of done).

Seed cards:
- database: Requirements (database `requirements`)
- checklist: Definition of done

### 08 SUCCESS METRICS (sky; orb, builder)

Brief: How we will know it worked: the primary metric tied to {{goal|the goal}}, supporting and guardrail metrics, each with a definition, a baseline (or how to get one), a target and how it is measured.

Target: 1+ database (Metrics plan); 3+ metric (baseline and target).

Seed cards:
- database: Metrics plan (database `metrics`)
- metric: Primary metric target
- metric: Adoption target
- metric: Guardrail

### 09 TECHNICAL & DEPENDENCIES (rho; scout, critic)

Brief: What it would take: the platform and API limits, data and privacy implications, the teams and vendors it depends on, and how similar products built it where that is public. Engineering confirms estimates; this frame holds what can be found without private systems.

Target: 1+ database (Dependencies); 3+ source.

Seed cards:
- database: Dependencies (database `dependencies`)
- question: Which part of this is hardest to build, and who can say?

### 10 RISKS & OPEN QUESTIONS (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence or clear it with a source. Every gap becomes a Question for the product, design or engineering owner, ranked.

Target: 5+ risk (every checklist item cleared with a source or raised); 5+ question.

Seed cards:
- checklist: Red-flag checklist
- risk: Evidence risk
- risk: Scope risk
- risk: Dependency risk
- risk: Adoption risk

### 11 RECOMMENDATION & PRD (signal; orb)

Brief: What to do: build, build smaller, validate first or do not build, with the reasons and the conditions. Score the opportunity against the rubric with cited evidence. The PRD is composed from the frames of this canvas.

Target: 1+ decision; 1+ matrix (the filled rubric); 1+ framework (SWOT); 3+ insight.

Seed cards:
- decision: What should we do about {{feature}}?
- framework: SWOT: {{feature}}
- matrix: Opportunity score (rubric score x 2, so 10 is a 5)
- checklist: Rollout plan

## Databases

### Feedback evidence (frame `evidence`)

Every piece of user evidence about the problem, with its source and strength.

| Column | Type | Notes |
|---|---|---|
| Evidence | text | Verbatim where possible. |
| Source type | enum (Interview, Support ticket, Review, Forum, Sales call, Survey, Analytics) |  |
| User | text | An id or a role; no private details. |
| Segment | text |  |
| Theme | text |  |
| Intensity | rating | 1 (mild) to 5 (urgent). |
| For or against | enum (For, Against, Neutral) |  |
| Date | date |  |
| Link | url |  |

Views: All (table, sorted by Intensity desc); By source (board, by Source type); Against (table, filtered).

### Competitor approaches (frame `market`)

How each other product solves the problem. Discovered with find_entities and enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Product | text |  |
| URL | url |  |
| How it solves it | text |  |
| Packaging | text | Which plan includes it; free or paid. |
| Strength | text |  |
| Weakness | text |  |
| Table stakes | boolean |  |
| Source | url |  |

Views: All (table); Table stakes (table, filtered).

### Options (frame `options`)

Candidate solutions with the inputs of the priority score.

| Column | Type | Notes |
|---|---|---|
| Option | text |  |
| Description | text |  |
| Reach per quarter | number | Users. |
| Impact | number | 0.25 minimal, 0.5 low, 1 medium, 2 high, 3 massive. |
| Confidence | number | 0 to 1. |
| Effort (person-weeks) | number |  |
| Effort confirmed | boolean | Engineering has confirmed the estimate. |
| RICE score | number | Reach times impact times confidence, over effort. |
| Main risk | text |  |

Views: By score (table, sorted by RICE score desc); Unconfirmed effort (table, filtered).

### Requirements (frame `requirements`)

Every requirement, and what is out of scope, each with its evidence and acceptance criterion.

| Column | Type | Notes |
|---|---|---|
| ID | text | R-01, R-02 ... |
| Type | enum (Functional, Non-functional, Constraint, Out of scope) |  |
| Requirement | text | As a user story or a plain statement. |
| Priority | enum (Must, Should, Could, Won't) |  |
| Evidence | text | The evidence row or card it comes from. |
| Acceptance criteria | text | A check a tester can run. |
| Status | enum (Proposed, Agreed, Dropped) |  |

Views: All (table, sorted by ID asc); By priority (board, by Priority); Out of scope (table, filtered).

### Metrics plan (frame `success`)

The metrics that say whether the feature worked, with definition, baseline and target.

| Column | Type | Notes |
|---|---|---|
| Metric | text |  |
| Role | enum (Primary, Supporting, Guardrail) |  |
| Definition | text |  |
| Baseline | number |  |
| Target | number |  |
| Unit | text |  |
| How measured | text |  |
| Basis | enum (Measured, Estimated) |  |

Views: All (table); By role (board, by Role).

### Dependencies (frame `tech`)

Everything the feature depends on, with an owner and a status.

| Column | Type | Notes |
|---|---|---|
| Dependency | text |  |
| Type | enum (Team, Third-party API, Platform limit, Data, Legal or compliance, Design) |  |
| Owner | person |  |
| Risk | rating | 1 (low) to 5 (high). |
| Status | enum (Unknown, Confirmed, Blocked, Done) |  |
| Note | text |  |
| Source | url |  |

Views: By risk (table, sorted by Risk desc); By status (board, by Status).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read what the user dropped first: feedback exports, tickets, interview notes, analytics, mocks and any existing spec (board_map, read_card, read_source, query_dataset). Each dropped feedback item that bears on the problem becomes a Feedback evidence row (upsert_rows, key Evidence) with the source type and For or Against. Hand the problem, the users and the products to learn from to Scout in the delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (evidence, how others solve it, technical signals), Builder once Scout has evidence and approaches, Critic once Scout has sources to review. Name the frames each agent owns, and hand over the intake facts (names, links, concerns) in the instruction. Tools: `delegate`, `message_agent`.
3. Write the problem statement from the evidence without naming the solution (update_card on the doc), and fill the four problem metrics with a cited figure each. Count distinct users, not mentions (query_dataset). Tools: `query_dataset`, `update_card`, `query_board`, `search_board`.
4. Score the options: for each Options row you wrote or for Builder's, compute the RICE score from its inputs (query_dataset) and write it back where you own the row; ask engineering through ask_user_question for any effort that is not confirmed. Tools: `query_dataset`, `upsert_rows`, `ask_user_question`, `update_card`.
5. Write the requirements for the leading option: 12 or more Requirements rows (upsert_rows, key ID), each with type, priority, the evidence it comes from and an acceptance criterion; include an Out of scope row for everything you chose not to do. Fill the Metrics plan with a baseline or the way to get one. Tools: `upsert_rows`, `query_dataset`, `read_card`, `place_card`.
6. For a gap Scout could not close (how others built it, the size of the segment), run deep_research (core) on that one question. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
7. Fill the Opportunity score matrix: one 1-to-5 score per rubric dimension (doubled), each with a cited card. Then the SWOT, the hypotheses (evidence for and against as card ids), the Decision with the weighted total in the rationale, and the rollout checklist. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
8. Write the memo with compose_section, section by section in the order of the memo outline, then the one-page summary. On the Quick tier write the summary only. When the user asks for slides, compose_slides with the deck outline. Tools: `compose_section`, `compose_slides`.
9. Only when the user asks to keep watching: watch_topic with the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. User evidence beyond what the user dropped: reviews, forums, Reddit, public issue trackers and community posts about the problem (web_search, fetch_url; G2 only via fetch_signed_in if ticked). Quote cards, verbatim; one Feedback evidence row each (upsert_rows, key Evidence) with source type, segment, theme, intensity and For or Against. Keep evidence against the need. Tools: `web_search`, `fetch_url`, `fetch_signed_in`, `place_card`, `upsert_rows`, `query_dataset`.
2. Jobs and users: propose job stories from the evidence in the Job stories checklist (place a Checklist card; the user ticks), and one persona (entity card, kind person) per distinct segment, grounded only in the evidence. Tools: `query_dataset`, `read_card`, `place_card`.
3. How others solve it: the products the user named, then find_entities and batch_enrich (how it solves it, packaging, strength, weakness) for similar products; consolidate into Competitor approaches (upsert_rows, key Product) with a Source url. A Product card (kind competitor) and a capture_page screenshot for the best three. Quick scan: find_entities is refused; read the named ones. Tools: `find_entities`, `batch_enrich`, `fetch_url`, `capture_page`, `place_card`, `upsert_rows`, `query_dataset`.
4. Technical and dependency signals from public sources: API and platform limits, privacy and legal notes, how similar products built it (engineering blogs, docs). A Source card per fact; one Dependencies row each (upsert_rows, key Dependency) with a Source url. Never claim to know private systems. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`, `upsert_rows`.
5. Size the segment: how many users or accounts have the problem, from public data or the materials; a metric card with its source. Ask orb through send_message for the product's own numbers. Tools: `web_search`, `web_answer`, `place_card`, `send_message`.
6. Deep research for the gaps that remain: deep_research (core or above, per the tier), for example how the category solved this problem. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge every claim resting on one user or one source, and every effort estimate not confirmed: link it "tension" to the card that disagrees, or place a Question for the owner (product, design or engineering). Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Turn every gap into a Question card (ranked by importance, each linked to the gap or risk that prompted it): what to ask engineering, design, legal and the users. Tools: `place_card`, `add_link`, `query_board`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. The approach comparison matrix (weighted criteria, scores 0 to 10 from Competitor approaches, the note naming the rows used) and the table-stakes list (mark the Table stakes column on rows you wrote). Tools: `place_card`, `query_dataset`, `upsert_rows`, `read_card`.
2. The options: two to five Options rows (upsert_rows, key Option) with reach, impact, confidence and effort (Effort confirmed false until engineering says), and the impact by effort 2x2 (framework, quadrant). A sketch of the leading option as a design frame (write_design_frame). Tools: `upsert_rows`, `place_card`, `write_design_frame`, `query_dataset`, `read_card`.
3. The priority: the Option ranking matrix (scores 0 to 10, the note naming the evidence), the RICE chart bound to Options and the formula card with the inputs. Tools: `place_card`, `query_dataset`, `read_card`.
4. The Metrics plan: a primary, two supporting and one guardrail metric (upsert_rows, key Metric) each with definition, baseline (or Estimated), target and how it is measured. Add Requirements rows of type Non-functional that the metrics need (analytics events). Tools: `upsert_rows`, `query_dataset`, `place_card`.
5. Persona one-pagers as design frames (write_design_frame), using only quotes and facts on the board; check each job story against the evidence. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`, `place_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. The feature starts from a solution, with no evidence of the problem. *How:* Check the Evidence frame for quotes and rows that describe the problem rather than ask for the feature.
2. The evidence is fewer than five users or one source. *How:* Count distinct users and sources in Feedback evidence; fewer than five users or a single source is raised.
3. The loudest customers drive the case, not the target segment. *How:* Compare the segment of the evidence rows with the segment the feature is for; raise a mismatch.
4. There is no success metric, baseline or guardrail. *How:* Read the Metrics plan database: each metric needs a definition, a baseline or a way to get one, and a target.
5. Scope has no out-of-scope list. *How:* Check the Requirements database for rows of type Out of scope; none is raised.
6. Requirements have no acceptance criteria. *How:* Check that each Must requirement has an acceptance criterion that a tester could check.
7. A dependency on another team or a third party has no owner or date. *How:* Read the Dependencies database for rows with no owner, an unknown status or a high risk.
8. The effort estimate has no engineering input. *How:* Check the Options effort values: an estimate made by the agents alone is marked Unconfirmed and a Question asks engineering.
9. Privacy, security, accessibility or legal impact is not assessed. *How:* Look in Technical and Dependencies for a data, privacy or compliance note; none is raised.
10. The feature cannibalises or conflicts with a core use or revenue line. *How:* Compare the feature with the pricing and packaging in the sources and the competitor approaches.
11. Parity with a competitor is the only reason. *How:* Check whether any evidence from users supports the feature apart from the fact that a competitor has it.
12. There is no rollout or rollback plan. *How:* Check the Rollout checklist for a phased release, a flag or a way back.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Evidence of need | 25% | One request or an opinion. | Several users in more than one source. | Many users, several sources, and behaviour data. | evidence |
| Reach and frequency | 20% | A few users, rarely. | A real segment, monthly. | Most active users, weekly or more. | problem |
| Strategic fit | 15% | Off-strategy. | Supports a goal indirectly. | Moves a top company goal directly. | problem |
| Feasibility | 15% | Needs new technology or an unavailable dependency. | Doable with known work and one dependency. | Small, well understood and independent. | tech |
| Differentiation | 10% | Parity with everyone. | Better than most. | Something no competitor does well. | market |
| Measurability | 15% | No way to tell if it worked. | A metric with an estimate of the baseline. | A metric with a baseline, target and guardrail. | success |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Product requirements: {{feature}}. Every paragraph cites cards; every requirement names the evidence it comes from; user counts are of people, not mentions; unconfirmed estimates are marked.

1. Summary & recommendation (at most 150 words): The recommendation, the three strongest reasons and the three open risks, in at most 150 words.
2. Problem and goals: The problem statement, who has it, the goal and the constraints.
3. Evidence: What users say and do, by theme and source, the job stories, and the evidence against.
4. How others solve it: The approaches, what is table stakes and what could differentiate.
5. Options and trade-offs: The options with effort, impact and score, and why the leading one leads.
6. Requirements: The requirements table by priority with acceptance criteria, and the out-of-scope list.
7. Success metrics: The metrics plan: baseline, target and guardrail for each.
8. Technical considerations and dependencies: The dependencies with owner and risk, and what engineering still has to confirm.
9. Rollout: The staged rollout, the flag and the way back.
10. Risks and open questions: The red-flag outcomes, each raised flag with its mitigant, and the ranked open questions.
11. Scorecard: The rubric table: each dimension, its weight, its score and its evidence.

Appendix: All sources and the evidence table.

One-page summary: Problem, Recommendation, Requirements, Metrics, Top risks.

Deck format: `standard`.

Deck: Feature review: {{feature}}. Slides, in order:

1. The recommendation: What to do and the three reasons.
2. The problem: Who has it, how often and what it costs.
3. What users say: Themes with quotes and the evidence against.
4. Jobs to be done: The job stories and the target segment.
5. How others solve it: The approach comparison matrix.
6. Options: The options with the impact by effort 2x2.
7. The leading option: The sketch and the key requirements.
8. Success metrics: Primary, supporting and guardrail metrics with targets.
9. Dependencies and risks: Dependencies with owners and the raised flags.
10. Rollout and next steps: The staged rollout and the open questions.

## Follow-up chips

Shown after the first pass.

- Write the user stories: Write the user stories for the Must requirements, each with its acceptance criteria and the evidence it comes from.
- Cut the scope: Cut the scope to what one engineer can do in [six] weeks: which requirements stay, which move to out of scope and why.
- Add the new feedback: I added new feedback. Log it as evidence, update the counts and tell me whether the recommendation changes.
- Draft the launch note: Draft the launch note and the support FAQ for {{feature}} from the requirements.
- Build the case against: Build the strongest case against building {{feature}} now, from the evidence and the dependencies on this board.
- Prep the review meeting: Prepare the review meeting: the five questions the reviewers will ask and the card that answers each.

## Signed-in sources

- G2 (g2.com): Reviews that mention the problem and the competitors' approach.
- LinkedIn (linkedin.com): Public posts and discussions by people with the problem.
- Crunchbase (crunchbase.com): Funding and focus of the products that solve it.

## Monitor

Only when the user asks: `{{feature}} problem space: complaints, new competitor launches and platform changes`. New evidence that would change the recommendation.
