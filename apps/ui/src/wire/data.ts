/**
 * Datasets over the authenticated gateway (P6.3; host side packages/orb-host/src/data.ts). The renderer never writes
 * a file: imports, edits and the Table promote are POSTed to `api/orb-data/*`, and the canvas service writes
 * `assets/data/`. Rows are read back as one JSON document.
 */
import {
  DATA_EDIT_PATH,
  DATA_IMPORT_PATH,
  DATA_PROMOTE_PATH,
  DATA_READ_PATH,
  Dataset,
  DatasetEditResult,
  DatasetMetaResult,
  DatasetPromoteResult,
  type DatasetEdit,
  type ImportFormat,
} from '@orb/shared';
import type { ZodType } from 'zod';
import type { WireEnv } from './env.js';
import { TransportCode, WireError } from './protocol.js';

const rel = (path: string) => path.replace(/^\//, '');

type Answer = { ok: true } | { ok: false; error: { code: string; message: string } };

async function send<T extends Answer>(
  env: WireEnv,
  path: string,
  params: Record<string, string>,
  init: { body?: BodyInit; contentType?: string },
  schema: ZodType<T>,
  what: string,
): Promise<Extract<T, { ok: true }>> {
  const url = new URL(rel(path), env.baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let response: Response;
  try {
    response = await env.fetch(url.href, {
      method: 'POST',
      ...(init.contentType ? { headers: { 'content-type': init.contentType } } : {}),
      ...(init.body !== undefined ? { body: init.body } : {}),
    });
  } catch (cause) {
    throw new WireError(TransportCode.network, `${what} failed: ${(cause as Error)?.message ?? 'network error'}`, {}, true, {
      cause,
    });
  }
  let parsed: T | undefined;
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
  return parsed as Extract<T, { ok: true }>;
}

export type DataApi = ReturnType<typeof dataApi>;

export function dataApi(env: WireEnv) {
  return {
    /** Make a dataset from a file (CSV, JSON, XLSX, text) or pasted text. */
    async import(
      canvasId: string,
      input: { name: string; body: Blob | string; mime?: string; format?: ImportFormat },
    ) {
      const done = await send(
        env,
        DATA_IMPORT_PATH,
        { canvas: canvasId, name: input.name, ...(input.format ? { format: input.format } : {}) },
        { body: input.body, contentType: input.mime || (typeof input.body === 'string' ? 'text/plain' : 'application/octet-stream') },
        DatasetMetaResult,
        `import of ${input.name}`,
      );
      return done.dataset;
    },
    /** The whole dataset (fresh from disk). */
    async read(canvasId: string, datasetId: string, signal?: AbortSignal): Promise<Dataset> {
      const url = new URL(rel(DATA_READ_PATH), env.baseUrl);
      url.searchParams.set('canvas', canvasId);
      url.searchParams.set('id', datasetId);
      let response: Response;
      try {
        response = await env.fetch(url.href, signal ? { signal } : {});
      } catch (cause) {
        throw new WireError(TransportCode.network, 'could not load the data', {}, true, { cause });
      }
      if (!response.ok) throw new WireError(TransportCode.http, `could not load the data (HTTP ${response.status})`, { status: response.status });
      return Dataset.parse(await response.json());
    },
    /** One edit; answers the dataset's new rev and row count. */
    async edit(canvasId: string, datasetId: string, edit: DatasetEdit) {
      return send(
        env,
        DATA_EDIT_PATH,
        { canvas: canvasId, id: datasetId },
        { body: JSON.stringify({ edit }), contentType: 'application/json' },
        DatasetEditResult,
        'saving the data',
      );
    },
    /** Table card to Database card (one undoable change). */
    async promote(canvasId: string, cardId: string) {
      return send(
        env,
        DATA_PROMOTE_PATH,
        { canvas: canvasId, card: cardId },
        {},
        DatasetPromoteResult,
        'turning the table into a database',
      );
    },
  };
}
