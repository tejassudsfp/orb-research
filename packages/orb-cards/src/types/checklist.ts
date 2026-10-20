/**
 * Checklist: items agents propose and the user ticks. An agent never ticks: new items start open, an unchanged item
 * keeps its tick, and the planner refuses any agent change that flips one (packages/shared mediaCards.ts).
 */
import { CHECKLIST_MAX, ChecklistData, itemsFromTexts, readCardData, type ChecklistItem } from '@orb/shared';
import { z } from 'zod';
import { Title, type CardTypeSpec } from '../spec.js';
import { clip } from '../describe.js';

export const checklist: CardTypeSpec<'checklist'> = {
  type: 'checklist',
  label: 'checklist',
  purpose:
    'A list of things to do or verify. You propose the items; only the user ticks them. Updating items keeps the user\'s ticks for items whose text you leave unchanged.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    items: z.array(z.string().trim().min(1).max(300)).min(1).max(CHECKLIST_MAX),
  }),
  fieldHelp: `title, items (the full list of item texts, ≤${CHECKLIST_MAX}; all start unticked, you cannot tick)`,
  toData(f, ctx, mode) {
    const out: Record<string, unknown> = {};
    if (f.title !== undefined) out.title = f.title;
    if (f.items !== undefined) {
      const current = (ctx.current as ChecklistData | undefined)?.items ?? [];
      out.items = itemsFromTexts(f.items as string[], mode === 'update' ? (current as ChecklistItem[]) : []);
    }
    return out;
  },
  describe(data) {
    const d = readCardData(ChecklistData, data);
    const items = d?.items ?? [];
    const done = items.filter((i) => i.done).length;
    return clip(
      `Checklist "${d?.title ?? ''}": ${done} of ${items.length} done (only the user ticks). ` +
        items.slice(0, 12).map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('; '),
    );
  },
};
