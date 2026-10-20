# Literature review

<!-- Generated from packages/shared/src/templates/literature-review.ts by `pnpm templates:docs`. Do not edit by hand. -->

Run a structured literature review: a search log, a Papers database with study type and quality, the authors and groups, claims with the evidence for and against each, methods and bias appraisal, themes and a timeline of the field, gaps and contradictions, and a synthesis with a weighted evidence-quality score. Cite every paper, separate what a paper shows from what its authors claim, and say how strong the evidence is.

Template id `literature-review`. Canvas title: `Literature review: {{topic}}`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Topic or research question (`topic`) | text | yes | placeholder "Does intermittent fasting improve cardiometabolic health in adults?" |
| Field (`discipline`) | text | no | placeholder "Nutrition science" |
| Review type (`review_type`) | select | no | one of Narrative review, Scoping review, Systematic review, Rapid review, State of the art |
| Years to cover (`years`) | text | no | placeholder "2015 to now" |
| Languages (`languages`) | text | no | placeholder "English" |
| Population / setting (`population`) | text | no | placeholder "Adults, free-living, any country" |
| Inclusion and exclusion criteria (`inclusion`) | longtext | no | placeholder "Include randomised trials and cohort studies. Exclude animal studies.". Optional. orb proposes criteria from the question when this is empty. |
| Papers you already know (`seed_papers`) | list | no | placeholder "DOIs, URLs or titles, comma separated". Optional. Scout starts from these and follows their citations. |
| Authors or groups to include (`authors`) | list | no | placeholder "Comma separated". Optional. |
| Specific questions or doubts (`concerns`) | longtext | no | placeholder "Is the effect real outside the lab?" |
| Materials (`materials`) | materials | no | Drop papers (PDF), a reference export (CSV) or notes. Each paper becomes a card; a CSV becomes a database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites Google Scholar, JSTOR, ScienceDirect, Web of Science. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the review is the summary only.
- **Standard:** Quick, plus paper discovery with find_entities, batch enrichment of the Papers database and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on the contested claims, FindAll extension for complete paper discovery and the full review.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 SCOPE & RESEARCH QUESTION (signal; orb)

Brief: The research question stated precisely (population, intervention or exposure, comparison, outcome), the review type, the years and languages covered, the inclusion and exclusion criteria and what is out of scope. This is the frame every later decision is checked against.

Target: 1+ doc (the question in one sentence); 1+ checklist (inclusion and exclusion criteria); 4+ metric.

Seed cards:
- doc: Research question
- checklist: Inclusion and exclusion criteria
- metric: Records found
- metric: Included
- metric: Excluded
- metric: Years covered

### 02 SEARCH STRATEGY (sky; scout, orb)

Brief: Every search that was run: the databases and indexes, the exact query strings, the date, the number of hits and what was done with them, plus citation chasing (backward and forward) from the key papers. A reader must be able to repeat the search.

Target: 1+ database (the Search log); 3+ source (the indexes searched).

Seed cards:
- database: Search log (database `search-log`)
- question: Which databases and keywords are missing?

### 03 PAPERS (rho; scout, critic)

Brief: One row per paper: title, authors, year, venue, link, study type, population and sample size, the key finding, citations, a relevance and a quality score and the screening status. Include a short source card for the landmark papers. Include null and negative results, not only the successes.

Target: 1+ database (the Papers database, at least 25 rows on Standard); 5+ source (landmark papers); 3+ quote (key passages with the page or section).

Seed cards:
- database: Papers (database `papers`)

### 04 AUTHORS & GROUPS (sky; scout)

Brief: The research groups, labs and institutions that produce the evidence: who the most cited and most prolific authors are, who works together, who funds them and whether the whole field rests on one lab.

Target: 1+ database (Authors and groups); 3+ entity (the leading authors or labs).

Seed cards:
- database: Authors & groups (database `authors-db`)
- question: Is the evidence independent?

