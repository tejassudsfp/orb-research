/// <reference lib="dom" />
/**
 * P1.8 Done-when, in the real window: typing "put a card about X on the board" in the UI chat box makes the root
 * Orb agent call place_card (the mock LLM is scripted to), and the card appears live on the board with agent
 * provenance. P1.10: the Stop button stops a streaming reply (agents.status stopping → stopped within 1 s).
 * The sidecar's default model is the local mock LLM; no real key is used.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MOCK_KEY_ENV, MOCK_MODEL, MockLlm, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { LAYOUT_ORB_TOOL_NAMES, LAYOUT_TOOL_NAMES, PARALLEL_ORB_TOOL_NAMES, SCALE_TOOL_NAMES } from '@orb/shared';
import { createCanvas, liveWindow } from './support/ui.ts';
import { timingExpect } from '../../../scripts/testkit/namespace.ts';

const desktopDir = resolve(import.meta.dirname, '..');

let app: ElectronApplication;
let page: Page;
let tmp: string;
let llm: MockLlm;

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'orb-e2e-agent-'));
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

test('"put a card about X on the board" puts a card on the board live', async () => {
  const { canvasId, sessionId } = await createCanvas(page, 'Orb probe canvas');
  await expect(page.getByTestId('orb-card')).toHaveCount(0);

  llm.enqueue(
    {
      toolCalls: [
        {
          id: 'call_e2e_x',
          name: 'place_card',
          arguments: {
            type: 'doc',
            title: 'About X',
            body: 'X, summarised for the board.',
            why: 'You asked for a card about X.',
          },
        },
      ],
    },
    { text: 'The card about X is on the board.' },
  );
  await page.getByTestId('orb-chat-input').fill('put a card about X on the board');
  await page.getByTestId('orb-chat-send').click();

  const card = page.getByTestId('orb-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('orb-card-title')).toHaveText('About X');
  await expect(card.getByTestId('orb-card-why')).toHaveText('Why: You asked for a card about X.');
  await expect(card.getByTestId('orb-card-by')).toHaveText(`orb · ${MOCK_MODEL}`);
  // The agent session is on the author line's hover (P3.6: and in the provenance view).
  await expect(card.getByTestId('orb-card-by')).toHaveAttribute('title', `Session ${sessionId}`);
  await expect(page.getByTestId('orb-chat-reply')).toHaveText('The card about X is on the board.');
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-turn', 'completed');
  await expect(page.getByTestId('orb-error')).toHaveCount(0);

  // The model saw only Orb's board and team tools, and the card is durable in board.jsonl with full provenance.
  expect(llm.requests[0]!.body.tools.map((t: any) => t.function.name).sort()).toEqual([
    'add_frame',
    'add_link',
    'compose_section',
    'compose_slides',
    'delegate',
    'message_agent',
    'place_card',
    'query_board',
    'query_dataset',
    'read_source',
    'stop_agent',
    'update_card',
    'update_frame',
    'upsert_rows',
    ...SCALE_TOOL_NAMES,
    ...LAYOUT_TOOL_NAMES,
    ...LAYOUT_ORB_TOOL_NAMES,
    // P6.7: Orb's Parallel tools.
    ...PARALLEL_ORB_TOOL_NAMES,
  ].sort());
  const cardId = await card.getAttribute('data-card-id');
  await expect
    .poll(() => {
      try {
        return readFileSync(join(tmp, 'Orb', 'canvases', canvasId, 'board.jsonl'), 'utf8');
      } catch {
        return '';
      }
    })
    .toContain(cardId!);
  const [event] = readFileSync(join(tmp, 'Orb', 'canvases', canvasId, 'board.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  expect(event.actor).toEqual({
    kind: 'agent',
    agent: 'orb',
    model: MOCK_MODEL,
    provider: 'orb-mock',
    sessionId,
    toolCallId: 'call_e2e_x',
    // P3.6: where the tool call sits in the session log (the provenance view loads the turn through it).
    eventSeq: expect.any(Number),
  });
});

test('the Stop button stops a streaming reply: stopping → stopped within 1 s', async () => {
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-agents-state', /idle|stopped|running/);
  const before = llm.requests.length;
  llm.enqueue({ text: Array.from({ length: 80 }, (_, i) => `slow${i}`).join(' '), chunkDelayMs: 60 });
  await page.getByTestId('orb-chat-input').fill('write me a long answer');
  await page.getByTestId('orb-chat-send').click();
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-agents-state', 'running');
  await expect(page.getByTestId('orb-chat-reply')).toContainText('slow2');

  await page.getByTestId('orb-stop').click();
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-agents-state', 'stopped');
  const stopMs = Number(await page.getByTestId('chat-panel').getAttribute('data-stop-ms'));
  expect(stopMs).toBeGreaterThanOrEqual(0);
  timingExpect(() => {
    expect(stopMs).toBeLessThan(1_000);
  });
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-turn', 'aborted');
  // Stop is shown only while agents run.
  await expect(page.getByTestId('orb-stop')).toHaveCount(0);
  // The model stream was cut and the reply never finished.
  const req = llm.requests[before]!;
  await expect.poll(() => req.aborted).toBe(true);
  await expect(page.getByTestId('orb-chat-reply')).not.toContainText('slow79');
  await expect(page.getByTestId('orb-error')).toHaveCount(0);
});
