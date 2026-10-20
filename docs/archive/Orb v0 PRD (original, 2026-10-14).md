# Orb v0, Product Requirements

Oct 14, 2026 · @Fanpit

## Overview

Orb v0 is a standalone, fully local Mac app where research happens on an infinite canvas that AI agents fill as you think together. Chat is the command channel, the canvas is the hero, and every output is a view of the canvas.

**The problem.** AI research tools optimise for the deliverable. A PDF or a page arrives, but the understanding behind it is skipped and the trail of thinking disappears into a chat history.

**The thesis.** The board is the research. The PDF is just a view of it. Every claim in an output traces back to a card, and every card says why it is on the board.

**North star.** Google for research and thinking. The obvious first place someone goes when they want to understand something.

**The v0 acceptance test.** Tejas opens Orb, types his next project idea, and runs the whole brainstorm there instead of in a chat app, from the first question to an exported research document. If that works end to end and feels better than chat, v0 is done.

This PRD is meant to be handed to Claude Code together with the Orb design prototype (Home, Canvas and Port screens). Where the prototype and this document disagree, this document wins on behaviour and the prototype wins on look.

## Goals and non-goals

v0 ships a polished single-user research canvas that runs entirely on the user's Mac with their own model key.

**Goals**

1. A user can go from one question to a well organised board of sources, notes, questions and design frames in one session.
2. The user stays in charge. Agents visibly work, can be stopped at any time, and never bury the board.
3. Every agent-placed card explains why it is there, and every exported claim cites a card.
4. The user can export a canvas PDF or a research document, with every canvas element rendered.
5. Everything lives in a local folder the user owns. No account, no server, no telemetry by default.
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

**Scenario A, new idea brainstorm (the v0 test).** The user types an idea on Home. Orb opens a canvas, proposes frames such as Thesis, Market, Competitors, Prototype and Open questions, and starts Scout and Critic. The user threads on cards, adds notes, asks Builder for a first screen, then composes a research document with an instruction like "write it as a one-page investor memo" and exports a PDF.

**Scenario B, start from material.** The user drops a PDF, a link or a screenshot on Home. Orb opens a canvas with that item as the first card and asks what the user wants to understand about it.

**Scenario C, return to a board.** The user reopens a canvas from last week. The board, threads and chat are exactly as left, the reading queue shows what is still unread, and agents resume only when asked.

## Product principles

When two requirements conflict, these decide.

1. **The canvas is the hero.** Chrome floats, the board fills the window, nothing docks over it permanently.
2. **The board is the source of truth.** Outputs are generated from cards and never edited into a separate copy.
3. **Show the work.** Agents move visibly on the board, every agent card has a "why it's here" line, and every action is in the log.
4. **The user stays in control.** Stop always works within one second. Agents never delete or rewrite user notes.
5. **Quality over quantity.** A frame holds a few excellent cards, not forty mediocre ones.
6. **Local and private by default.** Nothing leaves the Mac except calls to the model and web providers the user configured.
7. **Everything is a plugin.** Card types, agents, sources and exporters are all plugins on the harness, including the ones we ship.

## Screens and information architecture

v0 has four screens. Home, Canvas and Port exist in the prototype. Settings is new and follows the same design system.

**Home**

- Top area shows a mode tagline and three rotating topic words on one line, for example "Kites? Nebula? Ocean?", with the middle word in the accent colour. Words come from a pool of about 24 and rotate every few seconds.
- Night mode tagline "Don't go gentle into the night!" in white. Day mode tagline "Everything the sun touches" in blue. A toggle in the top right switches modes, and the choice persists.
- The search box sits in the vertical centre of the window. Typing and pressing Enter creates a new canvas with that prompt. Dropping a file or link on the box creates a canvas seeded with that item.
- Template chips under the box (Topic deep dive, Company research, GTM, UI research, Stocks) prefill a starting frame layout and agent brief. Stocks ships as a template only, with no live data.
- Recent canvases appear along the bottom as tiles with a mini preview and status, plus local full-text search across all canvases.

**Canvas**