### 05 CLAIMS & EVIDENCE (rho; scout, critic, builder)

Brief: The main claims of the literature, each with the papers that support it, the papers that contradict it, the strength of the evidence and whether there is consensus. Separate what a paper measured from what its authors concluded. Aim for 8 to 15 claims.

Target: 1+ database (the Claims database); 3+ hypothesis (with evidence for and against); 1+ chart (claims by evidence strength); 2+ insight (each citing at least two cards).

Seed cards:
- database: Claims (database `claims`)
- chart: Claims by evidence strength (database `claims`)
- hypothesis: The main finding holds in the target population

### 06 METHODS & QUALITY APPRAISAL (sky; critic, builder)

Brief: How each body of work was done: designs, samples, measures, controls, pre-registration and data availability; a risk-of-bias judgement per important paper and the checklist of appraisal questions. This frame feeds the study-design, sample and bias scores of the rubric.

Target: 1+ checklist (the appraisal checklist); 1+ matrix (key papers against appraisal criteria); 1+ chart (papers by study type).

Seed cards:
- checklist: Appraisal questions
- matrix: Key papers against the appraisal criteria
- chart: Papers by study type (database `papers`)

### 07 THEMES & TIMELINE (rho; scout, builder)

Brief: How the field developed: the major themes and schools of thought, the turning points (a landmark paper, a method, a dataset, a controversy), and how the number of papers moved over time. Builder maps the themes; Scout dates the events.

Target: 1+ timeline (turning points of the field); 1+ diagram (a map of the themes); 1+ chart (papers per year); 1+ framework.

Seed cards:
- timeline: Timeline of the field
- chart: Papers per year (database `papers`)
- framework: Schools of thought

### 08 GAPS & CONTRADICTIONS (paper; critic)

Brief: Work through the red-flag checklist (raise each flag with evidence or clear it with a source), then list what the literature does not answer: contradictory findings and why they might differ, populations and outcomes nobody studied, and methods that need replication.

Target: 6+ risk (every checklist item cleared with a source or raised); 3+ question (the gaps).

Seed cards:
- checklist: Red-flag checklist
- risk: Evidence quality risk
- risk: Bias risk
- risk: Generalisability risk
- risk: Replication risk

### 09 SYNTHESIS & CONCLUSIONS (signal; orb)

Brief: What the literature says, in a form a reader can use: the answer to the research question with its confidence, the evidence-quality score by the rubric, what practitioners or researchers should do, and what would change the conclusion.

Target: 2+ hypothesis (the conclusions, with evidence links); 1+ matrix (the filled rubric); 1+ decision; 1+ insight.

Seed cards:
- hypothesis: Answer: {{topic}}
- matrix: Evidence-quality scorecard (rubric score x 2, so 10 is a 5)
- decision: How strong is the evidence?

### 10 FUTURE RESEARCH & READING LIST (paper; critic, orb)

Brief: The studies that would settle the open questions, the ranked reading list for someone new to the field, and every unresolved question card on the board.

Target: 2+ checklist (the reading list and the open questions, ranked).

Seed cards:
- checklist: Reading list
- checklist: Open questions

## Databases

### Search log (frame `search`)

Every search run, so the review can be repeated.

| Column | Type | Notes |
|---|---|---|
| Query | text | The exact string typed. |
| Source | text | Database or index. |
| Date | date |  |
| Hits | number |  |
| Kept | number | Papers carried to screening. |
| Link | url |  |
| Note | text |  |

Views: All (table, sorted by Date asc); By source (table, by Source).

### Papers (frame `papers`)

One row per paper, with its design, size, finding, quality and screening status.

