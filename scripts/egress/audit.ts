/**
 * P1.11 egress audit. Boots a real Orb sidecar (temp homes, Electron-as-Node, the `orb` profile) with every
 * proxy variable pointing at a logging proxy (./proxy.ts) and a socket-level monitor preloaded into the sidecar
 * (./monitor.cjs), runs one scripted session (canvas.create → root agent, one prompt, one `place_card` tool
 * call, a final answer), stops the sidecar, and fails if any host other than the configured model host was
 * contacted.
 *
 * Two independent observers, because dsh's proxy policy is not the whole story:
 *   - the proxy sees what dsh routes through HTTP(S)_PROXY: every `fetch`/undici request, incl. pi-ai's LLM
 *     calls (dsh-http-proxy installs a global undici dispatcher; README "Use this package");
 *   - the monitor sees every outbound TCP/TLS socket and DNS query in the sidecar process and its Node
 *     children, which also catches what bypasses the proxy: loopback (always direct), and `node:http` callers
 *     such as dsh-session-telemetry-otel's OTLP exporter (README "Telemetry is direct by design").
 * The monitor runs in enforce mode: a direct non-loopback connect, or a DNS query for any host but the model
 * host, is recorded and then refused, so an audit run never lets an attempt leave the machine. The proxy only
 * passes the model host on.
 *
 * P3.5: in the mock modes the scripted session also runs Scout's research tools: Orb places a card, adds a frame
 * and delegates it to Scout; Scout calls `web_search` (Orb's OpenAI web-search provider, pointed at the mock model
 * host's `/v1/responses`), `fetch_url` on the results and on a redirecting URL of a mock site (`mock-site.orb.test`,
 * reachable only through the proxy), and places a source card. The audit then allows the mock site ONLY for the
 * URLs the session fetched: every `fetch_url` URL in the session logs plus the redirect chains the source cache
 * recorded (`assets/sources/*.json`). Any other request to a fetch host, or any other host, is a violation.
 *
 * Modes:
 *   - `deterministic`: the model host is the local mock LLM, addressed as `mock-llm.orb.test`, a name only the
 *     proxy resolves (dsh never proxies loopback, so a 127.0.0.1 baseURL would hide the model traffic).
 *   - `live`: the real OpenAI route (`api.openai.com`, gpt-6-luna), needs OPENAI_API_KEY in the environment.
 *   - `telemetry`: deterministic, but with telemetry LEFT ON (no DSH_TELEMETRY_DISABLED / DSH_TELEMETRY_MODE,
 *     the telemetry and feedback rows re-enabled by a test patch) and a message-feedback event recorded, which
 *     is what triggers dsh's session upload. Used to prove the audit sees a telemetry attempt.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  MockLlm,
  mockProviderPatch,
  mockSearchPatch,
  mockWebSearchResponse,
  MOCK_KEY_ENV,
  type MockRequest,
  type MockTurn,
} from '../testkit/mockLlm.ts';
import { MockParallel, MOCK_PARALLEL_KEY } from '../testkit/mockParallel.ts';
import { makePdf } from '../testkit/fixtures.ts';
import { listSessionIds, readSessionLog } from '../testkit/sessionLog.ts';
import { startSidecar, type TestSidecar } from '../testkit/sidecar.ts';
import { EgressProxy, type ProxyHit } from './proxy.ts';

export type EgressMode = 'deterministic' | 'live' | 'telemetry';

export const MOCK_MODEL_HOST = 'mock-llm.orb.test';
/** P3.5: the web site Scout searches for and fetches in the mock modes (reachable only through the proxy). */
export const MOCK_SITE_HOST = 'mock-site.orb.test';
export const OPENAI_MODEL_HOST = 'api.openai.com';
/**
 * P6.7: Parallel AI's one host. In the mock modes a MockParallel answers as `api.parallel.ai` through the proxy (the
 * sidecar is pointed at it with PARALLEL_BASE_URL=http://api.parallel.ai and a mock key in PARALLEL_API_KEY); Scout
 * then runs web_search, parallel_extract, web_answer, entity_search and deep_research against it. The audit allows
 * the host ONLY for those REST paths (`/v1/...`, `/v1beta/...`), never for anything else.
 */
export const PARALLEL_HOST = 'api.parallel.ai';
/** dsh-base's default OTLP endpoint host (node_modules/@deepseek-ai/dsh-base/cordis.patch.yml, session-telemetry-otel). */
export const TELEMETRY_HOST = 'dsh-otel-collector.deepseeksvc.com';
const MONITOR = resolve(import.meta.dirname, 'monitor.cjs');

