/**
 * Asset routes (BUILD_PLAN P2.5): exact Fetch routes on the gateway's authenticated `/api` channel
 * (`ctx.connection.fetch.register`, dsh-client-connection/lib/index.js:597-639). The connection admits a request
 * only after its Host/Origin fence and the browser auth cookie (`admit`, :591), exactly as for `/api/orb/*` RPCs,
 * so the routes need no auth of their own.
 *
 * - `POST /api/orb-asset/upload?canvas=<id>&name=<file name>` with `content-type: <asset type>` and the raw bytes
 *   as a STREAMED body (`requestBody: 'streaming'`: the gateway does not buffer it). The canvas service checks
 *   type, size and bytes and copies the file into `<canvas>/assets/`. Answers `AssetUploadResult` JSON.
 * - `GET|HEAD /api/orb-asset/file?canvas=<id>&path=assets/<name>`: the stored file, `nosniff`, sandboxed, cached
 *   (stored names never change). P4.4: also `assets/snapshots/<name>.png`.
 * - P4.4 print pipeline: `POST /api/orb-asset/snapshot?canvas=<id>&card=<cardId>&version=<n>` (`image/png`, a
 *   design-frame snapshot from the print window; answers `SnapshotUploadResult`) and
 *   `POST /api/orb-asset/export?canvas=<id>&kind=canvas|doc` (`application/pdf`, the printed PDF; answers
 *   `ExportUploadResult` with the file's absolute path for Reveal in Finder). Both stream the body.
 *
 * Harness-free: the handlers take a `CanvasStore` and a WHATWG Request, so tests call them directly.
 */
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { CanvasStore } from '@orb/canvas';
import { isCanvasError } from '@orb/canvas';
import {
  ASSET_FILE_PATH,
  ASSET_UPLOAD_PATH,
  CanvasId,
  EXPORT_UPLOAD_PATH,
  OrbErrorCode,
  PrintKind,
  SNAPSHOT_UPLOAD_PATH,
  type AssetUploadResult,
  type ExportUploadResult,
  type SnapshotUploadResult,
} from '@orb/shared';

export { ASSET_FILE_PATH, ASSET_UPLOAD_PATH, EXPORT_UPLOAD_PATH, SNAPSHOT_UPLOAD_PATH };

const STATUS: Record<string, number> = {
  [OrbErrorCode.invalidArgs]: 400,
  [OrbErrorCode.notFound]: 404,
  [OrbErrorCode.tooLarge]: 413,
  [OrbErrorCode.unsupportedType]: 415,
};

function json(result: AssetUploadResult | SnapshotUploadResult | ExportUploadResult, status = 200): Response {
  return new Response(JSON.stringify(result), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const fail = (code: string, message: string) =>
  json({ ok: false, error: { code, message } }, STATUS[code] ?? 500);

async function* chunks(body: ReadableStream<Uint8Array> | null): AsyncGenerator<Uint8Array> {
  if (!body) return;
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Most bytes of a refused upload read and dropped, so the client gets the JSON answer instead of a reset. */
const DRAIN_LIMIT = 64 * 1024 * 1024;

/**
 * Read and drop what is left of a refused upload's body (up to DRAIN_LIMIT): answering while the client is still
 * sending makes most HTTP clients report a network error instead of the response.
 */
async function drain(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body || body.locked) return;
  const reader = body.getReader();
  let seen = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      seen += value?.byteLength ?? 0;
      if (seen > DRAIN_LIMIT) {
        await reader.cancel();
        return;
      }
    }
  } catch {
    // the client went away
  } finally {
    reader.releaseLock();
  }
}

/** `POST /api/orb-asset/upload`. */
export async function handleAssetUpload(store: CanvasStore, request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const url = new URL(request.url);
  const canvas = CanvasId.safeParse(url.searchParams.get('canvas'));
  if (!canvas.success) {
    await drain(request.body);
    return fail(OrbErrorCode.invalidArgs, 'canvas is required');
  }
  const name = url.searchParams.get('name');
  if (!name || name.length > 1024) {
    await drain(request.body);
    return fail(OrbErrorCode.invalidArgs, 'name is required');
  }
  const declared = request.headers.get('content-length');
  const length = declared !== null && /^\d+$/.test(declared) ? Number(declared) : undefined;
  try {
    const asset = await store.writeAsset(canvas.data, {
      name,
      mime: request.headers.get('content-type') ?? '',
      data: chunks(request.body),
      ...(length !== undefined ? { length } : {}),
      signal: request.signal,
    });
    return json({ ok: true, asset });
  } catch (err) {
    if (isCanvasError(err)) {
      await drain(request.body);
      return fail(err.code, err.message);
    }
    if (request.signal.aborted) return fail(OrbErrorCode.invalidArgs, 'the upload was cancelled');
    throw err;
  }
}

