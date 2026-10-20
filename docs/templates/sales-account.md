# Sales account research

<!-- Generated from packages/shared/src/templates/sales-account.ts by `pnpm templates:docs`. Do not edit by hand. -->

Prepare a pre-call brief on one target account: ten numbered frames (snapshot, buying committee, strategy, triggers, current stack, pain and fit, rivals in the account, proof from similar customers, risks, call plan), the red-flag checklist, the weighted account score and a one-page brief. Separate what the account says about itself from what independent sources show, cite every fact with its date, and end with the opening, the discovery questions and the next step.

Template id `sales-account`. Canvas title: `{{company}}: pre-call brief`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Account (company) name (`company`) | text | yes | placeholder "Globex Logistics" |
| Website URL (`website`) | url | yes | placeholder "https://globex.com" |
| People you will meet (`contacts`) | people | no | placeholder "One per line: Name, title, LinkedIn URL (Scout finds the rest)". Optional but best: the brief is written around them. |
| What you sell here (`offer`) | longtext | yes | placeholder "A route-optimisation platform that cuts last-mile cost" |
| Goal of the call (`goal`) | select | no | one of First discovery call, Demo, Follow-up, Renewal, Expansion, Negotiation, Win-back |
| Meeting date (`meeting_date`) | text | no | placeholder "2026-10-22" |
| Deal size (if known) (`deal_size`) | text | no | placeholder "$120k ACV" |
| Segment / industry (`segment`) | text | no | placeholder "Mid-market logistics" |
| Rivals you expect (`competitors`) | list | no | placeholder "Comma separated". Optional. Scout looks for them in the account. |
| History with the account (`history`) | longtext | no | placeholder "Past calls, emails, a lost deal, a pilot…" |
| What worries you about this call (`concerns`) | longtext | no | placeholder "A rival is in there, the champion is junior…" |
| Materials (`materials`) | materials | no | Drop CRM notes, past emails, call transcripts, an RFP or your own deck. Each becomes a card. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites LinkedIn, Crunchbase, Glassdoor, G2. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 6 | no limit | full |

- **Quick scan:** No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the memo is the summary only (account brief).
- **Standard:** Quick, plus entity discovery, batch enrichment and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on the hardest questions, full entity discovery with extension and the full memo.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 ACCOUNT SNAPSHOT (signal; orb)

Brief: What {{company}} does in one sentence, HQ, employees, revenue or funding, growth direction, business model, ownership, the segment and how large a spender it is in your category. Every figure has a date and a source.

Target: 6+ metric; 1+ entity (the account); 1+ doc (the one-liner).

Seed cards:
- entity: {{company}}
- doc: One-liner
- metric: Employees
- metric: Revenue or funding
- metric: Growth
- metric: Founded
- metric: Spend in your category
- metric: Locations

### 02 BUYING COMMITTEE (sky; scout, critic)

Brief: Who decides, who influences and who uses: for each person their title, tenure, background, what they own, what they have said publicly about priorities and how they like to be approached. Name the economic buyer, the likely champion, the blocker and the end users, and say which are confirmed and which are guesses.

Target: 3+ entity (one person card per contact and per likely buyer); 1+ database (the Stakeholders database); 2+ quote (what they said, in their words).

Seed cards:
- database: Stakeholders (database `stakeholders`)
- question: Who owns the budget for this?
- question: Who is likely to block it?

### 03 BUSINESS AND PRIORITIES (rho; scout, builder)

Brief: What the account is trying to achieve this year: strategy, results and guidance, executive statements, product launches, markets entered or left, investment themes and cost programmes. Quote the account in its own words and translate each priority into an angle for your offer.

Target: 4+ quote (from earnings calls, interviews, posts); 4+ source (including 1 primary document); 1+ framework (priorities versus your offer).

Seed cards:
- question: What are the top three priorities this year?
- framework: Where our offer helps and where it does not

### 04 TRIGGERS AND TIMING (sky; scout, orb)

Brief: Events that make a purchase more or less likely now: funding, leadership changes, launches, hiring waves, layoffs, acquisitions, regulation, outages, earnings and contract or budget dates. Each event is dated, sourced and tagged with why it matters for this call.

