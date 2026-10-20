# Phase 6: Polish (user-approved 2026-10-15)

Phase 6 is not in BUILD_PLAN.md. The user added it after Gate 5. This file is the source of truth for its scope.
Specs: `parallel-api-spec.md` (Parallel AI API, from the docs and SDK 1.3.5) and `vc-dd-template.md` (template engine v2 + the VC due-diligence template, which sets the depth bar for every template).

## User decisions
- GPT Luna 6 (`openai/gpt-6-luna`) for every agent. Parallel is wired as Orb tools calling `api.parallel.ai` directly: no MCP, no CLI, key `PARALLEL_API_KEY` in the Keychain. No Parallel key yet, so verify against a mock and show "key needed" in Settings.
- Card types grow from 11 to 28, plus a Database card and datasets that can be attached to any card.
- Agents explore the board progressively (map → search → read). They never get the whole board dumped into context.
- 26 templates at full depth (VC + 25), using Parallel capabilities where they fit.
- Presentations: a Deck mode with .pptx and PDF export.
- Signed-in browsing (read-only, only on sites the user connected).
- Signing and notarisation stay deferred; rebuild the unsigned arm64 dmg at the end.

## Tasks (in order; one commit per task `P6.<n>: …`)
- **P6.1 Composer attachments.**
  - Paperclip, paste, or drop on the chat panel.
  - The file is ingested through the existing path into a card in view (in the current frame, or near it).
  - The message is sent with that card as context. The chip in the message flies to the card.
- **P6.1b Brand: Constellation identity** (user request 2026-10-15, run right after P6.1).
  - Reference: `design/identity/constellation/Constellation.dc.html`. It is a mockup; replicate its values, don't copy its runtime. Its Google Fonts link is not to be used; Geist is already bundled.
  - The name is always lowercase **orb**: wordmark, window title, menus, About, dock name, dmg name and volume title, Info.plist display name, page titles, UI copy and printed/exported footers.
  - Internal identifiers stay as they are: the bundle id, the Keychain service `ai.orb.app`, and package names.
  - Use the primary hex Constellation mark everywhere the old mark appears:
    - title pill, Home top-left, warming-up and boot page, first run, About, empty states;
    - print, PDF and deck footers.
  - Lockups: horizontal (mark + "orb" in Geist Bold) for headers and the app; stacked for the splash and covers.
  - Generate from the SVG:
    - app icon (.icns: Night background with a soft Signal glow, all sizes);
    - simplified favicon/tab mark (ring + bright point) below 24 px;
    - menu bar template image if one is used;
    - dmg background/volume icon.
  - Follow the rules: clear space, minimum sizes, Winsen Rho colours only.
  - Put the canonical SVGs in `apps/ui/src/brand/`, plus the build resources.
  - Update the pixel-diff and visual tests and baselines intentionally, and record why.
- **P6.2 Card platform.**
  - Registry scaling for about 28 types.
  - Interactive design frames: served by the sidecar as their own page, with their own CSP, bundled Chart.js and D3, scripts allowed, `connect-src 'none'` (no network).
  - The export fixture covers every type in both export modes.
  - Fix the startup Keychain-wait risk from P5.gate: lazy Keychain load or a timeout, plus a hint on the warming-up Home.
- **P6.3 Database card and attachable data.**
  - Per-canvas datasets in `assets/data/`, written only through orb-canvas. board.jsonl holds the card events that reference them.
  - Import CSV, JSON, XLSX, or pasted data.
  - Views: table, board, gallery; each with filter, sort, group.
  - Promote a Table card to a database.
  - Any card can attach a dataset view.
  - `query_dataset` agent tool: a structured filter/group/aggregate/sort/limit query, at most 50 rows, never raw SQL (no code execution).
  - Agent writes go through `upsert_rows`, role-gated.
- **P6.4 Data cards.**
  - Chart: Vega-Lite rendered to SVG in the renderer, exact-pinned and bundled; bar, line, area, scatter, pie; data inline or bound to a Table or Database, live.
  - Metric: value, change, unit, period, source.
  - Timeline: dated events, each with a source.
  - Comparison matrix: weighted criteria, scores, highlighted winner.
