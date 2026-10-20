/** A reader-local viewport. Its zoom never changes the research board's camera. */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import c from './cards.module.css';

export function VisualViewport({
  children,
  label,
  size,
  interactive = false,
}: {
  children: ReactNode;
  label: string;
  size?: { width: number; height: number };
  interactive?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const scale = useRef(1);
  const [width, setWidth] = useState(700);
  const [panning, setPanning] = useState(false);
  const anchor = useRef<{ x: number; y: number; left: number; top: number } | undefined>(undefined);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | undefined>(undefined);

  const change = (next: number, x?: number, y?: number) => {
    const el = viewport.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = x === undefined ? el.clientWidth / 2 : x - r.left;
    const py = y === undefined ? el.clientHeight / 2 : y - r.top;
    anchor.current = {
      x: px,
      y: py,
      left: (el.scrollLeft + px) / scale.current,
      top: (el.scrollTop + py) / scale.current,
    };
    scale.current = Math.min(6, Math.max(0.25, next));
    setZoom(scale.current);
  };
  useLayoutEffect(() => {
    const el = viewport.current;
    const world = content.current;
    if (!el || !world) return;
    const measure = () => {
      const svg = world.querySelector('svg');
      const img = world.querySelector('img');
      const vb = svg?.viewBox.baseVal;
      const w = size?.width || vb?.width || img?.naturalWidth || 760;
      const h = size?.height || vb?.height || img?.naturalHeight || 400;
      setWidth(Math.max(120, Math.min(el.clientWidth - 24, ((el.clientHeight - 24) * w) / h)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(measure);
    mo.observe(world, { childList: true, subtree: true });
    world.addEventListener('load', measure, true);
    // Native non-passive wheel: pinch/Cmd-scroll zooms this visual, ordinary scrolling pans it.
    const wheel = (e: WheelEvent) => {
      e.stopPropagation();
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      change(scale.current * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      ro.disconnect();
      mo.disconnect();
      world.removeEventListener('load', measure, true);
      el.removeEventListener('wheel', wheel);
    };
  }, []);
  useLayoutEffect(() => {
    const el = viewport.current;
    const a = anchor.current;
    if (el && a) {
      el.scrollLeft = a.left * zoom - a.x;
      el.scrollTop = a.top * zoom - a.y;
    }
  }, [zoom]);
  const fit = () => {
    scale.current = 1;
    setZoom(1);
    anchor.current = undefined;
    viewport.current?.scrollTo(0, 0);
  };

  return (
    <div className={c.visualViewer} data-testid="visual-viewer">
      <div className={c.visualControls} role="group" aria-label={`${label} zoom`}>
        <button
          type="button"
          className={c.chip}
          aria-label="Zoom out visual"
          onClick={() => change(scale.current / 1.25)}
        >
          −
        </button>
        <output data-testid="visual-zoom" aria-live="polite">
          {Math.round(zoom * 100)}%
        </output>
        <button
          type="button"
          className={c.chip}
          aria-label="Zoom in visual"
          onClick={() => change(scale.current * 1.25)}
        >
          +
        </button>
        <button type="button" className={c.chip} onClick={fit}>
          Fit
        </button>
        {interactive && (
          <button
            type="button"
            className={c.chip}
            aria-label="Pan visual"
            aria-pressed={panning}
            onClick={() => setPanning((p) => !p)}
          >
            {panning ? 'Interact' : 'Pan'}
          </button>
        )}
        <span>
          {interactive
            ? 'Zoom with +/− · Pan to move · Interact to use controls'
            : 'Drag to pan · pinch or ⌘ scroll to zoom'}
        </span>
      </div>
      <div
        ref={viewport}
        className={c.visualViewport}
        data-testid="visual-viewport"
        tabIndex={0}
        role="region"
        aria-label={`Zoomable ${label}`}
        onKeyDown={(e) => {
          if (['+', '=', '-', '0'].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === '0') fit();
            else change(scale.current * (e.key === '-' ? 0.8 : 1.25));
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || (interactive && !panning)) return;
          e.preventDefault();
          e.stopPropagation();
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: e.currentTarget.scrollLeft,
            top: e.currentTarget.scrollTop,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            e.currentTarget.scrollLeft = d.left + d.x - e.clientX;
            e.currentTarget.scrollTop = d.top + d.y - e.clientY;
          }
        }}
        onPointerUp={(e) => {
          drag.current = undefined;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = undefined;
        }}
      >
        <div
          ref={content}
          className={`${c.visualContent} ${panning ? c.visualPanning : ''}`}
          style={{
            width: width * zoom,
            ...(size ? { height: (width * zoom * size.height) / size.width } : {}),
          }}
        >
          {size ? (
            <div
              style={{
                width: size.width,
                height: size.height,
                transform: `scale(${(width * zoom) / size.width})`,
                transformOrigin: 'top left',
              }}
            >
              {children}
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
