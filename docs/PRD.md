# Orb v0, Product Requirements (rev 2)

Oct 14, 2026 · @Fanpit · rev 2 replaces the original PRD (`docs/archive/`) after a code-level audit of DeepSeek Harness (`docs/DSH_DEEP_DIVE.md`).

> **What changed in rev 2, at a glance**
> - **Board storage.** The board is stored in Orb's own append-only `board.jsonl` per canvas, not as custom harness session events. The harness refuses to reopen sessions that contain unknown event types.
> - **Session files.** Harness session files live under Orb's private harness home, not inside each canvas folder.
> - **Shell.** Electron, not Tauri. The harness's web gateway only accepts same-origin, loopback requests, and its reserved `desktop` profile is Electron's.
> - **No orb-server built from scratch.** Orb reuses the harness web gateway (it already has `session/cancel`, steer, streaming and auth) and adds a thin `orb-host` plugin of extra endpoints.
> - **Agent tools.** Agents get **no filesystem tools at all**. They see the board and sources only through Orb tools.
> - **Subagents.** Scout, Critic and Builder are continuable child agents. They place cards through a `place_card` tool, because continuable children cannot take output schemas. They report progress quietly through an Orb tool, because the harness's own child messages always wake the parent.
> - **Stop.** Stop and pause are orchestrated by Orb and measured, not assumed.
> - **Privacy.** Every default-on harness telemetry path is listed and switched off. DeepSeek is routed through the generic provider adapter, so no anonymous user ID header is sent.
> - **Sources.** PDF text extraction, page screenshots and a pluggable search provider are Orb's own work. The harness has none of them, except DeepSeek web search.
> - **Open questions.** Open questions are resolved, except the trademark check.

## Overview

Orb v0 is a standalone, fully local Mac app where research happens on an infinite canvas that AI agents fill as you think together. Chat is the command channel, the canvas is the hero, and every output is a view of the canvas.

**The problem.** AI research tools optimise for the deliverable. A PDF or a page arrives, but the understanding behind it is skipped and the trail of thinking disappears into a chat history.

**The thesis.** The board is the research. The PDF is just a view of it. Every claim in an output traces back to a card, and every card says why it is on the board.

**North star.** Google for research and thinking. The obvious first place someone goes when they want to understand something.

**The v0 acceptance test.** Tejas opens Orb, types his next project idea, and runs the whole brainstorm there instead of in a chat app, from the first question to an exported research document. If that works end to end and feels better than chat, v0 is done.

**How to use these documents.** This PRD goes to the building agent together with the following.

| Document | Role |
|---|---|
| `docs/BUILD_PLAN.md` | The sequenced build: phases, milestones, tasks, gates |
| `docs/DSH_DEEP_DIVE.md` | The facts about the harness, with file paths |
| `design/` | The prototype: Home, Canvas, Port |

Where documents conflict, precedence is:
1. This PRD, on **behaviour**.
2. The prototype, on **look**.
3. The deep dive, on **what the harness actually does**.

## Goals and non-goals

v0 ships a polished single-user research canvas that runs entirely on the user's Mac with their own model key.

**Goals**

1. A user can go from one question to a well organised board of sources, notes, questions and design frames in one session.
2. The user stays in charge. Agents visibly work, can be stopped at any time, and never bury the board.
3. Every agent-placed card explains why it is there, and every exported claim cites a card.
4. The user can export a complete canvas PDF or a research report with selected exhibits and traceable supporting records. The board evidence compilation retains every canvas element. (P6.30 user update.)
5. Everything lives in a local folder the user owns. No account, no server, no telemetry.
6. The model is configurable in the app by adding an API key.

**Non-goals for v0**

- Multi-user collaboration, sharing links, cloud sync or any hosted service.
- A public plugin marketplace or third-party card installs.
- Windows, Linux, web or mobile builds.
- Live market data, persona packs and scheduled background research.

## Users and core scenarios

The first user is a founder thinking through a new idea, with students, analysts and UI researchers close behind.

| User | What they do in Orb | What success looks like |
| --- | --- | --- |
| Founder or builder | Brainstorms a new product idea, its market, competitors and a first prototype | A research document they can send to a co-founder or investor |
| UI researcher | Collects competitor screens, maps flows, asks Builder for mockups | A board of findings plus design frames that print cleanly |
| Analyst | Researches a company or sector from filings, articles and data | A cited brief where every claim traces to a source |
| Student | Learns a topic deeply, with explain-back and open questions | A concept map and reading list they actually worked through |

**Scenario A, new idea brainstorm (the v0 test).**
- The user types an idea on Home.
- Orb opens a canvas, proposes frames such as Thesis, Market, Competitors, Prototype and Open questions, and starts Scout and Critic.
- The user threads on cards, adds notes and asks Builder for a first screen.
- The user composes a research document with an instruction like "write it as a one-page investor memo", then exports a PDF.

**Scenario B, start from material.** The user drops a PDF, a link or a screenshot on Home. Orb opens a canvas with that item as the first card and asks what the user wants to understand about it.

**Scenario C, return to a board.**
- The user reopens a canvas from last week.
- The board, threads and chat are exactly as left, and the reading queue shows what is still unread.
- Agents resume only when asked.

## Product principles

When two requirements conflict, these decide.

1. **The canvas is the hero.** Chrome floats over the board; the collapsible conversation rail reserves space beside it, so chat never covers the research. (User update, P6.31.)
2. **The board is the source of truth.** Outputs are generated from cards and never edited into a separate copy.
3. **Show the work.** Agents move visibly on the board, every agent card has a "why it's here" line, and every action is in the log.
4. **The user stays in control.** Stop always works within one second. Agents never delete or rewrite user notes.
5. **Quality over quantity.** A frame holds a few excellent cards, not forty mediocre ones.
6. **Local and private by default.** Nothing leaves the Mac except calls to the model and web providers the user configured.
7. **Everything is a plugin.** Card types, agents, sources and exporters are plugins, including the ones we ship. On the harness side they are Cordis plugins; on the UI side they are registered React modules.

