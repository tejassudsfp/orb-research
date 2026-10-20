# Candidate research

<!-- Generated from packages/shared/src/templates/candidate.ts by `pnpm templates:docs`. Do not edit by hand. -->

Research a hiring candidate from public professional information only: career history, work evidence, public professional record, fit against the role requirements, verification of claims, and a plan for the interview and references. Eight numbered frames, a weighted rubric and a candidate brief. Never collect or use sensitive personal attributes; every card must trace to a requirement of the role.

Template id `candidate`. Canvas title: `{{candidate}}: candidate research for {{role|the role}}`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Candidate name (`candidate`) | text | yes | placeholder "Ada Lovelace" |
| Role being hired (`role`) | text | yes | placeholder "Senior Backend Engineer" |
| Hiring organisation (`hiring_org`) | text | no | placeholder "Acme Robotics" |
| Level (`level`) | select | no | one of Early career, Mid-level, Senior, Lead / Manager, Director, VP or executive |
| Why you are researching them (`basis`) | select | yes | one of They applied, Sourcing: before outreach, Interview preparation, Reference or background check with their consent. orb researches public professional information only, and never anything the role does not need. |
| What the role requires (`requirements`) | longtext | yes | placeholder "Must-haves, one per line: e.g. distributed systems at scale; led a team of 5+; Go or Rust" |
| Nice to have (`nice_to_have`) | longtext | no | placeholder "Optional." |
| Public professional links (`links`) | list | no | placeholder "LinkedIn, GitHub, personal site, publications: comma separated". Optional. orb finds the public professional presence if missing, and does not look for personal accounts. |
| Location (professional) (`location`) | text | no | placeholder "Berlin, or remote" |
| Professional questions to probe (`concerns`) | longtext | no | placeholder "E.g. depth in the stack, management experience, reason for short tenures…" |
| Materials (`materials`) | materials | no | Drop the resume, cover letter, portfolio or take-home. Each becomes a card or database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites LinkedIn, GitHub, Google Scholar. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. Check each site’s terms: LinkedIn restricts automated access. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, suggest_task_spec, parallel_extract, web_answer, image_search, entity_search, research_memory, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, batch_enrich, suggest_task_spec, parallel_extract, web_answer, image_search, entity_search, research_memory, watch_topic, find_entities_extend | 4 | no limit | full |

- **Quick scan:** No deep research: public pages, search, extract and the signed-in fetches the user ticked, at most 12 cards per frame, and the candidate brief is the summary only.
- **Standard:** Quick, plus enrichment of the work-evidence list and one or two deep-research runs (core) on the candidate’s published work, asking before spend.
- **Deep:** Standard, plus pro deep research on the hardest requirement gaps and the full candidate brief.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 PROFILE (signal; orb)

Brief: Who {{candidate}} is professionally: current role and employer, years in the field, seniority, location and the one-paragraph professional summary, and what this research is for ({{basis|to confirm}}). Public professional information only: nothing about age, health, family, beliefs, origin, appearance, money or home.

Target: 1+ entity (the candidate); 4+ metric; 1+ doc (the professional summary).

Seed cards:
- entity: {{candidate}}
- doc: Professional summary
- doc: Scope and privacy
- metric: Years in field
- metric: Current tenure
- metric: Roles held
- metric: Requirements met

### 02 CAREER & EXPERIENCE (sky; scout, critic)

Brief: Every employer and role with dates, title, scope (team size, budget, product), reason for moving where public, promotions, gaps and overlaps, education and certifications that the role asks for. Each row has a source.

Target: 1+ database (Career history); 1+ timeline; 3+ source.

Seed cards:
- database: Career history (database `career-history`)
- timeline: Career timeline
- question: Is the career path coherent for this role?

### 03 WORK EVIDENCE (rho; scout, builder, critic)

Brief: Public evidence of the work: repositories, papers, products shipped, talks, case studies, design or writing portfolios. For each piece: what the candidate did (their part, not the team’s), the outcome, the date and the skills it shows. Link each to the requirement it supports.

Target: 1+ database (Work evidence); 4+ source; 1+ matrix (skills against requirements).

Seed cards:
- database: Work evidence (database `work-evidence`)
- matrix: Skills against requirements
- question: What is the strongest piece of public work, and what part is theirs?

### 04 PUBLIC PROFESSIONAL RECORD (sky; scout)

Brief: Talks, articles, open-source contributions, podcasts, patents and publications, endorsements by named colleagues or customers in public, awards. How they communicate and how others describe their work. Professional channels only.

