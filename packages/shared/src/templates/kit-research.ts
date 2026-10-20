/**
 * Building blocks shared by the research and knowledge templates (P6.15): seed-card builders, the playbook step helper,
 * the common intake fields and the three depth tiers. Nothing here is a template; the templates stay data.
 */
import type { InputField, PlayStepInput, SeedCard, TemplateSpecInput } from './schema.js';

type Tiers = TemplateSpecInput['tiers'];

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

export const checklist = (title: string, texts: readonly string[]): SeedCard => ({
  type: 'checklist',
  data: { title, items: texts.map((text, i) => ({ id: `i${i + 1}`, text, done: false })) },
  why: 'You tick items; agents propose them.',
});

export const emptyRisk = (category: string, body?: string): SeedCard => ({
  type: 'risk',
  data: {
    title: `${category} risk`,
    body: body ?? 'Nothing raised yet. Critic raises a specific risk here with evidence, or clears it with a source.',
    kind: 'risk',
  },
  why: `Pre-seeded ${category} risk category.`,
});

export const doc = (title: string, body: string, why = 'Placeholder: orb writes it after the first pass.'): SeedCard => ({
  type: 'doc',
  data: { title, body },
  why,
});

export const hypothesis = (title: string, body: string, confidence = 50): SeedCard => ({
  type: 'hypothesis',
  data: { title, body, confidence },
  why: 'Standing hypothesis: link evidence for and against.',
});

export const db = (title: string, key: string): SeedCard => ({ type: 'database', data: { title }, db: key });

export const chart = (
  title: string,
  dbKey: string,
  mark: 'bar' | 'line' | 'area' | 'scatter' | 'pie',
  x: string,
  y?: string,
  color?: string,
): SeedCard => ({
  type: 'chart',
  data: { title, mark, x, ...(y ? { y } : {}), ...(color ? { color } : {}) },
  db: dbKey,
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

export const matrix = (title: string, criteria: readonly [string, number][], options: readonly string[]): SeedCard => ({
  type: 'matrix',
  data: {
    title,
    criteria: criteria.map(([name, weight]) => ({ name, weight })),
    options: options.map((name) => ({ name, scores: criteria.map(() => null) })),
  },
  why: 'Placeholder: weighted criteria, scored from the cards and databases.',
});

export const framework = (
  title: string,
  variant: 'proscons' | 'swot' | 'quadrant',
  axes?: { x: string; y: string },
): SeedCard => ({
  type: 'framework',
  data: { title, variant, cells: {}, ...(axes ? { xAxis: axes.x, yAxis: axes.y } : {}) },
  why: 'Placeholder: filled from the cards of the other frames.',
});

export const decision = (title: string, labels: readonly string[]): SeedCard => ({
  type: 'decision',
  data: {
    title,
    body: 'Open. orb proposes after the rubric is filled and writes its rationale here; you decide.',
    options: labels.map((label) => ({ label })),
    status: 'open',
  },
  why: 'Open decision: the user chooses; orb proposes.',
});

/** A step of a plan: runs from the Quick tier unless `minTier` says otherwise. */
export const step = (s: PlayStepInput): PlayStepInput => ({ minTier: 'quick', frames: [], ...s });

/** The Parallel tools the Standard and Deep tiers allow (Quick keeps the cheap ones). */
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

export const CHEAP = ['parallel_extract', 'web_answer', 'image_search', 'entity_search', 'research_memory'];

export const depthField = (): InputField => ({
  id: 'depth',
  label: 'Depth',
  kind: 'depth',
  required: true,
  help: 'Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending.',
  maxLength: 20,
  });

export const materialsField = (help: string): InputField => ({
  id: 'materials',
  label: 'Materials',
  kind: 'materials',
  required: false,
  help,
  maxLength: 400,
});

export const sitesField = (sites: { domain: string; label: string }[]): InputField => ({
  id: 'sites',
  label: 'Signed-in sources to use',
  kind: 'sites',
  required: false,
  help: 'Only the sites you connected in Settings can be used. Scout reads them as you, read-only.',
  sites,
  maxLength: 400,
});

export type TierWords = {
  quick: { time?: string; summary: string };
  standard: { time?: string; summary: string };
  deep: { time?: string; summary: string };
  /** Add the watch tools from Standard (an ongoing template). */
  watch?: boolean;
  /** The deck/memo is a one-pager on Quick. */
};

/** The three tiers of a research template: Quick has no deep research, Standard core, Deep pro and ultra. */
export function tiers(w: TierWords): Tiers {
  const watch = w.watch ? ['watch_topic'] : [];
  return {
    quick: {
      label: 'Quick scan',
      time: w.quick.time ?? 'about 15 minutes',
      cost: 'low cost',
      summary: w.quick.summary,
      parallelTools: [...CHEAP],
      processors: [],
      deepRuns: 0,
      askAboveUsd: 0.5,
      cardsPerFrame: 12,
      memo: 'summary',
    },
    standard: {
      label: 'Standard',
      time: w.standard.time ?? 'about 45 minutes',
      cost: 'moderate cost',
      summary: w.standard.summary,
      parallelTools: [...ALL_DEEP.filter((t) => t !== 'find_entities_extend'), ...watch],
      processors: ['lite', 'base', 'core'],
      deepRuns: 2,
      askAboveUsd: 0.5,
      cardsPerFrame: null,
      memo: 'full',
    },
    deep: {
      label: 'Deep',
      time: w.deep.time ?? 'about 2 hours',
      cost: 'higher cost, asks before spend',
      summary: w.deep.summary,
      parallelTools: [...ALL_DEEP, ...watch],
      processors: ['lite', 'base', 'core', 'pro', 'ultra'],
      deepRuns: 8,
      askAboveUsd: 0.5,
      cardsPerFrame: null,
      memo: 'full',
    },
  };
}
