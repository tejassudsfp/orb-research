# Trend report

<!-- Generated from packages/shared/src/templates/trend-report.ts by `pnpm templates:docs`. Do not edit by hand. -->

Write a trend report: a definition and the signals that show it, the drivers and forces behind it, the data on adoption, the early movers, the counter-trends and skeptics, scenarios, the implications and opportunities, and the leading indicators to watch, scored by a trend-strength rubric. Separate hard data from buzz and surveys of intent, show the evidence against the trend, give each number a source and a date, and say how confident you are.

Template id `trend-report`. Canvas title: `Trend report: {{trend}}`.

## Intake form

Shown on Home when the chip is picked.

| Field | Kind | Required | Notes |
|---|---|---|---|
| Trend or theme (`trend`) | text | yes | placeholder "Remote-first work" |
| Industry or domain (`domain`) | text | no | placeholder "Commercial real estate" |
| Geography (`geography`) | text | no | placeholder "Global, or a region" |
| Time horizon (`horizon`) | select | no | one of 1 year, 3 years, 5 years, 10 years |
| Audience (`audience`) | select | no | one of Leadership team, Investors, Product team, Marketing and brand, Policy makers, General readers |
| What you need to decide (`question`) | longtext | no | placeholder "Should we build for this now or in two years?" |
| Claims you want tested (`claims`) | longtext | no | placeholder "Everyone says it will double by 2028." |
| Known early movers (`players`) | list | no | placeholder "Companies, products, places. Comma separated". Optional. Scout finds more. |
| Signals to track (`signals`) | list | no | placeholder "Search interest, job posts, funding, patents". Optional. They become the leading indicators. |
| Materials (`materials`) | materials | no | Drop a report, survey results, a dataset (CSV) or notes. Each becomes a card or database. |
| Depth (`depth`) | depth | yes | Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending. |
| Signed-in sources to use (`sites`) | sites | no | sites Statista, Gartner, Crunchbase, Similarweb. Only the sites you connected in Settings can be used. Scout reads them as you, read-only. |

## Depth tiers

| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |
|---|---|---|---|---|---|---|
| Quick scan | about 15 minutes | low cost | parallel_extract, web_answer, image_search, entity_search, research_memory | 0 | 12 | summary |
| Standard | about 45 minutes | moderate cost | deep_research, research_status, find_entities, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 2 | no limit | full |
| Deep | about 2 hours | higher cost, asks before spend | deep_research, research_status, find_entities, find_entities_extend, batch_enrich, entity_search, research_memory, suggest_task_spec, web_answer, parallel_extract, image_search, watch_topic | 8 | no limit | full |

- **Quick scan:** No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the report is the summary only.
- **Standard:** Quick, plus early-mover discovery with find_entities, batch enrichment of the Players database, one or two deep-research runs (core) and optional monitors, asking before spend.
- **Deep:** Standard, plus pro or ultra deep research on forecasts and the strongest counter-trend, FindAll extension for a complete players list and the full report.

orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.

## Frames

### 01 TREND DEFINITION (signal; orb)

Brief: What the trend is and is not, in one precise paragraph: the behaviour, technology or condition that is changing, the scope (domain, geography, horizon), where it began and the headline numbers. Everything else is checked against this definition.

Target: 1+ doc (the definition); 4+ metric; 1+ hypothesis.

Seed cards:
- doc: Definition
- hypothesis: The trend is real and durable
- metric: Headline figure
- metric: Growth rate
- metric: Where it stands
- metric: Forecast

### 02 SIGNALS & EVIDENCE (sky; scout, critic, builder)

Brief: Every piece of evidence that the trend exists: data series, product launches, funding, policy, research, job posts, search interest and behaviour. One row each with its type (hard data, event, survey of behaviour, survey of intent, buzz), the date, the direction (strengthens or weakens) and a strength rating.

Target: 1+ database (the Signals database, at least 25 rows on Standard); 2+ chart (signals by type and over time); 5+ source.

Seed cards:
- database: Signals (database `signals`)
- chart: Signals over time (database `signals`)
- chart: Signals by type (database `signals`)

### 03 DRIVERS & FORCES (rho; scout, critic, builder)

Brief: What makes the trend happen: the technological, economic, social, environmental, political and regulatory forces behind it, each with the direction, the strength, the time to full effect and whether it could expire. Look for reinforcing loops.

Target: 1+ database (Drivers); 1+ framework (SWOT of the trend); 1+ diagram (the causal map).

