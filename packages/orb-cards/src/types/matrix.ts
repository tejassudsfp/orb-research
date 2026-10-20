/** Comparison matrix (P6.4): options scored 0 to 10 against weighted criteria; the best weighted total is highlighted. */
import { MATRIX_LIMITS, MatrixData, matrixSummary, readCardData } from '@orb/shared';
import { z } from 'zod';
import { Title, type CardTypeSpec } from '../spec.js';
import { DESCRIBE_MAX, clip } from '../describe.js';

export const matrix: CardTypeSpec<'matrix'> = {
  type: 'matrix',
  purpose: 'A comparison of options against weighted criteria: scores per cell, a weighted total, the winner highlighted.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    criteria: z
      .array(z.strictObject({ name: z.string().trim().min(1).max(80), weight: z.number().min(1).max(100) }))
      .min(1)
      .max(MATRIX_LIMITS.criteria),
    options: z
      .array(
        z.strictObject({
          name: z.string().trim().min(1).max(80),
          scores: z.array(z.number().min(0).max(MATRIX_LIMITS.score).nullable()).max(MATRIX_LIMITS.criteria),
          note: z.string().trim().max(300).optional(),
        }),
      )
      .min(2)
      .max(MATRIX_LIMITS.options),
  }),
  fieldHelp: `title, criteria (1 to ${MATRIX_LIMITS.criteria}) each { name, weight 1 to 100 }, options (2 to ${MATRIX_LIMITS.options}) each { name, scores = one number 0 to 10 per criterion in the same order (null: not scored), note? }. The weighted total and the winner are worked out; do not state them`,
  toData: (f) => {
    const out: Record<string, unknown> = {};
    for (const k of ['title', 'criteria', 'options'] as const) if (f[k] !== undefined) out[k] = f[k];
    return out;
  },
  describe(data) {
    const d = readCardData(MatrixData, data);
    return d ? clip(matrixSummary(d), DESCRIBE_MAX) : 'Comparison matrix (unreadable data).';
  },
};
