/**
 * `window.orbNative` as the UI sees it (apps/desktop/src/preload/index.ts; main handlers in
 * apps/desktop/src/main/native.ts). Absent outside Electron (a plain browser or a test), so every use checks first.
 */
import type { PrintCaptureRect, PrintReady, SiteConnectResult, SitesState } from '@orb/shared';

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

export type StorageInfo = {
  orbHome: string;
  defaultHome: string;
  isDefault: boolean;
  /** A chosen folder that was gone at launch; Orb fell back to the default. */
  missing?: string;
};

export type StorageChangeResult =
  | { ok: true; orbHome: string; via: 'rename' | 'copy' | 'switch'; files: number }
  | { ok: false; canceled?: true; error?: string };

export type AboutInfo = { orb: string; electron: string; chrome: string; node: string };

export type OrbNative = {
  version: number;
  exportPdf?: (route: string) => Promise<ExportPdfResult>;
  reveal?: (file: string) => Promise<boolean>;
  print?: {
    capture: (rect: PrintCaptureRect) => Promise<Uint8Array | null>;
    ready: (info: PrintReady) => Promise<boolean>;
  };
  /** P5.3 Settings › Storage (apps/desktop/src/main/settingsNative.ts). */
  storage?: {
    get: () => Promise<StorageInfo | null>;
    reveal: () => Promise<boolean>;
    change: (mode: 'move' | 'existing') => Promise<StorageChangeResult>;
  };
  /** P5.3 Settings › About: the app and runtime versions. */
  about?: () => Promise<AboutInfo | null>;
  /** P6.10 Settings › Connected sites (apps/desktop/src/main/sites.ts). */
  sites?: {
    get: () => Promise<SitesState | null>;
    connect: (input: string, acceptTos: boolean) => Promise<SiteConnectResult>;
    disconnect: (domain: string) => Promise<boolean>;
    setApproval: (domain: string, required: boolean) => Promise<boolean>;
  };
  /** P5.1: the ask-box draft hand-over from the warming-up Home to the live one. */
  boot?: {
    setDraft: (draft: { prompt: string; template?: string }) => void;
    takeDraft: () => Promise<{ prompt: string; template?: string } | undefined>;
    /** P6.2: true while the sidecar's Keychain read waits on a macOS access prompt (boot page only). */
    keychain?: () => Promise<boolean>;
  };
};

export const orbNative = (): OrbNative | undefined => (globalThis as { orbNative?: OrbNative }).orbNative;
