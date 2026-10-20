import type { Appearance } from '@orb/shared';
/**
 * Builder's card UI halves (BUILD_PLAN P3.8; P6.2 interactive frames):
 *
 * - **Design frame**: the card's HTML as its own sidecar page (`/api/orb-design/frame`, orb-host
 *   packages/orb-host/src/design.ts) in an iframe with `sandbox="allow-scripts"` (never `allow-same-origin`). The
 *   page carries its own CSP: its inline scripts run (Chart.js and D3 are bundled), nothing reaches the network. On
 *   the board the screen is drawn at a desktop width (`DESIGN_VIEW_WIDTH`) scaled down to the card and lets the
 *   pointer through so the card drags and the board pans; the reader shows it larger and live (hover, clicks). A
 *   new version (Builder rewrote it after a chat request) loads the new page and shows its time ("Updated 14:32 ·
 *   v2").
 * - **Diagram**: the Mermaid source rendered live with `mermaid.render` (mermaid.ts), or the parse error.
 */
import { useEffect, useState } from 'react';
import { DESIGN_FRAME_SANDBOX, DesignData, DiagramData, readCardData, type Card } from '@orb/shared';
import { updatedLabel } from './design.js';
import { cachedDiagram, renderDiagram, type DiagramRender, type DiagramTheme } from './mermaid.js';
import { useAppearance, useWorkspaceAppearance } from '../theme/appearance.js';
import { useCardActions } from './context.js';
import c from './cards.module.css';
import { VisualViewport } from './VisualViewport.js';

/** The width (CSS px) a design frame is laid out at on the board, before it is scaled down to its card. */
export const DESIGN_VIEW_WIDTH = 640;
/** ...and in the reader, scaled to the reader's width. */
export const DESIGN_READER_WIDTH = 960;

/** The space a design card's chrome takes (padding, kind, title, time, why, author row) on the board. */
const DESIGN_CHROME = 172;

/** One design frame: its own page in a sandboxed iframe, laid out at `viewWidth` and scaled to `width`. */
export function DesignFrame({
  src,
  title,
  width,
  height,
  live,
  version,
  testid,
  viewWidth = DESIGN_VIEW_WIDTH,
}: {
  /** The frame page's URL (wire.assets.designFrameUrl). */
  src: string;
  /** The width the screen is laid out at (then scaled to `width`). */
  viewWidth?: number;
  title: string;
  width: number;
  height: number;
  /** True in the reader: the frame takes the pointer (hover, clicks). False on the board. */
  live: boolean;
  version: number;
  testid: string;
}) {
  const scale = width / viewWidth;
  return (
    <div
      className={c.designViewport}
      style={{ width, height }}
      data-testid={`${testid}-viewport`}
      aria-label={`Design frame: ${title}`}
    >
      <iframe
        className={c.designIframe}
        sandbox={DESIGN_FRAME_SANDBOX}
        src={src}
        title={title}
        referrerPolicy="no-referrer"
        tabIndex={live ? 0 : -1}
        data-testid={testid}
        data-version={version}
        style={{
          width: viewWidth,
          height: Math.ceil(height / scale),
          transform: `scale(${scale})`,
          pointerEvents: live ? 'auto' : 'none',
        }}
      />
    </div>
  );
}

/** "Updated 14:32 · v2" (the version only once there is more than one). */
function DesignStamp({ data }: { data: DesignData }) {
  if (data.updatedAt === undefined) return null;
  const version = data.version ?? 1;
  return (
    <span
      className={c.designStamp}
      data-testid="design-updated"
      data-updated-at={data.updatedAt}
      data-version={version}
      title={new Date(data.updatedAt).toLocaleString()}
    >
      {updatedLabel(data.updatedAt)}
      {version > 1 ? ` · v${version}` : ''}
    </span>
  );
}

/** A design card on the board: the live preview at full LOD, a static sketch at compact LOD. */
export function DesignBody({ card, lod }: { card: Card; lod: 'full' | 'compact' }) {
  const { designFrameUrl } = useCardActions();
  const d = readCardData(DesignData, card.data);
  if (!d?.html) {
    return <p className={c.designEmpty}>No screen yet.</p>;
  }
  if (lod === 'compact') {
    return (
      <div className={c.designSketch} aria-hidden="true" data-testid="design-sketch">
        <div className={c.designSketchSide} />
        <div className={c.designSketchMain}>
          <div className={c.designSketchLine} />
          <div className={c.designSketchBox} />
          <div className={c.designSketchButton} />
        </div>
      </div>
    );
  }
  const width = Math.max(120, card.w - 30);
  const height = Math.max(120, card.h - DESIGN_CHROME);
  return (
    <>
      <DesignFrame
        src={designFrameUrl(card.id, d.version ?? 1)}
        title={d.title ?? 'Design frame'}
        width={width}
        height={height}
        live={false}
        version={d.version ?? 1}
        testid="design-frame"
      />
      <DesignStamp data={d} />
    </>
  );
}