export type MonitorRecord = {
  pid: number;
  at: number;
  kind: 'hello' | 'connect' | 'dns' | 'udp';
  host?: string;
  /** connect: the address actually dialled. */
  address?: string;
  port?: number;
  fn?: string;
  loopback?: boolean;
  allowed?: boolean;
  blocked?: boolean;
  argv?: string[];
};

export type EgressReport = {
  mode: EgressMode;
  modelHost: string;
  /** True when no host other than the model host was contacted (and the run itself was valid). */
  ok: boolean;
  /** Why the audit failed: hosts contacted besides the model host. */
  violations: string[];
  /** Problems with the run itself (no session, monitor not loaded…): the audit proves nothing then. */
  invalid: string[];
  /** Every non-loopback host anyone tried to reach, with how it was seen. */
  hosts: Array<{ host: string; seenBy: string[] }>;
  proxyHits: ProxyHit[];
  monitor: { processes: number; records: MonitorRecord[] };
  session: {
    canvasId?: string;
    sessionId?: string;
    cardPlaced: boolean;
    modelRequests: number;
    feedback?: string;
    /** P3.5 Scout: searches made, URLs it fetched (fetch_url calls + recorded redirect chains), source card placed. */
    scout?: { searches: number; fetched: string[]; sourceCard: boolean };
    /** P6.7: the REST calls Scout's Parallel tools made to the mock `api.parallel.ai`, by "METHOD path". */
    parallel?: { calls: string[]; researchCard: boolean };
  };
  /** Telemetry-mode only: attempts to reach the telemetry host. */
  telemetryAttempts: string[];
};

export type EgressAuditOptions = {
  mode?: EgressMode;
  /** Keep the temp homes (debugging). */
  keepHome?: boolean;
  /** Progress lines (never secrets, never the token URL). */
  log?: (line: string) => void;
  /** How long to wait for a telemetry attempt after the feedback event (telemetry mode). Default 8000 ms. */
  telemetryWaitMs?: number;
  /**
   * Live mode only (P3.5): Orb delegates one small research task to Scout (web_search through OpenAI web search,
   * fetch_url, one source card). The proxy then passes every host on (recorded), and the audit allows a host only
   * for the URLs the session fetched.
   */
  scout?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(
  what: string,
  probe: () => T | undefined | false,
  timeoutMs = 30_000,
  stepMs = 100,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = probe();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`egress audit: timed out waiting for ${what}`);
    await sleep(stepMs);
  }
}

