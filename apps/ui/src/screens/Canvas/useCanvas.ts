import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type {
  AgentControlArgs,
  AgentName,
  BoardState,
  Card,
  SessionAddress,
  SessionWireEvent,
} from '@orb/shared';
import { createBoardStore, type BoardStore } from '../../store/board.js';
import { isWireError, type AgentStatus, type CanvasMeta, type Wire } from '../../wire/index.js';
import {
  ConversationTracker,
  emptyConversation,
  type Attachment,
  type ConversationState,
} from './conversation.js';

export type FollowState = 'idle' | 'connecting' | 'open' | 'ended' | 'error';
export type SaveState = 'saved' | 'saving' | 'error';

/**
 * A message the user sent from this window that the session has not shown yet (queued behind a running turn). The
 * session's own `user/message` replaces it once Orb takes it.
 */
export type PendingMessage = { id: number; text: string; at: number; attachments?: Attachment[] };

/** P6.1: the text sent for a message that has attachments and no text of its own. */
export const attachedOnlyText = (n: number) =>
  n === 1 ? 'See the attached file.' : 'See the attached files.';

/** The session events of the turn that produced an agent card (P3.6 provenance detail). */
export type TurnDetail = { events: SessionWireEvent[]; hasMore: boolean };

export type CanvasModel = {
  meta?: CanvasMeta;
  follow: FollowState;
  /** Follow frames received (snapshot + events). */
  frames: number;
  /** `N cards, next seq M` of the board snapshot, once received. */
  snapshot?: string;
  /** The confirmed board (the fold of the follow stream; optimistic changes are in `store`). */
  board: BoardState;
  /** The board store (P2.3): confirmed board, optimistic commands, selection. */
  store: BoardStore;
  /** The root Orb session's conversation (P3.6: messages, turns, the reply being streamed). */
  conversation: ConversationState;
  /** Sent messages the session has not shown yet. */
  pending: PendingMessage[];
  /** Orb's state (P1.10). */
  agents?: AgentStatus;
  /** P3.6: every agent's last state (Orb and its children), for cursors and the avatars. */
  team: Partial<Record<AgentName, AgentStatus>>;
  save: SaveState;
  stopping: boolean;
  error?: string;
  /** P3.6: frames and cards in context (the chip above the input; @ mentions add to it). */
  context: string[];
  setContext(ids: string[]): void;
  /** Send a message with the context and, P6.1, the cards attached in the composer (`attachments`). */
  send(text: string, attachments?: readonly Attachment[]): Promise<boolean>;
  /** P3.6: a message in the thread of card or frame `of` (grounded in it; stored in board.jsonl). */
  sendThread(of: string, text: string): Promise<boolean>;
  stop(): Promise<void>;
  /** P3.6/P3.7: stop / pause / resume / redirect (with `text`) one agent or all (`agents.control`). */
  control(
    agent: AgentControlArgs['agent'],
    action: AgentControlArgs['action'],
    text?: string,
  ): Promise<boolean>;
  /** P3.6: the session events of the turn that produced an agent card (`session/page` through its eventSeq). */
  loadTurn(card: Card): Promise<TurnDetail>;
  rename(title: string): Promise<boolean>;
};

