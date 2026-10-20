/** Public, read-only Chromium research. The authenticated desktop bridge accepts no scripts or selectors. */
import { z } from 'zod';

export const CONTROL_BROWSE_PATH = '/browse';
export const BROWSER = {
  maxHtmlChars: 1_000_000,
  maxResponseBytes: 12 * 1024 * 1024,
  timeoutMs: 45_000,
} as const;
export const BrowserRequest = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('read'), url: z.string().min(1).max(2048) }),
  z.strictObject({
    action: z.literal('search'),
    query: z.string().trim().min(1).max(400),
    maxResults: z.number().int().min(1).max(10).default(6),
  }),
]);
export type BrowserRequest = z.infer<typeof BrowserRequest>;
export const BrowserAnswer = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('read'),
    url: z.string().max(4096),
    title: z.string().max(500),
    html: z.string().max(BROWSER.maxHtmlChars),
    truncated: z.boolean(),
  }),
  z.strictObject({
    action: z.literal('search'),
    query: z.string().max(400),
    engine: z.enum(['Bing', 'DuckDuckGo']),
    results: z
      .array(
        z.strictObject({
          url: z.string().max(4096),
          title: z.string().max(500),
          snippet: z.string().max(1500),
        }),
      )
      .max(10),
  }),
]);
export type BrowserAnswer = z.infer<typeof BrowserAnswer>;