Seed cards:
- database: Drivers (database `drivers`)
- framework: Forces for and against: {{trend}}
- question: Which driver, if it disappeared, would end the trend?

### 04 ADOPTION & DATA (sky; scout, builder)

Brief: How far and how fast it has spread: the adoption curve by segment and region, the data series behind it (usage, shipments, revenue, penetration), the stage on the diffusion curve and the saturation point. Use official or primary data first.

Target: 1+ database (Indicators, with a series per measure); 2+ chart (the main series and a regional split); 3+ metric; 1+ timeline.

Seed cards:
- database: Indicators (database `indicators`)
- chart: Main indicators over time (database `indicators`)
- timeline: Milestones of the trend
- metric: Adoption today
- metric: Years to saturation

### 05 PLAYERS & EARLY MOVERS (rho; scout, critic)

Brief: Who is ahead: companies, products, projects, cities or institutions that moved first, what each did, how it is going and what to learn from it. Include the ones that failed.

Target: 1+ database (Players, at least 10 on Standard); 3+ entity; 3+ quote.

Seed cards:
- database: Players (database `players`)
- question: What do the early movers know that the rest do not?

### 06 COUNTER-TRENDS & SKEPTICS (paper; critic, scout)

Brief: Work through the red-flag checklist: raise each flag as a Risk card with evidence, or clear it with a source. Also collect the strongest case against the trend: counter-trends, substitutes, failed predictions of the same kind and the skeptics’ best arguments, each with a source.

Target: 6+ risk (every checklist item cleared with a source or raised); 3+ quote (the skeptics in their own words).

Seed cards:
- checklist: Red-flag checklist
- risk: Evidence risk
- risk: Hype risk
- risk: Counter-trend risk
- risk: Timing risk

### 07 SCENARIOS (sky; orb, builder)

Brief: Where it could go by the end of the horizon: three or four scenarios built on the two most uncertain drivers, each with the conditions that lead to it, what it looks like, the probability and the signals that show it is happening.

Target: 1+ framework (the scenario 2x2); 3+ hypothesis (one per scenario with a probability); 1+ timeline.

Seed cards:
- framework: Scenario 2x2
- hypothesis: Scenario A: the trend accelerates
- hypothesis: Scenario B: the trend plateaus
- hypothesis: Scenario C: the trend reverses

### 08 IMPLICATIONS & OPPORTUNITIES (rho; orb, builder)

Brief: What it means for {{audience|the reader}}: who gains and who loses, the opportunities and threats, the actions for each scenario, what to do now, what to prepare and what to avoid. Tie each action to the evidence behind it.

Target: 1+ framework (pros and cons of acting now); 1+ matrix (the filled rubric); 1+ decision; 2+ insight.

Seed cards:
- matrix: Trend-strength scorecard (rubric score x 2, so 10 is a 5)
- framework: Acting now: pros and cons
- decision: What to do about {{trend}}

### 09 LEADING INDICATORS & MONITORING (signal; orb, scout)

Brief: The few measures that would show early whether the trend is on track or turning: each with its source, how often it updates, the threshold that matters and what to do when it is crossed. orb can watch them with a monitor when the user asks.

Target: 1+ checklist (the indicators to watch with their thresholds); 1+ timeline.

Seed cards:
- checklist: Indicators to watch
- question: Which single indicator would change our mind fastest?

### 10 OPEN QUESTIONS (paper; critic, orb)

Brief: What is still unknown, ranked by importance and linked to the gap behind each: data that does not exist yet, claims that need a second source, and the questions to put to experts.

Target: 1+ checklist (at least 8 ranked questions, each linked to its source card).

Seed cards:
- checklist: Questions to answer next

## Databases

### Signals (frame `signals`)

Every piece of evidence for or against the trend, with its type and who produced it.

| Column | Type | Notes |
|---|---|---|
| Signal | text |  |
| Type | enum (Hard data, Event, Product launch, Funding, Policy, Research, Behaviour survey, Intent survey, Buzz) |  |
| Date | date |  |
| Direction | enum (Strengthens, Weakens, Neutral) |  |
| Strength | rating | 1 (weak) to 5 (strong evidence). |
| Region | text |  |
| Producer | text | Who produced and who sponsored it. |
| Value | text | The figure, with the unit. |
| Source | url |  |

Views: All (table, sorted by Date desc); By direction (board, by Direction); Hard evidence (table, filtered).

### Drivers (frame `drivers`)

The forces that cause the trend, and whether each could expire.

