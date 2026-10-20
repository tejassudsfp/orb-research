/**
 * Entity, media and technical cards (P6.6): Person/Org (`entity`), Product/Competitor (`product`), Video or social
 * post (`video`), Code, Math and Checklist. Their `Card.data` schemas and the pure helpers that both the UI and the
 * agents' describers use. Like the text types they are loose objects: length-checked, extra fields kept.
 *
 * - Every card keeps its name in `title` and its text in `body`, so titles, search and the default readers work.
 * - A video is NEVER embedded: the card holds a thumbnail (an image asset the agent captured or the user provided)
 *   and a link that opens in the default browser.
 * - A checklist's `done` flags are the user's: an agent may propose items, but the planner (commands.ts) refuses an
 *   agent change that ticks, unticks or deletes the tick of an item.
 */
import { z } from 'zod';
import { AssetRef, SourceUrl } from './cards.js';

const Text = (max: number) => z.string().max(max);

/** A labelled fact ("Founded: 2019"). */
export const Fact = z.strictObject({ label: Text(80), value: Text(400) });
export type Fact = z.infer<typeof Fact>;
export const FACT_LIMIT = 12;
const Facts = z.array(Fact).max(FACT_LIMIT);

/** Person or organisation. */
export const EntityData = z.looseObject({
  title: Text(200).optional(),
  kind: z.enum(['person', 'org']).optional(),
  role: Text(200).optional(),
  org: Text(200).optional(),
  location: Text(200).optional(),
  body: Text(4000).optional(),
  url: SourceUrl.optional(),
  facts: Facts.optional(),
  photo: AssetRef.optional(),
});
export type EntityData = z.infer<typeof EntityData>;

/** Product or competitor. Like any card it can attach a dataset view (`Card.view`, P6.3). */
export const ProductData = z.looseObject({
  title: Text(200).optional(),
  kind: z.enum(['product', 'competitor']).optional(),
  vendor: Text(200).optional(),
  body: Text(4000).optional(),
  url: SourceUrl.optional(),
  pricing: Text(500).optional(),
  strengths: z.array(Text(300)).max(8).optional(),
  weaknesses: z.array(Text(300)).max(8).optional(),
  facts: Facts.optional(),
});
export type ProductData = z.infer<typeof ProductData>;

/** Video or social post: a link and a thumbnail. Never embedded. */
export const VideoData = z.looseObject({
  title: Text(500).optional(),
  url: SourceUrl.optional(),
  platform: Text(60).optional(),
  author: Text(200).optional(),
  duration: Text(20).optional(),
  publishedAt: Text(40).optional(),
  body: Text(4000).optional(),
  thumb: AssetRef.optional(),
});
export type VideoData = z.infer<typeof VideoData>;

export const CODE_MAX = 20_000;
/** Code: a snippet with its language, syntax-highlighted by the renderer (bundled highlight.js). */
export const CodeData = z.looseObject({
  title: Text(500).optional(),
  language: Text(30).optional(),
  code: Text(CODE_MAX).optional(),
  body: Text(2000).optional(),
});
export type CodeData = z.infer<typeof CodeData>;

export const MATH_MAX = 4000;
/** Math: LaTeX, rendered by the bundled KaTeX. */
export const MathData = z.looseObject({
  title: Text(500).optional(),
  latex: Text(MATH_MAX).optional(),
  body: Text(2000).optional(),
});
export type MathData = z.infer<typeof MathData>;

export const CHECKLIST_MAX = 100;
export const ChecklistItem = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,24}$/),
  text: Text(300),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof ChecklistItem>;
/** Checklist: items agents propose and the user ticks. */
export const ChecklistData = z.looseObject({
  title: Text(500).optional(),
  items: z.array(ChecklistItem).max(CHECKLIST_MAX).optional(),
});
export type ChecklistData = z.infer<typeof ChecklistData>;

/** The next free item id (`i1`, `i2`…) of a list. */
export function nextItemId(items: readonly { id: string }[]): string {
  let max = 0;
  for (const it of items) {
    const n = /^i(\d+)$/.exec(it.id);
    if (n) max = Math.max(max, Number(n[1]));
  }
  return `i${max + 1}`;
}

/** Items from the texts an agent proposes: an unchanged text keeps its item (and its tick); others are new, open. */
export function itemsFromTexts(texts: readonly string[], current: readonly ChecklistItem[]): ChecklistItem[] {
  const pool = [...current];
  const out: ChecklistItem[] = [];
  for (const raw of texts) {
    const text = raw.trim();
    if (!text) continue;
    const at = pool.findIndex((it) => it.text === text);
    if (at >= 0) out.push(pool.splice(at, 1)[0]!);
    else out.push({ id: nextItemId([...current, ...out]), text, done: false });
  }
  return out;
}

/**
 * Why a change of checklist data by an agent is not allowed, or undefined when it is. An agent never ticks: every
 * item it keeps must keep its `done`, every item it adds is open, and an item the user ticked cannot be removed.
 */
export function checklistTickViolation(before: unknown, after: unknown): string | undefined {
  const next = ChecklistData.safeParse(after);
  if (!next.success) return undefined; // the schema check reports this
  const prev = ChecklistData.safeParse(before);
  const old = new Map((prev.success ? (prev.data.items ?? []) : []).map((it) => [it.id, it]));
  const kept = new Set<string>();
  for (const it of next.data.items ?? []) {
    kept.add(it.id);
    const was = old.get(it.id);
    if ((was?.done ?? false) !== it.done)
      return `agents cannot tick or untick checklist items (item ${it.id}); propose items and the user ticks them`;
  }
  for (const [id, it] of old)
    if (it.done && !kept.has(id)) return `agents cannot remove an item the user ticked (item ${id})`;
  return undefined;
}

/** "3 of 5 done" for a checklist's data. */
export function checklistProgress(data: unknown): { done: number; total: number } {
  const items = ChecklistData.safeParse(data);
  const list = items.success ? (items.data.items ?? []) : [];
  return { done: list.filter((i) => i.done).length, total: list.length };
}

/** The host of a video link without `www.` ("youtube.com"), or the platform an author gave. */
export function videoPlatformOf(data: { url?: string; platform?: string }): string {
  if (data.platform?.trim()) return data.platform.trim();
  try {
    return data.url ? new URL(data.url).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

/** Two-letter initials of a name ("Ada Lovelace" -> "AL"). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]![0] ?? '?';
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? '') : (words[0]![1] ?? '');
  return (first + last).toUpperCase();
}
