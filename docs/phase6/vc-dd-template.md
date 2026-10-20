# VC Due Diligence template: full spec (user: "make the template vvv detailed max")

The template engine (v2) has to support everything below. Today a template is only a list of frames; v2 is a full research playbook.

## Template engine v2: what a template can declare
- **inputs**: a typed intake form on Home, shown when the chip is picked. Each field has a required flag, a placeholder and validation.
- **frames**: title, colour, number, a **brief** (the questions this frame must answer), its **owner agents**, and a **target card mix** (e.g. ≥3 sources, ≥1 metric).
- **seed cards** placed at creation: question cards, checklists, empty databases with schemas, metric placeholders ("—" until filled), a hypothesis.
- **databases** with column schemas (types: text, number, currency, date, url, enum, person, rating, boolean) and the views to create.
- **agent plan**: an ordered research playbook per agent (Scout, Critic, Builder, Orb). It is injected into each agent's first assignment, not into the persona.
- **rubric**: scored dimensions with weights and anchors for 1/3/5. It is filled in by Orb with cited evidence, and the user can override any score.
- **red-flag checklist**: items Critic must explicitly clear or raise.
- **output**: the Port memo format (sections, order, required citations per section, length guidance) plus an optional one-page summary.
- **cost guard**: the expected Parallel/LLM spend tier (Quick / Standard / Deep). Orb asks before going over.
- **follow-ups**: suggested next prompts shown as chips after the first pass.
Templates live in packages/shared/src/templates/ (one file each) and are validated by a zod schema. A test instantiates every template on a fresh canvas and checks each frame, seed card and database exists and that the agent plan references only tools in the role's allow-list.

## Intake form (Home → "VC due diligence" chip)
- Company name (required)
- Website URL (required)
- Stage: Pre-seed / Seed / Series A / B / C+ / Growth
- Round being raised (amount, valuation if known, lead if known)
- Sector / category (free text with suggestions)
- Geography / HQ
- Your thesis or angle (why are you looking: free text)
- Specific concerns to probe (free text)
- Materials: drop zone for the pitch deck, data-room PDFs, financial model (CSV/XLSX), cap table (CSV/XLSX). Each becomes a card or database.
- Founder names + LinkedIn URLs (optional; Scout finds them if missing)
- Known competitors (optional)
- Depth: Quick scan (~15 min, low cost) / Standard (default) / Deep (Parallel deep research, asks before spend)
- Signed-in sources to use (checkboxes from Connected sites: Crunchbase, PitchBook, LinkedIn, DocSend, …)

## Frames (numbered, coloured, each with a brief, owners and target mix)

**01 SNAPSHOT** (signal; owner Orb)
Brief: what the company does in one sentence, the stage, the round, HQ, founded, headcount, total raised, last valuation, key investors, business model in one line.
Seed: Metric placeholders for Total raised, Last valuation, Headcount, Founded, Est. revenue / ARR, Growth rate. A "One-liner" doc card. A Person/Org card for the company.
Target: 6 metrics, 1 org card, 1 doc.

**02 FOUNDERS & TEAM** (sky; owners Scout, Critic)
Brief: each founder's background, prior companies and outcomes, domain expertise, founder–market fit, how long they've worked together, key hires, leadership gaps, board composition, advisor quality, attrition signals, open roles (hiring as a strategy signal).
Seed: database **Team** (name, role, background, prior companies, prior exits, tenure, linkedin url, source, flags). Questions: "What unfair advantage does this team have?", "Who is missing from the leadership team?"
Critic: litigation or controversies, unverifiable claims on bios, very short tenures, key departures.
Target: 1 person card per founder, the Team database, ≥3 sources.

**03 PROBLEM & PRODUCT** (rho; owners Scout, Builder)
Brief: the problem and who feels it, how painful or frequent it is, the current alternatives, the product and how it works, differentiation, tech depth or moat, roadmap signals, demo or screenshots, pricing and packaging.
Seed: Question "Is this a painkiller or a vitamin?". Comparison matrix placeholder (product vs alternatives).
Builder: a diagram of how the product works or the user flow; a design frame recreating the key screen from screenshots if useful.
Target: ≥2 screenshots (capture_page), 1 diagram, 1 matrix, ≥3 sources.

