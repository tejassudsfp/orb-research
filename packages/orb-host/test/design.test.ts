/**
 * P6.2 interactive design frames: the page orb-host serves for a design card (`/api/orb-design/frame`), called with
 * WHATWG Requests. Its CSP header, the libraries it inlines (exact pins, nothing that ends a script early), where the
 * head goes, and the error answers. The real window (scripts run, no network, print snapshot) is
 * apps/desktop/e2e/builder.spec.ts and print.spec.ts; the gateway's auth over the wire is
 * apps/ui/test/design.contract.test.ts.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CanvasStore } from '@orb/canvas';
import {
  DESIGN_FRAME_CSP,
  DESIGN_FRAME_PATH,
  DESIGN_FRAME_READY,
  designFrameQuery,
  type CanvasMeta,
} from '@orb/shared';
import {
  DESIGN_LIB_VERSIONS,
  designFramePage,
  designLib,
  handleDesignFrame,
  libsUsedBy,
} from '../src/design.js';

const repo = resolve(import.meta.dirname, '..', '..', '..');

describe('the bundled libraries', () => {
  it('are the exact pins of @orb/host, read from node_modules', () => {
    const pkg = JSON.parse(readFileSync(join(repo, 'packages', 'orb-host', 'package.json'), 'utf8'));
    expect(pkg.dependencies['chart.js']).toBe(DESIGN_LIB_VERSIONS.chart);
    expect(pkg.dependencies.d3).toBe(DESIGN_LIB_VERSIONS.d3);
    const chart = designLib('chart');
    const d3 = designLib('d3');
    expect(chart).toContain(`Chart.js v${DESIGN_LIB_VERSIONS.chart}`);
    expect(d3).toContain(`version="${DESIGN_LIB_VERSIONS.d3}"`);
    for (const text of [chart, d3]) {
      expect(text).not.toMatch(/<\/script|<!--/i);
      expect(text).not.toMatch(/sourceMappingURL/);
      // No CDN or other URL the library would load by itself.
      expect(text).not.toMatch(/https?:\/\/cdn|unpkg\.com|jsdelivr/);
    }
  });

  it('are inlined only when the screen uses them', () => {
    expect(libsUsedBy('<p>static</p>')).toEqual([]);
    expect(libsUsedBy('<script>new Chart(c, cfg)</script>')).toEqual(['chart']);
    expect(libsUsedBy('<script>Chart.register()</script>')).toEqual(['chart']);
    expect(libsUsedBy('<script>d3.select("svg")</script>')).toEqual(['d3']);
    expect(libsUsedBy('<style>p{color:#d3d3d3}</style><p>Chart of sales</p>')).toEqual([]);
    expect(libsUsedBy('<script>d3 . scaleLinear(); new  Chart(x)</script>').sort()).toEqual(['chart', 'd3']);
    // Any use inside a script counts (agents are told both are preloaded).
    expect(libsUsedBy('<script>new window.Chart(c, cfg)</script>')).toEqual(['chart']);
    expect(libsUsedBy('<script>const { select, scaleLinear } = d3;</script>')).toEqual(['d3']);
    expect(libsUsedBy('<script>var c = "#d3d3d3"; var chart = 1;</script>')).toEqual([]);
  });
});

describe('designFramePage', () => {
  const lib = (name: string) => `/*${name}-lib*/`;
  it('puts the charset, the libraries and the bootstrap at the top of the head, before the agent markup', () => {
    const page = designFramePage(
      '<!doctype html><html lang="en"><head><title>T</title><script>new Chart(a)</script></head><body>x</body></html>',
      { lib },
    );
    expect(page.startsWith('<!doctype html><html lang="en"><head>\n<meta charset="utf-8">')).toBe(true);
    const libAt = page.indexOf('/*chart-lib*/');
    const bootAt = page.indexOf('data-orb-bootstrap');
    const agentAt = page.indexOf('<script>new Chart(a)');
    expect(libAt).toBeGreaterThan(0);
    expect(bootAt).toBeGreaterThan(libAt);
    expect(agentAt).toBeGreaterThan(bootAt);
    expect(page).toContain(JSON.stringify(DESIGN_FRAME_READY));
    expect(page).not.toContain('/*d3-lib*/');
  });

  it('adds a doctype and a head where the screen has none', () => {
    expect(designFramePage('<p>hi</p>', { lib })).toMatch(
      /^<!doctype html><html><head>\n<meta charset="utf-8">[\s\S]*<\/head><p>hi<\/p><\/html>$/,
    );
    expect(designFramePage('<html><body>b</body></html>', { lib })).toMatch(
      /^<!doctype html><html><head>\n[\s\S]*<\/head><body>b<\/body><\/html>$/,
    );
    expect(designFramePage('<!-- c --><!DOCTYPE html><body>b</body>', { lib })).toMatch(
      /^<!-- c --><!DOCTYPE html><html><head>/,
    );
  });

  it('turns animations off for print', () => {
    expect(designFramePage('<p>x</p>', { lib, print: true })).toContain('var print = true;');
    expect(designFramePage('<p>x</p>', { lib, print: true })).toContain('::-webkit-scrollbar{display:none}');
    expect(designFramePage('<p>x</p>', { lib })).not.toContain('scrollbar');
    expect(designFramePage('<p>x</p>', { lib })).toContain('var print = false;');
  });
});

describe(`GET ${DESIGN_FRAME_PATH}`, () => {
  let home: string;
  let store: CanvasStore;
  let canvas: CanvasMeta;
  let designId: string;
  let noteId: string;
  const HTML = '<!doctype html><html><head><title>Chart</title></head><body><canvas id="c"></canvas>' +
    '<script>new Chart(document.getElementById("c"), {type: "bar", data: {labels: ["a"], datasets: [{data: [1]}]}})</script></body></html>';
  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), 'orb-host-design-'));
    store = new CanvasStore({ home, searchIndex: false });
    canvas = await store.create({ prompt: 'frames' });
    const added = await store.command(
      canvas.id,
      {
        type: 'card.added',
        card: { type: 'design', frameId: null, x: 0, y: 0, w: 400, h: 300, data: { title: 'Chart', html: HTML, version: 3 } },
      } as never,
      { kind: 'agent', agent: 'builder', model: 'm', sessionId: 's' },
    );
    designId = (added.data as { card: { id: string } }).card.id;
    const note = await store.command(canvas.id, {
      type: 'card.added',
      card: { type: 'note', frameId: null, x: 500, y: 0, w: 200, h: 100, data: { title: 'n' } },
    } as never);
    noteId = (note.data as { card: { id: string } }).card.id;
  });
  afterEach(async () => {
    await store.close();
    rmSync(home, { recursive: true, force: true });
  });

  const get = (query: string, method = 'GET') =>
    handleDesignFrame(store, new Request(`http://127.0.0.1:1${DESIGN_FRAME_PATH}?${query}`, { method }));

  it("serves the card's HTML as its own page under the frame CSP, with Chart.js inlined", async () => {
    const res = await get(designFrameQuery(canvas.id, designId, 3));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('content-security-policy')).toBe(DESIGN_FRAME_CSP);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const page = await res.text();
    expect(Number(res.headers.get('content-length'))).toBe(Buffer.byteLength(page));
    expect(page).toContain('data-orb-lib="chart"');
    expect(page).not.toContain('data-orb-lib="d3"');
    expect(page).toContain('<title>Chart</title>');
    expect(page).toContain('new Chart(document.getElementById("c")');
    const head = await get(designFrameQuery(canvas.id, designId, 3), 'HEAD');
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('the CSP allows inline scripts and nothing on the network', () => {
    const directives = Object.fromEntries(
      DESIGN_FRAME_CSP.split(';').map((d) => {
        const [name, ...values] = d.trim().split(/\s+/);
        return [name, values.join(' ')];
      }),
    );
    expect(directives.sandbox).toBe('allow-scripts');
    expect(directives['default-src']).toBe("'none'");
    expect(directives['script-src']).toBe("'unsafe-inline'");
    expect(directives['connect-src']).toBe("'none'");
    for (const d of ['img-src', 'font-src', 'media-src']) expect(directives[d]).not.toMatch(/http|'self'|\*/);
    for (const d of ['frame-src', 'worker-src', 'object-src', 'form-action', 'base-uri'])
      expect(directives[d]).toBe("'none'");
  });

  it('prints with animations off', async () => {
    const page = await (await get(designFrameQuery(canvas.id, designId, 3, { print: true }))).text();
    expect(page).toContain('var print = true;');
  });

  it('answers 404 for a card that is not a design frame or does not exist, 400 for bad args, 405 for POST', async () => {
    for (const query of [
      designFrameQuery(canvas.id, noteId, 1),
      designFrameQuery(canvas.id, 'c_missing', 1),
      designFrameQuery('nosuchcanvas', designId, 1),
    ]) {
      const res = await get(query);
      expect(res.status, query).toBe(404);
      expect(res.headers.get('content-security-policy')).toBe(DESIGN_FRAME_CSP);
    }
    expect((await get(`canvas=${canvas.id}&card=../x`)).status).toBe(400);
    expect((await get(`card=${designId}`)).status).toBe(400);
    expect((await get(designFrameQuery(canvas.id, designId, 1), 'POST')).status).toBe(405);
  });
});
