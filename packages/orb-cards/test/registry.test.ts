/**
 * P3.1: the orb-cards registry holds the host halves of the card contract for all eleven card types (Data, Agent
 * tools, Describe), its role permissions are BUILD_PLAN §2.4, and every payload it builds is valid card data.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  AgentName,
  CARD_TYPES,
  CardType,
  PLACEABLE_TYPES,
  cardDataSchema,
  cardKindLabel,
  cardTypeLabel,
  type AssetRef,
} from '@orb/shared';
import {
  AGENT_FIELD_NAMES,
  CARD_REGISTRY,
  CardFieldError,
  DESCRIBE_MAX,
  buildCardData,
  cardDef,
  describeCard,
  fieldGuide,
  mayPlace,
  mermaidSummary,
  patchCardData,
  placeableTypes,
  visibleText,
} from '../src/index.js';

const ctx = {
  now: 1_760_000_000_000,
  async resolveAsset(path: string): Promise<AssetRef> {
    if (!path.startsWith('assets/ok')) throw new CardFieldError(`no asset ${path}`);
    const mime = path.endsWith('.pdf') ? 'application/pdf' : 'image/png';
    return { path, name: path.slice(7), mime, size: 10 };
  },
};

describe('registry', () => {
  it('has all eleven card types, each with every host part of the contract', () => {
    expect(Object.keys(CARD_REGISTRY).sort()).toEqual([...CardType.options].sort());
    for (const type of CardType.options) {
      const def = cardDef(type);
      expect(def.type).toBe(type);
      expect(def.label).toBeTruthy();
      expect(def.purpose).toBeTruthy();
      expect(def.origin).toMatch(/^(user|static|fetched|file|captured)$/);
      expect(def.schema).toBe(cardDataSchema(type));
      expect(typeof def.describe).toBe('function');
      if (type === 'note' || type === 'research' || type === 'watch') {
        // Only the user makes notes; research runs and watches are written by the Parallel service (P6.7): no agent
        // fields, no agent roles.
        expect(def.allowedRoles).toEqual([]);
        expect(def.fields).toBeUndefined();
      } else {
        expect(def.allowedRoles.length).toBeGreaterThan(0);
        expect(def.fields).toBeDefined();
        expect(def.fieldHelp).toBeTruthy();
        expect(typeof def.toData).toBe('function');
      }
    }
    expect(cardDef('design').tools).toEqual(['write_design_frame']);
  });

  it('allowedRoles are exactly the BUILD_PLAN §2.4 card-type permissions', () => {
    for (const role of AgentName.options) {
      expect([...placeableTypes(role)].sort()).toEqual([...PLACEABLE_TYPES[role]].sort());
      for (const type of CardType.options) {
        expect(mayPlace(role, type)).toBe(PLACEABLE_TYPES[role].includes(type));
      }
    }
    expect(placeableTypes('scout')).toEqual([
      'source', 'quote', 'image', 'database', 'chart', 'metric', 'timeline', 'entity', 'product', 'video', 'checklist',
    ]);
    expect(placeableTypes('critic')).toEqual(['question', 'risk', 'matrix', 'insight', 'hypothesis', 'framework', 'math', 'checklist']);
    expect(placeableTypes('builder')).toEqual([
      'design', 'diagram', 'table', 'database', 'chart', 'metric', 'timeline', 'matrix', 'insight', 'hypothesis',
      'decision', 'framework', 'code', 'math', 'checklist',
    ]);
    expect(placeableTypes('orb')).not.toContain('note');
    expect(placeableTypes('orb')).toHaveLength(25);
  });

  it('P6.2: assembled from the shared manifest (schema, roles, label) and one host module per type', () => {
    const typesDir = resolve(import.meta.dirname, '..', 'src', 'types');
    expect(Object.keys(CARD_TYPES)).toEqual([...CardType.options]);
    for (const type of CardType.options) {
      const def = cardDef(type);
      expect(def.schema).toBe(CARD_TYPES[type].schema);
      expect(def.allowedRoles).toEqual(CARD_TYPES[type].roles);
      expect(cardTypeLabel(type)).toBe(CARD_TYPES[type].label);
      expect(existsSync(join(typesDir, `${type}.ts`)), `src/types/${type}.ts`).toBe(true);
      // describe() never throws on data that does not match the type (agents read every card).
      for (const data of [undefined, null, {}, { title: 7 }, 'x'])
        expect(typeof describeCard({ type, data })).toBe('string');
    }
    const modules = readdirSync(typesDir).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    expect(modules.map((f) => f.slice(0, -3)).sort()).toEqual([...CardType.options].sort());
    expect(cardTypeLabel('unknown-type')).toBe('unknown-type');
    expect(cardKindLabel({ type: 'risk', data: { title: 'r', kind: 'claim' } })).toBe('claim');
    expect(cardKindLabel({ type: 'risk', data: { title: 'r' } })).toBe('risk');
    expect(cardKindLabel({ type: 'design', data: {} })).toBe('design frame');
  });

  it('lists every agent field once and documents every type in the field guide', () => {
    expect(new Set(AGENT_FIELD_NAMES).size).toBe(AGENT_FIELD_NAMES.length);
    expect(AGENT_FIELD_NAMES).toEqual(
      expect.arrayContaining(['title', 'body', 'url', 'html', 'mermaid', 'rows']),
    );
    const guide = fieldGuide();
    for (const type of CardType.options.filter((t) => t !== 'note' && t !== 'research' && t !== 'watch')) expect(guide).toContain(`- ${type} (`);
    expect(guide).not.toContain('- note');
    expect(guide).not.toContain('- research');
  });
});

describe('buildCardData / patchCardData', () => {
  it('builds valid card data for each type from agent fields', async () => {
    const samples: Record<string, Record<string, unknown>> = {
      source: { title: 'P', url: 'https://x.org/p', body: 'Summary', excerpts: ['a', 'b'] },
      quote: { title: 'X', body: 'short quote', sourceCardId: 'c_01ABC' },
      image: { title: 'Cap', asset: 'assets/ok.png' },
      file: { title: 'Doc', asset: 'assets/ok.pdf' },
      question: { title: 'Q?' },
      risk: { title: 'R' },
      design: { title: 'D', html: '<p>hi</p>' },
      diagram: { title: 'G', mermaid: 'graph TD; A-->B' },
      table: { title: 'T', columns: ['a'], rows: [['1'], ['2']] },
      doc: { title: 'H', body: 'text' },
    };
    const expected: Record<string, unknown> = {
      source: { title: 'P', url: 'https://x.org/p', summary: 'Summary', excerpts: ['a', 'b'] },
      quote: { title: 'X', body: 'short quote', sourceCardId: 'c_01ABC' },
      image: { title: 'Cap', asset: { path: 'assets/ok.png', name: 'ok.png', mime: 'image/png', size: 10 } },
      file: {
        title: 'Doc',
        pages: null,
        asset: { path: 'assets/ok.pdf', name: 'ok.pdf', mime: 'application/pdf', size: 10 },
      },
      question: { title: 'Q?', state: 'open' },
      risk: { title: 'R', kind: 'risk' },
      design: { title: 'D', html: '<p>hi</p>', updatedAt: ctx.now },
      diagram: { title: 'G', mermaid: 'graph TD; A-->B' },
      table: { title: 'T', columns: ['a'], rows: [['1'], ['2']], totalRows: 2 },
      doc: { title: 'H', body: 'text' },
    };
    for (const [type, fields] of Object.entries(samples)) {
      const data = await buildCardData(type as CardType, fields, ctx);
      expect(data, type).toEqual(expected[type]);
      expect(cardDataSchema(type as CardType).safeParse(data).success).toBe(true);
    }
  });

  it('refuses notes, unknown fields, bad values and missing required fields with readable messages', async () => {
    await expect(buildCardData('note', { title: 'n' }, ctx)).rejects.toThrow(
      'agents cannot create note cards',
    );
    await expect(buildCardData('doc', { title: 't', body: 'b', url: 'https://x.org' }, ctx)).rejects.toThrow(
      'url does not apply to doc cards',
    );
    await expect(buildCardData('doc', { title: 't', body: 'b', a: 1, b: 2 }, ctx)).rejects.toThrow(
      'a, b do not apply to doc cards',
    );
    await expect(buildCardData('doc', { title: 't' }, ctx)).rejects.toThrow(/invalid doc card body/);
    await expect(
      buildCardData('source', { title: 't', url: 'mailto:a@b.c', body: 's' }, ctx),
    ).rejects.toThrow(/url/);
    await expect(buildCardData('image', { title: 't', asset: 'assets/gone.png' }, ctx)).rejects.toThrow(
      'no asset assets/gone.png',
    );
    await expect(buildCardData('image', { title: 't', asset: 'assets/ok.pdf' }, ctx)).rejects.toThrow(
      'not an image',
    );
    await expect(buildCardData('image', { title: 't', asset: 'assets/../x.png' }, ctx)).rejects.toThrow(
      /asset/,
    );
    await expect(
      buildCardData('quote', { title: 't', body: Array.from({ length: 50 }, () => 'w').join(' ') }, ctx),
    ).rejects.toThrow('a quote must be under 50 words');
    await expect(buildCardData('question', { title: 'q', state: 'maybe' }, ctx)).rejects.toThrow(/state/);
    await expect(buildCardData('table', { title: 't', columns: [], rows: [] }, ctx)).rejects.toThrow(
      /columns/,
    );
    await expect(
      buildCardData(
        'source',
        { title: 't', url: 'https://x.org', body: 's', excerpts: Array(6).fill('e') },
        ctx,
      ),
    ).rejects.toThrow(/excerpts/);
  });

  it('patches only the given fields over the current data and re-checks the whole', async () => {
    const current = { title: 'Q?', body: 'ctx', state: 'open', extra: 'kept' };
    expect(await patchCardData('question', current, { state: 'answered', answer: '42' }, ctx)).toEqual({
      ...current,
      state: 'answered',
      answer: '42',
    });
    expect(await patchCardData('question', current, { body: '', answer: null }, ctx)).toBeUndefined();
    await expect(patchCardData('note', current, { body: 'x' }, ctx)).rejects.toThrow(
      'agents cannot edit note',
    );
    const table = { title: 'T', columns: ['a', 'b'], rows: [['1', '2']], totalRows: 1 };
    await expect(patchCardData('table', table, { columns: ['a'] }, ctx)).rejects.toThrow(
      /one cell per column/,
    );
    expect(await patchCardData('table', table, { rows: [] }, ctx)).toMatchObject({ rows: [], totalRows: 0 });
    expect(
      await patchCardData('design', { title: 'D', html: '<p>1</p>' }, { html: '<p>2</p>' }, ctx),
    ).toEqual({
      title: 'D',
      html: '<p>2</p>',
      updatedAt: ctx.now,
    });
  });

  it('property: whatever the fields, a built payload is valid card data or a CardFieldError', async () => {
    const value = fc.oneof(
      fc.string({ maxLength: 60 }),
      fc.constantFrom('https://x.org/a', 'assets/ok.png', 'assets/ok.pdf', 'c_01X', 'open', 'claim', ''),
      fc.integer({ min: -5, max: 5000 }),
      fc.array(fc.string({ maxLength: 10 }), { maxLength: 4 }),
      fc.array(fc.array(fc.string({ maxLength: 5 }), { maxLength: 3 }), { maxLength: 3 }),
      fc.constant(null),
    );
    const fields = fc.dictionary(fc.constantFrom(...AGENT_FIELD_NAMES, 'junk'), value, { maxKeys: 6 });
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...CardType.options), fields, async (type, f) => {
        try {
          const data = await buildCardData(type, f, ctx);
          expect(cardDataSchema(type).safeParse(data).success).toBe(true);
          expect(describeCard({ type, data }).length).toBeLessThanOrEqual(DESCRIBE_MAX);
        } catch (err) {
          expect(err).toBeInstanceOf(CardFieldError);
        }
      }),
      { numRuns: 400 },
    );
  });
});

describe('describe()', () => {
  const d = (type: CardType, data: unknown) => describeCard({ type, data });

  it('describes every type in plain text', () => {
    expect(d('note', { title: 'Mine', body: 'my  thoughts\non X' })).toBe('my thoughts on X');
    expect(
      d('source', { url: 'https://x.org', title: 'X', summary: 'It finds Y.', excerpts: ['Y holds.', ' '] }),
    ).toBe('https://x.org — It finds Y. — Excerpts: "Y holds."');
    expect(d('source', { url: 'https://x.org' })).toBe('https://x.org');
    expect(
      d('quote', { title: 'Example', body: 'Y holds.', url: 'https://x.org', sourceCardId: 'c_1' }),
    ).toBe('"Y holds." — Example, https://x.org (source card c_1)');
    expect(d('question', { title: 'Q', body: 'Small n.', state: 'open' })).toBe('Open question. Small n.');
    expect(d('question', { title: 'Q', state: 'answered', answer: 'Yes.' })).toBe(
      'Answered question. Answer: Yes.',
    );
    expect(d('question', { title: 'Q', body: '' })).toBe('Open question.');
    expect(d('risk', { title: 'R', body: 'One lab only.', kind: 'claim' })).toBe('Claim: One lab only.');
    expect(d('risk', { title: 'R' })).toBe('Risk');
    expect(
      d('design', {
        title: 'Landing',
        body: 'The hero.',
        html: '<style>h1{color:red}</style><h1>Orb</h1><script>x()</script><p>Canvas &amp; agents</p>',
        updatedAt: 0,
      }),
    ).toBe('HTML mockup. The hero. Visible text: "Orb Canvas & agents". Written 1970-01-01T00:00:00.000Z.');
    expect(d('design', { title: 'D' })).toBe('HTML mockup (no screen yet).');
    expect(
      d('diagram', {
        title: 'G',
        body: 'The loop.',
        mermaid: 'sequenceDiagram\n  A->>B: ask\n  B-->>A: answer',
      }),
    ).toBe('Mermaid sequenceDiagram. The loop. Shows: ask, answer.');
    expect(d('diagram', { title: 'G' })).toBe('Diagram (no Mermaid source yet).');
    expect(d('table', { title: 'T', columns: ['a', 'b'], rows: [['1', '2']], totalRows: 9 })).toBe(
      'Table with columns a, b; 9 rows. First rows: 1 | 2',
    );
    expect(
      d('image', {
        title: 'Chart',
        asset: { path: 'assets/a.png', name: 'a.png', mime: 'image/png', size: 1 },
      }),
    ).toBe('Image "Chart" (a.png).');
    expect(d('doc', { title: 'H', body: 'b'.repeat(900) })).toHaveLength(DESCRIBE_MAX);
    // Data that does not match its type still describes (never throws).
    expect(d('table', { body: 'loose' })).toBe('loose');
    expect(d('source', null)).toBe('');
  });

  it('visibleText and mermaidSummary', () => {
    expect(visibleText('<!-- c --><div>A<br>B</div><svg><text>no</text></svg>&lt;tag&gt;')).toBe('A B <tag>');
    expect(mermaidSummary('flowchart LR\n  a[Start] --> b((Mid))\n  b --> c{Done?}\n  %% comment')).toEqual({
      kind: 'flowchart',
      labels: ['Start', 'Mid', 'Done?'],
    });
  });
});

describe('P6.6 entity, media and technical cards', () => {
  const asset = { path: 'assets/ok.png', name: 'ok.png', mime: 'image/png', size: 10 };
  it('builds valid data for each type from agent fields', async () => {
    const entity = await buildCardData('entity', { title: 'Ada', entityKind: 'org', facts: [{ label: 'HQ', value: 'London' }], photo: 'assets/ok.png' }, ctx);
    expect(entity).toMatchObject({ title: 'Ada', kind: 'org', photo: asset });
    expect((await buildCardData('entity', { title: 'Bo' }, ctx)).kind).toBe('person');
    expect((await buildCardData('product', { title: 'P', entityKind: 'competitor', strengths: ['fast'] }, ctx)).kind).toBe('competitor');
    expect((await buildCardData('product', { title: 'P' }, ctx)).kind).toBe('product');
    const video = await buildCardData('video', { title: 'V', url: 'https://youtu.be/x', thumbnail: 'assets/ok.png' }, ctx);
    expect(video.thumb).toEqual(asset);
    await expect(buildCardData('video', { title: 'V', url: 'https://youtu.be/x', thumbnail: 'assets/ok.pdf' }, ctx)).rejects.toThrow(/not an image/);
    await expect(buildCardData('video', { title: 'V' }, ctx)).rejects.toThrow(CardFieldError);
    await expect(buildCardData('video', { title: 'V', url: 'ftp://x' }, ctx)).rejects.toThrow(CardFieldError);
    expect(await buildCardData('code', { title: 'C', code: 'x = 1', language: 'python' }, ctx)).toMatchObject({ language: 'python' });
    expect(await buildCardData('math', { title: 'M', latex: 'x^2' }, ctx)).toMatchObject({ latex: 'x^2' });
  });

  it('a checklist starts open and an update keeps the user\'s ticks for unchanged items', async () => {
    const made = await buildCardData('checklist', { title: 'T', items: ['A', 'B'] }, ctx);
    expect((made.items as { done: boolean }[]).every((i) => !i.done)).toBe(true);
    const current = {
      title: 'T',
      items: [
        { id: 'i1', text: 'A', done: true },
        { id: 'i2', text: 'B', done: false },
      ],
    };
    const next = await patchCardData('checklist', current, { items: ['A', 'C'] }, ctx);
    expect(next!.items).toEqual([
      { id: 'i1', text: 'A', done: true },
      { id: 'i3', text: 'C', done: false },
    ]);
  });

  it('describes each type in plain text', () => {
    const d = (type: CardType, data: unknown) => describeCard({ type, data });
    expect(d('entity', { title: 'Ada', kind: 'person', role: 'Analyst', facts: [{ label: 'Born', value: '1815' }] })).toMatch(/Person "Ada" \(Analyst\).*Born: 1815/);
    expect(d('product', { title: 'P', kind: 'competitor', vendor: 'Acme', pricing: '$20' })).toMatch(/Competitor "P" by Acme.*\$20/);
    expect(d('video', { title: 'V', url: 'https://youtu.be/x', author: 'Acme' })).toMatch(/Video "V" on youtu.be by Acme/);
    expect(d('code', { title: 'C', language: 'sql', code: 'select 1' })).toMatch(/Code "C" \(sql\), 1 lines.*select 1/);
    expect(d('math', { title: 'M', latex: 'x^2' })).toMatch(/x\^2/);
    expect(d('checklist', { title: 'T', items: [{ id: 'i1', text: 'A', done: true }] })).toMatch(/1 of 1 done.*\[x\] A/);
    for (const t of ['entity', 'product', 'video', 'code', 'math', 'checklist'] as const) expect(() => d(t, 'garbage')).not.toThrow();
  });
});
