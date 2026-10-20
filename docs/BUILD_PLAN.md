# Orb v0 Build Plan

This file is the executable plan for building Orb v0. An agent working from a fresh clone should be able to build the whole
app from it.

| Document | What it covers |
|---|---|
| `docs/PRD.md` | Product behaviour |
| `docs/DSH_DEEP_DIVE.md` | What the harness really does, with file paths |
| `design/` | The prototype screens and visual reference |

**Precedence when they disagree:**
1. PRD wins on behaviour.
2. The prototype wins on look.
3. The deep dive wins on harness facts.
4. This plan wins on sequence and structure.

**How to work this plan**

- **Order.** Work phase by phase, in task order. Each task lists **Depends on**, **Do**, **Files** and **Done when**.
  - A task is not done until its "Done when" checks pass and its tests are green.
  - A phase is not done until its **Gate** passes.
- **Tracking.** Keep `docs/PROGRESS.md` updated after every task: task id, status, date, notes, deviations.
- **Recording discoveries.** Write every surprising harness behaviour to `docs/SPIKE_NOTES.md` (Phase 1), or to `docs/HARNESS_NOTES.md` (later phases).
  - Include the file path in `node_modules/@deepseek-ai/...` that proves it.
- **Unverified APIs.** Harness APIs named here come from the deep dive, which audited **0.1.5-rc.2**. We pin **0.2.0-rc.2**, so verify each one in `node_modules` before relying on it.
  - When a name or shape differs, follow the code.
  - Record the difference in the notes and keep going.
  - Stop only if a **Gate** criterion becomes impossible. Then document why, plus the best alternative, in `PROGRESS.md`.
- **Commits.**
  - One commit per task: `P1.3: orb-canvas board log + fold`.
  - Never commit secrets, `.env` files, `DSH_HOME` contents or user canvases.

---

## 0. Stack

| Layer | Choice | Version policy |
|---|---|---|
| Harness | `@deepseek-ai/dsh` **0.2.0-rc.2** (+ all `@deepseek-ai/*` it pulls in) | Exact pin, no caret |
| Desktop shell | Electron | Latest stable at setup (44.x on 2026-10-14). Exact pin |
| Sidecar runtime | Electron's Node via `ELECTRON_RUN_AS_NODE=1` | Must be Node ≥ 22.19 (the dsh bin uses `import.meta.main`). If it's lower, bundle a Node 22 LTS binary |
| Language | TypeScript, ESM everywhere | Standard (TC39) decorators. dsh's `@Remote` is a standard decorator; do **not** enable `experimentalDecorators` |
| Package manager | pnpm workspaces (pnpm 10) | `packageManager` field pinned |
| Electron build | electron-vite (main, preload, renderer config) + electron-builder (sign, notarise, dmg) | Latest stable |
| UI | React 19 + Vite | Latest stable |
| UI state | Zustand (board store fed by the event fold) | Latest stable |
| Styling | CSS Modules + CSS custom properties for tokens. Geist + Geist Mono bundled from `@fontsource` | No Tailwind; the prototype is hand-styled |
| Validation | zod 4, in `packages/shared`, used by the UI and plugins | — |
| Plugin build | tsup (esbuild), ESM output, per package | — |
| PDF text | `pdfjs-dist` (Node legacy build) in the sidecar | — |
| HTML → Markdown | `@mozilla/readability` + `linkedom` + `turndown` | — |
| Diagrams | `mermaid` (renderer, renders to SVG) | — |
| Keychain | `@napi-rs/keyring` (N-API, prebuilt darwin-arm64/x64) | — |
| Search index | `node:sqlite` (FTS5) in the sidecar. Fall back to `better-sqlite3` only if FTS5 is missing | — |
| Tests | Vitest (unit + plugin integration), Playwright for Electron (e2e) | — |
| Lint/format | ESLint (flat config) + Prettier | — |

**Do not add:** Tauri, React Flow, Tailwind, Redux, any telemetry or crash-reporting SDK, or any network call that isn't to a
configured provider.

---

## 1. Repository layout (target)

```
orb/
  package.json                      workspace root: scripts, packageManager, engines
  pnpm-workspace.yaml
  tsconfig.base.json
  CLAUDE.md                         agent working rules (read first)
  apps/
    desktop/                        Electron main + preload
      src/main/index.ts             app lifecycle, window, menu
      src/main/sidecar.ts           spawn/supervise dsh, parse "dsh web:" URL, restart policy
      src/main/dshHome.ts           DSH_HOME bootstrap: profile dir, settings, patch
      src/main/security.ts          webRequest blocks, navigation guards, CSP
      src/main/native.ts            printToPDF, capturePage, reveal, trash, dialogs (IPC handlers)
      src/preload/index.ts          contextBridge: window.orbNative
      electron-builder.yml
    ui/                             React app, built to apps/ui/dist, served by the sidecar
      src/main.tsx
      src/wire/                     gateway client: unary POST + remote.mux WebSocket
      src/store/                    zustand stores (board fold, agents, session stream, settings)
      src/screens/Home/  Canvas/  Port/  Settings/  FirstRun/
      src/canvas/                   renderer: world transform, virtualisation, frames, links, cursors
      src/cards/                    card UI halves (render x3 LOD + print), registry
      src/print/                    print routes for canvas PDF + research doc
      src/theme/tokens.css          design tokens (PRD Design system)
  packages/
    shared/                         zod schemas: board events, cards, wire payloads, agent roles
    orb-host/                       @Remote endpoints (TypertRemoteService), payload validation
    orb-canvas/                     canvas service, board.jsonl, fold, budgets, layout, board tools
    orb-agents/                     root/child agents, personas, allow-lists, report_progress, stop orchestration
    orb-cards/                      card host halves + registry
    orb-sources/                    search providers, fetch_url, pdf text, capture_page bridge, read_source
    orb-port/                       compose_section, citations, port storage
    orb-keychain/                   CredentialProvider over Keychain
    orb-bundle/                     package.json dsh.bundle + cordis.patch.yml wiring all of the above
  profiles/orb/                     template profile package.json + cordis.patch.yml
  design/                           prototype (read-only reference)
  docs/                             PRD, BUILD_PLAN, DSH_DEEP_DIVE, PROGRESS, SPIKE_NOTES
  scripts/                          dev helpers (dump-config, egress-audit, seed-board)
```

