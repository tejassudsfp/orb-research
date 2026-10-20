import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  nativeTheme,
  protocol,
  session,
  shell,
  type WebContents,
} from 'electron';
import { DEFAULT_APPEARANCE, appearancePalette } from '@orb/shared';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { BOOT_SCHEME, bootUrl, installBootProtocol, isBootUrl, parseDraft, readBootView } from './boot.js';
import { createCapturer } from './capture.js';
import { createBrowserResearch } from './browser.js';
import { checkCaptureUrl } from './captureFilter.js';
import { startControlServer, type ControlServer } from './control.js';
import { installNative } from './native.js';
import { installSettingsNative } from './settingsNative.js';
import { createSites } from './sites.js';
import { resolveOrbHome, type StorageLocation } from './storage.js';
import {
  bootstrapDshHome,
  compileCacheDir,
  devPaths,
  dshBinPath,
  packagedPaths,
  sidecarEnv,
  type OrbPaths,
} from './dshHome.js';
import {
  installSessionSecurity,
  installWindowSecurity,
  sidecarOrigin,
  type SecurityDeps,
} from './security.js';
import { OFFSCREEN_ORIGIN, OFFSCREEN_SWITCHES, offscreenRequested, testWindowOptions } from './testWindow.js';
import { MIN_SIDECAR_NODE, SidecarSupervisor, compareVersions } from './sidecar.js';

const log = (line: string) => console.log(`[orb] ${line}`);
/** P6.1b: the product name, always lowercase. */
const APP_NAME = 'orb';
/** ms since this process started (P5.1 startup marks in the log). */
const sinceLaunch = () => Math.round(performance.now());

// P5.1: the warming-up Home is served from `orb-boot://app/` (a standard, secure scheme, so its ES modules load).
protocol.registerSchemesAsPrivileged([{ scheme: BOOT_SCHEME, privileges: { standard: true, secure: true } }]);

// Tests give Electron its own profile dir (cookies, cache) so they never share state with a dev run.
if (!app.isPackaged && process.env.ORB_USER_DATA) app.setPath('userData', process.env.ORB_USER_DATA);
// P6.1b: the name is always lowercase "orb" (app menu, About, Hide/Quit, Dock). The packaged app also gets it from
// productName (apps/desktop/electron-builder.yml); the dev app pins its userData first, so the rename never moves it
// onto the packaged app's folder.
if (!app.isPackaged) app.setPath('userData', app.getPath('userData'));
app.setName(APP_NAME);
// One renewable plan session must have one refresh owner per installed profile.
if (app.isPackaged && !app.requestSingleInstanceLock()) app.exit(0);
// P6.9: an e2e run keeps its window off-screen so real input cannot reach it (apps/desktop/src/main/testWindow.ts).
const OFFSCREEN = offscreenRequested({ packaged: app.isPackaged, env: process.env });
if (OFFSCREEN) for (const sw of OFFSCREEN_SWITCHES) app.commandLine.appendSwitch(sw);

function resolvePaths(): OrbPaths {
  if (!app.isPackaged) {
    // apps/desktop → repo root. Tests point ORB_DSH_HOME / ORB_HOME at temp dirs so they never touch .orb-dev.
    const dev = devPaths(resolve(app.getAppPath(), '..', '..'));
    return {
      ...dev,
      dshHome: process.env.ORB_DSH_HOME || dev.dshHome,
      orbHome: process.env.ORB_HOME || dev.orbHome,
    };
  }
  // P5.4: the layout electron-builder produces (apps/desktop/electron-builder.yml).
  return packagedPaths(process.resourcesPath, app.getPath('userData'), homedir());
}

let sidecar: SidecarSupervisor | undefined;
/** The loopback control channel the sidecar calls for page captures (P3.5); its secret is new every launch. */
let control: ControlServer | undefined;
let sites: ReturnType<typeof createSites> | undefined;
let win: BrowserWindow | undefined;
app.on('second-instance', () => {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
  }
});
/** Origin of the live sidecar (`http://127.0.0.1:<port>`); the only origin the renderer may reach. */
let origin: string | undefined;

const securityDeps: SecurityDeps = {
  origin: () => origin,
  openExternal: (url) => shell.openExternal(url),
  log,
};

