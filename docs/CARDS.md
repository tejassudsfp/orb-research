# Card types: the card platform (P6.2)

Every card type is defined in five places, each a `Record<CardType, …>`. A type missing from any of them is a type
error, so the compiler is the checklist. Tests then check each part at run time.

## Adding a card type

Every card can also carry `Card.detail`: up to 20,000 characters of original multi-paragraph analysis, separate from
the type's concise summary. Agents pass it as an envelope field to `place_card` or `update_card`; it is not a
type-specific `data` field. The reader shows it in full, `read_card` paginates it, search indexes it, document
figures print it and presentation speaker notes include the cited cards' analysis. Old cards remain valid without
it. Keep evidence, implications, alternatives and uncertainty in the analysis rather than padding the summary.

Diagram, chart, image and interactive design readers use `VisualViewport` for local zoom/pan. Diagram/chart/image
readers support Fit, buttons, keyboard and pinch/Cmd-scroll. Interactive frames keep their controls usable: choose
Pan to move the enlarged visual and Interact to use its buttons and inputs. The research board's camera stays separate.

1. **Name and data.** Add the name to `CardType` in `packages/shared/src/board.ts`. Write its `Card.data` schema in
   `packages/shared/src/cards.ts`, or in its own module next to it.
   - Text-like data is a loose object, with length-checked text fields and extra fields kept.
   - Data that points at files, or must be consistent, is strict.
2. **Manifest.** Add an entry to `CARD_TYPES` in `packages/shared/src/cardTypes.ts`:
   - `label`: the mono kind name;
   - `schema`;
   - `roles`: the agents that may place it. This is BUILD_PLAN §2.4; `PLACEABLE_TYPES` is derived from it;
   - `figure`: how a research document numbers it, `figure` or `table`;
   - `kind(data)`, optional: a label with detail, such as "table · 40 rows".
3. **Host half.** Add `packages/orb-cards/src/types/<type>.ts` and list it in `types/index.ts`. It holds:
   - `purpose`: one line for agents;
   - `origin`;
   - `fields` and `fieldHelp`: what `place_card` takes. Leave them out for a user-only type;
   - `toData`: how fields become data (`create` fills defaults; `update` returns only what changed);
   - `tools`, if the type has its own;
   - `describe(data, card)`: the plain text `query_board` returns. It is clipped to 600 characters, and it must not
     throw on data that does not match the schema.
4. **UI half.** Add `apps/ui/src/cards/types/<type>.tsx` and list it in `types/index.ts`. The contract is
   `CardUi` in `types/kit.tsx`:
   - `Body`: the board renderer at `full` and `compact` LOD. Title LOD shows the title alone, plus `TitleExtra` when
     the type has a value that must stay readable at 25% (for example a metric);
   - `mediaFirst`: draw the content above the title, as an image does;
   - `Reader`: the reader's Card tab. Without one, the reader shows the text, editable on the user's own cards;
   - `Print`: the print half, for a Canvas PDF page (`canvas`) and a research-document figure (`figure`). Its
     helpers are in `apps/ui/src/print/kit.tsx`;
   - `pptx`: the slide hook. Use `pptxHook` (`apps/ui/src/cards/pptx.ts`); it says how the card exports (chart, table,
     image, snapshot, metric or text). A type that needs a native form adds it to `kindOf` AND to `addVisual` in
     `packages/orb-port/src/deckPptx.ts` (see Presentations below).
