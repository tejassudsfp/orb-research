/**
 * Cordis row `orb-parallel-tools` (`@orb/canvas/parallel-tools`, P6.7): the agent tools over Parallel AI
 * (docs/phase6/parallel-api-spec.md §14.3). `web_search` itself is in sources.ts (its Parallel provider); these are
 * the rest:
 *
 * - sync: `parallel_extract`, `image_search`, `web_answer`, `entity_search`, `research_memory`, `suggest_task_spec`;
 * - long (a Research run card with live progress, then the cited result): `deep_research` (Task API), `batch_enrich`
 *   (Task Group into a Database), `find_entities` and `find_entities_extend` (FindAll into a Database), and
 *   `research_status` to check or re-attach a run;
 * - monitors, Orb only: `watch_topic`, `list_watches`, `watch_events`, `stop_watch` (a Watch card; each costs money on
 *   every check, so each is confirmed by the user).
 *
 * Every tool honours `exec.signal` (the ParallelClient aborts its request; the long ones detach or cancel, see
 * parallelFlows.ts), checks the caller's role against its allow-list, and with no key SAYS SO (a normal result,
 * not an error) so the agent falls back to the other providers. The cost guard (parallelFlows `placeRunCard`) asks the
 * user before spend over $0.50 and before the always-ask kinds.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { WatchData, readCardData, specOf, tierGate, type Card } from '@orb/shared';
import {
  FINDALL_GENERATORS,
  TASK_ETA,
  TASK_PROCESSOR_NAMES,
  checkUrl,
  citationsOf,
  extractCost,
  fieldsOf,
  findAllCost,
  frequencyHours,
  groupCost,
  imageSearchCost,
  isSourceError,
  isTaskProcessor,
  mapResponses,
  monitorMonthlyCost,
  entitySearchCost,
  outputText,
  responsesCost,
  roundUsd,
  taskCost,
  trimExcerpts,
  type FindAllGenerator,
  type ResponsesEffort,
  type TaskProcessor,
} from '@orb/sources';
import { databaseDataOf, newCardView } from '@orb/shared';
import { z } from 'zod';
import { abortFirst, isCanvasError } from './errors.js';
import { ORB_PARALLEL_SERVICE, type ParallelService } from './parallel.js';
import {
  launchBatch,
  launchFindAll,
  launchTask,
  placeRunCard,
  pullWatch,
  trackBatch,
  trackFindAll,
  trackTask,
  attachRun,
  type Caller,
} from './parallelFlows.js';
import type { CanvasStore } from './store.js';
import { callerOf, requireTool, type BoardToolExec } from './tools.js';
import { cachedNote } from './parallelCache.js';

export const name = 'orb-parallel-tools';
export const inject = ['tools', 'orbCanvas', ORB_PARALLEL_SERVICE];

export const NO_PARALLEL_MESSAGE =
  'Parallel is not set up (key needed): the user can add a Parallel API key in Settings › Models. Meanwhile use ' +
  'web_search, fetch_url and capture_page.';

type NotConfigured = { configured: false; message: string };
type TierRefused = { configured: true; refused: true; message: string };

/** The depth-tier refusal for `tool` on this canvas, or undefined (a canvas without a v2 template has no tier). */
async function tierRefusal(store: CanvasStore, canvasId: string, tool: string, args: { processor?: unknown }): Promise<TierRefused | undefined> {
  const meta = await store.open(canvasId);
  const spec = specOf(meta.template);
  if (!spec) return undefined;
  const message = tierGate(spec, meta.depth ?? 'standard', tool, args);
  return message ? { configured: true, refused: true, message } : undefined;
}

const notConfigured = (): NotConfigured => ({ configured: false, message: NO_PARALLEL_MESSAGE });

/** Errors reach the model as one short line (an abort passes through). */
function toolError(err: unknown, signal: AbortSignal): never {
  if (signal.aborted) throw err;
  if (isSourceError(err) || isCanvasError(err)) throw new Error(err.message, { cause: err });
  if (err instanceof z.ZodError) {
    const issue = err.issues[0];
    throw new Error(`invalid ${issue?.path.join('.') || 'arguments'}: ${issue?.message ?? 'bad value'}`);
  }
  throw err;
}

const Domains = z.array(z.string().trim().min(1).max(200)).max(100);
const Frame = z.string().startsWith('f_').max(64);
const Obj = z.record(z.string(), z.unknown());
const Country = z.string().trim().length(2);

/** Names Parallel already returns as Basis; in an output schema they only trigger warnings (spec §1.3). */
const RESERVED_FIELDS = new Set(['citations', 'confidence', 'evidence', 'reasoning', 'source', 'sources', 'source_urls']);

/** A JSON schema for a Task or group output: an object with properties, none of them Basis-like. */
export function checkOutputSchema(schema: Record<string, unknown>, label = 'output_json_schema'): { type: 'object'; properties: Record<string, unknown> } & Record<string, unknown> {
  const props = schema.properties;
  if (schema.type !== 'object' || !props || typeof props !== 'object' || Array.isArray(props) || Object.keys(props).length === 0)
    throw new Error(`${label} must be a JSON schema with type "object" and properties`);
  const names = Object.keys(props);
  if (names.length > 25) throw new Error(`${label} has ${names.length} properties; at most 25 (about 10 for core, 2 for lite)`);
  const reserved = names.filter((n) => RESERVED_FIELDS.has(n.toLowerCase()));
  if (reserved.length)
    throw new Error(`${label}: do not use ${reserved.join(', ')} as field names; citations, sources and confidence come back automatically`);
  if (JSON.stringify(schema).length > 12_000) throw new Error(`${label} is too long (at most 12,000 characters)`);
  return { additionalProperties: false, required: names, ...schema } as unknown as { type: 'object'; properties: Record<string, unknown> } & Record<string, unknown>;
}

const sourcePolicy = (include?: string[], exclude?: string[]) =>
  include?.length || exclude?.length
    ? { ...(include?.length ? { include_domains: include } : {}), ...(!include?.length && exclude?.length ? { exclude_domains: exclude } : {}) }
    : undefined;

const ALWAYS_ASK_PROCESSORS = new Set<string>(['ultra', 'ultra2x', 'ultra4x', 'ultra8x']);

const money = (n: number) => roundUsd(n);

/** P6.8: the `refresh` parameter of every cached Parallel tool. */
const REFRESH = { type: 'boolean', description: 'Run it again even if this canvas already holds the same result (it costs again).' };

type Ctx = { svc: ParallelService; store: CanvasStore };

