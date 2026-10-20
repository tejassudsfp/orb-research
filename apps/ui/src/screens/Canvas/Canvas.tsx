/**
 * Canvas screen: the night space (stars, glows, dot grid that pans and scales with the board), the world layer from
 * the P2.2 renderer (`src/canvas/`: one transformed layer, viewport culling with a 20% margin, three levels of
 * detail) and the floating chrome from design/screens/canvas.html. Pan by dragging empty space, Space+drag or
 * scrolling; zoom with Cmd/Ctrl+scroll, pinch or the minimap buttons (25%–250%, towards the cursor).
 * P2.3: the board comes from the Zustand board store (optimistic commands); editing gestures are in
 * `useBoardInput` (select, move, marquee, resize, notes, frames, links), the selection/connect bar at the top.
 * P2.5: card UI halves (src/cards/), drop and paste (`useIngest`), the card reader (opening records `card.opened`)
 * and the reading queue.
 * P2.7: board search (Cmd+F, `BoardSearch`: flies to each result) and the keyboard (`useShortcuts`: Shift+1 fit,
 * Shift+2 selection, Cmd+0 100%, V/N/F/C tools; Delete and Cmd+Z / Cmd+Shift+Z stay in `useBoardInput`). Flights
 * centre their target in the screen area the chrome leaves free (`freeArea`).
 * P6.1: composer attachments (`attach`): files attached in the chat panel land in view, in the current frame or near
 * it (src/cards/attach.ts), through the same ingest path as a drop on the board.
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useStore } from 'zustand';
import {
  DatabaseData,
  assetMimeOf,
  cardTitle,
  databaseDataOf,
  newCardView,
  readCardData,
  searchBoard,
  TableData,
  threadOf,
  type BoardCommandInput,
  type BoardState,
  type CardView,
  type TableSort,
} from '@orb/shared';
import {
  BoardRefsContext,
  CardActionsContext,
  type CardActions,
  type DatasetChoice,
  type ReaderTab,
} from '../../cards/context.js';
import { Reader } from '../../cards/Reader.js';
import { useIngest } from '../../cards/useIngest.js';
import { currentFrame, freeSpot } from '../../cards/attach.js';
import { chartDraftOf } from '../../cards/chartFrom.js';
import type { IngestItem } from '../../cards/ingest.js';
import c from '../../cards/cards.module.css';
import { SelectionBar } from '../../canvas/SelectionBar.js';
import { useBoardInput, type LinkChoice } from '../../canvas/useBoardInput.js';
import { usePanZoom } from '../../canvas/usePanZoom.js';
import {
  actualSize,
  bounds,
  chromeInsets,
  inFreeArea,
  openingView,
  toWorld,
  fitView,
  focusView,
  gridStyle,
  zoomAt,
  type Insets,
  type Rect,
} from '../../canvas/viewport.js';
import { BoardSearch } from '../../canvas/BoardSearch.js';
import {
  flightTarget,
  frameAt,
  manualCardCommand,
  rectOf,
  type ManualCardKind,
} from '../../canvas/geometry.js';
import { AddCardMenu } from '../../canvas/AddCardMenu.js';
import { useShortcuts } from '../../canvas/useShortcuts.js';
import { Measurer } from '../../canvas/Measurer.js';
import { World } from '../../canvas/World.js';
import type { Wire } from '../../wire/index.js';
import { Minimap, TitlePill, Toolbar, TopRight, type Tool } from './Chrome.js';
import { ConversationPanel } from './ConversationPanel.js';
import { followUpsFor } from './followUps.js';
import { ProvenancePopover, ThreadPopover, type ScreenAnchor } from './AgentPopovers.js';
import { AGENT_COLORS, agentCursors } from './agentsView.js';
import { useCanvas } from './useCanvas.js';
import { Composer } from './Composer.js';
import type { CursorView } from '../../canvas/World.js';
import s from './Canvas.module.css';

/** The chrome does not depend on the viewport (except the minimap), so it does not re-render while panning. */
const StaticChrome = memo(function StaticChrome({
  onPublish,
  title,
  save,
  onRename,
  tool,
  onTool,
  theme,
  onTheme,
}: {
  onPublish: () => void;
  title: string;
  save: Parameters<typeof TitlePill>[0]['save'];
  onRename: (title: string) => Promise<boolean>;
  tool: Tool;
  onTool: (tool: Tool) => void;
  theme: import('@orb/shared').ThemeMode;
  onTheme: (theme: import('@orb/shared').ThemeMode) => void;
}) {
  return (
    <>
      <TitlePill title={title} save={save} onRename={onRename} />
      <TopRight onPublish={onPublish} theme={theme} onTheme={onTheme} />
      <Toolbar tool={tool} onTool={onTool} />
    </>
  );
});

const MemoPanel = memo(ConversationPanel);

/** The folded board, for tests that compare boards exactly across reopen (serialised only when the board changes). */
const BoardStateProbe = memo(function BoardStateProbe({ board }: { board: BoardState }) {
  return (
    <pre data-testid="orb-board-state" hidden>
      {JSON.stringify(board)}
    </pre>
  );
});

/**
 * The board has its own measured viewport beside the rail. Clear the toolbar, header, selection/search controls,
 * minimap and collapsed chat pill, using their current geometry at flight time.
 */