**04 MARKET** (sky; owners Scout, Builder)
Brief: TAM/SAM/SOM both top-down and bottom-up with the method stated, market growth (CAGR), why now (tech, regulatory, behavioural shifts), market structure (fragmented or consolidated), buyer persona and budget owner, sales cycle.
Seed: Metrics TAM, SAM, SOM, CAGR (each must cite). A "Why now" hypothesis card. Database **Market sizing inputs** (assumption, value, unit, source, confidence).
Builder: a chart of the market size build-up (bar) and a growth line chart.
Critic: challenge every TAM number; flag sizing done only top-down.
Target: 4 metrics, 2 charts, ≥4 sources incl. ≥1 independent report.

**05 TRACTION & METRICS** (rho; owners Scout, Orb, Critic)
Brief: revenue or ARR, growth (MoM/YoY), customers and logos, retention (gross and net), churn, cohort data if available, CAC, LTV, LTV/CAC, payback, gross margin, burn, runway, unit economics. Separate claimed numbers (deck) from verified ones (sources).
Seed: database **KPIs** (metric, value, period, claimed-or-verified, source, note). Metric cards: ARR, Growth, NRR, Gross margin, Burn, Runway. A Chart bound to KPIs (revenue over time). Question "Which numbers are verified independently?"
Inputs: a dropped financial model becomes the KPIs database; deck numbers are tagged "claimed".
Critic: gaps between claimed and verified numbers, vanity metrics, missing retention data.
Target: ≥6 metrics, 1 chart, KPIs database with a claimed/verified column filled.

**06 CUSTOMERS & SIGNALS** (sky; owners Scout)
Brief: named customers and case studies, reviews (G2, Capterra, App Store, Trustpilot), social sentiment, web traffic and app-download trends if available, hiring velocity, GitHub activity for dev tools, press and awards, partnerships.
Seed: database **Customers** (name, segment, size, since, source, quote). Timeline card for momentum events. Quote cards from reviews (positive AND negative).
Target: Customers database, ≥4 quotes (≥1 negative), 1 timeline.

**07 COMPETITION** (rho; owners Scout, Builder, Critic)
Brief: direct and indirect competitors, incumbents, substitutes, positioning, pricing, funding of each, differentiation claims vs reality, switching costs, who is winning and why.
Seed: database **Competitors** (name, url, category, HQ, founded, total funding, last round, headcount, pricing, key differentiator, threat level 1–5, source). This uses Parallel FindAll for discovery and Task Groups for enrichment. A Comparison matrix (weighted criteria). A 2×2 positioning quadrant.
Builder: a funding-by-competitor bar chart and the positioning 2×2.
Target: ≥8 competitors in the database, 1 matrix, 1 quadrant, 1 chart.

**08 BUSINESS MODEL & GTM** (sky; owners Scout, Orb)
Brief: revenue model, pricing, ACV, sales motion (PLG, sales-led, channel), channels, CAC sources, expansion levers, partnerships, international plans.
Seed: Pros/cons card for the GTM motion. Question "What has to be true for this GTM to scale 10x?"
Target: 1 pros/cons card, ≥3 sources.

**09 FINANCING & CAP TABLE** (rho; owners Scout, Orb)
Brief: funding history (rounds, dates, amounts, valuations, leads), investor quality, cap table structure if provided, dilution, option pool, the use of proceeds for this round, implied valuation multiples vs comparables.
Seed: database **Funding rounds** (round, date, amount, pre/post valuation, lead, participants, source). Timeline card of rounds. Database **Comparable valuations** (company, round, valuation, revenue multiple, date, source). Metric: implied multiple.
Target: 2 databases, 1 timeline, 1 metric.

**10 RISKS & RED FLAGS** (paper; owner Critic)
Brief: work through the red-flag checklist below. Raise each flag as a Risk card with evidence, or clear it with a source. Also covers key-person risk, concentration risk, regulatory and legal risk, technical risk and market timing.
Seed: Checklist card holding the red-flag checklist. Pre-seeded risk categories as empty Risk cards: Team, Market, Product, Competition, Financial, Legal/Regulatory.
Target: every checklist item either cleared (with a source) or raised.

