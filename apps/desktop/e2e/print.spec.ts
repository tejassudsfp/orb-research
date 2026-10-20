/// <reference lib="dom" />
/**
 * P4.4 print pipeline, in the real app, on the print fixture (scripts/testkit/printFixture.ts: one card of every
 * card type over 10 frames, links, a user note, real image/PDF assets, a scripted design frame, a Mermaid diagram):
 *
 * - Publish Port opens the composer; Export prints `/print/canvas` in a hidden window and stores the PDF in the
 *   canvas's `exports/` with a timestamped name: one page per frame (10 pages), every card type rendered, each
 *   card's marker text in the PDF (the diagram's label as vector text), the source and quote URLs as link
 *   annotations, the footer on every page, in under 15 s (BUILD_PLAN P4.4 performance);
 * - the design frame is snapshotted at 2x into `assets/snapshots/` (labelled with its capture time); P6.2: it is
 *   its own sidecar page, and the snapshot shows what its script drew (a painted corner and a Chart.js chart);
 * - the poster layout (night theme) is one page with every card; selected frames print only those frames;
 * - the research document (`/print/doc`) has every card type as a numbered figure, the open questions and the
 *   numbered source list with clickable links (Gate 4, P6.2: every card type in both export modes);
 * - Reveal in Finder only reveals exports of a canvas; no request leaves the sidecar origin.
 */
import { liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pdfToText } from '@orb/sources';
import { CardType } from '@orb/shared';
import {
  DESIGN_CHART_RGB,
  DESIGN_SCRIPT_RGB,
  PRINT_MARKERS,
  PRINT_URLS,
  seedPrintFixture,
  type PrintFixture,
} from '../../../scripts/testkit/printFixture.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';
import { timingExpect } from '../../../scripts/testkit/namespace.ts';

const desktopDir = resolve(import.meta.dirname, '..');
// P6.2: every type of the card-type list, not just the fixture's keys.
const ALL_TYPES = [...CardType.options].sort();

