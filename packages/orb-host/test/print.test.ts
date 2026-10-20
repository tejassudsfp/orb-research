/**
 * P4.4 print pipeline storage: the snapshot and export upload routes (orb-host) over the canvas service (orb-canvas
 * `writeSnapshot` / `writeExport`), and the asset file route serving snapshots back. Called with WHATWG Requests.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CanvasStore } from '@orb/canvas';
import {
  ExportUploadResult,
  SnapshotUploadResult,
  exportFileName,
  snapshotCapturedAt,
  type CanvasMeta,
} from '@orb/shared';
import { handleAssetFile, handleExportUpload, handleSnapshotUpload } from '../src/assets.js';
import { makePdf, makePng } from '../../../scripts/testkit/fixtures.js';

let home: string;
let store: CanvasStore;
let canvas: CanvasMeta;
let designId: string;
let noteId: string;
let now = Date.UTC(2026, 9, 14, 12, 30, 5);

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-host-print-'));
  now = Date.UTC(2026, 9, 14, 12, 30, 5);
  store = new CanvasStore({ home, searchIndex: false, now: () => now });
  canvas = await store.create({ prompt: 'print routes' });
  const design = await store.command(canvas.id, {
    type: 'card.added',
    card: { type: 'design', x: 0, y: 0, w: 300, h: 300, data: { title: 'Screen', html: '<p>hi</p>' } },
  } as never);
  designId = (design.data as { card: { id: string } }).card.id;
  const note = await store.command(canvas.id, {
    type: 'card.added',
    card: { type: 'note', x: 0, y: 400, w: 200, h: 100, data: { title: 'n' } },
  } as never);
  noteId = (note.data as { card: { id: string } }).card.id;
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

const base = 'http://127.0.0.1:1';
const post = (
  handler: typeof handleSnapshotUpload,
  path: string,
  query: Record<string, string>,
  body: Uint8Array | string,
  type: string,
  method = 'POST',
) =>
  handler(
    store,
    new Request(`${base}${path}?${new URLSearchParams(query)}`, {
      method,
      headers: { 'content-type': type },
      ...(method === 'POST' ? { body } : {}),
    }),
  );
const snap = (query: Record<string, string>, body: Uint8Array | string, type = 'image/png') =>
  post(handleSnapshotUpload, '/api/orb-asset/snapshot', query, body, type);
const exp = (query: Record<string, string>, body: Uint8Array | string, type = 'application/pdf') =>
  post(handleExportUpload, '/api/orb-asset/export', query, body, type);

describe('POST /api/orb-asset/snapshot', () => {
  it('stores a design card snapshot as assets/snapshots/<card>-v<n>-<capturedAt>.png, served back by the file route', async () => {
    const png = makePng(16, 8);
    const res = await snap({ canvas: canvas.id, card: designId, version: '3' }, png);
    expect(res.status).toBe(200);
    const body = SnapshotUploadResult.parse(await res.json());
    if (!body.ok) throw new Error(body.error.message);
    expect(body.snapshot).toEqual({
      path: `assets/snapshots/${designId}-v3-${now}.png`,
      cardId: designId,
      version: 3,
      capturedAt: now,
      size: png.length,
    });
    expect(snapshotCapturedAt(body.snapshot.path)).toBe(now);
    const file = join(store.dirOf(canvas.id), body.snapshot.path);
    expect(readFileSync(file)).toEqual(png);
    // No temp file left behind.
    expect(readdirSync(join(store.dirOf(canvas.id), 'assets', 'snapshots'))).toEqual([
      `${designId}-v3-${now}.png`,
    ]);

    const get = await handleAssetFile(
      store,
      new Request(
        `${base}/api/orb-asset/file?${new URLSearchParams({ canvas: canvas.id, path: body.snapshot.path })}`,
      ),
    );
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await get.arrayBuffer())).toEqual(png);
  });

  it('refuses a card that is not a design card, a bad version, a non-PNG body or type, and a missing canvas', async () => {
    const png = makePng(4, 4);
    const codes = async (res: Response) => {
      const body = SnapshotUploadResult.parse(await res.json());
      return [res.status, body.ok ? 'ok' : body.error.code];
    };
    expect(await codes(await snap({ canvas: canvas.id, card: noteId, version: '1' }, png))).toEqual([
      404,
      'orb/not-found',
    ]);
    expect(await codes(await snap({ canvas: canvas.id, card: designId, version: '0' }, png))).toEqual([
      400,
      'orb/invalid-args',
    ]);
    expect(await codes(await snap({ canvas: canvas.id, card: '../x', version: '1' }, png))).toEqual([
      400,
      'orb/invalid-args',
    ]);
    expect(await codes(await snap({ canvas: canvas.id, card: designId, version: '1' }, 'not a png'))).toEqual(
      [415, 'orb/unsupported-type'],
    );
    expect(
      await codes(await snap({ canvas: canvas.id, card: designId, version: '1' }, png, 'image/jpeg')),
    ).toEqual([415, 'orb/unsupported-type']);
    expect(await codes(await snap({ canvas: 'Bad Id', card: designId, version: '1' }, png))).toEqual([
      400,
      'orb/invalid-args',
    ]);
    expect(
      await codes(await snap({ canvas: canvas.id, card: designId, version: '1' }, new Uint8Array())),
    ).toEqual([400, 'orb/invalid-args']);
    const get = await post(
      handleSnapshotUpload,
      '/api/orb-asset/snapshot',
      { canvas: canvas.id },
      '',
      'image/png',
      'GET',
    );
    expect(get.status).toBe(405);
  });

  it('refuses to write through a symlinked snapshots folder, and the file route will not serve through one', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'orb-host-print-out-'));
    try {
      const assets = join(store.dirOf(canvas.id), 'assets');
      mkdirSync(assets, { recursive: true });
      symlinkSync(outside, join(assets, 'snapshots'));
      const name = `${designId}-v1-${now}.png`;
      writeFileSync(join(outside, name), makePng(2, 2));
      const res = await snap({ canvas: canvas.id, card: designId, version: '1' }, makePng(2, 2));
      expect(res.status).toBe(400);
      const get = await handleAssetFile(
        store,
        new Request(
          `${base}/api/orb-asset/file?${new URLSearchParams({ canvas: canvas.id, path: `assets/snapshots/${name}` })}`,
        ),
      );
      expect(get.status).toBe(404);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('POST /api/orb-asset/export', () => {
  it('stores the PDF in exports/ with a timestamped name and answers its absolute file; a clash gets a suffix', async () => {
    const pdf = makePdf(2);
    const first = ExportUploadResult.parse(
      await (await exp({ canvas: canvas.id, kind: 'canvas' }, pdf)).json(),
    );
    const second = ExportUploadResult.parse(
      await (await exp({ canvas: canvas.id, kind: 'canvas' }, pdf)).json(),
    );
    const doc = ExportUploadResult.parse(await (await exp({ canvas: canvas.id, kind: 'doc' }, pdf)).json());
    if (!first.ok || !second.ok || !doc.ok) throw new Error('export refused');
    expect(first.export.path).toBe(`exports/${exportFileName('canvas', now)}`);
    expect(first.export.path).toMatch(/^exports\/canvas-2026-10-14-\d{6}\.pdf$/);
    expect(second.export.path).toBe(`exports/${exportFileName('canvas', now, 2)}`);
    expect(doc.export.path).toMatch(/^exports\/document-2026-10-14-\d{6}\.pdf$/);
    expect(first.export.file).toBe(join(store.dirOf(canvas.id), first.export.path));
    expect(first.export).toMatchObject({ kind: 'canvas', size: pdf.length, at: now });
    expect(readFileSync(first.export.file)).toEqual(pdf);
    expect(readdirSync(join(store.dirOf(canvas.id), 'exports')).sort()).toEqual(
      [first, second, doc].map((r) => (r.ok ? r.export.path.slice('exports/'.length) : '')).sort(),
    );
  });

  it('refuses a body that is not a PDF, a wrong type, an unknown kind', async () => {
    const res1 = await exp({ canvas: canvas.id, kind: 'canvas' }, 'hello');
    expect(res1.status).toBe(415);
    const res2 = await exp({ canvas: canvas.id, kind: 'canvas' }, makePdf(1), 'text/plain');
    expect(res2.status).toBe(415);
    const res3 = await exp({ canvas: canvas.id, kind: 'poster' }, makePdf(1));
    expect(res3.status).toBe(400);
    const res4 = await exp({ canvas: 'no-such-canvas', kind: 'canvas' }, makePdf(1));
    expect(res4.status).toBe(404);
  });
});
