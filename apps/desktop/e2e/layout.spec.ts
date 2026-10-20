/// <reference lib="dom" />
/**
 * P3.2 in the real window (mock LLM, no real key):
 * - agent cards named to a frame land in the frame's grid: inside the frame, which grows downward to hold them (the
 *   template frame below it is pushed down, so frames never overlap), never on top of each other (also at full detail,
 *   where a card's content sets its height), and they animate in;
 * - the 13th card in a frame answers FRAME_FULL to the agent and nothing more is drawn;
 * - a stack made by `consolidate_cards` (seeded through the canvas service, since only Scout, Critic and Builder hold
 *   that tool and they arrive in P3.4) is drawn as one stack card ("stack · 2 cards", its titles), the stacked cards
 *   are not drawn, a link to a stacked card is drawn to the stack, and the reader lists what the stack holds.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CanvasStore } from '@orb/canvas';
import type { Card } from '@orb/shared';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { repoRoot } from './support/screenshot.ts';
import { createCanvas, liveWindow } from './support/ui.ts';

const desktopDir = resolve(import.meta.dirname, '..');

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;
const seeded: { canvasId: string; stackId: string; stacked: string[]; loose: string; note: string } = {
  canvasId: '',
  stackId: '',
  stacked: [],
  loose: '',
  note: '',
};

/** ORB_UPDATE_SCREENS=1: write a capture to docs/screens/p3.2-<name>.png. */
async function capture(name: string) {
  if (process.env.ORB_UPDATE_SCREENS !== '1') return;
  await page.waitForTimeout(400);
  const dir = join(repoRoot, 'docs', 'screens');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `p3.2-${name}.png`) });
}

type Box = { x: number; y: number; width: number; height: number };
async function settledLayout() {
  let last = '';
  let stable = 0;
  for (let i = 0; i < 80 && stable < 4; i++) {
    await page.waitForTimeout(200);
    const now = await page.getByTestId('orb-board-state').textContent();
    const measuring = await page.getByTestId('measurer').count();
    const gliding = await page.getByTestId('world').getAttribute('data-gliding');
    stable = now === last && measuring === 0 && !gliding ? stable + 1 : 0;
    last = now ?? '';
  }
  expect(stable, 'measurements and reflow finish before checking the layout').toBe(4);
}
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width - 0.5 &&
  a.x + a.width > b.x + 0.5 &&
  a.y < b.y + b.height - 0.5 &&
  a.y + a.height > b.y + 0.5;

/** A canvas whose board already holds a Scout stack (written by the canvas service, as consolidate_cards does). */
async function seedStackCanvas(orbHome: string) {
  mkdirSync(orbHome, { recursive: true });
  const store = new CanvasStore({ home: orbHome, searchIndex: false, flushMs: 5 });
  const { id } = await store.create({ prompt: 'Stacked research' });
  const [frameEv] = await store.commandEvents(id, {
    type: 'frame.added',
    frame: { title: 'Evidence', color: 'sky', x: 96, y: 120, w: 640, h: 420 },
  });
  const frameId = (frameEv!.data as { frame: { id: string } }).frame.id;
  const [noteEv] = await store.commandEvents(id, {
    type: 'card.added',
    card: { type: 'note', frameId: null, x: 900, y: 140, w: 240, h: 150, data: { text: 'My own take' } },
  });
  const note = (noteEv!.data as { card: Card }).card.id;
  const scout = { kind: 'agent', agent: 'scout', model: 'mock-model', sessionId: 'scout-seed' } as const;
  const placed: string[] = [];
  for (const title of ['Paper A', 'Paper B', 'Paper C']) {
    const ev = await store.placeAgentCard(
      id,
      {
        type: 'source',
        frameId,
        data: { title, url: `https://example.org/papers/${encodeURIComponent(title)}`, summary: `${title} finds Y.` },
        why: 'evidence',
      },
      { ...scout, toolCallId: `call_${title}` },
    );
    placed.push((ev.data as { card: Card }).card.id);
  }
  await store.commandEvents(id, {
    type: 'link.added',
    link: { from: placed[0]!, to: note, type: 'supports' },
  });
  const { stack } = await store.consolidateAgentCards(
    id,
    { cardIds: placed.slice(0, 2), title: 'Two papers on Y', summary: 'Both find Y in small samples.' },
    scout,
  );
  await store.close();
  Object.assign(seeded, {
    canvasId: id,
    stackId: stack.id,
    stacked: placed.slice(0, 2),
    loose: placed[2]!,
    note,
  });
}

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-layout-'));
  await seedStackCanvas(join(tmp, 'Orb'));
  llm = await new MockLlm().start();
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
});

