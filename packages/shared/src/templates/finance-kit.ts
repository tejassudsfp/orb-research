/**
 * Building blocks shared by the investing and finance templates (P6.12): seed-card constructors, the playbook step
 * default and the three depth tiers. Pure data helpers, no logic: each template file still declares everything that makes
 * it different (frames, databases, plan, rubric, red flags, memo, follow-ups).
 */
import type {
  CardTarget,
  DatabaseColumnSpec,
  DatabaseViewSpec,
  InputField,
  PlayStepInput,
  RedFlag,
  SeedCard,
  TemplateSpecInput,
} from './schema.js';

type Tiers = TemplateSpecInput['tiers'];

// ---- seed cards ----

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

export const hypothesis = (title: string, body: string, confidence = 50): SeedCard => ({
  type: 'hypothesis',
  data: { title, body, confidence },
  why: 'Standing hypothesis: link the cards that support it and the ones that contradict it.',
});

export const doc = (title: string, body: string, why = 'Placeholder: orb writes it after the first pass.'): SeedCard => ({
  type: 'doc',
  data: { title, body },
  why,
});

/** A bound chart: `x`, `y` and `color` are column names of the database `key`. */
export const chart = (
  title: string,
  mark: 'bar' | 'line' | 'area' | 'scatter' | 'pie',
  key: string,
  x: string,
  y: string,
  color?: string,
): SeedCard => ({
  type: 'chart',
  data: { title, mark, x, y, ...(color ? { color } : {}) },
  db: key,
  why: 'Bound to its database: it fills as rows arrive.',
});

export const timeline = (title: string, label: string, detail: string): SeedCard => ({
  type: 'timeline',
  data: {
    title,
    events: [{ date: '{{year}}', label, detail, source: { label: 'orb template' } }],
  },
  why: 'Placeholder: Scout adds dated events, each with a source.',
});

/** A weighted matrix: `rows` get empty scores. */
export const matrix = (
  title: string,
  criteria: readonly (readonly [string, number])[],
  rows: readonly string[],
  why = 'Placeholder: scored once the options are known.',
): SeedCard => ({
  type: 'matrix',
  data: {
    title,
    criteria: criteria.map(([name, weight]) => ({ name, weight })),
    options: rows.map((name) => ({ name, scores: criteria.map(() => null) })),
  },
  why,
});

export const quadrant = (title: string, xAxis: string, yAxis: string): SeedCard => ({
  type: 'framework',
  data: { title, variant: 'quadrant', xAxis, yAxis, cells: {} },
  why: 'Placeholder: Builder places each player on the axes.',
});

export const swot = (title: string): SeedCard => ({
  type: 'framework',
  data: { title, variant: 'swot', cells: {} },
  why: 'Placeholder: filled from the cards of the other frames.',
});

export const proscons = (title: string): SeedCard => ({
  type: 'framework',
  data: { title, variant: 'proscons', cells: {} },
  why: 'Placeholder: pros and cons, each backed by a card.',
});

export const decision = (title: string, options: readonly string[], body: string): SeedCard => ({
  type: 'decision',
  data: { title, body, options: options.map((label) => ({ label })), status: 'open' },
  why: 'Open decision: the user chooses; orb proposes.',
});

/** The scorecard matrix of a rubric (weights as percentages; each score is doubled on the matrix, so 10 is a 5). */
export const scorecard = (
  title: string,
  rubric: readonly { name: string; weight: number }[],
  rows: readonly string[] = ['orb score', 'Your score'],
): SeedCard =>
  matrix(
    title,
    rubric.map((d) => [`${d.name} (${d.weight}%)`, d.weight] as const),
    rows,
    'orb fills one score per dimension with cited evidence; you may override.',
  );

/** The red-flag checklist seed: one item per flag. */
export const redFlagChecklist = (title: string, flags: readonly RedFlag[]): SeedCard => ({
  type: 'checklist',
  data: { title, items: flags.map((f, i) => ({ id: `rf${i + 1}`, text: `${f.id} ${f.text}`, done: false })) },
  why: 'Critic raises or clears each; you tick them off.',
});

// ---- columns and views ----

export const col = (
  name: string,
  type: DatabaseColumnSpec['type'],
  extra: { options?: string[]; note?: string } = {},
): DatabaseColumnSpec => ({ name, type, ...extra });

export const tableView = (
  name: string,
  extra: Omit<DatabaseViewSpec, 'name' | 'kind'> = {},
): DatabaseViewSpec => ({ name, kind: 'table', ...extra });

export const boardView = (name: string, group: string): DatabaseViewSpec => ({ name, kind: 'board', group });

/** Targets list shorthand. */
export const target = (type: CardTarget['type'], min: number, note?: string): CardTarget => ({
  type,
  min,
  ...(note ? { note } : {}),
});

// ---- intake fields ----

export const depthField: InputField = {
  id: 'depth',
  label: 'Depth',
  kind: 'depth',
  required: true,
  help: 'Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending.',
  maxLength: 20,
} as InputField;

export const sitesField = (
  sites: readonly { domain: string; label: string }[],
  help = 'Only the sites you connected in Settings can be used. Scout reads them as you, read-only.',
): InputField =>
  ({
    id: 'sites',
    label: 'Signed-in sources to use',
    kind: 'sites',
    help,
    sites: [...sites],
    maxLength: 400,
  }) as InputField;

export const materialsField = (help: string): InputField =>
  ({ id: 'materials', label: 'Materials', kind: 'materials', help, maxLength: 400 }) as InputField;

// ---- plan steps ----

/** A step of every plan: tools are checked against the role's allow-list by the tests. */
export const step = (s: PlayStepInput): PlayStepInput => ({ minTier: 'quick', frames: [], ...s });

// ---- tiers (the cost guard) ----

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

/** The three depth tiers; a template says what each does for it. */
export function tiersFor(text: { quick: string; standard: string; deep: string }, monitors = true): Tiers {
  const watch = monitors ? ['watch_topic'] : [];
  return {
    quick: {
      label: 'Quick scan',
      time: 'about 15 minutes',
      cost: 'low cost',
      summary: text.quick,
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
      summary: text.standard,
      parallelTools: [...ALL_DEEP.filter((t) => t !== 'find_entities_extend'), ...watch],
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
      summary: text.deep,
      parallelTools: [...ALL_DEEP, ...watch],
      processors: ['lite', 'base', 'core', 'pro', 'ultra'],
      deepRuns: 8,
      askAboveUsd: 0.5,
      cardsPerFrame: null,
      memo: 'full',
    },
  };
}
