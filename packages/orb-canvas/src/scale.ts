/**
 * Agents at scale (P6.8): what an agent reads of a big board, in layers, each with a hard size budget.
 *
 *  1. `board_map`: the frames, their counts, a short digest of each and the top titles; zoom into one frame for its
 *     cards (id, type, title). Frame digests are cached per frame and recomputed only for a frame whose cards changed
 *     (`BoardMapCache`: a frame's cards keep their object identity in the fold until they change).
 *  2. `search_board`: words in, ids and snippets out (FTS over index.sqlite, or a scan when the index is off).
 *  3. `read_card`: one card in full, in pages of at most {@link READ_PAGE_CHARS}.
 *  4. `query_dataset`: rows of a database (tools.ts).
 *  `query_board` stays, paginated and budgeted (tools.ts). Every result that can grow says what is "more available"
 *  and how to get it, instead of growing.
 *
 * A budget is in characters (about 4 per token): {@link RESULT_BUDGET_CHARS} is about 4k tokens. Pure and
 * harness-free: the board tools in tools.ts wrap these.
 */
import { describeCard } from '@orb/cards';
import {
  boardFrames,
  boardLinks,
  cardText,
  cardTitle,
  foldText,
  searchWords,
  type BoardState,
  type Card,
  type CardType,
  type Frame,
} from '@orb/shared';
import { sortCards } from './arrange.js';
import { visibleCards } from './layout.js';

/** Hard cap of one board read (`board_map`, `search_board`, `query_board`): about 4k tokens. */
export const RESULT_BUDGET_CHARS = 16_000;
/** Longest page `read_card` returns (the same 8k as `read_source` and `fetch_url`). */
export const READ_PAGE_CHARS = 8_000;
/** Hard cap on ANY board tool's result text, whatever it holds (a last line of defence). */
export const TOOL_RESULT_HARD_CAP_CHARS = 24_000;
/** Frames one `board_map` lists at most. */
export const MAP_FRAMES_MAX = 40;
/** Cards one frame zoom of `board_map` lists by default, and at most. */
export const MAP_CARDS_DEFAULT = 60;
export const MAP_CARDS_MAX = 120;
/** Hits one `search_board` returns by default, and at most. */
export const SEARCH_DEFAULT = 10;
export const SEARCH_MAX = 25;
/** Cards one `query_board` page returns by default, and at most. */
export const QUERY_PAGE_DEFAULT = 20;
export const QUERY_PAGE_MAX = 50;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Cut a result's text at the hard cap with a marker (the tools size their results well below this). */
export function capText(text: string, max = TOOL_RESULT_HARD_CAP_CHARS): string {
  return text.length <= max
    ? text
    : `${text.slice(0, max)}…[result cut at ${max} characters: ask for less (limit, offset, a narrower filter) or use read_card / search_board]`;
}

// ---- Frame digests (incremental) ----

const STOP = new Set(
  'the and for with from that this are was were has have into about over under their there which what when where how why not but its our your you can will would should could than then them they also more most some such via per'.split(
    ' ',
  ),
);

/** The most common meaningful words of some titles (a frame's themes). */
export function themesOf(titles: readonly string[], max = 4): string[] {
  const counts = new Map<string, number>();
  for (const t of titles)
    for (const w of new Set(searchWords(t))) {
      if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2 || titles.length <= 3)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, max)
    .map(([w]) => w);
}

/** Count of each card type, most frequent first. */
export function typeCounts(cards: readonly Pick<Card, 'type'>[]): Record<string, number> {
  const counts = new Map<CardType, number>();
  for (const c of cards) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
}

