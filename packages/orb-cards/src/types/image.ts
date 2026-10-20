/** Image or screenshot already saved in the canvas, with a caption. */
import { AssetPath, describeCardData } from '@orb/shared';
import { z } from 'zod';
import { Title, assetOf, pick, type CardTypeSpec } from '../spec.js';
import { DESCRIBE_MAX } from '../describe.js';

export const image: CardTypeSpec<'image'> = {
  type: 'image',
  purpose: 'An image or screenshot already saved in this canvas (e.g. by capture_page), with a caption.',
  origin: 'captured',
  fields: z.strictObject({
    title: Title,
    asset: AssetPath,
    width: z.number().int().positive().max(100_000).optional(),
    height: z.number().int().positive().max(100_000).optional(),
  }),
  fieldHelp: 'title = the caption, asset = the "assets/…" path of a saved image, width?, height?',
  toData: async (f, ctx) => {
    const asset = await assetOf(f, ctx, 'image');
    return {
      ...pick(f, { title: 'title', width: 'width', height: 'height' }),
      ...(asset ? { asset } : {}),
    };
  },
  describe: (_data, card) => describeCardData(card, DESCRIBE_MAX),
};
