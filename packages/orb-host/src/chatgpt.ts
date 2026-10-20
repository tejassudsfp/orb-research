/** A separate billing route; reuses the harness's guarded tool, transcript, attachment and replay conversion. */
import { request as httpRequest } from 'node:http';
import {
  createUserMessage,
  LlmError,
  resolveRetryPolicy,
  resolveImageAttachmentAccess,
  LlmAdapter,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm';
import { PiAiAdapter, type ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai';
import { stream, streamSimple } from '@earendil-works/pi-ai/api/openai-responses';
import { getBuiltinModels } from '@earendil-works/pi-ai/providers/all';
import type {
  Model,
  OpenAIResponsesCompat,
  Provider,
  SimpleStreamOptions,
  StreamOptions,
} from '@earendil-works/pi-ai';
import {
  CHATGPT_PROVIDER,
  CONTROL_URL_ENV,
  CONTROL_SECRET_ENV,
  scrubSecrets,
  type ChatGPTAction,
  type ChatGPTState,
  type ProviderInfo,
} from '@orb/shared';
import { ChatGPTAuth, ChatGPTError, planFailure, type ChatGPTAuthOptions } from './chatgptAuth.js';

/** Restrict the preview route to documented request fields, regardless of API-key/provider defaults. */
export function planPayload(value: any): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: value.model,
    input: value.input,
    store: false,
    stream: true,
  };
  for (const key of ['instructions', 'reasoning', 'include', 'text', 'parallel_tool_calls'])
    if (value[key] !== undefined) payload[key] = value[key];
  if (Array.isArray(value.input))
    payload.input = value.input.map((item: any) => {
      if (item.role === 'system') return { ...item, role: 'developer' };
      if (item.type === 'function_call' && item.namespace === undefined) return { ...item, namespace: 'orb' };
      return item;
    });
  if (Array.isArray(value.tools) && value.tools.length) {
    if (value.tools.some((tool: any) => tool.type !== 'function' && tool.type !== 'custom'))
      throw new ChatGPTError('This tool is not supported by the ChatGPT plan route.', 'CHATGPT_REQUEST');
    payload.tools = [
      { type: 'namespace', name: 'orb', description: 'orb research and canvas tools.', tools: value.tools },
    ];
  }
  return payload;
}

/** Browser launch is authenticated main-process control, never an authorization URL sent to the renderer. */
async function openChatGPTBrowser(url: string) {
  const base = process.env[CONTROL_URL_ENV],
    secret = process.env[CONTROL_SECRET_ENV];
  if (!base || !secret) throw new ChatGPTError('Open orb’s desktop app to connect your ChatGPT account.');
  const parsed = new URL(base);
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.username || parsed.password)
    throw new ChatGPTError('The desktop connection is unavailable. Restart orb.');
  const body = JSON.stringify({ url });
  // Node fetch adds Sec-Fetch-Mode, which this browser-resistant channel must refuse. No proxy or redirect here.
  await new Promise<void>((resolve, reject) => {
    const fail = () =>
      reject(new ChatGPTError('orb could not open the ChatGPT sign-in browser. Please try again.'));
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: parsed.port,
        path: '/chatgpt/open',
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (response) => {
        response.resume();
        response.on('end', () => (response.statusCode === 204 ? resolve() : fail()));
        response.on('error', fail);
      },
    );
    req.on('error', fail);
    req.end(body);
  });
}