- **P6.5 Synthesis cards.**
  - Insight: must cite ≥2 cards.
  - Hypothesis: confidence, plus for and against links.
  - Decision: options, choice, rationale, status.
  - Pros/cons, SWOT, and 2×2 quadrant variants.
- **P6.6 Entity and media cards.**
  - Person/Org and Product/Competitor.
  - Video/social post: thumbnail, opens externally, never embedded.
  - Code (syntax highlighting), Math (KaTeX bundled), and Checklist (agents propose, the user ticks).
- **P6.7 Parallel AI.** Every tool in parallel-api-spec.md:
  - `web_search` provider, `parallel_extract`, `image_search`, `web_answer`;
  - `deep_research` (SSE progress, detach-on-abort, `research_status`);
  - `batch_enrich` into a Database, `find_entities` (real cancel), `entity_search`;
  - monitors (`watch_topic`, `watch_events`, `stop_watch`: Orb only, started by the user);
  - optional memory and task-suggest.

  Also:
  - Research run card (live progress, then the cited result) and Watch card.
  - Settings provider card.
  - Cost guard: ask before spend over $0.50.
  - Egress allow-list and audit cover `api.parallel.ai` (mock site through the proxy).
- **P6.8 Agents at scale.**
  - Progressive-disclosure tools:
    - `board_map`: frames, counts, titles/ids, frame digests; token-capped;
    - `search_board`: FTS over index.sqlite, with snippets;
    - `read_card(cardId, page?)`: ≤8k per page;
    - `query_dataset`.
  - `query_board` is paginated and budgeted. Hard per-result token budgets with "more available" hints.
  - `chat.send` injects only selected, mentioned, or in-context cards.
  - Personas, allow-lists and "when to use which card" rules for all types.
  - `describe()` and print for every type.
  - Test: a 300-card board with datasets; mock-LLM request-size assertions stay under budget.
  - **Agent layout tools** (user request 2026-10-15). These are semantic, never pixel coordinates:
    - `move_card(cardId, frameId)`: re-file a card into another frame; the layout engine picks the cell.
    - `arrange_frame(frameId, by: importance|date|type|source|cluster)`: re-sort or cluster a frame's cards.
    - `reorder_frames(order)`: put frames in a reading order (Orb only).
    - `tidy_board`: close gaps and fix overlaps (Orb only).

    Rules:
    - User-created or user-moved cards and notes are pinned; agents never move them.
    - Each agent rearrangement is one undoable group in the user's undo stack, and shows in the activity panel.
    - Moves animate.
    - Role gates per allow-list: Scout, Critic and Builder may move or arrange only their own cards.
    - Fuzz test: user cards never move, and there are no overlaps after `tidy_board`.
  - **Caching** (user request 2026-10-15):
    1. Use long prompt-cache retention for agent sessions (pi-ai `cacheRetention: 'long'` / `PI_CACHE_RETENTION=long`; verify which one the harness honours and record it).
    2. A stable prompt prefix: personas and tool lists must not change per turn. Board context from `chat.send` and `inject` goes at the end of messages, never into system or persona text. Add a test that the prefix is byte-identical across turns on the mock.
    3. Per-canvas result cache for Parallel calls (search, extract, `web_answer`, `deep_research`, `find_entities`; keyed on normalised input + processor), stored in `assets/` via orb-canvas, with a `refresh` flag. Repeat calls cost $0 and say so.
    4. The cost meter shows the cache hit rate (cached input ÷ total input) per canvas and per agent.
- **P6.9 Gate open items.**
  - Agent card text clipping: design call; pick taller slots or line clamps that match the prototype.
  - Thread-link label and cursor-label overlaps.
  - Frame renumber on delete (use canvas.json frame order); frame drawn over cards adopts them.
  - Search result flies to the card.
  - Asset GC for undone drops.
  - Persist pause state and key-test status.
  - e2e windows off-screen (the flake from P4.gate).
  - Package versions (Home shows "orb-host 0.0.0").
  - minimumSystemVersion 14.0 per the PRD.