/** Unary gateway call (same envelope as apps/ui/src/wire/call.ts). Throws on any failure. */
async function rpc(sc: TestSidecar, ns: string, method: string, args: unknown): Promise<any> {
  const rpcId = randomUUID();
  const res = await sc.fetch(`${sc.origin}/api/${ns}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: `${ns}/${method}`, payload: { args } }),
  });
  if (!res.ok) throw new Error(`egress audit: ${ns}/${method} → HTTP ${res.status}`);
  const body = (await res.json()) as any;
  if (!body?.result?.ok)
    throw new Error(`egress audit: ${ns}/${method} failed: ${JSON.stringify(body?.result?.error ?? body)}`);
  return body.result.value;
}

/** Proxy variables, both casings (dsh reads lowercase first, uppercase as the fallback). NO_PROXY left blank. */
function proxyEnv(url: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of ['http_proxy', 'https_proxy', 'all_proxy']) {
    env[name] = url;
    env[name.toUpperCase()] = url;
  }
  env.no_proxy = '';
  env.NO_PROXY = '';
  return env;
}

/**
 * Test patch that turns telemetry back ON: the rows Orb's bundle disables, restated with dsh-base's own
 * config (mode FEEDBACK_ONLY, the real collector URL) and a short batch delay so the upload is attempted
 * while the audit is still watching. `config` replaces whole, so every key is restated.
 */
export function telemetryOnPatch(): string {
  return [
    '# Egress audit (telemetry mode) only: telemetry LEFT ON to prove the audit sees it.',
    '- id: session-telemetry-otel',
    '  disabled: false',
    '  config:',
    '    mode: FEEDBACK_ONLY',
    '    shutdownTimeoutMillis: 3000',
    '    maxRequestBytes: 4000000',
    '    exporter:',
    `      url: 'https://${TELEMETRY_HOST}/v1/logs'`,
    '      compression: gzip',
    '      timeoutMillis: 1000',
    '    processor:',
    '      scheduledDelayMillis: 200',
    '      maxQueueSize: 2048',
    '      maxExportBatchSize: 2048',
    '      exportTimeoutMillis: 1500',
    '- id: message-feedback',
    '  disabled: false',
    '  config:',
    '    maxNoteBytes: 8192',
    '- id: command-feedback',
    '  disabled: false',
    '',
  ].join('\n');
}

function readMonitor(path: string): MonitorRecord[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as MonitorRecord);
}

/** Run one audit. Never throws for a failed audit: the report says why. Throws only on harness errors. */
export async function runEgressAudit(options: EgressAuditOptions = {}): Promise<EgressReport> {
  const mode = options.mode ?? 'deterministic';
  const log = options.log ?? (() => {});
  const live = mode === 'live';
  if (live && !process.env.OPENAI_API_KEY)
    throw new Error('egress audit: live mode needs OPENAI_API_KEY');
  const modelHost = live ? OPENAI_MODEL_HOST : MOCK_MODEL_HOST;

  const work = mkdtempSync(join(tmpdir(), 'orb-egress-'));
  const monitorLog = join(work, 'egress-monitor.jsonl');
  const invalid: string[] = [];
  const session: EgressReport['session'] = { cardPlaced: false, modelRequests: 0 };

  let llm: MockLlm | undefined;
  let parallelMock: MockParallel | undefined;
  let site: Server | undefined;
  let proxy: EgressProxy | undefined;
  let sc: TestSidecar | undefined;
  let scripted: ScriptedTeam | undefined;
  try {
    const cardTitle = 'Egress audit card';
    if (!live) {
      scripted = scriptedTeam(cardTitle);
      llm = await new MockLlm({
        defaultTurn: scripted.turn,
        responses: () =>
          mockWebSearchResponse(
            [
              { url: `http://${MOCK_SITE_HOST}/article`, title: 'Audit article', line: 'What the audit page says.' },
              { url: `http://${MOCK_SITE_HOST}/report.pdf`, title: 'Audit report', line: 'A PDF.' },
            ],
            'egress audit research',
          ),
      }).start();
      site = await startMockSite();
      parallelMock = await new MockParallel({
        taskMs: 80,
        searchResults: [
          { url: `http://${MOCK_SITE_HOST}/article`, title: 'Audit article', excerpt: 'What the audit page says.' },
          { url: `http://${MOCK_SITE_HOST}/report.pdf`, title: 'Audit report', excerpt: 'A PDF.' },
        ],
      }).start();
    }
    const mockPort = llm ? Number(new URL(llm.baseURL).port) : 0;
    const sitePort = site ? (site.address() as AddressInfo).port : 0;
    proxy = await new EgressProxy(
      live
        ? { forward: [OPENAI_MODEL_HOST], forwardAll: options.scout === true }
        : {
            routes: {
              [MOCK_MODEL_HOST]: { host: '127.0.0.1', port: mockPort },
              [MOCK_SITE_HOST]: { host: '127.0.0.1', port: sitePort },
              [PARALLEL_HOST]: { host: '127.0.0.1', port: parallelMock!.port },
            },
          },
    ).start();
    log(`proxy on ${proxy.url}; model host ${modelHost}`);

    const extraPatch = [
      live ? '' : mockProviderPatch(`http://${MOCK_MODEL_HOST}/v1`),
      // Scout's web_search: Orb's OpenAI web-search provider on the mock model host (the same allowed host).
      live ? '' : mockSearchPatch(`http://${MOCK_MODEL_HOST}/v1`),
      mode === 'telemetry' ? telemetryOnPatch() : '',
    ].join('\n');
    const env: NodeJS.ProcessEnv = {
      ...proxyEnv(proxy.url),
      NODE_OPTIONS: `--require "${MONITOR}"`,
      ORB_EGRESS_MONITOR_LOG: monitorLog,
      ORB_EGRESS_ALLOW_HOSTS: modelHost,
      ORB_EGRESS_ENFORCE: '1',
      ...(live ? {} : { [MOCK_KEY_ENV]: 'orb-mock-key' }),
      // P6.7: the mock Parallel as `api.parallel.ai` (plain http through the proxy), with its mock key.
      ...(live ? {} : { PARALLEL_API_KEY: MOCK_PARALLEL_KEY, PARALLEL_BASE_URL: `http://${PARALLEL_HOST}` }),
      // Telemetry left on: drop Orb's process-level kill switches (undefined = not passed to the child).
      ...(mode === 'telemetry'
        ? {
            DSH_TELEMETRY_DISABLED: undefined,
            DSH_TELEMETRY_MODE: undefined,
            DSH_TELEMETRY_OTLP_URL: undefined,
          }
        : {}),
    };
    sc = await startSidecar({ homeDir: work, extraPatch: extraPatch.trim() ? extraPatch : undefined, env });
    log('sidecar up');
    // P6.33: directory discovery uses the same configured model host and proxy policy as generation.
    await rpc(sc, 'orb', 'models.discover', { request: { provider: live ? 'openai' : 'orb-mock' } });

    // ---- the scripted session: a card, then (mock modes) Scout searches and fetches ----
    const canvas = await rpc(sc, 'orb', 'canvas.create', { request: { prompt: 'Egress audit' } });
    session.canvasId = canvas.id;
    session.sessionId = canvas.rootSessionId ?? undefined;
    log(`canvas ${canvas.id}`);
    await rpc(sc, 'orb', 'chat.send', {
      canvasId: canvas.id,
      request: {
        text: live
          ? options.scout
            ? `Use place_card once to put a doc card titled "${cardTitle}" (one-line body and why) on the board, add one frame ` +
              'titled "Sources" with add_frame, then delegate to Scout on that frame with exactly this instruction: ' +
              '"Use web_search once for the 2026 IEA Global EV Outlook, read the best result with fetch_url (page 1 only), ' +
              'place ONE source card for it, then send_message done. Nothing else." Then reply "done".'
            : `Use the place_card tool exactly once to put a doc card titled "${cardTitle}" with a one-line body and why on the board, then reply "done".`
          : 'Put one card on the board, then have Scout research the question.',
      },
    });
    const boardPath = join(sc.paths.orbHome, 'canvases', canvas.id, 'board.jsonl');
    const cardsAdded = (): Array<{ type: string; provenance?: { agent?: string } }> =>
      existsSync(boardPath)
        ? readFileSync(boardPath, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l) as { type: string; data: any })
            .filter((e) => e.type === 'card.added')
            .map((e) => e.data.card)
        : [];
    const cardOnBoard = () => cardsAdded().some((c) => c.type === 'doc');
    if (scripted) {
      const team = scripted;
      await waitFor('Scout to finish its scripted research', () => team.scoutDone(), 60_000);
      session.cardPlaced = await waitFor('card.added in board.jsonl', cardOnBoard, 5_000).catch(() => false);
      const sourceCard = await waitFor(
        'the source card in board.jsonl',
        () => cardsAdded().some((c) => c.type === 'source' && c.provenance?.agent === 'scout'),
        5_000,
      ).catch(() => false);
      // P6.7: web_search runs on Parallel Search (the key is set), so the searches are the mock Parallel's.
      session.scout = { searches: parallelMock?.count('POST', '/v1/search') ?? 0, fetched: [], sourceCard: Boolean(sourceCard) };
      const researchCard = cardsAdded().some((c) => c.type === 'research');
      session.parallel = {
        calls: [...new Set(parallelMock?.requests.map((r) => `${r.method} ${r.path.replace(/(trun|findall|tgrp)_[0-9]+/, '$1_N')}`) ?? [])].sort(),
        researchCard,
      };
    } else {
      session.cardPlaced = await waitFor('card.added in board.jsonl', cardOnBoard, 90_000).catch(() => false);
      if (options.scout) {
        const sourceCard = await waitFor(
          "Scout's source card in board.jsonl",
          () => cardsAdded().some((c) => c.type === 'source' && c.provenance?.agent === 'scout'),
          240_000,
          500,
        ).catch(() => false);
        // Let Scout finish its turn (send_message) before the sidecar stops.
        await sleep(8_000);
        session.scout = {
          searches: proxy.hits.filter((h) => h.host === OPENAI_MODEL_HOST).length > 0 ? 1 : 0,
          fetched: [],
          sourceCard: Boolean(sourceCard),
        };
      }
    }
    // The turn ends after the last model response; give the agent loop time to commit it.
    const assistantId = await waitFor(
      'the final assistant message in the session log',
      () => {
        try {
          const events = readSessionLog(sc!.paths.dshHome, session.sessionId!);
          const msgs = events.filter(
            (e) => e.type === 'assistant/message' && (e.data?.message?.content?.length ?? 0) > 0,
          );
          const ended = events.some((e) => e.type === 'turn/end');
          return ended && msgs.length ? (msgs.at(-1)!.data.message.id as string) : undefined;
        } catch {
          return undefined;
        }
      },
      live ? 90_000 : 20_000,
      200,
    ).catch(() => undefined);
    session.modelRequests = llm
      ? llm.requests.length
      : proxy.hits.filter((h) => h.host === modelHost && h.decision !== 'refused').length;

    if (mode === 'telemetry') {
      // A message rating is a `feedback/message-put` event: the trigger of dsh's FEEDBACK_ONLY session upload.
      if (!assistantId) invalid.push('no assistant message to rate');
      else {
        try {
          const put = await rpc(sc, 'messageFeedback', 'put', {
            request: {
              sessionId: session.sessionId,
              messageId: assistantId,
              rating: 'positive',
              ifVersion: null,
            },
          });
          session.feedback = put?.ok === false ? `rejected: ${JSON.stringify(put.error ?? put)}` : 'recorded';
        } catch (err) {
          session.feedback = `failed: ${(err as Error).message}`;
        }
        log(`feedback ${session.feedback}`);
        const seen = () =>
          readMonitor(monitorLog).some((r) => r.host === TELEMETRY_HOST) ||
          proxy!.hits.some((h) => h.host === TELEMETRY_HOST);
        await waitFor('a telemetry attempt', seen, options.telemetryWaitMs ?? 8_000).catch(() => undefined);
      }
    } else {
      // Let anything scheduled after the turn (titles, uploads, flushes) have a chance to fire.
      await sleep(1_500);
    }
  } finally {
    await sc?.stop().catch(() => {});
    await proxy?.close();
    await llm?.close();
    await parallelMock?.close();
    if (site) {
      site.closeAllConnections();
      await new Promise<void>((r) => site!.close(() => r()));
    }
  }

  // ---- analysis ----
  const records = readMonitor(monitorLog);
  const proxyHits = proxy?.hits ?? [];
  const hello = records.filter((r) => r.kind === 'hello');
  if (!hello.some((r) => r.argv?.some((a) => a.endsWith(join('dsh', 'lib', 'bin.js')))))
    invalid.push('the egress monitor did not load in the sidecar process');
  if (!session.sessionId) invalid.push('no root session was created');
  if (!live && session.modelRequests < 2)
    invalid.push(`expected 2 model requests, saw ${session.modelRequests}`);
  if (!live && !session.cardPlaced) invalid.push('place_card did not put a card on the board');
  if (!proxyHits.some((h) => h.host === modelHost && h.decision !== 'refused'))
    invalid.push(`the model host ${modelHost} was never reached through the proxy`);
  // P3.5: the URLs the session fetched (fetch_url calls in the session logs + the redirect chains of the cache).
  const fetched = fetchedUrls(join(work, 'dsh'), join(work, 'Orb'));
  if (session.scout) {
    session.scout.fetched = fetched;
    if (live) {
      if (fetched.length === 0) invalid.push('Scout fetched nothing');
    } else {
      if (session.scout.searches < 1) invalid.push('Scout did not call web_search through the search provider');
      if (!fetched.some((u) => u.endsWith('/article')) || !fetched.some((u) => u.endsWith('/report.pdf')))
        invalid.push(`Scout did not fetch the search results (fetched: ${fetched.join(', ') || 'nothing'})`);
      if (!proxyHits.some((h) => h.host === MOCK_SITE_HOST && h.decision === 'routed'))
        invalid.push(`the mock site ${MOCK_SITE_HOST} was never reached through the proxy`);
    }
    if (!session.scout.sourceCard) invalid.push('Scout placed no source card');
  }
  const fetchJudgement = judgeFetchHits(
    proxyHits.filter((h) => h.host !== PARALLEL_HOST),
    fetched,
    modelHost,
  );
  // P6.7: Parallel traffic is judged on its own: only the mock host, only routed plain-http REST calls.
  const parallelJudgement = judgeParallelHits(proxyHits);
  if (!live && session.scout) {
    for (const need of ['POST /v1/search', 'POST /v1/extract', 'POST /v1/responses', 'POST /v1beta/findall/entity-search', 'POST /v1/tasks/runs'])
      if (!session.parallel?.calls.includes(need)) invalid.push(`Scout's Parallel tools never made ${need}`);
    if (!session.parallel?.researchCard) invalid.push('deep_research placed no Research run card');
  }

  const seenBy = new Map<string, Set<string>>();
  const see = (host: string, by: string) => {
    const set = seenBy.get(host) ?? new Set<string>();
    set.add(by);
    seenBy.set(host, set);
  };
  for (const h of proxyHits) see(h.host, `proxy ${h.via} :${h.port} (${h.decision})`);
  const proxyPort = proxy?.listenPort;
  for (const r of records) {
    if (r.kind === 'hello' || !r.host) continue;
    if (r.loopback) {
      // Loopback is local, not egress. Only the proxy is expected; anything else is listed for the record.
      if (r.kind === 'connect' && r.port !== proxyPort)
        see(`${r.address ?? r.host} (loopback)`, `monitor connect :${r.port}`);
      continue;
    }
    see(
      r.host,
      `monitor ${r.kind}${r.fn ? ` ${r.fn}` : ''}${r.address && r.address !== r.host ? ` ${r.address}` : ''}${r.port ? ` :${r.port}` : ''}${r.blocked ? ' (blocked)' : ''}`,
    );
  }
  const hosts = [...seenBy].map(([host, by]) => ({ host, seenBy: [...by].sort() }));
  const violations = [
    ...hosts
      .filter(
        (h) =>
          !h.host.endsWith('(loopback)') &&
          h.host !== modelHost &&
          !fetchJudgement.hosts.has(h.host) &&
          !(h.host === PARALLEL_HOST && parallelJudgement.violations.length === 0),
      )
      .map((h) => `${h.host}: ${h.seenBy.join('; ')}`),
    ...fetchJudgement.violations,
    ...parallelJudgement.violations,
  ];
  // A direct (non-proxied) socket to the model host is not a new destination, but it means the proxy policy
  // was bypassed; it was blocked, so the run would have been invalid anyway. Report it.
  const direct = records.filter((r) => r.kind === 'connect' && !r.loopback);
  for (const r of direct)
    if (r.host === modelHost) invalid.push(`direct (unproxied) connect to ${r.host}:${r.port}`);
  const telemetryAttempts = hosts
    .filter((h) => h.host === TELEMETRY_HOST)
    .map((h) => `${h.host}: ${h.seenBy.join('; ')}`);

  if (!options.keepHome) rmSync(work, { recursive: true, force: true });
  else log(`kept ${work}`);

  return {
    mode,
    modelHost,
    ok: violations.length === 0 && invalid.length === 0,
    violations,
    invalid,
    hosts,
    proxyHits,
    monitor: { processes: new Set(hello.map((r) => r.pid)).size, records },
    session,
    telemetryAttempts,
  };
}