**Root scripts** (`package.json`):

| Script | Does |
|---|---|
| `dev` | Builds plugins in watch mode, Vite dev for the UI, Electron in dev |
| `build` | All packages, then the UI, then Electron |
| `test` | Vitest across the workspace |
| `e2e` | Playwright Electron tests |
| `dump-config` | Prints the composed `orb` profile |
| `egress-audit` | Runs a scripted session through a logging proxy and fails on unexpected hosts |
| `dist` | electron-builder |

---

## 2. Core contracts (define these first, in `packages/shared`)

### 2.1 Board event (one line of `board.jsonl`)

```ts
type Actor =
  | { kind: 'user' }
  | { kind: 'agent'; agent: 'orb' | 'scout' | 'critic' | 'builder'; model: string; sessionId: string; toolCallId?: string };

type BoardEvent = {
  v: 1;
  seq: number;          // contiguous from 0 per canvas
  ts: number;           // ms epoch
  type:
    | 'frame.added' | 'frame.updated' | 'frame.removed'
    | 'card.added' | 'card.moved' | 'card.updated' | 'card.removed' | 'card.stacked'
    | 'link.added' | 'link.removed'
    | 'thread.message' | 'card.opened' | 'context.changed' | 'viewport.saved'
    | 'undo.marker';    // groups compensating events for redo bookkeeping
  actor: Actor;
  data: unknown;        // validated by a per-type zod schema
};
```

**Rules**
- **Single writer.** Only the canvas service writes events; the UI never appends directly.
- **Compensating events.** Undo appends compensating events: it never rewrites the log.

### 2.2 Card

```ts
type Card = {
  id: string;                       // 'c_' + ulid
  type: CardType;                   // 'note'|'source'|'quote'|'image'|'file'|'question'|'risk'|'design'|'diagram'|'table'|'doc'
  frameId: string | null;
  x: number; y: number; w: number; h: number;   // board coords, set by layout engine for agent cards
  data: unknown;                    // per-type zod schema from the card registry
  why?: string;                     // required for agent cards, ≤ 140 chars
  badge?: 'must' | 'skim';
  provenance: Actor & { at: number };
  opened?: boolean;
  note?: string;                    // user note tab
  stackedInto?: string;             // id of the stack card when consolidated
};
```

### 2.3 Wire

The UI talks to the sidecar over two transports.

| Transport | Used for | Shape |
|---|---|---|
| Harness gateway, existing endpoints | Sessions | `POST /api/session/<method>`, the `remote.mux` stream and `$events` (deep dive §6) |
| Orb endpoints, in `orb-host` | Everything Orb-specific | One Remote namespace `orb` (`POST /api/orb/<method>`). Streams are `@Remote({mode:'stream'})` |

**`orb-host` endpoints**

| Group | Method | Kind |
|---|---|---|
| Canvases | `canvas.list` | unary |
| | `canvas.create({prompt, template?, seed?})` | unary |
| | `canvas.open(id)` | unary |
| | `canvas.rename` | unary |
| | `canvas.trash` | unary |
| | `canvas.search(q)` | unary |
| Board | `board.follow(canvasId)` | **stream** of `BoardEvent`s, from a snapshot seq |
| | `board.command(canvasId, Command)` | unary. User commands: add/move/update/remove, link, thread, undo, redo |
| Agents | `agents.status(canvasId)` | **stream** of per-agent state, cursor and progress |
| | `agents.control(canvasId, {agent \| 'all', action: 'pause'\|'resume'\|'stop'\|'redirect', text?})` | unary |
| Chat | `chat.send(canvasId, {text, context, threadOf?})` | unary. Wraps a session prompt with context injection |
| Keys | `keys.describe` | unary. Returns redacted descriptors |
| | `keys.set` | unary |
| | `keys.unset` | unary |
| | `keys.test(provider)` | unary |
| Models | `models.discover(provider)` | unary |
| | `models.assign({agent, provider, model})` | unary |
| Cost | `cost.get(canvasId)` | unary |
| | `prices.get` | unary |
| | `prices.set` | unary |
| Port | `port.compose(canvasId, {mode, scope, instructions})` | **stream** of progress |
| | `port.regenerateSection` | unary |
| | `port.saveDoc` | unary |
| | `port.get` | unary |
| Settings | `settings.get` | unary |
| | `settings.set` | unary. Writes `orb.json` |

