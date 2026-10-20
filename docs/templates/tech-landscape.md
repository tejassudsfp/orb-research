# Technology landscape

<!-- Generated from packages/shared/src/templates/tech-landscape.ts by `pnpm templates:docs`. Do not edit by hand. -->

Map a technology landscape: a definition and taxonomy, the players and products, the open-source projects, research and benchmarks, maturity and adoption, standards and regulation, a build-buy-partner evaluation, risks, and a roadmap with a recommendation scored by a technology-readiness rubric. Separate vendor claims from independent evidence, give every number a source and a date, and say how mature each option really is.

Template id `tech-landscape`. Canvas title: `Technology landscape: {{technology}}`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Technology or category (`technology`) | text | yes | placeholder "Vector databases" |
| Your use case (`use_case`) | longtext | no | placeholder "Semantic search over 50M documents with sub-100ms latency". The more specific, the more useful the comparison. |
| The decision to make (`decision`) | select | no | one of Learn the landscape, Choose a technology, Build or buy, Plan a roadmap, Invest or partner |
| Time horizon (`horizon`) | select | no | one of Now, 1 year, 3 years, 5+ years |
| Constraints (`constraints`) | longtext | no | placeholder "Must self-host, open-source licence, SOC 2, under $50k a year, team of 3" |
| Current stack (`stack`) | text | no | placeholder "Python, Postgres, AWS" |
| Known vendors or projects (`players`) | list | no | placeholder "Comma separated". Optional. Scout finds more. |
| Criteria that matter most (`criteria`) | list | no | placeholder "Latency, cost, ease of use". Optional. They become the evaluation matrix. |
| Materials (`materials`) | materials | no | Drop vendor decks, analyst reports, architecture notes or a benchmark CSV. Each becomes a card or database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites GitHub, G2, Gartner, Crunchbase. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the report is the summary only.
- **Standard:** Quick, plus vendor discovery with find_entities, batch enrichment of the Vendors database and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on benchmarks and adoption, FindAll extension for a complete vendor list and the full report.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 OVERVIEW & DEFINITION (signal; orb)

Brief: What {{technology}} is in plain words, what problem it solves, how it differs from the neighbouring categories, why it matters now, and the size and growth of the market around it.

Target: 1+ doc (the definition); 4+ metric; 1+ hypothesis (why now).

Seed cards:
- doc: Definition
- hypothesis: Why now
- metric: Market size
- metric: Market growth
- metric: Number of vendors
- metric: Production adoption

### 02 TAXONOMY & ARCHITECTURE (sky; builder, scout)

Brief: How the category is organised: the layers or components of a typical system, the main approaches and how they trade off, and where each player sits. A reader should be able to place any product after reading this frame.

Target: 2+ diagram (reference architecture and the taxonomy); 1+ framework (the positioning 2x2); 3+ source.

Seed cards:
- framework: Positioning 2x2
- question: Which approach fits our use case, and why?

### 03 PLAYERS & PRODUCTS (rho; scout, critic)

Brief: The commercial vendors and cloud services: what each sells, its pricing model, founding year, funding, headcount, customers, strengths and weaknesses and a threat or fit rating against the use case. Include the incumbents and the newcomers. At least 10 on Standard.

Target: 1+ database (the Vendors database); 3+ product (the leading products); 4+ source.

Seed cards:
- database: Vendors (database `vendors`)

### 04 OPEN-SOURCE PROJECTS (sky; scout)

Brief: The open-source projects and standards bodies: licence, language, stars, contributors, commit and release activity, the sponsoring company, governance and known production users. Activity and bus factor matter more than stars.

Target: 1+ database (Open-source projects); 1+ chart (projects by activity).

Seed cards:
- database: Open-source projects (database `projects`)
- chart: Projects by activity (database `projects`)

### 05 RESEARCH & BENCHMARKS (rho; scout, builder, critic)

Brief: What the research and the measurements say: papers, independent benchmark results and vendor claims, each with its conditions (dataset, scale, hardware, date) and whether the number is Independent, Vendor or Academic. Compare like with like.

Target: 1+ database (the Benchmarks database); 2+ chart; 4+ source (including 2 independent); 1+ math (a formula when the metric needs one).

Seed cards:
- database: Benchmarks (database `benchmarks`)
- chart: Benchmark results by system (database `benchmarks`)
- question: Which benchmark matches our workload?

### 06 MATURITY & ADOPTION (sky; scout, critic, builder)

Brief: Where the technology is on the adoption curve: key milestones, the named production users, the hiring and job-post signal, the analyst view and the hype against the delivery. Place it as emerging, growing, mature or declining and say what the evidence is.

Target: 1+ timeline (milestones and releases); 3+ quote (production users, at least 1 skeptical); 1+ hypothesis (the maturity stage); 1+ chart.

