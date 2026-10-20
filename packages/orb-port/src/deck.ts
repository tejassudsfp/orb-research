/**
 * @orb/port deck (docs/phase6/PLAN.md P6.17): the slides' citation rule, edits and storage, beside the research
 * document's. Harness-free; the `compose_slides` tool itself is registered by orb-canvas, and only the canvas service
 * calls the storage functions (it stays the single writer of canvas folders).
 *
 * - `validateSlides`: citations are structural. Every slide except a title or section divider needs a non-empty
 *   `cardIds`; every cited card and every visual must be a card of the compose scope. Anything else is refused with a
 *   short message the model can act on, and nothing is written.
 * - `upsertSlides` / `applyDeckEdits`: a slide replaces the one with its id (in place); the slide view's edits change
 *   text and order only, so an edited slide keeps its citations and visual, and a new slide is `userAuthored`.
 * - `readDeck` / `writeDeck` / `writeDeckInstructions`: `deck/deck.json` and `deck/instructions.json`, written
 *   atomically inside a real `deck/` folder.
 */
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, open as openFile, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ComposeSlidesArgs,
  DECK_DIR,
  DECK_FILE,
  DECK_INSTRUCTIONS_FILE,
  DECK_LIMITS,
  Deck,
  DeckInstructions,
  UNCITED_LAYOUTS,
  type DeckSaveArgs,
  type Slide,
  type SlideLayout,
} from '@orb/shared';
import { PortError } from './index.js';

export type ValidSlide = {
  slideId: string;
  layout: SlideLayout;
  title: string;
  subtitle?: string;
  bullets: string[];
  visual?: { cardId: string; caption: string };
  notes?: string;
  cardIds: string[];
};

/**
 * Check one `compose_slides` call against the cards in scope (`inScope(id)`; `exists(id)` tells an unknown id from one
 * outside the scope). Duplicate ids on one slide are collapsed; the visual's card is added to the slide's citations.
 */
export function validateSlides(
  raw: unknown,
  inScope: (cardId: string) => boolean,
  exists: (cardId: string) => boolean = inScope,
): ValidSlide[] {
  const parsed = ComposeSlidesArgs.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path ?? [];
    throw new PortError('invalid', `invalid ${path.map(String).join('.') || 'arguments'}: ${issue?.message ?? 'bad value'}`);
  }
  const seen = new Set<string>();
  return parsed.data.slides.map((s, i) => {
    const at = `slide ${i + 1} (${s.slideId})`;
    if (seen.has(s.slideId)) throw new PortError('invalid', `${at}: the slide id is used twice in this call`);
    seen.add(s.slideId);
    const check = (id: string, what: string) => {
      if (!inScope(id))
        throw new PortError(
          'out-of-scope',
          exists(id)
            ? `${at}: ${what} ${id} is outside the scope of this deck; cite only cards in scope`
            : `${at}: ${what} ${id} is not a card on this board`,
        );
    };
    const cardIds = [...new Set(s.cardIds.map((c) => c.trim()).filter(Boolean))];
    for (const id of cardIds) check(id, 'card');
    let visual: ValidSlide['visual'];
    if (s.visualCardId?.trim()) {
      const id = s.visualCardId.trim();
      check(id, 'the visual card');
      visual = { cardId: id, caption: s.caption ?? '' };
      if (!cardIds.includes(id)) cardIds.push(id);
    }
    if (!UNCITED_LAYOUTS.includes(s.layout) && cardIds.length === 0)
      throw new PortError(
        'uncited',
        `${at}: a ${s.layout} slide must cite at least one card in cardIds (nothing was written)`,
      );
    if ((s.layout === 'visual' || s.layout === 'two-column') && !visual)
      throw new PortError('invalid', `${at}: a ${s.layout} slide needs visualCardId, the card it shows`);
    const bullets = s.bullets ?? [];
    if (s.layout === 'bullets' && bullets.length === 0)
      throw new PortError('invalid', `${at}: a bullets slide needs at least one bullet`);
    if (s.layout === 'quote' && !visual && bullets.length === 0)
      throw new PortError('invalid', `${at}: a quote slide needs the quote card as visualCardId, or the quote in bullets`);
    return {
      slideId: s.slideId,
      layout: s.layout,
      title: s.title,
      ...(s.subtitle ? { subtitle: s.subtitle } : {}),
      bullets,
      ...(visual ? { visual } : {}),
      ...(s.notes ? { notes: s.notes } : {}),
      cardIds,
    };
  });
}

/** A new, empty deck. */
export function emptyDeck(input: Pick<Deck, 'title' | 'scope' | 'instructions' | 'format'>, now: number): Deck {
  return { v: 1, version: 0, ...input, slides: [], composedAt: now, updatedAt: now };
}

/**
 * Put composed slides into the deck: one with an existing id replaces it in place, the others are appended in call
 * order. Answers the deck and the 1-based position of each slide written.
 */
