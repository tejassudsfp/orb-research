/** Doc draft: a longer text card. A stack card (P3.2 `consolidate_cards`) is a doc with `stack`. */
import { stackOf } from '@orb/shared';
import { z } from 'zod';
import { Body, TEXT_MAP, Title, pick, type CardTypeSpec } from '../spec.js';
import { bodyOf, oneLine } from '../describe.js';

export const doc: CardTypeSpec<'doc'> = {
  type: 'doc',
  label: 'doc draft',
  purpose: 'A longer text card with a heading and a body (a draft section).',
  origin: 'static',
  fields: z.strictObject({ title: Title, body: Body(20_000).min(1) }),
  fieldHelp: 'title = the heading, body = the text (≤20000 chars)',
  toData: (f) => pick(f, TEXT_MAP),
  describe: (data, card) => {
    const stack = stackOf(card);
    if (!stack) return bodyOf(data);
    const items = stack.items.map((i) => `${i.type} "${oneLine(i.title)}"`).join('; ');
    return [`Stack of ${stack.count} cards.`, bodyOf(data), `Holds: ${items}.`].filter(Boolean).join(' ');
  },
};
