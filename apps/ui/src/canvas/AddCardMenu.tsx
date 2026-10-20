/**
 * The toolbar's Add card menu (PRD Screens › Canvas: "Floating left toolbar: Select, Note, Frame, Connect and Add
 * card"; P2.gate). It lists the card types a user can make by hand:
 *
 * - Note, Question, Risk or claim, Quote: an empty card of that type in the middle of the free screen area, selected
 *   and opened in the reader to write its text (the user's own cards are editable there);
 * - Link…: a URL field; Enter adds a Source card (the same path as pasting a link);
 * - Database…: pick a dataset of the canvas, import a CSV, JSON or XLSX file, or paste a table (P6.3);
 * - Image, PDF or CSV…: the system file picker; the files go through the drop path (orb-host copies them into
 *   `assets/`, the renderer never writes to disk).
 *
 * Arrow keys / Home / End move between items, Escape (or a press outside) closes the menu and returns to Select.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { isHttpUrl } from '@orb/shared';
import type { ManualCardKind } from './geometry.js';
import type { DatasetChoice } from '../cards/context.js';
import { DataPicker } from '../cards/dataset/DataAttach.js';
import c from '../cards/cards.module.css';
import s from '../screens/Canvas/Canvas.module.css';

const TEXT_ITEMS: { type: ManualCardKind; label: string; hint: string }[] = [
  { type: 'note', label: 'Note', hint: 'Your own text' },
  { type: 'question', label: 'Question', hint: 'An open question' },
  { type: 'risk', label: 'Risk or claim', hint: 'Something to test' },
  { type: 'quote', label: 'Quote', hint: 'An excerpt and its source' },
  { type: 'entity', label: 'Person or org', hint: 'Who they are' },
  { type: 'product', label: 'Product', hint: 'A product or competitor' },
  { type: 'video', label: 'Video or post', hint: 'A link and a thumbnail' },
  { type: 'code', label: 'Code', hint: 'A highlighted snippet' },
  { type: 'math', label: 'Math', hint: 'A formula in LaTeX' },
  { type: 'checklist', label: 'Checklist', hint: 'Things to tick off' },
];

/** The file types the drop path accepts (src/cards/ingest.ts). */
const ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.gif,.webp,.csv,.xlsx,.json,.md,.markdown,.txt,application/pdf,image/png,image/jpeg,image/gif,image/webp,text/csv,text/markdown,text/plain';

export function AddCardMenu({
  onText,
  onLink,
  onFiles,
  onDatabase,
  onClose,
}: {
  onText: (type: ManualCardKind) => void;
  onLink: (url: string) => void;
  onFiles: (files: File[]) => void;
  onDatabase: (choice: DatasetChoice) => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [linking, setLinking] = useState(false);
  const [dataPick, setDataPick] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!linking && !dataPick) menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [linking, dataPick]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (linking) setLinking(false);
      else if (dataPick) setDataPick(false);
      else onClose();
      return;
    }
    if (linking || dataPick) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'ArrowDown'
        ? (at + 1) % items.length
        : e.key === 'ArrowUp'
          ? (at - 1 + items.length) % items.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? items.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    items[next]?.focus();
  };

  const submitLink = () => {
    const value = url.trim();
    if (!isHttpUrl(value)) {
      setError('Enter an http or https link');
      return;
    }
    onLink(value);
  };

  return (
    <div
      ref={menu}
      className={s.addMenu}
      role="menu"
      aria-label="Add card"
      data-panel="add-card"
      data-testid="add-card-menu"
      onKeyDown={onKeyDown}
    >
      {TEXT_ITEMS.map(({ type, label, hint }) => (
        <button
          key={type}
          type="button"
          role="menuitem"
          className={s.addItem}
          data-testid={`add-card-${type}`}
          onClick={() => onText(type)}
        >
          <span>{label}</span>
          <span className={s.addHint}>{hint}</span>
        </button>
      ))}
      {linking ? (
        <form
          className={s.addLink}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submitLink();
          }}
        >
          <input
            className={c.input}
            type="url"
            autoFocus
            placeholder="https://"
            aria-label="Link to add"
            data-testid="add-card-url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError('');
            }}
          />
          {error && (
            <span className={s.addError} role="alert">
              {error}
            </span>
          )}
        </form>
      ) : (
        <button
          type="button"
          role="menuitem"
          className={s.addItem}
          data-testid="add-card-link"
          onClick={() => setLinking(true)}
        >
          <span>Link…</span>
          <span className={s.addHint}>A source card</span>
        </button>
      )}
      {dataPick ? (
        <div className={s.addLink}>
          <DataPicker onPick={onDatabase} />
        </div>
      ) : (
        <button
          type="button"
          role="menuitem"
          className={s.addItem}
          data-testid="add-card-database"
          onClick={() => setDataPick(true)}
        >
          <span>Database…</span>
          <span className={s.addHint}>CSV, JSON, XLSX or pasted</span>
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className={s.addItem}
        data-testid="add-card-file"
        onClick={() => file.current?.click()}
      >
        <span>Image, PDF, CSV or XLSX…</span>
        <span className={s.addHint}>From your Mac</span>
      </button>
      <input
        ref={file}
        type="file"
        multiple
        hidden
        accept={ACCEPT}
        data-testid="add-card-file-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
    </div>
  );
}
