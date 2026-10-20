import { z } from 'zod';

/** Observable coverage, not a claim that the research is factually verified. Empty scaffolding never counts. */
export const ResearchCoverage = z.object({
  state: z.enum(['working', 'complete', 'incomplete']),
  totalFrames: z.number().int().nonnegative(),
  coveredFrames: z.number().int().nonnegative(),
  gaps: z.array(
    z.object({
      frameId: z.string(),
      title: z.string(),
      reasons: z.array(z.string()),
    }),
  ),
});
export type ResearchCoverage = z.infer<typeof ResearchCoverage>;
