/**
 * Boot a real Orb sidecar for tests: temp DSH_HOME/ORB_HOME, the `orb` profile (plus an optional extra patch,
 * e.g. the mock LLM route), the real dsh bin under Electron-as-Node (the production runtime), and an
 * authenticated session: the token URL is opened once and its `dsh-auth-*` cookie kept, exactly what the
 * Electron window does. The token URL itself is never returned or logged.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';
import {
  bootstrapDshHome,
  dshBinPath,
  sidecarEnv,
  type OrbPaths,
} from '../../apps/desktop/src/main/dshHome.ts';
import { SidecarSupervisor } from '../../apps/desktop/src/main/sidecar.ts';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch, type MockLlmOptions } from './mockLlm.ts';
import { clearTestKeychain, clearTestKeychainAtExit, newTestKeychainService } from './keychain.ts';

export const repoRoot = resolve(import.meta.dirname, '..', '..');

/** Minimal WebSocket surface the UI wire needs (browser WebSocket and `ws` both satisfy it). */
export type SocketLike = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: any) => void, options?: { once?: boolean }): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
};

export type TestSidecar = {
  /** `http://127.0.0.1:<port>`. */
  origin: string;
  /** `http://127.0.0.1:<port>/`: what `document.baseURI` is in the window. */
  baseUrl: string;
  /** Headers a browser on the sidecar origin would send: the auth cookie and a same-origin `Origin`. */
  headers: Record<string, string>;
  /** `fetch` that adds `headers`. */
  fetch: typeof fetch;
  /** WebSocket factory that adds `headers` (browsers add them implicitly). */
  createSocket: (url: string) => SocketLike;
  paths: OrbPaths;
  logPath: string;
  supervisor: SidecarSupervisor;
  /** P4.1: the throwaway Keychain service this sidecar's credentials live in (`ai.orb.app.test.*`). */
  keychainService: string;
  stop(): Promise<void>;
};

export type StartSidecarOptions = {
  /** Extra profile patch rows appended to `profiles/orb/cordis.patch.yml`. */
  extraPatch?: string;
  /** Extra env for the sidecar (e.g. the mock key). */
  env?: NodeJS.ProcessEnv;
  /** Runtime binary. Default: the Electron binary (ELECTRON_RUN_AS_NODE=1), as in the app. */
  execPath?: string;
  /** Keep the temp homes after stop (debugging). */
  keepHome?: boolean;
  /**
   * Use this directory for `dsh/`, `Orb/` and `logs/` instead of a fresh temp dir (e.g. restart a sidecar on the
   * same homes). The caller owns it: it is never removed on stop.
   */
  homeDir?: string;
  /**
   * P4.1: the Keychain service (must be `ai.orb.app.test.*`). Default: a fresh one, cleared on stop; with `homeDir`,
   * one per home dir (kept in `<homeDir>/keychain-service`, so a restart sees the same keys), cleared at process exit.
   */
  keychainService?: string;
};

/** The test Keychain service for one sidecar start, and whether `stop()` clears it. */
function keychainServiceFor(
  options: StartSidecarOptions,
  tmp: string,
): { service: string; clearOnStop: boolean } {
  const fromEnv = options.keychainService ?? options.env?.ORB_KEYCHAIN_SERVICE;
  if (fromEnv) return { service: fromEnv, clearOnStop: false };
  if (!options.homeDir) return { service: newTestKeychainService('kit'), clearOnStop: true };
  const marker = join(tmp, 'keychain-service');
  let service = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : '';
  if (!service) {
    service = newTestKeychainService('home');
    mkdirSync(tmp, { recursive: true });
    writeFileSync(marker, `${service}\n`);
  }
  clearTestKeychainAtExit(service);
  return { service, clearOnStop: false };
}

function electronBinary(): string {
  // In plain Node, `require('electron')` is the path of the Electron binary.
  return createRequire(import.meta.url)('electron') as string;
}

