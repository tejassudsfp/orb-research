/**
 * The long Parallel flows (P6.7), over the {@link ParallelService}: the cost-guarded run card, a Task run, a Task
 * Group (batch enrichment into a Database), a FindAll run (entities into a Database), and a Monitor (a watch).
 * Each flow writes its progress into a card the board streams to the UI, puts the cited result on the board when it is
 * done, and has one abort rule (spec §5.1, §5.7, §8.4):
 *
 * - Task run and Task Group: there is NO cancel endpoint, so an abort only stops waiting. The run is marked
 *   `detached` ("goes on at Parallel and is billed") and `research_status` can attach again.
 * - FindAll: an abort is a real `POST /cancel` (work already done is still billed); the matches so far are kept.
 */
import {
  databaseDataOf,
  newCardView,
  readCardData,
  WatchData,
  type AgentName,
  type Card,
  type Dataset,
  type UpsertRow,
} from '@orb/shared';
import {
  citationsOf,
  eventJson,
  fieldsOf,
  needsConfirmation,
  outputText,
  type Basis,
  type FindAllCandidate,
  type FindAllRun,
  type TaskRunResult,
} from '@orb/sources';
import { isCanvasError } from './errors.js';
import { actorOfCard, type ParallelService, type RunRecord } from './parallel.js';

type AgentActor = RunRecord['actor'];
export type Caller = { canvasId: string; role: AgentName; actor: AgentActor };

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

// ---- the cost guard ----

export type RunCardInput = {
  type: 'research' | 'watch';
  data: Record<string, unknown>;
  frameId: string | null;
  why: string;
  /** Estimated spend, US dollars. */
  estUsd: number;
  /** Ask even under the threshold (ultra and above, FindAll core/pro, groups over 50 rows, every monitor). */
  always?: boolean;
};

/**
 * Place the run's card and, when the cost guard applies, wait for the user's Approve or Decline on it (or in the
 * conversation panel). The card ends `queued` (approved or under the threshold) or `declined`.
 */
export async function placeRunCard(
  svc: ParallelService,
  caller: Caller,
  input: RunCardInput,
  signal: AbortSignal,
): Promise<{ card: Card; approved: boolean; asked: boolean }> {
  const asked = input.always === true || needsConfirmation(input.estUsd, svc.confirmAboveUsd);
  const status = asked ? 'awaiting_approval' : input.type === 'watch' ? 'active' : 'queued';
  const card = await svc.placeCard(
    caller.canvasId,
    { type: input.type, frameId: input.frameId, data: { ...input.data, status, estCostUsd: input.estUsd }, why: input.why.slice(0, 140) },
    caller.actor,
  );
  if (!asked) return { card, approved: true, asked };
  let approved: boolean;
  try {
    approved = await svc.waitForApproval(caller.canvasId, card.id, signal);
  } catch (err) {
    await svc.patchCard(caller.canvasId, card.id, caller.actor, { status: 'declined', note: 'Stopped before it was approved.' }, true).catch(() => undefined);
    throw err;
  }
  await svc.patchCard(
    caller.canvasId,
    card.id,
    caller.actor,
    approved ? { status: input.type === 'watch' ? 'active' : 'queued', note: undefined } : { status: 'declined', note: 'Declined. Nothing was started and nothing was spent.' },
    true,
  );
  return { card, approved, asked };
}

// ---- Task run ----

export type TaskLaunch = {
  title: string;
  /** The Task input (text or JSON). */
  input: unknown;
  processor: string;
  outputKind: 'text' | 'json' | 'auto';
  taskSpec?: unknown;
  sourcePolicy?: unknown;
  advancedSettings?: unknown;
  previousInteractionId?: string;
  frameId: string | null;
  why: string;
  estUsd: number;
  always: boolean;
};

