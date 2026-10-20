# Spike notes (Phase 1)

One section per harness seam checked in P1.0, plus findings from P1.2–P1.12. Format for each seam:

### <seam>
- **Expected** (deep dive / plan):
- **Actual in 0.2.0-rc.2**:
- **Proof**: `node_modules/@deepseek-ai/<pkg>/<file>:<line>`
- **Status**: ✅ as expected / ⚠️ differs, with the workaround

All paths are relative to `node_modules/@deepseek-ai/` of the hoisted install (`.npmrc`: `node-linker=hoisted`).
Checked on 2026-10-14 against `@deepseek-ai/dsh@0.2.0-rc.2`.

## P1.0 seams

### Agents API: create, cancel, whenIdle, inject
- **Expected**: `ctx.agents.create({sessionId, meta:{cwd, agentPreset}, agentOptions:{provider, model}, setup})`, plus `cancel({kind:'user'}, {keepInbox})`, `whenIdle()`, `inject()`, `followup`/`steer`, and `ctx.agents.resume()`.
- **Actual**: as expected. `create(o): Promise<AgentHandle>` with `AgentHandle = {agent, dispose()}`.
  - `sessionId` is **required** and minted by the caller. `create` builds the session itself (`ctx.sessions.prepare`), so Orb never calls `ctx.sessions.create` first.
  - The cancel cause is an object: `{kind:'user'|'parent'|'hook'|'disposed'}`.
  - `inject()` adds context for the next step and does not wake the agent. `followup()` queues a turn and wakes it.
  - Prompting from code: `agent.followup(createUserMessage({content:[{type:'text', text}], source:{kind:'user'}}))`, with `createUserMessage` from `@deepseek-ai/dsh-llm`.
  - Resume: `ctx.agents.resume({resumeSessionId, agentOptions?, setup?})`. It needs `ctx.sessionPersistence`.
- **Proof**:
  - `dsh-agent/lib/types/index.d.ts:48-128` (`CreateAgentOptions`, `ResumeAgentOptions`) and `:143` (`AgentHandle`)
  - `dsh-agent/lib/index.js:451` (create), `:464` (resume), `:594` (get)
  - `dsh-agent/lib/types/runtime-types.d.ts:157` (cancel), `:164` (whenIdle), `:192` (followup), `:200` (steer), `:209` (inject)
  - `dsh-agent-loop/lib/index.js:1851` (create prepares the session)
  - `dsh-session/lib/types/types.d.ts:148` (`AgentCancelCause`)
  - `dsh-headless/lib/index.js:316-336` and `dsh-webhook/lib/index.js:157-185` (examples)
- **Status**: ✅. One detail differs from the plan: `meta.agentPreset` alone does not apply a preset (see Presets).

### Subagents: startContinuable, sendMessage, interrupt
- **Expected**: `ctx.subagents.startContinuable` with persona, `toolFilter.allow` and `agentOptions`; `sendMessage`; `interrupt(childId)`.
- **Actual**:
  - `startContinuable(spec)` takes `{provider, label, childId?, request, signal}` and returns `{childId, messageId}`.
    - `persona`, `toolFilter` and `agentOptions` sit inside `spec.request`.
    - `outputSchema` is omitted from the type, as the deep dive said.
  - `sendMessage(sender: Agent, targetId, content: ContentBlock[], {signal})`.
  - `interrupt(targetId, authority)` takes a second argument: `{kind:'user', parentSessionId}` or `{kind:'ancestor', agent}`.
- **Proof**:
  - `dsh-subagent/lib/types/index.d.ts:142` (startContinuable), `:157` (sendMessage), `:186` (interrupt)
  - `dsh-subagent/lib/types/types.d.ts:26` (`ContinuableStartSpec`), `:46` (`ContinuableStart`)
  - `dsh-subagent/lib/index.js:2879`, `:2896`, `:2929`
  - `dsh-tool-subagent/lib/index.js:527` (real call)
- **Status**: ⚠️ `interrupt` requires an authority argument. Workaround (Phase 3): pass `{kind:'ancestor', agent: rootAgent}`.

### Tools: register, guard, restrict
- **Expected**: `ctx.tools.register(defineTool({name, description, parameters, output, execute(args, exec)}))`, `ctx.tools.restrict({allow|deny})`, `ctx.tools.guard(fn)`.
- **Actual**: as expected. `defineTool` is exported from `@deepseek-ai/dsh-tools`.
  - `output: {schema, render(args, value) → ContentBlock[]}` is required.
  - Parameters use dsh's property-map DSL, not JSON Schema: `{type, description, enum, items, properties, additionalProperties, required: true}`. `additionalProperties` is required on object types.
  - Calling `register`, `restrict` or `guard` on `agent.ctx` scopes it to that agent.
  - `restrict` throws on tool names that aren't registered.
  - A guard returns a string to deny.
  - **`exec` has no sessionId or model.** It has `callId`, `rootCallId`, `name`, `arguments`, `agent?`, `parent?`, `signal` and `token`.
    - The caller is `exec.agent.id`, which is the session id.
    - The model is `exec.agent.options.model`.
- **Proof**:
  - `dsh-tools/lib/types/index.d.ts:24` (defineTool export), `:216-322` (`ToolRunContext`), `:636` (register), `:644` (restrict), `:655` (guard)
  - `dsh-tools/lib/index.js:838`, `:2878`, `:2895`, `:2921`
  - `dsh-tool-ask-user/lib/index.js:64-218` (example tool)
- **Status**: ✅. Provenance comes from `exec.agent`.

### Presets (renamed in 0.2)
- **Expected**: a preset directory with `preset.yml` + `agent.cordis.yml`, shipped through a preset `roots` config. Agents select a preset with `meta.agentPreset`.
- **Actual**: a preset is **a Cordis row**, `name: '@deepseek-ai/dsh-agent-preset'`, with `config: {id, name?, description?, order?, plugins: [rows]}`.
  - Its apply registers it with `ctx.agentPresets` (`dsh-agent-preset-registry`).
  - There is no `roots` config and no file discovery.
  - `meta.agentPreset` is only durable metadata. To compose a preset, call `await ctx.agentPresets.mount(agentCtx, id)` inside `agents.create({setup})`.
  - **dsh-base ships no registry and no presets.** Both come from `dsh-web-app`: the registry row is in `cordis.patch.yml`, the presets in `presets/*.patch.yml`.
- **Proof**:
  - `dsh-agent-preset/lib/index.js` (29 lines)
  - `dsh-agent-preset-registry/lib/index.js:500` (register), `:603` (resolve), `:693` (mount), `:753` (select)
  - `dsh-webhook/lib/index.js:157-176` (resolve + create + mount pattern)
  - `dsh-web-app/presets/minimal.patch.yml`
- **Status**: ⚠️ Workaround: orb-bundle inserts an `orb-preset` row of `@deepseek-ai/dsh-agent-preset` whose `plugins` hold only Orb's persona and Orb's tool rows. orb-agents calls `agentPresets.mount(agentCtx, 'orb')` in `setup`. The web-app presets stay registered but unused, so Orb never mounts them.

### CredentialProvider
- **Expected**: an abstract `CredentialProvider` with refs and records plus update events; the default store is plaintext `.credentials.yaml`.
- **Actual**: as expected.
  - Abstract methods: `resolve(ref) → {value, source}`, `describe`, `set`, `unset`, `readRecord`, `describeRecord`, `listRecords`, `modifyRecord`, `deleteRecord`.
  - Concrete: `notifyUpdated(ref)` and `notifyRecordUpdated(key)`.
  - Refs are env-like names. The local store is `$DSH_HOME/.credentials.yaml`, mode 0600.
  - pi-ai resolves a provider key with `credentials.resolve(apiKeyEnv)`, then falls back to the launch env.
- **Proof**:
  - `dsh-credentials/lib/index.js:108`
  - `dsh-credentials/lib/types/index.d.ts:119-191`
  - `dsh-credentials-local/lib/index.js:49`, `:58`
  - `dsh-llm-pi-ai/lib/index.js:2562-2570`
- **Status**: ✅

### TypertRemoteService / @Remote
- **Expected**: subclass `TypertRemoteService` and decorate methods with `@Remote` (a standard decorator). Out-of-tree remotes run in an unchecked "SRC" fallback.
- **Actual**: as expected. Exported from `@deepseek-ai/dsh-typert-protocol`.
  - Constructor: `super(ctx, serviceKey, {namespace})`.
  - Three forms: `@Remote`, `@Remote('wireName')` and `@Remote({mode:'stream'})`. A stream method returns a sync or async iterable.
  - A final parameter named `signal` receives the AbortSignal.
  - **SRC fallback:**
    - The gateway scans every service that has a `typertRemote` binding.
    - Wire argument names are parsed from `Function.prototype.toString`, so parameters must be plain identifiers: no destructuring, defaults or rest.
    - The codec is `src-json`, so there is no validation.
