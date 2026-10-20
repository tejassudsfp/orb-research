/// <reference lib="dom" />
/**
 * P4.5 research document, in the real app, on the print fixture (scripts/testkit/printFixture.ts: one card of each
 * of the 11 types over 10 frames; the source card is Must read and unopened) with the mock LLM as Orb's model:
 *
 * - Publish Port → Research document → Compose warns about the unread Must read card; Open closes the sheet and opens
 *   the card on the board (it is ticked); Compose again goes through;
 * - Orb's compose turn: an uncited paragraph is refused (the progress counts it), the cited sections land one by one
 *   in the composer, and the document is saved;
 * - Export prints the COMPOSED document: Orb's prose with numbered citations, its figures, every other card of the
 *   scope (all 11 card types in the PDF; Gate 4), the reference list with clickable links;
 * - the reading view (design/screens/port.html): sections, citations that open their card on the canvas, inline edit
 *   (keeps citations), a user paragraph (marked as yours), per-section Regenerate with the saved instructions.
 */
import { liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pdfToText } from '@orb/sources';
import { CardType, type PortDoc } from '@orb/shared';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import {
  PRINT_MARKERS,
  PRINT_URLS,
  seedPrintFixture,
  type PrintFixture,
} from '../../../scripts/testkit/printFixture.ts';
import { timingExpect } from '../../../scripts/testkit/namespace.ts';

const desktopDir = resolve(import.meta.dirname, '..');
// P6.2: every type of the card-type list.
const ALL_TYPES = [...CardType.options].sort();

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
let fixture: PrintFixture;

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-port-'));
  fixture = await seedPrintFixture(join(tmp, 'Orb'), { frames: 5, title: 'Port fixture board' });
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
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** `ORB_UPDATE_SCREENS=1`: write docs/screens/p4.5-<name>.png (1440x900) for a visual check. */
async function capture(name: string) {
  if (process.env.ORB_UPDATE_SCREENS !== '1') return;
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900);
    await new Promise((r) => setTimeout(r, 300));
  });
  await page.screenshot({ path: join(desktopDir, '..', '..', 'docs', 'screens', `p4.5-${name}.png`) });
}

const canvasDir = () => join(tmp, 'Orb', 'canvases', fixture.canvasId);
const storedDoc = (): PortDoc =>
  JSON.parse(readFileSync(join(canvasDir(), 'port', 'citations.json'), 'utf8'));

async function openDocComposer() {
  await page.getByTestId('publish-port').click();
  await expect(page.getByTestId('composer')).toBeVisible();
  await page.getByTestId('composer-mode').locator('[data-value="doc"]').click();
  await page.getByTestId('composer-document-format').selectOption('custom');
  await expect(page.getByTestId('composer-instructions')).toBeVisible();
}

/** The compose turn the mock answers: one uncited paragraph (refused), then three cited sections. */
function enqueueCompose() {
  const c = fixture.cards;
  llm.enqueue(
    {
      toolCalls: [
        {
          id: 'call_uncited',
          name: 'compose_section',
          arguments: {
            sectionId: 'summary',
            heading: 'Summary',
            paragraphs: [{ text: 'Everyone will want this.', cardIds: [] }],
          },
        },
        {
          id: 'call_summary',
          name: 'compose_section',
          arguments: {
            sectionId: 'summary',
            heading: 'Summary',
            paragraphs: [
              {
                text: 'Portsummaryline: the market study sizes the opportunity.',
                cardIds: [c.source, c.quote],
              },
            ],
          },
        },
        {
          id: 'call_sources',
          name: 'compose_section',
          arguments: {
            sectionId: 'evidence',
            heading: 'Evidence',
            paragraphs: [
              { text: 'Portevidenceline: the prices table backs it.', cardIds: [c.table, c.source] },
            ],
            figures: [
              { cardId: c.table, caption: 'Prices by plan' },
              { cardId: c.quote, caption: 'The thesis in one line' },
            ],
          },
        },
        {
          id: 'call_open',
          name: 'compose_section',
          arguments: {
            sectionId: 'open-questions',
            heading: 'Open questions',
            paragraphs: [{ text: 'Portquestionline: who pays first is still open.', cardIds: [c.question] }],
          },
        },
      ],
    },
    { text: 'The research document has three sections.' },
  );
}

