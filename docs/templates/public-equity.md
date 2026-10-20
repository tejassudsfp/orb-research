# Public equity

<!-- Generated from packages/shared/src/templates/public-equity.ts by `pnpm templates:docs`. Do not edit by hand. -->

Run a full public equity deep dive: twelve numbered frames (snapshot, business, financials, earnings quality, industry, management, valuation scenarios, catalysts, sentiment, risks, thesis, open questions), the red-flag checklist, the weighted rubric and an equity research note. Work from filings and reporting, say how recent every figure is (there is no live market data), cite every number and end with a recommendation (Buy, Add, Hold, Trim, Avoid, Short).

Template id `public-equity`. Canvas title: `{{company}}: public equity deep dive`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Company or ticker (`company`) | text | yes | placeholder "Costco Wholesale (COST)" |
| Ticker (`ticker`) | text | no | placeholder "COST" |
| Exchange (`exchange`) | select | no | one of NYSE, Nasdaq, LSE, Euronext, TSE, HKEX, NSE / BSE, ASX, TSX, Other |
| Your position (`position`) | select | no | one of Considering a new position, Own it, Short candidate, Watchlist |
| Holding horizon (`horizon`) | select | no | one of Under 1 year, 1 to 3 years, 3 to 5 years, More than 5 years |
| Sector / industry (`sector`) | text | no | placeholder "Warehouse retail" |
| Your thesis or angle (`thesis`) | longtext | no | placeholder "Why are you looking at this stock?" |
| Specific concerns to probe (`concerns`) | longtext | no | placeholder "Margins, a lawsuit, an accounting question…" |
| Known peers (`peers`) | list | no | placeholder "Comma separated tickers or names". Optional. Scout finds more. |
| Materials (`materials`) | materials | no | Drop the annual report (10-K), recent 10-Qs, earnings-call transcripts, your own model (CSV or XLSX) or broker notes. Each becomes a card or database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites Seeking Alpha, Morningstar, Financial Times, Wall Street Journal. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** No deep research: filings, search, extract and signed-in fetches only, at most 12 cards per frame, a handful of peers added by hand, and the memo is the summary only.
- **Standard:** Quick, plus peer discovery and enrichment and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on the industry model and the open footnotes, full peer discovery and the full research note.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 SNAPSHOT (signal; orb)

Brief: What {{company}} does in one sentence, where and how it is listed, and the headline numbers with their dates: price, market capitalisation, enterprise value, P/E, EV/EBITDA and dividend yield. There is no live market data: every figure says "as of" and where it comes from.

Target: 6+ metric; 1+ entity (the company); 1+ doc (the one-liner).

Seed cards:
- entity: {{company}}
- doc: One-liner
- metric: Share price
- metric: Market cap
- metric: Enterprise value
- metric: P/E (TTM)
- metric: EV / EBITDA
- metric: Dividend yield

### 02 BUSINESS & SEGMENTS (sky; scout, builder)

Brief: How {{company}} makes money: the segments and their revenue and profit, the geographic mix, the customers, pricing power, the moat and where it is eroding, and what the company says is its strategy. Segment numbers come from the filings, not from summaries.

Target: 1+ database (Segments); 1+ chart (revenue by segment); 1+ diagram (how the business earns, from customer to profit); 4+ source (including the latest annual report).

Seed cards:
- database: Segments (database `segments`)
- chart: Revenue by segment (database `segments`)
- question: Where does the profit really come from?
- question: What is the moat, and what would erode it?

### 03 FINANCIALS (rho; scout, orb, builder)

Brief: Five years of revenue, margins, earnings, cash flow, capital spending and share count from the filings, with the latest quarter and the trend. Growth, operating margin, FCF margin, return on invested capital and leverage, each with the period it covers. Claimed (guidance, management) separate from reported.

Target: 1+ database (Financials with at least 5 annual periods); 6+ metric; 2+ chart (revenue and free cash flow over time).

Seed cards:
- database: Financials (database `financials`)
- metric: Revenue growth
- metric: Operating margin
- metric: FCF margin
- metric: ROIC
- metric: Net debt / EBITDA
- metric: Share count change
- chart: Revenue and net income (database `financials`)
- chart: Free cash flow (database `financials`)

