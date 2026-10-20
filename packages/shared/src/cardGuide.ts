/**
 * "When to use which card" (P6.8): one line per card type for the agents' personas. The personas used to carry a
 * paragraph per type, written by hand and different for every role; they are now generated from this table and the
 * roles' placeable types, so a new card type cannot be forgotten (a `Record<CardType, string>` does not compile
 * without it) and every persona stays compact. The text is static: it never changes per turn, so it never breaks the
 * prompt-cache prefix.
 */
import type { AgentName, CardType } from './board.js';
import { PLACEABLE_TYPES } from './agents.js';

/** When to reach for each card type (≤ ~110 characters, plain words, the tool names an agent would call). */
export const WHEN_TO_USE: Readonly<Record<CardType, string>> = Object.freeze({
  note: "the user's own scribble: you never write or change one",
  source: 'a page, paper or report you read: url, title, what it says',
  quote: 'a passage worth keeping word for word, with its url',
  image: 'a figure, screenshot or page capture saved as an asset',
  file: 'a PDF or file saved as an asset',
  question: 'an open issue the research has not answered',
  risk: 'a risk, or a weak claim (say what would make it stronger)',
  design: 'one screen as self-contained HTML (write_design_frame)',
  diagram: 'a flow, structure or timeline as Mermaid source',
  table: 'a few rows of text to compare; many rows or typed columns are a database',
  doc: 'a synthesis no other type can hold; the last resort, never for a page, passage, risk or comparison',
  database: 'many rows or typed columns to filter, group and extend (query_dataset, upsert_rows)',
  chart: 'a trend or comparison drawn: mark, x, y, bound to a database or table card',
  metric: 'one key figure with its period and source',
  timeline: 'dated events, each with a source',
  matrix: 'options scored 0-10 on weighted criteria (the app totals them)',
  insight: 'a conclusion that rests on the research: cite at least two cards by id',
  hypothesis: 'a claim under test: confidence 0-100, evidenceFor and evidenceAgainst card ids',
  decision: 'a choice between options with its rationale and status',
  framework: 'one subject weighed from several sides (proscons, swot or a 2x2 quadrant)',
  entity: 'a person or organisation: role, a few facts, a link',
  product: 'a product or competitor: pricing, strengths, weaknesses',
  video: 'a video or social post: link, author, thumbnail; opens in the browser, never embedded',
  code: 'a snippet, query or config, with its language',
  math: 'a formula in LaTeX',
  checklist: 'things to do or verify: you propose the items, the user ticks them',
  research: 'a Parallel research run (made by deep_research and the bulk tools, never placed by hand)',
  watch: 'a monitored topic (made by watch_topic)',
});

/**
 * The card guide of a role: the types it may place, one line each, plus the rule that a typed card beats prose.
 * `types` narrows the list (default: every type the role may place).
 */
export function cardGuideFor(role: AgentName, types: readonly CardType[] = PLACEABLE_TYPES[role]): string {
  const lines = types.map((t) => `- ${t}: ${WHEN_TO_USE[t]}.`);
  return [
    '## Which card',
    'Never write a prose card when a typed card fits; doc only if none fits. Use detail for 2–5 analytical paragraphs: evidence, implications, alternatives, uncertainty. Body is the summary.',
    ...lines,
  ].join('\n');
}
