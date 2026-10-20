# Investigation

<!-- Generated from packages/shared/src/templates/investigation.ts by `pnpm templates:docs`. Do not edit by hand. -->

Investigate a claim, a person, an organisation, an event or a money flow from public records and the documents the user is entitled to use: a timeline, the entities and their links, a ledger of documents and sources, every claim verified or marked unverified with at least two independent sources, the counter-evidence, the right of reply and the legal and ethical flags. Eight numbered frames, a rubric and an investigation brief. Evidence over inference; protect sources and private people; the journalist decides and a lawyer reviews.

Template id `investigation`. Canvas title: `Investigation: {{subject}}`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| The subject (`subject`) | text | yes | placeholder "Acme Holdings and the Riverside contract" |
| The central question or claim (`question`) | longtext | yes | placeholder "What exactly are you trying to find out or test?" |
| Kind of investigation (`kind`) | select | yes | one of An organisation, A person in public life, An event, A viral claim or image, A money or contract trail, A policy or decision |
| Jurisdictions (`jurisdiction`) | text | no | placeholder "UK, Cayman Islands" |
| Period of interest (`period`) | text | no | placeholder "2019 to 2024" |
| Why it is in the public interest (`public_interest`) | longtext | yes | placeholder "Who is affected, what is at stake". orb collects information about private people only where it serves this. |
| What you already know or suspect (`known`) | longtext | no | placeholder "Leads, names, dates, documents you have" |
| Known sources or links (`sources`) | list | no | placeholder "URLs or names: comma separated. Confidential sources never go here.". Do not enter anyone who needs protection. orb never contacts sources. |
| Stage (`stage`) | select | no | one of Early: is there a story?, Building the case, Pre-publication checks |
| Materials (`materials`) | materials | no | Drop documents you are entitled to use: filings, contracts, datasets (CSV or XLSX), PDFs, images. Each becomes a card or database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites LexisNexis, Factiva, OpenCorporates, LinkedIn. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. Check each site’s terms. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, suggest_task_spec, parallel_extract, web_answer, image_search, entity_search, research_memory, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, batch_enrich, suggest_task_spec, parallel_extract, web_answer, image_search, entity_search, research_memory, watch_topic, find_entities_extend | 5 | no limit | full |

- **Quick scan:** No deep research: public pages, registries, search, extract and the signed-in fetches ticked, at most 12 cards per frame; the brief is the summary only.
- **Standard:** Quick, plus related entities found and enriched into the Entities database and one or two deep-research runs (core) on the gaps, asking before spend.
- **Deep:** Standard, plus FindAll for the full list of related organisations, pro research on the hardest gaps and the full investigation brief.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 QUESTION & SCOPE (signal; orb)

Brief: The central question ({{question|to confirm}}), the claims to test, what would count as proof, what is in and out of scope, the public interest, the stage ({{stage|to confirm}}), the working hypotheses, and the ethics note: what orb will and will not do.

Target: 2+ doc (question and scope; method and limits); 2+ hypothesis; 4+ metric.

Seed cards:
- doc: The question
- doc: Method and limits
- hypothesis: The central claim holds
- hypothesis: There is an innocent explanation
- metric: Claims tested
- metric: Primary documents
- metric: Independent sources
- metric: Open gaps
- question: What would disprove this?

### 02 TIMELINE (sky; scout, builder, critic)

Brief: What happened, in order, with dates and sources: events, decisions, filings, transactions, statements and reversals; who did what; where the record is silent; what depends on a single source. Dates are from the source, with the date the source was written next to the date of the event.

Target: 1+ database (Events: at least 15 rows); 1+ timeline (the key events); 5+ source.

Seed cards:
- database: Events (database `events`)
- timeline: Key events
- question: What happened in the gaps of the timeline?

### 03 ENTITIES & NETWORK (rho; scout, builder, critic)

Brief: The people, companies, agencies and other bodies in the story: who they are (by a second identifier), their role, their links to each other (ownership, employment, contracts, family or business ties from public records only), and the jurisdictions. A diagram of the network from sourced links, with every link’s source named. Private people appear only where the story needs them.

Target: 1+ database (Entities: at least 10 rows); 4+ entity (the central people and organisations); 1+ diagram (the network of sourced links).

Seed cards:
- database: Entities (database `entities`)
- question: Who is the same person or company under a different name?

### 04 DOCUMENTS & RECORDS (sky; scout, critic)

Brief: Every document and record: filings, registries, court and procurement records, contracts, reports, datasets, letters and screenshots. For each: the issuer, the date, how it was obtained, how its authenticity was checked, what it shows, what it does not and its reliability. Public records first.

