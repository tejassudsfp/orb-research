import { describe, expect, it } from 'vitest';
import { emptyBoard, fillDeep, specOf, type BoardState, type Card, type Frame } from '@orb/shared';
import {
  repairAllowed,
  requestedResearchOutputs,
  researchFingerprint,
  researchRun,
  reviewResearch,
} from '../src/completion.js';

const meta = { created: 1 };
function tenFrames(): BoardState {
  const b = emptyBoard();
  for (let i = 0; i < 10; i++) {
    b.frames[`f_${i}`] = {
      id: `f_${i}`,
      title: `Section ${i}`,
      color: 'sky',
      x: i * 800,
      y: 0,
      w: 700,
      h: 500,
      provenance: { kind: 'user', at: 1 },
    } as Frame;
    b.cards[`c_${i}`] = {
      id: `c_${i}`,
      type: 'database',
      frameId: `f_${i}`,
      x: 0,
      y: 0,
      w: 560,
      h: 300,
      seed: true,
      data: { title: `Data ${i}`, datasetId: `d_${i}`, rowCount: 0, preview: [] },
      provenance: { kind: 'user', at: 1 },
    } as Card;
  }
  return b;
}

describe('research completion', () => {
  it('accepts populated assessment matrices with justified unassessed cells and an optional personal score', () => {
    const b = tenFrames();
    const seed = specOf('vc-dd')!.frames.flatMap(f => f.seeds)
      .find(s => s.type === 'matrix' && String(s.data.title).includes('rubric score'))!;
    const data = fillDeep(seed, { company: 'Acme' }).data as any;
    b.cards.c_0!.type = 'matrix';
    b.cards.c_0!.data = { ...data, title: 'Investment assessment', options: [
      { ...data.options[0], scores: [4, 6, 4, null, 4, null], note: 'Traction and deal are unassessed; missing revenue and valuation evidence is explained in detail.' },
      data.options[1],
    ] };
    b.cards.c_0!.detail = 'The referenced company filings do not disclose the private revenue, valuation or deal terms needed to apply those anchors. The other dimensions use their stated evidence and weights. A direct founder data request is required before investment underwriting; the absent input is not a negative fact. '.repeat(3);
    expect(reviewResearch(b, { ...meta, template: 'vc-dd', intake: { company: 'Acme' } }, { detailed: true })
      .gaps.find(g => g.frameId === 'f_0')).toBeUndefined();
  });
  it.each([
    ['vc-dd', 'framework'],
    ['vc-dd', 'entity'],
  ] as const)('keeps untouched %s %s seeds unfinished even beside detailed synthesis', (template, type) => {
    const b = tenFrames();
    const seed = specOf(template)!
      .frames.flatMap((f) => f.seeds)
      .find((s) => s.type === type)!;
    b.cards.c_0!.type = type;
    b.cards.c_0!.data = {
      ...fillDeep(seed, { company: 'Acme', year: '1970', date: '1970-01-01' }).data,
      title: 'Renamed placeholder',
    };
    if (type === 'framework')
      b.cards.c_0!.data = {
        ...(b.cards.c_0!.data as object),
        xAxis: 'A changed label does not fill the framework cells.',
      };
    b.cards.c_0!.detail = 'A neighbouring analysis cannot fill the underlying typed placeholder. '.repeat(12);
    const report = reviewResearch(b, { ...meta, template, intake: { company: 'Acme' } }, { detailed: true });
    expect(report.gaps.find((g) => g.frameId === 'f_0')?.reasons.join(' ')).toContain(
      `Untouched ${type} seed`,
    );
  });
  it('keeps renamed template scaffolding unfinished and does not count open questions or risks as findings', () => {
    const b = tenFrames();
    const seed = specOf('vc-dd')!
      .frames.flatMap((f) => f.seeds)
      .find((s) => s.type === 'matrix')!;
    b.frames.f_0!.title = 'Renamed assessment';
    b.cards.c_0!.type = 'matrix';
    b.cards.c_0!.data = {
      ...fillDeep(seed, { company: 'Acme', year: '1970', date: '1970-01-01' }).data,
      title: 'Renamed scorecard',
    };
    b.cards.c_1!.type = 'question';
    b.cards.c_1!.seed = undefined;
    b.cards.c_1!.data = { title: 'Still to research', body: 'Find sources later.', state: 'open' };
    b.cards.c_2!.type = 'risk';
    b.cards.c_2!.seed = undefined;
    b.cards.c_2!.data = { title: 'Unresearched', body: 'No findings yet.', kind: 'risk' };
    const report = reviewResearch(b, { ...meta, template: 'vc-dd', intake: { company: 'Acme' } });
    expect(report.gaps.find((g) => g.frameId === 'f_0')?.reasons.join(' ')).toContain(
      'Untouched matrix seed',
    );
    expect(report.coveredFrames).toBe(0);
    b.cards.c_1!.data = {
      title: 'Resolved question',
      body: 'What did the evidence show?',
      state: 'answered',
      answer: 'The sourced finding and its implications.',
    };
    expect(reviewResearch(b, { ...meta, template: 'vc-dd', intake: { company: 'Acme' } }).coveredFrames).toBe(
      1,
    );
  });

  it('recognizes explicit deliverables while respecting negative instructions', () => {
    expect(requestedResearchOutputs('Prepare a travel deck and write a research document.')).toEqual([
      'deck',
      'doc',
    ]);
    expect(requestedResearchOutputs("Don't create a deck. Research the question.")).toEqual([]);
    expect(requestedResearchOutputs('Do not write a report; prepare a presentation.')).toEqual(['deck']);
    expect(requestedResearchOutputs('Do not automatically generate a deck.')).toEqual([]);
    expect(requestedResearchOutputs('Prepare a report and a slide deck.')).toEqual(['doc', 'deck']);
    expect(requestedResearchOutputs('Research the market.')).toEqual([]);
  });
  it('a detailed request requires useful expanded analysis in every frame as well as populated data', () => {
    const b = tenFrames();
    for (const c of Object.values(b.cards))
      c.data = { title: 'Data', rowCount: 3, preview: [['sourced results']] };
    expect(reviewResearch(b, meta).state).toBe('complete');
    expect(reviewResearch(b, meta, { detailed: true }).coveredFrames).toBe(0);
    b.cards.c_0!.detail = 'Evidence and implications. '.repeat(30);
    expect(reviewResearch(b, meta, { detailed: true }).coveredFrames).toBe(1);
    b.cards.c_1!.type = 'doc';
    b.cards.c_1!.data = {
      title: 'Full assessment',
      body: 'Original evidence, alternatives and implications. '.repeat(30),
    };
    expect(reviewResearch(b, meta, { detailed: true }).coveredFrames).toBe(2);
    b.cards.c_2!.type = 'source';
    b.cards.c_2!.data = {
      title: 'Long source excerpt',
      url: 'https://example.org/source',
      summary: 'A source finding.',
    };
    b.cards.c_2!.detail = 'A detailed source summary. '.repeat(40);
    expect(reviewResearch(b, meta, { detailed: true }).coveredFrames).toBe(2);
    expect(researchRun('Finish all boards with detailed content').detailed).toBe(true);
  });
  it('does not confuse ten prefilled frames, or seven populated ones, with ten researched frames', () => {
    const b = tenFrames();
    expect(reviewResearch(b, meta)).toMatchObject({ totalFrames: 10, coveredFrames: 0, state: 'incomplete' });
    for (let i = 0; i < 7; i++)
      b.cards[`c_${i}`]!.data = {
        title: `Data ${i}`,
        rowCount: 1,
        preview: [['Real option', 'https://example.com']],
      };
    expect(reviewResearch(b, meta)).toMatchObject({ totalFrames: 10, coveredFrames: 7, state: 'incomplete' });
    for (let i = 7; i < 10; i++)
      b.cards[`c_${i}`]!.data = {
        title: `Data ${i}`,
        rowCount: 1,
        preview: [['Real option', 'https://example.com']],
      };
    expect(reviewResearch(b, meta)).toMatchObject({ coveredFrames: 10, state: 'complete', gaps: [] });
  });

  it('does not accept a placeholder row, blank metric or empty chart as filled content', () => {
    const b = tenFrames();
    b.cards.c_0!.data = { rowCount: 1, preview: [['No researched food options yet', 'placeholder only']] };
    b.cards.c_1!.type = 'metric';
    b.cards.c_1!.data = { title: 'Budget', value: '—' };
    b.cards.c_2!.type = 'chart';
    b.cards.c_2!.data = { title: 'Costs', points: [] };
    const r = reviewResearch(b, meta);
    expect(r.coveredFrames).toBe(0);
    expect(r.gaps[0]!.reasons.join(' ')).toContain('Empty database');
    expect(r.gaps[1]!.reasons.join(' ')).toContain('Unresolved metric');
    expect(r.gaps[2]!.reasons.join(' ')).toContain('Empty chart');
  });

  it('accepts a specifically explained unavailable metric, while blank values and pending work remain gaps', () => {
    const b = tenFrames();
    const c = b.cards.c_0!;
    c.type = 'metric';
    c.detail =
      'The company has not publicly disclosed this private metric; the cited filing and investor sources establish the reporting boundary and its effect on the investment assessment. '.repeat(
        5,
      );
    c.data = { title: 'Private metric', value: 'Not disclosed' };
    expect(reviewResearch(b, meta).gaps.some((g) => g.frameId === 'f_0')).toBe(false);
    c.data = { title: 'Private metric', value: 'Not publicly disclosed' };
    expect(reviewResearch(b, meta).gaps.some((g) => g.frameId === 'f_0')).toBe(false);
    const explanation = c.detail;
    c.detail = '';
    expect(reviewResearch(b, meta).gaps.some((g) => g.frameId === 'f_0')).toBe(true);
    c.detail = explanation;
    c.data = { title: 'Private metric', value: '—' };
    expect(reviewResearch(b, meta).gaps.some((g) => g.frameId === 'f_0')).toBe(true);
    c.data = { title: 'Private metric', value: 'pending' };
    expect(reviewResearch(b, meta).gaps.some((g) => g.frameId === 'f_0')).toBe(true);
  });

  it('a cosmetic layout change cannot keep a paid repair loop running; genuine content can', () => {
    const b = tenFrames();
    const run = researchRun('Fill all ten frames');
    expect(repairAllowed(run, 'orb', researchFingerprint(b))).toBe(true);
    b.cards.c_0!.x += 100;
    expect(repairAllowed(run, 'orb', researchFingerprint(b))).toBe(true);
    expect(repairAllowed(run, 'orb', researchFingerprint(b))).toBe(false);
    b.cards.c_0!.data = { rowCount: 1, preview: [['A sourced result']] };
    expect(repairAllowed(run, 'orb', researchFingerprint(b))).toBe(true);
    for (let i = 0; i < 12; i++) {
      b.cards.c_0!.data = { rowCount: i + 2 };
      repairAllowed(run, 'orb', researchFingerprint(b));
    }
    expect(repairAllowed(run, 'orb', researchFingerprint(b))).toBe(false);
  });
});
