/**
 * Cordis row `orb-web-search` (`@orb/canvas/web`, BUILD_PLAN P3.5): registers Orb's search providers with the
 * harness web seam (`ctx.web.registerSearchProvider`, @deepseek-ai/dsh-web) and provides `orbSearch`, the small
 * service `web_search` asks which provider is in force.
 *
 * Providers (packages/orb-sources/src/search.ts): Parallel Search (`PARALLEL_API_KEY`, P6.7: first when configured), Brave Search (`BRAVE_API_KEY`), Tavily (`TAVILY_API_KEY`) and
 * OpenAI web search (`OPENAI_API_KEY`, the Responses API on the OpenAI host Orb already uses for its model).
 * Keys are resolved through the harness CredentialProvider (`ctx.credentials`; the Keychain-backed provider from
 * orb-keychain replaces it in P4.1) at EVERY search and never cached; only "is it configured" is cached, because
 * dsh-web's `available()` must be synchronous. That cache is refreshed at mount, whenever the credential service
 * reports a changed reference (`credentials/reference-updated`), and before every `web_search` call.
 *
 * dsh-web runs a search only when exactly one provider is usable, so each provider is usable only while it is the
 * first configured one (Parallel, then Brave, Tavily, OpenAI). With no key at all, no provider is usable and
 * `web_search` answers that no search provider is configured. The profile patch unpins the web seam's
 * `searchProvider` (dsh-base pins `deepseek-official`, whose row Orb disables).
 */
import {
  ParallelClient,
  ParallelSearchProvider,
  BraveSearchProvider,
  DEFAULT_ENDPOINTS,
  OpenAiSearchProvider,
  SEARCH_KEY_REFS,
  SEARCH_PROVIDER_LABELS,
  SEARCH_PROVIDER_ORDER,
  TavilySearchProvider,
  selectSearchProvider,
  type SearchProviderName,
} from '@orb/sources';
import { DEFAULT_AGENT_MODEL } from '@orb/shared';

export const name = 'orb-web-search';
export const inject = ['web', 'credentials'];
export const ORB_SEARCH_SERVICE = 'orbSearch';

export type ProviderConfig = { apiKeyEnv?: string; endpoint?: string };
export type OrbWebSearchConfig = {
  /** P6.7: Parallel Search (`PARALLEL_API_KEY`); `endpoint` is the base URL (tests: the mock Parallel). */
  parallel?: ProviderConfig;
  brave?: ProviderConfig;
  tavily?: ProviderConfig;
  openai?: ProviderConfig & { model?: string };
};

/** The slice of the harness CredentialProvider this row uses (values are never logged or returned). */
export type CredentialsLike = {
  resolve(ref: string): Promise<{ value: string } | undefined>;
  describe(ref: string): Promise<{ configured: boolean }>;
};

/** Which search keys are configured, and which provider is in force. */
export class OrbSearch {
  private configured: Partial<Record<SearchProviderName, boolean>> = {};
  private refreshing: Promise<void> | undefined;
  /** P6.7: the Parallel client `web_search` calls directly (its extra parameters do not fit the harness seam). */
  parallel: ParallelClient | undefined;

  constructor(
    private readonly credentials: CredentialsLike | undefined,
    readonly refs: Record<SearchProviderName, string>,
  ) {}

  /** The provider dsh-web will run now (synchronous; from the last refresh). */
  current(): SearchProviderName | undefined {
    return selectSearchProvider(this.configured);
  }

  label(provider: SearchProviderName): string {
    return SEARCH_PROVIDER_LABELS[provider];
  }

  /** Re-read which keys are configured (describe only: no value is read). Concurrent calls share one read. */
  refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      const next: Partial<Record<SearchProviderName, boolean>> = {};
      for (const provider of SEARCH_PROVIDER_ORDER) {
        try {
          next[provider] = (await this.credentials?.describe(this.refs[provider]))?.configured === true;
        } catch {
          next[provider] = false;
        }
      }
      this.configured = next;
    })().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  /** The key for one operation (resolved now, never kept). */
  async apiKey(provider: SearchProviderName): Promise<string | undefined> {
    const resolved = await this.credentials?.resolve(this.refs[provider]);
    return resolved?.value || undefined;
  }
}

export function apply(ctx: any, config: OrbWebSearchConfig = {}) {
  const refs: Record<SearchProviderName, string> = {
    parallel: config.parallel?.apiKeyEnv || SEARCH_KEY_REFS.parallel,
    brave: config.brave?.apiKeyEnv || SEARCH_KEY_REFS.brave,
    tavily: config.tavily?.apiKeyEnv || SEARCH_KEY_REFS.tavily,
    openai: config.openai?.apiKeyEnv || SEARCH_KEY_REFS.openai,
  };
  const search = new OrbSearch(ctx.credentials as CredentialsLike | undefined, refs);
  const deps = (provider: SearchProviderName, endpoint: string) => ({
    apiKey: () => search.apiKey(provider),
    inForce: () => search.current() === provider,
    endpoint,
  });
  const parallelBase = config.parallel?.endpoint || process.env.PARALLEL_BASE_URL || undefined;
  const parallel = new ParallelClient({
    apiKey: () => search.apiKey('parallel'),
    ...(parallelBase ? { baseUrl: parallelBase } : {}),
  });
  search.parallel = parallel;
  ctx.web.registerSearchProvider(
    new ParallelSearchProvider({ client: parallel, inForce: () => search.current() === 'parallel' }),
  );
  ctx.web.registerSearchProvider(
    new BraveSearchProvider(deps('brave', config.brave?.endpoint || DEFAULT_ENDPOINTS.brave)),
  );
  ctx.web.registerSearchProvider(
    new TavilySearchProvider(deps('tavily', config.tavily?.endpoint || DEFAULT_ENDPOINTS.tavily)),
  );
  ctx.web.registerSearchProvider(
    new OpenAiSearchProvider({
      ...deps('openai', config.openai?.endpoint || DEFAULT_ENDPOINTS.openai),
      model: config.openai?.model || DEFAULT_AGENT_MODEL.model,
    }),
  );
  ctx.on('credentials/reference-updated', () => void search.refresh());
  ctx.provide(ORB_SEARCH_SERVICE, search);
  void search.refresh();
}
