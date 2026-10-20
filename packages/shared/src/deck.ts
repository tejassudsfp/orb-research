/**
 * Deck mode contracts (docs/phase6/PLAN.md P6.17): the slides of a canvas, as the research document's sibling.
 *
 * - **`compose_slides`** (Orb's tool): `{slides: [{slideId, layout, title, subtitle?, bullets?, visualCardId?, caption?,
 *   notes?, cardIds[]}]}`. Citations are structural, as in `compose_section`: every slide except a title or section
 *   divider cites at least one card of the compose scope, and a slide's visual must be a card of the scope too. A
 *   slide id that exists is replaced in place; a new one is appended.
 * - **Storage** (`deck/` of the canvas folder, written only by the canvas service): `deck.json` (the deck, read back by
 *   the app) and `instructions.json` (the saved format, scope and instructions, reused on regenerate).
 * - **Slide view** (`deck.get`, `deck.save`, `deck.regenerateSlide`): reorder, edit text, delete, add a slide of your
 *   own (exempt from the citation rule); regenerate one slide through Orb.
 * - **Exports**: `.pptx` (`deck.exportPptx`, built by the canvas service with pptxgenjs from the deck and the cards) and
 *   PDF slides (the `/print/deck` route, printed with `printToPDF`). Both add a Sources slide that lists every cited
 *   card, and put each slide's citations into the speaker notes (pptx) or the page footer (PDF).
 * - **Formats**: a template names the deck format (`deckFormatFor`): the VC investment-committee deck is about 12
 *   slides; every other template uses the standard format.
 */
import { z } from 'zod';
import { PrintScope } from './print.js';
import type { Card } from './board.js';
import type { BoardState } from './fold.js';
import { cardTitle } from './cards.js';
import { PortCardRef } from './port.js';
import { FINANCE_DECK_BY_TEMPLATE, FINANCE_DECK_FORMATS } from './deckFinance.js';
import { BUSINESS_DECK_FORMATS } from './templates/decks-business.js';
import { RESEARCH_DECK_FORMATS } from './deckFormats.research.js';

export const DECK_DIR = 'deck';
export const DECK_FILE = 'deck.json';
export const DECK_INSTRUCTIONS_FILE = 'instructions.json';

export const DECK_LIMITS = {
  slides: 40,
  title: 120,
  subtitle: 200,
  bullets: 8,
  bullet: 300,
  caption: 240,
  notes: 2000,
  cardIdsPerSlide: 20,
  instructions: 2000,
  /** Slides one `compose_slides` call may carry. */
  perCall: 40,
} as const;

/**
 * What a slide looks like. `title` and `section` are covers and dividers (no citation needed); `bullets` is a title and
 * up to 8 bullets; `visual` shows one card (a chart, table, image, design snapshot, metric, matrix…) with a caption and
 * up to 4 bullets; `two-column` is bullets beside a visual; `quote` is one quote with its attribution.
 */
export const SLIDE_LAYOUTS = ['title', 'section', 'bullets', 'visual', 'two-column', 'quote'] as const;
export const SlideLayout = z.enum(SLIDE_LAYOUTS);
export type SlideLayout = z.infer<typeof SlideLayout>;

/** Layouts that need no citation. */
export const UNCITED_LAYOUTS: readonly SlideLayout[] = ['title', 'section'];

export const SlideId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, 'a slide id is a lowercase slug');
export type SlideId = z.infer<typeof SlideId>;

export const Slide = z.strictObject({
  id: SlideId,
  layout: SlideLayout,
  title: z.string().min(1).max(DECK_LIMITS.title),
  subtitle: z.string().max(DECK_LIMITS.subtitle).optional(),
  bullets: z.array(z.string().min(1).max(DECK_LIMITS.bullet)).max(DECK_LIMITS.bullets),
  /** The card shown on the slide (visual, two-column and quote layouts). */
  visual: z.strictObject({ cardId: PortCardRef, caption: z.string().max(DECK_LIMITS.caption) }).optional(),
  /** Speaker notes the model wrote. The citations are added to them on export. */
  notes: z.string().max(DECK_LIMITS.notes).optional(),
  /** Every card the slide is based on (the visual's card is always among them). Empty only for a user slide or a cover. */
  cardIds: z.array(PortCardRef).max(DECK_LIMITS.cardIdsPerSlide),
  /** Written by the user in the slide view: exempt from the citation rule. */
  userAuthored: z.literal(true).optional(),
  /** Orb's slide, edited by the user (it keeps its citations). */
  edited: z.literal(true).optional(),
  composedAt: z.number().int().nonnegative(),
  model: z.string().max(200).optional(),
});
export type Slide = z.infer<typeof Slide>;