5. **Size.** Give the type a cell (`CELLS` in `packages/orb-canvas/src/layout.ts`: grid columns and a default height) and a
   height range (`HEIGHTS` in `packages/shared/src/cardSize.ts`: a floor and the ceiling past which content is clipped
   behind "Show more"). Both are `Record<CardType, …>`. A `Body` must not depend on `card.h` (show the rows or lines
   that fit under the type's ceiling, as the database, table, matrix, code, timeline, checklist and framework do), so
   that the measured height cannot change what is measured. A type whose body fills the height it is given (a picture,
   a chart, a frame) goes in `UNMEASURED_TYPES` and keeps its estimate. See `docs/HARNESS_NOTES.md` §P6.20.
6. **Export fixture.** Add one card of the type to `FIXTURE_CARDS` in `scripts/testkit/printFixture.ts`, with its
   marker word in `PRINT_MARKERS`. The new card then appears in:
   - `apps/ui/test/cardplatform.unit.test.ts`: every LOD, the reader, both print modes and the pptx hook;
   - `apps/desktop/e2e/print.spec.ts`: Canvas PDF and the research document;
   - `apps/desktop/e2e/port.spec.ts`: the composed document;
   - `apps/desktop/e2e/a11y.spec.ts`.

   The export tests compare against `CardType.options`, so a type without a fixture card fails them.

Then:
- Give Orb's and the child personas a "when to use" line (`packages/orb-agents/src/persona.ts`).
- Run `pnpm build && pnpm test`, and `pnpm e2e` for the print and port specs.

## Design frames (interactive since P6.2)

A design card's HTML is served by the sidecar as its own page, at
`GET /api/orb-design/frame?canvas=<id>&card=<cardId>&v=<version>[&print=1]`
(`packages/orb-host/src/design.ts`). Before P6.2 it was a `srcdoc` iframe. That iframe inherited the app's CSP, so its
scripts never ran (HARNESS_NOTES §P3.8).

- **CSP.** The page has its own CSP, `DESIGN_FRAME_CSP` in `packages/shared/src/cards.ts`:
  - `sandbox allow-scripts`;
  - inline scripts and styles only;
  - `connect-src 'none'`, and nothing remote of any kind.

  Electron main forces this CSP on the route. The app's own `frame-src` names only this route.
- **Network fence.** Main's request filter cancels everything a frame asks for, except reloading its own page.
- **Libraries.** Chart.js 4.5.1 (global `Chart`) and D3 7.9.0 (global `d3`) are exact-pinned dependencies of
  `@orb/host`. They are inlined into the page only when the HTML uses them.
- **Bootstrap.** A small script runs before the agent's own scripts. It:
  - posts `orb-design-frame-ready` when the page has drawn;
  - posts `orb-design-frame-escape` on Escape, so the reader closes even when focus is inside the frame;
  - turns Chart.js animations off for print and under Reduce Motion.
- **Where it shows.** On the board, the frame is scaled and lets the pointer through. In the reader it is live. In
  print it is a 2x snapshot, taken once the page says it has drawn.

## Database cards and attachable data (P6.3)

A Database card shows the rows of a **dataset**, and any card can show a dataset view. The rows never live in
`board.jsonl`: a dataset is `<canvas>/assets/data/<id>.json` (shared `Dataset`, `packages/shared/src/dataset.ts`),
written only by the orb-canvas `DatasetService` (`packages/orb-canvas/src/datasets.ts`). `board.jsonl` holds the card
events that name it.

- **Card data** (`DatabaseData`): title, `datasetId`, row count, column names and types, `rev`, and a preview of the
  first rows. The board, print, Cmd+F and `describe()` need no fetch. Every dataset write bumps `rev` and patches the
  cards that show it, with a `card.updated` that is not on the user's undo stack (undoing a board action never rolls
  rows back).
- **`Card.view`** (any card, `CardView`): the dataset's id, name, size and `rev`, up to 8 views (`table`, `board`,
  `gallery`; each has filter, sort, group, hidden columns, a gallery cover column) and the active one. A change is one
  undoable `card.updated` (`view`, `null` detaches). A card may only name a dataset of its own canvas.
- **Import**: CSV, TSV, JSON (array of objects, `{columns, rows}`, array of arrays), XLSX (first sheet with data;
  `read-excel-file` 9.3.12, exact-pinned, in orb-canvas only) and pasted text, up to 10 MB, 20,000 rows, 60 columns.
  Column types are guessed (text, number, date, checkbox, select, url). A CSV dropped on the board is still a Table
  card; XLSX and JSON become Database cards.
- **Table to Database**: the selection bar's "Make database" (or the table reader) makes the dataset from the stored
  CSV, then sends ONE `card.updated` that changes the card's `type`, `data` and `view` in place (same id, place, links
  and thread). Undo turns it back into the table. Only the user may change a card's type.