**Validation.** Every payload is validated with zod in `orb-host`, because out-of-tree remotes run in the gateway's unchecked "SRC" fallback.

### 2.4 Agent roles and allow-lists

| Agent | Allowed tools (exact names, nothing else) |
|---|---|
| Orb | `query_board`, `place_card`, `update_card`, `add_frame`, `update_frame`, `add_link`, `delegate`, `message_agent`, `stop_agent`, `compose_section`, `read_source`, `ask_user_question` |
| Scout | `web_search`, `fetch_url`, `read_source`, `capture_page`, `query_board`, `place_card`, `add_link`, `consolidate_cards`, `report_progress`, `send_message` |
| Critic | `query_board`, `read_source`, `place_card`, `add_link`, `consolidate_cards`, `report_progress`, `send_message` |
| Builder | `query_board`, `write_design_frame`, `place_card`, `consolidate_cards`, `report_progress`, `send_message` |

**Card-type permissions.** Enforced inside `place_card` by agent role, not only by prompts.

| Role | May place |
|---|---|
| Scout | source, quote, image |
| Critic | question, risk |
| Builder | design, diagram, table |
| Orb | any card except note |

**Agents never get:**
- `bash`, `pwsh`, `run_code`
- `workflow`, `ralph`
- `job_*`, `cordis_*`
- `read`, `write`, `edit`, `glob`, `grep`
- the generic `subagent` and `subagent_fork`, plus any harness tool not listed in the allow-list table above

**Defence in depth.** A `ctx.tools.guard` in `orb-agents` denies any tool call whose name is not in the caller's allow-list.

---

## Phase 1, Spike (weeks 1–2)

**Goal.** Prove every risky seam end to end with the thinnest possible code. Do not polish the UI.

**P1.0 Verify the pinned harness and set up the notes**
- **Depends on:** nothing.
- **Do:**
  1. Install `@deepseek-ai/dsh@0.2.0-rc.2` in the workspace.
  2. Re-check every deep-dive claim that later phases rely on, against `node_modules/@deepseek-ai/*`:
     - the agents API: `create`, `cancel`, `whenIdle`, `inject`
     - `subagents.startContinuable`, `sendMessage`, `interrupt`
     - `tools.register`, `tools.guard`, `tools.restrict`
     - preset packages (renamed in 0.2: `dsh-agent-preset`, `dsh-agent-preset-registry`)
     - the `CredentialProvider` shape
     - `TypertRemoteService` / `@Remote`
     - `host-frontend-static` `distIndex`
     - the token-usage projection
     - the telemetry rows: `session-telemetry-otel`, `plugin-package-inventory-deepseek`, `desktop-product-telemetry`, `product-analytics`
     - the `dsh-llm-pi-ai` DeepSeek route
  3. Record the actual names and signatures.
- **Files:** `docs/SPIKE_NOTES.md` (one section per seam: expected, actual, path).
- **Done when:** every seam is marked ✅ or ⚠️, and each ⚠️ has a written workaround.

**P1.1 Workspace scaffold**
- **Depends on:** nothing.
- **Do:**
  - Create the pnpm workspace, `tsconfig.base.json`, ESLint, Prettier, Vitest and root scripts.
  - Create empty packages from §1, each with tsup building ESM `lib/index.js`.
  - Add `packages/shared` with the zod schemas from §2.
- **Done when:** `pnpm i && pnpm build && pnpm test` pass on a clean clone.

**P1.2 Orb profile and DSH_HOME bootstrap**
- **Depends on:** P1.0, P1.1.
- **Do:**
  1. **orb-bundle.** In `packages/orb-bundle/package.json` set `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}`, and export `./cordis.patch.yml` and `./package.json` (copy the shape of `dsh-base/package.json`).
  2. **Bundle patch.** It inserts the `orb-*` plugin rows. It also does the following:
     - **Telemetry off.** Disables `session-telemetry-otel` (or sets `mode: DISABLED`), `plugin-package-inventory-deepseek`, the feedback command, and any product-telemetry or analytics rows.
     - **Permissions.** Sets the permission mode to `workspace-write` with approval `never`.
     - **Sidecar UI.** Sets `host-frontend-static` `distIndex` to the Orb UI's `index.html`. The path is passed in by env: `ORB_UI_DIST`.
     - **No dsh browser UI.** Disables every dsh browser client row (`dsh.client` / `ui-*` rows), so the dsh UI never injects into Orb's index.
  3. **Config replaces whole.** Patch `config` replaces the row's config wholesale, so restate every key you keep.
  4. **Profile template.** Create `profiles/orb/package.json` with `"dsh": {"profile": {"bundles": [...], "patchReload": "startup"}}`.
     - **Bundles, in order:** `@deepseek-ai/dsh-base`, then the gateway: `@deepseek-ai/dsh-web-app` with its UI rows disabled. If you can't disable them cleanly, list only its host rows in orb-bundle instead. Then `@orb/bundle`.
  5. **DSH_HOME bootstrap.** Write `apps/desktop/src/main/dshHome.ts`:
     - **Where:** dev: `<repo>/.orb-dev/dsh`. Production: `~/Library/Application Support/Orb/dsh`.
     - **What:** copy the profile template into `DSH_HOME/profiles/orb/`, and make `@orb/bundle` resolvable.
       - **First try:** a hoisted dependency next to dsh. The harness resolves bundles from its own install first.
       - **Fallback:** symlink into `profiles/orb/node_modules`.
     - **Settings:** write `DSH_HOME/settings.yaml` with the `llm-pi-ai` DeepSeek route and the default model.
  6. **dump-config script.** Add `scripts/dump-config.ts`: run `node node_modules/@deepseek-ai/dsh/lib/bin.js --profile orb --dump-config` with `DSH_HOME` set.
