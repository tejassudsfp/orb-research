/** P6.7: the Research run and Watch card helpers, and the cost-guard prompt's source (cards awaiting approval). */
import { describe, expect, it } from 'vitest';
import { ResearchData, WatchData, awaitingApproval } from '@orb/shared';
import { researchKindLabel, researchLine, usd, watchLine } from '../src/cards/parallel.js';

const run = (over: Record<string, unknown> = {}) =>
  ResearchData.parse({ title: 'T', kind: 'deep_research', status: 'running', processor: 'pro', ...over });

describe('research run line', () => {
  it('shows status, meter, sources read and processor while running', () => {
    expect(researchLine(run({ progress: 41.6, sourcesRead: 12 }))).toBe('Researching 42% · 12 sources read · pro');
  });
  it('batches show rows, entity searches show matches', () => {
    expect(researchLine(run({ kind: 'batch_enrich', done: 3, total: 10, processor: 'base' }))).toBe('Researching · 3 / 10 rows · base');
    expect(researchLine(run({ kind: 'find_entities', matched: 4, generated: 9, processor: 'preview' }))).toBe('Researching · 4 matched of 9 checked · preview');
  });
  it('every status has plain words', () => {
    expect(researchLine(run({ status: 'awaiting_approval' }))).toMatch(/^Needs your OK/);
    expect(researchLine(run({ status: 'detached' }))).toMatch(/^Detached/);
    expect(researchLine(run({ status: 'declined' }))).toMatch(/^Declined/);
    expect(researchKindLabel('find_entities')).toBe('Entity search');
  });
});

describe('watch line and money', () => {
  it('shows the schedule, events and monthly cost', () => {
    const w = WatchData.parse({ title: 'W', query: 'q', frequency: '1d', status: 'active', eventCount: 1, monthlyUsd: 0.09 });
    expect(watchLine(w)).toBe('Watching 1d · 1 event · ~$0.09 / month');
  });
  it('formats small amounts', () => {
    expect(usd(0.005)).toBe('$0.005');
    expect(usd(0.3)).toBe('$0.30');
    expect(usd(undefined)).toBe('');
  });
});

describe('cards awaiting approval', () => {
  it('only a research run or watch with that status', () => {
    expect(awaitingApproval({ type: 'research', data: { status: 'awaiting_approval' } })).toBe(true);
    expect(awaitingApproval({ type: 'watch', data: { status: 'awaiting_approval' } })).toBe(true);
    expect(awaitingApproval({ type: 'watch', data: { status: 'active' } })).toBe(false);
    expect(awaitingApproval({ type: 'note', data: { status: 'awaiting_approval' } })).toBe(false);
    expect(awaitingApproval({ type: 'research', data: null })).toBe(false);
  });
});