test('Compose warns about the unread Must read card; Open opens it on the board', async () => {
  await openDocComposer();
  const before = llm.requests.length;
  await page.getByTestId('composer-compose').click();
  const warning = page.getByTestId('composer-unread');
  await expect(warning).toBeVisible();
  await expect(warning.getByTestId('composer-unread-card')).toHaveCount(1);
  await expect(warning.getByTestId('composer-unread-card')).toHaveAttribute(
    'data-card-id',
    fixture.cards.source,
  );
  expect(llm.requests.length).toBe(before);
  // A warning belongs to its scope: another scope clears it, so Continue anyway never skips that scope's check.
  await page.getByTestId('composer-scope-frames').check();
  await expect(warning).toHaveCount(0);
  await page.getByTestId('composer-scope-all').check();
  await page.getByTestId('composer-compose').click();
  await expect(warning).toBeVisible();
  expect(llm.requests.length).toBe(before);
  await capture('composer-unread');
  await warning.getByTestId('composer-unread-open').click();
  await expect(page.getByTestId('composer')).toHaveCount(0);
  const card = page.locator(`[data-testid="orb-card"][data-card-id="${fixture.cards.source}"]`);
  await expect(card).toHaveAttribute('data-opened', 'true');
  await page.getByTestId('reader-close').click();
});

test('Orb composes the document section by section; an uncited paragraph is refused', async () => {
  await openDocComposer();
  await page.getByTestId('composer-instructions').fill('Write it as a one-page investor memo.');
  enqueueCompose();
  const first = llm.requests.length;
  const composeStarted = Date.now();
  await page.getByTestId('composer-compose').click();
  // Nothing unread any more: no warning, Orb gets the compose turn.
  const progress = page.getByTestId('composer-progress');
  await expect(progress).toHaveAttribute('data-phase', 'composed', { timeout: 30_000 });
  // PRD Non-functional › Exports: a research document in under 2 minutes excluding model time (the mock model
  // answers at once, so this is all Orb's own time: turn, tool calls, citation checks, writes).
  const composeMs = Date.now() - composeStarted;
  console.log(`[exports] compose (3 sections, mock model): ${composeMs} ms`);
  timingExpect(() => {
    expect(composeMs).toBeLessThan(120_000);
  });
  await expect(page.getByTestId('composer-unread')).toHaveCount(0);
  await expect(progress.getByTestId('composer-progress-section')).toHaveText([
    'Summary',
    'Evidence',
    'Open questions',
  ]);
  const req = await llm.waitForRequest((r) => r.id === first + 1);
  const prompt = JSON.stringify(req.body.messages);
  expect(prompt).toContain('Compose the research document');
  expect(prompt).toContain('Write it as a one-page investor memo.');
  // The model got the refusal of the uncited paragraph.
  const followUp = await llm.waitForRequest((r) => r.id === first + 2);
  expect(JSON.stringify(followUp.body.messages)).toContain('paragraph 1 has no citations');

  const doc = storedDoc();
  expect(doc.instructions).toBe('Write it as a one-page investor memo.');
  expect(doc.sections.map((s) => s.id)).toEqual(['summary', 'evidence', 'open-questions']);
  expect(doc.sections.every((s) => s.paragraphs.every((p) => p.cardIds.length > 0))).toBe(true);
  expect(readFileSync(join(canvasDir(), 'port', 'doc.md'), 'utf8')).not.toContain('Everyone will want this');
  await expect(page.getByTestId('composer-doc-state')).toContainText('3 sections');
  await capture('composer-composed');
  // The conversation shows the compose turn as one line.
  await expect(page.getByTestId('chat-panel')).toContainText('Compose the research document.');
});

test('Export prints the composed document: prose, citations, every card type, references with links', async () => {
  const exportStarted = Date.now();
  await page.getByTestId('composer-export').click();
  const saved = page.getByTestId('composer-saved');
  await expect(saved).toBeVisible({ timeout: 60_000 });
  const exportMs = Date.now() - exportStarted;
  console.log(`[exports] composed research document PDF: ${exportMs} ms`);
  timingExpect(() => {
    expect(exportMs).toBeLessThan(120_000);
  });
  const file = (await saved.getAttribute('data-file'))!;
  const cardTypes = JSON.parse((await saved.getAttribute('data-card-types'))!);
  expect(Object.keys(cardTypes).sort()).toEqual(ALL_TYPES);
  const bytes = readFileSync(file);
  const text = (await pdfToText(new Uint8Array(bytes), 'file:///doc.pdf')).text.replace(/\s+/g, ' ');
  for (const line of [
    'Portsummaryline',
    'Portevidenceline',
    'Portquestionline',
    'References',
    'Appendix A. Supporting evidence exhibits',
  ])
    expect(text).toContain(line);
  expect(text).toContain('Table 1. Prices by plan');
  for (const [type, marker] of Object.entries(PRINT_MARKERS))
    expect(text, `the ${type} card's text is in the PDF`).toContain(marker);
  const uris = [...bytes.toString('latin1').matchAll(/\/URI\s*\(([^)]*)\)/g)].map((m) => m[1]!);
  expect(uris).toContain(PRINT_URLS.source);
  expect(uris).toContain(PRINT_URLS.quote);
  await page.getByTestId('composer-close').click();
});

