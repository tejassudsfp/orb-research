import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type OrbPaths = {
  /** Repo root (dev) or app resources root (prod) — where node_modules/@deepseek-ai/dsh lives. */
  root: string;
  dshHome: string;
  orbHome: string;
  uiDist: string;
};

/**
 * P6.1b: the user's folder is `~/orb` (the name is always lowercase). A `~/Orb` from before P6.1b is the same folder
 * on a case-insensitive volume (the macOS default); on a case-sensitive one it is kept when there is no `~/orb`.
 */
export function defaultOrbHome(home: string, exists: (path: string) => boolean = existsSync): string {
  const lower = join(home, 'orb');
  const legacy = join(home, 'Orb');
  return !exists(lower) && exists(legacy) ? legacy : lower;
}

/** Dev paths: everything under <repo>/.orb-dev (gitignored). */
export function devPaths(repoRoot: string): OrbPaths {
  return {
    root: repoRoot,
    dshHome: join(repoRoot, '.orb-dev', 'dsh'),
    orbHome: join(repoRoot, '.orb-dev', 'Orb'),
    uiDist: join(repoRoot, 'apps', 'ui', 'dist'),
  };
}

/**
 * Packaged paths (P5.4; PRD "Storage"): the sidecar tree, the profile template and the UI dist ship as plain files in
 * `Orb.app/Contents/Resources` (`node_modules/`, `profiles/orb/`, `ui/`; apps/desktop/electron-builder.yml), harness
 * internals live in the private app-support folder (`~/Library/Application Support/Orb/dsh`, i.e. `<userData>/dsh`)
 * and the user's data in `~/orb` (Settings › Storage can point elsewhere; storage.ts).
 */
export function packagedPaths(resourcesPath: string, userData: string, home: string): OrbPaths {
  return {
    root: resourcesPath,
    dshHome: join(userData, 'dsh'),
    orbHome: defaultOrbHome(home),
    uiDist: join(resourcesPath, 'ui'),
  };
}

const PROFILE_FILES = ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml'] as const;

/**
 * Write the `orb` profile into DSH_HOME/profiles/orb from the repo template. Idempotent: Orb owns this
 * directory, so the template always wins. `@orb/bundle` resolves from the dsh install itself
 * (hoisted next to @deepseek-ai/dsh), which dsh-app-boot tries first (resolveBundleDir).
 */
export function bootstrapDshHome(
  paths: OrbPaths,
  opts: { templateDir?: string; extraPatch?: string } = {},
): string {
  const templateDir = opts.templateDir ?? join(paths.root, 'profiles', 'orb');
  const profileDir = join(paths.dshHome, 'profiles', 'orb');
  mkdirSync(profileDir, { recursive: true, mode: 0o700 });
  mkdirSync(paths.orbHome, { recursive: true });
  for (const file of PROFILE_FILES) copyFileSync(join(templateDir, file), join(profileDir, file));
  if (opts.extraPatch) {
    const base = readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8');
    writeFileSync(join(profileDir, 'cordis.patch.yml'), `${base}\n${opts.extraPatch}\n`);
  }
  if (!existsSync(join(paths.dshHome, 'cordis.patch.yml')))
    writeFileSync(join(paths.dshHome, 'cordis.patch.yml'), '[]\n');
  return profileDir;
}

export function dshBinPath(root: string): string {
  return resolve(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
}

/**
 * P5.1: Node's on-disk compile cache for the sidecar's modules (NODE_COMPILE_CACHE), next to DSH_HOME (dev
 * `.orb-dev/compile-cache`, packaged `<userData>/compile-cache`). Measured with `pnpm profile-boot --compile-cache`:
 * about -25 ms on every launch, +75 ms on the first launch after an install or update while it is written
 * (docs/HARNESS_NOTES.md §P5.1). Node keys its entries by version, so an Electron bump is safe. The app sets it
 * (apps/desktop/src/main/index.ts); test sidecars on throwaway homes do not.
 */
export function compileCacheDir(paths: OrbPaths): string {
  return join(dirname(paths.dshHome), 'compile-cache');
}

/** Environment for every sidecar launch. */
export function sidecarEnv(paths: OrbPaths, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...base,
    DSH_HOME: paths.dshHome,
    DSH_TELEMETRY_DISABLED: '1',
    DSH_TELEMETRY_MODE: 'DISABLED',
    ORB_UI_DIST: paths.uiDist,
    ORB_HOME: paths.orbHome,
  };
}