### 04 EARNINGS QUALITY & BALANCE SHEET (paper; scout, critic)

Brief: Whether the earnings are real and the balance sheet is safe: GAAP against adjusted earnings, accruals, working capital, stock-based compensation, off-balance-sheet items, leases, pensions, debt maturities and liquidity.

Target: 1+ database (Debt & liquidity); 1+ checklist (earnings-quality checks); 2+ risk; 3+ source.

Seed cards:
- database: Debt & liquidity (database `debt`)
- checklist: Earnings-quality checks
- question: What does management add back, and would you?

### 05 INDUSTRY & COMPETITION (sky; scout, builder, critic)

Brief: The industry structure and growth, the profit pool, the listed peers with their multiples and operating metrics, private and new entrants, substitutes, regulation and where {{company}} wins and loses against each.

Target: 1+ database (Peers with at least 6 listed companies); 1+ matrix; 1+ framework (the positioning 2x2); 3+ source (including 1 independent industry report).

Seed cards:
- database: Peers (database `peers`)
- matrix: Peer scorecard
- framework: Positioning 2x2

### 06 MANAGEMENT & GOVERNANCE (rho; scout, critic)

Brief: The executives and the board: tenure, track record, ownership, pay and what it is tied to, insider buying and selling, capital-allocation history (buybacks, M&A, dividends, capex), related-party items and shareholder rights.

Target: 1+ database (Management); 1+ timeline (insider activity and executive changes); 3+ source.

Seed cards:
- database: Management (database `management`)
- timeline: Insider and leadership timeline
- question: Has management allocated capital well?

### 07 VALUATION (sky; orb, builder, scout)

Brief: What the price implies and what the company is worth: bear, base and bull scenarios with the assumptions stated (growth, margin, multiple, discount rate), the peer multiples, the implied expectations in the price and the margin of safety. Every assumption cites a card.

Target: 1+ database (Valuation scenarios); 3+ metric (base fair value, upside or downside, implied expectations); 1+ chart (scenario values against the price); 1+ hypothesis (what the price is pricing in).

Seed cards:
- database: Valuation scenarios (database `scenarios`)
- metric: Base fair value
- metric: Upside / downside
- metric: Implied expectations
- chart: Scenario values per share (database `scenarios`)
- hypothesis: The price already discounts the base case

### 08 CATALYSTS & CALENDAR (rho; scout)

Brief: Dated events that could move the stock in the horizon: earnings dates, guidance, investor days, product or regulatory decisions, index changes, debt events, lock-ups, and the long-term structural catalysts.

Target: 1+ database (Catalysts); 1+ timeline (upcoming events); 3+ source.

Seed cards:
- database: Catalysts (database `catalysts`)
- timeline: Catalyst calendar

### 09 SENTIMENT & POSITIONING (sky; scout)

Brief: What the market thinks: analyst ratings and targets, the range of estimates, short interest, institutional and insider ownership, notable holders, the news flow and the main bull and bear arguments in the press. Say how old each data point is.

Target: 1+ database (Analyst views); 4+ quote (at least 1 bear argument); 2+ metric (short interest and consensus target).

Seed cards:
- database: Analyst views (database `analysts`)
- metric: Consensus target
- metric: Short interest

### 10 RISKS & RED FLAGS (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Also covers valuation risk, macro and rate sensitivity, regulatory and legal risk, concentration and event risk.

Target: 6+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Red-flag checklist
- risk: Business risk
- risk: Financial risk
- risk: Governance risk
- risk: Valuation risk
- risk: Regulatory/Legal risk
- risk: Macro risk

### 11 THESIS & DECISION (signal; orb)

Brief: The bull, base and bear cases, the key hypotheses with confidence, what must be true, what would make you wrong, the scoring against the rubric and a recommendation (Buy, Add, Hold, Trim, Avoid, Short) with a sizing view.

Target: 1+ framework (SWOT); 1+ decision; 3+ hypothesis (with evidence links); 1+ matrix (the filled rubric).

