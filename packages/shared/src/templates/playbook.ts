/**
 * The text a v2 template injects into an agent's FIRST assignment (never its persona): the intake, the depth tier, the
 * frames it owns with their briefs and target mix, its ordered playbook, and for Critic the red-flag checklist, for
 * Orb the rubric and the memo outline. Also the cost guard's tier gate for Parallel tools, and the follow-up chips.
 * Pure; the callers are orb-agents (`persona.ts`) and orb-canvas (`parallelTools.ts`).
 */
import type { AgentName } from '../board.js';
import { AGENT_TOOLS } from '../agents.js';
import {
  DEFAULT_DEPTH,
  depthRank,
  fillTokens,
  type Depth,
  type FollowUp,
  type FrameSpec,
  type IntakeAnswers,
  type PlayStep,
  type TemplateSpecV2,
} from './schema.js';

/** A frame on the board, to map a spec frame to its real id (matched by title). */
export type BoardFrameRef = { id: string; title: string; number?: number };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The steps of `role` that run at `depth`. */
export function stepsFor(spec: TemplateSpecV2, role: AgentName, depth: Depth): PlayStep[] {
  return spec.plan[role].filter((s) => depthRank(s.minTier) <= depthRank(depth));
}

/** "Label: value" lines of the answers that were given (the materials are cards, not answers). */
export function intakeLines(spec: TemplateSpecV2, answers: IntakeAnswers): string[] {
  const out: string[] = [];
  for (const f of spec.inputs) {
    if (f.kind === 'materials' || f.kind === 'depth') continue;
    const v = answers[f.id];
    const text = Array.isArray(v) ? v.join(', ') : (v ?? '');
    if (!text.trim()) continue;
    if (f.kind === 'people' || f.kind === 'longtext') {
      out.push(`- ${f.label}:`);
      out.push(...text.split('\n').map((l) => `    ${l}`));
    } else out.push(`- ${f.label}: ${text}`);
  }
  return out;
}

export function tierLines(spec: TemplateSpecV2, depth: Depth): string[] {
  const t = spec.tiers[depth];
  return [
    `Depth: ${t.label} (${t.time}, ${t.cost}). ${t.summary}`,
    t.deepRuns > 0
      ? `- Deep research: at most ${t.deepRuns} run${t.deepRuns === 1 ? '' : 's'} on this canvas, processors ${t.processors.join(', ')}; ask the user before any run that costs over $${t.askAboveUsd.toFixed(2)}.`
      : '- No Parallel deep research, entity discovery or batch enrichment on this tier: they are refused. Use web_search, fetch_url, parallel_extract and signed-in fetches.',
    t.cardsPerFrame
      ? `- At most ${t.cardsPerFrame} cards per frame in the first pass.`
      : '- No additional first-pass cap for this depth. The live frame capacity still applies: obey FRAME_FULL, use existing datasets and consolidate your own cards; keep each one worth reading.',
    `- Memo: ${t.memo === 'summary' ? 'the summary and the one-page summary only' : 'the full memo and the one-page summary'}.`,
  ];
}

function frameLine(f: FrameSpec, ref: BoardFrameRef | undefined, index: number): string[] {
  const head = ref
    ? `${String(index + 1).padStart(2, '0')} "${f.title}" [${ref.id}]`
    : `${String(index + 1).padStart(2, '0')} "${f.title}"`;
  const targets = f.targets.map((t) => `${t.min}+ ${t.type}${t.note ? ` (${t.note})` : ''}`).join('; ');
  return [
    `- ${head}. Owners: ${f.owners.join(', ')}.`,
    `    Brief: ${f.brief}`,
    ...(targets ? [`    Target mix: ${targets}.`] : []),
  ];
}

/** The frames `role` owns, with brief and targets (every frame for Orb), mapped to the board's frame ids. */
export function frameBriefLines(
  spec: TemplateSpecV2,
  role: AgentName,
  boardFrames: readonly BoardFrameRef[],
  answers: IntakeAnswers,
): string[] {
  const lines: string[] = [];
  spec.frames.forEach((f, i) => {
    if (role !== 'orb' && !f.owners.includes(role)) return;
    const ref = boardFrames.find((b) => same(b.title, f.title));
    lines.push(...frameLine({ ...f, brief: fillTokens(f.brief, answers) }, ref, i));
  });
  return lines;
}

