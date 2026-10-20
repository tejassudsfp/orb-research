/**
 * Checklist: agents propose items, the user ticks them. The checkboxes are the user's alone: ticking is one undoable
 * `card.updated` made through `setData`, and the planner refuses an agent change that flips a tick. The user can add
 * and remove items on any checklist; an agent's own text edits keep ticks (host half).
 */
import { HEIGHTS, ChecklistData, checklistProgress, nextItemId, readCardData, type Card, type ChecklistItem } from '@orb/shared';
import { useState } from 'react';
import { type PrintHalf } from '../../print/kit.js';
import { useCardActions } from '../context.js';
import { pptxHook } from '../pptx.js';
import { type CardBody, type CardUi, TextBody } from './kit.js';
import c from '../cards.module.css';
import m from '../media/media.module.css';

function useItems(card: Card) {
  const { setData } = useCardActions();
  const data = (card.data ?? {}) as Record<string, unknown>;
  const items: ChecklistItem[] = readCardData(ChecklistData, card.data)?.items ?? [];
  const save = (next: ChecklistItem[]) => setData(card.id, { ...data, items: next });
  return {
    items,
    toggle: (id: string) => save(items.map((it) => (it.id === id ? { ...it, done: !it.done } : it))),
    add: (text: string) => save([...items, { id: nextItemId(items), text, done: false }]),
    remove: (id: string) => save(items.filter((it) => it.id !== id)),
  };
}

function Items({ card, limit, editable }: { card: Card; limit?: number; editable?: boolean }) {
  const { items, toggle, remove } = useItems(card);
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <>
      <ul className={m.checks} data-testid="checklist-items">
        {shown.map((it) => (
          <li key={it.id} className={it.done ? `${m.check} ${m.checkDone}` : m.check}>
            <input
              type="checkbox"
              checked={it.done}
              aria-label={it.text}
              data-testid="checklist-box"
              // The board's pointer handlers would start a drag from a press on the box.
              onPointerDown={(e) => e.stopPropagation()}
              onChange={() => toggle(it.id)}
            />
            <span>{it.text}</span>
            {editable && (
              <button type="button" className={c.chip} aria-label={`Remove ${it.text}`} onClick={() => remove(it.id)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {limit && items.length > limit && <p className={m.agentNote}>{items.length - limit} more</p>}
    </>
  );
}

function Progress({ card }: { card: Card }) {
  const { done, total } = checklistProgress(card.data);
  return (
    <span className={m.progress} data-testid="checklist-progress">
      {done} of {total} done
    </span>
  );
}

const Body: CardBody = ({ card, lod }) => {
  if (!readCardData(ChecklistData, card.data)) return <TextBody card={card} lod={lod} />;
  const rows = Math.max(2, Math.floor((HEIGHTS.checklist.max - 140) / 24));
  return (
    <>
      <Progress card={card} />
      <Items card={card} limit={lod === 'compact' ? 3 : rows} />
    </>
  );
};

function Reader({ card }: { card: Card }) {
  const { add } = useItems(card);
  const [text, setText] = useState('');
  return (
    <>
      <Progress card={card} />
      <Items card={card} editable />
      <form
        className={m.add}
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add(text.trim().slice(0, 300));
          setText('');
        }}
      >
        <input
          className={c.input}
          value={text}
          maxLength={300}
          placeholder="Add an item"
          aria-label="Add an item"
          data-testid="checklist-add"
          onChange={(e) => setText(e.target.value)}
        />
      </form>
      <p className={m.agentNote}>Agents propose items. Only you tick them.</p>
    </>
  );
}

const Print: PrintHalf = ({ card }) => {
  const items = readCardData(ChecklistData, card.data)?.items ?? [];
  return (
    <ul className={m.checks} data-testid="print-checklist">
      {items.map((it) => (
        <li key={it.id} className={m.check}>
          <span className={m.box} aria-hidden="true">
            {it.done ? '✓' : ''}
          </span>
          <span>
            {it.text}
          </span>
        </li>
      ))}
    </ul>
  );
};

export const checklist: CardUi = { Body, Reader, Print, pptx: pptxHook };
