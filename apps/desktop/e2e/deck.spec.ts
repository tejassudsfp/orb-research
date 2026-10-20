/// <reference lib="dom" />
/**
 * P6.17 Presentations, in the real app, on the print fixture (scripts/testkit/printFixture.ts: one card of each type over
 * 5 frames; the source card is Must read and unopened) with the mock LLM as Orb's model:
 *
 * - Publish Port → Slides → Compose warns about the unread Must read card (Continue anyway); Orb's compose turn: an
 *   uncited slide is refused, the cited slides land one by one in the composer, and `deck/deck.json` is saved;
 * - Export PDF slides: one 16:9 page per slide plus the Sources slide (printToPDF), the slide titles and the citation
 *   numbers in the text, the design frame snapshotted (a picture on its slide), clickable source links;
 * - the slide view: the filmstrip, edit (citations kept), reorder (buttons), delete, add a slide of your own, and
 *   regenerate one slide through chat with a change asked for;
 * - Export PowerPoint: the .pptx is unzipped and checked (slide count with the Sources slide, a native chart part with its
 *   embedded workbook, a native table, the design snapshot and the image as pictures, citations in the speaker notes).
 */
import { liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';
import WebSocket from 'ws';
import { createWire } from '../../ui/src/wire/index.js';
import { pdfToText } from '@orb/sources';
import type { Deck } from '@orb/shared';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { PRINT_URLS, seedPrintFixture, type PrintFixture } from '../../../scripts/testkit/printFixture.ts';
import { axeScan, contrastScan, formatContrast, formatViolations } from './support/a11y.ts';

const desktopDir = resolve(import.meta.dirname, '..');

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
let fixture: PrintFixture;

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-deck-'));
  fixture = await seedPrintFixture(join(tmp, 'Orb'), { frames: 5, title: 'Deck fixture board' });
  llm = await new MockLlm({ defaultTurn: { text: 'Done.' } }).start();
  const patchFile = join(tmp, 'mock.patch.yml');
  writeFileSync(patchFile, mockProviderPatch(llm.baseURL));
  app = await electron.launch({
    args: [desktopDir],
    env: {
      ...process.env,
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_HOME: join(tmp, 'Orb'),
      ORB_USER_DATA: join(tmp, 'electron'),
      ORB_EXTRA_PATCH_FILE: patchFile,
      [MOCK_KEY_ENV]: 'orb-mock-key',
    } as Record<string, string>,
  });
  page = await liveWindow(app);
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({ shell }) => {
    (shell as any).showItemInFolder = () => undefined;
  });
  await page.evaluate((id) => (location.hash = `#/canvas/${id}`), fixture.canvasId);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  const baseUrl = new URL(page.url()).origin + '/';
  const cookies = await page.context().cookies(baseUrl);
  const wire = createWire({
    baseUrl,
    createSocket: (url) => new WebSocket(url),
    fetch: (input, init) => {
      const headers = new Headers(init.headers);
      headers.set('cookie', cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '));
      headers.set('origin', new URL(baseUrl).origin);
      return fetch(input, { ...init, headers });
    },
  });
  try {
    await wire.orb.board.command(fixture.canvasId, {
      type: 'card.updated',
      id: fixture.cards.table,
      patch: {
        data: {
          title: 'Detailed evidence comparison',
          columns: ['Option', 'Cost', 'Evidence', 'Constraints', 'Basis'],
          totalRows: 4,
          rows: Array.from({ length: 4 }, (_, i) => [
            `Option ${i + 1}`,
            ...Array.from(
              { length: 4 },
              (_, j) =>
                `Scenario ${i + 1}, field ${j + 1}: ${'Evidence, assumptions and alternatives need explicit qualification. '.repeat(3)}${i === 3 && j === 3 ? 'Complete table final cell.' : ''}`,
            ),
          ]),
        },
      },
    });
  } finally {
    wire.dispose();
  }
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** `ORB_UPDATE_SCREENS=1`: write docs/screens/p6.17-<name>.png (1440x900) for a visual check. */
async function capture(name: string) {
  if (process.env.ORB_UPDATE_SCREENS !== '1') return;
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900);
    await new Promise((r) => setTimeout(r, 400));
  });
  await page.screenshot({ path: join(desktopDir, '..', '..', 'docs', 'screens', `p6.17-${name}.png`) });
}

