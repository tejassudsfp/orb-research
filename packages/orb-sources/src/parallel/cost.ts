/**
 * What Parallel calls cost (docs/phase6/parallel-api-spec.md §0, §5.3, §8.3, §9, from docs.parallel.ai pricing,
 * 2026-10-15), so the cost guard can estimate a call BEFORE it is made. Estimates, not invoices: a failed Task run is
 * free, FindAll bills per match, and Parallel's own rates may change. Pure.
 */

/** US dollars per 1000 runs of each Task processor. */
export const TASK_PROCESSORS = {
  lite: 5,
  base: 10,
  core: 25,
  core2x: 50,
  pro: 100,
  ultra: 300,
  ultra2x: 600,
  ultra4x: 1200,
  ultra8x: 2400,
} as const;
export type TaskProcessor = keyof typeof TASK_PROCESSORS;
export const TASK_PROCESSOR_NAMES = Object.keys(TASK_PROCESSORS) as TaskProcessor[];

/** Typical time of each processor in plain words (for the card and the tool answer). */
export const TASK_ETA: Record<TaskProcessor, string> = {
  lite: 'about a minute',
  base: 'about two minutes',
  core: '1.5 to 5 minutes',
  core2x: '3 to 10 minutes',
  pro: '3 to 10 minutes',
  ultra: '4 to 25 minutes',
  ultra2x: 'up to 50 minutes',
  ultra4x: 'up to 90 minutes',
  ultra8x: 'up to 2 hours',
};

export const SEARCH_MODES = { turbo: 1, fast: 1, basic: 5, advanced: 5 } as const;
export type SearchMode = keyof typeof SEARCH_MODES;
export const RESPONSES_EFFORT = { low: 10, medium: 50, high: 250 } as const;
export type ResponsesEffort = keyof typeof RESPONSES_EFFORT;
export const FINDALL_GENERATORS = {
  preview: { fixed: 0.1, perMatch: 0 },
  base: { fixed: 0.25, perMatch: 0.03 },
  core: { fixed: 2, perMatch: 0.15 },
  pro: { fixed: 10, perMatch: 1 },
} as const;
export type FindAllGenerator = keyof typeof FINDALL_GENERATORS;

const per1k = (n: number) => n / 1000;

export const searchCost = (mode: SearchMode, results = 10): number =>
  per1k(SEARCH_MODES[mode]) + per1k(Math.max(0, results - 10));
export const imageSearchCost = (mode: 'fast' | 'advanced'): number => per1k(mode === 'fast' ? 1 : 5);
export const extractCost = (urls: number): number => per1k(urls);
export const responsesCost = (effort: ResponsesEffort): number => per1k(RESPONSES_EFFORT[effort]);
export const taskCost = (processor: TaskProcessor): number => per1k(TASK_PROCESSORS[processor]);
export const groupCost = (processor: TaskProcessor, rows: number): number => taskCost(processor) * rows;
export const entitySearchCost = (): number => per1k(5);

/** FindAll: the generator's fixed fee, a fee per match (assume `matchLimit` matches), and each enrichment's Task price per match. */
export function findAllCost(
  generator: FindAllGenerator,
  matchLimit: number,
  enrichments: readonly TaskProcessor[] = [],
): number {
  const g = FINDALL_GENERATORS[generator];
  const matches = generator === 'preview' ? 0 : matchLimit;
  return g.fixed + g.perMatch * matches + enrichments.reduce((sum, p) => sum + taskCost(p) * Math.max(1, matchLimit), 0);
}

/** `<n>h|d|w` → hours between checks (1 h to 30 d). */
export function frequencyHours(frequency: string): number | undefined {
  const m = /^(\d{1,3})([hdw])$/.exec(frequency.trim());
  if (!m) return undefined;
  const hours = Number(m[1]) * (m[2] === 'h' ? 1 : m[2] === 'd' ? 24 : 168);
  return hours >= 1 && hours <= 30 * 24 ? hours : undefined;
}

/** A month (30 days) of monitor checks: `lite` $3 / 1k, `base` $10 / 1k. */
export function monitorMonthlyCost(frequency: string, processor: 'lite' | 'base'): number {
  const hours = frequencyHours(frequency) ?? 24;
  return Math.ceil((30 * 24) / hours) * per1k(processor === 'lite' ? 3 : 10);
}

/** Round up to a tenth of a cent, so $0.0002 never shows as $0. */
export const roundUsd = (n: number): number => Math.ceil(n * 1000 - 1e-9) / 1000;

export const isTaskProcessor = (v: unknown): v is TaskProcessor =>
  typeof v === 'string' && Object.hasOwn(TASK_PROCESSORS, v);

/** True when `cost` is over the user's confirmation threshold. */
export const needsConfirmation = (cost: number, thresholdUsd: number): boolean => cost > thresholdUsd + 1e-9;