- **Routes** (orb-host `data.ts`, behind the gateway's cookie): `/api/orb-data/import`, `/dataset`, `/edit`,
  `/from-table`.
- **Agent tools** (all four roles read; Orb, Scout and Builder write):
  - `place_card type=database` makes the dataset from `columns` and `rows`;
  - `query_dataset`: a structured query (filter, match, select, groupBy, aggregate, sort, limit, offset). It never takes
    SQL. At most 50 rows, long cells cut, "more" and a hint when rows are left;
  - `upsert_rows` (not the Critic): up to 200 rows; by `rowId`, or by `key` column; unknown columns are refused with the
    column list. Rows the user wrote are never changed by an agent; Scout and Builder change only rows they wrote.
- **Search**: the Home index adds the dataset's text digest (`<id>.txt`, up to 30,000 characters) to every card that
  shows it, so a row is found through the Database card and through any card it is attached to.

## Data cards: Chart, Metric, Timeline, Comparison matrix (P6.4)

Four card types for numbers and dated facts. Their schemas, the plot and the text summaries are pure code in
`packages/shared/src/dataCards.ts` (tests: `packages/shared/test/dataCards.test.ts`).

- **Chart** (`ChartData`): `mark` (bar, line, area, scatter, pie), `x`, `y?`, `color?` (a column that splits series),
  `agg?` (sum by default, count when there is no `y`), and ONE source: `inline` (columns + rows, ≤ 500 rows),
  `dataset` (a Database, P6.3) or `table` (a Table card). An agent never writes Vega-Lite: it gives this small spec,
  and the renderer builds the Vega-Lite spec itself (`apps/ui/src/cards/chartSpec.ts`: inline `values` only, so a chart
  cannot carry a URL, a data transform or an expression). Column names are matched case-insensitively.
  - **Points.** `chartPoints()` groups by x (and series), aggregates y, sorts dates and numbers, folds a long tail of
    categories (> 30) into "Other", and caps a chart at 300 points. A column that is not there is `problem`, listing the
    columns; `place_card` / `update_card` answer with a `warning` so the agent can fix it.
  - **Live binding.** A bound chart keeps its plotted `points` (and `rev`) in its card data, so `describe()`, print and
    the deck export need no fetch. orb-canvas keeps them current: `DatasetService.sync` after every dataset write, and
    `CanvasStore.refreshCharts` after every board command and undo/redo (a Table card edit, a removed table). Those
    `card.updated` events are derived data, outside the user's undo stack, and none are written when nothing changed.
  - **Render.** `vega` + `vega-lite` + `vega-interpreter` (exact-pinned in `apps/ui`) are one lazy chunk, drawn to SVG
    (`vegaRender.ts`). The app CSP has no `'unsafe-eval'` and Vega normally compiles expressions with `new Function`,
    so it is parsed with `{ast: true}` and run with `vega-interpreter`; see HARNESS_NOTES § P6.4. Output is vector
    (paths and text), escaped by Vega's own serializer. Palettes: `night` on the board and reader, `light` in print.
  - **Print.** The same SVG, in the print theme, inlined into the page, so the PDF keeps text as text. The print app
    waits for `[data-testid="print-chart"][data-state="loading"]` to clear.
  - **Users.** The selection bar's **Chart** (`card-make-chart`) makes a chart bound to the selected Table or Database
    card with a first guess (a date or a category on x, the first number on y); the chart reader has controls for mark,
    x, y, series and how rows combine, each one undoable.
- **Metric** (`MetricData`): `value` as written, `unit?`, `change?` (`value`, `direction` up/down/flat, `good?`),
  `period?`, `source?` (`label`, `url`, `cardId`), `note?`. An agent must give a source. The value stays readable at the
  title zoom level (`TitleExtra`).
- **Timeline** (`TimelineData`): up to 60 events, each `date` (`2026`, `2026-10`, `2026-10-15`), `label`, `detail?` and a
  required `source`. Shown in date order (a year before its months, stable for equal dates).
- **Comparison matrix** (`MatrixData`): up to 12 weighted criteria (weight 1 to 100) and 2 to 8 options with one score
  0 to 10 per criterion (`null`: not scored, counts as 0). The app works out the weighted totals (out of 10) and
  highlights the best option (all of them on a tie); the agent never states a total.
- **Who may place them**: Chart, Metric and Timeline: Scout, Builder, Orb; Matrix: Critic, Builder, Orb. Persona lines say when to use which. Agents read them with `query_board`; `describe()` states what a chart plots
  (series values, min/max/total), a metric's figure and source, a timeline's span and first events, a matrix's ranking.
- **Export**: every type has a fixture card in `scripts/testkit/printFixture.ts` (marker words `Chartmarker`,
  `Metricmarker`, `Timelinemarker`, `Matrixmarker`), so print, the research document, the a11y scan and the UI render
  test cover them. The pptx hook is still the placeholder; native charts and tables come with P6.17.

## Synthesis cards (P6.5)

Four types turn findings into a position. Schemas, the rubric maths and the evidence rule are one pure module,
`packages/shared/src/synthesis.ts`. Roles: Critic and Builder place insight, hypothesis and framework; Builder places
decision; Orb places all four and is the only role with `update_card`.

- **Insight** (`insight`): `title`, `body?`, `citations`: **at least 2 different card ids** (≤12). The schema refuses
  fewer, so nobody can write a one-citation insight. On place and update the tools also check that every cited card is
  on this board and is not the insight itself (`requireCitedCards`, orb-canvas). The board shows the citations by title;
  the reader makes each a button that opens the cited card. A cited card that was deleted reads "card removed".
- **Hypothesis** (`hypothesis`): `title`, `body?`, `confidence` 0 to 100, `evidenceFor?`, `evidenceAgainst?`. Evidence is
  the card ids in the data **plus the board's links into the card**: a `supports` link INTO the hypothesis is a "for", a
  `contradicts` link into it an "against" (`hypothesisEvidence`). The card reads the links live (`BoardRefsContext`,
  provided by the Canvas screen), so drawing a link, by the user or by `add_link`, moves the balance at once; print and
  `describe()` use the data's lists only (print has no board). The confidence meter reads at title LOD too
  (`TitleExtra`). The label (unlikely, uncertain, likely) splits at 35 and 65.
- **Decision** (`decision`): `title`, `body?`, `options` (2 to 8 of `{label, note?, scores?}`), `choice?` (an option's
  label), `rationale?`, `status` (`open`, `decided` which needs a choice, `revisit`), `criteria?` (`{name, weight}`).
  With criteria, every option carries one 0 to 10 score per criterion, and the card shows the weighted total (0 to 10)
  and rank of each (`decisionTotals`; ties share a rank). The agent field is `decisionStatus` (stored as `status`).
- **Framework** (`framework`): one type with three variants (`FRAMEWORK_CELLS`): `proscons` (pros, cons), `swot`
  (strengths, weaknesses, opportunities, threats), `quadrant` (topLeft, topRight, bottomLeft, bottomRight, named by
  `xAxis` and `yAxis`). Agents give `entries: [{cell, text}]` (≤8 per cell); `update_card` replaces all entries. A cell
  that does not belong to the variant is refused with the valid keys.

The reader and print draw everything; the board card shows what fits and "+n more". The agent tool parameters
(`citations`, `confidence`, `evidenceFor`, `evidenceAgainst`, `options`, `criteria`, `choice`, `rationale`,
`decisionStatus`, `variant`, `entries`, `xAxis`, `yAxis`) are in `FIELD_PARAMS` (orb-canvas `tools.ts`). Tests:
`packages/shared/test/synthesis.test.ts`, `packages/orb-canvas/test/synthesis.test.ts`,
`apps/ui/test/synthesis.unit.test.ts`, `apps/desktop/e2e/synthesis.spec.ts`; the export fixture holds one of each.

## Entity, media and technical cards (P6.6)

Six types, added with the five-place checklist above. Shared schemas and helpers: `packages/shared/src/mediaCards.ts`.
Every card keeps its name in `title` and its text in `body`, so titles, search and default readers work.

| type | data | agents (place) | UI |
|---|---|---|---|
| `entity` | `kind` person\|org, `role`, `org`, `location`, `body`, `url`, `facts`, `photo` | Scout, Orb | avatar (photo or initials), role line, summary, facts |
| `product` | `kind` product\|competitor, `vendor`, `pricing`, `body`, `url`, `strengths`, `weaknesses`, `facts` | Scout, Orb | summary, +/- lists; the Data tab attaches a dataset (`Card.view`, any card) |
| `video` | `url`, `platform`, `author`, `duration`, `publishedAt`, `body`, `thumb` | Scout, Orb | thumbnail slot, Open in browser |
| `code` | `language`, `code` (20k), `body` | Builder, Orb | bundled highlight.js |
| `math` | `latex` (4k), `body` | Builder, Critic, Orb | bundled KaTeX |
| `checklist` | `items [{id, text, done}]` (100) | all four | checkboxes, progress |

- **Video is never embedded.** There is no iframe, video, embed or object for it, on the board, in the reader or in
  print; nothing is fetched from the video's site. The thumbnail is an image asset (an agent passes the path of a
  `capture_page` image as `thumbnail`; the user picks a file in the reader). The link opens through the window-open
  handler in Electron main. Test: `apps/ui/test/mediacards.unit.test.ts`, `apps/desktop/e2e/media.spec.ts`.