async function showFatal(reason: string, logPath: string): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: 'orb could not start',
    message: 'The orb engine stopped and could not be restarted.',
    detail: `${reason}\n\nLog: ${logPath}`,
    buttons: ['Show Log', 'Quit'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) shell.showItemInFolder(logPath);
  app.quit();
}

const preloadPath = () => join(import.meta.dirname, '..', 'preload', 'index.cjs');

/** The paths in use; P5.3 Settings › Storage can change `orbHome` (the sidecar restarts on the new folder). */
let paths: OrbPaths;
let location: StorageLocation;
let logPath: string;
let extraPatch: string | undefined;
/** Where the window goes once the next sidecar is ready (P5.3: back to Settings after a change of location). */
let pendingRoute: string | undefined;

/** True when `sender` is the Orb window showing the live UI on the sidecar origin. */
function fromAppWindow(sender: WebContents): boolean {
  if (!origin || !win || win.isDestroyed() || sender !== win.webContents) return false;
  try {
    return new URL(sender.getURL()).origin === origin;
  } catch {
    return false;
  }
}

async function startSidecar(): Promise<void> {
  // P4.4: print-to-PDF, design-frame snapshots and Reveal in Finder for the renderer (window.orbNative).
  installNative({ security: securityDeps, orbHome: () => paths.orbHome, preload: preloadPath(), log });
  // P5.3: Settings › Storage (show, Reveal, change location) and About.
  installSettingsNative({
    fromApp: fromAppWindow,
    window: () => win,
    location: () => location,
    stateDir: dirname(paths.dshHome),
    forbidden: [paths.dshHome],
    stopSidecar: stopSidecar,
    startSidecar: (orbHome, route) => {
      paths = { ...paths, orbHome };
      location = { orbHome, defaultHome: location.defaultHome };
      pendingRoute = route;
      void launchSidecar();
    },
    log,
  });
  // Test-only (unpackaged): extra profile patch rows, e.g. the mock LLM route used by the e2e tests.
  const extraPatchFile = !app.isPackaged ? process.env.ORB_EXTRA_PATCH_FILE : undefined;
  extraPatch = extraPatchFile ? readFileSync(extraPatchFile, 'utf8') : undefined;
  logPath = app.isPackaged
    ? join(app.getPath('logs'), 'sidecar.log')
    : join(dirname(paths.dshHome), 'logs', 'sidecar.log');

  // The sidecar runs on this very binary (ELECTRON_RUN_AS_NODE=1), so its Node is this process's Node. P5.1: read it
  // here instead of spawning a probe process before every launch (that cost ~100-200 ms of startup).
  const nodeVersion = process.versions.node;
  log(`sidecar runtime: Node ${nodeVersion} (Electron ${process.versions.electron})`);
  if (compareVersions(nodeVersion, MIN_SIDECAR_NODE) < 0) {
    // Electron 44.7.0 ships Node 24.21; a bundled Node is only needed if a future Electron drops below 22.19.
    await showFatal(
      `The sidecar needs Node ${MIN_SIDECAR_NODE} or later, but Electron ships ${nodeVersion}.`,
      logPath,
    );
    return;
  }

  // P3.5 capture_page: main serves page captures on 127.0.0.1 to the sidecar only (per-launch secret in its env).
  try {
    // P6.10: signed-in browsing (login window, persist:orb-sites partition, fetches) lives in main; created once.
    sites ??= createSites({
      stateDir: dirname(paths.dshHome),
      window: () => win,
      fromApp: fromAppWindow,
      allowHttp: !app.isPackaged,
      log,
    });
    control = await startControlServer({
      capture: createCapturer(log),
      browse: createBrowserResearch(log),
      openChatGPT: (url) => shell.openExternal(url),
      signedIn: sites.handler,
      checkUrl: checkCaptureUrl,
      log,
    });
    log(`control channel on 127.0.0.1:${control.port}`);
  } catch (err) {
    // Orb still works without it; capture_page then says page capture is unavailable.
    log(`control channel failed to start: ${(err as Error).message}`);
  }

  // Test-only (unpackaged): hold the sidecar back to exercise the warming-up Home (apps/desktop/e2e/startup.spec.ts).
  const delay = !app.isPackaged ? Number(process.env.ORB_TEST_SIDECAR_DELAY_MS ?? 0) : 0;
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  await launchSidecar();
}

