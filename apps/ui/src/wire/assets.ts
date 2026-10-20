/**
 * Canvas assets over the authenticated gateway (P2.5; host side packages/orb-host/src/assets.ts). The renderer never
 * writes to disk: a dropped or pasted file is POSTed as raw bytes to `api/orb-asset/upload`, and orb-host's canvas
 * service copies it into `<canvas>/assets/`. Stored files are read back through `api/orb-asset/file` (same origin,
 * so the auth cookie rides along on `<img src>` and `fetch`).
 */
import {
  ASSET_FILE_PATH,
  ASSET_UPLOAD_PATH,
  AssetUploadResult,
  DESIGN_FRAME_PATH,
  EXPORT_UPLOAD_PATH,
  ExportUploadResult,
  SNAPSHOT_UPLOAD_PATH,
  SnapshotUploadResult,
  designFrameQuery,
  type AssetMime,
  type AssetRef,
  type ExportRef,
  type PrintKind,
  type SnapshotRef,
} from '@orb/shared';
import type { ZodType } from 'zod';
import type { WireEnv } from './env.js';
import { TransportCode, WireError } from './protocol.js';

const rel = (path: string) => path.replace(/^\//, '');

export type AssetsApi = ReturnType<typeof assetsApi>;

type Uploaded<K extends string, T> =
  ({ ok: true } & Record<K, T>) | { ok: false; error: { code: string; message: string } };

/** POST raw bytes to an upload route and parse its JSON answer (P4.4 snapshot and export uploads). */
async function postBytes<K extends string, T>(
  env: WireEnv,
  path: string,
  params: Record<string, string>,
  mime: string,
  body: Blob | ArrayBuffer | Uint8Array,
  schema: ZodType<Uploaded<K, T>>,
  key: K,
  what: string,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(rel(path), env.baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let response: Response;
  try {
    response = await env.fetch(url.href, {
      method: 'POST',
      headers: { 'content-type': mime },
      body: body as BodyInit,
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    throw new WireError(
      signal?.aborted ? TransportCode.aborted : TransportCode.network,
      `${what} failed: ${(cause as Error)?.message ?? 'network error'}`,
      {},
      !signal?.aborted,
      { cause },
    );
  }
  let parsed: Uploaded<K, T> | undefined;
  try {
    parsed = schema.parse(await response.json());
  } catch {
    parsed = undefined;
  }
  if (!parsed) {
    throw new WireError(
      response.status === 401 ? TransportCode.unauthorized : TransportCode.http,
      `${what} failed (HTTP ${response.status})`,
      { status: response.status },
    );
  }
  if (!parsed.ok) throw new WireError(parsed.error.code, parsed.error.message, { status: response.status });
  return (parsed as Record<K, T>)[key];
}

export function assetsApi(env: WireEnv) {
  return {
    /** P4.4: store a design-frame snapshot (PNG) in the canvas's `assets/snapshots/`. */
    uploadSnapshot: (
      canvasId: string,
      snap: { cardId: string; version: number; png: Uint8Array },
      signal?: AbortSignal,
    ): Promise<SnapshotRef> =>
      postBytes(
        env,
        SNAPSHOT_UPLOAD_PATH,
        { canvas: canvasId, card: snap.cardId, version: String(snap.version) },
        'image/png',
        snap.png,
        SnapshotUploadResult as ZodType<Uploaded<'snapshot', SnapshotRef>>,
        'snapshot',
        'snapshot upload',
        signal,
      ),
    /** P4.4: store an exported PDF in the canvas's `exports/` (timestamped name; answers its path and file). */
    uploadExport: (
      canvasId: string,
      kind: PrintKind,
      pdf: Uint8Array,
      signal?: AbortSignal,
    ): Promise<ExportRef> =>
      postBytes(
        env,
        EXPORT_UPLOAD_PATH,
        { canvas: canvasId, kind },
        'application/pdf',
        pdf,
        ExportUploadResult as ZodType<Uploaded<'export', ExportRef>>,
        'export',
        'saving the PDF',
        signal,
      ),

    /** Upload one file into the canvas's assets/. Rejects with a WireError (`orb/too-large`, `orb/unsupported-type`…). */
    async upload(
      canvasId: string,
      file: { name: string; mime: AssetMime; body: Blob | ArrayBuffer | Uint8Array },
      signal?: AbortSignal,
    ): Promise<AssetRef> {
      const url = new URL(rel(ASSET_UPLOAD_PATH), env.baseUrl);
      url.searchParams.set('canvas', canvasId);
      url.searchParams.set('name', file.name);
      let response: Response;
      try {
        response = await env.fetch(url.href, {
          method: 'POST',
          headers: { 'content-type': file.mime },
          body: file.body as BodyInit,
          ...(signal ? { signal } : {}),
        });
      } catch (cause) {
        throw new WireError(
          signal?.aborted ? TransportCode.aborted : TransportCode.network,
          `upload of ${file.name} failed: ${(cause as Error)?.message ?? 'network error'}`,
          {},
          !signal?.aborted,
          { cause },
        );
      }
      let parsed: AssetUploadResult | undefined;
      try {
        parsed = AssetUploadResult.parse(await response.json());
      } catch {
        parsed = undefined;
      }
      if (!parsed) {
        throw new WireError(
          response.status === 401 ? TransportCode.unauthorized : TransportCode.http,
          `upload of ${file.name} failed (HTTP ${response.status})`,
          { status: response.status },
        );
      }
      if (!parsed.ok)
        throw new WireError(parsed.error.code, parsed.error.message, { status: response.status });
      return parsed.asset;
    },

    /** Same-origin URL of a stored asset (for `<img src>`, pdf.js and fetch). */
    url(canvasId: string, asset: Pick<AssetRef, 'path'>): string {
      const url = new URL(rel(ASSET_FILE_PATH), env.baseUrl);
      url.searchParams.set('canvas', canvasId);
      url.searchParams.set('path', asset.path);
      return url.href;
    },

    /**
     * P6.2: same-origin URL of a design frame's own page (served by orb-host with the frame's CSP, scripts allowed,
     * no network). `version` keys the page to the card's current HTML; `print` turns animations off for snapshots.
     */
    designFrameUrl(canvasId: string, cardId: string, version: number, options: { print?: boolean } = {}): string {
      const url = new URL(rel(DESIGN_FRAME_PATH), env.baseUrl);
      url.search = designFrameQuery(canvasId, cardId, version, options);
      return url.href;
    },
  };
}