/** The common prologue: arguments, caller, allow-list, key. */
async function enter<A, R>(
  c: Ctx,
  tool: string,
  schema: z.ZodType<A>,
  raw: unknown,
  exec: BoardToolExec,
  body: (args: A, caller: Caller, sessionId: string) => Promise<R>,
): Promise<R | NotConfigured | TierRefused> {
  try {
    const args = schema.parse(raw);
    const caller = await callerOf(c.store, exec);
    requireTool(caller.role, tool);
    // P6.11: the depth tier of a v2 template canvas is the cost guard: a tool it does not allow is refused (nothing is
    // placed or spent) with a message the agent can act on.
    const refusal = await tierRefusal(c.store, caller.canvasId, tool, args as { processor?: unknown });
    if (refusal) return refusal;
    if (!(await c.svc.configured())) return notConfigured();
    return await body(args, caller, `orb_${caller.role}_${exec.agent?.id ?? 'agent'}`);
  } catch (err) {
    return toolError(err, exec.signal);
  }
}

/**
 * P6.8: run `run` unless this canvas already holds its result (same tool, same normalised input): then the saved result
 * comes back with `cached: true` and `costUsd: 0`, and Parallel is not called. `refresh` runs it again. Only results
 * `keep` accepts are saved (a run still going, or one that failed, is not).
 */
async function cachedCall<R extends object>(
  c: Ctx,
  canvasId: string,
  tool: string,
  input: unknown,
  refresh: boolean | undefined,
  run: () => Promise<R>,
  keep: (out: R) => boolean = () => true,
): Promise<R | (R & ReturnType<typeof cachedNote>)> {
  const cache = c.store.parallelCache;
  const key = cache.key(tool, input);
  if (!refresh) {
    const hit = await cache.get<R>(canvasId, key);
    if (hit) {
      const note = cachedNote(hit.at, Date.now());
      return { ...hit.value, ...note, ...('estCostUsd' in hit.value ? { estCostUsd: 0 } : {}) };
    }
  }
  const out = await run();
  if (keep(out)) await cache.put(canvasId, key, tool, out).catch(() => undefined);
  return out;
}

// ---- parallel_extract ----

export const ExtractArgs = z.strictObject({
  urls: z.array(z.string().trim().min(1).max(2048)).min(1).max(20),
  objective: z.string().trim().min(1).max(5000).optional(),
  queries: z.array(z.string().trim().min(1).max(200)).max(5).optional(),
  full_content: z.boolean().optional(),
  fresh: z.boolean().optional(),
  refresh: z.boolean().optional(),
});

export function parallelExtract(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'parallel_extract', ExtractArgs, raw, exec, (args, caller, sessionId) =>
    cachedCall(c, caller.canvasId, 'parallel_extract', args, args.refresh, () => extractNow(c, args, exec, sessionId)),
  );
}

async function extractNow(c: Ctx, args: z.infer<typeof ExtractArgs>, exec: BoardToolExec, sessionId: string) {
  {
    // Only public http(s) pages go to a third party: the same check as fetch_url (no local or private address).
    const urls = args.urls.map((u) => checkUrl(u).href);
    const res = await c.svc.client.extract(
      {
        urls,
        ...(args.objective ? { objective: args.objective } : {}),
        ...(args.queries?.length ? { search_queries: args.queries } : {}),
        session_id: sessionId,
        advanced_settings: {
          ...(args.fresh ? { fetch_policy: { max_age_seconds: 600 } } : {}),
          ...(args.full_content ? { full_content: true } : {}),
        },
      },
      { signal: exec.signal },
    );
    const FULL_MAX = 12_000;
    return {
      configured: true,
      results: res.results.map((r) => ({
        url: r.url,
        ...(r.title ? { title: r.title } : {}),
        ...(r.publish_date ? { publishedAt: r.publish_date } : {}),
        excerpts: trimExcerpts(r.excerpts, 3000),
        ...(r.full_content ? { fullContent: r.full_content.slice(0, FULL_MAX), ...(r.full_content.length > FULL_MAX ? { fullContentTruncated: true } : {}) } : {}),
      })),
      errors: (res.errors ?? []).map((e) => ({
        url: e.url,
        reason: `${e.error_type ?? 'failed'}${e.http_status_code ? ` (HTTP ${e.http_status_code})` : ''}`,
        next: 'try fetch_url, or capture_page for a page behind a login or a screenshot',
      })),
      costUsd: money(extractCost(urls.length)),
    };
  }
}

// ---- image_search ----

export const ImageSearchArgs = z.strictObject({
  queries: z.array(z.string().trim().min(1).max(200)).min(1).max(5),
  objective: z.string().trim().min(1).max(5000).optional(),
  mode: z.enum(['fast', 'advanced']).optional(),
  max_results: z.number().int().min(1).max(20).optional(),
  country: Country.optional(),
});

export function imageSearch(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'image_search', ImageSearchArgs, raw, exec, async (args, _caller, sessionId) => {
    const mode = args.mode ?? 'fast';
    const res = await c.svc.client.imageSearch(
      {
        search_queries: args.queries,
        ...(args.objective ? { objective: args.objective } : {}),
        mode,
        session_id: sessionId,
        advanced_settings: { max_results: args.max_results ?? 10, ...(args.country ? { location: args.country.toLowerCase() } : {}) },
      },
      { signal: exec.signal },
    );
    return {
      configured: true,
      results: res.results.slice(0, args.max_results ?? 10).map((r) => ({
        title: r.title ?? '',
        imageUrl: r.image_url,
        sourcePageUrl: r.source_page_url,
        ...(r.width ? { width: r.width } : {}),
        ...(r.height ? { height: r.height } : {}),
      })),
      costUsd: money(imageSearchCost(mode)),
      next: 'keep sourcePageUrl as the attribution; capture_page(sourcePageUrl) saves a screenshot to place as an image card, or place a source card for the page',
    };
  });
}

// ---- web_answer ----

export const WebAnswerArgs = z.strictObject({
  question: z.string().trim().min(1).max(15_000),
  effort: z.enum(['low', 'medium', 'high']).optional(),
  schema: Obj.optional(),
  include_domains: Domains.optional(),
  exclude_domains: Domains.optional(),
  follow_up_of: z.string().trim().min(1).max(200).optional(),
  refresh: z.boolean().optional(),
});

const ANSWER_TIMEOUT_MS: Record<ResponsesEffort, number> = { low: 30_000, medium: 60_000, high: 120_000 };

export function webAnswer(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'web_answer', WebAnswerArgs, raw, exec, (args, caller) =>
    cachedCall(c, caller.canvasId, 'web_answer', { ...args, effort: args.effort ?? 'low' }, args.refresh, () => answerNow(c, args, exec)),
  );
}

