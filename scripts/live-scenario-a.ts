/**
 * Gate 3 live check: PRD Scenario A once with a real model (never part of `pnpm test` / `pnpm e2e`).
 *
 *   pnpm tsx scripts/live-scenario-a.ts      (after `pnpm build`)
 *
 * The key: OPENAI_API_KEY from the environment, else the dev key from the Keychain (`ai.orb.app`, P4.1;
 * scripts/util/devKey.ts), placed in this process's env only. The app itself runs on a throwaway Keychain service.
 *
 * Launches the built app with temp homes and the default model map (every agent on openai / gpt-6-luna), types the
 * idea in the Home box, waits for Orb's frames and for Scout and Critic to place cards, asks for a first screen
 * (Builder), then stops everything and prints what the board holds: frames, cards per agent with their why lines,
 * links, cursors and the Stop all time. Screenshots go to .orb-dev/e2e-results/screens/gate3-live-*.png.
 * The key is read by the harness from the environment; this script never prints it (nor the app's output).
 */
import { _electron as electron, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { clearTestKeychain, newTestKeychainService } from './testkit/keychain.ts';
import { ensureDevKey } from './util/devKey.ts';

const root = resolve(import.meta.dirname, '..');
const desktopDir = join(root, 'apps', 'desktop');
const screens = join(root, '.orb-dev', 'e2e-results', 'screens');
const IDEA =
  'A research canvas where AI agents fill a board for analysts. Keep it small: 3 frames, and at most 2 cards per agent.';
const BUILDER_ASK =
  'Ask Builder for one first screen of the canvas (a single small design frame), nothing else.';

if (!(await ensureDevKey('OPENAI_API_KEY')))
  throw new Error('live-scenario-a: needs OPENAI_API_KEY in the environment or the dev Keychain');
const keychainService = newTestKeychainService('live');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(what: string, ok: () => Promise<boolean>, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok().catch(() => false)) return true;
    await sleep(1000);
  }
  console.log(`  (timed out waiting for ${what})`);
  return false;
}
const board = async (page: Page) =>
  JSON.parse((await page.getByTestId('orb-board-state').textContent()) ?? '{}') as {
    frames: Record<string, { title: string }>;
    cards: Record<string, any>;
    links: Record<string, any>;
  };
const byAgent = (b: Awaited<ReturnType<typeof board>>, agent: string) =>
  Object.values(b.cards).filter((c) => c.provenance?.kind === 'agent' && c.provenance.agent === agent);

const tmp = mkdtempSync(join(tmpdir(), 'orb-live-scenario-a-'));
const t0 = Date.now();
const app = await electron.launch({
  args: [desktopDir],
  env: {
    ...process.env,
    ORB_DSH_HOME: join(tmp, 'dsh'),
    ORB_HOME: join(tmp, 'Orb'),
    ORB_USER_DATA: join(tmp, 'electron'),
    ORB_KEYCHAIN_SERVICE: keychainService,
  } as Record<string, string>,
});
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.getByTestId('home-prompt').fill(IDEA);
  await page.getByTestId('orb-create').click();
  await page.getByTestId('canvas-screen').waitFor();
  mkdirSync(screens, { recursive: true });

  await until('3 frames', async () => Object.keys((await board(page)).frames).length >= 3, 120_000);
  await until(
    'Scout and Critic cards',
    async () => {
      const b = await board(page);
      return byAgent(b, 'scout').length > 0 && byAgent(b, 'critic').length > 0;
    },
    240_000,
  );
  const cursorsMid = await page
    .getByTestId('agent-cursor')
    .evaluateAll((els) => els.map((e) => `${e.getAttribute('data-agent')}: ${e.textContent}`));
  await page.screenshot({ path: join(screens, 'gate3-live-team.png') });

  await page.getByTestId('orb-chat-input').fill(BUILDER_ASK);
  await page.getByTestId('orb-chat-input').press('Enter');
  await until('a Builder card', async () => byAgent(await board(page), 'builder').length > 0, 240_000);
  await sleep(2000);
  const cursorsEnd = await page
    .getByTestId('agent-cursor')
    .evaluateAll((els) => els.map((e) => `${e.getAttribute('data-agent')}: ${e.textContent}`));
  await page.screenshot({ path: join(screens, 'gate3-live-board-100.png') });
  await page.getByTestId('chat-minimise').click(); // (moves the focus off the chat box, so Shift+1 reaches the board)
  await page.keyboard.press('Shift+1');
  await sleep(800);
  await page.screenshot({ path: join(screens, 'gate3-live-board.png') });
  await page.getByTestId('chat-pill').click();

  // Stop all, to cap the run (and time it).
  const chat = page.getByTestId('chat-panel');
  const stateBefore = await chat.getAttribute('data-agents-state');
  let stopMs = '';
  if (stateBefore === 'running') {
    await page.getByTestId('chat-menu').click();
    await page.getByTestId('stop-all').click();
    await until('stopped', async () => (await chat.getAttribute('data-stop-ms')) !== '', 5_000);
    stopMs = `${await chat.getAttribute('data-stop-ms')} (${await chat.getAttribute('data-agents-state')})`;
  }

  const b = await board(page);
  console.log(`Scenario A live (${Math.round((Date.now() - t0) / 1000)} s)`);
  console.log(
    `frames (${Object.keys(b.frames).length}): ${Object.values(b.frames)
      .map((f) => f.title)
      .join(' | ')}`,
  );
  for (const agent of ['orb', 'scout', 'critic', 'builder']) {
    const cards = byAgent(b, agent);
    console.log(`${agent}: ${cards.length} card(s)`);
    for (const c of cards)
      console.log(
        `  - ${c.type} in ${b.frames[c.frameId]?.title ?? '(open board)'}: ${String(c.data?.title ?? '').slice(0, 80)}` +
          ` | why: ${c.why ?? '(none)'} | ${c.provenance.provider ?? ''}/${c.provenance.model}`,
      );
  }
  console.log(
    `links: ${
      Object.values(b.links ?? {})
        .map((l: any) => l.type)
        .join(', ') || '-'
    }`,
  );
  const perFrame: Record<string, number> = {};
  for (const c of Object.values(b.cards))
    if (c.frameId && !c.stackedInto) perFrame[c.frameId] = (perFrame[c.frameId] ?? 0) + 1;
  console.log(
    `cards per frame (budget 12): ${Object.entries(perFrame)
      .map(([f, n]) => `${b.frames[f]?.title}: ${n}`)
      .join(', ')}`,
  );
  console.log(`cursors while the team worked: ${cursorsMid.join('; ') || '-'}`);
  console.log(`cursors at the end: ${cursorsEnd.join('; ') || '-'}`);
  console.log(`agents before Stop all: ${stateBefore}${stopMs ? `, Stop all ${stopMs} ms` : ''}`);
} finally {
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
  await clearTestKeychain(keychainService).catch(() => {});
}
