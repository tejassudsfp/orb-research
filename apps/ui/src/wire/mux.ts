/**
 * Client for the gateway's multiplexed Remote stream socket, `WS /api/remote.mux`. One physical socket carries
 * any number of logical streams, each named by a client-minted `streamId`:
 *
 *   client → host  {type:'open', streamId, endpoint:'ns/method', payload:{args}}
 *                  {type:'item', streamId, value?}   uplink item (streams that read the client's uplink)
 *                  {type:'end', streamId}            uplink finished
 *                  {type:'cancel', streamId}         stop the stream (host aborts the method's signal)
 *   host → client  {type:'item', streamId, value?}   one yielded value
 *                  {type:'end', streamId}            the method's iterable finished
 *                  {type:'error', streamId, error:{code,message,details}}
 *
 * Text frames only. The host sends WebSocket Ping control frames and drops a socket after 2 missed pongs;
 * browsers (and `ws`) answer pings automatically, so there is no application-level heartbeat.
 * After `cancel` the host sends nothing more for that stream (no `end`), and frames for unknown ids are dropped.
 * A duplicate `open` id closes the socket (1008). See README.md for the harness proofs.
 *
 * Reconnect: the socket is opened lazily by the first `open()`, and re-opened (with backoff) by the next `open()`
 * after a loss. A loss fails every active stream with a retryable `transport/disconnected` WireError; long-lived
 * consumers (e.g. RemoteEvents, follow loops) re-open their stream, which reconnects the socket.
 */
import type { ZodType } from 'zod';
import { SOCKET_OPEN, muxUrl, randomId, type SocketLike, type WireEnv } from './env.js';
import { MuxServerFrame, TransportCode, WireError, remoteError, type MuxClientFrame } from './protocol.js';

export type MuxState = 'idle' | 'connecting' | 'open' | 'disposed';

export type MuxOptions = {
  /** Backoff before reconnect attempt n is `min(max, base * 2^(n-1))` with ±50 % jitter. */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** A socket that has not opened by then counts as a failed attempt. */
  connectTimeoutMs?: number;
};

export type OpenOptions<T> = {
  signal?: AbortSignal;
  /** Validates every item; a mismatch fails the stream (and cancels it on the host). */
  schema?: ZodType<T>;
  /** Client items sent as `item` frames, followed by `end`. */
  uplink?: AsyncIterable<unknown>;
};

type Frame = MuxServerFrame;

/** Single-consumer queue of host frames for one logical stream. */
class Inbox {
  private readonly frames: Frame[] = [];
  private wake?: () => void;
  private failure?: Error;
  push(frame: Frame) {
    if (this.failure) return;
    this.frames.push(frame);
    this.wake?.();
  }
  fail(error: Error) {
    if (this.failure) return;
    this.failure = error;
    this.frames.length = 0;
    this.wake?.();
  }
  async next(): Promise<Frame> {
    for (;;) {
      if (this.failure) throw this.failure;
      const frame = this.frames.shift();
      if (frame) return frame;
      await new Promise<void>((resolve) => (this.wake = resolve));
      this.wake = undefined;
    }
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(t);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const t = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });

export function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  const cap = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return cap / 2 + Math.random() * (cap / 2);
}

const aborted = (signal: AbortSignal | undefined, what: string) =>
  new WireError(TransportCode.aborted, `${what} aborted`, {}, false, { cause: signal?.reason });

export class MuxClient {
  private socket?: SocketLike;
  private connecting?: Promise<SocketLike>;
  private readonly streams = new Map<string, { inbox: Inbox; socket: SocketLike }>();
  private readonly stateListeners = new Set<(state: MuxState) => void>();
  private current: MuxState = 'idle';
  private readonly disposeController = new AbortController();
  private readonly opts: Required<MuxOptions>;

  constructor(
    private readonly env: WireEnv,
    options: MuxOptions = {},
  ) {
    this.opts = { backoffBaseMs: 250, backoffMaxMs: 10_000, connectTimeoutMs: 10_000, ...options };
  }

