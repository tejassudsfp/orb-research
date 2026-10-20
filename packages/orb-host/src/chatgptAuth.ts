/** Official public-client OAuth. The sidecar owns tokens and its loopback callback; main only opens the browser. */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { CHATGPT_USAGE_URL, type ChatGPTAction, type ChatGPTState } from '@orb/shared';
import type { CredentialsLike } from './keys.js';

const AUTH = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const REF = 'ORB_CHATGPT_CONNECTIONS';
const Model = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(500),
  contextWindow: z.number().int().positive().optional(),
});
const Tokens = z.object({
  access: z.string(),
  refresh: z.string().optional(),
  id: z.string(),
  expiresAt: z.number(),
  scopes: z.array(z.string()),
});
const Profile = z.object({
  id: z.string(),
  clientId: z.string(),
  subject: z.string().optional(),
  email: z.string().optional(),
  tokens: Tokens.optional(),
  models: z.array(Model).default([]),
  verifiedAt: z.number().optional(),
});
type Profile = z.infer<typeof Profile>;
const Database = z.object({
  hostId: z.string(),
  active: z.string().optional(),
  welcomeSeen: z.boolean().default(false),
  profiles: z.array(Profile),
});
type Database = z.infer<typeof Database>;
const random = () => randomBytes(32).toString('base64url');
const same = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const renewableErrors = new Set([
  'invalid_grant',
  'invalid_refresh_token',
  'token_expired',
  'refresh_token_expired',
  'refresh_token_invalidated',
  'refresh_token_reused',
]);

