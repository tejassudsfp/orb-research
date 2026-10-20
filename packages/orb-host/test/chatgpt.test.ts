import { createHash } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import {
  createAssistantMessage,
  createToolResultMessage,
  createUserMessage,
  type LlmAdapter,
} from '@deepseek-ai/dsh-llm';
import { CHATGPT_PROVIDER } from '@orb/shared';
import { ChatGPTAuth, planFailure } from '../src/chatgptAuth.js';
import { OrbChatGPT, planPayload } from '../src/chatgpt.js';

let pair: Awaited<ReturnType<typeof generateKeyPair>>;
let jwk: Record<string, unknown>;
beforeAll(async () => {
  pair = await generateKeyPair('RS256');
  jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };
});
const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const message = (text: string) =>
  createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } });
async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of stream) out.push(item);
  return out;
}

async function fixture() {
  const saved = new Map<string, string>();
  let authorize: URL | undefined;
  let failCallback = false,
    badNonce = false,
    permission = true,
    failExchange = false,
    refreshError = false;
  let refreshCount = 0,
    subject = 'user-one',
    modelId = 'gpt-test-plan';
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const credentials = {
    resolve: async (ref: string) =>
      saved.has(ref) ? { value: saved.get(ref)!, source: 'keychain' } : undefined,
    describe: async () => ({ configured: false, writable: true }),
    set: async (ref: string, value: string) => {
      saved.set(ref, value);
    },
    unset: async (ref: string) => {
      saved.delete(ref);
    },
  };
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, ...(init ? { init } : {}) });
    expect(init?.redirect).toBe('error');
    if (url.endsWith('/.well-known/jwks.json')) return json({ keys: [jwk] });
    if (url.endsWith('/.well-known/openid-configuration'))
      return json({
        issuer: 'https://auth.openai.com',
        revocation_endpoint: 'https://auth.openai.com/api/accounts/oauth/revoke',
      });
    if (url.endsWith('/oauth/revoke')) return new Response(null, { status: 200 });
    if (url.endsWith('/oauth/token')) {
      const params = new URLSearchParams(String(init?.body));
      if (params.get('grant_type') === 'refresh_token') {
        refreshCount++;
        expect(params.has('scope')).toBe(false);
        expect(params.get('client_id')).toMatch(/^oaiapp_test/);
        if (refreshError) return json({ error: 'invalid_grant' }, 400);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return json({
          access_token: 'renewed-access',
          refresh_token: 'rotated-refresh',
          token_type: 'Bearer',
          expires_in: 3600,
        });
      }
      expect(authorize).toBeDefined();
      expect(createHash('sha256').update(params.get('code_verifier')!).digest('base64url')).toBe(
        authorize!.searchParams.get('code_challenge'),
      );
      expect(params.get('client_id')).toMatch(/^oaiapp_test/);
      expect(params.get('redirect_uri')).toBe(authorize!.searchParams.get('redirect_uri'));
      expect(params.get('resource')).toBe('https://api.openai.com/v1');
      expect(
        JSON.parse(saved.get('ORB_CHATGPT_CONNECTIONS')!).profiles.some(
          (p: any) => p.clientId === params.get('client_id'),
        ),
      ).toBe(true);
      if (failExchange) return json({ error: 'invalid_grant' }, 400);
      const id = await new SignJWT({
        nonce: badNonce ? 'bad' : authorize!.searchParams.get('nonce'),
        email: 'same-email@example.test',
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setIssuer('https://auth.openai.com')
        .setSubject(subject)
        .setAudience(params.get('client_id')!)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(pair.privateKey);
      return json({
        access_token: 'initial-access',
        refresh_token: 'initial-refresh',
        id_token: id,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: permission
          ? 'openid email chatgpt.tokens.use.direct offline_access resource.invoke'
          : 'openid email',
      });
    }
    if (url.endsWith('/v1/models'))
      return json({
        models: [
          { slug: modelId, display_name: 'Plan model', visibility: 'list' },
          { slug: 'hidden', visibility: 'hide' },
        ],
      });
    throw new Error(`Unexpected test destination: ${url}`);
  };
  const openBrowser = async (value: string) => {
    authorize = new URL(value);
    if (failCallback) return;
    const callback = new URL(authorize.searchParams.get('redirect_uri')!);
    // Invalid state and foreign Host do not consume the pending attempt.
    const bad = new URL(callback);
    bad.searchParams.set('state', 'ü'.repeat(43));
    expect((await fetch(bad)).status).toBe(400);
    callback.searchParams.set('state', authorize.searchParams.get('state')!);
    callback.searchParams.set('code', 'test-authorization-code');
    callback.searchParams.set(
      'client_id',
      authorize.searchParams.get('client_id') === 'dynamic_agent_client'
        ? `oaiapp_test${subject}`
        : authorize.searchParams.get('client_id')!,
    );
    expect((await fetch(callback)).status).toBe(200);
  };
  const auth = new ChatGPTAuth({ credentials, openBrowser, fetch: fetcher });
  cleanup.push(() => auth.close());
  await auth.ready;
  const connect = async (profileId?: string, enablePlan?: boolean) => {
    await auth.action({
      action: 'connect',
      ...(profileId ? { profileId } : {}),
      ...(enablePlan ? { enablePlan } : {}),
    });
    await expect.poll(async () => (await auth.state()).pending).toBe(false);
    return auth.state();
  };
  return {
    auth,
    saved,
    credentials,
    fetcher,
    openBrowser,
    connect,
    requests,
    set: (values: {
      failCallback?: boolean;
      badNonce?: boolean;
      permission?: boolean;
      failExchange?: boolean;
      refreshError?: boolean;
      subject?: string;
      modelId?: string;
    }) => {
      failCallback = values.failCallback ?? failCallback;
      badNonce = values.badNonce ?? badNonce;
      permission = values.permission ?? permission;
      failExchange = values.failExchange ?? failExchange;
      refreshError = values.refreshError ?? refreshError;
      subject = values.subject ?? subject;
      modelId = values.modelId ?? modelId;
    },
    get authorize() {
      return authorize!;
    },
    get refreshCount() {
      return refreshCount;
    },
  };
}

