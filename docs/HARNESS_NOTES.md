# Harness notes (Phase 2 onwards)

Surprising harness behaviour found after Phase 1, with the file that proves it. Phase 1 findings are in
`docs/SPIKE_NOTES.md`. Paths are relative to `node_modules/@deepseek-ai/` (hoisted install), `@deepseek-ai/dsh@0.2.0-rc.2`.

## P6.34 ChatGPT plan transport (2026-10-19)

- The public `PiAiAdapter` accepts immutable `ResolvedPiAiProviderProfile.piProvider` instances. An Orb-owned
  provider can reuse its transcript, attachment, tool-result and replay conversion while applying the plan-only
  Responses body hook. Proof: `node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js`, `PiAiAdapter.current`,
  `streamWithSnapshot`; types in `lib/types/adapter.d.ts` and `config.d.ts`. Orb imports this seam only from orb-host.
- API-key profile defaults are incompatible with plan usage: Responses can send `max_output_tokens` and cache
  retention, and non-reasoning models emit system-role input. Proof:
  `node_modules/@earendil-works/pi-ai/dist/api/openai-responses.js`, `buildParams`, and
  `api/openai-responses-shared.js`, `convertResponsesMessages`. The dedicated plan provider uses `onPayload`,
  namespaces its function tools, sends full input history and strips unsupported parameters. It uses the public
  `/v1/responses` endpoint, not a Codex/ChatGPT backend endpoint. Its catalog is the account's ordered
  `models[]`/`slug` directory, not the API-key `data[]` directory.
- Throwing an actionable error from the SDK fetch hook becomes an unhelpful `Connection error.`. Returning a
  sanitized HTTP error keeps the recovery message. In-stream `response.failed` errors take a separate path and
  include their machine code; Orb guards both paths and blocks further requests on plan quota. Proof:
  `node_modules/@earendil-works/pi-ai/dist/api/openai-responses.js`, `stream` catch; `api/openai-responses-shared.js`,
  `processResponsesStream`; `node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js`, `toStreamChunks`.
- Harness compaction inherits the agent's latest routed provider/model unless explicit summarization overrides are
  configured (Orb has none). An agent started on the plan therefore keeps compaction on that plan route. Existing
  live agents retain their start/resume model configuration under the PRD's next-start selection semantics;
  the setup guide requires reopening orb before continuing a previously opened board after changing providers. Proof:
  `node_modules/@deepseek-ai/dsh-compaction-basic/lib/index.js`, `summarizeWithLlm`.
- OAuth is sidecar-owned, with browser launch delegated over the existing authenticated loopback control channel.
  PKCE/state/nonce, issued-client persistence, JOSE validation, serialized rotation and cancellation stay outside
  the renderer. The installed app uses a single-instance lock so two windows cannot independently rotate one
  renewable session. Credentials remain in Orb's existing Keychain provider; no Codex login files are reused.
- The control client must use `node:http`, like `packages/orb-sources/src/capture.ts`: Node's `fetch` adds a
  `Sec-Fetch-Mode` header, and the main server deliberately rejects all `Sec-Fetch-*` headers as browser callers.
  The desktop sign-in test exposed the refusal; the HTTP client fixes it without weakening that boundary.

## P6.33 Provider directories and runtime registration (2026-10-19)

- `dsh-llm-pi-ai/lib/index.js`, `discoverModels` (~2286), returns the installed catalog immediately for known
  providers, even when the request supplies a base URL. Its `modelOf` (~1785) rejects IDs absent from the served
  route (`UNKNOWN_MODEL`). Fresh IDs therefore need both authenticated discovery and runtime registration.
- `resolveRouteModels` (~640) treats `models` as a replacement catalog and forbids it alongside
  `modelOverrides`. Orb materializes the installed IDs, configured declarations/overrides, newly advertised IDs
  and saved agent selections into the route through `SettingsForms.mutate`. Existing explicit capabilities and
  request settings are preserved. The template rewrites the launch profile, so non-secret directories and metadata
  are persisted in `orb.json` and registered again on startup; startup itself makes no model-list request.
- The profile has a route-level API, not a per-entry API. OpenRouter's installed entries mix Anthropic and Chat
  APIs; its live directory is served through its universal OpenAI Chat endpoint. An explicit Chat compatibility
  option lets the adapter rebuild protocol-specific compatibility for catalog entries whose API changes, while
  preserving same-protocol compatibility. Proof: `resolveRouteModels` / `resolveModelCompat` in the same file.
- `packages/orb-host/src/modelDiscovery.ts` uses the configured provider only: OpenAI/DeepSeek/OpenRouter
  `GET <base>/models`, native Anthropic `GET <base>/v1/models` with `after_id` pagination. It preserves deployment
  prefixes, auth and route headers, refuses redirects and bounds time, response bytes, pages and directory size.
  Failed/incomplete responses cannot overwrite the last successful listing. Raw provider error bodies are discarded.
  Generation/endpoint/credential checks discard refreshes made stale by key changes or provider edits/removal.
- Preserve advertised context/output sizes and text/image inputs when available. Uncatalogued IDs without that
  metadata use conservative text-only 65,536 context / 8,192 output caps; discovery is not a claim that every model
  supports every tool or account. Explicitly identifiable embedding/audio/image/video-only APIs stay out of chat
  pickers. Saved selections omitted by a refresh retain their metadata and registration after restart.
- `Settings > Models` refreshes configured routes on entry, displays each list's source/update time, provides
  per-provider refresh and searches IDs across providers. Custom Find models may use an explicitly typed draft
  key for that request only; an edited endpoint never silently receives the existing saved key.
