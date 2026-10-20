/** Question: an open question the research must answer, or an answered one. */
import { QuestionData, readCardData } from '@orb/shared';
import { z } from 'zod';
import { Body, TEXT_MAP, Title, pick, type CardTypeSpec } from '../spec.js';
import { bodyOf } from '../describe.js';

export const question: CardTypeSpec<'question'> = {
  type: 'question',
  purpose: 'An open question the research must answer (or an answered one, with the answer).',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    body: Body(2000).optional(),
    state: z.enum(['open', 'answered']).optional(),
    answer: Body(4000).optional(),
  }),
  fieldHelp: 'title = the question, body? = context, state? ("open" default | "answered"), answer?',
  toData: (f, _ctx, mode) => ({
    ...pick(f, { ...TEXT_MAP, state: 'state', answer: 'answer' }),
    ...(mode === 'create' && f.state === undefined ? { state: 'open' } : {}),
  }),
  describe: (data) => {
    const d = readCardData(QuestionData, data);
    const context = bodyOf(data);
    if (d?.state === 'answered') {
      return [`Answered question.`, d.answer ? `Answer: ${d.answer}` : '', context].filter(Boolean).join(' ');
    }
    return ['Open question.', context].filter(Boolean).join(' ');
  },
};