/** The digest line of a frame: type mix, themes and the headline cards. At most ~220 characters. */
export function frameDigest(state: BoardState, frame: Frame, cards: readonly Card[]): string {
  if (cards.length === 0) return 'empty';
  const mix = Object.entries(typeCounts(cards))
    .slice(0, 4)
    .map(([t, n]) => `${n} ${t}`)
    .join(', ');
  const titles = cards.map((c) => cardTitle(c));
  const themes = themesOf(titles);
  const top = sortCards(state, cards, 'importance')
    .slice(0, 2)
    .map((c) => `"${clip(cardTitle(c), 40)}"`)
    .join(', ');
  return clip(`${mix}${themes.length ? `; themes: ${themes.join(', ')}` : ''}; top: ${top}`, 220);
}

/**
 * Per-frame digests that survive between calls: a digest is recomputed only when the frame's title or any of its
 * visible cards changed (the fold keeps a card's object identity until a change replaces it, so "same objects" means
 * "same content").
 */
export class BoardMapCache {
  private readonly entries = new Map<string, { title: string; cards: readonly Card[]; digest: string }>();
  /** How many digests were computed and how many were served from the cache (tests, diagnostics). */
  readonly stats = { computed: 0, reused: 0 };

  digest(canvasId: string, state: BoardState, frame: Frame, cards: readonly Card[]): string {
    const key = `${canvasId}:${frame.id}`;
    const hit = this.entries.get(key);
    if (
      hit &&
      hit.title === frame.title &&
      hit.cards.length === cards.length &&
      hit.cards.every((c, i) => c === cards[i])
    ) {
      this.stats.reused++;
      return hit.digest;
    }
    const digest = frameDigest(state, frame, cards);
    this.entries.set(key, { title: frame.title, cards, digest });
    this.stats.computed++;
    return digest;
  }

  /** Forget a canvas (it was closed or deleted). */
  drop(canvasId: string): void {
    for (const key of this.entries.keys()) if (key.startsWith(`${canvasId}:`)) this.entries.delete(key);
  }
}

// ---- board_map ----

export type MapArgs = {
  frameId?: string | undefined;
  offset?: number | undefined;
  limit?: number | undefined;
};

const byOf = (c: Card) => (c.provenance.kind === 'agent' ? c.provenance.agent : 'user');
const numberOf = (frames: readonly Frame[], f: Frame) => String(frames.indexOf(f) + 1).padStart(2, '0');

/** Fit `build(level)` under `budget` characters: the first level (highest detail first) whose JSON fits. */
function fit<T>(levels: number, budget: number, build: (level: number) => T): T {
  let out = build(0);
  for (let level = 0; level < levels; level++) {
    out = build(level);
    if (JSON.stringify(out).length <= budget) return out;
  }
  return out;
}

/**
 * `board_map`. Without a frame: the whole board in one screen (frames with counts, a digest and the top titles; the
 * open board; the databases), shrunk level by level until it fits {@link RESULT_BUDGET_CHARS}, then cut at a frame
 * with "more" and a hint. With `frameId`: that frame's cards (id, type, title, who, badge), paged.
 */
