/// <reference lib="dom" />
/**
 * P6.13 startup / product templates in the real app (temp homes, no model key, so Orb's turn ends in an error and
 * nothing is spent): the eight chips are on Home (the three upgraded v1 ones keep their ids); the customer-discovery
 * intake takes a dropped transcript, which lands as a card in the first frame's free room, and Start creates the
 * canvas with its eleven numbered frames, seeds and four empty databases; the GTM-plan intake validates its required
 * fields before anything is created and creates seven databases. No CSP violation and no request off the sidecar origin.
 */
import { liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { specOf, type BoardEvent, type CanvasMeta, type Card, type Frame } from '@orb/shared';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const desktopDir = resolve(import.meta.dirname, '..');

let tmp: string;
let app: ElectronApplication | undefined;
const consoleLines: string[] = [];
const requests: string[] = [];

test.beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-startup-'));
  consoleLines.length = 0;
  requests.length = 0;
});
test.afterEach(async () => {
  await app?.close().catch(() => undefined);
  app = undefined;
  rmSync(tmp, { recursive: true, force: true });
});

const canvasDir = (id: string) => join(tmp, 'Orb', 'canvases', id);
const canvasIds = () => {
  try {
    return readdirSync(join(tmp, 'Orb', 'canvases')).sort();
  } catch {
    return [];
  }
};
const events = (id: string): BoardEvent[] =>
  readFileSync(join(canvasDir(id), 'board.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BoardEvent);
const metaOf = (id: string) => JSON.parse(readFileSync(join(canvasDir(id), 'canvas.json'), 'utf8')) as CanvasMeta;
const datasetNames = (id: string) => {
  const dir = join(canvasDir(id), 'assets', 'data');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => (JSON.parse(readFileSync(join(dir, f), 'utf8')) as { name: string }).name)
    .sort();
};

async function launch(): Promise<Page> {
  app = await electron.launch({
    args: [desktopDir],
    env: {
      ...process.env,
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_HOME: join(tmp, 'Orb'),
      ORB_USER_DATA: join(tmp, 'electron'),
    } as Record<string, string>,
  });
  const page = await liveWindow(app);
  page.on('console', (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));
  page.on('request', (req) => requests.push(req.url()));
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900);
    await new Promise((r) => setTimeout(r, 300));
  });
  await expect(page.getByTestId('orb-ping')).toHaveText(/^orb-host /);
  await expect(page.getByTestId('orb-root')).toHaveAttribute('data-settings', 'loaded');
  return page;
}