Seed cards:
- timeline: Milestones
- hypothesis: Maturity stage
- chart: Vendors by maturity (database `vendors`)

### 07 STANDARDS & REGULATION (rho; scout)

Brief: The standards, protocols and interoperability efforts, who stewards them and how stable they are, plus the regulation, data-residency, export-control and certification rules that apply. Say which ones constrain the use case in the intake.

Target: 4+ source (standards bodies and regulators); 1+ checklist (the compliance requirements).

Seed cards:
- checklist: Standards and compliance to check
- question: Which standard will win, and what happens to the losers?

### 08 BUILD, BUY OR PARTNER (sky; builder, orb)

Brief: The shortlist scored against the criteria that matter for the use case: the weighted matrix, the cost model over the time horizon, the build-versus-buy trade-offs and the migration and exit cost. Use the criteria in the intake when given.

Target: 1+ matrix (the shortlist against weighted criteria); 1+ framework (pros and cons of building); 1+ table (cost model); 2+ metric.

Seed cards:
- matrix: Shortlist against the criteria
- framework: Build in-house: pros and cons
- metric: Three-year cost of the leading option

### 09 RISKS & UNKNOWNS (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Also covers vendor viability, security, lock-in, skills and the chance that the category is replaced.

Target: 6+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Red-flag checklist
- risk: Vendor risk
- risk: Technical risk
- risk: Security risk
- risk: Lock-in risk
- risk: Skills and operations risk

### 10 ROADMAP & RECOMMENDATION (signal; orb)

Brief: What to do and when: the recommended option for the use case with the technology-readiness score, a staged roadmap (now, next, later), the triggers that would change the choice and the leading indicators to watch.

Target: 1+ decision; 1+ matrix (the filled rubric); 1+ timeline (the roadmap); 2+ hypothesis.

Seed cards:
- decision: Recommendation for {{technology}}
- matrix: Technology-readiness scorecard (rubric score x 2, so 10 is a 5)
- timeline: Roadmap
- hypothesis: The leading option still wins in {{horizon|three years}}

### 11 OPEN QUESTIONS (paper; critic, orb)

Brief: What is still unknown, ranked by importance and linked to the gap behind each: numbers only a trial can give, vendor answers to ask for and experiments to run before committing.

Target: 1+ checklist (at least 8 ranked questions or experiments, each linked to its source card).

Seed cards:
- checklist: Questions to answer before committing

## Databases

### Vendors (frame `vendors`)

Commercial vendors and services. Discovered with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Category | enum (Platform, Managed service, Cloud provider, Tooling, Consultancy) |  |
| Maturity | enum (Emerging, Growing, Mature, Declining) |  |
| Founded | number |  |
| HQ | text |  |
| Total funding | currency | US dollars. |
| Headcount | number |  |
| Pricing model | text |  |
| Key customers | text |  |
| Strength | text |  |
| Weakness | text |  |
| Fit | rating | 1 (poor) to 5 (excellent) for the use case. |
| Source | url |  |

Views: All (table, sorted by Fit desc); By maturity (board, by Maturity); Best fit (table, filtered).

### Open-source projects (frame `projects`)

Open-source projects, with the signals that show whether they are alive.

| Column | Type | Notes |
|---|---|---|
| Project | text |  |
| Repository | url |  |
| License | text |  |
| Language | text |  |
| Stars | number |  |
| Contributors | number |  |
| Last release | date |  |
| Activity | enum (Very active, Active, Slow, Abandoned) |  |
| Sponsor | text | Company or foundation behind it. |
| Production users | text |  |
| Source | url |  |

Views: All (table, sorted by Stars desc); By activity (board, by Activity); Slow or abandoned (table, filtered).

### Benchmarks (frame `benchmarks`)

Every performance number with its conditions and who measured it.

| Column | Type | Notes |
|---|---|---|
| Result | text | A short label: system, benchmark, metric. |
| System | text |  |
| Benchmark | text |  |
| Metric | text |  |
| Value | number |  |
| Unit | text |  |
| Conditions | text | Dataset, scale, hardware. |
| Date | date |  |
| Basis | enum (Independent, Academic, Vendor) |  |
| Source | url |  |