const canvasDir = () => join(tmp, 'Orb', 'canvases', fixture.canvasId);
const storedDeck = (): Deck => JSON.parse(readFileSync(join(canvasDir(), 'deck', 'deck.json'), 'utf8'));

function enqueueCompose() {
  const c = fixture.cards;
  llm.enqueue(
    {
      toolCalls: [
        {
          id: 'call_uncited',
          name: 'compose_slides',
          arguments: {
            slides: [
              { slideId: 'summary', layout: 'bullets', title: 'Uncitedslide', bullets: ['x'], cardIds: [] },
            ],
          },
        },
        {
          id: 'call_deck',
          name: 'compose_slides',
          arguments: {
            slides: [
              {
                slideId: 'title',
                layout: 'title',
                title: 'Deckcover title',
                subtitle: 'From the board',
                cardIds: [],
              },
              {
                slideId: 'summary',
                layout: 'bullets',
                title: 'Decksummary line',
                bullets: ['The market study sizes it', 'One quote says it best'],
                notes: 'Say it plainly.',
                cardIds: [c.source, c.quote],
              },
              {
                slideId: 'chart',
                layout: 'visual',
                title: 'Deckchart line',
                visualCardId: c.chart,
                caption: 'ARR by company',
                cardIds: [c.source],
              },
              {
                slideId: 'table',
                layout: 'two-column',
                title: 'Decktable line',
                bullets: ['Prices by plan'],
                visualCardId: c.table,
                caption: 'Plans',
                cardIds: [c.question],
              },
              {
                slideId: 'design',
                layout: 'visual',
                title: 'Deckdesign line',
                visualCardId: c.design,
                caption: 'The mockup',
                cardIds: [c.risk],
              },
              {
                slideId: 'image',
                layout: 'visual',
                title: 'Deckimage line',
                visualCardId: c.image,
                caption: 'A picture',
                cardIds: [c.image],
              },
              {
                slideId: 'metric',
                layout: 'visual',
                title: 'Deckmetric line',
                visualCardId: c.metric,
                caption: 'ARR',
                cardIds: [c.metric],
              },
              {
                slideId: 'matrix',
                layout: 'visual',
                title: 'Deckmatrix line',
                visualCardId: c.matrix,
                caption: 'Options',
                cardIds: [c.matrix],
              },
              {
                slideId: 'quote',
                layout: 'quote',
                title: 'Deckquote line',
                visualCardId: c.quote,
                cardIds: [c.quote],
              },
              {
                slideId: 'next',
                layout: 'bullets',
                title: 'Decknext line',
                bullets: ['Ask who pays first'],
                cardIds: [c.question],
              },
            ],
          },
        },
      ],
    },
    { text: 'The deck has ten slides.' },
  );
}

