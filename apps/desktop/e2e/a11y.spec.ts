/// <reference lib="dom" />
/**
 * P5.2 accessibility pass, in the real app (temp homes, mock LLM; PRD "Accessibility" and "Motion"):
 *   - axe-core (exact-pinned) with the WCAG 2.0/2.1 A + AA rules finds no violation on Home and Settings (night and
 *     day), the first-run sheet, the canvas (board with every card type, Add card, a selection, the reader,
 *     Why it's here, a thread, board search, the menus, a chat turn), the Port composer (both modes, the unread
 *     warning, composed) and the Port reading view (incl. the paragraph editor). That covers labels
 *     (`button-name`, `label`, `link-name`, `image-alt`), ARIA, and the contrast axe can compute;
 *   - text contrast >= 4.5:1 (3:1 for large text) measured from the rendered pixels for every visible text run and
 *     placeholder in those same states (axe leaves text over glows, stars and translucent panels "incomplete");
 *   - keyboard: every tab stop of Home, Settings, First run, the canvas chrome (header, toolbar, minimap, zoom),
 *     the conversation panel, the composer and Port is reached with Tab and shows a focus ring; the modal sheets
 *     (composer, reader) keep the focus and give it back on close; the menus take arrows and Escape; the popovers
 *     take the focus and give it back;
 *   - Reduce Motion: the Home topic words stop rotating, a placed card has no entrance animation, no transition or
 *     animation runs longer than 0.01 ms, and zoom to fit jumps instead of flying (each checked against the same
 *     step without Reduce Motion, so the check can fail).
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { seedPrintFixture, type PrintFixture } from '../../../scripts/testkit/printFixture.ts';
import {
  axeScan,
  contrastScan,
  focused,
  focusRing,
  formatContrast,
  formatViolations,
  keyboardReach,
} from './support/a11y.ts';
import { liveWindow } from './support/ui.ts';

// One app and board for the whole file, and later tests use what earlier ones made (the composed document): run them
// in order, and skip the rest after a failure instead of re-running them on a fresh home where they cannot pass.
test.describe.configure({ mode: 'serial' });

const desktopDir = resolve(import.meta.dirname, '..');
let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
let fixture: PrintFixture;

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-a11y-'));
  fixture = await seedPrintFixture(join(tmp, 'Orb'), { frames: 5, title: 'A11y fixture board' });
  writeFileSync(join(tmp, 'Orb', 'orb.json'), JSON.stringify({ theme: 'night' }));
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
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900);
    await new Promise((r) => setTimeout(r, 300));
  });
  // The scans measure settled screens: no entrance animations or transitions mid-way.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const go = (hash: string) => page.evaluate((h) => (location.hash = h), hash);
const focusSource = async () => {
  await page.keyboard.press('Meta+f');
  await page.getByTestId('board-search-input').fill('');
  await page.getByTestId('board-search-input').fill('Sourcemarker');
  await expect(page.getByTestId('board-search-count')).toHaveText('1 of 1');
  await page.keyboard.press('Escape');
};
const openCanvas = async () => {
  await go(`#/canvas/${fixture.canvasId}`);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await expect(page.getByTestId('orb-card').first()).toBeVisible();
  // P6.20 opens the whole board fitted. Navigate to the source before testing its full-detail controls.
  await focusSource();
};
const sourceCard = () => page.locator(`[data-testid="orb-card"][data-card-id="${fixture.cards.source}"]`);

/** axe + pixel contrast on the current screen; collects every problem under its state's name. */
const problems: string[] = [];
async function check(state: string) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // Design frames are sandboxed agent/user HTML (their own page), not Orb's UI.
  const violations = await axeScan(page, { exclude: ['iframe'] });
  if (violations.length) problems.push(`[${state}] axe:\n${formatViolations(violations)}`);
  const contrast = await contrastScan(page);
  if (contrast.length) {
    await page.screenshot({ path: test.info().outputPath(`${state.replace(/[^a-z0-9]/gi, '-')}.png`) });
    problems.push(`[${state}] contrast:\n${formatContrast(contrast)}`);
  }
}