- Infinite board with pan and zoom, frames, cards and links. Details in the Canvas section.
- Floating top-left pill with the Orb mark (links Home), canvas title (editable) and save state.
- Floating top-right actions, Share board is hidden in v0, Publish Port opens the Port composer.
- Floating left toolbar with Select, Note, Frame, Connect and Add card.
- Minimap with zoom out, zoom level (click to reset) and zoom in, bottom left.
- Conversation panel docked in the bottom-right corner as one unit (history, agent activity, context chip and input). It minimises to a pill in the same corner.

**Port**

- A composer sheet with two modes, Canvas PDF and Research document, scope selection, an instructions box and Export. Details in the Port section.
- A reading view for the research document inside the app, with inline editing and per-section regenerate.

**Settings**

- Models, for providers, keys and per-agent model choice.
- Appearance, for night or day and motion reduction.
- Storage, showing the Orb folder location with a button to reveal it in Finder and a button to change it.
- About, with the version of Orb and the pinned harness version.

## Canvas requirements

Every conversation has exactly one canvas, and every change to it, by the user or an agent, is an event in that canvas's log.

**Navigation**

- Infinite board. Drag on empty space or hold Space and drag to pan. Trackpad scroll pans. Pinch, or Cmd and scroll, zooms toward the cursor.
- Zoom range 25% to 250%. Zoom to fit, zoom to selection and reset to 100% are available from the minimap and the keyboard.
- The minimap shows frames in their colours and the current viewport, and is clickable to jump.
- Floating UI stays fixed while the board moves underneath.

**Frames**

- Frames are titled, numbered regions (01 THESIS, 02 HARNESS and so on) with one of the palette tones.
- Both the user and agents can create, rename, resize and recolour frames.
- Each frame has a card budget, 12 by default. When an agent would exceed it, the agent must summarise and collapse older cards into a stack instead of adding more.
- A frame can be put "in context", which pins it to the conversation as a chip so the next agent request includes its cards.

**Cards**

- Cards can be placed, moved, resized, grouped, multi-selected and deleted.
- Agent cards show the agent's colour and a "why it's here" line. Hovering shows which agent added it and when.
- User notes are visually distinct (Paper card) and are never edited or deleted by agents.
- Any card or frame can open a thread (see Chat and threads).

**Links**

- Links connect two cards or frames, with a type from supports, contradicts, tension, leads to, example of, or a free label.
- Tension and contradicts links use the dashed accent style from the prototype.

**Adding content**

- Drag and drop from Finder or a browser, files (PDF, PNG, JPG, GIF, WebP, CSV, Markdown, plain text) and URLs.
- Paste an image or URL directly onto the board.
- Double-click empty space to create a note.

**Reading queue**

- A frame-like panel listing cards marked Must read or Skim, with a tick when the user has opened a card.
- Before composing a Port, Orb warns if Must read cards inside the selected scope are unopened.

**History**

- Unlimited undo and redo for user actions in the session, derived from the log.
- Card drags are batched into one move event on release.

**Search on the board**

- Cmd and F searches card text on the current canvas and flies to results.

## Card types and the card plugin contract

v0 ships eleven card types, and each one is a plugin that implements the same five-part contract.

**The contract.** Every card plugin must define all five, or it does not ship.

1. **Render.** The React component shown on the canvas, at three zoom levels (full, compact, title only).
2. **Data.** Its schema and source (static, fetched once, or captured from a file).
3. **Agent tools.** The tools agents use to create, update and query it.
4. **Describe.** A plain-text description of its content that agents read, so an agent can reason about a chart or a mockup, not just place it.
5. **Print.** How it renders in a PDF, both on a canvas PDF page and as a figure in a research document.

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

- Any card that can change over time prints as a snapshot labelled with the date and time it was captured.
- Design frames run in a sandboxed iframe with no network access and no access to the canvas folder outside their own asset.
- Source cards keep only the link, the agent's summary and short excerpts. Full page text is cached locally for the agents to read but never placed on the board or exported in full.

## Agents

v0 has one main agent the user talks to and three subagents that work on the board, each with its own colour, cursor, model route and tool set.

