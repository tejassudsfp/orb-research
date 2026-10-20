/**
 * P5.4 packaging, step 1: stage what electron-builder packs into Orb.app (`pnpm dist` runs this, then electron-builder
 * with apps/desktop/electron-builder.yml).
 *
 * release/stage/
 *   app/            the Electron app (goes into app.asar): a package.json with no dependencies + apps/desktop/out
 *                   (main bundles @orb/shared and @orb/sources/policy, so it needs no node_modules of its own)
 *   node_modules/   the sidecar's runtime tree → Contents/Resources/node_modules (plain files, never in the asar:
 *                   dsh resolves its bundles, @orb/bundle included, by walking real node_modules directories, and
 *                   the native addons (keyring, node-addon-require-builtin, node-pty, ...) must be loadable files)
 *   profiles/orb/   the `orb` profile template → Contents/Resources/profiles/orb
 *   ui/             apps/ui/dist → Contents/Resources/ui
 *
 * The sidecar tree is the production dependency closure of the root package.json (`@deepseek-ai/dsh` + `@orb/*`):
 * dependencies, optionalDependencies and installed peerDependencies, resolved from each package's real directory the
 * way Node resolves them. The repo uses pnpm's hoisted layout, so a package keeps its place: `node_modules/x` stays
 * `node_modules/x`, a nested `node_modules/a/node_modules/x` stays nested. Workspace packages (`packages/*`) are copied
 * flat as `node_modules/@orb/<name>` with their built `lib/` (no src, tests or configs). After copying, every edge of
 * the closure is re-resolved inside the staged tree; any edge that would resolve elsewhere fails the stage.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const STAGE = join(REPO, 'release', 'stage');
const ROOT_NM = join(REPO, 'node_modules');
const WORKSPACE_PACKAGES = join(REPO, 'packages');
/** Files a workspace package never ships. */
const WORKSPACE_SKIP = new Set(['src', 'test', 'tests', 'node_modules', 'tsconfig.json', 'tsup.config.ts']);

type Manifest = {
  name: string;
  version?: string;
  license?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

const readManifest = (dir: string): Manifest => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

/** Node's lookup: `<dir>/node_modules/<name>` from the package's own dir up to the filesystem root. */
function lookup(fromDir: string, name: string, stopAt: string): string | undefined {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dir === stopAt) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Where a real package directory goes in the staged tree. */
function stagedPath(realDir: string, outNm: string): string {
  if (realDir.startsWith(ROOT_NM + sep)) return join(outNm, relative(ROOT_NM, realDir));
  if (realDir.startsWith(WORKSPACE_PACKAGES + sep)) {
    const rel = relative(WORKSPACE_PACKAGES, realDir).split(sep);
    const pkgDir = join(WORKSPACE_PACKAGES, rel[0]!);
    const own = join(outNm, readManifest(pkgDir).name);
    // A workspace package itself, or something installed inside its own node_modules.
    return rel.length === 1 ? own : join(own, ...rel.slice(1));
  }
  throw new Error(`stage: ${realDir} is outside the repo's node_modules and packages/`);
}

/**
 * Optional dependencies left out of the installer on purpose. The LibreOffice engine (148 MB, MPL-2.0 with its own
 * third-party notices) only serves dsh-office-to-pdf, which the orb profile disables (packages/orb-bundle). Without
 * it, @deepseek-ai/libreoffice-kit reports `unavailable` instead of loading, exactly as for an uninstalled optional.
 */
const EXCLUDED_OPTIONAL = new Set(['@deepseek-ai/libreoffice-kit-darwin-arm64']);

type Edge = { from: string; name: string; to: string };

/** The production closure: real package dirs and the edges between them. */
function closure(): { packages: Set<string>; edges: Edge[]; missingOptional: string[] } {
  const packages = new Set<string>();
  const edges: Edge[] = [];
  const missingOptional: string[] = [];
  const root = readManifest(REPO);
  const queue: Array<{ dir: string; manifest: Manifest; isRoot: boolean }> = [
    { dir: REPO, manifest: root, isRoot: true },
  ];
  while (queue.length > 0) {
    const { dir, manifest, isRoot } = queue.shift()!;
    const wanted: Array<{ name: string; optional: boolean }> = [
      ...Object.keys(manifest.dependencies ?? {}).map((name) => ({ name, optional: false })),
      ...Object.keys(manifest.optionalDependencies ?? {}).map((name) => ({ name, optional: true })),
      ...(isRoot
        ? []
        : Object.keys(manifest.peerDependencies ?? {}).map((name) => ({
            name,
            // An uninstalled peer is the host's choice (pnpm installs required peers when it can); skip it.
            optional: true,
          }))),
    ];
    for (const { name, optional } of wanted) {
      if (optional && EXCLUDED_OPTIONAL.has(name)) {
        missingOptional.push(`${manifest.name} → ${name} (excluded)`);
        continue;
      }
      const found = lookup(dir, name, REPO);
      if (!found) {
        if (optional) missingOptional.push(`${manifest.name} → ${name}`);
        else throw new Error(`stage: ${manifest.name} needs ${name}, which is not installed`);
        continue;
      }
      const real = realpathSync(found);
      if (!isRoot) edges.push({ from: dir, name, to: real });
      if (packages.has(real)) continue;
      packages.add(real);
      queue.push({ dir: real, manifest: readManifest(real), isRoot: false });
    }
  }
  return { packages, edges, missingOptional };
}

function copyPackage(realDir: string, target: string): void {
  const workspace = realDir.startsWith(WORKSPACE_PACKAGES + sep) && dirname(realDir) === WORKSPACE_PACKAGES;
  mkdirSync(target, { recursive: true });
  cpSync(realDir, target, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      if (src === realDir) return true;
      const rel = relative(realDir, src);
      const top = rel.split(sep)[0]!;
      // Nested node_modules are staged per closure entry, never wholesale (that would drag dev deps in).
      if (top === 'node_modules') return false;
      if (workspace && WORKSPACE_SKIP.has(top)) return false;
      return true;
    },
  });
}

