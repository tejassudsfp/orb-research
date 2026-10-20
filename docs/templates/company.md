# Company research

<!-- Generated from packages/shared/src/templates/company.ts by `pnpm templates:docs`. Do not edit by hand. -->

Profile the company from primary sources where possible, for the purpose in the intake: what it does, how it makes money, its products, leadership, market and competitors, customers and reputation, financials and funding, recent news and direction, and the main risks. Cite filings, official pages and reputable reporting; mark what the company says apart from what independent sources show, and date every figure.

Template id `company`. Canvas title: `{{company}}: company research`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Company name (`company`) | text | yes | placeholder "Acme Robotics" |
| Website URL (`website`) | url | yes | placeholder "https://acme.com" |
| Why you are researching it (`purpose`) | select | no | one of Understand a competitor, Evaluate as a partner or supplier, Evaluate as an employer, Prepare to sell to it, Screen as an investment, General research |
| What you most want to know (`questions`) | longtext | no | placeholder "How stable is it, and who really buys from it?" |
| HQ and region (`geography`) | text | no | placeholder "Berlin, EU" |
| Known competitors (`competitors`) | list | no | placeholder "Comma separated". Optional. Scout finds more. |
| Materials (`materials`) | materials | no | Drop annual reports, filings, decks, press kits or your own notes (PDF, text, CSV or XLSX). Each becomes a card or database; numbers from them are tagged as reported by the company. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites LinkedIn, Crunchbase, Glassdoor. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** Public pages and search only: no deep research, at most 12 cards per frame, a short competitor list and the memo is the summary only.
- **Standard:** Quick, plus find_entities and batch_enrich for competitors and one or two deep-research runs (core), asking before spend.
- **Deep:** Standard, plus pro or ultra research on the market and the company's history, full competitor discovery and the full memo and deck.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 SNAPSHOT (signal; orb, scout)

Brief: What {{company}} does in a sentence, where it is based, when it was founded, how big it is, who owns it and why it matters for your purpose ({{purpose|general research}}). Questions to answer: {{questions|none given}}.

Target: 1+ entity (the company); 5+ metric; 1+ doc (the one-liner).

Seed cards:
- entity: {{company}}
- doc: One-liner
- metric: Founded
- metric: Headcount
- metric: Revenue or funding
- metric: Customers
- metric: Locations
- question: What do I most need to know about {{company}}, given why I am researching it?

### 02 BUSINESS MODEL (sky; scout, builder)

Brief: How {{company}} makes money: who pays, for what, how (subscription, usage, transaction, licence, services, hardware), the pricing headline, the sales motion and where the margin comes from. Draw the flow of money.

Target: 1+ diagram (how money flows); 1+ framework (pros and cons of the model); 4+ source.

Seed cards:
- framework: Business model: pros and cons
- question: Who pays, who uses and who decides, and are they the same people?

### 03 PRODUCTS & OFFERINGS (rho; scout, builder)

Brief: What it sells: products and services, who each is for, the pricing, the launch and status, and how they fit together. Screenshots of the main pages and products.

Target: 1+ database (Products); 2+ product (kind product); 2+ image (screenshots).

Seed cards:
- database: Products (database `products`)

### 04 LEADERSHIP & PEOPLE (sky; scout, critic)

Brief: Who runs the company: the founders and executives, their backgrounds, tenure and prior companies, the board and the advisors, recent departures, and the hiring signal (open roles, headcount trend, employee sentiment). Public professional information only.

Target: 1+ database (People); 2+ entity (the leaders, kind person); 3+ source.

Seed cards:
- database: People (database `people`)
- question: Who is missing from the leadership team, and who just left?

### 05 MARKET & COMPETITORS (rho; scout, builder, critic)

Brief: The market it competes in: size and growth, who the competitors are (direct, indirect, incumbents, substitutes), where {{company}} stands against them and where it wins or loses. Place them on a 2x2.

Target: 1+ database (Competitors, at least 8 rows); 1+ framework (the 2x2); 1+ chart (funding or size by competitor); 2+ metric (market size and growth).

Seed cards:
- database: Competitors (database `competitors`)
- chart: Total funding by competitor (database `competitors`)
- framework: Positioning 2x2
- metric: Market size
- metric: Market growth

### 06 CUSTOMERS & REPUTATION (sky; scout)

Brief: Who buys it and what they say: named customers and case studies, reviews (G2, Capterra, app stores, Trustpilot), the press, awards and social sentiment. Quote positive and negative voices.

Target: 1+ database (Customers); 6+ quote (at least 2 negative); 1+ metric (review rating).

