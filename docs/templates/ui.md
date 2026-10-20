# Product teardown

<!-- Generated from packages/shared/src/templates/ui.ts by `pnpm templates:docs`. Do not edit by hand. -->

Take a product apart: capture its screens, map its key flows step by step, list the patterns and the copy, read its business model and growth loops, evaluate it against usability and accessibility heuristics, compare it with the product you care about, and turn the lessons into mockups and a short list of what to adopt and avoid. Every finding cites a screenshot; lessons borrow ideas, never assets.

Template id `ui`. Canvas title: `{{product}}: product teardown`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Product to tear down (`product`) | text | yes | placeholder "Linear" |
| Website URL (`website`) | url | yes | placeholder "https://linear.app" |
| Flow or feature to focus on (`focus`) | text | no | placeholder "Onboarding and the first project" |
| Why you are doing it (`goal`) | select | no | one of Learn from a leader, Benchmark against our product, Inspiration for a redesign, Diligence on a product |
| Platform (`platform`) | select | no | one of Web app, iOS, Android, Desktop, Marketing site, Several |
| Your product (to compare with) (`ours`) | text | no | placeholder "Acme Tasks" |
| Other products to compare (`competitors`) | list | no | placeholder "Comma separated". Optional. Scout finds more on Standard and Deep. |
| Materials (`materials`) | materials | no | Drop screenshots, screen recordings' summaries, a PDF of the flow, analytics exports (CSV or XLSX) or your own product's screens. Each becomes a card or database; screenshots go to the Screens frame. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites LinkedIn, G2, SimilarWeb. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** Public pages only: no deep research, at most 12 cards per frame, the core flow and the summary memo.
- **Standard:** Quick, plus find_entities and batch_enrich for the products to compare, the patterns and findings databases, mockups and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro research on the product's history and market, more flows and comparison products, and the full memo and deck.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 OVERVIEW (signal; orb, scout)

Brief: What {{product}} is: who it is for, what it does in a sentence, the platforms, the pricing headline, the company behind it and why it is worth taking apart ({{goal|goal to confirm}}). Focus: {{focus|the whole product}}.

Target: 1+ product (the product, kind product); 4+ metric; 3+ source.

Seed cards:
- product: {{product}}
- metric: Entry price
- metric: Store rating
- metric: Steps to first value
- metric: Screens captured
- question: What does this product do better than anyone, and why does it matter to us?

### 02 SCREENS (sky; scout, orb)

Brief: Every screen of the flows in focus, in order: a screenshot (capture_page for public pages; dropped images for logged-in ones) and a row in the Screen inventory with its purpose, key elements, the pattern it uses and the capture date and version. Screens the user dropped stay in the Overview frame, where they were dropped: log each one here.

Target: 12+ image (screens in flow order); 1+ database (Screen inventory).

Seed cards:
- database: Screen inventory (database `screens`)

### 03 FLOWS (rho; scout, builder)

Brief: The key flows step by step: onboarding, the core action, upgrade and cancel. Per step the screen, what the user does, what the system does and the friction (1 to 5). Draw each flow as a diagram and say where users are likely to drop off.

Target: 1+ database (Flow steps); 3+ diagram (onboarding, core action, upgrade); 1+ chart (friction by step).

Seed cards:
- database: Flow steps (database `steps`)
- chart: Friction by step (database `steps`)

### 04 INFORMATION ARCHITECTURE (sky; builder, scout)

Brief: How the product is organised: the sitemap, the navigation model (tabs, sidebar, command bar), what is one click away and what is buried, and how a new user finds things. Draw the sitemap.

Target: 1+ diagram (the sitemap); 2+ source.

Seed cards:
- question: What is the primary navigation, and what does it say the product is about?

### 05 PATTERNS & COMPONENTS (rho; builder, scout)

Brief: The recurring patterns and components worth naming: empty states, onboarding checklists, command palettes, inline editing, progress, upsells. Per pattern where it appears, why it works, who else uses it and whether to adopt it. Recreate the best two as design frames.