async function answerNow(c: Ctx, args: z.infer<typeof WebAnswerArgs>, exec: BoardToolExec) {
  {
    const effort = args.effort ?? 'low';
    const filters = {
      ...(args.include_domains?.length ? { allowed_domains: args.include_domains } : {}),
      ...(!args.include_domains?.length && args.exclude_domains?.length ? { blocked_domains: args.exclude_domains } : {}),
    };
    const res = await c.svc.client.responses(
      {
        input: args.question,
        reasoning: { effort },
        tools: [{ type: 'web_search', ...(Object.keys(filters).length ? { filters } : {}) }],
        ...(args.schema ? { text: { format: { type: 'json_schema', name: 'answer', schema: args.schema } } } : {}),
        ...(args.follow_up_of ? { previous_response_id: args.follow_up_of } : {}),
      },
      { signal: exec.signal, timeoutMs: ANSWER_TIMEOUT_MS[effort] },
    );
    const mapped = mapResponses(res);
    let data: unknown;
    if (args.schema) {
      try {
        data = JSON.parse(mapped.answer);
      } catch {
        data = undefined;
      }
    }
    return {
      configured: true,
      answer: mapped.answer.slice(0, 12_000),
      ...(data !== undefined ? { data } : {}),
      citations: mapped.citations.slice(0, 30),
      searches: mapped.searches.slice(0, 20),
      ...(mapped.reads.length ? { pagesRead: mapped.reads.slice(0, 20) } : {}),
      ...(mapped.responseId ? { responseId: mapped.responseId } : {}),
      costUsd: money(responsesCost(effort)),
      next: 'place a source card for each citation you will rely on (its span is the cited sentence)',
    };
  }
}

// ---- deep_research ----

export const DeepResearchArgs = z.strictObject({
  input: z.string().trim().min(1).max(15_000).optional(),
  input_json: Obj.optional(),
  processor: z.string().trim().optional(),
  output_kind: z.enum(['auto', 'text', 'json']).optional(),
  output_description: z.string().trim().max(2000).optional(),
  output_json_schema: Obj.optional(),
  include_domains: Domains.optional(),
  exclude_domains: Domains.optional(),
  country: Country.optional(),
  data_sources: z
    .strictObject({
      free: z.array(z.enum(['pubmed', 'clinical_trials', 'chembl', 'biorxiv', 'npi_registry', 'cms_coverage'])).max(6).optional(),
      pay_per_use: z.array(z.enum(['carbonarc'])).max(1).optional(),
    })
    .optional(),
  follow_up_of: z.string().trim().min(1).max(200).optional(),
  wait: z.boolean().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  frameId: Frame.optional(),
  refresh: z.boolean().optional(),
});

/** What an agent gets back from a finished run: the result (clipped), the strongest citations, the weak fields. */
function resultOut(summary: string, citations: ReturnType<typeof citationsOf>, fields?: ReturnType<typeof fieldsOf>) {
  const MAX = 6000;
  return {
    result: summary.slice(0, MAX),
    ...(summary.length > MAX ? { resultTruncated: true } : {}),
    citations: citations.slice(0, 10).map((c) => ({ url: c.url, ...(c.title ? { title: c.title } : {}), ...(c.confidence ? { confidence: c.confidence } : {}), fields: c.fields.slice(0, 5) })),
    ...(citations.length > 10 ? { moreCitations: citations.length - 10 } : {}),
    ...(fields?.some((f) => f.confidence === 'low') ? { lowConfidence: fields.filter((f) => f.confidence === 'low').map((f) => f.field) } : {}),
  };
}

export function deepResearch(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'deep_research', DeepResearchArgs, raw, exec, (args, caller) => {
    // P6.8: the same research (input, processor, output and source policy) already done on this canvas is not run
    // again: its saved result comes back at no cost, with the card it filled. Only a finished run is saved.
    const { refresh, wait: _w, title: _t, frameId: _f, ...same } = args;
    return cachedCall(c, caller.canvasId, 'deep_research', { ...same, processor: args.processor ?? 'pro', output_kind: args.output_kind ?? 'auto' }, refresh, () => researchNow(c, args, caller, exec), (out) => (out as { status?: string }).status === 'completed');
  });
}

async function researchNow(c: Ctx, args: z.infer<typeof DeepResearchArgs>, caller: Caller, exec: BoardToolExec) {
  {
    const processor = args.processor ?? 'pro';
    if (!isTaskProcessor(processor)) throw new Error(`processor must be one of ${TASK_PROCESSOR_NAMES.join(', ')}`);
    const input = args.input_json ?? args.input;
    if (input === undefined) throw new Error('give input (text) or input_json');
    if (typeof input === 'object' && JSON.stringify(input).length > 15_000) throw new Error('input_json is too long (at most 15,000 characters)');
    const kind = args.output_kind ?? 'auto';
    let schema: unknown;
    if (kind === 'json') {
      if (!args.output_json_schema) throw new Error('output_kind json needs output_json_schema');
      schema = { type: 'json', json_schema: checkOutputSchema(args.output_json_schema) };
    } else if (kind === 'text') schema = { type: 'text', ...(args.output_description ? { description: args.output_description } : {}) };
    else schema = { type: 'auto' };
    const title = args.title ?? (typeof input === 'string' ? input : JSON.stringify(input)).replace(/\s+/g, ' ').slice(0, 90);
    const estUsd = money(taskCost(processor as TaskProcessor));
    const launched = await launchTask(
      c.svc,
      caller,
      {
        title,
        input,
        processor,
        outputKind: kind,
        taskSpec: { output_schema: schema },
        sourcePolicy: sourcePolicy(args.include_domains, args.exclude_domains),
        advancedSettings:
          args.country || args.data_sources
            ? { ...(args.country ? { location: args.country.toLowerCase() } : {}), ...(args.data_sources ? { data_sources: { free: args.data_sources.free ?? [], pay_per_use: args.data_sources.pay_per_use ?? [] } } : {}) }
            : undefined,
        ...(args.follow_up_of ? { previousInteractionId: args.follow_up_of } : {}),
        frameId: args.frameId ?? null,
        why: '',
        estUsd,
        always: ALWAYS_ASK_PROCESSORS.has(processor),
      },
      exec.signal,
    );
    if (!launched) return { configured: true, declined: true, message: 'The user declined this run. Nothing was started and nothing was spent.' };
    const { rec } = launched;
    const base = { configured: true, runId: rec.runId, interactionId: rec.interactionId ?? rec.runId, cardId: rec.cardId, processor, estCostUsd: estUsd };
    if (args.wait === false) {
      void attachRun(c.svc, caller.canvasId, rec);
      return { ...base, status: 'running', eta: TASK_ETA[processor as TaskProcessor], next: 'keep working; research_status(run_id) checks it, and the card on the board fills in when it is done' };
    }
    const done = await trackTask(c.svc, caller.canvasId, rec, exec.signal);
    const card = await c.svc.researchOf(caller.canvasId, rec.cardId);
    return { ...base, status: 'completed', ...resultOut(done?.summary ?? '', done?.citations ?? [], card?.fields ? (card.fields as ReturnType<typeof fieldsOf>) : undefined) };
  }
}

