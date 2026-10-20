/**
 * Contract test: the UI wire (apps/ui/src/wire) against a REAL sidecar (temp homes, Orb profile, dsh under
 * Electron-as-Node) whose default model is the local mock LLM. The env injects the auth cookie and a same-origin
 * `Origin`, which the browser adds by itself.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockedSidecar, type MockedSidecar } from '../../../scripts/testkit/index.ts';
import {
  ReplyTracker,
  TransportCode,
  WireError,
  createWire,
  type SessionFollowFrame,
  type Wire,
  type WireEnv,
} from '../src/wire/index.js';
import { timingExpect } from '../../../scripts/testkit/namespace.ts';

let sc: MockedSidecar;
let env: WireEnv;
let wire: Wire;

beforeAll(async () => {
  sc = await startMockedSidecar();
  env = { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket };
  wire = createWire(env, { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } });
  wire.events.start();
});

afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
});

const expectWireError = async (p: Promise<unknown>, code: string) => {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(WireError);
  expect((err as WireError).code).toBe(code);
  return err as WireError;
};

/** Follow a session in the background, folding frames, until `stop()`. */
function follow(sessionId: string) {
  const ac = new AbortController();
  const tracker = new ReplyTracker();
  const frames: SessionFollowFrame[] = [];
  const waiters = new Set<() => void>();
  const done = (async () => {
    try {
      for await (const frame of wire.session.follow(sessionId, { signal: ac.signal })) {
        frames.push(frame);
        tracker.push(frame);
        for (const w of [...waiters]) w();
      }
    } catch (e) {
      if (!ac.signal.aborted) throw e;
    }
  })();
  const until = (pred: () => boolean, timeoutMs = 20_000) =>
    new Promise<void>((resolve, reject) => {
      if (pred()) return resolve();
      const timer = setTimeout(() => {
        waiters.delete(check);
        reject(
          new Error(`follow: condition not met in ${timeoutMs} ms (state ${JSON.stringify(tracker.state)})`),
        );
      }, timeoutMs);
      const check = () => {
        if (!pred()) return;
        clearTimeout(timer);
        waiters.delete(check);
        resolve();
      };
      waiters.add(check);
    });
  return {
    frames,
    tracker,
    until,
    done,
    stop: async () => {
      ac.abort();
      await done;
    },
  };
}

const chunkFrames = (frames: SessionFollowFrame[]) =>
  frames.filter(
    (f) =>
      f.type === 'assistant-stream' &&
      f.frame.type === 'chunk' &&
      (f.frame.chunk as { type?: string })?.type === 'text-delta',
  );

describe('unary call', () => {
  it('session/list returns a validated value', async () => {
    const value = await wire.session.list();
    expect(Array.isArray(value.items)).toBe(true);
  });

  it('maps a gateway failure envelope to its harness code', async () => {
    // Typed endpoints require every declared parameter (dsh-api-gateway assertExactArguments).
    const err = await expectWireError(wire.call('session', 'create', {}), 'gateway/arguments-invalid');
    expect(err.message).toMatch(/request/);
  });

  it('maps an unknown endpoint (plain HTTP 404) to transport/not-found', async () => {
    const err = await expectWireError(wire.call('session', 'noSuchMethod', {}), TransportCode.notFound);
    expect(err.details).toEqual({ status: 404 });
  });

  it('rejects an invalid endpoint before sending', async () => {
    await expectWireError(wire.call('session', '../file', {}), TransportCode.invalidRequest);
  });

  it('maps a missing cookie to transport/unauthorized and a foreign Origin to transport/forbidden', async () => {
    const noCookie: WireEnv = {
      ...env,
      fetch: (input, init) =>
        fetch(input, { ...init, headers: { ...(init.headers as object), origin: sc.origin } }),
    };
    await expectWireError(createWire(noCookie).session.list(), TransportCode.unauthorized);
    const foreign: WireEnv = {
      ...env,
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          headers: { ...(init.headers as object), cookie: sc.headers.cookie!, origin: 'http://evil.example' },
        }),
    };
    await expectWireError(createWire(foreign).session.list(), TransportCode.forbidden);
  });
});

describe('$events', () => {
  it('opens with a ready frame carrying a clientId', async () => {
    const ready = await wire.events.ready();
    expect(ready.clientId).toMatch(/\S/);
    expect(typeof ready.home).toBe('string');
  });
});

