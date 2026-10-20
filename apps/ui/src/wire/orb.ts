/**
 * Typed calls into Orb's own Remote namespace `orb` (packages/orb-host/src/remote.ts). Wire args are keyed by the
 * host method's parameter names: `canvas.create` takes `{request}`, `canvas.open` `{id}`, `canvas.list` `{}`, `canvas.rename` `{canvasId, request}`, `canvas.search` `{request}`, `settings.get` `{}`, `settings.set` `{request}`, `keys.describe` `{request?}`, `keys.set` `{request}`, `keys.unset` `{request}`, `keys.test` `{request}`, `keys.keychain` `{}`, `models.describe` `{}`, `models.discover` `{request}`, `models.custom.set` `{request}`, `models.custom.remove` `{request}`, `cost.get` `{canvasId}`, `prices.describe` `{}`, `prices.set` `{request}`, `board.follow`
 * `{canvasId}`, `board.command` `{canvasId, command}`, `chat.send` `{canvasId, request}`, `agents.control`
 * `{canvasId, request}`, `agents.status` `{canvasId}`, `port.compose` `{canvasId, request}`, `port.regenerateSection` `{canvasId, request}`,
 * `port.saveDoc` `{canvasId, request}`, `port.get` `{canvasId}`, `deck.compose` / `deck.regenerateSlide` / `deck.save` `{canvasId, request}`, `deck.get` / `deck.exportPptx` `{canvasId}`. Every value and stream item is validated with the shared zod schemas.
 */
import {
  AgentControlResult,
  AgentStatus,
  BoardCommandResult,
  BoardFollowFrame,
  CanvasCost,
  CanvasList,
  CanvasMeta,
  PricesDescribeResult,
  type PricesSetArgs,
  CanvasSearchResult,
  ChatSendResult,
  ChatGPTState,
  type ChatGPTAction,
  KeyDescriptor,
  KeychainStatus,
  KeysDescribeResult,
  KeysTestResult,
  ModelsDescribeResult,
  ModelsDiscoverResult,
  ProviderInfo,
  ORB_NAMESPACE,
  OrbPingValue,
  OrbSettings,
  type CanvasSearchArgs,
  type OrbSettingsPatch,
  type AgentControlArgs,
  type BoardCommandRequestInput,
  type CanvasCreateArgs,
  type CanvasCameraArgs,
  type CanvasRenameArgs,
  type ChatSendArgs,
  type KeysDescribeArgs,
  type KeysSetArgs,
  type KeysUnsetArgs,
  type KeysTestArgs,
  type ModelsDiscoverArgs,
  type CustomProviderInput,
  ParallelConfirmResult,
  ParallelStatusResult,
  type ParallelConfirmArgs,
  DeckExportResult,
  DeckGetResult,
  DeckProgress,
  DeckRegenerateResult,
  DeckSaveResult,
  type DeckComposeInput,
  type DeckRegenerateInput,
  type DeckSaveArgs,
  PortGetResult,
  PortProgress,
  PortRegenerateResult,
  PortSaveResult,
  type PortComposeInput,
  type PortSaveArgs,
} from '@orb/shared';
import { z } from 'zod';
import { call } from './call.js';
import type { WireEnv } from './env.js';
import type { MuxClient } from './mux.js';

export type OrbApi = ReturnType<typeof orbApi>;

const opt = (signal?: AbortSignal) => (signal ? { signal } : {});

