/**
 * Home templates. v1 (BUILD_PLAN P2.6): a list of frames and a brief. v2 (P6.11, `schema.ts`): a research playbook
 * with an intake form, briefed frames, seeds, databases, an agent plan, a rubric, outputs, depth tiers and follow-ups.
 * Every template is a `Template` for the Home chips; a v2 one carries its whole spec in `spec`.
 */
import type { FrameColor } from '../board.js';
import { LEGACY_TEMPLATES } from './legacy.js';
import { TemplateSpecV2, type Template, type TemplateColumnType, type TemplateId } from './schema.js';
import { VC_DD } from './vc-dd.js';
import { PUBLIC_EQUITY } from './public-equity.js';
import { MARKET_MAP } from './market-map.js';
import { PORTFOLIO_MONITOR } from './portfolio-monitor.js';
import { MA_SCREEN } from './ma-screen.js';
import { FUND_DD } from './fund-dd.js';
import { COMPANY } from './company.js';
import { COMPETITIVE_ANALYSIS } from './competitive-analysis.js';
import { CUSTOMER_DISCOVERY } from './customer-discovery.js';
import { FEATURE_PRD } from './feature-prd.js';
import { FUNDRAISING_PREP } from './fundraising-prep.js';
import { GTM } from './gtm.js';
import { PRICING_RESEARCH } from './pricing-research.js';
import { PRODUCT_TEARDOWN } from './ui.js';
import { SALES_ACCOUNT } from './sales-account.js';
import { PARTNERSHIP } from './partnership.js';
import { VENDOR_SELECTION } from './vendor-selection.js';
import { MARKET_ENTRY } from './market-entry.js';
import { DEEP_DIVE } from './deep-dive.js';
import { LITERATURE_REVIEW } from './literature-review.js';
import { POLICY_ANALYSIS } from './policy-analysis.js';
import { TECH_LANDSCAPE } from './tech-landscape.js';
import { TREND_REPORT } from './trend-report.js';
import { CANDIDATE } from './candidate.js';
import { EVENT_PREP } from './event-prep.js';
import { PERSONAL_DECISION } from './personal-decision.js';
import { TRIP_PLANNING } from './trip-planning.js';
import { INVESTIGATION } from './investigation.js';

export * from './schema.js';
export * from './playbook.js';
export { VC_DD, VC_RUBRIC, VC_RED_FLAGS } from './vc-dd.js';
export { PUBLIC_EQUITY, EQUITY_RUBRIC, EQUITY_RED_FLAGS } from './public-equity.js';
export { MARKET_MAP, MAP_RUBRIC, MAP_CHECKS } from './market-map.js';
export { PORTFOLIO_MONITOR, MONITOR_RUBRIC, MONITOR_FLAGS } from './portfolio-monitor.js';
export { MA_SCREEN, MA_RUBRIC, MA_FLAGS } from './ma-screen.js';
export { FUND_DD, FUND_RUBRIC, FUND_FLAGS } from './fund-dd.js';
export { SALES_ACCOUNT, SALES_RUBRIC, SALES_RED_FLAGS } from './sales-account.js';
export { PARTNERSHIP, PARTNERSHIP_RUBRIC, PARTNERSHIP_RED_FLAGS } from './partnership.js';
export { VENDOR_SELECTION, VENDOR_RUBRIC, VENDOR_RED_FLAGS } from './vendor-selection.js';
export { MARKET_ENTRY, MARKET_ENTRY_RUBRIC, MARKET_ENTRY_RED_FLAGS } from './market-entry.js';
export * from './decks-business.js';
export { DEEP_DIVE, DIVE_RUBRIC, DIVE_RED_FLAGS } from './deep-dive.js';
export { LITERATURE_REVIEW, LIT_RUBRIC, LIT_RED_FLAGS } from './literature-review.js';
export { POLICY_ANALYSIS, POLICY_RUBRIC, POLICY_RED_FLAGS } from './policy-analysis.js';
export { TECH_LANDSCAPE, TECH_RUBRIC, TECH_RED_FLAGS } from './tech-landscape.js';
export { TREND_REPORT, TREND_RUBRIC, TREND_RED_FLAGS } from './trend-report.js';
export { CANDIDATE, CANDIDATE_RUBRIC, CANDIDATE_FLAGS } from './candidate.js';
export { EVENT_PREP, EVENT_RUBRIC, EVENT_FLAGS } from './event-prep.js';
export { PERSONAL_DECISION, DECISION_RUBRIC, DECISION_FLAGS } from './personal-decision.js';
export { TRIP_PLANNING, TRIP_RUBRIC, TRIP_FLAGS } from './trip-planning.js';
export { INVESTIGATION, INVESTIGATION_RUBRIC, INVESTIGATION_FLAGS } from './investigation.js';
export { templateMarkdown } from './markdown.js';