- **Done when:** `pnpm dump-config` shows dsh-base, the gateway rows and every orb row, with no telemetry row enabled and no dsh `ui-*` row enabled. Commit the dump output as `docs/spike/orb-dump-config.yml`.

**P1.3 Sidecar supervisor**
- **Depends on:** P1.2.
- **Do:** In `apps/desktop/src/main/sidecar.ts`:
  1. **Spawn.** Run `process.execPath` with `ELECTRON_RUN_AS_NODE=1`, `.../dsh/lib/bin.js --profile orb --port 0 --no-open`.
     - Env: `DSH_HOME`, `DSH_TELEMETRY_DISABLED=1`, `ORB_UI_DIST`, `ORB_HOME` (default `~/Orb`).
  2. **Parse the URL.** Read the `dsh web:` URL line (check whether it comes on stdout or stderr), then hold the URL in memory only. Never log it.
  3. **Restart policy.** If the sidecar crashes, restart up to 3 times in 60 s with backoff, then show an error window with the log path.
  4. **Quit.** On app quit, send SIGTERM and wait up to 6 s; dsh disposes itself within a 5 s hard timeout.
  5. **Node check.** Log `process.versions.node` of the sidecar. If it is below 22.19, switch to a bundled Node and record that in the spike notes.
- **Done when:** `pnpm dev` launches Electron, the sidecar boots, and the main process holds a working token URL. A crash test (kill the sidecar) triggers a restart.

**P1.4 Window on the sidecar origin + security baseline**
- **Depends on:** P1.3.
- **Do:**
  1. **Window.** Create a `BrowserWindow` with `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and the preload script. Load the token URL; the gateway swaps it for a cookie and redirects to `/`.
  2. **Request filter.** In `security.ts`, add `session.webRequest.onBeforeRequest`:
     - block `/api/file`;
     - block every navigation outside `http://127.0.0.1:<port>`;
     - open external links in the default browser.
  3. **CSP.** Add a CSP header through `onHeadersReceived`.
  4. **UI stub.** Build a minimal `apps/ui` with Vite. The sidecar serves it from `ORB_UI_DIST`.
     - Dev mode: build the UI with `vite build --watch`. A Vite dev server would put the UI on a different origin, which the gateway's Origin check rejects.
- **Done when:**
  - The window shows the Orb UI stub served by the sidecar.
  - A `fetch('/api/session/list', …)` from the UI succeeds.
  - A request to `/api/file?path=/etc/hosts` from the UI is blocked.

**P1.5 Gateway client in the UI**
- **Depends on:** P1.4.
- **Do:** Build `apps/ui/src/wire/` with:
  - a unary helper `call(ns, method, args)` doing `POST /api/<ns>/<method>` with `{type:'client-request', rpcId, method, payload:{args}}`;
  - a mux WebSocket client for `/api/remote.mux` (`open` and `cancel` frames, ping handling);
  - an `$events` listener.

  Derive exact frame shapes from `dsh-client-connection/lib/client.js` and `dsh-api-gateway` types, and document them in `apps/ui/src/wire/README.md`.
- **Done when:** the UI can create a session, prompt it, stream the assistant's reply, and cancel it. A Vitest contract test runs against a real sidecar.

**P1.6 orb-host: first @Remote endpoints**
- **Depends on:** P1.5.
- **Do:**
  - Create a `TypertRemoteService` subclass in `orb-host` with `@Remote` methods `ping()`, `canvas.create`, `canvas.open`, and stream `board.follow`.
  - Validate payloads with zod.
- **Fallback if @Remote fails out of tree:**
  - Unary calls: `ctx.connection.fetch.register({path:'/orb/...'})`.
  - Streams: your own WebSocket via `ctx.webServer.registerUpgrade` + `ctx.connection.requestRejection(req)`.
  - Record which approach you used.
- **Done when:** the UI calls `orb.ping` and receives a `board.follow` stream.

**P1.7 orb-canvas: board log and fold (minimal)**
- **Depends on:** P1.1, P1.6.
- **Do:**
  1. **Canvas service.** `ctx.provide('orbCanvas', …)`. It creates canvas folders under `ORB_HOME/canvases/<date>-<slug>/` and writes `canvas.json`.
  2. **Event writer.** Appends to `board.jsonl`. Batches writes with fsync every 250 ms, and flushes on dispose.
  3. **Fold.** The fold function lives in `packages/shared`, so the UI and service share it.
  4. **Board follow.** `board.follow` streams: a snapshot first, then new events.
  5. **Commands.** Only `card.added` and `card.moved` for now.
- **Done when:** unit tests cover the fold, and write, crash and reopen. Kill -9 during writes loses at most 250 ms of events and never leaves a corrupt line (a torn tail line is skipped and truncated on open).