| Column | Type | Notes |
|---|---|---|
| Driver | text |  |
| Category | enum (Technology, Economic, Social, Environmental, Political, Regulatory) |  |
| Direction | enum (Accelerates, Slows, Both) |  |
| Impact | rating | 1 (small) to 5 (decisive). |
| Time to effect | text |  |
| Could expire | boolean | True for a subsidy or temporary condition. |
| Evidence | text |  |
| Source | url |  |

Views: All (table, sorted by Impact desc); By category (board, by Category); Fragile (table, filtered).

### Indicators (frame `adoption`)

Data series behind the trend: one row per indicator and period.

| Column | Type | Notes |
|---|---|---|
| Point | text | A key such as "Share of workers, 2024". |
| Indicator | text |  |
| Date | date |  |
| Value | number |  |
| Unit | text |  |
| Region | text |  |
| Basis | enum (Official, Survey, Company data, Estimate) |  |
| Source | url |  |

Views: All (table, sorted by Date asc); By indicator (table, by Indicator).

### Players (frame `players`)

Early movers and leaders, and how they are doing. Discovered with find_entities, enriched with batch_enrich.

| Column | Type | Notes |
|---|---|---|
| Name | text |  |
| URL | url |  |
| Type | enum (Company, Startup, Product, Project, City or country, Institution) |  |
| HQ | text |  |
| Founded | number |  |
| What they did | text |  |
| Outcome | enum (Leading, Growing, Struggling, Failed, Too early) |  |
| Funding | currency | US dollars, if a company. |
| Lesson | text |  |
| Source | url |  |

Views: All (table); By outcome (board, by Outcome); Failures (table, filtered).

## Agent playbook

Injected into each agent's first assignment, not its persona.

### orb