/** Map a step's frame ids to "Title [f_id]" names. */
function stepFrames(spec: TemplateSpecV2, step: PlayStep, boardFrames: readonly BoardFrameRef[]): string {
  const names = step.frames
    .map((id) => spec.frames.find((f) => f.id === id))
    .filter((f): f is FrameSpec => !!f)
    .map((f) => {
      const ref = boardFrames.find((b) => same(b.title, f.title));
      return ref ? `"${f.title}" [${ref.id}]` : `"${f.title}"`;
    });
  return names.length ? ` Frames: ${names.join(', ')}.` : '';
}

export type PlaybookInput = {
  spec: TemplateSpecV2;
  role: AgentName;
  depth?: Depth | undefined;
  answers: IntakeAnswers;
  boardFrames: readonly BoardFrameRef[];
};

/** Also supplied on follow-ups, so existing boards receive current scoring rules after an app update. */
export function scoringGuide(spec: TemplateSpecV2, anchors = false): string {
  if (!spec.rubric.length) return '';
  return [
    'Scoring discipline: apply the supplied dimensions, weights and anchors to the subject. Keep evidence confidence separate; do not silently turn an investment, product or opportunity rubric into an evidence-quality rubric. Missing disclosure does not establish poor performance, no revenue, no runway or an overpriced deal. Leave an unsupported dimension null, explain the missing input and its decision impact in the scorecard detail, and cite the evidence. A qualified assessment can be finished with unassessed dimensions; never invent scores to fill cells or a weighted total when inputs are missing. The optional Your score column belongs to the user.',
    'Reconcile earlier risk and gap cards against later evidence. Revise obsolete absence claims instead of leaving contradictory current assessments.',
    ...(anchors ? spec.rubric.map((d) => `Scoring anchor — ${d.name} (${d.weight}%): 1 = ${d.anchors[1]} 3 = ${d.anchors[3]} 5 = ${d.anchors[5]}`) : []),
  ].join('\n');
}

/** The whole injected block for one agent's first assignment. */
export function playbookText({
  spec,
  role,
  depth = DEFAULT_DEPTH,
  answers,
  boardFrames,
}: PlaybookInput): string {
  const lines: string[] = [`## The ${spec.label} playbook`];
  const intake = intakeLines(spec, answers);
  if (intake.length) lines.push('', 'The intake:', ...intake);
  lines.push('', ...tierLines(spec, depth));
  lines.push(
    '',
    'Completion contract: fill every planned frame with useful, grounded content; populate the existing databases ' +
      'and replace placeholder assessments. A setup, a few sources or a first pass is not a finished board. Research ' +
      'before the final critique and visuals, then synthesize and check coverage. Missing information is local to a ' +
      'field: state assumptions and uncertainty, continue independent work, and explain genuine blockers specifically. ' +
      'If Parallel is unconfigured, use ordinary web_search and fetch_url on every depth tier; do not abandon the playbook.',
  );
  if (spec.id === 'vc-dd')
    lines.push(
      '',
      'Fit the diligence to the business model: use relevant operating metrics and peer definitions. For a restaurant/QSR, examine store count, same-store sales, revenue per store, store economics, gross margin and expansion funding; do not label revenue ARR or invent SaaS retention. Adapt the seed titles and assessments, mark inapplicable metrics explicitly, and explain unavailable private inputs.',
    );
  const briefs = frameBriefLines(spec, role, boardFrames, answers);
  if (briefs.length) lines.push('', role === 'orb' ? 'The frames:' : 'The frames you own:', ...briefs);
  const steps = stepsFor(spec, role, depth);
  lines.push(
    '',
    role === 'orb' ? 'Your playbook, in order:' : 'Your playbook, in this order:',
    ...steps.map(
      (s, i) =>
        `${i + 1}. ${fillTokens(s.text, answers)}${stepFrames(spec, s, boardFrames)}${s.askAboveUsd ? ` Ask the user before spend over $${s.askAboveUsd.toFixed(2)}.` : ''}`,
    ),
  );
  if (role === 'critic' && spec.redFlags.length) {
    lines.push(
      '',
      'The red-flag checklist (clear or raise every one):',
      ...spec.redFlags.map((f) => `- ${f.id} ${f.text} How: ${f.check}`),
    );
  }
  if ((role === 'orb' || role === 'critic') && spec.rubric.length)
    lines.push('', scoringGuide(spec, role === 'critic'));
  if (role === 'orb') {
    if (spec.rubric.length)
      lines.push(
        '',
        'The rubric (score 1 to 5 per dimension, each with at least one cited card; the user may override any score):',
        ...spec.rubric.map(
          (d) => `- ${d.name} (${d.weight}%): 1 = ${d.anchors[1]} 3 = ${d.anchors[3]} 5 = ${d.anchors[5]}`,
        ),
      );
    lines.push(
      '',
      `The memo (${fillTokens(spec.output.memoTitle, answers)}). ${spec.output.citationRule} Sections, in order:`,
      ...spec.output.sections.map(
        (s, i) => `${i + 1}. ${s.title}${s.words ? ` (at most ${s.words} words)` : ''}: ${s.guidance}`,
      ),
      `Then: ${spec.output.appendix}. Also a one-page summary (${spec.output.onePager.includes.join(', ')}). The deck format is ${spec.output.deckFormat}.`,
    );
    if (spec.output.deck)
      lines.push(
        '',
        `The deck (${fillTokens(spec.output.deck.title, answers)}), when the user asks for slides: compose_slides, each slide citing cards. Slides, in order:`,
        ...spec.output.deck.slides.map((s, i) => `${i + 1}. ${s.title}: ${s.brief}`),
      );
    if (spec.monitor)
      lines.push('', `Monitor (only if the user asks): ${fillTokens(spec.monitor.query, answers)}.`);
  }
  if (spec.signedIn.length && role === 'scout') {
    const sites = answers.sites;
    const ticked = Array.isArray(sites) ? sites : [];
    lines.push(
      '',
      ticked.length
        ? `Signed-in sources the user ticked (fetch_signed_in; read-only, only if still connected): ${ticked.join(', ')}.`
        : 'No signed-in sources were ticked: use public search and pages only.',
      ...spec.signedIn.filter((s) => ticked.includes(s.domain)).map((s) => `- ${s.label}: ${s.use}`),
    );
  }
  return lines.join('\n');
}

