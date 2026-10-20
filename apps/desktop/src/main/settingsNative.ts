/**
 * P5.3 Settings natives behind `window.orbNative.storage` / `window.orbNative.about` (preload), from the Orb UI on
 * the sidecar origin only:
 *
 * - `storage.get()` (`orb:storage-get`): the Orb folder in use, the default, and a pointer to a folder that is gone;
 * - `storage.reveal()` (`orb:storage-reveal`): Reveal the Orb folder in Finder;
 * - `storage.change(mode)` (`orb:storage-change`, mode `move` | `existing`): a folder picker, then (apps/desktop/src/
 *   main/storage.ts) the sidecar is stopped, the folder moved or switched, the pointer saved and the sidecar started
 *   again on the new folder; the window reloads on Settings when it is ready. A failure restarts it on the old folder.
 * - `about()` (`orb:about`): the Orb app version and the Electron, Chromium and Node versions.
 */
import { app, dialog, ipcMain, shell, type BrowserWindow, type WebContents } from 'electron';
import {
  StorageError,
  moveOrbFolder,
  planMove,
  planUseExisting,
  writeOrbHome,
  type StorageLocation,
} from './storage.js';

export type StorageInfo = {
  orbHome: string;
  defaultHome: string;
  isDefault: boolean;
  missing?: string;
};

export type StorageChangeResult =
  | { ok: true; orbHome: string; via: 'rename' | 'copy' | 'switch'; files: number }
  | { ok: false; canceled?: true; error?: string };

export type AboutInfo = { orb: string; electron: string; chrome: string; node: string };

export type SettingsNativeDeps = {
  /** True when `sender` is the Orb UI on the live sidecar origin. */
  fromApp: (sender: WebContents) => boolean;
  window: () => BrowserWindow | undefined;
  location: () => StorageLocation;
  /** The pointer's directory (next to DSH_HOME). */
  stateDir: string;
  /** Folders the Orb folder may never be in or hold (DSH_HOME). */
  forbidden: string[];
  /** Stop the sidecar (resolves once it exited). */
  stopSidecar: () => Promise<void>;
  /** Start the sidecar on `orbHome`; the window reloads on `route` when it is ready. */
  startSidecar: (orbHome: string, route: string) => void;
  log: (line: string) => void;
};

export function installSettingsNative(deps: SettingsNativeDeps): void {
  let busy = false;

  ipcMain.handle('orb:storage-get', (event): StorageInfo | null => {
    if (!deps.fromApp(event.sender)) return null;
    const loc = deps.location();
    return {
      orbHome: loc.orbHome,
      defaultHome: loc.defaultHome,
      isDefault: loc.orbHome === loc.defaultHome,
      ...(loc.missing ? { missing: loc.missing } : {}),
    };
  });

  ipcMain.handle('orb:storage-reveal', (event): boolean => {
    if (!deps.fromApp(event.sender)) return false;
    shell.showItemInFolder(deps.location().orbHome);
    return true;
  });

  ipcMain.handle('orb:about', (event): AboutInfo | null => {
    if (!deps.fromApp(event.sender)) return null;
    return {
      orb: app.getVersion(),
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node,
    };
  });

  ipcMain.handle('orb:storage-change', async (event, mode: unknown): Promise<StorageChangeResult> => {
    if (!deps.fromApp(event.sender)) return { ok: false, error: 'not allowed' };
    if (mode !== 'move' && mode !== 'existing') return { ok: false, error: 'unknown change' };
    if (busy) return { ok: false, error: 'A change of location is already in progress.' };
    busy = true;
    try {
      return await change(mode);
    } finally {
      busy = false;
    }
  });

  async function change(mode: 'move' | 'existing'): Promise<StorageChangeResult> {
    let current = deps.location().orbHome;
    const win = deps.window();
    const options: Electron.OpenDialogOptions = {
      title: mode === 'move' ? 'Move your orb folder' : 'Use an existing orb folder',
      buttonLabel: mode === 'move' ? 'Move Here' : 'Use Folder',
      message:
        mode === 'move'
          ? 'Choose where your orb folder should go. An empty folder becomes your orb folder.'
          : 'Choose a folder that holds an orb library.',
      properties: ['openDirectory', 'createDirectory'],
    };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    const chosen = picked.filePaths[0];
    if (picked.canceled || !chosen) return { ok: false, canceled: true };

    let target: string;
    try {
      if (mode === 'move') target = await planMove(current, chosen, deps.forbidden);
      else {
        const plan = await planUseExisting(current, chosen, deps.forbidden);
        target = plan.target;
        if (!plan.library) {
          const confirm: Electron.MessageBoxOptions = {
            type: 'question',
            message: 'This folder has no orb canvases.',
            detail: `orb will start a new, empty library in ${target}. Your current canvases stay in ${current}.`,
            buttons: ['Use Folder', 'Cancel'],
            defaultId: 0,
            cancelId: 1,
          };
          const { response } = win
            ? await dialog.showMessageBox(win, confirm)
            : await dialog.showMessageBox(confirm);
          if (response !== 0) return { ok: false, canceled: true };
        }
      }
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    deps.log(`storage: ${mode === 'move' ? 'moving' : 'switching'} the orb folder; stopping the engine`);
    await deps.stopSidecar();
    let result: StorageChangeResult | undefined;
    try {
      if (mode === 'move') {
        const moved = await moveOrbFolder(current, target);
        if (moved.leftover)
          deps.log('storage: the old orb folder could not be removed completely after the copy');
        result = { ok: true, orbHome: target, via: moved.via, files: moved.files };
      } else result = { ok: true, orbHome: target, via: 'switch', files: 0 };
      await writeOrbHome(deps.stateDir, target, deps.location().defaultHome);
    } catch (err) {
      const message = err instanceof StorageError ? err.message : (err as Error).message;
      deps.log(`storage: change failed (${message}); restarting on the current folder`);
      // The folder moved but the pointer could not be saved: move it back, or the next launch would not find it.
      if (mode === 'move' && result)
        await moveOrbFolder(target, current).catch((e: Error) => {
          deps.log(`storage: could not move the folder back (${e.message}); staying on the new folder`);
          current = target;
        });
      deps.startSidecar(current, '#/settings');
      return { ok: false, error: `The orb folder was not changed: ${message}` };
    }
    deps.log(`storage: orb folder changed (${result.via}); restarting the engine`);
    deps.startSidecar(target, '#/settings');
    return result;
  }
}
