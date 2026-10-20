/**
 * Floating bar at the top centre (P2.3):
 * - with the Connect tool: the link type the next connection gets (supports, contradicts, tension, leads to,
 *   example of, or a free label);
 * - with a selection: how many items, the tone swatches and Rename for one frame, the link type for one link, and
 *   Delete; for one card (P2.5) its Must read / Skim badge and Open (the reader).
 */
import { memo, useState } from 'react';
import { FrameColor, LinkType, type BoardCommandInput, type BoardState } from '@orb/shared';
import { deleteCommand } from './geometry.js';
import type { LinkChoice } from './useBoardInput.js';
import s from './canvas.module.css';
import c from '../screens/Canvas/Canvas.module.css';
import { radioKeys } from '../components/radioKeys.js';

const LINK_LABEL: Record<LinkType, string> = {
  supports: 'Supports',
  contradicts: 'Contradicts',
  tension: 'Tension',
  'leads-to': 'Leads to',
  'example-of': 'Example of',
  label: 'Label…',
};
const TONE_LABEL: Record<FrameColor, string> = { sky: 'Sky', signal: 'Signal', rho: 'Rho', paper: 'Paper' };

function LinkTypes({
  value,
  label,
  onPick,
  testid,
}: {
  value: LinkType;
  label: string;
  onPick: (choice: LinkChoice) => void;
  testid: string;
}) {
  const [text, setText] = useState(label);
  return (
    <div
      className={s.barGroup}
      role="radiogroup"
      onKeyDown={radioKeys}
      aria-label="Link type"
      data-testid={testid}
    >
      {LinkType.options.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          className={value === t ? s.barChipOn : s.barChip}
          data-testid={`link-type-${t}`}
          onClick={() => onPick(t === 'label' ? { type: t, label: text || 'Label' } : { type: t })}
        >
          {LINK_LABEL[t]}
        </button>
      ))}
      {value === 'label' && (
        <input
          className={s.barInput}
          aria-label="Link label"
          data-testid="link-label-input"
          value={text}
          maxLength={60}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) onPick({ type: 'label', label: text.trim() });
            e.stopPropagation();
          }}
        />
      )}
    </div>
  );
}

