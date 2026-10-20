# Orb UI wire

The UI's client for the dsh gateway on the sidecar origin (`http://127.0.0.1:<port>`). It has three parts:

| Part | Transport | Code |
|---|---|---|
| Unary calls | `POST /api/<ns>/<method>` | `call.ts` |
| Streams | WebSocket `/api/remote.mux`, multiplexed | `mux.ts` |
| Forwarded host events | the `$events` stream on the mux, plus `POST /api/$events/result` | `events.ts` |

`session.ts` adds typed `session/*` calls and `ReplyTracker`, which folds `session/follow` frames into the visible reply.
`createWire(env)` (`index.ts`) wires everything together.

Paths below are relative to `node_modules/@deepseek-ai/`. The installed harness (0.2.0-rc.2) is the source of truth.

## Environment injection

Nothing in this folder touches `window`, `document`, `fetch` or `WebSocket` directly. Everything comes in through
`WireEnv` (`env.ts`):

```ts
type WireEnv = {
  baseUrl: string;                       // document.baseURI in the window: http://127.0.0.1:<port>/
  fetch(input: string, init: RequestInit): Promise<Response>;
  createSocket(url: string): SocketLike;  // WHATWG WebSocket subset; the `ws` package also fits
};
```

- **In the window**, `browserEnv()` uses the page's own `fetch` and `WebSocket`. The browser attaches the `dsh-auth-*`
  cookie and a same-origin `Origin` header itself.
- **In Vitest**, `scripts/testkit` boots a real sidecar and opens the token URL once
  (`GET /?token=…` returns `303` plus `Set-Cookie: dsh-auth-<hash>=…; HttpOnly; SameSite=Strict`). Its `fetch` and
  `createSocket` then add `cookie` and `origin: http://127.0.0.1:<port>` by hand.
- **Never log the token URL.** The testkit keeps only the cookie.

## Admission (every `/api` request and the mux upgrade)

`dsh-client-connection/lib/index.js`:
- `isTrustedApiRequest` (`:205`): the `Host` must be loopback (or a trusted host, and Orb trusts none).
  `Sec-Fetch-Site: cross-site` is rejected. If an `Origin` is present, its host must equal `Host`. A request with
  **no** `Origin` is allowed.
- `requestRejection` (`:586`): no valid cookie gives **401**; a failed fence gives **403**. Both come back as plain
  text, with no envelope.
- The mux upgrade goes through the same admission (`connection.admit(req)`). A rejected upgrade fails the WebSocket
  handshake (`dsh-api-gateway/lib/index.js:626-640`).

## Unary: `POST /api/<ns>/<method>`

```jsonc
// request (content-type: application/json)
{ "type": "client-request", "rpcId": "<uuid>", "method": "<ns>/<method>", "payload": { "args": { "<paramName>": … } } }
// response, HTTP 200
{ "type": "server-response", "rpcId": "<same uuid>", "result": { "ok": true, "value": … } }
{ "type": "server-response", "rpcId": "<same uuid>", "result": { "ok": false, "error": { "code": "…", "message": "…", "details": { … } } } }
```

- **Proofs:**
  - Client side: `dsh-client-connection/lib/client.js:1209` (`createWebConnectionRpc`), `:1288` (`parseConnectionResponse`).
  - Server side: `dsh-client-connection/lib/index.js` (`rpcFetchHandler`).
- **`args` keys are the Remote method's parameter names.**
  - Every `session/*` method takes `request`, so `session/create` gets `{request: {}}`.
  - `session/list` takes `_request`: `{_request: {}}`.
  - Typed endpoints require every declared parameter; a missing one returns `gateway/arguments-invalid`
    (`dsh-api-gateway/lib/index.js` `assertExactArguments`).
- **Endpoint segments** must match `^[A-Za-z0-9_$.-]+$` (`client.js:1202`). `call()` checks this before sending.
- **Error mapping** (`call.ts`). Every failure is a `WireError {code, message, details, retryable}`:

