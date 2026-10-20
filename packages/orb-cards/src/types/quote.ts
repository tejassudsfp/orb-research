/** Quote: an exact excerpt (under 50 words) with where it comes from. */
import { QuoteData, SourceUrl, readCardData } from '@orb/shared';
import { z } from 'zod';
import { Body, CardRefField, Title, pick, words, type CardTypeSpec } from '../spec.js';
import { bodyOf, str } from '../describe.js';

/** PRD: a quote is an excerpt under 50 words. */
export const QUOTE_MAX_WORDS = 49;

export const quote: CardTypeSpec<'quote'> = {
  type: 'quote',
  purpose: 'An exact excerpt (under 50 words) from a source, with where it comes from.',
  origin: 'fetched',
  fields: z.strictObject({
    title: Title,
    body: Body(600)
      .min(1)
      .refine((s) => words(s) <= QUOTE_MAX_WORDS, { message: 'a quote must be under 50 words' }),
    url: SourceUrl.optional(),
    sourceCardId: CardRefField.optional(),
  }),
  fieldHelp:
    'title = the source name, body = the exact excerpt (under 50 words), url?, sourceCardId? (its source card)',
  toData: (f) => pick(f, { title: 'title', body: 'body', url: 'url', sourceCardId: 'sourceCardId' }),
  describe: (data) => {
    const d = readCardData(QuoteData, data);
    const excerpt = bodyOf(data);
    if (!d) return excerpt;
    const from = [str(d.title), d.url ?? ''].filter(Boolean).join(', ');
    const ref = d.sourceCardId ? ` (source card ${d.sourceCardId})` : '';
    return `${excerpt ? `"${excerpt}"` : 'Quote'}${from ? ` — ${from}` : ''}${ref}`;
  },
};
