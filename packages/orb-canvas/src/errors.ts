import { OrbErrorCode } from '@orb/shared';

export type CanvasErrorCode = (typeof OrbErrorCode)[keyof typeof OrbErrorCode] | 'orb/closed';

/**
 * A business error of the canvas service. orb-host turns it into a RemoteError with the same `code` and
 * `details` (both wire-safe JSON). orb-canvas core stays harness-free so it can be unit-tested in plain Node.
 */
export class CanvasError extends Error {
  override name = 'CanvasError';
  constructor(
    readonly code: CanvasErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Structural check: orb-host and orb-canvas are separate bundles, so `instanceof` is not reliable across them. */
export const isCanvasError = (e: unknown): e is CanvasError =>
  e instanceof Error &&
  e.name === 'CanvasError' &&
  typeof (e as CanvasError).code === 'string' &&
  (e as CanvasError).code.startsWith('orb/');

/**
 * P3.7 (every Orb tool honours `exec.signal`): wrap a defined tool so a call whose signal is already aborted (the
 * agent was stopped or paused) fails with the signal's reason before anything else runs: no argument checks, no
 * reads, no writes. Aborts that land mid-call are handled inside each tool (they pass the signal on and re-check it
 * before every write).
 */
export function abortFirst<T extends { execute(args: unknown, exec: { signal: AbortSignal }): unknown }>(
  tool: T,
): T {
  const execute = tool.execute.bind(tool);
  return {
    ...tool,
    async execute(args: unknown, exec: { signal: AbortSignal }) {
      exec.signal.throwIfAborted();
      return execute(args, exec);
    },
  };
}
