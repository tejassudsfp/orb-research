/**
 * @orb/port (BUILD_PLAN P4.5): the citation rule of `compose_section`, section upserts, the reading view's edits,
 * the Markdown and the `port/` files. Gate 4: "a test tries an uncited paragraph and expects a rejection".
 */
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { citationNumbers, type Card } from '@orb/shared';
import {
  applyEdits,
  emptyDoc,
  isPortError,
  readPort,
  renderMarkdown,
  upsertSection,
  validateSection,
  writeInstructions,
  writePortDoc,
} from '../src/index.js';

const scope = new Set(['c_a', 'c_b', 'c_c']);
const board = new Set([...scope, 'c_outside']);
const inScope = (id: string) => scope.has(id);
const exists = (id: string) => board.has(id);

const section = (paragraphs: unknown, figures?: unknown) => ({
  sectionId: 'market',
  heading: 'Market',
  paragraphs,
  ...(figures !== undefined ? { figures } : {}),
});

function refusal(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (err) {
    if (isPortError(err)) return { code: err.code, message: err.message };
    throw err;
  }
  throw new Error('expected a refusal');
}

describe('validateSection (the citation rule)', () => {
  it('rejects a paragraph without citations', () => {
    const r = refusal(() =>
      validateSection(
        section([
          { text: 'Cited.', cardIds: ['c_a'] },
          { text: 'An uncited claim.', cardIds: [] },
        ]),
        inScope,
        exists,
      ),
    );
    expect(r.code).toBe('uncited');
    expect(r.message).toMatch(/^paragraph 2 has no citations/);
  });

  it('normalizes backed inline card references without allowing untracked citations or citation-only prose', () => {
    const ok = validateSection(
      section([{ text: 'The evidence [c_a] supports the conclusion. [c_a] [c_b]', cardIds: ['c_a', 'c_b'] }]),
      inScope,
    );
    expect(ok.paragraphs).toEqual([
      { text: 'The evidence supports the conclusion.', cardIds: ['c_a', 'c_b'] },
    ]);
    expect(
      refusal(() => validateSection(section([{ text: 'A claim. [c_b]', cardIds: ['c_a'] }]), inScope))
        .message,
    ).toContain('missing from cardIds');
    expect(
      refusal(() => validateSection(section([{ text: '[c_a]', cardIds: ['c_a'] }]), inScope)).message,
    ).toContain('needs analytical text');
  });

  it('rejects whitespace-only card ids as no citations', () => {
    expect(
      refusal(() => validateSection(section([{ text: 'x', cardIds: ['  '] }]), inScope, exists)).code,
    ).toBe('uncited');
  });

  it('rejects a paragraph with no cardIds field at all', () => {
    expect(refusal(() => validateSection(section([{ text: 'x' }]), inScope, exists)).code).toBe('invalid');
  });

  it('rejects ids outside the scope, and ids that are not cards on the board', () => {
    const out = refusal(() =>
      validateSection(section([{ text: 'x', cardIds: ['c_a', 'c_outside'] }]), inScope, exists),
    );
    expect(out.code).toBe('out-of-scope');
    expect(out.message).toContain('outside the scope');
    const unknown = refusal(() =>
      validateSection(section([{ text: 'x', cardIds: ['c_nope'] }]), inScope, exists),
    );
    expect(unknown.message).toContain('not a card on this board');
  });

  it('rejects figures outside the scope', () => {
    const r = refusal(() =>
      validateSection(
        section([{ text: 'x', cardIds: ['c_a'] }], [{ cardId: 'c_outside', caption: 'c' }]),
        inScope,
        exists,
      ),
    );
    expect(r.message).toMatch(/^figure 1 cites card c_outside/);
  });

  it('rejects a section with no paragraphs, a bad id or no heading', () => {
    expect(refusal(() => validateSection(section([]), inScope)).code).toBe('invalid');
    expect(
      refusal(() =>
        validateSection({ ...section([{ text: 'x', cardIds: ['c_a'] }]), sectionId: 'Bad Id' }, inScope),
      ).code,
    ).toBe('invalid');
    expect(
      refusal(() =>
        validateSection({ ...section([{ text: 'x', cardIds: ['c_a'] }]), heading: '  ' }, inScope),
      ).code,
    ).toBe('invalid');
  });

  it('accepts cited paragraphs, collapses duplicate ids and figures', () => {
    const ok = validateSection(
      section(
        [{ text: ' The market grows. ', cardIds: ['c_a', 'c_a', 'c_b'] }],
        [
          { cardId: 'c_c', caption: 'A table' },
          { cardId: 'c_c', caption: 'again' },
        ],
      ),
      inScope,
      exists,
    );
    expect(ok).toEqual({
      sectionId: 'market',
      heading: 'Market',
      paragraphs: [{ text: 'The market grows.', cardIds: ['c_a', 'c_b'] }],
      figures: [{ cardId: 'c_c', caption: 'A table' }],
    });
  });
});

