/** Chromium research through the shared sandboxed public-page loader. */
import type { BrowserRequest, BrowserAnswer } from '@orb/shared';
import { createPublicPageLoader } from './capture.js';
import { checkCaptureUrl } from './captureFilter.js';
import { ControlError } from './control.js';
import { BROWSER_SNAPSHOT, searchSource, searchTarget, type Snapshot } from './browserCore.js';

export function createBrowserResearch(log: (line: string) => void) {
  const load = createPublicPageLoader<Snapshot>(log, async (wc, signal, status) => {
    signal.throwIfAborted();
    if (status !== undefined && status >= 400)
      throw new ControlError(
        status,
        'HTTP_STATUS',
        `The browser page answered HTTP ${status}; this is not usable research evidence.`,
      );
    const snapshot = async () =>
      (await wc.executeJavaScriptInIsolatedWorld(999, [{ code: BROWSER_SNAPSHOT }])) as Snapshot;
    let value = await snapshot();
    let stable = 0;
    for (let attempt = 0; attempt < 8 && !value.challenge && stable < 2; attempt++) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort);
          resolve();
        }, 400);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
      signal.throwIfAborted();
      const next = await snapshot();
      stable =
        next.textLength >= 200 && !next.pending && next.textLength === value.textLength ? stable + 1 : 0;
      value = next;
    }
    checkCaptureUrl(value.url);
    if (value.challenge)
      throw new ControlError(
        403,
        'BROWSER_BLOCKED',
        'This site requires human verification or has blocked browser access. Open the source yourself or use another source; repeating the request will not solve it.',
      );
    if (!value.textLength || value.pending)
      throw new ControlError(
        422,
        'BROWSER_EMPTY',
        'The browser page has no finished readable content. It may require sign-in or did not finish rendering.',
      );
    return value;
  });
  const blockedUntil = new Map<string, number>();
  return async (request: BrowserRequest, signal: AbortSignal): Promise<BrowserAnswer> => {
    if (request.action === 'read') {
      const page = await load(request.url, signal);
      return { action: 'read', url: page.url, title: page.title, html: page.html, truncated: page.truncated };
    }
    const failures: string[] = [];
    for (const engine of ['Bing', 'DuckDuckGo'] as const) {
      signal.throwIfAborted();
      if ((blockedUntil.get(engine) ?? 0) > Date.now()) {
        failures.push(engine + ' is temporarily backed off');
        continue;
      }
      try {
        const page = await load(searchTarget(request.query, engine), signal);
        const seen = new Set<string>();
        const results = page.candidates
          .flatMap((candidate) => {
            const url = searchSource(candidate.url);
            if (!url || !candidate.title || seen.has(url)) return [];
            seen.add(url);
            return [{ url, title: candidate.title, snippet: candidate.snippet }];
          })
          .slice(0, request.maxResults);
        if (!results.length)
          throw new ControlError(
            422,
            'BROWSER_EMPTY',
            'No readable web results were found. The query may have no results or the search page layout may have changed.',
          );
        return { action: 'search', query: request.query, engine, results };
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        failures.push(
          `${engine}: ${error instanceof ControlError ? error.message : 'could not load the search page'}`,
        );
        if (error instanceof ControlError && error.code === 'BROWSER_BLOCKED')
          blockedUntil.set(engine, Date.now() + 60_000);
      }
    }
    throw new ControlError(502, 'BROWSER_SEARCH_FAILED', failures.join(' ').slice(0, 500));
  };
}
