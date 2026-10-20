/** Math: a LaTeX formula rendered with KaTeX. */
import { MATH_MAX, MathData, readCardData } from '@orb/shared';
import { z } from 'zod';
import { Title, pick, type CardTypeSpec } from '../spec.js';
import { clip } from '../describe.js';

export const math: CardTypeSpec<'math'> = {
  type: 'math',
  label: 'math',
  purpose: 'A formula or derivation written in LaTeX (no $ delimiters), shown typeset.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    latex: z.string().trim().min(1).max(MATH_MAX),
    body: z.string().trim().max(2000).optional(),
  }),
  fieldHelp: `title, latex (KaTeX syntax, no $ delimiters, ≤${MATH_MAX} characters), body? = what the variables mean`,
  toData: (f) => pick(f, { title: 'title', latex: 'latex', body: 'body' }),
  describe(data) {
    const d = readCardData(MathData, data);
    return d ? clip(`Math "${d.title ?? ''}": ${d.latex ?? ''} ${d.body ?? ''}`) : '';
  },
};
