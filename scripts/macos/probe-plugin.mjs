/**
 * P1.12 sidecar-side probe (TEST/DEV ONLY; never part of the Orb bundle).
 *
 * Mounted into a real Orb sidecar by `scripts/macos/checks.ts` through an extra profile patch row whose `name` is
 * this file's absolute path (the root Include resolves absolute names to file URLs:
 * dsh-app-boot/lib/index.js:3693-3696). It runs inside the sidecar process, i.e. under the production runtime
 * (Electron binary with ELECTRON_RUN_AS_NODE=1), and writes one JSON report to `config.out`:
 *   1. the runtime (`process.versions.node`, Electron version, ELECTRON_RUN_AS_NODE);
 *   2. a Keychain round trip through @orb/keychain (@napi-rs/keyring), service `ai.orb.app.spike`;
 *   3. the mounted `sandbox` service (row `sandbox`, @deepseek-ai/dsh-sandbox-local): `confine()` enforcement for
 *      workspace-write and read-only, plus functional runs of the wrapped argv (inside/outside the workspace, /tmp);
 *   4. the global (agent-less) tool surface of the `tools` service.
 * Plain JS on purpose: dsh imports it directly, no build step. No secret is ever written to the report.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

export const name = 'orb-macos-probe';
export const inject = ['sandbox', 'tools'];

function run(argv) {
  const res = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', timeout: 10_000 });
  return { status: res.status, stderr: (res.stderr ?? '').trim().slice(0, 300), error: res.error?.message };
}

async function sandboxReport(ctx, config) {
  const workspaceRoot = join(config.dir, 'workspace');
  mkdirSync(workspaceRoot, { recursive: true });
  const insideFile = join(workspaceRoot, 'inside.txt');
  // Outside every workspace-write root (workspace, /tmp, os.tmpdir()): a path under the caller's directory.
  const outsideFile = config.outsideFile;
  const tmpFile = `/tmp/orb-macos-probe-${process.pid}.txt`;
  const write = (file) => ['/bin/sh', '-c', `echo probe > '${file}'`];

  const ww = await ctx.sandbox.confine(write(insideFile), { mode: 'workspace-write', workspaceRoot });
  const report = {
    service: ctx.sandbox.constructor?.name,
    platform: process.platform,
    workspaceWrite: {
      enforcement: ww.enforcement,
      runner: ww.argv[0],
      denialSignatures: ww.denialSignatures,
    },
  };
  const insideRun = run(ww.argv);
  report.workspaceWrite.insideWorkspace = { ...insideRun, written: existsSync(insideFile) };

  const out = await ctx.sandbox.confine(write(outsideFile), { mode: 'workspace-write', workspaceRoot });
  const outsideRun = run(out.argv);
  report.workspaceWrite.outsideWorkspace = { ...outsideRun, written: existsSync(outsideFile) };
  rmSync(outsideFile, { force: true });

  const tmp = await ctx.sandbox.confine(write(tmpFile), { mode: 'workspace-write', workspaceRoot });
  const tmpRun = run(tmp.argv);
  report.workspaceWrite.slashTmp = { ...tmpRun, written: existsSync(tmpFile) };
  rmSync(tmpFile, { force: true });

  const roFile = join(workspaceRoot, 'read-only.txt');
  const ro = await ctx.sandbox.confine(write(roFile), { mode: 'read-only', workspaceRoot });
  const roRun = run(ro.argv);
  report.readOnly = { enforcement: ro.enforcement, ...roRun, written: existsSync(roFile) };
  return report;
}

export function apply(ctx, config) {
  const report = {
    runtime: {
      node: process.versions.node,
      electron: process.versions.electron ?? null,
      electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null,
      execPath: process.execPath,
      arch: process.arch,
    },
  };
  const done = (async () => {
    try {
      const { keyringRoundTrip, KEYCHAIN_SPIKE_SERVICE } = await import('@orb/keychain');
      report.keyring = { loaded: true, ...keyringRoundTrip(KEYCHAIN_SPIKE_SERVICE) };
    } catch (err) {
      report.keyring = { loaded: false, error: String(err?.message ?? err) };
    }
    try {
      report.sandbox = await sandboxReport(ctx, config);
    } catch (err) {
      report.sandbox = { error: String(err?.message ?? err) };
    }
    try {
      report.globalTools = [...ctx.tools.view().visible.keys()].sort();
    } catch (err) {
      report.globalTools = { error: String(err?.message ?? err) };
    }
  })();
  done.finally(() => {
    // Write then rename: the reader polls for the final name and never sees a partial file.
    writeFileSync(`${config.out}.part`, JSON.stringify(report, null, 2));
    renameSync(`${config.out}.part`, config.out);
  });
}
