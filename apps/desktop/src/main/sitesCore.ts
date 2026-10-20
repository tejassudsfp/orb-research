/**
 * P6.10 signed-in browsing, the part with no Electron import (unit-tested in test/sites.test.ts): the connected-site
 * registry (a small JSON file next to DSH_HOME; it holds domains and settings, never a cookie), the per-domain rate
 * limiter, the activity list, and the request policy of the two `persist:orb-sites` windows.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ConnectedSite,
  SIGNED_IN,
  SiteActivity,
  hostInDomain,
  tosWarningFor,
  type ActivityOutcome,
} from '@orb/shared';
import { decideCaptureRequest, type CaptureDecision, type FilterOptions } from './captureFilter.js';

export const SITES_FILE = 'connected-sites.json';

type Persisted = { v: 1; sites: ConnectedSite[]; activity: SiteActivity[] };

/** Origin and path only (a query string or fragment can hold a token). */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`.slice(0, 600);
  } catch {
    return '(invalid url)';
  }
}

export class SitesStore {
  private readonly file: string;
  private sites: ConnectedSite[] = [];
  private activity: SiteActivity[] = [];

  constructor(
    stateDir: string,
    private readonly now: () => number = Date.now,
  ) {
    this.file = join(stateDir, SITES_FILE);
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Persisted>;
      this.sites = (raw.sites ?? []).flatMap((s) => {
        const p = ConnectedSite.safeParse(s);
        return p.success ? [p.data] : [];
      });
      this.activity = (raw.activity ?? []).flatMap((a) => {
        const p = SiteActivity.safeParse(a);
        return p.success ? [p.data] : [];
      });
    } catch {
      // first run, or an unreadable file: start empty
    }
  }

  list(): ConnectedSite[] {
    return this.sites.map((s) => ({ ...s }));
  }

  recent(): SiteActivity[] {
    return this.activity.slice().reverse();
  }

  /** The connected site whose domain covers `host` (the longest match). */
  siteFor(host: string): ConnectedSite | undefined {
    return this.sites
      .filter((s) => hostInDomain(host, s.domain))
      .sort((a, b) => b.domain.length - a.domain.length)[0];
  }

  upsert(domain: string, loginUrl: string): ConnectedSite {
    const old = this.sites.find((s) => s.domain === domain);
    const warning = tosWarningFor(domain);
    const site: ConnectedSite = {
      domain,
      loginUrl,
      connectedAt: this.now(),
      requireApproval: old?.requireApproval ?? true,
      ...(warning ? { warning } : {}),
    };
    this.sites = [...this.sites.filter((s) => s.domain !== domain), site].sort((a, b) =>
      a.domain.localeCompare(b.domain),
    );
    this.save();
    return site;
  }

  setApproval(domain: string, requireApproval: boolean): ConnectedSite | undefined {
    const site = this.sites.find((s) => s.domain === domain);
    if (!site) return undefined;
    site.requireApproval = requireApproval;
    this.save();
    return { ...site };
  }

  remove(domain: string): boolean {
    const before = this.sites.length;
    this.sites = this.sites.filter((s) => s.domain !== domain);
    if (this.sites.length === before) return false;
    this.save();
    return true;
  }

  record(entry: {
    domain: string;
    url: string;
    by: string;
    outcome: ActivityOutcome;
    detail?: string;
    screenshot?: boolean;
  }): SiteActivity {
    const a: SiteActivity = {
      at: this.now(),
      domain: entry.domain,
      url: redactUrl(entry.url),
      by: entry.by.slice(0, 120),
      outcome: entry.outcome,
      ...(entry.detail ? { detail: entry.detail.slice(0, 300) } : {}),
      ...(entry.screenshot ? { screenshot: true } : {}),
    };
    this.activity.push(a);
    if (this.activity.length > SIGNED_IN.maxActivity)
      this.activity.splice(0, this.activity.length - SIGNED_IN.maxActivity);
    this.save();
    return a;
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ v: 1, sites: this.sites, activity: this.activity }, null, 2), {
        mode: 0o600,
      });
      renameSync(tmp, this.file);
    } catch {
      // The registry is a convenience: a failed write must never fail a fetch.
    }
  }
}

/** Token bucket per domain: `burst` fetches at once, then one per `refillMs`. */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  constructor(
    private readonly now: () => number = Date.now,
    private readonly burst: number = SIGNED_IN.burst,
    private readonly refillMs: number = SIGNED_IN.refillMs,
  ) {}

  /** Take a token; on refusal, how many ms until the next one. */
  take(domain: string): { ok: true } | { ok: false; retryAfterMs: number } {
    const t = this.now();
    const b = this.buckets.get(domain) ?? { tokens: this.burst, at: t };
    b.tokens = Math.min(this.burst, b.tokens + (t - b.at) / this.refillMs);
    b.at = t;
    this.buckets.set(domain, b);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { ok: true };
    }
    return { ok: false, retryAfterMs: Math.ceil((1 - b.tokens) * this.refillMs) };
  }

  forget(domain: string): void {
    this.buckets.delete(domain);
  }
}

export type SitesWindowKind = 'login' | 'fetch';

/**
 * Decide one request of a `persist:orb-sites` window for `domain`.
 *
 * - login window: every public http(s) host (sign-in flows bounce through identity providers and CDNs), nothing
 *   local or private (the same capture filter);
 * - fetch window (read-only render): ONLY the connected domain and its subdomains (any resource type, so the
 *   egress of a signed-in fetch is exactly the connected domain: no third-party script, tracker, CDN or image is
 *   contacted, and cookies are only ever sent where the user connected), and a page or frame navigation only by
 *   GET (a form post is refused). data: and blob: stay local.
 */
export async function decideSitesRequest(
  kind: SitesWindowKind,
  domain: string,
  details: { url: string; method: string; resourceType: string },
  options: FilterOptions,
): Promise<CaptureDecision> {
  const base = await decideCaptureRequest(details.url, options);
  if (base === 'cancel' || kind === 'login') return base;
  let host: string;
  try {
    const u = new URL(details.url);
    if (u.protocol === 'data:' || u.protocol === 'blob:' || details.url === 'about:blank') return 'allow';
    host = u.hostname;
  } catch {
    return 'cancel';
  }
  const on = hostInDomain(host, domain);
  if (!on) return 'cancel';
  if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame')
    return details.method === 'GET' ? 'allow' : 'cancel';
  return 'allow';
}
