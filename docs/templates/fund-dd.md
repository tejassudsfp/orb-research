# Fund / LP diligence

<!-- Generated from packages/shared/src/templates/fund-dd.ts by `pnpm templates:docs`. Do not edit by hand. -->

Run a full fund-manager diligence as an LP: twelve numbered frames (snapshot, firm and team, strategy, track record, portfolio, exits, terms, operations and references, peers, risks, thesis, open questions), the red-flag checklist, the weighted rubric and an LP investment memo. Separate what the manager reports from what independent sources verify, compare returns with benchmarks and peers, cite every number and end with a recommendation (Pass, Track, Next-stage diligence, Commit).

Template id `fund-dd`. Canvas title: `{{fund}}: fund diligence`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Fund or manager (`fund`) | text | yes | placeholder "Acme Ventures Fund IV" |
| Management firm (GP) (`manager`) | text | no | placeholder "Acme Ventures" |
| Firm website (`website`) | url | no | placeholder "https://acmeventures.com" |
| Strategy (`strategy`) | select | no | one of Venture capital, Growth equity, Buyout, Real estate, Infrastructure, Private credit, Hedge fund, Fund of funds, Secondaries, Other |
| Vintage (`vintage`) | text | no | placeholder "2026" |
| Target fund size (`fund_size`) | text | no | placeholder "$400M" |
| Proposed commitment (`commitment`) | text | no | placeholder "$15M" |
| Terms offered (if known) (`terms`) | text | no | placeholder "2% fee, 20% carry, 8% hurdle, 10-year term" |
| Your thesis or angle (`thesis`) | longtext | no | placeholder "Why are you looking at this manager? What role would it play in your portfolio?" |
| Specific concerns to probe (`concerns`) | longtext | no | placeholder "Fund size step-up, partner turnover, markups…" |
| Peer managers to compare (`peers`) | list | no | placeholder "Comma separated". Optional. Scout finds more. |
| Materials (`materials`) | materials | no | Drop the private placement memorandum (PPM), the due-diligence questionnaire (DDQ), the track-record spreadsheet (CSV or XLSX), the LPA draft and quarterly LP reports. Track records become the Fund performance database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites PitchBook, Preqin, LinkedIn, Crunchbase. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** No deep research and no entity discovery: the firm site, search, extract and signed-in fetches only, a few peers added by hand, at most 12 cards per frame, and the memo is the summary only.
- **Standard:** Quick, plus peer-fund discovery and enrichment and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on the track record and the regulatory history, full peer discovery and the full memo.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 SNAPSHOT (signal; orb)

Brief: What {{fund}} is in one sentence: the manager, strategy, vintage, target size, the funds before it and the headline numbers of the last fund (net IRR, TVPI, DPI) with the as-of date and whether the manager reported or a source verified them.

Target: 6+ metric; 1+ entity (the manager); 1+ doc (the one-liner).

Seed cards:
- entity: {{fund}}
- doc: One-liner
- metric: Fund size
- metric: Funds raised to date
- metric: Last fund net IRR
- metric: Last fund TVPI
- metric: Last fund DPI
- metric: Team size

### 02 FIRM & TEAM (sky; scout, critic)

Brief: Who runs the money: each partner and investment professional with background, tenure at the firm, prior firms and results, focus, carry share, departures and promotions, the firm’s ownership and succession, and the size of the bench against the fund. Key-person risk and attrition are explicit.

Target: 1+ database (Investment team); 3+ entity (one person card per partner); 4+ source.

Seed cards:
- database: Investment team (database `team`)
- question: Who makes the decisions, and who would leave first?
- question: How is the firm owned, and what is the succession plan?

### 03 STRATEGY & EDGE (rho; scout, builder)

Brief: What the manager does and why it should work: the stated strategy, sector, stage, geography and check size, how it sources and selects deals, what it adds after investing, how consistent it has been across funds (style drift), and the evidence of a repeatable edge. Differentiation from peers.

Target: 1+ diagram (the investment process); 1+ matrix (strategy against peers); 4+ source.

Seed cards:
- question: What is the repeatable edge?
- question: Has the strategy drifted?
- matrix: Strategy against peers

### 04 TRACK RECORD (sky; scout, orb, builder, critic)