  get state(): MuxState {
    return this.current;
  }

  /** Number of logical streams currently open on this client. */
  get activeStreams(): number {
    return this.streams.size;
  }

  onState(listener: (state: MuxState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private setState(state: MuxState) {
    if (this.current === state || this.current === 'disposed') return;
    this.current = state;
    for (const l of [...this.stateListeners]) {
      try {
        l(state);
      } catch {
        // A listener's failure never affects the carrier.
      }
    }
  }

  /**
   * Open one logical stream. Iterate it to receive the method's items; breaking out of the loop, or aborting
   * `signal`, sends `cancel`. Rejects with the host's error (`frame.error.code`), `transport/disconnected`
   * (retryable) on socket loss, or `transport/aborted`.
   */
  async *open<T = unknown>(
    endpoint: string,
    args: unknown,
    options: OpenOptions<T> = {},
  ): AsyncGenerator<T, void, undefined> {
    const { signal, schema, uplink } = options;
    if (signal?.aborted) throw aborted(signal, endpoint);
    const socket = await this.acquire(signal);
    if (signal?.aborted) throw aborted(signal, endpoint);
    const streamId = randomId();
    const inbox = new Inbox();
    const onAbort = () => inbox.fail(aborted(signal, endpoint));
    signal?.addEventListener('abort', onAbort, { once: true });
    this.streams.set(streamId, { inbox, socket });
    const uplinkStop = new AbortController();
    let terminal = false;
    try {
      this.send(socket, { type: 'open', streamId, endpoint, payload: { args } });
      if (uplink) void this.pumpUplink(socket, streamId, uplink, uplinkStop.signal, inbox);
      for (;;) {
        const frame = await inbox.next();
        if (frame.type === 'item') {
          if (!schema) {
            yield frame.value as T;
            continue;
          }
          const parsed = schema.safeParse(frame.value);
          if (!parsed.success) {
            throw new WireError(TransportCode.invalidResponse, `${endpoint}: unexpected stream item shape`, {
              issues: parsed.error.issues,
            });
          }
          yield parsed.data;
          continue;
        }
        terminal = true;
        if (frame.type === 'error') throw remoteError(frame.error);
        return;
      }
    } finally {
      signal?.removeEventListener('abort', onAbort);
      uplinkStop.abort();
      this.streams.delete(streamId);
      if (!terminal && this.socket === socket && socket.readyState === SOCKET_OPEN)
        this.send(socket, { type: 'cancel', streamId });
    }
  }

  /** Drop the current socket (failing its streams as retryable) so the next `open()` connects afresh. */
  reconnect(): void {
    const socket = this.socket;
    if (!socket) return;
    this.lost(socket, new WireError(TransportCode.disconnected, 'mux reconnect requested', {}, true));
    socket.close(4000, 'reconnect requested');
  }

  /** Close the socket for good and fail every stream. */
  dispose(): void {
    if (this.current === 'disposed') return;
    this.disposeController.abort();
    const socket = this.socket;
    this.socket = undefined;
    const error = new WireError(TransportCode.disposed, 'mux client disposed');
    for (const s of this.streams.values()) s.inbox.fail(error);
    this.setState('disposed');
    socket?.close(1000, 'disposed');
  }

  private async pumpUplink(
    socket: SocketLike,
    streamId: string,
    uplink: AsyncIterable<unknown>,
    stop: AbortSignal,
    inbox: Inbox,
  ) {
    try {
      for await (const value of uplink) {
        if (stop.aborted || this.socket !== socket) return;
        this.send(
          socket,
          value === undefined ? { type: 'item', streamId } : { type: 'item', streamId, value },
        );
      }
      if (!stop.aborted && this.socket === socket) this.send(socket, { type: 'end', streamId });
    } catch (error) {
      inbox.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private send(socket: SocketLike, frame: MuxClientFrame) {
    socket.send(JSON.stringify(frame));
  }

  /** The open socket, connecting (with backoff between failed attempts) when there is none. */
  private acquire(signal?: AbortSignal): Promise<SocketLike> {
    if (this.current === 'disposed')
      return Promise.reject(new WireError(TransportCode.disposed, 'mux client disposed'));
    if (this.socket && this.socket.readyState === SOCKET_OPEN) return Promise.resolve(this.socket);
    this.connecting ??= this.connectLoop().finally(() => (this.connecting = undefined));
    if (!signal) return this.connecting;
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(aborted(signal, 'mux connect'));
      signal.addEventListener('abort', onAbort, { once: true });
      this.connecting!.then(
        (s) => {
          signal.removeEventListener('abort', onAbort);
          resolve(s);
        },
        (e) => {
          signal.removeEventListener('abort', onAbort);
          reject(e);
        },
      );
    });
  }

  private async connectLoop(): Promise<SocketLike> {
    const dispose = this.disposeController.signal;
    for (let attempt = 1; ; attempt++) {
      if (dispose.aborted) throw new WireError(TransportCode.disposed, 'mux client disposed');
      this.setState('connecting');
      try {
        const socket = await this.connectOnce();
        if (dispose.aborted) {
          socket.close(1000, 'disposed');
          throw new WireError(TransportCode.disposed, 'mux client disposed');
        }
        this.socket = socket;
        this.setState('open');
        return socket;
      } catch (error) {
        if (error instanceof WireError && error.code === TransportCode.disposed) throw error;
        await sleep(backoffDelay(attempt, this.opts.backoffBaseMs, this.opts.backoffMaxMs), dispose);
      }
    }
  }

  private connectOnce(): Promise<SocketLike> {
    return new Promise((resolve, reject) => {
      let socket: SocketLike;
      try {
        socket = this.env.createSocket(muxUrl(this.env.baseUrl));
      } catch (cause) {
        reject(new WireError(TransportCode.network, 'mux socket could not be created', {}, true, { cause }));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => fail('mux socket open timed out'), this.opts.connectTimeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        socket.removeEventListener('open', opened);
        socket.removeEventListener('error', errored);
        socket.removeEventListener('close', closedEarly);
      };
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          socket.close();
        } catch {
          // already closed
        }
        reject(new WireError(TransportCode.network, message, {}, true));
      };
      const errored = () => fail('mux socket failed to open');
      const closedEarly = () => fail('mux socket closed before opening');
      const opened = () => {
        if (settled) return;
        settled = true;
        cleanup();
        socket.addEventListener('message', (event: { data: unknown }) => this.receive(socket, event.data));
        socket.addEventListener('close', () =>
          this.lost(socket, new WireError(TransportCode.disconnected, 'mux socket closed', {}, true)),
        );
        socket.addEventListener('error', () =>
          this.lost(socket, new WireError(TransportCode.disconnected, 'mux socket failed', {}, true)),
        );
        resolve(socket);
      };
      socket.addEventListener('open', opened);
      socket.addEventListener('error', errored);
      socket.addEventListener('close', closedEarly);
    });
  }

  private receive(socket: SocketLike, data: unknown) {
    if (socket !== this.socket) return;
    let frame: Frame;
    try {
      if (typeof data !== 'string') throw new Error('binary frame');
      frame = MuxServerFrame.parse(JSON.parse(data));
    } catch (cause) {
      // Mirrors the harness client: an invalid frame poisons the carrier.
      this.lost(
        socket,
        new WireError(TransportCode.invalidResponse, 'invalid mux frame', {}, true, { cause }),
      );
      socket.close(4002, 'invalid Remote stream frame');
      return;
    }
    this.streams.get(frame.streamId)?.inbox.push(frame);
  }

  private lost(socket: SocketLike, error: WireError) {
    if (socket !== this.socket) return;
    this.socket = undefined;
    for (const s of this.streams.values()) if (s.socket === socket) s.inbox.fail(error);
    this.setState('idle');
  }
}
