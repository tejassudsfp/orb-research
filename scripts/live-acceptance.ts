/**
 * P5.6 acceptance smoke: the whole v0 loop once, live, in the real app (never part of `pnpm test` / `pnpm e2e`).
 *
 *   pnpm tsx scripts/live-acceptance.ts      (after `pnpm build`)
 *   ORB_ACCEPTANCE_APP=/path/to/Orb.app pnpm tsx scripts/live-acceptance.ts   (the packaged app instead)
 *
 * Home box → new canvas → Orb proposes frames → Scout and Critic place cards → Builder places a design frame →
 * Stop all → export the Canvas PDF → compose the research document → export it → the reading view.
 *
 * The key path is the user's: the dev key is read from the dev Keychain (`ai.orb.app`) into a local variable and
 * stored in a throwaway Keychain service (`ai.orb.app.test.*`, removed at the end); the app is launched with NO
 * provider key in its environment, so every request is authenticated only by that Keychain item. Every agent runs on
 * the default model map (openai / gpt-6-luna). The idea asks for a small board, so the run stays cheap.
 *
 * Output: one line per step with its time, then the board, the cost meter and every issue found (page errors,
 * console errors, timeouts, budget or why-line misses, export or compose failures). A summary without any secret
 * or URL goes to `.orb-dev/e2e-results/p5.6-acceptance.json`, screenshots to `.orb-dev/e2e-results/screens/p5.6-*`.
 * Exit code 1 when a step failed. The key and the app's token URL are never printed or written.
 */
import { _electron as electron, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pdfToText } from '../packages/orb-sources/src/extract.ts';
import {
  clearTestKeychain,
  keychainCli,
  keychainSet,
  newTestKeychainService,
  packagedKeychainRuntime,
} from './testkit/keychain.ts';
import { DEV_KEYCHAIN_SERVICE } from './util/devKey.ts';

const root = resolve(import.meta.dirname, '..');
const desktopDir = join(root, 'apps', 'desktop');
const results = join(root, '.orb-dev', 'e2e-results');
const screens = join(results, 'screens');
const packagedApp = process.env.ORB_ACCEPTANCE_APP;

const IDEA =
  'A local-first Mac app that turns voice memos into a searchable research journal for indie founders. ' +
  'Keep it small: 3 frames, and at most 2 cards per agent.';
const BUILDER_ASK =
  'Ask Builder for one first screen of the journal (a single small design frame), nothing else.';
const STOP_ASK = 'Ask Scout for one more source on pricing of voice-memo apps, and Critic for one more risk.';
const DOC_INSTRUCTIONS = 'Keep it short: at most 3 sections, one or two paragraphs each.';

// No provider key from the shell reaches the app: only the Keychain item authenticates it.
for (const name of Object.keys(process.env)) if (/_API_KEY$/.test(name)) delete process.env[name];
// The packaged app reads its Keychain items as itself, so the item is written by its own binary (no prompt).
const runtime = packagedApp ? packagedKeychainRuntime(packagedApp) : undefined;
const got = await keychainCli(['get', DEV_KEYCHAIN_SERVICE, 'OPENAI_API_KEY']).catch(() => undefined);
if (!got || got.code !== 0 || !got.stdout.trim())
  throw new Error('live-acceptance: no OPENAI_API_KEY in the dev Keychain (ai.orb.app)');
const keychainService = newTestKeychainService('accept');
await keychainSet(keychainService, 'OPENAI_API_KEY', got.stdout.trim(), runtime);
got.stdout = '';

type Step = { step: string; ok: boolean; ms: number; detail?: string };
const steps: Step[] = [];
const issues: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();

