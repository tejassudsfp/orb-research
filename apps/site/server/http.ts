import type { IncomingMessage, ServerResponse } from 'node:http';

/** The verified Resend sender for every website email. */
export const SITE_SENDER = 'orb@email.tejassuds.com';

/** An error whose message is safe to show the visitor. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type MailOptions = {
  getApiKey: () => string | undefined | Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
  /** The exact site origin allowed to post (https://orb.tejassuds.com). Without it, Origin must match Host. */
  origin?: string;
  /** The visitor's address for rate limits. Behind a proxy (Vercel), read the proxy's trusted header. */
  clientIp?: (req: IncomingMessage) => string | undefined;
};

export function reply(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}

/** Accept only same-origin POSTs from the site's own pages. */
export function assertSiteRequest(req: IncomingMessage, options: MailOptions, what: string) {
  if (req.method !== 'POST') throw new HttpError(405, `Use the ${what} form on the orb website.`);
  let origin: URL;
  try {
    origin = new URL(req.headers.origin ?? '');
  } catch {
    throw new HttpError(403, `Open the ${what} form on the orb website.`);
  }
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    (options.origin ? origin.origin !== options.origin : origin.host !== req.headers.host)
  )
    throw new HttpError(403, `Open the ${what} form on the orb website.`);
}

export function clientIp(req: IncomingMessage, options: MailOptions) {
  return options.clientIp?.(req) || req.socket.remoteAddress || 'unknown';
}

/** Fixed-window counters per key (visitor address, email) plus one global budget, all per server instance. */
export function rateLimiter(limits: { perKey: number; global: number; windowMs: number }) {
  const keys = new Map<string, { count: number; until: number }>();
  let global = { count: 0, until: 0 };
  const sweep = (now: number) => {
    for (const [key, entry] of keys) if (entry.until <= now) keys.delete(key);
    if (global.until <= now) global = { count: 0, until: now + limits.windowMs };
  };
  return {
    allows(...ids: string[]) {
      const now = Date.now();
      sweep(now);
      return (
        global.count < limits.global &&
        keys.size < 10000 &&
        ids.every((id) => (keys.get(id)?.count ?? 0) < limits.perKey)
      );
    },
    record(...ids: string[]) {
      const now = Date.now();
      global.count++;
      for (const id of ids) {
        const entry = keys.get(id) ?? { count: 0, until: now + limits.windowMs };
        keys.set(id, { count: entry.count + 1, until: entry.until });
      }
    },
  };
}

export type Mail = {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ filename: string; content: string; content_type: string }>;
};

/** Send one email through Resend. True only when Resend confirms it with an id. */
export async function sendMail(options: MailOptions, apiKey: string, mail: Mail, idempotencyKey: string) {
  const response = await (options.fetch ?? globalThis.fetch)('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(mail),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) return false;
  const result = (await response.json()) as { id?: unknown };
  return typeof result.id === 'string' && result.id.length > 0;
}

export const UUID_PATTERN = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