## Screens and information architecture

v0 has four screens plus a first-run sheet.

| Screen | Status in the prototype |
|---|---|
| Home | Designed in the prototype |
| Canvas | Designed in the prototype |
| Port, reading view only | Designed in the prototype |
| Port composer | Not designed. Follows the design system |
| Settings | Not designed. Follows the design system |
| First-run sheet | Not designed. Follows the design system |

**Prototype elements that are out of scope for v0 (do not build).**
- "Public boards" button, and the "Fork a public board" tile on Home.
- "Share board" on Canvas.
- The Live ticker card.
- "Copy link" and "Fork this board" on the Port page.
- On Port, the "See the research behind this" link becomes "Back to canvas".
- The canvas card that says "a card plugin is four things" is outdated. The contract has five parts (see below).

**Home**

- **Top area.** A mode tagline plus three rotating topic words on one line, for example "Kites? Nebula? Ocean?", with the middle word in the accent colour.
  - The words come from the pool of 24 in the prototype and rotate every 2.8 s.
  - Rotation is paused when Reduce Motion is on.
- **Night and day.**
  - Night tagline: "Don't go gentle into the night!" in white.
  - Day tagline: "Everything the sun touches" in blue.
  - A labelled Light mode / Dark mode button in the top right switches modes, and the choice persists in `orb.json`.
- **Search box.** It sits in the vertical centre of the window.
  - Enter creates a new canvas with that prompt.
  - Dropping a file or a link on the box creates a canvas seeded with that item.
  - Without a working model key, the box explains that a key is needed and links to Settings.
- **Template chips** under the box: Topic deep dive, Company research, GTM, UI research, Stocks. Each one prefills a starting frame layout and an agent brief. Stocks is a template only, with no live data.
- **Your canvases.** Recent canvases sit along the bottom as tiles. Each tile has a mini preview, a status ("3 agents working", "Idle") and the token and cost total.
- **Search.** Local full-text search across all canvases, backed by `index.sqlite`.

**Canvas**

- An infinite board with pan and zoom, frames, cards and links. Details in the Canvas section.
- Floating top-left pill: Orb mark (links Home), canvas title (editable) and save state ("Saved locally", "Saving…").
- Floating top-right action: Publish Port, which opens the Port composer.
- Floating left toolbar: Select, Note, Frame, Connect and Add card.
- Bottom left: minimap with zoom out, zoom level (click to reset) and zoom in.
- Right: a full-height conversation rail (history, agent activity, context and input), with Must read/Skim in a dropdown and local board lookup. It collapses to a bottom-right pill and returns that space to the canvas.

**Port**

- **Composer sheet.**
  - Two modes: Canvas PDF and Research document.
  - Scope selection, an instructions box, and Export.
- **Reading view.** Shows the research document inside the app, with inline editing and per-section regenerate. Its look follows `design/screens/port.html`.

**Settings**

- Appearance: six styles, independent preset/custom accent colour, Light/Dark/System brightness and motion reduction. This section comes first, visible without scrolling at the minimum supported window size. Choices apply across orb, save automatically in the local library and survive restart; a failed save is visible and retryable. (User update, 2026-10-18.)
- Models: providers, keys, a Test button, the per-agent model picker, the search provider key, and the price table.
- Storage: shows the Orb folder location, with Reveal in Finder and Change location.
- About: the Orb version, the pinned harness version, and a "Privacy: nothing is sent except to the providers you configured" statement.

## Canvas requirements

Every conversation has exactly one canvas. Every change to the board, by the user or an agent, is one event in that canvas's `board.jsonl`.

**Navigation**

- Infinite board.
  - Pan: drag on empty space, hold Space and drag, or scroll on the trackpad.
  - Zoom: pinch, or Cmd and scroll, zooms toward the cursor.
- Zoom range is 25% to 250%.
  - The prototype clamps at 30%; use 25%.
  - Zoom to fit, zoom to selection and reset to 100% are available from the minimap and the keyboard (Shift+1, Shift+2, Cmd+0).
- The minimap shows frames in their colours plus the current viewport, and clicking it jumps there.
- Floating UI stays fixed while the board moves underneath.

**Frames**

- Frames are titled, numbered regions (01 THESIS, 02 MARKET and so on) in one of the palette tones.
- The user and agents can both create, rename, resize and recolour frames.
- **Card budget.** Each frame has a card budget, 12 by default, enforced by the canvas service rather than by prompts.
  - When an agent places a card that would exceed the budget, the tool returns `FRAME_FULL` with the frame's cards.
  - The agent must then call `consolidate_cards`, which collapses some of its own cards into a stack, before it can place more.
- **In context.** A frame can be put "in context", which pins it to the conversation as a chip. The next agent request then includes its cards.

**Cards**

- Cards can be placed, moved, resized, grouped, multi-selected and deleted.
- Agents never pick coordinates. They name a frame, and the layout engine places the card in that frame's grid.
- Agent cards show the agent's colour and a "why it's here" line. Hovering shows which agent added the card, and when.
- Clicking "why" opens the provenance view: the agent, the model, the tool call, and the conversation turn that produced the card.
- User notes are visually distinct (Paper card). Agents can never edit or delete them; the canvas service enforces this, not the prompt.
- Any card or frame can open a thread (see Chat and threads).
- **Full-screen card reader (user update, P6.29, 2026-10-18).** Opening a card uses the app's full content area, with Back to board and Escape to return. Keep the board camera and selection. Wide tables scroll horizontally, text cells wrap in readable multiline editors, and Details opens an adjacent row rail with every field in full, including hidden columns. Previous/Next follows the current filtered/sorted view. Escape closes row details before the card; an edited cell consumes Escape to cancel its draft first. The background board is inert while the reader is open. The same reader holds long text, charts, diagrams and media.
- **Click to read (user fix, P6.32, 2026-10-19).** A normal click on card content opens that full-screen reader at every zoom detail level. Each card has a labelled selection checkbox for selecting without opening; Shift-click toggles selection and Command/Control-click selects without opening. Dragging moves the card, cancelled gestures never open it, and buttons, links and embedded controls keep their own actions. Keyboard Enter and the selection bar's Open action remain available. Verify real ordinary clicks in the packaged installer.
- **Stack browsing (user fix, P6.42, 2026-10-19).** Opening a stack lists every member as an actionable entry. Each member opens in its full reader with Previous/Next and Back to stack controls, including nested stacks. Preserve original card contents and stack membership, record each opened member as read, and keep the board camera unchanged. Long lists and source summaries/excerpts remain readable.

