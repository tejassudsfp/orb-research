/**
 * The conversation panel's model (P3.6): folds the root Orb session's `session/follow` frames into what the panel
 * shows. Pure and DOM-free (unit-tested in apps/ui/test/conversation.unit.test.ts).
 *
 * - User messages: `user/message` events whose source is the user. Their first text part is what the user typed; a
 *   later text part is the context Orb's host added (orb-canvas context.ts), which marks a THREAD message with
 *   `<thread of="…">`. Messages from other agents and injected progress notes are not chat messages.
 *   The new-canvas turn (`New canvas. The user's question: …`) shows only the question.
 * - Assistant messages: committed `assistant/message` text, per step; the attempt being streamed is `live`
 *   (assistant-stream `start`/`chunk`/`end` frames) until its message commits.
 * - Turns: `turn/start` / `turn/end` with their times (the "On the board" activity windows) and, for a turn that
 *   took a thread message, the thread's card or frame id (thread turns are shown in their thread, not in the panel).
 * - `running`, `lastTurnEnd`, `lastTurnEndReason`: as the P1 ReplyTracker.
 */
import {
  ATTACHED_HEADER,
  AssistantTextDelta,
  PORT_COMPOSE_PREFIX,
  PORT_REGENERATE_PREFIX,
  RESUME_TEXT,
  TurnEndData,
  type SessionFollowFrame,
} from '@orb/shared';

/** P6.1: a card attached to a message: its id and the title it had when the message was sent. */
export type Attachment = { id: string; title: string };

export type ChatItem =
  | {
      kind: 'user';
      key: string;
      seq: number;
      at: number;
      /** Index of its turn in `ConversationState.turns`. */
      turn: number;
      text: string;
      /** Card or frame id when this message was written in a thread. */
      thread?: string;
      /** How many frames and cards were in context. */
      context?: number;
      /** P6.1: the cards attached to this message from the composer (chips that fly to the card). */
      attachments?: Attachment[];
    }
  | { kind: 'assistant'; key: string; seq: number; at: number; turn: number; text: string; thread?: string };

export type TurnInfo = {
  /** The harness turn number (restarts at 1 when the session is resumed). */
  turn: number;
  /** `time` of its `turn/start` event, ms. */
  startedAt: number;
  endedAt?: number;
  /** `reason.kind` of its `turn/end`. */
  end?: string;
  /** The card or frame whose thread this turn answers. */
  thread?: string;
};

export type ConversationState = {
  items: ChatItem[];
  turns: TurnInfo[];
  /** The attempt being streamed, until its message commits (`turn`: index in `turns`). */
  live?: { text: string; turn: number; thread?: string };
  running: boolean;
  lastTurnEnd?: string;
  lastTurnEndReason?: Record<string, unknown>;
};

export const emptyConversation = (): ConversationState => ({ items: [], turns: [], running: false });

const NEW_CANVAS = "New canvas. The user's question: ";

const textParts = (content: unknown): string[] =>
  Array.isArray(content)
    ? content
        .filter((p) => p && typeof p === 'object' && p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text as string)
    : [];

/** The thread id in a message's context part (the last text part, after the user's own text). */
export function threadIn(parts: readonly string[]): string | undefined {
  if (parts.length < 2) return undefined;
  return /^<thread of="([cf]_[A-Za-z0-9_-]{1,62})">\n/.exec(parts.at(-1)!)?.[1];
}

/**
 * How many frames and cards the user put in context for a message: the `<board-context>` block's frame headers
 * (`Frame 01 "Market" [f_…]: …`, their cards are listed under them) plus its loose cards (after `Cards:`).
 */
function contextCount(parts: readonly string[]): number | undefined {
  if (parts.length < 2) return undefined;
  const block = /<board-context>([\s\S]*?)<\/board-context>/.exec(parts.at(-1)!)?.[1];
  if (!block) return undefined;
  const frames = block.match(/^Frame \d+ ".*?" \[f_[^\]]+\]/gm)?.length ?? 0;
  const loose = block.split(/^Cards:$/m)[1]?.match(/^- \[c_[^\]]+\]/gm)?.length ?? 0;
  return frames + loose || undefined;
}

/**
 * P6.1: the cards attached to a message: the `- [c_…] <type> "<title>" (by …` lines of the `<board-context>` block's
 * Attached section (orb-canvas context.ts), up to the next section.
 */