describe('ChatGPT plan OAuth and protected sessions', () => {
  it('registers with PKCE, verifies OIDC, filters account models, persists in Keychain only and resumes offline', async () => {
    const f = await fixture();
    const state = await f.connect();
    expect(state.profiles[0]).toMatchObject({ connected: true, planEnabled: true });
    expect(state.models).toEqual([{ id: 'gpt-test-plan', name: 'Plan model' }]);
    expect(state.welcome).toBe(true);
    expect(JSON.stringify(state)).not.toMatch(/initial-access|initial-refresh|eyJ/);
    expect(f.authorize.searchParams.get('client_id')).toBe('dynamic_agent_client');
    expect(f.authorize.searchParams.get('agent_name_hint')).toBe('orb');
    const host = f.authorize.searchParams.get('ext_agent_host_id');
    await f.connect(state.active);
    expect(f.authorize.searchParams.get('client_id')).toBe('oaiapp_testuser-one');
    expect(f.authorize.searchParams.has('agent_name_hint')).toBe(false);
    expect(f.authorize.searchParams.has('prompt')).toBe(false);
    expect(f.authorize.searchParams.get('ext_agent_host_id')).toBe(host);
    expect(f.authorize.searchParams.has('id_token_hint')).toBe(true);
    await f.auth.action({ action: 'welcomeSeen' });
    const offline = new ChatGPTAuth({
      credentials: f.credentials,
      openBrowser: vi.fn(),
      fetch: vi.fn(() => {
        throw new Error('offline');
      }),
    });
    cleanup.push(() => offline.close());
    expect(await offline.state()).toMatchObject({
      welcome: false,
      active: state.active,
      models: state.models,
    });
  });
  it('retains identity when plan permission is absent and requests consent only when explicitly enabled', async () => {
    const f = await fixture();
    f.set({ permission: false });
    const state = await f.connect();
    expect(state.profiles[0]).toMatchObject({ connected: true, planEnabled: false });
    expect(state.models).toEqual([]);
    expect(state.welcome).toBe(false);
    expect(f.requests.some((r) => r.url.endsWith('/models'))).toBe(false);
    await expect(f.auth.access(state.active!)).rejects.toThrow('Enable ChatGPT plan');
    f.set({ permission: true });
    await f.connect(state.active, true);
    expect(f.authorize.searchParams.get('prompt')).toBe('consent');
  });
  it('refuses invalid OIDC nonce and a different returning identity without replacing the active account', async () => {
    const f = await fixture();
    const state = await f.connect();
    f.set({ badNonce: true });
    const bad = await f.connect(state.active);
    expect(bad.message).toContain('validation failed');
    expect(bad.active).toBe(state.active);
    f.set({ badNonce: false, subject: 'other-person' });
    const mismatch = await f.connect(state.active);
    expect(mismatch.message).toContain('validation failed');
    expect(mismatch.profiles).toHaveLength(1);
  });
  it('retains an issued registration on expired exchange, cancels safely, and keeps separate registrations for equal emails', async () => {
    const f = await fixture();
    f.set({ failExchange: true });
    const failed = await f.connect();
    expect(failed.profiles).toHaveLength(1);
    expect(failed.profiles[0]?.connected).toBe(false);
    f.set({ failExchange: false });
    await f.connect(failed.profiles[0]!.id);
    f.set({ subject: 'second-workspace', modelId: 'workspace-model' });
    const second = await f.connect();
    expect(second.profiles).toHaveLength(2);
    expect(second.profiles[0]?.label).not.toBe(second.profiles[1]?.label);
    const signal = f.auth.signal(second.active!);
    const first = await f.auth.action({ action: 'select', profileId: second.profiles[0]!.id });
    expect(signal.aborted).toBe(true);
    expect(first.active).toBe(second.profiles[0]!.id);
    f.set({ failCallback: true });
    await f.auth.action({ action: 'connect' });
    await f.auth.action({ action: 'cancel' });
    await expect.poll(async () => (await f.auth.state()).pending).toBe(false);
  });
  it('serializes rotating refreshes, clears only terminal credentials, and revokes a renewable session on sign-out', async () => {
    const f = await fixture();
    const state = await f.connect();
    // Simulate process restart near expiry; tokens themselves remain solely in the injected Keychain store.
    const db = JSON.parse(f.saved.get('ORB_CHATGPT_CONNECTIONS')!);
    db.profiles[0].tokens.expiresAt = 0;
    f.saved.set('ORB_CHATGPT_CONNECTIONS', JSON.stringify(db));
    const auth = new ChatGPTAuth({
      credentials: f.credentials,
      openBrowser: f.openBrowser,
      fetch: f.fetcher,
    });
    cleanup.push(() => auth.close());
    const values = await Promise.all(Array.from({ length: 4 }, () => auth.access(state.active!)));
    expect(values).toEqual(Array(4).fill('renewed-access'));
    expect(f.refreshCount).toBe(1);
    const disconnected = await auth.action({ action: 'disconnect', profileId: state.active! });
    expect(disconnected.profiles[0]?.connected).toBe(false);
    expect(f.requests.filter((r) => r.url.endsWith('/oauth/revoke'))).toHaveLength(1);
    const retained = JSON.parse(f.saved.get('ORB_CHATGPT_CONNECTIONS')!).profiles[0];
    expect(retained.clientId).toBe('oaiapp_testuser-one');
    expect(retained.tokens).toBeUndefined();
    f.set({ refreshError: true });
    db.profiles[0].tokens.expiresAt = 0;
    f.saved.set('ORB_CHATGPT_CONNECTIONS', JSON.stringify(db));
    const invalid = new ChatGPTAuth({
      credentials: f.credentials,
      openBrowser: f.openBrowser,
      fetch: f.fetcher,
    });
    cleanup.push(() => invalid.close());
    await expect(invalid.access(state.active!)).rejects.toThrow('Sign in');
    expect((await invalid.state()).profiles[0]?.connected).toBe(false);
  });
});

