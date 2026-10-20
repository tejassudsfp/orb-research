/**
 * The research document's state on the canvas service (BUILD_PLAN P4.5): `port/` of each canvas, written only here
 * (the canvas service stays the single writer of canvas folders; @orb/port holds the rules and the file format).
 *
 * - **Compose jobs.** `port.compose` (full document) and `port.regenerateSection` (one section) open a job: the
 *   scope, the saved instructions and, for a regenerate, the one section Orb may write. While a job runs,
 *   `compose_section` is checked against the job's scope; a full compose replaces the document with its first
 *   section (the old document stays until Orb writes something). Without a job (Orb writes a section because the
 *   user asked in chat) the saved scope applies, else the whole board.
 * - **Progress.** Every composed or refused section is published to `onEvent` listeners (the `port.compose` stream).
 * - **Edits.** `saveEdits` applies the reading view's text edits (@orb/port `applyEdits`).
 *
 * Writes of one canvas's `port/` are serialized.
 */
import {
  PORT_LIMITS,
  boardFrames,
  portScopeCards,
  reportPlan,
  reportProblems,
  type PortFormat,
  type ReportSectionPlan,
  type Actor,
  type BoardState,
  type Card,
  type ComposeSectionResult,
  type PortDoc,
  type PortInstructions,
  type PortSaveArgs,
  type PrintScope,
} from '@orb/shared';
import {
  applyEdits,
  emptyDoc,
  isPortError,
  readPort,
  renderMarkdown,
  upsertSection,
  validateSection,
  writeInstructions,
  writePortDoc,
  type PortError,
} from '@orb/port';
import { CanvasError } from './errors.js';
import { scopeText } from './context.js';

/** What a port job reports while it runs. */
export type PortEvent =
  | {
      type: 'section';
      sectionId: string;
      heading: string;
      position: number;
      paragraphs: number;
      figures: number;
    }
  | { type: 'rejected'; message: string };

export type PortJob = {
  kind: 'compose' | 'section';
  scope: PrintScope;
  instructions: string;
  /** `section` jobs: the one section Orb may write. */
  sectionId?: string;
  startedAt: number;
  /** Sections written by this job, in order. */
  composed: string[];
  /** A full compose starts a new document with its first section. */
  replaced: boolean;
  format?: PortFormat;
  plan?: ReportSectionPlan[];
  inspections?: Map<string, { signature: string; pages: Set<number>; total: number }>;
};

const evidenceSignature = (card: Card) => JSON.stringify([card.data, card.detail, card.note, card.view]);

