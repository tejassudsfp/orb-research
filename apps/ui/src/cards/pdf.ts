/**
 * pdf.js in the renderer (BUILD_PLAN P2.5: File/PDF card thumbnail + page count). Loaded lazily (its own chunk),
 * with the worker bundled locally by Vite (`?url`: a file in dist/assets, same origin, so the CSP stays `'self'`).
 * WebAssembly decoders are off (`useWasm: false`, the CSP has no `wasm-unsafe-eval`); pdf.js then uses its JS
 * decoders. Nothing is fetched from the network: the bytes come from the dropped file or from orb-host's asset route.
 */
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type PdfJs = typeof import('pdfjs-dist');
let lib: Promise<PdfJs> | undefined;

function pdfjs(): Promise<PdfJs> {
  lib ??= import('pdfjs-dist').then((m) => {
    m.GlobalWorkerOptions.workerSrc = workerUrl;
    return m;
  });
  return lib;
}

/** The standard 14 fonts, bundled into dist/pdfjs/standard_fonts/ by vite.config.ts (same origin). */
const standardFontDataUrl = () => new URL('pdfjs/standard_fonts/', document.baseURI).href;

const options = () => ({
  useWasm: false,
  enableXfa: false,
  stopAtErrors: false,
  standardFontDataUrl: standardFontDataUrl(),
});

export type PdfDoc = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;

/** Open a PDF from bytes (the array is transferred to the worker: pass a copy if you still need it). */
export async function openPdf(data: Uint8Array): Promise<PdfDoc> {
  const m = await pdfjs();
  return m.getDocument({ data, ...options() }).promise;
}

/** Open a PDF from a same-origin URL (orb-host's asset route; the auth cookie rides along). */
export async function openPdfUrl(url: string): Promise<PdfDoc> {
  const m = await pdfjs();
  return m.getDocument({ url, withCredentials: true, ...options() }).promise;
}

/** Render one page (1-based) into a canvas at `width` CSS pixels (device-pixel sharp). */
export async function renderPage(doc: PdfDoc, pageNumber: number, canvas: HTMLCanvasElement, width: number) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const viewport = page.getViewport({ scale: (width / base.width) * dpr });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
}

/** Page count and a PNG of the first page (`width` px wide) of a PDF's bytes. */
export async function pdfSummary(
  bytes: Uint8Array,
  width = 480,
): Promise<{ pages: number; thumb: Blob | null }> {
  const doc = await openPdf(bytes.slice());
  try {
    const pages = doc.numPages;
    let thumb: Blob | null = null;
    if (pages > 0) {
      const canvas = document.createElement('canvas');
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      thumb = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    }
    return { pages, thumb };
  } finally {
    await doc.loadingTask.destroy();
  }
}