// ---- research_status ----

export const ResearchStatusArgs = z.strictObject({ run_id: z.string().trim().min(1).max(200) });

export function researchStatus(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'research_status', ResearchStatusArgs, raw, exec, async (args, caller) => {
    const { canvasId } = caller;
    const rec = await c.svc.findRun(canvasId, args.run_id);
    if (rec) {
      let card = await c.svc.researchOf(canvasId, rec.cardId);
      if (rec.status === 'running' || rec.status === 'detached') {
        // Attach again (or just settle a run that finished while orb was not looking), waiting a moment for it.
        const attached = attachRun(c.svc, canvasId, rec);
        await Promise.race([attached, new Promise((r) => setTimeout(r, 8000))]).catch(() => undefined);
        await c.svc.settleCard(canvasId, rec.cardId, rec.actor).catch(() => undefined);
        card = await c.svc.researchOf(canvasId, rec.cardId);
      }
      const base = {
        configured: true,
        runId: rec.runId,
        kind: rec.kind,
        cardId: rec.cardId,
        status: card?.status ?? rec.status,
        ...(card?.progress !== undefined ? { progress: card.progress } : {}),
        ...(card?.done !== undefined ? { done: card.done, total: card.total } : {}),
        ...(card?.matched !== undefined ? { matched: card.matched, generated: card.generated } : {}),
        ...(rec.datasetId ? { datasetId: rec.datasetId } : {}),
        ...(card?.error ? { error: card.error } : {}),
        ...(card?.note ? { note: card.note } : {}),
      };
      if (card?.status === 'completed' && card.summary)
        return { ...base, ...resultOut(card.summary, (card.citations ?? []).map((x) => ({ ...x, fields: x.fields ?? [] })) as ReturnType<typeof citationsOf>, card.fields as ReturnType<typeof fieldsOf>) };
      return base;
    }
    // A run orb has no card for (started elsewhere): ask Parallel directly.
    if (args.run_id.startsWith('trun_')) {
      const run = await c.svc.client.taskGet(args.run_id, { signal: exec.signal });
      if (run.status !== 'completed') return { configured: true, runId: args.run_id, kind: 'task', status: run.status };
      const result = await c.svc.client.taskResult(args.run_id, 10, { signal: exec.signal });
      if (!result) return { configured: true, runId: args.run_id, kind: 'task', status: run.status };
      return { configured: true, runId: args.run_id, kind: 'task', status: 'completed', ...resultOut(outputText(result.output.content), citationsOf(result.output.basis), fieldsOf(result.output.basis)) };
    }
    if (args.run_id.startsWith('findall_')) {
      const run = await c.svc.client.findallGet(args.run_id, { signal: exec.signal });
      return { configured: true, runId: args.run_id, kind: 'findall', status: run.status.status, ...(run.status.metrics ? { metrics: run.status.metrics } : {}), ...(run.status.termination_reason ? { termination: run.status.termination_reason } : {}) };
    }
    if (args.run_id.startsWith('tgrp_')) {
      const group = await c.svc.client.groupGet(args.run_id, { signal: exec.signal });
      return { configured: true, runId: args.run_id, kind: 'group', status: group.status.is_active ? 'running' : 'completed', counts: group.status.task_run_status_counts ?? {} };
    }
    throw new Error(`orb has no run ${args.run_id}; run ids start with trun_, tgrp_ or findall_`);
  });
}

// ---- batch_enrich ----

export const BatchEnrichArgs = z.strictObject({
  rows: z.array(z.union([z.string().trim().min(1).max(5000), Obj])).min(1).max(1000),
  output_json_schema: Obj,
  processor: z.enum(['lite', 'base', 'core']).optional(),
  include_domains: Domains.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  frameId: Frame.optional(),
  wait: z.boolean().optional(),
});

export function batchEnrich(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'batch_enrich', BatchEnrichArgs, raw, exec, async (args, caller) => {
    const schema = checkOutputSchema(args.output_json_schema);
    const processor = args.processor ?? 'base';
    for (const r of args.rows) if (JSON.stringify(r).length > 5000) throw new Error('a row is too long (at most 5,000 characters)');
    const estUsd = money(groupCost(processor, args.rows.length));
    const launched = await launchBatch(
      c.svc,
      caller,
      {
        title: args.title ?? `Enrichment of ${args.rows.length} rows`,
        rows: args.rows as Array<string | Record<string, unknown>>,
        schema,
        processor,
        sourcePolicy: sourcePolicy(args.include_domains),
        frameId: args.frameId ?? null,
        why: '',
        estUsd,
        always: args.rows.length > 50,
      },
      exec.signal,
    );
    if (!launched) return { configured: true, declined: true, message: 'The user declined this batch. Nothing was started and nothing was spent.' };
    const base = {
      configured: true,
      runId: launched.rec.runId,
      cardId: launched.card.id,
      databaseCardId: launched.databaseCardId,
      datasetId: launched.dataset.id,
      rows: args.rows.length,
      processor,
      estCostUsd: estUsd,
    };
    if (args.wait === false) {
      void attachRun(c.svc, caller.canvasId, launched.rec);
      return { ...base, status: 'running', next: 'the database fills in as rows finish; research_status(run_id) checks progress; query_dataset reads it' };
    }
    const out = await trackBatch(c.svc, caller.canvasId, launched.rec, exec.signal);
    return { ...base, status: 'completed', done: out.done, failed: out.failed, next: 'read the rows with query_dataset; the Sources and Needs review columns carry the citations and weak fields' };
  });
}

// ---- find_entities / find_entities_extend / entity_search ----

const Condition = z.strictObject({ name: z.string().trim().min(1).max(60), description: z.string().trim().min(1).max(500) });

