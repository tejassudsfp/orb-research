/** Real sidecar: full evidence reads, automatic report repair, bounded failure and an explicit Stop. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reportPlanFromFrames, type PortProgress } from '@orb/shared';
import { startMockedSidecar, type MockedSidecar, type MockToolCall } from '../../../scripts/testkit/index.js';
import { createWire, type Wire } from '../src/wire/index.js';
let sc: MockedSidecar;
let wire: Wire;
beforeAll(async () => {
  sc = await startMockedSidecar();
  wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
});
afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
});
async function seed() {
  const meta = await wire.orb.canvas.create({ prompt: 'Professional report fixture', start: false });
  const frame = (
    await wire.orb.board.command(meta.id, {
      type: 'frame.added',
      frame: { title: 'Market', color: 'sky', x: 0, y: 0, w: 800, h: 600 },
    })
  ).event!.data as { frame: { id: string } };
  const added = (
    await wire.orb.board.command(meta.id, {
      type: 'card.added',
      card: {
        type: 'source',
        frameId: frame.frame.id,
        x: 20,
        y: 60,
        w: 300,
        h: 200,
        data: {
          title: 'Market evidence',
          url: 'https://example.com/report-evidence',
          summary: 'The supporting evidence is a synthetic test record.',
        },
        detail: 'Full recorded evidence. '.repeat(500),
      },
    })
  ).event!.data as { card: { id: string } };
  return { canvasId: meta.id, frameId: frame.frame.id, cardId: added.card.id };
}
async function collect(stream: AsyncIterable<PortProgress>) {
  const events: PortProgress[] = [];
  for await (const event of stream) events.push(event);
  return events;
}
it('reads all evidence pages, repairs a partial report, saves canonical order and completes without human follow-up', async () => {
  const { canvasId, frameId, cardId } = await seed();
  const plan = reportPlanFromFrames([{ id: frameId, title: 'Market' }]);
  const tiny = {
    sectionId: 'summary',
    heading: 'Executive summary',
    paragraphs: [{ text: 'A partial summary.', cardIds: [cardId] }],
  };
  const call = (id: string, name: string, args: Record<string, unknown>): MockToolCall => ({
    id,
    name,
    arguments: args,
  });
  sc.llm.enqueue(
    { toolCalls: [call('unread', 'compose_section', tiny)] },
    { toolCalls: [call('read1', 'read_card', { cardId, page: 1 })] },
    { toolCalls: [call('halfread', 'compose_section', tiny)] },
    { toolCalls: [call('read2', 'read_card', { cardId, page: 2 })] },
    { toolCalls: [call('partial', 'compose_section', tiny)] },
    { text: 'The partial report is done.' },
    {
      toolCalls: [...plan].reverse().map((section, i) =>
        call(`section${i}`, 'compose_section', {
          sectionId: section.id,
          heading: section.heading,
          paragraphs: [1, 2, 3].map((n) => ({
            text: `${section.id}: distinct supported analytical point ${n}. `.repeat(30) + ` [${cardId}]`,
            cardIds: [cardId],
          })),
        }),
      ),
    },
    { text: 'The complete report is saved.' },
  );
  const first = sc.llm.requests.length;
  const events = await collect(wire.orb.port.compose(canvasId, { scope: [frameId], continueUnread: true }));
  expect(events.filter((e) => e.type === 'rejected')).toHaveLength(2);
  expect(events.at(-1)).toMatchObject({ type: 'done', sections: 5 });
  const { doc, instructions } = await wire.orb.port.get(canvasId);
  expect(doc!.format).toBe('report');
  expect(instructions!.format).toBe('report');
  expect(doc!.sections.map((s) => s.id)).toEqual(plan.map((s) => s.id));
  expect(doc!.sections.every((s) => s.paragraphs.every((p) => !p.text.includes(`[${cardId}]`)))).toBe(true);
  const requests = sc.llm.requests.slice(first);
  expect(JSON.stringify(requests[0]!.body.messages)).toContain('standard research-report format');
  expect(
    requests.some((r) =>
      JSON.stringify(r.body.messages.at(-1)).includes('Finish the research report already being composed'),
    ),
  ).toBe(true);
  const markdown = readFileSync(join(sc.paths.orbHome, 'canvases', canvasId, 'port', 'doc.md'), 'utf8');
  expect(markdown).toContain('## Contents');
  expect(markdown).toContain('Status: Prepared document');
  expect(markdown).not.toContain('A partial summary.');
  // A completed prior document cannot mask an empty regeneration. Repair must write the new request.
  sc.llm.enqueue(
    { text: 'It is already complete.' },
    {
      toolCalls: [
        call('reread1', 'read_card', { cardId, page: 1 }),
        call('reread2', 'read_card', { cardId, page: 2 }),
      ],
    },
    {
      toolCalls: [
        call('rewrite_summary', 'compose_section', {
          sectionId: 'summary',
          heading: 'Executive summary',
          paragraphs: [1, 2, 3].map((n) => ({
            text: `Revised summary analytical point ${n}. `.repeat(30),
            cardIds: [cardId],
          })),
        }),
      ],
    },
    { text: 'The revised summary is saved.' },
  );
  const { doc: revised } = await wire.orb.port.regenerateSection(canvasId, 'summary');
  expect(revised.version).toBeGreaterThan(doc!.version);
  expect(revised.sections[0]!.paragraphs[0]!.text).toContain('Revised summary');
});
it('stops bounded repair with a useful draft failure instead of reporting completion', async () => {
  const { canvasId, frameId } = await seed();
  const before = sc.llm.requests.length;
  sc.llm.enqueue({ text: 'Done.' }, { text: 'Done again.' }, { text: 'Still done.' });
  const events = await collect(wire.orb.port.compose(canvasId, { scope: [frameId], continueUnread: true }));
  expect(events.at(-1)).toMatchObject({ type: 'failed', message: expect.stringContaining('still a draft') });
  expect(events.some((e) => e.type === 'done')).toBe(false);
  expect(sc.llm.requests.length - before).toBe(3);
});
it('does not restart report writing after Stop all', async () => {
  const { canvasId, frameId } = await seed();
  const before = sc.llm.requests.length;
  sc.llm.enqueue({ firstDelayMs: 5000, text: 'Delayed report.' });
  const running = collect(wire.orb.port.compose(canvasId, { scope: [frameId], continueUnread: true }));
  await sc.llm.waitForRequest((r) => r.id > before);
  await wire.orb.agents.control(canvasId, { action: 'stop', agent: 'all' });
  const events = await running;
  expect(events.at(-1)).toMatchObject({
    type: 'failed',
    message: expect.stringContaining('stopped or paused'),
  });
  await new Promise((done) => setTimeout(done, 100));
  expect(sc.llm.requests.length - before).toBe(1);
});
