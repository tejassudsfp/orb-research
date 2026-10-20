/**
 * Pan and zoom input for the canvas (BUILD_PLAN P2.2, PRD Canvas › Navigation):
 * - pan: drag on empty space, hold Space and drag anywhere, or scroll (trackpad two-finger scroll);
 * - zoom: Cmd/Ctrl+scroll or pinch (Chromium reports a pinch as a ctrl+wheel), towards the cursor, 25%–250%.
 *
 * Input only mutates a ref; one `setState` per animation frame publishes it, so a burst of wheel or pointer events
 * costs one React render per frame. `moving` stays true for a short while after the last input so the world layer
 * can be promoted for the gesture only.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { easeInOut, flightAt, panBy, zoomAt, type Size, type Viewport } from './viewport.js';
import { reduceMotion } from '../theme/motion.js';

/** Elements a plain drag must not start a pan on (Space+drag still pans over them). */
const INTERACTIVE = 'button, input, textarea, select, a, label, [contenteditable="true"], [data-panel]';
/** Board items (cards, frame labels, links, handles) take a plain drag themselves (P2.3): it must not pan. */
const BOARD_ITEM = 'article, [data-frame-handle], [data-link-id], [data-resize-handle]';
/** Wheel zoom sensitivity: factor = exp(-deltaY * k). */
const WHEEL_ZOOM = 0.0015;
const MOVING_IDLE_MS = 150;
/** Length of a flight (zoom to fit / selection / a search result); instant under Reduce Motion. */
export const FLY_MS = 320;

const reducedMotion = reduceMotion;

const isTyping = (target: EventTarget | null) =>
  target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]') !== null;

/** A control focused from the keyboard (focus ring shown): Space presses it instead of starting a pan (P2.7). */
const keyboardFocusedControl = (target: EventTarget | null) =>
  target instanceof Element &&
  target.matches('button, a[href], [role="button"], [role="radio"]') &&
  target.matches(':focus-visible');

export type PanZoom = {
  viewport: Viewport;
  size: Size;
  dragging: boolean;
  spaceHeld: boolean;
  moving: boolean;
  /** The latest viewport, including input not yet published (pointer → world maths). */
  viewportRef: RefObject<Viewport>;
  /**
   * P6.20: true once the user has moved the camera themselves (a pan or zoom gesture): until then a canvas keeps itself
   * fitted to its content, and the camera is not remembered.
   */
  touchedRef: RefObject<boolean>;
  /** Changes on each explicit camera action, so a layout update cannot override a later user gesture. */
  interactionRef: RefObject<number>;
  touch: () => void;
  /** True while Space is held (pan mode), without waiting for a render. */
  spaceRef: RefObject<boolean>;
  /** The latest screen size. */
  sizeRef: RefObject<Size>;
  /** Replace the viewport (minimap jump, reset); published on the next frame. Cancels a running flight. */
  update: (change: (v: Viewport) => Viewport) => void;
  /**
   * Animate to a viewport (eased, `FLY_MS`; instant under Reduce Motion). Any other input cancels the flight. A flight
   * is the user's own camera move unless it is `auto` (the canvas fitting itself to its content, P6.20).
   */
  flyTo: (target: Viewport, opts?: { auto?: boolean }) => void;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e?: ReactPointerEvent<HTMLElement>) => void;
};

