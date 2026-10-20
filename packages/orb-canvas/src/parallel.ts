/**
 * Cordis row `orb-parallel` (`@orb/canvas/parallel`, P6.7) and its service `orbParallel`: Parallel AI for the
 * canvas (docs/phase6/parallel-api-spec.md). The harness-free REST client is in `@orb/sources`; this module is what
 * sits between it and the board:
 *
 * - the client with the key from the credentials service (resolved at EVERY call, never cached);
 * - the cost guard: a run over the threshold (or one of the always-ask kinds) is placed first as a card that waits for
 *   the user's Approve or Decline (`confirm`, from `orb/parallel.confirm`), and the tool waits for the answer;
 * - long runs (Task, Task Group, FindAll): a follower per run reads the progress (Task SSE, group SSE, FindAll SSE with
 *   `last_event_id`, polling as the fallback), writes it into the run's card, and on completion puts the cited result
 *   into the card and its sources on the board. Aborting the tool DETACHES a Task or group run (Parallel has no cancel
 *   for them: the run goes on and is billed; the card says so) and really CANCELS a FindAll run;
 * - the run registry, `assets/parallel/runs.json` in the canvas folder (written here, the only writer), so a run
 *   in flight survives a restart: `resumeCanvas` re-attaches the runs and pulls the watches' new events.
 *
 * Board state is only written through the CanvasStore (cards, links, datasets). Progress writes are throttled.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PARALLEL_CONFIRM_ABOVE_USD,
  PARALLEL_KEY_REF,
  RESEARCH_ACTIVE,
  ResearchData,
  WatchData,
  readCardData,
  type Actor,
  type Card,
  type ResearchStatus,
} from '@orb/shared';
import {
  ParallelClient,
  citationsOf,
  eventJson,
  fieldsOf,
  normalizeUrl,
  outputText,
  type Basis,
  type Citation,
  type ParallelDeps,
  type TaskRunResult,
} from '@orb/sources';
import { CanvasError, isCanvasError } from './errors.js';
import { attachRun, pullWatch } from './parallelFlows.js';
import type { CanvasStore } from './store.js';

export const name = 'orb-parallel';
export const inject = ['credentials', 'orbCanvas'];
export const ORB_PARALLEL_SERVICE = 'orbParallel';

type AgentActor = Extract<Actor, { kind: 'agent' }>;

export type RunKind = 'task' | 'group' | 'findall';
export type RunStatus = 'running' | 'completed' | 'failed' | 'detached' | 'cancelled' | 'declined';

/** One run in the registry. */
export type RunRecord = {
  /** The Parallel id: a Task run id, a Task Group id, or a FindAll id. */
  runId: string;
  kind: RunKind;
  cardId: string;
  status: RunStatus;
  actor: AgentActor;
  frameId: string | null;
  title: string;
  processor?: string;
  estCostUsd?: number;
  createdAt: number;
  interactionId?: string;
  /** Task: how the output was asked for. */
  outputKind?: 'text' | 'json' | 'auto';
  /** Group: the run id of each row, in row order; and which dataset column holds what. */
  rowRunIds?: string[];
  datasetId?: string;
  keyColumn?: string;
  outputColumns?: string[];
  /** Group: the output schema's property names, in column order. */
  outputProps?: string[];
  /** FindAll. */
  lastEventId?: string;
  termination?: string;
  conditionNames?: string[];
  enrichmentColumns?: string[];
};

export type CredentialsLike = {
  resolve(ref: string): Promise<{ value: string } | undefined>;
  describe(ref: string): Promise<{ configured: boolean }>;
};

export type ParallelServiceOptions = {
  credentials?: CredentialsLike | undefined;
  /** The credential reference of the key (default PARALLEL_API_KEY). */
  keyRef?: string;
  baseUrl?: string;
  confirmAboveUsd?: number;
  fetch?: typeof fetch;
  now?: () => number;
  /** Minimum ms between two progress writes to one card (default 700). */
  throttleMs?: number;
  /** Pause before an SSE reconnect or a poll, ms (default 1500). */
  pollMs?: number;
  /** Task long-poll seconds (default 25). */
  longPollSeconds?: number;
  retryDelayMs?: number;
  /** How long a card waits for the user's answer, ms (default 30 min). */
  approvalTimeoutMs?: number;
};

