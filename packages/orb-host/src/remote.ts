/**
 * Orb's Remote namespace `orb` (BUILD_PLAN §2.3), mounted by the `orb-host` row of the bundle patch.
 *
 * Out-of-tree remotes run on the gateway's SRC fallback (dsh-api-gateway/lib/index.js:998-1075): the gateway finds
 * this service through its `typertRemote` binding, reads the `@Remote` markers from the prototype, and takes the
 * wire argument NAMES from `Function.prototype.toString` of each method. So every Remote method here:
 *   - uses plain identifier parameters (no destructuring, defaults, rest, or TS parameter properties);
 *   - names its AbortSignal parameter `signal`, last;
 *   - never uses a parameter name that a typert lookup provider claims (`agent`, `session`, `workspaceFileScope`);
 *   - validates every argument with zod itself (the SRC codec `src-json` checks nothing).
 * The build keeps the names: tsup/esbuild without minify (tsup.config.ts), checked by
 * packages/orb-host/test/remote.test.ts against the built `lib/remote.js`.
 *
 * Every endpoint delegates to the `orbCanvas` service (packages/orb-canvas, row `orb-canvas`), the single writer of
 * `board.jsonl`, or to the `orbAgents` service (packages/orb-agents, row `orb-agents`), which owns the canvases'
 * root agents. orb-host only validates, delegates, and maps errors.
 */
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { OrbAgents } from '@orb/agents';
import type { CanvasStore, ParallelService } from '@orb/canvas';
import { isCanvasError } from '@orb/canvas';
import {
  AgentControlArgs,
  AgentControlResult,
  AgentStatus,
  BoardCommandRequest,
  BoardCommandResult,
  BoardFollowFrame,
  CanvasCreateArgs,
  CanvasCameraArgs,
  CanvasId,
  CanvasList,
  CanvasMeta,
  CanvasRenameArgs,
  CanvasSearchArgs,
  CanvasSearchResult,
  CanvasSummary,
  CanvasCost,
  PricesDescribeResult,
  PricesSetArgs,
  ChatSendArgs,
  ChatSendResult,
  ChatGPTAction,
  ChatGPTState,
  CustomProvider,
  CustomRemoveArgs,
  KeyDescriptor,
  KeysTestArgs,
  KeysTestResult,
  ModelsDescribeResult,
  ModelsDiscoverArgs,
  ModelsDiscoverResult,
  ProviderInfo,
  KeychainStatus,
  KeysDescribeArgs,
  KeysDescribeResult,
  KeysSetArgs,
  KeysUnsetArgs,
  ORB_NAMESPACE,
  OrbErrorCode,
  OrbSettings,
  OrbSettingsPatch,
  DeckComposeArgs,
  DeckExportResult,
  DeckGetResult,
  DeckProgress,
  DeckRegenerateArgs,
  DeckRegenerateResult,
  DeckSaveArgs,
  DeckSaveResult,
  PortComposeArgs,
  PortGetResult,
  PortProgress,
  PortRegenerateArgs,
  PortRegenerateResult,
  PortSaveArgs,
  PortSaveResult,
  type OrbPingValue,
} from '@orb/shared';
import { ParallelConfirmArgs, ParallelConfirmResult, ParallelStatusResult } from '@orb/shared';
import type { ZodType } from 'zod';
import pkg from '../package.json' with { type: 'json' };
import { registerAssetRoutes } from './assets.js';
import { registerDataRoutes } from './data.js';
import { registerDesignRoutes } from './design.js';
import { describeKeys, KeyShadowedError, setKey, unsetKey, type CredentialsLike } from './keys.js';
import { ModelsError, type OrbModels } from './models.js';
import type { OrbCost } from './cost.js';
import { ChatGPTError } from './chatgptAuth.js';

export const name = 'orb-host';
/** P6.9: the package's own version (tsup inlines the JSON), so Home/About never show 0.0.0. */
export const ORB_HOST_VERSION: string = pkg.version;
export const ORB_HOST_SERVICE = 'orbHost';