export function boardMap(
  state: BoardState,
  cache: BoardMapCache,
  canvasId: string,
  args: MapArgs,
  frameBudget: number,
): Record<string, unknown> {
  const frames = boardFrames(state);
  const live = visibleCards(state);
  const inFrame = (id: string | null) => live.filter((c) => c.frameId === id);

  if (args.frameId) {
    const frame = state.frames[args.frameId];
    if (!frame) throw new Error(`no frame ${JSON.stringify(args.frameId)} on this board`);
    const cards = sortCards(state, inFrame(frame.id), 'importance');
    const offset = Math.max(0, args.offset ?? 0);
    const limit = Math.max(1, Math.min(args.limit ?? MAP_CARDS_DEFAULT, MAP_CARDS_MAX));
    const rowOf = (c: Card, titleMax: number) => ({
      id: c.id,
      type: c.type,
      title: clip(oneLine(cardTitle(c)), titleMax),
      by: byOf(c),
      ...(c.badge ? { badge: c.badge } : {}),
    });
    const digest = cache.digest(canvasId, state, frame, inFrame(frame.id));
    return fit(3, RESULT_BUDGET_CHARS, (level) => {
      const n = Math.max(1, Math.floor(limit / 2 ** level));
      const page = cards.slice(offset, offset + n);
      const left = cards.length - offset - page.length;
      return {
        frame: {
          id: frame.id,
          number: numberOf(frames, frame),
          title: frame.title,
          cards: cards.length,
          budget: frameBudget,
          digest,
        },
        cards: page.map((c) => rowOf(c, 90 - level * 20)),
        offset,
        returned: page.length,
        ...(left > 0
          ? {
              more: left,
              nextOffset: offset + page.length,
              hint: 'more cards in this frame: call board_map again with offset',
            }
          : {}),
      };
    });
  }

  const loose = inFrame(null);
  const databases = live.filter((c) => c.type === 'database');
  const offset = Math.max(0, args.offset ?? 0);
  const shown = frames.slice(offset, offset + Math.min(args.limit ?? MAP_FRAMES_MAX, MAP_FRAMES_MAX));
  // Digests first, once per call (the levels below only shorten them): the cache then counts one use per frame.
  const digests = new Map(shown.map((f) => [f.id, cache.digest(canvasId, state, f, inFrame(f.id))]));
  const build = (level: number, take: number) => {
    const titlesPer = [5, 3, 1, 0][level] ?? 0;
    const digestMax = level >= 3 ? 90 : 220;
    const list = shown.slice(0, take).map((f) => {
      const cards = inFrame(f.id);
      return {
        id: f.id,
        number: numberOf(frames, f),
        title: f.title,
        cards: cards.length,
        ...(cards.length > frameBudget ? { overBudget: true } : {}),
        types: typeCounts(cards),
        digest: clip(digests.get(f.id) ?? '', digestMax),
        ...(titlesPer > 0
          ? {
              top: sortCards(state, cards, 'importance')
                .slice(0, titlesPer)
                .map((c) => ({ id: c.id, type: c.type, title: clip(oneLine(cardTitle(c)), 60) })),
            }
          : {}),
      };
    });
    const left = frames.length - offset - list.length;
    return {
      board: { cards: live.length, frames: frames.length, links: boardLinks(state).length },
      frames: list,
      ...(loose.length > 0
        ? {
            openBoard: {
              cards: loose.length,
              types: typeCounts(loose),
              top: sortCards(state, loose, 'importance')
                .slice(0, Math.max(0, Math.min(3, titlesPer)))
                .map((c) => ({ id: c.id, type: c.type, title: clip(oneLine(cardTitle(c)), 60) })),
            },
          }
        : {}),
      ...(databases.length > 0
        ? {
            databases: databases.slice(0, 15).map((c) => {
              const d = (c.data ?? {}) as { title?: string; rowCount?: number; columns?: string[] };
              return {
                id: c.id,
                name: clip(d.title ?? cardTitle(c), 50),
                rows: d.rowCount ?? 0,
                columns: (d.columns ?? []).slice(0, 8),
              };
            }),
          }
        : {}),
      ...(left > 0
        ? {
            more: left,
            nextOffset: offset + list.length,
            hint: 'more frames: call board_map again with offset',
          }
        : {}),
      hint: 'zoom into a frame with board_map {frameId}; find a fact with search_board; read one card with read_card',
    };
  };
  // Detail levels first, then fewer frames when even the thinnest level is too big.
  for (let take = shown.length; take >= 1; take = take > 4 ? Math.floor(take * 0.75) : take - 1) {
    const out = fit(4, RESULT_BUDGET_CHARS, (level) => build(level, take));
    if (JSON.stringify(out).length <= RESULT_BUDGET_CHARS) return out;
  }
  return build(3, 0);
}

// ---- search_board ----

export type SearchHitView = {
  id: string;
  type: string;
  title: string;
  frameId: string | null;
  snippet: string;
};

