/**
 * Building blocks shared by the business templates (P6.14): seed-card helpers, a playbook step, the depth tiers and the
 * standard intake fields. Pure data builders; every result is validated by `TemplateSpecV2` and the template tests.
 */
import type { InputField, PlayStepInput, RubricDimension, SeedCard, TierSpec } from './schema.js';

export const metric = (title: string, note: string): SeedCard => ({
  type: 'metric',
  data: { title, value: '—', note },
  why: 'Placeholder: filled with a cited figure.',
});

export const question = (title: string, body?: string): SeedCard => ({
  type: 'question',
  data: { title, ...(body ? { body } : {}), state: 'open' },
  why: 'Template question to answer with cards.',
});

export const checklist = (title: string, texts: readonly string[], why?: string): SeedCard => ({
  type: 'checklist',
  data: { title, items: texts.map((text, i) => ({ id: `i${i + 1}`, text, done: false })) },
  why: why ?? 'You tick items; agents propose them.',
});

export const emptyRisk = (category: string): SeedCard => ({
  type: 'risk',
  data: {
    title: `${category} risk`,
    body: 'Nothing raised yet. Critic raises a specific risk here with evidence, or clears it with a source.',
    kind: 'risk',
  },
  why: `Pre-seeded ${category} risk category.`,
});

export const db = (title: string, key: string): SeedCard => ({ type: 'database', data: { title }, db: key });

export const hypothesis = (title: string, body: string): SeedCard => ({
  type: 'hypothesis',
  data: { title, body, confidence: 50 },
  why: 'Standing hypothesis: confirm or refute with evidence.',
});

export const proscons = (title: string): SeedCard => ({
  type: 'framework',
  data: { title, variant: 'proscons', cells: {} },
  why: 'Placeholder: filled from the cards of the frame.',
});

export const swot = (title: string): SeedCard => ({
  type: 'framework',
  data: { title, variant: 'swot', cells: {} },
  why: 'Placeholder: filled from the cards of the other frames.',
});

export const quadrant = (title: string, xAxis: string, yAxis: string): SeedCard => ({
  type: 'framework',
  data: { title, variant: 'quadrant', xAxis, yAxis, cells: {} },
  why: 'Placeholder: Builder places each option on the axes.',
});

export const matrixSeed = (
  title: string,
  criteria: readonly (readonly [string, number])[],
  options: readonly string[],
): SeedCard => ({
  type: 'matrix',
  data: {
    title,
    criteria: criteria.map(([name, weight]) => ({ name, weight })),
    options: options.map((name) => ({ name, scores: criteria.map(() => null) })),
  },
  why: 'Placeholder: weighted criteria, scored from the databases of the frame.',
});

export const timelineSeed = (title: string, label: string, detail: string): SeedCard => ({
  type: 'timeline',
  data: { title, events: [{ date: '{{year}}', label, detail, source: { label: 'orb template' } }] },
  why: 'Placeholder: dated events, each with a source.',
});

/** The scorecard matrix of a rubric: one orb row and one user row, scores 0 to 10 (a rubric 5 is a 10). */
export const scorecardSeed = (rubric: readonly RubricDimension[], subject: string): SeedCard => ({
  type: 'matrix',
  data: {
    title: `Scorecard: ${subject} (rubric score x 2, so 10 is a 5)`,
    criteria: rubric.map((d) => ({ name: `${d.name} (${d.weight}%)`, weight: d.weight })),
    options: [
      { name: 'orb score', scores: rubric.map(() => null) },
      { name: 'Your score', scores: rubric.map(() => null) },
    ],
  },
  why: 'orb fills one score per dimension with cited evidence; you may override.',
});

export const decisionSeed = (title: string, options: readonly string[]): SeedCard => ({
  type: 'decision',
  data: {
    title,
    body: 'Open. orb proposes after the scorecard is filled and writes the weighted total in the rationale.',
    options: options.map((label) => ({ label })),
    status: 'open',
  },
  why: 'Open decision: the user chooses; orb proposes.',
});

/** A playbook step with the defaults applied. */
export const step = (s: PlayStepInput): PlayStepInput => ({ minTier: 'quick', frames: [], ...s });

export const ALL_DEEP = [
  'deep_research',
  'research_status',
  'find_entities',
  'find_entities_extend',
  'batch_enrich',
  'entity_search',
  'research_memory',
  'suggest_task_spec',
  'web_answer',
  'parallel_extract',
  'image_search',
];

/** The three depth tiers (the cost guard). The numbers follow the VC template; a template tunes `deepRuns`. */
export function tiersFor(opts: { subject: string; standardRuns?: number; deepRuns?: number }): {
  quick: TierSpec;
  standard: TierSpec;
  deep: TierSpec;
} {
  return {
    quick: {
      label: 'Quick scan',
      time: 'about 15 minutes',
      cost: 'low cost',
      summary: `No deep research: search, extract and signed-in fetches only, at most 12 cards per frame, and the memo is the summary only (${opts.subject}).`,
      parallelTools: ['parallel_extract', 'web_answer', 'image_search', 'entity_search', 'research_memory'],
      processors: [],
      deepRuns: 0,
      askAboveUsd: 0.5,
      cardsPerFrame: 12,
      memo: 'summary',
    },
    standard: {
      label: 'Standard',
      time: 'about 45 minutes',
      cost: 'moderate cost',
      summary: 'Quick, plus entity discovery, batch enrichment and one or two deep-research runs (core), asking before spend.',
      parallelTools: [...ALL_DEEP.filter((t) => t !== 'find_entities_extend'), 'watch_topic'],
      processors: ['lite', 'base', 'core'],
      deepRuns: opts.standardRuns ?? 2,
      askAboveUsd: 0.5,
      cardsPerFrame: null,
      memo: 'full',
    },
    deep: {
      label: 'Deep',
      time: 'about 2 hours',
      cost: 'higher cost, asks before spend',
      summary:
        'Standard, plus pro or ultra deep research on the hardest questions, full entity discovery with extension and the full memo.',
      parallelTools: [...ALL_DEEP, 'watch_topic'],
      processors: ['lite', 'base', 'core', 'pro', 'ultra'],
      deepRuns: opts.deepRuns ?? 8,
      askAboveUsd: 0.5,
      cardsPerFrame: null,
      memo: 'full',
    },
  };
}

// ---- standard intake fields ----

export const materialsField = (help: string): InputField => ({
  id: 'materials',
  label: 'Materials',
  kind: 'materials',
  required: false,
  help,
  maxLength: 400,
});

export const depthField = (): InputField => ({
  id: 'depth',
  label: 'Depth',
  kind: 'depth',
  required: true,
  help: 'Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending.',
  maxLength: 20,
});

export const sitesField = (
  sites: readonly { domain: string; label: string }[],
  help = 'Only the sites you connected in Settings can be used. Scout reads them as you, read-only.',
): InputField => ({
  id: 'sites',
  label: 'Signed-in sources to use',
  kind: 'sites',
  required: false,
  help,
  sites: [...sites],
  maxLength: 400,
});
