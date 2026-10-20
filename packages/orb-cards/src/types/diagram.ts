/** Diagram: a Mermaid source rendered live, with a caption. */
import { DiagramData, readCardData } from '@orb/shared';
import { z } from 'zod';
import { Body, TEXT_MAP, Title, pick, type CardTypeSpec } from '../spec.js';
import { bodyOf, mermaidSummary } from '../describe.js';

export const diagram: CardTypeSpec<'diagram'> = {
  type: 'diagram',
  purpose: 'A Mermaid diagram (flowchart, sequence, …) rendered live.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    mermaid: z.string().trim().min(1).max(20_000),
    body: Body(1000).optional(),
  }),
  fieldHelp: 'title, mermaid = the Mermaid source, body? = a caption',
  toData: (f) => pick(f, { ...TEXT_MAP, mermaid: 'mermaid' }),
  describe: (data) => {
    const d = readCardData(DiagramData, data);
    const caption = bodyOf(data);
    if (!d?.mermaid) return ['Diagram (no Mermaid source yet).', caption].filter(Boolean).join(' ');
    const { kind, labels } = mermaidSummary(d.mermaid);
    return [`Mermaid ${kind || 'diagram'}.`, caption, labels.length ? `Shows: ${labels.join(', ')}.` : '']
      .filter(Boolean)
      .join(' ');
  },
};
