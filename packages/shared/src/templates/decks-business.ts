/**
 * The deck formats of the business templates (P6.14): each template names one (`output.deckFormat`) and `deckFormatFor`
 * maps the template id to it. A slide's `brief` says what it must say and which cards it draws on; the Sources slide is
 * added by the exporter, so it is not listed here.
 */
import type { DeckFormat } from '../deck.js';

export const SALES_BRIEF_DECK_FORMAT: DeckFormat = {
  id: 'sales-brief',
  label: 'Pre-call brief deck',
  templates: ['sales-account'],
  length: '9 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'The account, the meeting date and the goal of the call.' },
    {
      id: 'call',
      layout: 'bullets',
      title: 'The call in one slide',
      brief: 'The call (prioritise, nurture, deprioritise), the score, the angle and the one ask. Cite the decision and scorecard cards.',
    },
    {
      id: 'account',
      layout: 'visual',
      title: 'The account',
      brief: 'The snapshot metrics: size, growth, funding or revenue, locations. Cite each metric card.',
    },
    {
      id: 'people',
      layout: 'two-column',
      title: 'Who decides',
      brief: 'The buying committee: role in the deal, priorities, what is confirmed and what is a guess.',
    },
    {
      id: 'why-now',
      layout: 'visual',
      title: 'Why now',
      brief: 'The trigger events on the timeline and what each means for the call.',
    },
    {
      id: 'stack-rivals',
      layout: 'two-column',
      title: 'What they run and who we face',
      brief: 'The current stack, the rivals in the account and how to position against the strongest.',
    },
    {
      id: 'fit',
      layout: 'bullets',
      title: 'Pain, fit and proof',
      brief: 'The hypotheses with evidence, the fit score and the two reference customers to lead with.',
    },
    {
      id: 'risks',
      layout: 'two-column',
      title: 'Risks and objections',
      brief: 'The raised red flags with mitigants and the objections with the best answer for each.',
    },
    {
      id: 'plan',
      layout: 'bullets',
      title: 'Call plan and next step',
      brief: 'The opening, the ranked discovery questions, the ask and the next step.',
    },
  ],
};

export const PARTNERSHIP_DECK_FORMAT: DeckFormat = {
  id: 'partnership-review',
  label: 'Partnership review deck',
  templates: ['partnership'],
  length: '10 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'The partner, the kind of partnership and "Partnership review".' },
    {
      id: 'recommendation',
      layout: 'bullets',
      title: 'Recommendation',
      brief: 'The decision, the score, the top 3 reasons, the top 3 risks and the conditions. Cite the decision, scorecard and risk cards.',
    },
    {
      id: 'partner',
      layout: 'visual',
      title: 'The partner',
      brief: 'Who they are: size, growth, funding, leadership and reach, from the snapshot metrics.',
    },
    {
      id: 'strategic-fit',
      layout: 'two-column',
      title: 'Strategic fit',
      brief: 'What each side wants, what each brings, and the overlap and conflicts.',
    },
    {
      id: 'market-access',
      layout: 'visual',
      title: 'Market access and customers',
      brief: 'The customer overlap and the reach the partner adds; show the overlap chart or table.',
    },
    {
      id: 'integration',
      layout: 'bullets',
      title: 'Product and integration',
      brief: 'What has to be built or connected, the effort and the dependencies; a diagram if there is one.',
    },
    {
      id: 'economics',
      layout: 'visual',
      title: 'Economics',
      brief: 'The deal scenarios, revenue share and the break-even; show the scenario chart or table.',
    },
    {
      id: 'track-record',
      layout: 'bullets',
      title: 'Their partnership track record',
      brief: 'Past partnerships, how they went and what the partner references say.',
    },
    {
      id: 'risks',
      layout: 'two-column',
      title: 'Risks and mitigants',
      brief: 'The red-flag outcomes with a mitigant for each raised flag, and the cleared ones in one line.',
    },
    {
      id: 'scorecard',
      layout: 'visual',
      title: 'Scorecard',
      brief: 'The rubric table with each score and its evidence.',
    },
    {
      id: 'next-steps',
      layout: 'bullets',
      title: 'Terms to negotiate and next steps',
      brief: 'The terms that matter most, the questions for the partner and the proposed next step.',
    },
  ],
};

