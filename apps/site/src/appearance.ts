import {
  appearanceVariables,
  appearancePalette,
  themeIds,
  themes,
  accentPresetIds,
  accentPresets,
  normalizeAppearance,
  resolveBrightness,
  type Appearance,
} from '../../../packages/shared/src/appearance/index.js';
import mark from '../../ui/src/brand/orb-mark.svg?raw';
import '../../ui/src/theme/theme-fonts.css';
import './site.css';

const key = 'orb-site-appearance-v1';
const system = matchMedia('(prefers-color-scheme: dark)');
const root = document.documentElement;
const style = document.querySelector<HTMLSelectElement>('#style');
const brightness = document.querySelector<HTMLSelectElement>('#brightness');
const accent = document.querySelector<HTMLSelectElement>('#accent');
const grid = document.querySelector('#themes');
let appearance: Appearance = { themeId: 'studio', mode: 'light', accent: 'blue' };
try {
  const saved = localStorage.getItem(key);
  if (saved) appearance = normalizeAppearance(JSON.parse(saved));
} catch {
  /* Blocked storage must not prevent rendering. */
}
for (const id of themeIds) style?.add(new Option(themes[id].name, id));
for (const id of accentPresetIds) accent?.add(new Option(accentPresets[id].label, id));
for (const el of document.querySelectorAll('.mark'))
  el.innerHTML = mark
    .replaceAll('#60A5FA', 'currentColor')
    .replaceAll('#2563EB', 'currentColor')
    .replaceAll('#F9FCFE', 'currentColor');
if (grid)
  for (const id of themeIds) {
    const button = document.createElement('button');
    button.className = 'theme-choice';
    button.dataset.style = id;
    button.setAttribute('aria-label', `Use ${themes[id].name} style`);
    const miniature = document.createElement('span');
    miniature.className = 'theme-miniature';
    miniature.setAttribute('aria-hidden', 'true');
    miniature.innerHTML =
      '<span class="mini-header">orb <i></i></span><span class="mini-body"><span><b>Evidence</b><i></i><i></i></span><span><b>A clearer picture</b><i></i><i></i><i></i></span></span>';
    const label = document.createElement('span');
    label.className = 'theme-label';
    label.textContent = themes[id].name;
    const check = document.createElement('span');
    check.className = 'theme-check';
    check.textContent = '✓';
    check.setAttribute('aria-hidden', 'true');
    label.append(check);
    button.append(miniature, label);
    button.addEventListener('click', () => {
      appearance.themeId = id;
      apply();
    });
    grid.append(button);
  }
function apply() {
  const mode = resolveBrightness(appearance, system.matches);
  for (const [name, value] of Object.entries(appearanceVariables(appearance, mode)))
    root.style.setProperty(name, value);
  root.style.colorScheme = mode;
  root.dataset.style = appearance.themeId;
  root.dataset.mode = mode;
  if (style) style.value = appearance.themeId;
  if (brightness) brightness.value = appearance.mode;
  if (accent) accent.value = appearance.accent;
  const screenshot = `./workspace-${appearance.themeId}-${mode}.png`;
  document.querySelector('#workspace-image')?.setAttribute('src', screenshot);
  document.querySelector('#full-image')?.setAttribute('src', screenshot);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', appearancePalette(appearance, mode).palette.bg);
  for (const button of grid?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
    const id = button.dataset.style as Appearance['themeId'];
    button.setAttribute('aria-pressed', String(id === appearance.themeId));
    for (const [name, value] of Object.entries(appearanceVariables({ ...appearance, themeId: id }, mode)))
      button.style.setProperty(name, value);
  }
  try {
    localStorage.setItem(key, JSON.stringify(appearance));
  } catch {
    /* Storage may be disabled. */
  }
}
style?.addEventListener('change', () => {
  appearance.themeId = style.value as Appearance['themeId'];
  apply();
});
brightness?.addEventListener('change', () => {
  appearance.mode = brightness.value as Appearance['mode'];
  apply();
});
accent?.addEventListener('change', () => {
  appearance.accent = accent.value as Appearance['accent'];
  apply();
});
system.addEventListener('change', () => {
  if (appearance.mode === 'system') apply();
});
apply();
