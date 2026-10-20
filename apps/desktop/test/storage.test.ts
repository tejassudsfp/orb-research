/**
 * P5.3 Settings › Storage: the location pointer, the move/use-existing rules, and the folder move (same volume by
 * rename; across volumes by a verified copy, simulated with an EXDEV rename).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  StorageError,
  locationFile,
  looksLikeOrbFolder,
  moveOrbFolder,
  planMove,
  planUseExisting,
  readLocation,
  resolveOrbHome,
  writeOrbHome,
} from '../src/main/storage.js';

let tmp: string;
let orb: string;
let state: string;

/** A small Orb library: orb.json, one canvas with a board log, an asset and an export. */
function seedLibrary(dir: string): void {
  const canvas = join(dir, 'canvases', '2026-10-14-kites');
  mkdirSync(join(canvas, 'assets'), { recursive: true });
  mkdirSync(join(canvas, 'exports'), { recursive: true });
  writeFileSync(join(dir, 'orb.json'), JSON.stringify({ v: 1, theme: 'day' }));
  writeFileSync(join(canvas, 'canvas.json'), JSON.stringify({ id: '2026-10-14-kites' }));
  writeFileSync(join(canvas, 'board.jsonl'), '{"v":1,"seq":1}\n{"v":1,"seq":2}\n');
  writeFileSync(join(canvas, 'assets', 'a.png'), Buffer.alloc(4096, 7));
  writeFileSync(join(canvas, 'exports', 'canvas-1.pdf'), '%PDF-1.7 test');
}

