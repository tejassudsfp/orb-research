/** Wire edge cases that a healthy sidecar never produces: fake fetch and fake sockets. */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MuxClient,
  RemoteEvents,
  TransportCode,
  WireError,
  call,
  muxUrl,
  type SocketLike,
  type WireEnv,
} from '../src/wire/index.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const envWith = (respond: (body: any) => Response | Promise<Response>): WireEnv => ({
  baseUrl: 'http://127.0.0.1:9/',
  fetch: async (_input, init) => respond(JSON.parse(String(init.body))),
  createSocket: () => {
    throw new Error('no sockets here');
  },
});

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (e: unknown) => (e instanceof WireError ? e.code : `other: ${String(e)}`),
  );

describe('call', () => {
  it('sends the client-request envelope to api/<ns>/<method>', async () => {
    let seen: { url?: string; body?: any } = {};
    const env: WireEnv = {
      ...envWith(() => json({})),
      fetch: async (input, init) => {
        const body = JSON.parse(String(init.body));
        seen = { url: input, body };
        return json({ type: 'server-response', rpcId: body.rpcId, result: { ok: true, value: { a: 1 } } });
      },
    };
    expect(await call(env, 'orb', 'ping', { x: 1 }, { schema: z.object({ a: z.number() }) })).toEqual({
      a: 1,
    });
    expect(seen.url).toBe('http://127.0.0.1:9/api/orb/ping');
    expect(seen.body).toMatchObject({
      type: 'client-request',
      method: 'orb/ping',
      payload: { args: { x: 1 } },
    });
    expect(seen.body.rpcId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('maps envelope problems to transport codes', async () => {
    expect(
      await codeOf(
        call(
          envWith(() => json({ nope: true })),
          'a',
          'b',
          {},
        ),
      ),
    ).toBe(TransportCode.invalidResponse);
    expect(
      await codeOf(
        call(
          envWith(() => json({ type: 'server-response', rpcId: 'other', result: { ok: true, value: 1 } })),
          'a',
          'b',
          {},
        ),
      ),
    ).toBe(TransportCode.invalidResponse);
    const ok = (b: any) =>
      json({ type: 'server-response', rpcId: b.rpcId, result: { ok: true, value: 'str' } });
    expect(await codeOf(call(envWith(ok), 'a', 'b', {}, { schema: z.number() }))).toBe(
      TransportCode.invalidResponse,
    );
    expect(
      await codeOf(
        call(
          envWith(() => new Response('boom', { status: 500 })),
          'a',
          'b',
          {},
        ),
      ),
    ).toBe(TransportCode.http);
    expect(
      await codeOf(
        call(
          envWith(() => {
            throw new TypeError('fetch failed');
          }),
          'a',
          'b',
          {},
        ),
      ),
    ).toBe(TransportCode.network);
  });

  it('passes harness failure codes through', async () => {
    const fail = (b: any) =>
      json({
        type: 'server-response',
        rpcId: b.rpcId,
        result: { ok: false, error: { code: 'session/not-found', message: 'x', details: { id: 1 } } },
      });
    const err = await call(envWith(fail), 'session', 'cancel', {}).catch((e: WireError) => e);
    expect(err).toMatchObject({ code: 'session/not-found', details: { id: 1 }, retryable: false });
  });
});

/** A scripted socket: records sent frames; the test pushes host frames. */
class FakeSocket implements SocketLike {
  readyState = 0;
  sent: any[] = [];
  private listeners = new Map<string, Set<(e: any) => void>>();
  constructor() {
    queueMicrotask(() => {
      this.readyState = 1;
      this.emit('open', {});
    });
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close', {});
  }
  addEventListener(type: string, l: (e: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(l);
  }
  removeEventListener(type: string, l: (e: any) => void) {
    this.listeners.get(type)?.delete(l);
  }
  emit(type: string, e: any) {
    for (const l of [...(this.listeners.get(type) ?? [])]) l(e);
  }
  host(frame: unknown) {
    this.emit('message', { data: typeof frame === 'string' ? frame : JSON.stringify(frame) });
  }
}

describe('MuxClient', () => {
  const setup = () => {
    const sockets: FakeSocket[] = [];
    const env: WireEnv = {
      ...envWith(() => json({})),
      createSocket: () => (sockets.push(new FakeSocket()), sockets.at(-1)!),
    };
    return { sockets, mux: new MuxClient(env, { backoffBaseMs: 1 }) };
  };
  const tick = () => new Promise((r) => setTimeout(r, 5));

  it('derives the ws URL from the base URL', () => {
    expect(muxUrl('http://127.0.0.1:5/')).toBe('ws://127.0.0.1:5/api/remote.mux');
    expect(muxUrl('https://h/x/')).toBe('wss://h/x/api/remote.mux');
  });

  it('opens, yields items, ends, and drops frames for unknown streams', async () => {
    const { sockets, mux } = setup();
    const it = mux.open('ns/s', { a: 1 });
    const first = it.next();
    await tick();
    const s = sockets[0]!;
    const open = s.sent[0];
    expect(open).toMatchObject({ type: 'open', endpoint: 'ns/s', payload: { args: { a: 1 } } });
    s.host({ type: 'item', streamId: 'someone-else', value: 0 });
    s.host({ type: 'item', streamId: open.streamId, value: 1 });
    expect((await first).value).toBe(1);
    s.host({ type: 'end', streamId: open.streamId });
    expect((await it.next()).done).toBe(true);
    expect(s.sent.filter((f) => f.type === 'cancel')).toEqual([]);
    expect(mux.activeStreams).toBe(0);
  });

  it('sends cancel when the signal aborts', async () => {
    const { sockets, mux } = setup();
    const ac = new AbortController();
    const it = mux.open('ns/s', {}, { signal: ac.signal });
    const next = it.next();
    await tick();
    ac.abort();
    expect(await codeOf(next)).toBe(TransportCode.aborted);
    expect(sockets[0]!.sent.at(-1)).toEqual({ type: 'cancel', streamId: sockets[0]!.sent[0].streamId });
  });

  it('sends uplink items then end', async () => {
    const { sockets, mux } = setup();
    async function* up() {
      yield 'a';
      yield 'b';
    }
    const it = mux.open('ns/s', {}, { uplink: up() });
    const next = it.next();
    await tick();
    const s = sockets[0]!;
    const id = s.sent[0].streamId;
    expect(s.sent.slice(1)).toEqual([
      { type: 'item', streamId: id, value: 'a' },
      { type: 'item', streamId: id, value: 'b' },
      { type: 'end', streamId: id },
    ]);
    s.host({ type: 'end', streamId: id });
    expect((await next).done).toBe(true);
  });

  it('an invalid host frame poisons the socket; the next open reconnects', async () => {
    const { sockets, mux } = setup();
    const next = mux.open('ns/s', {}).next();
    await tick();
    sockets[0]!.host({ type: 'item', streamId: 'x', extra: true });
    expect(await codeOf(next)).toBe(TransportCode.invalidResponse);
    expect(sockets[0]!.readyState).toBe(3);
    const again = mux.open('ns/s', {});
    const p = again.next();
    await tick();
    expect(sockets).toHaveLength(2);
    sockets[1]!.host({
      type: 'error',
      streamId: sockets[1]!.sent[0].streamId,
      error: { code: 'gateway/x', message: 'm', details: {} },
    });
    expect(await codeOf(p)).toBe('gateway/x');
  });

  it('fails streams as retryable when the socket closes', async () => {
    const { sockets, mux } = setup();
    const next = mux.open('ns/s', {}).next();
    await tick();
    sockets[0]!.close();
    const err = await next.catch((e: WireError) => e);
    expect(err).toMatchObject({ code: TransportCode.disconnected, retryable: true });
    expect(mux.state).toBe('idle');
  });
});

describe('RemoteEvents', () => {
  /** A mux over fake sockets plus a fetch that records `$events/result` posts. */
  const setup = () => {
    const sockets: FakeSocket[] = [];
    const posts: { url: string; body: any }[] = [];
    const env: WireEnv = {
      baseUrl: 'http://127.0.0.1:9/',
      fetch: async (input, init) => {
        const body = JSON.parse(String(init.body));
        posts.push({ url: input, body });
        return json({ type: 'server-response', rpcId: body.rpcId, result: { ok: true } });
      },
      createSocket: () => (sockets.push(new FakeSocket()), sockets.at(-1)!),
    };
    const mux = new MuxClient(env, { backoffBaseMs: 1 });
    const events = new RemoteEvents(env, mux, { backoffBaseMs: 1 });
    return { sockets, posts, mux, events };
  };
  const tick = () => new Promise((r) => setTimeout(r, 5));

  it('opens $events with empty args, dispatches emits, and answers every waterfall', async () => {
    const { sockets, posts, mux, events } = setup();
    events.start();
    await tick();
    const s = sockets[0]!;
    const open = s.sent[0];
    expect(open).toEqual({
      type: 'open',
      streamId: open.streamId,
      endpoint: '$events',
      payload: { args: {} },
    });
    const item = (value: unknown) => s.host({ type: 'item', streamId: open.streamId, value });
    item({ type: 'ready', clientId: 'c1', host: { home: '/h' } });
    expect(await events.ready()).toEqual({ clientId: 'c1', home: '/h' });

    const seen: unknown[][] = [];
    events.on('api-session/status', (...args) => seen.push(args));
    item({ type: 'emit', event: 'api-session/status', args: ['s1', true] });
    await tick();
    expect(seen).toEqual([['s1', true]]);

    events.handle('ask', (request) => ({ kind: 'result', value: { echo: request.q } }));
    events.handle('boom', () => {
      throw Object.assign(new Error('nope'), { code: 'orb/x' });
    });
    const wf = (event: string, eventId: string) =>
      item({ type: 'waterfall', event, eventId, agentId: 'a1', request: { q: 1 } });
    wf('unhandled', 'e1');
    wf('ask', 'e2');
    wf('boom', 'e3');
    await tick();
    const results = posts.filter((p) => p.url === 'http://127.0.0.1:9/api/$events/result');
    const byId = Object.fromEntries(results.map((p) => [p.body.payload.args.eventId, p.body]));
    for (const b of Object.values(byId) as any[]) {
      expect(b).toMatchObject({ type: 'client-request', method: '$events/result' });
      expect(Object.keys(b.payload.args).sort()).toEqual(['clientId', 'eventId', 'outcome']);
      expect(b.payload.args.clientId).toBe('c1');
    }
    expect(byId.e1.payload.args.outcome).toEqual({ kind: 'next' });
    expect(byId.e2.payload.args.outcome).toEqual({ kind: 'result', value: { echo: 1 } });
    expect(byId.e3.payload.args.outcome).toEqual({
      kind: 'rejected',
      error: { name: 'Error', message: 'nope', code: 'orb/x' },
    });

    // Socket loss: the stream re-opens on a new socket and a new generation.
    s.close();
    await tick();
    await tick();
    expect(sockets).toHaveLength(2);
    expect(sockets[1]!.sent[0]).toMatchObject({ type: 'open', endpoint: '$events' });
    events.stop();
    mux.dispose();
  });
});