- **P6.10 Signed-in browsing.**
  - Settings › Connected sites: a visible login window on the isolated persistent partition `persist:orb-sites`.
  - `fetch_signed_in(url)`:
    - read-only GET render: no clicks, no forms;
    - connected domains only;
    - optional per-fetch approval;
    - rate-limited;
    - cookies and passwords never reach the agent or model;
    - every fetch shown in the activity panel.
  - A ToS warning for sites like LinkedIn.
  - Egress allow-list = connected domains while connected; the audit covers it.
- **P6.11 Template engine v2 + VC due diligence:** exactly as specified in vc-dd-template.md.
  - Intake form, briefs, seeds, databases, agent playbook, rubric, red flags, outputs, depth tiers, follow-ups.
  - A test instantiates every template.
- **P6.12 Templates: investing/finance.** Public equity deep dive, market map, portfolio monitoring, M&A target screening, fund/LP diligence.
- **P6.13 Templates: startup/product.** Competitive analysis, customer discovery, product teardown, pricing research, GTM plan, feature PRD research, fundraising prep.
- **P6.14 Templates: business.** Sales account research, partnership evaluation, vendor/tool selection, market entry.
- **P6.15 Templates: research/knowledge.** Literature review, policy/regulation analysis, technology landscape, trend report.
- **P6.16 Templates: people/personal.** Candidate research, event/conference prep, big personal decision, trip planning, journalism/investigation.

  Every template in P6.12–P6.16 is at the VC depth bar. It has a spec in `docs/templates/<id>.md`, uses Parallel where it fits (FindAll lists, Task Group enrichment, deep research, monitors for ongoing ones), uses the new cards and databases, and has memo and deck formats. Upgrade or merge the 5 v1 templates (topic, company, gtm, ui, stocks).
- **P6.17 Presentations.**
  - Port Deck mode: `compose_slides`, with each slide citing cards.
  - In-app slide view: reorder, edit, regenerate a slide via chat.
  - Export .pptx with pptxgenjs (exact-pinned): native editable charts, tables, images, design-frame snapshots; citations in speaker notes; a Sources slide.
  - Export PDF slides via printToPDF.
  - Templates define the deck format (VC: an IC deck of about 12 slides).
- **P6.18 Visual review.** Capture every screen and every card type in night and day and compare with design/screens. Fix mismatches and commit the screenshots.
- **P6.19 Final.**
  - A live gpt-6-luna end-to-end run (VC template on a real public company, small depth).
  - Rebuild the unsigned arm64 dmg and verify it launches.
  - Update ACCEPTANCE.md with the new features.
- **P6.26 Theme discoverability (user update, 2026-10-18).**
  - Home and the board offer labelled Light mode / Dark mode actions, rather than an unexplained board icon.
  - Appearance is the first Settings section, visible at the minimum supported window size; remove stale night-only guidance.
  - Check direct switching, persistence, keyboard access and header spacing before packaging. This usability task does not rebuild the DMG.

## Gate 6
User scope update **P6.27 (2026-10-18)**: carry Symplist's Studio, Paper, Pebble, Postcard, Meadow and Tide styles to orb. Style, eight preset/custom accents and Light/Dark/System brightness are independent and persist. Port typography/geometry as well as colours. Remove decorative gradients, blue glows and starfields. Update startup, board/readers, Settings, diagrams/charts and output palettes, with migration and system-change coverage. This supersedes the original fixed Winsen Rho night/day visual direction; keep the research interactions and architecture.

1. All 28 card types plus the Database render on the canvas, print in both export modes, and export to .pptx.
2. Every Parallel tool is mock-verified, abortable, and cost-guarded. The egress audit is green with Parallel and signed-in sites.
3. Agents stay under the context budget on the 300-card test board.
4. All 26 templates instantiate and run end to end with the mock. VC also runs once live.
5. Attachments, signed-in browsing and presentations pass e2e.
6. The dmg is rebuilt and launches.
7. Build, test, e2e and the egress audit are green.

