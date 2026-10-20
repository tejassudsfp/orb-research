/**
 * P5.3 Settings › Storage: where the Orb folder lives, and changing it.
 *
 * The Orb folder (ORB_HOME, `~/Orb` by default) holds orb.json, so its own location cannot be saved inside it. Main
 * keeps it in a small pointer file next to DSH_HOME, `<state>/location.json` (`<userData>/location.json` packaged,
 * `<repo>/.orb-dev/location.json` in dev, the test's temp dir in tests): `{"v":1,"orbHome":"/abs/path"}`. No pointer
 * means the default folder.
 *
 * Changing the location happens with the sidecar STOPPED (main stops it, moves or switches, restarts it on the new
 * folder), so the canvas service, the only writer of canvas folders, never sees the folder change under it:
 *
 * - **Move**: the whole Orb folder moves to the chosen place. An empty chosen folder becomes the Orb folder itself;
 *   otherwise the folder moves INTO it as `Orb` (refused when that name is already taken). Same volume: one rename.
 *   Another volume: a full copy, checked file by file (count and sizes), then the old folder is removed; a failed copy
 *   removes the partial copy and leaves the old folder untouched.
 * - **Use existing**: point Orb at a folder that already holds an Orb library (orb.json or canvases/). Nothing is
 *   copied; the current folder stays where it is.
 *
 * Nothing inside the Orb folder stores its absolute path (canvas.json, board.jsonl, orb.json and index.sqlite hold
 * relative names only; export paths are computed per request), so a moved folder opens as it was. Harness sessions
 * live under DSH_HOME, which never moves.
 */
import { cp, lstat, mkdir, readdir, rename, rm, rmdir, stat, writeFile, readFile } from 'node:fs/promises';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const LOCATION_FILE = 'location.json';
/** The name the folder gets when it moves into a non-empty folder. */
export const ORB_FOLDER_NAME = 'orb';

export type StorageLocation = {
  /** The Orb folder in use. */
  orbHome: string;
  /** The default folder (no pointer). */
  defaultHome: string;
  /** A pointer named a folder that is gone (an unplugged drive, a deleted folder); Orb fell back to the default. */
  missing?: string;
};

/** Where the pointer lives. */
export const locationFile = (stateDir: string) => join(stateDir, LOCATION_FILE);

/** Read the pointer: the Orb folder to use, else the default. */
export function resolveOrbHome(defaultHome: string, stateDir: string): StorageLocation {
  let pointed: string | undefined;
  try {
    const value = JSON.parse(readFileSync(locationFile(stateDir), 'utf8')) as {
      v?: unknown;
      orbHome?: unknown;
    };
    if (value?.v === 1 && typeof value.orbHome === 'string' && isAbsolute(value.orbHome))
      pointed = resolve(value.orbHome);
  } catch {
    // no pointer (or unreadable): the default
  }
  if (!pointed || pointed === resolve(defaultHome)) return { orbHome: defaultHome, defaultHome };
  if (!existsSync(pointed)) return { orbHome: defaultHome, defaultHome, missing: pointed };
  return { orbHome: pointed, defaultHome };
}

/** Save the pointer (atomic). Pointing back at the default removes it. */
export async function writeOrbHome(stateDir: string, orbHome: string, defaultHome: string): Promise<void> {
  const file = locationFile(stateDir);
  if (resolve(orbHome) === resolve(defaultHome)) {
    await rm(file, { force: true });
    return;
  }
  await mkdir(stateDir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ v: 1, orbHome: resolve(orbHome) }, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, file);
}

export class StorageError extends Error {}

const real = (p: string): string => {
  try {
    // P6.1b: the native realpath also folds case on a case-insensitive volume, so a pre-P6.1b `~/Orb` and the new
    // default name `orb` compare as the same folder.
    return realpathSync.native(p);
  } catch {
    return resolve(p);
  }
};

