/** Machine-readable failure of a source operation. The message is written for the model (short, actionable). */
export type SourceErrorCode =
  | 'INVALID_URL'
  | 'BLOCKED_URL'
  | 'REDIRECT_BLOCKED'
  | 'TOO_LARGE'
  | 'TIMEOUT'
  | 'UNSUPPORTED_TYPE'
  | 'HTTP_STATUS'
  | 'NETWORK'
  | 'EXTRACT_FAILED'
  | 'NOT_CONFIGURED'
  | 'PROVIDER_ERROR'
  | 'CAPTURE_UNAVAILABLE'
  | 'CAPTURE_FAILED'
  | 'BROWSER_UNAVAILABLE'
  | 'BROWSER_BLOCKED'
  | 'BROWSER_EMPTY'
  | 'BROWSER_SEARCH_FAILED'
  | 'NOT_FOUND'
  // P6.10 signed-in browsing
  | 'SIGNED_IN_UNAVAILABLE'
  | 'NOT_CONNECTED'
  | 'DENIED'
  | 'RATE_LIMITED'
  | 'SESSION_EXPIRED';

export class SourceError extends Error {
  constructor(
    readonly code: SourceErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SourceError';
  }
}

export const isSourceError = (err: unknown): err is SourceError => err instanceof SourceError;