- **Checklist: agents propose, the user ticks.** The planner (`planOne` in `commands.ts`, rule in
  `checklistTickViolation`) refuses an agent change that sets or clears a `done`, or removes a ticked item. `place_card`
  takes `items` as plain strings (all open); `update_card items=[…]` is the full new list and keeps the tick of an item
  whose text is unchanged. The user ticks on the board or in the reader (`CardActions.setData`, one undoable change).
- **Highlighting** (`apps/ui/src/cards/media/highlight.ts`): highlight.js core with 20 registered languages and aliases
  (`py`, `ts`, `sh`, `html`…); an unknown language shows plain text. Output is highlight.js's own escaped markup.
- **Math** (`media/math.ts`): `katex.renderToString` with `trust: false`, `strict: 'ignore'`; the CSS and fonts are
  bundled by Vite (`font-src 'self' data:` already allows them). A formula KaTeX rejects shows its message.
- **User cards**: Add card makes an empty one and opens the reader, where each field edits on blur (`media/edit.tsx`);
  an agent's card is read-only there. A thumbnail or photo goes through `CardActions.uploadImage`.
- **Agent fields** are flat in `place_card` (`FIELD_PARAMS` in orb-canvas `tools.ts`). The two kinds share
  `entityKind` so the existing `kind` enum is untouched.