/** A snippet of `text` around the first of `words` (folded match), at most `max` characters. */
export function snippetAround(text: string, words: readonly string[], max = 200): string {
  const flat = oneLine(text);
  if (flat.length <= max) return flat;
  const folded = foldText(flat);
  let at = -1;
  for (const w of words) {
    const i = folded.indexOf(w);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const start = Math.max(0, (at < 0 ? 0 : at) - Math.floor(max / 3));
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + max)}${start + max < flat.length ? '…' : ''}`;
}

/**
 * The scan behind `search_board` when index.sqlite is off: cards whose title and text contain every word, best
 * (title matches, then more occurrences) first. Same result shape as the indexed search.
 */
export function scanBoard(state: BoardState, q: string): SearchHitView[] {
  const words = searchWords(q);
  if (words.length === 0) return [];
  const scored: { hit: SearchHitView; score: number }[] = [];
  for (const card of visibleCards(state)) {
    const { title, body } = cardText(card);
    const ft = foldText(title);
    const fb = foldText(`${describeCard(card)}\n${body}`);
    if (!words.every((w) => ft.includes(w) || fb.includes(w))) continue;
    const score = words.reduce(
      (s, w) => s + (ft.includes(w) ? 10 : 0) + Math.min(5, fb.split(w).length - 1),
      0,
    );
    scored.push({
      score,
      hit: {
        id: card.id,
        type: card.type,
        title: clip(title, 90),
        frameId: card.frameId,
        snippet: snippetAround(body || describeCard(card), words),
      },
    });
  }
  return scored.sort((a, b) => b.score - a.score || (a.hit.id < b.hit.id ? -1 : 1)).map((s) => s.hit);
}

// ---- read_card ----

/** One card as full text: a header, what describe() says, and the card's whole text when there is more. */
export function cardFullText(state: BoardState, card: Card): string {
  const frames = boardFrames(state);
  const frame = card.frameId ? state.frames[card.frameId] : undefined;
  const where = frame ? `frame ${numberOf(frames, frame)} "${frame.title}" [${frame.id}]` : 'the open board';
  const { title, body } = cardText(card);
  const lines = [`[${card.id}] ${card.type} "${title}" by ${byOf(card)}, in ${where}`];
  if (card.why) lines.push(`Why: ${card.why}`);
  const described = describeCard(card);
  lines.push(`Summary: ${described}`);
  // The summary is clipped; the full text follows whenever there is more of it (a long doc, a source's excerpts…).
  const summaryBody = card.detail ? body.replace(card.detail, '').trim() : body;
  const flat = oneLine(summaryBody);
  if (flat && flat.length > described.length + 2 && !described.includes(flat))
    lines.push('', 'Full text:', summaryBody);
  if (card.detail) lines.push('', 'Detailed analysis:', card.detail);
  const d = (card.data ?? {}) as Record<string, unknown>;
  if (card.type === 'database' || card.view)
    lines.push(
      '',
      'Rows are not read here: use query_dataset with this card id (a structured query, 50 rows a page).',
    );
  else if (['source', 'quote', 'file'].includes(card.type) && typeof d.url === 'string' && d.url)
    lines.push('', 'The page or file behind this card is read with read_source (its cached text, in pages).');
  return lines.join('\n');
}

/** Split text into pages of at most `size` characters, breaking at a line or a space when one is near. */
export function paginate(text: string, size = READ_PAGE_CHARS): string[] {
  const pages: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf('\n', size);
    if (cut < size * 0.6) cut = rest.lastIndexOf(' ', size);
    if (cut < size * 0.6) cut = size;
    pages.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^[ \n]/, '');
  }
  pages.push(rest);
  return pages;
}

/** `read_card` page `page` (1-based) of a card. */
export function readCardPage(state: BoardState, card: Card, page = 1) {
  const pages = paginate(cardFullText(state, card));
  const n = Math.max(1, Math.min(page, pages.length));
  return {
    cardId: card.id,
    page: n,
    pages: pages.length,
    text: pages[n - 1]!,
    ...(n < pages.length ? { more: true, hint: `call read_card with page ${n + 1} for the rest` } : {}),
  };
}
