/**
 * Orb's gateway client. `createWire(browserEnv())` in the window; tests pass an env that adds the auth cookie and
 * `Origin` (scripts/testkit). Frame shapes and proofs: README.md.
 */
import { assetsApi } from './assets.js';
import { dataApi } from './data.js';
import { call, type CallOptions } from './call.js';
import type { WireEnv } from './env.js';
import { RemoteEvents, type RemoteEventsOptions } from './events.js';
import { MuxClient, type MuxOptions } from './mux.js';
import { orbApi } from './orb.js';
import { sessionApi } from './session.js';

export * from './assets.js';
export * from './data.js';
export * from './call.js';
export * from './env.js';
export * from './events.js';
export * from './mux.js';
export * from './orb.js';
export * from './protocol.js';
export * from './session.js';
export type {
  AssistantStreamFrame,
  SessionCreateValue,
  SessionFollowFrame,
  SessionWireEvent,
  BoardFollowFrame,
  CanvasMeta,
  OrbPingValue,
  AgentStatus,
  AgentControlResult,
} from '@orb/shared';

export type Wire = ReturnType<typeof createWire>;

export function createWire(env: WireEnv, options: { mux?: MuxOptions; events?: RemoteEventsOptions } = {}) {
  const mux = new MuxClient(env, options.mux);
  const events = new RemoteEvents(env, mux, options.events);
  return {
    env,
    mux,
    events,
    call: <T = unknown>(ns: string, method: string, args: unknown, opts?: CallOptions<T>) =>
      call<T>(env, ns, method, args, opts),
    stream: mux.open.bind(mux),
    session: sessionApi(env, mux),
    orb: orbApi(env, mux),
    assets: assetsApi(env),
    data: dataApi(env),
    dispose() {
      events.stop();
      mux.dispose();
    },
  };
}