## Decisions
- **P6.3 (2026-10-15)**: a dataset's rows stay out of `board.jsonl`; the card keeps a preview. XLSX is parsed by `read-excel-file` 9.3.12 (exact-pinned, actively maintained, `npm audit` clean, the SheetJS `xlsx` package on npm is unmaintained with open advisories), in orb-canvas, so the renderer ships no parser. Dataset edits are not on the undo stack; view changes, attach/detach and Table to Database are.
- **P6.4 (2026-10-15)**: a Chart card holds a small spec (mark, x, y, colour, aggregate) and a source, never Vega-Lite; the renderer builds the Vega-Lite spec (vega 6.4.0, vega-lite 6.4.3, vega-interpreter 2.3.2 for the no-`unsafe-eval` CSP). Bound charts keep their plotted points in card data, refreshed by orb-canvas. Metric, Timeline and Matrix are agent-made and read-only for the user in P6.4; native .pptx charts and tables are P6.17.
- **P6.5 (2026-10-15)**: "Pros/cons, SWOT and 2×2 quadrant variants" is one `framework` card type with a `variant`, so the 28-type count grows by four here (insight, hypothesis, decision, framework). A hypothesis's for/against is the card ids it names plus the `supports` / `contradicts` links drawn into it, read live by the UI (not copied into card data). Only Orb has `update_card`, so confidence is revised by Orb; the Critic and Builder place new cards.
- **P6.6 (2026-10-15)**: six card types, not seven: Person/Org is `entity` and Product/Competitor is `product`, each with a `kind` field (one renderer and one set of fields per pair). highlight.js 11.12.0 (core + 20 languages) and KaTeX 0.18.9 are exact-pinned UI dependencies (0.19.0 was under two weeks old). An agent can never tick a checklist item: the shared planner refuses it for every actor that is an agent.
- **P6.7 (2026-10-15)**: Parallel is two cards, not one. The Research run card (`research`: Task, Task Group and FindAll runs) and the Watch card (`watch`) are card types written only by the orb-canvas Parallel service (no agent fields, no role may `place_card` them); they count toward the registry but not toward the 28. The cost guard is the card itself: a run over $0.50, and the always-ask kinds (ultra and above, FindAll core/pro, groups over 50 rows, every monitor, an extension over the threshold), is placed `awaiting_approval`, the tool waits, and Approve or Decline arrives as `orb/parallel.confirm` from the card or the conversation panel. Bulk results (`batch_enrich`, `find_entities`, `entity_search`) go into Database cards, not one source card per row; `deep_research` places at most 12 source cards. Webhooks, the hosted MCP servers and the Chat API are not used.
- **P6.10 (2026-10-15)**: "every fetch shown in the activity panel" is Settings › Connected sites › Recent fetches (who, outcome, origin and path), kept by Electron main, not a board activity line: the board's "On the board" list is derived from cards, frames and links, and a read adds none. The fetch window may reach only the connected domain (no third-party assets), so screenshots of signed-in pages can lack third-party images and fonts. `fetch_signed_in` is Scout-only; its text is cached under the page URL so `read_source` on a source card with that URL reads it.
- **P6.8 (2026-10-15)**: the stated budgets (characters, about 4 per token) are: one board read (`board_map`, `search_board`, `query_board`, `query_dataset`) 16,000; a `read_card` page 8,000; `chat.send` context 16,000; any board tool result 24,000 as a last cut. The fixed prompt prefix (persona + tool definitions) is about 58k characters for Orb and is the part the prompt cache serves; what a request carries beyond it stays under 48,000 at the deepest point of the map, search, read ladder on the 300-card test board (`apps/ui/test/scale.contract.test.ts`). A user's drag pins an agent card (`Card.userMoved`); "user-moved" is therefore recorded in the board fold, not guessed. `reorder_frames` reuses `frame.added {index}` (no new event); the one new event type is `board.arranged`, the activity record of an agent rearrangement. Long prompt-cache retention is the route profile's `cacheRetention: long` (verified, `docs/HARNESS_NOTES.md` > P6.8); custom providers keep the default.
- **P6.17 (2026-10-15)**: a deck is the research document's sibling, not a mode of it: its own tool (`compose_slides`, many slides per call, in the `@orb/canvas/port` row), its own folder (`deck/`), its own wire methods (`deck.*`) and print route (`/print/deck`). The .pptx is built in the canvas service (pptxgenjs 4.0.1, exact-pinned, local, images as data); a Chart card's plotted points become a native chart and Table / Database / Matrix cards native tables. Sources slides are generated, never written by the model. A template names its deck format; `vc`-prefixed templates get the 12-slide investment-committee deck.
- **P6.11 (2026-10-15)**: the v2 template engine is `packages/shared/src/templates/` (schema, playbook text, one file per template); frames get their size from their seeds (`packages/orb-canvas/src/templatePlan.ts`, the layout engine's own grid), so a v2 frame is four grid columns wide. Seed cards are the user's by provenance but carry `Card.seed`, which keeps them out of `isPinned` and out of the frames an agent's placement may not push (a user card normally locks its frame); a drag pins one again. The intake form is a dialog on Home; materials dropped on it are added to the board BEFORE orb starts (`orb/canvas.start`, new; `canvas.create {start:false}` first), so the playbook's first step can read them. The depth tier is the cost guard: `tierGate` refuses the costly Parallel tools (deep_research, find_entities, find_entities_extend, batch_enrich) a tier does not allow, and deep_research processors outside the tier's list, before a card is placed or a dollar spent; the $0.50 ask is the existing card guard. The Parallel run tools still fill their own Database card (they cannot write into an existing dataset), so the VC playbook has Scout consolidate into the template's Competitors database with `upsert_rows`. Roles are respected in playbooks: the Critic clears a red flag with an Insight that cites at least two cards (it cannot place a doc) and raises one with a Risk card; only the user ticks the checklist; an agent edits only the database rows it wrote, so a claimed KPI is verified by a new row with Basis "Verified". The Scorecard seed is a Comparison matrix with the rubric's weights (scores are the 1 to 5 rubric score doubled, so 10 is a 5) and orb writes the weighted total into the Decision card's rationale.
- **P6.12 (2026-10-15)**: the v1 `stocks` template is merged into `public-equity`: it has no Home chip, a new canvas asked for `stocks` gets `public-equity` (`TEMPLATE_ALIASES`), and an existing `stocks` canvas keeps opening with its label and brief. The first intake field of every v2 template is its subject and is required (`company`, `market`, `acquirer`, `fund`), and a scripted caller that gives only a prompt gets it as the subject. Each investing/finance template names its own deck format (`equity-ic`, `market-map`, `portfolio-review`, `ma-screen`, `lp-ic`) in `deckFinance.ts`. Portfolio monitoring is the "ongoing" template: its databases keep the history and the playbook offers `watch_topic` monitors (confirmed per watch, Standard tier and above).
- **P6.13 (2026-10-15)**: "upgrade/merge v1 gtm, ui and company" keeps the three ids (saved canvases name them): `gtm` becomes the GTM plan, `ui` the product teardown (UI research merged into it) and `company` the company research, all v2 specs; they left `legacy.ts`, so Home lists the v1 Topic and Stocks first, then every v2 spec in `TEMPLATE_SPECS` order. Competitive analysis, customer discovery, pricing research, feature PRD and fundraising prep are new ids. A template may now declare its deck outline (`output.deck`, optional); every startup template uses the standard deck format id. Materials dropped on the intake land in the first frame's free room (P6.11 Home seed code), so a template whose inputs are dropped files (transcripts, screens) gives its first frame the room and tells agents where the files are.
- **P6.15 (2026-10-15)**: the v1 `topic` chip stays as the one-click, no-form start (many tests and e2e specs depend on that), and the researched upgrade is a new v2 template `deep-dive` ("Deep dive"), so the research group is deep-dive, literature-review, policy-analysis, tech-landscape and trend-report. Each names its deck format in `output.deckFormat`; the five formats live in `packages/shared/src/deckFormats.research.ts`.

## Status (2026-10-16)
- P6.1–P6.19 are done and merged into main. The Gate 6 audit was skipped by user decision; the user is testing the dmg first.
- **P6.20 Board layout quality** is deferred until after the user's test. The issues are listed in the PROGRESS row `P6.status`: frames are narrow and grow only downward; card heights are fixed; mixed widths leave gaps and cards overflow; links cross cards; cards land under panels; the view doesn't fit the board on open.

P6.27 completed on 2026-10-18. Appearance is the first Settings section; style, accent and brightness save automatically and survive restart. Final validation and the tested/installed DMG evidence are recorded in PROGRESS and ACCEPTANCE.

P6.28 (user fix, 2026-10-18): render Markdown in the conversation and scoped threads, during streaming and from saved history. Support ordinary Markdown and GFM tables/tasks with themed, bounded layouts, keyboard scrolling, safe links, inert HTML and no automatic remote image requests. Keep stored messages and editing text unchanged; verify streaming, restart, light/dark and first-token latency in Electron.

P6.28 completed on 2026-10-18. Source and rebuilt DMG checks pass, including packaged Markdown rendering. The user chose to keep the installed app open and receive the tested DMG for manual installation; validation and installation state are recorded in PROGRESS and ACCEPTANCE.

P6.29 (user update, 2026-10-18): make every card open as a full-screen reader. Tables and databases must have readable widths, wrapped multiline cells, horizontal scrolling and a row rail with complete values and view-aware navigation. Preserve editing, Escape/focus behaviour, diagram zoom, appearance and the board camera.

P6.30 (user update, 2026-10-18): revamp research-document generation into a detailed, evidence-backed professional report suitable for sharing as an attachment. Improve the writing brief, source inspection, report completeness and the reading/PDF presentation, including front matter, contents, numbered sections, methods, limitations, references and appendices. Existing evidence cannot be promoted into unverified filing or audit claims.

P6.29 and P6.30 completed on 2026-10-18. Professional reports have an explicit saved report/custom format, a topic-complete writing plan, per-job full-card evidence receipts, bounded repair, draft review points, context checkpoints and professional reading/PDF layouts. Source, desktop, live-report and rebuilt-DMG evidence is recorded in PROGRESS and ACCEPTANCE. The combined DMG includes Markdown, full-screen readers and report generation. The user chose manual installation after quitting the open installed app.

P6.31 (user update, 2026-10-19): replace the corner chat with a full-height collapsible right rail that reserves board space. Move Must read/Skim into its dropdown, support local evidence lookup and pinning, and make the agent search/read the canvas and clarify ambiguous references. Preserve drafts, chat controls, attachments, Markdown, full-screen readers, board camera/input and both appearance modes. Validate layout and keyboard access at 960×600 and ordinary desktop sizes, plus grounded chat tool execution through the real sidecar.

P6.32 (user update during P6.31, 2026-10-19): ordinary card clicks must visibly open the full-screen reader in the installed app. Provide an explicit way to select without opening, keep drag/modifier selection and card controls usable, and test ordinary clicks in the packaged DMG. Ship the combined rail and click fixes together.

P6.33 (user update, 2026-10-19): provider model lists must refresh from each configured provider instead of staying on the installed catalog. Register newly discovered models for real requests, retain offline lists and saved choices through restart, support refresh/search in Settings, and verify authenticated discovery and actual use of uncatalogued model IDs without new network destinations or key exposure. Rebuild and deliver the tested installer.

P6.34 (user update, 2026-10-19): add official ChatGPT plan usage to Orb, initially ChatGPT only. Provide browser sign-in, protected account registrations, refresh/revocation, account-specific model choices, explicit per-agent selection, connection verification and Manage usage. Preserve the research harness/tool allow-lists, full history and account boundaries; enforce plan Responses compatibility and stop on quota without changing billing paths. Build, verify and deliver the installer. The account owner completes real consent and live plan acceptance.

P6.35 (user failure report, 2026-10-19): repair provider changes on existing root/child sessions and context summaries. Snapshot the current per-agent choice for prompt assembly and requests, keep native compaction/history persistence while choosing that same billing route, add safe actionable agent failure details to local logs, coordinator context and the agent menu, and allow bounded transient ChatGPT retries while keeping quota/auth/permission/request failures terminal. Regress existing/cold sessions and long-history summaries across model changes.

P6.36 (user update, 2026-10-19): browser research through Orb's existing Chromium runtime. Scout can search without a search API key, render JavaScript-dependent public pages, then save readable sources and citations to the board through existing guarded tools. Keep public-address checks, isolated browser storage, cancellation, bounded reads and explicit blocked/CAPTCHA failures. Verify search → rendered source → board citation → report reuse.

P6.37 (user output report, 2026-10-19): replace the conversation rail's raw completion-check dump with compact research progress. Keep detailed repair instructions available to the agents, preserve honest section counts, explain template placeholders, and show short user-facing gaps with frame navigation. Keep progress outside message history, collapsed by default and bounded when expanded. Verify the twelve-section template, chat access and minimum-window layout in both modes; rebuild and deliver the corrected installer.

P6.38 (user MacBook audit and fixes, 2026-10-19): inspect the actual saved boards over authorized SSH without editing them. Fix comparison-matrix first-column sizing/wrapping/scrolling and score-scale clarity, render readable card evidence references, and constrain expanded prose width. Preserve rubric anchors, separate evidence confidence from subject performance, and allow explained unassessed scores on existing-board follow-ups. Make threads accessible from expanded readers, responsive during research, separately routed under queued messages and visibly queued/failed/retryable. Repair any deployment seam exposed by the MacBook log. Verify real harness composition, active/queued thread execution, narrow-window layout, exports and the packaged installer; report actual content gaps and deliver the tested build.


P6.39 (open-source release preparation, 2026-10-19): audit tracked release contents, archive obsolete development artifacts locally, add MIT attribution to Tejas Parthasarathi Sudarshan (tejassuds.com), preserve third-party notices, write public setup/product/privacy/contribution/release documentation, capture the real app using synthetic data, and build a responsive marketing site inspired by Symplist using orb's shared themes. Verify source hygiene, links, theme persistence, responsive behavior and builds/tests. Prepare reviewable local artifacts before external publication.

P6.39 complete: public documentation, MIT/package/installer attribution, source hygiene guard, 13 synthetic real-app screenshots and a static six-style marketing site are prepared locally. Build, all 2,609 tests, lint, source checks, four site browser cases, screenshot capture, deterministic egress and production-license staging pass. Existing history and native binary distribution require the documented review before public release; no visibility change or public upload was performed.

P6.40 (marketing copy, 2026-10-19): lead with an interactive canvas for sources, notes and ideas; shorten the hero and align search/social descriptions. Keep signing and DMG engineering details off the marketing page while the Mac download is forthcoming. Verify responsive rendering and existing site checks.

P6.40 complete: concise canvas-first hero and matching metadata are live in the local preview. Marketing signing details are replaced with Mac-download-coming-soon wording. Desktop/mobile review, site checks, build, all 2,609 tests, lint and source checks pass. No installer/signing work was performed.

P6.41 (product-focused site copy, 2026-10-19): rewrite the remaining marketing content around what orb helps people do and why they would use it. Use actionable documents and insights in the main promise, explain practical research scenarios, simplify provider and privacy wording while retaining accurate boundaries, and make the FAQ and calls to action visitor-focused. Verify responsive layouts, existing interactions and a clean committed repository.

P6.41 complete: the entire page now leads with product benefits, practical research uses and actionable documents and insights. Simplified AI/privacy/appearance explanations, refreshed calls to action and removed the visible inspiration credit. Build, all 2,609 tests (four workers), all four site cases, lint, source checks and desktop/mobile review pass.

P6.42 (stack reader, 2026-10-19): replace static stack title lists with actionable member entries. Open each member in its full reader, provide Previous/Next and return-to-stack navigation, preserve board state and read tracking, and verify long/nested stacks and keyboard behavior in the actual desktop UI.

P6.42 complete: every stack member is actionable, with full readers, bounded Previous/Next navigation and return to the immediate parent stack. Source summaries and excerpts remain visible. Fixed double-click fall-through discovered during regression checks. Build, all 2,611 tests, seven affected Electron checks, accessibility scans, lint, source checks and light/dark visual review pass, including ten-card lists, nesting, table contents, keyboard focus and read state after reopening.

P6.43 (website cookies and current installer, 2026-10-19): replace the marketing privacy section with an open-source message. Add the owner's configured PostHog project to the website with remembered Accept/Decline and footer cookie controls, keeping desktop analytics disabled. Verify consent, persistence, withdrawal and browser layouts, then package and check the latest DMG for Tailscale transfer.

P6.43 complete (2026-10-20): the site has an open-source section, PostHog cookie disclosure and remembered controls. Website page views start only after acceptance; no replay, automatic interaction capture, person profiles or error tracking. Query strings, anchors and referrer details are omitted. The public project configuration is local and ignored by Git. Eight site checks, build, all 2,611 tests, five DMG checks, two packaged stack checks, lint, source checks and the desktop egress audit pass. Packaged stack tests use isolated user-data and storage pointers because production builds ignore development-home environment overrides. The current DMG was delivered over Tailscale and its SHA-256 verified on the destination; the local site is open. Signing and public publication remain separate release work.

P6.44 (website support and security, 2026-10-20): add dedicated `/report-a-bug` and `/security` navigation. Require submitter email, title and description; accept useful optional reproduction/environment details and up to five evidence files / 10 MB. Send through a server-only Resend endpoint with fixed sender/recipient, Reply-To, common text-credential redaction, bounded requests, origin/rate checks and idempotent retries. Keep local credentials in Keychain, document hosted secret configuration, verify actual evidence delivery and preserve failed drafts. Run the full checks and push verified local changes to main as requested.

P6.44 complete: both routes and navigation are implemented with shared appearance, required reply email and useful issue/environment fields. Evidence goes through the same-origin Node endpoint to the fixed Resend sender/inbox; failures retain drafts and attachments, and retries preserve idempotency. Local sending credentials use a separate Keychain service and have a hidden-input rotation command. Hosted deployment uses a server-only secret; the client bundle contains no mail key. Build, all 2,621 tests, 13 browser checks, production-server startup, lint, source hygiene and staged secret scanning pass. Sender is `orb@email.tejassuds.com`; live delivery awaits Resend domain readiness and was not used as an automated pass criterion. Source is prepared for the requested main sync. Public visibility, hosting and installer signing remain separate release decisions.

P6.45 (navigation and attachment guidance, 2026-10-20): keep only Workspace linking to home, Security and Report a bug in the main navigation on every page; remove the hero's status eyebrow. Add visible macOS instructions for choosing `sidecar.log`, the log-folder path, file-picker shortcut, drag-and-drop and missing-log fallback. Verify the current site and newly verified Resend sender, then sync main.

P6.45 complete: all three pages use the requested three-link navigation, Workspace returns to home, and the hero status line is removed. The bug form explains how to select `sidecar.log` using Shift–Command–G and `~/Library/Logs/orb/`, shows where the selected filename appears and offers drag-and-drop or reporting without evidence. Build, all 2,621 tests, 13 site browser checks, lint and source checks pass. A live synthetic report and log attachment were accepted by Resend through the real website endpoint using the verified sender domain. Inbox delivery was not independently observed. The updated homepage is open locally.

P6.46 (support copy, 2026-10-20) complete: refer to Orb support in the bug-report form's explanatory text instead of displaying the recipient email address. Delivery configuration is unchanged. Build, all 2,621 tests and 13 site browser checks pass.

P6.47 (installer cleanup, 2026-10-20) complete: remove six superseded or duplicate local DMGs, including the default-named duplicate of the current build. Keep only `orb-0.1.0-stacks-arm64.dmg` and its checksum; verify SHA-256 matches the artifact transferred to the owner's MacBook. Reclaimed 1,879,967,152 bytes (1.75 GiB), confirmed no tracked DMGs and documented retention in the release guide. No application code changed after the passing build, 2,621 tests and 13 site checks.