function SelectionBarInner({
  board,
  selection,
  connecting,
  link,
  onLinkChoice,
  dispatch,
  onRenameFrame,
  onOpenCard,
  onPromote,
  onChart,
  context,
  onContext,
}: {
  board: BoardState;
  selection: readonly string[];
  connecting: boolean;
  link: LinkChoice;
  onLinkChoice: (choice: LinkChoice) => void;
  dispatch: (command: BoardCommandInput) => void;
  onRenameFrame: (id: string) => void;
  onOpenCard?: (id: string, tab?: 'card' | 'note' | 'data') => void;
  /** P6.3: turn a Table card into a Database card. */
  onPromote?: (id: string) => void;
  /** P6.4: make a Chart card bound to a Table or Database card. */
  onChart?: (id: string) => void;
  /** P3.6: frames and cards in the conversation's context, and how to toggle the selection's. */
  context?: readonly string[];
  onContext?: (ids: string[], add: boolean) => void;
}) {
  if (connecting) {
    return (
      <div className={`${c.surface} ${s.bar}`} data-panel="selection" data-testid="connect-bar">
        <span className={s.barText}>Connect as</span>
        <LinkTypes value={link.type} label={link.label ?? ''} onPick={onLinkChoice} testid="connect-types" />
      </div>
    );
  }
  if (selection.length === 0) return null;
  const only = selection.length === 1 ? selection[0]! : null;
  const frame = only ? board.frames[only] : undefined;
  const theLink = only ? board.links[only] : undefined;
  const card = only ? board.cards[only] : undefined;
  const remove = deleteCommand(board, selection);
  // Cards and frames of the selection (not links) can be put in the conversation's context (PRD Canvas › Frames).
  const contextable = selection.filter((id) => id in board.cards || id in board.frames);
  const inContext = contextable.length > 0 && contextable.every((id) => context?.includes(id));
  return (
    <div className={`${c.surface} ${s.bar}`} data-panel="selection" data-testid="selection-bar">
      <span className={s.barText} data-testid="selection-count">
        {selection.length} selected
      </span>
      {frame && (
        <div className={s.barGroup} role="radiogroup" onKeyDown={radioKeys} aria-label="Frame colour">
          {FrameColor.options.map((tone) => (
            <button
              key={tone}
              type="button"
              role="radio"
              aria-checked={frame.color === tone}
              aria-label={`${TONE_LABEL[tone]} frame`}
              title={TONE_LABEL[tone]}
              data-testid={`frame-color-${tone}`}
              className={`${s.swatch} ${s[`swatch_${tone}`]} ${frame.color === tone ? s.swatchOn : ''}`}
              onClick={() =>
                frame.color !== tone &&
                dispatch({ type: 'frame.updated', id: frame.id, patch: { color: tone } })
              }
            />
          ))}
          <button
            type="button"
            className={s.barChip}
            data-testid="frame-rename"
            onClick={() => onRenameFrame(frame.id)}
          >
            Rename
          </button>
        </div>
      )}
      {theLink && (
        <LinkTypes
          key={theLink.id}
          value={theLink.type}
          label={theLink.label ?? ''}
          testid="selected-link-types"
          onPick={(choice) => {
            if (choice.type === theLink.type && choice.label === theLink.label) return;
            dispatch({
              type: 'batch',
              commands: [
                { type: 'link.removed', ids: [theLink.id] },
                { type: 'link.added', link: { from: theLink.from, to: theLink.to, ...choice } },
              ],
            });
          }}
        />
      )}
      {card && (
        <div className={s.barGroup} role="radiogroup" onKeyDown={radioKeys} aria-label="Reading badge">
          {(
            [
              ['must', 'Must read'],
              ['skim', 'Skim'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={card.badge === value}
              className={card.badge === value ? s.barChipOn : s.barChip}
              data-testid={`card-badge-${value}`}
              title={card.badge === value ? `Remove ${label}` : `Mark ${label}`}
              onClick={() =>
                dispatch({
                  type: 'card.updated',
                  id: card.id,
                  patch: { badge: card.badge === value ? null : value },
                })
              }
            >
              {label}
            </button>
          ))}
          {onOpenCard && (
            <button
              type="button"
              className={s.barChip}
              data-testid="card-open-reader"
              onClick={() => onOpenCard(card.id)}
            >
              Open
            </button>
          )}
          {onPromote && card.type === 'table' && (
            <button
              type="button"
              className={s.barChip}
              data-testid="card-promote"
              title="Turn this table into a database with views"
              onClick={() => onPromote(card.id)}
            >
              Make database
            </button>
          )}
          {onChart && (card.type === 'table' || card.type === 'database') && (
            <button
              type="button"
              className={s.barChip}
              data-testid="card-make-chart"
              title="Draw a chart that follows this data"
              onClick={() => onChart(card.id)}
            >
              Chart
            </button>
          )}
          {onOpenCard && card.type !== 'database' && (
            <button
              type="button"
              className={card.view ? s.barChipOn : s.barChip}
              data-testid="card-attach-data"
              title={card.view ? 'Open the attached data' : 'Attach a dataset view to this card'}
              onClick={() => onOpenCard(card.id, 'data')}
            >
              {card.view ? 'Data' : 'Attach data'}
            </button>
          )}
        </div>
      )}
      {onContext && contextable.length > 0 && (
        <button
          type="button"
          className={inContext ? s.barChipOn : s.barChip}
          aria-pressed={inContext}
          data-testid="selection-context"
          title={inContext ? 'Remove from the conversation context' : 'Put in the conversation context'}
          onClick={() => onContext(contextable, !inContext)}
        >
          In context
        </button>
      )}
      {remove && (
        <button
          type="button"
          className={s.barDelete}
          data-testid="selection-delete"
          onClick={() => dispatch(remove)}
        >
          Delete
        </button>
      )}
    </div>
  );
}

export const SelectionBar = memo(SelectionBarInner);