Views: All (table, sorted by Date desc); By basis (board, by Basis); Independent (table, filtered).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first (read_card and read_source for decks and reports, query_dataset for a benchmark CSV). Put the criteria from the intake into the evaluation matrix, or propose five from the use case (update_card). Hand the known vendors, the constraints and the ticked signed-in sources to Scout in its delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `update_card`.
2. Delegate with delegate: Scout first (players, open source, benchmarks, standards), Builder once the Vendors database has rows, Critic once Scout has sources to review. Name the frames each agent owns. Tools: `delegate`, `message_agent`.
3. After Scout’s first pass, fill the Overview metrics, the definition and the why-now hypothesis (update_card), each with a cited figure and its year. Never write a market figure you cannot source. Tools: `query_dataset`, `query_board`, `search_board`, `update_card`.
4. Work out the cost model: licence or usage price, infrastructure and people over the time horizon for the shortlist (query_dataset on Vendors and Benchmarks), as a table card, and update the three-year cost metric. State every assumption. Tools: `query_dataset`, `place_card`, `update_card`.
5. For a gap Scout could not close (pricing behind a sales call, a benchmark that does not exist, production users), run deep_research (core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
6. At the end fill the Technology-readiness scorecard: one 1-to-5 score per rubric dimension (doubled on the matrix), each with a cited card. Then the roadmap timeline, the hypotheses (evidence for and against as card ids) and the Decision card: your proposed option and the weighted total in its rationale. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
7. Write the report with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. Tools: `compose_section`.
8. Keep the open questions current: collect every unresolved Question card into the checklist, ranked, each linked to its source card. Tools: `search_board`, `update_card`, `add_link`.
9. Only when the user asks to keep watching the category: watch_topic with the technology name and the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. Sources for the overview: an analyst or survey for market size and growth (web_answer for a quick number, then the primary source), the vendors’ own explanations and one neutral definition. Place source cards and sizing metrics with the year. Tools: `web_search`, `fetch_url`, `web_answer`, `parallel_extract`, `place_card`.
2. Players: add the known vendors from the intake first. find_entities discovers more (the match limit follows the depth tier); batch_enrich fills Category, Founded, HQ, Total funding, Headcount, Pricing model and Strength with an output schema of those fields. Copy the rows into the Vendors database (query_dataset, upsert_rows, key Name), a Source on every row. Place a product card for the leaders. On the Quick tier those two tools are refused: add a few vendors from web_search with upsert_rows instead. Tools: `find_entities`, `batch_enrich`, `web_search`, `fetch_url`, `place_card`, `query_dataset`, `upsert_rows`.
3. Open source: the repositories (fetch_url, or fetch_signed_in on GitHub when connected) with licence, stars, contributors, last release and sponsor. One Open-source projects row each (upsert_rows, key Project); set Activity from the commit and release dates, not from stars. Quote the install or usage line from the README as a quote card for the leading project. Tools: `fetch_signed_in`, `fetch_url`, `web_search`, `place_card`, `upsert_rows`.
4. Research and benchmarks: papers and independent comparisons first, vendor numbers second. One Benchmarks row per result (upsert_rows, key Result) with its conditions, date and Basis (Independent, Academic or Vendor). Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`, `upsert_rows`.
5. Maturity and adoption: named production users and case studies as quote cards (include at least one skeptical voice), job-post and hiring signals, analyst placement (fetch_signed_in on Gartner or G2 if connected) and dated milestones on the timeline. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `place_card`.
6. Standards and regulation: the standards bodies, protocol specs and their status, plus data-residency, certification and export-control rules that apply to the use case; place source cards. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`.
7. A risk sweep for Critic: security advisories and CVEs, layoffs and acquisitions, licence changes and outages for each leading vendor and project; place source cards so Critic can clear or raise each flag. Tools: `web_search`, `fetch_url`, `place_card`.
8. Deep research for the gaps that remain: deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout’s first sources: read the databases and the cards of every frame (board_map, search_board, read_card, query_dataset) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`, `query_dataset`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source cards that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge every number: a vendor benchmark with no independent run is linked with "tension" to an independent card that disagrees, or a Question asks for the independent result. Challenge every adoption claim with no named user. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Turn every gap into a Question card in Open questions, with a link to the card or gap that prompted it. Tools: `place_card`, `add_link`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. Diagrams of the reference architecture (layers and components) and the taxonomy of approaches, then place each player on the positioning 2x2 from the Vendors database. Tools: `place_card`, `query_dataset`, `read_card`.
2. Charts bound to the databases: benchmark results by system (bar, colour by Metric) from Benchmarks, vendors by maturity from Vendors, projects by activity from Open-source projects. A math card when a metric needs its formula. Tools: `place_card`, `query_dataset`.
3. The shortlist matrix (weighted criteria, scores 0 to 10 from the databases), the build-in-house pros and cons, and the cost-model table. Tools: `place_card`, `query_dataset`, `read_card`.
4. Optional one-page visual summary (a design frame): the landscape map, the score and the recommendation, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. The benchmark numbers come from the vendor, not from an independent party. *How:* Read the Basis column of the Benchmarks database; any headline number marked Vendor with no independent run is raised.
2. An open-source project that looks abandoned: no release or commits in a year. *How:* Read Last release and Activity in the Open-source projects database; raise projects the answer depends on.
3. A recent licence change away from open source, or a licence that blocks the use case. *How:* Check the License column and the changelog or announcements for relicensing; match it with the constraints in the intake.
4. A single vendor or single maintainer holds the whole ecosystem. *How:* Count the contributors and vendors in the databases; raise a leader with more than about half of the commits or revenue.
5. Hype without production use: many announcements, few named deployments. *How:* Look for named production customers and case studies; claims with no named user are raised.
6. Security incidents, unpatched critical vulnerabilities or no audit. *How:* Search advisories and CVE listings for each vendor and project and record the result.
7. The standards are unstable or competing, so today’s choice may be stranded. *How:* Read the Standards frame: draft status, competing bodies and the vendors behind each.
8. Cost claims that leave out operations, support, egress or scale pricing. *How:* Compare the Pricing column with the real workload from the intake; raise numbers that omit a cost line.
9. A key vendor has a funding, layoff or acquisition risk. *How:* Look for recent funding, layoffs and acquisition news for the vendors in the Vendors database.
10. Benchmarks do not match the intended workload (wrong dataset, scale or hardware). *How:* Compare each benchmark’s conditions with the use case in the intake; raise results that are not transferable.
11. Regulation or export controls could block or restrict the technology. *How:* Search for regulation, data-residency and export-control rules and record them in the Standards frame.
12. Hard lock-in: proprietary formats, no export, or exit costs far above adoption costs. *How:* Check export formats, API openness and migration reports; raise options with no tested exit path.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Maturity | 20% | Research prototype or a demo only. | Used in production by early adopters. | Widely deployed, stable, with long-term support. | maturity |
| Performance and capability | 20% | Fails the main requirement, or no independent numbers. | Meets the requirement with caveats. | Exceeds the requirement on independent benchmarks. | benchmarks |
| Ecosystem and community | 15% | One vendor, little tooling, a tiny community. | Several vendors and decent tooling. | Large, active ecosystem with many integrations. | projects |
| Cost and total cost of ownership | 15% | Costs are high or opaque. | Reasonable, with some unknowns. | Low and predictable, including operations. | evaluation |
| Security and compliance | 15% | Known incidents or no security posture. | Standard controls, partly audited. | Audited, certified and transparent about incidents. | risks |
| Portability and lock-in | 15% | Proprietary formats and no exit path. | Some standards, with an exit that is costly. | Open standards and an easy exit. | standards |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Technology landscape: {{technology}}. Every paragraph cites cards; every number cites its source and its date; vendor claims are marked as vendor claims and independent results as independent.

1. Summary & recommendation (at most 200 words): The recommendation, the readiness score, the top 3 reasons and the top 3 risks, in at most 200 words.
2. What it is & why now: The definition, the problem it solves, the market and why it matters now.
3. Taxonomy & architecture: The layers, the main approaches and where the players sit, with the diagrams.
4. Players & products: The vendors table and a short note on each leader.
5. Open source: The projects, their licences and whether they are alive.
6. Research & benchmarks: The results with their conditions, independent separated from vendor.
7. Maturity & adoption: The stage, the named users, the milestones and the hype against the delivery.
8. Standards & regulation: The standards, their stability and the rules that apply.
9. Build, buy or partner: The shortlist matrix, the cost model and the trade-offs.
10. Risks & unknowns: The red-flag outcomes, each raised flag with its mitigant, and the cleared ones in one line.
11. Scorecard: The rubric table: each dimension, its weight, its score and its evidence.
12. Roadmap & next steps: The staged roadmap, the triggers and the ranked open questions.

Appendix: All sources.

One-page summary: Definition, Landscape map, Score, Recommendation, Top risks.

Deck format: `tech-landscape`.

## Follow-up chips

Shown after the first pass.

- Go deeper on vendor X: Go deeper on [vendor]: product, pricing, customers, benchmarks and how it fits "{{technology}}" for our use case.
- Compare two options: Compare [option A] with [option B] for our use case: capability, cost, risk and lock-in, with a table and the cards behind it.
- Plan a proof of concept: Plan a one-week proof of concept for the leading option: goals, test data, success numbers and what would make us stop.
- Estimate the cost: Build a three-year cost model for the top three options with every assumption stated and a sensitivity table.
- Draft the decision memo: Draft a one-page decision memo for "{{technology}}" for leadership: recommendation, cost, risk and next step.
- Watch the category: Watch {{technology}} and tell me about new releases, funding, licence changes and security incidents.

## Signed-in sources

- GitHub (github.com): Repository activity, issues, releases and contributors for the Open-source projects database.
- G2 (g2.com): Buyer reviews, ratings and alternatives for the Vendors database.
- Gartner (gartner.com): Analyst placement, market guides and hype cycles.
- Crunchbase (crunchbase.com): Funding, headcount and investors of the vendors.

## Monitor

Only when the user asks: `{{technology}} releases, funding, acquisitions, licence changes and security incidents`. News that would change the recommendation or the maturity stage.
