import { appearancePalette, fontFamilies, type Appearance } from '@orb/shared';
/**
 * Diagram cards (BUILD_PLAN P3.8): Mermaid source rendered live with `mermaid.render`. Mermaid is exact-pinned
 * (apps/ui/package.json) and bundled by Vite into its own lazy chunk of the app, so it is served from the sidecar
 * like the rest of the UI: no CDN, no network.
 *
 * - `securityLevel: 'strict'`: Mermaid sanitises labels (DOMPurify) and drops click handlers; the app CSP blocks
 *   scripts anyway.
 * - Renders run one at a time (Mermaid keeps global state while it lays a diagram out) and are cached by source, so
 *   a card that remounts (zoom level change, scroll back into view) shows its SVG at once.
 * - A source Mermaid cannot parse yields an error message instead of an SVG; the temporary element Mermaid leaves
 *   behind on an error is removed.
 */
type MermaidApi = typeof import('mermaid').default;

let loading: Promise<MermaidApi> | undefined;
let queue: Promise<unknown> = Promise.resolve();
let seq = 0;

export type DiagramRender = { svg: string } | { error: string };

const CACHE_MAX = 64;
const cache = new Map<string, DiagramRender>();

/** Mermaid colours on the night board (the default) and on light print pages (P4.4). */
const THEMES = {
  night: {
    darkMode: true,
    background: '#11171D',
    primaryColor: '#1A2442',
    primaryTextColor: '#F9FCFE',
    primaryBorderColor: '#3D5DCF',
    secondaryColor: '#11171D',
    tertiaryColor: '#03050C',
    lineColor: '#60A5FA',
    textColor: '#F9FCFE',
    mainBkg: '#1A2442',
    nodeBorder: '#3D5DCF',
    clusterBkg: 'rgba(61,93,207,0.08)',
    clusterBorder: 'rgba(61,93,207,0.75)',
    edgeLabelBackground: '#11171D',
    actorBkg: '#1A2442',
    actorBorder: '#3D5DCF',
    actorTextColor: '#F9FCFE',
    signalColor: '#60A5FA',
    signalTextColor: '#F9FCFE',
    noteBkgColor: '#F9FCFE',
    noteTextColor: '#11171D',
  },
  light: {
    darkMode: false,
    background: '#F9FCFE',
    primaryColor: '#E8EEFB',
    primaryTextColor: '#11171D',
    primaryBorderColor: '#3D5DCF',
    secondaryColor: '#F9FCFE',
    tertiaryColor: '#F1F5FD',
    lineColor: '#2563EB',
    textColor: '#11171D',
    mainBkg: '#E8EEFB',
    nodeBorder: '#3D5DCF',
    clusterBkg: 'rgba(61,93,207,0.06)',
    clusterBorder: 'rgba(61,93,207,0.6)',
    edgeLabelBackground: '#F9FCFE',
    actorBkg: '#E8EEFB',
    actorBorder: '#3D5DCF',
    actorTextColor: '#11171D',
    signalColor: '#2563EB',
    signalTextColor: '#11171D',
    noteBkgColor: '#11171D',
    noteTextColor: '#F9FCFE',
  },
} as const;

export type DiagramTheme = keyof typeof THEMES;
let theme: DiagramTheme = 'night';
let configuredTheme: string | undefined;

/**
 * Pick the default diagram colours (P4.4: a light print page uses `light`). Interactive views pass their appearance
 * explicitly. Cache entries include the palette, so switching appearance never reuses the wrong SVG.
 */
export function setDiagramTheme(next: DiagramTheme): void {
  if (next === theme) return;
  theme = next;
}

function load(selected: DiagramTheme, workspace?: Appearance): Promise<MermaidApi> {
  loading ??= import('mermaid').then(({ default: mermaid }) => mermaid);
  return loading.then((mermaid) => {
    const identity = `${selected}:${JSON.stringify(workspace)}`;
    if (configuredTheme === identity) return mermaid;
    const colors = workspace
      ? appearancePalette(workspace, selected === 'night' ? 'dark' : 'light')
      : undefined;
    const custom = colors
      ? {
          background: colors.palette.surface,
          primaryColor: colors.palette.surface,
          primaryTextColor: colors.palette.text,
          primaryBorderColor: colors.accent.accent,
          secondaryColor: colors.palette.panel,
          tertiaryColor: colors.palette.bg,
          lineColor: colors.accent.link,
          textColor: colors.palette.text,
          mainBkg: colors.palette.surface,
          nodeBorder: colors.accent.accent,
          clusterBkg: colors.palette.panel,
          clusterBorder: colors.palette.lineStrong,
          edgeLabelBackground: colors.palette.surface,
          actorBkg: colors.palette.surface,
          actorTextColor: colors.palette.text,
          actorBorder: colors.accent.accent,
          signalColor: colors.accent.link,
          signalTextColor: colors.palette.text,
          noteBkgColor: colors.palette.panel,
          noteTextColor: colors.palette.text,
        }
      : {};
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: colors ? fontFamilies[colors.style.fonts.ui.family] : 'Geist, system-ui, sans-serif',
      htmlLabels: false,
      themeVariables: {
        fontFamily: colors ? fontFamilies[colors.style.fonts.ui.family] : 'Geist, system-ui, sans-serif',
        fontSize: '14px',
        ...THEMES[selected],
        ...custom,
      },
    });
    configuredTheme = identity;
    return mermaid;
  });
}

/** The cached render of `source`, if any (for a synchronous first paint). */
export const cachedDiagram = (
  source: string,
  selected: DiagramTheme = theme,
  workspace?: Appearance,
): DiagramRender | undefined => cache.get(`${selected}:${JSON.stringify(workspace)}:${source}`);

/** Render Mermaid `source` to SVG text (queued; cached by source). Never rejects. */
export function renderDiagram(
  source: string,
  selected: DiagramTheme = theme,
  workspace?: Appearance,
): Promise<DiagramRender> {
  const key = `${selected}:${JSON.stringify(workspace)}:${source}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const run = queue.then(async (): Promise<DiagramRender> => {
    const again = cache.get(key);
    if (again) return again;
    const id = `orb-diagram-${++seq}`;
    let result: DiagramRender;
    try {
      const mermaid = await load(selected, workspace);
      const { svg } = await mermaid.render(id, source);
      result = { svg };
    } catch (err) {
      result = { error: firstLine((err as Error)?.message) };
    } finally {
      // On a parse error Mermaid can leave its scratch element (`d<id>`) or an error SVG in the body.
      for (const leftover of [document.getElementById(`d${id}`), document.getElementById(id)])
        leftover?.remove();
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

function firstLine(message: string | undefined): string {
  const line = (message ?? '').split('\n').find((l) => l.trim()) ?? '';
  return line.trim().slice(0, 200) || 'Mermaid could not read this diagram';
}
