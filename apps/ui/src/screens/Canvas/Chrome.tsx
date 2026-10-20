/**
 * The Canvas screen's floating chrome (design/screens/canvas.html): title pill, Publish Port, left toolbar,
 * minimap block. The conversation panel is in ConversationPanel.tsx.
 */
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Card, Frame, FrameColor, ThemeMode } from '@orb/shared';
import { bounds, visibleWorldRect, type Rect, type Size, type Viewport } from '../../canvas/viewport.js';
import { routeHref } from '../../app/router.js';
import {
  AddCardIcon,
  ConnectIcon,
  FitIcon,
  FocusIcon,
  FrameIcon,
  NoteIcon,
  OrbMark,
  PublishIcon,
  SelectIcon,
  SunIcon,
  MoonIcon,
} from '../../components/icons.js';
import type { SaveState } from './useCanvas.js';
import s from './Canvas.module.css';

const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'Saved locally',
  saving: 'Saving…',
  error: 'Not saved',
};

/** Top-left pill: Orb mark (Home), the canvas title (click to edit inline) and the save state. */
export function TitlePill({
  title,
  save,
  onRename,
}: {
  title: string;
  save: SaveState;
  onRename: (title: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const editing = draft !== undefined;

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    if (draft === undefined) return;
    setDraft(undefined);
    if (draft.trim() && draft.trim() !== title) void onRename(draft);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') setDraft(undefined);
  };

  return (
    <div className={s.titlePill} data-testid="title-pill" data-panel="title">
      <a href={routeHref({ name: 'home' })} aria-label="Home" className={s.homeLink}>
        <OrbMark />
      </a>
      {editing ? (
        <input
          ref={input}
          className={s.titleInput}
          data-testid="canvas-title-input"
          aria-label="Canvas title"
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
        />
      ) : (
        <button
          type="button"
          className={s.titleButton}
          data-testid="canvas-title"
          title="Rename canvas"
          onClick={() => setDraft(title)}
        >
          {title}
        </button>
      )}
      <span className={s.saveState} data-testid="save-state" data-state={save} role="status">
        <span
          aria-hidden="true"
          className={save === 'saving' ? s.saveDotSaving : save === 'error' ? s.saveDotError : s.saveDot}
        />
        {SAVE_LABEL[save]}
      </span>
    </div>
  );
}

/** Top-right: a labelled appearance switch and Publish Port. */
export function TopRight({
  onPublish,
  theme,
  onTheme,
}: {
  onPublish: () => void;
  theme: ThemeMode;
  onTheme: (theme: ThemeMode) => void;
}) {
  return (
    <div className={s.topRight} data-panel="publish">
      <button
        type="button"
        className={s.themeToggle}
        data-testid="canvas-theme-toggle"
        aria-label={theme === 'night' ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={() => onTheme(theme === 'night' ? 'day' : 'night')}
      >
        {theme === 'night' ? <SunIcon /> : <MoonIcon />}
        <span>{theme === 'night' ? 'Light mode' : 'Dark mode'}</span>
      </button>
      <button type="button" className={s.publish} data-testid="publish-port" onClick={onPublish}>
        <PublishIcon />
        Publish Port
      </button>
    </div>
  );
}

import type { Tool } from '../../canvas/useBoardInput.js';
export type { Tool };

const TOOLS: {
  tool: Tool;
  label: string;
  key?: string;
  Icon: (p: { size?: number }) => React.JSX.Element;
}[] = [
  { tool: 'select', label: 'Select', key: 'V', Icon: SelectIcon },
  { tool: 'note', label: 'Add note', key: 'N', Icon: NoteIcon },
  { tool: 'frame', label: 'Add frame', key: 'F', Icon: FrameIcon },
  { tool: 'connect', label: 'Connect cards', key: 'C', Icon: ConnectIcon },
  { tool: 'add-card', label: 'Add card', Icon: AddCardIcon },
];

/**
 * Left toolbar: Select (V), Note (N), Frame (F), Connect (C), Add card. Every button is in the tab order with a
 * visible focus ring (P2.7); inside the toolbar the arrow keys (and Home / End) also move between them.
 */
export function Toolbar({ tool, onTool }: { tool: Tool; onTool: (tool: Tool) => void }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? 1
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? -1
          : 0;
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? buttons.length - 1
          : (at + step + buttons.length) % buttons.length;
    e.preventDefault();
    buttons[next]?.focus();
  };
  return (
    <div
      className={s.toolbar}
      data-panel="toolbar"
      role="toolbar"
      aria-label="Board tools"
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
    >
      {TOOLS.map(({ tool: t, label, key, Icon }) => (
        <button
          key={t}
          type="button"
          aria-label={label}
          title={key ? `${label} (${key})` : label}
          aria-keyshortcuts={key}
          aria-pressed={tool === t}
          data-testid={`tool-${t}`}
          className={tool === t ? s.toolActive : s.tool}
          onClick={() => onTool(t)}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}

export type { Viewport } from '../../canvas/viewport.js';

const MAP_W = 168;
const MAP_H = 104;
const MAP_PAD = 12;

type Projection = { k: number; minX: number; minY: number };

/** World → minimap scale and offset for the bounding box of frames and cards (null for an empty board). */
function minimapProjection(items: Rect[]): Projection | null {
  const box = bounds(items);
  if (!box) return null;
  const k = Math.min((MAP_W - 2 * MAP_PAD) / Math.max(1, box.w), (MAP_H - 2 * MAP_PAD) / Math.max(1, box.h));
  return { k, minX: box.x, minY: box.y };
}

const FRAME_TONE: Record<FrameColor, { borderColor: string; borderStyle?: 'dashed' }> = {
  sky: { borderColor: '#60A5FA' },
  signal: { borderColor: '#2563EB' },
  rho: { borderColor: '#3D5DCF' },
  paper: { borderColor: 'var(--orb-text-muted)', borderStyle: 'dashed' },
};

const place = (p: Projection, r: Rect, min: number) => ({
  left: MAP_PAD + (r.x - p.minX) * p.k,
  top: MAP_PAD + (r.y - p.minY) * p.k,
  width: Math.max(min, r.w * p.k),
  height: Math.max(min, r.h * p.k),
});

/** Frames in their tones plus cards: re-rendered only when the board changes, not while panning. */
const MinimapBoard = memo(function MinimapBoard({
  proj,
  cards,
  frames,
}: {
  proj: Projection;
  cards: Card[];
  frames: Frame[];
}) {
  return (
    <>
      {frames.map((f) => (
        <div
          key={f.id}
          className={s.minimapFrame}
          data-testid="minimap-frame"
          style={{ ...place(proj, f, 3), ...FRAME_TONE[f.color] }}
        />
      ))}
      {cards.map((c) => (
        <div key={c.id} className={s.minimapCard} style={place(proj, c, 2)} />
      ))}
    </>
  );
});

/**
 * Bottom left: minimap (frames, cards, the current viewport; click to jump), zoom out, zoom level (reset to 100%),
 * zoom in. Zoom to fit (Shift+1) and zoom to selection (Shift+2) sit in the minimap's corner (P2.7): shown while the
 * minimap block is hovered or one of them has the keyboard focus, so the resting chrome matches the prototype.
 */
export function Minimap({
  cards,
  frames,
  viewport,
  size,
  onZoomStep,
  onReset,
  onJump,
  onFit,
  onFitSelection,
  onRepack,
  repacking,
  hasSelection,
}: {
  cards: Card[];
  frames: Frame[];
  viewport: Viewport;
  size: Size;
  onZoomStep: (factor: number) => void;
  onReset: () => void;
  onJump: (worldX: number, worldY: number) => void;
  onFit: () => void;
  onFitSelection: () => void;
  onRepack: () => void;
  repacking: boolean;
  hasSelection: boolean;
}) {
  const proj = useMemo(() => minimapProjection([...frames, ...cards]), [frames, cards]);
  const view = visibleWorldRect(viewport, size, 0);
  return (
    <div className={s.minimapBlock} data-testid="minimap-block" data-panel="navigation">
      <div
        className={s.minimap}
        data-testid="minimap"
        aria-hidden="true"
        // A press on the minimap is chrome, not the board: it must not start a pan (a pan captures the pointer, and
        // the click that jumps would then land on the board instead of here).
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          if (!proj) return;
          const r = e.currentTarget.getBoundingClientRect();
          onJump(
            proj.minX + (e.clientX - r.left - MAP_PAD) / proj.k,
            proj.minY + (e.clientY - r.top - MAP_PAD) / proj.k,
          );
        }}
      >
        {proj && <MinimapBoard proj={proj} cards={cards} frames={frames} />}
        {proj && (
          <div className={s.minimapViewport} data-testid="minimap-viewport" style={place(proj, view, 4)} />
        )}
      </div>
      <div className={s.minimapActions}>
        <button
          type="button"
          className={s.minimapAction}
          aria-label="Zoom to fit"
          title="Zoom to fit (Shift+1)"
          aria-keyshortcuts="Shift+1"
          data-testid="zoom-fit"
          onClick={onFit}
        >
          <FitIcon />
        </button>
        <button
          type="button"
          className={s.minimapAction}
          aria-label="Zoom to selection"
          title="Zoom to selection (Shift+2)"
          aria-keyshortcuts="Shift+2"
          data-testid="zoom-selection"
          disabled={!hasSelection}
          onClick={onFitSelection}
        >
          <FocusIcon />
        </button>
        <button
          type="button"
          className={s.minimapAction}
          aria-label="Repack board"
          title="Repack frames and cards; keep pinned cards in place (undo available)"
          data-testid="repack-board"
          disabled={repacking}
          onClick={onRepack}
        >
          ▦
        </button>
      </div>
      <div className={s.zoomRow}>
        <button
          type="button"
          aria-label="Zoom out"
          className={s.zoomStep}
          onClick={() => onZoomStep(1 / 1.2)}
        >
          -
        </button>
        <button
          type="button"
          aria-label="Reset view"
          className={s.zoomLevel}
          data-testid="zoom-level"
          onClick={onReset}
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <button type="button" aria-label="Zoom in" className={s.zoomStep} onClick={() => onZoomStep(1.2)}>
          +
        </button>
      </div>
    </div>
  );
}
