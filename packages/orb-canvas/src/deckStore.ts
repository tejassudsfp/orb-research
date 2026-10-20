/**
 * The deck's state on the canvas service (docs/phase6/PLAN.md P6.17): `deck/` of each canvas, written only here (the
 * canvas service stays the single writer of canvas folders; @orb/port holds the rules, the file format and the .pptx).
 * It mirrors `PortStore`:
 *
 * - **Compose jobs.** `deck.compose` (every slide) and `deck.regenerateSlide` (one slide) open a job: the scope, the
 *   format, the saved instructions and, for a regenerate, the one slide Orb may write. While a job runs,
 *   `compose_slides` is checked against the job's scope; a full compose starts a new deck with its first call (the old
 *   deck stays until Orb writes something). Without a job (Orb writes slides because the user asked in chat) the saved
 *   scope applies, else the whole board.
 * - **Progress.** Every written slide and every refused call is published to `onEvent` listeners (the `deck.compose`
 *   stream).
 * - **Edits.** `saveEdits` applies the slide view's reorder, delete and text edits (@orb/port `applyDeckEdits`).
 * - **Export.** `exportPptx` builds the .pptx from the deck and the cards (@orb/port `buildDeckPptx`) and stores it in
 *   `exports/` as `deck-<stamp>.pptx`; design frames use the latest snapshot the print pipeline took.
 *
 * Writes of one canvas's `deck/` are serialized.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import {
  ComposeSlidesArgs,
  DECK_LIMITS,
  SNAPSHOT_DIR,
  deckFormatById,
  deckFormatFor,
  portScopeCards,
  snapshotCapturedAt,
  type Appearance,
  type Actor,
  type BoardState,
  type Card,
  type ComposeSlidesResult,
  type Deck,
  type DeckExportResult,
  type DeckInstructions,
  type DeckSaveArgs,
  type ExportRef,
  type PrintScope,
} from '@orb/shared';
import {
  applyDeckEdits,
  buildDeckPptx,
  emptyDeck,
  isPortError,
  readDeck,
  upsertSlides,
  validateSlides,
  writeDeck,
  writeDeckInstructions,
  type PortError,
} from '@orb/port';
import { CanvasError } from './errors.js';
import { scopeText } from './context.js';

/** What a deck job reports while it runs. */
export type DeckEvent =
  { type: 'slide'; slideId: string; title: string; position: number } | { type: 'rejected'; message: string };

export type DeckJob = {
  kind: 'compose' | 'slide';
  scope: PrintScope;
  format: string;
  instructions: string;
  /** `slide` jobs: the one slide Orb may write. */
  slideId?: string;
  /** `slide` jobs: what the user asked to change. */
  change?: string;
  startedAt: number;
  /** Slides written by this job, in order. */
  composed: string[];
  /** A full compose starts a new deck with its first call. */
  replaced: boolean;
};

/** What the store needs from the canvas service. */
export type DeckHost = {
  appearance?(): Promise<Appearance>;
  dirOf(id: string): string;
  open(id: string): Promise<{ title: string; template?: string | undefined }>;
  boardState(id: string): Promise<BoardState>;
  now(): number;
  writeExport(
    id: string,
    input: { kind: 'deck'; ext: 'pptx'; data: AsyncIterable<Uint8Array> },
  ): Promise<ExportRef>;
};

function asCanvasError(err: PortError): CanvasError {
  const code =
    err.code === 'conflict'
      ? 'orb/conflict'
      : err.code === 'not-found'
        ? 'orb/not-found'
        : 'orb/invalid-args';
  return new CanvasError(code, err.message, { reason: err.code });
}