Brief: Fund by fund: size, vintage, gross and net IRR, TVPI, DPI, RVPI and the quartile against a benchmark, each as reported and as verified, with the as-of dates. Separate realised from unrealised value, and compare with benchmark and peers. A track record spreadsheet you dropped becomes this database.

Target: 1+ database (Fund performance with reported and verified rows); 2+ chart (TVPI and DPI by fund); 3+ metric; 3+ source (including a benchmark source).

Seed cards:
- database: Fund performance (database `performance`)
- chart: TVPI by fund (database `performance`)
- chart: DPI by fund (database `performance`)
- metric: Top-quartile funds
- metric: Weighted net IRR
- metric: Loss ratio
- question: Which of these numbers are verified independently?

### 05 PORTFOLIO ANALYSIS (rho; scout, builder, critic)

Brief: What the funds own: every portfolio company with fund, entry date, round, amount invested, current value or status, multiple and the source, then concentration by company, sector, stage and vintage, the top contributors to value, markdown history and the quality of the largest positions. Discovered from the manager’s website and press, plus any holdings list you dropped.

Target: 1+ database (Portfolio companies, at least 15 rows on Standard); 2+ chart (concentration by sector and by company); 4+ source.

Seed cards:
- database: Portfolio companies (database `portfolio`)
- chart: Invested by sector (database `portfolio`)
- chart: Value by company (database `portfolio`)
- question: How much of the value sits in the top two positions?

### 06 EXITS & REALISATIONS (sky; scout)

Brief: What has actually been returned: every realised exit with its date, route (IPO, M&A, secondary, write-off), proceeds, multiple and holding period, the pace of realisations by vintage and what is likely next.

Target: 1+ database (Exits); 1+ timeline (realisations); 3+ source.

Seed cards:
- database: Exits (database `exits`)
- timeline: Realisations timeline

### 07 TERMS & ECONOMICS (rho; scout, orb, critic)

Brief: The deal for LPs: management fee and its base and step-downs, carry, hurdle and catch-up, GP commitment, fund term and extensions, recycling, clawback, key-person clause, no-fault removal, LPAC rights, fee offsets, expenses and co-investment rights, each against the prior fund and the market norm. The net-return impact of fees.

Target: 1+ database (Terms); 1+ checklist (LPA review); 2+ metric; 1+ framework (pros and cons).

Seed cards:
- database: Terms (database `terms`)
- checklist: LPA review
- metric: Fee drag
- metric: GP commitment
- framework: The terms: pros and cons

### 08 OPERATIONS & REFERENCES (sky; scout, critic)

Brief: The back office and the reputation: administrator, auditor, custodian and valuation policy, compliance and regulatory record (filings, actions, litigation), cybersecurity and ESG policy, insurance, and what references say: portfolio founders, co-investors, other LPs and former employees. Public sources only; calls are for you to make.

Target: 1+ database (References); 4+ quote (at least 1 negative); 4+ source.

Seed cards:
- database: References (database `references`)
- question: Who are the references to call, and what should we ask?

### 09 PEERS & BENCHMARKS (rho; scout, builder)

Brief: Where the manager sits: peer funds of the same strategy and vintage with size, net IRR, TVPI and quartile, benchmark ranges for each vintage, and a positioning view. Discovered with find_entities and enriched with batch_enrich; benchmark sources are cited.

Target: 1+ database (Peer funds, at least 8 rows on Standard); 1+ framework (the 2x2); 1+ chart (net IRR against peers).

Seed cards:
- database: Peer funds (database `peers`)
- framework: Positioning 2x2
- chart: Net IRR against peers (database `peers`)

### 10 RISKS & RED FLAGS (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Also covers key-person, style drift, concentration, valuation, fee and regulatory risk.

Target: 6+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Red-flag checklist
- risk: Team risk
- risk: Strategy risk
- risk: Track record risk
- risk: Portfolio risk
- risk: Terms risk
- risk: Legal/Regulatory risk

### 11 THESIS & DECISION (signal; orb)

Brief: Why commit and why not: the bull and bear cases, the key hypotheses with confidence, what must be true, the scoring against the rubric, how the fund would fit your portfolio, and a recommendation (Pass, Track, Next-stage diligence, Commit) with the conditions and a suggested commitment size.