export function formatReport(r: EgressReport): string {
  const lines = [
    `egress audit (${r.mode}): ${r.ok ? 'PASS' : 'FAIL'}`,
    `  model host: ${r.modelHost}`,
    `  session: canvas ${r.session.canvasId ?? '-'}, card placed: ${r.session.cardPlaced}, model requests: ${r.session.modelRequests}` +
      (r.session.feedback ? `, feedback: ${r.session.feedback}` : ''),
    ...(r.session.parallel
      ? [`  parallel (mock ${PARALLEL_HOST}): ${r.session.parallel.calls.join(', ') || '-'}; research card: ${r.session.parallel.researchCard}`]
      : []),
    ...(r.session.scout
      ? [
          `  scout: ${r.session.scout.searches} search(es), source card: ${r.session.scout.sourceCard}, fetched: ${r.session.scout.fetched.join(', ') || '-'}`,
        ]
      : []),
    `  proxy: ${r.proxyHits.length} request(s); monitor: ${r.monitor.processes} process(es), ${r.monitor.records.filter((x) => x.kind !== 'hello').length} socket/DNS record(s)`,
    '  hosts contacted:',
    ...(r.hosts.length ? r.hosts.map((h) => `    ${h.host}  [${h.seenBy.join('; ')}]`) : ['    (none)']),
  ];
  if (r.violations.length) lines.push('  VIOLATIONS:', ...r.violations.map((v) => `    ${v}`));
  if (r.invalid.length) lines.push('  INVALID RUN:', ...r.invalid.map((v) => `    ${v}`));
  if (r.mode === 'telemetry')
    lines.push(
      `  telemetry attempts seen: ${r.telemetryAttempts.length ? r.telemetryAttempts.join('; ') : 'none'}`,
    );
  return lines.join('\n');
}