describe('ChatGPT plan research transport', () => {
  it('uses a Responses-only, stateless streaming body with namespaced tools and full history', () => {
    const value = planPayload({
      model: 'plan',
      stream: false,
      store: true,
      max_output_tokens: 1,
      temperature: 0.3,
      prompt_cache_retention: '24h',
      previous_response_id: 'old',
      metadata: { secret: true },
      input: [
        { role: 'system', content: 'Instructions' },
        { role: 'user', content: 'Research' },
        { type: 'function_call', name: 'query_board', arguments: '{}', call_id: 'call_1' },
      ],
      tools: [{ type: 'function', name: 'query_board', parameters: {} }],
    });
    expect(value).toEqual({
      model: 'plan',
      stream: true,
      store: false,
      input: [
        { role: 'developer', content: 'Instructions' },
        { role: 'user', content: 'Research' },
        { type: 'function_call', name: 'query_board', namespace: 'orb', arguments: '{}', call_id: 'call_1' },
      ],
      tools: [
        {
          type: 'namespace',
          name: 'orb',
          description: 'orb research and canvas tools.',
          tools: [{ type: 'function', name: 'query_board', parameters: {} }],
        },
      ],
    });
    expect(() => planPayload({ tools: [{ type: 'code_interpreter' }] })).toThrow('not supported');
    expect(planFailure('subscription_sharing_usage_limit_exceeded', 429)).toMatchObject({
      code: 'CHATGPT_PLAN_LIMIT',
    });
    expect(planFailure(undefined, 429).code).toBe('CHATGPT_RATE_LIMIT');
    expect(planFailure('subscription_sharing_usage_unavailable', 503).code).toBe('CHATGPT_UNAVAILABLE');
    expect(planFailure('chatpass_v2_scope_not_authorized').code).toBe('CHATGPT_PERMISSION');
    expect(planFailure('subscription_sharing_invalid_user').code).toBe('CHATGPT_SIGN_IN');
  });
  it('runs the actual harness adapter through a tool call, result, replay and completed answer; quota never falls back', async () => {
    const f = await fixture();
    await f.connect();
    let adapter!: LlmAdapter;
    const responses: any[] = [];
    let quota: false | 'http' | 'stream' = false;
    const fetcher: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith('/v1/responses')) return f.fetcher(input, init);
      expect(init?.redirect).toBe('error');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer initial-access');
      const body = JSON.parse(String(init?.body));
      responses.push(body);
      expect(body.store).toBe(false);
      expect(body.stream).toBe(true);
      expect(body.max_output_tokens).toBeUndefined();
      expect(body.temperature).toBeUndefined();
      expect(body.prompt_cache_retention).toBeUndefined();
      if (quota === 'http')
        return json(
          { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'do not expose this' } },
          429,
        );
      if (quota === 'stream') {
        const event = {
          type: 'response.failed',
          response: {
            status: 'failed',
            error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'initial-access' },
          },
        };
        return new Response(`event: response.failed\ndata: ${JSON.stringify(event)}\n\n`, {
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      const item =
        responses.length === 1
          ? {
              type: 'function_call',
              id: 'fc_test',
              call_id: 'call_test',
              name: 'query_board',
              namespace: 'orb',
              arguments: '{}',
            }
          : {
              type: 'message',
              id: 'msg_test',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Research completed.', annotations: [] }],
              status: 'completed',
            };
      const events = [
        {
          type: 'response.created',
          response: { id: 'resp_test', model: body.model, status: 'in_progress', output: [] },
        },
        { type: 'response.output_item.added', output_index: 0, item },
        ...(item.type === 'message'
          ? [
              {
                type: 'response.content_part.added',
                output_index: 0,
                content_index: 0,
                part: { type: 'output_text', text: '', annotations: [] },
              },
              {
                type: 'response.output_text.delta',
                output_index: 0,
                content_index: 0,
                delta: 'Research completed.',
              },
            ]
          : []),
        { type: 'response.output_item.done', output_index: 0, item },
        {
          type: 'response.completed',
          response: {
            id: 'resp_test',
            model: body.model,
            status: 'completed',
            output: [item],
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              total_tokens: 120,
              input_tokens_details: { cached_tokens: 0 },
            },
          },
        },
      ];
      return new Response(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), {
        headers: { 'content-type': 'text/event-stream' },
      });
    };
    const ctx = {
      credentials: f.credentials,
      llm: {
        registerAdapter: (_ids: string[], value: LlmAdapter) => {
          adapter = value;
          return () => {};
        },
        stream: (options: any) => adapter.stream(options),
      },
    };
    const plan = new OrbChatGPT(ctx, { fetch: fetcher, openBrowser: f.openBrowser });
    cleanup.push(() => plan.auth.close());
    await plan.ready;
    const options = {
      provider: CHATGPT_PROVIDER,
      model: 'gpt-test-plan',
      system: 'Use research tools.',
      tools: [
        {
          name: 'query_board',
          description: 'Read the board',
          parameters: { type: 'object', properties: {} },
        },
      ],
      messages: [message('Research this board')],
      maxTokens: 1,
      temperature: 0.5,
    };
    const chunks = await collect(adapter.stream(options));
    expect(chunks.find((chunk) => chunk.type === 'block-end')).toMatchObject({
      block: { type: 'tool-call', name: 'query_board', arguments: '{}' },
    });
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'tool-calls' } });
    const block = chunks.find((chunk) => chunk.type === 'block-end');
    if (block?.type !== 'block-end' || block.block.type !== 'tool-call') throw new Error('Expected tool');
    const answer = await collect(
      adapter.stream({
        ...options,
        messages: [
          ...options.messages,
          createAssistantMessage({
            content: [block.block],
            source: { provider: CHATGPT_PROVIDER, model: 'gpt-test-plan' },
          }),
          createToolResultMessage({
            content: [{ type: 'text', text: 'The board contains one cited research source.' }],
            callId: block.block.id,
            isError: false,
          }),
        ],
      }),
    );
    expect(answer.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } });
    expect(responses[1].input.some((item: any) => item.type === 'function_call_output')).toBe(true);
    expect(JSON.stringify(responses[1].input)).toContain('Research this board');
    expect(JSON.stringify(responses[1].input)).toContain('cited research source');
    expect(adapter.providerRetryPolicy(CHATGPT_PROVIDER)).toMatchObject({ maxRetries: 2 });
    expect((adapter.providerRetryPolicy(CHATGPT_PROVIDER) as any).retryableCodes).not.toContain(
      'CHATGPT_PLAN_LIMIT',
    );
    quota = 'http';
    const failed = await collect(adapter.stream(options));
    expect(failed.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { message: expect.stringContaining('Manage usage') } },
    });
    expect(responses).toHaveLength(3);
    await expect(collect(adapter.stream(options))).rejects.toThrow('Manage usage');
    expect(responses).toHaveLength(3);
    await plan.action({ action: 'refresh' });
    quota = 'stream';
    const failedStream = await collect(adapter.stream(options));
    expect(failedStream.at(-1)).toMatchObject({
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { code: 'CHATGPT_PLAN_LIMIT', message: expect.stringContaining('Manage usage') },
      },
    });
    expect(JSON.stringify(failedStream)).not.toContain('initial-access');
    await expect(collect(adapter.stream(options))).rejects.toThrow('Manage usage');
    expect(responses).toHaveLength(4);
  });
});
