/**
 * The card-type manifest (P6.2 card platform): the shared, harness-free facts about every card type, in one place.
 *
 * Adding a card type (see docs/CARDS.md for the whole checklist):
 *   1. its name in `CardType` (board.ts) and its `Card.data` schema (cards.ts or its own module);
 *   2. its entry here: kind label, schema, the agent roles that may place it (BUILD_PLAN §2.4), figure kind;
 *   3. the host half in packages/orb-cards/src/types/<type>.ts (agent fields, toData, describe);
 *   4. the UI half in apps/ui/src/cards/types/<type>.tsx (board renderer at full / compact / title LOD, reader,
 *      print half, pptx hook);
 *   5. a card of the type in the export fixture (scripts/testkit/printFixture.ts `PRINT_MARKERS`).
 * Each of these is a `Record<CardType, …>`, so a type missing anywhere is a type error.
 */
import type { z } from 'zod';
import type { AgentName, CardType } from './board.js';
import {
  DesignData,
  DiagramData,
  DocData,
  FileData,
  ImageData,
  NoteData,
  QuestionData,
  QuoteData,
  RiskData,
  SourceData,
  TableData,
  readCardData,
  stackOf,
} from './cards.js';
import { DatabaseData } from './dataset.js';
import { ChartData, MatrixData, MetricData, TimelineData } from './dataCards.js';
import {
  DecisionData,
  FrameworkData,
  HypothesisData,
  InsightData,
  decisionTotals,
} from './synthesis.js';
import {
  ChecklistData,
  CodeData,
  EntityData,
  MathData,
  ProductData,
  VideoData,
  checklistProgress,
} from './mediaCards.js';
import { ResearchData, WatchData } from './parallel.js';

