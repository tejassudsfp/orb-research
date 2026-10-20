/**
 * First-run sheet (P4.2; PRD Models and API keys › First run; not designed in the prototype, follows the design
 * system). Shown before Home when no provider works and the sheet was never finished or skipped (`firstRun` from
 * `orb/models.describe`). OpenAI is preselected (user decision: GPT Luna 6 for every agent), with a link to get a key;
 * the key goes to the Keychain (`orb/keys.set`) and is tested at once. The user may skip: Home then explains that a
 * key is needed. Finishing or skipping sets `firstRunDone` in orb.json.
 */
import { useCallback, useEffect, useState } from 'react';
import { PROVIDER_PRESETS, type ModelsDescribeResult } from '@orb/shared';
import { navigate } from '../../app/useRoute.js';
import { OrbLockup } from '../../brand/OrbMark.js';
import p from '../../components/Page.module.css';
import type { Wire } from '../../wire/index.js';
import { ProviderKeyControls, StatusBadge } from '../Settings/Models.js';
import s from '../Settings/Settings.module.css';
import { radioKeys } from '../../components/radioKeys.js';
import { ChatGPTPlan } from '../Settings/ChatGPTPlan.js';

export function FirstRunScreen({ wire }: { wire: Wire }) {
  const [d, setD] = useState<ModelsDescribeResult>();
  const [chosen, setChosen] = useState<string>(PROVIDER_PRESETS[0]!.id);

  const refresh = useCallback(async () => {
    setD(await wire.orb.models.describe().catch(() => undefined));
  }, [wire]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const info = d?.providers.find((x) => x.id === chosen);
  const working = d?.providers.some((x) => x.status.state === 'working') ?? false;

  const finish = (to: 'home' | 'settings') => {
    void wire.orb.settings
      .set({ firstRunDone: true })
      .catch(() => undefined)
      .finally(() => navigate({ name: to }));
  };

  return (
    <main className={`${p.page} ${p.night}`} data-testid="first-run-screen">
      <div className={p.topBar}>
        <OrbLockup markSize={30} className={p.brand} testId="brand-lockup" />
      </div>
      <div className={s.sheet} role="dialog" aria-labelledby="first-run-title">
        <span className={p.eyebrow}>Welcome</span>
        <h1 className={p.heading} id="first-run-title" style={{ fontSize: 32 }}>
          Connect a model provider
        </h1>
        <p className={p.lead}>
          Connect your ChatGPT plan or add a provider API key. Credentials stay in your Mac’s Keychain.
        </p>
        <ChatGPTPlan wire={wire} onChanged={refresh} />
        <div className={s.choices} role="radiogroup" onKeyDown={radioKeys} aria-label="Provider">
          {PROVIDER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={chosen === preset.id}
              className={chosen === preset.id ? s.choiceOn : s.choice}
              onClick={() => setChosen(preset.id)}
              data-testid="first-run-provider"
              data-provider={preset.id}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {info && (
          <div
            className={s.card}
            data-testid="provider-card"
            data-provider={info.id}
            data-state={info.status.state}
          >
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>{info.label}</h2>
              <StatusBadge info={info} />
            </div>
            <div className={s.meta}>
              {info.key?.configured && <span className={s.mono}>{info.key.redacted}</span>}
              {info.keyUrl && (
                <a
                  className={s.link}
                  href={info.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="first-run-get-key"
                >
                  Get {/^[aeiou]/i.test(info.label) ? 'an' : 'a'} {info.label} key
                </a>
              )}
            </div>
            <ProviderKeyControls key={info.id} wire={wire} info={info} onChanged={refresh} autoFocus />
          </div>
        )}
        <div className={s.sheetActions}>
          <button
            type="button"
            className={s.ghost}
            onClick={() => finish('settings')}
            data-testid="first-run-custom"
          >
            Use a local or custom provider
          </button>
          <button
            type="button"
            className={working ? p.primary : s.button}
            onClick={() => finish('home')}
            data-testid="first-run-continue"
          >
            {working ? 'Continue' : 'Skip for now'}
          </button>
        </div>
      </div>
    </main>
  );
}
