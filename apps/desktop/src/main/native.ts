/**
 * Native services for the renderer (BUILD_PLAN P4.4 print pipeline), as IPC handlers behind the preload's
 * `window.orbNative`:
 *
 * - `exportPdf(route)` (`orb:export-pdf`, from the Orb window): opens a HIDDEN window on the print route
 *   (`<sidecar origin>/#/print/canvas?…` or `/print/doc?…`, same session as the Orb window so it is authenticated,
 *   same preload, same request filter, CSP and navigation guards), waits for its `ready` signal (fonts loaded,
 *   Mermaid done, images decoded, design frames snapshotted), calls `webContents.printToPDF` (CSS page size, print
 *   backgrounds, no margins: the page lays out its own footer), destroys the window and returns the PDF bytes. The
 *   renderer then stores them in the canvas's `exports/` through the canvas service (orb-host export route): the
 *   canvas service stays the only writer of canvas folders.
 * - `print.capture(rect)` (`orb:print-capture`, from a print window only): `capturePage` of that rectangle of the
 *   print window. The print page draws the design frame being snapshotted at 2x (CSS scale) in that rectangle, and
 *   the image is resized to the rectangle's size, so a snapshot is exactly 2x on any display.
 * - `print.ready(info)` (`orb:print-ready`, from a print window only): the ready signal (or the reason it cannot
 *   print).
 * - `reveal(file)` (`orb:reveal`): Reveal in Finder, only for an exported PDF of a canvas under the Orb folder.
 *
 * One print at a time (a second export waits for the first).
 */
import { BrowserWindow, ipcMain, shell, type WebContents } from 'electron';
import { PrintCaptureRect, PrintReady } from '@orb/shared';
import { installWindowSecurity, type SecurityDeps } from './security.js';
import { countPdfPages, isRevealableExport, printUrl, withTimeout } from './printJob.js';

/** The print window's size: room for a 2x snapshot of a design frame up to 640 x 1000 CSS px. */
const PRINT_WINDOW = { width: 1400, height: 2100 } as const;
const READY_TIMEOUT_MS = 90_000;
const PDF_TIMEOUT_MS = 90_000;

export type ExportPdfResult =
  | {
      ok: true;
      data: Uint8Array;
      /** Pages in the PDF. */
      pages: number;
      /** Pages the print page laid out (0 for a flowing document). */
      expectedPages: number;
      cardTypes: Record<string, number>;
      snapshots: number;
      ms: number;
    }
  | { ok: false; error: string };

type Job = { ready: (info: PrintReady) => void; win: BrowserWindow };

export type NativeDeps = {
  security: SecurityDeps;
  /** The Orb folder (exports are revealed only under it). P5.3: a getter, since Settings can change it. */
  orbHome: () => string;
  /** The preload script (the print window gets the same `window.orbNative`). */
  preload: string;
  log: (line: string) => void;
};

export function installNative(deps: NativeDeps): void {
  const jobs = new Map<number, Job>();
  let queue: Promise<unknown> = Promise.resolve();

  /** True when `sender` is a page of the Orb UI on the sidecar origin (not a print window). */
  const fromApp = (sender: WebContents): boolean => {
    const origin = deps.security.origin();
    if (!origin || jobs.has(sender.id)) return false;
    try {
      return new URL(sender.getURL()).origin === origin;
    } catch {
      return false;
    }
  };

  async function print(route: unknown): Promise<ExportPdfResult> {
    const origin = deps.security.origin();
    if (!origin) return { ok: false, error: 'the orb engine is not running' };
    let url: string;
    try {
      url = printUrl(origin, route).url;
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
    const started = Date.now();
    const win = new BrowserWindow({
      show: false,
      ...PRINT_WINDOW,
      enableLargerThanScreen: true,
      paintWhenInitiallyHidden: true,
      skipTaskbar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: deps.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
        backgroundThrottling: false,
      },
    });
    installWindowSecurity(win, deps.security);
    const wc = win.webContents;
    wc.setAudioMuted(true);
    const id = wc.id;
    const ready = new Promise<PrintReady>((resolve) => jobs.set(id, { ready: resolve, win }));
    const gone = new Promise<never>((_, reject) => {
      wc.once('render-process-gone', (_e, details) =>
        reject(new Error(`the print page stopped (${details.reason})`)),
      );
    });
    try {
      if (win.getContentSize()[1]! < PRINT_WINDOW.height)
        win.setContentSize(PRINT_WINDOW.width, PRINT_WINDOW.height);
      await withTimeout(
        Promise.race([wc.loadURL(url), gone]),
        READY_TIMEOUT_MS,
        'the print page did not load',
      );
      const info = await withTimeout(
        Promise.race([ready, gone]),
        READY_TIMEOUT_MS,
        'the print page was not ready in time',
      );
      if (!info.ok) return { ok: false, error: info.error };
      const pdf = await withTimeout(
        wc.printToPDF({
          printBackground: true,
          generateTaggedPDF: true,
          generateDocumentOutline: true,
          preferCSSPageSize: true,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        }),
        PDF_TIMEOUT_MS,
        'printing the PDF took too long',
      );
      const ms = Date.now() - started;
      deps.log(
        `print: ${info.pages} page(s), ${info.snapshots} snapshot(s), ${pdf.length} bytes in ${ms} ms`,
      );
      return {
        ok: true,
        data: new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength),
        pages: countPdfPages(pdf),
        expectedPages: info.pages,
        cardTypes: info.cardTypes,
        snapshots: info.snapshots,
        ms,
      };
    } catch (err) {
      deps.log(`print failed: ${(err as Error).message}`);
      return { ok: false, error: (err as Error).message };
    } finally {
      jobs.delete(id);
      if (!win.isDestroyed()) win.destroy();
    }
  }

  ipcMain.handle('orb:export-pdf', (event, route: unknown): Promise<ExportPdfResult> => {
    if (!fromApp(event.sender)) return Promise.resolve({ ok: false, error: 'not allowed' });
    const run = queue.then(() => print(route));
    queue = run.catch(() => undefined);
    return run;
  });

  ipcMain.handle('orb:print-ready', (event, raw: unknown): boolean => {
    const job = jobs.get(event.sender.id);
    if (!job) return false;
    const parsed = PrintReady.safeParse(raw);
    job.ready(
      parsed.success ? parsed.data : { ok: false, error: 'the print page sent an invalid ready signal' },
    );
    return true;
  });

  ipcMain.handle('orb:print-capture', async (event, raw: unknown): Promise<Uint8Array | null> => {
    const job = jobs.get(event.sender.id);
    const rect = PrintCaptureRect.safeParse(raw);
    if (!job || !rect.success || job.win.isDestroyed()) return null;
    const { x, y, width, height } = rect.data;
    const [cw = 0, ch = 0] = job.win.getContentSize();
    if (x + width > cw || y + height > ch) return null;
    const image = await job.win.webContents.capturePage({ x, y, width, height }, { stayHidden: true });
    if (image.isEmpty()) return null;
    const size = image.getSize();
    // On a Retina display the capture has 2 device px per DIP: bring it to exactly the rectangle (already 2x CSS).
    const exact =
      size.width === width && size.height === height
        ? image
        : image.resize({ width, height, quality: 'best' });
    const png = exact.toPNG();
    return new Uint8Array(png.buffer, png.byteOffset, png.byteLength);
  });

  ipcMain.handle('orb:reveal', (event, file: unknown): boolean => {
    if (!fromApp(event.sender)) return false;
    if (!isRevealableExport(file, deps.orbHome())) return false;
    shell.showItemInFolder(file);
    return true;
  });
}