| Column | Type | Notes |
|---|---|---|
| Title | text |  |
| Authors | text |  |
| Year | number |  |
| Venue | text | Journal or conference, or "preprint". |
| Link | url | DOI or landing page. |
| Study type | enum (RCT, Cohort, Case-control, Cross-sectional, Meta-analysis, Systematic review, Qualitative, Modelling, Theory, Other) |  |
| Population | text |  |
| Sample size | number |  |
| Key finding | text | What was measured, not what the authors hope. |
| Citations | number |  |
| Relevance | rating | 1 (marginal) to 5 (central). |
| Quality | rating | 1 (weak) to 5 (strong), from the appraisal. |
| Status | enum (Include, Maybe, Exclude) |  |
| Reason | text | Why a paper is Maybe or Exclude. |
| Flags | text | Retraction, preprint, conflict of interest, small sample. |

Views: All (table, sorted by Relevance desc); By status (board, by Status); Included (table, sorted by Year desc, filtered); Flagged (table, filtered).

### Authors & groups (frame `authors`)

The people and labs behind the evidence.

| Column | Type | Notes |
|---|---|---|
| Name | person |  |
| Institution | text |  |
| Country | text |  |
| Papers | number | Papers in this review. |
| Topics | text |  |
| Collaborators | text |  |
| Funding | text |  |
| Profile | url |  |
| Source | url |  |

Views: All (table, sorted by Papers desc); By country (table, by Country).

### Claims (frame `claims`)

The main claims, the papers for and against and how strong the evidence is.

| Column | Type | Notes |
|---|---|---|
| Claim | text |  |
| Theme | text |  |
| Supporting papers | text | Titles or DOIs. |
| Contradicting papers | text |  |
| Evidence strength | enum (Strong, Moderate, Weak, Conflicting, None) |  |
| Consensus | enum (Agreed, Mostly agreed, Contested, Unknown) |  |
| Causal | boolean | True when the claim is causal. |
| Note | text |  |

