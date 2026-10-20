/**
 * P6.19 live check: the VC due-diligence template on a real public company at Quick depth, with the real model
 * (never part of `pnpm test` / `pnpm e2e`).
 *
 *   pnpm build && pnpm tsx scripts/live-vc.ts
 *
 * Same key path as live-acceptance.ts: the dev key goes from the dev Keychain into a throwaway `ai.orb.app.test.*`
 * service; the app gets no key in its environment. Every agent on openai / gpt-6-luna. There is no Parallel key, so
 * Parallel tools are unavailable ("key needed"); Scout uses web search and fetch. The sidecar's sockets and DNS
 * queries are recorded by scripts/egress/monitor.cjs (hosts only). Stops after the run settles or MAX_MS, then
 * prints cards by agent and type, the cost meter and the egress hosts. Writes .orb-dev/live/p6.19-vc.json (no key).
 */
import { _electron as electron, type Page } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  clearTestKeychain,
  keychainCli,
  keychainSet,
  newTestKeychainService,
} from './testkit/keychain.ts';

const root = resolve(import.meta.dirname, '..');
const desktopDir = join(root, 'apps', 'desktop');
const out = join(root, '.orb-dev', 'live');
const screens = join(root, '.orb-dev', 'e2e-results', 'screens');
const MAX_MS = Number(process.env.ORB_VC_MAX_MS ?? 600_000);
const COMPANY = 'Duolingo';
const WEBSITE = 'duolingo.com';

for (const name of Object.keys(process.env)) if (/_API_KEY$/.test(name)) delete process.env[name];
const got = await keychainCli(['get', 'ai.orb.app', 'OPENAI_API_KEY']).catch(() => undefined);
if (!got || got.code !== 0 || !got.stdout.trim()) throw new Error('live-vc: no dev key in the Keychain');
const service = newTestKeychainService('vc');
if (!service.startsWith('ai.orb.app.test.')) throw new Error('live-vc: bad keychain service');
await keychainSet(service, 'OPENAI_API_KEY', got.stdout.trim());
got.stdout = '';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Board = { frames: Record<string, any>; cards: Record<string, any>; links: Record<string, any> };
const board = async (p: Page) =>
  JSON.parse((await p.getByTestId('orb-board-state').textContent()) ?? '{}') as Board;

const tmp = mkdtempSync(join(tmpdir(), 'orb-live-vc-'));
const monitorLog = join(tmp, 'egress.jsonl');
const t0 = Date.now();
const app = await electron
  .launch({
    args: [desktopDir],
    env: {
      ...(process.env as Record<string, string>),
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_HOME: join(tmp, 'Orb'),
      ORB_USER_DATA: join(tmp, 'electron'),
      ORB_KEYCHAIN_SERVICE: service,
      ORB_EGRESS_MONITOR_LOG: monitorLog,
      NODE_OPTIONS: `--require ${join(root, 'scripts', 'egress', 'monitor.cjs')}`,
    },
  })
  .catch(async (e: unknown) => {
    await clearTestKeychain(service).catch(() => {});
    throw e;
  });
let summary: Record<string, unknown> = {};
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('[data-testid="template-chip"][data-template="vc-dd"]').click();
  await page.getByTestId('intake-company').fill(COMPANY);
  await page.getByTestId('intake-website').fill(WEBSITE);
  await page.getByTestId('intake-stage').selectOption('Growth');
  await page.getByTestId('intake-depth-quick').locator('input').check();
  await page.getByTestId('intake-start').click();
  await page.getByTestId('canvas-screen').waitFor({ timeout: 60_000 });
  mkdirSync(screens, { recursive: true });
  console.log(`started (${Math.round((Date.now() - t0) / 1000)} s)`);

  // Settle: agents idle after having placed cards, or the cap.
  const chat = page.getByTestId('chat-panel');
  // Settled: Scout and Critic have both placed cards and nothing new landed for 90 s (or the cap).
  let lastCount = -1;
  let lastChange = Date.now();
  while (Date.now() - t0 < MAX_MS) {
    await sleep(5000);
    const b = await board(page).catch(() => undefined);
    if (!b) continue;
    const ag = Object.values(b.cards).filter((c) => c.provenance?.kind === 'agent');
    if (ag.length !== lastCount) {
      lastCount = ag.length;
      lastChange = Date.now();
    }
    const who = new Set(ag.map((c) => c.provenance.agent));
    if (who.has('scout') && who.has('critic') && Date.now() - lastChange > 90_000) break;
  }
  const timedOut = Date.now() - t0 >= MAX_MS;
  if ((await chat.getAttribute('data-agents-state')) === 'running') {
    await page.getByTestId('chat-menu').click();
    await page.getByTestId('stop-all').click();
    await sleep(3000);
  }
  await page.screenshot({ path: join(screens, 'p6.19-vc-live.png') });
  const cost = page.getByTestId('cost-meter');
  if (await page.getByTestId('chat-pill').isVisible().catch(() => false)) await page.getByTestId('chat-pill').click();
  await page.getByTestId('chat-menu').click();
  await sleep(1500);
  const costLine = (await cost.getByTestId('cost-meter-value').textContent().catch(() => '')) ?? '';
  const final = await board(page);
  const cards = Object.values(final.cards);
  const agentCards = cards.filter((c) => c.provenance?.kind === 'agent');
  const per = (f: (c: any) => string) =>
    agentCards.reduce<Record<string, number>>((m, c) => ((m[f(c)] = (m[f(c)] ?? 0) + 1), m), {});
  summary = {
    company: COMPANY,
    depth: 'quick',
    seconds: Math.round((Date.now() - t0) / 1000),
    timedOut,
    frames: Object.keys(final.frames).length,
    seedCards: cards.filter((c) => c.seed).length,
    agentCards: agentCards.length,
    byAgent: per((c) => c.provenance.agent),
    byType: per((c) => c.type),
    withWhy: agentCards.filter((c) => c.why).length,
    links: Object.keys(final.links ?? {}).length,
    models: [...new Set(agentCards.map((c) => `${c.provenance.provider ?? '?'}/${c.provenance.model}`))],
    costTokens: Number((await cost.getAttribute('data-total').catch(() => '')) || 0),
    costUsd: Number((await cost.getAttribute('data-usd').catch(() => '')) || 0),
    costLine,
  };
} finally {
  await app.close().catch(() => undefined);
  const hosts = new Set<string>();
  if (existsSync(monitorLog))
    for (const line of readFileSync(monitorLog, 'utf8').split('\n')) {
      try {
        const r = JSON.parse(line);
        const h = r.host ?? r.hostname ?? r.name;
        if (typeof h === 'string' && !/^(127\.0\.0\.1|localhost|::1)$/.test(h)) hosts.add(h);
      } catch {
        /* skip */
      }
    }
  summary.egressHosts = [...hosts].sort();
  summary.monitorLines = existsSync(monitorLog) ? readFileSync(monitorLog, 'utf8').split('\n').length - 1 : 0;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'p6.19-vc.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (process.env.ORB_VC_KEEP) console.log(`kept homes: ${tmp}`);
  else rmSync(tmp, { recursive: true, force: true });
  await clearTestKeychain(service).catch(() => {});
}
