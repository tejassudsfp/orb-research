/** Hypothesis (P6.5): a claim to test, with a confidence and the cards for and against it. */
import { HYPOTHESIS_MAX_EVIDENCE, HypothesisData, confidenceLabel, readCardData } from '@orb/shared';
import { z } from 'zod';
import { Body, CardRefField, Title, pick, type CardTypeSpec } from '../spec.js';
import { bodyOf } from '../describe.js';

export const hypothesis: CardTypeSpec<'hypothesis'> = {
  type: 'hypothesis',
  purpose:
    'A claim the research is testing, with how confident it is and the cards for and against it. Update confidence as evidence arrives; a supports link into it counts as for, a contradicts link as against.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    body: Body(4000).optional(),
    confidence: z.number().int().min(0).max(100),
    evidenceFor: z.array(CardRefField).max(HYPOTHESIS_MAX_EVIDENCE).optional(),
    evidenceAgainst: z.array(CardRefField).max(HYPOTHESIS_MAX_EVIDENCE).optional(),
  }),
  fieldHelp:
    'title = the hypothesis, body? = why you think so, confidence = 0 to 100 (percent), evidenceFor? / evidenceAgainst? = ids of cards on this board (update_card replaces the list)',
  toData: (f) =>
    pick(f, {
      title: 'title',
      body: 'body',
      confidence: 'confidence',
      evidenceFor: 'evidenceFor',
      evidenceAgainst: 'evidenceAgainst',
    }),
  describe: (data) => {
    const d = readCardData(HypothesisData, data);
    if (!d) return bodyOf(data);
    const side = (label: string, ids: string[] | undefined) => (ids?.length ? ` ${label}: ${ids.join(', ')}.` : '');
    return (
      `Hypothesis, ${d.confidence}% confident (${confidenceLabel(d.confidence)}).` +
      side('For', d.evidenceFor) +
      side('Against', d.evidenceAgainst) +
      (bodyOf(data) ? ` ${bodyOf(data)}` : '')
    );
  },
};
