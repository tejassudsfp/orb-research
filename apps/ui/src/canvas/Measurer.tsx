/**
 * P6.20: measures the cards the layout engine owns, so the board is laid out with ACTUAL heights.
 *
 * A card the layout owns (an agent's card, a template's seed the user has not dragged: `isMeasuredCard`) is drawn at the
 * height the layout gave it, clipped behind "Show more". To learn how tall its content really is, a hidden copy of it
 * is drawn off screen at the card's width with no fixed height (the `probe` mode of BoardCard: the same markup and
 * CSS, so the number is exactly what the card would take), a few at a time, and its height is taken once it stops
 * changing (a database's rows arrive after the card is drawn). The heights go to the canvas service through
 * `orb/board.command` (`layout.measured`, debounced), which keeps them in the type's range, stores them as ordinary
 * card events and reflows the frames: the renderer never moves anything itself. A card is measured again only when its
 * content or width changes, and a card whose measured height is within a few pixels of its own is not reported.
 *
 * Cards are measured at full detail whatever the zoom, so a board opened zoomed out is already laid out with real
 * heights. Pictures and charts (`UNMEASURED_TYPES`) fill the height they are given and are never measured.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { UNMEASURED_TYPES, clampHeight, stackOf, type Card } from '@orb/shared';
import { BoardCard, isMeasuredCard } from './BoardCard.js';
import s from './canvas.module.css';

/** Hidden cards drawn at once. */
const BATCH = 6;
/** A card is taken as measured once its height has not changed for this long. */
const SETTLE_MS = 160;
/** ...or after this long, whatever it did. */
const MAX_MS = 1500;
/** Heights are sent this long after the last one is taken (so a burst of placements is one command). */
const FLUSH_MS = 350;
/** The service ignores a difference below this (`MEASURE_EPS`): so is it not reported. */
const EPS = 4;
/** Most heights in one command (the wire's limit). */
const MAX_PER_COMMAND = 200;

/** What a card's natural height depends on. */
type Sig = Pick<Card, 'data' | 'why' | 'w' | 'badge' | 'note' | 'view'>;
const sigOf = (c: Card): Sig => ({ data: c.data, why: c.why, w: c.w, badge: c.badge, note: c.note, view: c.view });
const same = (a: Sig, b: Sig) =>
  a.data === b.data && a.why === b.why && a.w === b.w && a.badge === b.badge && a.note === b.note && a.view === b.view;

/** True when the card's height should follow its content. */
export const wantsMeasure = (c: Card): boolean =>
  !c.stackedInto && c.frameId !== null && isMeasuredCard(c) && !UNMEASURED_TYPES.has(c.type);

function Probe({ card, onHeight }: { card: Card; onHeight: (id: string, h: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onHeight(card.id, last.current);
    };
    const take = () => {
      const h = el.offsetHeight;
      if (h <= 0) return;
      last.current = h;
      clearTimeout(settle);
      settle = setTimeout(finish, SETTLE_MS);
    };
    take();
    const ro = new ResizeObserver(take);
    ro.observe(el);
    const cap = setTimeout(() => {
      if (last.current > 0) finish();
    }, MAX_MS);
    return () => {
      finished = true;
      clearTimeout(settle);
      clearTimeout(cap);
      ro.disconnect();
    };
  }, [card.id]);
  return (
    <div ref={box} className="orb-probe-box" style={{ position: 'absolute', left: 0, top: 0, width: card.w }}>
      <BoardCard card={card} lod="full" enter={false} probe />
    </div>
  );
}

function MeasurerView({
  cards,
  ready,
  report,
}: {
  cards: readonly Card[];
  ready: boolean;
  /** Send measured heights (card id → px) to the canvas service. */
  report: (heights: Record<string, number>) => void;
}) {
  /** What each card was last measured at (its content signature), so an unchanged card is not drawn again. */
  const done = useRef(new Map<string, Sig>());
  const [round, setRound] = useState(0);
  const pending = useRef(new Map<string, number>());
  const flush = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportRef = useRef(report);
  reportRef.current = report;
  const byId = useRef(new Map<string, Card>());
  byId.current = new Map(cards.map((c) => [c.id, c]));

  const todo = useMemo(
    () =>
      ready
        ? cards.filter((c) => wantsMeasure(c) && !(done.current.get(c.id) && same(done.current.get(c.id)!, sigOf(c))))
        : [],
    // `round` re-evaluates after a batch is taken.
    [cards, ready, round],
  );
  const batch = todo.slice(0, BATCH);

  const sendNow = () => {
    flush.current = null;
    const all = [...pending.current];
    pending.current.clear();
    for (let i = 0; i < all.length; i += MAX_PER_COMMAND)
      reportRef.current(Object.fromEntries(all.slice(i, i + MAX_PER_COMMAND)));
  };
  const onHeight = useRef((id: string, h: number) => {
    const card = byId.current.get(id);
    if (!card) return;
    done.current.set(id, sigOf(card));
    const want = clampHeight(stackOf(card) ? 'stack' : card.type, h);
    if (Math.abs(want - card.h) >= EPS) {
      pending.current.set(id, h);
      if (flush.current) clearTimeout(flush.current);
      flush.current = setTimeout(sendNow, FLUSH_MS);
    }
    setRound((n) => n + 1);
  }).current;
  useEffect(
    () => () => {
      if (flush.current) clearTimeout(flush.current);
    },
    [],
  );
  // Cards that left the board are forgotten.
  useEffect(() => {
    for (const id of done.current.keys()) if (!byId.current.has(id)) done.current.delete(id);
  }, [cards]);

  if (batch.length === 0) return null;
  return (
    <div
      className={s.probes ?? ''}
      aria-hidden="true"
      // Inert: the hidden copies hold buttons that must never be focusable or read out.
      ref={(el) => el?.setAttribute('inert', '')}
      data-testid="measurer"
      data-measuring={batch.length}
    >
      {batch.map((card) => (
        <Probe key={card.id} card={card} onHeight={onHeight} />
      ))}
    </div>
  );
}

export const Measurer = memo(MeasurerView);