| Agent | Colour | Job | Tools | Default model tier |
| --- | --- | --- | --- | --- |
| Orb | Signal blue mark | Talks with the user, plans frames, delegates, composes outputs | Canvas tools, subagent control, compose | Strongest configured |
| Scout | Sky #60A5FA | Searches the web, reads pages and PDFs, places source and quote cards | Web search, fetch, PDF read, screenshot, canvas write | Fast and cheap |
| Critic | Paper #F9FCFE | Finds contradictions, weak claims and gaps, pins questions and risks, draws tension links | Canvas read, canvas write (questions, risks, links only) | Strongest configured |
| Builder | Signal blue #2563EB | Makes design frames (HTML mockups) and diagrams | Canvas write, asset write (HTML, Mermaid) | Strong, vision capable if available |

**Behaviour rules**

- On a new canvas, Orb proposes three to five frames for the question, places them, and starts Scout and Critic unless the user says otherwise.
- Subagents are long-lived and scoped to a frame. Their context is the frame's cards plus the instruction Orb gave them.
- Subagents return cards as structured output that matches the card schemas, never prose that needs parsing.
- Subagents report progress quietly to Orb (shown in the activity list) and only wake Orb when they finish or need a decision.
- Each agent shows a live cursor with a short status label, for example "Scout, reading docs".
- The user can pause, resume, redirect or stop any single agent, or all agents, from the conversation panel.
- No agent has shell access. The only writable location is the current canvas folder.
- Agents never modify or delete user notes. Agents may only delete cards they created, and only when consolidating within a frame budget.
- Each agent card records the model, the tool calls and the session log position that produced it, which powers the "why it's here" detail view.

## Chat and threads

The corner conversation is the command channel for the whole canvas, and threads are scoped conversations about one card or frame.

**Conversation panel**

- Docked bottom right, 380 by 520 points by default, resizable, minimisable to a pill that shows active agent count.
- Streams responses token by token. A Stop button replaces Send while anything is running and halts all agents within one second.
- Shows an "On the board" activity group under agent turns, listing what each agent added, linked to the cards.
- A context chip above the input shows which frames or cards are in context. @ mentions add a card or frame to context.
- Enter sends, Shift and Enter adds a new line, Up edits the last message.
- Compose button opens the Port composer.

**Threads**

- Any card or frame has a Thread button. Opening it shows a popover anchored to the card with its own messages and input.
- Thread requests inject that card's content into Orb's next request, so answers stay grounded in the card.
- A thread can produce new cards, which are placed next to the card it belongs to and linked to it.
- Cards with threads show a reply count. Threads persist with the canvas.

**Notes on cards**

- The user can attach a short note to any card (shown as a small Paper tab on the card), separate from threads. Notes count as user content in exports.

## Port

In v0 a Port is one of two things, a canvas PDF or a research document, and every canvas element must render in both.

**Composer**

- Opened from Publish Port or the Compose button.
- Choose the mode, Canvas PDF or Research document.
- Choose the scope, whole board or selected frames (frames can be ticked in a list or selected on the board).
- Warns about unread Must read cards in scope, with Open and Continue anyway options.

**Mode 1, Canvas PDF**

- A visual export of the board itself.
- Layout options, one page per frame, or one poster page for the whole board.
- Theme options, as on screen (night) or print-friendly light. Light is the default.
- Cards, links, labels and colours render as on screen. Source URLs stay clickable.
- Design frames and diagrams render as high-resolution images or vector graphics.
- Footer on each page with canvas title, frame name, export date and page number.

**Mode 2, Research document**

- Orb writes a document only from the cards in scope.
- An instructions box lets the user steer structure, tone and length, for example "write it as an investor memo", "under three pages" or "focus only on the GTM frames".
- If the box is empty, the standard format applies, title, short summary, one section per frame in board order, open questions, and a numbered source list.
- Claims carry numbered citations linking to source cards and URLs. A claim that cannot be traced to a card is not allowed in the output.
- Canvas elements appear as numbered figures, tables and quotes with captions, in the section where they are discussed.
- The document opens in a reading view in the app. The user can edit text inline and regenerate any single section.
- Instructions are saved with the canvas and reused on regenerate.
- Export as PDF. The document is stored as Markdown under the hood so editing and regenerating stay simple.