export function usePanZoom(
  root: RefObject<HTMLElement | null>,
  initial: Viewport = { panX: 0, panY: 0, zoom: 1 },
): PanZoom {
  const [viewport, setViewport] = useState<Viewport>(initial);
  const [size, setSize] = useState<Size>({ width: 1440, height: 900 });
  const [dragging, setDragging] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [moving, setMoving] = useState(false);
  const current = useRef<Viewport>(initial);
  const frame = useRef<number | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const space = useRef(false);
  const flight = useRef<number | null>(null);
  const sizeRef = useRef<Size>(size);
  const touched = useRef(false);
  const interaction = useRef(0);
  const touch = useCallback(() => {
    touched.current = true;
    interaction.current++;
  }, []);

  const land = useCallback(() => {
    if (flight.current !== null) cancelAnimationFrame(flight.current);
    flight.current = null;
  }, []);

  const update = useCallback((change: (v: Viewport) => Viewport) => {
    if (flight.current !== null) {
      cancelAnimationFrame(flight.current);
      flight.current = null;
      setMoving(false);
    }
    current.current = change(current.current);
    if (frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setViewport(current.current);
      });
    }
  }, []);

  /** Like `update`, for continuous gestures: also flags `moving` until input pauses. */
  const gesture = useCallback(
    (change: (v: Viewport) => Viewport) => {
      touch();
      update(change);
      setMoving(true);
      if (idle.current) clearTimeout(idle.current);
      idle.current = setTimeout(() => setMoving(false), MOVING_IDLE_MS);
    },
    [update, touch],
  );

  const flyTo = useCallback(
    (target: Viewport, opts: { auto?: boolean } = {}) => {
      if (!opts.auto) touch();
      land();
      const from = current.current;
      const same =
        Math.abs(from.zoom - target.zoom) < 1e-6 &&
        Math.abs(from.panX - target.panX) < 0.5 &&
        Math.abs(from.panY - target.panY) < 0.5;
      if (same || reducedMotion()) {
        update(() => target);
        return;
      }
      const start = performance.now();
      setMoving(true);
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / FLY_MS);
        current.current = flightAt(from, target, easeInOut(t), sizeRef.current);
        setViewport(current.current);
        if (t < 1) {
          flight.current = requestAnimationFrame(step);
        } else {
          flight.current = null;
          setMoving(false);
        }
      };
      flight.current = requestAnimationFrame(step);
    },
    [land, update, touch],
  );

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (flight.current !== null) cancelAnimationFrame(flight.current);
      if (idle.current) clearTimeout(idle.current);
    },
    [],
  );

  // Screen size for culling. When the rail or window resizes a camera the user moved, keep its world centre.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let measured = false;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const previous = sizeRef.current;
      if (measured && touched.current && (previous.width !== r.width || previous.height !== r.height)) {
        update((v) => panBy(v, (r.width - previous.width) / 2, (r.height - previous.height) / 2));
      }
      sizeRef.current = { width: r.width, height: r.height };
      measured = true;
      setSize((s) =>
        s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [root, update]);

  // Native, non-passive wheel listener so Cmd/Ctrl+scroll and pinch never zoom the page itself.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('[data-panel]')) return;
      e.preventDefault();
      // deltaMode 1 = lines (a mouse wheel on some setups): scale to pixels.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const factor = Math.exp(-e.deltaY * unit * WHEEL_ZOOM);
        gesture((v) => zoomAt(v, factor, e.clientX - r.left, e.clientY - r.top));
      } else {
        gesture((v) => panBy(v, -e.deltaX * unit, -e.deltaY * unit));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [root, gesture]);

  // Space held = pan mode (unless typing in a field).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping(e.target) || keyboardFocusedControl(e.target)) return;
      e.preventDefault();
      if (!space.current) {
        space.current = true;
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      space.current = false;
      setSpaceHeld(false);
    };
    const blur = () => {
      space.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    const target = e.target as Element;
    if (!space.current && e.button === 0 && target.closest(`${INTERACTIVE}, ${BOARD_ITEM}`)) return;
    if (space.current && target.closest('[data-panel], input, textarea')) return;
    drag.current = { x: e.clientX, y: e.clientY, pointer: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointer) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      gesture((v) => panBy(v, dx, dy));
    },
    [gesture],
  );

  /**
   * Ends a pan. A real `pointerup` also pans to its own point: the pan always ends where the pointer was released,
   * even when other pointer moves were interleaved before it (the e2e machine's physical mouse does that).
   */
  const onPointerUp = useCallback(
    (e?: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (d && e?.type === 'pointerup' && e.pointerId === d.pointer) {
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (dx !== 0 || dy !== 0) gesture((v) => panBy(v, dx, dy));
      }
      drag.current = null;
      setDragging(false);
    },
    [gesture],
  );

  return {
    viewport,
    size,
    dragging,
    spaceHeld,
    moving,
    viewportRef: current,
    touchedRef: touched,
    interactionRef: interaction,
    touch,
    spaceRef: space,
    sizeRef,
    update,
    flyTo,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