/**
 * The URLs a session fetched: every `fetch_url` call (its `url` argument) found in any session log under
 * `dshHome`, plus every URL of the redirect chains the source cache recorded under `orbHome` (a fetch of `/old`
 * that redirected to `/article` requested both).
 */
export function fetchedUrls(dshHome: string, orbHome: string): string[] {
  const urls = new Set<string>();
  const add = (u: unknown) => {
    if (typeof u !== 'string') return;
    try {
      const url = new URL(u);
      url.hash = '';
      urls.add(url.href);
    } catch {
      // not a URL
    }
  };
  const visit = (node: unknown, depth = 0): void => {
    if (!node || typeof node !== 'object' || depth > 12) return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    const o = node as Record<string, unknown>;
    if (o.name === 'fetch_url' || o.toolName === 'fetch_url') {
      for (const key of ['arguments', 'args', 'input']) {
        let a = o[key];
        if (typeof a === 'string') {
          try {
            a = JSON.parse(a);
          } catch {
            a = undefined;
          }
        }
        if (a && typeof a === 'object') add((a as { url?: unknown }).url);
      }
    }
    for (const v of Object.values(o)) visit(v, depth + 1);
  };
  for (const id of listSessionIds(dshHome)) {
    try {
      for (const event of readSessionLog(dshHome, id)) visit(event);
    } catch {
      // a session without an artifact yet
    }
  }
  const canvases = join(orbHome, 'canvases');
  if (existsSync(canvases))
    for (const canvas of readdirSync(canvases)) {
      const dir = join(canvases, canvas, 'assets', 'sources');
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
        try {
          const meta = JSON.parse(readFileSync(join(dir, name), 'utf8')) as { url?: string; finalUrl?: string; chain?: string[] };
          add(meta.url);
          add(meta.finalUrl);
          meta.chain?.forEach(add);
        } catch {
          // ignore a broken entry
        }
      }
    }
  return [...urls].sort();
}