**P1.8 First agent tool: place_card**
- **Depends on:** P1.7.
- **Do:**
  1. **Register the tool.** In orb-canvas, `ctx.tools.register(defineTool({name:'place_card', …}))`.
     - Parameters: `{frameId?, type:'source'|'note-like', title, body, why}`.
     - Output: `{cardId}`.
     - It honours `exec.signal`.
  2. **Find the caller.** Determine the calling session and agent from the exec context. Record how you did it in the spike notes.
  3. **Spike preset.** Create an `orb` preset with only `place_card` + `query_board`, following the 0.2 preset package format.
  4. **Root agent.** In orb-agents, `canvas.create` creates a root session and agent with `meta.cwd` = the canvas folder and the `orb` preset. Store the session id in `canvas.json`.
- **Done when:** prompting "put a card about X on the board" makes the agent call `place_card`, and the card appears live in the UI with the correct provenance.

**P1.9 Reopen test**
- **Depends on:** P1.8.
- **Do:** Write an e2e test (Playwright Electron):
  1. Create a canvas and place 3 cards via the agent.
  2. Quit, and also kill -9 in a second run.
  3. Relaunch and open the canvas.
  4. Send another prompt that refers to earlier context.
- **Done when:** the board matches exactly, Orb's session resumes (harness `resume` path) with its history, and no `SessionFormatUnsupportedError` occurs.

**P1.10 Stop path**
- **Depends on:** P1.8.
- **Do:** Add `agents.control({agent:'all', action:'stop'})`:
  - cancel the root agent with `{kind:'user'}`;
  - then `whenIdle()` with a 1 s timer;
  - emit `agents.status` immediately as `stopping`, then `stopped` or `stop-timeout`;
  - log the measured ms.

  Make `place_card` slow (artificial 3 s delay that honours the signal) to test cancellation mid-tool.
- **Done when:** 20 runs show the agent idle within 1000 ms, mid-stream and mid-tool. Record the p50 and p95 in the spike notes.

**P1.11 Egress audit**
- **Depends on:** P1.8.
- **Do:** Write `scripts/egress-audit.ts`:
  - start the sidecar with `HTTPS_PROXY` and `HTTP_PROXY` pointing to a tiny logging CONNECT proxy (written in Node in the script);
  - run a scripted session with one prompt and one tool call;
  - fail if any host other than the configured model host is contacted.
- **Done when:** the audit passes. Run it once with telemetry left on, to prove the audit can see a telemetry attempt (if it fires).

**P1.12 macOS checks**
- **Depends on:** P1.3.
- **Do:** In the spike notes, record:
  1. The sidecar's Node version.
  2. That `@napi-rs/keyring` loads in the sidecar, and can set and get a test item without a prompt in dev.
  3. Whether the dsh sandbox backend reports `full` on this Mac. This is informational: Orb agents have no shell.
  4. That `/tmp` writes are unreachable by agents, because they have no fs tools.
- **Done when:** the notes are written.

### Gate 1 (all must pass)
- [ ] The P1.2 dump is correct: Orb rows present, telemetry and dsh UI rows disabled.
- [ ] The UI is served by the sidecar and calls both gateway and `orb-host` endpoints.
- [ ] An agent's `place_card` → `board.jsonl` → live UI path works.
- [ ] The reopen test (P1.9) is green.
- [ ] Stop reaches idle within 1 s on 20 runs (P1.10).
- [ ] The egress audit is green.
- [ ] `docs/SPIKE_NOTES.md` is complete, and `docs/PROGRESS.md` is updated.

---

## Phase 2, Board (weeks 3–4)

**Goal.** A real canvas, built for user actions only, that matches the prototype's look.

**P2.1 Design tokens and app shell**
- Port the PRD tokens to `apps/ui/src/theme/tokens.css`, and bundle the Geist fonts.
- Build the floating chrome to match `design/screens/canvas.html`:
  - title pill (inline edit + save state),
  - top-right Publish Port,
  - left toolbar,
  - minimap block,
  - conversation panel shell.
- **Router:** Home, Canvas, Port, Settings, FirstRun.
- **Done when:** a screenshot diff against the prototype is visually close, with no harness data yet.