| What came back | `code` |
|---|---|
| `result.ok === false` | the harness code verbatim (`gateway/arguments-invalid`, `session/…`, …) |
| HTTP 401 | `transport/unauthorized` |
| HTTP 403 | `transport/forbidden` |
| HTTP 404: no endpoint of that name. The route table is exact (`createSharedFetchHandler`, `index.js:608`) | `transport/not-found` |
| any other non-2xx (415, 400, 500) | `transport/http`, with `details.status`. 5xx is `retryable` |
| `fetch` threw | `transport/network` (retryable), or `transport/aborted` when the caller's signal aborted |
| bad envelope, `rpcId` mismatch, or the value fails the caller's zod schema | `transport/invalid-response` |

## Streams: WebSocket `/api/remote.mux`

One socket carries every logical stream. Frames are JSON **text** frames; a binary frame closes the socket with 1003.

```jsonc
// client → host
{ "type": "open",   "streamId": "<uuid>", "endpoint": "<ns>/<method>", "payload": { "args": { … } } }
{ "type": "item",   "streamId": "…", "value": … }   // uplink item, for methods that read the client's uplink; value optional
{ "type": "end",    "streamId": "…" }               // uplink finished
{ "type": "cancel", "streamId": "…" }               // stop: the host aborts the method's signal
// host → client
{ "type": "item",  "streamId": "…", "value": … }    // value optional
{ "type": "end",   "streamId": "…" }
{ "type": "error", "streamId": "…", "error": { "code": "…", "message": "…", "details": { … } } }
```

- **Proofs:**
  - Frame validators (exact key sets): `dsh-api-gateway/lib/types/stream-protocol.js`
    (`parseRemoteStreamClientMessage`, `parseRemoteStreamServerMessage`).
  - Server: `dsh-api-gateway/lib/index.js:172-405` (`RemoteStreamMuxServer`, `RemoteStreamMuxConnection`).
  - Harness browser client: `dsh-api-gateway/lib/client.js:325` (`RemoteStreamMuxClient`).
- **URL.** `new URL('api/remote.mux', baseURI)` with the scheme switched to `ws:` (`client.js:728`).
- **Streams that are not opened yet.** Before a stream's `open`, its `item`/`end`/`cancel` frames are dropped, and so
  are frames for a stream that already finished. A **duplicate `open` id closes the socket with 1008**, and so does any
  malformed client frame.
- **After `cancel`** the host sends nothing more for that stream, not even `end` (`pump`, `index.js:338`). Abort-caused
  ends are silent unless the reason is a Remote error.
- **Wrong arguments to a stream method** arrive as an `error` frame (`gateway/arguments-invalid`), not as a socket
  close.
- **Heartbeat.** The host sends WebSocket **Ping control frames** every 2 s (`websocketHeartbeatIntervalMs`, default
  `2e3`, `index.js:551`). It terminates a socket after 2 missed pongs (`MAX_MISSED_HEARTBEATS`, `index.js:172`).
  Browsers and `ws` answer pings automatically, so there is no application-level ping frame and the client does
  nothing.
- **Uplink limit.** Each stream may buffer at most 256 KiB of uplink frames (`streamInboxBytes`); more than that
  fails the stream.

**`MuxClient` behaviour** (`mux.ts`):
- **Opening.** The socket opens lazily on the first `open()`.
- **Results.** `open(endpoint, args, {signal, schema, uplink})` returns an async generator:
  - `item` frames are yielded, after zod validation when a `schema` is given;
  - an `end` frame finishes the generator;
  - an `error` frame throws `WireError(error.code)`.
- **Cancelling.** Breaking out of the loop, calling `return()`, aborting `signal`, or failing item validation sends
  `cancel`.
- **Socket loss** (close, error, an invalid host frame, or `reconnect()`) fails every active stream with
  `transport/disconnected`, `retryable: true`. Long-lived consumers re-open, which reconnects the socket. Failed
  connects retry with jittered exponential backoff (base 250 ms, cap 10 s) until success or `dispose()`.
- **No resubscribing.** Streams are not resubscribed automatically, because only the consumer knows how to resume.
  For example, `session/follow` reopens with a fresh snapshot.

## Forwarded events: `$events`

- **Opening.** Open `{type:'open', streamId, endpoint:'$events', payload:{args:{}}}`. The args must be exactly `{}`.
- **Items:**

