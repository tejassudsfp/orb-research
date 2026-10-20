/**
 * Listener for the gateway's forwarded Cordis events: the `$events` logical stream on the mux.
 *
 *   open  {type:'open', streamId, endpoint:'$events', payload:{args:{}}}     (args must be exactly {})
 *   item  {type:'ready', clientId, host:{home}}                              first item of every generation
 *   item  {type:'emit', event, args:[...]}                                    broadcast notification
 *   item  {type:'waterfall', event, eventId, agentId, request}               host waits for an outcome
 *   item  {type:'cancel', eventId}                                           host gave up on a waterfall
 *
 * Every waterfall must be answered with `POST /api/$events/result`, args `{clientId, eventId, outcome}`, where
 * outcome is `{kind:'next'}` (let the host default run), `{kind:'result', value?}` or `{kind:'rejected', error}`.
 * The host settles a waterfall when one client returns a result, or when every client has said `next`, so this
 * listener answers `next` for any event without a handler: it must never leave the host waiting.
 *
 * The stream is re-opened with backoff whenever it fails (socket loss, sidecar restart); each generation gets a
 * new `clientId`.
 */
import { call } from './call.js';
import type { WireEnv } from './env.js';
import { backoffDelay, type MuxClient } from './mux.js';
import { EventsFrame, EventsReady, TransportCode, WireError, type EventsOutcome } from './protocol.js';

export type EventsStatus =
  { state: 'stopped' | 'connecting' } | { state: 'ready'; clientId: string; home: string };

export type WaterfallHandler = (
  request: Record<string, unknown>,
  ctx: { agentId: string; signal: AbortSignal },
) => EventsOutcome | Promise<EventsOutcome>;

export type RemoteEventsOptions = {
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  onError?: (error: unknown) => void;
};

export class RemoteEvents {
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  private readonly anyListeners = new Set<(event: string, args: unknown[]) => void>();
  private readonly statusListeners = new Set<(status: EventsStatus) => void>();
  private readonly handlers = new Map<string, WaterfallHandler>();
  private current: EventsStatus = { state: 'stopped' };
  private run?: AbortController;
  private readonly opts: Required<Omit<RemoteEventsOptions, 'onError'>> &
    Pick<RemoteEventsOptions, 'onError'>;

  constructor(
    private readonly env: WireEnv,
    private readonly mux: MuxClient,
    options: RemoteEventsOptions = {},
  ) {
    this.opts = { backoffBaseMs: 250, backoffMaxMs: 10_000, ...options };
  }

  get status(): EventsStatus {
    return this.current;
  }

  /** Listen to one forwarded event (`emit` frames). Returns the disposer. */
  on(event: string, listener: (...args: unknown[]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener);
    return () => set.delete(listener);
  }

  /** Listen to every `emit` frame. */
  onAny(listener: (event: string, args: unknown[]) => void): () => void {
    this.anyListeners.add(listener);
    return () => this.anyListeners.delete(listener);
  }

  onStatus(listener: (status: EventsStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Answer one waterfall event. Unhandled waterfalls are answered `next`. */
  handle(event: string, handler: WaterfallHandler): () => void {
    this.handlers.set(event, handler);
    return () => {
      if (this.handlers.get(event) === handler) this.handlers.delete(event);
    };
  }

  /** Resolves once the current (or next) generation is ready. */
  ready(signal?: AbortSignal): Promise<{ clientId: string; home: string }> {
    const now = this.current;
    if (now.state === 'ready') return Promise.resolve({ clientId: now.clientId, home: now.home });
    return new Promise((resolve, reject) => {
      const off = this.onStatus((s) => {
        if (s.state !== 'ready') return;
        off();
        resolve({ clientId: s.clientId, home: s.home });
      });
      signal?.addEventListener('abort', () => {
        off();
        reject(new WireError(TransportCode.aborted, '$events ready aborted'));
      });
    });
  }

  start(): void {
    if (this.run) return;
    const run = new AbortController();
    this.run = run;
    void this.loop(run.signal);
  }

  stop(): void {
    this.run?.abort();
    this.run = undefined;
    this.setStatus({ state: 'stopped' });
  }

  private setStatus(status: EventsStatus) {
    this.current = status;
    for (const l of [...this.statusListeners]) this.safely(() => l(status));
  }

  private safely(fn: () => void) {
    try {
      fn();
    } catch (error) {
      this.opts.onError?.(error);
    }
  }

  private async loop(signal: AbortSignal) {
    let attempt = 0;
    while (!signal.aborted) {
      this.setStatus({ state: 'connecting' });
      try {
        await this.generation(signal, () => (attempt = 0));
      } catch (error) {
        if (signal.aborted) break;
        this.opts.onError?.(error);
      }
      if (signal.aborted) break;
      attempt++;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, backoffDelay(attempt, this.opts.backoffBaseMs, this.opts.backoffMaxMs));
        signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
      });
    }
  }

  private async generation(signal: AbortSignal, onReady: () => void) {
    const pending = new Map<string, AbortController>();
    const gen = new AbortController();
    const genSignal = AbortSignal.any([signal, gen.signal]);
    let clientId: string | undefined;
    try {
      for await (const value of this.mux.open('$events', {}, { signal: genSignal })) {
        if (clientId === undefined) {
          const ready = EventsReady.parse(value);
          clientId = ready.clientId;
          onReady();
          this.setStatus({ state: 'ready', clientId, home: ready.host.home });
          continue;
        }
        const frame = EventsFrame.parse(value);
        if (frame.type === 'emit') {
          for (const l of [...(this.listeners.get(frame.event) ?? [])]) this.safely(() => l(...frame.args));
          for (const l of [...this.anyListeners]) this.safely(() => l(frame.event, frame.args));
        } else if (frame.type === 'cancel') {
          pending.get(frame.eventId)?.abort();
        } else {
          const ac = new AbortController();
          pending.set(frame.eventId, ac);
          const id = clientId;
          void this.answer(id, frame, AbortSignal.any([genSignal, ac.signal])).finally(() =>
            pending.delete(frame.eventId),
          );
        }
      }
      throw new WireError(TransportCode.disconnected, '$events stream ended', {}, true);
    } finally {
      gen.abort();
      for (const ac of pending.values()) ac.abort();
    }
  }

  private async answer(
    clientId: string,
    frame: { event: string; eventId: string; agentId: string; request: Record<string, unknown> },
    signal: AbortSignal,
  ) {
    const handler = this.handlers.get(frame.event);
    let outcome: EventsOutcome = { kind: 'next' };
    if (handler) {
      try {
        outcome = await handler(frame.request, { agentId: frame.agentId, signal });
      } catch (error) {
        const e = error as { name?: unknown; message?: unknown; code?: unknown };
        outcome = {
          kind: 'rejected',
          error: {
            name: typeof e?.name === 'string' && e.name ? e.name : 'Error',
            message: typeof e?.message === 'string' ? e.message : String(error),
            ...(typeof e?.code === 'string' ? { code: e.code } : {}),
          },
        };
      }
    }
    if (signal.aborted) return;
    try {
      await call(this.env, '$events', 'result', { clientId, eventId: frame.eventId, outcome }, { signal });
    } catch (error) {
      if (!signal.aborted) this.opts.onError?.(error);
    }
  }
}