test.afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('agent cards fill the frame grid, the frame grows, and the 13th answers FRAME_FULL', async () => {
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await page.locator('[data-testid="template-chip"][data-template="topic"]').click();
  await createCanvas(page, 'Layout probe');
  const frame = page.getByTestId('orb-frame').first();
  await expect(page.getByTestId('orb-frame')).toHaveCount(5);
  const frameId = (await frame.getAttribute('data-frame-id'))!;
  // World coordinates (the camera may move while the board is still fitting itself to what the agents add).
  const worldFrame = () =>
    page.getByTestId('orb-board-state').evaluate((el, id) => {
      const f = (JSON.parse(el.textContent ?? '{}') as { frames: Record<string, { x: number; y: number; w: number; h: number }> })
        .frames[id]!;
      return { x: f.x, y: f.y, w: f.w, h: f.h };
    }, frameId);
  const before = await worldFrame();

  const types = ['source', 'quote', 'question', 'risk'] as const;
  const fields = {
    source: { url: 'https://example.org/s', body: 'A finding.' },
    quote: { body: 'Y holds.', url: 'https://example.org/q' },
    question: { body: 'Does it scale?' },
    risk: { body: 'One lab only.', kind: 'risk' },
  };
  const calls = Array.from({ length: 13 }, (_, i) => {
    const type = types[i % types.length]!;
    return {
      id: `call_layout_${i}`,
      name: 'place_card',
      arguments: { type, title: `Card ${i}`, ...fields[type], ...(type === 'source' ? { url: `https://example.org/s/${i}` } : {}), why: `Layout probe ${i}.`, frameId },
    };
  });
  // Record every card that is drawn with the enter animation.
  await page.evaluate(() => {
    const w = window as unknown as { entered: Set<string> };
    w.entered = new Set();
    const note = (el: Element) => {
      if (el instanceof HTMLElement && el.dataset.enter && el.dataset.cardId)
        w.entered.add(el.dataset.cardId);
    };
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') note(r.target as Element);
        r.addedNodes.forEach((n) => n instanceof Element && note(n));
      }
    }).observe(document.querySelector('[data-testid="world"]')!, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-enter'],
    });
  });
  const first = llm.requests.length;
  llm.enqueue({ toolCalls: calls }, { text: 'Placed.' });
  await page.getByTestId('orb-chat-input').fill('fill the first frame');
  await page.getByTestId('orb-chat-send').click();

  const world = page.getByTestId('world');
  await expect(world).toHaveAttribute('data-total-cards', '12');
  await expect(page.getByTestId('orb-chat-reply')).toHaveText('Placed.');
  // The cards on screen animated in as they were placed.
  const onScreen = await page
    .getByTestId('orb-card')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-card-id')!));
  expect(onScreen.length).toBeGreaterThan(0);
  const entered = await page.evaluate(() => [...(window as unknown as { entered: Set<string> }).entered]);
  expect(entered).toEqual(expect.arrayContaining(onScreen));
  const followUp = await llm.waitForRequest((r) => r.id === first + 2);
  const results: { error?: string; cardId?: string }[] = followUp.body.messages
    .filter(
      (m: { role: string; tool_call_id?: string }) =>
        m.role === 'tool' && m.tool_call_id?.startsWith('call_layout_'),
    )
    .map((m: { content: unknown }) => JSON.parse(String(m.content)) as { error?: string; cardId?: string });
  expect(results.filter((r) => r.error === 'FRAME_FULL')).toHaveLength(1);
  expect(results.filter((r) => r.cardId)).toHaveLength(12);

  // The frame grew (P6.20): sideways first, in whole grid columns, then down; same left and top.
  await expect.poll(async () => (await worldFrame()).h).toBeGreaterThan(before.h * 2);
  const grown = await worldFrame();
  expect(grown.x).toBe(before.x);
  expect(grown.y).toBe(before.y);
  expect(grown.w).toBeGreaterThan(before.w);
  expect(grown.w).toBeLessThanOrEqual(8 * 132 + 7 * 16 + 48);

  // Zoomed to fit (every card drawn): all 12 inside the frame, none on another.
  await page.mouse.click(1000, 120);
  await page.keyboard.press('Shift+Digit1');
  await expect(world).toHaveAttribute('data-rendered-cards', '12');
  await settledLayout();
  const fitFrame = (await frame.boundingBox())!;
  const boxes = await page.getByTestId('orb-card').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  expect(boxes).toHaveLength(12);
  for (const [i, b] of boxes.entries()) {
    expect(b.x).toBeGreaterThanOrEqual(fitFrame.x);
    expect(b.y).toBeGreaterThanOrEqual(fitFrame.y);
    expect(b.x + b.width).toBeLessThanOrEqual(fitFrame.x + fitFrame.width + 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(fitFrame.y + fitFrame.height + 0.5);
    for (const o of boxes.slice(i + 1)) expect(overlap(b, o), JSON.stringify([b, o])).toBe(false);
  }
  // The frame below it (04) was pushed down instead of being grown over: no two frames overlap.
  const frames = await page.getByTestId('orb-frame').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  expect(frames).toHaveLength(5);
  for (const [i, f] of frames.entries())
    for (const o of frames.slice(i + 1)) expect(overlap(f, o)).toBe(false);
  await capture('grid-fit');

  // Zoomed in on one card (full detail: content decides a card's height), the drawn cards still do not overlap.
  await page.getByTestId('orb-card').nth(5).getByTestId('card-select').check();
  await page.keyboard.press('Shift+Digit2');
  await expect(world).toHaveAttribute('data-lod', 'full');
  await settledLayout();
  const full = await page.getByTestId('orb-card').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  expect(full.length).toBeGreaterThan(1);
  for (const [i, b] of full.entries()) for (const o of full.slice(i + 1)) expect(overlap(b, o)).toBe(false);
  await capture('grid-full');
});