/** Turn a zod failure into a wire-safe RemoteError (details must be plain JSON). */
export function parseArg<T>(schema: ZodType<T>, value: unknown, field: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((issue) => ({
    path: [field, ...issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p))],
    code: issue.code,
    message: issue.message,
  }));
  throw remoteError(OrbErrorCode.invalidArgs, `invalid ${field}: ${issues[0]?.message ?? 'bad value'}`, {
    field,
    issues,
  });
}

function remoteError(code: string, message: string, details: Record<string, unknown>): Error {
  // RemoteErrorCode is a declaration-merged union of harness codes; Orb's own codes are plain strings on the wire.
  const Ctor = RemoteError as unknown as new (code: string, message: string, details: unknown) => Error;
  return new Ctor(code, message, details);
}

/** Wire values must be plain JSON (no `undefined` members): `isRemoteJsonValue` in dsh-typert-protocol. */
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Map orb-canvas business errors (`orb/*` codes, plain-JSON details) to RemoteErrors; rethrow anything else. */
function asRemote(err: unknown): never {
  if (isCanvasError(err)) throw remoteError(err.code, err.message, json(err.details));
  if (err instanceof ModelsError) throw remoteError(err.code, err.message, {});
  if (err instanceof ChatGPTError)
    throw remoteError('orb/models-unavailable', err.message, { reason: err.code });
  throw err;
}

export default class OrbHost extends TypertRemoteService {
  static inject = ['typert', 'orbCanvas', 'orbAgents', 'credentials', 'orbModels', 'orbCost', 'orbParallel'];

  private readonly canvas: CanvasStore;
  private readonly agents: OrbAgents;
  /** P4.1: the one credentials service (orb-keychain). */
  private readonly credentials: CredentialsLike;
  /** P4.2: provider routes, Test, discovery and per-tier defaults (row `orb-models`, models.ts). */
  private readonly models: OrbModels | undefined;
  /** P4.3: the canvas token and cost meter, and the price table (row `orb-cost`, cost.ts). */
  private readonly cost: OrbCost | undefined;
  /** P6.7: Parallel AI (cost-guard confirmations, run re-attach; row `orb-parallel`, packages/orb-canvas/src/parallel.ts). */
  private readonly parallel: ParallelService | undefined;
  /** Aborted on dispose so open follow streams end with the plugin. */
  private readonly lifetime = new AbortController();

  constructor(ctx: any) {
    super(ctx, ORB_HOST_SERVICE, { namespace: ORB_NAMESPACE });
    this.canvas = ctx.orbCanvas as CanvasStore;
    this.agents = ctx.orbAgents as OrbAgents;
    this.credentials = ctx.credentials as CredentialsLike;
    this.models = ctx.orbModels as OrbModels | undefined;
    this.cost = ctx.orbCost as OrbCost | undefined;
    this.parallel = ctx.orbParallel as ParallelService | undefined;
    ctx.effect(() => () => this.lifetime.abort(), 'orb-host: end follow streams');
    // P2.5: asset upload/read routes on the authenticated /api channel (absent in plain unit-test contexts).
    if (typeof ctx.inject === 'function') {
      ctx.inject(['connection'], (c: any) => {
        registerAssetRoutes(c, this.canvas);
        // P6.3: dataset import, read, edit and Table promote.
        registerDataRoutes(c, this.canvas);
        // P6.2: each design frame as its own page with its own CSP (scripts allowed, no network).
        registerDesignRoutes(c, this.canvas);
      });
    }
  }

  @Remote
  ping(): OrbPingValue {
    return { ok: true, service: 'orb-host', version: ORB_HOST_VERSION, now: Date.now() };
  }

  /**
   * Create the canvas folder, then its root Orb agent (session id stored in canvas.json, returned here). With
   * `start: true` (Home), Orb's new-canvas turn is queued before this returns.
   */
  @Remote('canvas.create')
  async canvasCreate(request: unknown): Promise<CanvasMeta> {
    const args = parseArg(CanvasCreateArgs, request, 'request');
    const meta = await this.canvas.create(args).catch(asRemote);
    const { canvas } = await this.agents.createRoot(meta.id).catch(asRemote);
    // P3.3: the new-canvas turn (Orb proposes frames and starts Scout and Critic). Queued, not awaited.
    if (args.start) await this.agents.startCanvas(meta.id, args.prompt).catch(asRemote);
    return json(canvas);
  }