- Official API references checked for auth, paths, metadata and pagination:
  [OpenAI](https://developers.openai.com/api/reference/resources/models/methods/list),
  [Anthropic](https://platform.claude.com/docs/en/api/models/list),
  [DeepSeek](https://api-docs.deepseek.com/api/list-models/),
  [OpenRouter](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties).
- Proof tests: `packages/orb-host/test/modelDiscovery.test.ts`, `apps/ui/test/models-live.contract.test.ts`,
  `apps/desktop/e2e/models.spec.ts`, and `apps/desktop/e2e-packaged/packaged.spec.ts` (new model ID drives an actual
  packaged agent turn). The egress audit also discovers from its configured model host before running research.

## P2.5 Assets (upload and read-back routes)

### Raw HTTP routes on the authenticated `/api` channel: `ctx.connection.fetch.register`
- **Expected**: Orb-specific traffic goes through the `orb` Remote namespace (JSON RPC). A file upload over JSON would
  need base64 (+33%) and a whole-body buffer.
- **Actual**: the connection service has an exact-path Fetch route registry next to the RPC interceptor:
  `ctx.connection.fetch.register({path, methods, requestBody: 'buffered' | 'streaming', fetch(request) → Response})`.
  - The path must be `/api/<segments>` with the RPC segment rules (`[A-Za-z0-9_$.-]`); exact match only (no
    prefixes), so parameters go in the query string.
  - Routes sit behind the same `/api` handler as the RPCs, so `admit` (Host/Origin fence, then the browser auth
    cookie) runs first: no cookie → 401, foreign `Origin` or `Sec-Fetch-Site: cross-site` → 403. A route needs no
    auth of its own.
  - `requestBody: 'streaming'` hands the handler `Readable.toWeb(req)` (no gateway buffering, so no gateway size cap);
    `'buffered'` buffers up to `maxRequestBodyBytes` (300 MiB default).
  - A matching Fetch route wins over the RPC interceptor for its path and methods.
  - The registration is an effect on the reading context: call it inside `ctx.inject(['connection'], …)`.
  - Harness users of the same seam: `dsh-client-file-upload` (streaming upload), `dsh-api-session-controller`
    (`/api/file`).
- **Proof**: `dsh-client-connection/lib/index.js:581-584` (`get fetch`), `:591-594` (`admit`), `:605-639`
  (`createSharedFetchHandler`, `registerFetchRoute`), `:711-716` (`endpointFromPath`), `:758-762`
  (`assertFetchRoute`), `:34-80` (`bridge`: buffered vs streaming body, 413 cap); `:205-219` (`isTrustedApiRequest`);
  `dsh-client-file-upload/lib/index.js:171-176`.
- **Used by**: `packages/orb-host/src/assets.ts` (`POST /api/orb-asset/upload`, `GET|HEAD /api/orb-asset/file`),
  registered from `OrbHost`'s constructor. Proven against a real sidecar in `apps/ui/test/assets.contract.test.ts`.

### Answering an upload before reading its body makes the client see a network error
- **Actual**: when the route answers (413/415/400) while the client is still sending, Node's `fetch` (undici) reports
  `fetch failed` instead of the response, because the server closes the half-read request. Orb's upload route reads
  and drops the rest of a refused body (up to 64 MB) before answering, so the UI gets the JSON error
  (`orb/too-large`, `orb/unsupported-type`).
- **Proof**: `apps/ui/test/assets.contract.test.ts` ("keeps the type, size and path checks over the wire") failed
  with `transport/network` before the drain in `packages/orb-host/src/assets.ts`.

### The static server does not know `.mjs` (or fonts)
- **Actual**: `dsh-host-frontend-static` maps only `.html .js .css .svg .json .map .webmanifest .gz`; anything else is
  `application/octet-stream`. A module worker (`new Worker(url, {type: 'module'})`) refuses a non-JavaScript MIME
  type, so pdf.js's `pdf.worker.min.mjs` must ship as `.js`. Fonts and pdf.js's standard font data are fetched as
  bytes, so their MIME type does not matter.
- **Workaround**: `apps/ui/vite.config.ts` emits `.mjs` assets as `.js` (`assetFileNames`) and copies
  `pdfjs-dist/standard_fonts/` into `dist/pdfjs/standard_fonts/` (served same-origin; no CDN).
- **Proof**: `dsh-host-frontend-static/lib/index.js:24-33` (`MIME`), `:65` (`?? "application/octet-stream"`).

### `/api/file` blocking and the new routes
- `apps/desktop/src/main/security.ts` cancels any renderer request whose canonical path starts with `/api/file`. The
  asset routes are `/api/orb-asset/...`, so they are not caught by that prefix; they only serve regular files directly
  inside `<canvas>/assets/` (`packages/orb-canvas/src/assets.ts`, `assetFile`).

## P2.6 Home search (`index.sqlite`)

### `node:sqlite` with FTS5 works in the sidecar (Electron-as-Node), no native module needed
- **Checked**: `ELECTRON_RUN_AS_NODE=1` Electron 44.7.0 → Node 24.21.0, SQLite 3.53.4, `ENABLE_FTS5` compiled in
  (`sqlite_compileoption_used('ENABLE_FTS5') = 1`); `CREATE VIRTUAL TABLE … USING fts5(…, tokenize='unicode61
  remove_diacritics 2')`, `snippet()` and `bm25()` all work. No ExperimentalWarning is printed. The system Node used by
  Vitest (26.x) behaves the same, so the unit tests exercise the same engine. `better-sqlite3` (the BUILD_PLAN
  fallback) is not needed, so Electron 44.7.0's native-ABI pin is not touched.
- **Proof**: `packages/orb-canvas/src/search.ts`; `apps/ui/test/home.contract.test.ts` runs it inside a real sidecar
  (dsh under Electron-as-Node); `apps/desktop/e2e/home.spec.ts` in the packaged app.

### tsup strips the `node:` prefix by default, which breaks `node:sqlite`
- **Actual**: tsup 8+ defaults `removeNodeProtocol: true`, so `import … from 'node:sqlite'` was emitted as
  `from "sqlite"`, which Node resolves as an npm package (`ERR_MODULE_NOT_FOUND: Cannot find package 'sqlite'`).
  Unlike `fs` or `path`, `sqlite` exists ONLY under the `node:` scheme.
- **Fix**: `removeNodeProtocol: false` in `packages/orb-canvas/tsup.config.ts`.
- **Proof**: `node_modules/tsup/dist/index.js:497` (`options.removeNodeProtocol && nodeProtocolPlugin()`), `:1424`
  (default `true`); `packages/orb-canvas/test/crash.test.ts` (imports the BUILT store) failed until the flag was set.

### Design notes (not harness surprises)
- The index is derived: orb-canvas queues the cards/frames touched by each appended event and writes them in one
  transaction ≤250 ms later (only into an index that is already open, so an append's timer never builds one). Before
  every search, and 2 s after sidecar start (`warmIndex`), `sync` compares each canvas with the index (the open
  board's seq, else the size of `board.jsonl`, recorded at clean shutdown) and re-indexes stale ones from a READ-ONLY
  fold of `board.jsonl`. A missing, damaged or older-version `index.sqlite` is recreated and every canvas indexed.
- WAL journal with `synchronous = NORMAL` (no fsync per commit); a stale `-wal`/`-shm`/`-journal` beside a deleted
  index is removed before recreating it so it is never replayed into the new file.

## P3.1 Card registry and board tools

### A session header has no free-form metadata, so an agent's role cannot ride on the session
- **Expected** (SPIKE_NOTES §P1.8): the board tools' role is the tool row's `config.agent`, one row per preset.
- **Actual**: Scout, Critic and Builder will be continuable children of the root agent (P3.4) and share its
  preset scope, so a per-row role cannot tell them apart. The other place a role could live, the session header,
  has only fixed fields: `version`, `id`, `createdAt`, `cwd?`, `parentSession?`, `isSeeded`, `origin?: 'subagent'`,
  `delegationDepth?`, `agentPreset?` (no free-form `meta`). `ctx.agents.create({meta})` folds only those fields.
- **Decision**: the board tools resolve the caller's role from its identity: `exec.agent.id` (the session id) is
  looked up in the canvas's `canvas.json` (`rootSessionId` → `orb`, `childAgentIds.{scout,critic,builder}` → that
  role; a forged `childAgentIds.orb` never grants `orb`). A session that is neither (e.g. a plain gateway
  `session/create` in a canvas folder) gets no board access (`this agent is not one of the canvas agents`). The
  `config.agent` key of the `orb-board-tools` row is gone (dump-config regenerated). P3.4 must write
  `CanvasStore.setChildAgent(canvas, role, childId)` BEFORE the child's first turn (choose `childId` up front:
  `startContinuable` takes `childId?`, SPIKE_NOTES §Subagents).
- **Proof**: `dsh-session/lib/types/types.d.ts:58-95` (`SessionHeader`); `packages/orb-canvas/src/tools.ts`
  (`roleIn`, `callerOf`); `apps/ui/test/cards.contract.test.ts` (a gateway session is refused until it is listed as
  Scout in canvas.json, then its cards are stamped `scout` and it may place only source/quote/image).

### Tool errors reach the model as `Error: <message>` text
- **Actual**: an `execute` that throws becomes a tool result with `isError: true` whose text the OpenAI-compatible
  route sends as the tool message content, e.g. `Error: scout may not place risk cards (allowed: source, quote,
  image)`. Orb's board tools therefore throw short, actionable messages (zod issues are rewritten to
  `invalid <type> card <field>: <reason>`, unknown fields to `<field> does not apply to <type> cards`).
- **Proof**: `dsh-tools/lib/index.js:3622` (`Error: ${message}` result text), `dsh-agent-loop/lib/index.js:689-700`
  (`appendToolResult` with `isError`); asserted in
  `apps/ui/test/cards.contract.test.ts`.

### The OpenAI Responses route accepts the flat `place_card` schema
- `place_card` takes the envelope (`type`, `frameId`, `why`, `badge`) plus every card type's agent fields as flat
  optional parameters (nested string arrays for `excerpts`, `columns`, `rows`); the orb-cards registry checks which
  apply to the chosen type. A live `pnpm egress-audit --mode live` (gpt-6-luna, api.openai.com) on 2026-10-14 placed
  its card with this schema (PASS; only api.openai.com contacted), so the schema is accepted by the real route.

## P3.2 Layout engine, budgets and `consolidate_cards`

### A tool's return value is validated against its declared output schema
- **Actual**: before a successful result is rendered, dsh-tools snapshots it and validates it against
  `output.schema`; any violation turns the call into an `INVALID_TOOL_OUTPUT` failure (`tool "<name>" returned
  invalid output: …`). So `place_card`, which now answers either `{cardId}` or the `FRAME_FULL` object
  (`{error, frameId, budget, cards, message, ownCards}`), declares every one of those properties and none as
  `required` (with `additionalProperties: false`). `FRAME_FULL` is a normal result, not a thrown error, so the agent
  gets the structured list of its own cards to consolidate.
- **Proof**: `dsh-tools/lib/index.js:3541-3544` (`createSuccessResult` → `validateJsonSchemaValue(tool.output.schema,
  …)`), `:2551-2556` (`ToolOutputError`, code `INVALID_TOOL_OUTPUT`); `apps/ui/test/cards.contract.test.ts` (P3.2
  test: 12 `{cardId}` results and one `FRAME_FULL` result over a real sidecar).

### `ctx.tools.restrict({deny})` on the agent's ctx hides inherited PRESET tools from that agent
- **Expected**: the preset's board tools (`orb-board-tools` in the `orb` preset's `plugins`) are offered to every
  agent bound to the preset, so Orb would be offered `consolidate_cards`, which is outside its §2.4 allow-list (the
  guard only denies the call).
- **Actual**: a restriction filters what a scope INHERITS (global and every ancestor layer, which includes the preset
  scope), never what the scope registers itself, so `agentCtx.tools.restrict({deny: ['consolidate_cards']})` in the
  root agent's `setup` (after `agentPresets.mount`) removes it from Orb's model-facing tool list. Names must be known
  tools (an unknown name throws), so Orb restricts only `BOARD_TOOL_NAMES` that the preset really registers
  (`hiddenBoardTools(role)` in `packages/shared/src/agents.ts`). The guard still denies them (defence in depth), and
  sessions composed by the gateway (`session/create`) are not restricted, only guarded. P3.3/P3.4 should use the same
  pattern (or `toolFilter.allow` for children) for the full per-role tool surface.
- **Proof**: `dsh-tools/lib/types/index.d.ts:637-644` (`restrict`: "Restrict global tools for the calling agent
  scope … unknown names … fail"), `:658-680` (`view`: restrictions filter the inherited surface; preset tools are "an
  ANCESTOR contribution"); `packages/orb-agents/src/service.ts` (`setupFor`); `apps/ui/test/agent.contract.test.ts`
  (Orb is offered exactly `place_card`, `query_board`, `update_card`).

### Tool calls of one model turn run one after another unless the tool declares `isConcurrencySafe`
- **Actual**: the agent loop schedules a step's tool calls by concurrency mode; only a tool whose
  `isConcurrencySafe(args)` returns exactly `true` runs in the parallel pool, everything else is an exclusive
  barrier. The board tools do not declare it, so a turn with 13 `place_card` calls into one frame places 12 and the
  13th answers `FRAME_FULL`. Different agents (Scout, Critic, Builder: separate loops from P3.4) do run at the same
  time, so the canvas service does the budget check, the layout and the append synchronously after loading the board
  (no `await` between them): concurrent calls never share a cell or overfill a frame
  (`packages/orb-canvas/test/budget.test.ts`, "concurrent placements never overfill a frame").
- **Proof**: `dsh-agent-loop/lib/index.js:474-495` (tool-call scheduling), `:621`; `dsh-tools/lib/index.js:3050-3064`
  (`executionMode`: "Only an exact `true` is parallel"); `apps/ui/test/cards.contract.test.ts`.

## P3.3 Orb root agent and the preset

### Tool guards are synchronous, so a per-role guard needs a synchronous role lookup
- **Expected** (BUILD_PLAN P3.3): "`ctx.tools.guard` enforces the allow-lists for every agent".
- **Actual**: a `ToolGuard` is `(execution) => string | undefined`, called synchronously after the `tools/pre-execute`
  waterfall; it cannot await a `canvas.json` read. The preset-level row `orb-tool-guard` (which binds every agent on
  the `orb` preset, including the P3.4 children that share the preset scope) therefore resolves the CALLER's role
  from `exec.agent.id` through `orbCanvas.roleOfSession(sessionId)`, an in-memory map the canvas service fills from
  every `canvas.json` it reads or writes (`rootSessionId` → orb, `childAgentIds` → scout/critic/builder). Agents are
  created or resumed only after their canvas.json was read, so a live canvas agent is always in the map; a session
  that is not (a plain gateway session) gets the row's `config.agent` list (`orb`). The board tools still read the role
  from canvas.json on every call and refuse tools outside the caller's §2.4 list themselves (defence in depth).
- **Proof**: `dsh-tools/lib/types/index.d.ts:522` (`ToolGuard` type), `dsh-tools/lib/index.js:2918` ("synchronous
  check"), `:2927-2935` (`guardReason` walks the global then the scope chain's guard layers);
  `packages/orb-agents/src/guard.ts` (`roleToolGuard`), `packages/orb-canvas/src/store.ts` (`roleOfSession`);
  `apps/ui/test/agent-guard.contract.test.ts` (a session listed as Critic is refused `add_frame` and `todo_write` by
  the guard, and may place a question card).

### A persona row is scope-only, and its `apply` can be reused from Orb's own row
- **Actual**: `@deepseek-ai/dsh-persona` registers the persona prefix/suffix sections for the scope that mounts it;
  mounted globally it collides with the prompt registry's own persona. Its `apply(ctx, {prefix, suffix, complete,
  includeRuntimeContext})` is a plain export, so Orb's preset row `@orb/agents/persona` (inject `systemPrompt`) calls
  it with `ORB_PERSONA` from `packages/orb-agents/src/persona.ts`. The text is code (unit-tested, shared with the
  new-canvas turn) and the harness still owns how a persona becomes the scope's system prompt (`complete: true`,
  runtime context suppressed, as the P1.2 YAML row had it).
- **Proof**: `dsh-persona/lib/index.js:4-16` (scope-only), `:35-49` (`apply`); `packages/orb-agents/test/persona.test.ts`;
  `apps/ui/test/orb-root.contract.test.ts` (the system message the mock LLM receives is Orb's persona).

### A missing model key fails the turn before any request leaves the machine
- **Actual**: `llm-pi-ai` resolves the route's `apiKeyEnv` through the CredentialProvider (then the launch env) when
  a request is prepared and throws `LlmError(..., 'MISSING_CREDENTIAL')` when it is unset, so the turn ends with an
  error and no HTTP request is made. Relevant because Home now starts Orb's new-canvas turn (`canvas.create {start:
  true}`): e2e specs that run without the mock LLM (no key in their temp DSH_HOME) see that turn end in `error` at
  once; `apps/desktop/e2e/support/ui.ts` waits for `completed` or `error`.
- **Proof**: `dsh-llm-pi-ai/lib/index.js:2563-2570` (`resolveApiKey`).

### Context goes in the user message, not `inject()`
- **Decision** (not a harness surprise): `chat.send` sends the in-context frames/cards and the thread card as a
  second text part of the SAME user message (`createUserMessage({content: [text, context]})`) rather than
  `agent.inject()`. `inject()` adds context to the agent's NEXT STEP (SPIKE_NOTES §Agents API), which would land in
  the running turn when the message is queued behind one; a part of the queued message always reaches the turn that
  answers it. Proven on the mock (`openai-completions`) route in `apps/ui/test/orb-root.contract.test.ts`; the P3.3
  live check (gpt-6-luna, `openai-responses`) sent a single-part message, so a multi-part message on the live route is
  still to be seen (Gate 3 live run).

## P3.4 Child agents (continuable subagents)

### `startContinuable` children join the PARENT's preset, not its scope
- **Actual**: the continuation manager creates the child from its own context (`ownerCtx.agents.create({parentAgent,
  …})`, `parentAgent` is runtime ownership only) and composes it with `applyChildComposition`: `agentPresets.composeFrom`
  joins the parent's preset generation, then the child's own persona section and `tools.restrict(toolFilter)`. The
  parent's own `tools.restrict({deny})` (Orb hiding `report_progress`/`send_message`) is NOT inherited, so each child
  sees the preset's tools filtered only by its own `toolFilter.allow`. The child's cwd (canvas folder) comes from the
  parent's session header, so the board tools map it to the right canvas.
- **Proof**: `dsh-subagent/lib/index.js:470-480` (`childSessionMeta`), `:510-522` (`applyChildComposition`),
  `:1065-1091` (`materializeTracked`); `dsh-agent-preset-registry/lib/index.js:708-718` (`composeFrom`).

### `toolFilter.allow` must name only tools that exist
- **Actual**: the in-process child applies `toolFilter` with `tools.restrict`, which throws on a name that is not a
  known inherited tool. Scout's §2.4 list names `web_search`, `fetch_url`, `read_source`, `capture_page` (P3.5) and
  Builder's `write_design_frame` (P3.8), which do not exist yet, so `childToolAllow(role)` intersects the allow-list
  with `PRESET_TOOL_NAMES`; each later task appends its tools there.
- **Proof**: `dsh-tools/lib/index.js` `restrict` (unknown-name check against `view(scope).restrictableNames`).

### A child persona replaces Orb's persona but is not a "complete" prompt
- **Actual**: `request.persona` is registered as the child's own `deployment:persona-prefix` section (shadowing
  Orb's), without `complete`, so the child's system prompt is the normal assembly: one harness line ("You are an AI
  agent powered by DeepSeek Harness.") followed by the child persona (the preset's `suppressRuntimeContext` still
  applies). Seen in the mock request of `apps/ui/test/team.contract.test.ts`. Harmless; left as the harness composes it.
- **Proof**: `dsh-subagent/lib/index.js:510-522`; `dsh-persona/lib/index.js:35-47` (Orb's row sets `complete: true`).

### A settled child is disposed, and its parent is WOKEN with a settlement notice
- **Actual**: when a continuable child goes idle with an empty inbox, the manager disposes its activation (it leaves
  the agent registry; the next `sendMessage` cold-resumes it from its session, with the same persona and filter) and
  sends the parent a user message "Background subagent <id> finished …" / "… was stopped before it finished." with
  `sendWaking` (queue when the parent is idle, steer when running). Consequences: Orb is woken when a child finishes
  even without `send_message`; and a Stop that cancels Orb and its children makes each child's notice start a NEW Orb
  turn afterwards. P3.7 (stop-all) must deal with this (e.g. interrupt/drain the children before cancelling the root,
  or cancel the root again for notices that arrive inside the stop window).
- **Proof**: `dsh-subagent/lib/index.js:1155-1197` (`watchSettlement`), `:1246-1270` (`notifySettlement`,
  `createSettlementMessage` at `:633-660`); observed in `apps/ui/test/team.contract.test.ts` (Orb requests carrying
  "Background subagent … finished").

### Child → parent and parent → child messages
- `ctx.subagents.sendMessage(sender, targetId, content, {signal})` delivers a child's message to its parent as a
  steer that wakes it, prefixed "Agent <id> sent a message: " (`createAgentMessage`), and a parent's message to a
  child as a steer (cold-resuming a settled child). Orb's `send_message` is its own tool (the harness
  `tool-subagent-control` row would also add `interrupt_agent` and an `agent_id` argument); because it is not marked
  with `markAdjacentAgentSendMessageTool`, the harness does not append its own "send your result with
  send_message({agent_id…})" guidance to the child's first prompt.
- `interrupt(childId, {kind: 'ancestor', agent})` is fire-and-return; Orb's `stop_agent` then awaits the live child's
  `whenIdle()` (≤1 s, abortable). An interrupt that lands before the child's first model request leaves no request
  at all (seen once in the contract test; the test waits 1 s before stopping).
- **Proof**: `dsh-subagent/lib/index.js:1758-1777` (`sendMessage`), `:1809-1845` (`deliverToChild`), `:1857-1874`
  (`sendToParent`), `:575-591` (`createAgentMessage`), `:599-605` (`withContinuableReturnGuidance`), `:1738`;
  `dsh-tool-subagent-control/lib/index.js`.

### `inject()` takes a UserMessage; Orb uses the harness's `agent-message` source for progress notes
- `agent.inject(createUserMessage({content, source}))` adds context at the next step without waking (P1.0). Message
  sources are merge-extensible; Orb reuses `{kind: 'agent-message', form: 'relay', senderSessionId}` (the kind dsh-subagent
  declares for adjacent-agent messages) rather than inventing one, so nothing custom is appended to the session log.
- **Proof**: `dsh-agent/lib/types/runtime-types.d.ts:200-209`; `dsh-subagent/lib/index.js:572-578`
  (`agentMessageSource`); `dsh-llm/lib/types/message.d.ts:101-122`.

### Stale child id: `sendMessage` to a child that cannot be continued fails for good (P3.4 review)
- **Actual**: a canvas.json `childAgentIds` entry whose session is missing (the app quit between Orb recording the
  id and the child's first save) or has no continuation state makes `sendMessage` throw `SubagentError`
  `NOT_RESUMABLE` (`subagent "<id>" is unavailable`), and a child of another root session throws `UNAUTHORIZED`
  (`… belongs to another parent session`). Without handling, every later `delegate` to that role would fail. Orb's
  `delegate` now drops such an id (`unsetChildAgent`) and starts a fresh child; any other delivery error stays the
  tool's error. Test: `packages/orb-agents/test/team.test.ts` ('a child id that cannot be continued …').
- **Proof**: `dsh-subagent/lib/index.js:1908-1911`, `:1917` (`coldResume`), `:957-958` (`authorizeLineage`).

## P3.5 Sources (`web_search`, `fetch_url`, `read_source`, `capture_page`)

### The web seam runs a search only when exactly ONE provider is usable
- **Expected** (BUILD_PLAN P3.5): register Brave and Tavily through `ctx.web.registerSearchProvider` next to the
  DeepSeek provider and let `web_search` use "the harness `ctx.web` search providers".
- **Actual**: `WebRuntime.search` resolves the provider at call time: a pinned `searchProvider` id must exist and be
  `available()`, otherwise exactly one registered provider may be available; two usable providers throw
  `WEB_PROVIDER_AMBIGUOUS`, none `WEB_PROVIDER_UNAVAILABLE`. `available()` is synchronous ("a cheap local check").
  dsh-base pins `searchProvider: deepseek-official` (the `web-search-deepseek` row Orb disables since P1.2).
- **Decision**: Orb's patch drops the pin (`web` row config is now only `fetchProvider: http`), and each Orb provider
  is `available()` only while it is the FIRST configured one in Brave → Tavily → OpenAI order
  (`selectSearchProvider`, packages/orb-sources/src/search.ts). The configured state comes from
  `credentials.describe(ref)` (no value read), cached because `available()` is synchronous, refreshed at mount, on
  `credentials/reference-updated` and before every `web_search`; the key value itself is resolved per search and
  never kept. With no key, `web_search` answers (a normal result, not an error) that no search provider is
  configured and that `fetch_url` still works on known URLs.
- **Proof**: `dsh-web/lib/index.js:67-75` (`registerSearchProvider`), `:96-101` (`search`), `:119-131`
  (`resolveProvider`); `docs/spike/orb-dump-config.yml` (`web` row); `packages/orb-canvas/src/web.ts`.

### DeepSeek web search stays off
- `dsh-web-search-deepseek`'s `available()` is true whenever a key RESOLVER exists (it always does: it reads the
  credential at search time), so enabling the row would make every search ambiguous next to Orb's providers, and it
  calls `api.deepseek.com` (not a configured provider: there is no DeepSeek key). The row stays disabled; when a
  DeepSeek key exists (P4), Orb can pin it or wrap it in the same first-configured rule.
- **Proof**: `dsh-web-search-deepseek/lib/index.js:99-102` (`available`), `:302-326` (`resolveOptions`).

### OpenAI web search works through the Responses API (user decision: OpenAI for every agent)
- **Checked live (2026-10-14, gpt-6-luna)**: `POST https://api.openai.com/v1/responses` with
  `tools: [{type: 'web_search'}]`, `tool_choice: 'required'`, `include: ['web_search_call.action.sources']`,
  `store: false` returns a `web_search_call` item (its `action.sources` lists every URL consulted, ~50) and a message
  whose `output_text` carries `url_citation` annotations (url, title, start/end index; URLs tagged
  `?utm_source=openai`). One search took 11.8 s and returned 5 cited + 47 listed sources. Orb maps the cited ones
  first (title, the cited line as snippet, the tag removed), then the listed ones; dsh-web's `maxResults` cap keeps
  the cited ones. An answer without a `web_search_call` is an error, never a result from the model's memory.
- **Feasible and small**: it is a plain HTTPS call to the OpenAI host Orb already uses for its model, with the same
  `OPENAI_API_KEY` reference resolved by the CredentialProvider, so it adds no destination; it is the last-resort
  provider (used only when no Brave/Tavily key is configured). It does not go through `ctx.llm`/pi-ai (pi-ai's
  openai-responses route has no server-tool support), so it is Orb's own provider class.
- **Proof**: `packages/orb-sources/src/search.ts` (`OpenAiSearchProvider`, `mapResponsesSearch`);
  `pnpm egress-audit --mode live --scout` (PROGRESS P3.5 row).

### `dsh-web-fetch-http` cannot back `fetch_url`; Orb has its own transport with the same safety rules
- **Actual**: the harness fetch provider decodes only `html`/`text` (`WebFetchBody` has no PDF arm; a PDF throws
  `WEB_UNSUPPORTED_CONTENT_TYPE`), refuses cross-origin redirects outright, and truncates instead of refusing at the
  byte cap. Its safety design is sound and Orb's `fetchResource` (packages/orb-sources/src/fetcher.ts) follows it:
  resolve once, refuse the whole answer set if any address is non-public (IPv4-mapped IPv6 judged as IPv4), pin the
  undici connection to the checked addresses via `connect.lookup` (no second resolution, so no DNS rebinding), and
  through a user-exported proxy (`proxyRouteFor(url).proxied`) send via the policy's dispatcher without a local
  lookup (the proxy resolves) but still refuse IP literals and local names. Orb differs on purpose: PDFs are read
  (pdf.js text), a redirect to ANOTHER origin is followed when it passes the same checks (max 5 hops, no https →
  http), and anything over 5 MB is refused, not cut.
- **Correction to SPIKE_NOTES §P1.11** ("web-fetch-http pins its own transport (`proxy-exempt`) so Scout's fetches go
  direct"): in 0.2.0-rc.2 the provider asks `proxyRouteFor` per URL and uses the proxy when one is configured; Orb's
  fetcher does the same, so in the egress audit Scout's fetches are seen by the proxy (no local DNS for the site).
- **Proof**: `dsh-web-fetch-http/lib/index.js:192-205` (`requestVia`), `:305-307` (`isSameOrigin`), `:317-322`
  (`classifyContentType`), `:465-490` (redirect handling), `:499-506` (`requestOnce`: proxied route), `:572-577`
  (byte cap truncates); `dsh-web/lib/types/types.d.ts` (`WebFetchBody` = html | text);
  `dsh-http-proxy/lib/types/install.d.ts` (`proxyRouteFor`); `scripts/test/egress-audit.test.ts`.

### Tool results with two text parts are concatenated without a separator
- **Actual**: on the mock's `openai-completions` route a tool result with two `text` blocks reaches the model as one
  string with the parts glued together (`…"next":"…"}Finding 0: …`). `fetch_url` / `read_source` therefore render ONE
  text block: the metadata JSON line, a blank line, then the page text unescaped.
- **Proof**: observed in `apps/ui/test/sources.contract.test.ts` before the fix; `packages/orb-canvas/src/sources.ts`
  (`renderPage`).

### Page capture: a hidden window captures fine through the DevTools protocol
- **Checked (Electron 44.7.0, macOS)**: a `show: false` BrowserWindow (`paintWhenInitiallyHidden` default) on the
  in-memory partition `temp:capture`, `sandbox: true`, no preload, gives a full-page PNG with
  `webContents.debugger` → `Emulation.setDeviceMetricsOverride({width: 1280, deviceScaleFactor: 1})`,
  `Page.getLayoutMetrics` (`cssContentSize`), `Page.captureScreenshot({captureBeyondViewport: true, clip})`: a 2400 px
  page captured at 1280 × 2400 including content painted 1 s after load (`apps/desktop/e2e/capture.spec.ts`). Colours
  shift by a few sRGB units (the window's colour profile), so the e2e compares with a tolerance. The capture session
  mirrors an exported HTTP(S) proxy (`ses.setProxy`), otherwise `mode: 'direct'` (never the system proxy, so the
  per-request address check always applies to direct connections).
- **Known limit**: Chromium resolves host names itself, after `onBeforeRequest` has checked them, so the capture
  window's private-address check cannot pin addresses the way `fetch_url` does (a rebinding DNS answer between the
  two lookups is possible). Mitigations: the sidecar and main both check the URL first, every subresource is checked,
  the window is sandboxed with no preload, the partition is in-memory and cleared after each capture, and only the
  PNG leaves the window.

## P3.6 Agent UI (cursors, conversation panel, provenance, threads)

### `session/page` reads the turn that produced a card, for Orb and for its children
- **Expected** (plan): "the provenance detail loads the session event range through the gateway session page endpoint".
- **Actual**: `session/page` takes `{address, throughSeq, beforeSeq?, maxMessages?, turnWindow?}` and pages BACKWARDS
  from `throughSeq` (inclusive), message-aligned; `turnWindow: {minMessages: 1, minTurns: 1}` stops at the turn's
  `turn/start`, so one call returns exactly the turn up to the tool call. It never activates an agent. A child
  (continuable subagent) session cannot be read by its own id: the address must be
  `{kind: 'subagent', parentSessionId: <root>, childSessionId, mode: 'continuable'}` (a `{kind: 'session'}` address of
  a subagent session is refused with `session/agent-busy`). `throughSeq` must not be past the log's cursor.
- **How Orb uses it**: every agent card's provenance now carries `eventSeq` = `exec.agent.session.seq - 1` when the
  tool runs (`Session.seq` is the NEXT seq; the `tool/call` event is appended before the tool executes, so it is at
  or before `eventSeq`). The UI pages `throughSeq: eventSeq` with a one-turn window and highlights the `tool/call`
  whose `callId` is the card's `toolCallId`. `Session.snapshotEvents()` (a synchronous read) is deprecated for new
  callers, so the host never reads the log itself.
- **Proof**: `dsh-api-session-controller/lib/index.js:1410` (`page`), `:1652` (`paginate`), `:1626`
  (`validateAddress`), `lib/types/types.d.ts:386` (`SessionAddress`), `:444` (`SessionPageRequest`);
  `dsh-session/lib/index.js:1401` (`get seq`), `lib/types/index.d.ts:185-193` (`snapshotEvents` deprecated);
  `dsh-agent-loop/lib/index.js:682` (`tool/call` append). Tests: `apps/ui/test/agentui.contract.test.ts`.

### Following a root session's turns from a host row: `session/event` with `{global: true}`
- **Actual**: `ctx.on('session/event', (session, event) => …, {global: true})` sees every appended event of every
  session (the session controller's own follow uses it). Order inside a turn: `turn/start`, then the claimed
  `user/message`(s), `assistant/message` per step, `turn/end`. A `user/message` event's `data` IS the `UserMessage`
  (`{id, role, content, source}`), not `{message}` as for `assistant/message`. Injected notes and child messages are
  `user/message`s too, with a non-`user` source. Orb's thread tracking (`OrbAgents.onSessionEvent`) keys on these:
  a turn whose user-sourced message carries a `<thread of="…">` context part is that thread's turn.
- **Turn numbers**: the running phase starts from the agent's `lastTurn`; Orb's UI keys turns by their ORDER in the
  stream, never by number, so a resumed session can never collide.
- **Proof**: `dsh-api-session-controller/lib/index.js:1464`; `dsh-agent-loop/lib/index.js:943` (`turn/start`),
  `:1027` (`turn/end`), `:1061` (`user/message` appended with the message itself), `:862` (phase `turn`).

### Per-agent Stop of a child uses the user's interrupt authority
- **Actual**: `ctx.subagents.interrupt(childId, {kind: 'user', parentSessionId: <root>})` interrupts one child for the
  user (the root agent and the other children keep running); the child's unclaimed inbox is kept, as with the
  ancestor authority Orb's `stop_agent` uses. Orb waits up to 1 s for the child's `whenIdle()` and publishes
  `stopping` → `stopped` for that agent only. A role never started answers `orb/not-found`. Pause / resume /
  redirect stay P3.7.
- **Proof**: `dsh-subagent/lib/types/types.d.ts:57-63` (`SubagentInterruptAuthority`),
  `dsh-subagent/lib/types/index.d.ts:170-186` (`interrupt`). Test: `apps/ui/test/agentui.contract.test.ts`
  (Scout stopped mid-stream in < 1 s, Orb untouched).

## P3.7 Pause, resume, redirect, stop-all

### `cancel({keepInbox: true})` halts the turn and leaves the queue parked (no automatic next turn)
- **Actual**: `cancel(cause, {keepInbox: true})` skips `inbox.clear()` and only aborts the active phase. The aborted
  `turn()` throws, `kick()` sets the phase back to idle and starts another driver only when `wakeRequested` is set,
  which only a WAKING `send` made after the abort does. So items already queued stay parked until something wakes
  the agent: exactly "halt the turn but keep the queue". `subagents.interrupt` is the same call on the child
  (`cancel({kind:'user'|'parent'}, {keepInbox: true})`).
- **Proof**: `dsh-agent-loop/lib/index.js:815-821` (`cancel`), `:854-873` (`wakeDriver`, latch), `:887-900` (`kick`);
  `dsh-subagent/lib/index.js:843-856` and `:1853` (`interrupt`).

### Holding a paused agent: a row-level `agent/pre-step` listener rejects its steps
- **Actual**: anything can still wake a paused agent: the harness's settlement notice (`sendWaking` → `steer` /
  `followup` on the root, not routed through Orb), a waking send latched after the abort. Orb's `orb-agents` row
  registers `ctx.on('agent/pre-step', …)` at the row (not agent) scope, so it sees every agent's steps (the session
  controller rejects archived sessions' steps the same way). For a paused canvas agent it returns `{kind:'reject'}`:
  the turn ends `blocked` with no model request. A rejected step's claimed messages are NOT put back (the inbox
  `claim` removed them and nothing is appended), so Orb keeps them (`stashed`) and re-sends them on Resume.
- **Resume**: the held items (stashed messages, chat, redirects, a child's `send_message`) go back with `inject()`
  (next-step, no wake), then `steer(RESUME_TEXT)` wakes the agent and its first step claims them all together. A
  `followup()` after the steer would be claimed one turn later: the driver starts synchronously inside
  `wakeDriver` and claims before the next line runs (seen in the contract test before the fix). A child gets one
  `sendMessage` (cold-resumed when it settled). RESUME_TEXT is a `{kind: 'user'}` message: a custom source kind is
  not safe, because the gateway's typert types for `session/follow` hold a CLOSED union of message source kinds.
- **Proof**: `dsh-agent-loop/lib/index.js:902-925` (`preStep`: claim, then the `agent/pre-step` waterfall),
  `:103-111` (`claim`), `:958-961` (reject → `blocked`); `dsh-api-session-controller/lib/index.js:2430` (row-level
  reject precedent); `dsh-api-session-controller/lib/typert.host.js` (`MessageSourceMap`). Tests:
  `packages/orb-agents/test/control.test.ts`, `apps/ui/test/control.contract.test.ts`.

### Settlement notices after a user Stop / Pause: kept out of Orb's turns
- **Actual** (the P3.4 open item): a child that settles after the user stopped or paused it sends Orb "Background
  subagent … was stopped before it finished" with `sendWaking`, which started a new Orb turn right after Stop all.
  Orb marks the child sessions it stops or pauses for the user (`quiet`); the pre-step listener takes a
  `{kind: 'subagent-settled', senderSessionId}` notice of such a child out of Orb's step (each mark is used once) and
  rejects a first step left with nothing else, so no model request is made. The notices are handed to Orb with the
  user's next message (`inject` before the follow-up), so Orb still learns what happened. Orb's own `stop_agent`
  keeps the harness behaviour. After a stop, an agent's harness `running` is published only once a step really
  starts (a rejected wake turn flips running → idle and would overwrite `stopped`).
- **Proof**: `dsh-subagent/lib/index.js:1254-1268` (`notifySettlement`), `:633-660` (`createSettlementMessage`:
  source `subagent-settled`, `senderSessionId`). Mutation check: with the filter disabled,
  `apps/ui/test/control.contract.test.ts` fails (Orb is woken after Stop all and after Pause).

### Pause all can land while Orb is still starting a child
- **Actual**: Pause cancels Orb's turn, which aborts an in-flight `delegate`; `startContinuable` is aborted and the
  tool takes the child id back from canvas.json (`unsetChildAgent`). The child had been marked paused, so Resume all
  found a paused role without an id and called `sendMessage(root, undefined)`, which the harness rejects with
  "… is not a resident continuable child and cannot send to parent "undefined"" (`sendMessage` compares the target
  with the sender's `parentSession`, undefined for a root). Seen in the live check; Resume now drops such a pause
  (Orb's "continue" re-delegates; in the live run it did). Test: `control.test.ts` ('Resume all skips a child …').
- **Proof**: `dsh-subagent/lib/index.js:1762-1775` (`sendMessage`).

### Every Orb tool honours `exec.signal`
- Every preset tool row (board, sources, team) registers through `abortFirst` (`packages/orb-canvas/src/errors.ts`):
  a call whose signal is already aborted fails with the signal's reason before argument checks, reads or writes. Mid-
  call aborts were already handled per tool (signal passed to fetch/search/subagents, re-checked before each write).
  `packages/orb-agents/test/signal.test.ts` calls all 16 preset tools with an aborted signal: each rejects with the
  reason; no board event, search, message or status change. The team tools also re-check after their reads.

### Measured: Stop all during Scenario A (2026-10-14, M-series Mac, mock LLM on 127.0.0.1)
- **e2e** (`apps/desktop/e2e/control.spec.ts`, real window): Home question → Orb adds 3 frames and delegates Scout and
  Critic → Orb, Scout and Critic all streaming → Stop all from the header menu; 20 runs per pass (run 1 is the
  new-canvas turn, runs 2-20 restart the team from the chat). Every run `stopped`, every model stream aborted, both
  children `stopped`, no Orb request in the 300 ms after. Server = `orb/agents.control` entry → every agent's
  `whenIdle()` (`data-stop-ms`); UI = click → panel reads `stopped` (includes Playwright's polling).

  | Pass (20 runs each) | server p50 | server p95 | server max | UI p50 | UI p95 | UI max |
  |---|---|---|---|---|---|---|
  | full `pnpm e2e` | 5.7 ms | 8.9 ms | 14.4 ms | 53 ms | 59 ms | 70 ms |
  | spec re-run 1 | 4.3 ms | 6.5 ms | 7.8 ms | 53 ms | 57 ms | 177 ms |
  | spec re-run 2 | 3.8 ms | 6.4 ms | 11.1 ms | 53 ms | 61 ms | 68 ms |
  | spec re-run 3 | 3.9 ms | 5.8 ms | 6.4 ms | 53 ms | 57 ms | 60 ms |
  | final `pnpm e2e` | 5.3 ms | 8.5 ms | 9.1 ms | 53 ms | 64 ms | 68 ms |

  Each pass writes `.orb-dev/e2e-results/p3.7-stop-all.json` (all runs).
- **Contract** (`apps/ui/test/control.contract.test.ts`, 20 runs, 3 agents each): server p50 5.5–6.8 ms, p95
  7.9–9.3 ms, max 9.3 ms.
- **Live** (gpt-6-luna, temp homes, one run): new canvas → Orb started Scout and Critic → Pause all 55 ms
  (3 agents, 0 sessions running 4 s later) → Resume all (Orb and Scout continued; Orb re-delegated Critic, whose
  start the pause had aborted) → Stop all 12.6 ms (3 agents), 0 sessions running and no wake 4 s later.

## P3.8 Builder cards (design frames, diagrams)

### A `srcdoc` design frame inherits the app's CSP, so its scripts never run
- **Expected** (PRD Card types › Design frames, BUILD_PLAN P3.8): `<iframe sandbox="allow-scripts" srcdoc=…>` with the
  PRD CSP (`default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:`) runs the
  frame's inline scripts for hover/toggle effects.
- **Actual** (Chromium in Electron 44.7.0, not the harness): an `about:srcdoc` document inherits the embedder's
  policy container (HTML spec "policy container" inheritance for local-scheme documents), sandboxed or not. Both
  policies apply, and the app's `script-src 'self' <gateway hashes>` (apps/desktop/src/main/security.ts
  `contentSecurityPolicy`) refuses every inline script and inline event handler inside the frame ("Executing inline
  script violates … 'script-src 'self''"). The app's `frame-src 'none'` does NOT block the srcdoc document itself.
  Reproduced with a minimal Electron 44.7.0 page (header CSP `script-src 'self'`, a sandboxed srcdoc iframe with the
  PRD meta CSP and an inline script: blocked, with and without `frame-src 'none'`).
- **What Orb does**: keeps `srcdoc` + `sandbox="allow-scripts"` + the PRD CSP as the frame's first `<meta>` (both
  required by the plan), and treats a design frame as a static screen: `apps/ui/src/cards/design.ts` removes scripts,
  `on*` handlers, non-`data:` media URLs, links, nested frames, `<base>`, `<link>` and `<meta http-equiv>` before
  rendering (no CSP-violation noise), and Builder's persona and the tool description ask for CSS-only effects (CSS
  `:hover`, `:focus`, `<details>` work). Relaxing the app CSP is not an option (an `'unsafe-inline'` next to hashes is
  ignored, without hashes it would open the whole app). If scripted frames are wanted later: serve each frame from a
  sidecar route whose response carries the PRD CSP + `sandbox allow-scripts` as headers (not inherited), allow only
  that path in the app's `frame-src`, and keep the route out of the `withCsp` override.
- **Proof**: `apps/desktop/e2e/builder.spec.ts` (the frame's title stays the HTML's `<title>`, i.e. the agent's
  `document.title = …` script never ran; origin `null`; parent and cookie blocked; `fetch` to the app origin refused).

### Design files are not served
- `assets/design/<cardId>.html` (written by `packages/orb-canvas/src/design.ts`) is not reachable through orb-host's
  asset route: `assetFile` (packages/orb-canvas/src/assets.ts) accepts only `assets/<name>` with an accepted upload
  type, so a nested path and `.html` are refused. The board renders the HTML from the card data (`DesignData.html`),
  never from the file.

### Mermaid 12.1.0 bundles cleanly under the app CSP
- `mermaid` 12.1.0 (exact pin in apps/ui/package.json) is imported lazily (`import('mermaid')` in
  apps/ui/src/cards/mermaid.ts); Vite splits it and its diagram types into chunks of the UI dist served by the sidecar.
  No `eval`/`new Function` on the render path, no CDN fetch (the egress-relevant request filter saw none in
  `builder.spec.ts`), its `<style>` inside the SVG is allowed by the app's `style-src 'unsafe-inline'`.
  `securityLevel: 'strict'`, `htmlLabels: false` (plain SVG text, no `foreignObject`).

## P3.gate Gate 3 audit (2026-10-14)

### An injected progress note lands after the tool results of Orb's next step
- **Actual**: a child's `report_progress` note (`inject()`, see "`inject()` takes a UserMessage" above) reaches the
  model at Orb's NEXT step, as a user message placed AFTER the tool results of the step that was running. So a request
  that answers Orb's `delegate` calls can end with `[Scout progress] …` user messages, not with the tool messages.
  Anything that reads "which calls does this request answer" (the scripted mocks) must look for tool messages after
  the last assistant message, not at the last message only. `apps/desktop/e2e/scenarioA.spec.ts` (`answeredCalls`)
  does; `control.spec.ts` keys on the last message and only works because its children stream text without
  reporting progress. No product change.
- **Proof**: the Scenario A e2e's first version answered Orb's delegate step with "Noted." (its `answeredCalls` saw a
  trailing user message), seen in the panel text of the failing run; the note placement is the `inject()` contract
  (`dsh-agent/lib/types/runtime-types.d.ts:200-209`).

### Agent cards keep their layout height at full detail (UI fix)
- **Actual (bug)**: at full LOD every card was drawn with `minHeight: card.h`, so a live model's long source summary
  (up to 2000 chars) plus a three-line why line made the card taller than the cell the layout engine gave it. The
  frame had grown only for the cell height, so the card ran over the card below and out of its frame, onto the next
  frame (live gpt-6-luna run 1: Scout's NIST source in "Agent Workflow" overlapped "04 First Screen").
- **Fix**: an agent card at full LOD is fixed at `card.h`; the title, why line and footer keep their size and the
  content between them is clipped with an 18 px fade (`.fixed` / `.cardClip`, `apps/ui/src/canvas/BoardCard.tsx`,
  `canvas.module.css`); the reader shows the whole text. User cards still grow with their text. The Scenario A e2e
  checks every agent card's rendered height equals its layout height (one with a 1.5k-char summary) and that the why
  line is inside the card.
- **Left open**: with a two-line title and a three-line why line, a 240 px source cell shows only a line of summary.
  Better cell heights (or a two-line why clamp) are a design call for P4/P5 polish.

### Measured at the gate
- **Scenario A e2e, mock** (`apps/desktop/e2e/scenarioA.spec.ts`, 10–11 s; 3/3 repeat runs + 2 full `pnpm e2e` green):
  Home idea → 5 frames → Scout (2 sources, 1 quote) and Critic (risk, question) in the same turn → thread → linked
  question next to the source → user note → Builder (design frame, Mermaid diagram) → every agent card with its why
  line, provenance view, every child's cursor on its frame; then per-agent Redirect / Pause (queued redirect) /
  Resume / Stop for Scout, Critic, Builder and Orb: Stop → stream aborted in 155–182 ms including the UI click.
- **Stop all 20× (control.spec, final `pnpm e2e`)**: server p50 3.3 / p95 4.9 / max 6.1 ms; UI p50 53 / p95 56 /
  max 56 ms.
- **Live Scenario A, gpt-6-luna** (`scripts/live-scenario-a.ts`, temp homes, two runs of 100 s and 80 s): Orb added 4
  then 3 frames and started Scout and Critic in the new-canvas turn; Scout placed 2 sources from NIST / ODNI pages it
  searched and read; Critic placed a risk and a question; on "Ask Builder for one first screen" Orb delegated Builder,
  which placed one design frame; every card had a why line and `openai/gpt-6-luna` provenance; links: 4 (run 1), 1
  `supports` (run 2); cursors and labels seen for all three children ("Scout, reviewing authoritative analytic
  standards", "Critic, checking workflow assumptions", "Builder, reviewing Agent Workflow frame before des…"); at
  most 3 cards in a frame; Stop all at the end 5.6 ms (`stopped`).
- **Egress**: `pnpm egress-audit --mode deterministic` PASS (Scout: 1 search, 5 fetches to `mock-site.orb.test`);
  `--mode live --scout` PASS (api.openai.com + www.iea.org, the one page Scout fetched).

## P4.1 orb-keychain (credentials in the macOS Keychain)

### A profile patch cannot swap a row's plugin, so the base `credentials` row is disabled and a new row provides it
- **Expected** (BUILD_PLAN P4.1): "it replaces the base `credentials` row in orb-bundle's patch".
- **Actual**: an id-patch whose `name` differs from the row's is skipped with a warning ("patch: name mismatch …,
  skipping"); `name` is a guard, not an override. So orb-bundle's patch sets `{id: credentials, disabled: true}` and
  inserts `{id: orb-keychain, name: '@orb/host/keychain'}`. `CredentialProvider`'s constructor registers the service
  name `credentials` itself (`super(ctx, "credentials")`), so the new row is the one `ctx.credentials`; every consumer
  (llm-pi-ai, client-connection, the settings controller, Orb's search providers) injects the service, not the row id.
  - Proof: `cordis-plugin-include/lib/index.js:95-98` (`applyEntryPatches` name guard); `dsh-credentials/lib/index.js`
    (`CredentialProvider` constructor); `dsh-base/cordis.patch.yml:117-118` (the base row).
  - Test: `scripts/test/dump-config.test.ts` ('P4.1: the plaintext credentials row is off; orb-keychain … is the one
    credentials provider'); `docs/spike/orb-dump-config.yml` regenerated.
- **Where the class lives**: CLAUDE.md allows harness seams only in orb-host / orb-agents / orb-canvas, so the
  `CredentialProvider` subclass is `packages/orb-host/src/keychain.ts` (`@orb/host/keychain`); `@orb/keychain`
  (packages/orb-keychain) holds the harness-free Keychain store, redaction and a CLI.

### The harness itself keeps a secret in the credential store: the browser-session record
- `client-connection` stores its cookie-signing secret as the record `client-connection/browser-session`
  (`kind: grant`) with `modifyRecord` create-if-absent at activation, so a credentials provider must implement the
  record half (`readRecord`/`modifyRecord`/`deleteRecord`/`listRecords`), serialized. In the Keychain it is the item
  `record:client-connection/browser-session` (JSON). The dev plaintext file held it too, and it is migrated with the
  keys (a migrated secret keeps existing browser cookies valid).
  - Proof: `dsh-client-connection/lib/index.js:223` (`AUTH_RECORD_KEY`), `:325-342` (`initializeSecret`).

### dsh's credentials Remote namespace stays mounted, and now writes the Keychain
- `settings-controller` (`dsh-api-settings-controller`) is enabled in the composed tree and serves the `credentials`
  namespace (`describe` / `set` / `unset`) on the authenticated gateway. It calls `ctx.credentials`, i.e. orb-keychain,
  so it cannot write plaintext; its `describe` projects only `{configured, source, writable}`
  (`dsh-api-settings-controller/lib/index.js:76-82` `projectCredentialInfo`, `:150-193`). Orb's UI uses `orb/keys.*`.

### Keychain items are owned by the binary that created them: a different binary blocks on a prompt
- **Measured** (2026-10-15, macOS 15.6): an item set by the dev Electron binary (ad-hoc signed,
  `node_modules/electron/dist/Electron.app`, as the sidecar runs it with ELECTRON_RUN_AS_NODE=1) and then read with
  plain `node` (`@napi-rs/keyring` `getPassword` / `findCredentials`) hangs on a macOS access prompt (killed after 8 s);
  `deletePassword` from `node` fails with "Invalid attempt to change the owner of this item". The same binary reads
  and deletes without a prompt.
- **Consequence**: everything outside the sidecar that touches the sidecar's items runs `@orb/keychain`'s CLI
  (`packages/orb-keychain/lib/cli.js`) under the Electron binary: test cleanup and checks (`scripts/testkit/keychain.ts`)
  and the dev key helper for live checks (`scripts/util/devKey.ts`). `security find-generic-password -s … -a …`
  (attributes, no `-w`) and `security dump-keychain` (attributes) do not prompt.
- The packaged app (Phase 5) is a different code identity from the dev binary; dev items are not shared with it
  (already noted in SPIKE_NOTES §P1.12).

### Test isolation
- The provider honours `ORB_KEYCHAIN_SERVICE` only for `ai.orb.app.test.*` (else `ai.orb.app`):
  `@orb/keychain` `resolveKeychainService`. The testkit gives each sidecar its own service and clears it on stop (or at
  process exit for a sidecar restarted on one home); Vitest defaults every launched process to
  `ai.orb.app.test.vitest` and its global teardown sweeps every `ai.orb.app.test.*` service (`security dump-keychain`);
  the e2e suite uses `ai.orb.app.test.e2e`, cleared in Playwright's global setup and teardown. No test reads or writes
  `ai.orb.app`, so the dev key is never used by `pnpm test` / `pnpm e2e`.

## P4.2 Models settings (provider cards, Test, custom providers, discovery, per-agent picker, first run)

### Provider routes are written through the harness settings service and apply on the next request (no restart)
- **Expected** (BUILD_PLAN P4.2): write custom providers to `DSH_HOME/settings.yaml` under `llm-pi-ai.providers`.
- **Actual**: `settings.yaml` is legacy in 0.2 (imported once into the profile patch and renamed, SPIKE_NOTES §P1.0).
  The live path is the `settings` service (dsh-settings `SettingsForms`, mounted whenever a profile is booted:
  `profileContext` is always provided by `dsh/lib/profile-boot-*.js:259-273`). `settings.mutate('llm-pi-ai', ops)`
  goes through `ConfigEditor.edit`, which validates the next config (llm-pi-ai's `internal/config` hook runs
  `assertServiceable`, so a bad route is refused before anything is written), writes the PROFILE patch
  (`DSH_HOME/profiles/orb/cordis.patch.yml`, the last row of that id) and reconciles only that row. Because
  `providers` is a volatile field, the row is not restarted: llm-pi-ai re-registers its routes and its provider
  directory on `loader/volatile-update`, so the next `ctx.llm.stream` already sees a new or removed route.
  Verified: a custom provider added at runtime answers the very next Test (`apps/ui/test/models.contract.test.ts`).
- **Orb's consequence**: the desktop app rewrites the profile patch from the template at every launch, so Orb keeps its
  custom providers in orb.json (no secrets) and orb-models restates them into llm-pi-ai once the loader settles. The
  four provider cards (OpenAI, DeepSeek, Anthropic, OpenRouter) are catalog routes in the template itself
  (`profiles/orb/cordis.patch.yml`); a missing one (a test profile) is added on demand by `ensureRoute`.
- **`mutate` vs `update`**: `update` deep-merges (arrays replace), so it cannot remove a route; Orb uses
  `mutate([{op:'set'|'unset', path:['providers', id]}])`, which replaces or deletes one route wholesale.
  `replace` resets to the INHERITED layer, which drops every route the profile itself declares (openai, the test mock),
  so it is not used.
- **Proof**: `dsh-settings/lib/index.js:346` (legacy import), `:488-530` (`mutate`/`write`);
  `dsh-config-editor/lib/index.js:69-138` (`edit`); `dsh-llm-pi-ai/lib/index.js:1051` (`providers` is volatile),
  `:2556-2562` (`internal/config` → `assertServiceable`), `:2628-2636` (`loader/volatile-update`).

### Test button: `ctx.llm.stream` with `maxTokens: 1`; failures arrive as a terminal `finish` chunk, not a throw
- Adapter failures (missing key, HTTP errors, transport) become one `{type:'finish', reason:{kind:'error', failure}}`
  chunk with a stable `failure.code` (`dsh-llm/lib/index.js` `adapterStream`, `adapterFailureChunk`). Codes seen:
  `MISSING_CREDENTIAL` (no key; no request leaves the machine), `AUTH` (401/403), `QUOTA` (pi-ai matches "insufficient
  balance/quota" text, e.g. DeepSeek's 402), `RATE_LIMIT` (429), `TRANSPORT`/`TIMEOUT` (unreachable), `NO_ADAPTER`.
  They are classified by llm-pi-ai from the provider's error text (`classifyPiAiError`). Orb maps them to plain
  messages (`failureKindOf`, packages/shared/src/models.ts) and scrubs the provider text of the key and key-like tokens.
- A direct `ctx.llm.stream` is not retried (dsh-llm-retry acts on the agent's failed step; pi-ai's SDK clients are
  created with `maxRetries: 0`), so a 429 or 5xx Test answers at once.
- **OpenAI Responses clamps `maxTokens: 1` to 16**: pi-ai sets `max_output_tokens = max(maxTokens, 16)` because the API
  rejects lower values; the other protocols send 1.
- **Live check (2026-10-15, gpt-6-luna, `scripts/live-keys-test.ts`)**: real key → Working (1.7–3.2 s); a made-up key →
  `AUTH` → "The key was rejected…" (0.6–0.8 s); the key text never appeared in a result.
- **Proof**: `dsh-llm-pi-ai/lib/index.js:1380-1391` (`classifyPiAiError`), `:2563-2570` (`MISSING_CREDENTIAL`);
  `@earendil-works/pi-ai/dist/api/openai-responses.js:16`, `:230-231`; `.../anthropic-messages.js:391`,
  `.../openai-completions.js:195` (`maxRetries: 0`).

### Discovery: catalog routes answer from the installed catalog; custom ones from the endpoint
- `ctx.llm.discoverModels('llm-pi-ai', {provider})` returns pi-ai's installed catalog for a catalog route (no network:
  OpenAI 41 models, OpenRouter ~386). A route without a catalog needs `baseURL` (+ `api`); the listing is
  `<baseURL>/models` (Anthropic: `/v1/models`), sent with the stored key of that route when `provider` is given, or
  with no key for a draft. **Proof**: `dsh-llm-pi-ai/lib/index.js:2140-2180`, `:2286-2337`, `:2608`.

### Per-agent routes and tier defaults
- orb.json `models[role]` (P3.3) is read at every agent start; P4.2 adds `null` to clear a role and a tier default:
  when the harness default model's provider has no key, a role with no pick starts on the tier model of the first
  provider with a key (Orb/Critic/Builder strong, Scout fast; OpenAI is GPT Luna 6 on both tiers). Verified with only a
  DeepSeek key: the root agent's next request goes to `deepseek-v4-pro` (`models.contract.test.ts`).

### First run
- The sheet is due when no route has a usable key and orb.json `firstRunDone` is false. The e2e suite sets
  `ORB_SKIP_FIRST_RUN=1` (playwright.config.ts) because most specs launch with no key and expect Home;
  `models.spec.ts` removes it to test the sheet.

## P4.3 Cost meter (tokens from the harness, prices from the pi-ai catalog)

### dsh has token usage but no money: prices come from pi-ai's catalog, read directly
- dsh-llm-pi-ai registers routes with `cost: base?.cost ?? NO_COST` and its replay usage zeroes every `cost` field;
  nothing in dsh reports spend. Orb reads list prices from `@earendil-works/pi-ai/providers/all` `getBuiltinModels`
  (0.87.1, now a direct exact-pinned dependency of `@orb/host`): gpt-6-luna is `{input 0.1, output 0.5, cacheRead
  0.01, cacheWrite 0.125}` USD per 1M tokens, with a tier above 272k input tokens per request that the table does not
  model (one rate per bucket, BUILD_PLAN P4.3; an Orb request is far below it). The custom mock routes are not in the
  catalog: they stay unpriced until the user sets a price.
- **Proof**: `dsh-llm-pi-ai/lib/index.js:30-50` (zeroed usage cost), `:265-271` (`NO_COST`, "the harness never reads
  pi-ai's cost metadata"), `:688`; `@earendil-works/pi-ai/dist/providers/all.d.ts` (`getBuiltinModels`),
  `dist/providers/data/openai.json` (`gpt-6-luna.cost`).

### Reading a canvas's usage: `ctx.sessionQuery`, live or cold, root and children
- `ctx.sessionQuery.observeSession(id, {projectionMode: 'all'})` serves a live session or a stored one (cold, cached
  per revision) and carries `projections.values.tokenUsage` (the four disjoint buckets) plus the events. Missing
  sessions (a root whose first turn was never saved) throw; Orb counts them as zero.
- Children: a subagent's header records `parentSession` = its parent's id, so `listSessions()` gives the whole tree
  (stale children canvas.json forgot included). Orb also adds every session whose `cwd` is the canvas folder.
- The harness projection has no route split, so Orb folds the same log per route (`packages/orb-host/src/costFold.ts`
  mirrors `tokenUsageProjectionDefinition`: last usage sample per `assistant/attempt|message`, same-step replacement,
  `llm/retry-started` adds; route = newest `request/header` config or `request/context`). The per-route sum is checked
  against the projection on every read (a difference is logged).
- **Proof**: `dsh-session-query/lib/types/index.d.ts` (`observeSession`, `listSessions`),
  `.../observation.d.ts` (`projections`), `dsh-subagent/lib/index.js:476` (`parentSession: parentHeader.id`),
  `dsh-session/lib/types/types.d.ts:70-71`, `:216-242`, `:393-405`, `dsh-token-meter/lib/index.js:340-358`, `:387-445`.

### OpenAI reports prompt-cache WRITES for gpt-6-luna; pi-ai splits them out of the input
- Live, every gpt-6-luna Responses answer carried `input_tokens_details.cache_write_tokens` beside `cached_tokens`
  (e.g. input 3011 = 3008 written + 3 uncached on a first request). pi-ai maps `input = input_tokens − cached −
  cache_write`, `cacheRead = cached`, `cacheWrite = cache_write`, so the harness buckets match OpenAI's exactly, and the
  write tokens are priced at the catalog's cacheWrite rate (0.125, above input's 0.1). The first live run's relay
  ignored `cache_write_tokens` and so disagreed; fixed in the script, not in Orb.
- **Proof**: `@earendil-works/pi-ai/dist/api/openai-responses-shared.js:439-449`.

### Live check (2026-10-15, gpt-6-luna, `scripts/live-cost-check.ts`)
- Orb's OpenAI route pointed at a local recording relay that forwards each request unchanged to api.openai.com and
  reads the `usage` of each `response.completed`. One small run: a chat message to Orb plus one delegated Critic
  question (2 sessions, 10–20 requests). `orb/cost.get` equalled OpenAI's numbers exactly on every bucket in 4 of 4
  runs after the relay fix (e.g. 11 requests: uncached 33, output 549, cache read 26 725, cache write 6 902 = 34 209
  tokens, $0.00140780 = tokens × the catalog price). The first run (relay without cache writes) also showed one
  Critic-sized request (2 333 in / 38 out) more on OpenAI's side than in the meter; it did not recur and could not be
  traced (homes deleted). A request OpenAI bills but whose stream the harness never sees finish (a dropped or retried
  attempt) carries no usage into the session, so the meter cannot count it.

## P4.4 Print pipeline (print routes, printToPDF, design-frame snapshots)

No new harness seam: the snapshot and export uploads are two more exact `/api` Fetch routes on the gateway's
authenticated channel (`ctx.connection.fetch.register`, `requestBody: 'streaming'`), next to the P2.5 asset routes
(`packages/orb-host/src/assets.ts`; `dsh-client-connection/lib/index.js:597-639`). The rest is Electron 44.7.0
(Chromium 146) behaviour, checked with a standalone spike and the e2e (`apps/desktop/e2e/print.spec.ts`):

- **The UI is served at `/`, so print routes live in the hash.** The hidden print window loads
  `<sidecar origin>/#/print/canvas?…`; `apps/ui/src/main.tsx` renders the print page instead of the app for
  `#/print/…`. Same session as the Orb window (the gateway's auth cookie rides along), same preload, request filter,
  CSP and navigation guards.
- **`capturePage` works on a hidden window** (`show: false`, `paintWhenInitiallyHidden: true`,
  `backgroundThrottling: false`), including a sandboxed `srcdoc` iframe (out-of-process) inside it, and a hidden
  window can be larger than the screen (`enableLargerThanScreen`; 1400 x 2100 here).
- **2x without `setZoomFactor`.** Zoom is per origin in Chromium: zooming the print window would zoom the Orb window
  too (same origin). The print page instead draws the design frame alone at the top left with `transform: scale(2)`
  (Chromium rasterises a static 2x transform crisply) and asks main to capture that 2W x 2H rectangle; main resizes
  the image to exactly that size (a Retina display would give 4x). A 640 px frame gives a 1280 px PNG.
- **`printToPDF({preferCSSPageSize: true})` honours `@page { size: Wpx Hpx }`** (1123 x 794 px = A4 landscape →
  MediaBox 842 x 595 pt), one page per `break-after: page` block; a poster page can be any size up to the PDF limit
  (Orb caps the drawing at 4800 px).
- **`@page` margin boxes work** (`@bottom-left { content: "…" }`, `counter(page)`, `counter(pages)`): the research
  document's running footer ("Page n of N") needs no `displayHeaderFooter` template.
- **Real `<a href>` links survive as PDF link annotations** (`/A << /S /URI /URI (https://…) >>`), and Chromium's PDF
  writes page dictionaries outside object streams, so `/Type /Page` counts the pages (`countPdfPages`,
  `apps/desktop/src/main/printJob.ts`). Mermaid's SVG prints as vector paths and text (the label text is extractable).
- **Timing** (e2e, this Mac): the 10-frame canvas PDF of the 11-type fixture, design snapshot included, takes about
  0.55 s from `exportPdf` to the stored file (0.85 s from the click), far under the 15 s budget.

## P4.5 Research document (`compose_section`, `port.compose`, reading view)

No new harness seam: `compose_section` is one more preset row (`orb-port-tools`, `@orb/canvas/port`, in the `orb`
preset's `plugins` like the board tools), and `port.*` are four more `@Remote` methods on orb-host. Facts relied on:

- **Nested object arrays in the parameter DSL.** `paragraphs: {type: 'array', items: {type: 'object',
  additionalProperties: false, properties: {text: {…, required: true}, cardIds: {type: 'array', items: {type:
  'string'}, required: true}}}}` compiles (a nested property map takes `required: true` like the root one) and is
  validated before `execute`. The DSL has no `minItems`, so an empty `cardIds` passes the harness check and is refused
  by Orb's own validator with the citation message (what the Gate 4 test wants: the model reads
  `Error: paragraph 2 has no citations: …`). Proof: `dsh-tools/lib/index.js:262`, `:448` (`case "object"` with a
  property map), `:802` (`parameterSchemaSpecToJsonSchema`), `:838-870` (validation before execute).
- **The OpenAI Responses route accepts the nested schema.** Live, gpt-6-luna (2026-10-15,
  `apps/ui/test/live-port-check.ts`, 2 runs): `port.compose` on a 5-card board in scope (a 6th card out of scope)
  gave 4 `compose_section` calls (summary, one per frame, open questions) in 10.5–11.0 s with no refused call, every
  paragraph cited 1–5 in-scope cards, figures on the table and source cards; `port.regenerateSection` rewrote the
  summary in 3.7–3.9 s. PASS both runs.
- **`followup` on an idle agent starts its turn synchronously, so `whenIdle()` right after it covers that turn.**
  `followup` → `send(…, 'next-turn', wakeup)` → `wakeDriver`, which sets the running phase and the new
  `activityDone` before returning; `whenIdle()` loops until no replacement driver was started, so it also waits for a
  queued turn behind a running one. Orb's compose job is therefore "queue the turn, `await whenIdle()`, read what
  `compose_section` wrote" with no event subscription. Proof: `dsh-agent-loop/lib/index.js:806` (`followup`), `:854`
  (`wakeDriver`), `:870` (`whenIdle`).
- **Tool results of a compose turn are ordinary session events.** Nothing about the document is appended to the
  session log (the CLAUDE.md rule); the document lives only in `port/` of the canvas folder (`citations.json`,
  `doc.md`, `instructions.json`), written by the canvas service.

## P4.gate Gate 4 audit (2026-10-14)

### The live key checks before the gate never exercised the Keychain layer
- **Actual**: every live script (`live-keys-test.ts`, `live-cost-check.ts`, `live-scenario-a.ts`, `pnpm egress-audit
  --mode live`) reads the dev key from the Keychain into ITS OWN `process.env` (`scripts/util/devKey.ts`) and the
  sidecar inherits it (`sidecarEnv` spreads `process.env`, `apps/desktop/src/main/dshHome.ts:48-57`). So the sidecar
  resolved `OPENAI_API_KEY` from the CredentialProvider's read-only ENV layer (`packages/orb-host/src/keychain.ts`,
  env first), never from the Keychain item. The Keychain path was proven only against the mock
  (`apps/ui/test/keys.contract.test.ts` 'the model route sends the migrated key from the Keychain').
- **Closed**: `scripts/live-keychain-check.ts` launches a sidecar with NO `OPENAI_API_KEY` in its environment
  (`keys.describe` says not configured), sends the dev key once with `orb/keys.set` as the Models card does
  (`source: keychain`, throwaway service `ai.orb.app.test.*`), then `keys.test` on openai / gpt-6-luna answers
  Working (1.2–1.8 s) and one chat turn makes Orb place a card with `openai/gpt-6-luna` provenance: real
  api.openai.com traffic authenticated only by the Keychain item. `security find-generic-password -s <service> -a
  OPENAI_API_KEY` (attributes only) exits 0. After stop, the test DSH_HOME and ORB_HOME (14 files) AND the decoded
  session log hold neither the key nor anything `sk-…`-shaped, and no credentials file exists.
- **Note for any scan**: session logs are `session.v4.jsonl.zstd` on disk, so a raw `grep` of DSH_HOME cannot see a
  key inside one; the check decodes them with the testkit's `readSessionLog`.
- **Note for prompts**: agents cannot place `note` cards (user-only type); a live prompt that asks for "a note card"
  gets a refusal from `place_card` and the model gives up. Ask for a `doc` card.

### e2e flake seen once: gate2 pan check
- `apps/desktop/e2e/gate2.spec.ts:192` failed in the first full `pnpm e2e` of the audit and in 2 of 5 immediate
  re-runs: a plain 100×60 px drag on empty board moved the view by (−760, 283), (−4, 556), (−286, 177) at zoom 1.
  It then passed 36 runs in a row (8 plain, 22 instrumented with a MutationObserver on the world transform and
  pointer/wheel listeners, 6 of those under 12 busy `yes` processes) and the second full `pnpm e2e` (53/53). The
  deltas are scroll-sized pans with the zoom unchanged, which is what a REAL trackpad scroll over the visible e2e
  window does; the e2e windows are shown on screen, so real input during a run can move the board. Not proven (no
  failing run was traced). Left as a risk for P5: run e2e windows off-screen or ignore non-synthetic input in tests.

### Measured at the gate
- `pnpm build` + `pnpm test`: 83 files / 615 tests green; `npx eslint .` clean; `pnpm e2e` 53/53 (second run; first
  run 52/53 with the gate2 flake above).
- `pnpm egress-audit --mode deterministic` PASS (13 model requests to the mock host, Scout 1 search + 5 fetches to
  `mock-site.orb.test`, no other host); `--mode live` PASS (only api.openai.com:443).
- `scripts/live-cost-check.ts` (gpt-6-luna, Orb + Critic, 2 sessions, 10 OpenAI requests, 33 s): provider usage
  {uncached 30, output 530, cache read 24362, cache write 7156} equals the meter bucket for bucket; $0.00140612 both.
- `scripts/live-keychain-check.ts`: PASS (above).
- Dev DSH_HOME `.orb-dev/dsh`: 6 files, no `.credentials.yaml`, no `sk-…` anywhere under `.orb-dev`; the only key
  names are the `apiKeyEnv` references in the profile patch. `security find-generic-password -s ai.orb.app` shows the
  `OPENAI_API_KEY` item (attributes only).

## P5.1 Performance pass (2026-10-14)

All numbers on the dev M-series Mac, Electron 44.7.0, the mock LLM where a model is involved. Raw data:
`historical docs/perf/p5.1-boot.json`, `historical docs/perf/p5.1-startup.json`, `historical docs/perf/p5.1-first-token.json`,
`historical docs/perf/p5.1-trace-summary.json`.

### Where the sidecar's boot time goes
- **Measured.** `pnpm profile-boot` (`scripts/profile-boot.ts`, 10 boots, fresh temp homes, warm file-system cache):
  spawn → `dsh web:` line + token exchange p50 393 ms (p95 408); + the first `orb/canvas.list` answer p50 ~400 ms. The
  first boot after a pause (cold OS file cache) is 0.9–1.0 s.
- **Profile** (`pnpm profile-boot --cpu-prof <dir>`, V8 CPU profile of the sidecar; Electron-as-Node honours
  `NODE_OPTIONS=--cpu-prof`): of ~460 ms, module loading dominates: ESM `compileSourceTextModule` ~48 ms, CJS
  `wrapSafe` ~32 ms, `readFileUtf8`/`internalModuleStat`/package.json scope lookups ~45 ms, cordis + plugin loader
  ~50 ms, zod schema construction ~15 ms, js-yaml (patch layers) ~10 ms. No single plugin's `apply` stands out; the
  cost is the number of modules dsh-base and the web app import.
- **Disabled rows** (`packages/orb-bundle/cordis.patch.yml`, "P5.1 boot profile", each with its reason; asserted by
  `scripts/test/dump-config.test.ts`): session-title, jobs, goal, goal-round-driver, mcp-resources, ptc-runtime, skill,
  workspace-files, workspace-controller, directory-picker, workspace-changes, plugin-inventory, session-log-download,
  file-reference-local, session-reference, session-turn-outline, session-stats, shell-env, subagent-fork-in-process
  (session-title-llm, the title LLM, was already off). Effect: p50 412 → 393 ms (−20 ms, ~5%). Several of them were
  also surface Orb must not expose (workspace file browsing, `@file` references).
- **Two rows cannot go, although Orb never uses them.** Disabling `commands` leaves `file-upload` pending ("waiting for
  service: commands"), and `session-controller` (the whole session API) requires `fileUploads`. Disabling
  `bash-sandbox` removes the `shell` service, and `permission` (dsh-permission-presets) requires it. dsh prints
  `dsh: warning: N entries did not activate` with each pending row on stderr right after the URL line, so a bad
  disable is visible in `sidecar.log`; `scripts/test/boot.test.ts` fails on it.
  Proof: `dsh-client-file-upload/lib/index.js:158` (inject incl. `commands`), `dsh-api-session-controller/lib/index.js:2816-2829`
  (inject list incl. `fileUploads`, `workspaceRegistry`), `dsh-permission-presets/lib/index.js:160-165` (inject
  `shell`, `approval`, `sessions`, `sessionProjections`), `dsh-shell/lib/index.js` (the `shell` service base).
- **Optional consumers are safe.** `session-controller` reads `sessionTitle` and `skills` with `ctx.get` (rename and
  the skill catalog answer "unavailable"; Orb calls neither), `dsh-web-app` registers its env var through an optional
  `ctx.inject(['shellEnv'])`. Proof: `dsh-api-session-controller/lib/index.js:756`, `:2293`; `dsh-web-app/lib/index.js:186`.
- **Node compile cache.** `NODE_COMPILE_CACHE` works under Electron-as-Node (the dsh native loader does not mind):
  −25 ms per boot once written, +75 ms on the boot that writes it. The app sets it (`<userData>/compile-cache`, dev
  `.orb-dev/compile-cache`, `apps/desktop/src/main/dshHome.ts` `compileCacheDir`); test sidecars on throwaway homes do
  not.
- **Electron main no longer spawns a Node-version probe** before the sidecar (it ran `process.execPath` once more,
  ~100–200 ms): the sidecar runs on the same binary, so main's own `process.versions.node` is the sidecar's Node.

### Startup to Home
- **The window no longer waits for the sidecar.** Main registers a privileged standard scheme `orb-boot:` and serves
  the UI dist from it (read-only, GET, no source maps, path-checked; CSP `connect-src 'none'`), opens the window on
  `orb-boot://app/index.html?boot=1&theme=…&view=…` at `app.whenReady`, starts the sidecar first, and loads the token
  URL into the same window when the sidecar is ready. The boot page renders Home in a "warming up" state (no wire:
  Start, search, Settings and the theme toggle wait; typing and template chips work, and the draft is handed to the
  live Home through `window.orbNative.boot`, main accepting it only from the boot page and giving it only to the
  sidecar origin). Until the first-run sheet has been finished or skipped once (`orb.json` `firstRunDone`), the boot
  page is a splash (Orb mark + "Warming up…"), since the sheet comes before Home on first launch.
- **Measured** (`apps/desktop/e2e/startup.spec.ts`, from `electron.launch` to the window shown with Home in it / to the
  live Home's `orb:home-live` mark): relaunches 296–352 ms / 733–781 ms; fresh homes 306–617 ms / 815–1339 ms; with
  the sidecar held back 2.5 s the warming Home is up at 307 ms. Before P5.1 the window appeared only after the sidecar
  (Home at ~0.8 s warm, 1.56 s on a cold first launch, and never sooner than the sidecar).
- **Playwright note.** `toHaveAttribute` polls at 100/250/500/1000 ms, so timings read off an `expect` are quantised
  to those steps; the spec reads a performance mark instead.

### First token
- `apps/desktop/e2e/firsttoken.spec.ts`: the mock stamps its first content chunk (`MockRequest.firstChunkAt`, after a
  simulated 400 ms of model latency), a MutationObserver stamps the text in the conversation panel: 1–4 ms over 10
  turns (p50 3, p95 4). The path (pi-ai SSE parse → agent stream → gateway mux → UI) adds nothing measurable; the 1 s
  budget is the provider's.

### 60 fps re-check
- `apps/desktop/e2e/perf.spec.ts` on the P5.1 build (300 cards, 8 frames, Chrome trace): drag 71.9 fps p95 15.53 ms,
  scroll pan 71.6 fps p95 16.2 ms, zoom 71.7 fps p95 16.07 ms, 0 dropped frames (`historical docs/perf/p5.1-trace-summary.json`).

## P5.3 Settings › Storage (2026-10-14)

### A session's cwd never changes, so a moved Orb folder needs Orb-side mapping
- The session header `cwd` is written once when the session is created (`dsh-session/lib/index.js:1703`, from
  `meta.cwd`) and copied unchanged on fork/resume (`:1897`); it must be absolute (`:1045-1046`). Resume does not care
  whether that folder still exists (the resumed root of a moved library answers normally).
- Orb maps a tool call to its board through that cwd (`CanvasStore.canvasIdOfDir`). After Settings › Storage moves the
  folder, resumed agents still name `<old home>/canvases/<id>`, so the strict "parent is my canvases dir" check refused
  every board and team tool. `canvasIdOfDir` now also accepts `<any>/canvases/<id>` when canvas `<id>` exists in the
  current library; the callers' canvas.json role check (root or child session id) remains the gate. Proof:
  `apps/ui/test/storage-move.contract.test.ts`.

## P5.4 Packaging (2026-10-14)

### The sidecar ships as plain files next to the asar; dsh finds `@orb/bundle` there unchanged
- `Orb.app/Contents/Resources/node_modules` is the production closure of the root package.json (`@deepseek-ai/dsh` +
  `@orb/*`: 568 packages, 512.6 MB unpacked), staged by `scripts/dist-stage.ts` in the same hoisted layout as the repo.
  dsh resolves the profile's `@orb/bundle` from its own install (hoisted next to `@deepseek-ai/dsh`, SPIKE_NOTES), so
  the packaged sidecar boots with no resolution change: `pnpm e2e:packaged` shows the bundled dsh running on the app's
  own executable (`ELECTRON_RUN_AS_NODE=1`). Native addons (keyring, node-addon-require-builtin, node-pty, sharp,
  koffi, ...) are dlopen'd from real files, so nothing is in the asar and no asar unpack list is needed.
- The biggest part is `@deepseek-ai/libreoffice-kit-darwin-arm64` (160 MB), a dependency of `dsh-web-app`,
  `dsh-skill-office` and `dsh-office-to-pdf` (their package.json). Orb disables the office rows, but the packages are
  still in the closure; pruning them is a size optimisation left for later (it needs proof no enabled row imports
  them).

### electron-builder packs the WORKSPACE ROOT's node_modules into app.asar unless told not to (not harness)
- With an app dir that has no dependencies, electron-builder 26.15.3 retries its node-module search in the project
  dir and the pnpm workspace root (`app-builder-lib/out/util/appFileCopier.js:173-190`, "no node modules found in
  collection, trying next search directory") and packed the root's whole tree (195 MB app.asar + 234 MB unpacked).
  The only off switch is a `beforeBuild` hook that returns false (`app-builder-lib/out/packager.js:458-467` sets
  `_nodeModulesHandledExternally`), and the hook only runs with `npmRebuild: true` (`:455` returns first otherwise).
  `apps/desktop/build/beforeBuild.cjs` returns false; app.asar is now 312 KB (main + preload, with `@orb/shared` and
  `@orb/sources/policy` bundled by electron-vite).

### Ad-hoc signature and the Keychain
> **Superseded in 0.1.0 (2026-10-20):** release builds are Developer ID signed (Team `Q78J7L8TLR`) and notarised,
> with library validation on (`apps/desktop/build/entitlements.mac.plist`). The ad-hoc setup below now applies only
> to `pnpm dist:adhoc` (`entitlements.adhoc.plist`).

- Signing and notarisation are deferred (user decision): `mac.identity: "-"` (ad-hoc; arm64 refuses unsigned code)
  with the hardened runtime, `allow-jit` and `disable-library-validation` (an ad-hoc signature has no Team ID, so the
  hardened runtime would refuse the addons; electron-builder warns the same, `app-builder-lib/out/mac/MacTargetHelper.js:37-41`).
  `spctl -a` rejects the app, as expected without a Developer ID; a downloaded (quarantined) copy needs
  Open Anyway. Installed from the dmg without quarantine it runs.
- A Keychain item trusts the binary that created it. On this dev Mac the real `ai.orb.app` service holds the dev key
  written by the dev Electron, so the packaged app's FIRST Keychain read at boot raised a macOS access prompt
  (SecurityAgent) and the sidecar stayed blocked in it (no `dsh web:` line within 13 s; on quit it ignored SIGTERM
  and was SIGKILLed after 6 s, as the supervisor intends). With a test service (no foreign items) it booted in 0.9 s
  from Finder-style `open`. On a fresh Mac there are no foreign items, so no prompt. Because an ad-hoc signature
  changes with every build, items one ad-hoc build creates will prompt again in the next build; a Developer ID
  signature (stable designated requirement: team + `ai.orb.app`) removes that. `pnpm e2e:packaged` therefore runs the
  app on a throwaway `ai.orb.app.test.*` service and reads/clears it with the packaged binary itself
  (`packagedKeychainRuntime`, scripts/testkit/keychain.ts).

## P5.5 Hardening (2026-10-14)

### Upgrade rehearsal: `@deepseek-ai/dsh` 0.2.0-rc.2 → 0.2.1-alpha.3 (NOT adopted)
- **Registry state (checked 2026-10-15)**: `latest` and `next` are still `0.2.0-rc.2` (our pin). Newer builds exist only
  on the `alpha` tag: `0.2.1-alpha.1` (2026-10-03), `0.2.1-alpha.2` (2026-10-09), `0.2.1-alpha.3` (2026-10-14).
  The rehearsal used the newest, `0.2.1-alpha.3`, with `@deepseek-ai/cordis` `4.0.5-alpha.2` (what it depends on).
- **How**: throwaway git worktree on the local branch `rehearsal/dsh-0.2.1-alpha.3` (never merged or pushed); every
  `@deepseek-ai/dsh*` pin in `package.json`, `packages/orb-{agents,canvas,host}/package.json` bumped, `pnpm install`,
  `pnpm build`, `pnpm test` (the gate suite: unit, contract and egress tests), `pnpm e2e` (Playwright, Electron). Mock
  LLM only. 22 harness packages are new in the closure, 8 are gone (`dsh-hook-protocol`, `dsh-hooks-*`, `dsh-webhook*`,
  `dsh-invariants`, `dsh-subagent-in-process-driver`, `dsh-experimental-schedule-bundle`).
- **Result**: build passes only after fix 1; `pnpm test` **26 failed / 619 passed** (14 of 88 files). Breakage list,
  by root cause (failing tests in brackets):
  1. **Build: `tsc -p scripts/tsconfig.json` runs out of memory (4 GB heap)**, and with 12 GB reports TS2589
     "excessively deep" on every zod schema in scripts. Cause: the new closure pulls `zod@4.4.3` (e.g.
     `dsh-api-gateway/package.json`), which wins the hoisted root `node_modules/zod`, while Orb's packages use 4.6.7;
     `scripts/` declared no zod of its own. **Fixed on main now** (cheap, harmless): root `devDependencies` pin
     `zod: 4.6.7`, so the root copy is always ours.
  2. **`SubagentService.startContinuable` is gone** (`orb-agents` `delegate` → "Error:
     this.subagents.startContinuable is not a function"). 0.2.1 starts children with `startLocal(spec)` /
     `startExternal(spec)` (`dsh-subagent/lib/index.js:1391`, `:1483`). Every Scout/Critic path breaks
     [team ×3, agentui, control ×3, sources, cost (Scout's route never billed), egress-audit ×2 (Scout never
     finishes)]. Port: `packages/orb-agents/src/service.ts` (`startContinuable` call and its local type at :118).
  3. **A new runtime-context user message after every user message**: "Current runtime context. This snapshot
     supersedes earlier runtime-context snapshots. Current working directory: \"<canvas dir>\""
     (`dsh-system-prompt/lib/index.js:139`, owned by `dsh-agent-loop/lib/index.js:212-230`). It (a) sends the
     absolute canvas path, which contains the macOS user name, to the model provider on every turn (privacy: must
     be suppressed or the cwd contribution disabled before adopting), and (b) makes it the LAST message of the
     request, so Orb's turn text is no longer last [orb-root ×3, port, agent (tool result no longer last)].
  4. **New global tool `working_directory`** (row `tool-working-directory`, `dsh-tool-working-directory/lib/index.js:16-41`,
     on in `dsh-base/cordis.patch.yml:169`). Orb's guard still denies it on call (the guard is deny-by-default:
     `packages/orb-agents/src/guard.ts`), but it is OFFERED to every agent's model, breaking the "agents see only
     their allow-list" rule [agent (tool list), macos-checks "no global tools"]. Fix when adopting: disable
     `tool-working-directory` in `packages/orb-bundle/cordis.patch.yml` (and check what else needs the
     `working-directory` service before disabling that).
  5. **New UI row `ui-secret-mask`** in `dsh-web-app/cordis.patch.yml:388`, enabled [dump-config "no dsh ui-* row"].
     Fix: add it to the disabled ui rows.
  6. **New row `harness-dev-context`** (`dsh-web-app/cordis.patch.yml:211`) stays pending: "waiting for service:
     webApp" (Orb disables the web app) [boot "every enabled row activates"]. Fix: disable it.
  7. **Credentials: an invalid plaintext `.credentials.yaml` is no longer left in place** after the failed mount
     [orb-host keychain "fails the mount loudly and is left in place"]. Orb's P4.1 migration relies on that file
     staying put; re-check `dsh-credentials-local` before adopting.
  8. **Seatbelt workspace-write probe**: the macOS check's write OUTSIDE the workspace now succeeds under
     `sandbox-exec` [macos-checks "really confines writes"]. Orb agents have no shell or fs tools, so this only
     affects the defence-in-depth layer; the `dsh-sandbox-policy` change was not isolated.
  9. **Per-agent model route from `orb.json` (`models.orb`) not applied to the root agent** (the first request goes
     to the default model) [orb-root "orb.json models.orb routes the root agent"]. Root cause not isolated in the
     rehearsal (`agentOptions` still reaches `dsh-agent-loop` the same way: `lib/index.js:1909`); check with 3 fixed.
  10. **The gateway's inline page script changed**, so its hash is no longer in Orb's CSP `script-src` and the window
      blocks it (console: "Executing inline script violates … a hash ('sha256-iP3y7B30gpZh+DIOcHM5T4Xv+2o3xIbfRxjYsaMT/9Q=')
      … is required") [e2e window "no CSP violations", startup]. Fix: update `GATEWAY_INLINE_SCRIPTS` in
      `apps/desktop/src/main/security.ts` to the new injected text (`dsh-host-webserver`, `dsh-client-connection`).
- **e2e on the rehearsal branch**: **17 failed / 55 passed** (72). All map to the list above: Scout/Critic/Builder
  scenarios and controls (2), the runtime-context message and new-canvas turn (3), place_card/Stop (3, 4), the CSP
  hash (10).
- **Decision**: stay on `0.2.0-rc.2` (still `latest`). Before adopting any 0.2.1: fix 2–6 (one patch file and one
  service call), decide 3 (privacy), re-run this rehearsal, the e2e suite and the egress audit (CI runs it on the
  lockfile change).

### Fuzzing the board commands found two real gaps (fixed)
- **-0 survived in memory but not on disk**: a coordinate of `-0` was folded as `-0` into the live board while
  `board.jsonl` stores `0` (JSON), so the live board and a reopened one differed. `Board.appendAll` now folds each
  event as it will be read back (a JSON round trip before `parseBoardEvent`), so live == reopened by construction.
  `packages/orb-canvas/src/store.ts` (`appendAll`).
- **`card.added` accepted `w`/`h` ≤ 0** (CardDraft inherited the event schema's plain `z.number()`), while
  `card.updated` already required positive sizes. `CardDraft` now requires `w`, `h` > 0; the event schema stays
  lenient so older logs still open. `packages/shared/src/commands.ts`.

## P5.gate Gate 5 audit (2026-10-14)

Re-ran, independently: `pnpm build`, `pnpm test` (90 files / 647), `npx eslint .`, `pnpm e2e` (72/72, then the two
export specs again after the change below: 8/8), `pnpm egress-audit --mode deterministic` (PASS: only
`mock-llm.orb.test` and the five `mock-site.orb.test` URLs Scout fetched), `pnpm dist` (fresh
`release/dist/Orb-0.1.0-arm64.dmg`, 301 MB) and `pnpm e2e:packaged` (5/5). CI on 05168ae green (run 38712440857).

### Gap closed: the research-document export time had no assertion
PRD Non-functional › Exports names two budgets; only the 10-frame canvas PDF (< 15 s) was asserted. Added: the
fixture research-document PDF (`print.spec.ts` 'Research document: …', 849 ms), the composed document's PDF
(`port.spec.ts` 'Export prints the composed document …', 846 ms) and the compose itself with the mock model, i.e. Orb's
own time without model time (`port.spec.ts` 'Orb composes the document section by section …', 318 ms), each < 120 s.

### Manual launch of the dmg build outside Playwright (criterion 2)
Mounted the dmg, `ditto`'d Orb.app to a temp "Applications" folder, launched it through LaunchServices
(`open -n … --args --user-data-dir=<tmp>`, a `location.json` pointing the Orb folder at a temp dir). Results:
`codesign --verify --deep --strict` OK, `flags=0x10002(adhoc,runtime)`, arm64 only, 891 MB installed;
`spctl -a` **rejects** it (expected: ad-hoc, not notarised; a downloaded, quarantined copy needs right-click › Open,
as `docs/ACCEPTANCE.md` says). The window came up at once on the warming-up page, the bundled sidecar (the app's own
binary running `Resources/node_modules/@deepseek-ai/dsh`) listened on 127.0.0.1, the live Home replaced it (window
capture: Home with templates, "No canvases yet", the orb-host status line), the token URL was `<redacted>` in
`~/Library/Logs/Orb/sidecar.log`, SIGTERM stopped the sidecar (exit 0) and the app; no `.credentials.yaml` and no
`sk-` anywhere in the temp homes.

**Finding (not a gate failure, a risk): the sidecar's boot waits on the Keychain.** My test-service override had
the wrong prefix (it must start `ai.orb.app.test.`; `packages/orb-keychain/src/index.ts` `resolveKeychainService`
ignores anything else, by design), so the packaged app read the real `ai.orb.app` service, whose item the dev
Electron binary created. macOS showed "Orb wants to use your confidential information stored in 'ai.orb.app'" and
the sidecar became ready only once the prompt was gone (spawn 09:32:50.975Z → ready 09:33:10.147Z; every other boot
here is ~0.4 s). Cause: `OrbKeychainCredentialProvider`'s `[Service.init]` awaits `load()` (the whole service is
read at mount; `packages/orb-host/src/keychain.ts`), and the harness serves only after its services are up. Home
stays usable in its warming-up state meanwhile, so the PRD startup rule still holds, but: with ad-hoc signing every
new build has a new code hash, so an item made by one build prompts again in the next one (a user updating an
ad-hoc build gets this prompt on each update). Developer ID signing (deferred) gives a stable designated
requirement and removes it. Worth doing next phase: load the Keychain lazily (or with a timeout) so a pending prompt
never holds the sidecar, and say on the warming-up Home that macOS is asking for Keychain access.

## P6.1b Brand: Constellation identity (2026-10-15)
- The sidecar's static UI server serves `.svg` as `image/svg+xml`
  (`node_modules/@deepseek-ai/dsh-host-frontend-static/lib/index.js:28`), so the favicon Vite emits as
  `assets/favicon-<hash>.svg` loads from the sidecar origin with the self-only CSP (and from `orb-boot://` on the
  warming-up page, `img-src 'self' data:`). No harness change.
- Not a harness fact, but found while renaming: Node's `realpathSync` keeps the casing it is given on a
  case-insensitive APFS volume, so `~/Orb` and `~/orb` compared unequal in Settings › Storage's move checks.
  `apps/desktop/src/main/storage.ts` now uses `realpathSync.native`, which returns the on-disk casing.

## P6.2 Card platform (2026-10-15)

### The gateway's cookie secret is read from the credential provider during the connection's activation
- `client-connection` builds its browser auth at activation: `BrowserAuth.create(ctx.root, ctx.credentials, …)`
  (`dsh-client-connection/lib/index.js:819`), which awaits `initializeSecret` → `credentials.modifyRecord(
  client-connection/browser-session, create-if-absent)` (`:325-342`, `:366-368`). The gateway serves (and dsh prints
  its `web:` line) only after that. So any wait in the credential provider is a wait before the sidecar is ready:
  this is how a macOS Keychain prompt held the P5.gate boot for 19 s (HARNESS_NOTES §P5.gate).
- **What Orb does** (`packages/orb-host/src/keychain.ts`):
  - That one record is process-only (`PROCESS_ONLY_RECORDS`): kept in the provider's memory, never written to or read
    from the Keychain. A plaintext document's copy is dropped with the file at migration, and a Keychain item left by
    an older build is ignored. A new secret per sidecar process costs nothing in Orb. The window loads every new
    sidecar's token URL, and a restarted sidecar listens on a new port, so its cookie name (sha256 of the authority,
    `:284-286`) changes anyway.
  - The launch token itself is per process owner (`processLaunchToken(ctx.root)`, `:244-250`), unchanged.
  - The rest of the Keychain is read in the background. Mount waits for it at most 1.5 s (`KEYCHAIN_BOOT_WAIT_MS`); a
    normal read takes milliseconds, and its failure still fails the mount. Past that, the sidecar starts, and
    `resolve`/`describe`/record reads wait for the Keychain. After 400 ms without an answer, the provider writes
    `KEYCHAIN_WAITING_LINE` to stderr, and `KEYCHAIN_READY_LINE` when the Keychain answers. Main reads these lines
    to drive the warming-up Home's hint. `orb/keys.keychain` reports `waiting` for the live Home.
  - Test seam: `ORB_KEYCHAIN_TEST_DELAY_MS` delays the read. It is honoured only for an `ai.orb.app.test.*` service.
- **Proof**:
  - `packages/orb-host/test/keychain.test.ts` ('P6.2: a Keychain that does not answer … holds the mount at most
    bootWaitMs', 'the gateway cookie secret lives in this process only');
  - `apps/desktop/e2e/startup.spec.ts` ('a Keychain held by a macOS prompt …': a 5 s held read, warming Home with
    the hint, live Home at ~2 s with the hint, the hint gone once the read answers);
  - `apps/ui/test/keys.contract.test.ts`: no `record:client-connection/browser-session` item is written.

### Design frames as their own page (Chromium in Electron 44.7.0, not the harness)
- A sidecar route answering `text/html` with its own `Content-Security-Policy` header gives the iframe's document
  that policy, and not the app's. A `srcdoc` document inherited the app's policy (§P3.8). Electron main's
  `withCsp` override would replace it with the app CSP, so main forces `DESIGN_FRAME_CSP` on the route instead.
- Loading the frame needs no auth of its own. The iframe's navigation request comes from the app page (same
  origin), so the gateway's `SameSite=Strict` cookie rides along and `admit` passes (`dsh-client-connection/lib/
  index.js:591-594`). Inside the frame, the sandbox (`allow-scripts`, no `allow-same-origin`) makes the document
  opaque:
  - any request it made would be cross-site (403) and cookie-less (401);
  - this is why the libraries are inlined into the page rather than served as separate routes.
- `location.origin` in a sandboxed document is the URL's origin. The document's real origin is `self.origin`
  (`"null"`). The e2e checks `self.origin`, plus cookie, `localStorage` and parent access, all blocked.
- In Playwright, CSP-blocked attempts from the frame show up as `request` events that fail and never finish (this
  is the DevTools "(blocked:csp)" entry). `builder.spec.ts` keeps them apart and asserts that none finishes. A
  local server that counts requests proves that nothing was sent: fetch, XHR, WebSocket, EventSource, beacon,
  image, script, style, font, nested frame, worker, form, popup and self-navigation all reach it zero times.
- Two consequences of the frame having focus, both fixed:
  - Keyboard events go to the frame's process. The bootstrap forwards Escape (`DESIGN_FRAME_ESCAPE`), and the
    reader closes on it.
  - Playwright's `click()` inside an iframe drawn with `transform: scale()` misses its target, so the e2e maps the
    point by hand. Real pointer clicks work.

## P6.3 Datasets: tool schemas

### An output-schema node needs a `type`; `{}` is refused, `json` is the "any value" type
- **Actual**: a tool's `output.schema` is checked when the preset is built. A node such as `items: {}` ends the
  whole `orb` agent preset with `agent-preset/invalid` ("unsupported JSON schema: schema.properties.rows.items.items.type
  must be string/number/integer/boolean/null/array/object/json, or use oneOf"), so every canvas fails to start. A
  cell of a dataset can be a string, number, boolean or null, so `query_dataset` declares `{ type: 'json' }`.
- **Proof**: `dsh-tools/lib/index.js:751` (`authorError` for an unknown or missing `type`); the failure shows in
  `pnpm test` (egress-audit and every contract file) the moment a schema has `items: {}`.
- Related, already in §P3.2: a result with a property the output schema does not declare (`additionalProperties:
  false`) is an `INVALID_TOOL_OUTPUT` (`dsh-tools/lib/index.js:468`). `place_card` answers `datasetId` for a
  database card, so `datasetId` is declared there; `apps/ui/test/data.contract.test.ts` places one over a real sidecar.

## P6.prep Parallel-safe tests and git worktrees

Several worktrees can run `pnpm test` and `pnpm e2e` on one Mac at the same time. Not a harness fact; it lives here
with the other test-environment notes.

### The two switches
- `ORB_TEST_NAMESPACE=<ns>` (1-32 chars of `a-z0-9-`; unset = today's behaviour exactly). Helpers in
  `scripts/testkit/namespace.ts`. What it scopes, because it is shared machine-wide:
  - **Keychain service names**: `ai.orb.app.test.<ns>.vitest`, `.e2e`, `.<tag>-<pid>-<rand>` (testkit sidecars),
    `.unit`, `.packaged-<pid>`. They keep the exact prefix `ai.orb.app.test.`, so the sidecar's override rule
    (`packages/orb-keychain/src/index.ts:31-35`) still accepts them.
  - **The teardown sweep** (`listTestKeychainServices` in `scripts/testkit/keychain.ts`) removes only
    `ai.orb.app.test.<ns>.*`. With no namespace it still sweeps every `ai.orb.app.test.*`, so do not run an
    un-namespaced suite while namespaced ones are running (it would clear their live services).
  - **Playwright output and screenshot/result dirs**: `.orb-dev/e2e-results/<ns>/` (and `e2e-packaged-results/<ns>/`).
- `ORB_SKIP_TIMING=1` skips only timing assertions (60 fps/p95 frame time, stop-time budgets, startup/Home budgets,
  first-token budget, PDF export/compose budgets, boot/sidecar-stop time) through `timingExpect()`. Functional
  assertions are untouched, and measurements are still taken and written.

### Already unique per run (nothing to do)
Temp `DSH_HOME`/`ORB_HOME`/`ORB_USER_DATA` come from `mkdtemp(os.tmpdir())`; every server (mock LLM, mock sites,
egress proxy, control channel, sidecar gateway) listens on port 0; Electron has no single-instance lock in these runs
(`ORB_USER_DATA` is per launch). No lock or sentinel files exist. Live scripts are not namespaced (they use the real
dev flow on purpose); run them from the main checkout only.

### A fresh worktree
```
git worktree add --detach ../orb-wt/<name> HEAD   # or -b <branch>; outside the repo, no .gitignore entry
cd ../orb-wt/<name>
pnpm install --frozen-lockfile      # ~4 s: hard links from the pnpm store; Electron is already in the store/cache
pnpm build                          # lib/ dirs are gitignored, so every worktree must build once
ORB_TEST_NAMESPACE=<name> ORB_SKIP_TIMING=1 pnpm test
ORB_TEST_NAMESPACE=<name> ORB_SKIP_TIMING=1 pnpm exec playwright test -c apps/desktop/playwright.config.ts <spec>
git worktree remove ../orb-wt/<name>
```
`.orb-dev/` is per worktree (gitignored), so dev homes do not collide either. Never launch the dev app from a
worktree against the real `ai.orb.app` service; the same Keychain rules as the main checkout apply.

## P6.4 Data cards: Vega under the app CSP

### Vega-Lite renders to SVG under `script-src 'self'` with no `'unsafe-eval'`, if it parses with `ast: true`
- **Expected**: Vega compiles every expression (`datum.x > 3`, signal updates, encoders) into a `new Function(...)`, which
  the app's CSP (`script-src 'self' <hashes>`, `apps/desktop/src/main/security.ts:153`) blocks.
- **Actual**: `vega.parse(spec, config, { ast: true })` keeps the expressions as ASTs, and `new vega.View(runtime, { expr:
  expressionInterpreter })` (`vega-interpreter`) evaluates them with a small interpreter, so nothing generates code.
  vega, vega-lite 6.4.3 and vega-interpreter are bundled by Vite into one lazy chunk served from the sidecar origin.
- **Proof**: `node_modules/vega-interpreter` is the interpreter (`expressionInterpreter`); `apps/ui/test/chart.unit.test.ts`
  draws all five marks with `globalThis.Function` replaced by a function that throws `EvalError`, so any use of
  `new Function` fails the test. `apps/desktop/e2e/datacards.spec.ts` draws the charts in the real window under the real
  CSP and fails on any "Content Security Policy", "Refused to", "unsafe-eval" or `EvalError` console line.
- `view.toSVG()` needs no DOM (`renderer: 'none'`), and its output escapes text (`&lt;script&gt;` in a label stays text;
  unit test). A temporal x axis is drawn ordinal in date order: Vega-Lite's temporal scales use local time, so a bare year
  such as `2021` (UTC midnight) could show as 2020 in a time zone behind UTC.

## P6.6 Tool parameter DSL: nested objects
`defineTool` rejects an object-typed array item unless it sets `additionalProperties` explicitly, and rejects `required`
inside it ("parameters.facts.items.required is not supported by the value schema DSL",
`node_modules/@deepseek-ai/dsh-tools/lib/index.js:545` `authorError`, reached from `assertAuthorKeys` :556 and
`runSchemaCompiler` :693). `place_card`'s `facts` is `{type:'array', items:{type:'object', properties, additionalProperties:false}}`;
required label/value are checked by the card's own schema instead (`FactsField` in orb-cards `entity.ts`). The sidecar
loads the built `lib/`, so a tool-schema change needs `pnpm build` before the contract tests see it.

## P6.7 Parallel AI

- **Provider seam vs direct call.** dsh-web's `WebSearchProvider.search(request)` carries only `{query, maxResults}` and runs a search only when exactly one provider is usable (`WEB_PROVIDER_AMBIGUOUS` otherwise; see §P3.5). Parallel is registered as a provider too (`ParallelSearchProvider`, first in `SEARCH_PROVIDER_ORDER`, usable only while its key is set), but `web_search` itself calls the `ParallelClient` directly when Parallel is in force, because the objective, depth, `after_date`, domain and country parameters do not fit the seam (`packages/orb-canvas/src/sources.ts` `webSearch`). Without a Parallel key nothing changes.
- **No timeout on our tools.** `dsh-tool-call-timeout-policy` only limits tools that declare `timeoutMs` (`node_modules/@deepseek-ai/dsh-tool-call-timeout-policy/README.md` "The limit is set where the tool is configured"), so a `deep_research` that waits ten minutes, or sits on the cost guard's question, is not cut off. Stop (the exec signal) is the only way out, and every long tool turns it into detach (Task, Task Group) or a real cancel (FindAll).
- **`IncomingMessage` 'close' is not a connection close.** In the mock Parallel server the request's `close` event fires once the body is read (Node 22), so it cannot tell that a client aborted. Abort detection watches the response's `close` with `!res.writableFinished` (`scripts/testkit/mockParallel.ts`).
- **Registry file.** `assets/parallel/runs.json` is written only by `ParallelService` (temp file + rename, one queue per canvas). Two services in one process (tests only) need distinct temp names.
- **Egress.** Parallel's one host is `api.parallel.ai`; the sidecar's `fetch` goes through dsh-http-proxy's global dispatcher like every other provider call. The audit points `PARALLEL_BASE_URL` at `http://api.parallel.ai` (plain http, routed by the logging proxy to the mock) and allows the host only for routed `/v1` and `/v1beta` REST calls (`judgeParallelHits`).

## P6.9 Gate open items

### A shown macOS window cannot be placed off-screen; make it inert instead
- **Expected**: `new BrowserWindow({x: -30000, y: -30000, enableLargerThanScreen: true})` keeps an e2e window off every
  display (the P4.gate pan flake was a real trackpad scroll over the visible e2e window).
- **Actual**: after `showInactive()` the window sits at x -1400, y 25 (measured with `win.getBounds()`; AppKit's
  frame constraint pulls a shown titled window back, y never goes above the menu bar). So the e2e window is also made
  inert: `focusable: false`, `showInactive()`, `setIgnoreMouseEvents(true)` (real mouse and trackpad events fall
  through; Playwright's input is CDP-synthetic and still works, the whole e2e suite is the proof), and Chromium's
  occlusion/background throttling is switched off (`apps/desktop/src/main/testWindow.ts`), because an occluded window
  would otherwise pause `requestAnimationFrame`.
- **Proof**: `apps/desktop/e2e/window.spec.ts` ('the e2e window is moved off-screen, inert and unfocused'): x < 0, not
  focusable, not focused, more than 15 animation frames in 500 ms.

### The pause survives a restart in `<canvas>/pause.json`; harness sessions are untouched
- A restarted app has no running turns, so a restored pause cancels nothing: it re-arms `paused` (the `agent/pre-step`
  hold already rejects a step of a paused agent, `OrbAgents.onPreStep`), re-publishes `paused` on `agents.status`,
  keeps children quiet, and keeps the held messages. Resume steers Orb with RESUME_TEXT plus the held messages (or sends
  the child its queue), exactly as before the restart.

### Asset GC runs at board load, against the board as it is when it decides
- Reading the board snapshot at the start of the run raced a drop placed meanwhile (found by the unit test: the run
  started on the empty board of a just-created canvas and judged files by that). `collectUnreferencedAssets` takes a
  getter and reads it after listing the folder; uploads younger than 5 minutes are never collected.

## P6.10 Signed-in browsing (2026-10-15)

### Design: main owns the session, the sidecar only gets rendered HTML
- **Partition and windows** (`apps/desktop/src/main/sites.ts`): one persistent partition `persist:orb-sites` (never the Orb window's or the capture window's session). Two kinds of window use it, told apart by `webContents.id` in one session-level `onBeforeRequest` (an unknown id, e.g. a service worker, is cancelled): the VISIBLE login window (sandboxed, no preload, popups folded into the same window, any public host so identity providers work, never a private address) and the hidden fetch window (read-only render, see below). Both mirror the exported HTTP(S) proxy like the capture window and otherwise go `direct`.
- **Cookies never leave main.** `POST /signed-in-fetch` on the existing control channel (same loopback, `Host`, no-`Origin`, bearer-secret checks as `/capture`) takes `{url, screenshot?, by?}` (strict schema: a `cookie` field is a 400) and answers JSON `{info, html, png?}`. The sidecar extracts the HTML with the normal Readability + turndown path (charset forced to utf-8: `outerHTML` is a JS string) and caches it like `fetch_url`, so `page: 2` and `read_source` need no second fetch and no second approval. The test (`signedin.spec.ts`) greps every request body the mock LLM saw and every file under ORB_HOME and DSH_HOME for the cookie value and the password: none.
- **Fetch window policy** (`decideSitesRequest`, `sitesCore.ts`): requests only to the connected domain and its subdomains (any resource type: no third-party script, tracker, CDN or image), page and frame navigations only by GET (a form post is refused), the usual public-address rules on top. Verified in the e2e: the member page references a script and an image on another host and a POST form; the proxy saw only the connected domain, the mock site saw no POST, and every member request carried the cookie. A redirect off the domain ends the fetch (`LEFT_DOMAIN`). This IS the "egress allow-list = connected domains while connected": the list is the connected-site registry, in effect only while a fetch window exists.
- **Approval, rate limit, activity**: `authorize` runs outside the control server's one-at-a-time queue and its 60 s timeout (a person may take longer to answer): connected-domain check, then a token bucket per domain (burst 5, one more per 6 s, then `RATE_LIMITED` with the seconds to wait), then the approval `dialog.showMessageBox` (default on per site; "Don't ask again for <domain>" switches it off, Settings switches it back on). Every outcome (ok, denied, rate-limited, error) is recorded with origin and path only (the query string can hold a token) in `<state dir>/connected-sites.json` (0600; domains, settings, last 100 entries; no cookie) and listed in Settings › Connected sites › Recent fetches. The e2e stubs the approval prompt in main (`dialog.showMessageBox`), like the folder picker in `settings.spec.ts`; no system dialog is involved.
- **Login**: Connect opens the window; closing it finishes. The site is recorded only if the partition then holds a cookie for the domain, so closing without signing in connects nothing. The e2e signs in by typing into the real login window (Playwright sees every BrowserWindow as a page). Session cookies (no Max-Age) do not survive an app restart on a persistent partition; sites that set long-lived cookies stay connected.
- **ToS list** (`TOS_WARNING_SITES`, shared): LinkedIn, Facebook, Instagram, X/Twitter, Glassdoor, Crunchbase, PitchBook, ZoomInfo. A listed address shows the warning and needs a second press ("Connect anyway"); main refuses to open the window for a listed site unless `acceptTos` came with the call.
- **http** sites can be connected only in the unpackaged app (the mock site); the packaged app takes https only.
- **Egress audit**: `pnpm egress-audit` runs the sidecar alone (no Electron), so it cannot reach main's windows. The signed-in egress is audited where it can be: `signedin.spec.ts` runs the real app behind the logging proxy and asserts the proxy saw the connected domain only; the policy and the control route have Vitest coverage (`apps/desktop/test/sites.test.ts`). The deterministic audit itself is unchanged and green.
- **Where "activity panel" went**: the board's "On the board" activity lists cards, frames and links by provenance; a fetch adds none of those, so the per-fetch list lives in Settings › Connected sites (refreshes every 4 s while open), and the fetch is also a tool call in Scout's own session. Recorded in PLAN.md Decisions.

## P6.8 Agents at scale (2026-10-15)

### Long prompt-cache retention: the route profile's `cacheRetention`, not an env var (verified)
- **Which knob the harness honours.** `llm-pi-ai` routes (the `providers` dict of the `llm-pi-ai` row) take `cacheRetention: none | short | long`
  (schema `node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js:1031`, `types/config.d.ts:120`); `profileOptions` copies it into pi-ai's
  stream options (`index.js:1680`). pi-ai then resolves it per API: `openai-responses.js:42-50` (option first, then
  `PI_CACHE_RETENTION=long` from the environment, else `short`) and sends `prompt_cache_key` = the session id and
  `prompt_cache_retention: "24h"` (`openai-responses.js:220-227`; the completions API does the same, `openai-completions.js:576-579`;
  `anthropic-messages.js:35` makes it a 1 h `cache_control` ttl). Both the stream option and `PI_CACHE_RETENTION` work; Orb sets the
  profile key because it is per route, visible in `profiles/orb/cordis.patch.yml`, and does not depend on the process environment.
- **Where Orb sets it.** `profiles/orb/cordis.patch.yml` (every catalog route: openai, deepseek, anthropic, openrouter),
  `OrbModels.ensureRoute` (a catalog route added later), and the test mock route (`scripts/testkit/mockLlm.ts` `mockProviderPatch`).
  Custom (OpenAI-compatible) providers stay at the default: an unknown server may reject `prompt_cache_retention`.
- **Proof.** `apps/ui/test/scale.contract.test.ts` ('keeps the prompt prefix…'): every request of a real sidecar turn on the mock carries
  `prompt_cache_retention: "24h"` and one `prompt_cache_key` for the whole session.
- **Cost meter.** The harness `tokenUsage` buckets already separate cache reads (`cacheReadTokens`); the meter now reports
  cached input ÷ total input per canvas and per agent (`CanvasCost.cacheHitRate`, `CanvasCost.agents`).

### The prompt prefix is the persona plus the tool definitions, and it is byte-stable
- A request is `[system: persona] + tools + messages`. The persona is a constant (`ORB_PERSONA`, `CHILD_PERSONAS`), the tool list is
  the preset's, and board context from `orb/chat.send` is appended as the LAST content part of the user message
  (`OrbAgents.send`), never into the system text. The contract test sends four turns with different contexts and a changing board
  and asserts the system text and tools JSON are identical. Sizes on this build (characters; about 4 per token): persona orb 7.4k,
  scout 7.9k, critic 3.4k, builder 4.1k; tool definitions about 50k for Orb (`place_card` 16k and `update_card` 7.5k are most of it:
  one parameter per card field). That prefix is the part prompt caching serves.

### Progressive disclosure: sizes and caps
- `board_map` (about 3k tokens at most, shrinks level by level: top titles 5/3/1/0, shorter digests, fewer frames), `search_board`
  (FTS over `index.sqlite`, scoped to the canvas, `SearchIndex.searchCanvas`, snippets), `read_card` (pages of 8,000 characters),
  `query_board` (pages of 20, at most 50, 16,000 characters), `query_dataset` (50 rows, 16,000 characters, cells cut at 200).
  Every board tool result is also cut at 24,000 characters as a last line of defence (`capText`).
- A frame digest is cached per frame and recomputed only when one of its cards changed: the fold keeps a card's object identity until
  a change replaces it, so "the same card objects" is the cache key (`BoardMapCache`, `stats.computed` / `stats.reused`).
- `ORB_TEST_NAMESPACE` must be lowercase (`a-z`, `0-9`, `-`; it is part of Keychain service names): `p68`, not `P68`.

### Layout tools: one undo group, no new undo machinery
- An agent rearrangement is appended with `Board.appendAgentGroup`: the inverse is computed first (`invertChanges`, as for a user
  action) and pushed on the user's undo stack as ONE entry; other agent actions are still never on the stack. The group starts with a
  `board.arranged` record (activity line; the UI starts the glide when it arrives), then the `frame.updated` / `card.moved` /
  `frame.added {index}` events. `reorder_frames` needs no new event: re-adding a frame under its own id re-inserts it at `index`
  (`packages/shared/src/fold.ts` `put`), and `invertChange` for it restores the old index (`history.ts`).
- "Pinned" = the user's own cards, or any card the user dragged. The fold sets `Card.userMoved` from a USER `card.moved` on an agent
  card (`fold.ts`), unless the move says `pinned` outright (undo writes it, so undoing an agent's tidy never pins; a card carried by
  its frame's drag sends `pinned: null`). `isPinned` also keeps a frame that holds such a card from being pushed or moved.
- `tidy_board` runs up to four passes; two frames that BOTH hold pinned cards and overlap cannot be separated, and their movable cards
  may keep trading cells (the fuzz test excludes only that case from the "settles" claim).

## P6.17 Presentations (2026-10-15)

### No harness surprises; three library facts
- **`compose_slides` rides the existing `@orb/canvas/port` Cordis row** (`packages/orb-canvas/src/port.ts` registers both `compose_section` and `compose_slides`), so the composed tree (`pnpm dump-config`, `scripts/test/dump-config.test.ts`) is unchanged; the guard, `hiddenPresetTools` and `childToolAllow` follow from `PORT_TOOL_NAMES` and Orb's allow-list in `packages/shared/src/agents.ts`. The tool's `parameters` DSL took a nested array of objects with an `enum` property as it did for the P6.6 tools (`defineTool`, same shape as `compose_section`'s paragraphs).
- **pptxgenjs 4.0.1 typings under NodeNext** (`node_modules/pptxgenjs/types/index.d.ts` ends in `export default PptxGenJS` in a CJS-typed package): `import PptxGenJS from 'pptxgenjs'` types as the module, not the class, and `PptxGenJS.Slide` does not resolve. At runtime the ESM build (`dist/pptxgen.es.js`) exports the class as `default`. `packages/orb-port/src/deckPptx.ts` reads `module.default` and unwraps one more `.default` if present, and derives the slide/table/text types from the instance's methods. Charts are `pptx.ChartType.bar|line|area|scatter|pie` (there is no `pptx.charts`); `slide.addChart` writes an embedded `.xlsx` for every chart (`ppt/embeddings/*.xlsx`), which is what makes them editable in PowerPoint.
- **pptxgenjs and the network**: `dist/pptxgen.es.js` imports `node:https` only to fetch an image whose `path` starts with `http`; every image here is passed as `data:` base64, so an export opens no socket (the deck exporter has no URL input). SVG images are not supported in Node (the library says so at `pptxgen.cjs.js` ~4961), so the footer mark is drawn from shapes. A scatter series with holes needs `null` values; the test asserts no `NaN` or `<c:v>null` reaches the chart XML.

### Design
- **One print pipeline, three routes**: `/print/deck?canvasId` joins `/print/canvas` and `/print/doc` (`parsePrintRoute` allows only `canvasId` for it). Its page is 960x540 CSS px (`@page`), written as an inline `<style>` like the document route's, so `preferCSSPageSize` in `apps/desktop/src/main/native.ts` gives 16:9 pages with no main-process change. The page's design-frame step snapshots the frames the slides show (not a frame scope).
- **Snapshots for the .pptx**: the .pptx is built in the sidecar, which cannot capture a window. The slide view first runs the deck print route through `orbNative.exportPdf` (discarding the bytes) whenever a slide shows a design frame; the print page stores the 2x snapshots, and `DeckStore.snapshotOf` takes the newest `assets/snapshots/<card>-v*-<ms>.png`.
- **Regenerate guard**: while a slide job runs, `compose_slides` accepts exactly one slide, with that slide's id (`apps/ui/test/deck.contract.test.ts` 'regenerateSlide rewrites one slide only'); anything else is refused with the reason, as the section job does.


## P6.20 Board layout quality (2026-10-16)

No harness surprises: everything here is the renderer, `packages/orb-canvas` (the only board writer) and `@orb/shared`. The evidence was the live Duolingo run (`.orb-dev/e2e-results/screens/p6.19-vc-live.png`): narrow frames growing only downward, fixed card heights, holes, links through cards, cards under the panels, 100% top-left on open. Historical captures (archived locally): `docs/screens/p6.20-board-fit.png` (the seeded 12-frame board as it opens), `p6.20-links.png`, `p6.20-cards-full.png`.

### Decisions
- **Frames grow sideways first, then down** (`layout.ts` `placeInFrame`). A card that does not fit the frame's height tries the frame one grid column wider, up to `LAYOUT.maxCols` = 8 columns (1216 px), and takes the first width where it fits without a taller frame; only when no width helps (or the frame would be wider than `LAYOUT.aspect` = 2.4 times its height, or would run into a frame holding a user card) does the frame grow downward. A card wider than its frame (database, matrix, timeline, framework, design: 4 columns) widens the frame instead of being cut to it (it was cut to the frame's columns before). Placement inside a frame stays "first free cell, topmost then leftmost" (a skyline pack): with 4 to 8 columns and spans of 2 to 4, mixed widths no longer leave a one-column hole.
- **Frames beside and below move with a growing frame** (`pushFrames`, replaces `pushFramesBelow`, which is kept as a down-only wrapper): a frame to the right (rows overlapping) follows the right edge, a frame below (columns overlapping) follows the bottom edge, each keeping the gap it had (at most `frameGap` = 48), in a cascade; a frame holding a pinned card never moves. The resize planner relocates unlocked frames around pinned obstacles and refuses impossible growth (see Known limits). The same function PULLS frames closer when a frame shrinks (attached frames only, never into another frame).
- **Template frames are sized by their seeds** (`templatePlan.ts`): each frame is 4 to 8 columns wide, the width that makes frame + seeds + the spec's `room` closest to landscape (1.5); the frames are then packed in the spec's order into the first free spot (top, then left) in a board whose width makes the board closest to a 16:10 screen (1.6). The twelve-frame VC template is 8,8,5,5,... columns wide in a 4,644 x 3,115 board (aspect 1.49); the 28 specs all come out between 1.37 and 1.84. `TEMPLATE_LAYOUT_V2` (nominal, three to a row) is now only what `templateFrames()` returns for tests; the service never uses it.
- **Card heights follow content: estimate, then measurement, persisted as ordinary events.**
  - A card is placed with an ESTIMATED height (`estimateHeight`: title and why lines, text length, rows of a database, items of a checklist) inside the type's range `HEIGHTS` (`packages/shared/src/cardSize.ts`; floor 176 so the title-only level of detail fits, ceiling per type).
  - The renderer then MEASURES: `apps/ui/src/canvas/Measurer.tsx` draws a hidden copy of every card the layout owns (an agent's card, a template seed the user has not dragged; never pictures and charts: `UNMEASURED_TYPES`) off screen at the card's width with no fixed height (the `probe` mode of `BoardCard`: same markup and CSS, so the number is exact), six at a time, and takes its height once it stops changing (160 ms; databases load rows after drawing). It does this at FULL detail whatever the zoom, so a board opened zoomed out is already laid out with real heights.
  - The heights go to the service as `orb/board.command {type: 'layout.measured', heights}` (debounced 350 ms, at most 200 per command; a command type of `BoardCommandRequest`, not an edit). **Channel choice**: board events, not an ephemeral channel: `CanvasStore.userCommand` calls `planMeasured` (pure, in `layout.ts`) and appends the result as ONE unit by the user actor, OFF the undo stack: a `card.updated {h}` per changed card (clamped to the type's range; a difference under 4 px is ignored), then the reflow (below) as `card.moved` / `frame.updated`. Because the heights are card events in `board.jsonl`, reopening replays them and folds to exactly the board that was on screen (e2e `layout.p620.spec.ts`, `measure.test.ts`); nothing is measured again unless a card's content or width changes. Measuring a board that is already measured writes nothing (idempotent).
  - **Reflow**: every frame whose cards changed has its movable cards (not pinned) laid out again in reading order around the pinned ones, growing sideways first; a frame whose content got shorter gives that height back (its free `room` stays) and the frames after it close up. The `card.moved` events carry `pinned: null`: the fold pins an agent card or seed on a USER move unless told otherwise (`fold.ts`), and a reflow must never pin. Pinned cards never move or change height (the user sized them).
  - Card bodies no longer depend on the height they are given (database, table, matrix, code, timeline, checklist and framework showed `floor((card.h - n) / row)` rows): they show the rows that fit under the TYPE's ceiling, so a measured height cannot change what is measured. Pictures, charts, diagrams, designs and videos fill the height they get and are never measured.
- **Nothing overflows a card**: at full detail a card the layout owns is `fixed` (its head, title, why line and footer stay; the content between them is clipped inside `.cardClip`, with a dashed rule under it when something is clipped; no fade, because text in a fade is below 4.5:1 contrast: a11y spec) and a "Show more" button (`data-testid="orb-card-more"`, shown only while the clip has overflow: `data-overflow` is set by a layout effect and a ResizeObserver, so rows that arrive later count) opens the reader. Compact and title levels clip by line clamps inside the floor height. e2e checks every card at all three levels: `scrollHeight <= clientHeight`, and no visible text line (clipped by every overflow ancestor) overlaps another.
- **Links are routed** (`apps/ui/src/canvas/routing.ts`): an orthogonal path with rounded corners round every other card. The graph is the Hanan grid of the two end boxes and every nearby card's edges grown by 8 px (so lines run in the middle of the 16 px gutters); a step may not enter a card or run along an end card's edge; A* picks the cheapest of the four sides of each end by length + 36 per turn. More than 260 cards in the region, or no path, falls back to the old curve (`data-routed` is absent). `LinkRoutes` keeps each link's route until a card near it changes and takes a 14 ms budget per pass (links not ready are drawn as the curve for a moment, then routed in the next slice), so a burst of events or a drag never waits for routing. Paths are drawn BEHIND the cards (the svg is before the first card in the world layer); labels are above, placed along the path where the pill covers the least of any card or frame furniture (`labelSpot`), then separated from each other.
- **Camera**: `chromeInsets` clears the floating panels (conversation panel or its pill, reading queue, minimap), read from the DOM, each on the side that lets the content be fitted largest (the minimap goes left or below, the chat panel right, whichever is cheaper). `openingView` fits the board on open: a board that already fits at 100% from the origin keeps the plain 100% view; a larger one is fitted, centred in the free area, never zoomed in past 100%. A fit may go below the 25% a pinch can reach, down to `FIT_MIN_ZOOM` = 8% (twelve wide frames are bigger than a 1440 px screen at 25%: they open as an overview; the 12-frame test board opens at 14% on 1440 x 900). Zooming out from such a view does not jump back up to 25% (`zoomAt`). While the user has not moved the camera the canvas keeps itself fitted: when agents or a reflow push content out of the free area it glides back (the camera never follows into the chat panel, queue or minimap). The user's own camera (a pan or zoom gesture, the minimap's buttons, a flight) is remembered per canvas: `canvas.json` `camera {panX, panY, zoom}` through the new `orb/canvas.camera` endpoint (not board state, no board event; saved 0.9 s after it stops moving and when the screen closes) and restored on reopen. An automatic fit is never saved, so an untouched canvas fits again.

### Smaller things found on the way
- **Print**: a frame taller than a page (now common: frames grow wide and tall) made the Canvas PDF end with blank pages: the print world is scaled by a CSS transform, whose untransformed height still paginated. `.page` now has `contain: layout paint size` (print.module.css). The e2e `print.spec.ts` fixture frames are crowded by locked neighbours, so it hits this.
- **Grid-aligned widths**: a card the layout owns whose width is not a whole number of columns (a board from before the grid, a card a script wrote) takes the columns its width covers (`spanOfWidth`) when it is laid out again, and `planMeasured` brings it onto the grid (`card.updated {w}`) the next time it is reported.
- **Reflow order**: `relayoutFrame` widens the frame to the width the whole run needs BEFORE placing the first card, so the order of the cards stays their reading order (widened half way, a later card took the top of the new columns, above an earlier one that had to go below a card that stays): e2e `agentlayout.spec.ts`.
- `.runLine`, card body and provenance text use full text contrast. The muted/soft versions fell below 4.5:1 over some frame tints and selection/search states; the full-board pixel scan exposed these after camera navigation was corrected.

### Agent layout tools
`move_card`, `arrange_frame`, `reorder_frames`, `tidy_board` and `consolidate_cards` run on the new engine unchanged (`arrange.ts` uses `relayoutFrame` and `diffChanges`, now in `layout.ts`); they lay cards out with each card's own height and so also grow frames sideways first. All their tests pass; `arrange.test.ts` needed no change.

### Known limits
- Pinned frames cannot be pushed. P6.20's follow-up relocates unlocked frames around them; impossible growth between two pinned frames returns FRAME_FULL instead of introducing overlap. A renderer measurement in such a frame retains its existing preview geometry. Explicit Repack board applies the compact packing to legacy boards, preserves pinned frames/cards and content, and is one undoable user action. Undo must restore pin flags on template seeds as well as agent cards (`shared/history.ts`); otherwise a repack followed by Undo silently pins all the seeds.
- Cards of a frame are only measured while a window is open on the canvas (the renderer measures); a board an agent filled with the app closed is laid out with estimates until it is opened.
- The measure step is the renderer's: with a second window on the same canvas both would send the same heights (idempotent, so harmless).

## P6.21 Research completion and reasoning (2026-10-17)

- **Use the installed stop hook.** `node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js:999` awaits
  `agent/turn-stopping` and then re-reads steering. `orb-agents/service.ts` uses that hook to continue the same task
  when actual board coverage is incomplete. A completed role pass is not a completed board. Repair messages are
  ordinary `user/message` records with an `orb-research-review` notice source, not new session event types and not
  fake human chat turns. Existing stop signals, pauses and output-composition jobs take precedence.
- **Tool arguments in session events can be JSON strings.** The installed loop's `appendToolCall` (same file,
  around line 682) records `block.arguments` without decoding it. Scope tracking must parse strings as well as
  accept structured arguments; otherwise a focused card edit can have no tracked frame. Track requests when their
  real user messages are consumed, not when queued: a new queued request must not steal the previous turn's scope.
- **Current date belongs in dynamic context.** Orb's persona row suppresses runtime context to retain a stable
  prompt-cache prefix. The current UTC research date travels as an additional text block in the same queued user
  request (after the human text, before the optional board-context block) and in child assignments. No date is put
  in the static persona or tool prefix. The UI renders the first block as the human text. A separate `inject()`
  would race a queued follow-up into the previous turn; keeping the context in that request avoids that race.
- **Do not cancel active source gathering because a table is temporarily empty.** A live reproduction showed the
  supervisor polling and stopping Scout before any upsert. Recently active research now defers a model-issued stop
  with an actionable result. The user's direct Stop/Pause controls bypass this safeguard. Child completion wakes
  Orb; the model should do independent synthesis and then wait, rather than poll or repeatedly redirect a busy child.
- **Review freshness and progress are separate from geometry.** Successful Scout writes and Orb's dataset upserts
  advance an evidence version; Critic and Builder assignments made before those inputs are refreshed. A reconciled
  route or budget must invalidate visuals too. `FRAME_FULL` is a normal tool result with an `error` property, not
  evidence; zero-write upserts do not advance freshness. Pending calls are keyed by session plus call id so child
  calls cannot collide. Repair limits count unchanged content, not camera moves, layout changes or progress labels.
  Successful writes refresh the live coverage status too.
- **Tests with partial scripted outputs need explicit lifetime management.** Their first metric/source/quote does
  not mean the research run ended. Fixtures stop outstanding work before reusing scripts; tests wait for the agent
  and dataset writes rather than only the end of a provider stream. Dedicated real-sidecar regressions prove that
  seven filled databases out of ten are repaired, no-op completion is rejected, stale reviews are refreshed,
  Orb's reconciled dataset inputs invalidate reviews, cancellation is respected, focused edits stay scoped and
  no-progress retries are bounded.
- **Root idle does not mean the team has finished.** An isolated live observer originally stopped after Orb was
  idle for 30 seconds, cutting off newly delegated Scout/Critic/Builder review passes. Observers must wait for all
  agent states to settle; the conversation's root `data-agents-state` attribute alone is insufficient. The private
  validation copy was resumed with its saved sessions, and that interruption is recorded separately from product
  behavior. Avatar `data-agent` / `data-state` attributes expose the child states without changing the wire.
- Detailed card analysis is a shared optional field (20k characters), carried through the canvas writer,
  `read_card` pagination, search, reader, document figures and PPTX notes. Typed summary limits remain in force;
  their validation errors now direct the model to put longer analysis in `detail` and retry.
- Consecutive deck drops exposed a renderer/storage race: a deck could be persisted at version N+1 before the
  response updated React's version N closure. The slide screen now queues edit intentions and builds each save
  from the preceding response. Its Electron regression delays responses after persistence to exercise that gap.
- Frame coverage is structural evidence only. It does not establish relevance, freshness, domain-appropriate
  metrics or a sound recommendation. The audit's unrelated onboarding research passed structural counts; the
  capability prompt, intake-led reasoning and final human/editorial acceptance remain necessary.
- Interactive HTML readers also use the visual viewport, at a fixed design size with an outer scale. Pan mode
  deliberately overrides the live iframe's inline pointer handling; Interact restores the sandbox's own controls.
  The builder Electron test verifies enlargement, drag panning, unchanged board camera and a real iframe button.
- The isolated resumed travel run filled 9/9 frames but did not settle within its 20-minute observation cap.
  Its root history reached 424 steps and provider rate-limit retries with requests near 249k input tokens. A
  stop-boundary retry limit does not constrain a pass that keeps calling tools. Context compaction and in-pass
  progress/repetition control remain P6.22, with evidence in the private audit rather than a claimed live pass.
- Final verification: 2,091 unit tests and package 5/5 pass. The full Electron run passed 106/107: the unchanged
  300-card timing test measured 29.64 ms p95 drag time once, then passed alone (2/2). Timing assertions remain intact.

## P6.22 — research context and execution (2026-10-17)

- **Orb had no active conversation compactor.** `dsh-web-app/cordis.patch.yml` disables the global
  `compaction-basic` row and mounts compactors inside its built-in presets. Orb disables/replaces those presets.
  `profiles/orb/cordis.patch.yml` now explicitly enables the global backend. A composed-config check and the real
  sidecar regression in `apps/ui/test/context.contract.test.ts` prove activation, durable checkpoints and reopen.
- The public `ctx.compaction.compactRegion` seam plus `ctx.tokenMeter.measure` supports an earlier 64k research
  budget independently of the adapter window (the live selected route reports 272k). `context.ts` retains a priced
  12k tail and the system head and uses the installed compaction package's tool-pairing boundary helpers. The
  backend owns checkpoint transactions; Orb never writes custom harness events or rewrites history. Summary output
  is capped at 4096 tokens. A live continuation notice restores the current request, saved intake and unfinished
  work. A failed summary backs off rather than retrying on every step.
- `tools/execute` replacements are revalidated against the tool's canonical output schema; a made-up "unchanged"
  value would violate `query_board`/`query_dataset`. Orb instead uses the documented `tools/post-execute` **content**
  projection, leaving canonical values intact. It hashes actual successful results, so concurrent dataset changes,
  pagination and errors cannot be hidden. Caches clear at turn/checkpoint boundaries. Proving implementation:
  `dsh-tools/lib/index.js` `normalizeDispatchResult`/`postExecute` and `lib/types/index.d.ts` `PostToolDecision`.
- Every sixteen steps an active whole-board pass receives a small execution check identifying the next actual
  gap. This also runs inside a pass that never reaches `agent/turn-stopping`. Existing-frame repair requests keep
  their frame plan unless expansion is explicitly requested, and routine relationship-link work yields to research
  content after twelve calls. Explicit link/expansion requests, output composition and human controls are preserved.
- Repeating a delegation to a busy agent already assigned those frames returns `working` without sending another
  assignment. Fresh evidence still invalidates completed Critic/Builder reviews. Source URL reuse and identical
  card updates do not masquerade as fresh evidence. Ordinary search belongs to Scout, not the root catalog; every
  request now states that distinction. Capability questions also receive implemented Orb product facts, avoiding
  inferences about missing storage, theme, zoom or export features from a role's tool list.
- The adapter exposes supported effort ids through `LlmResolvedModelInfo.reasoning.efforts`
  (`dsh-llm/lib/types/types.d.ts`). Root planning and Critic use `high`, Scout/Builder `medium`, only if the selected
  adapter advertises that exact id. Unknown/unsupported routes retain their defaults; no provider/model is changed.
- `place_card` reuses a source URL's existing card across roles (ignoring fragments and known tracking parameters),
  preserves ownership and asks Orb to refresh its text rather than adding a duplicate. `update_card` skips actual
  no-ops. Board reads expose existing detail lengths without including the full analysis on every request.
- The live backfill exposed a cold-resume ambiguity: a persisted "Critic is working" reply does not mean a child
  exists in the restarted runtime. Chat input now includes the actual role states. Detailed whole-board completion
  requires Critic/Builder coverage of every requested frame, after the latest evidence, even if the model forgot to
  delegate a review. A final consistency pass reconciles old evidence-gap claims, body/detail, units, totals and
  recommendations. The real-sidecar tests in `apps/ui/test/completion.contract.test.ts` prove automatic full reviews,
  a single final check, and respect for "no agents".
- Detailed synthesis can live in a long document body as well as common `detail`; requiring only the latter caused
  false gaps and repeated rewriting. Raw source excerpts do not qualify as synthesis. A specifically unavailable
  metric with a substantial explanation is acceptable; an unexplained dash is not. Private data must not be invented
  to satisfy a completion check (`completion.ts`, `test/completion.test.ts`).
- Agents could mark duplicate dataset rows but could not remove them. Existing `upsert_rows` now accepts exact
  `removeIds`, atomically with a merge into a surviving row. User rows remain protected, children remove only their
  own rows, and invalid merges write nothing. Identical normalized cells no longer bump revisions or invalidate
  reviews. Pure and store/tool tests cover these boundaries (`shared/test/dataset.test.ts`, `orb-canvas/test/datasets.test.ts`).
- Chat deck refreshes could accumulate old slide ids. `compose_slides` now supports explicit `replaceAll` with a
  complete validated slide list. Validation happens before replacement, versions still advance, and a single-slide
  regeneration cannot replace the deck. Native full compose jobs retain their existing first-write replacement.

## P6.23 — day appearance throughout the workspace (2026-10-17)

- The previous App route switch forced canvas/Port/deck to night, regardless of the saved appearance. The user
  explicitly expanded the original v0 day-mode scope. `App.tsx` now applies the saved choice throughout; canvas
  chrome has its own persisted toggle. Canvas/cards/reader/datasets/Port/deck use semantic foregrounds and surfaces,
  with white text retained on Signal-filled controls and suitable day grid/glows/shadows.
- Chart/diagram SVGs need their own palettes: CSS alone cannot change generated graphics. Interactive views receive
  appearance through `AppearanceContext`; print still owns its explicit palette. Mermaid rendering stays serialized
  and caches by source **and palette**, capturing the selected theme for each queued render to prevent toggle races.
- The pixel contrast scanner previously sampled the invisible tail of ellipsised text over neighbouring buttons.
  Its Range rectangles now intersect clipping ancestors before measuring visible pixels. Contrast thresholds are
  unchanged. The Electron checks exercise both appearances, readers, datasets, visual palettes, saved reload, Port,
  slide editing, focus and keyboard access.
- Extended day checks also exposed existing accessibility defects: the scrollable Mermaid source needed keyboard
  focus, and dataset add/remove controls were inside a tablist. The source is focusable; only actual view tabs are
  in the tablist, with roving focus and Left/Right/Home/End navigation.


## P6.24 — research pacing and final desktop regression (2026-10-17)

- A live Scout repeatedly fetched query/download/HTTP variants of the same inaccessible India Code PDF. Each
  network attempt waited 30 seconds; a prompt to use fallbacks was not sufficient. `orb-canvas/src/sources.ts`
  now bounds actual `TIMEOUT` failures per document: after two, a five-minute backoff covers equivalent PDF paths
  across query and HTTP/HTTPS variants. It never declares a site-wide outage or blocks another document. The
  backoff sits in `fetchIntoCache`, shared by `fetch_url` and uncached `read_source`, and the existing successful
  source-cache path remains available. Success/expiry allows recovery; cancellation does not consume the budget.
  The in-memory map is bounded. No new event, tool, credential, destination or persistent failure log is added.
- `orb-canvas/test/sources.test.ts` uses a real hanging local HTTP endpoint to prove the two-attempt bound, variant
  suppression, cached reads during a failed refresh, independent-source access and eventual recovery.
- The market-map repair varied its `query_board` arguments enough to evade identical-read suppression and repeatedly
  surveyed already-populated sections. An execution notice alone did not reliably stop that. After sixteen local
  reads without a substantive content write, a detailed whole-board root now receives a small `researchFocus`
  projection for a real unfinished frame instead of another broad overview. Targeted frame/card/dataset reads and
  search remain available; canonical values are unchanged. Actual content writes restore ordinary overviews; no-op,
  reused-source, link, cosmetic and delegation calls do not reset the counter. The real-sidecar regression in
  `apps/ui/test/context.contract.test.ts` proves varied scans, exact existing card guidance, batched useful writes,
  restored overviews and natural completion without a team. Detailed coverage is also retained after compaction;
  the checkpoint previously called `reviewResearch` without the active run's depth requirement (`service.ts`).
- Identical-read wording now describes only that successful read's content, rather than claiming the entire board
  is unchanged: other views and fields can differ. Build, all 2,111 tests and lint pass on the exact final source.
- Full desktop regression: 109/109 pass when run separately from packaging. The initial overlapped run's Home and
  layout failures were stale fixtures (forced-night canvas and three distinct papers using one source URL); their
  expectations now exercise saved appearance and unique source identity. Pan/zoom and startup timing misses in
  that overlapped run also pass in the complete sequential run, with every original threshold unchanged.

## P6.25 — autonomous request lifetime and deliverables (2026-10-17)

- A normal user follow-up previously deactivated `researchRuns` unconditionally. Asking for status could discard
  whole-board scope and its completion checks while children continued. Status/clarification turns now retain the
  active objective, constraints, assignments and output requirements; selected-frame context on a status question
  does not narrow the underlying task. Explicit replacement, focused work, setup-only requests and controls keep
  their scope. `workflow.contract.test.ts` uses the mock's `holdUntil` barrier to test the actual overlap.
- Selected-frame context on an ordinary correction or a simple continuation also retains the active whole-board
  objective. Only an explicit scope replacement (such as "only this frame") narrows it; "instead" inside a dietary
  or other constraint correction does not become a new task. Cold recovery is tested with a frame selected.
- Working objectives are saved through orb-canvas's atomic writer in `<canvas>/research.json`, separately from
  board content, and restored only on explicit continuation. Reopening alone never starts agents. Stop is retained;
  a status question neither restarts nor erases stopped work. A cold "Please continue" reconstructs the objective
  and checks against current saved content; stale runtime reviews are not assumed to be running. No custom harness
  events or direct edits of its history are used. Proving paths: `service.ts`, `store.ts`, `workflow.contract.test.ts`.
- User intent is distinct from the injected template playbook. Its available output formats and instructions must
  not silently become user requests, cancel scope, override Quick depth or authorize frame expansion. Ordinary
  Standard/default and Deep whole-board work requires detailed synthesis and fresh final review without the magic
  word "detailed"; deliberate rows-only and Quick requests retain their lighter scope. The existing persona-size
  ceiling remains unchanged; the root instructions were condensed rather than raising it.
- Template placeholders are matched by their non-title payload across the template. Renaming a frame/card cannot
  hide an untouched matrix or assessment. Open questions, risk warnings and checklists alone are not findings;
  an answered question can carry an actual result (`completion.test.ts`).
- Payload checks use the actual content fields of structured cards (framework cells, matrix options, table rows,
  diagram source), so changing a label cannot fill an empty assessment. The regression uses real seeded frameworks
  and entities; diagrams are targets rather than seeded placeholders in the current templates.
- Explicit continuation on older canvases without `research.json` can recover the last substantive user research
  objective from the public session surface. Status/continuation messages are skipped; no harness history is edited.
  Both new-state and legacy restart paths are exercised. Status detection includes ordinary phrasing such as "how
  we doing" and "can you tell me where we are", including when a frame is selected.
- A chat request for a deck/document can no longer finish after merely filling its board. The supported async
  `tools/pre-execute` seam returns `deny` while requested research/current reviews are unfinished; it never asks for
  approval. Successful composition tracks the current content fingerprint and the frames its citations cover.
  Partial outputs and outputs predating material corrections remain unfinished. Explicit native output jobs retain
  their selected-scope behavior. Contract tests exercise early, partial and stale deck/document writes.
- The first isolated ordinary travel brief exposed a separate in-pass gap: Scout gathered over fifty sources/read
  results without saving any candidate rows. After twelve research reads without a substantive own write, the
  `tools/post-execute` projection now adds a standard context notice identifying the next empty assigned database
  and requiring incremental verified findings. Canonical values and future reads remain available; unavailable
  exact-date/private fields must stay qualified. No-op/reused writes do not reset this pacing. A real-sidecar test
  proves the notice reaches Scout within its pass and the existing datasets are filled.
- Board events can be visible to the live service before the normal 250 ms file flush. A completed research
  objective now flushes its board before saving the completion status; the restart regression asserts actual disk
  content at completion. The observer also requires an actual running-to-idle transition; an initial idle snapshot
  is not completion.
- The ordinary live trip revealed that the 12k-character checkpoint was filled by the injected template playbook:
  its intake, role/assignment and unfinished-work fields were all absent. `context.ts` now budgets these fields
  separately and uses the original human intent instead of the template wrapper; long objectives retain their
  beginning and latest corrections. Pure and real-sidecar compaction/restart regressions assert that the intake,
  late constraints, role and unfinished work actually reach the model (`context.test.ts`, `context.contract.test.ts`).
- The user clarified that repairing the agent is the deliverable, not manually backfilling seven original boards.
  Those assisted runs were stopped and retained as diagnostic evidence. Acceptance uses ordinary requests on
  isolated fresh boards, with operator interventions recorded and no content patches disguised as agent success.
- Repeated full desktop runs exposed a real search/layout race: a source was selected and centred, then delayed
  measured layout moved its entire frame (in the proving run from x80/y120 to x1048/y1114), leaving the camera at
  the old coordinates and virtualising the card. This was not an axe/contrast failure. Focused navigation now retains
  a target through subsequent geometry updates; an explicit camera gesture/navigation releases that anchor, so
  later measurements cannot undo the user's pan/zoom. The keyboard regression moves a target asynchronously in
  both motion modes and checks retention plus manual takeover. Temporary observational logging was removed;
  no forced click, additional wait or threshold relaxation was added to the original a11y test.
- The Scenario A interaction mock matched the original idea/thread text inside retained completion checkpoints
  as if the user had submitted those requests again, redelegating children and then repeatedly placing its thread
  question. Its scripted initial plan, thread reply and Builder request are now consumed once. The fixture remains
  intentionally partial; the production completion policy still reports unfinished research rather than accepting
  the mock's "Done" text. No cursor, card-count, control-latency or completeness assertion was relaxed.
- A host/app crash interrupted the third isolated live run. Its saved board and all six populated datasets survived;
  cold recovery reopened that same board and sent only "Please continue." This case is recorded separately as
  crash recovery, with the interruption and continuation counted, rather than called uninterrupted acceptance.
- The final desktop run exposed a genuine thread/continuation leak after selected-context objective retention:
  the first thread answer was joined with subsequent whole-board repair replies at `turn/end`. Thread replies
  and placement context now close at the first awaited `agent/turn-stopping` boundary, before automatic repair
  continues in the same turn; the objective stays active. The end-event path remains an idempotent fallback.
  `service.test.ts` proves later progress cannot enter the reply or retain thread placement, and the original
  `agentui.spec.ts` assertion remains exact (no relaxed text match).
- The current child assignment is now distinct from cumulative frame coverage. A focused follow-up's checkpoint
  preserves its latest frame list and instruction, plus subsequent user/root directions; it no longer re-expands
  to every frame ever assigned. Scout save/finish notices use the same current scope. Batches of the same pending
  review still accumulate, and failed delivery restores the previous assignment. `team.test.ts` drives the actual
  pre-step compaction seam and checks both focused replacement and pending batches, including a later correction.
- Review coverage from an older evidence version is discarded when a newer focused review is assigned. Completing
  one updated section cannot reuse historical assignments to claim a fresh full-board review. The real-sidecar
  regression in `completion.contract.test.ts` changes an agent-editable dataset input, performs a focused review,
  and requires a subsequent review covering every frame. User-owned dataset rows remain protected.
- A legacy restart followed by "Status?" created a new dummy completed objective, preventing the later "Please
  continue" from recovering the actual prior research. Status-only messages now leave dormant durable state alone.
  The legacy cold-recovery contract sends status first with a frame selected, asserts that no dummy research file
  was written, then proves the original full objective completes. This fails against the earlier build at the
  research-file assertion, before any continuation can mask the loss.
- Composition denial now names the exact missing reviewers. The live run's generic "Critic/Builder" message sent
  the root through another Critic consistency pass when Builder was still missing. The workflow contract first
  completes Critic, attempts the deck, asserts the denial names only Builder, then finishes that review and the
  complete deck. The feedback remains a supported `deny`, with no approval request or relaxed output gate.
- The live Critic repeatedly flagged an unentered traveler rating rendered as zero. `matrixTotals` had explicitly
  treated null scores as zero, including in agent descriptions and native PPTX tables. Missing scores now leave
  their weighted total unknown, and an incomplete comparison has no winner. Fully entered zero ratings remain
  valid scores and ties. Board/compact/reader/print, agent summaries and PPTX agree; shared, UI and unzipped-PPTX
  regressions cover the pending user-rating case. The existing complete-score winner fixture remains unchanged.
- The live travel run repeatedly sought exact future quotes after all frames had content, withholding the deck
  until booking confirmation. A completed board now receives a delivery-phase notice at the first root step,
  as well as periodic checks; empty boards do not. Root and Critic distinguish a presentable provisional research
  output from a confirmed purchase or decision. Genuine unavailable/private/future inputs remain explicit,
  while only missing current reviews and material contradictions precede composition. The real-sidecar workflow
  regression preserves an unknown future quote and proves the delivery notice produces the qualified deck
  without fabricating a value or waiting for booking confirmation.
  The proving regression also caught that first `agent/pre-step` runs before `user/message` registers the new
  objective. Readiness now previews the claimed pending request without arming or persisting it at that boundary;
  accepted-message handling continues to own durable research state and explicit controls.
- A fresh software-research case exposed domain leakage in the shared child assignment: the unconditional
  "actual travel/event dates" instruction caused Critic and Builder to request an itinerary on an analyst-tool
  comparison. The shared research-date instruction now refers only to dates relevant to the actual brief and
  current evidence, and explicitly excludes invented requirements. The existing non-travel assignment regression
  checks that the unrelated travel instruction is absent.
- A loaded full unit run exposed two scheduling assumptions in older mocks (both specs passed unchanged alone).
  The stale-review contract now holds Scout's write until both initial reviewer requests exist, rather than
  assuming child creation finishes within 200 ms. Otherwise Builder's first review can legitimately start after
  the new evidence and need no second pass. The business Quick-tier contract stops its prior partial Standard
  board before resetting their shared model queue; late Standard completion must not consume the Quick script.
  The same review, cost-refusal and zero-spend assertions remain in place.
- Read-only native export QA of the naturally completed analyst-workflow deck exposed cropped PDF table rows.
  Slide visuals now measure and fit their whole print half, updating for loaded assets and changed dimensions.
  The desktop deck fixture includes a dense four-row comparison and checks the final cell's bounds as well as
  its PDF text. Native PowerPoint retains complete table cell text in speaker notes and labels condensed long
  cells; the unzipped-PPTX regression verifies the final qualification survives the preview's character limit.
  A transform alone still lets Chromium paginate the unscaled table and lose its final row. Fitting uses layout
  zoom, measures rendered bounds through the preview transform, and shrinks monotonically for the current card
  and viewport. This avoids font-rounding oscillation; changed content/viewport starts a new fit. The dense-table
  PDF regression caught both the missing last cell and an oscillating fit before the final implementation passed.

## P6.30 — professional report generation (2026-10-18)

- Output jobs previously skipped Orb's early 64k compaction path. A detailed multi-topic report could therefore
  inherit a large research history and keep reading without the report plan in its checkpoint. Professional
  report jobs now use the existing `ctx.tokenMeter.measure` / `ctx.compaction.compactRegion` seam, preserve the
  saved section IDs, instructions and remaining plan, and explicitly resume document writing. Per-job evidence
  receipts reset after compaction so a lossy summary cannot count as a full supporting-card inspection. The
  harness still owns history/checkpoint transactions. Proving paths: `packages/orb-agents/src/service.ts`
  `onPreStep`, `packages/orb-agents/test/team.test.ts` (report checkpoint).
- `agent.whenIdle()` establishes that a model turn ended, not that it wrote a complete report. `runPortJob` now
  reviews saved sections, substantive prose, per-topic citations and exact paragraph repetition, and queues at
  most two repair follow-ups. A previously complete document cannot satisfy a fresh compose/regenerate request
  without any new write. Explicit Stop/Pause prevents a follow-up; incomplete output ends as a failed draft,
  preserving saved sections. Real-sidecar proof: `apps/ui/test/report.contract.test.ts`.
- The board context passed to a compose turn is an index with abbreviated previews. `read_card` now records
  full-page receipts for professional report jobs; `compose_section` refuses cited or exhibited cards until all
  pages are inspected. Content/detail/note/view changes invalidate receipts. Dataset queries and cached primary
  source reads remain available through their existing guarded tools, without new filesystem or network tools.
  Receipts establish inspection, not the truth of claims or semantic support for a paragraph.
- Electron's pinned `PrintToPDFOptions` supports `generateTaggedPDF` and `generateDocumentOutline`. Both are
  enabled in `apps/desktop/src/main/native.ts`. Native PDF QA checks tags, links, bookmarks and all rendered pages.
  Professional reports curate figures and register unused evidence rather than duplicating whole source cards;
  brief/custom documents retain the full supporting-card appendix for compatibility.
- A natural eight-section live report exposed chat-style `[c_…]` identifiers copied into prose, despite the
  writing instruction. `validateSection` now removes only inline IDs already backed by that paragraph's structural
  `cardIds`, refuses untracked inline references and citation-only prose, and leaves structural citations intact.
  User-authored edits are not rewritten. Unit and real-sidecar tests cover the normalization. The writing brief
  also explicitly keeps IDs out of prose/captions and discourages repeating common qualifications in every topic.
- The 17-page live PDF exposed two print-only inheritance problems missed by the small synthetic fixture:
  a dense table's title could be left on the preceding page, and `cards.module.css` capped Mermaid SVGs at a
  204px thumbnail. Professional figures now use block fragmentation with headings kept with their content and
  page-sized vector diagrams. Board cards and other export modes keep their own sizing. Native PDF metadata now
  takes the actual document title instead of the print route's placeholder. The saved report is re-exported with
  no provider key, unchanged document bytes and no additional agent events for layout QA.
# P6.35 — persisted model choices also affect cold child requests and pre-step summaries

The user-supplied MacBook log shows old OpenAI API-key requests during context compaction after choosing ChatGPT plan usage. The native compactor chooses `configured ?? session.requestHeader().config ?? agent.options` (`node_modules/@deepseek-ai/dsh-compaction-basic/lib/index.js:292`), so passing new options at resume does not fix a summary before the first new request. Existing continuable children also retain their creation options on cold resume. The session controller's model-selection middleware can restore the old persisted route (`dsh-api-session-controller/lib/types/agent.js:300`).

Orb now snapshots the saved per-role route at system-prompt assembly and applies it after native request middleware. Its subclass of the public BasicCompactionEngine overrides only the documented summarize hook, passing a read-only agent/session route view; native balanced surface selection and append-only compaction events remain unchanged. The existing real-sidecar context test switches a live session to a different model before its first summary, then restarts and verifies the same route and checkpoint. The real continuable-child test switches an existing Scout and root before a new assignment and verifies actual request models.

Native settlement notices contain a stop reason and closing text, but omit the underlying model failure (`dsh-subagent/lib/types/continuation-messages.js:createSettlementMessage`). Orb now observes native `turn/end` errors, records safe failure facts locally, adds the details to the matching parent notice, and exposes them in the agent menu. No transcript or credentials are added to the diagnostic log. The ChatGPT route uses two native transient retries; explicit plan limits, permission and invalid-request failures remain outside that policy.
# P6.36 — browser research keeps the harness's guarded source tools

The pinned harness has search-provider and tool seams but no general browser-search/read implementation. Orb
already owned a sandboxed Chromium screenshot loader (`apps/desktop/src/main/capture.ts`). Its new shared public
page loader preserves that session, request filter, cancellation and cleanup, with browser reads/searches serialized
on the existing authenticated control channel. Source tools add a boolean `browser` argument; their role allow-lists
are unchanged. Main accepts only the structured shared BrowserRequest, runs fixed DOM extraction in an isolated
world, checks final navigation/HTTP status and returns bounded source HTML or validated search links.

`packages/orb-canvas/src/browserSources.ts` puts rendered articles into the same SourceCache, marked `rendered`, so
read_source, citations and exports need no new storage system. Browser search results are cached per canvas and
query; missing search API credentials now select the desktop browser instead of disabling discovery. The helper
never executes model-supplied code. Public/private URL rules are still in captureFilter.ts and orb-sources/policy.

Evidence: `apps/desktop/e2e/browser.spec.ts` uses actual Chromium, delayed page JavaScript and the real guarded Scout
tool path, then composes/exports a cited document from cache. It also blocks a page's localhost request, rejects
CAPTCHA and HTTP 503 as evidence, and closes a slow browser load through Stop all. The unchanged screenshot test
still passes. `.orb-dev/browser-live-result.json` records a production-code Bing search and World Bank rendered
read, zero model calls and no search API key. These checks do not claim live ChatGPT plan workflow acceptance.

# P6.37 — completion instructions are not conversation content

The coverage checker intentionally returns detailed repair reasons for agent prompts (`packages/orb-agents/src/completion.ts`). The rail was also rendering `gap.reasons.join(' ')` directly (`apps/ui/src/screens/Canvas/ConversationPanel.tsx`), exposing card/dataset IDs and tool instructions in repeated paragraphs. No harness failure is established by that text: coverage and runtime state are separate. `ResearchProgress.tsx` now presents bounded, collapsed user-facing counts outside the conversation log; unfamiliar diagnostic reasons receive a generic review label rather than raw text. The original reasons and stop-boundary repairs remain unchanged. A twelve-section real-sidecar Electron fixture checks navigation, message access, bounded scrolling and both appearance modes.

# P6.38 — verify the composed plugin identity and thread inbox boundaries

The MacBook log exposed a missed deployment seam in P6.35: `name` in an entry patch is a match guard, never a replacement (`node_modules/@deepseek-ai/dsh-app-boot/lib/index.js:101`, also `cordis-plugin-include/lib/index.js:96`). The attempted native-compactor rename was skipped. The bundle now disables the native row and inserts `orb-compaction`; the profile restores/configures that exact row. The dump test asserts the enabled plugin identity/configuration and the real compaction contract rejects the skipped-patch warning. The existing summarizer-route proxy remains the implementation.

The actual saved thread contained a reply about six minutes after its question. `send` had always used native `followup`, waiting for the whole active research turn. Thread questions now use native `steer` at the next running step. Pre-step admission separates multiple user requests when threads are involved, requeues later ones through the native inbox, and flushes an earlier answer before a new human request can replace its routing. No model request is cancelled or custom session event added. Expanded readers expose Thread; the popup is bounded to remaining screen height and reports queue/send/provider failure states.

Matrix reader QA also uses a real wheel event over the horizontal scroller. Programmatically scrolling the outer reader would miss overscroll containment trapping vertical input. The first native wheel check reproduced the trap; restricting containment to the horizontal axis leaves detail reachable while preserving the pinned criterion column. Final native checks cover this at 960×600, both appearance modes, local reference navigation and export layout.