Target: 1+ framework (SWOT); 1+ decision; 3+ hypothesis (with evidence links); 1+ matrix (the filled rubric).

Seed cards:
- hypothesis: Thesis: {{fund}} earns top-quartile net returns
- hypothesis: The track record is real and independently verifiable
- hypothesis: The team and strategy that produced the record are intact
- framework: SWOT: {{fund}}
- decision: Recommendation on {{fund}}
- matrix: Scorecard (rubric score x 2, so 10 is a 5)

### 12 OPEN QUESTIONS (paper; critic, orb)

Brief: Follow-ups for the manager (DDQ gaps, data requests, meetings) and for your own team, ranked by importance, each linked to the gap or risk that prompted it. Every unresolved question card on the board is collected here.

Target: 1+ checklist (at least 10 ranked questions and data requests, each linked to its source card).

Seed cards:
- checklist: Questions and data requests

## Databases

### Investment team (frame `team`)

One row per partner and investment professional.

| Column | Type | Notes |
|---|---|---|
| Name | person |  |
| Role | text |  |
| Joined | date |  |
| Tenure (years) | number |  |
| Prior firms | text |  |
| Focus | text |  |
| Carry share | number | Percent, if known. |
| Status | enum (Active, Departed, Transitioning) |  |
| LinkedIn | url |  |
| Source | url |  |
| Flags | text | Departure, short tenure, unverifiable claim, regulatory item. |

Views: All (table); Flagged (table, filtered); By status (board, by Status).

### Fund performance (frame `track`)

Fund-by-fund performance: reported by the manager and verified by independent sources, with as-of dates.

| Column | Type | Notes |
|---|---|---|
| Fund | text |  |
| Vintage | number |  |
| Size | currency |  |
| Gross IRR | number | Percent. |
| Net IRR | number | Percent. |
| TVPI | number |  |
| DPI | number |  |
| RVPI | number |  |
| Benchmark quartile | enum (Top, Second, Third, Bottom, Unknown) |  |
| As of | date |  |
| Basis | enum (Reported, Verified) | Manager numbers are Reported. |
| Source | url |  |

Views: By vintage (table, sorted by Vintage asc); Reported vs verified (board, by Basis); By quartile (board, by Benchmark quartile).

### Portfolio companies (frame `portfolio`)

Every portfolio company across the funds.

| Column | Type | Notes |
|---|---|---|
| Company | text |  |
| Fund | text |  |
| Sector | text |  |
| Entry date | date |  |
| Entry round | text |  |
| Invested | currency |  |
| Current value | currency |  |
| Multiple | number |  |
| Status | enum (Active, Realised, Written off, Unknown) |  |
| Last mark | date |  |
| Source | url |  |
| Flags | text | Markdown, down round, layoffs, concentration. |

Views: By value (table, sorted by Current value desc); By status (board, by Status); Flagged (table, filtered).

### Exits (frame `exits`)

Every realised exit with proceeds and multiple.

| Column | Type | Notes |
|---|---|---|
| Company | text |  |
| Fund | text |  |
| Date | date |  |
| Route | enum (IPO, M&A, Secondary, Recap, Write-off) |  |
| Proceeds | currency |  |
| Multiple | number |  |
| Holding period (years) | number |  |
| Source | url |  |

Views: By date (table, sorted by Date desc); By route (board, by Route).

### Terms (frame `terms`)

Each economic and governance term against the prior fund and the market norm.

| Column | Type | Notes |
|---|---|---|
| Term | text |  |
| This fund | text |  |
| Prior fund | text |  |
| Market norm | text |  |
| Assessment | enum (Better than market, In line, Worse than market, Unknown) |  |
| Source | url |  |
| Note | text |  |

Views: All (table); By assessment (board, by Assessment).

### References (frame `operations`)

Public and back-channel references with what each said and who should call them.

| Column | Type | Notes |
|---|---|---|
| Name | person |  |
| Relationship | enum (Portfolio founder, Co-investor, LP, Former employee, Service provider, Other) |  |
| Organisation | text |  |
| Sentiment | enum (Positive, Mixed, Negative, Unknown) |  |
| Summary | text |  |
| Contacted | boolean | You tick this after a call. |
| Source | url |  |

