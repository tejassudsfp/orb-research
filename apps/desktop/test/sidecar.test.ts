import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapDshHome, dshBinPath, sidecarEnv, type OrbPaths } from '../src/main/dshHome.js';
import {
  MIN_SIDECAR_NODE,
  SidecarSupervisor,
  compareVersions,
  probeNodeVersion,
  redact,
} from '../src/main/sidecar.js';
import { clearTestKeychain, newTestKeychainService } from '../../../scripts/testkit/keychain.ts';
import { timingExpect } from '../../../scripts/testkit/namespace.ts';

const root = resolve(import.meta.dirname, '..', '..', '..');
// In plain Node, `require('electron')` is the path of the Electron binary.
const electronPath = createRequire(import.meta.url)('electron') as string;

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const once = <T>(sup: SidecarSupervisor, event: 'ready' | 'restarting' | 'fatal' | 'exit') =>
  new Promise<T>((res) => sup.once(event, (v: any) => res(v)));

let tmp: string;
let paths: OrbPaths;
// P4.1: a throwaway Keychain service, never the real ai.orb.app.
const keychainService = newTestKeychainService('sidecar');

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-sidecar-'));
  paths = {
    root,
    dshHome: join(tmp, 'dsh'),
    orbHome: join(tmp, 'Orb'),
    uiDist: join(root, 'apps', 'ui', 'dist'),
  };
  bootstrapDshHome(paths);
});
afterAll(async () => {
  rmSync(tmp, { recursive: true, force: true });
  await clearTestKeychain(keychainService);
});

describe('helpers', () => {
  it('redacts token URLs', () => {
    expect(redact('dsh web: http://127.0.0.1:1234/?token=abc.def')).toBe('dsh web: <redacted>');
    expect(redact('GET /?token=abc123&x=1')).toBe('GET /?token=<redacted>&x=1');
  });
  it('compares versions', () => {
    expect(compareVersions('24.21.0', MIN_SIDECAR_NODE)).toBe(1);
    expect(compareVersions('22.19.0', MIN_SIDECAR_NODE)).toBe(0);
    expect(compareVersions('22.18.9', MIN_SIDECAR_NODE)).toBe(-1);
  });
  it("Electron's Node is new enough for dsh (>= 22.19)", async () => {
    const v = await probeNodeVersion(electronPath);
    expect(compareVersions(v, MIN_SIDECAR_NODE)).toBeGreaterThanOrEqual(0);
  });
});

describe('real sidecar under Electron-as-Node', () => {
  let sup: SidecarSupervisor;
  const logPath = () => join(tmp, 'logs', 'sidecar.log');
  const lines: string[] = [];

  it('boots and yields a working token URL', async () => {
    sup = new SidecarSupervisor({
      execPath: electronPath,
      binPath: dshBinPath(root),
      env: { ...sidecarEnv(paths), ORB_KEYCHAIN_SERVICE: keychainService },
      cwd: paths.orbHome,
      logPath: logPath(),
      log: (l) => lines.push(l),
      backoffBaseMs: 50,
    });
    const url = await sup.start();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?token=/);
    expect(sup.url).toBe(url);
    const res = await fetch(url, { redirect: 'manual' });
    expect(res.status).toBeLessThan(400);
    // The gateway rejects a wrong token.
    const bad = await fetch(url.replace(/token=[^&]+/, 'token=nope'), { redirect: 'manual' });
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });

  it('restarts after a crash (kill) with a new working URL', async () => {
    const oldPid = sup.pid!;
    const oldUrl = sup.url!;
    const restarting = once<{ attempt: number }>(sup, 'restarting');
    const ready = once<string>(sup, 'ready');
    process.kill(oldPid, 'SIGKILL');
    expect((await restarting).attempt).toBe(1);
    const url = await ready;
    expect(sup.pid).not.toBe(oldPid);
    expect(url).not.toBe(oldUrl);
    const res = await fetch(url, { redirect: 'manual' });
    expect(res.status).toBeLessThan(400);
  });

  it('terminates the sidecar on quit (SIGTERM) within 6 s', async () => {
    const pid = sup.pid!;
    const t0 = Date.now();
    await sup.stop();
    timingExpect(() => {
      expect(Date.now() - t0).toBeLessThan(6_000);
    });
    expect(alive(pid)).toBe(false);
    expect(sup.url).toBeUndefined();
  });

  it('never writes the token to the log', () => {
    const log = readFileSync(logPath(), 'utf8');
    expect(log).toContain('dsh web: <redacted>');
    expect(log).not.toMatch(/token=(?!<redacted>)/);
    expect(lines.join('\n')).not.toMatch(/token=/);
  });
});

describe('restart policy and stop timeout (fake sidecars)', () => {
  it('gives up after 3 restarts within 60 s and reports the log path', async () => {
    const bin = join(tmp, 'crash.mjs');
    writeFileSync(bin, 'process.exit(3);\n');
    const logPath = join(tmp, 'logs', 'crash.log');
    const sup = new SidecarSupervisor({
      execPath: process.execPath,
      binPath: bin,
      env: process.env,
      cwd: tmp,
      logPath,
      backoffBaseMs: 10,
    });
    const attempts: number[] = [];
    sup.on('restarting', ({ attempt }) => attempts.push(attempt));
    await expect(sup.start()).rejects.toThrow(/crashed 4 times/);
    expect(attempts).toEqual([1, 2, 3]);
    await expect(sup.whenReady()).rejects.toThrow();
    expect(existsSync(logPath)).toBe(true);
    await sup.stop();
  });

  it('treats a spawn failure (missing runtime) as a crash and ends in fatal', async () => {
    const sup = new SidecarSupervisor({
      execPath: join(tmp, 'no-such-runtime'),
      binPath: join(tmp, 'crash.mjs'),
      env: process.env,
      cwd: tmp,
      logPath: join(tmp, 'logs', 'enoent.log'),
      backoffBaseMs: 10,
    });
    await expect(sup.start()).rejects.toThrow(/crashed 4 times/);
    expect(readFileSync(join(tmp, 'logs', 'enoent.log'), 'utf8')).toContain('spawn error');
    await sup.stop();
  });

  it('sends SIGKILL when the sidecar ignores SIGTERM', async () => {
    const bin = join(tmp, 'stubborn.mjs');
    writeFileSync(
      bin,
      "process.on('SIGTERM', () => {}); console.log('dsh web: http://127.0.0.1:9/?token=x'); setInterval(() => {}, 1000);\n",
    );
    const sup = new SidecarSupervisor({
      execPath: process.execPath,
      binPath: bin,
      env: process.env,
      cwd: tmp,
      logPath: join(tmp, 'logs', 'stubborn.log'),
      stopTimeoutMs: 300,
    });
    await sup.start();
    const pid = sup.pid!;
    await sup.stop();
    expect(alive(pid)).toBe(false);
  });
});
