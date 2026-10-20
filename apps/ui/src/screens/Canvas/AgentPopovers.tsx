/**
 * P3.6 popovers anchored to a card or frame, in screen space next to it (they follow the board as it moves):
 *
 * - Provenance ("why it's here", PRD Canvas › Cards): the agent, the model, when it was added and the tool call. "Show
 *   the turn" loads the session events of the turn that produced the card through the gateway's `session/page`
 *   (`throughSeq` = the card's `provenance.eventSeq`, one-turn window) and lists the user's message, the agent's text,
 *   its tool calls (the card's own call highlighted) and their results.
 * - Thread (PRD Chat and threads › Threads; design/screens/canvas.html "THREAD ON …"): the thread's messages from
 *   board.jsonl (`thread.message`), Orb's reply streaming while its thread turn runs, and a reply box. A thread's new
 *   cards are placed next to its card and linked to it by the canvas service.
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useFocusTrap } from '../../components/useFocusTrap.js';
import { ChatMarkdown } from '../../components/ChatMarkdown.js';
import { AGENT_LABELS, cardTitle, type Card, type SessionWireEvent, type ThreadMessage } from '@orb/shared';
import { CloseIcon, SendIcon } from '../../components/icons.js';
import { AGENT_COLORS } from './agentsView.js';
import type { TurnDetail } from './useCanvas.js';
import s from './Canvas.module.css';

export type ScreenAnchor = { left: number; top: number; placement: 'right' | 'left'; maxHeight?: number };

const textParts = (content: unknown): string =>
  Array.isArray(content)
    ? content
        .filter((p) => p?.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text as string)
        .join('')
    : '';

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

function formatTime(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** One line of the turn, from a session event (undefined for events the view leaves out). */
function turnLine(
  e: SessionWireEvent,
  agentName: string,
  callId: string | undefined,
): { key: string; who: string; text: string; tool?: true; mine?: true } | undefined {
  const data = e.data as any;
  switch (e.type) {
    case 'user/message': {
      const message = data?.message ?? data;
      const parts = Array.isArray(message?.content)
        ? message.content.filter((p: any) => p?.type === 'text').map((p: any) => String(p.text))
        : [];
      const first = parts[0] ?? '';
      if (!first) return undefined;
      const who = message?.source?.kind === 'user' ? 'Message' : 'Note';
      return { key: `e${e.seq}`, who, text: clip(first, 400) };
    }
    case 'assistant/message': {
      const text = textParts(data?.message?.content).trim();
      return text ? { key: `e${e.seq}`, who: agentName, text: clip(text, 600) } : undefined;
    }
    case 'tool/call':
      return {
        key: `e${e.seq}`,
        who: data?.callId === callId ? 'This card' : 'Tool',
        text: `${String(data?.name)}(${clip(String(data?.arguments ?? ''), 220)})`,
        tool: true,
        ...(data?.callId === callId ? { mine: true as const } : {}),
      };
    case 'tool/result': {
      const text = textParts(data?.message?.content).trim();
      return text ? { key: `e${e.seq}`, who: '→', text: clip(text, 160), tool: true } : undefined;
    }
    default:
      return undefined;
  }
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
}