test('Home, Settings (night and day) and First run: no axe violation, text contrast >= 4.5:1', async () => {
  problems.length = 0;
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await expect(page.getByTestId('orb-canvas-open').first()).toBeVisible();
  await check('home night');
  await go('#/settings');
  await expect(page.getByTestId('provider-card').first()).toBeVisible();
  await check('settings night');
  await page.getByTestId('price-add').click();
  await expect(page.getByTestId('price-form')).toBeVisible();
  await check('settings night, price form');
  await page.getByTestId('custom-add').click();
  await expect(page.getByTestId('custom-form')).toBeVisible();
  await check('settings night, custom provider form');
  await go('#/');
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await check('home day');
  await go('#/settings');
  await expect(page.getByTestId('provider-card').first()).toBeVisible();
  await check('settings day');
  await go('#/');
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await go('#/first-run');
  await expect(page.getByTestId('first-run-screen').getByTestId('provider-card')).toBeVisible();
  await check('first run');
  expect(problems.join('\n\n')).toBe('');
});

test('Port: composing and the reading view (with the paragraph editor) pass axe and 4.5:1', async () => {
  problems.length = 0;
  await go(`#/port/${fixture.canvasId}`);
  await expect(page.getByTestId('port-empty')).toBeVisible();
  await check('port, nothing composed');
  await openCanvas();
  await page.getByTestId('publish-port').click();
  await page.getByTestId('composer-mode').locator('[data-value="doc"]').click();
  await page.getByTestId('composer-document-format').selectOption('custom');
  const c = fixture.cards;
  llm.enqueue(
    {
      toolCalls: [
        {
          id: 'call_a11y_summary',
          name: 'compose_section',
          arguments: {
            sectionId: 'summary',
            heading: 'Summary',
            paragraphs: [{ text: 'The market study sizes the opportunity.', cardIds: [c.source, c.quote] }],
          },
        },
        {
          id: 'call_a11y_evidence',
          name: 'compose_section',
          arguments: {
            sectionId: 'evidence',
            heading: 'Evidence',
            paragraphs: [{ text: 'The prices table backs it.', cardIds: [c.table, c.source] }],
            figures: [
              { cardId: c.table, caption: 'Prices by plan' },
              { cardId: c.image, caption: 'The sketch' },
            ],
          },
        },
      ],
    },
    { text: 'The document has two sections.' },
  );
  await page.getByTestId('composer-compose').click();
  // The fixture's Must read source is unread (this runs before anything opens it): the warning comes first (checked
  // too), then Continue anyway.
  await expect(page.getByTestId('composer-unread')).toBeVisible();
  await check('composer, unread warning');
  await page.getByTestId('composer-continue').click();
  await expect(page.getByTestId('composer-progress')).toHaveAttribute('data-phase', 'composed', {
    timeout: 30_000,
  });
  await check('composer, composed');
  await page.getByTestId('composer-reading-view').click();
  await expect(page.getByTestId('port-article')).toBeVisible();
  await check('port reading view');
  await page.getByTestId('port-paragraph').first().hover();
  await page.getByTestId('port-paragraph').first().getByTestId('port-edit').click();
  await expect(page.getByTestId('port-paragraph-editor')).toBeVisible();
  await check('port paragraph editor');
  await page.getByTestId('port-edit-cancel').click();
  expect(problems.join('\n\n')).toBe('');
});

