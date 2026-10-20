/**
 * The main ↔ sidecar control channel (BUILD_PLAN P3.5; protocol in packages/shared/src/control.ts).
 *
 * Main listens on 127.0.0.1 (random port) before it spawns the sidecar and hands it `ORB_CONTROL_URL` and a
 * per-launch `ORB_CONTROL_SECRET` (32 random bytes). The only route is `POST /capture`. A request is served only
 * when every check passes: loopback peer, `Host` exactly `127.0.0.1:<port>` (a DNS-rebound name in a browser would
 * carry its own host), no `Origin` and no `Sec-Fetch-*` header (browsers always send them on cross-origin fetches,
 * and a page can never set them away), `Content-Type: application/json`, a body of at most 8 KB, and the bearer
 * secret (constant-time compare). One capture runs at a time; a few may wait; the rest get 429.
 *
 * The secret is never logged; log lines name the URL's origin only. No Electron import here: the capture itself is
 * injected (capture.ts), so Vitest drives this server directly.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  CAPTURE,
  CONTROL_CAPTURE_PATH,
  CONTROL_INFO_HEADER,
  CONTROL_MAX_BODY,
  CONTROL_SECRET_ENV,
  CONTROL_SIGNED_IN_PATH,
  CONTROL_URL_ENV,
  CaptureRequest,
  SIGNED_IN,
  SignedInRequest,
  BROWSER,
  BrowserRequest,
  BrowserAnswer,
  CONTROL_BROWSE_PATH,
  type CaptureInfo,
  type SignedInAnswer,
} from '@orb/shared';

export type CaptureFn = (url: string, signal: AbortSignal) => Promise<{ png: Buffer; info: CaptureInfo }>;

/** A failure with a code the sidecar can show the model. */
export class ControlError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * P6.10 signed-in fetch. `authorize` (rate limit, connected-domain check, the user's approval) runs outside the
 * one-at-a-time queue and its timeout, because a person may take a while to answer; `fetch` runs inside it.
 */
export type SignedInHandler = {
  authorize(req: SignedInRequest, signal: AbortSignal): Promise<void>;
  fetch(req: SignedInRequest, signal: AbortSignal): Promise<SignedInAnswer>;
};

export type ControlServerOptions = {
  capture: CaptureFn;
  /** OAuth URLs are sent only by the authenticated sidecar, never back through the renderer. */
  openChatGPT?: (url: string) => Promise<void>;
  signedIn?: SignedInHandler;
  browse?: (request: BrowserRequest, signal: AbortSignal) => Promise<BrowserAnswer>;
  /** Checks the URL before a capture starts (throws ControlError 400/403). */
  checkUrl?: (url: string) => void;
  log?: (line: string) => void;
  /** Captures that may wait behind the running one. Default 3. */
  maxQueue?: number;
};

export type ControlServer = {
  /** `http://127.0.0.1:<port>`. */
  url: string;
  port: number;
  /** The variables to pass to the sidecar. */
  env: Record<string, string>;
  close(): Promise<void>;
};

const LOOPBACK = new Set(['127.0.0.1', '::ffff:127.0.0.1', '::1']);

const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return '(invalid url)';
  }
};

function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  const body = JSON.stringify({ error: { code, message: message.slice(0, 500) } });
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    connection: 'close',
  });
  res.end(body);
}