export type CardTypeManifest = {
  /** The plain kind name ("design frame"): the card's mono label, Home search hits, agents' field guide. */
  label: string;
  /** The `Card.data` schema (planCommand refuses data that does not match it). */
  schema: z.ZodType;
  /** Agent roles that may place (and Orb update) the type (BUILD_PLAN §2.4). Empty: only the user creates it. */
  roles: readonly AgentName[];
  /** How a research document numbers it: "Table n" or "Figure n". */
  figure: 'figure' | 'table';
  /**
   * The kind label with detail from the data ("pdf · 12 pages", "table · 40 rows", "claim"); undefined: `label`.
   * Plain text, no React (the UI's labels and the print half both use it).
   */
  kind?: (data: unknown) => string | undefined;
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

const ALL_AGENTS = ['orb'] as const;

/** Every card type's manifest entry. Order = `CardType` order (the agents' field guide follows it). */
export const CARD_TYPES: { readonly [T in CardType]: CardTypeManifest } = {
  note: { label: 'note', schema: NoteData, roles: [], figure: 'figure' },
  source: { label: 'source', schema: SourceData, roles: ['scout', ...ALL_AGENTS], figure: 'figure' },
  quote: { label: 'quote', schema: QuoteData, roles: ['scout', ...ALL_AGENTS], figure: 'figure' },
  image: { label: 'image', schema: ImageData, roles: ['scout', ...ALL_AGENTS], figure: 'figure' },
  file: {
    label: 'file',
    schema: FileData,
    roles: [...ALL_AGENTS],
    figure: 'figure',
    kind: (data) => {
      const d = readCardData(FileData, data);
      if (!d) return undefined;
      const kind = d.asset.mime === 'application/pdf' ? 'pdf' : 'file';
      return d.pages !== null ? `${kind} · ${plural(d.pages, 'page')}` : kind;
    },
  },
  question: { label: 'question', schema: QuestionData, roles: ['critic', ...ALL_AGENTS], figure: 'figure' },
  risk: {
    label: 'risk',
    schema: RiskData,
    roles: ['critic', ...ALL_AGENTS],
    figure: 'figure',
    kind: (data) => (readCardData(RiskData, data)?.kind === 'claim' ? 'claim' : undefined),
  },
  design: { label: 'design frame', schema: DesignData, roles: ['builder', ...ALL_AGENTS], figure: 'figure' },
  diagram: { label: 'diagram', schema: DiagramData, roles: ['builder', ...ALL_AGENTS], figure: 'figure' },
  table: {
    label: 'table',
    schema: TableData,
    roles: ['builder', ...ALL_AGENTS],
    figure: 'table',
    kind: (data) => {
      const d = readCardData(TableData, data);
      return d ? `table · ${plural(d.totalRows, 'row')}` : undefined;
    },
  },
  doc: {
    label: 'doc',
    schema: DocData,
    roles: [...ALL_AGENTS],
    figure: 'figure',
    kind: (data) => {
      const stack = stackOf({ type: 'doc', data });
      return stack ? `stack · ${plural(stack.count, 'card')}` : undefined;
    },
  },
  database: {
    label: 'database',
    schema: DatabaseData,
    roles: ['scout', 'builder', ...ALL_AGENTS],
    figure: 'table',
    kind: (data) => {
      const d = readCardData(DatabaseData, data);
      return d ? `database · ${plural(d.rowCount, 'row')}` : undefined;
    },
  },
  chart: {
    label: 'chart',
    schema: ChartData,
    roles: ['builder', 'scout', ...ALL_AGENTS],
    figure: 'figure',
    kind: (data) => {
      const d = readCardData(ChartData, data);
      return d ? `${d.mark} chart` : undefined;
    },
  },
  metric: { label: 'metric', schema: MetricData, roles: ['scout', 'builder', ...ALL_AGENTS], figure: 'figure' },
  timeline: {
    label: 'timeline',
    schema: TimelineData,
    roles: ['scout', 'builder', ...ALL_AGENTS],
    figure: 'figure',
    kind: (data) => {
      const d = readCardData(TimelineData, data);
      return d ? `timeline · ${plural(d.events.length, 'event')}` : undefined;
    },
  },
  matrix: {
    label: 'comparison matrix',
    schema: MatrixData,
    roles: ['critic', 'builder', ...ALL_AGENTS],
    figure: 'table',
    kind: (data) => {
      const d = readCardData(MatrixData, data);
      return d ? `matrix · ${plural(d.options.length, 'option')}` : undefined;
    },
  },
  insight: {
    label: 'insight',
    schema: InsightData,
    roles: ['critic', 'builder', ...ALL_AGENTS],
    figure: 'figure',
    kind: (data) => {
      const d = readCardData(InsightData, data);
      return d ? `insight · ${plural(d.citations.length, 'citation')}` : undefined;
    },
  },
  hypothesis: {
    label: 'hypothesis',
    schema: HypothesisData,
    roles: ['critic', 'builder', ...ALL_AGENTS],
    figure: 'figure',
    kind: (data) => {
      const d = readCardData(HypothesisData, data);
      return d ? `hypothesis · ${d.confidence}%` : undefined;
    },
  },
  decision: {
    label: 'decision',
    schema: DecisionData,
    roles: ['builder', ...ALL_AGENTS],
    figure: 'figure',
    kind: (data) => {
      const d = readCardData(DecisionData, data);
      return d ? `decision · ${d.status ?? 'open'}${decisionTotals(d) ? ' · rubric' : ''}` : undefined;
    },
  },
  framework: {
    label: 'framework',
    schema: FrameworkData,
    roles: ['critic', 'builder', ...ALL_AGENTS],
    figure: 'figure',
    kind: (data) => {
      const d = readCardData(FrameworkData, data);
      if (!d) return undefined;
      return d.variant === 'proscons' ? 'pros and cons' : d.variant === 'swot' ? 'swot' : '2×2';
    },
  },
  entity: {
    label: 'person or org',
    schema: EntityData,
    roles: ['scout', ...ALL_AGENTS],
    figure: 'figure',
    kind: (data) => (readCardData(EntityData, data)?.kind === 'org' ? 'org' : 'person'),
  },
  product: {
    label: 'product',
    schema: ProductData,
    roles: ['scout', ...ALL_AGENTS],
    figure: 'figure',
    kind: (data) => (readCardData(ProductData, data)?.kind === 'competitor' ? 'competitor' : 'product'),
  },
  video: { label: 'video or post', schema: VideoData, roles: ['scout', ...ALL_AGENTS], figure: 'figure' },
  code: {
    label: 'code',
    schema: CodeData,
    roles: ['builder', ...ALL_AGENTS],
    figure: 'figure',
    kind: (data) => {
      const lang = readCardData(CodeData, data)?.language?.trim();
      return lang ? `code · ${lang}` : undefined;
    },
  },
  math: { label: 'math', schema: MathData, roles: ['builder', 'critic', ...ALL_AGENTS], figure: 'figure' },
  checklist: {
    label: 'checklist',
    schema: ChecklistData,
    roles: ['scout', 'critic', 'builder', ...ALL_AGENTS],
    figure: 'figure',
    kind: (data) => {
      const { done, total } = checklistProgress(data);
      return total ? `checklist · ${done}/${total}` : undefined;
    },
  },
  // P6.7: written by the orb-canvas Parallel service on an agent's behalf (no agent fields), never by the user.
  research: {
    label: 'research run',
    schema: ResearchData,
    roles: [],
    figure: 'figure',
    kind: (data) => {
      const d = readCardData(ResearchData, data);
      return d ? `research · ${d.status.replace('_', ' ')}` : undefined;
    },
  },
  watch: {
    label: 'watch',
    schema: WatchData,
    roles: [],
    figure: 'figure',
    kind: (data) => {
      const d = readCardData(WatchData, data);
      return d ? `watch · ${d.status.replace('_', ' ')}` : undefined;
    },
  },
};

/** The `Card.data` schema of a card type. */
export const cardDataSchema = (type: CardType): z.ZodType => CARD_TYPES[type].schema;

/** The plain kind name of a card type ("note", "design frame"…); unknown types read as themselves. */
export const cardTypeLabel = (type: string): string =>
  (CARD_TYPES as Record<string, CardTypeManifest | undefined>)[type]?.label ?? type;

/** The kind label of a card with its data's detail ("pdf · 12 pages"), else the type's label. */
export const cardKindLabel = (card: { type: CardType; data: unknown }): string =>
  CARD_TYPES[card.type].kind?.(card.data) ?? CARD_TYPES[card.type].label;

/** The card types `role` may place, in `CardType` order. */
export const placeableTypesOf = (role: AgentName): CardType[] =>
  (Object.keys(CARD_TYPES) as CardType[]).filter((t) => CARD_TYPES[t].roles.includes(role));
