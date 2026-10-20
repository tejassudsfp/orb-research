import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AGENT_NAMES_ORDERED,
  CHATGPT_PROVIDER,
  CHATGPT_USAGE_URL,
  type ChatGPTAction,
  type ChatGPTState,
} from '@orb/shared';
import { isWireError, type Wire } from '../../wire/index.js';
import p from '../../components/Page.module.css';
import s from './Settings.module.css';

/** No OAuth URL, authorization code or token is exposed to React. */
export function ChatGPTPlan({ wire, onChanged }: { wire: Wire; onChanged: () => Promise<void> }) {
  const [state, setState] = useState<ChatGPTState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [model, setModel] = useState('');
  const welcome = useRef<HTMLDialogElement>(null);
  const update = useCallback((next: ChatGPTState) => {
    setState(next);
    setModel((previous) =>
      next.models.some((entry) => entry.id === previous) ? previous : (next.models[0]?.id ?? ''),
    );
  }, []);
  useEffect(() => {
    const ac = new AbortController();
    void wire.orb.chatgpt
      ?.describe(ac.signal)
      .then(update)
      .catch((e: unknown) => {
        if (!ac.signal.aborted)
          setError(isWireError(e) ? e.message : 'The ChatGPT connection could not be read.');
      });
    return () => ac.abort();
  }, [wire, update]);
  useEffect(() => {
    if (!state?.pending) return;
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const next = await wire.orb.chatgpt.describe(ac.signal);
        if (ac.signal.aborted) return;
        update(next);
        if (next.pending) timer = setTimeout(() => void tick(), 800);
        else await onChanged();
      } catch (e) {
        if (!ac.signal.aborted) {
          setError(isWireError(e) ? e.message : 'Connection interrupted. Reopen Settings to check it.');
        }
      }
    };
    timer = setTimeout(() => void tick(), 400);
    return () => {
      ac.abort();
      clearTimeout(timer);
    };
  }, [state?.pending, wire, update, onChanged]);
  useEffect(() => {
    if (state?.welcome && !welcome.current?.open) welcome.current?.showModal?.();
    if (!state?.welcome) welcome.current?.close?.();
  }, [state?.welcome]);
  const run = async (request: ChatGPTAction) => {
    setBusy(true);
    setError(undefined);
    try {
      update(await wire.orb.chatgpt.action(request));
      await onChanged();
    } catch (e) {
      setError(isWireError(e) ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const active = state?.profiles.find((entry) => entry.id === state.active);
  const locked = busy || !!state?.pending;
  const usePlan = async () => {
    if (!model) return;
    setBusy(true);
    setError(undefined);
    try {
      await wire.orb.settings.set({
        models: Object.fromEntries(
          AGENT_NAMES_ORDERED.map((role) => [role, { provider: CHATGPT_PROVIDER, model }]),
        ),
      });
      await onChanged();
    } catch (e) {
      setError(isWireError(e) ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={s.card} data-testid="chatgpt-plan-card">
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>ChatGPT plan</h3>
        <span className={s.badge} data-state={active?.planEnabled ? 'working' : 'not-set'}>
          {state?.pending
            ? 'Waiting for browser…'
            : active?.planEnabled
              ? 'Plan enabled'
              : active?.connected
                ? 'Signed in · plan disabled'
                : 'Not connected'}
        </span>
      </div>
      <p className={p.note}>
        Use an eligible ChatGPT Plus or Pro plan with orb on this Mac. All agents share that plan’s allowance.
        API-key providers and optional search APIs keep their own billing. Browser search needs no search API
        key.
      </p>
      <div className={s.keyRow}>
        <button
          type="button"
          className={s.buttonPrimary}
          disabled={locked}
          onClick={() => void run({ action: 'connect', ...(active ? { profileId: active.id } : {}) })}
        >
          Continue with ChatGPT
        </button>
        {state?.pending && (
          <button
            type="button"
            className={s.button}
            disabled={busy}
            onClick={() => void run({ action: 'cancel' })}
          >
            Cancel sign-in
          </button>
        )}
        <a className={s.link} href={CHATGPT_USAGE_URL} target="_blank" rel="noreferrer">
          Manage usage
        </a>
      </div>
      {!!state?.profiles.length && (
        <>
          <label className={p.note} htmlFor="chatgpt-account">
            ChatGPT account / workspace registration
          </label>
          <div className={s.keyRow}>
            <select
              id="chatgpt-account"
              className={s.select}
              value={state.active ?? ''}
              disabled={locked}
              onChange={(event) => void run({ action: 'select', profileId: event.target.value })}
            >
              {!state.active && <option value="">Choose a connection</option>}
              {state.profiles.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                  {entry.connected ? '' : ' · signed out'}
                </option>
              ))}
            </select>
          </div>
          <div className={s.keyRow}>
            <button
              type="button"
              className={s.button}
              disabled={locked}
              onClick={() => void run({ action: 'connect' })}
            >
              Add account or workspace
            </button>
            {active?.connected && (
              <button
                type="button"
                className={s.ghost}
                disabled={locked}
                onClick={() => void run({ action: 'disconnect', profileId: active.id })}
              >
                Sign out
              </button>
            )}
            {active?.connected && !active.planEnabled && (
              <button
                type="button"
                className={s.button}
                disabled={locked}
                onClick={() => void run({ action: 'connect', profileId: active.id, enablePlan: true })}
              >
                Enable ChatGPT plan usage
              </button>
            )}
          </div>
        </>
      )}
      {active?.planEnabled && (
        <>
          <p className={p.note}>
            Using ChatGPT plan · {active.label}. Plan limits and optional credit overflow are controlled in
            ChatGPT Settings → Usage. orb never switches to an API key automatically.
          </p>
          <label className={p.note} htmlFor="chatgpt-default-model">
            Model for all agents
          </label>
          <div className={s.keyRow}>
            <select
              id="chatgpt-default-model"
              className={s.select}
              value={model}
              disabled={locked}
              onChange={(event) => setModel(event.target.value)}
            >
              {!state?.models.length && <option value="">Refresh models to choose</option>}
              {state?.models.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} · {entry.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={s.button}
              disabled={locked}
              onClick={() => void run({ action: 'refresh' })}
            >
              Refresh models
            </button>
            <button
              type="button"
              className={s.button}
              disabled={locked || !state?.models.length}
              onClick={() => void run({ action: 'test' })}
            >
              Test plan connection
            </button>
            <button
              type="button"
              className={s.buttonPrimary}
              disabled={locked || !model}
              onClick={() => void usePlan()}
            >
              Use for all agents
            </button>
          </div>
          <p className={p.note}>
            {state?.verifiedAt
              ? `Response verified ${new Date(state.verifiedAt).toLocaleString()}.`
              : 'Sign-in alone does not verify inference. Test the connection before starting research.'}{' '}
            You can choose different models per agent below.
          </p>
        </>
      )}
      {state?.message && (
        <p className={p.note} role="status">
          {state.message}
        </p>
      )}
      {error && (
        <p className={s.failure} role="alert">
          {error}
        </p>
      )}
      <dialog
        ref={welcome}
        className={`${s.sheet} ${s.planWelcome}`}
        aria-labelledby="chatgpt-welcome"
        onCancel={(event) => {
          event.preventDefault();
          void run({ action: 'welcomeSeen' });
        }}
      >
        <h2 id="chatgpt-welcome">You’re using your ChatGPT plan</h2>
        <p>
          Eligible orb requests use your shared ChatGPT allowance when you choose ChatGPT plan models. Review
          limits and optional credits in ChatGPT settings.
        </p>
        <div className={s.keyRow}>
          <a href={CHATGPT_USAGE_URL} target="_blank" rel="noreferrer" className={s.link}>
            Manage usage
          </a>
          <button
            type="button"
            className={s.buttonPrimary}
            disabled={busy}
            onClick={() => void run({ action: 'welcomeSeen' })}
          >
            Got it
          </button>
        </div>
      </dialog>
    </article>
  );
}
