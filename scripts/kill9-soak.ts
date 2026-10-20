/**
 * `pnpm kill9-soak` (P5.5): the kill -9 durability soak, 50 runs of each kind by default (opt-in: it takes a few
 * minutes, so it is not part of `pnpm test`; crash.test.ts and the reopen contract tests cover a few kills there).
 *
 *   pnpm kill9-soak                    store + sidecar soaks, 50 runs each
 *   pnpm kill9-soak --runs 10          fewer runs
 *   pnpm kill9-soak --only store|sidecar
 *   pnpm kill9-soak --out docs/perf/p5.5-kill9.json   write the results
 *
 * Needs `pnpm build` first. Mock LLM only. See scripts/hardening/kill9.ts.
 */
import { writeFileSync } from 'node:fs';
import { sidecarSoak, storeSoak, type SidecarRun, type StoreRun } from './hardening/kill9.ts';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const runs = Number(flag('--runs') ?? 50);
const only = flag('--only');
const out = flag('--out');
const log = (line: string) => console.log(`  · ${line}`);

const summary = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { min: s[0] ?? 0, median: s[Math.floor(s.length / 2)] ?? 0, max: s.at(-1) ?? 0 };
};

async function main(): Promise<number> {
  let store: StoreRun[] = [];
  let sidecar: SidecarRun[] = [];
  if (only !== 'sidecar') {
    console.log(`kill -9 soak (store): ${runs} runs`);
    store = await storeSoak({ runs, log });
  }
  if (only !== 'store') {
    console.log(`kill -9 soak (sidecar): ${runs} runs`);
    sidecar = await sidecarSoak({ runs, log });
  }
  const report = {
    date: new Date().toISOString(),
    machine: `${process.platform} ${process.arch}`,
    store: store.length
      ? {
          runs: store.length,
          passed: store.filter((r) => r.ok).length,
          newestOnDiskAgeMs: summary(store.map((r) => r.lostMs)),
          withinFlushWindow: store.filter((r) => r.withinFlushWindow).length,
          eventsPerRun: summary(store.map((r) => r.events)),
          failures: store.filter((r) => !r.ok),
        }
      : undefined,
    sidecar: sidecar.length
      ? {
          runs: sidecar.length,
          passed: sidecar.filter((r) => r.ok).length,
          reopened: sidecar.filter((r) => r.reopened).length,
          killedMidTurn: sidecar.filter((r) => r.midTurn).length,
          runsThatLostAckedWrites: sidecar.filter((r) => r.lostAcked > 0).length,
          oldestLostAckedWriteMs: summary(sidecar.map((r) => r.oldestLostMs)),
          ackedPerRun: summary(sidecar.map((r) => r.acked)),
          bootMs: summary(sidecar.map((r) => r.bootMs)),
          failures: sidecar.filter((r) => !r.ok),
        }
      : undefined,
  };
  console.log(JSON.stringify(report, null, 2));
  if (out) writeFileSync(out, `${JSON.stringify({ ...report, detail: { store, sidecar } }, null, 2)}\n`);
  const failed = store.some((r) => !r.ok) || sidecar.some((r) => !r.ok);
  console.log(failed ? 'kill -9 soak: FAILED' : 'kill -9 soak: OK');
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`kill9-soak: ${(err as Error).stack ?? err}`);
    process.exit(1);
  },
);