**Links**

- A link connects two cards or frames. Its type is one of: supports, contradicts, tension, leads to, example of, or a free label.
- Tension and contradicts links use the dashed accent style from the prototype.

**Adding content**

- Drag and drop from Finder or a browser. Supported: PDF, PNG, JPG, GIF, WebP, CSV, Markdown, plain-text files, and URLs.
- Paste an image or a URL directly onto the board.
- Double-click empty space to create a note.

**Reading queue**

- A dropdown inside the conversation rail lists cards marked Must read or Skim, with Must read first. It starts closed, scrolls independently and opens full-screen card readers. A card gets a tick once the user has opened it.
- Before composing a Port, Orb warns if Must read cards inside the selected scope are still unopened.

**History**

- **Undo and redo.** Unlimited undo and redo for the user's own actions in this app session. They are implemented as compensating events in `board.jsonl`; the log is never rewritten.
- **Agent actions.** Undo does not reverse agent actions. A user can delete an agent card; that is a user action and is undoable.
- **Drags.** A card drag is recorded as one move event, on release.

**Search on the board**

- Cmd+F searches card text on the current canvas and flies to each result.

## Card types and the card plugin contract

v0 ships eleven card types. Each is a card plugin that implements the same five-part contract. A card plugin has two halves: a **host half** (a Cordis plugin in the harness sidecar) and a **UI half** (a React module in the app).

**The contract.** A card plugin that does not define all five parts does not ship.

1. **Data** *(host)*. Its JSON schema and source: static, fetched once, or captured from a file.
2. **Agent tools** *(host)*.
   - It declares which agents may create it and with which fields.
   - The shared `place_card` and `update_card` tools validate the payload against the card's schema.
   - A card may add its own tools, for example `write_design_frame`.
3. **Describe** *(host)*. A plain-text description of the card's content, so agents can reason about a chart or a mockup rather than just place it. `query_board` returns these descriptions.
4. **Render** *(UI)*. The React component, at three zoom levels:
   - full (at least 60%),
   - compact (35–60%),
   - title only (below 35%).
5. **Print** *(UI)*. How the card renders on a canvas PDF page, and as a numbered figure in a research document.

| Card | Created by | On the canvas | In print |
| --- | --- | --- | --- |
| Note | User | Paper-coloured card, user text, "Your note" label | Styled text block |
| Source | Scout or user | Title, URL, summary, why it's here, Must read or Skim badge, thread button | Text block with summary, why line and clickable link |
| Quote | Scout or user | Excerpt under 50 words with its source | Pull quote with citation |
| Image or screenshot | User, Scout | Image with caption | Full-resolution image with caption |
| File or PDF | User | Cover thumbnail, title, page count, open button | Cover thumbnail with title and page reference |
| Question | Critic or user | Question mark card, open or answered state | Styled text block in Open questions |
| Risk or claim | Critic or user | Dashed card with label | Styled text block |
| Design frame | Builder | Live HTML mockup in a sandboxed iframe, editable via chat | High-resolution snapshot taken at export |
| Diagram | Builder | Mermaid diagram rendered live | Vector graphic |
| Table | Any agent or user | Sortable table, CSV import | Real table, split across pages when long |
| Doc draft | Orb | Long text card with a heading and body | Text section |

**Rules for every card**

- A card that can change over time prints as a snapshot labelled with the date and time it was captured.
- **Design frames.**
  - They render in `<iframe sandbox="allow-scripts" srcdoc=…>`, with no `allow-same-origin` and a CSP of `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:`.
  - So they have no network access and no access to the app or the canvas folder.
  - In v0 a design frame is a single static screen. Scripts may run for hover and toggle effects, but there is no navigation between screens.
- **Source cards** keep only the link, the agent's summary and short excerpts.
  - The full extracted page or PDF text is cached in `assets/sources/` for agents to read, through `read_source`.
  - That text is never placed on the board and never exported in full.

## Agents

v0 has one main agent the user talks to, plus three subagents that work on the board. Each has its own colour, cursor, model route and tool set.

| Agent | Colour | Job | Tools (exact allow-list in BUILD_PLAN §Agents) | Default model tier |
| --- | --- | --- | --- | --- |
| Orb | Signal blue mark | Talks with the user, plans frames, delegates, composes outputs | Board tools, delegation tools, compose tools | Strongest configured |
| Scout | Sky #60A5FA | Searches the web, reads pages and PDFs, places source and quote cards | `web_search`, `fetch_url`, `read_source`, `capture_page`, board tools | Fast and cheap |
| Critic | Paper #F9FCFE | Finds contradictions, weak claims and gaps, pins questions and risks, draws tension links | `query_board`, `read_source`, `place_card` (question, risk only), `add_link` | Strongest configured |
| Builder | Signal blue #2563EB | Makes design frames (HTML mockups) and diagrams | `query_board`, `write_design_frame`, `place_card` (diagram, table) | Strong, vision capable if available |

**How agents map onto the harness** (details: deep dive §3)

- **One canvas, one root agent.** Each canvas has one root harness agent, Orb.
  - It is created by `orb-agents` with `cwd` set to the canvas folder, and with Orb's no-shell `orb` preset.
  - Its harness session id is stored in `canvas.json`.
