/**
 * P1.12 macOS checks: boot a real Orb sidecar (temp homes, `orb` profile, Electron-as-Node, as the app does) with
 * the test-only probe row `scripts/macos/probe-plugin.mjs` inserted, wait for its JSON report, stop the sidecar.
 * See docs/SPIKE_NOTES.md §P1.12 for the recorded output.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot, startSidecar } from '../testkit/index.ts';

export type ProbeRun = { status: number | null; stderr: string; error?: string; written: boolean };

export type MacosReport = {
  runtime: { node: string; electron: string | null; electronRunAsNode: string | null; execPath: string; arch: string };
  keyring:
    | {
        loaded: true;
        service: string;
        account: string;
        set: boolean;
        getMatches: boolean;
        deleted: boolean;
        goneAfterDelete: boolean;
        ms: Record<string, number>;
      }
    | { loaded: false; error: string };
  sandbox:
    | {
        service: string;
        platform: string;
        workspaceWrite: {
          enforcement: 'full' | 'partial';
          runner: string;
          denialSignatures: string[];
          insideWorkspace: ProbeRun;
          outsideWorkspace: ProbeRun;
          slashTmp: ProbeRun;
        };
        readOnly: { enforcement: 'full' | 'partial' } & ProbeRun;
      }
    | { error: string };
  globalTools: string[] | { error: string };
};

function probePatch(config: { out: string; dir: string; outsideFile: string }): string {
  return [
    '# Test-only (P1.12): the macOS probe, mounted by absolute path. Never part of the Orb bundle.',
    '- insert:',
    '    - id: orb-macos-probe',
    `      name: ${JSON.stringify(join(repoRoot, 'scripts', 'macos', 'probe-plugin.mjs'))}`,
    '      inject:',
    '        - sandbox',
    '        - tools',
    '      config:',
    `        out: ${JSON.stringify(config.out)}`,
    `        dir: ${JSON.stringify(config.dir)}`,
    `        outsideFile: ${JSON.stringify(config.outsideFile)}`,
    '',
  ].join('\n');
}

export async function runMacosChecks(timeoutMs = 30_000): Promise<MacosReport> {
  const dir = mkdtempSync(join(tmpdir(), 'orb-macos-probe-'));
  // Outside every workspace-write root (the workspace, /tmp, os.tmpdir()): under the gitignored dev dir.
  const outsideDir = join(repoRoot, '.orb-dev', 'macos-probe');
  mkdirSync(outsideDir, { recursive: true });
  const outsideFile = join(outsideDir, `outside-${process.pid}-${Date.now()}.txt`);
  const out = join(dir, 'report.json');
  const sidecar = await startSidecar({ extraPatch: probePatch({ out, dir, outsideFile }) });
  try {
    const deadline = Date.now() + timeoutMs;
    while (!existsSync(out)) {
      if (Date.now() > deadline) throw new Error(`macos-checks: no probe report after ${timeoutMs} ms (log: ${sidecar.logPath})`);
      await new Promise((r) => setTimeout(r, 100));
    }
    return JSON.parse(readFileSync(out, 'utf8')) as MacosReport;
  } finally {
    await sidecar.stop();
    rmSync(dir, { recursive: true, force: true });
    rmSync(outsideFile, { force: true });
  }
}