Seed cards:
- database: Customers (database `customers`)
- metric: Review rating

### 07 FINANCIALS & FUNDING (rho; scout, orb)

Brief: The money side: revenue, growth, profitability and cash where public or reported, funding rounds and investors, ownership and debt. Mark each figure Reported, Estimated or Claimed, with the period. For a private company say plainly what is not public.

Target: 1+ database (Financial facts); 1+ timeline (funding); 1+ chart (revenue or funding over time).

Seed cards:
- database: Financial facts (database `financials`)
- timeline: Funding and ownership
- chart: Financial facts over time (database `financials`)

### 08 NEWS & DIRECTION (sky; scout, orb)

Brief: What has happened and where it is heading: launches, partnerships, acquisitions, executive moves, controversies, the stated strategy, hiring and the roadmap signals. Dated events with a source each, and your hypotheses about the direction.

Target: 1+ timeline (events of the last 24 months); 2+ hypothesis; 4+ source.

Seed cards:
- timeline: News and events
- hypothesis: The strategy is to move up-market
- hypothesis: The company is investing in a new line of business

### 09 RISKS & RED FLAGS (paper; critic)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence or clear it with a source. Cover legal, security, reputation, financial and dependency risk.

Target: 5+ risk (every checklist item cleared with a source or raised).

Seed cards:
- checklist: Red-flag checklist
- risk: Financial risk
- risk: Legal and regulatory risk
- risk: Reputation risk
- risk: Dependency risk

### 10 ASSESSMENT (signal; orb)

Brief: What the research means for your purpose ({{purpose|general research}}): the strengths and weaknesses, the answer to your questions, the score against the rubric with cited evidence, and a recommended next step.

Target: 1+ framework (SWOT); 1+ decision; 1+ matrix (the filled rubric); 3+ insight.

Seed cards:
- framework: SWOT: {{company}}
- decision: What should we do about {{company}}?
- matrix: Company scorecard (rubric score x 2, so 10 is a 5)

## Databases

### Products (frame `products`)

Every product or service the company sells.

| Column | Type | Notes |
|---|---|---|
| Product | text |  |
| What it does | text |  |
| For | text | The customer it is sold to. |
| Pricing | text |  |
| Launched | date |  |
| Status | enum (Current, New, Beta, Retired) |  |
| Source | url |  |

Views: All (table); By status (board, by Status).

### People (frame `people`)

One row per leader, board member or key hire. Public professional information only.

| Column | Type | Notes |
|---|---|---|
| Name | person |  |
| Role | text |  |
| Background | text |  |
| Prior companies | text |  |
| Tenure (years) | number |  |
| LinkedIn | url |  |
| Source | url |  |
| Flags | text | Short tenure, departure, controversy, unverifiable claim. |

Views: All (table); Flagged (table, filtered).

### Competitors (frame `market`)

Direct and indirect competitors. Discovered with find_entities and enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Category | enum (Direct, Indirect, Incumbent, Substitute) |  |
| HQ | text |  |
| Founded | number |  |
| Headcount | number |  |
| Total funding | currency | US dollars. |
| Differentiator | text |  |
| Threat level | rating | 1 (low) to 5 (high). |
| Source | url |  |

Views: All (table, sorted by Threat level desc); By category (board, by Category).

### Customers (frame `customers`)

Named customers and the proof behind each.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| Segment | text |  |
| Since | date |  |
| Use case | text |  |
| Proof | enum (Case study, Press, Review, Logo only) |  |
| Source | url |  |

Views: All (table); By proof (board, by Proof).

### Financial facts (frame `financials`)

Every financial figure with its period, how reliable it is and its source.

| Column | Type | Notes |
|---|---|---|
| Metric | text | Revenue, profit, cash, funding raised, valuation ... |
| Value | number |  |
| Unit | text | USD, percent, count. |
| Period | date | ISO date or year-month. |
| Basis | enum (Reported, Estimated, Claimed) |  |
| Source | url |  |
| Note | text |  |