export function attachmentsIn(parts: readonly string[]): Attachment[] | undefined {
  if (parts.length < 2) return undefined;
  const block = /<board-context>([\s\S]*?)<\/board-context>/.exec(parts.at(-1)!)?.[1];
  const at = block?.indexOf(`\n${ATTACHED_HEADER}\n`) ?? -1;
  if (!block || at < 0) return undefined;
  const list: Attachment[] = [];
  for (const line of block.slice(at + ATTACHED_HEADER.length + 2).split('\n')) {
    if (/^(Frame \d+ |Cards:$)/.test(line)) break;
    const m = /^- \[(c_[A-Za-z0-9_-]{1,62})\] [a-z]+ "(.*)" \(by /.exec(line);
    if (m) list.push({ id: m[1]!, title: m[2]! });
  }
  return list.length > 0 ? list : undefined;
}

/** What the panel shows for a user message: the typed text (the question alone for the new-canvas turn). */
export function shownUserText(first: string): string {
  if (first.startsWith(NEW_CANVAS)) return first.slice(NEW_CANVAS.length).split('\n')[0]!.trim();
  // P4.5: a compose or regenerate turn of the research document shows its first line only.
  if (first.startsWith(PORT_COMPOSE_PREFIX) || first.startsWith(PORT_REGENERATE_PREFIX))
    return `${first.split('\n')[0]!.trim()}.`;
  return first;
}

export class ConversationTracker {
  state: ConversationState = emptyConversation();
  private attemptId?: string;
  /** Index of the current turn in `turns` (turn numbers restart when a session is resumed). */
  private currentTurn = -1;
  private currentThread?: string;

  push(frame: SessionFollowFrame): ConversationState {
    const s: ConversationState = {
      ...this.state,
      items: [...this.state.items],
      turns: [...this.state.turns],
    };
    if (frame.type === 'snapshot') {
      for (const r of frame.records) this.event(s, r.event);
    } else if (frame.type === 'event') {
      this.event(s, frame.event);
    } else {
      const f = frame.frame;
      if (f.type === 'start') {
        this.attemptId = f.attemptId;
        s.live = {
          text: '',
          turn: this.currentTurn,
          ...(this.currentThread ? { thread: this.currentThread } : {}),
        };
      } else if (f.type === 'chunk' && f.attemptId === this.attemptId && s.live) {
        const delta = AssistantTextDelta.safeParse(f.chunk);
        if (delta.success) s.live = { ...s.live, text: s.live.text + delta.data.text };
      } else if (f.type === 'end' && f.attemptId === this.attemptId) {
        // Committed: the `assistant/message` event carries the text; abandoned: nothing to keep.
        delete s.live;
        this.attemptId = undefined;
      }
    }
    this.state = s;
    return s;
  }

  private event(s: ConversationState, e: { type: string; seq: number; time: number; data: unknown }): void {
    switch (e.type) {
      case 'turn/start': {
        const turn = (e.data as { turn?: number })?.turn ?? 0;
        this.currentThread = undefined;
        s.running = true;
        s.turns.push({ turn, startedAt: e.time });
        this.currentTurn = s.turns.length - 1;
        break;
      }
      case 'user/message': {
        const message = ((e.data as { message?: unknown })?.message ?? e.data) as {
          content?: unknown;
          source?: { kind?: string };
          id?: string;
        };
        if (message?.source?.kind !== 'user') break;
        const parts = textParts(message.content);
        const first = parts[0] ?? '';
        // P3.7: the "continue" a Resume steers in is a control, not a chat message.
        if (parts.length === 1 && first === RESUME_TEXT) break;
        const thread = threadIn(parts);
        this.currentThread = thread;
        if (thread) {
          const t = s.turns[this.currentTurn];
          if (t) s.turns[this.currentTurn] = { ...t, thread };
        }
        const context = contextCount(parts);
        const attachments = attachmentsIn(parts);
        s.items.push({
          kind: 'user',
          key: `u${e.seq}`,
          seq: e.seq,
          at: e.time,
          turn: this.currentTurn,
          text: shownUserText(first),
          ...(thread ? { thread } : {}),
          ...(context ? { context } : {}),
          ...(attachments ? { attachments } : {}),
        });
        break;
      }
      case 'assistant/message': {
        const text = textParts((e.data as { message?: { content?: unknown } })?.message?.content)
          .join('')
          .trim();
        delete s.live;
        if (!text) break;
        s.items.push({
          kind: 'assistant',
          key: `a${e.seq}`,
          seq: e.seq,
          at: e.time,
          turn: this.currentTurn,
          text,
          ...(this.currentThread ? { thread: this.currentThread } : {}),
        });
        break;
      }
      case 'turn/end': {
        s.running = false;
        delete s.live;
        const parsed = TurnEndData.safeParse(e.data);
        const t = s.turns.at(-1);
        if (parsed.success) {
          s.lastTurnEnd = parsed.data.reason.kind;
          s.lastTurnEndReason = parsed.data.reason;
        }
        if (t && !t.endedAt)
          s.turns[s.turns.length - 1] = {
            ...t,
            endedAt: e.time,
            ...(parsed.success ? { end: parsed.data.reason.kind } : {}),
          };
        this.currentThread = undefined;
        break;
      }
      default:
        break;
    }
  }
}

/** The panel's items: everything that is not part of a thread. */
export const panelItems = (state: ConversationState): ChatItem[] => state.items.filter((i) => !i.thread);

/** The last user message typed in the panel (Up in an empty box brings it back). */
export const lastUserText = (state: ConversationState): string | undefined =>
  panelItems(state).findLast((i) => i.kind === 'user')?.text;

/** One block of the panel: a user message's turn (and the turns Orb took on its own after it), and the time window of its "On the board" activity. */
export type PanelBlock = { turn: number; items: ChatItem[]; from: number; to: number };

/**
 * The panel's items grouped per user message (thread turns left out): a block starts with a user message's turn;
 * replies of turns Orb took on its own after it (woken by a child's message) join it. A block's activity window runs
 * from its turn's start to the start of the next block (children keep working after Orb's turn ends; their cards go
 * under it).
 */
export function panelBlocks(state: ConversationState): PanelBlock[] {
  const blocks: PanelBlock[] = [];
  for (const item of panelItems(state)) {
    const last = blocks.at(-1);
    if (last && (last.turn === item.turn || item.kind !== 'user')) last.items.push(item);
    else
      blocks.push({
        turn: item.turn,
        items: [item],
        from: state.turns[item.turn]?.startedAt ?? item.at,
        to: Infinity,
      });
  }
  for (let i = 0; i + 1 < blocks.length; i++) blocks[i]!.to = blocks[i + 1]!.from;
  return blocks;
}
