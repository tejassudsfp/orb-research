# Deep dive

<!-- Generated from packages/shared/src/templates/deep-dive.ts by `pnpm templates:docs`. Do not edit by hand. -->

Build a deep, evidence-based understanding of a topic: a working thesis, the background and definitions, the strongest evidence for and against, the key sources with their reliability, the perspectives and debates, a timeline and a map of the concepts, and a synthesis scored by an understanding rubric. Look for the best opposing evidence, prefer primary sources, give every claim a citation and say what is still open.

Template id `deep-dive`. Canvas title: `Deep dive: {{topic}}`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Topic (`topic`) | text | yes | placeholder "Solid-state batteries" |
| Goal (`goal`) | select | no | one of Understand it, Decide something, Write about it, Teach it, Test a claim |
| Your level (`level`) | select | no | one of New to it, Some background, Expert |
| Working thesis or claim (`thesis`) | longtext | no | placeholder "Solid-state batteries will reach mass-market cars before 2030.". Optional. orb proposes one when this is empty. |
| What you already know (`known`) | longtext | no | placeholder "Anything you have read or believe." |
| Questions you want answered (`questions`) | longtext | no | placeholder "One per line" |
| Scope or period (`scope`) | text | no | placeholder "Since 2015, worldwide" |
| Sources you trust or want included (`sources_known`) | list | no | placeholder "URLs, outlets or authors, comma separated". Optional. |
| Materials (`materials`) | materials | no | Drop articles, PDFs, notes or a link list. Each becomes a card; Scout reads them first. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites The New York Times, Financial Times, The Wall Street Journal, Substack. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search | 8 | no limit | full |

- **Quick scan:** No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the report is the summary only.
- **Standard:** Quick, plus source discovery with find_entities, batch enrichment of Key sources and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on the strongest objection and the key numbers, FindAll extension for a complete source list and the full report.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 THESIS & KEY QUESTIONS (signal; orb)

Brief: What you want to understand, stated as a thesis that could be wrong and a short list of key questions. The thesis is refined as evidence comes in; the questions decide what is researched.

Target: 1+ hypothesis (the working thesis); 4+ question (the key questions); 1+ doc.

Seed cards:
- hypothesis: Thesis: {{topic}}
- doc: What I want to know
- question: Your questions: {{questions|none given yet}}
- question: What would change my mind?

### 02 BACKGROUND & DEFINITIONS (sky; scout, builder, orb)

Brief: The shortest path to being able to read the rest: what the topic is, the key terms defined the way the sources use them, the history in a few paragraphs, the main concepts and how they connect, and the scale (numbers that give a sense of size).

Target: 2+ doc (definitions and a short history); 4+ metric (the scale, each cited); 1+ diagram (a concept map); 1+ timeline.

Seed cards:
- doc: Key terms
- metric: Scale
- metric: Growth or change
- timeline: History

### 03 KEY SOURCES (rho; scout, critic, builder)

Brief: The best sources on the topic and how far to trust each: primary documents, datasets, expert and institutional reports, reputable reporting and the strongest advocates on each side. One row each with the type, the date, the stance, any interest in the outcome and a reliability rating.

Target: 1+ database (the Key sources database, at least 15 on Standard); 6+ source (the best sources as cards, including primary ones); 1+ chart.

Seed cards:
- database: Key sources (database `sources`)
- chart: Sources by stance (database `sources`)
- chart: Sources by type (database `sources`)

### 04 EVIDENCE FOR (sky; scout, critic)

Brief: The strongest evidence that supports the thesis: facts, data, studies, expert statements and examples, each as a card that says what it shows and how strong it is. Primary and independent evidence first; mark the rest.

Target: 4+ source; 3+ quote (with where in the source); 2+ metric; 1+ insight (what the evidence adds up to).

Seed cards:
- question: What is the single strongest piece of evidence for the thesis, and why?

### 05 EVIDENCE AGAINST (rho; scout, critic)

Brief: The strongest evidence and arguments against the thesis, stated as fairly as their holders would state them: contrary data, failed predictions, competing explanations and the best critics. Equal effort to the case for. Say which objections the thesis answers and which it does not.

Target: 4+ source; 3+ quote (the critics in their own words); 2+ risk (the objections the thesis cannot yet answer).

Seed cards:
- question: What is the strongest objection to the thesis?
- framework: Thesis: pros and cons

### 06 PERSPECTIVES & DEBATES (sky; scout, critic, builder)

Brief: Who disagrees with whom and why: the schools of thought, the main debates, what each side values and which facts each says matter most, and where the disagreement is about facts, values or definitions.

Target: 1+ framework (the positioning of the camps); 1+ matrix (perspectives against the key questions); 3+ entity (the leading voices).

Seed cards:
- framework: Where the camps stand
- matrix: Perspectives against the key questions

### 07 EVIDENCE QUALITY & RED FLAGS (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Also covers weak links in the argument: unstated assumptions, definitions that shift, and conclusions that go further than the evidence.

