/** Metric (P6.4): one figure with its change, unit, period and where it comes from. */
import { MetricData, metricSummary, readCardData } from '@orb/shared';
import { z } from 'zod';
import { CardFieldError, CardRefField, Title, type CardTypeSpec, type Fields } from '../spec.js';
import { DESCRIBE_MAX, clip } from '../describe.js';

const sourceOf = (f: Fields): Fields | undefined => {
  const s: Fields = {};
  if (f.sourceLabel !== undefined) s.label = f.sourceLabel;
  if (f.sourceUrl !== undefined) s.url = f.sourceUrl;
  if (f.sourceCardId !== undefined) s.cardId = f.sourceCardId;
  return Object.keys(s).length ? s : undefined;
};

export const metric: CardTypeSpec<'metric'> = {
  type: 'metric',
  purpose: 'One key figure (revenue, growth, a price) with its change, unit, period and source.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    value: z.string().trim().min(1).max(40),
    unit: z.string().trim().max(24).optional(),
    change: z.string().trim().max(30).optional(),
    direction: z.enum(['up', 'down', 'flat']).optional(),
    good: z.boolean().optional(),
    period: z.string().trim().max(60).optional(),
    sourceLabel: z.string().trim().max(200).optional(),
    sourceUrl: z.string().max(4096).optional(),
    sourceCardId: CardRefField.optional(),
    note: z.string().trim().max(400).optional(),
  }),
  fieldHelp:
    'title = what is measured, value = the figure as written ("$4.2B", "38"), unit?, change? ("+12%") with direction? ("up"|"down"|"flat"; needed with change) and good? (true when that is good news), period? ("FY2025"), a source: sourceUrl? | sourceCardId? | sourceLabel? (at least one: every figure says where it comes from), note?',
  toData(f, _ctx, mode) {
    const out: Fields = {};
    for (const k of ['title', 'value', 'unit', 'period', 'note'] as const) if (f[k] !== undefined) out[k] = f[k];
    if (f.change !== undefined || f.direction !== undefined) {
      if (f.change === undefined || f.direction === undefined)
        throw new CardFieldError('change and direction go together (direction is up, down or flat)');
      out.change = { value: f.change, direction: f.direction, ...(f.good !== undefined ? { good: f.good } : {}) };
    }
    const source = sourceOf(f);
    if (source) out.source = source;
    else if (mode === 'create') throw new CardFieldError('a metric needs its source: sourceUrl, sourceCardId or sourceLabel');
    return out;
  },
  describe(data) {
    const d = readCardData(MetricData, data);
    return d ? clip(metricSummary(d), DESCRIBE_MAX) : 'Metric (unreadable data).';
  },
};
