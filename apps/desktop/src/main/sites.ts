/**
 * P6.10 signed-in browsing in Electron main (PLAN P6.10; contracts in packages/shared/src/sites.ts).
 *
 * - **Login window** (Settings › Connected sites › Connect): a visible, sandboxed BrowserWindow on the isolated
 *   persistent partition `persist:orb-sites`, no preload, popups folded into the same window. The user signs in the
 *   normal way (passwords, 2FA, SSO) and closes the window; if the partition then holds cookies for the domain the
 *   site is recorded as connected. Orb never sees a password: it types nothing into the page.
 * - **Fetch** (the sidecar's `fetch_signed_in`, over the loopback control channel): a hidden window on the same
 *   partition renders ONE connected-domain page read-only (GET only, no clicks, no forms; every request passes
 *   `decideSitesRequest`), and returns the rendered HTML (and a PNG when asked). Cookies stay in this process.
 * - Per-site settings (approval before every fetch, on by default), a per-domain rate limit, a ToS warning list and an
 *   activity list (what was fetched, by whom, outcome) live in `sitesCore.ts`.
 * - Disconnect removes the domain's cookies and storage from the partition.
 */
import { BrowserWindow, dialog, ipcMain, session, type Session, type WebContents } from 'electron';
import {
  CAPTURE,
  SIGNED_IN,
  SITES_PARTITION,
  hostInDomain,
  parseSiteInput,
  tosWarningFor,
  type SignedInAnswer,
  type SignedInRequest,
  type SiteConnectResult,
  type SitesState,
  TOS_WARNING_SITES,
} from '@orb/shared';
import { ControlError, type SignedInHandler } from './control.js';
import { checkCaptureUrl, proxyFromEnv, proxyRules, type ProxyConfig } from './captureFilter.js';
import { RateLimiter, SitesStore, decideSitesRequest, redactUrl, type SitesWindowKind } from './sitesCore.js';

export type SitesDeps = {
  stateDir: string;
  /** The Orb window (the approval prompt and login window sit over it). */
  window: () => BrowserWindow | undefined;
  /** True when `sender` is the Orb UI on the live sidecar origin. */
  fromApp: (sender: WebContents) => boolean;
  /** http sites are connectable only in the unpackaged app (tests). */
  allowHttp: boolean;
  log: (line: string) => void;
};

export type Sites = {
  store: SitesStore;
  handler: SignedInHandler;
  state(): SitesState;
  connect(input: string, acceptTos: boolean): Promise<SiteConnectResult>;
  disconnect(domain: string): Promise<boolean>;
};

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

const LOGIN_PATH = /(^|[/_.-])(log-?in|sign-?in|sso|auth(orize)?|session\/new)([/_.?-]|$)/i;

