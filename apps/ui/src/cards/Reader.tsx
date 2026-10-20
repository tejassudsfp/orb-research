/**
 * The card reader (P2.5): what "opening" a card shows. Opening records `card.opened` (the reading queue ticks it).
 *
 * - Header: kind, title, close (Escape closes too).
 * - Bar: the Card and Note tabs (the card's user note tab), and the Must read / Skim badge.
 * - Card tab, by type: a Note's title and text (editable), an Image at full size with its caption, a PDF's pages
 *   rendered by pdf.js from the stored file, the whole Table (sortable), a Source's link (opens in the default
 *   browser), a design frame live at reader size with its version time, a diagram large with its Mermaid source
 *   (P3.8), a stack's summary and the cards it holds (P3.2). The user's own cards are editable (a user's question, risk or quote card edits like a note); agent
 *   cards are read-only here.
 * - Data tab (P6.3, every card but a Database): attach a dataset view to the card, edit its views, detach it.
 * - Note tab: the user's note on this card (`Card.note`), saved when the field loses focus or the reader closes.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../components/useFocusTrap.js';
import {
  DESIGN_FRAME_ESCAPE,
  ImageData,
  NoteData,
  readCardData,
  stackOf,
  type BoardCommandInput,
  type Card,
} from '@orb/shared';
import { useBoardRefs, useCardActions, type ReaderTab } from './context.js';
import { isPaper, kindLabel, titleOf } from './registry.js';
import { CARD_UI } from './types/index.js';
import { DataTab } from './dataset/DataAttach.js';
import c from './cards.module.css';
import { radioKeys } from '../components/radioKeys.js';
import { VisualViewport } from './VisualViewport.js';
import { CardReferences } from './CardReferences.js';
import { ThreadIcon } from '../components/icons.js';

type Dispatch = (command: BoardCommandInput) => void;

const USER_TEXT_TYPES: ReadonlySet<string> = new Set(['question', 'risk', 'quote']);

/** A text field that saves on blur (and on unmount) when its value changed. */
function useDraft(value: string, save: (next: string) => void) {
  const [draft, setDraft] = useState(value);
  const latest = useRef({ draft, value, save });
  latest.current = { draft, value, save };
  useEffect(() => setDraft(value), [value]);
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.draft !== l.value) l.save(l.draft);
    },
    [],
  );
  const commit = () => {
    if (draft !== value) save(draft);
  };
  return { draft, setDraft, commit };
}

function CardTab({ card, dispatch }: { card: Card; dispatch: Dispatch }) {
  const { assetUrl } = useCardActions();
  const editable = card.provenance.kind === 'user';
  const data = (card.data ?? {}) as Record<string, unknown>;
  const update = (patch: Record<string, unknown>) =>
    dispatch({ type: 'card.updated', id: card.id, patch: { data: { ...data, ...patch } } });

  // Paper notes and the text cards a user makes from Add card (question, risk or claim, quote) edit as title + text.
  const note =
    isPaper(card) || (editable && USER_TEXT_TYPES.has(card.type))
      ? readCardData(NoteData, card.data)
      : undefined;
  const titleValue = typeof data.title === 'string' ? data.title : '';
  const bodyValue =
    typeof data.body === 'string' ? data.body : typeof data.text === 'string' ? data.text : '';
  const title = useDraft(titleValue, (next) => update({ title: next }));
  const body = useDraft(bodyValue, (next) =>
    update(typeof data.body === 'string' || !('text' in data) ? { body: next } : { text: next }),
  );

  if (note && editable) {
    return (
      <>
        <label className={c.field}>
          Title
          <input
            className={c.input}
            data-testid="reader-note-title"
            value={title.draft}
            maxLength={500}
            onChange={(e) => title.setDraft(e.target.value)}
            onBlur={title.commit}
          />
        </label>
        <label className={c.field}>
          Text
          <textarea
            className={c.textarea}
            data-testid="reader-note-body"
            value={body.draft}
            maxLength={20_000}
            onChange={(e) => body.setDraft(e.target.value)}
            onBlur={body.commit}
          />
        </label>
      </>
    );
  }
  if (card.type === 'image') {
    const d = readCardData(ImageData, card.data);
    if (d) {
      return (
        <>
          <VisualViewport label="image">
            <img className={c.readerImage} src={assetUrl(d.asset)} alt={d.title} data-testid="reader-image" />
          </VisualViewport>
          {editable ? (
            <label className={c.field}>
              Caption
              <input
                className={c.input}
                data-testid="reader-caption"
                value={title.draft}
                maxLength={500}
                onChange={(e) => title.setDraft(e.target.value)}
                onBlur={title.commit}
              />
            </label>
          ) : (
            <p className={c.muted}>{d.title}</p>
          )}
          <p className={c.muted}>
            {d.asset.name}
            {d.width && d.height ? ` · ${d.width} × ${d.height}` : ''}
          </p>
        </>
      );
    }
  }
  // P6.2: every other type's reader is its UI module's (src/cards/types/<type>.tsx).
  const TypeReader = CARD_UI[card.type].Reader;
  if (TypeReader) return <TypeReader card={card} />;
  return bodyValue ? (
    <p className={c.muted} style={{ whiteSpace: 'pre-wrap' }} data-testid="reader-text">
      {bodyValue}
    </p>
  ) : (
    <p className={c.muted}>Nothing more on this card.</p>
  );
}

