# DeepSeek Harness (dsh) deep dive, for Orb v0

Oct 14, 2026. Checked against the install on this Mac: `@deepseek-ai/dsh` **0.1.5-rc.2**, at
`~/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/` (written `@/` below). The user's dsh state is in `~/.dsh`
(profile `web`, default model `zai-coding-cn/glm-5.3`). Node 24.3.0 and pnpm 10.23.0 are installed.

This audit was the input to `docs/PRD.md` (rev 2) and `docs/BUILD_PLAN.md`. The original PRD it audited is in `docs/archive/`.
Orb pins **0.2.0-rc.2**, which is newer than the version audited here. See §9 for the deltas. Re-verify each API in
`node_modules` before relying on it (BUILD_PLAN P1.0).

## TL;DR

| PRD claim | Verdict |
|---|---|
| Board stored as custom `orb/*` session events | **Breaks on reload.** Appends work, but on reopen any unknown event type that is not marked `ignorable` is rejected, and `append()` cannot set `ignorable` |
| Per-canvas `session/` folder | **Wrong.** There is one global sessions root per harness instance |
| One canvas = one root session; subagents are child sessions | Confirmed |
| Subagents support personas, tool filters, output schemas, quiet reports | Personas and tool filters: yes. **Output schemas: not for continuable children.** **Quiet reports: no**, a child's messages wake the parent |
| Need our own orb-server WebSocket because the SDK wire has no cancel or close | SDK claim correct, **conclusion outdated**: the web gateway already has `session/cancel`, steer, event streaming and auth |
| Headless is one-shot and fails closed without an approval channel | Confirmed |
| macOS sandbox backend unverified | **Outdated.** A Seatbelt (`sandbox-exec`) backend exists and reports full enforcement, but it only confines subprocesses |
| Keys in Keychain via a credential plugin | Supported by design (swap out the `credentials` service), not shipped |
| No telemetry by default | **Conflicts.** Feedback telemetry, the plugin-inventory field and an anonymous-ID header are on by default |
| Stop halts all agents within 1 s | Not guaranteed. Cancel is cooperative; Orb has to orchestrate and measure it |
| Tauri with a Node sidecar | Works only by loading the UI from `http://127.0.0.1:<port>`. **Electron is the vendor's intended desktop host** (the `desktop` profile name is reserved for it) |

## 1. Boot, profiles, plugins

- **Profile composition.** It starts from an empty `cordis.yml` root, then layers: each package in `dsh.profile.bundles`
  in order, then `profiles/<name>/cordis.patch.yml`, then `$DSH_HOME/cordis.patch.yml` (applies to *every* profile), then
  `--patch` files, then `DSH_TELEMETRY_DISABLED`. Code: `@/dsh/lib/profile-boot-*.js`, `@/cordis-plugin-include`.
- **Patch entries.** `- insert: [...]` adds rows. `- id: X` overrides that row's fields. Watch out: `config` is
  **replaced whole, not deep-merged**. `disabled: true` turns a row off. `!!js expr` is evaluated with `ctx` services and
  `dshHomePath()` in scope.
- **Bundle package.** Needs `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}`, and must export `./cordis.patch.yml` and
  `./package.json` (copy `@/dsh-base/package.json`). Rows can reference the bundle's own files with `./` paths.
- **Creating `orb`.** Run `dsh plugin --profile orb add <path-to-orb-bundle>`. This creates the profile with **dsh-base only**;
  add `@deepseek-ai/dsh-web-app` explicitly to reuse the web gateway. Use `patchReload: startup` (`live` mounts hot reload
  and file watchers).
- **Cordis plugin shape.** Export `name`, `inject`, `Config` (schemastery) and `apply(ctx, config)`. Use `ctx.provide`, `ctx.on`
  (auto-disposed) and `ctx.effect`. The class form is `extends Service`. Expose methods to the UI with `TypertRemoteService` + `@Remote`.
- **`DSH_HOME`.** Every piece of state (profiles, sessions, storages, settings, credentials) follows it. **Run Orb with its own
  `DSH_HOME`** (e.g. `~/Library/Application Support/Orb/dsh`) so the user's `~/.dsh` home patch, keys and telemetry ID
  don't leak in.
- **Node.** No `engines` field. The bin relies on `import.meta.main` (Node ≥22.18 / ≥24.2), and on older Node it silently does
  nothing. Ship a pinned Node.