**Saving**

- Every export is written to the canvas's exports folder with a timestamped file name, and the app offers Reveal in Finder.

## Models and API keys

The user brings their own model key, added in Settings, and nothing works until at least one provider is configured.

**First run**

- On first launch, before Home, a short setup sheet asks the user to add a key. DeepSeek is preselected with a link to get a key. Skipping is allowed, but the search box then explains a key is needed.

**Models screen**

- Provider cards for DeepSeek (default), Anthropic, OpenAI, OpenRouter, and Custom (any OpenAI-compatible endpoint, which covers local Ollama).
- Each card has a key field, a Test button that makes a one-token request, and a status (Not set, Working, Failed with the error message).
- Custom provider fields are Provider ID (lowercase, permanent), Base URL, protocol (OpenAI chat completions) and at least one model ID. Model lists are discovered from the provider where supported.
- A per-agent picker sets the model for Orb, Scout, Critic and Builder, with sensible defaults per tier.
- Web search provider key (for Scout), with a clear message if missing. Fetching URLs the user drops works without it.

**Security**

- Keys are stored in the macOS Keychain through a small Orb credential plugin for the harness. Keys never appear in canvas folders, logs or exports.
- The UI only ever receives a redacted descriptor, for example "sk-...4f2a".
- Keys take effect without restarting the app.

**Cost visibility**

- A token and estimated cost meter per canvas, shown in the conversation panel header menu and on the canvas tile on Home. Prices come from a local table the user can edit.

## Local storage and data model

Everything is stored on the user's Mac in one folder, by default `~/Orb`, and the canvas session log is the single source of truth for each board.

**Folder layout**

```
~/Orb/
  orb.json                 app settings (no secrets)
  index.sqlite             derived search index, safe to delete and rebuild
  canvases/
    2026-10-14-research-canvas-idea/
      canvas.json          title, created date, frame order, viewport, template
      session/             harness session log for this canvas (append-only)
      assets/              dropped files, screenshots, cached pages, Builder HTML
      exports/             canvas PDFs and research documents
      port/                research document Markdown and saved instructions
```

**Data model**

- One canvas equals one root harness session. Subagents are child sessions of it.
- Board state is a set of custom session events, for example `orb/frame.added`, `orb/card.added`, `orb/card.moved`, `orb/card.updated`, `orb/card.removed`, `orb/link.added`, `orb/thread.message` and `orb/viewport.saved`.
- The UI renders the board by folding these events. Undo, replay, "why it's here" and future forking all derive from the log.
- User actions and agent actions go through the same canvas service and append the same event types, so there is never a second copy of the board.
- `index.sqlite` holds a full-text index across all canvases for Home search, rebuilt from the logs when missing.

**Guarantees**

- Closing the app or a crash never loses more than the last second of work.
- The folder is human-readable and portable. Moving it to another Mac and pointing Orb at it restores every canvas.
- Deleting a canvas moves its folder to the macOS Trash.

## Architecture on DeepSeek Harness

Orb ships as its own harness profile, orb, made of the shared base layer plus an Orb bundle of plugins, and the Mac app talks to it through our own local server plugin.

&#91;embedded content: Orb architecture · app, orb profile, storage and providers\]

The app never touches the log directly. It sends commands to orb-server and renders whatever events come back, so agents and the user always edit the same board.

**Why this shape**

- The harness is a plugin tree with no privileged core, so every Orb capability is a plugin mounted beside the base layer.
- The headless profile is one-shot and fails closed without an approval channel, so it suits background jobs, not the live canvas.
- The SDK JSON-RPC wire currently has no per-session close or prompt-cancel, which Orb needs constantly. Our own orb-server plugin drives the agents service directly and owns stop and interrupt.
- The session log is the source of what the model sees, and supports fork and resume. Storing the board as custom session events gives undo, replay and provenance for free.
- The subagent seam supports continuable children with personas, tool filters, output schemas and quiet reports, which map directly to Scout, Critic and Builder.