/** True when `child` is `parent` or inside it (after resolving symlinks). */
export function isWithin(child: string, parent: string): boolean {
  const rel = relative(real(parent), real(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

async function isEmptyDir(dir: string): Promise<boolean> {
  try {
    // A Finder-made folder may hold only .DS_Store; that still counts as empty.
    return (await readdir(dir)).every((name) => name === '.DS_Store');
  } catch {
    return false;
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** True when `dir` looks like an Orb library: orb.json or a canvases/ folder. */
export async function looksLikeOrbFolder(dir: string): Promise<boolean> {
  return existsSync(join(dir, 'orb.json')) || (await isDir(join(dir, 'canvases')));
}

/** Folders Orb must never use as its folder (the harness home and its state dir, the app bundle). */
export type Forbidden = string[];

function checkAllowed(target: string, forbidden: Forbidden): void {
  for (const f of forbidden)
    if (isWithin(target, f) || isWithin(f, target))
      throw new StorageError('orb cannot keep its folder there (it holds orb’s own app data).');
}

/**
 * Where a move to `chosen` puts the Orb folder: `chosen` itself when it is empty, else `chosen/orb`. Refuses a
 * destination inside the current folder, the current folder itself, and a taken `orb` name.
 */
export async function planMove(current: string, chosen: string, forbidden: Forbidden = []): Promise<string> {
  if (!isAbsolute(chosen) || !(await isDir(chosen))) throw new StorageError('Choose an existing folder.');
  if (isWithin(chosen, current))
    throw new StorageError('That folder is your orb folder, or inside it. Choose a place outside it.');
  const target = (await isEmptyDir(chosen)) ? resolve(chosen) : join(resolve(chosen), ORB_FOLDER_NAME);
  if (real(target) === real(current)) throw new StorageError('Your orb folder is already there.');
  if (existsSync(target) && !(await isEmptyDir(target)))
    throw new StorageError(
      `There is already a folder named “${ORB_FOLDER_NAME}” in ${basename(chosen) || chosen}. ` +
        'Choose another place, or use “Use existing folder” to open it.',
    );
  checkAllowed(target, forbidden);
  return target;
}

/** Validate a folder for "Use existing folder". Returns whether it already holds an Orb library. */
export async function planUseExisting(
  current: string,
  chosen: string,
  forbidden: Forbidden = [],
): Promise<{ target: string; library: boolean }> {
  if (!isAbsolute(chosen) || !(await isDir(chosen))) throw new StorageError('Choose an existing folder.');
  const target = resolve(chosen);
  if (real(target) === real(current)) throw new StorageError('orb already uses that folder.');
  if (isWithin(target, current) || isWithin(current, target))
    throw new StorageError('That folder is inside your orb folder, or holds it. Choose a separate folder.');
  checkAllowed(target, forbidden);
  return { target, library: await looksLikeOrbFolder(target) };
}

type Listing = Map<string, number>;

/** Every file under `dir` (relative path → size); symlinks are listed by their own size and not followed. */
async function listFiles(dir: string, base = dir, out: Listing = new Map()): Promise<Listing> {
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const st = await lstat(p);
    if (st.isDirectory()) await listFiles(p, base, out);
    else out.set(relative(base, p).split(sep).join('/'), st.isFile() ? st.size : -1);
  }
  return out;
}

export type MoveFs = {
  rename: (from: string, to: string) => Promise<void>;
  /** Removes the old folder after a verified cross-volume copy (injectable for tests). */
  removeOld?: (dir: string) => Promise<void>;
};

/** `leftover`: the copy succeeded but (part of) the old folder could not be removed. */
export type MoveResult = { via: 'rename' | 'copy'; files: number; leftover?: true };

/**
 * Move the Orb folder `from` to `to` (which must not exist, or be an empty folder). Same volume: rename. Across
 * volumes (EXDEV): copy, verify every file's size, then remove `from`. On a failed copy the partial `to` is removed
 * and `from` is left as it was.
 */
export async function moveOrbFolder(from: string, to: string, fs: MoveFs = { rename }): Promise<MoveResult> {
  if (!existsSync(from)) {
    await mkdir(to, { recursive: true });
    return { via: 'rename', files: 0 };
  }
  const createdTo = !existsSync(to);
  if (!createdTo) {
    // An empty destination folder (maybe holding only .DS_Store): clear it so the rename can take its place.
    await rm(join(to, '.DS_Store'), { force: true });
    await rmdir(to);
  }
  await mkdir(dirname(to), { recursive: true });
  try {
    await fs.rename(from, to);
    return { via: 'rename', files: (await listFiles(to)).size };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') {
      if (!createdTo) await mkdir(to, { recursive: true }).catch(() => undefined);
      throw err;
    }
  }
  const before = await listFiles(from);
  try {
    await cp(from, to, {
      recursive: true,
      errorOnExist: true,
      force: false,
      preserveTimestamps: true,
      verbatimSymlinks: true,
    });
    const after = await listFiles(to);
    for (const [rel, size] of before)
      if (after.get(rel) !== size) throw new StorageError(`the copy of ${rel} does not match the original`);
  } catch (err) {
    await rm(to, { recursive: true, force: true }).catch(() => undefined);
    if (!createdTo) await mkdir(to, { recursive: true }).catch(() => undefined);
    throw err;
  }
  // The verified copy is now the Orb folder. A failure to remove the old one (a locked file) must not undo that: the
  // caller would otherwise restart on a half-removed old folder while the library sits in the new one.
  try {
    await (fs.removeOld ?? ((dir: string) => rm(dir, { recursive: true, force: true })))(from);
  } catch {
    return { via: 'copy', files: before.size, leftover: true };
  }
  return { via: 'copy', files: before.size };
}

/** Read a JSON file or undefined (test helper for the pointer). */
export async function readLocation(stateDir: string): Promise<string | undefined> {
  try {
    const v = JSON.parse(await readFile(locationFile(stateDir), 'utf8')) as { orbHome?: string };
    return v.orbHome;
  } catch {
    return undefined;
  }
}
