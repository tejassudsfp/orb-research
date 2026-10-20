/**
 * P5.3 Settings › Storage (PRD Settings): the Orb folder's location, Reveal in Finder, and Change location, either
 * moving the folder ("Move…") or pointing Orb at a folder that already holds an Orb library ("Use existing
 * folder…"). The work is done by main (apps/desktop/src/main/settingsNative.ts): it shows the folder picker, stops
 * the engine, moves or switches, and restarts the engine on the new folder; the window then reloads on Settings.
 * Outside the app (a plain browser, a test page) there is no `window.orbNative.storage` and the section says so.
 */
import { useEffect, useState } from 'react';
import { orbNative, type StorageInfo } from '../../print/native.js';
import p from '../../components/Page.module.css';
import s from './Settings.module.css';

type Busy = 'move' | 'existing' | undefined;

export function StorageSettings() {
  const storage = orbNative()?.storage;
  const [info, setInfo] = useState<StorageInfo | null>();
  const [busy, setBusy] = useState<Busy>();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  useEffect(() => {
    let live = true;
    storage?.get().then(
      (v) => live && setInfo(v),
      () => live && setInfo(null),
    );
    return () => {
      live = false;
    };
  }, [storage]);

  const change = async (mode: 'move' | 'existing') => {
    if (!storage) return;
    setBusy(mode);
    setError(undefined);
    setDone(undefined);
    try {
      const result = await storage.change(mode);
      if (result.ok) {
        // The engine restarts on the new folder and the window reloads here; until then say what happened.
        setInfo((cur) => (cur ? { ...cur, orbHome: result.orbHome, missing: undefined } : cur));
        setDone(
          mode === 'move'
            ? 'Moved. orb is restarting its engine on the new folder…'
            : 'Switched. orb is restarting its engine on that folder…',
        );
        return;
      }
      if (result.error) setError(result.error);
      setBusy(undefined);
    } catch (err) {
      setError((err as Error)?.message ?? String(err));
      setBusy(undefined);
    }
  };

  return (
    <section
      className={p.section}
      aria-labelledby="settings-storage"
      data-testid="settings-storage"
      aria-busy={busy ? 'true' : undefined}
    >
      <h2 className={p.sectionTitle} id="settings-storage">
        Storage
      </h2>
      <p className={p.note}>
        Your canvases are saved on this Mac in your orb folder, one folder per canvas. Model keys are not
        stored there; they stay in your macOS Keychain.
      </p>
      {storage ? (
        <>
          <div className={p.row}>
            <span>orb folder</span>
            <span className={p.value} data-testid="storage-path">
              {info ? info.orbHome : info === null ? 'Unavailable' : '…'}
            </span>
          </div>
          {info?.missing && (
            <p className={s.failure} role="alert" data-testid="storage-missing">
              orb could not find your chosen folder at {info.missing}, so it is using {info.defaultHome}. Use
              “Use existing folder…” to point orb at it again once it is back.
            </p>
          )}
          <div className={s.choices}>
            <button
              type="button"
              className={s.button}
              onClick={() => void storage.reveal()}
              disabled={!info || busy !== undefined}
              data-testid="storage-reveal"
            >
              Reveal in Finder
            </button>
            <button
              type="button"
              className={s.button}
              onClick={() => void change('move')}
              disabled={!info || busy !== undefined}
              data-testid="storage-move"
            >
              {busy === 'move' ? 'Moving…' : 'Move…'}
            </button>
            <button
              type="button"
              className={s.button}
              onClick={() => void change('existing')}
              disabled={!info || busy !== undefined}
              data-testid="storage-existing"
            >
              {busy === 'existing' ? 'Switching…' : 'Use existing folder…'}
            </button>
          </div>
          <p className={p.note}>
            Move takes the whole folder, canvases and exports included, to the place you choose. Use existing
            folder opens an orb folder you already have, for example one on another drive; your current folder
            stays where it is.
          </p>
          {done && (
            <p className={p.note} role="status" data-testid="storage-done">
              {done}
            </p>
          )}
          {error && (
            <p className={s.failure} role="alert" data-testid="storage-error">
              {error}
            </p>
          )}
        </>
      ) : (
        <p className={p.note}>The orb folder can be changed in the orb app.</p>
      )}
    </section>
  );
}