/** Exchange the token URL for the gateway's auth cookie (303 + Set-Cookie), as the window does on load. */
export async function authCookie(tokenUrl: string): Promise<string> {
  const res = await fetch(tokenUrl, { redirect: 'manual' });
  if (res.status !== 303) throw new Error(`testkit: token exchange returned HTTP ${res.status}`);
  const cookies = res.headers.getSetCookie().map((c) => c.split(';', 1)[0]!.trim());
  const auth = cookies.filter((c) => c.startsWith('dsh-auth-'));
  if (auth.length === 0) throw new Error('testkit: token exchange set no dsh-auth cookie');
  return auth.join('; ');
}

export async function startSidecar(options: StartSidecarOptions = {}): Promise<TestSidecar> {
  const tmp = options.homeDir ?? mkdtempSync(join(tmpdir(), 'orb-testkit-'));
  const paths: OrbPaths = {
    root: repoRoot,
    dshHome: join(tmp, 'dsh'),
    orbHome: join(tmp, 'Orb'),
    uiDist: join(repoRoot, 'apps', 'ui', 'dist'),
  };
  bootstrapDshHome(paths, options.extraPatch ? { extraPatch: options.extraPatch } : {});
  const logPath = join(tmp, 'logs', 'sidecar.log');
  const keychain = keychainServiceFor(options, tmp);
  const supervisor = new SidecarSupervisor({
    execPath: options.execPath ?? electronBinary(),
    binPath: dshBinPath(repoRoot),
    env: { ...sidecarEnv(paths), ...options.env, ORB_KEYCHAIN_SERVICE: keychain.service },
    cwd: paths.orbHome,
    logPath,
    maxRestarts: 0,
  });
  let tokenUrl: string;
  try {
    tokenUrl = await supervisor.start();
  } catch (err) {
    await supervisor.stop().catch(() => {});
    if (keychain.clearOnStop) await clearTestKeychain(keychain.service).catch(() => {});
    // P5.5: CI keeps no temp files, so the error carries the log's tail (the supervisor redacts token URLs).
    let tail = '';
    try {
      tail = readFileSync(logPath, 'utf8').split('\n').slice(-40).join('\n');
    } catch {
      // no log written
    }
    throw new Error(
      `testkit: sidecar failed to boot (log: ${logPath}): ${(err as Error).message}${tail ? `\n--- sidecar log tail ---\n${tail}` : ''}`,
      { cause: err },
    );
  }
  const origin = new URL(tokenUrl).origin;
  const cookie = await authCookie(tokenUrl);
  const headers = { cookie, origin };
  const authedFetch: typeof fetch = (input, init) => {
    const merged = new Headers(init?.headers);
    for (const [k, v] of Object.entries(headers)) merged.set(k, v);
    return fetch(input, { ...init, headers: merged });
  };
  return {
    origin,
    baseUrl: `${origin}/`,
    headers,
    fetch: authedFetch,
    createSocket: (url) => new WebSocket(url, { headers }) as unknown as SocketLike,
    paths,
    logPath,
    supervisor,
    keychainService: keychain.service,
    async stop() {
      await supervisor.stop();
      if (keychain.clearOnStop) await clearTestKeychain(keychain.service).catch(() => {});
      if (!options.keepHome && !options.homeDir) rmSync(tmp, { recursive: true, force: true });
    },
  };
}

export type MockedSidecar = TestSidecar & { llm: MockLlm };

/** A sidecar whose default model is the local mock LLM. No real API key is needed or read. */
export async function startMockedSidecar(
  options: Omit<StartSidecarOptions, 'extraPatch'> & {
    llm?: MockLlmOptions;
    /** Extra profile patch rows; a function gets the started mock (e.g. to point a row at its base URL). */
    extraPatch?: string | ((llm: MockLlm) => string);
  } = {},
): Promise<MockedSidecar> {
  const llm = await new MockLlm(options.llm).start();
  try {
    const extra =
      typeof options.extraPatch === 'function' ? options.extraPatch(llm) : (options.extraPatch ?? '');
    const sidecar = await startSidecar({
      ...options,
      extraPatch: [mockProviderPatch(llm.baseURL), extra].join('\n'),
      env: { [MOCK_KEY_ENV]: 'orb-mock-key', ...options.env },
    });
    return {
      ...sidecar,
      llm,
      async stop() {
        await sidecar.stop();
        await llm.close();
      },
    };
  } catch (err) {
    await llm.close();
    throw err;
  }
}
