/**
 * The Canvas PDF (BUILD_PLAN P4.4, PRD Port › Canvas PDF): one page per frame or one poster, each page drawing its
 * frames, cards (print halves) and links as on the board, with a footer (canvas title, frame, export date, page
 * number). The page size is set with `@page` (the main process prints with `preferCSSPageSize`).
 */
import { DASHED_LINK_TYPES } from '@orb/shared';
import { linkGeometry, linkText } from '../canvas/geometry.js';
import { PrintCard } from './PrintCard.js';
import { type CanvasPage, type CanvasPlan, type Rect } from './plan.js';
import { OrbMark } from '../brand/OrbMark.js';
import p from './print.module.css';

const at = (pg: CanvasPage, r: Rect): Rect => ({ x: r.x - pg.world.x, y: r.y - pg.world.y, w: r.w, h: r.h });

function Links({ page }: { page: CanvasPage }) {
  const rect = (id: string): Rect | undefined => {
    const item = page.cards.find((c) => c.id === id) ?? page.frames.find((f) => f.id === id);
    return item ? at(page, item) : undefined;
  };
  const drawn = page.links.flatMap(({ link, from, to }) => {
    const a = rect(from);
    const b = rect(to);
    return a && b ? [{ link, ...linkGeometry(a, b) }] : [];
  });
  return (
    <>
      <svg className={p.links} width="1" height="1" aria-hidden="true">
        {drawn.map(({ link, d, from, to }) => {
          const dashed = DASHED_LINK_TYPES.includes(link.type);
          return (
            <g key={link.id} className={dashed ? p.linkAccent : p.link}>
              <path d={d} />
              {dashed && (
                <>
                  <circle cx={from.x} cy={from.y} r={4} />
                  <circle cx={to.x} cy={to.y} r={4} />
                </>
              )}
            </g>
          );
        })}
      </svg>
      {drawn.map(({ link, mid }) =>
        linkText(link) ? (
          <span key={link.id} className={p.linkLabel} style={{ left: mid.x, top: mid.y }}>
            {linkText(link)}
          </span>
        ) : null,
      )}
    </>
  );
}

export function CanvasPrint({ plan, title, date }: { plan: CanvasPlan; title: string; date: string }) {
  const { w, h } = plan.size;
  const total = plan.pages.length;
  return (
    <>
      <style>{`@page { size: ${w}px ${h}px; margin: 0; }`}</style>
      {plan.pages.map((page, i) => (
        <section
          key={page.key}
          className={p.page}
          style={{ width: w, height: h }}
          data-testid="print-page"
          data-page-label={page.label}
        >
          <div
            className={p.world}
            style={{ transform: `translate(${page.offset.x}px, ${page.offset.y}px) scale(${page.scale})` }}
          >
            {page.frames.map((f) => {
              const r = at(page, f);
              return (
                <div
                  key={f.id}
                  className={`${p.frame} ${p[`tone_${f.color}`] ?? ''}`}
                  style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                  data-testid="print-frame"
                >
                  <span className={p.frameLabel}>
                    {String(f.index + 1).padStart(2, '0')} {f.title.toUpperCase()}
                  </span>
                </div>
              );
            })}
            {page.cards.map((card) => {
              const r = at(page, card);
              return (
                <PrintCard
                  key={card.id}
                  card={card}
                  mode="canvas"
                  style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                />
              );
            })}
            {/* Links are drawn above the cards, as on the board. */}
            <Links page={page} />
          </div>
          <footer className={p.footer} data-testid="print-footer">
            <span className={p.footerBrand} data-testid="print-footer-brand">
              <OrbMark size={12} />
              orb
            </span>
            <span className={p.footerTitle}>{title}</span>
            <span>{page.label}</span>
            <span>{date}</span>
            <span>
              {i + 1} / {total}
            </span>
          </footer>
        </section>
      ))}
    </>
  );
}
