/**
 * One card on the board at a level of detail (P2.2), with its type's UI half from the card registry (P2.5,
 * src/cards/registry.tsx):
 *
 * - full (zoom ≥ 0.6): kind (+ Must read / Skim badge), title, the type's content, why line (P3.6: opens the
 *   provenance view), author (the session id on hover) with the Thread button and its reply count, and the note tab
 *   when the card has a user note;
 * - compact (0.35–0.6): kind, title, the type's compact content;
 * - title (below 0.35): the title only, in a large face so it stays legible at 25% (plus the type's `TitleExtra`,
 *   if it has a glanceable value; P6.2).
 *
 * Buttons inside a card carry `data-card-action`: the board input lets them take the click instead of starting a
 * drag (src/canvas/useBoardInput.ts).
 */
import { memo, useLayoutEffect, useRef } from 'react';
import { isPinned, stackOf, type Card } from '@orb/shared';
import { useCardActions } from '../cards/context.js';
import { AttachedStrip } from '../cards/dataset/DataAttach.js';
import { ThreadIcon } from '../components/icons.js';
import { CardContent, CardTitleExtra, cardUi, isPaper, kindLabel, titleOf } from '../cards/registry.js';
import type { Lod } from './viewport.js';
import s from './canvas.module.css';
import c from '../cards/cards.module.css';

const by = (card: Card) =>
  card.provenance.kind === 'agent' ? `${card.provenance.agent} · ${card.provenance.model}` : 'you';

const AGENT_DOT: Record<string, string> = {
  orb: '#3D5DCF',
  scout: '#60A5FA',
  critic: '#F9FCFE',
  builder: '#2563EB',
};