- **One child per role.** Scout, Critic and Builder are continuable child agents of Orb, at most one of each per canvas.
  - Each is started with its own persona, a tool allow-list and model options.
  - Orb assigns them frames and redirects them with messages.
  - In v0 a child is scoped per role, not per frame. Its working context is the frames it has been assigned, read through `query_board`.
- **Cards come back as tool calls.** Children return their work as `place_card` and `add_link` tool calls validated against card schemas, never as prose.
- **Quiet progress.**
  - Children report progress with the `report_progress` tool. That updates their cursor and the activity list, and quietly adds context to Orb without waking it.
  - Children message Orb only when they finish, or when they need a decision.

**Behaviour rules**

- **New canvas.** Orb proposes three to five frames for the question, places them, and starts Scout and Critic unless the user says otherwise.
- **Cursors.** Each agent shows a live cursor with a short status label, for example "Scout, reading docs". The cursor glides to the frame it is working in.
- **Controls.** From the conversation panel the user can pause, resume, redirect or stop any single agent, or all agents.
  - **Stop:** halts the agent's current turn and clears its queue.
  - **Pause:** halts the current turn but keeps the queue, and holds the agent until Resume.
  - **Stop all:** every agent's UI state is stopped within one second, and the actual halt is measured and logged.
- **No shell, no filesystem tools.** No agent has shell, terminal, code-execution, workflow or generic filesystem tools.
  - Agents read only through Orb tools.
  - The only thing they can write is board state, plus assets under the current canvas folder, through Orb tools.
- **User notes.** Agents never modify or delete user notes.
  - An agent may delete only cards it created, and only through `consolidate_cards`.
  - Both rules are enforced by the canvas service.
- **Provenance.** Each agent card records its provenance: agent, model, harness session id, the session event range, and the tool call id. That powers the "why it's here" detail view.

## Chat and threads

The conversation rail is the command channel for the whole canvas. Threads are scoped conversations about one card or frame.

**Conversation panel**

- **Markdown.** User messages and agent replies render Markdown in live streams, saved history and card/frame threads: paragraphs, emphasis, headings, lists, links, quotes, code blocks and GFM tables/tasks. Preserve the original message text for storage and editing. Wide tables and code scroll within the message. HTML stays inert; image references are explicit links rather than automatic remote fetches. (User fix, P6.28, 2026-10-18.)
- **Size.** A full-height right rail, 360–460 points wide according to the window. The board occupies the remaining width and uses that viewport for fit, search flights and minimap. Collapse restores the full board width; reopening keeps the draft, history and pinned context and returns keyboard focus to the input. Reading and board-search dropdowns scroll within the rail; the composer remains reachable at 960×600. Incoming tokens do not pull a user away from older messages they scrolled up to read. (User update, P6.31, 2026-10-19.)
- **Streaming.**
  - Responses stream token by token.
  - While anything is running, a Stop button replaces Send.
  - The menu also offers Pause all and Stop all, plus per-agent controls on the agent avatars.
- **Activity.** Under agent turns, an "On the board" group lists what each agent added, linked to the cards.
- **Context.**
  - A context chip above the input shows which frames or cards are in context.
  - @ mentions add a card or frame to context.
  - Search this board finds card content and frame titles locally; open a result to read it or pin it with Ask about. The agent has board_map/search_board/read_card/query_dataset access even with no pinned cards. It searches and reads existing evidence for board questions, cites it, and asks a focused clarification when a reference is ambiguous. A question about saved evidence alone does not request a full research rerun.
- **Keys.** Enter sends, Shift+Enter adds a new line, and Up edits the last message.
- **Compose.** The Compose button opens the Port composer.
- **Header menu.** Shows the token and estimated cost meter for this canvas.

**Threads**

- Any card or frame has a Thread button. Opening it shows a popover anchored to the card, with its own messages and input.
- **Grounding.** A thread message is sent to Orb with that card's content injected, so the answer stays grounded in the card.
- **Cards from threads.** A thread can produce new cards. They are placed next to the card the thread belongs to, and linked to it.
- **Persistence.**
  - Cards with threads show a reply count.
  - Thread messages are stored in `board.jsonl`.
  - The model-side turns live in Orb's harness session.

**Notes on cards**

- The user can attach a short note to any card. It shows as a small Paper tab on the card and is separate from threads.
- These notes count as user content in exports.

## Port

In v0 a Port is one of two things, a canvas PDF or a research document. Canvas PDF and the board evidence compilation render every canvas element. A professional report uses selected exhibits alongside its analysis and registers the other records in a compact appendix. (User update, P6.30, 2026-10-18.)

**Composer**

- Opened from Publish Port or the Compose button.
- Choose the mode, Canvas PDF or Research document.
- Choose the scope: the whole board, or selected frames. Frames can be ticked in a list or selected on the board.
- Warns about unread Must read cards in scope, with Open and Continue anyway options.

**Mode 1, Canvas PDF**

- A visual export of the board itself.
- Layout options: one page per frame, or one poster page for the whole board.
- Theme options: as on screen (night), or print-friendly light. Light is the default.
- Cards, links, labels and colours render as on screen, and source URLs stay clickable.
- Design frames render as high-resolution snapshots, and diagrams as vector SVG.
- Each page has a footer with the canvas title, frame name, export date and page number.
- **Pipeline.**
  1. The board's print route renders in a hidden Electron window.
  2. `webContents.printToPDF` produces the PDF.
  3. Design-frame snapshots are captured first, with `capturePage`.

**Mode 2, Research document**