Target: 1+ database (UI patterns, at least 10 rows); 2+ design (recreated patterns).

Seed cards:
- database: UI patterns (database `patterns`)
- framework: Patterns: adopt and avoid

### 06 COPY & MICROCOPY (sky; scout)

Brief: How the product talks: headlines, button labels, empty states, error messages, confirmations, tone. Quote the best and the worst, each with its screen.

Target: 8+ quote (at least 2 error or empty-state messages).

Seed cards:
- question: What is the voice of the product, in three words?

### 07 BUSINESS MODEL & GROWTH LOOPS (rho; scout, orb)

Brief: How the product makes money and grows: plans and the paywall, trial and free tier, sharing and invite loops, integrations and templates that bring users in, and where upgrades are prompted. Dated changes (launches, pricing changes) on a timeline.

Target: 1+ timeline (product changes); 1+ framework (pros and cons of the model); 4+ source.

Seed cards:
- timeline: Product changes
- framework: Business model: pros and cons
- hypothesis: The main growth loop is sharing, not paid acquisition

### 08 TECH & PERFORMANCE (sky; scout, builder)

Brief: What can be learned from public signals: front-end stack and libraries from the page source, load behaviour, offline and mobile support, integrations and API. Say how each fact was found; make no claim about private systems.

Target: 3+ source; 1+ code (a public snippet that shows the pattern).

Seed cards:
- question: What does the page source tell us about how the front end is built?

### 09 HEURISTIC EVALUATION (paper; critic, builder)

Brief: Evaluate the flows against Nielsen's ten heuristics plus accessibility and trust: a row per finding with the heuristic, the screen, the severity (1 to 5), the observation, the screenshot and a recommendation. Then work through the red-flag checklist.

Target: 1+ database (Findings, at least 15 rows); 5+ risk (every checklist item cleared with a source or raised).

Seed cards:
- database: Findings (database `findings`)
- checklist: Red-flag checklist
- risk: Dark patterns risk
- risk: Accessibility risk
- risk: Consistency risk

### 10 COMPARISON (rho; builder, scout)

Brief: How {{product}} stacks up against {{ours|your product}} and the other products on the flows that matter: a weighted matrix and the biggest gaps, from the Screen inventory and Findings.

Target: 1+ matrix (weighted flow comparison); 1+ chart (findings by severity); 2+ product (the products compared).

Seed cards:
- matrix: Flow comparison
- chart: Findings by severity (database `findings`)

### 11 LESSONS & MOCKUPS (signal; orb, builder)

Brief: What to take from the teardown: the lessons ranked by impact, the patterns to adopt and avoid, and mockups that apply them to {{ours|your product}}. Mockups copy ideas, not branded assets. Score {{product}} against the rubric with cited screenshots.

Target: 5+ insight (each citing at least 2 cards); 2+ design (mockups); 1+ decision; 1+ matrix (the filled rubric).

Seed cards:
- decision: What should we take from {{product}}?
- matrix: UX quality (rubric score x 2, so 10 is a 5)
- checklist: Adopt or avoid

## Databases

### Screen inventory (frame `screens`)

Every captured screen in flow order.

| Column | Type | Notes |
|---|---|---|
| Screen | text | A short name, numbered in flow order. |
| Flow | text |  |
| URL or path | url |  |
| Purpose | text |  |
| Key elements | text |  |
| Pattern | text |  |
| Platform | enum (Web, iOS, Android, Desktop) |  |
| Captured on | date |  |
| Version | text | App version or release date, if shown. |

Views: All (table); By flow (table, by Flow); Gallery (gallery).

### Flow steps (frame `flows`)

Each step of each flow with the friction it adds.

| Column | Type | Notes |
|---|---|---|
| Flow | enum (Onboarding, Core action, Upgrade, Cancel, Other) |  |
| Step | text | Numbered, for example 3. Choose a template. |
| Screen | text | The name in the Screen inventory. |
| User action | text |  |
| System response | text |  |
| Friction | rating | 1 (none) to 5 (likely drop-off). |
| Note | text |  |

