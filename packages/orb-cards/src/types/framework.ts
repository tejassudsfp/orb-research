/** Framework (P6.5): pros and cons, a SWOT, or a 2x2 quadrant, as one card with three variants. */
import {
  FRAMEWORK_CELLS,
  FRAMEWORK_LIMITS,
  FRAMEWORK_VARIANTS,
  FrameworkData,
  frameworkCells,
  readCardData,
} from '@orb/shared';
import { z } from 'zod';
import { Body, Title, type CardTypeSpec } from '../spec.js';
import { CardFieldError } from '../spec.js';
import { bodyOf } from '../describe.js';

const keysOf = (variant: string) =>
  FRAMEWORK_CELLS[variant as (typeof FRAMEWORK_VARIANTS)[number]]?.map((c) => c.key) ?? [];

export const framework: CardTypeSpec<'framework'> = {
  type: 'framework',
  purpose:
    'A structured comparison: pros and cons, a SWOT, or a 2x2 quadrant. Use it to weigh one subject from several sides; use a decision card to choose between options.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    body: Body(2000).optional(),
    variant: z.enum(FRAMEWORK_VARIANTS),
    entries: z
      .array(
        z.strictObject({
          cell: z.string().trim().min(1).max(30),
          text: z.string().trim().min(1).max(FRAMEWORK_LIMITS.item),
        }),
      )
      .max(FRAMEWORK_LIMITS.perCell * 4),
    xAxis: z.string().trim().min(1).max(60).optional(),
    yAxis: z.string().trim().min(1).max(60).optional(),
  }),
  fieldHelp:
    'title = the subject, body?, variant = "proscons" (cells pros, cons) | "swot" (strengths, weaknesses, opportunities, threats) | "quadrant" (topLeft, topRight, bottomLeft, bottomRight; name the axes with xAxis and yAxis), entries = [{cell, text}] one per item, ≤8 per cell (update_card replaces all entries)',
  toData(f, _ctx, mode) {
    const out: Record<string, unknown> = {};
    for (const k of ['title', 'body', 'variant', 'xAxis', 'yAxis'] as const) if (f[k] !== undefined) out[k] = f[k];
    if (f.entries !== undefined) {
      const entries = f.entries as { cell: string; text: string }[];
      const variant = String(f.variant ?? '');
      const cells: Record<string, string[]> = {};
      for (const e of entries) {
        // On update the variant is not repeated: the caller re-checks the keys against the card's own variant.
        if (variant && !keysOf(variant).includes(e.cell))
          throw new CardFieldError(`cell "${e.cell}" is not a ${variant} cell; use ${keysOf(variant).join(', ')}`);
        (cells[e.cell] ??= []).push(e.text);
      }
      out.cells = cells;
    } else if (mode === 'create') out.cells = {};
    return out;
  },
  describe: (data) => {
    const d = readCardData(FrameworkData, data);
    if (!d) return bodyOf(data);
    const name = d.variant === 'proscons' ? 'Pros and cons' : d.variant === 'swot' ? 'SWOT' : '2x2';
    const axes = d.variant === 'quadrant' && d.xAxis && d.yAxis ? ` (x: ${d.xAxis}, y: ${d.yAxis})` : '';
    const cells = frameworkCells(d)
      .filter((c) => c.items.length)
      .map((c) => `${c.label}: ${c.items.join('; ')}`)
      .join('. ');
    return `${name}${axes}. ${cells}`.trim();
  },
};
