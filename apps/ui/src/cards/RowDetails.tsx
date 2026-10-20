/** Full values for a table record, alongside the table. No truncation or implicit network requests. */
import { useRef } from 'react';
import { useFocusTrap } from '../components/useFocusTrap.js';
import s from './RowDetails.module.css';

function Value({ text }: { text: string }) {
  let href: string | undefined;
  try {
    const url = new URL(text);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) href = url.href;
  } catch {
    // Most cell values are ordinary text.
  }
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  ) : (
    <>{text || 'Not provided'}</>
  );
}

export function RowDetails({
  fields,
  index,
  total,
  onPrevious,
  onNext,
  onClose,
}: {
  fields: { name: string; value: string }[];
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  useFocusTrap(root, { trap: false });
  return (
    <aside ref={root} tabIndex={-1} className={s.details} aria-label="Row details" data-testid="row-details">
      <header className={s.head}>
        <div>
          <h3>Row details</h3>
          <p aria-live="polite">
            Row {index + 1} of {total}
          </p>
        </div>
        <button
          type="button"
          className={s.button}
          aria-label="Close row details"
          data-row-details-close
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className={s.navigation}>
        <button type="button" className={s.button} disabled={index === 0} onClick={onPrevious}>
          Previous row
        </button>
        <button type="button" className={s.button} disabled={index >= total - 1} onClick={onNext}>
          Next row
        </button>
      </div>
      <dl className={s.fields}>
        {fields.map((field, i) => (
          <div key={i}>
            <dt>{field.name}</dt>
            <dd>
              <Value text={field.value} />
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