- Orb writes the document only from the cards in scope.
- **Format and instructions (user update, P6.30).** Default to Professional research report. Its instructions specify audience, purpose and emphasis. Brief or custom structure permits an investor memo, a short page limit or an alternative outline. Save the selected format and instructions with the document; existing custom documents stay readable.
- **Professional report.** Write a standalone executive summary, scope and methodology, substantive analysis of each topic in the selected scope, conclusions and recommendations, and risks, limitations and open questions. Read the complete supporting cards before saving each section; use dataset queries and cached source detail as appropriate. Explain evidence, comparisons, numerical basis, implications, alternatives and qualifications rather than inventorying cards. Distinguish facts, claims, estimates and proposals; do not invent procedures, evidence, validation or filing approval.
- **Completion.** Check required sections, substantive cited prose, evidence for each topic and repeated paragraphs. Preserve completed sections and automatically repair incomplete output, with a bounded retry limit; a failed report remains a draft with useful review points. Stop or Pause prevents automatic repair. After context compaction, retain the writing plan and saved sections and re-inspect supporting evidence before continuing. These structural checks do not certify factual accuracy.
- **Presentation.** Include a cover with dates, document version, coverage and status, linked contents, numbered sections, curated exhibits, a compact evidence register and numbered references. Produce flowing, readable A4 PDF pages with running page numbers, links, bookmarks and tagged text. Report export requires a completed composed report; a raw board compilation must be labelled as such. Short/custom documents retain their full supporting-card appendix.
- **Citations are structural, not trusted to prose.**
  - Orb writes the document with the `compose_section` tool. Each paragraph carries a non-empty `cardIds` array.
  - The tool rejects a paragraph without citations, and rejects any `cardId` that is not in scope.
  - The renderer turns `cardIds` into numbered citations that link to source cards and URLs.
- **Figures.** Canvas elements appear as numbered figures, tables and quotes with captions, in the section where they are discussed.
- **Reading view.**
  - The document opens in a reading view in the app.
  - The user can edit text inline, and regenerate any single section.
  - Edited paragraphs keep their citations. A paragraph the user writes is marked as user-authored and is exempt from the citation rule.
- **Storage and export.**
  - Instructions are saved with the canvas and reused on regenerate.
  - The document is stored as Markdown plus a sidecar JSON with paragraph citations, in `port/`.
  - It exports as PDF through the same print pipeline.

**Saving**

- Every export is written to the canvas's `exports/` folder with a timestamped file name, and the app offers Reveal in Finder.

## Sources

Scout's research tools are Orb plugins (`orb-sources`).

| Capability | v0 implementation |
|---|---|
| Web search | `web_search`, through a pluggable provider interface. **Default:** DeepSeek's built-in search when a DeepSeek key is configured (no extra key needed). **Optional:** a Brave Search or Tavily key in Settings. If no provider is available, the tool returns a clear message, and dropping URLs still works. |
| URL fetch | `fetch_url`. HTML is converted to Markdown with readability plus turndown. Private and loopback IPs are blocked, size is capped at 5 MB, and the result is cached in `assets/sources/` |
| PDF | Detected by content type. Text is extracted with `pdfjs-dist` in the sidecar, page by page, and cached |
| Page screenshot | `capture_page`. A hidden, sandboxed Electron window loads the URL with JavaScript enabled and no persistent session, then captures the page to `assets/` |
| Read cached source | `read_source(cardId, page?)` returns cached text in chunks |

## Models and API keys

The user brings their own model key, added in Settings. Nothing works until at least one provider is configured.

**First run**

- On first launch, before Home, a short setup sheet asks the user to add a key.
- DeepSeek is preselected, with a link to get a key.
- The user may skip. The search box then explains that a key is needed.

**Models screen**

- **Provider cards:**
  - DeepSeek (default)
  - Anthropic
  - OpenAI
  - OpenRouter
  - Custom: any endpoint speaking OpenAI chat completions, OpenAI responses or Anthropic messages, which covers local Ollama.
- **Each provider card** has a key field, a Test button and a status: Not set, Working, or Failed with the error message.
  - Test makes a one-token request with the provider's default model.
  - Error codes map to plain messages: invalid key, no credit, rate limited, unreachable.
- **Custom provider fields:**
  - Provider ID (lowercase and hyphens, permanent)
  - Base URL
  - Protocol
  - At least one model ID
  - Optional "no key needed" toggle, for local servers. Orb then stores a placeholder key.
- **Model discovery.** The Models screen refreshes configured providers from their authenticated model directories,
  with a Refresh models action on each card. Save successful lists for offline use; a failed refresh keeps the last
  successful list and shows the error. Newly listed IDs must be usable without waiting for a bundled catalog update.
  Preserve saved selections across refresh and restart. Custom discovery uses an explicitly typed draft key or the
  saved key only while its endpoint is unchanged. Dedicated non-chat models are excluded where identifiable.
- **Per-agent picker.** Sets the model for Orb, Scout, Critic and Builder, with sensible defaults per tier and a search
  field for model IDs across providers. A change applies at the next agent step, including existing and reopened conversations; summarization uses the same selected route.
- **Search provider key** for Scout, with a clear message when it is missing.

**Security**

- **Storage.** Keys live in the macOS Keychain, through the `orb-keychain` credential plugin, which replaces the harness's plaintext credentials file.
  - Keys never appear in canvas folders, logs, `orb.json` or exports.
- **Redaction.** The UI only ever receives a redacted descriptor, for example "sk-...4f2a".
- **No restart.** Keys take effect on the next request; the app does not need a restart.

**Cost visibility**

- Each canvas has a token and estimated cost meter, shown in the conversation panel's header menu and on the canvas tile on Home.
- **Tokens** come from the harness's per-session token usage, summed over the root session and its child sessions.
- **Prices** come from a local, editable table in Settings, seeded from the provider catalog's list prices.

## Privacy and telemetry

The desktop privacy rules below also cover the research UI and harness. Owner-authorized website exception
(2026-10-19, P6.43): the separate marketing site uses PostHog page-view analytics only after cookie acceptance,
with remembered Accept/Decline controls and a footer setting to change the choice. Keep this SDK and its
credentials out of the desktop distribution. The site describes orb as open source and discloses its website cookies.

