/** File or PDF already saved in the canvas, with its title and page count. */
import { AssetPath, describeCardData } from '@orb/shared';
import { z } from 'zod';
import { Title, assetOf, pick, type CardTypeSpec } from '../spec.js';
import { DESCRIBE_MAX } from '../describe.js';

export const file: CardTypeSpec<'file'> = {
  type: 'file',
  purpose: 'A file or PDF already saved in this canvas, with its title and page count.',
  origin: 'file',
  fields: z.strictObject({
    title: Title,
    asset: AssetPath,
    pages: z.number().int().nonnegative().max(1_000_000).nullable().optional(),
  }),
  fieldHelp: 'title, asset = the "assets/…" path of a saved file, pages?',
  toData: async (f, ctx, mode) => {
    const asset = await assetOf(f, ctx, 'any');
    const pages = f.pages !== undefined ? f.pages : mode === 'create' ? null : undefined;
    return {
      ...pick(f, { title: 'title' }),
      ...(asset ? { asset } : {}),
      ...(pages !== undefined ? { pages } : {}),
    };
  },
  describe: (_data, card) => describeCardData(card, DESCRIBE_MAX),
};
