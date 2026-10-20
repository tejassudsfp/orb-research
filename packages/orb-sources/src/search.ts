/**
 * Web search providers for Scout's `web_search` (BUILD_PLAN P3.5; PRD Sources). They have the shape of dsh-web's
 * `WebSearchProvider` (id, a cheap synchronous `available()`, `search(request, signal)`) and are registered with
 * `ctx.web.registerSearchProvider` by orb-canvas's `orb-web-search` row; this module has no harness import.
 *
 * - Brave Search (`BRAVE_API_KEY`) and Tavily (`TAVILY_API_KEY`): the optional search keys of Settings.
 * - OpenAI web search (`OPENAI_API_KEY`): the Responses API's built-in `web_search` tool on the OpenAI host that
 *   is already Orb's model provider, so it adds no new destination. Each search is one model call.
 *
 * dsh-web runs a search only when EXACTLY ONE provider is usable (`WEB_PROVIDER_AMBIGUOUS` otherwise), so each
 * provider is usable only when it is the first configured one in {@link SEARCH_PROVIDER_ORDER}: a dedicated search
 * key wins over the OpenAI fallback, Brave over Tavily.
 */
import { SourceError } from './errors.js';

export type SearchRequest = {
  readonly query: string;
  readonly maxResults?: number;
  /** P6.7: Parallel-only options (other providers ignore them). */
  readonly objective?: string;
  readonly queries?: string[];
  readonly depth?: 'fast' | 'advanced';
  readonly afterDate?: string;
  readonly includeDomains?: string[];
  readonly excludeDomains?: string[];
  readonly country?: string;
};
export type SearchSource = { url: string; title?: string; snippet?: string; publishedAt?: string };
export type SearchResult = { content?: string; sources: SearchSource[]; truncated: boolean };

/** Structurally a dsh-web `WebSearchProvider`. */
export interface SearchProvider {
  readonly id: string;
  available(): boolean;
  search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
}

export const SEARCH_PROVIDER_IDS = { parallel: 'parallel', brave: 'brave', tavily: 'tavily', openai: 'openai-web-search' } as const;
export type SearchProviderName = keyof typeof SEARCH_PROVIDER_IDS;
/** First configured wins. */
export const SEARCH_PROVIDER_ORDER: readonly SearchProviderName[] = ['parallel', 'brave', 'tavily', 'openai'];
/** The credential reference (env-style name) each provider reads through the harness CredentialProvider. */
export const SEARCH_KEY_REFS: Record<SearchProviderName, string> = {
  parallel: 'PARALLEL_API_KEY',
  brave: 'BRAVE_API_KEY',
  tavily: 'TAVILY_API_KEY',
  openai: 'OPENAI_API_KEY',
};
export const SEARCH_PROVIDER_LABELS: Record<SearchProviderName, string> = {
  parallel: 'Parallel',
  brave: 'Brave Search',
  tavily: 'Tavily',
  openai: 'OpenAI web search',
};

export const DEFAULT_ENDPOINTS = {
  parallel: 'https://api.parallel.ai',
  brave: 'https://api.search.brave.com/res/v1/web/search',
  tavily: 'https://api.tavily.com/search',
  openai: 'https://api.openai.com/v1',
} as const;

/** The provider in force for a set of configured keys, or undefined when none is configured. */
export function selectSearchProvider(
  configured: Partial<Record<SearchProviderName, boolean>>,
): SearchProviderName | undefined {
  return SEARCH_PROVIDER_ORDER.find((name) => configured[name]);
}

export type ProviderDeps = {
  /** Resolve the key for THIS operation (never cached across operations). */
  apiKey: () => Promise<string | undefined>;
  /** Synchronous: is this provider the one in force right now (configured and first in order)? */
  inForce: () => boolean;
  endpoint?: string;
  fetch?: typeof fetch;
};

const MAX_RESULTS_DEFAULT = 8;
const SEARCH_TIMEOUT_MS = 45_000;

const stripTags = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const httpUrl = (u: unknown): string | undefined => {
  if (typeof u !== 'string') return undefined;
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
};

