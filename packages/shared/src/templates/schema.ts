/**
 * Template engine v2 (P6.11, docs/phase6/vc-dd-template.md): the schema every template is written in and validated by.
 *
 * A v1 template was a list of frames and a one-paragraph brief. A v2 template is a research playbook:
 *   - `inputs`      a typed intake form shown on Home when the chip is picked (required flags, placeholders, validation);
 *   - `frames`      numbered by position, each with a brief, owner agents, a target card mix and seed cards;
 *   - `databases`   empty databases with column schemas and views, placed in a frame by a `database` seed card;
 *   - `plan`        an ordered playbook per agent, injected into that agent's FIRST assignment (never its persona);
 *   - `rubric`      scored dimensions with weights and 1/3/5 anchors (Orb fills it with cited evidence);
 *   - `redFlags`    items Critic must explicitly clear or raise;
 *   - `output`      the Port memo (sections, order, citations) and a one-page summary, plus the deck format;
 *   - `tiers`       Quick / Standard / Deep: the Parallel and LLM spend each one allows (the cost guard);
 *   - `followUps`   suggested next prompts, shown as chips after the first pass.
 *
 * Pure and harness-free. The code that places frames, seeds and databases on a canvas is orb-canvas
 * (`templatePlan.ts`, `store.create`); the text injected into agents is `playbook.ts`.
 */
import { z } from 'zod';
import { AgentName, CardType, FrameColor } from '../board.js';
import { Filter, SortKey, ViewKind } from '../dataset.js';

/** Every template id (P6.12 to P6.16 add theirs here). */
export const TemplateId = z.enum([
  'topic',
  'company',
  'gtm',
  'ui',
  'stocks',
  'vc-dd',
  // P6.12: investing and finance. 'stocks' stays so older canvases open; new ones use 'public-equity'.
  'public-equity',
  'market-map',
  'portfolio-monitor',
  'ma-screen',
  'fund-dd',
  // P6.13: startup / product. `company`, `gtm` and `ui` keep their v1 ids (saved canvases name them) and are upgraded
  // to v2 specs; `ui` is the product teardown (UI research merged into it).
  'competitive-analysis',
  'customer-discovery',
  'pricing-research',
  'feature-prd',
  'fundraising-prep',
  // P6.14: business.
  'sales-account',
  'partnership',
  'vendor-selection',
  'market-entry',
  // P6.15: research and knowledge.
  'deep-dive',
  'literature-review',
  'policy-analysis',
  'tech-landscape',
  'trend-report',
  // P6.16: people and personal.
  'candidate',
  'event-prep',
  'personal-decision',
  'trip-planning',
  'investigation',
]);
export type TemplateId = z.infer<typeof TemplateId>;

export const DEPTHS = ['quick', 'standard', 'deep'] as const;
export const Depth = z.enum(DEPTHS);
export type Depth = z.infer<typeof Depth>;
export const DEFAULT_DEPTH: Depth = 'standard';
/** Tier order: a step with `minTier: 'standard'` runs in standard and deep. */
export const depthRank = (d: Depth): number => DEPTHS.indexOf(d);

// ---- intake form ----

export const FIELD_KINDS = [
  'text',
  'longtext',
  'url',
  'select',
  'people',
  'list',
  'sites',
  'materials',
  'depth',
] as const;

export const InputField = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
  label: z.string().min(1).max(80),
  kind: z.enum(FIELD_KINDS),
  required: z.boolean().default(false),
  placeholder: z.string().max(200).optional(),
  help: z.string().max(300).optional(),
  /** `select`: the choices (the first is not preselected; an empty answer is allowed unless `required`). */
  options: z.array(z.string().min(1).max(60)).max(20).optional(),
  /** `text`: free text with suggestions (a datalist). */
  suggestions: z.array(z.string().min(1).max(60)).max(30).optional(),
  /** `sites`: the domains the template can use when they are connected (Settings › Connected sites). */
  sites: z
    .array(z.strictObject({ domain: z.string().min(3).max(100), label: z.string().min(1).max(60) }))
    .max(12)
    .optional(),
  /** Fields with the same group sit on one row of the form. */
  group: z.string().max(30).optional(),
  maxLength: z.number().int().positive().max(4000).default(400),
});
export type InputField = z.infer<typeof InputField>;