/** Preserve exact adapter generations while making both HTTP and in-stream plan failures actionable. */
class PlanAdapter extends LlmAdapter {
  constructor(
    private readonly inner: PiAiAdapter,
    private readonly guard: (source: AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>,
  ) {
    super();
  }
  providerInfo(provider: string) {
    return this.inner.providerInfo(provider);
  }
  providerRetryPolicy(provider: string) {
    return this.inner.providerRetryPolicy(provider);
  }
  listModels(provider: string) {
    return this.inner.listModels(provider);
  }
  resolveModel(provider: string, model: string, signal?: AbortSignal) {
    return this.inner.resolveModel(provider, model, signal);
  }
  async prepareCall(provider: string, model: string, signal?: AbortSignal) {
    const call = await this.inner.prepareCall(provider, model, signal);
    return { model: call.model, stream: (options: GenerateOptions) => this.guard(call.stream(options)) };
  }
  stream(options: GenerateOptions) {
    return this.guard(this.inner.stream(options));
  }
}

export class OrbChatGPT {
  readonly auth: ChatGPTAuth;
  readonly ready: Promise<void>;
  private profiles = new Map<string, ResolvedPiAiProviderProfile>();
  private readonly accounts = new WeakMap<ResolvedPiAiProviderProfile, { id: string; signal: AbortSignal }>();
  private adapter: LlmAdapter;
  private registration?: () => void;
  private signature?: string;
  private testMessage?: string;
  private readonly fetcher: typeof fetch;
  private readonly blocked = new Map<string, ChatGPTError>();
  constructor(
    private readonly ctx: any,
    options: Partial<ChatGPTAuthOptions> = {},
  ) {
    this.fetcher = options.fetch ?? fetch;
    this.auth = new ChatGPTAuth({
      credentials: ctx.credentials,
      openBrowser: openChatGPTBrowser,
      ...options,
      changed: () => this.rebuild(),
    });
    const inner = new PiAiAdapter({
      profiles: () => this.profiles,
      resolveApiKey: async (_provider, profile) => {
        const account = this.accounts.get(profile);
        if (!account) throw new LlmError('Connect ChatGPT in Settings → Models.', 'CHATGPT_SIGN_IN');
        const blocked = this.blocked.get(account.id);
        if (blocked) throw this.safeError(blocked);
        try {
          return await this.auth.access(account.id, account.signal);
        } catch (err) {
          throw this.safeError(err);
        }
      },
      // No pi-ai ambient auth, filesystem credential lookup, or alternate billing path.
      auth: {
        credentials: {
          read: async () => undefined,
          list: async () => [],
          modify: async () => {
            throw new Error('orb owns ChatGPT credentials');
          },
          delete: async () => {},
        },
        authContext: { env: async () => undefined, fileExists: async () => false },
      },
      resolveAttachments: () => ctx.get?.('attachments'),
      resolveImageAccess: (attachments, ref) =>
        resolveImageAttachmentAccess(
          attachments,
          (hostPath) => ctx.get?.('fs')?.processPathFromHostPath(hostPath),
          ref,
        ),
    });
    this.adapter = new PlanAdapter(inner, (source) => this.guardStream(source));
    this.ready = this.auth.ready.then(() => {
      this.rebuild();
      this.registration = ctx.llm?.registerAdapter?.([CHATGPT_PROVIDER], this.adapter);
    });
    // Ordinary provider setup remains usable if an unreadable plan record needs attention.
    this.ready.catch(() => {});
    ctx.effect?.(() => () => {
      this.auth.close();
      this.registration?.();
    });
  }
  private async *guardStream(source: AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
    const active = this.auth.activeProfile;
    for await (const chunk of source) {
      if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
        const message = chunk.reason.failure.message;
        const match = message.match(
          /\b(subscription_sharing_[a-z_]+|chatpass_v2_[a-z_]+|CHATGPT_PLAN_LIMIT)\b/,
        );
        if (match) {
          const failure = planFailure(
            match[1] === 'CHATGPT_PLAN_LIMIT' ? 'subscription_sharing_usage_limit_exceeded' : match[1],
          );
          if (active && failure.code === 'CHATGPT_PLAN_LIMIT') this.blocked.set(active.id, failure);
          const details = message.match(/\[HTTP [^\]\n]{1,250}\]/)?.[0];
          yield {
            ...chunk,
            reason: {
              kind: 'error',
              failure: {
                ...chunk.reason.failure,
                code: failure.code,
                message: [failure.message, details && scrubSecrets(details)].filter(Boolean).join(' '),
              },
            },
          };
        } else {
          const tokens = this.auth.activeProfile?.tokens;
          yield {
            ...chunk,
            reason: {
              kind: 'error',
              failure: {
                ...chunk.reason.failure,
                message: scrubSecrets(message, [
                  tokens?.access ?? '',
                  tokens?.refresh ?? '',
                  tokens?.id ?? '',
                ]),
              },
            },
          };
        }
      } else yield chunk;
    }
  }
  private safeError(err: unknown) {
    if (err instanceof ChatGPTError)
      return new LlmError(err.message, err.code, err.status ? { status: err.status } : {});
    return new LlmError(
      'ChatGPT is temporarily unavailable. Check Settings → Models and try again.',
      'CHATGPT_UNAVAILABLE',
    );
  }
  private rebuild() {
    const active = this.auth.activeProfile;
    const enabled = !!active?.tokens?.scopes.includes('chatgpt.tokens.use.direct');
    // Rotation does not replace the adapter's catalog snapshot or freeze an old token into it.
    const signature = JSON.stringify([active?.id, enabled, active?.models]);
    if (signature === this.signature) return;
    this.signature = signature;
    if (!enabled || !active) {
      this.profiles = new Map();
      return;
    }
    const id = active.id;
    const accountSignal = this.auth.signal(id);
    const catalog = new Map(getBuiltinModels('openai').map((model) => [model.id, model]));
    const models: Model<'openai-responses'>[] = active.models.map((entry) => {
      const base = catalog.get(entry.id);
      const compat: OpenAIResponsesCompat = {
        supportsDeveloperRole: true,
        supportsMaxOutputTokens: false,
        supportsLongCacheRetention: false,
        supportsExplicitPromptCacheMode: false,
        supportsAdditionalTools: false,
        supportsToolSearch: false,
      };
      return {
        id: entry.id,
        name: entry.name,
        api: 'openai-responses',
        provider: CHATGPT_PROVIDER,
        baseUrl: 'https://api.openai.com/v1',
        reasoning: base?.reasoning ?? false,
        ...(base?.thinkingLevelMap ? { thinkingLevelMap: base.thinkingLevelMap } : {}),
        input: base?.input ?? ['text'],
        contextWindow: entry.contextWindow ?? base?.contextWindow ?? 65_536,
        maxTokens: base?.maxTokens ?? 8192,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        compat,
      };
    });
    const requestOptions = (options: StreamOptions = {}): StreamOptions => {
      return {
        ...options,
        maxRetries: 0,
        cacheRetention: 'none',
        onPayload: planPayload,
        signal: AbortSignal.any([accountSignal, ...(options.signal ? [options.signal] : [])]),
        fetch: async (input, init) => {
          const url = new URL(
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
          );
          if (url.href !== 'https://api.openai.com/v1/responses') throw new Error('ChatGPT endpoint refused');
          accountSignal.throwIfAborted();
          try {
            const response = await this.fetcher(input, { ...init, redirect: 'error' });
            if (!response.ok) {
              let code: unknown, param: unknown;
              // The SDK must never echo provider admission bodies or OAuth credentials into the session.
              try {
                const body = (await response.json()) as any;
                code = body?.error?.code;
                param = body?.error?.param;
              } catch {
                /* status is sufficient */
              }
              const failure = planFailure(code, response.status);
              if (failure.code === 'CHATGPT_PLAN_LIMIT') this.blocked.set(id, failure);
              const diagnostic = (value: unknown) =>
                typeof value === 'string' && /^[\w.[\]-]{1,120}$/.test(value)
                  ? scrubSecrets(value)
                  : undefined;
              const details = [
                `HTTP ${response.status}`,
                diagnostic(code) && `code ${diagnostic(code)}`,
                diagnostic(param) && `field ${diagnostic(param)}`,
                diagnostic(response.headers.get('x-request-id')) &&
                  `request ${diagnostic(response.headers.get('x-request-id'))}`,
              ]
                .filter(Boolean)
                .join('; ');
              // Returning a sanitized HTTP error preserves the actionable message through SDK wrapping.
              return new Response(
                JSON.stringify({ error: { code: failure.code, message: `${failure.message} [${details}]` } }),
                { status: response.status, headers: { 'content-type': 'application/json' } },
              );
            }
            return response;
          } catch (err) {
            throw this.safeError(err);
          }
        },
      };
    };
    const piProvider: Provider<'openai-responses'> = {
      id: CHATGPT_PROVIDER,
      name: 'ChatGPT plan',
      baseUrl: 'https://api.openai.com/v1',
      auth: {
        apiKey: {
          name: 'ChatGPT plan',
          resolve: async ({ credential }) => ({
            auth: credential?.type === 'api_key' ? { apiKey: credential.key } : {},
            source: 'ChatGPT plan',
          }),
        },
      },
      getModels: () => models,
      stream: (model, context, options) => stream(model, context, requestOptions(options)),
      streamSimple: (model, context, options) =>
        streamSimple(model, context, requestOptions(options) as SimpleStreamOptions),
    };
    const profile: ResolvedPiAiProviderProfile = {
      provider: CHATGPT_PROVIDER,
      displayName: 'ChatGPT plan',
      piProvider,
      streamIdleTimeoutMs: 300_000,
      maxRequestImageBytes: 20 * 1024 * 1024,
      requestImagePixelBudget: 4_194_304,
      requestImageMaxBytes: 1024 * 1024,
      retryPolicy: resolveRetryPolicy(
        {
          mode: 'normal',
          maxRetries: 2,
          retryableCodes: [
            'TRANSPORT',
            'TIMEOUT',
            'SERVER',
            'RATE_LIMIT',
            'STREAM_CLOSED',
            'CHATGPT_UNAVAILABLE',
            'CHATGPT_RATE_LIMIT',
          ],
          backoff: { initialDelayMs: 1000, maxDelayMs: 5000 },
        },
        'ChatGPT plan',
      ),
      modelErrors: new Map(),
      configuredMaxTokens: new Map(),
      cacheRetention: 'none',
      transport: 'sse',
    };
    this.accounts.set(profile, { id, signal: accountSignal });
    this.profiles = new Map([[CHATGPT_PROVIDER, profile]]);
  }
  async describe(): Promise<ChatGPTState> {
    await this.ready;
    const state = await this.auth.state();
    const blocked = state.active && this.blocked.get(state.active);
    return blocked ? { ...state, message: blocked.message } : state;
  }
  async provider(): Promise<ProviderInfo | undefined> {
    await this.ready.catch(() => {});
    const p = this.auth.activeProfile;
    if (!p?.tokens?.scopes.includes('chatgpt.tokens.use.direct')) return;
    return {
      id: CHATGPT_PROVIDER,
      label: 'ChatGPT plan',
      kind: 'route',
      routed: true,
      ref: '',
      noKey: true,
      usable: p.models.length > 0,
      status: { state: p.verifiedAt ? 'working' : 'untested' },
      models: p.models.map((m) => m.id),
      modelNames: Object.fromEntries(p.models.map((m) => [m.id, m.name])),
    };
  }
  async action(request: ChatGPTAction, signal?: AbortSignal): Promise<ChatGPTState> {
    await this.ready;
    // Only an explicit connection action can retry after a plan limit. No background loop or API fallback.
    if (['connect', 'test', 'refresh'].includes(request.action) && this.auth.activeProfile)
      this.blocked.delete(this.auth.activeProfile.id);
    if (request.action !== 'test') return this.auth.action(request);
    const p = this.auth.activeProfile;
    if (!p?.models[0]) throw new ChatGPTError('Connect ChatGPT and refresh its models before testing.');
    this.testMessage = undefined;
    const ac = AbortSignal.any([
      AbortSignal.timeout(45_000),
      this.auth.signal(p.id),
      ...(signal ? [signal] : []),
    ]);
    let completed = false,
      text = '';
    for await (const chunk of this.ctx.llm.stream({
      provider: CHATGPT_PROVIDER,
      model: p.models[0].id,
      messages: [
        createUserMessage({
          content: [{ type: 'text', text: 'Reply with exactly: Connected.' }],
          source: { kind: 'user' },
        }),
      ],
      signal: ac,
    })) {
      if (chunk.type === 'text-delta') text += chunk.text;
      if (chunk.type === 'finish') {
        if (chunk.reason.kind !== 'stop')
          throw new ChatGPTError(
            chunk.reason.failure?.message ?? 'ChatGPT did not complete the connection test.',
          );
        completed = true;
      }
    }
    if (!completed || !text.trim())
      throw new ChatGPTError('ChatGPT did not return a completed response. Try the connection test again.');
    await this.auth.markVerified(p.id);
    this.testMessage = 'Verified: a response completed using this ChatGPT plan.';
    return { ...(await this.auth.state()), message: this.testMessage };
  }
}
