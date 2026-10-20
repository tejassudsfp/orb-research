/// <reference lib="dom" />
/**
 * P5.1 startup (PRD Non-functional requirements: "Home visible within 2 seconds of launch, including the sidecar
 * boot. If the sidecar is slower, show Home with a 'warming up' state").
 *
 *   - Launches on fresh temp homes, and relaunches on the same homes: from `electron.launch` to the window SHOWN with
 *     Home in it, and to the live Home (sidecar origin, canvas list loaded: the `orb:home-live` performance mark).
 *     Every launch must show Home under 2 s; on a relaunch the live Home must also be there under 2 s.
 *   - A sidecar held back by 2.5 s (ORB_TEST_SIDECAR_DELAY_MS, unpackaged only): Home is still on screen under 2 s, in
 *     its warming-up state (no engine requests, Start disabled), the user can type, and the draft and template carry
 *     over to the live Home, which then creates the canvas.
 *
 * Measurements go to .orb-dev/e2e-results/startup.json (ORB_UPDATE_PERF=1 also writes docs/perf/p5.1-startup.json).
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';
import { timingExpect } from '../../../scripts/testkit/namespace.ts';

const desktopDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(desktopDir, '..', '..');
const HOME_BUDGET_MS = 2000;
const RUNS = 5;

type Launch = { app: ElectronApplication; page: Page; t0: number; tmp: string };

async function launch(
  extraEnv: Record<string, string | undefined> = {},
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-startup-')),
): Promise<Launch> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    ORB_DSH_HOME: join(tmp, 'dsh'),
    ORB_HOME: join(tmp, 'Orb'),
    ORB_USER_DATA: join(tmp, 'electron'),
    ...extraEnv,
  };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const t0 = Date.now();
  const app = await electron.launch({ args: [desktopDir], env: env as Record<string, string> });
  const page = await app.firstWindow();
  return { app, page, t0, tmp };
}

/** ms from launch to the live Home's `orb:home-live` mark (set when its canvas list arrived; epoch-based). */
async function liveHomeAt({ page, t0 }: Launch): Promise<number> {
  await expect
    .poll(() => page.evaluate(() => performance.getEntriesByName('orb:home-live').length), {
      intervals: [20],
    })
    .toBe(1);
  const at = await page.evaluate(
    () => performance.timeOrigin + performance.getEntriesByName('orb:home-live')[0]!.startTime,
  );
  return Math.round(at - t0);
}

/** Poll until the window is shown AND a Home (warming or live) is rendered in it; returns ms since launch. */
async function homeVisibleAt({ app, page, t0 }: Launch): Promise<{ ms: number; warming: boolean }> {
  for (;;) {
    const shown = await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false,
    );
    const home = await page
      .evaluate(() => {
        const el = document.querySelector('main[data-warming]');
        return el && (el as HTMLElement).offsetParent !== null ? el.getAttribute('data-warming') : null;
      })
      .catch(() => null);
    if (shown && home) return { ms: Date.now() - t0, warming: home === 'yes' };
    if (Date.now() - t0 > 30_000) throw new Error('Home never became visible');
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function close(l: Launch | undefined, keepHome = false): Promise<void> {
  if (!l) return;
  await l.app.close().catch(() => undefined);
  if (!keepHome) rmSync(l.tmp, { recursive: true, force: true });
}

const results: Record<string, unknown> = {};

test.afterAll(() => {
  const out = JSON.stringify(
    { date: new Date().toISOString(), budgetMs: HOME_BUDGET_MS, ...results },
    null,
    2,
  );
  const dir = join(repoRoot, '.orb-dev', 'e2e-results', ...namespaceSegments());
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'startup.json'), `${out}\n`);
  if (process.env.ORB_UPDATE_PERF === '1')
    writeFileSync(join(repoRoot, 'docs', 'perf', 'p5.1-startup.json'), `${out}\n`);
});

test(`Home is on screen within ${HOME_BUDGET_MS} ms of launch, ${RUNS} cold launches`, async () => {
  const home: number[] = [];
  const live: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    let l: Launch | undefined;
    try {
      l = await launch();
      const first = await homeVisibleAt(l);
      home.push(first.ms);
      await expect(l.page.getByTestId('orb-canvas-list')).toHaveAttribute('data-loaded', 'yes');
      live.push(await liveHomeAt(l));
      expect(new URL(l.page.url()).hostname).toBe('127.0.0.1');
      await expect(l.page.getByTestId('home-screen')).toHaveAttribute('data-warming', 'no');
    } finally {
      await close(l);
    }
  }
  results.coldLaunches = { homeVisibleMs: home, liveHomeMs: live };
  console.log(`startup (fresh homes): Home visible ${home.join(', ')} ms; live Home ${live.join(', ')} ms`);
  timingExpect(() => {
    for (const ms of home) expect(ms).toBeLessThan(HOME_BUDGET_MS);
  });
});

