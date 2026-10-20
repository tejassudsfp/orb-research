/** P6.21: the stop boundary checks the board, not the model's claim that its pass is done. No harness dependencies. */
import {
  boardFrames,
  cardTitle,
  chartPlot,
  ChartData,
  fillDeep,
  specOf,
  type AgentName,
  type BoardState,
  type CanvasMeta,
  type Card,
  type ResearchCoverage,
} from '@orb/shared';

const EMPTY =
  /^(?:[—–\-?\s]*|unknown|not (?:yet |publicly )?(?:established|disclosed|verified|researched|available)|tbd|pending)$/i;
const contentTypes = new Set([
  'doc',
  'metric',
  'timeline',
  'framework',
  'matrix',
  'hypothesis',
  'decision',
  'risk',
  'diagram',
  'table',
  'insight',
  'entity',
  'person',
  'product',
  'competitor',
]);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const seedFields = (type: string, data: Record<string, unknown>): string[] => {
  const payload =
    type === 'diagram'
      ? 'mermaid'
      : type === 'table'
        ? 'rows'
        : type === 'framework'
          ? 'cells'
          : type === 'matrix'
            ? 'options'
            : undefined;
  return payload && payload in data ? [payload] : Object.keys(data).filter((k) => k !== 'title');
};

export type ResearchOutput = 'doc' | 'deck';
/** Explicit deliverables in the user's request, never the template playbook's list of available formats. */
export function requestedResearchOutputs(text: string): ResearchOutput[] {
  const outputs = new Set<ResearchOutput>();
  const action =
    /\b(?:compose|create|prepare|make|build|write|generate|produce|deliver|give|export|refresh|update)\b[^.!?;\n]{0,100}?\b(deck|slides|presentation|pptx|report|memo|research document)\b/gi;
  for (const match of text.matchAll(action)) {
    const before = text.slice(Math.max(0, match.index! - 24), match.index);
    if (
      /\b(?:do not|don't|never|without)(?:\s+(?:automatically|ever|yet|now|also|please))*\s*$/i.test(before)
    )
      continue;
    outputs.add(/deck|slides|presentation|pptx/i.test(match[1]!) ? 'deck' : 'doc');
    const joined =
      /^\s*(?:and|&|plus)\s+(?:(?:a|an|the|travel|slide|research)\s+)*(deck|slides|presentation|pptx|report|memo|document)\b/i.exec(
        text.slice(match.index! + match[0].length),
      );
    if (joined) outputs.add(/deck|slides|presentation|pptx/i.test(joined[1]!) ? 'deck' : 'doc');
  }
  return [...outputs];
}

/** Ignore geometry, reporting and timestamps: moving a card or repeating a status is not research progress. */
export function researchFingerprint(state: BoardState): string {
  return JSON.stringify(
    Object.values(state.cards).map((c) => [c.id, c.data, c.detail, c.why, c.stackedInto]),
  );
}

function missingContent(card: Card, baseline: Record<string, unknown> | undefined): string | undefined {
  const d = card.data as Record<string, any>;
  const title = `${cardTitle(card)} [${card.id}]`;
  if (
    card.type === 'database' &&
    (!d.rowCount ||
      (Array.isArray(d.preview) &&
        d.preview.every((row: unknown) =>
          /placeholder|no researched|not researched/i.test(JSON.stringify(row)),
        )))
  )
    return `Empty database ${title}; dataset ${d.datasetId}. Research real candidates and upsert_rows into this existing dataset.`;
  const explainedUnavailable =
    /^(?:unknown|not (?:publicly )?(?:disclosed|established|available))$/i.test(
      String(d.value ?? '').trim(),
    ) && (card.detail?.trim().length ?? 0) >= 500;
  if (card.type === 'metric' && EMPTY.test(String(d.value ?? '')) && !explainedUnavailable)
    return `Unresolved metric ${title}. Source it, calculate a labelled estimate, or explain the specific unavailable input.`;
  if (card.type === 'chart') {
    const parsed = ChartData.safeParse(d);
    if (!parsed.success || chartPlot(parsed.data).points.length === 0)
      return `Empty chart ${title}; fill its source data first.`;
  }
  if (card.seed && baseline && contentTypes.has(card.type)) {
    const fields = seedFields(card.type, baseline);
    if (fields.length && fields.every((k) => same(d[k], baseline[k])))
      return `Untouched ${card.type} seed ${title}. Replace its template content with a grounded assessment (update_card); adding sources beside it does not fill it.`;
  }
  return undefined;
}

/** All frames count, even a frame that was never delegated. Question/risk-only scaffolding is not a researched frame. */
export function reviewResearch(
  state: BoardState,
  meta: Pick<CanvasMeta, 'template' | 'intake' | 'created'>,
  options: { detailed?: boolean } = {},
): ResearchCoverage {
  const spec = specOf(meta.template);
  const answers = {
    ...meta.intake,
    year: new Date(meta.created).toISOString().slice(0, 4),
    date: new Date(meta.created).toISOString().slice(0, 10),
  };
  const frames = boardFrames(state);
  // Titles and frame names are editable. Match untouched seed payloads across the template, so renaming cannot
  // turn an empty scorecard into a completed assessment. Genuine edits differ in at least one non-title field.
  const seeds = spec?.frames.flatMap((f) => f.seeds.map((s) => fillDeep(s, answers)));
  const baselineOf = (c: Card) =>
    seeds?.find(
      (s) =>
        s.type === c.type &&
        seedFields(c.type, s.data).every((k) => same((c.data as any)[k], (s.data as any)[k])),
    )?.data;
  const gaps: ResearchCoverage['gaps'] = [];
  for (const frame of frames) {
    const cards = Object.values(state.cards).filter((c) => c.frameId === frame.id && !c.stackedInto);
    const reasons: string[] = [];
    for (const c of cards) {
      const baseline = baselineOf(c);
      const reason = missingContent(c, baseline);
      if (reason) reasons.push(reason);
    }
    const substantive = cards.some(
      (c) =>
        !['research', 'watch', 'risk', 'checklist'].includes(c.type) &&
        (c.type !== 'question' ||
          ((c.data as any).state === 'answered' && String((c.data as any).answer ?? '').trim().length > 0)) &&
        !missingContent(c, baselineOf(c)),
    );
    if (!substantive)
      reasons.unshift(
        'No substantive findings yet: questions, risks and template scaffolding alone do not answer this frame.',
      );
    if (
      options.detailed &&
      !cards.some(
        (c) =>
          !c.stackedInto &&
          !['source', 'quote', 'image', 'file', 'video', 'research', 'watch', 'note'].includes(c.type) &&
          ((c.detail?.trim().length ?? 0) >= 500 ||
            (c.type === 'doc' && String((c.data as any).body ?? '').trim().length >= 800)),
      )
    )
      reasons.push(
        'Missing detailed synthesis: update an existing assessment or document in this frame with useful multi-paragraph detail explaining the evidence, implications, recommendation, alternatives and remaining uncertainty. Short captions or source excerpts alone do not finish a detailed research request.',
      );
    if (reasons.length) gaps.push({ frameId: frame.id, title: frame.title, reasons });
  }
  // A user may deliberately delete or rename frames; never undo their scope choice.
  const totalFrames = frames.length;
  return {
    state: gaps.length ? 'incomplete' : 'complete',
    totalFrames,
    coveredFrames: totalFrames - gaps.length,
    gaps,
  };
}

export type ResearchRun = {
  active: boolean;
  allowTeam: boolean;
  /** The most recent real user request, including thread context, so a repair never loses its objective. */
  request: string;
  detailed: boolean;
  preserveFrames?: number;
  linkCalls: number;
  readsSinceWrite: number;
  whole?: boolean;
  finalChecked: boolean;
  scope?: string[];
  /** For a focused edit, resolve touched card/dataset/frame ids at the stop boundary. */
  targets?: Set<string>;
  passes: Map<string, { fingerprint: string; stale: number; count: number }>;
  assignments: Map<string, string[]>;
  evidenceVersion: number;
  reviewed: Map<AgentName, number>;
  outputs: ResearchOutput[];
  composed: Map<ResearchOutput, { fingerprint: string; frames: string[] }>;
};

export function researchRun(request: string, scope?: string[]): ResearchRun {
  return {
    active: true,
    allowTeam:
      !/\bno (?:agents|team)\b|\b(?:do not|don't) (?:delegate|start|use)\b.{0,25}\b(?:agents|team)\b/i.test(
        request,
      ),
    request,
    detailed: /\bdetailed\b|\bin.depth\b/i.test(request),
    linkCalls: 0,
    readsSinceWrite: 0,
    finalChecked: false,
    ...(scope?.length ? { scope } : {}),
    passes: new Map(),
    assignments: new Map(),
    evidenceVersion: 0,
    reviewed: new Map(),
    outputs: [],
    composed: new Map(),
  };
}

/** Bounded repair: genuine progress buys another pass; repeated no-ops and errors never create an endless paid loop. */
export function repairAllowed(run: ResearchRun, role: string, fingerprint: string): boolean {
  const last = run.passes.get(role);
  const next = {
    fingerprint,
    stale: last?.fingerprint === fingerprint ? last.stale + 1 : 0,
    count: (last?.count ?? 0) + 1,
  };
  run.passes.set(role, next);
  return next.stale < 2 && next.count <= (role === 'orb' ? 10 : 5);
}

export function completionMessage(
  role: AgentName,
  report: ResearchCoverage,
  reasons: string[],
  request: string,
): string {
  const gaps = report.gaps
    .map((f) => `- ${f.title} [${f.frameId}]: ${f.reasons.join(' ')}`)
    .join('\n')
    .slice(0, 11_000);
  return [
    '<research-review>',
    `The current request is still in progress: ${request.slice(0, 1800)}`,
    `${report.coveredFrames}/${report.totalFrames} frames have filled content. A final reply is not completion.`,
    ...reasons,
    gaps,
    role === 'orb'
      ? 'Work through the gaps, delegating specific unfinished frames to Scout. After Scout adds evidence, re-delegate Critic and Builder to review and synthesize the current board, then update the seed metrics, matrices, hypotheses, decisions and prose yourself. Read fresh dataset schemas before writing; fix validation errors and retry. Do not leave half the planned frames unused.'
      : 'Finish the work assigned to your frames. Use the ordinary search/fetch tools when Parallel has no key; the missing optional key does not disable web_search or fetch_url. Query the existing dataset schema and allowed select values, then add sourced rows to that dataset. Fix invalid writes and retry.',
    'Future prices/hours or missing personal/private data block only those fields. Keep researching other frames; provide sourced options and clearly dated indicative estimates, explicit assumptions, alternatives and recommendations. Never fabricate data, copy placeholder rows, or turn an unknown into a verified fact. Consolidate your own cards when a frame is full; use datasets instead of more source cards.',
    'Use detail on the initial write. Batch independent update_card calls in the same response and update body plus detail together; avoid a separate read/write pass for every field. Scout has ordinary web_search/fetch_url even though the root catalog does not. Wait for its source evidence before declaring a verification blocker. Reuse existing frames; rename/reorganize them before adding more.',
    'If a gap really cannot be resolved, explain the particular attempted sources/tool failures and exactly what input is missing; do not claim the board is complete. Do not stop just because the first pass is done.',
    'Respect the original scope and constraints, including any instruction not to use agents or research outside the requested frames.',
    '</research-review>',
  ].join('\n');
}
