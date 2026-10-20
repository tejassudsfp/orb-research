/**
 * Dataset routes (P6.3): exact Fetch routes on the gateway's authenticated `/api` channel, like the asset routes
 * (assets.ts). The renderer never writes a file: an import, an edit and a Table promote come in here, and the canvas
 * service (orb-canvas `DatasetService`) is the only writer of `assets/data/`.
 *
 * - `POST /api/orb-data/import?canvas=<id>&name=<file or title>[&format=csv|json|xlsx|text]`: the raw bytes (up to
 *   10 MB: CSV, JSON, XLSX, TSV or pasted text); answers `DatasetMetaResult`.
 * - `GET /api/orb-data/dataset?canvas=<id>&id=<d_…>`: the dataset JSON (never cached).
 * - `POST /api/orb-data/edit?canvas=<id>&id=<d_…>` with `{edit: DatasetEdit}`; answers the new `rev`.
 * - `POST /api/orb-data/from-table?canvas=<id>&card=<c_…>`: makes the dataset of a Table card and answers the card data
 *   and view that make it a Database card (the UI sends the change as an ordinary, undoable `card.updated`).
 */
import type { CanvasStore } from '@orb/canvas';
import { IMPORT_MAX_BYTES, isCanvasError } from '@orb/canvas';
import {
  CanvasId,
  DATA_EDIT_PATH,
  DATA_IMPORT_PATH,
  DATA_PROMOTE_PATH,
  DATA_READ_PATH,
  DatasetEdit,
  DatasetId,
  OrbErrorCode,
  importFormatOf,
  type ImportFormat,
} from '@orb/shared';

export { DATA_EDIT_PATH, DATA_IMPORT_PATH, DATA_PROMOTE_PATH, DATA_READ_PATH };

const STATUS: Record<string, number> = {
  [OrbErrorCode.invalidArgs]: 400,
  [OrbErrorCode.notFound]: 404,
  [OrbErrorCode.tooLarge]: 413,
  [OrbErrorCode.unsupportedType]: 415,
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const fail = (code: string, message: string) => json({ ok: false, error: { code, message } }, STATUS[code] ?? 500);
const methodNot = (allow: string) => new Response(null, { status: 405, headers: { allow } });

/** Read a request body up to `max` bytes (null when it is larger). */
async function readCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        // Read and drop the rest (a bounded amount) so the client gets the answer instead of a reset.
        await reader.cancel().catch(() => undefined);
        return null;
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

const canvasOf = (url: URL) => CanvasId.safeParse(url.searchParams.get('canvas'));

function failed(err: unknown): Response {
  if (isCanvasError(err)) return fail(err.code, err.message);
  throw err;
}

/** `POST /api/orb-data/import`. */
export async function handleDataImport(store: CanvasStore, request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNot('POST');
  const url = new URL(request.url);
  const canvas = canvasOf(url);
  const name = url.searchParams.get('name');
  if (!canvas.success || !name || name.length > 1024) return fail(OrbErrorCode.invalidArgs, 'canvas and name are required');
  const declared = request.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > IMPORT_MAX_BYTES)
    return fail(OrbErrorCode.tooLarge, `the file is larger than ${IMPORT_MAX_BYTES / (1024 * 1024)} MB`);
  const mime = request.headers.get('content-type') ?? '';
  const asked = url.searchParams.get('format');
  const format: ImportFormat | undefined =
    asked === 'csv' || asked === 'json' || asked === 'xlsx' || asked === 'text' ? asked : importFormatOf(name, mime);
  if (!format) return fail(OrbErrorCode.unsupportedType, 'orb imports CSV, JSON, XLSX and text data');
  const bytes = await readCapped(request.body, IMPORT_MAX_BYTES);
  if (!bytes) return fail(OrbErrorCode.tooLarge, `the file is larger than ${IMPORT_MAX_BYTES / (1024 * 1024)} MB`);
  try {
    const dataset = await store.datasets.import(canvas.data, { name, mime, format, bytes });
    return json({ ok: true, dataset });
  } catch (err) {
    return failed(err);
  }
}

/** `GET /api/orb-data/dataset`. */
export async function handleDataRead(store: CanvasStore, request: Request): Promise<Response> {
  if (request.method !== 'GET') return methodNot('GET');
  const url = new URL(request.url);
  const canvas = canvasOf(url);
  const id = DatasetId.safeParse(url.searchParams.get('id'));
  if (!canvas.success || !id.success) return new Response('bad request', { status: 400 });
  try {
    const ds = await store.datasets.read(canvas.data, id.data);
    return new Response(JSON.stringify(ds), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "sandbox; default-src 'none'",
      },
    });
  } catch (err) {
    if (isCanvasError(err)) return new Response('not found', { status: STATUS[err.code] ?? 404 });
    throw err;
  }
}

/** `POST /api/orb-data/edit`. */
export async function handleDataEdit(store: CanvasStore, request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNot('POST');
  const url = new URL(request.url);
  const canvas = canvasOf(url);
  const id = DatasetId.safeParse(url.searchParams.get('id'));
  if (!canvas.success || !id.success) return fail(OrbErrorCode.invalidArgs, 'canvas and id are required');
  const bytes = await readCapped(request.body, 1024 * 1024);
  if (!bytes) return fail(OrbErrorCode.tooLarge, 'the edit is too large');
  let edit;
  try {
    edit = DatasetEdit.parse((JSON.parse(new TextDecoder().decode(bytes)) as { edit?: unknown }).edit);
  } catch {
    return fail(OrbErrorCode.invalidArgs, 'the body must be {"edit": <dataset edit>}');
  }
  try {
    const ds = await store.datasets.edit(canvas.data, id.data, edit, { kind: 'user' });
    return json({ ok: true, rev: ds.rev, rowCount: ds.rows.length });
  } catch (err) {
    return failed(err);
  }
}

/** `POST /api/orb-data/from-table`: the dataset made from a Table card, and the data and view that turn it into a Database card. */
export async function handleDataPromote(store: CanvasStore, request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNot('POST');
  const url = new URL(request.url);
  const canvas = canvasOf(url);
  const card = url.searchParams.get('card') ?? '';
  if (!canvas.success || !/^c_[A-Za-z0-9_-]{1,64}$/.test(card))
    return fail(OrbErrorCode.invalidArgs, 'canvas and card are required');
  try {
    const made = await store.tableToDatabase(canvas.data, card);
    return json({ ok: true, ...made });
  } catch (err) {
    return failed(err);
  }
}

/** Register the dataset routes on the connection (call inside `ctx.inject(['connection'], …)`). */
export function registerDataRoutes(ctx: any, store: CanvasStore): void {
  const routes = [
    { path: DATA_IMPORT_PATH, methods: ['POST'], requestBody: 'streaming', fetch: handleDataImport, label: 'import' },
    { path: DATA_READ_PATH, methods: ['GET'], requestBody: 'buffered', fetch: handleDataRead, label: 'read' },
    { path: DATA_EDIT_PATH, methods: ['POST'], requestBody: 'streaming', fetch: handleDataEdit, label: 'edit' },
    { path: DATA_PROMOTE_PATH, methods: ['POST'], requestBody: 'buffered', fetch: handleDataPromote, label: 'promote' },
  ] as const;
  for (const r of routes) {
    ctx.effect(
      () =>
        ctx.connection.fetch.register({
          path: r.path,
          methods: [...r.methods],
          requestBody: r.requestBody,
          fetch: (request: Request) => r.fetch(store, request),
        }),
      `orb-host: dataset ${r.label} route`,
    );
  }
}