Website support update (2026-10-20, P6.44): add `/security` with accurate local-storage, Keychain and provider
boundaries, and `/report-a-bug` with required submitter email, title and description, optional context and up to
five evidence files / 10 MB total. Send the report and attachments through server-only Resend to the owner's fixed
support inbox, with submitter Reply-To. Preserve drafts/files on failure and reuse the attempt idempotency key.
No automatic diagnostic uploads, browser-exposed mail credentials or persistent server-side upload storage.
The main website navigation contains Workspace (home), Security and Report a bug. The hero has no status
eyebrow. The evidence control explains how to use the macOS file picker to select `sidecar.log` from
`~/Library/Logs/orb/`, supports drag-and-drop and makes clear that a report can be sent without a log.

Nothing leaves the Mac except requests to the model and search providers the user configured, and fetches of URLs the user or Scout chose. The harness ships several default-on paths that Orb must switch off.

| Harness default | Orb setting |
|---|---|
| Session telemetry, `FEEDBACK_ONLY` mode, uploads to `harness-telemetry.deepseeksvc.com` on `/feedback` | Disabled: `DSH_TELEMETRY_DISABLED=1` plus `mode: DISABLED`, and the feedback command is not mounted |
| The plugin-package inventory is attached to every official DeepSeek request | Row disabled |
| An anonymous user ID header is sent on every `deepseek-official` request, and no config turns it off | DeepSeek is routed through the generic `llm-pi-ai` `deepseek` route, and the `deepseek-official` adapter is not used |
| Session-log upload to DeepSeek | Kept disabled |
| Product analytics (desktop profile only) | Not mounted |

The spike gate verifies this with an egress audit: run a full session through a logging proxy, and expect only the configured hosts.

## Local storage and data model

The user's data lives in one folder, by default `~/Orb`. Harness internals live in a private app-support folder.

**Folder layout**

```
~/Orb/                                    user-visible, portable
  orb.json                                app settings (no secrets)
  index.sqlite                            derived search index, safe to delete and rebuild
  canvases/
    2026-10-14-research-canvas-idea/
      canvas.json                         id, title, created, frame order, viewport, template,
                                          harness root session id, agent child ids, instructions
      board.jsonl                         append-only board event log (source of truth)
      board.snapshot.json                 periodic fold of board.jsonl for fast open (derived)
      assets/                             dropped files, screenshots, Builder HTML
        sources/                          cached page and PDF text for agents (never exported in full)
      exports/                            canvas PDFs and research documents
      port/                               research document Markdown, citations JSON, saved instructions

~/Library/Application Support/Orb/
  dsh/                                    DSH_HOME: harness profile, sessions, settings (no keys)
  logs/                                   app logs, no content and no secrets
```

**Data model**

- **The board log is the truth.**
  - The board is the fold of `board.jsonl`. Each line is one event `{v, seq, ts, type, actor, data}`.
  - `actor` is `{kind: 'user'}`, or `{kind: 'agent', agent, model, sessionId, toolCallId}`.
- **Event types:**
  - `frame.added`, `frame.updated`, `frame.removed`
  - `card.added`, `card.moved`, `card.updated`, `card.removed`, `card.stacked`
  - `link.added`, `link.removed`
  - `thread.message`, `card.opened`, `context.changed`, `viewport.saved`
- **One writer.** User actions and agent actions go through the same canvas service, in the harness sidecar, and append the same event types. There is never a second copy of the board.
- **Folding and history.** The UI renders the board by folding events streamed from the canvas service. Undo, replay and "why it's here" all derive from the log.
- **The harness session is the agent's memory.**
  - The model-side conversation lives in the canvas's harness root session and its children, under `DSH_HOME`.
  - It is linked from `canvas.json` and from each card's provenance.
  - Board events never go into harness sessions: the harness refuses to reopen sessions containing unknown event types.
- **Search index.** `index.sqlite` holds a full-text index across all canvases for Home search. It is rebuilt from the board logs when missing.

**Guarantees**

- Closing the app or a crash never loses more than the last second of work. The board log is flushed and fsync'd at least every 250 ms, and on quit.
- The `~/Orb` folder is human-readable and portable. Moving it to another Mac and pointing Orb at it restores every board, thread and export.
  - Agent conversation history does not travel, because it lives in app support. That is acceptable for v0.
- Deleting a canvas moves its folder to the macOS Trash.

## Architecture

Orb is an Electron app. Its main process supervises a harness sidecar running Orb's own `orb` profile. The React UI is served by the harness web gateway and runs in an Electron window on the gateway's origin.

```
┌──────────────────────── Electron app (Orb.app) ────────────────────────┐
│ main process                                                            │
│  • spawns sidecar: <electron as node> dsh/bin.js --profile orb          │
│      --port 0 --no-open, env DSH_HOME=…/Application Support/Orb/dsh,    │
│      DSH_TELEMETRY_DISABLED=1                                           │
│  • reads the "dsh web:" token URL, opens BrowserWindow on it            │
│  • native services via preload IPC: print-to-PDF, capturePage,          │
│    reveal/trash, file dialogs, open external                            │
│  • blocks /api/file and any off-origin navigation (webRequest)          │
│                                                                         │
│ renderer (React UI, served from the sidecar origin)                     │
│  Home · Canvas · Port · Settings                                        │
│  speaks: POST /api/<ns>/<method>  +  WebSocket /api/remote.mux          │
└───────────────┬─────────────────────────────────────────────────────────┘
                │ http://127.0.0.1:<port>  (cookie auth, same origin)
┌───────────────▼──────────── harness sidecar, profile "orb" ─────────────┐
│ dsh-base + web gateway host rows (no dsh browser UI rows)               │
│   agents · subagents · sessions · llm-pi-ai · tools · webserver         │
│ orb-bundle:                                                             │
│   orb-host      @Remote endpoints: canvas cmds, board stream, agent     │
│                 control (stop/pause/resume), keys, cost, ports          │
│   orb-canvas    canvas service, board.jsonl, fold, budgets, layout,     │
│                 board tools for agents                                  │
│   orb-agents    Orb root agent per canvas, Scout/Critic/Builder         │
│                 children, personas, allow-lists, report_progress        │
│   orb-cards     card registry, 11 card host halves, place_card schema   │
│   orb-sources   web_search providers, fetch_url, PDF text, capture_page │
│   orb-port      compose_section, citation validation, doc storage       │
│   orb-keychain  CredentialProvider on the macOS Keychain                │
└───────────────┬─────────────────────────────────────────────────────────┘
                │ HTTPS only to configured model/search providers + fetched URLs
```