/** What the store needs from the canvas service. */
export type PortHost = {
  dirOf(id: string): string;
  open(id: string): Promise<{ title: string }>;
  boardState(id: string): Promise<BoardState>;
  now(): number;
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

export class PortStore {
  private readonly jobs = new Map<string, PortJob>();
  private readonly writes = new Map<string, Promise<unknown>>();
  private readonly listeners = new Map<string, Set<(event: PortEvent) => void>>();

  constructor(private readonly host: PortHost) {}

  /** The stored document and instructions of a canvas. */
  async get(id: string): Promise<{ doc: PortDoc | null; instructions: PortInstructions | null }> {
    await this.host.open(id);
    return readPort(this.host.dirOf(id));
  }

  job(id: string): PortJob | undefined {
    return this.jobs.get(id);
  }

  onEvent(id: string, listener: (event: PortEvent) => void): () => void {
    let set = this.listeners.get(id);
    if (!set) this.listeners.set(id, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(id);
    };
  }

  private emit(id: string, event: PortEvent): void {
    for (const listener of this.listeners.get(id) ?? []) listener(event);
  }

  /** Serialize the `port/` writes of one canvas. */
  private serial<T>(id: string, task: () => Promise<T>): Promise<T> {
    const prev = this.writes.get(id) ?? Promise.resolve();
    const next = prev.then(task, task);
    const tail = next.catch(() => undefined);
    this.writes.set(id, tail);
    void tail.then(() => this.writes.get(id) === tail && this.writes.delete(id));
    return next;
  }

  /**
   * Open a job. A full compose saves the instructions and scope (`port/instructions.json`, reused on regenerate); a
   * section job takes them from what is saved and needs the section to exist. Answers the cards text Orb gets.
   */
  async begin(
    id: string,
    request:
      | { kind: 'compose'; scope: PrintScope; instructions: string; format?: PortFormat }
      | { kind: 'section'; sectionId: string },
  ): Promise<{ job: PortJob; cards: number; frames: number; context: string; doc: PortDoc | null }> {
    if (this.jobs.has(id))
      throw new CanvasError('orb/busy', 'orb is already writing this research document', { canvasId: id });
    const { doc } = await this.get(id);
    const state = await this.host.boardState(id);
    let job: PortJob;
    if (request.kind === 'compose') {
      job = {
        kind: 'compose',
        scope: request.scope,
        instructions: request.instructions.trim(),
        startedAt: this.host.now(),
        composed: [],
        replaced: false,
        ...(request.format ? { format: request.format } : {}),
      };
    } else {
      if (!doc || !doc.sections.some((s) => s.id === request.sectionId))
        throw new CanvasError('orb/not-found', `no section ${request.sectionId} in this research document`, {
          sectionId: request.sectionId,
        });
      job = {
        kind: 'section',
        sectionId: request.sectionId,
        scope: doc.scope,
        instructions: doc.instructions,
        startedAt: this.host.now(),
        composed: [],
        replaced: true,
        ...(doc.format ? { format: doc.format } : {}),
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
      throw new CanvasError('orb/invalid-args', 'there are no cards in this scope to write about', {});
    if (job.format === 'report') {
      job.plan = reportPlan(state, job.scope);
      job.inspections = new Map();
    }
    if (request.kind === 'compose')
      await this.serial(id, () =>
        writeInstructions(this.host.dirOf(id), {
          instructions: job.instructions,
          scope: job.scope,
          savedAt: job.startedAt,
          ...(job.format ? { format: job.format } : {}),
        }),
      );
    this.jobs.set(id, job);
    const frames =
      job.scope === 'all' ? boardFrames(state).length : job.scope.filter((f) => state.frames[f]).length;
    return { job, cards: cards.length, frames, context: scopeText(state, job.scope), doc };
  }

  /** Close a job (whatever happened to the turn). */
  end(id: string, job: PortJob): void {
    if (this.jobs.get(id) === job) this.jobs.delete(id);
  }

  /** Evidence receipts are local to a report job and invalidated when the supporting card changes. */
  inspected(id: string, card: Card, page: number, total: number): void {
    const receipts = this.jobs.get(id)?.inspections;
    if (!receipts) return;
    const signature = evidenceSignature(card);
    let receipt = receipts.get(card.id);
    if (!receipt || receipt.signature !== signature || receipt.total !== total) {
      receipt = { signature, pages: new Set(), total };
      receipts.set(card.id, receipt);
    }
    receipt.pages.add(page);
  }

  resetInspections(id: string): void {
    this.jobs.get(id)?.inspections?.clear();
  }

  /** `compose_section` (Orb): check the citations against the scope, then write the section into `port/`. */
  async composeSection(
    id: string,
    raw: unknown,
    actor: Extract<Actor, { kind: 'agent' }>,
  ): Promise<ComposeSectionResult> {
    const meta = await this.host.open(id);
    const state = await this.host.boardState(id);
    const job = this.jobs.get(id);
    try {
      const stored = job ? undefined : await readPort(this.host.dirOf(id));
      const scope: PrintScope = job?.scope ?? stored?.instructions?.scope ?? 'all';
      const inScope = new Set(portScopeCards(state, scope).map((c) => c.id));
      const section = validateSection(
        raw,
        (cardId) => inScope.has(cardId),
        (cardId) => cardId in state.cards,
      );
      if (job?.inspections) {
        const unread = [
          ...new Set([
            ...section.paragraphs.flatMap((p) => p.cardIds),
            ...section.figures.map((f) => f.cardId),
          ]),
        ].filter((cardId) => {
          const receipt = job.inspections!.get(cardId);
          return (
            !receipt ||
            receipt.signature !== evidenceSignature(state.cards[cardId]!) ||
            receipt.pages.size < receipt.total
          );
        });
        if (unread.length)
          throw new CanvasError(
            'orb/invalid-args',
            `Inspect the full supporting cards with read_card before writing this report section; read every returned page. Next: ${unread.slice(0, 4).join(', ')}${unread.length > 4 ? ` (${unread.length - 4} more supporting cards also unread)` : ''}. Nothing was written.`,
            { reason: 'unread-evidence' },
          );
      }
      if (job?.kind === 'section' && section.sectionId !== job.sectionId)
        throw new CanvasError(
          'orb/invalid-args',
          `this turn regenerates section "${job.sectionId}" only: call compose_section with sectionId "${job.sectionId}"`,
        );
      const model = actor.provider ? `${actor.provider}/${actor.model}` : actor.model;
      const result = await this.serial(id, async () => {
        const current = (await readPort(this.host.dirOf(id))).doc;
        const instructions = job?.instructions ?? stored?.instructions?.instructions ?? '';
        const fresh = job && !job.replaced;
        const format = job
          ? job.format
          : (current?.format ?? stored?.instructions?.format ?? section.format ?? 'report');
        let base =
          fresh || !current
            ? emptyDoc(
                {
                  title: meta.title.slice(0, 200),
                  scope,
                  instructions,
                  ...(format ? { format } : {}),
                },
                this.host.now(),
              )
            : current;
        if (fresh && current) base = { ...base, version: current.version };
        if (
          !base.sections.some((s) => s.id === section.sectionId) &&
          base.sections.length >= PORT_LIMITS.sections
        )
          throw new CanvasError(
            'orb/invalid-args',
            `a document holds at most ${PORT_LIMITS.sections} sections`,
          );
        const { doc, position } = upsertSection(base, section, { now: this.host.now(), model });
        const ordering = job?.plan ?? (doc.format === 'report' ? reportPlan(state, scope) : []);
        const order = new Map(ordering.map((s, i) => [s.id, i]));
        const sections = order.size
          ? [...doc.sections].sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9))
          : doc.sections;
        const final: PortDoc = { ...doc, sections, title: meta.title.slice(0, 200) };
        await writePortDoc(
          this.host.dirOf(id),
          final,
          renderMarkdown(
            final,
            (c) => state.cards[c] as Card,
            final.format === 'report'
              ? reportProblems(final, reportPlan(state, final.scope), state)
              : undefined,
          ),
        );
        if (job) {
          job.replaced = true;
          job.composed.push(section.sectionId);
        }
        return { doc: final, position };
      });
      const written = result.doc.sections.find((s) => s.id === section.sectionId)!;
      result.position = result.doc.sections.indexOf(written) + 1;
      const citations = new Set(written.paragraphs.flatMap((p) => p.cardIds)).size;
      this.emit(id, {
        type: 'section',
        sectionId: section.sectionId,
        heading: section.heading,
        position: result.position,
        paragraphs: section.paragraphs.length,
        figures: section.figures.length,
      });
      return {
        sectionId: section.sectionId,
        position: result.position,
        paragraphs: section.paragraphs.length,
        figures: section.figures.length,
        citations,
      };
    } catch (err) {
      const refusal = isPortError(err) ? asCanvasError(err) : err;
      if (refusal instanceof CanvasError)
        this.emit(id, { type: 'rejected', message: refusal.message.slice(0, 500) });
      throw refusal;
    }
  }

  /** `port.saveDoc`: the reading view's text edits. */
  async saveEdits(id: string, edits: PortSaveArgs): Promise<PortDoc> {
    await this.host.open(id);
    const state = await this.host.boardState(id);
    return this.serial(id, async () => {
      const { doc } = await readPort(this.host.dirOf(id));
      if (!doc) throw new CanvasError('orb/not-found', 'this canvas has no research document yet', {});
      let next: PortDoc;
      try {
        next = applyEdits(doc, edits, this.host.now());
      } catch (err) {
        throw isPortError(err) ? asCanvasError(err) : err;
      }
      await writePortDoc(
        this.host.dirOf(id),
        next,
        renderMarkdown(
          next,
          (c) => state.cards[c] as Card,
          next.format === 'report' ? reportProblems(next, reportPlan(state, next.scope), state) : undefined,
        ),
      );
      return next;
    });
  }
}