test('Compose warns about the unread Must read card; Orb writes the slides, an uncited slide is refused', async () => {
  await page.getByTestId('publish-port').click();
  await expect(page.getByTestId('composer')).toBeVisible();
  await page.getByTestId('composer-mode').locator('[data-value="deck"]').click();
  await expect(page.getByTestId('composer-deck-instructions')).toBeVisible();
  await page.getByTestId('composer-deck-instructions').fill('A ten minute walk through.');
  const before = llm.requests.length;
  await page.getByTestId('composer-compose-deck').click();
  const warning = page.getByTestId('composer-unread');
  await expect(warning).toBeVisible();
  expect(llm.requests.length).toBe(before);
  enqueueCompose();
  await warning.getByTestId('composer-continue').click();
  const progress = page.getByTestId('composer-deck-progress');
  await expect(progress).toHaveAttribute('data-phase', 'composed', { timeout: 30_000 });
  await expect(progress.getByTestId('composer-progress-slide')).toHaveCount(10);
  const req = await llm.waitForRequest((r) => r.id === before + 1);
  const prompt = JSON.stringify(req.body.messages);
  expect(prompt).toContain('Compose the slides');
  expect(prompt).toContain('A ten minute walk through.');
  const followUp = await llm.waitForRequest((r) => r.id === before + 2);
  expect(JSON.stringify(followUp.body.messages)).toContain('must cite at least one card');
  const deck = storedDeck();
  expect(deck.slides.map((s) => s.id)).toEqual([
    'title',
    'summary',
    'chart',
    'table',
    'design',
    'image',
    'metric',
    'matrix',
    'quote',
    'next',
  ]);
  expect(deck.slides.filter((s) => !['title'].includes(s.id)).every((s) => s.cardIds.length > 0)).toBe(true);
  expect(JSON.stringify(deck)).not.toContain('Uncitedslide');
  await expect(page.getByTestId('composer-deck-state')).toContainText('10 slides');
  await capture('composer-slides');
});