test('the reading view: citations to the canvas, inline edits, a user paragraph, per-section regenerate', async () => {
  await page.evaluate((id) => (location.hash = `#/port/${id}`), fixture.canvasId);
  const screen = page.getByTestId('port-screen');
  await expect(screen).toHaveAttribute('data-state', 'composed');
  await expect(page.getByTestId('port-section')).toHaveCount(3);
  await expect(page.getByTestId('port-title')).toHaveText('Port fixture board');
  // P5.6: the lead describes the document; the compose instructions (a request to Orb) are not shown as it.
  await expect(page.getByTestId('port-lead')).toHaveText(
    '3 sections of analysis, supporting evidence and source references.',
  );
  // Numbered citations, first use first: source 1, quote 2, table 3.
  const summary = page.locator('[data-testid="port-section"][data-section-id="summary"]');
  await expect(summary.getByTestId('port-cite')).toHaveCount(2);
  await expect(summary.getByTestId('port-cite').first()).toHaveAttribute('data-n', '1');
  await expect(summary.getByTestId('port-cite').first()).toHaveAttribute(
    'href',
    `#/canvas/${fixture.canvasId}?focus=${fixture.cards.source}`,
  );
  const evidence = page.locator('[data-testid="port-section"][data-section-id="evidence"]');
  await expect(evidence.getByTestId('port-cite').first()).toHaveAttribute('data-n', '3');
  await expect(evidence.getByTestId('port-figure')).toHaveCount(2);
  await expect(page.getByTestId('port-reference')).toHaveCount(4);
  await expect(page.getByTestId('port-frame').first()).toBeVisible();
  // No "Copy link" / "Fork this board" (PRD: out of scope); Back to canvas instead.
  await expect(page.getByText('Fork this board')).toHaveCount(0);
  await expect(page.getByTestId('back-to-canvas')).toBeVisible();
  await capture('reading-view');

  // Inline edit: the paragraph keeps its citations.
  const para = summary.getByTestId('port-paragraph').first();
  await para.hover();
  await para.getByTestId('port-edit').click();
  await page.getByTestId('port-edit-text').fill('Portediteline: my own wording of the summary.');
  await capture('reading-edit');
  await page.getByTestId('port-edit-save').click();
  await expect(summary.getByTestId('port-paragraph').first()).toHaveAttribute('data-edited', 'true');
  await expect(summary.getByTestId('port-cite')).toHaveCount(2);
  // A paragraph of the user's own: no citation, marked as theirs.
  await summary.getByTestId('port-add-paragraph').click();
  await page.getByTestId('port-add-text').fill('Portuserline: a thought of my own.');
  await page.getByTestId('port-add-save').click();
  await expect(summary.locator('[data-testid="port-paragraph"][data-user-authored="true"]')).toHaveText(
    /Portuserline/,
  );
  let doc = storedDoc();
  expect(doc.sections[0]!.paragraphs.map((p) => [p.text, p.cardIds, p.userAuthored ?? false])).toEqual([
    ['Portediteline: my own wording of the summary.', [fixture.cards.source, fixture.cards.quote], false],
    ['Portuserline: a thought of my own.', [], true],
  ]);

  // Regenerate the summary: Orb rewrites it with the saved instructions; the user's paragraph stays.
  llm.enqueue(
    {
      toolCalls: [
        {
          id: 'call_regen',
          name: 'compose_section',
          arguments: {
            sectionId: 'summary',
            heading: 'Summary',
            paragraphs: [{ text: 'Portregenline: a fresh summary.', cardIds: [fixture.cards.risk] }],
          },
        },
      ],
    },
    { text: 'Rewrote the summary.' },
  );
  const first = llm.requests.length;
  await summary.getByTestId('port-regenerate').click();
  await expect(summary).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(summary.getByTestId('port-paragraph').first()).toContainText('Portregenline');
  await expect(summary.locator('[data-testid="port-paragraph"][data-user-authored="true"]')).toHaveCount(1);
  const req = await llm.waitForRequest((r) => r.id === first + 1);
  expect(JSON.stringify(req.body.messages)).toContain('one-page investor memo');
  doc = storedDoc();
  expect(doc.sections.map((s) => s.id)).toEqual(['summary', 'evidence', 'open-questions']);
  expect(doc.sections[0]!.paragraphs[0]!.cardIds).toEqual([fixture.cards.risk]);

  // A citation opens its card on the canvas (selected).
  await summary.getByTestId('port-cite').first().click();
  await expect(page.getByTestId('canvas-screen')).toBeVisible();
  await expect(
    page.locator(`[data-testid="orb-card"][data-card-id="${fixture.cards.risk}"]`),
  ).toHaveAttribute('data-selected', 'true', { timeout: 10_000 });
});