function expectClean(page: Page) {
  const origin = new URL(page.url()).origin;
  expect(requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
  expect(consoleLines.filter((l) => /Content Security Policy|Refused to/i.test(l))).toEqual([]);
}

const cardsOf = (id: string) =>
  events(id).flatMap((e) => (e.type === 'card.added' ? [(e.data as { card: Card }).card] : []));
const framesOf = (id: string) =>
  events(id).flatMap((e) => (e.type === 'frame.added' ? [(e.data as { frame: Frame }).frame] : []));

test('Home lists the startup and product templates; customer discovery takes a dropped transcript', async () => {
  const page = await launch();

  // All eight chips (company, gtm and ui keep their v1 ids).
  const labels: Record<string, RegExp> = {
    'competitive-analysis': /Competitive analysis/,
    'customer-discovery': /Customer discovery/,
    ui: /Product teardown/,
    'pricing-research': /Pricing research/,
    gtm: /GTM plan/,
    'feature-prd': /Feature PRD/,
    'fundraising-prep': /Fundraising prep/,
    company: /Company research/,
  };
  for (const [id, label] of Object.entries(labels))
    await expect(page.locator(`[data-testid="template-chip"][data-template="${id}"]`)).toHaveText(label);

  // ---- The customer-discovery form ----
  const spec = specOf('customer-discovery')!;
  const chip = page.locator('[data-testid="template-chip"][data-template="customer-discovery"]');
  await chip.click();
  await expect(page.getByTestId('intake-form')).toBeVisible();
  for (const f of spec.inputs.filter((x) => !['materials', 'depth', 'sites'].includes(x.id)))
    await expect(page.getByTestId(`intake-${f.id}`)).toBeVisible();
  await expect(page.getByTestId('intake-topic')).toHaveAttribute('aria-required', 'true');
  await expect(page.getByTestId('intake-segment')).not.toHaveAttribute('aria-required', 'true');
  await expect(page.getByTestId('intake-materials')).toBeVisible();
  for (const site of ['linkedin.com', 'g2.com']) await expect(page.getByTestId(`intake-site-${site}`)).toBeDisabled();

  await page.getByTestId('intake-topic').fill('Field expenses');
  await page.getByTestId('intake-segment').fill('Operations managers at logistics firms');
  await page.getByTestId('intake-file-input').setInputFiles({
    name: 'Interview 1.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Interviewer: Tell me about the last time expenses went wrong.\nParticipant: I chase receipts every Friday.\n'),
  });
  await expect(page.getByTestId('intake-files')).toContainText('Interview 1.txt');
  await page.getByTestId('intake-start').click();

  const screen = page.getByTestId('canvas-screen');
  await expect(screen).toHaveAttribute('data-follow', 'open');
  const id = (await screen.getAttribute('data-canvas-id'))!;
  await expect.poll(() => page.locator('[data-testid="orb-frame"]').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('[data-testid="orb-frame-label"]').first()).toContainText(/RESEARCH GOALS/i);

  expect(metaOf(id)).toMatchObject({
    template: 'customer-discovery',
    title: 'Field expenses: customer discovery',
    depth: 'standard',
    intake: { topic: 'Field expenses', segment: 'Operations managers at logistics firms' },
  });
  const frames = framesOf(id);
  expect(frames.map((f) => f.title)).toEqual(spec.frames.map((f) => f.title));
  expect(frames).toHaveLength(11);

  // The dropped transcript is a card in the first frame (its free room), not a seed, and covers no seed.
  await expect.poll(() => cardsOf(id).some((c) => !c.seed)).toBe(true);
  const cards = cardsOf(id);
  const seeds = cards.filter((c) => c.seed);
  expect(seeds).toHaveLength(spec.frames.reduce((n, f) => n + f.seeds.length, 0));
  const dropped = cards.find((c) => !c.seed)!;
  expect(dropped.frameId).toBe(frames[0]!.id);
  for (const s of seeds.filter((c) => c.frameId === frames[0]!.id))
    expect(
      dropped.x + dropped.w <= s.x || s.x + s.w <= dropped.x || dropped.y + dropped.h <= s.y || s.y + s.h <= dropped.y,
    ).toBe(true);
  expect(datasetNames(id)).toEqual(['Evidence log', 'Interviews', 'Recruiting list', 'Themes']);
  await expect(page.locator('[data-testid="orb-card"][data-card-type="database"]').first()).toBeVisible();
  expectClean(page);
});

test('GTM plan: the required fields are validated before anything is created, then seven databases appear', async () => {
  const page = await launch();
  const spec = specOf('gtm')!;
  const chip = page.locator('[data-testid="template-chip"][data-template="gtm"]');
  await chip.click();
  await expect(page.getByTestId('intake-form')).toBeVisible();
  await expect(page.getByTestId('intake-product')).toHaveAttribute('aria-required', 'true');
  for (const id of ['stage', 'customer', 'value', 'price', 'team', 'launch', 'tried', 'competitors', 'geography'])
    await expect(page.getByTestId(`intake-${id}`)).toBeVisible();
  for (const d of ['quick', 'standard', 'deep']) await expect(page.getByTestId(`intake-depth-${d}`)).toBeVisible();

  await page.getByTestId('intake-start').click();
  await expect(page.getByTestId('intake-product')).toHaveAttribute('aria-invalid', 'true');
  expect(canvasIds()).toEqual([]);

  await page.getByTestId('intake-product').fill('Acme Analytics');
  await page.getByTestId('intake-customer').fill('Heads of support at SaaS companies');
  await page.getByTestId('intake-price').fill('$99 per seat per month');
  await page.getByTestId('intake-depth-quick').locator('input').check();
  await page.getByTestId('intake-start').click();

  const screen = page.getByTestId('canvas-screen');
  await expect(screen).toHaveAttribute('data-follow', 'open');
  const id = (await screen.getAttribute('data-canvas-id'))!;
  await expect.poll(() => page.locator('[data-testid="orb-frame"]').count()).toBeGreaterThanOrEqual(3);
  expect(metaOf(id)).toMatchObject({
    template: 'gtm',
    title: 'Acme Analytics: GTM plan',
    depth: 'quick',
    intake: { product: 'Acme Analytics', price: '$99 per seat per month', depth: 'quick' },
  });
  expect(framesOf(id).map((f) => f.title)).toEqual(spec.frames.map((f) => f.title));
  // The price from the form is in the seeded metric note and the GTM brief.
  const seedText = JSON.stringify(cardsOf(id).map((c) => c.data));
  expect(seedText).toContain('$99 per seat per month');
  expect(seedText).not.toContain('{{');
  expect(datasetNames(id)).toEqual([
    'Channels',
    'Competitors',
    'Funnel model',
    'ICP & segments',
    'Launch tasks',
    'Partners',
    'Target accounts',
  ]);
  expectClean(page);
});
