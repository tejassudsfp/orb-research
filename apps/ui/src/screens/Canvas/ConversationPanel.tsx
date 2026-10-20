/**
 * The full-height conversation rail (P6.31), beside the board. It collapses to a pill, retains drafts and history,
 * and contains the reading dropdown and local board lookup. Board measurements exclude the rail's column.
 *
 * P3.6:
 * - History from the root Orb session (`conversation.ts`): the user's messages, Orb's replies streaming token by
 *   token, and under each turn an "On the board" group listing what each agent added, linked to the cards (a click
 *   flies to the card). Thread turns are shown in their thread, not here.
 * - Context chip above the input (frames and cards in context, sent with every message until removed); `@` in the
 *   input lists the board's frames and cards and adds the picked one to context.
 * - Keys: Enter sends, Shift+Enter adds a line, Up in an empty box brings back the last message.
 * - Stop replaces Send while anything runs (typing brings Send back, so the user can still message the team); the
 *   header menu has Pause all, Resume all, Stop all and Stop Orb; each agent's avatar opens its own controls.
 * P3.7: Pause / Resume / Redirect per agent (avatar menus; Orb's in the header menu) and for all agents. Redirect
 * opens a one-line box in the menu; the text steers Orb or goes to the child as a message (queued while paused).
 * P4.3: the header menu opens on the canvas's token and estimated cost meter (root + child sessions; refreshed while
 * the menu is open). Routes without a price are named, and their tokens are not in the dollar figure.
 * P6.1: attachments. The paperclip, a paste of files into the panel, or a drop on the panel (or its pill) ingests the
 * files through the board's ordinary path into cards in view (`onAttach`, placed by the Canvas screen in the current
 * frame or near it); each shows as a chip above the input and is sent with the message as context
 * (`context.attachmentIds`). The sent message keeps its chips; a click flies to the card. The board behind the panel
 * never takes the drop (`data-drop-zone="chat"`, see useIngest).
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { OrbMark } from '../../brand/OrbMark.js';
import { ChatMarkdown } from '../../components/ChatMarkdown.js';
import { ReadingQueue } from '../../cards/ReadingQueue.js';
import { ConversationBoard } from './ConversationBoard.js';
import { ResearchProgress } from './ResearchProgress.js';
import { useMenu } from '../../components/useMenu.js';
import {
  AGENT_LABELS,
  boardFrames,
  cardTitle,
  foldText,
  formatPercent,
  formatTokens,
  formatUsd,
  type AgentControlArgs,
  type CanvasCost,
  type AgentName,
  type BoardState,
  MAX_ATTACHMENTS,
  ResearchData,
  WatchData,
  awaitingApproval,
  readCardData,
} from '@orb/shared';
import { researchKindLabel, usd } from '../../cards/parallel.js';
import {
  ChatIcon,
  ChevronDownIcon,
  CloseIcon,
  ComposeIcon,
  MoreIcon,
  PaperclipIcon,
  PauseIcon,
  PlayIcon,
  SendIcon,
  StopIcon,
} from '../../components/icons.js';
import type { AgentStatus } from '../../wire/index.js';
import { itemsFromTransfer, type IngestItem } from '../../cards/ingest.js';
import { accepts } from '../../cards/useIngest.js';
import { AGENT_COLORS, TEAM, activityBetween } from './agentsView.js';
import { lastUserText, panelBlocks, type Attachment, type ConversationState } from './conversation.js';
import type { PendingMessage } from './useCanvas.js';
import s from './Canvas.module.css';

/** How often the open menu re-reads the meter. */
const COST_REFRESH_MS = 3000;

/** Reading chat must not delete board selections or activate canvas tools. Keep explicit global shortcuts. */
function railKeys(event: KeyboardEvent<HTMLElement>) {
  if ((event.metaKey || event.ctrlKey) && ['f', '0', 'z'].includes(event.key.toLowerCase())) return;
  if (event.shiftKey && ['Digit1', 'Digit2'].includes(event.code)) return;
  event.stopPropagation();
}

