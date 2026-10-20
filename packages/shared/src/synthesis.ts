/**
 * Synthesis cards (P6.5): the cards that turn findings into a position. Pure and harness-free.
 *
 * - Insight: a conclusion that cites at least two other cards (`INSIGHT_MIN_CITATIONS`, enforced by the schema, so a
 *   card with fewer cannot be written by anyone).
 * - Hypothesis: a statement with a confidence (0 to 100) and the cards for and against it. Links drawn on the board
 *   count too: a `supports` link INTO the hypothesis is a "for", a `contradicts` link into it an "against"
 *   (`hypothesisEvidence` merges both, so linking a card updates the hypothesis everywhere it is read).
 * - Decision: options, a choice, a rationale and a status; with a weighted rubric (`criteria` + per-option `scores`)
 *   it also shows each option's weighted total (`decisionTotals`).
 * - Framework: Pros/cons, SWOT or a 2x2 quadrant, one card type with three variants (`FRAMEWORK_VARIANTS`).
 */
import { z } from 'zod';

const Text = (max: number) => z.string().max(max);
const Name = (max: number) => z.string().trim().min(1).max(max);
const CardRef = z.string().regex(/^c_[A-Za-z0-9]{1,64}$/);

const distinct = <T>(items: readonly T[]) => new Set(items).size === items.length;

// ---- Insight ----

/** An insight must stand on at least this many cards. */
export const INSIGHT_MIN_CITATIONS = 2;
export const INSIGHT_MAX_CITATIONS = 12;

export const InsightData = z.looseObject({
  title: Name(500),
  body: Text(4000).optional(),
  /** The cards the insight rests on (distinct, at least two). */
  citations: z
    .array(CardRef)
    .min(INSIGHT_MIN_CITATIONS, { message: `an insight must cite at least ${INSIGHT_MIN_CITATIONS} cards` })
    .max(INSIGHT_MAX_CITATIONS)
    .refine(distinct, { message: 'an insight must cite different cards' }),
});
export type InsightData = z.infer<typeof InsightData>;

// ---- Hypothesis ----

export const HYPOTHESIS_MAX_EVIDENCE = 20;
const Evidence = z
  .array(CardRef)
  .max(HYPOTHESIS_MAX_EVIDENCE)
  .refine(distinct, { message: 'evidence cards must be different' });

export const HypothesisData = z.looseObject({
  title: Name(500),
  body: Text(4000).optional(),
  /** How likely the hypothesis is, in percent. */
  confidence: z.number().int().min(0).max(100),
  evidenceFor: Evidence.optional(),
  evidenceAgainst: Evidence.optional(),
});
export type HypothesisData = z.infer<typeof HypothesisData>;

/** The word for a confidence: shown on the card beside the number. */
export function confidenceLabel(confidence: number): 'unlikely' | 'uncertain' | 'likely' {
  return confidence < 35 ? 'unlikely' : confidence > 65 ? 'likely' : 'uncertain';
}

/**
 * The cards for and against a hypothesis: those its data names plus the board's links into it (`supports` is for,
 * `contradicts` is against). A card in both lists is counted for the side its data names; a link never moves it.
 * Order: data first, then links in the given order.
 */
export function hypothesisEvidence(
  card: { id: string; data: unknown },
  links: Iterable<{ from: string; to: string; type: string }>,
): { for: string[]; against: string[] } {
  const parsed = HypothesisData.safeParse(card.data);
  const d: Partial<HypothesisData> = parsed.success ? parsed.data : {};
  const forIds = [...(d.evidenceFor ?? [])];
  const againstIds = [...(d.evidenceAgainst ?? [])];
  const seen = new Set([...forIds, ...againstIds]);
  for (const l of links) {
    if (l.to !== card.id || l.from === card.id || seen.has(l.from)) continue;
    if (l.type === 'supports') forIds.push(l.from);
    else if (l.type === 'contradicts') againstIds.push(l.from);
    else continue;
    seen.add(l.from);
  }
  return { for: forIds, against: againstIds };
}

// ---- Decision ----

export const DECISION_STATUSES = ['open', 'decided', 'revisit'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];
export const DECISION_LIMITS = { options: 8, criteria: 8, score: 10 } as const;

export const DecisionOption = z.strictObject({
  label: Name(200),
  note: Text(600).optional(),
  /** One score (0 to 10) per criterion, in the criteria's order. */
  scores: z.array(z.number().min(0).max(DECISION_LIMITS.score)).max(DECISION_LIMITS.criteria).optional(),
});
export type DecisionOption = z.infer<typeof DecisionOption>;

export const DecisionCriterion = z.strictObject({
  name: Name(120),
  /** Relative weight; only the proportions matter. */
  weight: z.number().positive().max(100),
});
export type DecisionCriterion = z.infer<typeof DecisionCriterion>;

