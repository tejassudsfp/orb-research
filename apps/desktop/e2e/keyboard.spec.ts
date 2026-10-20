/// <reference lib="dom" />
/**
 * P2.7 board search and keyboard in the real app (temp homes, no model calls). With the keyboard only, where the PRD
 * says so:
 *   - every toolbar control is reached with Tab, in order, with a visible focus ring; Enter and Space press a tool,
 *     the arrow keys move inside the toolbar; zoom to fit / to selection on the minimap are reachable too;
 *   - V / N / F / C pick the tools (not while typing in a field, and Cmd+C / Cmd+V stay copy and paste);
 *   - Shift+1 fits the whole board into the free area (left of the conversation panel), Shift+2 the selection,
 *     Cmd+0 goes back to 100% keeping the screen centre; the minimap buttons do the same;
 *   - Delete removes the selection, Cmd+Z / Cmd+Shift+Z undo and redo it;
 *   - Cmd+F opens board search; typing flies to the first result (a card that was off screen and not mounted),
 *     Enter / Shift+Enter / the arrow buttons fly to the next / previous one (wrapping), the current result is
 *     selected and centred in the free area, matches carry a ring, no match says so; Escape closes the bar and
 *     gives the focus back (here: the chat input, where Cmd+F was pressed);
 *   - no CSP violation, no request off the sidecar origin.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createCanvas, liveWindow } from './support/ui.ts';
import { createWire } from '../../ui/src/wire/index.js';

const desktopDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(desktopDir, '..', '..');

let tmp: string;
let app: ElectronApplication | undefined;
let page: Page;
const consoleLines: string[] = [];
const requests: string[] = [];

/** ORB_UPDATE_SCREENS=1: write a capture to docs/screens/p2.7-<name>.png. */
async function capture(name: string) {
  if (process.env.ORB_UPDATE_SCREENS !== '1') return;
  await page.waitForTimeout(400);
  const dir = join(repoRoot, 'docs', 'screens');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `p2.7-${name}.png`) });
}

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-keyboard-'));
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
  page.on('console', (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));
  page.on('request', (req) => requests.push(req.url()));
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900);
    await new Promise((r) => setTimeout(r, 300));
  });
  await expect(page.getByTestId('orb-ping')).toHaveText(/^orb-host /);
});
test.afterAll(async () => {
  await app?.close().catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
});

const screen = () => page.getByTestId('canvas-screen');
const settled = () => expect(screen()).toHaveAttribute('data-pending', '0');
const zoomPct = async () => Number((await page.getByTestId('zoom-level').textContent())!.replace('%', ''));

/** Drop free text at a screen point (it becomes a Note: first line title, the rest body). */
async function dropText(x: number, y: number, text: string) {
  await page.evaluate(
    ({ x, y, text }) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const target = document.elementFromPoint(x, y)!;
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(
          new DragEvent(type, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }),
        );
      }
    },
    { x, y, text },
  );
}

/**
 * The screen area the chrome leaves free, as the app's last flight computed it (P6.20: clear of the toolbar, the title
 * pill and every floating panel: `data-free-area` = left, top, right, bottom insets of the canvas screen).
 */
async function freeArea() {
  const box = (await screen().boundingBox())!;
  const raw = await screen().getAttribute('data-free-area');
  expect(raw, 'a flight has computed the free area').toBeTruthy();
  const [l, t, r, b] = raw!.split(',').map(Number) as [number, number, number, number];
  return { left: l, top: t, right: box.width - r, bottom: box.height - b };
}

