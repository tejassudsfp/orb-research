/**
 * Deck formats of the investing and finance templates (P6.12). Each template names its deck in `output.deckFormat`;
 * `deckFormatFor` (deck.ts) maps a template id to one of these. The title slide and the Sources slide are extra.
 */
import type { DeckFormat } from './deck.js';

export const EQUITY_IC_DECK_FORMAT: DeckFormat = {
  id: 'equity-ic',
  label: 'Equity research deck',
  length: '12 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'Company name, ticker, and "Equity research".' },
    { id: 'recommendation', layout: 'bullets', title: 'Recommendation', brief: 'The recommendation, the score, the base fair value against the price with its date, the top 3 reasons and the top 3 risks. Cite the decision, rubric and risk cards.' },
    { id: 'snapshot', layout: 'visual', title: 'Snapshot', brief: 'The snapshot metrics with their as-of dates: price, market cap, EV, P/E, EV/EBITDA, yield.' },
    { id: 'business', layout: 'two-column', title: 'Business and segments', brief: 'How it earns, the segment chart and the moat.' },
    { id: 'financials', layout: 'visual', title: 'Financial performance', brief: 'Revenue, margin and free cash flow over time; mark reported against adjusted.' },
    { id: 'quality', layout: 'bullets', title: 'Earnings quality and balance sheet', brief: 'Cash conversion, adjusted against GAAP, leverage and the maturity profile.' },
    { id: 'industry', layout: 'visual', title: 'Industry and peers', brief: 'The peer table or the 2x2, and where the company wins and loses.' },
    { id: 'management', layout: 'bullets', title: 'Management and governance', brief: 'The team, ownership, pay, insider activity and capital allocation.' },
    { id: 'valuation', layout: 'visual', title: 'Valuation', brief: 'The bear, base and bull scenarios against the price, and what the price implies.' },
    { id: 'catalysts-sentiment', layout: 'bullets', title: 'Catalysts and sentiment', brief: 'The dated catalysts, analyst views and short interest, each with its date.' },
    { id: 'risks', layout: 'two-column', title: 'Risks and mitigants', brief: 'The bull and bear case and the red-flag outcomes with mitigants.' },
    { id: 'scorecard', layout: 'visual', title: 'Scorecard', brief: 'The rubric table with each score and its evidence.' },
    { id: 'next-steps', layout: 'bullets', title: 'Questions and monitoring plan', brief: 'The open questions, what to monitor and what would change the call.' },
  ],
};

export const MARKET_MAP_DECK_FORMAT: DeckFormat = {
  id: 'market-map',
  label: 'Market map deck',
  length: '11 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'The market name and "Market map".' },
    { id: 'summary', layout: 'bullets', title: 'What the map shows', brief: 'The recommendation, the top 3 findings and the top 3 caveats. Cite the decision, rubric and caveat cards.' },
    { id: 'scope', layout: 'bullets', title: 'Scope and definition', brief: 'The boundary, the purpose and the headline numbers.' },
    { id: 'taxonomy', layout: 'visual', title: 'Taxonomy', brief: 'The segments as a diagram or table with maturity and size.' },
    { id: 'landscape', layout: 'visual', title: 'The landscape', brief: 'The companies by segment and stage; show the chart.' },
    { id: 'sizing', layout: 'visual', title: 'Market size and growth', brief: 'TAM, SAM and growth with the method; show the build-up chart.' },
    { id: 'capital', layout: 'visual', title: 'Funding and capital flows', brief: 'Funding by year and segment; show the charts.' },
    { id: 'leaders', layout: 'visual', title: 'Leaders and challengers', brief: 'The leaders scorecard or the 2x2 and why the leaders lead.' },
    { id: 'investors', layout: 'bullets', title: 'Investors and acquirers', brief: 'The most active investors and the acquisitions.' },
    { id: 'whitespace', layout: 'two-column', title: 'Trends and white space', brief: 'The shifts and the white-space hypotheses with their evidence.' },
    { id: 'caveats', layout: 'bullets', title: 'Caveats and map quality', brief: 'The map-quality outcomes: what to trust and what not to.' },
    { id: 'next-steps', layout: 'bullets', title: 'So what and next steps', brief: 'Where to play, the companies to approach, and the open questions.' },
  ],
};

export const PORTFOLIO_REVIEW_DECK_FORMAT: DeckFormat = {
  id: 'portfolio-review',
  label: 'Portfolio review deck',
  length: '8 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'The company name and "Portfolio review".' },
    { id: 'status', layout: 'bullets', title: 'Status and call', brief: 'The status call, the health score, what changed, the top 3 reasons and the top 3 risks. Cite the decision, rubric and risk cards.' },
    { id: 'kpis', layout: 'visual', title: 'KPIs against plan', brief: 'The KPI chart or table with plan, actual and variance; mark reported against verified.' },
    { id: 'thesis', layout: 'two-column', title: 'Thesis check', brief: 'The original hypotheses and the evidence for and against, and what changed.' },
    { id: 'signals', layout: 'bullets', title: 'News and signals', brief: 'The notable signals since the last check with their impact.' },
    { id: 'team-customers', layout: 'bullets', title: 'Team, customers and product', brief: 'Joiners and leavers, wins and losses, reviews and releases.' },
    { id: 'competitors', layout: 'visual', title: 'Competitors', brief: 'What rivals did; show the 2x2 or the table.' },
    { id: 'financing', layout: 'visual', title: 'Financing and runway', brief: 'Cash, burn and runway, the last round and the outlook for the next.' },
    { id: 'actions', layout: 'bullets', title: 'Actions and asks', brief: 'The action items with owners and dates, and the asks to the founders.' },
  ],
};

