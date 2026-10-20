/**
 * P4.3 cost meter (PRD Models › Cost visibility; BUILD_PLAN P4.3).
 *
 * - **Tokens** come from the harness's per-session token usage (`tokenUsage` projection, dsh-token-meter), summed over
 *   a canvas's root session and its child sessions. The four buckets are disjoint (reasoning is inside output).
 * - **Prices** live in orb.json (`prices`): `provider/model → {input, output, cacheRead, cacheWrite}` in US dollars per
 *   1M tokens, seeded from the pi-ai catalog's list prices (`ModelCost`) and editable in Settings.
 * - **Cost** = Σ over routes of tokens × that route's price. A route with no price is reported as unpriced (its tokens
 *   still count), so the meter never invents a price.
 */
import { z } from 'zod';

/** Same as wire.ts `CanvasId` (restated: wire.ts imports this module). */
const CanvasId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,127}$/);

/** USD per 1M tokens, per bucket. */
export const PriceRates = z.strictObject({
  input: z.number().nonnegative().max(100_000),
  output: z.number().nonnegative().max(100_000),
  cacheRead: z.number().nonnegative().max(100_000),
  cacheWrite: z.number().nonnegative().max(100_000),
});
export type PriceRates = z.infer<typeof PriceRates>;

/** A price-table row: `catalog` = seeded from pi-ai's list price; `user` = edited in Settings (never re-seeded). */
export const PriceEntry = PriceRates.extend({ source: z.enum(['catalog', 'user']) });
export type PriceEntry = z.infer<typeof PriceEntry>;

/** Route ids: an `llm-pi-ai` provider id, then `/`, then the model id (which may itself contain `/`). */
export const PRICE_KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}\/\S{1,200}$/;
export const PriceKey = z.string().regex(PRICE_KEY_RE, 'provider/model');

/** orb.json `prices`. */
export const PriceTable = z.record(PriceKey, PriceEntry);
export type PriceTable = z.infer<typeof PriceTable>;

export const priceKey = (provider: string, model: string): string => `${provider}/${model}`;
export function splitPriceKey(key: string): { provider: string; model: string } {
  const i = key.indexOf('/');
  return { provider: key.slice(0, i), model: key.slice(i + 1) };
}

/** The harness's four disjoint token buckets (dsh-token-meter `TokenUsageProjection`). */
export const TokenBuckets = z.strictObject({
  uncachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
});
export type TokenBuckets = z.infer<typeof TokenBuckets>;

