/**
 * P4.3 live check of the cost meter against OpenAI's own usage numbers (never part of `pnpm test` / `pnpm e2e`):
 *
 *   pnpm tsx scripts/live-cost-check.ts      (after `pnpm build`)
 *
 * A sidecar (temp homes, throwaway Keychain service, every agent on openai / gpt-6-luna) whose OpenAI route goes
 * through a local recording relay: the relay forwards each request to https://api.openai.com unchanged and reads the
 * `usage` OpenAI returns (the `response.completed` event of each Responses stream). One small run: a canvas, one chat
 * message asking Orb for a short answer and one Critic question (a child session). Then `orb/cost.get` must equal the
 * provider's numbers exactly: uncached input = input_tokens − cached_tokens, cache read = cached_tokens, output =
 * output_tokens, summed over every request, and dollars = those tokens × the catalog price of gpt-6-luna.
 *
 * The key: OPENAI_API_KEY from the environment, else the dev key from the Keychain (`ai.orb.app`), in this process's
 * env only. The relay never logs headers or bodies; this script prints only token counts, dollars and timings.
 * The result is written to .orb-dev/live/p4.3-cost.json.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CanvasCost, CanvasMeta, costOf, PricesDescribeResult, type TokenBuckets } from '@orb/shared';
import type { ZodType } from 'zod';
import { listSessionIds, readSessionLog, repoRoot, startSidecar } from './testkit/index.ts';
import { ensureDevKey } from './util/devKey.ts';

if (!(await ensureDevKey('OPENAI_API_KEY')))
  throw new Error('live-cost-check: needs OPENAI_API_KEY in the environment or the dev Keychain');

const UPSTREAM = 'https://api.openai.com';
type Billed = {
  path: string;
  status: number;
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
  model?: string;
  /** What asked: the first words of the request's instructions (debugging which caller spent). */
  caller?: string;
};
const billed: Billed[] = [];
let inFlight = 0;
let lastActivity = Date.now();

const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const parts: Buffer[] = [];
    req.on('data', (c: Buffer) => parts.push(c));
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });

/** The usage OpenAI reported in a Responses stream (`response.completed`) or JSON body. */
function usageIn(
  text: string,
): { input: number; cached: number; cacheWrite: number; output: number; model?: string } | undefined {
  const objects: any[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      objects.push(JSON.parse(line.slice(6)));
    } catch {
      /* not JSON ([DONE]) */
    }
  }
  if (objects.length === 0) {
    try {
      objects.push({ response: JSON.parse(text) });
    } catch {
      return undefined;
    }
  }
  const done = objects.findLast((o) => o?.response?.usage);
  const u = done?.response?.usage;
  if (!u) return undefined;
  return {
    input: u.input_tokens ?? 0,
    cached: u.input_tokens_details?.cached_tokens ?? 0,
    // OpenAI reports prompt-cache writes too (`cache_write_tokens`); pi-ai maps them to cacheWrite and takes them
    // out of the uncached input (pi-ai dist/api/openai-responses-shared.js:439-449).
    cacheWrite: u.input_tokens_details?.cache_write_tokens ?? 0,
    output: u.output_tokens ?? 0,
    model: done.response.model,
  };
}

const relay = createServer(async (req, res) => {
  inFlight++;
  lastActivity = Date.now();
  try {
    const body = await readBody(req);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (['host', 'connection', 'content-length', 'accept-encoding'].includes(k) || v === undefined)
        continue;
      headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }
    const path = req.url ?? '/';
    const up = await fetch(`${UPSTREAM}${path}`, {
      method: req.method ?? 'POST',
      headers,
      ...(body.length > 0 ? { body } : {}),
    });
    res.writeHead(up.status, {
      'content-type': up.headers.get('content-type') ?? 'application/octet-stream',
    });
    let text = '';
    const decoder = new TextDecoder();
    if (up.body) {
      for await (const chunk of up.body as unknown as AsyncIterable<Uint8Array>) {
        text += decoder.decode(chunk, { stream: true });
        res.write(chunk);
        lastActivity = Date.now();
      }
    }
    res.end();
    const usage = usageIn(text);
    let caller: string | undefined;
    try {
      const sent = JSON.parse(body.toString('utf8'));
      const first = Array.isArray(sent.input) ? sent.input[0] : undefined;
      const sys =
        typeof sent.instructions === 'string' ? sent.instructions : JSON.stringify(first?.content ?? '');
      caller = sys.replace(/\s+/g, ' ').slice(0, 60);
    } catch {
      /* not JSON */
    }
    if (usage) billed.push({ path, status: up.status, ...usage, ...(caller ? { caller } : {}) });
    else console.log(`  relay: ${req.method} ${path} -> ${up.status} (no usage)`);
  } catch (err) {
    console.log(`  relay error: ${(err as Error).message}`);
    if (!res.headersSent) res.writeHead(502);
    res.end();
  } finally {
    inFlight--;
    lastActivity = Date.now();
  }
});
await new Promise<void>((r) => relay.listen(0, '127.0.0.1', () => r()));
const relayURL = `http://127.0.0.1:${(relay.address() as AddressInfo).port}/v1`;