**Why this shape**

- **Plugins.** The harness is a plugin tree with no privileged core. Every Orb capability is a Cordis plugin mounted beside the base layer, in its own `orb` profile and its own `DSH_HOME`.
- **No new server.** The web gateway already provides an authenticated loopback server, session prompt, steer, cancel, event streaming and approvals. Orb adds endpoints to it rather than writing a second server.
  - The SDK JSON-RPC wire has no cancel or close.
  - ACP is too thin for this UI.
  - Headless is one-shot.
- **Why Electron.**
  - The gateway rejects requests whose `Origin` is not its own loopback host, so the UI must load from that origin. An Electron window does that directly.
  - Electron also provides `printToPDF` and `capturePage` for Port and Scout.
  - The harness reserves its `desktop` profile for Electron, so Electron is the upstream path.
- **Own board log.** The board needs its own log because harness sessions reject custom event types on reload.
- **Upgrade cost.** All harness-specific code sits in `orb-host`, `orb-agents` and `orb-canvas`, so a harness upgrade touches three packages.

**Repo layout**

```
orb/
  apps/desktop/            Electron main + preload (TypeScript)
  apps/ui/                 React UI (Vite), served by the sidecar
  packages/orb-*/          harness plugins: host, canvas, agents, cards, sources, port, keychain, bundle
  packages/shared/         board event + card schemas, wire types shared by UI and plugins
  profiles/orb/            profile package.json + cordis.patch.yml template
  design/                  prototype and extracted screen markup
  docs/                    PRD, BUILD_PLAN, DSH_DEEP_DIVE
```

**Build rules**

- Pin one harness release: `@deepseek-ai/dsh@0.2.0-rc.2` (the latest rc at time of writing).
- The sidecar runs on Electron's bundled Node (`ELECTRON_RUN_AS_NODE=1`) if that Node is 22.19 or newer. Otherwise ship a pinned Node 22 LTS binary.
- Use pnpm workspaces.
- Touch the harness only through public seams: agents, subagents, tools, sessions, credentials, web gateway remotes, and profile patches.
- No agent preset includes shell, terminal, code, workflow, job or filesystem tools.
- Verify with `--dump-config` that the `orb` profile boots exactly the expected plugin tree, with telemetry rows disabled.

## Design system and visual direction

**User scope update, 2026-10-18 (P6.27):** Orb uses Symplist's six complete styles (Studio, Paper, Pebble, Postcard, Meadow and Tide), with independent preset/custom accent colour and Light/Dark/System brightness. Style includes paired neutral palettes, self-hosted typography, corners, borders and shadows. Flat surfaces replace decorative gradients, blue ambient glows and starfields throughout the app and packaging. The original prototype still guides research interactions and floating layout; its fixed blue/night visual treatment below is historical and superseded by this update.

| Token | Hex | Use |
| --- | --- | --- |
| Night | #03050C | App and canvas background in night mode |
| Ink | #11171D | Cards and panels in night mode, text in day mode |
| Paper | #F9FCFE | Text in night mode, background in day mode, user notes, Critic |
| Rho accent | #3D5DCF | Frames, chips, quiet accents |
| Signal blue | #2563EB | Primary buttons, North star card, Builder, glows |
| Sky | #60A5FA | Labels, links, Scout, live indicators |

**Type.**
- Geist for UI and headings. Headings are 600 to 700 weight with tight tracking.
- Geist Mono for labels such as frame names and badges.
- Fonts are bundled locally; the app does not fetch them from Google Fonts at runtime.

**Canvas look.**
- Night background with a sparse star layer, plus a dot grid (24 px) that moves with pan and scales with zoom.
- One to three large, soft radial glows in Signal blue, Rho accent and Sky.
- Frames are thin-bordered rounded regions (22 px radius) with a numbered mono label.
- Cards use a 14 px radius.

**Motion.**
- Cards fade and scale in when placed, and agent cursors glide.
- Pan and zoom run at 60 fps.
- All motion respects Reduce Motion.

**Day mode.** Paper background with Ink text and Signal blue accents. The saved choice applies to Home, Settings, the canvas, expanded readers, Port and deck editing. The board also has an appearance toggle. (User scope update, 2026-10-17.)

**Accessibility.**
- Text contrast is at least 4.5 to 1, and focus rings are visible.
- The toolbar, chat, composer and settings are fully reachable by keyboard.
- Icon buttons have labels.

## Non-functional requirements

v0 must feel fast and safe on a recent Mac with a board of a few hundred cards.

| Area | Requirement |
| --- | --- |
| Platform | macOS 14 or later, Apple silicon first, Intel if it builds without extra work |
| Startup | Home visible within 2 seconds of launch, including the sidecar boot. If the sidecar is slower, show Home with a "warming up" state |
| Canvas performance | 60 fps pan and zoom with 300 cards. Cards outside the viewport are virtualised, and zoom below 35% renders title-only cards |
| Streaming | First token visible within 1 second of the provider responding |
| Stop | Every agent's UI shows stopped within 1 second. Every agent idle within 1 second for LLM streams and Orb tools, measured and logged on each Stop |
| Durability | No more than 1 second of board work lost on crash or force quit |
| Exports | A 10-frame canvas PDF in under 15 seconds, a research document in under 2 minutes excluding model time |
| Security | No shell or filesystem tools for agents. Board and asset writes only through Orb tools, inside the canvas folder. Design frames sandboxed with no network. Keys in Keychain. `/api/file` blocked. Electron with context isolation, renderer sandbox, no node integration, and a strict CSP |
| Privacy | No telemetry. Only configured providers and fetched URLs receive requests. Verified by an egress audit |
| Offline | Boards open, browse and export offline. Agents need the network unless a local model is configured |
| Packaging | Signed and notarised .app. Auto-update can wait until after v0 |