/** Place the card (and ask), then create the run. Undefined: the user declined. */
export async function launchTask(
  svc: ParallelService,
  caller: Caller,
  launch: TaskLaunch,
  signal: AbortSignal,
): Promise<{ rec: RunRecord; card: Card } | undefined> {
  const { canvasId, actor } = caller;
  const placed = await placeRunCard(
    svc,
    caller,
    {
      type: 'research',
      data: { title: launch.title.slice(0, 200), kind: 'deep_research', processor: launch.processor },
      frameId: launch.frameId,
      why: `Deep research (${launch.processor}) requested by ${actor.agent}`,
      estUsd: launch.estUsd,
      always: launch.always,
    },
    signal,
  );
  if (!placed.approved) return undefined;
  let run;
  try {
    run = await svc.client.taskCreate(
      {
        processor: launch.processor,
        input: launch.input,
        ...(launch.taskSpec ? { task_spec: launch.taskSpec } : {}),
        ...(launch.sourcePolicy ? { source_policy: launch.sourcePolicy } : {}),
        ...(launch.advancedSettings ? { advanced_settings: launch.advancedSettings } : {}),
        ...(launch.previousInteractionId ? { previous_interaction_id: launch.previousInteractionId } : {}),
        enable_events: true,
        metadata: { orb_card: placed.card.id },
        memory_scope_key: `orb:${canvasId}`,
      },
      { signal },
    );
  } catch (err) {
    await svc.patchCard(canvasId, placed.card.id, actor, { status: 'failed', error: (err as Error).message.slice(0, 600) }, true);
    throw err;
  }
  const rec: RunRecord = {
    runId: run.run_id,
    kind: 'task',
    cardId: placed.card.id,
    status: 'running',
    actor,
    frameId: placed.card.frameId,
    title: launch.title.slice(0, 200),
    processor: launch.processor,
    estCostUsd: launch.estUsd,
    createdAt: Date.now(),
    outputKind: launch.outputKind,
    ...(run.interaction_id ? { interactionId: run.interaction_id } : {}),
  };
  await svc.saveRun(canvasId, rec);
  await svc.patchCard(
    canvasId,
    placed.card.id,
    actor,
    { status: 'running', runId: run.run_id, interactionId: run.interaction_id ?? run.run_id, progress: 0, startedAt: Date.now() },
    true,
  );
  return { rec, card: placed.card };
}

/** Wait for a Task run, finish its card, and place its sources. An abort detaches (see the file comment). */
export function trackTask(
  svc: ParallelService,
  canvasId: string,
  rec: RunRecord,
  signal: AbortSignal,
): Promise<{ summary: string; citations: ReturnType<typeof citationsOf> } | undefined> {
  let outcome: { summary: string; citations: ReturnType<typeof citationsOf> } | undefined;
  return svc
    .follow(rec.runId, async () => {
      try {
        const result = await svc.followTask(canvasId, rec, signal);
        outcome = await svc.finishTask(canvasId, rec, result);
      } catch (err) {
        if (signal.aborted) {
          // A disposed service (the sidecar is going away) leaves the run alone: the next start re-attaches it.
          if (!svc.signal.aborted) await svc.detach(canvasId, rec).catch(() => undefined);
          throw signal.reason ?? err;
        }
        if (svc.signal.aborted) throw err;
        await svc.fail(canvasId, rec, err).catch(() => undefined);
        throw err;
      }
    })
    .then(() => outcome);
}

// ---- Task Group (batch enrichment) ----

export type BatchLaunch = {
  title: string;
  rows: Array<string | Record<string, unknown>>;
  /** The JSON schema of one row's output (properties are the new columns). */
  schema: { type: 'object'; properties: Record<string, unknown> } & Record<string, unknown>;
  processor: string;
  sourcePolicy?: unknown;
  frameId: string | null;
  why: string;
  estUsd: number;
  always: boolean;
};

const cellText = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** A row's input columns: an object's keys (at most 12), or one `Input` column for text rows. */
export function inputColumns(rows: BatchLaunch['rows']): string[] {
  const cols: string[] = [];
  for (const r of rows) {
    if (typeof r === 'string') {
      if (!cols.includes('Input')) cols.push('Input');
      continue;
    }
    for (const k of Object.keys(r)) if (!cols.includes(k) && cols.length < 12) cols.push(k);
  }
  return cols.length ? cols : ['Input'];
}

/** Output cells: a value as a cell, nested values as JSON. */
const outCell = (v: unknown): string | number | boolean | null =>
  v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v).slice(0, 1900) : (v as string | number | boolean);

