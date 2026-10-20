# Templates

Every Home template chip is a template. P6.11 added the v2 engine; the VC due-diligence template is the first one on it and sets the depth bar for P6.12 to P6.16. P6.12 added the investing and finance group and merged the v1 "stocks" template into Public equity. P6.13 added the startup / product group (competitive-analysis, customer-discovery, ui = product teardown, pricing-research, gtm, feature-prd, fundraising-prep, company); `company`, `gtm` and `ui` keep their v1 ids. The only v1 template still to be upgraded (topic) is a list of frames and a brief.

## Investing and finance (P6.12)

| Template | Id | Subject field | What it is for | Spec |
|---|---|---|---|---|
| VC due diligence | `vc-dd` | `company` | A venture investment decision | [vc-dd.md](vc-dd.md) |
| Public equity | `public-equity` | `company` | A listed company: filings, earnings quality, scenario valuation, peers, catalysts (replaces the v1 Stocks chip) | [public-equity.md](public-equity.md) |
| Market map | `market-map` | `market` | The landscape of a category: taxonomy, companies, funding flows, investors and acquirers, white space | [market-map.md](market-map.md) |
| Portfolio monitoring | `portfolio-monitor` | `company` | An ongoing check on a company you back: KPIs against plan, thesis check, signals, runway, status call and actions. Run it again each period; Parallel monitors on request | [portfolio-monitor.md](portfolio-monitor.md) |
| M&A screening | `ma-screen` | `acquirer` | A mandate to a ranked target shortlist: universe, screen, valuation against precedent deals, synergies, feasibility | [ma-screen.md](ma-screen.md) |
| Fund / LP diligence | `fund-dd` | `fund` | An LP diligencing a manager: team, strategy, track record (reported against verified), portfolio, terms, references | [fund-dd.md](fund-dd.md) |

- **Shared building blocks:** `packages/shared/src/templates/finance-kit.ts` (seed constructors, column and view helpers, the three depth tiers). Each template's own file keeps everything that makes it different.
- **Deck formats:** `packages/shared/src/deckFinance.ts` (`equity-ic`, `market-map`, `portfolio-review`, `ma-screen`, `lp-ic`), chosen by `deckFormatFor(templateId)`.
- **Merged v1 templates:** `TEMPLATE_ALIASES` (`stocks` becomes `public-equity` for a new canvas; an existing "stocks" canvas still opens, with its label and brief, through `templateOf`). A merged template has no Home chip.
- **The pattern all five share:** Parallel `find_entities` discovers a list (peers, companies, targets, peer funds), `batch_enrich` fills its columns, and the playbook then consolidates the run databases into the template's own database with `query_dataset` and `upsert_rows`, so there is one table. `deep_research` (core or above, asking above $0.50) closes gaps; monitors are offered only on request and confirmed. Signed-in sources (Settings > Connected sites) are used only when the user ticked them.
- **Reported against verified:** a number the company or manager gave is stored with Basis "Reported" (or "Claimed"); a second source adds a new row with Basis "Verified" (a row an agent wrote can only be changed by that agent).
- **User text in seeds:** an intake answer filled into a checklist item is cut to the 300 characters an item holds (`templateSeed.ts`).