test('Canvas, popovers and the Port composer: no axe violation, text contrast >= 4.5:1', async () => {
  problems.length = 0;
  await openCanvas();
  // The board opens fitted (P6.20; its title-only cards are too small for a pixel contrast scan to mean anything);
  // the steps below work on the cards at 100%.
  await page.getByTestId('zoom-level').click();
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
  await check('canvas');
  await page.getByTestId('tool-add-card').click();
  await expect(page.getByTestId('add-card-menu')).toBeVisible();
  await check('add card menu');
  await page.keyboard.press('Escape');
  await page.getByTestId('orb-chat-input').fill('Hello there');
  await page.getByTestId('orb-chat-send').click();
  await expect(page.getByTestId('orb-chat-reply')).toHaveText('Done.');
  await check('chat turn');
  await focusSource();
  await sourceCard().getByTestId('card-select').check();
  await expect(page.getByTestId('selection-bar')).toBeVisible();
  await check('selection');
  await page.getByTestId('card-open-reader').click();
  await expect(page.getByTestId('reader')).toBeVisible();
  await check('reader');
  await page.getByTestId('reader-close').click();
  await focusSource();
  await sourceCard().getByTestId('orb-card-why').click();
  await expect(page.getByTestId('provenance')).toBeVisible();
  await check('why it is here');
  await page.keyboard.press('Escape');
  await sourceCard().getByTestId('card-thread').click();
  await expect(page.getByTestId('thread')).toBeVisible();
  await check('thread');
  await page.keyboard.press('Escape');
  await page.getByTestId('orb-chat-input').focus();
  await page.keyboard.press('Meta+f');
  await page.getByTestId('board-search-input').fill('marker');
  await expect(page.getByTestId('board-search-count')).toHaveText(/^1 of \d+$/);
  await check('board search');
  await page.keyboard.press('Escape');
  await page.getByTestId('chat-menu').click();
  await expect(page.getByTestId('chat-menu-list')).toBeVisible();
  await check('agent controls menu');
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="agent-avatar"][data-agent="scout"]').click();
  await expect(page.getByTestId('agent-menu')).toBeVisible();
  await check('agent menu');
  await page.keyboard.press('Escape');
  await page.getByTestId('publish-port').click();
  await expect(page.getByTestId('composer')).toBeVisible();
  await check('composer, canvas PDF');
  await page.getByTestId('composer-scope-frames').check();
  await check('composer, selected frames');
  await page.getByTestId('composer-scope-all').check();
  await page.getByTestId('composer-mode').locator('[data-value="doc"]').click();
  await page.getByTestId('composer-document-format').selectOption('custom');
  await check('composer, research document');
  await page.getByTestId('composer-close').click();
  expect(problems.join('\n\n')).toBe('');
});