export async function launchBatch(
  svc: ParallelService,
  caller: Caller,
  launch: BatchLaunch,
  signal: AbortSignal,
): Promise<{ rec: RunRecord; card: Card; dataset: Dataset; databaseCardId: string } | undefined> {
  const { canvasId, actor } = caller;
  const placed = await placeRunCard(
    svc,
    caller,
    {
      type: 'research',
      data: { title: launch.title.slice(0, 200), kind: 'batch_enrich', processor: launch.processor, total: launch.rows.length, done: 0 },
      frameId: launch.frameId,
      why: `Batch enrichment of ${launch.rows.length} rows (${launch.processor})`,
      estUsd: launch.estUsd,
      always: launch.always,
    },
    signal,
  );
  if (!placed.approved) return undefined;
  const inCols = inputColumns(launch.rows);
  const outProps = Object.keys(launch.schema.properties);
  const taken = new Set(inCols.map((c) => c.toLowerCase()));
  const outCols = outProps.map((p) => {
    let name = p.slice(0, 100);
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${p.slice(0, 90)} ${n}`;
    taken.add(name.toLowerCase());
    return name;
  });
  const columns = [...inCols, ...outCols, 'Sources', 'Needs review'];
  const tableRows = launch.rows.map((r) => inCols.map((c) => (typeof r === 'string' ? (c === 'Input' ? r : '') : cellText(r[c]))));
  let dataset: Dataset;
  let databaseCardId: string;
  try {
    ({ dataset } = await svc.store.datasets.create(canvasId, launch.title, columns, tableRows, actor));
    const db = await svc.placeCard(
      canvasId,
      { type: 'database', frameId: placed.card.frameId, data: databaseDataOf(launch.title, dataset), why: `The rows of ${launch.title}`.slice(0, 140), view: newCardView(dataset) },
      actor,
    );
    databaseCardId = db.id;
    await svc.linkCards(canvasId, placed.card.id, db.id, 'fills', actor);
    const group = await svc.client.groupCreate({ signal, metadata: { orb_card: placed.card.id } });
    const added = await svc.client.groupAddRuns(
      group.taskgroup_id,
      {
        default_task_spec: { output_schema: { type: 'json', json_schema: launch.schema } },
        inputs: launch.rows.map((r) => ({
          processor: launch.processor,
          input: r,
          ...(launch.sourcePolicy ? { source_policy: launch.sourcePolicy } : {}),
        })),
      },
      { signal },
    );
    const rec: RunRecord = {
      runId: group.taskgroup_id,
      kind: 'group',
      cardId: placed.card.id,
      status: 'running',
      actor,
      frameId: placed.card.frameId,
      title: launch.title.slice(0, 200),
      processor: launch.processor,
      estCostUsd: launch.estUsd,
      createdAt: Date.now(),
      rowRunIds: added.run_ids,
      datasetId: dataset.id,
      outputColumns: outCols,
      outputProps: outProps,
    };
    await svc.saveRun(canvasId, rec);
    await svc.patchCard(
      canvasId,
      placed.card.id,
      actor,
      { status: 'running', runId: group.taskgroup_id, datasetId: dataset.id, total: launch.rows.length, done: 0, progress: 0, startedAt: Date.now() },
      true,
    );
    return { rec, card: placed.card, dataset, databaseCardId };
  } catch (err) {
    await svc.patchCard(canvasId, placed.card.id, actor, { status: 'failed', error: (err as Error).message.slice(0, 600) }, true).catch(() => undefined);
    throw err;
  }
}

/** Follow a Task Group (resumable SSE) filling the dataset row by row, then finish the card. */
export function trackBatch(svc: ParallelService, canvasId: string, rec: RunRecord, signal: AbortSignal): Promise<{ done: number; failed: number; total: number }> {
  let outcome = { done: 0, failed: 0, total: rec.rowRunIds?.length ?? 0 };
  return svc
    .follow(rec.runId, async () => {
      try {
        outcome = await followGroup(svc, canvasId, rec, signal);
      } catch (err) {
        if (signal.aborted) {
          if (!svc.signal.aborted)
            await svc.detach(canvasId, rec, 'Stopped waiting. The batch goes on at Parallel and is billed. Rows filled so far are kept; ask for research_status to attach again.').catch(() => undefined);
          throw signal.reason ?? err;
        }
        if (svc.signal.aborted) throw err;
        await svc.fail(canvasId, rec, err).catch(() => undefined);
        throw err;
      }
    })
    .then(() => outcome);
}

async function followGroup(svc: ParallelService, canvasId: string, rec: RunRecord, signal: AbortSignal) {
  const runIds = rec.rowRunIds ?? [];
  const index = new Map(runIds.map((id, i) => [id, i]));
  const props: string[] = rec.outputProps ?? [];
  const outCols = rec.outputColumns ?? props;
  const dataset = await svc.store.datasets.read(canvasId, rec.datasetId!);
  const rowIds = dataset.rows.map((r) => r.id);
  const finished = new Set<string>();
  let failed = 0;
  let buffer: UpsertRow[] = [];
  let lastFlush = Date.now();
  let lastEventId: string | undefined;
  const citations = new Map<string, ReturnType<typeof citationsOf>[number]>();
  const flush = async (force = false) => {
    if (buffer.length === 0 || (!force && buffer.length < 20 && Date.now() - lastFlush < 700)) return;
    const rows = buffer;
    buffer = [];
    lastFlush = Date.now();
    for (let i = 0; i < rows.length; i += 200) await svc.store.datasets.upsert(canvasId, rec.datasetId!, rows.slice(i, i + 200), {}, rec.actor);
  };
  const progress = async () =>
    svc.patchCard(canvasId, rec.cardId, rec.actor, {
      status: 'running',
      done: finished.size,
      total: runIds.length,
      progress: runIds.length ? Math.round((finished.size / runIds.length) * 100) : 100,
    });
  const take = async (runId: string, status: string) => {
    const i = index.get(runId);
    if (i === undefined || finished.has(runId)) return;
    finished.add(runId);
    const rowId = rowIds[i];
    if (!rowId) return;
    if (status !== 'completed') {
      failed++;
      buffer.push({ rowId, values: { 'Needs review': 'the run failed' } });
      return;
    }
    let result: TaskRunResult | undefined;
    try {
      result = await svc.client.taskResult(runId, 10, { signal });
    } catch (err) {
      if (signal.aborted) throw signal.reason;
      failed++;
      buffer.push({ rowId, values: { 'Needs review': `no result: ${(err as Error).message}`.slice(0, 200) } });
      return;
    }
    if (!result) {
      finished.delete(runId);
      return;
    }
    const content = (typeof result.output.content === 'object' && result.output.content ? result.output.content : {}) as Record<string, unknown>;
    const basis: Basis[] = result.output.basis ?? [];
    const cites = citationsOf(basis);
    for (const c of cites) if (!citations.has(c.url)) citations.set(c.url, c);
    const low = fieldsOf(basis)
      .filter((f) => f.confidence === 'low')
      .map((f) => f.field.split('.')[0]!);
    const values: Record<string, string | number | boolean | null> = {};
    props.forEach((p, n) => {
      values[outCols[n] ?? p] = outCell(content[p]);
    });
    values['Sources'] = cites
      .slice(0, 3)
      .map((c) => c.url)
      .join(' | ')
      .slice(0, 1900);
    values['Needs review'] = [...new Set(low)].join(', ');
    buffer.push({ rowId, values });
  };
  for (;;) {
    signal.throwIfAborted();
    try {
      for await (const ev of svc.client.groupEvents(rec.runId, { signal, ...(lastEventId ? { lastEventId } : {}) })) {
        if (ev.id) lastEventId = ev.id;
        const data = eventJson<any>(ev);
        if (!data) continue;
        const type: string = data.type ?? ev.event;
        if (type === 'task_run.state' && data.run?.run_id) {
          const st: string = data.run.status;
          if (st === 'completed' || st === 'failed' || st === 'cancelled') {
            await take(data.run.run_id, st);
            await flush();
            await progress();
          }
        }
      }
    } catch (err) {
      if (signal.aborted) throw signal.reason;
      if ((err as { status?: number })?.status && !(err as { retryable?: boolean }).retryable) throw err;
    }
    await flush(true);
    const group = await svc.client.groupGet(rec.runId, { signal });
    if (!group.status.is_active) {
      // Anything the events did not report (a missed event) is read from the group now.
      for (const id of runIds) {
        if (finished.has(id)) continue;
        const run = await svc.client.taskGet(id, { signal });
        if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') await take(id, run.status);
      }
      await flush(true);
      break;
    }
    await sleep(svc.pollMs, signal);
  }
  const done = finished.size - failed;
  const cite = [...citations.values()].sort((a, b) => b.fields.length - a.fields.length).slice(0, 60);
  await svc.updateRun(canvasId, rec.runId, { status: 'completed' });
  await svc.patchCard(
    canvasId,
    rec.cardId,
    rec.actor,
    {
      status: 'completed',
      progress: 100,
      done: finished.size,
      total: runIds.length,
      summary: `Enriched ${done} of ${runIds.length} rows${failed ? `; ${failed} failed` : ''}. Open the database for the values and their sources.`,
      citations: cite,
      finishedAt: Date.now(),
      note: undefined,
    },
    true,
  );
  return { done, failed, total: runIds.length };
}

// ---- FindAll (entities) ----

export type FindAllLaunch = {
  title: string;
  objective: string;
  entityType: string;
  conditions: Array<{ name: string; description: string }>;
  generator: 'preview' | 'base' | 'core' | 'pro';
  matchLimit: number;
  enrichments: Array<{ processor: string; schema: { properties: Record<string, unknown> } & Record<string, unknown> }>;
  exclude?: Array<{ name: string; url: string }>;
  frameId: string | null;
  why: string;
  estUsd: number;
  always: boolean;
};

const valueOf = (c: FindAllCandidate, field: string): string => {
  const v = c.output?.[field]?.value;
  return v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v).slice(0, 1900) : String(v);
};

/** The dataset row of a candidate (values by column name). */
function candidateRow(rec: RunRecord, c: FindAllCandidate): UpsertRow {
  const values: Record<string, string | number | boolean | null> = {
    Name: c.name.slice(0, 1900),
    URL: c.url ?? '',
    Description: (c.description ?? '').slice(0, 1900),
    Status: c.match_status,
    Sources: citationsOf(c.basis)
      .slice(0, 3)
      .map((x) => x.url)
      .join(' | ')
      .slice(0, 1900),
  };
  for (const name of rec.conditionNames ?? []) values[name] = valueOf(c, name);
  for (const name of rec.enrichmentColumns ?? []) values[name] = valueOf(c, name);
  return { values };
}

export async function launchFindAll(
  svc: ParallelService,
  caller: Caller,
  launch: FindAllLaunch,
  signal: AbortSignal,
): Promise<{ rec: RunRecord; card: Card; dataset: Dataset; databaseCardId: string } | undefined> {
  const { canvasId, actor } = caller;
  const placed = await placeRunCard(
    svc,
    caller,
    {
      type: 'research',
      data: { title: launch.title.slice(0, 200), kind: 'find_entities', processor: launch.generator, matched: 0, generated: 0 },
      frameId: launch.frameId,
      why: `Entity search (${launch.generator}) requested by ${actor.agent}`,
      estUsd: launch.estUsd,
      always: launch.always,
    },
    signal,
  );
  if (!placed.approved) return undefined;
  try {
    const run = await svc.client.findallCreate(
      {
        objective: launch.objective,
        entity_type: launch.entityType,
        match_conditions: launch.conditions,
        generator: launch.generator,
        match_limit: launch.matchLimit,
        ...(launch.exclude?.length ? { exclude_list: launch.exclude } : {}),
        metadata: { orb_card: placed.card.id },
        memory_scope_key: `orb:${canvasId}`,
      },
      { signal },
    );
    const enrichmentColumns: string[] = [];
    for (const e of launch.enrichments) {
      await svc.client.findallEnrich(
        run.findall_id,
        { processor: e.processor, output_schema: { type: 'json', json_schema: e.schema } },
        { signal },
      );
      for (const p of Object.keys(e.schema.properties)) if (!enrichmentColumns.includes(p)) enrichmentColumns.push(p);
    }
    const conditionNames = launch.conditions.map((c) => c.name);
    const columns = ['Name', 'URL', 'Description', ...conditionNames, ...enrichmentColumns, 'Sources', 'Status'];
    const { dataset } = await svc.store.datasets.create(canvasId, launch.title, columns, [], actor);
    const db = await svc.placeCard(
      canvasId,
      { type: 'database', frameId: placed.card.frameId, data: databaseDataOf(launch.title, dataset), why: `Entities for ${launch.title}`.slice(0, 140), view: newCardView(dataset) },
      actor,
    );
    await svc.linkCards(canvasId, placed.card.id, db.id, 'fills', actor);
    const rec: RunRecord = {
      runId: run.findall_id,
      kind: 'findall',
      cardId: placed.card.id,
      status: 'running',
      actor,
      frameId: placed.card.frameId,
      title: launch.title.slice(0, 200),
      processor: launch.generator,
      estCostUsd: launch.estUsd,
      createdAt: Date.now(),
      datasetId: dataset.id,
      conditionNames,
      enrichmentColumns,
    };
    await svc.saveRun(canvasId, rec);
    await svc.patchCard(canvasId, placed.card.id, actor, { status: 'running', runId: run.findall_id, datasetId: dataset.id, progress: 0, startedAt: Date.now() }, true);
    return { rec, card: placed.card, dataset, databaseCardId: db.id };
  } catch (err) {
    await svc.patchCard(canvasId, placed.card.id, actor, { status: 'failed', error: (err as Error).message.slice(0, 600) }, true).catch(() => undefined);
    throw err;
  }
}

/**
 * Follow a FindAll run (SSE resumed with `last_event_id`), filling the dataset with matches as they come. `cancelOnAbort`
 * (a tool's abort): cancel the run for real, keep the matches so far, and rethrow. A background follower that is only
 * disposed leaves the run alone.
 */
export function trackFindAll(
  svc: ParallelService,
  canvasId: string,
  rec: RunRecord,
  signal: AbortSignal,
  cancelOnAbort = true,
): Promise<{ matched: number; generated: number; status: string; termination?: string }> {
  let outcome = { matched: 0, generated: 0, status: 'running' } as { matched: number; generated: number; status: string; termination?: string };
  return svc
    .follow(rec.runId, async () => {
      try {
        outcome = await followFindAll(svc, canvasId, rec, signal);
      } catch (err) {
        if (signal.aborted) {
          if (cancelOnAbort) {
            await cancelFindAll(svc, canvasId, rec).catch(() => undefined);
          }
          throw signal.reason ?? err;
        }
        if (svc.signal.aborted) throw err;
        await svc.fail(canvasId, rec, err).catch(() => undefined);
        throw err;
      }
    })
    .then(() => outcome);
}

/** `POST /cancel`, then keep what was found. */
export async function cancelFindAll(svc: ParallelService, canvasId: string, rec: RunRecord): Promise<void> {
  const fresh = AbortSignal.timeout(15_000);
  const cancelled = await svc.client.findallCancel(rec.runId, { signal: fresh }).catch(() => false);
  let matched = 0;
  try {
    const result = await svc.client.findallResult(rec.runId, { signal: fresh });
    const rows = result.candidates.filter((c) => c.match_status === 'matched').map((c) => candidateRow(rec, c));
    matched = rows.length;
    for (let i = 0; i < rows.length; i += 200) await svc.store.datasets.upsert(canvasId, rec.datasetId!, rows.slice(i, i + 200), { key: 'URL' }, rec.actor);
  } catch {
    // the snapshot is a courtesy
  }
  await svc.updateRun(canvasId, rec.runId, { status: 'cancelled' });
  await svc.patchCard(
    canvasId,
    rec.cardId,
    rec.actor,
    {
      status: 'cancelled',
      matched,
      note: cancelled ? 'Cancelled. Work already done is still billed; the matches so far are kept.' : 'The run was already over.',
      finishedAt: Date.now(),
    },
    true,
  );
}

async function followFindAll(svc: ParallelService, canvasId: string, rec: RunRecord, signal: AbortSignal) {
  let lastEventId = rec.lastEventId;
  let run: FindAllRun | undefined;
  const seen = new Set<string>();
  let buffer: UpsertRow[] = [];
  let lastFlush = Date.now();
  const flush = async (force = false) => {
    if (buffer.length === 0 || (!force && buffer.length < 10 && Date.now() - lastFlush < 700)) return;
    const rows = buffer;
    buffer = [];
    lastFlush = Date.now();
    for (let i = 0; i < rows.length; i += 200) await svc.store.datasets.upsert(canvasId, rec.datasetId!, rows.slice(i, i + 200), { key: 'URL' }, rec.actor);
  };
  const metrics = (r: FindAllRun) => ({
    generated: r.status.metrics?.generated_candidates_count ?? 0,
    matched: r.status.metrics?.matched_candidates_count ?? 0,
  });
  const over = (r: FindAllRun | undefined) => r !== undefined && !r.status.is_active;
  for (;;) {
    signal.throwIfAborted();
    try {
      for await (const ev of svc.client.findallEvents(rec.runId, { signal, ...(lastEventId ? { lastEventId } : {}) })) {
        if (ev.id) lastEventId = ev.id;
        const data = eventJson<any>(ev);
        if (!data) continue;
        const type: string = data.type ?? ev.event;
        if (type === 'findall.status') {
          const r = (data.data ?? data) as FindAllRun;
          if (r?.status) {
            run = r;
            const m = metrics(r);
            await svc.patchCard(canvasId, rec.cardId, rec.actor, {
              status: 'running',
              ...m,
              progress: Math.min(99, Math.round((m.matched / Math.max(1, (rec.processor === 'preview' ? 10 : 100))) * 100)),
            });
            if (over(r)) break;
          }
        } else if (type.startsWith('findall.candidate.')) {
          const c = (data.data ?? data) as FindAllCandidate;
          if (c?.candidate_id && c.match_status === 'matched' && !seen.has(c.candidate_id)) {
            seen.add(c.candidate_id);
            buffer.push(candidateRow(rec, c));
            await flush();
          }
        }
      }
    } catch (err) {
      if (signal.aborted) throw signal.reason;
      if ((err as { status?: number })?.status && !(err as { retryable?: boolean }).retryable) throw err;
    }
    await flush(true);
    await svc.updateRun(canvasId, rec.runId, { lastEventId: lastEventId ?? '' });
    run = await svc.client.findallGet(rec.runId, { signal });
    if (over(run)) break;
    await sleep(svc.pollMs, signal);
  }
  // The final snapshot has every match with its enrichment values and citations.
  const result = await svc.client.findallResult(rec.runId, { signal });
  const matched = result.candidates.filter((c) => c.match_status === 'matched');
  const rows = matched.map((c) => candidateRow(rec, c));
  for (let i = 0; i < rows.length; i += 200) await svc.store.datasets.upsert(canvasId, rec.datasetId!, rows.slice(i, i + 200), { key: 'URL' }, rec.actor);
  const finalRun = result.run ?? run;
  const status = finalRun?.status.status ?? 'completed';
  const termination = finalRun?.status.termination_reason ?? undefined;
  const cites = new Map<string, ReturnType<typeof citationsOf>[number]>();
  for (const c of matched) for (const x of citationsOf(c.basis)) if (!cites.has(x.url)) cites.set(x.url, x);
  const m = finalRun ? metrics(finalRun) : { generated: matched.length, matched: matched.length };
  const cancelled = status === 'cancelled';
  await svc.updateRun(canvasId, rec.runId, { status: cancelled ? 'cancelled' : status === 'failed' ? 'failed' : 'completed', ...(termination ? { termination } : {}) });
  await svc.patchCard(
    canvasId,
    rec.cardId,
    rec.actor,
    {
      status: status === 'failed' ? 'failed' : cancelled ? 'cancelled' : 'completed',
      progress: 100,
      generated: m.generated,
      matched: matched.length,
      summary: `${matched.length} matching entities${termination ? ` (${termination.replace(/_/g, ' ')})` : ''}. Open the database for each with its criteria, citations and enrichments.`,
      citations: [...cites.values()].slice(0, 60),
      finishedAt: Date.now(),
      note: undefined,
    },
    true,
  );
  return { matched: matched.length, generated: m.generated, status, ...(termination ? { termination } : {}) };
}

// ---- attach / resume ----

/** A background follower for a run in the registry (restart, or `research_status` on a detached run). */
export async function attachRun(svc: ParallelService, canvasId: string, rec: RunRecord): Promise<void> {
  try {
    if (svc.following(rec.runId)) return;
    const signal = svc.signal;
    const fresh = { ...rec, status: 'running' as const };
    // Written BEFORE the follower starts, so a fast finish is never overwritten by a late "running".
    await svc.updateRun(canvasId, rec.runId, { status: 'running' });
    await svc.patchCard(canvasId, rec.cardId, rec.actor, { status: 'running', note: undefined }, true);
    if (rec.kind === 'task') await trackTask(svc, canvasId, fresh, signal);
    else if (rec.kind === 'group') await trackBatch(svc, canvasId, fresh, signal);
    else await trackFindAll(svc, canvasId, fresh, signal, false);
  } catch {
    // A background follower never throws: its card already says what happened (failed, detached).
  }
}

// ---- Monitors (watches) ----

const MONITOR_SEEN_MAX = 200;

/** Pull a watch's new events: a `doc` card per event with its citations as source cards. Returns the new events. */
export async function pullWatch(
  svc: ParallelService,
  canvasId: string,
  card: Card,
  signal?: AbortSignal,
): Promise<Array<{ id: string; date: string; summary: string; urls: string[] }>> {
  const d = readCardData(WatchData, card.data);
  const actor = actorOfCard(card);
  if (!d?.monitorId || !actor) return [];
  const seen = new Set<string>(((card.data as { seen?: string[] }).seen ?? []).map(String));
  const res = await svc.client.monitorEvents(d.monitorId, { ...(signal ? { signal } : {}), limit: 20 });
  const fresh = (res.events ?? []).filter((e) => e.event_id && !seen.has(e.event_id) && (e.event_type === undefined || e.event_type === 'event_stream' || e.event_type === 'snapshot'));
  const out: Array<{ id: string; date: string; summary: string; urls: string[] }> = [];
  // Oldest first, so the board reads in order.
  for (const e of [...fresh].reverse()) {
    const content = e.output?.content ?? e.changed_output ?? '';
    const summary = outputText(content, 2000);
    const date = (e.event_date ?? '').slice(0, 40);
    const cites = citationsOf(e.output?.basis);
    let docId: string | undefined;
    try {
      const doc = await svc.placeCard(
        canvasId,
        {
          type: 'doc',
          frameId: card.frameId,
          data: { title: `${d.title}: ${date || 'new event'}`.slice(0, 200), body: summary || 'A new event.', provenance: { provider: 'parallel', kind: 'monitor', id: e.event_id } },
          why: `New event from the watch "${d.title}"`.slice(0, 140),
        },
        actor,
      );
      docId = doc.id;
      await svc.linkCards(canvasId, card.id, doc.id, 'event', actor);
      await svc.placeSources(
        canvasId,
        { runId: d.monitorId, kind: 'task', cardId: doc.id, status: 'completed', actor, frameId: card.frameId, title: d.title, createdAt: Date.now() },
        cites,
        'monitor',
        3,
      );
    } catch (err) {
      if (!isCanvasError(err)) throw err;
    }
    void docId;
    seen.add(e.event_id);
    out.push({ id: e.event_id, date, summary: summary.slice(0, 300), urls: cites.slice(0, 3).map((c) => c.url) });
  }
  const board = await svc.store.board(canvasId);
  const current = board.current.cards[card.id];
  const prior = readCardData(WatchData, current?.data)?.events ?? [];
  const events = [...out.slice().reverse().map((o) => ({ id: o.id, date: o.date, summary: o.summary.slice(0, 600), ...(o.urls[0] ? { url: o.urls[0] } : {}) })), ...prior].slice(0, 10);
  await svc.patchCard(
    canvasId,
    card.id,
    actor,
    {
      events,
      eventCount: (d.eventCount ?? 0) + out.length,
      lastEventAt: out.length ? out[out.length - 1]!.date : d.lastEventAt,
      checkedAt: Date.now(),
      seen: [...seen].slice(-MONITOR_SEEN_MAX),
    },
    true,
  );
  return out;
}

