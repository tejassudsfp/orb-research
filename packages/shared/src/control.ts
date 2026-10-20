/**
 * The main ↔ sidecar control channel (BUILD_PLAN P3.5 `capture_page`).
 *
 * Electron main listens on `127.0.0.1:<random port>` and passes the sidecar two variables on every launch:
 * `ORB_CONTROL_URL` (`http://127.0.0.1:<port>`) and `ORB_CONTROL_SECRET` (32 random bytes, hex, new per app
 * launch). The sidecar calls it with `Authorization: Bearer <secret>`. Main accepts a request only when ALL of:
 * the peer address is loopback, the `Host` header is exactly `127.0.0.1:<port>` (no DNS-rebound name), there is no
 * `Origin` / `Sec-Fetch-*` header (a browser page can never be a caller), the method and path are exact, the body
 * is small JSON, and the secret matches (constant-time). Nothing else is served on that port.
 *
 * `POST /capture {url}` → `200 image/png` (the full-page PNG) with an `x-orb-capture` header holding
 * `CaptureInfo` as URI-encoded JSON, or a JSON `{error: {code, message}}` with a 4xx/5xx status.
 */
import { z } from 'zod';

export const CONTROL_URL_ENV = 'ORB_CONTROL_URL';
export const CONTROL_SECRET_ENV = 'ORB_CONTROL_SECRET';
export const CONTROL_CAPTURE_PATH = '/capture';
export const CONTROL_INFO_HEADER = 'x-orb-capture';
/** Largest request body main reads. */
export const CONTROL_MAX_BODY = 8 * 1024;

/** Capture geometry (PRD Sources › Page screenshot: load + 1.5 s, full page). */
export const CAPTURE = {
  width: 1280,
  viewportHeight: 900,
  /** Pages taller than this are cut (a very long page would make a huge, unreadable PNG). */
  maxHeight: 12_000,
  settleMs: 1_500,
  loadTimeoutMs: 20_000,
  totalTimeoutMs: 45_000,
  maxPngBytes: 20 * 1024 * 1024,
} as const;

export const CaptureRequest = z.strictObject({ url: z.string().min(1).max(2048) });
export type CaptureRequest = z.infer<typeof CaptureRequest>;

export const CaptureInfo = z.strictObject({
  /** The URL the page ended on. */
  url: z.string().max(4096),
  title: z.string().max(500),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** True when the page was taller than CAPTURE.maxHeight and was cut. */
  cut: z.boolean(),
});
export type CaptureInfo = z.infer<typeof CaptureInfo>;

export const ControlError = z.strictObject({
  error: z.strictObject({ code: z.string().max(64), message: z.string().max(500) }),
});
export type ControlError = z.infer<typeof ControlError>;