/** `GET|HEAD /api/orb-asset/file`. */
export async function handleAssetFile(store: CanvasStore, request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  const url = new URL(request.url);
  const canvas = CanvasId.safeParse(url.searchParams.get('canvas'));
  const path = url.searchParams.get('path');
  if (!canvas.success || !path) return new Response('bad request', { status: 400 });
  let found;
  try {
    found = await store.assetFile(canvas.data, path);
  } catch (err) {
    if (isCanvasError(err)) return new Response('not found', { status: STATUS[err.code] ?? 404 });
    throw err;
  }
  const headers = {
    'content-type': found.mime.startsWith('text/') ? `${found.mime}; charset=utf-8` : found.mime,
    'content-length': String(found.size),
    'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'",
    'cache-control': 'private, max-age=31536000, immutable',
  };
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
  const stream = Readable.toWeb(createReadStream(found.file)) as unknown as ReadableStream<Uint8Array>;
  return new Response(stream, { status: 200, headers });
}

/** The common checks of the P4.4 uploads: method, canvas id and declared type. */
async function uploadPrelude(
  request: Request,
  mime: string,
): Promise<{ canvasId: string; url: URL } | Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const url = new URL(request.url);
  const canvas = CanvasId.safeParse(url.searchParams.get('canvas'));
  if (!canvas.success) {
    await drain(request.body);
    return fail(OrbErrorCode.invalidArgs, 'canvas is required');
  }
  const type = (request.headers.get('content-type') ?? '').split(';', 1)[0]!.trim().toLowerCase();
  if (type !== mime) {
    await drain(request.body);
    return fail(OrbErrorCode.unsupportedType, `expected ${mime}`);
  }
  return { canvasId: canvas.data, url };
}

async function uploadFailed(err: unknown, request: Request): Promise<Response> {
  if (isCanvasError(err)) {
    await drain(request.body);
    return fail(err.code, err.message);
  }
  if (request.signal.aborted) return fail(OrbErrorCode.invalidArgs, 'the upload was cancelled');
  throw err;
}

/** `POST /api/orb-asset/snapshot` (P4.4). */
export async function handleSnapshotUpload(store: CanvasStore, request: Request): Promise<Response> {
  const pre = await uploadPrelude(request, 'image/png');
  if (pre instanceof Response) return pre;
  const cardId = pre.url.searchParams.get('card') ?? '';
  const version = Number(pre.url.searchParams.get('version'));
  if (!/^c_[A-Za-z0-9_-]{1,64}$/.test(cardId) || !Number.isInteger(version) || version < 1) {
    await drain(request.body);
    return fail(OrbErrorCode.invalidArgs, 'card and version are required');
  }
  try {
    const snapshot = await store.writeSnapshot(pre.canvasId, {
      cardId,
      version,
      data: chunks(request.body),
      signal: request.signal,
    });
    return json({ ok: true, snapshot });
  } catch (err) {
    return uploadFailed(err, request);
  }
}

/** `POST /api/orb-asset/export` (P4.4). */
export async function handleExportUpload(store: CanvasStore, request: Request): Promise<Response> {
  const pre = await uploadPrelude(request, 'application/pdf');
  if (pre instanceof Response) return pre;
  const kind = PrintKind.safeParse(pre.url.searchParams.get('kind'));
  if (!kind.success) {
    await drain(request.body);
    return fail(OrbErrorCode.invalidArgs, 'kind must be canvas or doc');
  }
  try {
    const exported = await store.writeExport(pre.canvasId, {
      kind: kind.data,
      data: chunks(request.body),
      signal: request.signal,
    });
    return json({ ok: true, export: exported });
  } catch (err) {
    return uploadFailed(err, request);
  }
}

/** Register the asset routes on the connection (call inside `ctx.inject(['connection'], …)`). */
export function registerAssetRoutes(ctx: any, store: CanvasStore): void {
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ASSET_UPLOAD_PATH,
        methods: ['POST'],
        requestBody: 'streaming',
        fetch: (request: Request) => handleAssetUpload(store, request),
      }),
    'orb-host: asset upload route',
  );
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ASSET_FILE_PATH,
        methods: ['GET', 'HEAD'],
        requestBody: 'buffered',
        fetch: (request: Request) => handleAssetFile(store, request),
      }),
    'orb-host: asset file route',
  );
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: SNAPSHOT_UPLOAD_PATH,
        methods: ['POST'],
        requestBody: 'streaming',
        fetch: (request: Request) => handleSnapshotUpload(store, request),
      }),
    'orb-host: snapshot upload route',
  );
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: EXPORT_UPLOAD_PATH,
        methods: ['POST'],
        requestBody: 'streaming',
        fetch: (request: Request) => handleExportUpload(store, request),
      }),
    'orb-host: export upload route',
  );
}