const tree = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (d: string, rel: string) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${name.name}` : name.name;
      if (name.isDirectory()) walk(join(d, name.name), r);
      else out.push(`${r}:${readFileSync(join(d, name.name)).length}`);
    }
  };
  walk(dir, '');
  return out.sort();
};

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-storage-test-'));
  orb = join(tmp, 'Orb');
  state = join(tmp, 'state');
  mkdirSync(state);
  seedLibrary(orb);
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('location pointer', () => {
  it('uses the default without a pointer, the pointed folder with one, and the default when it is gone', async () => {
    expect(resolveOrbHome(orb, state)).toEqual({ orbHome: orb, defaultHome: orb });
    const other = join(tmp, 'Elsewhere');
    mkdirSync(other);
    await writeOrbHome(state, other, orb);
    expect(await readLocation(state)).toBe(other);
    expect(resolveOrbHome(orb, state)).toEqual({ orbHome: other, defaultHome: orb });
    rmSync(other, { recursive: true });
    expect(resolveOrbHome(orb, state)).toEqual({ orbHome: orb, defaultHome: orb, missing: other });
    // Back to the default removes the pointer.
    await writeOrbHome(state, orb, orb);
    expect(existsSync(locationFile(state))).toBe(false);
  });

  it('ignores a broken or relative pointer', () => {
    writeFileSync(locationFile(state), '{nope');
    expect(resolveOrbHome(orb, state).orbHome).toBe(orb);
    writeFileSync(locationFile(state), JSON.stringify({ v: 1, orbHome: 'relative/path' }));
    expect(resolveOrbHome(orb, state).orbHome).toBe(orb);
    writeFileSync(locationFile(state), JSON.stringify({ v: 2, orbHome: tmp }));
    expect(resolveOrbHome(orb, state).orbHome).toBe(orb);
  });
});

describe('planMove', () => {
  it('an empty folder becomes the Orb folder; a non-empty one gets an Orb folder inside', async () => {
    const empty = join(tmp, 'Empty');
    mkdirSync(empty);
    writeFileSync(join(empty, '.DS_Store'), '');
    expect(await planMove(orb, empty)).toBe(empty);
    const docs = join(tmp, 'Documents');
    mkdirSync(docs);
    writeFileSync(join(docs, 'notes.txt'), 'x');
    expect(await planMove(orb, docs)).toBe(join(docs, 'orb'));
  });

  it('refuses the folder itself, a folder inside it, a taken Orb name, a missing folder and app data', async () => {
    await expect(planMove(orb, orb)).rejects.toThrow(StorageError);
    await expect(planMove(orb, join(orb, 'canvases'))).rejects.toThrow(/inside it/);
    const docs = join(tmp, 'Documents');
    mkdirSync(join(docs, 'orb'), { recursive: true });
    writeFileSync(join(docs, 'Orb', 'orb.json'), '{}');
    await expect(planMove(orb, docs)).rejects.toThrow(/already a folder named “orb”/);
    await expect(planMove(orb, join(tmp, 'nope'))).rejects.toThrow(/existing folder/);
    const dsh = join(tmp, 'state', 'dsh');
    mkdirSync(dsh, { recursive: true });
    await expect(planMove(orb, dsh, [dsh])).rejects.toThrow(/app data/);
    // The parent of the Orb folder: it would land on itself.
    await expect(planMove(orb, tmp)).rejects.toThrow(/already there/);
  });
});

describe('planUseExisting', () => {
  it('knows an Orb library from an empty folder, and refuses overlaps', async () => {
    const other = join(tmp, 'Other');
    seedLibrary(other);
    expect(await planUseExisting(orb, other)).toEqual({ target: other, library: true });
    const empty = join(tmp, 'Empty');
    mkdirSync(empty);
    expect(await planUseExisting(orb, empty)).toEqual({ target: empty, library: false });
    expect(await looksLikeOrbFolder(empty)).toBe(false);
    await expect(planUseExisting(orb, orb)).rejects.toThrow(/already uses/);
    await expect(planUseExisting(orb, join(orb, 'canvases'))).rejects.toThrow(/inside your orb folder/);
    await expect(planUseExisting(orb, tmp)).rejects.toThrow(/inside your orb folder, or holds it/);
  });
});

describe('moveOrbFolder', () => {
  it('moves by rename on the same volume, into a new or an empty folder', async () => {
    const before = tree(orb);
    const target = join(tmp, 'Moved', 'Orb');
    expect(await moveOrbFolder(orb, target)).toEqual({ via: 'rename', files: before.length });
    expect(existsSync(orb)).toBe(false);
    expect(tree(target)).toEqual(before);
    const empty = join(tmp, 'Empty');
    mkdirSync(empty);
    writeFileSync(join(empty, '.DS_Store'), '');
    await moveOrbFolder(target, empty);
    expect(tree(empty)).toEqual(before);
  });

  it('across volumes (EXDEV): copies, verifies every file, then removes the old folder', async () => {
    const before = tree(orb);
    const target = join(tmp, 'Volume', 'Orb');
    const exdev = async () => {
      throw Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' });
    };
    expect(await moveOrbFolder(orb, target, { rename: exdev })).toEqual({
      via: 'copy',
      files: before.length,
    });
    expect(existsSync(orb)).toBe(false);
    expect(tree(target)).toEqual(before);
  });

  it('a verified copy stands even when the old folder cannot be removed (reported as leftover)', async () => {
    const before = tree(orb);
    const target = join(tmp, 'Volume', 'Orb');
    const exdev = async () => {
      throw Object.assign(new Error('x'), { code: 'EXDEV' });
    };
    const busy = async () => {
      throw Object.assign(new Error('resource busy'), { code: 'EBUSY' });
    };
    expect(await moveOrbFolder(orb, target, { rename: exdev, removeOld: busy })).toEqual({
      via: 'copy',
      files: before.length,
      leftover: true,
    });
    expect(tree(target)).toEqual(before);
  });

  it('a failed copy leaves the old folder untouched and removes the partial copy', async () => {
    const before = tree(orb);
    const target = join(tmp, 'Volume', 'Orb');
    const exdev = async () => {
      throw Object.assign(new Error('x'), { code: 'EXDEV' });
    };
    // A file the copy cannot read.
    const locked = join(orb, 'canvases', '2026-10-14-kites', 'assets', 'locked.bin');
    writeFileSync(locked, 'secret', { mode: 0o000 });
    await expect(moveOrbFolder(orb, target, { rename: exdev })).rejects.toThrow();
    expect(existsSync(target)).toBe(false);
    rmSync(locked, { force: true });
    expect(tree(orb)).toEqual(before);
  });

  it('a non-EXDEV rename error leaves everything in place', async () => {
    const before = tree(orb);
    const empty = join(tmp, 'Empty');
    mkdirSync(empty);
    const eperm = async () => {
      throw Object.assign(new Error('nope'), { code: 'EPERM' });
    };
    await expect(moveOrbFolder(orb, empty, { rename: eperm })).rejects.toThrow('nope');
    expect(tree(orb)).toEqual(before);
    expect(existsSync(empty)).toBe(true);
  });

  it('a library that does not exist yet just makes the new folder', async () => {
    rmSync(orb, { recursive: true });
    const target = join(tmp, 'New');
    expect(await moveOrbFolder(orb, target)).toEqual({ via: 'rename', files: 0 });
    expect(existsSync(target)).toBe(true);
  });
});
