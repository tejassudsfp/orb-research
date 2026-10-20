/**
 * Parent-death watch for the sidecar. Electron main spawns the sidecar with `ORB_PARENT_PID=<its pid>`. If main
 * dies without stopping it (kill -9, Force Quit, a crash), macOS re-parents the sidecar to launchd and it would
 * otherwise live on, holding the harness session `flock` (dsh-session-persistence-jsonl SessionWriteLease) so the
 * relaunched app could not resume the canvas's root session. The watch polls and, once the parent is gone,
 * asks the sidecar to shut down gracefully (SIGTERM: boards flush, sessions close), with a hard exit as backstop.
 */
export type ParentWatchOptions = {
  parentPid: number;
  intervalMs?: number;
  /** Is the parent still our parent? Defaults to `process.ppid === parentPid` and a signal-0 probe. */
  isAlive?: (parentPid: number) => boolean;
  onGone: () => void;
};

export function parentAlive(parentPid: number): boolean {
  if (process.ppid !== parentPid) return false;
  try {
    process.kill(parentPid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** `ORB_PARENT_PID` as a positive integer, else undefined (watch disabled, e.g. a sidecar started by hand). */
export function parentPidFromEnv(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const raw = env.ORB_PARENT_PID;
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const pid = Number(raw);
  return pid > 1 ? pid : undefined;
}

/** Starts polling; returns a stop function. Fires `onGone` at most once. */
export function watchParent(opts: ParentWatchOptions): () => void {
  const isAlive = opts.isAlive ?? parentAlive;
  let fired = false;
  const timer = setInterval(() => {
    if (fired || isAlive(opts.parentPid)) return;
    fired = true;
    clearInterval(timer);
    opts.onGone();
  }, opts.intervalMs ?? 500);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Graceful shutdown of this process: SIGTERM to self, then a hard exit if it is still alive after `graceMs`. */
export function shutdownSelf(graceMs = 8000): void {
  setTimeout(() => process.exit(1), graceMs).unref?.();
  process.kill(process.pid, 'SIGTERM');
}
