/**
 * P4.3: a session's provider-reported token usage split by model route, so each route is priced at its own rate.
 *
 * It is the harness `tokenUsage` fold (dsh-token-meter/lib/index.js:413-445, `usageOf` :389-393, `addReplacing`
 * :353-358) run per route: each `assistant/attempt` / `assistant/message` settlement contributes the last usage sample
 * of its stream; a second sample for the same turn/step replaces the first (attempt → message); `llm/retry-started`
 * closes the slot so a retried attempt adds. The route of a sample is the newest `request/header` config
 * (`header.config.provider/model`) or `request/context` (`provider/model`) before it (dsh-session types.d.ts:216-242,
 * :393-405). Summed over routes, the totals equal the harness projection's (checked in tests).
 */
import { lastAssistantStreamChunk } from '@deepseek-ai/dsh-llm';
import { addBuckets, priceKey, zeroBuckets, type TokenBuckets } from '@orb/shared';

/** Route key for samples logged before any route record (never expected in a dsh 0.2 log). */
export const UNKNOWN_ROUTE = 'unknown/unknown';

type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};
type EventLike = { type: string; data: any };

export type RouteUsageState = {
  route: string;
  byRoute: Record<string, TokenBuckets>;
  last: { turn: number; step: number; route: string; buckets: TokenBuckets } | null;
};

export const initRouteUsage = (): RouteUsageState => ({ route: UNKNOWN_ROUTE, byRoute: {}, last: null });

function usageOf(event: EventLike): Usage | undefined {
  if (event.type === 'assistant/message' && event.data?.usage !== undefined) return event.data.usage as Usage;
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return undefined;
  const stream = event.data?.stream;
  if (!Array.isArray(stream)) return undefined;
  return (lastAssistantStreamChunk(stream, 'usage') as { usage?: Usage } | undefined)?.usage;
}

const bucketsFrom = (u: Usage): TokenBuckets => ({
  uncachedInputTokens: u.inputTokens,
  outputTokens: u.outputTokens,
  cacheReadTokens: u.cacheReadTokens ?? 0,
  cacheWriteTokens: u.cacheWriteTokens ?? 0,
});

const sameBuckets = (a: TokenBuckets, b: TokenBuckets) =>
  a.uncachedInputTokens === b.uncachedInputTokens &&
  a.outputTokens === b.outputTokens &&
  a.cacheReadTokens === b.cacheReadTokens &&
  a.cacheWriteTokens === b.cacheWriteTokens;

const minus = (a: TokenBuckets, b: TokenBuckets): TokenBuckets => ({
  uncachedInputTokens: a.uncachedInputTokens - b.uncachedInputTokens,
  outputTokens: a.outputTokens - b.outputTokens,
  cacheReadTokens: a.cacheReadTokens - b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens - b.cacheWriteTokens,
});

/** Fold one event (mutates and returns `state`). */
export function applyRouteUsage(state: RouteUsageState, event: EventLike): RouteUsageState {
  switch (event.type) {
    case 'request/header': {
      const config = event.data?.header?.config;
      if (typeof config?.provider === 'string' && typeof config?.model === 'string')
        state.route = priceKey(config.provider, config.model);
      return state;
    }
    case 'request/context': {
      if (typeof event.data?.provider === 'string' && typeof event.data?.model === 'string')
        state.route = priceKey(event.data.provider, event.data.model);
      return state;
    }
    case 'llm/retry-started': {
      if (state.last && state.last.turn === event.data?.turn && state.last.step === event.data?.step)
        state.last = null;
      return state;
    }
    case 'assistant/message':
    case 'assistant/attempt': {
      const sample = usageOf(event);
      if (sample === undefined) return state;
      const { turn, step } = event.data as { turn: number; step: number };
      const buckets = bucketsFrom(sample);
      const previous =
        state.last && state.last.turn === turn && state.last.step === step ? state.last : undefined;
      if (previous && sameBuckets(previous.buckets, buckets)) return state;
      if (previous) {
        state.byRoute[previous.route] = minus(
          state.byRoute[previous.route] ?? zeroBuckets(),
          previous.buckets,
        );
      }
      state.byRoute[state.route] = addBuckets(state.byRoute[state.route] ?? zeroBuckets(), buckets);
      state.last = { turn, step, route: state.route, buckets };
      return state;
    }
    default:
      return state;
  }
}

/** Fold a whole log. */
export function foldRouteUsage(events: Iterable<EventLike>): RouteUsageState {
  const state = initRouteUsage();
  for (const event of events) applyRouteUsage(state, event);
  return state;
}
