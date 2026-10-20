/**
 * Sidecar supervisor: runs the dsh harness (`dsh --profile orb --port 0 --no-open`) under Electron's own Node
 * (`ELECTRON_RUN_AS_NODE=1`), reads the `dsh web:` token URL from its stdout, restarts it on crashes and stops it on
 * quit. It imports nothing from Electron, so Vitest drives it with an injected `execPath`/`env`.
 *
 * The token URL is a credential: it is held in memory only. Everything the sidecar prints is appended to the log
 * file with tokens redacted, and the supervisor itself never logs the URL.
 */
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { KEYCHAIN_READY_LINE, KEYCHAIN_WAITING_LINE } from '@orb/shared';

export const MIN_SIDECAR_NODE = '22.19.0';

export type SidecarOptions = {
  /** The Node runtime: Electron's binary in the app (run with ELECTRON_RUN_AS_NODE=1). */
  execPath: string;
  /** `node_modules/@deepseek-ai/dsh/lib/bin.js`. */
  binPath: string;
  /** Launch env, from `sidecarEnv()`. ELECTRON_RUN_AS_NODE=1 is added here. */
  env: NodeJS.ProcessEnv;
  /** Working directory (ORB_HOME). */
  cwd: string;
  /** Extra app arguments after `--profile orb --port 0 --no-open`. */
  extraArgs?: string[];
  /** File that receives the sidecar's (redacted) stdout/stderr and the supervisor's own lines. */
  logPath: string;
  /** Where supervisor lines also go (e.g. console). Never receives a token. */
  log?: (line: string) => void;
  /** Crashes allowed inside `restartWindowMs` before giving up. Default 3. */
  maxRestarts?: number;
  restartWindowMs?: number;
  /** Backoff before restart n (1-based) is `backoffBaseMs * 2^(n-1)`. Default 500 ms. */
  backoffBaseMs?: number;
  /** A boot that prints no URL within this time is killed and counts as a crash. Default 60 s. */
  bootTimeoutMs?: number;
  /** After SIGTERM, wait this long before SIGKILL. Default 6 s (dsh force-exits after 5 s). */
  stopTimeoutMs?: number;
};

export type SidecarFatal = { reason: string; logPath: string };

type Events = {
  ready: [url: string];
  exit: [info: { code: number | null; signal: NodeJS.Signals | null; expected: boolean }];
  restarting: [info: { attempt: number; delayMs: number }];
  fatal: [info: SidecarFatal];
  /** P6.2: orb-keychain says its Keychain read is held (a macOS prompt) or answered. */
  keychain: [state: 'waiting' | 'ready'];
};

const URL_LINE = /^dsh web: (http:\/\/127\.0\.0\.1:\d+\/\S*)\s*$/;

/** Remove token material from a line before it reaches any log. */
export function redact(text: string): string {
  return text
    .replace(/(dsh web: )\S+/g, '$1<redacted>')
    .replace(/([?&](?:token|access_token)=)[^\s&#]+/gi, '$1<redacted>');
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

/** `process.versions.node` of the runtime the sidecar will use. */
export function probeNodeVersion(execPath: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      execPath,
      ['-p', 'process.versions.node'],
      { env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 15_000 },
      (err, stdout) => (err ? reject(err) : resolve(stdout.trim())),
    );
  });
}

export class SidecarSupervisor extends EventEmitter<Events> {
  readonly logPath: string;
  #opts: Required<Omit<SidecarOptions, 'log' | 'extraArgs'>> & Pick<SidecarOptions, 'log' | 'extraArgs'>;
  #child: ChildProcess | undefined;
  #url: string | undefined;
  #stopping = false;
  #fatal: SidecarFatal | undefined;
  #crashes: number[] = [];
  #restartTimer: NodeJS.Timeout | undefined;
  #bootTimer: NodeJS.Timeout | undefined;
  #stopped: Promise<void> | undefined;