Target: 1+ database (Trigger events); 1+ timeline; 1+ metric (open roles that point at your category).

Seed cards:
- database: Trigger events (database `triggers`)
- timeline: Account timeline
- metric: Open roles in your area

### 05 CURRENT STACK AND VENDORS (rho; scout, builder)

Brief: What the account runs today in and around your category: tools, vendors, in-house builds and how long they have been in place. Evidence from job posts, case studies, integrations pages, review sites and public tech data. Mark each entry confirmed or inferred.

Target: 1+ database (Stack and vendors); 1+ matrix; 3+ source.

Seed cards:
- database: Stack and vendors (database `stack`)
- matrix: Incumbent versus us

### 06 PAIN AND FIT (sky; scout, critic, builder)

Brief: Your hypotheses about the problem the account has and how your offer solves it: each with the evidence for and against, the metric it moves, who feels it, and what it is worth. End with the fit against your ideal customer.

Target: 3+ hypothesis (with evidence links); 2+ insight (each cites 2 or more cards); 1+ matrix (the fit score against your ICP).

Seed cards:
- hypothesis: {{company}} has the problem we solve
- hypothesis: The problem is costly enough to fund now
- hypothesis: They will choose us over doing nothing or the incumbent
- matrix: Fit with our ideal customer

### 07 RIVALS IN THE ACCOUNT (rho; scout, critic)

Brief: Every competitor present or pitching at the account: what they sell there, since when, how it is going, who owns it internally and how to position against it. Also the substitutes: in-house work, spreadsheets, doing nothing.

Target: 1+ database (Rivals present or pitching); 2+ product (one card per rival present); 1+ framework (how to position against the strongest).

Seed cards:
- database: Rivals present or pitching (database `rivals`)
- framework: Our position against the strongest rival

### 08 PROOF FROM SIMILAR CUSTOMERS (sky; scout)

Brief: Your customers (or public ones) most like this account: segment, size, the result they got, a quote and a reference you can use. Pick two to lead with and say why each is credible to this buyer.

Target: 1+ database (Reference customers); 3+ quote; 2+ source (published case studies).

Seed cards:
- database: Reference customers (database `references`)

### 09 RISKS AND OBJECTIONS (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Then list the objections you will hear (price, security, timing, switching cost, build-versus-buy), each with the best answer and the proof that backs it.

Target: 5+ risk (every checklist item cleared with a source or raised); 1+ checklist (objections with answers).

Seed cards:
- checklist: Red-flag checklist
- checklist: Objections and answers
- risk: Timing risk
- risk: Competitive risk
- risk: Stakeholder risk
- risk: Budget risk

### 10 CALL PLAN (signal; orb)

Brief: The call itself: the angle and the opening line, the three to five discovery questions that test the hypotheses, the proof to show, the ask, the next step to propose and what to do if the champion is not in the room. End with the account score and the call (Prioritise, Nurture, Deprioritise).

Target: 1+ checklist (discovery questions, ranked, each linked to its hypothesis); 1+ decision; 1+ matrix (the filled scorecard); 1+ doc (the opening and the ask).

Seed cards:
- doc: Opening and ask
- checklist: Discovery questions
- matrix: Scorecard: {{company}} (rubric score x 2, so 10 is a 5)
- decision: Call on {{company}}
- framework: SWOT of our position at {{company}}

## Databases

### Stakeholders (frame `people`)

One row per person who decides, influences or uses. Contacts from the intake first.

| Column | Type | Notes |
|---|---|---|
| Name | person |  |
| Title | text |  |
| Role in the deal | enum (Economic buyer, Champion, Influencer, User, Blocker, Unknown) |  |
| Confirmed | boolean | Ticked when the role is sourced, not guessed. |
| Tenure (years) | number | At this company. |
| Background | text |  |
| Priorities | text | In their own words where possible. |
| LinkedIn | url |  |
| Source | url |  |
| Flags | text | Recent move, left, junior, no authority. |

Views: All (table); By role (board, by Role in the deal); Flagged (table, filtered).