Target: 1+ database (Documents: every record, authenticated or marked not); 6+ source; 1+ image (page captures with the date seen).

Seed cards:
- database: Documents (database `documents`)
- question: Which records exist that have not been requested yet?

### 05 CLAIMS & VERIFICATION (rho; scout, critic, builder)

Brief: Every claim in the story, one by one: who made it, where and when, what the evidence is, the status (unchecked, supported, contradicted, unverifiable), the independent sources behind it and the confidence. A claim is supported only with two independent sources or a primary record, and says which.

Target: 1+ database (Claims: every claim with its status); 3+ insight (supported or contradicted claims, each citing 2 or more cards); 1+ chart (claims by status).

Seed cards:
- database: Claims (database `claims`)
- chart: Claims by status (database `claims`)
- question: Which claim carries the story, and how well is it supported?

### 06 SOURCE ASSESSMENT (sky; critic, scout)

Brief: Every source in a ledger: what it is (primary record, official statement, news, expert, interested party, anonymous), who is behind it, what it knows first-hand, its track record, its interest in the outcome, how independent it is of the others, and a reliability rating. Confidential sources are never entered here by name.

Target: 1+ database (Source ledger); 1+ matrix (reliability of the key sources); 2+ insight (independence findings, each citing 2 or more cards).

Seed cards:
- database: Source ledger (database `source-ledger`)
- matrix: Reliability of the key sources

### 07 GAPS, COUNTER-EVIDENCE & CHECKS (paper; critic, orb)

Brief: What is missing and what cuts against the story: the strongest alternative explanation, the evidence against, the questions that remain, the right of reply for every named subject of criticism, and the legal and ethical checks. Work through the red-flag checklist: raise each flag as a Risk card with evidence or clear it with a source. Questions for a lawyer are listed, not answered.

Target: 6+ risk (every checklist item cleared with a source or raised); 6+ question; 2+ checklist.

Seed cards:
- checklist: Verification and ethics red flags
- checklist: Right of reply
- checklist: Questions for a lawyer or editor
- risk: Evidence risk
- risk: Defamation and privacy risk
- risk: Source safety risk
- risk: Provenance of materials risk

### 08 FINDINGS & STORY (signal; orb, builder)

Brief: What the evidence supports and what it does not: findings as insights that cite at least two cards, the hypotheses with confidence, the SWOT of the case, the rubric scored with cited evidence and a publication readiness decision (Not ready, Needs more reporting, Ready for legal and editorial review, Spike). An outline of the story with a source for every line.

Target: 3+ insight (each citing 2 or more cards); 1+ decision; 1+ matrix (the filled rubric); 1+ framework.

Seed cards:
- framework: SWOT of the case: {{subject}}
- doc: Story outline
- decision: Readiness: {{subject}}
- matrix: Scorecard (rubric score x 2, so 10 is a 5)

## Databases

### Events (frame `timeline`)

Every dated event of the story with its source and how sure we are.

| Column | Type | Notes |
|---|---|---|
| Event | text |  |
| Date | date | The date of the event, from the source. |
| Date precision | enum (Day, Month, Year, Approximate) |  |
| Actors | text | Names as they appear in the Entities database. |
| What happened | text |  |
| Source | url |  |
| Source date | date | When the source was written, to compare with the event date. |
| Confidence | enum (High, Medium, Low) |  |
| Single source | boolean |  |

Views: By date (table, sorted by Date asc); Single source (table, filtered); By confidence (board, by Confidence).

### Entities (frame `entities`)

People, companies and bodies in the story, with identifiers and links. Found with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| Type | enum (Person, Company, Agency, Non-profit, Other) |  |
| Role in the story | text |  |
| Identifier | text | Registry number, regulator id or another second identifier. |
| Jurisdiction | text |  |
| Aliases | text | Former names, trading names. |
| Linked to | text | Names in this database, each with the kind of link and the source in Notes. |
| Public figure | boolean | Whether the person has a public role relevant to the story. |
| Registry or record | url |  |
| Notes | text |  |

Views: All (table); By type (board, by Type); No identifier (table, filtered).

### Documents (frame `documents`)

Every document and record with issuer, date, provenance, authentication and reliability.

| Column | Type | Notes |
|---|---|---|
| Title | text |  |
| Type | enum (Filing, Registry record, Court record, Contract, Procurement, Report, Dataset, Letter or email, Image or video, Other) |  |
| Issuer | text |  |
| Date | date |  |
| Obtained | enum (Public record, Public website, Freedom of information, Supplied by the user, Unknown) |  |
| Authenticated | enum (Yes: how, in Notes, Partly, Not checked, Cannot be) |  |
| What it shows | text |  |
| What it does not show | text |  |
| Reliability | rating | 1 (low) to 5 (high). |
| URL | url |  |
| Notes | text |  |

