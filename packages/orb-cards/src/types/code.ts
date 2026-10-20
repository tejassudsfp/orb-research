/** Code: a snippet with its language (highlighted on the board). */
import { CODE_MAX, CodeData, readCardData } from '@orb/shared';
import { z } from 'zod';
import { Title, pick, type CardTypeSpec } from '../spec.js';
import { clip } from '../describe.js';

export const code: CardTypeSpec<'code'> = {
  type: 'code',
  label: 'code',
  purpose: 'A code snippet, query or config with its language. Use it instead of pasting code into a text card.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    code: z.string().max(CODE_MAX),
    language: z.string().trim().max(30).optional(),
    body: z.string().trim().max(2000).optional(),
  }),
  fieldHelp: `title, code (≤${CODE_MAX} characters), language? ("python", "typescript", "sql"…), body? = a note on what it does`,
  toData: (f) => pick(f, { title: 'title', code: 'code', language: 'language', body: 'body' }),
  describe(data) {
    const d = readCardData(CodeData, data);
    if (!d) return '';
    const lines = (d.code ?? '').split('\n').length;
    return clip(
      `Code "${d.title ?? ''}"${d.language ? ` (${d.language})` : ''}, ${lines} lines. ${d.body ?? ''} ${(d.code ?? '').slice(0, 300)}`,
    );
  },
};
