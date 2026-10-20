/**
 * Links (P2.3, PRD Canvas › Links; P6.20 routing): paths between cards and frames in world coordinates, each with a mono
 * label pill. A link is ROUTED (`routing.ts`): an orthogonal path with rounded corners that goes round every other card,
 * through the gutters, and its label sits where the path leaves the pill clear of cards. The paths are drawn BEHIND the
 * cards (a path that has to touch a card ends at its edge); the labels are drawn above them, and off them.
 *
 * Tension and contradicts use the prototype's dashed accent style (`stroke-dasharray 5 5`, end dots); the other types
 * are solid and quieter. A wide transparent stroke and the label take clicks (select; Delete removes). A link whose end
 * is stacked into a stack card (P3.2) is drawn to the stack.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { DASHED_LINK_TYPES, type BoardState, type Link } from '@orb/shared';
import { linkText } from './geometry.js';
import { intersects, type Rect } from './viewport.js';
import { linkPillSize, separateLinkLabels } from './labels.js';
import { LinkRoutes, labelSpot, type Route } from './routing.js';
import s from './canvas.module.css';

export type LaidLink = {
  link: Link;
  route: Route;
  box: Rect;
  /** The centre of the label pill. */
  mid: { x: number; y: number };
};

/**
 * Where frame furniture sits (canvas.module.css `.frameLabel`, `.frameThread`), so a link label is never drawn on a
 * frame's `01 TITLE` label or its Thread button (P6.9).
 */
function frameObstacles(board: BoardState, selected: ReadonlySet<string>): Rect[] {
  const out: Rect[] = [];
  for (const f of Object.values(board.frames)) {
    out.push({ x: f.x + 16, y: f.y + 13, w: (f.title.length + 3) * 8.6, h: 18 });
    if (selected.has(f.id) || (board.threads?.[f.id]?.length ?? 0) > 0)
      out.push({ x: f.x + f.w - 12 - 84, y: f.y + 8, w: 84, h: 26 });
  }
  return out;
}

const boxOf = (route: Route): Rect => {
  const pts = route.points.length > 0 ? route.points : [route.from, route.to];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs, route.from.x, route.to.x);
  const y = Math.min(...ys, route.from.y, route.to.y);
  return {
    x,
    y,
    w: Math.max(...xs, route.from.x, route.to.x) - x,
    h: Math.max(...ys, route.from.y, route.to.y) - y,
  };
};

/** Time one pass may spend routing links before it lets the screen draw. */
const ROUTE_BUDGET_MS = 14;

/**
 * Route every link of the board and place its label. Routes are kept while the cards near a link do not change, so
 * panning costs nothing; a link whose route is not ready is drawn as the plain curve for a moment and routed in the
 * next idle slice (a burst of board events, or a card being dragged, never waits for routing). `selected` only matters
 * for frames' thread buttons.
 */
export function useLinkLayout(board: BoardState | undefined, selected: ReadonlySet<string>): LaidLink[] {
  const routes = useRef<LinkRoutes | null>(null);
  routes.current ??= new LinkRoutes();
  const [tick, setTick] = useState(0);
  const cards = board?.cards;
  const frames = board?.frames;
  const links = board?.links;
  const threads = board?.threads;
  const { laid, stale } = useMemo(() => {
    if (!board || !links || Object.keys(links).length === 0) return { laid: [] as LaidLink[], stale: false };
    const { items: routed, stale: notYet } = routes.current!.routes(board, ROUTE_BUDGET_MS);
    const furniture = frameObstacles(board, selected);
    const cardRects = Object.values(board.cards)
      .filter((c) => !c.stackedInto)
      .map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }));
    const spots = routed.map(({ link, route }) => {
      const text = linkText(link);
      const b = boxOf(route);
      const near = (r: Rect) =>
        r.x < b.x + b.w + 240 && r.x + r.w > b.x - 240 && r.y < b.y + b.h + 240 && r.y + r.h > b.y - 240;
      const avoid = [...furniture.filter(near), ...cardRects.filter(near)];
      return { id: link.id, ...labelSpot(route, text, avoid), ...linkPillSize(text) };
    });
    // Separate the pills over ALL links (not just the visible ones), so a label does not jump while the board pans.
    const placed = separateLinkLabels(spots, [...furniture, ...cardRects]);
    return {
      laid: routed.map(({ link, route }) => ({
        link,
        route,
        box: boxOf(route),
        mid: placed.get(link.id) ?? route.mid,
      })),
      stale: notYet,
    };
  }, [cards, frames, links, threads, selected, tick]);
  // Come back for the links that ran out of budget (the curve stands in for them until then).
  useEffect(() => {
    if (!stale) return;
    const timer = setTimeout(() => setTick((n) => n + 1), 0);
    return () => clearTimeout(timer);
  }, [laid, stale]);
  return laid;
}

/** The links' paths, drawn behind the cards. */
function LinksPathsInner({
  laid,
  view,
  selected,
}: {
  laid: readonly LaidLink[];
  view: Rect;
  selected: ReadonlySet<string>;
}) {
  const items = laid.filter((o) => intersects(o.box, view));
  if (items.length === 0) return null;
  return (
    <svg className={s.links} width="1" height="1" aria-hidden="true" data-testid="links-layer">
      {items.map(({ link, route }) => {
        const dashed = DASHED_LINK_TYPES.includes(link.type);
        const on = selected.has(link.id);
        const cls = [s.link, dashed ? s.linkAccent : '', on ? s.linkSelected : '']
          .filter(Boolean)
          .join(' ');
        return (
          <g key={link.id} className={cls}>
            <path className={s.linkHit} d={route.d} data-link-id={link.id} />
            <path
              className={s.linkPath}
              d={route.d}
              data-testid="orb-link"
              data-link-type={link.type}
              data-link-from={link.from}
              data-link-to={link.to}
              data-routed={route.routed || undefined}
              data-dashed={dashed || undefined}
              strokeDasharray={dashed ? '5 5' : undefined}
            />
            <circle className={s.linkEnd} cx={route.from.x} cy={route.from.y} r={4} />
            <circle className={s.linkEnd} cx={route.to.x} cy={route.to.y} r={4} />
          </g>
        );
      })}
    </svg>
  );
}
export const LinksPaths = memo(LinksPathsInner);

/** The links' labels, above the cards. */
function LinksLabelsInner({
  laid,
  view,
  selected,
}: {
  laid: readonly LaidLink[];
  view: Rect;
  selected: ReadonlySet<string>;
}) {
  const items = laid.filter((o) => intersects(o.box, view));
  return (
    <>
      {items.map(({ link, mid }) => (
        <span
          key={link.id}
          className={[
            s.linkLabel,
            DASHED_LINK_TYPES.includes(link.type) ? s.linkLabelAccent : '',
            selected.has(link.id) ? s.linkSelected : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ left: mid.x, top: mid.y }}
          data-link-id={link.id}
          data-testid="orb-link-label"
        >
          {linkText(link)}
        </span>
      ))}
    </>
  );
}
export const LinksLabels = memo(LinksLabelsInner);