Views: All (table); By sentiment (board, by Sentiment).

### Peer funds (frame `peers`)

Peer funds of the same strategy and vintage. Discovered with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Fund | text |  |
| Manager | text |  |
| Vintage | number |  |
| Size | currency |  |
| Net IRR | number | Percent. |
| TVPI | number |  |
| DPI | number |  |
| Benchmark quartile | enum (Top, Second, Third, Bottom, Unknown) |  |
| As of | date |  |
| Source | url |  |

Views: By net IRR (table, sorted by Net IRR desc); By quartile (board, by Benchmark quartile).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first: the PPM, the DDQ, the track-record spreadsheet, the LPA draft and LP reports (read_card and read_source for files, query_dataset for databases). Put every manager-reported fund number into Fund performance (upsert_rows) with Basis "Reported", and every term in the LPA into Terms. Hand the peers, the concerns and the ticked signed-in sources from the intake to Scout in its delegate instruction. A row an agent wrote can only be changed by that agent: when a reported number is verified, add a new row with Basis "Verified". Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (team, portfolio, exits, references, peers), Builder once Fund performance and Portfolio companies have rows, Critic once Scout has placed its first sources. Name the frames each agent owns. Tools: `delegate`, `message_agent`.
3. After Scout's first pass, fill the Snapshot metrics (update_card on the six placeholders) and the one-liner, each with a cited figure, its as-of date and whether it is reported or verified. Never write a figure you cannot source. Tools: `query_board`, `search_board`, `update_card`.
4. Recompute from Fund performance (query_dataset): the capital-weighted net IRR, the share of funds in the top quartile and the loss ratio from Portfolio companies; fill the Track record metrics and the fee drag from Terms. State the method and the sample. Tools: `query_dataset`, `update_card`, `read_card`.
5. For a gap Scout could not close (a fund the manager does not report, a regulatory item), run deep_research (core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
6. At the end, fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card in the why line. Then the SWOT, the three hypotheses (evidence for and against as card ids) and the Decision card: your proposed option, the conditions, a commitment size and the weighted total in its rationale. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
7. Write the LP investment memo with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. Tools: `compose_section`.
8. Keep the follow-ups current: collect every unresolved Question card into the "Questions and data requests" checklist, ranked, each linked to its source card. Tools: `search_board`, `update_card`, `add_link`.
9. Only when the user asks to keep watching the manager: watch_topic with the firm name and the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. The firm site: about, team, strategy, portfolio and news pages (fetch_url, parallel_extract). Take a capture_page of the team and portfolio pages for the record. Note every claim about returns, fund size and team for Fund performance and Investment team, as Reported. Tools: `fetch_url`, `parallel_extract`, `capture_page`, `place_card`, `upsert_rows`.
2. The team: start from the partners on the site. Signed-in LinkedIn if connected (fetch_signed_in), otherwise public search. One person card per partner; one Investment team row each (upsert_rows, key Name) with tenure, prior firms and the Flags column for departures, short tenures and unverifiable claims. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
3. Track record, verified: for each fund look for independent numbers (public pension and endowment disclosures, LP reports, PitchBook or Preqin when connected with fetch_signed_in, news). Add rows to Fund performance (upsert_rows, key Fund) with Basis "Verified", the as-of date and the Source. Add the benchmark quartile for each vintage from a cited benchmark. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `parallel_extract`, `upsert_rows`.
4. Portfolio and exits: every portfolio company from the site, press and filings into Portfolio companies (upsert_rows, key Company) with fund, entry, status and latest known round; every exit into Exits and on the timeline. Mark the latest funding round of each company in Flags when it is a down round or the company had layoffs. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `upsert_rows`, `place_card`.
5. Peers: add the known peers from the intake first. find_entities discovers more peer funds of the same strategy and vintage (the match limit follows the depth tier); it fills its own database card in this frame. batch_enrich fills the Peer funds columns (manager, vintage, size, net IRR, TVPI, DPI, quartile) with an output schema of those fields and an as-of date. Then upsert the rows into Peer funds (upsert_rows, key Fund) so there is one table. On the Quick scan tier find_entities and batch_enrich are refused: add a few peers from web_search with upsert_rows instead. Tools: `find_entities`, `batch_enrich`, `web_search`, `upsert_rows`, `query_dataset`.
6. Terms: if no LPA was dropped, search public sources for the manager’s fees, carry and terms (pension fund disclosures, news) and put them in Terms (upsert_rows, key Term) with the Source and the market norm from a cited survey. Tools: `web_search`, `fetch_url`, `parallel_extract`, `upsert_rows`.
7. Operations and references: the regulator filings (investment adviser registration and disclosures), litigation, the administrator and auditor, and what portfolio founders, co-investors and employees say publicly (blogs, podcasts, reviews). Quote cards, positive and negative; one References row each (upsert_rows, key Name) with the Sentiment. You do not contact anyone: the calls are the user’s. Tools: `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
8. A red-flag sweep: partner departures, markdowns, fund-size and strategy changes, regulatory actions and litigation, so Critic has sources to clear or raise each flag. Tools: `web_search`, `fetch_url`, `place_card`.
9. Deep research for the gaps that remain (a fund with no reported numbers, a regulatory history): deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) and query Fund performance and Portfolio companies (query_dataset) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`, `query_dataset`.
2. Challenge the track record: compare Reported with Verified rows fund by fund (query_dataset), check DPI against realised exits, the unrealised share against the markdown history, and the contribution of the top two deals. Place a Risk card for each gap with the figures and links to the rows or cards it rests on. Tools: `query_dataset`, `read_card`, `place_card`, `add_link`.
3. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card in Open questions. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
4. Turn every gap into a Question card in Open questions (a data request for the manager or a question for a reference), with a link to the card or gap that prompted it. Tools: `place_card`, `add_link`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. Charts bound to the databases: TVPI and DPI by fund (Fund performance), invested by sector and value by company (Portfolio companies), and net IRR against peers (Peer funds). Tools: `place_card`, `query_dataset`.
2. The strategy-against-peers matrix (weighted criteria, scores 0 to 10 from the sources) and the size-against-net-IRR 2x2 (framework, quadrant) with the manager and its peers placed from Peer funds. Tools: `place_card`, `query_dataset`, `read_card`.
3. A diagram of the manager’s investment process: sourcing, selection, investment committee, follow-on and exit, from the sources. Tools: `place_card`, `read_card`.
4. Optional one-page visual summary (a design frame): snapshot, the fund-by-fund returns, score, recommendation and the top risks, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. Track record that cannot be verified, or net returns that are only gross or pro forma. *How:* Compare the manager track record with LP reports, benchmark data and public portfolio information; unverified numbers are raised.
2. Returns driven by one or two investments. *How:* Read Portfolio companies and Fund performance: the share of value from the top two deals.
3. Key-person dependence or recent partner departures. *How:* Check the Investment team database for departures, short tenures and carry allocation.
4. Strategy drift: the new fund is larger or different from the one that produced the record. *How:* Compare fund sizes, sectors, stages and check sizes across funds.
5. Fund size growth faster than the team or the strategy can absorb. *How:* Compare the fund size step-up with the team size and the investment pace.
6. Aggressive or stale valuations: high unrealised share with no markdowns. *How:* Check RVPI and DPI against realised exits, and the markdown history of the portfolio.
7. Low DPI in older funds (distributions that never came). *How:* Read DPI for funds older than seven years in Fund performance.
8. Fee, carry or expense terms above market, or unusual fee bases. *How:* Compare the Terms database with prior funds and market norms.
9. Weak LP protections: no key-person clause, no-fault removal, a clawback or LPAC rights. *How:* Check the LPA review checklist and the Terms database for each protection.
10. Regulatory actions, litigation or a poor compliance history. *How:* Search the regulator filings (for example Form ADV disclosures), court records and news for the firm and its partners.
11. Weak operations: no independent administrator, small auditor, or restated reports. *How:* Look for the administrator, auditor and valuation policy in the materials and filings.
12. Reference or back-channel feedback that contradicts the pitch. *How:* Read the References database and the negative quotes; recurring themes are raised.
13. Concentration: too much of the fund in one sector, region, vintage or company. *How:* Group Portfolio companies by sector, stage and entry year, and check the top positions.
14. Conflicts of interest: affiliated funds, related-party deals or co-investment allocation. *How:* Look for affiliates, cross-fund investments and co-invest policy in the materials and filings.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Team & stability | 20% | Key-person dependence, recent partner departures, thin bench. | A stable core team with relevant experience and some succession. | A deep, long-tenured team with clear succession and aligned carry. | team |
| Strategy & edge | 15% | Generic strategy with no repeatable edge, or drifting from it. | A clear strategy with a plausible edge in sourcing or selection. | A differentiated, repeatable edge that has held up across funds. | strategy |
| Track record | 25% | Bottom-quartile or unverifiable returns, mostly unrealised. | Second-quartile returns with some realisations, verified. | Consistent top-quartile net returns across funds, with distributions, verified. | track |
| Portfolio quality | 15% | Concentrated, marked up without evidence, many write-offs. | Reasonably diversified with sound marks. | High-quality companies, conservative marks and strong follow-on support. | portfolio |
| Terms & alignment | 15% | Above-market fees, weak GP commitment, poor LP protections. | Market terms with some protections. | Below-market fees or strong hurdles, large GP commitment and strong LP protections. | terms |
| Operations & compliance | 10% | Weak controls, regulatory history, thin back office. | Adequate controls and a clean record. | Institutional-quality operations, independent administrator and auditor, clean record. | operations |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: LP investment memo: {{fund}}. Every paragraph cites cards; every number cites its source and as-of date; reported and verified returns are marked as such.

1. Summary & recommendation (at most 150 words): The recommendation, the score, the proposed commitment, the top 3 reasons and the top 3 risks, in at most 150 words.
2. Fund snapshot: A table of the snapshot metrics: manager, strategy, vintage, size and last-fund returns with their dates.
3. Firm & team: The partners and bench, tenure, carry, succession and flags.
4. Strategy & edge: The strategy, the sourcing and selection edge, consistency and drift.
5. Track record: The fund-by-fund table, reported against verified, with TVPI and DPI charts and the benchmark quartile.
6. Portfolio & exits: Concentration, the top positions, marks, and what has been realised.
7. Terms & economics: The terms table against the prior fund and the market, the fee drag and the LPA protections.
8. Operations & references: Service providers, compliance record and what references say.
9. Peers & benchmarks: Where the manager sits against peers and benchmarks, with the 2x2.
10. Risks & mitigants: The red-flag outcomes: each raised flag with its mitigant, and the cleared ones in one line.
11. Thesis: bull vs bear: The bull and bear cases, the key hypotheses with confidence and the fit with the portfolio.
12. Scorecard: The rubric table: each dimension, its weight, its score and its evidence.
13. Open questions & next steps: The ranked questions and data requests, the references to call and the proposed next step.

Appendix: All sources.

One-page summary: Snapshot, Fund-by-fund returns, Score, Recommendation, Top risks.

Deck format: `lp-ic`.

## Follow-up chips

Shown after the first pass.

- Draft the DDQ follow-up: Draft the follow-up request to {{fund}} after the first pass: the data we need, ordered by importance and linked to the gaps and risks on the board.
- Build the bear case: Build the bear case for committing to {{fund}}: the strongest argument against, from the cards on this board, with the evidence that would change your mind.
- Re-score after the meeting: I added the meeting notes. Re-score the rubric with them, say which scores moved and why, and update the decision.
- Compare to [manager]: Compare {{fund}} to [manager]: team, strategy, net returns, terms and fit, side by side with a table.
- Negotiate the terms: Which terms of {{fund}} should we push on, with the market norm for each and a priority order?
- Size the commitment: Suggest a commitment size to {{fund}} given its risk, our {{commitment|proposed}} commitment and how it fits the rest of the portfolio, and the conditions to attach.

## Signed-in sources

- PitchBook (pitchbook.com): Fund returns, benchmarks, portfolio and investor data.
- Preqin (preqin.com): Fund performance, benchmarks and LP data.
- LinkedIn (linkedin.com): Partner backgrounds, tenure and team changes.
- Crunchbase (crunchbase.com): Portfolio companies, rounds and exits.

## Monitor

Only when the user asks: `{{fund}} {{manager|}} fundraise, partner departures, regulatory actions, markdowns and portfolio exits`. News that would change the recommendation.