export function upsertSlides(
  deck: Deck,
  slides: readonly ValidSlide[],
  meta: { now: number; model?: string },
): { deck: Deck; positions: number[] } {
  let list = [...deck.slides];
  for (const v of slides) {
    const next: Slide = {
      id: v.slideId,
      layout: v.layout,
      title: v.title,
      ...(v.subtitle ? { subtitle: v.subtitle } : {}),
      bullets: v.bullets,
      ...(v.visual ? { visual: v.visual } : {}),
      ...(v.notes ? { notes: v.notes } : {}),
      cardIds: v.cardIds,
      composedAt: meta.now,
      ...(meta.model ? { model: meta.model } : {}),
    };
    const at = list.findIndex((s) => s.id === v.slideId);
    if (at >= 0) list[at] = next;
    else {
      if (list.length >= DECK_LIMITS.slides)
        throw new PortError('invalid', `a deck holds at most ${DECK_LIMITS.slides} slides`);
      list = [...list, next];
    }
  }
  return {
    deck: { ...deck, slides: list, version: deck.version + 1, updatedAt: meta.now },
    positions: slides.map((v) => list.findIndex((s) => s.id === v.slideId) + 1),
  };
}

const slugOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'slide';

/**
 * Apply the slide view's edits (`deck.save`): reorder, delete, edit text, add the user's own slides. A slide named by
 * `id` keeps its citations, visual and (unless `layout` is sent) layout; a slide without `id` is the user's. The edits
 * must start from the current `version`.
 */
export function applyDeckEdits(deck: Deck, edits: DeckSaveArgs, now: number): Deck {
  if (edits.version !== deck.version)
    throw new PortError(
      'conflict',
      `the deck changed (version ${deck.version}, edits made on ${edits.version}); reload it and edit again`,
    );
  const byId = new Map(deck.slides.map((s) => [s.id, s]));
  const used = new Set<string>();
  const taken = new Set(deck.slides.map((s) => s.id));
  const slides = edits.slides.map((e): Slide => {
    if (e.id === undefined) {
      let id = slugOf(e.title);
      for (let n = 2; taken.has(id); n++) id = `${slugOf(e.title).slice(0, 40)}-${n}`;
      taken.add(id);
      return {
        id,
        layout: e.layout ?? 'bullets',
        title: e.title,
        ...(e.subtitle ? { subtitle: e.subtitle } : {}),
        bullets: e.bullets,
        ...(e.notes ? { notes: e.notes } : {}),
        cardIds: [],
        userAuthored: true,
        composedAt: now,
      };
    }
    const before = byId.get(e.id);
    if (!before || used.has(e.id)) throw new PortError('not-found', `no slide ${e.id} in this deck`);
    used.add(e.id);
    const layout = e.layout ?? before.layout;
    // A layout that needs a visual cannot be given to a slide without one.
    if ((layout === 'visual' || layout === 'two-column') && !before.visual)
      throw new PortError('invalid', `slide ${e.id} has no visual card, so it cannot be a ${layout} slide`);
    const same =
      before.layout === layout &&
      before.title === e.title &&
      (before.subtitle ?? '') === (e.subtitle ?? '') &&
      (before.notes ?? '') === (e.notes ?? '') &&
      before.bullets.length === e.bullets.length &&
      before.bullets.every((b, i) => b === e.bullets[i]);
    if (same) return before;
    const { subtitle: _s, notes: _n, ...rest } = before;
    void _s;
    void _n;
    return {
      ...rest,
      layout,
      title: e.title,
      ...(e.subtitle ? { subtitle: e.subtitle } : {}),
      bullets: e.bullets,
      ...(e.notes ? { notes: e.notes } : {}),
      ...(before.userAuthored ? {} : { edited: true as const }),
    };
  });
  return { ...deck, slides, version: deck.version + 1, updatedAt: now };
}

// ---- Storage ----

async function deckDir(canvasDir: string): Promise<string> {
  const dir = join(canvasDir, DECK_DIR);
  await mkdir(dir, { recursive: true });
  const st = await lstat(dir);
  if (!st.isDirectory() || st.isSymbolicLink())
    throw new PortError('invalid', `${DECK_DIR} is not a folder of this canvas`);
  return dir;
}

async function syncDir(dir: string): Promise<void> {
  const fh = await openFile(dir, 'r');
  try {
    await fh.sync();
  } catch {
    // some filesystems refuse fsync on a directory
  } finally {
    await fh.close();
  }
}

async function writeAtomic(dir: string, file: string, text: string): Promise<void> {
  const tmp = join(dir, `.${file}.${randomBytes(6).toString('hex')}.tmp`);
  const fh = await openFile(tmp, 'wx', 0o644);
  try {
    await fh.writeFile(text);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, join(dir, file));
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || err instanceof SyntaxError) return undefined;
    throw err;
  }
}

/** The stored deck and instructions (null when absent or unreadable). */
export async function readDeck(
  canvasDir: string,
): Promise<{ deck: Deck | null; instructions: DeckInstructions | null }> {
  const dir = join(canvasDir, DECK_DIR);
  const [deck, instructions] = await Promise.all([
    readJson(join(dir, DECK_FILE)),
    readJson(join(dir, DECK_INSTRUCTIONS_FILE)),
  ]);
  const d = Deck.safeParse(deck);
  const i = DeckInstructions.safeParse(instructions);
  return { deck: d.success ? d.data : null, instructions: i.success ? i.data : null };
}

export async function writeDeck(canvasDir: string, deck: Deck): Promise<void> {
  const dir = await deckDir(canvasDir);
  await writeAtomic(dir, DECK_FILE, `${JSON.stringify(Deck.parse(deck), null, 2)}\n`);
  await syncDir(dir);
}

export async function writeDeckInstructions(canvasDir: string, value: DeckInstructions): Promise<void> {
  const dir = await deckDir(canvasDir);
  await writeAtomic(dir, DECK_INSTRUCTIONS_FILE, `${JSON.stringify(DeckInstructions.parse(value), null, 2)}\n`);
  await syncDir(dir);
}
