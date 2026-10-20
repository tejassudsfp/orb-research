/** Person or organisation: who they are, their role, a few facts, and where to read more. */
import { AssetPath, FACT_LIMIT, SourceUrl, readCardData, EntityData } from '@orb/shared';
import { z } from 'zod';
import { Body, CardFieldError, Title, pick, type CardTypeSpec, type Fields } from '../spec.js';
import { clip, str } from '../describe.js';

/** The `facts` an agent gives, as a list of {label, value}. */
export const FactsField = z
  .array(z.strictObject({ label: z.string().trim().min(1).max(80), value: z.string().trim().max(400) }))
  .max(FACT_LIMIT);

export const factsLine = (facts: { label: string; value: string }[] | undefined): string =>
  (facts ?? []).map((f) => `${f.label}: ${f.value}`).join('; ');

export const entity: CardTypeSpec<'entity'> = {
  type: 'entity',
  label: 'person or org',
  purpose: 'A person or an organisation that matters to the research: who they are, their role, a few key facts.',
  origin: 'fetched',
  fields: z.strictObject({
    title: Title,
    entityKind: z.enum(['person', 'org']).optional(),
    role: z.string().trim().max(200).optional(),
    org: z.string().trim().max(200).optional(),
    location: z.string().trim().max(200).optional(),
    body: Body(4000).optional(),
    url: SourceUrl.optional(),
    facts: FactsField.optional(),
    photo: AssetPath.optional(),
  }),
  fieldHelp:
    'title = the name, entityKind? ("person" default | "org"), role?, org? (a person\'s employer), location?, body? = who they are in a few lines, url?, facts? ([{label, value}], ≤12), photo? ("assets/…" path of a saved image)',
  async toData(f: Fields, ctx, mode) {
    const photo = f.photo !== undefined ? await ctx.resolveAsset(String(f.photo)) : undefined;
    if (photo && !photo.mime.startsWith('image/')) throw new CardFieldError(`asset ${photo.path} is not an image`);
    return {
      ...pick(f, { title: 'title', role: 'role', org: 'org', location: 'location', body: 'body', url: 'url', facts: 'facts' }),
      ...(f.entityKind !== undefined ? { kind: f.entityKind } : mode === 'create' ? { kind: 'person' } : {}),
      ...(photo ? { photo } : {}),
    };
  },
  describe(data) {
    const d = readCardData(EntityData, data);
    if (!d) return str((data as { title?: unknown })?.title);
    const head = `${d.kind === 'org' ? 'Org' : 'Person'} "${d.title ?? ''}"`;
    const who = [d.role, d.org, d.location].filter(Boolean).join(', ');
    return clip([head + (who ? ` (${who})` : '') + '.', d.body, factsLine(d.facts)].filter(Boolean).join(' '));
  },
};