let app: ElectronApplication;
let page: Page;
let tmp: string;
let fixture: PrintFixture;
const offOrigin: string[] = [];

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-print-'));
  fixture = await seedPrintFixture(join(tmp, 'Orb'), { frames: 10 });
  app = await electron.launch({
    args: [desktopDir],
    env: {
      ...process.env,
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_HOME: join(tmp, 'Orb'),
      ORB_USER_DATA: join(tmp, 'electron'),
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  await page.waitForLoadState('domcontentloaded');
  const origin = new URL(page.url()).origin;
  // Every window (the hidden print windows too) may only reach the sidecar.
  await app.evaluate(({ session }) => {
    (globalThis as any).__orbRequests = [];
    session.defaultSession.webRequest.onCompleted((d) => (globalThis as any).__orbRequests.push(d.url));
  });
  page.on('request', (req) => {
    const url = req.url();
    if (!/^(data|blob|about):/.test(url) && !url.startsWith(origin)) offOrigin.push(url);
  });
  // Reveal in Finder is recorded instead of opening Finder during the test.
  await app.evaluate(({ shell }) => {
    (globalThis as any).__orbRevealed = [];
    (shell as any).showItemInFolder = (file: string) => (globalThis as any).__orbRevealed.push(file);
  });
  await page.evaluate((id) => (location.hash = `#/canvas/${id}`), fixture.canvasId);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
});

test.afterAll(async () => {
  await app?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const canvasDir = () => join(tmp, 'Orb', 'canvases', fixture.canvasId);

type Saved = {
  path: string;
  file: string;
  pages: number;
  expectedPages: number;
  cardTypes: Record<string, number>;
  snapshots: number;
  totalMs: number;
  clickMs: number;
};

async function exportWith(setup: () => Promise<void>): Promise<Saved> {
  await page.getByTestId('publish-port').click();
  const sheet = page.getByTestId('composer');
  await expect(sheet).toBeVisible();
  await setup();
  await page.getByTestId('composer-export').click();
  // PRD Port › Composer: the fixture's Must read source (frame 01, in every scope used here) is unopened, so Export
  // first warns; Continue anyway exports.
  const warning = page.getByTestId('composer-unread');
  await expect(warning).toBeVisible();
  await expect(warning.getByTestId('composer-unread-card')).toHaveAttribute(
    'data-card-id',
    fixture.cards.source,
  );
  await expect(page.getByTestId('composer-saved')).toHaveCount(0);
  const started = Date.now();
  await warning.getByTestId('composer-continue').click();
  await expect(warning).toHaveCount(0);
  const saved = page.getByTestId('composer-saved');
  await expect(saved).toBeVisible({ timeout: 60_000 });
  const clickMs = Date.now() - started;
  const attr = async (name: string) => (await saved.getAttribute(name))!;
  const out: Saved = {
    path: await attr('data-path'),
    file: await attr('data-file'),
    pages: Number(await attr('data-pages')),
    expectedPages: Number(await attr('data-expected-pages')),
    cardTypes: JSON.parse(await attr('data-card-types')),
    snapshots: Number(await attr('data-snapshots')),
    totalMs: Number(await attr('data-total-ms')),
    clickMs,
  };
  await page.getByTestId('composer-close').click();
  await expect(sheet).toHaveCount(0);
  return out;
}

/** The exported PDFs are kept under .orb-dev/e2e-results/print/ for a look. */
const keepDir = resolve(desktopDir, '..', '..', '.orb-dev', 'e2e-results', ...namespaceSegments(), 'print');

async function pdfOf(saved: Saved, keepAs?: string): Promise<{ bytes: Buffer; text: string; pages: number }> {
  expect(saved.file).toBe(join(canvasDir(), saved.path));
  if (keepAs) {
    mkdirSync(keepDir, { recursive: true });
    copyFileSync(saved.file, join(keepDir, `${keepAs}.pdf`));
  }
  const bytes = readFileSync(saved.file);
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  const extracted = await pdfToText(new Uint8Array(bytes), 'file:///export.pdf');
  return { bytes, text: extracted.text.replace(/\s+/g, ' '), pages: extracted.pdfPages ?? 0 };
}

function expectEveryCard(saved: Saved, text: string): void {
  expect(Object.keys(saved.cardTypes).sort()).toEqual(ALL_TYPES);
  for (const [type, marker] of Object.entries(PRINT_MARKERS))
    expect(text, `the ${type} card's text is in the PDF`).toContain(marker);
}

const linkUris = (bytes: Buffer): string[] =>
  [...bytes.toString('latin1').matchAll(/\/URI\s*\(([^)]*)\)/g)].map((m) => m[1]!);

test('Canvas PDF, one page per frame: 10 frames in under 15 s, every card type, links, footer, snapshot', async () => {
  const saved = await exportWith(async () => {
    await expect(page.getByTestId('composer-mode').locator('[data-value="canvas"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
  expect(saved.path).toMatch(/^exports\/canvas-\d{4}-\d{2}-\d{2}-\d{6}(-\d+)?\.pdf$/);
  // BUILD_PLAN P4.4 performance: a 10-frame PDF in under 15 s.
  timingExpect(() => {
    expect(saved.totalMs).toBeLessThan(15_000);
  });
  timingExpect(() => {
    expect(saved.clickMs).toBeLessThan(15_000);
  });
  console.log(`10-frame canvas PDF: ${saved.totalMs} ms (click to saved ${saved.clickMs} ms)`);

  const pdf = await pdfOf(saved, 'canvas-frames');
  expect(saved.expectedPages).toBe(10);
  expect(saved.pages).toBe(10);
  expect(pdf.pages).toBe(10);
  expectEveryCard(saved, pdf.text);
  // Footer: canvas title, frame, date, page number.
  expect(pdf.text).toContain(fixture.title);
  expect(pdf.text).toContain('01 Sources');
  expect(pdf.text).toContain('1 / 10');
  expect(pdf.text).toContain('10 / 10');
  // P6.1b: every page footer starts with the mark and the lowercase name.
  expect((pdf.text.match(/\borb\b/g) ?? []).length).toBeGreaterThanOrEqual(10);
  // Clickable source URLs (real <a> links survive printToPDF).
  const uris = linkUris(pdf.bytes);
  expect(uris).toContain(PRINT_URLS.source);
  expect(uris).toContain(PRINT_URLS.quote);
  // Images: the picture, the PDF thumbnail and the design snapshot.
  expect((pdf.bytes.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length).toBeGreaterThanOrEqual(3);

  // The design frame was snapshotted at 2x (640 CSS px wide → 1280 px) into assets/snapshots/.
  expect(saved.snapshots).toBe(1);
  const snaps = readdirSync(join(canvasDir(), 'assets', 'snapshots'));
  expect(snaps).toHaveLength(1);
  expect(snaps[0]).toMatch(new RegExp(`^${fixture.cards.design}-v2-\\d{13}\\.png$`));
  const snapPath = join(canvasDir(), 'assets', 'snapshots', snaps[0]!);
  const png = readFileSync(snapPath);
  mkdirSync(keepDir, { recursive: true });
  copyFileSync(snapPath, join(keepDir, 'design-snapshot.png'));
  expect(png.readUInt32BE(16)).toBe(1280);
  // P6.2: the frame's script ran before the snapshot: its painted corner and the Chart.js bars are in the picture.
  const pixels = await app.evaluate(({ nativeImage }, file) => {
    const img = nativeImage.createFromPath(file);
    const { width, height } = img.getSize();
    const bgra = img.toBitmap();
    const at = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return [bgra[i + 2], bgra[i + 1], bgra[i]];
    };
    let chart = 0;
    for (let y = 0; y < height; y += 2)
      for (let x = 0; x < width; x += 2) {
        const [r, g, b] = at(x, y);
        if (Math.abs(r! - 37) < 12 && Math.abs(g! - 99) < 12 && Math.abs(b! - 235) < 12) chart++;
      }
    return { corner: at(width - 20, 20), chart };
  }, snapPath);
  const near = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 12);
  expect(near(pixels.corner as number[], DESIGN_SCRIPT_RGB), `corner ${pixels.corner}`).toBe(true);
  expect(pixels.chart, 'Chart.js bar pixels').toBeGreaterThan(500);
  expect(DESIGN_CHART_RGB).toEqual([37, 99, 235]);
  expect(pdf.text).toMatch(/Snapshot · .*· v2/);
});

test('Canvas PDF poster (night) is one page; selected frames print only those frames', async () => {
  const poster = await exportWith(async () => {
    await page.getByTestId('composer-layout').locator('[data-value="poster"]').click();
    await page.getByTestId('composer-theme').locator('[data-value="night"]').click();
  });
  const pdf = await pdfOf(poster, 'canvas-poster-night');
  expect(poster.pages).toBe(1);
  expect(pdf.pages).toBe(1);
  expectEveryCard(poster, pdf.text);
  expect(pdf.text).toContain('Whole board');

  const two = await exportWith(async () => {
    await page.getByTestId('composer-scope-frames').check();
    await page.locator(`[data-testid="composer-frame"][data-frame-id="${fixture.frameIds[0]}"]`).check();
    await page.locator(`[data-testid="composer-frame"][data-frame-id="${fixture.frameIds[3]}"]`).check();
  });
  const twoPdf = await pdfOf(two);
  expect(two.pages).toBe(2);
  expect(twoPdf.text).toContain(PRINT_MARKERS.source);
  expect(twoPdf.text).toContain(PRINT_MARKERS.diagram);
  expect(twoPdf.text).not.toContain(PRINT_MARKERS.note);
  expect(two.path).not.toBe(poster.path);
});

test('Research document: every card type as a numbered figure, open questions, numbered sources', async () => {
  const saved = await exportWith(async () => {
    await page.getByTestId('composer-mode').locator('[data-value="doc"]').click();
    await page.getByTestId('composer-document-format').selectOption('custom');
    await expect(page.getByTestId('composer-reading-view')).toBeVisible();
  });
  // PRD Non-functional › Exports: a research document in under 2 minutes (no model involved here).
  console.log(`[exports] research document PDF (${fixture.cardCount} cards, 10 frames): ${saved.clickMs} ms`);
  timingExpect(() => {
    expect(saved.clickMs).toBeLessThan(120_000);
  });
  expect(saved.path).toMatch(/^exports\/document-\d{4}-\d{2}-\d{2}-\d{6}(-\d+)?\.pdf$/);
  const pdf = await pdfOf(saved, 'document');
  expect(pdf.pages).toBeGreaterThanOrEqual(1);
  expectEveryCard(saved, pdf.text);
  const from = `From ${fixture.cardCount} cards in 10 frames`;
  for (const heading of [from, 'Sources', 'Open questions', 'Figure 1', 'Table 1'])
    expect(pdf.text).toContain(heading);
  expect(pdf.text).toMatch(/Page 1 of \d+/);
  // P6.1b: the running footer names the product, lowercase.
  expect(pdf.text).toContain('orb · ');
  const uris = linkUris(pdf.bytes);
  expect(uris).toContain(PRINT_URLS.source);
  expect(uris).toContain(PRINT_URLS.quote);
});

test('Reveal in Finder reveals exports only; nothing left the sidecar origin', async () => {
  const exportsDir = join(canvasDir(), 'exports');
  const files = readdirSync(exportsDir).filter((f) => f.endsWith('.pdf'));
  expect(files.length).toBeGreaterThanOrEqual(4);
  const file = join(exportsDir, files[0]!);
  const results = await page.evaluate(
    async ([good, bad]) => [
      await (window as any).orbNative.reveal(good),
      await (window as any).orbNative.reveal(bad),
      await (window as any).orbNative.reveal('/etc/hosts'),
    ],
    [file, join(canvasDir(), 'board.jsonl')],
  );
  expect(results).toEqual([true, false, false]);
  expect(await app.evaluate(() => (globalThis as any).__orbRevealed)).toEqual([file]);
  // The print page cannot be driven from the app window: capture and ready only answer print windows.
  expect(
    await page.evaluate(() => (window as any).orbNative.print.capture({ x: 0, y: 0, width: 10, height: 10 })),
  ).toBeNull();
  expect(existsSync(join(canvasDir(), 'exports'))).toBe(true);
  expect(offOrigin).toEqual([]);
  const host = new URL(page.url()).host;
  const requests: string[] = await app.evaluate(() => (globalThis as any).__orbRequests);
  expect(requests.length).toBeGreaterThan(0);
  const sidecar = (u: string) => {
    const url = new URL(u);
    return (url.protocol === 'http:' || url.protocol === 'ws:') && url.host === host;
  };
  expect(requests.filter((u) => !/^(data|blob|about|devtools):/.test(u) && !sidecar(u))).toEqual([]);
});