export function ProvenancePopover({
  card,
  anchor,
  loadTurn,
  onClose,
}: {
  card: Card;
  anchor: ScreenAnchor;
  loadTurn: (card: Card) => Promise<TurnDetail>;
  onClose: () => void;
}) {
  const [turn, setTurn] = useState<TurnDetail | 'loading' | { error: string }>();
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box, { trap: false });
  useEscape(onClose);
  useEffect(() => setTurn(undefined), [card.id]);
  const p = card.provenance;
  const agent = p.kind === 'agent' ? p.agent : undefined;
  const show = async () => {
    setTurn('loading');
    try {
      setTurn(await loadTurn(card));
    } catch (e) {
      setTurn({ error: e instanceof Error ? e.message : String(e) });
    }
  };
  const lines =
    turn && turn !== 'loading' && 'events' in turn
      ? turn.events
          .map((e) =>
            turnLine(e, agent ? AGENT_LABELS[agent] : 'Agent', p.kind === 'agent' ? p.toolCallId : undefined),
          )
          .filter((l) => l !== undefined)
      : [];
  return (
    <div
      ref={box}
      tabIndex={-1}
      className={s.popover}
      data-panel="provenance"
      data-testid="provenance"
      data-card-id={card.id}
      role="dialog"
      aria-label="Why it's here"
      style={{ left: anchor.left, top: anchor.top }}
      data-placement={anchor.placement}
    >
      <div className={s.popoverHead}>
        <span className={s.popoverKicker}>WHY IT&apos;S HERE</span>
        <button
          type="button"
          aria-label="Close"
          className={s.popoverClose}
          onClick={onClose}
          data-testid="provenance-close"
        >
          <CloseIcon size={14} />
        </button>
      </div>
      <p className={s.popoverTitle}>{cardTitle(card)}</p>
      {card.why && (
        <p className={s.popoverWhy} data-testid="provenance-why">
          {card.why}
        </p>
      )}
      <dl className={s.facts}>
        <dt>Added by</dt>
        <dd data-testid="provenance-agent">
          {agent && (
            <span className={s.agentDot} style={{ background: AGENT_COLORS[agent].bg }} aria-hidden="true" />
          )}
          {agent ? AGENT_LABELS[agent] : 'You'}
        </dd>
        {p.kind === 'agent' && (
          <>
            <dt>Model</dt>
            <dd data-testid="provenance-model">{p.provider ? `${p.provider} / ${p.model}` : p.model}</dd>
          </>
        )}
        <dt>When</dt>
        <dd data-testid="provenance-time">{formatTime(p.at)}</dd>
        {p.kind === 'agent' && (
          <>
            <dt>Tool call</dt>
            <dd className={s.mono} data-testid="provenance-call">
              {p.toolCallId ?? '—'}
            </dd>
            <dt>Session</dt>
            <dd className={s.mono} data-testid="provenance-session" title={p.sessionId}>
              {clip(p.sessionId, 28)}
              {p.eventSeq !== undefined ? ` · event ${p.eventSeq}` : ''}
            </dd>
          </>
        )}
      </dl>
      {p.kind === 'agent' && p.eventSeq !== undefined && !turn && (
        <button
          type="button"
          className={s.popoverAction}
          data-testid="provenance-load"
          onClick={() => void show()}
        >
          Show the turn
        </button>
      )}
      {turn === 'loading' && <p className={s.popoverNote}>Loading the turn…</p>}
      {turn && turn !== 'loading' && 'error' in turn && (
        <p className={s.popoverNote} role="alert" data-testid="provenance-error">
          {turn.error}
        </p>
      )}
      {lines.length > 0 && (
        <ol className={s.turnList} data-testid="provenance-turn">
          {turn && turn !== 'loading' && 'hasMore' in turn && turn.hasMore && (
            <li className={s.popoverNote}>Earlier events in the session…</li>
          )}
          {lines.map((l) => (
            <li
              key={l.key}
              className={[s.turnLine, l.tool ? s.turnTool : '', l.mine ? s.turnMine : '']
                .filter(Boolean)
                .join(' ')}
              data-testid={l.mine ? 'provenance-own-call' : 'provenance-line'}
            >
              <span className={s.turnWho}>{l.who}</span>
              <span className={s.turnText}>{l.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function ThreadPopover({
  title,
  anchorId,
  anchor,
  messages,
  live,
  replying,
  error,
  paused,
  onSend,
  onClose,
}: {
  title: string;
  anchorId: string;
  anchor: ScreenAnchor;
  messages: readonly ThreadMessage[];
  /** Orb's reply being streamed for this thread. */
  live?: string | undefined;
  /** Orb is answering this thread now. */
  replying: boolean;
  error?: string;
  paused?: boolean;
  onSend: (text: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box, { trap: false });
  useEscape(onClose);
  useEffect(() => input.current?.focus(), [anchorId]);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, live]);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setSendError(undefined);
    try {
      if (await onSend(text)) setText('');
      else setSendError('The message could not be sent. Your draft is kept; try again.');
    } catch {
      setSendError('The message could not be sent. Your draft is kept; try again.');
    } finally {
      setBusy(false);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') onClose();
  };
  return (
    <div
      ref={box}
      className={s.popover}
      data-panel="thread"
      data-testid="thread"
      data-thread-of={anchorId}
      role="dialog"
      aria-label={`Thread on ${title}`}
      style={{ left: anchor.left, top: anchor.top, maxHeight: anchor.maxHeight }}
      data-placement={anchor.placement}
    >
      <div className={s.popoverHead}>
        <span className={s.popoverKicker} data-testid="thread-title">
          THREAD ON {title.toUpperCase()}
        </span>
        <button
          type="button"
          aria-label="Close thread"
          className={s.popoverClose}
          onClick={onClose}
          data-testid="thread-close"
        >
          <CloseIcon size={14} />
        </button>
      </div>
      <div className={s.threadList} ref={list} data-testid="thread-messages">
        {messages.length === 0 && !live && (
          <p className={s.popoverNote}>
            Ask orb about this {anchorId.startsWith('f_') ? 'frame' : 'card'}. Its answer stays grounded in
            it.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={m.by === 'user' ? s.threadUser : s.threadAgent}
            data-testid="thread-message"
            data-by={m.by}
          >
            <ChatMarkdown text={m.text} />
          </div>
        ))}
        {live && (
          <div className={s.threadAgent} data-testid="thread-live">
            <ChatMarkdown text={live} />
          </div>
        )}
        {replying && !live && (
          <span className={s.typing} aria-label="orb is replying" data-testid="thread-typing">
            <span style={{ background: '#60A5FA' }} />
            <span style={{ background: '#3D5DCF' }} />
            <span style={{ background: 'rgba(61,93,207,0.5)' }} />
          </span>
        )}
      </div>
      {(sendError || error) && <p className={s.threadNotice} role="alert" data-testid="thread-error">{error || sendError}</p>}
      {!live && !error && !sendError && messages.at(-1)?.by === 'user' && (
        <p className={s.threadNotice} role="status" data-testid="thread-status">
          {paused ? 'Queued. Resume orb to answer this thread.' : replying ? 'orb is working on this reply…' : 'Queued for orb’s next step…'}
        </p>
      )}
      <form className={s.threadForm} onSubmit={(e) => void submit(e)}>
        <label htmlFor="thread-reply" className="orb-sr-only">
          Reply in thread
        </label>
        <input
          id="thread-reply"
          ref={input}
          className={s.threadInput}
          data-testid="thread-input"
          type="text"
          placeholder={anchorId.startsWith('f_') ? 'Reply on this frame' : 'Reply on this card'}
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <button
          type="submit"
          aria-label="Send to thread"
          className={s.threadSend}
          data-testid="thread-send"
          disabled={busy || !text.trim()}
        >
          <SendIcon size={14} />
        </button>
      </form>
    </div>
  );
}