function stageSidecar(outNm: string): { count: number; bytes: number } {
  const { packages, edges, missingOptional } = closure();
  for (const real of packages) copyPackage(real, stagedPath(real, outNm));
  // Prove the staged tree resolves every edge to the same package it did in the repo.
  const stageRoot = dirname(outNm);
  const bad: string[] = [];
  for (const edge of edges) {
    const fromStaged = edge.from === REPO ? stageRoot : stagedPath(edge.from, outNm);
    const got = lookup(fromStaged, edge.name, stageRoot);
    const want = stagedPath(edge.to, outNm);
    if (got !== want)
      bad.push(`${relative(stageRoot, fromStaged)} → ${edge.name}: ${got ?? 'missing'} ≠ ${want}`);
  }
  if (bad.length > 0) throw new Error(`stage: the staged tree resolves differently:\n${bad.join('\n')}`);
  for (const name of ['@deepseek-ai/dsh', '@orb/bundle', '@orb/host', '@orb/keychain']) {
    if (!lookup(stageRoot, name, stageRoot)) throw new Error(`stage: ${name} is not reachable from the root`);
  }
  if (missingOptional.length > 0)
    console.log(
      `stage: ${missingOptional.length} optional/peer dependencies not installed (other platforms)`,
    );
  return { count: packages.size, bytes: duBytes(outNm) };
}

function duBytes(dir: string): number {
  let total = 0;
  const walk = (p: string) => {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const entry of readdirSync(p)) walk(join(p, entry));
    } else total += st.size;
  };
  walk(dir);
  return total;
}

function stageApp(appDir: string): void {
  const desktop = readManifest(join(REPO, 'apps', 'desktop'));
  const out = join(REPO, 'apps', 'desktop', 'out');
  if (!existsSync(join(out, 'main', 'index.js')))
    throw new Error('stage: apps/desktop/out is missing; run pnpm build');
  mkdirSync(appDir, { recursive: true });
  cpSync(out, join(appDir, 'out'), { recursive: true });
  // app.getName() → "orb" (P6.1b: always lowercase; userData = ~/Library/Application Support/orb, the same folder as
  // a pre-P6.1b "Orb" on a case-insensitive volume); app.getVersion() → the desktop version.
  const manifest = {
    name: 'orb',
    productName: 'orb',
    version: desktop.version,
    description: 'orb, a local-first research canvas',
    private: true,
    type: 'module',
    main: './out/main/index.js',
    author: { name: 'Tejas Parthasarathi Sudarshan', url: 'https://tejassuds.com' },
    license: 'MIT',
    homepage: 'https://github.com/tejassudsfp/orb-research',
  };
  writeFileSync(join(appDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function main(): void {
  const ui = join(REPO, 'apps', 'ui', 'dist');
  if (!existsSync(join(ui, 'index.html'))) throw new Error('stage: apps/ui/dist is missing; run pnpm build');
  rmSync(STAGE, { recursive: true, force: true });
  stageApp(join(STAGE, 'app'));
  const { count, bytes } = stageSidecar(join(STAGE, 'node_modules'));
  cpSync(join(REPO, 'profiles', 'orb'), join(STAGE, 'profiles', 'orb'), { recursive: true });
  cpSync(ui, join(STAGE, 'ui'), { recursive: true });
  const licenses = join(STAGE, 'licenses');
  mkdirSync(licenses, { recursive: true });
  for (const name of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md'])
    cpSync(join(REPO, name), join(licenses, name));
  cpSync(join(REPO, 'apps/ui/public/licenses/symplist.txt'), join(licenses, 'symplist.txt'));
  cpSync(join(REPO, 'apps/ui/src/theme/fonts/LICENSES.txt'), join(licenses, 'theme-fonts.txt'));
  for (const font of ['geist', 'geist-mono'])
    cpSync(join(ROOT_NM, '@fontsource', font, 'LICENSE'), join(licenses, `${font}.txt`));
  const inventory = [...closure().packages]
    .map((dir) => {
      const { name, version, license } = readManifest(dir);
      return {
        name,
        version,
        license: license ?? 'SEE PACKAGE LICENSE',
        directory: relative(STAGE, stagedPath(dir, join(STAGE, 'node_modules'))),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(join(licenses, 'dependencies.json'), JSON.stringify(inventory, null, 2) + '\n');
  console.log(
    `stage: ${count} sidecar packages (${(bytes / 1e6).toFixed(1)} MB) staged in ${relative(REPO, STAGE)}`,
  );
}

main();