Views: All (table, sorted by Period asc); By basis (board, by Basis).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read what the user dropped first: reports, filings, decks, press kits (board_map, read_card, read_source, query_dataset). Put every financial figure from them into Financial facts (upsert_rows) with Basis "Reported" when it comes from a filing or report, otherwise "Claimed", and the file as Source. Hand the company, the purpose and the questions to Scout in the delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`.
2. Delegate with delegate: Scout first (its eight-step playbook), Builder once Scout has the business model and competitors, Critic once Scout has sources to review. Name the frames each agent owns, and hand over the intake facts (names, links, concerns) in the instruction. Tools: `delegate`, `message_agent`.
3. After Scout's first pass, fill the Snapshot metrics (update_card) and the one-liner, each with a cited figure and its date. Never write a figure you cannot source; say "not public" where that is the case. Tools: `query_board`, `search_board`, `update_card`.
4. For a gap Scout could not close (a private company's revenue, the strategy), run deep_research (core) on that one question. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
5. Answer the user's questions with cited Insight cards (each cites at least two cards). Fill the Company scorecard matrix: one 1-to-5 score per rubric dimension (doubled), each with a cited card; the SWOT; the hypotheses (evidence for and against); the Decision with the weighted total in its rationale. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
6. Write the memo with compose_section, section by section in the order of the memo outline, then the one-page summary. On the Quick tier write the summary only. When the user asks for slides, compose_slides with the deck outline. Tools: `compose_section`, `compose_slides`.
7. Only when the user asks to keep watching: watch_topic with the monitor query. Monitors cost money on every check, so each is confirmed by the user. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `stop_watch`.

### Scout

1. The company site first: home, about, products, pricing, customers, careers and press (fetch_url, parallel_extract). capture_page screenshots of the home and pricing pages as image cards in Products & offerings. Source cards for the claims that matter, marked as company claims. Tools: `fetch_url`, `parallel_extract`, `capture_page`, `place_card`.
2. Products: one Products row each (upsert_rows, key Product) with who it is for, pricing and status; a Product card (kind product) for the main two. The business model: who pays, for what and how, with the pricing headline. Tools: `fetch_url`, `web_search`, `place_card`, `upsert_rows`.
3. Leadership: start with the about page and the press kit. LinkedIn or Crunchbase only via fetch_signed_in, and only if the user ticked them; otherwise public search. One entity card (kind person) per leader and one People row each (upsert_rows, key Name) with the Flags column. Public professional information only. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `place_card`, `upsert_rows`.
4. Financials and funding: filings and reports first, then Crunchbase if connected, press otherwise. One Financial facts row per figure (upsert_rows, key Metric) with period, Basis Reported or Estimated and a Source url; one dated event per round or deal on the Funding and ownership timeline. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `parallel_extract`, `upsert_rows`, `place_card`.
5. Competitors: the ones the user named, then find_entities and batch_enrich (HQ, founded, headcount, total funding, differentiator); consolidate into Competitors (upsert_rows, key Name) with a Source url. Market size and growth as metric cards with their source. Quick scan: find_entities and batch_enrich are refused; add rows from web_search. Tools: `find_entities`, `batch_enrich`, `web_search`, `fetch_url`, `upsert_rows`, `place_card`, `query_dataset`.
6. Customers and reputation: named customers and case studies into Customers (upsert_rows, key Name); G2, Capterra, app store, Trustpilot and Glassdoor reviews (fetch_signed_in only if ticked) as Quote cards, positive and negative; the average rating metric with the site and date. Tools: `web_search`, `fetch_url`, `fetch_signed_in`, `place_card`, `upsert_rows`.
7. News and direction: dated launches, deals, moves and incidents of the last 24 months on the News and events timeline, each with a source; hiring trend and open roles; the stated strategy. Search litigation, layoffs, breaches and traffic decline so Critic has sources to clear or raise each flag. Tools: `web_search`, `fetch_url`, `fetch_signed_in`, `place_card`.
8. Deep research for the gaps that remain: deep_research (core or above, per the tier). *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Challenge every figure or claim with a single source, a company-only source or an old date: link it "tension" to the card that disagrees, or place a Question asking for the second source. Challenge each market-size number. Tools: `query_board`, `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. A diagram of how money flows (who pays whom, for what) and the business model pros and cons (framework), from cards only. Tools: `place_card`, `query_board`, `read_card`.
2. How the products fit together as a diagram; a Product card for the main product if Scout has not placed one. Tools: `place_card`, `query_dataset`, `read_card`.
3. The funding chart bound to Competitors, the positioning 2x2 (framework, quadrant) and the SWOT from the cards on the board. Tools: `place_card`, `query_dataset`, `query_board`, `read_card`.
4. Optional one-page visual summary of the company (a design frame): snapshot, business model, leaders, competitors, top risks, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. Leadership churn: several executives left in the last two years. *How:* Check the People database for short tenures, ex-executives and open leadership roles.
2. Layoffs, hiring freezes or a drop in open roles. *How:* Look for layoff news and the hiring trend in the News & events timeline.
3. Litigation, regulatory action or an investigation. *How:* Search court, regulator and news sources for the company and its leaders; if none were searched, ask for the search.
4. Security incidents or data breaches. *How:* Look for breach news, a status page history and security notices.
5. Negative review patterns on service, reliability or billing. *How:* Read the negative quotes in Customers & reputation and count recurring themes.
6. Claims that no independent source corroborates (customers, revenue, awards). *How:* For each claim in the Snapshot and Financial facts, find a second source; claimed-only numbers are raised.
7. Dependence on a single customer, supplier or platform. *How:* Read the Business model and Customers frames for a dependency the company cannot work without.
8. Funding trouble: a down round, a long gap since the last round or a debt-heavy structure. *How:* Read the Financial facts and the funding events; gaps and bridge rounds are raised.
9. A well-funded competitor shipping the same product. *How:* Check the Competitors database and the timeline for a funded rival launching the same capability.
10. Stale information: key facts older than 12 months presented as current. *How:* Check each fact's date; stale facts are marked and a Question asks for a refresh.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Business model | 20% | Unclear how it makes money. | A proven model with ordinary margins. | A strong, repeatable model with expanding revenue per customer. | model |
| Growth | 20% | Shrinking or flat. | Growing with the market. | Growing well above the market, with signals to match. | financials |
| Competitive position | 20% | A follower in a crowded market. | A solid player with a clear niche. | A leader with a moat. | market |
| Leadership | 15% | High turnover or no relevant record. | A competent team with some gaps. | A proven, stable team with deep domain experience. | people |
| Customer reputation | 15% | Frequent serious complaints. | Mixed to good reviews. | Strong, consistent praise with named references. | customers |
| Financial health | 10% | Cash trouble signals. | Adequate runway or profitability. | Well funded or profitable with room to invest. | financials |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Company profile: {{company}}. Every paragraph cites cards; every number cites its source, period and basis (reported, estimated or claimed); what the company says is marked apart from what independent sources show.