export class ChatGPTError extends Error {
  constructor(
    message: string,
    readonly code = 'CHATGPT_CONNECTION',
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Classify known provider errors without echoing a provider-controlled body or any credential. */
export function planFailure(code: unknown, status?: number): ChatGPTError {
  if (code === 'subscription_sharing_usage_limit_exceeded')
    return new ChatGPTError(
      `ChatGPT plan usage limit reached. Manage usage at ${CHATGPT_USAGE_URL}, then retry. Your board is saved.`,
      'CHATGPT_PLAN_LIMIT',
      status,
    );
  if (code === 'subscription_sharing_user_not_eligible')
    return new ChatGPTError(
      'ChatGPT plan usage is unavailable for this account or workspace. Check the account in Settings → Models.',
      'CHATGPT_NOT_ELIGIBLE',
      status,
    );
  if (status === 401 || code === 'subscription_sharing_invalid_user' || renewableErrors.has(String(code)))
    return new ChatGPTError(
      'Sign in to this ChatGPT account again in Settings → Models.',
      'CHATGPT_SIGN_IN',
      status,
    );
  if (
    status === 403 ||
    code === 'subscription_sharing_route_not_supported' ||
    code === 'chatpass_v2_scope_not_authorized' ||
    code === 'chatpass_v2_invalid_authorization_context'
  )
    return new ChatGPTError(
      'ChatGPT permission or workspace policy prevented this request. Check Settings → Models and Manage usage.',
      'CHATGPT_PERMISSION',
      status,
    );
  if (code === 'subscription_sharing_unsupported_capability' || status === 400)
    return new ChatGPTError(
      'ChatGPT rejected this request or capability. Check the chosen model and connection in Settings → Models.',
      'CHATGPT_REQUEST',
      status,
    );
  if (status === 429)
    return new ChatGPTError(
      'ChatGPT temporarily rate-limited this request. orb will retry briefly; your board is saved.',
      'CHATGPT_RATE_LIMIT',
      status,
    );
  return new ChatGPTError(
    'ChatGPT could not complete the request. Your connection is saved; try again later.',
    'CHATGPT_UNAVAILABLE',
    status,
  );
}

export type ChatGPTAuthOptions = {
  credentials: CredentialsLike;
  openBrowser(url: string): Promise<void>;
  /** Dependency injection for protocol tests only; the desktop never accepts an endpoint from its renderer. */
  fetch?: typeof fetch;
  changed?: () => void;
};

export class ChatGPTAuth {
  readonly ready: Promise<void>;
  private db!: Database;
  private writes: Promise<unknown> = Promise.resolve();
  private pending?: AbortController;
  private message?: string;
  private refreshes = new Map<string, Promise<string>>();
  private lifetimes = new Map<string, AbortController>();
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: ChatGPTAuthOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.ready = this.load();
  }
  private async load() {
    const stored = await this.options.credentials.resolve(REF);
    if (stored) {
      try {
        this.db = Database.parse(JSON.parse(stored.value));
      } catch {
        throw new ChatGPTError(
          'The saved ChatGPT connection could not be read. Reconnect from Settings → Models.',
        );
      }
    } else this.db = { hostId: `urn:uuid:${randomUUID()}`, profiles: [], welcomeSeen: false };
    for (const p of this.db.profiles) this.lifetimes.set(p.id, new AbortController());
  }
  private async write(edit: (next: Database) => void) {
    const job = this.writes.then(async () => {
      await this.ready;
      const next = structuredClone(this.db);
      edit(next);
      await this.options.credentials.set(REF, JSON.stringify(next));
      this.db = next;
      this.options.changed?.();
    });
    this.writes = job.catch(() => {});
    return job;
  }
  private profile(id?: string) {
    return this.db.profiles.find((p) => p.id === (id ?? this.db.active));
  }
  get activeProfile(): Readonly<Profile> | undefined {
    return this.db && this.profile();
  }
  signal(id: string): AbortSignal {
    let ac = this.lifetimes.get(id);
    if (!ac) this.lifetimes.set(id, (ac = new AbortController()));
    return ac.signal;
  }
  private stop(id: string) {
    this.lifetimes.get(id)?.abort();
    this.lifetimes.set(id, new AbortController());
  }
  private switchActive(id?: string) {
    if (this.db.active) this.stop(this.db.active);
    return this.write((db) => {
      db.active = id;
    });
  }
  async state(): Promise<ChatGPTState> {
    await this.ready;
    const p = this.profile();
    return {
      profiles: this.db.profiles.map((p, i) => ({
        id: p.id,
        label: `${p.email ?? 'ChatGPT account'} · Connection ${i + 1}`,
        connected: !!p.tokens,
        planEnabled: !!p.tokens?.scopes.includes('chatgpt.tokens.use.direct'),
      })),
      ...(this.db.active ? { active: this.db.active } : {}),
      pending: !!this.pending,
      ...(this.message ? { message: this.message } : {}),
      welcome: !this.db.welcomeSeen && !!p?.tokens?.scopes.includes('chatgpt.tokens.use.direct'),
      ...(p?.verifiedAt ? { verifiedAt: p.verifiedAt } : {}),
      models: p?.tokens?.scopes.includes('chatgpt.tokens.use.direct')
        ? p.models.map(({ id, name }) => ({ id, name }))
        : [],
    };
  }
  async action(request: ChatGPTAction): Promise<ChatGPTState> {
    await this.ready;
    if (request.action === 'cancel') this.pending?.abort();
    else if (request.action === 'connect') {
      if (this.pending)
        throw new ChatGPTError('A ChatGPT sign-in is already open. Finish or cancel it first.');
      const selected = request.profileId ? this.profile(request.profileId) : undefined;
      if (request.profileId && !selected) throw new ChatGPTError('Choose a saved ChatGPT connection.');
      const ac = new AbortController();
      this.pending = ac;
      this.message = undefined;
      void this.signIn(selected, !!request.enablePlan, ac.signal)
        .catch((err) => {
          this.message = ac.signal.aborted
            ? 'ChatGPT sign-in cancelled. You can try again.'
            : err instanceof ChatGPTError
              ? err.message
              : 'ChatGPT sign-in failed. Please try again.';
        })
        .finally(() => {
          if (this.pending === ac) this.pending = undefined;
        });
    } else if (request.action === 'select') {
      if (this.pending) throw new ChatGPTError('Finish or cancel the current sign-in first.');
      if (!this.profile(request.profileId)) throw new ChatGPTError('Choose a saved ChatGPT connection.');
      this.message = undefined;
      await this.switchActive(request.profileId);
      if (this.profile()?.tokens?.scopes.includes('chatgpt.tokens.use.direct')) await this.listModels();
    } else if (request.action === 'disconnect') {
      this.pending?.abort();
      await this.disconnect(request.profileId);
    } else if (request.action === 'welcomeSeen')
      await this.write((db) => {
        db.welcomeSeen = true;
      });
    else if (request.action === 'refresh') {
      this.message = undefined;
      await this.listModels();
    } else if (request.action === 'test') throw new ChatGPTError('The host must run the connection test.');
    return this.state();
  }
  async markVerified(id: string) {
    await this.write((db) => {
      const p = db.profiles.find((p) => p.id === id);
      if (p?.tokens) p.verifiedAt = Date.now();
    });
  }
  /** Fixed destinations, no redirect-following; response size and wall time are bounded. */
  async json(url: string, init: RequestInit = {}): Promise<any> {
    const response = await this.fetcher(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(init.signal ? [init.signal] : [])]),
    });
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (response.body)
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) {
          await response.body.cancel().catch(() => {});
          throw new ChatGPTError('ChatGPT returned an oversized response.');
        }
        chunks.push(chunk);
      }
    let body: any;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw planFailure(undefined, response.status);
    }
    if (!response.ok) throw planFailure(body?.error?.code ?? body?.error, response.status);
    return body;
  }
  private async form(path: string, values: Record<string, string>, signal?: AbortSignal) {
    return this.json(`${AUTH}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values),
      signal,
    });
  }
  private tokens(body: any, previous?: z.infer<typeof Tokens>): z.infer<typeof Tokens> {
    if (
      typeof body.access_token !== 'string' ||
      !body.access_token ||
      !Number.isFinite(body.expires_in) ||
      body.expires_in <= 0 ||
      (body.token_type ?? '').toLowerCase() !== 'bearer'
    )
      throw new ChatGPTError('ChatGPT returned an incomplete token response. Sign in again.');
    return Tokens.parse({
      access: body.access_token,
      refresh: body.refresh_token ?? previous?.refresh,
      id: body.id_token ?? previous?.id,
      expiresAt: Date.now() + body.expires_in * 1000,
      scopes:
        typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : (previous?.scopes ?? []),
    });
  }
  private async signIn(selected: Profile | undefined, enablePlan: boolean, signal: AbortSignal) {
    // Persist host identity before the browser opens, even if sign-in is cancelled.
    await this.write(() => {});
    const state = random(),
      nonce = random(),
      verifier = random();
    let port = 0;
    let finish!: (url: URL) => void;
    let fail!: (error: Error) => void;
    const callback = new Promise<URL>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    // Attach the rejection handler before opening the listener/browser.
    callback.catch(() => {});
    const server = createServer((req, res) => {
      let url: URL;
      try {
        url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      } catch {
        res.writeHead(400, { connection: 'close' });
        res.end();
        return;
      }
      const valid =
        req.method === 'GET' &&
        req.headers.host === `127.0.0.1:${port}` &&
        url.origin === `http://127.0.0.1:${port}` &&
        url.pathname === '/auth/callback' &&
        (req.url?.length ?? 0) < 8192 &&
        url.searchParams.getAll('state').length === 1 &&
        same(url.searchParams.get('state') ?? '', state) &&
        ['code', 'client_id', 'error'].every((key) => url.searchParams.getAll(key).length <= 1);
      res.writeHead(valid ? 200 : 400, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'none'",
        'referrer-policy': 'no-referrer',
        connection: 'close',
      });
      res.end(
        valid
          ? 'Return to orb to finish connecting your ChatGPT account. You can close this tab.'
          : 'This callback is not a pending orb sign-in.',
      );
      if (valid) finish(url);
    });
    const timeout = setTimeout(
      () => fail(new ChatGPTError('ChatGPT sign-in timed out. Please try again.')),
      5 * 60_000,
    );
    timeout.unref();
    const abort = () => fail(new ChatGPTError('ChatGPT sign-in cancelled.'));
    signal.addEventListener('abort', abort, { once: true });
    try {
      signal.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      port = (server.address() as AddressInfo).port;
      const redirect = `http://127.0.0.1:${port}/auth/callback`;
      const params = new URLSearchParams({
        client_id: selected?.clientId ?? 'dynamic_agent_client',
        ext_agent_host_id: this.db.hostId,
        response_type: 'code',
        redirect_uri: redirect,
        scope: SCOPES,
        resource: RESOURCE,
        state,
        nonce,
        code_challenge_method: 'S256',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      });
      if (!selected) params.set('agent_name_hint', 'orb');
      if (selected?.tokens?.id) params.set('id_token_hint', selected.tokens.id);
      if (selected?.email) params.set('login_hint', selected.email);
      if (enablePlan) params.set('prompt', 'consent');
      await this.options.openBrowser(`${AUTH}/api/accounts/authorize?${params}`);
      const result = await callback;
      signal.throwIfAborted();
      if (result.searchParams.has('error'))
        throw new ChatGPTError('ChatGPT permission was not granted. You can reconnect or use an API key.');
      const clientId = result.searchParams.get('client_id') ?? selected?.clientId;
      if (
        !clientId ||
        clientId === 'dynamic_agent_client' ||
        !/^[A-Za-z0-9_-]{1,200}$/.test(clientId) ||
        (selected && selected.clientId !== clientId)
      )
        throw new ChatGPTError('ChatGPT returned a different or incomplete registration. Sign in again.');
      const code = result.searchParams.get('code');
      if (!code) throw new ChatGPTError('ChatGPT did not return an authorization code. Sign in again.');
      const id = selected?.id ?? randomUUID();
      // Save the issued registration before exchange so expired codes never create duplicate clients.
      await this.write((db) => {
        if (!db.profiles.some((p) => p.id === id)) db.profiles.push({ id, clientId, models: [] });
      });
      const body = await this.form(
        '/api/accounts/oauth/token',
        {
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          code_verifier: verifier,
          redirect_uri: redirect,
          resource: RESOURCE,
        },
        signal,
      );
      const tokens = this.tokens(body);
      const jwks = await this.json(`${AUTH}/.well-known/jwks.json`, { signal });
      const { payload } = await jwtVerify(tokens.id, createLocalJWKSet(jwks), {
        issuer: AUTH,
        audience: clientId,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'nonce'],
      });
      if (payload.nonce !== nonce || !payload.sub || (selected?.subject && selected.subject !== payload.sub))
        throw new ChatGPTError('ChatGPT account validation failed. The previous connection was kept.');
      signal.throwIfAborted();
      if (this.db.active) this.stop(this.db.active);
      this.stop(id);
      await this.write((db) => {
        const p = db.profiles.find((p) => p.id === id)!;
        p.subject = payload.sub;
        p.email = typeof payload.email === 'string' ? payload.email : undefined;
        p.tokens = tokens;
        p.models = [];
        p.verifiedAt = undefined;
        db.active = id;
      });
      if (tokens.scopes.includes('chatgpt.tokens.use.direct')) {
        this.message = 'ChatGPT plan connected. Choose a model and test the connection.';
        await this.listModels();
      } else
        this.message =
          'Signed in. ChatGPT plan usage is not enabled. Enable it explicitly or choose an API-key provider.';
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
  async access(id: string, signal?: AbortSignal): Promise<string> {
    await this.ready;
    signal?.throwIfAborted();
    const p = this.profile(id);
    if (!p?.tokens) throw planFailure(undefined, 401);
    if (!p.tokens.scopes.includes('chatgpt.tokens.use.direct'))
      throw new ChatGPTError('Enable ChatGPT plan usage in Settings → Models.', 'CHATGPT_PERMISSION');
    if (p.tokens.expiresAt > Date.now() + 60_000) return p.tokens.access;
    let refresh = this.refreshes.get(id);
    if (!refresh) {
      const previous = p.tokens;
      const lifetime = this.signal(id);
      refresh = (async () => {
        if (!previous.refresh) throw planFailure(undefined, 401);
        try {
          const body = await this.form(
            '/api/accounts/oauth/token',
            {
              grant_type: 'refresh_token',
              client_id: p.clientId,
              refresh_token: previous.refresh,
              resource: RESOURCE,
            },
            lifetime,
          );
          const tokens = this.tokens(body, previous);
          if (body.id_token) {
            const jwks = await this.json(`${AUTH}/.well-known/jwks.json`, { signal: lifetime });
            const { payload } = await jwtVerify(tokens.id, createLocalJWKSet(jwks), {
              issuer: AUTH,
              audience: p.clientId,
              algorithms: ['RS256'],
              requiredClaims: ['sub', 'exp'],
            });
            if (payload.sub !== p.subject)
              throw new ChatGPTError(
                'The renewed ChatGPT identity did not match. Sign in again.',
                'CHATGPT_SIGN_IN',
              );
          }
          lifetime.throwIfAborted();
          await this.write((db) => {
            const current = db.profiles.find((p) => p.id === id);
            if (!current || current.tokens?.refresh !== previous.refresh)
              throw new ChatGPTError('The ChatGPT session changed. Please retry.');
            current.tokens = tokens;
          });
          if (!tokens.scopes.includes('chatgpt.tokens.use.direct'))
            throw new ChatGPTError('ChatGPT plan permission is no longer enabled.', 'CHATGPT_PERMISSION');
          return tokens.access;
        } catch (err) {
          if (err instanceof ChatGPTError && err.code === 'CHATGPT_SIGN_IN') {
            await this.write((db) => {
              const current = db.profiles.find((p) => p.id === id);
              if (current && current.tokens?.refresh === previous.refresh) {
                current.tokens = undefined;
                current.models = [];
                current.verifiedAt = undefined;
              }
            });
          }
          throw err;
        }
      })().finally(() => this.refreshes.delete(id));
      this.refreshes.set(id, refresh);
    }
    const token = await refresh;
    signal?.throwIfAborted();
    return token;
  }
  async listModels() {
    await this.ready;
    const p = this.profile();
    if (!p) throw planFailure(undefined, 401);
    const signal = this.signal(p.id);
    const token = await this.access(p.id, signal);
    const body = await this.json(`${RESOURCE}/models`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    });
    if (!Array.isArray(body.models))
      throw new ChatGPTError('ChatGPT returned an unrecognized model directory.');
    const seen = new Set<string>();
    const models = body.models
      .filter((m: any) => m?.visibility === 'list')
      .slice(0, 4000)
      .map((m: any) =>
        Model.parse({
          id: m.slug,
          name: m.display_name ?? m.slug,
          ...(Number.isInteger(m.context_window) && m.context_window > 0
            ? { contextWindow: m.context_window }
            : {}),
        }),
      )
      .filter((m: z.infer<typeof Model>) => !seen.has(m.id) && !!seen.add(m.id));
    signal.throwIfAborted();
    await this.write((db) => {
      const current = db.profiles.find((entry) => entry.id === p.id);
      if (current?.tokens && db.active === p.id && !signal.aborted) current.models = models;
    });
  }
  private async disconnect(id: string) {
    const p = this.profile(id);
    if (!p) throw new ChatGPTError('Choose a saved ChatGPT connection.');
    this.stop(id);
    const refresh = p.tokens?.refresh;
    // Remove locally first, so neither refresh nor an in-flight request can revive a logged-out session.
    await this.write((db) => {
      const current = db.profiles.find((p) => p.id === id)!;
      current.tokens = undefined;
      current.models = [];
      current.verifiedAt = undefined;
    });
    let revoked = !refresh;
    if (refresh)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const discovery = await this.json(`${AUTH}/.well-known/openid-configuration`);
          const endpoint = new URL(discovery.revocation_endpoint);
          if (endpoint.origin !== AUTH || discovery.issuer !== AUTH) throw new Error('invalid discovery');
          const res = await this.fetcher(endpoint, {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              token: refresh,
              token_type_hint: 'refresh_token',
              client_id: p.clientId,
            }),
          });
          if (res.status === 200) {
            revoked = true;
            await res.body?.cancel();
            break;
          }
          await res.body?.cancel();
          if (res.status < 500) break;
        } catch {
          /* Preserve no local token; report the unconfirmed remote revoke below. */
        }
        if (!attempt) await new Promise((resolve) => setTimeout(resolve, 300));
      }
    this.message = revoked
      ? 'Signed out. The saved registration can be used to sign in again.'
      : 'Signed out locally. Remote revocation was not confirmed; disconnect orb in ChatGPT Settings → Usage.';
  }
  close() {
    this.pending?.abort();
    for (const ac of this.lifetimes.values()) ac.abort();
  }
}