function NoteTab({ card, dispatch }: { card: Card; dispatch: Dispatch }) {
  const note = useDraft(card.note ?? '', (next) =>
    dispatch({ type: 'card.updated', id: card.id, patch: { note: next.trim() ? next : null } }),
  );
  return (
    <label className={c.field}>
      Your note on this card
      <textarea
        className={c.textarea}
        data-testid="reader-note-tab"
        placeholder="Write a note for yourself. Agents can read it but never change it."
        value={note.draft}
        maxLength={20_000}
        autoFocus
        onChange={(e) => note.setDraft(e.target.value)}
        onBlur={note.commit}
      />
    </label>
  );
}

export function Reader({
  card,
  tab,
  onTab,
  onClose,
  dispatch,
}: {
  card: Card;
  tab: ReaderTab;
  onTab: (tab: ReaderTab) => void;
  onClose: () => void;
  dispatch: Dispatch;
}) {
  const { thread, open } = useCardActions();
  const { cards } = useBoardRefs();
  const parent = card.stackedInto ? cards[card.stackedInto] : undefined;
  const stack = parent && stackOf(parent);
  const index = stack?.items.findIndex((item) => item.id === card.id) ?? -1;
  const previous = stack?.items
    .slice(0, index)
    .reverse()
    .find((item) => cards[item.id]);
  const next = index >= 0 ? stack?.items.slice(index + 1).find((item) => cards[item.id]) : undefined;
  // P5.2: a modal sheet: the focus moves in, Tab stays in, and goes back to what opened it on close.
  const dialog = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const previousCard = useRef(card.id);
  useLayoutEffect(() => {
    if (previousCard.current === card.id) return;
    previousCard.current = card.id;
    if (scroll.current) scroll.current.scrollTop = 0;
    // Moving between members keeps the same dialog, but the old clicked list item may have disappeared.
    dialog.current?.focus({ preventScroll: true });
  }, [card.id]);
  useLayoutEffect(() => {
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = previous;
    };
  }, []);
  useFocusTrap(dialog);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        e.stopPropagation();
        const details = dialog.current?.querySelector<HTMLButtonElement>('[data-row-details-close]');
        if (details) details.click();
        else onClose();
      }
    };
    // P6.2: Escape inside a live design frame (focus is in the frame's own page) closes the reader too.
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: unknown } | null;
      if (data?.type !== DESIGN_FRAME_ESCAPE) return;
      const frames = Array.from(dialog.current?.querySelectorAll('iframe') ?? []);
      if (frames.some((f) => f.contentWindow === e.source)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('message', onMessage);
    };
  }, [onClose]);

  const setBadge = (badge: 'must' | 'skim' | null) => {
    if ((card.badge ?? null) !== badge) dispatch({ type: 'card.updated', id: card.id, patch: { badge } });
  };

  return (
    <div
      className={c.readerBackdrop}
      data-panel="reader"
      data-testid="reader"
      data-card-id={card.id}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        className={c.reader}
        role="dialog"
        aria-modal="true"
        aria-label={titleOf(card)}
        tabIndex={-1}
      >
        <header className={c.readerHead}>
          <span className={c.readerKind}>{kindLabel(card)}</span>
          <h2 className={c.readerTitle} data-testid="reader-title">
            {titleOf(card)}
          </h2>
          <button
            type="button"
            className={c.readerBack}
            data-testid="reader-thread"
            onClick={() => {
              onClose();
              thread(card.id);
            }}
          >
            <ThreadIcon size={14} /> Thread
          </button>
          <button type="button" className={c.readerBack} data-testid="reader-close" onClick={onClose}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            Back to board
          </button>
        </header>
        {parent && stack && index >= 0 && (
          <nav className={c.stackNavigation} aria-label="Stack cards" data-testid="stack-navigation">
            <button
              type="button"
              className={`${c.readerBack} ${c.stackParent}`}
              data-testid="stack-back"
              onClick={() => open(parent.id)}
            >
              ← Back to stack: {titleOf(parent)}
            </button>
            <span className={c.stackPosition} data-testid="stack-position" aria-live="polite">
              Card {index + 1} of {stack.items.length}
            </span>
            <button
              type="button"
              className={c.readerBack}
              data-testid="stack-previous"
              disabled={!previous}
              onClick={() => previous && open(previous.id)}
            >
              Previous
            </button>
            <button
              type="button"
              className={c.readerBack}
              data-testid="stack-next"
              disabled={!next}
              onClick={() => next && open(next.id)}
            >
              Next
            </button>
          </nav>
        )}
        <div className={c.readerBar}>
          <div className={c.tabs} role="tablist" aria-label="Card tabs">
            {(card.type === 'database'
              ? (['card', 'note'] as const)
              : (['card', 'note', 'data'] as const)
            ).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? c.tabOn : c.tab}
                data-testid={`reader-tab-${t}`}
                onClick={() => onTab(t)}
              >
                {t === 'card'
                  ? 'Card'
                  : t === 'data'
                    ? card.view
                      ? 'Data •'
                      : 'Data'
                    : card.note
                      ? 'Note •'
                      : 'Note'}
              </button>
            ))}
          </div>
          <div className={c.chips} role="radiogroup" onKeyDown={radioKeys} aria-label="Reading badge">
            {(
              [
                [null, 'No badge'],
                ['must', 'Must read'],
                ['skim', 'Skim'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={(card.badge ?? null) === value}
                className={(card.badge ?? null) === value ? c.chipOn : c.chip}
                data-testid={`reader-badge-${value ?? 'none'}`}
                onClick={() => setBadge(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div
          ref={scroll}
          className={c.readerBody}
          role="tabpanel"
          data-testid="reader-body"
          data-layout={
            tab === 'data' ||
            [
              'database',
              'table',
              'image',
              'file',
              'chart',
              'diagram',
              'design',
              'matrix',
              'timeline',
              'framework',
            ].includes(card.type)
              ? 'wide'
              : 'document'
          }
        >
          {tab === 'card' || (tab === 'data' && card.type === 'database') ? (
            <>
              <CardTab key={card.id} card={card} dispatch={dispatch} />
              {card.detail && (
                <section
                  className={c.readerDetail}
                  data-testid="reader-detail"
                  aria-label="Detailed analysis"
                >
                  <h3>Detailed analysis</h3>
                  {card.detail.split(/\n\s*\n/).map((paragraph, i) => (
                    <p key={i}>
                      <CardReferences text={paragraph} />
                    </p>
                  ))}
                </section>
              )}
            </>
          ) : tab === 'data' ? (
            <DataTab key={card.id} card={card} />
          ) : (
            <NoteTab key={card.id} card={card} dispatch={dispatch} />
          )}
        </div>
      </section>
    </div>
  );
}
