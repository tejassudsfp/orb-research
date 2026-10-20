/** Product or competitor: what it is, who makes it, pricing, strengths and weaknesses. Can attach a dataset. */
import { ProductData, SourceUrl, readCardData } from '@orb/shared';
import { z } from 'zod';
import { Body, Title, pick, type CardTypeSpec } from '../spec.js';
import { clip } from '../describe.js';
import { FactsField, factsLine } from './entity.js';

const List = z.array(z.string().trim().min(1).max(300)).max(8);

export const product: CardTypeSpec<'product'> = {
  type: 'product',
  label: 'product',
  purpose:
    'A product or a competitor: what it is, who makes it, pricing, strengths and weaknesses. The user can attach a dataset (pricing history, reviews).',
  origin: 'fetched',
  fields: z.strictObject({
    title: Title,
    entityKind: z.enum(['product', 'competitor']).optional(),
    vendor: z.string().trim().max(200).optional(),
    body: Body(4000).optional(),
    url: SourceUrl.optional(),
    pricing: z.string().trim().max(500).optional(),
    strengths: List.optional(),
    weaknesses: List.optional(),
    facts: FactsField.optional(),
  }),
  fieldHelp:
    'title = the name, entityKind? ("product" default | "competitor"), vendor?, body? = what it is, url?, pricing?, strengths? (≤8 short strings), weaknesses? (≤8), facts? ([{label, value}], ≤12)',
  toData: (f, _ctx, mode) => ({
    ...pick(f, {
      title: 'title',
      vendor: 'vendor',
      body: 'body',
      url: 'url',
      pricing: 'pricing',
      strengths: 'strengths',
      weaknesses: 'weaknesses',
      facts: 'facts',
    }),
    ...(f.entityKind !== undefined ? { kind: f.entityKind } : mode === 'create' ? { kind: 'product' } : {}),
  }),
  describe(data) {
    const d = readCardData(ProductData, data);
    if (!d) return '';
    const head = `${d.kind === 'competitor' ? 'Competitor' : 'Product'} "${d.title ?? ''}"${d.vendor ? ` by ${d.vendor}` : ''}.`;
    return clip(
      [
        head,
        d.body,
        d.pricing ? `Pricing: ${d.pricing}.` : '',
        d.strengths?.length ? `Strengths: ${d.strengths.join('; ')}.` : '',
        d.weaknesses?.length ? `Weaknesses: ${d.weaknesses.join('; ')}.` : '',
        factsLine(d.facts),
      ]
        .filter(Boolean)
        .join(' '),
    );
  },
};
