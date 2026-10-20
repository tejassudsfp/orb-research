import { createHmac, timingSafeEqual } from 'node:crypto';

/** How long an emailed download link works. */
export const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LinkClaims = { email: string; requestId: string; expires: number };

const encode = (value: string | Buffer) => Buffer.from(value).toString('base64url');
const sign = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest();

/**
 * A download token: base64url(JSON claims) + "." + base64url(HMAC-SHA256). Tokens are stateless, so the emailed
 * link works on any server instance until it expires. The claims are the recipient's own email and request id.
 */
export function createLinkToken(secret: string, claims: { email: string; requestId: string }, now = Date.now()) {
  const payload = encode(JSON.stringify({ e: claims.email, r: claims.requestId, x: now + LINK_TTL_MS }));
  return `${payload}.${encode(sign(secret, payload))}`;
}

/** The claims of a valid, unexpired token; undefined for anything else. */
export function verifyLinkToken(secret: string, token: string, now = Date.now()): LinkClaims | undefined {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined || token.length > 1024) return undefined;
  const expected = sign(secret, payload);
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { e?: unknown; r?: unknown; x?: unknown };
    if (typeof claims.e !== 'string' || typeof claims.r !== 'string' || typeof claims.x !== 'number') return undefined;
    if (claims.x <= now) return undefined;
    return { email: claims.e, requestId: claims.r, expires: claims.x };
  } catch {
    return undefined;
  }
}
