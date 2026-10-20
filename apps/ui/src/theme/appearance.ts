import { createContext, useContext } from 'react';
import { appearanceVariables, resolveBrightness, type Appearance, type ThemeMode } from '@orb/shared';

/** Undefined outside the interactive app, where print owns its explicit palette. */
export const AppearanceContext = createContext<ThemeMode | undefined>(undefined);
export const useAppearance = () => useContext(AppearanceContext);

export const WorkspaceAppearanceContext = createContext<Appearance | undefined>(undefined);
export const useWorkspaceAppearance = () => useContext(WorkspaceAppearanceContext);

/** Apply flat theme surfaces before paint, without remounting readers, editors or running research. */
export function applyAppearance(appearance: Appearance, systemDark: boolean): ThemeMode {
  const mode = resolveBrightness(appearance, systemDark);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(appearanceVariables(appearance, mode)))
    root.style.setProperty(key, value);
  root.style.colorScheme = mode;
  root.dataset.theme = mode === 'light' ? 'day' : 'night';
  root.dataset.style = appearance.themeId;
  root.dataset.brightness = appearance.mode;
  return mode === 'light' ? 'day' : 'night';
}
