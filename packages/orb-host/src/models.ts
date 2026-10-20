/**
 * Cordis row `orb-models` (`@orb/host/models`, BUILD_PLAN P4.2): provides `orbModels`, the model side of Settings.
 *
 * - **Routes** live where dsh 0.2 reads them: the `llm-pi-ai` row's `providers` dict (a volatile field). Orb edits it
 *   through the harness settings service (`ctx.settings.mutate`, dsh-settings `SettingsForms`), which writes the
 *   profile patch (`DSH_HOME/profiles/orb/cordis.patch.yml`, dsh-config-editor `ConfigEditor.edit`) and reconciles the
 *   row in place: llm-pi-ai re-registers its routes on `loader/volatile-update`, so a change applies to the next
 *   request with no restart (`$DSH_HOME/settings.yaml` is legacy in 0.2, see SPIKE_NOTES).
 * - **Custom providers** are also kept in orb.json (no secrets): the desktop app rewrites the profile template at every
 *   launch, so they are restated into `llm-pi-ai` once the loader settles (`ready`).
 * - **Test** (`keys.test`): one `ctx.llm.stream({provider, model, maxTokens: 1})` request, its failure code mapped to
 *   a plain message. The last result per provider is kept in memory for the cards.
 * - **Discovery**: the configured provider's authenticated directory, persisted for offline use and registered
 *   through llm-pi-ai settings so release-time catalogs cannot prevent newer IDs from running.
 * - **Defaults per tier**: `routeFor(role)` gives orb-agents the route of a role with no orb.json pick.
 *
 * Keys never leave the sidecar: descriptors are redacted, and provider error text is scrubbed of anything key-like.
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { getBuiltinModels } from '@earendil-works/pi-ai/providers/all';
import type { CanvasStore } from '@orb/canvas';
import {
  AGENT_NAMES_ORDERED,
  customRouteProfile,
  CustomProvider,
  defaultRouteFor,
  FAILURE_MESSAGES,
  failureKindOf,
  keyRefFor,
  NO_KEY_PLACEHOLDER,
  presetOf,
  PROVIDER_PRESETS,
  scrubSecrets,
  type AgentName,
  type DiscoveredModel,
  type EffectiveRoute,
  type KeysTestArgs,
  type KeysTestResult,
  type ModelsDescribeResult,
  type ModelsDiscoverArgs,
  type ProviderInfo,
  type ProviderTestStatus,
  type SavedModelCatalog,
  type ProviderApi,
} from '@orb/shared';
import { describeKey, type CredentialsLike } from './keys.js';
import { fetchProviderModels, MODEL_ENDPOINTS } from './modelDiscovery.js';
import { OrbChatGPT } from './chatgpt.js';

export const name = 'orb-models';
export const ORB_MODELS_SERVICE = 'orbModels';
/** The settings namespace (row id) of dsh's generic provider adapter. */
export const LLM_NS = 'llm-pi-ai';
/** How long a Test may take before it reads as unreachable. */
export const TEST_TIMEOUT_MS = 20_000;

type RouteProfile = {
  [key: string]: unknown;
  apiKeyEnv?: string;
  displayName?: string;
  api?: string;
  baseURL?: string;
  models?: unknown;
  headers?: Record<string, string>;
};

/** The slice of dsh-settings `SettingsForms` Orb uses. */
type SettingsFormsLike = {
  describe(): Array<{ ns: string; value: Record<string, unknown> }>;
  mutate(
    ns: string,
    ops: Array<{ op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] }>,
  ): Promise<void>;
};

