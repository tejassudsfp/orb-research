/**
 * P2.5 assets in the canvas service: uploads are copied into `<canvas>/assets/` only when their type, size and bytes
 * check out (nothing is left behind otherwise), and only regular files directly inside `assets/` can be read back.
 * Also `card.opened`: written once per card, never on the undo stack.
 */
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssetRef, type CanvasMeta } from '@orb/shared';
import { CanvasStore, storedName } from '../src/index.js';
import { IMAGE_HEADS, makePdf, makePng } from '../../../scripts/testkit/fixtures.js';

let home: string;
let store: CanvasStore;
let canvas: CanvasMeta;
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-assets-'));
  store = new CanvasStore({ home });
  canvas = await store.create({ prompt: 'assets' });
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

async function* bytes(...chunks: (Buffer | string)[]): AsyncGenerator<Uint8Array> {
  for (const c of chunks) yield typeof c === 'string' ? Buffer.from(c) : c;
}
const assetsDir = () => join(home, 'canvases', canvas.id, 'assets');
const files = () => {
  try {
    return readdirSync(assetsDir());
  } catch {
    return [];
  }
};

describe('writeAsset', () => {
  const ok: [string, string, Buffer][] = [
    ['photo.png', 'image/png', makePng(4, 3)],
    ['scan.JPG', 'image/jpeg', IMAGE_HEADS.jpeg],
    ['anim.gif', 'image/gif', IMAGE_HEADS.gif],
    ['pic.webp', 'image/webp', IMAGE_HEADS.webp],
    ['Paper (final).pdf', 'application/pdf', makePdf(3)],
    ['data.csv', 'text/csv', Buffer.from('a,b\n1,2\n')],
    ['Notes.md', 'text/markdown; charset=utf-8', Buffer.from('# Héllo ✓\n')],
    ['readme.txt', 'text/plain', Buffer.from('plain')],
  ];
  it.each(ok)('stores %s (%s) under assets/ and returns its reference', async (name, mime, data) => {
    // Split the bytes across chunks (and a multi-byte UTF-8 character across two of them).
    const mid = Math.floor(data.length / 2);
    const asset = await store.writeAsset(canvas.id, {
      name,
      mime,
      data: bytes(data.subarray(0, mid), data.subarray(mid)),
    });
    expect(AssetRef.parse(asset)).toEqual(asset);
    expect(asset.size).toBe(data.length);
    expect(asset.name).toBe(name);
    expect(readFileSync(join(home, 'canvases', canvas.id, asset.path))).toEqual(data);
    expect(files()).toEqual([asset.path.slice('assets/'.length)]);
    const read = await store.assetFile(canvas.id, asset.path);
    expect(read.size).toBe(data.length);
    expect(read.mime).toBe(mime.split(';')[0]);
  });

  it('names stored files <ulid>-<slug>.<ext>, never reusing a name', async () => {
    const a = await store.writeAsset(canvas.id, {
      name: '../../etc/passwd.png',
      mime: 'image/png',
      data: bytes(makePng(1, 1)),
    });
    const b = await store.writeAsset(canvas.id, {
      name: '../../etc/passwd.png',
      mime: 'image/png',
      data: bytes(makePng(1, 1)),
    });
    expect(a.path).toMatch(/^assets\/[0-9a-z]{26}-etc-passwd\.png$/);
    expect(a.path).not.toBe(b.path);
    expect(a.name).toBe('....etcpasswd.png');
    expect(storedName('', 'pdf', 'ABC')).toBe('abc.pdf');
  });

  const refused: [
    string,
    { name: string; mime: string; data: AsyncIterable<Uint8Array>; length?: number },
    RegExp,
  ][] = [
    [
      'an unsupported type',
      { name: 'x.svg', mime: 'image/svg+xml', data: bytes('<svg/>') },
      /orb\/unsupported-type|does not accept/,
    ],
    [
      'bytes that are not the declared image',
      { name: 'x.png', mime: 'image/png', data: bytes('GIF89a....') },
      /not a valid PNG/,
    ],
    [
      'a PDF without a PDF header',
      { name: 'x.pdf', mime: 'application/pdf', data: bytes('hello') },
      /not a valid PDF/,
    ],
    [
      'text that is not UTF-8',
      { name: 'x.txt', mime: 'text/plain', data: bytes(Buffer.from([0xc3, 0x28])) },
      /not UTF-8/,
    ],
    [
      'text with a NUL byte',
      { name: 'x.csv', mime: 'text/csv', data: bytes(Buffer.from('a,b\0')) },
      /not UTF-8/,
    ],
    ['an empty file', { name: 'x.md', mime: 'text/markdown', data: bytes() }, /empty/],
    [
      'a declared length above the cap',
      { name: 'x.md', mime: 'text/markdown', data: bytes('x'), length: 5 * 1024 * 1024 + 1 },
      /larger than 5 MB/,
    ],
  ];
  it.each(refused)('refuses %s and leaves nothing behind', async (_what, input, message) => {
    await expect(store.writeAsset(canvas.id, input)).rejects.toThrow(message);
    expect(files()).toEqual([]);
  });

  it('stops streaming at the cap (no declared length) and removes the partial file', async () => {
    const mb = Buffer.alloc(1024 * 1024, 0x61);
    async function* endless() {
      for (let i = 0; i < 100; i++) yield mb;
    }
    const err = await store
      .writeAsset(canvas.id, { name: 'big.txt', mime: 'text/plain', data: endless() })
      .catch((e) => e);
    expect(err).toMatchObject({ code: 'orb/too-large' });
    expect(files()).toEqual([]);
  });

  it('refuses an unknown canvas', async () => {
    await expect(
      store.writeAsset('2026-01-01-nope', { name: 'a.txt', mime: 'text/plain', data: bytes('x') }),
    ).rejects.toMatchObject({ code: 'orb/not-found' });
    await expect(
      store.writeAsset('../x', { name: 'a.txt', mime: 'text/plain', data: bytes('x') }),
    ).rejects.toMatchObject({
      code: 'orb/invalid-args',
    });
  });
});