```jsonc
{ "type": "ready", "clientId": "<uuid>", "host": { "home": "/Users/…" } }            // first item, every generation
{ "type": "emit", "event": "api-session/status", "args": ["session-…", true] }       // broadcast
{ "type": "waterfall", "event": "…", "eventId": "…", "agentId": "…", "request": { … } } // host waits for an answer
{ "type": "cancel", "eventId": "…" }                                                 // host gave up on a waterfall
```

- **Answering a waterfall.** Every waterfall is answered by
  `POST /api/$events/result` with args `{clientId, eventId, outcome}`, where `outcome` is one of:
  - `{kind:'next'}`
  - `{kind:'result', value?}`
  - `{kind:'rejected', error:{name, message, code?, details?}}`
- **How the host settles a waterfall.** It takes the first `result`. Otherwise it waits until **every** connected
  client has said `next`, which runs the host default (`receiveRemoteEventResult`, `index.js:908`).
- **So `RemoteEvents` answers `next` for any event without a handler.** It must never leave the host waiting.
- **Re-opening.** The stream re-opens with backoff whenever it fails, and each generation has a new `clientId`.
- **Proofs:** `dsh-api-gateway/lib/index.js:772` (`dispatchRpc`, `$events/result`), `:809` (`openRemoteEvents`);
  `dsh-api-gateway/lib/client.js:791` (`pumpEvents`), `:894` (`parseRemoteEventReady`).
- **Events seen on Orb's sidecar:**
  - `api-session/status [sessionId, running]` (true on turn start, false on idle);
  - `api-session/activity [sessionId, ms]`.

## Session calls used by Orb

These come from `dsh-api-session-controller/lib/types/types.d.ts:262-516`, and the methods start at `lib/index.js:2954`.

| Call | args | value |
|---|---|---|
| `session/list` | `{_request:{}}` | `{items: SessionSummary[]}` |
| `session/create` | `{request:{workspaceId?, cwd?, sessionId?, agentPreset?}}` | `{sessionId, agentPreset?}`. Orb's registry default preset is `orb` |
| `session/prompt` | `{request:{requestId, sessionId, mode:'queue'\|'steer', content:[{type:'text',text}], clientTimeZone?}}` | `{accepted:true}`, returned once the prompt is in the agent inbox |
| `session/cancel` | `{request:{sessionId}}` | `{accepted:true}`. Cancels the active turn and keeps the inbox |
| `session/page` | `{request:{address, throughSeq, beforeSeq?, maxMessages?, turnWindow?}}` | `{records, hasMore}`: one backwards page ending at `throughSeq`. P3.6 provenance: `throughSeq` = the card's `provenance.eventSeq`, `turnWindow {minMessages:1, minTurns:1}`; a child's session through `{kind:'subagent', parentSessionId, childSessionId, mode:'continuable'}` |
| `session/follow` (stream) | `{request:{address:{kind:'session',sessionId}, assistantStream?:true, maxMessages?, turnWindow?}}` | the items below |

**`session/follow` items:**
1. `{type:'snapshot', header, cursor, records:[{type:'event',event}], hasMore, projections, assistantStream?}`.
2. Then durable `{type:'event', event:{type, seq, time, data, …}}` items.
3. With `assistantStream:true`, also `{type:'assistant-stream', frame}` items. The frame is one of:
   - `start {attemptId, revision, startedAfterSeq, turn, step}`;
   - `chunk {attemptId, revision, index, time, chunk}`, where `chunk` is e.g. `{type:'block-start'}`,
     `{type:'text-delta', index, text}`, `{type:'block-end', block}`, `{type:'usage'}` or `{type:'finish'}`;
   - `end {attemptId, revision, index, outcome:{kind:'committed', eventType, seq} | {kind:'abandoned'}}`.

**What one turn looks like on the follow stream** (observed against the mock model):
1. `agent/inbox/spliced`
2. `turn/start`
3. `step/start`
4. `system/message`
5. `user/message`
6. `request/header`
7. `request/context`
8. assistant-stream `start`
9. assistant-stream `chunk`s, with the text deltas
10. `assistant/message`
11. assistant-stream `end` (committed)
12. `step/end`
13. `turn/end {reason:{kind:'completed'}}`

