/**
 * Card print halves (PRD card contract part 5 "Print", BUILD_PLAN P4.4; P6.2 card platform): the frame every printed
 * card shares (kind, badge, title, why line, the user's note, author or figure caption) around its type's own print
 * half (`Print` of its UI module in src/cards/types/<type>.tsx), on a Canvas PDF page (`mode="canvas"`: the card at
 * its board place and size, as on screen) or as a numbered element of a research document (`mode="figure"`).
 *
 * | Type     | In print                                                        |
 * |----------|-----------------------------------------------------------------|
 * | note     | styled text block                                               |
 * | source   | summary, why line, clickable link (a real `<a href>`)          |
 * | quote    | pull quote with its citation (and link)                          |
 * | image    | the full-resolution image with its caption                       |
 * | file     | cover thumbnail with title and page reference                    |
 * | question | styled text block (open or answered)                             |
 * | risk     | dashed text block with its label (risk or claim)                 |
 * | design   | the 2x snapshot taken at export, labelled with its capture time  |
 * | diagram  | Mermaid SVG (vector)                                             |
 * | table    | a real table (a figure repeats its header across pages)         |
 * | doc      | text section (a stack lists the cards it holds)                  |
 *
 * The user's note on a card (P2.5) prints under it: notes count as user content in exports.
 */
import type { CSSProperties } from 'react';
import type { Card } from '@orb/shared';
import { kindLabel, titleOf } from '../cards/labels.js';
import { CARD_UI } from '../cards/types/index.js';
import type { PrintMode } from './kit.js';
import p from './print.module.css';

export { PrintCtx, printedAt, type PrintContext, type PrintMode, type Snapshot } from './kit.js';

const by = (card: Card) =>
  card.provenance.kind === 'agent' ? `${card.provenance.agent} · ${card.provenance.model}` : 'you';

/** One card's print half. */
export function PrintCard({
  card,
  mode,
  style,
  label,
  source,
  caption,
}: {
  card: Card;
  mode: PrintMode;
  /** Canvas mode: the card's place on the page. */
  style?: CSSProperties;
  /** Figure mode: "Figure 3", "Table 1". */
  label?: string;
  /** Figure mode: the number of the source this element cites. */
  source?: number;
  /** Figure mode (P4.5 composed document): the caption Orb gave the figure. */
  caption?: string;
}) {
  const paper = card.type === 'note' && card.provenance.kind === 'user';
  const kind = kindLabel(card);
  const { Print, mediaFirst } = CARD_UI[card.type];
  const title = titleOf(card);
  const showTitle = card.type !== 'quote' || mode === 'canvas';
  const className = [
    mode === 'canvas' ? p.card : p.figure,
    paper ? p.paper : '',
    card.provenance.kind === 'agent' ? p.agent : '',
    p[`type_${card.type}`] ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <article
      className={className}
      style={style}
      data-testid="print-card"
      data-card-id={card.id}
      data-card-type={card.type}
    >
      <header className={p.head}>
        {label && <span className={p.figLabel}>{label}</span>}
        <span className={p.kind}>{kind}</span>
        {card.badge && <span className={p.badge}>{card.badge === 'must' ? 'Must read' : 'Skim'}</span>}
        {source !== undefined && <span className={p.cite}>[{source}]</span>}
      </header>
      {mediaFirst && <Print card={card} mode={mode} />}
      {showTitle && <h3 className={p.title}>{title}</h3>}
      {!mediaFirst && <Print card={card} mode={mode} />}
      {mode === 'figure' && card.detail && (
        <div data-testid="print-card-detail">
          {card.detail.split(/\n\s*\n/).map((paragraph, i) => (
            <p key={i} style={{ whiteSpace: 'pre-wrap' }}>
              {paragraph}
            </p>
          ))}
        </div>
      )}
      {card.why && <p className={p.why}>Why: {card.why}</p>}
      {card.note && <p className={p.note}>Note: {card.note}</p>}
      {mode === 'figure' && caption && caption !== title && (
        <p className={p.caption} data-testid="print-caption">
          {label ? `${label}. ` : ''}
          {caption}
        </p>
      )}
      {mode === 'canvas' && <p className={p.by}>{by(card)}</p>}
    </article>
  );
}
