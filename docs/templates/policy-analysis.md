# Policy & regulation

<!-- Generated from packages/shared/src/templates/policy-analysis.ts by `pnpm templates:docs`. Do not edit by hand. -->

Analyse a policy, law or regulation: a snapshot, the provisions clause by clause with obligations and penalties, the legislative history, the stakeholders and their positions, the evidence on impact, comparable jurisdictions, compliance and implementation, legal risks, and options with a recommendation. Quote the text, cite every claim about effects, separate what the law says from what people say about it, and state that this is research, not legal advice.

Template id `policy-analysis`. Canvas title: `Policy analysis: {{policy}}`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Policy, law or regulation (`policy`) | text | yes | placeholder "EU AI Act" |
| Jurisdiction (`jurisdiction`) | text | yes | placeholder "European Union" |
| Type (`policy_type`) | select | no | one of Statute, Bill, Regulation, Executive order, Court ruling, Treaty, Guidance, Standard |
| Status (`status`) | select | no | one of Proposed, Passed, not in force, In force, Amended, Repealed, Contested in court |
| Effective date (`effective`) | text | no | placeholder "2026-08-01" |
| Whose perspective (`perspective`) | select | no | one of Neutral analyst, Company affected, Regulator or government, Advocacy group, Investor, Researcher. Changes the recommendation, not the facts. |
| Your question (`question`) | longtext | no | placeholder "Does this apply to us? What would it cost to comply?" |
| Sector affected (`sector`) | text | no | placeholder "Health care" |
| Comparable jurisdictions (`comparables`) | list | no | placeholder "Comma separated". Optional. Scout finds more. |
| Stakeholders to cover (`stakeholders`) | list | no | placeholder "Comma separated". Optional. |
| Materials (`materials`) | materials | no | Drop the text of the law (PDF), the impact assessment, comment letters or your notes. Each becomes a card. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites Westlaw, LexisNexis, Bloomberg Law, Policy Commons. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** No deep research: the text, search, extract and signed-in fetches only, at most 12 cards per frame, and the brief is the summary only.
- **Standard:** Quick, plus stakeholder and comparable discovery with find_entities, batch enrichment and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on impact and legal questions, FindAll extension for a complete stakeholder and comparables list and the full brief.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 POLICY SNAPSHOT (signal; orb)

Brief: What the policy is in plain words: its stated goal, the authority that made it, the jurisdiction, its type and status, the date it takes effect, who it applies to, the main obligation and the penalty for breach.

Target: 1+ entity (the policy or its issuing body); 4+ metric; 1+ doc (the plain-language summary).

Seed cards:
- entity: {{policy}}
- doc: In plain words
- metric: Applies to
- metric: Effective date
- metric: Maximum penalty
- metric: Enforcing body

### 02 TEXT & PROVISIONS (sky; scout, builder)

Brief: The text itself, read closely: one row per operative provision with the section, the obligation, who holds it, the penalty, the effective date and the exact quote. Definitions, exemptions and thresholds are provisions too. Quote the text; never paraphrase a number or a deadline.

Target: 1+ database (the Provisions database, one row per operative section); 5+ quote (exact text with the section number); 1+ diagram (who must do what, to whom).

Seed cards:
- database: Provisions (database `provisions`)
- question: What does the text leave undefined?

### 03 HISTORY & TIMELINE (rho; scout)

Brief: How the policy came to be and what happens next: the problem that prompted it, the drafts, the consultation, the votes, amendments, the effective dates, the court dates and the deadlines still to come.

Target: 1+ timeline (drafts, votes, effective and upcoming dates); 4+ source (official records first).

Seed cards:
- timeline: Timeline
- question: What happens next, and when?

### 04 STAKEHOLDERS & POSITIONS (sky; scout, critic)

Brief: Who gains, who pays and who decides: the regulator, the regulated, advocacy groups, trade associations, legislators and affected people, each with their position and the strongest argument they make, in their own words where possible. Note who has the power to change the outcome.

Target: 1+ database (Stakeholders, at least 10); 4+ quote (positions in their own words, at least 1 opposing); 1+ matrix.

