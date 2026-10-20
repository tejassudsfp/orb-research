/// <reference lib="dom" />
/**
 * P6.11 template engine v2 in the real app (temp homes, no model key, so Orb's turn ends in an error and nothing is
 * spent): the VC due-diligence chip opens the intake form; the required fields are validated before anything is
 * created; the depth tiers, the signed-in sources (none connected: shown, disabled) and the materials zone are on the
 * form; Start creates the canvas with the twelve numbered frames, the seed cards and the empty databases (Team,
 * Competitors... with their views), keeps the intake and depth in canvas.json, and puts a dropped CSV (the cap table)
 * into the first frame's free room without covering a seed. No CSP violation and no request off the sidecar origin.
 */
import { liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { specOf, type BoardEvent, type CanvasMeta, type Card, type Frame } from '@orb/shared';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const desktopDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(desktopDir, '..', '..');

let tmp: string;
let app: ElectronApplication | undefined;
const consoleLines: string[] = [];
const requests: string[] = [];

async function capture(page: Page, name: string) {
  if (process.env.ORB_UPDATE_SCREENS !== '1') return;
  await page.waitForTimeout(400);
  const dir = join(repoRoot, 'docs', 'screens');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `p6.11-${name}.png`) });
}

test.beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-templates-'));
});
test.afterAll(async () => {
  await app?.close().catch(() => undefined);
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
const metaOf = (id: string) =>
  JSON.parse(readFileSync(join(canvasDir(id), 'canvas.json'), 'utf8')) as CanvasMeta;

test('Home: the VC due-diligence intake form creates a seeded canvas', async () => {
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

  // ---- The chip opens the form ----
  const chip = page.locator('[data-testid="template-chip"][data-template="vc-dd"]');
  await expect(chip).toHaveText(/VC due diligence/);
  await chip.click();
  const form = page.getByTestId('intake-form');
  await expect(form).toBeVisible();
  await expect(form).toHaveAttribute('role', 'dialog');
  await capture(page, 'intake');

  // Every field of the spec is on it; the required ones are marked.
  for (const id of [
    'company',
    'website',
    'stage',
    'round_amount',
    'round_valuation',
    'round_lead',
    'sector',
    'geography',
    'thesis',
    'concerns',
    'founders',
    'competitors',
  ])
    await expect(page.getByTestId(`intake-${id}`)).toBeVisible();
  await expect(page.getByTestId('intake-company')).toHaveAttribute('aria-required', 'true');
  await expect(page.getByTestId('intake-website')).toHaveAttribute('aria-required', 'true');
  await expect(page.getByTestId('intake-thesis')).not.toHaveAttribute('aria-required', 'true');
  // The three depth tiers, Standard preselected; no signed-in site is connected, so each is shown and disabled.
  await expect(page.getByTestId('intake-depth-standard').locator('input')).toBeChecked();
  for (const d of ['quick', 'standard', 'deep'])
    await expect(page.getByTestId(`intake-depth-${d}`)).toBeVisible();
  for (const site of ['crunchbase.com', 'pitchbook.com', 'linkedin.com', 'docsend.com'])
    await expect(page.getByTestId(`intake-site-${site}`)).toBeDisabled();
  await expect(page.getByTestId('intake-materials')).toBeVisible();

  // ---- Validation happens before anything is created ----
  await page.getByTestId('intake-start').click();
  await expect(
    page.locator('#' + (await page.getByTestId('intake-company').getAttribute('id'))! + '-err'),
  ).toContainText('required');
  await expect(page.getByTestId('intake-company')).toHaveAttribute('aria-invalid', 'true');
  await page.getByTestId('intake-company').fill('Acme Robotics');
  await page.getByTestId('intake-website').fill('not a url');
  await page.getByTestId('intake-start').click();
  await expect(page.getByTestId('intake-website')).toHaveAttribute('aria-invalid', 'true');
  expect(canvasIds()).toEqual([]);

  // Escape closes it and keeps the chip; the chip opens it again with the box's text as the company.
  await page.keyboard.press('Escape');
  await expect(form).toBeHidden();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await chip.click(); // toggles the template off
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('home-prompt').fill('Acme Robotics');
  await chip.click();
  await expect(page.getByTestId('intake-company')).toHaveValue('Acme Robotics');

  // ---- Fill it, drop the cap table, start ----
  await page.getByTestId('intake-website').fill('acme.com');
  await page.getByTestId('intake-stage').selectOption('Series A');
  await page.getByTestId('intake-round_amount').fill('$12M');
  await page.getByTestId('intake-thesis').fill('Warehouse robots that pay back in a year');
  await page.getByTestId('intake-founders').fill('Ada Lovelace, https://linkedin.com/in/ada');
  await page.getByTestId('intake-depth-deep').locator('input').check();
  await page.getByTestId('intake-file-input').setInputFiles({
    name: 'Cap table.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Holder,Shares\nFounders,6000000\nSeed fund,2000000\nOption pool,1000000\n'),
  });
  await expect(page.getByTestId('intake-files')).toContainText('Cap table.csv');
  await page.getByTestId('intake-start').click();

  const screen = page.getByTestId('canvas-screen');
  await expect(screen).toHaveAttribute('data-follow', 'open');
  const id = (await screen.getAttribute('data-canvas-id'))!;
  // The board draws the frames in view (the first row); all twelve are in the log below.
  await expect.poll(() => page.locator('[data-testid="orb-frame"]').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('[data-testid="orb-frame-label"]').first()).toContainText(/SNAPSHOT/i);

  // canvas.json keeps the intake and the depth.
  expect(metaOf(id)).toMatchObject({
    template: 'vc-dd',
    title: 'Acme Robotics: VC due diligence',
    depth: 'deep',
    intake: {
      company: 'Acme Robotics',
      website: 'https://acme.com',
      stage: 'Series A',
      round_amount: '$12M',
      depth: 'deep',
    },
  });

  // The board: 12 frames, the seeds (user's, flagged seed) and the cap table table card in the first frame's room.
  await expect.poll(() => events(id).some((e) => e.type === 'card.added' && (e.data as { card: Card }).card.type === 'table')).toBe(true);
  const log = events(id);
  const frames = log.flatMap((e) => (e.type === 'frame.added' ? [(e.data as { frame: Frame }).frame] : []));
  expect(frames.map((f) => f.title)).toHaveLength(12);
  const cards = log.flatMap((e) => (e.type === 'card.added' ? [(e.data as { card: Card }).card] : []));
  const seeds = cards.filter((c) => c.seed);
  expect(seeds).toHaveLength(specOf('vc-dd')!.frames.reduce((n, f) => n + f.seeds.length, 0));
  expect(seeds.every((c) => c.provenance.kind === 'user')).toBe(true);
  expect(seeds.filter((c) => c.type === 'database')).toHaveLength(7);
  const table = cards.find((c) => c.type === 'table')!;
  expect(table).toBeTruthy();
  expect(table.seed).toBeUndefined();
  const first = frames[0]!;
  expect(table.frameId).toBe(first.id);
  for (const s of seeds.filter((c) => c.frameId === first.id))
    expect(
      table.x + table.w <= s.x || s.x + s.w <= table.x || table.y + table.h <= s.y || s.y + s.h <= table.y,
    ).toBe(true);
  await expect(page.locator('[data-testid="orb-card"][data-card-type="database"]').first()).toBeVisible();

  // The databases exist on disk with the template's schema (Team: 9 columns).
  const dataDir = join(canvasDir(id), 'assets', 'data');
  const datasets = readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  expect(datasets.length).toBe(7);
  const names = datasets
    .map((f) => (JSON.parse(readFileSync(join(dataDir, f), 'utf8')) as { name: string }).name)
    .sort();
  expect(names).toEqual([
    'Comparable valuations',
    'Competitors',
    'Customers',
    'Funding rounds',
    'KPIs',
    'Market sizing inputs',
    'Team',
  ]);
  await capture(page, 'canvas');

  // The origin stayed the sidecar's; no CSP violation.
  const origin = new URL(page.url()).origin;
  expect(
    requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')),
  ).toEqual([]);
  expect(consoleLines.filter((l) => /Content Security Policy|Refused to/i.test(l))).toEqual([]);
});