export const FindEntitiesArgs = z.strictObject({
  objective: z.string().trim().min(3).max(2000),
  entity_type: z.string().trim().min(1).max(60).optional(),
  match_conditions: z.array(Condition).min(1).max(10).optional(),
  generator: z.enum(['preview', 'base', 'core', 'pro']).optional(),
  match_limit: z.number().int().min(5).max(1000).optional(),
  enrichments: z
    .array(z.strictObject({ processor: z.enum(['lite', 'base', 'core']).optional(), json_schema: Obj }))
    .max(5)
    .optional(),
  exclude: z.array(z.strictObject({ name: z.string().max(200), url: z.string().max(2048) })).max(200).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  frameId: Frame.optional(),
  wait: z.boolean().optional(),
  refresh: z.boolean().optional(),
});

export function findEntities(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'find_entities', FindEntitiesArgs, raw, exec, (args, caller) => {
    // P6.8: the same entity search (objective, conditions, generator, limit, enrichments) already finished on this
    // canvas comes back from its saved result, with the database it filled, at no cost.
    const { refresh, wait: _w, title: _t, frameId: _f, ...same } = args;
    return cachedCall(c, caller.canvasId, 'find_entities', { ...same, generator: args.generator ?? 'preview' }, refresh, () => findNow(c, args, caller, exec), (out) => (out as { status?: string }).status === 'completed');
  });
}

async function findNow(c: Ctx, args: z.infer<typeof FindEntitiesArgs>, caller: Caller, exec: BoardToolExec) {
  {
    const generator = (args.generator ?? 'preview') as FindAllGenerator;
    const matchLimit = generator === 'preview' ? Math.min(10, args.match_limit ?? 10) : (args.match_limit ?? 10);
    let conditions = args.match_conditions;
    let entityType = args.entity_type;
    if (!conditions) {
      const schema = await c.svc.client.findallIngest(args.objective, { signal: exec.signal });
      conditions = (schema.match_conditions ?? []).map((m) => ({ name: m.name.slice(0, 60), description: m.description.slice(0, 500) })).slice(0, 10);
      entityType ??= schema.entity_type;
      if (conditions.length === 0) throw new Error('Parallel could not turn the objective into match conditions; give match_conditions');
    }
    const enrichments = (args.enrichments ?? []).map((e) => ({ processor: e.processor ?? 'core', schema: checkOutputSchema(e.json_schema, 'enrichments.json_schema') }));
    const estUsd = money(findAllCost(generator, matchLimit, enrichments.map((e) => e.processor as TaskProcessor)));
    const launched = await launchFindAll(
      c.svc,
      caller,
      {
        title: args.title ?? args.objective.slice(0, 90),
        objective: args.objective,
        entityType: entityType ?? 'companies',
        conditions,
        generator,
        matchLimit,
        enrichments,
        ...(args.exclude ? { exclude: args.exclude } : {}),
        frameId: args.frameId ?? null,
        why: '',
        estUsd,
        always: generator === 'core' || generator === 'pro',
      },
      exec.signal,
    );
    if (!launched) return { configured: true, declined: true, message: 'The user declined this search. Nothing was started and nothing was spent.' };
    const base = {
      configured: true,
      findallId: launched.rec.runId,
      runId: launched.rec.runId,
      cardId: launched.card.id,
      databaseCardId: launched.databaseCardId,
      datasetId: launched.dataset.id,
      generator,
      matchLimit,
      estCostUsd: estUsd,
      conditions,
    };
    if (args.wait === false) {
      void attachRun(c.svc, caller.canvasId, launched.rec);
      return { ...base, status: 'running', next: 'matches fill the database as they are found; research_status(run_id) checks progress' };
    }
    const out = await trackFindAll(c.svc, caller.canvasId, launched.rec, exec.signal);
    return {
      ...base,
      status: out.status,
      matched: out.matched,
      generated: out.generated,
      ...(out.termination ? { termination: out.termination } : {}),
      next:
        out.termination === 'match_limit_met'
          ? 'read the rows with query_dataset; find_entities_extend adds more matches to this run'
          : 'read the rows with query_dataset',
    };
  }
}

export const ExtendArgs = z.strictObject({
  findall_id: z.string().trim().min(1).max(200),
  additional_match_limit: z.number().int().min(1).max(1000),
});

export function findEntitiesExtend(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'find_entities_extend', ExtendArgs, raw, exec, async (args, caller) => {
    const { canvasId, actor } = caller;
    const rec = await c.svc.findRun(canvasId, args.findall_id);
    if (!rec || rec.kind !== 'findall') throw new Error(`orb has no entity search ${args.findall_id} on this board`);
    const run = await c.svc.client.findallGet(args.findall_id, { signal: exec.signal });
    if (run.status.is_active) return { configured: true, status: run.status.status, message: 'The search is still running; wait for it to finish before extending it.' };
    if (run.status.termination_reason !== 'match_limit_met')
      return { configured: true, status: run.status.status, ...(run.status.termination_reason ? { termination: run.status.termination_reason } : {}), message: 'Only a search that stopped at its match limit can be extended (it ended another way).' };
    const gen = (rec.processor ?? 'base') as FindAllGenerator;
    const estUsd = money(FINDALL_GENERATORS[gen].perMatch * args.additional_match_limit);
    if (estUsd > c.svc.confirmAboveUsd || gen === 'core' || gen === 'pro') {
      await c.svc.patchCard(canvasId, rec.cardId, actor, { status: 'awaiting_approval', estCostUsd: estUsd, note: `Extending by ${args.additional_match_limit} matches.` }, true);
      let ok: boolean;
      try {
        ok = await c.svc.waitForApproval(canvasId, rec.cardId, exec.signal);
      } catch (err) {
        await c.svc.patchCard(canvasId, rec.cardId, actor, { status: 'completed', note: 'Stopped before the extension was approved.' }, true).catch(() => undefined);
        throw err;
      }
      if (!ok) {
        await c.svc.patchCard(canvasId, rec.cardId, actor, { status: 'completed', note: 'The extension was declined.' }, true);
        return { configured: true, declined: true, message: 'The user declined the extension.' };
      }
    }
    await c.svc.client.findallExtend(args.findall_id, args.additional_match_limit, { signal: exec.signal });
    await c.svc.patchCard(canvasId, rec.cardId, actor, { status: 'running', note: undefined }, true);
    const out = await trackFindAll(c.svc, canvasId, { ...rec, status: 'running' }, exec.signal);
    return { configured: true, findallId: args.findall_id, status: out.status, matched: out.matched, generated: out.generated, ...(out.termination ? { termination: out.termination } : {}) };
  });
}

export const EntitySearchArgs = z.strictObject({
  entity_type: z.enum(['people', 'companies']),
  objective: z.string().trim().min(3).max(2000),
  limit: z.number().int().min(5).max(1000).optional(),
  place: z.boolean().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  frameId: Frame.optional(),
});

