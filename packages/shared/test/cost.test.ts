/** P4.3: price math, keys, schemas and the meter's text. */
import { describe, expect, it } from 'vitest';
import {
  costOf,
  formatTokens,
  formatUsd,
  OrbSettings,
  PricesSetArgs,
  PriceTable,
  priceKey,
  splitPriceKey,
  totalTokens,
} from '../src/index.js';

describe('cost', () => {
  it('prices each bucket per 1M tokens', () => {
    const tokens = {
      uncachedInputTokens: 2_000_000,
      outputTokens: 500_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 100_000,
    };
    expect(totalTokens(tokens)).toBe(3_600_000);
    expect(costOf(tokens, { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 })).toBeCloseTo(
      0.2 + 0.25 + 0.01 + 0.0125,
      12,
    );
  });

  it('keys split on the first slash (OpenRouter model ids have their own)', () => {
    expect(priceKey('openrouter', 'openai/gpt-6-luna')).toBe('openrouter/openai/gpt-6-luna');
    expect(splitPriceKey('openrouter/openai/gpt-6-luna')).toEqual({
      provider: 'openrouter',
      model: 'openai/gpt-6-luna',
    });
  });

  it('validates the table and the edit', () => {
    const row = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, source: 'user' as const };
    expect(PriceTable.safeParse({ 'openai/gpt-6-luna': row }).success).toBe(true);
    expect(PriceTable.safeParse({ 'no-slash': row }).success).toBe(false);
    expect(PriceTable.safeParse({ 'openai/x': { ...row, input: -1 } }).success).toBe(false);
    expect(PricesSetArgs.safeParse({ provider: 'openai', model: 'gpt-6-luna', rates: null }).success).toBe(
      true,
    );
    expect(PricesSetArgs.safeParse({ provider: 'openai', model: 'a b', rates: null }).success).toBe(false);
    expect(OrbSettings.parse({}).prices).toEqual({});
  });

  it('formats the meter', () => {
    expect(formatTokens(1)).toBe('1 token');
    expect(formatTokens(830)).toBe('830 tokens');
    expect(formatTokens(1000)).toBe('1k tokens');
    expect(formatTokens(12_400)).toBe('12k tokens');
    expect(formatTokens(4_560)).toBe('4.6k tokens');
    expect(formatTokens(1_250_000)).toBe('1.3M tokens');
    // Rounding never shows "1000k" or "10.0k".
    expect(formatTokens(9_960)).toBe('10k tokens');
    expect(formatTokens(999_499)).toBe('999k tokens');
    expect(formatTokens(999_999)).toBe('1M tokens');
    expect(formatTokens(9_999_999)).toBe('10M tokens');
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.00004)).toBe('<$0.0001');
    expect(formatUsd(0.00423)).toBe('$0.0042');
    expect(formatUsd(0.426)).toBe('$0.43');
    expect(formatUsd(12.3)).toBe('$12.30');
  });
});
