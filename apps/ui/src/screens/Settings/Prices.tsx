/**
 * P4.3 Prices (PRD Models › Cost visibility): the local price table the cost meter multiplies tokens by, in US dollars
 * per 1M tokens for input, output, cache read and cache write. Rows are seeded from the pi-ai catalog's list prices
 * ("Catalog"); an edited row is the user's ("Edited") and is never re-seeded; Reset goes back to the catalog price.
 * A route the catalog does not know (a custom endpoint) gets a price with "Add a price".
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { PriceRates, PriceRow } from '@orb/shared';
import { isWireError, type Wire } from '../../wire/index.js';
import p from '../../components/Page.module.css';
import s from './Settings.module.css';

const errorText = (e: unknown) => (isWireError(e) ? e.message : ((e as Error)?.message ?? String(e)));

const FIELDS: Array<{ key: keyof PriceRates; label: string }> = [
  { key: 'input', label: 'Input' },
  { key: 'output', label: 'Output' },
  { key: 'cacheRead', label: 'Cache read' },
  { key: 'cacheWrite', label: 'Cache write' },
];

const money = (n: number) => `$${Number(n.toFixed(4))}`;

type Draft = Record<keyof PriceRates, string>;
const draftOf = (r?: PriceRates): Draft => ({
  input: r ? String(r.input) : '',
  output: r ? String(r.output) : '',
  cacheRead: r ? String(r.cacheRead) : '0',
  cacheWrite: r ? String(r.cacheWrite) : '0',
});
function ratesOf(d: Draft): PriceRates | string {
  const out = {} as PriceRates;
  for (const f of FIELDS) {
    const v = Number(d[f.key].trim());
    if (d[f.key].trim() === '' || !Number.isFinite(v) || v < 0)
      return `${f.label} must be a number, 0 or more`;
    out[f.key] = v;
  }
  return out;
}

function RatesForm({
  initial,
  route,
  onSave,
  onCancel,
}: {
  initial?: PriceRates;
  /** Given: editing this route; absent: the form asks for provider and model too. */
  route?: { provider: string; model: string };
  onSave: (route: { provider: string; model: string }, rates: PriceRates) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(draftOf(initial));
  const [provider, setProvider] = useState(route?.provider ?? '');
  const [model, setModel] = useState(route?.model ?? '');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const rates = ratesOf(draft);
    if (typeof rates === 'string') return setError(rates);
    if (!provider.trim() || !model.trim()) return setError('Provider and model are needed');
    setBusy(true);
    setError(undefined);
    try {
      await onSave({ provider: provider.trim(), model: model.trim() }, rates);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className={s.priceForm} onSubmit={(e) => void submit(e)} data-testid="price-form">
      {!route && (
        <>
          <label className={s.priceField}>
            <span>Provider</span>
            <input
              className={s.input}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="ollama"
              data-testid="price-provider"
            />
          </label>
          <label className={s.priceField}>
            <span>Model</span>
            <input
              className={s.input}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="llama3.3"
              data-testid="price-model"
            />
          </label>
        </>
      )}
      {FIELDS.map((f) => (
        <label key={f.key} className={s.priceField}>
          <span>{f.label}</span>
          <input
            className={s.input}
            inputMode="decimal"
            value={draft[f.key]}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            data-testid={`price-${f.key}`}
            aria-label={`${f.label}, US dollars per 1M tokens`}
          />
        </label>
      ))}
      <div className={s.priceActions}>
        <button type="submit" className={s.buttonPrimary} disabled={busy} data-testid="price-save">
          Save
        </button>
        <button type="button" className={s.ghost} onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && (
        <p className={s.failure} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function PricesSettings({ wire }: { wire: Wire }) {
  const [rows, setRows] = useState<PriceRow[]>();
  const [editing, setEditing] = useState<string | 'new'>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      setRows((await wire.orb.prices.describe()).prices);
    } catch (e) {
      setError(errorText(e));
    }
  }, [wire]);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async (route: { provider: string; model: string }, rates: PriceRates | null) => {
    const res = await wire.orb.prices.set({ ...route, rates });
    setRows(res.prices);
    setEditing(undefined);
  };

  return (
    <section className={p.section} aria-labelledby="settings-prices" data-testid="prices">
      <h2 className={p.sectionTitle} id="settings-prices">
        Prices
      </h2>
      <p className={p.note}>
        US dollars per 1M tokens. The cost meter on each canvas multiplies its tokens by these prices; it is
        an estimate, not your bill. Prices start from the provider catalog's list prices.
      </p>
      {error && (
        <p className={s.failure} role="alert">
          {error}
        </p>
      )}
      <div className={s.priceTable} role="table" aria-label="Prices" data-loaded={rows ? 'yes' : 'no'}>
        <div className={s.priceHead} role="row">
          <span role="columnheader">Model</span>
          {FIELDS.map((f) => (
            <span key={f.key} role="columnheader">
              {f.label}
            </span>
          ))}
          <span role="columnheader" className="orb-sr-only">
            Actions
          </span>
        </div>
        {(rows ?? []).map((row) =>
          editing === row.key ? (
            <RatesForm
              key={row.key}
              initial={row.rates}
              route={row}
              onSave={(route, rates) => save(route, rates)}
              onCancel={() => setEditing(undefined)}
            />
          ) : (
            <div
              key={row.key}
              className={s.priceRow}
              role="row"
              data-testid="price-row"
              data-key={row.key}
              data-source={row.source}
            >
              <span role="cell" className={s.priceModel}>
                <span className={s.mono}>{row.key}</span>
                <span className={s.kindTag}>{row.source === 'user' ? 'Edited' : 'Catalog'}</span>
              </span>
              {FIELDS.map((f) => (
                <span role="cell" key={f.key} className={s.priceCell} data-field={f.key}>
                  {money(row.rates[f.key])}
                </span>
              ))}
              <span role="cell" className={s.priceActions}>
                <button
                  type="button"
                  className={s.ghost}
                  onClick={() => setEditing(row.key)}
                  data-testid="price-edit"
                >
                  Edit
                </button>
                {row.source === 'user' && (
                  <button
                    type="button"
                    className={s.ghost}
                    onClick={() => void save(row, null).catch((e) => setError(errorText(e)))}
                    data-testid="price-reset"
                  >
                    {row.catalog ? 'Reset' : 'Remove'}
                  </button>
                )}
              </span>
            </div>
          ),
        )}
      </div>
      {editing === 'new' ? (
        <RatesForm onSave={(route, rates) => save(route, rates)} onCancel={() => setEditing(undefined)} />
      ) : (
        <button type="button" className={s.button} onClick={() => setEditing('new')} data-testid="price-add">
          Add a price
        </button>
      )}
    </section>
  );
}
