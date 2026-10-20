/**
 * Datasets in the renderer (P6.3): a small cache of the datasets the board shows, keyed by dataset id. A card knows a
 * dataset's `rev` (it is in the card's data or view); the rows are fetched when the cache has none or an older rev,
 * never for a rev the cache already passed (so undoing a view change cannot roll the rows back). An edit is applied
 * to the cached copy at once with the shared `applyEdit` (the sidecar applies the same function), then sent; if the
 * sidecar refuses it or disagrees about the new rev, the copy is dropped and fetched again.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { applyEdit, type Dataset, type DatasetEdit } from '@orb/shared';
import { useCardActions, type CardActions } from '../context.js';

type Entry = { ds: Dataset; at: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();
const errors = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;

const notify = () => {
  version++;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

function load(actions: Pick<CardActions, 'readDataset'>, id: string, rev: number): void {
  const key = `${id}@${rev}`;
  if (inflight.has(key)) return;
  const job = actions
    .readDataset(id)
    .then((ds) => {
      const have = cache.get(id);
      if (!have || ds.rev >= have.ds.rev) cache.set(id, { ds, at: Date.now() });
      errors.delete(id);
    })
    .catch((err: unknown) => {
      errors.set(id, (err as Error)?.message ?? 'could not load the data');
    })
    .finally(() => {
      inflight.delete(key);
      notify();
    });
  inflight.set(key, job);
}

/** The dataset `id` at `rev` or later (undefined while it loads). */
export function useDataset(id: string | undefined, rev: number): { ds: Dataset | undefined; error: string | undefined } {
  const actions = useCardActions();
  useSyncExternalStore(subscribe, () => version, () => 0);
  const have = id ? cache.get(id) : undefined;
  const stale = id !== undefined && (!have || have.ds.rev < rev) && !errors.has(`${id}`);
  useEffect(() => {
    if (id && stale) load(actions, id, rev);
  }, [actions, id, rev, stale]);
  return { ds: have?.ds, error: id ? errors.get(id) : undefined };
}

/** Retry a dataset that failed to load. */
export function useReloadDataset(id: string | undefined): () => void {
  const actions = useCardActions();
  return useCallback(() => {
    if (!id) return;
    errors.delete(id);
    cache.delete(id);
    load(actions, id, Number.MAX_SAFE_INTEGER);
    notify();
  }, [actions, id]);
}

/** Send edits of dataset `id`: applied to the cached copy first, then saved. */
export function useDatasetEdit(id: string | undefined): (edit: DatasetEdit) => void {
  const actions = useCardActions();
  return useCallback(
    (edit: DatasetEdit) => {
      if (!id) return;
      const have = cache.get(id);
      let expected: number | undefined;
      if (have) {
        try {
          const next = applyEdit(have.ds, edit, 'user');
          cache.set(id, { ds: next, at: Date.now() });
          expected = next.rev;
          notify();
        } catch {
          return; // an edit that does not fit the rows we hold: nothing to send
        }
      }
      void actions
        .editDataset(id, edit)
        .then((saved) => {
          if (expected !== undefined && saved.rev !== expected) {
            cache.delete(id);
            load(actions, id, saved.rev);
            notify();
          }
        })
        .catch((err: unknown) => {
          errors.set(id, (err as Error)?.message ?? 'could not save the data');
          cache.delete(id);
          load(actions, id, Number.MAX_SAFE_INTEGER);
          notify();
        });
    },
    [actions, id],
  );
}

/** Test hook: forget everything. */
export function resetDatasetCache(): void {
  cache.clear();
  inflight.clear();
  errors.clear();
  notify();
}
