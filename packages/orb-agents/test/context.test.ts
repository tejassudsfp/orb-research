import { describe, expect, it } from 'vitest';
import { ResearchReads, researchCheckpoint, researchCompactRange } from '../src/context.js';

describe('research context and repeated reads', () => {
  it('keeps the original objective, latest correction, intake, assignments and gaps when the request is very long', () => {
    const text = researchCheckpoint({
      request: `PROJECT-ALPHA original objective. ${'Older conversation and template instructions. '.repeat(1000)} Latest correction: depart Europe on December 30.`,
      intake: { budget: 'EUR6000', nights: 8, vegetarian: true },
      role: 'scout',
      frameIds: ['f_transport', 'f_food'],
      assignment: `Review the CURRENT-BUDGET task. ${'Old working notes. '.repeat(1000)} Last direction: quote two adults.`,
      gaps: [{ frameId: 'f_food', title: 'Food', reasons: ['Empty database; dataset d_food.'] }],
    });
    expect(text.length).toBeLessThan(12_000);
    for (const part of [
      'PROJECT-ALPHA',
      'depart Europe on December 30',
      'EUR6000',
      '"nights":8',
      'Your role: scout',
      'f_transport',
      'dataset d_food',
      'CURRENT-BUDGET',
      'quote two adults',
    ])
      expect(text).toContain(part);
  });
  it('recognises reordered object arguments but preserves pagination and live revisions', () => {
    const reads = new ResearchReads();
    const key = reads.key('query_dataset', { datasetId: 'd_1', query: { limit: 20, offset: 0 } })!;
    expect(reads.key('query_dataset', { query: { offset: 0, limit: 20 }, datasetId: 'd_1' })).toBe(key);
    reads.remember(key, 10, 'call_first');
    expect(reads.repeated(key, 10)).toEqual({ callId: 'call_first', repeats: 1 });
    expect(reads.repeated(key, 11)).toBeUndefined();
    expect(
      reads.repeated(reads.key('query_dataset', { datasetId: 'd_1', query: { offset: 20, limit: 20 } })!, 10),
    ).toBeUndefined();
    expect(reads.key('upsert_rows', {})).toBeUndefined();
    reads.clear();
    expect(reads.repeated(key, 10)).toBeUndefined();
  });

  it('preserves the system prefix and moves a cut back across an unfinished tool pair', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({ seq: i * 2, tokens: 4000 }));
    const session = {
      surface: { nodes: nodes.map((n) => n.seq) },
      eventAt: (seq: number) => ({ type: seq === 0 ? 'system/message' : 'user/message' }),
    };
    const range = researchCompactRange(
      session,
      { nodes },
      (_s, seq) => Number(seq) !== 14,
      () => true,
    );
    // The recent 12k spans nodes 14,16,18; the open pair moves that boundary back to 12.
    expect(range).toEqual({ start: 2, end: 10 });
  });

  it('refuses stale measurements, a cut ending in an open pair, and ranges too small to shrink', () => {
    const nodes = Array.from({ length: 8 }, (_, i) => ({ seq: i, tokens: 4000 }));
    const session = {
      surface: { nodes: nodes.map((n) => n.seq) },
      eventAt: () => ({ type: 'user/message' }),
    };
    expect(
      researchCompactRange(
        session,
        { nodes },
        () => true,
        () => false,
      ),
    ).toBeUndefined();
    expect(
      researchCompactRange(
        session,
        { nodes: nodes.slice(1) },
        () => true,
        () => true,
      ),
    ).toBeUndefined();
    expect(
      researchCompactRange(
        session,
        { nodes: nodes.map((n) => ({ ...n, tokens: 1 })) },
        () => true,
        () => true,
      ),
    ).toBeUndefined();
  });
});