/** Start the control server on 127.0.0.1 with a new secret. */
export async function startControlServer(options: ControlServerOptions): Promise<ControlServer> {
  const secret = randomBytes(32).toString('hex');
  const expected = Buffer.from(`Bearer ${secret}`);
  const maxQueue = options.maxQueue ?? 3;
  let port = 0;
  let queued = 0;
  let chain: Promise<unknown> = Promise.resolve();
  const inflight = new Set<AbortController>();

  const refuse = (req: IncomingMessage): [number, string, string] | undefined => {
    if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) return [403, 'FORBIDDEN', 'loopback only'];
    if (req.headers.host !== `127.0.0.1:${port}`) return [403, 'FORBIDDEN', 'bad host'];
    if (req.headers.origin !== undefined || Object.keys(req.headers).some((h) => h.startsWith('sec-fetch-')))
      return [403, 'FORBIDDEN', 'browser requests are not accepted'];
    const auth = Buffer.from(String(req.headers.authorization ?? ''));
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected))
      return [401, 'UNAUTHORIZED', 'bad secret'];
    if (
      req.method !== 'POST' ||
      ![CONTROL_CAPTURE_PATH, CONTROL_SIGNED_IN_PATH, CONTROL_BROWSE_PATH, '/chatgpt/open'].includes(
        req.url ?? '',
      )
    )
      return [404, 'NOT_FOUND', 'no such route'];
    if ((req.headers['content-type'] ?? '').split(';', 1)[0]!.trim() !== 'application/json')
      return [415, 'UNSUPPORTED', 'JSON only'];
    return undefined;
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const refused = refuse(req);
    if (refused) {
      req.resume();
      sendError(res, ...refused);
      return;
    }
    let raw = '';
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > CONTROL_MAX_BODY) {
        sendError(res, 413, 'TOO_LARGE', 'request body too large');
        req.destroy();
        return;
      }
      raw += chunk;
    }
    if (req.url === '/chatgpt/open') {
      try {
        const body = JSON.parse(raw);
        const url = new URL(body.url);
        const redirect = new URL(url.searchParams.get('redirect_uri') ?? '');
        if (
          !options.openChatGPT ||
          url.origin !== 'https://auth.openai.com' ||
          url.pathname !== '/api/accounts/authorize' ||
          url.username ||
          url.password ||
          url.hash ||
          redirect.protocol !== 'http:' ||
          redirect.hostname !== '127.0.0.1' ||
          !redirect.port ||
          redirect.pathname !== '/auth/callback' ||
          redirect.username ||
          redirect.password ||
          redirect.search ||
          redirect.hash
        )
          throw new Error('invalid authorization URL');
        await options.openChatGPT(url.href);
        res.writeHead(204);
        res.end();
      } catch {
        sendError(res, 400, 'CHATGPT_BROWSER', 'ChatGPT sign-in could not be opened');
      }
      return;
    }
    if (req.url === CONTROL_SIGNED_IN_PATH) {
      await handleSignedIn(res, raw);
      return;
    }
    if (req.url === CONTROL_BROWSE_PATH) {
      await handleBrowse(res, raw);
      return;
    }
    let url: string;
    try {
      url = CaptureRequest.parse(JSON.parse(raw)).url;
      options.checkUrl?.(url);
    } catch (err) {
      if (err instanceof ControlError) sendError(res, err.status, err.code, err.message);
      else sendError(res, 400, 'INVALID_URL', 'expected {"url": "<http(s) URL>"}');
      return;
    }
    if (queued > maxQueue) {
      sendError(res, 429, 'BUSY', 'too many page captures at once; try again shortly');
      return;
    }
    queued++;
    const ac = new AbortController();
    inflight.add(ac);
    // The sidecar gave up (tool cancelled): abort this capture too.
    res.on('close', () => {
      if (!res.writableFinished) ac.abort(new Error('the caller went away'));
    });
    const run = chain.then(async () => {
      if (ac.signal.aborted) throw new ControlError(499, 'ABORTED', 'cancelled');
      const timer = setTimeout(
        () => ac.abort(new ControlError(504, 'TIMEOUT', 'the page did not finish in time')),
        CAPTURE.totalTimeoutMs,
      );
      try {
        return await options.capture(url, ac.signal);
      } finally {
        clearTimeout(timer);
      }
    });
    chain = run.catch(() => undefined);
    try {
      const { png, info } = await run;
      options.log?.(`captured ${originOf(info.url)} (${info.width}×${info.height}, ${png.length} bytes)`);
      res.writeHead(200, {
        'content-type': 'image/png',
        'content-length': png.length,
        [CONTROL_INFO_HEADER]: encodeURIComponent(JSON.stringify(info)),
      });
      res.end(png);
    } catch (err) {
      const reason = ac.signal.aborted && ac.signal.reason instanceof ControlError ? ac.signal.reason : err;
      if (reason instanceof ControlError) {
        options.log?.(`capture of ${originOf(url)} refused: ${reason.code}`);
        if (!res.headersSent) sendError(res, reason.status, reason.code, reason.message);
      } else {
        options.log?.(`capture of ${originOf(url)} failed: ${(reason as Error)?.message ?? String(reason)}`);
        if (!res.headersSent)
          sendError(
            res,
            502,
            'CAPTURE_FAILED',
            `the page could not be captured: ${(reason as Error)?.message ?? 'unknown error'}`,
          );
      }
    } finally {
      queued--;
      inflight.delete(ac);
    }
  };

  const handleBrowse = async (res: ServerResponse, raw: string) => {
    if (!options.browse) {
      sendError(res, 503, 'UNAVAILABLE', 'browser research is unavailable');
      return;
    }
    let request: BrowserRequest;
    try {
      request = BrowserRequest.parse(JSON.parse(raw));
      if (request.action === 'read') options.checkUrl?.(request.url);
    } catch (error) {
      if (error instanceof ControlError) sendError(res, error.status, error.code, error.message);
      else sendError(res, 400, 'INVALID_REQUEST', 'expected a browser search query or public page URL');
      return;
    }
    if (queued > maxQueue) {
      sendError(res, 429, 'BUSY', 'too many browser operations at once; try again shortly');
      return;
    }
    queued++;
    const ac = new AbortController();
    inflight.add(ac);
    res.on('close', () => {
      if (!res.writableFinished) ac.abort(new Error('the caller went away'));
    });
    const run = chain.then(async () => {
      if (ac.signal.aborted) throw new ControlError(499, 'ABORTED', 'cancelled');
      const timer = setTimeout(
        () => ac.abort(new ControlError(504, 'TIMEOUT', 'browser research timed out')),
        BROWSER.timeoutMs,
      );
      try {
        return BrowserAnswer.parse(await options.browse!(request, ac.signal));
      } finally {
        clearTimeout(timer);
      }
    });
    chain = run.catch(() => undefined);
    try {
      const answer = await run;
      options.log?.(
        answer.action === 'read'
          ? `browser read of ${originOf(answer.url)}`
          : `browser search with ${answer.engine}: ${answer.results.length} results`,
      );
      const body = JSON.stringify(answer);
      if (Buffer.byteLength(body) > BROWSER.maxResponseBytes)
        throw new ControlError(413, 'TOO_LARGE', 'browser answer is too large');
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
      res.end(body);
    } catch (error) {
      const reason = ac.signal.aborted && ac.signal.reason instanceof ControlError ? ac.signal.reason : error;
      const failure =
        reason instanceof ControlError
          ? reason
          : new ControlError(
              502,
              'BROWSER_SEARCH_FAILED',
              'The browser could not read this page. Try another source.',
            );
      options.log?.(`browser ${request.action} failed: ${failure.code}`);
      if (!res.headersSent) sendError(res, failure.status, failure.code, failure.message);
    } finally {
      queued--;
      inflight.delete(ac);
    }
  };

  const handleSignedIn = async (res: ServerResponse, raw: string) => {
    const handler = options.signedIn;
    if (!handler) {
      sendError(res, 503, 'UNAVAILABLE', 'signed-in browsing is not available');
      return;
    }
    let request: SignedInRequest;
    try {
      request = SignedInRequest.parse(JSON.parse(raw));
      options.checkUrl?.(request.url);
    } catch (err) {
      if (err instanceof ControlError) sendError(res, err.status, err.code, err.message);
      else sendError(res, 400, 'INVALID_URL', 'expected {"url": "<http(s) URL>"}');
      return;
    }
    if (queued > maxQueue) {
      sendError(res, 429, 'BUSY', 'too many page reads at once; try again shortly');
      return;
    }
    queued++;
    const ac = new AbortController();
    inflight.add(ac);
    res.on('close', () => {
      if (!res.writableFinished) ac.abort(new Error('the caller went away'));
    });
    try {
      await handler.authorize(request, ac.signal);
      ac.signal.throwIfAborted();
      const run = chain.then(async () => {
        if (ac.signal.aborted) throw new ControlError(499, 'ABORTED', 'cancelled');
        const timer = setTimeout(
          () => ac.abort(new ControlError(504, 'TIMEOUT', 'the page did not finish in time')),
          SIGNED_IN.totalTimeoutMs,
        );
        try {
          return await handler.fetch(request, ac.signal);
        } finally {
          clearTimeout(timer);
        }
      });
      chain = run.catch(() => undefined);
      const answer = await run;
      options.log?.(`signed-in read of ${originOf(answer.info.url)} (${answer.html.length} characters)`);
      const body = JSON.stringify(answer);
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      });
      res.end(body);
    } catch (err) {
      const reason = ac.signal.aborted && ac.signal.reason instanceof ControlError ? ac.signal.reason : err;
      if (reason instanceof ControlError) {
        options.log?.(`signed-in read of ${originOf(request.url)} refused: ${reason.code}`);
        if (!res.headersSent) sendError(res, reason.status, reason.code, reason.message);
      } else {
        options.log?.(`signed-in read of ${originOf(request.url)} failed`);
        if (!res.headersSent)
          sendError(
            res,
            502,
            'FETCH_FAILED',
            `the page could not be read: ${(reason as Error)?.message ?? 'unknown error'}`,
          );
      }
    } finally {
      queued--;
      inflight.delete(ac);
    }
  };

  const server: Server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) sendError(res, 500, 'INTERNAL', 'internal error');
      else res.destroy();
    });
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = SIGNED_IN.totalTimeoutMs + 15_000 + 120_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    port,
    env: { [CONTROL_URL_ENV]: url, [CONTROL_SECRET_ENV]: secret },
    async close() {
      for (const ac of inflight) ac.abort(new Error('closing'));
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