export function entitySearch(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'entity_search', EntitySearchArgs, raw, exec, async (args, caller) => {
    const limit = args.limit ?? 25;
    const res = await c.svc.client.entitySearch({ entity_type: args.entity_type, objective: args.objective, match_limit: limit }, { signal: exec.signal });
    const entities = res.entities.slice(0, limit);
    let cardId: string | undefined;
    let datasetId: string | undefined;
    if (args.place !== false && entities.length > 0) {
      const title = args.title ?? `${args.entity_type === 'people' ? 'People' : 'Companies'}: ${args.objective}`.slice(0, 120);
      const { dataset } = await c.store.datasets.create(
        caller.canvasId,
        title,
        ['Name', 'URL', 'Description', 'Status'],
        entities.map((e) => [e.name.slice(0, 500), e.url ?? '', (e.description ?? '').slice(0, 1900), 'unverified']),
        caller.actor,
      );
      try {
        const card = await c.svc.placeCard(
          caller.canvasId,
          { type: 'database', frameId: args.frameId ?? null, data: databaseDataOf(title, dataset), why: 'An unverified entity list from Parallel', view: newCardView(dataset) },
          caller.actor,
        );
        cardId = card.id;
        datasetId = dataset.id;
      } catch (err) {
        await c.store.datasets.discard(caller.canvasId, dataset.id).catch(() => undefined);
        throw err;
      }
    }
    return {
      configured: true,
      entities: entities.slice(0, 25).map((e) => ({ name: e.name, ...(e.url ? { url: e.url } : {}), ...(e.description ? { description: e.description.slice(0, 200) } : {}) })),
      ...(entities.length > 25 ? { more: entities.length - 25 } : {}),
      unverified: true,
      ...(cardId ? { cardId, datasetId } : {}),
      costUsd: money(entitySearchCost()),
      next: 'these are unverified (no citations); use find_entities for verified matches',
    };
  });
}

// ---- watches (Orb only) ----

export const WatchTopicArgs = z.strictObject({
  query: z.string().trim().min(3).max(2000),
  frequency: z.string().trim().optional(),
  processor: z.enum(['lite', 'base']).optional(),
  include_domains: Domains.optional(),
  output_json_schema: Obj.optional(),
  backfill: z.boolean().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  frameId: Frame.optional(),
});

const watchCards = async (c: Ctx, canvasId: string): Promise<Card[]> =>
  Object.values((await c.store.board(canvasId)).current.cards).filter((card) => card.type === 'watch');

export function watchTopic(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'watch_topic', WatchTopicArgs, raw, exec, async (args, caller) => {
    const frequency = args.frequency ?? '1d';
    if (frequencyHours(frequency) === undefined) throw new Error('frequency is a number and h, d or w (1h to 30d), e.g. 6h, 1d, 1w');
    const processor = args.processor ?? 'lite';
    const monthlyUsd = money(monitorMonthlyCost(frequency, processor));
    const title = args.title ?? args.query.slice(0, 90);
    const placed = await placeRunCard(
      c.svc,
      caller,
      {
        type: 'watch',
        data: { title, query: args.query, frequency, processor, monthlyUsd },
        frameId: args.frameId ?? null,
        why: `Watching: ${title}`,
        estUsd: monthlyUsd,
        always: true,
      },
      exec.signal,
    );
    if (!placed.approved) return { configured: true, declined: true, message: 'The user declined this watch. Nothing was started and nothing was spent.' };
    try {
      const monitor = await c.svc.client.monitorCreate(
        {
          type: 'event_stream',
          frequency,
          processor,
          settings: {
            query: args.query,
            ...(args.backfill ? { include_backfill: true } : {}),
            ...(args.output_json_schema ? { output_schema: { type: 'json', json_schema: checkOutputSchema(args.output_json_schema) } } : {}),
            ...(args.include_domains?.length ? { advanced_settings: { source_policy: { include_domains: args.include_domains } } } : {}),
          },
          metadata: { orb_board: caller.canvasId.slice(0, 400) },
          memory_scope_key: `orb:${caller.canvasId}`,
        },
        { signal: exec.signal },
      );
      await c.svc.patchCard(caller.canvasId, placed.card.id, caller.actor, { monitorId: monitor.monitor_id, status: 'active', checkedAt: Date.now(), eventCount: 0 }, true);
      return {
        configured: true,
        monitorId: monitor.monitor_id,
        cardId: placed.card.id,
        frequency,
        processor,
        monthlyUsd,
        note: "It runs on Parallel's servers on its schedule, even when orb is closed. orb pulls its new events when a canvas opens; watch_events reads them now.",
      };
    } catch (err) {
      await c.svc.patchCard(caller.canvasId, placed.card.id, caller.actor, { status: 'failed', error: (err as Error).message.slice(0, 600) }, true).catch(() => undefined);
      throw err;
    }
  });
}

export function listWatches(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'list_watches', z.strictObject({}), raw ?? {}, exec, async (_args, caller) => {
    const cards = await watchCards(c, caller.canvasId);
    return {
      configured: true,
      watches: cards.map((card) => {
        const d = readCardData(WatchData, card.data);
        return { cardId: card.id, monitorId: d?.monitorId, title: d?.title, query: d?.query, frequency: d?.frequency, status: d?.status, eventCount: d?.eventCount ?? 0, monthlyUsd: d?.monthlyUsd };
      }),
    };
  });
}

const MonitorArgs = z.strictObject({ monitor_id: z.string().trim().min(1).max(200) });

async function watchOf(c: Ctx, canvasId: string, monitorId: string): Promise<Card> {
  const card = (await watchCards(c, canvasId)).find((w) => readCardData(WatchData, w.data)?.monitorId === monitorId);
  if (!card) throw new Error(`no watch ${monitorId} on this board (list_watches shows them)`);
  return card;
}

export function watchEvents(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'watch_events', MonitorArgs, raw, exec, async (args, caller) => {
    const card = await watchOf(c, caller.canvasId, args.monitor_id);
    const fresh = await pullWatch(c.svc, caller.canvasId, card, exec.signal);
    const d = readCardData(WatchData, (await c.svc.card(caller.canvasId, card.id))?.data);
    return { configured: true, monitorId: args.monitor_id, newEvents: fresh, eventCount: d?.eventCount ?? fresh.length, next: fresh.length ? 'each new event is a doc card on the board with its sources' : 'nothing new since the last check' };
  });
}

