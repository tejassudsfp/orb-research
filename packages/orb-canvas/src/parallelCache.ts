/**
 * The per-canvas result cache of Parallel calls (P6.8, PLAN "Caching" 3): `web_search` (Parallel mode),
 * `parallel_extract`, `web_answer`, `deep_research` and `find_entities`. The same question asked again on the same
 * canvas (by the same agent a turn later, or another agent) is answered from the saved result: no request, no cost,
 * and the answer says so. `refresh: true` runs it again and replaces the entry.
 *
 * Stored in the canvas folder, `assets/parallel/cache/<sha256>.json`, written only here (orb-canvas, atomic temp +
 * rename). `assets/parallel/` is a subfolder, so the asset GC never touches it. A canvas that is deleted takes its
 * cache with it; a copy of a canvas folder carries it along.
 *
 * The key is the tool plus its NORMALISED input: strings trimmed and case-folded, whitespace collapsed, set-like lists
 * (urls, queries, domains) sorted and de-duplicated, object keys sorted, and the knobs that do not change the answer
 * (`refresh`, `wait`, `title`, `frameId`) left out. The processor (or effort, generator, mode) is part of the input,
 * so asking for a better processor is a different entry.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Cached results are kept this long (a result older than this is run again). Generous: research ages slowly. */
export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** The folder inside a canvas. */
export const PARALLEL_CACHE_DIR = 'assets/parallel/cache';

/** Keys that never change what Parallel answers. */
const IGNORED = new Set(['refresh', 'wait', 'title', 'frameId', 'why']);
/** Lists whose order does not matter. */
const SET_LIKE = new Set(['urls', 'queries', 'include_domains', 'exclude_domains', 'allowed_domains', 'blocked_domains']);

const foldString = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

/** A stable, normalised form of an input (see the file comment). */
export function normalise(value: unknown, key = ''): unknown {
  if (typeof value === 'string') return foldString(value);
  if (Array.isArray(value)) {
    const items = value.map((v) => normalise(v));
    if (!SET_LIKE.has(key)) return items;
    return [...new Set(items.map((i) => JSON.stringify(i)))].sort().map((s) => JSON.parse(s) as unknown);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (IGNORED.has(k) || v === undefined || v === null) continue;
      out[k] = normalise(v, k);
    }
    return out;
  }
  return value;
}

export type CacheEntry<T = unknown> = { tool: string; at: number; value: T };

export class ParallelResultCache {
  /** Hits and misses since this store opened (tests, diagnostics). */
  readonly stats = { hits: 0, misses: 0, writes: 0 };

  constructor(
    private readonly dirOf: (canvasId: string) => string,
    private readonly now: () => number = Date.now,
  ) {}

  /** The cache key of a call: tool + normalised input. */
  key(tool: string, input: unknown): string {
    return createHash('sha256').update(JSON.stringify({ tool, input: normalise(input) })).digest('hex');
  }

  private file(canvasId: string, key: string): string {
    return join(this.dirOf(canvasId), PARALLEL_CACHE_DIR, `${key}.json`);
  }

  async get<T>(canvasId: string, key: string): Promise<CacheEntry<T> | undefined> {
    try {
      const entry = JSON.parse(await readFile(this.file(canvasId, key), 'utf8')) as CacheEntry<T>;
      if (typeof entry?.at !== 'number' || this.now() - entry.at > CACHE_MAX_AGE_MS) {
        this.stats.misses++;
        return undefined;
      }
      this.stats.hits++;
      return entry;
    } catch {
      this.stats.misses++;
      return undefined;
    }
  }

  async put(canvasId: string, key: string, tool: string, value: unknown): Promise<void> {
    const file = this.file(canvasId, key);
    await mkdir(join(this.dirOf(canvasId), PARALLEL_CACHE_DIR), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify({ tool, at: this.now(), value } satisfies CacheEntry));
      await rename(tmp, file);
      this.stats.writes++;
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }
}

/** What a cache hit adds to the saved result: it says it is cached, that it cost nothing, and how to run it again. */
export function cachedNote(at: number, now: number): { cached: true; costUsd: 0; cachedAgo: string; note: string } {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  const ago = minutes < 1 ? 'just now' : minutes < 90 ? `${minutes} min ago` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} days ago`;
  return {
    cached: true,
    costUsd: 0,
    cachedAgo: ago,
    note: `Served from this canvas's cache (the same request ran ${ago}): nothing was spent. Pass refresh: true to run it again.`,
  };
}
