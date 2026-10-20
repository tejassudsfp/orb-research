/**
 * Drop and paste on the board (P2.5). Files and links dropped from Finder or a browser land where they are dropped;
 * Cmd+V pastes an image, a link or text at the pointer (or the middle of the view). Uploads go through orb-host
 * (src/wire/assets.ts); the cards are added as one batch. A notice shows progress and anything refused.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type RefObject,
} from 'react';
import { databaseDataOf, newCardView } from '@orb/shared';
import type { BoardStore } from '../store/board.js';
import type { Wire } from '../wire/index.js';
import { toWorld, type Viewport } from '../canvas/viewport.js';
import { ingest, itemsFromTransfer, type IngestDeps, type IngestItem, type Placer } from './ingest.js';
import { pdfSummary } from './pdf.js';

export type Notice = { text: string; error: boolean } | null;

const isTyping = (target: EventTarget | null) =>
  target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]') !== null;

export async function imageSize(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export const accepts = (dt: DataTransfer | null) =>
  !!dt && ['Files', 'text/uri-list', 'text/plain'].some((t) => dt.types.includes(t));

/**
 * P6.1: the chat panel (and its pill) take drops and pastes as composer attachments: the board behind them must not
 * take them too.
 */
export const CHAT_DROP_ZONE = '[data-drop-zone="chat"]';
const inChat = (target: EventTarget | null) =>
  target instanceof Element && target.closest(CHAT_DROP_ZONE) !== null;

export function useIngest({
  wire,
  canvasId,
  store,
  root,
  viewportRef,
}: {
  wire: Wire;
  canvasId: string;
  store: BoardStore;
  root: RefObject<HTMLElement | null>;
  viewportRef: RefObject<Viewport>;
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const [dropActive, setDropActive] = useState(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((next: Notice, ms?: number) => {
    clearTimeout(timer.current);
    setNotice(next);
    if (ms) timer.current = setTimeout(() => setNotice(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  /** World point of a client point (or the middle of the view). */
  const worldAt = useCallback(
    (client?: { x: number; y: number } | null) => {
      const r = root.current!.getBoundingClientRect();
      const x = client ? client.x - r.left : r.width / 2;
      const y = client ? client.y - r.top : r.height / 2;
      return toWorld(viewportRef.current, x, y);
    },
    [root, viewportRef],
  );

  /**
   * Add the items as cards at `at` (or where `place` puts them). Resolves the ids of the cards added (real ids once
   * the service has confirmed them), empty when nothing landed.
   */
  const run = useCallback(
    async (items: IngestItem[], at: { x: number; y: number }, place?: Placer): Promise<string[]> => {
      if (items.length === 0) return [];
      show({
        text: items.length === 1 ? 'Adding to the board…' : `Adding ${items.length} items…`,
        error: false,
      });
      const deps: IngestDeps = {
        upload: (file) => wire.assets.upload(canvasId, file),
        pdfSummary: (bytes) => pdfSummary(bytes),
        imageSize,
        importData: async (file) => {
          const meta = await wire.data.import(canvasId, { name: file.name, body: file.body, mime: file.mime });
          const ds = await wire.data.read(canvasId, meta.id);
          return { data: databaseDataOf(meta.name, ds), view: newCardView(ds) };
        },
      };
      try {
        const { command, errors } = await ingest(items, at, store.getState().board, deps, place);
        let created: readonly string[] = [];
        const ok = command
          ? await store.getState().dispatch(command, {
              select: 'created',
              onPlanned: (ids) => (created = ids.filter((id) => id.startsWith('c_'))),
            })
          : true;
        if (!ok) show({ text: store.getState().error ?? 'Could not add to the board', error: true }, 8000);
        else if (errors.length > 0) show({ text: errors.join(' · '), error: true }, 8000);
        else show(null);
        return ok ? created.map((id) => store.getState().resolve(id)) : [];
      } catch (e) {
        show({ text: (e as Error).message, error: true }, 8000);
        return [];
      }
    },
    [wire, canvasId, store, show],
  );

  const onDragOver = useCallback((e: ReactDragEvent<HTMLElement>) => {
    if (inChat(e.target)) {
      // Over the chat panel: the panel takes it (P6.1); the board shows no drop target.
      setDropActive(false);
      return;
    }
    if (!accepts(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropActive(true);
  }, []);
  const onDragLeave = useCallback((e: ReactDragEvent<HTMLElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDropActive(false);
  }, []);
  const onDrop = useCallback(
    (e: ReactDragEvent<HTMLElement>) => {
      setDropActive(false);
      if (inChat(e.target) || !accepts(e.dataTransfer)) return;
      // Never let the window navigate to a dropped file or link.
      e.preventDefault();
      void run(itemsFromTransfer(e.dataTransfer), worldAt({ x: e.clientX, y: e.clientY }));
    },
    [run, worldAt],
  );
  const onPointerMove = useCallback((e: { clientX: number; clientY: number }) => {
    pointer.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onPointerLeave = useCallback(() => {
    pointer.current = null;
  }, []);

  // Cmd+V anywhere on the canvas screen (not in a text field): an image, a link, or text.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || inChat(e.target) || e.defaultPrevented || !e.clipboardData) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const items = itemsFromTransfer(e.clipboardData);
      if (items.length === 0) return;
      e.preventDefault();
      void run(items, worldAt(pointer.current));
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [run, worldAt]);

  // A drop that misses the board (on the chrome) must not navigate the window either.
  useEffect(() => {
    const stop = (e: DragEvent) => {
      if (accepts(e.dataTransfer)) e.preventDefault();
    };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  return { notice, show, dropActive, run, onDragOver, onDragLeave, onDrop, onPointerMove, onPointerLeave };
}
