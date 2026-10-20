/**
 * P2.5 contract test against a REAL sidecar: assets go through orb-host's routes on the authenticated gateway.
 * - the UI's wire uploads a PNG, a PDF and a CSV; the files land in `<canvas>/assets/` byte for byte, and read back
 *   through `api/orb-asset/file`;
 * - without the auth cookie the gateway answers 401, with a foreign Origin 403 (the connection's admit fence), and
 *   nothing is stored;
 * - type, size and path checks hold over the wire;
 * - image, file and table cards that point at the uploads persist (board.jsonl) and `card.opened` is written once.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fold, tableFromCsv, type BoardEvent } from '@orb/shared';
import { makePdf, makePng, startSidecar, type TestSidecar } from '../../../scripts/testkit/index.ts';
import { WireError, createWire, type Wire } from '../src/wire/index.js';

let sc: TestSidecar;
let wire: Wire;
let canvasId: string;

beforeAll(async () => {
  sc = await startSidecar();
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  canvasId = (await wire.orb.canvas.create({ prompt: 'Assets contract' })).id;
}, 120_000);
afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
});

const assetsDir = () => join(sc.paths.orbHome, 'canvases', canvasId, 'assets');
const stored = () => readdirSync(assetsDir()).sort();

describe('assets over the gateway', () => {
  it('uploads files into assets/ and reads them back through the authenticated route', async () => {
    const png = makePng(16, 9);
    const pdf = makePdf(3);
    const csv = Buffer.from('name,score\nAda,3\nBob,10\n');
    const a = await wire.assets.upload(canvasId, {
      name: 'chart.png',
      mime: 'image/png',
      body: new Blob([new Uint8Array(png)]),
    });
    const b = await wire.assets.upload(canvasId, {
      name: 'paper.pdf',
      mime: 'application/pdf',
      body: new Uint8Array(pdf),
    });
    const c = await wire.assets.upload(canvasId, {
      name: 'scores.csv',
      mime: 'text/csv',
      body: new Blob([new Uint8Array(csv)]),
    });
    expect(stored()).toEqual([a.path, b.path, c.path].map((p) => p.slice(7)).sort());
    expect(readFileSync(join(sc.paths.orbHome, 'canvases', canvasId, b.path))).toEqual(pdf);

    const res = await sc.fetch(wire.assets.url(canvasId, a), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(png);

    // Cards that point at the uploads persist, and an open is recorded once.
    const add = await wire.orb.board.command(canvasId, {
      type: 'batch',
      commands: [
        {
          type: 'card.added',
          card: { type: 'image', x: 0, y: 0, w: 320, h: 240, data: { asset: a, title: 'chart' } },
        },
        {
          type: 'card.added',
          card: { type: 'file', x: 400, y: 0, w: 260, h: 380, data: { asset: b, title: 'paper', pages: 3 } },
        },
        {
          type: 'card.added',
          card: {
            type: 'table',
            x: 0,
            y: 400,
            w: 520,
            h: 320,
            data: tableFromCsv(csv.toString(), 'scores', c),
          },
        },
      ],
    });
    const fileId = (add.events[1]!.data as { card: { id: string } }).card.id;
    await wire.orb.board.command(canvasId, { type: 'card.opened', id: fileId });
    const again = await wire.orb.board.command(canvasId, { type: 'card.opened', id: fileId });
    expect(again.events).toEqual([]);
    const readLog = () =>
      readFileSync(join(sc.paths.orbHome, 'canvases', canvasId, 'board.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as BoardEvent);
    // The log is flushed within 250 ms.
    await expect.poll(() => readLog().filter((e) => e.type === 'card.opened').length).toBe(1);
    const log = readLog();
    const board = fold(log);
    expect(board.cards[fileId]).toMatchObject({ type: 'file', opened: true, data: { asset: b, pages: 3 } });

    // Card data that does not match its type is refused by the service.
    await expect(
      wire.orb.board.command(canvasId, {
        type: 'card.added',
        card: {
          type: 'image',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          data: { asset: { ...a, path: 'assets/../canvas.json' }, title: 'x' },
        },
      }),
    ).rejects.toMatchObject({ code: 'orb/invalid-args' });
  });

  it('refuses requests without the auth cookie (401) or from another origin (403); nothing is stored', async () => {
    const before = stored();
    const url = `${sc.origin}/api/orb-asset/upload?canvas=${canvasId}&name=x.png`;
    const anon = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: new Uint8Array(makePng(1, 1)),
    });
    expect(anon.status).toBe(401);
    const foreign = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'image/png', cookie: sc.headers.cookie!, origin: 'https://evil.example' },
      body: new Uint8Array(makePng(1, 1)),
    });
    expect(foreign.status).toBe(403);
    const readAnon = await fetch(
      `${sc.origin}/api/orb-asset/file?canvas=${canvasId}&path=assets/${before[0]}`,
    );
    expect(readAnon.status).toBe(401);
    expect(stored()).toEqual(before);
  });

  it('keeps the type, size and path checks over the wire', async () => {
    const before = stored();
    const svg = wire.assets.upload(canvasId, {
      name: 'x.svg',
      mime: 'image/svg+xml' as 'image/png',
      body: new Blob(['<svg/>']),
    });
    await expect(svg).rejects.toBeInstanceOf(WireError);
    await expect(svg).rejects.toMatchObject({ code: 'orb/unsupported-type' });
    await expect(
      wire.assets.upload(canvasId, {
        name: 'fake.png',
        mime: 'image/png',
        body: new Blob(['GIF89a not a png']),
      }),
    ).rejects.toMatchObject({ code: 'orb/unsupported-type' });
    await expect(
      wire.assets.upload(canvasId, {
        name: 'big.md',
        mime: 'text/markdown',
        body: new Blob([new Uint8Array(5 * 1024 * 1024 + 1).fill(0x61)]),
      }),
    ).rejects.toMatchObject({ code: 'orb/too-large' });
    expect(stored()).toEqual(before);
    for (const path of ['assets/../canvas.json', 'board.jsonl', '../../dsh/settings.yaml']) {
      const res = await sc.fetch(
        `${sc.origin}/api/orb-asset/file?${new URLSearchParams({ canvas: canvasId, path })}`,
        {},
      );
      expect(res.status, path).toBe(400);
    }
  });
});
