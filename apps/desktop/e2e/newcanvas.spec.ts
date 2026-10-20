/// <reference lib="dom" />
/**
 * P3.3, in the real window: a question typed on Home opens a canvas and starts Orb's new-canvas turn; Orb (the mock
 * LLM, scripted) proposes frames with add_frame, and they appear on the board live, laid out on the template grid.
 * The model got Orb's persona and the user's question. The sidecar's default model is the local mock LLM.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MOCK_KEY_ENV, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { createCanvas, liveWindow } from './support/ui.ts';

const desktopDir = resolve(import.meta.dirname, '..');

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-newcanvas-'));
  llm = await new MockLlm({
    defaultTurn: { text: 'The frames are set up; their research is still incomplete.' },
  }).start();
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

const userText = (message: any): string =>
  typeof message?.content === 'string'
    ? message.content
    : (message?.content ?? []).map((p: any) => p?.text ?? '').join('\n');

test('a question on Home: Orb proposes frames with add_frame and they appear on the board', async () => {
  const titles = ['Thesis', 'Market', 'Competitors', 'Prototype', 'Open questions'];
  llm.enqueue(
    {
      toolCalls: titles.map((title, i) => ({
        id: `call_e2e_frame_${i}`,
        name: 'add_frame',
        arguments: { title },
      })),
    },
    { text: 'Five frames are up: Thesis, Market, Competitors, Prototype and Open questions.' },
  );
  const before = llm.requests.length;
  await createCanvas(page, 'A research canvas for founders');

  const frames = page.getByTestId('orb-frame');
  await expect(frames).toHaveCount(5);
  await expect(page.getByTestId('orb-frame-label')).toHaveText(
    titles.map((t, i) => `${String(i + 1).padStart(2, '0')} ${t.toUpperCase()}`),
  );
  // Laid out on the template grid (3 per row), never overlapping.
  const boxes = await frames.evaluateAll((els) =>
    els.map((el) => {
      const s = (el as HTMLElement).style;
      return [parseFloat(s.left), parseFloat(s.top), parseFloat(s.width), parseFloat(s.height)];
    }),
  );
  expect(boxes).toEqual([
    [96, 120, 400, 300],
    [544, 120, 400, 300],
    [992, 120, 400, 300],
    [96, 468, 400, 300],
    [544, 468, 400, 300],
  ]);
  await expect(page.getByTestId('orb-chat-reply')).toHaveText(
    'The frames are set up; their research is still incomplete.',
  );
  await expect(page.getByTestId('research-coverage')).toContainText('0/5 sections filled');
  await expect(page.getByTestId('orb-error')).toHaveCount(0);

  // The model got Orb's persona and the user's question as the new-canvas turn.
  const kickoff = llm.requests[before]!;
  const messages = kickoff.body.messages as any[];
  expect(userText(messages[0])).toContain('You are orb, a research partner');
  expect(userText(messages.findLast((m) => m.role === 'user'))).toContain(
    "New canvas. The user's question: A research canvas for founders",
  );
});
