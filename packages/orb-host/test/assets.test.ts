/**
 * P2.5 asset route handlers (orb-host), called with WHATWG Requests: upload status codes and JSON, streamed bodies,
 * read-back headers. Auth and the Origin fence are the gateway's (proven against a real sidecar in
 * apps/ui/test/assets.contract.test.ts).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CanvasStore } from '@orb/canvas';
import { AssetUploadResult, type CanvasMeta } from '@orb/shared';
import { handleAssetFile, handleAssetUpload } from '../src/assets.js';
import { makePdf, makePng } from '../../../scripts/testkit/fixtures.js';

let home: string;
let store: CanvasStore;
let canvas: CanvasMeta;
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-host-assets-'));
  store = new CanvasStore({ home });
  canvas = await store.create({ prompt: 'routes' });
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

type Body = NonNullable<RequestInit['body']>;
const base = 'http://127.0.0.1:1';
const upload = (query: Record<string, string>, body: Body | null, type: string, method = 'POST') =>
  handleAssetUpload(
    store,
    new Request(`${base}/api/orb-asset/upload?${new URLSearchParams(query)}`, {
      method,
      headers: { 'content-type': type },
      ...(body !== null ? { body, duplex: 'half' } : {}),
    } as RequestInit),
  );
const result = async (res: Response) => AssetUploadResult.parse(await res.json());

describe('POST /api/orb-asset/upload', () => {
  it('stores a streamed PNG and answers its reference; GET returns the same bytes with safe headers', async () => {
    const png = makePng(8, 8);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(png.subarray(0, 10));
        c.enqueue(png.subarray(10));
        c.close();
      },
    });
    const res = await upload({ canvas: canvas.id, name: 'dot.png' }, stream, 'image/png');
    expect(res.status).toBe(200);
    const body = await result(res);
    if (!body.ok) throw new Error(body.error.message);
    expect(body.asset).toMatchObject({ name: 'dot.png', mime: 'image/png', size: png.length });

    const get = await handleAssetFile(
      store,
      new Request(
        `${base}/api/orb-asset/file?${new URLSearchParams({ canvas: canvas.id, path: body.asset.path })}`,
      ),
    );
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type')).toBe('image/png');
    expect(get.headers.get('x-content-type-options')).toBe('nosniff');
    expect(get.headers.get('content-security-policy')).toContain('sandbox');
    expect(Buffer.from(await get.arrayBuffer())).toEqual(png);

    const head = await handleAssetFile(
      store,
      new Request(
        `${base}/api/orb-asset/file?${new URLSearchParams({ canvas: canvas.id, path: body.asset.path })}`,
        {
          method: 'HEAD',
        },
      ),
    );
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String(png.length));
  });

  it('answers 400/404/413/415/405 with a JSON error', async () => {
    const cases: [Record<string, string>, Body | null, string, number, string, string?][] = [
      [{ name: 'a.png' }, makePng(1, 1), 'image/png', 400, 'orb/invalid-args'],
      [{ canvas: canvas.id }, makePng(1, 1), 'image/png', 400, 'orb/invalid-args'],
      [{ canvas: '2026-01-01-none', name: 'a.png' }, makePng(1, 1), 'image/png', 404, 'orb/not-found'],
      [{ canvas: canvas.id, name: 'a.svg' }, '<svg/>', 'image/svg+xml', 415, 'orb/unsupported-type'],
      [{ canvas: canvas.id, name: 'a.pdf' }, 'not a pdf', 'application/pdf', 415, 'orb/unsupported-type'],
      [
        { canvas: canvas.id, name: 'a.txt' },
        'x'.repeat(5 * 1024 * 1024 + 1),
        'text/plain',
        413,
        'orb/too-large',
      ],
      [{ canvas: canvas.id, name: 'a.txt' }, '', 'text/plain', 400, 'orb/invalid-args'],
    ];
    for (const [query, body, type, status, code] of cases) {
      const res = await upload(query, body, type);
      expect(res.status, JSON.stringify(query)).toBe(status);
      const r = await result(res);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe(code);
    }
    expect((await upload({ canvas: canvas.id, name: 'a.pdf' }, null, 'application/pdf', 'GET')).status).toBe(
      405,
    );
  });

  it('GET refuses paths outside assets/ and unknown files', async () => {
    const res = await upload({ canvas: canvas.id, name: 'p.pdf' }, makePdf(1), 'application/pdf');
    expect(res.status).toBe(200);
    for (const [path, status] of [
      ['assets/../canvas.json', 400],
      ['board.jsonl', 400],
      ['assets/missing.pdf', 404],
    ] as const) {
      const r = await handleAssetFile(
        store,
        new Request(`${base}/api/orb-asset/file?${new URLSearchParams({ canvas: canvas.id, path })}`),
      );
      expect(r.status, path).toBe(status);
    }
    const noCanvas = await handleAssetFile(
      store,
      new Request(`${base}/api/orb-asset/file?path=assets/x.pdf`),
    );
    expect(noCanvas.status).toBe(400);
  });
});
