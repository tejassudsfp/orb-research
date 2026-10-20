/**
 * P5.1 sidecar boot: the composed `orb` profile activates every enabled row (dsh warns "N entries did not activate"
 * when a row waits for a service a disabled row provided, e.g. a P5.1 disable that was not safe), and boots well
 * inside the startup budget. Measured numbers: scripts/profile-boot.ts, docs/HARNESS_NOTES.md §P5.1.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bootOnce } from '../profile-boot.ts';
import { startSidecar } from '../testkit/sidecar.ts';
import { timingExpect } from '../testkit/namespace.ts';

describe('P5.1 sidecar boot', () => {
  it('activates every enabled row (no pending entries)', async () => {
    const sidecar = await startSidecar({ keepHome: false });
    let log: string;
    try {
      // Pending entries are reported right after the URL line.
      await new Promise((r) => setTimeout(r, 300));
      log = readFileSync(sidecar.logPath, 'utf8');
    } finally {
      await sidecar.stop();
    }
    expect(log).toContain('sidecar ready');
    expect(log).not.toMatch(/did not activate|pending \(waiting for service/);
  });

  it('boots and answers orb/canvas.list in under 1.5 s', async () => {
    // The best of up to 3 boots: `pnpm test` runs ~90 files in parallel, and one boot slowed by that load is the
    // machine, not the sidecar (a single sample failed 1 run in 6 in the P5.6 review). A real regression is slow
    // every time.
    const samples: number[] = [];
    for (let i = 0; i < 3 && !(Math.min(...samples) < 1500); i++) samples.push((await bootOnce()).homeDataMs);
    timingExpect(() => {
      expect(Math.min(...samples), `boots: ${samples.map(Math.round).join(', ')} ms`).toBeLessThan(1500);
    });
  }, 30_000);
});