- **`--dump-config`** works today: `node @/dsh/lib/bin.js --profile web --dump-config`.
- **Shutdown.** SIGTERM disposes the tree with a 5 s hard timeout; a second signal forces exit.
- **Stability.** It is an rc. The SDK protocol has "no compatibility promise". The `dsh/reference/` docs that the README links to
  are not in the npm package.

## 2. Sessions and the board log (the big one)

- **Log.** Each session is an append-only list of `{type, seq, time, data, ignorable?}` events, format v3, written as zstd JSONL.
  Writes are batched every 200 ms and fsync'd, a `session.lock` flock guards the file, and a torn tail is truncated on recovery.
  `ctx.sessions.flush()` gives a hard durability point. Losing at most 1 s of work is achievable.
- **Custom events.** `session.append('orb/card.added', …)` succeeds, because the append path never checks the type. **But**
  `validateStoredEvents` (`@/dsh-session-persistence/lib/index.js:183`) throws `SessionFormatUnsupportedError` for any
  type outside the build-time `KNOWN_SESSION_EVENT_TYPES` that is not marked `ignorable: true`. `Session.append()`
  (`@/dsh-session/lib/index.js:1170`) has no way to set `ignorable`. The result: the canvas cannot be reopened or resumed.
- **Also.** `dsh-session-log-deepseek` uploads the session-log suffix (including unknown ignorable events) to DeepSeek
  when it is enabled. It is off by default; keep it off.
- **Projections fit well.** `ctx.sessionProjections.register({key, stateSchema, init, apply})` folds every event
  into state, with snapshots, a change feed and a checkpoint cache. That is exactly the board fold, once the events can survive a reload.
- **Storage root.** There is one global root (`dshHomePath('sessions')/--<cwd>--/<id>/`), so a per-canvas `session/` folder is impossible.
  Setting the session's cwd to the canvas folder groups its sessions together, but they still live under the global root.
- **Fork.** Live sessions only, outside an open turn. **Resume** is via `ctx.agents.resume()`. Compaction never rewrites
  events; it only changes what the model sees, so it is safe for board data.
- **Full-text search.** `session-query-sqlite` indexes first-party text only, and you can't register your own extractor, so it's
  no use for Home search.

**Recommendation.** Keep the board out of the session log until upstream supports writing `ignorable` from `append()`:
- **Board log.** Each canvas keeps its own append-only log, `canvases/<id>/board.jsonl`, owned by `orb-canvas`.
- **Link to the session.** Each board event records the session id and session `seq` at the time it was written. That provides
  "why it's here" and provenance without putting custom event types in the session log.
- **Ask upstream.** Request an `ignorable` option on `append()`, or a way to register custom event types. That would let a later
  version move board events into the session log.
- **Folder layout.** The PRD's per-canvas folder layout still works for everything except `session/`. That folder lives under
  Orb's own `DSH_HOME`.

## 3. Agents and subagents

- **Agents API** (`@/dsh-agent`). `ctx.agents.create({sessionId, meta:{cwd, agentPreset}, agentOptions:{provider, model}, setup})`
  creates an agent, and `followup` / `steer` / `inject` / `whenIdle` drive it. `agent.cancel({kind:'user'}, {keepInbox})` aborts the turn's
  AbortSignal; text already streamed is kept, marked interrupted.
- **No native pause.** Emulate it with `cancel(…, {keepInbox:true})`, then a later steer.
- **Stopping.** Cancel is fire-and-return and cooperative. Tools that ignore `exec.signal` keep running, and workflow workers take up to 5 s
  to die. For "Stop within 1 s": interrupt every child, cancel the root, then `whenIdle()` with a timeout. Never give these agents the
  `workflow`, `ralph` or jobs tools.
- **Presets** (`@/dsh-agent-presets/presets/*`). Each preset is a directory with `preset.yml` + `agent.cordis.yml` (rows). Tools come
  from whichever rows are listed; presets have no model field. Ship Orb's presets through the preset `roots` config.