/** A design card in the reader: the screen at the reader's full width, live, with its time and file. */
export function DesignReader({ card }: { card: Card }) {
  const { designFrameUrl } = useCardActions();
  const d = readCardData(DesignData, card.data);
  if (!d?.html) return <p className={c.muted}>No screen yet.</p>;
  return (
    <>
      <VisualViewport
        label="interactive visual"
        size={{ width: DESIGN_READER_WIDTH, height: DESIGN_READER_WIDTH * 0.625 }}
        interactive
      >
        <DesignFrame
          src={designFrameUrl(card.id, d.version ?? 1)}
          title={d.title ?? 'Design frame'}
          width={DESIGN_READER_WIDTH}
          height={DESIGN_READER_WIDTH * 0.625}
          viewWidth={DESIGN_READER_WIDTH}
          live
          version={d.version ?? 1}
          testid="reader-design-frame"
        />
      </VisualViewport>
      <p className={c.muted}>
        <DesignStamp data={d} />
        {d.body ? ` · ${d.body}` : ''}
      </p>
      {d.asset && <p className={c.designFile}>{d.asset}</p>}
      <p className={c.muted}>Ask in the chat to change this screen: Builder writes a new version.</p>
    </>
  );
}

/** The live render of a Mermaid source (cached renders show at once). */
function useDiagram(source: string, theme?: DiagramTheme, workspace?: Appearance): DiagramRender | undefined {
  const identity = `${theme}:${JSON.stringify(workspace)}`;
  const [state, setState] = useState<{ source: string; theme?: string; render?: DiagramRender }>(() => ({
    source,
    theme: identity,
    render: cachedDiagram(source, theme, workspace),
  }));
  useEffect(() => {
    let live = true;
    void renderDiagram(source, theme, workspace).then((render) => {
      if (live) setState({ source, theme: identity, render });
    });
    return () => {
      live = false;
    };
  }, [source, identity]);
  return state.source === source && state.theme === identity
    ? state.render
    : cachedDiagram(source, theme, workspace);
}

/** A diagram: the SVG Mermaid drew, or why it could not. */
export function DiagramView({
  source,
  testid,
  big = false,
}: {
  source: string;
  testid: string;
  big?: boolean;
}) {
  const appearance = useAppearance();
  const workspace = useWorkspaceAppearance();
  const theme = appearance === 'day' ? 'light' : appearance === 'night' ? 'night' : undefined;
  const render = useDiagram(source, theme, workspace);
  if (!render) {
    return (
      <div
        className={big ? `${c.diagram} ${c.diagramBig}` : c.diagram}
        data-testid={testid}
        data-state="loading"
      >
        <span className={c.designEmpty}>Drawing the diagram…</span>
      </div>
    );
  }
  if ('error' in render) {
    return (
      <div className={c.diagramError} data-testid={testid} data-state="error" role="note">
        Diagram error: {render.error}
      </div>
    );
  }
  return (
    <div
      className={big ? `${c.diagram} ${c.diagramBig}` : c.diagram}
      data-testid={testid}
      data-state="ready"
      data-diagram-theme={theme}
      // Mermaid's own output in strict mode (labels sanitised by DOMPurify); the app CSP runs no inline script.
      dangerouslySetInnerHTML={{ __html: render.svg }}
    />
  );
}

/** A diagram card on the board. */
export function DiagramBody({ card }: { card: Card; lod: 'full' | 'compact' }) {
  const d = readCardData(DiagramData, card.data);
  if (!d?.mermaid) return <p className={c.designEmpty}>No diagram yet.</p>;
  return <DiagramView source={d.mermaid} testid="card-diagram" />;
}

/** A diagram card in the reader: the diagram large, its caption and its source. */
export function DiagramReader({ card }: { card: Card }) {
  const d = readCardData(DiagramData, card.data);
  if (!d?.mermaid) return <p className={c.muted}>No diagram yet.</p>;
  return (
    <>
      <VisualViewport label="diagram">
        <DiagramView source={d.mermaid} testid="reader-diagram" big />
      </VisualViewport>
      {d.body && <p className={c.muted}>{d.body}</p>}
      <pre
        className={c.diagramSource}
        data-testid="reader-diagram-source"
        tabIndex={0}
        aria-label="Diagram source"
      >
        {d.mermaid}
      </pre>
    </>
  );
}
