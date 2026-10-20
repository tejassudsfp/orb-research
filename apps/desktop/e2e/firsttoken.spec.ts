/// <reference lib="dom" />
/**
 * P5.1 streaming (PRD Non-functional requirements: "First token visible within 1 second of the provider responding"),
 * measured with the mock LLM in the real window: the mock stamps the moment it writes the first content chunk
 * (`firstChunkAt`, i.e. the provider has responded, after a simulated 400 ms of model latency); a MutationObserver in
 * the page stamps the moment that chunk's text is in Orb's conversation panel. Latency = visible − firstChunkAt, both
 * `Date.now()` on this machine. 10 turns; every one must be under 1000 ms (the measured p50/p95 go to
 * .orb-dev/e2e-results/firsttoken.json; ORB_UPDATE_PERF=1 also writes docs/perf/p5.1-first-token.json).
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { createCanvas, liveWindow } from './support/ui.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';
import { timingExpect } from '../../../scripts/testkit/namespace.ts';

const desktopDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(desktopDir, '..', '..');
const RUNS = 10;
const BUDGET_MS = 1000;

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-firsttoken-'));
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

const pct = (values: number[], q: number) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]!;
};

test(`Orb's first token is on screen within ${BUDGET_MS} ms of the provider responding (${RUNS} turns)`, async () => {
  await createCanvas(page, 'First token timing');
  const latencies: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const marker = `Marker${i}x`;
    const before = llm.requests.length;
    // The first chunk carries the marker; the rest keep the stream open well past the measurement.
    llm.enqueue({
      chunks: [`${marker} `, ...Array.from({ length: 8 }, (_, k) => `word${k} `)],
      firstDelayMs: 400,
      chunkDelayMs: 150,
    });
    await page.evaluate((m) => {
      const body = document.querySelector('[data-testid="chat-body"]') ?? document.body;
      const w = window as unknown as { __firstSeen?: number };
      delete w.__firstSeen;
      const obs = new MutationObserver(() => {
        if (w.__firstSeen === undefined && body.textContent?.includes(m)) {
          w.__firstSeen = Date.now();
          obs.disconnect();
        }
      });
      obs.observe(body, { childList: true, subtree: true, characterData: true });
    }, marker);
    await page.getByTestId('orb-chat-input').fill(`Question ${i}`);
    await page.getByTestId('orb-chat-send').click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __firstSeen?: number }).__firstSeen))
      .toBeTruthy();
    const seen = (await page.evaluate(() => (window as unknown as { __firstSeen?: number }).__firstSeen))!;
    const req = llm.requests[before]!;
    expect(req.firstChunkAt).toBeDefined();
    latencies.push(seen - req.firstChunkAt!);
    const panel = page.getByTestId('chat-panel');
    await expect(panel).toHaveAttribute('data-turn', 'completed', { timeout: 15_000 });
    await expect(panel).toHaveAttribute('data-agents-state', 'idle');
  }
  const summary = {
    date: new Date().toISOString(),
    runs: RUNS,
    simulatedModelLatencyMs: 400,
    budgetMs: BUDGET_MS,
    latenciesMs: latencies,
    p50: pct(latencies, 0.5),
    p95: pct(latencies, 0.95),
    max: Math.max(...latencies),
  };
  console.log(`first token: ${latencies.join(', ')} ms (p50 ${summary.p50}, p95 ${summary.p95})`);
  const out = `${JSON.stringify(summary, null, 2)}\n`;
  const dir = join(repoRoot, '.orb-dev', 'e2e-results', ...namespaceSegments());
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'firsttoken.json'), out);
  if (process.env.ORB_UPDATE_PERF === '1')
    writeFileSync(join(repoRoot, 'docs', 'perf', 'p5.1-first-token.json'), out);
  timingExpect(() => {
    for (const ms of latencies) expect(ms).toBeLessThan(BUDGET_MS);
  });
});