  /**
   * Open a canvas: read canvas.json and make its root Orb agent live. A canvas that already has a root session
   * resumes it through the harness resume path (`ctx.agents.resume`), so reopening keeps the agent's history.
   */
  @Remote('canvas.open')
  async canvasOpen(id: unknown): Promise<CanvasMeta> {
    const canvasId = parseArg(CanvasId, id, 'id');
    const { canvas } = await this.agents.openRoot(canvasId).catch(asRemote);
    // P6.7: re-attach Parallel runs that were in flight and pull the board's watches (never blocks, never throws).
    void this.parallel?.resumeCanvas(canvasId);
    return json(canvas);
  }

  /**
   * Home tiles (P2.6): every canvas on disk with a mini preview of its board and its agents' status, most recently
   * changed first.
   */
  @Remote('canvas.list')
  async canvasList(): Promise<CanvasSummary[]> {
    const summaries = await this.canvas.summaries().catch(asRemote);
    const tiles = await Promise.all(
      summaries.map(async (summary) => {
        const state = await this.agents.statusOf(summary.id).then(
          (s) => s.state,
          () => 'idle',
        );
        const working = state === 'running' || state === 'stopping' ? 1 : 0;
        const label = working === 0 ? 'Idle' : `${working} agent${working === 1 ? '' : 's'} working`;
        // P4.3: the tile's token and cost total; a canvas whose sessions cannot be read just has no meter.
        const cost = await this.cost?.tile(summary.id).catch(() => undefined);
        return { ...summary, status: { working, label }, ...(cost ? { cost } : {}) };
      }),
    );
    return json(CanvasList.parse(tiles));
  }

  /** Full-text search across every canvas (P2.6; index.sqlite, rebuilt first when it is missing). */
  @Remote('canvas.search')
  async canvasSearch(request: unknown): Promise<CanvasSearchResult> {
    const args = parseArg(CanvasSearchArgs, request, 'request');
    return json(CanvasSearchResult.parse(await this.canvas.search(args).catch(asRemote)));
  }

  /**
   * P6.7 cost guard: the user's Approve or Decline on a research run or watch that waits for it (the card, or the
   * conversation panel). `expired`: orb was restarted since, so nothing is waiting.
   */
  @Remote('parallel.confirm')
  async parallelConfirm(request: unknown): Promise<ParallelConfirmResult> {
    const args = parseArg(ParallelConfirmArgs, request, 'request');
    if (!this.parallel) throw remoteError('orb/parallel-unavailable', 'Parallel is not available', {});
    const state = await this.parallel.confirm(args.canvasId, args.cardId, args.approve).catch(asRemote);
    return json(ParallelConfirmResult.parse({ state }));
  }

  /** P6.7: is the Parallel key set (the Parallel tools say "key needed" when it is not)? */
  @Remote('parallel.status')
  async parallelStatus(): Promise<ParallelStatusResult> {
    return json(
      ParallelStatusResult.parse({
        configured: (await this.parallel?.configured()) ?? false,
        confirmAboveUsd: this.parallel?.confirmAboveUsd ?? 0.5,
      }),
    );
  }

  /** App settings from orb.json (P2.6: the night/day mode). */
  @Remote('settings.get')
  async settingsGet(): Promise<OrbSettings> {
    return json(OrbSettings.parse(await this.canvas.settings.get().catch(asRemote)));
  }

  /** Merge a patch into orb.json; returns the new settings. */
  @Remote('settings.set')
  async settingsSet(request: unknown): Promise<OrbSettings> {
    const patch = parseArg(OrbSettingsPatch, request, 'request');
    return json(OrbSettings.parse(await this.canvas.settings.set(patch).catch(asRemote)));
  }

  /**
   * P4.1: a redacted descriptor per provider (the known ones, custom providers with a stored key, and any asked
   * for): `{provider, ref, configured, source, writable, redacted: 'sk-...4f2a'}`. Never a key.
   */
  @Remote('keys.describe')
  async keysDescribe(request: unknown): Promise<KeysDescribeResult> {
    const args = parseArg(KeysDescribeArgs, request ?? undefined, 'request');
    return json(KeysDescribeResult.parse(await describeKeys(this.credentials, args)));
  }