**Plugins in the Orb bundle**

| Package | Responsibility |
| --- | --- |
| orb-canvas | Canvas service, canvas tools for agents, custom `orb/*` session events, frame budgets |
| orb-server | Local WebSocket bridge, event streaming, commands, stop and interrupt |
| orb-agents | Presets for Orb, Scout, Critic and Builder, model routes, personas, tool filters |
| orb-cards | The eleven card plugins and the five-part card contract |
| orb-sources | Web search, URL fetch and cache, PDF text extraction, page screenshots |
| orb-port | Canvas PDF and research document generation, print pipeline |
| orb-keychain | Credential provider that stores keys in the macOS Keychain |
| orb-bundle | Wires the above into one installable bundle for the orb profile |

**Repo layout**

```
orb/
  apps/desktop/        Tauri shell and React UI
  packages/            orb-canvas, orb-server, orb-agents, orb-cards,
                       orb-sources, orb-port, orb-keychain, orb-bundle
  profiles/orb/        profile manifest, pinned harness version, patch file
```

**Build rules for Claude Code**

- Pin one harness release candidate and Node 22.19 or newer. Use pnpm, which the harness needs for plugin management.
- Touch the harness only through public seams (agents, tools, sessions, subagents, credentials). All harness-specific code lives in orb-server and orb-canvas so an upgrade touches two packages.
- Filter out shell and terminal tools for every Orb agent preset. Set each canvas folder as the agent workspace.
- Verify with `--dump-config` that the orb profile boots the expected plugin tree.

## Design system and visual direction

Orb uses only the Winsen Rho palette with Geist type, in a dark, spacious canvas with a starfield and soft blue glows. The prototype is the reference for look and feel.

| Token | Hex | Use |
| --- | --- | --- |
| Night | #03050C | App and canvas background in night mode |
| Ink | #11171D | Cards and panels in night mode, text in day mode |
| Paper | #F9FCFE | Text in night mode, background in day mode, user notes, Critic |
| Rho accent | #3D5DCF | Frames, chips, quiet accents |
| Signal blue | #2563EB | Primary buttons, North star card, Builder, glows |
| Sky | #60A5FA | Labels, links, Scout, live indicators |

**Type.** Geist for UI and headings (headings 600 to 700 with tight tracking), Geist Mono for labels such as frame names and badges.

**Canvas look.** Night background with a sparse star layer and a dot grid that moves with pan and scales with zoom. One to three large, soft radial glows in Signal blue, Rho accent and Sky. Frames are thin-bordered rounded regions with a numbered mono label.

**Motion.** Cards fade and scale in when placed. Agent cursors glide. Pan and zoom run at 60 fps. All motion respects Reduce Motion.

**Day mode.** Paper background with Ink text and Signal blue accents. v0 ships day mode for Home and Settings. The canvas and reading view support it if time allows, otherwise they stay night only.

**Accessibility.** Text contrast at least 4.5 to 1, visible focus rings, full keyboard reach for toolbar, chat, composer and settings, and labels on icon buttons.

## Non-functional requirements

v0 must feel fast and safe on a recent Mac with a board of a few hundred cards.

| Area | Requirement |
| --- | --- |
| Platform | macOS 14 or later, Apple silicon first, Intel if it builds without extra work |
| Startup | Home visible within 2 seconds of launch |
| Canvas performance | 60 fps pan and zoom with 300 cards, virtualise off-screen cards |
| Streaming | First token visible within 1 second of the provider responding |
| Stop | All agents halted within 1 second of pressing Stop |
| Durability | No more than 1 second of work lost on crash or force quit |
| Exports | A 10-frame canvas PDF in under 15 seconds, a research document in under 2 minutes excluding model time |
| Security | No shell for agents, writes limited to the canvas folder, design frames sandboxed with no network, keys in Keychain |
| Privacy | No telemetry by default. Only configured model and search providers receive data |
| Offline | Boards open, browse and export offline. Agents need the network unless a local model is configured |
| Packaging | Signed and notarised .app, auto-update can wait until after v0 |