## Research run and Watch cards (P6.7)

Two types that no agent places with `place_card` and no user creates: the orb-canvas Parallel service writes them
(`packages/orb-canvas/src/parallel.ts`, `parallelFlows.ts`), on behalf of the agent that called `deep_research`,
`batch_enrich`, `find_entities` or `watch_topic`. Both have `roles: []` in the manifest and no host `fields`.

- **Research run** (`ResearchData`, `packages/shared/src/parallel.ts`): `kind` (`deep_research`, `batch_enrich`,
  `find_entities`), `status` (`awaiting_approval`, `queued`, `running`, `completed`, `failed`, `detached`, `declined`,
  `cancelled`), live `progress`, `sourcesRead`, the latest `messages`, `done`/`total` (a batch) or `matched`/`generated`
  (an entity search), then the cited `summary`, per-field `fields` with confidence, and every `citation`. Progress is a
  series of `card.updated` events (at most one per 700 ms), so the card is live on every board view. The top sources
  (at most 12) also become `source` cards linked from it with a `cites` label; a batch or entity search fills a
  Database card linked with `fills`.
- **Watch** (`WatchData`): a Parallel monitor: `query`, `frequency`, `monthlyUsd`, `monitorId`, `status` and the newest
  `events`. Each new event is a `doc` card (with its sources); orb pulls them when the canvas opens.
- **Cost guard**: a run over $0.50, and ultra and above, FindAll core and pro, batches over 50 rows, every watch, is
  placed `awaiting_approval`; Approve or Decline (on the card, or the prompt in the conversation panel) is
  `orb/parallel.confirm`. The tool waits; Stop declines the card.
- The run registry `assets/parallel/runs.json` (written only by the service) lets `research_status` and a canvas open
  re-attach runs after a restart. Task and Task Group runs cannot be cancelled at Parallel: Stop marks the card
  `detached` ("goes on and is billed"). A FindAll run is really cancelled.