const base = () => emptyDoc({ title: 'Board', scope: 'all', instructions: '' }, 1000);

describe('documents', () => {
  it('upsertSection appends, then replaces in place and keeps user paragraphs', () => {
    let { doc } = upsertSection(
      base(),
      {
        sectionId: 'summary',
        heading: 'Summary',
        paragraphs: [{ text: 'S', cardIds: ['c_a'] }],
        figures: [],
      },
      { now: 1 },
    );
    ({ doc } = upsertSection(
      doc,
      { sectionId: 'market', heading: 'Market', paragraphs: [{ text: 'M', cardIds: ['c_b'] }], figures: [] },
      { now: 2 },
    ));
    expect(doc.sections.map((s) => s.id)).toEqual(['summary', 'market']);
    expect(doc.version).toBe(2);
    // The user adds a paragraph to Summary, then Orb regenerates Summary.
    doc = applyEdits(
      doc,
      {
        version: doc.version,
        sections: doc.sections.map((s) => ({
          id: s.id,
          heading: s.heading,
          paragraphs: [
            ...s.paragraphs.map((p) => ({ id: p.id, text: p.text })),
            ...(s.id === 'summary' ? [{ text: 'Mine.' }] : []),
          ],
        })),
      },
      3,
    );
    const r = upsertSection(
      doc,
      {
        sectionId: 'summary',
        heading: 'Summary v2',
        paragraphs: [{ text: 'S2', cardIds: ['c_c'] }],
        figures: [],
      },
      { now: 4, model: 'orb-mock/mock-1' },
    );
    expect(r.position).toBe(1);
    expect(r.doc.sections[0]!.heading).toBe('Summary v2');
    expect(r.doc.sections[0]!.paragraphs.map((p) => [p.text, p.cardIds, p.userAuthored ?? false])).toEqual([
      ['S2', ['c_c'], false],
      ['Mine.', [], true],
    ]);
    expect(r.doc.sections[0]!.model).toBe('orb-mock/mock-1');
    expect(r.doc.sections[1]!.heading).toBe('Market');
  });

  it('applyEdits keeps citations of edited paragraphs, marks user paragraphs, refuses stale versions', () => {
    const { doc } = upsertSection(
      base(),
      {
        sectionId: 'market',
        heading: 'Market',
        paragraphs: [
          { text: 'Orb wrote this.', cardIds: ['c_a', 'c_b'] },
          { text: 'Second.', cardIds: ['c_c'] },
        ],
        figures: [],
      },
      { now: 1 },
    );
    const [p1, p2] = doc.sections[0]!.paragraphs;
    const next = applyEdits(
      doc,
      {
        version: doc.version,
        sections: [
          {
            id: 'market',
            heading: 'Market size',
            paragraphs: [{ id: p1!.id, text: 'I rewrote this.' }, { text: 'A paragraph of my own.' }],
          },
        ],
      },
      5,
    );
    const ps = next.sections[0]!.paragraphs;
    expect(next.sections[0]!.heading).toBe('Market size');
    expect(ps[0]).toMatchObject({
      id: p1!.id,
      text: 'I rewrote this.',
      cardIds: ['c_a', 'c_b'],
      edited: true,
    });
    expect(ps[1]).toMatchObject({ text: 'A paragraph of my own.', cardIds: [], userAuthored: true });
    expect(ps.some((p) => p.id === p2!.id)).toBe(false); // removed
    expect(next.version).toBe(doc.version + 1);
    expect(refusal(() => applyEdits(next, { version: doc.version, sections: [] }, 6)).code).toBe('conflict');
    expect(
      refusal(() =>
        applyEdits(
          next,
          {
            version: next.version,
            sections: [{ id: 'market', heading: 'x', paragraphs: [{ id: 'p_nope', text: 'x' }] }],
          },
          6,
        ),
      ).code,
    ).toBe('not-found');
  });

  it('numbers citations by first use and renders Markdown with references', () => {
    const { doc } = upsertSection(
      base(),
      {
        sectionId: 'a',
        heading: 'A',
        paragraphs: [
          { text: 'One.', cardIds: ['c_b'] },
          { text: 'Two.', cardIds: ['c_a', 'c_b'] },
        ],
        figures: [{ cardId: 'c_c', caption: 'The table' }],
      },
      { now: 1 },
    );
    expect([...citationNumbers(doc)]).toEqual([
      ['c_b', 1],
      ['c_a', 2],
    ]);
    const cards: Record<string, Card> = {
      c_a: {
        id: 'c_a',
        type: 'source',
        data: { title: 'A study', url: 'https://example.com/a', summary: 's' },
      } as unknown as Card,
      c_b: { id: 'c_b', type: 'note', data: { text: 'A note' } } as unknown as Card,
      c_c: {
        id: 'c_c',
        type: 'table',
        data: { title: 'Prices', columns: ['a'], rows: [['1']] },
      } as unknown as Card,
    };
    const md = renderMarkdown(doc, (id) => cards[id]);
    expect(md).toContain('# Board');
    expect(md).toContain('## A');
    expect(md).toContain('One. [1]');
    expect(md).toContain('Two. [2][1]');
    expect(md).toContain('> **Table 1.** The table (card c_c)');
    expect(md).toContain('2. A study. <https://example.com/a> (card c_a)');
  });
});