/** What the intake form submits: a string per field, a list of strings for `sites` and `list`. Files are not here. */
export type IntakeAnswers = Record<string, string | string[]>;
export const IntakeAnswersSchema = z.record(
  z.string().max(40),
  z.union([z.string().max(4000), z.array(z.string().max(300)).max(30)]),
);

// ---- seeds, databases ----

/** Column types a template may use. The dataset engine has six; the rest map onto them (`columnTypeOf`). */
export const TEMPLATE_COLUMN_TYPES = [
  'text',
  'number',
  'currency',
  'date',
  'url',
  'enum',
  'person',
  'rating',
  'boolean',
] as const;
export const TemplateColumnType = z.enum(TEMPLATE_COLUMN_TYPES);
export type TemplateColumnType = z.infer<typeof TemplateColumnType>;

export const DatabaseColumnSpec = z.strictObject({
  name: z.string().trim().min(1).max(100),
  type: TemplateColumnType,
  options: z.array(z.string().min(1).max(100)).max(50).optional(),
  /** What belongs in the column (shown to agents). */
  note: z.string().max(200).optional(),
});
export type DatabaseColumnSpec = z.infer<typeof DatabaseColumnSpec>;

export const DatabaseViewSpec = z.strictObject({
  name: z.string().trim().min(1).max(60),
  kind: ViewKind,
  /** Column names. */
  group: z.string().max(100).optional(),
  sort: z.array(SortKey).max(3).optional(),
  filter: z.array(Filter).max(12).optional(),
  cover: z.string().max(100).optional(),
  hidden: z.array(z.string().max(100)).max(60).optional(),
});
export type DatabaseViewSpec = z.infer<typeof DatabaseViewSpec>;

export const DatabaseSpec = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
  name: z.string().trim().min(1).max(120),
  /** The frame (by id) its card sits in. */
  frame: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
  purpose: z.string().max(400),
  columns: z.array(DatabaseColumnSpec).min(1).max(40),
  /** The first view is the default. */
  views: z.array(DatabaseViewSpec).min(1).max(8),
  /** The column that identifies a row for `upsert_rows` `key`. */
  keyColumn: z.string().max(100).optional(),
  rows: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .max(50)
    .optional(),
});
export type DatabaseSpec = z.infer<typeof DatabaseSpec>;

/**
 * A card placed when the canvas is created. `data` may hold `{{field}}` / `{{field|fallback}}` tokens (filled from the
 * intake answers). A `database` or `chart` seed names its dataset in `db` (a key of `databases`).
 */
export const SeedCard = z.strictObject({
  type: CardType,
  data: z.record(z.string(), z.unknown()),
  why: z.string().max(140).optional(),
  db: z.string().max(40).optional(),
});
export type SeedCard = z.infer<typeof SeedCard>;

export const CardTarget = z.strictObject({
  type: CardType,
  min: z.number().int().positive().max(100),
  /** "per founder", "including 1 negative", "independent report". */
  note: z.string().max(120).optional(),
});
export type CardTarget = z.infer<typeof CardTarget>;

const FrameId = z.string().regex(/^[a-z][a-z0-9-]{0,30}$/);

