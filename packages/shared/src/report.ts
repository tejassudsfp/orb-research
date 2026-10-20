/** A professional report's writing plan and structural checks; these do not certify factual accuracy. */
import { boardFrames, type BoardState } from './fold.js';
import { PORT_LIMITS, portScopeCards, type PortDoc } from './port.js';
import type { PrintScope } from './print.js';

export type ReportSectionPlan = {
  id: string;
  heading: string;
  guidance: string;
  frameIds: (string | null)[];
  minimumCharacters: number;
};

const reserved = ['summary', 'scope-methodology', 'conclusions', 'open-questions'];
export function reportPlanFromFrames(
  frames: readonly { id: string | null; title: string }[],
): ReportSectionPlan[] {
  const used = new Set(reserved);
  const analysisFrames = frames.length ? frames : [{ id: null, title: 'Findings and analysis' }];
  // Reserve the four core sections. A very large board groups its remaining topics rather than silently omitting them.
  const slots = PORT_LIMITS.sections - reserved.length;
  const groups = analysisFrames
    .slice(0, slots)
    .map((frame, i) => (i === slots - 1 ? analysisFrames.slice(i) : [frame]));
  const analysis = groups.map((group): ReportSectionPlan => {
    const title = group.length === 1 ? group[0]!.title : 'Additional findings and analysis';
    const stem =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 38) || 'analysis';
    let id = stem;
    for (let n = 2; used.has(id); n++) id = `${stem}-${n}`;
    used.add(id);
    return {
      id,
      heading: title.slice(0, PORT_LIMITS.heading),
      frameIds: group.map((f) => f.id),
      minimumCharacters: 800,
      guidance: `Analyse ${group.map((f) => `"${f.title}" [${f.id ?? 'open board'}]`).join('; ')}. Explain the finding, supporting evidence, comparison or calculation, business implications, alternatives and qualifications. Use 3-6 substantive paragraphs where evidence permits; explicitly identify evidence gaps rather than padding or inventing findings.`,
    };
  });
  return [
    {
      id: 'summary',
      heading: 'Executive summary',
      frameIds: [],
      minimumCharacters: 600,
      guidance:
        'Give the mandate, principal findings, recommendation and the decision-critical qualifications. Write this as a standalone executive briefing in 2-4 substantive paragraphs.',
    },
    {
      id: 'scope-methodology',
      heading: 'Scope and methodology',
      frameIds: [],
      minimumCharacters: 400,
      guidance:
        'Define the research question, coverage, time basis, source-selection and analysis methods actually used. Distinguish primary evidence, secondary summaries and inference. State what was not independently verified; never claim interviews, audits or procedures that did not occur.',
    },
    ...analysis,
    {
      id: 'conclusions',
      heading: 'Conclusions and recommendations',
      frameIds: [],
      minimumCharacters: 600,
      guidance:
        'Synthesize across the analysis, compare credible alternatives and explain the recommended course, trade-offs, dependencies, next actions and evidence required before commitment. Separate supported conclusions from assumptions and proposals.',
    },
    {
      id: 'open-questions',
      heading: 'Risks, limitations and open questions',
      frameIds: [],
      minimumCharacters: 400,
      guidance:
        'Explain material risks, contradictory findings, uncertainty, missing or dated evidence, how these affect the conclusions, and the specific work needed to resolve them. Acknowledge genuine limits without claiming the report or a regulatory filing is approved or certified.',
    },
  ];
}

export function reportPlan(board: BoardState, scope: PrintScope): ReportSectionPlan[] {
  const frames: { id: string | null; title: string }[] = boardFrames(board)
    .filter((f) => scope === 'all' || scope.includes(f.id))
    .map((f) => ({ id: f.id, title: f.title }));
  if (scope === 'all' && portScopeCards(board, scope).some((c) => c.frameId === null && !c.stackedInto))
    frames.push({ id: null, title: 'Additional findings from the open board' });
  return reportPlanFromFrames(frames);
}

/** Checks breadth, substantive prose, citations to each topic and repeated paragraphs. Never substitutes for source review. */
export function reportProblems(
  doc: PortDoc,
  plan: readonly ReportSectionPlan[],
  board?: BoardState,
): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const required of plan) {
    const section = doc.sections.find((s) => s.id === required.id);
    if (!section) {
      problems.push(`Missing section "${required.id}" (${required.heading}).`);
      continue;
    }
    const paragraphs = section.paragraphs.filter((p) => !p.userAuthored && p.text.trim());
    const text = paragraphs.map((p) => p.text.trim()).join('\n\n');
    if (paragraphs.length < 2 || text.length < required.minimumCharacters)
      problems.push(
        `Develop "${required.id}": at least two substantive cited paragraphs are required (${text.length}/${required.minimumCharacters} characters). Add supported analysis or precise evidence limitations, not padding.`,
      );
    for (const paragraph of paragraphs) {
      const normalized = paragraph.text
        .toLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu, ' ')
        .trim();
      if (normalized.length > 120) {
        const previous = seen.get(normalized);
        if (previous)
          problems.push(
            `Repeated paragraph in "${required.id}" and "${previous}"; synthesize rather than repeat it.`,
          );
        else seen.set(normalized, required.id);
      }
      if (paragraph.cardIds.length === 0 || (board && paragraph.cardIds.some((id) => !board.cards[id])))
        problems.push(
          `A paragraph in "${required.id}" has no current supporting card; repair its citations.`,
        );
    }
    if (board)
      for (const frameId of required.frameIds) {
        const available = Object.values(board.cards).some((c) => c.frameId === frameId && !c.stackedInto);
        const cited = paragraphs.some((p) => p.cardIds.some((id) => board.cards[id]?.frameId === frameId));
        if (available && !cited)
          problems.push(
            `Section "${required.id}" must analyse and cite evidence from ${frameId ?? 'the open board'}.`,
          );
      }
  }
  return [...new Set(problems)];
}