Seed cards:
- database: Stakeholders (database `stakeholders`)
- matrix: Stakeholder map
- framework: Support and opposition

### 05 EVIDENCE & IMPACT (rho; scout, builder, critic)

Brief: What the policy is expected to do and what it did: the official impact assessment, independent studies, early results, cost and benefit estimates and who bears them. Mark each source as official, independent or interested, and every number with its basis (estimate, observed).

Target: 1+ database (Impact evidence); 2+ chart (estimated impact by group, cost by source); 3+ metric; 1+ insight.

Seed cards:
- database: Impact evidence (database `impact`)
- chart: Impact by direction (database `impact`)
- metric: Estimated cost
- metric: Estimated benefit
- hypothesis: The policy achieves its stated goal

### 06 COMPARABLE JURISDICTIONS (sky; scout, builder)

Brief: The same or similar policies elsewhere and what happened: jurisdiction, year, design differences, outcome and lessons, with the closest analogues first. Say how comparable each case really is.

Target: 1+ database (Comparable policies, at least 5); 1+ matrix (design differences); 1+ chart.

Seed cards:
- database: Comparable policies (database `comparables`)
- matrix: Design comparison
- chart: Comparable outcomes (database `comparables`)

### 07 COMPLIANCE & IMPLEMENTATION (rho; scout, builder)

Brief: What it takes to comply and to run: the steps, the owners, the deadlines, the cost and the capacity needed, the guidance issued, the enforcement record so far and the practical questions an affected party would ask.

Target: 1+ checklist (the compliance steps in order); 1+ timeline (deadlines); 1+ diagram (the compliance flow).

Seed cards:
- checklist: Compliance steps
- timeline: Compliance deadlines

### 08 LEGAL RISKS & CHALLENGES (paper; critic, scout)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Also covers litigation and court rulings, constitutional or pre-emption questions, conflicts with other law and how courts have read similar texts. This is research, not legal advice.

Target: 6+ risk (every checklist item cleared with a source or raised); 1+ database (Cases).

Seed cards:
- checklist: Red-flag checklist
- database: Cases (database `cases`)
- risk: Legal risk
- risk: Implementation risk
- risk: Political risk
- risk: Unintended effects risk

### 09 OPTIONS & RECOMMENDATION (signal; orb, builder)

Brief: The choices open to the reader, such as comply, lobby, challenge, adapt or wait; each option with its cost, risk and benefit; the policy scored against the rubric; and a recommendation from the chosen perspective that states what would change it.

Target: 1+ framework (pros and cons of the main option); 1+ decision; 1+ matrix (the filled rubric); 2+ hypothesis.

Seed cards:
- hypothesis: Your question: {{question|the effect of this policy}}
- framework: {{policy}}: pros and cons
- matrix: Policy scorecard (rubric score x 2, so 10 is a 5)
- decision: Recommended response to {{policy}}

### 10 OPEN QUESTIONS (paper; critic, orb)

Brief: What is still unknown, ranked by importance, each linked to the gap that prompted it: ambiguous text, missing guidance, untested enforcement and facts only a regulator or a lawyer can settle.

Target: 1+ checklist (at least 8 ranked questions, each linked to its source card).

Seed cards:
- checklist: Questions for a lawyer or the regulator

## Databases

### Provisions (frame `provisions`)

One row per operative provision, definition, exemption and threshold of the text.

| Column | Type | Notes |
|---|---|---|
| Section | text | Article or section number. |
| Topic | text |  |
| Kind | enum (Obligation, Prohibition, Right, Definition, Exemption, Threshold, Penalty, Procedure) |  |
| Applies to | text |  |
| Requirement | text | In plain words, numbers exact. |
| Penalty | text |  |
| Effective | date |  |
| Enforced by | text |  |
| Conflicts | text | Overlapping or conflicting rules. |
| Quote | text | The exact words. |
| Source | url |  |

Views: All (table); By kind (board, by Kind); Obligations (table, sorted by Effective asc, filtered).

### Stakeholders (frame `stakeholders`)