export function orbApi(env: WireEnv, mux: MuxClient) {
  return {
    chatgpt: {
      describe: (signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'chatgpt.describe', {}, { schema: ChatGPTState, ...opt(signal) }),
      action: (request: ChatGPTAction, signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'chatgpt.action', { request }, { schema: ChatGPTState, ...opt(signal) }),
    },
    ping: (signal?: AbortSignal) =>
      call(env, ORB_NAMESPACE, 'ping', {}, { schema: OrbPingValue, ...opt(signal) }),
    canvas: {
      create: (request: CanvasCreateArgs, signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'canvas.create', { request }, { schema: CanvasMeta, ...opt(signal) }),
      /** Read the canvas and make its root agent live (resuming its persisted session). */
      open: (id: string, signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'canvas.open', { id }, { schema: CanvasMeta, ...opt(signal) }),
      list: (signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'canvas.list', {}, { schema: CanvasList, ...opt(signal) }),
      /** P2.6: full-text search across every canvas (index.sqlite). */
      search: (request: CanvasSearchArgs, signal?: AbortSignal) =>
        call(
          env,
          ORB_NAMESPACE,
          'canvas.search',
          { request },
          { schema: CanvasSearchResult, ...opt(signal) },
        ),
      /** P2.1: rename (title pill); resolves with the rewritten canvas.json. */
      rename: (canvasId: string, request: CanvasRenameArgs, signal?: AbortSignal) =>
        call(
          env,
          ORB_NAMESPACE,
          'canvas.rename',
          { canvasId, request },
          { schema: CanvasMeta, ...opt(signal) },
        ),
      /** P6.20: remember the camera the user left the canvas at (canvas.json `camera`). */
      camera: (canvasId: string, request: CanvasCameraArgs, signal?: AbortSignal) =>
        call(
          env,
          ORB_NAMESPACE,
          'canvas.camera',
          { canvasId, request },
          { schema: CanvasMeta, ...opt(signal) },
        ),
      /** P6.11: start Orb's new-canvas turn on a canvas created with `start: false` (its materials are on the board). */
      start: (canvasId: string, signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'canvas.start', { canvasId }, { schema: CanvasMeta, ...opt(signal) }),
    },
    settings: {
      /** P2.6: app settings from orb.json. */
      get: (signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'settings.get', {}, { schema: OrbSettings, ...opt(signal) }),
      set: (request: OrbSettingsPatch, signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'settings.set', { request }, { schema: OrbSettings, ...opt(signal) }),
    },
    /**
     * P4.1 provider keys. Every answer is a redacted descriptor (`sk-...4f2a`); `set` is the only call that carries a
     * key, once, from the UI to the sidecar.
     */
    keys: {
      describe: (request?: KeysDescribeArgs, signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'keys.describe', request ? { request } : {}, {
          schema: KeysDescribeResult,
          ...opt(signal),
        }),
      set: (request: KeysSetArgs, signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'keys.set', { request }, { schema: KeyDescriptor, ...opt(signal) }),
      unset: (request: KeysUnsetArgs, signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'keys.unset', { request }, { schema: KeyDescriptor, ...opt(signal) }),
      /** P6.2: is the macOS Keychain read done, or waiting on an access prompt? */
      keychain: (signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'keys.keychain', {}, { schema: KeychainStatus, ...opt(signal) }),
      /** P4.2 Test button: a one-token request with the stored key; a plain status, never the key. */
      test: (request: KeysTestArgs, signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'keys.test', { request }, { schema: KeysTestResult, ...opt(signal) }),
    },
    /**
     * P6.7 Parallel: the user's answer to a research run or watch that waits for the cost guard's OK (`confirm`
     * `{request}`), and whether the Parallel key is set (`status` `{}`).
     */
    parallel: {
      confirm: (request: ParallelConfirmArgs, signal?: AbortSignal) =>
        call(
          env,
          ORB_NAMESPACE,
          'parallel.confirm',
          { request },
          { schema: ParallelConfirmResult, ...opt(signal) },
        ),
      status: (signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'parallel.status', {}, { schema: ParallelStatusResult, ...opt(signal) }),
    },
    /** P4.2 model settings: provider cards, custom providers, discovery, per-agent routes, first run. */
    models: {
      describe: (signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'models.describe', {}, { schema: ModelsDescribeResult, ...opt(signal) }),
      discover: (request: ModelsDiscoverArgs, signal?: AbortSignal) =>
        call(
          env,
          ORB_NAMESPACE,
          'models.discover',
          { request },
          { schema: ModelsDiscoverResult, ...opt(signal) },
        ),
      setCustom: (request: CustomProviderInput, signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'models.custom.set', { request }, { schema: ProviderInfo, ...opt(signal) }),
      removeCustom: (id: string, signal?: AbortSignal) =>
        call(
          env,
          ORB_NAMESPACE,
          'models.custom.remove',
          { request: { id } },
          { schema: z.object({ removed: z.literal(true) }), ...opt(signal) },
        ),
    },
    /** P4.3: the canvas token and cost meter, and the editable price table (USD per 1M tokens). */
    cost: {
      get: (canvasId: string, signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'cost.get', { canvasId }, { schema: CanvasCost, ...opt(signal) }),
    },
    prices: {
      describe: (signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'prices.describe', {}, { schema: PricesDescribeResult, ...opt(signal) }),
      set: (request: PricesSetArgs, signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'prices.set', { request }, { schema: PricesDescribeResult, ...opt(signal) }),
    },
    /** P4.5: the research document (compose, regenerate one section, the reading view's edits, read). */
    port: {
      /** Stream of progress: `unread` | `started`, each `section` / `rejected`, then `done` or `failed`. */
      compose: (canvasId: string, request: PortComposeInput, opts: { signal?: AbortSignal } = {}) =>
        mux.open(
          `${ORB_NAMESPACE}/port.compose`,
          { canvasId, request },
          { schema: PortProgress, ...opt(opts.signal) },
        ),
      regenerateSection: (canvasId: string, sectionId: string, signal?: AbortSignal) =>
        call(
          env,
          ORB_NAMESPACE,
          'port.regenerateSection',
          { canvasId, request: { sectionId } },
          { schema: PortRegenerateResult, ...opt(signal) },
        ),
      saveDoc: (canvasId: string, request: PortSaveArgs, signal?: AbortSignal) =>
        call(
          env,
          ORB_NAMESPACE,
          'port.saveDoc',
          { canvasId, request },
          { schema: PortSaveResult, ...opt(signal) },
        ),
      get: (canvasId: string, signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'port.get', { canvasId }, { schema: PortGetResult, ...opt(signal) }),
    },
    /** P6.17: the deck (compose slides, regenerate one, the slide view's edits, read, export .pptx). */
    deck: {
      /** Stream of progress: `unread` | `started`, each `slide` / `rejected`, then `done` or `failed`. */
      compose: (canvasId: string, request: DeckComposeInput, opts: { signal?: AbortSignal } = {}) =>
        mux.open(
          `${ORB_NAMESPACE}/deck.compose`,
          { canvasId, request },
          { schema: DeckProgress, ...opt(opts.signal) },
        ),
      regenerateSlide: (canvasId: string, request: DeckRegenerateInput, signal?: AbortSignal) =>
        call(
          env,
          ORB_NAMESPACE,
          'deck.regenerateSlide',
          { canvasId, request },
          { schema: DeckRegenerateResult, ...opt(signal) },
        ),
      save: (canvasId: string, request: DeckSaveArgs, signal?: AbortSignal) =>
        call(
          env,
          ORB_NAMESPACE,
          'deck.save',
          { canvasId, request },
          { schema: DeckSaveResult, ...opt(signal) },
        ),
      get: (canvasId: string, signal?: AbortSignal) =>
        call(env, ORB_NAMESPACE, 'deck.get', { canvasId }, { schema: DeckGetResult, ...opt(signal) }),
      exportPptx: (canvasId: string, signal?: AbortSignal) =>
        call(
          env,
          ORB_NAMESPACE,
          'deck.exportPptx',
          { canvasId },
          { schema: DeckExportResult, ...opt(signal) },
        ),
    },
    chat: {
      /** Queue a user message for the canvas's root Orb agent; the reply streams on `session/follow`. */
      send: (canvasId: string, request: ChatSendArgs, signal?: AbortSignal) =>
        call(
          env,
          ORB_NAMESPACE,
          'chat.send',
          { canvasId, request },
          { schema: ChatSendResult, ...opt(signal) },
        ),
    },
    agents: {
      /**
       * P1.10/P3.7: `stop` resolves once the agents are idle (or `stop-timeout` after 1 s); `pause` once the paused
       * agents are idle; `resume` and `redirect` once delivered (or queued for a paused agent). The result is the
       * one of the requested action.
       */
      control: <A extends AgentControlArgs['action']>(
        canvasId: string,
        request: AgentControlArgs & { action: A },
        signal?: AbortSignal,
      ) =>
        call(
          env,
          ORB_NAMESPACE,
          'agents.control',
          { canvasId, request },
          { schema: AgentControlResult, ...opt(signal) },
        ) as Promise<Extract<AgentControlResult, { action: A }>>,
      /** The root agent's state now, then each change (running, idle, stopping, stopped, stop-timeout). */
      status: (canvasId: string, opts: { signal?: AbortSignal } = {}) =>
        mux.open(
          `${ORB_NAMESPACE}/agents.status`,
          { canvasId },
          { schema: AgentStatus, ...opt(opts.signal) },
        ),
    },
    board: {
      /**
       * Apply one user command (P2.3 board commands, P2.4 undo/redo); resolves with the events the service wrote and
       * the undo/redo depth.
       */
      command: (canvasId: string, command: BoardCommandRequestInput, signal?: AbortSignal) =>
        call(
          env,
          ORB_NAMESPACE,
          'board.command',
          { canvasId, command },
          { schema: BoardCommandResult, ...opt(signal) },
        ),
      /** Snapshot first, then board events; stays open until the consumer breaks or aborts. */
      follow: (canvasId: string, opts: { signal?: AbortSignal } = {}) =>
        mux.open(
          `${ORB_NAMESPACE}/board.follow`,
          { canvasId },
          { schema: BoardFollowFrame, ...opt(opts.signal) },
        ),
    },
  };
}
