/**
 * P4.2 Models settings (PRD Models and API keys): provider cards (OpenAI first, then DeepSeek, Anthropic, OpenRouter,
 * custom providers and any other configured route), each with a key field, a Test button and a status (Not set, Key
 * saved, Working, Failed with a plain message); the custom provider form (ID, base URL, protocol, model ids, "no key
 * needed"), with model discovery; the per-agent model picker (stored in orb.json, applied at the agent's next start);
 * and Scout's search provider keys. Keys go to the sidecar once (`orb/keys.set`) and only come back redacted.
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  AGENT_LABELS,
  AGENT_NAMES_ORDERED,
  AGENT_TIERS,
  PROVIDER_API_LABELS,
  PROVIDER_APIS,
  type AgentName,
  type CustomProvider,
  type KeyDescriptor,
  type ModelsDescribeResult,
  type ProviderApi,
  type ProviderInfo,
} from '@orb/shared';
import { isWireError, type Wire } from '../../wire/index.js';
import p from '../../components/Page.module.css';
import s from './Settings.module.css';
import { ChatGPTPlan } from './ChatGPTPlan.js';

const errorText = (e: unknown) => (isWireError(e) ? e.message : ((e as Error)?.message ?? String(e)));

export const STATUS_LABELS = {
  'not-set': 'Not set',
  untested: 'Key saved',
  working: 'Working',
  failed: 'Failed',
} as const;

/** The status badge of a provider card. */
export function StatusBadge({ info, testing }: { info: ProviderInfo; testing?: boolean }) {
  const state = testing ? 'untested' : info.status.state;
  const text = testing ? 'Testing…' : info.noKey && state === 'untested' ? 'Ready' : STATUS_LABELS[state];
  return (
    <span className={s.badge} data-state={state} data-testid="provider-status" role="status">
      {text}
    </span>
  );
}