let current = 'launch';
let closing = false;
async function step(name: string, fn: () => Promise<string | void>): Promise<boolean> {
  current = name;
  const started = Date.now();
  try {
    const detail = (await fn()) ?? undefined;
    steps.push({ step: name, ok: true, ms: Date.now() - started, detail });
    console.log(
      `ok   ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)${detail ? `: ${detail}` : ''}`,
    );
    return true;
  } catch (err) {
    const detail = (err as Error).message.split('\n')[0]!.slice(0, 300);
    steps.push({ step: name, ok: false, ms: Date.now() - started, detail });
    issues.push(`${name}: ${detail}`);
    console.log(`FAIL ${name} (${((Date.now() - started) / 1000).toFixed(1)} s): ${detail}`);
    return false;
  }
}
async function until(what: string, ok: () => Promise<boolean>, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok().catch(() => false)) return;
    await sleep(1000);
  }
  throw new Error(`timed out after ${ms / 1000} s waiting for ${what}`);
}

type Board = {
  frames: Record<string, { title: string }>;
  cards: Record<string, any>;
  links: Record<string, any>;
};
const board = async (page: Page): Promise<Board> =>
  JSON.parse((await page.getByTestId('orb-board-state').textContent()) ?? '{}') as Board;
const byAgent = (b: Board, agent: string) =>
  Object.values(b.cards).filter((c) => c.provenance?.kind === 'agent' && c.provenance.agent === agent);