Target: 3+ quote (what others say about the work; at least 1 critical or qualified); 1+ video (a talk or interview, linked not embedded); 3+ source.

Seed cards:
- timeline: Public record
- question: How do they explain their work to others?

### 05 FIT TO THE ROLE (rho; orb, builder, critic)

Brief: The role’s requirements as a list, each with the evidence for it, the strength (strong, partial, none, not knowable from public sources) and the card that holds it. Weighted comparison of the candidate against the role; where the evidence is thin, what to ask in the interview.

Target: 1+ database (Requirements, each with evidence); 1+ framework (strengths and gaps); 1+ chart (evidence strength by requirement).

Seed cards:
- database: Requirements (database `requirements`)
- framework: Strengths and gaps against the role
- chart: Evidence strength by requirement (database `requirements`)

### 06 VERIFICATION & RED FLAGS (paper; critic)

Brief: Work through the red-flag checklist. Raise each flag as a Risk card with evidence, or clear it with a source. Unverified is not false: say what was searched. Flag anything on the board that is not professional information so that it can be removed.

Target: 4+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Red-flag checklist
- risk: Credentials risk
- risk: Career story risk
- risk: Authorship of work risk
- risk: Privacy and fairness risk

### 07 INTERVIEW & REFERENCES (paper; critic, orb)

Brief: The questions to ask, ranked, each linked to the gap or claim that prompted it; the work sample to request; references to ask for (never contacted by orb) and what to ask them. Questions about the role only.

Target: 1+ checklist (at least 8 ranked interview questions, each linked to its source card); 3+ question.

Seed cards:
- checklist: Interview questions
- checklist: Reference questions

### 08 RECOMMENDATION (signal; orb)

Brief: The case to advance and the case against, the hypotheses with confidence, the score against the rubric and a recommendation (Advance, Hold, Pass, Need more information) with conditions. Based on the role’s requirements only.

Target: 1+ decision; 2+ hypothesis (with evidence links); 1+ matrix (the filled rubric); 1+ framework (SWOT of the candidacy).

Seed cards:
- hypothesis: {{candidate}} can do the core of {{role|the role}} from day one
- hypothesis: The strongest claims on the resume hold up
- framework: SWOT: {{candidate}} for {{role|the role}}
- decision: Recommendation on {{candidate}}
- matrix: Scorecard (rubric score x 2, so 10 is a 5)

## Databases

### Career history (frame `career`)

Every role, in order, with scope and a source. Public professional sources only.

| Column | Type | Notes |
|---|---|---|
| Role at employer | text |  |
| Employer | text |  |
| Title | text |  |
| Start | date |  |
| End | date | Empty: current role. |
| Team or scope | text | Team size, budget, product area, as the source states it. |
| Verified | enum (Claimed only, Independent source, Not verifiable) |  |
| Source | url |  |
| Flags | text | A gap, an overlap or an unclear title; a fact, not a judgement. |

Views: By start (table, sorted by Start asc); Verification (board, by Verified); Flagged (table, filtered).

### Work evidence (frame `work`)

Public pieces of work, what the candidate did in each, and the requirement each supports.

| Column | Type | Notes |
|---|---|---|
| Work | text |  |
| Type | enum (Code, Paper, Product, Talk, Article, Design, Case study, Other) |  |
| Date | date |  |
| Their part | text | What the candidate did, as the source credits it. |
| Outcome | text |  |
| Skills shown | text |  |
| Requirement | text | The requirement it supports. |
| Strength | rating | 1 (weak) to 5 (strong). |
| Source | url |  |

Views: All (table, sorted by Strength desc); By type (board, by Type); Strong (table, filtered).

### Requirements (frame `fit`)

The role’s must-haves and nice-to-haves, each with the evidence for it.

| Column | Type | Notes |
|---|---|---|
| Requirement | text |  |
| Type | enum (Must-have, Nice to have) |  |
| Weight | number | 1 to 10 from the hiring brief. |
| Evidence | enum (Strong, Partial, None, Not knowable publicly) |  |
| Evidence summary | text |  |
| Card | text | The card or row that holds it. |
| Interview question | text | What to ask when the evidence is partial or missing. |

