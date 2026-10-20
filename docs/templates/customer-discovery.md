# Customer discovery

<!-- Generated from packages/shared/src/templates/customer-discovery.ts by `pnpm templates:docs`. Do not edit by hand. -->

Synthesise customer interviews: log every transcript, pull verbatim quotes, tag them into pains, needs, workarounds and buying triggers, find the themes and how many people raised each, segment the participants, test the hypotheses against the evidence, check the sample for bias, plan the next interviews, and recommend whether to proceed. Quote participants exactly, count people not mentions, and never invent a quote.

Template id `customer-discovery`. Canvas title: `{{topic}}: customer discovery`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Problem area or product (`topic`) | text | yes | placeholder "Expense reporting for field teams" |
| Who you are interviewing (`segment`) | longtext | no | placeholder "Operations managers at 50 to 500 person logistics firms" |
| Hypotheses to test (`hypotheses`) | list | no | placeholder "One per line: the problem is frequent; managers own the budget". Optional. orb proposes hypotheses from the transcripts if there are none. |
| Questions you want answered (`questions`) | longtext | no | placeholder "How do they handle it today? What did the last failure cost?" |
| Stage of the idea (`stage`) | select | no | one of Problem exploration, Solution validation, Pricing validation, Existing product |
| Region (`geography`) | text | no | placeholder "US, EU" |
| Materials (`materials`) | materials | no | Drop the interview transcripts (text, PDF, Word, Markdown), notes, survey exports (CSV or XLSX) and recordings' summaries. Each becomes a card or database; every transcript gets a row in Interviews. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites LinkedIn, G2. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** Read the transcripts and synthesise: no deep research, no recruiting list, at most 12 cards per frame, the memo is the summary only.
- **Standard:** Quick, plus a recruiting list with find_entities and batch_enrich, personas and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro research to size the problem and the alternatives, and the full memo and readout deck.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 RESEARCH GOALS (signal; orb)

Brief: What this research must settle on {{topic}}: the decision it changes, the segment, the hypotheses and the questions. Your hypotheses: {{hypotheses|none given: orb proposes them from the transcripts}}. Your questions: {{questions|none given}}. Transcripts and notes dropped on the intake wait in the free room at the bottom of this frame.

Target: 3+ hypothesis (with evidence links); 4+ metric; 1+ doc (the research brief).

Seed cards:
- doc: Research brief
- hypothesis: The problem in {{topic}} is frequent and painful
- hypothesis: People already spend time or money working around it
- hypothesis: A specific, reachable segment feels it most
- metric: Interviews analysed
- metric: Distinct participants
- metric: Segments covered
- metric: Top theme reach
- question: What decision will this research change?

### 02 INTERVIEW LOG (sky; orb, scout)

Brief: One row per interview in the Interviews database: when, who, which segment, the source file and the key takeaway. Transcripts dropped on the intake wait in the first frame, Research goals, until each is logged here; a transcript without a row is a gap. Participants are logged by role and company type, never by private contact details.

Target: 1+ database (Interviews, one row per transcript).

Seed cards:
- database: Interviews (database `interviews`)

### 03 QUOTES & EVIDENCE (rho; scout)

Brief: Verbatim evidence from the transcripts: a Quote card for each strong statement, linked to its transcript, and a row per statement in the Evidence log tagged as a pain, need, workaround, goal, objection or buying trigger, with an intensity from 1 to 5. Quote exactly; do not tidy or merge two statements.

Target: 12+ quote (verbatim, each linked to its transcript); 1+ database (Evidence log).

Seed cards:
- database: Evidence log (database `evidence`)

### 04 THEMES & AFFINITY (sky; scout, builder)

Brief: Group the evidence into themes: for each, how many distinct people raised it, how often, the average intensity and the best quote. Chart the themes by reach. An Insight names the pattern and cites at least two quotes.

Target: 1+ database (Themes); 1+ chart (themes by number of people); 3+ insight (each citing at least 2 quotes).

Seed cards:
- database: Themes (database `themes`)
- chart: Themes by number of people (database `themes`)

### 05 JOBS, PAINS & GAINS (rho; builder, critic)

Brief: What customers are trying to get done, what gets in the way and what a good outcome looks like. Rank the pains by frequency, severity, willingness to pay and the cost of the workaround, and place them on a frequency by severity 2x2.

Target: 1+ framework (frequency by severity 2x2); 1+ matrix (pains ranked on weighted criteria).

Seed cards:
- framework: Pains: frequency by severity
- matrix: Pain ranking

### 06 SEGMENTS & PERSONAS (sky; scout, builder)