test('Day appearance covers the board, expanded reader and Port, and survives reload', async () => {
  problems.length = 0;
  await openCanvas();
  await page.getByTestId('canvas-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await check('day canvas');
  await page.getByTestId('chat-menu').click();
  await check('day agent controls');
  await page.keyboard.press('Escape');
  await sourceCard().getByTestId('card-select').check();
  await page.getByTestId('card-open-reader').click();
  await check('day expanded reader');
  await page.getByTestId('reader-close').click();
  for (const [type, marker] of [
    ['chart', 'Chartmarker'],
    ['diagram', 'Diagrammarker'],
    ['database', 'Databasemarker'],
  ] as const) {
    await go(`#/canvas/${fixture.canvasId}?focus=${fixture.cards[type]}`);
    await expect(
      page.locator(`[data-testid="orb-card"][data-card-id="${fixture.cards[type]}"]`),
      marker,
    ).toBeVisible();
    await page.getByTestId('card-open-reader').click();
    if (type !== 'database') {
      const visual = page.getByTestId(`reader-${type}`);
      await expect(visual).toHaveAttribute('data-state', 'ready');
      await expect(visual).toHaveAttribute(`data-${type}-theme`, 'light');
      const label = visual.locator('svg text').first();
      await expect
        .poll(() => label.evaluate((el) => getComputedStyle(el).fill))
        .not.toBe('rgb(249, 252, 254)');
    } else {
      await page.getByTestId('dataset-add-board').click();
      const tabs = page.getByRole('tablist', { name: 'Views' }).getByRole('tab');
      await expect(tabs).toHaveCount(2);
      await tabs.last().focus();
      await page.keyboard.press('Home');
      await expect(tabs.first()).toBeFocused();
      await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('ArrowRight');
      await expect(tabs.last()).toBeFocused();
      await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
    }
    await check(`day ${type} reader`);
    await page.getByTestId('reader-close').click();
  }
  await go(`#/port/${fixture.canvasId}`);
  await expect(page.getByTestId('port-article')).toBeVisible();
  await check('day Port');
  await openCanvas();
  await page.reload();
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await expect(page.getByTestId('canvas-theme-toggle')).toHaveAccessibleName('Switch to dark mode');
  await page.getByTestId('canvas-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  expect(problems.join('\n\n')).toBe('');
});

/** Every tab stop in `container` is reached by Tab and shows a focus ring. */
async function expectReach(name: string, container: string, options: { exclude?: string; min: number }) {
  const r = await keyboardReach(page, container, { exclude: options.exclude });
  expect(r.stops.length, `${name}: tab stops\n${r.stops.join('\n')}`).toBeGreaterThanOrEqual(options.min);
  expect(r.missed, `${name}: not reached by Tab (order: ${r.order.join(' ')})`).toEqual([]);
  expect(r.noRing, `${name}: no visible focus ring`).toEqual([]);
}

test('Keyboard: every control of Home, Settings, First run, the canvas chrome, chat, composer and Port is reached by Tab with a focus ring', async () => {
  await go('#/');
  await expect(page.getByTestId('orb-canvas-open').first()).toBeVisible();
  await expectReach('home', '[data-testid="home-screen"]', { min: 9 });
  await go('#/settings');
  await expect(page.getByTestId('provider-card').first()).toBeVisible();
  await expect(page.getByTestId('price-row').first()).toBeVisible();
  await expectReach('settings', '[data-testid="settings-screen"]', { min: 25 });
  await page.getByTestId('custom-add').click();
  await expectReach('settings, custom provider form', '[data-testid="custom-form"]', { min: 4 });
  await go('#/first-run');
  // (the key field of the chosen provider takes the focus when its card arrives: wait for it)
  await expect(page.getByTestId('first-run-screen').getByTestId('provider-key-input')).toBeFocused();
  await expectReach('first run', '[data-testid="first-run-screen"]', { min: 6 });
  await openCanvas();
  // The canvas chrome: header (Home, title, Publish Port), toolbar, minimap and zoom, reading queue, conversation.
  await expectReach('canvas chrome', '[data-testid="canvas-screen"]', {
    exclude: '[data-testid="world"]',
    min: 20,
  });
  await expectReach('toolbar', '[role="toolbar"]', { min: 5 });
  await expectReach('conversation', '[data-testid="chat-panel"]', { min: 7 });
  await page.getByTestId('publish-port').click();
  await expectReach('composer, canvas PDF', '[data-testid="composer"]', { min: 8 });
  await page.getByTestId('composer-mode').locator('[data-value="doc"]').click();
  await page.getByTestId('composer-document-format').selectOption('custom');
  await expectReach('composer, research document', '[data-testid="composer"]', { min: 7 });
  await page.getByTestId('composer-close').click();
  await go(`#/port/${fixture.canvasId}`);
  await expect(page.getByTestId('port-article')).toBeVisible();
  await expectReach('port', '[data-testid="port-screen"]', { min: 5 });
});

test('Keyboard: sheets keep the focus and give it back, menus take arrows and Escape, popovers take the focus', async () => {
  await openCanvas();
  // Composer: opened from the keyboard, Tab and Shift+Tab stay inside, Escape gives the focus back to Publish Port.
  await page.getByTestId('publish-port').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('composer')).toBeVisible();
  const inComposer = () => page.evaluate(() => !!document.activeElement?.closest('[data-testid="composer"]'));
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    expect(await inComposer(), `Tab ${i + 1} left the composer: ${await focused(page)}`).toBe(true);
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await inComposer(), `Shift+Tab ${i + 1} left the composer`).toBe(true);
  }
  // A radio group (the export mode) takes the arrow keys.
  const mode = page.getByTestId('composer-mode');
  await mode.locator('[data-value="canvas"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(mode.locator('[data-value="doc"]')).toBeFocused();
  await expect(mode.locator('[data-value="doc"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('composer-instructions')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(mode.locator('[data-value="canvas"]')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('composer')).toHaveCount(0);
  expect(await focused(page)).toBe('publish-port');
  expect(await focusRing(page)).not.toBeNull();

  // Reader: opened from the selection bar with Enter; the focus is in the sheet and stays there; Escape gives it back.
  await sourceCard().getByTestId('card-select').check();
  await page.getByTestId('card-open-reader').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('reader')).toBeVisible();
  const inReader = () => page.evaluate(() => !!document.activeElement?.closest('[data-testid="reader"]'));
  expect(await inReader()).toBe(true);
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    expect(await inReader(), `Tab ${i + 1} left the reader: ${await focused(page)}`).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('reader')).toHaveCount(0);
  expect(await focused(page)).toBe('card-open-reader');

  // Agent controls menu: Enter opens it on its first item, arrows move, Escape closes and returns to the button.
  await page.getByTestId('chat-menu').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('chat-menu-list')).toBeVisible();
  expect(await focused(page)).toBe('pause-all');
  await page.keyboard.press('ArrowDown');
  expect(await focused(page)).toBe('resume-all');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect(await focused(page)).toBe('redirect-orb');
  await page.keyboard.press('Home');
  expect(await focused(page)).toBe('pause-all');
  expect(await focusRing(page)).not.toBeNull();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('chat-menu-list')).toHaveCount(0);
  expect(await focused(page)).toBe('chat-menu');

  // An agent's avatar menu: Escape closes it (nothing is live, so its items are disabled) and returns the focus.
  const scout = page.locator('[data-testid="agent-avatar"][data-agent="scout"]');
  await scout.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('agent-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('agent-menu')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-agent'))).toBe('scout');

  // Why it's here: Enter on the card's why line moves the focus into the popover; Escape gives it back.
  const inWhy = () => page.evaluate(() => !!document.activeElement?.closest('[data-testid="provenance"]'));
  await sourceCard().getByTestId('orb-card-why').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('provenance')).toBeVisible();
  expect(await inWhy()).toBe(true);
  await page.keyboard.press('Tab');
  expect(await inWhy()).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('provenance')).toHaveCount(0);
  expect(await focused(page)).toBe('orb-card-why');

  // A thread: the field takes the focus; Escape gives it back to the card's thread button.
  await sourceCard().getByTestId('card-thread').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('thread-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('thread')).toHaveCount(0);
  expect(await focused(page)).toBe('card-thread');
});