/** Spawn a sidecar on the current paths (at launch, and after a change of the Orb folder). */
async function launchSidecar(): Promise<void> {
  bootstrapDshHome(paths, extraPatch ? { extraPatch } : {});
  const supervisor = new SidecarSupervisor({
    execPath: process.execPath,
    binPath: dshBinPath(paths.root),
    env: { ...sidecarEnv(paths), NODE_COMPILE_CACHE: compileCacheDir(paths), ...control?.env },
    cwd: paths.orbHome,
    logPath,
    log,
  });
  sidecar = supervisor;
  supervisor.on('fatal', ({ reason, logPath: path }) => {
    if (sidecar === supervisor) void showFatal(reason, path);
  });
  keychainWaiting = false;
  supervisor.on('keychain', (state: 'waiting' | 'ready') => {
    if (sidecar !== supervisor) return;
    keychainWaiting = state === 'waiting';
    log(`keychain ${state === 'waiting' ? 'read is waiting (macOS access prompt?)' : 'answered'}`);
  });
  supervisor.on('ready', (url) => {
    if (sidecar !== supervisor) return;
    origin = sidecarOrigin(url);
    log(`sidecar ready at +${sinceLaunch()} ms`);
    const route = pendingRoute;
    pendingRoute = undefined;
    showWindow(url, route);
  });
  log(`sidecar log: ${logPath}`);
  log(`sidecar spawning at +${sinceLaunch()} ms`);
  await supervisor.start().catch(() => {
    // Reported through the 'fatal' handler.
  });
}

/** Stop the running sidecar (P5.3 change of location); the renderer's origin is cleared until the next one is up. */
async function stopSidecar(): Promise<void> {
  const running = sidecar;
  origin = undefined;
  await running?.stop();
}

const BACKGROUND = {
  night: appearancePalette(DEFAULT_APPEARANCE, 'dark').palette.bg,
  day: appearancePalette(DEFAULT_APPEARANCE, 'light').palette.bg,
};