Views: All (table, sorted by Weight desc); By evidence (board, by Evidence); Gaps (table, filtered).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first (resume, portfolio, take-home): read_card and read_source for files. Turn the role requirements from the intake into one row each in the Requirements database (upsert_rows, key Requirement, Type Must-have or Nice to have, a Weight from 1 to 10). Put each resume claim in Career history with Verified "Claimed only". Confirm the privacy scope: public professional information only, for {{basis|the stated purpose}}. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`, `ask_user_question`.
2. Delegate with delegate: Scout first (its playbook), Critic once Scout has placed its first sources, Builder once Work evidence has rows. Pass on the links given in the intake and the ticked signed-in sources. Tell each agent that anything outside the role’s requirements is not collected. Tools: `delegate`, `message_agent`.
3. After Scout’s first pass, fill the Profile metrics (update_card) and the professional summary with cited figures only; a figure you cannot source stays "—". Tools: `query_board`, `search_board`, `update_card`.
4. For a requirement Scout could not evidence, run deep_research (core) on that one question about the candidate’s published work. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
5. At the end, fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with a cited card in the why line. Then the SWOT, the hypotheses with evidence for and against, and the Decision card: the proposed option and the weighted total in its rationale. A person decides. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
6. Act on Critic’s privacy flags: tell the user, with ask_user_question, which card holds non-professional information so that they can delete it (agents cannot delete cards), and keep it out of the summary, the scorecard and the memo meanwhile. Tools: `search_board`, `ask_user_question`, `update_card`.
7. Write the candidate brief with compose_section, in the order of the outline, then the one-page summary. On the Quick tier write the summary only. Tools: `compose_section`.
8. Keep the interview questions current: collect every unresolved Question card into "Interview questions", ranked, each linked to its source card, and the work sample to request. Tools: `search_board`, `update_card`, `add_link`.

### Scout

1. Confirm which public professional presence is the candidate’s, from the links in the intake, and say how you matched it (employer, name, work). If two people share the name, ask orb through send_message instead of guessing. Do not look for personal accounts. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`, `send_message`.
2. Career: LinkedIn if connected (fetch_signed_in, read-only, terms apply), otherwise company pages, press, registries and conference bios. One row per role in Career history (upsert_rows, key "Role at employer"), Verified set honestly, a Source url on every row, and one dated event per role on the Career timeline. Employer pages for scope: team size, product. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `upsert_rows`, `place_card`.
3. Work evidence: GitHub (fetch_signed_in if connected; the public pages otherwise), papers, launches, case studies and portfolios. One row per piece in Work evidence with the candidate’s own part, the outcome and the requirement it supports. Place a source card for each of the strongest pieces. Check authorship and commit history before crediting impact. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `read_source`, `place_card`, `upsert_rows`.
4. Public professional record: talks (video cards, linked not embedded), articles, podcasts, publications, patents and awards on the Public record timeline; quote cards for what named colleagues or customers say in public about the work, including at least one critical or qualified view. Tools: `web_search`, `fetch_url`, `place_card`, `image_search`.
5. Verification sweep for Critic: for each claim marked "Claimed only", search an independent source (press, registries, programmes, archives); update the rows you wrote with the Verified column and a Source. Professional matters only; stop at anything personal. Tools: `web_search`, `fetch_url`, `upsert_rows`, `query_dataset`.
6. Deep research for the gaps that remain: deep_research (core or above, per the tier) on the candidate’s published work only. Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout’s first sources: read the cards of every frame (board_map, search_board, read_card) and the Career history and Work evidence rows (query_dataset) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`, `query_dataset`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source cards that clear it (an insight needs at least two cited cards). Unverified is not false: say what was searched. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Privacy sweep of every card and row: age, health, family, beliefs, origin, appearance, finances, home address, personal social media. Raise each as a Risk card titled "Privacy: ..." naming the card (not repeating the content) and asking orb to have the user delete it. Tools: `query_board`, `search_board`, `place_card`, `add_link`.
4. Turn every gap into a Question card in Interview & references, linked to the card or requirement that prompted it. Challenge each strength that has a single source. Tools: `place_card`, `add_link`, `query_board`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming the flags raised and any privacy violations. Tools: `report_progress`, `send_message`.

### Builder

1. The skills-against-requirements matrix: weighted criteria, scores from 0 to 10 from the Work evidence strength (query_dataset), each with its basis in the cell note. Tools: `place_card`, `query_dataset`, `read_card`.
2. The evidence-strength chart bound to the Requirements database, and the strengths-and-gaps pros/cons card from it. Tools: `place_card`, `query_dataset`.
3. Optional one-page visual summary (a design frame): role, requirement coverage, score, recommendation and the top open questions, built only from cards on the board. No personal details beyond the professional summary. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. Employment or education claims that cannot be verified. *How:* Compare each claim on the resume or profile with an independent source (company pages, press, registries, conference programmes). Unverified is not false: say what was searched.
2. Gaps or overlaps in the career timeline that are unexplained. *How:* Read the Career history database for gaps over six months and overlapping full-time roles; raise a question, never an inference.
3. Role titles or scope that look inflated against the company size or the work shown. *How:* Compare the title and claimed scope with the employer (size, team) and with the work evidence.
4. Public professional controversies: published disputes, retractions, licence or code-of-conduct findings about their work. *How:* Search for professional matters only (work, publications, code, licences). Do not search private life.
5. Work credited to the candidate that others may own or have done (team projects, forks, co-authors). *How:* Check authorship, commit history or credits on each Work evidence row before it counts as their impact.
6. Skills claimed for the role with no public evidence. *How:* For each must-have in the Requirements database, there is a Work evidence row or the requirement is marked "no public evidence".
7. Currency: the evidence is old and the field has moved. *How:* Check the dates on the Work evidence rows against how fast the skill area changes.
8. Sensitive or non-professional information on the board (age, health, family, religion, politics, origin, appearance, finances, home address, personal social media). *How:* Scan every card and row. Anything of this kind is not used: raise it as a process violation and ask the user to delete the card. It never enters the scorecard.
9. A conflict of interest or an undisclosed relationship between the candidate and the hiring team. *How:* Only from public professional records (shared employers, co-authors, investors). Raise as a question for the hiring manager.
10. The research asked a question the role does not need. *How:* Every card must trace to a requirement of the role. Cards that do not are flagged for removal.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Role-relevant experience | 30% | No experience in the work the role does. | Has done most of the role at a similar scope. | Has done this exact job well, more than once. | career |
| Evidence of impact | 25% | No public evidence of results. | Some credited work with described outcomes. | Several verified outcomes that match what the role needs. | work |
| Skill depth | 20% | Skills are claimed but not shown. | Skills are shown in public work at a working level. | Deep, current skills shown across several pieces of work. | work |
| Level and scope match | 15% | Well below or above the level of the role. | Close to the level, with a stretch either way. | A clear match to the level and scope of the role. | fit |
| Public professional record | 10% | Little to read or a record that raises professional concerns. | A modest record: some talks, writing or open work. | A strong, consistent professional record others cite. | footprint |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Candidate brief: {{candidate}} for {{role|the role}}. Every paragraph cites cards; every claim about the candidate cites its public professional source; claimed and verified facts are marked as such. Nothing outside the role’s requirements appears.

1. Summary & recommendation (at most 150 words): The recommendation, the score, the top 3 strengths and the top 3 open questions, in at most 150 words.
2. Professional profile: Current role, years in the field, level and the scope of this research.
3. Career & experience: The career timeline with verification status, gaps and overlaps as questions.
4. Work evidence: The strongest pieces of work, the candidate’s own part in each and the skills matrix.
5. Public professional record: Talks, writing and what others say about the work, including critical views.
6. Fit to the role: Each requirement with its evidence strength; strengths and gaps.
7. Verification & flags: The red-flag outcomes: each raised flag with what to ask, the cleared ones in one line. Unverified is not false.
8. Interview plan & references: The ranked questions, the work sample to request and what to ask references.
9. Scorecard: The rubric table: each dimension, weight, score and evidence.

Appendix: All sources.

One-page summary: Role and level, Requirements covered, Score, Recommendation, Top open questions.

Deck format: `standard`.

## Follow-up chips

Shown after the first pass.

- Draft interview questions: Draft the interview for {{candidate}} ({{role|the role}}): ordered questions with a time for each, each linked to a requirement or a gap on the board.
- What is thin?: Which requirements have the weakest evidence for {{candidate}}, and what is the cheapest way to close each gap?
- Compare to [another candidate]: Compare {{candidate}} to [another candidate] against the same requirements, with a table and the evidence for each score.
- Draft the reference questions: Draft reference questions for {{candidate}}: what to ask, in what order, tied to the claims we could not verify.
- Privacy check: Check every card on this board: is anything not professional information about {{candidate}}? List the cards and ask before removing any.
- Re-score after the interview: I added the interview notes. Re-score the rubric with them, say which scores moved and why, and update the recommendation.

## Signed-in sources

- LinkedIn (linkedin.com): Role history, tenure and endorsements, as visible to the user. LinkedIn restricts automated access: read-only, rate-limited, the user’s own session.
- GitHub (github.com): Public repositories, contributions and commit history for authorship.
- Google Scholar (scholar.google.com): Publications and citations.