/** The slice of dsh-llm `LlmRuntime` Orb uses. */
type LlmLike = {
  stream(options: Record<string, unknown>): AsyncIterable<any>;
  discoverModels(
    ns: string,
    request: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Array<{ id: string; name?: string; contextWindow?: number }>>;
};

export class ModelsError extends Error {
  constructor(
    readonly code: 'orb/invalid-args' | 'orb/not-found' | 'orb/models-unavailable',
    message: string,
  ) {
    super(message);
  }
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export class OrbModels {
  readonly chatgpt: OrbChatGPT;
  /** Settles once orb.json's custom providers are restated into llm-pi-ai (or that failed and was logged). */
  readonly ready: Promise<void>;
  private forms: SettingsFormsLike | undefined;
  private readonly statuses = new Map<string, ProviderTestStatus>();
  /** Serializes route edits (one ConfigEditor write at a time, in order). */
  private edits: Promise<unknown> = Promise.resolve();
  private catalogModels = new Map<string, string[]>();
  private readonly generations = new Map<string, number>();
  private readonly discoveries = new Map<string, Promise<DiscoveredModel[]>>();
  private settleForms!: () => void;
  private readonly formsReady = new Promise<void>((resolve) => (this.settleForms = resolve));

  constructor(private readonly ctx: any) {
    this.chatgpt = new OrbChatGPT(ctx);
    if (typeof ctx.inject === 'function') {
      ctx.inject(['settings'], (child: any) => {
        this.forms = child.settings as SettingsFormsLike;
        this.settleForms();
        child.effect?.(() => () => {
          this.forms = undefined;
        });
      });
    }
    this.ready = Promise.all([this.restateCustoms(), this.loadStatuses()])
      .then(() => this.restoreCatalogs())
      .catch((err: unknown) => {
        this.log('warn', `could not restate custom providers: ${(err as Error)?.message ?? String(err)}`);
      });
  }

  private get llm(): LlmLike {
    return this.ctx.llm as LlmLike;
  }
  private get credentials(): CredentialsLike {
    return this.ctx.credentials as CredentialsLike;
  }
  private get canvas(): CanvasStore {
    return this.ctx.orbCanvas as CanvasStore;
  }

  private log(level: 'info' | 'warn', message: string) {
    const logger = typeof this.ctx.logger === 'function' ? this.ctx.logger('orb-models') : undefined;
    logger?.[level]?.(message);
  }

  /** Wait (bounded) for the settings service and the loader, so every route row is active. */
  private async settled(): Promise<SettingsFormsLike> {
    await Promise.race([this.formsReady, new Promise((r) => setTimeout(r, 10_000))]);
    await this.ctx.root?.loader?.await?.();
    if (!this.forms)
      throw new ModelsError('orb/models-unavailable', 'the harness settings service is not available');
    return this.forms;
  }

  /** Live `llm-pi-ai` provider profiles, keyed by route. */
  routes(): Record<string, RouteProfile> {
    try {
      const entry = this.forms?.describe().find((d) => d.ns === LLM_NS);
      const providers = (entry?.value as { providers?: Record<string, RouteProfile> } | undefined)?.providers;
      return providers ? { ...providers } : {};
    } catch {
      return {};
    }
  }

  /** Apply route edits to `llm-pi-ai` (in order, one at a time). */
  private editRoutes(
    ops: Array<{ op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] }>,
    assertCurrent?: () => void,
  ): Promise<void> {
    const run = this.edits
      .catch(() => undefined)
      .then(async () => {
        const forms = await this.settled();
        assertCurrent?.();
        if (ops.length > 0) await forms.mutate(LLM_NS, ops);
      });
    this.edits = run;
    return run;
  }

  /** P6.9: the last test of every provider survives a restart (orb.json `keyTests`; a key change forgets it). */
  private async loadStatuses(): Promise<void> {
    const { keyTests } = await this.canvas.settings.get();
    for (const [provider, status] of Object.entries(keyTests ?? {})) {
      if (!this.statuses.has(provider)) this.statuses.set(provider, status);
    }
  }

  private persistStatuses(): void {
    // After `ready` (the saved results are read first), so an early change never drops other providers' results.
    void this.ready
      .then(() =>
        this.canvas.settings.update((cur) => ({ ...cur, keyTests: Object.fromEntries(this.statuses) })),
      )
      .catch((err: unknown) =>
        this.log('warn', `could not save key test results: ${(err as Error)?.message ?? err}`),
      );
  }

  private async restateCustoms(): Promise<void> {
    await this.settled();
    const settings = await this.canvas.settings.get();
    const routes = this.routes();
    const ops = settings.customProviders
      .filter((p) => !sameJson(routes[p.id], customRouteProfile(p)))
      .map((p) => ({ op: 'set' as const, path: ['providers', p.id], value: customRouteProfile(p) }));
    if (ops.length === 0) return;
    await this.editRoutes(ops);
    this.log('info', `restated ${ops.length} custom provider route(s)`);
  }

  /**
   * Add the catalog route of a provider card when the live config lacks it (e.g. a profile that only names openai).
   * P6.8: with long prompt-cache retention, like the profile template's routes.
   */
  async ensureRoute(provider: string): Promise<void> {
    const preset = presetOf(provider);
    if (!preset) return;
    await this.settled();
    if (this.routes()[provider]) return;
    await this.editRoutes([
      { op: 'set', path: ['providers', provider], value: { apiKeyEnv: preset.ref, cacheRetention: 'long' } },
    ]);
  }

  /** A key changed: forget the provider's last test, and make sure its route exists. */
  async keyChanged(provider: string): Promise<void> {
    this.generations.set(provider, (this.generations.get(provider) ?? 0) + 1);
    this.discoveries.delete(provider);
    await this.canvas.settings.update((current) => {
      const modelCatalogs = { ...current.modelCatalogs };
      delete modelCatalogs[provider];
      return { ...current, modelCatalogs };
    });
    this.statuses.delete(provider);
    this.persistStatuses();
    await this.ensureRoute(provider).catch((err: unknown) =>
      this.log('warn', `could not add the ${provider} route: ${(err as Error)?.message ?? String(err)}`),
    );
  }

  private async isConfigured(ref: string | undefined): Promise<boolean> {
    if (!ref) return false;
    try {
      return (await this.credentials.describe(ref)).configured;
    } catch {
      return false;
    }
  }

  /** Usable provider ids in card order (presets, customs, then any other route), with their key state. */
  private async usableProviders(): Promise<string[]> {
    const routes = this.routes();
    const customs = (await this.canvas.settings.get()).customProviders;
    const ids = [
      ...PROVIDER_PRESETS.map((p) => p.id as string),
      ...customs.map((c) => c.id),
      ...Object.keys(routes),
    ].filter((id, i, all) => all.indexOf(id) === i && routes[id] !== undefined);
    const usable = await Promise.all(
      ids.map(async (id) => ((await this.isConfigured(routes[id]!.apiKeyEnv)) ? id : undefined)),
    );
    return usable.filter((id): id is string => id !== undefined);
  }

  harnessDefault(): { provider: string; model: string } {
    const sel = this.ctx.agentDefaultModel?.currentSelection?.() as
      { provider?: string; model?: string } | undefined;
    return sel?.provider && sel.model
      ? { provider: sel.provider, model: sel.model }
      : { provider: 'openai', model: 'gpt-6-luna' };
  }

  /** The route a role starts on (orb.json pick, else the default for its tier). Read at every agent start. */
  async routeFor(role: AgentName): Promise<EffectiveRoute> {
    await this.ready;
    const settings = await this.canvas.settings.get();
    const chosen = settings.models[role];
    if (chosen) return { provider: chosen.provider, model: chosen.model, source: 'chosen' };
    const usable = await this.usableProviders();
    if (usable.length === 0) {
      const plan = await this.chatgpt.provider();
      if (plan?.usable && plan.models[0]) return { provider: plan.id, model: plan.models[0], source: 'tier' };
    }
    return defaultRouteFor(role, {
      harnessDefault: this.harnessDefault(),
      usable,
      customs: settings.customProviders,
    });
  }

  private async modelsOf(provider: string): Promise<string[]> {
    const saved = await this.savedCatalog(provider);
    if (saved) return saved.models.map((model) => model.id);
    const cached = this.catalogModels.get(provider);
    if (cached) return cached;
    try {
      const listed = await this.llm.discoverModels(LLM_NS, { provider });
      const ids = listed.map((m) => m.id);
      this.catalogModels.set(provider, ids);
      return ids;
    } catch {
      return [];
    }
  }

  private endpoint(provider: string): { baseURL: string; api: ProviderApi } | undefined {
    const profile = this.routes()[provider];
    const fallback = MODEL_ENDPOINTS[provider];
    const baseURL = profile?.baseURL ?? fallback?.baseURL;
    const api = profile?.api ?? fallback?.api ?? 'openai-completions';
    if (!baseURL || !['openai-completions', 'openai-responses', 'anthropic-messages'].includes(api)) return;
    return { baseURL: baseURL.replace(/\/+$/, ''), api: api as ProviderApi };
  }

  private async savedCatalog(provider: string): Promise<SavedModelCatalog | undefined> {
    const saved = (await this.canvas.settings.get()).modelCatalogs[provider];
    const endpoint = this.endpoint(provider);
    return saved && endpoint && saved.baseURL === endpoint.baseURL && saved.api === endpoint.api
      ? saved
      : undefined;
  }

  /** Keep installed capabilities and explicit route overrides; add provider-issued IDs to the served catalog. */
  private async registerCatalog(
    provider: string,
    saved: SavedModelCatalog,
    assertCurrent?: () => void,
  ): Promise<void> {
    const profile = this.routes()[provider];
    if (!profile) return;
    const entries = new Map<string, Record<string, unknown>>();
    try {
      for (const model of getBuiltinModels(provider as never)) entries.set(model.id, { id: model.id });
    } catch {
      /* User-defined route: the saved declarations are its starting catalog. */
    }
    const overrides = profile.modelOverrides as Record<string, Record<string, unknown>> | undefined;
    for (const [id, fields] of Object.entries(overrides ?? {})) entries.set(id, { id, ...fields });
    if (Array.isArray(profile.models))
      for (const model of profile.models) {
        if (model && typeof model === 'object' && typeof model.id === 'string') entries.set(model.id, model);
      }
    const selected: DiscoveredModel[] = Object.values((await this.canvas.settings.get()).models)
      .filter((route) => route?.provider === provider)
      .map((route) => ({ id: route!.model }));
    const supplied = new Map(
      [...selected, ...saved.retained, ...saved.models].map((model) => [model.id, model]),
    );
    for (const model of supplied.values()) {
      entries.set(model.id, {
        id: model.id,
        ...(!entries.has(model.id) ? { contextWindow: 65_536, maxTokens: 8192, input: ['text'] } : {}),
        ...(model.name ? { name: model.name } : {}),
        ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
        ...(model.maxTokens ? { maxTokens: model.maxTokens } : {}),
        ...(model.inputModalities ? { input: model.inputModalities } : {}),
        ...entries.get(model.id),
      });
    }
    const { modelOverrides: _overrides, ...rest } = profile;
    const next = {
      ...rest,
      api: saved.api,
      baseURL: saved.baseURL,
      ...(saved.api === 'openai-completions'
        ? { compat: { supportsUsageInStreaming: true, ...(profile.compat as object | undefined) } }
        : {}),
      models: [...entries.values()],
      defaultContextWindow: profile.defaultContextWindow ?? 65_536,
      defaultMaxTokens: profile.defaultMaxTokens ?? 8192,
    };
    if (!sameJson(profile, next))
      await this.editRoutes([{ op: 'set', path: ['providers', provider], value: next }], assertCurrent);
  }

  private async restoreCatalogs(): Promise<void> {
    const saved = (await this.canvas.settings.get()).modelCatalogs;
    for (const provider of Object.keys(saved)) {
      const catalog = await this.savedCatalog(provider);
      if (!catalog) continue;
      try {
        await this.registerCatalog(provider, catalog);
      } catch {
        this.log('warn', `could not restore the ${provider} model list; refresh it in Settings`);
      }
    }
  }

  async describe(): Promise<ModelsDescribeResult> {
    await this.ready;
    const settings = await this.canvas.settings.get();
    const routes = this.routes();
    const customs = settings.customProviders;
    const providers: ProviderInfo[] = [];

    const statusOf = (id: string, usable: boolean): ProviderTestStatus =>
      this.statuses.get(id) ?? { state: usable ? 'untested' : 'not-set' };

    for (const preset of PROVIDER_PRESETS) {
      const key = await describeKey(this.credentials, preset.id);
      const usable = key.configured;
      const models = await this.modelsOf(preset.id);
      const listing = await this.savedCatalog(preset.id);
      providers.push({
        id: preset.id,
        label: preset.label,
        kind: 'catalog',
        routed: routes[preset.id] !== undefined,
        ref: preset.ref,
        noKey: false,
        key,
        usable,
        status: usable ? statusOf(preset.id, true) : { state: 'not-set' },
        testModel: preset.test,
        models: listing ? models : models.length > 0 ? models : [...new Set([preset.strong, preset.fast])],
        modelListing: listing ? { source: 'provider', fetchedAt: listing.fetchedAt } : { source: 'bundled' },
        keyUrl: preset.keyUrl,
      });
    }
    for (const custom of customs) {
      const key = await describeKey(this.credentials, custom.id);
      const usable = key.configured;
      const listing = await this.savedCatalog(custom.id);
      providers.push({
        id: custom.id,
        label: custom.label ?? custom.id,
        kind: 'custom',
        routed: routes[custom.id] !== undefined,
        ref: keyRefFor(custom.id),
        noKey: custom.noKey,
        ...(custom.noKey ? {} : { key }),
        usable,
        status: usable ? statusOf(custom.id, true) : { state: 'not-set' },
        testModel: custom.models[0],
        models: [...new Set([...(listing?.models.map((model) => model.id) ?? []), ...custom.models])],
        ...(listing ? { modelListing: { source: 'provider' as const, fetchedAt: listing.fetchedAt } } : {}),
        custom,
      });
    }
    // Any other configured route (e.g. the test kit's mock LLM): listed so the picker and the first-run check see it.
    for (const [id, profile] of Object.entries(routes)) {
      if (providers.some((p) => p.id === id)) continue;
      const usable = await this.isConfigured(profile.apiKeyEnv);
      const listing = await this.savedCatalog(id);
      const models = listing
        ? listing.models.map((model) => model.id)
        : Array.isArray(profile.models)
          ? (profile.models as Array<{ id?: unknown }>).map((m) => String(m?.id ?? '')).filter(Boolean)
          : await this.modelsOf(id);
      providers.push({
        id,
        label: profile.displayName ?? id,
        kind: 'route',
        routed: true,
        ref: profile.apiKeyEnv ?? '',
        noKey: false,
        usable,
        status: usable ? statusOf(id, true) : { state: 'not-set' },
        ...(models[0] ? { testModel: models[0] } : {}),
        models,
        ...(listing ? { modelListing: { source: 'provider' as const, fetchedAt: listing.fetchedAt } } : {}),
      });
    }

    const plan = await this.chatgpt.provider();
    if (plan) providers.push(plan);
    const harnessDefault = this.harnessDefault();
    const usable = providers.filter((p) => p.usable && p.routed).map((p) => p.id);
    const effective = {} as Record<AgentName, EffectiveRoute>;
    for (const role of AGENT_NAMES_ORDERED) {
      const chosen = settings.models[role];
      effective[role] = chosen
        ? { ...chosen, source: 'chosen' }
        : usable.length === 1 && plan?.usable && plan.models[0]
          ? { provider: plan.id, model: plan.models[0], source: 'tier' }
          : defaultRouteFor(role, { harnessDefault, usable, customs });
    }
    const anyUsable = usable.length > 0;
    return {
      providers,
      harnessDefault,
      chosen: settings.models,
      effective,
      anyUsable,
      firstRun: !anyUsable && !settings.firstRunDone && process.env.ORB_SKIP_FIRST_RUN !== '1',
    };
  }

  /** One-token request on the provider's test model; the result is kept for the provider card. */
  async test(args: KeysTestArgs, signal?: AbortSignal): Promise<KeysTestResult> {
    await this.ready;
    const provider = args.provider;
    await this.ensureRoute(provider).catch(() => undefined);
    const routes = this.routes();
    const settings = await this.canvas.settings.get();
    const custom = settings.customProviders.find((c) => c.id === provider);
    const profile = routes[provider];
    const routeModels = Array.isArray(profile?.models)
      ? (profile.models as Array<{ id?: unknown }>).map((m) => String(m?.id ?? '')).filter(Boolean)
      : [];
    const model = args.model ?? presetOf(provider)?.test ?? custom?.models[0] ?? routeModels[0];
    const started = performance.now();
    const finish = (ok: boolean, status: ProviderTestStatus, code?: string): KeysTestResult => {
      this.statuses.set(provider, status);
      this.persistStatuses();
      return {
        provider,
        model: model ?? '',
        ok,
        status,
        ...(code ? { code } : {}),
        ms: Math.round(performance.now() - started),
      };
    };
    if (!profile || !model) {
      return finish(
        false,
        {
          state: 'failed',
          kind: 'not-configured',
          message: FAILURE_MESSAGES['not-configured'],
          at: Date.now(),
        },
        'NO_ADAPTER',
      );
    }

    const timeout = AbortSignal.timeout(TEST_TIMEOUT_MS);
    const stop = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let failure: { code?: string; message?: string; status?: number } | undefined;
    try {
      const messages = [
        createUserMessage({
          content: [{ type: 'text', text: 'Reply with OK.' }],
          source: { kind: 'orb-keys-test' },
        } as any),
      ];
      for await (const chunk of this.llm.stream({ provider, model, messages, maxTokens: 1, signal: stop })) {
        if (
          chunk?.type === 'finish' &&
          (chunk.reason?.kind === 'error' || chunk.reason?.kind === 'aborted')
        ) {
          failure = chunk.reason.failure ?? { code: chunk.reason.kind === 'aborted' ? 'TIMEOUT' : 'UNKNOWN' };
          if (chunk.reason.kind === 'aborted' && timeout.aborted) failure = { ...failure, code: 'TIMEOUT' };
        }
      }
    } catch (err) {
      const e = err as { code?: unknown; message?: unknown };
      failure = {
        code: typeof e?.code === 'string' ? e.code : timeout.aborted ? 'TIMEOUT' : 'UNKNOWN',
        message: typeof e?.message === 'string' ? e.message : String(err),
      };
    }
    if (!failure) return finish(true, { state: 'working', model, at: Date.now() });

    const kind = failureKindOf(failure.code, failure.status);
    const secrets: string[] = [];
    if (profile.apiKeyEnv) {
      const resolved = await this.credentials.resolve(profile.apiKeyEnv).catch(() => undefined);
      if (resolved?.value) secrets.push(resolved.value);
    }
    const detail = failure.message ? scrubSecrets(failure.message, secrets) : '';
    const plain = FAILURE_MESSAGES[kind];
    // The plain message first; the provider's own words after it (useful for "model not found" and the like).
    const message =
      (kind === 'unknown' || kind === 'bad-request' || kind === 'provider-error') && detail
        ? `${plain} ${detail}`.slice(0, 600)
        : plain;
    this.log('info', `test ${provider}/${model}: ${failure.code ?? 'failed'} (${kind})`);
    return finish(false, { state: 'failed', kind, message, model, at: Date.now() }, failure.code);
  }

  async discover(args: ModelsDiscoverArgs, signal?: AbortSignal): Promise<DiscoveredModel[]> {
    await this.ready;
    if (!('provider' in args)) {
      try {
        return await fetchProviderModels({
          ...args,
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(TEST_TIMEOUT_MS)])
            : AbortSignal.timeout(TEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new ModelsError(
          'orb/models-unavailable',
          scrubSecrets(
            `Model refresh failed: ${(err as Error)?.message ?? 'provider unavailable'}`,
            args.apiKey ? [args.apiKey] : [],
          ),
        );
      }
    }
    const existing = this.discoveries.get(args.provider);
    if (existing) return existing;
    const run = this.refreshProvider(args.provider, signal);
    this.discoveries.set(args.provider, run);
    try {
      return await run;
    } finally {
      if (this.discoveries.get(args.provider) === run) this.discoveries.delete(args.provider);
    }
  }

  private async refreshProvider(provider: string, signal?: AbortSignal): Promise<DiscoveredModel[]> {
    await this.ensureRoute(provider);
    const endpoint = this.endpoint(provider);
    if (!endpoint)
      throw new ModelsError('orb/invalid-args', 'This provider has no supported model-list endpoint.');
    const profile = this.routes()[provider];
    const custom = (await this.canvas.settings.get()).customProviders.find((p) => p.id === provider);
    const credential = profile?.apiKeyEnv ? await this.credentials.resolve(profile.apiKeyEnv) : undefined;
    if (presetOf(provider) && !credential?.value)
      throw new ModelsError(
        'orb/models-unavailable',
        'Save this provider’s API key before refreshing its models.',
      );
    const generation = this.generations.get(provider) ?? 0;
    const timeout = AbortSignal.timeout(TEST_TIMEOUT_MS);
    const stop = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const models = await fetchProviderModels({
        ...endpoint,
        provider,
        ...(profile?.headers ? { headers: profile.headers } : {}),
        ...(credential?.value && !custom?.noKey ? { apiKey: credential.value } : {}),
        signal: stop,
      });
      const assertCurrent = () => {
        stop.throwIfAborted();
        if (
          generation !== (this.generations.get(provider) ?? 0) ||
          !sameJson(endpoint, this.endpoint(provider))
        )
          throw new Error('The provider changed during refresh. Refresh its models again.');
      };
      const unchanged = async () => {
        const current = profile?.apiKeyEnv ? await this.credentials.resolve(profile.apiKeyEnv) : undefined;
        assertCurrent();
        if (current?.value !== credential?.value)
          throw new Error('The provider changed during refresh. Refresh its models again.');
      };
      await unchanged();
      const previous = await this.savedCatalog(provider);
      const chosen = Object.values((await this.canvas.settings.get()).models)
        .filter((route) => route?.provider === provider)
        .map((route) => route!.model);
      const retained = [...new Set(chosen)]
        .filter((id) => !models.some((model) => model.id === id))
        .map(
          (id) =>
            previous?.models.find((model) => model.id === id) ??
            previous?.retained.find((model) => model.id === id) ?? { id },
        );
      const saved: SavedModelCatalog = { ...endpoint, fetchedAt: Date.now(), models, retained };
      await this.registerCatalog(provider, saved, assertCurrent);
      await unchanged();
      await this.canvas.settings.update((current) => {
        // Recheck inside the write chain, after any queued key removal or endpoint edit.
        assertCurrent();
        return { ...current, modelCatalogs: { ...current.modelCatalogs, [provider]: saved } };
      });
      return models;
    } catch (err) {
      const detail = timeout.aborted
        ? 'Model refresh timed out. The saved list is unchanged.'
        : signal?.aborted
          ? 'Model refresh was cancelled.'
          : ((err as Error)?.message ?? 'provider unavailable');
      throw new ModelsError(
        'orb/models-unavailable',
        scrubSecrets(detail, credential?.value ? [credential.value] : []),
      );
    }
  }

  /** Add or replace a custom provider: its llm-pi-ai route (live), its placeholder key (no-key), orb.json. */
  async setCustom(input: CustomProvider): Promise<ProviderInfo> {
    await this.ready;
    const provider = CustomProvider.parse(input);
    this.generations.set(provider.id, (this.generations.get(provider.id) ?? 0) + 1);
    this.discoveries.delete(provider.id);
    const routes = this.routes();
    const existing = (await this.canvas.settings.get()).customProviders.find((c) => c.id === provider.id);
    if (!existing && routes[provider.id] !== undefined) {
      throw new ModelsError('orb/invalid-args', `a provider route named "${provider.id}" already exists`);
    }
    const ref = keyRefFor(provider.id);
    try {
      await this.editRoutes([
        { op: 'set', path: ['providers', provider.id], value: customRouteProfile(provider) },
      ]);
    } catch (err) {
      throw new ModelsError('orb/invalid-args', scrubSecrets((err as Error)?.message ?? String(err)));
    }
    // "No key needed": Orb stores a placeholder key (PRD). Turning it off removes the placeholder, never a real key.
    const stored = await this.credentials.resolve(ref).catch(() => undefined);
    if (provider.noKey && !stored) await this.credentials.set(ref, NO_KEY_PLACEHOLDER);
    if (!provider.noKey && stored?.value === NO_KEY_PLACEHOLDER) await this.credentials.unset(ref);
    await this.canvas.settings.update((current) => ({
      ...current,
      customProviders: [...current.customProviders.filter((c) => c.id !== provider.id), provider],
    }));
    this.statuses.delete(provider.id);
    this.persistStatuses();
    const catalog = await this.savedCatalog(provider.id);
    if (catalog) await this.registerCatalog(provider.id, catalog);
    const info = (await this.describe()).providers.find((p) => p.id === provider.id);
    if (!info) throw new ModelsError('orb/not-found', `custom provider "${provider.id}" did not persist`);
    return info;
  }

  /** Remove a custom provider: route, key, orb.json entry, and any agent pick that named it. */
  async removeCustom(id: string): Promise<void> {
    await this.ready;
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
    this.discoveries.delete(id);
    const settings = await this.canvas.settings.get();
    if (!settings.customProviders.some((c) => c.id === id)) {
      throw new ModelsError('orb/not-found', `no custom provider "${id}"`);
    }
    if (this.routes()[id] !== undefined) await this.editRoutes([{ op: 'unset', path: ['providers', id] }]);
    const ref = keyRefFor(id);
    const info = await this.credentials.describe(ref).catch(() => undefined);
    if (info?.configured && info.writable) await this.credentials.unset(ref);
    await this.canvas.settings.update((current) => {
      const models = { ...current.models };
      for (const role of AGENT_NAMES_ORDERED) if (models[role]?.provider === id) delete models[role];
      const modelCatalogs = { ...current.modelCatalogs };
      delete modelCatalogs[id];
      return {
        ...current,
        models,
        modelCatalogs,
        customProviders: current.customProviders.filter((c) => c.id !== id),
      };
    });
    this.statuses.delete(id);
    this.persistStatuses();
  }
}

export function apply(ctx: any) {
  ctx.provide(ORB_MODELS_SERVICE, new OrbModels(ctx));
}