Seed cards:
- hypothesis: Thesis: {{company}} compounds value over the horizon
- hypothesis: Earnings are of high quality and cash-backed
- hypothesis: The valuation leaves a margin of safety
- framework: SWOT: {{company}}
- decision: Recommendation on {{company}}
- matrix: Scorecard (rubric score x 2, so 10 is a 5)

### 12 OPEN QUESTIONS (paper; critic, orb)

Brief: Questions for management or the next earnings call, and things to monitor, ranked by importance, each linked to the gap or risk that prompted it. Every unresolved question card on the board is collected here.

Target: 1+ checklist (at least 10 ranked questions and monitoring items, each linked to its source card).

Seed cards:
- checklist: Questions and monitoring items

## Databases

### Segments (frame `business`)

Revenue and profit by business segment and geography, from the filings.

| Column | Type | Notes |
|---|---|---|
| Segment | text |  |
| Revenue | currency | US dollars, latest fiscal year. |
| Share of revenue | number | Percent. |
| Growth | number | Percent, year over year. |
| Operating margin | number | Percent. |
| Period | text | Fiscal year, e.g. FY2025. |
| Source | url |  |

Views: All (table, sorted by Revenue desc).

### Financials (frame `financials`)

One row per fiscal period: the income statement, cash flow and share count. Reported numbers only.

| Column | Type | Notes |
|---|---|---|
| Period | text | FY2025 or Q3 FY2026. |
| Revenue | currency |  |
| Gross profit | currency |  |
| Operating income | currency |  |
| Net income | currency |  |
| Diluted EPS | number |  |
| Operating cash flow | currency |  |
| Capex | currency |  |
| Free cash flow | currency |  |
| Diluted shares | number | Millions. |
| Basis | enum (GAAP, Adjusted) |  |
| Source | url |  |

Views: By period (table, sorted by Period asc).

### Debt & liquidity (frame `quality`)

Every debt instrument and the liquidity that covers it.

| Column | Type | Notes |
|---|---|---|
| Instrument | text |  |
| Amount | currency |  |
| Rate | number | Percent. |
| Maturity | date |  |
| Secured | boolean |  |
| Covenants | text |  |
| Source | url |  |

Views: By maturity (table, sorted by Maturity asc).

### Peers (frame `industry`)

Listed peers with multiples and operating metrics. Discovered with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| Ticker | text |  |
| Market cap | currency |  |
| EV / EBITDA | number |  |
| P/E | number |  |
| Revenue growth | number | Percent. |
| Operating margin | number | Percent. |
| ROIC | number | Percent. |
| Relation | enum (Direct peer, Adjacent, Larger, Smaller) |  |
| As of | date |  |
| Source | url |  |

Views: All (table, sorted by Market cap desc); By relation (board, by Relation).

### Management (frame `management`)

Executives and directors with tenure, ownership and flags.

| Column | Type | Notes |
|---|---|---|
| Name | person |  |
| Role | text |  |
| Since | date |  |
| Prior roles | text |  |
| Ownership | number | Percent of shares. |
| Pay and its basis | text |  |
| Insider activity | text | Recent Form 4 buys and sells. |
| Source | url |  |
| Flags | text | Heavy selling, pledged shares, related party, short tenure. |

Views: All (table); Flagged (table, filtered).

### Valuation scenarios (frame `valuation`)

Bear, base and bull scenarios with their assumptions and the value per share each implies.

| Column | Type | Notes |
|---|---|---|
| Scenario | enum (Bear, Base, Bull) |  |
| Revenue CAGR | number | Percent, over the explicit period. |
| Terminal margin | number | Percent. |
| Exit multiple | number |  |
| Discount rate | number | Percent. |
| Fair value per share | currency |  |
| Upside | number | Percent against the price on the "as of" date. |
| Probability | number | Percent. |
| Key assumption | text |  |

Views: By scenario (table, sorted by Fair value per share asc).

### Catalysts (frame `catalysts`)

Dated events that could move the stock.

