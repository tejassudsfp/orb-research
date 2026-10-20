/**
 * The canvas service (`ctx.provide('orbCanvas', …)`, see service.ts). Harness-free so it runs in plain Node tests.
 *
 * Layout: `<home>/canvases/<id>/` with `id = <YYYY-MM-DD>-<slug>` (suffix `-2`, `-3`… on collision),
 *   - `canvas.json`: `CanvasMeta` (written atomically: temp file, fsync, rename, fsync dir);
 *   - `board.jsonl`: the board event log (boardLog.ts), the ONLY place board state lives.
 * Each opened board keeps its folded state (the shared fold) in memory and fans new events out to followers.
 */
import { randomBytes } from 'node:crypto';
import { sourceIdentity } from './sourceIdentity.js';
import { mkdir, open as openFile, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  BoardCommand,
  BoardCommandError,
  BoardCommandRequest,
  BoardEvent,
  CanvasCreateArgs,
  CanvasId,
  CanvasCamera,
  CanvasMeta,
  CanvasRenameArgs,
  CanvasSearchArgs,
  TemplateId,
  applyChanges,
  applyEvent,
  boardCards,
  boardFrames,
  boardLinks,
  STACK_LIMITS,
  cardDataSchema,
  cardTitle,
  fold,
  invertChanges,
  isPinned,
  isHistoryCommand,
  isMeasureCommand,
  parseBoardEvent,
  planCommand,
  sameRecords,
  templateFrames,
  templateOf,
  resolveTemplateId,
  specOf,
  validateIntake,
  DEFAULT_DEPTH,
  type Depth,
  type IntakeAnswers,
  type Actor,
  type AssetRef,
  type BoardChange,
  type BoardCommandInput,
  type BoardCommandRequestInput,
  type BoardEventType,
  type BoardHistoryDepth,
  type BoardFollowFrame,
  type BoardState,
  type Card,
  type CanvasSearchResult,
  type CanvasSummary,
  type CardType,
  type Frame,
  type FrameColor,
  type LinkDraft,
  type Link,
  type AgentName,
  type ExportRef,
  type PrintKind,
  type SnapshotRef,
  type CardView,
  type DatabaseData,
  THREAD_MESSAGE_MAX,
} from '@orb/shared';
import { assetFile, collectUnreferencedAssets, storeAsset, type AssetInput } from './assets.js';
import { storeExport, storeSnapshot } from './exports.js';
import { removeDesignFile, writeDesignFile } from './design.js';
import { BoardLog, scanBoardLog, type BoardLogOptions, type BoardLogRecovery } from './boardLog.js';
import { CanvasError } from './errors.js';
import { contextText, type ContextRequest } from './context.js';
import { layoutChanges } from './layout.js';
import { planRepack } from './repack.js';
import { BoardMapCache } from './scale.js';
import { ParallelResultCache } from './parallelCache.js';
import {
  ARRANGE_BY,
  frameLabelOf,
  planArrangeFrame,
  planMoveCard,
  planReorderFrames,
  planTidy,
  type ArrangeBy,
  type ArrangePlan,
  type Mover,
} from './arrange.js';
import { CELLS, cellOf, placeFrame, planMeasured } from './layout.js';
import { INDEX_FILE, SearchIndex } from './search.js';
import { SettingsStore } from './settings.js';
import { PortStore } from './portStore.js';
import { DeckStore } from './deckStore.js';
import { DatasetService } from './datasets.js';
import { seedTemplate } from './templateSeed.js';

export const CANVAS_FILE = 'canvas.json';
/** P6.9: the agents' pause state (see `writePauseState`). */
export const PAUSE_FILE = 'pause.json';
export const BOARD_FILE = 'board.jsonl';

export type CanvasStoreOptions = BoardLogOptions & {
  /** ORB_HOME. Canvases live in `<home>/canvases`. */
  home: string;
  /** Clock (tests). */
  now?: () => number;
  /** Diagnostics sink (never receives secrets; board contents are not logged). */
  log?: (level: 'info' | 'warn' | 'error', message: string) => void;
  /** Keep `<home>/index.sqlite` (P2.6 search). Default true. */
  searchIndex?: boolean;
  /** Max delay before appended events reach the search index. Default 250 ms. */
  indexFlushMs?: number;
  /** Cards per frame an agent may fill (P3.2). Default FRAME_BUDGET (12). */
  frameBudget?: number;
};

/** A tile's mini preview (P2.6): frames as coloured rects, card rects, card count, last change. */
export type CanvasPreview = CanvasSummary['preview'];

const PREVIEW_CARDS = 200;

export function previewOf(state: BoardState, updated: number): CanvasPreview {
  const cards = boardCards(state).filter((c) => !c.stackedInto);
  return {
    frames: boardFrames(state)
      .slice(0, 64)
      .map(({ x, y, w, h, color }) => ({ x, y, w, h, color })),
    cards: cards.slice(0, PREVIEW_CARDS).map(({ x, y, w, h }) => ({ x, y, w, h })),
    cardCount: cards.length,
    updated,
  };
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID (Crockford base32: 48-bit ms time + 80 random bits). Lexicographically sortable by time. */
export function ulid(now = Date.now()): string {
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32]! + time;
    t = Math.floor(t / 32);
  }
  const bytes = randomBytes(16);
  let rand = '';
  for (let i = 0; i < 16; i++) rand += CROCKFORD[bytes[i]! % 32];
  return time + rand;
}

export function slugOf(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return slug || 'canvas';
}

const notFound = (id: string) => new CanvasError('orb/not-found', `no canvas ${JSON.stringify(id)}`, { id });

function validId(id: string): string {
  const parsed = CanvasId.safeParse(id);
  if (!parsed.success)
    throw new CanvasError('orb/invalid-args', `invalid canvas id ${JSON.stringify(id)}`, { id });
  return parsed.data;
}