/** Never print a URL that could carry the app's token. */
const scrub = (s: string) => s.replace(/https?:\/\/127\.0\.0\.1[^\s'")]*/g, '<app-url>').slice(0, 300);

const tmp = mkdtempSync(join(tmpdir(), 'orb-live-acceptance-'));
const orbHome = join(tmp, 'Orb');
const userData = join(tmp, 'electron');
const env: Record<string, string> = {
  ...(process.env as Record<string, string>),
  ORB_DSH_HOME: join(tmp, 'dsh'),
  ORB_HOME: orbHome,
  ORB_USER_DATA: userData,
  ORB_KEYCHAIN_SERVICE: keychainService,
};
delete env.ORB_SKIP_FIRST_RUN;
if (packagedApp) {
  // The packaged app keeps DSH_HOME in userData and finds the Orb folder through location.json (P5.3, P5.4).
  mkdirSync(orbHome, { recursive: true });
  mkdirSync(userData, { recursive: true });
  writeFileSync(join(userData, 'location.json'), `${JSON.stringify({ v: 1, orbHome })}\n`);
}
// A failed launch must not leave the throwaway Keychain item (it holds the real key) behind.
const app = await electron
  .launch(
    packagedApp
      ? {
          executablePath: join(packagedApp, 'Contents', 'MacOS', 'orb'),
          args: [`--user-data-dir=${userData}`],
          env,
        }
      : { args: [desktopDir], env },
  )
  .catch(async (err: unknown) => {
    await clearTestKeychain(keychainService, runtime).catch(() => {});
    rmSync(tmp, { recursive: true, force: true });
    throw err;
  });
mkdirSync(screens, { recursive: true });
const shot = (page: Page, name: string) =>
  page.screenshot({ path: join(screens, `p5.6-${name}.png`) }).catch(() => undefined);

let canvasId = '';
let summary: Record<string, unknown> | undefined;
try {
  const page = await app.firstWindow();
  page.on('pageerror', (e) => issues.push(`page error (${current}): ${scrub(e.message)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !closing) issues.push(`console error (${current}): ${scrub(m.text())}`);
  });
  // The stream socket's life, by step (a dropped socket shows here before any console error).
  const sockets: string[] = [];
  page.on('websocket', (ws) => {
    sockets.push(`open (${current})`);
    ws.on('socketerror', (e) => sockets.push(`error (${current}): ${scrub(String(e))}`));
    ws.on('close', () => sockets.push(`close (${current})`));
  });
  process.on('exit', () => console.log(`stream socket: ${sockets.join('; ')}`));
  // Reveal in Finder is not opened during the run.
  await app.evaluate(({ shell }) => {
    (shell as any).showItemInFolder = () => undefined;
  });

  await step('Home box → new canvas', async () => {
    await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 30_000, waitUntil: 'domcontentloaded' });
    await page.getByTestId('home-prompt').waitFor({ timeout: 30_000 });
    await page.getByTestId('home-prompt').fill(IDEA);
    await page.getByTestId('orb-create').click();
    const screen = page.getByTestId('canvas-screen');
    await screen.waitFor({ timeout: 30_000 });
    await until('the canvas id', async () => !!(await screen.getAttribute('data-canvas-id')), 15_000);
    canvasId = (await screen.getAttribute('data-canvas-id'))!;
  });

  await step('orb proposes frames (≥ 3)', async () => {
    await until('3 frames', async () => Object.keys((await board(page)).frames).length >= 3, 180_000);
    return Object.values((await board(page)).frames)
      .map((f) => f.title)
      .join(' | ');
  });

  await step('Scout and Critic place cards', async () => {
    await until(
      'Scout and Critic cards',
      async () => {
        const b = await board(page);
        return byAgent(b, 'scout').length > 0 && byAgent(b, 'critic').length > 0;
      },
      300_000,
    );
    await shot(page, 'team');
    const b = await board(page);
    return `scout ${byAgent(b, 'scout').length}, critic ${byAgent(b, 'critic').length}`;
  });

  await step('Builder places a design frame', async () => {
    await page.getByTestId('orb-chat-input').fill(BUILDER_ASK);
    await page.getByTestId('orb-chat-input').press('Enter');
    await until('a Builder card', async () => byAgent(await board(page), 'builder').length > 0, 300_000);
    return `builder ${byAgent(await board(page), 'builder').length}`;
  });

  await step('Stop all mid-run (< 1 s), nothing lands after', async () => {
    const chat = page.getByTestId('chat-panel');
    // The team may have finished on its own; then give it one more small job so Stop all hits running agents.
    if ((await chat.getAttribute('data-agents-state')) !== 'running') {
      await page.getByTestId('orb-chat-input').fill(STOP_ASK);
      await page.getByTestId('orb-chat-input').press('Enter');
      await until(
        'running agents',
        async () => (await chat.getAttribute('data-agents-state')) === 'running',
        30_000,
      );
      await sleep(4000);
    }
    const running = await page
      .getByTestId('agent-cursor')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-agent')));
    await page.getByTestId('chat-menu').click();
    await page.getByTestId('stop-all').click();
    await until('stopped', async () => (await chat.getAttribute('data-stop-ms')) !== '', 5_000);
    const ms = Number(await chat.getAttribute('data-stop-ms'));
    const state = await chat.getAttribute('data-agents-state');
    const cardsAtStop = Object.keys((await board(page)).cards).length;
    await sleep(8000);
    const cardsLater = Object.keys((await board(page)).cards).length;
    if (!(ms < 1000)) throw new Error(`Stop all took ${ms} ms`);
    if (cardsLater !== cardsAtStop)
      throw new Error(`${cardsLater - cardsAtStop} card(s) landed after Stop all`);
    return `${ms} ms, agents ${state}, cursors before: ${running.join(', ') || '-'}`;
  });
  await sleep(1500);
  await page
    .getByTestId('chat-minimise')
    .click()
    .catch(() => undefined);
  await page.keyboard.press('Shift+1');
  await sleep(800);
  await shot(page, 'board');
  await page
    .getByTestId('chat-pill')
    .click()
    .catch(() => undefined);

  const b = await board(page);
  const frameTitles = Object.values(b.frames).map((f) => f.title);
  // Board checks a person would notice.
  const perFrame: Record<string, number> = {};
  for (const c of Object.values(b.cards))
    if (c.frameId && !c.stackedInto) perFrame[c.frameId] = (perFrame[c.frameId] ?? 0) + 1;
  for (const [f, n] of Object.entries(perFrame))
    if (n > 12) issues.push(`frame ${b.frames[f]?.title} holds ${n} cards (budget 12)`);
  for (const c of Object.values(b.cards))
    if (c.provenance?.kind === 'agent' && !c.why)
      issues.push(`${c.provenance.agent}'s ${c.type} card has no why line`);

  /** Opens Publish Port in `mode`, runs `action`, and continues past the unread Must read warning. */
  async function inComposer(mode: 'canvas' | 'doc', action: () => Promise<void>) {
    if ((await page.getByTestId('composer').count()) === 0) await page.getByTestId('publish-port').click();
    await page.getByTestId('composer').waitFor();
    await page.getByTestId('composer-mode').locator(`[data-value="${mode}"]`).click();
    await action();
    const warning = page.getByTestId('composer-unread');
    await sleep(500);
    if (await warning.isVisible().catch(() => false)) {
      const n = await warning.getByTestId('composer-unread-card').count();
      console.log(`     (${n} unread Must read card(s): Continue anyway)`);
      await warning.getByTestId('composer-continue').click();
    }
  }
  async function savedPdf(): Promise<{ file: string; pages: number; text: string }> {
    const saved = page.getByTestId('composer-saved');
    const failed = page.getByTestId('composer-status').getByText('Export failed');
    await until(
      'the exported PDF',
      async () => {
        if (await failed.isVisible().catch(() => false))
          throw new Error((await failed.textContent()) ?? 'Export failed');
        return saved.isVisible();
      },
      120_000,
    );
    const file = (await saved.getAttribute('data-file'))!;
    const bytes = readFileSync(file);
    const text = (await pdfToText(new Uint8Array(bytes), 'file:///x.pdf')).text.replace(/\s+/g, ' ');
    return { file, pages: Number(await saved.getAttribute('data-pages')), text };
  }

  let canvasPdf = { pages: 0, chars: 0 };
  await step('Export the Canvas PDF', async () => {
    await inComposer('canvas', () => page.getByTestId('composer-export').click());
    const pdf = await savedPdf();
    canvasPdf = { pages: pdf.pages, chars: pdf.text.length };
    const missing = frameTitles.filter((t) => !pdf.text.toUpperCase().includes(t.toUpperCase()));
    if (missing.length) issues.push(`Canvas PDF misses frame title(s): ${missing.join(', ')}`);
    await page.getByTestId('composer-close').click();
    return `${pdf.pages} page(s), ${pdf.text.length} chars of text`;
  });

  let sections: string[] = [];
  await step('Compose the research document', async () => {
    await inComposer('doc', async () => {
      await page.getByTestId('composer-instructions').fill(DOC_INSTRUCTIONS);
      await page.getByTestId('composer-compose').click();
    });
    const error = page.getByTestId('composer-compose-error');
    await until(
      'the composed document',
      async () => {
        if (await error.isVisible().catch(() => false))
          throw new Error(`compose failed: ${scrub((await error.textContent()) ?? '')}`);
        return (await page.getByTestId('composer-progress').getAttribute('data-phase')) === 'composed';
      },
      300_000,
    );
    sections = await page.getByTestId('composer-progress-section').allTextContents();
    if (sections.length === 0) throw new Error('composed with no sections');
    await shot(page, 'composed');
    return sections.join(' | ');
  });

  let docPdf = { pages: 0, chars: 0, references: false, citations: 0 };
  await step('Export the research document', async () => {
    if ((await page.getByTestId('composer').count()) === 0) {
      await page.getByTestId('publish-port').click();
      await page.getByTestId('composer-mode').locator('[data-value="doc"]').click();
    }
    await page.getByTestId('composer-export').click();
    const pdf = await savedPdf();
    const missing = sections.filter((h) => !pdf.text.includes(h));
    if (missing.length) issues.push(`document PDF misses section heading(s): ${missing.join(', ')}`);
    const doc = JSON.parse(
      readFileSync(join(orbHome, 'canvases', canvasId, 'port', 'citations.json'), 'utf8'),
    );
    const paragraphs = doc.sections.flatMap((s: any) => s.paragraphs);
    const uncited = paragraphs.filter((p: any) => !p.userAuthored && p.cardIds.length === 0).length;
    if (uncited) issues.push(`${uncited} uncited paragraph(s) in the saved document`);
    docPdf = {
      pages: pdf.pages,
      chars: pdf.text.length,
      references: pdf.text.includes('References'),
      citations: paragraphs.reduce((n: number, p: any) => n + p.cardIds.length, 0),
    };
    if (!docPdf.references) issues.push('document PDF has no References list');
    await page.getByTestId('composer-close').click();
    return `${pdf.pages} page(s), ${paragraphs.length} paragraph(s), ${docPdf.citations} citation(s)`;
  });

  await step('Reading view', async () => {
    await page.evaluate((id) => ((globalThis as any).location.hash = `#/port/${id}`), canvasId);
    const screen = page.getByTestId('port-screen');
    await until(
      'the reading view',
      async () => (await screen.getAttribute('data-state')) === 'composed',
      15_000,
    );
    const n = await page.getByTestId('port-section').count();
    const cites = await page.getByTestId('port-cite').count();
    await shot(page, 'reading-view');
    if (cites === 0) throw new Error('no citations in the reading view');
    return `${n} section(s), ${cites} citation link(s)`;
  });

  const cost = page.getByTestId('cost-meter');
  await page.evaluate((id) => ((globalThis as any).location.hash = `#/canvas/${id}`), canvasId);
  await page.getByTestId('canvas-screen').waitFor({ timeout: 15_000 });
  current = 'cost meter';
  if (
    await page
      .getByTestId('chat-pill')
      .isVisible()
      .catch(() => false)
  )
    await page.getByTestId('chat-pill').click();
  await page.getByTestId('chat-menu').click();
  await until(
    'the cost meter',
    async () => Number((await cost.getAttribute('data-total')) || 0) > 0,
    20_000,
  ).catch((e: Error) => issues.push(`cost meter: ${e.message}`));
  const costLine =
    (await cost
      .getByTestId('cost-meter-value')
      .textContent()
      .catch(() => '')) ?? '';
  console.log(`cost meter: ${costLine}`);
  const final = await board(page);
  summary = {
    frames: Object.values(final.frames).map((f) => f.title),
    cards: Object.fromEntries(
      ['orb', 'scout', 'critic', 'builder', 'user'].map((a) => [
        a,
        a === 'user'
          ? Object.values(final.cards).filter((c) => c.provenance?.kind !== 'agent').length
          : byAgent(final, a).length,
      ]),
    ),
    cardTypes: [...new Set(Object.values(final.cards).map((c) => c.type))].sort(),
    links: Object.keys(final.links ?? {}).length,
    models: [
      ...new Set(
        Object.values(final.cards)
          .filter((c) => c.provenance?.kind === 'agent')
          .map((c) => `${c.provenance.provider ?? '?'}/${c.provenance.model}`),
      ),
    ],
    canvasPdf,
    docPdf,
    sections,
    costTokens: Number((await cost.getAttribute('data-total').catch(() => '')) || 0),
    costUsd: Number((await cost.getAttribute('data-usd').catch(() => '')) || 0),
  };
  console.log('\nBoard:');
  for (const agent of ['orb', 'scout', 'critic', 'builder'])
    for (const c of byAgent(final, agent))
      console.log(
        `  ${agent} ${c.type} in ${final.frames[c.frameId]?.title ?? '(open board)'}: ` +
          `${String(c.data?.title ?? c.data?.text ?? '').slice(0, 70)} | why: ${String(c.why ?? '-').slice(0, 70)}`,
      );
  console.log(`\nSummary: ${JSON.stringify(summary)}`);
} finally {
  // Quitting kills the engine, so the page's stream socket fails to reconnect while the window closes: not an issue.
  current = 'quit';
  closing = true;
  await app.close().catch(() => undefined);
  // A failed run keeps its homes (board, session logs; never a key) for a look; a clean one removes them.
  if (steps.some((x) => !x.ok)) console.log(`(failed: kept the run's homes in ${tmp})`);
  else rmSync(tmp, { recursive: true, force: true });
  await clearTestKeychain(keychainService, runtime).catch(() => {});
}

const failed = steps.filter((s) => !s.ok).length;
console.log(
  `\n${steps.length - failed}/${steps.length} steps passed in ${Math.round((Date.now() - t0) / 1000)} s`,
);
console.log(issues.length ? `Issues (${issues.length}):\n  - ${issues.join('\n  - ')}` : 'Issues: none');
writeFileSync(
  join(results, 'p5.6-acceptance.json'),
  JSON.stringify(
    {
      app: packagedApp ? 'packaged' : 'dev',
      seconds: Math.round((Date.now() - t0) / 1000),
      steps,
      issues,
      summary,
    },
    null,
    2,
  ),
);
process.exit(failed ? 1 : 0);
