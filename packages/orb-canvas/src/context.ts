/**
 * Chat context injection (BUILD_PLAN P3.3, PRD Chat › Context and Threads › Grounding): the frames and cards the user
 * has in context, and the card or frame a thread message belongs to, rendered as plain text for the root Orb agent.
 * `orb/chat.send` appends this text to the user's message, so the model reads the same `describe()` text that
 * `query_board` returns (orb-cards registry), with ids for its tools and never coordinates.
 *
 * Pure and harness-free: the canvas service calls it on the folded board.
 */
import { describeCard } from '@orb/cards';
import {
  ATTACHED_HEADER,
  boardFrames,
  cardTitle,
  type BoardState,
  type Card,
  type ChatContext,
  type Frame,
} from '@orb/shared';
import { CanvasError } from './errors.js';

/**
 * P6.8: only what the user selected, mentioned or put in context is injected, never the whole board, and what is
 * injected has a budget: a frame lists its first cards (a frame holds 12 agent cards; user cards can add more), a
 * card is its describe() text clipped, and the whole text is cut with a marker that points at the reading tools.
 */
export const CONTEXT_CARDS_PER_FRAME = 15;
/** Loose cards (in context, outside any listed frame) shown at most. */
export const CONTEXT_LOOSE_CARDS = 25;
/** Longest describe() text of one card in context (read_card has the rest). */
export const CONTEXT_CARD_CHARS = 400;
/** Upper bound of the injected text (about 4k tokens); longer context is cut with a marker. */
export const CONTEXT_MAX_CHARS = 16_000;
const MORE_HINT = 'use board_map, search_board and read_card';

export type ContextRequest = { context?: ChatContext | undefined; threadOf?: string | undefined };

const byOf = (card: Card) => (card.provenance.kind === 'agent' ? card.provenance.agent : 'user');

/** `01 "Thesis" [f_…]`: a frame's number (insertion order), title and id. */
function frameLabel(frames: readonly Frame[], frame: Frame): string {
  const n = String(frames.indexOf(frame) + 1).padStart(2, '0');
  return `${n} "${frame.title}" [${frame.id}]`;
}

/** One card as context: id, type, title, who added it, where it is, its describe() text, why and the user's note. */
function cardLine(state: BoardState, frames: readonly Frame[], card: Card, withFrame: boolean): string {
  const frame = card.frameId ? state.frames[card.frameId] : undefined;
  const where = withFrame ? (frame ? `, in frame ${frameLabel(frames, frame)}` : ', on the open board') : '';
  const head = `- [${card.id}] ${card.type} "${cardTitle(card)}" (by ${byOf(card)}${where})`;
  const described = describeCard(card).replace(/\n+/g, ' ');
  const lines = [head, `  ${described.length > CONTEXT_CARD_CHARS ? `${described.slice(0, CONTEXT_CARD_CHARS - 1)}…` : described}`];
  if (card.why) lines.push(`  Why: ${card.why}`);
  if (card.note) lines.push(`  User's note: ${card.note.slice(0, 300).replace(/\n+/g, ' ')}`);
  return lines.join('\n');
}

/** A frame and its visible cards. */
function frameBlock(state: BoardState, frames: readonly Frame[], frame: Frame): string {
  const cards = Object.values(state.cards).filter((c) => c.frameId === frame.id && !c.stackedInto);
  const shown = cards.slice(0, CONTEXT_CARDS_PER_FRAME);
  const lines = [`Frame ${frameLabel(frames, frame)}: ${cards.length} card${cards.length === 1 ? '' : 's'}`];
  for (const card of shown) lines.push(cardLine(state, frames, card, false));
  if (cards.length > shown.length) lines.push(`- … ${cards.length - shown.length} more (${MORE_HINT})`);
  return lines.join('\n');
}

function needFrame(state: BoardState, id: string): Frame {
  const frame = state.frames[id];
  if (!frame)
    throw new CanvasError('orb/not-found', `no frame ${JSON.stringify(id)} on this board`, { frameId: id });
  return frame;
}

function needCard(state: BoardState, id: string): Card {
  const card = state.cards[id];
  if (!card)
    throw new CanvasError('orb/not-found', `no card ${JSON.stringify(id)} on this board`, { cardId: id });
  return card;
}

const clipText = (text: string) =>
  text.length <= CONTEXT_MAX_CHARS
    ? text
    : `${text.slice(0, CONTEXT_MAX_CHARS)}\n… (context cut; ${MORE_HINT})`;