Views: All (table); By strength (board, by Evidence strength); Contested (table, filtered).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first (read_card and read_source for papers, query_dataset for a reference export). Restate the research question precisely in the Research question card (update_card) and propose the inclusion criteria when the intake left them empty. Hand the seed papers and authors from the intake to Scout in its delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `update_card`.
2. Delegate with delegate: Scout first (search, papers, authors, timeline), Builder once the Papers database has rows, Critic once Scout has placed the first papers. Name the frames each agent owns. Tools: `delegate`, `message_agent`.
3. After Scout’s first pass, fill the metric seeds of Scope (Records found, Included, Excluded, Years covered) from the Search log and Papers databases (query_dataset, update_card). Never write a count you cannot read from the databases. Tools: `query_dataset`, `query_board`, `update_card`.
4. For a gap Scout could not close (an area with no papers found, a paper that is paywalled), run deep_research (core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
5. At the end fill the Evidence-quality scorecard: one 1-to-5 score per rubric dimension (doubled on the matrix), each with a cited card. Write the answer hypothesis (confidence, evidence for and against as card ids) and the strength decision: your proposed option and the weighted total in its rationale. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
6. Write the review with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. State the review type and the limits of the search. Tools: `compose_section`.
7. Keep the reading list and the open questions current: collect every unresolved Question card into the checklists, ranked, each linked to its source card. Tools: `search_board`, `update_card`, `add_link`.
8. Only when the user asks to keep the review current: watch_topic with the topic and the monitor query, so new papers appear. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. Start from the seed papers in the intake: find each (web_search, fetch_url or fetch_signed_in), place a source card and add a Papers row (upsert_rows, key Title). Note every search you run in the Search log (upsert_rows, key Query) with the source, the date and the hit count. Tools: `web_search`, `fetch_url`, `fetch_signed_in`, `place_card`, `upsert_rows`.
2. Discover more papers: find_entities with the research question as objective (the match limit follows the depth tier) fills its own database card; then batch_enrich fills Year, Venue, Study type, Sample size, Citations and Key finding with an output schema of those fields. Copy the rows into the Papers database (query_dataset, upsert_rows, key Title) so there is one table, a Link on every row. On the Quick tier those two are refused: add the best papers from web_search with upsert_rows instead. Tools: `find_entities`, `batch_enrich`, `web_search`, `query_dataset`, `upsert_rows`.
3. Where the user connected Google Scholar, JSTOR, ScienceDirect or Web of Science, read them as the user (fetch_signed_in) for full text, citation counts and "cited by" lists; chase citations backwards and forwards from the key papers. Record each as a Search log row. Tools: `fetch_signed_in`, `fetch_url`, `upsert_rows`.
4. Read the important papers: parallel_extract or fetch_url for the abstract and methods; place short quote cards with the section or page, and fill Study type, Population, Sample size and Key finding. Mark null and negative results explicitly. Put preprints and retractions in Flags. Tools: `parallel_extract`, `fetch_url`, `place_card`, `upsert_rows`.
5. Authors and groups: one entity card per leading author or lab and one Authors & groups row each (upsert_rows, key Name) with institution, country, funding and number of papers. Tools: `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
6. Claims: one row per claim in the Claims database (upsert_rows, key Claim) naming the supporting and contradicting papers and the evidence strength; mark each claim causal or not. Tools: `query_dataset`, `upsert_rows`, `place_card`.
7. The history of the field: landmark papers, methods, datasets and controversies as dated events on the timeline (place_card), each with a source. Tools: `web_search`, `fetch_url`, `place_card`.
8. Deep research for the questions that remain, such as a sub-field you could not map: deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout’s first papers: read the cards of every frame (board_map, search_board, read_card) and the Papers database before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`, `query_dataset`.
2. Appraise the key papers: place an insight per important body of work titled "Quality: ..." that cites the paper cards and the appraisal checklist, and a matrix scoring the landmark papers against the appraisal criteria. Your quality scores go in the cards, since you cannot change the Papers database. Tools: `query_dataset`, `read_card`, `place_card`, `add_link`.
3. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source cards that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
4. Challenge every claim marked Strong: link it with "tension" to the paper that disagrees, or place a Question asking for an independent replication. Place a hypothesis for each major disagreement with the evidence both ways. Tools: `query_dataset`, `read_card`, `add_link`, `place_card`.
5. Turn every gap (no replication, missing population, unmeasured outcome) into a Question card, linked to the card that prompted it, and keep the future-research checklist honest. Tools: `place_card`, `add_link`.
6. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. Charts bound to the Papers and Claims databases: claims by evidence strength (bar), papers per year (bar, x Year) and papers by study type. Never an inline chart when a database holds the data. Tools: `place_card`, `query_dataset`.
2. A diagram that maps the themes and how they relate, and the schools-of-thought quadrant, built from the claims and timeline cards. Tools: `place_card`, `query_dataset`, `read_card`.
3. The appraisal matrix for the landmark papers, scored 0 to 10 per criterion from the Papers database. Tools: `place_card`, `query_dataset`, `read_card`.
4. Optional one-page visual summary (a design frame): question, the evidence-strength chart, the answer and the top gaps, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. A key paper has been retracted, corrected or carries an expression of concern. *How:* For every paper marked Include with Citations above the median, search for a retraction or correction notice and record the result in Flags.
2. A conclusion rests on preprints that have not been peer reviewed. *How:* Count Include rows whose Venue is a preprint server; a claim supported only by such rows is raised.
3. Small samples or no power calculation behind a headline result. *How:* Read the Sample size column; any claim whose strongest support is under about 30 per group is raised.
4. Findings that have never been replicated by an independent group. *How:* Look at the Claims database: a Strong claim whose papers all share authors or a lab is raised.
5. Undisclosed or industry funding and conflicts of interest. *How:* Check the funding and disclosure statements of the papers behind each claim; note unfunded claims as unknown.
6. Predatory or low-quality venues. *How:* Compare each Venue with indexing in the sources (DOAJ, Scopus, PubMed); raise venues that are in none.
7. Causal language drawn from correlational designs. *How:* For every claim marked causal, check that the Study type supports it (trial or strong quasi-experiment).
8. Signs of publication bias: only positive results, a lopsided funnel. *How:* Look for null or negative findings in the Papers database; if there are none, raise it and say what was searched.
9. Outcome measures differ across studies, so results are not comparable. *How:* Read the Outcome and Measure columns side by side; raise claims that pool incomparable measures.
10. Citation circles or heavy self-citation propping up a claim. *How:* Check whether the strongest papers for a claim cite mostly each other; raise a cluster from one group.
11. The evidence is old and the field has moved (a newer method or dataset exists). *How:* Compare the Year range of the papers behind a claim with the date range in the intake; raise stale support.
12. The evidence comes from another population or setting than the research question. *How:* Compare each paper’s Population with the research question; raise claims that are only indirectly supported.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Study design | 25% | Anecdote, opinion or a case report. | Observational or cohort studies with controls. | Randomised trials, systematic reviews or meta-analyses. | quality |
| Sample and power | 15% | Tiny or unrepresentative samples. | Adequate samples, some selection concerns. | Large, representative samples with a power calculation. | quality |
| Replication and consistency | 25% | One study, never replicated, or findings conflict. | A few independent groups roughly agree. | Many independent replications agree. | claims |
| Directness to the question | 15% | Indirect: another population, proxy outcome or setting. | Partly direct, with some extrapolation. | Directly measures the question in the target setting. | claims |
| Risk of bias | 10% | High: conflicts of interest, selective reporting. | Some concerns, mostly disclosed. | Low: pre-registered, independent, transparent data. | quality |
| Recency and venue quality | 10% | Outdated, or only preprints and unreviewed venues. | Mixed: some recent peer-reviewed work. | Recent, peer-reviewed in reputable venues. | papers |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Literature review: {{topic}}. Every claim cites the papers it rests on; every number cites its paper; what a paper found and what its authors concluded are kept apart.

1. Summary (at most 200 words): The answer to the research question, how strong the evidence is and the main gap, in at most 200 words.
2. Research question & scope: The question, the review type, the years, the population and the inclusion criteria.
3. Search method: Databases, search strings, dates and screening, with the counts of papers found and kept.
4. The field at a glance: Who studies this, the main schools of thought and the timeline.
5. Findings by theme: Each theme with its claims, the papers for and against and the strength of evidence.
6. Quality of the evidence: Designs, samples and bias, and the scored rubric with its evidence.
7. Contradictions & gaps: Where studies disagree and why, the raised red flags and what nobody has studied.
8. Conclusions: What the evidence supports, with its confidence, and what would change it.
9. Future research & reading list: The studies that would settle the open questions and the ranked reading list.

Appendix: References.

One-page summary: Question, Answer, Evidence strength, Top gaps.

Deck format: `lit-review`.

## Follow-up chips

Shown after the first pass.

- Go deeper on a claim: Go deeper on [claim]: find every paper that supports or contradicts it and re-score the evidence strength.
- Find the strongest counter-evidence: Find the strongest evidence against the main finding of "{{topic}}": papers, null results and replications that failed.
- Extend the search: Extend the search for "{{topic}}" to [another database or keyword set] and add only the papers not already in the Papers database.
- Write the abstract: Write a 250-word structured abstract (background, methods, results, conclusion) for this review of "{{topic}}", citing the cards.
- Add the new papers: I added new papers. Read them, add them to the Papers database, and say which claims or scores change.
- Keep it current: Watch for new papers on "{{topic}}" and tell me when one changes a conclusion.

## Signed-in sources

- Google Scholar (scholar.google.com): Citation counts, "cited by" lists and versions of a paper.
- JSTOR (jstor.org): Full text of humanities and social science papers the user can access.
- ScienceDirect (sciencedirect.com): Full text and abstracts of journals the user has access to.
- Web of Science (webofscience.com): Indexing, citation networks and journal quality.

## Monitor

Only when the user asks: `new papers, retractions and replications on {{topic}}`. New evidence that would change the conclusion.