## Out of scope for v0

These are deliberately left out so v0 can be excellent at the core loop.

- Accounts, cloud sync, share links, public Ports, public boards, and forking boards.
- Real-time collaboration and comments from other people.
- The public, searchable commons of boards.
- Third-party plugin installs and a plugin marketplace. The card plugin interface exists internally only.
- Live market data and ticker cards, which also need data licensing work.
- Persona packs beyond the default research setup and the Home templates.
- Scheduled or background research.
- HTML, Markdown and Word exports. Port exports PDF only in v0.
- Multi-screen interactive design frames.
- Windows, Linux, web and mobile.

**Stretch, only if the core is solid**

- Board replay with a timeline scrubber.
- Focus mode: double-click a frame to read it as a calm page.

## Milestones and acceptance criteria

v0 is built in five phases, roughly ten weeks in total. Each phase closes only when its gate passes. `docs/BUILD_PLAN.md` has the task-level sequence.

| Phase | Weeks | Gate |
|---|---|---|
| 1. Spike | 1–2 | The architecture is proven end to end |
| 2. Board | 3–4 | The board is a real canvas, user-only |
| 3. Agents | 5–6 | Scenario A fills a board |
| 4. Port and models | 7–8 | Exports and keys |
| 5. Ship | 9–10 | v0 done |

**Gate 1, Spike**
- [ ] The `orb` profile boots on the pinned harness inside the Electron app, with its own `DSH_HOME`. `--dump-config` shows dsh-base, the gateway host rows and orb-bundle, with all telemetry rows disabled.
- [ ] The UI, served from the sidecar origin, calls a gateway endpoint and an `orb-host` `@Remote` endpoint.
- [ ] An agent places a card with `place_card`. The card is appended to `board.jsonl` and renders live in the UI.
- [ ] After a kill and relaunch, the board and Orb's session both reopen correctly.
- [ ] Stop from the UI makes the agent idle within one second, and the time is measured.
- [ ] Egress audit: only the configured model host is contacted.
- [ ] The macOS findings (sandbox, Keychain access from the sidecar, Electron's Node version) are written down in `docs/SPIKE_NOTES.md`.

**Gate 2, Board**
- [ ] Pan, zoom, frames, all user card actions, links, notes, undo and redo, and Cmd+F work at 60 fps with 300 generated cards.
- [ ] Reopening a canvas restores the exact board. Crash durability holds at 1 second or less.
- [ ] Home shows recent canvases and search, and new-canvas and drop-to-seed work without agents.

**Gate 3, Agents**
- [ ] Scenario A runs from the Home search box to a filled board with at least three frames.
- [ ] Scout, Critic and Builder each place their card types, with cursors and "why it's here" lines.
- [ ] Threads on cards and frames work, and produce linked cards.
- [ ] Frame budgets hold: no frame exceeds 12 cards without consolidation.
- [ ] Pause, resume, redirect, stop and stop-all work per agent. Stop-all reaches idle within 1 s, measured over 20 runs.

**Gate 4, Port and models**
- [ ] All eleven card types render in a canvas PDF and as figures in a research document.
- [ ] The research document follows custom instructions, and uses the standard format when instructions are empty.
- [ ] Every non-user paragraph in a research document cites at least one in-scope card. This is enforced by `compose_section`.
- [ ] Keys for DeepSeek, Anthropic, OpenAI, OpenRouter and a custom endpoint can be added, tested and used, and live only in the Keychain.
- [ ] Per-agent model choice and the cost meter work.

**Gate 5, v0 done**
- [ ] Tejas runs his next project idea brainstorm in Orb, from start to an exported research document, without falling back to a chat app.
- [ ] The performance targets in Non-functional requirements are met on an Apple silicon Mac.
- [ ] The app is signed and notarised, and installs cleanly on a fresh Mac.

## Risks

The biggest risk is the harness changing under us, followed by agents cluttering the board.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| The harness is a pre-1.0 rc, and APIs changed between 0.1.5 and 0.2.0 | Upgrades break Orb | Pin one version. Keep harness calls in three packages. Upgrade only between phases, with the deep dive re-checked |
| Gateway `@Remote` endpoints from out-of-tree plugins run in the unchecked fallback mode | Weak typing at the boundary | Validate every payload with shared zod schemas in `orb-host`. Fallback: authenticated `ctx.connection.fetch.register` routes plus our own WebSocket upgrade |
| Cancel is cooperative | Stop is slower than 1 s | Every Orb tool honours `exec.signal`. No workflow or job tools. Stop-all is orchestrated and measured |
| Children wake the parent on every message | Token cost, noisy Orb | `report_progress` injects without waking. The child personas send messages only to finish or to ask for a decision |
| Agents overfill frames | The board feels like noise | Budgets enforced in the canvas service, consolidation into stacks, layout engine placement |
| Token cost of several agents per board | Surprise bills | A cheap model for Scout, at most one child per role, a visible cost meter |
| Harness telemetry defaults change in an upgrade | Privacy promise broken | Egress audit in CI on every harness upgrade |
| Copyright of fetched pages | Legal exposure if shared later | The board and exports hold summaries, links and short excerpts only |

## Decisions (formerly open questions)

- **Desktop shell:** Electron, for the reasons above.
- **Canvas renderer:** a custom DOM layer, as in the prototype, with CSS transforms and viewport virtualisation. Not React Flow: frames, budgets and grid layout are core concepts, and a node-graph library would fight them.
- **Scout's search:**
  - Default: DeepSeek built-in search when a DeepSeek key exists.
  - Optional: Brave or Tavily.
  - Fetch-only when neither is available.
- **Design frames:** a single static screen in v0, with scripts allowed for local effects but no navigation.
- **Still open:** the final product name check, Orb, for trademark and domain.
