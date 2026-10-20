/**
 * One slide, drawn (P6.17): the slide view's preview and the PDF slides' page. 960 x 540 CSS px; the view scales it with
 * a transform, the print route prints it as is (`@page size: 960px 540px`).
 *
 * - Covers (`title`, `section`) are Night with the stacked-free horizontal lockup in the footer; the others are white.
 * - A card on a slide is its own print half (`Print` of its card module, figure mode): the real chart, table, image,
 *   the design frame's snapshot, a metric… the same drawing the research document uses.
 * - The footer carries the lockup, the deck title, the slide's citation numbers ([1][2], the Sources slide's numbers)
 *   and the page number.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { Card, Slide } from '@orb/shared';
import { cardKindLabel, cardTitle } from '@orb/shared';
import { OrbLockup } from '../brand/OrbMark.js';
import { CARD_UI } from '../cards/types/index.js';
import type { SourceEntry } from './sources.js';
import d from './deck.module.css';

export type SlideFaceProps = {
  deckTitle: string;
  /** 1-based page number. */
  page: number;
  /** Citation numbers by card id (`deckCitationNumbers`). */
  numbers: ReadonlyMap<string, number>;
  cardOf: (id: string) => Card | undefined;
};

function Footer({
  deckTitle,
  page,
  cites,
  dark,
}: {
  deckTitle: string;
  page: number;
  cites: number[];
  dark: boolean;
}) {
  return (
    <footer className={d.foot} data-testid="slide-foot" data-brightness={dark ? 'dark' : 'light'}>
      <OrbLockup markSize={18} />
      <span className={d.footTitle}>{deckTitle}</span>
      {cites.length > 0 && (
        <span className={d.cites} data-testid="slide-cites">
          {cites.map((n) => `[${n}]`).join('')}
        </span>
      )}
      <span className={d.page}>{page}</span>
    </footer>
  );
}