Target: 5+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Red-flag checklist
- risk: Source risk
- risk: Reasoning risk
- risk: Bias risk

### 08 SYNTHESIS (signal; orb)

Brief: What it adds up to: the thesis restated with the confidence it deserves, the answer to each key question, the understanding score by the rubric, the one thing to remember and what would change the conclusion.

Target: 1+ matrix (the filled rubric); 1+ decision; 2+ hypothesis (with evidence links); 2+ insight.

Seed cards:
- matrix: Understanding scorecard (rubric score x 2, so 10 is a 5)
- decision: Where the thesis stands: {{topic}}
- hypothesis: The refined thesis

### 09 OPEN QUESTIONS & NEXT READS (paper; critic, orb)

Brief: What is still unknown, ranked by importance and linked to the gap behind each, and a short reading list: where to go next to settle them, with the best primary source first.

Target: 2+ checklist (open questions and the reading list, ranked).

Seed cards:
- checklist: Next reads
- checklist: Open questions

## Databases

### Key sources (frame `sources`)

The best sources, how reliable each is and what stake it has in the outcome.

| Column | Type | Notes |
|---|---|---|
| Title | text |  |
| Author or organisation | text |  |
| Type | enum (Primary document, Dataset, Peer-reviewed, Institutional report, News, Analysis or opinion, Book, Video or talk) |  |
| Date | date |  |
| Stance | enum (Supports, Against, Mixed, Neutral) |  |
| Interest | text | Funder, seller or campaign, or none found. |
| Reliability | rating | 1 (weak) to 5 (very reliable). |
| Key point | text |  |
| URL | url |  |