/**
 * Judge the proxy hits to hosts other than the model host against the URLs the session fetched: a plain-http
 * request must be exactly one of those URLs (host, port and path); an https tunnel (path hidden by TLS) must go to
 * the host and port of a fetched https URL. Returns the fetch hosts that were legitimately contacted and a
 * violation for every other hit.
 */
export function judgeFetchHits(
  hits: readonly ProxyHit[],
  fetched: readonly string[],
  modelHost: string,
): { hosts: Set<string>; violations: string[] } {
  const parsed = fetched.flatMap((u) => {
    try {
      return [new URL(u)];
    } catch {
      return [];
    }
  });
  const portOf = (u: URL) => Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  const hosts = new Set<string>();
  const violations: string[] = [];
  for (const h of hits) {
    if (h.host === modelHost) continue;
    const ok =
      h.via === 'forward'
        ? parsed.some((u) => u.protocol === 'http:' && u.hostname === h.host && portOf(u) === h.port && u.pathname === h.path)
        : parsed.some((u) => u.protocol === 'https:' && u.hostname === h.host && portOf(u) === h.port);
    if (ok) hosts.add(h.host);
    else
      violations.push(
        `${h.host}: proxy ${h.via} :${h.port}${h.path ? ` ${h.path}` : ''} was not a URL the session fetched`,
      );
  }
  // A host with any unexplained hit is not a legitimate fetch host.
  for (const v of violations) hosts.delete(v.slice(0, v.indexOf(':')));
  return { hosts, violations };
}

