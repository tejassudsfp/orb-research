/**
 * Gateway wire envelopes and errors. Frame shapes are copied from the harness (see README.md for the proofs):
 * unary: `dsh-client-connection/lib/client.js` (createWebConnectionRpc, parseConnectionResponse);
 * mux: `dsh-api-gateway/lib/types/stream-protocol.js` (parseRemoteStreamClientMessage / ServerMessage);
 * `$events`: `dsh-api-gateway/lib/client.js` (parseRemoteEventReady, parseRemoteEventFrame).
 */
import { z } from 'zod';

/** A failure from the gateway, a Remote method, or the transport. `code` is the harness code or `transport/*`. */
export class WireError extends Error {
  override readonly name = 'WireError';
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    /** True when the call may succeed if retried (carrier loss, sidecar restart). */
    readonly retryable = false,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export const isWireError = (e: unknown): e is WireError => e instanceof WireError;

/** Transport-level codes Orb adds next to the harness's `gateway/*`, `session/*`, … codes. */
export const TransportCode = {
  invalidRequest: 'transport/invalid-request',
  http: 'transport/http',
  notFound: 'transport/not-found',
  unauthorized: 'transport/unauthorized',
  forbidden: 'transport/forbidden',
  invalidResponse: 'transport/invalid-response',
  network: 'transport/network',
  disconnected: 'transport/disconnected',
  disposed: 'transport/disposed',
  aborted: 'transport/aborted',
} as const;

/** Body of `POST /api/<ns>/<method>`. */
export type ClientRequest = {
  type: 'client-request';
  rpcId: string;
  method: string;
  payload: { args: unknown };
};

const RemoteFailure = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()),
});
export type RemoteFailure = z.infer<typeof RemoteFailure>;

/** `{type:'server-response', rpcId, result:{ok:true,value}|{ok:false,error}}`. */
export const ServerResponse = z.object({
  type: z.literal('server-response'),
  rpcId: z.string(),
  result: z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value: z.unknown() }),
    z.object({ ok: z.literal(false), error: RemoteFailure }),
  ]),
});

/** Browser → host mux frames. */
export type MuxClientFrame =
  | { type: 'open'; streamId: string; endpoint: string; payload: { args: unknown } }
  | { type: 'item'; streamId: string; value?: unknown }
  | { type: 'end'; streamId: string }
  | { type: 'cancel'; streamId: string };

/** Host → browser mux frames (exact keys, as the harness client checks them). */
export const MuxServerFrame = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('item'), streamId: z.string().min(1), value: z.unknown().optional() }),
  z.strictObject({ type: z.literal('end'), streamId: z.string().min(1) }),
  z.strictObject({ type: z.literal('error'), streamId: z.string().min(1), error: RemoteFailure }),
]);
export type MuxServerFrame = z.infer<typeof MuxServerFrame>;

/** First item of the `$events` stream. */
export const EventsReady = z.strictObject({
  type: z.literal('ready'),
  clientId: z.string().min(1),
  host: z.strictObject({ home: z.string() }),
});
export type EventsReady = z.infer<typeof EventsReady>;

/** Every later `$events` item. */
export const EventsFrame = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('emit'), event: z.string().min(1), args: z.array(z.unknown()) }),
  z.strictObject({
    type: z.literal('waterfall'),
    event: z.string().min(1),
    eventId: z.string().min(1),
    agentId: z.string().min(1),
    request: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({ type: z.literal('cancel'), eventId: z.string().min(1) }),
]);
export type EventsFrame = z.infer<typeof EventsFrame>;

/** Outcome a client posts to `$events/result` for one waterfall. `next` lets the host's default run. */
export type EventsOutcome =
  | { kind: 'next' }
  | { kind: 'result'; value?: unknown }
  | { kind: 'rejected'; error: { name: string; message: string; code?: string; details?: unknown } };

/** Turn a failure envelope into a WireError. */
export function remoteError(failure: RemoteFailure): WireError {
  return new WireError(failure.code, failure.message, failure.details);
}