test('Export PDF slides: a 16:9 page per slide plus the Sources slide, titles, citations, links, the design snapshot', async () => {
  await page.getByTestId('composer-export').click();
  const saved = page.getByTestId('composer-saved');
  await expect(saved).toBeVisible({ timeout: 90_000 });
  expect(await saved.getAttribute('data-path')).toMatch(/^exports\/deck-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  // 10 slides and two Sources slides (10 cited cards, 8 to a slide).
  expect(Number(await saved.getAttribute('data-pages'))).toBe(12);
  expect(Number(await saved.getAttribute('data-expected-pages'))).toBe(12);
  expect(Number(await saved.getAttribute('data-snapshots'))).toBe(1);
  const file = (await saved.getAttribute('data-file'))!;
  const bytes = readFileSync(file);
  // 960 x 540 CSS px = 720 x 405 pt: every page is 16:9.
  const boxes = [...bytes.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
  expect(boxes.length).toBeGreaterThan(0);
  for (const m of boxes) expect(Number(m[1]) / Number(m[2])).toBeCloseTo(16 / 9, 2);
  const text = (await pdfToText(new Uint8Array(bytes), 'file:///deck.pdf')).text.replace(/\s+/g, ' ');
  for (const line of [
    'Deckcover title',
    'Decksummary line',
    'Deckchart line',
    'Decktable line',
    'Deckdesign line',
    'Deckmetric line',
    'Deckquote line',
    'Sources',
  ])
    expect(text, line).toContain(line);
  expect(text).not.toContain('Uncitedslide');
  expect(text).toContain('Complete table final cell.');
  const uris = [...bytes.toString('latin1').matchAll(/\/URI\s*\(([^)]*)\)/g)].map((m) => m[1]!);
  expect(uris).toContain(PRINT_URLS.source);
  await page.getByTestId('composer-close').click();
});

test('the slide view: edit keeps citations, reorder, delete, add a slide of your own, regenerate with a change', async () => {
  await page.evaluate((id) => (location.hash = `#/deck/${id}`), fixture.canvasId);
  const screen = page.getByTestId('deck-screen');
  await expect(screen).toHaveAttribute('data-state', 'composed');
  await expect(page.getByTestId('deck-thumb')).toHaveCount(10);
  await expect(page.getByTestId('deck-title')).toHaveText('Deck fixture board');
  await expect(page.getByTestId('back-to-canvas')).toBeVisible();
  // The first slide is shown; pick the summary.
  const thumb = (id: string) => page.locator(`[data-testid="deck-thumb"][data-slide-id="${id}"]`);
  await thumb('summary').click();
  await expect(page.getByTestId('deck-preview')).toHaveAttribute('data-slide-id', 'summary');
  await expect(page.getByTestId('deck-preview').getByTestId('slide-title')).toHaveText('Decksummary line');
  await expect(page.getByTestId('deck-cite')).toHaveCount(2);
  await expect(page.getByTestId('deck-cite').first()).toHaveAttribute(
    'href',
    `#/canvas/${fixture.canvasId}?focus=${fixture.cards.source}`,
  );

  // Edit.
  await capture('slide-view');
  await page.getByTestId('deck-edit-title').fill('Deckedited line');
  await page.getByTestId('deck-edit-bullets').fill('First point\nSecond point\nThird point');
  await page.getByTestId('deck-edit-notes').fill('Pause here.');
  await page.getByTestId('deck-save').click();
  await expect(page.getByTestId('deck-preview').getByTestId('slide-title')).toHaveText('Deckedited line');
  let deck = storedDeck();
  expect(deck.slides[1]).toMatchObject({
    title: 'Deckedited line',
    bullets: ['First point', 'Second point', 'Third point'],
    notes: 'Pause here.',
    edited: true,
    cardIds: [fixture.cards.source, fixture.cards.quote],
  });

  // Reorder with the buttons, then by drag.
  await page.getByTestId('deck-move-down').click();
  await expect
    .poll(() =>
      storedDeck()
        .slides.map((s) => s.id)
        .slice(0, 3),
    )
    .toEqual(['title', 'chart', 'summary']);
  await page.getByTestId('deck-move-up').click();
  await expect
    .poll(() =>
      storedDeck()
        .slides.map((s) => s.id)
        .slice(0, 3),
    )
    .toEqual(['title', 'summary', 'chart']);
  // Drag and drop of the filmstrip (HTML5 drag events, dispatched: a synthetic mouse drag does not start one off-screen).
  const drag = (from: string, to: string) =>
    page.evaluate(
      ([a, b]) => {
        const li = (id: string) =>
          document.querySelector(`[data-testid="deck-thumb"][data-slide-id="${id}"]`)!.closest('li')!;
        const dt = new DataTransfer();
        const fire = (el: Element, type: string) =>
          el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        fire(li(a!), 'dragstart');
        fire(li(b!), 'dragover');
        fire(li(b!), 'drop');
        fire(li(a!), 'dragend');
      },
      [from, to],
    );
  // Delay save responses after persistence: a second drop can arrive before the first response reaches React.
  // The screen must queue both intentions against their successive versions instead of rejecting the second.
  await page.route('**/api/orb/deck.save', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ response });
  });
  await drag('next', 'summary');
  await expect
    .poll(() =>
      storedDeck()
        .slides.map((s) => s.id)
        .slice(0, 3),
    )
    .toEqual(['title', 'next', 'summary']);
  await drag('next', 'image');
  await expect
    .poll(() =>
      storedDeck()
        .slides.map((s) => s.id)
        .indexOf('next'),
    )
    .toBeGreaterThan(3);
  await expect(screen).toHaveAttribute('data-version', String(storedDeck().version));
  await page.unroute('**/api/orb/deck.save');
  await expect(page.getByTestId('deck-error')).toHaveCount(0);

  await thumb('chart').click();
  await capture('slide-chart');
  await thumb('table').click();
  await expect
    .poll(() =>
      page.getByTestId('deck-preview').evaluate((root) => {
        const box = root.querySelector('[data-slide-visual]')!.getBoundingClientRect();
        const last = root.querySelector('tbody tr:last-child td:last-child')!.getBoundingClientRect();
        return last.bottom <= box.bottom + 1 && last.right <= box.right + 1 && last.top >= box.top;
      }),
    )
    .toBe(true);
  await capture('slide-table');
  // Delete the image slide; add a slide of your own.
  await thumb('image').click();
  await page.getByTestId('deck-delete').click();
  await expect(thumb('image')).toHaveCount(0);
  await page.getByTestId('deck-add').click();
  await expect(page.getByTestId('deck-thumb')).toHaveCount(10);
  deck = storedDeck();
  expect(deck.slides.at(-1)).toMatchObject({ userAuthored: true, title: 'New slide', cardIds: [] });
  expect(deck.slides.map((s) => s.id)).not.toContain('image');

  // Regenerate one slide through chat, with a change asked for.
  llm.enqueue(
    {
      toolCalls: [
        {
          id: 'call_regen',
          name: 'compose_slides',
          arguments: {
            slides: [
              {
                slideId: 'chart',
                layout: 'visual',
                title: 'Deckregen line',
                visualCardId: fixture.cards.chart,
                caption: 'Regenerated',
                cardIds: [fixture.cards.chart, fixture.cards.source],
              },
            ],
          },
        },
      ],
    },
    { text: 'Rewrote the slide.' },
  );
  const first = llm.requests.length;
  await thumb('chart').click();
  await page.getByTestId('deck-regenerate-input').fill('lead with the growth');
  await page.getByTestId('deck-regenerate').click();
  await expect(page.getByTestId('deck-preview').getByTestId('slide-title')).toHaveText('Deckregen line', {
    timeout: 30_000,
  });
  const req = await llm.waitForRequest((r) => r.id === first + 1);
  const prompt = JSON.stringify(req.body.messages);
  expect(prompt).toContain('Regenerate one slide');
  expect(prompt).toContain('lead with the growth');
  deck = storedDeck();
  expect(deck.slides.find((s) => s.id === 'chart')).toMatchObject({
    title: 'Deckregen line',
    cardIds: [fixture.cards.chart, fixture.cards.source],
  });
  expect(deck.slides.find((s) => s.id === 'summary')!.title).toBe('Deckedited line');
  // The Sources slide closes the strip.
  await page.getByTestId('deck-thumb-sources').click();
  await expect(page.getByTestId('deck-preview').getByTestId('slide-sources')).toBeVisible();
});

