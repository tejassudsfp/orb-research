/**
 * Port research document contracts (BUILD_PLAN P4.5, PRD Port › Mode 2, Research document).
 *
 * - **`compose_section`** (Orb's tool): `{sectionId, heading, paragraphs: [{text, cardIds[]}], figures: [{cardId,
 *   caption}]}`. Citations are structural: every paragraph carries a non-empty `cardIds` array, and every id must be
 *   a card inside the compose scope. The tool rejects anything else (orb-port `validateSection`).
 * - **Storage** (`port/` of the canvas folder, written only by the canvas service): `doc.md` (the readable Markdown,
 *   numbered citations and a reference list), `citations.json` (the structured sidecar: every section and paragraph
 *   with its `cardIds`, read back by the app) and `instructions.json` (the saved instructions and scope, reused on
 *   regenerate).
 * - **Reading view** (`port.get`, `port.saveDoc`, `port.regenerateSection`): inline edits keep a paragraph's
 *   citations; a paragraph the user writes is `userAuthored` and exempt from the citation rule.
 * - **Compose** (`port.compose`): a stream of progress while Orb writes the sections.
 */
import { z } from 'zod';
import { PrintScope } from './print.js';
import type { BoardState } from './fold.js';
import type { Card } from './board.js';
import { QuoteData, SourceData, cardTitle, readCardData } from './cards.js';

export const PORT_DIR = 'port';
export const PORT_DOC_FILE = 'doc.md';
export const PORT_CITATIONS_FILE = 'citations.json';
export const PORT_INSTRUCTIONS_FILE = 'instructions.json';
export const PortFormat = z.enum(['report', 'custom']);
export type PortFormat = z.infer<typeof PortFormat>;

/** Limits of one section (the tool and the reading view share them). */
export const PORT_LIMITS = {
  sections: 40,
  heading: 120,
  paragraphs: 30,
  paragraphText: 4000,
  cardIdsPerParagraph: 20,
  figures: 12,
  caption: 240,
  instructions: 2000,
} as const;

/** A section id: a short slug the model chooses (`summary`, `market`, `open-questions`). */
export const SectionId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, 'a section id is a lowercase slug');
export type SectionId = z.infer<typeof SectionId>;

export const PortCardRef = z.string().regex(/^c_[A-Za-z0-9_-]{1,64}$/, 'a card id looks like c_…');
export const ParagraphId = z.string().regex(/^p_[A-Za-z0-9]{1,40}$/);

export const PortParagraph = z.strictObject({
  id: ParagraphId,
  text: z.string().min(1).max(PORT_LIMITS.paragraphText),
  /** The cards this paragraph cites. Never empty unless `userAuthored`. */
  cardIds: z.array(PortCardRef).max(PORT_LIMITS.cardIdsPerParagraph),
  /** Written by the user in the reading view: exempt from the citation rule. */
  userAuthored: z.literal(true).optional(),
  /** Orb's paragraph, edited by the user (it keeps its citations). */
  edited: z.literal(true).optional(),
});
export type PortParagraph = z.infer<typeof PortParagraph>;

export const PortFigure = z.strictObject({
  cardId: PortCardRef,
  caption: z.string().max(PORT_LIMITS.caption),
});
export type PortFigure = z.infer<typeof PortFigure>;

export const PortSection = z.strictObject({
  id: SectionId,
  heading: z.string().min(1).max(PORT_LIMITS.heading),
  paragraphs: z.array(PortParagraph).max(PORT_LIMITS.paragraphs * 4),
  figures: z.array(PortFigure).max(PORT_LIMITS.figures),
  composedAt: z.number().int().nonnegative(),
  /** The model route that wrote it (`provider/model`). */
  model: z.string().max(200).optional(),
});
export type PortSection = z.infer<typeof PortSection>;

