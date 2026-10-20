/** App shell, hash routes and persistent style/accent/brightness preferences. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  DEFAULT_APPEARANCE,
  appearanceFromSettings,
  resolveBrightness,
  type Appearance,
  type AppearancePatch,
  type MotionMode,
  type ThemeMode,
} from '@orb/shared';
import { parseRoute, routeHref } from './app/router.js';
import { navigate, useRoute } from './app/useRoute.js';
import p from './components/Page.module.css';
import { CanvasScreen } from './screens/Canvas/Canvas.js';
import { DeckScreen } from './screens/Deck/Deck.js';
import { DevScreen } from './screens/Dev/Dev.js';
import { FirstRunScreen } from './screens/FirstRun/FirstRun.js';
import { HomeScreen } from './screens/Home/Home.js';
import { PortScreen } from './screens/Port/Port.js';
import { SettingsScreen } from './screens/Settings/Settings.js';
import type { Wire } from './wire/index.js';
import { applyAppearance, AppearanceContext, WorkspaceAppearanceContext } from './theme/appearance.js';

export type { ThemeMode } from '@orb/shared';

/** How long Home waits for the first-run check before it shows anyway. */
const FIRST_RUN_CHECK_MS = 4000;

export function App({ wire }: { wire: Wire }) {
  const route = useRoute();
  // The saved appearance applies to the whole workspace, including boards and readers.
  // P2.6: the choice is saved in orb.json (`orb/settings.*`) and read back on launch.
  const [appearance, setAppearanceState] = useState<Appearance>(DEFAULT_APPEARANCE);
  const appearanceRef = useRef(appearance);
  const saves = useRef<Promise<unknown>>(Promise.resolve());
  const [appearanceError, setAppearanceError] = useState<string>();
  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(query.matches);
    query.addEventListener('change', change);
    change();
    return () => query.removeEventListener('change', change);
  }, []);
  const theme: ThemeMode = resolveBrightness(appearance, systemDark) === 'light' ? 'day' : 'night';
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [themeTimedOut, setThemeTimedOut] = useState(false);
  const chosen = useRef(false);
  // P5.3: Settings › Appearance › Motion, saved in orb.json; applied to every screen as `<html data-motion>`.
  const [motion, setMotionState] = useState<MotionMode>('system');
  const motionChosen = useRef(false);

  useEffect(() => {
    const ac = new AbortController();
    const cap = setTimeout(() => setThemeTimedOut(true), FIRST_RUN_CHECK_MS);
    wire.orb.settings.get(ac.signal).then(
      (settings) => {
        clearTimeout(cap);
        // A choice made before the settings arrived wins over the stored one.
        if (!chosen.current) {
          const saved = appearanceFromSettings(settings);
          appearanceRef.current = saved;
          setAppearanceState(saved);
        }
        if (!motionChosen.current) setMotionState(settings.motion);
        setSettingsLoaded(true);
      },
      () => {
        clearTimeout(cap);
        if (!ac.signal.aborted) setSettingsLoaded(true);
      },
    );
    return () => {
      clearTimeout(cap);
      ac.abort();
    };
  }, [wire]);

  // P4.2: the first-run sheet comes before Home when no provider works (and it was never finished or skipped).
  // Home is held back until that is known (bounded, so a slow or failing check never blocks Home).
  const [firstRunChecked, setFirstRunChecked] = useState(false);
  useEffect(() => {
    const ac = new AbortController();
    const cap = setTimeout(() => setFirstRunChecked(true), FIRST_RUN_CHECK_MS);
    // P6.2: while the Keychain read waits on a macOS access prompt the check cannot finish; Home shows at once with
    // the Keychain hint (the sheet still opens if the check later says so and Home is still showing).
    wire.orb.keys.keychain(ac.signal).then(
      (k) => {
        if (k.state !== 'ready' && !ac.signal.aborted) setFirstRunChecked(true);
      },
      () => undefined,
    );
    wire.orb.models
      .describe(ac.signal)
      .then(
        (d) => {
          if (d.firstRun && parseRoute(location.hash).name === 'home') navigate({ name: 'first-run' });
        },
        () => undefined,
      )
      .finally(() => {
        clearTimeout(cap);
        if (!ac.signal.aborted) setFirstRunChecked(true);
      });
    return () => {
      clearTimeout(cap);
      ac.abort();
    };
  }, [wire]);

  const setAppearance = useCallback(
    (patch: AppearancePatch) => {
      chosen.current = true;
      const next = { ...appearanceRef.current, ...patch };
      appearanceRef.current = next;
      setAppearanceState(next);
      setAppearanceError(undefined);
      setAppearanceSaving(true);
      // Preserve click order even if the transport is slow; a failed save can be retried in Settings.
      saves.current = saves.current
        .catch(() => undefined)
        .then(() => wire.orb.settings.set({ appearance: next }))
        .then(
          () => {
            if (appearanceRef.current === next) {
              setAppearanceError(undefined);
              setAppearanceSaving(false);
            }
          },
          () => {
            if (appearanceRef.current === next) {
              setAppearanceSaving(false);
              setAppearanceError(
                'Appearance is previewing here but could not be saved. Retry to keep it for next time.',
              );
            }
          },
        );
    },
    [wire],
  );
  const setTheme = useCallback(
    (mode: ThemeMode) => setAppearance({ mode: mode === 'day' ? 'light' : 'dark' }),
    [setAppearance],
  );
  const setMotion = useCallback(
    (mode: MotionMode) => {
      motionChosen.current = true;
      setMotionState(mode);
      wire.orb.settings.set({ motion: mode }).catch((e: unknown) => {
        console.warn(`orb: could not save the motion setting: ${String(e)}`);
      });
    },
    [wire],
  );
  useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);

  const effective = theme;

  // P5.1: on Home and Settings the saved theme decides the page colour, so it is applied only once known (bounded by
  // the same cap as the first-run check); until then the window's background shows (base.css), which main set from
  // the saved theme. A day Home never flashes night when the live UI replaces the warming-up Home.
  const themeKnown = settingsLoaded || themeTimedOut;
  useLayoutEffect(() => {
    if (themeKnown) applyAppearance(appearance, systemDark);
  }, [appearance, systemDark, themeKnown]);

  return (
    <WorkspaceAppearanceContext.Provider value={appearance}>
      <AppearanceContext.Provider value={effective}>
        <div
          data-testid="orb-root"
          data-route={route.name}
          data-theme={effective}
          data-settings={settingsLoaded ? 'loaded' : 'loading'}
        >
          {route.name === 'home' && firstRunChecked && themeKnown && (
            <HomeScreen wire={wire} theme={theme} onTheme={setTheme} />
          )}
          {route.name === 'canvas' && themeKnown && (
            <CanvasScreen
              key={route.id}
              wire={wire}
              canvasId={route.id}
              focus={route.focus}
              theme={theme}
              onTheme={setTheme}
            />
          )}
          {route.name === 'port' && themeKnown && <PortScreen wire={wire} canvasId={route.id} />}
          {route.name === 'deck' && themeKnown && (
            <DeckScreen key={route.id} wire={wire} canvasId={route.id} />
          )}
          {route.name === 'settings' && themeKnown && (
            <SettingsScreen
              wire={wire}
              theme={theme}
              appearance={appearance}
              onAppearance={setAppearance}
              appearanceError={appearanceError}
              appearanceSaving={appearanceSaving}
              motion={motion}
              onMotion={setMotion}
            />
          )}
          {route.name === 'first-run' && themeKnown && <FirstRunScreen wire={wire} />}
          {route.name === 'dev' && <DevScreen wire={wire} />}
          {route.name === 'not-found' && (
            <main className={`${p.page} ${p.night}`} data-testid="not-found-screen">
              <div className={p.column}>
                <h1 className={p.heading}>Nothing here</h1>
                <p className={p.lead}>
                  <a href={routeHref({ name: 'home' })}>Go to Home</a>
                </p>
              </div>
            </main>
          )}
        </div>
      </AppearanceContext.Provider>
    </WorkspaceAppearanceContext.Provider>
  );
}
