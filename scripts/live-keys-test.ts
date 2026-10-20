/**
 * P4.2 live check of the Test button against OpenAI (never part of `pnpm test` / `pnpm e2e`):
 *
 *   pnpm tsx scripts/live-keys-test.ts      (after `pnpm build`)
 *
 * 1. A sidecar (temp homes, throwaway Keychain service) with the real key in its launch env (OPENAI_API_KEY from the
 *    environment, else the dev key from the Keychain `ai.orb.app`, scripts/util/devKey.ts): `orb/keys.test` on
 *    openai / gpt-6-luna must answer Working.
 * 2. A second sidecar with a made-up key: the same test must answer "invalid key" (OpenAI's 401), with no key text.
 * The key is never printed; only the statuses and timings are.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { KeysTestResult } from '@orb/shared';
import { startSidecar, type TestSidecar } from './testkit/index.ts';
import { ensureDevKey } from './util/devKey.ts';

if (!(await ensureDevKey('OPENAI_API_KEY')))
  throw new Error('live-keys-test: needs OPENAI_API_KEY in the environment or the dev Keychain');

/** `orb/keys.test` over the authenticated loopback, as the UI calls it. */
async function keysTest(sc: TestSidecar, provider: string): Promise<KeysTestResult> {
  const res = await sc.fetch(`${sc.origin}/api/orb/keys.test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: randomUUID(),
      method: 'orb/keys.test',
      payload: { args: { request: { provider } } },
    }),
  });
  const reply = (await res.json()) as {
    result?: { ok: boolean; value?: unknown; error?: { code?: string } };
  };
  if (!reply.result?.ok) throw new Error(`keys.test failed: ${reply.result?.error?.code ?? res.status}`);
  return KeysTestResult.parse(reply.result.value);
}

async function run(label: string, key: string) {
  const sc = await startSidecar({ env: { OPENAI_API_KEY: key } });
  try {
    const result = await keysTest(sc, 'openai');
    const text = JSON.stringify(result);
    if (text.includes(key)) throw new Error('the test result carried the key');
    console.log(
      `${label}: ok=${result.ok} model=${result.model} state=${result.status.state}` +
        `${result.status.kind ? ` kind=${result.status.kind}` : ''}${result.code ? ` code=${result.code}` : ''} ${result.ms} ms`,
    );
    if (result.status.message) console.log(`  message: ${result.status.message}`);
    return result;
  } finally {
    await sc.stop();
  }
}

const real = await run('real key', process.env.OPENAI_API_KEY!);
const fake = await run('made-up key', `sk-proj-${randomBytes(24).toString('hex')}`);
const pass = real.ok && !fake.ok && fake.status.kind === 'invalid-key';
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
