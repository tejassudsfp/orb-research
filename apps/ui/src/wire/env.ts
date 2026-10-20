/**
 * Everything the wire touches in its environment, injected so the same code runs in the Orb window and, under
 * Vitest, in Node against a real sidecar (where the auth cookie and `Origin` must be sent by hand).
 */

/** The subset of the WHATWG WebSocket the mux needs. Browser `WebSocket` and the `ws` package both satisfy it. */
export type SocketLike = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (event: any) => void,
    options?: { once?: boolean },
  ): void;
  removeEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: any) => void): void;
};

export const SOCKET_OPEN = 1;

export type WireEnv = {
  /** Absolute base the `api/...` paths resolve against: `document.baseURI` in the window (`http://127.0.0.1:<port>/`). */
  baseUrl: string;
  /** `fetch`. In Node tests it adds the auth cookie and a same-origin `Origin` header. */
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  /** Opens a WebSocket. In Node tests it adds the cookie and `Origin` (browsers add both implicitly). */
  createSocket: (url: string) => SocketLike;
};

/** The environment of the Orb window: same-origin fetch and WebSocket; the gateway's cookie rides along. */
export function browserEnv(): WireEnv {
  return {
    baseUrl: document.baseURI,
    fetch: (input, init) => globalThis.fetch(input, init),
    createSocket: (url) => new WebSocket(url),
  };
}

/** `http(s)://host/base/` + `api/remote.mux` → `ws(s)://host/base/api/remote.mux`. */
export function muxUrl(baseUrl: string): string {
  const url = new URL('api/remote.mux', baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

/** RFC 4122 v4 id. Uses `crypto.randomUUID` when present (secure contexts, Node), else `getRandomValues`. */
export function randomId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