const patch = [
  '# live-cost-check: OpenAI through the local recording relay (same requests, same key, same host upstream).',
  '- id: llm-pi-ai',
  '  config:',
  '    providers:',
  '      openai:',
  '        apiKeyEnv: OPENAI_API_KEY',
  `        baseURL: ${JSON.stringify(relayURL)}`,
  '',
].join('\n');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const keepHome = process.argv.includes('--keep-home');
const sc = await startSidecar({
  extraPatch: patch,
  env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
  keepHome,
});
if (keepHome) console.log(`homes kept: ${sc.paths.dshHome}`);
/** One `orb/<method>` call over the authenticated loopback, as the UI makes it. */
async function orb<T>(method: string, args: Record<string, unknown>, schema?: ZodType<T>): Promise<T> {
  const res = await sc.fetch(`${sc.origin}/api/orb/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: randomUUID(),
      method: `orb/${method}`,
      payload: { args },
    }),
  });
  const reply = (await res.json()) as {
    result?: { ok: boolean; value?: unknown; error?: { code?: string } };
  };
  if (!reply.result?.ok) throw new Error(`orb/${method} failed: ${reply.result?.error?.code ?? res.status}`);
  return schema ? schema.parse(reply.result.value) : (reply.result.value as T);
}
let pass: boolean;
let meter: CanvasCost | undefined;
try {
  const canvas = await orb(
    'canvas.create',
    { request: { prompt: 'Solid-state batteries in one paragraph', template: 'topic' } },
    CanvasMeta,
  );
  await orb('chat.send', {
    canvasId: canvas.id,
    request: {
      text:
        'Keep this very short. In two sentences, what is a solid-state battery? Then delegate Critic, on the first ' +
        'frame, to add exactly one question card and then stop. Do not delegate anyone else.',
    },
  });
  // Wait until the run is over: nothing in flight and no relay activity for 15 s (at most 4 minutes).
  const end = Date.now() + 240_000;
  while (Date.now() < end) {
    await sleep(1000);
    if (billed.length > 0 && inFlight === 0 && Date.now() - lastActivity > 15_000) break;
  }
  await orb('agents.control', { canvasId: canvas.id, request: { agent: 'all', action: 'stop' } }).catch(
    () => undefined,
  );
  await sleep(1500);

  const provider: TokenBuckets = {
    uncachedInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  for (const b of billed) {
    provider.uncachedInputTokens += b.input - b.cached - b.cacheWrite;
    provider.cacheReadTokens += b.cached;
    provider.cacheWriteTokens += b.cacheWrite;
    provider.outputTokens += b.output;
  }
  meter = await orb('cost.get', { canvasId: canvas.id }, CanvasCost);
  const prices = await orb('prices.describe', {}, PricesDescribeResult);
  const luna = prices.prices.find((p) => p.key === 'openai/gpt-6-luna')!;
  const expectedUsd = costOf(provider, luna.rates);
  const sameTokens = JSON.stringify(meter.tokens) === JSON.stringify(provider);
  const sameUsd = Math.abs(meter.usd - expectedUsd) < 1e-12;
  pass = sameTokens && sameUsd && meter.unpriced.length === 0 && meter.sessions >= 2;

  console.log(
    `requests billed by OpenAI: ${billed.length} (models: ${[...new Set(billed.map((b) => b.model))].join(', ')})`,
  );
  console.log(`provider usage:  ${JSON.stringify(provider)}`);
  console.log(
    `orb cost meter:  ${JSON.stringify(meter.tokens)} total=${meter.total} sessions=${meter.sessions}`,
  );
  console.log(`routes: ${meter.routes.map((r) => `${r.provider}/${r.model}`).join(', ')}`);
  console.log(`price gpt-6-luna (${luna.source}): ${JSON.stringify(luna.rates)}`);
  console.log(`meter $${meter.usd.toFixed(8)} vs tokens x price $${expectedUsd.toFixed(8)}`);
  if (!sameTokens || process.argv.includes('--verbose')) {
    // Which harness events carried usage, per session (to explain a difference: a failed or retried attempt OpenAI
    // billed but the harness never saw a usage sample for).
    await sleep(500);
    for (const id of listSessionIds(sc.paths.dshHome)) {
      const events = readSessionLog(sc.paths.dshHome, id);
      const count = (t: string) => events.filter((e) => e.type === t).length;
      const withUsage = events.filter((e) => e.type === 'assistant/message' && e.data?.usage).length;
      console.log(
        `  session ${id.slice(0, 14)}: messages=${count('assistant/message')} with usage=${withUsage} attempts=${count('assistant/attempt')} retries=${count('llm/retry-started')} interrupted=${events.filter((e) => e.data?.interrupted).length}`,
      );
    }
  }
  if (process.argv.includes('--verbose'))
    for (const b of billed)
      console.log(`  ${b.input}/${b.cached}/${b.cacheWrite}/${b.output} ${b.caller ?? ''}`);
  console.log(`elapsed ${Math.round((Date.now() - t0) / 1000)} s`);
  const out = join(repoRoot, '.orb-dev', 'live');
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, 'p4.3-cost.json'),
    `${JSON.stringify({ at: new Date().toISOString(), pass, requests: billed.length, provider, meter, price: luna }, null, 2)}\n`,
  );
} finally {
  await sc.stop();
  relay.close();
}
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