async function fsyncDir(dir: string): Promise<void> {
  const fh = await openFile(dir, 'r');
  try {
    await fh.sync();
  } catch {
    // Some filesystems refuse fsync on a directory handle; the data files are synced regardless.
  } finally {
    await fh.close();
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  const fh = await openFile(tmp, 'w');
  try {
    await fh.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, path);
}

/** Stream-only facts about an appended event (never persisted). */
export type AppendTag = { pendingId?: string; final?: boolean };
type Listener = (event: BoardEvent, tag: AppendTag) => void;

/**
 * One open canvas board: the log, the folded state, live followers, and the user's undo/redo stacks (P2.4).
 *
 * The stacks hold compensating changes and live in memory only, for this app session (the sidecar's lifetime):
 * they are never persisted. Only user actions are recorded; agent actions never are, so undo never reverses them.
 */
export class Board {
  private listeners = new Set<Listener>();
  /** Per user action, the changes that undo it (last = most recent). */
  private readonly undoStack: BoardChange[][] = [];
  /** Per undone action, the changes that redo it. */
  private readonly redoStack: BoardChange[][] = [];

  constructor(
    readonly canvasId: string,
    private state: BoardState,
    private readonly log: BoardLog,
    readonly recovery: BoardLogRecovery,
    private readonly now: () => number,
    /** Time of the last event (ms), 0 for an empty board. */
    public lastTs = 0,
  ) {}

  get seq(): number {
    return this.state.seq;
  }

  get nextSeq(): number {
    return this.state.seq + 1;
  }

  cards(): Card[] {
    return boardCards(this.state);
  }

  card(id: string): Card | undefined {
    return this.state.cards[id];
  }

  frames(): Frame[] {
    return boardFrames(this.state);
  }

  /** The folded board (immutable: a new object after every append). */
  get current(): BoardState {
    return this.state;
  }

  snapshot(): Extract<BoardFollowFrame, { kind: 'snapshot' }> {
    return {
      kind: 'snapshot',
      canvasId: this.canvasId,
      nextSeq: this.nextSeq,
      cards: this.cards(),
      frames: this.frames(),
      links: boardLinks(this.state),
      ...(this.state.threads ? { threads: this.state.threads } : {}),
      ...(this.state.arrangements ? { arrangements: this.state.arrangements } : {}),
    };
  }

  /**
   * Append one event: stamp seq/ts, validate envelope + payload, fold (which re-checks contiguity), queue the
   * line, then notify followers. Synchronous, so seq order equals call order.
   */
  append(type: BoardEventType, actor: Actor, data: unknown): BoardEvent {
    return this.appendAll([{ type, data }], actor)[0]!;
  }

  /**
   * Append several events as one unit: every event is stamped, validated and folded BEFORE any line is queued, so
   * an invalid change leaves the log untouched. Followers see each event with `tag` (`final` on the last one).
   */
  appendAll(changes: readonly BoardChange[], actor: Actor, tag: { pendingId?: string } = {}): BoardEvent[] {
    let next = this.state;
    const events: BoardEvent[] = [];
    const ts = this.now();
    for (const { type, data } of changes) {
      // P5.5 (fuzz): fold the event exactly as board.jsonl will hold it (JSON turns -0 into 0, drops `undefined`
      // members…), so the live board and a reopened one can never differ.
      const event = parseBoardEvent(
        JSON.parse(JSON.stringify({ v: 1, seq: next.seq + 1, ts, type, actor, data })),
      );
      next = applyEvent(next, event);
      events.push(event);
    }
    for (const event of events) this.log.append(event);
    this.state = next;
    if (events.length > 0) this.lastTs = ts;
    events.forEach((event, i) => {
      const eventTag: AppendTag = tag.pendingId
        ? { pendingId: tag.pendingId, final: i === events.length - 1 }
        : {};
      for (const listener of this.listeners) {
        try {
          listener(event, eventTag);
        } catch {
          // a follower must never break the writer
        }
      }
    });
    return events;
  }

  /**
   * P6.8: append ONE agent rearrangement (`move_card`, `arrange_frame`, `reorder_frames`, `tidy_board`: its moves and
   * the `board.arranged` record) and put its inverse on the user's undo stack as one group, so a single undo takes
   * the whole rearrangement back. Other agent actions are never on the stack.
   */
  appendAgentGroup(changes: readonly BoardChange[], actor: Actor): BoardEvent[] {
    const inverse = invertChanges(this.state, changes);
    const events = this.appendAll(changes, actor);
    if (inverse.length > 0) this.undoStack.push(inverse);
    this.redoStack.length = 0;
    return events;
  }

  /** How many user actions can be undone and redone. */
  get history(): BoardHistoryDepth {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }

  /**
   * Append a USER action's changes and record its inverse (computed against the board before it) for undo. A new
   * action clears the redo stack.
   */
  appendUserAction(changes: readonly BoardChange[], tag: { pendingId?: string } = {}): BoardEvent[] {
    const inverse = invertChanges(this.state, changes);
    const events = this.appendAll(changes, { kind: 'user' }, tag);
    if (inverse.length > 0) this.undoStack.push(inverse);
    this.redoStack.length = 0;
    return events;
  }

  /**
   * Undo (or redo) the most recent user action: append an `undo.marker` and the compensating changes as one unit,
   * and push their own inverse on the other stack. An entry whose changes would do nothing any more (its items
   * were removed since, e.g. by an agent) is dropped and the next one is tried. Returns the events written (none
   * when there was nothing to do).
   */
  undoRedo(op: 'undo' | 'redo', tag: { pendingId?: string } = {}): BoardEvent[] {
    const from = op === 'undo' ? this.undoStack : this.redoStack;
    const to = op === 'undo' ? this.redoStack : this.undoStack;
    for (let changes = from.pop(); changes; changes = from.pop()) {
      if (sameRecords(applyChanges(this.state, changes), this.state)) continue;
      const inverse = invertChanges(this.state, changes);
      let events: BoardEvent[];
      try {
        events = this.appendAll(
          [{ type: 'undo.marker', data: { op, count: changes.length } }, ...changes],
          { kind: 'user' },
          tag,
        );
      } catch (err) {
        from.push(changes);
        throw err;
      }
      to.push(inverse);
      return events;
    }
    return [];
  }

  /** Register a follower. Returns the unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  flush(): Promise<void> {
    return this.log.flush();
  }

  close(): Promise<void> {
    this.listeners.clear();
    return this.log.close();
  }
}

/** An agent card as `place_card` hands it over: data already built and checked by the orb-cards registry. */
export type AgentCardInput = {
  /** P3.8: an id minted beforehand (`mintCardId`), when the card's files are written before it is placed. */
  id?: string;
  type: CardType;
  frameId?: string | null;
  data: unknown;
  why: string;
  detail?: string;
  badge?: 'must' | 'skim';
  /** P6.3: the dataset views the card shows (a Database card's own). */
  view?: CardView;
  /**
   * P3.6: the card (`c_…`) or frame (`f_…`) whose thread this card answers. A card goes next to that card, in its
   * frame (or on the open board next to it), a frame's card goes in that frame; either way a `thread` label link
   * from the thread's card or frame to the new card is added in the same append.
   */
  threadOf?: string | undefined;
};

/** Label of the link from a thread's card or frame to a card placed for that thread (P3.6). */
export const THREAD_LINK_LABEL = 'thread';

/** Default card budget of a frame (PRD Canvas › Frames): agents get `FRAME_FULL` above it. */
export const FRAME_BUDGET = 12;

/** Most frames an agent may grow a board to (`add_frame`). */
export const MAX_FRAMES = 24;

/** Tones of agent frames in order (the Home templates' sequence), unless the agent names one. */
export const FRAME_TONES: readonly FrameColor[] = ['signal', 'sky', 'rho', 'sky', 'paper'];

/** What `consolidate_cards` asks for: the cards to stack, and the stack's title and summary. */
export type ConsolidateInput = { cardIds: readonly string[]; title: string; summary: string };

/** Visible (not stacked) cards in a frame, or on the open board for `null`. */
export const cardsIn = (state: BoardState, frameId: string | null): Card[] =>
  boardCards(state).filter((c) => c.frameId === frameId && !c.stackedInto);

/** True when `card` was placed by agent `role` (an agent's "own" card; never a user card). */
export const ownedBy = (card: Card, role: string): boolean =>
  card.provenance.kind === 'agent' && card.provenance.agent === role;

export class CanvasStore {
  readonly canvasesDir: string;
  private readonly boards = new Map<string, Promise<Board>>();
  /** Serializes canvas.json rewrites per canvas. */
  private readonly metaWrites = new Map<string, Promise<unknown>>();
  private readonly lifetime = new AbortController();
  private readonly now: () => number;
  private closing: Promise<void> | null = null;
  /** Home search (P2.6): `<home>/index.sqlite`. */
  readonly index: SearchIndex | null;
  /** App settings (P2.6): `<home>/orb.json`. */
  readonly settings: SettingsStore;
  /** Tile previews of boards that are not open, keyed by board.jsonl size + mtime. */
  private readonly previews = new Map<string, { key: string; preview: CanvasPreview }>();

  /** P4.5: the research document of each canvas (`port/`), and its compose jobs. */
  readonly port: PortStore;

  /** P6.17: the deck (`deck/`) of each canvas, its compose jobs and the .pptx export. */
  readonly deck: DeckStore;

  /** P6.3: datasets (`assets/data/`): Database cards and attached dataset views. */
  readonly datasets: DatasetService;

  /** P6.8: per-frame digests of `board_map`, recomputed only for a frame whose cards changed. */
  readonly mapCache = new BoardMapCache();

  /** P6.8: saved results of Parallel calls, per canvas (`assets/parallel/cache/`), so a repeat call costs nothing. */
  readonly parallelCache = new ParallelResultCache(
    (id) => this.dirOf(id),
    () => this.now(),
  );

  constructor(private readonly options: CanvasStoreOptions) {
    this.canvasesDir = join(options.home, 'canvases');
    this.now = options.now ?? Date.now;
    this.port = new PortStore({
      dirOf: (id) => this.dirOf(id),
      open: (id) => this.open(id),
      boardState: async (id) => (await this.board(id)).current,
      now: () => this.now(),
    });
    this.deck = new DeckStore({
      appearance: async () => (await this.settings.get()).appearance,
      dirOf: (id) => this.dirOf(id),
      open: (id) => this.open(id),
      boardState: async (id) => (await this.board(id)).current,
      now: () => this.now(),
      writeExport: (id, input) => this.writeExport(id, input),
    });
    this.datasets = new DatasetService({
      dirOf: (id) => this.dirOf(id),
      open: (id) => this.open(id),
      board: (id) => this.board(id),
      mintId: () => ulid(this.now()),
      now: () => this.now(),
    });
    this.settings = new SettingsStore(options.home, options.log);
    this.index =
      options.searchIndex === false
        ? null
        : new SearchIndex({
            path: join(options.home, INDEX_FILE),
            ...(options.indexFlushMs !== undefined ? { flushMs: options.indexFlushMs } : {}),
            ...(options.log ? { log: options.log } : {}),
            source: {
              canvases: async () => (await this.list()).map(({ id, title }) => ({ id, title })),
              openBoard: (id) => this.openBoards.get(id)?.current,
              logSize: async (id) => {
                try {
                  return (await stat(join(this.dirOf(id), BOARD_FILE))).size;
                } catch {
                  return 0;
                }
              },
              readBoard: async (id) => (await this.readBoard(id)).state,
              datasetDigest: (canvasId, datasetId) => this.datasets.digestSync(canvasId, datasetId),
            },
          });
  }

  /** Boards whose load finished (for synchronous access by the search index). */
  private readonly openBoards = new Map<string, Board>();

  get closed(): boolean {
    return this.closing !== null;
  }

  dirOf(id: string): string {
    return join(this.canvasesDir, validId(id));
  }

  /** Create `<date>-<slug>/` with canvas.json and an empty board.jsonl. */
  async create(request: CanvasCreateArgs): Promise<CanvasMeta> {
    this.assertOpen();
    const args = CanvasCreateArgs.parse(request);
    const created = this.now();
    const base = `${new Date(created).toISOString().slice(0, 10)}-${slugOf(args.prompt)}`;
    await mkdir(this.canvasesDir, { recursive: true });
    let id = base;
    for (let n = 2; ; n++) {
      try {
        await mkdir(join(this.canvasesDir, id));
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        id = `${base}-${n}`;
      }
    }
    const template = args.template ? resolveTemplateId(TemplateId.parse(args.template)) : undefined;
    // P6.11: a v2 template keeps its intake answers and depth tier in canvas.json (the agents' playbook is built from them).
    const spec = specOf(template);
    let intake: IntakeAnswers | undefined;
    let depth: Depth | undefined;
    if (spec) {
      const first = args.prompt.trim().split('\n')[0]!;
      if (args.intake) {
        const checked = validateIntake(spec.inputs, {
          ...args.intake,
          ...(args.depth ? { depth: args.depth } : {}),
        });
        if (!checked.ok) {
          await rm(join(this.canvasesDir, id), { recursive: true, force: true });
          throw new CanvasError(
            'orb/invalid-args',
            `the intake is not valid: ${Object.values(checked.errors).join('; ')}`,
            { errors: checked.errors },
          );
        }
        intake = checked.answers;
        depth = args.depth ?? checked.depth;
      } else {
        // A scripted caller with no form: the prompt names the subject (the first field).
        intake = { [spec.inputs[0]!.id]: first.slice(0, 120) };
        depth = args.depth ?? DEFAULT_DEPTH;
      }
    }
    const meta = CanvasMeta.parse({
      id,
      title: args.prompt.trim().split('\n')[0]!.slice(0, 80),
      created,
      rootSessionId: null,
      childAgentIds: {},
      ...(template ? { template, brief: templateOf(template).brief } : {}),
      ...(spec ? { intake, depth } : {}),
      ...(args.seed ? { seed: args.seed } : {}),
    });
    const dir = join(this.canvasesDir, id);
    const board = await openFile(join(dir, BOARD_FILE), 'a');
    await board.sync();
    await board.close();
    await writeJsonAtomic(join(dir, CANVAS_FILE), meta);
    await fsyncDir(dir);
    await fsyncDir(this.canvasesDir);
    if (template && spec) {
      // P6.11: frames, databases and seed cards of a v2 template, as one user-authored batch.
      await seedTemplate(
        { datasets: this.datasets, board: await this.board(id), ulid: (now) => ulid(now) },
        id,
        spec,
        intake ?? {},
        created,
      );
    } else if (template) {
      // The template's starting frames: user-authored (the user picked the template), not on the undo stack.
      const board = await this.board(id);
      board.appendAll(
        templateFrames(template).map((f, i) => ({
          type: 'frame.added' as const,
          data: {
            frame: { id: `f_${ulid(created)}${i}`, ...f, provenance: { kind: 'user' as const, at: created } },
          },
        })),
        { kind: 'user' },
      );
      await board.flush();
    }
    this.index?.noteCanvas(id);
    return meta;
  }

  /** Read canvas.json. */
  async open(id: string): Promise<CanvasMeta> {
    this.assertOpen();
    const dir = this.dirOf(id);
    let raw: string;
    try {
      raw = await readFile(join(dir, CANVAS_FILE), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw notFound(id);
      throw err;
    }
    const parsed = CanvasMeta.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.id !== id) {
      throw new CanvasError('orb/board-corrupt', `canvas.json of ${JSON.stringify(id)} is invalid`, { id });
    }
    this.noteRoles(parsed.data);
    return parsed.data;
  }

  /** Session id → role, from every canvas.json read or written (`roleOfSession`). */
  private readonly sessionRoles = new Map<string, AgentName>();

  private noteRoles(meta: CanvasMeta): void {
    if (meta.rootSessionId) this.sessionRoles.set(meta.rootSessionId, 'orb');
    for (const [role, sessionId] of Object.entries(meta.childAgentIds)) {
      if (role === 'scout' || role === 'critic' || role === 'builder') this.sessionRoles.set(sessionId, role);
    }
  }

  /**
   * The role of an agent session on any canvas this service has read (its canvas.json names it as the root or as a
   * child), synchronously, for the preset-level allow-list guard (dsh guards are synchronous). Agents are created or
   * resumed only after their canvas.json was read, so a live canvas agent is always known here. The board tools still
   * read the role from canvas.json itself on every call.
   */
  roleOfSession(sessionId: string): AgentName | undefined {
    return this.sessionRoles.get(sessionId);
  }

  /**
   * The canvas whose folder is `dir` (an agent session's `cwd`), or undefined when `dir` is not a canvas folder of
   * this store. Agents are created with `meta.cwd` = their canvas folder, so this maps a tool call to its board.
   *
   * P5.3: Settings › Storage can move the Orb folder (or point Orb at a library moved by hand). A harness session's
   * `cwd` is fixed when it is created, so an agent resumed after a move still names the OLD folder,
   * `<old home>/canvases/<id>`. Such a dir maps to canvas `<id>` when that canvas exists in this store; every caller
   * then checks that the session is that canvas's root or child in its canvas.json, so a session of another library
   * with the same canvas id is still refused.
   */
  canvasIdOfDir(dir: string | undefined): string | undefined {
    if (!dir) return undefined;
    const abs = resolve(dir);
    const parent = dirname(abs);
    const id = abs.slice(parent.length + 1);
    if (!CanvasId.safeParse(id).success) return undefined;
    if (parent === resolve(this.canvasesDir)) return id;
    if (basename(parent) !== 'canvases') return undefined;
    return existsSync(join(this.canvasesDir, id, 'canvas.json')) ? id : undefined;
  }

  /** Record the root Orb agent's session id in canvas.json (atomic rewrite, serialized per canvas). */
  setRootSession(id: string, rootSessionId: string): Promise<CanvasMeta> {
    return this.updateMeta(id, (meta) => ({ ...meta, rootSessionId }));
  }

  /** P6.20: remember the camera the user left a canvas at (canvas.json `camera`; not board state, no event). */
  setCamera(id: string, camera: CanvasCamera): Promise<CanvasMeta> {
    const parsed = CanvasCamera.safeParse(camera);
    if (!parsed.success) return Promise.reject(new CanvasError('orb/invalid-args', 'invalid camera', { id }));
    return this.updateMeta(id, (meta) => ({ ...meta, camera: parsed.data }));
  }

  /** Rename the canvas (canvas.json `title`; the folder id never changes). */
  rename(id: string, title: string): Promise<CanvasMeta> {
    const parsed = CanvasRenameArgs.safeParse({ title });
    if (!parsed.success) {
      return Promise.reject(
        new CanvasError(
          'orb/invalid-args',
          `invalid title: ${parsed.error.issues[0]?.message ?? 'bad value'}`,
          { id },
        ),
      );
    }
    return this.updateMeta(id, (meta) => ({ ...meta, title: parsed.data.title })).then((meta) => {
      this.index?.noteCanvas(meta.id);
      return meta;
    });
  }

  private updateMeta(id: string, change: (meta: CanvasMeta) => CanvasMeta): Promise<CanvasMeta> {
    let canvasId: string;
    try {
      this.assertOpen();
      canvasId = validId(id);
    } catch (err) {
      return Promise.reject(err);
    }
    const run = (this.metaWrites.get(canvasId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        const next = CanvasMeta.parse(change(await this.open(canvasId)));
        if (next.id !== canvasId)
          throw new CanvasError('orb/invalid-args', 'canvas id cannot change', { id });
        const dir = this.dirOf(canvasId);
        await writeJsonAtomic(join(dir, CANVAS_FILE), next);
        await fsyncDir(dir);
        this.noteRoles(next);
        return next;
      });
    this.metaWrites.set(canvasId, run);
    void run
      .finally(() => {
        if (this.metaWrites.get(canvasId) === run) this.metaWrites.delete(canvasId);
      })
      .catch(() => undefined);
    return run;
  }

  /** Cards per frame an agent may fill. */
  get frameBudget(): number {
    return this.options.frameBudget ?? FRAME_BUDGET;
  }

  /**
   * Place one agent card (the `place_card` tool): check the frame, its budget and the data against the type's
   * schema, mint the id, lay it out with the layout engine (layout.ts: the frame's first free cell, growing the frame
   * downward when it is full), stamp the agent provenance, and append (`frame.updated` when the frame grows, then
   * `card.added`) as one unit. A frame that already shows `frameBudget` cards refuses with `orb/frame-full` (the
   * open board outside frames has no budget). Agent cards are never on the undo stack. Returns the `card.added` event.
   *
   * Everything after loading the board is synchronous, so the budget check, the layout and the append see the same
   * board even when several agents place at once.
   */
  async placeAgentCard(id: string, input: AgentCardInput, actor: Actor): Promise<BoardEvent> {
    if (actor.kind !== 'agent')
      throw new CanvasError('orb/invalid-args', 'placeAgentCard needs an agent actor');
    const board = await this.board(id);
    this.assertOpen();
    // P6.4: a chart bound to a dataset names one of this canvas (checked before the synchronous part below).
    await this.assertNamedDatasets(id, DatasetService.referencedIds(input));
    const state = board.current;
    // A thread's card goes with the thread's card or frame (P3.6); a stacked card's thread answers next to its stack.
    let anchor: Card | Frame | undefined;
    if (input.threadOf) {
      let card = state.cards[input.threadOf];
      while (card?.stackedInto && state.cards[card.stackedInto]) card = state.cards[card.stackedInto];
      anchor = card ?? state.frames[input.threadOf];
      if (!anchor)
        throw new CanvasError(
          'orb/not-found',
          `no card or frame ${JSON.stringify(input.threadOf)} on this board`,
        );
    }
    const frameId = anchor
      ? anchor.id.startsWith('f_')
        ? anchor.id
        : (anchor as Card).frameId
      : (input.frameId ?? null);
    if (frameId && !state.frames[frameId])
      throw new CanvasError('orb/not-found', `no frame ${JSON.stringify(frameId)} on this board`, {
        frameId,
      });
    const parsed = cardDataSchema(input.type).safeParse(input.data);
    if (!parsed.success)
      throw new CanvasError('orb/invalid-args', `invalid ${input.type} card data`, { cardType: input.type });
    // Check in the synchronous write section so simultaneous agents cannot race the tool's early URL lookup.
    if (input.type === 'source') {
      const identity = sourceIdentity((parsed.data as any).url);
      const existing = Object.values(state.cards).find(
        (c) => c.type === 'source' && !c.stackedInto && sourceIdentity((c.data as any).url) === identity,
      );
      if (existing)
        throw new CanvasError('orb/invalid-args', 'This source page already has a card', {
          reusedSourceCardId: existing.id,
        });
    }
    // The budget is per frame (PRD Canvas › Frames); the open board outside frames has none.
    const count = frameId ? cardsIn(state, frameId).length : 0;
    if (frameId && count >= this.frameBudget) {
      throw new CanvasError(
        'orb/frame-full',
        `frame ${frameId} already holds ${count} cards (budget ${this.frameBudget})`,
        { frameId, budget: this.frameBudget, count },
      );
    }
    const ts = this.now();
    const draft = { type: input.type, data: parsed.data, why: input.why };
    const near = anchor && anchor.id.startsWith('c_') ? anchor : undefined;
    const { rect, changes } = layoutChanges(state, frameId, cellOf(draft), new Set(), near);
    if (input.id !== undefined && (!/^c_[A-Za-z0-9_-]{1,60}$/.test(input.id) || state.cards[input.id]))
      throw new CanvasError('orb/invalid-args', `card id ${JSON.stringify(input.id)} cannot be used`);
    const card: Card = {
      id: input.id ?? `c_${ulid(ts)}`,
      type: input.type,
      frameId,
      ...rect,
      data: parsed.data,
      why: input.why,
      ...(input.detail !== undefined ? { detail: input.detail } : {}),
      ...(input.badge ? { badge: input.badge } : {}),
      ...(input.view ? { view: input.view } : {}),
      provenance: { ...actor, at: ts },
    };
    const link: Link | undefined = anchor
      ? {
          id: `l_${ulid(ts)}`,
          from: anchor.id,
          to: card.id,
          type: 'label',
          label: THREAD_LINK_LABEL,
          provenance: { ...actor, at: ts },
        }
      : undefined;
    const events = board.appendAll(
      [
        ...changes,
        { type: 'card.added', data: { card } },
        ...(link ? [{ type: 'link.added' as const, data: { link } }] : []),
      ],
      actor,
    );
    const added = events.find((e) => e.type === 'card.added')!;
    await this.refreshCharts(id, board, actor);
    return added;
  }

  /**
   * `consolidate_cards` (P3.2): collapse some of the calling agent's OWN cards of one frame into a new stack card.
   * Every card must exist, be visible (not stacked already), have been placed by this agent's role, and sit in the
   * same frame (or all on the open board); a user card (a user note above all) is never touched. The stack card is a
   * doc card with `data.stack` (the stacked cards' ids, types and titles), laid out in the frame's first free cell
   * once the stacked cards are out of the way. Appends (`frame.updated` when the frame grows) `card.added` (the stack)
   * and `card.stacked` as one unit; returns the stack card and the events.
   */
  async consolidateAgentCards(
    id: string,
    input: ConsolidateInput,
    actor: Actor,
  ): Promise<{ stack: Card; events: BoardEvent[] }> {
    if (actor.kind !== 'agent')
      throw new CanvasError('orb/invalid-args', 'consolidateAgentCards needs an agent actor');
    const title = input.title.trim();
    const summary = input.summary.trim();
    if (!title || title.length > STACK_LIMITS.title)
      throw new CanvasError(
        'orb/invalid-args',
        `a stack needs a title of 1–${STACK_LIMITS.title} characters`,
      );
    if (!summary || summary.length > STACK_LIMITS.summary)
      throw new CanvasError(
        'orb/invalid-args',
        `a stack needs a summary of 1–${STACK_LIMITS.summary} characters`,
      );
    const ids = [...new Set(input.cardIds)];
    if (ids.length !== input.cardIds.length)
      throw new CanvasError('orb/invalid-args', 'consolidate_cards lists a card twice');
    if (ids.length < STACK_LIMITS.min || ids.length > STACK_LIMITS.max)
      throw new CanvasError(
        'orb/invalid-args',
        `consolidate ${STACK_LIMITS.min}–${STACK_LIMITS.max} cards at once (got ${ids.length})`,
      );
    const board = await this.board(id);
    this.assertOpen();
    const state = board.current;
    const cards: Card[] = [];
    for (const cardId of ids) {
      const card = state.cards[cardId];
      if (!card)
        throw new CanvasError('orb/not-found', `no card ${JSON.stringify(cardId)} on this board`, { cardId });
      if (card.provenance.kind === 'user')
        throw new CanvasError(
          'orb/forbidden',
          `card ${cardId} is the user's; agents never consolidate user cards`,
          {
            cardId,
          },
        );
      if (!ownedBy(card, actor.agent))
        throw new CanvasError(
          'orb/forbidden',
          `card ${cardId} was not placed by ${actor.agent}; consolidate only your own cards`,
          {
            cardId,
          },
        );
      if (card.stackedInto)
        throw new CanvasError(
          'orb/invalid-args',
          `card ${cardId} is already stacked into ${card.stackedInto}`,
          {
            cardId,
          },
        );
      cards.push(card);
    }
    const frameId = cards[0]!.frameId;
    if (cards.some((c) => c.frameId !== frameId))
      throw new CanvasError('orb/invalid-args', 'consolidate cards of one frame at a time');
    if (frameId && !state.frames[frameId])
      throw new CanvasError('orb/not-found', `no frame ${JSON.stringify(frameId)} on this board`, {
        frameId,
      });
    const ts = this.now();
    const data = {
      title,
      body: summary,
      stack: {
        count: cards.length,
        items: cards.map((c) => ({
          id: c.id,
          type: c.type,
          title: cardTitle(c).slice(0, STACK_LIMITS.title),
        })),
      },
    };
    const parsed = cardDataSchema('doc').safeParse(data);
    if (!parsed.success) throw new CanvasError('orb/invalid-args', 'invalid stack card data');
    const { rect, changes } = layoutChanges(state, frameId, CELLS.stack, new Set(ids));
    const stack: Card = {
      id: `c_${ulid(ts)}`,
      type: 'doc',
      frameId,
      ...rect,
      data: parsed.data,
      why: `${cards.length} ${actor.agent} cards consolidated into one stack.`,
      provenance: { ...actor, at: ts },
    };
    const events = board.appendAll(
      [
        ...changes,
        { type: 'card.added', data: { card: stack } },
        { type: 'card.stacked', data: { stackId: stack.id, ids } },
      ],
      actor,
    );
    return { stack, events };
  }

  /** The role gate of the layout tools: Orb may rearrange any unpinned card, a child only its own. */
  private moverOf(actor: Extract<Actor, { kind: 'agent' }>): Mover {
    return actor.agent === 'orb' ? () => true : (card) => ownedBy(card, actor.agent);
  }

  /** Append a planned rearrangement as one undoable group with its activity record. */
  private appendArrangement(
    board: Board,
    plan: ArrangePlan,
    actor: Actor,
    op: 'move_card' | 'arrange_frame' | 'reorder_frames' | 'tidy_board',
    text: string,
    extraIds: readonly string[] = [],
    count?: number,
  ): number {
    const ids = [...new Set([...plan.movedCards, ...plan.movedFrames, ...extraIds])].slice(0, 30);
    const n = count ?? plan.movedCards.length + plan.movedFrames.length;
    board.appendAgentGroup(
      [{ type: 'board.arranged', data: { op, text: text.slice(0, 200), ids, count: n } }, ...plan.changes],
      actor,
    );
    return n;
  }

  /**
   * `move_card` (P6.8): re-file one card into another frame; the layout engine picks the cell. Refused for a pinned
   * card (the user's own, or one the user dragged), for a child's move of a card it did not place, for a stacked card
   * and for a full frame. One undoable group.
   */
  async moveAgentCard(
    id: string,
    input: { cardId: string; frameId: string },
    actor: Actor,
  ): Promise<{ moved: boolean; cardId: string; frameId: string }> {
    if (actor.kind !== 'agent')
      throw new CanvasError('orb/invalid-args', 'moveAgentCard needs an agent actor');
    const board = await this.board(id);
    this.assertOpen();
    const state = board.current;
    const card = state.cards[input.cardId];
    if (!card)
      throw new CanvasError('orb/not-found', `no card ${JSON.stringify(input.cardId)} on this board`, {
        cardId: input.cardId,
      });
    const frame = state.frames[input.frameId];
    if (!frame)
      throw new CanvasError('orb/not-found', `no frame ${JSON.stringify(input.frameId)} on this board`, {
        frameId: input.frameId,
      });
    if (card.stackedInto)
      throw new CanvasError(
        'orb/invalid-args',
        `card ${card.id} is stacked into ${card.stackedInto}; move the stack`,
      );
    if (isPinned(card))
      throw new CanvasError('orb/forbidden', `card ${card.id} was placed by the user; agents never move it`, {
        cardId: card.id,
      });
    if (!this.moverOf(actor)(card))
      throw new CanvasError(
        'orb/forbidden',
        `card ${card.id} was not placed by ${actor.agent}; move only your own cards`,
        { cardId: card.id },
      );
    if (card.frameId === frame.id) return { moved: false, cardId: card.id, frameId: frame.id };
    const count = cardsIn(state, frame.id).length;
    if (count >= this.frameBudget)
      throw new CanvasError(
        'orb/frame-full',
        `frame ${frame.id} already holds ${count} cards (budget ${this.frameBudget})`,
        {
          frameId: frame.id,
          budget: this.frameBudget,
          count,
        },
      );
    const plan = planMoveCard(state, card.id, frame.id);
    this.appendArrangement(
      board,
      plan,
      actor,
      'move_card',
      `moved "${cardTitle(card).slice(0, 60)}" to ${frameLabelOf(state, frame)}`,
      [card.id],
      1,
    );
    return { moved: true, cardId: card.id, frameId: frame.id };
  }

  /**
   * `arrange_frame` (P6.8): re-sort or cluster the movable cards of one frame (`by` importance, date, type, source or
   * cluster). Pinned cards stay; a child arranges only its own cards. One undoable group; nothing is written when the
   * frame is already in that order.
   */
  async arrangeAgentFrame(
    id: string,
    input: { frameId: string; by: ArrangeBy },
    actor: Actor,
  ): Promise<{ moved: number; cards: number; pinned: number }> {
    if (actor.kind !== 'agent')
      throw new CanvasError('orb/invalid-args', 'arrangeAgentFrame needs an agent actor');
    if (!ARRANGE_BY.includes(input.by))
      throw new CanvasError('orb/invalid-args', `arrange by one of ${ARRANGE_BY.join(', ')}`);
    const board = await this.board(id);
    this.assertOpen();
    const state = board.current;
    const frame = state.frames[input.frameId];
    if (!frame)
      throw new CanvasError('orb/not-found', `no frame ${JSON.stringify(input.frameId)} on this board`, {
        frameId: input.frameId,
      });
    const inFrame = cardsIn(state, frame.id);
    const mayMove = this.moverOf(actor);
    const plan = planArrangeFrame(state, frame.id, input.by, mayMove);
    const pinned = inFrame.filter((c) => isPinned(c) || !mayMove(c)).length;
    if (plan.changes.length === 0) return { moved: 0, cards: inFrame.length, pinned };
    const moved = this.appendArrangement(
      board,
      plan,
      actor,
      'arrange_frame',
      `arranged ${frameLabelOf(state, frame)} by ${input.by} (${plan.movedCards.length} card${plan.movedCards.length === 1 ? '' : 's'} moved)`,
      [frame.id],
    );
    return { moved, cards: inFrame.length, pinned };
  }

  /** `reorder_frames` (P6.8, Orb only): the listed frames first in that order (their numbers follow). One undoable group. */
  async reorderAgentFrames(
    id: string,
    order: readonly string[],
    actor: Actor,
  ): Promise<{ order: string[]; changed: boolean }> {
    if (actor.kind !== 'agent' || actor.agent !== 'orb')
      throw new CanvasError('orb/forbidden', 'only orb puts the frames in order');
    const board = await this.board(id);
    this.assertOpen();
    const state = board.current;
    for (const fid of order)
      if (!state.frames[fid])
        throw new CanvasError('orb/not-found', `no frame ${JSON.stringify(fid)} on this board`, {
          frameId: fid,
        });
    const changes = planReorderFrames(state, order);
    if (changes.length === 0) return { order: boardFrames(state).map((f) => f.id), changed: false };
    board.appendAgentGroup(
      [
        {
          type: 'board.arranged',
          data: {
            op: 'reorder_frames',
            text: 'put the frames in a new order',
            ids: order.slice(0, 30),
            count: boardFrames(state).length,
          },
        },
        ...changes,
      ],
      actor,
    );
    return { order: boardFrames(board.current).map((f) => f.id), changed: true };
  }

  /** `tidy_board` (P6.8, Orb only): close gaps and fix overlaps around the pinned cards. One undoable group. */
  async tidyAgentBoard(id: string, actor: Actor): Promise<{ moved: number; frames: number }> {
    if (actor.kind !== 'agent' || actor.agent !== 'orb')
      throw new CanvasError('orb/forbidden', 'only orb tidies the board');
    const board = await this.board(id);
    this.assertOpen();
    const plan = planTidy(board.current, this.moverOf(actor));
    if (plan.changes.length === 0) return { moved: 0, frames: 0 };
    const moved = this.appendArrangement(
      board,
      plan,
      actor,
      'tidy_board',
      `tidied the board (${plan.movedCards.length} card${plan.movedCards.length === 1 ? '' : 's'} moved)`,
    );
    return { moved, frames: plan.movedFrames.length };
  }

  /**
   * Record a child agent's session id under its role in canvas.json `childAgentIds` (P3.4 `delegate` writes it
   * before the child's first turn). The board tools read the caller's role from it.
   */
  setChildAgent(id: string, role: 'scout' | 'critic' | 'builder', sessionId: string): Promise<CanvasMeta> {
    return this.updateMeta(id, (meta) => ({
      ...meta,
      childAgentIds: { ...meta.childAgentIds, [role]: sessionId },
    }));
  }

  /**
   * Drop `role` from canvas.json `childAgentIds` when it still names `sessionId` (P3.4: a child whose start failed
   * before it existed). The session loses its role in `roleOfSession` too.
   */
  unsetChildAgent(id: string, role: 'scout' | 'critic' | 'builder', sessionId: string): Promise<CanvasMeta> {
    return this.updateMeta(id, (meta) => {
      if (meta.childAgentIds[role] !== sessionId) return meta;
      const childAgentIds = { ...meta.childAgentIds };
      delete childAgentIds[role];
      return { ...meta, childAgentIds };
    }).then((meta) => {
      if (this.sessionRoles.get(sessionId) === role && meta.childAgentIds[role] !== sessionId)
        this.sessionRoles.delete(sessionId);
      return meta;
    });
  }

  /**
   * `add_frame` (P3.3): a new frame titled `title`, placed by the layout engine (`placeFrame`: the template grid's
   * first free slot), with agent provenance, off the undo stack. A frame with the same title (case and spacing
   * ignored) is not added twice: the existing one is returned with `created: false`, so a retried call never
   * duplicates a frame. At most `MAX_FRAMES` frames per board.
   */
  async addAgentFrame(
    id: string,
    input: { title: string; color?: FrameColor | undefined },
    actor: Actor,
  ): Promise<{ frame: Frame; created: boolean; number: number }> {
    if (actor.kind !== 'agent')
      throw new CanvasError('orb/invalid-args', 'addAgentFrame needs an agent actor');
    const title = input.title.trim().replace(/\s+/g, ' ');
    if (!title || title.length > 80)
      throw new CanvasError('orb/invalid-args', 'a frame needs a title of 1–80 characters');
    const board = await this.board(id);
    this.assertOpen();
    const state = board.current;
    const frames = boardFrames(state);
    const key = title.toLowerCase();
    const same = frames.find((f) => f.title.trim().replace(/\s+/g, ' ').toLowerCase() === key);
    if (same) return { frame: same, created: false, number: frames.indexOf(same) + 1 };
    if (frames.length >= MAX_FRAMES)
      throw new CanvasError(
        'orb/invalid-args',
        `this board already has ${frames.length} frames (at most ${MAX_FRAMES})`,
      );
    const ts = this.now();
    const frame: Frame = {
      id: `f_${ulid(ts)}`,
      title,
      color: input.color ?? FRAME_TONES[frames.length % FRAME_TONES.length]!,
      ...placeFrame(state),
      provenance: { ...actor, at: ts },
    };
    board.appendAll([{ type: 'frame.added', data: { frame } }], actor);
    return { frame, created: true, number: frames.length + 1 };
  }

  /**
   * `update_frame` (P3.3): rename or recolour a frame. Agents never move or resize frames (the layout engine does),
   * so only `title` and `color` are accepted.
   */
  async updateAgentFrame(
    id: string,
    frameId: string,
    patch: { title?: string | undefined; color?: FrameColor | undefined },
    actor: Actor,
  ): Promise<Frame> {
    if (actor.kind !== 'agent')
      throw new CanvasError('orb/invalid-args', 'updateAgentFrame needs an agent actor');
    const clean: { title?: string; color?: FrameColor } = {};
    if (patch.title !== undefined) clean.title = patch.title.trim().replace(/\s+/g, ' ');
    if (patch.color !== undefined) clean.color = patch.color;
    if (Object.keys(clean).length === 0)
      throw new CanvasError('orb/invalid-args', 'nothing to update: give a title or a color');
    await this.commandEvents(id, { type: 'frame.updated', id: frameId, patch: clean }, actor);
    return (await this.board(id)).current.frames[frameId]!;
  }

  /**
   * `add_link` (P3.3): a link between two cards or frames, with agent provenance, off the undo stack. The same link
   * (same ends and type) is not added twice: the existing one is returned with `created: false`.
   */
  async addAgentLink(
    id: string,
    draft: LinkDraft,
    actor: Actor,
  ): Promise<{ linkId: string; created: boolean }> {
    if (actor.kind !== 'agent')
      throw new CanvasError('orb/invalid-args', 'addAgentLink needs an agent actor');
    const board = await this.board(id);
    this.assertOpen();
    const same = boardLinks(board.current).find(
      (l) =>
        l.type === draft.type &&
        ((l.from === draft.from && l.to === draft.to) || (l.from === draft.to && l.to === draft.from)),
    );
    if (same) return { linkId: same.id, created: false };
    const events = await this.commandEvents(id, { type: 'link.added', link: draft }, actor);
    const link = (events.at(-1)!.data as { link: { id: string } }).link;
    return { linkId: link.id, created: true };
  }

  /**
   * Append one `thread.message` (P3.6) to the thread of card or frame `of`: the user's message (actor user) when
   * `orb/chat.send` has a `threadOf`, or Orb's reply (agent actor) when the turn that answered it ends. The card or
   * frame must exist. A text over THREAD_MESSAGE_MAX is cut with an ellipsis. Thread messages are never on the undo
   * stack. Returns the event.
   */
  async appendThreadMessage(id: string, of: string, text: string, actor: Actor): Promise<BoardEvent> {
    const body = text.trim();
    if (!body) throw new CanvasError('orb/invalid-args', 'empty thread message');
    const board = await this.board(id);
    this.assertOpen();
    const state = board.current;
    if (!state.cards[of] && !state.frames[of])
      throw new CanvasError('orb/not-found', `no card or frame ${JSON.stringify(of)} on this board`);
    const cut = body.length > THREAD_MESSAGE_MAX ? `${body.slice(0, THREAD_MESSAGE_MAX - 1)}…` : body;
    const ts = this.now();
    return board.append('thread.message', actor, { id: `t_${ulid(ts)}`, of, text: cut });
  }

  /** Root session id → the card or frame whose thread its current turn answers (P3.6, set by orb-agents). */
  private readonly activeThreads = new Map<string, string>();

  /**
   * Record which thread the current turn of an agent session answers (`undefined` clears it). orb-agents sets it
   * when Orb's turn takes a thread message and clears it when the turn ends; `place_card` uses it as the default
   * `threadOf` of Orb's cards (P3.6: a thread's new cards go next to its card and are linked to it).
   */
  setActiveThread(sessionId: string, of: string | undefined): void {
    if (of) this.activeThreads.set(sessionId, of);
    else this.activeThreads.delete(sessionId);
  }

  /** The thread the current turn of `sessionId` answers, if any. */
  activeThreadOf(sessionId: string): string | undefined {
    return this.activeThreads.get(sessionId);
  }

  /**
   * The context text `orb/chat.send` injects with a message (P3.3, context.ts): the frames and cards in context and
   * the thread's card or frame, as describe() text. `undefined` when the message has no context.
   */
  async chatContext(id: string, request: ContextRequest): Promise<string | undefined> {
    if (
      !request.context?.frameIds?.length &&
      !request.context?.cardIds?.length &&
      !request.context?.attachmentIds?.length &&
      !request.threadOf
    )
      return undefined;
    const board = await this.board(id);
    return contextText(board.current, request);
  }

  /**
   * Copy an upload into the canvas's `assets/` folder (P2.5; the orb-host upload route streams the request body
   * here). The canvas must exist. Returns the reference card data points at.
   */
  async writeAsset(id: string, input: AssetInput): Promise<AssetRef> {
    await this.open(id);
    this.assertOpen();
    return storeAsset(this.dirOf(id), input, () => ulid(this.now()));
  }

  /**
   * P6.9: the agents' pause state of a canvas (who is paused and what they were sent meanwhile), kept in
   * `<canvas>/pause.json` so a Pause survives quitting the app. `null` removes the file (nothing is paused). The value
   * is opaque here: orb-agents owns its shape.
   */
  async writePauseState(id: string, state: unknown | null): Promise<void> {
    await this.open(id);
    this.assertOpen();
    const file = join(this.dirOf(id), PAUSE_FILE);
    if (state === null) await rm(file, { force: true });
    else await writeJsonAtomic(file, state);
  }

  /** P6.9: what `writePauseState` kept (undefined when nothing is paused or the file is unreadable). */
  async readPauseState(id: string): Promise<unknown | undefined> {
    await this.open(id);
    try {
      return JSON.parse(await readFile(join(this.dirOf(id), PAUSE_FILE), 'utf8'));
    } catch {
      return undefined;
    }
  }

  /** The agent's resumable objective, not board content. Orb-agents owns and validates its shape. */
  async writeResearchState(id: string, state: unknown): Promise<void> {
    await this.open(id);
    this.assertOpen();
    await writeJsonAtomic(join(this.dirOf(id), 'research.json'), state);
  }

  async readResearchState(id: string): Promise<unknown | undefined> {
    await this.open(id);
    try {
      return JSON.parse(await readFile(join(this.dirOf(id), 'research.json'), 'utf8'));
    } catch {
      return undefined;
    }
  }

  /** A fresh card id (P3.8: a design card's file is written under its id before the card is placed). */
  mintCardId(): string {
    return `c_${ulid(this.now())}`;
  }

  /** Write (or rewrite) design card `cardId`'s HTML to `assets/design/<cardId>.html` (P3.8). Returns that path. */
  async writeDesignFile(id: string, cardId: string, html: string): Promise<string> {
    await this.open(id);
    this.assertOpen();
    return writeDesignFile(this.dirOf(id), cardId, html);
  }

  /** Drop the file of a design card that was never placed (P3.8). */
  async removeDesignFile(id: string, cardId: string): Promise<void> {
    await removeDesignFile(this.dirOf(validId(id)), cardId);
  }

  /** The file behind an asset path of a canvas (only regular files directly inside `assets/`). */
  async assetFile(id: string, path: string): ReturnType<typeof assetFile> {
    await this.open(id);
    return assetFile(this.dirOf(id), path);
  }

  /**
   * P4.4: store a design-frame snapshot (PNG, 2x) in `assets/snapshots/`, named with the card, its version and the
   * capture time. The card must be a design card of the canvas.
   */
  async writeSnapshot(
    id: string,
    input: { cardId: string; version: number; data: AsyncIterable<Uint8Array>; signal?: AbortSignal },
  ): Promise<SnapshotRef> {
    const board = await this.board(id);
    this.assertOpen();
    if (board.card(input.cardId)?.type !== 'design')
      throw new CanvasError('orb/not-found', `no design card ${input.cardId} on this canvas`, {
        cardId: input.cardId,
      });
    return storeSnapshot(this.dirOf(id), { ...input, capturedAt: this.now() });
  }

  /** P4.4: store an exported PDF in the canvas's `exports/` under a timestamped name. */
  async writeExport(
    id: string,
    input: { kind: PrintKind; data: AsyncIterable<Uint8Array>; signal?: AbortSignal; ext?: 'pdf' | 'pptx' },
  ): Promise<ExportRef> {
    await this.open(id);
    this.assertOpen();
    return storeExport(this.dirOf(id), { ...input, at: this.now() });
  }

  /**
   * P6.3: the dataset of a Table card (the whole stored CSV when it has one), and the data and view that make the card
   * a Database card. The caller sends them as ONE undoable `card.updated` (`type`, `data`, `view`); undo turns the card
   * back into the table (the dataset file stays; it is small and a redo needs it).
   */
  async tableToDatabase(
    id: string,
    cardId: string,
  ): Promise<{ data: DatabaseData; view: CardView; truncated: boolean }> {
    const board = await this.board(id);
    this.assertOpen();
    const card = board.card(cardId);
    if (!card)
      throw new CanvasError('orb/not-found', `no card ${JSON.stringify(cardId)} on this board`, { cardId });
    if (card.type !== 'table')
      throw new CanvasError('orb/invalid-args', `card ${cardId} is a ${card.type} card, not a table`, {
        cardId,
      });
    return this.datasets.fromTable(id, card, async (path) => {
      try {
        const file = await assetFile(this.dirOf(id), path);
        return await readFile(file.file, 'utf8');
      } catch {
        return undefined;
      }
    });
  }

  /** Every canvas with a readable canvas.json, newest first. */
  async list(): Promise<CanvasMeta[]> {
    this.assertOpen();
    let names: string[];
    try {
      names = await readdir(this.canvasesDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const metas: CanvasMeta[] = [];
    for (const name of names) {
      if (!CanvasId.safeParse(name).success) continue;
      try {
        metas.push(await this.open(name));
      } catch {
        // skip folders that are not (or no longer) canvases
      }
    }
    return metas.sort((a, b) => b.created - a.created);
  }

  /**
   * Fold a canvas's board.jsonl READ-ONLY (no tail repair, no writer): the open board when it is loaded, else the
   * valid prefix of the file on disk. For tile previews and the search index.
   */
  async readBoard(id: string): Promise<{ state: BoardState; lastTs: number }> {
    const canvasId = validId(id);
    const open = this.openBoards.get(canvasId);
    if (open) return { state: open.current, lastTs: open.lastTs };
    let buf: Buffer;
    try {
      buf = await readFile(join(this.dirOf(canvasId), BOARD_FILE));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { state: fold([]), lastTs: 0 };
      throw err;
    }
    const { events } = scanBoardLog(buf);
    return { state: fold(events), lastTs: events.at(-1)?.ts ?? 0 };
  }

  /** The mini preview of one canvas's board (cached for boards that are not open). */
  async preview(meta: CanvasMeta): Promise<CanvasPreview> {
    const open = this.openBoards.get(meta.id);
    if (open) return previewOf(open.current, open.lastTs || meta.created);
    let key = 'missing';
    try {
      const st = await stat(join(this.dirOf(meta.id), BOARD_FILE));
      key = `${st.size}:${st.mtimeMs}`;
    } catch {
      // no board.jsonl: an empty board
    }
    const cached = this.previews.get(meta.id);
    if (cached?.key === key) return cached.preview;
    const { state, lastTs } = await this.readBoard(meta.id);
    const preview = previewOf(state, lastTs || meta.created);
    this.previews.set(meta.id, { key, preview });
    return preview;
  }

  /** Home tiles: every canvas with its preview, most recently changed first (status is added by orb-host). */
  async summaries(): Promise<(CanvasMeta & { preview: CanvasPreview })[]> {
    const metas = await this.list();
    const out = await Promise.all(
      metas.map(async (meta) => {
        try {
          return { ...meta, preview: await this.preview(meta) };
        } catch {
          return { ...meta, preview: previewOf(fold([]), meta.created) };
        }
      }),
    );
    return out.sort((a, b) => b.preview.updated - a.preview.updated || b.created - a.created);
  }

  /**
   * Bring the search index up to date in the background after `delayMs` (the sidecar calls this at start, so the
   * index is built, or caught up with boards changed elsewhere, before the first search). Errors are only logged.
   */
  warmIndex(delayMs: number): void {
    if (!this.index) return;
    const index = this.index;
    const timer = setTimeout(() => {
      if (this.closing) return;
      index
        .sync()
        .catch((err: unknown) =>
          this.options.log?.('warn', `orb-canvas: search index warm-up failed: ${String(err)}`),
        );
    }, delayMs);
    timer.unref?.();
  }

  /** Full-text search across every canvas (index.sqlite; rebuilt first when it is missing). */
  async search(request: unknown): Promise<CanvasSearchResult> {
    this.assertOpen();
    const parsed = CanvasSearchArgs.safeParse(request);
    if (!parsed.success)
      throw new CanvasError(
        'orb/invalid-args',
        `invalid search: ${parsed.error.issues[0]?.message ?? 'bad value'}`,
      );
    if (!this.index) return { hits: [], rebuilt: false };
    return this.index.search(parsed.data.q, parsed.data.limit);
  }

  /** The open board of a canvas: loaded (tail repaired, log folded) once, then cached until close. */
  board(id: string): Promise<Board> {
    let canvasId: string;
    try {
      this.assertOpen();
      canvasId = validId(id);
    } catch (err) {
      return Promise.reject(err);
    }
    let board = this.boards.get(canvasId);
    if (!board) {
      board = this.load(canvasId);
      this.boards.set(canvasId, board);
      board.catch(() => this.boards.delete(canvasId));
    }
    return board;
  }

  /** P6.9: asset GC runs in flight (they start when a board loads and finish on their own). */
  private readonly assetGcRuns = new Set<Promise<void>>();

  /** Resolves when every asset GC run started so far has finished (tests, shutdown). */
  async assetGcIdle(): Promise<void> {
    await Promise.all([...this.assetGcRuns]);
  }

  private async load(id: string): Promise<Board> {
    await this.open(id);
    const { log, events, recovery } = await BoardLog.open(join(this.canvasesDir, id, BOARD_FILE), {
      ...(this.options.flushMs !== undefined ? { flushMs: this.options.flushMs } : {}),
      onError: (err) => {
        this.options.log?.('error', `orb-canvas: board ${id} write failed: ${String(err)}`);
        this.options.onError?.(err);
      },
    });
    if (recovery.truncatedBytes > 0) {
      this.options.log?.(
        'warn',
        `orb-canvas: board ${id}: dropped ${recovery.droppedLines} torn/invalid tail line(s) (${recovery.truncatedBytes} bytes)`,
      );
    }
    const board = new Board(id, fold(events), log, recovery, this.now, events.at(-1)?.ts ?? 0);
    if (this.index) {
      const index = this.index;
      board.subscribe((event) => index.noteEvent(id, event));
    }
    this.openBoards.set(id, board);
    // P6.9: files of undone drops (no card refers to them; the redo stack of this session is empty) are removed.
    const gc = collectUnreferencedAssets(join(this.canvasesDir, id), () => board.current, this.now())
      .then((removed) => {
        if (removed.length > 0)
          this.options.log?.(
            'info',
            `orb-canvas: board ${id}: removed ${removed.length} unreferenced upload(s)`,
          );
      })
      .catch((err) => this.options.log?.('warn', `orb-canvas: board ${id}: asset GC failed: ${String(err)}`));
    this.assetGcRuns.add(gc);
    void gc.finally(() => this.assetGcRuns.delete(gc));
    return board;
  }

  /**
   * Apply a user (or agent) command (BoardCommand: frame/card/link add, update, move, remove, or a batch of them).
   * Validated against the board first (unknown ids, agents touching user notes), then appended as one unit.
   * Returns the appended events in order.
   */
  async commandEvents(
    id: string,
    command: BoardCommandInput,
    actor: Actor = { kind: 'user' },
  ): Promise<BoardEvent[]> {
    const cmd = BoardCommand.parse(command);
    const board = await this.board(id);
    this.assertOpen();
    await this.assertDatasets(id, board.current, cmd);
    const now = this.now();
    let changes: BoardChange[];
    try {
      changes = planCommand(board.current, cmd, {
        actor,
        now,
        mintId: (prefix) => `${prefix}_${ulid(now)}`,
      });
    } catch (err) {
      if (err instanceof BoardCommandError || (err as Error)?.name === 'BoardCommandError') {
        const e = err as BoardCommandError;
        const code =
          e.code === 'not-found'
            ? 'orb/not-found'
            : e.code === 'forbidden'
              ? 'orb/forbidden'
              : 'orb/invalid-args';
        throw new CanvasError(code, `${e.message} on ${id}`, { canvasId: id, ...e.details });
      }
      throw err;
    }
    const tag = cmd.pendingId ? { pendingId: cmd.pendingId } : {};
    if (cmd.type === 'card.opened') {
      // Opening is not an edit: written once per card, never on the undo stack (and it keeps the redo stack).
      return board.card(cmd.id)?.opened ? [] : board.appendAll(changes, actor, tag);
    }
    // Only user actions go on the undo stack (PRD: undo never reverses agent actions).
    const events =
      actor.kind === 'user' ? board.appendUserAction(changes, tag) : board.appendAll(changes, actor, tag);
    await this.refreshCharts(id, board, actor);
    return events;
  }

  /**
   * P6.4: a bound Chart's plotted points follow its Table card or dataset. Run after every command and undo/redo; it
   * appends nothing when every chart is current, and never touches the undo stack (a chart's points are derived).
   */
  private async refreshCharts(id: string, board: Board, actor: Actor): Promise<void> {
    if (!Object.values(board.current.cards).some((c) => c.type === 'chart')) return;
    const changes = await this.datasets.chartChanges(id, board.current);
    if (changes.length > 0) board.appendAll(changes, actor);
  }

  /** P6.3: a card may only name a dataset of this canvas (a Database card's data, a `view`). */
  private async assertDatasets(id: string, state: BoardState, cmd: BoardCommand): Promise<void> {
    const singles = cmd.type === 'batch' ? cmd.commands : [cmd];
    for (const c of singles) {
      let named: string[] = [];
      if (c.type === 'card.added') named = DatasetService.referencedIds(c.card);
      else if (c.type === 'card.updated') {
        const type = c.patch.type ?? state.cards[c.id]?.type;
        named = DatasetService.referencedIds({
          ...(type ? { type } : {}),
          ...('data' in c.patch ? { data: c.patch.data } : {}),
          view: c.patch.view,
        });
      }
      await this.assertNamedDatasets(id, named);
    }
  }

  private async assertNamedDatasets(id: string, named: readonly string[]): Promise<void> {
    for (const dsId of named) {
      if (!(await this.datasets.exists(id, dsId)))
        throw new CanvasError('orb/not-found', `no dataset ${dsId} on this canvas`, { datasetId: dsId });
    }
  }

  /**
   * `orb/board.command`: a board command or undo/redo, from the user. Returns the events written and the
   * undo/redo depth after it.
   */
  async userCommand(
    id: string,
    request: BoardCommandRequestInput,
  ): Promise<{ events: BoardEvent[]; history: BoardHistoryDepth }> {
    const cmd = BoardCommandRequest.parse(request);
    if (cmd.type === 'layout.repacked') {
      const board = await this.board(id);
      this.assertOpen();
      const events = board.appendUserAction(planRepack(board.current));
      return { events, history: board.history };
    }
    if (isMeasureCommand(cmd)) {
      const board = await this.board(id);
      this.assertOpen();
      // P6.20: not an edit, never on the undo stack; the heights are persisted as ordinary card events, so a reopened
      // board is exactly this one.
      const changes = planMeasured(board.current, cmd.heights);
      const events = changes.length > 0 ? board.appendAll(changes, { kind: 'user' }) : [];
      return { events, history: board.history };
    }
    if (!isHistoryCommand(cmd)) {
      const events = await this.commandEvents(id, cmd, { kind: 'user' });
      return { events, history: (await this.board(id)).history };
    }
    const board = await this.board(id);
    this.assertOpen();
    const events = board.undoRedo(cmd.type, cmd.pendingId ? { pendingId: cmd.pendingId } : {});
    await this.refreshCharts(id, board, { kind: 'user' });
    return { events, history: board.history };
  }

  /** Undo/redo depth of a canvas in this app session. */
  async history(id: string): Promise<BoardHistoryDepth> {
    return (await this.board(id)).history;
  }

  /** `commandEvents`, resolving with the last event written (a single command writes exactly one). */
  async command(
    id: string,
    command: BoardCommandInput,
    actor: Actor = { kind: 'user' },
  ): Promise<BoardEvent> {
    const events = await this.commandEvents(id, command, actor);
    return events.at(-1)!;
  }

  /**
   * Follow a board: a snapshot first, then every new event, until `signal` aborts or the store closes.
   * Subscribing and taking the snapshot happen in the same tick, so no event falls between them.
   */
  async *follow(id: string, signal?: AbortSignal): AsyncGenerator<BoardFollowFrame> {
    const board = await this.board(id);
    const stop = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal;
    const queue: { event: BoardEvent; tag: AppendTag }[] = [];
    let wake: (() => void) | null = null;
    const unsubscribe = board.subscribe((event, tag) => {
      queue.push({ event, tag });
      wake?.();
    });
    const onStop = () => wake?.();
    stop.addEventListener('abort', onStop);
    try {
      yield board.snapshot();
      while (!stop.aborted) {
        const next = queue.shift();
        if (next) {
          yield { kind: 'event', event: next.event, ...next.tag };
          continue;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = null;
      }
    } finally {
      stop.removeEventListener('abort', onStop);
      unsubscribe();
    }
  }

  /** Flush every open board now. */
  async flush(): Promise<void> {
    const boards = await Promise.allSettled(this.boards.values());
    await Promise.all(boards.map((b) => (b.status === 'fulfilled' ? b.value.flush() : undefined)));
  }

  /** End follow streams, then flush + fsync + close every board log. Idempotent. */
  close(): Promise<void> {
    this.closing ??= (async () => {
      this.lifetime.abort();
      const boards = await Promise.allSettled(this.boards.values());
      this.boards.clear();
      await Promise.all(boards.map((b) => (b.status === 'fulfilled' ? b.value.close() : undefined)));
      // Record the flushed log sizes so the next start finds the index current.
      const sizes = new Map<string, { seq: number; size: number }>();
      for (const board of this.openBoards.values()) {
        try {
          sizes.set(board.canvasId, {
            seq: board.seq,
            size: (await stat(join(this.dirOf(board.canvasId), BOARD_FILE))).size,
          });
        } catch {
          // gone: the next sync drops it
        }
      }
      this.openBoards.clear();
      await this.index?.close(sizes);
    })();
    return this.closing;
  }

  private assertOpen(): void {
    if (this.closing) throw new CanvasError('orb/closed', 'the canvas service is shutting down');
  }
}