Everyone with a stake, their position and their strongest argument.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| Type | enum (Regulator, Legislator, Industry, Trade association, Advocacy, Academic, Citizens, Court) |  |
| Position | enum (Supports, Opposes, Mixed, Neutral, Unknown) |  |
| Key argument | text |  |
| Interest | text | What they win or lose. |
| Influence | rating | 1 (low) to 5 (decisive). |
| Link | url |  |
| Source | url |  |

Views: All (table, sorted by Influence desc); By position (board, by Position); Opponents (table, filtered).

### Impact evidence (frame `evidence`)

Every claim about the effects of the policy, with who made it and how it was measured.

| Column | Type | Notes |
|---|---|---|
| Claim | text |  |
| Group affected | text |  |
| Direction | enum (Benefit, Cost, Mixed, No effect) |  |
| Magnitude | text | With the unit. |
| Basis | enum (Observed, Modelled, Estimated, Claimed) |  |
| Producer | enum (Official, Independent, Interested) |  |
| Confidence | rating | 1 (low) to 5 (high). |
| Source | url |  |

Views: All (table); By direction (board, by Direction); Independent only (table, filtered).

### Comparable policies (frame `comparables`)

Similar policies in other jurisdictions and what happened. Discovered with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Jurisdiction | text |  |
| Policy | text |  |
| Year | number |  |
| Design difference | text |  |
| Outcome | text |  |
| Outcome type | enum (Worked, Mixed, Failed, Too early) |  |
| Similarity | rating | 1 (loose) to 5 (close analogue). |
| Lessons | text |  |
| Source | url |  |

Views: All (table, sorted by Similarity desc); By outcome (board, by Outcome type).

### Cases (frame `legal`)

Court cases and rulings that bear on the policy or on similar texts.

| Column | Type | Notes |
|---|---|---|
| Case | text |  |
| Court | text |  |
| Date | date |  |
| Status | enum (Decided, Pending, Appealed, Settled) |  |
| Holding | text |  |
| Relevance | rating | 1 (background) to 5 (directly on point). |
| Source | url |  |