- **Per-agent models.** Set `agentOptions` on `create()` or on the subagent start request. Spawn and fork accept them.
- **Subagents.**
  - **Continuable children:** `ctx.subagents.startContinuable` creates long-lived children, so continuable children are
    confirmed. `sendMessage` redirects one, `interrupt(childId)` stops only its current turn.
  - **Stop all:** there is no single primitive for it; Orb has to orchestrate it.
  - **Messaging:** an agent can only message its parent or a direct child, never a sibling.
  - **Output schemas:** stripped for continuable children (`ContinuableStartSpec` `Omit<…,'outputSchema'>`). Use a
    custom card-placing tool (`place_card` with a strict schema) instead. That is better anyway.
  - **Quiet reports:** a child's `send_message`, and its finished notice, wake an idle parent. For quiet progress, have an Orb
    tool call `ctx.agents.get(parent).inject()` and emit a UI event.
  - **Presets:** children join the parent's preset, so Scout, Critic and Builder cannot have separate presets. Use
    `persona` + `toolFilter.allow` + `agentOptions` per child. Use `allow` lists: a deny entry naming a tool that isn't
    registered fails startup.
  - **Approvals:** children run with approval `never`, and anything that needs approval is auto-rejected.
- **Workspace.** Each session has an immutable `meta.cwd`, which becomes the sandbox writable root, and children inherit it.
  Create each canvas's root agent with `cwd` = the canvas folder.

## 4. Tools, sandbox, web

- **Custom tools.** `ctx.tools.register(defineTool({name, description, parameters, output:{schema, render}, execute(args, exec)}))`.
  - **Schemas:** parameters and output use dsh's own JSON-schema-like DSL. Results are always structured JSON.
  - **Abort:** `exec.signal` must be honoured.
  - **No progress streaming** from tool bodies; use UI events instead.
  - **Example to copy:** `@/dsh-tool-ask-user/lib/index.js`.
- **Policy.** `ctx.tools.restrict({allow|deny})` sets per-agent tool lists, and `ctx.tools.guard(fn)` adds a deny that can't be overridden.
- **Tools to exclude from every Orb preset:**
  - `bash`, `pwsh` and the persistent shells
  - `job_*`
  - `run_code` (PTC)
  - `workflow` and `ralph`
  - `cordis_*`

  The simplest route is a custom Orb preset that never lists those rows.
- **Sandbox.** The macOS backend is Seatbelt via `/usr/bin/sandbox-exec`: deny `file-write*`, allow-list the roots, full
  enforcement, fail closed (`@/dsh-sandbox-local/lib/index.js:174`). It **only confines subprocesses**. In-process writes are
  fenced by `dsh-fs-sandbox` (session cwd + `/tmp` + `os.tmpdir()`). **Reads are not confined anywhere.**
- **Orb must:**
  - guard `read`, `grep` and `glob` to the canvas folder;
  - route its own writes through `ctx.fs`;
  - use `workspace-write` with approval `never`.
- **Approval** fails closed when there is no answerer. Confirmed.
- **Web.**
  - **Search:** `web_search` exists, but its only provider is DeepSeek, and each search costs a model turn.
    `ctx.web.registerSearchProvider` lets Orb plug in Brave, Exa or Tavily.
  - **Fetch:** `web_fetch` converts HTML to Markdown (turndown + GFM), blocks private IPs, and caps at 5 MB.
  - **Not supported:** **PDF** (rejected as an unsupported content type) and **screenshots** (no browser automation exists).
    `orb-sources` has to build both, for example pdf.js text extraction and an Electron offscreen capture.
- **MCP client.** One row per server, stdio or streamable-http. Only tools are bridged (no resources). Stdio servers run outside the sandbox.

## 5. Models, keys, cost, telemetry

- **Providers.** `dsh-llm-deepseek` serves `deepseek-official`. `dsh-llm-pi-ai` (pi-ai 0.85.1) has catalog routes for Anthropic, OpenAI,
  OpenRouter, Google, Bedrock, DeepSeek and others, configured under `llm-pi-ai.providers.<id>` in `settings.yaml`.
- **Custom endpoint.** Set `api` (`openai-completions` | `openai-responses` | `anthropic-messages`), `baseURL` and `models[]`.
  Ollama needs a placeholder key.
- **Model discovery.** `ctx.llm.discoverModels`, also exposed to the UI as `llm/discoverModels`.
- **Settings changes** apply on the next request.
- **Credentials.** `CredentialProvider` (`@/dsh-credentials`) supports refs and records, plus update events. Keys are resolved
  on every request, so changes take effect without a restart.
  - **Default store:** `dsh-credentials-local` keeps keys in **plaintext** `~/.dsh/.credentials.yaml` (mode 0600).
  - **Keychain:** `orb-keychain` replaces the `id: credentials` row with a subclass. There is exactly one `ctx.credentials`.
  - **No masked suffix:** nothing returns part of a key, so `sk-...4f2a` needs Orb's own `@Remote` method.
