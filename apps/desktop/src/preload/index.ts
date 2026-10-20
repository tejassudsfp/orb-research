/**
 * `window.orbNative`: the native services the Orb UI may call (contextBridge; the page gets these functions only,
 * never ipcRenderer itself). Main checks every call's sender (apps/desktop/src/main/native.ts).
 *
 * - `exportPdf(route)`: print a print route (`/print/canvas?…`, `/print/doc?…`) in a hidden window; resolves with the
 *   PDF bytes (P4.4).
 * - `reveal(file)`: Reveal in Finder, for an exported PDF of a canvas.
 * - `print.capture(rect)` / `print.ready(info)`: used by the print page inside the hidden print window only.
 * - `storage.get()` / `storage.reveal()` / `storage.change(mode)` and `about()` (P5.3 Settings): the Orb folder,
 *   Reveal in Finder, Change location (`move` | `existing`), and the app versions.
 * - `sites.get()` / `sites.connect(input, acceptTos)` / `sites.disconnect(domain)` / `sites.setApproval(domain, bool)`
 *   (P6.10): the connected sites, the sign-in window, and the per-site approval setting.
 * - `boot.setDraft(draft)` / `boot.takeDraft()` (P5.1): the warming-up Home hands what the user typed to the live
 *   Home (main accepts the first only from the boot page, the second only from the sidecar origin).
 * - `boot.keychain()` (P6.2): whether the sidecar's Keychain read is waiting on a macOS prompt (boot page only).
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('orbNative', {
  version: 4,
  exportPdf: (route: string) => ipcRenderer.invoke('orb:export-pdf', route),
  reveal: (file: string) => ipcRenderer.invoke('orb:reveal', file),
  print: {
    capture: (rect: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('orb:print-capture', rect),
    ready: (info: unknown) => ipcRenderer.invoke('orb:print-ready', info),
  },
  storage: {
    get: () => ipcRenderer.invoke('orb:storage-get'),
    reveal: () => ipcRenderer.invoke('orb:storage-reveal'),
    change: (mode: 'move' | 'existing') => ipcRenderer.invoke('orb:storage-change', mode),
  },
  about: () => ipcRenderer.invoke('orb:about'),
  /** P6.10 Settings › Connected sites (signed-in browsing): all of it runs in main; no cookie reaches the page. */
  sites: {
    get: () => ipcRenderer.invoke('orb:sites-get'),
    connect: (input: string, acceptTos: boolean) => ipcRenderer.invoke('orb:sites-connect', input, acceptTos),
    disconnect: (domain: string) => ipcRenderer.invoke('orb:sites-disconnect', domain),
    setApproval: (domain: string, required: boolean) =>
      ipcRenderer.invoke('orb:sites-approval', domain, required),
  },
  boot: {
    setDraft: (draft: { prompt: string; template?: string }) => ipcRenderer.send('orb:boot-draft', draft),
    takeDraft: () => ipcRenderer.invoke('orb:boot-draft-take'),
    /** P6.2: true while the sidecar's Keychain read waits (a macOS access prompt). Boot page only. */
    keychain: () => ipcRenderer.invoke('orb:boot-keychain'),
  },
});
