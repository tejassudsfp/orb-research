/**
 * Cordis row `orb-canvas` (`@orb/canvas/service`): provides the `orbCanvas` service (a CanvasStore) to the rest of
 * the profile. orb-host's Remote endpoints delegate to it; P1.8's board tools will use it too. It is the ONLY
 * writer of `board.jsonl`.
 *
 * Canvas home: `config.home`, else `ORB_HOME` (set by Electron main, apps/desktop/src/main/dshHome.ts), else ~/orb (P6.1b).
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CanvasStore } from './store.js';

export const name = 'orb-canvas';
export const ORB_CANVAS_SERVICE = 'orbCanvas';

export type OrbCanvasConfig = {
  home?: string;
  flushMs?: number;
  /** Delay before the search index is brought up to date in the background. Default 2 s. */
  indexWarmupMs?: number;
};

export function resolveHome(config?: OrbCanvasConfig, env: NodeJS.ProcessEnv = process.env): string {
  if (config?.home || env.ORB_HOME) return (config?.home || env.ORB_HOME)!;
  // P6.1b: `~/orb` (lowercase); a pre-P6.1b `~/Orb` is kept on a case-sensitive volume (as apps/desktop dshHome.ts).
  const lower = join(homedir(), 'orb');
  const legacy = join(homedir(), 'Orb');
  return !existsSync(lower) && existsSync(legacy) ? legacy : lower;
}

export function apply(ctx: any, config: OrbCanvasConfig = {}) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('orb-canvas') : null;
  const store = new CanvasStore({
    home: resolveHome(config),
    ...(config?.flushMs !== undefined ? { flushMs: config.flushMs } : {}),
    log: (level, message) => logger?.[level]?.(message),
  });
  // Disposers run concurrently on unload (cordis Fiber._unload); close() ends follow streams, then flushes.
  ctx.effect(() => () => store.close(), 'orb-canvas: flush and close board logs');
  ctx.provide(ORB_CANVAS_SERVICE, store);
  // P2.6: build or catch up index.sqlite shortly after start, off the launch path.
  store.warmIndex(config?.indexWarmupMs ?? 2_000);
}