export const MA_SCREEN_DECK_FORMAT: DeckFormat = {
  id: 'ma-screen',
  label: 'M&A screening deck',
  length: '11 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'The acquirer and "M&A target screen".' },
    { id: 'recommendation', layout: 'bullets', title: 'Recommendation', brief: 'The recommendation, the ranked shortlist, the implied price range, the top 3 reasons and the top 3 risks. Cite the decision, rubric and risk cards.' },
    { id: 'mandate', layout: 'bullets', title: 'Mandate and criteria', brief: 'The rationale, the criteria and the deal-breakers.' },
    { id: 'universe', layout: 'visual', title: 'Universe and screen', brief: 'How many were screened and why the rest were dropped; show the screening matrix or the chart.' },
    { id: 'shortlist', layout: 'two-column', title: 'The shortlist', brief: 'One line per shortlisted target: what it does and why it fits.' },
    { id: 'financials', layout: 'visual', title: 'Financial profile', brief: 'Revenue, growth and margins of the shortlist; mark filed, reported and estimated.' },
    { id: 'valuation', layout: 'visual', title: 'Valuation', brief: 'Precedent multiples and the implied EV range against the budget.' },
    { id: 'synergies', layout: 'bullets', title: 'Synergies and integration', brief: 'The synergies with value, evidence and confidence, and the first 100 days.' },
    { id: 'feasibility', layout: 'bullets', title: 'Ownership and feasibility', brief: 'Who owns each target, their likely stance and the regulatory path.' },
    { id: 'risks', layout: 'two-column', title: 'Risks and mitigants', brief: 'The red-flag outcomes per target with mitigants.' },
    { id: 'scorecard', layout: 'visual', title: 'Scorecard', brief: 'The rubric table per target with each score and its evidence.' },
    { id: 'approach', layout: 'bullets', title: 'Approach and next steps', brief: 'The order of approach, the angle for each and the open questions.' },
  ],
};

export const LP_IC_DECK_FORMAT: DeckFormat = {
  id: 'lp-ic',
  label: 'LP investment committee deck',
  length: '12 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'The fund, the manager and "Investment committee".' },
    { id: 'recommendation', layout: 'bullets', title: 'Recommendation', brief: 'The recommendation, the score, the proposed commitment, the top 3 reasons and the top 3 risks. Cite the decision, rubric and risk cards.' },
    { id: 'snapshot', layout: 'visual', title: 'Fund snapshot', brief: 'The snapshot metrics: strategy, vintage, size and last-fund returns with their as-of dates.' },
    { id: 'team', layout: 'bullets', title: 'Firm and team', brief: 'The partners, tenure, carry, succession and key-person risk.' },
    { id: 'strategy', layout: 'two-column', title: 'Strategy and edge', brief: 'The strategy, the edge and consistency across funds; show the process diagram if there is one.' },
    { id: 'track', layout: 'visual', title: 'Track record', brief: 'The fund-by-fund returns; mark every number reported or verified; show the TVPI chart.' },
    { id: 'portfolio', layout: 'visual', title: 'Portfolio and exits', brief: 'Concentration, the top positions and what has been realised.' },
    { id: 'terms', layout: 'bullets', title: 'Terms and economics', brief: 'The terms against the prior fund and the market, and the fee drag.' },
    { id: 'operations', layout: 'bullets', title: 'Operations and references', brief: 'Service providers, compliance and what references say.' },
    { id: 'peers', layout: 'visual', title: 'Peers and benchmarks', brief: 'The peer funds table or the 2x2.' },
    { id: 'risks', layout: 'two-column', title: 'Risks and mitigants', brief: 'The bull and bear case and the red-flag outcomes with mitigants.' },
    { id: 'scorecard', layout: 'visual', title: 'Scorecard', brief: 'The rubric table with each score and its evidence.' },
    { id: 'next-steps', layout: 'bullets', title: 'Open questions and next steps', brief: 'The data requests, references to call and the proposed next step.' },
  ],
};

export const FINANCE_DECK_FORMATS: readonly DeckFormat[] = [
  EQUITY_IC_DECK_FORMAT,
  MARKET_MAP_DECK_FORMAT,
  PORTFOLIO_REVIEW_DECK_FORMAT,
  MA_SCREEN_DECK_FORMAT,
  LP_IC_DECK_FORMAT,
];

/** The deck format id each investing/finance template names. */
export const FINANCE_DECK_BY_TEMPLATE: Readonly<Record<string, string>> = {
  'public-equity': 'equity-ic',
  'market-map': 'market-map',
  'portfolio-monitor': 'portfolio-review',
  'ma-screen': 'ma-screen',
  'fund-dd': 'lp-ic',
  // The v1 "stocks" template was merged into public equity.
  stocks: 'equity-ic',
};
