/** Video or social post: a link and a thumbnail. It opens in the browser and is never embedded. */
import { AssetPath, SourceUrl, VideoData, readCardData, videoPlatformOf } from '@orb/shared';
import { z } from 'zod';
import { Body, Title, pick, type CardTypeSpec } from '../spec.js';
import { CardFieldError } from '../spec.js';
import { clip } from '../describe.js';

export const video: CardTypeSpec<'video'> = {
  type: 'video',
  label: 'video or post',
  purpose:
    'A video or social post (YouTube, X, LinkedIn…): its link, author and a thumbnail. It opens in the browser; it is never embedded. Save a thumbnail with capture_page first when you can.',
  origin: 'captured',
  fields: z.strictObject({
    title: Title,
    url: SourceUrl,
    platform: z.string().trim().max(60).optional(),
    author: z.string().trim().max(200).optional(),
    duration: z.string().trim().max(20).optional(),
    publishedAt: z.string().trim().max(40).optional(),
    body: Body(4000).optional(),
    thumbnail: AssetPath.optional(),
  }),
  fieldHelp:
    'title, url (http(s), required), platform?, author?, duration? ("12:30"), publishedAt?, body? = what it says, thumbnail? ("assets/…" path of a saved image)',
  async toData(f, ctx) {
    let thumb;
    if (f.thumbnail !== undefined) {
      thumb = await ctx.resolveAsset(String(f.thumbnail));
      if (!thumb.mime.startsWith('image/')) throw new CardFieldError(`asset ${thumb.path} is not an image`);
    }
    return {
      ...pick(f, {
        title: 'title',
        url: 'url',
        platform: 'platform',
        author: 'author',
        duration: 'duration',
        publishedAt: 'publishedAt',
        body: 'body',
      }),
      ...(thumb ? { thumb } : {}),
    };
  },
  describe(data) {
    const d = readCardData(VideoData, data);
    if (!d) return '';
    const where = videoPlatformOf(d);
    return clip(
      [
        `Video "${d.title ?? ''}"${where ? ` on ${where}` : ''}${d.author ? ` by ${d.author}` : ''}${d.duration ? ` (${d.duration})` : ''}.`,
        d.url,
        d.body,
        d.thumb ? 'Has a thumbnail.' : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  },
};
