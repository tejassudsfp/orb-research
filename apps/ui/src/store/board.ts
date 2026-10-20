/**
 * The board store (BUILD_PLAN P2.3): a Zustand store per open canvas.
 *
 * - `confirmed` is the fold of the `orb/board.follow` stream (snapshot, then events) with the shared fold.
 * - `dispatch(command)` is optimistic: the command is planned locally with the shared `planCommand` (temporary ids
 *   `c_pending-<pendingId>-<n>`), shown at once, and sent to `orb/board.command` with its `pendingId`. The service
 *   echoes the `pendingId` on the events it wrote; when the command's final event is folded (or the reply arrives
 *   and `confirmed` has reached its last seq) the optimistic copy is dropped. A rejected command is rolled back.
 * - `preview` is the live, uncommitted geometry of a gesture (drag, resize). It is never sent: a gesture commits
 *   ONE command on release.
 * - `undo()` / `redo()` (P2.4) ask the service to undo or redo the user's last action (the service keeps the stack and
 *   appends compensating events, which arrive on the follow stream like any other). They are not optimistic: they
 *   first wait for the commands in flight, so they act on what the user sees; commands sent meanwhile wait for them.
 * - `board` (what the renderer draws) = `confirmed` + pending commands + preview. Untouched cards and frames keep
 *   their identity, so memoised cards do not re-render.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  BoardCommand,
  applyChanges,
  applyEvent,
  emptyBoard,
  planCommand,
  type BoardChange,
  type BoardCommandInput,
  type BoardCommandRequestInput,
  type BoardCommandResult,
  type BoardHistoryDepth,
  type BoardEvent,
  type BoardFollowFrame,
  type BoardState,
  type Card,
  type Frame,
} from '@orb/shared';

export type Pending = {
  pendingId: string;
  command: BoardCommand;
  /** The optimistic changes (temporary ids until the real ones are known). */
  changes: BoardChange[];
  /** Temporary ids this command minted, in mint order (= the order of the `*.added` events the service writes). */
  tempIds: string[];
  /** Seq of the last event the service wrote, once the reply arrived. */
  lastSeq?: number;
};

/** Live geometry of a gesture, keyed by id (cards and frames). */
export type Preview = {
  cards?: Record<string, Partial<Pick<Card, 'x' | 'y' | 'w' | 'h'>>>;
  frames?: Record<string, Partial<Pick<Frame, 'x' | 'y' | 'w' | 'h'>>>;
};

export type BoardStoreState = {
  canvasId: string;
  /** The board as the service has written it. */
  confirmed: BoardState;
  /** True once the follow snapshot has been folded. */
  ready: boolean;
  pending: Pending[];
  preview: Preview | null;
  /** confirmed + pending (no gesture preview): what a gesture commits against. */
  base: BoardState;
  /** What to draw: confirmed + pending + preview. */
  board: BoardState;
  /** Selected card, frame and link ids. */
  selection: string[];
  /** Temporary id → real id, for ids minted optimistically. */
  aliases: Record<string, string>;
  /** Real id → the temporary id it replaced: React keys stay stable, so an item never remounts on reconcile. */
  keys: Record<string, string>;
  /** Last command error (rolled back). */
  error?: string;
  /** Undo/redo depth reported by the service after the last command (unknown until the first one). */
  history?: BoardHistoryDepth;
  /** Undo or redo requests in flight. */
  historyBusy: number;

  receive(frame: BoardFollowFrame): void;
  /** Apply `command` optimistically and send it. Resolves false when it was rejected (and rolled back). */
  dispatch(
    command: BoardCommandInput,
    options?: {
      clearPreview?: boolean;
      select?: 'created';
      /** P6.1: told the temporary ids the command mints, in order, before it is sent (`resolve` maps them later). */
      onPlanned?: (tempIds: readonly string[]) => void;
    },
  ): Promise<boolean>;
  /** Undo the user's last action. Resolves false when there was nothing to undo (or it failed). */
  undo(): Promise<boolean>;
  /** Redo the last undone action. Resolves false when there was nothing to redo (or it failed). */
  redo(): Promise<boolean>;
  setPreview(preview: Preview | null): void;
  select(ids: string[], mode?: 'replace' | 'toggle' | 'add'): void;
  /** The real id of `id` if it was a temporary one that is now known. */
  resolve(id: string): string;
};

export type SendCommand = (command: BoardCommandRequestInput) => Promise<BoardCommandResult>;

const TEMP = /^([cfl])_pending-(.+)-(\d+)$/;
export const isTempId = (id: string) => TEMP.test(id);
const pendingOfTemp = (id: string) => TEMP.exec(id)?.[2];

/** Replace every string in `value` that is a known temporary id (deep, structural). */
export function remapIds<T>(value: T, aliases: Record<string, string>): T {
  if (typeof value === 'string') return (aliases[value] ?? value) as T;
  if (Array.isArray(value)) return value.map((v) => remapIds(v, aliases)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = remapIds(v, aliases);
    return out as T;
  }
  return value;
}

