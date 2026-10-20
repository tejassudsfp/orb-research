/**
 * Cordis row `orb-cost` (`@orb/host/cost`, BUILD_PLAN P4.3): provides `orbCost`, the canvas token and cost meter.
 *
 * - **Sessions of a canvas**: its root session (canvas.json `rootSessionId`), every descendant of it (child headers
 *   record `parentSession`, dsh-subagent/lib/index.js:476), the children canvas.json names, and any session whose
 *   `cwd` is the canvas folder (agents are created there). Listed with `ctx.sessionQuery.listSessions()`.
 * - **Tokens per session**: `ctx.sessionQuery.observeSession(id, {projectionMode: 'all'})` serves live and cold
 *   sessions alike; its `projections.values.tokenUsage` is the harness projection (dsh-token-meter, the four disjoint
 *   buckets). The same log is folded per model route (costFold.ts) so each route is priced at its own rate.
 * - **Prices**: orb.json `prices`, seeded from pi-ai's catalog `ModelCost` (`getBuiltinModels`, read from
 *   `@earendil-works/pi-ai` directly: dsh zeroes `cost` on the routes it registers). A route the table lacks is looked
 *   up in the catalog the first time it shows up and written as a `catalog` row; a route the catalog does not know
 *   (a custom endpoint) stays unpriced until the user sets a price. `user` rows are never re-seeded.
 * - Pricing tiers (`ModelCost.tiers`, e.g. gpt-6-luna above 272k input tokens per request) are not applied: the table
 *   holds one rate per bucket (BUILD_PLAN P4.3), and an Orb request stays far below those thresholds.
 */
import { getBuiltinModels } from '@earendil-works/pi-ai/providers/all';
import type { CanvasStore } from '@orb/canvas';
import {
  cacheHitRate,
  CHATGPT_PROVIDER,
  addBuckets,
  costOf,
  DEFAULT_AGENT_MODEL,
  priceKey,
  PROVIDER_PRESETS,
  splitPriceKey,
  totalTokens,
  zeroBuckets,
  type AgentCost,
  type CanvasCost,
  type CostTile,
  type PriceEntry,
  type PriceRates,
  type PriceRow,
  type PricesSetArgs,
  type PriceTable,
  type RouteCost,
  type TokenBuckets,
} from '@orb/shared';
import { foldRouteUsage, UNKNOWN_ROUTE } from './costFold.js';

export const name = 'orb-cost';
export const ORB_COST_SERVICE = 'orbCost';
/** How long one `listSessions()` answer is reused (Home lists every canvas at once). */
const LISTING_TTL_MS = 1500;

type SessionHeaderLike = { id: string; parentSession?: string; cwd?: string };
type SessionRecordLike = { header: SessionHeaderLike };
type ObservationLike = {
  cursor: number;
  readonly events: readonly { type: string; data: any }[];
  projections?: { values?: { tokenUsage?: TokenBuckets } };
  [Symbol.dispose]?: () => void;
};
/** The slice of dsh-session-query `SessionQueryEngine` Orb uses. */
export type SessionQueryLike = {
  listSessions(signal?: AbortSignal): Promise<SessionRecordLike[]>;
  observeSession(
    sessionId: string,
    options?: { signal?: AbortSignal; projectionMode?: 'all' | 'none' },
  ): Promise<ObservationLike>;
};

type SessionUsage = { cursor: number; tokens: TokenBuckets; byRoute: Record<string, TokenBuckets> };

const isZero = (b: TokenBuckets) => totalTokens(b) === 0;
const ratesOf = (e: PriceRates): PriceRates => ({
  input: e.input,
  output: e.output,
  cacheRead: e.cacheRead,
  cacheWrite: e.cacheWrite,
});
const sameRates = (a: PriceRates, b: PriceRates) =>
  a.input === b.input &&
  a.output === b.output &&
  a.cacheRead === b.cacheRead &&
  a.cacheWrite === b.cacheWrite;

/** pi-ai's list price of a route, or undefined when the installed catalog does not know it. */
export function catalogRates(provider: string, model: string): PriceRates | undefined {
  let models: readonly { id: string; cost?: Partial<PriceRates> }[];
  try {
    models = getBuiltinModels(provider as never) as never;
  } catch {
    return undefined;
  }
  const cost = models?.find((m) => m.id === model)?.cost;
  if (!cost) return undefined;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  return {
    input: n(cost.input),
    output: n(cost.output),
    cacheRead: n(cost.cacheRead),
    cacheWrite: n(cost.cacheWrite),
  };
}