Views: All (table, sorted by Reliability desc); By stance (board, by Stance); Primary (table, filtered).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first (read_card and read_source). Propose a working thesis in the Thesis card when the intake left it empty, and split the user’s questions into separate Question cards (place_card). Hand the trusted sources and the ticked signed-in sources to Scout in its delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `place_card`, `update_card`.
2. Delegate with delegate: Scout first (background, sources, evidence for and against), Builder once Scout has placed its first sources, Critic once there is evidence on both sides. Tell Scout to give the case against the same effort as the case for. Tools: `delegate`, `message_agent`.
3. After Scout’s first pass, write the key-terms card and fill the Scale and Growth metrics (update_card), each with a cited figure and its year. Never write a number you cannot source. Tools: `query_dataset`, `query_board`, `search_board`, `update_card`.
4. For a gap Scout could not close (a primary source, the best critic, a figure with no origin), run deep_research (core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
5. At the end fill the Understanding scorecard: one 1-to-5 score per rubric dimension (doubled on the matrix), each with a cited card. Restate the thesis with its confidence (evidence for and against as card ids), place insight cards that cite at least two cards each, and fill the Decision card: your proposed option and the weighted total in its rationale. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
6. Write the report with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. Tools: `compose_section`.
7. Keep the open questions and the reading list current: collect every unresolved Question card into the checklists, ranked, each linked to its source card. Tools: `search_board`, `update_card`, `add_link`.

### Scout

1. Start from the sources the user trusts or named in the intake, then the best overview you can find (an institution or a textbook, not a blog). Place source cards, and add each to Key sources (upsert_rows, key Title) with Type, Date, Stance, Interest and a Reliability rating. fetch_signed_in for the paywalled outlets the user connected. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
2. Background: definitions in the terms the sources use, a short history as dated events on the timeline (place_card) and two or three numbers that show the scale, each as a metric card with source and year. Use web_answer for a quick figure, then the primary source. Tools: `web_search`, `fetch_url`, `web_answer`, `parallel_extract`, `place_card`.
3. More sources: find_entities with the topic and the key questions as objective (the match limit follows the depth tier) fills its own database card; batch_enrich fills Type, Author or organisation, Date, Stance and Key point. Copy the rows into Key sources (query_dataset, upsert_rows, key Title), a URL on every row. On the Quick tier those two are refused: add the best sources from web_search with upsert_rows instead. Tools: `find_entities`, `batch_enrich`, `web_search`, `query_dataset`, `upsert_rows`.
4. The case for: the strongest primary and independent evidence for the thesis. Source cards, quote cards with the place in the source, and metric cards for the numbers; say what each piece shows and how strong it is. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`.
5. The case against, with equal effort: search for the best critics, contrary data, failed predictions and competing explanations; quote the critics in their own words and state their objections fairly. Do not stop at weak objections. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`.
6. The leading voices on each side: one entity card per person or organisation (role, affiliation, position) and a quote that shows where they stand. Tools: `web_search`, `fetch_url`, `place_card`.
7. Deep research for the gaps that remain: deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start once there is evidence on both sides: read the Key sources database and the cards of every frame (board_map, search_board, read_card, query_dataset) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`, `query_dataset`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source cards that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Weigh the two sides: link each strong piece of evidence for with "tension" to the evidence against that answers it, place an Insight that cites both when it settles the point, and place a Risk for each objection the thesis cannot yet answer. Place the perspectives matrix scoring each camp. Tools: `read_card`, `query_dataset`, `add_link`, `place_card`.
4. Turn every gap into a Question card in the next frame, with a link to the card or gap that prompted it. Tools: `place_card`, `add_link`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. A concept map (diagram) of the key terms and how they connect, from the key-terms card and the sources, so a newcomer can read the rest. Tools: `place_card`, `read_card`, `query_board`.
2. Charts bound to Key sources: sources by stance (bar) and by type (pie). Never an inline chart when a database holds the data. Tools: `place_card`, `query_dataset`.
3. The camps quadrant (framework) and the perspectives matrix (weighted criteria, scores 0 to 10 from the cards), built from the voices Scout placed. Tools: `place_card`, `read_card`, `query_board`.
4. Optional one-page visual summary (a design frame): the thesis, the strongest evidence each way and the score, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. The thesis rests on one source, or on sources that cite each other. *How:* Count independent origins in the Key sources database; raise a claim that traces back to one.
2. The evidence for and the evidence against are very unequal in quality or amount. *How:* Compare the counts and the reliability ratings of the For and Against frames and raise a lopsided pair.
3. Secondary summaries are used where a primary source exists. *How:* For each key claim look for the original document, dataset or statement; raise those cited second-hand.
4. A source has a clear interest in the conclusion (funder, seller, campaign). *How:* Read the Interest column of Key sources; raise claims backed only by interested parties.
5. Key sources are out of date for a topic that moves quickly. *How:* Compare the Date column with the pace of the topic; raise outdated support for a current claim.
6. Definitions shift between sources, so the evidence is not about the same thing. *How:* Compare how sources define the key terms; raise claims that stretch across incompatible definitions.
7. Correlation presented as causation. *How:* For each causal claim look for a design or argument that supports cause; raise those with only association.
8. Numbers without a base rate, denominator or comparison. *How:* Check each figure in the metrics and quotes for what it is a share of and what it is compared with.
9. One region, period or group stands for the whole. *How:* Look at the place and time of the evidence; raise claims generalised from one setting.
10. Quotes or statistics that may be out of context, or that circulate with no origin. *How:* Trace each striking quote or number to its origin and place the finding in Key sources.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Quality of evidence | 25% | Opinion pieces and secondary summaries. | A mix of primary sources and reputable reporting. | Primary data, peer-reviewed work and independent confirmation. | for |
| Diversity of sources | 20% | One outlet, one viewpoint. | Several outlets, mostly one viewpoint. | Independent sources across viewpoints, regions and time. | sources |
| Counter-evidence addressed | 25% | The best opposing evidence is not looked for. | Opposing views are listed, not answered. | The strongest opposing evidence is stated and answered. | against |
| Recency | 10% | Mostly outdated. | Some recent sources. | Current to the last few months where the topic moves fast. | sources |
| Explanatory power | 20% | The thesis explains little of the evidence. | It explains the main facts, with loose ends. | It explains the evidence, predicts and survives the objections. | synthesis |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Deep dive: {{topic}}. Every paragraph cites cards; every number cites its source and its year; the case for and the case against get equal space.

1. Summary (at most 200 words): The thesis, where it stands, the strongest evidence each way and what is open, in at most 200 words.
2. The question & thesis: What was asked, the working thesis and why it matters.
3. Background & definitions: The terms, the short history and the scale.
4. The sources: The best sources, how far each is trusted and what interest they have.
5. The case for: The strongest evidence for the thesis, with how strong it is.
6. The case against: The strongest evidence and arguments against it, stated fairly.
7. Perspectives & debates: The camps, what divides them and whether it is facts, values or definitions.
8. Quality of the evidence: The red-flag outcomes and the scored rubric with its evidence.
9. Conclusion: The refined thesis with its confidence and what would change it.
10. Open questions & next reads: The ranked open questions and the reading list.

Appendix: All sources.

One-page summary: Thesis, Evidence for, Evidence against, Score, Open questions.

Deck format: `deep-dive`.

## Follow-up chips

Shown after the first pass.

- Argue the other side: Write the strongest case against "{{topic}}" from the sources on this board, and say what would answer each point.
- Explain it to a newcomer: Explain "{{topic}}" to someone new to it in five short paragraphs, citing the cards, defining each term on first use.
- Find the primary source: Find the primary source behind [claim] and replace the second-hand citations with it.
- Test a claim: Test this claim against the evidence on the board: [claim]. Say supported, partly or not, with the cards that decide it.
- Make a reading plan: Make a reading plan for "{{topic}}": the order to read the key sources and what to look for in each, about three hours in all.
- Turn it into a decision: Turn this deep dive into a decision: the options, what the evidence says about each and what I should do.

## Signed-in sources

- The New York Times (nytimes.com): Paywalled reporting and archives.
- Financial Times (ft.com): Paywalled business and economic reporting.
- The Wall Street Journal (wsj.com): Paywalled business reporting.
- Substack (substack.com): Subscriber-only analysis from independent writers.
