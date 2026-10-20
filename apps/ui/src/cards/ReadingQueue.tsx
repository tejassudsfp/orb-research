/**
 * The reading queue (PRD Canvas › Reading queue; prototype "YOUR READING QUEUE"): a frame-like panel listing the cards
 * marked Must read or Skim, Must read first, each in board order. A card gets a tick once the user has opened it
 * (`card.opened`). Clicking an item flies to the card and opens its full-screen reader. It lives inside the
 * conversation rail, starts collapsed, and appears when at least one card has a reading badge.
 */
import { memo, useMemo, useState } from 'react';
import type { Card } from '@orb/shared';
import { queueOf, titleOf } from './labels.js';
import c from './cards.module.css';

function ReadingQueueView({ cards, onPick }: { cards: readonly Card[]; onPick: (id: string) => void }) {
  const items = useMemo(() => queueOf(cards), [cards]);
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const read = items.filter((x) => x.opened).length;
  return (
    <section
      className={c.queue}
      data-panel="reading-queue"
      data-testid="reading-queue"
      aria-label="Your reading queue"
    >
      <button
        type="button"
        className={c.queueHead}
        aria-expanded={open}
        aria-controls="conversation-reading-list"
        aria-label={open ? 'Fold the reading queue' : 'Show the reading queue'}
        data-testid="reading-queue-toggle"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={c.queueTitle}>Must read & skim</span>
        <span className={c.queueCount} data-testid="reading-queue-count">
          {read}/{items.length} read
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
        </svg>
      </button>
      <ul id="conversation-reading-list" className={c.queueList} hidden={!open}>
        {items.map((card) => (
          <li key={card.id}>
            <button
              type="button"
              className={
                card.badge === 'must' && !card.opened ? `${c.queueItem} ${c.queueItemMust}` : c.queueItem
              }
              data-testid="reading-queue-item"
              data-card-id={card.id}
              data-opened={card.opened || undefined}
              onClick={() => onPick(card.id)}
            >
              {card.opened ? (
                <span className={c.tickDone} aria-label="Read" data-testid="reading-queue-tick">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--orb-on-accent)"
                    strokeWidth="3"
                    aria-hidden="true"
                  >
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                </span>
              ) : (
                <span className={c.tick} aria-label="Unread" />
              )}
              <span className={card.opened ? c.queueTextDone : c.queueText}>{titleOf(card)}</span>
              <span className={card.badge === 'must' ? c.queueBadgeMust : c.queueBadge}>
                {card.badge === 'must' ? 'MUST' : 'SKIM'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const ReadingQueue = memo(ReadingQueueView);
