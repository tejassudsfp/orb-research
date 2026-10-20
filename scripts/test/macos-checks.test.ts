/**
 * P1.12 macOS checks, asserted on a real sidecar (temp homes, `orb` profile, Electron-as-Node) through the test-only
 * probe row `scripts/macos/probe-plugin.mjs`:
 *   1. the sidecar runs on the Electron binary's Node (24.21.x with the pinned Electron 44.7.0);
 *   2. @napi-rs/keyring (via @orb/keychain) loads there and sets/gets/deletes a `ai.orb.app.spike` item, with no
 *      prompt (each call returns promptly);
 *   3. the mounted dsh sandbox backend reports `full` (Seatbelt) and really denies a write outside the workspace;
 *   4. the global tool surface is empty, so agents' only tools are the `orb` preset's (see agent.contract test).
 * The sandbox deliberately ALLOWS /tmp under workspace-write: agents cannot reach /tmp only because they have no
 * shell or fs tools (dump-config + agent tool-list + guard tests), not because of the sandbox.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runMacosChecks, type MacosReport } from '../macos/checks.ts';
import { repoRoot } from '../testkit/index.ts';

const desktopPkg = JSON.parse(readFileSync(join(repoRoot, 'apps', 'desktop', 'package.json'), 'utf8'));
const electronPin: string = desktopPkg.devDependencies?.electron ?? desktopPkg.dependencies?.electron;

describe.skipIf(process.platform !== 'darwin')('P1.12 macOS checks (sidecar-side probe)', () => {
  let report: MacosReport;

  it('boots the sidecar with the probe and gets a report', async () => {
    report = await runMacosChecks();
    expect(report).toBeTruthy();
  }, 90_000);

  it('runs the sidecar on Electron-as-Node (Node 24.21.x)', () => {
    expect(report.runtime.electronRunAsNode).toBe('1');
    expect(report.runtime.electron).toBe(electronPin);
    expect(report.runtime.node).toMatch(/^24\.21\./);
    expect(report.runtime.execPath).toMatch(/Electron\.app\/Contents\/MacOS\/Electron$/);
  });

  it('loads @napi-rs/keyring and round-trips a Keychain item without a prompt', () => {
    const k = report.keyring;
    expect(k.loaded, 'error' in k ? k.error : '').toBe(true);
    if (!k.loaded) return;
    expect(k.service).toBe('ai.orb.app.spike');
    expect(k).toMatchObject({ set: true, getMatches: true, deleted: true, goneAfterDelete: true });
    // A Keychain prompt would block the call until answered; every call must return promptly.
    for (const ms of Object.values(k.ms)) expect(ms).toBeLessThan(2_000);
  });

  it('reports `full` sandbox enforcement (Seatbelt) and really confines writes', () => {
    const s = report.sandbox;
    expect('error' in s ? s.error : '').toBe('');
    if ('error' in s) return;
    expect(s.service).toBe('LocalSandboxProvider');
    expect(s.workspaceWrite.enforcement).toBe('full');
    expect(s.workspaceWrite.runner).toBe('sandbox-exec');
    expect(s.workspaceWrite.insideWorkspace).toMatchObject({ status: 0, written: true });
    expect(s.workspaceWrite.outsideWorkspace.written).toBe(false);
    expect(s.workspaceWrite.outsideWorkspace.stderr.toLowerCase()).toContain('operation not permitted');
    expect(s.readOnly).toMatchObject({ enforcement: 'full', written: false });
    // workspace-write includes /tmp and os.tmpdir() as writable roots (dsh-sandbox writableRoots): the sandbox
    // does not keep a shell out of /tmp. Orb agents are kept out because they have no shell/fs tools at all.
    expect(s.workspaceWrite.slashTmp).toMatchObject({ status: 0, written: true });
  });

  it('exposes no global (agent-less) tools', () => {
    expect(report.globalTools).toEqual([]);
  });
});