describe('storage', () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), 'orb-port-'));
    dirs.push(d);
    return d;
  };

  it('writes citations.json, doc.md and instructions.json, and reads them back', async () => {
    const dir = tmp();
    expect(await readPort(dir)).toEqual({ doc: null, instructions: null });
    const { doc } = upsertSection(
      base(),
      { sectionId: 'a', heading: 'A', paragraphs: [{ text: 'One.', cardIds: ['c_a'] }], figures: [] },
      { now: 1 },
    );
    await writePortDoc(dir, doc, '# Board\n');
    await writeInstructions(dir, { instructions: 'Investor memo', scope: ['f_1'], savedAt: 5 });
    expect(readFileSync(join(dir, 'port', 'doc.md'), 'utf8')).toBe('# Board\n');
    expect(
      JSON.parse(readFileSync(join(dir, 'port', 'citations.json'), 'utf8')).sections[0].paragraphs[0].cardIds,
    ).toEqual(['c_a']);
    const back = await readPort(dir);
    expect(back.doc).toEqual(doc);
    expect(back.instructions).toEqual({ instructions: 'Investor memo', scope: ['f_1'], savedAt: 5 });
  });

  it('refuses a port folder that is a symlink out of the canvas', async () => {
    const dir = tmp();
    symlinkSync(tmp(), join(dir, 'port'));
    await expect(writePortDoc(dir, base(), '')).rejects.toThrow(/not a folder of this canvas/);
  });
});