- **Proof**:
  - `dsh-typert-protocol/lib/index.js:159-171` (class), `:183-194` (Remote)
  - `dsh-api-gateway/lib/index.js:700-707` (SRC claims), `:998-1023` (descriptor), `:1470-1502` (parameter parsing)
  - `dsh-api-session-controller/lib/index.js:2557-2599`, `:2847` (in-tree example)
- **Status**: ✅. Proven end to end in P1.6. Orb validates every payload with zod, and its esbuild output must keep plain parameter names.

### host-frontend-static distIndex
- **Expected**: `dsh-host-frontend-static` serves a configurable `distIndex`, so Orb's UI is served from the gateway origin.
- **Actual**: `Config = {distIndex}` is the only key.
  - It claims the webserver fallback seat. The index is gated by token or cookie; other assets are public.
  - It injects `<base href="./">`, so assets must use relative URLs (Vite `base: './'`).
  - **However, the web-app's `web-runtime` row mounts frontend-static internally**, with a fixed path (`@deepseek-ai/dsh-web-frontend/dist/index.html`). There is no separate row to patch.
  - The same `web-runtime` plugin also provides the `webRuntime` service (which the `connection` row injects), prints the `dsh web:` URL, and adds a "you are in the dsh Web GUI" system-prompt section.
- **Proof**:
  - `dsh-host-frontend-static/lib/index.js:22`
  - `dsh-web-app/lib/index.js:110` (fixed dist), `:173-203` (`webRuntime`, frontend mount, prompt, URL print)
- **Status**: ⚠️ Workaround (P1.2): disable `web-runtime`. Mount an Orb `web-shell` plugin from `@orb/host` that does four things:
  - provides `webRuntime` (`{lanAddresses: [], trustedHosts: []}`);
  - mounts frontend-static with `distIndex = $ORB_UI_DIST/index.html`;
  - prints `dsh web: <url>` on stdout;
  - adds no surface prompt.

### Token-usage projection
- **Expected**: a `tokenUsage` projection with per-session totals (uncached input, output, cache read, cache write).
- **Actual**: as expected. It lives in `dsh-token-meter` (`ctx.tokenMeter`), with key `tokenUsage` and `stateVersion` 2.
  - State: `{totals: {uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}, last}`.
  - Read it with `ctx.sessionProjections.stateOf(session, 'tokenUsage')`.
- **Proof**:
  - `dsh-token-meter/lib/index.js:413` (definition), `:612-615` (registration)
  - `dsh-token-meter/lib/types/usage-projection.d.ts`
  - `dsh-session-projection/lib/types/index.d.ts:175`
- **Status**: ✅

### Telemetry rows
- **Expected**: these all need switching off: `session-telemetry-otel` (FEEDBACK_ONLY), `plugin-package-inventory-deepseek`, `desktop-product-telemetry`, `product-analytics`, plus the feedback command.
- **Actual**: every row exists under those ids. Other phone-home paths, found by searching `lib/` for hardcoded hosts:
  - **`session-telemetry-otel`.** Modes are `FEEDBACK_ONLY` | `DISABLED`. It uploads the whole session log on `feedback/record` and `feedback/message-*` events, to `dsh-otel-collector.deepseeksvc.com`.
  - **`DSH_TELEMETRY_DISABLED`** appends `{id: session-telemetry-otel, disabled: true}` as the last layer. **That patch does not appear in `--dump-config`**, so Orb disables the row in its own patch as well.
  - **`command-feedback`** (`/feedback`) and **`message-feedback`** (per-message ratings) are the two triggers of that upload.
  - **`session-log-deepseek`** attaches session-log events to every `deepseek-official` request.
  - **`plugin-package-inventory-deepseek`** adds `dsh_plugin_packages` to `deepseek-official` requests.
  - **`desktop-product-telemetry` and `product-analytics`** are disabled unless the profile is named `desktop`.
  - **`dsh-anonymous-user-id`** writes `$DSH_HOME/.anonymous-user-id`, which is used by the otel resource and the deepseek-official headers.
  - **Other hosts:**
    - `api.deepseek.com`: llm-deepseek, web-search-deepseek, deepseek-account-platform
    - `platform.deepseek.com`: deepseek-account-platform
    - `registry.npmjs.org` and `registry.npmmirror.com`: plugin-manager
    - `github.com`: plugin-manager
    - a feishu form link: ui-settings-account
    - huggingface: experimental speech-to-text
- **Proof**:
  - `dsh-session-telemetry-otel/lib/index.js:21-37`, `:160-175`
  - `dsh-base/cordis.patch.yml:204-218`
  - `dsh-app-boot/lib/index.js:998-1020` (telemetry patch)
  - `dsh/lib/dump-config-BEDI-dNY.js:24-60` (dump omits it)
  - `dsh-session-log-deepseek/lib/index.js:137`
  - `dsh-plugin-package-inventory-deepseek/lib/index.js:137`
  - `dsh-web-app/cordis.patch.yml:45`, `:57`
  - `dsh-anonymous-user-id/lib/index.js:24`