| Column | Type | Notes |
|---|---|---|
| Date | date |  |
| Event | text |  |
| Type | enum (Earnings, Guidance, Product, Regulatory, Capital return, Index, Legal, Macro, Other) |  |
| Direction | enum (Positive, Negative, Uncertain) |  |
| Expected impact | text |  |
| Source | url |  |

Views: By date (table, sorted by Date asc); By type (board, by Type).

### Analyst views (frame `sentiment`)

Sell-side and independent views with their rating, target and main argument.

| Column | Type | Notes |
|---|---|---|
| Firm | text |  |
| Rating | enum (Buy, Hold, Sell) |  |
| Target price | currency |  |
| Date | date |  |
| Key argument | text |  |
| Source | url |  |

Views: By date (table, sorted by Date desc); By rating (board, by Rating).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first: the annual report, 10-Qs, transcripts and your own model (read_card and read_source for files, query_dataset for databases). Hand the peers, the signed-in sources and the position and horizon from the intake to Scout in its delegate instruction. A row an agent wrote can only be changed by that agent: add a new row to correct a figure and say why. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (its playbook), Builder once Scout has placed the Financials and Peers rows, Critic once Scout has sources to review. Name the frames each agent owns. Tools: `delegate`, `message_agent`.
3. After Scout's first pass, fill the Snapshot metrics (update_card on the six placeholders) and the one-liner, each with a cited figure and its "as of" date. There is no live market data: never write a price you cannot source. Tools: `query_board`, `search_board`, `update_card`.
4. Build the valuation: from Financials and Peers (query_dataset) write the bear, base and bull rows in Valuation scenarios (upsert_rows) with the assumptions stated, then fill the Base fair value, Upside / downside and Implied expectations metrics. Cite the cards each assumption rests on. Tools: `query_dataset`, `upsert_rows`, `update_card`, `read_card`.
5. For a gap Scout could not close (a segment split, a footnote, a transcript), run deep_research (core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
6. At the end, fill the Scorecard matrix: one 1-to-5 score per rubric dimension (doubled on the matrix), each with at least one cited card in the why line. Then the SWOT, the three hypotheses (evidence for and against as card ids) and the Decision card: your proposed option, a sizing view and the weighted total in its rationale. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
7. Write the research note with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. Tools: `compose_section`.
8. Keep the questions current: collect every unresolved Question card into the "Questions and monitoring items" checklist, ranked, each linked to its source card. Tools: `search_board`, `update_card`, `add_link`.
9. Only when the user asks to keep watching the stock: watch_topic with the company name and the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. Primary sources first: the latest annual report and quarterly reports, the proxy statement and the investor-relations page (fetch_url, parallel_extract). The segment note goes into Segments (upsert_rows, key Segment) with the fiscal period and a Source url on every row. Take a capture_page of the investor-relations page for Business & segments. Tools: `fetch_url`, `parallel_extract`, `capture_page`, `place_card`, `upsert_rows`.
2. Five years of annual figures and the latest quarters into Financials (upsert_rows, key Period): reported numbers only, Basis GAAP unless a row is adjusted. Add the debt table to Debt & liquidity. Say what each source is in the Source column. Tools: `fetch_url`, `parallel_extract`, `web_search`, `upsert_rows`, `place_card`.
3. Peers: add the known peers from the intake first. find_entities discovers more listed peers (the match limit follows the depth tier); it fills its own database card in this frame. batch_enrich fills the Peers columns (ticker, market cap, EV/EBITDA, P/E, growth, margin, ROIC) with an output schema of those fields and an as-of date. Then upsert the rows into the Peers database (upsert_rows, key Name) so there is one table. On the Quick scan tier find_entities and batch_enrich are refused: add a few peers from web_search with upsert_rows instead. Tools: `find_entities`, `batch_enrich`, `web_search`, `upsert_rows`, `query_dataset`.
4. Management and governance: the proxy statement and insider filings (Form 4 summaries, ownership). One Management row per executive and director (upsert_rows, key Name), the Flags column for heavy selling, pledged shares and related-party items, and dated insider events on the timeline. Signed-in sources (fetch_signed_in) only when the user ticked them. Tools: `fetch_signed_in`, `fetch_url`, `web_search`, `upsert_rows`, `place_card`.
5. Industry: at least one independent industry report and the regulatory regime; sources and quotes for the competitive position. Note private and new entrants for Critic. Tools: `web_search`, `fetch_url`, `parallel_extract`, `place_card`.
6. Catalysts: the earnings calendar, guidance, investor days, regulatory decisions and debt events into Catalysts (upsert_rows, key Event) and the calendar timeline. Tools: `web_search`, `fetch_url`, `upsert_rows`, `place_card`.
7. Sentiment: analyst ratings and targets into Analyst views (upsert_rows, key Firm), short interest, institutional ownership and the strongest bull and bear arguments as quote cards (at least one bear). Seeking Alpha or Morningstar when connected (fetch_signed_in). Date every data point. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
8. A red-flag sweep: search restatements, auditor changes, short-seller reports, litigation and regulator actions so Critic has sources to clear or raise each flag. Tools: `web_search`, `fetch_url`, `place_card`.
9. Deep research for the gaps that remain (a segment margin, a litigation outcome, an industry model): deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`.
2. Run the earnings-quality checks on the Financials and Debt & liquidity databases (query_dataset): cash conversion, the GAAP against adjusted gap, receivables and inventory against revenue, SBC and the maturity wall. Place a Risk card for each failed check with the figures and links to the rows or cards it rests on. Tools: `query_dataset`, `read_card`, `place_card`, `add_link`.
3. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card in Open questions. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
4. Challenge every number that rests on a single source or an "as of" date that is old: link it with "tension" to the card that disagrees, or place a Question asking for the second source. Challenge every valuation assumption, and flag a scenario whose base case needs more than the history supports. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
5. Turn every gap into a Question card in Open questions, with a link to the card or gap that prompted it. Tools: `place_card`, `add_link`.
6. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. Charts bound to the databases: revenue by segment (bar, Segments), revenue and net income and free cash flow over time (line and bar, Financials), and the scenario values per share (bar, Valuation scenarios). Tools: `place_card`, `query_dataset`.
2. The peer scorecard (weighted criteria, scores 0 to 10 from the Peers database) and the growth-against-profitability 2x2 (framework, quadrant). Tools: `place_card`, `query_dataset`, `read_card`.
3. A diagram of how the business earns: customer, product, segment, profit pool and the cost that sits between them. Tools: `place_card`, `read_card`.
4. Optional one-page visual summary (a design frame): snapshot, valuation range, score, recommendation and the top risks, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. Restatements, auditor changes, a going-concern note or late filings. *How:* Search the filings list and news for 8-K Item 4.02, auditor resignations and NT 10-K/10-Q notices.
2. A wide and growing gap between adjusted (non-GAAP) and GAAP earnings. *How:* Compare adjusted and GAAP operating income in the Financials database; list what is added back.
3. Receivables or inventory growing much faster than revenue. *How:* Check days sales outstanding and inventory days across the periods in Financials and the filings.
4. Free cash flow persistently below net income. *How:* Read the FCF and net income columns over at least four periods; a persistent gap is raised.
5. Stock-based compensation or dilution that eats the buyback or the earnings. *How:* Compare SBC with free cash flow and the share-count change in Financials.
6. A debt maturity wall, covenant pressure or heavy reliance on refinancing. *How:* Read the Debt & liquidity database: maturities in the next 24 months against cash and operating cash flow.
7. Customer, supplier or segment concentration. *How:* Look for the 10% customer disclosure, the top-customer share and the share of profit by segment.
8. Margin erosion, serial guidance cuts or repeated earnings misses. *How:* Read the Financials margins and the analyst and guidance history; two or more misses in a row are raised.
9. Insider selling clusters, pledged shares or unusual related-party transactions. *How:* Read the Management database flags and the insider timeline; cite the Form 4 or proxy line.
10. Material litigation, regulatory action, a short-seller report or a government investigation. *How:* Search the legal proceedings note, regulator sites and news for the company and its executives.
11. Dividend or buyback payouts above free cash flow. *How:* Compare shareholder returns with FCF over three periods; funding them with debt is raised.
12. A technological, regulatory or competitive shift that undermines the core franchise. *How:* Check the Peers database and the industry sources for a rival or a rule that attacks the main profit pool.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Business quality & moat | 25% | Commodity business, no pricing power, returns below the cost of capital. | Solid franchise with some pricing power and returns above the cost of capital. | Durable moat (network, scale, switching costs) with high, stable returns on capital. | business |
| Growth | 20% | Shrinking or flat revenue; the market is saturated. | Steady mid-single to low-double-digit growth the company can fund itself. | Durable high growth with a long runway, visible in segment data. | financials |
| Financial strength & earnings quality | 15% | Leveraged, cash burning, earnings far above cash flow. | Manageable debt, positive free cash flow, earnings broadly match cash. | Net cash or low leverage, strong and clean free cash flow, conservative accounting. | quality |
| Management & governance | 15% | Poor capital allocation, weak governance, insiders selling heavily. | Competent team, reasonable allocation, standard governance. | Owner-operators with a record of value-creating allocation and aligned pay. | management |
| Valuation | 25% | Priced for perfection: the base case is below the price. | Fairly priced: the base case is near the price. | Clear margin of safety: the base case is well above the price and the bear case is limited. | valuation |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Equity research note: {{company}}. Every paragraph cites cards; every number cites its source and its "as of" date; reported and estimated figures are marked as such.

1. Summary & recommendation (at most 150 words): The recommendation, the score, the base fair value against the price, the top 3 reasons and the top 3 risks, in at most 150 words.
2. Company snapshot: A table of the snapshot metrics with their dates.
3. Business & segments: How it earns, the segment table, the moat and what erodes it.
4. Financial performance: Five years of growth, margins, cash flow and returns, with the charts.
5. Earnings quality & balance sheet: GAAP against adjusted, cash conversion, leverage and the maturity profile.
6. Industry & competition: The peer table, the scorecard and the 2x2, and where the company wins and loses.
7. Management & governance: The team, ownership, pay, insider activity and capital allocation.
8. Valuation: The scenarios with their assumptions, the peer multiples and what the price implies.
9. Catalysts: The dated events and how each could move the stock.
10. Sentiment & positioning: Analyst views, short interest, ownership and the main arguments for and against.
11. Risks & mitigants: The red-flag outcomes: each raised flag with its mitigant, and the cleared ones in one line.
12. Thesis: bull, base and bear: The three cases, the key hypotheses with confidence and what would make us wrong.
13. Scorecard: The rubric table: each dimension, its weight, its score and its evidence.
14. Open questions & monitoring plan: The ranked questions, the dated catalysts to watch and what would change the call.

Appendix: All sources.

One-page summary: Snapshot, Valuation range, Score, Recommendation, Top risks.

Deck format: `equity-ic`.

## Follow-up chips

Shown after the first pass.

- Stress-test the base case: Stress-test the base case for {{company}}: which two assumptions move the fair value most, and what happens to it if each is 20% worse?
- Build the short case: Build the strongest short case for {{company}} from the cards on this board, with the evidence that would change your mind.
- Compare to [peer]: Compare {{company}} to [peer]: growth, margins, returns, balance sheet and valuation, side by side with a table.
- Prepare earnings-call questions: Draft the questions to ask on the next {{company}} earnings call, ordered by importance and linked to the gaps and risks on the board.
- Update with the new quarter: The new quarterly report is out. Add it to Financials, tell me which numbers moved against the base case and update the scenarios.
- Size the position: Suggest a position size for {{company}} given the scenarios, the probabilities and my {{horizon|holding}} horizon, and what would make me add or trim.

## Signed-in sources

- Seeking Alpha (seekingalpha.com): Transcripts, analyst articles and the bull and bear arguments.
- Morningstar (morningstar.com): Fair value estimates, moat ratings and peer financials.
- Financial Times (ft.com): Reporting and analysis on the company and its sector.
- Wall Street Journal (wsj.com): Reporting and analysis on the company and its sector.

## Monitor

Only when the user asks: `{{company}} earnings, guidance, SEC filings, lawsuits, short-seller reports and executive changes`. News that would change the recommendation.
