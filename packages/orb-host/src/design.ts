/**
 * Interactive design frames (P6.2 card platform; PRD Card types › Design frames). A design card's HTML is served by
 * the sidecar as its OWN page, so it carries its own Content-Security-Policy instead of inheriting the app's (a
 * `srcdoc` document inherits the embedder's policy and its scripts never ran: HARNESS_NOTES §P3.8):
 *
 *   `GET|HEAD /api/orb-design/frame?canvas=<id>&card=<cardId>&v=<version>[&print=1]`
 *
 * an exact Fetch route on the gateway's authenticated `/api` channel (`ctx.connection.fetch.register`, like the
 * asset routes: the Host/Origin fence and the auth cookie admit the request first). The page is the card's HTML
 * (from the board, so undo and a rewrite show at once) with, in front of the agent's own markup:
 *
 * - the bundled **Chart.js 4.5.1** (global `Chart`) and **D3 7.9.0** (global `d3`), inlined only when the HTML uses
 *   them (exact-pinned dependencies of @orb/host, read from node_modules; never a CDN);
 * - a small bootstrap that posts `DESIGN_FRAME_READY` to the parent once the page has loaded and drawn (the print
 *   window waits for it before a snapshot), posts `DESIGN_FRAME_ESCAPE` on Escape (the reader closes even with the
 *   focus inside the frame), and turns Chart.js animations off when printing or with Reduce Motion.
 *
 * Headers: `DESIGN_FRAME_CSP` (`sandbox allow-scripts`, inline scripts only, `connect-src 'none'`, no remote
 * anything), `nosniff`, no referrer, `no-store`. Electron main also forces that CSP on this path and allows only this
 * path in the app's `frame-src` (apps/desktop/src/main/security.ts).
 *
 * Harness-free: the handler takes a `CanvasStore` and a WHATWG Request, so tests call it directly.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { CanvasStore } from '@orb/canvas';
import { isCanvasError } from '@orb/canvas';
import {
  CanvasId,
  DESIGN_FRAME_CSP,
  DESIGN_FRAME_ESCAPE,
  DESIGN_FRAME_PATH,
  DESIGN_FRAME_READY,
  DesignData,
  readCardData,
} from '@orb/shared';

export { DESIGN_FRAME_PATH };

/** The libraries a design frame may use, by global name. */
export type DesignLib = 'chart' | 'd3';

/** Exact versions of the bundled libraries (package.json pins; asserted by the tests). */
export const DESIGN_LIB_VERSIONS: Record<DesignLib, string> = { chart: '4.5.1', d3: '7.9.0' };

const require = createRequire(import.meta.url);

/** Where each library's single-file browser build lives (both export no package.json, so resolve the entry). */
function libFile(lib: DesignLib): string {
  if (lib === 'chart') return join(dirname(require.resolve('chart.js')), 'chart.umd.min.js');
  return join(dirname(require.resolve('d3')), '..', 'dist', 'd3.min.js');
}

const libCache = new Map<DesignLib, string>();

/**
 * A library's source, ready to inline in a `<script>`: its source-map comment removed (DevTools would ask the
 * network for it). Throws if the text could end the script element early (checked by the tests for the pinned
 * builds).
 */
