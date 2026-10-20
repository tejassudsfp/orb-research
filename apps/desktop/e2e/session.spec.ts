/// <reference lib="dom" />
/**
 * P1.5 Done-when, in the real window: the UI creates a session, prompts it, streams the assistant's reply and
 * cancels it, over the gateway wire (apps/ui/src/wire). The sidecar's default model is the local mock LLM.
 */
import { liveWindow } from './support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';

const desktopDir = resolve(import.meta.dirname, '..');

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-session-'));
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

test('the UI creates a session, prompts it and streams the reply', async () => {
  // The raw session probe lives on the diagnostics route (P2.1).
  await page.evaluate(() => (location.hash = '#/dev'));
  await page.getByTestId('probe-create').click();
  await expect(page.getByTestId('probe-session')).toHaveText(/^session-/);
  await expect(page.getByTestId('probe-mux')).toHaveText('open');

  const reply = 'Hello from the engine, streamed word by word.';
  llm.enqueue({ text: reply, chunkDelayMs: 150 });
  await page.getByTestId('probe-input').fill('Say hello');
  await page.getByTestId('probe-send').click();
  // Mid-stream: part of the reply is visible while the turn still runs.
  await expect(page.getByTestId('probe-status')).toHaveText('running');
  await expect(page.getByTestId('probe-reply')).toContainText('Hello from');
  expect(await page.getByTestId('probe-reply').textContent()).not.toBe(reply);
  await expect(page.getByTestId('probe-status')).toHaveText('completed');
  await expect(page.getByTestId('probe-reply')).toHaveText(reply);
  await expect(page.getByTestId('probe-error')).toHaveCount(0);
});

test('the UI cancels a long reply', async () => {
  const before = llm.requests.length;
  llm.enqueue({ chunks: Array.from({ length: 200 }, (_, i) => `w${i} `), chunkDelayMs: 100 });
  await page.getByTestId('probe-input').fill('Write a very long answer');
  await page.getByTestId('probe-send').click();
  await expect(page.getByTestId('probe-reply')).toContainText('w2 ');
  await page.getByTestId('probe-cancel').click();
  await expect(page.getByTestId('probe-status')).toHaveText('aborted', { timeout: 2_000 });
  await expect.poll(() => llm.requests[before]?.aborted).toBe(true);
  expect(llm.requests[before]!.chunksSent).toBeLessThan(200);
  await expect(page.getByTestId('probe-error')).toHaveCount(0);
});