test(`relaunches on the same homes (the everyday case): Home within ${HOME_BUDGET_MS} ms`, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-startup-'));
  const home: number[] = [];
  const live: number[] = [];
  try {
    for (let i = 0; i < RUNS + 1; i++) {
      let l: Launch | undefined;
      try {
        l = await launch({}, tmp);
        const first = await homeVisibleAt(l);
        await expect(l.page.getByTestId('orb-canvas-list')).toHaveAttribute('data-loaded', 'yes');
        // The first launch fills the homes and caches; the relaunches after it are measured.
        if (i > 0) {
          home.push(first.ms);
          live.push(await liveHomeAt(l));
        }
      } finally {
        await close(l, true);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  results.relaunches = { homeVisibleMs: home, liveHomeMs: live };
  console.log(`startup (relaunch): Home visible ${home.join(', ')} ms; live Home ${live.join(', ')} ms`);
  timingExpect(() => {
    for (const ms of [...home, ...live]) expect(ms).toBeLessThan(HOME_BUDGET_MS);
  });
});

test('a slow sidecar: Home shows warming up, takes typing, and the draft carries over to the live Home', async () => {
  let l: Launch | undefined;
  try {
    l = await launch({ ORB_TEST_SIDECAR_DELAY_MS: '2500' });
    const { page } = l;
    const requests: string[] = [];
    const consoleLines: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));

    const first = await homeVisibleAt(l);
    expect(first.warming).toBe(true);
    timingExpect(() => {
      expect(first.ms).toBeLessThan(HOME_BUDGET_MS);
    });
    expect(new URL(page.url()).protocol).toBe('orb-boot:');
    await expect(page.getByTestId('home-warming')).toContainText('Warming up');
    await expect(page.getByTestId('warming-orb-create')).toBeDisabled();
    // Nothing for the live Home can act on the boot page by accident.
    await expect(page.getByTestId('home-prompt')).toHaveCount(0);

    await page.getByTestId('warming-home-prompt').fill('Tidal energy in small island grids');
    await page.locator('[data-testid="warming-template-chip"][data-template="topic"]').click();
    // The boot page has no engine: no request leaves it (connect-src 'none'), and nothing is fetched off orb-boot.
    expect(
      await page.evaluate(() =>
        fetch('http://127.0.0.1:9/').then(
          () => 'sent',
          () => 'blocked',
        ),
      ),
    ).toBe('blocked');

    // The sidecar comes up and the live Home takes over with the draft.
    await expect(page.getByTestId('home-screen')).toHaveAttribute('data-warming', 'no', { timeout: 20_000 });
    results.slowSidecar = { delayMs: 2500, warmingHomeVisibleMs: first.ms, liveHomeMs: await liveHomeAt(l) };
    await expect(page.getByTestId('home-prompt')).toHaveValue('Tidal energy in small island grids');
    await expect(page.locator('[data-testid="template-chip"][data-template="topic"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('home-warming')).toHaveCount(0);
    await expect(page.getByTestId('orb-ping')).toHaveText(/^orb-host /);
    // A taken draft is gone: a reload of the live page starts empty.
    await page.reload();
    await expect(page.getByTestId('home-prompt')).toHaveValue('');

    const offline = requests.filter(
      (u) => !/^(orb-boot|data|blob):/.test(u) && !u.startsWith(new URL(page.url()).origin),
    );
    expect(offline).toEqual([]);
    expect(
      consoleLines.filter(
        (c) =>
          /Refused to (load|execute|apply)|Content Security Policy/i.test(c) && !/127\.0\.0\.1:9\b/.test(c),
      ),
    ).toEqual([]);
  } finally {
    await close(l);
  }
});

test('a Keychain held by a macOS prompt: the sidecar starts anyway, and both Homes say what to do', async () => {
  // P6.2 (the P5.gate risk): orb-keychain's read is held 5 s (ORB_KEYCHAIN_TEST_DELAY_MS, honoured only for an
  // `ai.orb.app.test.*` service, so the hint appearing at all proves the test service is in effect).
  expect(process.env.ORB_KEYCHAIN_SERVICE).toMatch(/^ai\.orb\.app\.test\./);
  let l: Launch | undefined;
  try {
    l = await launch({ ORB_KEYCHAIN_TEST_DELAY_MS: '5000' });
    const { page } = l;
    const first = await homeVisibleAt(l);
    timingExpect(() => {
      expect(first.ms).toBeLessThan(HOME_BUDGET_MS);
    });
    // The warming-up Home: main heard orb-keychain's notice on the sidecar's stderr.
    await expect(page.getByTestId('warming-keychain-hint')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('warming-keychain-hint')).toContainText('Always Allow');
    // The sidecar did not wait for the Keychain: the live Home is up long before the read answers.
    await expect(page.getByTestId('home-screen')).toHaveAttribute('data-warming', 'no', { timeout: 10_000 });
    const live = await liveHomeAt(l);
    console.log(`startup with a held Keychain: warming Home ${first.ms} ms, live Home ${live} ms`);
    timingExpect(() => {
      expect(live).toBeLessThan(4_500);
    });
    results.heldKeychain = { delayMs: 5000, warmingHomeVisibleMs: first.ms, liveHomeMs: live };
    await expect(page.getByTestId('keychain-hint')).toBeVisible();
    // Once the Keychain answers, the hint goes.
    await expect(page.getByTestId('keychain-hint')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('orb-ping')).toHaveText(/^orb-host /);
  } finally {
    await close(l);
  }
});

test('first launch: a splash (not Home) while warming, then the first-run sheet before Home', async () => {
  let l: Launch | undefined;
  try {
    // No provider key and the first-run switch off: the sheet must come before Home (PRD Models and keys).
    l = await launch({ ORB_SKIP_FIRST_RUN: undefined, ORB_TEST_SIDECAR_DELAY_MS: '1500' });
    const { page, t0 } = l;
    await expect(page.getByTestId('boot-splash')).toBeVisible();
    const splashMs = Date.now() - t0;
    timingExpect(() => {
      expect(splashMs).toBeLessThan(HOME_BUDGET_MS);
    });
    await expect(page.getByTestId('boot-splash')).toContainText('Warming up');
    // P6.1b: the splash carries the stacked Constellation lockup (96 px mark over the lowercase wordmark).
    const lockup = page.getByTestId('boot-splash').getByTestId('brand-lockup');
    await expect(lockup).toHaveText('orb');
    await expect(lockup.locator('svg[data-mark="full"]')).toHaveAttribute('width', '96');
    expect(await page.locator('main[data-warming]').count()).toBe(0);
    await expect(page.getByTestId('first-run-screen')).toBeVisible({ timeout: 20_000 });
    results.firstLaunch = { delayMs: 1500, splashVisibleMs: splashMs, firstRunSheetMs: Date.now() - t0 };
  } finally {
    await close(l);
  }
});

test('a day Home stays day from launch through the boot → live swap (no night flash)', async () => {
  // P5.1 review: the live page used to paint the night background (and set data-theme=night) for ~60 ms before the
  // saved day theme arrived, between the day warming-up Home and the day live Home.
  const tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-startup-'));
  mkdirSync(join(tmp, 'Orb'), { recursive: true });
  writeFileSync(join(tmp, 'Orb', 'orb.json'), JSON.stringify({ theme: 'day', firstRunDone: true }));
  let l: Launch | undefined;
  try {
    l = await launch({ ORB_SKIP_FIRST_RUN: undefined, ORB_TEST_SIDECAR_DELAY_MS: '800' }, tmp);
    const { page } = l;
    const samples: string[] = [];
    const deadline = Date.now() + 20_000;
    for (;;) {
      const s = await page
        .evaluate(() => {
          const main = document.querySelector('main[data-warming]');
          return JSON.stringify({
            proto: location.protocol,
            theme: document.documentElement.dataset.theme ?? null,
            bg: getComputedStyle(document.body).backgroundColor,
            home: main?.getAttribute('data-warming') ?? null,
          });
        })
        .catch(() => undefined);
      if (s) samples.push(s);
      if (s && JSON.parse(s).home === 'no') break;
      if (Date.now() > deadline) throw new Error('the live Home never came up');
      await new Promise((r) => setTimeout(r, 5));
    }
    const states = samples.map((s) => JSON.parse(s) as { proto: string; theme: string | null; bg: string });
    expect(states.some((s) => s.proto === 'orb-boot:' && s.theme === 'day')).toBe(true);
    expect(states.filter((s) => s.theme === 'night')).toEqual([]);
    // Before a theme is known the body is transparent (the window's day background shows), never night.
    expect(states.filter((s) => s.bg === 'rgb(3, 5, 12)')).toEqual([]);
    await expect(page.getByTestId('home-screen')).toHaveAttribute('data-warming', 'no');
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('day');
  } finally {
    await close(l);
  }
});