Brief: Who feels the problem most: segments by role, company size and context, with the evidence for each, and one persona per distinct segment grounded in the participants (role, goals, triggers, objections). Say which segment to start with.

Target: 2+ entity (personas, kind person); 1+ chart (participants by segment).

Seed cards:
- chart: Participants by segment (database `interviews`)
- question: Which segment hurts most, and is it reachable?

### 07 WORKAROUNDS & ALTERNATIVES (rho; scout)

Brief: What people use today: tools, spreadsheets, hires, agencies, doing nothing. A Product card per alternative (kind competitor) with what participants say about it, plus the competitors an outside search finds.

Target: 4+ product (alternatives and workarounds); 4+ source.

Seed cards:
- question: What do people do when this goes wrong, and what does it cost them?

### 08 HYPOTHESIS VALIDATION (signal; critic, orb)

Brief: Test each hypothesis against the evidence: link supporting and contradicting cards, set the confidence, and mark each validated, invalidated or still open. Score the problem against the rubric with cited evidence.

Target: 3+ hypothesis (evidence for and against); 1+ matrix (the filled rubric); 3+ insight.

Seed cards:
- matrix: Problem validation (rubric score x 2, so 10 is a 5)
- framework: What is true, what is not, what is unknown

### 09 GAPS & BIAS CHECK (paper; critic)

Brief: Work through the red-flag checklist on the research itself: sample size, leading questions, one segment, hypothetical willingness to pay. Raise each flag as a Risk card with evidence or clear it with a source.

Target: 5+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Research-quality checklist
- risk: Sample bias risk
- risk: Interviewer bias risk
- risk: Stated vs real behaviour risk

### 10 NEXT INTERVIEWS (paper; critic, scout, orb)

Brief: Who to talk to next and what to ask: a recruiting list of people matching the segment (find_entities, public professional information only) and ranked follow-up questions, each linked to the gap that prompted it.

Target: 1+ database (Recruiting list); 1+ checklist (at least 10 ranked questions).

Seed cards:
- database: Recruiting list (database `recruiting`)
- checklist: Questions for the next interviews

### 11 RECOMMENDATION (signal; orb)

Brief: What the evidence supports: proceed, narrow the segment, pivot the problem or keep researching, with the conditions and the next experiment. The weighted rubric total goes in the rationale.

Target: 1+ decision; 2+ insight.

Seed cards:
- decision: What should we do about {{topic}}?

## Databases

### Interviews (frame `interviews`)

One row per interview, linked to its transcript card.

| Column | Type | Notes |
|---|---|---|
| Interview | text | An id such as I-01. |
| Date | date |  |
| Participant | person | Role and company type only; no contact details. |
| Role | text |  |
| Segment | text |  |
| Company size | text |  |
| Relationship | enum (Stranger, Warm intro, Friend or colleague, Customer) |  |
| Transcript | text | The title of the transcript card. |
| Key takeaway | text |  |
| Fit | rating | 1 to 5: how well the person matches the segment. |

Views: All (table, sorted by Date asc); By segment (board, by Segment).

### Evidence log (frame `evidence`)

Every strong statement, tagged, with its intensity and a pointer to its transcript.

| Column | Type | Notes |
|---|---|---|
| Quote | text | Verbatim. |
| Interview | text | The Interview id. |
| Type | enum (Pain, Need, Workaround, Goal, Objection, Buying trigger) |  |
| Theme | text |  |
| Intensity | rating | 1 (mild) to 5 (urgent). |
| Segment | text |  |

Views: All (table, sorted by Intensity desc); By type (board, by Type); Urgent (table, filtered).

### Themes (frame `themes`)

One row per theme with the number of distinct people who raised it.

| Column | Type | Notes |
|---|---|---|
| Theme | text |  |
| Description | text |  |
| People | number | Distinct participants, not mentions. |
| Mentions | number |  |
| Avg intensity | number |  |
| Type | enum (Pain, Need, Workaround, Goal, Objection, Buying trigger) |  |
| Best quote | text |  |

Views: By reach (table, sorted by People desc); By type (board, by Type).

### Recruiting list (frame `next`)

People or companies that match the segment, for the next round of interviews. Public professional information only.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| Role | text |  |
| Company | text |  |
| Segment | text |  |
| Channel | enum (LinkedIn, Email, Community, Referral, Other) |  |
| Status | enum (Candidate, Contacted, Scheduled, Done, Declined) |  |
| Why a fit | text |  |
| Source | url |  |

