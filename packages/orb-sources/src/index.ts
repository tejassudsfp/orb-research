/**
 * @orb/sources (BUILD_PLAN P3.5): the harness-free half of Scout's research tools. Fetching (private-address block,
 * pinned DNS, careful redirects, 5 MB cap), extraction (pdf.js text, Readability + turndown), the per-canvas source
 * cache with 8k chunks, the Brave / Tavily / OpenAI search providers and the capture client. orb-canvas's rows
 * (`@orb/canvas/sources`, `@orb/canvas/web`) mount them in the harness.
 */
export const name = '@orb/sources';
export * from './errors.js';
export * from './policy.js';
export * from './fetcher.js';
export * from './extract.js';
export * from './cache.js';
export * from './search.js';
export * from './capture.js';
export * from './browser.js';
export * from './parallel/index.js';
export * from './signedIn.js';
