/**
 * One frame: a thin-bordered rounded region in a palette tone with its numbered mono label (`01 THESIS`). The label
 * is the frame's handle (P2.3): click selects, drag moves the frame with its cards, double-click renames inline.
 * A selected frame shows a corner handle to resize it.
 */
import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Frame } from '@orb/shared';
import { useCardActions } from '../cards/context.js';
import { ThreadIcon } from '../components/icons.js';
import { frameLabel, type Lod } from './viewport.js';
import s from './canvas.module.css';

function FrameViewInner({
  frame,
  index,
  lod,
  selected = false,
  renaming = false,
  onRename,
  onRenameEnd,
  replies = 0,
}: {
  /** P3.6: messages in the frame's thread. */
  replies?: number;
  frame: Frame;
  index: number;
  lod: Lod;
  selected?: boolean;
  renaming?: boolean;
  onRename?: (id: string, title: string) => void;
  onRenameEnd?: () => void;
}) {
  const { thread } = useCardActions();
  const [draft, setDraft] = useState(frame.title);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!renaming) return;
    setDraft(frame.title);
    // Select on the next frame: the input mounts in this commit.
    requestAnimationFrame(() => input.current?.select());
  }, [renaming]);

  const commit = () => {
    const title = draft.trim();
    if (title && title !== frame.title) onRename?.(frame.id, title);
    onRenameEnd?.();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') onRenameEnd?.();
    e.stopPropagation();
  };

  return (
    <section
      className={[
        s.frame,
        s[`tone_${frame.color}`],
        lod === 'title' ? s.frameFar : '',
        selected ? s.frameSelected : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="orb-frame"
      data-frame-id={frame.id}
      data-frame-color={frame.color}
      data-selected={selected || undefined}
      aria-label={frame.title}
      style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
    >
      {renaming ? (
        <span className={s.frameLabel}>
          {String(index + 1).padStart(2, '0')}{' '}
          <input
            ref={input}
            className={s.frameTitleInput}
            data-testid="frame-title-input"
            aria-label="Frame title"
            value={draft}
            maxLength={80}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            onBlur={commit}
          />
        </span>
      ) : (
        <span
          className={`${s.frameLabel} ${s.frameHandle}`}
          data-testid="orb-frame-label"
          data-frame-handle={frame.id}
          title="Drag to move, double-click to rename"
        >
          {frameLabel(index, frame.title)}
        </span>
      )}
      {lod !== 'title' && (selected || replies > 0) && (
        <button
          type="button"
          className={s.frameThread}
          data-card-action="thread"
          data-testid="frame-thread"
          data-replies={replies}
          aria-label={`Thread on ${frame.title}${replies ? `, ${replies} ${replies === 1 ? 'reply' : 'replies'}` : ''}`}
          onClick={() => thread(frame.id)}
        >
          <ThreadIcon size={12} />
          {replies > 0 ? replies : 'Thread'}
        </button>
      )}
      {selected && (
        <span
          className={s.resizeHandle}
          data-resize-handle={frame.id}
          data-testid="frame-resize"
          aria-hidden="true"
        />
      )}
    </section>
  );
}

export const FrameView = memo(FrameViewInner);