/** Distinct `transform`s of the world layer over the next `ms`, sampled every animation frame. */
const worldTransforms = (ms: number) =>
  page.evaluate(
    (ms) =>
      new Promise<number>((done) => {
        const world = document.querySelector<HTMLElement>('[data-testid="world"]')!;
        const seen = new Set<string>([getComputedStyle(world).transform]);
        const start = performance.now();
        const tick = () => {
          seen.add(getComputedStyle(world).transform);
          if (performance.now() - start < ms) requestAnimationFrame(tick);
          else done(seen.size);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

/** Elements whose transition or animation lasts longer than 0.01 ms. */
const slowMotion = () =>
  page.evaluate(() => {
    const ms = (v: string) =>
      Math.max(
        0,
        ...v.split(',').map((d) => (d.trim().endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000)),
      );
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const s = getComputedStyle(el);
      if (ms(s.transitionDuration) > 0.01 || (s.animationName !== 'none' && ms(s.animationDuration) > 0.01))
        out.push(`${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''}`);
    }
    return out;
  });

test('Reduce Motion: topic words hold still, cards appear without animation, zoom to fit jumps, nothing transitions', async () => {
  // Without Reduce Motion, the same steps do move (so these checks can fail).
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await go('#/');
  const words = page.getByTestId('topic-words');
  await expect(words).toBeVisible();
  const first = await words.textContent();
  await expect.poll(() => words.textContent(), { timeout: 6_000 }).not.toBe(first);
  await openCanvas();
  expect((await slowMotion()).length).toBeGreaterThan(0);
  await page.getByTestId('zoom-fit').click();
  await page.waitForTimeout(600);
  await page.keyboard.press('Meta+0');
  expect(await worldTransforms(500)).toBeGreaterThan(3);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  // Zoom to fit: one jump, no frames in between.
  const jumpFrom = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-testid="world"]')!).transform,
  );
  await page.getByTestId('zoom-fit').click();
  expect(await worldTransforms(500)).toBeLessThanOrEqual(2);
  expect(
    await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="world"]')!).transform),
  ).not.toBe(jumpFrom);

  // A new note appears with no entrance animation.
  const before = await page.getByTestId('orb-card').count();
  await page.getByTestId('tool-note').click();
  const box = (await page.getByTestId('canvas-screen').boundingBox())!;
  await page.mouse.click(box.x + 320, box.y + box.height - 140);
  await expect(page.getByTestId('orb-card')).toHaveCount(before + 1);
  const running = await page.evaluate(() =>
    document
      .getAnimations()
      .map((a) => ({
        name: a instanceof CSSAnimation ? a.animationName : a.constructor.name,
        ms: Number(a.effect?.getComputedTiming().duration ?? 0),
      }))
      .filter((a) => a.ms > 1),
  );
  expect(running).toEqual([]);
  await page.keyboard.press('Escape');

  // No element has a transition or animation longer than 0.01 ms (canvas, then Home).
  expect(await slowMotion()).toEqual([]);
  await go('#/');
  await expect(words).toBeVisible();
  expect(await slowMotion()).toEqual([]);
  // The topic words hold for more than two rotation periods.
  const held = await words.textContent();
  await page.waitForTimeout(6_000);
  expect(await words.textContent()).toBe(held);
});

