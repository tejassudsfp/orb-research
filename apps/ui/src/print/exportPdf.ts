/**
 * Export a print route to PDF (BUILD_PLAN P4.4): `window.orbNative.exportPdf(route)` prints it in a hidden window
 * and hands back the bytes; the canvas service stores them in the canvas's `exports/` under a timestamped name
 * (orb-host export route). Resolves with where the file is, for Reveal in Finder.
 */
import { printRoute, type ExportRef, type PrintRequestInput } from '@orb/shared';
import type { Wire } from '../wire/index.js';
import { orbNative } from './native.js';

export type ExportResult = {
  export: ExportRef;
  pages: number;
  expectedPages: number;
  cardTypes: Record<string, number>;
  snapshots: number;
  /** Print time in the main process (hidden window to PDF bytes). */
  printMs: number;
  /** From the call to the stored file. */
  totalMs: number;
};

export const canExport = (): boolean => typeof orbNative()?.exportPdf === 'function';

export async function exportPdf(
  wire: Wire,
  request: PrintRequestInput,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const started = performance.now();
  const native = orbNative();
  if (!native?.exportPdf) throw new Error('Exporting a PDF needs the orb app.');
  const result = await native.exportPdf(printRoute(request));
  if (!result.ok) throw new Error(result.error);
  signal?.throwIfAborted();
  const ref = await wire.assets.uploadExport(request.canvasId, request.kind, result.data, signal);
  return {
    export: ref,
    pages: result.pages,
    expectedPages: result.expectedPages,
    cardTypes: result.cardTypes,
    snapshots: result.snapshots,
    printMs: result.ms,
    totalMs: Math.round(performance.now() - started),
  };
}

/** Reveal an exported file in Finder. */
export const revealExport = (file: string): Promise<boolean> =>
  orbNative()?.reveal?.(file) ?? Promise.resolve(false);