  /**
   * P6.2: whether orb-keychain's read of the macOS Keychain is done, or waiting (most likely on a macOS access
   * prompt). No key, no item name. A provider without a Keychain answers `ready`.
   */
  @Remote('keys.keychain')
  keysKeychain(): KeychainStatus {
    const status = this.credentials.keychainStatus?.() ?? { state: 'ready', waitingMs: 0 };
    return json(
      KeychainStatus.parse({ state: status.state, waitingMs: Math.max(0, Math.round(status.waitingMs)) }),
    );
  }

  /**
   * P4.1: store a provider key in the Keychain. The UI sends the key once, here, over the authenticated loopback
   * (the gateway's auth cookie + same-origin check); the answer is the redacted descriptor. It takes effect on the
   * next request (`credentials/reference-updated`), with no restart.
   */
  @Remote('keys.set')
  async keysSet(request: unknown): Promise<KeyDescriptor> {
    const args = parseArg(KeysSetArgs, request, 'request');
    const descriptor = await setKey(this.credentials, args).catch((err: unknown) => this.keyError(err));
    await this.models?.keyChanged(args.provider);
    return json(descriptor);
  }

  /** P4.1: remove a provider key from the Keychain. */
  @Remote('keys.unset')
  async keysUnset(request: unknown): Promise<KeyDescriptor> {
    const args = parseArg(KeysUnsetArgs, request, 'request');
    const descriptor = await unsetKey(this.credentials, args).catch((err: unknown) => this.keyError(err));
    await this.models?.keyChanged(args.provider);
    return json(descriptor);
  }

  private get modelsService(): OrbModels {
    if (!this.models) throw remoteError('orb/models-unavailable', 'model settings are not available', {});
    return this.models;
  }

  /**
   * P4.2: provider cards (catalog, custom and any other configured route) with redacted keys and the last Test, the
   * per-agent picks and what each agent starts on next, and whether the first-run sheet is due.
   */
  @Remote('models.describe')
  async modelsDescribe(): Promise<ModelsDescribeResult> {
    return json(ModelsDescribeResult.parse(await this.modelsService.describe().catch(asRemote)));
  }

  @Remote('chatgpt.describe')
  async chatgptDescribe(): Promise<ChatGPTState> {
    return json(ChatGPTState.parse(await this.modelsService.chatgpt.describe().catch(asRemote)));
  }

  @Remote('chatgpt.action')
  async chatgptAction(request: unknown, signal: AbortSignal): Promise<ChatGPTState> {
    const args = parseArg(ChatGPTAction, request, 'request');
    return json(ChatGPTState.parse(await this.modelsService.chatgpt.action(args, signal).catch(asRemote)));
  }

  /**
   * P4.2 Test button: one `ctx.llm.stream({provider, model, maxTokens: 1})` request with the stored key; the failure
   * code maps to a plain message (invalid key, no credit, rate limited, unreachable, …). Never the key.
   */
  @Remote('keys.test')
  async keysTest(request: unknown, signal: AbortSignal): Promise<KeysTestResult> {
    const args = parseArg(KeysTestArgs, request, 'request');
    return json(KeysTestResult.parse(await this.modelsService.test(args, signal).catch(asRemote)));
  }

  /** P4.2: a provider's models (`ctx.llm.discoverModels`), or a draft custom endpoint's listing. */
  @Remote('models.discover')
  async modelsDiscover(request: unknown, signal: AbortSignal): Promise<ModelsDiscoverResult> {
    const args = parseArg(ModelsDiscoverArgs, request, 'request');
    const models = await this.modelsService.discover(args, signal).catch(asRemote);
    return json(ModelsDiscoverResult.parse({ models }));
  }

  /** P4.2: add or replace a custom provider (llm-pi-ai route, live; no-key placeholder; orb.json). */
  @Remote('models.custom.set')
  async modelsCustomSet(request: unknown): Promise<ProviderInfo> {
    const provider = parseArg(CustomProvider, request, 'request');
    return json(ProviderInfo.parse(await this.modelsService.setCustom(provider).catch(asRemote)));
  }