### Trigger events (frame `triggers`)

Dated events at the account that change the odds, each with why it matters for this call.

| Column | Type | Notes |
|---|---|---|
| Event | text |  |
| Date | date |  |
| Type | enum (Funding, Leadership change, Launch, Hiring, Layoff, M&A, Regulation, Earnings, Incident, Contract date) |  |
| Effect | enum (Helps, Neutral, Hurts) |  |
| Why it matters | text |  |
| Source | url |  |

Views: By date (table, sorted by Date desc); By effect (board, by Effect).

### Stack and vendors (frame `stack`)

What the account runs in and around your category, with the evidence for each entry.

| Column | Type | Notes |
|---|---|---|
| Category | text |  |
| Tool | text |  |
| Vendor | text |  |
| Evidence | enum (Case study, Job post, Integration page, Review site, Public tech data, Told by the account) |  |
| Confidence | enum (Low, Medium, High) |  |
| In place since | date |  |
| Source | url |  |

Views: All (table); By confidence (board, by Confidence).

### Rivals present or pitching (frame `rivals`)

Competitors in the account or pitching it. Discovered with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Status | enum (Incumbent, Pitching, Past vendor, Substitute) |  |
| Since | date |  |
| What they sell there | text |  |
| How it is going | text |  |
| Our angle | text |  |
| Threat level | rating | 1 (low) to 5 (high). |
| Source | url |  |

Views: All (table, sorted by Threat level desc); By status (board, by Status).

### Reference customers (frame `proof`)

Customers most like the account, with the result and whether they can be used as a reference.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| Segment | text |  |
| Size | text | Employees or revenue band. |
| Result | text | The number they got, with the period. |
| Public | boolean | A published case study exists. |
| Similarity | rating | 1 (loose) to 5 (twin). |
| Source | url |  |
| Quote | text |  |