export const Deck = z.strictObject({
  v: z.literal(1),
  /** Bumped on every write; `deck.save` must name the version it edited. */
  version: z.number().int().nonnegative(),
  title: z.string().max(200),
  scope: PrintScope,
  /** The deck format id (`standard`, `vc-ic`…). */
  format: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/),
  instructions: z.string().max(DECK_LIMITS.instructions),
  slides: z.array(Slide).max(DECK_LIMITS.slides),
  composedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Deck = z.infer<typeof Deck>;

export const DeckInstructions = z.strictObject({
  format: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/),
  instructions: z.string().max(DECK_LIMITS.instructions),
  scope: PrintScope,
  savedAt: z.number().int().nonnegative(),
});
export type DeckInstructions = z.infer<typeof DeckInstructions>;

// ---- compose_slides (the tool's arguments) ----

export const ComposeSlide = z.strictObject({
  slideId: SlideId,
  layout: SlideLayout,
  title: z.string().trim().min(1, 'a slide needs a title').max(DECK_LIMITS.title),
  subtitle: z.string().trim().max(DECK_LIMITS.subtitle).optional(),
  bullets: z.array(z.string().trim().min(1).max(DECK_LIMITS.bullet)).max(DECK_LIMITS.bullets).optional(),
  visualCardId: z.string().max(80).optional(),
  caption: z.string().trim().max(DECK_LIMITS.caption).optional(),
  notes: z.string().trim().max(DECK_LIMITS.notes).optional(),
  cardIds: z.array(z.string().max(80)).max(DECK_LIMITS.cardIdsPerSlide),
});
export type ComposeSlide = z.infer<typeof ComposeSlide>;

export const ComposeSlidesArgs = z.strictObject({
  /** Replace a complete deck in one validated call rather than retaining old slide ids. */
  replaceAll: z.boolean().optional(),
  slides: z
    .array(ComposeSlide)
    .min(1, 'compose_slides needs at least one slide')
    .max(DECK_LIMITS.perCall),
});
export type ComposeSlidesArgs = z.infer<typeof ComposeSlidesArgs>;

export const ComposeSlidesResult = z.strictObject({
  slides: z.number().int().nonnegative(),
  /** Slides in the deck now. */
  total: z.number().int().nonnegative(),
  citations: z.number().int().nonnegative(),
});
export type ComposeSlidesResult = z.infer<typeof ComposeSlidesResult>;

// ---- Wire ----

/** `deck.compose(canvasId, {scope, format, instructions, continueUnread})`. */
export const DeckComposeArgs = z.strictObject({
  scope: PrintScope.default('all'),
  /** Empty: the canvas's template decides (`deckFormatFor`). */
  format: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,40}$/)
    .optional(),
  instructions: z.string().max(DECK_LIMITS.instructions).default(''),
  continueUnread: z.boolean().default(false),
});
export type DeckComposeArgs = z.infer<typeof DeckComposeArgs>;
export type DeckComposeInput = z.input<typeof DeckComposeArgs>;

/** One item of the `deck.compose` stream. */
export const DeckProgress = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('unread'),
    cards: z
      .array(z.strictObject({ id: PortCardRef, title: z.string().max(400), frameId: z.string().nullable() }))
      .max(500),
  }),
  z.strictObject({
    type: z.literal('started'),
    cards: z.number().int().nonnegative(),
    format: z.string(),
  }),
  z.strictObject({
    type: z.literal('slide'),
    slideId: SlideId,
    title: z.string(),
    /** 1-based position in the deck. */
    position: z.number().int().positive(),
  }),
  z.strictObject({ type: z.literal('rejected'), message: z.string().max(500) }),
  z.strictObject({
    type: z.literal('done'),
    slides: z.number().int().nonnegative(),
    version: z.number().int().nonnegative(),
  }),
  z.strictObject({ type: z.literal('failed'), message: z.string().max(500) }),
]);
export type DeckProgress = z.infer<typeof DeckProgress>;

export const DeckGetResult = z.strictObject({
  deck: Deck.nullable(),
  instructions: DeckInstructions.nullable(),
});
export type DeckGetResult = z.infer<typeof DeckGetResult>;

export const DeckRegenerateArgs = z.strictObject({
  slideId: SlideId,
  /** What to change ("shorter", "lead with the chart"); empty: write it afresh. */
  instruction: z.string().max(500).default(''),
});
export type DeckRegenerateArgs = z.infer<typeof DeckRegenerateArgs>;
export type DeckRegenerateInput = z.input<typeof DeckRegenerateArgs>;