**After `session/cancel`** mid-stream, the following arrive within about 15 ms:
1. The partial reply is committed as `assistant/message`, with an interruption marker.
2. The assistant-stream `end` (committed).
3. `step/end`.
4. `turn/end {reason:{kind:'aborted', reason:{kind:'user'}}}`.

The provider HTTP request is torn down, and the session accepts the next prompt normally.

## Orb calls (`orb` namespace, `orb.ts`)

Served by `packages/orb-host/src/remote.ts` (a `TypertRemoteService` on the gateway's SRC fallback). Args are keyed by
the host method's parameter names; every value and stream item is checked with the `@orb/shared` schemas.

| Endpoint | Kind | Args | Value / items |
|---|---|---|---|
| `orb/ping` | unary | `{}` | `OrbPingValue` |
| `orb/canvas.create` | unary | `{request: CanvasCreateArgs}` | `CanvasMeta` (with the root agent's `rootSessionId`, P1.8); `start: true` (Home) also queues Orb's new-canvas turn (P3.3) |
| `orb/canvas.open` | unary | `{id}` | `CanvasMeta`; also makes the root agent live, resuming its persisted session (P1.9) |
| `orb/canvas.list` | unary | `{}` | `CanvasMeta[]`, newest first (P1.9) |
| `orb/board.command` | unary | `{canvasId, command: BoardCommandRequest}` (a `BoardCommand`, or `{type: 'undo' \| 'redo'}`, P2.4) | `BoardCommandResult` `{event?, events, history: {undo, redo}}`; an undo/redo with nothing to do returns `events: []` |
| `orb/chat.send` | unary | `{canvasId, request: ChatSendArgs}` (`context: {frameIds?, cardIds?}`, `threadOf?`: P3.3, injected as describe() text; unknown ids → `orb/not-found`; P3.6: a `threadOf` message is stored as a `thread.message` first) | `ChatSendResult` (`{accepted: true, sessionId}`); the reply streams on `session/follow` of `rootSessionId` |
| `orb/agents.control` | unary | `{canvasId, request: {agent: 'all' \| AgentName, action, text?}}` | `AgentControlResult` of that action: `stop` for all (P1.10) or one agent (P3.6); `pause` / `resume` / `redirect` (`text` required) for one agent or all (P3.7) |
| `orb/agents.status` | stream (mux) | `{canvasId}` | `AgentStatus` per agent (state, label, frameId): every agent's state now, then each change |
| `orb/board.follow` | stream (mux) | `{canvasId}` | `BoardFollowFrame`: one `snapshot`, then `event`s; open until cancelled |

Business failures arrive as normal failure envelopes / mux `error` frames with code `orb/invalid-args` (zod rejected
a payload; `details.issues`) or `orb/not-found`. Calling a stream endpoint as unary fails with
`gateway/signature-invalid`; an extra arg fails with `gateway/arguments-invalid`.

## Assets (P2.5): raw HTTP routes, `assets.ts`

Not RPCs: exact Fetch routes that orb-host registers on the same authenticated `/api` channel
(`ctx.connection.fetch.register`, docs/HARNESS_NOTES.md). The cookie and the Origin fence apply as for RPCs (401 / 403).

| Route | Request | Answer |
|---|---|---|
| `POST api/orb-asset/upload?canvas=<id>&name=<file name>` | `content-type: <asset type>` (PDF, PNG, JPEG, GIF, WebP, CSV, Markdown, text); raw bytes, streamed | `AssetUploadResult` JSON: `{ok: true, asset: AssetRef}`, or `{ok: false, error: {code, message}}` with HTTP 400 (`orb/invalid-args`), 404 (`orb/not-found`), 413 (`orb/too-large`) or 415 (`orb/unsupported-type`) |
| `GET\|HEAD api/orb-asset/file?canvas=<id>&path=assets/<name>` | — | the stored file (`nosniff`, `sandbox` CSP, immutable cache); 400 for any other path shape, 404 for a missing file |

`wire.assets.upload(canvasId, {name, mime, body})` resolves with the `AssetRef` (rejects with a `WireError` carrying the
`orb/*` code); `wire.assets.url(canvasId, asset)` is the same-origin URL for `<img src>`, pdf.js and `fetch`.
`card.opened` is a board command (`{type: 'card.opened', id}`) on `orb/board.command`: written once per card, never on
the undo stack.