export function createSites(deps: SitesDeps): Sites {
  const store = new SitesStore(deps.stateDir);
  const limiter = new RateLimiter();
  /** webContents id → what the window is (login or fetch) and for which domain. */
  const windows = new Map<number, { kind: SitesWindowKind; domain: string }>();
  let ses: Session | undefined;
  let proxy: ProxyConfig = { noProxy: [] };
  let loginOpen = false;

  async function partition(): Promise<Session> {
    if (ses) return ses;
    const s = session.fromPartition(SITES_PARTITION);
    proxy = proxyFromEnv(process.env);
    const rules = proxyRules(proxy);
    // Same rule as page capture: mirror the exported proxy, otherwise go direct (never the system settings).
    await s.setProxy(rules ? { proxyRules: rules } : { mode: 'direct' });
    const cache = new Map<string, Promise<boolean>>();
    setInterval(() => cache.clear(), 60_000).unref();
    s.webRequest.onBeforeRequest((details, callback) => {
      const w = details.webContentsId !== undefined ? windows.get(details.webContentsId) : undefined;
      if (!w) return callback({ cancel: true });
      decideSitesRequest(
        w.kind,
        w.domain,
        { url: details.url, method: details.method, resourceType: details.resourceType },
        { proxy, cache },
      ).then(
        (decision) => {
          if (decision === 'cancel' && details.resourceType === 'mainFrame')
            deps.log(`sites: blocked a page request to ${safeHost(details.url)} (${w.kind} window)`);
          callback({ cancel: decision === 'cancel' });
        },
        () => callback({ cancel: true }),
      );
    });
    s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    s.setPermissionCheckHandler(() => false);
    s.on('will-download', (event) => event.preventDefault());
    ses = s;
    return s;
  }

  const hardenedPrefs = (s: Session) => ({
    session: s,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    webviewTag: false,
    spellcheck: false,
    // No preload: the page gets nothing from Orb.
  });

  async function hasCookies(s: Session, domain: string): Promise<boolean> {
    const all = await s.cookies.get({});
    return all.some((c) => {
      const d = (c.domain ?? '').replace(/^\./, '');
      return d !== '' && (hostInDomain(d, domain) || hostInDomain(domain, d));
    });
  }

  async function connect(input: string, acceptTos: boolean): Promise<SiteConnectResult> {
    const parsed = parseSiteInput(input, { allowHttp: deps.allowHttp });
    if ('error' in parsed) return { ok: false, error: parsed.error };
    const warning = tosWarningFor(parsed.domain);
    if (warning && !acceptTos) return { ok: false, error: warning };
    if (loginOpen) return { ok: false, error: 'A sign-in window is already open.' };
    loginOpen = true;
    try {
      const s = await partition();
      const parent = deps.window();
      const win = new BrowserWindow({
        width: 1000,
        height: 760,
        title: `Sign in to ${parsed.domain}`,
        show: true,
        ...(parent && !parent.isDestroyed() ? { parent } : {}),
        webPreferences: hardenedPrefs(s),
      });
      const wc = win.webContents;
      windows.set(wc.id, { kind: 'login', domain: parsed.domain });
      // The page's own title would replace ours: keep it, so the user knows what this window is for.
      win.on('page-title-updated', (event) => event.preventDefault());
      wc.setWindowOpenHandler(({ url }) => {
        // OAuth popups open in this same window (one window, one flow).
        if (/^https?:/i.test(url)) void wc.loadURL(url).catch(() => {});
        return { action: 'deny' };
      });
      wc.on('will-navigate', (event, target) => {
        if (!/^https?:/i.test(target)) event.preventDefault();
      });
      const closed = new Promise<void>((resolve) => win.once('closed', () => resolve()));
      deps.log(`sites: sign-in window opened for ${parsed.domain}`);
      wc.loadURL(parsed.loginUrl).catch((err: Error) =>
        deps.log(`sites: sign-in page did not load: ${err.message.replace(/\(.*\)$/, '').trim()}`),
      );
      await closed;
      windows.delete(wc.id);
      await s.cookies.flushStore().catch(() => {});
      if (!(await hasCookies(s, parsed.domain)))
        return { ok: false, error: 'No sign-in was found for that site, so it was not connected.' };
      const site = store.upsert(parsed.domain, parsed.loginUrl);
      limiter.forget(parsed.domain);
      deps.log(`sites: connected ${parsed.domain}`);
      return { ok: true, site };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    } finally {
      loginOpen = false;
    }
  }

  async function disconnect(domain: string): Promise<boolean> {
    const site = store.list().find((x) => x.domain === domain);
    if (!site) return false;
    const s = await partition();
    for (const c of await s.cookies.get({})) {
      const d = (c.domain ?? '').replace(/^\./, '');
      if (hostInDomain(d, domain) || hostInDomain(domain, d)) {
        const url = `${c.secure ? 'https' : 'http'}://${d}${c.path ?? '/'}`;
        await s.cookies.remove(url, c.name).catch(() => {});
      }
    }
    for (const origin of new Set([new URL(site.loginUrl).origin, `https://${domain}`, `https://www.${domain}`]))
      await s.clearStorageData({ origin }).catch(() => {});
    await s.cookies.flushStore().catch(() => {});
    store.remove(domain);
    limiter.forget(domain);
    deps.log(`sites: disconnected ${domain}`);
    return true;
  }

  const handler: SignedInHandler = {
    // Checks and asks, outside the control server's one-at-a-time queue (a user may take a while to answer).
    async authorize(req, signal) {
      const by = req.by ?? 'an agent';
      checkCaptureUrl(req.url);
      const host = new URL(req.url).hostname;
      const site = store.siteFor(host);
      if (!site) {
        store.record({ domain: host, url: req.url, by, outcome: 'denied', detail: 'not a connected site' });
        throw new ControlError(
          403,
          'NOT_CONNECTED',
          `${host} is not a connected site. Ask the user to connect it in Settings › Connected sites.`,
        );
      }
      const taken = limiter.take(site.domain);
      if (!taken.ok) {
        store.record({ domain: site.domain, url: req.url, by, outcome: 'rate-limited' });
        throw new ControlError(
          429,
          'RATE_LIMITED',
          `Too many signed-in fetches for ${site.domain}; try again in ${Math.ceil(taken.retryAfterMs / 1000)} s.`,
        );
      }
      if (site.requireApproval) {
        const parent = deps.window();
        const options: Electron.MessageBoxOptions = {
          type: 'question',
          message: `Let ${by} read a page with your ${site.domain} sign-in?`,
          detail: `${redactUrl(req.url)}\n\nIt will open the page read-only (no clicks, no forms) and read what it shows. Your password and cookies stay in orb and are never given to an agent.`,
          buttons: ['Allow', 'Deny'],
          defaultId: 1,
          cancelId: 1,
          checkboxLabel: `Don't ask again for ${site.domain}`,
        };
        const answer =
          parent && !parent.isDestroyed()
            ? await dialog.showMessageBox(parent, options)
            : await dialog.showMessageBox(options);
        if (signal.aborted) throw signal.reason;
        if (answer.response !== 0) {
          store.record({ domain: site.domain, url: req.url, by, outcome: 'denied', detail: 'you said no' });
          throw new ControlError(403, 'DENIED', `The user did not allow reading ${site.domain} this time.`);
        }
        if (answer.checkboxChecked) store.setApproval(site.domain, false);
      }
    },

    async fetch(req: SignedInRequest, signal: AbortSignal): Promise<SignedInAnswer> {
      const by = req.by ?? 'an agent';
      const requested = new URL(req.url);
      const site = store.siteFor(requested.hostname);
      if (!site) throw new ControlError(403, 'NOT_CONNECTED', `${requested.hostname} is not a connected site.`);
      const s = await partition();
      const win = new BrowserWindow({
        show: false,
        width: CAPTURE.width,
        height: CAPTURE.viewportHeight,
        paintWhenInitiallyHidden: true,
        skipTaskbar: true,
        webPreferences: { ...hardenedPrefs(s), javascript: true, backgroundThrottling: false },
      });
      const wc = win.webContents;
      windows.set(wc.id, { kind: 'fetch', domain: site.domain });
      const destroy = () => {
        if (!win.isDestroyed()) win.destroy();
      };
      signal.addEventListener('abort', destroy, { once: true });
      let status: number | undefined;
      try {
        wc.setAudioMuted(true);
        wc.setWindowOpenHandler(() => ({ action: 'deny' }));
        wc.on('will-navigate', (event, target) => {
          if (!/^https?:/i.test(target)) event.preventDefault();
        });
        wc.on('did-navigate', (_e, _url, code) => {
          status = code;
        });
        try {
          await withTimeout(
            wc.loadURL(req.url),
            SIGNED_IN.loadTimeoutMs,
            () => new ControlError(504, 'TIMEOUT', `the page did not load within ${SIGNED_IN.loadTimeoutMs / 1000} s`),
          );
        } catch (err) {
          if (signal.aborted) throw signal.reason;
          if (err instanceof ControlError) throw err;
          if (!wc.getURL() || wc.getURL() === 'about:blank')
            throw new ControlError(
              502,
              'FETCH_FAILED',
              `the page did not load: ${(err as Error).message.replace(/\(.*\)$/, '').trim()}`,
            );
        }
        await sleep(SIGNED_IN.settleMs, signal);
        const finalUrl = wc.getURL();
        let finalHost = '';
        try {
          finalHost = new URL(finalUrl).hostname;
        } catch {
          // handled below
        }
        if (!finalHost || !hostInDomain(finalHost, site.domain))
          throw new ControlError(
            403,
            'LEFT_DOMAIN',
            `the page redirected away from ${site.domain}; only connected domains are read.`,
          );
        if (status === 401 || status === 403 || (finalUrl !== req.url && LOGIN_PATH.test(new URL(finalUrl).pathname)))
          throw new ControlError(
            401,
            'SESSION_EXPIRED',
            `${site.domain} asked for a sign-in; the connection may have expired. Ask the user to reconnect it in Settings › Connected sites.`,
          );
        if (status !== undefined && status >= 400)
          throw new ControlError(502, 'HTTP_STATUS', `${site.domain} answered HTTP ${status} for that page.`);
        const html = String(
          await withTimeout(
            wc.executeJavaScript('document.documentElement.outerHTML'),
            15_000,
            () => new ControlError(504, 'TIMEOUT', 'the page could not be read in time'),
          ),
        );
        if (html.length > SIGNED_IN.maxHtmlChars)
          throw new ControlError(413, 'TOO_LARGE', 'the page is larger than 5 MB of HTML');
        let png: string | undefined;
        let shot: { width: number; height: number; cut: boolean } | undefined;
        if (req.screenshot) {
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
            const out = (await withTimeout(
              wc.debugger.sendCommand('Page.captureScreenshot', {
                format: 'png',
                captureBeyondViewport: true,
                fromSurface: true,
                clip: { x: 0, y: 0, width: CAPTURE.width, height, scale: 1 },
              }),
              20_000,
              () => new ControlError(504, 'TIMEOUT', 'the screenshot did not finish in time'),
            )) as { data: string };
            const buf = Buffer.from(out.data, 'base64');
            if (buf.length > CAPTURE.maxPngBytes)
              throw new ControlError(413, 'TOO_LARGE', 'the screenshot is larger than 20 MB');
            png = out.data;
            shot = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), cut: fullHeight > CAPTURE.maxHeight };
          } finally {
            if (!wc.isDestroyed() && wc.debugger.isAttached()) wc.debugger.detach();
          }
        }
        store.record({
          domain: site.domain,
          url: finalUrl,
          by,
          outcome: 'ok',
          ...(shot ? { screenshot: true } : {}),
        });
        return {
          info: {
            domain: site.domain,
            url: finalUrl.slice(0, 4096),
            title: (wc.getTitle() || '').slice(0, 500),
            ...(status !== undefined ? { status } : {}),
            ...(shot ? { screenshot: shot } : {}),
          },
          html,
          ...(png ? { png } : {}),
        };
      } catch (err) {
        if (!signal.aborted)
          store.record({
            domain: site.domain,
            url: req.url,
            by,
            outcome: 'error',
            detail: err instanceof ControlError ? err.code : (err as Error).message.slice(0, 120),
          });
        throw err;
      } finally {
        signal.removeEventListener('abort', destroy);
        windows.delete(wc.id);
        destroy();
        await s.cookies.flushStore().catch(() => {});
      }
    },
  };

  const state = (): SitesState => ({
    sites: store.list(),
    activity: store.recent(),
    tosSites: Object.keys(TOS_WARNING_SITES),
  });

  ipcMain.handle('orb:sites-get', (event): SitesState | null => (deps.fromApp(event.sender) ? state() : null));
  ipcMain.handle(
    'orb:sites-connect',
    async (event, input: unknown, acceptTos: unknown): Promise<SiteConnectResult> => {
      if (!deps.fromApp(event.sender)) return { ok: false, error: 'not allowed' };
      if (typeof input !== 'string') return { ok: false, error: 'bad address' };
      return connect(input, acceptTos === true);
    },
  );
  ipcMain.handle('orb:sites-disconnect', async (event, domain: unknown): Promise<boolean> => {
    if (!deps.fromApp(event.sender) || typeof domain !== 'string') return false;
    return disconnect(domain);
  });
  ipcMain.handle('orb:sites-approval', (event, domain: unknown, required: unknown): boolean => {
    if (!deps.fromApp(event.sender) || typeof domain !== 'string' || typeof required !== 'boolean') return false;
    return store.setApproval(domain, required) !== undefined;
  });

  return { store, handler, state, connect, disconnect };
}