/** P4.3: the token and estimated cost meter at the top of the header menu. */
function CostMeter({ load }: { load: (signal: AbortSignal) => Promise<CanvasCost> }) {
  const [cost, setCost] = useState<CanvasCost>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The next read is scheduled once this one settles, so a slow sidecar never gets overlapping reads.
    const tick = () => {
      load(ac.signal)
        .then(
          (c) => {
            if (ac.signal.aborted) return;
            setCost(c);
            setFailed(false);
          },
          () => {
            if (!ac.signal.aborted) setFailed(true);
          },
        )
        .finally(() => {
          if (!ac.signal.aborted) timer = setTimeout(tick, COST_REFRESH_MS);
        });
    };
    tick();
    return () => {
      ac.abort();
      if (timer) clearTimeout(timer);
    };
  }, [load]);
  const breakdown = [
    ...(cost?.routes.map(
      (r) =>
        `${r.provider}/${r.model}: ${formatTokens(totalOf(r.tokens))}, ${r.billing === 'chatgpt-plan' ? 'ChatGPT plan allowance' : r.usd === undefined ? 'no price' : formatUsd(r.usd)}`,
    ) ?? []),
    // P6.8: the prompt-cache hit rate per agent (cached input ÷ total input).
    ...(cost?.agents?.map(
      (a) =>
        `${AGENT_LABELS[a.agent as AgentName] ?? a.agent}: cache hit ${a.cacheHitRate === undefined ? 'n/a' : formatPercent(a.cacheHitRate)}`,
    ) ?? []),
  ].join('\n');
  return (
    <div
      className={s.costMeter}
      data-testid="cost-meter"
      data-total={cost?.total ?? ''}
      data-usd={cost ? String(cost.usd) : ''}
      title={breakdown || undefined}
    >
      <span className={s.costLabel}>This canvas</span>
      <span className={s.costValue} data-testid="cost-meter-value">
        {cost
          ? cost.routes.length > 0 && cost.routes.every((r) => r.billing === 'chatgpt-plan')
            ? `${formatTokens(cost.total)} · ChatGPT plan`
            : `${formatTokens(cost.total)} · ${formatUsd(cost.usd)}${cost.unpriced.length > 0 ? '+' : ''} API est.`
          : failed
            ? 'Usage unavailable'
            : 'Reading usage…'}
      </span>
      {cost?.routes.some((r) => r.billing === 'chatgpt-plan') && (
        <a className={s.costNote} href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">
          Using ChatGPT plan · Manage usage
        </a>
      )}
      {cost?.cacheHitRate !== undefined && (
        <span className={s.costNote} data-testid="cost-meter-cache" data-rate={cost.cacheHitRate.toFixed(3)}>
          Cache hit {formatPercent(cost.cacheHitRate)}
          {cost.agents && cost.agents.length > 1
            ? ` (${cost.agents
                .filter((a) => a.cacheHitRate !== undefined)
                .map(
                  (a) =>
                    `${(AGENT_LABELS[a.agent as AgentName] ?? a.agent).toLowerCase()} ${formatPercent(a.cacheHitRate!)}`,
                )
                .join(', ')})`
            : ''}
        </span>
      )}
      {cost && cost.unpriced.length > 0 && (
        <span className={s.costNote} data-testid="cost-meter-unpriced">
          No price for {cost.unpriced.join(', ')}. Set one in Settings.
        </span>
      )}
    </div>
  );
}

const totalOf = (b: CanvasCost['tokens']) =>
  b.uncachedInputTokens + b.outputTokens + b.cacheReadTokens + b.cacheWriteTokens;

const working = (st: AgentStatus | undefined) => st?.state === 'running' || st?.state === 'stopping';

function activityLine(
  orb: AgentStatus | undefined,
  team: Partial<Record<AgentName, AgentStatus>>,
  running: boolean,
): string {
  if (orb?.state === 'stopping') return 'Stopping…';
  if (orb?.state === 'stopped') return 'Stopped';
  if (orb?.state === 'stop-timeout') return 'Stop timed out';
  const pausedCount =
    TEAM.filter((a) => team[a]?.state === 'paused').length + (orb?.state === 'paused' ? 1 : 0);
  if (orb?.state === 'paused' && !TEAM.some((a) => working(team[a])))
    return pausedCount > 1 ? 'Paused' : 'orb is paused';
  const busy = TEAM.filter((a) => working(team[a])).length + (running ? 1 : 0);
  if (busy > 1) return `${busy} agents working`;
  if (running) return 'orb is working';
  if (busy === 1) return `${AGENT_LABELS[TEAM.find((a) => working(team[a]))!]} is working`;
  if (orb?.research?.state === 'incomplete')
    return `${orb.research.coveredFrames}/${orb.research.totalFrames} sections filled · unfinished`;
  return 'Agents idle';
}

/** One agent's state in words, for its avatar menu. */
function stateText(st: AgentStatus | undefined): string {
  if (!st) return 'Not started';
  switch (st.state) {
    case 'running':
      return st.label && st.label !== 'Idle' ? `Working · ${st.label}` : 'Working';
    case 'idle':
      return st.failure ? 'Failed' : 'Idle';
    case 'paused':
      return 'Paused';
    case 'stopping':
      return 'Stopping…';
    case 'stopped':
      return 'Stopped';
    case 'stop-timeout':
      return 'Stop timed out';
  }
}

type Mention = { id: string; title: string; kind: 'frame' | 'card' };
type OnControl = (
  agent: AgentControlArgs['agent'],
  action: AgentControlArgs['action'],
  text?: string,
) => void;