/** Key field + Save, Test, Remove; used by the provider cards and the first-run sheet. */
export function ProviderKeyControls({
  wire,
  info,
  onChanged,
  autoFocus,
  children,
}: {
  wire: Wire;
  info: ProviderInfo;
  onChanged: () => Promise<void> | void;
  autoFocus?: boolean;
  /** Extra actions on the same row (a custom provider's Edit and Remove). */
  children?: ReactNode;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'remove'>();
  const [error, setError] = useState<string>();
  const writable = info.key?.writable !== false;

  const test = async () => {
    setBusy('test');
    setError(undefined);
    try {
      await wire.orb.keys.test({ provider: info.id });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(undefined);
      await onChanged();
    }
  };

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    const key = draft.trim();
    if (!key) return;
    setBusy('save');
    setError(undefined);
    try {
      await wire.orb.keys.set({ provider: info.id, key });
      setDraft('');
      await onChanged();
      // A saved key is tested at once (one token), so the card shows Working or why not.
      setBusy('test');
      await wire.orb.keys.test({ provider: info.id });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(undefined);
      await onChanged();
    }
  };

  const remove = async () => {
    setBusy('remove');
    setError(undefined);
    try {
      await wire.orb.keys.unset({ provider: info.id });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(undefined);
      await onChanged();
    }
  };

  return (
    <>
      {info.status.state === 'failed' && info.status.message && (
        <p className={s.failure} data-testid="provider-failure">
          {info.status.message}
        </p>
      )}
      {error && (
        <p className={s.failure} role="alert">
          {error}
        </p>
      )}
      <form className={s.keyRow} onSubmit={(e) => void save(e)}>
        {!info.noKey && writable && (
          <>
            <input
              className={s.input}
              type="password"
              autoComplete="off"
              spellCheck={false}
              autoFocus={autoFocus}
              aria-label={`${info.label} API key`}
              placeholder={info.key?.configured ? 'Replace the key' : 'Paste your API key'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              data-testid="provider-key-input"
            />
            <button
              type="submit"
              className={s.buttonPrimary}
              disabled={!draft.trim() || !!busy}
              data-testid="provider-key-save"
            >
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
        <button
          type="button"
          className={s.button}
          disabled={!!busy || !info.usable}
          onClick={() => void test()}
          data-testid="provider-test"
        >
          {busy === 'test' ? 'Testing…' : 'Test'}
        </button>
        {!info.noKey && writable && info.key?.configured && (
          <button
            type="button"
            className={s.ghost}
            disabled={!!busy}
            onClick={() => void remove()}
            data-testid="provider-key-remove"
          >
            Remove key
          </button>
        )}
        {children}
      </form>
    </>
  );
}

function ProviderCard({
  wire,
  info,
  onChanged,
  onEdit,
}: {
  wire: Wire;
  info: ProviderInfo;
  onChanged: () => Promise<void>;
  onEdit?: (custom: CustomProvider) => void;
}) {
  const [error, setError] = useState<string>();
  const [listingBusy, setListingBusy] = useState(false);
  const refreshModels = useCallback(
    async (signal?: AbortSignal) => {
      setListingBusy(true);
      setError(undefined);
      try {
        await wire.orb.models.discover({ provider: info.id }, signal);
        if (!signal?.aborted) await onChanged();
      } catch (err) {
        if (!signal?.aborted) setError(errorText(err));
      } finally {
        if (!signal?.aborted) setListingBusy(false);
      }
    },
    [wire, info.id, onChanged],
  );
  // Describe is offline and is also used at startup. Only the Models screen refreshes configured providers.
  useEffect(() => {
    if (!info.usable || !info.routed) {
      setListingBusy(false);
      return;
    }
    const ac = new AbortController();
    void refreshModels(ac.signal);
    return () => ac.abort();
  }, [refreshModels, info.usable, info.routed, info.key?.redacted, info.custom?.baseURL, info.custom?.api]);
  const keyLine = info.noKey
    ? 'No key needed'
    : info.key?.configured
      ? `${info.key.redacted ?? 'Key saved'}${info.key.source === 'env' ? ' (from the launch environment)' : ''}`
      : 'No key';
  return (
    <article
      className={s.card}
      data-testid="provider-card"
      data-provider={info.id}
      data-state={info.status.state}
    >
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>
          {info.label}
          {info.kind !== 'catalog' && (
            <span className={s.kindTag}>{info.kind === 'custom' ? 'Custom' : 'Route'}</span>
          )}
        </h3>
        <StatusBadge info={info} />
      </div>
      <div className={s.meta}>
        <span className={s.mono} data-testid="provider-key-redacted">
          {keyLine}
        </span>
        {info.testModel && <span>Test model: {info.testModel}</span>}
        {info.keyUrl && !info.key?.configured && (
          <a className={s.link} href={info.keyUrl} target="_blank" rel="noreferrer">
            Get a key
          </a>
        )}
      </div>
      {info.custom && (
        <div className={s.meta}>
          <span className={s.mono}>{info.custom.baseURL}</span>
          <span>{PROVIDER_API_LABELS[info.custom.api]}</span>
          <span>Models: {info.custom.models.join(', ')}</span>
        </div>
      )}
      <ProviderKeyControls wire={wire} info={info} onChanged={onChanged}>
        {info.custom && (
          <>
            <button
              type="button"
              className={s.button}
              onClick={() => onEdit?.(info.custom!)}
              data-testid="custom-edit"
            >
              Edit
            </button>
            <button
              type="button"
              className={s.ghost}
              data-testid="custom-remove"
              onClick={() => {
                setError(undefined);
                wire.orb.models.removeCustom(info.id).then(onChanged, (e: unknown) => setError(errorText(e)));
              }}
            >
              Remove provider
            </button>
          </>
        )}
      </ProviderKeyControls>
      <div className={s.keyRow}>
        <button
          type="button"
          className={s.button}
          disabled={listingBusy || !info.usable || !info.routed}
          onClick={() => void refreshModels()}
          data-testid="provider-models-refresh"
        >
          {listingBusy ? 'Refreshing…' : 'Refresh models'}
        </button>
        <span className={p.note} data-testid="provider-models-status" role="status">
          {info.models.length} {info.models.length === 1 ? 'model' : 'models'} ·{' '}
          {info.modelListing?.source === 'provider'
            ? `updated ${new Date(info.modelListing.fetchedAt!).toLocaleString()}`
            : info.kind === 'catalog'
              ? info.usable
                ? 'bundled list; refresh for latest models'
                : 'bundled list; save a key to refresh'
              : 'saved model IDs'}
        </span>
      </div>
      {error && (
        <p className={s.failure} role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

type Draft = {
  id: string;
  label: string;
  baseURL: string;
  api: ProviderApi;
  models: string;
  noKey: boolean;
  key: string;
};

const emptyDraft: Draft = {
  id: '',
  label: '',
  baseURL: 'http://localhost:11434/v1',
  api: 'openai-completions',
  models: '',
  noKey: true,
  key: '',
};

function CustomProviderForm({
  wire,
  editing,
  onDone,
}: {
  wire: Wire;
  editing?: CustomProvider;
  onDone: (saved: boolean) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    editing
      ? {
          id: editing.id,
          label: editing.label ?? '',
          baseURL: editing.baseURL,
          api: editing.api,
          models: editing.models.join('\n'),
          noKey: editing.noKey,
          key: '',
        }
      : emptyDraft,
  );
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [found, setFound] = useState<string>();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const modelIds = draft.models
    .split(/[\n,]+/)
    .map((m) => m.trim())
    .filter(Boolean);

  const discover = async () => {
    setBusy('discover');
    setError(undefined);
    setFound(undefined);
    try {
      // The stored route (with its key) only while the endpoint is unchanged; an edited base URL or protocol is a
      // draft until saved, so it is listed from the form's values.
      const unchanged =
        editing &&
        draft.baseURL.trim() === editing.baseURL &&
        draft.api === editing.api &&
        draft.noKey === editing.noKey &&
        !draft.key.trim();
      const { models } = unchanged
        ? await wire.orb.models.discover({ provider: editing.id })
        : await wire.orb.models.discover({
            baseURL: draft.baseURL.trim(),
            api: draft.api,
            ...(!draft.noKey && draft.key.trim() ? { apiKey: draft.key.trim() } : {}),
          });
      const ids = models.map((m) => m.id);
      if (ids.length === 0) setFound('The endpoint lists no models; enter them by hand.');
      else {
        set('models', [...new Set([...modelIds, ...ids])].join('\n'));
        setFound(`Found ${ids.length} model${ids.length === 1 ? '' : 's'}.`);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(undefined);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('save');
    setError(undefined);
    try {
      const id = draft.id.trim();
      await wire.orb.models.setCustom({
        id,
        ...(draft.label.trim() ? { label: draft.label.trim() } : {}),
        baseURL: draft.baseURL.trim(),
        api: draft.api,
        models: modelIds,
        noKey: draft.noKey,
      });
      if (!draft.noKey && draft.key.trim()) await wire.orb.keys.set({ provider: id, key: draft.key.trim() });
      await wire.orb.keys.test({ provider: id }).catch(() => undefined);
      await onDone(true);
    } catch (err) {
      setError(errorText(err));
      setBusy(undefined);
    }
  };

  return (
    <form className={s.card} onSubmit={(e) => void save(e)} data-testid="custom-form">
      <h3 className={s.cardTitle}>
        {editing ? `Edit ${editing.label ?? editing.id}` : 'Add a custom provider'}
      </h3>
      <p className={p.note}>
        Any endpoint speaking OpenAI chat completions, OpenAI responses or Anthropic messages, including a
        local Ollama server.
      </p>
      <div className={s.form}>
        <label htmlFor="custom-id">Provider ID</label>
        <input
          id="custom-id"
          className={s.input}
          value={draft.id}
          disabled={!!editing}
          placeholder="my-ollama"
          pattern="[a-z][a-z0-9-]*"
          title="Lowercase letters, digits and hyphens. It cannot be changed later."
          onChange={(e) => set('id', e.target.value.toLowerCase())}
          data-testid="custom-id"
          required
        />
        <label htmlFor="custom-label">Name</label>
        <input
          id="custom-label"
          className={s.input}
          value={draft.label}
          placeholder="Optional"
          onChange={(e) => set('label', e.target.value)}
          data-testid="custom-label"
        />
        <label htmlFor="custom-baseurl">Base URL</label>
        <input
          id="custom-baseurl"
          className={s.input}
          value={draft.baseURL}
          onChange={(e) => set('baseURL', e.target.value)}
          data-testid="custom-baseurl"
          required
        />
        <label htmlFor="custom-api">Protocol</label>
        <select
          id="custom-api"
          className={s.select}
          value={draft.api}
          onChange={(e) => set('api', e.target.value as ProviderApi)}
          data-testid="custom-api"
        >
          {PROVIDER_APIS.map((api) => (
            <option key={api} value={api}>
              {PROVIDER_API_LABELS[api]}
            </option>
          ))}
        </select>
        <label htmlFor="custom-models">Model IDs</label>
        <textarea
          id="custom-models"
          className={s.textarea}
          value={draft.models}
          placeholder="One per line"
          onChange={(e) => set('models', e.target.value)}
          data-testid="custom-models"
        />
        <span />
        <div className={s.keyRow}>
          <button
            type="button"
            className={s.button}
            disabled={!!busy || !draft.baseURL.trim()}
            onClick={() => void discover()}
            data-testid="custom-discover"
          >
            {busy === 'discover' ? 'Looking…' : 'Find models'}
          </button>
          {found && (
            <span className={p.note} role="status" data-testid="custom-found">
              {found}
            </span>
          )}
        </div>
        <span />
        <label className={s.check}>
          <input
            type="checkbox"
            checked={draft.noKey}
            onChange={(e) => set('noKey', e.target.checked)}
            data-testid="custom-nokey"
          />
          No key needed (local server)
        </label>
        {!draft.noKey && (
          <>
            <label htmlFor="custom-key">{editing ? 'New API key (optional)' : 'API key'}</label>
            <input
              id="custom-key"
              className={s.input}
              type="password"
              autoComplete="off"
              value={draft.key}
              onChange={(e) => set('key', e.target.value)}
              data-testid="custom-key"
            />
          </>
        )}
      </div>
      {error && (
        <p className={s.failure} role="alert" data-testid="custom-error">
          {error}
        </p>
      )}
      <div className={s.keyRow}>
        <button
          type="submit"
          className={s.buttonPrimary}
          disabled={!!busy || !draft.id || modelIds.length === 0}
          data-testid="custom-save"
        >
          {busy === 'save' ? 'Saving…' : 'Save provider'}
        </button>
        <button type="button" className={s.ghost} onClick={() => void onDone(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const routeValue = (r?: { provider: string; model: string }) => (r ? `${r.provider}\u0001${r.model}` : '');

function AgentModelPicker({
  wire,
  d,
  onChanged,
}: {
  wire: Wire;
  d: ModelsDescribeResult;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState('');
  const usable = d.providers.filter((x) => x.usable && x.routed);
  const choose = async (role: AgentName, value: string) => {
    setError(undefined);
    const [provider, model] = value.split('\u0001');
    try {
      await wire.orb.settings.set({
        models: { [role]: value && provider && model ? { provider, model } : null },
      });
    } catch (e) {
      setError(errorText(e));
    }
    await onChanged();
  };
  return (
    <div>
      <label className={p.note} htmlFor="agent-model-search">
        Find a model
      </label>
      <input
        id="agent-model-search"
        type="search"
        className={s.input}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search model IDs across providers…"
        data-testid="agent-model-search"
      />
      {AGENT_NAMES_ORDERED.map((role) => {
        const chosen = d.chosen[role];
        const eff = d.effective[role];
        const defaultLabel = chosen ? 'Default' : `Default (${eff.provider} · ${eff.model})`;
        const groups = [...usable];
        if (chosen && !groups.some((g) => g.id === chosen.provider)) {
          const info = d.providers.find((x) => x.id === chosen.provider);
          groups.push(
            info ?? {
              id: chosen.provider,
              label: chosen.provider,
              kind: 'route',
              routed: false,
              ref: '',
              noKey: false,
              usable: false,
              status: { state: 'not-set' },
              models: [chosen.model],
            },
          );
        }
        return (
          <div className={s.agentRow} key={role} data-testid="agent-model" data-agent={role}>
            <span className={s.agentName}>
              {AGENT_LABELS[role]}
              <span className={s.agentHint}>
                {AGENT_TIERS[role] === 'fast' ? 'Fast and cheap tier' : 'Strongest tier'} · applies at its
                next step
              </span>
            </span>
            <select
              className={s.select}
              aria-label={`${AGENT_LABELS[role]} model`}
              value={routeValue(chosen)}
              onChange={(e) => void choose(role, e.target.value)}
              data-testid="agent-model-select"
            >
              <option value="">{defaultLabel}</option>
              {groups.map((g) => (
                <optgroup key={g.id} label={g.label}>
                  {[
                    ...new Set([
                      ...(chosen?.provider === g.id ? [chosen.model] : []),
                      ...g.models.filter((id) => id.toLowerCase().includes(search.trim().toLowerCase())),
                    ]),
                  ].map((m) => (
                    <option key={m} value={routeValue({ provider: g.id, model: m })}>
                      {g.modelNames?.[m] ? `${g.modelNames[m]} · ${m}` : m}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        );
      })}
      {usable.length === 0 && <p className={p.note}>Add a provider key to choose models.</p>}
      {error && (
        <p className={s.failure} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SearchKeyRow({
  wire,
  k,
  onChanged,
}: {
  wire: Wire;
  k: KeyDescriptor;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const label = k.provider === 'brave' ? 'Brave Search' : k.provider === 'parallel' ? 'Parallel' : 'Tavily';
  const parallel = k.provider === 'parallel';
  const run = (op: Promise<unknown>) =>
    op.then(
      async () => {
        setDraft('');
        await onChanged();
      },
      (e: unknown) => setError(errorText(e)),
    );
  return (
    <div className={s.card} data-testid="search-key" data-provider={k.provider}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>{label}</h3>
        <span className={s.badge} data-state={k.configured ? 'working' : 'not-set'}>
          {k.configured ? 'Key saved' : parallel ? 'Key needed' : 'Not set'}
        </span>
      </div>
      {parallel && (
        <p className={p.note} data-testid="parallel-note">
          Web search, page extraction, cited answers, deep research, batch enrichment, entity lists and
          watches, from api.parallel.ai. Most calls cost under a cent; deep research, bulk runs and watches
          cost more, so orb asks before anything estimated above $0.50. Without a key those tools say so and
          Scout uses the other search providers.
        </p>
      )}
      {k.configured && <span className={s.mono}>{k.redacted}</span>}
      <form
        className={s.keyRow}
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          if (draft.trim()) void run(wire.orb.keys.set({ provider: k.provider, key: draft.trim() }));
        }}
      >
        {k.writable && (
          <>
            <input
              className={s.input}
              type="password"
              autoComplete="off"
              aria-label={`${label} API key`}
              placeholder={k.configured ? 'Replace the key' : 'Paste your API key'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className={s.buttonPrimary} disabled={!draft.trim()}>
              Save
            </button>
          </>
        )}
        {k.configured && k.writable && (
          <button
            type="button"
            className={s.ghost}
            onClick={() => void run(wire.orb.keys.unset({ provider: k.provider }))}
          >
            Remove key
          </button>
        )}
      </form>
      {error && (
        <p className={s.failure} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** The search provider Scout uses: the first configured of Parallel, Brave, Tavily, OpenAI (orb-sources selectSearchProvider). */
function activeSearch(searchKeys: KeyDescriptor[], d?: ModelsDescribeResult): string | undefined {
  if (searchKeys.find((k) => k.provider === 'parallel')?.configured) return 'Parallel';
  if (searchKeys.find((k) => k.provider === 'brave')?.configured) return 'Brave Search';
  if (searchKeys.find((k) => k.provider === 'tavily')?.configured) return 'Tavily';
  if (d?.providers.find((x) => x.id === 'openai')?.key?.configured)
    return 'OpenAI web search (your OpenAI key)';
  return 'orb’s browser (no search API key needed)';
}

export function ModelsSettings({ wire }: { wire: Wire }) {
  const [d, setD] = useState<ModelsDescribeResult>();
  const [searchKeys, setSearchKeys] = useState<KeyDescriptor[]>([]);
  const [error, setError] = useState<string>();
  const [form, setForm] = useState<{ editing?: CustomProvider }>();

  const refresh = useCallback(async () => {
    try {
      const [models, keys] = await Promise.all([wire.orb.models.describe(), wire.orb.keys.describe()]);
      setD(models);
      setSearchKeys(
        keys.keys.filter(
          (k) => k.provider === 'brave' || k.provider === 'tavily' || k.provider === 'parallel',
        ),
      );
      setError(undefined);
    } catch (e) {
      setError(errorText(e));
    }
  }, [wire]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const search = activeSearch(searchKeys, d);

  return (
    <>
      <section className={p.section} aria-labelledby="settings-models" data-testid="models-settings">
        <h2 className={p.sectionTitle} id="settings-models">
          Models
        </h2>
        <p className={p.note}>
          Keys are stored in your Mac’s Keychain. orb only ever shows the last few characters. A change takes
          effect on the next request.
        </p>
        {error && (
          <p className={s.failure} role="alert">
            {error}
          </p>
        )}
        <div className={s.cards} data-testid="provider-cards" data-loaded={d ? 'yes' : 'no'}>
          <ChatGPTPlan wire={wire} onChanged={refresh} />
          {d?.providers
            .filter((info) => info.id !== 'chatgpt-plan')
            .map((info) => (
              <ProviderCard
                key={info.id}
                wire={wire}
                info={info}
                onChanged={refresh}
                onEdit={(custom) => setForm({ editing: custom })}
              />
            ))}
          {form ? (
            <CustomProviderForm
              key={form.editing?.id ?? 'new'}
              wire={wire}
              {...(form.editing ? { editing: form.editing } : {})}
              onDone={async () => {
                setForm(undefined);
                await refresh();
              }}
            />
          ) : (
            <button
              type="button"
              className={s.button}
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setForm({})}
              data-testid="custom-add"
            >
              Add a custom provider
            </button>
          )}
        </div>
      </section>

      <section className={p.section} aria-labelledby="settings-agent-models">
        <h2 className={p.sectionTitle} id="settings-agent-models">
          Agent models
        </h2>
        <p className={p.note}>
          Each agent uses its own model. Without a choice, it takes the default for its tier from a provider
          that works.
        </p>
        {d && <AgentModelPicker wire={wire} d={d} onChanged={refresh} />}
      </section>

      <section className={p.section} aria-labelledby="settings-search">
        <h2 className={p.sectionTitle} id="settings-search">
          Search
        </h2>
        <p className={p.note} data-testid="search-active">
          {search
            ? `Scout searches the web with ${search}.`
            : 'No search provider is set, so Scout cannot search the web. It can still read the links you add.'}
        </p>
        <div className={s.cards}>
          {searchKeys.map((k) => (
            <SearchKeyRow key={k.provider} wire={wire} k={k} onChanged={refresh} />
          ))}
        </div>
      </section>
    </>
  );
}
