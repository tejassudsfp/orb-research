/**
 * Parallel Search as Scout's `web_search` backend (spec §14.2): the `/v1/search` request built from a query with the
 * optional Parallel parameters, and the provider the harness web seam registers (`parallel`, first in
 * SEARCH_PROVIDER_ORDER when the key is set). Harness-free.
 */
import type { SearchProvider, SearchRequest, SearchResult, SearchSource } from '../search.js';
import { ParallelClient, type ParallelSearchResponse } from './client.js';
import { searchCost, type SearchMode } from './cost.js';
import { trimExcerpts } from './result.js';

/** The extra parameters `web_search` takes when Parallel is the provider. */
export type ParallelSearchExtras = {
  objective?: string;
  queries?: string[];
  depth?: 'fast' | 'advanced';
  afterDate?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  country?: string;
};

export function buildSearchBody(
  query: string,
  maxResults: number,
  x: ParallelSearchExtras,
  sessionId?: string,
) {
  const mode: SearchMode = x.depth ?? 'fast';
  const include = (x.includeDomains ?? []).slice(0, 200);
  const exclude = (x.excludeDomains ?? []).slice(0, Math.max(0, 200 - include.length));
  const policy =
    include.length || exclude.length || x.afterDate
      ? {
          ...(include.length ? { include_domains: include } : {}),
          ...(!include.length && exclude.length ? { exclude_domains: exclude } : {}),
          ...(x.afterDate ? { after_date: x.afterDate } : {}),
        }
      : undefined;
  const queries = (x.queries?.length ? x.queries : [query]).map((q) => q.slice(0, 200)).slice(0, 5);
  return {
    objective: (x.objective ?? query).slice(0, 5000),
    search_queries: queries,
    mode,
    ...(sessionId ? { session_id: sessionId } : {}),
    advanced_settings: {
      max_results: Math.max(1, Math.min(20, Math.floor(maxResults))),
      ...(x.country ? { location: x.country.toLowerCase() } : {}),
      ...(policy ? { source_policy: policy } : {}),
    },
  };
}

export function mapSearchResponse(res: ParallelSearchResponse, maxResults: number, snippetChars = 2000): SearchSource[] {
  return (res.results ?? []).slice(0, maxResults).flatMap((r) => {
    try {
      const u = new URL(r.url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return [];
    } catch {
      return [];
    }
    const snippet = trimExcerpts(r.excerpts, snippetChars);
    return [
      {
        url: r.url,
        ...(r.title ? { title: r.title.slice(0, 300) } : {}),
        ...(snippet ? { snippet } : {}),
        ...(r.publish_date ? { publishedAt: r.publish_date } : {}),
      },
    ];
  });
}

/** One Parallel search; returns the sources and what it cost (for the tool answer). */
export async function parallelWebSearch(
  client: ParallelClient,
  request: SearchRequest & ParallelSearchExtras,
  sessionId: string | undefined,
  signal?: AbortSignal,
): Promise<{ sources: SearchSource[]; searchId?: string; costUsd: number; warnings?: unknown[] }> {
  const max = request.maxResults ?? 8;
  const body = buildSearchBody(request.query, max, request, sessionId);
  const res = await client.search(body, { signal });
  return {
    sources: mapSearchResponse(res, max),
    ...(res.search_id ? { searchId: res.search_id } : {}),
    costUsd: searchCost(body.mode, res.results?.length ?? 0),
    ...(res.warnings?.length ? { warnings: res.warnings } : {}),
  };
}

/** The harness web-seam provider (usable only while it is the first configured provider). */
export class ParallelSearchProvider implements SearchProvider {
  readonly id = 'parallel';
  constructor(
    private readonly deps: { client: ParallelClient; inForce: () => boolean; sessionId?: () => string | undefined },
  ) {}
  available(): boolean {
    return this.deps.inForce();
  }
  async search(request: SearchRequest & ParallelSearchExtras, signal?: AbortSignal): Promise<SearchResult> {
    const out = await parallelWebSearch(this.deps.client, request, this.deps.sessionId?.(), signal);
    return { sources: out.sources, truncated: false };
  }
}