Views: All (table); By status (board, by Status).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. List the transcripts the user dropped or pasted (board_map, query_board for file, doc and note cards). Add one Interviews row per transcript (upsert_rows, key Interview: I-01, I-02 ...) with the date, role, segment and relationship where the file says so, and the transcript title. A transcript you cannot read is a Question card, not a skipped row. Tools: `board_map`, `query_board`, `read_card`, `upsert_rows`, `place_card`.
2. Read the intake and the first transcript, then fill the research brief and propose hypotheses if the user gave none (update_card on the three seeds). Set the metric placeholders as the log fills. Tools: `read_card`, `update_card`, `query_dataset`.
3. Delegate with delegate: Scout first (reads every transcript), Builder once the Themes database has rows, Critic once Scout has quotes to review. Name the frames each agent owns, and hand over the intake facts (names, links, concerns) in the instruction. Tools: `delegate`, `message_agent`.
4. Validate: for each hypothesis, link supporting and contradicting cards (add_link with supports or contradicts), set the confidence, and say validated, invalidated or open in the body. Fill the Problem validation matrix (rubric scores doubled on the matrix) with a cited card per score, then the Decision rationale with the weighted total. Tools: `query_board`, `search_board`, `read_card`, `update_card`, `add_link`, `place_card`.
5. Where interviews cannot answer a sizing or competitor question, run deep_research (core) on that one question. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
6. Write the memo with compose_section, section by section in the order of the memo outline, then the one-page summary. On the Quick tier write the summary only. When the user asks for slides, compose_slides with the deck outline. Tools: `compose_section`, `compose_slides`.
7. Only when the user asks to keep watching: watch_topic with the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. Read every transcript the user dropped, page by page (the file, doc and note cards in Research goals: board_map to find them, read_card with page). Never skim: a transcript you did not read to the end is reported as such. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`.
2. Quote cards: one per strong statement, body copied verbatim (under 50 words), sourceCardId set to the transcript card, the interview id in the why line. One Evidence log row per quote (upsert_rows, key Quote) tagged Type, Theme and Intensity. Do not merge two statements or fix wording. Quick scan: at most 12 cards. Tools: `place_card`, `add_link`, `upsert_rows`.
3. Themes: group the Evidence log (query_dataset) into themes; one Themes row each (upsert_rows, key Theme) with the number of DISTINCT people, mentions, average intensity and the best quote. Names stay in the participant's words where possible. Tools: `query_dataset`, `upsert_rows`, `place_card`.
4. Alternatives and workarounds: what participants named, then what web_search and G2 show for the same job (fetch_signed_in only if the user ticked it). One Product card each (kind competitor) with a source. Tools: `web_search`, `fetch_url`, `fetch_signed_in`, `place_card`, `parallel_extract`.
5. Segments and personas: one entity card (kind person) per distinct segment, grounded only in what participants said (role, goals, triggers, objections); name the segment to start with. Tools: `place_card`, `query_dataset`, `read_card`.
6. The recruiting list: find_entities for people or companies matching the segment (public professional information only, no private contact details); batch_enrich the role, company and why they fit; consolidate into Recruiting list (upsert_rows, key Name) with a Source url. Quick scan: find_entities is refused; add a few rows from web_search. *(from the standard tier)* Tools: `find_entities`, `batch_enrich`, `web_search`, `upsert_rows`, `query_dataset`.
7. Deep research for what interviews cannot answer: the size of the segment, how the alternatives are priced, regulatory limits (deep_research, core or above, per the tier). *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Read the interviewer turns of each transcript (read_source, read_card) for leading questions, pitching and solution talk; place a Risk with the quoted turn. Count distinct people behind each top theme (query_dataset); a theme from one person is linked "tension" to the claim it supports. Tools: `read_card`, `read_source`, `query_dataset`, `add_link`, `place_card`.
4. Turn every gap into a ranked question in "Questions for the next interviews" (place a Checklist or Question card; you cannot tick), each linked to the gap or risk that prompted it. Tools: `place_card`, `add_link`, `query_board`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. Charts bound to the databases: themes by number of people (bar, Themes), participants by segment (bar, Interviews). Rebuild a chart when a column is renamed. Tools: `place_card`, `query_dataset`.
2. The pains: the frequency by severity 2x2 (framework, quadrant) and the Pain ranking matrix (scores 0 to 10 from Themes and Evidence log, the note naming the rows used). Tools: `place_card`, `query_dataset`, `read_card`.
3. A persona one-pager per segment as a design frame (write_design_frame), using only quotes and facts on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`, `place_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. Fewer than 5 interviews in the segment being judged. *How:* Count rows per segment in the Interviews database; a conclusion drawn from fewer than 5 is raised.
2. Leading questions in the transcripts. *How:* Read the interviewer turns for questions that suggest the answer or pitch the solution; quote them.
3. Participants are friends, family or colleagues. *How:* Check the Interviews database for relationship and source; raise a sample made of warm contacts only.
4. Willingness to pay rests on hypothetical statements. *How:* Search the evidence for "would pay" or "would buy"; without a budget, a price discussed or a commitment it is raised.
5. One segment dominates the sample. *How:* Group Interviews by Segment; raise when one segment is more than 70% of the interviews.
6. A theme rests on one loud participant. *How:* For each top theme count distinct interviews, not mentions; raise a theme heard from a single person.
7. What people say conflicts with what they do. *How:* Compare stated pain with the workaround and spend evidence; raise a pain nobody acts on.
8. The conversation was about our solution, not the problem. *How:* Check how much of each transcript is solution talk; raise interviews that never reached past behaviour.
9. Interview evidence is more than 12 months old. *How:* Check the Interviews database dates; old rows are marked stale and a Question asks for a refresh.
10. Insights are the interviewer's inference, not a participant's words. *How:* Every Insight must cite a Quote card; an Insight that cites none is raised.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Frequency | 20% | Mentioned by one or two people, rarely. | Weekly for about half the participants. | Daily for most of them. | themes |
| Severity | 25% | An annoyance; people shrug. | Costs real time or money; people complain. | A blocker people describe with urgency and stories. | pains |
| Current workaround and spend | 20% | Nobody does anything about it. | A manual workaround or a free tool. | People already pay, hire or build for it. | alternatives |
| Reachable segment | 15% | Scattered with no known channel. | A defined segment with some channels. | A tight segment with clear, cheap channels. | segments |
| Evidence of willingness to pay | 20% | Only "I would pay" statements. | A budget exists or pricing was discussed. | A pilot, a pre-order or a signed letter of intent. | validation |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Customer discovery synthesis: {{topic}}. Every finding cites quote cards; counts are of people, not mentions; every quote is verbatim and names its interview.

1. Summary & recommendation (at most 150 words): What we learned, the recommendation and the three strongest pieces of evidence, in at most 150 words.
2. Who we spoke to and how: The sample: number, segments, relationship, dates; and the limits of it.
3. What we heard: The themes ranked by number of people, each with two quotes, and the themes chart.
4. Jobs, pains and gains: The ranked pains and the frequency by severity 2x2.
5. Segments and personas: The segments, the personas and the one to start with.
6. Workarounds and alternatives: What people do today and what it costs them.
7. Hypotheses and scorecard: Each hypothesis with its verdict and confidence, and the rubric table.
8. Limits and bias: The raised research-quality flags and what they do to the conclusions.
9. Next interviews and experiments: The ranked questions, the recruiting plan and the next experiment.

Appendix: All sources and transcripts.

One-page summary: Sample, Top themes, Verdict, Next steps.

Deck format: `standard`.

Deck: Customer discovery readout: {{topic}}. Slides, in order:

1. What we set out to learn: The decision, the segment and the hypotheses.
2. Who we spoke to: Participants by segment and the limits of the sample.
3. The top themes: Themes by number of people, with a chart.
4. In their words: The best quotes per theme, each naming its interview.
5. Pains ranked: The frequency by severity 2x2 and the ranking matrix.
6. Who feels it most: The segments and personas.
7. What people do today: Workarounds, alternatives and their cost.
8. Hypotheses: validated or not: Each hypothesis with its verdict and evidence.
9. Recommendation: The decision and the rubric score.
10. Next steps: The next interviews and the experiment to run.

## Follow-up chips

Shown after the first pass.

- Which quotes support theme X: Show me every verbatim quote behind the theme [theme], with the interview and the person count.
- Add the new transcripts: I added new transcripts. Log them, extend the evidence and themes, and tell me what changed in the verdicts.
- Write the interview guide: Write the guide for the next round of interviews on {{topic}}: opening, behaviour questions, the gaps to probe, no leading questions.
- Stress-test the top theme: Build the strongest case that the top theme is not real: who disagreed, who is missing from the sample, what would change the verdict.
- Draft the readout deck: Make the readout deck from the customer discovery outline, each slide citing quotes and cards.
- Listen for new complaints: Start a monitor for new public complaints and requests about {{topic}}.

## Signed-in sources

- LinkedIn (linkedin.com): Public professional profiles for the recruiting list: role, company, segment.
- G2 (g2.com): Reviews of the alternatives participants named.

## Monitor

Only when the user asks: `{{topic}} complaints, workarounds and unmet needs in public forums and reviews`. New evidence for or against the hypotheses.