type Box = { x: number; y: number; width: number; height: number };
const cardBox = (id: string): Promise<Box | null> =>
  page.evaluate((cid) => {
    const el = document.querySelector(`article[data-card-id="${cid}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, id);

/** Waits until the card is drawn with its centre at the centre of the free area (the flight has landed). */
async function expectCentred(id: string) {
  const area = await freeArea();
  const cx = (area.left + area.right) / 2;
  const cy = (area.top + area.bottom) / 2;
  await expect
    .poll(async () => {
      const b = await cardBox(id);
      if (!b) return 'not mounted';
      return Math.abs(b.x + b.width / 2 - cx) <= 2 && Math.abs(b.y + b.height / 2 - cy) <= 2
        ? 'centred'
        : 'off';
    })
    .toBe('centred');
}

const focused = () =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    return {
      id: el.dataset.testid ?? el.getAttribute('aria-label') ?? el.tagName,
      ring:
        el.matches(':focus-visible') && style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) >= 2,
    };
  });
/** Cards on the board (the UI fold), mounted or culled. */
const boardCards = async () =>
  Object.keys(
    (JSON.parse((await page.getByTestId('orb-board-state').textContent())!) as { cards: object }).cards,
  ).length;

let canvasId = '';
const ids: Record<'quantum' | 'market' | 'cafe' | 'other', string> = {
  quantum: '',
  market: '',
  cafe: '',
  other: '',
};

test('every toolbar control is keyboard reachable with a focus ring; V/N/F/C pick tools', async () => {
  ({ canvasId } = await createCanvas(page, 'Keyboard'));
  expect(canvasId).not.toBe('');
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');

  // Tab from the start of the page through the chrome: the five tools come in order, each with a focus ring.
  await page.mouse.click(700, 500);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const seen: { id: string; ring: boolean }[] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const f = await focused();
    if (f) seen.push(f);
    if (f?.id === 'zoom-fit') break;
  }
  const order = seen.map((f) => f.id);
  const tools = ['tool-select', 'tool-note', 'tool-frame', 'tool-connect', 'tool-add-card'];
  const at = order.indexOf('tool-select');
  expect(at).toBeGreaterThanOrEqual(0);
  expect(order.slice(at, at + 5)).toEqual(tools);
  expect(order).toContain('publish-port');
  expect(order).toContain('zoom-fit');
  for (const f of seen) expect(f.ring, `focus ring on ${f.id}`).toBe(true);
  // The minimap's zoom-to-fit / zoom-to-selection buttons show while one of them has the focus.
  await expect
    .poll(() =>
      page.getByTestId('zoom-fit').evaluate((el) => Number(getComputedStyle(el.parentElement!).opacity)),
    )
    .toBe(1);
  await capture('focus');

  // Enter and Space press a tool; the arrow keys move inside the toolbar.
  await page.getByTestId('tool-note').focus();
  await page.keyboard.press('Enter');
  await expect(screen()).toHaveAttribute('data-tool', 'note');
  await page.keyboard.press('ArrowDown');
  expect((await focused())!.id).toBe('tool-frame');
  await page.keyboard.press('Space');
  await expect(screen()).toHaveAttribute('data-tool', 'frame');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect((await focused())!.id).toBe('tool-select');
  await page.keyboard.press('End');
  expect((await focused())!.id).toBe('tool-add-card');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(screen()).toHaveAttribute('data-tool', 'select');

  // Single-key tools.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (const [k, tool] of [
    ['n', 'note'],
    ['f', 'frame'],
    ['c', 'connect'],
    ['v', 'select'],
  ] as const) {
    await page.keyboard.press(k);
    await expect(screen()).toHaveAttribute('data-tool', tool);
    await expect(page.getByTestId(`tool-${tool}`)).toHaveAttribute('aria-pressed', 'true');
  }
  // Typing in a field keeps its letters; Cmd+C is not the Connect tool.
  await page.getByTestId('orb-chat-input').fill('');
  await page.getByTestId('orb-chat-input').press('n');
  await page.getByTestId('orb-chat-input').press('f');
  await expect(page.getByTestId('orb-chat-input')).toHaveValue('nf');
  await expect(screen()).toHaveAttribute('data-tool', 'select');
  await page.getByTestId('orb-chat-input').fill('');
  await page.mouse.click(700, 500);
  await page.keyboard.press('Meta+c');
  await expect(screen()).toHaveAttribute('data-tool', 'select');
});

test('Shift+1 fits the board, Shift+2 the selection, Cmd+0 is 100%; Delete and Cmd+Z / Cmd+Shift+Z', async () => {
  // Keep enough board width to exercise the 250% fit cap; the rail has its own reserved column when expanded.
  await page.getByTestId('chat-minimise').click();
  // Zoom out to 25% and drop four notes far apart (at 100% they cannot all be on screen).
  for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(page.getByTestId('zoom-level')).toHaveText('25%');
  const drops: [keyof typeof ids, number, number, string][] = [
    ['quantum', 260, 200, 'Quantum notes\nSuperposition and entanglement'],
    ['market', 940, 760, 'Market size\nThe QUANTUM computing market is small'],
    ['cafe', 560, 470, 'Café crème\nNaïve pricing'],
    ['other', 900, 180, 'Unrelated\nNothing to see'],
  ];
  for (const [key, x, y, text] of drops) {
    const before = await page.getByTestId('orb-card').count();
    await dropText(x, y, text);
    await expect(page.getByTestId('orb-card')).toHaveCount(before + 1);
    await settled();
    ids[key] = (await page.evaluate(
      ([px, py]) =>
        document.elementFromPoint(px!, py!)?.closest('article')?.getAttribute('data-card-id') ?? null,
      [x, y],
    ))!;
    expect(ids[key]).toMatch(/^c_[0-9A-Z]{26}$/);
  }

  // Cmd+0: 100%, around the screen centre (the cafe note sits near it, so it stays near it).
  await page.mouse.click(1000, 120);
  await page.keyboard.press('Meta+0');
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
  await expect(page.locator(`article[data-card-id="${ids.quantum}"]`)).toHaveCount(0); // culled: far off screen

  // Shift+1: every card is on screen, inside the free area (not under the chat panel).
  await page.keyboard.press('Shift+Digit1');
  await expect(page.getByTestId('orb-card')).toHaveCount(4);
  const area = await freeArea();
  await expect
    .poll(async () => {
      for (const id of Object.values(ids)) {
        const b = await cardBox(id);
        if (!b) return `${id} not mounted`;
        if (b.x < area.left || b.y < area.top || b.x + b.width > area.right || b.y + b.height > area.bottom) {
          return `${id} outside`;
        }
      }
      return 'all inside';
    })
    .toBe('all inside');
  expect(await zoomPct()).toBeLessThan(100);
  await capture('fit');

  // Shift+2 fills the free area, up to 250%, while keeping the selected note centred.
  await page.locator(`article[data-card-id="${ids.cafe}"]`).getByTestId('card-select').check();
  await expect(screen()).toHaveAttribute('data-selection', '1');
  await page.keyboard.press('Shift+Digit2');
  await expect.poll(zoomPct).toBeGreaterThanOrEqual(245);
  expect(await zoomPct()).toBeLessThanOrEqual(250);
  await expectCentred(ids.cafe);

  // The minimap buttons do the same as the keys.
  await page.getByTestId('zoom-fit').focus();
  await page.keyboard.press('Enter');
  await expect.poll(zoomPct).toBeLessThan(100);
  await page.getByTestId('zoom-selection').click();
  await expect.poll(zoomPct).toBeGreaterThanOrEqual(245);
  expect(await zoomPct()).toBeLessThanOrEqual(250);
  await expectCentred(ids.cafe);
  await page.keyboard.press('Meta+0');
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
  await expectCentred(ids.cafe); // 100% around the centre keeps the centred card centred

  // Delete, then undo and redo.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Delete');
  await expect(page.locator(`article[data-card-id="${ids.cafe}"]`)).toHaveCount(0);
  await expect.poll(boardCards).toBe(3);
  await settled();
  await page.keyboard.press('Meta+z');
  await expect(page.locator(`article[data-card-id="${ids.cafe}"]`)).toHaveCount(1);
  await settled();
  await page.keyboard.press('Meta+Shift+z');
  await expect(page.locator(`article[data-card-id="${ids.cafe}"]`)).toHaveCount(0);
  await settled();
  await page.keyboard.press('Meta+z');
  await expect(page.locator(`article[data-card-id="${ids.cafe}"]`)).toHaveCount(1);
  await settled();
});

test('Cmd+F searches card text and flies to each result', async () => {
  await page.getByTestId('chat-pill').click();
  // Start at 100% on the cafe note: the quantum note is far away and not mounted.
  await page.getByTestId('orb-chat-input').click();
  await page.keyboard.press('Meta+0');
  await page.keyboard.press('Meta+f');
  const bar = page.getByTestId('board-search');
  const input = page.getByTestId('board-search-input');
  await expect(bar).toBeVisible();
  await expect(input).toBeFocused();

  await input.fill('quantum');
  await expect(page.getByTestId('board-search-count')).toHaveText(/^1 of 2$/);
  await expect(page.locator('[data-found]')).not.toHaveCount(0);
  const current = async () =>
    page.evaluate(
      () => document.querySelector('[data-found="current"]')?.getAttribute('data-card-id') ?? null,
    );
  await expect.poll(current).not.toBeNull();
  const first = (await current())!;
  expect([ids.quantum, ids.market]).toContain(first);
  await expectCentred(first);
  await expect(page.locator(`article[data-card-id="${first}"]`)).toHaveAttribute('data-selected', 'true');
  await expect(input).toBeFocused();
  await capture('search');

  // Enter: the next result (the other card, far away), then wrap back to the first.
  const second = first === ids.quantum ? ids.market : ids.quantum;
  await input.press('Enter');
  await expect(page.getByTestId('board-search-count')).toHaveText('2 of 2');
  await expectCentred(second);
  await expect(page.locator(`article[data-card-id="${second}"]`)).toHaveAttribute('data-found', 'current');
  await input.press('Enter');
  await expect(page.getByTestId('board-search-count')).toHaveText('1 of 2');
  await expectCentred(first);
  await input.press('Shift+Enter');
  await expect(page.getByTestId('board-search-count')).toHaveText('2 of 2');
  await expectCentred(second);
  await page.getByTestId('board-search-prev').click();
  await expect(page.getByTestId('board-search-count')).toHaveText('1 of 2');
  await expectCentred(first);
  await page.getByTestId('board-search-next').click();
  await expect(page.getByTestId('board-search-count')).toHaveText('2 of 2');
  await expectCentred(second);

  // Case and diacritics folded; body text matches; a miss says so and leaves the view alone.
  await input.fill('cafe naive');
  await expect(page.getByTestId('board-search-count')).toHaveText('1 of 1');
  await expectCentred(ids.cafe);
  await input.fill('zebra');
  await expect(page.getByTestId('board-search-count')).toHaveText('No results');
  await expect(page.locator('[data-found]')).toHaveCount(0);
  await expect(page.getByTestId('board-search-prev')).toBeDisabled();
  await expectCentred(ids.cafe);

  // Typing in the bar never triggers board keys (n, f, Backspace).
  await input.fill('nf');
  await input.press('Backspace');
  await expect(input).toHaveValue('n');
  await expect(screen()).toHaveAttribute('data-tool', 'select');
  await expect.poll(boardCards).toBe(4);

  // Cmd+F again re-focuses and selects the query; Escape closes and gives the focus back to the chat input.
  await input.fill('superposition');
  await expect(page.getByTestId('board-search-count')).toHaveText('1 of 1');
  await expectCentred(ids.quantum);
  // Escape on one of the bar's buttons closes the bar too (not the board's Escape, which would drop the selection).
  await page.getByTestId('board-search-close').focus();
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect(page.locator(`article[data-card-id="${ids.quantum}"]`)).toHaveAttribute(
    'data-selected',
    'true',
  );
  await page.keyboard.press('Meta+f');
  await input.fill('superposition');
  await expect(page.getByTestId('board-search-count')).toHaveText('1 of 1');
  await page.getByTestId('orb-chat-input').focus();
  await page.keyboard.press('Meta+f');
  await expect(input).toBeFocused();
  expect(await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([
    0, 13,
  ]);
  await input.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect(page.locator('[data-found]')).toHaveCount(0);
  await expect(page.getByTestId('orb-chat-input')).toBeFocused();
  // The last result stays selected: Enter on the board opens it.
  await expect(page.locator(`article[data-card-id="${ids.quantum}"]`)).toHaveAttribute(
    'data-selected',
    'true',
  );
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('reader')).toHaveAttribute('data-card-id', ids.quantum);
  // While the reader (a modal) is open the board takes no keys.
  await page.keyboard.press('Meta+f');
  await expect(bar).toHaveCount(0);
  await page.getByTestId('reader-close').click();

  expect(consoleLines.filter((l) => /Content Security Policy|Refused to/i.test(l))).toEqual([]);
  const origin = new URL(page.url()).origin;
  expect(
    requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')),
  ).toEqual([]);
});

for (const reduced of [false, true])
  test(`a search target stays visible through a late layout move and releases the camera after manual zoom (reduce motion=${reduced})`, async () => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const baseUrl = new URL(page.url()).origin + '/';
    const cookies = await page.context().cookies(baseUrl);
    const headers = {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
      origin: new URL(baseUrl).origin,
    };
    const wire = createWire({
      baseUrl,
      fetch: (input, init) => {
        const h = new Headers(init.headers);
        for (const [key, value] of Object.entries(headers)) h.set(key, value);
        return fetch(input, { ...init, headers: h });
      },
      createSocket: (url) => new WebSocket(url),
    });
    const initial = JSON.parse((await page.getByTestId('orb-board-state').textContent())!).cards[ids.quantum];
    try {
      await page.getByTestId('orb-chat-input').focus();
      await page.keyboard.press('Meta+f');
      await page.getByTestId('board-search-input').fill('superposition');
      await expect(page.getByTestId('board-search-count')).toHaveText('1 of 1');
      await page.keyboard.press('Escape');
      await expectCentred(ids.quantum);
      await wire.orb.board.command(canvasId, {
        type: 'card.moved',
        id: ids.quantum,
        x: initial.x + 2200,
        y: initial.y + 1800,
      });
      await expect
        .poll(
          async () =>
            JSON.parse((await page.getByTestId('orb-board-state').textContent())!).cards[ids.quantum].x,
        )
        .toBe(initial.x + 2200);
      await expectCentred(ids.quantum);
      await expect(page.locator(`article[data-card-id="${ids.quantum}"]`)).toHaveAttribute(
        'data-selected',
        'true',
      );

      const before = await page.getByTestId('world').getAttribute('style');
      await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
      await expect(page.getByTestId('world')).not.toHaveAttribute('style', before!);
      const manual = await page.getByTestId('world').getAttribute('style');
      await wire.orb.board.command(canvasId, {
        type: 'card.moved',
        id: ids.quantum,
        x: initial.x + 4400,
        y: initial.y + 3600,
      });
      await expect
        .poll(
          async () =>
            JSON.parse((await page.getByTestId('orb-board-state').textContent())!).cards[ids.quantum].x,
        )
        .toBe(initial.x + 4400);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await expect(page.getByTestId('world')).toHaveAttribute('style', manual!);
    } finally {
      await wire.orb.board.command(canvasId, {
        type: 'card.moved',
        id: ids.quantum,
        x: initial.x,
        y: initial.y,
      });
      wire.dispose();
    }
  });
