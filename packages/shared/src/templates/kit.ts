/**
 * Small builders the P6.13 (startup / product) templates share: seed cards, a playbook step, the three depth tiers and
 * the standard intake fields. Pure data helpers; every template still declares its own frames, databases and playbook.
 */
import type { PlayStepInput, RedFlag, SeedCard, TemplateSpecInput } from './schema.js';

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

export const emptyRisk = (category: string, body?: string): SeedCard => ({
  type: 'risk',
  data: {
    title: `${category} risk`,
    body: body ?? 'Nothing raised yet. Critic raises a specific risk here with evidence, or clears it with a source.',
    kind: 'risk',
  },
  why: `Pre-seeded ${category} risk category.`,
});

export const hypothesis = (title: string, body: string, confidence = 50): SeedCard => ({
  type: 'hypothesis',
  data: { title, body, confidence },
  why: 'Hypothesis to confirm or refute with linked evidence.',
});

export const db = (title: string, key: string): SeedCard => ({ type: 'database', data: { title }, db: key });

export const chart = (title: string, key: string, mark: string, x: string, y?: string, color?: string): SeedCard => ({
  type: 'chart',
  data: { title, mark, x, ...(y ? { y } : {}), ...(color ? { color } : {}) },
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

export const matrix = (
  title: string,
  criteria: readonly { name: string; weight: number }[],
  options: readonly string[],
  why: string,
): SeedCard => ({
  type: 'matrix',
  data: {
    title,
    criteria,
    options: options.map((name) => ({ name, scores: criteria.map(() => null) })),
  },
  why,
});

export const framework = (
  title: string,
  variant: 'swot' | 'proscons' | 'quadrant',
  extra: { xAxis?: string; yAxis?: string } = {},
): SeedCard => ({
  type: 'framework',
  data: { title, variant, cells: {}, ...extra },
  why: 'Placeholder: filled from the cards of the other frames.',
});

/** A step of a plan: tools are checked against the role's allow-list by the tests. */
export const step = (s: PlayStepInput): PlayStepInput => ({ minTier: 'quick', frames: [], ...s });

/** Red flags from `[text, check]` pairs, numbered RF01 on. */
export const redFlags = (items: readonly (readonly [string, string])[]): RedFlag[] =>
  items.map(([text, check], i) => ({ id: `RF${String(i + 1).padStart(2, '0')}`, text, check }));

const DEEP_TOOLS = [
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

type TierText = { quick: string; standard: string; deep: string };

/** Quick / Standard / Deep with the same cost guard as every template (see `tierGate`). */
export function tiers(text: TierText, opts: { watch?: boolean } = {}): TemplateSpecInput['tiers'] {
  const watch = opts.watch === false ? [] : ['watch_topic'];
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
      parallelTools: [...DEEP_TOOLS.filter((t) => t !== 'find_entities_extend'), ...watch],
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
      parallelTools: [...DEEP_TOOLS, ...watch],
      processors: ['lite', 'base', 'core', 'pro', 'ultra'],
      deepRuns: 8,
      askAboveUsd: 0.5,
      cardsPerFrame: null,
      memo: 'full',
    },
  };
}

type Input = TemplateSpecInput['inputs'][number];

export const materialsField = (help: string): Input => ({ id: 'materials', label: 'Materials', kind: 'materials', help, maxLength: 400 });

export const depthField: Input = {
  id: 'depth',
  label: 'Depth',
  kind: 'depth',
  required: true,
  help: 'Quick scan is about 15 minutes at low cost. Standard is the default. Deep uses Parallel deep research and asks before spending.',
  maxLength: 20,
};

export const sitesField = (sites: readonly { domain: string; label: string }[]): Input => ({
  id: 'sites',
  label: 'Signed-in sources to use',
  kind: 'sites',
  help: 'Only the sites you connected in Settings can be used. Scout reads them as you, read-only.',
  sites: [...sites],
  maxLength: 400,
});

/** The "read the materials, delegate" opening steps most playbooks of Orb share. */
export const orbDelegate = (agents: string): PlayStepInput =>
  step({
    id: 'delegate',
    text: `Delegate with delegate: ${agents} Name the frames each agent owns, and hand over the intake facts (names, links, concerns) in the instruction.`,
    tools: ['delegate', 'message_agent'],
  });

/** The memo step of every playbook (a Quick scan writes the summary only). */
export const orbMemo = step({
  id: 'memo',
  text: 'Write the memo with compose_section, section by section in the order of the memo outline, then the one-page summary. On the Quick tier write the summary only. When the user asks for slides, compose_slides with the deck outline.',
  tools: ['compose_section', 'compose_slides'],
});

/** Orb's closing step: keep the open questions and the monitor available. */
export const orbMonitor = step({
  id: 'monitor',
  text: 'Only when the user asks to keep watching: watch_topic with the monitor query. Monitors cost money on every check, so each is confirmed by the user.',
  tools: ['watch_topic', 'list_watches', 'stop_watch'],
  minTier: 'standard',
});

export const criticStart = step({
  id: 'start',
  text: "Start after Scout's first sources: read the cards of every frame (board_map, search_board, read_card) before judging anything.",
  tools: ['board_map', 'search_board', 'read_card', 'query_board'],
});

/** Critic's red-flag step: raise with a Risk card, clear with an Insight that cites at least two cards. */
export const criticFlags = (frames: string[]): PlayStepInput =>
  step({
    id: 'red-flags',
    text: 'Work through the red-flag checklist, one flag at a time. For each: place a Risk card titled "RFxx raised: ..." with the evidence and links to the cards it rests on, or an Insight card titled "RFxx cleared: ..." that cites the source card(s) that clear it and the checklist card (an insight needs at least two cited cards). A flag with no evidence either way becomes a Question card. You cannot tick the checklist: the user does.',
    tools: ['place_card', 'add_link', 'read_source', 'query_dataset'],
    frames,
  });

export const criticReport = step({
  id: 'report',
  text: 'Report progress per frame; send_message to orb when the checklist is complete, naming which flags were raised.',
  tools: ['report_progress', 'send_message'],
});
