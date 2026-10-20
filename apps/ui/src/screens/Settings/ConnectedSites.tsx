/**
 * P6.10 Settings › Connected sites (PLAN P6.10): sign in to a site once in a visible window, then let Scout read
 * pages of that site with your session, read-only. Everything sensitive runs in Electron main
 * (apps/desktop/src/main/sites.ts): the window, the partition, the cookies. This section only lists connected
 * domains, takes an address, shows the ToS warning before connecting a site on the list, lets you choose whether
 * every fetch needs your OK, disconnects, and shows the recent fetches (the activity list).
 * Outside the app (a plain browser, a test page) there is no `window.orbNative.sites` and the section says so.
 */
import { useCallback, useEffect, useState } from 'react';
import { tosWarningFor, type SiteActivity, type SitesState } from '@orb/shared';
import { orbNative } from '../../print/native.js';
import p from '../../components/Page.module.css';
import s from './Settings.module.css';

const OUTCOME: Record<SiteActivity['outcome'], string> = {
  ok: 'Read',
  denied: 'Not allowed',
  'rate-limited': 'Too fast',
  error: 'Failed',
};

const timeOf = (at: number) =>
  new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function ConnectedSites() {
  const sites = orbNative()?.sites;
  const [state, setState] = useState<SitesState | null>();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  /** A typed address whose ToS warning the user has not accepted yet. */
  const [pending, setPending] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setState(await sites?.get());
    } catch {
      setState(null);
    }
  }, [sites]);

  useEffect(() => {
    void refresh();
    // Fetches by agents add activity while this page is open.
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (!sites)
    return (
      <section className={p.section} aria-labelledby="settings-sites" data-testid="settings-sites">
        <h2 className={p.sectionTitle} id="settings-sites">
          Connected sites
        </h2>
        <p className={p.note}>Sites can be connected in the orb app.</p>
      </section>
    );

  const connect = async (accepted: boolean) => {
    setBusy(true);
    setError(undefined);
    setNote(undefined);
    try {
      const result = await sites.connect(input, accepted);
      if (result.ok) {
        setNote(`${result.site.domain} is connected.`);
        setInput('');
        setPending(undefined);
      } else if (result.error) setError(result.error);
    } catch (err) {
      setError((err as Error)?.message ?? String(err));
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const onConnect = () => {
    setError(undefined);
    setNote(undefined);
    const probe = input.trim().replace(/^[a-z]+:\/\//i, '').split('/')[0]!.replace(/^www\./i, '');
    const warning = tosWarningFor(probe);
    if (warning && pending !== input) {
      setPending(input);
      return;
    }
    void connect(true);
  };

  const warning = pending !== undefined ? tosWarningFor(pending.trim().replace(/^[a-z]+:\/\//i, '').split('/')[0]!.replace(/^www\./i, '')) : undefined;

  return (
    <section
      className={p.section}
      aria-labelledby="settings-sites"
      data-testid="settings-sites"
      aria-busy={busy ? 'true' : undefined}
    >
      <h2 className={p.sectionTitle} id="settings-sites">
        Connected sites
      </h2>
      <p className={p.note}>
        Sign in to a site once, and Scout can read pages of that site as you, for research. It only opens a page
        and reads it: no clicks, no forms, never a post. Your password and cookies stay in orb and are never given
        to an agent or a model. Fetches are limited to a few a minute, and each one is listed below.
      </p>

      {state?.sites.length ? (
        <ul className={s.siteList} data-testid="sites-list">
          {state.sites.map((site) => (
            <li key={site.domain} className={s.siteItem} data-testid="site-row" data-domain={site.domain}>
              <div className={p.row}>
                <span className={s.siteName}>{site.domain}</span>
                <button
                  type="button"
                  className={s.button}
                  onClick={() =>
                    void sites.disconnect(site.domain).then(() => {
                      setNote(`${site.domain} is disconnected and its sign-in was removed from orb.`);
                      return refresh();
                    })
                  }
                  data-testid="site-disconnect"
                >
                  Disconnect
                </button>
              </div>
              <label className={s.siteCheck}>
                <input
                  type="checkbox"
                  checked={site.requireApproval}
                  onChange={(e) => void sites.setApproval(site.domain, e.target.checked).then(refresh)}
                  data-testid="site-approval"
                />
                <span>Ask me before every fetch</span>
              </label>
              {site.warning && (
                <p className={p.note} data-testid="site-warning">
                  {site.warning}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={p.note} data-testid="sites-empty">
          {state === undefined ? '…' : 'No sites are connected.'}
        </p>
      )}

      <div className={s.form}>
        <input
          className={s.input}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setPending(undefined);
          }}
          placeholder="example.com"
          aria-label="Site to connect"
          spellCheck={false}
          autoCapitalize="off"
          data-testid="site-input"
        />
        <button
          type="button"
          className={s.button}
          onClick={onConnect}
          disabled={busy || !input.trim()}
          data-testid="site-connect"
        >
          {busy ? 'Waiting for sign-in…' : warning ? 'Connect anyway' : 'Connect…'}
        </button>
      </div>
      {busy && (
        <p className={p.note} role="status" data-testid="site-waiting">
          A sign-in window is open. Sign in the way you normally do, then close that window to finish.
        </p>
      )}
      {warning && (
        <p className={s.failure} role="alert" data-testid="site-tos">
          {warning} Press “Connect anyway” to continue.
        </p>
      )}
      {note && (
        <p className={p.note} role="status" data-testid="site-note">
          {note}
        </p>
      )}
      {error && (
        <p className={s.failure} role="alert" data-testid="site-error">
          {error}
        </p>
      )}

      <h3 className={s.subTitle}>Recent fetches</h3>
      {state?.activity.length ? (
        <ul className={s.siteList} data-testid="site-activity">
          {state.activity.slice(0, 20).map((a) => (
            <li key={`${a.at}-${a.url}`} className={s.activityItem} data-testid="site-activity-row" data-outcome={a.outcome}>
              <span className={s.activityWhen}>{timeOf(a.at)}</span>
              <span>
                {OUTCOME[a.outcome]} · {a.by}
                {a.screenshot ? ' · screenshot' : ''}
              </span>
              <span className={s.activityUrl}>{a.url}</span>
              {a.detail && <span className={s.activityWhen}>{a.detail}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className={p.note}>Nothing has been fetched with a signed-in session yet.</p>
      )}
    </section>
  );
}
