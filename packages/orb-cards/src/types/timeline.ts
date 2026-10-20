/** Timeline (P6.4): dated events in order, each with its source. */
import { TIMELINE_LIMITS, TimelineData, timelineSummary, readCardData } from '@orb/shared';
import { z } from 'zod';
import { CardRefField, Title, type CardTypeSpec } from '../spec.js';
import { DESCRIBE_MAX, clip } from '../describe.js';

export const timeline: CardTypeSpec<'timeline'> = {
  type: 'timeline',
  purpose: 'Dated events in order (a company history, a regulatory path, a product roadmap), each with its source.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    events: z
      .array(
        z.strictObject({
          date: z.string().trim(),
          label: z.string().trim().min(1).max(200),
          detail: z.string().trim().max(600).optional(),
          sourceUrl: z.string().max(4096).optional(),
          sourceCardId: CardRefField.optional(),
          sourceLabel: z.string().trim().max(200).optional(),
        }),
      )
      .min(1)
      .max(TIMELINE_LIMITS.events),
  }),
  fieldHelp: `title, events (1 to ${TIMELINE_LIMITS.events}) each { date ("2026", "2026-10" or "2026-10-15"), label, detail?, and a source: sourceUrl? | sourceCardId? | sourceLabel? (at least one per event) }. Events are shown in date order. update_card replaces the whole events list`,
  toData: (f) => ({
    ...(f.title !== undefined ? { title: f.title } : {}),
    ...(f.events !== undefined
      ? {
          events: (f.events as Record<string, unknown>[]).map((e) => ({
            date: e.date,
            label: e.label,
            ...(e.detail !== undefined ? { detail: e.detail } : {}),
            source: {
              ...(e.sourceLabel !== undefined ? { label: e.sourceLabel } : {}),
              ...(e.sourceUrl !== undefined ? { url: e.sourceUrl } : {}),
              ...(e.sourceCardId !== undefined ? { cardId: e.sourceCardId } : {}),
            },
          })),
        }
      : {}),
  }),
  describe(data) {
    const d = readCardData(TimelineData, data);
    return d ? clip(timelineSummary(d), DESCRIBE_MAX) : 'Timeline (unreadable data).';
  },
};