/** Ids of the items a list of events added, in order. */
const addedIds = (events: readonly BoardEvent[]) =>
  events.flatMap((e) => {
    const d = e.data as { frame?: { id: string }; card?: { id: string }; link?: { id: string } };
    if (e.type === 'frame.added') return [d.frame!.id];
    if (e.type === 'card.added') return [d.card!.id];
    if (e.type === 'link.added') return [d.link!.id];
    return [];
  });

function withPreview(state: BoardState, preview: Preview | null): BoardState {
  if (!preview) return state;
  let { cards, frames } = state;
  if (preview.cards) {
    cards = { ...cards };
    for (const [id, p] of Object.entries(preview.cards)) if (cards[id]) cards[id] = { ...cards[id], ...p };
  }
  if (preview.frames) {
    frames = { ...frames };
    for (const [id, p] of Object.entries(preview.frames))
      if (frames[id]) frames[id] = { ...frames[id], ...p };
  }
  return { ...state, cards, frames };
}

function withPending(confirmed: BoardState, pending: readonly Pending[]): BoardState {
  return pending.length > 0
    ? applyChanges(
        confirmed,
        pending.flatMap((p) => p.changes),
      )
    : confirmed;
}

let pendingCounter = 0;
const newPendingId = () => `p${(++pendingCounter).toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export type BoardStore = StoreApi<BoardStoreState>;

export function createBoardStore(canvasId: string, send: SendCommand): BoardStore {
  /** Settles when a pending command's reply arrived (or it failed): commands using its temp ids wait for it. */
  const replies = new Map<string, Promise<void>>();
  /** The last undo/redo request: history requests run one at a time, and commands sent after one wait for it. */
  let historyChain: Promise<unknown> = Promise.resolve();

  return createStore<BoardStoreState>()((set, get) => {
    /** Recompute `board` from the parts (and drop pendings the confirmed board already covers). */
    const commit = (
      partial: Partial<
        Pick<
          BoardStoreState,
          | 'confirmed'
          | 'pending'
          | 'preview'
          | 'selection'
          | 'aliases'
          | 'keys'
          | 'ready'
          | 'history'
          | 'historyBusy'
        >
      > & {
        error?: string | undefined;
      },
    ) => {
      const s = { ...get(), ...partial };
      const pending = s.pending.filter((p) => p.lastSeq === undefined || s.confirmed.seq < p.lastSeq);
      const base = withPending(s.confirmed, pending);
      const board = withPreview(base, s.preview);
      // Items that left the board leave the selection.
      const kept = s.selection.filter((id) => id in board.cards || id in board.frames || id in board.links);
      const selection = kept.length === s.selection.length ? s.selection : kept;
      set({ ...partial, pending, base, board, selection });
    };

    /** Learn real ids for a pending command; rewrite later pendings and the selection to use them. */
    const learn = (pendingId: string, realIds: string[]) => {
      const s = get();
      const p = s.pending.find((x) => x.pendingId === pendingId);
      if (!p || p.tempIds.length === 0) return {};
      const fresh: Record<string, string> = {};
      p.tempIds.forEach((temp, i) => {
        if (realIds[i] && !s.aliases[temp]) fresh[temp] = realIds[i];
      });
      if (Object.keys(fresh).length === 0) return {};
      const keys = { ...s.keys };
      for (const [temp, real] of Object.entries(fresh)) keys[real] = temp;
      return {
        aliases: { ...s.aliases, ...fresh },
        keys,
        // Every pending command (this one included) now uses the real ids: re-applying a confirmed add with the
        // same id is a no-op, so the item keeps its key (no remount) when its event lands.
        pending: s.pending.map((x) => ({ ...x, changes: remapIds(x.changes, fresh) })),
        selection: s.selection.map((id) => fresh[id] ?? id),
      };
    };

    const runHistory = (op: 'undo' | 'redo'): Promise<boolean> => {
      commit({ historyBusy: get().historyBusy + 1, error: undefined });
      // Undo acts on what the service has recorded: the commands already in flight land first.
      const inFlight = [...replies.values()];
      const run = historyChain.then(async () => {
        try {
          await Promise.all(inFlight);
          const result = await send({ type: op });
          commit({ ...(result.history ? { history: result.history } : {}) });
          return result.events.length > 0;
        } catch (e) {
          commit({ error: (e as Error).message });
          return false;
        } finally {
          commit({ historyBusy: get().historyBusy - 1 });
        }
      });
      historyChain = run;
      return run;
    };

    /** Events seen per pendingId on the stream (their added ids map temp → real). */
    const streamed = new Map<string, BoardEvent[]>();

    return {
      canvasId,
      confirmed: emptyBoard(),
      ready: false,
      pending: [],
      preview: null,
      base: emptyBoard(),
      board: emptyBoard(),
      selection: [],
      aliases: {},
      keys: {},
      historyBusy: 0,

      receive(frame) {
        if (frame.kind === 'snapshot') {
          const confirmed: BoardState = {
            seq: frame.nextSeq - 1,
            cards: Object.fromEntries(frame.cards.map((c) => [c.id, c])),
            frames: Object.fromEntries(frame.frames.map((f) => [f.id, f])),
            links: Object.fromEntries(frame.links.map((l) => [l.id, l])),
            ...(frame.threads ? { threads: frame.threads } : {}),
            ...(frame.arrangements ? { arrangements: frame.arrangements } : {}),
          };
          commit({ confirmed, ready: true });
          return;
        }
        const confirmed = applyEvent(get().confirmed, frame.event);
        if (!frame.pendingId) {
          commit({ confirmed });
          return;
        }
        const list = [...(streamed.get(frame.pendingId) ?? []), frame.event];
        if (!frame.final) {
          // A batch's events arrive one by one: learn the real ids of what has landed so far, so an item is never
          // drawn twice (its optimistic copy under the temporary id plus the confirmed one).
          streamed.set(frame.pendingId, list);
          commit({ ...learn(frame.pendingId, addedIds(list)), confirmed });
          return;
        }
        streamed.delete(frame.pendingId);
        const learned = learn(frame.pendingId, addedIds(list));
        const pending = (learned.pending ?? get().pending).filter((p) => p.pendingId !== frame.pendingId);
        commit({ ...learned, confirmed, pending });
      },

      async dispatch(input, options = {}) {
        let command = BoardCommand.parse(input);
        const pendingId = newPendingId();
        const tempIds: string[] = [];
        let changes: BoardChange[];
        try {
          // The user's actor rides on each change, so the optimistic fold marks a dragged card as placed by hand
          // exactly as the confirmed event will (P6.8).
          changes = planCommand(get().base, command, {
            actor: { kind: 'user' },
            now: Date.now(),
            mintId: (prefix) => {
              const id = `${prefix}_pending-${pendingId}-${tempIds.length}`;
              tempIds.push(id);
              return id;
            },
          }).map((c) => ({ ...c, actor: { kind: 'user' as const } }));
        } catch (e) {
          commit({ error: (e as Error).message, ...(options.clearPreview ? { preview: null } : {}) });
          return false;
        }
        options.onPlanned?.([...tempIds]);
        const entry: Pending = { pendingId, command, changes, tempIds };
        commit({
          pending: [...get().pending, entry],
          ...(options.clearPreview ? { preview: null } : {}),
          ...(options.select === 'created' && tempIds[0] ? { selection: [tempIds[0]] } : {}),
          error: undefined,
        });

        // Captured now: this command waits only for undo/redo requested BEFORE it (later ones wait for it).
        const historyBefore = historyChain;
        let settle!: () => void;
        replies.set(pendingId, new Promise<void>((r) => (settle = r)));
        try {
          // Commands that use ids minted by earlier, still pending commands wait for those replies.
          const waits = new Set<string>();
          JSON.stringify(command, (_k, v: unknown) => {
            if (typeof v === 'string') {
              const owner = pendingOfTemp(v);
              if (owner && owner !== pendingId) waits.add(owner);
            }
            return v;
          });
          await Promise.all([...waits].map((w) => replies.get(w)));
          await historyBefore;
          command = remapIds(command, get().aliases);
          const unresolved = JSON.stringify(command).match(/"[cfl]_pending-[^"]+"/);
          if (unresolved) throw new Error(`the item ${unresolved[0]} was not saved`);

          const result = await send({ ...command, pendingId });
          const learned = learn(pendingId, addedIds(result.events));
          const lastSeq = result.events.at(-1)?.seq ?? get().confirmed.seq;
          commit({
            ...learned,
            pending: (learned.pending ?? get().pending).map((p) =>
              p.pendingId === pendingId ? { ...p, lastSeq } : p,
            ),
            ...(result.history ? { history: result.history } : {}),
          });
          return true;
        } catch (e) {
          commit({
            pending: get().pending.filter((p) => p.pendingId !== pendingId),
            selection: get().selection.filter((id) => !tempIds.includes(id)),
            error: (e as Error).message,
          });
          return false;
        } finally {
          settle();
          replies.delete(pendingId);
        }
      },

      undo: () => runHistory('undo'),
      redo: () => runHistory('redo'),

      setPreview(preview) {
        commit({ preview });
      },

      select(ids, mode = 'replace') {
        const current = get().selection;
        let selection: string[];
        if (mode === 'replace') selection = [...new Set(ids)];
        else if (mode === 'add') selection = [...new Set([...current, ...ids])];
        else {
          const toggled = new Set(current);
          for (const id of ids) {
            if (toggled.has(id)) toggled.delete(id);
            else toggled.add(id);
          }
          selection = [...toggled];
        }
        if (selection.length === current.length && selection.every((id, i) => id === current[i])) return;
        set({ selection });
      },

      resolve(id) {
        return get().aliases[id] ?? id;
      },
    };
  });
}