## Out of scope for v0

These are deliberately left out so v0 can be excellent at the core loop.

- Accounts, cloud sync, share links, public Ports, and forking other people's boards.
- Real-time collaboration and comments from other people.
- The public, searchable commons of boards.
- Third-party plugin installs and a plugin marketplace. The card plugin interface exists internally only.
- Live market data and ticker cards, which also need data licensing work.
- Persona packs beyond the default research setup and the Home templates.
- Scheduled or background research through the headless profile.
- HTML, Markdown and Word exports. Port exports PDF only in v0.
- Windows, Linux, web and mobile.

**Stretch, only if the core is solid**

- Board replay with a timeline scrubber.
- Focus mode, double-click a frame to read it as a calm page.
- Day mode on the canvas and reading view.

## Milestones and acceptance criteria

v0 is built in four phases of roughly nine weeks total, and each phase closes only when its gate passes.

&#91;embedded content: v0 roadmap · four phases, four gates\]

The spike is the real test of the architecture. If an agent can place a card through our own tool and event, and the user can stop it from the UI, everything after is adding plugins.

**Gate 1, Spike**

- [ ] orb profile boots on a pinned harness release, and `--dump-config` shows the Orb bundle.
- [ ] One canvas tool and one custom `orb/card.added` event work end to end.
- [ ] The Tauri app renders a card placed by an agent, live.
- [ ] Stop from the UI halts the agent within one second.
- [ ] The macOS sandbox behaviour is confirmed and written down.

**Gate 2, Core loop**

- [ ] Scenario A runs from the Home search box to a filled board with at least three frames.
- [ ] Scout, Critic and Builder each place their card types, with cursors and "why it's here" lines.
- [ ] Threads on cards and frames work and produce linked cards.
- [ ] Frame budgets hold, no frame exceeds 12 cards without consolidation.
- [ ] Undo, redo and reopening a canvas restore the exact board.

**Gate 3, Port and models**

- [ ] All eleven card types render in a canvas PDF and as figures in a research document.
- [ ] Research document follows custom instructions, and the standard format when instructions are empty.
- [ ] Every claim in a research document has a citation that resolves to a card.
- [ ] Keys for DeepSeek, Anthropic, OpenAI, OpenRouter and a custom endpoint can be added, tested and used, and live only in the Keychain.
- [ ] Per-agent model choice and the cost meter work.

**Gate 4, v0 done**

- [ ] Tejas runs his next project idea brainstorm in Orb from start to an exported research document, without falling back to a chat app.
- [ ] Performance targets in Non-functional requirements are met on an Apple silicon Mac.
- [ ] The app is signed, notarised and installs cleanly on a fresh Mac.

## Risks and open questions

The biggest risk is the harness changing under us, followed by agents cluttering the board.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| DeepSeek Harness is a developer preview with breaking changes expected | Upgrades break Orb | Pin one release candidate, keep all harness calls behind a thin adapter in orb-server and orb-canvas |
| macOS sandbox backend for the harness is unverified | Agents cannot run confined | Agents have no shell anyway. Verify in the spike, fall back to tool-level restriction to the canvas folder |
| Agents overfill frames | The board feels like noise | Frame budgets, consolidation into stacks, quality checks before placing a card |
| Token cost of several agents per board | Surprise bills | Cheap model for Scout, tool filters per agent, visible cost meter |
| AI layout of cards looks messy | Weak first impression | Agents choose a frame, the layout engine positions cards inside it on a grid |
| Copyright of fetched pages | Legal exposure if shared later | Board and exports hold summaries, links and short excerpts only |

**Open questions**

- [ ] Which web search provider ships as the default for Scout, and is there a free tier for first-run?
- [ ] Canvas renderer, custom DOM layer as in the prototype, or React Flow as a base?
- [ ] Tauri with a bundled Node sidecar, or Electron, for the first build?
- [ ] Should design frames support simple interactions (clicks between screens) in v0, or static screens only?
- [ ] Final product name check, Orb, for trademark and domain.
