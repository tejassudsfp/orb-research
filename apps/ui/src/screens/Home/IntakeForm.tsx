/**
 * P6.11: the intake form of a v2 template (docs/phase6/vc-dd-template.md), a dialog over Home. Every field comes from
 * the template's `inputs` (typed, required flags, placeholders, validation through `validateIntake`); the materials
 * zone takes the files that become cards and databases on the new canvas; the depth tiers show their cost; the
 * signed-in sources list the sites the user connected in Settings (an unconnected one is shown, disabled).
 */
import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  DEFAULT_DEPTH,
  DEPTHS,
  validateIntake,
  type Depth,
  type InputField,
  type IntakeAnswers,
  type TemplateSpecV2,
} from '@orb/shared';
import { itemsFromTransfer, type IngestItem } from '../../cards/ingest.js';
import { orbNative } from '../../print/native.js';
import { refusal } from './seed.js';
import s from './IntakeForm.module.css';

export type IntakeSubmit = { answers: IntakeAnswers; depth: Depth; items: IngestItem[] };

type Props = {
  spec: TemplateSpecV2;
  /** What the user already typed in the ask box (prefills the first text field). */
  initial?: string;
  busy?: string | undefined;
  error?: string | undefined;
  onSubmit: (submit: IntakeSubmit) => void;
  onCancel: () => void;
};

const fileKey = (f: Blob & { name: string }) => `${f.name}:${f.size}`;