const ASSET = /^assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export class DeckStore {
  private readonly jobs = new Map<string, DeckJob>();
  private readonly writes = new Map<string, Promise<unknown>>();
  private readonly listeners = new Map<string, Set<(event: DeckEvent) => void>>();

  constructor(private readonly host: DeckHost) {}

  /** The stored deck and instructions of a canvas. */
  async get(id: string): Promise<{ deck: Deck | null; instructions: DeckInstructions | null }> {
    await this.host.open(id);
    return readDeck(this.host.dirOf(id));
  }

  job(id: string): DeckJob | undefined {
    return this.jobs.get(id);
  }

  onEvent(id: string, listener: (event: DeckEvent) => void): () => void {
    let set = this.listeners.get(id);
    if (!set) this.listeners.set(id, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(id);
    };
  }

  private emit(id: string, event: DeckEvent): void {
    for (const listener of this.listeners.get(id) ?? []) listener(event);
  }

  private serial<T>(id: string, task: () => Promise<T>): Promise<T> {
    const prev = this.writes.get(id) ?? Promise.resolve();
    const next = prev.then(task, task);
    const tail = next.catch(() => undefined);
    this.writes.set(id, tail);
    void tail.then(() => this.writes.get(id) === tail && this.writes.delete(id));
    return next;
  }

  /**
   * Open a job. A full compose saves the format, scope and instructions (`deck/instructions.json`, reused on
   * regenerate); a slide job takes them from what is saved and needs the slide to exist.
   */
  async begin(
    id: string,
    request:
      | { kind: 'compose'; scope: PrintScope; format?: string | undefined; instructions: string }
      | { kind: 'slide'; slideId: string; change: string },
  ): Promise<{ job: DeckJob; cards: number; context: string; deck: Deck | null }> {
    if (this.jobs.has(id))
      throw new CanvasError('orb/busy', 'orb is already writing the slides of this canvas', { canvasId: id });
    const meta = await this.host.open(id);
    const { deck, instructions } = await this.get(id);
    const state = await this.host.boardState(id);
    let job: DeckJob;
    if (request.kind === 'compose') {
      if (request.format && !deckFormatById(request.format))
        throw new CanvasError(
          'orb/invalid-args',
          `unknown deck format ${JSON.stringify(request.format)}`,
          {},
        );
      job = {
        kind: 'compose',
        scope: request.scope,
        format: request.format ?? deckFormatFor(meta.template).id,
        instructions: request.instructions.trim(),
        startedAt: this.host.now(),
        composed: [],
        replaced: false,
      };
    } else {
      if (!deck || !deck.slides.some((s) => s.id === request.slideId))
        throw new CanvasError('orb/not-found', `no slide ${request.slideId} in this deck`, {
          slideId: request.slideId,
        });
      job = {
        kind: 'slide',
        slideId: request.slideId,
        change: request.change.trim(),
        scope: instructions?.scope ?? deck.scope,
        format: instructions?.format ?? deck.format,
        instructions: instructions?.instructions ?? deck.instructions,
        startedAt: this.host.now(),
        composed: [],
        replaced: true,
      };
    }
    if (job.scope !== 'all') {
      const missing = job.scope.find((f) => !state.frames[f]);
      if (missing)
        throw new CanvasError('orb/not-found', `frame ${missing} is not on this canvas`, {
          frameId: missing,
        });
    }
    const cards = portScopeCards(state, job.scope).filter((c) => !c.stackedInto);
    if (cards.length === 0)
      throw new CanvasError('orb/invalid-args', 'there are no cards in this scope to make slides from', {});
    if (request.kind === 'compose')
      await this.serial(id, () =>
        writeDeckInstructions(this.host.dirOf(id), {
          format: job.format,
          instructions: job.instructions,
          scope: job.scope,
          savedAt: job.startedAt,
        }),
      );
    this.jobs.set(id, job);
    return { job, cards: cards.length, context: scopeText(state, job.scope), deck };
  }

  /** Close a job (whatever happened to the turn). */
  end(id: string, job: DeckJob): void {
    if (this.jobs.get(id) === job) this.jobs.delete(id);
  }

  /** `compose_slides` (Orb): check the citations against the scope, then write the slides into `deck/`. */
  async composeSlides(
    id: string,
    raw: unknown,
    actor: Extract<Actor, { kind: 'agent' }>,
  ): Promise<ComposeSlidesResult> {
    const meta = await this.host.open(id);
    const state = await this.host.boardState(id);
    const job = this.jobs.get(id);
    try {
      const stored = job ? undefined : await readDeck(this.host.dirOf(id));
      const scope: PrintScope = job?.scope ?? stored?.instructions?.scope ?? 'all';
      const inScope = new Set(portScopeCards(state, scope).map((c) => c.id));
      const slides = validateSlides(
        raw,
        (cardId) => inScope.has(cardId),
        (cardId) => cardId in state.cards,
      );
      const replaceAll = ComposeSlidesArgs.parse(raw).replaceAll === true;
      if (replaceAll && job?.kind === 'slide')
        throw new CanvasError(
          'orb/invalid-args',
          'a single-slide regeneration cannot replace the whole deck',
        );
      if (job?.kind === 'slide' && (slides.length !== 1 || slides[0]!.slideId !== job.slideId))
        throw new CanvasError(
          'orb/invalid-args',
          `this turn regenerates slide "${job.slideId}" only: call compose_slides with that one slide (slideId "${job.slideId}")`,
        );
      const model = actor.provider ? `${actor.provider}/${actor.model}` : actor.model;
      const result = await this.serial(id, async () => {
        const current = (await readDeck(this.host.dirOf(id))).deck;
        const format = job?.format ?? stored?.instructions?.format ?? 'standard';
        const instructions = job?.instructions ?? stored?.instructions?.instructions ?? '';
        const fresh = (job && !job.replaced) || replaceAll;
        let base =
          fresh || !current
            ? emptyDeck({ title: meta.title.slice(0, 200), scope, instructions, format }, this.host.now())
            : current;
        if (fresh && current) base = { ...base, version: current.version };
        const added = slides.filter((s) => !base.slides.some((x) => x.id === s.slideId)).length;
        if (base.slides.length + added > DECK_LIMITS.slides)
          throw new CanvasError('orb/invalid-args', `a deck holds at most ${DECK_LIMITS.slides} slides`);
        const { deck, positions } = upsertSlides(base, slides, { now: this.host.now(), model });
        const final: Deck = { ...deck, title: meta.title.slice(0, 200) };
        await writeDeck(this.host.dirOf(id), final);
        if (job) {
          job.replaced = true;
          for (const s of slides) if (!job.composed.includes(s.slideId)) job.composed.push(s.slideId);
        }
        return { deck: final, positions };
      });
      for (const [i, s] of slides.entries())
        this.emit(id, { type: 'slide', slideId: s.slideId, title: s.title, position: result.positions[i]! });
      return {
        slides: slides.length,
        total: result.deck.slides.length,
        citations: new Set(slides.flatMap((s) => s.cardIds)).size,
      };
    } catch (err) {
      const refusal = isPortError(err) ? asCanvasError(err) : err;
      if (refusal instanceof CanvasError)
        this.emit(id, { type: 'rejected', message: refusal.message.slice(0, 500) });
      throw refusal;
    }
  }

  /** `deck.save`: the slide view's edits (reorder, delete, text; the user's own slides). */
  async saveEdits(id: string, edits: DeckSaveArgs): Promise<Deck> {
    await this.host.open(id);
    return this.serial(id, async () => {
      const { deck } = await readDeck(this.host.dirOf(id));
      if (!deck) throw new CanvasError('orb/not-found', 'this canvas has no deck yet', {});
      let next: Deck;
      try {
        next = applyDeckEdits(deck, edits, this.host.now());
      } catch (err) {
        throw isPortError(err) ? asCanvasError(err) : err;
      }
      await writeDeck(this.host.dirOf(id), next);
      return next;
    });
  }

  /** The bytes of a canvas asset (`assets/<name>`), or undefined when it is missing or not a plain asset path. */
  private async readAsset(id: string, rel: string): Promise<Uint8Array | undefined> {
    if (!ASSET.test(rel) || rel.includes('..')) return undefined;
    const dir = resolve(this.host.dirOf(id));
    const file = resolve(dir, rel);
    if (!file.startsWith(dir + sep)) return undefined;
    try {
      return new Uint8Array(await readFile(file));
    } catch {
      return undefined;
    }
  }

  /** The newest design-frame snapshot (`assets/snapshots/<cardId>-v<n>-<ms>.png`) of a card. */
  private async snapshotOf(id: string, cardId: string): Promise<Uint8Array | undefined> {
    const dir = join(this.host.dirOf(id), SNAPSHOT_DIR);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return undefined;
    }
    const best = names
      .filter((n) => n.startsWith(`${cardId}-v`) && /-\d{13}\.png$/.test(n))
      .sort((a, b) => (snapshotCapturedAt(b) ?? 0) - (snapshotCapturedAt(a) ?? 0))[0];
    if (!best) return undefined;
    try {
      return new Uint8Array(await readFile(join(dir, best)));
    } catch {
      return undefined;
    }
  }

  /** `deck.exportPptx`: build the .pptx and store it in `exports/`. */
  async exportPptx(id: string): Promise<DeckExportResult> {
    await this.host.open(id);
    const { deck } = await readDeck(this.host.dirOf(id));
    if (!deck || deck.slides.length === 0)
      throw new CanvasError('orb/not-found', 'this canvas has no slides to export yet', {});
    const state = await this.host.boardState(id);
    // Read what the slides show up front: the builder asks for each asset as it goes.
    const cache = new Map<string, Promise<Uint8Array | undefined>>();
    const once = (key: string, load: () => Promise<Uint8Array | undefined>) => {
      let p = cache.get(key);
      if (!p) cache.set(key, (p = load()));
      return p;
    };
    const built = await buildDeckPptx(deck, {
      appearance: await this.host.appearance?.(),
      cardOf: (cardId) => state.cards[cardId] as Card | undefined,
      readAsset: (path) => once(`a:${path}`, () => this.readAsset(id, path)),
      snapshotOf: (cardId) => once(`s:${cardId}`, () => this.snapshotOf(id, cardId)),
    });
    const ref = await this.host.writeExport(id, {
      kind: 'deck',
      ext: 'pptx',
      data: (async function* () {
        yield built.data;
      })(),
    });
    return {
      path: ref.path,
      file: ref.file,
      size: ref.size,
      slides: built.slides,
      charts: built.charts,
      tables: built.tables,
      images: built.images,
    };
  }
}