/** Retry a stream that fails with a retryable wire error (socket loss) until `signal` aborts. */
async function retrying(signal: AbortSignal, run: () => Promise<void>, report: (e: unknown) => void) {
  while (!signal.aborted) {
    try {
      await run();
    } catch (e) {
      if (signal.aborted) return;
      if (!isWireError(e) || !e.retryable) return report(e);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Everything the Canvas screen shows for one canvas: `orb/canvas.open` (resumes the root agent), the board stream
 * folded with the shared fold, the root agent's session reply (`session/follow`) and `orb/agents.status`.
 * The board lives in a Zustand board store (P2.3, src/store/board.ts) that also applies commands optimistically.
 */
export function useCanvas(wire: Wire, canvasId: string): CanvasModel {
  const [meta, setMeta] = useState<CanvasMeta>();
  const [follow, setFollow] = useState<FollowState>('idle');
  const [frames, setFrames] = useState(0);
  const [snapshot, setSnapshot] = useState<string>();
  // One store per canvas; commands go to orb/board.command.
  const store = useMemo(
    () => createBoardStore(canvasId, (command) => wire.orb.board.command(canvasId, command)),
    [wire, canvasId],
  );
  const board = useStore(store, (st) => st.confirmed);
  const boardError = useStore(store, (st) => st.error);
  const pendingCount = useStore(store, (st) => st.pending.length + st.historyBusy);
  const [conversation, setConversation] = useState<ConversationState>(emptyConversation);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [team, setTeam] = useState<Partial<Record<AgentName, AgentStatus>>>({});
  const [context, setContext] = useState<string[]>([]);
  const agents = team.orb;
  const [save, setSave] = useState<SaveState>('saved');
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string>();
  const nextId = useRef(0);

  const report = useCallback(
    (e: unknown) => setError(isWireError(e) ? `${e.code}: ${e.message}` : String(e)),
    [],
  );

  useEffect(() => {
    const ac = new AbortController();
    const { signal } = ac;
    setMeta(undefined);
    setFollow('connecting');
    setFrames(0);
    setSnapshot(undefined);
    setConversation(emptyConversation());
    setPending([]);
    setTeam({});
    setContext([]);
    setError(undefined);

    const followBoard = async () => {
      try {
        for await (const frame of wire.orb.board.follow(canvasId, { signal })) {
          setFollow('open');
          setFrames((n) => n + 1);
          if (frame.kind === 'snapshot')
            setSnapshot(`${frame.cards.length} cards, next seq ${frame.nextSeq}`);
          store.getState().receive(frame);
        }
        if (!signal.aborted) setFollow('ended');
      } catch (e) {
        if (signal.aborted) return;
        setFollow('error');
        report(e);
      }
    };

    void (async () => {
      let opened: CanvasMeta;
      try {
        // Opening resumes the root agent's persisted session before answering (P1.9).
        opened = await wire.orb.canvas.open(canvasId, signal);
      } catch (e) {
        if (!signal.aborted) {
          setFollow('error');
          report(e);
        }
        return;
      }
      if (signal.aborted) return;
      setMeta(opened);
      void followBoard();
      void retrying(
        signal,
        async () => {
          // P3.4: the stream carries every agent of the canvas (P3.6: cursors, avatars, Orb's state).
          for await (const status of wire.orb.agents.status(canvasId, { signal }))
            setTeam((cur) => ({ ...cur, [status.agent]: status }));
        },
        report,
      );
      const sessionId = opened.rootSessionId;
      if (sessionId) {
        void retrying(
          signal,
          async () => {
            const tracker = new ConversationTracker();
            for await (const frame of wire.session.follow(sessionId, { signal }))
              setConversation(tracker.push(frame));
          },
          report,
        );
      }
    })();
    return () => ac.abort();
  }, [wire, canvasId, report, store]);

  const send = useCallback(
    async (text: string, attachments: readonly Attachment[] = []) => {
      const st = store.getState();
      const state = st.board;
      // Context (and attachments) that no longer exist on the board are dropped rather than refused.
      const live = context.filter((id) => (id.startsWith('f_') ? id in state.frames : id in state.cards));
      const attached = attachments
        .map((a) => ({ ...a, id: st.resolve(a.id) }))
        .filter((a) => a.id in state.cards && !a.id.includes('_pending-'));
      const trimmed = text.trim() || (attached.length > 0 ? attachedOnlyText(attached.length) : '');
      if (!meta || !trimmed) return false;
      setError(undefined);
      const frameIds = live.filter((id) => id.startsWith('f_'));
      const cardIds = live.filter((id) => id.startsWith('c_'));
      const attachmentIds = attached.map((a) => a.id);
      const hasContext = frameIds.length + cardIds.length + attachmentIds.length > 0;
      try {
        await wire.orb.chat.send(meta.id, {
          text: trimmed,
          ...(hasContext
            ? {
                context: {
                  ...(frameIds.length ? { frameIds } : {}),
                  ...(cardIds.length ? { cardIds } : {}),
                  ...(attachmentIds.length ? { attachmentIds } : {}),
                },
              }
            : {}),
        });
        if (live.length !== context.length) setContext(live);
        setPending((list) => [
          ...list,
          {
            id: nextId.current++,
            text: trimmed,
            at: Date.now(),
            ...(attached.length > 0 ? { attachments: attached } : {}),
          },
        ]);
        return true;
      } catch (e) {
        report(e);
        return false;
      }
    },
    [wire, meta, report, context, store],
  );

  const sendThread = useCallback(
    async (of: string, text: string) => {
      const trimmed = text.trim();
      if (!meta || !trimmed) return false;
      setError(undefined);
      try {
        await wire.orb.chat.send(meta.id, { text: trimmed, threadOf: of });
        return true;
      } catch (e) {
        report(e);
        return false;
      }
    },
    [wire, meta, report],
  );

  /**
   * P3.7: the UI changes state at once (PRD: every agent's UI state is stopped within one second): the addressed
   * agents read `stopping` / `paused` until `agents.status` publishes their real state a few ms later. Returns an
   * undo for a control call that fails (nothing is published then): each agent still showing the optimistic state
   * gets its previous status back.
   */
  const optimistic = useCallback((agent: AgentControlArgs['agent'], state: 'stopping' | 'paused') => {
    const changed = new Map<AgentName, { prev: AgentStatus; shown: AgentStatus }>();
    setTeam((cur) => {
      const next = { ...cur };
      for (const [name, st] of Object.entries(cur) as Array<[AgentName, AgentStatus]>) {
        if (agent !== 'all' && agent !== name) continue;
        if (state === 'stopping' && st.state !== 'running' && st.state !== 'paused') continue;
        if (st.state === state) continue;
        const shown = { ...st, state, at: Date.now() };
        changed.set(name, { prev: st, shown });
        next[name] = shown;
      }
      return next;
    });
    return () =>
      setTeam((cur) => {
        const next = { ...cur };
        for (const [name, { prev, shown }] of changed) if (cur[name] === shown) next[name] = prev;
        return next;
      });
  }, []);

  const stop = useCallback(async () => {
    if (!meta) return;
    setError(undefined);
    setStopping(true);
    const undo = optimistic('all', 'stopping');
    try {
      await wire.orb.agents.control(meta.id, { agent: 'all', action: 'stop' });
    } catch (e) {
      undo();
      report(e);
    } finally {
      setStopping(false);
    }
  }, [wire, meta, report, optimistic]);

  const control = useCallback(
    async (agent: AgentControlArgs['agent'], action: AgentControlArgs['action'], text?: string) => {
      if (!meta) return false;
      setError(undefined);
      const all = agent === 'all' && action === 'stop';
      if (all) setStopping(true);
      const undo =
        action === 'stop'
          ? optimistic(agent, 'stopping')
          : action === 'pause'
            ? optimistic(agent, 'paused')
            : undefined;
      try {
        await wire.orb.agents.control(meta.id, { agent, action, ...(text ? { text } : {}) });
        return true;
      } catch (e) {
        undo?.();
        report(e);
        return false;
      } finally {
        if (all) setStopping(false);
      }
    },
    [wire, meta, report, optimistic],
  );

  const loadTurn = useCallback(
    async (card: Card): Promise<TurnDetail> => {
      const p = card.provenance;
      if (p.kind !== 'agent' || p.eventSeq === undefined || !meta?.rootSessionId)
        return { events: [], hasMore: false };
      const address: SessionAddress =
        p.sessionId === meta.rootSessionId
          ? { kind: 'session', sessionId: p.sessionId }
          : {
              kind: 'subagent',
              parentSessionId: meta.rootSessionId,
              childSessionId: p.sessionId,
              mode: 'continuable',
            };
      const page = await wire.session.page({
        address,
        throughSeq: p.eventSeq,
        maxMessages: 40,
        turnWindow: { minMessages: 1, minTurns: 1 },
      });
      return { events: page.records.map((r) => r.event), hasMore: page.hasMore };
    },
    [wire, meta],
  );

  const rename = useCallback(
    async (title: string) => {
      const trimmed = title.trim();
      if (!meta || !trimmed || trimmed === meta.title) return false;
      setSave('saving');
      try {
        setMeta(await wire.orb.canvas.rename(meta.id, { title: trimmed }));
        setSave('saved');
        return true;
      } catch (e) {
        setSave('error');
        report(e);
        return false;
      }
    },
    [wire, meta, report],
  );

  // A sent message is shown from the session once Orb takes it (its user/message event, same text, after it was sent).
  const visiblePending = useMemo(() => {
    const seen = conversation.items.filter((i) => i.kind === 'user' && !i.thread);
    const used = new Set<number>();
    return pending.filter((m) => {
      const match = seen.findIndex((i, n) => !used.has(n) && i.text === m.text && i.at >= m.at - 60_000);
      if (match < 0) return true;
      used.add(match);
      return false;
    });
  }, [pending, conversation.items]);

  // "Saving…" while a rename or a board command is in flight; "Not saved" after a rejected one.
  const saveState: SaveState =
    save === 'saving' || pendingCount > 0 ? 'saving' : save === 'error' || boardError ? 'error' : 'saved';

  return {
    meta,
    follow,
    frames,
    snapshot,
    board,
    store,
    conversation,
    pending: visiblePending,
    ...(agents ? { agents } : {}),
    team,
    save: saveState,
    stopping,
    error: error ?? boardError,
    context,
    setContext,
    send,
    sendThread,
    stop,
    control,
    loadTurn,
    rename,
  };
}
