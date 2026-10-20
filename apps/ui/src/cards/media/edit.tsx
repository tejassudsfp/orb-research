/**
 * Editing fields of a user's own entity, product, video, code, math and checklist cards in the reader (P6.6). An
 * agent's card is read-only there (the user changes it by chatting, or by making a card of their own). Each field
 * saves on blur as one undoable change (`setData`); an empty optional field is removed from the data.
 */
import { useEffect, useState } from 'react';
import type { Card } from '@orb/shared';
import { useCardActions } from '../context.js';
import c from '../cards.module.css';

export type FieldDef = {
  key: string;
  label: string;
  kind?: 'text' | 'area' | 'code' | 'url';
  max?: number;
  placeholder?: string;
};

const dataOf = (card: Card): Record<string, unknown> => ((card.data ?? {}) as Record<string, unknown>);

export const isUserCard = (card: Card): boolean => card.provenance.kind === 'user';

function Field({ card, def }: { card: Card; def: FieldDef }) {
  const { setData } = useCardActions();
  const value = typeof dataOf(card)[def.key] === 'string' ? (dataOf(card)[def.key] as string) : '';
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft === value) return;
    const next = { ...dataOf(card) };
    if (draft.trim() === '' && def.key !== 'title') delete next[def.key];
    else next[def.key] = draft;
    setData(card.id, next);
  };
  const common = {
    value: draft,
    maxLength: def.max ?? 500,
    placeholder: def.placeholder,
    'data-testid': `reader-field-${def.key}`,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
  };
  return (
    <label className={c.field}>
      {def.label}
      {def.kind === 'area' || def.kind === 'code' ? (
        <textarea
          className={c.textarea}
          style={def.kind === 'code' ? { fontFamily: 'var(--orb-font-mono)', minHeight: 160 } : undefined}
          spellCheck={def.kind !== 'code'}
          {...common}
        />
      ) : (
        <input className={c.input} type={def.kind === 'url' ? 'url' : 'text'} {...common} />
      )}
    </label>
  );
}

/** The editable fields of a user card (nothing for an agent's card). */
export function EditFields({ card, fields }: { card: Card; fields: FieldDef[] }) {
  if (!isUserCard(card)) return null;
  return (
    <>
      {fields.map((def) => (
        <Field key={def.key} card={card} def={def} />
      ))}
    </>
  );
}

/** A "choose an image" control that stores the file as an asset and saves it under `key`. */
export function ImagePick({ card, field, label }: { card: Card; field: 'thumb' | 'photo'; label: string }) {
  const { uploadImage, setData } = useCardActions();
  const [error, setError] = useState('');
  if (!isUserCard(card)) return null;
  return (
    <div className={c.field}>
      <span>{label}</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        data-testid={`reader-pick-${field}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setError('');
          uploadImage(file).then(
            (asset) => setData(card.id, { ...dataOf(card), [field]: asset }),
            (err: Error) => setError(err.message),
          );
        }}
      />
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