**11 THESIS & DECISION** (signal; owners Orb, user)
Brief: the bull case, the bear case, key hypotheses with confidence, what must be true, scoring against the rubric, and a recommendation (Pass / Track / Take meeting / Invest) with conditions.
Seed: Hypothesis cards (3, from the user's thesis input). SWOT card. Decision card (options: Pass / Track / Take meeting / Proceed to term sheet; status open). Rubric scorecard (a Comparison-matrix variant). Insight cards must cite ≥2 cards.
Target: 1 SWOT, 1 decision, 3+ hypotheses with evidence links, filled rubric.

**12 OPEN QUESTIONS FOR FOUNDERS** (paper; owners Critic, Orb)
Brief: questions to ask in the next meeting, ranked by importance, each linked to the gap or risk that prompted it.
Seed: Checklist "Founder call questions". Every unresolved Question card on the board is collected here.
Target: ≥10 ranked questions, each linked to its source card.

## Red-flag checklist (Critic must clear or raise each one)
1. Founder background claims that can't be verified.
2. Past litigation, fraud allegations, or regulatory actions involving the company or founders.
3. Founder departures, or high leadership churn.
4. Revenue or customer claims with no independent corroboration.
5. Down rounds, flat rounds, bridge notes or long gaps between rounds.
6. Customer concentration (>30% revenue from one customer, if knowable).
7. Negative review patterns (security, reliability, support, billing).
8. Layoffs or hiring freezes (news, layoffs trackers, job-post drops).
9. Dependency on a single platform, API, supplier or regulation.
10. IP or ownership issues (open-source licence exposure, patents, trademark conflicts).
11. Unclear or circular unit economics.
12. A well-funded incumbent shipping the same feature.
13. Domain or web-traffic decline.
14. Security incidents or data breaches.
15. A cap table problem (heavy dilution, dead equity, unusual terms) if a cap table is provided.

## Scoring rubric (weights; anchors at 1 / 3 / 5)
- Team (25%): 1 = no relevant experience; 3 = relevant domain experience; 5 = repeat founders with an exit in the domain.
- Market (20%): 1 = small or shrinking; 3 = large but crowded; 5 = large, fast-growing, with a clear why-now.
- Product & moat (15%): 1 = commodity; 3 = clearly differentiated; 5 = defensible (data, network, or tech moat).
- Traction (20%): 1 = pre-product; 3 = early revenue with growth; 5 = strong growth with good retention, verified.
- Business model (10%): 1 = unclear; 3 = proven model with okay margins; 5 = great unit economics.
- Deal (10%): 1 = overpriced vs comps; 3 = market price; 5 = attractive price and terms.
Orb fills each score with ≥1 cited card; the user can override; the weighted total is shown on the Decision card.

## Agent playbook (each agent's first assignment)
- **Orb**: create the frames and seeds; read the uploaded materials first (deck → claimed numbers into KPIs tagged "claimed"); delegate; after Scout's first pass, fill Snapshot metrics; at the end, fill the rubric, SWOT, decision and memo; keep the founder questions current.
- **Scout**, in order:
  1. Company site, about/team/pricing/customers pages (capture_page screenshots of home and pricing).
  2. Founders (signed-in LinkedIn or Crunchbase if connected; otherwise public search).
  3. Funding history (Crunchbase or PitchBook if connected; press otherwise).
  4. Competitors via find_entities, enriched with batch_enrich into the Competitors database.
  5. Market reports and sizing.
  6. Reviews and customer signals.
  7. Hiring and news timeline.
  8. Deep research (Parallel Task "core" or above) for gaps; ask before spend over $0.50.
  Report progress per frame.
- **Critic**: start after Scout's first sources; work through the red-flag checklist; challenge every metric that has a single source; turn every gap into a Question card in 12.
- **Builder**: market-size and funding charts, the competitor matrix and 2×2, the product/how-it-works diagram, the traction chart from KPIs, and an optional one-page visual summary (design frame).

## Output: investment memo (Port)
Sections, in this order. Every paragraph cites cards; every number cites its source; claimed vs verified is marked.
1. Summary & recommendation (≤150 words, decision, score, top 3 reasons, top 3 risks)
2. Company snapshot (table)
3. Team
4. Problem & product
5. Market (with chart)
6. Traction & metrics (KPI table, claimed vs verified)
7. Customers & signals
8. Competition (matrix + 2×2)
9. Business model & GTM
10. Financing & valuation (rounds table, comps)
11. Risks & mitigants (red-flag outcomes)
12. Investment thesis: bull vs bear, key hypotheses
13. Scorecard (rubric table)
14. Open questions / next steps (founder call questions)
Appendix: all sources.
Also a **one-page summary** export (snapshot, score, recommendation, top risks).

## Depth tiers
- Quick scan: no deep research; search, extract and signed-in fetches only; ≤12 cards per frame; memo summary only.
- Standard: plus batch enrichment of competitors and 1–2 deep-research runs (core), asking before spend.
- Deep: plus pro or ultra deep research on market and competitors, FindAll for full competitor discovery, and a full memo.

## Follow-up chips after the first pass
"Go deeper on competitor X", "Build the bear case", "Draft the founder call agenda", "Compare to [portfolio company]", "Update with the new deck", "Re-score after the call notes".