test('a stack stands for its cards: one stack card, links drawn to it, the reader lists what it holds', async () => {
  await page.evaluate((id) => {
    location.hash = `#/canvas/${id}`;
  }, seeded.canvasId);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-canvas-id', seeded.canvasId);
  await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
  const world = page.getByTestId('world');
  // The stack, the loose Scout card and the user's note; the two stacked cards are not drawn.
  await expect(world).toHaveAttribute('data-total-cards', '3');
  for (const id of seeded.stacked) await expect(page.locator(`[data-card-id="${id}"]`)).toHaveCount(0);
  const stack = page.locator(`[data-card-id="${seeded.stackId}"]`);
  await expect(stack).toHaveAttribute('data-stack', '2');
  await expect(stack.getByTestId('orb-card-kind')).toHaveText('stack · 2 cards');
  await expect(stack.getByTestId('orb-card-title')).toHaveText('Two papers on Y');
  await expect(stack.getByTestId('card-stack-items')).toContainText('Paper A');
  await expect(stack.getByTestId('card-stack-items')).toContainText('Paper B');
  await expect(page.locator(`[data-card-id="${seeded.note}"]`)).toBeVisible();
  // The link from Paper A to the note is drawn from the stack.
  const link = page.locator(`[data-testid="orb-link"][data-link-from="${seeded.stacked[0]}"]`);
  await expect(link).toHaveCount(1);
  const stackBox = (await stack.boundingBox())!;
  const linkBox = (await link.boundingBox())!;
  expect(linkBox.x).toBeGreaterThanOrEqual(stackBox.x + stackBox.width / 2);
  await capture('stack');

  await stack.getByTestId('orb-card-title').dblclick();
  const reader = page.getByTestId('reader');
  await expect(reader).toHaveAttribute('data-card-id', seeded.stackId);
  await expect(reader.getByTestId('reader-stack').locator('li')).toHaveCount(2);
  await expect(reader.getByTestId('reader-text')).toHaveText('Both find Y in small samples.');
  await page.getByTestId('reader-close').click();
});