- **Test button.** Not provided. Build it as `ctx.llm.stream({maxTokens:1})` and map the error codes
  (`AUTH`, `INVALID_CREDENTIAL`, `QUOTA`, `RATE_LIMIT`).
- **Cost.**
  - **Tokens:** the `tokenUsage` projection gives per-session token totals (uncached input, output, cache read, cache write).
  - **Money:** there is **no money anywhere**; dsh even zeroes pi-ai's `ModelCost`. The cost meter and editable price table are Orb's own
    work, and pi-ai's catalog can seed the default prices.
- **Model selection.** It is per session, and subagents get theirs through `agentOptions`.
- **Telemetry. These must be switched off in Orb's profile:**
  - **Feedback upload:** `session-telemetry-otel` defaults to `FEEDBACK_ONLY`. A `/feedback` uploads the whole session plus cwd to
    `harness-telemetry.deepseeksvc.com`. Set `DSH_TELEMETRY_DISABLED=1`, or set `mode: DISABLED`.
  - **Plugin list:** `plugin-package-inventory-deepseek` adds the list of every active plugin (orb-* included) to every DeepSeek
    request. Set the row to `disabled: true`.
  - **Anonymous ID:** `dsh-llm-deepseek` *always* sends `x-deepseek-harness-user-id` + session id headers
    (`@/dsh-llm-deepseek/lib/index.js:1665`), and no config turns it off. Route DeepSeek through pi-ai's `deepseek` catalog route instead.

## 6. Wires and UI integration

- **SDK JSON-RPC (stdio).** Only `initialize`, `session/prompt` and `shutdown`. **No cancel or close** (`@/dsh-sdk-jsonrpc-server/README.md:125`),
  and no approval channel. Not suitable for Orb.
- **ACP (stdio).** Has `session/cancel`, `session/close` and `request_permission`, but it's an automation-only surface, too thin for Orb's UI.
- **Web gateway** (`dsh --profile web`, HTTP + WebSocket on 127.0.0.1). This is the one to use.
  - **Calls:** `POST /api/<ns>/<method>` for unary calls, plus one multiplexed WebSocket at `/api/remote.mux`.
  - **Session endpoints:** `session/create|fork|list|prompt|follow|control|updateQueue(steer)|cancel|selectModel`, plus workspace endpoints.
    `cancel` is at `@/dsh-api-session-controller/lib/typert.host.js:762`.
  - **Events to the UI:** status, activity, approval requests and user questions, over the `$events` stream.
  - **Orb's own endpoints:** add them from a plugin with `TypertRemoteService` + `@Remote`, or with the lower-level
    `ctx.connection.fetch.register` / `ctx.webServer.registerUpgrade`.
  - **Auth:** a one-time `/?token=` swapped for an HttpOnly SameSite=Strict cookie. The **`Origin` must equal the `Host`** and must be
    loopback, otherwise the request gets a 403.
  - **Security gap:** `GET /api/file?path=` reads any file the process can reach. Orb must block or wrap it.
- **Web frontend.** The frontend is a fixed shell plus Cordis client plugins (`dsh-client-ui-*`), which can be swapped. But they must be
  prebuilt against a fixed module table. Orb's own React app is simpler: speak the POST and WebSocket protocol directly.

## 7. What this does to the Orb architecture

1. **Shell.** Lean toward **Electron**. Open a `BrowserWindow` straight on the sidecar's `http://127.0.0.1:<port>/?token=…`, so the
   cookie and Origin checks just work. Upstream's reserved `desktop` profile and its IPC carrier point the same way. Tauri is possible, but it
   needs the webview to load from that origin, or a proxy.
2. **Sidecar.** Spawn `node <pinned>/dsh/lib/bin.js --profile orb --port 0 --no-open` with `DSH_HOME` = Orb's app-support directory.
   Read the token URL it prints (check whether it goes to stdout or stderr).
3. **Profile.** Bundles: `dsh-base` + `dsh-web-app` + `orb-bundle`. In the patch:
   - telemetry off and plugin inventory disabled;
   - DeepSeek routed via pi-ai;
   - credentials swapped for orb-keychain;
   - `/api/file` blocked;
   - permission mode `workspace-write` with approval `never`;
   - `patchReload: startup`.
