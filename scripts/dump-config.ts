import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapDshHome, devPaths, dshBinPath, sidecarEnv } from '../apps/desktop/src/main/dshHome.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Compose the `orb` profile and return the dump, with absolute repo paths replaced by `<repo>`. */
export function dumpConfig(): string {
  const paths = devPaths(root);
  bootstrapDshHome(paths);
  const res = spawnSync(process.execPath, [dshBinPath(root), '--profile', 'orb', '--dump-config'], {
    env: sidecarEnv(paths),
    cwd: paths.orbHome,
    encoding: 'utf8',
  });
  if (res.status !== 0) throw new Error(`dump-config failed (${res.status}): ${res.stderr}`);
  return res.stdout.split(root).join('<repo>');
}

if (import.meta.main) {
  const out = dumpConfig();
  process.stdout.write(out);
  if (process.argv.includes('--write')) {
    const file = join(root, 'docs', 'spike', 'orb-dump-config.yml');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, out);
  }
}