export { COMPANY } from './company.js';
export { COMPETITIVE_ANALYSIS } from './competitive-analysis.js';
export { CUSTOMER_DISCOVERY } from './customer-discovery.js';
export { FEATURE_PRD } from './feature-prd.js';
export { FUNDRAISING_PREP } from './fundraising-prep.js';
export { GTM } from './gtm.js';
export { PRICING_RESEARCH } from './pricing-research.js';
export { PRODUCT_TEARDOWN } from './ui.js';

/** The v2 specs, validated once at load: a template with a bad spec fails the first test that imports it. */
export const TEMPLATE_SPECS: readonly TemplateSpecV2[] = [
  VC_DD,
  // P6.12: investing and finance.
  PUBLIC_EQUITY,
  MARKET_MAP,
  PORTFOLIO_MONITOR,
  MA_SCREEN,
  FUND_DD,
  // P6.13: startup / product.
  COMPETITIVE_ANALYSIS,
  CUSTOMER_DISCOVERY,
  PRODUCT_TEARDOWN,
  PRICING_RESEARCH,
  GTM,
  FEATURE_PRD,
  FUNDRAISING_PREP,
  COMPANY,
  // P6.14: business.
  SALES_ACCOUNT,
  PARTNERSHIP,
  VENDOR_SELECTION,
  MARKET_ENTRY,
  // P6.15: research and knowledge.
  DEEP_DIVE,
  LITERATURE_REVIEW,
  POLICY_ANALYSIS,
  TECH_LANDSCAPE,
  TREND_REPORT,
  // P6.16: people and personal.
  CANDIDATE,
  EVENT_PREP,
  PERSONAL_DECISION,
  TRIP_PLANNING,
  INVESTIGATION,
].map((s) => TemplateSpecV2.parse(s));

const fromSpec = (spec: TemplateSpecV2): Template => ({
  id: spec.id,
  label: spec.label,
  dot: spec.dot,
  placeholder: spec.placeholder,
  brief: spec.brief,
  frames: spec.frames.map((f) => ({ title: f.title, color: f.color })),
  spec,
});

/**
 * Template ids that were merged into another (P6.12: the v1 "Stocks" chip became "Public equity"). A new canvas asked
 * for the old id gets the new template; a canvas that already has the old id keeps opening (`templateOf`).
 */
export const TEMPLATE_ALIASES: Readonly<Partial<Record<TemplateId, TemplateId>>> = { stocks: 'public-equity' };
export const resolveTemplateId = (id: TemplateId): TemplateId => TEMPLATE_ALIASES[id] ?? id;

/** The Home chips, in order (a merged v1 template has no chip of its own). */
export const TEMPLATES: readonly Template[] = [
  ...LEGACY_TEMPLATES.filter((t) => !(t.id in TEMPLATE_ALIASES)),
  ...TEMPLATE_SPECS.map(fromSpec),
];

/** Starting layout of v1 template frames: 3 per row, sized to fit the first view of a 1440×900 window at 100%. */
export const TEMPLATE_LAYOUT = { w: 400, h: 300, gap: 48, columns: 3, originX: 96, originY: 120 } as const;

/** v2 frames are wider (a database card takes four grid columns) and are sized by their seeds (`templatePlan.ts`). */
export const TEMPLATE_LAYOUT_V2 = { w: 624, h: 520, gap: 48, columns: 3, originX: 96, originY: 120 } as const;

export function templateOf(id: TemplateId): Template {
  return (TEMPLATES.find((t) => t.id === id) ?? LEGACY_TEMPLATES.find((t) => t.id === id))!;
}

/** The v2 spec of a template, or undefined for a v1 template. */
export function specOf(id: TemplateId | undefined): TemplateSpecV2 | undefined {
  return id ? TEMPLATE_SPECS.find((s) => s.id === id) : undefined;
}

/**
 * The frames a template prefills, positioned (ids and provenance are minted by the canvas service). v2 frames here
 * are nominal (width and the grid): the canvas service sizes them by their seed cards.
 */
export function templateFrames(
  id: TemplateId,
): { title: string; color: FrameColor; x: number; y: number; w: number; h: number }[] {
  const L = specOf(id) ? TEMPLATE_LAYOUT_V2 : TEMPLATE_LAYOUT;
  const { w, h, gap, columns, originX, originY } = L;
  return templateOf(id).frames.map((f, i) => ({
    title: f.title,
    color: f.color,
    x: originX + (i % columns) * (w + gap),
    y: originY + Math.floor(i / columns) * (h + gap),
    w,
    h,
  }));
}

/** Dataset column type of a template column type (the engine has text, number, date, checkbox, select, url). */
export function columnTypeOf(
  t: TemplateColumnType,
): 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'url' {
  switch (t) {
    case 'currency':
    case 'rating':
      return 'number';
    case 'person':
      return 'text';
    case 'boolean':
      return 'checkbox';
    case 'enum':
      return 'select';
    default:
      return t;
  }
}
