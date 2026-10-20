/**
 * Deck formats of the research and knowledge templates (P6.15). Each template names its format in `output.deckFormat`;
 * `deckFormatFor` maps the template id to it. Type-only import from deck.ts: deck.ts imports these values.
 */
import type { DeckFormat } from './deck.js';

export const LIT_REVIEW_DECK_FORMAT: DeckFormat = {
  id: 'lit-review',
  label: 'Literature review deck',
  length: 'about 11 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'The topic, "Literature review" and the date range covered.' },
    { id: 'answer', layout: 'bullets', title: 'The answer in brief', brief: 'The answer to the research question, how strong the evidence is and the main gap. Cite the conclusion and rubric cards.' },
    { id: 'question', layout: 'bullets', title: 'Question and scope', brief: 'The question, review type, years, population and inclusion criteria.' },
    { id: 'method', layout: 'visual', title: 'How we searched', brief: 'The databases, the search strings and the counts of papers found and kept.' },
    { id: 'landscape', layout: 'visual', title: 'The field at a glance', brief: 'Papers per year and the leading groups; show the papers chart.' },
    { id: 'themes', layout: 'two-column', title: 'Themes and timeline', brief: 'The main schools of thought and the turning points of the field.' },
    { id: 'findings', layout: 'bullets', title: 'What the evidence says', brief: 'The main claims with the number of papers for and against each.' },
    { id: 'strength', layout: 'visual', title: 'How strong is the evidence', brief: 'Claims by evidence strength and study type; show the charts.' },
    { id: 'quality', layout: 'visual', title: 'Quality and bias', brief: 'The rubric table with each score and its evidence, and the red flags raised.' },
    { id: 'gaps', layout: 'bullets', title: 'Contradictions and gaps', brief: 'Where studies disagree and what nobody has studied.' },
    { id: 'next', layout: 'bullets', title: 'Future research and reading list', brief: 'The studies that would settle the open questions and the three papers to read first.' },
  ],
};

export const POLICY_BRIEF_DECK_FORMAT: DeckFormat = {
  id: 'policy-brief',
  label: 'Policy briefing deck',
  length: 'about 11 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'The policy, the jurisdiction and "Policy briefing".' },
    { id: 'recommendation', layout: 'bullets', title: 'Recommendation', brief: 'The recommended response, the score, the top reasons and the top risks. Cite the decision, rubric and risk cards.' },
    { id: 'snapshot', layout: 'visual', title: 'The policy in brief', brief: 'Type, status, effective date, who is covered, the main obligation and the penalty.' },
    { id: 'provisions', layout: 'two-column', title: 'What the text requires', brief: 'The key provisions with section numbers and quotes, and who must do what.' },
    { id: 'timeline', layout: 'visual', title: 'History and what comes next', brief: 'The timeline of milestones and upcoming dates.' },
    { id: 'stakeholders', layout: 'visual', title: 'Stakeholders and positions', brief: 'The stakeholder map: who supports, who opposes and who decides.' },
    { id: 'impact', layout: 'visual', title: 'Evidence on impact', brief: 'Expected and observed effects, cost against benefit; mark who produced each estimate.' },
    { id: 'comparables', layout: 'visual', title: 'Comparable jurisdictions', brief: 'What similar policies did elsewhere; show the design comparison.' },
    { id: 'compliance', layout: 'bullets', title: 'Compliance and implementation', brief: 'The steps, the deadlines and the enforcement record.' },
    { id: 'legal', layout: 'two-column', title: 'Legal risks and mitigants', brief: 'The red-flag outcomes and the pending cases. State that this is research, not legal advice.' },
    { id: 'scorecard', layout: 'visual', title: 'Scorecard', brief: 'The rubric table with each score and its evidence.' },
    { id: 'next', layout: 'bullets', title: 'Options and next steps', brief: 'The options with their trade-offs, the open questions and the proposed next step.' },
  ],
};