describe('assetFile', () => {
  it('reads only regular files directly inside assets/', async () => {
    const dir = join(home, 'canvases', canvas.id);
    mkdirSync(join(dir, 'assets', 'sub'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'sub', 'x.png'), 'x');
    writeFileSync(join(home, 'secret.txt'), 'secret');
    symlinkSync(join(home, 'secret.txt'), join(dir, 'assets', 'link.txt'));
    mkdirSync(join(dir, 'assets', 'folder.png'));
    for (const [path, code] of [
      ['assets/../canvas.json', 'orb/invalid-args'],
      ['canvas.json', 'orb/invalid-args'],
      ['assets/sub/x.png', 'orb/invalid-args'],
      ['assets/link.txt', 'orb/not-found'],
      ['assets/folder.png', 'orb/not-found'],
      ['assets/missing.png', 'orb/not-found'],
      ['assets/file.exe', 'orb/not-found'],
      ['/etc/hosts', 'orb/invalid-args'],
    ] as const) {
      await expect(store.assetFile(canvas.id, path), path).rejects.toMatchObject({ code });
    }
  });
});

describe('card.opened in the canvas service', () => {
  it('is written once per card, is not undoable and keeps the redo stack', async () => {
    const note = { type: 'note' as const, x: 0, y: 0, w: 200, h: 120, data: { title: 'n' } };
    const [added] = (await store.userCommand(canvas.id, { type: 'card.added', card: note })).events;
    const id = (added!.data as { card: { id: string } }).card.id;
    await store.userCommand(canvas.id, { type: 'card.updated', id, patch: { badge: 'must' } });
    await store.userCommand(canvas.id, { type: 'undo' }); // badge undone → redo depth 1
    expect(await store.history(canvas.id)).toEqual({ undo: 1, redo: 1 });

    const first = await store.userCommand(canvas.id, { type: 'card.opened', id });
    expect(first.events.map((e) => e.type)).toEqual(['card.opened']);
    expect(first.history).toEqual({ undo: 1, redo: 1 });
    const again = await store.userCommand(canvas.id, { type: 'card.opened', id });
    expect(again.events).toEqual([]);
    const board = await store.board(canvas.id);
    expect(board.card(id)!.opened).toBe(true);
    // Undo reverses the add, not the opening.
    const undo = await store.userCommand(canvas.id, { type: 'undo' });
    expect(undo.events.map((e) => e.type)).toEqual(['undo.marker', 'card.removed']);
    await expect(store.userCommand(canvas.id, { type: 'card.opened', id: 'c_nope' })).rejects.toMatchObject({
      code: 'orb/not-found',
    });
  });
});

