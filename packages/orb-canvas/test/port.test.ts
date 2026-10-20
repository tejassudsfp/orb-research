/**
 * P4.5 `compose_section` and the canvas service's `port/` state, against a real CanvasStore (the dsh wiring and
 * Orb's compose turn are covered by apps/ui/test/port.contract.test.ts): citations are enforced (an uncited
 * paragraph and an out-of-scope card are refused and nothing is written), sections persist to `port/doc.md` +
 * `port/citations.json`, compose and regenerate jobs, the reading view's edits.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PortDoc } from '@orb/shared';
import { composeSection } from '../src/port.js';
import type { PortEvent } from '../src/portStore.js';
import { CanvasStore } from '../src/store.js';
import type { BoardToolExec } from '../src/tools.js';

let home: string;
let store: CanvasStore;
let canvasId: string;
const ids = {} as { frameA: string; frameB: string; a1: string; a2: string; b1: string };

const exec = (sessionId = 'orb-session-1'): BoardToolExec => ({
  callId: 'call_compose',
  signal: new AbortController().signal,
  agent: {
    id: sessionId,
    options: { provider: 'openai', model: 'gpt-6-luna' },
    session: { header: { cwd: store.dirOf(canvasId) } },
  },
});

async function frame(title: string, x: number): Promise<string> {
  const e = await store.command(canvasId, {
    type: 'frame.added',
    frame: { title, color: 'sky', x, y: 0, w: 600, h: 500 },
  });
  return (e.data as { frame: { id: string } }).frame.id;
}

async function note(frameId: string, text: string, extra: Record<string, unknown> = {}): Promise<string> {
  const e = await store.command(canvasId, {
    type: 'card.added',
    card: { type: 'note', frameId, x: 10, y: 10, w: 200, h: 120, data: { text }, ...extra },
  } as never);
  return (e.data as { card: { id: string } }).card.id;
}

const portFile = (name: string) => join(store.dirOf(canvasId), 'port', name);
const storedDoc = (): PortDoc => JSON.parse(readFileSync(portFile('citations.json'), 'utf8'));

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-port-tool-'));
  store = new CanvasStore({ home, flushMs: 5, searchIndex: false });
  canvasId = (await store.create({ prompt: 'Port board' })).id;
  await store.setRootSession(canvasId, 'orb-session-1');
  await store.setChildAgent(canvasId, 'critic', 'critic-session-1');
  ids.frameA = await frame('Market', 0);
  ids.frameB = await frame('Risks', 700);
  ids.a1 = await note(ids.frameA, 'The market grows 20% a year.');
  ids.a2 = await note(ids.frameA, 'Three incumbents.');
  ids.b1 = await note(ids.frameB, 'Regulation may bite.');
});

afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

const market = (cardIds: string[][], sectionId = 'market') => ({
  sectionId,
  heading: 'Market',
  paragraphs: cardIds.map((c, i) => ({ text: `Paragraph ${i + 1}.`, cardIds: c })),
});

it('requires current evidence pages for reports and resets receipts after source changes or compaction', async () => {
  const { job } = await store.port.begin(canvasId, {
    kind: 'compose',
    format: 'report',
    scope: [ids.frameA],
    instructions: '',
  });
  const actor = { kind: 'agent', agent: 'orb', model: 'm', sessionId: 'orb-session-1' } as const;
  const args = market([[ids.a1]], 'summary');
  let card = (await store.board(canvasId)).current.cards[ids.a1]!;
  try {
    await expect(store.port.composeSection(canvasId, args, actor)).rejects.toThrow(
      'Inspect the full supporting cards',
    );
    store.port.inspected(canvasId, card, 1, 2);
    await expect(store.port.composeSection(canvasId, args, actor)).rejects.toThrow(
      'Inspect the full supporting cards',
    );
    store.port.inspected(canvasId, card, 2, 2);
    await expect(store.port.composeSection(canvasId, args, actor)).resolves.toMatchObject({
      sectionId: 'summary',
    });
    expect(storedDoc().format).toBe('report');
    expect(readFileSync(portFile('doc.md'), 'utf8')).toContain('Status: Draft');
    await store.command(canvasId, {
      type: 'card.updated',
      id: ids.a1,
      patch: { data: { text: 'Changed evidence.' } },
    });
    await expect(store.port.composeSection(canvasId, args, actor)).rejects.toThrow(
      'Inspect the full supporting cards',
    );
    card = (await store.board(canvasId)).current.cards[ids.a1]!;
    store.port.inspected(canvasId, card, 1, 1);
    await store.port.composeSection(canvasId, args, actor);
    store.port.resetInspections(canvasId);
    await expect(store.port.composeSection(canvasId, args, actor)).rejects.toThrow(
      'Inspect the full supporting cards',
    );
  } finally {
    store.port.end(canvasId, job);
  }
});

describe('compose_section: citations are enforced', () => {
  it('rejects an uncited paragraph and writes nothing', async () => {
    await expect(composeSection(store, market([[ids.a1], []]), exec())).rejects.toThrow(
      /^paragraph 2 has no citations: every paragraph needs cardIds/,
    );
    expect(existsSync(join(store.dirOf(canvasId), 'port'))).toBe(false);
  });

  it('rejects a card outside the compose scope, and an id that is no card', async () => {
    const events: PortEvent[] = [];
    const off = store.port.onEvent(canvasId, (e) => events.push(e));
    const { job } = await store.port.begin(canvasId, {
      kind: 'compose',
      scope: [ids.frameA],
      instructions: '',
    });
    await expect(composeSection(store, market([[ids.a1, ids.b1]]), exec())).rejects.toThrow(
      `paragraph 1 cites card ${ids.b1}, which is outside the scope of this document`,
    );
    await expect(composeSection(store, market([['c_doesnotexist']]), exec())).rejects.toThrow(
      /not a card on this board/,
    );
    expect(events.map((e) => e.type)).toEqual(['rejected', 'rejected']);
    expect(existsSync(portFile('citations.json'))).toBe(false);
    store.port.end(canvasId, job);
    off();
  });

  it('is Orb-only: a child agent is refused', async () => {
    await expect(composeSection(store, market([[ids.a1]]), exec('critic-session-1'))).rejects.toThrow(
      'compose_section is not available to the critic agent',
    );
  });
});

describe('compose_section: persistence and jobs', () => {
  it('writes port/citations.json and port/doc.md; a new compose replaces the document with its sections', async () => {
    const events: PortEvent[] = [];
    store.port.onEvent(canvasId, (e) => events.push(e));
    let { job } = await store.port.begin(canvasId, {
      kind: 'compose',
      scope: 'all',
      instructions: 'One page for investors',
    });
    expect(JSON.parse(readFileSync(portFile('instructions.json'), 'utf8'))).toMatchObject({
      instructions: 'One page for investors',
      scope: 'all',
    });
    const r1 = await composeSection(
      store,
      { ...market([[ids.a1, ids.a2]]), figures: [{ cardId: ids.a1, caption: 'Growth' }] },
      exec(),
    );
    expect(r1).toEqual({ sectionId: 'market', position: 1, paragraphs: 1, figures: 1, citations: 2 });
    const r2 = await composeSection(
      store,
      { sectionId: 'risks', heading: 'Risks', paragraphs: [{ text: 'Rules.', cardIds: [ids.b1] }] },
      exec(),
    );
    expect(r2.position).toBe(2);
    expect(job.composed).toEqual(['market', 'risks']);
    store.port.end(canvasId, job);

    const doc = storedDoc();
    expect(doc.title).toBe('Port board');
    expect(doc.instructions).toBe('One page for investors');
    expect(doc.sections.map((s) => [s.id, s.paragraphs[0]!.cardIds, s.model])).toEqual([
      ['market', [ids.a1, ids.a2], 'openai/gpt-6-luna'],
      ['risks', [ids.b1], 'openai/gpt-6-luna'],
    ]);
    const md = readFileSync(portFile('doc.md'), 'utf8');
    expect(md).toContain('## Market');
    expect(md).toContain('Paragraph 1. [1][2]');
    expect(md).toContain('Rules. [3]');
    expect(md).toContain('## References');
    expect(
      events.filter((e) => e.type === 'section').map((e) => (e as { sectionId: string }).sectionId),
    ).toEqual(['market', 'risks']);

    // A new full compose: the old document stays until the first new section, which replaces it.
    ({ job } = await store.port.begin(canvasId, { kind: 'compose', scope: [ids.frameB], instructions: '' }));
    expect(storedDoc().sections).toHaveLength(2);
    await composeSection(
      store,
      { sectionId: 'summary', heading: 'Summary', paragraphs: [{ text: 'Only risks.', cardIds: [ids.b1] }] },
      exec(),
    );
    store.port.end(canvasId, job);
    const next = storedDoc();
    expect(next.sections.map((s) => s.id)).toEqual(['summary']);
    expect(next.version).toBeGreaterThan(doc.version);
    expect(next.scope).toEqual([ids.frameB]);
  });

  it('a regenerate job writes only its section, with the saved scope; edits keep citations', async () => {
    let { job } = await store.port.begin(canvasId, {
      kind: 'compose',
      scope: [ids.frameA],
      instructions: 'Short',
    });
    await composeSection(store, market([[ids.a1], [ids.a2]]), exec());
    store.port.end(canvasId, job);
    await expect(store.port.begin(canvasId, { kind: 'section', sectionId: 'nope' })).rejects.toThrow(
      /no section nope/,
    );

    // The user edits paragraph 1 and adds one of their own.
    const before = storedDoc();
    const [p1, p2] = before.sections[0]!.paragraphs;
    const edited = await store.port.saveEdits(canvasId, {
      version: before.version,
      sections: [
        {
          id: 'market',
          heading: 'Market',
          paragraphs: [
            { id: p1!.id, text: 'My wording.' },
            { id: p2!.id, text: p2!.text },
            { text: 'My own point.' },
          ],
        },
      ],
    });
    expect(
      edited.sections[0]!.paragraphs.map((p) => [p.text, p.cardIds, !!p.edited, !!p.userAuthored]),
    ).toEqual([
      ['My wording.', [ids.a1], true, false],
      [p2!.text, [ids.a2], false, false],
      ['My own point.', [], false, true],
    ]);
    await expect(
      store.port.saveEdits(canvasId, { version: before.version, sections: [] }),
    ).rejects.toMatchObject({
      code: 'orb/conflict',
    });

    // A cancelled new report cannot change the existing document's regeneration contract.
    const cancelled = await store.port.begin(canvasId, {
      kind: 'compose',
      scope: [ids.frameB],
      instructions: 'A different report',
      format: 'report',
    });
    store.port.end(canvasId, cancelled.job);
    ({ job } = await store.port.begin(canvasId, { kind: 'section', sectionId: 'market' }));
    expect(job.scope).toEqual([ids.frameA]);
    expect(job.instructions).toBe('Short');
    expect(job.format).toBeUndefined();
    // Another busy job is refused.
    await expect(store.port.begin(canvasId, { kind: 'section', sectionId: 'market' })).rejects.toMatchObject({
      code: 'orb/busy',
    });
    await expect(
      composeSection(
        store,
        { sectionId: 'other', heading: 'Other', paragraphs: [{ text: 'x', cardIds: [ids.a1] }] },
        exec(),
      ),
    ).rejects.toThrow(/regenerates section "market" only/);
    // The saved scope still holds: frame B is out.
    await expect(composeSection(store, market([[ids.b1]]), exec())).rejects.toThrow(/outside the scope/);
    await composeSection(store, { ...market([[ids.a2]]), heading: 'Market, again' }, exec());
    store.port.end(canvasId, job);
    const regenerated = storedDoc().sections[0]!;
    expect(regenerated.heading).toBe('Market, again');
    // Orb's paragraphs are new; the user's own paragraph survives the regenerate.
    expect(regenerated.paragraphs.map((p) => [p.text, !!p.userAuthored])).toEqual([
      ['Paragraph 1.', false],
      ['My own point.', true],
    ]);
  });

  it('a job needs cards in scope and frames of this canvas', async () => {
    await expect(
      store.port.begin(canvasId, { kind: 'compose', scope: ['f_unknown'], instructions: '' }),
    ).rejects.toMatchObject({
      code: 'orb/not-found',
    });
    const empty = await frame('Empty', 1400);
    await expect(
      store.port.begin(canvasId, { kind: 'compose', scope: [empty], instructions: '' }),
    ).rejects.toThrow(/no cards in this scope/);
  });

  it('without a job, the saved scope applies (else the whole board)', async () => {
    await composeSection(store, market([[ids.b1]], 'free'), exec());
    expect(storedDoc().sections.map((s) => s.id)).toEqual(['free']);
    const { job } = await store.port.begin(canvasId, {
      kind: 'compose',
      scope: [ids.frameA],
      instructions: '',
    });
    store.port.end(canvasId, job);
    await expect(composeSection(store, market([[ids.b1]], 'free'), exec())).rejects.toThrow(
      /outside the scope/,
    );
  });
});
