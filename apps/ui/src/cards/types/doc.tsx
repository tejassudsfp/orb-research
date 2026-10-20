/**
 * Doc draft: its text. A stack card (P3.2 `consolidate_cards`, a doc with `stack`) shows its summary and the titles
 * of the cards it holds on the board, in the reader and in print.
 */
import { stackOf, type Card } from '@orb/shared';
import { useBoardRefs, useCardActions } from '../context.js';
import { titleOf, kindLabel } from '../labels.js';
import { PrintBody, printBodyOf, type PrintHalf } from '../../print/kit.js';
import { pptxHook } from '../pptx.js';
import { TextBody, textOf, type CardBody, ReaderText, type CardUi } from './kit.js';
import s from '../../canvas/canvas.module.css';
import c from '../cards.module.css';
import p from '../../print/print.module.css';

const Body: CardBody = ({ card, lod }) => {
  const { open } = useCardActions();
  const stack = stackOf(card);
  const body = textOf(card);
  if (!stack) return <TextBody card={card} lod={lod} />;
  const shown = lod === 'full' ? 3 : 0;
  return (
    <>
      {body && <p className={s.cardBody}>{body}</p>}
      {shown > 0 && (
        <ul className={c.stackItems} data-testid="card-stack-items">
          {stack.items.slice(0, shown).map((item) => (
            <li key={item.id}>{item.title}</li>
          ))}
          <li className={c.stackMore}>
            <button type="button" className={c.stackOpen} onClick={() => open(card.id)}>
              View all {stack.count} cards
            </button>
          </li>
        </ul>
      )}
    </>
  );
};

/** A stack in the reader: its summary and every card it holds. A plain doc falls back to the text. */
function Reader({ card }: { card: Card }) {
  const { cards } = useBoardRefs();
  const { open } = useCardActions();
  const stack = stackOf(card);
  if (!stack) return <ReaderText card={card} />;
  const body = textOf(card);
  return (
    <>
      {body && (
        <p className={c.muted} style={{ whiteSpace: 'pre-wrap' }} data-testid="reader-text">
          {body}
        </p>
      )}
      <p className={c.muted}>Open any of the {stack.items.length} cards in this stack to read it in full.</p>
      <ul className={c.stackList} data-testid="reader-stack" aria-label="Cards in this stack">
        {stack.items.map((item) => {
          const member = cards[item.id];
          return (
            <li key={item.id} data-stacked-id={item.id}>
              <button
                type="button"
                className={c.stackMember}
                data-testid="stack-member"
                disabled={!member}
                onClick={(event) => {
                  // A second click that opened this reader must not fall through onto a member underneath it.
                  if (event.detail <= 1) open(item.id);
                }}
              >
                <span className={c.stackKind}>{member ? kindLabel(member) : item.type}</span>
                <span className={c.stackMemberTitle}>{member ? titleOf(member) : item.title}</span>
                <span className={c.stackMemberHint}>{member ? 'Open card →' : 'Card unavailable'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const Print: PrintHalf = ({ card }) => {
  const stack = stackOf(card);
  return (
    <>
      <PrintBody>{printBodyOf(card)}</PrintBody>
      {stack && (
        <ul className={p.stack}>
          {stack.items.map((item) => (
            <li key={item.id}>{item.title}</li>
          ))}
        </ul>
      )}
    </>
  );
};

export const doc: CardUi = { Body, Reader, Print, pptx: pptxHook };