describe('asset GC for undone drops (P6.9)', () => {
  const png = () => ({ name: 'p.png', mime: 'image/png', data: bytes(makePng(2, 2)) });
  const age = (path: string, ms: number) => {
    const t = new Date(Date.now() - ms);
    utimesSync(join(home, 'canvases', canvas.id, path), t, t);
  };

  it('a drop that was undone leaves its file; the next load of the board removes it, a referenced file stays', async () => {
    await store.board(canvas.id);
    await store.assetGcIdle();
    const kept = await store.writeAsset(canvas.id, png());
    const undone = await store.writeAsset(canvas.id, png());
    const fresh = await store.writeAsset(canvas.id, png());
    const data = (asset: typeof kept) => ({ asset, title: 'p' });
    await store.commandEvents(canvas.id, {
      type: 'card.added',
      card: { type: 'image', frameId: null, x: 0, y: 0, w: 200, h: 200, data: data(kept) },
    });
    // The user drops a second image, then undoes the drop (the card goes, the file stays).
    await store.commandEvents(canvas.id, {
      type: 'card.added',
      card: { type: 'image', frameId: null, x: 300, y: 0, w: 200, h: 200, data: data(undone) },
    });
    await store.userCommand(canvas.id, { type: "undo" });
    expect(files()).toHaveLength(3);
    for (const a of [kept, undone]) age(a.path, 10 * 60_000);
    // Same session: nothing is collected (a redo still needs the file).
    expect(files()).toHaveLength(3);
    await store.close();

    // A new app session loads the board: the undone drop's old file goes, the card's file and the fresh upload stay.
    store = new CanvasStore({ home });
    await store.board(canvas.id);
    await store.assetGcIdle();
    expect(files()).toHaveLength(2);
    expect(files().sort()).toEqual([kept, fresh].map((a) => a.path.slice('assets/'.length)).sort());
    await store.close();
    store = new CanvasStore({ home });
  });

  it('only top-level uploads are collected: dot files, subfolders and files a dataset or design page names stay', async () => {
    const dir = assetsDir();
    mkdirSync(join(dir, 'data'), { recursive: true });
    mkdirSync(join(dir, 'snapshots'), { recursive: true });
    await store.board(canvas.id);
    await store.assetGcIdle();
    const named = await store.writeAsset(canvas.id, png());
    const orphan = await store.writeAsset(canvas.id, png());
    writeFileSync(join(dir, 'data', 'd_1.json'), JSON.stringify({ rows: [{ pic: named.path }] }));
    writeFileSync(join(dir, 'snapshots', 'c_1-v1-1.png'), 'x');
    for (const a of [named, orphan]) age(a.path, 10 * 60_000);
    age('assets/data/d_1.json', 10 * 60_000);
    await store.close();
    store = new CanvasStore({ home });
    await store.board(canvas.id);
    await store.assetGcIdle();
    expect(files().includes(orphan.path.slice(7))).toBe(false);
    expect(files()).toContain(named.path.slice(7));
    expect(readdirSync(join(dir, 'snapshots'))).toEqual(['c_1-v1-1.png']);
    expect(readdirSync(join(dir, 'data'))).toEqual(['d_1.json']);
  });
});