async function call(
  deps: ProviderDeps,
  label: string,
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<any> {
  const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  const all = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await (deps.fetch ?? fetch)(url, { ...init, redirect: 'error', signal: all });
  } catch (err) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted)
      throw new SourceError('TIMEOUT', `${label} did not answer within ${SEARCH_TIMEOUT_MS / 1000} s`);
    throw new SourceError('PROVIDER_ERROR', `${label} could not be reached: ${(err as Error).message}`, {
      cause: err,
    });
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as any;
      const d = body?.error?.message ?? body?.error?.detail ?? body?.detail ?? body?.message ?? body?.error;
      if (typeof d === 'string') detail = `: ${d.slice(0, 300)}`;
      else if (typeof d?.error === 'string') detail = `: ${d.error.slice(0, 300)}`;
    } catch {
      // no JSON body
    }
    const hint = res.status === 401 || res.status === 403 ? ' (check the key in Settings)' : '';
    throw new SourceError('PROVIDER_ERROR', `${label} answered HTTP ${res.status}${detail}${hint}`);
  }
  try {
    return await res.json();
  } catch (err) {
    throw new SourceError('PROVIDER_ERROR', `${label} sent a response orb could not read`, { cause: err });
  }
}

async function keyOf(deps: ProviderDeps, name: SearchProviderName): Promise<string> {
  const key = await deps.apiKey();
  if (!key)
    throw new SourceError(
      'NOT_CONFIGURED',
      `${SEARCH_PROVIDER_LABELS[name]} has no key (${SEARCH_KEY_REFS[name]})`,
    );
  return key;
}

const clampResults = (n?: number) => Math.max(1, Math.min(20, Math.floor(n ?? MAX_RESULTS_DEFAULT)));

/** Brave Search web results. */
export class BraveSearchProvider implements SearchProvider {
  readonly id = SEARCH_PROVIDER_IDS.brave;
  constructor(private readonly deps: ProviderDeps) {}
  available(): boolean {
    return this.deps.inForce();
  }
  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
    const key = await keyOf(this.deps, 'brave');
    const url = new URL(this.deps.endpoint ?? DEFAULT_ENDPOINTS.brave);
    url.searchParams.set('q', request.query);
    url.searchParams.set('count', String(clampResults(request.maxResults)));
    const body = await call(
      this.deps,
      'Brave Search',
      url.href,
      { method: 'GET', headers: { accept: 'application/json', 'x-subscription-token': key } },
      signal,
    );
    const results: any[] = Array.isArray(body?.web?.results) ? body.web.results : [];
    const sources: SearchSource[] = [];
    for (const r of results) {
      const u = httpUrl(r?.url);
      if (!u) continue;
      sources.push({
        url: u,
        ...(typeof r.title === 'string' && r.title ? { title: stripTags(r.title).slice(0, 300) } : {}),
        ...(typeof r.description === 'string' && r.description
          ? { snippet: stripTags(r.description).slice(0, 600) }
          : {}),
        ...(typeof r.page_age === 'string'
          ? { publishedAt: r.page_age }
          : typeof r.age === 'string'
            ? { publishedAt: r.age }
            : {}),
      });
    }
    return { sources, truncated: false };
  }
}

/** Tavily search results. */
export class TavilySearchProvider implements SearchProvider {
  readonly id = SEARCH_PROVIDER_IDS.tavily;
  constructor(private readonly deps: ProviderDeps) {}
  available(): boolean {
    return this.deps.inForce();
  }
  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
    const key = await keyOf(this.deps, 'tavily');
    const body = await call(
      this.deps,
      'Tavily',
      this.deps.endpoint ?? DEFAULT_ENDPOINTS.tavily,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          query: request.query,
          max_results: clampResults(request.maxResults),
          search_depth: 'basic',
          include_answer: false,
        }),
      },
      signal,
    );
    const results: any[] = Array.isArray(body?.results) ? body.results : [];
    const sources: SearchSource[] = [];
    for (const r of results) {
      const u = httpUrl(r?.url);
      if (!u) continue;
      sources.push({
        url: u,
        ...(typeof r.title === 'string' && r.title ? { title: r.title.trim().slice(0, 300) } : {}),
        ...(typeof r.content === 'string' && r.content ? { snippet: r.content.trim().slice(0, 600) } : {}),
        ...(typeof r.published_date === 'string' ? { publishedAt: r.published_date } : {}),
      });
    }
    return {
      ...(typeof body?.answer === 'string' && body.answer ? { content: body.answer.slice(0, 4000) } : {}),
      sources,
      truncated: false,
    };
  }
}

