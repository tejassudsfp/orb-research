/**
 * The sidecar half of `fetch_signed_in` (P6.10): asks Electron main, over the authenticated loopback control channel
 * (packages/shared/src/control.ts, sites.ts), to render ONE page of a connected site with the user's session, read
 * only. Main owns the cookies; what comes back is the rendered HTML (and a PNG when asked), never a cookie or header.
 * `node:http` straight to 127.0.0.1 (no proxy); the secret is sent only in the Authorization header.
 */
import { request } from 'node:http';
import {
  CONTROL_SIGNED_IN_PATH,
  ControlError,
  SIGNED_IN,
  SignedInAnswer,
  type SignedInRequest,
} from '@orb/shared';
import { controlFromEnv } from './capture.js';
import { SourceError, type SourceErrorCode } from './errors.js';

export type SignedInClient = {
  readonly available: boolean;
  fetch(req: SignedInRequest, signal?: AbortSignal): Promise<SignedInAnswer>;
};

const CODES: Record<string, SourceErrorCode> = {
  NOT_CONNECTED: 'NOT_CONNECTED',
  DENIED: 'DENIED',
  RATE_LIMITED: 'RATE_LIMITED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  BLOCKED_URL: 'BLOCKED_URL',
  INVALID_URL: 'INVALID_URL',
  TIMEOUT: 'TIMEOUT',
  TOO_LARGE: 'TOO_LARGE',
};

export function createSignedInClient(env: NodeJS.ProcessEnv = process.env): SignedInClient {
  const control = controlFromEnv(env);
  return {
    available: control !== undefined,
    fetch(req, signal) {
      if (!control)
        return Promise.reject(
          new SourceError(
            'SIGNED_IN_UNAVAILABLE',
            'signed-in browsing needs the orb app (no connected-sites service in this process)',
          ),
        );
      const body = JSON.stringify(req);
      return new Promise<SignedInAnswer>((resolve, reject) => {
        signal?.throwIfAborted();
        const http = request(
          {
            host: '127.0.0.1',
            port: control.port,
            method: 'POST',
            path: CONTROL_SIGNED_IN_PATH,
            headers: {
              host: `127.0.0.1:${control.port}`,
              authorization: `Bearer ${control.secret}`,
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(body),
            },
            // The user may take a while to answer the approval prompt: no socket timeout while it waits.
            signal,
          },
          (res) => {
            const chunks: Buffer[] = [];
            let size = 0;
            res.on('data', (c: Buffer) => {
              size += c.length;
              if (size > SIGNED_IN.maxHtmlChars * 2 + 40 * 1024 * 1024) {
                res.destroy();
                reject(new SourceError('TOO_LARGE', 'the signed-in page is too large'));
                return;
              }
              chunks.push(c);
            });
            res.on('error', (err) =>
              reject(signal?.aborted ? signal.reason : new SourceError('NETWORK', err.message)),
            );
            res.on('end', () => {
              const text = Buffer.concat(chunks).toString('utf8');
              if (res.statusCode === 200) {
                try {
                  return resolve(SignedInAnswer.parse(JSON.parse(text)));
                } catch {
                  return reject(new SourceError('NETWORK', 'the connected-sites service sent an invalid answer'));
                }
              }
              let message = `the connected-sites service answered HTTP ${res.statusCode}`;
              let code: SourceErrorCode = 'NETWORK';
              try {
                const err = ControlError.parse(JSON.parse(text));
                message = err.error.message;
                code = CODES[err.error.code] ?? 'NETWORK';
              } catch {
                // not a control error body
              }
              reject(new SourceError(code, message));
            });
          },
        );
        http.on('error', (err) =>
          reject(
            signal?.aborted ? signal.reason : new SourceError('NETWORK', `signed-in fetch failed: ${err.message}`),
          ),
        );
        http.end(body);
      });
    },
  };
}