/** Routes seeded at start: every provider card's models and the harness default (the table is not empty on day one). */
export function defaultSeedRoutes(): Array<{ provider: string; model: string }> {
  const routes = [
    DEFAULT_AGENT_MODEL,
    ...PROVIDER_PRESETS.flatMap((p) =>
      [p.strong, p.fast, p.test].map((model) => ({ provider: p.id, model })),
    ),
  ];
  const seen = new Set<string>();
  return routes.filter((r) => {
    const key = priceKey(r.provider, r.model);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class OrbCost {
  /** Settles once the start-up seed is written (or failed and was logged). */
  readonly ready: Promise<void>;
  private readonly usage = new Map<string, SessionUsage>();
  private listing: { at: number; records: Promise<SessionRecordLike[]> } | undefined;
  /** Routes whose catalog lookup already ran (seeded, or not in the catalog). */
  private readonly looked = new Set<string>();

  constructor(private readonly ctx: any) {
    this.ready = this.seed(defaultSeedRoutes()).catch((err: unknown) =>
      this.log('warn', `could not seed prices: ${(err as Error)?.message ?? String(err)}`),
    );
  }

  private get canvas(): CanvasStore {
    return this.ctx.orbCanvas as CanvasStore;
  }
  private get query(): SessionQueryLike | undefined {
    return this.ctx.sessionQuery as SessionQueryLike | undefined;
  }

  private log(level: 'info' | 'warn', message: string) {
    const logger = typeof this.ctx.logger === 'function' ? this.ctx.logger('orb-cost') : undefined;
    logger?.[level]?.(message);
  }

  /**
   * Write catalog rows for these routes: missing rows are added, `catalog` rows follow the installed catalog, `user`
   * rows are kept. One orb.json write, only when something changed.
   */
  async seed(routes: Array<{ provider: string; model: string }>): Promise<void> {
    const found = routes
      .map((r) => ({ key: priceKey(r.provider, r.model), rates: catalogRates(r.provider, r.model) }))
      .filter((r): r is { key: string; rates: PriceRates } => r.rates !== undefined);
    for (const r of routes) this.looked.add(priceKey(r.provider, r.model));
    if (found.length === 0) return;
    const current = (await this.canvas.settings.get()).prices;
    const due = found.filter((f) => {
      const row = current[f.key];
      return !row || (row.source === 'catalog' && !sameRates(row, f.rates));
    });
    if (due.length === 0) return;
    await this.canvas.settings.update((s) => {
      const prices: PriceTable = { ...s.prices };
      for (const f of due) {
        if (prices[f.key]?.source === 'user') continue;
        prices[f.key] = { ...f.rates, source: 'catalog' };
      }
      return { ...s, prices };
    });
  }

  /** The table, after seeding any of `routes` it lacks from the catalog. */
  private async pricesFor(routes: string[]): Promise<PriceTable> {
    await this.ready;
    const fresh = routes.filter((k) => k !== UNKNOWN_ROUTE && !this.looked.has(k));
    if (fresh.length > 0) {
      const table = (await this.canvas.settings.get()).prices;
      const missing = fresh.filter((k) => !table[k]).map(splitPriceKey);
      for (const k of fresh) this.looked.add(k);
      if (missing.length > 0) await this.seed(missing).catch(() => undefined);
    }
    return (await this.canvas.settings.get()).prices;
  }

  private records(): Promise<SessionRecordLike[]> {
    const now = Date.now();
    if (this.listing && now - this.listing.at < LISTING_TTL_MS) return this.listing.records;
    const query = this.query;
    const records = query ? query.listSessions().catch(() => []) : Promise.resolve([]);
    this.listing = { at: now, records };
    return records;
  }

  /** Root + its descendants + canvas.json children + sessions working in the canvas folder. */
  async sessionsOf(canvasId: string): Promise<string[]> {
    const meta = await this.canvas.open(canvasId);
    const ids = new Set<string>();
    if (meta.rootSessionId) ids.add(meta.rootSessionId);
    for (const id of Object.values(meta.childAgentIds ?? {})) if (id) ids.add(id);
    const records = await this.records();
    const children = new Map<string, string[]>();
    for (const r of records) {
      const parent = r.header.parentSession;
      if (parent) children.set(parent, [...(children.get(parent) ?? []), r.header.id]);
      if (this.canvas.canvasIdOfDir(r.header.cwd) === canvasId) ids.add(r.header.id);
    }
    const queue = [...ids];
    while (queue.length > 0) {
      for (const child of children.get(queue.shift()!) ?? []) {
        if (!ids.has(child)) {
          ids.add(child);
          queue.push(child);
        }
      }
    }
    return [...ids];
  }

  /** One session's usage (harness totals + per-route split); zero when the session has no log yet. */
  async usageOf(sessionId: string): Promise<SessionUsage> {
    const query = this.query;
    if (!query) return { cursor: -1, tokens: zeroBuckets(), byRoute: {} };
    let obs: ObservationLike;
    try {
      obs = await query.observeSession(sessionId, { projectionMode: 'all' });
    } catch {
      // Not created on disk yet (a root whose first turn has not been saved), or unreadable: nothing to count.
      return this.usage.get(sessionId) ?? { cursor: -1, tokens: zeroBuckets(), byRoute: {} };
    }
    try {
      const cached = this.usage.get(sessionId);
      if (cached && cached.cursor === obs.cursor) return cached;
      const { byRoute } = foldRouteUsage(obs.events);
      const folded = Object.values(byRoute).reduce(addBuckets, zeroBuckets());
      const harness = obs.projections?.values?.tokenUsage;
      if (harness && totalTokens(harness) !== totalTokens(folded)) {
        this.log(
          'warn',
          `session ${sessionId}: per-route usage (${totalTokens(folded)}) differs from tokenUsage (${totalTokens(harness)})`,
        );
      }
      const result = { cursor: obs.cursor, tokens: harness ?? folded, byRoute };
      this.usage.set(sessionId, result);
      return result;
    } finally {
      obs[Symbol.dispose]?.();
    }
  }

  /** `cost.get`: Σ tokenUsage over the canvas's sessions × each route's price. */
  async get(canvasId: string): Promise<CanvasCost> {
    const sessions = await this.sessionsOf(canvasId);
    const usages = await Promise.all(sessions.map((id) => this.usageOf(id)));
    // P6.8: which agent each session is (canvas.json: the root is orb, the children are listed by role).
    const meta = await this.canvas.open(canvasId);
    const roleOf = (id: string): AgentCost['agent'] => {
      if (meta.rootSessionId === id) return 'orb';
      for (const [role, sid] of Object.entries(meta.childAgentIds ?? {}))
        if (sid === id && (role === 'scout' || role === 'critic' || role === 'builder')) return role;
      return 'other';
    };
    const byAgent = new Map<AgentCost['agent'], TokenBuckets>();
    sessions.forEach((id, i) => {
      const role = roleOf(id);
      byAgent.set(role, addBuckets(byAgent.get(role) ?? zeroBuckets(), usages[i]!.tokens));
    });
    let tokens = zeroBuckets();
    const byRoute = new Map<string, TokenBuckets>();
    for (const u of usages) {
      tokens = addBuckets(tokens, u.tokens);
      for (const [route, b] of Object.entries(u.byRoute))
        byRoute.set(route, addBuckets(byRoute.get(route) ?? zeroBuckets(), b));
    }
    const prices = await this.pricesFor([...byRoute.keys()]);
    const routes: RouteCost[] = [];
    const unpriced: string[] = [];
    let usd = 0;
    for (const [route, b] of [...byRoute.entries()].sort(([a], [z]) => a.localeCompare(z))) {
      if (isZero(b)) continue;
      const { provider, model } = splitPriceKey(route);
      const price = prices[route];
      if (provider === CHATGPT_PROVIDER) {
        routes.push({ provider, model, tokens: b, billing: 'chatgpt-plan' });
      } else if (price) {
        const cost = costOf(b, price);
        usd += cost;
        routes.push({ provider, model, tokens: b, usd: cost });
      } else {
        unpriced.push(route);
        routes.push({ provider, model, tokens: b });
      }
    }
    const ORDER: AgentCost['agent'][] = ['orb', 'scout', 'critic', 'builder', 'other'];
    const agents: AgentCost[] = ORDER.flatMap((agent) => {
      const b = byAgent.get(agent);
      if (!b || isZero(b)) return [];
      const rate = cacheHitRate(b);
      return [{ agent, tokens: b, ...(rate === undefined ? {} : { cacheHitRate: rate }) }];
    });
    const rate = cacheHitRate(tokens);
    return {
      canvasId,
      tokens,
      total: totalTokens(tokens),
      usd,
      unpriced,
      routes,
      sessions: sessions.length,
      ...(rate === undefined ? {} : { cacheHitRate: rate }),
      ...(agents.length > 0 ? { agents } : {}),
    };
  }

  /** The Home tile's meter. */
  async tile(canvasId: string): Promise<CostTile> {
    const c = await this.get(canvasId);
    return {
      total: c.total,
      usd: c.usd,
      partial: c.unpriced.length > 0,
      ...(c.routes.length > 0 && c.routes.every((r) => r.billing === 'chatgpt-plan')
        ? { planOnly: true }
        : {}),
    };
  }

  /** Settings: every row of the table, with the catalog price beside it. */
  async describe(): Promise<PriceRow[]> {
    await this.ready;
    const table = (await this.canvas.settings.get()).prices;
    return Object.entries(table)
      .map(([key, entry]: [string, PriceEntry]) => {
        const { provider, model } = splitPriceKey(key);
        const catalog = catalogRates(provider, model);
        return {
          key,
          provider,
          model,
          rates: ratesOf(entry),
          source: entry.source,
          ...(catalog ? { catalog } : {}),
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  /** Settings edit: `rates` → a `user` row; `null` → back to the catalog price (or no row when it has none). */
  async set(args: PricesSetArgs): Promise<PriceRow[]> {
    await this.ready;
    const key = priceKey(args.provider, args.model);
    const catalog = catalogRates(args.provider, args.model);
    await this.canvas.settings.update((s) => {
      const prices: PriceTable = { ...s.prices };
      if (args.rates) prices[key] = { ...args.rates, source: 'user' };
      else if (catalog) prices[key] = { ...catalog, source: 'catalog' };
      else delete prices[key];
      return { ...s, prices };
    });
    this.looked.add(key);
    return this.describe();
  }
}

export function apply(ctx: any) {
  ctx.provide(ORB_COST_SERVICE, new OrbCost(ctx));
}