## Agents at scale (P6.8)
- **Reading a big board.** Agents do not get the board; they ask for it in layers: `board_map` (frames, counts, a digest and top titles of
  each; `board_map {frameId}` lists one frame), `search_board` (words in, ids and snippets out; databases are found by their rows),
  `read_card` (one card in pages of 8,000 characters), `query_dataset` (rows). `query_board` stays, paged (20 cards, at most 50).
  Each result has a hard budget (about 4k tokens) and says "more" with `nextOffset` and a hint. A new card type needs nothing for
  these: `describe()` feeds the map and the lists, `cardText` (packages/shared/src/search.ts) feeds search and `read_card`.
- **Context.** `chat.send` injects only what the user selected, mentioned or put in context, as describe() text at the END of the user
  message: at most 15 cards per frame, 25 loose cards, 400 characters each, 16,000 characters in all, then a pointer to the reading tools.
- **Personas.** The "which card" lines come from one table, `WHEN_TO_USE` (packages/shared/src/cardGuide.ts, a `Record<CardType, string>`:
  a new type does not compile without its line), filtered by what each role may place. Keep a persona compact: `persona.test.ts` has
  size ceilings and checks each role is told exactly the types it may place.
- **Describe and print audit.** `packages/orb-cards/test/describe-audit.test.ts` checks every type's `describe()` on the export
  fixture cards (one clipped line, carries the card's marker, never "undefined"); the print half of every type is
  `apps/ui/test/cardplatform.unit.test.ts`.
- **Layout tools** (never coordinates): `move_card(cardId, frameId)`, `arrange_frame(frameId, by: importance|date|type|source|cluster)`,
  `reorder_frames(order)` and `tidy_board` (Orb only). Planners are pure (`packages/orb-canvas/src/arrange.ts`); user cards and cards
  the user dragged never move; children move only their own cards; one rearrangement is one undo step, one activity line, and the cards
  glide (`data-gliding` on the world, CSS in `canvas.module.css`; none under Reduce Motion).
- **Caching.** Parallel results are cached per canvas in `assets/parallel/cache/` (`ParallelResultCache`): `web_search` (Parallel mode),
  `parallel_extract`, `web_answer`, `deep_research`, `find_entities`, keyed on the normalised input plus processor/effort/generator;
  a repeat is free and says `cached: true`; `refresh: true` runs it again. Add a tool to the cache with `cachedCall` in
  `parallelTools.ts`.

## Presentations (P6.17)
A deck is the research document's sibling: Orb writes slides with `compose_slides`, each citing cards; the user edits
them in the slide view (`#/deck/<canvas>`) and exports PDF slides or a .pptx.
- **Where a card shows up on a slide.** A `visual` or `two-column` slide names one card in `visualCardId`. On screen and in
  the PDF the slide draws the card's own `Print` half (`apps/ui/src/deck/SlideFace.tsx`), so a new card type needs nothing
  extra. In the .pptx `addVisual` (`packages/orb-port/src/deckPptx.ts`) draws it: Chart cards as native charts (from the
  card's `points`), Table / Database (preview rows) / Matrix as native tables, Image and a PDF's thumbnail as pictures, a
  design frame as its latest snapshot (`assets/snapshots/`), a metric as a big figure, anything else as its kind, title and
  `describeCardData` text. `apps/ui/test/deck.unit.test.ts` puts EVERY type of the export fixture on a slide and unzips
  the result, so a new type is covered by adding its fixture card.
- **Citations.** `validateSlides` (`packages/orb-port/src/deck.ts`) is the whole rule; the speaker notes and the Sources
  slide are generated from `cardIds` (`slideNotesText`, `deckCitationNumbers`), never written by the model.
- **Formats.** `DECK_FORMATS` in `packages/shared/src/deck.ts`; a template names its deck through `deckFormatFor(templateId)`
  (templates whose id starts with `vc` get the 12-slide investment-committee deck). Add a format there and it appears in
  the composer.
- **Files.** `deck/deck.json`, `deck/instructions.json`, `exports/deck-<stamp>.pdf|pptx`.