export const DecisionData = z
  .looseObject({
    title: Name(500),
    body: Text(4000).optional(),
    options: z.array(DecisionOption).min(2).max(DECISION_LIMITS.options),
    /** The label of the chosen option. */
    choice: Name(200).optional(),
    rationale: Text(4000).optional(),
    status: z.enum(DECISION_STATUSES).optional(),
    criteria: z.array(DecisionCriterion).max(DECISION_LIMITS.criteria).optional(),
  })
  .refine((d) => distinct(d.options.map((o) => o.label)), { message: 'option labels must be different' })
  .refine((d) => d.choice === undefined || d.options.some((o) => o.label === d.choice), {
    message: 'choice must be one of the option labels',
  })
  .refine((d) => d.status !== 'decided' || d.choice !== undefined, {
    message: 'a decided decision needs a choice',
  })
  .refine(
    (d) => {
      const n = d.criteria?.length ?? 0;
      return d.options.every((o) => o.scores === undefined || (n > 0 && o.scores.length === n));
    },
    { message: 'each option needs exactly one score per criterion (and scores need criteria)' },
  );
export type DecisionData = z.infer<typeof DecisionData>;

export type DecisionTotal = { label: string; total: number; rank: number };

/**
 * Each option's weighted total (0 to 10, two decimals) with its rank (1 = best; ties share a rank), in the options'
 * order. Undefined without criteria, or when any option has no scores.
 */
export function decisionTotals(d: Pick<DecisionData, 'options' | 'criteria'>): DecisionTotal[] | undefined {
  const criteria = d.criteria ?? [];
  if (criteria.length === 0 || d.options.some((o) => !o.scores || o.scores.length !== criteria.length))
    return undefined;
  const weight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const totals = d.options.map((o) => ({
    label: o.label,
    total: Math.round((o.scores!.reduce((sum, s, i) => sum + s * criteria[i]!.weight, 0) / weight) * 100) / 100,
  }));
  return totals.map((t) => ({ ...t, rank: 1 + totals.filter((u) => u.total > t.total).length }));
}

// ---- Framework: pros/cons, SWOT, 2x2 ----

export const FRAMEWORK_VARIANTS = ['proscons', 'swot', 'quadrant'] as const;
export type FrameworkVariant = (typeof FRAMEWORK_VARIANTS)[number];

/** The cells of each variant, in reading order, with the label each prints. Quadrant: top-left first. */
export const FRAMEWORK_CELLS: Record<FrameworkVariant, readonly { key: string; label: string }[]> = {
  proscons: [
    { key: 'pros', label: 'Pros' },
    { key: 'cons', label: 'Cons' },
  ],
  swot: [
    { key: 'strengths', label: 'Strengths' },
    { key: 'weaknesses', label: 'Weaknesses' },
    { key: 'opportunities', label: 'Opportunities' },
    { key: 'threats', label: 'Threats' },
  ],
  quadrant: [
    { key: 'topLeft', label: 'High y, low x' },
    { key: 'topRight', label: 'High y, high x' },
    { key: 'bottomLeft', label: 'Low y, low x' },
    { key: 'bottomRight', label: 'Low y, high x' },
  ],
};
export const FRAMEWORK_LIMITS = { perCell: 8, item: 300 } as const;

export const FrameworkData = z
  .looseObject({
    title: Name(500),
    body: Text(2000).optional(),
    variant: z.enum(FRAMEWORK_VARIANTS),
    /** Items by cell key (`FRAMEWORK_CELLS[variant]`). */
    cells: z.record(z.string(), z.array(Name(FRAMEWORK_LIMITS.item)).max(FRAMEWORK_LIMITS.perCell)),
    /** Quadrant only: the names of the horizontal and the vertical axis. */
    xAxis: Name(60).optional(),
    yAxis: Name(60).optional(),
  })
  .refine((d) => Object.keys(d.cells).every((k) => FRAMEWORK_CELLS[d.variant].some((c) => c.key === k)), {
    message: 'a cell does not belong to this variant',
  });
export type FrameworkData = z.infer<typeof FrameworkData>;

/** The cells of a framework with their labels (quadrant labels use the axis names when given) and items. */
export function frameworkCells(d: FrameworkData): { key: string; label: string; items: string[] }[] {
  const x = d.xAxis ?? 'x';
  const y = d.yAxis ?? 'y';
  return FRAMEWORK_CELLS[d.variant].map((c) => {
    const label =
      d.variant === 'quadrant'
        ? c.key === 'topLeft'
          ? `High ${y}, low ${x}`
          : c.key === 'topRight'
            ? `High ${y}, high ${x}`
            : c.key === 'bottomLeft'
              ? `Low ${y}, low ${x}`
              : `Low ${y}, high ${x}`
        : c.label;
    return { key: c.key, label, items: d.cells[c.key] ?? [] };
  });
}

/** Card ids a synthesis card's data points at (citations, evidence): the references the board must hold. */
export function synthesisRefs(type: string, data: unknown): string[] {
  const d = (data ?? {}) as { citations?: unknown; evidenceFor?: unknown; evidenceAgainst?: unknown };
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  if (type === 'insight') return ids(d.citations);
  if (type === 'hypothesis') return [...ids(d.evidenceFor), ...ids(d.evidenceAgainst)];
  return [];
}
