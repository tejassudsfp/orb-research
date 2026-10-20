/**
 * Unary gateway calls: `POST /api/<ns>/<method>` with `{type:'client-request', rpcId, method:'<ns>/<method>',
 * payload:{args}}`. `args` is keyed by the Remote method's PARAMETER NAMES (the harness session controller's
 * parameter is `request`, so `session/create` takes `{request: {...}}`; `session/list` takes `{_request: {}}`).
 */
import type { ZodType } from 'zod';
import { randomId, type WireEnv } from './env.js';
import { ServerResponse, TransportCode, WireError, remoteError, type ClientRequest } from './protocol.js';

/** Endpoint segment rule from `dsh-client-connection/lib/client.js` (ENDPOINT_SEGMENT_PATTERN). */
const SEGMENT = /^[A-Za-z0-9_$.-]+$/;

export function endpointOf(ns: string, method: string): string {
  const endpoint = `${ns}/${method}`;
  if (endpoint.split('/').some((s) => s === '' || s === '.' || s === '..' || !SEGMENT.test(s))) {
    throw new WireError(TransportCode.invalidRequest, `invalid endpoint ${JSON.stringify(endpoint)}`);
  }
  return endpoint;
}

export type CallOptions<T> = {
  /** Validates the success value. Without it the value is returned unchecked. */
  schema?: ZodType<T>;
  signal?: AbortSignal;
};

function httpError(status: number, endpoint: string): WireError {
  // The gateway answers these with a plain-text body, no envelope (dsh-client-connection/lib/index.js):
  // 401 no/expired cookie and 403 Origin/Host fence (requestRejection), 404 no Remote endpoint of that name
  // (createSharedFetchHandler), 415/400 bad body, 500 handler crash.
  const code =
    status === 401
      ? TransportCode.unauthorized
      : status === 403
        ? TransportCode.forbidden
        : status === 404
          ? TransportCode.notFound
          : TransportCode.http;
  return new WireError(code, `HTTP ${status} from ${endpoint}`, { status }, status >= 500);
}

/**
 * Call one unary Remote method. Resolves with the (optionally zod-validated) value; rejects with a WireError
 * carrying the harness error code (`gateway/arguments-invalid`, `session/...`) or a `transport/*` code.
 */
export async function call<T = unknown>(
  env: WireEnv,
  ns: string,
  method: string,
  args: unknown,
  options: CallOptions<T> = {},
): Promise<T> {
  const endpoint = endpointOf(ns, method);
  const rpcId = randomId();
  const body: ClientRequest = { type: 'client-request', rpcId, method: endpoint, payload: { args } };
  let response: Response;
  try {
    response = await env.fetch(new URL(`api/${endpoint}`, env.baseUrl).href, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    if (options.signal?.aborted)
      throw new WireError(TransportCode.aborted, `${endpoint} aborted`, {}, false, { cause });
    throw new WireError(
      TransportCode.network,
      `${endpoint}: ${(cause as Error)?.message ?? 'network error'}`,
      {},
      true,
      { cause },
    );
  }
  if (!response.ok) throw httpError(response.status, endpoint);

  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    throw new WireError(TransportCode.invalidResponse, `${endpoint}: response is not JSON`, {}, false, {
      cause,
    });
  }
  const envelope = ServerResponse.safeParse(json);
  if (!envelope.success)
    throw new WireError(TransportCode.invalidResponse, `${endpoint}: invalid server-response envelope`, {
      issues: envelope.error.issues,
    });
  if (envelope.data.rpcId !== rpcId)
    throw new WireError(TransportCode.invalidResponse, `${endpoint}: rpcId mismatch`);
  const result = envelope.data.result;
  if (!result.ok) throw remoteError(result.error);
  if (!options.schema) return result.value as T;
  const parsed = options.schema.safeParse(result.value);
  if (!parsed.success)
    throw new WireError(TransportCode.invalidResponse, `${endpoint}: unexpected value shape`, {
      issues: parsed.error.issues,
    });
  return parsed.data;
}