export const TECH_LANDSCAPE_DECK_FORMAT: DeckFormat = {
  id: 'tech-landscape',
  label: 'Technology landscape deck',
  length: 'about 12 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'The technology and "Technology landscape".' },
    { id: 'recommendation', layout: 'bullets', title: 'Recommendation', brief: 'The recommendation, the readiness score, the top reasons and the top risks. Cite the decision, rubric and risk cards.' },
    { id: 'what', layout: 'two-column', title: 'What it is and why now', brief: 'The definition, the problem it solves and why now.' },
    { id: 'market', layout: 'visual', title: 'Market and adoption', brief: 'Market size, growth and production adoption; show the chart.' },
    { id: 'taxonomy', layout: 'visual', title: 'Taxonomy and architecture', brief: 'The reference architecture and the positioning 2x2.' },
    { id: 'players', layout: 'visual', title: 'Players and products', brief: 'The vendors table or map with the leaders called out.' },
    { id: 'oss', layout: 'bullets', title: 'Open source', brief: 'The leading projects, their licences and whether they are alive.' },
    { id: 'benchmarks', layout: 'visual', title: 'Benchmarks', brief: 'The benchmark chart with conditions; independent results marked apart from vendor claims.' },
    { id: 'maturity', layout: 'bullets', title: 'Maturity and standards', brief: 'The maturity stage, the named users and the standards that matter.' },
    { id: 'evaluation', layout: 'visual', title: 'Build, buy or partner', brief: 'The shortlist matrix and the cost model.' },
    { id: 'risks', layout: 'two-column', title: 'Risks and unknowns', brief: 'The red-flag outcomes with mitigants.' },
    { id: 'scorecard', layout: 'visual', title: 'Scorecard', brief: 'The rubric table with each score and its evidence.' },
    { id: 'roadmap', layout: 'bullets', title: 'Roadmap and next steps', brief: 'The staged roadmap, the triggers and the open questions.' },
  ],
};

export const TREND_REPORT_DECK_FORMAT: DeckFormat = {
  id: 'trend-report',
  label: 'Trend report deck',
  length: 'about 11 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'The trend, the horizon and "Trend report".' },
    { id: 'summary', layout: 'bullets', title: 'The trend and the so what', brief: 'The trend in a sentence, how strong it is and the actions. Cite the decision and rubric cards.' },
    { id: 'definition', layout: 'visual', title: 'What it is', brief: 'The definition and the headline numbers.' },
    { id: 'evidence', layout: 'visual', title: 'The evidence', brief: 'The signals over time and by type; hard data marked apart from buzz.' },
    { id: 'drivers', layout: 'two-column', title: 'Drivers and forces', brief: 'What drives it, how strongly and which drivers are fragile.' },
    { id: 'adoption', layout: 'visual', title: 'Adoption and data', brief: 'The main series and the regional split.' },
    { id: 'movers', layout: 'bullets', title: 'Early movers', brief: 'Who is ahead, who failed and the lessons.' },
    { id: 'against', layout: 'two-column', title: 'The case against', brief: 'Counter-trends, skeptics and the red flags raised.' },
    { id: 'scenarios', layout: 'visual', title: 'Scenarios', brief: 'The scenario 2x2 with probabilities and the signals for each.' },
    { id: 'scorecard', layout: 'visual', title: 'Scorecard', brief: 'The rubric table with each score and its evidence.' },
    { id: 'actions', layout: 'bullets', title: 'Implications and actions', brief: 'Who gains and loses, and the actions now, for each scenario.' },
    { id: 'indicators', layout: 'bullets', title: 'Indicators to watch', brief: 'The leading indicators with thresholds and the open questions.' },
  ],
};

export const DEEP_DIVE_DECK_FORMAT: DeckFormat = {
  id: 'deep-dive',
  label: 'Deep dive deck',
  length: 'about 10 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'The topic and "Deep dive".' },
    { id: 'summary', layout: 'bullets', title: 'Where the thesis stands', brief: 'The thesis, the verdict and the confidence in 3 to 5 bullets. Cite the decision and rubric cards.' },
    { id: 'background', layout: 'two-column', title: 'Background and definitions', brief: 'The key terms, the short history and the scale.' },
    { id: 'sources', layout: 'visual', title: 'The sources', brief: 'The best sources by stance and type, and how far each is trusted.' },
    { id: 'for', layout: 'bullets', title: 'The case for', brief: 'The strongest evidence for the thesis.' },
    { id: 'against', layout: 'bullets', title: 'The case against', brief: 'The strongest evidence and arguments against it, stated fairly.' },
    { id: 'perspectives', layout: 'visual', title: 'Perspectives and debates', brief: 'The camps and what divides them.' },
    { id: 'quality', layout: 'visual', title: 'Quality of the evidence', brief: 'The rubric table with each score and its evidence, and the red flags raised.' },
    { id: 'conclusion', layout: 'bullets', title: 'Conclusion', brief: 'The refined thesis with its confidence and what would change it.' },
    { id: 'next', layout: 'bullets', title: 'Open questions and next reads', brief: 'The open questions and the reading list.' },
  ],
};

/** The formats and the template ids that use each (the id of a format is `output.deckFormat` of its template). */
export const RESEARCH_DECK_FORMATS: readonly { format: DeckFormat; templates: readonly string[] }[] = [
  { format: LIT_REVIEW_DECK_FORMAT, templates: ['literature-review'] },
  { format: POLICY_BRIEF_DECK_FORMAT, templates: ['policy-analysis'] },
  { format: TECH_LANDSCAPE_DECK_FORMAT, templates: ['tech-landscape'] },
  { format: TREND_REPORT_DECK_FORMAT, templates: ['trend-report'] },
  { format: DEEP_DIVE_DECK_FORMAT, templates: ['deep-dive'] },
];
