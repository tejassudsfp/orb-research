import { describe, expect, it } from 'vitest';
import {
  emptyBoard,
  PortComposeArgs,
  PortDoc,
  reportPlan,
  reportPlanFromFrames,
  reportProblems,
  type BoardState,
  type Card,
} from '../src/index.js';

const board = (): BoardState => {
  const b = emptyBoard();
  b.frames.f_a = {
    id: 'f_a',
    title: 'Market',
    color: 'sky',
    x: 0,
    y: 0,
    w: 600,
    h: 500,
    provenance: { kind: 'user', at: 1 },
  };
  b.cards.c_a = {
    id: 'c_a',
    type: 'source',
    frameId: 'f_a',
    data: { title: 'Evidence', url: 'https://example.com', summary: 'Scope evidence' },
    x: 0,
    y: 0,
    w: 300,
    h: 200,
    provenance: { kind: 'user', at: 1 },
  } as Card;
  return b;
};
function complete(b: BoardState): PortDoc {
  return {
    v: 1,
    version: 1,
    title: 'Report',
    format: 'report',
    instructions: '',
    scope: 'all',
    composedAt: 1,
    updatedAt: 1,
    sections: reportPlan(b, 'all').map((p) => ({
      id: p.id,
      heading: p.heading,
      composedAt: 1,
      figures: [],
      paragraphs: [1, 2, 3].map((n) => ({
        id: `p_${p.id.replace(/-/g, '')}${n}`,
        text: `${p.id} distinct analytical point ${n}. `.repeat(30),
        cardIds: ['c_a'],
      })),
    })),
  };
}
describe('professional research reports', () => {
  it('defaults new compose requests to a report while reading legacy documents', () => {
    expect(PortComposeArgs.parse({}).format).toBe('report');
    const { format: _format, ...legacy } = complete(board());
    expect(PortDoc.parse(legacy).format).toBeUndefined();
    expect(PortComposeArgs.parse({ format: 'custom' }).format).toBe('custom');
  });
  it('plans the mandate, methods, every topic, recommendations and limitations in order', () => {
    expect(reportPlan(board(), 'all').map((s) => s.id)).toEqual([
      'summary',
      'scope-methodology',
      'market',
      'conclusions',
      'open-questions',
    ]);
    expect(
      reportPlanFromFrames([
        { id: 'f_a', title: 'Summary' },
        { id: 'f_b', title: 'Summary' },
      ]).map((s) => s.id),
    ).toEqual(['summary', 'scope-methodology', 'summary-2', 'summary-3', 'conclusions', 'open-questions']);
  });
  it('keeps every topic when a large board needs grouped analysis', () => {
    const frames = Array.from({ length: 80 }, (_, i) => ({ id: `f_${i}`, title: `Topic ${i}` }));
    const plan = reportPlanFromFrames(frames);
    expect(plan).toHaveLength(40);
    expect(new Set(plan.map((p) => p.id)).size).toBe(40);
    expect(plan.flatMap((p) => p.frameIds)).toEqual(frames.map((f) => f.id));
  });
  it('detects missing and thin sections without counting user additions as generated analysis', () => {
    const b = board();
    const doc = complete(b);
    const plan = reportPlan(b, 'all');
    expect(reportProblems(doc, plan, b)).toEqual([]);
    doc.sections = doc.sections.slice(0, 1);
    doc.sections[0]!.paragraphs = [
      { id: 'p_a', text: 'A short summary.', cardIds: ['c_a'] },
      { id: 'p_b', text: 'User material '.repeat(100), cardIds: [], userAuthored: true },
    ];
    expect(reportProblems(doc, plan, b).join('\n')).toContain('Develop "summary"');
    expect(reportProblems(doc, plan, b).join('\n')).toContain('Missing section "market"');
  });
  it('requires topic evidence, flags deleted citations and exact paragraph repetition', () => {
    const b = board();
    const doc = complete(b);
    const plan = reportPlan(b, 'all');
    doc.sections[2]!.paragraphs[0]!.text = doc.sections[0]!.paragraphs[0]!.text;
    doc.sections[2]!.paragraphs.forEach((p) => {
      p.cardIds = ['c_missing'];
    });
    const issues = reportProblems(doc, plan, b).join('\n');
    expect(issues).toContain('Repeated paragraph');
    expect(issues).toContain('no current supporting card');
    expect(issues).toContain('must analyse and cite evidence from f_a');
  });
  it('includes unframed evidence only for whole-board scope', () => {
    const b = board();
    b.cards.c_loose = { ...b.cards.c_a!, id: 'c_loose', frameId: null };
    expect(reportPlan(b, 'all').flatMap((p) => p.frameIds)).toContain(null);
    expect(reportPlan(b, ['f_a']).flatMap((p) => p.frameIds)).not.toContain(null);
  });
});