**P2.2 Canvas renderer**
- **World transform:**
  - a single transformed world layer, `translate(panX, panY) scale(z)`;
  - zoom clamped to 0.25–2.5, towards the cursor (from the prototype's `zoomAt`);
  - pan by drag, Space+drag, or trackpad scroll; Cmd+scroll or pinch zooms.
- **Background:** the dot grid via background-size and position, and the star layer and glows as in the prototype.
- **Virtualisation:**
  - render only cards that intersect the viewport plus a 20% margin;
  - LOD by zoom: full ≥ 0.6, compact 0.35–0.6, title-only below 0.35.
- **Performance check:** with `scripts/seed-board.ts`, 300 cards and 8 frames run at 60 fps (Chrome performance trace in a Playwright test).

**P2.3 Board store and commands**
- **Store:** a Zustand store folds the `board.follow` stream.
- **Optimistic UI:** apply a command locally with a pending id, then reconcile when the event arrives.
- **Card commands:** add, move (drag batches into one `card.moved` on release), resize, multi-select (marquee + Shift), group move, delete.
- **Frame commands:** frames CRUD, recolour, and numbered labels (`01 THESIS`).
- **Links:** Connect tool, link types, and dashed accent style for tension and contradicts.
- **Done when:** all commands persist, and reopen restores them exactly.

**P2.4 Undo and redo**
- Undo works through compensating events, plus a per-app-session user-action stack in orb-canvas (not persisted).
- It covers user actions only.
- **Done when:** property tests show that fold(apply, undo) equals the previous state for every command type.

**P2.5 User card types, UI halves (first pass)**
- **Card types:** Note (Paper), Image (drop and paste), File/PDF (drop: thumbnail from the first page via pdf.js in the renderer, plus page count), Table (CSV import, sortable), Source (paste URL; just the URL card for now).
- **Cross-card features:**
  - card note tabs;
  - Must read and Skim badges;
  - `card.opened` tracking, and the reading-queue panel.
- **Assets:** files are copied into `assets/` through an orb-host endpoint. The renderer never writes to disk.

**P2.6 Home**
- **Top area:** tagline, rotating words (pool of 24, 2.8 s, paused under Reduce Motion), and the night/day toggle saved in `orb.json`.
- **Search box:**
  - Enter creates a canvas;
  - dropping a file or link seeds a canvas;
  - template chips prefill frames: define 5 templates in `packages/shared/templates.ts`.
- **Recent canvases:** tiles with a mini preview (frames as coloured rects) and status.
- **Search:** `index.sqlite` FTS5 across all canvases, built incrementally by orb-canvas and rebuilt if missing.
- **Done when:** search returns cards across 3 canvases, and deleting `index.sqlite` triggers a rebuild.

**P2.7 Board search and keyboard**
- Cmd+F searches and flies to each result.
- Shortcuts: Shift+1 (fit), Shift+2 (selection), Cmd+0 (100%), Delete, Cmd+Z / Cmd+Shift+Z, N (note), F (frame), C (connect), V (select).
- Every toolbar control is keyboard reachable.

### Gate 2
- [ ] Every PRD Canvas requirement works without agents, except agent-specific items.
- [ ] 60 fps with 300 cards, with the trace committed.
- [ ] Reopen is exact, and crash durability is 1 s or less (test).
- [ ] Home works: new canvas, seed by drop, recent tiles, search.

---

## Phase 3, Agents (weeks 5–6)

**Goal.** Scenario A fills a board, and the user stays in control.

**P3.1 Card registry and host halves**
- Build `orb-cards` with a registry `{type, schema, allowedRoles, describe(card) → string, tools?}` for all 11 types.
- `place_card` and `update_card` validate the payload against the type's schema and the caller's role.
- `query_board({frameId?, types?, q?})` returns cards with their `describe()` text plus ids, never raw coordinates.

**P3.2 Layout engine and budgets**
- **Placement:** agents name a frame, and the layout engine places the card in the frame's grid.
  - It uses the first free cell (cell sizes per card type).
  - If no cell is free, it grows the frame downward.
  - It animates the card in.
- **Budget:** the default is 12 cards per frame. Above it, `place_card` returns `FRAME_FULL` plus the agent's own cards in that frame.
- **`consolidate_cards({cardIds, title, summary})`:** creates a stack card and emits `card.stacked`.
  - It may only consolidate cards created by the calling agent.
  - It never touches user notes.
- **Done when:** a fuzz test proves the budget holds and that user notes are never touched.

**P3.3 Orb root agent and the preset**
- **`orb` preset:** the Orb allow-list from §2.4, plus Orb's persona.
- **Persona content:**
  - the role;
  - the frame-proposal behaviour (3–5 frames);
  - always cite cards;
  - never write prose cards when a typed card fits;
  - use `delegate` for research.
- **Guard:** `ctx.tools.guard` enforces the allow-lists for every agent.
- **Chat:**
  - `chat.send` injects context: in-context frames and cards rendered as `describe()` text, plus the thread card content when the message comes from a thread;
  - it prompts the root session through the gateway's session endpoints.
- **New-canvas behaviour:**
  - Orb proposes frames with `add_frame`;
  - Orb starts Scout and Critic, unless the user said otherwise.

**P3.4 Child agents: Scout, Critic, Builder**
- **`delegate({role, frameIds, instruction})`:**
  - **Starts a child:** if none exists for that role, it calls `ctx.subagents.startContinuable`, passing:
    - persona;
    - `toolFilter.allow` set to the role's allow-list;
    - `agentOptions` set to the role's model from `orb.json`.
  - **Messages it:** otherwise it sends the child a message with the new assignment.
  - **Stores the id:** child ids are saved in `canvas.json`.
- **`message_agent` and `stop_agent`** are Orb's tools for redirecting and stopping a single child.
- **`report_progress({status, frameId?})`:**
  - updates `agents.status`: the cursor moves to the frame and the label changes;
  - calls the parent agent's `inject()` with a one-line summary, which adds context without waking Orb.
- **Child personas tell each child to:**
  - call `report_progress` often;
  - use `send_message` to Orb only for "done" or "need decision".
- **Continuable children cannot take output schemas.** All structure comes through `place_card` and `add_link`.

**P3.5 orb-sources**
- **Search provider interface:** `web_search` uses the harness `ctx.web` search providers.
  - The DeepSeek provider is used when a DeepSeek key exists.
  - Register Brave and Tavily providers through `ctx.web.registerSearchProvider`, using keys from orb-keychain.
- **`fetch_url`:**
  1. The fetch itself blocks private IPs, caps at 5 MB and follows redirects carefully.
  2. If the content is a PDF, it uses pdfjs text extraction.
  3. Otherwise it uses readability + turndown.
  4. The result is cached in `assets/sources/<hash>.md`, with metadata.
- **`read_source(cardId, page?)`:** returns cached text in chunks of at most 8k characters.
- **`capture_page(url)`:**
  1. orb-host asks Electron main, through an authenticated loopback callback that the main process registers, to load the URL in a hidden window (`partition: 'temp:capture'`, sandbox, no preload).
  2. The window waits for load + 1.5 s, then captures a full-page PNG to `assets/`.
  3. The tool returns the asset path for an `image` card.

  Design the main↔sidecar control channel carefully: use a per-launch secret passed in the env, and accept connections on loopback only.

**P3.6 Agent UI**
- **Cursors:** a live cursor and label per agent, gliding to its frame (from `agents.status`).
- **Conversation panel:**
  - streaming text, from the session follow stream;
  - "On the board" activity groups linking to cards;
  - context chip and `@` mentions;
  - Stop / Pause all / Stop all;
  - per-agent controls on the avatars.
- **Cards and threads:**
  - "why it's here", with a provenance popover showing agent, model, time and tool call;
  - the provenance detail loads the session event range through the gateway session page endpoint;
  - thread popovers with reply counts; a thread's new cards are placed next to its card and linked to it.

**P3.7 Pause, resume, redirect, stop-all**

| Control | What it does |
|---|---|
| Pause | Cancels the agent with the queue kept (`keepInbox: true`), or interrupts a child. Marks it paused. `delegate` and messages to a paused agent are queued, not delivered |
| Resume | Clears the paused flag and steers the agent with "continue" plus any queued items |
| Redirect | Steers the agent (root), or sends a message (child) |
| Stop all | Interrupts every child in parallel, cancels the root, then waits for idle with a 1 s budget. The UI changes state immediately |

Every Orb tool honours `exec.signal`.
- **Done when:** an e2e test runs Stop all 20 times during Scenario A, and every run is idle within 1 s. Times are logged.

**P3.8 Builder cards**
- **`write_design_frame({frameId, title, html})`:**
  - writes `assets/design/<id>.html` through orb-canvas;
  - places a `design` card that renders in a sandboxed `srcdoc` iframe with the CSP from the PRD.
- **Editing via chat:** Builder rewrites the HTML, and the card shows the new version with a timestamp.
- **Diagram card:** Mermaid source rendered live with `mermaid.render`.

### Gate 3
- [ ] Scenario A runs from the Home box to a board with at least 3 frames, with Scout, Critic and Builder cards, cursors and why lines.
- [ ] Threads produce linked cards.
- [ ] Budgets hold.
- [ ] Every control works per agent, and stop-all is under 1 s on 20 runs.
- [ ] The egress audit still passes with Scout using search and fetch.

---

## Phase 4, Port and models (weeks 7–8)

**P4.1 orb-keychain**
- **CredentialProvider:** a subclass whose refs and records live in the Keychain via `@napi-rs/keyring` (service `ai.orb.app`).
- **Read-only env layer first.** No `.env` layering: Orb doesn't use `.env` files.
- **Change events:** emits `notifyUpdated`.
- **Wiring:** it replaces the base `credentials` row in orb-bundle's patch.
- **Migration:** if a plaintext `DSH_HOME/.credentials.yaml` exists, move its entries into the Keychain, then delete the file.
- **Redaction:**
  - `keys.describe` returns `{provider, configured, redacted: 'sk-...4f2a'}`;
  - raw keys never cross the wire to the UI;
  - `keys.set` accepts a key from the UI once, over the authenticated loopback.

**P4.2 Models settings**
- **Provider cards:** DeepSeek (llm-pi-ai `deepseek` route), Anthropic, OpenAI, OpenRouter, Custom.
- **Custom provider:** `{id, baseURL, api: 'openai-completions'|'openai-responses'|'anthropic-messages', models[], noKey}`.
  - Write it to `DSH_HOME/settings.yaml` under `llm-pi-ai.providers`. Changes take effect on the next request.
- **Test button:** `keys.test` runs `ctx.llm.stream({provider, model, maxTokens: 1})` and maps error codes to messages.
- **Discovery:** model lists via `ctx.llm.discoverModels`.
- **Per-agent picker:** stored in `orb.json`, applied at the next agent start.
- **First-run sheet:** shown before Home when no provider works.

**P4.3 Cost meter**
- **Price table:** in `orb.json` (`provider/model → {input, output, cacheRead, cacheWrite}` per 1M tokens), editable in Settings.
- **Seed:** the default prices are seeded from pi-ai catalog `ModelCost` where available. Read it from `@earendil-works/pi-ai` directly; dsh zeroes it.
- **Canvas total:** `cost.get(canvasId)` sums the token-usage projection over the root session and its child sessions, multiplied by prices.
- **Where it shows:** the panel menu and the Home tiles.

**P4.4 Print pipeline**
- **Print routes:** `/print/canvas?canvasId&layout&theme&scope` and `/print/doc?canvasId`. Each renders print halves only, with no chrome, using light theme tokens.
- **Native export:** `window.orbNative.exportPdf(route, options)`.
  1. Main opens a hidden window on the route.
  2. It waits for a `ready` signal: fonts loaded, Mermaid done, images decoded.
  3. It calls `printToPDF` and writes the file to `exports/` with a timestamped name.
  4. It offers Reveal in Finder.
- **Design frames:** before printing, each design frame is snapshotted with `capturePage` at 2x and stored in `assets/snapshots/`, labelled with its capture time.
- **Canvas PDF:**
  - one page per frame, or a poster;
  - footer with title, frame, date and page number;
  - clickable source URLs (real `<a>` links survive `printToPDF`).
- **Performance:** a 10-frame PDF in under 15 s, as a test.

**P4.5 Research document**
- **`compose_section({sectionId, heading, paragraphs:[{text, cardIds[]}], figures:[{cardId, caption}]})`:**
  - rejects empty `cardIds`;
  - rejects ids outside the scope;
  - persists the result to `port/doc.md` plus `port/citations.json`.
- **`port.compose`:**
  1. Orb plans the sections from the instructions, or uses the standard format.
  2. It calls `compose_section` once per section.
  3. It streams progress.
- **Reading view** (look from `design/screens/port.html`):
  - inline editing; user paragraphs are marked `userAuthored`;
  - per-section regenerate, reusing the saved instructions;
  - numbered citations linking back to cards on the canvas.
- **Unread warning:** before compose, warn about unread Must read cards in scope.

### Gate 4
- [ ] All 11 card types appear in both export modes (fixture canvas test).
- [ ] Citations are enforced: a test tries an uncited paragraph and expects a rejection.
- [ ] Keys for DeepSeek, Anthropic, OpenAI, OpenRouter and a custom endpoint (local Ollama with the no-key option) work. `security find-generic-password` shows them in the Keychain, and `DSH_HOME` contains no keys.
- [ ] Per-agent models and the cost meter are verified against provider usage on one run.

---

## Phase 5, Ship (weeks 9–10)

**P5.1 Performance pass.**
- Startup to Home in under 2 s. Show Home while the sidecar warms up, with a "warming up" state on the box.
- 60 fps with 300 cards.
- First token in under 1 s after the provider responds.
- Profile the sidecar boot. Disable unneeded base rows (title LLM, MCP, jobs and so on) and record each choice.

**P5.2 Accessibility pass.** Focus rings, labels, 4.5:1 contrast, keyboard reach, Reduce Motion.

**P5.3 Settings.** Storage (show the folder, Reveal, Change location: move, or point at an existing folder), Appearance, About (versions + privacy statement).

**P5.4 Packaging.**
- **electron-builder:** hardened runtime, entitlements (no JIT beyond what Electron needs), signing and notarisation, a universal or arm64 dmg.
- **Bundled files:** the UI dist and node_modules for the sidecar.
- **Signing:** the sidecar is Electron itself, so it is signed with the app. Verify Keychain access works from the signed build.

**P5.5 Hardening.**
- **Fuzz:** board commands.
- **Kill-9 durability:** 50 runs.
- **Egress audit:** in CI.
- **Upgrade rehearsal:** bump dsh in a branch, run the gate tests, and record the breakage list.

**P5.6 Acceptance.** Tejas runs his next idea brainstorm end to end. Record issues; fix the blockers.

### Gate 5
- [ ] Every PRD Gate 5 item passes.
- [ ] The signed, notarised dmg installs on a fresh Mac.

---

## Build sequence (dependency graph)

```
P1.0 ─┐
P1.1 ─┴─► P1.2 ─► P1.3 ─► P1.4 ─► P1.5 ─► P1.6 ─► P1.7 ─► P1.8 ─┬─► P1.9
                    └─► P1.12                                    ├─► P1.10
                                                                 └─► P1.11      ══► GATE 1
P2.1 ─► P2.2 ─► P2.3 ─┬─► P2.4
                      ├─► P2.5 ─► P2.6
                      └─► P2.7                                                   ══► GATE 2
P3.1 ─► P3.2 ─► P3.3 ─► P3.4 ─┬─► P3.5
                              ├─► P3.6 ─► P3.7
                              └─► P3.8                                           ══► GATE 3
P4.1 ─► P4.2 ─► P4.3
P4.4 ─► P4.5                    (P4.1–P4.3 and P4.4–P4.5 can run in parallel)    ══► GATE 4
P5.1 … P5.6                                                                      ══► GATE 5
```

## Testing strategy

| Level | Tool | What it covers |
|---|---|---|
| Unit | Vitest | Fold, layout engine, budgets, citation validator, zod schemas, wire codec, price math |
| Plugin integration | Vitest + a real sidecar on a temp `DSH_HOME` | Tools, remotes, reopen and resume, stop timing. Use a stub LLM provider (a custom `openai-completions` route pointing at a local mock server) so tests are deterministic and offline |
| E2E | Playwright for Electron | Scenario A with the mock provider; reopen; exports; keyboard |
| Audits | Scripts | Egress audit; dump-config snapshot diff; 60 fps trace |

Every gate's checklist maps to at least one automated test, except the human acceptance run in Gate 5.

## Definition of done (every task)
- Code, tests and docs are updated, and `pnpm build && pnpm test` is green.
- No new network destinations and no new harness seams outside `orb-host`, `orb-agents` or `orb-canvas` without a note.
- `docs/PROGRESS.md` has an entry.