Views: By date (table, sorted by Date asc); By authentication (board, by Authenticated); Not authenticated (table, filtered).

### Claims (frame `claims`)

Every claim, the evidence behind it and where it stands.

| Column | Type | Notes |
|---|---|---|
| Claim | text |  |
| Made by | text |  |
| Where and when | text |  |
| Status | enum (Unchecked, Supported, Contradicted, Unverifiable, Disputed) |  |
| Evidence 1 | url |  |
| Evidence 2 | url | An independent source or a primary record. |
| Independent sources | number |  |
| Counter-evidence | text |  |
| Confidence | enum (High, Medium, Low) |  |
| Key claim | boolean | The story fails without it. |
| Insight card | text | The insight that records the finding. |

Views: By status (board, by Status); Key claims (table, filtered); Weak (table, filtered).

### Source ledger (frame `sources`)

Every source with its type, independence and reliability. Confidential sources are never entered by name.

| Column | Type | Notes |
|---|---|---|
| Source | text |  |
| Type | enum (Primary record, Official statement, News report, Expert, Interested party, Anonymous, Social post, Other) |  |
| Behind it | text | Owner, funder or author. |
| First-hand | boolean |  |
| Interest in the outcome | enum (None known, Some, Direct) |  |
| Independent of | text | Which other sources it does not depend on (and which it copies). |
| Track record | text |  |
| Reliability | rating | 1 (low) to 5 (high). |
| URL | url |  |

