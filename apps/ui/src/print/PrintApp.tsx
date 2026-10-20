/**
 * The print routes (BUILD_PLAN P4.4): `#/print/canvas?canvasId&layout&theme&scope` and `#/print/doc?canvasId&scope`.
 * The main process loads one in a hidden window (apps/desktop/src/main/native.ts); nothing here has app chrome.
 *
 * 1. Load the canvas title and the board (one `board.follow` snapshot; the stream is closed at once).
 * 2. Snapshot every design frame in scope: the frame (its own sidecar page, P6.2, with animations off) is drawn alone
 *    at the top left of the window at 2x (`transform: scale(2)`); once it has posted that it is drawn (or after a
 *    short timeout), `orbNative.print.capture` takes that rectangle with `capturePage`, and the PNG is stored in the
 *    canvas's `assets/snapshots/` (named with its capture time) through the canvas service.
 * 3. Render the print halves (light tokens by default) and wait until the page is complete: fonts loaded, every
 *    Mermaid diagram drawn, every image decoded.
 * 4. Send `orbNative.print.ready({pages, cardTypes, snapshots})`; the main process then prints the page to PDF.
 *
 * Any failure is sent as `ready({ok: false, error})`, so the export ends with a message instead of a timeout.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  appearanceFromSettings,
  type Appearance,
  DESIGN_FRAME_READY,
  DESIGN_FRAME_SANDBOX,
  DesignData,
  readCardData,
  SNAPSHOT_SCALE,
  type BoardState,
  type Card,
  type Deck,
  type PortDoc,
  type PrintReady,
  type PrintRequest,
} from '@orb/shared';
import { applyAppearance, AppearanceContext, WorkspaceAppearanceContext } from '../theme/appearance.js';
import { setPrintChartTheme } from '../cards/chartSpec.js';
import { setDiagramTheme } from '../cards/mermaid.js';
import type { Wire } from '../wire/index.js';
import { CanvasPrint } from './CanvasPrint.js';
import { ComposedDocPrint, DocPrint } from './DocPrint.js';
import { DeckPrint } from './DeckPrint.js';
import { exportSlideCount } from '../deck/sources.js';
import { orbNative } from './native.js';
import { composedOutline, docOutline } from './outline.js';
import { cardsInScope, planCanvas, snapshotSize } from './plan.js';
import { PrintCtx, type PrintContext, type Snapshot } from './kit.js';
import p from './print.module.css';

/** One animation frame, or 100 ms when frames are throttled (a hidden window). */
const frame = () =>
  new Promise<void>((resolve) => {
    let done = false;
    requestAnimationFrame(() => {
      done = true;
      resolve();
    });
    setTimeout(() => !done && resolve(), 100);
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One `board.follow` snapshot as a board state (the stream is closed at once). Also used by the Port reading view. */
export async function loadBoard(wire: Wire, canvasId: string, signal: AbortSignal): Promise<BoardState> {
  const ac = new AbortController();
  const stop = () => ac.abort();
  signal.addEventListener('abort', stop, { once: true });
  try {
    for await (const f of wire.orb.board.follow(canvasId, { signal: ac.signal })) {
      if (f.kind !== 'snapshot') continue;
      return {
        seq: f.nextSeq - 1,
        cards: Object.fromEntries(f.cards.map((c) => [c.id, c])),
        frames: Object.fromEntries(f.frames.map((x) => [x.id, x])),
        links: Object.fromEntries(f.links.map((l) => [l.id, l])),
      };
    }
    throw new Error('the board stream ended before its snapshot');
  } finally {
    signal.removeEventListener('abort', stop);
    ac.abort();
  }
}

/** Wait until the page is complete: fonts, Mermaid diagrams, images. */
async function settle(root: HTMLElement): Promise<void> {
  await document.fonts.ready;
  const deadline = Date.now() + 30_000;
  while (
    root.querySelector(
      '[data-testid="print-diagram"][data-state="loading"], [data-testid="print-chart"][data-state="loading"]',
    )
  ) {
    if (Date.now() > deadline) throw new Error('a diagram or chart did not finish drawing');
    await sleep(25);
  }
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map(async (img) => {
      if (!img.complete)
        await new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      await img.decode().catch(() => undefined);
    }),
  );
  await document.fonts.ready;
  await frame();
  await frame();
}

/** P4.5: `doc` is the composed research document (null: the standard format is printed). */
type Loaded = {
  appearance: Appearance;
  title: string;
  board: BoardState;
  doc: PortDoc | null;
  deck: Deck | null;
};

/** How long a design frame may take to say it has drawn, after its page loaded (then it is captured anyway). */
const FRAME_READY_TIMEOUT_MS = 1500;
/** Time left for scripted drawing (e.g. a D3 transition) after the frame said it has drawn. */
const FRAME_SETTLE_MS = 300;

/** The design frame being snapshotted, alone at the top left at 2x; `onReady` once its page has drawn. */
function SnapshotStage({ card, src, onReady }: { card: Card; src: string; onReady: () => void }) {
  const size = snapshotSize(card);
  const iframe = useRef<HTMLIFrameElement>(null);
  const done = useRef(false);
  const ready = useRef(onReady);
  ready.current = onReady;
  const finish = () => {
    if (done.current) return;
    done.current = true;
    ready.current();
  };
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: unknown } | null;
      if (e.source === iframe.current?.contentWindow && data?.type === DESIGN_FRAME_READY) finish();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return (
    <div
      className={p.stage}
      style={{ width: size.w, height: size.h, transform: `scale(${SNAPSHOT_SCALE})` }}
      data-testid="print-stage"
    >
      <iframe
        ref={iframe}
        sandbox={DESIGN_FRAME_SANDBOX}
        src={src}
        referrerPolicy="no-referrer"
        title="Design frame snapshot"
        style={{ width: size.w, height: size.h }}
        onLoad={() => setTimeout(finish, FRAME_READY_TIMEOUT_MS)}
      />
    </div>
  );
}