export const DeckRegenerateResult = z.strictObject({ deck: Deck });
export type DeckRegenerateResult = z.infer<typeof DeckRegenerateResult>;

/**
 * `deck.save`: the user's edits of the slide view, as the full slide list in the new order. A slide named by `id` keeps
 * its citations and visual whatever the client sends; a slide without an `id` is a new slide of the user's; a slide
 * left out is deleted.
 */
export const DeckSaveArgs = z.strictObject({
  version: z.number().int().nonnegative(),
  slides: z
    .array(
      z.strictObject({
        id: SlideId.optional(),
        layout: SlideLayout.optional(),
        title: z.string().trim().min(1).max(DECK_LIMITS.title),
        subtitle: z.string().trim().max(DECK_LIMITS.subtitle).optional(),
        bullets: z.array(z.string().trim().min(1).max(DECK_LIMITS.bullet)).max(DECK_LIMITS.bullets),
        notes: z.string().trim().max(DECK_LIMITS.notes).optional(),
      }),
    )
    .max(DECK_LIMITS.slides),
});
export type DeckSaveArgs = z.infer<typeof DeckSaveArgs>;

export const DeckSaveResult = z.strictObject({ deck: Deck });
export type DeckSaveResult = z.infer<typeof DeckSaveResult>;

/** `deck.exportPptx`: the .pptx written to `exports/`. */
export const DeckExportResult = z.strictObject({
  path: z.string().min(1).max(300),
  /** Absolute path on this Mac (for Reveal in Finder). */
  file: z.string().min(1).max(4096),
  size: z.number().int().nonnegative(),
  /** Slides in the file, the Sources slide included. */
  slides: z.number().int().nonnegative(),
  /** Native charts and tables in the file. */
  charts: z.number().int().nonnegative(),
  tables: z.number().int().nonnegative(),
  images: z.number().int().nonnegative(),
});
export type DeckExportResult = z.infer<typeof DeckExportResult>;

// ---- Shared helpers (UI, storage, export) ----

export const DECK_COMPOSE_PREFIX = 'Compose the slides';
export const DECK_REGENERATE_PREFIX = 'Regenerate one slide';

/** The id of the Sources slide that exports add after the deck. */
export const SOURCES_SLIDE_ID = 'sources';

/** Distinct cited cards, numbered in order of first citation across the slides (the Sources slide uses these). */
export function deckCitationNumbers(deck: Pick<Deck, 'slides'>): Map<string, number> {
  const out = new Map<string, number>();
  for (const slide of deck.slides) for (const id of slide.cardIds) if (!out.has(id)) out.set(id, out.size + 1);
  return out;
}

/** The speaker notes of a slide on export: the model's notes, then "Sources: [n] title (card id)". */
export function slideNotesText(
  slide: Slide,
  numbers: ReadonlyMap<string, number>,
  cardOf: (id: string) => Card | undefined,
): string {
  const parts: string[] = [];
  if (slide.notes?.trim()) parts.push(slide.notes.trim());
  if (slide.cardIds.length > 0) {
    const refs = slide.cardIds.map((id) => {
      const card = cardOf(id);
      return `[${numbers.get(id) ?? '?'}] ${card ? cardTitle(card) : 'a card no longer on the board'} (card ${id})`;
    });
    parts.push(`Sources: ${refs.join('; ')}`);
  } else if (slide.userAuthored) {
    parts.push('Written by the presenter; no sources.');
  }
  return parts.join('\n\n');
}

// ---- Deck formats (a template names its deck) ----

export type DeckFormatSlide = {
  id: SlideId;
  layout: SlideLayout;
  title: string;
  /** What the slide must say and which cards it draws on. */
  brief: string;
};

export type DeckFormat = {
  id: string;
  label: string;
  /** The slides in order. A format with `perFrame` expands one slide per frame of the scope after the fixed ones. */
  slides: readonly DeckFormatSlide[];
  /** Standard format: one slide per frame, between the opening and the closing slides. */
  perFrame?: boolean;
  /** Length guidance for the model. */
  length: string;
  /** Template ids that use this format (`deckFormatFor`). */
  templates?: readonly string[];
};

export const STANDARD_DECK_FORMAT: DeckFormat = {
  id: 'standard',
  label: 'Standard deck',
  perFrame: true,
  length: 'about 8 to 14 slides',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'The deck title and a one-line subtitle.' },
    {
      id: 'summary',
      layout: 'bullets',
      title: 'Summary',
      brief: 'The answer in 3 to 5 bullets, each backed by cards.',
    },
    // one slide per frame goes here
    {
      id: 'open-questions',
      layout: 'bullets',
      title: 'Open questions and next steps',
      brief: 'What is still open (question and risk cards) and what to do next.',
    },
  ],
};