export const zeroBuckets = (): TokenBuckets => ({
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

export const addBuckets = (a: TokenBuckets, b: TokenBuckets): TokenBuckets => ({
  uncachedInputTokens: a.uncachedInputTokens + b.uncachedInputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});

export const totalTokens = (b: TokenBuckets): number =>
  b.uncachedInputTokens + b.outputTokens + b.cacheReadTokens + b.cacheWriteTokens;

/**
 * P6.8: the share of input tokens served from the provider's prompt cache: cached input ÷ total input (uncached +
 * cache read + cache write). `undefined` when there was no input yet. Shown per canvas and per agent in the meter.
 */
export function cacheHitRate(b: TokenBuckets): number | undefined {
  const input = b.uncachedInputTokens + b.cacheReadTokens + b.cacheWriteTokens;
  return input > 0 ? b.cacheReadTokens / input : undefined;
}

/** "62%" (whole percent), for a cache hit rate. */
export const formatPercent = (rate: number): string => `${Math.round(rate * 100)}%`;

/** US dollars for these tokens at these rates (per 1M tokens). */
export function costOf(b: TokenBuckets, rates: PriceRates): number {
  return (
    (b.uncachedInputTokens * rates.input +
      b.outputTokens * rates.output +
      b.cacheReadTokens * rates.cacheRead +
      b.cacheWriteTokens * rates.cacheWrite) /
    1_000_000
  );
}

/** One route's share of a canvas: its tokens, and its cost when the route has a price. */
export const RouteCost = z.object({
  provider: z.string(),
  model: z.string(),
  tokens: TokenBuckets,
  billing: z.literal('chatgpt-plan').optional(),
  /** USD; absent when the table has no price for this route. */
  usd: z.number().nonnegative().optional(),
});
export type RouteCost = z.infer<typeof RouteCost>;

/** P6.8: one agent's share of a canvas: its tokens (every session it ran) and its prompt-cache hit rate. */
export const AgentCost = z.object({
  agent: z.enum(['orb', 'scout', 'critic', 'builder', 'other']),
  tokens: TokenBuckets,
  /** Cached input ÷ total input; absent before the agent sent any input. */
  cacheHitRate: z.number().min(0).max(1).optional(),
});
export type AgentCost = z.infer<typeof AgentCost>;

/** `orb/cost.get {canvasId}`: the canvas's token and estimated cost meter. */
export const CanvasCost = z.object({
  canvasId: CanvasId,
  /** Σ of the harness `tokenUsage` totals over the root session and its child sessions. */
  tokens: TokenBuckets,
  total: z.number().int().nonnegative(),
  /** Estimated USD over the priced routes. */
  usd: z.number().nonnegative(),
  /** Routes with tokens but no price (their tokens are in `tokens`, not in `usd`). */
  unpriced: z.array(z.string()),
  routes: z.array(RouteCost),
  /** Sessions counted (root + children). */
  sessions: z.number().int().nonnegative(),
  /** P6.8: the canvas's prompt-cache hit rate (cached input ÷ total input); absent before any input. */
  cacheHitRate: z.number().min(0).max(1).optional(),
  /** P6.8: per agent (the agents that have run), orb first. */
  agents: z.array(AgentCost).optional(),
});
export type CanvasCost = z.infer<typeof CanvasCost>;

/** The short meter a Home tile carries. */
export const CostTile = z.object({
  total: z.number().int().nonnegative(),
  usd: z.number().nonnegative(),
  /** Some tokens are on a route with no price. */
  partial: z.boolean(),
  planOnly: z.boolean().optional(),
});
export type CostTile = z.infer<typeof CostTile>;

/** One row of the price table for Settings: the effective rates, where they came from, and the catalog's. */
export const PriceRow = z.object({
  key: z.string(),
  provider: z.string(),
  model: z.string(),
  rates: PriceRates,
  source: z.enum(['catalog', 'user']),
  /** The catalog list price, when pi-ai knows the model (for "Reset"). */
  catalog: PriceRates.optional(),
});
export type PriceRow = z.infer<typeof PriceRow>;

export const PricesDescribeResult = z.object({ prices: z.array(PriceRow) });
export type PricesDescribeResult = z.infer<typeof PricesDescribeResult>;

/** `orb/prices.set`: set a route's rates (`source: user`), or `null` to go back to the catalog price (or none). */
export const PricesSetArgs = z.strictObject({
  provider: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  model: z.string().trim().min(1).max(200).regex(/^\S+$/, 'no spaces'),
  rates: PriceRates.nullable(),
});
export type PricesSetArgs = z.infer<typeof PricesSetArgs>;

/** "12.4k tokens", "1.2M tokens", "830 tokens". */
export function formatTokens(n: number): string {
  if (n < 1000) return `${n} token${n === 1 ? '' : 's'}`;
  // Below 999.5k only: 999 999 must read "1M tokens", not "1000k tokens".
  if (n < 999_500) return `${(n / 1000).toFixed(n < 9_950 ? 1 : 0).replace(/\.0$/, '')}k tokens`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, '')}M tokens`;
}

/** "$0.00", "<$0.0001", "$0.0042" (cheap models: a canvas often costs under a cent), "$0.43", "$12.30". */
export function formatUsd(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.0001) return '<$0.0001';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