export const FrameSpec = z.strictObject({
  id: FrameId,
  title: z.string().trim().min(1).max(80),
  color: FrameColor,
  /** The questions this frame must answer. */
  brief: z.string().min(20).max(1600),
  /** The agents that work in it ('orb' = Orb itself; the user may be a co-owner in the text of the brief). */
  owners: z.array(AgentName).min(1).max(4),
  /** What the frame should hold when the first pass is done. */
  targets: z.array(CardTarget).max(12),
  seeds: z.array(SeedCard).max(16),
  /** Extra free height (px) kept below the seeds: the frame the user drops materials into. */
  room: z.number().int().min(0).max(1200).default(0),
});
export type FrameSpec = z.infer<typeof FrameSpec>;

// ---- agent plan ----

export const PlayStep = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/),
  text: z.string().min(10).max(900),
  /** The tools this step uses: every one must be in the role's allow-list (checked by the tests). */
  tools: z.array(z.string().min(1).max(40)).max(10),
  /** The frames (by spec id) the step feeds. */
  frames: z.array(FrameId).max(12).default([]),
  /** The lowest depth tier that runs it. */
  minTier: Depth.default('quick'),
  /** Ask the user before spending more than this (US dollars). */
  askAboveUsd: z.number().positive().max(50).optional(),
});
export type PlayStep = z.infer<typeof PlayStep>;

export const AgentPlan = z.strictObject({
  orb: z.array(PlayStep).min(1),
  scout: z.array(PlayStep).min(1),
  critic: z.array(PlayStep).min(1),
  builder: z.array(PlayStep).min(1),
});
export type AgentPlan = z.infer<typeof AgentPlan>;

// ---- rubric, red flags ----

export const RubricDimension = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
  name: z.string().min(1).max(60),
  /** Percent; the weights add up to 100. */
  weight: z.number().int().min(1).max(100),
  /** What a 1, a 3 and a 5 look like. */
  anchors: z.strictObject({
    1: z.string().min(5).max(200),
    3: z.string().min(5).max(200),
    5: z.string().min(5).max(200),
  }),
  /** The frame that holds the evidence. */
  frame: FrameId,
});
export type RubricDimension = z.infer<typeof RubricDimension>;

export const RedFlag = z.strictObject({
  id: z.string().regex(/^RF\d{2}$/),
  text: z.string().min(10).max(300),
  /** How Critic checks it (shown to Critic). */
  check: z.string().min(10).max(400),
});
export type RedFlag = z.infer<typeof RedFlag>;

// ---- output ----

export const MemoSection = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
  title: z.string().min(1).max(80),
  /** The frames whose cards the section draws on. */
  frames: z.array(FrameId).max(12),
  /** What the section holds, in a sentence (the compose_section instruction). */
  guidance: z.string().min(10).max(400),
  /** Soft word limit; omitted: as long as it needs. */
  words: z.number().int().positive().max(2000).optional(),
});
export type MemoSection = z.infer<typeof MemoSection>;

export const OutputSpec = z.strictObject({
  memoTitle: z.string().min(1).max(100),
  /** The rule every memo paragraph follows. */
  citationRule: z.string().min(10).max(400),
  sections: z.array(MemoSection).min(3).max(30),
  appendix: z.string().max(100),
  onePager: z.strictObject({
    title: z.string().max(100),
    includes: z.array(z.string().max(100)).min(2).max(12),
  }),
  /** The deck format (`deckFormatFor`): `vc-ic` is the investment-committee deck. */
  deckFormat: z.string().max(40),
  /** P6.13: the slides of this template's deck, in order (compose_slides); omitted: the format's own outline. */
  deck: z
    .strictObject({
      title: z.string().min(1).max(100),
      slides: z
        .array(z.strictObject({ title: z.string().min(1).max(80), brief: z.string().min(10).max(300) }))
        .min(4)
        .max(24),
    })
    .optional(),
});
export type OutputSpec = z.infer<typeof OutputSpec>;

// ---- tiers (the cost guard) ----

