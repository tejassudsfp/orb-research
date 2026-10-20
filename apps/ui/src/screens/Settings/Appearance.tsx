import { useEffect, useState, type CSSProperties } from 'react';
import {
  accentPresetIds,
  accentPresets,
  appearanceVariables,
  normalizeCustomAccent,
  resolveBrightness,
  themes,
  themeIds,
  type Appearance,
  type AppearancePatch,
} from '@orb/shared';
import p from '../../components/Page.module.css';
import s from './Appearance.module.css';

/** The same three independent choices as Symplist; previews show style geometry and the chosen accent. */
export function AppearanceSettings({
  appearance,
  onChange,
  error,
  saving,
}: {
  appearance: Appearance;
  onChange: (patch: AppearancePatch) => void;
  error?: string;
  saving?: boolean;
}) {
  const [custom, setCustom] = useState<string>(appearance.accent.startsWith('#') ? appearance.accent : '#');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (appearance.accent.startsWith('#')) setCustom(appearance.accent);
  }, [appearance.accent]);
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const mode = resolveBrightness(appearance, systemDark);
  const applyCustom = () => {
    const value = normalizeCustomAccent(custom);
    setInvalid(!value);
    if (value) {
      setCustom(value);
      onChange({ accent: value });
    }
  };
  return (
    <section className={p.section} aria-labelledby="settings-appearance" data-testid="settings-appearance">
      <h2 className={p.sectionTitle} id="settings-appearance">
        Appearance
      </h2>
      <p className={p.note}>
        Style, accent and brightness are independent. Changes apply across orb and save automatically.
      </p>
      <p className={s.hint} role="status" data-testid="appearance-save-state">
        {saving ? 'Saving appearance…' : error ? 'Preview only — save failed' : 'Saved on this Mac'}
      </p>
      <div className={s.controls}>
        <div className={s.styles}>
          <h3 className={s.label} id="appearance-style-label">
            Style
          </h3>
          <div className={s.gallery} role="group" aria-labelledby="appearance-style-label">
            {themeIds.map((id) => (
              <button
                type="button"
                key={id}
                className={s.theme}
                aria-pressed={appearance.themeId === id}
                data-testid={`appearance-style-${id}`}
                onClick={() => onChange({ themeId: id })}
              >
                <span
                  className={s.preview}
                  aria-hidden="true"
                  style={appearanceVariables({ ...appearance, themeId: id }, mode) as CSSProperties}
                >
                  <span className={s.previewRail} />
                  <span className={s.previewPaper}>
                    <strong>Aa</strong>
                    <i />
                    <i />
                  </span>
                  <span className={s.previewButton} />
                </span>
                <span className={s.name}>
                  {themes[id].name}
                  {appearance.themeId === id && <span aria-hidden="true"> ✓</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className={s.options}>
          <div>
            <h3 className={s.label} id="appearance-brightness-label">
              Brightness
            </h3>
            <div className={p.segmented} role="group" aria-labelledby="appearance-brightness-label">
              {(['light', 'dark', 'system'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={appearance.mode === value}
                  className={appearance.mode === value ? p.segmentActive : p.segment}
                  data-testid={`appearance-mode-${value}`}
                  onClick={() => onChange({ mode: value })}
                >
                  {value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className={s.label} id="appearance-accent-label">
              Accent colour
            </h3>
            <div className={s.swatches} role="group" aria-labelledby="appearance-accent-label">
              {accentPresetIds.map((id) => (
                <button
                  type="button"
                  key={id}
                  title={accentPresets[id].label}
                  aria-label={accentPresets[id].label}
                  aria-pressed={appearance.accent === id}
                  className={s.swatch}
                  data-testid={`appearance-accent-${id}`}
                  style={{ '--swatch': accentPresets[id].seed } as CSSProperties}
                  onClick={() => onChange({ accent: id })}
                />
              ))}
            </div>
          </div>
          <div>
            <label className={s.label} htmlFor="appearance-custom">
              Custom hex colour
            </label>
            <div className={s.custom}>
              <input
                id="appearance-custom"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setInvalid(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyCustom();
                }}
                maxLength={7}
                spellCheck={false}
                aria-invalid={invalid}
                aria-describedby="appearance-colour-note"
                placeholder="#7048E8"
              />
              <button type="button" className={p.segment} onClick={applyCustom}>
                Apply
              </button>
            </div>
            <p id="appearance-colour-note" className={s.hint}>
              {invalid
                ? 'Enter a valid colour, such as #7048E8.'
                : 'Shades adjust for readable text and focus rings.'}
            </p>
          </div>
        </div>
      </div>
      {error && (
        <p className={s.error} role="alert">
          {error}{' '}
          <button type="button" onClick={() => onChange(appearance)}>
            Retry
          </button>
        </p>
      )}
    </section>
  );
}