- **Status**: ⚠️ More rows than planned. Orb's patch disables all of these:
  - `session-telemetry-otel` (and also sets `mode: DISABLED`)
  - `command-feedback` and `message-feedback`
  - `session-log-deepseek`
  - `plugin-package-inventory-deepseek`
  - `desktop-product-telemetry` and `product-analytics`
  - `llm-deepseek` and `llm-deepseek-account` (the `deepseek-official` route)
  - `deepseek-account`
  - `web-search-deepseek` (it calls `api.deepseek.com` directly; Orb's search comes in P3.5)
  - `plugin-manager` and `tool-plugin-manager`
  - `session-title-llm` (an extra model call per session; not phone-home, but unneeded)

### dsh-llm-pi-ai DeepSeek route
- **Expected**: route DeepSeek through pi-ai's `deepseek` catalog route, configured under `llm-pi-ai.providers` in `settings.yaml`.
- **Actual**:
  - The route is `providers: {deepseek: {apiKeyEnv: DEEPSEEK_API_KEY}}`, served from pi-ai's catalog (`https://api.deepseek.com`, `openai-completions`).
  - A custom route needs `api`, `baseURL` and `models[]`.
  - **`$DSH_HOME/settings.yaml` is legacy.** It is imported once into the profile patch and then renamed. Settings are now plain id-patches: `{id: llm-pi-ai, config: {providers: …}}` and `{id: agent-default-model, config: {provider, model}}`.
  - The default model in dsh-base is `deepseek-official/deepseek-flash`, the adapter that sends the user-id header.
- **Proof**:
  - `dsh-llm-pi-ai/lib/index.js:633` (catalog route), `:673-688` (custom route errors), `:1017-1051` (Config)
  - `dsh-settings/lib/index.js:343-365` (settings.yaml import)
  - `dsh-llm-deepseek/lib/index.js:2200` (`x-deepseek-harness-user-id`)
- **Status**: ⚠️ Workaround: Orb writes provider settings as rows in `profiles/orb/cordis.patch.yml`, not `settings.yaml`:
  - `llm-pi-ai` providers: `deepseek`, plus an `orb-mock` `openai-completions` route for tests;
  - `agent-default-model` set to `deepseek/deepseek-flash`. The pi-ai catalog's DeepSeek models are `deepseek-flash` and `deepseek-v4-pro` (`@earendil-works/pi-ai/dist/providers/data/deepseek.json`).

### Session event log (re-check of the blocker)
- **Expected**: custom event types still break reopen.
- **Actual**: unchanged.
  - `validateStoredEvents` throws `SessionFormatUnsupportedError` for any type outside `KNOWN_SESSION_EVENT_TYPES` that isn't marked `ignorable`.
  - `Session.append(type, data, ...opts)` cannot set `ignorable`.
- **Proof**:
  - `dsh-session-persistence/lib/index.js:182`
  - `dsh-session/lib/index.js:79` (known-type set), `:1441` (append)
- **Status**: ✅ The board stays in `board.jsonl`.

### Other boot facts that differ from the plan
- **`patchReload` does not exist.** Nothing reads `dsh.profile.patchReload`. Reload is handled by the `hmr` row (`dsh-hmr`).
  - Orb disables `hmr`, `config-editor` and `settings`: the sidecar's config is written by Orb, not edited live.
  - Proof: `dsh-app-boot/lib/index.js` (no reference); `dsh/README.md:42`.
- **Launcher flags.** `--port` and `--no-open` belong to the web app's `web-startup` row, not the launcher. They pass through as app arguments.
  - Proof: `dsh-web-app/lib/startup.js:22`, `dsh/lib/bin.js:121`.
- **Bundle resolution.** Bundles resolve from the dsh install first, then from the profile's `node_modules`.
  - With the hoisted workspace, `@orb/bundle` is linked into the root `node_modules`, next to dsh.
  - Proof: `dsh-app-boot/lib/index.js:895-905`.
- **Node.** `bin.js` runs only under `if (import.meta.main)`. There is no `engines` field.
  - Electron 44.7.2 ships Node 24.21.0 (Orb pins 44.7.0 since P1.3, also Node 24.21.0), which is above 22.19, so no bundled Node is needed.
  - Proof: `dsh/lib/bin.js:252`.
- **Sandbox.** On darwin the only backend is seatbelt, which statically reports `full`. It confines writes only.
  - Proof: `dsh-sandbox-local/lib/index.js:173-192`.
- **Gateway wire** (used in P1.5):
  - Unary calls send `{type:'client-request', rpcId, method:'ns/method', payload:{args:{<paramName>: …}}}`. The session controller's parameter is named `request`.
  - The mux takes `open`, `item`, `end` and `cancel` frames, and replies with `item`, `end` and `error`.
  - Proof: `dsh-client-connection/lib/index.js:504-515`, `:666-694`; `dsh-api-gateway/lib/index.js:108-405`.
- **`/api/file`** is registered with `ctx.connection.fetch.register` in the session controller.
  - Proof: `dsh-api-session-controller/lib/index.js:2333-2402`.

## P1.2–P1.12 findings

### P1.2 Orb profile and DSH_HOME bootstrap
- **Profile.** `profiles/orb/` is the template: `package.json` with bundles `[dsh-base, dsh-web-app, @orb/bundle]`, `cordis.patch.yml` with the model routes, and `pnpm-workspace.yaml`. `apps/desktop/src/main/dshHome.ts` copies it into `DSH_HOME/profiles/orb/` on every launch, because Orb owns that directory.
- **Bundle resolution.** `@orb/bundle` and every `@orb/*` plugin package are root workspace dependencies, so the hoisted linker puts them in `<repo>/node_modules/@orb/`, next to `@deepseek-ai/dsh`. dsh-app-boot resolves bundles from its own install first, so no symlink fallback is needed.
- **Permission presets.** With approval set to `never` and the sandbox set to `workspace-write`, `dsh-permission-presets` fails to activate: "composed sandbox and approval defaults match no preset". The fix is a `permission` config with a single preset, `orb: {sandbox: workspace-write, approval: never}`, plus `defaultPreset: orb`. Proof: `dsh-permission-presets/lib/index.js:178-180`.
- **`file-upload` is a host dependency.** `session-controller` waits on the `fileUploads` service that the `file-upload` row provides, so that row stays enabled even though it is listed among the web client rows.
- **Telemetry in the dump.** `DSH_TELEMETRY_DISABLED=1` is applied after the dump layers, so the dump proves the row is disabled through Orb's own patch. Orb also sets `mode: DISABLED` and points the exporter at a discard address, in case a later layer re-enables it.
- **Presets.** The web-app presets (`standard`, `ptc`, `minimal`, `cordis`) are disabled, and the registry default is `orb`. Any session created through the gateway with no preset therefore gets Orb's tool-less preset, never bash.
- **The dump file** `docs/spike/orb-dump-config.yml` (written by `pnpm dump-config`) has absolute repo paths replaced with `<repo>`. The gate test is `scripts/test/dump-config.test.ts`.

### P1.3 Sidecar supervisor
- **Electron version is constrained by dsh's native loader.** Under Electron 44.7.2 the sidecar dies at boot: `node-addon-require-builtin unsupported: Unsupported/no-context (unsupported Electron runtime fingerprint: Node 24.21.0, V8 15.2.124.37-electron.0 (supported Electron versions: 43.0.0, 44.0.0, 44.7.0, 45.0.0-alpha.6))`. dsh-app-boot needs this addon for runtime interception, so Electron must be one of the fingerprinted versions. 0.1.9 is the newest published loader. Orb pins **Electron 44.7.0** (Node 24.21.0, above 22.19; no bundled Node needed). Any Electron bump must be checked against the loader's list first.
  - Proof: `node-addon-native-custom-loader/lib/index.js:572` (throws), `node-addon-require-builtin/lib/index.js:13`, `dsh-app-boot/lib/index.js:1576`, `:1642`, `:3215` (call path).
- **URL line.** `dsh web: http://127.0.0.1:<port>/?token=…` arrives on **stdout** (Orb's own `web-shell` writes it with `process.stdout.write`). Opening it returns HTTP 303 (token swapped for a cookie, redirect to `/`); a wrong token gets a 4xx.
  - Proof: `packages/orb-host/src/web-shell.ts`; `dsh-web-app/lib/index.js:203` (upstream equivalent).
- **Shutdown.** dsh handles SIGTERM itself (`interrupt(0)`; SIGINT → 130) and force-exits after its process-shutdown timeout if dispose hangs. Measured: SIGTERM → exit code 0 in ~35 ms on an idle sidecar. Orb still SIGKILLs after 6 s.
  - Proof: `dsh/lib/profile-boot-BZ2ZjNWi.js:21-58` (`createProcessShutdown`), `:249-254` (signal handlers).
- **Boot time.** About 0.7 s from spawn to the URL line on an M-series Mac.
- **Electron binary.** In this checkout the Electron postinstall had not downloaded the binary (`node_modules/electron/dist` missing); `node node_modules/electron/install.js` fixes it. The supervisor tests run the real sidecar under that binary (`require('electron')` returns its path in plain Node).
- **Spawn failure (Node, not dsh).** When `execPath` is missing, `ChildProcess` emits only `'error'` (no `'exit'`), with `pid` undefined and `exitCode` already `-2`. The supervisor treats `pid === undefined` on `'error'` as a crash. Proof: `apps/desktop/test/sidecar.test.ts` ('treats a spawn failure ...').

### P1.4 Window on the sidecar origin + security baseline
- **`/api/file` really is an arbitrary-file reader.** With a valid auth cookie, `GET /api/file?path=/etc/hosts` returns HTTP 200 and the file. "Paths and MIME types do not restrict access." Orb cancels it in `session.webRequest.onBeforeRequest` (`apps/desktop/src/main/security.ts`); the e2e test proves the page gets a network error.
  - Proof: `dsh-api-session-controller/lib/index.js:2333-2337` (module doc, "Paths and MIME types do not restrict access" at :2335), `:2333-2402` (handler).
- **Fetch routes match by exact pathname.** The gateway looks up `fetchRoutes.get(url.pathname)` with no decoding or case folding, so `/api/%66ile` would not reach the handler anyway. Orb's filter is stricter: it percent-decodes repeatedly, folds case, collapses slashes, resolves dot segments, and blocks any path starting with `/api/file`.
  - Proof: `dsh-client-connection/lib/index.js:611-618`.
- **The served index carries two inline scripts.** Even with every dsh UI row disabled, the gateway injects `globalThis["__DSH_CONNECTION_RECOVERY__"] = {…}` (head) and the `__DSH_BOOT_READY__` tail (body). Orb's UI ignores both. The CSP allows exactly these two by sha256 hash (computed in `security.ts` from the literal texts) rather than `'unsafe-inline'`; the e2e test fails on any CSP console violation, so harness drift is caught. If the recovery config ever changes, the only effect is a blocked unused script.
  - Proof: `dsh-host-webserver/lib/index.js:26-29` (`global` row markup), `:65` (`READY_MARKUP`), `dsh-client-connection/lib/index.js:825` (recovery global row).
- **No CSP from the gateway on the index.** frontend-static writes only `content-type`, so Orb's `onHeadersReceived` CSP is the only one on documents. `/api/file` responses do set `sandbox; default-src 'none'` (`dsh-api-session-controller/lib/index.js:2342`); moot, since Orb cancels them.
  - Proof: `dsh-host-frontend-static/lib/index.js` `serveStatic` (`res.writeHead(200, {"content-type": type})`).
- **Typed endpoints require every declared arg.** `session/list` declares its parameter as `_request`; `payload.args: {}` fails with `gateway/arguments-invalid … missing "_request"`. Send `{args: {_request: {}}}`. (The "missing args allowed" path is only the SRC fallback for out-of-tree remotes.)
  - Proof: `dsh-api-gateway/lib/index.js:965`, `:1497` (`assertExactArguments`), observed response.
- **Token swap.** Loading the token URL in the window yields a 303 to `./` plus the `dsh-auth-*` cookie, and the page ends on `http://127.0.0.1:<port>/` with no query string. A reload of `/` stays authenticated through the cookie. On a sidecar restart (new port and token) Orb reloads the window on the new token URL and switches the allowed origin.
- **Electron typings.** `webContents.getLastWebPreferences()` works at runtime in Electron 44.7.0 but is missing from its `.d.ts`; the e2e test casts.
- **Dev loop.** `pnpm dev` runs `vite build --watch` for the UI next to `electron-vite dev` (`scripts/dev.ts`); Cmd+R picks up a rebuild. A terminal Ctrl-C (SIGINT to the whole process group) stops the sidecar cleanly (SIGINT → 130). Killing only the Electron parent still orphans the sidecar (the P1.3 open item).

### P1.5 Gateway client in the UI
- **Where.** `apps/ui/src/wire/` (`call.ts`, `mux.ts`, `events.ts`, `session.ts`); exact frames and proofs in `apps/ui/src/wire/README.md`. The reusable test harness (mock LLM + real sidecar + authenticated env) is `scripts/testkit/`.
- **Unary failures that are not envelopes.** The gateway answers with plain text, no `server-response`, for: 401 (no/expired cookie), 403 (Host/Origin fence), **404 for an unknown endpoint** (exact route table, `createSharedFetchHandler`), 415 (content type), 400 (bad JSON), 500 (handler crash). Orb maps these to `transport/unauthorized|forbidden|not-found|http`.
  - Proof: `dsh-client-connection/lib/index.js:586` (`requestRejection`), `:608-620` (404), `rpcFetchHandler` (415/400/500).
- **A request without `Origin` passes the fence.** Only a present `Origin` must match `Host`, and only `Sec-Fetch-Site: cross-site` is refused. Node-side test clients therefore work with just the cookie; the testkit still sends a same-origin `Origin` to match the browser.
  - Proof: `dsh-client-connection/lib/index.js:205-220` (`isTrustedApiRequest`).
- **The mux upgrade uses the same admission** as `/api` (cookie + fence); a rejected upgrade fails the handshake, which the client sees as a failed connect.
  - Proof: `dsh-api-gateway/lib/index.js:626-640`.
- **Cancel is silent.** After a client `cancel` the host sends no `end` for that stream; a stream aborted for a non-Remote reason ends with nothing on the wire.
  - Proof: `dsh-api-gateway/lib/index.js:338` (`pump`).
- **Heartbeat is protocol-level.** The host pings every 2 s and terminates after 2 missed pongs; browsers and `ws` auto-pong, so the client sends no ping frames.
  - Proof: `dsh-api-gateway/lib/index.js:172`, `:237-251`, `:551`.
- **Waterfalls block the host until answered.** A `$events` waterfall settles on the first `result`, or once every connected client says `next`; an `$events` client that ignores waterfalls would hang the host event. Orb's `RemoteEvents` answers `next` for anything unhandled.
  - Proof: `dsh-api-gateway/lib/index.js:908-918` (`receiveRemoteEventResult`), `:855-902` (`startRemoteEvent`).
- **Forwarded events seen on the Orb sidecar:** `api-session/status [sessionId, running]` and `api-session/activity [sessionId, ms]`. The `ready` frame carries `host.home` (the user's home dir).
- **Cancel semantics.** `session/cancel` during a streamed reply ends the turn in ~15 ms (measured against the mock): the partial text is **committed** as `assistant/message` (with an interruption marker), the assistant-stream `end` says `committed`, and `turn/end` has `reason: {kind: 'aborted', reason: {kind: 'user'}}`, not `cancelled`. The provider HTTP request is closed. The session takes the next prompt normally.
  - Proof: `dsh-session/lib/types/types.d.ts:165-190` (`TurnEndReasonMap`); `apps/ui/test/wire.contract.test.ts`.
- **Mock model route works as planned.** A custom `llm-pi-ai` route `{api: openai-completions, baseURL, apiKeyEnv, models: [{id, contextWindow, maxTokens}]}` plus `agent-default-model` pointing at it routes every turn to the local server; no real key is read. pi-ai sends `stream_options.include_usage` and needs a `finish_reason` chunk; the mock sends role, content deltas, tool-call deltas, finish, usage, `[DONE]`.
  - Proof: `dsh-llm-pi-ai/lib/index.js:633-700` (`resolveRouteModels`), `:1017-1051` (Config); `@earendil-works/pi-ai/dist/api/openai-completions.js:362-485`, `:582`.
- **The `orb` preset is the gateway default.** `session/create {}` returns `agentPreset: 'orb'`, and the system message is Orb's persona; the preset has no tools yet (P1.8 adds `place_card`).

### P1.6 orb-host: first @Remote endpoints
- **Approach used: `@Remote` on a `TypertRemoteService`, out of tree, through the gateway's SRC fallback.** The planned fallback (`ctx.connection.fetch.register` + `registerUpgrade`) was not needed. `packages/orb-host/src/remote.ts` default-exports `OrbHost extends TypertRemoteService` (`super(ctx, 'orbHost', {namespace: 'orb'})`, `static inject = ['typert']`), mounted by the bundle row `{id: orb-host, name: '@orb/host/remote', inject: [typert]}`. The gateway finds it by scanning root services for a `typertRemote` binding; no strict (`./typert`) definition is needed.
  - Proof: `dsh-api-gateway/lib/index.js:698-718` (`claimsEndpoint`, `collectSrcClaims`), `:998-1075` (`resolveSrcDescriptor`, `srcDescriptor`); `apps/ui/test/orb.contract.test.ts` and `apps/desktop/e2e/orb.spec.ts` (real sidecar / real window).
- **Dotted wire names work.** The segment rule is `/^[A-Za-z0-9_$.-]+$/` (not `.` or `..`), so `orb/canvas.create` and `orb/board.follow` are valid endpoints. Proof: `dsh-typert-protocol/lib/index.js:126-134`; `dsh-api-gateway/lib/index.js:700`.
- **A stream method cannot take an export name.** `@Remote({mode: 'stream'})` throws unless the options object has exactly one key, `mode`, so the wire name of a stream is the method name itself. Orb names the method with a computed key: `async *['board.follow'](canvasId, signal)`. Unary methods use `@Remote('canvas.create')` on `canvasCreate`. Proof: `dsh-typert-protocol/lib/index.js:183-194`.
- **Standard decorators survive tsup.** esbuild 0.28 (tsup 9, target node22) lowers TC39 decorators to `__decorateElement` + `__runInitializers`; the methods stay on the prototype with their source parameter lists, so the gateway's `Function.prototype.toString` parse works. `minify: false` is set explicitly. `packages/orb-host/test/remote.test.ts` checks the markers and parameter names of the **built** `lib/remote.js`. Proof: `packages/orb-host/lib/remote.js` (build output); `dsh-api-gateway/lib/index.js:1470-1495` (`methodParameterNames`).
- **Reserved parameter names.** A SRC parameter whose name matches a typert lookup provider is resolved through that lookup instead of taken from JSON: `agent`, `session` and `workspaceFileScope` are registered in this profile. Orb's parameters are `request`, `id`, `canvasId`, `signal`. Proof: `dsh-api-gateway/lib/index.js:1031-1045`; `dsh-agent/lib/index.js:334`, `dsh-session/lib/index.js:1623`, `dsh-api-workspace-files/lib/index.js:399`.
- **SRC args may be missing, and nothing is validated.** `src-json` parameters accept an absent field (the method gets `undefined`), while extra fields still fail with `gateway/arguments-invalid`. Orb parses every argument with the `@orb/shared` zod schemas and throws `RemoteError('orb/invalid-args', …, {field, issues})`; a missing `request` is caught the same way. Proof: `dsh-api-gateway/lib/index.js:1497-1509` (`assertExactArguments`).
- **Business errors keep their code.** A thrown `RemoteError` (detected structurally by `isDSHRemoteError`) is sent as `{code, message, details}`; any other throw becomes `gateway/internal`. The same applies to mux `error` frames. `RemoteErrorCode` is a declaration-merged union of harness codes, so Orb casts for its own `orb/*` codes. Proof: `dsh-api-gateway/lib/index.js:1425-1443` (`rpcFailure`); `dsh-typert-protocol/lib/index.js` (`RemoteError`, `remoteErrorOf`).
- **Unary vs stream are enforced.** Calling `orb/board.follow` with `POST` fails with `gateway/signature-invalid`. Proof: `dsh-api-gateway/lib/index.js:730`.
- **Unary results are encoded, not checked.** `encodeRuntimeResult` copies plain objects, calls `toJSON`, and turns any `Uint8Array` into a binary attachment. Orb returns JSON-normalized copies so a stray buffer never becomes an attachment. Proof: `dsh-api-gateway/lib/index.js:1120-1180`.
- **SRC claims are collected once.** `claimsEndpoint` caches the SRC endpoint set on the first `/api` request that is not a strict endpoint. A Remote service mounted after that first request would answer 404 until restart. This is harmless for Orb: `orb-host` mounts at boot, and the `dsh web:` URL is printed only after the loader settles. Proof: `dsh-api-gateway/lib/index.js:703`.
- **Stream lifetime.** A `board.follow` stream yields its snapshot, then awaits `AbortSignal.any([signal, lifetime])`. The `signal` is aborted on client `cancel` or socket loss, and `lifetime` is aborted on plugin dispose (`ctx.effect`). Measured: the cancel frees the stream, and the socket stays usable (contract test). The Electron e2e shutdown with an open follow stream closes normally.

### P1.7 orb-canvas: board log and fold (minimal)
- **Providing a service from a plain function plugin.** `ctx.provide(name, value)` is a fiber effect: the service is registered while the providing row is active and its disposer deletes it, re-evaluates every dependent fiber and awaits them. orb-host's `static inject = ['typert', 'orbCanvas']` (plus the row's `inject`) makes `ctx.orbCanvas` readable in its constructor; the row is mounted only once `orbCanvas` exists, whatever the row order. Proof: `@deepseek-ai/cordis/lib/index.js:800-824` (`provide`).
- **Disposers of one fiber run concurrently, not in reverse order.** `Fiber._unload` runs `Promise.all(this._disposables.clear().map(...))`, so the canvas store's close effect and the `provide` disposer (which tears down orb-host) race. The store therefore aborts its own follow streams on close and answers later calls with `orb/closed` instead of relying on dependents being gone first. Proof: `@deepseek-ai/cordis/lib/index.js:1372-1385`.
- **Root-context provide works without a plugin fiber.** `new Context().provide('orbCanvas', store)` followed by `new OrbHost(ctx)` works in a unit test (the root fiber has no runtime, so property access is unchecked). Proof: `packages/orb-host/test/remote.test.ts`; `@deepseek-ai/cordis/lib/index.js:690-712` (property proxy).
- **Shutdown flushes the board.** SIGTERM to the sidecar disposes the plugin tree (dsh's own 5 s bound), which runs `store.close()`: follow streams end, then every board log is flushed and fdatasynced. Proven end to end by the contract test that writes a command, stops the sidecar inside the 250 ms window, restarts on the same homes and finds the event (`apps/ui/test/orb.contract.test.ts`, "board survives a sidecar restart").
- **Stream cancel reaches the generator.** A mux `cancel` aborts the `signal` parameter and the gateway stops iterating, so orb-host's `for await` over `orbCanvas.follow()` exits and its `finally` unsubscribes from the board (contract test: `wire.mux.activeStreams` returns to 0, the socket stays usable). Proof: `dsh-api-gateway/lib/index.js` (mux stream driver, see §P1.6).
- **Kill -9 durability, measured.** A SIGKILL cannot tear a line because each batch is one `write(2)` to an `O_APPEND` fd; only the batch not yet written is lost. Three kills of a child writing 2–3 events/ms lost 51, 202 and 202 ms of events (window 250 ms). A torn tail (power loss or a short write) is simulated by appending half a line; open truncates it. Proof: `packages/orb-canvas/test/crash.test.ts`, `packages/orb-canvas/src/boardLog.ts`.
- **Commit rule for a line.** A line counts as committed only once its trailing `\n` is on disk: a complete JSON object without its newline is still truncated. Invalid lines followed by a valid event are not a crash artefact, so open refuses the log (`orb/board-corrupt`) and does not modify it. Proof: `packages/orb-canvas/test/boardLog.test.ts`.


### P1.8 First agent tool: place_card
- **Tools are preset rows, so they are agent-scoped for free.** `place_card` and `query_board` are registered by the row `orb-board-tools` (`@orb/canvas/tools`, inject `tools` + `orbCanvas`) inside the `orb` preset's `plugins`. The registry mounts a preset's rows ONCE, in a scope created for that preset (`createScope(this.owner, key)` in `activate`), and `agentPresets.mount(agentCtx, 'orb')` binds the agent's scope under it (`join` → `bindScopeParent`), so the tools are an ancestor-layer contribution visible only to agents bound to `orb`. The global tool surface of this profile is empty: a gateway-created session before P1.8 sent a request with no `tools` key at all, and the P1.8 request carries exactly `place_card` and `query_board` (contract + e2e tests assert this on the mock LLM request).
  - Proof: `dsh-agent-preset-registry/lib/index.js:525-545` (`activate`), `:675-687` (`join`), `:693` (`mount`); `dsh-tools/lib/types/index.d.ts:658-680` (restrictions filter the inherited surface; preset tools are "an ANCESTOR contribution"); `apps/ui/test/agent.contract.test.ts`.
- **A preset row resolves `@orb/*` names like a host row.** `name: '@orb/canvas/tools'` inside the preset's `plugins` loads from the hoisted install without any extra wiring, and its `inject: [orbCanvas]` waits for the host service (`diagnostic` re-audits pending rows after the loader settles). Proof: `dsh-agent-preset-registry/lib/index.js:557-568` (`diagnostic`).
- **Caller identity from the exec context.** `exec` (`ToolRunContext`) carries no session or model field. Orb reads:
  - session id = `exec.agent.id` (the Agent id IS the session id);
  - tool call id = `exec.callId` (the provider's tool-call id verbatim: the mock's `call_card_x` arrives unchanged);
  - model route = `exec.agent.session.requestHeader().config.{provider, model}`, else `exec.agent.options.{provider, model}`. `agent.options` is the creation-time route; the request actually sent goes through the `agent/request` waterfall (where `session/selectModel` applies), and the folded `request/header` is what was logged for the request that produced this call;
  - canvas = `exec.agent.session.header.cwd` (the root agent is created with `meta.cwd` = its canvas folder; `CanvasStore.canvasIdOfDir` maps it back and refuses any other directory);
  - role (`orb`) = the tool row's `config.agent` (each preset carries its own tool row config).
  - Proof: `dsh-tools/lib/types/index.d.ts:217` (`callId`), `:229` (`agent?`); `dsh-agent/lib/types/types.d.ts` (`Agent.id: SessionId`), `runtime-types.d.ts:141` (`options`); `dsh-session/lib/types/index.d.ts:259` (`requestHeader()`), `types.d.ts:69` (`header.cwd`), `:217` (`EpochHeader.config`); `dsh-agent-loop/lib/index.js:1163-1180` (`prepareRequest`: route from `options`, then the `agent/request` waterfall).
  - Recorded actor (`@orb/shared` `Actor` gained an optional `provider`): `{kind:'agent', agent:'orb', model:'mock-1', provider:'orb-mock', sessionId:'orb-<uuid>', toolCallId:'call_card_x'}`.
- **Root agent.** `orb-agents` (row `@orb/agents/service`, inject `agents`, `agentPresets`, `agentDefaultModel`, `orbCanvas`) provides `orbAgents`. `createRoot` calls `ctx.agents.create({sessionId: 'orb-<uuid>', meta: {cwd: <canvas folder>, agentPreset: 'orb'}, agentOptions: agentDefaultModel.currentSelection(), setup})`, the same composition `session-controller` uses for gateway sessions; `setup` mounts the preset and calls `agentCtx.tools.guard(orbToolGuard('orb'))`. The handle is kept by the row, so unloading it disposes the agents. `orb-host`'s `canvas.create` creates the folder, then the agent, then rewrites `canvas.json` with `rootSessionId` (atomic, serialized per canvas).
  - Proof: `dsh-api-session-controller/lib/index.js:358-372` (`composeAgent`), `:449-458` (`createOrAdopt` create), `:460` (`agentOptions()`); `dsh-agent-default-model/lib/index.js:38` (`currentSelection`); `dsh-agent/lib/types/index.d.ts:48-104` (`setup` runs before publication).
- **The root session is an ordinary persisted harness session.** It is written under `DSH_HOME/sessions/<cwd-encoded>/<sessionId>`, and the gateway's `session/list` returns it with `cwd` = the canvas folder and `agentAvailable: true`; `session/follow` and `session/cancel` work on it unchanged (the UI shows the reply through `session/follow`). Orb does not call `workspaceRegistry.create`/`attachSession` (what `session/create` does at `dsh-api-session-controller/lib/index.js:702`); nothing in P1.8 needed it. Re-check in P1.9 (resume).
- **`session/list` items are keyed `sessionId`, not `id`.** The P1.5 `SessionSummary` schema (`{id}`) had only been exercised on an empty list and rejected the first real entry. Fixed to `{sessionId, updatedAt, agentAvailable, running, blank, cwd?}`. Proof: `dsh-api-session-controller/lib/types/types.d.ts:159-170`.
- **Prompting the agent from Orb code.** `orb/chat.send(canvasId, {text})` → `agent.followup(createUserMessage({content:[{type:'text', text}], source:{kind:'user'}}))`. When the agent is not live (sidecar restarted) `orbAgents` resumes it first with `ctx.agents.resume({resumeSessionId, agentOptions, setup})` and the same setup (P1.9 tests that path).
- **Parameter DSL → JSON Schema.** `defineTool` turns `{x: {type, required: true}}` into a JSON Schema object whose `required` array the model sees (`['type','title','body','why']`), and validates the model's arguments before `execute` (a `ToolArgsError` never reaches the body). Orb still zod-parses inside the body (length limits, role card-type permissions). `defineTool` types infer from the DSL; no casts needed. Proof: `dsh-tools/lib/index.js:838-870`.
- **`exec.signal` is the cancel path.** `session/cancel` during `place_card`'s artificial delay (`ORB_TEST_PLACE_CARD_DELAY_MS`, abortable) ends the turn `aborted` in well under the delay, the tool rejects with the signal's reason before writing, no card reaches `board.jsonl`, and no follow-up model request is made (contract test). P1.10 measures this.
- **Card types.** The plan's `'note-like'` is the `doc` card type (PRD "Doc draft: Orb, heading + body"); Orb may never place `note` (§2.4), so Phase 1 `place_card` takes `type: 'source' | 'doc'`. Agent cards land on a 4-column grid (280×180, 24 gap) until the Phase 3 layout engine; `frameId` is refused until frames exist.
- **(review) An agent-ctx guard does not bind gateway-composed sessions on the same preset.** The session-controller composes agents for `session/create` and for the resume behind `session/prompt`/`queue` with ONLY `installSelection` + `agentPresets.mount` (`dsh-api-session-controller/lib/index.js:358-372` `composeAgent`, `:398-411` `resumeObserved`, `:412-436` `createOrAdopt`). So a guard installed by `orbAgents` on `agentCtx` never applied to a `session/create` session on the `orb` preset, nor to a root session the gateway resumed first (which `orbAgents.ensureLive` then reuses via `agents.get`). Proven on a real sidecar with one re-enabled global tool: `todo_write` ran in a gateway session (`Updated todo list: …`). Fix: the guard is also a preset row, `orb-tool-guard` (`@orb/agents/guard`, inject `tools`) in the `orb` preset `plugins`. Guards registered in the preset scope bind every bound agent because `ToolRuntime.guardReason` walks the global layer, then the calling agent's whole scope chain (`dsh-tools/lib/index.js:2928-2935`). Test: `apps/ui/test/agent-guard.contract.test.ts` (root agent and gateway session both get `tool "todo_write" is not available to the orb agent`).
- **(review) Concurrent root creation.** Two `chat.send` calls on a canvas without `rootSessionId` each created a root agent (one orphaned). `orbAgents.createRoot` now shares one in-flight creation per canvas (`packages/orb-agents/test/service.test.ts`).

### P1.9 Reopen test
- **Resume is the harness path, and it is enough.** `ctx.agents.resume({resumeSessionId, agentOptions, setup})` loads the stored log with a write-open (`persistence.open(id, 'write')`), closes any turn the crash left open, seeds a prepared session from the stored events, runs `setup` (Orb mounts the `orb` preset and installs the guard, as on create) and publishes the agent under the same id. The first request after a resume logs `request/header` with `reason: "resume"` (the first ever logs `"initial"`), which the tests use as proof that the resume path ran. No custom event types were ever appended to the session, so `validateStoredEvents` accepted it on every reopen (no `SessionFormatUnsupportedError`).
  - Proof: `dsh-agent-loop/lib/index.js:1921-1970` (`resume`, `resumeWith`), `:1213-1217` (`request/header` reason); `dsh-session-persistence/lib/index.js:182` (validation); `apps/desktop/e2e/reopen.spec.ts`, `apps/ui/test/reopen.contract.test.ts`.
- **A turn cut by kill -9 is repaired by the resume itself.** `interruptedTurnClosers(persisted)` appends the closing events for an open step/turn before seeding: the killed turn ends `turn/end {reason: {kind: 'interrupted'}}` followed by `session/end-seed`, and the next prompt runs a normal turn (`completed`). Tool calls and results committed before the kill were all in the log (the harness appends each batch durably), so the resumed model request carried the 3 `place_card` calls and their results.
  - Proof: `dsh-session/lib/index.js:904` (`interruptedTurnClosers`); `dsh-agent-loop/lib/index.js:1949-1950`; session log of the e2e kill run.
- **History reaches the model in full.** After resume, the follow-up's chat-completions request had: system, the first user prompt, 3 assistant `tool_calls` (`call_kepler_1..3`, in order), 3 `tool` results (each `{cardId}`), the final assistant text (clean run), then the new user message. Asserted on the mock LLM request in both runs.
- **The session write lock is a kernel `flock` on `session.lock`.** A second writer gets `SessionAlreadyOwnedError`; the kernel drops the lock when the holder dies, so a SIGKILLed sidecar never blocks the next resume. It also means two live sidecars on one DSH_HOME cannot both resume a canvas. (P1.3's open item still applies: if only Electron main is SIGKILLed the sidecar survives, keeps the lock, and the relaunched app's resume would fail; the reopen test kills both.)
  - Proof: `dsh-session-persistence-jsonl/lib/index.js:614-664` (`SessionWriteLease`), `:311-314`.
- **Session artifacts are multi-frame zstd by default.** `DSH_HOME/sessions/<encoded cwd>/<sessionId>/session.v4.jsonl.zstd`, one independent zstd frame per append batch (`DEFAULT_COMPRESSION = "zstd"`). Node's `zlib.zstdDecompressSync` (and the stream decoder) stop after the FIRST frame, so a naive read sees only the header line; the testkit's `readSessionLog` splits frames like the harness's `scanZstdFrames` and decodes each.
  - Proof: `dsh-session-persistence-jsonl/lib/index.js:745-752` (`logSuffix`), `:1300-1362` (`scanZstdFrames`), `:2285` (`DEFAULT_COMPRESSION`); `scripts/testkit/sessionLog.ts`.
- **dsh logs nowhere by default.** `dsh-app-boot` registers only an in-memory exporter (startup warn/error buffer) on the cordis `LoggerService`; plugin `ctx.logger` output never reaches stdout/stderr, so `sidecar.log` showed nothing but the URL line. Orb's `web-shell` row now registers an exporter (`levels: {default: 2}`; cordis levels are error 0, info 1, warn 2, debug 3) that writes warn/error from every logger plus `orb-*` info to stderr; the supervisor redacts and appends it to `sidecar.log`. The only line seen in normal runs is a `local-subprocess-runtime` containment warning.
  - Proof: `dsh-app-boot/lib/index.js:4053-4067`; `cordis/lib/index.js:576-640` (`LoggerService`), `:455-460` (levels); `packages/orb-host/src/web-shell.ts`.
- **Open must resume, not the gateway.** `session/follow` on a session that is not live can make the session controller resume it itself (`resumeObserved`, with only the preset mount). Orb's UI calls `orb/canvas.open` first (which resumes through `orbAgents`) and only then follows the session; `orbAgents` reuses an agent the gateway already resumed (`agents.get`), and the preset-level guard (P1.8 review) binds it either way.
  - Proof: `dsh-api-session-controller/lib/index.js:378-411`.
- **Board durability across kill -9, end to end.** Killing Electron main and the sidecar 600 ms after the third card left `board.jsonl` byte-identical to what was on disk before the kill (3 events, seq 0..2), and the reopened UI fold equals `fold(board.jsonl)` and the pre-kill UI state.
- **(review) Mux state seen by the UI.** Not a harness fact but a wire one: `$events` opens the `remote.mux` socket at page load (`apps/ui/src/main.tsx` `wire.events.start()`), before any component subscribes to `MuxClient.onState`; `onState` does not replay the current state (`apps/ui/src/wire/mux.ts` `onState`), so subscribers must read `mux.state` when they subscribe (fixed in `SessionProbe`).

### P1.10 Stop path
- **Cancel is synchronous and cheap; idle follows within a few ms.** `agent.cancel(cause, {keepInbox?})` clears the inbox (unless `keepInbox`) and aborts the active phase's `AbortController` with the cause; on an idle agent it is a no-op. `whenIdle()` loops on `activityDone` until no replacement driver was started, so it resolves only after the aborted driver retired (turn committed as `turn/end` `aborted`, status back to `idle`). A driver that rejects makes `whenIdle()` reject, so Orb treats a rejection as idle too.
  - Proof: `dsh-agent-loop/lib/index.js:815-821` (`cancel`), `:870-874` (`whenIdle`), `:790-799` (`status` / `setPhase` emitting `agent/status`); `dsh-agent/lib/types/runtime-types.d.ts:150-163`.
- **Orb's stop does not clear-then-follow-up.** Stop cancels without `keepInbox`, so queued follow-ups are dropped with the turn (PRD: Stop stops everything). The next `chat.send` starts a fresh turn normally (40 consecutive stop/send cycles on one agent in the benchmark).
- **Descendants come from the agent registry, not the subagent catalog.** `ctx.agents.list()` + `ctx.agents.isOwnedBy(id, parent)` give the live agents created through a parent's scoped context (runtime ownership), synchronously. `ctx.subagents.listChildren` reads the durable catalog via a session query (async, disk) and is not needed to stop live work. Orb cancels the root with `{kind:'user'}` and each live descendant with `{kind:'parent'}`. Phase 1 roots have no children (covered by a unit test with fake agents); Phase 3 may switch to `subagents.interrupt(childId, {kind:'user', parentSessionId})`, which keeps the child's unclaimed inbox (interrupt, not stop).
  - Proof: `dsh-agent/lib/index.js:605-623` (`isOwnedBy`, `list`, `roots`); `dsh-subagent/lib/index.js:2971` (`listChildren` → session query), `dsh-subagent/lib/types/index.d.ts:170-186` (`interrupt`).
- **`agent/status` is observable from a plugin's root context.** `ctx.on('agent/status', ({agent, status}) => …)` at the `orb-agents` row receives every agent's running/idle transitions (the session controller does the same). Orb maps root session ids to canvases and publishes `orb/agents.status`; while a stop is in flight the harness transitions are held back so the stream reads exactly `stopping` → `stopped` (or `stop-timeout`, then `idle` when the agent does settle).
  - Proof: `dsh-api-session-controller/lib/index.js:2884-2886`; `dsh-agent-loop/lib/index.js:798`.
- **Measured (2026-10-14, M-series Mac, mock LLM on 127.0.0.1, `apps/ui/test/stop.contract.test.ts`, 3 runs of 20+20).** Server ms = `orb/agents.control` entry → every cancelled agent's `whenIdle()` (logged as `[orb-agents] stop canvas <id>: stopped in N ms` in sidecar.log); client ms = HTTP round trip of `orb/agents.control` from the test process. All 120 stops were `stopped` (no `stop-timeout`), the harness session list showed `running: false` as soon as the call returned, mid-stream the mock saw the HTTP stream aborted, mid-tool no card was written and no tool result reached the model.

  | Scenario (20 runs each) | server p50 | server p95 | server max | client p50 | client p95 | client max |
  |---|---|---|---|---|---|---|
  | mid-stream (60 chunks, 50 ms apart; stop after ≥ 3 chunks) | 2.4–2.5 ms | 2.9–3.0 ms | 3.5 ms | 6.6–6.8 ms | 8.2–8.7 ms | 10.4 ms |
  | mid-tool (`place_card` inside its 3 s abortable delay) | 2.1 ms | 2.4 ms | 3.3 ms | 6.1–6.2 ms | 6.7–7.1 ms | 8.0 ms |

  The 1 s budget has ~300× headroom with an abortable tool and a cancellable HTTP stream. A tool that ignores `exec.signal` would be the only way to hit `stop-timeout` (the unit test fakes this: `stop-timeout` after 1000 ms, then `idle` when the agent settles). The real DeepSeek route uses the same `openai-completions` client as the mock route, whose HTTP stream the test saw aborted on every mid-stream stop; not measured against the real host (no key).

### P1.11 Egress audit
- **dsh proxies every in-process `fetch`/undici request from the launch environment, never loopback.** `dsh/lib/profile-boot-BZ2ZjNWi.js:225` calls `installProxyFromEnvironment` before the first plugin mounts; it installs an undici `Agent` whose per-origin factory returns a `ProxyAgent` for proxied URLs as the global dispatcher (also reached by Node's built-in `fetch`). Reads `http_proxy`/`https_proxy`/`all_proxy`/`no_proxy`, lowercase first, blank = unset; `ALL_PROXY` backs both schemes. Loopback (`localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0`) is always bypassed and cannot be turned off. pi-ai's LLM calls reach `globalThis.fetch`, so they are proxied.
  - Proof: `dsh-http-proxy/lib/index.js:19` (`LOOPBACK_NO_PROXY`), `:200` (`isLoopbackHost`), `:275-278` (`proxyForUrl` skips loopback), `:388-399` (`createPolicyDispatcher`), `:519-523`; `dsh-http-proxy/README.md` "What the policy reads"; `dsh-app-boot/lib/index.js:3350-3376` (proxy names may also come from `$DSH_HOME/.env`, never a project `.env`).
  - Consequence for the audit: a mock on `127.0.0.1` would never be proxied, so the deterministic audit addresses the mock as `http://mock-llm.orb.test/v1`, a name only the audit proxy resolves (to the mock's loopback port).
- **http targets are NOT tunnelled.** undici 8.12.1 (`dsh-http-proxy` depends on `undici ^8.10.0`) tunnels with CONNECT only for non-`http:` targets; an `http:` target is sent to the proxy as an absolute-form request (`GET http://host/path`). The audit proxy handles both (it saw `POST http://mock-llm.orb.test/v1/chat/completions` as `forward`). An `https:` model host (live DeepSeek) arrives as `CONNECT api.deepseek.com:443`.
  - Proof: `undici/lib/dispatcher/proxy-agent.js:41-43` (`shouldProxyTunnel`), `:45-101` (`Http1ProxyWrapper`).
- **undici dials the proxy with the TARGET's name as `host` and a custom `lookup` that returns the proxy IP.** A socket-level monitor that judges `net.Socket#connect` by `options.host` reports `mock-llm.orb.test:<proxy port>` as direct egress. Orb's monitor wraps `lookup` and judges the address actually dialled (`127.0.0.1`).
  - Proof: `undici/lib/core/connect.js:113-134`.
- **Telemetry goes direct, bypassing any proxy, by design.** dsh's OTLP session-log exporter posts through `node:http`, which no undici dispatcher reaches. A proxy-only egress audit is therefore blind to telemetry. Orb's audit adds a second observer: `scripts/egress/monitor.cjs`, preloaded into the sidecar with `NODE_OPTIONS=--require …` (works under Electron-as-Node 44.7.0 / Node 24.21; inherited by Node child processes), records every `Socket#connect`, every `dns.lookup/resolve*` (callback, promises, `Resolver`) and UDP `send`, and refuses non-loopback connects and DNS queries for non-model hosts.
  - Proof: `dsh-http-proxy/README.md:110` ("Telemetry is direct by design"); `dsh-otel/lib/index.js:394` (`createSessionLogReporter`).
- **Telemetry-on control run (2026-10-14).** Telemetry left on: no `DSH_TELEMETRY_DISABLED`/`DSH_TELEMETRY_MODE`, and a test patch re-enabling `session-telemetry-otel` (`disabled: false`, `mode: FEEDBACK_ONLY`, dsh-base's collector URL, `scheduledDelayMillis: 200`), `message-feedback` and `command-feedback`. After the scripted turn, `POST /api/messageFeedback/put {request:{sessionId, messageId, rating:'positive', ifVersion:null}}` (the `messageId` is the last non-empty `assistant/message` `data.message.id` in the session log) appends `feedback/message-put`, which triggers the FEEDBACK_ONLY upload. **Result: the monitor saw `dns lookup dsh-otel-collector.deepseeksvc.com` ~0.5 s after the rating and again at shutdown drain (2 attempts), both refused; the proxy saw nothing from telemetry.** The audit reports it as a violation and FAILS, as it must. A patch `disabled: false` does re-enable a row Orb disabled (the loader accepts a boolean or `!!js` expression, `dsh-app-boot/lib/index.js:2736-2738`).
  - Proof: `dsh-session-telemetry-otel/lib/index.js:28-37` (`isFeedback`), `:160-175`; `dsh-message-feedback/lib/index.js:157-224` (Remote namespace `messageFeedback`, `put(request)`); `dsh-base/cordis.patch.yml:204-218`.
- **The Orb profile itself contacts nothing but the model host.** Deterministic run (3× green, plus the Vitest test 4×): boot, `orb/canvas.create` (root agent), `orb/chat.send`, 2 model requests (one `place_card` call, one final answer), card in `board.jsonl`, 1.5 s idle, SIGTERM. The only non-loopback host anyone saw was `mock-llm.orb.test` (proxy, `forward`, routed); the monitor saw one `dns lookup 127.0.0.1` and one loopback connect to the proxy, nothing else (no update check, no registry, no title model, no telemetry).
- **Live mode not run (no key).** `pnpm egress-audit` runs it only when `DEEPSEEK_API_KEY` is in the environment (allowed host `api.deepseek.com`, proxy forwards only that host, via CONNECT); otherwise it prints `SKIPPED`.
- **Later phases.** `web-fetch-http` is enabled in the composed tree and pins its own transport (`proxy-exempt`, README "Writing a new outbound call"), so Scout's user-directed fetches (Phase 3) will go direct; the monitor already sees them, and the audit's allow-list will need the fetched URLs' hosts then.

### P1.12 macOS checks
Measured 2026-10-14 on this Mac (macOS 15.6 / Darwin 24.6.0, arm64) with `pnpm macos-checks` (`scripts/macos-checks.ts` → `scripts/macos/checks.ts`), asserted by `scripts/test/macos-checks.test.ts` (in `pnpm test`, darwin only). The checks run **inside a real sidecar**: a test-only probe row (`scripts/macos/probe-plugin.mjs`, inject `sandbox` + `tools`) is inserted by an extra profile patch and loaded by absolute path (the root Include maps absolute row names to file URLs: `dsh-app-boot/lib/index.js:3693-3696`); it writes one JSON report and the sidecar is stopped. The probe is never part of the Orb bundle.
- **1. Sidecar Node version: 24.21.0.** Report: `node 24.21.0`, `electron 44.7.0`, `ELECTRON_RUN_AS_NODE=1`, `execPath …/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`, `arm64`. Same as the supervisor's own probe (P1.3).
- **2. `@napi-rs/keyring` loads in the sidecar and round-trips without a prompt.** Pinned exactly at **2.1.0** in `packages/orb-keychain` (prebuilt `@napi-rs/keyring-darwin-arm64` 2.1.0; N-API, so no rebuild for Electron-as-Node). `@orb/keychain` now exports `keyringRoundTrip(service)` (set a random value, get, delete, get again; reports booleans + timings only, never the value) and the service names `ai.orb.app` / `ai.orb.app.spike`. Recorded output (service `ai.orb.app.spike`, account `probe-<pid>-<ms>`):
  `{"loaded":true,"set":true,"getMatches":true,"deleted":true,"goneAfterDelete":true,"ms":{"set":9.9,"get":0.7,"delete":2.5,"getAfterDelete":0.3}}`. No Keychain dialog appeared (a prompt would block the synchronous call; the test bounds each call at 2 s). After `deletePassword()`, `getPassword()` returns `null` (not a throw). Caveat: in dev the item's ACL names the unsigned Electron binary that created it; a signed/packaged app (Phase 5) is a different code identity, so items created by a dev build may prompt there. Orb never shares items between dev and packaged builds.
- **3. dsh sandbox backend: `full` (Seatbelt).** The mounted `sandbox` service is `LocalSandboxProvider` (row `sandbox`, `@deepseek-ai/dsh-sandbox-local`). On darwin the chain has one rung, `seatbelt`, selected **without a probe**, and its enforcement is the static claim `full` (`dsh-sandbox-local/lib/index.js:173-192` `PLATFORM_CHAINS`/`STATIC_ENFORCEMENT`, `:496-512` `chainVerdict`). The probe therefore also ran the wrapped argv to prove it functionally: `confine()` returns `sandbox-exec -p "(version 1)(allow default)(deny file-write*)…"` with `enforcement: full`, denial dialect `operation not permitted`; under `workspace-write` a write inside the workspace succeeded, a write to `<repo>/.orb-dev/macos-probe/…` failed with `Operation not permitted` (file not created); under `read-only` a write inside the workspace failed the same way. `sandbox-exec` is deprecated by Apple but present and working on macOS 15. Informational only: Orb agents have no shell.
- **4. `/tmp` writes are unreachable by agents because they have no fs (or shell) tools, not because of the sandbox.** Finding: `workspace-write` (Orb's patched `sandbox-policy` mode) lists `/tmp` and `os.tmpdir()` as writable roots (`dsh-sandbox/lib/index.js:166-173` `writableRoots`), and the probe's confined `echo > /tmp/orb-macos-probe-<pid>.txt` **succeeded**. So the boundary is the tool surface:
  - the global (agent-less) tool surface is empty: probe `ctx.tools.view().visible` → `[]` (`dsh-tools/lib/index.js:2959-2984`);
  - the composed tree mounts only the `orb` preset, whose plugins are `@orb/canvas/tools`, `@orb/agents/guard` and persona (no bash/fs/workflow/job rows): `scripts/test/dump-config.test.ts` ('mounts only the orb preset, which holds no shell/fs/workflow/job tools');
  - the model is offered exactly `place_card` + `query_board`: `apps/ui/test/agent.contract.test.ts` (asserted on the mock LLM request's `tools`);
  - a non-Orb tool re-enabled into the tree is denied by the §2.4 guard for root agents and gateway-composed sessions: `apps/ui/test/agent-guard.contract.test.ts`;
  - neither Orb tool takes a path: `place_card` writes only through `orbCanvas` into the canvas's `board.jsonl` (`packages/orb-canvas/src/tools.ts`).
  Phase 3 must keep this true for Scout/Analyst: any new tool that writes files needs its own path policy, since the sandbox would allow `/tmp`.

### P1.gate Gate 1 audit
Independent re-run on 2026-10-14 (build, 23 test files, 13 e2e, egress audit, dump-config re-generated with no diff, stop benchmark). Findings and fixes:
- **Rows left enabled that sound like telemetry are inert.** The composed tree (`docs/spike/orb-dump-config.yml`, parsed with a `!!js` scalar type) has every telemetry/feedback/analytics/inventory-deepseek/account row and every `ui-*` row disabled. Still enabled: `otel` (`@deepseek-ai/dsh-otel`), a shared transport *factory* service that "creates no queue, identity, or network connection" on mount; it exports only when a reporter row (all disabled) creates one. `plugin-inventory` (host) and `directory-picker` contain no network calls. The egress audit confirms nothing else is contacted.
  - Proof: `dsh-otel/lib/index.js:373-395` (`OTel` service: only `createEventReporter`/`createSessionLogReporter`); `grep -nE "fetch\(|https?://" dsh-host-plugin-inventory/lib dsh-host-directory-picker-auto/lib` (no hits).
- **Orphaned sidecar on kill -9 of Electron main (P1.3 / P1.9 open item) — fixed.** A SIGKILL to main only (Force Quit, crash) left the sidecar running under launchd, still holding the root session's `flock` (`dsh-session-persistence-jsonl/lib/index.js:614-664`), so the relaunched app's `agents.resume` would get `SessionAlreadyOwnedError`. The supervisor now passes `ORB_PARENT_PID` (its own pid) and `@orb/host/web-shell` polls every 500 ms (`packages/orb-host/src/parentWatch.ts`: `process.ppid` still equal and a signal-0 probe); once the parent is gone it swallows EPIPE on stdout/stderr and SIGTERMs itself (dsh's graceful shutdown), with a hard `exit(1)` after 8 s as backstop. Measured: the orphan exits 355–858 ms after main dies. The cut turn is closed as `interrupted` by the next resume (same as the both-killed case). Without the env var (negative control) the new e2e fails: the sidecar is still alive after 15 s.
  - Tests: `apps/desktop/e2e/reopen.spec.ts` 'kill -9 of Electron main only: the orphaned sidecar shuts itself down, relaunch resumes the session'; `packages/orb-host/test/parentWatch.test.ts`.
- **Card provenance rendered in full.** The stub card showed agent and model but not the session id; it now renders `provenance.sessionId` (`orb-card-session`), asserted in `apps/desktop/e2e/agent.spec.ts`.

### Post-gate: default model switched to OpenAI GPT Luna 6 (2026-10-14, user decision)
- The default route is now `llm-pi-ai` `providers: {openai: {apiKeyEnv: OPENAI_API_KEY}}` with `agent-default-model {provider: openai, model: gpt-6-luna}` (`profiles/orb/cordis.patch.yml`). `gpt-6-luna` is in pi-ai's catalog under the `openai` route with `openai-responses`.
- The key resolves through the harness CredentialProvider (`credentials.resolve('OPENAI_API_KEY')`, then the launch env). The dev key lives only in gitignored `.orb-dev/dsh/.credentials.yaml`, mode 0600. *(Since P4.1 the dev key lives only in the Keychain, service `ai.orb.app`: orb-keychain migrates and deletes that file at the dev sidecar's next boot; live scripts read it with `scripts/util/devKey.ts`. See HARNESS_NOTES §P4.1.)*
- Live egress audit (`pnpm egress-audit --mode live`, with OPENAI_API_KEY in the command env): PASS. gpt-6-luna called `place_card` and the card landed. The only host contacted was `api.openai.com` (proxy CONNECT :443).
- DeepSeek is no longer the default and was not tested live, because the user supplied no DeepSeek key.