1. Read the uploaded materials first (read_card and read_source for reports, query_dataset for datasets). Put every series from a dataset into the Indicators database (upsert_rows) with Basis from its source. Sharpen the definition card (update_card) so that it says what counts. Hand the early movers, the claims to test and the ticked signed-in sources from the intake to Scout in its delegate instruction. Tools: `board_map`, `read_card`, `read_source`, `query_dataset`, `upsert_rows`, `update_card`.
2. Delegate with delegate: Scout first (signals, drivers, adoption data, players), Builder once the Signals database has rows, Critic once Scout has sources to review. Name the frames each agent owns. Tools: `delegate`, `message_agent`.
3. After Scout’s first pass, fill the Definition metrics (update_card): the headline figure, the growth rate, where it stands and the forecast, each with a source and a date. For the forecast name who made it and who paid for it. Never write a figure you cannot source. Tools: `query_dataset`, `query_board`, `search_board`, `update_card`.
4. For a gap Scout could not close (a data series that is behind a paywall, the strongest forecast, evidence from another region), run deep_research (core) on that one question. Ask the user before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`, `ask_user_question`.
5. Build the scenarios from the two most uncertain drivers in the Drivers database (query_dataset): fill the 2x2 and the three scenario hypotheses (update_card), probabilities that add up to about 100 and the signals that would show each one. Tools: `query_dataset`, `query_board`, `update_card`, `place_card`, `add_link`.
6. At the end fill the Trend-strength scorecard: one 1-to-5 score per rubric dimension (doubled on the matrix), each with a cited card. Then the pros and cons of acting now and the Decision card: your proposed action and the weighted total in its rationale. Place insight cards that cite at least two cards each for the implications. Tools: `query_board`, `read_card`, `update_card`, `place_card`, `add_link`.
7. Write the report with compose_section, section by section in the order of the outline, then the one-page summary. On the Quick tier write the summary only. Tools: `compose_section`.
8. Only when the user asks to keep the trend current: watch_topic on the leading indicators (the monitor query, one watch per indicator that has news) and list the watches on the Indicators checklist. Monitors cost money on every check, so each is confirmed by the user; stop_watch when it is no longer needed. *(from the standard tier)* Tools: `watch_topic`, `list_watches`, `watch_events`, `stop_watch`, `update_card`.

### Scout

1. The framing sources: where the trend began, the common definitions and the competing ones (web_search, fetch_url, web_answer for a quick figure and then the primary source). Place source cards; sizing and growth figures go into Signals rows (upsert_rows, key Signal) with the date and who produced and sponsored them. Tools: `web_search`, `fetch_url`, `web_answer`, `parallel_extract`, `place_card`, `upsert_rows`.
2. Signals: one Signals row per piece of evidence (upsert_rows, key Signal) with Type (Hard data, Event, Product launch, Funding, Policy, Research, Behaviour survey, Intent survey or Buzz), Date, Direction and Strength; keep surveys of intent apart from surveys of behaviour. Statista, Gartner, Crunchbase or Similarweb through fetch_signed_in when connected. Add signals that weaken the trend too. Tools: `fetch_signed_in`, `web_search`, `fetch_url`, `parallel_extract`, `upsert_rows`, `place_card`.
3. Drivers: one row per force (upsert_rows, key Driver) with the category, direction, impact and whether it could expire (a subsidy, a temporary condition), with a source. Tools: `web_search`, `fetch_url`, `upsert_rows`, `place_card`.
4. Adoption data: official and primary series first. One Indicators row per indicator and period (upsert_rows, key Point) with unit, region and Basis; milestones on the timeline (place_card); fill the Adoption metrics. Tools: `fetch_url`, `parallel_extract`, `web_search`, `place_card`, `upsert_rows`.
5. Players: the early movers in the intake first. find_entities discovers more (the match limit follows the depth tier); batch_enrich fills Type, HQ, Founded, What they did, Outcome and Funding with an output schema of those fields. Copy the rows into the Players database (query_dataset, upsert_rows, key Name), a Source on every row, and include failures. Place an entity card for the leaders and quote cards for what they say. On the Quick tier those two tools are refused: add a few from web_search with upsert_rows instead. Tools: `find_entities`, `batch_enrich`, `web_search`, `fetch_url`, `place_card`, `query_dataset`, `upsert_rows`.
6. The case against: skeptics and counter-trends in their own words as quote cards, failed predictions of the same kind, and substitutes; also search for sponsors and funders of the surveys so Critic has sources to clear or raise each flag. Tools: `web_search`, `fetch_url`, `place_card`.
7. Deep research for the gaps that remain: deep_research (core or above, per the tier). Ask before spend over $0.50. *(from the standard tier)* Ask before spend over $0.50. Tools: `deep_research`, `research_status`.

### Critic

1. Start after Scout’s first sources: read the databases and the cards of every frame (board_map, search_board, read_card, query_dataset) before judging anything. Tools: `board_map`, `search_board`, `read_card`, `query_board`, `query_dataset`.
2. Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source cards that clear it and the Red-flag checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does. Tools: `place_card`, `add_link`, `read_source`, `query_dataset`.
3. Weigh the evidence: for every claim that rests on a survey of intent, a sponsored forecast or one source, link it with "tension" to the card that disagrees or place a Question asking for the second source. Name the driver in Drivers that is most fragile and say why. Tools: `query_dataset`, `read_card`, `add_link`, `place_card`.
4. Turn every gap into a Question card in Open questions, with a link to the card or gap that prompted it. Tools: `place_card`, `add_link`.
5. Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised. Tools: `report_progress`, `send_message`.

### Builder

1. Charts bound to the databases: signals over time (line) and signals by type from Signals, the main indicators over time from Indicators, with a regional split. Never an inline chart when a database holds the data. Tools: `place_card`, `query_dataset`.
2. A diagram of the causal map: how the drivers reinforce each other and what feeds back, from the Drivers database. Tools: `place_card`, `query_dataset`, `read_card`.
3. The scenario 2x2 (framework, quadrant) and a timeline of when each scenario’s signals would appear, from the hypotheses orb wrote. Tools: `place_card`, `read_card`, `query_board`.
4. The pros and cons of acting now (framework) and, where a table helps, the actions by scenario. Tools: `place_card`, `read_card`, `query_board`.
5. Optional one-page visual summary (a design frame): the definition, the headline chart, the score and the three actions, built only from cards on the board. *(from the standard tier)* Tools: `write_design_frame`, `query_board`, `read_card`.

## Red-flag checklist

Critic clears (with a source) or raises each one.

1. The trend rests on one source, or on sources that copy each other. *How:* Count independent origins in the Signals database; a claim whose Source column traces to one origin is raised.
2. A survey or forecast funded by a party that sells into the trend. *How:* Check who sponsored each survey or market forecast and record it in Signals; raise sponsored-only claims.
3. Extrapolation from a short window or a single spike (a launch, a news cycle). *How:* Look at the span of each series in the Indicators database; raise a trend inferred from less than about a year.
4. Search interest or social buzz is the only evidence of adoption. *How:* Look for usage, revenue, shipment or behaviour data next to the buzz; raise when none exists.
5. Survivorship bias: only the winners are counted. *How:* Look for failed companies and abandoned projects in the Players database and the counter-trends.
6. The trend is driven by a subsidy, a temporary condition or cheap money. *How:* Read the Drivers database for a driver that expires or depends on policy; raise it with its date.
7. Regional or demographic bias: the evidence comes from one place or group. *How:* Check the geography and segment of the Signals rows; raise a claim stated globally from one region.
8. Conflating adoption with intent: surveys of plans rather than behaviour. *How:* Separate "plans to" from "uses" in the Signals Type column; raise claims built on intent.
9. A strong counter-trend or substitute is growing faster. *How:* Compare the series in the Indicators database with the counter-trends in Counter-trends & skeptics.
10. The definition of the trend keeps changing, so the numbers cannot be compared. *How:* Compare how each source defines the trend; raise sources that count different things.
11. Forecast numbers differ widely between sources with no explanation. *How:* Compare the forecasts in Signals by year; raise a spread above about 3x and say what explains it.
12. Data are old or the series stopped being updated. *How:* Check the Date column of the key indicators; raise any not updated in the last year.

## Scoring rubric

| Dimension | Weight | 1 | 3 | 5 | Frame |
|---|---|---|---|---|---|
| Breadth of evidence | 20% | A few articles or one vendor survey. | Several independent data sources agree. | Many independent, hard-data sources across regions and sectors. | signals |
| Momentum | 20% | Flat or falling on the measured series. | Growing steadily. | Accelerating across several measures. | adoption |
| Real adoption | 20% | Talk and announcements, no users. | Early adopters and pilots. | Mainstream use, with revenue or behaviour to show for it. | adoption |
| Strength of drivers | 15% | Depends on one fragile driver (a subsidy, a fad). | Several drivers, some uncertain. | Multiple reinforcing structural drivers. | drivers |
| Durability (not hype) | 15% | Looks like a fad: spike-driven, no retention. | Likely to last, with open questions. | Structural and compounding over years. | counter |
| Size of impact | 10% | Niche, little effect on money or behaviour. | Meaningful for some sectors. | Large effect across sectors or society. | implications |

orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.

## Output

Memo: Trend report: {{trend}}. Every paragraph cites cards; every number cites its source, its date and who sponsored it; hard data, surveys of behaviour and surveys of intent are marked as such.

1. Summary & so what (at most 200 words): The trend in a sentence, how strong it is, what to do and the top risks of being wrong, in at most 200 words.
2. What the trend is: The definition, the scope and the headline numbers.
3. The evidence: The strongest signals by type, with the signals chart, hard data separated from buzz.
4. Drivers & forces: What drives the trend, how strongly, and which drivers are fragile.
5. Adoption & data: How far and how fast it has spread, with the main series and its source.
6. Early movers: Who is ahead, who failed and what to learn.
7. The case against: Counter-trends and skeptics, and the red-flag outcomes with the raised flags.
8. Scenarios: Each scenario with its conditions, probability and signals.
9. Scorecard: The rubric table: each dimension, its weight, its score and its evidence.
10. Implications & opportunities: Who gains and loses and the actions now, for each scenario.
11. Leading indicators & next steps: The indicators to watch with thresholds and the ranked open questions.

Appendix: All sources.

One-page summary: Definition, Headline chart, Score, Actions, Indicators to watch.

Deck format: `trend-report`.

## Follow-up chips

Shown after the first pass.

- Stress-test the headline number: Stress-test the headline figure for "{{trend}}": trace it to its origin, who sponsored it and what independent sources say.
- Add a region: Extend the evidence for "{{trend}}" to [region]: signals, adoption data and early movers, flagged where they differ.
- Write the exec brief: Write a one-page brief on "{{trend}}" for {{audience|leadership}}: the trend, the score, three actions and the indicators to watch.
- Build the scenario plan: Turn the scenarios into an action plan: for each scenario, what to do now, what to prepare and the trigger that tells us it is happening.
- Watch the indicators: Watch the leading indicators for "{{trend}}" and tell me when one crosses its threshold.
- Refresh with new data: I added new data. Update the Indicators database, re-score the rubric and say which conclusions moved.

## Signed-in sources

- Statista (statista.com): Market statistics and forecasts, with the underlying source.
- Gartner (gartner.com): Analyst forecasts, hype cycles and market guides.
- Crunchbase (crunchbase.com): Funding and company signals for the early movers.
- Similarweb (similarweb.com): Traffic and engagement series for products and sites.

## Monitor

Only when the user asks: `{{trend}} leading indicators, new data releases, forecasts and counter-evidence`. New data that would move the trend score or one of the scenarios.
