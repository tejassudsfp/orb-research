/**
 * Page capture for Scout's `capture_page` (BUILD_PLAN P3.5; PRD Sources › Page screenshot).
 *
 * A hidden BrowserWindow per capture, on the in-memory partition `temp:capture` (no persistent cookies or cache;
 * storage is cleared after every capture), `sandbox: true`, context isolation, no Node, NO preload, JavaScript on.
 * Every request of the window passes `decideCaptureRequest` (captureFilter.ts: public hosts only), permissions are
 * denied, downloads cancelled, popups denied, audio muted. The page loads, then 1.5 s for late layout, then a
 * full-page PNG (1280 px wide at scale 1, up to 12 000 px tall) is taken with the DevTools protocol
 * (`Page.captureScreenshot` with `captureBeyondViewport`), and the window is destroyed. The PNG is returned to the
 * sidecar, which stores it in the canvas's `assets/` (main never writes canvas files).
 */
import { BrowserWindow, session, type Session, type WebContents } from 'electron';
import { CAPTURE, type CaptureInfo } from '@orb/shared';
import { ControlError, type CaptureFn } from './control.js';
import {
  checkCaptureUrl,
  decideCaptureRequest,
  proxyFromEnv,
  proxyRules,
  type ProxyConfig,
} from './captureFilter.js';

export const CAPTURE_PARTITION = 'temp:capture';

let installed: { ses: Session; proxy: ProxyConfig; blockedMain: WeakSet<object> } | undefined;

/** The capture session, set up once: request filter, proxy, no permissions, no downloads. */
async function captureSession(log: (line: string) => void): Promise<NonNullable<typeof installed>> {
  if (installed) return installed;
  const ses = session.fromPartition(CAPTURE_PARTITION, { cache: false });
  const proxy = proxyFromEnv(process.env);
  const rules = proxyRules(proxy);
  // Mirror the user's exported proxy (what the sidecar's fetches use); otherwise go direct, never via system
  // settings, so the address checks below always apply to direct connections.
  await ses.setProxy(rules ? { proxyRules: rules } : { mode: 'direct' });
  const blockedMain = new WeakSet<object>();
  const cache = new Map<string, Promise<boolean>>();
  setInterval(() => cache.clear(), 60_000).unref();
  ses.webRequest.onBeforeRequest((details, callback) => {
    decideCaptureRequest(details.url, { proxy, cache }).then(
      (decision) => {
        if (decision === 'cancel') {
          if (details.resourceType === 'mainFrame' && details.webContents)
            blockedMain.add(details.webContents);
          log(
            `capture: blocked a ${details.resourceType} request to ${new URL(details.url).protocol}//${safeHost(details.url)}`,
          );
        }
        callback({ cancel: decision === 'cancel' });
      },
      () => callback({ cancel: true }),
    );
  });
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', (event) => event.preventDefault());
  installed = { ses, proxy, blockedMain };
  return installed;
}

const safeHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return '?';
  }
};

function withTimeout<T>(p: Promise<T>, ms: number, error: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(error()), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

/** The capture function the control server runs (one at a time). */
export function createPublicPageLoader<T>(
  log: (line: string) => void,
  read: (contents: WebContents, signal: AbortSignal, status?: number) => Promise<T>,
): (url: string, signal: AbortSignal) => Promise<T> {
  return async (url, signal) => {
    signal.throwIfAborted();
    checkCaptureUrl(url);
    const { ses, blockedMain } = await captureSession(log);
    signal.throwIfAborted();
    const win = new BrowserWindow({
      show: false,
      width: CAPTURE.width,
      height: CAPTURE.viewportHeight,
      paintWhenInitiallyHidden: true,
      skipTaskbar: true,
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        javascript: true,
        webviewTag: false,
        backgroundThrottling: false,
        spellcheck: false,
        // No preload: the page gets nothing from Orb.
      },
    });
    const wc = win.webContents;
    let responseStatus: number | undefined;
    wc.on('did-navigate', (_event, _target, status) => {
      responseStatus = status;
    });
    const destroy = () => {
      if (!win.isDestroyed()) win.destroy();
    };
    signal.addEventListener('abort', destroy, { once: true });
    try {
      wc.setAudioMuted(true);
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      wc.on('will-navigate', (event, target) => {
        if (!/^https?:/i.test(target)) event.preventDefault();
      });
      try {
        await withTimeout(
          wc.loadURL(url),
          CAPTURE.loadTimeoutMs,
          () =>
            new ControlError(
              504,
              'TIMEOUT',
              `the page did not load within ${CAPTURE.loadTimeoutMs / 1000} s`,
            ),
        );
      } catch (err) {
        if (signal.aborted) throw signal.reason;
        if (blockedMain.has(wc))
          throw new ControlError(403, 'BLOCKED_URL', 'the page is on a private or local address');
        if (err instanceof ControlError) throw err;
        // A load that failed on a sub-navigation still shows something; only a failed main page is an error.
        if (!wc.getURL() || wc.getURL() === 'about:blank')
          throw new ControlError(
            502,
            'CAPTURE_FAILED',
            `the page did not load: ${(err as Error).message.replace(/\(.*\)$/, '').trim()}`,
          );
      }
      await sleep(CAPTURE.settleMs, signal);
      signal.throwIfAborted();
      if (blockedMain.has(wc))
        throw new ControlError(403, 'BLOCKED_URL', 'the page redirected to a private or local address');
      return await read(wc, signal, responseStatus);
    } finally {
      signal.removeEventListener('abort', destroy);
      destroy();
      await ses.clearStorageData().catch(() => {});
    }
  };
}

/** Screenshots and source reads share the same hardened loader and serialized control queue. */
export function createCapturer(log: (line: string) => void): CaptureFn {
  return createPublicPageLoader(log, async (wc) => {
    wc.debugger.attach('1.3');
    try {
      await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: CAPTURE.width,
        height: CAPTURE.viewportHeight,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const metrics = (await wc.debugger.sendCommand('Page.getLayoutMetrics')) as {
        cssContentSize?: { width: number; height: number };
        contentSize?: { width: number; height: number };
      };
      const size = metrics.cssContentSize ??
        metrics.contentSize ?? { width: CAPTURE.width, height: CAPTURE.viewportHeight };
      const fullHeight = Math.max(1, Math.ceil(size.height));
      const height = Math.min(fullHeight, CAPTURE.maxHeight);
      const shot = (await withTimeout(
        wc.debugger.sendCommand('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          fromSurface: true,
          clip: { x: 0, y: 0, width: CAPTURE.width, height, scale: 1 },
        }),
        20_000,
        () => new ControlError(504, 'TIMEOUT', 'the screenshot did not finish in time'),
      )) as { data: string };
      const png = Buffer.from(shot.data, 'base64');
      if (png.length > CAPTURE.maxPngBytes)
        throw new ControlError(413, 'TOO_LARGE', 'the screenshot is larger than 20 MB');
      const info: CaptureInfo = {
        url: wc.getURL().slice(0, 4096),
        title: (wc.getTitle() || '').slice(0, 500),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
        cut: fullHeight > CAPTURE.maxHeight,
      };
      return { png, info };
    } finally {
      if (!wc.isDestroyed() && wc.debugger.isAttached()) wc.debugger.detach();
    }
  });
}