export function stopWatch(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'stop_watch', MonitorArgs, raw, exec, async (args, caller) => {
    const card = await watchOf(c, caller.canvasId, args.monitor_id);
    await c.svc.client.monitorCancel(args.monitor_id, { signal: exec.signal });
    await c.svc.patchCard(caller.canvasId, card.id, caller.actor, { status: 'cancelled' }, true);
    return { configured: true, monitorId: args.monitor_id, status: 'cancelled', note: 'The watch is stopped for good and costs nothing more.' };
  });
}

// ---- optional extras ----

export const MemoryArgs = z.strictObject({
  query: z.string().trim().min(1).max(500).optional(),
  kind: z.enum(['task', 'monitor', 'findall']).optional(),
  limit: z.number().int().min(1).max(25).optional(),
});

export function researchMemory(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'research_memory', MemoryArgs, raw, exec, async (args, caller) => {
    const res = await c.svc.client.memoryRetrieve(
      { ...(args.query ? { query: args.query } : {}), ...(args.kind ? { kind: args.kind } : {}), limit: args.limit ?? 10, memory_scope_key: `orb:${caller.canvasId}` },
      { signal: exec.signal },
    );
    return { configured: true, results: (res.results ?? []).slice(0, 25) };
  });
}

export const SuggestArgs = z.strictObject({ intent: z.string().trim().min(3).max(2000) });

export function suggestTaskSpec(c: Ctx, raw: unknown, exec: BoardToolExec) {
  return enter(c, 'suggest_task_spec', SuggestArgs, raw, exec, async (args) => {
    const res = await c.svc.client.taskSuggest(args.intent, { signal: exec.signal });
    return {
      configured: true,
      title: res?.title,
      outputSchema: res?.output_schema,
      inputSchema: res?.input_schema,
      warnings: res?.warnings ?? [],
      next: 'pass the output json_schema to deep_research (output_kind json) or batch_enrich (output_json_schema)',
    };
  });
}

// ---- registration ----

const renderJson = (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }];
const OUT = { schema: { type: 'object', additionalProperties: true, properties: {} }, render: renderJson } as const;
const STR = (description: string, required = false) => ({ type: 'string', ...(required ? { required: true } : {}), description });
const OBJ = (description: string, required = false) => ({ type: 'object', additionalProperties: true, properties: {}, ...(required ? { required: true } : {}), description });
const ARR = (description: string, required = false) => ({ type: 'array', ...(required ? { required: true } : {}), items: { type: 'string' }, description });
const FRAME_PARAM = { type: 'string', description: 'The frame (f_…) to put the run card and its results in. Default: the open board.' };
const DOMAINS = ARR('Only these sites (a hard allow list; filters reduce quality, prefer steering through the objective).');
const XDOMAINS = ARR('Leave these sites out.');