- **Code:** `packages/shared/src/templates/<id>.ts`, validated by the zod schema in `schema.ts` (`TemplateSpecV2`). Register it in `index.ts` (`TEMPLATE_SPECS`) and add its id to `TemplateId`.
- **Human-readable spec:** `docs/templates/<id>.md`, generated from the code: `pnpm templates:docs`. A test fails when it is stale.
- **What a v2 template declares:** an intake form (`inputs`), numbered frames with a brief, owner agents, a target card mix and seed cards, databases with typed columns and views, a playbook per agent (ordered steps, each naming the tools it uses and the lowest depth tier that runs it), a rubric, a red-flag checklist, the memo and one-page outputs and the deck format, three depth tiers (the cost guard) and follow-up chips.
- **Where each part goes at run time:**
  - the intake and depth tier are kept in `canvas.json` (`intake`, `depth`) by `orb/canvas.create`, which validates the intake against `inputs`;
  - frames, databases and seed cards are written by `packages/orb-canvas/src/templateSeed.ts` as one user-authored batch (outside the undo stack; a seed card has `seed: true`, so agents' layout may still move it);
  - the playbook is injected into each agent's FIRST assignment (`assignmentMessage`) and into orb's new-canvas turn (`newCanvasMessage`), never into a persona (`packages/shared/src/templates/playbook.ts`);
  - the depth tier is enforced by the Parallel tools (`tierGate`): a costly tool the tier does not allow is refused before anything is placed or spent;
  - the follow-up chips appear in the conversation panel once every agent is idle and the agents placed at least 8 cards.
- **Rules a template must keep (tests enforce them):** every tool a playbook step names is in that role's allow-list; every frame target and seed type can be placed by an owner of the frame; every seed is valid data of its card type once its `{{field}}` tokens are filled; rubric weights add up to 100.
- **Agent limits to design around:** a Critic can place only question, risk, matrix, insight, hypothesis, framework, math and checklist cards, cannot change a database, and cannot tick a checklist; Scout and Builder change only the database rows they wrote; the Parallel tools (`find_entities`, `batch_enrich`) fill a database card of their own, so a playbook consolidates them into the template's database with `query_dataset` and `upsert_rows`.
- **Helpers:** `packages/shared/src/templates/kit.ts` has the seed builders (`metric`, `question`, `checklist`, `db`, `chart`, `timeline`, `matrix`, `framework`, `hypothesis`, `emptyRisk`), `step`, `redFlags`, the three-tier `tiers()` and the shared intake fields (`depthField`, `sitesField`, `materialsField`) the P6.13 templates use.
- **Deck outline:** `output.deck` (optional) lists the slides of the template's deck; Orb's playbook shows it and `compose_slides` follows it.
- **Materials land in the first frame:** files dropped on the intake go into the free room (`room`) at the bottom of the FIRST frame, so give it room when the inputs are files, and say in the playbook where agents will find them.
- **Tests for a group:** the generic fresh-canvas test is `packages/orb-canvas/test/templates.test.ts` (covers every spec in `TEMPLATE_SPECS`); a group adds a structural test like `packages/shared/test/templates-startup.test.ts` and a scripted mock-LLM contract test like `apps/ui/test/templates-startup.contract.test.ts`.

## Business group (P6.14)

`sales-account` (pre-call brief), `partnership` (partnership evaluation), `vendor-selection` (vendor / tool selection) and `market-entry` (a new country). Each is at the VC depth bar and shares the builders in `packages/shared/src/templates/kit-business.ts` (seed helpers, the three depth tiers, the standard intake fields). Their decks are named by `output.deckFormat` and defined in `templates/decks-business.ts` (`sales-brief`, `partnership-review`, `vendor-selection`, `market-entry`); `deckFormatFor(templateId)` maps a template id to its format through `DeckFormat.templates`. Tests: `packages/shared/test/business.test.ts` (every template against the bar), `packages/orb-canvas/test/templates.test.ts` (fresh canvas, sample intakes in `packages/shared/test/businessIntakes.ts`), `apps/ui/test/business.contract.test.ts` (the group run scripted per agent on a real sidecar) and `apps/ui/test/business.unit.test.ts` (the intake forms).

## Research and knowledge templates (P6.15)

`deep-dive` (the researched upgrade of the v1 Topic chip), `literature-review`, `policy-analysis`, `tech-landscape` and `trend-report`. Their shared builders (seed cards, the three tiers, the common intake fields) are in `packages/shared/src/templates/kit-research.ts`; their deck formats are in `packages/shared/src/deckFormats.research.ts`. The contract test `apps/ui/test/templates.research.contract.test.ts` runs the group scripted per agent.

## People and personal templates (P6.16)

`candidate` (candidate research), `event-prep`, `personal-decision` (a home, car, school or other big choice), `trip-planning` and `investigation` (journalism). Shared builders for seeds, tiers and flags are in `packages/shared/src/templates/people-kit.ts`. Rules they add to the ones above:

- **Privacy first.** Candidate research uses public professional information only (a standing "Scope and privacy" doc, a red flag for sensitive attributes, a Critic privacy sweep, no monitor); event prep keeps roles and organisations only in its People database; an investigation never enters confidential sources and never contacts anyone.
- **Agents propose, the user acts.** No agent sends a message, books, pays, publishes or contacts anyone; drafts are doc cards or database rows (`Draft`). Agents cannot delete cards, so a privacy finding is handed to the user.
- **The user decides.** Each ends in an open Decision card whose rationale carries orb's weighted rubric total; orb is not a financial, legal or medical adviser and says so where it matters.
- Tests: `packages/shared/test/templates.people.test.ts` (the depth bar per template), the generic instantiation in `packages/orb-canvas/test/templates.test.ts`, and `apps/ui/test/templates.people.contract.test.ts` (a scripted mock-LLM run per template on a real sidecar, plus the Quick-tier cost guard).