1. Summary & assessment (at most 150 words): What the company is, the answer to the main question, the score and the top three risks, in at most 150 words.
2. Company snapshot: A table of the snapshot facts.
3. Business model: Who pays for what, the pricing headline and the margin logic.
4. Products and offerings: The products, who each is for and how they fit together.
5. Leadership and people: The leaders, their records, departures and hiring signals.
6. Market and competitors: The market, the competitor table and the 2x2.
7. Customers and reputation: Named customers, review themes and quotes.
8. Financials and funding: The financial facts table with basis and the funding timeline.
9. News and direction: The events timeline and the hypotheses about direction.
10. Risks and red flags: The red-flag outcomes: each raised flag with its mitigant, and the cleared ones in one line.
11. Scorecard and next step: The rubric table and the recommended next step.

Appendix: All sources.

One-page summary: Snapshot, Score, Business model, Top risks.

Deck format: `standard`.

Deck: Company profile: {{company}}. Slides, in order:

1. The company in one slide: What it does, its size and the assessment.
2. Business model: How money flows and the pricing headline.
3. Products: The products with screenshots.
4. Leadership: The leaders and the changes.
5. Market and competitors: The competitor table and the 2x2.
6. Customers and reputation: Named customers and review themes.
7. Financials and funding: The financial facts and funding timeline.
8. News and direction: The events timeline and where it is heading.
9. Risks: The raised red flags with mitigants.
10. Assessment and next step: The scorecard and the recommendation.

## Follow-up chips

Shown after the first pass.

- Go deeper on a product: Go deeper on [product] of {{company}}: how it works, pricing, customers and the strongest rival.
- Compare with a competitor: Compare {{company}} with [competitor]: product, pricing, funding, customers, with a table.
- Profile the leadership: Profile the leadership of {{company}}: each leader's record, tenure and anything that needs checking, public sources only.
- Prepare for a meeting: Prepare me for a meeting with {{company}}: what to know, the questions to ask and the topics to avoid.
- Keep it current: Start a monitor on {{company}}: launches, funding, leadership changes, legal and security news.
- Build the bear case: Build the strongest case against {{company}} from the cards on this board, with the evidence that would change your mind.

## Signed-in sources

- LinkedIn (linkedin.com): Leaders' backgrounds, tenure, headcount and hiring trend.
- Crunchbase (crunchbase.com): Funding rounds, investors, acquisitions and headcount.
- Glassdoor (glassdoor.com): Employee sentiment, ratings and interview reports.

## Monitor

Only when the user asks: `{{company}} news: launches, funding, leadership changes, layoffs, lawsuits and security incidents`. News that would change the assessment.
