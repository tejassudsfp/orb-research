/**
 * Settings (design system only; not designed in the prototype): Models (P4.2: provider cards, keys, Test, custom
 * providers, per-agent models, search keys), Prices (P4.3: the cost meter's price table, seeded from the catalog and
 * editable), Appearance (styles, accents, brightness and motion, saved in orb.json), Storage (the Orb folder,
 * Reveal in Finder, Change location; Storage.tsx) and About (orb, harness, engine and runtime versions, and the
 * privacy statement).
 */
import { useEffect, useState } from 'react';
import type { Appearance, AppearancePatch, MotionMode } from '@orb/shared';
import type { ThemeMode } from '../../App.js';
import { routeHref } from '../../app/router.js';
import { HARNESS_VERSION } from '../../app/versions.js';
import { OrbLockup } from '../../brand/OrbMark.js';
import { BackIcon } from '../../components/icons.js';
import type { OrbPingValue, Wire } from '../../wire/index.js';
import p from '../../components/Page.module.css';
import { ModelsSettings } from './Models.js';
import { AppearanceSettings } from './Appearance.js';
import { PricesSettings } from './Prices.js';
import { ConnectedSites } from './ConnectedSites.js';
import { StorageSettings } from './Storage.js';
import { orbNative, type AboutInfo } from '../../print/native.js';

export function SettingsScreen({
  wire,
  theme,
  appearance,
  onAppearance,
  appearanceError,
  appearanceSaving,
  motion,
  onMotion,
}: {
  wire: Wire;
  theme: ThemeMode;
  appearance: Appearance;
  onAppearance: (patch: AppearancePatch) => void;
  appearanceError?: string;
  appearanceSaving?: boolean;
  motion: MotionMode;
  onMotion: (mode: MotionMode) => void;
}) {
  const [pong, setPong] = useState<OrbPingValue>();
  useEffect(() => {
    const ac = new AbortController();
    wire.orb.ping(ac.signal).then(setPong, () => undefined);
    return () => ac.abort();
  }, [wire]);
  // P5.3 About: the app and runtime versions from main (null outside the app).
  const [about, setAbout] = useState<AboutInfo | null>();
  useEffect(() => {
    let live = true;
    const native = orbNative()?.about;
    if (!native) setAbout(null);
    else
      native().then(
        (v) => live && setAbout(v),
        () => live && setAbout(null),
      );
    return () => {
      live = false;
    };
  }, []);

  return (
    <main className={`${p.page} ${theme === 'night' ? p.night : ''}`} data-testid="settings-screen">
      <div className={p.topBar}>
        <a href={routeHref({ name: 'home' })} className={p.back}>
          <BackIcon />
          Home
        </a>
      </div>
      <div className={p.column}>
        <h1 className={p.heading}>Settings</h1>

        <AppearanceSettings
          appearance={appearance}
          onChange={onAppearance}
          error={appearanceError}
          saving={appearanceSaving}
        />
        <section className={p.section} aria-labelledby="settings-motion-heading">
          <h2 className={p.sectionTitle} id="settings-motion-heading">
            Motion
          </h2>
          <div className={p.row}>
            <span id="settings-motion-label">Reduce motion</span>
            <div
              className={p.segmented}
              role="group"
              aria-labelledby="settings-motion-label"
              data-testid="settings-motion"
            >
              {(['system', 'reduce'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={motion === mode}
                  className={motion === mode ? p.segmentActive : p.segment}
                  onClick={() => onMotion(mode)}
                  data-motion={mode}
                >
                  {mode === 'system' ? 'Follow macOS' : 'Always'}
                </button>
              ))}
            </div>
          </div>
          <p className={p.note}>
            {motion === 'reduce'
              ? 'Motion is reduced in orb: no fades or glides, instant zoom flights, and the Home topics stay still.'
              : 'Motion follows the Reduce Motion setting in macOS (System Settings › Accessibility › Display).'}
          </p>
        </section>

        <ModelsSettings wire={wire} />

        <PricesSettings wire={wire} />

        <ConnectedSites />

        <StorageSettings />

        <section className={p.section} aria-labelledby="settings-about" data-testid="settings-about">
          <h2 className={p.sectionTitle} id="settings-about">
            About
          </h2>
          <div className={p.row}>
            <OrbLockup markSize={28} testId="about-lockup" />
            <span className={p.value} data-testid="about-orb">
              {about ? `orb ${about.orb}` : about === null ? 'orb' : '…'}
            </span>
          </div>
          <div className={p.row}>
            <span>Harness</span>
            <span className={p.value} data-testid="about-harness">
              DeepSeek Harness {HARNESS_VERSION}
            </span>
          </div>
          <div className={p.row}>
            <span>Engine</span>
            <span className={p.value} data-testid="about-engine">
              {pong ? `${pong.service} ${pong.version}` : '…'}
            </span>
          </div>
          {about && (
            <div className={p.row}>
              <span>Runtime</span>
              <span className={p.value} data-testid="about-runtime">
                Electron {about.electron} · Chromium {about.chrome} · Node {about.node}
              </span>
            </div>
          )}
          <p className={p.note} data-testid="about-privacy">
            <strong>Privacy:</strong> nothing is sent except to the providers you configured.
          </p>
          <p className={p.note}>
            orb has no telemetry, analytics or crash reporting. Requests leave this Mac only for the model and
            search providers you set up in Models, and for the web pages you or Scout choose to read. Your
            canvases stay in your orb folder and your keys in your macOS Keychain.
          </p>
        </section>
      </div>
    </main>
  );
}