Views: Most similar (table, sorted by Similarity desc); Public only (table, filtered).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read what the user dropped first: CRM notes, emails, transcripts, an RFP (read_card and read_source for files, query_dataset for tables). Pull every person into the Stakeholders database (upsert_rows, Confirmed ticked only when the role is stated). Hand Scout the contacts, the rivals the user expects, the history and the ticked signed-in sources in its delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (its seven-step playbook), Builder once Scout has placed its first sources, Critic once Scout has sources to review. Name the frames each agent owns. Tools: `delegate`, `message_agent`.
3. After Scout's first pass, fill the six Account snapshot metrics (update_card on the placeholders) and the one-liner, each with a cited figure and its date. Never write a figure you cannot source. Tools: `query_board`, `search_board`, `update_card`.
4. For a gap Scout could not close (an executive priority, a contract date, a budget cycle), run web_answer first; if it is still open run deep_research (base or core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `web_answer`, `deep_research`, `research_status`, `ask_user_question`.
5. Fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card in the why line. Update the three hypotheses (evidence for and against as card ids), then propose the call on the Decision card with the weighted total in its rationale. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
6. Write the call plan: the "Opening and ask" doc (angle, first 60 seconds, the one ask), the Discovery questions (ranked; each tests a hypothesis and is linked to it) and an answer for each objection Critic listed. Tools: `place_card`, `update_card`, `add_link`, `query_board`.
7. Write the brief with compose_section, section by section in the order of the outline, then the one-page brief. On the Quick tier write the one-page brief only. Tools: `compose_section`.
8. Only when the user asks to keep watching the account (an open opportunity, a long cycle): watch_topic with the company name and the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. The account site: home, about, leadership, customers, careers, press and the page for the product line you sell against (fetch_url, parallel_extract). Fill the snapshot facts and place an Entity card for the company. Capture the home page and the most relevant product page (capture_page) as image cards. Tools: `fetch_url`, `parallel_extract`, `capture_page`, `place_card`.
2. The buying committee: start from the contacts in the intake. Signed-in LinkedIn if the user connected it (fetch_signed_in), otherwise public search. One person card per contact and per likely buyer in this frame, and one Stakeholders row each (upsert_rows, key Name) with the role in the deal and whether it is confirmed. Quote what they have said publicly (talks, posts, interviews) as quote cards. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
3. Strategy and priorities: the latest results or funding news, executive interviews and the strategy page. Quote the account in its own words, place the primary documents as sources and give each priority an angle for the offer. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`.
4. Triggers: news in the last 12 months (funding, leadership changes, launches, layoffs, M&A, regulation, incidents), hiring in your area (count the open roles; Glassdoor and LinkedIn if connected). One row per event in Trigger events with its date, effect and why it matters (upsert_rows), and the same events on the timeline. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
5. Stack and rivals: job posts, case studies, integration pages and review sites for what they run. Add the rivals the user expects first, then find_entities for vendors in your category serving this segment (the match limit follows the depth tier); it fills its own database card in the Rivals frame. batch_enrich adds status, since when and what they sell there; consolidate into Rivals present or pitching with query_dataset and upsert_rows. One Stack and vendors row per tool, with the evidence and confidence. Tools: `web_search`, `fetch_url`, `find_entities`, `batch_enrich`, `query_dataset`, `upsert_rows`, `place_card`.
6. Proof: published case studies and quotes from customers most like the account (same segment, size and use case), from your own site and public sources. One Reference customers row each with the result and the source; a quote card for every strong line. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`, `upsert_rows`.
7. Pain evidence: search for the account naming the problem you solve (job posts, earnings calls, reviews, forums). Place each find as a quote or source card in Pain and fit, with a link to the hypothesis it supports. Also sweep for layoffs, acquisitions, security incidents and rival announcements so Critic has sources to clear or raise each flag. Tools: `web_search`, `fetch_url`, `place_card`, `add_link`.
8. Deep research for the gaps that remain: deep_research (core or above, per the tier), one question per run. Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source cards that clear it. Never leave a flag silent; if nothing was searched, say so and ask Scout for the search. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge the three hypotheses in Pain and fit: place an Insight (two or more citations) that tests each, and link a "tension" from any card that disagrees. Flag a stakeholder whose role is a guess (Confirmed unticked) as a Question. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Extend the "Objections and answers" checklist with every objection the evidence supports (a rival in place, a security review, a build-versus-buy signal); one item per objection, each linked to the card behind it. Tools: `place_card`, `add_link`, `query_board`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. The "Incumbent versus us" matrix: scores 0 to 10 for each criterion from the Stack and vendors, Rivals and Reference customers databases. Tools: `place_card`, `query_dataset`, `read_card`.
2. The "Fit with our ideal customer" matrix, scored from the cards of Account snapshot and Pain and fit (query_dataset, read_card), and a chart of trigger events by type bound to Trigger events. Tools: `place_card`, `query_dataset`, `read_card`.
3. Turn the priorities Scout quoted into the "Where our offer helps and where it does not" framework (pros and cons), each item citing a quote card. Tools: `place_card`, `read_card`, `query_board`.
4. Optional one-page visual brief (a design frame): the account, the score, the buying committee, the angle and the opening, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. The main contact has left, changed role or is not who the CRM says. *How:* Compare the contact in the intake with their current profile and the company site: title, start date, team.
2. Layoffs, a hiring freeze or a restructuring in the buying team. *How:* Search layoff news and trackers, job-post drops and reorg announcements; note which function was hit.
3. A competitor signed or renewed recently, so a contract may lock the account. *How:* Look for press releases, case studies and job posts naming a rival in this category in the last 18 months.
4. Financial distress: going-concern language, missed payments, a down round or falling revenue. *How:* Read the latest results or funding news; compare the funding date and runway signals with the buying cycle.
5. A pending acquisition or merger, which usually freezes new vendors. *How:* Search M&A news and filings for the account and its parent; a freeze is raised with its expected end date.
6. The champion has no budget or authority, or the real buyer is unknown. *How:* Check the Stakeholders database: is there an Economic buyer row with a source? If not, raise it.
7. A long procurement, security or legal review is likely (regulated sector, large enterprise). *How:* Look for the sector, certifications they demand of vendors and any public vendor-onboarding page.
8. A security incident, outage or public complaint in your category at this account. *How:* Search incident news, status pages and review sites; note whether it makes them more or less open to you.
9. An in-house build or a strategic decision to stop spending in this area. *How:* Look for engineering blogs, job posts for the capability and executive statements on build versus buy.
10. Stale or single-source facts: the brief rests on information older than 12 months. *How:* For every fact the brief leans on, find the date and a second source; undated or single-source facts are raised.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Fit with your ideal customer | 25% | Outside the segment, size or use case you win in. | Matches the segment; the use case is plausible. | A textbook customer: same profile as your best accounts. | fit |
| Evidence of the pain | 20% | No sign the problem exists here. | The problem is common in their sector; one indirect sign. | Their own words (job posts, calls, filings) state the problem. | fit |
| Timing and triggers | 20% | Nothing changing; no budget moment in sight. | A relevant event in the last year. | A fresh trigger plus a budget or contract date inside 6 months. | triggers |
| Access to the buying committee | 15% | No named contact; no warm path. | A user or influencer is reachable. | A champion and the economic buyer are identified and reachable. | people |
| Competitive position | 10% | A rival is locked in under a long contract. | A rival is present but replaceable. | Greenfield, or a rival they are unhappy with. | stack |
| Ability to buy | 10% | Cost-cutting or distress. | Stable; budget exists but is contested. | Funded or growing, with spend in this category. | snapshot |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Pre-call brief: {{company}}. Every paragraph cites cards; every figure cites its source and its date; what the account says is marked as claimed and what independent sources show as verified.

1. Summary and call (at most 120 words): The call (prioritise, nurture or deprioritise), the score, the angle and the top 3 risks, in at most 120 words.
2. Account snapshot: A table of the snapshot metrics: what they do, size, growth, funding or revenue, locations.
3. Who you are meeting and who decides: Each contact and the likely buying committee: role in the deal, background, priorities, how to approach, and what is a guess.
4. Priorities and strategy: The top priorities in the account's own words and the angle each gives your offer.
5. Why now: The trigger events that make the call timely or risky, dated, with the timeline.
6. Current stack and rivals: What they run today, who the rivals are and how to position against the strongest.
7. Pain and fit: The hypotheses with their evidence for and against, and the fit score.
8. Proof to bring: The two reference customers to lead with and why each is credible to this buyer.
9. Risks and objections: Red-flag outcomes with mitigants; the objections you will hear with the best answer for each.
10. Call plan: The opening, the ranked discovery questions, the ask and the next step.
11. Account score: The rubric table: each dimension, its weight, its score and its evidence.

Appendix: All sources.

One-page summary: Snapshot, Who decides, Why now, Angle and opening, Top risks, Next step.

Deck format: `sales-brief`.

## Follow-up chips

Shown after the first pass.

- Brief me on [person]: Go deeper on [person] at {{company}}: background, what they care about, how they talk about the problem, and how to open with them.
- Draft the first email: Draft the outreach email to the likely champion at {{company}}: one angle, one proof point and one ask, from the cards on this board.
- Build the battlecard: Build a battlecard against the strongest rival at {{company}}: where we win, where we lose, the traps to set and the proof to bring.
- Map the rest of the account: Map the other teams at {{company}} that could use our offer, with a champion guess and a trigger for each.
- Update after the call: I added the call notes. Update the stakeholders and hypotheses, say what changed in the score, and propose the next step.
- Prepare the follow-up plan: Plan the next 30 days at {{company}}: touches, owners, the proof to send and the trigger that should change the plan.

## Signed-in sources

- LinkedIn (linkedin.com): Contacts and likely buyers: titles, tenure, background, hiring and headcount.
- Crunchbase (crunchbase.com): Funding rounds, investors, headcount and acquisitions.
- Glassdoor (glassdoor.com): Morale, layoffs and hiring signals; leadership reviews.
- G2 (g2.com): Which vendors the account reviews or uses in your category, and what reviewers say.

## Monitor

Only when the user asks: `{{company}} funding, leadership changes, layoffs, acquisitions, product launches and new vendors`. A trigger that changes the call or reopens a stalled deal.