export const TierSpec = z.strictObject({
  label: z.string().min(1).max(40),
  /** "about 15 minutes". */
  time: z.string().max(60),
  /** "low cost". */
  cost: z.string().max(60),
  summary: z.string().min(10).max(400),
  /** The Parallel tools the tier may call (checked in the tool: a refused call tells the agent why). */
  parallelTools: z.array(z.string().min(1).max(40)).max(20),
  /** Task processors `deep_research` may use. */
  processors: z.array(z.string().min(1).max(20)).max(10),
  /** Most deep-research runs for the whole canvas (a guide in the assignment text). */
  deepRuns: z.number().int().nonnegative().max(50),
  /** The ceiling of one run before Orb asks (US dollars). */
  askAboveUsd: z.number().positive().max(50),
  /** Most cards per frame the first pass places; null: no limit. */
  cardsPerFrame: z.number().int().positive().max(200).nullable(),
  memo: z.enum(['summary', 'full']),
});
export type TierSpec = z.infer<typeof TierSpec>;

export const FollowUp = z.strictObject({
  label: z.string().min(1).max(80),
  /** The message sent to Orb. `{{field}}` tokens are filled from the intake; `[something]` is left for the user. */
  prompt: z.string().min(5).max(600),
});
export type FollowUp = z.infer<typeof FollowUp>;

// ---- the template ----

export const SignedInUse = z.strictObject({
  domain: z.string().min(3).max(100),
  label: z.string().min(1).max(60),
  use: z.string().min(5).max(300),
});

export const TemplateSpecV2 = z.strictObject({
  id: TemplateId,
  /** Chip label on Home. */
  label: z.string().min(1).max(40),
  dot: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  /** Ask-box placeholder while the chip is selected. */
  placeholder: z.string().min(1).max(120),
  /** One paragraph: what the agents are asked to do (kept in canvas.json as `brief`). */
  brief: z.string().min(40).max(1200),
  /** The title of the canvas made from an intake, with `{{field}}` tokens. */
  titleFrom: z.string().min(1).max(120),
  inputs: z.array(InputField).min(1).max(30),
  frames: z.array(FrameSpec).min(3).max(16),
  databases: z.array(DatabaseSpec).max(20),
  plan: AgentPlan,
  rubric: z.array(RubricDimension).max(12),
  redFlags: z.array(RedFlag).max(30),
  output: OutputSpec,
  tiers: z.strictObject({ quick: TierSpec, standard: TierSpec, deep: TierSpec }),
  followUps: z.array(FollowUp).min(3).max(10),
  /** Sites a signed-in fetch is useful on (shown in the form; Scout only uses the ones the user ticked). */
  signedIn: z.array(SignedInUse).max(10),
  /** A watch Orb may set up when the user asks (monitors cost money on every check). */
  monitor: z.strictObject({ query: z.string().min(5).max(400), why: z.string().max(200) }).optional(),
});
export type TemplateSpecV2 = z.infer<typeof TemplateSpecV2>;
/** A spec as written in code (defaults not yet applied); `TemplateSpecV2.parse` fills them. */
export type TemplateSpecInput = z.input<typeof TemplateSpecV2>;
export type PlayStepInput = z.input<typeof PlayStep>;

/** A starting frame of a template (v1: all there is; v2: the frame spec carries the rest). */
export type TemplateFrame = { title: string; color: FrameColor };

/** One entry of the Home chips. v2 templates carry their whole spec in `spec`. */
export type Template = {
  id: TemplateId;
  label: string;
  dot: string;
  placeholder: string;
  brief: string;
  frames: readonly TemplateFrame[];
  spec?: TemplateSpecV2;
};

// ---- helpers ----

/** Replace `{{id}}` and `{{id|fallback}}` with the intake's answers (arrays joined with ", "). */
export function fillTokens(text: string, answers: IntakeAnswers): string {
  return text.replace(/\{\{([a-z][a-z0-9_]*)(?:\|([^}]*))?\}\}/g, (_m, id: string, fallback?: string) => {
    const v = answers[id];
    const s = Array.isArray(v) ? v.join(', ') : (v ?? '');
    return s.trim() ? s.trim() : (fallback ?? '');
  });
}