/** P3.7: the Redirect box inside an agent menu: one message that steers the agent (Enter sends, Esc closes). */
function RedirectBox({
  agent,
  onControl,
  onClose,
}: {
  agent: AgentName;
  onControl: OnControl;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const send = () => {
    if (!text.trim()) return;
    onControl(agent, 'redirect', text.trim());
    onClose();
  };
  return (
    <div className={s.redirectBox} data-testid="redirect-form" data-agent={agent}>
      <textarea
        className={s.redirectInput}
        data-testid="redirect-input"
        aria-label={`New direction for ${AGENT_LABELS[agent]}`}
        placeholder={`Tell ${AGENT_LABELS[agent]} what to do instead`}
        rows={2}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <button
        type="button"
        className={s.redirectSend}
        data-testid="redirect-send"
        disabled={!text.trim()}
        onClick={send}
      >
        Redirect
      </button>
    </div>
  );
}

/** Frames ("01 Market") and visible cards whose title contains the query (case and accents folded). */
function mentionsFor(board: BoardState, query: string, exclude: readonly string[]): Mention[] {
  const q = foldText(query);
  const frames = boardFrames(board).map((f, i) => ({
    id: f.id,
    title: `${String(i + 1).padStart(2, '0')} ${f.title}`,
    kind: 'frame' as const,
  }));
  const cards = Object.values(board.cards)
    .filter((c) => !c.stackedInto && !c.id.includes('_pending-'))
    .map((c) => ({ id: c.id, title: cardTitle(c), kind: 'card' as const }));
  return [...frames, ...cards]
    .filter((m) => !exclude.includes(m.id) && (!q || foldText(m.title).includes(q)))
    .slice(0, 8);
}

/** The title of a frame or card in context (or its id when it is gone). */
function contextTitle(board: BoardState, id: string): string {
  const frame = board.frames[id];
  if (frame) {
    const n = boardFrames(board).indexOf(frame) + 1;
    return `${String(n).padStart(2, '0')} ${frame.title}`;
  }
  const card = board.cards[id];
  return card ? cardTitle(card) : id;
}

/** `@query` right before the caret, if any. */
function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|\s)@([^\s@]{0,40})$/.exec(text.slice(0, caret));
  return m ? { start: caret - m[2]!.length - 1, query: m[2]! } : null;
}

/** What the file picker offers (ingest.ts accepts these; anything else is refused there with a message). */
const ATTACH_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.gif,.webp,.csv,.md,.markdown,.txt,application/pdf,image/png,image/jpeg,image/gif,image/webp,text/csv,text/markdown,text/plain';

/** P6.1: an attachment in the composer: being added (`count` files), or its card. */
type DraftAttachment = { key: string; adding: number } | { key: string; id: string };

/** P6.1: the attachment chips of a sent message; a click flies to the card. */
function MessageAttachments({
  list,
  board,
  onShowItem,
}: {
  list: readonly Attachment[];
  board: BoardState;
  onShowItem: (id: string) => void;
}) {
  return (
    <span className={s.messageAttachments}>
      {list.map((a) => {
        const card = board.cards[a.id];
        const title = card ? cardTitle(card) : a.title;
        return (
          <button
            type="button"
            key={a.id}
            className={s.messageAttachment}
            data-testid="message-attachment"
            data-item-id={a.id}
            disabled={!card}
            title={card ? `Show ${title} on the board` : `${title} is no longer on the board`}
            onClick={() => onShowItem(a.id)}
          >
            <PaperclipIcon size={11} />
            <span className={s.messageAttachmentTitle}>{title}</span>
          </button>
        );
      })}
    </span>
  );
}

