/**
 * Cordis row `orb-port-tools` (`@orb/canvas/port`): Orb's `compose_section` tool (BUILD_PLAN P4.5, PRD Port ›
 * Research document). Like the board tools it sits in the `orb` preset's `plugins`, so only agents bound to the
 * preset see it, and only Orb's allow-list holds it (children never get it: their `toolFilter.allow`; the guard and
 * `requireTool` refuse it to anyone else).
 *
 * `compose_section({sectionId, heading, paragraphs: [{text, cardIds[]}], figures: [{cardId, caption}]})` writes one
 * section of the canvas's research document. Citations are structural: a paragraph without `cardIds`, or citing a
 * card outside the compose scope (or not on the board), is refused with a message saying what to fix, and nothing
 * is written. The section is persisted to `port/citations.json` + `port/doc.md` by the canvas service.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { DECK_LIMITS, PORT_LIMITS, SLIDE_LAYOUTS, type ComposeSectionResult, type ComposeSlidesResult } from '@orb/shared';
import { abortFirst, isCanvasError } from './errors.js';
import type { CanvasStore } from './store.js';
import { callerOf, requireTool, type BoardToolExec } from './tools.js';

export const name = 'orb-port-tools';
export const inject = ['tools', 'orbCanvas'];

/** Execute `compose_section` (exported for unit tests; the tool wraps it). */
export async function composeSection(
  store: CanvasStore,
  rawArgs: unknown,
  exec: BoardToolExec,
): Promise<ComposeSectionResult> {
  try {
    const { canvasId, role, actor } = await callerOf(store, exec);
    requireTool(role, 'compose_section');
    exec.signal.throwIfAborted();
    return await store.port.composeSection(canvasId, rawArgs, actor);
  } catch (err) {
    if (exec.signal.aborted) throw err;
    // Tool errors reach the model as `Error: <message>` text (HARNESS_NOTES §P3.1): keep them actionable.
    if (isCanvasError(err)) throw new Error(err.message, { cause: err });
    throw err;
  }
}

/** Execute `compose_slides` (exported for unit tests; the tool wraps it). P6.17. */
export async function composeSlides(
  store: CanvasStore,
  rawArgs: unknown,
  exec: BoardToolExec,
): Promise<ComposeSlidesResult> {
  try {
    const { canvasId, role, actor } = await callerOf(store, exec);
    requireTool(role, 'compose_slides');
    exec.signal.throwIfAborted();
    return await store.deck.composeSlides(canvasId, rawArgs, actor);
  } catch (err) {
    if (exec.signal.aborted) throw err;
    if (isCanvasError(err)) throw new Error(err.message, { cause: err });
    throw err;
  }
}

const text = (value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }];