export function IntakeForm({ spec, initial, busy, error, onSubmit, onCancel }: Props) {
  const uid = useId();
  const [values, setValues] = useState<Record<string, string | string[]>>(() => {
    const first = spec.inputs.find((f) => f.kind === 'text');
    return { ...(first && initial ? { [first.id]: initial } : {}), depth: DEFAULT_DEPTH };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<IngestItem[]>([]);
  const [fileNotes, setFileNotes] = useState<string[]>([]);
  const [dropOn, setDropOn] = useState(false);
  const [connected, setConnected] = useState<string[]>([]);
  const panel = useRef<HTMLFormElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // The sites the user connected (Settings › Connected sites); they start ticked.
  useEffect(() => {
    let live = true;
    void orbNative()
      ?.sites?.get()
      .then((state) => {
        if (!live || !state) return;
        const domains = state.sites.map((x) => x.domain);
        setConnected(domains);
        setValues((cur) => {
          if (cur.sites !== undefined) return cur;
          const field = spec.inputs.find((f) => f.kind === 'sites');
          const usable = (field?.sites ?? [])
            .map((x) => x.domain)
            .filter((d) => domains.some((c) => c === d || c.endsWith(`.${d}`)));
          return usable.length ? { ...cur, sites: usable } : cur;
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [spec]);

  // Focus the first field; Escape closes; Tab stays inside the dialog.
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('input, textarea, select')?.focus();
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = Array.from(
      panel.current.querySelectorAll<HTMLElement>(
        'input:not([disabled]), textarea, select, button:not([disabled]), [tabindex="0"]',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const set = (id: string, v: string | string[]) => {
    setValues((cur) => ({ ...cur, [id]: v }));
    setErrors((cur) => {
      if (!(id in cur)) return cur;
      const { [id]: _gone, ...rest } = cur;
      return rest;
    });
  };

  const addFiles = (items: IngestItem[]) => {
    const notes: string[] = [];
    const ok: IngestItem[] = [];
    for (const item of items) {
      const why = refusal(item);
      if (why) notes.push(why);
      else if (
        item.kind === 'file' &&
        files.some((f) => f.kind === 'file' && fileKey(f.file) === fileKey(item.file))
      )
        continue;
      else ok.push(item);
    }
    setFiles((cur) => [...cur, ...ok].slice(0, 50));
    setFileNotes(notes);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const checked = validateIntake(spec.inputs, values);
    setErrors(checked.errors);
    if (!checked.ok) {
      const firstBad = spec.inputs.find((f) => checked.errors[f.id]);
      if (firstBad) panel.current?.querySelector<HTMLElement>(`[data-field="${firstBad.id}"]`)?.focus();
      return;
    }
    onSubmit({ answers: checked.answers, depth: checked.depth, items: files });
  };

  const groups = useMemo(() => {
    const out: InputField[][] = [];
    for (const f of spec.inputs) {
      const last = out[out.length - 1];
      if (f.group && last && last[0]!.group === f.group) last.push(f);
      else out.push([f]);
    }
    return out;
  }, [spec]);

  const fid = (f: InputField) => `${uid}-${f.id}`;
  const describe = (f: InputField) =>
    [f.help ? `${fid(f)}-help` : '', errors[f.id] ? `${fid(f)}-err` : ''].filter(Boolean).join(' ') ||
    undefined;

  function control(f: InputField) {
    const v = values[f.id];
    const text = Array.isArray(v) ? v.join(', ') : (v ?? '');
    const common = {
      id: fid(f),
      'data-field': f.id,
      'data-testid': `intake-${f.id}`,
      'aria-invalid': errors[f.id] ? true : undefined,
      'aria-describedby': describe(f),
      'aria-required': f.required || undefined,
    } as const;
    const cls = `${errors[f.id] ? s.invalid : ''}`;
    switch (f.kind) {
      case 'longtext':
      case 'people':
        return (
          <textarea
            {...common}
            className={`${s.textarea} ${cls}`}
            placeholder={f.placeholder}
            maxLength={f.maxLength}
            value={text}
            onChange={(e) => set(f.id, e.target.value)}
          />
        );
      case 'select':
        return (
          <select
            {...common}
            className={`${s.select} ${cls}`}
            value={text}
            onChange={(e) => set(f.id, e.target.value)}
          >
            <option value="">{f.required ? 'Choose…' : 'Not sure'}</option>
            {f.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
      case 'list':
        return (
          <input
            {...common}
            className={`${s.input} ${cls}`}
            type="text"
            placeholder={f.placeholder}
            maxLength={f.maxLength}
            value={text}
            onChange={(e) => set(f.id, e.target.value)}
          />
        );
      case 'depth':
        return (
          <div className={s.tiers} role="radiogroup" aria-label={f.label}>
            {DEPTHS.map((d) => {
              const t = spec.tiers[d];
              const on = (text || DEFAULT_DEPTH) === d;
              return (
                <label
                  key={d}
                  className={`${s.tier} ${on ? s.tierOn : ''}`}
                  data-testid={`intake-depth-${d}`}
                >
                  <input
                    className={s.radio}
                    type="radio"
                    name={`${uid}-depth`}
                    value={d}
                    checked={on}
                    onChange={() => set(f.id, d)}
                  />
                  <span className={s.tierName}>{t.label}</span>
                  <span className={s.tierMeta}>
                    {t.time} · {t.cost}
                  </span>
                  <span className={s.tierText}>{t.summary}</span>
                </label>
              );
            })}
          </div>
        );
      case 'sites': {
        const ticked = Array.isArray(v) ? v : [];
        return (
          <div className={s.sites} role="group" aria-label={f.label}>
            {(f.sites ?? []).map((site) => {
              const isConnected = connected.some((c) => c === site.domain || c.endsWith(`.${site.domain}`));
              return (
                <label
                  key={site.domain}
                  className={`${s.site} ${isConnected ? '' : s.siteOff}`}
                  title={isConnected ? undefined : 'Not connected. Connect it in Settings › Connected sites.'}
                >
                  <input
                    type="checkbox"
                    data-testid={`intake-site-${site.domain}`}
                    disabled={!isConnected}
                    checked={isConnected && ticked.includes(site.domain)}
                    onChange={(e) =>
                      set(
                        f.id,
                        e.target.checked ? [...ticked, site.domain] : ticked.filter((d) => d !== site.domain),
                      )
                    }
                  />
                  {site.label}
                  {isConnected ? '' : ' (not connected)'}
                </label>
              );
            })}
          </div>
        );
      }
      case 'materials':
        return (
          <>
            <div
              className={`${s.drop} ${dropOn ? s.dropOn : ''}`}
              role="button"
              tabIndex={0}
              data-testid="intake-materials"
              aria-describedby={describe(f)}
              onClick={() => picker.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  picker.current?.click();
                }
              }}
              onDragOver={(e: DragEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setDropOn(true);
              }}
              onDragLeave={() => setDropOn(false)}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setDropOn(false);
                addFiles(itemsFromTransfer(e.dataTransfer).filter((i) => i.kind === 'file'));
              }}
            >
              <strong>Drop the deck, data-room PDFs, financial model and cap table</strong>
              <span>or click to choose files (PDF, CSV, XLSX, images, text)</span>
            </div>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              data-testid="intake-file-input"
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []).map((file) => ({ kind: 'file' as const, file })));
                e.target.value = '';
              }}
            />
            {files.length > 0 && (
              <ul className={s.files} data-testid="intake-files">
                {files.map((item, i) => (
                  <li key={i} className={s.file}>
                    <span>{item.kind === 'file' ? item.file.name : item.kind}</span>
                    <button
                      type="button"
                      className={s.btn}
                      style={{ height: 30, padding: '0 12px' }}
                      aria-label={`Remove ${item.kind === 'file' ? item.file.name : 'item'}`}
                      onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {fileNotes.length > 0 && (
              <p className={s.error} role="alert">
                {fileNotes.join(' · ')}
              </p>
            )}
          </>
        );
      default:
        return (
          <>
            <input
              {...common}
              className={`${s.input} ${cls}`}
              type="text"
              inputMode={f.kind === 'url' ? 'url' : undefined}
              autoComplete="off"
              placeholder={f.placeholder}
              maxLength={f.maxLength}
              list={f.suggestions ? `${fid(f)}-list` : undefined}
              value={text}
              onChange={(e) => set(f.id, e.target.value)}
            />
            {f.suggestions && (
              <datalist id={`${fid(f)}-list`}>
                {f.suggestions.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            )}
          </>
        );
    }
  }

  return (
    <div className={s.scrim} data-testid="intake-scrim">
      <form
        ref={panel}
        className={s.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        data-testid="intake-form"
        data-template={spec.id}
        noValidate
        onSubmit={submit}
        onKeyDown={onKeyDown}
      >
        <div className={s.head}>
          <h2 className={s.title} id={`${uid}-title`}>
            {spec.label}
          </h2>
          <p className={s.lede}>
            Tell orb what you are looking at. Anything you skip, Scout finds. Fields marked{' '}
            <span className={s.req}>*</span> are required.
          </p>
        </div>
        <div className={s.body}>
          {groups.map((group) => (
            <div key={group[0]!.id} className={group.length > 1 ? s.row : undefined}>
              {group.map((f) => (
                <div key={f.id} className={s.field}>
                  {f.kind === 'depth' || f.kind === 'sites' || f.kind === 'materials' ? (
                    <span className={s.label}>{f.label}</span>
                  ) : (
                    <label className={s.label} htmlFor={fid(f)}>
                      {f.label}
                      {f.required && (
                        <span className={s.req} aria-hidden="true">
                          {' '}
                          *
                        </span>
                      )}
                    </label>
                  )}
                  {control(f)}
                  {f.help && (
                    <p className={s.help} id={`${fid(f)}-help`}>
                      {f.help}
                    </p>
                  )}
                  {errors[f.id] && (
                    <p className={s.error} id={`${fid(f)}-err`} role="alert">
                      {errors[f.id]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className={s.foot}>
          {busy && (
            <span className={s.status} role="status" data-testid="intake-busy">
              {busy}
            </span>
          )}
          {error && (
            <span className={s.error} role="alert" data-testid="intake-error">
              {error}
            </span>
          )}
          <button type="button" className={s.btn} data-testid="intake-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className={`${s.btn} ${s.primary}`}
            data-testid="intake-start"
            disabled={!!busy}
          >
            Start research
          </button>
        </div>
      </form>
    </div>
  );
}