  /** P4.2: remove a custom provider (route, key, orb.json entry, agent picks naming it). */
  @Remote('models.custom.remove')
  async modelsCustomRemove(request: unknown): Promise<{ removed: true }> {
    const args = parseArg(CustomRemoveArgs, request, 'request');
    await this.modelsService.removeCustom(args.id).catch(asRemote);
    return { removed: true };
  }

  private get costService(): OrbCost {
    if (!this.cost) throw remoteError('orb/cost-unavailable', 'the cost meter is not available', {});
    return this.cost;
  }

  /**
   * P4.3: the canvas's token and estimated cost meter: the harness `tokenUsage` totals of its root and child sessions,
   * and per model route the tokens × that route's price (orb.json `prices`). Routes with no price are listed as
   * unpriced; their tokens still count.
   */
  @Remote('cost.get')
  async costGet(canvasId: unknown): Promise<CanvasCost> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    return json(CanvasCost.parse(await this.costService.get(id).catch(asRemote)));
  }

  /** P4.3: the price table for Settings (USD per 1M tokens; catalog-seeded or user-edited rows). */
  @Remote('prices.describe')
  async pricesDescribe(): Promise<PricesDescribeResult> {
    return json(PricesDescribeResult.parse({ prices: await this.costService.describe().catch(asRemote) }));
  }

  /** P4.3: edit one route's price (`rates`), or reset it to the catalog price (`rates: null`). */
  @Remote('prices.set')
  async pricesSet(request: unknown): Promise<PricesDescribeResult> {
    const args = parseArg(PricesSetArgs, request, 'request');
    return json(PricesDescribeResult.parse({ prices: await this.costService.set(args).catch(asRemote) }));
  }

  /**
   * Keys errors: a shadowed key is a business error; anything else is logged (the provider's messages name the
   * reference, never the value) and answered with a generic failure.
   */
  private keyError(err: unknown): never {
    if (err instanceof KeyShadowedError)
      throw remoteError(OrbErrorCode.keyShadowed, err.message, { provider: err.provider });
    this.ctx
      .logger('orb-host')
      .warn('keys: the Keychain write failed: %s', (err as Error)?.message ?? String(err));
    throw remoteError('orb/keychain-failed', 'the key could not be saved in the Keychain', {});
  }

  /** P6.20: remember the camera the user left a canvas at (canvas.json `camera`); returns the updated canvas.json. */
  @Remote('canvas.camera')
  async canvasCamera(canvasId: unknown, request: unknown): Promise<CanvasMeta> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    const args = parseArg(CanvasCameraArgs, request, 'request');
    return json(await this.canvas.setCamera(id, args.camera).catch(asRemote));
  }

  /** Rename a canvas (the title pill's inline edit); returns the updated canvas.json. */
  @Remote('canvas.rename')
  async canvasRename(canvasId: unknown, request: unknown): Promise<CanvasMeta> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    const args = parseArg(CanvasRenameArgs, request, 'request');
    return json(await this.canvas.rename(id, args.title).catch(asRemote));
  }

  /**
   * P6.11: start Orb's new-canvas turn on a canvas created with `start: false` (a template canvas whose materials
   * were dropped on the intake form: the cards must be on the board before Orb reads them).
   */
  @Remote('canvas.start')
  async canvasStart(canvasId: unknown): Promise<CanvasMeta> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    const meta = await this.canvas.open(id).catch(asRemote);
    await this.agents.startCanvas(id, meta.title).catch(asRemote);
    return json(meta);
  }

  /**
   * Apply one user command (P2.3: frame/card/link add, update, move, remove, or a batch; P2.4: undo, redo) and
   * return the events it wrote plus the undo/redo depth. A `pendingId` in the command is echoed on `board.follow`
   * with those events.
   */
  @Remote('board.command')
  async boardCommand(canvasId: unknown, command: unknown): Promise<BoardCommandResult> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    const cmd = parseArg(BoardCommandRequest, command, 'command');
    const { events, history } = await this.canvas.userCommand(id, cmd).catch(asRemote);
    return json(BoardCommandResult.parse({ event: events.at(-1), events, history }));
  }

  /**
   * Queue a user message for the canvas's root Orb agent, with the frames/cards in context and the thread's card
   * injected as describe() text (P3.3). The reply streams on `session/follow`.
   */
  @Remote('chat.send')
  async chatSend(canvasId: unknown, request: unknown): Promise<ChatSendResult> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    const args = parseArg(ChatSendArgs, request, 'request');
    const { sessionId } = await this.agents
      .send(id, args.text, { context: args.context, threadOf: args.threadOf })
      .catch(asRemote);
    return json(ChatSendResult.parse({ accepted: true, sessionId }));
  }

  /**
   * Control the canvas's agents (PRD Agents › Controls; BUILD_PLAN P3.7), one agent or `all`:
   * - `stop`: `all` cancels every child and the root (queues cleared) and waits ≤1 s for idle; one agent stops
   *   alone (Orb's turn is cancelled, a child is interrupted with the user's authority).
   * - `pause`: halts the current turn with the queue kept and holds the agent until `resume`; messages addressed
   *   to it meanwhile are queued.
   * - `resume`: steers the paused agent(s) with "continue" plus everything queued.
   * - `redirect` (`text` required): steers Orb (`orb` or `all`), or messages one child; queued when it is paused.
   */
  @Remote('agents.control')
  async agentsControl(canvasId: unknown, request: unknown): Promise<AgentControlResult> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    const args = parseArg(AgentControlArgs, request, 'request');
    let result: unknown;
    switch (args.action) {
      case 'stop':
        result =
          args.agent === 'all'
            ? await this.agents.stop(id).catch(asRemote)
            : await this.agents.stopOne(id, args.agent).catch(asRemote);
        break;
      case 'pause':
        result = await this.agents.pause(id, args.agent).catch(asRemote);
        break;
      case 'resume':
        result = await this.agents.resume(id, args.agent).catch(asRemote);
        break;
      case 'redirect':
        result = await this.agents.redirect(id, args.agent, args.text ?? '').catch(asRemote);
        break;
    }
    return json(AgentControlResult.parse(result));
  }

  /**
   * P4.5 `port.compose`: the research document. Unread Must read cards in scope answer `unread` (nothing composed)
   * unless `continueUnread`; otherwise Orb plans the sections (the instructions, or the standard format) and calls
   * compose_section once per section, and the stream reports `started`, each `section` (or a `rejected` call), then
   * `done` or `failed`. Closing the stream does not stop Orb; Stop does.
   */
  @Remote({ mode: 'stream' })
  async *['port.compose'](
    canvasId: unknown,
    request: unknown,
    signal: AbortSignal,
  ): AsyncGenerator<PortProgress> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    const args = parseArg(PortComposeArgs, request ?? {}, 'request');
    await this.canvas.open(id).catch(asRemote);
    const stop = AbortSignal.any([signal, this.lifetime.signal]);
    try {
      for await (const event of this.agents.compose(id, args, stop)) yield json(PortProgress.parse(event));
    } catch (err) {
      asRemote(err);
    }
  }

  /** P4.5: Orb rewrites one section with the saved instructions; resolves with the new document. */
  @Remote('port.regenerateSection')
  async portRegenerateSection(canvasId: unknown, request: unknown): Promise<PortRegenerateResult> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    const args = parseArg(PortRegenerateArgs, request, 'request');
    const doc = await this.agents.regenerateSection(id, args.sectionId).catch(asRemote);
    return json(PortRegenerateResult.parse({ doc }));
  }

  /** P4.5: the reading view's edits (text only; Orb's paragraphs keep their citations, new ones are the user's). */
  @Remote('port.saveDoc')
  async portSaveDoc(canvasId: unknown, request: unknown): Promise<PortSaveResult> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    const args = parseArg(PortSaveArgs, request, 'request');
    const doc = await this.canvas.port.saveEdits(id, args).catch(asRemote);
    return json(PortSaveResult.parse({ doc }));
  }

  /** P4.5: the stored research document (`port/citations.json`) and the saved instructions, or nulls. */
  @Remote('port.get')
  async portGet(canvasId: unknown): Promise<PortGetResult> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    return json(PortGetResult.parse(await this.canvas.port.get(id).catch(asRemote)));
  }

  /**
   * P6.17 `deck.compose`: the slides. Unread Must read cards in scope answer `unread` (nothing composed) unless
   * `continueUnread`; otherwise Orb writes the slides of the deck format (or the user's instructions) with
   * compose_slides, and the stream reports `started`, each `slide` (or a `rejected` call), then `done` or `failed`.
   * Closing the stream does not stop Orb; Stop does.
   */
  @Remote({ mode: 'stream' })
  async *['deck.compose'](
    canvasId: unknown,
    request: unknown,
    signal: AbortSignal,
  ): AsyncGenerator<DeckProgress> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    const args = parseArg(DeckComposeArgs, request ?? {}, 'request');
    await this.canvas.open(id).catch(asRemote);
    const stop = AbortSignal.any([signal, this.lifetime.signal]);
    try {
      for await (const event of this.agents.composeDeck(id, args, stop))
        yield json(DeckProgress.parse(event));
    } catch (err) {
      asRemote(err);
    }
  }

  /** P6.17: Orb rewrites one slide (optionally with a change asked for); resolves with the new deck. */
  @Remote('deck.regenerateSlide')
  async deckRegenerateSlide(canvasId: unknown, request: unknown): Promise<DeckRegenerateResult> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    const args = parseArg(DeckRegenerateArgs, request, 'request');
    const deck = await this.agents.regenerateSlide(id, args.slideId, args.instruction).catch(asRemote);
    return json(DeckRegenerateResult.parse({ deck }));
  }

  /** P6.17: the slide view's edits (reorder, delete, text; the user's own slides). Orb's slides keep their citations. */
  @Remote('deck.save')
  async deckSave(canvasId: unknown, request: unknown): Promise<DeckSaveResult> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    const args = parseArg(DeckSaveArgs, request, 'request');
    const deck = await this.canvas.deck.saveEdits(id, args).catch(asRemote);
    return json(DeckSaveResult.parse({ deck }));
  }

  /** P6.17: the stored deck (`deck/deck.json`) and the saved format and instructions, or nulls. */
  @Remote('deck.get')
  async deckGet(canvasId: unknown): Promise<DeckGetResult> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    return json(DeckGetResult.parse(await this.canvas.deck.get(id).catch(asRemote)));
  }

  /** P6.17: build the .pptx of the deck (native charts and tables, pictures, notes, Sources slide) into `exports/`. */
  @Remote('deck.exportPptx')
  async deckExportPptx(canvasId: unknown): Promise<DeckExportResult> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    return json(DeckExportResult.parse(await this.canvas.deck.exportPptx(id).catch(asRemote)));
  }

  /** The root agent's state now, then every change (`running`, `idle`, `stopping`, `stopped`, `stop-timeout`). */
  @Remote({ mode: 'stream' })
  async *['agents.status'](canvasId: unknown, signal: AbortSignal): AsyncGenerator<AgentStatus> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    await this.canvas.open(id).catch(asRemote);
    const stop = AbortSignal.any([signal, this.lifetime.signal]);
    try {
      for await (const status of this.agents.followStatus(id, stop)) yield json(AgentStatus.parse(status));
    } catch (err) {
      asRemote(err);
    }
  }

  /** Snapshot first, then every new board event, until the client cancels or the plugin is disposed. */
  @Remote({ mode: 'stream' })
  async *['board.follow'](canvasId: unknown, signal: AbortSignal): AsyncGenerator<BoardFollowFrame> {
    const id = parseArg(CanvasId, canvasId, 'canvasId');
    // Fail fast (orb/not-found) before the stream yields anything.
    await this.canvas.open(id).catch(asRemote);
    const stop = AbortSignal.any([signal, this.lifetime.signal]);
    try {
      for await (const frame of this.canvas.follow(id, stop)) yield json(BoardFollowFrame.parse(frame));
    } catch (err) {
      asRemote(err);
    }
  }
}
