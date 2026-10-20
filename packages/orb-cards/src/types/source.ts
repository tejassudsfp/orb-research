/** Source: a web page or document an agent read, with its link, summary and short excerpts. */
import { SOURCE_EXCERPTS, SourceData, SourceUrl, readCardData } from '@orb/shared';
import { z } from 'zod';
import { Body, Title, pick, type CardTypeSpec } from '../spec.js';
import { bodyOf, oneLine, str } from '../describe.js';

const Excerpt = Body(SOURCE_EXCERPTS.chars).min(1);

export const source: CardTypeSpec<'source'> = {
  type: 'source',
  purpose: 'A web page or document you read: its link, your summary and short excerpts.',
  origin: 'fetched',
  fields: z.strictObject({
    title: Title,
    url: SourceUrl,
    body: Body(2000).min(1),
    excerpts: z.array(Excerpt).max(SOURCE_EXCERPTS.count).optional(),
  }),
  fieldHelp: `title, url (http/https), body = your summary (≤2000 chars), excerpts? (≤${SOURCE_EXCERPTS.count} short quotes, ≤${SOURCE_EXCERPTS.chars} chars each)`,
  toData: (f) => pick(f, { title: 'title', url: 'url', body: 'summary', excerpts: 'excerpts' }),
  describe: (data) => {
    const d = readCardData(SourceData, data);
    if (!d) return bodyOf(data);
    const parts = [d.url ?? '', str(d.summary) || str(d.body)].filter(Boolean);
    const excerpts = (d.excerpts ?? []).filter((e) => e.trim()).map((e) => `"${oneLine(e)}"`);
    if (excerpts.length) parts.push(`Excerpts: ${excerpts.join('; ')}`);
    return parts.join(' — ');
  },
};