/** `fillTokens` through a JSON-like value (strings anywhere inside, deep). */
export function fillDeep<T>(value: T, answers: IntakeAnswers): T {
  if (typeof value === 'string') return fillTokens(value, answers) as T;
  if (Array.isArray(value)) return value.map((v) => fillDeep(v, answers)) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillDeep(v, answers)])) as T;
  return value;
}

/** A URL as a user types it: `acme.com` becomes `https://acme.com`. Undefined when it is not a web address. */
export function normalizeUrl(raw: string): string | undefined {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    if (!u.hostname.includes('.')) return undefined;
    const out = u.toString();
    return u.pathname === '/' && !u.search && !u.hash ? out.slice(0, -1) : out;
  } catch {
    return undefined;
  }
}

export type IntakeResult = {
  ok: boolean;
  errors: Record<string, string>;
  answers: IntakeAnswers;
  depth: Depth;
};

/**
 * Validate and clean the intake form's answers: required fields are present, urls are web addresses, selects are one
 * of the options, lengths are within `maxLength`. Unknown fields are dropped. Empty optional fields are left out.
 */
export function validateIntake(inputs: readonly InputField[], raw: IntakeAnswers): IntakeResult {
  const errors: Record<string, string> = {};
  const answers: IntakeAnswers = {};
  let depth: Depth = DEFAULT_DEPTH;
  for (const f of inputs) {
    if (f.kind === 'materials') continue;
    const v = raw[f.id];
    if (f.kind === 'sites' || f.kind === 'list') {
      const list = (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\n]/) : [])
        .map((x) => x.trim())
        .filter(Boolean);
      if (f.required && list.length === 0) errors[f.id] = `${f.label} is required`;
      if (list.length > 0) answers[f.id] = list.slice(0, 30);
      continue;
    }
    const text = (Array.isArray(v) ? v.join(', ') : (v ?? '')).trim();
    if (f.kind === 'depth') {
      if (text && !Depth.safeParse(text).success) errors[f.id] = `${f.label} must be quick, standard or deep`;
      else if (text) depth = text as Depth;
      answers[f.id] = text || DEFAULT_DEPTH;
      continue;
    }
    if (!text) {
      if (f.required) errors[f.id] = `${f.label} is required`;
      continue;
    }
    if (text.length > f.maxLength) {
      errors[f.id] = `${f.label} is longer than ${f.maxLength} characters`;
      continue;
    }
    if (f.kind === 'url') {
      const url = normalizeUrl(text);
      if (!url) errors[f.id] = `${f.label} must be a web address like https://example.com`;
      else answers[f.id] = url;
    } else if (f.kind === 'select') {
      if (f.options && !f.options.includes(text))
        errors[f.id] = `${f.label} must be one of ${f.options.join(', ')}`;
      else answers[f.id] = text;
    } else if (f.kind === 'people') {
      // "Name, https://linkedin.com/in/name" per line; a link, when given, must be a web address.
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const bad = lines.find((l) => {
        const m = /\bhttps?:\/\/\S+|\b(?:www\.|linkedin\.com)\S+/i.exec(l);
        return m ? normalizeUrl(m[0]) === undefined : false;
      });
      if (bad) errors[f.id] = `${f.label}: "${bad.slice(0, 60)}" has a link that is not a web address`;
      else answers[f.id] = lines.join('\n');
    } else answers[f.id] = text;
  }
  return { ok: Object.keys(errors).length === 0, errors, answers, depth };
}

/** The canvas title of an intake ("Acme: VC due diligence"). */
export function intakeTitle(spec: Pick<TemplateSpecV2, 'titleFrom'>, answers: IntakeAnswers): string {
  return fillTokens(spec.titleFrom, answers).replace(/\s+/g, ' ').trim().slice(0, 80);
}
