/**
 * Print pipeline helpers (BUILD_PLAN P4.4) that need no Electron, so they are unit-tested under plain Node
 * (test/print.test.ts): the print window's URL, the check of a path the renderer asks to reveal, and a timeout.
 */
import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { ExportPath, parsePrintRoute, printRoute, type PrintRequest } from '@orb/shared';

/**
 * The URL the hidden print window loads for a print route (`/print/canvas?…` or `/print/doc?…`), on the sidecar
 * origin. The route is parsed and written again, so only the known keys and values reach the window.
 */
export function printUrl(origin: string, route: unknown): { url: string; request: PrintRequest } {
  if (typeof route !== 'string' || route.length > 8192) throw new Error('invalid print route');
  const request = parsePrintRoute(route);
  if (!request) throw new Error('invalid print route');
  const o = new URL(origin);
  if (o.protocol !== 'http:' || o.hostname !== '127.0.0.1') throw new Error('invalid sidecar origin');
  return { url: `${o.origin}/#${printRoute(request)}`, request };
}

const real = (p: string): string => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};

/**
 * True when `file` is an exported PDF of a canvas under `orbHome`: `<orbHome>/canvases/<canvas>/exports/<name>.pdf`
 * with an export name (ExportPath), an existing regular file. Reveal in Finder shows nothing else.
 */
export function isRevealableExport(file: unknown, orbHome: string): file is string {
  if (typeof file !== 'string' || file.length === 0 || file.length > 4096 || !file.startsWith('/'))
    return false;
  const abs = real(file);
  const exportsDir = dirname(abs);
  const canvasDir = dirname(exportsDir);
  const canvasesDir = dirname(canvasDir);
  if (basename(exportsDir) !== 'exports' || basename(canvasesDir) !== 'canvases') return false;
  if (real(dirname(canvasesDir)) !== real(orbHome)) return false;
  if (!ExportPath.safeParse(`exports/${basename(abs)}`).success) return false;
  if (!abs.startsWith(real(orbHome) + sep)) return false;
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

/** `p`, or a rejection with `message` after `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolvePromise, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolvePromise(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** Page objects in a PDF Chromium wrote (its page dictionaries are not in object streams). */
export function countPdfPages(pdf: Uint8Array): number {
  const text = Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength).toString('latin1');
  return (text.match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
}