test('Export PowerPoint: native chart and table parts, pictures, citations in the notes, a Sources slide', async () => {
  await page.getByTestId('deck-export-pptx').click();
  const done = page.getByTestId('deck-exported');
  await expect(done).toBeVisible({ timeout: 90_000 });
  expect(await done.getAttribute('data-kind')).toBe('pptx');
  expect(await done.getAttribute('data-path')).toMatch(/^exports\/deck-\d{4}-\d{2}-\d{2}-\d{6}\.pptx$/);
  const file = (await done.getAttribute('data-file'))!;
  const deck = storedDeck();
  const zip = await JSZip.loadAsync(readFileSync(file));
  const names = Object.keys(zip.files);
  // 10 slides (one deleted, one added) and the Sources slide.
  expect(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(deck.slides.length + 1);
  expect(names.filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n)).length).toBeGreaterThanOrEqual(1);
  expect(names.some((n) => /^ppt\/embeddings\/.+\.xlsx$/.test(n))).toBe(true);
  const slides = await Promise.all(
    names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map((n) => zip.file(n)!.async('string')),
  );
  expect(slides.some((x) => x.includes('<a:tbl>'))).toBe(true);
  expect(slides.some((x) => x.includes('Sources'))).toBe(true);
  // The design frame is a picture: the snapshot of the print pipeline (2x).
  expect(names.filter((n) => /^ppt\/media\/.+\.png$/.test(n)).length).toBeGreaterThanOrEqual(1);
  const notes = await Promise.all(
    names
      .filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))
      .map((n) => zip.file(n)!.async('string')),
  );
  expect(notes.some((x) => x.includes('Pause here.') && x.includes(`(card ${fixture.cards.source})`))).toBe(
    true,
  );
  await page.getByTestId('deck-reveal').click();
});

test('the saved day appearance covers the slide view and editing controls with readable contrast', async () => {
  await page.evaluate(() => {
    location.hash = '#/settings';
  });
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.evaluate((id) => {
    location.hash = `#/deck/${id}`;
  }, fixture.canvasId);
  await expect(page.getByTestId('deck-screen')).toHaveAttribute('data-state', 'composed');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await page.getByTestId('deck-thumb').nth(1).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(formatViolations(await axeScan(page, { exclude: ['iframe'] }))).toBe('');
  expect(formatContrast(await contrastScan(page))).toBe('');
});