Views: By date (table, sorted by Date desc); Pending (table, filtered).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first: the text of the law, the impact assessment and comment letters (read_card and read_source). Hand the comparable jurisdictions and the stakeholders from the intake, and the ticked signed-in sources, to Scout in its delegate instruction. Fill the Policy snapshot metrics from the text only when you can quote the section. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `update_card`.
2. Delegate with delegate: Scout first (text, history, stakeholders, comparables), Builder once the Provisions database has rows, Critic once Scout has sources to review. Name the frames each agent owns. Tools: `delegate`, `message_agent`.
3. After Scout’s first pass, fill the Snapshot metrics and the plain-words summary (update_card), each with a cited section or source. Never state a date, threshold or penalty you cannot source from the text. Tools: `query_board`, `query_dataset`, `search_board`, `update_card`.
4. For a gap Scout could not close (an impact assessment, a foreign case, enforcement so far), run deep_research (core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
5. At the end fill the Policy scorecard: one 1-to-5 score per rubric dimension (doubled on the matrix), each with a cited card. Then the pros and cons, the hypotheses (evidence for and against as card ids) and the Decision card: your proposed response from the chosen perspective and the weighted total in its rationale. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
6. Write the policy brief with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. End the brief with a line that it is research and not legal advice. Tools: `compose_section`.
7. Keep the open questions current: collect every unresolved Question card into the checklist, ranked, each linked to its source card. Tools: `search_board`, `update_card`, `add_link`.
8. Only when the user asks to keep following the policy: watch_topic with the policy name and the monitor query, so amendments, rulemaking and rulings appear. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. The text first, from the official source (fetch_url or parallel_extract; an official gazette or legislature site over a summary). One Provisions row per operative section (upsert_rows, key Section) with the exact quote, the penalty and the effective date; place the most important sections as quote cards with the section number. Definitions, exemptions and thresholds are rows too. Tools: `fetch_url`, `parallel_extract`, `web_search`, `place_card`, `upsert_rows`.
2. The legislative and regulatory history: the problem, drafts, consultations, votes, amendments, effective dates and what is still to come, as dated events on the timeline (place_card), each with an official source. Tools: `web_search`, `fetch_url`, `place_card`.
3. Stakeholders: the ones in the intake first, then find_entities for the organisations that commented or lobbied (the match limit follows the depth tier); batch_enrich fills Type, Position, Key argument and Interest. Copy the rows into the Stakeholders database (query_dataset, upsert_rows, key Name), each with a Source. Quote each position in their own words as a quote card. On the Quick tier add a few from web_search with upsert_rows. Tools: `find_entities`, `batch_enrich`, `web_search`, `fetch_url`, `place_card`, `query_dataset`, `upsert_rows`.
4. Evidence on impact: the official impact assessment first, then independent studies and early results. One Impact evidence row per claim (upsert_rows, key Claim) saying who produced it (Official, Independent or Interested) and how (Observed, Modelled, Estimated, Claimed). Fill the cost and benefit metrics. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`, `upsert_rows`.
5. Comparable jurisdictions: the ones in the intake first, then find_entities for similar policies. Fill the Comparable policies database (upsert_rows, key Jurisdiction) with year, design differences, outcome and a Source. Say how close each analogue is in Similarity. Tools: `find_entities`, `batch_enrich`, `web_search`, `fetch_url`, `query_dataset`, `upsert_rows`.
6. Legal sweep for Critic: court cases, challenges and rulings (fetch_signed_in on Westlaw, LexisNexis or Bloomberg Law when the user connected them, otherwise public sources) as Cases rows (upsert_rows, key Case); also search for conflicts with other law, pre-emption and the enforcement record so Critic has sources. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `upsert_rows`, `place_card`.
7. Compliance and implementation: official guidance, FAQs and the steps an affected party takes; deadlines onto the Compliance deadlines timeline (place_card) with the section that sets each one. Tools: `fetch_url`, `parallel_extract`, `web_search`, `place_card`.
8. Deep research for the gaps that remain: deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout’s first sources: read the Provisions database and the cards of every frame (board_map, search_board, read_card, query_dataset) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`, `query_dataset`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source cards that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge the evidence: for every impact claim from an interested producer, link it with "tension" to an independent card that disagrees, or place a Question asking for independent evidence. Check each stakeholder position against its quote. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Turn every gap into a Question card in Open questions, with a link to the card or gap that prompted it. Tools: `place_card`, `add_link`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. A diagram of who must do what to whom (regulator, regulated, third parties) from the Provisions database, and the compliance flow as a second diagram. Tools: `place_card`, `query_dataset`, `read_card`.
2. Charts bound to the databases: impact by direction (bar) from Impact evidence, comparable outcomes from Comparable policies. Never an inline chart when a database holds the data. Tools: `place_card`, `query_dataset`.
3. The design-comparison matrix (weighted criteria, scores 0 to 10 from the Comparable policies database) and the pros-and-cons framework for the main option. Tools: `place_card`, `query_dataset`, `read_card`.
4. Optional one-page visual summary (a design frame): the policy in plain words, the score, the recommendation and the dates, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. The text is vague on key terms, so what is covered is unclear. *How:* Read the definitions in the Provisions database; raise terms with no definition or with open-ended standards.
2. An unfunded mandate: obligations with no budget or enforcement body. *How:* Look for the funding clause and the enforcing authority in the Provisions database.
3. Conflicts or overlap with existing statutes, regulations or treaties. *How:* Search for overlapping rules in the same and in higher jurisdictions; note each in the Provisions Conflicts column.
4. Pre-emption risk: a higher level of government may override it. *How:* Check the legal basis against the constitution or the framework law of the jurisdiction and the Cases database.
5. A sunset, review or expiry clause that changes the long-run effect. *How:* Read the effective dates and any sunset or review clause in the Provisions and timeline.
6. The evidence for the policy comes from the groups that benefit from it. *How:* Check who produced each source in Impact evidence; raise claims backed only by interested parties.
7. Loopholes, exemptions or thresholds that let the main target avoid it. *How:* List the exemptions and thresholds in Provisions and ask who could organise around them.
8. Likely unintended consequences, such as displacement or compliance avoidance. *How:* Look in the comparable policies for side effects and place each one that applies here as a risk.
9. Retroactive application, or too short a transition period. *How:* Compare the effective date, the transition and the compliance deadlines in the Provisions database.
10. Pending or likely litigation or constitutional challenge. *How:* Search the Cases database and news for challenges; if none were searched, ask for the search.
11. Regulatory capture: the rules were drafted or shaped mainly by the regulated. *How:* Read the consultation record and the Stakeholders database for who wrote or lobbied for the text.
12. The cost estimates are missing, or are far from what comparable jurisdictions found. *How:* Compare the impact assessment with the comparable policies; a missing assessment is raised.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Effectiveness | 25% | No evidence it achieves its stated goal. | Plausible, with mixed evidence from comparable cases. | Strong evidence it achieves the goal. | evidence |
| Cost and efficiency | 15% | Costs clearly exceed benefits, or are unknown. | Benefits plausibly exceed costs. | Large net benefit at low cost. | evidence |
| Feasibility and enforcement | 20% | No enforcement body, budget or capacity. | Enforceable with effort and some gaps. | Clear enforcement, funded, with capacity in place. | compliance |
| Equity and distribution | 10% | Concentrated harm on a vulnerable group. | Mixed: some groups gain, others lose. | Broadly shared benefits, with protections for the vulnerable. | stakeholders |
| Legal durability | 15% | Likely to be struck down or pre-empted. | Open legal questions, but defensible. | Firm legal footing, tested in court. | legal |
| Political viability | 15% | Strong organised opposition and no champion. | Contested, with a coalition on each side. | Broad support across parties and stakeholders. | stakeholders |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Policy brief: {{policy}}. Every statement about what the text says quotes or cites its section; every statement about effects cites its source and says who produced it. This is research, not legal advice.

1. Summary & recommendation (at most 200 words): What the policy does, the score, the recommended response and the top 3 risks, in at most 200 words.
2. The policy in brief: A table of type, status, effective date, who is covered, the main obligation and the penalty.
3. What the text requires: The key provisions with section numbers and exact quotes, definitions and exemptions.
4. History & what comes next: How it came about, the milestones and the upcoming dates.
5. Stakeholders & positions: Who supports and opposes it and why, with the stakeholder map.
6. Evidence on impact: Expected and observed effects, with who produced each estimate and the cost against the benefit.
7. Comparable jurisdictions: What similar policies did elsewhere and how close the analogues are.
8. Compliance & implementation: The steps, deadlines and enforcement record.
9. Legal risks & challenges: The red-flag outcomes, each raised flag with its mitigant, and the cases.
10. Scorecard: The rubric table: each dimension, its weight, its score and its evidence.
11. Options & next steps: The options with their trade-offs, the recommendation and the ranked open questions.

Appendix: All sources.

One-page summary: Policy snapshot, Score, Recommendation, Key dates, Top risks.

Deck format: `policy-brief`.

## Follow-up chips

Shown after the first pass.

- Does it apply to us?: Check whether {{policy}} applies to [our organisation]: walk through the scope and thresholds with the quoted sections.
- Build the compliance plan: Build a compliance plan for {{policy}}: owners, deadlines and evidence for each obligation, from the Provisions database.
- Argue the opposing side: Write the strongest case against {{policy}} from the stakeholders and the evidence on this board, and the evidence that would answer it.
- Compare with [jurisdiction]: Compare {{policy}} with the policy in [jurisdiction]: scope, penalties, enforcement and outcomes, side by side in a table.
- What changed?: Check for amendments, rulemaking and rulings on {{policy}} since this canvas was made and update the timeline and the scores.
- Keep following it: Watch {{policy}} and tell me when it is amended, when guidance is issued and when a court rules on it.

## Signed-in sources

- Westlaw (westlaw.com): Case law, statutes and citators for the Cases database.
- LexisNexis (lexisnexis.com): Case law, statutes and legal news.
- Bloomberg Law (bloomberglaw.com): Dockets, regulatory tracking and legal analysis.
- Policy Commons (policycommons.net): Policy reports and think-tank papers on the impact.

## Monitor

Only when the user asks: `{{policy}} amendments, rulemaking, guidance and court rulings`. Changes that alter what the policy requires or whether it stands.