/**
 * P6.7: every proxy hit to `api.parallel.ai` must be a routed plain-http REST call under /v1 or /v1beta (the mock
 * answers there; a CONNECT tunnel, another path or a refused hit is a violation).
 */
export function judgeParallelHits(hits: readonly ProxyHit[]): { violations: string[] } {
  const violations: string[] = [];
  for (const h of hits) {
    if (h.host !== PARALLEL_HOST) continue;
    const ok = h.via === 'forward' && h.decision === 'routed' && /^\/v1(beta)?\//.test(h.path ?? '');
    if (!ok) violations.push(`${h.host}: proxy ${h.via} ${h.method} ${h.path ?? ''} (${h.decision}) is not a Parallel REST call`);
  }
  return { violations };
}

type ScriptedTeam = { turn: (req: MockRequest) => MockTurn; scoutDone: () => boolean };

const textOfMessage = (m: any): string =>
  typeof m?.content === 'string'
    ? m.content
    : Array.isArray(m?.content)
      ? m.content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n')
      : '';

/** The text of the tool results answering the last assistant message of a request. */
function lastToolTexts(req: MockRequest): string[] {
  const messages = (req.body.messages ?? []) as any[];
  const out: string[] = [];
  for (let i = messages.length - 1; i >= 0 && messages[i].role !== 'assistant'; i--)
    if (messages[i].role === 'tool') out.unshift(textOfMessage(messages[i]));
  return out;
}