export const VENDOR_SELECTION_DECK_FORMAT: DeckFormat = {
  id: 'vendor-selection',
  label: 'Vendor selection deck',
  templates: ['vendor-selection'],
  length: '10 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'What is being bought and "Vendor selection".' },
    {
      id: 'recommendation',
      layout: 'bullets',
      title: 'Recommendation',
      brief: 'The chosen vendor (and the runner-up), the score, why, the cost and the conditions. Cite the decision and scorecard cards.',
    },
    {
      id: 'requirements',
      layout: 'bullets',
      title: 'What we need',
      brief: 'The requirements in order of weight, the must-haves and the constraints.',
    },
    {
      id: 'market',
      layout: 'visual',
      title: 'The market',
      brief: 'The longlist by category and how the shortlist was chosen; show the vendor table or chart.',
    },
    {
      id: 'comparison',
      layout: 'visual',
      title: 'Shortlist comparison',
      brief: 'The weighted comparison matrix of the shortlisted vendors.',
    },
    {
      id: 'cost',
      layout: 'visual',
      title: 'Cost and TCO',
      brief: 'Licence, implementation and run cost over three years for each vendor; show the TCO chart.',
    },
    {
      id: 'evidence',
      layout: 'bullets',
      title: 'Reviews and references',
      brief: 'What users and reference customers say; the best and worst quote for each finalist.',
    },
    {
      id: 'security-viability',
      layout: 'two-column',
      title: 'Security, compliance and viability',
      brief: 'Certifications, data handling and the financial health of each finalist.',
    },
    {
      id: 'risks',
      layout: 'two-column',
      title: 'Risks and lock-in',
      brief: 'The raised red flags, the exit plan and the contract terms that reduce the risk.',
    },
    {
      id: 'rollout',
      layout: 'bullets',
      title: 'Negotiation and rollout',
      brief: 'The terms to negotiate, the proof of concept to run and the rollout steps.',
    },
  ],
};

export const MARKET_ENTRY_DECK_FORMAT: DeckFormat = {
  id: 'market-entry',
  label: 'Market entry deck',
  templates: ['market-entry'],
  length: '12 slides (the title slide and the Sources slide are extra)',
  slides: [
    { id: 'title', layout: 'title', title: 'Title', brief: 'The country, the offer and "Market entry".' },
    {
      id: 'recommendation',
      layout: 'bullets',
      title: 'Recommendation',
      brief: 'Go, go later or no-go, the score, the entry mode, the investment and the top risks. Cite the decision and scorecard cards.',
    },
    {
      id: 'country',
      layout: 'visual',
      title: 'The country at a glance',
      brief: 'The country metrics: population, GDP, growth, digital adoption, currency and ease of doing business.',
    },
    {
      id: 'demand',
      layout: 'visual',
      title: 'Market size and demand',
      brief: 'TAM, SAM and SOM with the method, and the growth; show the market chart.',
    },
    {
      id: 'customers',
      layout: 'two-column',
      title: 'Customers and segments',
      brief: 'The segments worth entering first, what they buy today and how they buy.',
    },
    {
      id: 'competition',
      layout: 'visual',
      title: 'Competition',
      brief: 'Local and global competitors, share and pricing; the matrix or the 2x2.',
    },
    {
      id: 'regulation',
      layout: 'bullets',
      title: 'Regulation and compliance',
      brief: 'What must be true to operate: licences, data rules, tax, employment and their lead times.',
    },
    {
      id: 'economics',
      layout: 'visual',
      title: 'Economics',
      brief: 'Pricing, localisation cost, the investment and the break-even; show the cost model chart.',
    },
    {
      id: 'channels',
      layout: 'two-column',
      title: 'Entry modes and channels',
      brief: 'The entry modes compared (pros and cons) and the partners or channels that fit.',
    },
    {
      id: 'risks',
      layout: 'two-column',
      title: 'Risks and mitigants',
      brief: 'The red-flag outcomes with a mitigant for each raised flag.',
    },
    {
      id: 'scorecard',
      layout: 'visual',
      title: 'Scorecard',
      brief: 'The rubric table with each score and its evidence.',
    },
    {
      id: 'roadmap',
      layout: 'bullets',
      title: 'Roadmap and first 90 days',
      brief: 'The milestones for the first 90, 180 and 365 days, the owners and the decisions still open.',
    },
  ],
};

export const BUSINESS_DECK_FORMATS: readonly DeckFormat[] = [
  SALES_BRIEF_DECK_FORMAT,
  PARTNERSHIP_DECK_FORMAT,
  VENDOR_SELECTION_DECK_FORMAT,
  MARKET_ENTRY_DECK_FORMAT,
];