// ---- the cost guard ----

const GATED = new Set(['deep_research', 'batch_enrich', 'find_entities', 'find_entities_extend']);

/**
 * The depth tier's gate for one Parallel tool call: a message for the agent when the canvas's tier does not allow it
 * (the call is refused before anything is placed or spent), else undefined. Only the costly tools are gated; the cheap
 * ones (`parallel_extract`, `web_answer`...) are listed per tier for the assignment text only.
 */
export function tierGate(
  spec: TemplateSpecV2,
  depth: Depth,
  tool: string,
  args: { processor?: unknown } = {},
): string | undefined {
  if (!GATED.has(tool)) return undefined;
  const t = spec.tiers[depth];
  if (!t.parallelTools.includes(tool))
    return `This canvas is on the ${t.label} depth tier, which does not allow ${tool}. ${
      depth === 'quick'
        ? 'Use web_search, fetch_url and parallel_extract; the user can start a Standard or Deep canvas for deeper research.'
        : 'Ask the user to move to the Deep tier if this is needed.'
    }`;
  if (tool === 'deep_research') {
    const processor = typeof args.processor === 'string' ? args.processor : 'pro';
    if (!t.processors.includes(processor))
      return `The ${t.label} depth tier allows the processors ${t.processors.join(', ')} for deep_research, not ${processor}. Choose one of them${depth === 'standard' ? ', or ask the user to move to the Deep tier for pro and ultra' : ''}.`;
  }
  return undefined;
}

/** Tools of a plan that are not in their role's allow-list (the tests assert this is empty). */
export function planToolViolations(spec: TemplateSpecV2): string[] {
  const out: string[] = [];
  for (const role of ['orb', 'scout', 'critic', 'builder'] as const)
    for (const s of spec.plan[role])
      for (const tool of s.tools) if (!AGENT_TOOLS[role].includes(tool)) out.push(`${role}/${s.id}: ${tool}`);
  return out;
}

/** The follow-up chips with the intake filled in (`[brackets]` stay for the user to complete). */
export function followUpChips(spec: TemplateSpecV2, answers: IntakeAnswers): FollowUp[] {
  return spec.followUps.map((f) => ({ label: f.label, prompt: fillTokens(f.prompt, answers) }));
}