describe('session lifecycle over the wire', () => {
  it('creates a session, prompts it and streams the assistant reply from the mock', async () => {
    const statuses: unknown[][] = [];
    const off = wire.events.on('api-session/status', (...args) => statuses.push(args));

    const created = await wire.session.create();
    expect(created.sessionId).toMatch(/^session-/);
    expect(created.agentPreset).toBe('orb');

    const f = follow(created.sessionId);
    await f.until(() => f.frames.some((fr) => fr.type === 'snapshot'));
    expect(f.frames[0]!.type).toBe('snapshot');

    const reply = 'Streaming works across the gateway wire.';
    sc.llm.enqueue({ text: reply, chunkDelayMs: 30 });
    const accepted = await wire.session.prompt(created.sessionId, 'Say something about the wire.');
    expect(accepted).toEqual({ accepted: true });

    await f.until(() => f.tracker.state.lastTurnEnd === 'completed');
    expect(f.tracker.state.text).toBe(reply);
    expect(f.tracker.state.committed).toEqual([reply]);
    // The reply really streamed: one text-delta frame per mock chunk, before the durable message.
    const deltas = chunkFrames(f.frames);
    expect(deltas.length).toBe(reply.split(' ').length);
    const committedAt = f.frames.findIndex(
      (fr) => fr.type === 'event' && fr.event.type === 'assistant/message',
    );
    expect(f.frames.indexOf(deltas.at(-1)!)).toBeLessThan(committedAt);

    // The mock saw the user's prompt.
    const req = await sc.llm.waitForRequest();
    expect(JSON.stringify(req.body.messages)).toContain('Say something about the wire.');

    // $events forwarded the session's running status (true, then false).
    await expect
      .poll(() => statuses.filter((a) => a[0] === created.sessionId).map((a) => a[1]))
      .toEqual([true, false]);
    off();
    await f.stop();
    expect(wire.mux.activeStreams).toBe(1); // only $events remains
  });

  it('session/cancel stops a long mock stream mid-reply', async () => {
    const { sessionId } = await wire.session.create();
    const f = follow(sessionId);
    await f.until(() => f.frames.some((fr) => fr.type === 'snapshot'));

    const before = sc.llm.requests.length;
    // 200 chunks, 100 ms apart: ~20 s if not cancelled.
    sc.llm.enqueue({ chunks: Array.from({ length: 200 }, (_, i) => `w${i} `), chunkDelayMs: 100 });
    await wire.session.prompt(sessionId, 'Write a very long answer.');
    await f.until(() => chunkFrames(f.frames).length >= 2);

    const t0 = Date.now();
    expect(await wire.session.cancel(sessionId)).toEqual({ accepted: true });
    await f.until(() => f.tracker.state.lastTurnEnd !== undefined, 5_000);
    const elapsed = Date.now() - t0;

    // A cancelled turn ends with reason {kind:'aborted', reason:{kind:'user'}} (dsh-session TurnEndReasonMap).
    expect(f.tracker.state.lastTurnEnd).toBe('aborted');
    expect(f.tracker.state.lastTurnEndReason).toMatchObject({ kind: 'aborted', reason: { kind: 'user' } });
    expect(f.tracker.state.running).toBe(false);
    timingExpect(() => {
      expect(elapsed).toBeLessThan(2_000);
    });
    // The model request was torn down, not streamed to the end.
    const req = sc.llm.requests[before]!;
    await expect.poll(() => req.aborted).toBe(true);
    expect(req.completed).toBe(false);
    expect(req.chunksSent).toBeLessThan(200);
    // The live attempt ended (abandoned or committed as a partial attempt), never left open.
    const ends = f.frames.filter((fr) => fr.type === 'assistant-stream' && fr.frame.type === 'end');
    expect(ends.length).toBe(1);
    // The partial reply is committed as the turn's assistant message.
    expect(f.tracker.state.committed).toHaveLength(1);
    expect(f.tracker.state.committed[0]).toMatch(/^w0 w1 /);

    // The session stays usable: the next prompt runs a normal turn.
    sc.llm.enqueue({ text: 'Back after the cancel.' });
    await wire.session.prompt(sessionId, 'Are you still there?');
    await f.until(() => f.tracker.state.lastTurnEnd === 'completed');
    expect(f.tracker.state.text).toBe('Back after the cancel.');
    await f.stop();
  });
});

describe('mux', () => {
  it('surfaces a host stream error frame as a WireError', async () => {
    const it = wire.stream('session/follow', {});
    await expectWireError(it.next(), 'gateway/arguments-invalid');
  });

  it('cancels a stream when the consumer stops, and keeps the socket usable', async () => {
    const { sessionId } = await wire.session.create();
    for await (const frame of wire.session.follow(sessionId)) {
      expect(frame.type).toBe('snapshot');
      break; // sends {type:'cancel'}
    }
    expect(wire.mux.activeStreams).toBe(1);
    const g = wire.session.follow(sessionId);
    expect((await g.next()).value?.type).toBe('snapshot');
    await g.return();
    expect(wire.mux.activeStreams).toBe(1);
  });

  it('fails active streams as retryable on socket loss, then reconnects', async () => {
    const before = await wire.events.ready();
    const { sessionId } = await wire.session.create();
    const it = wire.session.follow(sessionId);
    expect((await it.next()).value?.type).toBe('snapshot');
    const pending = it.next();
    wire.mux.reconnect();
    const err = await expectWireError(pending, TransportCode.disconnected);
    expect(err.retryable).toBe(true);

    // A new open reconnects the socket; $events re-opens itself with a new clientId.
    const g = wire.session.follow(sessionId);
    expect((await g.next()).value?.type).toBe('snapshot');
    await g.return();
    // (Poll for "ready with a new clientId" as one value: polling the clientId alone passed at once while the
    // status was still `connecting`, since undefined is "not the old id".)
    await expect
      .poll(() => wire.events.status.state === 'ready' && wire.events.status.clientId !== before.clientId)
      .toBe(true);
    expect(wire.events.status.state).toBe('ready');
  });
});