// Font/geometry changes exposed two sampling errors: text hidden behind a floating overlay and input borders.
test('contrast measurement follows painted text and still rejects real low contrast', async () => {
  await page.evaluate(() => {
    document.getElementById('root')!.hidden = true;
    const fixture = document.createElement('div');
    fixture.id = 'contrast-measurement-fixture';
    fixture.style.cssText = 'position:fixed;inset:0;background:white;z-index:99999';
    fixture.innerHTML =
      '<span id="contrast-fixture-text" style="position:absolute;left:20px;top:20px;color:black;font:16px/20px Arial">Visible text remains readable</span><div role="dialog" style="position:absolute;left:20px;top:20px;width:48px;height:20px;background:black;z-index:2"></div><input aria-label="Contrast fixture" placeholder="Readable placeholder" style="position:absolute;left:20px;top:70px;width:250px;height:40px;box-sizing:border-box;border:4px solid royalblue;padding:0 10px;background:black;color:white;font:14px/20px Arial"><style>#contrast-measurement-fixture input::placeholder{color:white}</style>';
    document.body.append(fixture);
  });
  try {
    expect(formatContrast(await contrastScan(page))).toBe('');
    await page.evaluate(() => {
      document.getElementById('contrast-fixture-text')!.style.color = '#fafafa';
    });
    await expect(page.locator('#contrast-fixture-text')).toHaveCSS('color', 'rgb(250, 250, 250)');
    const bad = await contrastScan(page);
    expect(
      bad.some((failure) => failure.text.includes('Visible text remains readable') && failure.ratio < 4.5),
    ).toBe(true);
  } finally {
    await page.evaluate(() => {
      document.getElementById('contrast-measurement-fixture')?.remove();
      document.getElementById('root')!.hidden = false;
    });
  }
});