Views: By reliability (table, sorted by Reliability desc); By interest (board, by Interest in the outcome); Interested (table, filtered).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first (documents, datasets, images): read_card, read_source, query_dataset. Put each file into Documents with Obtained as the user says; ask with ask_user_question how a file was obtained when it matters (leaked or unclear material is flagged, not refused). Turn the central question into the claims to test: one row each in Claims (upsert_rows, key Claim) with Status Unchecked and the Key claim flag. Hand the question, the known leads and sources, the period and the ticked signed-in sources to Scout in its delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`, `ask_user_question`.
2. Delegate with delegate: Scout first (its playbook), Builder once Events and Entities have rows, Critic once Scout has sources. Tell each agent: evidence apart from inference, nothing about private people beyond the public interest, nobody is contacted, confidential sources never appear. Tools: `delegate`, `message_agent`.
3. After Scout’s first pass, fill the Scope metrics (update_card) and refine the central question, each figure computed from the databases (query_dataset) or cited. Update the two hypotheses with evidence for and against as card ids. Tools: `query_board`, `search_board`, `query_dataset`, `update_card`, `add_link`.
4. For a gap Scout could not close (a registry, a decision, an unexplained transaction), run deep_research (core) on that one question; ask before spend over $0.50. For a related organisations list, find_entities or entity_search; for a list to enrich, batch_enrich. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `find_entities`, `entity_search`, `batch_enrich`, `ask_user_question`.
5. Record each supported or contradicted claim as an Insight that cites at least two cards (the evidence cards) and set the Claims row (Status, Insight card); a claim you cannot support stays Unverifiable. Fill the Scorecard matrix (one 1-to-5 score per dimension, doubled on the matrix, each cited), the SWOT, the story outline (each line with its card) and the Readiness decision with your proposal and the weighted total. The user decides. Tools: `query_board`, `query_dataset`, `read_card`, `update_card`, `place_card`, `add_link`.
6. Keep the “Right of reply” checklist current: every named subject of criticism, and a draft request as a doc card for the user to send (orb never contacts anyone). Tools: `search_board`, `update_card`, `place_card`, `add_link`.
7. Write the investigation brief with compose_section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. The deck follows with compose_slides if asked. Tools: `compose_section`, `compose_slides`.
8. Only when the user asks to keep watching the subject: watch_topic with the monitor query (new filings, court records, news). Each monitor is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. The baseline: what is already public about the subject and the question: news (web_search), the subject’s own statements and pages (fetch_url, parallel_extract), and the sources named in the intake. Source cards with a date seen; a source ledger row for each (upsert_rows, key Source) with Type, Interest in the outcome and what it knows first-hand. Capture_page for pages that may change, so the date seen is kept. Tools: `web_search`, `fetch_url`, `parallel_extract`, `capture_page`, `place_card`, `upsert_rows`.
2. Primary records: company registries, filings, courts, procurement, land and charity registers, regulator databases for the jurisdictions in the intake; signed-in databases the user connected (fetch_signed_in, read-only; terms apply). One row per record in Documents (upsert_rows, key Title) with Issuer, Date, Obtained and Authenticated set honestly; a source card for the key ones. Public records before anything else. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `parallel_extract`, `read_source`, `upsert_rows`, `place_card`.
3. Entities: from the records and the intake. find_entities finds related companies and bodies (shareholders, directors, contractors) when the tier allows; batch_enrich fills identifier, jurisdiction and role. Consolidate into Entities with upsert_rows (key Name): a second identifier on each row, aliases, and “Linked to” with the source of each link in Notes. Entity cards for the central ones. Private individuals only if the story needs them, in their public role. Tools: `find_entities`, `batch_enrich`, `web_search`, `fetch_url`, `query_dataset`, `upsert_rows`, `place_card`.
4. Timeline: one row per event in Events (upsert_rows, key Event) with Date from the source, Date precision, Actors, a Source and its date, and Single source set. Mark the events that rest on one record. Tools: `web_search`, `fetch_url`, `upsert_rows`, `query_dataset`.
5. Verify the claims: for each claim in Claims, search for an independent source or a primary record; update the rows you wrote with Evidence and the number of independent sources (upsert_rows). A source that copies another counts once. Quote cards for the statements themselves, with where and when; images and videos with the original context and date, and what a reverse image search shows. Tools: `web_search`, `fetch_url`, `image_search`, `place_card`, `query_dataset`, `upsert_rows`.
6. Counter-evidence: the strongest alternative explanation and the best case the subject would make; source cards and quote cards for it, with the same care. Report anything that cuts against the central claim to orb with send_message. Tools: `web_search`, `fetch_url`, `place_card`, `send_message`.
7. Deep research for the gaps that remain: deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout’s first sources: read every frame’s cards (board_map, search_board, read_card) and the Events, Documents, Claims and Source ledger rows (query_dataset) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`, `query_dataset`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." citing the source cards that clear it (an insight needs at least two cited cards). You give no legal advice: raise what needs a lawyer. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Source assessment: score the key sources on the reliability matrix (0 to 10 per criterion, each with its basis), and place an Insight for every finding about independence (for example that two reports trace to one press release), citing both cards. Tools: `place_card`, `add_link`, `query_dataset`, `read_card`.
4. Claims: for each key claim place an Insight or a Question: supported by two independent sources or a primary record, or what is missing. Link tension to cards that disagree. Test the alternative explanation as a Hypothesis with its own evidence links. Tools: `query_dataset`, `query_board`, `read_card`, `place_card`, `add_link`.
5. Turn every gap into a Question card in Gaps, with a link to the card that prompted it: missing records, a silent period, an unreplied subject, a name that may be two people. Rank them by how much the story depends on each. Tools: `place_card`, `add_link`, `query_board`.
6. Report progress per frame; send_message to orb when the checklist is complete, naming the flags raised. Tools: `report_progress`, `send_message`.

### Builder

