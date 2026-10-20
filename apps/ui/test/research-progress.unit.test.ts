import { expect, it } from 'vitest';
import { researchGapSummary } from '../src/screens/Canvas/ResearchProgress.js';

it('turns a detailed completion checklist into short user-facing counts', () => {
  const summary = researchGapSummary([
    'Untouched entity seed Example [c_PRIVATE]. Replace it with update_card.',
    'Unresolved metric Revenue [c_PRIVATE]. Source it or explain the unavailable input.',
    'Empty chart KPIs [c_PRIVATE]; fill its source data first.',
    'Empty database Team [c_PRIVATE]; dataset d_PRIVATE. Use upsert_rows.',
    'Empty database Peers [c_PRIVATE]; dataset d_PRIVATE. Use upsert_rows.',
    'Missing detailed synthesis: update an existing assessment with multi-paragraph detail.',
  ]);
  expect(summary).toBe('3 cards awaiting findings · 2 tables awaiting data · Detailed analysis pending');
  expect(summary).not.toMatch(/PRIVATE|update_card|upsert_rows/);
});

it('keeps empty-section and singular labels readable', () => {
  expect(
    researchGapSummary(['No substantive findings yet: template scaffolding does not answer this frame.']),
  ).toBe('Findings pending');
  expect(researchGapSummary(['Empty database Team; internal instructions'])).toBe('1 table awaiting data');
  expect(researchGapSummary(['Untouched doc seed One-liner; internal instructions'])).toBe(
    '1 card awaiting findings',
  );
});

it('never shows new or unrecognised internal instructions as a fallback', () => {
  expect(
    researchGapSummary(['New diagnostic [c_PRIVATE]: run_internal_tool ' + 'sensitive '.repeat(1000)]),
  ).toBe('Further review needed');
});