function freeArea(root: HTMLElement | null, content?: Rect | null): Insets {
  const base: Insets = { top: 80, right: 24, bottom: 24, left: 96 };
  if (!root) return base;
  const screen = root.getBoundingClientRect();
  const panels: Rect[] = [];
  for (const id of ['chat-pill', 'minimap-block', 'board-controls']) {
    const r = root
      .closest('[data-testid="canvas-workspace"]')
      ?.querySelector(`[data-testid="${id}"]`)
      ?.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) continue;
    panels.push({ x: r.left - screen.left, y: r.top - screen.top, w: r.width, h: r.height });
  }
  const insets = chromeInsets({ width: screen.width, height: screen.height }, panels, base, 16, content);
  // The area the last flight used, for tests and for anyone checking what the camera keeps clear of.
  root.dataset.freeArea = [insets.left, insets.top, insets.right, insets.bottom].map(Math.round).join(',');
  return insets;
}

type SearchState = { open: boolean; query: string; current: string | null; nonce: number };
const SEARCH_CLOSED: SearchState = { open: false, query: '', current: null, nonce: 0 };

export function CanvasScreen({
  wire,
  canvasId,
  focus,
  theme,
  onTheme,
}: {
  wire: Wire;
  canvasId: string;
  /** A card or frame to fly to once the board is loaded (a Home search hit, `#/canvas/<id>?focus=<item>`). */
  focus?: string;
  theme: import('@orb/shared').ThemeMode;
  onTheme: (theme: import('@orb/shared').ThemeMode) => void;
}) {
  const model = useCanvas(wire, canvasId);
  const root = useRef<HTMLDivElement>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [usingPlan, setUsingPlan] = useState(false);
  useEffect(() => {
    const ac = new AbortController();
    void wire.orb.models
      .describe(ac.signal)
      .then((description) => {
        if (!ac.signal.aborted)
          setUsingPlan(
            Object.values(description.effective).some((route) => route.provider === 'chatgpt-plan'),
          );
      })
      .catch(() => {});
    return () => ac.abort();
  }, [wire]);
  const [tool, setTool] = useState<Tool>('select');
  const [link, setLink] = useState<LinkChoice>({ type: 'supports' });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [reader, setReader] = useState<{ id: string; tab: ReaderTab } | null>(null);
  /** P3.6: the provenance or thread popover, anchored to a card (or a frame, for threads). */
  const [popover, setPopover] = useState<{ kind: 'why' | 'thread'; id: string } | null>(null);
  const pz = usePanZoom(root);
  const { viewport, size, update } = pz;
  const store = model.store;
  const board = useStore(store, (st) => st.board);
  const followUps = useMemo(
    () => followUpsFor(model.meta, board, model.team, model.agents),
    [model.meta, board, model.team, model.agents],
  );
  const selectionList = useStore(store, (st) => st.selection);
  const pendingCount = useStore(store, (st) => st.pending.length + st.historyBusy);
  const ready = useStore(store, (st) => st.ready);
  const aliases = useStore(store, (st) => st.aliases);
  const keys = useStore(store, (st) => st.keys);
  const selection = useMemo(() => new Set(selectionList), [selectionList]);
  const dispatch = useCallback(
    (command: BoardCommandInput) => void store.getState().dispatch(command),
    [store],
  );
  /** Record that the user opened a card (once per card; it ticks the card in the reading queue). */
  const markOpened = useCallback(
    (id: string) => {
      const st = store.getState();
      const card = st.board.cards[st.resolve(id)];
      if (card && !card.opened) void st.dispatch({ type: 'card.opened', id: card.id });
    },
    [store],
  );
  const openCard = useCallback(
    (id: string, tab: ReaderTab = 'card') => {
      setPopover(null);
      setReader({ id, tab });
      markOpened(id);
    },
    [markOpened],
  );
  const actions = useMemo<CardActions>(
    () => ({
      assetUrl: (asset) => wire.assets.url(canvasId, asset),
      designFrameUrl: (cardId, version) => wire.assets.designFrameUrl(canvasId, cardId, version),
      open: openCard,
      select: (id, selected) => {
        const st = store.getState();
        const resolved = st.resolve(id);
        if (st.board.cards[resolved])
          st.select(selected ? [resolved] : st.selection.filter((item) => item !== resolved));
      },
      sortTable: (id: string, sort: TableSort | undefined) => {
        const st = store.getState();
        const card = st.board.cards[st.resolve(id)];
        if (!card) return;
        const { sort: _old, ...data } = (card.data ?? {}) as Record<string, unknown>;
        void st.dispatch({
          type: 'card.updated',
          id: card.id,
          patch: { data: sort ? { ...data, sort } : data },
        });
      },
      openLink: (id: string, url: string) => {
        // The window-open handler in Electron main hands http(s) links to the default browser.
        window.open(url, '_blank', 'noopener,noreferrer');
        markOpened(id);
      },
      why: (id: string) =>
        setPopover((cur) => (cur?.kind === 'why' && cur.id === id ? null : { kind: 'why', id })),
      thread: (id: string) =>
        setPopover((cur) => (cur?.kind === 'thread' && cur.id === id ? null : { kind: 'thread', id })),
      // P6.3: datasets. Rows are read, edited and imported through orb-host; the cards that show a dataset get their
      // new size and `rev` from the sidecar (a `card.updated` on the follow stream).
      readDataset: (datasetId, signal) => wire.data.read(canvasId, datasetId, signal),
      editDataset: async (datasetId, edit) => {
        const saved = await wire.data.edit(canvasId, datasetId, edit);
        return { rev: saved.rev, rowCount: saved.rowCount };
      },
      datasets: (): DatasetChoice[] => {
        const seen = new Map<string, DatasetChoice>();
        for (const card of Object.values(store.getState().board.cards)) {
          const db = card.type === 'database' ? readCardData(DatabaseData, card.data) : undefined;
          const id = card.view?.datasetId ?? db?.datasetId;
          if (!id || seen.has(id)) continue;
          seen.set(id, {
            id,
            name: card.view?.name ?? db?.title ?? 'Data',
            rowCount: card.view?.rowCount ?? db?.rowCount ?? 0,
          });
        }
        return [...seen.values()];
      },
      importDataset: async (input) => {
        const meta = await wire.data.import(canvasId, input);
        return { id: meta.id, name: meta.name, rowCount: meta.rowCount };
      },
      setView: (cardId: string, view: CardView | null) =>
        void store.getState().dispatch({ type: 'card.updated', id: cardId, patch: { view } }),
      chartFrom: async (cardId: string) => {
        const st = store.getState();
        const src = st.board.cards[st.resolve(cardId)];
        if (!src) return;
        const draft = chartDraftOf(src);
        if (!draft) throw new Error('This card has no columns to chart.');
        const frame = src.frameId ? st.board.frames[src.frameId] : undefined;
        const near = { x: src.x - 60, y: src.y - 60, w: src.w + 120, h: src.h + 120 };
        const spot = freeSpot(st.board, { w: 440, h: 340 }, { ...(frame ? { frame } : {}), view: near });
        const before = new Set(Object.keys(st.board.cards));
        await st.dispatch({
          type: 'card.added',
          card: {
            type: 'chart',
            frameId: frameAt(Object.values(st.board.frames), spot.x + 220, spot.y + 170),
            x: spot.x,
            y: spot.y,
            w: 440,
            h: 340,
            data: draft,
          },
        });
        // Show the new chart: select it and fly to it (it may be off screen).
        const now = store.getState();
        const added = Object.values(now.board.cards).find((c) => c.type === 'chart' && !before.has(c.id));
        if (added) {
          now.select([added.id]);
          pz.flyTo(focusView(added, pz.viewportRef.current, pz.sizeRef.current, freeArea(root.current)));
        }
      },
      updateData: (cardId: string, data: unknown) =>
        void store.getState().dispatch({ type: 'card.updated', id: cardId, patch: { data } }),
      tableColumns: (cardId: string) => {
        const card = store.getState().board.cards[cardId];
        const d = card?.type === 'table' ? readCardData(TableData, card.data) : undefined;
        return d?.columns ?? [];
      },
      setData: (cardId: string, data: Record<string, unknown>) =>
        void store.getState().dispatch({ type: 'card.updated', id: cardId, patch: { data } }),
      uploadImage: (file: File) => {
        const mime = assetMimeOf(file.name, file.type);
        if (!mime || !mime.startsWith('image/'))
          return Promise.reject(new Error('Choose a PNG, JPG, GIF or WebP image.'));
        return wire.assets.upload(canvasId, { name: file.name, mime, body: file });
      },
      promoteTable: async (cardId: string) => {
        const made = await wire.data.promote(canvasId, cardId);
        await store.getState().dispatch({
          type: 'card.updated',
          id: cardId,
          patch: { type: 'database', data: made.data, view: made.view },
        });
      },
      confirmParallel: (cardId: string, approve: boolean) =>
        void wire.orb.parallel.confirm({ canvasId, cardId, approve }).catch(() => undefined),
    }),
    [wire, canvasId, store, openCard, markOpened, pz.flyTo, pz.viewportRef, pz.sizeRef],
  );
  const refs = useMemo(() => ({ links: board.links, cards: board.cards }), [board.links, board.cards]);
  // P6.20: heights the Measurer took go to the canvas service (it stores them and reflows the frames; the board follow
  // stream brings the result), and the cards glide to their new places.
  const [glideNonce, setGlideNonce] = useState(0);
  const sendHeights = useCallback(
    (heights: Record<string, number>) => {
      if (Object.keys(heights).length === 0) return;
      setGlideNonce((n) => n + 1);
      void wire.orb.board.command(canvasId, { type: 'layout.measured', heights }).catch(() => undefined);
    },
    [wire, canvasId],
  );
  // The screen clips the board (overflow hidden), but focusing a control inside a card near the edge would still
  // scroll it and shift the whole chrome: keep it at its origin; the board moves by the world transform only.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reset = () => {
      if (el.scrollLeft !== 0 || el.scrollTop !== 0) el.scrollTo(0, 0);
    };
    el.addEventListener('scroll', reset);
    return () => el.removeEventListener('scroll', reset);
  }, []);
  const ingest = useIngest({ wire, canvasId, store, root, viewportRef: pz.viewportRef });
  const input = useBoardInput({
    store,
    root,
    viewportRef: pz.viewportRef,
    spaceRef: pz.spaceRef,
    tool,
    setTool,
    link,
    onFrameCreated: setRenaming,
    onOpenCard: openCard,
  });
  const renameFrame = useCallback(
    (id: string, title: string) => dispatch({ type: 'frame.updated', id, patch: { title } }),
    [dispatch],
  );
  const endRename = useCallback(() => setRenaming(null), []);
  // A frame renamed right after it was drawn may have its real id by now.
  const renamingId = renaming ? (aliases[renaming] ?? renaming) : null;
  // The fold keeps an untouched record identical, so these only change when cards (or frames) do.
  const cardRecord = board.cards;
  const frameRecord = board.frames;
  // Cards stacked into a stack card (P3.2 consolidate_cards) are not drawn: the stack stands for them.
  const cards = useMemo(() => Object.values(cardRecord).filter((c) => !c.stackedInto), [cardRecord]);
  const frames = useMemo(() => Object.values(frameRecord), [frameRecord]);

  // Camera moves the user makes from the chrome (the minimap and its buttons) are theirs: the canvas stops fitting itself.
  const touch = pz.touch;
  const zoomStep = useCallback(
    (factor: number) => {
      touch();
      update((v) => zoomAt(v, factor, size.width / 2, size.height / 2));
    },
    [update, size, touch],
  );
  const jump = useCallback(
    (wx: number, wy: number) => {
      touch();
      update((v) => ({ ...v, panX: size.width / 2 - wx * v.zoom, panY: size.height / 2 - wy * v.zoom }));
    },
    [update, size, touch],
  );
  const reset = useCallback(() => {
    touch();
    update(() => ({ panX: 0, panY: 0, zoom: 1 }));
  }, [update, touch]);
  const { flyTo, sizeRef, viewportRef } = pz;
  /** Fly so that `rect` fills the free area (zoom clamped to 25%–250%). */
  const flyToRect = useCallback(
    (rect: Rect | null) => {
      if (rect) flyTo(fitView(rect, sizeRef.current, freeArea(root.current, rect)));
    },
    [flyTo, sizeRef],
  );
  /** Shift+1: the whole board (every card and frame); an empty board goes back to the origin at 100%. */
  const fitBoard = useCallback(() => {
    const b = store.getState().board;
    const box = bounds([...Object.values(b.frames), ...Object.values(b.cards).filter((c) => !c.stackedInto)]);
    if (box) flyToRect(box);
    else flyTo({ panX: 0, panY: 0, zoom: 1 });
  }, [store, flyTo, flyToRect]);
  const [repacking, setRepacking] = useState(false);
  const repackBoard = useCallback(async () => {
    if (repacking) return;
    setRepacking(true);
    try {
      const result = await wire.orb.board.command(canvasId, { type: 'layout.repacked' });
      // Fit only after the follow stream applied the complete group, including any earlier concurrent writes.
      const seq = result.events.at(-1)?.seq ?? 0;
      if (store.getState().confirmed.seq < seq)
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            unsubscribe();
            reject(new Error('Waiting for the rearranged board to sync.'));
          }, 8000);
          const unsubscribe = store.subscribe((state) => {
            if (state.confirmed.seq >= seq) {
              clearTimeout(timeout);
              unsubscribe();
              resolve();
            }
          });
        });
      if (result.history) store.setState({ history: result.history });
      setGlideNonce((n) => n + 1);
      fitBoard();
    } catch (error) {
      store.setState({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setRepacking(false);
    }
  }, [wire, canvasId, store, fitBoard, repacking]);
  // ---- The camera (P6.20): fit on open, follow while the user has not moved it, remembered per canvas ----
  const cameraRestored = useRef(false);
  const fittedOnce = useRef(false);
  const savedMeta = model.meta;
  useEffect(() => {
    if (!ready || !savedMeta || focus || sizeRef.current.width === 0) return;
    if (!cameraRestored.current) {
      cameraRestored.current = true;
      // Where the user left it last time.
      if (savedMeta.camera) {
        pz.touchedRef.current = true;
        update(() => savedMeta.camera!);
        return;
      }
    }
    if (pz.touchedRef.current) return;
    const content = bounds([...frames, ...cards]);
    if (!content) return;
    const insets = freeArea(root.current, content);
    if (fittedOnce.current && inFreeArea(content, viewportRef.current, sizeRef.current, insets)) return;
    const view = openingView(content, sizeRef.current, insets);
    if (!view) return;
    // The first fit is the opening view (no flight); later ones (agents grew the board past the screen, the measured
    // heights reflowed it) glide, and the camera stays clear of the chat panel, reading queue and minimap.
    if (!fittedOnce.current) {
      fittedOnce.current = true;
      update(() => view);
    } else flyTo(view, { auto: true });
  }, [
    ready,
    savedMeta,
    focus,
    frames,
    cards,
    size.width,
    size.height,
    update,
    flyTo,
    sizeRef,
    viewportRef,
    pz.touchedRef,
  ]);
  // The camera the user leaves is remembered (canvas.json), a moment after it stops moving and when the screen closes.
  const latestCamera = useRef(viewport);
  latestCamera.current = viewport;
  const cameraSent = useRef<string>('');
  const sendCamera = useCallback(() => {
    if (!pz.touchedRef.current) return;
    const v = latestCamera.current;
    const key = `${v.panX.toFixed(1)}|${v.panY.toFixed(1)}|${v.zoom.toFixed(4)}`;
    if (key === cameraSent.current) return;
    cameraSent.current = key;
    void wire.orb.canvas
      .camera(canvasId, { camera: { panX: v.panX, panY: v.panY, zoom: v.zoom } })
      .catch(() => undefined);
  }, [wire, canvasId, pz.touchedRef]);
  useEffect(() => {
    if (!pz.touchedRef.current) return;
    const timer = setTimeout(sendCamera, 900);
    return () => clearTimeout(timer);
  }, [viewport, sendCamera, pz.touchedRef]);
  useEffect(() => () => sendCamera(), [sendCamera]);
  /** Shift+2: the selected cards and frames (a selected link counts as its two ends). */
  const fitSelection = useCallback(() => {
    const st = store.getState();
    const rects: Rect[] = [];
    for (const raw of st.selection) {
      const id = st.resolve(raw);
      const link = id.startsWith('l_') ? st.board.links[id] : undefined;
      for (const end of link ? [link.from, link.to] : [id]) {
        const r = rectOf(st.board, end);
        if (r) rects.push(r);
      }
    }
    flyToRect(bounds(rects));
  }, [store, flyToRect]);
  /** Cmd+0: 100%, keeping what is at the centre of the free area. */
  const toActualSize = useCallback(
    () => flyTo(actualSize(viewportRef.current, sizeRef.current, freeArea(root.current))),
    [flyTo, viewportRef, sizeRef],
  );

  // ---- Add card menu (the toolbar's Add card tool) ----
  /** The world point at the centre of the free screen area (where Add card puts a new card). */
  const freeCentre = useCallback(() => {
    const free = freeArea(root.current);
    const { width, height } = sizeRef.current;
    return toWorld(
      viewportRef.current,
      (free.left + width - free.right) / 2,
      (free.top + height - free.bottom) / 2,
    );
  }, [viewportRef, sizeRef]);
  const closeAddMenu = useCallback(() => {
    setTool('select');
    root.current?.querySelector<HTMLElement>('[data-testid="tool-add-card"]')?.focus();
  }, []);
  const addText = useCallback(
    async (type: ManualCardKind) => {
      setTool('select');
      const st = store.getState();
      const at = freeCentre();
      const done = st.dispatch(manualCardCommand(st.board, type, at.x, at.y), { select: 'created' });
      const pending = store.getState().selection[0];
      // Open it to write its text once the service has confirmed it (its real id), so the reader does not remount
      // under the user's typing when the pending id is swapped for the real one.
      if ((await done) && pending) setReader({ id: store.getState().resolve(pending), tab: 'card' });
    },
    [store, freeCentre],
  );
  const runIngest = ingest.run;
  const addLink = useCallback(
    (url: string) => {
      setTool('select');
      void runIngest([{ kind: 'url', url }], freeCentre());
    },
    [runIngest, freeCentre],
  );
  const addDatabase = useCallback(
    async (choice: DatasetChoice) => {
      setTool('select');
      try {
        const ds = await wire.data.read(canvasId, choice.id);
        const st = store.getState();
        const at = freeCentre();
        const size = { w: 560, h: 360 };
        const x = Math.round(at.x - size.w / 2);
        const y = Math.round(at.y - size.h / 2);
        await st.dispatch(
          {
            type: 'card.added',
            card: {
              type: 'database',
              frameId: frameAt(Object.values(st.board.frames), x + size.w / 2, y + size.h / 2),
              x,
              y,
              ...size,
              data: databaseDataOf(ds.name, ds),
              view: newCardView(ds),
            },
          },
          { select: 'created' },
        );
      } catch (err) {
        ingest.show({ text: (err as Error).message, error: true }, 8000);
      }
    },
    [wire, canvasId, store, freeCentre, ingest],
  );
  const addFiles = useCallback(
    (files: File[]) => {
      setTool('select');
      void runIngest(
        files.map((file) => ({ kind: 'file', file })),
        freeCentre(),
      );
    },
    [runIngest, freeCentre],
  );

  // ---- Composer attachments (P6.1) ----
  /** The free screen area in world coordinates. */
  const freeView = useCallback((): Rect => {
    const free = freeArea(root.current);
    const { width, height } = sizeRef.current;
    const a = toWorld(viewportRef.current, free.left, free.top);
    const b = toWorld(viewportRef.current, width - free.right, height - free.bottom);
    return { x: a.x, y: a.y, w: Math.max(0, b.x - a.x), h: Math.max(0, b.y - a.y) };
  }, [viewportRef, sizeRef]);
  const attach = useCallback(
    async (items: IngestItem[]): Promise<string[]> => {
      const st = store.getState();
      const view = freeView();
      const frame = currentFrame(
        st.board,
        view,
        st.selection.map((id) => st.resolve(id)),
      );
      const taken: Rect[] = [];
      const place = (size: { w: number; h: number }) => {
        const spot = freeSpot(store.getState().board, size, { frame, view, taken });
        taken.push({ ...spot, ...size });
        return spot;
      };
      const ids = await runIngest(items, freeCentre(), place);
      // A card that could not land wholly in view (a full frame filling the view) is brought into view: the view
      // widens just enough to hold what it showed and the new cards (it never zooms in).
      const b = store.getState().board;
      const now = freeView();
      const rects = ids.flatMap((id) => (b.cards[id] ? [b.cards[id]] : []));
      const outside = rects.some(
        (r) => r.x < now.x || r.y < now.y || r.x + r.w > now.x + now.w || r.y + r.h > now.y + now.h,
      );
      if (outside) flyToRect(bounds([now, ...rects]));
      return ids;
    },
    [store, freeView, runIngest, freeCentre, flyToRect],
  );

  // ---- Board search (Cmd+F) ----
  const [search, setSearch] = useState<SearchState>(SEARCH_CLOSED);
  const returnFocus = useRef<HTMLElement | null>(null);
  const searchOpen = search.open;
  const { interactionRef } = pz;
  const focusAnchor = useRef<{ id: string; rect: Rect; interaction: number } | null>(null);
  const focusItem = useCallback(
    (raw: string) => {
      const st = store.getState();
      const target = flightTarget(st.board, st.resolve(raw));
      if (!target) return;
      st.select([target.id]);
      flyTo(focusView(target.rect, viewportRef.current, sizeRef.current, freeArea(root.current)));
      focusAnchor.current = { id: target.id, rect: { ...target.rect }, interaction: interactionRef.current };
    },
    [store, flyTo, viewportRef, sizeRef, interactionRef],
  );
  // Measurements can reflow a frame after a search flight. Keep its target in view until the next explicit camera action.
  useEffect(() => {
    const anchor = focusAnchor.current;
    if (!anchor) return;
    if (anchor.interaction !== interactionRef.current) {
      focusAnchor.current = null;
      return;
    }
    const target = flightTarget(board, anchor.id);
    if (!target) {
      focusAnchor.current = null;
      return;
    }
    const a = anchor.rect,
      b = target.rect;
    if (a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h) return;
    focusAnchor.current = { ...anchor, id: target.id, rect: { ...b } };
    flyTo(focusView(b, viewportRef.current, sizeRef.current, freeArea(root.current)), { auto: true });
  }, [board, flyTo, viewportRef, sizeRef, interactionRef]);
  /** Select a result and fly to it (centred in the free area, drawn in full). */
  const showResult = useCallback(
    (id: string | null) => {
      if (!id) return;
      const st = store.getState();
      if (!st.board.cards[id]) return;
      focusItem(id);
    },
    [store, focusItem],
  );
  // A Home search hit opens the canvas with `focus`: once the board is loaded and measured, select that card or
  // frame and fly to it (once per focus value).
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || !ready || focused.current === focus || size.width === 0) return;
    const st = store.getState();
    const target = flightTarget(st.board, st.resolve(focus));
    if (!target) return;
    focused.current = focus;
    focusItem(target.id);
  }, [focus, ready, board, size.width, store, focusItem]);
  /** Cmd+F: open the bar (remembering where the focus was), or focus and select its query again. */
  const openSearch = useCallback(() => {
    if (!searchOpen) {
      const active = document.activeElement;
      returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    setSearch((cur) => ({ ...cur, open: true, nonce: cur.nonce + 1 }));
  }, [searchOpen]);
  const searchQuery = useCallback(
    (query: string) => {
      const first = searchBoard(store.getState().board, query)[0] ?? null;
      setSearch((cur) => ({ ...cur, query, current: first }));
      showResult(first);
    },
    [store, showResult],
  );
  const searchStep = useCallback(
    (delta: 1 | -1) => {
      const results = searchBoard(store.getState().board, search.query);
      if (results.length === 0) return;
      const at = search.current ? results.indexOf(search.current) : -1;
      const next =
        at < 0 ? (delta > 0 ? 0 : results.length - 1) : (at + delta + results.length) % results.length;
      const id = results[next]!;
      setSearch((cur) => ({ ...cur, current: id }));
      showResult(id);
    },
    [store, search.query, search.current, showResult],
  );
  const closeSearch = useCallback(() => {
    setSearch((cur) => ({ ...SEARCH_CLOSED, nonce: cur.nonce }));
    const back = returnFocus.current;
    returnFocus.current = null;
    if (back?.isConnected) back.focus();
  }, []);
  // Results for the bar and the rings on the cards (recomputed when the board changes while the bar is open).
  const searchResults = useMemo(
    () => (search.open ? searchBoard(board, search.query) : []),
    [search.open, search.query, board],
  );
  const found = useMemo(
    () =>
      search.open && searchResults.length > 0
        ? { ids: new Set(searchResults), current: search.current }
        : undefined,
    [search.open, searchResults, search.current],
  );

  useShortcuts({ setTool, openSearch, fitBoard, fitSelection, actualSize: toActualSize });

  // ---- Agents (P3.6): cursors, popovers, the panel's links to the board ----
  const team = model.team;
  const cursors = useMemo<CursorView[]>(
    () =>
      agentCursors(board, team).map((c) => ({
        agent: c.agent,
        x: c.x,
        y: c.y,
        label: c.label,
        idle: c.state !== 'running',
        bg: AGENT_COLORS[c.agent].bg,
        fg: AGENT_COLORS[c.agent].fg,
      })),
    [board, team],
  );
  /** Select a card or frame and fly to it (activity links and context chips in the panel). */
  const showItem = useCallback(
    (raw: string) => {
      focusItem(raw);
    },
    [focusItem],
  );
  const closePopover = useCallback(() => setPopover(null), []);
  const { context: ctxIds, setContext } = model;
  const toggleContext = useCallback(
    (ids: string[], add: boolean) =>
      setContext(
        add
          ? [...ctxIds, ...ids.filter((id) => !ctxIds.includes(id))]
          : ctxIds.filter((id) => !ids.includes(id)),
      ),
    [ctxIds, setContext],
  );
  const popoverId = popover ? (aliases[popover.id] ?? popover.id) : null;
  const popoverRect = popoverId ? rectOf(board, popoverId) : undefined;
  const anchor: ScreenAnchor | undefined = popoverRect
    ? (() => {
        const W = 320;
        const right = viewport.panX + (popoverRect.x + popoverRect.w) * viewport.zoom + 12;
        const leftSide = viewport.panX + popoverRect.x * viewport.zoom - 12 - W;
        const placement = right + W <= size.width - 16 || leftSide < 16 ? 'right' : 'left';
        const left = Math.max(16, Math.min(placement === 'right' ? right : leftSide, size.width - W - 16));
        const top = Math.max(80, Math.min(viewport.panY + popoverRect.y * viewport.zoom, size.height - 240));
        return { left, top, placement, maxHeight: Math.max(160, size.height - top - 16) };
      })()
    : undefined;
  const whyCard = popover?.kind === 'why' && popoverId ? board.cards[popoverId] : undefined;
  const threadTitle =
    popover?.kind === 'thread' && popoverId
      ? board.cards[popoverId]
        ? cardTitle(board.cards[popoverId]!)
        : board.frames[popoverId]?.title
      : undefined;
  const sendThread = model.sendThread;
  const onThreadSend = useCallback(
    (text: string) => (popoverId ? sendThread(popoverId, text) : Promise.resolve(false)),
    [sendThread, popoverId],
  );
  const conversation = model.conversation;
  const threadLive =
    popover?.kind === 'thread' && conversation.live?.thread === popoverId
      ? conversation.live.text
      : undefined;
  const threadReplying =
    popover?.kind === 'thread' && conversation.running && conversation.turns.at(-1)?.thread === popoverId;
  const stop = model.stop;
  const onStop = useCallback(() => void stop(), [stop]);
  const control = model.control;
  const onControl = useCallback(
    (agent: Parameters<typeof control>[0], action: Parameters<typeof control>[1], text?: string) =>
      void control(agent, action, text),
    [control],
  );
  // P4.4: Publish Port and the panel's Compose button open the Port composer sheet.
  const [composer, setComposer] = useState<{ frames: string[] } | null>(null);
  const onCompose = useCallback(
    () => setComposer({ frames: store.getState().selection.filter((id) => id.startsWith('f_')) }),
    [store],
  );
  const closeComposer = useCallback(() => setComposer(null), []);
  const loadCost = useCallback(
    (signal: AbortSignal) => wire.orb.cost.get(canvasId, signal),
    [wire, canvasId],
  );

  const onWorkspacePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // A press outside the Add card menu closes it (and still does what it does on the board).
    if (
      tool === 'add-card' &&
      !(e.target as Element).closest('[data-panel="add-card"], [data-testid="tool-add-card"]')
    ) {
      setTool('select');
    }
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // The user working on the board (a press on the board itself, not a panel or a button) takes over the camera: the
    // canvas stops fitting itself to what agents add (P6.20).
    if (!(e.target as Element).closest('[data-panel], button, input, textarea, select')) touch();
    if (!input.onPointerDown(e)) pz.onPointerDown(e);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    ingest.onPointerMove(e);
    if (!input.onPointerMove(e)) pz.onPointerMove(e);
  };
  /** Reading/search dropdown: use the same focus anchor as board search, so late measurements keep it visible. */
  const pickQueued = useCallback(
    (id: string) => {
      if (!store.getState().board.cards[id]) return;
      focusItem(id);
      openCard(id);
    },
    [store, focusItem, openCard],
  );
  // P4.5: Open on an unread Must read card in the composer: close the sheet and open the card on the board.
  const openFromComposer = useCallback(
    (id: string) => {
      setComposer(null);
      pickQueued(id);
    },
    [pickQueued],
  );
  const closeReader = useCallback(() => setReader(null), []);
  const readerTab = useCallback((tab: ReaderTab) => setReader((r) => (r ? { ...r, tab } : r)), []);
  const readerCard = reader ? board.cards[aliases[reader.id] ?? reader.id] : undefined;
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!input.onPointerUp(e)) pz.onPointerUp(e);
  };

  const className = [
    s.space,
    pz.dragging ? s.dragging : '',
    pz.spaceHeld ? s.panMode : '',
    tool !== 'select' ? s.toolMode : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={s.workspace} data-testid="canvas-workspace" onPointerDownCapture={onWorkspacePointerDown}>
      <CardActionsContext.Provider value={actions}>
        <BoardRefsContext.Provider value={refs}>
          <div
            style={{ display: 'contents' }}
            inert={Boolean(readerCard && reader)}
            data-testid="canvas-background"
          >
            <div
              ref={root}
              className={className}
              data-testid="canvas-screen"
              data-canvas-id={model.meta?.id ?? ''}
              data-session-id={model.meta?.rootSessionId ?? ''}
              data-follow={model.follow}
              data-frames={model.frames}
              data-snapshot={model.snapshot ?? ''}
              data-tool={tool}
              data-pending={pendingCount}
              data-selection={selectionList.length}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={input.onDoubleClick}
              onDragOver={ingest.onDragOver}
              onDragLeave={ingest.onDragLeave}
              onDrop={ingest.onDrop}
              onPointerLeave={ingest.onPointerLeave}
            >
              <div aria-hidden="true" className={s.glowSignal} />
              <div aria-hidden="true" className={s.glowRho} />
              <div aria-hidden="true" className={s.glowSky} />
              <div aria-hidden="true" className={s.grid} data-testid="dot-grid" style={gridStyle(viewport)} />
              <World
                viewport={viewport}
                size={size}
                cards={cards}
                frames={frames}
                ready={ready}
                moving={pz.moving}
                board={board}
                selection={selection}
                overlay={input.overlay}
                renaming={renamingId}
                onRenameFrame={renameFrame}
                onRenameEnd={endRename}
                keys={keys}
                found={found}
                cursors={cursors}
                glideNonce={glideNonce}
              />
              <Measurer cards={cards} ready={ready} report={sendHeights} />

              <StaticChrome
                theme={theme}
                onTheme={onTheme}
                onPublish={onCompose}
                title={model.meta?.title ?? ''}
                save={model.save}
                onRename={model.rename}
                tool={tool}
                onTool={setTool}
              />
              {tool === 'add-card' && (
                <AddCardMenu
                  onText={(type) => void addText(type)}
                  onLink={addLink}
                  onFiles={addFiles}
                  onDatabase={(choice) => void addDatabase(choice)}
                  onClose={closeAddMenu}
                />
              )}
              <div className={s.boardControls} data-panel="board-controls" data-testid="board-controls">
                {search.open && (
                  <BoardSearch
                    query={search.query}
                    count={searchResults.length}
                    index={search.current ? searchResults.indexOf(search.current) : -1}
                    focusNonce={search.nonce}
                    onQuery={searchQuery}
                    onStep={searchStep}
                    onClose={closeSearch}
                  />
                )}
                <SelectionBar
                  board={board}
                  selection={selectionList}
                  connecting={tool === 'connect'}
                  link={link}
                  onLinkChoice={setLink}
                  dispatch={dispatch}
                  onRenameFrame={setRenaming}
                  onOpenCard={openCard}
                  onChart={(id) =>
                    void actions
                      .chartFrom(id)
                      .catch((e: Error) => ingest.show({ text: e.message, error: true }, 8000))
                  }
                  onPromote={(id) =>
                    void actions
                      .promoteTable(id)
                      .catch((e: Error) => ingest.show({ text: e.message, error: true }, 8000))
                  }
                  context={model.context}
                  onContext={toggleContext}
                />
              </div>
              {ingest.dropActive && (
                <div className={c.dropTarget} data-testid="drop-target" aria-hidden="true" />
              )}
              {ingest.notice && (
                <div
                  className={ingest.notice.error ? c.noticeError : c.notice}
                  data-panel="notice"
                  data-testid="board-notice"
                  data-error={ingest.notice.error || undefined}
                  role="status"
                >
                  {ingest.notice.text}
                </div>
              )}
              <Minimap
                cards={cards}
                frames={frames}
                viewport={viewport}
                size={size}
                onZoomStep={zoomStep}
                onReset={reset}
                onJump={jump}
                onFit={fitBoard}
                onFitSelection={fitSelection}
                onRepack={() => void repackBoard()}
                repacking={repacking || store.getState().pending.length > 0}
                hasSelection={selectionList.length > 0}
              />
              {whyCard && anchor && (
                <ProvenancePopover
                  card={whyCard}
                  anchor={anchor}
                  loadTurn={model.loadTurn}
                  onClose={closePopover}
                />
              )}
              {popover?.kind === 'thread' && popoverId && threadTitle !== undefined && anchor && (
                <ThreadPopover
                  title={threadTitle}
                  anchorId={popoverId}
                  anchor={anchor}
                  messages={threadOf(board, popoverId)}
                  live={threadLive}
                  replying={threadReplying}
                  error={model.error ?? (model.agents?.state === 'idle' && model.agents.failure &&
                    (threadOf(board, popoverId).at(-1)?.at ?? Infinity) <= (model.agents.at ?? 0)
                    ? model.agents.failure.message : undefined)}
                  paused={model.agents?.state === 'paused'}
                  onSend={onThreadSend}
                  onClose={closePopover}
                />
              )}
            </div>
            <MemoPanel
              open={chatOpen}
              usingPlan={usingPlan}
              onOpenChange={setChatOpen}
              conversation={model.conversation}
              pending={model.pending}
              {...(model.agents ? { agents: model.agents } : {})}
              team={model.team}
              board={board}
              context={model.context}
              onContext={model.setContext}
              stopping={model.stopping}
              {...(model.error ? { error: model.error } : {})}
              disabled={!model.meta}
              onSend={model.send}
              onStop={onStop}
              onControl={onControl}
              onCompose={onCompose}
              onShowItem={showItem}
              onOpenCard={pickQueued}
              loadCost={loadCost}
              onAttach={attach}
              onConfirmParallel={actions.confirmParallel}
              followUps={followUps}
            />
          </div>
          {readerCard && reader && (
            <Reader
              card={readerCard}
              tab={reader.tab}
              onTab={readerTab}
              onClose={closeReader}
              dispatch={dispatch}
            />
          )}
          {composer && (
            <Composer
              wire={wire}
              canvasId={canvasId}
              frames={frames}
              selectedFrames={composer.frames}
              board={board}
              onOpenCard={openFromComposer}
              onClose={closeComposer}
            />
          )}
          <BoardStateProbe board={model.board} />
        </BoardRefsContext.Provider>
      </CardActionsContext.Provider>
    </div>
  );
}