export function designLib(lib: DesignLib): string {
  let text = libCache.get(lib);
  if (text === undefined) {
    text = readFileSync(libFile(lib), 'utf8').replace(/\n?\/\/# sourceMappingURL=\S*\s*$/u, '\n');
    if (/<\/script|<!--/i.test(text)) throw new Error(`design frame library ${lib} cannot be inlined`);
    libCache.set(lib, text);
  }
  return text;
}

/**
 * The libraries an HTML screen uses: any `Chart` / `d3` identifier inside its scripts (`window.Chart`,
 * `const { select } = d3`…), or `new Chart(` / `Chart.` / `d3.` anywhere (inline handlers). Agents are told both
 * are preloaded, so a miss would break the frame; an extra inline only costs bytes.
 */
export function libsUsedBy(html: string): DesignLib[] {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((m) => m[1]).join('\n');
  const out: DesignLib[] = [];
  if (/\bChart\b/.test(scripts) || /\bnew\s+Chart\b|\bChart\s*\./.test(html)) out.push('chart');
  if (/(?<![\w$#])d3(?![\w$])/.test(scripts) || /\bd3\s*\./.test(html)) out.push('d3');
  return out;
}

/** The bootstrap that runs before the agent's own scripts. */
function bootstrap(print: boolean): string {
  return [
    '(function () {',
    `  var print = ${print ? 'true' : 'false'};`,
    "  var still = print || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);",
    '  if (still && window.Chart && Chart.defaults) Chart.defaults.animation = false;',
    '  function tell(type) {',
    "    try { parent.postMessage({ type: type }, '*'); } catch (e) {}",
    '  }',
    `  function ready() { tell(${JSON.stringify(DESIGN_FRAME_READY)}); }`,
    "  addEventListener('keydown', function (e) {",
    `    if (e.key === 'Escape') tell(${JSON.stringify(DESIGN_FRAME_ESCAPE)});`,
    '  });',
    "  addEventListener('load', function () {",
    '    requestAnimationFrame(function () { requestAnimationFrame(ready); });',
    '  });',
    '})();',
  ].join('\n');
}

/**
 * The page of a design frame: the agent's HTML with the charset, the used libraries and the bootstrap inserted at
 * the top of its `<head>` (or where the head would start), and a doctype when it had none (standards mode, as the
 * P3.8 srcdoc had). Not a sanitiser: the CSP and the sandbox are the boundary.
 */
export function designFramePage(
  html: string,
  options: { print?: boolean; lib?: (lib: DesignLib) => string } = {},
): string {
  const lib = options.lib ?? designLib;
  const head = [
    '<meta charset="utf-8">',
    '<meta name="referrer" content="no-referrer">',
    ...libsUsedBy(html).map((l) => `<script data-orb-lib="${l}">${lib(l)}</script>`),
    `<script data-orb-bootstrap>${bootstrap(options.print === true)}</script>`,
    // A snapshot shows the screen, not a scrollbar.
    ...(options.print ? ['<style data-orb-print>::-webkit-scrollbar{display:none}</style>'] : []),
  ].join('\n');
  const doctype = /^\s*(<!--[\s\S]*?-->\s*)*<!doctype\b[^>]*>/i.exec(html);
  const body = doctype ? html.slice(doctype[0].length) : html;
  const prefix = doctype ? doctype[0] : '<!doctype html>';
  const headTag = /<head\b[^>]*>/i.exec(body);
  if (headTag) {
    const at = headTag.index + headTag[0].length;
    return `${prefix}${body.slice(0, at)}\n${head}\n${body.slice(at)}`;
  }
  const htmlTag = /<html\b[^>]*>/i.exec(body);
  if (htmlTag) {
    const at = htmlTag.index + htmlTag[0].length;
    return `${prefix}${body.slice(0, at)}<head>\n${head}\n</head>${body.slice(at)}`;
  }
  return `${prefix}<html><head>\n${head}\n</head>${body}</html>`;
}

/** Response headers of a design frame page (and of its error answers). */
export function designFrameHeaders(length?: number): Record<string, string> {
  return {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': DESIGN_FRAME_CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-resource-policy': 'same-origin',
    'cache-control': 'no-store',
    ...(length !== undefined ? { 'content-length': String(length) } : {}),
  };
}

const CARD_ID = /^c_[A-Za-z0-9_-]{1,64}$/;

function answer(status: number, text: string, head: boolean): Response {
  const page = `<!doctype html><title>${text}</title><p style="font:13px sans-serif;color:#888">${text}</p>`;
  const bytes = Buffer.byteLength(page);
  return new Response(head ? null : page, { status, headers: designFrameHeaders(bytes) });
}

/** `GET|HEAD /api/orb-design/frame`. */
export async function handleDesignFrame(store: CanvasStore, request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  const head = request.method === 'HEAD';
  const url = new URL(request.url);
  const canvas = CanvasId.safeParse(url.searchParams.get('canvas'));
  const cardId = url.searchParams.get('card') ?? '';
  if (!canvas.success || !CARD_ID.test(cardId)) return answer(400, 'Bad request', head);
  let html: string | undefined;
  try {
    const card = (await store.board(canvas.data)).card(cardId);
    if (card?.type === 'design') html = readCardData(DesignData, card.data)?.html;
  } catch (err) {
    if (isCanvasError(err)) return answer(404, 'No such design frame', head);
    throw err;
  }
  if (!html) return answer(404, 'No such design frame', head);
  const page = designFramePage(html, { print: url.searchParams.get('print') === '1' });
  const bytes = Buffer.byteLength(page);
  return new Response(head ? null : page, { status: 200, headers: designFrameHeaders(bytes) });
}

/** Register the design-frame route on the connection (call inside `ctx.inject(['connection'], …)`). */
export function registerDesignRoutes(ctx: any, store: CanvasStore): void {
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: DESIGN_FRAME_PATH,
        methods: ['GET', 'HEAD'],
        requestBody: 'buffered',
        fetch: (request: Request) => handleDesignFrame(store, request),
      }),
    'orb-host: design frame route',
  );
}