/** OpenAI adds `utm_source=openai` to cited links; drop it so the card links stay clean. */
export function cleanCitationUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.get('utm_source') === 'openai') u.searchParams.delete('utm_source');
    return u.href;
  } catch {
    return url;
  }
}

/** The line of `text` around a citation's range, without Markdown link syntax. */
function citedLine(text: string, start: number, end: number): string {
  const from = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const nl = text.indexOf('\n', end);
  const line = text.slice(from, nl === -1 ? text.length : nl);
  return line
    .replace(/\(\[[^\]]*\]\([^)]*\)\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/^[\s*\-\d.)#]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
    .slice(0, 600);
}

/**
 * Map a Responses API answer to a search result: every `url_citation` annotation of the output text is a source
 * (title, and the cited line as its snippet), then any further URL the `web_search_call` actions list
 * (`include: web_search_call.action.sources`). An answer with no `web_search_call` did not search: that is an error,
 * never a result made up from the model's memory.
 */
export function mapResponsesSearch(body: any, maxResults?: number): SearchResult {
  const output: any[] = Array.isArray(body?.output) ? body.output : [];
  const calls = output.filter((o) => o?.type === 'web_search_call');
  if (calls.length === 0)
    throw new SourceError(
      'PROVIDER_ERROR',
      'OpenAI web search returned no search call; the model did not search',
    );
  const seen = new Set<string>();
  const sources: SearchSource[] = [];
  let content = '';
  for (const item of output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type !== 'output_text' || typeof part.text !== 'string') continue;
      content += (content ? '\n' : '') + part.text;
      for (const a of Array.isArray(part.annotations) ? part.annotations : []) {
        if (a?.type !== 'url_citation') continue;
        const u = httpUrl(a.url);
        if (!u) continue;
        const url = cleanCitationUrl(u);
        if (seen.has(url)) continue;
        seen.add(url);
        const snippet =
          Number.isInteger(a.start_index) && Number.isInteger(a.end_index)
            ? citedLine(part.text, a.start_index, a.end_index)
            : '';
        sources.push({
          url,
          ...(typeof a.title === 'string' && a.title ? { title: a.title.trim().slice(0, 300) } : {}),
          ...(snippet ? { snippet } : {}),
        });
      }
    }
  }
  for (const call of calls) {
    const listed: any[] = Array.isArray(call?.action?.sources) ? call.action.sources : [];
    for (const s of listed) {
      const u = httpUrl(s?.url);
      if (!u) continue;
      const url = cleanCitationUrl(u);
      if (seen.has(url)) continue;
      seen.add(url);
      sources.push({ url });
    }
  }
  // The search call lists every page it looked at (often dozens); keep the cited ones first, at most maxResults.
  const limit = maxResults === undefined ? sources.length : clampResults(maxResults);
  return {
    ...(content ? { content: content.slice(0, 4000) } : {}),
    sources: sources.slice(0, limit),
    truncated: sources.length > limit,
  };
}

/** OpenAI Responses API with the built-in `web_search` tool. */
export class OpenAiSearchProvider implements SearchProvider {
  readonly id = SEARCH_PROVIDER_IDS.openai;
  constructor(private readonly deps: ProviderDeps & { model: string }) {}
  available(): boolean {
    return this.deps.inForce();
  }
  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
    const key = await keyOf(this.deps, 'openai');
    const base = (this.deps.endpoint ?? DEFAULT_ENDPOINTS.openai).replace(/\/+$/, '');
    const n = clampResults(request.maxResults);
    const body = await call(
      this.deps,
      'OpenAI web search',
      `${base}/responses`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: this.deps.model,
          input:
            `Search the web for: ${request.query}\n\n` +
            `List up to ${n} of the most relevant, reliable results (prefer primary sources). For each, one line: ` +
            'the page title, then one sentence on what it says, citing the page. No other text.',
          tools: [{ type: 'web_search' }],
          tool_choice: 'required',
          include: ['web_search_call.action.sources'],
          store: false,
        }),
      },
      signal,
    );
    return mapResponsesSearch(body, n);
  }
}
