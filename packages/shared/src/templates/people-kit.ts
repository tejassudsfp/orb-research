/**
 * P6.16: the seed and playbook helpers the five people and personal templates share (candidate research, event
 * prep, a big personal decision, trip planning, an investigation). Pure data builders; the specs themselves are one
 * file each next to this one, and `docs/templates/<id>.md` is generated from them.
 */
import type {
  DatabaseColumnSpec,
  PlayStepInput,
  RedFlag,
  RubricDimension,
  SeedCard,
  TierSpec,
} from './schema.js';

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

export const emptyRisk = (category: string, hint?: string): SeedCard => ({
  type: 'risk',
  data: {
    title: `${category} risk`,
    body: hint ?? 'Nothing raised yet. Critic raises a specific risk here with evidence, or clears it with a source.',
    kind: 'risk',
  },
  why: `Pre-seeded ${category} risk category.`,
});

export const db = (title: string, key: string): SeedCard => ({ type: 'database', data: { title }, db: key });

export const doc = (title: string, body: string, why = 'Written by orb after the first pass.'): SeedCard => ({
  type: 'doc',
  data: { title, body },
  why,
});

export const hypothesis = (title: string, body: string): SeedCard => ({
  type: 'hypothesis',
  data: { title, body, confidence: 50 },
  why: 'Standing hypothesis: link evidence for and against.',
});

export const timelineSeed = (title: string, label: string, detail: string, source = 'orb template'): SeedCard => ({
  type: 'timeline',
  data: { title, events: [{ date: '{{year}}', label, detail, source: { label: source } }] },
  why: 'Placeholder: dated events, each with a source.',
});

export const chartSeed = (
  title: string,
  mark: 'bar' | 'line' | 'area' | 'scatter' | 'pie',
  key: string,
  x: string,
  y?: string,
  color?: string,
): SeedCard => ({
  type: 'chart',
  data: { title, mark, x, ...(y ? { y } : {}), ...(color ? { color } : {}) },
  db: key,
  why: 'Bound to a database: it fills as rows arrive.',
});

export const framework = (
  variant: 'proscons' | 'swot' | 'quadrant',
  title: string,
  axes?: { x: string; y: string },
): SeedCard => ({
  type: 'framework',
  data: { title, variant, cells: {}, ...(axes ? { xAxis: axes.x, yAxis: axes.y } : {}) },
  why: 'Placeholder: filled from the cards of the other frames.',
});

export const matrixSeed = (
  title: string,
  criteria: readonly { name: string; weight: number }[],
  options: readonly string[],
  why = 'Placeholder: weighted criteria, scored from the databases.',
): SeedCard => ({
  type: 'matrix',
  data: {
    title,
    criteria,
    options: options.map((name) => ({ name, scores: criteria.map(() => null) })),
  },
  why,
});

export const decisionSeed = (title: string, options: readonly string[], body: string): SeedCard => ({
  type: 'decision',
  data: { title, body, options: options.map((label) => ({ label })), status: 'open' },
  why: 'Open decision: you choose; orb proposes.',
});

/** The rubric scorecard: scores are the 1 to 5 rubric score doubled, so 10 is a 5 (as the VC template). */
export const scorecard = (rubric: readonly RubricDimension[]): SeedCard =>
  matrixSeed(
    'Scorecard (rubric score x 2, so 10 is a 5)',
    rubric.map((d) => ({ name: `${d.name} (${d.weight}%)`, weight: d.weight })),
    ['orb score', 'Your score'],
    'orb fills one score per dimension with cited evidence; you may override.',
  );

export const col = (
  name: string,
  type: DatabaseColumnSpec['type'] = 'text',
  extra: { options?: string[]; note?: string } = {},
): DatabaseColumnSpec => ({ name, type, ...extra });

export const step = (s: PlayStepInput): PlayStepInput => ({ minTier: 'quick', frames: [], ...s });

/** Red flags in a template's own words (ids RF01 upward). */
export const flags = (list: readonly [text: string, check: string][]): RedFlag[] =>
  list.map(([text, check], i) => ({ id: `RF${String(i + 1).padStart(2, '0')}`, text, check }));

/** The checklist seed that holds a template's red flags. */
export const flagChecklist = (title: string, list: readonly RedFlag[]): SeedCard => ({
  type: 'checklist',
  data: { title, items: list.map((f, i) => ({ id: `rf${i + 1}`, text: `${f.id} ${f.text}`, done: false })) },
  why: 'Critic raises or clears each; you tick them off.',
});

// ---- tiers ----

const CHEAP = ['parallel_extract', 'web_answer', 'image_search', 'entity_search', 'research_memory'];
const STANDARD = [
  'deep_research',
  'research_status',
  'find_entities',
  'batch_enrich',
  'suggest_task_spec',
  ...CHEAP,
  'watch_topic',
];
const DEEP = [...STANDARD, 'find_entities_extend'];

/** Quick / Standard / Deep with the spend each allows (the cost guard); `quickCards` caps a Quick frame. */
export function tiers(t: {
  quickSummary: string;
  standardSummary: string;
  deepSummary: string;
  quickCards?: number;
  deepRuns?: number;
}): { quick: TierSpec; standard: TierSpec; deep: TierSpec } {
  return {
    quick: {
      label: 'Quick scan',
      time: 'about 15 minutes',
      cost: 'low cost',
      summary: t.quickSummary,
      parallelTools: CHEAP,
      processors: [],
      deepRuns: 0,
      askAboveUsd: 0.5,
      cardsPerFrame: t.quickCards ?? 12,
      memo: 'summary',
    },
    standard: {
      label: 'Standard',
      time: 'about 45 minutes',
      cost: 'moderate cost',
      summary: t.standardSummary,
      parallelTools: STANDARD,
      processors: ['lite', 'base', 'core'],
      deepRuns: 2,
      askAboveUsd: 0.5,
      cardsPerFrame: null,
      memo: 'full',
    },
    deep: {
      label: 'Deep',
      time: 'about 2 hours',
      cost: 'higher cost, asks before spend',
      summary: t.deepSummary,
      parallelTools: DEEP,
      processors: ['lite', 'base', 'core', 'pro', 'ultra'],
      deepRuns: t.deepRuns ?? 6,
      askAboveUsd: 0.5,
      cardsPerFrame: null,
      memo: 'full',
    },
  };
}

/** The intake fields every template ends with: the materials drop zone and the depth tier. */
export const materialsField = (help: string) =>
  ({ id: 'materials', label: 'Materials', kind: 'materials', help, maxLength: 400 }) as const;

export const depthField = (help: string) =>
  ({ id: 'depth', label: 'Depth', kind: 'depth', required: true, help, maxLength: 20 }) as const;
