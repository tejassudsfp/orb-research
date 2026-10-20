/**
 * P6.10 signed-in browsing: the contracts shared by Electron main (login window, `persist:orb-sites` partition,
 * per-domain settings, activity), the sidecar's `fetch_signed_in` tool, and the Settings UI.
 *
 * Main owns the cookies. The sidecar asks main over the authenticated loopback control channel
 * (`POST /signed-in-fetch`, same secret and checks as `/capture`) and gets back rendered HTML (and optionally a PNG);
 * no cookie, header or password ever crosses the channel, so none can reach an agent or a model.
 */
import { z } from 'zod';

export const SITES_PARTITION = 'persist:orb-sites';
export const CONTROL_SIGNED_IN_PATH = '/signed-in-fetch';
/** Header carrying `SignedInInfo` (URI-encoded JSON) on a successful `/signed-in-fetch` answer. */
export const CONTROL_SIGNED_IN_HEADER = 'x-orb-signed-in';
/** Multipart-free answer: JSON `{info, html, png?}` (png base64). */
export const SIGNED_IN = {
  /** Largest rendered HTML main returns (characters). */
  maxHtmlChars: 5_000_000,
  loadTimeoutMs: 25_000,
  settleMs: 1_500,
  totalTimeoutMs: 60_000,
  /** Rate limit per connected domain: a burst, then one fetch per `refillMs`. */
  burst: 5,
  refillMs: 6_000,
  /** Activity entries kept. */
  maxActivity: 100,
} as const;

export const SignedInRequest = z.strictObject({
  url: z.string().min(1).max(2048),
  screenshot: z.boolean().optional(),
  /** Who asks, for the activity list and the approval prompt (e.g. `scout s_ab12`). Never a secret. */
  by: z.string().max(120).optional(),
});
export type SignedInRequest = z.infer<typeof SignedInRequest>;

export const SignedInInfo = z.strictObject({
  domain: z.string().max(253),
  /** The URL the page ended on. */
  url: z.string().max(4096),
  title: z.string().max(500),
  status: z.number().int().optional(),
  screenshot: z
    .strictObject({ width: z.number().int().positive(), height: z.number().int().positive(), cut: z.boolean() })
    .optional(),
});
export type SignedInInfo = z.infer<typeof SignedInInfo>;

export const SignedInAnswer = z.strictObject({
  info: SignedInInfo,
  html: z.string(),
  /** Base64 PNG, only when a screenshot was asked for. */
  png: z.string().optional(),
});
export type SignedInAnswer = z.infer<typeof SignedInAnswer>;

/** One connected site as the Settings UI shows it. */
export const ConnectedSite = z.strictObject({
  /** Lower-case host the cookies belong to; the site and its subdomains are reachable. */
  domain: z.string().min(1).max(253),
  loginUrl: z.string().max(2048),
  connectedAt: z.number().int(),
  /** Ask the user before every fetch (default on). */
  requireApproval: z.boolean(),
  /** A terms-of-service note for this site, when it is on the warning list. */
  warning: z.string().max(600).optional(),
});
export type ConnectedSite = z.infer<typeof ConnectedSite>;

export const ActivityOutcome = z.enum(['ok', 'denied', 'rate-limited', 'error']);
export type ActivityOutcome = z.infer<typeof ActivityOutcome>;

export const SiteActivity = z.strictObject({
  at: z.number().int(),
  domain: z.string().max(253),
  /** Origin and path only: the query string and fragment are dropped (they can hold tokens). */
  url: z.string().max(600),
  by: z.string().max(120),
  outcome: ActivityOutcome,
  detail: z.string().max(300).optional(),
  screenshot: z.boolean().optional(),
});
export type SiteActivity = z.infer<typeof SiteActivity>;

export type SitesState = { sites: ConnectedSite[]; activity: SiteActivity[]; tosSites: string[] };

export type SiteConnectResult =
  | { ok: true; site: ConnectedSite }
  | { ok: false; canceled?: true; error?: string };

/**
 * Sites whose terms of service restrict automated access or scraping of logged-in pages. Connecting one is allowed
 * (the user's own session, read-only, rate-limited) but the dialog and Settings show the warning first.
 */
export const TOS_WARNING_SITES: Record<string, string> = {
  'linkedin.com':
    "LinkedIn's terms prohibit automated access to its pages, including with your own login. Your account can be restricted. Use this only if you accept that risk.",
  'facebook.com':
    "Meta's terms prohibit automated collection of data from Facebook, including with your own login. Your account can be restricted.",
  'instagram.com':
    "Meta's terms prohibit automated collection of data from Instagram, including with your own login. Your account can be restricted.",
  'x.com':
    "X's terms prohibit scraping, including with your own login. Your account can be restricted or suspended.",
  'twitter.com':
    "X's terms prohibit scraping, including with your own login. Your account can be restricted or suspended.",
  'glassdoor.com': "Glassdoor's terms prohibit automated access. Your account can be restricted.",
  'crunchbase.com': "Crunchbase's terms prohibit automated access to its pages. Your account can be restricted.",
  'pitchbook.com': "PitchBook's licence prohibits automated extraction of its data. Your account can be closed.",
  'zoominfo.com': "ZoomInfo's terms prohibit automated extraction of its data. Your account can be closed.",
  'sec-api.io': "This service's terms limit automated use to its API.",
};

/** The warning for a domain (or one of its subdomains) on the ToS list. */
export function tosWarningFor(domain: string): string | undefined {
  const d = domain.toLowerCase().replace(/\.$/, '');
  for (const [site, text] of Object.entries(TOS_WARNING_SITES))
    if (d === site || d.endsWith(`.${site}`)) return text;
  return undefined;
}

/** True when `host` is `domain` or one of its subdomains. */
export function hostInDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  const d = domain.toLowerCase().replace(/\.$/, '');
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Parse what the user typed in Settings (`linkedin.com`, `https://www.linkedin.com/login`, `example.com/x`) into a
 * domain and a login URL. https unless `allowHttp` (tests). Refuses local names, IP literals, user info, and other
 * schemes.
 */
export function parseSiteInput(
  input: string,
  options: { allowHttp?: boolean } = {},
): { domain: string; loginUrl: string } | { error: string } {
  const text = input.trim();
  if (!text || text.length > 2048) return { error: 'Enter a web address such as example.com.' };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { error: 'That is not a web address.' };
  }
  if (url.protocol !== 'https:' && !(options.allowHttp && url.protocol === 'http:'))
    return { error: 'Only https sites can be connected.' };
  if (url.username || url.password) return { error: 'Leave the user name and password out of the address.' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    !host.includes('.') ||
    /^[\d.]+$/.test(host) ||
    host.includes(':') ||
    host.startsWith('[') ||
    /(^|\.)(localhost|local|internal|home\.arpa)$/.test(host)
  )
    return { error: 'Enter a public site name such as example.com.' };
  // `www.linkedin.com` and `linkedin.com` share a session: keep the registrable-looking parent when it is `www.`.
  const domain = host.replace(/^www\./, '');
  const loginUrl = url.pathname === '/' && !url.search ? `${url.protocol}//${url.host}/` : url.href;
  return { domain, loginUrl };
}
