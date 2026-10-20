/** Authenticated main-process Chromium bridge. Only source HTML/results cross it, never browser credentials. */
import { request as httpRequest } from 'node:http';
import { BROWSER, BrowserAnswer, CONTROL_BROWSE_PATH, ControlError, type BrowserRequest } from '@orb/shared';
import { controlFromEnv } from './capture.js';
import { SourceError, type SourceErrorCode } from './errors.js';

export type BrowserClient = {
  readonly available: boolean;
  read(url: string, signal?: AbortSignal): Promise<Extract<BrowserAnswer, { action: 'read' }>>;
  search(
    query: string,
    maxResults?: number,
    signal?: AbortSignal,
  ): Promise<Extract<BrowserAnswer, { action: 'search' }>>;
};

const CODES: Record<string, SourceErrorCode> = {
  BROWSER_BLOCKED: 'BROWSER_BLOCKED',
  BROWSER_EMPTY: 'BROWSER_EMPTY',
  BROWSER_SEARCH_FAILED: 'BROWSER_SEARCH_FAILED',
  HTTP_STATUS: 'HTTP_STATUS',
  BLOCKED_URL: 'BLOCKED_URL',
  INVALID_URL: 'INVALID_URL',
  TIMEOUT: 'TIMEOUT',
  TOO_LARGE: 'TOO_LARGE',
};

export function createBrowserClient(env: NodeJS.ProcessEnv = process.env): BrowserClient {
  const control = controlFromEnv(env);
  const send = (input: BrowserRequest, signal?: AbortSignal): Promise<BrowserAnswer> => {
    if (!control)
      return Promise.reject(
        new SourceError('BROWSER_UNAVAILABLE', 'Browser research needs the orb desktop app.'),
      );
    const body = JSON.stringify(input);
    return new Promise((resolve, reject) => {
      signal?.throwIfAborted();
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port: control.port,
          path: CONTROL_BROWSE_PATH,
          method: 'POST',
          headers: {
            host: `127.0.0.1:${control.port}`,
            authorization: `Bearer ${control.secret}`,
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
          },
          timeout: BROWSER.timeoutMs + 5000,
          signal,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > BROWSER.maxResponseBytes) {
              res.destroy();
              reject(new SourceError('TOO_LARGE', 'The rendered source exceeds the browser read limit.'));
            } else chunks.push(chunk);
          });
          res.on('error', (error) =>
            reject(signal?.aborted ? signal.reason : new SourceError('NETWORK', error.message)),
          );
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode === 200) {
              const result = BrowserAnswer.safeParse(
                (() => {
                  try {
                    return JSON.parse(text);
                  } catch {
                    return undefined;
                  }
                })(),
              );
              if (result.success && result.data.action === input.action) return resolve(result.data);
              return reject(new SourceError('NETWORK', 'The browser service returned an invalid source.'));
            }
            let error: ReturnType<typeof ControlError.parse> | undefined;
            try {
              error = ControlError.parse(JSON.parse(text));
            } catch {
              /* Not a structured response. */
            }
            reject(
              new SourceError(
                CODES[error?.error.code ?? ''] ?? 'NETWORK',
                error?.error.message ?? `Browser research answered HTTP ${res.statusCode}.`,
              ),
            );
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('Browser research timed out.')));
      req.on('error', (error) =>
        reject(signal?.aborted ? signal.reason : new SourceError('NETWORK', error.message)),
      );
      req.end(body);
    });
  };
  return {
    available: control !== undefined,
    async read(url, signal) {
      return (await send({ action: 'read', url }, signal)) as Extract<BrowserAnswer, { action: 'read' }>;
    },
    async search(query, maxResults = 6, signal) {
      return (await send({ action: 'search', query, maxResults }, signal)) as Extract<
        BrowserAnswer,
        { action: 'search' }
      >;
    },
  };
}