export function apply(ctx: any) {
  const tools = { register: (tool: any) => ctx.tools.register(abortFirst(tool)) };
  const store = ctx.orbCanvas as CanvasStore;
  const svc = ctx.orbParallel as ParallelService;
  const c: Ctx = { svc, store };
  const def = (name: string, description: string, parameters: Record<string, unknown>, run: (c: Ctx, raw: unknown, exec: BoardToolExec) => Promise<unknown>) =>
    tools.register(defineTool({ name, description, parameters, output: OUT, execute: (args: unknown, exec: BoardToolExec) => run(c, args, exec) } as any));

  def(
    'parallel_extract',
    'Read specific public pages with Parallel ($0.001 per URL, 1-20 s): focused excerpts for an objective, or the whole page with full_content. Up to 20 URLs. ' +
      'Per-URL failures come back in errors (then use fetch_url, or capture_page for a login page or a screenshot).',
    {
      urls: { type: 'array', required: true, items: { type: 'string' }, description: 'Public http(s) URLs, 1-20.' },
      objective: STR('What you want from the pages (focuses the excerpts). Give it.'),
      queries: ARR('Up to 5 keyword queries to focus the excerpts.'),
      full_content: { type: 'boolean', description: 'Return the whole page as Markdown (long). Default false.' },
      fresh: { type: 'boolean', description: 'Fetch live (a page up to 10 minutes old at most) instead of the index.' },
      refresh: REFRESH,
    },
    parallelExtract,
  );
  def(
    'image_search',
    'Find images with Parallel ($0.001 fast, $0.005 advanced, ~1 s). Returns image and source page URLs; keep the source page as attribution.',
    {
      queries: ARR('1-5 queries.', true),
      objective: STR('What the images are for.'),
      mode: { type: 'string', enum: ['fast', 'advanced'], description: 'fast (default) or advanced.' },
      max_results: { type: 'integer', description: 'Up to 20 (default 10).' },
      country: STR('Two-letter country code.'),
    },
    imageSearch,
  );
  def(
    'web_answer',
    'A cited, synthesized answer to ONE complete, self-contained question (Parallel Responses). effort low (~5-10 s, $0.01) for facts, medium (~15-20 s, $0.05) for multi-hop, high (~30-60 s, $0.25) for hard synthesis. ' +
      'Prefer it over many search and read loops when the user wants an answer. Cite with the returned citations (url, title, the cited sentence).',
    {
      question: STR('The whole question, with every constraint.', true),
      effort: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Default low.' },
      schema: OBJ('A JSON schema for a structured answer (returned as data).'),
      include_domains: DOMAINS,
      exclude_domains: XDOMAINS,
      follow_up_of: STR('A responseId from an earlier answer, to continue it.'),
      refresh: REFRESH,
    },
    webAnswer,
  );
  def(
    'deep_research',
    'Analyst-grade research with Parallel (Task API): a cited report or structured JSON with per-field citations and confidence. Minutes. ' +
      'processor lite/base ($0.005-0.01) for 1-5 simple fields, core ($0.025) for up to 10 cross-checked fields, pro ($0.10, default) for exploratory deep research, ultra ($0.30) for hard multi-source reports, ultra2x-8x only when the user asks for maximum depth. ' +
      'A card on the board shows live progress and then the result with its sources. These runs cannot be cancelled once started: stopping only detaches and the run is still billed. ' +
      'Use wait=false and keep working; check back with research_status. Never put citations, sources or confidence fields in a JSON schema. The user is asked before ultra and above.',
    {
      input: STR('The research question or task (text, up to 15,000 characters).'),
      input_json: OBJ('The input as JSON instead of text.'),
      processor: { type: 'string', enum: [...TASK_PROCESSOR_NAMES], description: 'Default pro.' },
      output_kind: { type: 'string', enum: ['auto', 'text', 'json'], description: 'auto (default; a deep-research style result on pro and above), text (a report) or json (needs output_json_schema).' },
      output_description: STR('For text output: what the report should cover.'),
      output_json_schema: OBJ('For json output: a JSON schema, an object with properties (all required).'),
      include_domains: DOMAINS,
      exclude_domains: XDOMAINS,
      country: STR('Two-letter country code.'),
      data_sources: OBJ('Data connectors: {free: [pubmed, clinical_trials, chembl, biorxiv, npi_registry, cms_coverage], pay_per_use: [carbonarc]}.'),
      follow_up_of: STR('An interactionId from an earlier run, to continue its research.'),
      wait: { type: 'boolean', description: 'Wait for the result (default true). false: return at once.' },
      refresh: REFRESH,
      title: STR('The card title (default: the start of the input).'),
      frameId: FRAME_PARAM,
    },
    deepResearch,
  );
  def(
    'research_status',
    'Check a Parallel run (deep_research, batch_enrich, find_entities) by its runId: status, progress and, when done, the cited result. Also attaches again to a run that was detached.',
    { run_id: STR('The runId from the tool that started it (trun_…, tgrp_…, findall_…).', true) },
    researchStatus,
  );
  def(
    'batch_enrich',
    'The same question for many rows (up to 1000) with Parallel Task Groups: results fill a Database card (one column per output field, plus Sources and Needs review), as they finish. ' +
      'processor base (default; $0.01 a row) unless rows need cross-checking (core, $0.025). More than 50 rows asks the user first. Stopping detaches: the runs go on and are billed.',
    {
      rows: { type: 'array', required: true, items: { type: 'object', additionalProperties: true, properties: {} }, description: 'Rows: strings, or objects of named values (companies, papers, people). 1-1000.' },
      output_json_schema: OBJ('One row\'s output: an object schema with properties (the new columns). No citations/sources/confidence fields.', true),
      processor: { type: 'string', enum: ['lite', 'base', 'core'], description: 'Default base.' },
      include_domains: DOMAINS,
      title: STR('The database title.'),
      frameId: FRAME_PARAM,
      wait: { type: 'boolean', description: 'Wait for every row (default true). false: return at once.' },
    },
    batchEnrich,
  );
  def(
    'find_entities',
    'A verified list of companies or people matching explicit criteria (Parallel FindAll), as a Database card. ALWAYS start with generator preview ($0.10), then base ($0.25 + $0.03/match), core ($2 + $0.15/match) or pro ($10 + $1/match) for rare matches; core and pro ask the user first. ' +
      'Without match_conditions orb derives them from the objective. enrichments add columns. Stopping cancels the search for real (work done is still billed) and keeps the matches so far.',
    {
      objective: STR('What to find, in one or two sentences.', true),
      entity_type: STR('companies (default), people, or another type.'),
      match_conditions: { type: 'array', items: { type: 'object', additionalProperties: true, properties: {} }, description: 'Boolean criteria: [{name, description}]. Omit to derive them.' },
      generator: { type: 'string', enum: ['preview', 'base', 'core', 'pro'], description: 'Default preview.' },
      match_limit: { type: 'integer', description: 'How many matches (5-1000; preview 5-10). Default 10.' },
      enrichments: { type: 'array', items: { type: 'object', additionalProperties: true, properties: {} }, description: 'Extra columns: [{processor?: lite|base|core, json_schema}].' },
      exclude: { type: 'array', items: { type: 'object', additionalProperties: true, properties: {} }, description: 'Entities to leave out: [{name, url}].' },
      title: STR('The database title.'),
      frameId: FRAME_PARAM,
      wait: { type: 'boolean', description: 'Wait for the search (default true). false: return at once.' },
      refresh: REFRESH,
    },
    findEntities,
  );
  def(
    'find_entities_extend',
    'Add more matches to a find_entities search that stopped at its match limit (no new fixed fee).',
    {
      findall_id: STR('The findallId from find_entities.', true),
      additional_match_limit: { type: 'integer', required: true, description: 'How many more matches (1-1000).' },
    },
    findEntitiesExtend,
  );
  def(
    'entity_search',
    'A quick UNVERIFIED list of companies or people (Parallel Entity Search, $0.005, ~2 s) as a Database card. No citations: use find_entities for verified matches.',
    {
      entity_type: { type: 'string', required: true, enum: ['people', 'companies'], description: 'people or companies.' },
      objective: STR('What to find.', true),
      limit: { type: 'integer', description: '5-1000 (default 25).' },
      place: { type: 'boolean', description: 'Put the list on the board as a Database card (default true).' },
      title: STR('The database title.'),
      frameId: FRAME_PARAM,
    },
    entitySearch,
  );
  def(
    'research_memory',
    "Recall this board's earlier Parallel runs (deep research, entity searches, watches) so you do not repeat them.",
    { query: STR('What to look for.'), kind: { type: 'string', enum: ['task', 'monitor', 'findall'], description: 'Only this kind.' }, limit: { type: 'integer', description: 'Up to 25 (default 10).' } },
    researchMemory,
  );
  def(
    'suggest_task_spec',
    'Ask Parallel for an output JSON schema that fits what you want to research, to pass to deep_research or batch_enrich.',
    { intent: STR('What you want to find out, for what.', true) },
    suggestTaskSpec,
  );
  def(
    'watch_topic',
    'Watch a topic over time with a Parallel monitor, ONLY when the user asks. It runs on Parallel servers on a schedule, costs money on every check (1d lite is about $0.09 a month) even when orb is closed, and the user is always asked first. A Watch card shows it.',
    {
      query: STR('What to watch, as an intent in natural language (no dates, no boolean keywords).', true),
      frequency: STR('6h, 1d (default), 1w … from 1h to 30d.'),
      processor: { type: 'string', enum: ['lite', 'base'], description: 'lite (default, narrow topics) or base (broad topics, more cost).' },
      include_domains: DOMAINS,
      output_json_schema: OBJ('Optional structured output for each event.'),
      backfill: { type: 'boolean', description: 'Include recent past events on the first run.' },
      title: STR('The watch title.'),
      frameId: FRAME_PARAM,
    },
    watchTopic,
  );
  def('list_watches', "The watches on this board: id, topic, schedule, status, event count (no network).", {}, listWatches);
  def(
    'watch_events',
    "Read a watch's new events now: each becomes a doc card on the board with its sources.",
    { monitor_id: STR('The monitorId from watch_topic or list_watches.', true) },
    watchEvents,
  );
  def('stop_watch', 'Stop a watch for good (it then costs nothing).', { monitor_id: STR('The monitorId.', true) }, stopWatch);
}