/** The single Orb window (created at launch on the boot page, kept across sidecar restarts). */
function ensureWindow(theme: 'night' | 'day', background = BACKGROUND[theme]): BrowserWindow {
  if (win && !win.isDestroyed()) return win;
  const created = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'orb',
    // The page background, so neither the first paint nor the boot → live swap flashes white.
    backgroundColor: background,
    show: false,
    ...testWindowOptions({ packaged: app.isPackaged, env: process.env }),
    webPreferences: {
      preload: preloadPath(),
      ...(OFFSCREEN ? { backgroundThrottling: false } : {}),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  installWindowSecurity(created, securityDeps);
  created.once('ready-to-show', () => {
    // An off-screen test window is shown without taking the focus from whatever the developer is doing.
    if (OFFSCREEN) {
      created.showInactive();
      // AppKit pulls a shown window back onto a display (measured: it ends at x -1400, y 25, still partly visible),
      // so the window is also made inert: it ignores real mouse and trackpad events (they fall through to whatever is
      // under it) and cannot take the keyboard focus. Playwright's input is synthetic (CDP) and unaffected.
      created.setPosition(OFFSCREEN_ORIGIN.x, OFFSCREEN_ORIGIN.y);
      created.setIgnoreMouseEvents(true);
    } else created.show();
    log(`window shown at +${sinceLaunch()} ms`);
  });
  created.on('closed', () => {
    if (win === created) win = undefined;
  });
  win = created;
  return created;
}

/**
 * P5.1: open the window at once on the warming-up Home (`orb-boot://app/`), before the sidecar is up. Home is on
 * screen in a few hundred ms; the live UI replaces it when the sidecar is ready.
 */
function showBootWindow(): void {
  const boot = readBootView(paths.orbHome, process.env, nativeTheme.shouldUseDarkColors);
  const w = ensureWindow(
    boot.theme,
    appearancePalette(boot.appearance ?? DEFAULT_APPEARANCE, boot.theme === 'day' ? 'light' : 'dark').palette
      .bg,
  );
  w.loadURL(bootUrl(boot)).then(
    () => log(`warming-up ${boot.view} loaded at +${sinceLaunch()} ms`),
    (err: Error) => log(`boot page load failed: ${err.message}`),
  );
}

/**
 * Load the token URL in the single Orb window (replacing the warming-up Home on first boot, reloading after a
 * sidecar restart, which brings a new port and token). The gateway swaps the token for a cookie and redirects to `/`.
 */
function showWindow(url: string, route?: string): void {
  const w = ensureWindow('night');
  // The token URL is never logged; report only the load outcome. A route (`#/settings`) survives the gateway's
  // token-for-cookie redirect to `/` (the redirect has no fragment of its own, so the browser keeps this one).
  w.loadURL(route ? `${url}${route}` : url).then(
    () => log(`window loaded the orb UI from the sidecar at +${sinceLaunch()} ms`),
    (err: Error) =>
      log(`window load failed: ${err.message.replace(/\?token=[^\s)]*/g, '?token=<redacted>')}`),
  );
}

/**
 * P5.1 ask-box draft hand-over: what the user typed on the warming-up Home is kept here (memory only) and given back
 * once to the live Home. Only the Orb window may set it, and only while it shows the boot page; only the live UI on
 * the sidecar origin may take it.
 */
let bootDraft: { prompt: string; template?: string } | undefined;
/** P6.2: the sidecar's Keychain read is held (most likely by a macOS access prompt); the warming-up Home says so. */
let keychainWaiting = false;
function installDraftHandover(): void {
  ipcMain.handle('orb:boot-keychain', (event) => {
    if (!win || event.sender !== win.webContents || !isBootUrl(event.sender.getURL())) return false;
    return keychainWaiting;
  });
  ipcMain.on('orb:boot-draft', (event, value: unknown) => {
    if (!win || event.sender !== win.webContents || !isBootUrl(event.sender.getURL())) return;
    const draft = parseDraft(value);
    if (draft) bootDraft = draft.prompt || draft.template ? draft : undefined;
  });
  ipcMain.handle('orb:boot-draft-take', (event) => {
    if (!origin || !win || event.sender !== win.webContents) return undefined;
    try {
      if (new URL(event.sender.getURL()).origin !== origin) return undefined;
    } catch {
      return undefined;
    }
    const draft = bootDraft;
    bootDraft = undefined;
    return draft;
  });
}

let quitting = false;
app.on('before-quit', (event) => {
  if (quitting || !sidecar) return;
  event.preventDefault();
  quitting = true;
  void sidecar
    .stop()
    .then(() => control?.close())
    .finally(() => app.quit());
});

// macOS convention: closing the window keeps the app (and sidecar) alive; the dock icon reopens it.
app.on('window-all-closed', () => {});
app.on('activate', () => {
  const url = sidecar?.url;
  if (url && (!win || win.isDestroyed())) showWindow(url);
});

// Refuse every other kind of web contents (no <webview>, no extra windows) app-wide.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

app.whenReady().then(
  () => {
    log(`app ready at +${sinceLaunch()} ms`);
    app.setAboutPanelOptions({
      applicationName: APP_NAME,
      applicationVersion: app.getVersion(),
      copyright: 'Copyright © 2026 orb',
    });
    // The unpackaged dev app runs on Electron's own bundle: give its Dock tile the Constellation icon (pnpm brand).
    const devIcon = join(app.getAppPath(), 'build', 'icon.png');
    if (!app.isPackaged && existsSync(devIcon)) app.dock?.setIcon(devIcon);
    paths = resolvePaths();
    // P5.3: a folder chosen in Settings › Storage (pointer next to DSH_HOME) wins over the default.
    location = resolveOrbHome(paths.orbHome, dirname(paths.dshHome));
    if (location.missing) log('storage: the chosen orb folder is missing; using the default folder');
    paths = { ...paths, orbHome: location.orbHome };
    installSessionSecurity(session.defaultSession, securityDeps);
    installBootProtocol(protocol, paths.uiDist);
    installDraftHandover();
    // The sidecar is the long pole: start it first (its synchronous setup runs now), then open the window while it
    // boots.
    const started = startSidecar();
    showBootWindow();
    return started;
  },
  (err) => log(`startup failed: ${(err as Error).message}`),
);
