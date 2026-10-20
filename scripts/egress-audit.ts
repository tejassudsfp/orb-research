/**
 * `pnpm egress-audit` (P1.11): prove the sidecar contacts no host except the configured model host.
 *
 *   pnpm egress-audit                 deterministic audit (mock model host), then the live audit if
 *                                     OPENAI_API_KEY is set (otherwise skipped with a message)
 *   pnpm egress-audit --mode deterministic|live|telemetry
 *                                     (`--mode live` without OPENAI_API_KEY takes the dev key from the Keychain,
 *                                     service ai.orb.app; scripts/util/devKey.ts)
 *   pnpm egress-audit --keep          keep the temp homes
 *   pnpm egress-audit --mode live --scout   live, with Scout searching and fetching (P3.5)
 *
 * `--mode telemetry` leaves telemetry ON and records a message rating; it passes when the audit SEES the
 * telemetry attempt (the negative control). Needs `pnpm build` first (the sidecar loads the built @orb/*
 * bundles and serves apps/ui/dist). See scripts/egress/audit.ts.
 */
import { formatReport, runEgressAudit, type EgressMode } from './egress/audit.ts';
import { ensureDevKey } from './util/devKey.ts';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const keepHome = args.includes('--keep');
const scout = args.includes('--scout');
const requested = flag('--mode') as EgressMode | undefined;
if (requested && !['deterministic', 'live', 'telemetry'].includes(requested)) {
  console.error(`egress-audit: unknown --mode ${requested}`);
  process.exit(2);
}
const log = (line: string) => console.log(`  · ${line}`);

async function main(): Promise<number> {
  const modes: EgressMode[] = requested ? [requested] : ['deterministic', 'live'];
  let failed = false;
  for (const mode of modes) {
    // P4.1: the dev key is in the Keychain (ai.orb.app) now. Only an explicit `--mode live` reads it (into this
    // process's env only, never printed); the default run stays live only when the env already has a key.
    const haveKey =
      Boolean(process.env.OPENAI_API_KEY) || (requested === 'live' && (await ensureDevKey('OPENAI_API_KEY')));
    if (mode === 'live' && !haveKey) {
      console.log(
        'egress audit (live): SKIPPED: OPENAI_API_KEY is not set in the environment or the dev Keychain',
      );
      if (requested === 'live') failed = true;
      continue;
    }
    console.log(`egress audit (${mode}): running`);
    const report = await runEgressAudit({ mode, keepHome, log, scout: mode === 'live' && scout });
    console.log(formatReport(report));
    if (mode === 'telemetry') {
      // The negative control: telemetry is on, so the audit must see it and fail.
      const seen = report.telemetryAttempts.length > 0 && report.invalid.length === 0;
      console.log(
        seen
          ? 'telemetry control: OK, the audit saw the telemetry attempt (and blocked it)'
          : 'telemetry control: NOT OBSERVED, no telemetry attempt was seen',
      );
      if (!seen) failed = true;
    } else if (!report.ok) failed = true;
  }
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`egress-audit: ${(err as Error).message}`);
    process.exit(1);
  },
);