Views: All (table, sorted by Step asc); By flow (table, by Flow); High friction (table, filtered).

### UI patterns (frame `patterns`)

Named patterns with where they appear, why they work and what to do with them.

| Column | Type | Notes |
|---|---|---|
| Pattern | text |  |
| Where seen | text | Screens in the inventory. |
| What it does | text |  |
| Why it works | text |  |
| Also used by | text |  |
| Decision | enum (Adopt, Adapt, Avoid, Watch) |  |

Views: All (table); By decision (board, by Decision).

### Findings (frame `findings`)

Heuristic and accessibility findings, each with its evidence and a recommendation.

| Column | Type | Notes |
|---|---|---|
| Finding | text |  |
| Heuristic | enum (Visibility of status, Match with the real world, User control, Consistency, Error prevention, Recognition over recall, Flexibility, Minimal design, Error recovery, Help, Accessibility, Trust) |  |
| Screen | text |  |
| Severity | rating | 1 (cosmetic) to 5 (blocks the task). |
| Observation | text |  |
| Evidence | text | The title of the screenshot card. |
| Recommendation | text |  |

Views: By severity (table, sorted by Severity desc); By heuristic (board, by Heuristic); Severe (table, filtered).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read what the user dropped first: screenshots, PDFs, analytics exports (board_map, read_card, read_source, query_dataset). Log every dropped screenshot as a row in Screen inventory (upsert_rows) with the platform and capture date where known. Hand the product, the focus flow and the comparison products to Scout in the delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (screens, flows, copy, business model), Builder once the Screen inventory has rows, Critic once Scout has screens to review. Name the frames each agent owns, and hand over the intake facts (names, links, concerns) in the instruction. Tools: `delegate`, `message_agent`.
3. Fill the overview metrics (update_card): entry price, store rating, steps to first value (count them from the Flow steps) and screens captured, each with its source and date. Tools: `query_dataset`, `update_card`, `query_board`.
4. For a gap Scout could not close (the product's history, how it makes money), run deep_research (core) on that one question. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
5. Lessons: Insight cards that each cite at least two cards (screens, findings, patterns). Fill the UX quality matrix (one 1-to-5 score per dimension, doubled) with a cited screenshot per score, then the Decision with the weighted total in the rationale and the Adopt or avoid checklist. Tools: `query_board`, `search_board`, `read_card`, `update_card`, `place_card`, `add_link`.
6. Write the memo with compose_section, section by section in the order of the memo outline, then the one-page summary. On the Quick tier write the summary only. When the user asks for slides, compose_slides with the deck outline. Tools: `compose_section`, `compose_slides`.
7. Only when the user asks to keep watching: watch_topic with the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. The product's public site: home, pricing, features, docs and changelog (fetch_url, parallel_extract). capture_page screenshots of each key public page; place them as image cards in Screens with a Screen inventory row each (upsert_rows, key Screen) in flow order, with capture date and version. Tools: `fetch_url`, `parallel_extract`, `capture_page`, `place_card`, `upsert_rows`.
2. Flows: walk onboarding, the core action, upgrade and cancel from the public pages, docs, videos and screens the user dropped. One Flow steps row per step (upsert_rows, key Step) with the user action, the system response and the friction. Say where you could not see a step instead of guessing. Tools: `fetch_url`, `read_card`, `query_dataset`, `upsert_rows`, `web_search`.
3. Copy: quote the headlines, button labels, empty states, error messages and confirmations as Quote cards, each naming its screen. Include at least two errors or empty states. Tools: `fetch_url`, `read_card`, `place_card`.
4. Business model and growth loops: the plans and paywall, the trial and free tier, invite and sharing loops, templates and integrations that bring users in. A dated Product changes timeline from the changelog and press, each event with a source. G2 or SimilarWeb only via fetch_signed_in if the user ticked them. Tools: `web_search`, `fetch_url`, `fetch_signed_in`, `place_card`, `parallel_extract`.
5. Tech and performance from public signals only: the page source and its libraries, the manifest, the docs. A Source card per fact, saying how it was found; a Code card for a public snippet that shows a pattern. Tools: `fetch_url`, `web_search`, `place_card`, `parallel_extract`.
6. The products to compare: the ones the user named, then find_entities and batch_enrich (what each does, platform, entry price, rating) for a short list of leaders; a Product card for each (kind competitor or product). Quick scan: find_entities is refused; read the named ones only. *(from the standard tier)* Tools: `find_entities`, `batch_enrich`, `fetch_url`, `capture_page`, `place_card`, `query_dataset`.
7. Patterns seen in the screens: one UI patterns row for each (upsert_rows, key Pattern) with where it was seen, what it does and who else uses it. Builder adds the why it works and the decision. Tools: `query_dataset`, `read_card`, `upsert_rows`.
8. Deep research for the gaps that remain: deep_research (core or above, per the tier), for example the history of the product and how it makes money. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Evaluate each flow against the heuristics: place a Risk card for every severe finding (severity 4 or 5), titled with the heuristic and the screen, and link it to the screenshot card it rests on. You cannot write database rows: send the full list to Builder with send_message so it can log them in Findings. Tools: `query_board`, `read_card`, `query_dataset`, `place_card`, `add_link`, `send_message`.
4. Challenge any finding resting on one screenshot or an old capture: link it "tension" to the card that disagrees, or place a Question asking for a recheck. Challenge each pattern marked Adopt for protection. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. Diagrams: one per key flow (onboarding, core action, upgrade) from the Flow steps rows, and the sitemap from the screens; each node names its screen. Tools: `place_card`, `query_dataset`, `read_card`.
2. Log the findings: one Findings row per finding (upsert_rows, key Finding) with the heuristic, screen, severity, observation, evidence and recommendation, including the list Critic sends you. Findings by severity chart bound to the database. Tools: `upsert_rows`, `query_dataset`, `place_card`, `read_card`.
3. Patterns: complete the UI patterns rows Scout started (add your own rows): why it works and the Decision. Recreate the two best as design frames (write_design_frame): the pattern, not the brand assets. Tools: `upsert_rows`, `write_design_frame`, `query_dataset`, `read_card`.
4. The flow comparison matrix (scores 0 to 10 per product, the note naming the rows used), friction by step chart, and a note for orb where the technical signals matter to a decision. Tools: `place_card`, `query_dataset`, `read_card`.
5. Mockups applying the top lessons to the user's product as design frames: one per lesson, labelled with the pattern it borrows, using only ideas and layout, never copied assets or text. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`, `place_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. A dark pattern: forced continuity, hidden costs, confirmshaming or a hard-to-find cancel path. *How:* Walk the sign-up, upgrade and cancel flows in the Flow steps database; quote the screen and copy.
2. Onboarding takes more than five steps before the user sees value. *How:* Count the steps in the onboarding flow up to the first useful result.
3. A paywall or sign-up wall appears before any value. *How:* Check the first-run screens and the paywall placement in the Screen inventory.
4. Text or controls fail colour contrast or have no keyboard path. *How:* Read the accessibility notes in Findings; compare text and background colours against WCAG AA (4.5 to 1).
5. Error messages blame the user or say nothing useful. *How:* Quote the error and empty-state copy from the copy frame.
6. Components, spacing or wording are inconsistent across screens. *How:* Compare the UI patterns database rows for the same pattern appearing in different forms.
7. Mobile and desktop differ in capability or flow without a reason. *How:* Compare the Screen inventory rows per platform when more than one platform was captured.
8. A finding rests on one screenshot of one version. *How:* Check the capture date and version of each screen; a finding on an old or single capture is marked and a Question asks for a recheck.
9. The product depends on a platform or API that could change the flow. *How:* Look in the tech notes and sources for a single dependency the flow cannot work without.
10. A pattern we plan to adopt is protected (brand, trade dress, patent). *How:* Before a pattern is marked Adopt, check the sources for protection; copy the idea and never the assets.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Clarity | 20% | A new user cannot tell what to do. | The main path is clear; secondary ones are not. | Every screen has one obvious next step. | flows |
| Efficiency | 20% | Many steps and forms before value. | A reasonable path with some friction. | Value in the fewest steps, with smart defaults. | flows |
| Consistency | 15% | Components and wording differ screen to screen. | A shared style with some drift. | A coherent system across every screen. | patterns |
| Accessibility | 15% | Fails contrast, keyboard or labels widely. | Mostly passes, with gaps. | Meets WCAG AA in the checked flows. | findings |
| Conversion design | 20% | The paywall or sign-up blocks value. | A standard funnel. | Value shown before the ask; the ask is clear and honest. | business |
| Brand and delight | 10% | Generic, no point of view. | A recognisable style. | Distinct moments of craft that users mention. | copy |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Product teardown: {{product}}. Every finding cites a screenshot card; every quote names its screen; every claim about the business cites a source and a date; versions and capture dates are stated.

1. Summary & lessons (at most 150 words): What the product does best, the top three lessons and the top three problems, in at most 150 words.
2. The product: What it is, who it is for, pricing and platform.
3. Key flows: Each flow step by step with its screens and friction, and the flow diagrams.
4. Information architecture: The sitemap and the navigation model.
5. Patterns and components: The named patterns, why they work and the adopt or avoid decision.
6. Copy and voice: The voice, with the best and worst examples quoted.
7. Business model and growth: Plans, paywall, growth loops and the changes timeline.
8. Technology: What the public signals show, and how each fact was found.
9. Usability and accessibility findings: Findings by severity with their screenshots, and the red-flag outcomes.
10. Comparison: The weighted flow comparison and the biggest gaps.
11. Scorecard and recommendations: The rubric table and what to adopt, adapt and avoid, with the mockups.

Appendix: All sources and capture dates.

One-page summary: What it is, Score, Top lessons, Top problems.

Deck format: `standard`.

Deck: Teardown: {{product}}. Slides, in order:

1. What we learned: The three lessons and the score.
2. The product: What it is, who it is for and the pricing headline.
3. The core flow: The main flow as screens with the friction marked.
4. Onboarding: The onboarding diagram and the steps to first value.
5. Patterns worth stealing: The patterns marked Adopt with a screenshot each.
6. How it talks: The voice with quoted copy.
7. How it makes money: Plans, paywall and growth loops.
8. Where it falls short: The severe findings with screenshots.
9. Against our product: The weighted comparison matrix.
10. What we will do: The decision, the mockups and the experiments.

## Follow-up chips

Shown after the first pass.

- Go deeper on a flow: Go deeper on the [flow] flow of {{product}}: every step, every screen, where it drops users and how ours compares.
- Mock up the pattern: Mock up the pattern [pattern] for our product as a design frame, listing what it borrows and what it changes.
- Add another product: Add [product] to the teardown: capture its screens for the same flows and add it to the comparison.
- Run an accessibility pass: Run an accessibility pass on the screens captured: contrast, keyboard, labels, with the worst five findings.
- Write the redesign brief: Write the redesign brief for [flow] from the findings and lessons, as a doc with the problems ranked.
- Watch their changelog: Start a monitor on {{product}} launches, pricing changes and changelog entries.

## Signed-in sources

- G2 (g2.com): Reviews that mention usability, onboarding and pricing.
- LinkedIn (linkedin.com): The company's design and product team size and hiring.
- SimilarWeb (similarweb.com): Traffic sources and engagement of the marketing site.

## Monitor

Only when the user asks: `{{product}} product launches, redesigns, pricing changes and changelog announcements`. A change that makes the teardown stale.