export function apply(ctx: any) {
  const store = ctx.orbCanvas as CanvasStore;
  ctx.tools.register(
    abortFirst(
      defineTool({
        name: 'compose_section',
        description:
          'Write one section of the research document (only when asked to compose or regenerate it). Call it once ' +
          'per section, in reading order. Every paragraph must cite the cards it is based on: cardIds lists at least ' +
          'one card id from the cards in scope (a paragraph without citations, or citing any other card, is ' +
          'refused). Write only what those cards support. figures puts cards in the section as numbered figures, ' +
          'tables or quotes with a caption. Calling it again with the same sectionId replaces that section.',
        parameters: {
          format: {
            type: 'string',
            enum: ['report', 'custom'],
            description:
              'When starting a document directly from chat: report by default; custom only for a user-requested brief/memo/custom structure. A Publish Port job keeps the format the user selected.',
          },
          sectionId: {
            type: 'string',
            required: true,
            description:
              'Short lowercase slug, e.g. summary, market, open-questions. Same id = same section.',
          },
          heading: {
            type: 'string',
            required: true,
            description: `Section heading, ≤${PORT_LIMITS.heading} chars.`,
          },
          paragraphs: {
            type: 'array',
            required: true,
            description: `1 to ${PORT_LIMITS.paragraphs} paragraphs, each with the card ids it cites.`,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                text: {
                  type: 'string',
                  required: true,
                  description: 'Paragraph text (plain prose, no citations).',
                },
                cardIds: {
                  type: 'array',
                  required: true,
                  items: { type: 'string' },
                  description: 'Ids (c_…) of the cards in scope this paragraph is based on. Never empty.',
                },
              },
            },
          },
          figures: {
            type: 'array',
            description: `Up to ${PORT_LIMITS.figures} cards shown in this section as numbered figures.`,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                cardId: { type: 'string', required: true, description: 'Id of a card in scope.' },
                caption: { type: 'string', required: true, description: 'One-line caption.' },
              },
            },
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sectionId: { type: 'string', required: true, description: 'The section written.' },
              position: { type: 'integer', required: true, description: 'Its position in the document.' },
              paragraphs: { type: 'integer', required: true, description: 'Paragraphs written.' },
              figures: { type: 'integer', required: true, description: 'Figures placed.' },
              citations: { type: 'integer', required: true, description: 'Distinct cards cited.' },
            },
          },
          render: (_args: unknown, value: unknown) => text(value),
        },
        execute: (args: unknown, exec: BoardToolExec) => composeSection(store, args, exec),
      } as any),
    ),
  );

  ctx.tools.register(
    abortFirst(
      defineTool({
        name: 'compose_slides',
        description:
          'Write the slides of the deck (only when asked to compose or regenerate slides). One call may carry many ' +
          'slides, in reading order; a slideId that exists is replaced in place. For a complete deck refresh in chat, pass replaceAll:true with ALL slides to remove obsolete slides. Single-slide regeneration cannot replace the deck. Every slide except a title or ' +
          'section divider must cite the cards it is based on: cardIds lists at least one card id from the cards in ' +
          'scope (an uncited slide, or one citing any other card, is refused and nothing is written). A visual, ' +
          'two-column or quote slide shows one card (visualCardId: a chart, table, image, design frame, metric, ' +
          'matrix, quote…) and cites it. Bullets are short phrases, not paragraphs. The app adds the Sources slide ' +
          'and puts the citations into the speaker notes: never write sources onto a slide.',
        parameters: {
          replaceAll: { type: 'boolean', description: 'Replace the complete deck with these slides; use only for an explicitly requested full refresh, never for an incremental batch or one-slide edit.' },
          slides: {
            type: 'array',
            required: true,
            description: `1 to ${DECK_LIMITS.perCall} slides.`,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                slideId: {
                  type: 'string',
                  required: true,
                  description: 'Short lowercase slug, e.g. summary, market, next-steps. Same id = same slide.',
                },
                layout: {
                  type: 'string',
                  required: true,
                  enum: [...SLIDE_LAYOUTS],
                  description:
                    'title (cover), section (divider), bullets, visual (one card large, optional bullets), ' +
                    'two-column (bullets beside a card), quote.',
                },
                title: {
                  type: 'string',
                  required: true,
                  description: `Slide title, ≤${DECK_LIMITS.title} chars. State the point, not the topic.`,
                },
                subtitle: { type: 'string', description: 'Cover subtitle, or the quote attribution.' },
                bullets: {
                  type: 'array',
                  items: { type: 'string' },
                  description: `Up to ${DECK_LIMITS.bullets} short bullets (≤${DECK_LIMITS.bullet} chars each).`,
                },
                visualCardId: {
                  type: 'string',
                  description: 'Id (c_…) of the card shown on the slide. Required for visual and two-column slides.',
                },
                caption: { type: 'string', description: 'One-line caption for the visual.' },
                notes: { type: 'string', description: 'Speaker notes: what to say. No source list.' },
                cardIds: {
                  type: 'array',
                  required: true,
                  items: { type: 'string' },
                  description:
                    'Ids (c_…) of the cards in scope this slide is based on. Never empty, except on title and section slides.',
                },
              },
            },
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              slides: { type: 'integer', required: true, description: 'Slides written by this call.' },
              total: { type: 'integer', required: true, description: 'Slides in the deck now.' },
              citations: { type: 'integer', required: true, description: 'Distinct cards cited by this call.' },
            },
          },
          render: (_args: unknown, value: unknown) => text(value),
        },
        execute: (args: unknown, exec: BoardToolExec) => composeSlides(store, args, exec),
      } as any),
    ),
  );
}