/** Fit the complete print half, including long tables, inside the slide instead of cropping its last rows. */
function CardVisual({ card }: { card: Card }) {
  const { Print } = CARD_UI[card.type];
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const measuredCard = useRef(card);
  const [fit, setFit] = useState({ scale: 1, left: 8, width: 640, height: 0 });
  useLayoutEffect(() => {
    const outer = box.current,
      inner = content.current;
    if (!outer || !inner) return;
    const measure = () => {
      const w = Math.max(1, outer.clientWidth - 16),
        h = Math.max(1, outer.clientHeight - 16);
      if (fit.width !== w || fit.height !== h || measuredCard.current !== card) {
        measuredCard.current = card;
        setFit({ scale: 1, left: 8, width: w, height: h });
        return;
      }
      // CSS zoom changes font rounding and print pagination. Measure the rendered box, cancelling the preview's
      // own transform and current zoom, rather than assuming scrollHeight scales perfectly with the font.
      const preview = outer.getBoundingClientRect().width / Math.max(1, outer.offsetWidth);
      const currentZoom = Number.parseFloat(getComputedStyle(inner).zoom) || 1;
      const bounds = inner.getBoundingClientRect();
      const cw = Math.max(1, bounds.width / preview / currentZoom),
        ch = Math.max(1, bounds.height / preview / currentZoom);
      // Shrink monotonically for this content/viewport, avoiding font-rounding oscillation between two zooms.
      const scale = Math.min(fit.scale, (w - 2) / cw, (h - 2) / ch);
      const left = 8 + (w - cw * scale) / 2;
      setFit((old) =>
        Math.abs(old.scale - scale) < 0.0001 && Math.abs(old.left - left) < 0.1 && old.width === w
          ? old
          : { scale, left, width: w, height: h },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    inner.addEventListener('load', measure, true);
    return () => {
      observer.disconnect();
      inner.removeEventListener('load', measure, true);
    };
  }, [card, fit.scale, fit.width, fit.height]);
  return (
    <div
      ref={box}
      className={d.visualBox}
      data-testid="print-card"
      data-card-type={card.type}
      data-slide-visual={card.id}
    >
      <div className={d.visualContent} style={{ left: fit.left }}>
        <div ref={content} className={d.visualScale} style={{ zoom: fit.scale, width: fit.width }}>
          <Print card={card} mode="figure" />
        </div>
      </div>
    </div>
  );
}

export function SlideFace({ slide, deckTitle, page, numbers, cardOf }: SlideFaceProps & { slide: Slide }) {
  const cites = slide.cardIds.map((id) => numbers.get(id)).filter((n): n is number => n !== undefined);
  const dark = slide.layout === 'title' || slide.layout === 'section';
  const visual = slide.visual ? cardOf(slide.visual.cardId) : undefined;
  const bullets =
    slide.bullets.length > 0 ? (
      <ul
        className={`${d.bullets} ${slide.bullets.length > 6 ? d.bulletsSmall : ''}`}
        data-testid="slide-bullets"
      >
        {slide.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    ) : null;
  const visualBlock = slide.visual ? (
    <div className={d.visual}>
      {visual ? (
        <CardVisual card={visual} />
      ) : (
        <div className={d.visualBox}>
          <p className={d.missing}>The card on this slide is no longer on the board.</p>
        </div>
      )}
      {slide.visual.caption && <p className={d.caption}>{slide.visual.caption}</p>}
    </div>
  ) : null;

  let content: React.ReactNode;
  if (dark) {
    content = (
      <>
        <div className={d.bar} />
        <div className={d.cover} style={slide.layout === 'section' ? { top: 190 } : undefined}>
          <h1 className={d.coverTitle} data-testid="slide-title">
            {slide.title}
          </h1>
          {slide.subtitle && <p className={d.coverSub}>{slide.subtitle}</p>}
        </div>
      </>
    );
  } else if (slide.layout === 'quote') {
    const data = (visual?.data ?? {}) as Record<string, unknown>;
    const text =
      slide.bullets[0] ??
      (typeof data.body === 'string' ? data.body : typeof data.text === 'string' ? data.text : '');
    const who = slide.subtitle ?? (visual ? cardTitle(visual) : '');
    content = (
      <>
        <h2 className={d.title} data-testid="slide-title">
          {slide.title}
        </h2>
        <div className={d.rule} />
        <div className={d.quote}>
          <p className={d.quoteText}>“{text}”</p>
          {who && <p className={d.quoteWho}>— {who}</p>}
        </div>
      </>
    );
  } else {
    content = (
      <>
        <h2 className={d.title} data-testid="slide-title">
          {slide.title}
        </h2>
        <div className={d.rule} />
        <div className={d.body}>
          {slide.layout === 'bullets' && bullets}
          {slide.layout === 'visual' && (
            <>
              {visualBlock}
              {bullets && <div className={`${d.side}`}>{bullets}</div>}
            </>
          )}
          {slide.layout === 'two-column' && (
            <>
              <div className={d.sideNarrow}>{bullets}</div>
              {visualBlock}
            </>
          )}
        </div>
      </>
    );
  }
  return (
    <section
      className={`${d.slide} ${dark ? d.night : ''}`}
      data-testid="slide"
      data-slide-id={slide.id}
      data-layout={slide.layout}
      data-cited={slide.cardIds.length}
    >
      {content}
      <Footer deckTitle={deckTitle} page={page} cites={cites} dark={dark} />
    </section>
  );
}

/** A Sources slide (page `n` of `of`). */
export function SourcesFace({
  entries,
  deckTitle,
  page,
  n,
  of,
}: {
  entries: readonly SourceEntry[];
  deckTitle: string;
  page: number;
  n: number;
  of: number;
}) {
  return (
    <section className={d.slide} data-testid="slide" data-slide-id="sources" data-layout="sources">
      <h2 className={d.title} data-testid="slide-title">
        {of > 1 ? `Sources (${n}/${of})` : 'Sources'}
      </h2>
      <div className={d.rule} />
      <div className={d.body}>
        <ol className={d.sources} data-testid="slide-sources">
          {entries.length === 0 && <li>This deck cites no cards.</li>}
          {entries.map((e) => (
            <li key={e.cardId} value={e.n} data-card-id={e.cardId}>
              <strong>
                [{e.n}] {e.title}
              </strong>
              {e.kind && `${e.kind} · `}card {e.cardId}
              {e.url && (
                <>
                  {' · '}
                  <a href={e.url}>{e.url}</a>
                </>
              )}
            </li>
          ))}
        </ol>
      </div>
      <Footer deckTitle={deckTitle} page={page} cites={[]} dark={false} />
    </section>
  );
}

/** The card's kind and title, for chips ("chart · Revenue"). */
export const cardChip = (card: Card): string => `${cardKindLabel(card)} · ${cardTitle(card)}`;
