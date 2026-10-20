/**
 * P5.1 the warming-up page. Main opens the window on `orb-boot://app/index.html?boot=1&theme=…&view=…` at launch,
 * before the sidecar is up, and replaces it with the live UI from the sidecar origin as soon as the sidecar is ready.
 * No network: the boot page's CSP has `connect-src 'none'`.
 *
 * - `view=home`: Home in its warming-up state (HomeScreen without a wire).
 * - `view=splash`: until the first-run sheet has been finished or skipped once, the stacked orb lockup and "Warming up…"
 *   (the sheet comes before Home on first launch, PRD Models and keys).
 */
import { normalizeAppearance, type Appearance, type MotionMode, type ThemeMode } from '@orb/shared';
import { OrbLockup } from '../brand/OrbMark.js';
import { HomeScreen } from '../screens/Home/Home.js';
import { KeychainHint } from './KeychainHint.js';
import s from '../screens/Home/Home.module.css';

export type BootParams = {
  theme: ThemeMode;
  appearance: Appearance;
  view: 'home' | 'splash';
  motion: MotionMode;
};

/**
 * The boot page's parameters (`?theme=day|night&view=home|splash&motion=system|reduce`; night, splash and system by
 * default).
 */
export function bootParams(search: string): BootParams {
  const q = new URLSearchParams(search);
  return {
    theme: q.get('theme') === 'day' ? 'day' : 'night',
    appearance: normalizeAppearance({
      themeId: q.get('style'),
      accent: q.get('accent'),
      mode: q.get('brightness') ?? (q.get('theme') === 'day' ? 'light' : 'dark'),
    }),
    view: q.get('view') === 'home' ? 'home' : 'splash',
    motion: q.get('motion') === 'reduce' ? 'reduce' : 'system',
  };
}

/** True when this page is the boot page (served by main, not by the sidecar). */
export const isBootPage = (loc: Pick<Location, 'protocol'>): boolean => loc.protocol === 'orb-boot:';

export function BootApp({ theme, view }: BootParams) {
  return (
    <div data-testid="orb-boot-root" data-theme={theme} data-view={view}>
      {view === 'home' ? (
        <HomeScreen wire={undefined} theme={theme} onTheme={() => undefined} />
      ) : (
        <main
          className={`${s.home} ${theme === 'night' ? s.night : s.day} ${s.splash}`}
          data-testid="boot-splash"
          aria-busy="true"
        >
          <OrbLockup layout="stacked" markSize={96} testId="brand-lockup" />
          <p className={`${s.notice} ${s.warming}`} role="status">
            <span aria-hidden="true" className={s.warmingDot} />
            Warming up…
          </p>
          <KeychainHint wire={undefined} className={s.notice} />
        </main>
      )}
    </div>
  );
}
