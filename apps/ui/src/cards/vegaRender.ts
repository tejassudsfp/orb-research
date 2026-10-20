/**
 * Draws a Vega-Lite chart spec to SVG text in the renderer (P6.4). vega, vega-lite and vega-interpreter are
 * exact-pinned (apps/ui/package.json) and bundled by Vite into one lazy chunk served by the sidecar like the rest of
 * the app: no CDN, no network.
 *
 * CSP: the app's `script-src` has no 'unsafe-eval'. Vega normally compiles its expressions with `new Function`, which
 * that CSP blocks. This module parses with `{ast: true}` and runs the View with vega-interpreter's expression
 * interpreter instead, so no code is ever generated at run time (verified in e2e: no CSP violation; HARNESS_NOTES P6.4).
 *
 * Renders run one at a time and are cached by spec + theme, so a card that remounts shows its SVG at once. Never rejects.
 */
export type ChartRender = { svg: string } | { error: string };

const CACHE_MAX = 96;
const cache = new Map<string, ChartRender>();
let queue: Promise<unknown> = Promise.resolve();
let loading: Promise<{ vega: typeof import('vega'); compile: typeof import('vega-lite').compile; interp: typeof import('vega-interpreter').expressionInterpreter }> | undefined;

function load() {
  loading ??= Promise.all([import('vega'), import('vega-lite'), import('vega-interpreter')]).then(([vega, vl, interp]) => ({
    vega,
    compile: vl.compile,
    interp: interp.expressionInterpreter,
  }));
  return loading;
}

/** The cached render of `spec`, if any (for a synchronous first paint). */
export const cachedChart = (spec: object): ChartRender | undefined => cache.get(JSON.stringify(spec));

/** Draw a Vega-Lite spec to SVG text (queued; cached by spec). */
export function renderChart(spec: object): Promise<ChartRender> {
  const key = JSON.stringify(spec);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const run = queue.then(async (): Promise<ChartRender> => {
    const again = cache.get(key);
    if (again) return again;
    let result: ChartRender;
    try {
      const { vega, compile, interp } = await load();
      const vg = compile(spec as Parameters<typeof compile>[0]).spec;
      const runtime = vega.parse(vg, undefined, { ast: true });
      const view = new vega.View(runtime, { renderer: 'none', expr: interp, logLevel: vega.Error });
      const svg = await view.toSVG();
      view.finalize();
      result = { svg };
    } catch (err) {
      result = { error: ((err as Error)?.message ?? 'the chart could not be drawn').split('\n')[0]!.slice(0, 200) };
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}