export function PrintApp({ wire, request }: { wire: Wire; request: PrintRequest }) {
  const theme = request.kind === 'canvas' ? request.theme : 'light';
  // Diagrams are drawn in the print theme (before the first render).
  useState(() => {
    setDiagramTheme(theme === 'light' ? 'light' : 'night');
    setPrintChartTheme(theme === 'light' ? 'light' : 'night');
  });
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const [snapshots, setSnapshots] = useState<Map<string, Snapshot>>();
  const [staging, setStaging] = useState<{ card: Card; src: string; ready: () => void }>();
  const [ready, setReady] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const date = useMemo(
    () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    [],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'light' ? 'day' : 'night';
    document.documentElement.dataset.print = request.kind;
    document.title = 'orb print';
  }, [theme, request.kind]);

  const fail = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    setError(message);
    void orbNative()?.print?.ready({ ok: false, error: message.slice(0, 500) } satisfies PrintReady);
  };

  // 1. The canvas title and board.
  useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      wire.orb.canvas.list(ac.signal),
      loadBoard(wire, request.canvasId, ac.signal),
      request.kind === 'doc' ? wire.orb.port.get(request.canvasId, ac.signal).then((r) => r.doc) : null,
      request.kind === 'deck' ? wire.orb.deck.get(request.canvasId, ac.signal).then((r) => r.deck) : null,
      wire.orb.settings.get(ac.signal),
    ])
      .then(([list, board, doc, deck, settings]) => {
        const appearance = {
          ...appearanceFromSettings(settings),
          mode: theme === 'light' ? ('light' as const) : ('dark' as const),
        };
        applyAppearance(appearance, false);
        const title = list.find((c) => c.id === request.canvasId)?.title ?? 'Untitled canvas';
        if (request.kind !== 'deck' && request.scope !== 'all') {
          const missing = request.scope.filter((id) => !board.frames[id]);
          if (missing.length > 0) throw new Error(`frame ${missing[0]} is not on this canvas`);
        }
        if (request.kind === 'deck' && (!deck || deck.slides.length === 0))
          throw new Error('this canvas has no slides yet: compose them first');
        document.title = request.kind === 'doc' && doc ? doc.title : title;
        setLoaded({ title, board, doc, deck, appearance });
      })
      .catch((err: unknown) => !ac.signal.aborted && fail(err));
    return () => ac.abort();
  }, [wire, request]);

  // 2. Design-frame snapshots, one at a time.
  useEffect(() => {
    if (!loaded) return;
    let live = true;
    const native = orbNative();
    // A deck snapshots the design frames its slides show; the other prints, the frames of their scope.
    const pool: Card[] = loaded.deck
      ? [...new Set(loaded.deck.slides.flatMap((x) => (x.visual ? [x.visual.cardId] : [])))].flatMap((id) => {
          const c = loaded.board.cards[id];
          return c ? [c] : [];
        })
      : cardsInScope(
          loaded.board,
          loaded.doc ? loaded.doc.scope : request.kind === 'deck' ? 'all' : request.scope,
        );
    const designs = pool.filter((c) => c.type === 'design' && readCardData(DesignData, c.data)?.html);
    (async () => {
      const out = new Map<string, Snapshot>();
      if (native?.print) {
        for (const card of designs) {
          const version = readCardData(DesignData, card.data)?.version ?? 1;
          const src = wire.assets.designFrameUrl(request.canvasId, card.id, version, { print: true });
          await new Promise<void>((resolve) => setStaging({ card, src, ready: resolve }));
          await sleep(FRAME_SETTLE_MS);
          await frame();
          await frame();
          const size = snapshotSize(card);
          const png = await native.print.capture({
            x: 0,
            y: 0,
            width: size.w * SNAPSHOT_SCALE,
            height: size.h * SNAPSHOT_SCALE,
          });
          if (!live) return;
          if (!png) throw new Error('the design frame could not be captured');
          const ref = await wire.assets.uploadSnapshot(request.canvasId, { cardId: card.id, version, png });
          out.set(card.id, { url: wire.assets.url(request.canvasId, ref), capturedAt: ref.capturedAt });
        }
      }
      if (!live) return;
      setStaging(undefined);
      setSnapshots(out);
    })().catch((err: unknown) => live && fail(err));
    return () => {
      live = false;
    };
  }, [loaded, wire, request]);

  const ctx = useMemo<PrintContext>(
    () => ({
      assetUrl: (path) => wire.assets.url(request.canvasId, { path }),
      snapshots: snapshots ?? new Map(),
      frameUrl: (cardId, version) => wire.assets.designFrameUrl(request.canvasId, cardId, version),
    }),
    [wire, request.canvasId, snapshots],
  );
  const plan = useMemo(
    () =>
      loaded && request.kind === 'canvas'
        ? planCanvas(loaded.board, { layout: request.layout, scope: request.scope })
        : undefined,
    [loaded, request],
  );
  const outline = useMemo(
    () =>
      loaded && request.kind === 'doc' && !loaded.doc
        ? docOutline(loaded.board, loaded.title, request.scope)
        : undefined,
    [loaded, request],
  );
  const composed = useMemo(
    () =>
      loaded && request.kind === 'doc' && loaded.doc ? composedOutline(loaded.doc, loaded.board) : undefined,
    [loaded, request],
  );

  // 3 + 4. Wait for the page to be complete, then signal ready.
  const rendering = Boolean(loaded && snapshots && !error);
  useEffect(() => {
    if (!rendering || !root.current) return;
    let live = true;
    const el = root.current;
    settle(el)
      .then(() => {
        if (!live) return;
        const cardTypes: Record<string, number> = {};
        for (const card of Array.from(el.querySelectorAll<HTMLElement>('[data-testid="print-card"]'))) {
          const type = card.dataset.cardType ?? 'unknown';
          cardTypes[type] = (cardTypes[type] ?? 0) + 1;
        }
        setReady(true);
        void orbNative()?.print?.ready({
          ok: true,
          pages: plan ? plan.pages.length : loaded?.deck ? exportSlideCount(loaded.deck, loaded.board) : 0,
          cardTypes,
          snapshots: snapshots?.size ?? 0,
        } satisfies PrintReady);
      })
      .catch((err: unknown) => live && fail(err));
    return () => {
      live = false;
    };
  }, [rendering]);

  return (
    <div
      ref={root}
      className={request.kind === 'canvas' ? p.root : p.docRoot}
      data-testid="print-root"
      data-kind={request.kind}
      data-theme={theme}
      data-ready={ready || undefined}
      data-error={error}
    >
      {error && (
        <p className={p.error} role="alert">
          This export could not be printed: {error}
        </p>
      )}
      {staging && (
        <SnapshotStage key={staging.card.id} card={staging.card} src={staging.src} onReady={staging.ready} />
      )}
      {rendering && loaded && (
        <WorkspaceAppearanceContext.Provider value={loaded.appearance}>
          <AppearanceContext.Provider value={theme === 'light' ? 'day' : 'night'}>
            <PrintCtx.Provider value={ctx}>
              {plan && <CanvasPrint plan={plan} title={loaded.title} date={date} />}
              {outline && <DocPrint outline={outline} date={date} />}
              {composed && <ComposedDocPrint outline={composed} date={date} />}
              {loaded.deck && <DeckPrint deck={loaded.deck} board={loaded.board} />}
            </PrintCtx.Provider>
          </AppearanceContext.Provider>
        </WorkspaceAppearanceContext.Provider>
      )}
    </div>
  );
}
