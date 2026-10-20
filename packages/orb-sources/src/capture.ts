/**
 * The sidecar half of `capture_page` (BUILD_PLAN P3.5): asks Electron main, over the authenticated loopback control
 * channel (packages/shared/src/control.ts), to load a URL in a hidden sandboxed window and return a full-page PNG.
 *
 * Uses `node:http` directly to 127.0.0.1 (never a proxy; dsh's undici dispatcher is not involved). The secret is
 * read from the environment once, sent only in the Authorization header, and never logged or returned.
 */
import { request } from 'node:http';
import {
  CAPTURE,
  CONTROL_CAPTURE_PATH,
  CONTROL_INFO_HEADER,
  CONTROL_SECRET_ENV,
  CONTROL_URL_ENV,
  CaptureInfo,
  ControlError,
} from '@orb/shared';
import { SourceError } from './errors.js';

export type CaptureResult = { png: Buffer; info: CaptureInfo };

export type CaptureClient = {
  readonly available: boolean;
  capture(url: string, signal?: AbortSignal): Promise<CaptureResult>;
};

/** The control endpoint from the environment, or undefined (plain sidecar without Electron, e.g. tests). */
export function controlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { port: number; secret: string } | undefined {
  const raw = env[CONTROL_URL_ENV];
  const secret = env[CONTROL_SECRET_ENV];
  if (!raw || !secret || !/^[0-9a-f]{64}$/.test(secret)) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !u.port || u.pathname !== '/')
      return undefined;
    return { port: Number(u.port), secret };
  } catch {
    return undefined;
  }
}

export function createCaptureClient(env: NodeJS.ProcessEnv = process.env): CaptureClient {
  const control = controlFromEnv(env);
  return {
    available: control !== undefined,
    capture(url, signal) {
      if (!control)
        return Promise.reject(
          new SourceError(
            'CAPTURE_UNAVAILABLE',
            'page capture needs the orb app (no capture service in this process)',
          ),
        );
      return post(control, url, signal);
    },
  };
}

function post(
  control: { port: number; secret: string },
  url: string,
  signal?: AbortSignal,
): Promise<CaptureResult> {
  const body = JSON.stringify({ url });
  return new Promise<CaptureResult>((resolve, reject) => {
    signal?.throwIfAborted();
    const req = request(
      {
        host: '127.0.0.1',
        port: control.port,
        method: 'POST',
        path: CONTROL_CAPTURE_PATH,
        headers: {
          host: `127.0.0.1:${control.port}`,
          authorization: `Bearer ${control.secret}`,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
        timeout: CAPTURE.totalTimeoutMs + 5_000,
        signal,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > CAPTURE.maxPngBytes + 1024) {
            res.destroy();
            reject(new SourceError('CAPTURE_FAILED', 'the capture is larger than 20 MB'));
            return;
          }
          chunks.push(c);
        });
        res.on('error', (err) =>
          reject(signal?.aborted ? signal.reason : new SourceError('CAPTURE_FAILED', err.message)),
        );
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode === 200 && res.headers['content-type'] === 'image/png') {
            const header = res.headers[CONTROL_INFO_HEADER];
            const parsed = CaptureInfo.safeParse(
              (() => {
                try {
                  return JSON.parse(decodeURIComponent(String(header ?? '')));
                } catch {
                  return undefined;
                }
              })(),
            );
            if (!parsed.success)
              return reject(new SourceError('CAPTURE_FAILED', 'the capture service sent no page info'));
            return resolve({ png: buf, info: parsed.data });
          }
          let message = `the capture service answered HTTP ${res.statusCode}`;
          let code: 'CAPTURE_FAILED' | 'BLOCKED_URL' | 'INVALID_URL' = 'CAPTURE_FAILED';
          try {
            const err = ControlError.parse(JSON.parse(buf.toString('utf8')));
            message = err.error.message;
            if (err.error.code === 'BLOCKED_URL' || err.error.code === 'INVALID_URL') code = err.error.code;
          } catch {
            // not a control error body
          }
          reject(new SourceError(code, message));
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('the capture service did not answer in time')));
    req.on('error', (err) =>
      reject(
        signal?.aborted
          ? signal.reason
          : new SourceError('CAPTURE_FAILED', `page capture failed: ${err.message}`),
      ),
    );
    req.end(body);
  });
}