1. The key-events timeline card, built from Events with their sources (query_dataset), single-source events marked; and the claims-by-status chart bound to Claims. Tools: `place_card`, `query_dataset`, `read_card`.
2. The network as a diagram: nodes from Entities, edges only from sourced links in the Linked to column, edge labels naming the kind of link and source. Mark each edge’s confidence. No inferred links. Tools: `place_card`, `query_dataset`, `read_card`.
3. For a money or contract trail: a chart or a table of the flows from the Documents and Events rows (amounts, dates, parties), each figure sourced; a diagram of the flow if it helps. Tools: `place_card`, `query_dataset`, `upsert_rows`.
4. Optional one-page visual summary (a design frame): the question, the findings with their evidence strength, the timeline in brief and the open gaps, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. A key claim rests on a single source. *How:* For each key claim in Claims, count independent sources (not copies of one report). One is a flag.
2. A document’s authenticity is not checked (metadata, issuer, registry, a second copy). *How:* For each document in Documents that carries a claim, record how it was authenticated; “not checked” is a flag.
3. A source with an interest in the outcome carries a key claim (a party, a competitor, an advocacy group, a seller). *How:* Read the Source ledger; interested sources need an independent confirmation.
4. The timeline has a gap, an inconsistency or dates that depend on a single record. *How:* Sort Events by date; check the order, the gaps and the time zones, and the date of each source against the date of the event.
5. Entity confusion: two people or companies with the same or a similar name treated as one. *How:* For each Entity, check a second identifier (registry number, address of record, birth year of a public record, a distinct role).
6. Counter-evidence or an alternative explanation has not been tested. *How:* For each finding, search for the strongest alternative explanation; place it as a hypothesis with its evidence.
7. Right of reply has not been sought for people or organisations the findings criticise. *How:* List each named subject of criticism and whether a reply was requested; a draft request is a proposal for the user to send.
8. Defamation or privacy exposure: a statement about a named individual that rests on weak evidence, or private information with no public interest. *How:* Mark each such statement; weak evidence means “alleged”, “said”, or out. Private facts without public interest are raised for removal. This is not legal advice.
9. Source safety: material that could identify a confidential source or put someone at risk. *How:* Check the board and the draft for details that reveal a source; raise them for the user to decide. orb never contacts sources.
10. Provenance of materials: documents the user supplied may have been obtained improperly or may be leaked; legal and ethical status unknown. *How:* Ask the user how each file was obtained when it matters to publishing; mark the answer in Documents. Public records are preferred.
11. A visual or quote is out of context (a cropped image, a quote trimmed, a screenshot with no date). *How:* Find the original context for each image, video or quote card and cite it; undated screenshots are flagged.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Strength of the evidence | 30% | Rests on claims, rumour or one document. | Key claims have a document or two independent sources. | Every key claim is backed by primary documents and independent sources. | claims |
| Source reliability and independence | 25% | Anonymous, interested or unverifiable sources carry the story. | A mix of primary and secondary sources; some interested. | Primary records and independent, named sources carry the story. | sources |
| Public interest | 15% | Little public interest; mainly private matters. | Of interest to a defined public. | Clear, significant public interest. | findings |
| Counter-evidence and right of reply | 20% | Alternative explanations not tested; no reply sought. | The main alternatives are tested; a reply is requested. | Alternatives tested and answered; replies sought and recorded. | gaps |
| Legal and ethical readiness | 10% | Privacy, defamation or source-safety questions open. | Known risks, a plan to resolve them. | Checked by the right reviewer; sources protected. | gaps |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Investigation brief: {{subject}}. Every paragraph cites cards; every factual claim cites its source and says whether it rests on a primary record or independent sources; unverified claims are marked unverified; evidence and inference are kept apart.

1. Summary & readiness (at most 150 words): The question, what the evidence supports, the score, the readiness decision and the three biggest gaps, in at most 150 words.
2. Question, method & limits: The question, the public interest, how claims were verified, and what was not done.
3. Timeline: The events in order with sources, confidence and the gaps in the record.
4. People, organisations & links: Who is who, with identifiers, and the sourced links between them.
5. Documents & records: The key records, how each was obtained and authenticated, and what each shows and does not.
6. Claims & verification: Each claim, its status, the independent sources or primary record behind it and the counter-evidence.
7. Sources & independence: The source ledger in brief, the interested sources and the independence findings.
8. Gaps, counter-evidence & checks: The strongest alternative explanation, the red-flag outcomes, the right-of-reply status and the questions for a lawyer or editor.
9. Findings & story outline: What the evidence supports, each finding citing its cards, and the outline of the story.
10. Scorecard: The rubric table: each dimension, weight, score and evidence.

Appendix: All sources and the source ledger.

One-page summary: The question, Findings and strength of evidence, Score and readiness, Open gaps, Right of reply status.

Deck format: `standard`.

## Follow-up chips

Shown after the first pass.

- Steelman the other side: Build the strongest case for the alternative explanation in {{subject}}, from the cards on this board, and say what evidence would decide between the two.
- What is single-sourced?: List every key claim and event in {{subject}} that rests on a single source, and the cheapest way to get a second.
- Draft the right-of-reply requests: Draft right-of-reply requests for everyone criticised in {{subject}}: what we found, what we ask, a deadline. For me to send.
- Find the next record: Which public records for {{subject}} have we not looked at? List them by jurisdiction with where to get each, and the claim each would test.
- Check for legal and ethical risks: Review every statement about a named person or organisation in {{subject}}: which rest on weak evidence, and what questions go to a lawyer or editor?
- Watch for new filings: Watch {{subject}} for new filings, court records and news, and tell me what changes the findings.

## Signed-in sources

- LexisNexis (lexisnexis.com): News archives and public records the user already has access to. Read-only.
- Factiva (factiva.com): News and company archives the user already has access to. Read-only.
- OpenCorporates (opencorporates.com): Company registry records and officers across jurisdictions.
- LinkedIn (linkedin.com): Public professional roles of people in public life. Terms apply: read-only, rate-limited.

## Monitor

Only when the user asks: `{{subject}} new filings, court records, investigations and news`. New records or statements that would change the findings.
