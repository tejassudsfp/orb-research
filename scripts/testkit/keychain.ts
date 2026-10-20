/**
 * Test Keychain services (P4.1). Every sidecar the testkit boots, and every e2e app run, gets its own throwaway
 * Keychain service `ai.orb.app.test.<id>` through ORB_KEYCHAIN_SERVICE, so no test ever reads or writes the real
 * `ai.orb.app` (where the dev key lives) and parallel tests never share items.
 *
 * Items the sidecar creates are owned by the Electron binary (the sidecar runs as Electron-as-Node). macOS gates a
 * Keychain item on the binary that created it, so plain `node` (Vitest) reading or deleting one blocks on an access
 * prompt. Everything here therefore goes through `@orb/keychain`'s CLI run by that same Electron binary
 * (HARNESS_NOTES §P4.1). Values move on pipes only; nothing here prints one.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { TEST_KEYCHAIN_PREFIX, testKeychainPrefix } from './namespace.ts';

const repoRoot = resolve(import.meta.dirname, '..', '..');
export const KEYCHAIN_TEST_PREFIX = TEST_KEYCHAIN_PREFIX;
const CLI = resolve(repoRoot, 'packages', 'orb-keychain', 'lib', 'cli.js');

function electronBinary(): string {
  return createRequire(import.meta.url)('electron') as string;
}

/** A fresh throwaway service name. */
export function newTestKeychainService(tag = 't'): string {
  return `${testKeychainPrefix()}${tag}-${process.pid}-${randomBytes(4).toString('hex')}`;
}

type CliResult = { code: number; stdout: string; stderr: string };

/**
 * Which binary runs the CLI. Default: the repo's Electron with the repo's CLI. P5.4: items the PACKAGED app creates
 * are owned by its own (ad-hoc signed) executable, so they are read and cleared with that executable and the CLI
 * shipped inside it (`Orb.app/Contents/Resources/node_modules/@orb/keychain/lib/cli.js`).
 */
export type KeychainRuntime = { binary: string; cli: string };

/** The packaged app's own runtime, for `<path>/Orb.app`. */
export function packagedKeychainRuntime(appPath: string): KeychainRuntime {
  return {
    binary: resolve(appPath, 'Contents', 'MacOS', 'orb'),
    cli: resolve(appPath, 'Contents', 'Resources', 'node_modules', '@orb', 'keychain', 'lib', 'cli.js'),
  };
}

/** Run one `@orb/keychain` CLI op under the Electron binary (the sidecar's code identity). */
export function keychainCli(
  args: string[],
  input?: string,
  timeoutMs = 15_000,
  runtime?: KeychainRuntime,
): Promise<CliResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(runtime?.binary ?? electronBinary(), [runtime?.cli ?? CLI, ...args], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`keychain cli ${args[0]} timed out (a Keychain prompt?)`));
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.end(input ?? '');
  });
}

async function jsonOp<T>(args: string[], input?: string, runtime?: KeychainRuntime): Promise<T> {
  const r = await keychainCli(args, input, 15_000, runtime);
  if (r.code !== 0) throw new Error(`keychain cli ${args[0]} failed (${r.code}): ${r.stderr.trim()}`);
  return JSON.parse(r.stdout) as T;
}

/** Whether `service` holds an item for `account` (a reference name, or `record:<scope>/<id>`). */
export async function keychainHas(
  service: string,
  account: string,
  runtime?: KeychainRuntime,
): Promise<boolean> {
  return (await jsonOp<{ present: boolean }>(['has', service, account], undefined, runtime)).present;
}

/** Whether the item equals `expected` (compared inside the helper; the value never comes back). */
export async function keychainMatches(
  service: string,
  account: string,
  expected: string,
  runtime?: KeychainRuntime,
): Promise<boolean> {
  return (await jsonOp<{ matches: boolean }>(['matches', service, account], expected, runtime)).matches;
}

/** Seed one item in a test service. */
export async function keychainSet(
  service: string,
  account: string,
  value: string,
  runtime?: KeychainRuntime,
): Promise<void> {
  await jsonOp(['set', service, account], value, runtime);
}

/** Remove every item of a test service. */
export async function clearTestKeychain(service: string, runtime?: KeychainRuntime): Promise<number> {
  return (await jsonOp<{ removed: number }>(['clear', service], undefined, runtime)).removed;
}

/** Synchronous clear, for process-exit cleanup. */
export function clearTestKeychainSync(service: string): void {
  spawnSync(electronBinary(), [CLI, 'clear', service], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'ignore',
    timeout: 15_000,
  });
}

/**
 * Every test service in the login Keychain that this run owns, from `security dump-keychain` (attributes only, so no
 * prompt): all `ai.orb.app.test.*` when ORB_TEST_NAMESPACE is unset, only `ai.orb.app.test.<ns>.*` when set (so a
 * sweep never removes another worktree's live services). Used by the global sweep that removes leftovers of a crash.
 */
export function listTestKeychainServices(): string[] {
  const prefix = testKeychainPrefix();
  const r = spawnSync('security', ['dump-keychain'], {
    encoding: 'utf8',
    timeout: 20_000,
    maxBuffer: 64 << 20,
  });
  if (r.status !== 0 || typeof r.stdout !== 'string') return [];
  const services = new Set<string>();
  for (const m of r.stdout.matchAll(/"svce"<blob>="(ai\.orb\.app\.test\.[^"]+)"/g))
    if (m[1]!.startsWith(prefix)) services.add(m[1]!);
  return [...services];
}

/** Clear every leftover test service (global setup/teardown). */
export async function sweepTestKeychains(): Promise<number> {
  let removed = 0;
  for (const service of listTestKeychainServices())
    removed += await clearTestKeychain(service).catch(() => 0);
  return removed;
}

const pendingAtExit = new Set<string>();
let exitHookInstalled = false;

/** Clear `service` when this process exits (for sidecars restarted on one home, whose items must outlive a stop). */
export function clearTestKeychainAtExit(service: string): void {
  pendingAtExit.add(service);
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on('exit', () => {
    for (const s of pendingAtExit) clearTestKeychainSync(s);
  });
}