const RUNS_FILE = join('assets', 'parallel', 'runs.json');
const key = (canvasId: string, cardId: string) => `${canvasId}/${cardId}`;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal!.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/** The actor of a card's provenance (without the time). */
export function actorOfCard(card: Card): AgentActor | undefined {
  const { at: _at, ...actor } = card.provenance as Card['provenance'] & { at?: number };
  return actor.kind === 'agent' ? (actor as AgentActor) : undefined;
}

export class ParallelService {
  readonly confirmAboveUsd: number;
  private readonly lifetime = new AbortController();
  private tmpSeq = 0;
  private readonly pending = new Map<string, (approved: boolean) => void>();
  private readonly followers = new Map<string, Promise<void>>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly writers = new Map<string, { last: number; data?: Record<string, unknown>; timer?: ReturnType<typeof setTimeout> }>();
  readonly client: ParallelClient;
  private readonly now: () => number;

  constructor(
    readonly store: CanvasStore,
    private readonly options: ParallelServiceOptions = {},
  ) {
    this.confirmAboveUsd = options.confirmAboveUsd ?? PARALLEL_CONFIRM_ABOVE_USD;
    this.now = options.now ?? Date.now;
    const deps: ParallelDeps = {
      apiKey: () => this.apiKey(),
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.retryDelayMs !== undefined ? { retryDelayMs: options.retryDelayMs } : {}),
    };
    this.client = new ParallelClient(deps);
  }

  private get ref(): string {
    return this.options.keyRef || PARALLEL_KEY_REF;
  }

  /** The key for one operation (resolved now, never kept). */
  async apiKey(): Promise<string | undefined> {
    return (await this.options.credentials?.resolve(this.ref))?.value || undefined;
  }

  /** Is a key set? (describe only: no value is read). */
  async configured(): Promise<boolean> {
    try {
      return (await this.options.credentials?.describe(this.ref))?.configured === true;
    } catch {
      return false;
    }
  }

  /** Pause between polls and reconnects, ms. */
  get pollMs(): number {
    return this.options.pollMs ?? 1500;
  }

  /** The signal of work that outlives a tool call (background followers); aborted on dispose. */
  get signal(): AbortSignal {
    return this.lifetime.signal;
  }

  dispose(): void {
    this.lifetime.abort(new Error('orb-parallel disposed'));
    for (const w of this.writers.values()) if (w.timer) clearTimeout(w.timer);
    for (const resolve of this.pending.values()) resolve(false);
    this.pending.clear();
  }

  // ---- the registry (assets/parallel/runs.json) ----

  private file(canvasId: string): string {
    return join(this.store.dirOf(canvasId), RUNS_FILE);
  }

  private serial<T>(canvasId: string, job: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(canvasId) ?? Promise.resolve()).then(job, job);
    this.queues.set(canvasId, run.catch(() => undefined));
    return run;
  }

  async runs(canvasId: string): Promise<RunRecord[]> {
    try {
      const raw = JSON.parse(await readFile(this.file(canvasId), 'utf8')) as { runs?: RunRecord[] };
      return Array.isArray(raw.runs) ? raw.runs : [];
    } catch {
      return [];
    }
  }

  async findRun(canvasId: string, runId: string): Promise<RunRecord | undefined> {
    return (await this.runs(canvasId)).find((r) => r.runId === runId);
  }

  /** Add or replace a record. */
  saveRun(canvasId: string, rec: RunRecord): Promise<void> {
    return this.serial(canvasId, async () => {
      const runs = await this.runs(canvasId);
      const i = runs.findIndex((r) => r.runId === rec.runId);
      if (i >= 0) runs[i] = rec;
      else runs.push(rec);
      const file = this.file(canvasId);
      await mkdir(join(file, '..'), { recursive: true });
      const tmp = `${file}.${process.pid}.${++this.tmpSeq}.${Math.random().toString(36).slice(2, 8)}.tmp`;
      await writeFile(tmp, JSON.stringify({ v: 1, runs }), 'utf8');
      await rename(tmp, file);
    });
  }

  async updateRun(canvasId: string, runId: string, patch: Partial<RunRecord>): Promise<RunRecord | undefined> {
    const rec = await this.findRun(canvasId, runId);
    if (!rec) return undefined;
    const next = { ...rec, ...patch };
    await this.saveRun(canvasId, next);
    return next;
  }

  // ---- cards ----

  /** Write `data` fields into a card (a `card.updated`, off the undo stack), at most every `throttleMs` unless `now`. */
  async patchCard(canvasId: string, cardId: string, actor: AgentActor, data: Record<string, unknown>, now = false): Promise<void> {
    const k = key(canvasId, cardId);
    const w = this.writers.get(k) ?? { last: 0 };
    this.writers.set(k, w);
    w.data = { ...w.data, ...data };
    const wait = (this.options.throttleMs ?? 700) - (this.now() - w.last);
    if (!now && wait > 0) {
      w.timer ??= setTimeout(() => {
        w.timer = undefined;
        void this.flushCard(canvasId, cardId, actor).catch(() => undefined);
      }, wait);
      return;
    }
    if (w.timer) clearTimeout(w.timer);
    w.timer = undefined;
    await this.flushCard(canvasId, cardId, actor);
  }

  private async flushCard(canvasId: string, cardId: string, actor: AgentActor): Promise<void> {
    const k = key(canvasId, cardId);
    const w = this.writers.get(k);
    if (!w?.data) return;
    const pending = w.data;
    w.data = undefined;
    w.last = this.now();
    const board = await this.store.board(canvasId);
    const card = board.current.cards[cardId];
    if (!card) return;
    const next = { ...(card.data as Record<string, unknown>), ...pending };
    for (const [f, v] of Object.entries(next)) if (v === undefined) delete next[f];
    board.appendAll([{ type: 'card.updated', data: { id: cardId, patch: { data: next } } }], actor);
  }

  /** Write everything pending for a card now. */
  async settleCard(canvasId: string, cardId: string, actor: AgentActor): Promise<void> {
    const w = this.writers.get(key(canvasId, cardId));
    if (w?.timer) clearTimeout(w.timer);
    if (w) w.timer = undefined;
    await this.flushCard(canvasId, cardId, actor);
  }

  async card(canvasId: string, cardId: string): Promise<Card | undefined> {
    return (await this.store.board(canvasId)).current.cards[cardId];
  }

  /** Place an agent card; a full frame falls back to the open board (a run card must never be lost to the budget). */
  async placeCard(
    canvasId: string,
    input: { type: 'research' | 'watch' | 'source' | 'doc' | 'database'; frameId: string | null; data: unknown; why: string; view?: any },
    actor: AgentActor,
  ): Promise<Card> {
    const attempt = async (frameId: string | null) => {
      const event = await this.store.placeAgentCard(canvasId, { ...input, frameId }, actor);
      return (event.data as { card: Card }).card;
    };
    try {
      return await attempt(input.frameId);
    } catch (err) {
      if (input.frameId && isCanvasError(err) && err.code === 'orb/frame-full' && input.type !== 'source') return attempt(null);
      throw err;
    }
  }

  /** Link a run card to a card it produced. Failures are not fatal. */
  async linkCards(canvasId: string, from: string, to: string, label: string, actor: AgentActor): Promise<void> {
    try {
      await this.store.addAgentLink(canvasId, { from, to, type: 'label', label }, actor);
    } catch {
      // a link is a nicety
    }
  }

  // ---- the cost guard ----

  /**
   * Wait for the user's answer on a card placed `awaiting_approval`. Resolves true (approved) or false (declined, or
   * no answer in time). A stop (abort) declines it and throws the abort reason.
   */
  waitForApproval(canvasId: string, cardId: string, signal: AbortSignal): Promise<boolean> {
    const k = key(canvasId, cardId);
    return new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => done(false), this.options.approvalTimeoutMs ?? 30 * 60_000);
      const done = (approved: boolean) => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        this.pending.delete(k);
        resolve(approved);
      };
      const onAbort = () => {
        clearTimeout(timeout);
        this.pending.delete(k);
        reject(signal.reason);
      };
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
      this.pending.set(k, done);
    });
  }

  /** The user's answer (`orb/parallel.confirm`). `expired`: nothing waits for it (orb was restarted). */
  async confirm(canvasId: string, cardId: string, approve: boolean): Promise<'approved' | 'declined' | 'expired'> {
    await this.store.open(canvasId);
    const card = await this.card(canvasId, cardId);
    if (!card || (card.type !== 'research' && card.type !== 'watch'))
      throw new CanvasError('orb/not-found', `no research run or watch ${JSON.stringify(cardId)} on this board`, { cardId });
    const status = (card.data as { status?: string }).status;
    if (status !== 'awaiting_approval') throw new CanvasError('orb/invalid-args', 'this card is not waiting for an answer', { cardId });
    const resolve = this.pending.get(key(canvasId, cardId));
    if (!resolve) {
      const actor = actorOfCard(card);
      if (actor)
        await this.patchCard(canvasId, cardId, actor, { status: 'declined', note: 'orb was restarted before this was approved. Ask again.' }, true);
      return 'expired';
    }
    resolve(approve);
    return approve ? 'approved' : 'declined';
  }

  /** Cards left `awaiting_approval` by an earlier run of the sidecar can never be answered: decline them. */
  async expireApprovals(canvasId: string): Promise<void> {
    const board = await this.store.board(canvasId);
    for (const card of Object.values(board.current.cards)) {
      if (card.type !== 'research' && card.type !== 'watch') continue;
      if ((card.data as { status?: string }).status !== 'awaiting_approval' || this.pending.has(key(canvasId, card.id))) continue;
      const actor = actorOfCard(card);
      if (actor)
        await this.patchCard(canvasId, card.id, actor, { status: 'declined', note: 'orb was restarted before this was approved. Ask again.' }, true);
    }
  }

  // ---- followers: Task run ----

  /** Is a follower attached to this run? */
  following(runId: string): boolean {
    return this.followers.has(runId);
  }

  /** Run `job` as the one follower of `runId` (a second request joins the first). */
  follow(runId: string, job: () => Promise<void>): Promise<void> {
    const existing = this.followers.get(runId);
    if (existing) return existing;
    const p = job().finally(() => this.followers.delete(runId));
    this.followers.set(runId, p);
    return p;
  }

  /**
   * Follow a Task run until it is over (SSE with reconnects, polling as the fallback), writing progress into the card.
   * Resolves with the result; throws the abort reason when `signal` fires (the caller detaches) or an Error when the
   * run failed.
   */
  async followTask(canvasId: string, rec: RunRecord, signal: AbortSignal): Promise<TaskRunResult> {
    const seen = new Set<string>();
    const messages: string[] = [];
    let sourcesRead = 0;
    let streamFailures = 0;
    for (;;) {
      signal.throwIfAborted();
      let output: TaskRunResult['output'] | undefined;
      let state: string | undefined;
      try {
        for await (const ev of this.client.taskEvents(rec.runId, { signal })) {
          const data = eventJson<any>(ev);
          if (!data) continue;
          const type: string = data.type ?? ev.event;
          if (type === 'task_run.state') {
            state = data.run?.status;
            if (data.output) output = data.output;
            if (state === 'failed' || state === 'cancelled') break;
            if (state === 'completed') break;
          } else if (type === 'task_run.progress_stats') {
            sourcesRead = data.source_stats?.num_sources_read ?? sourcesRead;
            await this.patchCard(canvasId, rec.cardId, rec.actor, {
              status: 'running',
              progress: Math.max(0, Math.min(100, Number(data.progress_meter ?? 0))),
              sourcesRead,
            });
          } else if (type.startsWith('task_run.progress_msg')) {
            const msg = String(data.message ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
            const id = `${data.timestamp ?? ''}|${msg}`;
            if (msg && !seen.has(id)) {
              seen.add(id);
              messages.push(msg);
              await this.patchCard(canvasId, rec.cardId, rec.actor, { status: 'running', messages: messages.slice(-8) });
            }
          } else if (type === 'error') {
            streamFailures++;
          }
        }
        streamFailures = 0;
      } catch (err) {
        if (signal.aborted) throw signal.reason;
        // A refused key, a 404 or a validation error will not get better by retrying.
        if ((err as { status?: number })?.status && !(err as { retryable?: boolean }).retryable) throw err;
        streamFailures++;
        if (streamFailures > 5) throw err;
      }
      if (state === 'failed' || state === 'cancelled') throw new Error(`the Parallel run ${state === 'failed' ? 'failed' : 'was cancelled'}`);
      if (output) return { run: { run_id: rec.runId, status: 'completed' }, output };
      // The stream closed with the run still going (570 s cap) or without its output: ask for the result (long poll),
      // which answers 408 (undefined) while the run is active.
      const result = await this.client.taskResult(rec.runId, this.options.longPollSeconds ?? 25, { signal }).catch((err) => {
        if (signal.aborted) throw signal.reason;
        if ((err as { status?: number })?.status === 404) throw new Error('the Parallel run failed');
        if ((err as { status?: number })?.status && !(err as { retryable?: boolean }).retryable) throw err;
        return undefined;
      });
      if (result) return result;
      await sleep(this.options.pollMs ?? 1500, signal);
    }
  }

  /** Put a finished Task result into its card and its sources on the board. */
  async finishTask(canvasId: string, rec: RunRecord, result: TaskRunResult): Promise<{ summary: string; citations: Citation[] }> {
    const basis: Basis[] | undefined = result.output.basis;
    const citations = citationsOf(basis);
    const summary = outputText(result.output.content);
    // The registry first: a card that says "completed" is never ahead of its record.
    await this.updateRun(canvasId, rec.runId, { status: 'completed' });
    await this.patchCard(
      canvasId,
      rec.cardId,
      rec.actor,
      {
        status: 'completed',
        progress: 100,
        summary,
        fields: fieldsOf(basis),
        citations: citations.slice(0, 60),
        note: undefined,
        error: undefined,
        finishedAt: this.now(),
      },
      true,
    );
    await this.placeSources(canvasId, rec, citations, 'task');
    return { summary, citations };
  }

  /** Source cards for the most-cited sources (at most 12), linked from the run card; the rest stay in its drawer. */
  async placeSources(canvasId: string, rec: RunRecord, citations: readonly Citation[], kind: 'task' | 'findall' | 'monitor', cap = 12): Promise<string[]> {
    const board = await this.store.board(canvasId);
    const have = new Set(
      Object.values(board.current.cards)
        .map((c) => (c.data as { url?: unknown } | null)?.url)
        .filter((u): u is string => typeof u === 'string')
        .map(normalizeUrl),
    );
    const placed: string[] = [];
    const card = board.current.cards[rec.cardId];
    const frameId = card?.frameId ?? rec.frameId;
    for (const c of citations) {
      if (placed.length >= cap) break;
      if (have.has(normalizeUrl(c.url))) continue;
      try {
        const source = await this.placeCard(
          canvasId,
          {
            type: 'source',
            frameId,
            data: {
              url: c.url,
              title: c.title ?? c.url,
              summary: c.excerpt ?? `Cited by "${rec.title}".`,
              ...(c.excerpt ? { excerpts: [c.excerpt.slice(0, 400)] } : {}),
              ...(c.confidence ? { confidence: c.confidence } : {}),
              ...(c.fields.length ? { supports: c.fields } : {}),
              provenance: { provider: 'parallel', kind, id: rec.runId, ...(c.fields[0] ? { field: c.fields[0] } : {}), ...(c.confidence ? { confidence: c.confidence } : {}) },
            },
            why: `Cited by the research "${rec.title}"`.slice(0, 140),
          },
          rec.actor,
        );
        have.add(normalizeUrl(c.url));
        placed.push(source.id);
        await this.linkCards(canvasId, rec.cardId, source.id, 'cites', rec.actor);
      } catch (err) {
        // A full frame or a stop ends the placing; the sources stay in the card's drawer.
        if (isCanvasError(err) && (err.code === 'orb/frame-full' || err.code === 'orb/closed')) break;
        break;
      }
    }
    return placed;
  }

  /** Mark a run detached (the agent stopped waiting): it goes on at Parallel and is billed. */
  async detach(canvasId: string, rec: RunRecord, note?: string): Promise<void> {
    await this.updateRun(canvasId, rec.runId, { status: 'detached' });
    await this.patchCard(
      canvasId,
      rec.cardId,
      rec.actor,
      {
        status: 'detached',
        note: note ?? 'Stopped waiting. The run goes on at Parallel and is billed when it finishes. Ask for research_status to attach again.',
      },
      true,
    );
  }

  async fail(canvasId: string, rec: RunRecord, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    await this.updateRun(canvasId, rec.runId, { status: 'failed' });
    await this.patchCard(canvasId, rec.cardId, rec.actor, { status: 'failed', error: message.slice(0, 600) }, true);
  }

  // ---- restart: re-attach runs and pull the watches' events ----

  /** The statuses a card can have while its run is in flight (re-attach these). */
  static active(status: string | undefined): status is ResearchStatus {
    return RESEARCH_ACTIVE.includes(status as ResearchStatus);
  }

  /**
   * Called when a canvas is opened: declines approvals nobody can answer any more, re-attaches every run that was in
   * flight (a background follower on the service's own lifetime), and pulls new events of the board's watches. Never
   * throws; with no key it does nothing.
   */
  resumeCanvas(canvasId: string): Promise<void> {
    return (async () => {
      if (!(await this.configured())) return;
      await this.expireApprovals(canvasId);
      for (const rec of await this.runs(canvasId)) {
        if (rec.status !== 'running' && rec.status !== 'detached') continue;
        const card = await this.card(canvasId, rec.cardId);
        if (!card) continue;
        void attachRun(this, canvasId, rec).catch(() => undefined);
      }
      const board = await this.store.board(canvasId);
      for (const card of Object.values(board.current.cards)) {
        if (card.type !== 'watch') continue;
        const d = readCardData(WatchData, card.data);
        if (d?.status === 'active' && d.monitorId) void pullWatch(this, canvasId, card, this.signal).catch(() => undefined);
      }
    })().catch(() => undefined);
  }

  /** The research card's data of a record, for the status tool. */
  async researchOf(canvasId: string, cardId: string): Promise<ResearchData | undefined> {
    const card = await this.card(canvasId, cardId);
    return card ? readCardData(ResearchData, card.data) : undefined;
  }
}

/** Cordis entry: provide `orbParallel` (the tools row and orb-host use it). */
export type OrbParallelConfig = { apiKeyEnv?: string; baseUrl?: string; confirmAboveUsd?: number };

export function apply(ctx: any, config: OrbParallelConfig = {}) {
  const base = config.baseUrl || process.env.PARALLEL_BASE_URL || undefined;
  const envThreshold = Number(process.env.PARALLEL_CONFIRM_ABOVE_USD);
  const service = new ParallelService(ctx.orbCanvas as CanvasStore, {
    credentials: ctx.credentials as CredentialsLike | undefined,
    ...(config.apiKeyEnv ? { keyRef: config.apiKeyEnv } : {}),
    ...(base ? { baseUrl: base } : {}),
    ...(config.confirmAboveUsd !== undefined
      ? { confirmAboveUsd: config.confirmAboveUsd }
      : Number.isFinite(envThreshold) && envThreshold >= 0 && process.env.PARALLEL_CONFIRM_ABOVE_USD
        ? { confirmAboveUsd: envThreshold }
        : {}),
  });
  ctx.effect(() => () => service.dispose(), 'orb-parallel: stop followers');
  ctx.provide(ORB_PARALLEL_SERVICE, service);
}
