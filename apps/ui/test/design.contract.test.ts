/**
 * P6.2 contract test against a REAL sidecar: a design card's own page (`/api/orb-design/frame`, orb-host) on the
 * authenticated gateway, through the UI's wire. The page is the card's current HTML with the bundled Chart.js and
 * the frame CSP as a response header; a rewrite shows at once; no cookie → 401, a foreign Origin or a cross-site
 * fetch → 403 (the gateway's admit fence, as for the asset routes); the P6.2 keys.keychain status answers `ready`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DESIGN_FRAME_CSP } from '@orb/shared';
import { startSidecar, type TestSidecar } from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';

let sc: TestSidecar;
let wire: Wire;
let canvasId: string;
let cardId: string;

const HTML_V1 =
  '<!doctype html><html><head><title>Chart</title></head><body><canvas id="c"></canvas>' +
  '<script>new Chart(document.getElementById("c"), {type: "line", data: {labels: [1], datasets: [{data: [1]}]}})</script>' +
  '</body></html>';

beforeAll(async () => {
  sc = await startSidecar();
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
  canvasId = (await wire.orb.canvas.create({ prompt: 'Design frames contract' })).id;
  const { events } = await wire.orb.board.command(canvasId, {
    type: 'card.added',
    card: { type: 'design', x: 0, y: 0, w: 400, h: 300, data: { title: 'Chart', html: HTML_V1, version: 1 } },
  });
  cardId = (events[0]!.data as { card: { id: string } }).card.id;
}, 120_000);
afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
});

describe('design frames over the gateway', () => {
  it("serves the card's page with the frame CSP and the bundled Chart.js; a new version shows at once", async () => {
    const url = wire.assets.designFrameUrl(canvasId, cardId, 1);
    expect(new URL(url).pathname).toBe('/api/orb-design/frame');
    const res = await sc.fetch(url, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBe(DESIGN_FRAME_CSP);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const page = await res.text();
    expect(page).toContain('data-orb-lib="chart"');
    expect(page).toContain('Chart.js v4.5.1');
    expect(page).toContain('new Chart(document.getElementById("c")');

    await wire.orb.board.command(canvasId, {
      type: 'card.updated',
      id: cardId,
      patch: { data: { title: 'Chart', html: '<p id="v2">second</p><script>d3.select("#v2")</script>', version: 2 } },
    });
    const v2 = await (await sc.fetch(wire.assets.designFrameUrl(canvasId, cardId, 2), {})).text();
    expect(v2).toContain('<p id="v2">second</p>');
    expect(v2).toContain('data-orb-lib="d3"');
    expect(v2).not.toContain('data-orb-lib="chart"');
  });

  it('refuses requests without the auth cookie (401), from another origin or cross-site (403)', async () => {
    const url = wire.assets.designFrameUrl(canvasId, cardId, 2);
    expect((await fetch(url)).status).toBe(401);
    const foreign = await fetch(url, { headers: { cookie: sc.headers.cookie!, origin: 'https://evil.example' } });
    expect(foreign.status).toBe(403);
    const crossSite = await fetch(url, { headers: { cookie: sc.headers.cookie!, 'sec-fetch-site': 'cross-site' } });
    expect(crossSite.status).toBe(403);
  });

  it('keys.keychain: the Keychain read is done', async () => {
    expect(await wire.orb.keys.keychain()).toEqual({ state: 'ready', waitingMs: 0 });
  });
});