  constructor(opts: SidecarOptions) {
    super();
    this.#opts = {
      maxRestarts: 3,
      restartWindowMs: 60_000,
      backoffBaseMs: 500,
      bootTimeoutMs: 60_000,
      stopTimeoutMs: 6_000,
      ...opts,
    };
    this.logPath = opts.logPath;
    mkdirSync(dirname(opts.logPath), { recursive: true });
  }

  /** The current token URL, or undefined while (re)starting. In memory only. */
  get url(): string | undefined {
    return this.#url;
  }

  get pid(): number | undefined {
    return this.#child?.pid;
  }

  get running(): boolean {
    return this.#child !== undefined && this.#child.exitCode === null && this.#child.signalCode === null;
  }

  /** Spawn the sidecar; resolves with the first token URL, rejects on fatal. */
  start(): Promise<string> {
    if (this.#child || this.#stopping) throw new Error('sidecar: already started');
    const ready = this.whenReady();
    this.#spawn();
    return ready;
  }

  /** Resolves with the next (or current) token URL; rejects when the supervisor gives up. */
  whenReady(): Promise<string> {
    if (this.#url) return Promise.resolve(this.#url);
    if (this.#fatal) return Promise.reject(new Error(this.#fatal.reason));
    return new Promise((resolve, reject) => {
      const onReady = (url: string) => {
        this.off('fatal', onFatal);
        resolve(url);
      };
      const onFatal = (f: SidecarFatal) => {
        this.off('ready', onReady);
        reject(new Error(f.reason));
      };
      this.once('ready', onReady);
      this.once('fatal', onFatal);
    });
  }

  /** SIGTERM, wait up to `stopTimeoutMs`, then SIGKILL. Idempotent. */
  stop(): Promise<void> {
    this.#stopped ??= this.#stop();
    return this.#stopped;
  }

  async #stop(): Promise<void> {
    this.#stopping = true;
    clearTimeout(this.#restartTimer);
    clearTimeout(this.#bootTimer);
    this.#url = undefined;
    const child = this.#child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    this.#write(`supervisor: stopping sidecar pid ${child.pid} (SIGTERM)`);
    child.kill('SIGTERM');
    let timer: NodeJS.Timeout | undefined;
    const timedOut = await Promise.race([
      exited.then(() => false),
      new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(true), this.#opts.stopTimeoutMs))),
    ]);
    clearTimeout(timer);
    if (timedOut) {
      this.#write(`supervisor: sidecar ignored SIGTERM for ${this.#opts.stopTimeoutMs} ms; sending SIGKILL`);
      child.kill('SIGKILL');
      await exited;
    }
  }

  #spawn(): void {
    const { execPath, binPath, env, cwd } = this.#opts;
    const args = [binPath, '--profile', 'orb', '--port', '0', '--no-open', ...(this.#opts.extraArgs ?? [])];
    const child = spawn(execPath, args, {
      cwd,
      env: { ...env, ELECTRON_RUN_AS_NODE: '1', ORB_PARENT_PID: String(process.pid) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.#child = child;
    this.#write(`supervisor: spawned sidecar pid ${child.pid}`);

    this.#lines(child.stdout!, (line) => {
      const m = URL_LINE.exec(line);
      if (m && child === this.#child) {
        clearTimeout(this.#bootTimer);
        this.#url = m[1]!;
        const port = new URL(this.#url).port;
        this.#write(`supervisor: sidecar ready on 127.0.0.1:${port}`);
        this.emit('ready', this.#url);
      }
      this.#append(`[out] ${redact(line)}`);
    });
    this.#lines(child.stderr!, (line) => {
      // P6.2: orb-keychain says when its Keychain read is held (a macOS access prompt) and when it is answered.
      if (child === this.#child && line.includes(KEYCHAIN_WAITING_LINE)) this.emit('keychain', 'waiting');
      else if (child === this.#child && line.includes(KEYCHAIN_READY_LINE)) this.emit('keychain', 'ready');
      this.#append(`[err] ${redact(line)}`);
    });

    this.#bootTimer = setTimeout(() => {
      if (child !== this.#child || this.#url) return;
      this.#write(`supervisor: no URL after ${this.#opts.bootTimeoutMs} ms; killing sidecar`);
      child.kill('SIGKILL');
    }, this.#opts.bootTimeoutMs);

    child.once('error', (err) => {
      this.#write(`supervisor: spawn error: ${err.message}`);
      // A spawn failure (e.g. ENOENT) emits no 'exit' and leaves pid undefined with exitCode set to the negative
      // errno (-2), so treat it as an exit here or start() would never settle.
      if (child.pid === undefined) this.#onExit(child, child.exitCode, null);
    });
    child.once('exit', (code, signal) => this.#onExit(child, code, signal));
  }

  #onExit(child: ChildProcess, code: number | null, signal: NodeJS.Signals | null): void {
    if (child !== this.#child) return;
    clearTimeout(this.#bootTimer);
    this.#url = undefined;
    const expected = this.#stopping;
    this.#write(
      `supervisor: sidecar exited (code ${code}, signal ${signal})${expected ? '' : ' unexpectedly'}`,
    );
    this.emit('exit', { code, signal, expected });
    if (expected) return;

    const now = Date.now();
    this.#crashes = this.#crashes.filter((t) => now - t < this.#opts.restartWindowMs);
    this.#crashes.push(now);
    const attempt = this.#crashes.length;
    if (attempt > this.#opts.maxRestarts) {
      this.#fatal = {
        reason: `The orb engine crashed ${attempt} times within ${Math.round(this.#opts.restartWindowMs / 1000)} s.`,
        logPath: this.logPath,
      };
      this.#write(`supervisor: giving up: ${this.#fatal.reason}`);
      this.emit('fatal', this.#fatal);
      return;
    }
    const delayMs = this.#opts.backoffBaseMs * 2 ** (attempt - 1);
    this.#write(`supervisor: restart ${attempt}/${this.#opts.maxRestarts} in ${delayMs} ms`);
    this.emit('restarting', { attempt, delayMs });
    this.#restartTimer = setTimeout(() => {
      if (!this.#stopping) this.#spawn();
    }, delayMs);
  }

  #lines(stream: NodeJS.ReadableStream, onLine: (line: string) => void): void {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        onLine(buf.slice(0, i).replace(/\r$/, ''));
        buf = buf.slice(i + 1);
      }
    });
    stream.on('end', () => {
      if (buf) onLine(buf);
      buf = '';
    });
  }

  /** A supervisor line: to the log file and the log callback. Callers never pass a token. */
  #write(line: string): void {
    const safe = redact(line);
    this.#append(safe);
    this.#opts.log?.(safe);
  }

  #append(line: string): void {
    try {
      appendFileSync(this.logPath, `${new Date().toISOString()} ${line}\n`, { mode: 0o600 });
    } catch {
      // Logging must never take the supervisor down.
    }
  }
}
