/**
 * P6.11: put a v2 template on a new canvas: its frames, its databases (datasets with schemas and views, written by the
 * dataset service) and its seed cards. Everything is appended as ONE batch of user-authored events (the user picked the
 * template), outside the undo stack, like the v1 frames. A seed card is marked `seed` so agents' layout may still move
 * it and it does not lock its frame (`isPinned`).
 */
import {
  TemplateSpecV2,
  cardDataSchema,
  chartPoints,
  columnTypeOf,
  databaseDataOf,
  defaultView,
  fillDeep,
  newCardView,
  plotTableOfDataset,
  type BoardChange,
  type Card,
  type CardType,
  type CardView,
  type Dataset,
  type DatasetView,
  type DatabaseSpec,
  type DatabaseViewSpec,
  type Frame,
  type IntakeAnswers,
} from '@orb/shared';
import { CanvasError } from './errors.js';
import type { DatasetService } from './datasets.js';
import { planTemplate } from './templatePlan.js';

export type TemplateSeedDeps = {
  datasets: DatasetService;
  /** The canvas's open board: `appendAll` writes the events. */
  board: {
    appendAll(changes: readonly BoardChange[], actor: { kind: 'user' }): unknown;
    flush(): Promise<unknown>;
  };
  /** A time-ordered id body (store `ulid`). */
  ulid: (now: number) => string;
};

/** The dataset views of a database spec: the first is the default; columns are named (the engine resolves names). */
export function viewsOf(spec: DatabaseSpec): DatasetView[] {
  return spec.views.map((v: DatabaseViewSpec, i) => ({
    ...defaultView(`v${i + 1}`, v.kind, v.name),
    filter: v.filter ?? [],
    sort: v.sort ?? [],
    group: v.group ?? null,
    cover: v.cover ?? null,
    hidden: v.hidden ?? [],
  }));
}

/** The answers the seeds are filled from: the intake plus the date tokens. */
export function seedAnswers(answers: IntakeAnswers, created: number): IntakeAnswers {
  const d = new Date(created).toISOString();
  return { ...answers, year: d.slice(0, 4), date: d.slice(0, 10) };
}

/** Drop empty-string properties (a `{{field}}` the user left blank): an empty url or location is no url or location. */
function pruneEmpty<T>(value: T): T {
  if (Array.isArray(value)) return value.map(pruneEmpty) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => !(typeof v === 'string' && v.trim() === ''))
        .map(([k, v]) => [k, pruneEmpty(v)]),
    ) as T;
  return value;
}

/** A checklist item holds at most 300 characters: an intake answer filled into one is cut to fit (P6.12). */
function clampChecklist<T extends { type: string; data: Record<string, unknown> }>(seed: T): T {
  const items = seed.data.items;
  if (seed.type !== 'checklist' || !Array.isArray(items)) return seed;
  const clamped = items.map((it: { text?: unknown }) =>
    typeof it.text === 'string' && it.text.length > 300 ? { ...it, text: `${it.text.slice(0, 297).trimEnd()}...` } : it,
  );
  return { ...seed, data: { ...seed.data, items: clamped } };
}

export async function seedTemplate(
  deps: TemplateSeedDeps,
  canvasId: string,
  spec: TemplateSpecV2,
  answers: IntakeAnswers,
  created: number,
): Promise<{ frames: number; cards: number; datasets: number }> {
  const fill = seedAnswers(answers, created);
  const filled = spec.frames.map((f) => f.seeds.map((s) => clampChecklist(pruneEmpty(fillDeep(s, fill)))));
  const plan = planTemplate(spec, filled);
  const provenance = { kind: 'user' as const, at: created };

  // Databases first: a database or chart seed names its dataset.
  const datasets = new Map<string, Dataset>();
  for (const d of spec.databases) {
    datasets.set(
      d.key,
      await deps.datasets.createFromSchema(
        canvasId,
        d.name,
        d.columns.map((c) => ({ name: c.name, type: columnTypeOf(c.type), options: c.options })),
        d.rows ?? [],
        { kind: 'user' },
      ),
    );
  }

  const frameIds = plan.frames.map((_, i) => `f_${deps.ulid(created)}${i}`);
  const changes: BoardChange[] = plan.frames.map((f, i) => ({
    type: 'frame.added' as const,
    data: {
      frame: {
        id: frameIds[i]!,
        title: f.title,
        color: f.color,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        provenance,
      } as Frame,
    },
  }));

  let n = 0;
  for (const p of plan.seeds) {
    const { seed } = p;
    let data: unknown = seed.data;
    let view: CardView | undefined;
    const dsSpec = seed.db ? spec.databases.find((d) => d.key === seed.db) : undefined;
    const ds = seed.db ? datasets.get(seed.db) : undefined;
    if (seed.type === 'database') {
      if (!ds || !dsSpec)
        throw new CanvasError(
          'orb/invalid-args',
          `template ${spec.id}: seed names no database ${JSON.stringify(seed.db)}`,
        );
      const title = typeof seed.data.title === 'string' ? seed.data.title : dsSpec.name;
      data = databaseDataOf(title, ds);
      view = { ...newCardView(ds), views: viewsOf(dsSpec), active: 'v1' };
    } else if (seed.type === 'chart') {
      if (!ds)
        throw new CanvasError(
          'orb/invalid-args',
          `template ${spec.id}: chart seed names no database ${JSON.stringify(seed.db)}`,
        );
      const c = seed.data as {
        mark: 'bar' | 'line' | 'area' | 'scatter' | 'pie';
        x: string;
        y?: string;
        color?: string;
        agg?: never;
      };
      const plotted = chartPoints(c, plotTableOfDataset(ds));
      data = {
        ...seed.data,
        source: { kind: 'dataset', datasetId: ds.id },
        points: plotted.points,
        xType: plotted.xType,
        rev: ds.rev,
        ...(plotted.problem ? { problem: plotted.problem } : {}),
        ...(plotted.note ? { note: plotted.note } : {}),
      };
    }
    const parsed = cardDataSchema(seed.type as CardType).safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new CanvasError(
        'orb/invalid-args',
        `template ${spec.id}: a ${seed.type} seed in "${plan.frames[p.frameIndex]!.title}" is invalid (${issue?.path.join('.') || 'data'} ${issue?.message ?? ''})`,
      );
    }
    const card: Card = {
      id: `c_${deps.ulid(created)}${p.frameIndex}x${n++}`,
      type: seed.type,
      frameId: frameIds[p.frameIndex]!,
      x: p.rect.x,
      y: p.rect.y,
      w: p.rect.w,
      h: p.rect.h,
      data: parsed.data,
      ...(seed.why ? { why: seed.why.slice(0, 140) } : {}),
      ...(view ? { view } : {}),
      seed: true,
      provenance,
    };
    changes.push({ type: 'card.added', data: { card } });
  }
  deps.board.appendAll(changes, { kind: 'user' });
  await deps.board.flush();
  return { frames: plan.frames.length, cards: plan.seeds.length, datasets: datasets.size };
}