function AgentMenu({
  agent,
  status,
  onControl,
  onClose,
}: {
  agent: AgentName;
  status: AgentStatus | undefined;
  onControl: OnControl;
  onClose: () => void;
}) {
  const live = !!status;
  const paused = status?.state === 'paused';
  const [redirecting, setRedirecting] = useState(false);
  const keys = useMenu(onClose);
  return (
    <div
      ref={keys.ref}
      tabIndex={-1}
      onKeyDown={keys.onKeyDown}
      className={s.agentMenu}
      role="menu"
      data-testid="agent-menu"
      data-agent={agent}
      aria-label={`${AGENT_LABELS[agent]} controls`}
    >
      <div className={s.agentMenuHead}>
        <span className={s.agentDot} style={{ background: AGENT_COLORS[agent].bg }} aria-hidden="true" />
        <span className={s.agentMenuName}>{AGENT_LABELS[agent]}</span>
        <span className={s.agentMenuState} data-testid="agent-menu-state">
          {stateText(status)}
        </span>
      </div>
      {status?.failure && (
        <p className={s.agentFailure} data-testid="agent-menu-failure">
          {status.failure.message}
          {status.failure.requestId && <small>Request: {status.failure.requestId}</small>}
        </p>
      )}
      <button
        type="button"
        role="menuitem"
        className={s.menuItem}
        data-testid="agent-menu-pause"
        disabled={!live}
        onClick={() => {
          onControl(agent, paused ? 'resume' : 'pause');
          onClose();
        }}
      >
        {paused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
        {paused ? 'Resume' : 'Pause'}
      </button>
      <button
        type="button"
        role="menuitem"
        className={s.menuItem}
        data-testid="agent-menu-stop"
        disabled={!live}
        onClick={() => {
          onControl(agent, 'stop');
          onClose();
        }}
      >
        <StopIcon size={12} />
        Stop
      </button>
      {redirecting ? (
        <RedirectBox agent={agent} onControl={onControl} onClose={onClose} />
      ) : (
        <button
          type="button"
          role="menuitem"
          className={s.menuItem}
          data-testid="agent-menu-redirect"
          disabled={!live}
          onClick={() => setRedirecting(true)}
        >
          <SendIcon size={13} />
          Redirect…
        </button>
      )}
    </div>
  );
}

/** The header's Agent controls menu (cost meter, all-agent and Orb controls). */
function AllMenu({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const keys = useMenu(onClose);
  return (
    <div
      ref={keys.ref}
      tabIndex={-1}
      onKeyDown={keys.onKeyDown}
      className={`${s.agentMenu} ${s.agentMenuRight}`}
      role="menu"
      aria-label="Agent controls"
      data-testid="chat-menu-list"
    >
      {children}
    </div>
  );
}

export function ConversationPanel({
  open,
  onOpenChange: setOpen,
  conversation,
  pending,
  agents,
  team,
  board,
  context,
  onContext,
  stopping,
  error,
  disabled,
  onSend,
  onStop,
  onControl,
  onCompose,
  onShowItem,
  onOpenCard,
  loadCost,
  onAttach,
  onConfirmParallel,
  followUps,
  usingPlan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: ConversationState;
  pending: PendingMessage[];
  agents?: AgentStatus;
  team: Partial<Record<AgentName, AgentStatus>>;
  board: BoardState;
  context: string[];
  onContext: (ids: string[]) => void;
  stopping: boolean;
  error?: string;
  disabled: boolean;
  onSend: (text: string, attachments?: readonly Attachment[]) => Promise<boolean>;
  /**
   * P6.1: ingest attached files (or a dropped link or text) into cards in view; resolves the ids of the cards added
   * (empty when nothing landed: the board notice says why).
   */
  onAttach?: (items: IngestItem[]) => Promise<string[]>;
  onStop: () => void;
  onControl: OnControl;
  onCompose: () => void;
  /** Fly to a card or frame (activity links, context chips). */
  onShowItem: (id: string) => void;
  onOpenCard: (id: string) => void;
  /** P4.3: read the canvas's token and cost meter (header menu). */
  loadCost?: (signal: AbortSignal) => Promise<CanvasCost>;
  /** P6.7: the user's answer to a Parallel run or watch waiting for the cost guard's OK. */
  onConfirmParallel?: (cardId: string, approve: boolean) => void;
  /** P6.11: a template's follow-up prompts, shown once the first pass is done; a chip fills the message box. */
  followUps?: readonly { label: string; prompt: string }[];
  usingPlan?: boolean;
}) {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const [menu, setMenu] = useState<AgentName | 'all' | null>(null);
  const [redirectOrb, setRedirectOrb] = useState(false);
  useEffect(() => {
    if (menu !== 'all') setRedirectOrb(false);
  }, [menu]);
  const body = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const previousOpen = useRef(open);
  const scrollTop = useRef(0);
  const followTail = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  // P6.1: composer attachments and the drop highlight.
  const [drafts, setDrafts] = useState<DraftAttachment[]>([]);
  const [dropping, setDropping] = useState(false);
  const [attachNote, setAttachNote] = useState<string | undefined>();
  const nextDraft = useRef(0);
  // An attached card the user deleted from the board leaves the composer too.
  const shownDrafts = drafts.filter((d) => !('id' in d) || d.id in board.cards);
  const ready = shownDrafts.flatMap((d) => ('id' in d ? [d.id] : []));
  const adding = shownDrafts.some((d) => 'adding' in d);
  const running = conversation.running || agents?.state === 'running';
  const anyWorking = running || TEAM.some((a) => working(team[a]));
  const turn = conversation.running ? 'running' : (conversation.lastTurnEnd ?? 'idle');
  const blocks = useMemo(() => panelBlocks(conversation), [conversation]);
  const live = conversation.live && !conversation.live.thread ? conversation.live : undefined;
  const lastAssistant = useMemo(() => {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const item = blocks[i]!.items.findLast((it) => it.kind === 'assistant');
      if (item) return item.key;
    }
    return undefined;
  }, [blocks]);
  // P6.7 cost guard: runs and watches waiting for the user's OK are asked here as well as on their cards.
  const approvals = useMemo(
    () =>
      Object.values(board.cards)
        .filter(awaitingApproval)
        .map((card) => {
          if (card.type === 'watch') {
            const d = readCardData(WatchData, card.data);
            return {
              id: card.id,
              text: `Start a watch on “${d?.title ?? 'a topic'}”? It checks ${d?.frequency ?? ''} on Parallel's servers, about ${usd(d?.monthlyUsd)} a month.`,
            };
          }
          const d = readCardData(ResearchData, card.data);
          return {
            id: card.id,
            text: `Run ${d ? researchKindLabel(d.kind).toLowerCase() : 'research'} “${d?.title ?? ''}”? Estimated cost ${usd(d?.estCostUsd)}.`,
          };
        }),
    [board.cards],
  );
  const mention = mentionAt(text, caret);
  const mentions = useMemo(
    () => (mention ? mentionsFor(board, mention.query, context) : []),
    [board, mention?.query, context, mention],
  );

  useEffect(() => {
    const el = body.current;
    if (el && followTail.current) el.scrollTop = el.scrollHeight;
  }, [conversation.items.length, live?.text, pending.length, error, open]);

  useEffect(() => {
    if (open && !followTail.current && body.current) body.current.scrollTop = scrollTop.current;
    if (previousOpen.current !== open) {
      if (open) input.current?.focus();
      else {
        setMenu(null);
        pill.current?.focus();
      }
    }
    previousOpen.current = open;
  }, [open]);

  useEffect(() => setPick(0), [mention?.query]);

  // The box grows with its text up to four lines.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = '';
    if (el.scrollHeight > el.clientHeight) el.style.height = `${Math.min(el.scrollHeight, 106)}px`;
  }, [text, open]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if ((!text.trim() && ready.length === 0) || disabled || adding) return;
    const sent = ready.map((id) => ({ id, title: board.cards[id] ? cardTitle(board.cards[id]) : id }));
    if (await onSend(text, sent)) {
      followTail.current = true;
      setText('');
      setDrafts((list) => list.filter((d) => !('id' in d) || !ready.includes(d.id)));
      setAttachNote(undefined);
    }
  };

  /** P6.1: ingest the items into cards in view; their chips wait above the input for the next message. */
  const attach = (all: IngestItem[]) => {
    if (!onAttach || disabled || all.length === 0) return;
    // A message carries at most MAX_ATTACHMENTS cards (ChatContext): the rest are not added, and the panel says so.
    const held = shownDrafts.reduce((n, d) => n + ('adding' in d ? d.adding : 1), 0);
    const items = all.slice(0, Math.max(0, MAX_ATTACHMENTS - held));
    setAttachNote(
      items.length < all.length
        ? `A message holds at most ${MAX_ATTACHMENTS} attachments; ${all.length - items.length} not added.`
        : undefined,
    );
    if (items.length === 0) return;
    const key = `a${nextDraft.current++}`;
    setDrafts((list) => [...list, { key, adding: items.length }]);
    void onAttach(items).then(
      (ids) =>
        setDrafts((list) =>
          list.flatMap((d) =>
            d.key !== key
              ? [d]
              : ids
                  .filter((id) => !list.some((x) => 'id' in x && x.id === id))
                  .map((id, i) => ({ key: `${key}-${i}`, id })),
          ),
        ),
      () => setDrafts((list) => list.filter((d) => d.key !== key)),
    );
  };
  const dropProps = {
    'data-drop-zone': 'chat',
    'data-drop-active': dropping || undefined,
    onDragOver: (e: ReactDragEvent<HTMLElement>) => {
      if (!onAttach || !accepts(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropping(true);
    },
    onDragLeave: (e: ReactDragEvent<HTMLElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDropping(false);
    },
    onDrop: (e: ReactDragEvent<HTMLElement>) => {
      setDropping(false);
      if (!onAttach || !accepts(e.dataTransfer)) return;
      e.preventDefault();
      setOpen(true);
      attach(itemsFromTransfer(e.dataTransfer));
    },
  };
  /** Files pasted anywhere in the panel are attached; pasted text stays text in the input. */
  const onPaste = (e: ReactClipboardEvent<HTMLElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!onAttach || files.length === 0) return;
    e.preventDefault();
    attach(files.map((file) => ({ kind: 'file', file })));
  };

  const choose = (m: Mention) => {
    if (!mention) return;
    const before = text.slice(0, mention.start).replace(/\s$/, '');
    const after = text.slice(caret);
    const next = `${before}${before && after && !after.startsWith(' ') ? ' ' : ''}${after.replace(/^\s/, before ? ' ' : '')}`;
    const value = next.trimStart();
    const at = Math.min(before.length + (before ? 1 : 0), value.length);
    setText(value);
    setCaret(at);
    if (!context.includes(m.id)) onContext([...context, m.id]);
    // Put the caret where the mention was once React has written the new value (unless the user typed meanwhile).
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el || el.value !== value) return;
      el.focus();
      el.setSelectionRange(at, at);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && mentions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setPick((p) => (p + (e.key === 'ArrowDown' ? 1 : mentions.length - 1)) % mentions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        choose(mentions[pick] ?? mentions[0]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setText((t) => t.slice(0, mention.start) + t.slice(caret));
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
      return;
    }
    if (e.key === 'ArrowUp' && !text) {
      const last = lastUserText(conversation) ?? pending.at(-1)?.text;
      if (last) {
        e.preventDefault();
        setText(last);
        requestAnimationFrame(() => input.current?.setSelectionRange(last.length, last.length));
      }
    }
  };

  // Attributes the e2e tests read (turn, agents state, stop time) without extra visible chrome.
  const state = {
    'data-turn': turn,
    'data-agents-state': agents?.state ?? 'unknown',
    'data-stop-ms': agents?.stopMs ?? '',
  };
  const workingCount = TEAM.filter((a) => working(team[a])).length + (running ? 1 : 0);

  if (!open) {
    return (
      <button
        type="button"
        ref={pill}
        className={s.chatPill}
        data-testid="chat-pill"
        aria-label="Open conversation"
        aria-expanded={false}
        aria-controls="conversation-rail"
        onKeyDown={railKeys}
        onClick={() => setOpen(true)}
        {...dropProps}
        {...state}
      >
        <span aria-hidden="true" className={s.chatPillIcon}>
          <ChatIcon />
        </span>
        Conversation
        {workingCount > 0 && (
          <span className={s.chatPillBadge} data-testid="chat-pill-count">
            {workingCount} {workingCount === 1 ? 'agent' : 'agents'}
          </span>
        )}
      </button>
    );
  }

  const showStop = anyWorking && !text.trim() && shownDrafts.length === 0;
  // Orb's reply being streamed (in its block, above the block's "On the board" group) and the typing dots.
  const liveNode = (
    <>
      {live && live.text && (
        <div className={s.agentMessage} data-testid="orb-chat-reply" data-live="true">
          <ChatMarkdown text={live.text} />
        </div>
      )}
      {conversation.running && !conversation.live?.thread && (
        <span className={s.typing} aria-label="Agent is typing">
          <span style={{ background: '#60A5FA' }} />
          <span style={{ background: '#3D5DCF' }} />
          <span style={{ background: 'rgba(61,93,207,0.5)' }} />
        </span>
      )}
    </>
  );
  return (
    <aside
      id="conversation-rail"
      data-panel="chat"
      data-testid="chat-panel"
      className={dropping ? `${s.chat} ${s.chatDropping}` : s.chat}
      aria-label="Conversation"
      onKeyDown={railKeys}
      onPaste={onPaste}
      {...dropProps}
      {...state}
    >
      {dropping && (
        <div className={s.chatDropHint} data-testid="chat-drop-target" aria-hidden="true">
          <PaperclipIcon size={20} />
          Drop to attach to your message
        </div>
      )}
      <div className={s.chatHeader}>
        <div className={s.chatHeaderLeft}>
          <div className={s.avatars}>
            {TEAM.map((agent) => {
              const st = team[agent];
              const c = AGENT_COLORS[agent];
              return (
                <button
                  type="button"
                  key={agent}
                  title={`${AGENT_LABELS[agent]}: ${stateText(st)}`}
                  aria-label={`${AGENT_LABELS[agent]} controls`}
                  aria-haspopup="menu"
                  aria-expanded={menu === agent}
                  className={s.avatar}
                  data-testid="agent-avatar"
                  data-agent={agent}
                  data-state={st?.state ?? 'none'}
                  style={{ background: c.bg, color: c.fg }}
                  onClick={() => setMenu((m) => (m === agent ? null : agent))}
                >
                  {c.letter}
                </button>
              );
            })}
          </div>
          <div className={s.chatTitles}>
            <span className={s.chatTitle}>Conversation</span>
            <span className={s.chatSubtitle} data-testid="chat-activity">
              {activityLine(agents, team, running)}
            </span>
          </div>
        </div>
        <div className={s.chatHeaderRight}>
          <button
            type="button"
            aria-label="Agent controls"
            aria-haspopup="menu"
            aria-expanded={menu === 'all'}
            className={s.iconButtonSmall}
            data-testid="chat-menu"
            onClick={() => setMenu((m) => (m === 'all' ? null : 'all'))}
          >
            <MoreIcon size={16} />
          </button>
          <button
            type="button"
            aria-label="Minimise conversation"
            title="Collapse conversation"
            aria-expanded={true}
            aria-controls="conversation-rail"
            className={s.iconButton}
            data-testid="chat-minimise"
            onClick={() => setOpen(false)}
          >
            <ChevronDownIcon />
          </button>
        </div>
        {menu && menu !== 'all' && (
          <AgentMenu agent={menu} status={team[menu]} onControl={onControl} onClose={() => setMenu(null)} />
        )}
        {menu === 'all' && (
          <AllMenu onClose={() => setMenu(null)}>
            {loadCost && <CostMeter load={loadCost} />}
            <button
              type="button"
              role="menuitem"
              className={s.menuItem}
              data-testid="pause-all"
              onClick={() => {
                onControl('all', 'pause');
                setMenu(null);
              }}
            >
              <PauseIcon size={14} />
              Pause all
            </button>
            <button
              type="button"
              role="menuitem"
              className={s.menuItem}
              data-testid="resume-all"
              onClick={() => {
                onControl('all', 'resume');
                setMenu(null);
              }}
            >
              <PlayIcon size={14} />
              Resume all
            </button>
            <button
              type="button"
              role="menuitem"
              className={s.menuItem}
              data-testid="stop-all"
              onClick={() => {
                onControl('all', 'stop');
                setMenu(null);
              }}
            >
              <StopIcon size={12} />
              Stop all
            </button>
            <button
              type="button"
              role="menuitem"
              className={s.menuItem}
              data-testid="stop-orb"
              disabled={!running}
              onClick={() => {
                onControl('orb', 'stop');
                setMenu(null);
              }}
            >
              <StopIcon size={12} />
              Stop orb
            </button>
            <button
              type="button"
              role="menuitem"
              className={s.menuItem}
              data-testid="pause-orb"
              onClick={() => {
                onControl('orb', agents?.state === 'paused' ? 'resume' : 'pause');
                setMenu(null);
              }}
            >
              {agents?.state === 'paused' ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
              {agents?.state === 'paused' ? 'Resume orb' : 'Pause orb'}
            </button>
            {redirectOrb ? (
              <RedirectBox agent="orb" onControl={onControl} onClose={() => setMenu(null)} />
            ) : (
              <button
                type="button"
                role="menuitem"
                className={s.menuItem}
                data-testid="redirect-orb"
                onClick={() => setRedirectOrb(true)}
              >
                <SendIcon size={13} />
                Redirect orb…
              </button>
            )}
          </AllMenu>
        )}
      </div>
      <ReadingQueue cards={Object.values(board.cards)} onPick={onOpenCard} />
      <ConversationBoard
        board={board}
        context={context}
        onContext={onContext}
        onShowItem={onShowItem}
        onOpenCard={onOpenCard}
      />
      <ResearchProgress coverage={agents?.research} working={anyWorking} onShowFrame={onShowItem} />
      <div
        className={s.chatBody}
        ref={body}
        data-testid="chat-body"
        aria-live="polite"
        role="log"
        aria-label="Conversation history"
        tabIndex={0}
        onScroll={(event) => {
          const el = event.currentTarget;
          scrollTop.current = el.scrollTop;
          followTail.current = el.scrollHeight - el.clientHeight - el.scrollTop < 48;
        }}
      >
        {blocks.length === 0 && pending.length === 0 && !live && !error && (
          <div className={s.chatEmpty} data-testid="chat-empty">
            <OrbMark size={32} />
            <p>Ask orb to research something. Cards it finds land on the board.</p>
          </div>
        )}
        {blocks.map((block, index) => {
          const lines = activityBetween(board, block.from, block.to);
          const lastBlock = index === blocks.length - 1;
          return (
            <div key={`t${block.turn}`} className={s.turnBlock} data-testid="chat-turn">
              {block.items.map((item) =>
                item.kind === 'user' ? (
                  <div key={item.key} className={s.userMessage} data-testid="chat-user-message">
                    <ChatMarkdown text={item.text} />
                    {item.attachments && (
                      <MessageAttachments list={item.attachments} board={board} onShowItem={onShowItem} />
                    )}
                    {item.context && <span className={s.userContext}>{item.context} in context</span>}
                  </div>
                ) : (
                  <div
                    key={item.key}
                    className={s.agentMessage}
                    data-testid={
                      !live && item.key === lastAssistant ? 'orb-chat-reply' : 'chat-assistant-message'
                    }
                  >
                    <ChatMarkdown text={item.text} />
                  </div>
                ),
              )}
              {lastBlock && pending.length === 0 && liveNode}
              {lines.length > 0 && (
                <div className={s.activity} data-testid="chat-on-board" aria-label="On the board">
                  <span className={s.activityHead}>On the board</span>
                  {lines.map((line) => (
                    <div
                      key={line.key}
                      className={s.activityLine}
                      data-testid="activity-line"
                      data-agent={line.agent}
                    >
                      <span
                        className={s.agentDot}
                        style={{ background: AGENT_COLORS[line.agent].bg }}
                        aria-hidden="true"
                      />
                      <span className={s.activityText}>
                        {line.text}
                        {line.items.length > 0 && (
                          <span className={s.activityLinks}>
                            {line.items.slice(0, 6).map((it) => (
                              <button
                                type="button"
                                key={it.id}
                                className={s.activityLink}
                                data-testid="activity-link"
                                data-item-id={it.id}
                                title={it.title}
                                onClick={() => onShowItem(it.id)}
                              >
                                {it.title}
                              </button>
                            ))}
                            {line.items.length > 6 && (
                              <span className={s.activityMore}>+{line.items.length - 6}</span>
                            )}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {pending.map((m) => (
          <div
            key={`p${m.id}`}
            className={`${s.userMessage} ${s.userQueued}`}
            data-testid="chat-user-message"
            data-queued="true"
          >
            <ChatMarkdown text={m.text} />
            {m.attachments && (
              <MessageAttachments list={m.attachments} board={board} onShowItem={onShowItem} />
            )}
          </div>
        ))}
        {blocks.length > 0 && pending.length > 0 && liveNode}
        {blocks.length === 0 && liveNode}
        {approvals.map((a) => (
          <div
            key={a.id}
            className={s.approval}
            data-testid="parallel-prompt"
            role="group"
            aria-label="Cost approval"
          >
            <p className={s.approvalText}>{a.text}</p>
            <div className={s.approvalActions}>
              <button
                type="button"
                className={s.approvalButton}
                data-testid="parallel-prompt-approve"
                onClick={() => onConfirmParallel?.(a.id, true)}
              >
                Approve
              </button>
              <button
                type="button"
                className={s.approvalButton}
                data-testid="parallel-prompt-decline"
                onClick={() => onConfirmParallel?.(a.id, false)}
              >
                Decline
              </button>
              <button type="button" className={s.approvalButton} onClick={() => onShowItem(a.id)}>
                Show
              </button>
            </div>
          </div>
        ))}
        {error && (
          <p className={s.chatError} data-testid="orb-error" role="alert">
            {error}
          </p>
        )}
        {attachNote && (
          <p className={s.chatError} data-testid="attach-note" role="alert">
            {attachNote}
          </p>
        )}
      </div>
      <form className={s.chatFooter} onSubmit={(e) => void submit(e)}>
        {usingPlan && (
          <a
            className={s.costNote}
            href="https://chatgpt.com/settings/usage"
            target="_blank"
            rel="noreferrer"
            data-testid="chatgpt-usage"
          >
            Using ChatGPT plan · Manage usage
          </a>
        )}
        {followUps && followUps.length > 0 && (
          <div
            className={s.followRow}
            data-testid="followup-chips"
            role="group"
            aria-label="Suggested next steps"
          >
            {followUps.map((f) => (
              <button
                key={f.label}
                type="button"
                className={s.followChip}
                data-testid="followup-chip"
                title={f.prompt}
                disabled={disabled}
                onClick={() => {
                  setText(f.prompt);
                  setCaret(f.prompt.length);
                  input.current?.focus();
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
        {shownDrafts.length > 0 && (
          <div className={s.contextRow} data-testid="attachment-chips">
            {shownDrafts.map((d) =>
              'id' in d ? (
                <span
                  key={d.key}
                  className={`${s.contextChip} ${s.attachmentChip}`}
                  data-testid="attachment-chip"
                  data-item-id={d.id}
                  data-state="ready"
                >
                  <button
                    type="button"
                    className={s.contextChipLabel}
                    onClick={() => onShowItem(d.id)}
                    title="Show on the board"
                  >
                    <PaperclipIcon size={12} />
                    {cardTitle(board.cards[d.id]!)}
                  </button>
                  <button
                    type="button"
                    className={s.contextChipRemove}
                    aria-label={`Do not attach ${cardTitle(board.cards[d.id]!)}`}
                    data-testid="attachment-chip-remove"
                    onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}
                  >
                    <CloseIcon size={10} />
                  </button>
                </span>
              ) : (
                <span
                  key={d.key}
                  className={`${s.contextChip} ${s.attachmentChip}`}
                  data-testid="attachment-chip"
                  data-state="adding"
                  role="status"
                >
                  <span className={s.contextChipLabel}>
                    <PaperclipIcon size={12} />
                    {d.adding === 1 ? 'Adding to the board…' : `Adding ${d.adding} files…`}
                  </span>
                </span>
              ),
            )}
          </div>
        )}
        {context.length > 0 && (
          <div className={s.contextRow} data-testid="context-chips">
            {context.map((id) => (
              <span key={id} className={s.contextChip} data-testid="context-chip" data-item-id={id}>
                <button
                  type="button"
                  className={s.contextChipLabel}
                  onClick={() => onShowItem(id)}
                  title="Show on the board"
                >
                  <span aria-hidden="true" className={s.contextDot} />
                  {contextTitle(board, id)}
                </button>
                <button
                  type="button"
                  className={s.contextChipRemove}
                  aria-label={`Remove ${contextTitle(board, id)} from context`}
                  data-testid="context-chip-remove"
                  onClick={() => onContext(context.filter((c) => c !== id))}
                >
                  <CloseIcon size={10} />
                </button>
              </span>
            ))}
            <span className={s.contextLabel}>in context</span>
          </div>
        )}
        {mention && mentions.length > 0 && (
          <div className={s.mentions} role="listbox" aria-label="Add to context" data-testid="mention-list">
            {mentions.map((m, i) => (
              <button
                type="button"
                role="option"
                aria-selected={i === pick}
                key={m.id}
                className={i === pick ? `${s.mention} ${s.mentionActive}` : s.mention}
                data-testid="mention-option"
                data-item-id={m.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(m)}
              >
                <span className={s.mentionKind}>{m.kind === 'frame' ? 'Frame' : 'Card'}</span>
                {m.title}
              </button>
            ))}
          </div>
        )}
        <div className={s.inputRow}>
          {onAttach && (
            <>
              <button
                type="button"
                aria-label="Attach a file"
                title="Attach a file"
                className={`${s.roundButton} ${s.attachButton}`}
                data-testid="chat-attach"
                disabled={disabled}
                onClick={() => filePicker.current?.click()}
              >
                <PaperclipIcon />
              </button>
              <input
                ref={filePicker}
                type="file"
                multiple
                hidden
                accept={ATTACH_ACCEPT}
                data-testid="chat-attach-input"
                onChange={(e) => {
                  const files = Array.from(e.currentTarget.files ?? []);
                  e.currentTarget.value = '';
                  attach(files.map((file) => ({ kind: 'file', file })));
                  input.current?.focus();
                }}
              />
            </>
          )}
          <label htmlFor="orb-convo" className="orb-sr-only">
            Message the agent
          </label>
          <textarea
            id="orb-convo"
            ref={input}
            data-testid="orb-chat-input"
            className={s.chatInput}
            rows={1}
            placeholder="Ask about this board…"
            autoComplete="off"
            value={text}
            disabled={disabled}
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            aria-label="Compose output"
            title="Compose output"
            className={s.roundButton}
            onClick={onCompose}
          >
            <ComposeIcon />
          </button>
          {showStop ? (
            <button
              type="button"
              aria-label="Stop agents"
              title="Stop agents"
              data-testid="orb-stop"
              className={s.stopButton}
              disabled={stopping}
              onClick={onStop}
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              data-testid="orb-chat-send"
              className={s.sendButton}
              disabled={disabled || adding}
            >
              <SendIcon />
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}