4. **orb-server shrinks** to a thin `orb-host` plugin of `@Remote` endpoints:
   - canvas commands and a board event stream;
   - stop-all orchestration;
   - session close;
   - key masking and the key Test call;
   - cost.

   Cancel, steer, prompt and follow come from the existing gateway.
5. **orb-canvas.** Owns `board.jsonl` per canvas, plus a board projection kept by Orb itself (not in the session log, see §2). Its agent
   tools `place_card`, `add_link` and `query_board` write through it, and it enforces frame budgets and "agents never touch user notes".
6. **orb-agents.**
   - **Orb (the main agent):** a root agent created per canvas with `cwd` = the canvas folder, using a no-shell `orb` preset.
   - **Scout, Critic, Builder:** continuable children, each with its own `persona`, `toolFilter.allow` and `agentOptions`.
   - **Quiet progress:** via `inject()`.
7. **orb-sources** must add a search provider, PDF text extraction and page screenshots. None of these exist in dsh.

## 8. Suggested additions to Gate 1 (spike)

- [ ] `--dump-config` for `orb` shows dsh-base + dsh-web-app + orb-bundle, with telemetry and plugin inventory disabled.
- [ ] Reopen test: write board events, kill the process, reboot, reopen the canvas. Board and session both restore.
- [ ] Stop test: Orb plus 3 children mid-stream and mid-tool. Measure the time from Stop to all agents idle.
- [ ] Origin test: the chosen shell (Electron or Tauri) loads the UI and calls `session/cancel` successfully.
- [ ] Confirm that `read` outside the canvas folder and `/api/file` are both blocked.

## 9. Delta: 0.2.0-rc.2 (latest on npm, 2026-10-14), spot-checked

Orb pins 0.2.0-rc.2. These were re-checked against an install of that version.

**Unchanged (the blockers still hold):**
- **Custom events still can't be reopened.** `validateStoredEvents` still rejects unknown event types that aren't marked `ignorable`
  (`dsh-session-persistence/lib/index.js:184`), and `Session.append(type, data, ...opts)` still can't set `ignorable`
  (`dsh-session/lib/index.js:1441`). The board must stay in Orb's own log.
- **The SDK wire still has no cancel or close** (`dsh-sdk-jsonrpc-server/README.md:125`). The web gateway still has
  `session/cancel` (`dsh-api-session-controller/lib/typert.host.js`).
- **Telemetry defaults are unchanged.**
  - `session-telemetry-otel` still defaults to `FEEDBACK_ONLY` (`dsh-base/cordis.patch.yml:207`).
  - The `plugin-package-inventory-deepseek` row is still mounted.
  - The DeepSeek adapter still sends `x-deepseek-harness-user-id` (`dsh-llm-deepseek/lib/index.js:2200`).
- **Still no PDF handling** in `dsh-web-fetch-http`.
- **`host-frontend-static` serves a configurable `distIndex`**, so Orb's own UI can be served from the gateway origin.
  `@Remote` is a standard TC39 decorator.

**Changed or new (verify in P1.0):**
- **Session format v4** (`dsh-session-format-v3-to-v4`).
- **Agent presets were reworked.**
  - Removed: `dsh-agent-presets`.
  - New: `dsh-agent-preset` ("declare an Agent capability composition in Cordis YAML") and `dsh-agent-preset-registry`.
- **Settings and config.** `dsh-settings-file` was removed, and `dsh-config-editor` is new (it persists plugin config through profile patches).
- **Hot reload and code runtime moved.**
  - Removed: `cordis-plugin-hmr`, `dsh-code-runtime*` and `dsh-workflow-worker-thread`.
  - New: `dsh-hmr` and `dsh-ptc-runtime*`.
- **New telemetry.** `dsh-host-product-telemetry-otel` and `dsh-client-product-analytics` are new, mounted by `dsh-web-app`, and
  enabled **only when the profile is named `desktop`**. The `orb` profile skips them, but disable them explicitly anyway.
- **New accounts and features.**
  - Accounts: `dsh-deepseek-account*` and `dsh-llm-deepseek-account` (DeepSeek sign-in).
  - Resources: `dsh-mcp-resources`.
  - Office files: `dsh-office-to-pdf` and LibreOffice kit packages.
  - Experimental: an agent team, speech-to-text and auto-review.

  None of these are needed by Orb. Leave them unmounted.
