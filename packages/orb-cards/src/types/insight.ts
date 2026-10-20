/** Insight (P6.5): a conclusion that cites at least two cards. */
import { INSIGHT_MAX_CITATIONS, INSIGHT_MIN_CITATIONS, InsightData, readCardData } from '@orb/shared';
import { z } from 'zod';
import { Body, CardRefField, Title, pick, type CardTypeSpec } from '../spec.js';
import { bodyOf } from '../describe.js';

export const insight: CardTypeSpec<'insight'> = {
  type: 'insight',
  purpose:
    'A conclusion drawn from the research that stands on at least two other cards (citations). Use it for "so what", not for a finding of its own: a finding is a quote or a source.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    body: Body(4000).optional(),
    citations: z
      .array(CardRefField)
      .min(INSIGHT_MIN_CITATIONS, { message: `an insight must cite at least ${INSIGHT_MIN_CITATIONS} cards` })
      .max(INSIGHT_MAX_CITATIONS),
  }),
  fieldHelp: `title = the conclusion, body? = the reasoning, citations = ids of at least ${INSIGHT_MIN_CITATIONS} different cards it rests on (≤${INSIGHT_MAX_CITATIONS}; they must be on this board)`,
  toData: (f) => pick(f, { title: 'title', body: 'body', citations: 'citations' }),
  describe: (data) => {
    const d = readCardData(InsightData, data);
    const text = bodyOf(data);
    return `Insight${d ? ` citing ${d.citations.join(', ')}` : ''}${text ? `: ${text}` : '.'}`;
  },
};
