/**
 * Gate 4 live check of the Keychain path (never part of `pnpm test` / `pnpm e2e`):
 *
 *   pnpm tsx scripts/live-keychain-check.ts      (after `pnpm build`)
 *
 * The other live scripts hand the sidecar the key in its launch ENV (the CredentialProvider's read-only env layer),
 * so they never prove that a key stored in the Keychain works against the real provider. This one does, the way the
 * app does it:
 *   1. A sidecar (temp homes, throwaway Keychain service `ai.orb.app.test.*`) launched with NO OPENAI_API_KEY in its
 *      environment: `orb/keys.describe` must say openai is not configured.
 *   2. The dev key (read from the dev Keychain `ai.orb.app` into a local variable, never into process.env) is sent
 *      once with `orb/keys.set`, as the Models settings card does: it must land in the Keychain (`source: keychain`).
 *   3. `orb/keys.test` on openai / gpt-6-luna must answer Working, and one chat turn must make Orb place a card
 *      (real api.openai.com traffic authenticated only by the Keychain item).
 *   4. `security find-generic-password -s <service> -a OPENAI_API_KEY` (attributes only, never -w/-g) finds the item.
 *   5. After the sidecar stops, no file under the test DSH_HOME or ORB_HOME holds the key or anything `sk-…`-shaped.
 * The key is never printed or logged; only statuses, counts and timings are.
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { KeyDescriptor, KeysDescribeResult, KeysTestResult } from '@orb/shared';
import type { ZodType } from 'zod';
import { listSessionIds, readSessionLog, startSidecar } from './testkit/index.ts';
import { keychainCli } from './testkit/keychain.ts';
import { DEV_KEYCHAIN_SERVICE } from './util/devKey.ts';

delete process.env.OPENAI_API_KEY;
const got = await keychainCli(['get', DEV_KEYCHAIN_SERVICE, 'OPENAI_API_KEY']).catch(() => undefined);
if (!got || got.code !== 0 || !got.stdout)
  throw new Error('live-keychain-check: no OPENAI_API_KEY in the dev Keychain (ai.orb.app)');
const key = got.stdout.trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const sc = await startSidecar({ keepHome: true, env: { OPENAI_API_KEY: undefined } });
const home = dirname(sc.paths.dshHome);

async function orb<T>(method: string, args: Record<string, unknown>, schema?: ZodType<T>): Promise<T> {
  const res = await sc.fetch(`${sc.origin}/api/orb/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: `orb/${method}`, payload: { args } }),
  });
  const reply = (await res.json()) as { result?: { ok: boolean; value?: unknown; error?: { code?: string } } };
  if (!reply.result?.ok) throw new Error(`orb/${method} failed: ${reply.result?.error?.code ?? res.status}`);
  const text = JSON.stringify(reply.result.value ?? null);
  if (text.includes(key)) throw new Error(`orb/${method} answered with the key`);
  return schema ? schema.parse(reply.result.value) : (reply.result.value as T);
}

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...files(p));
    else if (s.isFile()) out.push(p);
  }
  return out;
}

const checks: Record<string, boolean> = {};
try {
  const before = await orb('keys.describe', {}, KeysDescribeResult);
  const openaiBefore = before.keys.find((k) => k.provider === 'openai');
  checks['no key before keys.set'] = openaiBefore?.configured === false;
  console.log(`before: openai configured=${openaiBefore?.configured}`);

  const set = await orb('keys.set', { request: { provider: 'openai', key } }, KeyDescriptor);
  checks['keys.set → keychain'] = set.configured && set.source === 'keychain' && set.writable;
  console.log(`keys.set: configured=${set.configured} source=${set.source} redacted=${set.redacted ? 'yes' : 'no'}`);

  const sec = spawnSync('security', ['find-generic-password', '-s', sc.keychainService, '-a', 'OPENAI_API_KEY'], {
    encoding: 'utf8',
  });
  checks['security find-generic-password'] = sec.status === 0 && sec.stdout.includes(`"svce"<blob>="${sc.keychainService}"`);
  console.log(`security find-generic-password (attributes only): exit ${sec.status}`);

  const test = await orb('keys.test', { request: { provider: 'openai' } }, KeysTestResult);
  checks['keys.test live'] = test.ok;
  console.log(`keys.test: ok=${test.ok} model=${test.model} state=${test.status.state} ${test.ms} ms`);

  const canvas = await orb<{ id: string }>('canvas.create', { request: { prompt: 'Keychain live check' } });
  const t1 = Date.now();
  await orb('chat.send', {
    canvasId: canvas.id,
    request: {
      text: 'Use place_card exactly once to put a doc card titled "Keychain check" (one-line body and why) on the board. Do not delegate. Then stop.',
    },
  });
  let placed = 0;
  const end = Date.now() + 120_000;
  while (Date.now() < end && placed === 0) {
    await sleep(1000);
    for (const f of files(sc.paths.orbHome).filter((p) => p.endsWith('board.jsonl')))
      for (const line of readFileSync(f, 'utf8').split('\n'))
        if (line.includes('"card.added"') && line.includes('gpt-6-luna')) placed++;
  }
  checks['agent card placed live'] = placed > 0;
  console.log(`agent card(s) placed by openai/gpt-6-luna: ${placed} after ${Math.round((Date.now() - t1) / 1000)} s`);
  await orb('agents.control', { canvasId: canvas.id, request: { agent: 'all', action: 'stop' } }).catch(() => undefined);
} finally {
  await sc.stop();
}

const scanned = files(home);
// Session logs are zstd-compressed on disk: scan their decoded events too, not only the raw bytes.
const decoded = new Map<string, string>(
  listSessionIds(sc.paths.dshHome).map((id) => [`session ${id}`, JSON.stringify(readSessionLog(sc.paths.dshHome, id))]),
);
const texts = new Map<string, string>([...scanned.map((f) => [f, readFileSync(f, 'latin1')] as const), ...decoded]);
const withKey = [...texts].filter(([, t]) => t.includes(key));
const skShaped = [...texts].filter(([, t]) => /sk-[A-Za-z0-9_-]{16,}/.test(t));
const credFiles = scanned.filter((f) => /credential/i.test(f));
checks['test homes hold no key'] = withKey.length === 0 && skShaped.length === 0 && credFiles.length === 0;
console.log(
  `test homes scanned: ${scanned.length} files + ${decoded.size} decoded session log(s); with the key: ${withKey.length}; sk-shaped: ${skShaped.length}; credential files: ${credFiles.length}`,
);
if (process.argv.includes('--keep-home')) console.log(`homes kept: ${home}`);
else rmSync(home, { recursive: true, force: true });

for (const [name, ok] of Object.entries(checks)) console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
const pass = Object.values(checks).every(Boolean);
console.log(`elapsed ${Math.round((Date.now() - t0) / 1000)} s`);
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