/** `citations.json`: the research document, structured. */
export const PortDoc = z.strictObject({
  v: z.literal(1),
  /** Bumped on every write; `port.saveDoc` must name the version it edited. */
  version: z.number().int().nonnegative(),
  title: z.string().max(200),
  scope: PrintScope,
  instructions: z.string().max(PORT_LIMITS.instructions),
  /** Missing in legacy documents. New report composition explicitly records its writing contract. */
  format: PortFormat.optional(),
  sections: z.array(PortSection).max(PORT_LIMITS.sections),
  composedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type PortDoc = z.infer<typeof PortDoc>;

/** `instructions.json`: what the user asked for, reused on regenerate. */
export const PortInstructions = z.strictObject({
  instructions: z.string().max(PORT_LIMITS.instructions),
  format: PortFormat.optional(),
  scope: PrintScope,
  savedAt: z.number().int().nonnegative(),
});
export type PortInstructions = z.infer<typeof PortInstructions>;

// ---- compose_section (the tool's arguments) ----

export const ComposeSectionArgs = z.strictObject({
  format: PortFormat.optional(),
  sectionId: SectionId,
  heading: z.string().trim().min(1, 'a section needs a heading').max(PORT_LIMITS.heading),
  paragraphs: z
    .array(
      z.strictObject({
        text: z.string().trim().min(1, 'a paragraph needs text').max(PORT_LIMITS.paragraphText),
        cardIds: z.array(z.string().max(80)).max(PORT_LIMITS.cardIdsPerParagraph),
      }),
    )
    .min(1, 'a section needs at least one paragraph')
    .max(PORT_LIMITS.paragraphs),
  figures: z
    .array(
      z.strictObject({ cardId: z.string().max(80), caption: z.string().trim().max(PORT_LIMITS.caption) }),
    )
    .max(PORT_LIMITS.figures)
    .optional(),
});
export type ComposeSectionArgs = z.infer<typeof ComposeSectionArgs>;

export const ComposeSectionResult = z.strictObject({
  sectionId: SectionId,
  /** 1-based position of the section in the document. */
  position: z.number().int().positive(),
  paragraphs: z.number().int().nonnegative(),
  figures: z.number().int().nonnegative(),
  citations: z.number().int().nonnegative(),
});
export type ComposeSectionResult = z.infer<typeof ComposeSectionResult>;

// ---- Wire ----

/** `port.compose(canvasId, {mode, scope, instructions, continueUnread})`. */
export const PortComposeArgs = z.strictObject({
  /** The research document (a Canvas PDF needs no composing; it prints through the P4.4 pipeline). */
  mode: z.literal('doc').default('doc'),
  format: PortFormat.default('report'),
  scope: PrintScope.default('all'),
  /** Empty: the standard format. */
  instructions: z.string().max(PORT_LIMITS.instructions).default(''),
  /** The user saw the unread Must read warning and chose Continue anyway. */
  continueUnread: z.boolean().default(false),
});
export type PortComposeArgs = z.infer<typeof PortComposeArgs>;
export type PortComposeInput = z.input<typeof PortComposeArgs>;

export const UnreadCard = z.strictObject({
  id: PortCardRef,
  title: z.string().max(400),
  frameId: z.string().nullable(),
});
export type UnreadCard = z.infer<typeof UnreadCard>;

/** One item of the `port.compose` stream. */
export const PortProgress = z.discriminatedUnion('type', [
  /** Must read cards in scope are unopened and the request did not say Continue anyway: nothing was composed. */
  z.strictObject({ type: z.literal('unread'), cards: z.array(UnreadCard).max(500) }),
  z.strictObject({
    type: z.literal('started'),
    cards: z.number().int().nonnegative(),
    frames: z.number().int().nonnegative(),
    standard: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('section'),
    sectionId: SectionId,
    heading: z.string(),
    position: z.number().int().positive(),
    paragraphs: z.number().int().nonnegative(),
    figures: z.number().int().nonnegative(),
  }),
  /** A compose_section call was refused (Orb gets the reason and usually fixes it). */
  z.strictObject({ type: z.literal('rejected'), message: z.string().max(500) }),
  z.strictObject({
    type: z.literal('done'),
    sections: z.number().int().nonnegative(),
    version: z.number().int().nonnegative(),
  }),
  z.strictObject({ type: z.literal('failed'), message: z.string().max(500) }),
]);
export type PortProgress = z.infer<typeof PortProgress>;

export const PortGetResult = z.strictObject({
  doc: PortDoc.nullable(),
  instructions: PortInstructions.nullable(),
});
export type PortGetResult = z.infer<typeof PortGetResult>;

export const PortRegenerateArgs = z.strictObject({ sectionId: SectionId });
export type PortRegenerateArgs = z.infer<typeof PortRegenerateArgs>;

export const PortRegenerateResult = z.strictObject({ doc: PortDoc });
export type PortRegenerateResult = z.infer<typeof PortRegenerateResult>;

/** `port.saveDoc`: the user's edits of the reading view (headings and paragraph text; user paragraphs). */
export const PortSaveArgs = z.strictObject({
  /** The `version` the edits start from (a newer document refuses them: `orb/conflict`). */
  version: z.number().int().nonnegative(),
  sections: z
    .array(
      z.strictObject({
        id: SectionId,
        heading: z.string().trim().min(1).max(PORT_LIMITS.heading),
        paragraphs: z
          .array(
            z.strictObject({
              /** Absent: a new paragraph the user wrote. */
              id: ParagraphId.optional(),
              text: z.string().trim().min(1).max(PORT_LIMITS.paragraphText),
            }),
          )
          .max(PORT_LIMITS.paragraphs * 4),
      }),
    )
    .max(PORT_LIMITS.sections),
});
export type PortSaveArgs = z.infer<typeof PortSaveArgs>;

export const PortSaveResult = z.strictObject({ doc: PortDoc });
export type PortSaveResult = z.infer<typeof PortSaveResult>;

// ---- Shared helpers (UI and storage) ----

/** The first line of the user message `port.compose` sends Orb (the conversation panel shows only this line). */
export const PORT_COMPOSE_PREFIX = 'Compose the research document';
export const PORT_REGENERATE_PREFIX = 'Regenerate one section of the research document';

/** A card's URL, for a source or quote card. */
export function cardUrl(card: Card): string | undefined {
  if (card.type === 'source') return readCardData(SourceData, card.data)?.url;
  if (card.type === 'quote') return readCardData(QuoteData, card.data)?.url;
  return undefined;
}

/** The cards inside a compose scope: every card of the scope's frames (every card for `all`). */
export function portScopeCards(board: BoardState, scope: PrintScope): Card[] {
  const cards = Object.values(board.cards);
  if (scope === 'all') return cards;
  const frames = new Set(scope);
  return cards.filter((c) => c.frameId !== null && frames.has(c.frameId));
}

/** PRD Reading queue: Must read cards in scope the user has not opened yet. */
export function unreadMustRead(board: BoardState, scope: PrintScope): UnreadCard[] {
  return portScopeCards(board, scope)
    .filter((c) => c.badge === 'must' && !c.opened && !c.stackedInto)
    .map((c) => ({ id: c.id, title: cardTitle(c).slice(0, 400), frameId: c.frameId }));
}

export type Citation = { n: number; cardId: string };

/**
 * Citation numbers: every distinct cited card, numbered in order of its first citation in the document (paragraphs
 * of each section, in order). The reading view, the Markdown and the print all use these numbers.
 */
export function citationNumbers(doc: Pick<PortDoc, 'sections'>): Map<string, number> {
  const out = new Map<string, number>();
  for (const section of doc.sections)
    for (const p of section.paragraphs)
      for (const id of p.cardIds) if (!out.has(id)) out.set(id, out.size + 1);
  return out;
}