/**
 * The context text for a message, or `undefined` when it has none. Unknown frame or card ids are refused
 * (`orb/not-found`), so the UI never sends a message whose context silently vanished.
 */
export function contextText(state: BoardState, request: ContextRequest): string | undefined {
  const frames = boardFrames(state);
  const parts: string[] = [];

  // The thread block comes FIRST, so `<thread of="…">` is always the very start of the context part: card text
  // quoted in a <board-context> block (a fetched page, a note) can never pass for a thread tag, and a long context
  // is cut at its end, never the thread block (orb-agents threadIdOf / the UI's threadIn match only at the start).
  if (request.threadOf) {
    const id = request.threadOf;
    let body: string;
    if (id.startsWith('f_')) {
      body = [
        `This message was written in the thread of frame ${frameLabel(frames, needFrame(state, id))}. The frame:`,
        frameBlock(state, frames, needFrame(state, id)),
      ].join('\n');
    } else {
      const card = needCard(state, id);
      body = [
        `This message was written in the thread of card [${card.id}]. The card:`,
        cardLine(state, frames, card, true),
      ].join('\n');
    }
    parts.push(
      [
        `<thread of="${id}">`,
        body,
        `Answer about it and stay grounded in its content. Cards you place while answering this thread are put next to it and linked to it (place_card threadOf="${id}"; the default in this turn).`,
        '</thread>',
      ].join('\n'),
    );
  }

  const frameIds = [...new Set(request.context?.frameIds ?? [])];
  const attachmentIds = [...new Set(request.context?.attachmentIds ?? [])];
  const cardIds = [...new Set(request.context?.cardIds ?? [])].filter((id) => !attachmentIds.includes(id));
  if (frameIds.length > 0 || cardIds.length > 0 || attachmentIds.length > 0) {
    const blocks: string[] = [];
    // P6.1: what the user attached to this message comes first (the cut of a long context never reaches it).
    if (attachmentIds.length > 0) {
      const attached = attachmentIds.map((id) => needCard(state, id));
      blocks.push([ATTACHED_HEADER, ...attached.map((c) => cardLine(state, frames, c, true))].join('\n'));
    }
    for (const id of frameIds) blocks.push(frameBlock(state, frames, needFrame(state, id)));
    const cards = cardIds.map((id) => needCard(state, id));
    // A card already listed with its frame is not repeated.
    const loose = cards.filter((c) => !(c.frameId && frameIds.includes(c.frameId)));
    if (loose.length > 0)
      blocks.push(
        [
          'Cards:',
          ...loose.slice(0, CONTEXT_LOOSE_CARDS).map((c) => cardLine(state, frames, c, true)),
          ...(loose.length > CONTEXT_LOOSE_CARDS
            ? [`- … ${loose.length - CONTEXT_LOOSE_CARDS} more cards in context (${MORE_HINT})`]
            : []),
        ].join('\n'),
      );
    parts.push(
      [
        '<board-context>',
        'The user has these frames and cards of the board in context for this message (ids are for your tools; cite cards by title and id):',
        ...blocks,
        '</board-context>',
      ].join('\n'),
    );
  }

  return parts.length > 0 ? clipText(parts.join('\n\n')) : undefined;
}

/** Upper bound of the cards text a compose turn gets (P4.5). */
export const SCOPE_MAX_CHARS = 60_000;

/**
 * P4.5: the cards a research document may cite, as Orb reads them in the compose turn: each frame of the scope in
 * board order with its visible cards (describe() text, why, the user's note), then the open board's cards when the
 * scope is the whole board. Ids are what `compose_section` cites.
 */
export function scopeText(state: BoardState, scope: 'all' | readonly string[]): string {
  const frames = boardFrames(state);
  const inScope = scope === 'all' ? frames : frames.filter((f) => scope.includes(f.id));
  const blocks = inScope.map((f) => frameBlock(state, frames, f));
  if (scope === 'all') {
    const loose = Object.values(state.cards).filter((c) => c.frameId === null && !c.stackedInto);
    if (loose.length > 0)
      blocks.push(
        ['Open board (no frame):', ...loose.map((c) => cardLine(state, frames, c, false))].join('\n'),
      );
  }
  const text = blocks.join('\n\n');
  return text.length <= SCOPE_MAX_CHARS
    ? text
    : `${text.slice(0, SCOPE_MAX_CHARS)}\n… (list cut; the rest of the scope is read with board_map, search_board and read_card)`;
}