/** The VC investment-committee deck (docs/phase6/vc-dd-template.md, Output): about 12 slides. */
export const VC_IC_DECK_FORMAT: DeckFormat = {
  id: 'vc-ic',
  label: 'Investment committee deck',
  length: '12 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'Company name, round, and "Investment committee".' },
    {
      id: 'recommendation',
      layout: 'bullets',
      title: 'Recommendation',
      brief: 'The decision, the score, the top 3 reasons and the top 3 risks. Cite the decision, rubric and risk cards.',
    },
    {
      id: 'snapshot',
      layout: 'visual',
      title: 'Company snapshot',
      brief: 'The snapshot table or metric cards: founded, HQ, stage, raised, valuation, headcount.',
    },
    { id: 'team', layout: 'bullets', title: 'Team', brief: 'Founders and key hires with what makes them credible.' },
    {
      id: 'problem-product',
      layout: 'two-column',
      title: 'Problem and product',
      brief: 'The problem, the product, and how it works (a diagram if there is one).',
    },
    {
      id: 'market',
      layout: 'visual',
      title: 'Market',
      brief: 'Market size and growth; show the market chart.',
    },
    {
      id: 'traction',
      layout: 'visual',
      title: 'Traction and metrics',
      brief: 'The KPI chart or table; mark every number claimed or verified.',
    },
    {
      id: 'customers',
      layout: 'bullets',
      title: 'Customers and signals',
      brief: 'Named customers, reviews, hiring, traffic and other outside signals.',
    },
    {
      id: 'competition',
      layout: 'visual',
      title: 'Competition',
      brief: 'The competitor matrix or 2x2 and where the company wins and loses.',
    },
    {
      id: 'business-model',
      layout: 'bullets',
      title: 'Business model and go-to-market',
      brief: 'How it makes money, pricing, channels and unit economics.',
    },
    {
      id: 'thesis-risks',
      layout: 'two-column',
      title: 'Thesis, risks and mitigants',
      brief: 'Bull and bear case, the key hypotheses and the red-flag outcomes with mitigants.',
    },
    {
      id: 'scorecard',
      layout: 'visual',
      title: 'Scorecard',
      brief: 'The rubric table with each score and its evidence.',
    },
    {
      id: 'next-steps',
      layout: 'bullets',
      title: 'Open questions and next steps',
      brief: 'The founder-call questions and the proposed next step (pass, track, meeting, term sheet).',
    },
  ],
};

export const DECK_FORMATS: readonly DeckFormat[] = [
  STANDARD_DECK_FORMAT,
  VC_IC_DECK_FORMAT,
  ...FINANCE_DECK_FORMATS,
  ...BUSINESS_DECK_FORMATS,
  // P6.15: the research and knowledge templates.
  ...RESEARCH_DECK_FORMATS.map((r) => r.format),
];

/**
 * The deck format a template uses. Template ids that name a deck format (the VC due-diligence template is `vc`,
 * `vc-dd` or `vc-diligence` once the engine v2 adds it) get it; every other template, and a canvas without one, gets the
 * standard format.
 */
export function deckFormatFor(templateId: string | undefined | null): DeckFormat {
  if (templateId && /^vc([-_]|$)/.test(templateId)) return VC_IC_DECK_FORMAT;
  // P6.12: the investing and finance templates name their own decks.
  const finance = templateId ? FINANCE_DECK_BY_TEMPLATE[templateId] : undefined;
  if (finance) return FINANCE_DECK_FORMATS.find((f) => f.id === finance) ?? STANDARD_DECK_FORMAT;
  const named = templateId ? DECK_FORMATS.find((f) => f.templates?.includes(templateId)) : undefined;
  if (named) return named;
  const research = RESEARCH_DECK_FORMATS.find((r) => templateId && r.templates.includes(templateId));
  if (research) return research.format;
  return STANDARD_DECK_FORMAT;
}

export const deckFormatById = (id: string | undefined): DeckFormat | undefined =>
  DECK_FORMATS.find((f) => f.id === id);

/** The cards a deck of `scope` may cite (the same as a research document). */
export { portScopeCards as deckScopeCards } from './port.js';

/** True when the board holds a card the deck cites that is no longer there. */
export const deckMissingCards = (deck: Pick<Deck, 'slides'>, board: BoardState): string[] => {
  const missing = new Set<string>();
  for (const s of deck.slides) for (const id of s.cardIds) if (!board.cards[id]) missing.add(id);
  return [...missing];
};