/** Hover text: which agent added the card, and when (PRD Canvas › Cards). */
function addedBy(card: Card): string {
  const when = new Date(card.provenance.at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (card.provenance.kind !== 'agent') return `Added by you, ${when}`;
  const name = card.provenance.agent.charAt(0).toUpperCase() + card.provenance.agent.slice(1);
  return `Added by ${name}, ${when}`;
}

/** "Thread", "Thread, 1 reply", "Thread, 3 replies" (the prototype's button). */
export const threadLabel = (replies: number) =>
  replies > 0 ? `Thread, ${replies} ${replies === 1 ? 'reply' : 'replies'}` : 'Thread';

function ThreadButton({ id, replies }: { id: string; replies: number }) {
  const { thread } = useCardActions();
  return (
    <button
      type="button"
      className={s.threadButton}
      data-card-action="thread"
      data-testid="card-thread"
      data-replies={replies}
      onClick={() => thread(id)}
    >
      <ThreadIcon size={13} />
      {threadLabel(replies)}
    </button>
  );
}

/**
 * P6.20: a card the layout engine owns (an agent's card, or a template's seed that the user has not dragged) is drawn
 * at the height the layout gave it, at full detail; its content is clipped to that height behind "Show more". The
 * user's own cards grow with their text.
 */
export const isFixedCard = (card: Card): boolean => card.provenance.kind === 'agent' || card.seed === true;

/** A card whose natural height the layout follows: fixed, not placed by the user, and not a picture or a chart. */
export const isMeasuredCard = (card: Card): boolean => isFixedCard(card) && !isPinned(card);

function ShowMore({ id }: { id: string }) {
  const { open } = useCardActions();
  return (
    <button
      type="button"
      className={s.showMore}
      data-card-action="more"
      data-testid="orb-card-more"
      onClick={() => open(id)}
    >
      Show more
    </button>
  );
}

function WhyLine({ card }: { card: Card }) {
  const { why } = useCardActions();
  return (
    <button
      type="button"
      className={s.cardWhy}
      data-card-action="why"
      data-testid="orb-card-why"
      title={`Why: ${card.why}\n\nOpen why it's here: who added it, with which model, and the turn`}
      onClick={() => why(card.id)}
    >
      Why: {card.why}
    </button>
  );
}

function NoteTab({ card }: { card: Card }) {
  const { open } = useCardActions();
  return (
    <button
      type="button"
      className={c.noteTab}
      data-card-action="note"
      data-testid="card-note-tab"
      title={card.note}
      onClick={() => open(card.id, 'note')}
    >
      Note
    </button>
  );
}

function BoardCardView({
  card,
  lod,
  enter,
  selected = false,
  found,
  replies = 0,
  probe = false,
}: {
  card: Card;
  lod: Lod;
  enter: boolean;
  /** P6.20: drawn off screen at its natural height (no fixed height, nothing clipped) to measure it. */
  probe?: boolean;
  selected?: boolean;
  /** P3.6: messages in the card's thread. */
  replies?: number;
  /** Board search (P2.7): a match, or the current result. */
  found?: 'match' | 'current' | undefined;
}) {
  const actions = useCardActions();
  const title = titleOf(card);
  const paper = isPaper(card);
  const stack = stackOf(card);
  // A card the layout engine owns keeps the size the layout gave it (its frame grew to hold exactly that), so a long
  // body never runs over the card below: its content is clipped and "Show more" opens the reader. The user's own cards
  // grow with their text at full detail (the user sizes them).
  const fixed = (lod === 'full' && isFixedCard(card)) || probe;
  const className = [
    s.card,
    s[lod],
    paper ? s.paper : '',
    card.provenance.kind === 'agent' ? s.agent : '',
    fixed ? s.fixed : '',
    probe ? s.probe : '',
    c[`type_${card.type}`] ?? '',
    stack ? c.stack : '',
    enter ? s.enter : '',
    selected ? s.selected : '',
    found === 'current' ? s.foundCurrent : found ? s.found : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style = probe
    ? { width: card.w }
    : lod === 'full' && !fixed
      ? { left: card.x, top: card.y, width: card.w, minHeight: card.h }
      : { left: card.x, top: card.y, width: card.w, height: card.h };
  const article = useRef<HTMLElement>(null);
  const clip = useRef<HTMLDivElement>(null);
  // Content taller than the card's clip shows "Show more" (the attribute is set without a render: content can load
  // later, e.g. a database's rows).
  useLayoutEffect(() => {
    const el = article.current;
    const box = clip.current;
    if (!el || !box || probe) return;
    const update = () => {
      const over = box.scrollHeight > box.clientHeight + 2;
      if (over) el.dataset.overflow = 'true';
      else delete el.dataset.overflow;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    const inner = box.firstElementChild;
    if (inner) ro.observe(inner);
    return () => ro.disconnect();
  }, [fixed, probe, card.h, card.w, card.data, card.why, card.view]);
  const mediaFirst = cardUi(card).mediaFirst === true;
  const content = <CardContent card={card} lod={lod === 'title' ? 'compact' : lod} />;
  const body = fixed ? (
    <div className={s.cardClip} ref={clip}>
      <div className={s.cardClipInner}>{content}</div>
    </div>
  ) : (
    content
  );
  return (
    <article
      ref={article}
      className={className}
      data-testid={probe ? 'orb-card-probe' : 'orb-card'}
      {...(probe ? { 'data-probe-id': card.id } : { 'data-card-id': card.id })}
      data-card-type={card.type}
      data-stack={stack ? stack.count : undefined}
      data-enter={enter || undefined}
      data-lod={lod}
      data-badge={card.badge}
      data-opened={card.opened || undefined}
      data-selected={selected || undefined}
      data-found={found}
      data-pending={card.id.includes('_pending-') || undefined}
      data-agent={card.provenance.kind === 'agent' ? card.provenance.agent : undefined}
      data-replies={replies || undefined}
      title={addedBy(card)}
      tabIndex={probe ? undefined : -1}
      style={style}
    >
      {!probe && (
        <input
          type="checkbox"
          className={s.cardSelect}
          data-card-action="select"
          data-testid="card-select"
          aria-label={`Select card: ${title}`}
          title="Select without opening · Shift-click a card to add to the selection"
          checked={selected}
          onChange={(event) => actions.select?.(card.id, event.currentTarget.checked)}
        />
      )}
      {lod !== 'title' && (
        <span className={`${c.cardHead} ${s.selectableHead}`}>
          <span className={s.cardKind} data-testid="orb-card-kind">
            {kindLabel(card)}
          </span>
          {card.badge && (
            <span
              className={card.badge === 'must' ? s.badge : `${s.badge} ${c.badgeSkim}`}
              data-testid="orb-card-badge"
            >
              {card.badge === 'must' ? 'Must read' : 'Skim'}
            </span>
          )}
        </span>
      )}
      {mediaFirst && lod !== 'title' && body}
      <h3 className={s.cardTitle} data-testid="orb-card-title">
        {title}
      </h3>
      {lod === 'title' && <CardTitleExtra card={card} />}
      {!mediaFirst && lod !== 'title' && body}
      {!probe && fixed && <ShowMore id={card.id} />}
      {lod === 'full' && card.view && card.type !== 'database' && (
        <AttachedStrip card={{ ...card, view: card.view }} />
      )}
      {lod === 'full' && card.why && <WhyLine card={card} />}
      {lod === 'full' && (
        <div className={s.cardFoot}>
          <p
            className={s.cardBy}
            data-testid="orb-card-by"
            title={card.provenance.kind === 'agent' ? `Session ${card.provenance.sessionId}` : undefined}
          >
            {card.provenance.kind === 'agent' && (
              <span
                className={s.cardByDot}
                style={{ background: AGENT_DOT[card.provenance.agent] }}
                aria-hidden="true"
              />
            )}
            {by(card)}
          </p>
          {!card.id.includes('_pending-') && <ThreadButton id={card.id} replies={replies} />}
        </div>
      )}
      {lod === 'compact' && replies > 0 && (
        <span className={s.replyBadge} data-testid="card-reply-count">
          {replies}
        </span>
      )}
      {lod === 'full' && card.note && <NoteTab card={card} />}
      {selected && (
        <span
          className={s.resizeHandle}
          data-resize-handle={card.id}
          data-testid="card-resize"
          aria-hidden="true"
        />
      )}
    </article>
  );
}

/** Memoised on the card object (the fold keeps unchanged cards identical), the LOD, the enter, selected and found flags. */
export const BoardCard = memo(BoardCardView);
