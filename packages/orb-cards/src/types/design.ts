/**
 * Design frame: one HTML screen, interactive since P6.2 (served as its own sidecar page with its own CSP: inline
 * scripts run, the bundled Chart.js and D3 are available, no network).
 */
import { DESIGN_HTML_MAX, DesignData, readCardData } from '@orb/shared';
import { z } from 'zod';
import { Body, TEXT_MAP, Title, pick, type CardTypeSpec } from '../spec.js';
import { bodyOf, clip, visibleText } from '../describe.js';

export const design: CardTypeSpec<'design'> = {
  type: 'design',
  label: 'design frame',
  purpose:
    'One HTML screen (a mockup or an interactive chart), rendered in a sandbox with no network; scripts run, with ' +
    'Chart.js (global Chart) and D3 v7 (global d3) available.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    html: z.string().min(1).max(DESIGN_HTML_MAX),
    body: Body(1000).optional(),
  }),
  fieldHelp: `title, html = one self-contained HTML screen (≤${DESIGN_HTML_MAX} chars, inline CSS/JS, no network), body? = what it shows`,
  toData: (f, ctx) => ({
    ...pick(f, { ...TEXT_MAP, html: 'html' }),
    ...(f.html !== undefined ? { updatedAt: ctx.now } : {}),
  }),
  tools: ['write_design_frame'],
  describe: (data) => {
    const d = readCardData(DesignData, data);
    const about = bodyOf(data);
    if (!d?.html) return ['HTML mockup (no screen yet).', about].filter(Boolean).join(' ');
    const text = visibleText(d.html);
    return [
      'HTML mockup.',
      about,
      text ? `Visible text: "${clip(text, 300)}".` : 'No visible text.',
      d.updatedAt !== undefined
        ? `Written ${new Date(d.updatedAt).toISOString()}${d.version && d.version > 1 ? ` (version ${d.version})` : ''}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
  },
};
