/**
 * P4.5 contract test: the research document on a REAL sidecar whose model is the mock LLM.
 *
 * - `port.compose` warns about unread Must read cards in scope (`unread`, nothing sent to Orb) unless the user chose
 *   Continue anyway;
 * - Orb gets the compose turn (standard format, the cards in scope with ids) and is offered `compose_section`; an
 *   UNCITED paragraph is rejected (the model gets the error, nothing is written), a card outside the scope is
 *   rejected, cited sections are written to `port/citations.json` + `port/doc.md`, and the stream reports
 *   `started`, `rejected`, each `section`, then `done`;
 * - `port.get`, `port.saveDoc` (text edits keep citations; a user paragraph is `userAuthored`), and
 *   `port.regenerateSection` (Orb rewrites only that section with the saved instructions; the user's paragraph stays).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PortProgress } from '@orb/shared';
import { startMockedSidecar, type MockRequest, type MockedSidecar } from '../../../scripts/testkit/index.ts';
import { createWire, type Wire } from '../src/wire/index.js';

let sc: MockedSidecar;
let wire: Wire;
let canvasId: string;
const ids = {} as { market: string; risks: string; study: string; note: string; risk: string };

beforeAll(async () => {
  sc = await startMockedSidecar();
  wire = createWire(
    { baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket },
    { mux: { backoffBaseMs: 50 }, events: { backoffBaseMs: 50 } },
  );
  const canvas = await wire.orb.canvas.create({ prompt: 'Port contract board' });
  canvasId = canvas.id;
  const frame = async (title: string, x: number) =>
    (
      await wire.orb.board.command(canvasId, {
        type: 'frame.added',
        frame: { title, color: 'sky', x, y: 0, w: 700, h: 600 },
      })
    ).event!.data as { frame: { id: string } };
  ids.market = (await frame('Market', 0)).frame.id;
  ids.risks = (await frame('Risks', 800)).frame.id;
  const card = async (frameId: string, card: Record<string, unknown>) =>
    (
      (
        await wire.orb.board.command(canvasId, {
          type: 'card.added',
          card: { frameId, x: 20, y: 60, w: 300, h: 180, ...card } as never,
        })
      ).event!.data as { card: { id: string } }
    ).card.id;
  ids.study = await card(ids.market, {
    type: 'source',
    badge: 'must',
    data: {
      title: 'Market study 2026',
      url: 'https://example.com/study',
      summary: 'The market grows 20% a year.',
    },
  });
  ids.note = await card(ids.market, { type: 'note', data: { text: 'Three incumbents hold most of it.' } });
  ids.risk = await card(ids.risks, { type: 'note', data: { text: 'Regulation could slow adoption.' } });
});

afterAll(async () => {
  wire?.dispose();
  await sc?.stop();
});

const textOf = (message: any): string =>
  typeof message?.content === 'string'
    ? message.content
    : Array.isArray(message?.content)
      ? message.content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n')
      : '';
const lastUser = (req: MockRequest) =>
  textOf([...(req.body.messages as any[])].reverse().find((m) => m.role === 'user'));
const lastToolMessages = (req: MockRequest): any[] => {
  const messages = req.body.messages as any[];
  const out: any[] = [];
  for (let i = messages.length - 1; i >= 0 && messages[i].role === 'tool'; i--) out.unshift(messages[i]);
  return out;
};

async function collect(iterable: AsyncIterable<PortProgress>): Promise<PortProgress[]> {
  const out: PortProgress[] = [];
  for await (const e of iterable) out.push(e);
  return out;
}

const portFile = (name: string) => join(sc.paths.orbHome, 'canvases', canvasId, 'port', name);

describe('the research document (P4.5)', () => {
  it('warns about unread Must read cards in scope and composes nothing', async () => {
    const before = sc.llm.requests.length;
    const events = await collect(wire.orb.port.compose(canvasId, { scope: 'all' }));
    expect(events).toEqual([
      { type: 'unread', cards: [{ id: ids.study, title: 'Market study 2026', frameId: ids.market }] },
    ]);
    // A scope without the unread card needs no warning; nothing was sent to Orb for the warning.
    expect(sc.llm.requests.length).toBe(before);
  });

  it('Orb composes with compose_section; an uncited paragraph and an out-of-scope card are rejected', async () => {
    const first = sc.llm.requests.length;
    sc.llm.enqueue(
      {
        toolCalls: [
          {
            id: 'call_uncited',
            name: 'compose_section',
            arguments: {
              sectionId: 'summary',
              heading: 'Summary',
              paragraphs: [
                { text: 'The market grows fast.', cardIds: [ids.study] },
                { text: 'And everyone will buy it.', cardIds: [] },
              ],
            },
          },
          {
            id: 'call_summary',
            name: 'compose_section',
            arguments: {
              sectionId: 'summary',
              heading: 'Summary',
              paragraphs: [{ text: 'The market grows about 20% a year.', cardIds: [ids.study, ids.note] }],
            },
          },
          {
            id: 'call_market',
            name: 'compose_section',
            arguments: {
              sectionId: 'market',
              heading: 'Market',
              paragraphs: [{ text: 'Three incumbents hold most of the market.', cardIds: [ids.note] }],
              figures: [{ cardId: ids.study, caption: 'The 2026 market study' }],
            },
          },
        ],
      },
      { text: 'The research document has two sections.' },
    );
    const events = await collect(
      wire.orb.port.compose(canvasId, {
        scope: [ids.market],
        format: 'custom',
        instructions: '',
        continueUnread: true,
      }),
    );
    expect(events.map((e) => e.type)).toEqual(['started', 'rejected', 'section', 'section', 'done']);
    expect(events[0]).toEqual({ type: 'started', cards: 2, frames: 1, standard: false });
    expect(events[1]).toMatchObject({ message: expect.stringMatching(/^paragraph 2 has no citations/) });
    expect(events.slice(2, 4)).toMatchObject([
      { sectionId: 'summary', position: 1, paragraphs: 1, figures: 0 },
      { sectionId: 'market', position: 2, paragraphs: 1, figures: 1 },
    ]);

    // The compose turn: the standard format, the citation rule, the cards in scope with ids (not the other frame's).
    const req = await sc.llm.waitForRequest((r) => r.id === first + 1);
    const prompt = lastUser(req);
    expect(prompt.split('\n')[0]).toBe('Compose the research document');
    expect(prompt).toContain('No instructions: use the standard format.');
    expect(prompt).toContain('sectionId "summary"');
    expect(prompt).toContain('sectionId "market", heading "Market"');
    expect(prompt).toContain('sectionId "open-questions"');
    expect(prompt).toContain('Every paragraph cites the cards it is based on in cardIds');
    expect(prompt).toContain(`[${ids.study}]`);
    expect(prompt).toContain(`[${ids.note}]`);
    expect(prompt).not.toContain(ids.risk);
    expect((req.body.tools as any[]).map((t) => t.function.name)).toContain('compose_section');
    // The model got the rejection as an error result, and the two successes.
    const after = await sc.llm.waitForRequest((r) => r.id === first + 2);
    const results = lastToolMessages(after).map((m) => String(m.content));
    expect(results[0]).toMatch(/paragraph 2 has no citations: every paragraph needs cardIds/);
    expect(JSON.parse(results[1]!)).toEqual({
      sectionId: 'summary',
      position: 1,
      paragraphs: 1,
      figures: 0,
      citations: 2,
    });
    expect(JSON.parse(results[2]!)).toMatchObject({ sectionId: 'market', position: 2 });

    // On disk and through port.get.
    const { doc, instructions } = await wire.orb.port.get(canvasId);
    expect(instructions).toMatchObject({ instructions: '', scope: [ids.market] });
    expect(doc!.sections.map((s) => [s.id, s.paragraphs.map((p) => [p.text, p.cardIds])])).toEqual([
      ['summary', [['The market grows about 20% a year.', [ids.study, ids.note]]]],
      ['market', [['Three incumbents hold most of the market.', [ids.note]]]],
    ]);
    expect(doc!.sections[1]!.figures).toEqual([{ cardId: ids.study, caption: 'The 2026 market study' }]);
    expect(doc!.sections[0]!.model).toBe('orb-mock/mock-1');
    expect(JSON.parse(readFileSync(portFile('citations.json'), 'utf8'))).toEqual(doc);
    const md = readFileSync(portFile('doc.md'), 'utf8');
    expect(md).toContain('The market grows about 20% a year. [1][2]');
    expect(md).toContain('1. Market study 2026. <https://example.com/study>');
    expect(md).not.toContain('everyone will buy it');
  });

  it('a card outside the scope is refused even when Orb is asked in chat', async () => {
    const first = sc.llm.requests.length;
    sc.llm.enqueue(
      {
        toolCalls: [
          {
            id: 'call_out',
            name: 'compose_section',
            arguments: {
              sectionId: 'risks',
              heading: 'Risks',
              paragraphs: [{ text: 'Regulation.', cardIds: [ids.risk] }],
            },
          },
        ],
      },
      { text: 'That card is outside the document.' },
    );
    await wire.orb.chat.send(canvasId, { text: 'add a risks section' });
    const after = await sc.llm.waitForRequest((r) => r.id === first + 2);
    expect(String(lastToolMessages(after)[0].content)).toContain(
      `cites card ${ids.risk}, which is outside the scope of this document`,
    );
    expect((await wire.orb.port.get(canvasId)).doc!.sections.map((s) => s.id)).toEqual(['summary', 'market']);
  });

  it('saveDoc edits text and keeps citations; regenerate rewrites one section and keeps the user paragraph', async () => {
    const { doc } = await wire.orb.port.get(canvasId);
    const summary = doc!.sections[0]!;
    const { doc: edited } = await wire.orb.port.saveDoc(canvasId, {
      version: doc!.version,
      sections: doc!.sections.map((s) => ({
        id: s.id,
        heading: s.heading,
        paragraphs:
          s.id === 'summary'
            ? [
                { id: summary.paragraphs[0]!.id, text: 'My wording of the growth.' },
                { text: 'A point of my own.' },
              ]
            : s.paragraphs.map((p) => ({ id: p.id, text: p.text })),
      })),
    });
    expect(edited.sections[0]!.paragraphs).toMatchObject([
      { text: 'My wording of the growth.', cardIds: [ids.study, ids.note], edited: true },
      { text: 'A point of my own.', cardIds: [], userAuthored: true },
    ]);
    // A stale version is refused.
    await expect(
      wire.orb.port.saveDoc(canvasId, { version: doc!.version, sections: [] }),
    ).rejects.toMatchObject({
      code: 'orb/conflict',
    });

    const first = sc.llm.requests.length;
    sc.llm.enqueue(
      {
        toolCalls: [
          {
            id: 'call_regen',
            name: 'compose_section',
            arguments: {
              sectionId: 'summary',
              heading: 'Summary',
              paragraphs: [{ text: 'Growth is strong; incumbents dominate.', cardIds: [ids.note] }],
            },
          },
        ],
      },
      { text: 'Rewrote the summary.' },
    );
    const { doc: regenerated } = await wire.orb.port.regenerateSection(canvasId, 'summary');
    const req = await sc.llm.waitForRequest((r) => r.id === first + 1);
    const prompt = lastUser(req);
    expect(prompt.split('\n')[0]).toBe('Regenerate one section of the research document');
    expect(prompt).toContain('call compose_section exactly once with sectionId "summary"');
    expect(prompt).toContain('My wording of the growth.');
    expect(prompt).not.toContain(ids.risk);
    expect(regenerated.sections.map((s) => s.id)).toEqual(['summary', 'market']);
    expect(
      regenerated.sections[0]!.paragraphs.map((p) => [p.text, p.cardIds, p.userAuthored ?? false]),
    ).toEqual([
      ['Growth is strong; incumbents dominate.', [ids.note], false],
      ['A point of my own.', [], true],
    ]);
    expect(regenerated.sections[1]).toEqual(edited.sections[1]);
  });

  it('refuses a regenerate of a section that does not exist, and a compose with no cards in scope', async () => {
    await expect(wire.orb.port.regenerateSection(canvasId, 'nope')).rejects.toMatchObject({
      code: 'orb/not-found',
    });
    const empty = (
      await wire.orb.board.command(canvasId, {
        type: 'frame.added',
        frame: { title: 'Empty', color: 'paper', x: 1600, y: 0, w: 500, h: 400 },
      })
    ).event!.data as { frame: { id: string } };
    await expect(collect(wire.orb.port.compose(canvasId, { scope: [empty.frame.id] }))).rejects.toMatchObject(
      {
        code: 'orb/invalid-args',
      },
    );
    expect(existsSync(portFile('doc.md'))).toBe(true);
  });
});
