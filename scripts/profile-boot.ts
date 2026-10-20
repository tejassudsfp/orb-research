/**
 * P5.1 sidecar boot profile. Boots the real `orb` profile (Electron as Node, temp homes, the mock LLM route) `--runs`
 * times and reports spawn → `dsh web:` URL line and spawn → first authenticated `orb/canvas.list` answer (what Home
 * needs). `--extra-patch <file>` appends rows (e.g. to compare a candidate disable list); `--cpu-prof <dir>` writes a
 * V8 CPU profile of one boot.
 *
 *   pnpm profile-boot [--runs 10] [--extra-patch rows.yml] [--cpu-prof dir] [--compile-cache]
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { startSidecar } from './testkit/sidecar.ts';
import { mockProviderPatch, MOCK_KEY_ENV } from './testkit/mockLlm.ts';

export type BootSample = { urlMs: number; homeDataMs: number };

export async function bootOnce(
  opts: { extraPatch?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<BootSample> {
  const t0 = performance.now();
  const sidecar = await startSidecar({
    extraPatch: [mockProviderPatch('http://127.0.0.1:9/v1'), opts.extraPatch ?? ''].join('\n'),
    env: { [MOCK_KEY_ENV]: 'orb-mock-key', ...opts.env },
  });
  const urlMs = performance.now() - t0;
  try {
    const res = await sidecar.fetch(`${sidecar.origin}/api/orb/canvas.list`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'boot',
        method: 'orb/canvas.list',
        payload: { args: {} },
      }),
    });
    if (!res.ok) throw new Error(`canvas.list HTTP ${res.status}`);
    await res.text();
    return { urlMs, homeDataMs: performance.now() - t0 };
  } finally {
    await sidecar.stop();
  }
}

export function summarise(values: number[]): { min: number; p50: number; p95: number; max: number } {
  const s = [...values].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]!;
  const r = (n: number) => Math.round(n);
  return { min: r(s[0]!), p50: r(at(0.5)), p95: r(at(0.95)), max: r(s[s.length - 1]!) };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      runs: { type: 'string', default: '10' },
      'extra-patch': { type: 'string' },
      'cpu-prof': { type: 'string' },
      'compile-cache': { type: 'boolean', default: false },
    },
  });
  const extraPatch = values['extra-patch'] ? readFileSync(values['extra-patch'], 'utf8') : undefined;
  if (values['cpu-prof']) {
    await bootOnce({
      extraPatch,
      env: { NODE_OPTIONS: `--cpu-prof --cpu-prof-dir=${values['cpu-prof']}` },
    });
    console.log(`cpu profile written to ${values['cpu-prof']}`);
    return;
  }
  const runs = Number(values.runs);
  // `--compile-cache`: the boots share one Node compile cache (NODE_COMPILE_CACHE), as launches after the first would
  // if Orb enabled it. Evaluated in P5.1 and NOT enabled: -30 ms per launch, +530 ms on the first launch after every
  // install or update (docs/HARNESS_NOTES.md §P5.1).
  const cacheDir = mkdtempSync(join(tmpdir(), 'orb-profile-cache-'));
  const env: NodeJS.ProcessEnv = values['compile-cache'] ? { NODE_COMPILE_CACHE: cacheDir } : {};
  try {
    const first = await bootOnce({ extraPatch, env }); // first launch (cold file-system and compile caches): not summarised
    const samples: BootSample[] = [];
    for (let i = 0; i < runs; i++) samples.push(await bootOnce({ extraPatch, env }));
    console.log(
      JSON.stringify(
        {
          runs,
          compileCache: values['compile-cache'],
          firstLaunch: { urlMs: Math.round(first.urlMs), homeDataMs: Math.round(first.homeDataMs) },
          spawnToUrlMs: summarise(samples.map((s) => s.urlMs)),
          spawnToHomeDataMs: summarise(samples.map((s) => s.homeDataMs)),
        },
        null,
        2,
      ),
    );
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();