/**
 * The mock modes' scripted session, routed per agent by the system prompt (Orb and Scout call the model
 * concurrently): Orb places a doc card and adds a frame, delegates the frame to Scout, and answers; Scout searches,
 * fetches both results, a redirecting URL and a missing page, places a source card and reports done. Wake-ups (Scout's messages
 * and settlement) get a short reply.
 */
function scriptedTeam(cardTitle: string): ScriptedTeam {
  const call = (name: string, args: Record<string, unknown>): MockTurn => ({ toolCalls: [{ name, arguments: args }] });
  let orbStep = 0;
  let scoutStep = 0;
  let scoutFinished = false;
  let results: string[] = [];
  const turn = (req: MockRequest): MockTurn => {
    const system = textOfMessage((req.body.messages ?? [])[0]);
    if (system.includes('You are Scout')) {
      const step = scoutStep++;
      if (step === 0) return call('web_search', { query: 'egress audit research', objective: 'Find the pages for the egress audit' });
      if (step === 1) {
        try {
          results = (JSON.parse(lastToolTexts(req)[0] ?? '{}').results ?? []).map((r: { url: string }) => r.url);
        } catch {
          results = [];
        }
        return call('fetch_url', { url: results[0] ?? `http://${MOCK_SITE_HOST}/article` });
      }
      if (step === 2) return call('fetch_url', { url: results[1] ?? `http://${MOCK_SITE_HOST}/report.pdf` });
      if (step === 3) return call('fetch_url', { url: `http://${MOCK_SITE_HOST}/old` });
      // A fetch that fails (HTTP 404) is not cached: only the session log says it was requested.
      if (step === 4) return call('fetch_url', { url: `http://${MOCK_SITE_HOST}/missing` });
      // P6.7: Scout's other Parallel tools, against the mock `api.parallel.ai` through the proxy.
      if (step === 5) return call('parallel_extract', { urls: [`http://${MOCK_SITE_HOST}/article`], objective: 'audit page' });
      if (step === 6) return call('web_answer', { question: 'What does the audit article say?' });
      if (step === 7) return call('entity_search', { entity_type: 'companies', objective: 'Audit companies', limit: 5, place: false });
      if (step === 8) return call('deep_research', { input: 'Egress audit research', processor: 'lite' });
      if (step === 9)
        return call('place_card', {
          type: 'source',
          title: 'Audit article',
          url: results[0] ?? `http://${MOCK_SITE_HOST}/article`,
          body: 'What the audit page says.',
          why: 'Read by Scout during the egress audit.',
        });
      if (step === 10) return call('send_message', { about: 'done', message: 'Placed one source card.' });
      scoutFinished = true;
      return { text: 'Done.' };
    }
    const step = orbStep++;
    if (step === 0)
      return {
        text: 'Placing a card. ',
        toolCalls: [
          { name: 'place_card', arguments: { type: 'doc', title: cardTitle, body: 'Placed by the egress audit.', why: 'Proves one tool call.' } },
          { name: 'add_frame', arguments: { title: 'Sources' } },
        ],
      };
    if (step === 1) {
      let frameId: string | undefined;
      for (const t of lastToolTexts(req)) {
        try {
          frameId ??= JSON.parse(t).frameId;
        } catch {
          // not the frame result
        }
      }
      return call('delegate', { role: 'scout', frameIds: frameId ? [frameId] : [], instruction: 'Research the question.' });
    }
    if (step === 2) return { text: 'The card is on the board; Scout is researching.' };
    return { text: 'Noted.' };
  };
  return { turn, scoutDone: () => scoutFinished };
}

/** The mock web site Scout fetches (served on loopback, reachable only as MOCK_SITE_HOST through the proxy). */
async function startMockSite(): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.url === '/article')
      res
        .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        .end('<html><head><title>Audit article</title></head><body><article><h1>Audit article</h1><p>What the audit page says.</p></article></body></html>');
    else if (req.url === '/report.pdf') res.writeHead(200, { 'content-type': 'application/pdf' }).end(makePdf(1, 'Audit report'));
    else if (req.url === '/old') res.writeHead(301, { location: '/moved' }).end();
    else if (req.url === '/moved')
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('Moved page text.');
    else res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return server;
}
